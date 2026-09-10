#!/usr/bin/env python3
"""Tiny WebSocket room relay + privacy-friendly stats API for brettspiele.fun.

No external Python packages are required. The server accepts browser WebSocket
connections on /ws and relays JSON text messages to every client in the same
`game:room`. It also exposes a tiny same-origin /api for aggregate visits and
ratings. The API deliberately stores no IP addresses or tracking identifiers.
"""
import asyncio
import base64
import hashlib
import json
import logging
import os
import signal
import secrets
import hmac
import re
import struct
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Set
from urllib.parse import parse_qs, urlparse, urlencode, quote

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_MESSAGE_BYTES = 8 * 1024 * 1024
MAX_HTTP_BODY_BYTES = 64 * 1024
SESSION_DIR = Path(os.environ.get("BRETTSPIELE_SESSION_DIR", "/opt/brettspiele_fun_ws/sessions"))
DATA_DIR = Path(os.environ.get("BRETTSPIELE_DATA_DIR", "/opt/brettspiele_fun_ws/data"))
STATS_FILE = DATA_DIR / "stats.json"
RATINGS_DIR = DATA_DIR / "ratings"
AUTH_DIR = DATA_DIR / "auth"
AUTH_USERS_FILE = AUTH_DIR / "users.json"
AUTH_SESSIONS_FILE = AUTH_DIR / "sessions.json"
AUTH_ACHIEVEMENTS_FILE = AUTH_DIR / "achievements.json"
AUTH_FRIENDS_FILE = AUTH_DIR / "friends.json"
AUTH_OAUTH_STATES_FILE = AUTH_DIR / "oauth_states.json"
# Angefangene OAuth-Anmeldungen an Konten MIT 2FA: der Anbieter hat den Nutzer
# bestätigt, der zweite Faktor fehlt aber noch. Erst nach gültigem Code wird
# daraus eine Sitzung — sonst wäre "Mit Google anmelden" ein 2FA-Bypass.
AUTH_OAUTH_PENDING_FILE = AUTH_DIR / "oauth_pending.json"
# Spiel-Projekte: welcher Nutzer besitzt welches Spiel (testing/games/<slug>)
# und wem der Admin zusätzlich Zugriff freigegeben hat. Quelle der Wahrheit für
# das /code-Terminal (Deploy-Rechte) und das Community-Flag im Katalog.
AUTH_PROJECTS_FILE = AUTH_DIR / "projects.json"
# Studio-Spiele: serverseitig gespeicherte Sandbox-Definitionen unter kurzer ID
# (teilbarer Link /studio/#id=<id> statt base64-kodiertem Spiel im Link).
AUTH_STUDIO_GAMES_FILE = AUTH_DIR / "studio_games.json"
STUDIO_MAX_GAMES_PER_USER = int(os.environ.get("BRETTSPIELE_STUDIO_MAX_GAMES", "30"))
# Meldungen rechtswidriger Inhalte (DSA Art. 16 „Melde- und Abhilfeverfahren"):
# jede und jeder darf melden, lesen dürfen nur Admins. Bewusst OHNE IP-Adresse
# — die Datenschutzerklärung sagt für die gesamte /api zu, dass keine IPs
# gespeichert werden; die Missbrauchsbremse ist das In-Memory-Rate-Limit.
AUTH_REPORTS_FILE = AUTH_DIR / "reports.json"
REPORT_RATE_LIMIT = int(os.environ.get("BRETTSPIELE_REPORT_RATE_LIMIT", "5"))
REPORT_RATE_WINDOW = int(os.environ.get("BRETTSPIELE_REPORT_RATE_WINDOW", "3600"))
# Obergrenze für die Datei: ältere ABGESCHLOSSENE Meldungen fallen heraus,
# offene nie. Ohne das wächst reports.json unbegrenzt und der Aufbewahrung
# widerspräche die Datenminimierung.
REPORT_MAX_STORED = int(os.environ.get("BRETTSPIELE_REPORT_MAX_STORED", "500"))
# Fassung der Nutzungsbedingungen, der ein Ersteller beim Einreichen zustimmt.
# Wird am Spiel-Eintrag mitgeschrieben — sonst lässt sich später nicht mehr
# zeigen, WELCHER Text zugesichert wurde. Bei inhaltlicher Änderung der
# Nutzungsbedingungen hochzählen (Ansible-Var brettspiele_terms_version).
TERMS_VERSION = os.environ.get("BRETTSPIELE_TERMS_VERSION", "2026-09-10")
AUTH_COOKIE_NAME = os.environ.get("BRETTSPIELE_AUTH_COOKIE", "brettspiele_session")
AUTH_SESSION_MAX_AGE = int(os.environ.get("BRETTSPIELE_AUTH_SESSION_MAX_AGE", "2592000"))
AUTH_PBKDF2_ITERATIONS = int(os.environ.get("BRETTSPIELE_AUTH_PBKDF2_ITERATIONS", "210000"))
AUTH_REGISTRATION_ENABLED = os.environ.get("BRETTSPIELE_REGISTRATION_ENABLED", "true").lower() in ("1", "true", "yes", "on")
# Anmeldeversuche: zusätzlich zur nginx-Bremse je IP wird hier auch je KONTO
# gezählt — ein Botnetz, das die Versuche über viele IPs verteilt, kommt an
# der IP-Bremse sonst vorbei. Fehlversuche landen als "auth-failure ip=…" im
# Journal; darauf sperrt die fail2ban-Jail brettspiele-auth.
AUTH_RATE_LIMIT = int(os.environ.get("BRETTSPIELE_AUTH_RATE_LIMIT", "12"))
AUTH_RATE_WINDOW = int(os.environ.get("BRETTSPIELE_AUTH_RATE_WINDOW", "300"))
AUTH_GUARDED_PATHS = {"/api/auth/login", "/api/auth/register"}
# Admin-Allowlist: Benutzernamen (kommasepariert), die beim Login/Registrieren
# automatisch zum Admin hochgestuft werden. So braucht kein Klartext-Passwort in
# die Config — der/die Admin registriert sich normal mit eigenem Passwort.
ADMIN_USERS = {u.strip().lower() for u in os.environ.get("BRETTSPIELE_ADMIN_USERS", "").split(",") if u.strip()}
ADMIN_DISPLAY_NAME = os.environ.get("BRETTSPIELE_ADMIN_DISPLAYNAME", "Administrator")
# KI-Allowlist: Benutzernamen, die automatisch die Fähigkeit `caps.ai` erhalten
# (KI-Spielerstellung im Studio). Admins haben sie ohnehin. Zusätzlich können
# Admins das Recht in /admin/ vergeben. Nutzer verknüpfen dann ihren EIGENEN
# Anthropic-API-Key — die KI-Aufrufe laufen über deren Key/Guthaben.
AI_USERS = {u.strip().lower() for u in os.environ.get("BRETTSPIELE_AI_USERS", "").split(",") if u.strip()}
# Seiten-Allowlist: Benutzernamen, die die Fähigkeit `caps.site` erhalten —
# das Recht, im /code-Terminal die GESAMTE Seite zu bearbeiten statt nur
# einzelner Spiele, und sie site-weit zu deployen. Das ist faktisch
# Admin-Macht über die ausgelieferten Inhalte; nur an Leute vergeben, denen
# man auch Admin geben würde. Admins haben es ohnehin.
SITE_USERS = {u.strip().lower() for u in os.environ.get("BRETTSPIELE_SITE_USERS", "").split(",") if u.strip()}
AUTH_SUPPORT_EMAIL = os.environ.get("BRETTSPIELE_SUPPORT_EMAIL", "support@brettspiele.fun")
PUBLIC_BASE_URL = os.environ.get("BRETTSPIELE_PUBLIC_BASE_URL", "").rstrip("/")
OAUTH_GOOGLE_ENABLED = os.environ.get("BRETTSPIELE_OAUTH_GOOGLE_ENABLED", "false").lower() in ("1", "true", "yes", "on")
OAUTH_GOOGLE_CLIENT_ID = os.environ.get("BRETTSPIELE_OAUTH_GOOGLE_CLIENT_ID", "")
OAUTH_GOOGLE_CLIENT_SECRET = os.environ.get("BRETTSPIELE_OAUTH_GOOGLE_CLIENT_SECRET", "")
OAUTH_FACEBOOK_ENABLED = os.environ.get("BRETTSPIELE_OAUTH_FACEBOOK_ENABLED", "false").lower() in ("1", "true", "yes", "on")
OAUTH_FACEBOOK_CLIENT_ID = os.environ.get("BRETTSPIELE_OAUTH_FACEBOOK_CLIENT_ID", "")
OAUTH_FACEBOOK_CLIENT_SECRET = os.environ.get("BRETTSPIELE_OAUTH_FACEBOOK_CLIENT_SECRET", "")
OAUTH_FACEBOOK_API_VERSION = os.environ.get("BRETTSPIELE_OAUTH_FACEBOOK_API_VERSION", "v20.0")
ANTHROPIC_API_KEY = os.environ.get("BRETTSPIELE_ANTHROPIC_API_KEY", "")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Spiel-Slugs (Verzeichnisnamen unter games/) — gleiche Regel wie im Terminal.
PROJECT_SLUG_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
# Kurze IDs gespeicherter Studio-Spiele (server-generiert, siehe _new_short_id).
STUDIO_ID_RE = re.compile(r"^[a-z0-9]{6,12}$")
# Kurze IDs eingegangener Meldungen (gleiche Form wie Studio-IDs).
REPORT_ID_RE = re.compile(r"^[a-z0-9]{6,12}$")
# Client-generierte Figuren-/Typ-IDs innerhalb einer Spiel-Definition.
STUDIO_PART_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,16}$")
# Live-Webroot: dort existierende, unregistrierte Spiele sind Site-Spiele und
# können nicht per /api/projects/claim übernommen werden.
WEB_ROOT_DIR = Path(os.environ.get("BRETTSPIELE_WEB_ROOT", "/var/www/brettspiele.fun"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("brettspiele-ws")

@dataclass(eq=False)
class Client:
    reader: asyncio.StreamReader
    writer: asyncio.StreamWriter
    rooms: Set[str] = field(default_factory=set)
    peer: str = "unknown"

rooms: Dict[str, Set[Client]] = {}
clients: Set[Client] = set()
http_rate: Dict[str, list] = {}
file_lock = asyncio.Lock()

# In-memory registry of rooms the host has explicitly opted into listing
# publicly (via a `public: true` field on any message they send while in
# the lobby). This is cosmetic/discovery only: anyone who already knows a
# room code can join regardless of this flag, same as before — it only
# controls whether the room shows up in the "browse open games" list.
# Nothing here is persisted to disk, and it disappears as soon as the room
# does (see cleanup()).
room_meta: Dict[str, dict] = {}


def safe_part(value: str, fallback: str = "unknown") -> str:
    cleaned = "".join(ch for ch in str(value or "").strip().lower() if ch.isalnum() or ch in ("-", "_"))
    return cleaned[:80] or fallback


def clean_text(value, limit: int) -> str:
    text = str(value or "").replace("\x00", "").strip()
    return text[:limit]


def update_room_meta(transport_room: str, game: str, room: str, msg: dict, member_count: int) -> None:
    meta = room_meta.setdefault(transport_room, {})
    if "public" in msg:
        meta["public"] = bool(msg.get("public"))
    if msg.get("hostName"):
        meta["hostName"] = clean_text(msg.get("hostName"), 32)
    if msg.get("maxPlayers") is not None:
        try:
            meta["maxPlayers"] = max(0, min(64, int(msg.get("maxPlayers"))))
        except (TypeError, ValueError):
            pass
    lobby_meta = msg.get("lobbyMeta")
    if isinstance(lobby_meta, dict):
        def _clamp_int(value):
            try:
                return max(0, min(64, int(value)))
            except (TypeError, ValueError):
                return None
        humans = _clamp_int(lobby_meta.get("humans"))
        if humans is not None:
            meta["humans"] = humans
        bots = _clamp_int(lobby_meta.get("bots"))
        if bots is not None:
            meta["bots"] = bots
        max_players = _clamp_int(lobby_meta.get("maxPlayers"))
        if max_players is not None:
            meta["maxPlayers"] = max_players
        if lobby_meta.get("mapName"):
            meta["mapName"] = clean_text(lobby_meta.get("mapName"), 40)
        if lobby_meta.get("ruleMode"):
            meta["ruleMode"] = clean_text(lobby_meta.get("ruleMode"), 24)
        if lobby_meta.get("winCondition"):
            meta["winCondition"] = clean_text(lobby_meta.get("winCondition"), 24)
    meta["game"] = game
    meta["room"] = room
    meta["memberCount"] = member_count
    meta["updatedAt"] = int(time.time())


async def api_rooms(query: dict):
    game = safe_part((query.get("game") or [""])[0], "")
    now = int(time.time())
    items = []
    for meta in room_meta.values():
        if game and meta.get("game") != game:
            continue
        if not meta.get("public") or meta.get("memberCount", 0) <= 0:
            continue
        if now - int(meta.get("updatedAt") or 0) > 120:
            continue
        items.append({
            "room": meta.get("room"),
            "hostName": meta.get("hostName") or "",
            "playerCount": meta.get("memberCount") or 0,
            "maxPlayers": meta.get("maxPlayers") or 0,
            "humans": meta.get("humans") or 0,
            "bots": meta.get("bots") or 0,
            "mapName": meta.get("mapName") or "",
            "ruleMode": meta.get("ruleMode") or "",
            "winCondition": meta.get("winCondition") or "",
            "updatedAt": meta.get("updatedAt"),
        })
    items.sort(key=lambda i: i.get("updatedAt") or 0, reverse=True)
    return {"ok": True, "items": items[:50]}


def session_path(game: str, room: str) -> Path:
    return SESSION_DIR / f"{safe_part(game)}__{safe_part(room)}.json"


def rating_path(game: str) -> Path:
    return RATINGS_DIR / f"{safe_part(game)}.json"


def extract_snapshot_message(msg: dict):
    typ = msg.get("type")
    if typ == "snapshot" and isinstance(msg.get("snapshot"), dict):
        return msg.get("snapshot")
    if typ == "state" and isinstance(msg.get("snapshot"), dict):
        return msg.get("snapshot")
    if typ == "timerStart" and isinstance(msg.get("snapshot"), dict):
        snap = dict(msg.get("snapshot") or {})
        snap["timerEndAt"] = msg.get("endAt")
        snap["running"] = True
        return snap
    if typ == "persist" and isinstance(msg.get("snapshot"), dict):
        return msg.get("snapshot")
    return None


def save_session(game: str, room: str, msg: dict) -> None:
    snapshot = extract_snapshot_message(msg)
    if not snapshot:
        return
    try:
        SESSION_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "game": safe_part(game),
            "room": str(room).strip().upper(),
            "type": msg.get("type"),
            "snapshot": snapshot,
            "updatedAt": int(time.time()),
        }
        tmp = session_path(game, room).with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(session_path(game, room))
    except Exception as exc:
        log.warning("failed to save session %s/%s: %s", game, room, exc)


def load_session(game: str, room: str):
    try:
        path = session_path(game, room)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data.get("snapshot"), dict):
            return None
        return data
    except Exception as exc:
        log.warning("failed to load session %s/%s: %s", game, room, exc)
        return None


async def send_session_state(client: Client, game: str, room: str):
    data = load_session(game, room)
    if not data:
        return
    await send_text(client, json.dumps({
        "type": "sessionState",
        "server": True,
        "game": safe_part(game),
        "room": str(room).strip().upper(),
        "snapshot": data.get("snapshot"),
        "sourceType": data.get("type"),
        "updatedAt": data.get("updatedAt"),
    }, ensure_ascii=False))


async def read_http_headers(reader: asyncio.StreamReader) -> Dict[str, str]:
    raw = await reader.readuntil(b"\r\n\r\n")
    if len(raw) > 32768:
        raise ValueError("headers too large")
    lines = raw.decode("latin1").split("\r\n")
    headers = {":request": lines[0]}
    for line in lines[1:]:
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        headers[key.strip().lower()] = value.strip()
    return headers


def parse_request(headers: Dict[str, str]):
    parts = headers.get(":request", "").split()
    if len(parts) < 2:
        return "GET", "/", "HTTP/1.1"
    return parts[0].upper(), parts[1], parts[2] if len(parts) > 2 else "HTTP/1.1"


async def read_http_body(reader: asyncio.StreamReader, headers: Dict[str, str]) -> bytes:
    try:
        length = int(headers.get("content-length") or "0")
    except ValueError:
        length = 0
    if length > MAX_HTTP_BODY_BYTES:
        raise ValueError("body too large")
    return await reader.readexactly(length) if length else b""


async def send_http(writer: asyncio.StreamWriter, status: int, payload=None, headers=None, content_type="application/json; charset=utf-8"):
    reasons = {200: "OK", 201: "Created", 204: "No Content", 302: "Found", 303: "See Other", 400: "Bad Request", 404: "Not Found", 405: "Method Not Allowed", 413: "Payload Too Large", 429: "Too Many Requests", 500: "Internal Server Error", 401: "Unauthorized", 403: "Forbidden", 409: "Conflict"}
    if payload is None:
        body = b""
    elif isinstance(payload, (bytes, bytearray)):
        body = bytes(payload)
    else:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    extra = "".join(f"{k}: {v}\r\n" for k, v in (headers or {}).items())
    response = (
        f"HTTP/1.1 {status} {reasons.get(status, 'OK')}\r\n"
        f"Content-Type: {content_type}\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Cache-Control: no-store\r\n"
        "X-Content-Type-Options: nosniff\r\n"
        f"{extra}"
        "Connection: close\r\n"
        "\r\n"
    ).encode("latin1") + body
    writer.write(response)
    await writer.drain()


def client_ip(headers: Dict[str, str], peer: str) -> str:
    # We use this only for in-memory rate limiting and never persist it.
    return (headers.get("x-real-ip") or headers.get("x-forwarded-for", "").split(",")[0] or peer).strip()[:80]


def rate_limited(key: str, limit: int = 120, window: int = 60) -> bool:
    now = time.time()
    items = [t for t in http_rate.get(key, []) if now - t < window]
    if len(items) >= limit:
        http_rate[key] = items
        return True
    items.append(now)
    http_rate[key] = items
    return False


def load_json(path: Path, default):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("failed to read %s: %s", path, exc)
    return default


def atomic_write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def rating_summary(items):
    count = len(items)
    average = round(sum(i.get("rating", 0) for i in items) / count, 2) if count else 0
    distribution = {str(i): 0 for i in range(1, 6)}
    for item in items:
        r = int(item.get("rating", 0))
        if 1 <= r <= 5:
            distribution[str(r)] += 1
    return {"count": count, "average": average, "distribution": distribution}


async def api_stats(query: dict):
    game = safe_part((query.get("game") or [""])[0], "site")
    stats = load_json(STATS_FILE, {"site": 0, "games": {}, "updatedAt": None})
    ratings = load_json(rating_path(game), []) if game != "site" else []
    return {
        "ok": True,
        "siteVisits": int(stats.get("site") or 0),
        "gameVisits": int((stats.get("games") or {}).get(game) or 0),
        "game": game,
        "ratings": rating_summary(ratings),
    }


