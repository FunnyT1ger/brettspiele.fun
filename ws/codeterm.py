#!/usr/bin/env python3
"""Claude-Code-Webterminal für brettspiele.fun (/code).

Eigenständiger asyncio-Server ohne Fremdpakete, der pro autorisiertem
WebSocket-Client eine Claude-Code-CLI in einem PTY startet und die Rohbytes
durchreicht (Browser-Seite: xterm.js unter /code/).

Sicherheitsmodell:
  - Läuft als eigener, unprivilegierter Unix-User (claudecode) — getrennt vom
    Relay (www-data), kein Zugriff auf Webroot oder Relay-Daten.
  - Autorisierung: Das Session-Cookie des Browsers wird per HTTP an den Relay
    (/api/auth/me) weitergereicht; nur isAdmin oder caps.ai bekommen ein PTY.
    So braucht dieser Prozess keinerlei Lesezugriff auf sessions/users.json.
  - Same-Origin-Schutz: Ist ein Origin-Header vorhanden, muss dessen Host zum
    Host-Header passen (Cross-Site-WebSocket-Hijacking).
  - Limits: max. gleichzeitige Sitzungen + Idle-Timeout (keine Ein-/Ausgabe).
  - Pro Site-User ein eigenes HOME unter USERS_DIR/<username>/ — dadurch hat
    jeder Nutzer seinen EIGENEN Claude-Login (~/.claude bleibt getrennt, im
    Terminal einfach /login ausführen) und ein eigenes Arbeitsverzeichnis.
    Achtung: Unix-seitig läuft alles als derselbe User (claudecode); die
    Trennung ist Komfort/Credential-Isolation, keine harte Sandbox-Grenze.

Protokoll (nach dem WS-Handshake):
  Client → Server (Textframes, JSON):
    {"t":"input","d":"<utf8>"}        Tastatureingabe
    {"t":"resize","cols":C,"rows":R}  Terminalgröße
    {"t":"ping"}                      Keepalive (zählt nicht als Aktivität)
  Server → Client:
    Binärframes                        rohe PTY-Ausgabe
    {"t":"ready"} / {"t":"exit","code":N} / {"t":"denied","reason":"..."}
"""
import asyncio
import base64
import fcntl
import hashlib
import json
import logging
import os
import re
import shlex
import signal
import struct
import termios
import time
import urllib.request
import urllib.error
import uuid
from typing import Dict, Optional
from urllib.parse import urlparse, parse_qs

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_MESSAGE_BYTES = 512 * 1024

BIND = os.environ.get("BRETTSPIELE_CODE_BIND", "127.0.0.1")
PORT = int(os.environ.get("BRETTSPIELE_CODE_PORT", "8788"))
AUTH_URL = os.environ.get("BRETTSPIELE_CODE_AUTH_URL", "http://127.0.0.1:8787/api/me")
# Pro Site-User ein eigenes HOME (eigener Claude-Login + eigenes Workdir).
USERS_DIR = os.environ.get("BRETTSPIELE_CODE_USERS_DIR", os.path.expanduser("~/users"))
# Gemeinsames Startverzeichnis (Testing-Webroot); leer/fehlt → users/<u>/work.
START_DIR = os.environ.get("BRETTSPIELE_CODE_START_DIR", "")
# Live-Webroot: Spiele, die dort existieren, aber nicht registriert sind, sind
# Site-Spiele (nur Admin) — sie können NICHT von Nutzern beansprucht werden.
LIVE_DIR = os.environ.get("BRETTSPIELE_CODE_LIVE_DIR", "/var/www/brettspiele.fun")
CLAUDE_BIN = os.environ.get("BRETTSPIELE_CODE_CLAUDE_BIN", os.path.expanduser("~/.local/bin/claude"))
# Auto-Mode standardmäßig an: Claude Code entscheidet selbst, wann es fragt.
CLAUDE_ARGS = shlex.split(os.environ.get("BRETTSPIELE_CODE_CLAUDE_ARGS", "--permission-mode auto"))
MAX_SESSIONS = int(os.environ.get("BRETTSPIELE_CODE_MAX_SESSIONS", "2"))
IDLE_TIMEOUT = int(os.environ.get("BRETTSPIELE_CODE_IDLE_TIMEOUT", "900"))
# Wie lange eine Sitzung nach Verbindungsverlust WEITERLÄUFT und zum
# Wieder-Andocken bereitsteht, bevor sie aufgeräumt wird (Nutzerwunsch:
# Verbindung verlieren = Sitzung läuft weiter, Rejoin möglich).
DETACHED_GRACE = int(os.environ.get("BRETTSPIELE_CODE_DETACHED_GRACE", "1800"))
# Harte Höchstlaufzeit einer Sitzung (Nutzerwunsch: spätestens nach einem Tag
# automatisch beenden — praktisch greift ohnehin vorher IDLE_TIMEOUT bzw.
# DETACHED_GRACE).
MAX_SESSION_LIFETIME = int(os.environ.get("BRETTSPIELE_CODE_MAX_LIFETIME", str(86400)))
# Rohausgabe, die pro laufender Sitzung fürs Replay beim Wieder-Andocken
# vorgehalten wird (ungefährer Scrollback — bei Überlauf vorne gekürzt).
OUTPUT_BUFFER_MAX = 256 * 1024
# Gespeicherte Claude-Sitzungen (~/.claude/projects/**.jsonl) nach N Tagen löschen.
SESSION_MAX_AGE_DAYS = int(os.environ.get("BRETTSPIELE_CODE_SESSION_MAX_AGE_DAYS", "1"))
# Feste Verwaltungsbefehle (Deploy/Reset) — liegen bewusst außerhalb von PATH
# und werden ausschließlich über das Dropdown im Frontend ausgelöst.
TOOLS_DIR = os.environ.get("BRETTSPIELE_CODE_TOOLS_DIR", "/opt/brettspiele_fun_ws/bin")
# Sandbox: bwrap (bubblewrap) sperrt die PTY-Sitzung in einen eigenen
# Namensraum. Das ist die ERSTE echte Kernel-Grenze in diesem Terminal — alles
# davor (write_scope_settings, authorize_cmd) sind Werkzeug- bzw.
# Protokollgrenzen, die nur greifen, solange das Kindprogramm mitspielt. Eine
# Shell spielt nicht mit, deshalb läuft sie ausschließlich hier drin.
# Geprüft auf dem Host: läuft als claudecode auch unter NoNewPrivileges=yes,
# trotz kernel.apparmor_restrict_unprivileged_userns=1 (Debian liefert ein
# AppArmor-Profil für bwrap mit).
BWRAP_BIN = os.environ.get("BRETTSPIELE_CODE_BWRAP", "/usr/bin/bwrap")
# Auch Claude-Sitzungen einsperren. Abschaltbar, falls die CLI nach einem
# Update etwas braucht, das in der Sandbox fehlt — dann läuft sie wie früher
# nur mit den Werkzeug-Grenzen (write_scope_settings) weiter.
SANDBOX_CLAUDE = os.environ.get("BRETTSPIELE_CODE_SANDBOX_CLAUDE", "true").lower() in ("1", "true", "yes", "on")
SHELL_BIN = os.environ.get("BRETTSPIELE_CODE_SHELL", "/bin/bash")
# Umfang einer Sitzung: ein Spiel (Slug) oder die ganze Testumgebung.
SITE_TARGET = "site"
# Testwerkzeug (rein lesend, liegt im PATH) und der Stop-Hook, der es nach jeder
# Antwort automatisch auf das Spiel der Sitzung anwendet. Leer = keine Automatik.
TEST_BIN = os.environ.get("BRETTSPIELE_CODE_TEST_BIN", "")
TEST_HOOK = os.environ.get("BRETTSPIELE_CODE_TEST_HOOK", "")
TEST_HOOK_TIMEOUT = int(os.environ.get("BRETTSPIELE_CODE_TEST_HOOK_TIMEOUT", "300"))
# „Bald verfügbar"-Schalter: setzt comingSoon in games/<spiel>/game.json der
# Testumgebung. Liegt wie das Testwerkzeug im PATH. Leer = nicht installiert.
SOON_BIN = os.environ.get("BRETTSPIELE_CODE_SOON_BIN", "")
# Datei-Upload ins Arbeitsverzeichnis der Sitzung (Screenshots o.ä. für Claude).
# Landet in einem versteckten Unterordner, den der Deploy ausklammert — hochgeladene
# Dateien gehen also nie live, sind aber für die Sitzung direkt lesbar.
UPLOAD_DIR_NAME = ".uploads"
UPLOAD_MAX_BYTES = int(os.environ.get("BRETTSPIELE_CODE_UPLOAD_MAX", str(12 * 1024 * 1024)))
UPLOAD_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg",
    ".txt", ".md", ".json", ".csv", ".log", ".xml", ".yml", ".yaml", ".pdf",
    # 3D-Material (Nutzerwunsch 2026-08-23): Blender-Quelldateien und die
    # gängigen Exportformate. Die Quelldateien sind reines Arbeitsmaterial —
    # .uploads/ wird nie deployt; ins Spiel gehört ein glTF-/GLB-Export.
    ".blend", ".blend1", ".glb", ".gltf", ".obj", ".mtl", ".fbx", ".stl", ".dae",
}
# Blender-Quelldateien kann auf dem Server kein Werkzeug öffnen (blender ist
# nicht installiert) — dafür gibt es einen eigenen Hinweis im Systemprompt.
BLENDER_EXTS = {".blend", ".blend1"}
# Langzeitgedächtnis je Spiel. Claude Code liest CLAUDE.md aus dem Arbeits-
# verzeichnis beim Start jeder Sitzung automatisch ein; weil das Arbeits-
# verzeichnis der Spielordner IST, bekommt so jedes Spiel sein eigenes,
# dauerhaftes Gedächtnis. Deploy und Zurücksetzen klammern die Datei aus,
# sie bleibt also in der Testumgebung liegen und geht nie live.
GAME_MEMORY_FILE = "CLAUDE.md"

SESSION_ID_RE = re.compile(r"^[0-9a-fA-F-]{8,64}$")
GAME_SLUG_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
UPLOAD_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def build_command(msg: dict):
    """Übersetzt eine Dropdown-Auswahl in ein festes Kommando. Nur die hier
    definierten Aktionen sind möglich — keine freie Terminal-Eingabe."""
    name = str(msg.get("name") or "")
    target = str(msg.get("target") or "all")
    if target != "all" and not GAME_SLUG_RE.match(target):
        return None, None
    deploy = os.path.join(TOOLS_DIR, "brettspiele-deploy")
    reset = os.path.join(TOOLS_DIR, "brettspiele-testing-reset")
    game_arg = [] if target == "all" else [target]
    label = "ganze Site" if target == "all" else f"Spiel „{target}“"
    if name == "deploy-dry":
        return [deploy] + game_arg, f"Deploy-Dry-Run ({label})"
    if name == "deploy":
        return [deploy] + game_arg + ["--yes"], f"Deploy → live ({label})"
    if name == "reset":
        if target == "all":
            return [reset, "--yes"], "Testing vom Live-Stand zurücksetzen"
        if target == "site":
            # Nur gemeinsame Site-Dateien (ohne games/) — z.B. nach Ansible-Deploy.
            return [reset, "site", "--yes"], "Site-Dateien in Testing vom Live-Stand aktualisieren"
        return [reset, target, "--yes"], f"{label} vom Live-Stand zurücksetzen"
    return None, None


def command_in_session_scope(session, msg: dict) -> str:
    """Bindet Deploy/Reset an das Spiel, mit dem die Sitzung geöffnet wurde.

    Zweite, sitzungsbezogene Schranke zusätzlich zu authorize_cmd (das nur die
    Kontorechte prüft): eine Sitzung für Spiel A kann Spiel B nicht anfassen,
    selbst wenn der Nutzer beide besitzt. Site-weite Aktionen („all"/„site")
    bleiben davon unberührt — sie sind über authorize_cmd Admins vorbehalten.
    Rückgabe: Fehlertext oder ""."""
    target = str(msg.get("target") or "all")
    if target in ("all", "site"):
        return ""
    # Eine Seiten-Sitzung umfasst die ganze Testumgebung, also auch jedes
    # einzelne Spiel darin — die Spielbindung unten gilt für sie nicht.
    if session.target == SITE_TARGET:
        return ""
    if not session.target:
        return "Diese Sitzung ist keinem Spiel zugeordnet — bitte das Terminal für ein Spiel öffnen."
    if target != session.target:
        return (f"Diese Sitzung ist auf das Spiel „{session.target}“ begrenzt — "
                f"für „{target}“ bitte ein eigenes Terminal öffnen.")
    return ""


