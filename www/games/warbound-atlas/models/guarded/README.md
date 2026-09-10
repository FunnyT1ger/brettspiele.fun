# GuardedCastle-Modelle (Ritter & Bogenschütze)

Quelle: https://github.com/AlexP11223/Three.js_GuardedCastle (MIT-Lizenz, siehe LICENSE).
Laut Upstream-README stammen Basis-Modelle und Texturen von opengameart.org.

- `knight.json` / `archer_version_3.json` — Originale im three.js-JSON-v3-Format
  (io_three-Export, nur mit dem entfernten `THREE.JSONLoader` ladbar).
- `knight.mesh.json` / `archer.mesh.json` — daraus offline konvertierte, nicht
  indizierte BufferGeometry-Daten (`{position, normal, uv}` als flache Arrays;
  Quads in Dreiecke zerlegt, Vertex-Normalen übernommen). Diese Dateien lädt
  das Spiel (siehe `_GUARDED_FILES` in game.js).
- `Knight.png` / `Archer.png` — Diffuse-Texturen der Modelle (derzeit ungenutzt:
  die Figuren werden im Spiel einfarbig in Hausfarbe getönt, nur zur Provenienz
  mitgeführt).

Kennwerte (in `_GUARDED_DIMS` in game.js hinterlegt):

| Modell | yMin (Fußsohle) | Höhe |
|---|---|---|
| knight | −9.55 | 15.11 |
| archer | −10.48 | 17.77 |

Bei Neu-Konvertierung: Parser für das v3-Faces-Bitmask-Format nötig
(QUAD=1, MATERIAL=2, FACE_UV=4, FACE_VERTEX_UV=8, FACE_NORMAL=16,
FACE_VERTEX_NORMAL=32, FACE_COLOR=64, FACE_VERTEX_COLOR=128);
Quads werden als (0,1,3) + (1,2,3) trianguliert.