async def api_visit(body: dict):
    game = safe_part(body.get("game") or "site", "site")
    async with file_lock:
        stats = load_json(STATS_FILE, {"site": 0, "games": {}, "updatedAt": None})
        stats["site"] = int(stats.get("site") or 0) + 1
        games = stats.setdefault("games", {})
        if game and game != "site":
            games[game] = int(games.get(game) or 0) + 1
        # Privacy-friendly background tally by day / month / year (aggregate
        # counts only — no IP addresses, no identifiers). The visitor counter
        # is no longer shown anywhere; this is purely for internal totals.
        now = time.gmtime()
        day = time.strftime("%Y-%m-%d", now)
        month = time.strftime("%Y-%m", now)
        year = time.strftime("%Y", now)
        by_date = stats.setdefault("byDate", {})
        for bucket, key in (("day", day), ("month", month), ("year", year)):
            b = by_date.setdefault(bucket, {})
            b[key] = int(b.get(key) or 0) + 1
        if game and game != "site":
            per_game = stats.setdefault("gamesByDate", {}).setdefault(game, {})
            for bucket, key in (("day", day), ("month", month), ("year", year)):
                b = per_game.setdefault(bucket, {})
                b[key] = int(b.get(key) or 0) + 1
        stats["updatedAt"] = int(time.time())
        atomic_write_json(STATS_FILE, stats)
    return await api_stats({"game": [game]})


async def api_ratings_get(query: dict, headers: Dict[str, str] = None):
    game = safe_part((query.get("game") or [""])[0], "unknown")
    items = load_json(rating_path(game), [])
    username = current_username(headers) if headers else ""
    my_rating = None
    if username:
        for item in items:
            if item.get("username") == username:
                my_rating = {
                    "rating": int(item.get("rating", 0)),
                    "name": clean_text(item.get("name") or "", 40),
                    "comment": clean_text(item.get("comment") or "", 600),
                    "createdAt": int(item.get("createdAt") or 0),
                }
                break
    public = [{
        "rating": int(i.get("rating", 0)),
        "name": clean_text(i.get("name") or "", 40),
        "comment": clean_text(i.get("comment") or "", 600),
        "createdAt": int(i.get("createdAt") or 0),
    } for i in items[-50:]][::-1]
    result = {"ok": True, "game": game, "summary": rating_summary(items), "items": public}
    if username:
        result["myRating"] = my_rating
    return result


async def api_rating_post(body: dict, headers: Dict[str, str] = None):
    game = safe_part(body.get("game"), "unknown")
    try:
        rating = int(body.get("rating"))
    except Exception:
        rating = 0
    if rating < 1 or rating > 5 or game == "unknown":
        return {"ok": False, "error": "invalid_rating"}
    username = current_username(headers) if headers else ""
    entry = {
        "rating": rating,
        "name": clean_text(body.get("name"), 40),
        "comment": clean_text(body.get("comment"), 600),
        "createdAt": int(time.time()),
    }
    if username:
        entry["username"] = username
    async with file_lock:
        items = load_json(rating_path(game), [])
        if username:
            items = [i for i in items if i.get("username") != username]
        items.append(entry)
        items = items[-1000:]
        atomic_write_json(rating_path(game), items)
    return await api_ratings_get({"game": [game]}, headers)


async def api_rating_delete(query: dict, headers: Dict[str, str] = None):
    game = safe_part((query.get("game") or [""])[0], "unknown")
    username = current_username(headers) if headers else ""
    # Anonymous ratings carry no identity to delete by — only signed-in users
    # can edit/delete their own rating (editing already worked via re-submit,
    # since api_rating_post replaces any existing entry for the same username).
    if not username or game == "unknown":
        return {"ok": False, "error": "not_authenticated"}
    async with file_lock:
        items = load_json(rating_path(game), [])
        remaining = [i for i in items if i.get("username") != username]
        if len(remaining) != len(items):
            atomic_write_json(rating_path(game), remaining)
    return await api_ratings_get({"game": [game]}, headers)

# ── Minimal account/session API ─────────────────────────────────────────────
# This is intentionally small and dependency-free: PBKDF2 password hashes,
# HttpOnly SameSite cookies, server-side sessions and no persistent IP storage.
# For public production use, put HTTPS in front of this and consider adding
# e-mail verification / password reset / admin tooling according to your ISMS.

def parse_cookies(headers: Dict[str, str]) -> dict:
    out = {}
    for part in (headers.get("cookie") or "").split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def is_admin_username(username: str) -> bool:
    return str(username or "").strip().lower() in ADMIN_USERS


def ensure_admin_record(record: dict) -> bool:
    """Hebt einen allowlisteten Nutzer in-place auf Admin-Rechte. Gibt True
    zurück, wenn sich etwas geändert hat (→ persistieren)."""
    if not record or not is_admin_username(record.get("username", "")):
        return False
    changed = False
    if record.get("role") != "admin":
        record["role"] = "admin"; changed = True
    caps = record.get("caps")
    if not isinstance(caps, dict):
        caps = {}; record["caps"] = caps
    if not caps.get("creator"):
        caps["creator"] = True; changed = True
    if record.get("displayName") != ADMIN_DISPLAY_NAME:
        record["displayName"] = ADMIN_DISPLAY_NAME; changed = True
    return changed


def is_ai_username(username: str) -> bool:
    return str(username or "").strip().lower() in AI_USERS


def is_site_username(username: str) -> bool:
    return str(username or "").strip().lower() in SITE_USERS


def ensure_site_record(record: dict) -> bool:
    """Hebt einen seiten-allowlisteten Nutzer in-place auf caps.site."""
    if not record or not is_site_username(record.get("username", "")):
        return False
    caps = record.get("caps")
    if not isinstance(caps, dict):
        caps = {}
        record["caps"] = caps
    if not caps.get("site"):
        caps["site"] = True
        return True
    return False


def ensure_ai_record(record: dict) -> bool:
    """Hebt einen KI-allowlisteten Nutzer in-place auf caps.ai. Gibt True zurück,
    wenn sich etwas geändert hat (→ persistieren)."""
    if not record or not is_ai_username(record.get("username", "")):
        return False
    caps = record.get("caps")
    if not isinstance(caps, dict):
        caps = {}
        record["caps"] = caps
    if not caps.get("ai"):
        caps["ai"] = True
        return True
    return False


def public_user(record: dict) -> dict:
    # Allowlistete Admins/KI-Nutzer werden auch beim Lesen korrekt gemeldet,
    # selbst wenn die Datei-Persistenz noch nicht aktualisiert wurde.
    ensure_admin_record(record)
    ensure_ai_record(record)
    ensure_site_record(record)
    caps = record.get("caps") if isinstance(record.get("caps"), dict) else {}
    role = record.get("role") or "user"
    cap_creator = bool(caps.get("creator")) or role == "admin"
    cap_ai = bool(caps.get("ai")) or role == "admin"
    # Seiten-Recht: ganze Testumgebung bearbeiten + site-weit deployen.
    cap_site = bool(caps.get("site")) or role == "admin"
    twofa_enabled = bool(twofa_state(record).get("enabled"))
    return {
        "username": record.get("username", ""),
        "displayName": record.get("displayName") or record.get("username", ""),
        "createdAt": int(record.get("createdAt") or 0),
        "hasEmail": bool(record.get("email")),
        "hasPassword": bool(record.get("password")),
        "authProviders": list(record.get("oauthProviders") or []),
        "role": role,
        "isAdmin": role == "admin",
        "caps": {
            "creator": cap_creator,
            "ai": cap_ai,
            "site": cap_site,
        },
        "aiLinked": bool(record.get("anthropicKey")),
        "creatorRequested": bool(record.get("creatorRequest")),
        "twofaEnabled": twofa_enabled,
        # 2FA-Pflicht: erhöhte Rechte (Admin/KI-Terminal/Studio) erst nach
        # hinterlegter 2FA nutzbar; für alle anderen Konten optional.
        "twofaRequired": (role == "admin" or cap_ai or cap_creator or cap_site) and not twofa_enabled,
    }


def current_username(headers: Dict[str, str]) -> str:
    user = get_current_user(headers)
    return user.get("username", "") if user else ""


def public_friend(username: str, users: dict) -> dict:
    record = users.get(username) or {"username": username, "displayName": username, "createdAt": 0}
    return public_user(record)


def normalize_username(value: str) -> str:
    return str(value or "").strip().lower()


def password_hash(password: str, salt_b64: str = None) -> dict:
    salt = base64.b64decode(salt_b64) if salt_b64 else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, AUTH_PBKDF2_ITERATIONS)
    return {
        "algo": "pbkdf2_sha256",
        "iterations": AUTH_PBKDF2_ITERATIONS,
        "salt": base64.b64encode(salt).decode("ascii"),
        "hash": base64.b64encode(digest).decode("ascii"),
    }


def verify_password(password: str, stored: dict) -> bool:
    try:
        iterations = int(stored.get("iterations") or AUTH_PBKDF2_ITERATIONS)
        salt = base64.b64decode(stored.get("salt") or "")
        expected = base64.b64decode(stored.get("hash") or "")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(digest, expected)
    except Exception:
        return False


# ── TOTP-2FA (RFC 6238, nur Standardbibliothek) ──────────────────────────────
# Pflicht für Konten mit erhöhten Rechten (Admin, KI-Terminal, Spiele-Studio),
# optional für alle anderen. Secrets liegen im Nutzer-Record (users.json).

def totp_new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def totp_code(secret_b32: str, for_time: float = None, step: int = 30, digits: int = 6) -> str:
    key = base64.b32decode(secret_b32.upper() + "=" * ((8 - len(secret_b32) % 8) % 8))
    counter = int((time.time() if for_time is None else for_time) // step)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(value).zfill(digits)


def totp_verify(secret_b32: str, code: str, window: int = 1) -> bool:
    code = str(code or "").strip().replace(" ", "")
    if not re.fullmatch(r"\d{6}", code) or not secret_b32:
        return False
    now = time.time()
    for delta in range(-window, window + 1):
        try:
            if hmac.compare_digest(totp_code(secret_b32, now + delta * 30), code):
                return True
        except Exception:
            return False
    return False


# ── QR-Code für die 2FA-Einrichtung (ISO/IEC 18004, nur Standardbibliothek) ──
# Byte-Modus, Fehlerkorrektur M, Versionen 1–10 (bis 213 Byte) — mehr braucht
# eine otpauth://-URL nicht. Ergebnis ist ein eigenständiges SVG, damit die
# Seite ohne externe Bibliothek (CSP!) auskommt.

QR_EC_M = {
    # Version: (EC-Codewörter je Block, [(Blockanzahl, Datencodewörter), …])
    1: (10, [(1, 16)]), 2: (16, [(1, 28)]), 3: (26, [(1, 44)]), 4: (18, [(2, 32)]),
    5: (24, [(2, 43)]), 6: (16, [(4, 27)]), 7: (18, [(4, 31)]),
    8: (22, [(2, 38), (2, 39)]), 9: (22, [(3, 36), (2, 37)]), 10: (26, [(4, 43), (1, 44)]),
}
QR_ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}
QR_REMAINDER_BITS = {1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0}


def _qr_gf_tables():
    exp, log, x = [0] * 512, [0] * 256, 1
    for i in range(255):
        exp[i], log[x] = x, i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        exp[i] = exp[i - 255]
    return exp, log


_QR_EXP, _QR_LOG = _qr_gf_tables()


def _qr_mul(a: int, b: int) -> int:
    return 0 if (a == 0 or b == 0) else _QR_EXP[_QR_LOG[a] + _QR_LOG[b]]


def _qr_rs_divisor(degree: int) -> list:
    """Generatorpolynom (ohne führenden Koeffizienten), höchster Grad zuerst."""
    poly = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(degree):
            poly[j] = _qr_mul(poly[j], root)
            if j + 1 < degree:
                poly[j] ^= poly[j + 1]
        root = _qr_mul(root, 2)
    return poly


def _qr_rs_ec(data: list, degree: int) -> list:
    divisor = _qr_rs_divisor(degree)
    rem = [0] * degree
    for byte in data:
        factor = byte ^ rem[0]
        del rem[0]
        rem.append(0)
        for i, coef in enumerate(divisor):
            rem[i] ^= _qr_mul(coef, factor)
    return rem


def _qr_bch(value: int, poly: int, bits: int) -> int:
    rest = value << bits
    gen_bits = poly.bit_length()
    while rest.bit_length() >= gen_bits:
        rest ^= poly << (rest.bit_length() - gen_bits)
    return (value << bits) | rest


def _qr_format_bits(mask: int) -> int:
    # EC-Level M = 0b00, danach 3 Maskenbits; BCH(15,5), XOR-Maske 0x5412.
    return (_qr_bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412) & 0x7FFF


def _qr_pick_version(byte_len: int) -> int:
    for version in sorted(QR_EC_M):
        data_cw = sum(c * d for c, d in QR_EC_M[version][1])
        if 4 + (8 if version < 10 else 16) + byte_len * 8 <= data_cw * 8:
            return version
    raise ValueError("qr payload too long")


def _qr_encode_data(payload: bytes, version: int) -> list:
    data_cw = sum(c * d for c, d in QR_EC_M[version][1])
    bits = []

    def put(value, n):
        for i in range(n - 1, -1, -1):
            bits.append((value >> i) & 1)

    put(0b0100, 4)                                   # Modus: Byte
    put(len(payload), 8 if version < 10 else 16)     # Längenfeld
    for byte in payload:
        put(byte, 8)
    put(0, min(4, data_cw * 8 - len(bits)))          # Abschlusszeichen
    while len(bits) % 8:
        bits.append(0)
    words = [int("".join(str(b) for b in bits[i:i + 8]), 2) for i in range(0, len(bits), 8)]
    pad = (0xEC, 0x11)
    for i in range(data_cw - len(words)):
        words.append(pad[i % 2])
    return words


def _qr_interleave(words: list, version: int) -> list:
    ec_per_block, groups = QR_EC_M[version]
    blocks, pos = [], 0
    for count, size in groups:
        for _ in range(count):
            block = words[pos:pos + size]
            pos += size
            blocks.append((block, _qr_rs_ec(block, ec_per_block)))
    out = []
    for i in range(max(len(b[0]) for b in blocks)):
        out.extend(block[i] for block, _ec in blocks if i < len(block))
    for i in range(ec_per_block):
        out.extend(ec[i] for _block, ec in blocks)
    return out


def _qr_function_matrix(version: int):
    """Grundraster mit allen Funktionsmustern. Rückgabe: (module, func, size);
    func[r][c] = True heißt Funktions-/Reservefeld (keine Daten, keine Maske)."""
    size = version * 4 + 17
    modules = [[0] * size for _ in range(size)]
    func = [[False] * size for _ in range(size)]

    def put(row, col, dark):
        modules[row][col] = 1 if dark else 0
        func[row][col] = True

    def finder(row, col):
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = row + r, col + c
                if 0 <= rr < size and 0 <= cc < size:
                    put(rr, cc, (0 <= r <= 6 and c in (0, 6)) or (0 <= c <= 6 and r in (0, 6))
                        or (2 <= r <= 4 and 2 <= c <= 4))

    finder(0, 0)
    finder(0, size - 7)
    finder(size - 7, 0)
    for i in range(8, size - 8):            # Timing-Muster zwischen den Findern
        put(6, i, i % 2 == 0)
        put(i, 6, i % 2 == 0)
    for r in QR_ALIGN[version]:
        for c in QR_ALIGN[version]:
            if (r < 8 and c < 8) or (r < 8 and c > size - 9) or (r > size - 9 and c < 8):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    put(r + dr, c + dc, max(abs(dr), abs(dc)) != 1)
    for i in range(9):                      # Formatinfo reservieren (Index 6 = Timing)
        if i == 6:
            continue
        put(8, i, False)
        put(i, 8, False)
    for i in range(8):
        put(8, size - 1 - i, False)
        put(size - 1 - i, 8, False)
    put(size - 8, 8, True)                  # Dunkelmodul
    if version >= 7:                        # Versionsinfo reservieren
        for i in range(18):
            a, b = size - 11 + i % 3, i // 3
            put(b, a, False)
            put(a, b, False)
    return modules, func, size


def _qr_place_data(modules, func, size, bits):
    """Datenbits im Zickzack von unten rechts nach oben links einsetzen."""
    bit, col, upward = 0, size - 1, True
    while col > 0:
        if col == 6:                        # senkrechtes Timing-Muster überspringen
            col -= 1
        for row in (range(size - 1, -1, -1) if upward else range(size)):
            for c in (col, col - 1):
                if func[row][c]:
                    continue
                modules[row][c] = bits[bit] if bit < len(bits) else 0
                bit += 1
        upward = not upward
        col -= 2


