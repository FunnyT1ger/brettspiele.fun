# Fremdkomponenten

Dieses Projekt enthält Code und Material Dritter. Diese Bestandteile stehen
**nicht** unter der AGPL-3.0 dieses Projekts, sondern unter ihren eigenen,
nachfolgend genannten Lizenzen. Alle sind permissiv und mit der AGPL
kombinierbar; ihre Urheberrechts- und Lizenzhinweise müssen bei jeder
Weitergabe erhalten bleiben.

## three.js (r128)

- **Lizenz:** MIT (`LICENSES/MIT.txt`)
- **Copyright:** © 2010–2021 three.js Authors
- **Bezugsquelle:** https://threejs.org · https://github.com/mrdoob/three.js
- **Dateien:**
  - `www/games/warbound-atlas/three.min.js`
  - `www/games/gruftgesindel/three.min.js`
  - `www/games/gold-mile/three.min.js`
  - `www/games/kronenlande/play.html` (three.js ist in die Seite eingebettet)

## three.js Beispiel-Module (r128, `examples/js`)

- **Lizenz:** MIT (`LICENSES/MIT.txt`)
- **Copyright:** © 2010–2021 three.js Authors
- **Bezugsquelle:** https://github.com/mrdoob/three.js/tree/r128/examples/js
- **Dateien:**
  - `www/games/warbound-atlas/GLTFLoader.js`
  - `www/games/warbound-atlas/SkeletonUtils.js`
- **Hinweis:** Diese Dateien tragen im Original keinen eigenen Lizenzkopf; sie
  fallen unter die Lizenz des three.js-Repositorys.

## three.js (r164, ES-Modul)

- **Lizenz:** MIT (`LICENSES/MIT.txt`)
- **Copyright:** © 2010–2024 three.js Authors
- **Bezugsquelle:** https://github.com/mrdoob/three.js (Fassung 0.164.1)
- **Datei:** `www/assets/vendor/three/three.module.min-0.164.1.js`

## xterm.js (inkl. `addon-fit`)

- **Lizenz:** MIT (`LICENSES/MIT.txt`)
- **Copyright:** © 2017 The xterm.js authors · © 2014 The xterm.js authors ·
  © 2012–2013 Christopher Jeffrey
- **Bezugsquelle:** https://xtermjs.org · https://github.com/xtermjs/xterm.js
- **Dateien:** `www/assets/vendor/xterm/xterm.js`, `xterm.css`, `addon-fit.js`

## GuardedCastle — Ritter- und Bogenschützen-Modelle

- **Lizenz:** MIT (siehe `www/games/warbound-atlas/models/guarded/LICENSE`)
- **Copyright:** © 2018 Alex P
- **Bezugsquelle:** https://github.com/AlexP11223/Three.js_GuardedCastle
- **Dateien:** `www/games/warbound-atlas/models/guarded/` (`knight*.json`,
  `archer*.json`, `Knight.png`, `Archer.png` sowie die daraus offline
  konvertierten `*.mesh.json`)
- **Hinweis:** Laut Upstream-README stammen die Basis-Modelle und Texturen von
  opengameart.org. Details zur Konvertierung stehen in der README im Ordner.

## Natural Earth (Kartendaten für Warbound Atlas)

- **Lizenz:** Public Domain — Natural Earth stellt alle Raster- und Vektordaten
  gemeinfrei zur Verfügung; eine Namensnennung ist erlaubt, aber nicht verlangt.
- **Bezugsquelle:** https://www.naturalearthdata.com (Datensatz `admin_0`,
  Welt-Karte aus `ne_110m`)
- **Dateien:** `www/games/warbound-atlas/maps/europa/europa.js` und
  `www/games/warbound-atlas/maps/welt/welt.js` — beide sind abgeleitete Werke:
  aus den Ländergrenzen offline erzeugte, äquirektangular projizierte
  Territorien-Geometrie.
- **Nicht betroffen:** `maps/valcaryn/valcaryn.js` ist eine erfundene
  Fantasy-Karte ohne Fremddaten.

## Schriften (selbst gehostet)

- **Lizenz:** SIL Open Font License 1.1 (`LICENSES/OFL-1.1.txt`)
- **Bezugsquelle:** Google Fonts (fonts.google.com)
- **Dateien:** `www/assets/fonts/*.woff2` sowie die daraus erzeugten
  Stylesheets `core.css`, `gold-mile.css`, `gruftgesindel.css`, `nitpicker.css`
- **Familien:** Instrument Serif, Geist, Geist Mono, Cinzel, Jost, Creepster,
  Fredoka, Nunito, Bricolage Grotesque, Instrument Sans, Space Grotesk
- **Hinweis:** Die `@font-face`-Blöcke stammen unverändert aus der von Google
  ausgelieferten CSS, nur die `src`-Pfade zeigen auf das eigene Verzeichnis.
