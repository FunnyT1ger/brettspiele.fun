#!/usr/bin/env python3
"""Generate the brettspiele.fun game catalog from the games/ directory.

Drop a game into:

  games/<slug>/index.html
  games/<slug>/button.svg|png|jpg|jpeg|webp

Optionally add games/<slug>/game.json to control title, text, tags, etc.
The generated catalog is written to games/catalog.json and consumed by assets/site.js.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

IMAGE_CANDIDATES = (
    "button.svg", "button.png", "button.webp", "button.jpg", "button.jpeg",
    "cover.svg", "cover.png", "cover.webp", "cover.jpg", "cover.jpeg",
    "icon.svg", "icon.png", "icon.webp", "thumbnail.svg", "thumbnail.png", "thumbnail.webp",
)

DEFAULTS: dict[str, Any] = {
    "subtitle": "Browser game",
    "description": "Direkt im Browser spielbar.",
    "players": "Browser",
    "minutes": "Variabel",
    "category": "Game",
    "tags": [],
    "accent": "#c8492a",
    "theme": "custom",
    "enabled": True,
    "comingSoon": False,
    "order": 100,
}

KNOWN_ACCENTS = ["#f59e0b", "#65a8ff", "#57d68d", "#ff8a4c", "#b85cff", "#c8492a", "#d4a93a"]


def slug_to_title(slug: str) -> str:
    words = re.split(r"[-_]+", slug.strip())
    return " ".join(w[:1].upper() + w[1:] for w in words if w) or slug


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        raise SystemExit(f"Could not parse {path}: {exc}") from exc


def find_image(game_dir: Path) -> str | None:
    for name in IMAGE_CANDIDATES:
        if (game_dir / name).is_file():
            return name
    for child in sorted(game_dir.iterdir()):
        if child.is_file() and child.suffix.lower() in {".svg", ".png", ".jpg", ".jpeg", ".webp"}:
            return child.name
    return None


def normalize_localized(value: Any, default: Any = "") -> Any:
    if isinstance(value, dict):
        out = {str(k): str(v).strip() for k, v in value.items() if str(v).strip()}
        return out or normalize_localized(default, "")
    text = str(value if value is not None else default).strip()
    return text


def normalize_tags(value: Any) -> list[Any]:
    if isinstance(value, list):
        out: list[Any] = []
        for v in value:
            if isinstance(v, dict):
                item = normalize_localized(v)
                if item:
                    out.append(item)
            elif str(v).strip():
                out.append(str(v).strip())
        return out
    if isinstance(value, str):
        return [v.strip() for v in re.split(r"[,;|]", value) if v.strip()]
    return []


def load_project_registry(path: Path | None) -> dict[str, Any]:
    """Projekt-Registry des Relays (data/auth/projects.json): welche Spiele von
    Community-Nutzern stammen. Fehlt die Datei (oder ist unlesbar), gibt es
    schlicht keine Community-Markierung — der Katalog funktioniert weiter."""
    if not path:
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def build_catalog(web_root: Path, projects: dict[str, Any] | None = None) -> dict[str, Any]:
    games_dir = web_root / "games"
    games: list[dict[str, Any]] = []
    projects = projects or {}
    if not games_dir.exists():
        games_dir.mkdir(parents=True)

    for game_dir in sorted(p for p in games_dir.iterdir() if p.is_dir()):
        index_file = game_dir / "index.html"
        if not index_file.is_file():
            continue

        slug = game_dir.name
        meta = {**DEFAULTS, **read_json(game_dir / "game.json")}
        if meta.get("enabled") is False:
            continue

        image_field = str(meta.get("image") or "").strip()
        if image_field:
            # If the value already looks like a path (contains /), use it directly.
            # Otherwise treat it as a bare filename inside the game directory.
            image = image_field if "/" in image_field else f"games/{slug}/{image_field}"
        else:
            found = find_image(game_dir)
            image = f"games/{slug}/{found}" if found else "assets/favicon.svg"
        href = str(meta.get("href") or f"games/{slug}/")
        title = normalize_localized(meta.get("title"), slug_to_title(slug))
        accent = str(meta.get("accent") or KNOWN_ACCENTS[len(games) % len(KNOWN_ACCENTS)])

        # Community-Flag kommt aus der Server-Registry (nicht aus game.json),
        # damit Ersteller es nicht selbst umsetzen können.
        project = projects.get(slug) if isinstance(projects.get(slug), dict) else {}
        is_community = bool(project.get("community"))

        games.append({
            "id": slug,
            "community": is_community,
            "author": str(project.get("ownerDisplay") or project.get("owner") or "") if is_community else "",
            "title": title,
            "subtitle": normalize_localized(meta.get("subtitle"), DEFAULTS["subtitle"]),
            "description": normalize_localized(meta.get("description"), DEFAULTS["description"]),
            "players": normalize_localized(meta.get("players"), DEFAULTS["players"]),
            "minutes": normalize_localized(meta.get("minutes"), DEFAULTS["minutes"]),
            "category": normalize_localized(meta.get("category"), DEFAULTS["category"]),
            "tags": normalize_tags(meta.get("tags")),
            "accent": accent,
            "theme": str(meta.get("theme") or "custom"),
            "image": image,
            "href": href,
            "comingSoon": bool(meta.get("comingSoon")),
            "order": int(meta.get("order") or 100),
        })

    games.sort(key=lambda g: (g.get("order", 100), str(g.get("title", {}).get("en") if isinstance(g.get("title"), dict) else g.get("title", "")).lower()))
    return {
        "count": len(games),
        "games": games,
    }


SITE_URL = "https://brettspiele.fun"

# ---------------------------------------------------------------------------
# Internationalisation / hreflang
# ---------------------------------------------------------------------------
# German is served at the root and acts as x-default; every other language is
# prerendered as a static copy under /<lang>/ with a localized <head> (title,
# description, OG, canonical) and a full set of reciprocal hreflang alternates.
# The page body keeps its data-i18n attributes and is localized client-side by
# assets/i18n.js, which reads the <html data-locale="xx"> hint we inject here.
import os
import html as _html
from datetime import date
from urllib.parse import urljoin

LOCALES = ["de", "en", "fr", "es", "it", "ru", "zh", "ja"]
DEFAULT_LOCALE = "de"
HTML_LANG = {"zh": "zh-CN"}  # everything else maps to itself
OG_LOCALE = {
    "de": "de_DE", "en": "en_US", "fr": "fr_FR", "es": "es_ES",
    "it": "it_IT", "ru": "ru_RU", "zh": "zh_CN", "ja": "ja_JP",
}

# SEO meta descriptions for the home page, per language. Kept here rather than
# in the UI i18n packs because they are search-result copy, not interface text
# (and several packs do not carry a site.hero.lede for every language).
HOME_DESCRIPTIONS = {
    "de": "Kostenlose Brettspiele direkt im Browser: Würfeln, zeichnen, raten und Karten ausspielen — mit Raumcode für Mehrspieler, ohne App und ohne Konto.",
    "en": "Free board games right in your browser: roll dice, draw, guess and play cards — with room codes for multiplayer, no app and no account.",
    "fr": "Jeux de société gratuits directement dans le navigateur : lancer les dés, dessiner, deviner et jouer des cartes — avec code de salon en multijoueur, sans appli ni compte.",
    "es": "Juegos de mesa gratis directamente en el navegador: tirar dados, dibujar, adivinar y jugar cartas — con código de sala para multijugador, sin app ni cuenta.",
    "it": "Giochi da tavolo gratis direttamente nel browser: tira i dadi, disegna, indovina e gioca le carte — con codice stanza per il multiplayer, senza app e senza account.",
    "ru": "Бесплатные настольные игры прямо в браузере: бросайте кости, рисуйте, угадывайте и играйте картами — с кодом комнаты для мультиплеера, без приложения и аккаунта.",
    "zh": "直接在浏览器中畅玩的免费桌游：掷骰子、绘画、猜词和出牌——支持房间码多人游戏，无需应用、无需账号。",
    "ja": "ブラウザで遊べる無料ボードゲーム：サイコロ、お絵描き、当てっこ、カードプレイ——ルームコードでマルチプレイ、アプリ不要・アカウント不要。",
}

# Extensions treated as shared assets: in a localized page these are rewritten
# to root-absolute paths so they keep pointing at the single canonical copy
# under /assets/ or /games/, instead of a non-existent /<lang>/… sibling.
ASSET_EXTS = {
    ".css", ".js", ".mjs", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico",
    ".webp", ".woff", ".woff2", ".mp3", ".wav", ".ogg", ".json", ".map",
}

HREFLANG_BEGIN = "<!--hreflang:auto-->"
HREFLANG_END = "<!--/hreflang:auto-->"


def esc_attr(value: Any) -> str:
    return _html.escape(str(value), quote=True)


def esc_text(value: Any) -> str:
    return _html.escape(str(value), quote=False)


def localize_value(value: Any, locale: str) -> str:
    if isinstance(value, dict):
        return value.get(locale) or value.get("en") or value.get("de") or next(iter(value.values()), "")
    return str(value or "")


def read_site_title(web_root: Path, locale: str) -> str | None:
    pack = web_root / "assets" / "i18n" / f"{locale}.js"
    if not pack.is_file():
        return None
    m = re.search(r'"site\.title"\s*:\s*"((?:[^"\\]|\\.)*)"', pack.read_text(encoding="utf-8"))
    if not m:
        return None
    try:
        return json.loads('"' + m.group(1) + '"')
    except Exception:
        return m.group(1)


def page_url(locale: str, path: str) -> str:
    prefix = "" if locale == DEFAULT_LOCALE else f"/{locale}"
    return f"{SITE_URL}{prefix}{path}"


def hreflang_block(path: str) -> str:
    links = [HREFLANG_BEGIN]
    for loc in LOCALES:
        links.append(f'<link rel="alternate" hreflang="{loc}" href="{page_url(loc, path)}" />')
    links.append(f'<link rel="alternate" hreflang="x-default" href="{SITE_URL}{path}" />')
    links.append(HREFLANG_END)
    return "\n  ".join(links)


def inject_hreflang(html_str: str, path: str) -> str:
    # Idempotent: drop any previously injected block first, then re-insert a
    # fresh one right after the canonical link.
    html_str = re.sub(
        r"\n?\s*" + re.escape(HREFLANG_BEGIN) + r".*?" + re.escape(HREFLANG_END),
        "", html_str, flags=re.S,
    )
    block = hreflang_block(path)
    return re.sub(
        r'<link rel="canonical"[^>]*>',
        lambda m: m.group(0) + "\n  " + block,
        html_str, count=1,
    )


def rewrite_assets(html_str: str, src_dir: str) -> str:
    def repl(m: "re.Match[str]") -> str:
        attr, val = m.group(1), m.group(2)
        v = val.strip()
        if not v or v[0] in "#?" or v.startswith(
            ("http://", "https://", "//", "data:", "mailto:", "tel:", "/")
        ):
            return m.group(0)
        clean = v.split("?", 1)[0].split("#", 1)[0]
        if os.path.splitext(clean)[1].lower() in ASSET_EXTS:
            return f'{attr}="{urljoin(src_dir, v)}"'
        return m.group(0)

    return re.sub(r'\b(src|href)="([^"]*)"', repl, html_str)


def set_meta(html_str: str, ident: str, value: str, attr: str = "content", tag: str = "meta") -> str:
    pattern = re.compile(
        r"(<" + tag + r"\s+[^>]*?" + ident + r"[^>]*?\b" + attr + r'=")[^"]*(")'
    )
    return pattern.sub(lambda m: m.group(1) + esc_attr(value) + m.group(2), html_str, count=1)


def localize_page(html_str: str, path: str, locale: str, title: str, description: str) -> str:
    html_str = rewrite_assets(html_str, path)

    htmllang = HTML_LANG.get(locale, locale)
    html_str = re.sub(r'(<html\b[^>]*\blang=")[^"]*(")', r"\g<1>" + htmllang + r"\g<2>", html_str, count=1)
    html_str = re.sub(r"<html\b", f'<html data-locale="{locale}"', html_str, count=1)

    html_str = re.sub(
        r"(<title\b[^>]*>).*?(</title>)",
        lambda m: m.group(1) + esc_text(title) + m.group(2),
        html_str, count=1, flags=re.S,
    )

    loc_url = page_url(locale, path)
    html_str = set_meta(html_str, r'name="description"', description)
    html_str = set_meta(html_str, r'rel="canonical"', loc_url, attr="href", tag="link")
    html_str = set_meta(html_str, r'property="og:url"', loc_url)
    html_str = set_meta(html_str, r'property="og:title"', title)
    html_str = set_meta(html_str, r'property="og:description"', description)
    html_str = set_meta(html_str, r'property="og:locale"', OG_LOCALE.get(locale, "en_US"))
    html_str = set_meta(html_str, r'name="twitter:title"', title)
    html_str = set_meta(html_str, r'name="twitter:description"', description)

    return inject_hreflang(html_str, path)


def page_targets(web_root: Path, catalog: dict[str, Any]) -> list[dict[str, Any]]:
    """One entry per indexable page: its URL path, source file and metadata."""
    targets: list[dict[str, Any]] = [{
        "path": "/",
        "source": web_root / "index.html",
        "priority": "1.0",
        "title": {loc: (read_site_title(web_root, loc) or HOME_DESCRIPTIONS.get(loc, "")) for loc in LOCALES},
        "description": dict(HOME_DESCRIPTIONS),
    }]
    for game in catalog["games"]:
        rel = game["href"].lstrip("./").rstrip("/")  # e.g. "games/wurfwerk"
        targets.append({
            "path": f"/{rel}/",
            "source": web_root / rel / "index.html",
            "priority": "0.8",
            "title": {loc: f"{localize_value(game['title'], loc)} – brettspiele.fun" for loc in LOCALES},
            "description": {loc: localize_value(game["description"], loc) for loc in LOCALES},
        })
    return targets


def write_if_changed(path: Path, content: str) -> bool:
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    try:
        os.chmod(path, 0o644)
    except OSError:
        pass
    return True


def build_localized_pages(web_root: Path, catalog: dict[str, Any]) -> bool:
    """(Re)render the /<lang>/ localized page copies from the German sources.

    The German base pages are NOT written here: they carry their hreflang block
    statically in the repo, so the Ansible copy step stays idempotent (the
    deployed file always equals the source). This generator only owns the
    localized copies, which live solely on the server and never flap.
    """
    targets = page_targets(web_root, catalog)
    desired: dict[Path, str] = {}

    for tgt in targets:
        source: Path = tgt["source"]
        if not source.is_file():
            continue
        src_html = source.read_text(encoding="utf-8")
        # Localized copies.
        for locale in LOCALES:
            if locale == DEFAULT_LOCALE:
                continue
            rel = tgt["path"].strip("/")
            dest = web_root / locale / rel / "index.html" if rel else web_root / locale / "index.html"
            desired[dest] = localize_page(
                src_html, tgt["path"], locale,
                tgt["title"][locale], tgt["description"][locale],
            )

    changed = False
    for path, content in desired.items():
        if write_if_changed(path, content):
            changed = True

    # Remove stale generated pages (e.g. a game that was deleted).
    for locale in LOCALES:
        if locale == DEFAULT_LOCALE:
            continue
        locale_dir = web_root / locale
        if not locale_dir.is_dir():
            continue
        for stale in locale_dir.rglob("index.html"):
            if stale not in desired:
                stale.unlink()
                changed = True
    return changed


def build_sitemap(catalog: dict[str, Any]) -> str:
    today = date.today().isoformat()
    pages = [("/", "1.0")]
    for game in catalog["games"]:
        pages.append((f"/{game['href'].lstrip('./').rstrip('/')}/", "0.8"))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]
    for path, priority in pages:
        alternates = [
            f'    <xhtml:link rel="alternate" hreflang="{loc}" href="{page_url(loc, path)}"/>'
            for loc in LOCALES
        ]
        alternates.append(
            f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE_URL}{path}"/>'
        )
        for loc in LOCALES:
            lines.append(f"  <url><loc>{page_url(loc, path)}</loc>"
                         f"<lastmod>{today}</lastmod><priority>{priority}</priority>")
            lines.extend(alternates)
            lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--web-root", default="/var/www/brettspiele.fun", help="Path to deployed web root")
    parser.add_argument("--projects-file", default="", help="Relay project registry (auth/projects.json) for community flags")
    args = parser.parse_args()

    web_root = Path(args.web_root).resolve()
    projects = load_project_registry(Path(args.projects_file) if args.projects_file else None)
    catalog = build_catalog(web_root, projects)
    out = web_root / "games" / "catalog.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    new_content = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    old_content = out.read_text(encoding="utf-8") if out.exists() else None
    changed = old_content != new_content
    if changed:
        out.write_text(new_content, encoding="utf-8")

    sitemap_out = web_root / "sitemap.xml"
    new_sitemap = build_sitemap(catalog)
    old_sitemap = sitemap_out.read_text(encoding="utf-8") if sitemap_out.exists() else None
    # Compare ignoring the <lastmod> dates so an unrelated daily re-deploy
    # doesn't churn the file (and "changed" status) every single day.
    strip_lastmod = lambda s: re.sub(r"<lastmod>.*?</lastmod>", "", s)
    if strip_lastmod(old_sitemap or "") != strip_lastmod(new_sitemap):
        sitemap_out.write_text(new_sitemap, encoding="utf-8")
        changed = True

    # Localized (hreflang) pages: German base + /<lang>/ prerenders.
    if build_localized_pages(web_root, catalog):
        changed = True

    locales = len(LOCALES)
    if changed:
        print(f"changed: generated catalog + sitemap + {locales} locales with {catalog['count']} game(s)")
    else:
        print(f"ok: catalog, sitemap and {locales} locales already current with {catalog['count']} game(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