def _qr_mask(mask: int, row: int, col: int) -> bool:
    if mask == 0:
        return (row + col) % 2 == 0
    if mask == 1:
        return row % 2 == 0
    if mask == 2:
        return col % 3 == 0
    if mask == 3:
        return (row + col) % 3 == 0
    if mask == 4:
        return (row // 2 + col // 3) % 2 == 0
    if mask == 5:
        return (row * col) % 2 + (row * col) % 3 == 0
    if mask == 6:
        return ((row * col) % 2 + (row * col) % 3) % 2 == 0
    return ((row + col) % 2 + (row * col) % 3) % 2 == 0


def _qr_penalty(m, size) -> int:
    """Bewertung der vier Maskenregeln — je kleiner, desto besser lesbar."""
    score = 0
    pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
    pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
    for line in [list(row) for row in m] + [list(col) for col in zip(*m)]:
        run = 1
        for i in range(1, size):            # Regel 1: lange gleichfarbige Läufe
            if line[i] == line[i - 1]:
                run += 1
            else:
                score += (3 + run - 5) if run >= 5 else 0
                run = 1
        score += (3 + run - 5) if run >= 5 else 0
        # Regel 3: finderähnliches Muster; die hellen Randmodule dürfen laut
        # Norm außerhalb des Symbols liegen → Zeile mit Ruhezone auffüllen.
        padded = [0] * 4 + line + [0] * 4
        for i in range(len(padded) - 10):
            if padded[i:i + 11] in (pat1, pat2):
                score += 40
    for r in range(size - 1):               # Regel 2: gleichfarbige 2×2-Blöcke
        for c in range(size - 1):
            if m[r][c] == m[r][c + 1] == m[r + 1][c] == m[r + 1][c + 1]:
                score += 3
    total = size * size                     # Regel 4: Abweichung vom 50 %-Anteil
    dark = sum(sum(row) for row in m)
    return score + 10 * ((abs(dark * 20 - total * 10) + total - 1) // total)


def _qr_write_format(m, size, mask):
    bits = _qr_format_bits(mask)

    def bit(i):
        return (bits >> i) & 1

    for i in range(6):
        m[i][8] = bit(i)
    m[7][8], m[8][8], m[8][7] = bit(6), bit(7), bit(8)
    for i in range(9, 15):
        m[8][14 - i] = bit(i)
    for i in range(8):
        m[8][size - 1 - i] = bit(i)
    for i in range(8, 15):
        m[size - 15 + i][8] = bit(i)
    m[size - 8][8] = 1


def _qr_write_version(m, size, version):
    bits = _qr_bch(version, 0x1F25, 12) & 0x3FFFF
    for i in range(18):
        b = (bits >> i) & 1
        a, c = size - 11 + i % 3, i // 3
        m[c][a] = b
        m[a][c] = b


def qr_matrix(text: str) -> list:
    """Text → QR-Matrix (Zeilen aus 0/1), EC-Level M, Maske mit bester Bewertung."""
    payload = text.encode("utf-8")
    version = _qr_pick_version(len(payload))
    words = _qr_interleave(_qr_encode_data(payload, version), version)
    bits = []
    for word in words:
        for i in range(7, -1, -1):
            bits.append((word >> i) & 1)
    bits.extend([0] * QR_REMAINDER_BITS[version])
    base, func, size = _qr_function_matrix(version)
    _qr_place_data(base, func, size, bits)
    best = None
    for mask in range(8):
        m = [row[:] for row in base]
        for r in range(size):
            for c in range(size):
                if not func[r][c] and _qr_mask(mask, r, c):
                    m[r][c] ^= 1
        _qr_write_format(m, size, mask)
        if version >= 7:
            _qr_write_version(m, size, version)
        score = _qr_penalty(m, size)
        if best is None or score < best[0]:
            best = (score, m)
    return best[1]


def qr_svg(text: str, scale: int = 6, quiet: int = 4) -> str:
    """QR-Code als eigenständiges SVG (schwarz auf weiß, inkl. Ruhezone)."""
    m = qr_matrix(text)
    size = len(m)
    dim = (size + 2 * quiet) * scale
    parts = []
    for r in range(size):
        for c in range(size):
            if m[r][c]:
                parts.append("M%d %dh%dv%dh-%dz" % (
                    (c + quiet) * scale, (r + quiet) * scale, scale, scale, scale))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
        'shape-rendering="crispEdges" role="img" aria-label="QR-Code">'
        '<rect width="%d" height="%d" fill="#ffffff"/>'
        '<path d="%s" fill="#000000"/></svg>'
    ) % (dim, dim, dim, dim, dim, dim, "".join(parts))


def twofa_state(record: dict) -> dict:
    twofa = record.get("twofa") if isinstance(record.get("twofa"), dict) else {}
    return twofa


def cookie_flags(headers: Dict[str, str], max_age: int) -> str:
    secure = (headers.get("x-forwarded-proto") or "").lower() == "https"
    parts = [f"{AUTH_COOKIE_NAME}=", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={max_age}"]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def set_session_cookie(token: str, headers: Dict[str, str]) -> str:
    base = cookie_flags(headers, AUTH_SESSION_MAX_AGE)
    return base.replace(f"{AUTH_COOKIE_NAME}=", f"{AUTH_COOKIE_NAME}={token}", 1)


def clear_session_cookie(headers: Dict[str, str]) -> str:
    return cookie_flags(headers, 0)


async def send_redirect(writer: asyncio.StreamWriter, location: str, headers=None, status: int = 303):
    extra = {"Location": location, **(headers or {})}
    await send_http(writer, status, b"", headers=extra, content_type="text/plain; charset=utf-8")


def request_base_url(headers: Dict[str, str]) -> str:
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL
    proto = (headers.get("x-forwarded-proto") or "http").split(",")[0].strip() or "http"
    host = headers.get("host") or "localhost"
    return f"{proto}://{host}"


def oauth_redirect_uri(headers: Dict[str, str], provider: str) -> str:
    return f"{request_base_url(headers)}/api/auth/oauth/{provider}/callback"


def sanitize_next(value: str) -> str:
    nxt = str(value or "/").strip() or "/"
    if not nxt.startswith("/") or nxt.startswith("//") or "\x00" in nxt:
        return "/"
    return nxt[:500]


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()[:254]


def oauth_username_from_email(email: str) -> str:
    digest = hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()[:20]
    return f"oauth_{digest}"


def oauth_identity(provider: str, email: str) -> str:
    """Stabiler, nicht umkehrbarer Schlüssel für „dieses Konto bei diesem
    Anbieter". Bewusst ein Hash: die Verknüpfung darf keine zweite Klartext-
    Adresse ins Konto schreiben (Datensparsamkeit wie beim OAuth-Login)."""
    raw = f"{provider}:{normalize_email(email)}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def oauth_links(record: dict) -> dict:
    links = record.get("oauthLinks")
    return links if isinstance(links, dict) else {}


def find_user_by_oauth_identity(users: dict, provider: str, ident: str) -> str:
    for username, rec in (users or {}).items():
        if isinstance(rec, dict) and oauth_links(rec).get(provider) == ident:
            return username
    return ""


def unique_oauth_username(users: dict, base: str) -> str:
    """Der abgeleitete Name kann belegt sein, wenn jemand die Verknüpfung zu
    seinem Alt-Konto gelöst hat. Dann bekommt der neue Login einen eigenen
    Namen, statt still im fremden Konto zu landen."""
    if base not in users:
        return base
    for i in range(2, 100):
        cand = f"{base}{i}"
        if cand not in users:
            return cand
    return f"{base}{secrets.token_hex(3)}"


def display_from_email(email: str) -> str:
    local = normalize_email(email).split("@", 1)[0] if "@" in normalize_email(email) else "spieler"
    cleaned = re.sub(r"[^a-zA-Z0-9_.-]+", "", local)[:24] or "Spieler"
    return cleaned


def oauth_enabled(provider: str) -> bool:
    if provider == "google":
        return bool(OAUTH_GOOGLE_ENABLED and OAUTH_GOOGLE_CLIENT_ID and OAUTH_GOOGLE_CLIENT_SECRET)
    if provider == "facebook":
        return bool(OAUTH_FACEBOOK_ENABLED and OAUTH_FACEBOOK_CLIENT_ID and OAUTH_FACEBOOK_CLIENT_SECRET)
    return False


def oauth_authorize_url(provider: str, redirect_uri: str, state: str) -> str:
    if provider == "google":
        params = {
            "client_id": OAUTH_GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email",
            "state": state,
            "nonce": secrets.token_urlsafe(18),
            "prompt": "select_account",
        }
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    if provider == "facebook":
        params = {
            "client_id": OAUTH_FACEBOOK_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "email",
            "state": state,
        }
        return f"https://www.facebook.com/{OAUTH_FACEBOOK_API_VERSION}/dialog/oauth?" + urlencode(params)
    raise ValueError("unknown provider")


def http_json_request(url: str, method: str = "GET", data: dict = None, bearer: str = None) -> dict:
    body = None
    headers = {"Accept": "application/json", "User-Agent": "brettspiele.fun/1.0"}
    if data is not None:
        body = urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read(256 * 1024).decode("utf-8", errors="replace")
        return json.loads(raw or "{}")


def http_post_json_body(url: str, payload: dict, headers: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        **headers,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read(256 * 1024).decode("utf-8", errors="replace")
        return json.loads(raw or "{}")


# Keywords per category label (German and English) used for server-side Wikidata matching.
_CAT_KW: dict = {
    "stadt": ["city","town","village","municipality","capital","borough","settlement"],
    "city": ["city","town","village","municipality","capital","borough","settlement"],
    "land": ["country","state","republic","kingdom","nation","territory","sovereign"],
    "country": ["country","state","republic","kingdom","nation","territory","sovereign"],
    "fluss": ["river","stream","creek","waterway","canal","tributary"],
    "river": ["river","stream","creek","waterway","canal","tributary"],
    "tier": ["animal","mammal","bird","reptile","amphibian","fish","insect","arthropod","species","genus"],
    "animal": ["animal","mammal","bird","reptile","amphibian","fish","insect","species","genus"],
    "beruf": ["profession","occupation","job","career","trade","craft"],
    "job": ["profession","occupation","job","career","trade","craft"],
    "pflanze": ["plant","tree","flower","grass","herb","shrub","fungi","moss","species"],
    "plant": ["plant","tree","flower","grass","herb","shrub","species"],
    "vorname": ["given name","forename","first name","human name"],
    "name": ["given name","forename","first name","human name"],
    "baum": ["tree","species","genus","conifer","deciduous","timber"],
    "tree": ["tree","species","genus","conifer","deciduous","timber"],
    "vogel": ["bird","avian","passerine","raptor","waterfowl"],
    "bird": ["bird","avian","passerine","raptor","waterfowl"],
    "fisch": ["fish","freshwater","marine","aquatic","species"],
    "fish": ["fish","freshwater","marine","aquatic","species"],
    "insekt": ["insect","arthropod","beetle","butterfly","moth","bug","species"],
    "insect": ["insect","arthropod","beetle","butterfly","moth","bug"],
    "blume": ["flower","plant","bloom","species","cultivar"],
    "flower": ["flower","plant","bloom","species","cultivar"],
    "berg": ["mountain","peak","summit","ridge","hill","volcano","massif"],
    "mountain": ["mountain","peak","summit","ridge","hill","volcano"],
    "see": ["lake","reservoir","lagoon","pond","loch"],
    "lake": ["lake","reservoir","lagoon","pond","loch"],
    "film": ["film","movie","motion picture","documentary","animated film"],
    "movie": ["film","movie","motion picture","documentary"],
    "buch": ["book","novel","novella","literary work","publication","nonfiction"],
    "book": ["book","novel","literary work","publication"],
    "sportart": ["sport","martial art","athletics","game","competition"],
    "sport": ["sport","martial art","athletics","game","competition"],
    "automarke": ["automobile","car","vehicle","manufacturer","automotive"],
    "carbrand": ["automobile","car","vehicle","manufacturer","automotive"],
    "gericht": ["dish","food","cuisine","meal","delicacy","recipe"],
    "food": ["dish","food","cuisine","meal","delicacy"],
    "getränk": ["drink","beverage","wine","beer","juice","tea","coffee","cocktail"],
    "drink": ["drink","beverage","wine","beer","juice","tea","coffee","cocktail"],
    "musikgruppe": ["band","musical group","ensemble","orchestra","duo","trio"],
    "band": ["band","musical group","ensemble","orchestra","duo","trio"],
    "musikinstrument": ["instrument","musical instrument","string instrument","wind instrument","percussion"],
    "instrument": ["instrument","musical instrument","string instrument","wind instrument","percussion"],
    "schulfach": ["school subject","academic subject","discipline","field of study"],
    "subject": ["school subject","academic subject","discipline","field of study"],
    "sprache": ["language","dialect","tongue","linguistic"],
    "language": ["language","dialect","tongue","linguistic"],
    "farbe": ["color","colour","shade","hue","pigment"],
    "color": ["color","colour","shade","hue","pigment"],
    "kleidungsstück": ["clothing","garment","wear","apparel","fashion","textile"],
    "clothing": ["clothing","garment","wear","apparel","fashion"],
    "körperteil": ["body part","anatomy","organ","limb","structure"],
    "bodypart": ["body part","anatomy","organ","limb"],
    "brettspiel": ["board game","tabletop game","card game","game"],
    "boardgame": ["board game","tabletop game","card game","game"],
    "drache": ["dragon","mythical creature","legendary creature","wyvern"],
    "dragon": ["dragon","mythical creature","legendary creature","wyvern"],
    "fantasiewesen": ["mythical creature","legendary creature","fictional character","folklore"],
    "fantasy": ["mythical creature","legendary creature","fictional character","folklore"],
    "superkraft": ["superpower","superhuman","fictional ability","ability"],
    "superpower": ["superpower","superhuman","fictional ability","ability"],
    "erfindung": ["invention","device","apparatus","machine","innovation"],
    "invention": ["invention","device","apparatus","machine","innovation"],
    # "fridge"/"excuse"/"wifi" (Kühlschrankausrede, WLAN-Name) sind frei erfundene
    # Antworten ohne Realweltbezug — dafür gibt es keine sinnvollen Wikidata-
    # Schlüsselwörter, die bleiben absichtlich ohne Eintrag (Status "uncertain",
    # der menschliche Judge entscheidet).
}


_WIKI_FALLBACK_MSGS = {
    "de": {"none": "Kein Eintrag in Wikidata gefunden.", "ambiguous": "Treffer gefunden — Kategorie nicht eindeutig erkannt.", "unavailable": "Web-Prüfung nicht verfügbar.", "categoryMismatch": "Eintrag gefunden, passt aber nicht zur Kategorie."},
    "en": {"none": "No entry found on Wikidata.", "ambiguous": "Match found — category not clearly confirmed.", "unavailable": "Web check unavailable.", "categoryMismatch": "Entry found, but it does not match the category."},
    "fr": {"none": "Aucune entrée trouvée sur Wikidata.", "ambiguous": "Résultat trouvé — catégorie non clairement confirmée.", "unavailable": "Vérification web indisponible.", "categoryMismatch": "Entrée trouvée, mais elle ne correspond pas à la catégorie."},
    "es": {"none": "No se encontró ninguna entrada en Wikidata.", "ambiguous": "Coincidencia encontrada — categoría no confirmada con claridad.", "unavailable": "Verificación web no disponible.", "categoryMismatch": "Entrada encontrada, pero no coincide con la categoría."},
    "it": {"none": "Nessuna voce trovata su Wikidata.", "ambiguous": "Corrispondenza trovata — categoria non chiaramente confermata.", "unavailable": "Verifica web non disponibile.", "categoryMismatch": "Voce trovata, ma non corrisponde alla categoria."},
    "ru": {"none": "Запись в Викиданных не найдена.", "ambiguous": "Найдено совпадение — категория не подтверждена точно.", "unavailable": "Веб-проверка недоступна.", "categoryMismatch": "Запись найдена, но не соответствует категории."},
    "zh": {"none": "在维基数据中未找到条目。", "ambiguous": "找到匹配项——类别未明确确认。", "unavailable": "网络验证不可用。", "categoryMismatch": "找到条目，但与类别不匹配。"},
    "ja": {"none": "Wikidataにエントリが見つかりません。", "ambiguous": "一致が見つかりましたが、カテゴリは明確に確認されていません。", "unavailable": "ウェブ確認は利用できません。", "categoryMismatch": "エントリは見つかりましたが、カテゴリと一致しません。"},
}


def _wiki_msg(lang_code: str, key: str) -> str:
    table = _WIKI_FALLBACK_MSGS.get(lang_code, _WIKI_FALLBACK_MSGS["de"])
    return table.get(key, _WIKI_FALLBACK_MSGS["de"][key])


async def api_wiki_check(term: str, category: str, letter: str, lang_code: str = "de") -> tuple:
    cat_key = re.sub(r"\s*/\s*.*", "", category).strip().lower()
    keywords = _CAT_KW.get(cat_key, _CAT_KW.get(re.sub(r"[^a-z]", "", cat_key), []))
    wiki_lang = lang_code if lang_code in _AI_CHECK_LANG_NAMES else "de"

    def run():
        # Step 1: search Wikidata in the player's own language so the displayed
        # description matches what they typed in, instead of always German.
        # NOTE: "language" only controls which language's labels are matched —
        # the actual display language of the returned label/description is
        # controlled by "uselang", which defaults to English if omitted. Both
        # are required, or the description text stays English regardless of
        # what "language" is set to.
        # limit=8 (not 3): a plain text search for e.g. "Anakonda" can rank an
        # unrelated entity (an album, a film, ...) above the actual animal. We
        # fetch several candidates and pick the one matching the category
        # below, instead of blindly trusting the top hit.
        search_url = (
            "https://www.wikidata.org/w/api.php"
            f"?action=wbsearchentities&language={wiki_lang}&uselang={wiki_lang}&format=json&limit=8&search={quote(term)}"
        )
        try:
            req = urllib.request.Request(
                search_url,
                headers={"Accept": "application/json", "User-Agent": "brettspiele.fun/1.0"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read(256 * 1024).decode("utf-8", errors="replace"))
            hits = data.get("search") or []
            if not hits:
                return {"ok": True, "status": "uncertain", "definition": _wiki_msg(lang_code, "none")}

            # Step 2: fetch English descriptions for every candidate in one
            # batched request (ids=Q1|Q2|...) — _CAT_KW keywords are English,
            # so the player's own-language description would never match them.
            ids = [h.get("id", "") for h in hits if h.get("id")]
            en_desc_by_id = {}
            if ids:
                ent_url = (
                    "https://www.wikidata.org/w/api.php"
                    f"?action=wbgetentities&ids={'|'.join(ids)}&props=descriptions&languages=en&format=json"
                )
                req2 = urllib.request.Request(
                    ent_url,
                    headers={"Accept": "application/json", "User-Agent": "brettspiele.fun/1.0"},
                )
                with urllib.request.urlopen(req2, timeout=5) as resp2:
                    ent_data = json.loads(resp2.read(128 * 1024).decode("utf-8", errors="replace"))
                entities = ent_data.get("entities", {})
                for qid in ids:
                    en_desc_by_id[qid] = (
                        entities.get(qid, {}).get("descriptions", {}).get("en", {}).get("value", "") or ""
                    ).lower()

            # Pick the first candidate (in search-rank order) whose English
            # description actually matches the category — not necessarily the
            # top hit. Falls back to the top hit if nothing matches, so the
            # "no match found" path below behaves exactly as before.
            entity_id = hits[0].get("id", "")
            display_desc = hits[0].get("description") or ""  # description shown to user, in their own language
            en_desc = en_desc_by_id.get(entity_id, "")
            if keywords:
                for h in hits:
                    qid = h.get("id", "")
                    desc = en_desc_by_id.get(qid, "")
                    if desc and any(kw in desc for kw in keywords):
                        entity_id, display_desc, en_desc = qid, h.get("description") or "", desc
                        break

            # The Wikidata entity id is language-independent — "Frankreich" and
            # "France" resolve to the same id, which lets the client recognize
            # cross-language duplicate answers instead of just comparing strings.
            if keywords and en_desc and any(kw in en_desc for kw in keywords):
                return {"ok": True, "status": "correct", "definition": display_desc, "canonical": entity_id}

            # We know what this category should look like (keywords defined) and
            # have a real description to check it against — if none of the
            # category keywords show up in it, this is a different kind of
            # thing entirely (e.g. a country typed under "Tier"/animal), not
            # just an unclear case. Previously this always fell through to
            # "uncertain", so the category was never actually enforced here.
            if keywords and en_desc:
                return {
                    "ok": True,
                    "status": "wrong",
                    "definition": display_desc or _wiki_msg(lang_code, "categoryMismatch"),
                    "canonical": entity_id,
                }

            return {
                "ok": True,
                "status": "uncertain",
                "definition": display_desc or _wiki_msg(lang_code, "ambiguous"),
                "canonical": entity_id,
            }
        except Exception as exc:
            log.debug("wiki_check error for %r: %s", term, exc)
            return {"ok": True, "status": "uncertain", "definition": _wiki_msg(lang_code, "unavailable")}

    return 200, await asyncio.to_thread(run)


_AI_CHECK_LANG_NAMES = {
    'de': 'German', 'en': 'English', 'fr': 'French', 'es': 'Spanish',
    'it': 'Italian', 'ru': 'Russian', 'zh': 'Chinese', 'ja': 'Japanese',
}

async def api_ai_check(body: dict):
    term = str(body.get("term", "")).strip()[:120]
    category = str(body.get("category", "")).strip()[:80]
    letter = str(body.get("letter", "")).strip()[:4]
    lang_code = str(body.get("lang", "de")).strip()[:8].lower()
    lang_name = _AI_CHECK_LANG_NAMES.get(lang_code, "German")
    if not term or not category or not letter:
        return 400, {"ok": False, "error": "missing_fields"}
    if not ANTHROPIC_API_KEY:
        return await api_wiki_check(term, category, letter, lang_code)

    prompt = (
        f'You are the referee in the game Stadt-Land-Fluss (City-Country-River).\n'
        f'Letter: "{letter}"\n'
        f'Category: "{category}"\n'
        f'Answer: "{term}"\n\n'
        f'Check whether the answer:\n'
        f'1. Starts with the letter "{letter}" (or is a well-known proper noun starting with it)\n'
        f'2. Clearly fits the category "{category}"\n\n'
        f'Respond ONLY with the following JSON (no markdown, no explanation outside):\n'
        f'{{"status":"correct"|"wrong"|"uncertain","definition":"One concise sentence in {lang_name} '
        f'explaining what \'{term}\' is (max 120 characters).",'
        f'"canonical":"the common English name for \'{term}\', lowercase, used only to match this answer '
        f'against the same real-world thing answered in a different language by another player '
        f'(empty string if there is no sensible canonical form, e.g. for made-up or joke answers)"}}\n\n'
        f'- correct: clearly fits\n'
        f'- wrong: does not fit or does not start with {letter}\n'
        f'- uncertain: borderline or unknown term'
    )

    def run():
        result = http_post_json_body(
            "https://api.anthropic.com/v1/messages",
            {
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            },
            {
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
        )
        text = result.get("content", [{}])[0].get("text", "").strip()
        # strip possible markdown code fence
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    try:
        parsed = await asyncio.to_thread(run)
        status = parsed.get("status", "uncertain")
        if status not in ("correct", "wrong", "uncertain"):
            status = "uncertain"
        canonical = str(parsed.get("canonical", "")).strip().lower()
        return 200, {"ok": True, "status": status, "definition": parsed.get("definition", ""), "canonical": canonical}
    except Exception as exc:
        log.warning("ai_check error: %s", exc)
        return 500, {"ok": False, "error": "ai_error"}


async def oauth_exchange_email(provider: str, code: str, redirect_uri: str) -> str:
    def run():
        if provider == "google":
            token = http_json_request("https://oauth2.googleapis.com/token", "POST", {
                "code": code,
                "client_id": OAUTH_GOOGLE_CLIENT_ID,
                "client_secret": OAUTH_GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
            access_token = token.get("access_token")
            if not access_token:
                raise ValueError("missing_access_token")
            info = http_json_request("https://openidconnect.googleapis.com/v1/userinfo", "GET", bearer=access_token)
            verified = info.get("email_verified")
            if verified not in (True, "true", "True", 1, "1"):
                raise ValueError("email_not_verified")
            email = normalize_email(info.get("email"))
            if not EMAIL_RE.match(email):
                raise ValueError("missing_email")
            return email
        if provider == "facebook":
            token_url = f"https://graph.facebook.com/{OAUTH_FACEBOOK_API_VERSION}/oauth/access_token?" + urlencode({
                "client_id": OAUTH_FACEBOOK_CLIENT_ID,
                "client_secret": OAUTH_FACEBOOK_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "code": code,
            })
            token = http_json_request(token_url, "GET")
            access_token = token.get("access_token")
            if not access_token:
                raise ValueError("missing_access_token")
            info_url = f"https://graph.facebook.com/{OAUTH_FACEBOOK_API_VERSION}/me?" + urlencode({"fields": "email", "access_token": access_token})
            info = http_json_request(info_url, "GET")
            email = normalize_email(info.get("email"))
            if not EMAIL_RE.match(email):
                raise ValueError("missing_email")
            return email
        raise ValueError("unknown_provider")
    return await asyncio.to_thread(run)


async def api_oauth_start(provider: str, query: dict, headers: Dict[str, str]):
    if not oauth_enabled(provider):
        return 403, {"ok": False, "error": "oauth_disabled", "supportEmail": AUTH_SUPPORT_EMAIL}, {}
    # mode=link: kein Login, sondern das nachträgliche Verbinden des Anbieters
    # mit dem bereits angemeldeten Konto. Der Kontoname wird im State
    # festgehalten, nicht aus dem Rücksprung übernommen — und beim Rücksprung
    # gegen die dann gültige Sitzung geprüft.
    mode = "link" if (query.get("mode") or [""])[0] == "link" else "login"
    linking_user = ""
    if mode == "link":
        linking_user = current_username(headers)
        if not linking_user:
            return 401, {"ok": False, "error": "not_authenticated"}, {}
    state = secrets.token_urlsafe(32)
    redirect_uri = oauth_redirect_uri(headers, provider)
    entry = {
        "provider": provider,
        "mode": mode,
        "username": linking_user,
        "next": sanitize_next((query.get("next") or ["/"])[0]),
        "redirectUri": redirect_uri,
        "createdAt": int(time.time()),
    }
    async with file_lock:
        states = load_json(AUTH_OAUTH_STATES_FILE, {})
        cutoff = int(time.time()) - 900
        states = {k: v for k, v in states.items() if int(v.get("createdAt") or 0) >= cutoff}
        states[state] = entry
        atomic_write_json(AUTH_OAUTH_STATES_FILE, states)
    return 302, oauth_authorize_url(provider, redirect_uri, state), {}


async def resolve_oauth_login(email: str, provider: str):
    """Findet das Konto zu einer Anbieter-Identität und legt nur im Notfall ein
    neues an. Reihenfolge:

    1. ein Konto, das diesen Anbieter ausdrücklich verknüpft hat (`oauthLinks`)
    2. das aus der Adresse abgeleitete Alt-Konto (`oauth_<hash>`), sofern der
       Anbieter dort noch eingetragen ist — Bestandskonten von vor der
       Verknüpfungsfunktion
    3. sonst ein neues Konto

    Rückgabe: (username, twofa_aktiv, blockiert)
    """
    ident = oauth_identity(provider, email)
    derived = oauth_username_from_email(email)
    now = int(time.time())
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        username = find_user_by_oauth_identity(users, provider, ident)
        if not username:
            legacy = users.get(derived)
            if isinstance(legacy, dict) and provider in (legacy.get("oauthProviders") or []):
                username = derived
        record = users.get(username) if username else None
        if not isinstance(record, dict):
            username = unique_oauth_username(users, derived)
            record = {
                "username": username,
                "displayName": display_from_email(email),
                "createdAt": now,
            }
            # Only the e-mail address received from the provider is stored; no
            # provider profile id, avatar, name or access token is persisted.
            record["email"] = email
            record["emailVerified"] = True
        if record.get("blocked"):
            return username, False, True
        links = dict(oauth_links(record))
        links[provider] = ident
        record["oauthLinks"] = links
        record["oauthProviders"] = sorted(set(record.get("oauthProviders") or []) | {provider})
        record["updatedAt"] = now
        users[username] = record
        atomic_write_json(AUTH_USERS_FILE, users)
        twofa = bool(twofa_state(record).get("enabled"))
    return username, twofa, False


async def link_oauth_provider(username: str, provider: str, email: str) -> str:
    """Verbindet einen Anbieter mit einem bestehenden Konto. Gibt "" bei Erfolg
    zurück, sonst einen Fehlerschlüssel. Eine Identität gehört immer zu genau
    einem Konto — sonst wäre nach dem Verknüpfen nicht mehr entscheidbar, in
    welches Konto ein Login gehört."""
    ident = oauth_identity(provider, email)
    derived = oauth_username_from_email(email)
    now = int(time.time())
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        record = users.get(username)
        if not isinstance(record, dict) or record.get("blocked"):
            return "session"
        if provider in (record.get("oauthProviders") or []):
            return "already"
        owner = find_user_by_oauth_identity(users, provider, ident)
        if owner and owner != username:
            return "taken"
        other = users.get(derived)
        if derived != username and isinstance(other, dict) and provider in (other.get("oauthProviders") or []):
            # Es gibt bereits ein eigenständiges Konto, das per OAuth mit dieser
            # Adresse angelegt wurde. Zwei Konten stillschweigend zusammen-
            # zuführen wäre Datenverlust — der Nutzer muss selbst entscheiden.
            return "taken"
        links = dict(oauth_links(record))
        links[provider] = ident
        record["oauthLinks"] = links
        record["oauthProviders"] = sorted(set(record.get("oauthProviders") or []) | {provider})
        record["updatedAt"] = now
        users[username] = record
        atomic_write_json(AUTH_USERS_FILE, users)
    return ""


async def create_oauth_pending(username: str) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    async with file_lock:
        pending = load_json(AUTH_OAUTH_PENDING_FILE, {})
        cutoff = now - 600
        pending = {k: v for k, v in pending.items() if int((v or {}).get("createdAt") or 0) >= cutoff}
        pending[token] = {"username": username, "createdAt": now}
        atomic_write_json(AUTH_OAUTH_PENDING_FILE, pending)
    return token


async def api_oauth_callback(provider: str, query: dict, headers: Dict[str, str]):
    state = (query.get("state") or [""])[0]
    code = (query.get("code") or [""])[0]
    if not state or not code:
        return 400, {"ok": False, "error": "oauth_missing_code", "supportEmail": AUTH_SUPPORT_EMAIL}, {}
    async with file_lock:
        states = load_json(AUTH_OAUTH_STATES_FILE, {})
        entry = states.pop(state, None)
        atomic_write_json(AUTH_OAUTH_STATES_FILE, states)
    if not entry or entry.get("provider") != provider:
        return 401, {"ok": False, "error": "oauth_invalid_state", "supportEmail": AUTH_SUPPORT_EMAIL}, {}
    if int(entry.get("createdAt") or 0) < int(time.time()) - 900:
        return 401, {"ok": False, "error": "oauth_invalid_state", "supportEmail": AUTH_SUPPORT_EMAIL}, {}
    next_url = sanitize_next(entry.get("next") or "/")
    sep = "&" if "?" in next_url else "?"
    linking = entry.get("mode") == "link"
    try:
        email = await oauth_exchange_email(provider, code, entry.get("redirectUri") or oauth_redirect_uri(headers, provider))
    except Exception as exc:
        log.warning("oauth callback failed for %s: %s", provider, exc)
        if linking:
            return 303, f"{next_url}{sep}link=failed", {}
        return 401, {"ok": False, "error": "oauth_failed", "supportEmail": AUTH_SUPPORT_EMAIL}, {}

    if linking:
        # Die Sitzung muss beim Rücksprung noch dieselbe sein wie beim Start —
        # sonst würde ein untergeschobener Rücksprung den Anbieter an ein
        # fremdes Konto hängen.
        current = current_username(headers)
        if not current or current != entry.get("username"):
            return 303, f"{next_url}{sep}link=session", {}
        problem = await link_oauth_provider(current, provider, email)
        return 303, f"{next_url}{sep}link={problem or 'ok'}", {}

    try:
        username, twofa, blocked = await resolve_oauth_login(email, provider)
    except Exception as exc:
        log.warning("oauth login failed for %s: %s", provider, exc)
        return 401, {"ok": False, "error": "oauth_failed", "supportEmail": AUTH_SUPPORT_EMAIL}, {}
    if blocked:
        return 403, {"ok": False, "error": "account_blocked", "supportEmail": AUTH_SUPPORT_EMAIL}, {}
    if twofa:
        # Konto mit zweitem Faktor: der Anbieter allein genügt nicht. Es gibt
        # noch keine Sitzung, nur einen kurzlebigen Einmal-Token, den die
        # Anmeldemaske gegen den TOTP-Code eintauscht.
        pending = await create_oauth_pending(username)
        return 303, f"{next_url}{sep}oauth2fa={quote(pending)}", {}
    token = await create_auth_session(username, headers)
    return 303, f"{next_url}{sep}login=ok", {"Set-Cookie": set_session_cookie(token, headers)}


async def api_oauth_unlink(provider: str, headers: Dict[str, str]):
    """Löst eine Verknüpfung wieder — aber nie die letzte Anmeldemöglichkeit,
    sonst sperrt sich der Nutzer selbst aus."""
    current = get_current_user(headers)
    if not current:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    username = current["username"]
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        record = users.get(username)
        if not isinstance(record, dict):
            return 401, {"ok": False, "error": "not_authenticated"}, {}
        providers = list(record.get("oauthProviders") or [])
        if provider not in providers:
            return 400, {"ok": False, "error": "oauth_not_linked"}, {}
        remaining = [x for x in providers if x != provider]
        if not record.get("password") and not remaining:
            return 400, {"ok": False, "error": "oauth_last_method"}, {}
        links = dict(oauth_links(record))
        links.pop(provider, None)
        record["oauthLinks"] = links
        record["oauthProviders"] = remaining
        record["updatedAt"] = int(time.time())
        users[username] = record
        atomic_write_json(AUTH_USERS_FILE, users)
        result = public_user(record)
    return 200, {"ok": True, "authenticated": True, "user": result}, {}


async def api_oauth_2fa(body: dict, headers: Dict[str, str]):
    """Zweiter Schritt einer OAuth-Anmeldung an einem Konto mit 2FA."""
    token = str(body.get("token") or "")
    code = str(body.get("totp") or "")
    if not token or not code:
        return 400, {"ok": False, "error": "totp_required"}, {}
    now = int(time.time())
    async with file_lock:
        pending = load_json(AUTH_OAUTH_PENDING_FILE, {})
        entry = pending.get(token)
        if not entry or int(entry.get("createdAt") or 0) < now - 600:
            pending.pop(token, None)
            atomic_write_json(AUTH_OAUTH_PENDING_FILE, pending)
            return 401, {"ok": False, "error": "oauth_2fa_expired"}, {}
        username = entry.get("username") or ""
        users = load_json(AUTH_USERS_FILE, {})
        record = users.get(username)
        if not isinstance(record, dict) or record.get("blocked"):
            pending.pop(token, None)
            atomic_write_json(AUTH_OAUTH_PENDING_FILE, pending)
            return 403, {"ok": False, "error": "account_blocked"}, {}
        if rate_limited(f"totp:{username}", limit=10, window=60):
            return 429, {"ok": False, "error": "rate_limited"}, {}
        if not totp_verify(twofa_state(record).get("secret") or "", code):
            # Token bewusst stehen lassen: Vertippen darf den Anlauf nicht
            # verbrennen. Gegen Raten schützt die Ratenbremse oben.
            return 401, {"ok": False, "error": "totp_invalid"}, {}
        pending.pop(token, None)
        atomic_write_json(AUTH_OAUTH_PENDING_FILE, pending)
        result = public_user(record)
    session = await create_auth_session(username, headers)
    return 200, {"ok": True, "authenticated": True, "user": result}, {"Set-Cookie": set_session_cookie(session, headers)}


def cleanup_auth_sessions(sessions: dict) -> dict:
    now = int(time.time())
    return {k: v for k, v in (sessions or {}).items() if int(v.get("expiresAt") or 0) > now}


def get_current_user(headers: Dict[str, str]):
    token = parse_cookies(headers).get(AUTH_COOKIE_NAME)
    if not token:
        return None
    sessions = cleanup_auth_sessions(load_json(AUTH_SESSIONS_FILE, {}))
    sess = sessions.get(token)
    if not sess:
        return None
    users = load_json(AUTH_USERS_FILE, {})
    record = users.get(sess.get("username"))
    if not record or record.get("blocked"):
        return None
    return public_user(record)


async def api_auth_me(headers: Dict[str, str]):
    user = attach_projects(get_current_user(headers))
    return {
        "ok": True,
        "authenticated": bool(user),
        "user": user,
        "supportEmail": AUTH_SUPPORT_EMAIL,
        "oauth": {"google": oauth_enabled("google"), "facebook": oauth_enabled("facebook")},
    }


async def create_auth_session(username: str, headers: Dict[str, str]):
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    async with file_lock:
        sessions = cleanup_auth_sessions(load_json(AUTH_SESSIONS_FILE, {}))
        sessions[token] = {"username": username, "createdAt": now, "expiresAt": now + AUTH_SESSION_MAX_AGE}
        atomic_write_json(AUTH_SESSIONS_FILE, sessions)
    return token


async def api_auth_register(body: dict, headers: Dict[str, str]):
    if not AUTH_REGISTRATION_ENABLED:
        return 403, {"ok": False, "error": "registration_disabled"}, {}
    username = normalize_username(body.get("username"))
    password = str(body.get("password") or "")
    display = clean_text(body.get("displayName") or username, 40)
    if not USERNAME_RE.match(username):
        return 400, {"ok": False, "error": "invalid_username"}, {}
    if len(password) < 8:
        return 400, {"ok": False, "error": "password_too_short"}, {}
    now = int(time.time())
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        if username in users:
            return 409, {"ok": False, "error": "user_exists"}, {}
        users[username] = {
            "username": username,
            "displayName": display,
            "password": password_hash(password),
            "createdAt": now,
        }
        ensure_admin_record(users[username])   # Allowlist → Admin (setzt role/caps/Anzeigename)
        ensure_ai_record(users[username])       # KI-Allowlist → caps.ai
        atomic_write_json(AUTH_USERS_FILE, users)
    token = await create_auth_session(username, headers)
    return 201, {"ok": True, "authenticated": True, "user": public_user(load_json(AUTH_USERS_FILE, {})[username])}, {"Set-Cookie": set_session_cookie(token, headers)}


async def api_auth_login(body: dict, headers: Dict[str, str]):
    username = normalize_username(body.get("username"))
    password = str(body.get("password") or "")
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        record = users.get(username)
        # Keep the error deliberately generic.
        if not record or not verify_password(password, record.get("password") or {}):
            return 401, {"ok": False, "error": "invalid_login"}, {}
        if record.get("blocked"):
            return 403, {"ok": False, "error": "account_blocked"}, {}
        # 2FA: Ist sie für das Konto aktiviert, verlangt der Login zusätzlich
        # den 6-stelligen Einmalcode (Feld "totp"). totp_required signalisiert
        # dem Frontend, das Code-Feld nachzureichen.
        twofa = twofa_state(record)
        if twofa.get("enabled"):
            code = str(body.get("totp") or "")
            if not code:
                return 401, {"ok": False, "error": "totp_required"}, {}
            if rate_limited(f"totp:{username}", limit=10, window=60):
                return 429, {"ok": False, "error": "rate_limited"}, {}
            if not totp_verify(twofa.get("secret") or "", code):
                return 401, {"ok": False, "error": "totp_invalid"}, {}
        changed = ensure_admin_record(record)   # Allowlist → Admin beim Login persistieren
        changed = ensure_ai_record(record) or changed
        # Transparentes Re-Hashing: weicht der gespeicherte Hash von der
        # konfigurierten Iterationszahl (oder dem Algorithmus) ab, wird er beim
        # erfolgreichen Login mit dem gerade verifizierten Passwort erneuert —
        # so wandern Bestandskonten ohne Zutun auf stärkere Parameter.
        stored_pw = record.get("password") or {}
        if (int(stored_pw.get("iterations") or 0) != AUTH_PBKDF2_ITERATIONS
                or stored_pw.get("algo") != "pbkdf2_sha256"):
            record["password"] = password_hash(password)
            changed = True
        if changed:
            atomic_write_json(AUTH_USERS_FILE, users)
    token = await create_auth_session(username, headers)
    return 200, {"ok": True, "authenticated": True, "user": public_user(record)}, {"Set-Cookie": set_session_cookie(token, headers)}


# ── 2FA-Verwaltung (Setup → Bestätigen → optional Deaktivieren) ─────────────
async def api_auth_2fa_setup(headers: Dict[str, str]):
    """Erzeugt ein neues (noch inaktives) Secret. Aktiv wird es erst, wenn der
    Nutzer es per /enable mit einem gültigen Code bestätigt."""
    current = get_current_user(headers)
    if not current:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    secret = totp_new_secret()
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        record = users.get(current["username"])
        if not record:
            return 401, {"ok": False, "error": "not_authenticated"}, {}
        twofa = record.setdefault("twofa", {})
        twofa["pendingSecret"] = secret
        atomic_write_json(AUTH_USERS_FILE, users)
    label = quote(f"brettspiele.fun:{current['username']}")
    otpauth = f"otpauth://totp/{label}?secret={secret}&issuer=brettspiele.fun&digits=6&period=30"
    try:
        qr = qr_svg(otpauth)
    except Exception as exc:  # QR ist Komfort — Secret/Link funktionieren immer
        log.warning("2fa qr failed: %s", exc)
        qr = ""
    return 200, {"ok": True, "secret": secret, "otpauth": otpauth, "qrSvg": qr}, {}


async def api_auth_2fa_enable(body: dict, headers: Dict[str, str]):
    current = get_current_user(headers)
    if not current:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    if rate_limited(f"2fa-enable:{current['username']}", limit=10, window=60):
        return 429, {"ok": False, "error": "rate_limited"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        record = users.get(current["username"])
        pending = twofa_state(record or {}).get("pendingSecret") if record else None
        if not pending:
            return 400, {"ok": False, "error": "no_pending_setup"}, {}
        if not totp_verify(pending, body.get("code")):
            return 400, {"ok": False, "error": "totp_invalid"}, {}
        record["twofa"] = {"secret": pending, "enabled": True, "enabledAt": int(time.time())}
        atomic_write_json(AUTH_USERS_FILE, users)
    return 200, {"ok": True, "user": public_user(record)}, {}


async def api_auth_2fa_disable(body: dict, headers: Dict[str, str]):
    current = get_current_user(headers)
    if not current:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    if rate_limited(f"2fa-disable:{current['username']}", limit=10, window=60):
        return 429, {"ok": False, "error": "rate_limited"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        record = users.get(current["username"])
        twofa = twofa_state(record or {}) if record else {}
        if not twofa.get("enabled"):
            return 400, {"ok": False, "error": "not_enabled"}, {}
        if not totp_verify(twofa.get("secret") or "", body.get("code")):
            return 400, {"ok": False, "error": "totp_invalid"}, {}
        record.pop("twofa", None)
        atomic_write_json(AUTH_USERS_FILE, users)
    return 200, {"ok": True, "user": public_user(record)}, {}


async def api_auth_logout(headers: Dict[str, str]):
    token = parse_cookies(headers).get(AUTH_COOKIE_NAME)
    if token:
        async with file_lock:
            sessions = cleanup_auth_sessions(load_json(AUTH_SESSIONS_FILE, {}))
            sessions.pop(token, None)
            atomic_write_json(AUTH_SESSIONS_FILE, sessions)
    return 200, {"ok": True, "authenticated": False, "user": None}, {"Set-Cookie": clear_session_cookie(headers)}


async def api_auth_profile(body: dict, headers: Dict[str, str]):
    current = get_current_user(headers)
    if not current:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    display = clean_text(body.get("displayName") or current["username"], 40)
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        if current["username"] in users:
            users[current["username"]]["displayName"] = display
            ensure_admin_record(users[current["username"]])   # Admin-Anzeigename bleibt fest
            atomic_write_json(AUTH_USERS_FILE, users)
    return 200, {"ok": True, "authenticated": True, "user": public_user(load_json(AUTH_USERS_FILE, {})[current["username"]])}, {}


# ── Admin-API: Rollen/Rechte verwalten (nur für Admins) ─────────────────────
def current_admin(headers: Dict[str, str]):
    user = get_current_user(headers)
    if not user or not user.get("isAdmin"):
        return None
    # 2FA-Pflicht: Admin-API erst nutzbar, wenn 2FA hinterlegt ist.
    if user.get("twofaRequired"):
        return None
    return user


def _admin_user_row(rec: dict) -> dict:
    pu = public_user(rec)
    return {
        "username": pu["username"], "displayName": pu["displayName"],
        "role": pu["role"], "creator": pu["caps"]["creator"], "ai": pu["caps"]["ai"],
        "site": pu["caps"]["site"],
        "aiLinked": pu["aiLinked"],
        "blocked": bool(rec.get("blocked")), "hasEmail": pu["hasEmail"],
        "createdAt": pu["createdAt"],
        # Für Admin-Aktionen: 2FA-Status + ob überhaupt ein Passwort gesetzt ist.
        "twofa": bool(twofa_state(rec).get("enabled")),
        "hasPassword": bool(rec.get("password")),
    }


def _drop_user_sessions(sessions: dict, username: str) -> int:
    tokens = [t for t, s in sessions.items() if (s or {}).get("username") == username]
    for t in tokens:
        sessions.pop(t, None)
    return len(tokens)


async def api_admin_users(headers: Dict[str, str], query: dict = None):
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    q = str(((query or {}).get("q") or [""])[0]).strip().lower()
    users = load_json(AUTH_USERS_FILE, {})
    items = [_admin_user_row(rec) for rec in users.values()]
    if q:
        items = [it for it in items if q in it["username"].lower() or q in (it["displayName"] or "").lower()]
    items.sort(key=lambda x: x["createdAt"])
    return 200, {"ok": True, "users": items, "count": len(items)}, {}


async def api_admin_set_creator(body: dict, headers: Dict[str, str]):
    """Admin vergibt/entzieht das Recht, eigene Spiele zu erstellen."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    grant = bool(body.get("creator"))
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        caps = rec.get("caps")
        if not isinstance(caps, dict):
            caps = {}
            rec["caps"] = caps
        caps["creator"] = grant
        if grant:
            rec.pop("creatorRequest", None)   # erledigter Antrag
        atomic_write_json(AUTH_USERS_FILE, users)
        pu = public_user(rec)
    return 200, {"ok": True, "user": {
        "username": pu["username"], "displayName": pu["displayName"],
        "role": pu["role"], "creator": pu["caps"]["creator"],
    }}, {}


async def api_creator_request(body: dict, headers: Dict[str, str]):
    """Eingeloggter Nutzer beantragt das Ersteller-Recht (optional mit Begründung)."""
    user = get_current_user(headers)
    if not user:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    if user.get("caps", {}).get("creator"):
        return 200, {"ok": True, "requested": False, "alreadyCreator": True}, {}
    message = clean_text(body.get("message") or "", 500)
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(user["username"])
        if not rec:
            return 401, {"ok": False, "error": "not_authenticated"}, {}
        rec["creatorRequest"] = {"message": message, "createdAt": int(time.time())}
        atomic_write_json(AUTH_USERS_FILE, users)
    return 200, {"ok": True, "requested": True}, {}


async def api_creator_cancel(headers: Dict[str, str]):
    user = get_current_user(headers)
    if not user:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(user["username"])
        if rec and rec.pop("creatorRequest", None) is not None:
            atomic_write_json(AUTH_USERS_FILE, users)
    return 200, {"ok": True, "requested": False}, {}


async def api_admin_creator_requests(headers: Dict[str, str]):
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    users = load_json(AUTH_USERS_FILE, {})
    items = []
    for rec in users.values():
        req = rec.get("creatorRequest")
        if not isinstance(req, dict):
            continue
        pu = public_user(rec)
        if pu["caps"]["creator"]:
            continue   # bereits Ersteller → kein offener Antrag
        items.append({
            "username": pu["username"], "displayName": pu["displayName"],
            "message": clean_text(req.get("message") or "", 500),
            "createdAt": int(req.get("createdAt") or 0),
        })
    items.sort(key=lambda x: x["createdAt"])
    return 200, {"ok": True, "requests": items, "count": len(items)}, {}


async def api_admin_resolve_creator_request(body: dict, headers: Dict[str, str]):
    """Admin gibt einen Antrag frei (approve → caps.creator) oder lehnt ab."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    approve = bool(body.get("approve"))
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        rec.pop("creatorRequest", None)
        if approve:
            caps = rec.get("caps")
            if not isinstance(caps, dict):
                caps = {}
                rec["caps"] = caps
            caps["creator"] = True
        atomic_write_json(AUTH_USERS_FILE, users)
        row = _admin_user_row(rec)
    return 200, {"ok": True, "approved": approve, "user": row}, {}


async def api_admin_set_site(body: dict, headers: Dict[str, str]):
    """Admin vergibt/entzieht das Recht, im Terminal die ganze Seite zu
    bearbeiten und site-weit zu deployen (caps.site). Das ist die weitreichendste
    Fähigkeit unterhalb von Admin — wer sie hat, kann jeden ausgelieferten
    Inhalt der Seite ändern."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    grant = bool(body.get("site"))
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        caps = rec.get("caps")
        if not isinstance(caps, dict):
            caps = {}
            rec["caps"] = caps
        caps["site"] = grant
        atomic_write_json(AUTH_USERS_FILE, users)
        row = _admin_user_row(rec)
    log.info("admin set-site %s=%s", target, grant)
    return 200, {"ok": True, "user": row}, {}


async def api_admin_set_ai(body: dict, headers: Dict[str, str]):
    """Admin vergibt/entzieht das Recht, Spiele per KI zu erstellen (caps.ai)."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    grant = bool(body.get("ai"))
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        caps = rec.get("caps")
        if not isinstance(caps, dict):
            caps = {}
            rec["caps"] = caps
        caps["ai"] = grant
        atomic_write_json(AUTH_USERS_FILE, users)
        row = _admin_user_row(rec)
    return 200, {"ok": True, "user": row}, {}


# ── Spiel-Projekte (Besitz + Admin-Freigaben fürs /code-Terminal) ───────────
def _normalize_project(entry: dict) -> dict:
    grants = entry.get("grants") if isinstance(entry.get("grants"), list) else []
    return {
        "owner": normalize_username(entry.get("owner")),
        "ownerDisplay": clean_text(entry.get("ownerDisplay") or "", 64),
        "grants": sorted({normalize_username(g) for g in grants if normalize_username(g)}),
        "community": bool(entry.get("community")),
        "createdAt": int(entry.get("createdAt") or 0),
        # Rechte-Zusicherung des zuletzt Veröffentlichenden. Bei jedem echten
        # Deploy neu gesetzt — der Inhalt von heute ist nicht der, den jemand
        # vor Wochen zugesichert hat.
        "termsAcceptedAt": int(entry.get("termsAcceptedAt") or 0),
        "termsVersion": clean_text(entry.get("termsVersion") or "", 32),
        "termsAcceptedBy": normalize_username(entry.get("termsAcceptedBy")),
    }


def load_projects() -> dict:
    raw = load_json(AUTH_PROJECTS_FILE, {})
    return {slug: _normalize_project(entry) for slug, entry in raw.items()
            if PROJECT_SLUG_RE.match(str(slug)) and isinstance(entry, dict)}


def user_project_slugs(projects: dict, username: str) -> list:
    """Slugs, die dem Nutzer gehören oder ihm vom Admin freigegeben wurden."""
    username = normalize_username(username)
    return sorted(slug for slug, p in projects.items()
                  if p["owner"] == username or username in p["grants"])


def attach_projects(user: dict) -> dict:
    """Hängt die Projektlisten an ein /api/me-Nutzerobjekt (nur für Nutzer, die
    das Terminal/Studio nutzen dürfen — andere brauchen die Daten nicht)."""
    caps = user.get("caps", {}) if user else {}
    if not user or not (user.get("isAdmin") or caps.get("ai") or caps.get("creator")):
        return user
    projects = load_projects()
    mine = user_project_slugs(projects, user["username"])
    user["projects"] = mine
    # Bereits vergebene (fremde) Slugs: das Terminal unterscheidet damit
    # "unbeansprucht" (deploybar, wird beim Deploy übernommen) von "fremd".
    user["projectsOther"] = sorted(set(projects.keys()) - set(mine))
    return user


async def api_projects_claim(body: dict, headers: Dict[str, str]):
    """Nutzer (Terminal-berechtigt) beansprucht ein noch unregistriertes Spiel.
    Wird vom /code-Terminal beim ersten Deploy eines neuen Spiels aufgerufen."""
    user = current_ai_user(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    slug = str(body.get("slug") or "").strip().lower()
    if not PROJECT_SLUG_RE.match(slug) or slug in ("all", "site"):
        # "all"/"site" sind Schlüsselwörter der Deploy-/Reset-Dropdowns.
        return 400, {"ok": False, "error": "invalid_slug"}, {}
    async with file_lock:
        projects = load_projects()
        existing = projects.get(slug)
        if existing:
            if existing["owner"] == user["username"] or user["username"] in existing["grants"]:
                return 200, {"ok": True, "slug": slug, "project": existing, "alreadyOwned": True}, {}
            return 409, {"ok": False, "error": "already_claimed"}, {}
        # Bestehende Live-Spiele (unregistriert) sind Site-Spiele — nicht
        # übernehmbar. Admins können sie in /admin/ explizit zuordnen.
        if not user.get("isAdmin") and (WEB_ROOT_DIR / "games" / slug).is_dir():
            return 409, {"ok": False, "error": "site_game"}, {}
        projects[slug] = {
            "owner": user["username"],
            "ownerDisplay": user.get("displayName") or user["username"],
            "grants": [],
            # Spiele von Nicht-Admins sind Community-Spiele (Katalog-Trennung).
            "community": not user.get("isAdmin"),
            "createdAt": int(time.time()),
        }
        atomic_write_json(AUTH_PROJECTS_FILE, projects)
        log.info("project claimed: %s by %s", slug, user["username"])
    return 200, {"ok": True, "slug": slug, "project": projects[slug]}, {}


async def api_admin_projects(headers: Dict[str, str]):
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    projects = load_projects()
    games_root = WEB_ROOT_DIR / "games"
    items = []
    seen = set()
    for slug, p in sorted(projects.items()):
        items.append({"slug": slug, **p,
                      "live": (games_root / slug).is_dir(), "unregistered": False})
        seen.add(slug)
    # ALLE live vorhandenen Spielverzeichnisse ergänzen, die (noch) nicht in der
    # Registry stehen — damit jedes bereits erstellte Spiel in der Konsole
    # auftaucht und zugeordnet werden kann.
    try:
        for entry in sorted(games_root.iterdir()):
            name = entry.name
            if name not in seen and entry.is_dir() and PROJECT_SLUG_RE.match(name):
                items.append({"slug": name, "owner": "", "ownerDisplay": "", "grants": [],
                              "community": False, "live": True, "unregistered": True})
    except OSError:
        pass
    return 200, {"ok": True, "projects": items, "count": len(items)}, {}


async def api_admin_project_set_owner(body: dict, headers: Dict[str, str]):
    """Admin registriert ein Projekt bzw. überträgt den Besitz."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    slug = str(body.get("slug") or "").strip().lower()
    target = normalize_username(body.get("username"))
    if not PROJECT_SLUG_RE.match(slug):
        return 400, {"ok": False, "error": "invalid_slug"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        projects = load_projects()
        entry = projects.get(slug) or {"grants": [], "createdAt": int(time.time())}
        entry["owner"] = target
        entry["ownerDisplay"] = rec.get("displayName") or target
        entry["community"] = not (public_user(rec).get("isAdmin"))
        projects[slug] = _normalize_project(entry)
        atomic_write_json(AUTH_PROJECTS_FILE, projects)
    return 200, {"ok": True, "slug": slug, "project": projects[slug]}, {}


async def api_projects_grant(body: dict, headers: Dict[str, str]):
    """Der BESITZER eines Spiels gibt einem anderen Konto Zugriff darauf.

    Bisher konnte das nur ein Admin — wer sein Spiel zu zweit bauen wollte,
    musste jedes Mal nachfragen. Der Besitzer darf jetzt selbst, aber bewusst
    NUR das: Freigaben hinzufügen und entziehen. Den Besitzer wechseln, das
    Community-Flag setzen oder die Registrierung löschen bleibt beim Admin —
    das sind Entscheidungen über die Seite, nicht über das eigene Spiel.

    Wer eine Freigabe hat, darf das Spiel im Terminal öffnen, ändern und
    deployen — also live stellen. Entsprechend deutlich ist die Rückfrage in
    der Oberfläche.
    """
    user = current_ai_user(headers)          # Terminal-Recht + 2FA vorausgesetzt
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    slug = str(body.get("slug") or "").strip().lower()
    target = normalize_username(body.get("username"))
    grant = bool(body.get("grant"))
    if not PROJECT_SLUG_RE.match(slug) or slug in ("all", "site"):
        return 400, {"ok": False, "error": "invalid_slug"}, {}
    if not target:
        return 400, {"ok": False, "error": "invalid_user"}, {}
    async with file_lock:
        projects = load_projects()
        entry = projects.get(slug)
        if not entry:
            return 404, {"ok": False, "error": "project_not_found"}, {}
        if entry["owner"] != user["username"] and not user.get("isAdmin"):
            return 403, {"ok": False, "error": "not_owner"}, {}
        if target == entry["owner"]:
            # Der Besitzer braucht keine Freigabe für sein eigenes Spiel; das
            # zuzulassen würde nur eine Zeile erzeugen, die nichts bewirkt.
            return 400, {"ok": False, "error": "is_owner"}, {}
        if grant:
            users = load_json(AUTH_USERS_FILE, {})
            rec = users.get(target)
            if not rec:
                return 404, {"ok": False, "error": "user_not_found"}, {}
            if rec.get("blocked"):
                return 409, {"ok": False, "error": "user_blocked"}, {}
            # Ohne Terminal-Recht könnte der Freigegebene gar nichts damit
            # anfangen — das lieber sagen als eine wirkungslose Freigabe anlegen.
            pub = public_user(rec)
            if not (pub["isAdmin"] or pub["caps"]["ai"] or pub["caps"]["creator"]):
                return 409, {"ok": False, "error": "user_without_terminal"}, {}
            if target not in entry["grants"]:
                entry["grants"].append(target)
        else:
            entry["grants"] = [g for g in entry["grants"] if g != target]
        projects[slug] = _normalize_project(entry)
        atomic_write_json(AUTH_PROJECTS_FILE, projects)
    log.info("project grant %s %s=%s by %s", slug, target, grant, user["username"])
    return 200, {"ok": True, "slug": slug, "project": projects[slug]}, {}


async def api_projects_accept_terms(body: dict, headers: Dict[str, str]):
    """Rechte-Zusicherung für ein im Terminal gebautes Spiel festhalten.

    Wird vom /code-Terminal vor jedem echten Deploy gerufen — das ist der
    Zeitpunkt, an dem Inhalt öffentlich wird und fremde Rechte zum Problem des
    Anbieters werden können. Zusichern muss, wer veröffentlicht: Besitzer wie
    Freigegebene, jeweils für den Stand, den sie gerade live stellen.
    """
    user = current_ai_user(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    if not body.get("terms"):
        return 400, {"ok": False, "error": "terms_required", "termsVersion": TERMS_VERSION}, {}
    slug = str(body.get("slug") or "").strip().lower()
    if not PROJECT_SLUG_RE.match(slug) or slug in ("all", "site"):
        return 400, {"ok": False, "error": "invalid_slug"}, {}
    async with file_lock:
        projects = load_projects()
        entry = projects.get(slug)
        if not entry:
            return 404, {"ok": False, "error": "project_not_found"}, {}
        if not user.get("isAdmin") and user["username"] != entry["owner"] \
                and user["username"] not in entry["grants"]:
            return 403, {"ok": False, "error": "no_access"}, {}
        entry["termsAcceptedAt"] = int(time.time())
        entry["termsVersion"] = TERMS_VERSION
        entry["termsAcceptedBy"] = user["username"]
        projects[slug] = _normalize_project(entry)
        atomic_write_json(AUTH_PROJECTS_FILE, projects)
    log.info("project terms accepted: %s by %s", slug, user["username"])
    return 200, {"ok": True, "slug": slug, "project": projects[slug]}, {}


async def api_projects_mine(headers: Dict[str, str]):
    """Eigene Projekte mit ihren Freigaben — Grundlage der Freigabe-Oberfläche
    im Terminal. Anzeigenamen mitliefern, damit dort nicht nur Kontonamen stehen."""
    user = current_ai_user(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    projects = load_projects()
    users = load_json(AUTH_USERS_FILE, {})

    def label(name):
        rec = users.get(name)
        return (rec.get("displayName") or name) if rec else name

    rows = []
    for slug, entry in sorted(projects.items()):
        if entry["owner"] != user["username"] and not user.get("isAdmin"):
            continue
        rows.append({
            "slug": slug,
            "owner": entry["owner"],
            "grants": [{"username": g, "displayName": label(g)} for g in entry["grants"]],
        })
    return 200, {"ok": True, "projects": rows}, {}


async def api_admin_project_grant(body: dict, headers: Dict[str, str]):
    """Admin gibt einem Nutzer Zugriff auf ein fremdes Projekt (oder entzieht ihn)."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    slug = str(body.get("slug") or "").strip().lower()
    target = normalize_username(body.get("username"))
    grant = bool(body.get("grant"))
    if not PROJECT_SLUG_RE.match(slug):
        return 400, {"ok": False, "error": "invalid_slug"}, {}
    async with file_lock:
        projects = load_projects()
        entry = projects.get(slug)
        if not entry:
            return 404, {"ok": False, "error": "project_not_found"}, {}
        if grant:
            if target not in load_json(AUTH_USERS_FILE, {}):
                return 404, {"ok": False, "error": "user_not_found"}, {}
            if target and target not in entry["grants"]:
                entry["grants"].append(target)
        else:
            entry["grants"] = [g for g in entry["grants"] if g != target]
        projects[slug] = _normalize_project(entry)
        atomic_write_json(AUTH_PROJECTS_FILE, projects)
    return 200, {"ok": True, "slug": slug, "project": projects[slug]}, {}


async def api_admin_project_community(body: dict, headers: Dict[str, str]):
    """Admin schaltet das Community-Flag (Katalog-Sektion) eines Spiels um."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    slug = str(body.get("slug") or "").strip().lower()
    if not PROJECT_SLUG_RE.match(slug):
        return 400, {"ok": False, "error": "invalid_slug"}, {}
    async with file_lock:
        projects = load_projects()
        entry = projects.get(slug)
        if not entry:
            return 404, {"ok": False, "error": "project_not_found"}, {}
        entry["community"] = bool(body.get("community"))
        projects[slug] = _normalize_project(entry)
        atomic_write_json(AUTH_PROJECTS_FILE, projects)
    return 200, {"ok": True, "slug": slug, "project": projects[slug]}, {}


async def api_admin_project_delete(body: dict, headers: Dict[str, str]):
    """Admin entfernt einen Registry-Eintrag (löscht KEINE Spieldateien)."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    slug = str(body.get("slug") or "").strip().lower()
    async with file_lock:
        projects = load_projects()
        if projects.pop(slug, None) is None:
            return 404, {"ok": False, "error": "project_not_found"}, {}
        atomic_write_json(AUTH_PROJECTS_FILE, projects)
    return 200, {"ok": True, "deleted": slug}, {}


# ── KI-Spielerstellung (Studio) ─────────────────────────────────────────────
def current_ai_user(headers: Dict[str, str]):
    """Aktueller Nutzer, falls er die KI-Fähigkeit hat (Allowlist/Admin/vergeben).
    2FA-Pflicht: KI-Funktionen erst nutzbar, wenn 2FA hinterlegt ist."""
    user = get_current_user(headers)
    if user and (user.get("caps", {}).get("ai") or user.get("isAdmin")):
        if user.get("twofaRequired"):
            return None
        return user
    return None


# ── Verschlüsselung-at-rest für Nutzer-API-Keys ─────────────────────────────
# Reine stdlib (keine externen Abhängigkeiten): Encrypt-then-MAC mit HMAC-SHA256
# als CTR-Stromchiffre. Master-Secret aus BRETTSPIELE_SECRET_KEY (Env) oder einer
# einmalig erzeugten, persistenten Schlüsseldatei im Auth-Verzeichnis (chmod 600).
_secret_cache = {"key": None}


def _secret_key() -> bytes:
    if _secret_cache["key"] is not None:
        return _secret_cache["key"]
    env = os.environ.get("BRETTSPIELE_SECRET_KEY", "").strip()
    if env:
        _secret_cache["key"] = hashlib.sha256(env.encode("utf-8")).digest()
        return _secret_cache["key"]
    path = AUTH_DIR / "secret.key"
    key = None
    try:
        if path.exists():
            key = base64.b64decode(path.read_text().strip())
    except Exception:
        key = None
    if not key or len(key) != 32:
        key = secrets.token_bytes(32)
        try:
            AUTH_DIR.mkdir(parents=True, exist_ok=True)
            path.write_text(base64.b64encode(key).decode("ascii"))
            try:
                os.chmod(path, 0o600)
            except Exception:
                pass
        except Exception:
            pass
    _secret_cache["key"] = key
    return key


def _derive(master: bytes, label: bytes) -> bytes:
    return hmac.new(master, label, hashlib.sha256).digest()


def _keystream(enc_key: bytes, nonce: bytes, n: int) -> bytes:
    out = bytearray()
    ctr = 0
    while len(out) < n:
        out += hmac.new(enc_key, nonce + ctr.to_bytes(8, "big"), hashlib.sha256).digest()
        ctr += 1
    return bytes(out[:n])


def encrypt_secret(plaintext: str) -> str:
    master = _secret_key()
    ek, mk = _derive(master, b"enc"), _derive(master, b"mac")
    nonce = secrets.token_bytes(16)
    pt = plaintext.encode("utf-8")
    ks = _keystream(ek, nonce, len(pt))
    ct = bytes(a ^ b for a, b in zip(pt, ks))
    tag = hmac.new(mk, nonce + ct, hashlib.sha256).digest()
    return "v1:" + base64.b64encode(nonce + ct + tag).decode("ascii")


def decrypt_secret(token: str):
    if not isinstance(token, str) or not token.startswith("v1:"):
        return None
    try:
        raw = base64.b64decode(token[3:])
        nonce, body = raw[:16], raw[16:]
        ct, tag = body[:-32], body[-32:]
        master = _secret_key()
        ek, mk = _derive(master, b"enc"), _derive(master, b"mac")
        if not hmac.compare_digest(tag, hmac.new(mk, nonce + ct, hashlib.sha256).digest()):
            return None
        return bytes(a ^ b for a, b in zip(ct, _keystream(ek, nonce, len(ct)))).decode("utf-8")
    except Exception:
        return None


def read_anthropic_key(record: dict):
    """Klartext-Key aus dem Datensatz lesen — entschlüsselt (v1:) oder, für
    Altbestände, als bereits gespeicherter Klartext (sk-ant-…)."""
    stored = (record or {}).get("anthropicKey")
    if not stored:
        return None
    if stored.startswith("v1:"):
        return decrypt_secret(stored)
    if stored.startswith("sk-ant-"):
        return stored   # Legacy-Klartext (wird beim nächsten Verknüpfen ersetzt)
    return None


async def api_ai_link(body: dict, headers: Dict[str, str]):
    """Nutzer verknüpft seinen EIGENEN Anthropic-API-Key. Der Key wird server-
    seitig gespeichert und NIE an den Client zurückgegeben."""
    user = current_ai_user(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    key = str(body.get("apiKey") or "").strip()
    if not (key.startswith("sk-ant-") and 20 <= len(key) <= 300):
        return 400, {"ok": False, "error": "invalid_key"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(user["username"])
        if not rec:
            return 401, {"ok": False, "error": "not_authenticated"}, {}
        rec["anthropicKey"] = encrypt_secret(key)   # verschlüsselt at rest
        atomic_write_json(AUTH_USERS_FILE, users)
    return 200, {"ok": True, "aiLinked": True}, {}


async def api_ai_unlink(headers: Dict[str, str]):
    user = get_current_user(headers)
    if not user:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(user["username"])
        if rec and rec.pop("anthropicKey", None) is not None:
            atomic_write_json(AUTH_USERS_FILE, users)
    return 200, {"ok": True, "aiLinked": False}, {}


_AI_GAME_SCHEMA_HINT = (
    'Return ONLY minified JSON, no markdown, matching exactly this shape:\n'
    '{"title":string,"board":{"w":int 400..1400,"h":int 300..900,"bg":"#rrggbb","grid":bool},'
    '"pieceTypes":[{"id":short-string,"emoji":one emoji or "","color":"#rrggbb"}],'
    '"pieces":[{"typeId":matches a pieceTypes id,"x":int within board,"y":int within board,"rot":0,"flipped":false}]}\n'
    'Rules: 1-8 pieceTypes; 0-60 pieces; every piece.typeId MUST equal one of the pieceTypes ids; '
    'coordinates are pixels from the top-left of the board and must lie inside it; '
    'prefer emoji tokens; keep it a physical tabletop setup (no rules text).'
)


def _sanitize_ai_game(g: dict, keep_ids: bool = False) -> dict:
    """Roh-JSON (KI-Antwort oder Client-Upload) in eine sichere Studio-Definition
    zwingen. Mit keep_ids=True bleiben gültige Client-IDs erhalten — der
    Server-Speicher braucht das, damit Live-Sync-Ops (move/xform/remove) nach
    dem Laden weiter auf die richtigen Figuren zeigen."""
    def clampi(v, lo, hi, d):
        try:
            return max(lo, min(hi, int(v)))
        except Exception:
            return d
    def hexcol(v, d):
        v = str(v or "")
        return v if re.match(r'^#[0-9a-fA-F]{6}$', v) else d
    seen_ids = set()
    def part_id(v):
        v = str(v or "")
        if keep_ids and STUDIO_PART_ID_RE.match(v) and v not in seen_ids:
            seen_ids.add(v)
            return v
        nid = secrets.token_hex(4)
        seen_ids.add(nid)
        return nid
    board = g.get("board") if isinstance(g.get("board"), dict) else {}
    # Grenzen = Editor-Grenzen (Inputs bw/bh im Studio), damit legitime Bretter
    # beim Server-Speichern nicht gestaucht werden.
    bw = clampi(board.get("w"), 300, 2000, 900)
    bh = clampi(board.get("h"), 200, 1600, 620)
    out_types, id_map = [], {}
    for t in (g.get("pieceTypes") or [])[:8]:
        if not isinstance(t, dict):
            continue
        nid = part_id(t.get("id"))
        id_map[str(t.get("id"))] = nid
        emoji = str(t.get("emoji") or "")[:4]
        out_types.append({"id": nid, "emoji": emoji, "color": hexcol(t.get("color"), "#d4a84f")})
    if not out_types:
        out_types = [{"id": secrets.token_hex(3), "emoji": "♟", "color": "#d4a84f"}]
        id_map = {}
    default_tid = out_types[0]["id"]
    out_pieces = []
    for p in (g.get("pieces") or [])[:60]:
        if not isinstance(p, dict):
            continue
        tid = id_map.get(str(p.get("typeId")), default_tid)
        out_pieces.append({
            "id": part_id(p.get("id")), "typeId": tid,
            "x": clampi(p.get("x"), 0, bw - 10, bw // 2),
            "y": clampi(p.get("y"), 0, bh - 10, bh // 2),
            "rot": clampi(p.get("rot"), 0, 359, 0),
            "flipped": bool(p.get("flipped")),
        })
    return {
        "version": 1,
        "title": clean_text(g.get("title") or ("" if keep_ids else "KI-Spiel"), 60),
        "board": {"w": bw, "h": bh, "bg": hexcol(board.get("bg"), "#204d3b"), "grid": bool(board.get("grid", True))},
        "pieceTypes": out_types,
        "pieces": out_pieces,
    }


async def api_ai_generate_game(body: dict, headers: Dict[str, str]):
    user = current_ai_user(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    prompt_text = str(body.get("prompt") or "").strip()[:1000]
    if not prompt_text:
        return 400, {"ok": False, "error": "missing_prompt"}, {}
    # Key des Nutzers laden (Fallback auf Server-Key nur, wenn vorhanden)
    users = load_json(AUTH_USERS_FILE, {})
    rec = users.get(user["username"]) or {}
    api_key = read_anthropic_key(rec) or ""
    if not api_key:
        return 400, {"ok": False, "error": "ai_not_linked"}, {}
    prompt = (
        "You design a virtual-tabletop starting setup for a web board-game sandbox. "
        "The user describes a game; you output a concrete board + pieces layout.\n\n"
        f"User request: \"{prompt_text}\"\n\n" + _AI_GAME_SCHEMA_HINT
    )

    def run():
        result = http_post_json_body(
            "https://api.anthropic.com/v1/messages",
            {
                "model": "claude-opus-4-8",
                "max_tokens": 4000,
                "messages": [{"role": "user", "content": prompt}],
            },
            {"x-api-key": api_key, "anthropic-version": "2023-06-01"},
        )
        text = "".join(b.get("text", "") for b in (result.get("content") or []) if b.get("type") == "text").strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    try:
        raw = await asyncio.to_thread(run)
        if not isinstance(raw, dict):
            raise ValueError("not an object")
        return 200, {"ok": True, "game": _sanitize_ai_game(raw)}, {}
    except urllib.error.HTTPError as exc:
        code = 401 if exc.code in (401, 403) else 502
        return code, {"ok": False, "error": "ai_request_failed", "status": exc.code}, {}
    except Exception as exc:
        log.warning("ai generate failed: %s", exc)
        return 502, {"ok": False, "error": "ai_bad_output"}, {}


# ── Studio: Server-Speicher für Nutzer-Spiele (Baustein 2) ──────────────────
# Gespeicherte Sandbox-Definitionen unter kurzer ID: teilbarer Link
# /studio/#id=<id> statt base64-kodiertem Spiel im Link. Lesen ist öffentlich
# (der Link ist die Einladung), Schreiben Ersteller-gegated.
def current_creator(headers: Dict[str, str]):
    """Aktueller Nutzer mit Ersteller-Recht. 2FA-Pflicht wie bei Admin/KI
    (siehe public_user: twofaRequired umfasst caps.creator)."""
    user = get_current_user(headers)
    if user and (user.get("isAdmin") or user.get("caps", {}).get("creator")):
        if user.get("twofaRequired"):
            return None
        return user
    return None


def _new_short_id(store: dict) -> str:
    """Kurze, verwechslungsarme ID, die im übergebenen Speicher noch frei ist
    (Studio-Spiele und Meldungen teilen sich das Format)."""
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"   # ohne i/l/o/0/1 (Verwechslung)
    while True:
        sid = "".join(secrets.choice(alphabet) for _ in range(8))
        if sid not in store:
            return sid


def _studio_row(gid: str, entry: dict) -> dict:
    row = {
        "id": gid,
        "title": entry.get("title") or "",
        "author": entry.get("ownerDisplay") or entry.get("owner") or "",
        "createdAt": int(entry.get("createdAt") or 0),
        "updatedAt": int(entry.get("updatedAt") or 0),
        # Veröffentlichungs-Workflow (Baustein 4): draft → submitted → published/rejected
        "status": entry.get("status") or "draft",
        "submittedAt": int(entry.get("submittedAt") or 0),
        "publishedAt": int(entry.get("publishedAt") or 0),
    }
    if entry.get("rejectReason"):
        row["rejectReason"] = entry["rejectReason"]
    # Rechte-Zusicherung des Erstellers (siehe api_studio_submit): ohne sie
    # gibt es keine Einreichung, deshalb steht sie an jedem eingereichten Spiel.
    if entry.get("termsAcceptedAt"):
        row["termsAcceptedAt"] = int(entry["termsAcceptedAt"])
        row["termsVersion"] = entry.get("termsVersion") or ""
    return row


async def api_studio_save(body: dict, headers: Dict[str, str]):
    """Spiel-Definition speichern: ohne id neu anlegen (kurze ID zurück),
    mit id die eigene bestehende Version ersetzen.

    Die Rechte-Zusicherung ist bei JEDER Aktualisierung fällig, nicht nur beim
    ersten Einreichen: Änderungen an einem veröffentlichten Spiel gehen ohne
    erneute Prüfung live (bewusste Entscheidung von Baustein 4), der Inhalt von
    heute ist also nicht der, den jemand vor Wochen zugesichert hat.
    """
    user = current_creator(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    if not body.get("terms"):
        return 400, {"ok": False, "error": "terms_required", "termsVersion": TERMS_VERSION}, {}
    raw = body.get("game")
    if not isinstance(raw, dict) or not isinstance(raw.get("board"), dict):
        return 400, {"ok": False, "error": "invalid_game"}, {}
    game = _sanitize_ai_game(raw, keep_ids=True)
    gid = str(body.get("id") or "").strip().lower()
    async with file_lock:
        store = load_json(AUTH_STUDIO_GAMES_FILE, {})
        now = int(time.time())
        if gid:
            entry = store.get(gid) if STUDIO_ID_RE.match(gid) else None
            if not entry:
                return 404, {"ok": False, "error": "game_not_found"}, {}
            if entry.get("owner") != user["username"] and not user.get("isAdmin"):
                return 403, {"ok": False, "error": "not_owner"}, {}
            entry.update({"title": game["title"], "game": game, "updatedAt": now,
                          "termsAcceptedAt": now, "termsVersion": TERMS_VERSION})
        else:
            mine = sum(1 for e in store.values() if e.get("owner") == user["username"])
            if mine >= STUDIO_MAX_GAMES_PER_USER:
                return 409, {"ok": False, "error": "too_many_games", "limit": STUDIO_MAX_GAMES_PER_USER}, {}
            gid = _new_short_id(store)
            store[gid] = {
                "owner": user["username"],
                "ownerDisplay": user.get("displayName") or user["username"],
                "title": game["title"],
                "game": game,
                "status": "draft",
                "createdAt": now,
                "updatedAt": now,
                "termsAcceptedAt": now,
                "termsVersion": TERMS_VERSION,
            }
        atomic_write_json(AUTH_STUDIO_GAMES_FILE, store)
    return 200, {"ok": True, **_studio_row(gid, store[gid])}, {}


async def api_studio_game(query: dict):
    """Öffentlich: gespeichertes Spiel unter seiner ID laden (teilbarer Link)."""
    gid = str((query.get("id") or [""])[0]).strip().lower()
    if not STUDIO_ID_RE.match(gid):
        return 400, {"ok": False, "error": "invalid_id"}, {}
    entry = load_json(AUTH_STUDIO_GAMES_FILE, {}).get(gid)
    if not entry:
        return 404, {"ok": False, "error": "game_not_found"}, {}
    return 200, {"ok": True, **_studio_row(gid, entry), "game": entry.get("game")}, {}


async def api_studio_games(headers: Dict[str, str]):
    """Eigene gespeicherte Spiele auflisten (ohne Definitionen — nur Metadaten)."""
    user = current_creator(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    store = load_json(AUTH_STUDIO_GAMES_FILE, {})
    items = sorted((_studio_row(gid, e) for gid, e in store.items() if e.get("owner") == user["username"]),
                   key=lambda r: -r["updatedAt"])
    return 200, {"ok": True, "games": items, "count": len(items), "limit": STUDIO_MAX_GAMES_PER_USER}, {}


async def api_studio_delete(body: dict, headers: Dict[str, str]):
    """Eigenes gespeichertes Spiel löschen (Admin: jedes)."""
    user = current_creator(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    gid = str(body.get("id") or "").strip().lower()
    if not STUDIO_ID_RE.match(gid):
        return 400, {"ok": False, "error": "invalid_id"}, {}
    async with file_lock:
        store = load_json(AUTH_STUDIO_GAMES_FILE, {})
        entry = store.get(gid)
        if not entry:
            return 404, {"ok": False, "error": "game_not_found"}, {}
        if entry.get("owner") != user["username"] and not user.get("isAdmin"):
            return 403, {"ok": False, "error": "not_owner"}, {}
        store.pop(gid)
        atomic_write_json(AUTH_STUDIO_GAMES_FILE, store)
    return 200, {"ok": True, "deleted": gid}, {}


# ── Studio: Einreichen + Moderation (Baustein 4) ────────────────────────────
# Ersteller reichen gespeicherte Spiele zur Veröffentlichung ein; Admins geben
# frei oder lehnen ab. Veröffentlichte Spiele erscheinen zur Laufzeit in der
# Community-Sektion der Startseite (GET /api/studio/published, kein Deploy).
def _studio_owned_entry(store: dict, gid: str, user: dict):
    """(entry, fehler) — Eintrag nur für Besitzer bzw. Admin."""
    if not STUDIO_ID_RE.match(gid):
        return None, (400, {"ok": False, "error": "invalid_id"}, {})
    entry = store.get(gid)
    if not entry:
        return None, (404, {"ok": False, "error": "game_not_found"}, {})
    if entry.get("owner") != user["username"] and not user.get("isAdmin"):
        return None, (403, {"ok": False, "error": "not_owner"}, {})
    return entry, None


async def api_studio_submit(body: dict, headers: Dict[str, str]):
    """Eigenes gespeichertes Spiel zur Veröffentlichung einreichen.

    Die Veröffentlichung ist der Punkt, an dem fremde Inhalte zu einem Problem
    des Anbieters werden. Deshalb geht sie nur mit der ausdrücklichen
    Rechte-Zusicherung aus den Nutzungsbedingungen (`terms: true`); Zeitpunkt
    und Fassung werden am Spiel festgehalten. Beim Zurückziehen bleiben sie
    stehen — eine einmal abgegebene Erklärung wird nicht rückwirkend gelöscht.
    """
    user = current_creator(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    gid = str(body.get("id") or "").strip().lower()
    if not body.get("terms"):
        return 400, {"ok": False, "error": "terms_required", "termsVersion": TERMS_VERSION}, {}
    async with file_lock:
        store = load_json(AUTH_STUDIO_GAMES_FILE, {})
        entry, err = _studio_owned_entry(store, gid, user)
        if err:
            return err
        if entry.get("status") == "published":
            return 200, {"ok": True, **_studio_row(gid, entry)}, {}
        entry["status"] = "submitted"
        entry["submittedAt"] = int(time.time())
        entry["termsAcceptedAt"] = entry["submittedAt"]
        entry["termsVersion"] = TERMS_VERSION
        entry.pop("rejectReason", None)
        atomic_write_json(AUTH_STUDIO_GAMES_FILE, store)
    return 200, {"ok": True, **_studio_row(gid, entry)}, {}


async def api_studio_withdraw(body: dict, headers: Dict[str, str]):
    """Einreichung bzw. Veröffentlichung des eigenen Spiels zurückziehen."""
    user = current_creator(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    gid = str(body.get("id") or "").strip().lower()
    async with file_lock:
        store = load_json(AUTH_STUDIO_GAMES_FILE, {})
        entry, err = _studio_owned_entry(store, gid, user)
        if err:
            return err
        entry["status"] = "draft"
        for k in ("submittedAt", "publishedAt", "rejectReason"):
            entry.pop(k, None)
        atomic_write_json(AUTH_STUDIO_GAMES_FILE, store)
    return 200, {"ok": True, **_studio_row(gid, entry)}, {}


async def api_studio_accept_terms(body: dict, headers: Dict[str, str]):
    """Rechte-Zusicherung für ein bestehendes Spiel nachholen.

    Gebraucht für den Altbestand: Spiele, die vor Einführung der Zusicherung
    eingereicht oder veröffentlicht wurden, tragen keine. Sie deshalb
    stillschweigend offline zu nehmen wäre unfair — stattdessen fordert das
    Studio die Bestätigung ein, und dieser Endpunkt nimmt sie entgegen.
    """
    user = current_creator(headers)
    if not user:
        return 403, {"ok": False, "error": "forbidden"}, {}
    if not body.get("terms"):
        return 400, {"ok": False, "error": "terms_required", "termsVersion": TERMS_VERSION}, {}
    gid = str(body.get("id") or "").strip().lower()
    async with file_lock:
        store = load_json(AUTH_STUDIO_GAMES_FILE, {})
        entry, err = _studio_owned_entry(store, gid, user)
        if err:
            return err
        entry["termsAcceptedAt"] = int(time.time())
        entry["termsVersion"] = TERMS_VERSION
        atomic_write_json(AUTH_STUDIO_GAMES_FILE, store)
    log.info("studio terms accepted: %s by %s", gid, user["username"])
    return 200, {"ok": True, **_studio_row(gid, entry)}, {}


async def api_studio_published(query: dict):
    """Öffentlich: freigegebene Studio-Spiele für die Community-Galerie."""
    store = load_json(AUTH_STUDIO_GAMES_FILE, {})
    rows = sorted((_studio_row(gid, e) for gid, e in store.items()
                   if (e.get("status") or "draft") == "published"),
                  key=lambda r: -r["publishedAt"])[:100]
    return 200, {"ok": True, "games": rows, "count": len(rows)}, {}


async def api_admin_studio_submissions(headers: Dict[str, str]):
    """Admin: offene Einreichungen + aktuell veröffentlichte Spiele."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    store = load_json(AUTH_STUDIO_GAMES_FILE, {})
    submitted, published = [], []
    for gid, e in store.items():
        row = {**_studio_row(gid, e), "owner": e.get("owner") or ""}
        status = e.get("status") or "draft"
        if status == "submitted":
            submitted.append(row)
        elif status == "published":
            published.append(row)
    submitted.sort(key=lambda r: r["submittedAt"])
    published.sort(key=lambda r: -r["publishedAt"])
    return 200, {"ok": True, "submitted": submitted, "published": published}, {}


async def api_admin_resolve_studio_submission(body: dict, headers: Dict[str, str]):
    """Admin gibt ein eingereichtes Spiel frei oder lehnt es ab (auch: eine
    bestehende Veröffentlichung zurückziehen = approve:false)."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    gid = str(body.get("id") or "").strip().lower()
    approve = bool(body.get("approve"))
    reason = clean_text(body.get("reason") or "", 200)
    if not STUDIO_ID_RE.match(gid):
        return 400, {"ok": False, "error": "invalid_id"}, {}
    async with file_lock:
        store = load_json(AUTH_STUDIO_GAMES_FILE, {})
        entry = store.get(gid)
        if not entry:
            return 404, {"ok": False, "error": "game_not_found"}, {}
        if approve:
            entry["status"] = "published"
            entry["publishedAt"] = int(time.time())
            entry.pop("rejectReason", None)
        else:
            entry["status"] = "rejected"
            entry.pop("publishedAt", None)
            if reason:
                entry["rejectReason"] = reason
        atomic_write_json(AUTH_STUDIO_GAMES_FILE, store)
        log.info("studio submission %s: %s", "approved" if approve else "rejected", gid)
    return 200, {"ok": True, **_studio_row(gid, entry)}, {}


# ── Meldungen rechtswidriger Inhalte (DSA Art. 16) ──────────────────────────
# Melde- und Abhilfeverfahren: /melden/ nimmt Hinweise entgegen, /admin/ zeigt
# sie und hält die Entscheidung fest. Bewusst niedrigschwellig (kein Konto
# nötig) und bewusst protokolliert — Art. 16 verlangt eine Eingangsbestätigung
# und eine begründete Entscheidung, beides braucht einen Vorgang mit ID.
REPORT_CATEGORIES = {
    "copyright",    # Urheberrecht (Texte, Bilder, Musik, Spielinhalte)
    "trademark",    # Marken- und Kennzeichenrecht
    "personal",     # personenbezogene Daten / Persönlichkeitsrecht
    "insult",       # Beleidigung, Hetze, Diskriminierung
    "youth",        # jugendgefährdende Inhalte
    "minors",       # Darstellung sexuellen Missbrauchs von Kindern
    "other",        # sonstiger rechtswidriger Inhalt
}
# Art. 16 Abs. 2 lit. c verlangt Name und E-Mail des Meldenden — ausgenommen
# sind Meldungen zu Straftaten nach Art. 3–7 der Richtlinie 2011/93/EU. Genau
# dafür ist diese Kategorie da, und nur dort ist die Meldung anonym zulässig.
REPORT_ANONYMOUS_CATEGORIES = {"minors"}
REPORT_DECISIONS = {"removed", "kept", "forwarded"}


def _report_row(rid: str, entry: dict, detail: bool = False) -> dict:
    row = {
        "id": rid,
        "target": entry.get("target") or "",
        "category": entry.get("category") or "other",
        "status": entry.get("status") or "open",
        "createdAt": int(entry.get("createdAt") or 0),
        "resolvedAt": int(entry.get("resolvedAt") or 0),
        "decision": entry.get("decision") or "",
    }
    if detail:
        row.update({
            "reason": entry.get("reason") or "",
            "name": entry.get("name") or "",
            "email": entry.get("email") or "",
            "reporter": entry.get("reporter") or "",
            "note": entry.get("note") or "",
            "resolvedBy": entry.get("resolvedBy") or "",
        })
    return row


def _prune_reports(store: dict) -> None:
    """Nur abgeschlossene Vorgänge fallen heraus, älteste zuerst. Offene
    Meldungen bleiben immer stehen — sonst verschwände genau das, worauf noch
    zu reagieren ist."""
    if len(store) <= REPORT_MAX_STORED:
        return
    done = sorted(
        ((rid, e) for rid, e in store.items() if (e.get("status") or "open") != "open"),
        key=lambda kv: int(kv[1].get("resolvedAt") or kv[1].get("createdAt") or 0),
    )
    for rid, _ in done[: len(store) - REPORT_MAX_STORED]:
        store.pop(rid, None)


async def api_report_create(body: dict, headers: Dict[str, str], ip: str):
    """Öffentlich: Hinweis auf einen rechtswidrigen Inhalt entgegennehmen."""
    target = clean_text(body.get("target"), 500)
    category = str(body.get("category") or "").strip().lower()
    reason = clean_text(body.get("reason"), 4000)
    name = clean_text(body.get("name"), 120)
    email = clean_text(body.get("email"), 200)
    # Art. 16 Abs. 2 lit. d: die Meldung MUSS die Erklärung enthalten, dass die
    # Angaben nach bestem Wissen richtig und vollständig sind.
    if not body.get("affirmed"):
        return 400, {"ok": False, "error": "affirmation_required"}, {}
    if not target or category not in REPORT_CATEGORIES or len(reason) < 20:
        return 400, {"ok": False, "error": "invalid_report"}, {}
    if email and not EMAIL_RE.match(email):
        return 400, {"ok": False, "error": "invalid_email"}, {}
    if not email and category not in REPORT_ANONYMOUS_CATEGORIES:
        return 400, {"ok": False, "error": "contact_required"}, {}
    # Erst nach der Prüfung drosseln: wer das Formular ein paarmal unvollständig
    # abschickt, darf sich nicht selbst aussperren — Art. 16 verlangt ein leicht
    # zugängliches Verfahren. Gegen Müll-Fluten wirken das allgemeine Limit je
    # IP und Pfad in handle_api und die nginx-Zone.
    if rate_limited("report:" + ip, limit=REPORT_RATE_LIMIT, window=REPORT_RATE_WINDOW):
        return 429, {"ok": False, "error": "rate_limited"}, {}
    user = get_current_user(headers)
    now = int(time.time())
    async with file_lock:
        store = load_json(AUTH_REPORTS_FILE, {})
        rid = _new_short_id(store)
        store[rid] = {
            "target": target,
            "category": category,
            "reason": reason,
            "name": name,
            "email": email,
            "reporter": user["username"] if user else "",
            "status": "open",
            "createdAt": now,
        }
        _prune_reports(store)
        atomic_write_json(AUTH_REPORTS_FILE, store)
    # Kategorie und Vorgangsnummer genügen im Journal — Meldetext, Name und
    # E-Mail gehören dort nicht hin.
    log.info("content report received: %s category=%s", rid, category)
    return 200, {"ok": True, "id": rid, "receivedAt": now}, {}


async def api_admin_reports(headers: Dict[str, str]):
    """Admin: offene Meldungen zuerst, danach die abgeschlossenen."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    store = load_json(AUTH_REPORTS_FILE, {})
    open_rows, done_rows = [], []
    for rid, entry in store.items():
        row = _report_row(rid, entry, detail=True)
        (open_rows if row["status"] == "open" else done_rows).append(row)
    open_rows.sort(key=lambda r: r["createdAt"])          # älteste zuerst: Fristen laufen
    done_rows.sort(key=lambda r: -r["resolvedAt"])
    return 200, {"ok": True, "open": open_rows, "resolved": done_rows}, {}


async def api_admin_resolve_report(body: dict, headers: Dict[str, str]):
    """Admin entscheidet über eine Meldung und begründet die Entscheidung."""
    admin = current_admin(headers)
    if not admin:
        return 403, {"ok": False, "error": "forbidden"}, {}
    rid = str(body.get("id") or "").strip().lower()
    decision = str(body.get("decision") or "").strip().lower()
    note = clean_text(body.get("note"), 1000)
    if not REPORT_ID_RE.match(rid):
        return 400, {"ok": False, "error": "invalid_id"}, {}
    if decision not in REPORT_DECISIONS:
        return 400, {"ok": False, "error": "invalid_decision"}, {}
    async with file_lock:
        store = load_json(AUTH_REPORTS_FILE, {})
        entry = store.get(rid)
        if not entry:
            return 404, {"ok": False, "error": "report_not_found"}, {}
        entry["status"] = "resolved"
        entry["decision"] = decision
        entry["note"] = note
        entry["resolvedAt"] = int(time.time())
        entry["resolvedBy"] = admin["username"]
        atomic_write_json(AUTH_REPORTS_FILE, store)
    log.info("content report resolved: %s decision=%s", rid, decision)
    return 200, {"ok": True, **_report_row(rid, entry, detail=True)}, {}


async def api_admin_delete_report(body: dict, headers: Dict[str, str]):
    """Admin löscht einen abgeschlossenen Vorgang endgültig (Datenminimierung:
    Name und E-Mail des Meldenden sollen nicht ewig liegen bleiben)."""
    if not current_admin(headers):
        return 403, {"ok": False, "error": "forbidden"}, {}
    rid = str(body.get("id") or "").strip().lower()
    if not REPORT_ID_RE.match(rid):
        return 400, {"ok": False, "error": "invalid_id"}, {}
    async with file_lock:
        store = load_json(AUTH_REPORTS_FILE, {})
        entry = store.get(rid)
        if not entry:
            return 404, {"ok": False, "error": "report_not_found"}, {}
        if (entry.get("status") or "open") == "open":
            return 409, {"ok": False, "error": "report_still_open"}, {}
        store.pop(rid)
        atomic_write_json(AUTH_REPORTS_FILE, store)
    return 200, {"ok": True, "deleted": rid}, {}


async def api_admin_set_blocked(body: dict, headers: Dict[str, str]):
    """Admin sperrt/entsperrt ein Konto. Beim Sperren werden aktive Sessions
    sofort beendet. Admin-Konten (Allowlist) und man selbst sind geschützt."""
    admin = current_admin(headers)
    if not admin:
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    blocked = bool(body.get("blocked"))
    if target == admin["username"]:
        return 400, {"ok": False, "error": "cannot_target_self"}, {}
    if is_admin_username(target):
        return 400, {"ok": False, "error": "cannot_target_admin"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        rec["blocked"] = blocked
        atomic_write_json(AUTH_USERS_FILE, users)
        if blocked:
            sessions = cleanup_auth_sessions(load_json(AUTH_SESSIONS_FILE, {}))
            if _drop_user_sessions(sessions, target):
                atomic_write_json(AUTH_SESSIONS_FILE, sessions)
        row = _admin_user_row(rec)
    return 200, {"ok": True, "user": row}, {}


async def api_admin_set_admin(body: dict, headers: Dict[str, str]):
    """Admin ernennt ein Konto zum Admin (role=admin + caps.creator) oder
    degradiert es wieder. Allowlist-Admins und man selbst sind geschützt.
    Ein neu ernannter Admin muss vor Admin-Funktionen erst 2FA einrichten."""
    admin = current_admin(headers)
    if not admin:
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    make = bool(body.get("admin"))
    if target == admin["username"]:
        return 400, {"ok": False, "error": "cannot_target_self"}, {}
    if is_admin_username(target):
        return 400, {"ok": False, "error": "cannot_target_admin"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        caps = rec.get("caps")
        if not isinstance(caps, dict):
            caps = {}
            rec["caps"] = caps
        if make:
            rec["role"] = "admin"
            caps["creator"] = True
        else:
            rec["role"] = "user"
        atomic_write_json(AUTH_USERS_FILE, users)
        row = _admin_user_row(rec)
    return 200, {"ok": True, "user": row}, {}


async def api_admin_reset_password(body: dict, headers: Dict[str, str]):
    """Admin setzt ein neues Passwort für ein Konto und beendet dessen Sessions
    (der Nutzer muss sich mit dem neuen Passwort neu anmelden)."""
    admin = current_admin(headers)
    if not admin:
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    new_pw = str(body.get("password") or "")
    if target == admin["username"]:
        return 400, {"ok": False, "error": "cannot_target_self"}, {}
    if is_admin_username(target):
        return 400, {"ok": False, "error": "cannot_target_admin"}, {}
    if len(new_pw) < 8:
        return 400, {"ok": False, "error": "password_too_short"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        rec["password"] = password_hash(new_pw)
        atomic_write_json(AUTH_USERS_FILE, users)
        sessions = cleanup_auth_sessions(load_json(AUTH_SESSIONS_FILE, {}))
        if _drop_user_sessions(sessions, target):
            atomic_write_json(AUTH_SESSIONS_FILE, sessions)
    return 200, {"ok": True}, {}


async def api_admin_remove_twofa(body: dict, headers: Dict[str, str]):
    """Admin entfernt die 2FA/TOTP eines Kontos — Wiederherstellung, wenn sich
    jemand aus seiner Zwei-Faktor-Authentifizierung ausgesperrt hat."""
    admin = current_admin(headers)
    if not admin:
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    if target == admin["username"]:
        return 400, {"ok": False, "error": "cannot_target_self"}, {}
    if is_admin_username(target):
        return 400, {"ok": False, "error": "cannot_target_admin"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        rec = users.get(target)
        if not rec:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        had = rec.pop("twofa", None) is not None
        atomic_write_json(AUTH_USERS_FILE, users)
        row = _admin_user_row(rec)
    return 200, {"ok": True, "removed": had, "user": row}, {}


async def api_admin_delete_user(body: dict, headers: Dict[str, str]):
    """Admin löscht ein Konto samt Sessions, Freundschaften und Errungenschaften.
    Admin-Konten (Allowlist) und man selbst sind geschützt."""
    admin = current_admin(headers)
    if not admin:
        return 403, {"ok": False, "error": "forbidden"}, {}
    target = normalize_username(body.get("username"))
    if target == admin["username"]:
        return 400, {"ok": False, "error": "cannot_target_self"}, {}
    if is_admin_username(target):
        return 400, {"ok": False, "error": "cannot_target_admin"}, {}
    async with file_lock:
        users = load_json(AUTH_USERS_FILE, {})
        if target not in users:
            return 404, {"ok": False, "error": "user_not_found"}, {}
        users.pop(target, None)
        atomic_write_json(AUTH_USERS_FILE, users)
        sessions = cleanup_auth_sessions(load_json(AUTH_SESSIONS_FILE, {}))
        if _drop_user_sessions(sessions, target):
            atomic_write_json(AUTH_SESSIONS_FILE, sessions)
        # Freundschaften: eigene Liste + Vorkommen bei anderen entfernen
        friends = load_json(AUTH_FRIENDS_FILE, {})
        changed = friends.pop(target, None) is not None
        for owner, lst in list(friends.items()):
            if target in (lst or []):
                friends[owner] = [n for n in lst if n != target]
                changed = True
        if changed:
            atomic_write_json(AUTH_FRIENDS_FILE, friends)
        # Errungenschaften
        ach = load_json(AUTH_ACHIEVEMENTS_FILE, {})
        if ach.pop(target, None) is not None:
            atomic_write_json(AUTH_ACHIEVEMENTS_FILE, ach)
        # Projekte: Freigaben entfernen; eigene Projekte bleiben registriert
        # (Besitzer leer → Admin kann sie in /admin/ neu zuordnen).
        projects = load_projects()
        proj_changed = False
        for slug, entry in projects.items():
            if target in entry["grants"]:
                entry["grants"] = [g for g in entry["grants"] if g != target]
                proj_changed = True
            if entry["owner"] == target:
                entry["owner"] = ""
                proj_changed = True
        if proj_changed:
            atomic_write_json(AUTH_PROJECTS_FILE, projects)
        # Gespeicherte Studio-Spiele des Kontos entfernen
        studio = load_json(AUTH_STUDIO_GAMES_FILE, {})
        remaining = {gid: e for gid, e in studio.items() if e.get("owner") != target}
        if len(remaining) != len(studio):
            atomic_write_json(AUTH_STUDIO_GAMES_FILE, remaining)
        # Meldungen bleiben als Vorgang bestehen (sie betreffen fremde Inhalte
        # und sind zu dokumentieren), verlieren aber den Kontobezug.
        reports = load_json(AUTH_REPORTS_FILE, {})
        rep_changed = False
        for entry in reports.values():
            if entry.get("reporter") == target:
                entry["reporter"] = ""
                rep_changed = True
        if rep_changed:
            atomic_write_json(AUTH_REPORTS_FILE, reports)
    return 200, {"ok": True, "deleted": target}, {}


async def api_achievements_get(headers: Dict[str, str]):
    username = current_username(headers)
    if not username:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    items_by_user = load_json(AUTH_ACHIEVEMENTS_FILE, {})
    items = list((items_by_user.get(username) or {}).values())
    items.sort(key=lambda item: int(item.get("unlockedAt") or 0), reverse=True)
    return 200, {"ok": True, "items": items[:250]}, {}


async def api_achievement_unlock(body: dict, headers: Dict[str, str]):
    username = current_username(headers)
    if not username:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    ach_id = safe_part(body.get("id"), "")[:80]
    if not ach_id:
        return 400, {"ok": False, "error": "invalid_achievement"}, {}
    entry = {
        "id": ach_id,
        "game": safe_part(body.get("game") or "site", "site"),
        "title": clean_text(body.get("title") or ach_id.replace("-", " ").replace("_", " "), 80),
        "description": clean_text(body.get("description") or "", 220),
        "unlockedAt": int(time.time()),
    }
    async with file_lock:
        data = load_json(AUTH_ACHIEVEMENTS_FILE, {})
        mine = data.setdefault(username, {})
        if ach_id in mine:
            # Keep the first unlock timestamp; the trophy cabinet is not a revolving door.
            entry["unlockedAt"] = int(mine[ach_id].get("unlockedAt") or entry["unlockedAt"])
        mine[ach_id] = entry
        atomic_write_json(AUTH_ACHIEVEMENTS_FILE, data)
    return await api_achievements_get(headers)


async def api_friends_get(headers: Dict[str, str]):
    username = current_username(headers)
    if not username:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    users = load_json(AUTH_USERS_FILE, {})
    friends = load_json(AUTH_FRIENDS_FILE, {})
    names = sorted(set(friends.get(username) or []))
    return 200, {"ok": True, "items": [public_friend(name, users) for name in names]}, {}


async def api_users_search(query: dict, headers: Dict[str, str]):
    """Nutzersuche für die Freundesliste (nur eingeloggt). Liefert bis zu 12
    Treffer nach Benutzer-/Anzeigename; nur öffentliche Felder, ohne gesperrte
    Konten und ohne sich selbst. Markiert bestehende Freunde."""
    me = current_username(headers)
    if not me:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    q = str((query.get("q") or [""])[0]).strip().lower()
    if len(q) < 2:
        return 200, {"ok": True, "items": []}, {}
    users = load_json(AUTH_USERS_FILE, {})
    friends = set(load_json(AUTH_FRIENDS_FILE, {}).get(me) or [])
    out = []
    for uname, rec in users.items():
        if uname == me or rec.get("blocked"):
            continue
        dn = rec.get("displayName") or uname
        if q in uname.lower() or q in dn.lower():
            out.append({"username": uname, "displayName": dn, "isFriend": uname in friends})
    # Präfix-Treffer zuerst, dann alphabetisch nach Anzeigename.
    out.sort(key=lambda r: (not (r["username"].startswith(q) or r["displayName"].lower().startswith(q)), r["displayName"].lower()))
    return 200, {"ok": True, "items": out[:12]}, {}


async def api_friend_add(body: dict, headers: Dict[str, str]):
    username = current_username(headers)
    if not username:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    friend = normalize_username(body.get("username"))
    if not USERNAME_RE.match(friend) or friend == username:
        return 400, {"ok": False, "error": "invalid_friend"}, {}
    users = load_json(AUTH_USERS_FILE, {})
    if friend not in users:
        return 404, {"ok": False, "error": "friend_not_found"}, {}
    async with file_lock:
        friends = load_json(AUTH_FRIENDS_FILE, {})
        mine = set(friends.get(username) or [])
        mine.add(friend)
        friends[username] = sorted(mine)
        atomic_write_json(AUTH_FRIENDS_FILE, friends)
    return await api_friends_get(headers)


async def api_friend_remove(body: dict, headers: Dict[str, str]):
    username = current_username(headers)
    if not username:
        return 401, {"ok": False, "error": "not_authenticated"}, {}
    friend = normalize_username(body.get("username"))
    async with file_lock:
        friends = load_json(AUTH_FRIENDS_FILE, {})
        mine = set(friends.get(username) or [])
        mine.discard(friend)
        friends[username] = sorted(mine)
        atomic_write_json(AUTH_FRIENDS_FILE, friends)
    return await api_friends_get(headers)


async def handle_api(client: Client, headers: Dict[str, str]) -> bool:
    method, target, _ = parse_request(headers)
    parsed = urlparse(target)
    if not parsed.path.startswith("/api/"):
        return False
    ip = client_ip(headers, client.peer)
    if rate_limited(f"{ip}:{parsed.path}"):
        await send_http(client.writer, 429, {"ok": False, "error": "rate_limited"})
        return True
    if method == "OPTIONS":
        await send_http(client.writer, 204, None, headers={"Allow": "GET, POST, DELETE, OPTIONS"})
        return True
    try:
        body = {}
        if method in {"POST", "PUT", "PATCH"}:
            raw = await read_http_body(client.reader, headers)
            body = json.loads(raw.decode("utf-8") or "{}") if raw else {}
        query = parse_qs(parsed.query)
        # Anmelden/Registrieren gesondert drosseln: je IP UND je Konto. Das
        # Konto-Fenster ist die eigentliche Bremse gegen verteiltes Durchprobieren.
        if parsed.path in AUTH_GUARDED_PATHS and method == "POST":
            who = normalize_username(body.get("username"))
            keys = ["authip:" + ip] + (["authuser:" + who] if who else [])
            if any(rate_limited(k, limit=AUTH_RATE_LIMIT, window=AUTH_RATE_WINDOW) for k in keys):
                log.warning("auth-failure ip=%s path=%s reason=rate_limited", ip, parsed.path)
                await send_http(client.writer, 429, {"ok": False, "error": "rate_limited"})
                return True
        oauth_start = re.match(r"^/api/auth/oauth/(google|facebook)/start$", parsed.path)
        oauth_callback = re.match(r"^/api/auth/oauth/(google|facebook)/callback$", parsed.path)
        oauth_unlink = re.match(r"^/api/auth/oauth/(google|facebook)/unlink$", parsed.path)
        if oauth_unlink and method == "POST":
            status, result, extra = await api_oauth_unlink(oauth_unlink.group(1), headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/auth/oauth/2fa" and method == "POST":
            status, result, extra = await api_oauth_2fa(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif oauth_start and method == "GET":
            status, result, extra = await api_oauth_start(oauth_start.group(1), query, headers)
            if status in (302, 303):
                await send_redirect(client.writer, result, headers=extra, status=status)
            else:
                await send_http(client.writer, status, result, headers=extra)
        elif oauth_callback and method == "GET":
            status, result, extra = await api_oauth_callback(oauth_callback.group(1), query, headers)
            if status in (302, 303):
                await send_redirect(client.writer, result, headers=extra, status=status)
            else:
                await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/stats" and method == "GET":
            await send_http(client.writer, 200, await api_stats(query))
        elif parsed.path == "/api/rooms" and method == "GET":
            await send_http(client.writer, 200, await api_rooms(query))
        elif parsed.path == "/api/visit" and method == "POST":
            await send_http(client.writer, 200, await api_visit(body))
        elif parsed.path == "/api/ratings" and method == "GET":
            await send_http(client.writer, 200, await api_ratings_get(query, headers))
        elif parsed.path == "/api/rating" and method == "POST":
            result = await api_rating_post(body, headers)
            await send_http(client.writer, 200 if result.get("ok") else 400, result)
        elif parsed.path == "/api/rating" and method == "DELETE":
            result = await api_rating_delete(query, headers)
            await send_http(client.writer, 200 if result.get("ok") else 401, result)
        elif parsed.path == "/api/me" and method == "GET":
            await send_http(client.writer, 200, await api_auth_me(headers))
        elif parsed.path == "/api/auth/register" and method == "POST":
            status, result, extra = await api_auth_register(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/auth/login" and method == "POST":
            status, result, extra = await api_auth_login(body, headers)
            await send_http(client.writer, status, result, headers=extra)
            # 401 mit "totp_required" ist KEIN Fehlversuch, sondern der normale
            # Zwischenschritt eines 2FA-Logins — sonst würde sich jeder Nutzer
            # mit zweitem Faktor selbst aussperren.
            if status in (401, 403) and (result or {}).get("error") != "totp_required":
                # Eine Zeile je Fehlversuch — mehr braucht fail2ban nicht, und
                # der Benutzername gehört bewusst NICHT ins Log.
                log.warning("auth-failure ip=%s path=%s status=%d", ip, parsed.path, status)
        elif parsed.path == "/api/auth/2fa/setup" and method == "POST":
            status, result, extra = await api_auth_2fa_setup(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/auth/2fa/enable" and method == "POST":
            status, result, extra = await api_auth_2fa_enable(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/auth/2fa/disable" and method == "POST":
            status, result, extra = await api_auth_2fa_disable(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/auth/logout" and method == "POST":
            status, result, extra = await api_auth_logout(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/auth/profile" and method == "POST":
            status, result, extra = await api_auth_profile(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/users" and method == "GET":
            status, result, extra = await api_admin_users(headers, query)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/set-creator" and method == "POST":
            status, result, extra = await api_admin_set_creator(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/set-blocked" and method == "POST":
            status, result, extra = await api_admin_set_blocked(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/delete-user" and method == "POST":
            status, result, extra = await api_admin_delete_user(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/set-site" and method == "POST":
            status, result, extra = await api_admin_set_site(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/set-ai" and method == "POST":
            status, result, extra = await api_admin_set_ai(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/set-admin" and method == "POST":
            status, result, extra = await api_admin_set_admin(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/reset-password" and method == "POST":
            status, result, extra = await api_admin_reset_password(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/remove-2fa" and method == "POST":
            status, result, extra = await api_admin_remove_twofa(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/creator/request" and method == "POST":
            status, result, extra = await api_creator_request(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/creator/cancel" and method == "POST":
            status, result, extra = await api_creator_cancel(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/creator-requests" and method == "GET":
            status, result, extra = await api_admin_creator_requests(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/resolve-creator-request" and method == "POST":
            status, result, extra = await api_admin_resolve_creator_request(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/projects/claim" and method == "POST":
            status, result, extra = await api_projects_claim(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/projects/grant" and method == "POST":
            status, result, extra = await api_projects_grant(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/projects/accept-terms" and method == "POST":
            status, result, extra = await api_projects_accept_terms(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/projects/mine" and method == "GET":
            status, result, extra = await api_projects_mine(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/projects" and method == "GET":
            status, result, extra = await api_admin_projects(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/project-set-owner" and method == "POST":
            status, result, extra = await api_admin_project_set_owner(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/project-grant" and method == "POST":
            status, result, extra = await api_admin_project_grant(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/project-community" and method == "POST":
            status, result, extra = await api_admin_project_community(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/project-delete" and method == "POST":
            status, result, extra = await api_admin_project_delete(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/ai/link" and method == "POST":
            status, result, extra = await api_ai_link(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/ai/unlink" and method == "POST":
            status, result, extra = await api_ai_unlink(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/studio/save" and method == "POST":
            status, result, extra = await api_studio_save(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/studio/game" and method == "GET":
            status, result, extra = await api_studio_game(query)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/studio/games" and method == "GET":
            status, result, extra = await api_studio_games(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/studio/delete" and method == "POST":
            status, result, extra = await api_studio_delete(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/studio/submit" and method == "POST":
            status, result, extra = await api_studio_submit(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/studio/withdraw" and method == "POST":
            status, result, extra = await api_studio_withdraw(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/studio/accept-terms" and method == "POST":
            status, result, extra = await api_studio_accept_terms(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/studio/published" and method == "GET":
            status, result, extra = await api_studio_published(query)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/report" and method == "POST":
            status, result, extra = await api_report_create(body, headers, ip)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/reports" and method == "GET":
            status, result, extra = await api_admin_reports(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/resolve-report" and method == "POST":
            status, result, extra = await api_admin_resolve_report(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/delete-report" and method == "POST":
            status, result, extra = await api_admin_delete_report(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/studio-submissions" and method == "GET":
            status, result, extra = await api_admin_studio_submissions(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/admin/resolve-studio-submission" and method == "POST":
            status, result, extra = await api_admin_resolve_studio_submission(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/ai/generate-game" and method == "POST":
            status, result, extra = await api_ai_generate_game(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/achievements" and method == "GET":
            status, result, extra = await api_achievements_get(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/achievement" and method == "POST":
            status, result, extra = await api_achievement_unlock(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/friends" and method == "GET":
            status, result, extra = await api_friends_get(headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/users/search" and method == "GET":
            status, result, extra = await api_users_search(query, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/friend/add" and method == "POST":
            status, result, extra = await api_friend_add(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/friend/remove" and method == "POST":
            status, result, extra = await api_friend_remove(body, headers)
            await send_http(client.writer, status, result, headers=extra)
        elif parsed.path == "/api/ai-check" and method == "POST":
            status, result = await api_ai_check(body)
            await send_http(client.writer, status, result)
        else:
            await send_http(client.writer, 404, {"ok": False, "error": "not_found"})
    except ValueError:
        await send_http(client.writer, 413, {"ok": False, "error": "payload_too_large"})
    except json.JSONDecodeError:
        await send_http(client.writer, 400, {"ok": False, "error": "invalid_json"})
    except Exception as exc:
        log.warning("api error %s %s: %s", method, target, exc)
        await send_http(client.writer, 500, {"ok": False, "error": "server_error"})
    return True


async def accept_websocket(client: Client, headers: Dict[str, str]) -> bool:
    try:
        key = headers.get("sec-websocket-key")
        upgrade = headers.get("upgrade", "").lower()
        if not key or upgrade != "websocket":
            await send_http(client.writer, 400, {"ok": False, "error": "bad_request"})
            return False
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        response = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n"
            "\r\n"
        )
        client.writer.write(response.encode("ascii"))
        await client.writer.drain()
        return True
    except Exception as exc:
        log.warning("handshake failed from %s: %s", client.peer, exc)
        return False


async def read_exact(reader: asyncio.StreamReader, n: int) -> bytes:
    data = await reader.readexactly(n)
    if len(data) != n:
        raise ConnectionError("short read")
    return data


async def read_frame(client: Client):
    head = await read_exact(client.reader, 2)
    b1, b2 = head[0], head[1]
    opcode = b1 & 0x0F
    masked = bool(b2 & 0x80)
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", await read_exact(client.reader, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", await read_exact(client.reader, 8))[0]
    if length > MAX_MESSAGE_BYTES:
        raise ValueError(f"message too large: {length}")
    mask = await read_exact(client.reader, 4) if masked else b""
    payload = await read_exact(client.reader, length) if length else b""
    if masked:
        payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
    return opcode, payload


async def send_frame(client: Client, opcode: int, payload: bytes = b""):
    if client.writer.is_closing():
        return
    length = len(payload)
    if length < 126:
        header = bytes([0x80 | opcode, length])
    elif length < (1 << 16):
        header = bytes([0x80 | opcode, 126]) + struct.pack("!H", length)
    else:
        header = bytes([0x80 | opcode, 127]) + struct.pack("!Q", length)
    client.writer.write(header + payload)
    await client.writer.drain()


async def send_text(client: Client, text: str):
    await send_frame(client, 0x1, text.encode("utf-8"))


async def send_close(client: Client):
    try:
        await send_frame(client, 0x8, b"")
    except Exception:
        pass


async def broadcast(room: str, text: str):
    stale = []
    for client in list(rooms.get(room, set())):
        try:
            await send_text(client, text)
        except Exception:
            stale.append(client)
    for client in stale:
        await cleanup(client)


async def cleanup(client: Client):
    if client not in clients:
        return
    clients.discard(client)
    for room in list(client.rooms):
        members = rooms.get(room)
        if members:
            members.discard(client)
            if not members:
                rooms.pop(room, None)
                room_meta.pop(room, None)
            elif room in room_meta:
                room_meta[room]["memberCount"] = len(members)
    try:
        client.writer.close()
        await client.writer.wait_closed()
    except Exception:
        pass
    log.info("client left %s; clients=%d rooms=%d", client.peer, len(clients), len(rooms))


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    client = Client(reader=reader, writer=writer, peer=str(peer))
    try:
        headers = await read_http_headers(reader)
        if await handle_api(client, headers):
            writer.close()
            await writer.wait_closed()
            return
        if not await accept_websocket(client, headers):
            writer.close()
            await writer.wait_closed()
            return
        clients.add(client)
        log.info("client joined %s; clients=%d", client.peer, len(clients))
        while True:
            opcode, payload = await read_frame(client)
            if opcode == 0x8:  # close
                await send_close(client)
                break
            if opcode == 0x9:  # ping
                await send_frame(client, 0xA, payload)
                continue
            if opcode != 0x1:  # only text messages
                continue
            text = payload.decode("utf-8", errors="replace")
            try:
                msg = json.loads(text)
            except json.JSONDecodeError:
                continue
            room = str(msg.get("room", "")).strip().upper()
            if not room:
                continue
            game = safe_part(msg.get("game") or msg.get("gameId") or "generic")
            transport_room = f"{game}:{room}"
            client.rooms.add(transport_room)
            rooms.setdefault(transport_room, set()).add(client)
            update_room_meta(transport_room, game, room, msg, len(rooms[transport_room]))

            if msg.get("type") in {"create", "join", "requestState", "resume"}:
                await send_session_state(client, game, room)

            save_session(game, room, msg)

            if msg.get("type") == "persist":
                continue

            await broadcast(transport_room, text)
    except (asyncio.IncompleteReadError, ConnectionError, OSError):
        pass
    except Exception as exc:
        log.warning("client error %s: %s", client.peer, exc)
    finally:
        await cleanup(client)


async def main():
    host = os.environ.get("BRETTSPIELE_WS_BIND", "127.0.0.1")
    port = int(os.environ.get("BRETTSPIELE_WS_PORT", "8787"))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    RATINGS_DIR.mkdir(parents=True, exist_ok=True)
    AUTH_DIR.mkdir(parents=True, exist_ok=True)
    server = await asyncio.start_server(handle_client, host, port)
    log.info("brettspiele.fun relay/api listening on %s:%s", host, port)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    async with server:
        await stop.wait()
        server.close()
        await server.wait_closed()
        for client in list(clients):
            await cleanup(client)


if __name__ == "__main__":
    asyncio.run(main())