def authorize_cmd(msg: dict, auth: dict):
    """Prüft, ob der Nutzer die Dropdown-Aktion ausführen darf.

    Nutzer dürfen nur ihre eigenen bzw. vom Admin freigegebenen Spiele
    deployen/zurücksetzen; Admins alles. Rückgabe: (fehlertext, claim_slug) —
    claim_slug != None bedeutet: das Spiel ist noch unregistriert und muss vor
    dem Deploy für den Nutzer beansprucht werden (Erstellerschaft merken).
    """
    name = str(msg.get("name") or "")
    target = str(msg.get("target") or "all")
    if auth.get("isAdmin"):
        return None, None
    # Das Seiten-Recht (caps.site) schließt die site-weiten Aktionen ein — ohne
    # sie könnte man die ganze Seite zwar bearbeiten, aber nichts davon
    # veröffentlichen. Wer es hat, ist bewusst mit Admin-Wirkung ausgestattet.
    if auth.get("canSite"):
        return None, None
    if target == "all":
        return "Nur Admins dürfen die ganze Site deployen/zurücksetzen.", None
    if name == "reset" and target == "site":
        # Site-Dateien aktualisieren (ohne games/) ist für alle Terminal-Nutzer
        # erlaubt — es berührt keine Spiel-Arbeitsstände anderer.
        return None, None
    if target == "site":
        # "site" ist als Reset-Schlüsselwort reserviert — kein Spielname.
        return "„site“ ist ein reservierter Name und kein Spiel.", None
    mine = set(auth.get("projects") or [])
    if target in mine:
        return None, None
    taken = set(auth.get("projectsOther") or [])
    if target in taken:
        return f"Kein Zugriff auf „{target}“ — das Spiel gehört einem anderen Nutzer (Freigabe beim Admin anfragen).", None
    if live_game_exists(target):
        # Live, aber unregistriert = Site-Spiel (z. B. die bestehenden Spiele).
        return f"Kein Zugriff auf „{target}“ — Site-Spiel (nur Admins; Freigabe beim Admin anfragen).", None
    # Unregistriertes (neues) Spiel: Dry-Run frei, beim echten Deploy wird es
    # dem Nutzer zugeordnet (Erstellerschaft → Community-Spiel im Katalog).
    if name == "deploy-dry":
        return None, None
    if name == "deploy":
        return None, target
    return f"„{target}“ ist noch keinem Nutzer zugeordnet — erst deployen (dabei wird es dir zugeordnet).", None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("brettspiele-code")

# Laufende PTY-Sitzungen, entkoppelt von der WebSocket-Verbindung: Schlüssel =
# zufällige attach-ID. Verliert der Client die Verbindung, läuft die Sitzung
# hier weiter; ein neuer WS-Client kann per ?attach=<id> wieder andocken.
live_sessions: Dict[str, "LiveSession"] = {}


# --------------------------------------------------------------------------
# Minimaler HTTP-/WebSocket-Unterbau (gleiche Machart wie relay.py).
# --------------------------------------------------------------------------

async def read_http_headers(reader: asyncio.StreamReader) -> Dict[str, str]:
    raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
    lines = raw.decode("latin-1").split("\r\n")
    headers: Dict[str, str] = {":request": lines[0]}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return headers


async def send_http(writer: asyncio.StreamWriter, status: int, text: str):
    reasons = {200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
               404: "Not Found", 413: "Payload Too Large", 500: "Internal Server Error",
               503: "Service Unavailable"}
    body = text.encode("utf-8")
    head = (
        f"HTTP/1.1 {status} {reasons.get(status, 'Error')}\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Connection: close\r\n\r\n"
    )
    writer.write(head.encode("ascii") + body)
    await writer.drain()


async def accept_websocket(writer: asyncio.StreamWriter, headers: Dict[str, str]) -> bool:
    key = headers.get("sec-websocket-key")
    if not key or headers.get("upgrade", "").lower() != "websocket":
        await send_http(writer, 400, '{"ok":false,"error":"bad_request"}')
        return False
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    writer.write((
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
    ).encode("ascii"))
    await writer.drain()
    return True


async def read_frame(reader: asyncio.StreamReader):
    head = await reader.readexactly(2)
    b1, b2 = head[0], head[1]
    opcode = b1 & 0x0F
    masked = bool(b2 & 0x80)
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", await reader.readexactly(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", await reader.readexactly(8))[0]
    if length > MAX_MESSAGE_BYTES:
        raise ValueError(f"message too large: {length}")
    mask = await reader.readexactly(4) if masked else b""
    payload = await reader.readexactly(length) if length else b""
    if masked:
        payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
    return opcode, payload


def encode_frame(opcode: int, payload: bytes = b"") -> bytes:
    length = len(payload)
    if length < 126:
        header = bytes([0x80 | opcode, length])
    elif length < (1 << 16):
        header = bytes([0x80 | opcode, 126]) + struct.pack("!H", length)
    else:
        header = bytes([0x80 | opcode, 127]) + struct.pack("!Q", length)
    return header + payload


# --------------------------------------------------------------------------
# Autorisierung über den Relay (Session-Cookie → /api/auth/me).
# --------------------------------------------------------------------------

