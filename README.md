# brettspiele.fun — „Nicht noch eine Brettspielseite"

Digitaler Spieltisch im Browser: Räume per Link teilen, Spiele direkt starten —
ohne App, ohne Abo, ohne Regelheft, das die Party aufhält.

Der Quellcode dieser Seite ist der Quellcode, der unter
<https://brettspiele.fun> läuft.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `www/` | Die statische Seite: Startseite, Konten-/Admin-Oberfläche, Spiele-Studio und die Spiele selbst (reines HTML/CSS/JS, kein Build-Schritt) |
| `www/games/<spiel>/` | Ein Spiel je Ordner, mit `game.json`, `button.svg` und `i18n/<lang>.js` |
| `www/assets/` | Geteilte Bausteine: i18n-Laufzeit, Auth-Dialog, Bewertungen, Gamepad-Unterstützung, Sounds |
| `www/tools/generate_catalog.py` | Erzeugt `www/games/catalog.json` aus den Spielordnern |
| `ws/relay.py` | WebSocket-Raum-Relay (`/ws`) und `/api` (Konten, OAuth, Bewertungen, Studio, Admin) — reine Standardbibliothek, keine externen Pakete |
| `ws/codeterm.py` | Web-Terminal für Ersteller |
| `test/` | Testwerkzeuge (node/tidy/Playwright) |

Die Oberfläche gibt es in acht Sprachen (de, en, fr, es, it, ru, zh, ja).
Sichtbare Zeichenketten stehen nie im Markup, sondern in den
`i18n/<lang>.js`-Paketen und werden über `data-i18n`-Attribute bzw. `tr()`
aufgelöst.

Die Ansible-Rolle, die das Ganze auf dem Server ausrollt (nginx, systemd,
Härtung), gehört nicht zu diesem Repository.

## Lizenz

Dieses Projekt ist doppelt lizenziert — Software und Inhalte getrennt:

| Was | Lizenz |
|---|---|
| **Quellcode** (`*.js`, `*.py`, `*.html`, `*.css`, Konfiguration) | [GNU AGPL-3.0-or-later](LICENSE) |
| **Inhalte und Gestaltungsmaterial** (Spieltexte, Fragen, Kartendecks, Kartendaten, Regeltexte, Übersetzungen, Bilder, Icons, Wallpapers, Klänge) | [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt) |
| **Fremdkomponenten** (three.js, xterm.js, Modelle Dritter) | eigene Lizenzen — siehe [THIRD-PARTY.md](THIRD-PARTY.md) |

Copyright © 2026 <RECHTEINHABER EINTRAGEN>

### Was das bedeutet

Du darfst die Seite betreiben, verändern und weitergeben. **Wenn du eine
veränderte Fassung über ein Netzwerk anbietest** — also selbst eine Spieleseite
daraus machst —, musst du den Nutzern dieser Fassung ihren vollständigen
Quellcode unter derselben Lizenz zugänglich machen (AGPL § 13). Übernommene
Inhalte müssen mit Namensnennung und unter CC BY-SA 4.0 weitergegeben werden.

Wer den Code unter anderen Bedingungen einsetzen möchte, kann eine abweichende
Lizenz beim Rechteinhaber anfragen.

### Was nicht mitlizenziert ist

- **Name und Aufmachung.** „brettspiele.fun", „Nicht noch eine Brettspielseite"
  und die Spielnamen sind Kennzeichen des Betreibers; die Lizenzen erteilen
  daran keine Rechte. Eine eigene Fassung braucht einen eigenen Namen.
- **Nutzerinhalte.** Im Spiele-Studio erstellte Spiele gehören ihren
  Erstellerinnen und Erstellern und sind nicht Teil dieses Repositorys.

## Mitwirken

Beiträge sind willkommen. Mit dem Einreichen eines Beitrags stellst du ihn unter
dieselben Lizenzen: Code unter AGPL-3.0-or-later, Inhalte unter CC BY-SA 4.0.