def check_auth_blocking(cookie: str) -> dict:
    req = urllib.request.Request(AUTH_URL, headers={"Cookie": cookie, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    user = data.get("user") or {}
    caps = user.get("caps") or {}
    # PTY bekommt, wer Admin ist ODER ein vergebenes Recht hat: KI-Erstellung
    # (caps.ai) oder Ersteller (caps.creator). Der Zugriff bleibt trotzdem auf
    # die eigenen/freigegebenen Spieleordner beschränkt (Symlink-Arbeitsbereich
    # + authorize_cmd prüft Deploy-Rechte frisch).
    allowed = bool(data.get("authenticated")) and (
        bool(user.get("isAdmin")) or bool(caps.get("ai")) or bool(caps.get("creator"))
    )
    # 2FA-Pflicht für Terminal-Nutzer: ohne hinterlegte 2FA kein PTY.
    reason = ""
    if allowed and user.get("twofaRequired"):
        allowed = False
        reason = "twofa_required"
    return {
        "allowed": allowed,
        "username": user.get("username", ""),
        "reason": reason,
        "isAdmin": bool(user.get("isAdmin")),
        # Seiten-Recht: ganze Testumgebung bearbeiten + site-weit deployen.
        "canSite": bool(user.get("isAdmin")) or bool(caps.get("site")),
        # Vom Relay gepflegt: eigene + freigegebene Spiele bzw. fremd vergebene.
        "projects": list(user.get("projects") or []),
        "projectsOther": list(user.get("projectsOther") or []),
    }


def claim_project_blocking(cookie: str, slug: str) -> dict:
    """Registriert ein bisher unbeanspruchtes Spiel für den Nutzer (Relay prüft
    Session-Cookie + Rechte selbst). Wird vor dem ersten echten Deploy gerufen."""
    url = AUTH_URL.rsplit("/api/", 1)[0] + "/api/projects/claim"
    payload = json.dumps({"slug": slug}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST", headers={
        "Cookie": cookie, "Content-Type": "application/json", "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read().decode("utf-8"))
        except Exception:
            return {"ok": False, "error": f"http_{exc.code}"}
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError) as exc:
        return {"ok": False, "error": str(exc)}


def accept_project_terms_blocking(cookie: str, slug: str) -> dict:
    """Rechte-Zusicherung fürs Spiel beim Relay festhalten (Cookie-Auth, das
    Relay prüft die Rechte selbst). Läuft vor jedem echten Deploy."""
    url = AUTH_URL.rsplit("/api/", 1)[0] + "/api/projects/accept-terms"
    payload = json.dumps({"slug": slug, "terms": True}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST", headers={
        "Cookie": cookie, "Content-Type": "application/json", "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read().decode("utf-8"))
        except Exception:
            return {"ok": False, "error": f"http_{exc.code}"}
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError) as exc:
        return {"ok": False, "error": str(exc)}


def list_testing_games() -> list:
    """Vorhandene Spiel-Verzeichnisse in der Testumgebung (dynamisch — neue
    Spiele erscheinen damit automatisch in den Deploy-/Reset-Dropdowns)."""
    games_dir = os.path.join(START_DIR, "games") if START_DIR else ""
    try:
        entries = os.scandir(games_dir)
    except OSError:
        return []
    out = []
    for e in entries:
        if e.is_dir(follow_symlinks=False) and GAME_SLUG_RE.match(e.name):
            out.append(e.name)
    return sorted(out)


def live_game_exists(slug: str) -> bool:
    return bool(GAME_SLUG_RE.match(slug)) and os.path.isdir(os.path.join(LIVE_DIR, "games", slug))


def games_for_user(auth: dict) -> list:
    """Spielliste fürs Dropdown, gefiltert nach Rechten: Admins sehen alles,
    Nutzer nur eigene/freigegebene + noch unbeanspruchte (neue) Spiele."""
    mine = set(auth.get("projects") or [])
    taken = set(auth.get("projectsOther") or [])
    out = []
    for slug in list_testing_games():
        if slug in mine:
            status = "mine"
        elif slug in taken:
            status = "other"          # gehört einem anderen Nutzer
        elif live_game_exists(slug):
            status = "official"       # live, aber unregistriert → Site-Spiel
        else:
            status = "unclaimed"      # neu in Testing → beim Deploy zuordenbar
        if auth.get("isAdmin") or status in ("mine", "unclaimed"):
            out.append({"id": slug, "status": status})
    return out


async def check_auth(headers: Dict[str, str]) -> dict:
    cookie = headers.get("cookie", "")
    if not cookie:
        return {"allowed": False, "username": "", "reason": ""}
    try:
        return await asyncio.get_running_loop().run_in_executor(None, check_auth_blocking, cookie)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError) as exc:
        log.warning("auth check failed: %s", exc)
        return {"allowed": False, "username": "", "reason": ""}


def same_origin(headers: Dict[str, str]) -> bool:
    origin = headers.get("origin", "")
    if not origin:
        return True  # Nicht-Browser-Clients senden keinen Origin; Auth greift trotzdem.
    host = (headers.get("host") or "").split(":")[0].lower()
    origin_host = (urlparse(origin).hostname or "").lower()
    return bool(host) and origin_host == host


# --------------------------------------------------------------------------
# PTY-Sitzung
# --------------------------------------------------------------------------

def _child_preexec():
    """Im Kind: eigene Session + das PTY (fd 0) als Controlling TTY, damit
    Ctrl+C/Jobcontrol im Terminal normal funktionieren."""
    os.setsid()
    fcntl.ioctl(0, termios.TIOCSCTTY, 0)


def set_winsize(fd: int, cols: int, rows: int):
    cols = max(20, min(500, int(cols)))
    rows = max(5, min(300, int(rows)))
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


# --------------------------------------------------------------------------
# Gespeicherte Claude-Sitzungen (fürs Wieder-Öffnen per Dropdown + Aufräumen)
# --------------------------------------------------------------------------

def user_home_for(username: str) -> str:
    return os.path.join(USERS_DIR, safe_username(username))


def session_title(path: str) -> str:
    """Kurztitel aus der Session-Datei: bevorzugt der Claude-Summary-Eintrag,
    sonst die erste echte Nutzernachricht. Liest höchstens die ersten Zeilen."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            fallback = ""
            for _ in range(200):
                line = fh.readline(64 * 1024)
                if not line:
                    break
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if rec.get("type") == "summary" and rec.get("summary"):
                    return " ".join(str(rec["summary"]).split())[:80]
                if not fallback and rec.get("type") == "user":
                    content = (rec.get("message") or {}).get("content")
                    if isinstance(content, list):
                        for blk in content:
                            if isinstance(blk, dict) and blk.get("type") == "text" and blk.get("text"):
                                content = blk["text"]
                                break
                    if isinstance(content, str):
                        text = " ".join(content.split())
                        # Meta-/Kommando-Einträge (<command-name> …) überspringen
                        if text and not text.startswith("<"):
                            fallback = text[:80]
            return fallback
    except OSError:
        return ""


def iter_session_files(user_home: str):
    projects = os.path.join(user_home, ".claude", "projects")
    try:
        proj_dirs = [d for d in os.scandir(projects) if d.is_dir()]
    except OSError:
        return
    for d in proj_dirs:
        try:
            entries = list(os.scandir(d.path))
        except OSError:
            continue
        for f in entries:
            if f.is_file() and f.name.endswith(".jsonl") and SESSION_ID_RE.match(f.name[:-6]):
                yield f


def list_sessions(user_home: str, limit: int = 20) -> list:
    out = []
    for f in iter_session_files(user_home):
        try:
            st = f.stat()
        except OSError:
            continue
        if st.st_size == 0:
            continue
        out.append({"id": f.name[:-6], "mtime": int(st.st_mtime), "title": session_title(f.path)})
    out.sort(key=lambda s: -s["mtime"])
    return out[:limit]


def find_session_file(user_home: str, session_id: str) -> bool:
    if not SESSION_ID_RE.match(session_id or ""):
        return False
    return any(f.name[:-6] == session_id for f in iter_session_files(user_home))


def session_cwd(user_home: str, session_id: str) -> str:
    """Liest das Arbeitsverzeichnis, in dem eine gespeicherte Sitzung lief
    (Claude schreibt `cwd` in seine JSONL-Records). Nötig, damit
    `claude --resume` die Sitzung wiederfindet: der Projektordner ergibt sich
    aus dem cwd — startet man claude woanders, ist die Sitzung „nicht gefunden".
    """
    if not SESSION_ID_RE.match(session_id or ""):
        return ""
    for f in iter_session_files(user_home):
        if f.name[:-6] != session_id:
            continue
        try:
            with open(f.path, "r", encoding="utf-8", errors="replace") as fh:
                for _ in range(50):
                    line = fh.readline(64 * 1024)
                    if not line:
                        break
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    cwd = rec.get("cwd")
                    if isinstance(cwd, str) and cwd:
                        return cwd
        except OSError:
            return ""
        return ""
    return ""


def cwd_within_allowed(cwd: str, user_home: str) -> bool:
    """Nur Verzeichnisse innerhalb der Testumgebung oder des eigenen HOME als
    Resume-cwd zulassen (defensiv, obwohl der Pfad aus der eigenen Sitzung stammt)."""
    if not cwd:
        return False
    rp = os.path.realpath(cwd)
    roots = []
    if START_DIR:
        roots.append(os.path.realpath(START_DIR))
    roots.append(os.path.realpath(user_home))
    return any(rp == r or rp.startswith(r + os.sep) for r in roots)


def slug_from_cwd(cwd: str) -> str:
    """Spiel-Slug ableiten, wenn cwd ein Spielordner der Testumgebung ist
    (für die Deploy-Buttons beim Fortsetzen einer Sitzung)."""
    games_root = os.path.realpath(os.path.join(START_DIR, "games")) if START_DIR else ""
    if not games_root:
        return ""
    rp = os.path.realpath(cwd)
    if rp.startswith(games_root + os.sep):
        slug = rp[len(games_root) + 1:].split(os.sep)[0]
        return slug if GAME_SLUG_RE.match(slug) else ""
    return ""


async def cleanup_sessions_loop():
    """Löscht gespeicherte Sitzungen, die älter als SESSION_MAX_AGE_DAYS sind
    (Nutzerwunsch: nach einem Monat weg). Läuft alle 6 Stunden."""
    while True:
        try:
            cutoff = time.time() - SESSION_MAX_AGE_DAYS * 86400
            removed = 0
            try:
                user_dirs = [d for d in os.scandir(USERS_DIR) if d.is_dir()]
            except OSError:
                user_dirs = []
            for user_dir in user_dirs:
                for f in list(iter_session_files(user_dir.path) or []):
                    try:
                        if f.stat().st_mtime < cutoff:
                            os.unlink(f.path)
                            removed += 1
                    except OSError:
                        continue
                # leere Projektverzeichnisse gleich mit entsorgen
                projects = os.path.join(user_dir.path, ".claude", "projects")
                try:
                    for d in os.scandir(projects):
                        if d.is_dir() and not os.listdir(d.path):
                            os.rmdir(d.path)
                except OSError:
                    pass
            if removed:
                log.info("session cleanup: %d Datei(en) älter als %d Tage gelöscht", removed, SESSION_MAX_AGE_DAYS)
        except Exception as exc:
            log.warning("session cleanup error: %s", exc)
        await asyncio.sleep(6 * 3600)


def safe_username(username: str) -> str:
    """Benutzername → sicherer Verzeichnisname. Der Relay erlaubt ohnehin nur
    [a-zA-Z0-9_.-]{3,32}, hier trotzdem defensiv filtern."""
    cleaned = "".join(ch for ch in str(username or "").lower() if ch.isalnum() or ch in ("-", "_", "."))
    cleaned = cleaned.strip(".")
    return cleaned[:32]


_STARTER_HTML = """<!doctype html>
<html lang="de" data-game="__SLUG__">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>__TITLE__ – brettspiele.fun</title>
  <meta name="description" content="__TITLE__ auf brettspiele.fun">
  <link rel="icon" href="./button.svg" type="image/svg+xml">
  <script>try{var m=localStorage.getItem('brettspiele.themeMode')||'auto';var d=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=m==='auto'?(d?'dark':'light'):m;}catch(e){document.documentElement.dataset.theme='dark';}</script>
  <!-- Gemeinsame Bausteine der Seite. Bitte stehen lassen: sie liefern
       Kopfzeile mit Zurück-Knopf, Sprachwahl, Hell/Dunkel, Anmeldung,
       Einwilligung, Controller-Bedienung und Klänge — alles, was ein Spiel
       hier haben soll, ohne dass du es selbst baust. -->
  <link rel="stylesheet" href="../../assets/game-chrome.css">
  <link rel="stylesheet" href="./styles.css">
  <script src="../../assets/runtime-config.js"></script>
  <script src="../../assets/auth.js"></script>
  <script src="../../assets/consent.js"></script>
  <script src="../../assets/game-chrome.js"></script>
  <script src="../../assets/gamepad.js"></script>
  <script src="../../assets/sounds/sound.js"></script>
  <!-- GameKit: Raum, Spielerliste, Namen, HOST-WEITERGABE, Spielstand.
       Siehe assets/gamekit.js — bau das nicht selbst nach. -->
  <script src="../../assets/gamekit.js"></script>
</head>
<body>
  <div class="app">
    <header class="top">
      <div class="brand"><div class="logo">🎲</div>
        <div><h1>__TITLE__</h1><div class="subtitle">Neues Spiel – hier entsteht etwas.</div></div>
      </div>
      <div class="game-top-actions">
        <select class="game-language-select" data-language-select aria-label="Sprache"></select>
        <button class="game-theme-toggle" id="themeToggle" type="button">Theme</button>
      </div>
    </header>

    <main class="board">
      <section class="panel">
        <h2>Runde</h2>
        <p class="hint">Raumcode <strong id="roomOut">—</strong> · <span id="connOut">verbinde …</span></p>
        <div class="row">
          <label for="nameInput">Dein Name</label>
          <input id="nameInput" maxlength="24" autocomplete="nickname">
        </div>
        <div class="row">
          <button id="copyInvite" type="button">🔗 Einladungslink kopieren</button>
        </div>
        <h3>Mitspieler</h3>
        <ul id="players" class="players"></ul>
        <p class="hint" id="hostOut"></p>
      </section>

      <section class="panel">
        <h2>Spielfeld</h2>
        <!-- Hier entsteht dein Spiel. Der geteilte Zustand liegt in kit.state;
             ändern darf ihn der Host über kit.setState(...), alle anderen
             schicken Züge mit kit.send({...}). -->
        <p id="stage" class="stage">Noch nichts gebaut.</p>
        <button id="demoBtn" type="button">Beispiel: Zähler erhöhen</button>
      </section>
    </main>
  </div>
  <script src="./game.js"></script>
</body>
</html>
"""


_STARTER_CSS = """/* Grundgerüst für __TITLE__. game-chrome.css bringt Kopfzeile, Sprachwahl
   und Theme-Umschalter mit; hier steht nur, was diesem Spiel gehört. */
:root { --bg:#0d1117; --panel:#161b22; --line:#30363d; --text:#e6edf3; --muted:#8b949e; --accent:#7ee787; }
:root[data-theme="light"] { --bg:#f4f6fa; --panel:#ffffff; --line:rgba(0,0,0,.12); --text:#141a24; --muted:#5a6675; --accent:#1e9e5a; }
body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
.app { max-width:1000px; margin:0 auto; padding:16px; }
.top { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
.brand { display:flex; align-items:center; gap:12px; }
.logo { font-size:32px; }
h1 { margin:0; font-size:clamp(20px,4vw,30px); }
.subtitle { color:var(--muted); font-size:13px; }
.board { display:grid; grid-template-columns:minmax(240px,320px) 1fr; gap:16px; align-items:start; }
@media (max-width:760px) { .board { grid-template-columns:1fr; } }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; }
.panel h2 { margin:0 0 10px; font-size:16px; }
.panel h3 { margin:16px 0 6px; font-size:14px; }
.hint { color:var(--muted); font-size:13px; line-height:1.5; }
.row { display:flex; gap:8px; align-items:center; margin:10px 0; flex-wrap:wrap; }
.row label { font-size:13px; color:var(--muted); }
input, button { font:inherit; color:inherit; background:var(--bg); border:1px solid var(--line);
  border-radius:8px; padding:8px 10px; }
button { cursor:pointer; }
button:hover { border-color:var(--accent); }
.players { list-style:none; margin:0; padding:0; }
.players li { display:flex; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--line); font-size:14px; }
.players li:last-child { border-bottom:0; }
.players .tag { color:var(--muted); font-size:12px; }
.stage { font-size:clamp(20px,5vw,40px); margin:0 0 12px; }
"""


_STARTER_JS = """/* __TITLE__ — Startgerüst.
 *
 * Die Grundfunktionen kommen aus assets/gamekit.js und sind hier schon
 * verdrahtet: Raum, Einladungslink, Spielername (aus dem Konto, sonst
 * gemerkt), Anwesenheitsliste, HOST-WEITERGABE und der geteilte Spielstand.
 * Bau das bitte nicht nach — erweitere es.
 *
 * Die zwei Regeln, an denen sich alles Weitere aufhängt:
 *   1. Den Spielstand ändert NUR der Host, über kit.setState(...).
 *   2. Alle anderen schicken Absichten mit kit.send({...}); der Host wertet sie
 *      in onOp aus und ruft dann kit.setState(...). So gibt es genau eine
 *      Wahrheit, und die Host-Weitergabe funktioniert von allein weiter.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var kit = GameKit.start({
    game: "__SLUG__",
    initialState: { zaehler: 0 },

    // Anwesenheitsliste hat sich geändert (jemand kam, ging oder wurde Host).
    onPlayers: function (list) {
      $("players").innerHTML = list.map(function (p) {
        var tags = [];
        if (p.host) tags.push("Host");
        if (p.me) tags.push("du");
        return "<li><span>" + escapeHtml(p.name) + "</span><span class='tag'>" + tags.join(" · ") + "</span></li>";
      }).join("");
      $("hostOut").textContent = kit.host
        ? "Du bist Gastgeber dieser Runde."
        : "Die Runde wird von jemand anderem geführt.";
    },

    // Geteilter Spielstand — egal ob selbst gesetzt, vom Host empfangen oder
    // beim Beitreten vom Server wiederhergestellt.
    onState: function (state) { render(state); },

    // Ein Mitspieler möchte etwas tun. Nur der Host entscheidet.
    onOp: function (op) {
      if (!kit.host) return;
      if (op && op.t === "hoch") {
        kit.setState({ zaehler: (kit.state.zaehler || 0) + 1 });
      }
    },

    onHost: function (info) {
      if (info.takeover) {
        // Der bisherige Gastgeber ist weg — diese Seite hat übernommen.
        note("Der Gastgeber hat die Runde verlassen. Du führst sie jetzt weiter.");
      }
    },

    onConnection: function (c) {
      $("connOut").textContent = c.connected ? "verbunden" : "Verbindung verloren – versuche es erneut …";
    }
  });

  function render(state) { $("stage").textContent = String((state && state.zaehler) || 0); }
  function note(text) { $("hostOut").textContent = text; }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c];
    });
  }

  $("roomOut").textContent = kit.room;
  $("nameInput").value = kit.me.name;
  $("nameInput").addEventListener("change", function () { kit.setName(this.value); });
  $("copyInvite").addEventListener("click", function () {
    var link = kit.inviteLink();
    navigator.clipboard.writeText(link).then(
      function () { note("Einladungslink kopiert."); },
      function () { note("Einladungslink: " + link); }
    );
  });
  // Auch der Host geht über send(): so läuft der Zug immer denselben Weg,
  // egal wer ihn auslöst — und der Code bleibt nach einer Host-Weitergabe gültig.
  $("demoBtn").addEventListener("click", function () {
    if (kit.host) kit.setState({ zaehler: (kit.state.zaehler || 0) + 1 });
    else kit.send({ t: "hoch" });
  });

  render(kit.state);
})();
"""


def slug_from_name(name: str) -> str:
    """Spielname → sicherer Slug (Kleinbuchstaben/Ziffern/-)."""
    s = re.sub(r"[^a-z0-9]+", "-", str(name or "").strip().lower()).strip("-")[:40].strip("-")
    return s if s and GAME_SLUG_RE.match(s) else ""


def scaffold_new_game(gdir: str, slug: str, title: str) -> None:
    """Neues Spielverzeichnis mit einem LAUFFÄHIGEN Startspiel anlegen.

    Bewusst kein leeres Blatt: die Grundfunktionen, die jedes Mehrspieler-Spiel
    hier braucht — Raum und Einladungslink, Spielername aus dem Konto,
    Anwesenheitsliste, Host-Weitergabe, geteilter Spielstand, Kopfzeile mit
    Sprachwahl/Theme/Zurück-Knopf, Klänge und Controller-Bedienung — sind schon
    verdrahtet. Vorher hat jedes Spiel das neu erfunden, mit dem Ergebnis, dass
    es NIRGENDS eine Host-Weitergabe gab: verließ der Gastgeber die Runde, stand
    sie. Das steckt jetzt in assets/gamekit.js und kommt automatisch mit.

    Bestehende Dateien werden nie überschrieben — die Funktion läuft auch für
    Verzeichnisse, die es schon gibt.
    """
    os.makedirs(gdir, exist_ok=True)
    safe = (title.replace("&", "&amp;").replace("<", "&lt;")
                 .replace(">", "&gt;").replace('"', "&quot;")[:80] or slug)
    for name, tpl in (("index.html", _STARTER_HTML), ("styles.css", _STARTER_CSS), ("game.js", _STARTER_JS)):
        path = os.path.join(gdir, name)
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(tpl.replace("__TITLE__", safe).replace("__SLUG__", slug))
    btn = os.path.join(gdir, "button.svg")
    if not os.path.exists(btn):
        # Platzhalter-Kachel, damit der Katalog nicht auf eine fehlende Datei zeigt.
        with open(btn, "w", encoding="utf-8") as fh:
            fh.write(_STARTER_SVG.replace("__TITLE__", safe))
    gj = os.path.join(gdir, "game.json")
    if not os.path.exists(gj):
        with open(gj, "w", encoding="utf-8") as fh:
            json.dump({"title": title[:60] or slug, "description": "", "category": "Community",
                       "image": f"games/{slug}/button.svg", "order": 999},
                      fh, ensure_ascii=False, indent=2)


_STARTER_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800" role="img" aria-label="__TITLE__">
  <rect width="640" height="800" rx="48" fill="#161b22"/>
  <circle cx="320" cy="330" r="150" fill="#21262d" stroke="#30363d" stroke-width="6"/>
  <text x="320" y="380" text-anchor="middle" font-size="150">🎲</text>
  <text x="320" y="700" text-anchor="middle" font-family="system-ui, sans-serif"
        font-size="46" font-weight="800" fill="#e6edf3">__TITLE__</text>
</svg>
"""


_MEMORY_TEMPLATE = """# Gedächtnis: __TITLE__

Diese Datei ist das Langzeitgedächtnis für das Spiel `__SLUG__` auf brettspiele.fun.
Claude Code liest sie zu Beginn **jeder** Terminal-Sitzung automatisch ein — sie ist
das Einzige, was von einer Sitzung zur nächsten übrig bleibt. Sie wird nie mit
deployt und übersteht Deploy wie Zurücksetzen.

Bitte am Ende einer Aufgabe knapp nachtragen, was die nächste Sitzung wissen muss.
Kurze Stichpunkte, keine Romane; Überholtes löschen statt anhäufen.

Angelegt am __DATE__.

## Worum geht es?
<!-- Spielidee in ein paar Sätzen: Regeln, Spielerzahl, Zielgruppe, Ton. -->
_(noch nichts notiert)_

## Aufbau
<!-- Welche Datei macht was? Besonderheiten (Framework, Netzwerk, Assets). -->
_(noch nichts notiert)_

## Entscheidungen
<!-- Warum etwas so und nicht anders gelöst ist — jeweils mit Datum. -->
_(noch nichts notiert)_

## Offen / als Nächstes
<!-- Was fehlt, was ist halbfertig, was war gerade in Arbeit? -->
_(noch nichts notiert)_

## Stolperfallen
<!-- Was schon einmal schiefging und nicht wieder passieren soll. -->
_(noch nichts notiert)_
"""


def ensure_game_memory(gdir: str, slug: str, title: str = "") -> bool:
    """Gedächtnisdatei des Spiels anlegen, falls sie noch fehlt. Wird bei JEDEM
    Sitzungsstart aufgerufen — bestehende Spiele bekommen ihre Datei damit beim
    nächsten Öffnen, neue direkt beim Anlegen. Vorhandenes wird nie angefasst.
    Rückgabe: True, wenn neu angelegt."""
    path = os.path.join(gdir, GAME_MEMORY_FILE)
    try:
        if os.path.lexists(path):
            return False
        if not title:
            try:
                with open(os.path.join(gdir, "game.json"), encoding="utf-8") as fh:
                    title = str(json.load(fh).get("title") or "")
            except (OSError, ValueError):
                title = ""
        text = (_MEMORY_TEMPLATE
                .replace("__TITLE__", (title or slug)[:80])
                .replace("__SLUG__", slug)
                .replace("__DATE__", time.strftime("%Y-%m-%d")))
        # "x" statt "w": zwei gleichzeitig startende Sitzungen dürfen sich die
        # Datei nicht gegenseitig überschreiben.
        with open(path, "x", encoding="utf-8") as fh:
            fh.write(text)
        os.chmod(path, 0o644)
        log.info("Gedächtnis für %s angelegt", slug)
        return True
    except FileExistsError:
        return False
    except OSError as exc:
        log.warning("Gedächtnis für %s fehlgeschlagen: %s", slug, exc)
        return False


def resolve_game_workdir(auth: dict, workdir: str, sel_game: str, new_game: str):
    """Startverzeichnis für die gewählte Spiel-Bearbeitung ermitteln.

    Das Arbeitsverzeichnis ist das Spielverzeichnis SELBST (kein Sammel-
    Workspace mit Nachbarspielen): damit ist die Claude-Sitzung von Haus aus auf
    dieses eine Spiel begrenzt — alles darüber liegt außerhalb des
    Arbeitsverzeichnisses und wird von Claude Code abgelehnt. Rechte:
    Admin=jedes; Nutzer nur eigene bzw. unbeanspruchte (neue) Spiele.

    Rückgabe: (cwd, slug, error) — bei error != "" darf die Sitzung NICHT
    starten (kein stiller Rückfall auf einen Arbeitsbereich mit fremden
    Spielen)."""
    try:
        games_root = os.path.realpath(os.path.join(START_DIR, "games")) if START_DIR else ""
        if not games_root or not os.path.isdir(games_root):
            return workdir, "", "games_dir_missing"
        created = False
        if str(new_game or "").strip():
            slug = slug_from_name(new_game)
            if not slug:
                return workdir, "", "bad_game_name"
            gdir = os.path.join(games_root, slug)
            if not (os.path.isdir(gdir) or live_game_exists(slug)):
                scaffold_new_game(gdir, slug, str(new_game).strip())
                created = True
        elif str(sel_game or "").strip():
            if not GAME_SLUG_RE.match(sel_game):
                return workdir, "", "bad_game_name"
            slug = sel_game
        else:
            return workdir, "", ""      # kein Spiel gewählt → Sammel-Workspace
        gdir = os.path.join(games_root, slug)
        if not os.path.isdir(gdir):
            return workdir, "", "game_missing"
        # Rechteprüfung (außer Admin): nur eigene/unbeanspruchte Spiele.
        if not auth.get("isAdmin") and slug not in {g["id"] for g in games_for_user(auth)}:
            return workdir, "", "game_denied"
        if created:
            log.info("neues Spiel %s angelegt", slug)
        return gdir, slug, ""
    except Exception as exc:  # pragma: no cover — defensiv, nie die Sitzung killen
        log.warning("resolve_game_workdir failed: %s", exc)
        return workdir, "", "game_error"


def scope_settings_path(user_home: str, sid: str) -> str:
    return os.path.join(user_home, ".session-scope", sid + ".json")


def write_scope_settings(user_home: str, sid: str, slug: str, gdir: str) -> str:
    """Sitzungseigene Claude-Settings: geändert werden darf nur das gewählte
    Spiel. Zusammen mit dem Arbeitsverzeichnis (= Spielordner) ist die Sitzung
    damit auf genau dieses Spiel begrenzt; die Site-Dateien, die
    Live-Auslieferung und die HOMEs der anderen Nutzer sind für die Tools gar
    nicht erreichbar. Die anderen Spiele der Testumgebung sind LESBAR
    (Nachschlagen, wie andere Spiele etwas lösen — Nutzerwunsch), aber nicht
    änderbar. Rückgabe: Pfad der Settings-Datei ("" bei Fehler — die Sitzung
    startet dann ohne diese zusätzliche Sperre)."""
    blocked = []      # weder lesen noch ändern
    read_only = []    # lesen erlaubt, ändern gesperrt
    extra_dirs = []   # außerhalb des cwd lesbar (sonst lehnt Claude Code ab)
    live_root = os.path.realpath(LIVE_DIR) if LIVE_DIR else ""
    if live_root:
        blocked.append(live_root)
    if USERS_DIR:
        blocked.append(os.path.realpath(USERS_DIR))
    if TOOLS_DIR:
        blocked.append(os.path.realpath(TOOLS_DIR))
    if START_DIR:
        testing = os.path.realpath(START_DIR)
        games_root = os.path.join(testing, "games")
        try:
            # Site-Dateien der Testumgebung (assets/, index.html, admin/ …)
            blocked.extend(e.path for e in os.scandir(testing) if e.name != "games")
            # Jedes andere Spiel einzeln nur gegen Änderungen sperren (games/
            # selbst darf nicht gesperrt werden — Deny schlägt Allow, das eigene
            # Spiel liegt darunter).
            read_only.extend(e.path for e in os.scandir(games_root) if e.name != slug)
            # Lesen außerhalb des Arbeitsverzeichnisses erlauben: ohne diesen
            # Eintrag verweigert Claude Code jeden Zugriff auf games/<anderes>.
            if os.path.isdir(games_root):
                extra_dirs.append(games_root)
        except OSError as exc:
            log.warning("scope scan failed: %s", exc)
    deny = []
    # Regelsyntax für absolute Pfade: doppelter Schrägstrich, also
    # "Read(//var/www/testing/assets/**)".
    # Nur Read + Edit: Edit-Regeln decken laut Claude Code ALLE dateiändernden
    # Werkzeuge ab, Write-Regeln greifen bei der Dateiprüfung nicht (die CLI
    # warnt sonst bei jedem Start).
    for paths, tools in ((blocked, ("Read", "Edit")), (read_only, ("Edit",))):
        for path in paths:
            abs_path = os.path.realpath(path)
            for tool in tools:
                deny.append("%s(/%s)" % (tool, abs_path))
                deny.append("%s(/%s/**)" % (tool, abs_path))
    settings = {"permissions": {"deny": deny, "additionalDirectories": extra_dirs}}
    # Automatischer Test: Claude Code ruft den Stop-Hook auf, sobald eine Antwort
    # fertig ist. Der Hook testet GENAU das Spiel dieser Sitzung und meldet harte
    # Fehler mit Exit-Code 2 zurück — Claude arbeitet sie ab, ohne dass jemand
    # den Testlauf anstoßen muss. (Der Hook selbst bricht nie eine Sitzung ab.)
    if TEST_HOOK and slug and os.access(TEST_HOOK, os.X_OK):
        settings["hooks"] = {"Stop": [{"hooks": [{
            "type": "command",
            "command": "%s %s" % (shlex.quote(TEST_HOOK), shlex.quote(slug)),
            "timeout": TEST_HOOK_TIMEOUT,
        }]}]}
    path = scope_settings_path(user_home, sid)
    try:
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(settings, fh)
        os.chmod(path, 0o600)
        return path
    except OSError as exc:
        log.warning("scope settings failed: %s", exc)
        return ""


def scope_args(user_home: str, sid: str, slug: str, gdir: str) -> list:
    """Kommandozeilen-Argumente, die die Claude-Sitzung an ein Spiel binden."""
    args = []
    settings = write_scope_settings(user_home, sid, slug, gdir)
    if settings:
        args += ["--settings", settings]
    test_hint = ""
    if TEST_BIN:
        test_hint = (
            f"Nach jeder Änderung wird automatisch getestet ({os.path.basename(TEST_BIN)} {slug}): "
            "JS-Syntax, JSON, HTML-Struktur, referenzierte Dateien, Übersetzungsschlüssel aller "
            "Sprachen und ein echter Browserlauf der Seite (Konsolenfehler, fehlgeschlagene "
            "Requests, Handy-Viewport). Gemeldete Fehler bitte selbst beheben; du kannst den "
            f"Test jederzeit selbst starten: {os.path.basename(TEST_BIN)} {slug} "
            "(Optionen: --no-browser für einen schnellen Durchlauf). "
        )
    soon_hint = ""
    if SOON_BIN:
        soon = os.path.basename(SOON_BIN)
        soon_hint = (
            "Solange ein Spiel noch nicht fertig ist, kann es im Katalog als „Bald verfügbar\" "
            "stehen: eine ausgegraute Kachel, die man nicht anklicken kann. Der Schalter dafür "
            "ist das Feld \"comingSoon\" in der game.json deines Spiels — es gibt keine zentrale "
            f"Liste. Umlegen am besten mit {soon} {slug} on bzw. {soon} {slug} off, Stand aller "
            f"Spiele mit {soon}. Wirksam wird es live erst mit dem nächsten Deploy. "
        )
    games_root = os.path.join(os.path.realpath(START_DIR), "games") if START_DIR else ""
    peek_hint = ""
    if games_root:
        peek_hint = (
            f"Die anderen Spiele unter {games_root}/ darfst du zum Nachschlagen LESEN (wie lösen "
            "sie Aufbau, Übersetzungen, Spiellogik?) — ändern kannst und darfst du dort nichts, "
            "das ist serverseitig gesperrt. Kopiere übernommene Ideen immer in dein eigenes Spiel. "
        )
    # Ohne diesen Hinweis baut Claude die Lobby jedes Mal neu — genau das war
    # der Grund, warum es in KEINEM Spiel eine Host-Weitergabe gab.
    kit_hint = (
        "Die Grundfunktionen für Mehrspieler-Runden stehen fertig in "
        "/assets/gamekit.js: Raum und Einladungslink, Spielername aus dem Konto, "
        "Anwesenheitsliste, automatische Host-Weitergabe (fällt der Gastgeber aus, "
        "übernimmt der nächste) und der geteilte Spielstand samt Wiederherstellung "
        "beim Beitreten. Neu angelegte Spiele haben das schon verdrahtet. Bau es "
        "NICHT nach und ersetze es nicht durch eigenen WebSocket-Code — erweitere "
        "es. Die Regel dahinter: den Spielstand ändert nur der Host über "
        "kit.setState(...), alle anderen schicken Züge mit kit.send(...), die der "
        "Host auswertet. Nur so überlebt eine Runde den Wechsel des Gastgebers. "
    )
    memory_hint = (
        f"Das Langzeitgedächtnis dieses Spiels ist {GAME_MEMORY_FILE} im Arbeitsverzeichnis; sie "
        "wird dir zu Beginn jeder Sitzung automatisch vorgelegt und ist das Einzige, was von einer "
        "Sitzung zur nächsten übrig bleibt (jede Sitzung fängt sonst bei null an). Lies sie, bevor "
        "du etwas änderst, und trage am Ende einer Aufgabe knapp nach, was die nächste Sitzung "
        "wissen muss: Spielidee, Aufbau der Dateien, getroffene Entscheidungen samt Begründung, "
        "offene Punkte, Stolperfallen. Stichpunkte statt Fließtext, Überholtes löschen statt "
        "anhäufen. Die Datei wird nie mit deployt und übersteht Deploy und Zurücksetzen. "
    )
    args += ["--append-system-prompt", (
        f"Diese Sitzung gehört zum Spiel „{slug}“ auf brettspiele.fun und ist ausschließlich "
        f"dafür da. Arbeitsverzeichnis ist {gdir} — ändern darfst du nur Dateien darin. "
        + peek_hint +
        "Die gemeinsamen Site-Dateien, die Live-Auslieferung und die Konten anderer Nutzer sind "
        "tabu und serverseitig gesperrt; frag nicht nach Ausnahmen, sondern erkläre die Grenze. "
        f"Dateien, die der Nutzer im Browser hochlädt (z.B. Screenshots oder 3D-Modelle), landen in "
        f"{UPLOAD_DIR_NAME}/ im Arbeitsverzeichnis — dieser Ordner wird nie mit deployt und ist nur "
        "Arbeitsmaterial; was ins Spiel soll, kopierst du daraus heraus. Blender-Quelldateien "
        "(.blend) kann auf dem Server kein Werkzeug öffnen — soll ein Modell ins Spiel, bitte den "
        "Nutzer um einen glTF-/GLB-Export (in Blender: Datei › Exportieren › glTF 2.0), den kannst "
        "du direkt einbinden. "
        + kit_hint + memory_hint +
        "Deploy und Zurücksetzen laufen ausschließlich über die "
        f"Buttons in der Terminal-Leiste und wirken immer nur auf „{slug}“. "
        + soon_hint + test_hint +
        f"Vorschau während der Entwicklung: https://brettspiele.fun/testing/games/{slug}/"
    )]
    return args


def safe_upload_name(name: str) -> str:
    """Dateinamen aus dem Browser entschärfen: nur der Basisname, harmlose
    Zeichen, bekannte Endung, begrenzte Länge. "" = abgelehnt."""
    name = os.path.basename(str(name or "").strip().replace("\\", "/"))
    name = UPLOAD_NAME_RE.sub("-", name).strip("-.")
    stem, ext = os.path.splitext(name)
    if ext.lower() not in UPLOAD_EXTS:
        return ""
    return (stem[:60] or "datei") + ext.lower()


def store_upload(workdir: str, name: str, data: bytes) -> str:
    """Hochgeladene Datei in <workdir>/.uploads/ ablegen, ohne je etwas zu
    überschreiben. Rückgabe: Pfad relativ zum Arbeitsverzeichnis — genau das
    tippt das Frontend anschließend in die Claude-Eingabe."""
    updir = os.path.join(workdir, UPLOAD_DIR_NAME)
    os.makedirs(updir, mode=0o755, exist_ok=True)
    # Der Ordner gehört derselben UID wie die Claude-Sitzung; ein untergeschobener
    # Symlink darf den Upload nicht aus dem Arbeitsverzeichnis herausführen.
    root = os.path.realpath(workdir)
    if os.path.islink(updir) or not os.path.realpath(updir).startswith(root + os.sep):
        raise OSError("upload dir escapes workdir")
    stem, ext = os.path.splitext(name)
    final, n = name, 1
    while os.path.exists(os.path.join(updir, final)):
        n += 1
        if n > 999:
            raise OSError("too many uploads named " + name)
        final = "%s-%d%s" % (stem, n, ext)
    with open(os.path.join(updir, final), "wb") as fh:
        fh.write(data)
    os.chmod(os.path.join(updir, final), 0o644)
    return os.path.join(UPLOAD_DIR_NAME, final)


def prepare_workspace(user_home: str, auth: dict) -> str:
    """Arbeitsbereich für Nicht-Admins: users/<u>/work verlinkt NUR die eigenen
    bzw. vom Admin freigegebenen Spiele aus der Testumgebung und erklärt die
    Regeln in einer CLAUDE.md. Achtung: alle Sitzungen laufen unter derselben
    Unix-UID — das ist eine Scope-/UX-Grenze für die Claude-Sitzung, keine
    harte Sandbox (harte Grenze ist die Deploy-Autorisierung in authorize_cmd)."""
    workdir = os.path.join(user_home, "work")
    os.makedirs(workdir, mode=0o700, exist_ok=True)
    games_dir = os.path.realpath(os.path.join(START_DIR, "games")) if START_DIR else ""
    slugs = [s for s in (auth.get("projects") or []) if GAME_SLUG_RE.match(s)]
    # Verwaltete Symlinks (alles, was in die Testumgebung zeigt) aktualisieren:
    # entzogene Freigaben und verwaiste Links entfernen, neue anlegen.
    try:
        entries = list(os.scandir(workdir))
    except OSError:
        entries = []
    for e in entries:
        if not e.is_symlink():
            continue
        dest = os.path.realpath(e.path)
        if games_dir and dest.startswith(games_dir + os.sep):
            if e.name not in slugs or not os.path.isdir(dest):
                try:
                    os.unlink(e.path)
                except OSError:
                    pass
    for slug in slugs:
        target = os.path.join(games_dir, slug)
        link = os.path.join(workdir, slug)
        if os.path.isdir(target) and not os.path.lexists(link):
            try:
                os.symlink(target, link)
            except OSError:
                pass
    game_list = ", ".join(slugs) if slugs else "— noch keine —"
    try:
        with open(os.path.join(workdir, "CLAUDE.md"), "w", encoding="utf-8") as fh:
            fh.write(
                f"# brettspiele.fun — Arbeitsbereich von {auth.get('username', '')}\n\n"
                f"- Die Verzeichnisse hier sind Links auf die Spiele, die dieser Nutzer bearbeiten darf: {game_list}.\n"
                f"- Bearbeite AUSSCHLIESSLICH diese Spiele. Alles andere unter {START_DIR}/ "
                "(fremde Spiele, geteilte Assets, Startseite) ist tabu — Freigaben vergibt der Admin.\n"
                f"- Neues Spiel anlegen: Verzeichnis {START_DIR}/games/<slug>/ mit index.html "
                "(Slug: Kleinbuchstaben/Ziffern/-/_). Beim ersten Deploy über das Dropdown wird es "
                "diesem Nutzer automatisch zugeordnet und erscheint auf der Startseite als Community-Spiel.\n"
                "- Deploy und Zurücksetzen laufen nur über die Dropdowns in der Terminal-Leiste, "
                "nicht über eigene Befehle.\n"
                + (f"- Tests: `{os.path.basename(TEST_BIN)} <slug>` prüft Syntax, Übersetzungen, "
                   "referenzierte Dateien und lädt die Seite in einem echten Browser "
                   "(Konsolenfehler, 404er, Handy-Ansicht). Läuft nach jeder Änderung automatisch; "
                   "gemeldete Fehler bitte beheben.\n" if TEST_BIN else "")
                + (f"- Noch nicht fertig? `{os.path.basename(SOON_BIN)} <slug> on` zeigt das Spiel "
                   "im Katalog als ausgegraute „Bald verfügbar\"-Kachel, `off` gibt es frei. "
                   "Der Schalter ist das Feld \"comingSoon\" in games/<slug>/game.json — "
                   "live wirkt er erst mit dem nächsten Deploy.\n" if SOON_BIN else "")
                + "- Vorschau während der Entwicklung: https://brettspiele.fun/testing/games/<slug>/\n"
            )
    except OSError:
        pass
    return workdir


class LiveSession:
    """Eine laufende Claude-PTY-Sitzung, ENTKOPPELT von der WS-Verbindung.

    Die PTY-Ausgabe wird unabhängig vom angedockten Client gelesen und in einem
    Ringpuffer vorgehalten. Verliert der Client die Verbindung, läuft der
    Prozess weiter (nur „losgelöst"); ein neuer Client dockt per ?attach=<id>
    wieder an und bekommt den Puffer als Wiederholung."""

    def __init__(self, sid, username, proc, master, workdir, env, target, is_admin, loop):
        self.id = sid
        self.username = username
        self.proc = proc
        self.master = master
        self.workdir = workdir
        self.env = env
        self.target = target            # Spiel-Slug, SITE_TARGET oder ""
        self.mode = "claude"            # "claude" | "shell" (in create_session gesetzt)
        self.is_admin = is_admin
        self.loop = loop
        self.buffer = bytearray()        # Rohausgabe fürs Replay beim Andocken
        self.sink: Optional[asyncio.Queue] = None  # gesetzt, solange ein Client dranhängt
        self.attach_gen = 0
        self.attach_task = None          # Task der aktuell angedockten Verbindung
        self.cmd_state = {"running": False}
        self.created = loop.time()
        self.last_activity = loop.time()
        self.detached_since = loop.time()   # startet losgelöst bis zum ersten Andocken
        self.dead = False
        self.closing = False             # manuell beendet: nicht mehr anbieten
        self.cleaned = False
        self.monitor = None
        self.reaper = None

    def emit(self, data: bytes):
        """Ausgabe puffern und – falls ein Client dranhängt – weiterreichen."""
        if not data:
            return
        self.buffer += data
        if len(self.buffer) > OUTPUT_BUFFER_MAX:
            del self.buffer[:len(self.buffer) - OUTPUT_BUFFER_MAX]
        q = self.sink
        if q is not None:
            try:
                q.put_nowait(bytes(data))
            except asyncio.QueueFull:
                pass  # langsamer Client: Frame verwerfen statt Speicher fluten

    def on_pty_readable(self):
        try:
            data = os.read(self.master, 65536)
        except BlockingIOError:
            return
        except OSError:
            data = b""
        if not data:  # EOF: der Prozess ist weg (session_reaper räumt auf)
            try:
                self.loop.remove_reader(self.master)
            except (OSError, ValueError):
                pass
            return
        self.last_activity = self.loop.time()
        self.emit(data)

    def title(self):
        return ("Spiel " + self.target) if self.target else "laufende Sitzung"

    def kill(self):
        p = self.proc
        if p.returncode is None:
            try:
                os.killpg(p.pid, signal.SIGHUP)
            except (ProcessLookupError, PermissionError):
                pass
            self.loop.call_later(5, self._force_kill)

    def _force_kill(self):
        if self.proc.returncode is None:
            try:
                os.killpg(self.proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

    def request_close(self):
        """Manuelles Schließen (Nutzer hat eine Sitzung zu viel offen). Ab
        sofort weder auflistbar noch andockbar; das eigentliche Aufräumen macht
        wie immer der session_reaper, sobald der Prozess wirklich weg ist."""
        if self.closing:
            return
        self.closing = True
        self.emit("\r\n\x1b[33m ⏹ Sitzung wird beendet …\x1b[0m\r\n".encode("utf-8"))
        self.kill()


def teardown_session(session: "LiveSession"):
    """Endgültiges Aufräumen, sobald der Claude-Prozess beendet ist."""
    if session.cleaned:
        return
    session.cleaned = True
    session.dead = True
    try:
        session.loop.remove_reader(session.master)
    except (OSError, ValueError):
        pass
    q = session.sink
    if q is not None:
        try:
            q.put_nowait(None)  # angedockten Client aufwecken → Exit senden
        except asyncio.QueueFull:
            pass
    if session.monitor:
        session.monitor.cancel()
    live_sessions.pop(session.id, None)
    try:
        os.close(session.master)
    except OSError:
        pass
    try:  # sitzungseigene Scope-Settings entfernen
        os.unlink(scope_settings_path(user_home_for(session.username), session.id))
    except OSError:
        pass
    log.info("session end user=%s pid=%d id=%s code=%s active=%d",
             session.username, session.proc.pid, session.id, session.proc.returncode, len(live_sessions))


async def session_reaper(session: "LiveSession"):
    """Wartet auf das Prozessende und räumt die Sitzung dann auf — unabhängig
    davon, ob gerade ein Client angedockt ist."""
    try:
        await session.proc.wait()
    except Exception:
        pass
    teardown_session(session)


async def session_idle_monitor(session: "LiveSession"):
    """Beendet Sitzungen bei Untätigkeit (angedockt), nach abgelaufener
    Nachfrist (losgelöst) oder nach der harten Höchstlaufzeit."""
    loop = session.loop
    try:
        while not session.dead:
            await asyncio.sleep(30)
            now = loop.time()
            if now - session.created > MAX_SESSION_LIFETIME:
                log.info("session lifetime cap user=%s id=%s", session.username, session.id)
                session.kill()
                return
            if session.sink is None:
                if session.detached_since is not None and now - session.detached_since > DETACHED_GRACE:
                    log.info("session detached grace expired user=%s id=%s", session.username, session.id)
                    session.kill()
                    return
            elif now - session.last_activity > IDLE_TIMEOUT:
                log.info("session idle timeout user=%s id=%s", session.username, session.id)
                session.kill()
                return
    except asyncio.CancelledError:
        pass


async def run_admin_command(session: "LiveSession", argv, banner):
    """Fester Verwaltungsbefehl als eigener Prozess (NICHT in der Claude-
    Sitzung). Die Ausgabe läuft über den Session-Puffer und überlebt so ein
    Wieder-Andocken bzw. einen zwischenzeitlichen Verbindungsverlust."""
    loop = session.loop
    try:
        session.emit(f"\r\n\x1b[36m ⚙ {banner} …\x1b[0m\r\n".encode("utf-8"))
        proc2 = await asyncio.create_subprocess_exec(
            *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            cwd=session.workdir, env=session.env,
        )
        while True:
            chunk = await proc2.stdout.read(4096)
            if not chunk:
                break
            session.last_activity = loop.time()
            session.emit(chunk.replace(b"\n", b"\r\n"))
        rc = await proc2.wait()
        colour = b"\x1b[32m" if rc == 0 else b"\x1b[31m"
        session.emit(colour + f" ⚙ {banner}: beendet (exit {rc})\x1b[0m\r\n".encode("utf-8"))
    except Exception as exc:
        session.emit(f"\r\n\x1b[31m ⚙ Befehl fehlgeschlagen: {exc}\x1b[0m\r\n".encode("utf-8"))
    finally:
        session.cmd_state["running"] = False
        session.last_activity = loop.time()


async def run_guarded_command(session: "LiveSession", cookie, msg, argv, banner):
    """Autorisierung frisch vom Relay unmittelbar vor der Ausführung (Freigaben/
    Entzug wirken sofort), ggf. neues Spiel zuordnen, dann Kommando starten."""
    loop = session.loop
    try:
        fresh = await check_auth({"cookie": cookie}) if cookie else {"allowed": False}
        if not fresh.get("allowed"):
            session.emit("\r\n\x1b[31m ⚙ Keine Berechtigung (Sitzung abgelaufen? Seite neu laden).\x1b[0m\r\n".encode("utf-8"))
            return
        err, claim_slug = authorize_cmd(msg, fresh)
        if err:
            session.emit(f"\r\n\x1b[31m ⚙ {err}\x1b[0m\r\n".encode("utf-8"))
            return
        if claim_slug:
            res = await loop.run_in_executor(None, claim_project_blocking, cookie, claim_slug)
            if not res.get("ok"):
                session.emit(f"\r\n\x1b[31m ⚙ Spiel „{claim_slug}“ konnte nicht zugeordnet werden: {res.get('error', 'unbekannt')}\x1b[0m\r\n".encode("utf-8"))
                return
            if not res.get("alreadyOwned"):
                session.emit(f"\r\n\x1b[36m ⚙ Neues Spiel „{claim_slug}“ ist jetzt dir zugeordnet (Community-Spiel).\x1b[0m\r\n".encode("utf-8"))
        # Zusicherung erst NACH der Rechteprüfung festhalten — sonst stünde am
        # Spiel eine Erklärung von jemandem, der es gar nicht deployen durfte.
        # Ein einzelnes Spiel trägt sie am Projekt; „all"/„site" sind
        # site-weite Wartung des Betreibers und brauchen keine.
        if str(msg.get("name") or "") == "deploy":
            slug = str(msg.get("target") or "")
            if slug and slug not in ("all", "site"):
                res = await loop.run_in_executor(None, accept_project_terms_blocking, cookie, slug)
                if not res.get("ok"):
                    session.emit(f"\r\n\x1b[31m ⚙ Rechte-Zusicherung konnte nicht vermerkt werden: "
                                 f"{res.get('error', 'unbekannt')} — Deploy abgebrochen.\x1b[0m\r\n".encode("utf-8"))
                    return
        await run_admin_command(session, argv, banner)
    except Exception as exc:
        session.emit(f"\r\n\x1b[31m ⚙ Befehl fehlgeschlagen: {exc}\x1b[0m\r\n".encode("utf-8"))
    finally:
        session.cmd_state["running"] = False


# Was eine Shell aus /etc WIRKLICH braucht. Der Rest von /etc geht sie nichts
# an: dort liegen die nginx-Site, die systemd-Units samt Environment-Zeilen,
# /etc/brettspiele mit den Geheimnissen und /etc/ssh. Ohne diese Liste wäre
# /etc komplett lesbar — technisch nötig ist davon fast nichts.
SHELL_ETC = (
    "/etc/resolv.conf", "/etc/hosts", "/etc/host.conf", "/etc/nsswitch.conf",
    "/etc/passwd", "/etc/group",              # Namensauflösung für ls/ps/id
    "/etc/ssl", "/etc/ca-certificates.conf", "/etc/ca-certificates",
    "/etc/localtime", "/etc/timezone",
    "/etc/alternatives",                      # viele Werkzeuge hängen daran
    "/etc/profile", "/etc/profile.d", "/etc/bash.bashrc", "/etc/inputrc",
    "/etc/terminfo",
)


def sandbox_argv(user_home: str, workdir: str, site_scope: bool, mode: str = "claude") -> list:
    """bwrap-Argumente, die eine PTY-Sitzung in einen eigenen Namensraum sperren.

    Das ist die erste KERNEL-Grenze in diesem Terminal. Alles andere hier
    (write_scope_settings, authorize_cmd, command_in_session_scope) sind
    Werkzeug- bzw. Protokollgrenzen: sie wirken nur, solange das Kindprogramm
    mitspielt. Claude Code tut das; eine Shell nicht. Was hier zugebunden wird
    und warum — jede Zeile schließt eine konkrete Lücke:

      · `--tmpfs /home` + nur das EIGENE HOME einbinden
        Alle Sitzungen laufen unter derselben Unix-Kennung `claudecode`. Die
        HOMEs sind zwar 0700, das schützt aber nicht zwischen Nutzern DERSELBEN
        UID. Ohne diese Zeile könnte jeder die `~/.claude`-Zugangsdaten aller
        anderen lesen — also deren Anthropic-Anmeldung übernehmen.
      · `/home/claudecode` selbst bleibt draußen
        Dort liegt `.deploy-request`. Der Root-Runner
        (brettspiele-deploy-run) prüft nur, ob das Ziel ein gültiger Slug ist —
        NICHT, wer es angefordert hat. Wer die Datei schreiben kann, deployt die
        ganze Seite an authorize_cmd vorbei. Innen existiert sie nicht.
      · `--tmpfs /opt`
        Versteckt TOOLS_DIR. Deploy/Reset laufen ausschließlich über die
        WS-Nachricht `cmd` → authorize_cmd → run_guarded_command, und das führt
        der Daemon AUSSERHALB der Sandbox aus. Damit ist die Rechteprüfung der
        einzige Weg statt bloß der bequemste.
      · Live-Webroot gar nicht eingebunden
        Er ist root:www-data und ohnehin nicht schreibbar, aber unsichtbar ist
        eindeutiger als „nicht schreibbar".
      · Testumgebung nur lesbar, das eigene Spiel darüber schreibbar
        Reihenfolge zählt: bwrap wertet Bindungen der Reihe nach aus, die
        spätere schreibbare gewinnt über die frühere lesbare.

    `--ro-bind-try /run/systemd/resolve` ist NICHT optional: /etc/resolv.conf
    ist ein Symlink dorthin, und ohne diese Zeile hat die Sitzung kein DNS
    (getestet — Netz ist sonst tot, was in der Sandbox wie ein Ausfall aussieht).
    """
    args = [
        BWRAP_BIN,
        "--die-with-parent",
        "--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-uts",
        "--proc", "/proc", "--dev", "/dev",
        "--tmpfs", "/tmp", "--tmpfs", "/run", "--tmpfs", "/opt",
        "--tmpfs", "/home", "--tmpfs", "/var", "--tmpfs", "/root", "--tmpfs", "/srv",
        "--ro-bind", "/usr", "/usr",
        # Debian ist merged-usr: /bin, /sbin, /lib, /lib64 sind Symlinks nach usr.
        "--symlink", "usr/bin", "/bin",
        "--symlink", "usr/sbin", "/sbin",
        "--symlink", "usr/lib", "/lib",
        "--symlink", "usr/lib64", "/lib64",
        "--ro-bind-try", "/run/systemd/resolve", "/run/systemd/resolve",
    ]
    shell = mode == "shell"
    if shell:
        # Nur die Handvoll Dateien aus /etc, die eine Shell zum Laufen braucht.
        args += ["--tmpfs", "/etc"]
        for path in SHELL_ETC:
            args += ["--ro-bind-try", path, path]
        # Eigenes HOME als leeres tmpfs: eine Shell braucht ein beschreibbares
        # HOME, aber NICHT den Inhalt — dort lägen sonst die eigenen
        # Anthropic-Zugangsdaten aus ~/.claude. Was hochgeladen wird, landet
        # ohnehin im Spielordner, nicht im HOME.
        args += ["--tmpfs", user_home]
    else:
        args += ["--ro-bind", "/etc", "/etc", "--bind", user_home, user_home]
    # Claude Code liegt im HOME des DIENSTkontos (~/.local/bin/claude, ein
    # Symlink nach ~/.local/share/claude/versions/<v>). Das verschwindet mit
    # `--tmpfs /home`, deshalb ausdrücklich lesbar dazubinden — sonst startet
    # in der Sandbox gar kein Claude. Nur .local, nicht das ganze HOME: dort
    # liegt auch `.deploy-request`, und genau die soll unerreichbar bleiben.
    if not shell:
        svc_local = os.path.join(os.path.expanduser("~"), ".local")
        if os.path.isdir(svc_local):
            args += ["--ro-bind", svc_local, svc_local]
    start = os.path.realpath(START_DIR) if START_DIR else ""
    if start and os.path.isdir(start):
        work = os.path.realpath(workdir)
        if site_scope:
            args += ["--bind", start, start]          # ganze Testumgebung schreibbar
        elif shell:
            # Eine Shell sieht ausschließlich ihr eigenes Spiel. Kein
            # schreibgeschützter Blick auf die Nachbarn wie bei Claude — dort
            # ist das Nachschlagen ausdrücklich erwünscht, hier nicht.
            if work != start and work.startswith(start + os.sep):
                args += ["--bind", work, work]
        else:
            args += ["--ro-bind", start, start]
            if work != start and work.startswith(start + os.sep):
                args += ["--bind", work, work]        # nur das eigene Spiel schreibbar
    args += ["--chdir", workdir, "--"]
    return args


async def create_session(auth: dict, resume_id: str = "", sel_game: str = "", new_game: str = "",
                         mode: str = "claude"):
    """Startet eine neue PTY-Sitzung und registriert sie in live_sessions.

    Zwei Achsen, die unabhängig voneinander sind:
      · WERKZEUG (`mode`): "claude" = Claude Code, "shell" = nackte Bash.
      · UMFANG (`sel_game`): ein Spiel-Slug oder SITE_TARGET für die ganze
        Testumgebung (nur Admin bzw. caps.site).

    Eine Shell läuft IMMER in der Sandbox — sie befolgt keine
    Werkzeug-Einstellungen, also muss die Grenze vom Kernel kommen.
    Rückgabe: (session, "") bzw. (None, reason) bei Fehler."""
    username = auth.get("username", "")
    # Eigenes HOME pro Site-User: eigener Claude-Login (~/.claude), eigenes work/.
    user_home = user_home_for(username)
    workdir = os.path.join(user_home, "work")
    os.makedirs(workdir, mode=0o700, exist_ok=True)
    os.chmod(user_home, 0o700)
    # Wieder-Öffnen einer gespeicherten Sitzung: nur eigene, ID strikt validiert.
    resume_args = []
    if resume_id:
        if find_session_file(user_home, resume_id):
            resume_args = ["--resume", resume_id]
        else:
            return None, "session_not_found"
    # Admins starten direkt in der Testumgebung; alle anderen in ihrem eigenen
    # Arbeitsbereich, der nur die eigenen/freigegebenen Spiele verlinkt.
    if START_DIR and os.path.isdir(START_DIR):
        if auth.get("isAdmin"):
            workdir = START_DIR
        else:
            workdir = prepare_workspace(user_home, auth)
    # Gewähltes bzw. neu angelegtes Spiel: cwd in dessen Verzeichnis. Nur bei
    # frischen Sitzungen (beim Fortsetzen bleibt der gespeicherte Kontext).
    target = ""
    if resume_id:
        # `claude --resume` findet die Sitzung nur im ursprünglichen cwd
        # (= Projektordner). Diesen aus der JSONL lesen und dorthin wechseln,
        # sonst schlägt das Fortsetzen für Sitzungen aus Spielordnern fehl.
        scwd = session_cwd(user_home, resume_id)
        if scwd and os.path.isdir(scwd) and cwd_within_allowed(scwd, user_home):
            workdir = scwd
            target = slug_from_cwd(scwd)
            # Fortgesetzte Spiel-Sitzungen sind an dasselbe Spiel gebunden —
            # Rechte können sich seit dem letzten Mal geändert haben.
            if target and not auth.get("isAdmin") \
                    and target not in {g["id"] for g in games_for_user(auth)}:
                return None, "game_denied"
    elif sel_game == SITE_TARGET:
        # Ganze Seite bearbeiten: Arbeitsverzeichnis ist die Wurzel der
        # Testumgebung, also Site-Dateien UND alle Spiele. Wer das darf, darf
        # faktisch jeden ausgelieferten Inhalt ändern — deshalb hart geprüft.
        if not auth.get("canSite"):
            return None, "site_denied"
        if not (START_DIR and os.path.isdir(START_DIR)):
            return None, "games_dir_missing"
        workdir = os.path.realpath(START_DIR)
        target = SITE_TARGET
    elif sel_game or new_game:
        workdir, target, err = resolve_game_workdir(auth, workdir, sel_game, new_game)
        if err:
            return None, err
    master, slave = os.openpty()
    set_winsize(master, 100, 30)
    env = {
        "HOME": user_home,
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin") + ":" + os.path.dirname(CLAUDE_BIN),
        "TERM": "xterm-256color",
        "COLORTERM": "truecolor",
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "USER": os.environ.get("USER", "claudecode"),
        "SHELL": "/bin/bash",
    }
    # Spiel der Sitzung für Hilfswerkzeuge im PATH (brettspiele-soon): damit ein
    # Terminal für Spiel A nicht versehentlich an Spiel B schraubt. Bequemlich-
    # keitsschranke, keine Sicherheitsgrenze — die macht write_scope_settings.
    if target:
        env["BRETTSPIELE_GAME"] = target
    # Optionaler geteilter Key: nur setzen, wenn konfiguriert — sonst meldet
    # sich jeder Nutzer selbst an (/login im Terminal, persistiert im User-HOME).
    if os.environ.get("ANTHROPIC_API_KEY"):
        env["ANTHROPIC_API_KEY"] = os.environ["ANTHROPIC_API_KEY"]
    # Langzeitgedächtnis des Spiels sicherstellen (auch beim Fortsetzen und bei
    # Spielen, die es schon vor dieser Funktion gab). Claude Code liest die
    # CLAUDE.md aus dem Arbeitsverzeichnis beim Start von allein ein.
    if target and os.path.isdir(workdir):
        ensure_game_memory(workdir, target)
    # Sitzungs-ID vor dem Start: die Scope-Settings hängen daran.
    sid = uuid.uuid4().hex
    site_scope = target == SITE_TARGET
    if mode == "shell":
        # Nackte Shell: keine Werkzeug-Einstellungen (eine Shell befolgt keine),
        # dafür zwingend die Sandbox. Ohne bwrap gibt es hier gar keine Shell —
        # lieber verweigern als eine Sitzung ohne Grenze aufmachen.
        if not os.path.isfile(BWRAP_BIN):
            os.close(master)
            os.close(slave)
            return None, "sandbox_missing"
        argv = sandbox_argv(user_home, workdir, site_scope, "shell") + [SHELL_BIN, "-l"]
        env["BRETTSPIELE_SANDBOX"] = "1"
    else:
        limit_args = scope_args(user_home, sid, target, workdir) if target and not site_scope else []
        argv = [CLAUDE_BIN, *CLAUDE_ARGS, *limit_args, *resume_args]
        # Die Werkzeug-Grenzen (write_scope_settings) bleiben — sie sind
        # feiner als die Sandbox (z.B. „andere Spiele lesbar, nicht änderbar").
        # Die Sandbox kommt als KERNEL-Grenze darunter: was Claude Code
        # freiwillig einhält, hält der Kernel jetzt auch ohne dessen Mitwirkung.
        if SANDBOX_CLAUDE and os.path.isfile(BWRAP_BIN):
            argv = sandbox_argv(user_home, workdir, site_scope) + argv
            env["BRETTSPIELE_SANDBOX"] = "1"
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdin=slave, stdout=slave, stderr=slave,
            cwd=workdir, env=env, preexec_fn=_child_preexec,
        )
    except FileNotFoundError:
        os.close(master)
        os.close(slave)
        return None, "sandbox_missing" if mode == "shell" else "claude_missing"
    os.close(slave)
    os.set_blocking(master, False)
    loop = asyncio.get_running_loop()
    session = LiveSession(sid, username, proc, master, workdir, env, target, bool(auth.get("isAdmin")), loop)
    session.mode = mode
    live_sessions[sid] = session
    loop.add_reader(master, session.on_pty_readable)
    session.reaper = asyncio.create_task(session_reaper(session))
    session.monitor = asyncio.create_task(session_idle_monitor(session))
    log.info("session start user=%s pid=%d id=%s mode=%s target=%s active=%d",
             username, proc.pid, sid, mode, target or "-", len(live_sessions))
    return session, ""


async def attach_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, session: "LiveSession", cookie: str):
    """Dockt den WS-Client an eine laufende Sitzung an: Puffer wiederholen,
    Ein-/Ausgabe durchreichen. Bei Verbindungsverlust wird die Sitzung nur
    LOSGELÖST (läuft weiter, Rejoin per ?attach=<id> möglich)."""
    loop = session.loop
    if session.dead:
        writer.write(encode_frame(0x1, b'{"t":"denied","reason":"attach_gone"}'))
        writer.write(encode_frame(0x8, b""))
        await writer.drain()
        return
    # Übernahme: eine evtl. noch (halb tot) hängende Verbindung dieser Sitzung
    # ablösen — genau das ermöglicht den Rejoin nach einem Verbindungsabriss,
    # den der Server selbst noch nicht bemerkt hat.
    prev = session.attach_task
    if prev is not None and not prev.done():
        prev.cancel()
    session.attach_gen += 1
    my_gen = session.attach_gen
    q: asyncio.Queue = asyncio.Queue(maxsize=512)
    snapshot = bytes(session.buffer)   # atomar mit der nächsten Zeile (kein await!)
    session.sink = q
    session.detached_since = None
    session.attach_task = asyncio.current_task()

    ready = {"t": "ready", "game": session.target, "isAdmin": session.is_admin,
             "mode": getattr(session, "mode", "claude"),
             "attach": session.id, "resumed": bool(snapshot)}
    writer.write(encode_frame(0x1, json.dumps(ready).encode()))
    if snapshot:
        writer.write(encode_frame(0x2, snapshot))  # bisherigen Terminalinhalt zurückspielen
    await writer.drain()

    async def pump_output():
        while True:
            data = await q.get()
            if data is None:  # Sitzung beendet (teardown_session)
                return
            writer.write(encode_frame(0x2, data))
            await writer.drain()

    async def pump_input():
        while True:
            opcode, payload = await read_frame(reader)
            if opcode == 0x8:  # close
                return
            if opcode == 0x9:  # ping
                writer.write(encode_frame(0xA, payload))
                await writer.drain()
                continue
            if opcode != 0x1:
                continue
            try:
                msg = json.loads(payload.decode("utf-8", errors="replace"))
            except json.JSONDecodeError:
                continue
            t = msg.get("t")
            if t == "input":
                session.last_activity = loop.time()
                data = str(msg.get("d", "")).encode("utf-8")
                if data:
                    try:
                        os.write(session.master, data)
                    except OSError:
                        return
            elif t == "resize":
                session.last_activity = loop.time()
                try:
                    set_winsize(session.master, msg.get("cols", 100), msg.get("rows", 30))
                    os.kill(session.proc.pid, signal.SIGWINCH)
                except (OSError, ProcessLookupError, TypeError, ValueError):
                    pass
            elif t == "cmd":
                # Verwaltungsbefehle nur über die Buttons (feste Aktionen).
                session.last_activity = loop.time()
                scope_err = command_in_session_scope(session, msg)
                # Ein echter Deploy stellt Inhalt öffentlich — genau da gehört
                # die Rechte-Zusicherung hin, und zwar bei JEDEM Mal. Der
                # Dry-Run und das Zurücksetzen brauchen sie nicht: dort wird
                # nichts veröffentlicht.
                if not scope_err and str(msg.get("name") or "") == "deploy" and not msg.get("terms"):
                    scope_err = ("Vor dem Veröffentlichen ist die Rechte-Zusicherung nötig. "
                                 "Bitte den Deploy-Knopf benutzen — er fragt sie ab.")
                argv, banner = build_command(msg)
                if scope_err:
                    session.emit(f"\r\n\x1b[31m ⚙ {scope_err}\x1b[0m\r\n".encode("utf-8"))
                elif not argv:
                    session.emit("\r\n\x1b[31m ⚙ Unbekannter Befehl.\x1b[0m\r\n".encode("utf-8"))
                elif session.cmd_state["running"]:
                    session.emit("\r\n\x1b[33m ⚙ Es läuft bereits ein Befehl — bitte warten.\x1b[0m\r\n".encode("utf-8"))
                else:
                    session.cmd_state["running"] = True
                    log.info("admin command user=%s: %s", session.username, " ".join(argv))
                    # Eigenständige Task: läuft weiter, auch wenn der Client
                    # zwischendurch die Verbindung verliert.
                    asyncio.create_task(run_guarded_command(session, cookie, msg, argv, banner))
            # "ping" hält nur Proxies wach und zählt bewusst nicht als Aktivität.

    out_task = asyncio.create_task(pump_output())
    in_task = asyncio.create_task(pump_input())
    try:
        done, _pending = await asyncio.wait({out_task, in_task}, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            if not t.cancelled():
                t.exception()  # Exceptions konsumieren ("never retrieved"-Warnung)
    finally:
        out_task.cancel()
        in_task.cancel()
        # Nur loslösen, wenn WIR noch der aktive Client sind — sonst hat gerade
        # eine Übernahme stattgefunden und darf nicht überschrieben werden.
        if session.attach_gen == my_gen and not session.dead:
            session.sink = None
            session.detached_since = loop.time()
        if session.dead:
            try:
                code = session.proc.returncode if session.proc.returncode is not None else -1
                writer.write(encode_frame(0x1, json.dumps({"t": "exit", "code": code}).encode()))
                writer.write(encode_frame(0x8, b""))
                await writer.drain()
            except (ConnectionError, OSError):
                pass


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = str(writer.get_extra_info("peername"))
    try:
        headers = await read_http_headers(reader)
        request = headers.get(":request", "")
        target = request.split(" ")[1] if len(request.split(" ")) > 1 else "/"
        parsed = urlparse(target)
        if parsed.path == "/ws/terminal/sessions":
            # Plain-HTTP: eigene Sitzungen auflisten — laufende (zum Wieder-
            # Andocken) UND gespeicherte (zum Fortsetzen per --resume).
            auth = await check_auth(headers)
            if not auth["allowed"] or not safe_username(auth["username"]):
                await send_http(writer, 401, '{"ok":false,"error":"not_authorized"}')
                return
            sessions = list_sessions(user_home_for(auth["username"]))
            loop = asyncio.get_running_loop()
            usable = [s for s in live_sessions.values() if not s.dead and not s.closing]
            live = [
                {"id": s.id, "target": s.target, "title": s.title(),
                 "attached": s.sink is not None, "age": int(loop.time() - s.created)}
                for s in usable if s.username == auth["username"]
            ]
            live.sort(key=lambda s: s["age"])
            # Admins sehen zusätzlich fremde Sitzungen — nur zum Schließen, denn
            # das Sitzungslimit gilt serverweit und ein vergessenes Terminal
            # blockiert sonst alle. Andocken bleibt dem Eigentümer vorbehalten.
            others = []
            if auth.get("isAdmin"):
                others = [
                    {"id": s.id, "user": s.username, "title": s.title(),
                     "attached": s.sink is not None, "age": int(loop.time() - s.created)}
                    for s in usable if s.username != auth["username"]
                ]
                others.sort(key=lambda s: s["age"])
            await send_http(writer, 200, json.dumps({
                "ok": True, "sessions": sessions, "live": live, "others": others,
                "max": MAX_SESSIONS, "used": len(usable),
            }))
            return
        if parsed.path == "/ws/terminal/close":
            # Laufende Sitzung manuell beenden (eine zu viel geöffnet, Slot
            # blockiert). POST + Origin-Check, damit kein fremdes Formular
            # per Cookie Sitzungen abschießen kann.
            if request.split(" ")[0].upper() != "POST":
                await send_http(writer, 400, '{"ok":false,"error":"bad_method"}')
                return
            if not same_origin(headers):
                await send_http(writer, 403, '{"ok":false,"error":"bad_origin"}')
                return
            auth = await check_auth(headers)
            if not auth["allowed"] or not safe_username(auth["username"]):
                await send_http(writer, 401, '{"ok":false,"error":"not_authorized"}')
                return
            sid = (parse_qs(parsed.query).get("id") or [""])[0]
            session = live_sessions.get(sid)
            if not session or session.dead:
                await send_http(writer, 404, '{"ok":false,"error":"not_found"}')
                return
            if session.username != auth["username"] and not auth.get("isAdmin"):
                await send_http(writer, 403, '{"ok":false,"error":"not_yours"}')
                return
            log.info("session close by user=%s id=%s owner=%s", auth["username"], sid, session.username)
            session.request_close()
            await send_http(writer, 200, '{"ok":true}')
            return
        if parsed.path == "/ws/terminal/upload":
            # Datei (typisch: Screenshot) ins Arbeitsverzeichnis der Sitzung
            # legen, damit Claude sie ansehen kann. Rohbody statt multipart —
            # Dateiname und Sitzung stehen in der Query.
            if request.split(" ")[0].upper() != "POST":
                await send_http(writer, 400, '{"ok":false,"error":"bad_method"}')
                return
            if not same_origin(headers):
                await send_http(writer, 403, '{"ok":false,"error":"bad_origin"}')
                return
            auth = await check_auth(headers)
            if not auth["allowed"] or not safe_username(auth["username"]):
                await send_http(writer, 401, '{"ok":false,"error":"not_authorized"}')
                return
            q = parse_qs(parsed.query)
            session = live_sessions.get((q.get("id") or [""])[0])
            if not session or session.dead or session.closing:
                await send_http(writer, 404, '{"ok":false,"error":"not_found"}')
                return
            # Nur in die EIGENE Sitzung — anders als beim Schließen gibt es hier
            # bewusst keine Admin-Ausnahme (Hochladen ist Schreibzugriff).
            if session.username != auth["username"]:
                await send_http(writer, 403, '{"ok":false,"error":"not_yours"}')
                return
            fname = safe_upload_name((q.get("name") or [""])[0])
            if not fname:
                await send_http(writer, 400, '{"ok":false,"error":"bad_name"}')
                return
            try:
                length = int(headers.get("content-length", "0"))
            except ValueError:
                length = 0
            if length <= 0:
                await send_http(writer, 400, '{"ok":false,"error":"bad_length"}')
                return
            if length > UPLOAD_MAX_BYTES:
                await send_http(writer, 413, json.dumps(
                    {"ok": False, "error": "too_large", "max": UPLOAD_MAX_BYTES}))
                return
            try:
                body = await asyncio.wait_for(reader.readexactly(length), timeout=120)
            except (asyncio.IncompleteReadError, asyncio.TimeoutError):
                await send_http(writer, 400, '{"ok":false,"error":"truncated"}')
                return
            try:
                rel = await asyncio.get_running_loop().run_in_executor(
                    None, store_upload, session.workdir, fname, body)
            except OSError as exc:
                log.warning("upload failed user=%s: %s", auth["username"], exc)
                await send_http(writer, 500, '{"ok":false,"error":"write_failed"}')
                return
            session.last_activity = session.loop.time()
            log.info("upload user=%s id=%s file=%s bytes=%d",
                     auth["username"], session.id, rel, len(body))
            await send_http(writer, 200, json.dumps(
                {"ok": True, "path": rel, "name": os.path.basename(rel), "size": len(body)}))
            return
        if parsed.path == "/ws/terminal/games":
            # Plain-HTTP: Spiele der Testumgebung für die Deploy-/Reset-Dropdowns,
            # gefiltert nach den Projekt-Rechten des Nutzers.
            auth = await check_auth(headers)
            if not auth["allowed"]:
                await send_http(writer, 401, '{"ok":false,"error":"not_authorized"}')
                return
            await send_http(writer, 200, json.dumps({
                "ok": True, "isAdmin": bool(auth.get("isAdmin")), "games": games_for_user(auth),
                # Steuert, ob der Picker „Gesamte Seite" und den Shell-Umschalter
                # anbietet. Die Oberfläche blendet danach nur aus — verbindlich
                # geprüft wird in create_session (site_denied).
                "canSite": bool(auth.get("canSite")),
                "canShell": os.path.isfile(BWRAP_BIN),
            }))
            return
        if parsed.path not in ("/ws/terminal", "/"):
            await send_http(writer, 404, '{"ok":false,"error":"not_found"}')
            return
        if not same_origin(headers):
            await send_http(writer, 403, '{"ok":false,"error":"bad_origin"}')
            return
        auth = await check_auth(headers)
        if auth["allowed"] and not safe_username(auth["username"]):
            auth["allowed"] = False  # ohne brauchbaren Namen kein User-HOME
        if not auth["allowed"]:
            # Handshake trotzdem annehmen, damit der Browser eine saubere
            # Fehlermeldung bekommt (HTTP-Fehler sind im WS-API unsichtbar).
            if await accept_websocket(writer, headers):
                reason = auth.get("reason") or "not_authorized"
                writer.write(encode_frame(0x1, json.dumps({"t": "denied", "reason": reason}).encode()))
                writer.write(encode_frame(0x8, b""))
                await writer.drain()
            return
        _q = parse_qs(parsed.query)
        attach_id = (_q.get("attach") or [""])[0]
        cookie = headers.get("cookie", "")
        # Wieder-Andocken an eine laufende Sitzung (Rejoin nach Verbindungsabriss
        # oder Seitenneuladen): nur an EIGENE, noch lebende Sitzungen.
        if attach_id:
            session = live_sessions.get(attach_id)
            if not (session and session.username == auth["username"]
                    and not session.dead and not session.closing):
                if await accept_websocket(writer, headers):
                    writer.write(encode_frame(0x1, b'{"t":"denied","reason":"attach_gone"}'))
                    writer.write(encode_frame(0x8, b""))
                    await writer.drain()
                return
            if not await accept_websocket(writer, headers):
                return
            await attach_client(reader, writer, session, cookie)
            return
        # Frische Sitzung: Limit zählt laufende Sitzungen (Andocken zählt nicht;
        # gerade geschlossene ebenfalls nicht — der Slot ist praktisch frei).
        if sum(1 for s in live_sessions.values() if not s.closing) >= MAX_SESSIONS:
            if await accept_websocket(writer, headers):
                writer.write(encode_frame(0x1, b'{"t":"denied","reason":"busy"}'))
                writer.write(encode_frame(0x8, b""))
                await writer.drain()
            return
        if not await accept_websocket(writer, headers):
            return
        resume_id = (_q.get("resume") or [""])[0]
        sel_game = (_q.get("game") or [""])[0]
        new_game = (_q.get("newGame") or [""])[0]
        # Werkzeug: alles außer dem ausdrücklichen "shell" ist Claude — ein
        # unbekannter Wert darf niemals versehentlich eine Shell aufmachen.
        mode = "shell" if (_q.get("mode") or [""])[0] == "shell" else "claude"
        session, err = await create_session(auth, resume_id, sel_game, new_game, mode)
        if err:
            writer.write(encode_frame(0x1, json.dumps({"t": "denied", "reason": err}).encode()))
            writer.write(encode_frame(0x8, b""))
            await writer.drain()
            return
        await attach_client(reader, writer, session, cookie)
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, OSError):
        pass
    except Exception as exc:
        log.warning("client error %s: %s", peer, exc)
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def main():
    os.makedirs(USERS_DIR, mode=0o700, exist_ok=True)
    server = await asyncio.start_server(handle_client, BIND, PORT)
    log.info("brettspiele.fun claude code terminal listening on %s:%s (cmd=%s %s)", BIND, PORT, CLAUDE_BIN, " ".join(CLAUDE_ARGS))
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    cleanup_task = asyncio.create_task(cleanup_sessions_loop())
    async with server:
        await stop.wait()
        cleanup_task.cancel()
        server.close()
        await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
