/* ============================================================================
   Warbound Atlas — 3D RENDERING ENGINE (Three.js)
   Extrahiert aus game.js (2026-07-26). Enthält: Scene/Kamera/Lights, Ocean-
   & Foam-Shader, Terrain/Territorien, Dekorationen (Berge/Wälder/Felder/
   Sümpfe), Insel-Terrain, Fog/Clouds, Labels, Controls, Selection, Render-
   Loop, Integration-API (window.map3d_*), Figuren-/Belagerungs-/Städte-/
   Häfen-/Banner-Systeme.

   LADEREIHENFOLGE (index.html): NACH game.js, VOR i18n/*.js + map3d.js.
   Grund: Top-Level-Code hier liest __WB_MAP/REGIONS aus game.js; map3d.js
   (WB_TX) und die i18n-Packs werden erst zur Laufzeit gebraucht.
   Alles teilt weiterhin den globalen Scope mit game.js (kein Modul-Bundling).
   ============================================================================ */

/* ===== VALCARYN 3D MAP (embedded) ===== */

/* === TERRITORY DATA === */
const ALL_TERRITORIES = __WB_MAP.allTerritories || [];
/* Filter out _islands: user wants everything outside named territories to be water */
/* === TERRITORY OVERRIDES ============================================
   Fill in missing names, reassign the _islands cluster into two new
   playable regions (Vergessene Inseln in the NE, Ostmeer Archipel in
   the SE). Applied to ALL_TERRITORIES before the filter, so the new
   island groups pass through into TERRITORIES and become clickable. */
const TERRITORY_OVERRIDES = __WB_MAP.territoryOverrides || {};
ALL_TERRITORIES.forEach(t => {
  const o = TERRITORY_OVERRIDES[t.id];
  if (!o) return;
  if (o.label !== undefined) t.label = o.label;
  if (o.group !== undefined) t.group = o.group;
});

/* Strip "_N" suffix from labels — pieces like "Storm Bay_1", "Storm Bay_2"
   are subdivisions of the same-named main territory. Strip the suffix so
   they all share one canonical name; the sibling map built later groups
   them for select/highlight/counting. */
ALL_TERRITORIES.forEach(t => {
  if (t.label) t.label = t.label.replace(/_\d+$/, '');
});

/* === LABEL TRANSLATIONS ==============================================
   Originally the SVG mixed German and English labels. After the suffix
   strip we map every remaining English label to its German equivalent
   so the whole map speaks one language. */
const LABEL_TRANSLATIONS = __WB_MAP.labelTranslations || {};
ALL_TERRITORIES.forEach(t => {
  if (t.label && LABEL_TRANSLATIONS[t.label]) {
    t.label = LABEL_TRANSLATIONS[t.label];
  }
});

const TERRITORIES = ALL_TERRITORIES.filter(t => t.group !== '_islands');

const MAP3D_REGIONS = __WB_MAP.map3dRegions || {};
const HOUSES = __WB_MAP.houses || {};

/* === SVG PATH PARSER === */
function parsePathToShapes(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g) || [];
  const shapes = []; let current = null;
  let x=0, y=0, startX=0, startY=0;
  let prevCtrl = null; let i=0; let cmd='';
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/[a-zA-Z]/.test(tok)) { cmd = tok; i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    if (upper === 'M') {
      const nx = parseFloat(tokens[i]); const ny = parseFloat(tokens[i+1]);
      x = rel ? x + nx : nx; y = rel ? y + ny : ny;
      current = new THREE.Shape(); current.moveTo(x, -y);
      shapes.push(current); startX = x; startY = y; i += 2;
      cmd = rel ? 'l' : 'L'; prevCtrl = null;
    } else if (upper === 'L') {
      const nx = parseFloat(tokens[i]); const ny = parseFloat(tokens[i+1]);
      x = rel ? x + nx : nx; y = rel ? y + ny : ny;
      current.lineTo(x, -y); i += 2; prevCtrl = null;
    } else if (upper === 'H') {
      const nx = parseFloat(tokens[i]); x = rel ? x + nx : nx;
      current.lineTo(x, -y); i += 1; prevCtrl = null;
    } else if (upper === 'V') {
      const ny = parseFloat(tokens[i]); y = rel ? y + ny : ny;
      current.lineTo(x, -y); i += 1; prevCtrl = null;
    } else if (upper === 'C') {
      const cx1 = rel ? x + parseFloat(tokens[i])   : parseFloat(tokens[i]);
      const cy1 = rel ? y + parseFloat(tokens[i+1]) : parseFloat(tokens[i+1]);
      const cx2 = rel ? x + parseFloat(tokens[i+2]) : parseFloat(tokens[i+2]);
      const cy2 = rel ? y + parseFloat(tokens[i+3]) : parseFloat(tokens[i+3]);
      const nx  = rel ? x + parseFloat(tokens[i+4]) : parseFloat(tokens[i+4]);
      const ny  = rel ? y + parseFloat(tokens[i+5]) : parseFloat(tokens[i+5]);
      current.bezierCurveTo(cx1, -cy1, cx2, -cy2, nx, -ny);
      x = nx; y = ny; prevCtrl = { x: cx2, y: cy2 }; i += 6;
    } else if (upper === 'S') {
      const cx2 = rel ? x + parseFloat(tokens[i])   : parseFloat(tokens[i]);
      const cy2 = rel ? y + parseFloat(tokens[i+1]) : parseFloat(tokens[i+1]);
      const nx  = rel ? x + parseFloat(tokens[i+2]) : parseFloat(tokens[i+2]);
      const ny  = rel ? y + parseFloat(tokens[i+3]) : parseFloat(tokens[i+3]);
      const cx1 = prevCtrl ? 2*x - prevCtrl.x : x;
      const cy1 = prevCtrl ? 2*y - prevCtrl.y : y;
      current.bezierCurveTo(cx1, -cy1, cx2, -cy2, nx, -ny);
      x = nx; y = ny; prevCtrl = { x: cx2, y: cy2 }; i += 4;
    } else if (upper === 'Q') {
      const cx1 = rel ? x + parseFloat(tokens[i])   : parseFloat(tokens[i]);
      const cy1 = rel ? y + parseFloat(tokens[i+1]) : parseFloat(tokens[i+1]);
      const nx  = rel ? x + parseFloat(tokens[i+2]) : parseFloat(tokens[i+2]);
      const ny  = rel ? y + parseFloat(tokens[i+3]) : parseFloat(tokens[i+3]);
      current.quadraticCurveTo(cx1, -cy1, nx, -ny);
      x = nx; y = ny; prevCtrl = { x: cx1, y: cy1, q: true }; i += 4;
    } else if (upper === 'T') {
      const nx = rel ? x + parseFloat(tokens[i])   : parseFloat(tokens[i]);
      const ny = rel ? y + parseFloat(tokens[i+1]) : parseFloat(tokens[i+1]);
      const cx1 = (prevCtrl && prevCtrl.q) ? 2*x - prevCtrl.x : x;
      const cy1 = (prevCtrl && prevCtrl.q) ? 2*y - prevCtrl.y : y;
      current.quadraticCurveTo(cx1, -cy1, nx, -ny);
      x = nx; y = ny; prevCtrl = { x: cx1, y: cy1, q: true }; i += 2;
    } else if (upper === 'Z') {
      if (current) { current.lineTo(startX, -startY); current.autoClose = true; }
      x = startX; y = startY; prevCtrl = null;
    } else { i += 1; }
  }
  return shapes;
}

/* === SCENE SETUP === */
const wrap = document.getElementById('canvas-wrap');

/* Sichtbare Meldung, falls WebGL fehlt (statt schwarzem Bildschirm). Firefox
   deaktiviert WebGL z.B. nach mehreren GPU-Prozess-Abstürzen — dann hilft nur
   ein kompletter Browser-Neustart. */
function _wbShowWebGLError(){
  try{
    if(document.getElementById('wbWebglError')) return;
    const d = document.createElement('div');
    d.id = 'wbWebglError';
    d.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;max-width:560px;background:#2a1414;color:#f4d9c0;border:1px solid #d4a84f;border-radius:10px;padding:14px 18px;font:14px/1.5 Georgia,serif;box-shadow:0 6px 24px rgba(0,0,0,.5);text-align:center';
    d.innerHTML = '<b>3D-Karte kann nicht starten</b><br>Der Browser konnte keinen WebGL-/Grafikkontext erstellen. '+
      'Bitte den <b>Browser komplett schließen und neu starten</b> und die Hardware-Beschleunigung aktiviert lassen '+
      '(Firefox: Einstellungen → „Empfohlene Leistungseinstellungen verwenden"). Das Menü funktioniert weiterhin.';
    (document.body||document.documentElement).appendChild(d);
  }catch(e){}
}

/* Renderer-Erzeugung absichern: schlägt die WebGL-Kontext-Erstellung fehl, darf
   NICHT das ganze Skript abbrechen (sonst bliebe alles schwarz, auch das Menü,
   und Folgefehler wie 'labelGroup' vor Initialisierung würden auftreten). Statt-
   dessen ein No-Op-Stub-Renderer, damit die Lobby & Navigation weiter laufen. */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.width  = '100%';
  renderer.domElement.style.height = '100%';
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  /* autoUpdate bleibt an: die Banner (Tuch im Wind + Kamera-Billboard-Drehung,
     siehe render()) animieren JEDEN Frame, nicht nur Terrain/Gebäude. Eine
     einmal eingefrorene Schattenkarte (frühere Optimierung) zeigte dadurch
     Schatten, die nicht zur aktuellen Tuch-Pose bzw. Kameraposition passten. */
  wrap.appendChild(renderer.domElement);
} catch (err) {
  console.error('[warbound] WebGL nicht verfügbar — 3D deaktiviert:', err);
  _wbShowWebGLError();
  const _cv = document.createElement('canvas');
  _cv.style.width = '100%'; _cv.style.height = '100%';
  renderer = {
    domElement: _cv,
    setPixelRatio(){}, setSize(){}, render(){},
    shadowMap: { enabled: false, type: 0 }
  };
  try { if(wrap) wrap.appendChild(_cv); } catch(e){}
}

const scene = new THREE.Scene();
/* Hintergrund der 3D-Szene explizit setzen (Canvas läuft mit alpha:true, sonst
   schien der fast schwarze Seiten-Hintergrund #06080d durch). WICHTIG beim
   Rauszoomen: die animierte Ozean-Ebene ist endlich (1400×1400, Rand bei ±700);
   bei vollem Zoom blickt die Kamera über diesen Rand hinaus, wo KEINE See-
   Geometrie ist — dieses Horizont-Band wurde ohne Background schwarz → die Karte
   „wurde dunkel". Der Background wird in render() zoom-abhängig geblendet:
   bei Standardzoom = Fog-Farbe (dunkler, atmosphärischer Horizont wie bisher),
   beim Rauszoomen = helle See (uShallow-nah), damit die Karte voll herausgezoomt
   hell erscheint. Der Background wird NICHT vom Fog getönt. */
const BG_NEAR = new THREE.Color(0x0a1426);   // Standardzoom: passt zum Fog
const BG_FAR  = new THREE.Color(0x5794c2);   // ganz herausgezoomt: helle See (= uSeaLift-Farbe)
scene.background = new THREE.Color().copy(BG_NEAR);
scene.fog = new THREE.Fog(0x0a1426, 250, 700);
/* Standard-Fog (near 250 / far 700 bei radius 420). Beim Rauszoomen wird der Fog
   in render() ausgeblendet (near/far weit hinausgeschoben), damit die Karte bei
   vollem Zoom HELL erleuchtet erscheint statt zur dunklen Fog-Farbe (0x0a1426) zu
   blenden. Am/unter dem Standard-Radius bleibt der atmosphärische Look exakt. */
const FOG_BASE_RADIUS = 420;
const FOG_BASE_NEAR   = 250;
const FOG_BASE_FAR    = 700;
const camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 1, 2000);

const CX = 407 / 2;
const CY = 271 / 2;

/* Per-map horizontal enlargement of the whole board. The SVG coords live in a
   fixed ~407×271 envelope (see CX/CY); MAP_SCALE blows the *world* geometry up
   about the map centre (origin) WITHOUT touching the source data, so the camera
   /ocean/shadow tuning stays valid. Because the name-labels keep a fixed sprite
   size, a bigger board also pushes dense country names apart (fixes the Europa
   label overlap). Read per-map from `mapScale` (default 1.0) — Valcaryn keeps
   1.0 so its hand-placed continent labels stay aligned. Height (extrude depth)
   is deliberately NOT scaled, only the X/Z plane. */
const MAP_SCALE = (typeof __WB_MAP.mapScale === 'number' && __WB_MAP.mapScale > 0)
  ? __WB_MAP.mapScale : 1;
/* Per-map Verkleinerungs-Multiplikatoren gegen ein überladenes Bild (Standard 1.0).
   OBJ_SCALE skaliert Burgen + Städte, LABEL_SCALE die kleinen Gebietsnamen. Nur
   die Darstellungsgröße — Position/Fußabdruck bleiben. Nur die dichte Europa-Karte
   setzt <1; Valcaryn/Sturmsee bleiben 1.0. */
const OBJ_SCALE = (typeof __WB_MAP.objectScale === 'number' && __WB_MAP.objectScale > 0)
  ? __WB_MAP.objectScale : 1;
const LABEL_SCALE = (typeof __WB_MAP.labelScale === 'number' && __WB_MAP.labelScale > 0)
  ? __WB_MAP.labelScale : 1;

camera.position.set(0, 320, 280);
camera.lookAt(0, 0, 0);

/* === LIGHTS === */
scene.add(new THREE.AmbientLight(0x6e7d99, 0.45));
const key = new THREE.DirectionalLight(0xffe6b8, 1.05);
key.position.set(-180, 220, 100); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -330; key.shadow.camera.right = 330;
key.shadow.camera.top = 330;   key.shadow.camera.bottom = -330;
key.shadow.camera.near = 1;    key.shadow.camera.far = 600;
key.shadow.bias = -0.0008;
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.35);
rim.position.set(200, 100, -200); scene.add(rim);
scene.add(new THREE.HemisphereLight(0x4a6080, 0x1a1620, 0.4));

/* === ANIMATED OCEAN (custom shader) === */
const seaGeo = new THREE.PlaneGeometry(1400, 1400, 220, 220);
const seaUniforms = {
  uTime: { value: 0 },
  uDeep: { value: new THREE.Color(0x05101c) },
  uShallow: { value: new THREE.Color(0x143656) },
  uSpec: { value: new THREE.Color(0x9bb8d8) },
  uSunDir: { value: new THREE.Vector3(-180, 220, 100).normalize() },
  /* Obergrenze des Tiefen-Tints (0 = überall hell/uShallow, 0.5 = Standard).
     Wird je Frame in render() heruntergefahren, je weiter man rauszoomt, damit
     die offene See bei vollem Zoom hell bleibt statt nach Schwarz zu laufen. */
  uDepthMax: { value: 0.5 },
  /* 0 = Standard-See (dunkles Navy), 1 = zu hellem Blau angehoben. In render()
     mit zunehmendem Zoom hochgefahren, damit die herausgezoomte Karte hell wirkt. */
  uSeaLift: { value: 0 }
};
const seaMat = new THREE.ShaderMaterial({
  uniforms: seaUniforms,
  vertexShader: `
    uniform float uTime;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vHeight;

    // gerstner-like wave
    vec3 wave(vec2 p, vec2 dir, float amp, float freq, float speed, float t) {
      float phase = dot(p, dir) * freq + t * speed;
      float s = sin(phase);
      float c = cos(phase);
      // displacement: x,z shift + y rise
      return vec3(dir.x * c * amp * 0.3, s * amp, dir.y * c * amp * 0.3);
    }
    void main() {
      vec3 pos = position;
      vec2 p2 = pos.xy;  // before rotation, plane is XY
      // Three wave layers in different directions
      vec3 w = vec3(0.0);
      w += wave(p2, normalize(vec2( 1.0,  0.4)), 0.40, 0.045, 1.3, uTime);
      w += wave(p2, normalize(vec2(-0.5,  1.0)), 0.25, 0.07, 1.8, uTime);
      w += wave(p2, normalize(vec2( 0.3, -0.8)), 0.15, 0.13, 2.4, uTime);
      pos.xy += w.xz; // x and z displacement in plane-local
      pos.z += w.y;   // height (z is up before rotation)
      vHeight = w.y;
      vec4 wp = modelMatrix * vec4(pos, 1.0);
      vWorld = wp.xyz;
      // approximate normal from wave derivatives
      vec3 dpdx = vec3(1.0, 0.0, 0.0) +
        0.045 * cos(dot(p2, normalize(vec2( 1.0,  0.4))) * 0.045 + uTime * 1.3) * 1.1 * vec3(0.0,0.0,1.0);
      vNormal = normalize(vec3(-w.y*0.5, 1.0, -w.y*0.5));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    uniform vec3 uSpec;
    uniform vec3 uSunDir;
    uniform float uDepthMax;
    uniform float uSeaLift;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vHeight;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      float a = hash(i), b = hash(i + vec2(1,0));
      float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }
    void main() {
      // Depth tint: deeper toward center distance from origin gives darker.
      // Obergrenze uDepthMax wird beim Rauszoomen heruntergefahren (s. render()),
      // damit die offene See bei vollem Zoom hell bleibt statt nach Schwarz (uDeep)
      // zu laufen. Der Ozean-Shader ist NICHT vom scene.fog erfasst, daher separat.
      float depth = min(length(vWorld.xz) * 0.001, uDepthMax);
      vec3 col = mix(uShallow, uDeep, depth);
      // Crest highlight
      float crest = smoothstep(0.22, 0.55, vHeight);
      col = mix(col, uSpec, crest * 0.55);
      // moving sparkles
      float spark = noise(vWorld.xz * 0.6 + vec2(uTime * 0.3, uTime * 0.2));
      spark = pow(spark, 8.0);
      col += vec3(0.6, 0.7, 0.9) * spark * 0.6;
      // gentle sun spec
      vec3 V = normalize(cameraPosition - vWorld);
      float specT = max(dot(reflect(-uSunDir, vNormal), V), 0.0);
      col += uSpec * pow(specT, 28.0) * 0.4;
      // Beim Rauszoomen die ganze See zu einem hellen Blau anheben (uSeaLift in
      // render()). Ohne das wirkt die Karte herausgezoomt dunkel, weil immer mehr
      // dunkle Navy-See (uShallow) das Bild füllt, während helles Land verschwindet.
      col = mix(col, vec3(0.34, 0.58, 0.76), uSeaLift);
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
const sea = new THREE.Mesh(seaGeo, seaMat);
sea.rotation.x = -Math.PI/2;
sea.position.y = -0.5;
sea.receiveShadow = true;
scene.add(sea);

/* === SHARED COAST FOAM SHADER === */
const foamUniforms = { uTime: { value: 0 } };
const foamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: foamUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWorld;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      float a = hash(i), b = hash(i + vec2(1,0));
      float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }
    float fbm(vec2 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) {
        s += a * noise(p); p *= 2.03; a *= 0.5;
      }
      return s;
    }

    void main() {
      // vUv.x: 0 = territory edge (coast), 1 = far out at sea
      // vUv.y: parametric position along the perimeter (0..1)
      float coast = 1.0 - vUv.x;

      // Rolling wave breaking inward toward coast
      float roll = 1.0 - smoothstep(0.0, 0.85, vUv.x);

      // Wave bands moving along perimeter
      float band1 = sin(vUv.y * 90.0 - uTime * 1.6) * 0.5 + 0.5;
      float band2 = sin(vUv.y * 50.0 + uTime * 1.0 + vUv.x * 6.0) * 0.5 + 0.5;
      float pulse = mix(band1, band2, 0.5);
      pulse = pow(pulse, 1.6);

      // Foam noise (turbulent surf)
      float n = fbm(vWorld.xz * 0.45 + vec2(uTime * 0.35, -uTime * 0.25));
      float n2 = fbm(vWorld.xz * 1.7 - vec2(uTime * 0.15, uTime * 0.4));

      // Main foam: strong at coast, modulated by pulse and noise
      float foam = roll * (0.35 + 0.65 * pulse) * (0.4 + 0.7 * n);
      // Speckled spray further out
      foam += pow(n2, 3.0) * smoothstep(0.0, 0.5, coast) * 0.7;
      // Inner bright crest right at coast
      foam += pow(coast, 4.0) * (0.6 + 0.4 * sin(uTime * 3.0 + vUv.y * 60.0));

      foam = clamp(foam, 0.0, 1.0);
      if (foam < 0.04) discard;

      // Color: pure white at peak, soft sea-foam at edges
      vec3 base = mix(vec3(0.55, 0.72, 0.82), vec3(1.0, 1.0, 0.98), foam);
      // Slight cyan tint where foam thins
      base = mix(base, vec3(0.7, 0.85, 0.95), 0.3 * (1.0 - foam));

      gl_FragColor = vec4(base, foam * 0.92);
    }
  `
});

/* Build a coastline foam ring around a shape.
   Inner edge: slightly inset (-1.0) so it tucks under the territory bevel.
   Outer edge: extends outward by `outer` units into the water. */
function buildCoastFoam(shape, inset = 1.0, outer = 6.0) {
  // Sample the shape perimeter
  let pts;
  try { pts = shape.getPoints(8); } catch (e) { return null; }
  if (!pts || pts.length < 4) return null;
  // Remove duplicate closing point if present
  if (pts.length > 2) {
    const a = pts[0], b = pts[pts.length-1];
    if (Math.hypot(a.x-b.x, a.y-b.y) < 0.001) pts = pts.slice(0, -1);
  }
  if (pts.length < 4) return null;

  // Centroid
  let cx=0, cy=0;
  pts.forEach(p => { cx += p.x; cy += p.y; });
  cx /= pts.length; cy /= pts.length;

  // Signed area to know winding (for outward normal direction)
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i+1) % pts.length];
    area += p.x * q.y - q.x * p.y;
  }
  const ccw = area > 0; // 1 if counterclockwise

  const positions = [], uvs = [];
  // Track running perimeter length for uv.y
  const segLens = [];
  let totalLen = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1) % pts.length];
    const L = Math.hypot(b.x-a.x, b.y-a.y);
    segLens.push(L); totalLen += L;
  }
  let runLen = 0;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[(i-1 + pts.length) % pts.length];
    const next = pts[(i+1) % pts.length];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty);
    let nx, ny;
    if (tl < 1e-5) {
      const dx = p.x - cx, dy = p.y - cy;
      const dl = Math.hypot(dx, dy) || 1;
      nx = dx/dl; ny = dy/dl;
    } else {
      // perpendicular to tangent. choose outward by winding.
      // For CCW polygon, outward is (ty, -tx). For CW, (-ty, tx).
      nx = ccw ? ty/tl : -ty/tl;
      ny = ccw ? -tx/tl : tx/tl;
      // sanity check vs centroid (in case of weird concavities)
      const dx = p.x - cx, dy = p.y - cy;
      if (nx*dx + ny*dy < 0) { nx = -nx; ny = -ny; }
    }
    const uvy = runLen / totalLen;
    // inner (inset slightly into territory so it tucks under)
    positions.push(p.x - nx*inset, p.y - ny*inset, 0);
    uvs.push(0, uvy);
    // outer (extends into water)
    positions.push(p.x + nx*outer, p.y + ny*outer, 0);
    uvs.push(1, uvy);
    runLen += segLens[i];
  }

  // Build triangle strip indices, wrapping around
  const indices = [];
  for (let i = 0; i < pts.length; i++) {
    const a = i*2, b = i*2+1;
    const next = (i+1) % pts.length;
    const c = next*2, d = next*2+1;
    indices.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  // Same transform as territory (shape XY -> world XZ, centered, then MAP_SCALE)
  geo.translate(-CX, CY, 0);
  geo.scale(MAP_SCALE, MAP_SCALE, 1);
  geo.rotateX(-Math.PI/2);
  geo.translate(0, 0.35, 0); // lift slightly above water rest

  const mesh = new THREE.Mesh(geo, foamMat);
  mesh.renderOrder = 2;
  return mesh;
}

/* === BUILD TERRITORIES === */
/* ── Aufgeschobener Welt-Aufbau ────────────────────────────────────────────
   Der komplette 3D-Welt-Aufbau (Terrain-Extrusion, strukturelle Lookups,
   Berge/Wälder/Felder/Sümpfe/Insel-Props/Nebel) lief bisher SYNCHRON beim
   Parsen dieser Datei und blockierte damit das load-Event: Landkarten brauchten
   ~20-40s (Headless-Chromium), sodass der Browsertest (30s) flaky scheiterte
   (Naval ohne Land-Aufbau: ~6s). Lobby & Menü brauchen die 3D-Szene aber gar
   nicht. Die schweren Füll-Schleifen werden daher als Thunks gesammelt und erst
   NACH dem load-Event (Leerlauf) gebaut — spätestens synchron beim ersten
   renderMap(). Alle Ziel-Container (territoryMeshes, …-Maps, Groups) bleiben als
   leere Deklaration am Parse-Punkt; nur ihr Befüllen wird verschoben. Objekt-
   Identität & Registrierungs-Reihenfolge (= Code-Reihenfolge) bleiben erhalten,
   daher auch die deterministische fseed-Platzierung. */
const _wbDecorBuilders = [];
let _wbDecorBuilt = false;
function _wbBuildDecorNow(){
  if(_wbDecorBuilt) return;
  _wbDecorBuilt = true;
  for(const _fn of _wbDecorBuilders){ try{ _fn(); }catch(e){ console.warn('[world] Bau fehlgeschlagen:', e); } }
}
if(typeof window !== 'undefined') window._wbBuildDecorNow = _wbBuildDecorNow;

const territoryMeshes = [];
const foamMeshes = [];

/* Per-Karte einstellbar (Default = bisheriges Verhalten, andere Karten unverändert):
   - bevelSize: Breite/Tiefe der Territoriums-Abschrägung (Grenzrille). Bei dichten
     Länderkarten (Welt, 175 Gebiete) kleiner setzen, sonst verschwinden Kleinstaaten.
   - coastFoam:false schaltet den Küstenschaum-Ring ab (der sonst auch interne
     Nachbargrenzen umrandet → Flickenteppich auf dichten Karten). */
const _BEVEL = (typeof __WB_MAP.bevelSize === 'number') ? __WB_MAP.bevelSize : 0.25;
const _FOAM  = __WB_MAP.coastFoam !== false;

_wbDecorBuilders.push(function(){
TERRITORIES.forEach((t) => {
  const region = MAP3D_REGIONS[t.group];
  if (!region) return;
  let shapes;
  try { shapes = parsePathToShapes(t.d); }
  catch (e) { console.warn('parse fail', t.id, e); return; }
  if (!shapes.length) return;
  const shape = shapes[0];

  /* Naval-Karten (Sturmsee): keine sichtbaren Insel-Landmassen — die Schiffe
     sind der Marker. Das Territoriums-Mesh bleibt aber als FLACHE, komplett
     transparente Fläche auf Wasserhöhe bestehen: es wird weiterhin per Raycast
     angeklickt (ein Klick aufs Schiff trifft die Fläche darunter und wählt das
     Gebiet aus) und liefert Bbox/Zentrum/pieceInfo für Schiff- und Banner-
     Positionierung. Umriss und Küstenschaum entfallen. */
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: IS_NAVAL ? 0.1 : region.height,
    bevelEnabled: !IS_NAVAL, bevelSize: _BEVEL, bevelThickness: _BEVEL, bevelSegments: 2,
    curveSegments: 6
  });
  geo.translate(-CX, CY, 0);
  geo.scale(MAP_SCALE, MAP_SCALE, 1);   // horizontal enlargement, height untouched
  geo.rotateX(-Math.PI/2);

  /* DoubleSide: einige SVG-Pfade sind andersherum gewickelt — deren
     extrudierte Deckfläche zeigt nach unten und würde bei FrontSide
     weggeschnitten (man sähe das Wasser durch). DoubleSide rendert
     beide Seiten und macht alle Territorien blickdicht. */
  const mat = new THREE.MeshPhongMaterial({
    color: region.color, shininess: 12, flatShading: false,
    side: THREE.DoubleSide,
    transparent: IS_NAVAL, opacity: IS_NAVAL ? 0 : 1, depthWrite: !IS_NAVAL
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = !IS_NAVAL; mesh.receiveShadow = !IS_NAVAL;
  mesh.userData = { ...t, region, baseColor: region.color };
  scene.add(mesh);
  territoryMeshes.push(mesh);

  /* Grenzlinie: nur der Umriss der Deckfläche, nicht die komplette
     EdgesGeometry des extrudierten Blocks (die auch die senkrechten
     Seiten- und Bevel-Kanten einschließt und dadurch wie eine dicke,
     mehrfach gestaffelte Wand statt einer dünnen Linie wirkte). So bleibt
     pro Grenze genau eine dünne Linie, an der sofort der Verlauf erkennbar ist. */
  if(!IS_NAVAL){
  const topZ = region.height + _BEVEL; // = bevelThickness, liegt auf der Deckfläche
  const outline = shape.extractPoints(6);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55 });
  const edgeGroup = new THREE.Group();
  [outline.shape, ...outline.holes].forEach(pts => {
    if (pts.length < 2) return;
    const lineGeo = new THREE.BufferGeometry().setFromPoints(
      pts.map(p => new THREE.Vector3(p.x, p.y, topZ))
    );
    lineGeo.translate(-CX, CY, 0);
    lineGeo.scale(MAP_SCALE, MAP_SCALE, 1);
    lineGeo.rotateX(-Math.PI/2);
    edgeGroup.add(new THREE.LineLoop(lineGeo, edgeMat));
  });
  scene.add(edgeGroup);
  mesh.userData.edges = edgeGroup;

  // Coastline foam ring (animated) — per-Karte abschaltbar (dichte Länderkarten)
  if (_FOAM) {
    const foam = buildCoastFoam(shape);
    if (foam) { scene.add(foam); foamMeshes.push(foam); }
  }
  }
});
});

/* === TERRITORY SIBLINGS ==============================================
   Pieces of one logical territory (e.g. Storm Bay_1, Storm Bay_2 — now
   all just "Storm Bay") share group + canonical label. Building a map
   from each mesh to its sibling array lets select(), the lift animation
   and the houses panel treat them as a single unit.
   (Fill in einen aufgeschobenen Thunk gekapselt — läuft nach dem Terrain-Bau,
   Objekt territorySiblings bleibt am Parse-Punkt deklariert.) */
const territorySiblings = new Map();
_wbDecorBuilders.push(function(){
  const byKey = new Map();
  territoryMeshes.forEach(m => {
    const key = `${m.userData.group}|${m.userData.label || m.userData.id}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(m);
  });
  territoryMeshes.forEach(m => {
    const key = `${m.userData.group}|${m.userData.label || m.userData.id}`;
    territorySiblings.set(m, byKey.get(key));
  });
});

/* === DECORATION TRACKING =============================================
   Each piece of terrain decoration (mountain, tree, field, swamp puddle)
   is registered with the territory it belongs to, so that when a player
   clicks a territory, all of its props can be lifted together. */
const territoryMeshById = new Map();
/* territoryMeshes wird erst in den aufgeschobenen _wbDecorBuilders befüllt
   (s. o.), daher diese Zuordnung ebenfalls aufschieben — sonst bliebe die Map
   leer und alle ID-Lookups (Banner/Städte/Burgen/Häfen/Schiffe) schlügen fehl. */
_wbDecorBuilders.push(function(){
  territoryMeshById.clear();
  territoryMeshes.forEach(m => territoryMeshById.set(m.userData.id, m));
});

const territoryDecorations = new Map(); // territoryMesh -> array of decoration descriptors
function registerDecoration(territoryMesh, decoration) {
  if (!territoryMesh) return;
  let list = territoryDecorations.get(territoryMesh);
  if (!list) { list = []; territoryDecorations.set(territoryMesh, list); }
  list.push(decoration);
}

/* The former _islands group has been promoted to two playable regions
   (VergessneInseln, OstmeerArchipel) via TERRITORY_OVERRIDES above, so
   they now go through the main territory builder and get full clickable
   meshes, foam rings, and labels. No separate decorative pass needed. */

/* === MOUNTAIN DECORATIONS === */
/* Mountains are built from cones whose apex vertices are pulled apart into
   multiple offset points. This breaks the single sharp tip of a cone (the
   "pointy hat" look) and yields a jagged multi-peaked ridge instead. The
   side vertices are also noise-displaced for a rocky surface. */
function buildMountain(rand, baseScale, color, snowCapColor) {
  const group = new THREE.Group();

  // Wider and shorter than before so mountains look like massifs, not steeples
  const h = (3.2 + rand() * 3.0) * baseScale;
  const r = (2.2 + rand() * 1.0) * baseScale;

  function ruggedPeak(radius, height, radSeg, hSeg, sideDisp, apexSpread) {
    const g = new THREE.ConeGeometry(radius, height, radSeg, hSeg);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const rad = Math.hypot(x, z);

      // Apex vertices (rad ≈ 0): break the sharp tip by spreading them out
      // horizontally and giving each its own height. Each radial segment of
      // the cone has its own apex vertex, so this yields radSeg separate
      // mini-peaks at the top, connected by short ridges.
      if (rad < 0.001) {
        const ang = rand() * Math.PI * 2;
        const dist = radius * (0.18 + rand() * apexSpread);
        const hOff = (rand() - 0.35) * height * 0.22;
        pos.setX(i, Math.cos(ang) * dist);
        pos.setY(i, height / 2 + hOff);
        pos.setZ(i, Math.sin(ang) * dist);
        continue;
      }

      const hf = (y + height / 2) / height;     // 0 base, 1 apex
      if (hf < 0.02) continue;                  // keep base flush on ground

      // Stronger displacement higher up where mountains are more rugged
      const strength = (0.2 + hf * 0.45) * sideDisp;
      const noise = (rand() - 0.5) * strength;
      const newRad = rad * (1 + noise);
      pos.setX(i, (x / rad) * newRad);
      pos.setZ(i, (z / rad) * newRad);
      pos.setY(i, y + (rand() - 0.5) * height * 0.07);
    }
    g.computeVertexNormals();
    return g;
  }

  // Main massif
  const peakGeo = ruggedPeak(r, h, 10, 4, 1.0, 0.45);
  const peakMat = new THREE.MeshPhongMaterial({
    color, flatShading: true, shininess: 4
  });
  const peak = new THREE.Mesh(peakGeo, peakMat);
  peak.position.y = h / 2;
  peak.castShadow = true;
  peak.receiveShadow = true;
  group.add(peak);

  // Snow cap: also a ruggedPeak so it follows the broken apex
  if (snowCapColor !== null) {
    const capH = h * (0.32 + rand() * 0.18);
    const capR = r * (0.55 + rand() * 0.20);
    const capGeo = ruggedPeak(capR, capH, 10, 2, 0.7, 0.40);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshPhongMaterial({
      color: snowCapColor, flatShading: true, shininess: 28,
      emissive: snowCapColor, emissiveIntensity: 0.05
    }));
    cap.position.y = h - capH * 0.45;
    cap.castShadow = true;
    group.add(cap);
  }

  // Secondary ridge peak (60 % of mountains get one — makes massifs feel real)
  if (rand() < 0.6) {
    const sh = h * (0.50 + rand() * 0.30);
    const sr = r * (0.60 + rand() * 0.30);
    const sgeo = ruggedPeak(sr, sh, 9, 3, 0.9, 0.45);
    const smat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color).multiplyScalar(0.82 + rand() * 0.3),
      flatShading: true, shininess: 4
    });
    const speak = new THREE.Mesh(sgeo, smat);
    const angle = rand() * Math.PI * 2;
    const dist = r * (0.55 + rand() * 0.50);
    speak.position.set(Math.cos(angle) * dist, sh / 2 - 0.2, Math.sin(angle) * dist);
    speak.castShadow = true;
    group.add(speak);

    if (snowCapColor !== null && sh > h * 0.55) {
      const scapH = sh * 0.35;
      const scapR = sr * 0.55;
      const scapGeo = ruggedPeak(scapR, scapH, 9, 2, 0.6, 0.40);
      const scap = new THREE.Mesh(scapGeo, new THREE.MeshPhongMaterial({
        color: snowCapColor, flatShading: true, shininess: 28
      }));
      scap.position.set(speak.position.x, speak.position.y + sh * 0.05, speak.position.z);
      scap.castShadow = true;
      group.add(scap);
    }
  }

  // Some mountains get a low foothill to make the base feel anchored
  if (rand() < 0.5) {
    const fh = h * (0.25 + rand() * 0.15);
    const fr = r * (0.7 + rand() * 0.3);
    const fgeo = ruggedPeak(fr, fh, 8, 2, 0.6, 0.35);
    const fmat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color).multiplyScalar(0.75),
      flatShading: true, shininess: 3
    });
    const foot = new THREE.Mesh(fgeo, fmat);
    const fa = rand() * Math.PI * 2;
    const fd = r * (0.9 + rand() * 0.6);
    foot.position.set(Math.cos(fa) * fd, fh / 2 - 0.1, Math.sin(fa) * fd);
    foot.castShadow = true;
    group.add(foot);
  }

  // Scattered boulders at the base
  if (rand() < 0.7) {
    const stoneCount = 2 + Math.floor(rand() * 3);
    const stoneMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color).multiplyScalar(0.55),
      flatShading: true, shininess: 2
    });
    for (let i = 0; i < stoneCount; i++) {
      const sg = new THREE.IcosahedronGeometry(0.3 + rand() * 0.35, 0);
      const stone = new THREE.Mesh(sg, stoneMat);
      const ang = rand() * Math.PI * 2;
      const d = r * (1.05 + rand() * 0.5);
      stone.position.set(Math.cos(ang) * d, 0.12 + rand() * 0.15, Math.sin(ang) * d);
      stone.scale.set(1, 0.55 + rand() * 0.3, 1);
      stone.rotation.y = rand() * Math.PI * 2;
      stone.castShadow = true;
      group.add(stone);
    }
  }

  return group;
}

const _mountainMeshes = [];   // alle Berge — für den Gebäude-/Truppen-Kollisions-Pass
function addMountains(meshList, count, baseScale, color, snowCapColor) {
  let seed = 12345;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  // Senkrechter Strahl von oben — prüft, ob ein Punkt auf dem Territorium liegt.
  const _ray  = new THREE.Raycaster();
  const _down = new THREE.Vector3(0, -1, 0);
  function onMesh(px, pz, mesh) {
    _ray.set(new THREE.Vector3(px, 500, pz), _down);
    return _ray.intersectObject(mesh, true).length > 0;
  }
  // Liegt der gesamte Fuß-Umkreis (Radius) auf dem Mesh? 8 Stützpunkte + Zentrum.
  function footprintFits(px, pz, radius, mesh) {
    if (!onMesh(px, pz, mesh)) return false;
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      if (!onMesh(px + Math.cos(a) * radius, pz + Math.sin(a) * radius, mesh)) return false;
    }
    return true;
  }

  for (let i = 0; i < count; i++) {
    const t = meshList[Math.floor(rand() * meshList.length)];
    if (!t) continue;
    const bbox = new THREE.Box3().setFromObject(t);
    const midX  = (bbox.min.x + bbox.max.x) / 2;
    const midZ  = (bbox.min.z + bbox.max.z) / 2;
    const halfW = (bbox.max.x - bbox.min.x) / 2;
    const halfD = (bbox.max.z - bbox.min.z) / 2;

    // Fuß-Radius eines Bergs ≈ Basisradius (max 3.2) × scale, plus Sicherheits-
    // faktor 1.6 für Nebengipfel, Vorberge und Felsbrocken am Rand.
    let scale = baseScale;
    const footR = () => 3.2 * scale * 1.6;

    let cx = midX, cz = midZ, placed = false;

    // 1) Mehrere zufällige Positionen versuchen — Fuß muss komplett aufliegen.
    for (let attempt = 0; attempt < 14 && !placed; attempt++) {
      const tx = midX + (rand() - 0.5) * halfW * 1.1;
      const tz = midZ + (rand() - 0.5) * halfD * 1.1;
      if (footprintFits(tx, tz, footR(), t)) { cx = tx; cz = tz; placed = true; }
    }
    // 2) Sonst zentral platzieren und den Berg notfalls verkleinern, bis er passt.
    if (!placed) {
      cx = midX; cz = midZ;
      for (let k = 0; k < 4; k++) {
        if (footprintFits(cx, cz, footR(), t)) { placed = true; break; }
        scale *= 0.62;  // Insel zu klein → Berg schrumpfen
      }
    }
    // 3) Selbst geschrumpft kein Halt (winzige Insel) → Berg ganz weglassen.
    if (!placed) continue;

    const yBase = bbox.max.y;
    const m = buildMountain(rand, scale, color, snowCapColor);
    const groupY = yBase - 0.05;
    m.position.set(cx, groupY, cz);
    m.rotation.y = rand() * Math.PI * 2;
    m.userData.baseY = groupY;
    /* Für den Kollisions-Pass nach der Gebäude-/Banner-Platzierung
       (map3d_clearDecorObstructions): Fuß-Radius + Heimat-Territorium
       merken, damit der Berg dort neu platziert werden kann. */
    m.userData.footR = 3.2 * scale;
    m.userData.terr  = t;
    _mountainMeshes.push(m);
    scene.add(m);
    registerDecoration(t, { kind: 'mesh', mesh: m });
  }
}
_wbDecorBuilders.push(function(){
  const frostMeshes = territoryMeshes.filter(m => m.userData.group === 'Frostmark');
  const vargMeshes  = territoryMeshes.filter(m => m.userData.group === 'Vargard');
  const durMeshes   = territoryMeshes.filter(m => m.userData.group === 'Durania');
  addMountains(frostMeshes, 34, 1.4, 0xb8c2d2, 0xfdfcfa);  // icy stone + bright snow
  addMountains(vargMeshes,  20, 1.3, 0x3a342e, null);       // dark cursed stone
  addMountains(durMeshes,   14, 1.0, 0x6e5a3a, 0xe8dec8);   // brown stone + light caps
});

/* === FORESTS (instanced trees with wind) ============================= */

/* Per-region forest configuration (kartenspezifisch, aus valcaryn.js) */
const FOREST = __WB_MAP.forest || {};
/* Boost density for names that imply dense forest */
const FOREST_KEYWORDS = __WB_MAP.forestKeywords || [];

/* Seeded RNG for deterministic placement */
let fseed = 91237;
const frand = () => (fseed = (fseed * 9301 + 49297) % 233280) / 233280;

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function distToPolyEdge(x, y, poly) {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i+1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = dx*dx + dy*dy;
    let t = ((x - a.x)*dx + (y - a.y)*dy) / (L || 1e-9);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t*dx, py = a.y + t*dy;
    const d = Math.hypot(x - px, y - py);
    if (d < min) min = d;
  }
  return min;
}

/* Bridson Poisson-disc 2D, polygon-clipped */
function poissonDisc(poly, minDist, coastBuffer, maxPoints) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  poly.forEach(p => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  });
  const r = minDist;
  const cs = r / Math.SQRT2;
  const gw = Math.max(1, Math.ceil((maxX - minX) / cs));
  const gh = Math.max(1, Math.ceil((maxY - minY) / cs));
  const grid = new Array(gw * gh).fill(-1);
  const points = [];
  const active = [];

  // find a starting point inside polygon
  let start = null;
  for (let i = 0; i < 80; i++) {
    const px = minX + frand() * (maxX - minX);
    const py = minY + frand() * (maxY - minY);
    if (pointInPolygon(px, py, poly) && distToPolyEdge(px, py, poly) > coastBuffer) {
      start = { x: px, y: py }; break;
    }
  }
  if (!start) return points;
  points.push(start);
  active.push(0);
  grid[Math.floor((start.y - minY) / cs) * gw + Math.floor((start.x - minX) / cs)] = 0;

  while (active.length > 0 && points.length < maxPoints) {
    const idx = Math.floor(frand() * active.length);
    const ptIdx = active[idx];
    const pt = points[ptIdx];
    let placed = false;
    for (let k = 0; k < 24; k++) {
      const a = frand() * Math.PI * 2;
      const d = r + frand() * r;
      const nx = pt.x + Math.cos(a) * d;
      const ny = pt.y + Math.sin(a) * d;
      if (nx < minX || nx >= maxX || ny < minY || ny >= maxY) continue;
      if (!pointInPolygon(nx, ny, poly)) continue;
      if (distToPolyEdge(nx, ny, poly) < coastBuffer) continue;
      const cx = Math.floor((nx - minX) / cs);
      const cy = Math.floor((ny - minY) / cs);
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) {
        for (let dx = -2; dx <= 2 && ok; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
          const ni = grid[yy * gw + xx];
          if (ni >= 0) {
            const op = points[ni];
            if (Math.hypot(op.x - nx, op.y - ny) < r) ok = false;
          }
        }
      }
      if (ok) {
        points.push({ x: nx, y: ny });
        grid[cy * gw + cx] = points.length - 1;
        active.push(points.length - 1);
        placed = true;
        break;
      }
    }
    if (!placed) active.splice(idx, 1);
  }
  return points;
}

/* Tree geometries — base centred at y=0, top up to y≈2.5 */
// Conifer foliage matches the island sea-pine proportions:
// slender 0.40-radius cone, ~1.0 high, sitting on top of the trunk.
const coniferGeo = new THREE.ConeGeometry(0.40, 1.0, 6);
coniferGeo.translate(0, 1.05, 0);
const decidGeo = new THREE.IcosahedronGeometry(0.95, 0);
decidGeo.translate(0, 1.05, 0);
decidGeo.scale(1.0, 0.85, 1.0);
const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.5, 5);
trunkGeo.translate(0, 0.25, 0);

/* Wind shader injection — sways top of tree more than base.
   Phase varies per-instance via the instance's world position. */
const treeWindUniform = { value: 0 };
function makeWindMaterial(color, isFoliage) {
  const mat = new THREE.MeshPhongMaterial({
    color, flatShading: true, shininess: 4
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = treeWindUniform;
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uTime;`
    );
    // Wind only on foliage. Trunks stay still to look anchored.
    const windInject = isFoliage ? `
       #ifdef USE_INSTANCING
         vec4 _iw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
       #else
         vec4 _iw = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
       #endif
       float _h = max(0.0, position.y);
       float _w = _h * _h * 0.055;
       // Two prevailing wind phases — slightly different so the X and Z
       // sway are out of phase, giving a circular wobble at the wipfel.
       float _px = uTime * 2.1 + _iw.x * 0.13 + _iw.z * 0.09;
       float _pz = uTime * 2.4 + _iw.x * 0.18 - _iw.z * 0.12;
       // Slow gust: rolls across the forest every ~6 s.
       float _gust = 0.45 + 0.55 * sin(uTime * 0.55 + _iw.x * 0.025);
       // Fast jitter so leaves visibly tremble even between gusts.
       float _rust = sin(uTime * 7.0 + _iw.x * 0.35 + _iw.z * 0.40 + position.y * 1.8) * 0.35;
       transformed.x += (sin(_px) + _rust) * _w * _gust;
       transformed.z += (cos(_pz) + _rust * 0.7) * _w * 0.85 * _gust;
       transformed.y += abs(sin(_px)) * _w * 0.22;
    ` : '';
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>${windInject}`
    );
  };
  return mat;
}

/* Collect tree positions per type */
const treesByType = { conifer: [], deciduous: [] };

/* For each territory, sample tree positions inside its shape.
   (In einen aufgeschobenen Thunk gekapselt — s. _wbDecorBuilders oben.) */
_wbDecorBuilders.push(function(){
fseed = 91237;
TERRITORIES.forEach((t) => {
  const cfg = FOREST[t.group];
  if (!cfg || cfg.density <= 0) return;
  let shapes;
  try { shapes = parsePathToShapes(t.d); } catch (e) { return; }
  if (!shapes.length) return;

  const pts = shapes[0].getPoints(6);
  if (pts.length < 4) return;

  // bounding-box area
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(p => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  });
  const bboxArea = (maxX - minX) * (maxY - minY);

  // density boost for forest-named territories
  let densityMul = 1;
  if (t.label && FOREST_KEYWORDS.some(k => t.label.includes(k))) densityMul = 1.7;

  const targetCount = Math.max(0, Math.floor(bboxArea * cfg.density * densityMul));
  if (targetCount === 0) return;

  // Poisson-disc minimum distance: derive so we get roughly targetCount
  const minDist = Math.max(1.0, Math.sqrt(bboxArea / targetCount) * 0.7);

  const samples = poissonDisc(pts, minDist, 2.2, targetCount * 2);

  for (const s of samples) {
    // shape space (sx, sy) -> world (sx - CX, 0, -sy - CY)
    const wx = (s.x - CX) * MAP_SCALE;
    const wz = (-s.y - CY) * MAP_SCALE;
    const scale = 0.8 + frand() * 0.45;
    const rotY = frand() * Math.PI * 2;
    // jittered colour per tree
    const tint = 0.85 + frand() * 0.3;
    const c = new THREE.Color(cfg.color).multiplyScalar(tint);
    treesByType[cfg.type].push({ x: wx, y: MAP3D_REGIONS[t.group].height, z: wz, scale, rotY, color: c, territoryId: t.id });
  }
});

/* Build InstancedMeshes */
function buildForest(typeName, baseGeo) {
  const list = treesByType[typeName];
  if (!list.length) return null;

  const foliageMat = makeWindMaterial(0xffffff, true);
  const foliage = new THREE.InstancedMesh(baseGeo, foliageMat, list.length);
  foliage.castShadow = true;
  foliage.receiveShadow = false;
  foliage.frustumCulled = false;

  const trunkMat = makeWindMaterial(0x3a2a1c, false);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
  trunks.castShadow = true;
  trunks.frustumCulled = false;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(0, t.rotY, 0);
    dummy.scale.set(t.scale, t.scale, t.scale);
    dummy.updateMatrix();
    foliage.setMatrixAt(i, dummy.matrix);
    trunks.setMatrixAt(i, dummy.matrix);
    foliage.setColorAt(i, t.color);
    const territoryMesh = territoryMeshById.get(t.territoryId);
    if (territoryMesh) {
      registerDecoration(territoryMesh, {
        kind: 'instanced', meshes: [foliage, trunks], idx: i, baseY: t.y
      });
    }
  }
  foliage.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;

  scene.add(foliage);
  scene.add(trunks);
  return { foliage, trunks };
}

const coniferForest = buildForest('conifer',   coniferGeo);
const decidForest   = buildForest('deciduous', decidGeo);

const totalTrees = treesByType.conifer.length + treesByType.deciduous.length;
console.log(`Trees placed: ${treesByType.conifer.length} conifers, ${treesByType.deciduous.length} deciduous (${totalTrees} total)`);
});

/* === TERRITORY-BY-LABEL LOOKUP =========================================
   Used by fields, roads, rivers and swamps to find a territory's centroid. */
const territoryByLabel = new Map();
/* aufgeschoben: territoryMeshes wird erst in den _wbDecorBuilders befüllt.
   Läuft VOR den Feld-/Straßen-/Fluss-/Sumpf-Buildern (die danach gepusht
   werden), daher ist die Zuordnung dort rechtzeitig verfügbar. */
_wbDecorBuilders.push(() => {
territoryMeshes.forEach(m => {
  if (m.userData.label) {
    const bbox = new THREE.Box3().setFromObject(m);
    territoryByLabel.set(m.userData.label, {
      x: (bbox.min.x + bbox.max.x) / 2,
      z: (bbox.min.z + bbox.max.z) / 2,
      yTop: bbox.max.y
    });
  }
});
});

/* === FIELDS (cultivated patches), kartenspezifisch aus valcaryn.js ===== */
const FIELDS_BY_LABEL = __WB_MAP.fieldsByLabel || {};

const fieldGeo = new THREE.BoxGeometry(1.4, 0.16, 0.9);
fieldGeo.translate(0, 0.08, 0);

const fieldInstances = [];
_wbDecorBuilders.push(function(){
fseed = 71235;

TERRITORIES.forEach((t) => {
  if (!t.label || !FIELDS_BY_LABEL[t.label]) return;
  const cfg = FIELDS_BY_LABEL[t.label];
  let shapes;
  try { shapes = parsePathToShapes(t.d); } catch (e) { return; }
  if (!shapes.length) return;
  const pts = shapes[0].getPoints(6);
  if (pts.length < 4) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(p => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  });
  const area = (maxX - minX) * (maxY - minY);
  const count = Math.floor(area * cfg.density);
  if (count === 0) return;

  const minDist = Math.max(1.4, Math.sqrt(area / count) * 0.85);
  const samples = poissonDisc(pts, minDist, 2.5, count * 2);

  const yTop = MAP3D_REGIONS[t.group].height;
  for (const s of samples) {
    const wx = (s.x - CX) * MAP_SCALE;
    const wz = (-s.y - CY) * MAP_SCALE;
    const tint = 0.88 + frand() * 0.24;
    const c = new THREE.Color(cfg.color).multiplyScalar(tint);
    fieldInstances.push({
      x: wx, y: yTop + 0.08, z: wz,
      rotY: frand() * Math.PI * 2,
      scaleX: 0.8 + frand() * 0.6,
      scaleZ: 0.6 + frand() * 0.5,
      color: c,
      territoryId: t.id
    });
  }
});

if (fieldInstances.length > 0) {
  const fieldMat = new THREE.MeshPhongMaterial({
    color: 0xffffff, shininess: 1, flatShading: true
  });
  const fields = new THREE.InstancedMesh(fieldGeo, fieldMat, fieldInstances.length);
  fields.castShadow = true;
  fields.receiveShadow = true;
  fields.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < fieldInstances.length; i++) {
    const f = fieldInstances[i];
    dummy.position.set(f.x, f.y, f.z);
    dummy.rotation.set(0, f.rotY, 0);
    dummy.scale.set(f.scaleX, 1, f.scaleZ);
    dummy.updateMatrix();
    fields.setMatrixAt(i, dummy.matrix);
    fields.setColorAt(i, f.color);
    const territoryMesh = territoryMeshById.get(f.territoryId);
    if (territoryMesh) {
      registerDecoration(territoryMesh, {
        kind: 'instanced', meshes: [fields], idx: i, baseY: f.y
      });
    }
  }
  fields.instanceMatrix.needsUpdate = true;
  if (fields.instanceColor) fields.instanceColor.needsUpdate = true;
  scene.add(fields);
}
console.log(`Fields placed: ${fieldInstances.length}`);
});

/* === SWAMPS (murky water patches), kartenspezifisch aus valcaryn.js ==== */
const SWAMPS_BY_LABEL = __WB_MAP.swampsByLabel || {};

const swampGeo = new THREE.CircleGeometry(1.4, 10);
swampGeo.rotateX(-Math.PI / 2); // lay flat

const swampUniforms = { uTime: { value: 0 } };
const swampMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: swampUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1,0));
      float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }
    void main() {
      // Edge fade: puddle looks soft
      vec2 cc = vUv - 0.5;
      float r = length(cc) * 2.0;
      float edge = smoothstep(1.0, 0.55, r);

      vec3 base = vec3(0.11, 0.16, 0.10);
      // Murk noise
      float n = noise(vWorld.xz * 1.4 + vec2(uTime * 0.12, -uTime * 0.08));
      vec3 col = base + n * vec3(0.18, 0.22, 0.14);
      // Concentric ripples
      float ring = sin(r * 9.0 - uTime * 1.6) * 0.5 + 0.5;
      col += vec3(0.15, 0.20, 0.13) * ring * 0.4 * (1.0 - r);
      // Bright bubbles
      float bub = pow(noise(vWorld.xz * 4.0 + uTime * 0.35), 10.0);
      col += vec3(0.55, 0.65, 0.40) * bub;
      // Dark ooze patches
      float ooze = noise(vWorld.xz * 0.6 - uTime * 0.05);
      col *= 0.7 + 0.5 * ooze;

      gl_FragColor = vec4(col, edge * 0.92);
    }
  `
});

const swampMeshes = [];
_wbDecorBuilders.push(function(){
fseed = 56321;
TERRITORIES.forEach((t) => {
  if (!t.label || !SWAMPS_BY_LABEL[t.label]) return;
  const cfg = SWAMPS_BY_LABEL[t.label];
  let shapes;
  try { shapes = parsePathToShapes(t.d); } catch (e) { return; }
  if (!shapes.length) return;
  const pts = shapes[0].getPoints(6);
  if (pts.length < 4) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(p => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  });
  const area = (maxX - minX) * (maxY - minY);
  const count = Math.floor(area * cfg.density);
  if (count === 0) return;

  const minDist = Math.max(2.0, Math.sqrt(area / count) * 1.0);
  const samples = poissonDisc(pts, minDist, 2.5, count * 2);

  const yTop = MAP3D_REGIONS[t.group].height;
  const territoryMesh = territoryMeshById.get(t.id);
  for (const s of samples) {
    const wx = (s.x - CX) * MAP_SCALE;
    const wz = (-s.y - CY) * MAP_SCALE;
    const m = new THREE.Mesh(swampGeo, swampMat);
    const baseY = yTop + 0.08;
    m.position.set(wx, baseY, wz);
    m.rotation.y = frand() * Math.PI * 2;
    const sc = 0.7 + frand() * 1.0;
    m.scale.set(sc, 1, sc * (0.7 + frand() * 0.6));
    m.renderOrder = 3;
    m.userData.baseY = baseY;
    scene.add(m);
    swampMeshes.push(m);
    registerDecoration(territoryMesh, { kind: 'mesh', mesh: m });
  }
});
console.log(`Swamps placed: ${swampMeshes.length}`);
});

/* === ISLAND TERRAIN ==================================================
   Each of the five neutral island regions has 2-3 themed prop builders
   that get mixed at placement time. Density is tuned so every island —
   even the tiniest reef — has multiple visible props. */

// --- Reef builders (Mittelsee Archipel) ---
function reefCoralSpire() {
  const g = new THREE.ConeGeometry(0.32, 0.95, 6, 1);
  const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({
    color: 0xd07a72, shininess: 18, flatShading: true
  }));
  m.castShadow = true;
  return m;
}
function reefSeaPine() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.10, 0.6, 5),
    new THREE.MeshPhongMaterial({ color: 0x5a3820, flatShading: true })
  );
  trunk.position.y = 0.3; trunk.castShadow = true;
  g.add(trunk);
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(0.40, 1.0, 6),
    new THREE.MeshPhongMaterial({ color: 0x2c6a58, flatShading: true })
  );
  foliage.position.y = 1.05; foliage.castShadow = true;
  g.add(foliage);
  return g;
}
function reefMossyRock() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.35, 0),
    new THREE.MeshPhongMaterial({ color: 0x8a7568, flatShading: true })
  );
  rock.position.y = 0.25; rock.castShadow = true;
  g.add(rock);
  const moss = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 6, 4, 0, Math.PI*2, 0, Math.PI/2),
    new THREE.MeshPhongMaterial({ color: 0x4a8050, flatShading: true })
  );
  moss.position.y = 0.45;
  g.add(moss);
  return g;
}

// --- Cliffs builders (Westkap-Inseln) ---
function cliffsBasaltTooth() {
  const g = new THREE.ConeGeometry(0.42, 1.7, 5, 1);
  const p = g.attributes.position;
  p.setX(0, (Math.random()-0.5)*0.25);
  p.setZ(0, (Math.random()-0.5)*0.25);
  p.needsUpdate = true; g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({
    color: 0x6a7480, shininess: 6, flatShading: true
  }));
  m.castShadow = true; return m;
}
function cliffsWindPine() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.10, 1.0, 5),
    new THREE.MeshPhongMaterial({ color: 0x4a2f1c, flatShading: true })
  );
  trunk.position.y = 0.5;
  trunk.rotation.z = 0.18;
  trunk.castShadow = true;
  g.add(trunk);
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 1.1, 6),
    new THREE.MeshPhongMaterial({ color: 0x2c4838, flatShading: true })
  );
  foliage.position.set(0.13, 1.25, 0);
  foliage.rotation.z = 0.18;
  foliage.castShadow = true;
  g.add(foliage);
  return g;
}
function cliffsRockPile() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: 0x787c84, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + Math.random()*0.12, 0), mat);
    r.position.set((i-1)*0.25, 0.2 + Math.random()*0.1, (Math.random()-0.5)*0.2);
    r.rotation.set(Math.random(), Math.random(), Math.random());
    r.castShadow = true;
    g.add(r);
  }
  return g;
}

// --- Atoll builders (Südsee-Inseln) ---
function atollPalmTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.14, 1.3, 6),
    new THREE.MeshPhongMaterial({ color: 0x6a4520, flatShading: true })
  );
  trunk.position.y = 0.65; trunk.castShadow = true;
  g.add(trunk);
  const frondMat = new THREE.MeshPhongMaterial({ color: 0x4ca858, flatShading: true });
  const central = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 6), frondMat);
  central.position.y = 1.55; central.castShadow = true;
  g.add(central);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const wrap = new THREE.Object3D();
    wrap.position.y = 1.4; wrap.rotation.y = a;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 4), frondMat);
    frond.position.x = 0.35; frond.rotation.z = -Math.PI/2.3;
    frond.castShadow = true; wrap.add(frond);
    g.add(wrap);
  }
  return g;
}
function atollSmallPalm() {
  const p = atollPalmTree();
  p.scale.setScalar(0.55);
  return p;
}
function atollTropicalBush() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: 0x5dba6a, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + Math.random()*0.08, 0), mat);
    s.position.set((Math.random()-0.5)*0.3, 0.25 + Math.random()*0.15, (Math.random()-0.5)*0.3);
    s.castShadow = true; g.add(s);
  }
  return g;
}

// --- Mist builders (Vergessene Inseln) ---
function mistMenhir() {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 1.3, 0.22),
    new THREE.MeshPhongMaterial({ color: 0x8c8b95, shininess: 3, flatShading: true })
  );
  m.position.y = 0.65;
  m.rotation.x = (Math.random()-0.5)*0.18;
  m.rotation.z = (Math.random()-0.5)*0.18;
  m.castShadow = true; return m;
}
function mistDeadTree() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshPhongMaterial({ color: 0x4a4248, flatShading: true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.10, 1.1, 5), trunkMat);
  trunk.position.y = 0.55; trunk.castShadow = true;
  trunk.rotation.z = (Math.random()-0.5)*0.2;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.4, 4), trunkMat);
    b.position.set((Math.random()-0.5)*0.25, 0.7 + Math.random()*0.4, (Math.random()-0.5)*0.25);
    b.rotation.set(Math.random()*0.8, Math.random()*Math.PI*2, Math.random()*0.8 + 0.3);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}
function mistBrokenColumn() {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 0.65, 8),
    new THREE.MeshPhongMaterial({ color: 0x9a9498, flatShading: true })
  );
  m.position.y = 0.32;
  m.castShadow = true; return m;
}

// --- Storm builders (Ostmeer Archipel) ---
function stormRockJag() {
  const g = new THREE.ConeGeometry(0.36, 1.1, 3, 1);
  const p = g.attributes.position;
  p.setX(0, (Math.random()-0.5)*0.4);
  p.setY(0, 0.55 + Math.random()*0.3);
  p.setZ(0, (Math.random()-0.5)*0.4);
  p.needsUpdate = true; g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({
    color: 0x3a4c5a, shininess: 4, flatShading: true
  }));
  m.castShadow = true; return m;
}
function stormWindbentTree() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshPhongMaterial({ color: 0x322820, flatShading: true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.9, 5), trunkMat);
  trunk.position.y = 0.45;
  trunk.rotation.z = 0.45;
  trunk.castShadow = true; g.add(trunk);
  const fol = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.28, 0),
    new THREE.MeshPhongMaterial({ color: 0x1a2818, flatShading: true })
  );
  fol.position.set(0.36, 0.95, 0); fol.castShadow = true;
  g.add(fol);
  return g;
}
function stormDriftwood() {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.13, 0.9, 6),
    new THREE.MeshPhongMaterial({ color: 0x6a5848, flatShading: true })
  );
  m.rotation.z = Math.PI/2;
  m.rotation.y = Math.random() * Math.PI;
  m.position.y = 0.10;
  m.castShadow = true; return m;
}

const ISLAND_TERRAIN_BUILDERS = {
  reef:   [reefCoralSpire, reefSeaPine,    reefMossyRock],
  cliffs: [cliffsBasaltTooth, cliffsWindPine, cliffsRockPile],
  atoll:  [atollPalmTree, atollSmallPalm,   atollTropicalBush],
  mist:   [mistMenhir, mistDeadTree,        mistBrokenColumn],
  storm:  [stormRockJag, stormWindbentTree, stormDriftwood]
};
const ISLAND_TERRAIN_TYPES = new Set(Object.keys(ISLAND_TERRAIN_BUILDERS));
const islandDecorationMeshes = [];

_wbDecorBuilders.push(function(){
TERRITORIES.forEach(t => {
  // Naval-Karte: keine Landprops (Palmen/Felsen/Bäume) auf den Seesektoren —
  // die Deko übernehmen stattdessen die Schiffsrümpfe (map3d_initNavalFleet).
  if (IS_NAVAL) return;
  const region = MAP3D_REGIONS[t.group];
  if (!region || !ISLAND_TERRAIN_TYPES.has(region.terrain)) return;

  let shapes; try { shapes = parsePathToShapes(t.d); } catch (e) { return; }
  if (!shapes.length) return;
  const pts = shapes[0].getPoints();
  if (pts.length < 3) return;

  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, cx=0, cy=0;
  pts.forEach(p => {
    if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x;
    if (p.y<minY) minY=p.y; if (p.y>maxY) maxY=p.y;
    cx += p.x; cy += p.y;
  });
  cx /= pts.length; cy /= pts.length;
  const area = (maxX-minX) * (maxY-minY);
  const minDim = Math.min(maxX-minX, maxY-minY);

  // Density tuned so every island has multiple visible props
  let count;
  if (area < 15)       count = 1;
  else if (area < 40)  count = 2;
  else if (area < 100) count = 3;
  else if (area < 220) count = 5;
  else                 count = Math.min(10, Math.ceil(area / 70));

  let positions;
  if (count === 1) {
    positions = [{ x: cx, y: cy }];
  } else {
    const minDist = Math.sqrt(area / count) * 0.55;
    const buffer = Math.min(0.7, Math.max(0.3, minDim * 0.08));
    const sampled = poissonDisc(pts, minDist, buffer, count * 3);
    positions = sampled.length ? sampled.slice(0, count) : [{ x: cx, y: cy }];
  }

  const yTop = region.height;
  const territoryMesh = territoryMeshById.get(t.id);
  const builders = ISLAND_TERRAIN_BUILDERS[region.terrain];

  for (const s of positions) {
    const wx = (s.x - CX) * MAP_SCALE;
    const wz = (-s.y - CY) * MAP_SCALE;
    const builder = builders[Math.floor(Math.random() * builders.length)];
    const obj = builder();
    const sc = 0.8 + frand() * 0.45;
    obj.scale.multiplyScalar(sc);
    obj.position.set(wx, yTop, wz);
    obj.rotation.y = (obj.rotation.y || 0) + frand() * Math.PI * 2;
    obj.userData.baseY = yTop;
    scene.add(obj);
    islandDecorationMeshes.push(obj);
    registerDecoration(territoryMesh, { kind: 'mesh', mesh: obj });
  }
});
console.log(`Island terrain props placed: ${islandDecorationMeshes.length}`);
});

/* === FOG & CLOUDS ====================================================
   Procedural soft-sprite atmosphere. Fog patches cling low over mist
   isles + swamps. Cloud sprites drift slowly across the sky high above
   the map, animated per frame. */

function makeCloudTexture(softness, brightness) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const v = Math.round(brightness * 255);
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0,        `rgba(${v},${v},${v},0.92)`);
  grad.addColorStop(softness, `rgba(${v},${v},${v},0.42)`);
  grad.addColorStop(1,        `rgba(${v},${v},${v},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

const fogTexture   = makeCloudTexture(0.35, 0.95);
const cloudTexture = makeCloudTexture(0.50, 1.00);

const fogPatches = [];
const cloudPatches = [];

function addFogPatch(wx, wz, y, scale, opacity, color, driftSpeed) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: fogTexture, color, transparent: true,
    opacity, depthWrite: false
  }));
  sprite.scale.set(scale, scale * 0.55, 1);
  sprite.position.set(wx, y, wz);
  sprite.userData.driftSpeed = driftSpeed;
  sprite.userData.startX = wx;
  sprite.renderOrder = 5;
  scene.add(sprite);
  fogPatches.push(sprite);
}

function territoryCentroidWorld(t) {
  let shapes; try { shapes = parsePathToShapes(t.d); } catch(e) { return null; }
  if (!shapes.length) return null;
  const pts = shapes[0].getPoints();
  let cx=0, cy=0;
  pts.forEach(p => { cx += p.x; cy += p.y; });
  return { wx: (cx/pts.length - CX) * MAP_SCALE, wz: (-cy/pts.length - CY) * MAP_SCALE };
}

// Heavy fog over each Vergessene Inseln territory
_wbDecorBuilders.push(function(){
TERRITORIES.filter(t => MAP3D_REGIONS[t.group] && MAP3D_REGIONS[t.group].terrain === 'mist').forEach(t => {
  const c = territoryCentroidWorld(t);
  if (!c) return;
  const yTop = MAP3D_REGIONS[t.group].height;
  for (let i = 0; i < 4; i++) {
    addFogPatch(
      c.wx + (frand()-0.5) * 10,
      c.wz + (frand()-0.5) * 10,
      yTop + 0.8 + frand() * 1.8,
      7 + frand() * 5,
      0.55 + frand() * 0.25,
      0xeef0f6,
      0.25 + frand() * 0.4
    );
  }
});

// Wisps over Kaeldor swamps and Vargard deadlands for atmosphere
['Kaeldor', 'Vargard'].forEach(grp => {
  TERRITORIES.filter(t => t.group === grp).slice(0, 5).forEach(t => {
    const c = territoryCentroidWorld(t);
    if (!c) return;
    const yTop = MAP3D_REGIONS[grp].height;
    addFogPatch(
      c.wx + (frand()-0.5) * 6,
      c.wz + (frand()-0.5) * 6,
      yTop + 0.6 + frand() * 1.0,
      5 + frand() * 3,
      0.30 + frand() * 0.20,
      grp === 'Kaeldor' ? 0xc0b0c8 : 0xb8b0a8,
      0.15 + frand() * 0.25
    );
  });
});

// High drifting cloud layer
const cloudY = 28;
for (let i = 0; i < 24; i++) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: cloudTexture,
    color: 0xfafbff,
    transparent: true,
    opacity: 0.45 + frand() * 0.30,
    depthWrite: false
  }));
  const scale = 32 + frand() * 38;
  sprite.scale.set(scale, scale * 0.6, 1);
  sprite.position.set(
    -200 + frand() * 400,
    cloudY + frand() * 8,
    -200 + frand() * 400
  );
  sprite.userData.driftSpeed = 0.35 + frand() * 0.65;
  sprite.renderOrder = 4;
  scene.add(sprite);
  cloudPatches.push(sprite);
}
console.log(`Fog patches: ${fogPatches.length}, clouds: ${cloudPatches.length}`);
});
/* Schwere Deko nach dem load-Event im Leerlauf bauen → das load-Event feuert
   schnell (Lobby/Menü brauchen die 3D-Szene nicht). Sicherheitshalber baut
   renderMap() sie sonst synchron nach (idempotent über _wbDecorBuilt). */
if(typeof window !== 'undefined'){
  const _kickDecor = function(){
    if(window.requestIdleCallback) window.requestIdleCallback(_wbBuildDecorNow, { timeout: 2000 });
    else window.setTimeout(_wbBuildDecorNow, 1);
  };
  if(document.readyState === 'complete') _kickDecor();
  else window.addEventListener('load', _kickDecor, { once: true });
}

/* === LABELS === */
function makeLabel(text, color = '#efe4c8', size = 64, weight='normal') {
  const canvas = document.createElement('canvas');
  const dpi = 2;
  canvas.width = 640; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  // Schriftgröße an die Textbreite anpassen — lange Namen (z.B. "Vergessene
  // Inseln", "Ostmeer-Archipel") wurden bei fester Größe am Rand abgeschnitten.
  let fs = size * dpi;
  ctx.font = `${weight} ${fs}px Georgia, serif`;
  const maxW = canvas.width - 44 * dpi;
  const measured = ctx.measureText(text).width;
  if(measured > maxW){
    fs *= maxW / measured;
    ctx.font = `${weight} ${fs}px Georgia, serif`;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Schwarzer Outline für maximale Lesbarkeit auf allen Untergründen
  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.lineWidth = 5 * dpi;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, canvas.width/2, canvas.height/2);
  // Starker Schlagschatten
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur = 10 * dpi;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width/2, canvas.height/2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  /* IM VORDERGRUND, aber TRANSPARENT: kein Tiefentest — die Beschriftung
     liegt immer über Gelände, Bannern und Figuren, verdeckt sie durch die
     halbe Deckkraft aber nicht. Ersetzt den früheren Tiefentest samt
     Schraffur-"Geist"-Sprite (der ließ Namen hinter Figuren nur schraffiert
     durchscheinen). renderOrder 1001: über dem Banner-Tuch (850), unter dem
     Truppen-Badge (1002) — die Truppenzahl bleibt als Einziges obenauf. */
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5,
                                         depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 1001;
  sprite.scale.set(60, 15, 1);
  return sprite;
}
const labelGroup = new THREE.Group(); scene.add(labelGroup);

/* Alle Territoriumsbanner leben in dieser Gruppe. Ihre renderOrder wird in
   three.js zum `groupOrder` ALLER Kinder — und groupOrder wird beim Sortieren
   VOR der renderOrder verglichen. Dadurch rendert das komplette Banner (Tuch +
   Truppen-Badge) IMMER nach den Territoriumsnamen (labelGroup, groupOrder 0)
   und liegt damit garantiert im Vordergrund — unabhängig von den einzelnen
   Sprite-renderOrder-Werten. */
const _bannerRoot = new THREE.Group(); _bannerRoot.renderOrder = 30; scene.add(_bannerRoot);

/* Eigener, lokaler Raycaster für die Label-Höhenermittlung — bewusst NICHT
   der weiter unten deklarierte _terrainRay (const, TDZ): diese Label-IIFEs
   laufen beim Laden VOR dessen Deklaration. Ermittelt die echte Terrain-Höhe
   an (x,z), damit Labels seit Einführung von depthTest:true auf den
   Beschriftungs-Sprites (siehe makeLabel) zuverlässig ÜBER dem Gelände
   stehen, statt (wie vorher mit einem festen Bounding-Box-Offset) teils
   knapp DARUNTER zu landen und dadurch komplett zu verschwinden. */
const _lblRay = new THREE.Raycaster();
const _lblDir = new THREE.Vector3(0, -1, 0);
function _lblGroundY(x, z, meshes, fallback){
  if(!meshes || !meshes.length) return fallback;
  _lblRay.set(new THREE.Vector3(x, 400, z), _lblDir);
  const hits = _lblRay.intersectObjects(meshes, false);
  return hits.length ? hits[0].point.y : fallback;
}

/* Große Kontinent-/Flotten-Beschriftungen auf der 3D-Karte: EINE je Kontinent,
   über dem Schwerpunkt seiner Territorien (Weltkoordinaten). Für die Landkarte
   Valcaryn bleiben die handgesetzten Positionen/Farben erhalten; alle anderen
   Karten — z. B. die Flotten der Naval-Karte Sturmsee — werden automatisch aus
   der Geometrie beschriftet. So erscheinen die Flottennamen der Minikarte
   (Kontinent-/Bonusübersicht) jetzt auch auf der großen 3D-Karte. */
/* Positionen aus der TATSÄCHLICHEN Mesh-Rohgeometrie (allTerritories, das
   eigenständige Datenset fürs 3D-Mesh — NICHT das ähnlich aussehende, aber
   unabhängig gepflegte "regions"-Array) neu berechnet: für jeden Kontinent
   das flächenmäßig GRÖSSTE Teilstück gesucht und dessen Bounding-Box-Zentrum
   genommen (gleiche Transformation wie beim Mesh-Aufbau: worldX = cx - CX,
   worldZ = -cy - CY). Bewusst NICHT der Schwerpunkt aller Teilstücke — bei
   einer zerklüfteten Fjord-/Bucht-Küste (z.B. Frostmark) landet ein Mittelwert
   über viele verstreute Puzzle-Teile leicht in einer Bucht statt auf Land.
   Gleiche Strategie wie bereits bei den Einzel-Gebietsnamen weiter unten
   ("Label auf dem GRÖSSTEN Teilstück"). Die alten Werte stammten aus einem
   früheren Kartenstand und lagen reihenweise über dem Meer. */
const VALCARYN_LABEL_OVR = {
  /* Welt-Koordinaten: x = svgX − CX, z = svgY − CY (siehe Mesh-Aufbau:
     translate(-CX, CY) + rotateX(-π/2)). Die früheren z-Werte waren mit
     gespiegelter y-Achse berechnet (−svgY − CY) und lagen dadurch allesamt
     nördlich außerhalb der Karte auf offener See. */
  Frostmark: [-54,  -91, 0xd8dbe2],
  Valendra:  [-143, -49, 0xd4a84f],
  Durania:   [-34,  -53, 0xb08530],
  Vargard:   [33,   -33, 0xbfb4a2],
  Aerlund:   [-128,  45, 0xcfd8df],
  Silverin:  [-59,   43, 0xa8dcc8],
  Vorthan:   [-15,   93, 0xf0c45b],
  Kaeldor:   [43,    33, 0xd0c4b0]
};
_wbDecorBuilders.push(() => {
  // Schwerpunkt + Oberkante je Kontinent aus den (bei Naval unsichtbaren) Territorien
  // (aufgeschoben: territoryMeshes wird erst in den _wbDecorBuilders befüllt)
  const agg = new Map();
  territoryMeshes.forEach(m => {
    const key = m.userData.group; if(!key) return;
    const bb = new THREE.Box3().setFromObject(m);
    let a = agg.get(key);
    if(!a){ a = { sx:0, sz:0, top:-Infinity, n:0 }; agg.set(key, a); }
    a.sx += (bb.min.x + bb.max.x)/2;
    a.sz += (bb.min.z + bb.max.z)/2;
    a.n++;
    if(bb.max.y > a.top) a.top = bb.max.y;
  });
  const _hex = c => (typeof c === 'number')
    ? ('#' + (c >>> 0).toString(16).padStart(6,'0'))
    : String(c || '#efe4c8');
  CONTINENTS.forEach(c => {
    const a = agg.get(c.key); if(!a || !a.n) return;
    const ovr = VALCARYN_LABEL_OVR[c.key];
    const x = ovr ? ovr[0] : a.sx/a.n;
    const z = ovr ? ovr[1] : a.sz/a.n;
    // Echte Terrain-Höhe an (x,z) + Sicherheitsabstand — statt eines festen
    // Y-Werts, der bei Geländeunterschieden unter der Oberfläche landen kann.
    const groundY = _lblGroundY(x, z, territoryMeshes, a.top);
    const y = groundY + 6;
    const hex = ovr ? _hex(ovr[2]) : _hex(c.color);
    const lbl = makeLabel((c.name || c.key).toUpperCase(), hex, 36, 'bold');
    lbl.position.set(x, y, z);
    lbl.scale.set(70, 17, 1);
    lbl.userData.regionLabel = true;
    lbl.userData.contKey = c.key;
    lbl.userData.labelColor = hex;
    labelGroup.add(lbl);
  });
});

const territoryLabels = [];
_wbDecorBuilders.push(() => {
  /* EIN Schriftband pro logischem Territorium statt pro Teilstück. Mehrteilige
     Gebiete (z. B. Sturmbucht, Winterkrone, Düsterkiefer, Düsterklippe,
     Blutsteinpass) teilen sich group+label und bekamen bisher je Stück ein
     eigenes Label. Wir gruppieren über denselben group|label-Schlüssel wie das
     Geschwister-System und platzieren das Label auf dem GRÖSSTEN Teilstück,
     damit es auf dem Hauptkörper sitzt und nicht in der See zwischen
     verstreuten Exklaven landet. */
  const byKey = new Map();
  territoryMeshes.forEach(m => {
    if (!m.userData.label) return;
    const key = `${m.userData.group}|${m.userData.label}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(m);
  });
  byKey.forEach(meshes => {
    let bestBB = null, bestArea = -1, label = null;
    meshes.forEach(m => {
      const bb = new THREE.Box3().setFromObject(m);
      const area = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
      if (area > bestArea) { bestArea = area; bestBB = bb; label = m.userData.label; }
    });
    if (!bestBB) return;
    const cx = (bestBB.min.x + bestBB.max.x)/2;
    const cz = (bestBB.min.z + bestBB.max.z)/2;
    // Echte Terrain-Höhe am Label-Punkt + Sicherheitsabstand — der alte feste
    // Bounding-Box-Offset landete auf flachem Gelände teils UNTER der
    // Oberfläche (unsichtbar seit depthTest:true auf dem Label-Material).
    const groundY = _lblGroundY(cx, cz, meshes, bestBB.max.y);
    const cy = groundY + 3;
    const lbl = makeLabel(label, '#fff8e8', 36);
    lbl.position.set(cx, cy, cz);
    lbl.scale.set(30 * LABEL_SCALE, 7.5 * LABEL_SCALE, 1);
    lbl.userData.territoryLabel = true;
    lbl.userData.deLabel = label;
    // Vordergrund + Transparenz kommen aus makeLabel (renderOrder 1001,
    // opacity 0.5) — kein eigener Override mehr nötig.
    labelGroup.add(lbl);
    territoryLabels.push(lbl);
  });
});

/* Re-skin every map label sprite to the active language. Territory labels keep
   their German (userData.deLabel) and look up wbMapLabel(); the big continent
   labels look up wbContName() by continent key. German stays unchanged; other
   languages swap the sprite's canvas texture in place. */
function wbApplyMapLabelLang(){
  if (typeof labelGroup === 'undefined' || !labelGroup) return;
  labelGroup.children.forEach(function(lbl){
    try {
      var txt = null, color = '#fff8e8', size = 36, weight = 'normal';
      if (lbl.userData.deLabel){
        txt = (typeof window.wbMapLabel === 'function') ? window.wbMapLabel(lbl.userData.deLabel) : lbl.userData.deLabel;
        color = '#fff8e8'; size = 36; weight = 'normal';
      } else if (lbl.userData.contKey){
        var cn = (typeof window.wbContName === 'function') ? window.wbContName(lbl.userData.contKey) : lbl.userData.contKey;
        txt = String(cn || lbl.userData.contKey).toUpperCase();
        color = lbl.userData.labelColor || '#efe4c8'; size = 36; weight = 'bold';
      } else { return; }
      var tmp = makeLabel(txt, color, size, weight);   // reuse identical rendering
      var oldMap = lbl.material.map;
      lbl.material.map = tmp.material.map;
      lbl.material.needsUpdate = true;
      if (oldMap && oldMap.dispose) oldMap.dispose();
      tmp.material.dispose();                          // keep the texture we stole, drop the rest
    } catch(e){}
  });
}
window.wbApplyMapLabelLang = wbApplyMapLabelLang;

/* === CONTROLS === */
const controls = {
  target: new THREE.Vector3(0, 0, 0),
  radius: 420, theta: 0, phi: 0.95,
  minPhi: 0.15, maxPhi: 1.45,
  minRadius: 90, maxRadius: 750,
  update() {
    const sinPhi = Math.sin(this.phi);
    camera.position.set(
      this.target.x + this.radius * sinPhi * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sinPhi * Math.cos(this.theta)
    );
    camera.lookAt(this.target);
  }
};
controls.update();

/* === SMOOTH ZOOM & PAN ================================================ */
let zoomTargetRadius = controls.radius;
let zoomTargetTheta = controls.theta;
let zoomTargetPhi   = controls.phi;
let zoomTargetX = controls.target.x;
let zoomTargetZ = controls.target.z;
const ZOOM_LERP = 0.15;
const MAX_PAN = 260;

/* Kampfmodus-Kamerastatus — MUSS vor render() deklariert sein,
   da render() weiter unten direkt darauf zugreift (sonst TDZ-Crash). */
let _camShakeAmp = 0, _camShakeDecay = 0;
let _savedBattleView = null;

function clampRadius(r) {
  return Math.max(controls.minRadius, Math.min(controls.maxRadius, r));
}
function clampPan(v) {
  return Math.max(-MAX_PAN, Math.min(MAX_PAN, v));
}
function zoomBy(factor) {
  zoomTargetRadius = clampRadius(zoomTargetRadius * factor);
}
function resetView() {
  zoomTargetRadius = 420;
  zoomTargetTheta = 0;
  zoomTargetPhi = 0.95;
  zoomTargetX = 0;
  zoomTargetZ = 0;
}
/* Pan the camera target (the point the camera orbits around) in the XZ plane,
   based on a screen-space drag delta. */
const _panRight = new THREE.Vector3();
const _panForward = new THREE.Vector3();
function pan(dx, dy) {
  _panRight.setFromMatrixColumn(camera.matrixWorld, 0);   // camera-right in world
  _panRight.y = 0; _panRight.normalize();
  camera.getWorldDirection(_panForward);                  // camera looking direction
  _panForward.y = 0; _panForward.normalize();

  // Scale by view height so panning feels constant at any zoom level.
  const panScale = controls.radius * 2 *
    Math.tan((camera.fov * Math.PI / 180) / 2) / window.innerHeight;

  // Grab-and-pull behaviour: dragging right "pulls" the map right, so the
  // camera target shifts left along the camera's right axis (and similarly
  // for the forward axis when dragging up/down).
  controls.target.x = clampPan(controls.target.x - _panRight.x   * dx * panScale + _panForward.x * dy * panScale);
  controls.target.z = clampPan(controls.target.z - _panRight.z   * dx * panScale + _panForward.z * dy * panScale);
  controls.update();
}

/* Called every frame from the render loop to ease toward the target. */
function updateZoom() {
  const dr  = zoomTargetRadius - controls.radius;
  const dt  = zoomTargetTheta  - controls.theta;
  const dp  = zoomTargetPhi    - controls.phi;
  const dtx = zoomTargetX      - controls.target.x;
  const dtz = zoomTargetZ      - controls.target.z;
  if (Math.abs(dr)  < 0.05  && Math.abs(dt)  < 0.001 &&
      Math.abs(dp)  < 0.001 && Math.abs(dtx) < 0.05  && Math.abs(dtz) < 0.05) return;
  controls.radius   += dr  * ZOOM_LERP;
  controls.theta    += dt  * ZOOM_LERP;
  controls.phi      += dp  * ZOOM_LERP;
  controls.target.x += dtx * ZOOM_LERP;
  controls.target.z += dtz * ZOOM_LERP;
  controls.update();
}

// zoom buttons handled by game



/* Keyboard pan helper: move the orbit target along the camera-relative
   right/forward axes (XZ plane), feeding the smooth-zoom targets so motion
   eases instead of snapping. */
const _kpRight = new THREE.Vector3();
const _kpFwd   = new THREE.Vector3();
function _keyPan(stepRight, stepFwd){
  _kpRight.setFromMatrixColumn(camera.matrixWorld, 0); _kpRight.y = 0; _kpRight.normalize();
  camera.getWorldDirection(_kpFwd); _kpFwd.y = 0; _kpFwd.normalize();
  zoomTargetX = clampPan(zoomTargetX + _kpRight.x * stepRight + _kpFwd.x * stepFwd);
  zoomTargetZ = clampPan(zoomTargetZ + _kpRight.z * stepRight + _kpFwd.z * stepFwd);
}
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const panStep = controls.radius * 0.10;   // proportional to zoom level
  const rotStep = 0.18, tiltStep = 0.10;
  let handled = true;
  switch (e.key) {
    case 'Escape':
      /* ESC bricht zuerst ein offenes Deploy-/Bewegungs-Modal ab (inkl.
         Aufheben der Bewegungs-Quellauswahl, siehe deployCancelBtn), sonst
         eine aktive Quell-Auswahl der Angriffs-/Bewegungsphase, sonst das
         Karten-Modal. */
      if($("deployModal").classList.contains("show")){ $("deployCancelBtn").onclick(); }
      else if(G && G.selected){ G.selected = null; window.WBSfx?.click?.(1); updateHUD(); }
      else closeCardsModal();
      break;
    case '+': case '=':                 zoomBy(0.72); break;
    case '-': case '_':                 zoomBy(1.4);  break;
    case '0': case 'r': case 'R':       resetView();  break;
    case 'ArrowUp':    case 'w': case 'W': _keyPan(0, +panStep); break;  // forward / north
    case 'ArrowDown':  case 's': case 'S': _keyPan(0, -panStep); break;  // back / south
    case 'ArrowLeft':  case 'a': case 'A': _keyPan(-panStep, 0); break;  // left / west
    case 'ArrowRight': case 'd': case 'D': _keyPan(+panStep, 0); break;  // right / east
    case 'q': case 'Q': zoomTargetTheta -= rotStep; break;              // rotate left
    case 'e': case 'E': zoomTargetTheta += rotStep; break;              // rotate right
    case 'PageUp':   zoomTargetPhi = Math.max(controls.minPhi, zoomTargetPhi - tiltStep); break; // tilt up
    case 'PageDown': zoomTargetPhi = Math.min(controls.maxPhi, zoomTargetPhi + tiltStep); break; // tilt down
    default: handled = false;
  }
  if (handled) e.preventDefault();
});

/* Sync targets when the user drags/wheels/pinches manually, so the next
   smooth-zoom doesn't snap back to a stale target. */
function syncZoomTarget() {
  zoomTargetRadius = controls.radius;
  zoomTargetTheta = controls.theta;
  zoomTargetPhi = controls.phi;
  zoomTargetX = controls.target.x;
  zoomTargetZ = controls.target.z;
}

/* Suppress the right-click context menu over the canvas so we can use right
   drag for panning. */
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

/* ===== KAMERA-STEUERUNG (Mouse + Touch) ===========================
   Linke Maustaste drücken + ziehen  →  Orbit / Drehen
   Rechte Maustaste drücken + ziehen →  Schwenken (Pan)
   Mittlere Maustaste / Shift+Drag   →  Schwenken (Pan)
   Scrollrad                         →  Zoom rein/raus
   Zwei-Finger-Pinch (Touch)         →  Zoom
   Zwei-Finger-Drag  (Touch)         →  Schwenken
   ==================================================================== */

let _drag = null;       // { x, y, button, startX, startY, t }
let _touchPrev = null;  // für 1-Finger-Touch
let _pinchDist  = 0;
let _pinchCenter = null;

/* ---- Maus ---- */
renderer.domElement.addEventListener('mousedown', e => {
  if(e.button === 2) e.preventDefault();
  _drag = { x: e.clientX, y: e.clientY,
            startX: e.clientX, startY: e.clientY,
            button: e.button, t: Date.now() };
});

window.addEventListener('mousemove', e => {
  if(!_drag) return;
  const dx = e.clientX - _drag.x;
  const dy = e.clientY - _drag.y;
  _drag.x = e.clientX;
  _drag.y = e.clientY;

  if(_drag.button === 2 || _drag.button === 1 ||
     (e.shiftKey && _drag.button === 0)) {
    // Pan: Rechts- oder Mittelklick oder Shift+Linksklick
    pan(dx, dy);
  } else {
    // Orbit: Linksklick
    controls.theta -= dx * 0.006;
    controls.phi    = Math.max(controls.minPhi,
                       Math.min(controls.maxPhi,
                         controls.phi - dy * 0.006));
    controls.update();
  }
  syncZoomTarget();
});

window.addEventListener('mouseup', e => {
  if(!_drag) return;
  const moved = Math.hypot(e.clientX - _drag.startX,
                            e.clientY - _drag.startY);
  // Kurzer Klick ohne Bewegung → Territory-Auswahl
  if(moved < 6 && _drag.button === 0 && Date.now() - _drag.t < 300) {
    tryPick(e.clientX, e.clientY);
  }
  _drag = null;
});

/* ---- Scrollrad (Zoom) ---- */
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY > 0 ? 1.12 : 0.89;
  controls.radius = clampRadius(controls.radius * f);
  controls.update();
  syncZoomTarget();
}, { passive: false });

/* ---- Touch ---- */
renderer.domElement.addEventListener('touchstart', e => {
  e.preventDefault();
  if(e.touches.length === 1){
    const t = e.touches[0];
    _touchPrev = { x: t.clientX, y: t.clientY,
                   startX: t.clientX, startY: t.clientY, t: Date.now() };
    _pinchDist = 0; _pinchCenter = null;
  } else if(e.touches.length === 2){
    const a = e.touches[0], b = e.touches[1];
    _pinchDist   = Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
    _pinchCenter = { x:(a.clientX+b.clientX)/2, y:(a.clientY+b.clientY)/2 };
    _touchPrev   = null;
  }
}, { passive: false });

renderer.domElement.addEventListener('touchmove', e => {
  e.preventDefault();
  if(e.touches.length === 1 && _touchPrev){
    const t = e.touches[0];
    const dx = t.clientX - _touchPrev.x, dy = t.clientY - _touchPrev.y;
    controls.theta -= dx * 0.006;
    controls.phi    = Math.max(controls.minPhi,
                       Math.min(controls.maxPhi, controls.phi - dy * 0.006));
    controls.update(); syncZoomTarget();
    _touchPrev.x = t.clientX; _touchPrev.y = t.clientY;
  } else if(e.touches.length === 2 && _pinchDist > 0){
    const a = e.touches[0], b = e.touches[1];
    const dist = Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
    const cx   = (a.clientX+b.clientX)/2, cy = (a.clientY+b.clientY)/2;
    // Pinch-Zoom
    controls.radius = clampRadius(controls.radius * (_pinchDist/dist));
    controls.update();
    // Zwei-Finger-Pan
    if(_pinchCenter){
      pan(cx - _pinchCenter.x, cy - _pinchCenter.y);
    }
    syncZoomTarget();
    _pinchDist   = dist;
    _pinchCenter = { x: cx, y: cy };
  }
}, { passive: false });

renderer.domElement.addEventListener('touchend', e => {
  if(e.touches.length === 0 && _touchPrev){
    const moved = Math.hypot(e.changedTouches[0].clientX - _touchPrev.startX,
                              e.changedTouches[0].clientY - _touchPrev.startY);
    if(moved < 8 && Date.now() - _touchPrev.t < 300){
      tryPick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  }
  if(e.touches.length < 2){ _pinchDist = 0; _pinchCenter = null; }
  if(e.touches.length === 0){ _touchPrev = null; }
});



/* === SELECTION === */
const raycaster = new THREE.Raycaster();
const pickVec = new THREE.Vector2();
const ownerOf = new Map();
let selectedMesh = null;
const LIFT_AMOUNT = 1.5;

/* Apply a vertical lift to a territory and all of its registered
   decorations (mountains, trees, fields, swamps). dy=0 puts everything
   back on the ground. */
const _liftMat = new THREE.Matrix4();
const _liftPos = new THREE.Vector3();
const _liftQuat = new THREE.Quaternion();
const _liftScale = new THREE.Vector3();
function setLift(territory, dy) {
  territory.position.y = dy;
  const decorations = territoryDecorations.get(territory);
  if (!decorations) return;
  const touchedInstanced = new Set();
  for (const d of decorations) {
    if (d.kind === 'mesh') {
      d.mesh.position.y = d.mesh.userData.baseY + dy;
    } else if (d.kind === 'instanced') {
      // Rewrite matrix entry on each InstancedMesh that shares this instance
      for (const im of d.meshes) {
        im.getMatrixAt(d.idx, _liftMat);
        _liftMat.decompose(_liftPos, _liftQuat, _liftScale);
        _liftPos.y = d.baseY + dy;
        _liftMat.compose(_liftPos, _liftQuat, _liftScale);
        im.setMatrixAt(d.idx, _liftMat);
        touchedInstanced.add(im);
      }
    }
  }
  for (const im of touchedInstanced) im.instanceMatrix.needsUpdate = true;
}

function tryPick(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pickVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pickVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pickVec, camera);
  if (IS_NAVAL) {
    /* Naval (Sturmsee): die Schiffe SIND die Territorien — nur sie sind
       anklickbar. Die flachen, unsichtbaren Inselflächen werden bewusst NICHT
       geraycastet, damit ein Klick aufs offene Wasser (oder die Fläche neben
       einem Schiff) kein Gebiet mehr auswählt. Treffer am Schiff → das darunter
       liegende Territoriums-Mesh auswählen, damit die restliche Spiellogik
       (Auswahl/Angriff/Banner) unverändert weiterläuft. */
    const ships = window._navalShipPickables || [];
    let picked = null;
    if (ships.length) {
      const hits = raycaster.intersectObjects(ships, true);
      if (hits.length) {
        let o = hits[0].object;
        while (o && o.userData.pickTerrId == null && o.parent) o = o.parent;
        if (o && o.userData.pickTerrId != null) picked = territoryMeshById.get(o.userData.pickTerrId) || null;
      }
    }
    select(picked);
    return;
  }
  const hits = raycaster.intersectObjects(territoryMeshes, false);
  select(hits.length ? hits[0].object : null);
}
function select(mesh) {
  /* Operate on whole sibling groups so all pieces of one logical
     territory (e.g. all four Storm Bay pieces) light up and lift
     together. */
  const oldSibs = selectedMesh ? (territorySiblings.get(selectedMesh) || [selectedMesh]) : [];
  const newSibs = mesh ? (territorySiblings.get(mesh) || [mesh]) : [];

  // Reset meshes that were highlighted but aren't part of the new selection
  oldSibs.forEach(s => {
    if (!newSibs.includes(s)) {
      s.material.emissive.setHex(0x000000);
      setLift(s, 0);
    }
  });
  // Highlight meshes newly entering the selection
  newSibs.forEach(s => {
    if (!oldSibs.includes(s)) {
      s.material.emissive.setHex(0x553311);
      setLift(s, LIFT_AMOUNT);
    }
  });

  selectedMesh = mesh;
  // Standarte des gewählten Territoriums hervorheben
  if (typeof map3d_setSelectedBanner === 'function') {
    map3d_setSelectedBanner(mesh ? mesh.userData.id : null);
  }
  // Forward to game logic if available
  if (mesh && typeof window._map3d_onClick === 'function') {
    window._map3d_onClick(mesh.userData.id);
  }
}

/* === MODES === */
let currentMode = 'regions';
function applyMode(mode) {
  currentMode = mode;
  // mode toggle not used in game context
  territoryMeshes.forEach(m => {
    const r = m.userData.region;
    let col = r.color;
    if (mode === 'houses') {
      col = r.houseId ? HOUSES[r.houseId].color : 0x222222;
    } else if (mode === 'terrain') {
      const tm = { ice: 0xc8d4e2, plains: 0x7d8a3a, hills: 0xa07a3a,
                   mountain: 0x564832, forest: 0x2e4a2c, desert: 0xd0833f,
                   swamp: 0x4a3a4a,
                   reef: 0xc8807a, cliffs: 0x808890, atoll: 0xd8c890,
                   mist: 0x9890a0, storm: 0x404858 };
      col = tm[r.terrain] || r.color;
    }
    m.material.color.setHex(col);
    m.userData.baseColor = col;
  });
}
// mode buttons not used in game context

/* === HOUSES PANEL === */
function buildHousePanel() {
  const list = document.getElementById('house-list');
  if (!list) return;
  list.innerHTML = '';
  Object.entries(HOUSES).forEach(([id, h]) => {
    /* Count unique canonical territory names, not individual mesh
       pieces — Storm Bay (4 pieces) and Winter Crown (6 pieces) each
       count as one held territory. */
    const uniqueLabels = new Set();
    territoryMeshes
      .filter(m => m.userData.region.houseId === id)
      .forEach(m => uniqueLabels.add(`${m.userData.group}|${m.userData.label || m.userData.id}`));
    const count = uniqueLabels.size;
    const row = document.createElement('div');
    row.className = 'house-row';
    row.innerHTML = `
      <span class="swatch" style="background:#${h.color.toString(16).padStart(6,'0')}"></span>
      <span class="house-name">${h.name}</span>
      <span class="house-count">${count}</span>
    `;
    row.addEventListener('click', () => {
      const mine = territoryMeshes.filter(m => m.userData.region.houseId === id);
      mine.forEach(m => {
        m.material.emissive.setHex(h.color);
        m.material.emissiveIntensity = 0.5;
      });
      setTimeout(() => mine.forEach(m => {
        if (m !== selectedMesh) m.material.emissive.setHex(0x000000);
        m.material.emissiveIntensity = 1;
      }), 900);
      document.querySelectorAll('.house-row').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
    });
    list.appendChild(row);
  });
}
buildHousePanel();
// aufgeschoben: setzt Basis-/Regionsfarben je territoryMesh — läuft erst,
// nachdem die Meshes in den _wbDecorBuilders gebaut wurden.
_wbDecorBuilders.push(() => applyMode('regions'));

/* === RENDER LOOP === */
const t0 = performance.now();
// Hält zwischen Frames fest, ob die Zoom-Schwellwerte für Label-Sichtbarkeit
// bereits angewendet wurden — vermeidet unnötige Durchläufe über alle Labels
// auf jedem einzelnen Frame, wenn sich am Zoom nichts geändert hat.
const _renderState = { showSmall: null, showRegionLabels: null };
// Wiederverwendbare Frustum-/Matrix-Objekte fürs Banner-Culling: früher wurde
// auf JEDEM Frame ein neues THREE.Frustum + THREE.Matrix4 alloziert (GC-Druck).
// Einmal anlegen, im Render-Loop nur neu befüllen.
const _bannerFrustum = new THREE.Frustum();
const _bannerFrustumMat = new THREE.Matrix4();
function render() {
  const dt = (performance.now() - t0) / 1000;
  seaUniforms.uTime.value = dt;
  foamUniforms.uTime.value = dt;
  treeWindUniform.value = dt;
  swampUniforms.uTime.value = dt;

  /* Bild-zu-Bild-Delta (für Rauch), gegen Sprünge gedeckelt */
  const _now = performance.now();
  const delta = window._lastFrameMs ? Math.min(0.05, (_now - window._lastFrameMs)/1000) : 0.016;
  window._lastFrameMs = _now;
  /* Wehende Flaggen (gemeinsamer GPU-Wind-Uniform) */
  if(window._flagWind) window._flagWind.value = dt;
  /* Aufsteigender Rauch fortschreiben */
  if(typeof _updateSmoke === 'function') _updateSmoke(delta);

  // Drift clouds slowly across the sky
  for (const c of cloudPatches) {
    c.position.x += c.userData.driftSpeed * 0.025;
    if (c.position.x > 230) c.position.x = -230;
  }
  // Subtle fog patch drift around their start positions
  for (const f of fogPatches) {
    f.position.x += f.userData.driftSpeed * 0.008;
    if (f.position.x > f.userData.startX + 14) f.position.x = f.userData.startX - 14;
  }

  // Animate territory banner cloth (wind)
  if(window._bannerClothMats){
    window._bannerClothMats.forEach(m => { m.uniforms.uTime.value = dt; });
  }

  // Naval: Segel immer zur Kamera ausrichten (lesbar wie ein Banner) +
  // ausgewähltes Schiff deutlich anheben, aufleuchten lassen und leicht wippen.
  if(window._navalShipGroups){
    window._navalShipGroups.forEach(g => {
      const u = g.userData;
      u.selCur += ((u.selTarget||0) - (u.selCur||0)) * 0.15;
      const sc = u.selCur < 0.0005 ? 0 : u.selCur;
      const bob = sc>0 ? sc * Math.sin(dt*1.6 + (u.bobPhase||0)) * 0.4 : 0;
      g.position.y = (u.baseY||0) + sc*9 + bob;                   // deutlich anheben
      const s = 1 + sc*0.18; if(g.scale.x!==s) g.scale.setScalar(s);
      if(u.sailMat && u.sailMat.uniforms && u.sailMat.uniforms.uSel) u.sailMat.uniforms.uSel.value = sc;  // Segel aufleuchten
      /* Auswahl-Ring auf der Wasserlinie: pulsierend ein-/ausblenden. Der Ring
         kompensiert den Schiffs-Lift, damit er auf dem Wasser liegen bleibt. */
      if(u.selRing){
        const vis = sc > 0.01;
        u.selRing.visible = vis;
        if(vis){
          u.selRing.material.opacity = sc * (0.55 + 0.45*Math.sin(dt*3));
          u.selRing.position.y = 0.6 - (sc*9 + bob);   // Lift herausrechnen → bleibt an der Wasserlinie
        }
      }
      // Segel-Billboard: Gieren zur Kamera (Schiffswinkel herausrechnen) + Nicken zur Kamerahöhe
      const sw = u.sailSwivel;
      if(sw){
        const dx = camera.position.x - g.position.x;
        const dz = camera.position.z - g.position.z;
        sw.rotation.y = Math.atan2(dx, dz) - (u.shipAngle||0);
        if(u.sailPitch){
          const dy = camera.position.y - (g.position.y + (u.yardY||0));
          const horiz = Math.sqrt(dx*dx + dz*dz);
          u.sailPitch.rotation.x = -Math.atan2(dy, horiz);
        }
      }
    });
  }

  // Prozedurale Formen-Pferde: lebendige Leerlauf-Animation. Merged-Mesh-
  // freundlich — nur die Pivot-Gruppen (Körper/Hals/Schweif/Beine) jedes Pferdes
  // werden gedreht, nichts wird pro Frame neu gebaut. Selbstheilende Registry:
  // entfernte Figuren werden hier ausgetragen.
  if(window._figHorses && window._figHorses.length){
    const hs = window._figHorses;
    for(let i=hs.length-1;i>=0;i--){
      const h = hs[i];
      if(!h.root.parent){ hs.splice(i,1); continue; }
      const ph = h.phase;
      // Körper: sanftes Atmen (Y) + langsame Gewichtsverlagerung (Roll)
      h.body.position.y = Math.sin(dt*1.1 + ph) * 0.22;
      h.body.rotation.z = Math.sin(dt*0.55 + ph*1.3) * 0.05;
      // Schweif: Grundwedeln + gelegentlicher stärkerer Schlag
      if(h.tail){
        h.tail.rotation.z = Math.sin(dt*1.7 + ph) * 0.28 + Math.sin(dt*3.3 + ph)*0.08;
        h.tail.rotation.x = Math.sin(dt*0.9 + ph*1.7) * 0.12;
      }
      // Kopf/Hals: Nicken + Umsehen + gelegentliches Grasen (deutlich sichtbar)
      if(h.neck){
        const graze = Math.max(0, Math.sin(dt*0.21 + ph*0.7));
        h.neck.rotation.x = Math.sin(dt*0.8 + ph)*0.12 + graze*graze*0.5;
        h.neck.rotation.y = Math.sin(dt*0.5 + ph*1.9)*0.18;
      }
      // Beine: dezente Gewichtsverlagerung (kleine Winkel → Hufe bleiben nahezu
      // am Boden), diagonal versetzt → wirkt wie ruhiges Stehen, kein Marschieren
      if(h.legs){
        for(let li=0; li<h.legs.length; li++){
          const leg = h.legs[li]; if(!leg) continue;
          leg.rotation.x = Math.sin(dt*0.6 + ph + li*1.7) * 0.02;
        }
      }
    }
  }

  // Gegliederte Figuren (Fußsoldaten + Reiter): natürlicher Leerlauf über die
  // Gelenk-Pivots — Oberkörper atmet/wiegt, Arme schwingen (gegenphasig), Kopf
  // sieht sich um/nickt. Waffe/Schild/Helm hängen in den Gelenken → gehen mit.
  // Selbstheilende Registry wie bei den Pferden.
  if(window._figArtic && window._figArtic.length){
    const aa = window._figArtic;
    for(let i=aa.length-1;i>=0;i--){
      const e = aa[i];
      if(!e.root.parent){ aa.splice(i,1); continue; }
      const ph = e.phase, j = e.j;

      /* Kampfhaltung: die Haltung hängt am BANNER (banner.userData.combatStance),
         nicht an der Figuren-Gruppe — so übersteht sie den Figuren-Rebuild nach
         jeder Verlustrunde. fg ist figuresGroup ODER bubbleGroup, beide tragen
         einen Rückverweis ownerBanner. */
      const fg = e.root.parent;
      const banner = fg.userData && fg.userData.ownerBanner;
      const stance = (banner && banner.userData.combatStance) || null;   // 'attack' | 'defend' | null

      /* Sanftes Ein-/Ausblenden der Haltung (stB 0..1); die zuletzt gesetzte
         Haltungsart bleibt zum Ausblenden erhalten. Basis-Ausrichtung der Figur
         wird einmalig gemerkt, um nach dem Kampf dorthin zurückzudrehen. */
      if(e._idleRotY == null) e._idleRotY = e.root.rotation.y;
      if(stance) e.stKind = stance;
      e.stB = (e.stB || 0) + ((stance ? 1 : 0) - (e.stB || 0)) * 0.10;
      const b = e.stB;

      /* Leerlauf-Zielwerte (Atmen, Arm-Schwung, Umsehen, Gewichtsverlagerung) */
      let torsoY = e.torsoBaseY + Math.sin(dt*1.3 + ph) * 0.5;
      let torsoZ = Math.sin(dt*0.8 + ph) * 0.07;
      let torsoX = Math.sin(dt*1.0 + ph*1.3) * 0.05;
      let aRx = Math.sin(dt*1.0 + ph) * 0.35,           aRz = Math.sin(dt*0.7 + ph*1.5) * 0.13;
      let aLx = Math.sin(dt*1.0 + ph + Math.PI) * 0.30, aLz = Math.sin(dt*0.7 + ph*1.5 + Math.PI) * 0.13;
      let hY  = Math.sin(dt*0.5 + ph*1.7) * 0.45,       hX  = Math.sin(dt*0.9 + ph) * 0.12;
      let lRx = Math.sin(dt*1.0 + ph) * 0.08,           lLx = Math.sin(dt*1.0 + ph + Math.PI) * 0.08;

      /* Kampfhaltung in die Leerlaufwerte überblenden. Arme: rechter Arm trägt
         die Waffe, linker den Schild; ein Gelenk-Pivot dreht mit rotation.x den
         herabhängenden Arm nach VORN (−) bzw. hinten (+). */
      if(b > 0.001){
        let pTorsoY, pTorsoZ, pTorsoX, pARx, pARz, pALx, pALz, pHY, pHX, pLRx, pLLx;
        if(e.stKind === 'defend'){
          // Verteidigungsstellung: geduckt, Schildarm hoch und quer vor den Körper
          const breathe = Math.sin(dt*1.6 + ph) * 0.05;
          pTorsoY = e.torsoBaseY - 0.6 + Math.sin(dt*1.4 + ph)*0.12;
          pTorsoZ = 0.03;              pTorsoX = 0.06;
          pALx = -1.28 + breathe;      pALz = 0.36;    // Schild hoch/quer
          pARx = -0.18;                pARz = -0.12;   // Waffe tief bereit
          pHY  = 0.0;                  pHX  = 0.06;
          pLRx = 0.30;                 pLLx = -0.22;   // Hinterbein gestemmt
        } else {
          // Angriffsstellung: nach vorn gelehnt, Waffenarm hoch, rhythmischer Stoß
          const jab = Math.sin(dt*3.2 + ph) * 0.35;
          pTorsoY = e.torsoBaseY - 0.25 + Math.sin(dt*2.2 + ph)*0.10;
          pTorsoZ = 0.0;               pTorsoX = 0.30 + jab*0.10;
          pARx = -1.15 + jab;          pARz = -0.18;   // Waffe hoch + Stoßbewegung
          pALx = -0.35;                pALz = 0.16;    // Schild leicht angehoben
          pHY  = 0.0;                  pHX  = 0.10;
          pLRx = -0.38;                pLLx = 0.30;    // Ausfallschritt
        }
        torsoY += (pTorsoY - torsoY) * b;  torsoZ += (pTorsoZ - torsoZ) * b;  torsoX += (pTorsoX - torsoX) * b;
        aRx += (pARx - aRx) * b;  aRz += (pARz - aRz) * b;
        aLx += (pALx - aLx) * b;  aLz += (pALz - aLz) * b;
        hY  += (pHY  - hY ) * b;  hX  += (pHX  - hX ) * b;
        lRx += (pLRx - lRx) * b;  lLx += (pLLx - lLx) * b;
      }

      if(j.torso){ j.torso.position.y = torsoY; j.torso.rotation.z = torsoZ; j.torso.rotation.x = torsoX; }
      if(j.armR){  j.armR.rotation.x = aRx; j.armR.rotation.z = aRz; }
      if(j.armL){  j.armL.rotation.x = aLx; j.armL.rotation.z = aLz; }
      if(j.head){  j.head.rotation.y = hY;  j.head.rotation.x = hX; }
      if(j.legR)   j.legR.rotation.x = lRx;
      if(j.legL)   j.legL.rotation.x = lLx;

      /* Ausrichtung: im Kampf zum Gegner drehen (combatAimWorld ist ein WELT-
         Winkel; die Figur liegt in der um fg.rotation.y gedrehten Formation),
         sonst sanft zurück in die Ausgangslage. Kürzesten Drehweg wählen. */
      let aimLocal = e._idleRotY;
      if(stance) aimLocal = (banner.userData.combatAimWorld || 0) - fg.rotation.y + Math.sin(ph)*0.05;
      let dRot = aimLocal - e.root.rotation.y;
      while(dRot >  Math.PI) dRot -= Math.PI*2;
      while(dRot < -Math.PI) dRot += Math.PI*2;
      if(Math.abs(dRot) > 0.001) e.root.rotation.y += dRot * 0.10;
    }
  }

  // Kriegsmaschinen (Tier 10): Feuer-Zyklus je beweglichem Teil — lange geladen
  // warten, schnell abfeuern, langsam wieder spannen. k∈[0,1]: 0=geladen(a),
  // 1=abgefeuert(b). Selbstheilende Registry wie die übrigen.
  if(window._figEngines && window._figEngines.length){
    const es = window._figEngines;
    for(let i=es.length-1;i>=0;i--){
      const e = es[i];
      if(!e.root.parent){ es.splice(i,1); continue; }
      for(let p=0;p<e.parts.length;p++){
        const obj = e.parts[p], mv = obj.userData.engMove;
        let cyc = (dt*mv.speed + e.phase) % 1; if(cyc < 0) cyc += 1;
        let k;
        if(cyc < 0.60)      k = 0;                    // geladen, wartet
        else if(cyc < 0.70) k = (cyc-0.60)/0.10;      // Schuss (schnell)
        else                k = 1 - (cyc-0.70)/0.30;  // Rückstellung (langsam)
        const val = mv.a + k*(mv.b - mv.a);
        if(mv.kind === 'rot') obj.rotation[mv.axis] = val;
        else                  obj.position[mv.axis] = val;
      }
      /* Im Kampf die Maschine zum Gegner ausrichten (wie die Fußtruppen), sonst
         sanft zurück in die Ausgangslage. */
      const efg = e.root.parent, eBanner = efg && efg.userData && efg.userData.ownerBanner;
      const eStance = eBanner && eBanner.userData.combatStance;
      if(e._idleRotY == null) e._idleRotY = e.root.rotation.y;
      let eAim = eStance ? (eBanner.userData.combatAimWorld || 0) - efg.rotation.y : e._idleRotY;
      let eD = eAim - e.root.rotation.y;
      while(eD >  Math.PI) eD -= Math.PI*2;
      while(eD < -Math.PI) eD += Math.PI*2;
      if(Math.abs(eD) > 0.001) e.root.rotation.y += eD * 0.10;
    }
  }

  // Banner zur Kamera ausrichten:
  //  • Latte (Schwenk-Gruppe): GIER-Drehung um die Pfahl-Achse
  //  • Tuch zusätzlich: NICK-Drehung um seine Oberkante (die Latte),
  //    damit es auch bei Aufsicht flach zur Kamera kippt und lesbar bleibt.
  //  Zusammen ergibt das ein vollwertiges Billboard, das aber an der Latte
  //  aufgehängt bleibt — der Pfahl steht weiterhin fest.
  // (window._tBanners statt typeof: render() läuft schon vor der
  //  const-Deklaration von _tBanners — Property-Zugriff ist TDZ-sicher.)
  if(window._tBanners){
    // Frustum für Culling aufbauen (wiederverwendete Objekte, keine Allokation)
    _bannerFrustum.setFromProjectionMatrix(
      _bannerFrustumMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    );
    window._tBanners.forEach(banner => {
      if(!banner.visible) return;
      // Nur sichtbare Banner animieren (Frustum Culling)
      if(!_bannerFrustum.containsPoint(banner.position)) return;

      /* Auswahl-Hervorhebung: das Banner des gewählten Territoriums hebt
         sich an (mit dem Land) und wird leicht vergrößert. Weicher Lerp. */
      const selTarget = banner.userData.selected ? 1 : 0;
      const cur = banner.userData.selCur || 0;
      const next = cur + (selTarget - cur) * 0.18;
      banner.userData.selCur = next;
      const baseY = banner.userData.baseY || 0;
      banner.position.y = baseY + next * (LIFT_AMOUNT * 1.5);
      /* Grundgröße skaliert mit der Truppenzahl (gedeckelt), Auswahl legt
         nochmals eine kleine Vergrößerung obendrauf. */
      const sizeFactor = banner.userData.sizeFactor || 1;
      const s = sizeFactor * (1 + next * 0.18);
      banner.scale.set(s, s, s);

      /* Spezialeinheiten-Modelle (Turm/Ritter/Katapult) NICHT mitwachsen und
         nicht nach außen wandern lassen — sonst ragen sie bei vielen Truppen
         über die Territoriumsgrenze/Küste. Welt-Größe und -Position werden per
         Gegen-Skalierung (1/s) konstant auf ihrem Ausgangs-Offset gehalten. */
      const sp0 = banner.userData.specials;
      if(sp0){
        const inv = 1 / s;
        for(const k in sp0){
          const m = sp0[k];
          if(!m || !m.userData.baseOffset) continue;
          const b = m.userData.baseOffset;
          m.position.set(b.x * inv, b.y * inv, b.z * inv);
          m.scale.setScalar(inv);
        }
      }

      /* Truppen-Figuren ebenfalls NICHT mit der (truppenzahl-getriebenen)
         Bannergröße mitwachsen lassen — sonst wird eine große Armee dadurch
         zusätzlich zur eigenen figScale-Anpassung riesig. Gleiche
         Gegen-Skalierung wie bei den Spezialeinheiten oben. */
      const fg0 = banner.userData.figuresGroup;
      if(fg0){
        const inv = 1 / s;
        const fa = banner.userData.figAway;
        /* Vormarsch zur Grenze: im Kampf die Formation Richtung Gegner schieben
           (banner.userData.combatAdvance), sanft ein-/ausgeblendet über _advCur.
           Ohne Kampf bleibt es beim normalen figAway-Offset. */
        const advTarget = banner.userData.combatStance ? 1 : 0;
        const advCur = (banner.userData._advCur || 0) + (advTarget - (banner.userData._advCur || 0)) * 0.08;
        banner.userData._advCur = advCur;
        const ad = banner.userData.combatAdvance;
        let ox = fa ? fa.ox : 0, oz = fa ? fa.oz : 0, oy = 0;
        if(ad && advCur > 0.001){ ox += ad.ox * advCur; oz += ad.oz * advCur; oy = ad.y * advCur; }
        fg0.position.set(ox * inv, oy * inv, oz * inv);
        fg0.scale.setScalar(inv);
      }
      // Blasen-Plattform ebenfalls konstant halten (Gegen-Skalierung wie bei
      // den Figuren) — plus "dynamische" Darstellung: sanftes Auf-und-ab und
      // minimales seitliches Treiben, mit Phase pro Banner (kein synchrones
      // Wippen aller Blasen). Wirkt bei Wasser-Plattformen wie Wellengang.
      const bg0 = banner.userData.bubbleGroup;
      if(bg0){
        bg0.scale.setScalar(1 / s);
        if(bg0.visible){
          const tb = performance.now() * 0.001;
          const ph = banner.userData.bubblePhase || 0;
          bg0.position.y = Math.sin(tb * 1.2 + ph) * 0.55;
          bg0.rotation.y = Math.sin(tb * 0.45 + ph) * 0.05;
        }
      }

      const sw = banner.userData.swivel;
      if(!sw) return;
      const dx = camera.position.x - banner.position.x;
      const dz = camera.position.z - banner.position.z;
      const dy = camera.position.y - banner.position.y;
      /* Gieren: Latte dreht sich horizontal zur Kamera */
      sw.rotation.y = Math.atan2(dx, dz);
      /* Nicken: Tuch kippt um seine Oberkante zur Kamera-Höhe.
         φ=0 (Kamera auf Augenhöhe) → Tuch senkrecht.
         φ=90° (Kamera senkrecht oben) → Tuch waagerecht, Fläche nach oben. */
      const cloth = banner.userData.cloth;
      if(cloth){
        const horiz = Math.sqrt(dx*dx + dz*dz);
        cloth.rotation.x = -Math.atan2(dy, horiz);
      }
    });
  }

  updateZoom();

  /* Beim Rauszoomen soll die Karte HELL erleuchtet sein (gilt für alle Karten):
     Fog UND der Ozean-Tiefen-Tint werden mit zunehmendem Zoom ausgeblendet.
     t = 0 am Standard-Radius (420) → atmosphärischer Standard-Look bleibt exakt;
     t = 1 am maximalen Zoom (maxRadius) → Fog praktisch aus + offene See hell.
     Deckt alle Zoom-Pfade ab (Buttons, Wheel, Pinch), da zentral im Render-Loop. */
  const _zt = Math.min(1, Math.max(0,
    (controls.radius - FOG_BASE_RADIUS) / (controls.maxRadius - FOG_BASE_RADIUS)));
  /* Ease-out (früh ansteigend) statt smoothstep: schon moderates Rauszoomen soll
     spürbar aufhellen, nicht erst kurz vor dem Maximal-Zoom. _ze=0 bei radius 420. */
  const _ze = _zt * (2 - _zt);
  // Fog: near/far weit hinausschieben, bis nichts mehr im Nebel liegt (near > camera.far=2000).
  scene.fog.near = FOG_BASE_NEAR + _ze * 3000;
  scene.fog.far  = FOG_BASE_FAR  + _ze * 4000;
  // Ozean: Tiefen-Tint herunterfahren (offene See läuft nicht nach Schwarz) …
  seaUniforms.uDepthMax.value = 0.5 - _ze * 0.42;
  // … UND die ganze See zu hellem Blau anheben, damit die herausgezoomte Karte
  // hell wirkt (dunkle Navy-See ist der Hauptgrund fürs empfundene Abdunkeln).
  seaUniforms.uSeaLift.value = _ze;
  // Hintergrund (Horizont jenseits der Ozean-Ebene) von dunkel → helle See blenden,
  // damit beim Rauszoomen kein schwarzes Band am Horizont erscheint.
  scene.background.copy(BG_NEAR).lerp(BG_FAR, _ze);

  /* Kampf-Kamerawackeln: nach dem sauberen Orbit-Update einen
     zufälligen Versatz addieren, der über wenige Frames abklingt. */
  if(_camShakeAmp > 0){
    controls.update();
    if(_camShakeAmp > 0.06){
      camera.position.x += (Math.random() - 0.5) * _camShakeAmp;
      camera.position.y += (Math.random() - 0.5) * _camShakeAmp;
      camera.position.z += (Math.random() - 0.5) * _camShakeAmp;
    }
    _camShakeAmp = Math.max(0, _camShakeAmp - _camShakeDecay);
  }

  // Sichtbarkeit hängt nur von zwei Zoom-Schwellwerten ab — bisher wurden
  // ALLE Territory-/Region-Labels (100+) auf JEDEM Frame neu durchlaufen,
  // auch wenn sich der Zoom seit dem letzten Frame gar nicht über die
  // Schwelle bewegt hat. Nur bei tatsächlichem Schwellwert-Wechsel aktualisieren.
  const showSmall = controls.radius < 380;
  if(showSmall !== _renderState.showSmall){
    _renderState.showSmall = showSmall;
    territoryLabels.forEach(l => l.visible = showSmall);
  }
  const showRegionLabels = controls.radius > 250;
  if(showRegionLabels !== _renderState.showRegionLabels){
    _renderState.showRegionLabels = showRegionLabels;
    labelGroup.children.forEach(l => {
      if (l.userData.regionLabel) l.visible = showRegionLabels;
    });
  }

  /* Kontinent-Glow sanft pulsieren lassen (geteilte Materialien, s.
     map3d_setContinentGlow) — billig: nur Opacity-Werte, keine Geometrie. */
  if(window._contGlowMatList && window._contGlowMatList.length){
    const gOp = 0.55 + 0.35 * Math.sin(performance.now() * 0.0025);
    for(const mt of window._contGlowMatList) mt.opacity = gOp;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});


/* ============================================================
   GAME INTEGRATION API — called by eryndor game logic
   ============================================================ */

// Map from territory id → array of sibling meshes.
// territoryMeshes + territorySiblings werden erst in den aufgeschobenen
// _wbDecorBuilders gebaut, daher diese Zuordnung ebenfalls aufschieben (als
// LETZTER Builder, nach dem Territorien-/Geschwister-Aufbau) — sonst bliebe
// _meshById leer und Banner/Städte/Burgen/Häfen/Schiffe würden nicht platziert.
const _meshById = new Map();
_wbDecorBuilders.push(function(){
  _meshById.clear();
  territoryMeshes.forEach(m => {
    const id = m.userData.id;
    if (!_meshById.has(id)) _meshById.set(id, []);
    _meshById.get(id).push(m);
    // Add siblings from the same logical group (multi-part territories)
    const sibs = territorySiblings.get(m) || [m];
    sibs.forEach(s => {
      if (!_meshById.has(s.userData.id)) _meshById.set(s.userData.id, []);
      if (!_meshById.get(s.userData.id).includes(s)) _meshById.get(s.userData.id).push(s);
    });
  });
});

// Set owner colors: colorMap = { id: '#rrggbb', ... }
window.map3d_setOwnerColors = function(colorMap) {
  for (const [id, hex] of Object.entries(colorMap)) {
    const meshes = _meshById.get(id) || [];
    const col = parseInt(hex.replace('#',''), 16);
    meshes.forEach(m => {
      m.material.color.setHex(col);
      m.userData.baseColor = col;
    });
  }
};

// Reset all territories to their base/owner colors
window.map3d_resetColors = function() {
  territoryMeshes.forEach(m => {
    if (m.userData.baseColor !== undefined) {
      m.material.color.setHex(m.userData.baseColor);
    }
  });
};

/* ── Kontinent-Glow: leuchtende Umrandung, wenn EIN Spieler einen ganzen
   Kontinent hält. Nutzt die vorhandenen Grenzlinien der Deckflächen
   (mesh.userData.edges): pro Territorium wird lazily eine Glow-Kopie in
   Besitzerfarbe erzeugt (GETEILTE Geometrie, additives Linienmaterial,
   leicht angehoben) und je nach Halte-Status ein-/ausgeblendet. Zusätzlich
   glimmt die Deckfläche schwach in der Besitzerfarbe (emissive). Das
   Pulsieren der Linien übernimmt der Render-Loop (window._contGlowMatList).
   contMap: { kontinentKey: '#rrggbb' | null/undefined } */
const _contGlowMats = new Map();     // hex → geteiltes Linienmaterial
window._contGlowMatList = [];        // fürs Pulsieren im Render-Loop
function _contGlowMat(hex){
  let mt = _contGlowMats.get(hex);
  if(!mt){
    mt = new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.85,
                                       blending: THREE.AdditiveBlending, depthWrite: false });
    _contGlowMats.set(hex, mt);
    window._contGlowMatList.push(mt);
  }
  return mt;
}
window.map3d_setContinentGlow = function(contMap){
  if(IS_NAVAL) return;   // See-Karten haben keine Landumrisse
  territoryMeshes.forEach(m => {
    const hex = contMap ? contMap[m.userData.group] : null;
    let glow = m.userData.glowEdges;
    if(!hex){
      if(glow) glow.visible = false;
      if(m.material.emissive) m.material.emissive.setHex(0x000000);
      return;
    }
    if(!glow){
      const edges = m.userData.edges;
      if(!edges) return;
      glow = new THREE.Group();
      edges.children.forEach(line => {
        const gl = new THREE.LineLoop(line.geometry, _contGlowMat(hex));
        gl.renderOrder = 15;
        glow.add(gl);
      });
      glow.position.y = 0.35;   // knapp über der dunklen Grenzlinie
      scene.add(glow);
      m.userData.glowEdges = glow;
    } else {
      glow.children.forEach(l => { l.material = _contGlowMat(hex); });
    }
    glow.visible = true;
    if(m.material.emissive) m.material.emissive.set(hex).multiplyScalar(0.16);
  });
};

/* Markiert das Banner des gewählten Territoriums: das logische Banner wird
   angehoben und vergrößert, damit klar erkennbar ist, welche Standarte zum
   ausgewählten Gebiet gehört. selectedId ist eine Stück-ID; _pieceToTerritory
   liefert den logischen Schlüssel, unter dem das Banner abgelegt ist. */
function map3d_setSelectedBanner(selectedId) {
  if (!window._tBanners) return;
  let selKey = null;
  if (selectedId && typeof _pieceToTerritory !== 'undefined') {
    selKey = _pieceToTerritory[selectedId] || null;
  }
  window._tBanners.forEach((banner, key) => {
    banner.userData.selected = (selKey !== null && key === selKey);
  });
}
window.map3d_setSelectedBanner = map3d_setSelectedBanner;

// Markiert Gebiete vollständig kontrollierter Bonus-Kontinente (goldenes Leuchten)
const BONUS_GLOW_HEX = 0x7a5e1e;
window.map3d_setBonusContinents = function(ids){
  const set = new Set(ids || []);
  territoryMeshes.forEach(m => { m.userData.bonusGlow = set.has(m.userData.id); });
};

// Set highlights: selectedId, targetIds (attack), moveIds (movement), disabledIds
window.map3d_setHighlights = function(selectedIds, targetIds, moveIds, disabledIds, combatMode) {
  const selectedSet = new Set(Array.isArray(selectedIds) ? selectedIds : (selectedIds ? [selectedIds] : []));
  const targetSet   = new Set(targetIds  || []);
  const moveSet     = new Set(moveIds    || []);
  const disabledSet = new Set(disabledIds || []);
  const dimFactor   = combatMode ? 0.15 : 0.5;

  if (IS_NAVAL) {
    /* Naval: die Inselflächen bleiben komplett unsichtbar (kein Umfärben auf
       opak!) — der Auswahl-/Ziel-/Bewegungs-Glow wird stattdessen auf die
       Schiffsrümpfe gelegt. So sind die Schiffe die einzigen sichtbaren und
       hervorgehobenen Marker. */
    territoryMeshes.forEach(m => {
      m.material.emissive.setHex(0x000000);
      m.material.transparent = true;
      m.material.opacity = 0;
      setLift(m, 0);
    });
    if (window._navalHulls && typeof LOGICAL_TERRITORIES !== 'undefined') {
      LOGICAL_TERRITORIES.forEach(lt => {
        const hulls = window._navalHulls.get(lt.key);
        if (!hulls) return;
        const anyIn = set => lt.pieceIds.some(id => set.has(id));
        let hex = 0x000000, inten = 1;
        if (anyIn(selectedSet))      { hex = combatMode ? 0xffaa33 : 0xffcc44; inten = 1.5; }
        else if (anyIn(targetSet))   { hex = combatMode ? 0xff2200 : 0xaa1100; inten = 1.4; }
        else if (anyIn(moveSet))     { hex = 0x1166cc; inten = 1.1; }
        else if (anyIn(disabledSet)) { hex = 0x000000; inten = 1; }
        else if (lt.pieceIds.some(id => { const mm = territoryMeshById.get(id); return mm && mm.userData.bonusGlow; }))
                                     { hex = BONUS_GLOW_HEX; inten = 1; }
        hulls.forEach(mm => { if (mm.emissive) { mm.emissive.setHex(hex); mm.emissiveIntensity = inten; } });
        /* Ausgewähltes Schiff sichtbar anheben (Animation im Render-Loop). Im
           Schiffskampf wird auch das VERTEIDIGENDE (angegriffene) Schiff genau so
           angehoben wie das angreifende — beide Kämpfer sind so gleich sichtbar. */
        const grp = window._navalShipGroups && window._navalShipGroups.get(lt.key);
        if (grp) grp.userData.selTarget = (anyIn(selectedSet) || (combatMode && anyIn(targetSet))) ? 1 : 0;
      });
    }
    map3d_setSelectedBanner([...selectedSet][0] || null);
    return;
  }

  territoryMeshes.forEach(m => {
    const id = m.userData.id;
    m.material.emissive.setHex(0x000000);
    setLift(m, 0);

    /* Territorien bleiben blickdicht: zuerst auf Basisfarbe zurücksetzen,
       Transparenz aus. Abgedunkelt wird über die Diffusfarbe, NICHT über
       Opazität — sonst scheint die See durch das Gebiet hindurch. */
    m.material.transparent = false;
    m.material.opacity = 1.0;
    const base = m.userData.baseColor;
    if (base !== undefined) m.material.color.setHex(base);

    if (selectedSet.has(id)) {
      if (combatMode) {
        /* Angreifer im Kampf: HAUSFARBE beibehalten (kein pauschales Gold) —
           nur dezent in der eigenen Farbe aufleuchten und anheben. Wer wen
           angreift, zeigen jetzt der Angriffspfeil (map3d_showAttackArrow) und
           die zur Grenze vorrückenden Truppen. */
        if (base !== undefined) m.material.emissive.setHex(base).multiplyScalar(0.30);
        setLift(m, LIFT_AMOUNT * 1.5);
      } else {
        m.material.emissive.setHex(0x664422);
        setLift(m, LIFT_AMOUNT * 1.5);
      }
    } else if (targetSet.has(id)) {
      if (combatMode) {
        // Verteidiger im Kampf: ebenfalls Hausfarbe behalten, dezent aufleuchten.
        if (base !== undefined) m.material.emissive.setHex(base).multiplyScalar(0.30);
        setLift(m, LIFT_AMOUNT * 1.0);
      } else {
        m.material.emissive.setHex(0x441100);
        setLift(m, LIFT_AMOUNT * 0.6);
      }
    } else if (moveSet.has(id)) {
      m.material.emissive.setHex(0x002244);
      setLift(m, LIFT_AMOUNT * 0.4);
    } else if (disabledSet.has(id)) {
      // Abgedunkelt: Diffusfarbe Richtung Schwarz skalieren, Gebiet bleibt opak
      if (base !== undefined) m.material.color.setHex(base).multiplyScalar(dimFactor);
    } else if (m.userData.bonusGlow) {
      // Vollständig kontrollierter Bonus-Kontinent → goldenes Leuchten
      m.material.emissive.setHex(BONUS_GLOW_HEX);
    }
  });

  map3d_setSelectedBanner([...selectedSet][0] || null);
};

// Reset all highlights to neutral
window.map3d_resetHighlights = function() {
  if (IS_NAVAL) {
    /* Naval: Inseln unsichtbar lassen und den Rumpf-Glow löschen (Bonus-Glow
       an den Schiffen bleibt erhalten, falls gesetzt). */
    territoryMeshes.forEach(m => {
      m.material.emissive.setHex(0x000000);
      m.material.transparent = true;
      m.material.opacity = 0;
      setLift(m, 0);
    });
    if (window._navalHulls && typeof LOGICAL_TERRITORIES !== 'undefined') {
      LOGICAL_TERRITORIES.forEach(lt => {
        const hulls = window._navalHulls.get(lt.key);
        if (!hulls) return;
        const bonus = lt.pieceIds.some(id => { const mm = territoryMeshById.get(id); return mm && mm.userData.bonusGlow; });
        hulls.forEach(mm => { if (mm.emissive) { mm.emissive.setHex(bonus ? BONUS_GLOW_HEX : 0x000000); mm.emissiveIntensity = 1; } });
        const grp = window._navalShipGroups && window._navalShipGroups.get(lt.key);
        if (grp) grp.userData.selTarget = 0;
      });
    }
    map3d_setSelectedBanner(null);
    return;
  }
  territoryMeshes.forEach(m => {
    m.material.emissive.setHex(m.userData.bonusGlow ? BONUS_GLOW_HEX : 0x000000);
    m.material.transparent = false;
    m.material.opacity = 1.0;
    if (m.userData.baseColor !== undefined) m.material.color.setHex(m.userData.baseColor);
    setLift(m, 0);
  });
  map3d_setSelectedBanner(null);
};

/* ============================================================
   KAMPFMODUS — Kamera-Fokus & -Wackeln
   (Zustandsvariablen sind weiter oben vor render() deklariert)
   ============================================================ */

/* Fährt die Kamera auf den Mittelpunkt zweier Territorien und zoomt so,
   dass beide ins Bild passen. Die vorherige Sicht wird gemerkt. */
window.map3d_focusTerritories = function(idA, idB){
  const centers = [];
  [idA, idB].forEach(id => {
    const ms = _meshById ? (_meshById.get(id) || []) : [];
    if(!ms.length) return;
    const bb = new THREE.Box3();
    ms.forEach(m => bb.expandByObject(m));
    centers.push(bb.getCenter(new THREE.Vector3()));
  });
  if(!centers.length) return;
  const mid = new THREE.Vector3();
  centers.forEach(c => mid.add(c));
  mid.multiplyScalar(1 / centers.length);
  // Aktuelle Sicht sichern
  _savedBattleView = {
    r: zoomTargetRadius, th: zoomTargetTheta, ph: zoomTargetPhi,
    x: zoomTargetX,      z: zoomTargetZ
  };
  const span = centers.length === 2 ? centers[0].distanceTo(centers[1]) : 140;
  zoomTargetX = mid.x;
  zoomTargetZ = mid.z;
  zoomTargetRadius = clampRadius(Math.max(155, span * 1.85 + 95));
  zoomTargetPhi = Math.max(controls.minPhi, Math.min(controls.maxPhi, 1.05));
};

/* Mittelpunkt (Oberkante) eines Territoriums als Weltpunkt — von Pfeil, Marsch
   und Kampfhaltung gemeinsam genutzt. */
function _terrCenter(id){
  const ms = _meshById ? (_meshById.get(id) || []) : [];
  if(!ms.length) return null;
  const bb = new THREE.Box3(); ms.forEach(m => bb.expandByObject(m));
  const c = bb.getCenter(new THREE.Vector3());
  c.y = bb.max.y;
  return c;
}

/* Banner eines Territoriums über das logische Territorium finden (ein Banner je
   logischem Territorium, gekeyt auf lt.key). */
function _bannerForTerritoryId(id){
  if(typeof LOGICAL_TERRITORIES !== 'undefined'){
    const lt = LOGICAL_TERRITORIES.find(l => l.pieceIds.includes(id));
    if(lt) return _tBanners.get(lt.key) || null;
  }
  return _tBanners.get(id) || null;
}

/* Geländefolgender Pfad zwischen zwei Weltpunkten: die Strecke wird in Stützen
   zerlegt, an jeder Stütze die echte Terrain-Höhe per Raycast bestimmt (Lücken/
   Wasser → linear interpoliert) und knapp `lift` darüber gelegt. So verläuft
   Pfeil/Marsch DURCH die Territorien (der Kontur folgend), nicht im Bogen darüber. */
function _groundCurve(a, b, lift){
  lift = (lift == null) ? 2.2 : lift;
  const meshes = (typeof territoryMeshes !== 'undefined') ? territoryMeshes : [];
  const N = 26;
  const pts = [];
  for(let i=0; i<=N; i++){
    const t = i / N;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    let y = meshes.length ? _terrainYOrNull(x, z, meshes) : null;
    if(y == null) y = a.y + (b.y - a.y) * t;   // über Wasser/Lücke: Endpunkt-Höhen interpolieren
    pts.push(new THREE.Vector3(x, y + lift, z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

/* Zeigt eine kleine marschierende Kolonne von Quelle zu Ziel: geklonte
   Haus-Figuren laufen entlang der Bogenbahn, mit Geh-Zyklus (Beine/Arme) und
   Blickrichtung in Laufrichtung, und werden am Ziel ausgeblendet. Nur im
   Figuren-Marker-Modus auf Land-Karten; sonst genügt der goldene Pfeil.
   `count` bestimmt die Kolonnenlänge (gedeckelt). */
window.map3d_marchTroops = function(fromId, toId, count){
  try{
    if(IS_NAVAL || FIGURE_THEME !== 'land') return;
    if(window.WB_MARKER_MODE !== 'figures') return;
    const a = _terrCenter(fromId), b = _terrCenter(toId);
    if(!a || !b) return;
    const banner = _bannerForTerritoryId(toId) || _bannerForTerritoryId(fromId);
    const facKey = (banner && banner.userData.facKey) || 'neutral';

    /* Kolonne aus den Truppenstufen zusammenstellen (max. 5 Figuren), damit die
       bewegte Menge grob zur verschobenen Zahl passt. */
    const tiers = _decomposeTroops(Math.max(1, count|0)).slice(0, 5);
    const dir = b.clone().sub(a); dir.y = 0;
    const travelAng = Math.atan2(dir.x, dir.z);
    // Geländefolgend, knapp über dem Boden — die Truppen laufen ÜBER die
    // Territorien hinweg (Füße auf der Oberfläche), nicht durch die Luft.
    const curve = _groundCurve(a, b, 0.2);

    const grp = new THREE.Group();
    grp.renderOrder = 11;
    scene.add(grp);
    const marchers = [];
    tiers.forEach((t, idx) => {
      let fig;
      try { fig = _getFigureProto(FIGURE_THEME, facKey, t).clone(); }
      catch(err){ return; }
      fig.rotation.y = travelAng;
      fig.userData._mScale = fig.scale.x;   // Grundgröße des Protos merken (Fade multipliziert darauf)
      grp.add(fig);
      const j = {};
      fig.traverse(o => { if(o.userData && o.userData.soJoint) j[o.userData.soJoint] = o; });
      marchers.push({ fig, j, lag: idx * 0.11, torsoBaseY: j.torso ? j.torso.position.y : 0 });
    });
    if(!marchers.length){ scene.remove(grp); return; }

    const DUR = Math.max(1200, Math.min(2600, a.distanceTo(b) * 7 + 700));   // Marschdauer nach Distanz
    const t0 = performance.now();
    (function step(){
      const now = performance.now();
      const e = (now - t0) / DUR;
      if(e >= 1 || !grp.parent){
        // NICHT geometry/material disposen: Klone teilen sie mit dem Proto-Cache
        // (three.clone() kopiert Geometrie/Material nicht) — Entfernen genügt.
        scene.remove(grp);
        return;
      }
      const walk = now / 1000 * 8;   // Geh-Frequenz
      marchers.forEach(m => {
        const p = Math.max(0, Math.min(1, e - m.lag));   // versetzt → Kolonne, nicht im Block
        const pos = curve.getPoint(p);
        const nxt = curve.getPoint(Math.min(1, p + 0.02));
        m.fig.position.copy(pos);
        const dx = nxt.x - pos.x, dz = nxt.z - pos.z;
        if(dx*dx + dz*dz > 1e-6) m.fig.rotation.y = Math.atan2(dx, dz);
        // Ein-/Ausblenden über die Kolonnenphase
        const fadeIn  = Math.min(1, p / 0.08);
        const fadeOut = Math.min(1, (1 - p) / 0.10);
        m.fig.scale.setScalar(Math.max(0.02, Math.min(fadeIn, fadeOut)) * (m.fig.userData._mScale || 1));
        // Geh-Zyklus: Beine gegenphasig, Arme mitschwingen, Oberkörper wippt
        const s = Math.sin(walk + m.lag*6);
        if(m.j.legR) m.j.legR.rotation.x =  s * 0.5;
        if(m.j.legL) m.j.legL.rotation.x = -s * 0.5;
        if(m.j.armR) m.j.armR.rotation.x = -s * 0.35;
        if(m.j.armL) m.j.armL.rotation.x =  s * 0.35;
        if(m.j.torso) m.j.torso.position.y = m.torsoBaseY + Math.abs(Math.sin(walk*0.5 + m.lag*6)) * 0.4;
      });
      requestAnimationFrame(step);
    })();
  }catch(e){ console.error('marchTroops', e); }
};

/* Zeichnet einen goldenen Pfeil von Quelle zu Ziel (Truppenbewegung) und
   blendet ihn nach ~2,4 s aus. Der Pfeil folgt dem Gelände (verläuft DURCH die
   Territorien, nicht im Bogen darüber). Zusätzlich marschiert im Figurenmodus
   eine kleine Kolonne los (map3d_marchTroops), damit die Bewegung sichtbar wird. */
window.map3d_drawMoveArrow = function(fromId, toId, count){
  try{
    if(count != null) window.map3d_marchTroops(fromId, toId, count);
    const centerOf = _terrCenter;
    const a = centerOf(fromId), b = centerOf(toId);
    if(!a || !b) return;
    // Geländefolgender Pfad knapp über der Oberfläche statt hohem Bogen.
    const curve = _groundCurve(a, b, 2.6);
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color:0xffd86b, transparent:true, opacity:0.96, depthTest:false });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 1.6, 8, false), mat);
    grp.add(tube);
    const tip = curve.getPoint(1), pre = curve.getPoint(0.9);
    const head = new THREE.Mesh(new THREE.ConeGeometry(5.5, 14, 14), mat);
    head.position.copy(tip);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), tip.clone().sub(pre).normalize());
    grp.add(head);
    grp.renderOrder = 12;
    scene.add(grp);
    const t0 = performance.now();
    (function fade(){
      const e = (performance.now() - t0) / 2400;
      if(e >= 1 || !grp.parent){ scene.remove(grp); tube.geometry.dispose(); head.geometry.dispose(); mat.dispose(); return; }
      mat.opacity = (e < 0.12 ? e/0.12 : 1 - (e-0.12)/0.88) * 0.96;
      requestAnimationFrame(fade);
    })();
  }catch(e){ console.error('drawMoveArrow', e); }
};

/* Dauerhafter Angriffspfeil vom Angreifer zum Verteidiger (bleibt den ganzen
   Kampf über stehen, pulsiert leicht). Schaft in der HAUSFARBE des Angreifers
   mit dunkler Umrandung → auf jeder Territoriumsfarbe gut lesbar; der Kopf sitzt
   auf dem Verteidiger, sodass die Angriffsrichtung eindeutig ist. Anders als der
   kurze Bewegungspfeil (map3d_drawMoveArrow) blendet dieser nicht aus, sondern
   wird beim Kampfende über _clearAttackArrow entfernt. */
window.map3d_showAttackArrow = function(fromId, toId){
  try{
    window._clearAttackArrow();
    if(IS_NAVAL) return;
    const a = _terrCenter(fromId), b = _terrCenter(toId);
    if(!a || !b) return;
    const banner = _bannerForTerritoryId(fromId);
    const facKey = (banner && banner.userData.facKey) || 'neutral';
    /* Akzentfarbe des Hauses (heller als die Hausfarbe → auf Karte gut sichtbar,
       auch bei dunklen Häusern wie Dravik/neutral) für den Pfeil. */
    const cfg = (typeof FACTION_BANNER_CFG !== 'undefined')
                  ? (FACTION_BANNER_CFG[facKey] || FACTION_BANNER_CFG.neutral) : null;
    const hex = (cfg && (cfg.accent || cfg.color)) || '#ffd86b';
    const col = parseInt(String(hex).replace('#',''), 16) || 0xffd86b;

    /* Bogen: leicht aufgewölbt über die Karte (Höhe distanzabhängig), Kopf
       taucht am Verteidiger von oben herab — die Angriffsrichtung bleibt klar. */
    a.y += 4; b.y += 4;
    const dist = a.distanceTo(b);
    const mid = a.clone().lerp(b, 0.5); mid.y += Math.min(70, dist * 0.28) + 18;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const grp = new THREE.Group();
    grp.renderOrder = 13;
    const shaftMat = new THREE.MeshBasicMaterial({ color: col,       transparent:true, opacity:0.94, depthTest:false });
    const edgeMat  = new THREE.MeshBasicMaterial({ color: 0x140b06,  transparent:true, opacity:0.55, depthTest:false });
    const headMat  = new THREE.MeshBasicMaterial({ color: col,       transparent:true, opacity:0.98, depthTest:false });
    const outline = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 3.0, 10, false), edgeMat);   // dunkle Kontur
    const tube    = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 2.1, 10, false), shaftMat);
    grp.add(outline); grp.add(tube);
    const tip = curve.getPoint(1), pre = curve.getPoint(0.94);
    const head = new THREE.Mesh(new THREE.ConeGeometry(8, 20, 18), headMat);
    head.position.copy(tip);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), tip.clone().sub(pre).normalize());
    grp.add(head);
    scene.add(grp);
    window._attackArrow = grp;

    const t0 = performance.now();
    (function pulse(){
      if(window._attackArrow !== grp || !grp.parent) return;   // beim Kampfende beendet sich die Schleife selbst
      const t = (performance.now() - t0) / 1000;
      const k = 0.5 + 0.5 * Math.sin(t * 4);
      shaftMat.opacity = 0.80 + 0.16 * k;
      headMat.opacity  = 0.82 + 0.18 * k;
      head.scale.setScalar(1 + 0.16 * k);
      requestAnimationFrame(pulse);
    })();
  }catch(e){ console.error('showAttackArrow', e); }
};
window._clearAttackArrow = function(){
  const grp = window._attackArrow;
  if(!grp) return;
  window._attackArrow = null;
  if(grp.parent) scene.remove(grp);
  // Eigene (nicht geteilte) Geometrien/Materialien freigeben.
  grp.traverse(o => { if(o.isMesh){ o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); } });
};

/* Setzt beide Armeen in Kampfstellung und zeigt den Angriffspfeil. Angreifer →
   Angriffsstellung + Vormarsch zur Grenze zum Verteidiger, Verteidiger →
   Verteidigungsstellung + Vormarsch zur Grenze zum Angreifer; beide drehen sich
   zum Gegner. Stellung/Vormarsch werden am Banner vermerkt (überstehen Figuren-
   Rebuilds) und im Render-Loop weich eingeblendet — sichtbar nur im Figuren-
   Marker-Modus. Der Angriffspfeil erscheint dagegen in BEIDEN Marker-Modi. */
window._combatStagedBanners = window._combatStagedBanners || [];
window.map3d_setCombatStance = function(attackerId, defenderId){
  try{
    window.map3d_clearCombatStance();
    if(IS_NAVAL) return;
    window.map3d_showAttackArrow(attackerId, defenderId);   // auch im Banner-Modus
    if(FIGURE_THEME !== 'land') return;                     // Stellungen brauchen Figuren

    const aC = _terrCenter(attackerId), dC = _terrCenter(defenderId);
    if(!aC || !dC) return;
    const apply = (id, stance, enemyC) => {
      const banner = _bannerForTerritoryId(id);
      if(!banner) return;
      const fa = banner.userData.figAway || { ox:0, oz:0 };
      const bx = banner.position.x, bz = banner.position.z;
      let dx = enemyC.x - bx, dz = enemyC.z - bz;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      banner.userData.combatStance   = stance;
      banner.userData.combatAimWorld = Math.atan2(dx, dz);   // zum Gegner blicken

      /* Vormarsch zur Grenze: Formation vom Ausgangsplatz Richtung Gegner
         schieben, im Aufstellungsfeld begrenzt. Landet der Zielpunkt neben dem
         Land (Küste/Nachbargebiet), Betrag schrittweise verkürzen, bis er auf
         echtem Terrain sitzt — so bleiben die Truppen auf ihrem Gebiet. */
      const meshes = banner.userData.terrMeshes || (typeof territoryMeshes !== 'undefined' ? territoryMeshes : []);
      const baseY  = banner.userData.baseY || 0;
      let mag = Math.min(_figFieldR(banner) * 0.6, 7);
      let ty = null;
      while(mag > 1){
        const tx = bx + fa.ox + dx*mag, tz = bz + fa.oz + dz*mag;
        ty = meshes.length ? _terrainYOrNull(tx, tz, meshes) : baseY;   // ohne Meshes: keine Höhenkorrektur
        if(ty !== null) break;
        mag *= 0.6;
      }
      banner.userData.combatAdvance = { ox: dx*mag, oz: dz*mag, y: (ty == null ? 0 : ty - baseY) };
      window._combatStagedBanners.push(banner);
    };
    apply(attackerId, 'attack', dC);
    apply(defenderId, 'defend', aC);
  }catch(e){ console.error('setCombatStance', e); }
};
window.map3d_clearCombatStance = function(){
  window._clearAttackArrow();
  if(!window._combatStagedBanners) return;
  window._combatStagedBanners.forEach(b => {
    if(b && b.userData){ b.userData.combatStance = null; }   // Render-Loop blendet zurück & dreht zur Ausgangslage
  });
  window._combatStagedBanners = [];
};

/* Stellt die Sicht von vor dem Kampf wieder her. */
window.map3d_restoreView = function(){
  window.map3d_clearCombatStance();   // Kampf vorbei → Truppen aus der Kampfhaltung lösen
  if(!_savedBattleView) return;
  zoomTargetRadius = _savedBattleView.r;
  zoomTargetTheta  = _savedBattleView.th;
  zoomTargetPhi    = _savedBattleView.ph;
  zoomTargetX      = _savedBattleView.x;
  zoomTargetZ      = _savedBattleView.z;
  _savedBattleView = null;
};

/* Löst ein kurzes Kamera-Wackeln aus (klingt im Render-Loop ab). */
window.map3d_cameraShake = function(amp){
  const a = amp || 6;
  if(a > _camShakeAmp) _camShakeAmp = a;
  _camShakeDecay = (amp || 6) / 20;
};

// Revert territory to its original region color (neutral/unowned)
window.map3d_setNeutralColor = function(id, isIce) {
  const meshes = _meshById.get(id) || [];
  const col = isIce ? 0xaab4c2 : 0x4a4a55;
  meshes.forEach(m => {
    m.material.color.setHex(col);
    m.userData.baseColor = col;
  });
};

// Troop number overlay — positioned at territory centroid
window.map3d_updateTroopLabels = function(troopMap) {
  // troopMap: { id: { troops: n, color: '#rrggbb' } }
  // Updates the sprite labels if present (requires label sprites to exist)
  if (!window._troopSprites) return;
  // Future: update THREE.js sprites
};

console.log('[map3d] Game API ready. Territories:', territoryMeshes.length);

/* ============================================================
   TERRITORY BANNER SYSTEM — animierte Banner aus objects.html
   ============================================================ */

// Fraktions-Konfiguration für Banner-Texturen (Farbe, Wappen, Akzent)
const FACTION_BANNER_CFG = {
  valen:    {name:"Haus Valen",    color:"#7b1e17", emblem:"♌", accent:"#d4a84f"},
  mordrek:  {name:"Haus Mordrek",  color:"#b48122", emblem:"♛", accent:"#ead9a0"},
  dravik:   {name:"Haus Dravik",   color:"#3a3832", emblem:"⚔", accent:"#bfb4a2"},
  aerlund:  {name:"Haus Aerlund",  color:"#143554", emblem:"♜", accent:"#cfd8df"},
  sylverin: {name:"Haus Sylverin", color:"#1c5a2e", emblem:"♣", accent:"#d8ded4"},
  kael:     {name:"Haus Kael",     color:"#4b2a58", emblem:"☠", accent:"#d0c4b0"},
  vorthan:  {name:"Haus Vorthan",  color:"#bf5a18", emblem:"☀", accent:"#f0c45b"},
  neutral:  {name:"Neutral",       color:"#3a3a45", emblem:"·", accent:"#777788"}
};

/* Shared static materials */
const _bWoodMat  = new THREE.MeshStandardMaterial({color:0x3b2416, roughness:.85});
const _bMetalMat = new THREE.MeshStandardMaterial({color:0x8c7a61, roughness:.45, metalness:.75});
const _bRingMat  = new THREE.MeshStandardMaterial({color:0x6f604b, roughness:.45, metalness:.65});
const _bLeather  = new THREE.MeshStandardMaterial({color:0x21120c, roughness:.92});
/* Materialien für Spezialeinheiten */
const _bStoneMat  = new THREE.MeshStandardMaterial({color:0x8f877a, roughness:.96});
const _bStoneDark = new THREE.MeshStandardMaterial({color:0x5d564c, roughness:.96});
const _bArmorMat  = new THREE.MeshStandardMaterial({color:0x9aa3ad, roughness:.38, metalness:.72});
const _bArmorDark = new THREE.MeshStandardMaterial({color:0x565c64, roughness:.5,  metalness:.6});
const _bWoodLight = new THREE.MeshStandardMaterial({color:0x6b4a2a, roughness:.82});
const _bCrestMat  = new THREE.MeshStandardMaterial({color:0xa8322f, roughness:.7});
/* Gold-Akzent — gemeinsames Erkennungszeichen ALLER Spezialeinheiten (Turm/
   Ritter/Katapult), damit sie sich klar von den hausgetönten Truppenfiguren
   abheben. Leichtes Eigenglühen, damit das Gold auch im Schatten liest. */
const _bGoldMat   = new THREE.MeshStandardMaterial({color:0xd9a833, roughness:.3, metalness:.85,
                      emissive:0x6a4c0e, emissiveIntensity:.45});
window._bannerClothMats = [];

/* ═══════════════════════════════════════════════════════════════════════
   GETEILTE GEOMETRIEN — jede Geometrie genau EINMAL erzeugt und von allen
   Bannern/Modellen referenziert. Spart Speicher gegenüber ~50× Duplikaten.
   Transformationen (Position/Rotation/Scale) passieren immer auf Mesh-Ebene,
   daher ist Teilen unkritisch. Zwei Geometrien (Beam, Cloth) werden hier
   EINMALIG gebacken (rotate/translate) — das ist beabsichtigt und korrekt,
   da alle Banner exakt dieselbe gebackene Form brauchen.
   ═══════════════════════════════════════════════════════════════════════ */
const _GEO = {};
(function buildSharedGeometries(){
  const S = 0.10;
  /* ─ Banner ─ */
  _GEO.bPole  = new THREE.CylinderGeometry(3.2*S, 4.4*S, 158*S, 10);
  _GEO.bRing  = new THREE.TorusGeometry(4.4*S, .6*S, 6, 16);
  _GEO.bBeam  = new THREE.CylinderGeometry(3.0*S, 3.6*S, 128*S, 10);
  _GEO.bBeam.rotateZ(Math.PI/2);                  /* einmal gebacken: Latte liegt quer */
  _GEO.bFin   = new THREE.ConeGeometry(5*S, 14*S, 6);
  _GEO.bTip   = new THREE.ConeGeometry(6.5*S, 28*S, 6);
  _GEO.bCloth = new THREE.PlaneGeometry(88*S, 78*S, 30, 40);
  _GEO.bCloth.translate(0, -39*S, 0);             /* einmal gebacken: Oberkante auf Y=0 */
  _GEO.bStrap = new THREE.BoxGeometry(4*S, 16*S, 2*S);
  _GEO.bLoop  = new THREE.TorusGeometry(4*S, .5*S, 6, 14);
  /* ─ Turm ─ */
  const TH = 72*S, TR = 17*S;
  _GEO.tBody    = new THREE.CylinderGeometry(TR, TR*1.12, TH, 14);
  _GEO.tRing    = new THREE.TorusGeometry(TR+0.4*S, 1*S, 4, 14);
  _GEO.tCorbel  = new THREE.CylinderGeometry(TR*1.28, TR*1.05, 7*S, 14);
  _GEO.tMerlon  = new THREE.BoxGeometry(7*S, 9*S, 5*S);
  _GEO.tRoof    = new THREE.ConeGeometry(TR*0.95, 22*S, 12);
  _GEO.tDoor    = new THREE.BoxGeometry(8*S, 13*S, 1.5*S);
  _GEO.tSlit    = new THREE.BoxGeometry(2*S, 6*S, 1.5*S);
  /* ─ Ritter ─ */
  _GEO.kBase    = new THREE.CylinderGeometry(13*S, 14*S, 3.5*S, 14);
  _GEO.kLeg     = new THREE.CylinderGeometry(2.8*S, 2.3*S, 17*S, 8);
  _GEO.kTorso   = new THREE.CylinderGeometry(7*S, 5.5*S, 21*S, 10);
  _GEO.kShoulder= new THREE.SphereGeometry(4.4*S, 10, 7);
  _GEO.kArm     = new THREE.CylinderGeometry(2.4*S, 2.1*S, 17*S, 8);
  _GEO.kNeck    = new THREE.CylinderGeometry(3.2*S, 3.8*S, 4*S, 8);
  _GEO.kHelm    = new THREE.CylinderGeometry(4.8*S, 4.8*S, 10*S, 12);
  _GEO.kHelmTop = new THREE.SphereGeometry(4.8*S, 12, 7, 0, Math.PI*2, 0, Math.PI/2);
  _GEO.kVisor   = new THREE.BoxGeometry(9*S, 1.8*S, 1.5*S);
  _GEO.kCrest   = new THREE.ConeGeometry(2.3*S, 11*S, 7);
  _GEO.kShaft   = new THREE.CylinderGeometry(1.1*S, 1.3*S, 78*S, 6);
  _GEO.kLanceTip= new THREE.ConeGeometry(2.4*S, 9*S, 6);
  _GEO.kGrip    = new THREE.TorusGeometry(2*S, .7*S, 5, 10);
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(-5*S, 9*S);
  shieldShape.lineTo(5*S, 9*S);
  shieldShape.lineTo(5*S, -2*S);
  shieldShape.quadraticCurveTo(5*S, -11*S, 0, -14*S);
  shieldShape.quadraticCurveTo(-5*S, -11*S, -5*S, -2*S);
  shieldShape.closePath();
  _GEO.kShield  = new THREE.ExtrudeGeometry(shieldShape,
    {depth:1.6*S, bevelEnabled:true, bevelThickness:.6*S, bevelSize:.6*S, bevelSegments:1});
  /* ─ Katapult ─ */
  _GEO.cRail    = new THREE.BoxGeometry(46*S, 4*S, 4*S);
  _GEO.cCross   = new THREE.BoxGeometry(4*S, 4*S, 22*S);
  _GEO.cWheel   = new THREE.CylinderGeometry(7*S, 7*S, 3*S, 12);
  _GEO.cHub     = new THREE.CylinderGeometry(2*S, 2*S, 4*S, 8);
  _GEO.cPost    = new THREE.CylinderGeometry(2.4*S, 2.8*S, 34*S, 8);
  _GEO.cAxle    = new THREE.CylinderGeometry(2*S, 2*S, 26*S, 8);
  _GEO.cArm     = new THREE.BoxGeometry(4*S, 50*S, 4*S);
  _GEO.cCup     = new THREE.CylinderGeometry(6*S, 4*S, 5*S, 10, 1, true);
  _GEO.cStone   = new THREE.DodecahedronGeometry(4.2*S, 0);
  _GEO.cWeight  = new THREE.BoxGeometry(10*S, 10*S, 10*S);
  _GEO.cStopper = new THREE.CylinderGeometry(2.4*S, 2.4*S, 24*S, 8);
  /* ─ Spezial-Goldakzent: Bodenring (Radius 2 WE, per Mesh-Scale angepasst)
     + Kugel-Finial für die Turmspitze ─ */
  _GEO.sGoldRing = new THREE.TorusGeometry(20*S, 1.7*S, 8, 30);
  _GEO.sGoldTip  = new THREE.SphereGeometry(2.8*S, 10, 8);
})();

/* Goldener Bodenring unter jeder Spezialeinheit — flach aufs Terrain gelegt,
   Radius in Welteinheiten (Geometrie-Basisradius 2.0 → uniform skaliert). */
function _specialGoldRing(radius){
  const ring = new THREE.Mesh(_GEO.sGoldRing, _bGoldMat);
  ring.rotation.x = Math.PI/2;
  ring.position.y = 0.14;
  ring.scale.setScalar(radius / 2.0);
  return ring;
}

/* ── Fraktionstextur — Wappen + Truppenzahl auf dem Tuch ──
   Texturformat 512×454 entspricht dem Seitenverhältnis des Tuchs (88:78),
   daher KEINE Verzerrung mehr — die Truppen-Scheibe bleibt ein echter Kreis.
   troops==null → ohne Truppenzahl.                                         */
/* ── Truppen-Pip ──────────────────────────────────────────────────────────
   Die Truppenzahl liegt auf einem eigenen Sprite, das IMMER im Vordergrund
   gezeichnet wird (depthTest:false + hoher renderOrder) und daher nicht mehr
   hinter den Territoriumsnamen verschwindet. Zusätzlich wächst das ganze
   Banner mit der Truppenzahl (gedeckelt), damit starke Gebiete auf einen
   Blick erkennbar sind, ohne das Spielfeld zu überdecken. */
function _troopSizeFactor(troops){
  const t = Math.max(1, troops|0);
  return Math.min(1.9, 1 + (t - 1) * 0.10);   // 1 Truppe = 1.0, ab ~10 gedeckelt bei 1.9
}

function _makeTroopBadgeTex(facKey, troops){
  const h = FACTION_BANNER_CFG[facKey] || FACTION_BANNER_CFG.neutral;
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const cxp = S/2, cyp = S/2, r = 104;
  ctx.beginPath(); ctx.arc(cxp, cyp, r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(18,12,8,0.94)'; ctx.fill();
  ctx.lineWidth = 16; ctx.strokeStyle = h.accent; ctx.stroke();
  ctx.lineWidth = 5;  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.arc(cxp, cyp, r-8, 0, Math.PI*2); ctx.stroke();
  const s = String(Math.max(0, troops|0));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fs = s.length >= 3 ? 108 : (s.length === 2 ? 140 : 168);
  ctx.font = 'bold ' + fs + 'px Georgia, serif';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.strokeText(s, cxp, cyp+8);
  ctx.fillStyle = h.accent;
  ctx.fillText(s, cxp, cyp+8);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
  return tex;
}

function _makeTroopBadge(facKey, troops){
  const mat = new THREE.SpriteMaterial({
    map: _makeTroopBadgeTex(facKey, troops),
    transparent: true, depthTest: false, depthWrite: false
  });
  const spr = new THREE.Sprite(mat);
  spr.renderOrder = 1002;   // über den Territoriumsnamen (renderOrder 1001)
  spr.userData.isTroopBadge = true;
  return spr;
}

function _makeBannerTex(facKey, troops, specials) {
  const h = FACTION_BANNER_CFG[facKey] || FACTION_BANNER_CFG.neutral;
  const W = 512, H = 454;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  /* Hintergrund + Stoff-Rauschen */
  ctx.fillStyle = h.color; ctx.fillRect(0,0,W,H);
  for(let i=0;i<6500;i++){
    const a=Math.random()*.10;
    ctx.fillStyle=Math.random()>.5?`rgba(255,255,255,${a})`:`rgba(0,0,0,${a})`;
    ctx.fillRect(Math.random()*W,Math.random()*H,1,1);
  }
  /* Doppelter Zierrahmen */
  ctx.strokeStyle=h.accent; ctx.lineWidth=13;
  ctx.strokeRect(24,24,W-48,H-48);
  ctx.lineWidth=4; ctx.strokeRect(40,40,W-80,H-80);
  /* Wappen als zentrales Tuch-Motiv. Die Truppenzahl steht jetzt auf einem
     separaten Pip (siehe _makeTroopBadge), der immer im Vordergrund liegt —
     nicht mehr auf dem halbtransparenten, wehenden Tuch, wo sie hinter
     Territoriumsnamen verschwinden konnte. */
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold 150px Georgia,serif';
  ctx.fillStyle=h.accent; ctx.shadowColor='rgba(0,0,0,.65)'; ctx.shadowBlur=12;
  ctx.fillText(h.emblem, W/2, 138);
  ctx.shadowBlur=0;
  /* Truppenzahl FEST auf dem Tuch (Scheibe + große Zahl), mittig unter dem
     Wappen — bleibt beim Wehen/Schwenken an der Fahne "festgenäht". */
  if(troops != null){
    const cxp=W/2, cyp=288, rr=86;
    ctx.beginPath(); ctx.arc(cxp,cyp,rr,0,Math.PI*2);
    ctx.fillStyle='rgba(18,12,8,0.93)'; ctx.fill();
    ctx.lineWidth=13; ctx.strokeStyle=h.accent; ctx.stroke();
    ctx.lineWidth=4;  ctx.strokeStyle='rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.arc(cxp,cyp,rr-8,0,Math.PI*2); ctx.stroke();
    const s=String(Math.max(0,troops|0));
    const fs = s.length>=3 ? 96 : (s.length===2 ? 128 : 152);
    ctx.font='bold '+fs+'px Georgia,serif';
    ctx.lineJoin='round'; ctx.lineWidth=13; ctx.strokeStyle='rgba(0,0,0,0.95)';
    ctx.strokeText(s, cxp, cyp+6);
    ctx.fillStyle=h.accent; ctx.fillText(s, cxp, cyp+6);
  }
  /* Spezialeinheiten als Symbol-Chips auf dem Tuch (♞ Ritter, 🏰 Turm,
     ⚙ Katapult) — nur die vorhandenen werden gezeigt. */
  if(specials){
    const syms = [];
    if(specials.knight) syms.push('\u265E');       // ♞ Ritter
    if(specials.tower)  syms.push('\uD83C\uDFF0');  // 🏰 Turm
    if(specials.siege)  syms.push('\u2699');        // ⚙ Katapult
    if(syms.length){
      const cw = 54, ch = 42, gap = 12, y = 404;
      const totalW = syms.length*cw + (syms.length-1)*gap;
      let x = W/2 - totalW/2 + cw/2;
      syms.forEach(sym => {
        const r = 11, hx = x - cw/2, hy = y - ch/2;
        ctx.beginPath();
        ctx.moveTo(hx+r, hy);
        ctx.arcTo(hx+cw, hy, hx+cw, hy+ch, r);
        ctx.arcTo(hx+cw, hy+ch, hx, hy+ch, r);
        ctx.arcTo(hx, hy+ch, hx, hy, r);
        ctx.arcTo(hx, hy, hx+cw, hy, r);
        ctx.closePath();
        ctx.fillStyle = 'rgba(16,11,7,.9)'; ctx.fill();
        ctx.strokeStyle = h.accent; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = h.accent;
        ctx.font = 'bold 32px Georgia,serif';
        ctx.fillText(sym, x, y+1);
        x += cw + gap;
      });
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

/* ── Segel-Textur (Naval) — das Segel IST das Banner ──────────────────────
   Auf Sturmsee gibt es kein schwebendes Banner-Tuch mehr: die Truppenzahl,
   das Wappen und die Spezial-Chips werden direkt aufs Rahsegel gemalt. Format
   256×320 (Hochformat wie ein Segel). troops==null → unbesetztes Schiff → nur
   schlichtes Segeltuch (Grau) ohne Hausmotiv.                                */
function _makeSailTex(facKey, troops, specials){
  const h = FACTION_BANNER_CFG[facKey] || FACTION_BANNER_CFG.neutral;
  const W = 256, H = 320;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if(troops == null){
    /* Unbesetzt: schlichtes, leicht vergilbtes Segeltuch mit Bahnen/Reffbändern */
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#dcdfe4'); g.addColorStop(1,'#b4bac3');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = 'rgba(120,128,140,0.25)'; ctx.lineWidth = 2;
    for(let x=W/6; x<W-1; x+=W/6){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(120,128,140,0.16)';
    for(let y=H/4; y<H-1; y+=H/4){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
  }
  /* Besetzt: Hausfarbe + Zierrahmen + Wappen + große Truppenzahl + Spezial-Chips */
  ctx.fillStyle = h.color; ctx.fillRect(0,0,W,H);
  for(let i=0;i<4000;i++){ const a=Math.random()*.09;
    ctx.fillStyle = Math.random()>.5?`rgba(255,255,255,${a})`:`rgba(0,0,0,${a})`;
    ctx.fillRect(Math.random()*W, Math.random()*H, 1, 1); }
  ctx.strokeStyle = h.accent; ctx.lineWidth = 10; ctx.strokeRect(14,14,W-28,H-28);
  ctx.lineWidth = 3; ctx.strokeRect(26,26,W-52,H-52);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  /* Wappen oben */
  ctx.font = 'bold 120px Georgia,serif'; ctx.fillStyle = h.accent;
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
  ctx.fillText(h.emblem, W/2, 92); ctx.shadowBlur = 0;
  /* Truppen-Scheibe mittig */
  const cxp = W/2, cyp = 186, r = 64;
  ctx.beginPath(); ctx.arc(cxp,cyp,r,0,Math.PI*2);
  ctx.fillStyle = 'rgba(18,12,8,0.92)'; ctx.fill();
  ctx.lineWidth = 10; ctx.strokeStyle = h.accent; ctx.stroke();
  const s = String(Math.max(0, troops|0));
  const fs = s.length>=3 ? 70 : (s.length===2 ? 92 : 110);
  ctx.font = 'bold ' + fs + 'px Georgia,serif';
  ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.strokeText(s, cxp, cyp+4);
  ctx.fillStyle = h.accent; ctx.fillText(s, cxp, cyp+4);
  /* Spezialeinheiten-Chips */
  if(specials){
    const syms = [];
    if(specials.knight) syms.push('♞');
    if(specials.tower)  syms.push('🏰');
    if(specials.siege)  syms.push('⚙');
    if(syms.length){
      const cw=46, ch=40, gap=8, y=272;
      const totalW = syms.length*cw + (syms.length-1)*gap;
      let x = W/2 - totalW/2 + cw/2;
      syms.forEach(sym => {
        const rr=9, hx=x-cw/2, hy=y-ch/2;
        ctx.beginPath(); ctx.moveTo(hx+rr,hy);
        ctx.arcTo(hx+cw,hy,hx+cw,hy+ch,rr); ctx.arcTo(hx+cw,hy+ch,hx,hy+ch,rr);
        ctx.arcTo(hx,hy+ch,hx,hy,rr); ctx.arcTo(hx,hy,hx+cw,hy,rr); ctx.closePath();
        ctx.fillStyle = 'rgba(16,11,7,.9)'; ctx.fill();
        ctx.strokeStyle = h.accent; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = h.accent; ctx.font = 'bold 26px Georgia,serif';
        ctx.fillText(sym, x, y+1);
        x += cw + gap;
      });
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; return tex;
}

/* ── Kielwasser-Textur (Naval) — auslaufende Schaumspur statt weißem Block ──
   Breit + hell am Heck (Canvas-Unterkante → v=0, nächste an der Kamera-Seite
   zum Schiff), verjüngt und blendet zur Spitze aus. Einmal erzeugt & geteilt. */
let _wakeTexCache = null;
function _wakeTex(){
  if(_wakeTexCache) return _wakeTexCache;
  const W=64, H=128, cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d'); ctx.clearRect(0,0,W,H);
  for(let yy=0; yy<H; yy++){
    const near = yy/(H-1);                 // 1 = am Heck (Unterkante), 0 = Spitze
    const a = Math.pow(near,0.9)*0.8;
    const halfw = (W*0.5)*(0.26+0.64*near);
    const x0 = W/2-halfw, x1 = W/2+halfw;
    const grad = ctx.createLinearGradient(x0,0,x1,0);
    grad.addColorStop(0,   'rgba(223,234,242,0)');
    grad.addColorStop(0.5, 'rgba(236,245,251,'+a+')');
    grad.addColorStop(1,   'rgba(223,234,242,0)');
    ctx.fillStyle = grad; ctx.fillRect(x0, yy, halfw*2, 1);
  }
  for(let i=0;i<420;i++){
    const near=Math.random(), yy=Math.floor(near*(H-1));
    const halfw=(W*0.5)*(0.26+0.64*near);
    const x=W/2+(Math.random()*2-1)*halfw;
    ctx.fillStyle='rgba(255,255,255,'+(Math.pow(near,1.2)*0.5*Math.random())+')';
    ctx.fillRect(x, yy, 1.5, 1.5);
  }
  const tex=new THREE.CanvasTexture(cv); tex.anisotropy=4;
  _wakeTexCache=tex; return tex;
}

/* ── Animiertes Tuch-Material (Wind-Shader aus objects.html) ──
   Wichtig: Die ursprünglichen Wind-Konstanten (26, 10, 3, 2) waren auf
   ein Tuch der Größe 92×122 Welt-Einheiten ausgelegt. Hier wird das
   Tuch per S=0.10 auf ~8.8×11.8 verkleinert — daher MÜSSEN die Wind-
   Verschiebungen mit dem gleichen Faktor skaliert werden, sonst weht
   das Tuch in völlig unrealistischen Größenordnungen.                 */
function _makeBannerMat(tex) {
  const m = new THREE.ShaderMaterial({
    transparent:true, side:THREE.DoubleSide,
    uniforms:{
      uTime:        {value:0},
      uWindStrength:{value:.22},
      uScale:       {value:0.10},  // = S aus _createTerritoryBanner
      uTexture:     {value:tex},
      uOpacity:     {value:0.7}   // deutlicher durchscheinend, damit die Gebäude dahinter gut sichtbar bleiben
    },
    vertexShader:`
      uniform float uTime; uniform float uWindStrength; uniform float uScale;
      varying vec2 vUv; varying float vShade;
      void main(){
        vUv=uv; vec3 pos=position;
        /* Linke Kante (uv.x≈0) bleibt fest am Pfahl, rechte Kante (uv.x=1) weht frei */
        float free=smoothstep(0.12,1.0,uv.x);
        float stiff=pow(free,1.7);
        /* Zwei überlagerte Sinuswellen für natürliche Tuchbewegung */
        float w1=sin(uTime*2.2+uv.x*8.0+uv.y*2.0);
        float w2=sin(uTime*3.1+uv.x*17.0);
        float wind=(w1*.75+w2*.25)*uWindStrength;
        /* Alle Verschiebungen mit uScale gewichtet → proportional zur Tuchgröße */
        pos.z += wind*stiff*26.0*uScale;
        pos.x += sin(uTime*1.5+uv.y*5.0)*stiff*3.0*uScale;
        pos.y -= pow(stiff,1.4)*10.0*uScale;          /* Schwerkraft-Hang an freier Kante */
        pos.y += sin(uTime*2.0+uv.x*5.0)*stiff*2.0*uScale;
        vShade=.65+wind*.9;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
      }`,
    fragmentShader:`
      uniform sampler2D uTexture; uniform float uOpacity; varying vec2 vUv; varying float vShade;
      void main(){
        vec4 tex=texture2D(uTexture,vUv);
        gl_FragColor=vec4(tex.rgb*(.75+vShade*.25),tex.a*uOpacity);
      }`
  });
  window._bannerClothMats.push(m);
  return m;
}

/* ── Segel-Wind-Material (Naval) — das Rahsegel weht wie ein Banner ──
   Die Oberkante (uv.y≈1) bleibt fest am Rah, nach unten weht das Tuch frei.
   Der Bauch wölbt sich IMMER nach vorn (+z = Bug), sodass das Segel stets vor
   dem Mast liegt; zusätzlich zwei überlagerte Wellen fürs Flattern. Wird in
   window._bannerClothMats registriert und im Render-Loop über uTime animiert.
   uAmp skaliert die Wölbung mit der Segelgröße. */
function _makeSailMat(tex, amp) {
  const m = new THREE.ShaderMaterial({
    side:THREE.DoubleSide,
    uniforms:{ uTime:{value:0}, uAmp:{value:amp||1.4}, uSel:{value:0}, uTexture:{value:tex} },
    vertexShader:`
      uniform float uTime, uAmp; varying vec2 vUv; varying float vSh;
      void main(){
        vUv=uv; vec3 pos=position;
        float free=smoothstep(0.0,0.9,1.0-uv.y);            /* 0 oben am Rah, 1 unten frei */
        float gust=0.55+0.45*sin(uTime*0.7);
        float w1=sin(uTime*1.8+uv.x*6.2+uv.y*2.5);
        float w2=sin(uTime*3.1+uv.x*12.0-uv.y*3.0);
        float ripple=w1*0.7+w2*0.3;
        pos.z += (gust*free)*uAmp + ripple*free*uAmp*0.35;  /* Bauch nach vorn + Rippeln */
        pos.x += sin(uTime*1.3+uv.y*4.0)*free*uAmp*0.14;    /* seitliches Flattern */
        pos.y += ripple*free*uAmp*0.06;
        vSh=0.72+ripple*0.14*free;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
      }`,
    fragmentShader:`
      uniform sampler2D uTexture; uniform float uSel; varying vec2 vUv; varying float vSh;
      void main(){ vec4 t=texture2D(uTexture,vUv);
        vec3 c = t.rgb*vSh*(1.0+uSel*0.7) + uSel*vec3(0.30,0.24,0.06);  /* Auswahl: aufleuchten + Goldstich */
        gl_FragColor=vec4(c, t.a); }`
  });
  window._bannerClothMats.push(m);
  return m;
}

/* ── Schatten-Material für das Banner-Tuch ──
   THREE wirft Schatten standardmäßig mit einem generischen Tiefen-Material,
   das NICHT die Wind-Verschiebung aus _makeBannerMat()s Vertex-Shader kennt
   — der Schattenwurf würde also immer die flache Ruhe-Pose zeigen, egal wie
   sehr das sichtbare Tuch im Wind weht. customDepthMaterial löst das: ein
   MeshDepthMaterial, dem per onBeforeCompile exakt dieselbe Verschiebung
   injiziert wird. Die Uniforms werden mit dem Tuch-Material GETEILT
   (gleiche {value}-Objekte), daher reicht es, uTime weiterhin nur auf dem
   Tuch-Material zu aktualisieren (siehe render()/_bannerClothMats). */
function _makeBannerDepthMat(sharedUniforms) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime         = sharedUniforms.uTime;
    shader.uniforms.uWindStrength = sharedUniforms.uWindStrength;
    shader.uniforms.uScale        = sharedUniforms.uScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWindStrength, uScale;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float free = smoothstep(0.12, 1.0, uv.x);
          float stiff = pow(free, 1.7);
          float w1 = sin(uTime*2.2 + uv.x*8.0 + uv.y*2.0);
          float w2 = sin(uTime*3.1 + uv.x*17.0);
          float wind = (w1*.75 + w2*.25) * uWindStrength;
          transformed.z += wind*stiff*26.0*uScale;
          transformed.x += sin(uTime*1.5 + uv.y*5.0)*stiff*3.0*uScale;
          transformed.y -= pow(stiff,1.4)*10.0*uScale;
          transformed.y += sin(uTime*2.0 + uv.x*5.0)*stiff*2.0*uScale;
        }`);
  };
  return mat;
}

/* ── Truppenzahl-Sprite (Billboard, immer zur Kamera gewandt) ──
   Höher aufgelöste Textur damit auch beim Heranzoomen scharf;
   schwarzer Hintergrundkreis mit dickem Akzentrand + Goldzahl.            */
function _makeTroopSprite(count, accentColor) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0,0,128,128);
  /* Äußerer Schattenring für Sichtbarkeit auf hellem Terrain */
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath(); ctx.arc(64,64,62,0,Math.PI*2); ctx.fill();
  /* Hintergrundkreis */
  ctx.fillStyle = 'rgba(8,6,4,.92)';
  ctx.beginPath(); ctx.arc(64,64,54,0,Math.PI*2); ctx.fill();
  /* Akzentrand */
  ctx.strokeStyle = accentColor || '#f6d98b';
  ctx.lineWidth = 6;
  ctx.stroke();
  /* Zahl */
  ctx.fillStyle = accentColor || '#f6d98b';
  ctx.font = `bold ${count >= 100 ? 42 : 56}px Georgia,serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur  = 4;
  ctx.fillText(String(count), 64, 66);
  ctx.shadowBlur  = 0;
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({map:tex, depthWrite:false, depthTest:true});
  const sprite = new THREE.Sprite(mat);
  sprite.userData.isTroopSprite = true;
  return sprite;
}

/* ═══════════════════════════════════════════════════════════════════════
   SPEZIALEINHEITEN — 3D-Modelle (Turm · Ritter · Katapult)
   Jedes Modell ist eine THREE.Group mit Fuß bei Y=0, sodass es wie das
   Banner direkt auf dem Terrain steht. Skalierung S=0.10 wie das Banner,
   aber deutlich kleiner als der 15.8-WU-Bannerpfahl.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── TURM — Verteidigungsbau (Verteidigungswürfel werden W8) ── */
function _createTowerModel(){
  const S = 0.10;
  const g = new THREE.Group();
  const H = 72*S, R = 17*S;

  /* Hauptkörper */
  const body = new THREE.Mesh(_GEO.tBody, _bStoneMat);
  body.position.y = H/2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  /* Steinlagen-Rillen */
  for(const yf of [0.32, 0.58, 0.82]){
    const ring = new THREE.Mesh(_GEO.tRing, _bStoneDark);
    ring.rotation.x = Math.PI/2;
    ring.position.y = H*yf;
    g.add(ring);
  }

  /* Auskragung (Wehrgang-Konsole) */
  const corbel = new THREE.Mesh(_GEO.tCorbel, _bStoneMat);
  corbel.position.y = H + 3*S;
  corbel.castShadow = true;
  g.add(corbel);

  /* Zinnenkranz (Merlons) */
  const merlons = 9;
  for(let i=0;i<merlons;i++){
    const a = (i/merlons)*Math.PI*2;
    const m = new THREE.Mesh(_GEO.tMerlon, _bStoneMat);
    m.position.set(Math.cos(a)*R*1.16, H+11*S, Math.sin(a)*R*1.16);
    m.rotation.y = -a;
    m.castShadow = true;
    g.add(m);
  }

  /* Spitzdach — VERGOLDET statt Holz: die Spezialeinheiten lesen sich als
     goldene Monumente und heben sich damit deutlich von den hausgetönten
     Truppenfiguren ab (keine Hausfarbe ist Gold). */
  const roof = new THREE.Mesh(_GEO.tRoof, _bGoldMat);
  roof.position.y = H + 18*S;
  roof.castShadow = true;
  g.add(roof);

  /* Kugel-Finial auf der Dachspitze + Bodenring */
  const finial = new THREE.Mesh(_GEO.sGoldTip, _bGoldMat);
  finial.position.y = H + 29*S;
  g.add(finial);
  g.add(_specialGoldRing(2.5));

  /* Tür */
  const door = new THREE.Mesh(_GEO.tDoor, _bStoneDark);
  door.position.set(0, 6.5*S, R*1.05);
  g.add(door);

  /* Fensterschlitze */
  for(const yf of [0.46, 0.7]){
    for(const af of [0.4, Math.PI*0.72, Math.PI*1.3]){
      const slit = new THREE.Mesh(_GEO.tSlit, _bStoneDark);
      slit.position.set(Math.sin(af)*R, H*yf, Math.cos(af)*R);
      slit.rotation.y = af;
      g.add(slit);
    }
  }

  g.userData.specialType = 'tower';
  g.visible = false;
  return g;
}

/* ── RITTER — Kampf-Einheit (höchster Würfel +1, bis max. 7) ── */
function _createKnightModel(){
  const S = 0.10;

  /* Echter Ritter (GuardedCastle-Modell) auf dem Steinsockel, falls die
     Geometrie schon geladen ist. Die Spezialeinheiten werden einmalig beim
     Banner-Aufbau erzeugt (Modelle laden beim Seitenstart, ein Spiel startet
     praktisch immer später) — sollte das Laden ausnahmsweise noch laufen,
     bleibt die Formen-Statue unten als Fallback. KOMPLETT VERGOLDET und
     GRÖSSER als ein Truppensoldat (~9.6 WE): die goldene Statue ist auf
     einen Blick von den hausgetönten Truppenfiguren unterscheidbar. */
  const mdl = _guardedFigure('knight', 0xc9ced8, 9.5);
  if(mdl){
    mdl.material = _bGoldMat;   // Gold-Statue statt Neutral-Tönung
    const gm = new THREE.Group();
    const mBase = new THREE.Mesh(_GEO.kBase, _bStoneMat);
    mBase.position.y = 1.75*S;
    mBase.scale.set(1.3, 1, 1.3);   // breiterer Sockel für die größere Statue
    mBase.receiveShadow = true;
    gm.add(mBase);
    mdl.position.y += 3.5*S;   // auf der Sockel-Oberkante stehen
    gm.add(mdl);
    gm.add(_specialGoldRing(2.2));   // Gold-Akzent (siehe _bGoldMat)
    gm.userData.specialType = 'knight';
    gm.visible = false;
    return gm;
  }

  const g = new THREE.Group();

  /* Steinsockel */
  const base = new THREE.Mesh(_GEO.kBase, _bStoneMat);
  base.position.y = 1.75*S;
  base.receiveShadow = true;
  g.add(base);

  /* Beine */
  for(const xf of [-1,1]){
    const leg = new THREE.Mesh(_GEO.kLeg, _bArmorDark);
    leg.position.set(xf*3.6*S, 12*S, 0);
    leg.castShadow = true;
    g.add(leg);
  }

  /* Torso — Brustpanzer (vergoldet wie die Modell-Statue oben) */
  const torso = new THREE.Mesh(_GEO.kTorso, _bGoldMat);
  torso.position.y = 31*S;
  torso.castShadow = true;
  g.add(torso);

  /* Schulterpanzer */
  for(const xf of [-1,1]){
    const sh = new THREE.Mesh(_GEO.kShoulder, _bGoldMat);
    sh.position.set(xf*7.6*S, 39*S, 0);
    sh.castShadow = true;
    g.add(sh);
  }

  /* Arme */
  for(const xf of [-1,1]){
    const arm = new THREE.Mesh(_GEO.kArm, _bArmorDark);
    arm.position.set(xf*8.4*S, 31*S, 0);
    g.add(arm);
  }

  /* Hals */
  const neck = new THREE.Mesh(_GEO.kNeck, _bArmorDark);
  neck.position.y = 43*S;
  g.add(neck);

  /* Helm — Topfhelm (vergoldet) */
  const helm = new THREE.Mesh(_GEO.kHelm, _bGoldMat);
  helm.position.y = 50*S;
  helm.castShadow = true;
  g.add(helm);
  const helmTop = new THREE.Mesh(_GEO.kHelmTop, _bGoldMat);
  helmTop.position.y = 55*S;
  g.add(helmTop);

  /* Sehschlitz */
  const visor = new THREE.Mesh(_GEO.kVisor, _bArmorDark);
  visor.position.set(0, 51*S, 4.4*S);
  g.add(visor);

  /* Helmbusch — gold statt rot (Truppenfiguren tragen nie Gold) */
  const crest = new THREE.Mesh(_GEO.kCrest, _bGoldMat);
  crest.position.y = 62*S;
  g.add(crest);

  /* Lanze — geneigte Untergruppe */
  const lanceGrp = new THREE.Group();
  const shaft = new THREE.Mesh(_GEO.kShaft, _bWoodLight);
  shaft.position.y = 39*S;
  shaft.castShadow = true;
  lanceGrp.add(shaft);
  const lanceTip = new THREE.Mesh(_GEO.kLanceTip, _bMetalMat);
  lanceTip.position.y = 82*S;
  lanceGrp.add(lanceTip);
  const grip = new THREE.Mesh(_GEO.kGrip, _bLeather);
  grip.rotation.x = Math.PI/2;
  grip.position.y = 30*S;
  lanceGrp.add(grip);
  lanceGrp.position.set(9.5*S, 0, 3*S);
  lanceGrp.rotation.z = 0.14;
  g.add(lanceGrp);

  /* Kite-Schild + Metallrand */
  const shield = new THREE.Mesh(_GEO.kShield, _bCrestMat);
  shield.position.set(-9*S, 32*S, 4*S);
  shield.rotation.y = -0.3;
  shield.castShadow = true;
  g.add(shield);
  const shieldRim = new THREE.Mesh(_GEO.kShield, _bMetalMat);
  shieldRim.scale.set(1.12, 1.12, 0.5);
  shieldRim.position.set(-9*S, 32*S, 3.4*S);
  shieldRim.rotation.y = -0.3;
  g.add(shieldRim);

  g.add(_specialGoldRing(2.2));   // Gold-Akzent (siehe _bGoldMat)

  g.userData.specialType = 'knight';
  g.visible = false;
  return g;
}

/* ── KATAPULT — Belagerungswerk (ein Angriffswürfel wird W8) ── */
function _createCatapultModel(){
  const S = 0.10;
  const g = new THREE.Group();

  /* Rahmen-Längsbalken */
  for(const zf of [-1,1]){
    const rail = new THREE.Mesh(_GEO.cRail, _bWoodLight);
    rail.position.set(0, 6*S, zf*9*S);
    rail.castShadow = true;
    g.add(rail);
  }
  /* Querbalken */
  for(const xf of [-1,1]){
    const cross = new THREE.Mesh(_GEO.cCross, _bWoodLight);
    cross.position.set(xf*17*S, 6*S, 0);
    g.add(cross);
  }

  /* Räder + Naben */
  for(const xf of [-1,1]){
    for(const zf of [-1,1]){
      const wheel = new THREE.Mesh(_GEO.cWheel, _bWoodMat);
      wheel.rotation.x = Math.PI/2;
      wheel.position.set(xf*15*S, 6*S, zf*11*S);
      wheel.castShadow = true;
      g.add(wheel);
      const hub = new THREE.Mesh(_GEO.cHub, _bGoldMat);   // vergoldete Naben
      hub.rotation.x = Math.PI/2;
      hub.position.set(xf*15*S, 6*S, zf*11*S);
      g.add(hub);
    }
  }

  /* A-Rahmen — schräge Stützpfosten */
  for(const xf of [-1,1]){
    const post = new THREE.Mesh(_GEO.cPost, _bWoodLight);
    post.position.set(xf*9*S, 24*S, 0);
    post.rotation.z = xf*0.42;
    post.castShadow = true;
    g.add(post);
  }
  /* Achs-Querbalken (Drehlager) */
  const axle = new THREE.Mesh(_GEO.cAxle, _bMetalMat);
  axle.rotation.x = Math.PI/2;
  axle.position.set(0, 38*S, 0);
  g.add(axle);

  /* Wurfarm — nach hinten gespannte Untergruppe. Arm, Becher und Gegengewicht
     VERGOLDET (siehe _bGoldMat): der hoch aufragende Arm ist auch aus der
     Vogelperspektive das auffälligste Teil — so bleibt das Spezial-Katapult
     klar von den hausgetönten Tier-10-Kriegsmaschinen unterscheidbar. */
  const armGrp = new THREE.Group();
  const arm = new THREE.Mesh(_GEO.cArm, _bGoldMat);
  arm.position.y = 21*S;
  arm.castShadow = true;
  armGrp.add(arm);
  const cup = new THREE.Mesh(_GEO.cCup, _bGoldMat);
  cup.position.y = 46*S;
  armGrp.add(cup);
  const stone = new THREE.Mesh(_GEO.cStone, _bStoneDark);
  stone.position.y = 47*S;
  armGrp.add(stone);
  const weight = new THREE.Mesh(_GEO.cWeight, _bGoldMat);
  weight.position.y = -3*S;
  armGrp.add(weight);
  armGrp.position.set(0, 38*S, 0);
  armGrp.rotation.x = 0.95;
  g.add(armGrp);

  /* Anschlag-Querbalken */
  const stopper = new THREE.Mesh(_GEO.cStopper, _bWoodLight);
  stopper.rotation.x = Math.PI/2;
  stopper.position.set(13*S, 30*S, 0);
  g.add(stopper);

  g.add(_specialGoldRing(2.8));   // Gold-Akzent (siehe _bGoldMat)

  g.userData.specialType = 'catapult';
  g.visible = false;
  return g;
}

/* ── Territory-Banner-Gruppe erstellen ──
   Der Banner ist der Einheitenmarker: niedriger gesetzt, Truppenzahl direkt
   auf dem Tuch. Aufbau (lokale Koordinaten, Pfahl-Fuß bei Y=0):

     Y=PH+14*S  ──  Speerspitze        ┐ FESTE Teile — drehen sich NICHT
     Y=PH       ──  Pfahlende          │ (Pfahl, Manschetten, Spitze,
     Pfahl + Metallmanschetten         ┘  Spezialeinheiten)
     Y=BH       ──  Querholz/Latte      ┐ SCHWENK-Gruppe — dreht sich pro
     Tuch + Lederbänder + Latten-Spitzen┘ Frame um die Pfahl-Achse zur Kamera
     Y=0        ──  Pfahl-Fuß auf Terrain                                   */
function _createTerritoryBanner(facKey) {
  const S  = 0.10;   // Skalierungsfaktor
  const PH = 122*S;  // Pfahlhöhe  = 12.2 WU (niedriger — Banner ist Marker)
  const BH = 104*S;  // Querholz-Y = 10.4 WU
  const g  = new THREE.Group();

  /* ═══ FESTE Teile — drehen sich nicht mit der Kamera ═══ */

  /* Holzpfahl — Basis bei Y=0, Spitze bei Y=PH */
  const pole = new THREE.Mesh(_GEO.bPole, _bWoodMat);
  pole.position.y = PH/2;
  pole.castShadow = true;
  g.add(pole);

  /* Metallmanschetten */
  for(const yf of [0.22,0.5,0.82]){
    const ring = new THREE.Mesh(_GEO.bRing, _bRingMat);
    ring.rotation.x = Math.PI/2;
    ring.position.y = PH*yf;
    g.add(ring);
  }

  /* Speerspitze oben */
  const tip = new THREE.Mesh(_GEO.bTip, _bMetalMat);
  tip.position.y = PH + 14*S;
  tip.castShadow = true;
  g.add(tip);

  /* ═══ SCHWENK-Gruppe — Latte + Tuch, dreht sich zur Kamera ═══
     Ursprung auf der Pfahl-Achse (0,0,0), Rotation pro Frame nur um Y.
     Dadurch schwenkt nur die Latte um den Pfahl — der Pfahl bleibt fest.   */
  const swivel = new THREE.Group();
  g.add(swivel);

  /* Querholz (Latte) — Geometrie vorgebacken in _GEO.bBeam */
  const beam = new THREE.Mesh(_GEO.bBeam, _bWoodMat);
  beam.position.set(0, BH, 0);
  beam.castShadow = true;
  swivel.add(beam);

  /* Metallspitzen an den Latten-Enden */
  const f1 = new THREE.Mesh(_GEO.bFin, _bMetalMat);
  f1.position.set(-66*S, BH, 0); f1.rotation.z = Math.PI/2; swivel.add(f1);
  const f2 = new THREE.Mesh(_GEO.bFin, _bMetalMat);
  f2.position.set(66*S, BH, 0);  f2.rotation.z = -Math.PI/2; swivel.add(f2);

  /* ─── Banner-Tuch mit integrierter Truppenzahl ───────────────────────────
     Geometrie geteilt (_GEO.bCloth), Material pro Banner (Fraktionstextur +
     Truppenzahl). Tuch bei z=7*S — klar vor dem Pfahl. Der Wind-Shader
     verformt nur GPU-Vertices, mutiert die geteilte Geometrie nicht.        */
  const clothMat = _makeBannerMat(_makeBannerTex(facKey, null));  // Truppenzahl steht auf dem Badge, nicht auf dem Tuch
  const cloth = new THREE.Mesh(_GEO.bCloth, clothMat);
  cloth.position.set(0, BH, 7*S);
  cloth.castShadow = true; cloth.receiveShadow = true;
  cloth.customDepthMaterial = _makeBannerDepthMat(clothMat.uniforms);
  cloth.userData.isBannerCloth = true;
  cloth.renderOrder = 850;   // Tiefentest bleibt an; die (transparenten) Territoriumsnamen liegen bewusst darüber (1001)
  swivel.add(cloth);

  /* Lederbänder/Ringe — sichtbare Verbindung Latte ↔ Tuch */
  for(const xf of [-0.5,-0.16,0.16,0.5]){
    const strap = new THREE.Mesh(_GEO.bStrap, _bLeather);
    strap.position.set(64*S*xf, BH - 8*S, 6*S); swivel.add(strap);
    const loop = new THREE.Mesh(_GEO.bLoop, _bRingMat);
    loop.rotation.x = Math.PI/2;
    loop.position.set(64*S*xf, BH, 6*S); swivel.add(loop);
  }

  /* ─── Spezialeinheiten-Modelle ──────────────────────────────────────────
     FESTE Teile (drehen nicht mit). Um den Pfahl herum platziert, anfangs
     unsichtbar. map3d_updateBanners schaltet sie je nach Gebietsdaten ein.  */
  const _spec = [
    { make:_createTowerModel,    pos:[-9.5, 0, -5.5] },
    { make:_createCatapultModel, pos:[ 0.0, 0, -9.5] },
    { make:_createKnightModel,   pos:[ 9.5, 0, -5.5] },
  ];
  const specials = {};
  _spec.forEach(sp => {
    const m = sp.make();
    m.position.set(sp.pos[0], sp.pos[1], sp.pos[2]);
    m.userData.slotOffset = { x: sp.pos[0], z: sp.pos[2] };
    g.add(m);
    specials[m.userData.specialType] = m;
  });

  /* ─── Truppen-Badge (Vordergrund-Pip) ────────────────────────────────────
     Die Truppenzahl liegt auf einem eigenen Sprite mit depthTest:false und
     renderOrder 1002 — also ÜBER den Territoriumsnamen (1001) und dem Tuch
     (850). So bleibt die Zahl als Einziges immer obenauf und verschwindet
     nicht mehr halbtransparent hinter den Namen. Sitzt mittig auf der
     Tuch-Scheibe (Textur-Mitte y≈288/454 → lokal Y≈BH-4.95) und wächst als
     Kind der Schwenk-Gruppe mit der (truppenzahl-getriebenen) Bannergröße.  */
  const badge = _makeTroopBadge(facKey, 1);
  badge.position.set(0, BH - 4.95, 7*S + 0.15);
  badge.scale.set(3.6, 3.6, 1);
  swivel.add(badge);
  g.userData.troopBadge = badge;

  /* Figuren-Marker-Gruppe (alternativer Marker). Leer angelegt, wird im
     Figurenmodus von _rebuildTroopFigures befüllt. */
  const figuresGroup = new THREE.Group();
  figuresGroup.visible = false;
  g.add(figuresGroup);
  g.userData.figuresGroup = figuresGroup;
  figuresGroup.userData.ownerBanner = g;   // Rückverweis: Kampfhaltung (banner.userData.combatStance) übersteht Figuren-Rebuilds

  /* Blasen-Gruppe (schwebende Plattform für zu große Armeen auf zu kleinem
     Gebiet) — ebenfalls leer angelegt, von _rebuildTroopFigures befüllt. */
  const bubbleGroup = new THREE.Group();
  bubbleGroup.visible = false;
  g.add(bubbleGroup);
  g.userData.bubbleGroup = bubbleGroup;
  bubbleGroup.userData.ownerBanner = g;   // Rückverweis wie bei figuresGroup (Kampfhaltung auch für Blasen-Armeen)

  /* Banner-Eigenteile (Pfahl/Manschetten/Spitze/Schwenk-Tuch) — alles außer
     Spezialeinheiten, Figuren- und Blasen-Gruppe. Wird im Figurenmodus versteckt. */
  g.userData.bannerParts = g.children.filter(c =>
    c !== figuresGroup && c !== bubbleGroup && !(c.userData && c.userData.specialType));

  g.userData.specials = specials;   // { tower, knight, catapult }
  g.userData.swivel   = swivel;     // Schwenk-Gruppe (Kamera-Ausrichtung)
  g.userData.cloth    = cloth;      // direkter Tuch-Ref (Textur-Update)
  g.userData.facKey   = facKey;
  g.userData.troops   = 1;
  g.userData.sizeFactor = 1;        // Banner-Größe skaliert mit Truppenzahl
  return g;
}

/* ── Helferfunktion: Terrain-Höhe am Centroid ─────────────────────────────
   Gibt die Y-Koordinate der Oberfläche des Territorial-Meshes an Position
   (cx, cz) zurück. Wir schießen einen Strahl von oben nach unten und nehmen
   den ersten Treffer. Damit landet der Pfahl-Fuß auf dem tatsächlichen Gelände
   und nicht schwebend über einem Bergpeak.                                   */
const _terrainRay = new THREE.Raycaster();
const _terrainDir = new THREE.Vector3(0,-1,0);
function _getTerrainY(cx, cz, meshes) {
  _terrainRay.set(new THREE.Vector3(cx, 200, cz), _terrainDir);
  const hits = _terrainRay.intersectObjects(meshes, false);
  if(hits.length) return hits[0].point.y;
  // Fallback: bounding-box top
  const bbox = new THREE.Box3();
  meshes.forEach(m => bbox.expandByObject(m));
  return bbox.max.y;
}

/* ── Banner-Map und Initialisierung ── */
const _tBanners = new Map();
window._tBanners = _tBanners;   // für TDZ-sicheren Zugriff aus render()
let _bannersBuilt = false;

window.map3d_initBanners = function() {
  if(_bannersBuilt) return;
  _bannersBuilt = true;

  /* Ein Banner pro logischem Territorium (nicht pro Stück). Es wird auf dem
     GRÖSSTEN Teilstück platziert, damit es nicht in der See zwischen
     verstreuten Stücken landet. */
  LOGICAL_TERRITORIES.forEach(lt => {
    let bestMeshes = null, bestArea = -1;
    lt.pieceIds.forEach(id => {
      const ms = _meshById ? (_meshById.get(id) || []) : [];
      if(!ms.length) return;
      const bb = new THREE.Box3();
      ms.forEach(m => bb.expandByObject(m));
      const area = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
      if(area > bestArea){ bestArea = area; bestMeshes = ms; }
    });
    if(!bestMeshes) return;

    const bbox = new THREE.Box3();
    bestMeshes.forEach(m => bbox.expandByObject(m));
    const cx = (bbox.min.x + bbox.max.x) / 2;
    const cz = (bbox.min.z + bbox.max.z) / 2;

    /* Echte Terrain-Höhe per Raycast — kein schwebendes Banner */
    const groundY = _getTerrainY(cx, cz, bestMeshes);

    /* Wie groß darf das Banner höchstens werden, ohne über das Territorium
       hinauszuragen? Aus der halben (kleineren) Ausdehnung des Gebiets abgeleitet.
       ~4.4 WE ist die halbe Tuchbreite bei Skalierung 1; /5 lässt etwas Rand. */
    const terrR = Math.min(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) / 2;
    const maxSizeFactor = Math.max(1, Math.min(1.9, terrR / 5));

    const banner = _createTerritoryBanner('neutral');
    banner.position.set(cx, groundY, cz);
    banner.userData.maxSizeFactor = maxSizeFactor;
    /* Für die Truppen-Figuren gemerkt: wie viel Platz das Gebiet überhaupt
       hergibt (halbe kleinere Ausdehnung) — begrenzt später die Aufstellung,
       damit die Figuren nicht über den Territoriumsrand hinausragen. */
    banner.userData.terrRadius = terrR;
    banner.visible = false;
    /* Basis-Höhe merken — beim Auswählen wird das Banner um genau den
       Lift-Betrag des Territoriums angehoben, damit es auf dem
       angehobenen Land "kleben" bleibt. */
    banner.userData.baseY    = groundY;
    banner.userData.selected = false;
    banner.userData.selCur   = 0;   // aktueller Auswahl-Fortschritt 0..1 (gelerpt)

    /* Spezialeinheiten-Modelle auf ihre jeweilige Terrain-Höhe absenken/heben.
       Ziel-Weltoffset merken, damit sie beim Banner-Wachstum konstant bleiben
       (per Gegen-Skalierung im Render-Loop) und nicht über die Küste ragen. */
    if(banner.userData.specials){
      Object.values(banner.userData.specials).forEach(model => {
        const off = model.userData.slotOffset;
        if(!off) return;
        const slotY = _getTerrainY(cx + off.x, cz + off.z, bestMeshes);
        model.position.y = slotY - groundY;
        model.userData.baseOffset = { x: off.x, y: model.position.y, z: off.z };
      });
    }

    _bannerRoot.add(banner);   // hoher groupOrder → Banner + Zahl stets vor den Namen
    _tBanners.set(lt.key, banner);
  });
  console.log('[banners] Placed', _tBanners.size, 'territory banners');
};

/* ── Banner updaten: Sichtbarkeit + Fraktion + Truppenzahl + Spezialeinheiten.
   Die Truppenzahl steht jetzt auf dem Tuch — bei Änderung von Fraktion ODER
   Truppenzahl wird die Tuch-Textur neu gezeichnet (nur die uTexture-Uniform
   wird getauscht, das ShaderMaterial bleibt bestehen).
   ownerMap: { id: { facKey, troops, accent, knight, tower, siege } | null } */
window.map3d_updateBanners = function(ownerMap) {
  _tBanners.forEach((banner, id) => {
    const info = ownerMap[id];

    /* Naval: das Rahsegel IST das Banner — Textur mit Hausfarbe, Wappen,
       Truppenzahl und Spezial-Chips neu zeichnen. Läuft auch für unbesetzte
       Schiffe (troops==null → schlichtes Segeltuch), daher vor dem Early-Return.
       Signatur-Vergleich verhindert unnötiges Neuzeichnen jede Runde. */
    if(IS_NAVAL && window._navalSails){
      const sailMat = window._navalSails.get(id);
      if(sailMat){
        const facKey   = info ? info.facKey : 'neutral';
        const troops   = info ? info.troops : null;
        const specials = info ? {knight:!!info.knight, tower:!!info.tower, siege:!!info.siege} : null;
        const sig = facKey + '|' + (troops==null?'-':troops) + '|' +
          (info&&info.knight?'k':'') + (info&&info.tower?'t':'') + (info&&info.siege?'s':'');
        if(sailMat.userData._sailSig !== sig){
          sailMat.userData._sailSig = sig;
          const tex = _makeSailTex(facKey, troops, specials);
          if(sailMat.uniforms && sailMat.uniforms.uTexture){   // Wind-Shader-Segel
            if(sailMat.uniforms.uTexture.value) sailMat.uniforms.uTexture.value.dispose();
            sailMat.uniforms.uTexture.value = tex;
          } else {                                             // Fallback (Standardmaterial)
            if(sailMat.map) sailMat.map.dispose();
            sailMat.map = tex; sailMat.needsUpdate = true;
          }
        }
      }
    }
    /* Naval: Schiffsrumpf in der Besitzerfarbe tönen (neutral → Holz). */
    if(IS_NAVAL && window._navalHulls){
      const hulls = window._navalHulls.get(id);
      if(hulls){
        if(info){
          const hhex = (FACTION_BANNER_CFG[info.facKey] || FACTION_BANNER_CFG.neutral).color;
          const hc = parseInt(hhex.replace('#',''), 16);
          if(hulls[0]) hulls[0].color.setHex(hc).multiplyScalar(0.50);  // Rumpf: dunkle Besitzerfarbe
          if(hulls[1]) hulls[1].color.setHex(hc).multiplyScalar(0.78);  // Bug/Heck/Aufbau: heller
        }else{
          if(hulls[0]) hulls[0].color.setHex(0x33210f);  // neutral: Holz dunkel
          if(hulls[1]) hulls[1].color.setHex(0x5b3b20);  // neutral: Holz hell
        }
      }
    }

    /* Naval: kein schwebendes Banner-Tuch — die Info steht auf dem Segel,
       die Auswahl-Hervorhebung übernimmt der Rumpf-Glow. */
    if(IS_NAVAL){ banner.visible = false; return; }

    if(!info){ banner.visible = false; return; }

    banner.visible = true;

    /* Marker-Modus: Figuren nur auf Land-Karten; sonst immer Banner. */
    const landFigures = (FIGURE_THEME === 'land');
    const figMode = landFigures && (window.WB_MARKER_MODE === 'figures');

    /* Banner-Eigenteile (Pfahl/Tuch/Pip) vs. Figuren ein-/ausblenden. Die
       Spezialeinheiten hängen separat davon und bleiben in beiden Modi an. */
    const parts = banner.userData.bannerParts;
    if(parts){ for(const c of parts) c.visible = !figMode; }
    const fg = banner.userData.figuresGroup;
    if(fg) fg.visible = figMode;
    // Blase nur im Figurenmodus relevant — _rebuildTroopFigures schaltet sie
    // dort ggf. wieder an. Im Banner-Modus sonst nie ausblenden lassen: sie
    // würde sonst neben dem Banner-Tuch weiterschweben.
    const bg = banner.userData.bubbleGroup;
    if(bg && !figMode) bg.visible = false;

    const specSig = (info.knight?'k':'')+(info.tower?'t':'')+(info.siege?'s':'');
    banner.userData.facKey  = info.facKey;
    banner.userData.troops  = info.troops;
    banner.userData.specSig = specSig;

    /* Spezialeinheiten-Modelle ein-/ausblenden — VOR dem Figuren-Rebuild,
       damit die Truppen-Aufstellung ihre Freihaltezonen kennt (sichtbare
       Spezials sind Hindernisse, siehe _layoutFigures). */
    const spModels = banner.userData.specials;
    if(spModels){
      if(spModels.tower)    spModels.tower.visible    = !!info.tower;
      if(spModels.knight)   spModels.knight.visible   = !!info.knight;
      if(spModels.catapult) spModels.catapult.visible = !!info.siege;
    }

    if(figMode){
      /* Figuren-Marker: konstante Größe (die ANZAHL kodiert die Stärke, nicht
         die Größe). Aufbau signatur-gesichert → nur bei echter Änderung. */
      banner.userData.sizeFactor = 1;
      try{ _rebuildTroopFigures(banner, info.facKey, info.troops); }
      catch(e){ console.warn('[figures] rebuild skip', e); }
    } else {
      /* Banner-Marker: das Tuch trägt Wappen + Spezial-Chips (die Truppenzahl
         liegt auf dem Vordergrund-Badge), die Bannergröße wächst leicht mit der
         Truppenzahl.
         EIGENE Tuch-Signatur statt geteilter Änderungs-Flags: im Figurenmodus
         wird userData weitergepflegt, ohne dass das Tuch gezeichnet wird —
         mit Flags blieb es nach dem Umschalten Figuren→Banner leer/veraltet
         (graues Neutral-Tuch). */
      banner.userData.sizeFactor = Math.min(_troopSizeFactor(info.troops),
                                            banner.userData.maxSizeFactor || 1.9);
      /* Tuch nur bei Fraktions- ODER Spezialeinheiten-Änderung neu zeichnen —
         die Truppenzahl steht jetzt auf dem separaten Badge, NICHT mehr auf
         dem Tuch (daher fällt info.troops aus der Signatur). */
      const clothSig = info.facKey + '|' + specSig;
      if(banner.userData._clothSig !== clothSig){
        const cloth = banner.userData.cloth;
        if(cloth && cloth.material.uniforms){
          const oldTex = cloth.material.uniforms.uTexture.value;
          cloth.material.uniforms.uTexture.value =
            _makeBannerTex(info.facKey, null,
              { knight:!!info.knight, tower:!!info.tower, siege:!!info.siege });
          if(oldTex) oldTex.dispose();
          banner.userData._clothSig = clothSig;
        }
      }
      /* Truppen-Badge (Vordergrund) bei Fraktions-/Truppenzahl-Änderung neu
         texturieren — bleibt immer über den Territoriumsnamen sichtbar. */
      const badge = banner.userData.troopBadge;
      if(badge){
        const badgeSig = info.facKey + '|' + info.troops;
        if(banner.userData._badgeSig !== badgeSig){
          const oldB = badge.material.map;
          badge.material.map = _makeTroopBadgeTex(info.facKey, info.troops);
          badge.material.needsUpdate = true;
          if(oldB) oldB.dispose();
          banner.userData._badgeSig = badgeSig;
        }
      }
    }
  });
};


/* ══════════════════════════════════════════════════════════════════════════
   TRUPPEN-FIGUREN — Alternativer Marker: Miniatur-Figuren (statt Banner+Zahl)
   ──────────────────────────────────────────────────────────────────────────
   Statt eines Tuchs mit aufgemalter Truppenzahl steht auf jedem Territorium
   ein kleines Heer aus 3D-Figuren. Die Truppenzahl wird in Stufen zerlegt —
   1 / 5 / 10 — und pro Stufe eine eigene Figur gestellt (wie Infanterie /
   Kavallerie / Kriegsmaschine):

       1  → Fußsoldat
       5  → berittener Krieger        10 → Kriegsmaschine

   (Die frühere 3er-Stufe „Trupp aus drei Fußsoldaten" ist entfernt — eine 3
    erscheint jetzt als drei einzelne Fußsoldaten, siehe _decomposeTroops.)

   JEDES HAUS hat eigene Formen: Helm, Waffe, Schild, Reittier und Kriegs-
   maschine unterscheiden sich (z.B. Kael = Untote mit Skelettpferd & Knochen-
   katapult, Sylverin = Waldläufer mit Bogen & Hirsch, Aerlund = Belagerungs-
   turm …). Gesteuert über _FIG_KIT[haus].

   PRO KARTE unterschiedlich: __WB_MAP.figures ('land' | 'naval' | …) wählt das
   Set; Standard = Land, See-Karten (IS_NAVAL) bleiben beim Schiff-/Segel-
   Display (dort IST das Schiff der Marker). Neue Karten können ein eigenes Set
   in ihrer map.js setzen.

   Umschaltbar über die Option "Truppenmarker: Figuren" (window.WB_MARKER_MODE).
   Die Figuren sind Kinder der Banner-Gruppe (erben Position, Terrain-Höhe und
   Auswahl-Anhebung); im Figurenmodus werden die Banner-Eigenteile (Pfahl/Tuch/
   Pip) ausgeblendet. Die Spezialeinheiten (Turm/Ritter/Katapult) sind davon
   unabhängig und in BEIDEN Modi sichtbar.
   ══════════════════════════════════════════════════════════════════════════ */

/* Aktueller Marker-Modus — aus den gespeicherten Optionen vorbelegt. */
window.WB_MARKER_MODE = (function(){
  try { return getOptions().troopFigures === true ? 'figures' : 'banner'; }
  catch(e){ return 'banner'; }
})();

/* Figuren-Thema der aktiven Karte. Land baut Land-Figuren; alles andere
   (z.B. 'naval') überlässt die Darstellung dem kartenspezifischen System. */
const FIGURE_THEME = (typeof __WB_MAP !== 'undefined' && __WB_MAP && __WB_MAP.figures)
  || (IS_NAVAL ? 'naval' : 'land');

/* Deterministischer 0..1-Hash je Schlüssel (eigener, da _hash lokal ist). */
function _figHash(s){ s=String(s); let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return ((h>>>0)%100000)/100000; }

/* ── Haus-Kits: Farben + Stil-Bausteine (Helm/Waffe/Schild/Reittier/Maschine) ── */
const _FIG_KIT = {
  valen:    {primary:0x7b1e17, cloth:0xa02a20, metal:0x9fa6ad, accent:0xd4a84f, helm:'plume',  weapon:'spear',     shield:'scutum', mount:'horse',    engine:'ballista',     undead:false},
  mordrek:  {primary:0x8a5f1a, cloth:0xc08a2a, metal:0xbfae7a, accent:0xead9a0, helm:'crown',  weapon:'halberd',   shield:'heater', mount:'barded',   engine:'trebuchet',    undead:false},
  dravik:   {primary:0x3a3832, cloth:0x55524a, metal:0x9aa3ad, accent:0xbfb4a2, helm:'great',  weapon:'greatsword',shield:'none',   mount:'heavy',    engine:'ram',          undead:false},
  aerlund:  {primary:0x143554, cloth:0x1d4a74, metal:0xaeb9c4, accent:0xcfd8df, helm:'kettle', weapon:'crossbow',  shield:'tower',  mount:'horse',    engine:'siegetower',   undead:false},
  sylverin: {primary:0x0f5c52, cloth:0x1c7a6a, metal:0x9aa3ad, accent:0xd8ded4, helm:'hood',   weapon:'bow',       shield:'none',   mount:'stag',     engine:'woodballista', undead:false},
  kael:     {primary:0xcabfa0, cloth:0x4b2a58, metal:0x8a8272, accent:0xd0c4b0, helm:'skull',  weapon:'scythe',    shield:'none',   mount:'skeleton', engine:'bonecatapult', undead:true},
  vorthan:  {primary:0xbf5a18, cloth:0xd47a2a, metal:0xc9b487, accent:0xf0c45b, helm:'turban', weapon:'scimitar',  shield:'round',  mount:'horse',    engine:'flamecatapult',undead:false},
  neutral:  {primary:0x555560, cloth:0x44444e, metal:0x8a8a94, accent:0x9aa0aa, helm:'kettle', weapon:'spear',     shield:'heater', mount:'horse',    engine:'ram',          undead:false}
};

/* Endskalierung der Figuren. Historie: 0.19 → 0.16 → 0.09 → 0.022 — diese
   Verkleinerungen liefen aber ins Leere, weil _layoutFigures die Skalierung
   damals per scale.setScalar ÜBERSCHRIEB: sichtbar war stets NUR figScale
   (≈0.75-1.0), egal was _FSC vorgab. Seit dem multiplyScalar-Fix greift _FSC
   tatsächlich — mit 0.022 waren die Figuren dann mikroskopisch (~0.27 WE)
   und praktisch unsichtbar. FESTLEGUNG: die damals sichtbare (und für gut
   befundene) Größe beibehalten → _FSC = 1.0 reproduziert sie exakt.
   Soldat ≈ 9-12 WE bei freiem Feld; bei großen Armeen bzw. engen Gebieten
   skaliert _layoutFigures Formation UND Figuren gemeinsam herunter
   (Fit-Faktor u aus den Fußabdrücken _FIG_FOOT — verhindert das frühere
   "Einheiten stehen ineinander"). */
const _FSC = 0.8;   // Grundmaßstab aller Einheitenfiguren

/* Relative Größen je Einheitentyp:
   Fußsoldaten deutlicher verkleinert, Berittene nur leicht (Reiter+Ross
   wirken sonst zu wuchtig neben den Soldaten), Maschinen dafür größer.
   Multipliziert sich mit _FSC in den Tier-Buildern — Formations-Fußabdrücke
   (_FIG_FOOT) sind entsprechend mitgepflegt. */
const _SOLDIER_SC = 0.8;
const _CAV_SC     = 0.9;
/* Vergrößerung NUR des Reittiers (Pferdekörper) relativ zum Reiter — sonst
   wirkt das Pferd zu klein/zierlich unter dem Ritter. Skaliert den ganzen
   Pferdekörper (Rumpf/Beine/Hals/Kopf/Schweif) einheitlich; der Reiter bleibt
   unverändert (Fußsoldaten-Größe), dadurch stimmt das Verhältnis. */
const _MOUNT_SC   = 1.6;

/* Zusätzlicher Schrumpf-Faktor NUR für den stehenden Körper (nicht den
   Sockel) — eine reine _FSC-Verkleinerung war beim Körper kaum wahrnehmbar
   (schlanke, hohe Silhouette schrumpft optisch weniger auffällig als eine
   breite, flache Sockel-Scheibe), während der direkt verkleinerte Sockel
   deutlich sichtbar war. Gleicher Größenordnung wie die Sockel-Verkleinerung
   angeglichen, damit beide zusammen spürbar kleiner wirken. */
const _BODY_EXTRA = 0.45;

/* Geteilte Einheits-Geometrien. Höhere Segmentzahlen → deutlich rundere,
   „natürlichere" Figuren (dank Merge zu 1 Mesh kostet das kaum Performance).
   taper = konischer Zylinder (oben schmaler) für Tunika/Gliedmaßen. */
const _FG = {
  box:   new THREE.BoxGeometry(1,1,1),
  cyl:   new THREE.CylinderGeometry(1,1,1,18),
  sph:   new THREE.SphereGeometry(1,18,14),
  cone:  new THREE.ConeGeometry(1,1,18),
  taper: new THREE.CylinderGeometry(0.55,1,1,18)
};
const _figMatCache = new Map();
function _fmat(hex, opt){
  opt = opt || {};
  const rough = opt.rough==null ? 0.8 : opt.rough;
  const metal = opt.metal || 0;
  const key = hex+'|'+metal+'|'+rough+'|'+(opt.emis||0);
  let m = _figMatCache.get(key);
  if(!m){
    m = new THREE.MeshStandardMaterial({ color:hex, metalness:metal, roughness:rough });
    if(opt.emis){ m.emissive = new THREE.Color(opt.emis); m.emissiveIntensity = opt.emisI||1; }
    _figMatCache.set(key, m);
  }
  return m;
}

/* ── Einfarbige Haus-Miniatur (à la "Game of Thrones"-Risiko) ──
   EIN Material pro Haus für die GANZE Figur — kein Bemalen einzelner Teile
   (Helm/Waffe/Stoff bleiben alle in kit.primary). Das Detail kommt rein aus
   der Skulptur/Silhouette, nicht aus Farbkontrast — wie bei den unbemalten
   Spritzguss-Minis des Referenzspiels. _mergeGroup bäckt ohnehin nur EIN
   gemeinsames Material für die fertige Figur ein, daher genügt hier ein
   einziges gecachtes Material pro Haus. */
function _km(kit){
  let m = _figMatCache.get('mono|'+kit.primary);
  if(!m){ m = new THREE.MeshStandardMaterial({ color:kit.primary, roughness:.46, metalness:.14 }); _figMatCache.set('mono|'+kit.primary, m); }
  return m;
}
/* Leichtes Eigenglühen in Hausfarbe (z.B. Feuer-Katapult-Geschoss) — kein
   Fremdton, nur ein "innerer Schimmer" derselben Farbe. */
function _kmGlow(kit){
  let m = _figMatCache.get('glow|'+kit.primary);
  if(!m){ m = new THREE.MeshStandardMaterial({ color:kit.primary, roughness:.4, metalness:.1, emissive:new THREE.Color(kit.primary), emissiveIntensity:.55 }); _figMatCache.set('glow|'+kit.primary, m); }
  return m;
}
/* Teil hinzufügen: Position / Skalierung / (optional) Rotation-Euler.
   WICHTIG: Einzelteile werfen KEINEN Schatten — die fertige Figur wird zu genau
   EINEM Mesh zusammengeführt (_mergeGroup) und wirft als Ganzes Schatten. So
   bleibt die Zahl der Schatten-Caster/Draw-Calls klein (Performance). */
function _P(group, geo, mat, pos, scl, rot){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scl[0], scl[1], scl[2]);
  if(rot) m.rotation.set(rot[0]||0, rot[1]||0, rot[2]||0);
  m.castShadow = false;
  group.add(m);
  return m;
}

/* Geteiltes Material für zusammengeführte Figuren (Vertex-Farben). Ein einziges
   Material für ALLE Figuren → optimales Batching. */
let _figMergedMatCache = null;
function _figMergedMat(){
  if(!_figMergedMatCache){
    _figMergedMatCache = new THREE.MeshStandardMaterial({ vertexColors:true, metalness:0.14, roughness:0.42 });
  }
  return _figMergedMatCache;
}

/* Eine gebaute Figur (Gruppe aus vielen kleinen Meshes) in EIN Mesh mit
   Vertex-Farben zusammenführen. Reduziert Draw-Calls und Schatten-Caster um
   ~15× — entscheidend, weil eine Karte bis zu ~100 Territorien × mehrere
   Figuren hat. Fällt bei Problemen auf die Ursprungs-Gruppe zurück (dann ohne
   Schatten, aber weiterhin funktionsfähig). */
function _mergeGroup(group){
  try{
    if(!THREE.BufferGeometryUtils || !THREE.BufferGeometryUtils.mergeBufferGeometries) return group;
    group.updateMatrixWorld(true);
    const geos = [];
    group.traverse(o => {
      if(!o.isMesh || !o.geometry) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if(g.deleteAttribute){ g.deleteAttribute('uv'); g.deleteAttribute('uv2'); }
      const c = (o.material && o.material.color) ? o.material.color : null;
      const cr = c ? c.r : 1, cg = c ? c.g : 1, cb = c ? c.b : 1;
      const cnt = g.attributes.position.count;
      const arr = new Float32Array(cnt*3);
      for(let i=0;i<cnt;i++){ arr[3*i]=cr; arr[3*i+1]=cg; arr[3*i+2]=cb; }
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
      geos.push(g);
    });
    if(!geos.length) return group;
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false);
    geos.forEach(g => g.dispose && g.dispose());
    if(!merged) return group;
    const mesh = new THREE.Mesh(merged, _figMergedMat());
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const out = new THREE.Group();
    out.add(mesh);
    return out;
  }catch(e){
    console.warn('[figures] merge failed, using unmerged group', e);
    return group;
  }
}

/* ── Helm/Waffe/Schild — hausabhängige Silhouetten ── */
function _figHelm(g, kit){
  const y = 22.5;
  const m = _km(kit);
  switch(kit.helm){
    case 'plume':
      _P(g,_FG.sph, m,[0,y,0],[2.9,2.4,2.9]);
      _P(g,_FG.cone, m,[0,y+2.2,0],[1.4,2.6,1.4]);      // Helmspitze
      _P(g,_FG.box, m,[0,y+3.2,0],[0.7,3.0,5.6]); break; // Federbusch/Kamm
    case 'crown':
      _P(g,_FG.cyl, m,[0,y,0],[2.9,1.9,2.9]);
      for(let i=0;i<6;i++){ const a=i/6*Math.PI*2; _P(g,_FG.cone, m,[Math.cos(a)*2.6,y+2.4,Math.sin(a)*2.6],[0.6,2.4,0.6]); } break;
    case 'great':
      // Gerundeter Kübelhelm mit Spitze (kein Würfel)
      _P(g,_FG.cyl, m,[0,y-0.2,0.1],[2.7,3.6,2.9]);      // runder Helmtopf
      _P(g,_FG.sph, m,[0,y+1.7,0.1],[2.7,1.8,2.9]);      // gewölbte Oberseite
      _P(g,_FG.cone, m,[0,y+3.6,0.1],[1.5,3.0,1.5]);     // Spitze
      _P(g,_FG.box, m,[0,y+0.2,2.7],[2.8,0.5,0.5]); break; // Sehschlitz
    case 'kettle':
      _P(g,_FG.sph, m,[0,y+0.4,0],[2.9,2.2,2.9]);
      _P(g,_FG.cone, m,[0,y+2.4,0],[0.9,1.8,0.9]);       // kleine Spitze
      _P(g,_FG.cyl, m,[0,y-0.5,0],[4.4,0.5,4.4]); break; // Krempe
    case 'hood':
      _P(g,_FG.cone, m,[0,y+0.8,0],[3.4,5.4,3.4]);
      _P(g,_FG.sph, m,[0,y-0.4,1.7],[1.8,1.8,1.2]); break;
    case 'skull':
      _P(g,_FG.sph, m,[-1,y-1,2.1],[0.8,1.0,0.6]);
      _P(g,_FG.sph, m,[ 1,y-1,2.1],[0.8,1.0,0.6]);
      _P(g,_FG.cone, m,[-1.9,y+1.9,-0.4],[0.6,2.4,0.6],[0.3,0,-0.5]);
      _P(g,_FG.cone, m,[ 1.9,y+1.9,-0.4],[0.6,2.4,0.6],[0.3,0, 0.5]); break;
    case 'turban':
      _P(g,_FG.sph, m,[0,y+0.5,0],[3.1,2.5,3.1]);
      _P(g,_FG.cyl, m,[0,y+2.8,2.2],[0.9,0.5,0.9],[Math.PI/2,0,0]); break;
  }
}
function _figWeapon(g, kit){
  const m = _km(kit);
  switch(kit.weapon){
    case 'spear':   // Schwert in der Hand, ~90° zum (hängenden) Arm → nach vorn
      _P(g,_FG.sph, m,[4.9,8.4,1.2],[0.6,0.6,0.6]);               // Knauf
      _P(g,_FG.cyl, m,[4.9,9.7,1.3],[0.42,2.4,0.42]);            // Griff (in der Faust)
      _P(g,_FG.box, m,[4.9,10.8,1.6],[3.0,0.7,0.9]);             // Parierstange
      _P(g,_FG.box, m,[4.9,11.9,6.0],[0.85,9,0.35],[1.35,0,0]);  // Klinge (nach vorn)
      _P(g,_FG.cone,m,[4.9,13.1,11.6],[0.85,2.6,0.35],[1.35,0,0]); break; // Spitze
    case 'halberd':
      _P(g,_FG.cyl, m,[5.4,13,1],[0.5,26,0.5]);
      _P(g,_FG.cone, m,[5.4,27,1],[0.7,3,0.7]);
      _P(g,_FG.box, m,[6.9,23,1],[2.6,3.6,0.4]); break;
    case 'greatsword':   // beidhändig, in der Hand nach vorn-oben
      _P(g,_FG.cyl, m,[4.9,7.9,1.2],[0.6,3,0.6]);                // Griff (lang)
      _P(g,_FG.box, m,[4.9,11.0,1.6],[4.2,1.0,1.0]);            // Parierstange
      _P(g,_FG.box, m,[4.9,16.9,7.4],[1.0,16,0.4],[0.8,0,0]);   // Klinge
      _P(g,_FG.cone,m,[4.9,22.3,12.9],[1.0,2.8,0.4],[0.8,0,0]); break; // Spitze
    case 'crossbow':   // waagerechte Armbrust, nach vorn gerichtet
      _P(g,_FG.box, m,[4.9,9.6,4],[1.0,1.0,7]);                  // Schaft
      _P(g,_FG.cyl, m,[4.9,9.6,6],[0.3,7,0.3],[0,0,Math.PI/2]);  // Bogen quer
      _P(g,_FG.cyl, m,[4.9,9.6,3],[0.15,5,0.15],[0,0,Math.PI/2]);// Sehne
      _P(g,_FG.cyl, m,[4.9,9.9,6],[0.2,6,0.2],[Math.PI/2,0,0]);  // Bolzen
      _P(g,_FG.cone,m,[4.9,9.9,9.2],[0.4,1.6,0.4],[Math.PI/2,0,0]); break; // Spitze
    case 'bow':   // Langbogen in der Hand + genockter Pfeil (vorwärts)
      _P(g,_FG.cyl, m,[4.9,9.5,1.8],[0.4,2.8,0.4]);             // Griff
      _P(g,_FG.cyl, m,[4.9,12.4,1.9],[0.4,4.5,0.4],[0.2,0,0]);  // oberer Wurfarm
      _P(g,_FG.cyl, m,[4.9,6.6,1.9],[0.4,4.5,0.4],[-0.2,0,0]);  // unterer Wurfarm
      _P(g,_FG.cyl, m,[4.9,14.6,2.6],[0.34,2.4,0.34],[0.55,0,0]); // obere Spitze
      _P(g,_FG.cyl, m,[4.9,4.4,2.6],[0.34,2.4,0.34],[-0.55,0,0]); // untere Spitze
      _P(g,_FG.cyl, m,[4.9,9.5,0.9],[0.12,12,0.12]);           // Sehne (senkrecht)
      _P(g,_FG.cyl, m,[4.9,9.5,5],[0.18,8,0.18],[Math.PI/2,0,0]); // Pfeilschaft
      _P(g,_FG.cone,m,[4.9,9.5,9.4],[0.4,1.8,0.4],[Math.PI/2,0,0]); break; // Pfeilspitze
    case 'scythe':
      _P(g,_FG.cyl, m,[5.4,13,1],[0.5,26,0.5]);
      _P(g,_FG.box, m,[4.1,26,1.4],[3.4,0.5,0.5],[0,0,0.5]); break;
    case 'scimitar':   // Krummsäbel in der Hand nach vorn
      _P(g,_FG.sph, m,[4.9,8.5,1.2],[0.55,0.55,0.55]);           // Knauf
      _P(g,_FG.cyl, m,[4.9,9.6,1.3],[0.42,2.2,0.42]);           // Griff
      _P(g,_FG.box, m,[4.9,10.6,1.5],[2.6,0.7,0.9]);            // Parierstange
      _P(g,_FG.box, m,[4.9,12.6,6.2],[0.8,10,0.5],[1.2,0,0.32]); // gebogene Klinge
      _P(g,_FG.cone,m,[4.9,14.2,11.0],[0.8,2.4,0.5],[1.2,0,0.32]); break; // Spitze
  }
}
function _figShield(g, kit){
  if(kit.shield==='none') return;
  const m = _km(kit);
  switch(kit.shield){
    case 'scutum':
      _P(g,_FG.box, m,[-5.2,13,1.6],[1.0,11,6],[0,0.15,0]);
      _P(g,_FG.cyl, m,[-5.7,13,1.6],[1.4,0.4,1.4],[Math.PI/2,0,0]); break;
    case 'heater':
      _P(g,_FG.box, m,[-5.2,14.5,1.4],[1.0,6.5,6]);
      _P(g,_FG.cone, m,[-5.2,9.5,1.4],[3.4,3,0.9],[Math.PI,0,0]);
      _P(g,_FG.cyl, m,[-5.7,14,1.4],[1.2,0.4,1.2],[Math.PI/2,0,0]); break;
    case 'tower':
      _P(g,_FG.box, m,[-5.4,13,1.4],[1.2,15,7]);
      _P(g,_FG.box, m,[-5.7,13,1.4],[0.4,15,1.2]); break;
    case 'round':
      _P(g,_FG.cyl, m,[-5.4,13,1.4],[4,0.6,4],[Math.PI/2,0,0]);
      _P(g,_FG.cyl, m,[-5.8,13,1.4],[1.2,0.4,1.2],[Math.PI/2,0,0]); break;
  }
}

/* ── Fußsoldat-Körper (Einheitsmaße, ohne Endskalierung) ── */
/* Ein animierbares GELENK bauen: die (in ABSOLUTEN Körperkoordinaten
   definierten) Teile werden zu EINEM Mesh verbacken und so unter einen Pivot
   gehängt, dass sie an ihrer Originalposition bleiben, der Pivot aber am echten
   Drehpunkt (absP) sitzt. `parentP` = Drehpunkt des Eltern-Gelenks (für die
   lokale Position). So dreht z.B. der Arm-Pivot um die Schulter, das Schwert
   darin geht automatisch mit. Draw-Call-freundlich: 1 Mesh pro Gelenk. */
function _joint(absP, parentP, buildFn, cast){
  const tmp = new THREE.Group();
  buildFn(tmp);
  const merged = _mergeGroup(tmp);            // 1 Mesh, Vertices an Absolutkoordinaten
  merged.position.set(-absP[0], -absP[1], -absP[2]);
  if(cast === false) merged.traverse(o => { if(o.isMesh) o.castShadow = false; });
  const pivot = new THREE.Group();
  pivot.position.set(absP[0]-parentP[0], absP[1]-parentP[1], absP[2]-parentP[2]);
  pivot.add(merged);
  return pivot;
}

/* Fußsoldat/Reiter als GEGLIEDERTE Haus-Miniatur (eigenes Modell im Stil der
   übrigen Figuren): Beine, Oberkörper, beide Arme und der Kopf sind je ein
   Gelenk-Pivot an seinem natürlichen Drehpunkt; Schild sitzt im linken Arm,
   Waffe im rechten, Helm im Kopf — alles folgt der jeweiligen Gelenkbewegung.
   Die Gelenke werden in render() prozedural im Leerlauf bewegt (Atmen, Wiegen,
   Arm-Schwingen, Umsehen), siehe window._figArtic. */
function _fig_soldierBody(kit, o){
  o = o || {};
  const g = new THREE.Group();
  const m  = _km(kit);
  const th = kit.undead ? 0.82 : 1;

  /* Sockel – zweistufige runde Plinthe wie bei Brettspiel-Miniaturen.
     Beritten: der Reiter bekommt KEINEN eigenen Sockel. */
  if(!o.mounted){
    _P(g,_FG.cyl, m,[0,0.5,0],[2.6,1.0,2.6]);
    _P(g,_FG.cyl, m,[0,1.35,0],[2.0,1.0,2.0]);
  }

  /* Körper (alles außer Sockel) mit ZUSÄTZLICHER Schrumpfung (_BODY_EXTRA). */
  const bd = new THREE.Group();

  /* — Beine (Hüft-Pivots). Beritten: Reit-Pose — Oberschenkel nach AUSSEN-unten
     über die Flanke, am Knie angewinkelt, Unterschenkel hängt herab. So sitzt
     der Reiter breitbeinig UM den Pferderumpf. Die Idle-Animation setzt nur
     rotation.x, die Pose steckt in der Geometrie und bleibt erhalten. */
  const legL = _joint([-1.9,9,0],[0,0,0], t => {
    if(o.mounted){
      _P(t,_FG.cyl, m,[-3.0,7.0,0.8],[1.4,5.5,1.4],[0,0,-0.62]);   // Oberschenkel (nach außen-unten)
      _P(t,_FG.cyl, m,[-4.7,1.5,1.4],[1.3,6,1.3],[0,0,-0.15]);     // Unterschenkel (herab)
      _P(t,_FG.sph, m,[-5.2,-1.7,2.0],[1.5,1.1,2.6]);              // Stiefel
    } else { _P(t,_FG.cyl, m,[-1.8,5,0],[1.5,8,1.5]); _P(t,_FG.sph, m,[-1.8,1.7,1.3],[1.5,1.2,2.4]); }
  }, true);
  const legR = _joint([1.9,9,0],[0,0,0], t => {
    if(o.mounted){
      _P(t,_FG.cyl, m,[ 3.0,7.0,0.8],[1.4,5.5,1.4],[0,0, 0.62]);
      _P(t,_FG.cyl, m,[ 4.7,1.5,1.4],[1.3,6,1.3],[0,0, 0.15]);
      _P(t,_FG.sph, m,[ 5.2,-1.7,2.0],[1.5,1.1,2.6]);
    } else { _P(t,_FG.cyl, m,[ 1.8,5,0],[1.5,8,1.5]); _P(t,_FG.sph, m,[ 1.8,1.7,1.3],[1.5,1.2,2.4]); }
  }, true);

  /* — Oberkörper (Taille-Pivot): Tunika, Gürtel, Torso, Schultern — trägt Arme
       und Kopf (nesting → Arm/Kopf wiegen beim Atmen mit). — */
  const torso = _joint([0,12,0],[0,0,0], t => {
    _P(t,_FG.taper, m,[0,9.5,0],[4.0*th,9,3.6*th]);   // Tunika/Rock
    _P(t,_FG.cyl,   m,[0,12,0],[3.4*th,1.0,3.1*th]);  // Gürtel
    _P(t,_FG.sph,   m,[0,16,0.2],[3.3*th,4.3,2.8*th]);// Torso (Ei)
    _P(t,_FG.sph,   m,[-3.4,18.6,0],[2.0,1.9,2.2]);   // Schulter L (Pauldron)
    _P(t,_FG.sph,   m,[ 3.4,18.6,0],[2.0,1.9,2.2]);   // Schulter R
  }, true);

  /* — Linker Arm (Schulter-Pivot) + Schild — */
  const armL = _joint([-3.4,18.6,0],[0,12,0], t => {
    _P(t,_FG.cyl, m,[-4.2,13.8,0],[1.25,9,1.25],[0,0,0.14]);
    _P(t,_FG.sph, m,[-4.9,9.4,0.3],[1.2,1.2,1.2]);   // Hand
    if(!o.noShield) _figShield(t, kit);
  }, false);
  /* — Rechter Arm (Schulter-Pivot) + Waffe — */
  const armR = _joint([3.4,18.6,0],[0,12,0], t => {
    _P(t,_FG.cyl, m,[4.2,13.8,0],[1.25,9,1.25],[0,0,-0.14]);
    _P(t,_FG.sph, m,[4.9,9.4,0.3],[1.2,1.2,1.2]);    // Hand
    _figWeapon(t, kit);
  }, false);

  /* — Hals + Kopf + Helm (Nacken-Pivot) — */
  const head = _joint([0,19.5,0],[0,12,0], t => {
    _P(t,_FG.cyl, m,[0,20,0],[1.3,2.0,1.3]);
    _P(t,_FG.sph, m,[0,22.4,0],[2.5,2.8,2.5]);
    _figHelm(t, kit);
  }, false);

  torso.add(armL); torso.add(armR); torso.add(head);
  bd.add(legL); bd.add(legR); bd.add(torso);

  legL.userData.soJoint='legL';  legR.userData.soJoint='legR';
  torso.userData.soJoint='torso'; armL.userData.soJoint='armL';
  armR.userData.soJoint='armR';   head.userData.soJoint='head';

  bd.scale.setScalar(_BODY_EXTRA);
  g.add(bd);
  g.userData.articulated = true;
  return g;
}

/* ── Reittier (Haus-Varianten) ──────────────────────────────────────────────
   Realistischer skulptierter Pferdekörper, gegliedert in ANIMIERBARE Pivot-
   Gruppen für eine lebendige Leerlauf-Animation (Atmen/Gewichtsverlagerung,
   Schweifwedeln, Kopf-Nicken/Grasen — angetrieben in render(), siehe
   window._figHorses). Aufbau:

     g (Reittier)
     ├─ Sockel (statisch, steht am Boden)
     └─ bodyPivot  name 'horseBody'   ← Reiter wird hier angehängt (bewegt mit)
        └─ horse  (× _BODY_EXTRA — gleiche Schrumpfung wie beim Fußsoldaten)
           ├─ statisches Sammel-Mesh (Rumpf, Sattel, Beine, Panzerung)
           ├─ neckPivot  name 'horseNeck'  (Hals+Kopf+Mähne)
           └─ tailPivot  name 'horseTail'  (Schweif)

   Nur die drei Pivots werden pro Frame gedreht — die vielen Einzelteile jedes
   Pivots sind zu je EINEM Mesh verbacken (_mergeGroup), damit die Draw-Call-
   Zahl niedrig bleibt (mobiltauglich), genau wie bei den übrigen Figuren. */
function _fig_mount(kit){
  const g = new THREE.Group();
  const undead = kit.undead;
  const m = _km(kit);
  const th = undead ? 0.8 : 1;   // untot = schmaler (skelettös)

  /* Sockel unter den Hufen – oval, wie bei Kavallerie-Minis (bleibt am Boden) */
  _P(g,_FG.cyl, m,[0,0.5,0],[3.0,1.0,5.4]);
  _P(g,_FG.cyl, m,[0,1.35,0],[2.4,1.0,4.8]);

  /* Animierter Träger (Skalierung 1) — trägt das geschrumpfte Pferd UND den
     Reiter, damit beide beim Atmen/Wippen gemeinsam mitgehen. */
  const bodyPivot = new THREE.Group();
  bodyPivot.name = 'horseBody';

  const horse = new THREE.Group();   // × _BODY_EXTRA

  /* — Statische Rumpf-/Bein-/Sattelteile (werden zu 1 Mesh verbacken) —
     Proportionen headless verifiziert (Seitenansicht-Silhouette): tiefe Brust
     vorn (niedrig), muskulöse hohe Kruppe hinten, Widerrist am Halsansatz,
     KEIN Bauch-Überhang → natürlicher Flanken-Tuck (Unterlinie steigt hinten). */
  const stat = new THREE.Group();
  _P(stat,_FG.sph, m,[0,12.2,0.0],[2.9*th,2.9,5.6]);     // Bauchtonne (oval)
  _P(stat,_FG.sph, m,[0,11.6,4.6],[2.8*th,3.1,2.6]);     // tiefe Brust (vorn, niedrig)
  _P(stat,_FG.sph, m,[0,13.0,-4.8],[2.9*th,3.1,3.2]);    // muskulöse Kruppe (hinten, hoch)
  _P(stat,_FG.sph, m,[0,13.9,3.8],[2.2*th,1.9,2.2]);     // Widerrist
  /* Sattel mit Sattelknopf (Pommel) und Hinterzwiesel (Cantle) */
  _P(stat,_FG.sph, m,[0,14.5,0.4],[2.7,1.1,3.0]);
  _P(stat,_FG.box, m,[0,15.1,2.2],[1.3,1.2,0.6]);
  _P(stat,_FG.box, m,[0,15.0,-1.3],[1.4,1.2,0.6]);
  /* Panzerungs-Varianten (statisch, am Rumpf) */
  if(kit.mount==='barded'){
    _P(stat,_FG.taper,m,[0,9.0,0.6],[3.1,6.0,3.7]);   // Kaparison (Decke)
    _P(stat,_FG.cyl,  m,[0,6.4,0.6],[3.2,0.9,3.7]);
  } else if(kit.mount==='heavy'){
    _P(stat,_FG.sph,  m,[0,11.8,5.2],[2.4,2.5,2.2]);  // Brustpanzer (Peytral)
  }
  if(undead) for(const zz of [-3,0,3]) _P(stat,_FG.cyl,m,[0,12.2,zz],[2.9,0.35,0.35],[0,0,Math.PI/2]);  // Rippen
  horse.add(_mergeGroup(stat));

  /* — Beine als GELENK-Pivots (statt statisch verbacken) → leichte Gewichts-
     verlagerung im Leerlauf. Pivot am Schulter-/Hüftansatz (~y11), die Teile
     (Oberschenkel → Gelenk → Röhrbein → Huf) hängen darunter; je 1 Mesh. */
  [[-1.9,4.6],[1.9,4.6],[-1.9,-4.6],[1.9,-4.6]].forEach((p, li) => {
    const leg = _joint([p[0],11,p[1]],[0,0,0], t => {
      _P(t,_FG.cyl, m,[p[0],6.9,p[1]],[1.1*th,8.4,1.1*th]);   // Oberschenkel/Unterarm
      _P(t,_FG.sph, m,[p[0],4.6,p[1]],[1.2*th,1.3,1.2*th]);   // Gelenk-Wulst
      _P(t,_FG.cyl, m,[p[0],2.3,p[1]],[0.7*th,4.8,0.7*th]);   // Röhrbein (schlank)
      _P(t,_FG.sph, m,[p[0],0.6,p[1]+0.1],[1.05,0.85,1.3]);   // Huf
    }, true);
    leg.userData.horseLeg = li;
    horse.add(leg);
  });

  /* — Hals + Kopf (Pivot am Widerrist → Nicken/Umsehen/Grasen) —
     Schlanker Hals, der vom Widerrist aufsteigt, dann fällt der Kopf am Genick
     nach unten ab (Maul tief) — verifizierte Silhouette, keine Giraffen-Pose. */
  const neckParts = new THREE.Group();
  _P(neckParts,_FG.taper, m,[0,1.7,0.7],[1.8*th,4.1,1.95*th],[0.50,0,0]);   // Unterhals (kräftiger)
  _P(neckParts,_FG.taper, m,[0,3.7,1.9],[1.35*th,3.3,1.5*th],[0.50,0,0]);   // Oberhals/Kamm
  _P(neckParts,_FG.sph,   m,[0,5.3,2.8],[1.4,1.7,1.5]);                     // Genick/Schädel (größer)
  _P(neckParts,_FG.taper, m,[0,4.0,3.2],[1.1,3.0,1.25],[2.15,0,0]);        // Gesicht (länger/breiter)
  _P(neckParts,_FG.sph,   m,[0,2.7,3.8],[1.0,1.15,1.1]);                    // Maul (größer)
  for(const s of [-1,1]) _P(neckParts,_FG.cone, m,[s*0.6,6.3,2.5],[0.4,1.4,0.4],[-0.15,0,s*0.2]); // Ohren (größer)
  _P(neckParts,_FG.cone, m,[0,6.0,3.1],[0.4,1.0,0.34],[1.2,0,0]);          // Stirnlocke
  for(let i=0;i<6;i++){                                                     // schmaler Mähnenkamm
    const tt=i/5;
    _P(neckParts,_FG.box, m,[0, 4.8 - tt*4.0, 1.3 - tt*1.7],[0.15, 0.8, 0.66],[0.5,0,0]);
  }
  if(kit.mount==='stag') for(const s of [-1,1]){                            // Geweih (Hirsch-Reittier)
    _P(neckParts,_FG.cone,m,[s*1.1,6.6,2.6],[0.42,3.4,0.42],[0.2,0,s*0.5]);
    _P(neckParts,_FG.cone,m,[s*2.3,8.4,2.0],[0.34,2.2,0.34],[0.2,0,s*0.9]);
  }
  const neckPivot = new THREE.Group();
  neckPivot.name = 'horseNeck';
  neckPivot.position.set(0,13.6,4.4);
  neckPivot.add(_mergeGroup(neckParts));
  horse.add(neckPivot);

  /* — Schweif (Pivot am Schweifansatz → Wedeln) — fällt dicht hinter der
     Kruppe fast senkrecht herunter (nicht waagerecht abstehend). */
  const tailParts = new THREE.Group();
  _P(tailParts,_FG.taper, m,[0,-1.5,-0.5],[0.95,3.0,0.85],[-0.25,0,0]);     // Schweifrübe
  _P(tailParts,_FG.cyl,   m,[0,-4.4,-1.0],[0.85,5.8,0.85],[-0.10,0,0]);     // Hauptfall
  _P(tailParts,_FG.cyl,   m,[ 0.45,-4.2,-0.9],[0.48,5.0,0.48],[-0.08,0, 0.04]);// Strähne
  _P(tailParts,_FG.cyl,   m,[-0.45,-4.2,-0.9],[0.48,5.0,0.48],[-0.08,0,-0.04]);// Strähne
  const tailPivot = new THREE.Group();
  tailPivot.name = 'horseTail';
  tailPivot.position.set(0,12.6,-6.2);
  tailPivot.add(_mergeGroup(tailParts));
  horse.add(tailPivot);

  horse.scale.setScalar(_BODY_EXTRA * _MOUNT_SC);
  bodyPivot.add(horse);
  g.add(bodyPivot);
  return g;
}

/* ── Kriegsmaschinen (pro Haus eine andere) — als eigene, ANIMIERTE Modelle ──
   Aufbau je Maschine: statische Teile → 1 verbackenes Mesh; der bewegliche Teil
   (Wurfarm / Bolzen / Rammbalken) sitzt in einem eigenen Pivot mit userData.
   engMove — im Render-Loop als Feuer-Zyklus (laden → Schuss → Rückstellung)
   angetrieben (window._figEngines). */
function _wheels(g, mat, w, z0){
  for(const x of [-w,w]) for(const z of [-z0,z0]) _P(g,_FG.cyl, mat,[x,3.5,z],[3.5,1.4,3.5],[0,0,Math.PI/2]);
}
/* Statische Teile in EIN Mesh verbacken und anhängen. */
function _engStatic(bd, buildFn){
  const tmp = new THREE.Group(); buildFn(tmp); bd.add(_mergeGroup(tmp));
}
/* Rotierender Arm: Pivot am Achspunkt `axle`, Teile (Absolutkoordinaten) darin
   verbacken. move = {kind:'rot', axis, a, b, speed}. */
function _engArm(bd, axle, buildFn, move){
  const pivot = _joint(axle, [0,0,0], buildFn, true);
  pivot.userData.engMove = move;
  bd.add(pivot);
}
/* Gleitender Teil (Bolzen/Rammbalken): 1 Mesh, das im Render-Loop verschoben
   wird. move = {kind:'pos', axis, a, b, speed}. */
function _engSlide(bd, buildFn, move){
  const tmp = new THREE.Group(); buildFn(tmp);
  const merged = _mergeGroup(tmp);
  merged.userData.engMove = move;
  bd.add(merged);
}
function _eng_ballista(bd,wood,metal){
  _engStatic(bd, t => {
    _wheels(t,wood,7,5);
    _P(t,_FG.box, wood,[0,7,0],[10,2,16]);            // Wagen
    _P(t,_FG.box, wood,[0,11.5,-3],[3.2,6,4]);        // Aufbau/Winde hinten
    _P(t,_FG.box, wood,[0,13.6,3],[1.8,1.4,13]);      // Schaft/Rinne (kurze Pfeilführung, KEIN Rohr)
    /* — Großer Bogen quer vorne (öffnet sich zum Schützen, Spitzen nach hinten,
       Sehne quer über die Spitzen) — */
    _P(t,_FG.box, wood,[0,14.2,8],[3.0,2.0,2.4]);                        // Bogennabe (vorn)
    _P(t,_FG.cyl, wood,[-3.4,14.2,7.7],[0.8,6.5,0.8],[0,0,Math.PI/2]);   // Arm L innen
    _P(t,_FG.cyl, wood,[-7.8,14.2,7.0],[0.7,3.8,0.7],[0,-0.35,Math.PI/2]); // Arm L Spitze (nach hinten gebogen)
    _P(t,_FG.cyl, wood,[ 3.4,14.2,7.7],[0.8,6.5,0.8],[0,0,Math.PI/2]);   // Arm R innen
    _P(t,_FG.cyl, wood,[ 7.8,14.2,7.0],[0.7,3.8,0.7],[0,0.35,-Math.PI/2]); // Arm R Spitze
    _P(t,_FG.cyl, wood,[0,14.2,6.0],[0.28,18,0.28],[0,0,Math.PI/2]);     // Sehne (quer)
  });
  /* Großer Pfeil: nockt an der Sehne, schießt nach vorn und wird langsam wieder
     gespannt. Schaft + Spitze + gekreuzte Befiederung. */
  _engSlide(bd, t => {
    _P(t,_FG.cyl,  wood, [0,14.5,4.5],[0.6,9,0.6],[Math.PI/2,0,0]);   // Schaft (großer Pfeil)
    _P(t,_FG.cone, metal,[0,14.5,9.6],[1.15,3.2,1.15],[Math.PI/2,0,0]);// Spitze
    _P(t,_FG.box,  metal,[0,14.5,0.6],[0.2,2.6,2.4]);                 // Befiederung (vertikal)
    _P(t,_FG.box,  metal,[0,14.5,0.6],[2.6,0.2,2.4]);                 // Befiederung (horizontal)
  }, { kind:'pos', axis:'z', a:0, b:10, speed:0.28 });
}
function _eng_trebuchet(bd,wood,metal,acc){
  _engStatic(bd, t => {
    _wheels(t,wood,6,6);
    _P(t,_FG.box, wood,[0,7,0],[8,2,18]);
    for(const z of [-4,4]){
      _P(t,_FG.cyl, wood,[-4,16,z],[0.9,20,0.9],[0,0,0.35]);
      _P(t,_FG.cyl, wood,[ 4,16,z],[0.9,20,0.9],[0,0,-0.35]);
    }
    _P(t,_FG.cyl, wood,[0,26,0],[0.9,10,0.9],[Math.PI/2,0,0]);   // Drehachse
  });
  /* Wurfarm mit Gegengewicht schwingt um die Achse. */
  _engArm(bd, [0,26,0], t => {
    _P(t,_FG.box, wood,[0,24,-6],[1.6,1.6,22],[-0.7,0,0]);   // Wurfarm
    _P(t,_FG.box, acc, [0,33,5],[3.4,4,3.4]);                // Gegengewicht
  }, { kind:'rot', axis:'x', a:0.0, b:-1.15, speed:0.16 });
}
function _eng_ram(bd,wood,metal){
  _engStatic(bd, t => {
    _wheels(t,wood,6,7);
    for(const x of [-6,6]) _P(t,_FG.cyl, wood,[x,12,0],[1,14,1]);
    _P(t,_FG.box, wood,[0,19,0],[14,1.4,6]);
    _P(t,_FG.box, wood,[0,20.5,0],[15,1.5,7]);
  });
  /* Rammbalken stößt vor und zurück. */
  _engSlide(bd, t => {
    _P(t,_FG.cyl,  wood, [0,12,0],[1.6,16,1.6],[Math.PI/2,0,0]);
    _P(t,_FG.cone, metal,[0,12,9],[2.2,4,2.2],[Math.PI/2,0,0]);
  }, { kind:'pos', axis:'z', a:-3, b:5, speed:0.5 });
}
function _eng_siegetower(bd,wood,metal,acc,kit){
  /* Turm: keine Feuerbewegung — statisch. */
  _engStatic(bd, t => {
    _wheels(t,wood,6,6);
    _P(t,_FG.box, wood,[0,18,0],[12,26,12]);
    _P(t,_FG.box, wood,[0,20,6.3],[10,18,0.4]);
    for(let i=-1;i<=1;i++){ _P(t,_FG.box, wood,[i*4,31.5,5],[2.4,3,2.4]); _P(t,_FG.box, wood,[i*4,31.5,-5],[2.4,3,2.4]); }
  });
}
function _eng_catapult(bd,wood,metal,acc,bone,flame,glow){
  _engStatic(bd, t => {
    _wheels(t, wood, 6,6);
    _P(t,_FG.box, wood,[0,7,0],[9,2,16]);
    _P(t,_FG.box, wood,[0,13,-3],[2.6,10,2.6]);   // Stütze/Achslager
    if(bone) _P(t,_FG.sph, wood,[0,10,8],[1.6,1.8,1.4]);
  });
  /* Wurfarm schwenkt um die Achse (Becher+Geschoss am Ende gehen mit). */
  _engArm(bd, [0,17,-2], t => {
    _P(t,_FG.box, wood,[0,20,4],[1.6,1.6,20],[0.7,0,0]);     // Wurfbalken
    _P(t,_FG.cyl, metal,[0,27,10],[2.2,2,2.2]);              // Becher
    _P(t,_FG.sph, flame ? glow : wood,[0,29,10],[1.8,1.8,1.8]); // Geschoss
  }, { kind:'rot', axis:'x', a:1.0, b:-0.4, speed:0.2 });
}

function _fig_engine(kit){
  const g = new THREE.Group();
  const m = _km(kit);
  /* Maschinen-Chassis in eigener Untergruppe, zusätzlich geschrumpft
     (_BODY_EXTRA) — gleiche Begründung wie bei Soldat/Reittier: die
     Plinthe darunter ist direkt verkleinert, das Chassis soll nicht
     unproportional groß daneben stehen. */
  const bd = new THREE.Group();
  switch(kit.engine){
    case 'ballista':      _eng_ballista(bd,m,m); break;
    case 'trebuchet':     _eng_trebuchet(bd,m,m,m); break;
    case 'ram':           _eng_ram(bd,m,m); break;
    case 'siegetower':    _eng_siegetower(bd,m,m,m,kit); break;
    case 'woodballista':  _eng_ballista(bd,m,m); break;
    case 'bonecatapult':  _eng_catapult(bd,m,m,m,true,false); break;
    case 'flamecatapult': _eng_catapult(bd,m,m,m,false,true,_kmGlow(kit)); break;
    default:              _eng_ram(bd,m,m);
  }
  bd.scale.setScalar(_BODY_EXTRA);
  g.add(bd);
  /* Sockel unter den Rädern – Rechteckplinthe für Belagerungswaffen */
  _P(g,_FG.box, m,[0,0.35,0],[8,0.7,13]);
  return g;
}

/* ── Ritter & Bogenschützen als echte Modelle (Three.js_GuardedCastle,
   MIT-Lizenz — siehe models/guarded/LICENSE; Basis-Modelle/Texturen laut
   Upstream-README von opengameart.org) ────────────────────────────────────
   Ersetzt die Formen-Soldaten der Tiers 1/3 sowie den Kavallerie-REITER
   (Tier 5; das Reittier bleibt die hausspezifische Formen-Konstruktion:
   Hirsch, Skelettpferd, Kaparison …) durch das Knight-Modell. Häuser mit
   Fernkampfwaffe (Bogen/Armbrust: Sylverin, Aerlund) stellen als Fußtruppe
   stattdessen den Archer — so unterscheiden sich die Fraktionen auch in
   der Silhouette, nicht nur in der Tönung. Die Modelle liegen als
   vorkonvertierte BufferGeometry-Daten vor (das three.js-JSON-v3-Format
   der Quelle kennt r128 nicht mehr; offline konvertiert, siehe
   models/guarded/). Laden ist asynchron mit Formen-Fallback + Load-Gen —
   gleiches Muster wie bei den Belagerungs-GLBs oben. */
const _GUARDED_FILES = {
  knight: { mesh:'knight.mesh.json' },
  archer: { mesh:'archer.mesh.json' }
};
/* Kennwerte aus der Konvertierung: yMin = Fußsohle, h = Höhe (Modell-Einheiten). */
const _GUARDED_DIMS = { knight:{yMin:-9.55, h:15.11}, archer:{yMin:-10.48, h:17.77} };
const _guardedGeo = new Map();
let _guardedLoadGen = 0;
(function(){
  Object.keys(_GUARDED_FILES).forEach(key => {
    const f = _GUARDED_FILES[key];
    fetch('models/guarded/' + f.mesh)
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(data => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
        geo.setAttribute('normal',   new THREE.Float32BufferAttribute(data.normal, 3));
        geo.setAttribute('uv',       new THREE.Float32BufferAttribute(data.uv, 2));
        _guardedGeo.set(key, geo);
        _guardedLoadGen++;   // bereits stehende Armeen auf das echte Modell umbauen
        try{ if(typeof refreshMapVisuals === 'function') refreshMapVisuals(); }catch(e){}
      })
      .catch(e => console.warn('[guarded] Modell-Ladefehler', key, e));
  });
})();

/* Ranged-Häuser stellen den Archer statt des Knights (Fußtruppen). */
function _guardedKeyFor(kit){ return (kit.weapon==='bow' || kit.weapon==='crossbow') ? 'archer' : 'knight'; }

/* Modell-Instanz: auf Zielhöhe skaliert, Fußsohle auf y=0.
   null, solange die Geometrie noch nicht geladen ist (→ Formen-Fallback).
   EINFARBIG in Hausfarbe — dieselben gecachten Mono-Materialien wie die
   Formen-Minis (_km); die Textur der Quelle bleibt ungenutzt, das Detail
   kommt wie beim Referenz-Stil rein aus der Silhouette. */
function _guardedFigure(key, primary, targetH){
  const geo = _guardedGeo.get(key);
  if(!geo) return null;
  const d = _GUARDED_DIMS[key];
  const s = targetH / d.h;
  const mesh = new THREE.Mesh(geo, _km({ primary: primary }));
  mesh.scale.setScalar(s);
  mesh.position.y = -d.yMin * s;
  mesh.castShadow = true;
  return mesh;
}

/* ── Tier-Figuren: 1 Soldat · 3 Soldaten-Trupp · 5 Kavallerie · 10 Maschine ── */
/* EIN Fußsoldat in Einheitsgröße (ohne _FSC-Endskalierung) — Baustein für
   Tier 1 (einzeln) und Tier 3 (Dreier-Trupp). Eigenes gegliedertes Haus-
   Miniatur-Modell (Gelenke: Beine/Torso/Arme/Kopf), im Render-Loop belebt. */
function _fig_soldierUnit(kit){
  return _fig_soldierBody(kit,{});
}
function _fig_soldier(kit){
  const g = _fig_soldierUnit(kit);
  g.scale.setScalar(_FSC * _SOLDIER_SC);
  return g;
}
function _fig_champion(kit){
  /* Tier 3 = DREI normal große Fußsoldaten als kompakter Trupp (Dreieck:
     zwei vorn, einer hinten) — statt der früheren vergrößerten Einzelfigur
     mit Fahne. Die Truppenstärke ist so direkt ablesbar; jeder Soldat wie
     in Tier 1 (Modell auf eigener Plinthe, Formen-Fallback bis geladen). */
  const g = new THREE.Group();
  const offs = [[-3.4, 2.2], [3.4, 2.2], [0, -3.0]];
  offs.forEach((o, i) => {
    const s = _fig_soldierUnit(kit);
    s.position.set(o[0], 0, o[1]);
    s.rotation.y = (i - 1) * 0.22;   // leicht aufgefächert, kein Paradeblock
    g.add(s);
  });
  g.scale.setScalar(_FSC * _SOLDIER_SC);
  return g;
}
function _fig_cavalry(kit){
  const g = new THREE.Group();
  const mount = _fig_mount(kit);
  g.add(mount);
  /* Reiter an den animierten Körper-Pivot des Pferdes hängen (statt an g), damit
     er beim Atmen/Wippen/Beinwechsel des Pferdes mitgeht. Fällt der Pivot wider
     Erwarten aus, an g anhängen (kein Absturz). */
  const seat = mount.getObjectByName('horseBody') || g;
  /* Reiter = dasselbe gegliederte Haus-Miniatur-Modell (berittene, breitbeinige
     Variante). Seine Gelenke werden im Leerlauf belebt (registriert via
     _registerSoldier, das auch animHorse-Figuren nach gegliederten Körpern
     durchsucht). Sitzhöhe: die Hüfte (bd y≈12) auf den Sattel (Pferd-Frame
     y≈14.6, × _BODY_EXTRA, da der Reiter im horseBody-Frame neben dem
     geschrumpften Pferd sitzt) setzen. */
  const rider = _fig_soldierBody(kit,{mounted:true});
  /* Reiter am GESÄSS auf den Sattel setzen (nicht am Gürtel): Sattel liegt im
     Pferd-Frame bei y≈14.8 (× _BODY_EXTRA·_MOUNT_SC), das Gesäß der Figur bei
     bd y≈9 (Beckenoberkante/Beinansatz, × _BODY_EXTRA). Differenz = Reiterhöhe.
     Feinwert bei Bedarf in der Vorschau nachziehen. */
  rider.position.set(0, 14.8 * _BODY_EXTRA * _MOUNT_SC - 9 * _BODY_EXTRA, 0);
  seat.add(rider);
  g.scale.setScalar(_FSC * _CAV_SC);
  return g;
}

/* Fertige, platzierbare Figur liefern. Kavallerie (Tier 5) nutzt das eigene,
   prozedural erzeugte Formen-Pferd (_fig_mount) mit gegliedertem Reiter — beide
   werden im Render-Loop belebt (Pferd via _figHorses, Reiter via _figArtic). */
function _spawnFigure(theme, facKey, tier){
  const fig = _getFigureProto(theme, facKey, tier).clone();
  _registerHorse(fig);
  _registerSoldier(fig);
  _registerEngine(fig);
  return fig;
}

/* ── Naval-Figuren (Bootgröße nach Stufe, Hausfarbe am Segel/Reling) ──
   Reserviert für ein künftiges Figuren-Set auf See-Karten; aktuell zeigen
   See-Karten weiter ihr natives Schiff-/Segel-Display (siehe FIGURE_THEME). */
function _buildBoat(kit, tier){
  const g = new THREE.Group();
  const m = _km(kit);
  const len = tier===1?14:tier===3?20:tier===5?26:34;
  const wid = tier===1?5:tier===3?7:tier===5?8:10;
  _P(g,_FG.box, m,[0,2,0],[wid,4,len]);
  _P(g,_FG.box, m,[0,4,0],[wid+1,2,len]);
  if(tier>=3){
    _P(g,_FG.cyl, m,[0,12,0],[0.8,20,0.8]);
    _P(g,_FG.box, m,[0,14,0],[0.4, tier>=5?12:8, wid*1.4]);
    _P(g,_FG.box, m,[0,18,0],[0.5,1,wid*1.4]);
  }
  if(tier===10) _P(g,_FG.cone,m,[0,6,len/2],[1.4,4,1.4],[Math.PI/2,0,0]);
  g.scale.setScalar(0.14);
  return g;
}

function _buildFigure(theme, facKey, tier){
  const kit = _FIG_KIT[facKey] || _FIG_KIT.neutral;
  let g;
  if(theme === 'naval'){ g = _buildBoat(kit, tier); }
  else if(tier===1){ g = _fig_soldier(kit); }
  else if(tier===3){ g = _fig_champion(kit); }
  else if(tier===5){ g = _fig_cavalry(kit); }
  else {
    g = _fig_engine(kit);   // eigenes, animiertes Maschinen-Modell (Tier 10)
    g.scale.setScalar(_FSC);
  }
  return g;
}

/* Prototyp-Cache: pro (Thema, Haus, Stufe) genau EINMAL bauen, dann klonen.
   Klone teilen Geometrie + Material — daher billig. */
const _figProtoCache = new Map();
function _getFigureProto(theme, facKey, tier){
  // _guardedLoadGen im Key: Tiers 1/3/5 hängen an den Knight-/Archer-Geometrien
  // (GuardedCastle) — sobald die nachladen, wird ein neuer Cache-Eintrag gebaut.
  const key = theme+'|'+facKey+'|'+tier + '|g'+_guardedLoadGen;
  let p = _figProtoCache.get(key);
  if(!p){
    const built = _buildFigure(theme, facKey, tier);
    /* Kavallerie (Tier 5) NICHT flach zusammenführen — die animierten Pivot-
       Gruppen (Körper/Hals/Schweif) müssen erhalten bleiben. Ihre Einzelteile
       sind bereits pro Pivot verbacken (siehe _fig_mount), die Draw-Call-Zahl
       bleibt also niedrig. Markieren, damit Klone beim Platzieren registriert
       und im Render-Loop animiert werden (window._figHorses). */
    if(theme!=='naval' && tier===5){ built.userData.animHorse = true; p = built; }
    /* Tier 1/3 (Fußsoldaten) ebenfalls NICHT flach zusammenführen — sonst gehen
       die Gelenk-Pivots (Beine/Torso/Arme/Kopf) verloren und die Leerlauf-
       animation wäre nicht mehr ansteuerbar. Die Teile sind bereits pro Gelenk
       zu je EINEM Mesh verbacken (siehe _joint), die Draw-Call-Zahl bleibt also
       überschaubar — gleiche Abwägung wie bei der Kavallerie. */
    else if(theme!=='naval' && (tier===1 || tier===3)){ built.userData.animSoldier = true; p = built; }
    /* Tier 10 (Kriegsmaschine) NICHT flach zusammenführen — der bewegliche Teil
       (Wurfarm/Bolzen/Rammbalken) muss als eigener Pivot erhalten bleiben. Die
       statischen Teile sind bereits zu 1 Mesh verbacken (siehe _engStatic). */
    else if(theme!=='naval' && tier===10){ built.userData.animEngine = true; p = built; }
    else { p = _mergeGroup(built); }
    _figProtoCache.set(key, p);
  }
  return p;
}

/* Frisch geklonte Kavallerie-Figur (falls sie ein animiertes Pferd ist) für die
   Leerlauf-Animation in render() registrieren. Selbstheilend: Einträge, deren
   Figur nicht mehr in der Szene hängt (root.parent===null), werden dort wieder
   ausgetragen — daher ist beim Neuaufbau der Truppen keine manuelle Abmeldung
   nötig. */
window._figHorses = window._figHorses || [];
function _registerHorse(fig){
  if(!fig || !fig.userData || !fig.userData.animHorse) return fig;
  const body = fig.getObjectByName('horseBody');
  if(!body) return fig;
  const legs = [];
  fig.traverse(o => { if(o.userData && typeof o.userData.horseLeg === 'number') legs[o.userData.horseLeg] = o; });
  window._figHorses.push({
    root: fig,
    body,
    neck: fig.getObjectByName('horseNeck'),
    tail: fig.getObjectByName('horseTail'),
    legs,
    phase: Math.random() * Math.PI * 2   // Phasenversatz → Pferde bewegen sich nicht im Gleichtakt
  });
  return fig;
}

/* Leerlauf-Animation der GEGLIEDERTEN Figuren (Fußsoldaten + Reiter). Eine
   Figur kann mehrere Körper enthalten (Tier 3 = Dreier-Trupp). Pro Körper die
   Gelenk-Pivots (userData.soJoint) einsammeln; `root` ist die Top-Figur für die
   selbstheilende Abmeldung (root.parent===null → Eintrag wird im Render-Loop
   ausgetragen). Eigener Phasenversatz je Körper → kein Gleichtakt. */
window._figArtic = window._figArtic || [];
function _registerArticulatedBody(bodyG, root){
  const j = {};
  bodyG.traverse(o => { if(o.userData && o.userData.soJoint) j[o.userData.soJoint] = o; });
  if(Object.keys(j).length){
    window._figArtic.push({ root, j, phase: Math.random() * Math.PI * 2, torsoBaseY: j.torso ? j.torso.position.y : 0 });
  }
}
function _registerSoldier(fig){
  // animSoldier = Fußsoldaten; animHorse = Kavallerie (der REITER darin ist
  // ebenfalls eine gegliederte Figur und soll belebt werden).
  if(!fig || !fig.userData || !(fig.userData.animSoldier || fig.userData.animHorse)) return fig;
  fig.traverse(o => { if(o.userData && o.userData.articulated) _registerArticulatedBody(o, fig); });
  return fig;
}

/* Kriegsmaschinen (Tier 10) für die Feuer-Animation registrieren: alle
   beweglichen Teile (userData.engMove) einsammeln, eigener Phasenversatz je
   Maschine. Selbstheilend wie die übrigen Registries. */
window._figEngines = window._figEngines || [];
function _registerEngine(fig){
  if(!fig || !fig.userData || !fig.userData.animEngine) return fig;
  const parts = [];
  fig.traverse(o => { if(o.userData && o.userData.engMove) parts.push(o); });
  if(parts.length) window._figEngines.push({ root: fig, parts, phase: Math.random() });
  return fig;
}

/* Truppenzahl → Figuren-Stufen (greedy 10/5/1), gedeckelt gegen Übermaß.
   Die frühere 3er-Stufe (Dreier-Trupp, _fig_champion) ist bewusst entfernt:
   Zahlen werden jetzt nur noch in 10/5/1 zerlegt, eine 3 erscheint also als
   drei einzelne Fußsoldaten statt als eigener Cluster. */
function _decomposeTroops(n){
  n = Math.max(1, n|0);
  const out = [];
  for(const t of [10,5,1]){
    while(n >= t && out.length < 14){ out.push(t); n -= t; }
    if(out.length >= 14) break;
  }
  return out;
}

/* Radius, für den die Rang-Abstände unten von Hand abgestimmt sind
   (typische Gebietsgröße). Kleinere/größere Aufstellungsfelder (siehe
   banner.userData.figureFieldRadius) skalieren die Aufstellung relativ dazu. */
const _FIG_NAT_R = 6.5;

/* Rand-Abstand: das Aufstellungsfeld wird auf diesen Anteil des verfügbaren
   Landradius verkleinert, damit die äußersten Truppen NICHT bis an die
   Gebietsgrenze/Küste heranstehen, sondern ein sichtbarer Landstreifen frei
   bleibt. Höher = Truppen dürfen näher an den Rand; niedriger = mehr Abstand. */
const _FIG_BORDER_INSET = 0.8;

/* Aufstellungsfeld-Radius eines Banners. Ist figureFieldRadius (noch) nicht
   gesetzt (map3d_placeSpecialsAway nicht/zu spät gelaufen), aus dem bereits
   beim Banner-Aufbau bekannten terrRadius ableiten statt pauschal 6.5 WE —
   der Pauschalwert erzwang auf großen Gebieten (z.B. Düsterklippe, terrR ≈20)
   fälschlich die Blase, obwohl reichlich Platz für die Boden-Formation ist.
   Auf das Ergebnis wird _FIG_BORDER_INSET angewandt, damit die Truppen mit
   Abstand zum Gebietsrand aufgestellt werden. */
function _figFieldR(banner){
  if(!banner) return _FIG_NAT_R;
  let raw;
  if(banner.userData.figureFieldRadius) raw = banner.userData.figureFieldRadius;
  else { const tr = banner.userData.terrRadius; raw = tr ? Math.max(2.2, tr - 1.2) : _FIG_NAT_R; }
  return Math.max(2.2, raw * _FIG_BORDER_INSET);
}

/* Figuren in Rängen aufstellen: Maschinen hinten, Infanterie vorn.
   Passt Abstand UND Anzahl an das verfügbare Aufstellungsfeld an
   (banner.userData.figureFieldRadius, bereits um Stadt/Burg bereinigt —
   siehe map3d_placeSpecialsAway), damit die Truppen weder über den
   Gebietsrand hinausragen noch mit Gebäuden kollidieren. Die Figurengröße
   selbst hat einen eigenen (höheren) Mindestwert, damit Armeen auch auf
   kleinen Gebieten aus der Ferne noch gut erkennbar bleiben. Jede Figur
   wird zusätzlich per Raycast auf dem Territoriumsmesh verankert (Höhe +
   Existenzprüfung) — fällt eine Position daneben (Küste/Nachbargebiet),
   wird sie Richtung Zentrum gezogen, bis sie auf echtem Land steht. */
/* Fußabdruck [Breite, Tiefe] + Höhe je Tier, in Welteinheiten bei Skalierung 1
   (aus den Plinthen: Soldat rund r≈2.6, Tier-3 = Dreier-Trupp aus Soldaten
   (zwei vorn ±3.4, einer hinten), Reittier oval 3.0×5.2, Maschine 8×13 —
   plus etwas Luft). Grundlage für kollisionsfreie Abstände in
   Boden-Formation UND Blase. */
/* Werte enthalten die Typ-Faktoren: Tier 1/3 ×_SOLDIER_SC (0.8),
   Tier 5 ×_CAV_SC (0.9); Tier 10 wird beim GLB-Laden auf die real
   vermessene (vergrößerte) Plinthe angehoben. */
const _FIG_FOOT = { 1:[4.4,4.4,11.5], 3:[10.0,8.7,11.5], 5:[5.6,9.6,12.6], 10:[8.8,13.8,15] };
const _FIG_GAP  = 1.1;

/* Truppen als natürlicher PULK statt gerader Reihen: jedes Tier wird in einen
   mehrreihigen Block gepackt (Tiefe = "hintereinander"), benachbarte Reihen
   um eine halbe Zelle VERSETZT (Ziegelmuster) plus leichte deterministische
   Streuung — so wirkt die Aufstellung lockerer und weniger wie eine Parade.
   Blöcke stehen front-zu-heck gestapelt: Maschinen (Tier 10) hinten,
   Infanterie (Tier 1) vorn. Liefert pro Einheit eine lokale (x,z)-Position
   (Skalierung 1) + den Radius der Gesamtformation reqR — Grundlage für die
   Größenanpassung ans Aufstellungsfeld (siehe _layoutFigures/_FIG_MIN_SCALE).
   Ersetzt die frühere Ein-Reihe-pro-Tier-Packung (_figPackRanks) in der
   Boden- UND Blasen-Aufstellung. */
function _figPackUnits(tiers){
  const groups = [];
  [10,5,3,1].forEach(t => {
    const n = tiers.filter(x => x===t).length;
    if(n){
      const w = _FIG_FOOT[t][0], d = _FIG_FOOT[t][1];
      /* Spaltenzahl so, dass der Block etwa quadratisch WIRKT (in Weltmaßen):
         cols·w ≈ rows·d → cols ≈ √(n·d/w). Mind. 1, höchstens n. Große
         Maschinen (tief) bekommen so wenige Spalten/mehr Tiefe, kleine
         Infanterie breitere, flachere Blöcke. */
      const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * d / w)) || 1));
      const rows = Math.ceil(n / cols);
      groups.push({ t, n, w, d, cols, rows,
                    stepX: w + _FIG_GAP, stepZ: d + _FIG_GAP,
                    depth: rows*(d + _FIG_GAP) - _FIG_GAP });
    }
  });
  const totalD = groups.reduce((s,g) => s + g.depth, 0) + _FIG_GAP*(groups.length-1);
  let zCur = -totalD/2, reqR = 0;
  const units = [];
  groups.forEach(g => {
    const z0 = zCur;                     // Vorderkante des Blocks
    for(let idx = 0; idx < g.n; idx++){
      const row   = Math.floor(idx / g.cols);
      const col   = idx % g.cols;
      const inRow = Math.min(g.cols, g.n - row*g.cols);   // Einheiten in DIESER Reihe (letzte evtl. kürzer)
      // Ziegel-Versatz: gerade/ungerade Reihen um ±¼ Zelle gegeneinander → ½-Zelle Versatz
      const brick = (row % 2 ? 1 : -1) * g.stepX * 0.25;
      let x = (col - (inRow-1)/2) * g.stepX + brick;
      let z = z0 + g.stepZ*(row + 0.5);
      // Leichte, deterministische Streuung (kleiner als der Sicherheits-Gap → kollisionsfrei)
      x += (_figHash(g.t*97 + idx*13) - 0.5) * _FIG_GAP * 0.5;
      z += (_figHash(g.t*53 + idx*7)  - 0.5) * _FIG_GAP * 0.4;
      units.push({ t: g.t, x, z, w: g.w, d: g.d });
      reqR = Math.max(reqR, Math.hypot(Math.abs(x) + g.w/2, Math.abs(z) + g.d/2));
    }
    zCur += g.depth + _FIG_GAP;
  });
  return { units, reqR };
}

function _layoutFigures(fg, facKey, banner){
  const troops = fg.userData._troops || 1;
  const tiers = _decomposeTroops(troops);

  const fieldR = _figFieldR(banner);
  const meshes = (banner && banner.userData.terrMeshes) || [];
  const baseY  = banner ? banner.userData.baseY : 0;

  /* EIN gemeinsamer Skalierungsfaktor u für Positionen UND Figurengröße.
     Früher wurden nur die Positionen an das Feld geklemmt (rankClamp), die
     Figurengröße aber (fast) nicht — bei Figuren in voller Größe rutschten
     die Einheiten dadurch ineinander. Jetzt wird die Formation aus den
     echten Fußabdrücken (_FIG_FOOT) gepackt und ihr benötigter Radius
     berechnet; passt sie nicht ins Aufstellungsfeld, schrumpfen Abstände
     und Figuren im GLEICHEN Maß — Einzelfiguren bleiben voll groß, große
     Armeen werden gleichmäßig kleiner, aber nie überlappend. */
  const packed = _figPackUnits(tiers);
  const units = packed.units;
  // Untergrenze _FIG_MIN_SCALE: da die Blase entfällt, schrumpfen große
  // Armeen auf kleinen Gebieten nur bis hierher (statt unsichtbar zu werden);
  // sie können dann leicht über den Rand reichen — bewusster Kompromiss.
  const u = Math.max(_FIG_MIN_SCALE, Math.min(1, fieldR / Math.max(1e-6, packed.reqR)));

  const cosA = Math.cos(fg.rotation.y), sinA = Math.sin(fg.rotation.y);
  const originX = (banner ? banner.position.x : 0) + fg.position.x;
  const originZ = (banner ? banner.position.z : 0) + fg.position.z;

  /* Freihaltezonen der SICHTBAREN Spezialeinheiten (Welt-XZ + Radius aus dem
     jeweiligen Modell-Fußabdruck). Die Spezials stehen im selben Fächer
     "weg vom Gebäude" wie der Figuren-Cluster (_fanSpecials) — ohne diese
     Zonen stehen Truppenfiguren mitten in Turm/Ritter/Katapult.
     Das GEBÄUDE (Stadt/Burg/Hafen) ist ebenfalls Freihaltezone: die Formation
     darf bis an die Mauern reichen (siehe Feldradius-Kappung in
     map3d_placeSpecialsAway), einzelne Figuren werden hier herausgeschoben. */
  const obstacles = [];
  if(banner && meshes.length){
    if(banner.userData.specials){
      const clr = { tower: 2.9, knight: 2.4, catapult: 3.1 };   // Ritter: größere Statue + breiterer Sockel
      for(const k in banner.userData.specials){
        const m = banner.userData.specials[k];
        if(!m || !m.visible || !m.userData.baseOffset) continue;
        obstacles.push({ x: banner.position.x + m.userData.baseOffset.x,
                         z: banner.position.z + m.userData.baseOffset.z,
                         r: clr[k] || 2.5 });
      }
    }
    const bspot = banner.userData.buildingSpot;
    if(bspot) obstacles.push({ x: bspot.x, z: bspot.z, r: bspot.r });
    /* Berge ebenfalls freihalten: map3d_clearDecorObstructions räumt Berge
       zwar aus der Truppenzone, lässt aber im Zweifel einen verkleinerten
       Berg an Ort und Stelle stehen — Figuren würden dann auf/im Berg
       stehen. Alle Berge in Reichweite des Aufstellungsfelds als Zone
       ergänzen (Welt-XZ + Fuß-Radius), damit einzelne Figuren herausge-
       schoben werden wie bei Gebäuden/Spezialeinheiten. */
    if(typeof _mountainMeshes !== 'undefined' && _mountainMeshes.length){
      const reach = _figFieldR(banner) + 8;
      for(const mt of _mountainMeshes){
        if(!mt.visible) continue;
        const dx = mt.position.x - banner.position.x, dz = mt.position.z - banner.position.z;
        const fr = (mt.userData.footR || 4);
        if(dx*dx + dz*dz < (reach + fr)*(reach + fr))
          obstacles.push({ x: mt.position.x, z: mt.position.z, r: fr });
      }
    }
  }

  units.forEach((un, i) => {
      const t = un.t;
      let lx = un.x * u, lz = un.z * u;

      // Auf echtem Terrain verankern (Höhe + Existenz). Ohne Meshes-Kontext
      // (z.B. See-Karten/Boote) unverändert lassen — vorheriges Verhalten.
      let y = baseY;
      if(meshes.length){
        let shrink = 1;
        let wx = originX + lx*cosA + lz*sinA;
        let wz = originZ - lx*sinA + lz*cosA;
        let hit = _terrainYOrNull(wx, wz, meshes);
        while(hit === null && shrink > 0.15){
          shrink *= 0.7;
          const tx = lx*shrink, tz = lz*shrink;
          wx = originX + tx*cosA + tz*sinA;
          wz = originZ - tx*sinA + tz*cosA;
          hit = _terrainYOrNull(wx, wz, meshes);
        }
        // Auch wenn gar kein Treffer gefunden wurde: den bereits geschrumpften
        // Versatz BEHALTEN statt auf (0,0) zu setzen. Sonst kollabieren mehrere
        // Figuren (auf schmalen/unregelmäßigen Gebieten landet der Strahl öfter
        // daneben) alle auf denselben Punkt und stehen sichtbar ineinander.
        lx *= shrink; lz *= shrink;
        y = (hit === null) ? baseY : hit;
      }

      /* Aus den Freihaltezonen der Spezialeinheiten herausschieben: radial
         vom Modell weg auf den Zonenrand, dann neu am Terrain verankern.
         Landet die verschobene Position im Wasser/Nachbargebiet, bleibt die
         alte stehen (leichte Überlappung ist dann das kleinere Übel gegen-
         über einer schwebenden Figur). Zwei Durchläufe, weil das Ausweichen
         vor einer Zone in die Nachbarzone schieben kann. */
      if(obstacles.length){
        const figR = Math.max(un.w, un.d) * u * 0.5;
        let wx = originX + lx*cosA + lz*sinA;
        let wz = originZ - lx*sinA + lz*cosA;
        for(let pass = 0; pass < 2; pass++){
          for(const ob of obstacles){
            const odx = wx - ob.x, odz = wz - ob.z;
            const dist = Math.hypot(odx, odz), need = ob.r + figR;
            if(dist >= need) continue;
            let nx, nz;
            if(dist > 1e-4){ nx = odx/dist; nz = odz/dist; }
            else { // exakt im Zentrum: Richtung Formations-Ursprung ausweichen
              const fx = originX - ob.x, fz = originZ - ob.z;
              const fd = Math.hypot(fx, fz) || 1;
              nx = fx/fd; nz = fz/fd;
            }
            const px = ob.x + nx*need, pz = ob.z + nz*need;
            const py = _terrainYOrNull(px, pz, meshes);
            if(py !== null){ wx = px; wz = pz; y = py; }
          }
        }
        lx = (wx - originX)*cosA - (wz - originZ)*sinA;
        lz = (wx - originX)*sinA + (wz - originZ)*cosA;
      }

      // Pro Figur abgesichert (wie in _layoutBubble): eine defekte
      // Proto-Erzeugung soll nicht die restliche Armee mit abreißen.
      try{
        const fig = _spawnFigure(FIGURE_THEME, facKey, t);
        fig.position.set(lx, y - baseY, lz);
        fig.rotation.y += (_figHash(facKey+t+i)-0.5)*0.3;   // leichte, deterministische Streuung
        // MULTIPLIZIEREN statt SETZEN (Basis-Skalierung des Protos erhalten;
        // ein setScalar hat hier historisch die _FSC-Skalierung überschrieben
        // und die Figuren ~45× zu groß gemacht). u skaliert Figur UND Abstand
        // im selben Maß — siehe Formation-Packung oben.
        fig.scale.multiplyScalar(u);
        fg.add(fig);
      }catch(err){ console.warn('[figures] Boden-Figur übersprungen', facKey, 'Tier', t, err); }
  });
}

/* ── "Sprechblase" für zu große Armeen auf zu kleinem Gebiet ────────────────
   Statt die Formation auf dem Gebiet unlesbar zu stauchen oder Figuren
   wegzulassen: die GESAMTE Armee (alle Tiers, ungekürzt) auf eine Plattform
   LEICHT NEBEN dem Territorium heben — bei Inseln bevorzugt über offenem
   Wasser, knapp über der Oberfläche (Floß-Optik) — verbunden mit einer Spur
   kleiner werdender Kugeln zum Banner, wie der Zipfel einer Sprechblase,
   der aufs Gebiet zeigt. Sanftes Wippen/Treiben im Render-Loop macht die
   Blase lebendig. Greift nur, wenn die Boden-Formation der konkreten Armee
   unleserlich klein würde (siehe _FIG_BUBBLE_RATIO). */
/* Schwebende Plattform ("Blase") global abgeschaltet: die Truppen stehen
   IMMER am Boden im Gebiet und passen sich dynamisch an dessen Größe an
   (siehe _FIG_MIN_SCALE als Untergrenze). Auf true setzen, um die alte
   Ausweich-Plattform für sehr große Armeen auf winzigen Gebieten wieder zu
   aktivieren. */
const _FIG_USE_BUBBLE = false;

/* Untergrenze für die Formations-/Figurengröße, seit die Blase entfällt.
   Passt eine Armee nicht ins Gebiet, schrumpfen Formation UND Figuren bis
   maximal auf diesen Faktor — darunter würden Einheiten unsichtbar. Bei
   sehr großen Armeen auf sehr kleinen Gebieten kann die Formation dadurch
   leicht über den Rand reichen (bewusster Kompromiss statt schwebender
   Blase). Höher = Truppen bleiben größer, ragen aber eher über den Rand;
   niedriger = passen sich enger ans Gebiet an, werden aber kleiner. */
const _FIG_MIN_SCALE = 0.3;

/* (Nur noch relevant, wenn _FIG_USE_BUBBLE wieder true ist.) Blase, sobald
   die Boden-Formation der KONKRETEN Armee unter diesen Fit-Faktor schrumpfen
   müsste. */
const _FIG_BUBBLE_RATIO = 0.4;
const _BUBBLE_HEIGHT    = 15;    // Plattform-Höhe über dem Banner (Welteinheiten)
/* (Das frühere feste Plattform-Raster _BUBBLE_COLS/_BUBBLE_SP_* ist entfallen
   — die Blase nutzt jetzt den gepackten Pulk aus _figPackUnits mit
   einheitlichem Maßstab, siehe _layoutBubble.) */

const _bubbleGeo = {
  platform: new THREE.CylinderGeometry(1, 0.94, 0.8, 28),
  rim:      new THREE.TorusGeometry(1, 0.07, 8, 28),
  trail:    new THREE.SphereGeometry(1, 14, 10)
};
const _bubblePlatformMat = new THREE.MeshStandardMaterial({
  color: 0xf3ead0, transparent:true, opacity:0.92, roughness:0.5, metalness:0.05
});
const _bubbleTrailMat = new THREE.MeshStandardMaterial({
  color: 0xf3ead0, transparent:true, opacity:0.85, roughness:0.5, metalness:0.05
});
const _bubbleRimMatCache = new Map();
function _bubbleRimMat(hex){
  let m = _bubbleRimMatCache.get(hex);
  if(!m){ m = new THREE.MeshStandardMaterial({ color:hex, roughness:0.4, metalness:0.2 }); _bubbleRimMatCache.set(hex,m); }
  return m;
}

/* Blase aufbauen: Plattform + Kugel-Spur zum Banner + Figuren im lockeren
   Raster obendrauf. ALLE Tiers werden gezeigt (kein Ausdünnen) — das ist der
   Sinn der Blase: die volle Armee bleibt lesbar, unabhängig von der
   Gebietsgröße/-form. */
function _layoutBubble(bg, facKey, troops, banner){
  const kit = _FIG_KIT[facKey] || _FIG_KIT.neutral;
  const tiers = _decomposeTroops(troops);

  /* Formation wie am Boden packen (_figPackUnits) und mit EINEM einheitlichen
     Maßstab sB auf die Plattform setzen. Vorher wurde jede Figur einzeln in
     eine feste Rasterzelle gestaucht — die Fit-Faktoren unterscheiden sich
     aber je Tier (Einzel-Soldat ~0.37, Trupp-Soldat ~0.23), wodurch gleiche
     Fußsoldaten auf derselben Plattform verschieden groß wirkten. Jetzt:
     einheitlicher Maßstab in VOLLER Bodengröße — Blasen-Figuren sind genauso
     groß wie die Boden-Formationen (dort 70–100%, siehe _FIG_BUBBLE_RATIO).
     Erst sehr große Armeen schrumpfen bis auf denselben Mindestwert 0.7;
     die PLATTFORM wächst stattdessen mit der Formation mit. */
  const packed = _figPackUnits(tiers);
  const sB = Math.max(_FIG_BUBBLE_RATIO,
                      Math.min(1, 6.0 / Math.max(1e-6, packed.reqR)));
  const r  = packed.reqR * sB + 1.2;

  /* ── Seitlicher Versatz statt "direkt über dem Territorium" ─────────────
     Die Plattform steht LEICHT NEBEN dem Gebiet. Dafür 12 Richtungen rund
     ums Banner abtasten (Raycast gegen ALLE Territorien): eine Richtung, in
     der die Plattform komplett über offenem Wasser läge, wird bevorzugt —
     bei Inseln schwimmt die Blase dann als Floß knapp über der Wasser-
     oberfläche. Gibt es nur Land (Binnengebiet), bleibt sie in klassischer
     Schwebehöhe, aber ebenfalls seitlich versetzt. */
  const terrR = (banner && banner.userData.terrRadius) || 6.5;
  const baseY = (banner && banner.userData.baseY) || 0;
  const dist  = terrR + r + 2.5;
  const baseA = (banner && banner.userData.figAway && banner.userData.figAway.angle) ||
                _figHash(facKey + troops) * Math.PI * 2;
  let ox = Math.sin(baseA) * dist, oz = Math.cos(baseA) * dist, overWater = false;
  const allMeshes = (typeof territoryMeshes !== 'undefined') ? territoryMeshes : [];
  for(let k = 0; k < 12; k++){
    const a = baseA + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
    const tx = Math.sin(a) * dist, tz = Math.cos(a) * dist;
    const wx = (banner ? banner.position.x : 0) + tx;
    const wz = (banner ? banner.position.z : 0) + tz;
    // Plattform-Zentrum + 4 Randpunkte müssen alle über Wasser liegen
    let water = _terrainYOrNull(wx, wz, allMeshes) === null;
    for(let e = 0; e < 4 && water; e++){
      const ea = e * Math.PI / 2;
      water = _terrainYOrNull(wx + Math.cos(ea) * r * 0.9, wz + Math.sin(ea) * r * 0.9, allMeshes) === null;
    }
    if(water){ ox = tx; oz = tz; overWater = true; break; }
  }
  /* Plattform-Höhe: über Wasser knapp über der Oberfläche (Welt-y ≈ 2.2,
     Seehöhe 0.7) — sonst klassische Schwebehöhe überm Gelände. */
  const py = overWater ? (2.2 - baseY) : _BUBBLE_HEIGHT;
  if(banner) banner.userData.bubblePhase = _figHash(facKey + '|' + Math.round(ox) + '|' + Math.round(oz)) * Math.PI * 2;

  const platform = new THREE.Mesh(_bubbleGeo.platform, _bubblePlatformMat);
  platform.scale.set(r, 1, r);
  platform.position.set(ox, py, oz);
  platform.castShadow = true;
  bg.add(platform);

  const rim = new THREE.Mesh(_bubbleGeo.rim, _bubbleRimMat(kit.primary));
  rim.scale.set(r, r, 1);
  rim.rotation.x = Math.PI/2;
  rim.position.set(ox, py + 0.42, oz);
  bg.add(rim);

  // Kugel-Spur (Denkblase-Schweif) — zeigt jetzt diagonal vom Banner zur
  // seitlich versetzten Plattform, wie der Zipfel einer Sprechblase.
  const trailN = 3;
  for(let i=0;i<trailN;i++){
    const f = (i+1)/(trailN+1);   // 0..1 zwischen Banner und Plattform
    const tr = new THREE.Mesh(_bubbleGeo.trail, _bubbleTrailMat);
    tr.scale.setScalar(0.35 + f*0.55);
    tr.position.set(ox * f * 0.85, 1.2 + f * (py - 1.2), oz * f * 0.85);
    bg.add(tr);
  }

  // Figuren im gepackten Pulk auf der Plattform — gleicher seitlicher Versatz
  // (ox/oz) wie Plattform+Rand, einheitlicher Maßstab sB.
  const topY = py + 0.4;
  packed.units.forEach((un, i) => {
      /* Pro Figur abgesichert: wirft EINE Proto-Erzeugung (z.B. gerade
         nachladendes Maschinen-Modell), sollen die übrigen Einheiten der
         Blase trotzdem erscheinen — vorher riss die Exception die restliche
         Armee still mit ab ("nicht alle Einheiten angezeigt"). */
      try{
        const fig = _spawnFigure(FIGURE_THEME, facKey, un.t);
        fig.position.set(ox + un.x * sB, topY, oz + un.z * sB);
        fig.rotation.y = (_figHash(facKey + un.t + i) - 0.5) * 0.4;
        fig.scale.multiplyScalar(sB);
        bg.add(fig);
      }catch(err){ console.warn('[figures] Blasen-Figur übersprungen', facKey, 'Tier', un.t, err); }
  });
}

/* Figuren-Gruppe eines Banners neu aufbauen (signatur-gesichert). Wählt pro
   Territorium zwischen Boden-Aufstellung und schwebender Blase, je nachdem
   wie viel Platz das Gebiet hergibt. */
function _rebuildTroopFigures(banner, facKey, troops){
  const fg = banner.userData.figuresGroup;
  const bg = banner.userData.bubbleGroup;
  if(!fg) return;

  // Sichtbarkeit IMMER neu setzen (billig) — unabhängig vom Signatur-Cache
  // unten. Sonst bleibt beim reinen Umschalten Banner↔Figuren (ohne Truppen-
  // Änderung) die Blase/Boden-Gruppe im falschen Sichtbarkeits-Zustand
  // hängen, weil der teure Rebuild dann übersprungen wird.
  const fieldR   = _figFieldR(banner);
  // Armee-abhängig statt pauschal: Wie stark müsste DIESE Formation
  // schrumpfen? Erst unterhalb von _FIG_BUBBLE_RATIO wird die Blase fällig.
  // Das Gebäude (Stadt/Burg/Hafen) steckt bereits im Feldradius: der wird in
  // map3d_placeSpecialsAway am Mauer-/Pier-Rand gekappt UND das Gebäude ist
  // in _layoutFigures eine Freihaltezone. Die frühere binäre buildingHit-
  // Prüfung entfällt — sie schickte Armeen auf Gebäude-Gebieten (Vargwacht,
  // Feuerflott) schon in die Blase, wenn der Formationskreis das Gebäude
  // nur BERÜHRTE. Mini-Inseln (Salzhafen) landen weiter korrekt in der
  // Blase, weil ihr gekappter Feldradius das 70%-Kriterium reißt.
  const reqR     = _figPackUnits(_decomposeTroops(troops)).reqR;
  // Blase nur, wenn global aktiviert (_FIG_USE_BUBBLE). Standardmäßig aus:
  // Truppen bleiben immer am Boden, siehe _layoutFigures/_FIG_MIN_SCALE.
  const tooTight = _FIG_USE_BUBBLE && !!bg && ((fieldR / Math.max(1e-6, reqR)) < _FIG_BUBBLE_RATIO);
  fg.visible = !tooTight;
  if(bg) bg.visible = tooTight;

  // _guardedLoadGen einbezogen: sobald die Knight-/Archer-Geometrien nachladen,
  // sollen bereits stehende Armeen automatisch neu gebaut werden.
  // Spezial-Signatur mit einbezogen: erscheint/verschwindet ein Spezialmodell
  // (Turm/Ritter/Katapult), muss die Boden-Formation neu ausweichen (siehe
  // Freihaltezonen in _layoutFigures) — auch ohne Truppen-Änderung.
  const sig = facKey + '|' + troops + '|' + (tooTight ? 'b' : 'g') + '|' + (banner.userData.specSig || '') + '|' + _guardedLoadGen;
  if(banner.userData._figSig === sig) return;
  banner.userData._figSig = sig;
  while(fg.children.length){ fg.remove(fg.children[fg.children.length-1]); }
  if(bg) while(bg.children.length){ bg.remove(bg.children[bg.children.length-1]); }
  fg.userData._troops = troops;
  // Ausrichtung ZUERST setzen — _layoutFigures braucht sie für die
  // Terrain-Prüfung jeder einzelnen Figur (Weltposition = Banner + fg-Offset).
  const fa = banner.userData.figAway;
  if(fa){ fg.position.set(fa.ox, 0, fa.oz); fg.rotation.y = fa.angle; }
  else  { fg.position.set(0,0,0); fg.rotation.y = 0; }

  if(tooTight) _layoutBubble(bg, facKey, troops, banner);
  else _layoutFigures(fg, facKey, banner);
}

/* Terrain-Höhe an (x,z) NUR wenn der Strahl das Territoriumsmesh trifft —
   sonst null (Punkt liegt außerhalb, z.B. über See). Anders als _getTerrainY,
   das als Fallback die Bounding-Box-Oberkante liefert und daher nie "daneben"
   meldet. */
function _terrainYOrNull(x, z, meshes){
  if(!meshes.length) return null;
  _terrainRay.set(new THREE.Vector3(x, 200, z), _terrainDir);
  const hits = _terrainRay.intersectObjects(meshes, false);
  return hits.length ? hits[0].point.y : null;
}

/* Spezialeinheiten (Turm/Katapult/Ritter) QUER zur Truppenrichtung fächern —
   der Truppen-Cluster zieht in Richtung `base` (weg vom Gebäude) und breitet
   sich dort aus; die Spezials flankieren ihn links/rechts, statt mitten im
   Aufstellungsfeld zu stehen (sie überlappten sonst mit den Figuren). Radien
   von außen nach innen probieren (Land-Raycast), damit sie bevorzugt außerhalb
   der Formation stehen. */
function _fanSpecials(banner, dx, dz, meshes){
  const sp = banner.userData.specials; if(!sp) return;
  const base = Math.atan2(dx, dz);   // Richtung WEG vom Gebäude (= Truppenrichtung)
  const slots = [
    { m: sp.tower,    a: base - Math.PI/2 - 0.5 },   // linke Flanke, hinten
    { m: sp.catapult, a: base - Math.PI/2 + 0.5 },   // linke Flanke, vorn
    { m: sp.knight,   a: base + Math.PI/2 }          // rechte Flanke
  ];
  slots.forEach(s => {
    if(!s.m) return;
    let chosen = null;
    for(const R of [8.0, 6.5, 5.0, 3.5, 2.0]){
      const ox = Math.sin(s.a)*R, oz = Math.cos(s.a)*R;
      const wy = _terrainYOrNull(banner.position.x+ox, banner.position.z+oz, meshes);
      if(wy !== null){ chosen = {ox, oz, y: wy - banner.userData.baseY}; break; }
    }
    // Alle Radien daneben (sehr kleines/schmales Gebiet): auf dem kleinsten
    // probierten Radius belassen (NICHT auf (0,0) zurückfallen) — sonst landen
    // Turm/Katapult/Ritter alle exakt am Banner-Punkt und stehen ineinander.
    if(!chosen){ chosen = {ox:Math.sin(s.a)*2.0, oz:Math.cos(s.a)*2.0, y:0}; }
    s.m.userData.baseOffset = { x:chosen.ox, y:chosen.y, z:chosen.oz };
    s.m.position.set(chosen.ox, chosen.y, chosen.oz);
  });
}

/* Nach dem Platzieren von Städten & Burgen: für jedes Banner die Richtung
   "weg vom Gebäude" bestimmen, Spezialeinheiten dorthin fächern und den
   Figuren-Cluster passend ausrichten. Läuft NICHT auf See-Karten. */
window.map3d_placeSpecialsAway = function(){
  if(IS_NAVAL || !window._tBanners) return;
  _tBanners.forEach((banner, key) => {
   try{
    const lt = LOGICAL_TERRITORIES.find(l => l.key === key);
    const pieceIds = lt ? lt.pieceIds : [key];
    let bpos = null, bRad = 0;
    for(const pid of pieceIds){
      if(_citiesMap.get(pid)){ bpos = _citiesMap.get(pid).position; bRad = 7.5; break; }
      if(_castlesMap.get(pid)){ bpos = _castlesMap.get(pid).position; bRad = 6; break; }
      // Häfen ebenfalls freihalten (z.B. Seestern: Truppe stand im Hafen)
      if(typeof _harborsMap !== 'undefined' && _harborsMap.get(pid)){ bpos = _harborsMap.get(pid).position; bRad = 5; break; }
    }
    const meshes = [];
    pieceIds.forEach(pid => (_meshById.get(pid) || []).forEach(m => meshes.push(m)));
    banner.userData.terrMeshes = meshes;   // für die Truppen-Aufstellung wiederverwenden
    const terrRadius = banner.userData.terrRadius || 6.5;
    /* Gebäude-Freiraum: Stadt-/Burg-Fußabdruck ist ~6.5–7.5 WE Radius
       (siehe CITY_SCALE-Kommentar bzw. _placeCastle-Skalierung) — 9 WE
       Sicherheitsabstand hält die Truppen-Aufstellung sauber daneben. */
    const BUILDING_CLEAR = 9;
    let dx, dz, angle, ox = 0, oz = 0;
    if(bpos){
      dx = banner.position.x - bpos.x; dz = banner.position.z - bpos.z;
      let d = Math.hypot(dx, dz);
      if(d < 0.5){ angle = _figHash(key)*Math.PI*2; dx = Math.sin(angle); dz = Math.cos(angle); }
      else { dx /= d; dz /= d; }
      /* Beste Ausweich-Richtung SUCHEN statt stur "gegenüber vom Gebäude":
         die Gegenrichtung zeigt auf Küstengebieten mit Hafen/Burg am Ufer
         (z.B. Nebelburg) oft direkt ins Wasser — der Versatz schrumpfte auf
         ~0, die buildingHit-Prüfung unten erzwang dann die Blase, obwohl im
         Gebiet anderswo reichlich Platz ist. Jetzt: 8 Richtungen um die
         Gegenrichtung fächern und die nehmen, deren (auf Land liegender)
         Zielpunkt am weitesten vom Gebäude wegführt. Passt die Gegenrichtung
         komplett, bleibt alles beim alten Verhalten. */
      const baseA = Math.atan2(dx, dz);
      const maxD = Math.min(BUILDING_CLEAR, Math.max(0, terrRadius - 2));
      let best = null;
      for(let k = 0; k < 8; k++){
        const a = baseA + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
        const adx = Math.sin(a), adz = Math.cos(a);
        let dist = maxD;
        while(dist > 0.3 && _terrainYOrNull(banner.position.x+adx*dist, banner.position.z+adz*dist, meshes) === null){ dist *= 0.7; }
        if(dist <= 0.3) dist = 0;
        // Wirksamkeit = Abstand des verschobenen Aufstellungs-Zentrums zum Gebäude
        const eff = Math.hypot(banner.position.x + adx*dist - bpos.x,
                               banner.position.z + adz*dist - bpos.z);
        if(!best || eff > best.eff) best = { a, adx, adz, dist, eff };
        if(k === 0 && dist >= maxD - 0.01) break;   // Gegenrichtung passt voll — nehmen
      }
      angle = best.a; dx = best.adx; dz = best.adz;
      /* Truppen so ZENTRAL wie möglich: nur so weit vom Gebäude wegrücken,
         dass die Gebietsmitte (Banner) neben dem Gebäude-Fußabdruck frei
         wird — NICHT mehr maximal weg (früher best.dist bis 9 WE, das schob
         die Truppen weit an den Rand). Sitzt das Gebäude ohnehin am Rand
         (dBuild groß), bleibt der Versatz 0 → Truppen exakt in der Mitte.
         Einzelne Figuren, die trotzdem ins Gebäude ragen, schiebt
         _layoutFigures per Freihaltezone heraus. */
      const dBuild = Math.hypot(banner.position.x - bpos.x, banner.position.z - bpos.z);
      const offMag = Math.min(best.dist, Math.max(0, bRad + 1.5 - dBuild));
      ox = dx*offMag; oz = dz*offMag;
      _fanSpecials(banner, dx, dz, meshes);
    } else {
      angle = Math.atan2(banner.position.x, banner.position.z);   // stabile Ausrichtung
      /* Auch ohne Gebäude flankieren die Spezials die (banner-zentrierte)
         Formation, statt auf ihrem festen Anfangsring mitten im Feld (oder
         über Wasser) zu stehen. */
      _fanSpecials(banner, Math.sin(angle), Math.cos(angle), meshes);
    }
    banner.userData.figAway = { angle, ox, oz };
    /* Gebäude-Position + Fußabdruck-Radius merken: _rebuildTroopFigures prüft
       damit, ob die Boden-Formation TROTZ Versatz noch ins Gebäude ragen
       würde (winzige Inseln wie Salzhafen — dort kann der Versatz nicht weit
       genug weg) und weicht dann auf die Blase aus. */
    banner.userData.buildingSpot = bpos ? { x: bpos.x, z: bpos.z, r: bRad } : null;
    /* Verfügbaren Aufstellungs-Radius am (verschobenen) Zentrum MESSEN statt
       pessimistisch "terrRadius − Versatz − 1.2" zu rechnen — die Subtraktion
       ließ auf Küstengebieten mit Gebäude (z.B. Nebelburg: Hafen) fast nichts
       übrig und erzwang die Blase trotz freier Fläche. Messung: 8 Ring-Punkte
       je Radius; der größte Radius, bei dem ≥6 von 8 auf dem Territorium
       liegen, zählt (eine angeschnittene Küstenseite ist ok — die
       Figuren-Raycasts in _layoutFigures ziehen dortige Figuren ohnehin auf
       Land zurück). Einmalig beim Spielaufbau, daher unkritisch teuer. */
    const fcx = banner.position.x + ox, fcz = banner.position.z + oz;
    const rMax = Math.max(2.2, terrRadius - 1.2);
    let fieldR = 2.2;
    for(let r = rMax; r >= 2.2; r -= Math.max(0.5, rMax/10)){
      let onLand = 0;
      for(let e = 0; e < 8; e++){
        const ea = e * Math.PI / 4;
        if(_terrainYOrNull(fcx + Math.cos(ea)*r, fcz + Math.sin(ea)*r, meshes) !== null) onLand++;
      }
      if(onLand >= 6){ fieldR = r; break; }
    }
    /* KEINE zusätzliche Kappung am Gebäude: das Gebäude ist eine
       Freihaltezone in _layoutFigures — einzelne Figuren, die hineinfielen,
       werden physisch herausgeschoben. Eine Radius-Kappung (dC − bRad)
       modellierte die Formation als Vollkreis bis zurück zum Gebäude und
       erzwang auf Gebäude-Gebieten (Nebelburg, Feuerflott) wieder die Blase,
       obwohl die Armee real bequem NEBEN das Gebäude passt. */
    banner.userData.figureFieldRadius = fieldR;
    /* Frisch berechnetes Aufstellungsfeld → Figuren-Signatur verwerfen: eine
       evtl. schon stehende Armee (mit Fallback-Feldradius aufgebaut) soll bei
       der nächsten Aktualisierung Boden/Blase mit den echten Werten neu
       entscheiden. */
    banner.userData._figSig = null;
    // Falls Figuren bereits stehen: neu ausrichten
    const fg = banner.userData.figuresGroup;
    if(fg && fg.children.length){ fg.position.set(ox, 0, oz); fg.rotation.y = angle; }
   }catch(e){ console.warn('[figures] placeSpecialsAway skip', key, e); }
  });
};

/* ── Berge aus Gebäude-/Truppenzonen räumen ─────────────────────────────
   Die Berge werden beim Skript-Start zufällig platziert — Städte, Burgen
   und die Truppen-Aufstellungsfelder entstehen aber erst beim Spielstart.
   Dieser Pass läuft danach (siehe renderMap): Berge, deren Fuß eine
   Freihaltezone schneidet, werden per Terrain-Raycast an eine freie Stelle
   DESSELBEN Territoriums verschoben; findet sich keine, wird der Berg
   ausgeblendet (besser eine Erhebung weniger als Burg im Fels). */
window.map3d_clearDecorObstructions = function(){
  if(window._decorObsDone || !_mountainMeshes.length) return;
  window._decorObsDone = true;

  const spots = [];
  try{ _citiesMap.forEach(c => { if(c && c.position) spots.push({x:c.position.x, z:c.position.z, r:7.5}); }); }catch(e){}
  try{ _castlesMap.forEach(c => { if(c && c.position) spots.push({x:c.position.x, z:c.position.z, r:6}); }); }catch(e){}
  try{ _harborsMap.forEach(c => { if(c && c.position) spots.push({x:c.position.x, z:c.position.z, r:5}); }); }catch(e){}
  try{
    if(window._tBanners) window._tBanners.forEach(b => {
      const fa = b.userData.figAway || {ox:0, oz:0};
      // Truppen-Aufstellungsfeld + der Spezialeinheiten-Fächer ums Banner
      spots.push({x:b.position.x + fa.ox, z:b.position.z + fa.oz, r:(b.userData.figureFieldRadius || 6.5) + 0.5});
      // Pfahl der Standarte selbst: nur ein schmaler Kern. Früher r:7 — zusammen
      // mit dem (praktisch deckungsgleichen) Truppenfeld-Spot deckte das fast die
      // ganze Karte ab, sodass kaum ein Berg noch einen freien Platz fand.
      spots.push({x:b.position.x, z:b.position.z, r:3.5});
    });
  }catch(e){}
  if(!spots.length) return;

  const _ray = new THREE.Raycaster(), _down = new THREE.Vector3(0,-1,0);
  const onTerr = (px, pz, mesh) => {
    _ray.set(new THREE.Vector3(px, 500, pz), _down);
    return _ray.intersectObject(mesh, true).length > 0;
  };
  const footFits = (px, pz, r, mesh) => {
    if(!onTerr(px, pz, mesh)) return false;
    for(let s = 0; s < 8; s++){
      const a = (s/8) * Math.PI * 2;
      if(!onTerr(px + Math.cos(a)*r, pz + Math.sin(a)*r, mesh)) return false;
    }
    return true;
  };
  const blocked = (px, pz, fr) => spots.some(s => {
    const dx = px - s.x, dz = pz - s.z;
    return dx*dx + dz*dz < (fr + s.r) * (fr + s.r);
  });

  let seed = 424242;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let moved = 0, shrunk = 0, hidden = 0;
  _mountainMeshes.forEach(m => {
    const fr = m.userData.footR || 4;
    if(!blocked(m.position.x, m.position.z, fr)) return;
    const t = m.userData.terr;
    let ok = false;
    if(t){
      const bb = new THREE.Box3().setFromObject(t);
      const midX = (bb.min.x + bb.max.x)/2, midZ = (bb.min.z + bb.max.z)/2;
      const halfW = (bb.max.x - bb.min.x)/2, halfD = (bb.max.z - bb.min.z)/2;
      /* Freien Platz im Gebiet suchen — zuerst in voller Größe, dann den Berg
         schrittweise verkleinern, damit er auch in schmale Lücken zwischen
         Standarten/Bauten passt. Lieber ein kleiner Berg als ein verschwundener. */
      for(let s = 1; s >= 0.4 && !ok; s -= 0.2){
        const frs = fr * s;
        for(let attempt = 0; attempt < 20 && !ok; attempt++){
          const tx = midX + (rand() - 0.5) * halfW * 1.15;
          const tz = midZ + (rand() - 0.5) * halfD * 1.15;
          if(blocked(tx, tz, frs)) continue;
          if(!footFits(tx, tz, frs * 1.6, t)) continue;
          m.position.x = tx; m.position.z = tz;
          if(s < 1){ m.scale.multiplyScalar(s); m.userData.footR = frs; shrunk++; }
          else moved++;
          ok = true;
        }
      }
    }
    /* Kein freier Platz gefunden: den Berg NICHT mehr ausblenden. Genau das
       ließ früher ganze Gebirge verschwinden — im dicht mit Standarten belegten
       Frostmark wurden so ~46 von ~53 Bergen versteckt und die Region wirkte
       kahl. Stattdessen deutlich verkleinert an Ort und Stelle stehen lassen:
       ein kleiner Berg neben einer Standarte ist rein kosmetisch (Klicks treffen
       weiterhin das Gebiets-Mesh, Figuren und Banner liegen darüber). */
    if(!ok){ m.scale.multiplyScalar(0.5); m.userData.footR = fr * 0.5; shrunk++; }
  });
  if(moved || shrunk || hidden) console.log('[decor] Berge aus Bau-/Truppenzonen:', moved, 'verschoben,', shrunk, 'verkleinert,', hidden, 'ausgeblendet');
};

/* Marker-Modus live umschalten (aus Optionen / In-Game-Menü). */
window.map3d_setMarkerMode = function(mode){
  window.WB_MARKER_MODE = (mode === 'banner') ? 'banner' : 'figures';
  if(typeof refreshMapVisuals === 'function') refreshMapVisuals();
};


/* ═══════════════════════════════════════════════════════════════════════
   HAUPTSTADT-SYSTEM — Originale Stadt aus objects.html, skaliert auf Karte
   Standarten stehen AUSSERHALB der Stadtmauern.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Hilfsfunktionen für Satteldächer (aus objects.html) ─────────── */
function makeSolidGabledRoofGeometry(w,d,h,overhang=7){
  const ww=w+overhang,dd=d+overhang;
  const hh=Math.min(h,Math.max(8,Math.min(w,d)*0.34));
  const geo=new THREE.BufferGeometry();
  const verts=new Float32Array([
    -ww/2,0,-dd/2,  ww/2,0,-dd/2,  ww/2,0,dd/2, -ww/2,0,dd/2,
     0,hh,-dd/2,  0,hh,dd/2
  ]);
  const idx=[0,1,2,0,2,3,0,4,1,3,2,5,0,3,5,0,5,4,1,4,5,1,5,2];
  geo.setAttribute("position",new THREE.BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}
function addLowGabledRoof_city(group,x,y,z,w,d,h,mat,rotY=0,overhang=5){
  const geo=makeSolidGabledRoofGeometry(w,d,h,overhang);
  const mesh=new THREE.Mesh(geo,mat);
  mesh.position.set(x,y,z); mesh.rotation.y=rotY;
  mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
  const dd=d+overhang,hh=Math.min(h,Math.max(8,Math.min(w,d)*0.34));
  const ridge=new THREE.Mesh(new THREE.BoxGeometry(3,3,dd+2),mat);
  ridge.position.set(x,y+hh+1.2,z); ridge.rotation.y=rotY;
  ridge.castShadow=true; group.add(ridge); return mesh;
}

/* ── Stadtmaterialien ─────────────────────────────────────────────── */
const cityStoneMat     = new THREE.MeshStandardMaterial({color:0x5f5a52,roughness:.92,metalness:.02});
const cityDarkStoneMat = new THREE.MeshStandardMaterial({color:0x302d29,roughness:.96,metalness:.02});
const cityWallMat      = new THREE.MeshStandardMaterial({color:0x4d4842,roughness:.95,metalness:.02});
const cityWoodMat      = new THREE.MeshStandardMaterial({color:0x4b301d,roughness:.94});
const cityRoofMat      = new THREE.MeshStandardMaterial({color:0x4a1e15,roughness:.88,side:THREE.DoubleSide});
const cityThatchRoofMat= new THREE.MeshStandardMaterial({color:0x78613b,roughness:.96,side:THREE.DoubleSide});
const cityWindowMat    = new THREE.MeshStandardMaterial({color:0xffbf5a,emissive:0xff8a25,emissiveIntensity:1.45,roughness:.35});
const citySpireMat     = new THREE.MeshStandardMaterial({color:0x3f1b16,roughness:.78,metalness:.02,side:THREE.DoubleSide});

function addCityBox(g,x,y,z,w,h,d,mat,rotY=0){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,y+h/2,z);m.rotation.y=rotY;m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}
function addCityCylinder(g,x,y,z,r,h,mat){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.04,h,16),mat);
  m.position.set(x,y+h/2,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}
function addCityRoof(g,x,y,z,w,d,h,mat,rotY=0){
  return addLowGabledRoof_city(g,x,y,z,w,d,h,mat,rotY,5);
}
function addCityBattlements(g,x,y,z,w,d,countX,countZ){
  const blockW=w/Math.max(countX,1)*.42,blockD=d/Math.max(countZ,1)*.42;
  for(let i=0;i<countX;i++){
    const px=x-w/2+(i+.5)*(w/countX);
    addCityBox(g,px,y,z-d/2,blockW,5.5,4,cityDarkStoneMat);
    addCityBox(g,px,y,z+d/2,blockW,5.5,4,cityDarkStoneMat);
  }
  for(let i=0;i<countZ;i++){
    const pz=z-d/2+(i+.5)*(d/countZ);
    addCityBox(g,x-w/2,y,pz,4,5.5,blockD,cityDarkStoneMat);
    addCityBox(g,x+w/2,y,pz,4,5.5,blockD,cityDarkStoneMat);
  }
}
function createCityHouse(g,x,z,w,d,h,rotY,roofMatChoice){
  const house=new THREE.Group();house.position.set(x,0,z);house.rotation.y=rotY;
  addCityBox(house,0,3,0,w,h,d,cityWoodMat);
  addCityBox(house,0,3+h*.50,0,w*1.02,h*.18,d*1.02,cityWoodMat);
  const postH=h-7;
  for(const px of[-w/2-.35,w/2+.35])for(const pz of[-d/2-.35,d/2+.35])
    addCityBox(house,px,5,pz,1.6,postH,1.6,cityDarkStoneMat);
  const bandY=4+h*.36;
  addCityBox(house,0,bandY,d/2+.45,w+1.6,1.5,1.2,cityDarkStoneMat);
  addCityBox(house,0,bandY,-d/2-.45,w+1.6,1.5,1.2,cityDarkStoneMat);
  addCityBox(house,-w/2-.45,bandY,0,1.2,1.5,d+1.6,cityDarkStoneMat);
  addCityBox(house,w/2+.45,bandY,0,1.2,1.5,d+1.6,cityDarkStoneMat);
  const upperBandY=4+h*.70;
  addCityBox(house,0,upperBandY,d/2+.35,w*.92,1.2,1.0,cityDarkStoneMat);
  addCityBox(house,0,upperBandY,-d/2-.35,w*.92,1.2,1.0,cityDarkStoneMat);
  addCityRoof(house,0,3+h-1,0,w,d,13,roofMatChoice);
  if(Math.random()>.25)addCityBox(house,w*.25,3+h+2,-d*.15,3.4,9,3.4,cityDarkStoneMat);
  if(w>18){
    addCityBox(house,-w*.22,13+h*.25,d/2+.8,4,5.5,1,cityWindowMat);
    addCityBox(house,w*.22,13+h*.25,d/2+.8,4,5.5,1,cityWindowMat);
  }else addCityBox(house,0,13+h*.25,d/2+.8,4,5.5,1,cityWindowMat);
  if(w>18){
    addCityBox(house,-w*.22,13+h*.25,-d/2-.8,4,5.5,1,cityWindowMat);
    addCityBox(house,w*.22,13+h*.25,-d/2-.8,4,5.5,1,cityWindowMat);
  }else addCityBox(house,0,13+h*.25,-d/2-.8,4,5.5,1,cityWindowMat);
  if(d>16){
    addCityBox(house,-w/2-.8,13+h*.25,0,1,5.5,4,cityWindowMat);
    addCityBox(house,w/2+.8,13+h*.25,0,1,5.5,4,cityWindowMat);
  }
  g.add(house);return house;
}
function createMarketStall_city(g,x,z,rotY=0){
  const stall=new THREE.Group();stall.position.set(x,0,z);stall.rotation.y=rotY;
  const cloth=new THREE.MeshStandardMaterial({color:Math.random()>.5?0x7b1e17:0xb99a5d,roughness:.8,side:THREE.DoubleSide});
  addCityBox(stall,0,3,0,18,4,10,cityWoodMat);
  for(const px of[-7,7])for(const pz of[-4,4])addCityBox(stall,px,7,pz,1.5,15,1.5,cityDarkStoneMat);
  const awning=new THREE.Mesh(new THREE.PlaneGeometry(22,14,1,1),cloth);
  awning.position.set(0,24,0);awning.rotation.x=-Math.PI/2;awning.castShadow=true;stall.add(awning);
  g.add(stall);
}

/* ── addLowHippedRoof: Walmdach-Hilfsfunktion ────────────────────── */
function addLowHippedRoof(group,x,y,z,w,d,h,mat,rotY=0,overhang=8){
  const ww=w+overhang, dd=d+overhang;
  const hh=Math.min(h,Math.max(8,Math.min(w,d)*.38));
  const geo=new THREE.BufferGeometry();
  const verts=new Float32Array([-ww/2,0,-dd/2, ww/2,0,-dd/2, ww/2,0,dd/2, -ww/2,0,dd/2, 0,hh,0]);
  const idx=[0,1,2,0,2,3,0,4,1,1,4,2,2,4,3,3,4,0];
  geo.setAttribute('position',new THREE.BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,mat);
  mesh.position.set(x,y,z); mesh.rotation.y=rotY;
  mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
}

/* ── Grand Capital (aus hauptstadt.html) ─────────────────────────── */
function _placeCapitalCity(cx,groundY,cz,scale){
  const g=new THREE.Group();
  g.scale.set(scale,scale,scale);

  const goldMat      =new THREE.MeshStandardMaterial({color:0xc7a04b,roughness:.42,metalness:.35});
  const marbleMat    =new THREE.MeshStandardMaterial({color:0x8f8878,roughness:.72,metalness:.04});
  const royalRoofMat =new THREE.MeshStandardMaterial({color:0x6c2118,roughness:.72,metalness:.03,side:THREE.DoubleSide});
  const slateRoofMat =new THREE.MeshStandardMaterial({color:0x1d2d38,roughness:.78,metalness:.02,side:THREE.DoubleSide});
  const roadMat2     =new THREE.LineBasicMaterial({color:0xd2b06d,transparent:true,opacity:.52});

  // 12-seitige Stadtbasis
  const cityBase=new THREE.Mesh(new THREE.CylinderGeometry(188,216,18,12),
    new THREE.MeshStandardMaterial({color:0x27241f,roughness:.97}));
  cityBase.position.y=9; cityBase.rotation.y=Math.PI/12;
  cityBase.castShadow=true; cityBase.receiveShadow=true; g.add(cityBase);

  // Gestufter Hügel / Akropolis
  const hill1=new THREE.Mesh(new THREE.CylinderGeometry(112,136,30,12),
    new THREE.MeshStandardMaterial({color:0x40372a,roughness:.96}));
  hill1.position.y=33; hill1.rotation.y=Math.PI/12;
  hill1.castShadow=true; hill1.receiveShadow=true; g.add(hill1);

  const hill2=new THREE.Mesh(new THREE.CylinderGeometry(70,92,24,12),
    new THREE.MeshStandardMaterial({color:0x574a36,roughness:.96}));
  hill2.position.y=60; hill2.rotation.y=Math.PI/12;
  hill2.castShadow=true; hill2.receiveShadow=true; g.add(hill2);

  // 12 Mauersegmente
  const wallRadius=166, wallOffset=Math.PI/12, ringVerts=[];
  for(let i=0;i<12;i++){
    const a=(Math.PI*2*i)/12+wallOffset;
    ringVerts.push({x:Math.sin(a)*wallRadius,z:Math.cos(a)*wallRadius,a});
  }
  for(let i=0;i<12;i++){
    const p1=ringVerts[i], p2=ringVerts[(i+1)%12];
    const mx=(p1.x+p2.x)/2, mz=(p1.z+p2.z)/2;
    const dx=p2.x-p1.x, dz=p2.z-p1.z;
    const segLen=Math.sqrt(dx*dx+dz*dz)-10;
    const angle=Math.atan2(-dz,dx);
    addCityBox(g,mx,22,mz,segLen,34,13,cityWallMat,angle);
    const bc=Math.max(4,Math.floor(segLen/16));
    for(let j=0;j<bc;j++){
      const t=(j+.5)/bc;
      addCityBox(g,p1.x+dx*t,56,p1.z+dz*t,7,8,11,cityDarkStoneMat,angle);
    }
  }

  // 12 Ecktürme
  for(let i=0;i<12;i++){
    const p=ringVerts[i];
    addCityCylinder(g,p.x,22,p.z,12,52,cityWallMat);
    addLowHippedRoof(g,p.x,74,p.z,28,28,12,i%2?royalRoofMat:slateRoofMat,0);
  }

  // Großes Stadttor (Süden)
  addCityBox(g,0,24,168,62,48,20,cityDarkStoneMat);
  addCityCylinder(g,-42,24,168,11,62,cityWallMat);
  addCityCylinder(g,42,24,168,11,62,cityWallMat);
  addLowHippedRoof(g,-42,86,168,26,26,12,royalRoofMat);
  addLowHippedRoof(g,42,86,168,26,26,12,royalRoofMat);
  const gate=new THREE.Mesh(new THREE.BoxGeometry(27,31,3),
    new THREE.MeshStandardMaterial({color:0x0e0705,roughness:.9}));
  gate.position.set(0,47,180); g.add(gate);

  // Radiale Straßen den Hügel hinauf
  function capitalRoad(pts){
    const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],p[2],p[1])));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(36)),roadMat2));
  }
  for(let i=0;i<12;i++){
    const a=(Math.PI*2*i)/12;
    capitalRoad([[Math.sin(a)*150,Math.cos(a)*150,32],[Math.sin(a)*92,Math.cos(a)*92,58],[Math.sin(a)*48,Math.cos(a)*48,74]]);
  }

  // Häuser: innere Hilfsfunktion
  function addCapitalHouse(xh,zh,yBase,w,d,h,rotY,roofMatChoice){
    const house=new THREE.Group();
    house.position.set(xh,yBase,zh); house.rotation.y=rotY;
    addCityBox(house,0,0,0,w,h,d,cityWoodMat);
    addCityBox(house,0,h*.48,0,w*1.03,h*.18,d*1.03,cityWoodMat);
    const postH=h-6;
    for(const px of[-w/2-.35,w/2+.35])for(const pz of[-d/2-.35,d/2+.35])
      addCityBox(house,px,3,pz,1.5,postH,1.5,cityDarkStoneMat);
    const bandY=2+h*.36;
    addCityBox(house,0,bandY,d/2+.4,w+1.4,1.4,1.0,cityDarkStoneMat);
    addCityBox(house,0,bandY,-d/2-.4,w+1.4,1.4,1.0,cityDarkStoneMat);
    addCityBox(house,-w/2-.4,bandY,0,1.0,1.4,d+1.4,cityDarkStoneMat);
    addCityBox(house,w/2+.4,bandY,0,1.0,1.4,d+1.4,cityDarkStoneMat);
    addCityRoof(house,0,h-1,0,w,d,11,roofMatChoice);
    addCityBox(house,-w*.22,h*.45,d/2+.8,4,5.5,1,cityWindowMat);
    addCityBox(house,w*.22,h*.45,d/2+.8,4,5.5,1,cityWindowMat);
    if(h>28)addCityBox(house,0,h*.72,d/2+.8,4,5.5,1,cityWindowMat);
    addCityBox(house,-w*.22,h*.45,-d/2-.8,4,5.5,1,cityWindowMat);
    addCityBox(house,w*.22,h*.45,-d/2-.8,4,5.5,1,cityWindowMat);
    if(d>16){addCityBox(house,-w/2-.8,h*.45,0,1,5.5,4,cityWindowMat);addCityBox(house,w/2+.8,h*.45,0,1,5.5,4,cityWindowMat);}
    g.add(house);
  }

  // Äußerer Wohnring
  for(let i=0;i<18;i++){
    const a=(Math.PI*2*i)/18+(i%2)*.07, r=105+(i%3)*8;
    addCapitalHouse(Math.sin(a)*r,Math.cos(a)*r,42,24+(i%3)*4,18+(i%2)*4,22+(i%4)*3,-a+Math.PI/2,i%3===0?royalRoofMat:cityThatchRoofMat);
  }
  // Mittlerer Adelsring auf dem Hügel
  for(let i=0;i<12;i++){
    const a=(Math.PI*2*i)/12+.14, r=67+(i%2)*5;
    addCapitalHouse(Math.sin(a)*r,Math.cos(a)*r,68,26,20,30+(i%3)*4,-a+Math.PI/2,i%2?royalRoofMat:slateRoofMat);
  }

  // Kronpalast auf dem Gipfel
  addCityBox(g,0,82,0,66,52,52,marbleMat);
  addCityBox(g,0,134,0,78,16,60,cityDarkStoneMat);
  addCityRoof(g,0,150,0,82,66,28,royalRoofMat);
  addCityCylinder(g,0,150,0,15,62,marbleMat);
  addLowHippedRoof(g,0,212,0,38,38,18,royalRoofMat);
  const crown=new THREE.Mesh(new THREE.SphereGeometry(8,16,12),goldMat);
  crown.position.set(0,270,0); crown.castShadow=true; g.add(crown);

  // Palastfenster
  for(const wx of[-24,-12,0,12,24]){
    addCityBox(g,wx,110,26.8,4,7,1.1,cityWindowMat);
    addCityBox(g,wx,128,26.8,4,7,1.1,cityWindowMat);
  }

  // Marktplätze
  for(const [px,pz] of[[0,70],[-55,22],[55,22],[0,-70]]){
    const plaza=new THREE.Mesh(new THREE.CircleGeometry(20,18),
      new THREE.MeshStandardMaterial({color:0x5b4b35,roughness:.92}));
    plaza.rotation.x=-Math.PI/2; plaza.position.set(px,71.5,pz);
    plaza.receiveShadow=true; g.add(plaza);
  }

  // Banner an 6 Seiten der Mauer — wehend (oben fest, Stoff schwingt)
  const bannerMat=_makeWavingFlagMat(0x7b1e17,'top');
  for(let i=0;i<12;i+=2){
    const a=(Math.PI*2*i)/12;
    const b=new THREE.Mesh(new THREE.PlaneGeometry(11,25,4,8),bannerMat);
    b.position.set(Math.sin(a)*142,75,Math.cos(a)*142); b.rotation.y=-a;
    b.castShadow=false; b.userData.flag=true; g.add(b);
  }

  // Beleuchtung
  const palaceLight=new THREE.PointLight(0xffa33d,1.25,300);
  palaceLight.position.set(0,150,0); g.add(palaceLight);
  const ringLight=new THREE.PointLight(0xff8a25,.55,230);
  ringLight.position.set(0,82,70); g.add(ringLight);

  // Rauch: dynamische Schornstein-Fahnen registrieren (globaler Aufbau via _buildSmoke)
  if(typeof _registerSmoke==='function'){
    for(const [sx,sz,sy] of[[-39,-31,59],[49,-40,62],[-6,42,54]]){
      _registerSmoke(cx + sx*scale, groundY + sy*scale, cz + sz*scale, 1.1);
    }
  }

  g.position.set(cx, groundY, cz);
  _compactGroup(g);
  scene.add(g);
  return g;
}

/* ── Hauptstädte: Haus → Territorium ─────────────────────────────── */
const FACTION_CAPITALS = (typeof __WB_MAP !== 'undefined' && __WB_MAP && __WB_MAP.capitals)
  ? __WB_MAP.capitals
  : { valen:'path25', mordrek:'path44', dravik:'path33', aerlund:'path62', sylverin:'path108', kael:'path90', vorthan:'path104' };

const _citiesMap = new Map();

/* ── Städte platzieren + Standarte außerhalb setzen ─────────────── */
/* ════════════════════════════════════════════════════════════════════
   LEBENDIGKEIT — wehende Flaggen (GPU) + aufsteigender Rauch (1 Draw-Call).
   Performance: Flaggen verschieben sich rein im Vertex-Shader (praktisch
   kostenlos); der Rauch ist EIN Points-System mit wenigen hundert Partikeln,
   die auf der CPU billig fortgeschrieben werden. Beides wirft keinen Schatten,
   damit die statische Schattenkarte gültig bleibt.
   ════════════════════════════════════════════════════════════════════ */
window._flagWind = { value: 0 };
function _makeWavingFlagMat(color, anchor){
  const m = new THREE.MeshStandardMaterial({ color: color, roughness:.72, side:THREE.DoubleSide });
  const freeExpr = (anchor === 'top') ? '(1.0 - uv.y)' : 'uv.x';  // feste Kante: oben bzw. links am Pfahl
  m.onBeforeCompile = function(shader){
    shader.uniforms.uFlagTime = window._flagWind;
    shader.vertexShader = 'uniform float uFlagTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'float _free = smoothstep(0.06, 1.0, ' + freeExpr + ');\n' +
      'float _w = sin(uFlagTime*3.0 + ' + freeExpr + '*9.0 + uv.y*3.0)*0.7\n' +
      '         + sin(uFlagTime*4.4 + ' + freeExpr + '*16.0)*0.3;\n' +
      'transformed += normal * (_w * _free * 2.6);\n' +   // Bauchung quer zur Fläche (orientierungsunabhängig)
      'transformed.x += _w * _free * 0.8;'                // leichtes seitliches Flattern
    );
  };
  return m;
}

/* — Rauch: globales Points-System — */
const _smokeEmitters = [];
let _smokeTex = null;
function _registerSmoke(x, y, z, scale){ _smokeEmitters.push({ x:x, y:y, z:z, scale:scale||1 }); }
function _resetSmoke(){
  _smokeEmitters.length = 0;
  if(window._smoke){
    scene.remove(window._smoke.points);
    window._smoke.geo.dispose();
    window._smoke.points.material.dispose();
    window._smoke = null;
  }
}
function _makeSmokeTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32,32,1, 32,32,31);
  g.addColorStop(0,   'rgba(232,232,228,0.95)');
  g.addColorStop(0.45,'rgba(205,205,200,0.45)');
  g.addColorStop(1,   'rgba(190,190,185,0.0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32,32,31,0,Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(c);
}
function _buildSmoke(){
  if(!_smokeEmitters.length) return;
  if(window._smoke){ scene.remove(window._smoke.points); window._smoke.geo.dispose(); }
  if(!_smokeTex) _smokeTex = _makeSmokeTexture();
  const PER = 6;                                   // Partikel je Schornstein
  const N   = _smokeEmitters.length * PER;
  const pos    = new Float32Array(N*3);
  const aAlpha = new Float32Array(N);
  const aSize  = new Float32Array(N);
  const data   = new Array(N);
  for(let e=0; e<_smokeEmitters.length; e++){
    const em = _smokeEmitters[e];
    for(let p=0; p<PER; p++){
      const i = e*PER + p;
      data[i] = { em:em, age:Math.random()*2.6, life:2.4 + Math.random()*1.8,
                  vy:5 + Math.random()*4, dx:(Math.random()-.5)*1.4, dz:(Math.random()-.5)*1.4,
                  spin:Math.random()*6.28 };
      pos[i*3]=em.x; pos[i*3+1]=em.y; pos[i*3+2]=em.z; aAlpha[i]=0; aSize[i]=1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('aAlpha',   new THREE.BufferAttribute(aAlpha,1));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(aSize,1));
  const mat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false,
    uniforms:{ uTex:{ value:_smokeTex } },
    vertexShader:
      'attribute float aAlpha; attribute float aSize; varying float vA;\n' +
      'void main(){ vA = aAlpha; vec4 mv = modelViewMatrix*vec4(position,1.0);\n' +
      '  gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));\n' +
      '  gl_Position = projectionMatrix*mv; }',
    fragmentShader:
      'uniform sampler2D uTex; varying float vA;\n' +
      'void main(){ vec4 t = texture2D(uTex, gl_PointCoord);\n' +
      '  float a = t.a * vA; if(a < 0.01) discard;\n' +
      '  gl_FragColor = vec4(t.rgb, a); }'
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; points.renderOrder = 6;
  scene.add(points);
  window._smoke = { points:points, geo:geo, data:data, pos:pos, aAlpha:aAlpha, aSize:aSize };
}
function _updateSmoke(delta){
  const S = window._smoke; if(!S) return;
  const d = S.data;
  for(let i=0; i<d.length; i++){
    const p = d[i]; p.age += delta;
    if(p.age > p.life){ p.age = 0; p.dx=(Math.random()-.5)*1.4; p.dz=(Math.random()-.5)*1.4; p.vy=5+Math.random()*4; }
    const t = p.age / p.life, em = p.em, sc = em.scale;
    S.pos[i*3]   = em.x + (p.dx*p.age + Math.sin(p.spin + p.age*1.4)*0.5) * sc;
    S.pos[i*3+1] = em.y + p.vy*p.age * sc;
    S.pos[i*3+2] = em.z + (p.dz*p.age) * sc;
    S.aAlpha[i]  = Math.sin(Math.PI * Math.min(1, t)) * 0.42;
    S.aSize[i]   = (2.5 + t*9.0) * sc;
  }
  S.geo.attributes.position.needsUpdate = true;
  S.geo.attributes.aAlpha.needsUpdate   = true;
  S.geo.attributes.aSize.needsUpdate    = true;
}

window.map3d_initCities = function(){
  if(!_meshById){ console.warn('[cities] _meshById not ready'); return; }
  if(typeof _resetSmoke === 'function') _resetSmoke();   // Rauch-System für (Neu-)Aufbau leeren
  const CITY_SCALE   = 0.050 * OBJ_SCALE;   // Stadtgröße (leicht vergrößert, war 0.045)
  const BANNER_DIST  = 7.5;     // Standarte außerhalb der Mauern (>4.6 WE)

  /* Einheitliche Gebäudegröße (kartenspezifisch, z.B. valcaryn): Statt jede Stadt
     einzeln an ihr Gebiet anzupassen (→ sichtbar unterschiedlich große Gebäude),
     bekommen alle Hauptstädte EINE gemeinsame Skala = die kleinste, die noch auf
     jedes Hauptstadt-Gebiet passt. Andere Karten (Welt etc.) behalten die
     individuelle Anpassung. */
  const UNIFORM_STRUCT = !!(typeof __WB_MAP !== 'undefined' && __WB_MAP && __WB_MAP.uniformStructureScale);

  /* Diese Hauptstädte an den GEBIETSRAND rücken statt auf den Schwerpunkt —
     mehr freie Fläche für die Truppen-Aufstellung. Richtung + Distanz werden
     automatisch bestimmt: 12 Richtungen abtasten und die Stadt so weit
     Richtung Grenze schieben, wie ihr Fußabdruck (Zentrum + Ring-Samples)
     noch komplett auf dem Territorium liegt; gewählt wird die Richtung mit
     dem größten Spielraum (= längste Gebietsachse). */
  const CITY_EDGE_FACS = new Set(['vorthan','aerlund','sylverin','kael',
                                  'dravik' /* Hauptstadt Donnerkamm */]);
  const CITY_FOOT = 6.5;   // Stadt-Fußabdruck-Radius fürs Land-Sampling (< ~7.5 WE Mauerring)

  /* 1. Durchlauf: Position + individuell passende Skala je Hauptstadt ermitteln. */
  const _cityPlan = [];
  Object.entries(FACTION_CAPITALS).forEach(([facKey, terrId])=>{
    const ms = _meshById.get(terrId) || [];
    if(!ms.length){ console.warn('[cities] No mesh for', terrId); return; }

    const bbox = new THREE.Box3();
    ms.forEach(m=>bbox.expandByObject(m));
    let cx = (bbox.min.x+bbox.max.x)*.5;
    let cz = (bbox.min.z+bbox.max.z)*.5;

    /* Zur Grenze schieben (nur die gewünschten Häuser). Die Richtung zurück
       zum Zentrum wird gemerkt — dort kommt die Standarte hin. */
    let edgeDir = null;
    if(CITY_EDGE_FACS.has(facKey)){
      const cityFits = (x, z) => {
        if(_terrainYOrNull(x, z, ms) === null) return false;
        for(let e = 0; e < 8; e++){
          const a = e * Math.PI / 4;
          if(_terrainYOrNull(x + Math.cos(a)*CITY_FOOT, z + Math.sin(a)*CITY_FOOT, ms) === null) return false;
        }
        return true;
      };
      let best = null;
      for(let k = 0; k < 12; k++){
        const a = k * Math.PI / 6;
        const dx = Math.sin(a), dz = Math.cos(a);
        let d = 0;
        for(let step = 2; step <= 40; step += 2){
          if(cityFits(cx + dx*step, cz + dz*step)) d = step; else break;
        }
        if(!best || d > best.d) best = { d, dx, dz };
      }
      if(best && best.d > 2){
        cx += best.dx * best.d;
        cz += best.dz * best.d;
        edgeDir = best;
        console.log('[cities]', facKey, 'Stadt an den Rand gerückt:', best.d, 'WE');
      }
    }
    const groundY = _getTerrainY(cx, cz, ms);

    /* Stadtgröße an die Gebietsgröße koppeln: kleine Länder (z.B. Deutschland
       auf der Welt-Karte) wurden vom fixen Stadt-Fußabdruck komplett verdeckt —
       die Stadt ragte über die Landesgrenzen. Darum den Maßstab so weit
       verkleinern, bis ein 8-Punkt-Ring auf dem Territorium liegt. Der Ring wird
       aber NICHT am Mauerrand geprüft, sondern bei CITY_CLEARANCE × Mauerradius —
       so bleibt die Stadt deutlich kleiner als das Land und rundum bleibt freies
       Land für die Truppen-Aufstellung übrig. Startwert = CITY_SCALE (große
       Länder bleiben unverändert, da der Ring dort sofort passt); Untergrenze
       25 %, damit die Stadt auf winzigen Gebieten nicht ganz verschwindet. */
    const CITY_FOOT_PER_SCALE = 7.5 / 0.045;   // ≈166.7 WE Fußabdruck-Radius je Skala-Einheit
    const CITY_CLEARANCE = 2.8;                // Prüfring = 2.8× Mauerrand → Stadt ≲ ⅓ des Landradius, Rest fürs Heer
    let cityScale = CITY_SCALE;
    for(let guard = 0; guard < 12; guard++){
      const rr = cityScale * CITY_FOOT_PER_SCALE * CITY_CLEARANCE;
      let fits = true;
      for(let e = 0; e < 8; e++){
        const a = e * Math.PI / 4;
        if(_terrainYOrNull(cx + Math.cos(a)*rr, cz + Math.sin(a)*rr, ms) === null){ fits = false; break; }
      }
      if(fits) break;
      cityScale *= 0.82;
      if(cityScale < CITY_SCALE*0.25){ cityScale = CITY_SCALE*0.25; break; }
    }

    _cityPlan.push({ facKey, terrId, ms, cx, cz, edgeDir, groundY, cityScale });
  });

  /* Gemeinsame Größe = kleinste passende Skala über alle Hauptstädte (nur wenn die
     Karte einheitliche Gebäude wünscht). Ist ein einzelnes Winzgebiet der
     Flaschenhals, hebt eine größere Hauptstadt-Wahl die gemeinsame Größe wieder an. */
  const cityUniform = _cityPlan.length
    ? _cityPlan.reduce((m, p) => Math.min(m, p.cityScale), CITY_SCALE)
    : CITY_SCALE;

  /* 2. Durchlauf: Städte bauen. */
  _cityPlan.forEach(({ facKey, terrId, ms, cx, cz, edgeDir, groundY, cityScale })=>{
    const scale = UNIFORM_STRUCT ? cityUniform : cityScale;
    const city = _placeCapitalCity(cx, groundY, cz, scale);
    city.userData.terrId  = terrId;
    city.userData.homeFac = facKey;
    _citiesMap.set(terrId, city);

    // Stadt als Dekoration registrieren → hebt sich mit dem Territorium beim Auswählen
    city.userData.baseY = groundY;
    const bestMesh = ms.reduce(function(best, m){
      if(!best) return m;
      const bb1 = new THREE.Box3().setFromObject(m);
      const bb2 = new THREE.Box3().setFromObject(best);
      const a1 = (bb1.max.x-bb1.min.x)*(bb1.max.z-bb1.min.z);
      const a2 = (bb2.max.x-bb2.min.x)*(bb2.max.z-bb2.min.z);
      return a1 > a2 ? m : best;
    }, null);
    if(bestMesh && typeof registerDecoration === "function"){
      registerDecoration(bestMesh, { kind: "mesh", mesh: city });
    }

    // Standarte außerhalb der Stadtmauern — bei an den Rand gerückten Städten
    // in Richtung Gebietszentrum (dort ist jetzt der Truppen-Platz), sonst
    // wie bisher östlich. Banner-Key über _pieceToTerritory ermitteln.
    const bdx = edgeDir ? -edgeDir.dx : 1, bdz = edgeDir ? -edgeDir.dz : 0;
    const bannerKey = (typeof _pieceToTerritory !== 'undefined' && _pieceToTerritory[terrId]) || terrId;
    const banner = _tBanners.get(bannerKey);
    if(banner){
      banner.position.x = cx + bdx * BANNER_DIST;
      banner.position.z = cz + bdz * BANNER_DIST;
      const bannerY = _getTerrainY(cx + bdx * BANNER_DIST, cz + bdz * BANNER_DIST, ms);
      banner.position.y = isNaN(bannerY) ? groundY : bannerY;
      banner.userData.baseY = banner.position.y;
      console.log('[cities] Banner für', terrId, '(key:', bannerKey, ') außerhalb gesetzt');
    } else {
      console.warn('[cities] Kein Banner für', terrId, '/ key:', bannerKey);
    }
  });
  console.log('[cities] Placed', _citiesMap.size, 'capital cities');
};


/* ═══════════════════════════════════════════════════════════════════════
   BURGEN & HÄFEN — Originalcode aus objects.html, auf Karte verteilt
   ═══════════════════════════════════════════════════════════════════════ */

const _objWoodMat  = new THREE.MeshStandardMaterial({color:0x3b2416,roughness:.85});
const _objMetalMat = new THREE.MeshStandardMaterial({color:0x8c7a61,roughness:.45,metalness:.75});

/* ── BURG: Materialien + Hilfsfunktionen ─────────────────────────────── */
const castleStoneMat     = new THREE.MeshStandardMaterial({color:0x6f6658,roughness:.88,metalness:.02});
const castleDarkStoneMat = new THREE.MeshStandardMaterial({color:0x3c3834,roughness:.92,metalness:.02});
const castleRoofMat      = new THREE.MeshStandardMaterial({color:0x3f1b16,roughness:.78,metalness:.02,side:THREE.DoubleSide});
const warmWindowMat      = new THREE.MeshStandardMaterial({color:0xffbf5a,emissive:0xff8a25,emissiveIntensity:1.8,roughness:.35});

function addCastleBox(g,x,y,z,w,h,d,mat){mat=mat||castleStoneMat;const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y+h/2,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function addCastleCylinder(g,x,y,z,r,h,mat){mat=mat||castleStoneMat;const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.06,h,18),mat);m.position.set(x,y+h/2,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function addBattlements(g,x,y,z,w,d,cX,cZ){
  const bW=w/cX*.45,bD=d/cZ*.45;
  for(let i=0;i<cX;i++){const px=x-w/2+(i+.5)*(w/cX);addCastleBox(g,px,y,z-d/2,bW,7,5,castleDarkStoneMat);addCastleBox(g,px,y,z+d/2,bW,7,5,castleDarkStoneMat);}
  for(let i=0;i<cZ;i++){const pz=z-d/2+(i+.5)*(d/cZ);addCastleBox(g,x-w/2,y,pz,5,7,bD,castleDarkStoneMat);addCastleBox(g,x+w/2,y,pz,5,7,bD,castleDarkStoneMat);}
}
function addWindow(g,x,y,z,rY){rY=rY||0;const m=new THREE.Mesh(new THREE.BoxGeometry(5,8,1.2),warmWindowMat);m.rotation.y=rY;m.position.set(x,y,z);g.add(m);return m;}
function addCastleCrenellations(g,x,y,z,w,d,mat){mat=mat||castleDarkStoneMat;
  const cX=Math.max(3,Math.round(w/12)),cZ=Math.max(3,Math.round(d/12));
  const bW=Math.max(5,w/cX*.45),bD=Math.max(5,d/cZ*.45);
  for(let i=0;i<cX;i++){const px=x-w/2+(i+.5)*(w/cX);addCastleBox(g,px,y,z-d/2+2.5,bW,7,5,mat);addCastleBox(g,px,y,z+d/2-2.5,bW,7,5,mat);}
  for(let i=0;i<cZ;i++){const pz=z-d/2+(i+.5)*(d/cZ);addCastleBox(g,x-w/2+2.5,y,pz,5,7,bD,mat);addCastleBox(g,x+w/2-2.5,y,pz,5,7,bD,mat);}
}
function addFlatParapetRoof(g,x,y,z,w,d,mat){mat=mat||castleDarkStoneMat;
  const p=new THREE.Mesh(new THREE.BoxGeometry(w,5,d),mat);p.position.set(x,y+2.5,z);p.castShadow=true;p.receiveShadow=true;g.add(p);
  addCastleCrenellations(g,x,y+5,z,w,d,mat);return p;
}

function _placeCastle(cx,groundY,cz,scale){
  scale=scale||0.065;
  const g=new THREE.Group();g.scale.set(scale,scale,scale);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(80,96,18,9),new THREE.MeshStandardMaterial({color:0x2a2926,roughness:.95}));
  base.position.y=9;base.castShadow=true;base.receiveShadow=true;g.add(base);
  addCastleBox(g,0,18,-52,130,30,12);addCastleBox(g,0,18,52,130,30,12);
  addCastleBox(g,-58,18,0,12,30,110);addCastleBox(g,58,18,0,12,30,110);
  addBattlements(g,0,48,-52,130,12,9,1);addBattlements(g,0,48,52,130,12,9,1);
  addBattlements(g,-58,48,0,12,110,1,8);addBattlements(g,58,48,0,12,110,1,8);
  for(const [tx,tz] of[[-58,-52],[58,-52],[-58,52],[58,52]]){addCastleCylinder(g,tx,18,tz,15,52);addFlatParapetRoof(g,tx,70,tz,30,30,castleDarkStoneMat);}
  addCastleBox(g,0,18,60,44,48,18,castleDarkStoneMat);
  addCastleCylinder(g,-27,18,60,10,58,castleStoneMat);addCastleCylinder(g,27,18,60,10,58,castleStoneMat);
  addFlatParapetRoof(g,-27,76,60,20,20,castleDarkStoneMat);addFlatParapetRoof(g,27,76,60,20,20,castleDarkStoneMat);
  const gate=new THREE.Mesh(new THREE.BoxGeometry(22,26,2),new THREE.MeshStandardMaterial({color:0x120d0a,roughness:.9}));gate.position.set(0,35,69.5);g.add(gate);
  addCastleBox(g,0,18,-8,54,70,50,castleStoneMat);addBattlements(g,0,88,-8,54,50,5,4);
  addCastleCylinder(g,0,88,-8,18,42,castleDarkStoneMat);addFlatParapetRoof(g,0,130,-8,36,36,castleDarkStoneMat);
  addCastleBox(g,-34,18,12,34,42,38,castleStoneMat);addCastleBox(g,34,18,12,34,42,38,castleStoneMat);
  for(const wx of[-14,0,14]){addWindow(g,wx,58,17.5);addWindow(g,wx,76,17.5);addWindow(g,wx,58,-33.5);addWindow(g,wx,76,-33.5);}
  for(const wx of[-38,38]){addWindow(g,wx,48,32.5);addWindow(g,wx,48,-8.5);}
  addWindow(g,-19,106,-8,Math.PI/2);addWindow(g,-19,120,-8,Math.PI/2);addWindow(g,19,106,-8,Math.PI/2);addWindow(g,19,120,-8,Math.PI/2);
  for(const gx of[-12,12]){addWindow(g,gx,42,69.5);addWindow(g,gx,42,50.5);}
  addWindow(g,-51.5,34,10,Math.PI/2);addWindow(g,-51.5,44,10,Math.PI/2);addWindow(g,51.5,34,10,Math.PI/2);addWindow(g,51.5,44,10,Math.PI/2);
  const fp=new THREE.Mesh(new THREE.CylinderGeometry(1,1,35,8),_objMetalMat);fp.position.set(0,158,-8);fp.castShadow=true;g.add(fp);
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(22,14,10,4),_makeWavingFlagMat(0x7b1e17,'left'));fl.position.set(11,166,-8);fl.rotation.y=Math.PI/2;fl.castShadow=false;fl.userData.flag=true;g.add(fl);

  g.position.set(cx,groundY,cz);_compactGroup(g);scene.add(g);return g;
}

/* ── HAFEN: Materialien + Hilfsfunktionen ───────────────────────────── */
function addHarborBox(g,x,y,z,w,h,d,mat,rotY){rotY=rotY||0;const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y+h/2,z);m.rotation.y=rotY;m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function addHarborCylinder(g,x,y,z,r,h,mat){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.08,h,10),mat);m.position.set(x,y+h/2,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function createHarborHouse(g,x,z,w,d,h,rotY,wM,rM,tM,lM){
  const house=new THREE.Group();house.position.set(x,0,z);house.rotation.y=rotY;
  for(const px of[-w/2+5,w/2-5])for(const pz of[-d/2+5,d/2-5])addHarborCylinder(house,px,-21,pz,1.5,27+Math.random()*5,tM);
  addHarborBox(house,0,6,0,w,h,d,wM);addHarborBox(house,-w*.08,6+h*.60,0,w*1.08,h*.24,d*1.04,wM);
  addHarborBox(house,-w/2-.4,8,0,2.4,h-3,d+2,tM);addHarborBox(house,w/2+.4,8,0,2.4,h-3,d+2,tM);
  addHarborBox(house,0,8+h*.52,-d/2-.5,w+4,2.8,2.2,tM);addHarborBox(house,0,8+h*.52,d/2+.5,w+4,2.8,2.2,tM);
  const b1=addHarborBox(house,-w*.22,16,-d/2-1.5,2.2,h*.62,2,tM);b1.rotation.z=.45;
  const b2=addHarborBox(house,w*.22,16,d/2+1.5,2.2,h*.62,2,tM);b2.rotation.z=-.45;
  addLowGabledRoof_city(house,0,6+h-1,0,w,d,18,rM,0,14);
  addHarborBox(house,w*.25,6+h+6,-d*.12,5,16,5,tM);
  const fZ=d/2+1.6,bZ=-d/2-1.6,lX=-w/2-1.6,rX=w/2+1.6;
  const y1=Math.max(10,h*.22),y2=Math.max(16,h*.42);
  for(const wx of[-w*.22,w*.24]){addHarborBox(house,wx,y1,fZ,5.5,6.5,.7,lM);addHarborBox(house,wx,y1,bZ,5.5,6.5,.7,lM);}
  addHarborBox(house,0,y2,fZ,6.2,7.2,.7,lM);addHarborBox(house,0,y2,bZ,6.2,7.2,.7,lM);
  addHarborBox(house,lX,y1+1,0,.7,6.5,5.5,lM);addHarborBox(house,rX,y1+1,0,.7,6.5,5.5,lM);
  addHarborBox(house,lX,y2-1,-d*.18,.7,6.5,5.5,lM);addHarborBox(house,rX,y2-1,d*.18,.7,6.5,5.5,lM);
  g.add(house);return house;
}
function createSmallBoat(g,x,z,rot){rot=rot||0;
  const bg=new THREE.Group();bg.position.set(x,-4,z);bg.rotation.y=rot;
  const hM=new THREE.MeshStandardMaterial({color:0x2b170e,roughness:.9});
  const sM=new THREE.MeshStandardMaterial({color:0xb8aa87,roughness:.8,side:THREE.DoubleSide});
  const hull=new THREE.Mesh(new THREE.BoxGeometry(18,7,42),hM);hull.position.y=4;hull.castShadow=true;bg.add(hull);
  const bow=new THREE.Mesh(new THREE.ConeGeometry(9,16,4),hM);bow.rotation.x=Math.PI/2;bow.position.set(0,4,-27);bow.castShadow=true;bg.add(bow);
  const stern=bow.clone();stern.rotation.x=-Math.PI/2;stern.position.z=27;bg.add(stern);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.4,42,8),_objWoodMat);mast.position.y=28;mast.castShadow=true;bg.add(mast);
  const sail=new THREE.Mesh(new THREE.PlaneGeometry(20,30,1,1),sM);sail.position.set(7,32,0);sail.rotation.y=Math.PI/2;sail.castShadow=true;bg.add(sail);
  g.add(bg);
}
function createLantern_h(g,x,y,z){
  const pM=new THREE.MeshStandardMaterial({color:0x21140c,roughness:.9});
  const gM=new THREE.MeshStandardMaterial({color:0xffc46a,emissive:0xff8a25,emissiveIntensity:1.6,roughness:.35});
  addHarborCylinder(g,x,y,z,.8,18,pM);
  const lp=new THREE.Mesh(new THREE.BoxGeometry(5,6,5),gM);lp.position.set(x,y+20,z);g.add(lp);

}
function createStoneHarborGate(g,sM,dsM){
  for(let i=0;i<7;i++){const x=-39+i*13,h=15+(i%3)*3;addHarborBox(g,x,6,76,11,h,13,sM,(Math.random()-.5)*.08);}
  addHarborCylinder(g,-45,6,76,9,31,sM);addHarborCylinder(g,45,6,76,9,31,sM);
  for(let i=0;i<5;i++)addHarborBox(g,-28+i*14,25+(i%2)*1.5,76,7,8+(i%2)*2,14,dsM);
  addHarborBox(g,0,8,84,22,20,2.5,new THREE.MeshStandardMaterial({color:0x0e0906,roughness:.95}));
}

function _placeHarbor(cx,groundY,cz,scale){
  scale=scale||0.052;
  const g=new THREE.Group();
  const pM=new THREE.MeshStandardMaterial({color:0x4b301d,roughness:.92});
  const dW=new THREE.MeshStandardMaterial({color:0x24150d,roughness:.94});
  const aW=new THREE.MeshStandardMaterial({color:0x5a3920,roughness:.96});
  const rH=new THREE.MeshStandardMaterial({color:0x341811,roughness:.9,side:THREE.DoubleSide});
  const sM=new THREE.MeshStandardMaterial({color:0x514d46,roughness:.95});
  const dS=new THREE.MeshStandardMaterial({color:0x302d2a,roughness:.98});
  const rp=new THREE.MeshStandardMaterial({color:0x7b6040,roughness:.96});
  const lM=new THREE.MeshStandardMaterial({color:0xffbd62,emissive:0xff8420,emissiveIntensity:1.35,roughness:.45});
  const cM=new THREE.MeshStandardMaterial({color:0x7b1e17,roughness:.7,side:THREE.DoubleSide});
  addHarborBox(g,0,0,20,96,6,118,pM);addHarborBox(g,-20,1,-26,70,5,36,pM);addHarborBox(g,36,1,8,42,5,50,pM);
  for(let i=-5;i<=5;i++)addHarborBox(g,i*9,6.2,20,1.1,1.2,116,dW,(i%2)*.015);
  for(const zl of[-35,-15,5,25,45,65])addHarborBox(g,0,6.4,zl,96,1,1,dW);
  for(const sx of[-42,-24,-6,12,30,48])for(const sz of[-28,0,28,56,82])addHarborCylinder(g,sx,-31,sz,2.1,31+((sx+sz)%4),dW);
  addHarborBox(g,0,-1,102,22,5,96,pM);
  for(const sz of[72,92,112,132,152,172]){addHarborCylinder(g,-8,-28,sz,1.7,29,dW);addHarborCylinder(g,8,-28,sz,1.7,29,dW);}
  addHarborBox(g,-62,0,46,52,4,18,pM);addHarborBox(g,62,0,60,52,4,18,pM);
  for(const px of[-84,-62,62,84]){addHarborCylinder(g,px,-24,46,1.7,25,dW);addHarborCylinder(g,px,-24,60,1.7,25,dW);}
  createHarborHouse(g,-25,-32,54,40,29,-.06,aW,rH,dW,lM);
  createHarborHouse(g,42,-10,36,32,24,.08,aW,rH,dW,lM);
  createHarborHouse(g,-62,35,30,28,22,-.12,aW,rH,dW,lM);
  createStoneHarborGate(g,sM,dS);
  addHarborCylinder(g,42,6,70,2.2,58,dW);addHarborBox(g,56,58,70,48,4,4,dW);
  addHarborCylinder(g,80,22,70,1.1,36,rp);addHarborBox(g,80,20,70,13,13,13,dW);
  for(let i=0;i<11;i++)addHarborBox(g,-52+i*10,6,42+(i%3)*4,7,7,7,dW,(i%2)*.1);
  for(let i=0;i<6;i++){const br=new THREE.Mesh(new THREE.CylinderGeometry(4,4,9,12),dW);br.rotation.z=Math.PI/2;br.position.set(-38+i*12,11,62+(i%2)*5);br.castShadow=true;g.add(br);}
  const rl=new THREE.LineBasicMaterial({color:0x7b6040,transparent:true,opacity:.75});
  function rope(pts){const cv=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2])));g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cv.getPoints(24)),rl));}
  rope([[-46,13,70],[-20,7,90],[10,12,112]]);rope([[48,13,76],[28,8,105],[8,12,138]]);rope([[-66,12,40],[-88,8,60],[-94,10,86]]);
  createLantern_h(g,-44,6,74);createLantern_h(g,44,6,74);createLantern_h(g,-10,4,144);createLantern_h(g,18,8,-38);
  createSmallBoat(g,-70,132,.18);createSmallBoat(g,70,142,-.22);
  const pp=new THREE.Mesh(new THREE.CylinderGeometry(.8,.9,34,8),_objMetalMat);pp.position.set(0,65,78);pp.castShadow=true;g.add(pp);
  const pn=new THREE.Mesh(new THREE.PlaneGeometry(18,10,10,3),_makeWavingFlagMat(0x7b1e17,'left'));pn.position.set(8,76,78);pn.rotation.y=Math.PI/2;pn.castShadow=false;pn.userData.flag=true;g.add(pn);
  g.scale.set(scale,scale,scale);
  g.position.set(cx,groundY,cz);
  _compactGroup(g);
  scene.add(g);return g;
}

/* ── Territorien: Burgen (nicht Hauptstädte!) + Häfen ─────────────── */
const _castlesMap = new Map();
const _harborsMap = new Map();
// Tatsächlich verbundene Hafenpaare ("a|b", sortiert) aus _connectHarborSeas —
// damit die visuellen Seerouten in map3d_initBridges exakt der Spiellogik folgen.
const _harborSeaLinkSet = new Set();

/* ═══ HAFEN-SEEVERBINDUNGEN ════════════════════════════════════════════════
   Häfen am selben Meer können sich gegenseitig angreifen (über Wasser).
   Gruppierung nach Lage: West / Ost / Süd / Mittelsee (zentral).
   Die Verbindungen werden in die logische Nachbarschaft (_logicalAdj)
   eingetragen, sodass Angriff & Bewegung sie automatisch erkennen. */
// Seeverbindungen, die unabhängig von der reinen Distanzformel immer gelten
// sollen (für Spiellogik UND die visuelle Route in map3d_initBridges).
// Kartenspezifisch, daher aus valcaryn.js bezogen statt hier hartkodiert.
const FORCE_HARBOR_LINKS = __WB_MAP.forceHarborLinks || [];
const HARBOR_SEAS = __WB_MAP.harborSeas || {};
function _connectHarborSeas(){
  if(typeof _logicalAdj === 'undefined') return;
  _harborSeaLinkSet.clear();
  // Hafen → Meer-Gruppe (explizite Gruppen haben Vorrang vor der Distanzlogik).
  const seaOf = {};
  Object.keys(HARBOR_SEAS).forEach(function(sea){
    (HARBOR_SEAS[sea] || []).forEach(function(id){ seaOf[id] = sea; });
  });

  const list = [];
  _harborsMap.forEach(function(obj, id){
    const r = REGIONS.find(x => x.id === id); if(!r) return;
    const k = _logKey(id); if(!k) return;
    // 3D-Position wie in map3d_initBridges (terrData): SVG cx/cy → Welt x/z.
    list.push({ id, k, cx: r.cx, cy: r.cy, x: (r.cx - CX) * MAP_SCALE, z: (r.cy - CY) * MAP_SCALE, sea: seaOf[id] || null });
  });

  const D = 115;       // Hafen-Reichweite über See (Zentroid-Distanz)
  const NEAR_MAX = 200;
  let edges = 0;
  function link(a, b){
    if(!a || !b || a.k === b.k) return;
    if(_logicalAdj[a.k] && _logicalAdj[b.k]){
      if(!_logicalAdj[a.k].has(b.k)) edges++;
      _logicalAdj[a.k].add(b.k); _logicalAdj[b.k].add(a.k);
      _harborSeaLinkSet.add([a.id, b.id].sort().join('|'));   // für die visuellen Seerouten
    }
  }

  /* Wasser-Check: die direkte Linie zwischen zwei Häfen muss über offenes Wasser
     verlaufen. Wir tasten die Strecke ab und werfen je Punkt einen Strahl nach
     unten gegen die Gelände-Meshes — trifft er fremdes Land (weder A noch B),
     kreuzt die Route Festland und ist KEINE Seeverbindung. Endpunkte (Uferzone)
     werden ausgelassen. Ohne Meshes (z. B. Tests) greift der reine Distanz-Fallback. */
  const _allTerr = (typeof _getAllTerrMeshes === 'function') ? _getAllTerrMeshes() : [];
  function _overWater(a, b){
    if(!_allTerr.length) return true;
    const own = (_meshById.get(a.id) || []).concat(_meshById.get(b.id) || []);
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    const steps = Math.max(4, Math.round(dist / 6));   // ~6 WE Abtastung
    for(let s = 1; s < steps; s++){
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      _terrainRay.set(new THREE.Vector3(x, 200, z), _terrainDir);
      const hits = _terrainRay.intersectObjects(_allTerr, false);
      for(let h = 0; h < hits.length; h++){
        if(own.indexOf(hits[h].object) === -1) return false;   // fremdes Land im Weg
      }
    }
    return true;
  }

  // 1) Explizite Meere: jeder Hafen verbindet sich mit allen anderen im selben Meer.
  for(let i=0;i<list.length;i++){
    for(let j=i+1;j<list.length;j++){
      if(list[i].sea && list[i].sea === list[j].sea) link(list[i], list[j]);
    }
  }
  // 2) Distanzbasiert NUR für ungruppierte Häfen — und ausschließlich über Wasser.
  const free = list.filter(function(h){ return !h.sea; });
  for(let i=0;i<free.length;i++){
    let nearest=null, nd=Infinity;
    for(let j=0;j<free.length;j++){
      if(i===j) continue;
      const d = Math.hypot(free[i].cx-free[j].cx, free[i].cy-free[j].cy);
      if(d >= NEAR_MAX) continue;
      if(!_overWater(free[i], free[j])) continue;    // Route kreuzt Festland → kein Seeweg
      if(d < D) link(free[i], free[j]);              // alle wassererreichbaren Häfen in Reichweite
      if(d < nd){ nd=d; nearest=free[j]; }
    }
    if(nearest) link(free[i], nearest);              // jeder Hafen mind. mit dem nächsten (über Wasser)
  }
  // 3) Erzwungene Verbindungen (Override, unabhängig von Gruppe/Wasser/Distanz).
  // Endpunkte notfalls direkt aus den Regionsdaten auflösen: forceHarborLinks
  // sind bewusst gesetzte Karten-Seewege und dürfen NICHT daran scheitern, dass
  // ein Hafen-3D-Objekt nicht platziert wurde (fehlt es in _harborsMap, wäre er
  // sonst nicht in `list` und der Link würde still verschluckt).
  function _harborNode(id){
    const found = list.find(x => x.id === id);
    if(found) return found;
    const r = REGIONS.find(x => x.id === id); if(!r) return null;
    const k = _logKey(id); if(!k) return null;
    return { id, k, cx: r.cx, cy: r.cy, x: (r.cx - CX) * MAP_SCALE, z: (r.cy - CY) * MAP_SCALE, sea: seaOf[id] || null };
  }
  FORCE_HARBOR_LINKS.forEach(function(pair){
    const a = _harborNode(pair[0]), b = _harborNode(pair[1]);
    if(a && b) link(a, b);
  });
  console.log('[harbors]', list.length, 'Häfen →', edges, 'Seekanten (Gruppen + Wasser-Distanz '+D+')');
}

function _registerObj(ms, obj){
  obj.userData.baseY = obj.position.y;
  const best = ms.reduce(function(b,m){
    if(!b) return m;
    const b1=new THREE.Box3().setFromObject(m), b2=new THREE.Box3().setFromObject(b);
    return(b1.max.x-b1.min.x)*(b1.max.z-b1.min.z)>(b2.max.x-b2.min.x)*(b2.max.z-b2.min.z)?m:b;
  }, null);
  if(best && typeof registerDecoration==='function')
    registerDecoration(best, {kind:'mesh', mesh:obj});
}

/* Alle Territorial-Meshes einmal sammeln (für Küstenerkennung) */
function _getAllTerrMeshes(){
  const all=[];
  if(_meshById) _meshById.forEach(function(arr){ all.push.apply(all,arr); });
  return all;
}

/* Küstenrichtung ermitteln: Winkel (rad) zum nächsten Wasser und Distanz.
   Gibt null zurück wenn das Territorium nicht an Wasser grenzt (< 20 WE). */
const _shoreRay = new THREE.Raycaster();
const _shoreDirDown = new THREE.Vector3(0,-1,0);
function _findShore(cx, cz, allMeshes){
  let bestAngle=null, bestDist=Infinity;
  for(let a=0;a<8;a++){
    const angle = a * Math.PI/4;
    const dx=Math.cos(angle), dz=Math.sin(angle);
    for(let d=2;d<=22;d+=2){
      const tx=cx+dx*d, tz=cz+dz*d;
      _shoreRay.set(new THREE.Vector3(tx,200,tz),_shoreDirDown);
      const hits=_shoreRay.intersectObjects(allMeshes,false);
      if(!hits.length){
        if(d<bestDist){bestDist=d;bestAngle=angle;}
        break;
      }
    }
  }
  return (bestAngle!==null && bestDist<=20) ? {angle:bestAngle,dist:bestDist} : null;
}

window.map3d_initCastlesAndHarbors = function(){
  if(!_meshById){ console.warn('[obj] _meshById not ready'); return; }

  /* AUSWAHL kommt FEST aus der aktiven Karte (valcaryn.js): map.harbors / map.castles.
     Es wird nichts mehr zufällig gesetzt; nur die Feinplatzierung der Modelle auf
     dem Territorium (Ufersuche/Versatz) bleibt geometrisch. Städte = Hauptstädte
     werden separat in map3d_initCities() gesetzt. */
  const _map = (typeof __WB_MAP !== 'undefined' && __WB_MAP) || {};
  const harborIds = Array.isArray(_map.harbors) ? _map.harbors : [];
  const castleIds = Array.isArray(_map.castles) ? _map.castles : [];
  if(!harborIds.length) console.warn('[obj] Keine harbors in der Karte definiert');
  if(!castleIds.length) console.warn('[obj] Keine castles in der Karte definiert');

  const capitalSet = new Set(Object.values(FACTION_CAPITALS));
  const allMeshes  = _getAllTerrMeshes();

  /* deterministischer Wert je Territorium — nur für Burg-Rotation/-Versatz,
     reihenfolgeunabhängig (die Auswahl selbst ist fest). */
  function _hash(id){ let h=2166136261; for(let i=0;i<id.length;i++){ h^=id.charCodeAt(i); h=Math.imul(h,16777619); } return ((h>>>0)%100000)/100000; }

  /* ── HÄFEN ──────────────────────────────────────────────────────── */
  // * OBJ_SCALE wie Städte/Burgen (CITY_SCALE/CASTLE_SC), sonst bleiben Häfen auf
  // Karten mit kleinem objectScale (z.B. Welt: 0.36) überdimensioniert stehen.
  const HARBOR_SC = 0.030 * OBJ_SCALE;   // Basis war 0.045 — Häfen deutlich verkleinert (~⅔)
  const pierLocalZ = 60;  // lokale Z-Mitte der Plattform vor dem Pier
  function _placeOneHarbor(id, ms, x, z, shore){
    const dx=Math.cos(shore.angle), dz=Math.sin(shore.angle);
    const setback = Math.max(0, shore.dist - pierLocalZ*HARBOR_SC - 1);
    const hx=x+dx*setback, hz=z+dz*setback;
    const gy=_getTerrainY(hx,hz,ms);
    const obj=_placeHarbor(hx,gy,hz,HARBOR_SC);
    obj.rotation.y = Math.PI/2 - shore.angle;  // lokales +z → Wasserrichtung
    obj.userData.terrId=id;
    _registerObj(ms,obj);
    _harborsMap.set(id,obj);
    // Schornstein-Rauch mit der Hafengröße mitskalieren (Höhe + Puff-Größe),
    // damit er am kleineren Hafen sitzt statt darüber zu schweben. Referenz 0.045.
    const _hSmk = HARBOR_SC/0.045;
    if(typeof _registerSmoke==='function') _registerSmoke(hx, gy+4.5*_hSmk, hz, 0.8*_hSmk);
    return obj;
  }
  /* Robuste Ufersuche: erst von der Mitte, sonst Raster über das Territorium. */
  function _forceShore(ms){
    const bb=new THREE.Box3(); ms.forEach(function(m){bb.expandByObject(m);});
    const cxm=(bb.min.x+bb.max.x)*.5, czm=(bb.min.z+bb.max.z)*.5;
    let sh=_findShore(cxm,czm,allMeshes);
    if(sh) return {x:cxm,z:czm,shore:sh};
    let best=null;
    for(let fx=0.2; fx<=0.8001; fx+=0.2){
      for(let fz=0.2; fz<=0.8001; fz+=0.2){
        const px=bb.min.x+(bb.max.x-bb.min.x)*fx;
        const pz=bb.min.z+(bb.max.z-bb.min.z)*fz;
        _shoreRay.set(new THREE.Vector3(px,200,pz),_shoreDirDown);
        if(!_shoreRay.intersectObjects(ms,false).length) continue;  // Punkt nicht auf Land
        const s=_findShore(px,pz,allMeshes);
        if(s && (!best || s.dist<best.shore.dist)) best={x:px,z:pz,shore:s};
      }
    }
    return best;
  }
  /* Ufer in einer Vorzugsrichtung suchen (für Südspitze → Mittelsee). */
  function _shoreInDir(cx,cz,angle){
    const dx=Math.cos(angle), dz=Math.sin(angle);
    for(let d=2; d<=60; d+=2){
      const tx=cx+dx*d, tz=cz+dz*d;
      _shoreRay.set(new THREE.Vector3(tx,200,tz),_shoreDirDown);
      if(!_shoreRay.intersectObjects(allMeshes,false).length) return {angle, dist:d};
    }
    return null;
  }

  /* Welche Gebiete sind küstennah (haben Wasser in der Nähe), unabhängig
     davon, ob dort ein Hafen-Modell steht? Wird für "Siegel der Kaperfahrt"
     gebraucht (Angriff von einem Hafen auf JEDES Küstengebiet). Einmaliger
     Scan beim Kartenaufbau, Ergebnis wird im Set zwischengespeichert. */
  window._coastalTerritoryIds = new Set();
  REGIONS.forEach(function(r){
    const ms=_meshById.get(r.id)||[];
    if(!ms.length) return;
    if(_forceShore(ms)) window._coastalTerritoryIds.add(r.id);
  });
  console.log('[obj] Küstengebiete erkannt:', window._coastalTerritoryIds.size, '/', REGIONS.length);

  harborIds.forEach(function(id){
    if(_harborsMap.has(id)) return;
    const ms=_meshById.get(id)||[];
    if(!ms.length){ console.warn('[obj] Kein Mesh für Hafen', id); return; }
    let spot=null;
    if(id==='path29'){
      // Hafen Richtung Mittelsee (zur zugehörigen Insel Krähenstein/path67) ausrichten
      const bb=new THREE.Box3(); ms.forEach(function(m){bb.expandByObject(m);});
      const cx=(bb.min.x+bb.max.x)*.5, cz=(bb.min.z+bb.max.z)*.5;
      const ms67=_meshById.get('path67')||[];
      if(ms67.length){
        const bb7=new THREE.Box3(); ms67.forEach(function(m){bb7.expandByObject(m);});
        const ang=Math.atan2((bb7.min.z+bb7.max.z)*.5 - cz, (bb7.min.x+bb7.max.x)*.5 - cx);
        const sh=_shoreInDir(cx,cz,ang);
        if(sh) spot={x:cx,z:cz,shore:sh};
      }
    }
    if(!spot) spot=_forceShore(ms);
    if(!spot){ console.warn('[obj] Kein Ufer für Hafen', id); return; }
    _placeOneHarbor(id, ms, spot.x, spot.z, spot.shore);
  });

  /* ── BURGEN ─────────────────────────────────────────────────────── */
  const CASTLE_SC = 0.055 * OBJ_SCALE;   // Burgen leicht vergrößert (war 0.05)
  const CASTLE_R = 4.5;  // Mauerradius in WE bei scale 0.05 (84 × 0.05)
  function _castleFits(tx, tz, ms){
    for(let a=0;a<4;a++){
      const ang=a*Math.PI/2;
      _shoreRay.set(new THREE.Vector3(tx+Math.cos(ang)*CASTLE_R,200,tz+Math.sin(ang)*CASTLE_R),_shoreDirDown);
      if(!_shoreRay.intersectObjects(ms,false).length) return false;
    }
    return true;
  }
  /* Versatz vom Zentrum — so weit wie möglich, aber Burg bleibt auf Territorium */
  function _offsetOnTerr(cx, cz, angle, ms){
    const dx=Math.cos(angle), dz=Math.sin(angle);
    let best={x:cx,z:cz};
    for(let d=0.5;d<=6;d+=0.5){
      const tx=cx+dx*d, tz=cz+dz*d;
      _shoreRay.set(new THREE.Vector3(tx,200,tz),_shoreDirDown);
      if(!_shoreRay.intersectObjects(ms,false).length) break;
      if(_castleFits(tx,tz,ms)) best={x:tx,z:tz};
      else break;
    }
    return best;
  }

  // Hash-Versatz ist deterministisch, aber "blind" gegenüber Brücken/sehr
  // unregelmäßigen Umrissen — auf manchen Gebieten landet die Burg dadurch
  // auf einer Brückenanbindung oder ragt über die Küste hinaus. Korrekturen
  // (fester Winkel/Versatz/Skalierung je Gebiet) sind kartenspezifisch,
  // daher aus valcaryn.js bezogen statt hier hartkodiert.
  const CASTLE_ANGLE_OVERRIDE = __WB_MAP.castleAngleOverride || {};
  const CASTLE_POS_OVERRIDE   = __WB_MAP.castlePosOverride   || {};
  const CASTLE_SCALE_OVERRIDE = __WB_MAP.castleScaleOverride || {};
  /* Einheitliche Gebäudegröße (kartenspezifisch, z.B. valcaryn): siehe
     map3d_initCities(). Alle Burgen ohne eigenen Skalierungs-Override bekommen
     EINE gemeinsame Skala statt jede einzeln ans Gebiet angepasst zu werden. */
  const UNIFORM_STRUCT = !!_map.uniformStructureScale;
  const CASTLE_FOOT_PER_SCALE = 4.5 / 0.05;   // 90 WE Fußabdruck-Radius je Skala-Einheit
  const CASTLE_CLEARANCE = 1.8;               // Prüfring > Mauerrand → Reserve fürs Heer

  /* Größte Skala, bei der der 4-Punkt-Mauerring noch komplett auf dem Land liegt. */
  function _castleFitScale(pt, ms){
    let scale = CASTLE_SC;
    for(let guard = 0; guard < 12; guard++){
      const rr = scale * CASTLE_FOOT_PER_SCALE * CASTLE_CLEARANCE;
      let fits = true;
      for(let a = 0; a < 4; a++){
        const ang = a * Math.PI / 2;
        _shoreRay.set(new THREE.Vector3(pt.x + Math.cos(ang)*rr, 200, pt.z + Math.sin(ang)*rr), _shoreDirDown);
        if(!_shoreRay.intersectObjects(ms, false).length){ fits = false; break; }
      }
      if(fits) break;
      scale *= 0.82;
      if(scale < CASTLE_SC*0.25){ scale = CASTLE_SC*0.25; break; }
    }
    return scale;
  }

  /* 1. Durchlauf: Platzierung + individuell passende Skala je Gebiet ermitteln.
     Wie bei den Städten: Burg an die Gebietsgröße koppeln, damit sie auf kleinen
     Ländern nicht über die Grenzen ragt. Handjustierte Overrides bleiben unangetastet. */
  const _castlePlan = [];
  castleIds.forEach(function(id){
    if(capitalSet.has(id)){ console.warn('[obj] Burg übersprungen (Hauptstadt):', id); return; }
    if(_harborsMap.has(id)){ console.warn('[obj] Burg übersprungen (hat Hafen):', id); return; }
    const ms=_meshById.get(id)||[];
    if(!ms.length){ console.warn('[obj] Kein Mesh für Burg', id); return; }
    const bb=new THREE.Box3(); ms.forEach(function(m){bb.expandByObject(m);});
    const cx=(bb.min.x+bb.max.x)*.5, cz=(bb.min.z+bb.max.z)*.5;
    const angle = CASTLE_ANGLE_OVERRIDE[id] != null ? CASTLE_ANGLE_OVERRIDE[id] : (_hash(id)*Math.PI*2);
    const posOv = CASTLE_POS_OVERRIDE[id];
    const pt = posOv ? { x: cx+posOv.dx, z: cz+posOv.dz } : _offsetOnTerr(cx,cz,angle,ms);
    const gy=_getTerrainY(pt.x,pt.z,ms);
    const ov = CASTLE_SCALE_OVERRIDE[id];
    const fitScale = (ov != null) ? ov : _castleFitScale(pt, ms);
    _castlePlan.push({ id, ms, pt, gy, angle, fitScale, override: ov != null });
  });

  /* Gemeinsame Größe = kleinste passende Skala über alle Burgen ohne eigenen
     Override. So sind sie gleich groß und ragen trotzdem nirgends über die Küste;
     ist ein Winzgebiet der Flaschenhals, hebt ein Skalierungs-Override dort die
     gemeinsame Größe für alle anderen wieder an. */
  let castleUniform = CASTLE_SC;
  if(UNIFORM_STRUCT){
    const auto = _castlePlan.filter(function(p){ return !p.override; });
    if(auto.length) castleUniform = auto.reduce(function(m,p){ return Math.min(m, p.fitScale); }, CASTLE_SC);
  }

  /* 2. Durchlauf: Burgen bauen. */
  _castlePlan.forEach(function(p){
    const scale = p.override ? p.fitScale : (UNIFORM_STRUCT ? castleUniform : p.fitScale);
    const obj=_placeCastle(p.pt.x,p.gy,p.pt.z,scale);
    obj.rotation.y=p.angle;
    obj.userData.terrId=p.id;
    _registerObj(p.ms,obj);
    _castlesMap.set(p.id,obj);
    if(typeof _registerSmoke==='function') _registerSmoke(p.pt.x, p.gy+9, p.pt.z, 0.9);
  });

  if(typeof _buildSmoke==='function') _buildSmoke();
  if(typeof _connectHarborSeas==='function') _connectHarborSeas();   // Häfen am selben Meer verbinden

  console.log('[obj] Platziert (fest aus Karte):',_castlesMap.size,'Burgen,',_harborsMap.size,'Häfen');
};

/* ── NAVAL-FLOTTE (nur Sturmsee) ──────────────────────────────────────
   Jedes Feld ist ein eigenes Territorium und trägt genau EIN Schiff mit einem
   Mast. Das Rahsegel IST das Banner: seine Textur (Hausfarbe + Wappen +
   Truppenzahl + Spezial-Chips) wird vom Besitzer bestimmt (map3d_updateBanners
   → window._navalSails). Kein schwebendes Banner-Tuch mehr. Kielwasser als
   schmale, auslaufende Schaumspur hinter dem Heck, Kanonenrauch auf einem Teil
   der Flotte. Alles nur aktiv, wenn IS_NAVAL. */
window._navalSails = new Map();   // lt.key -> sailMaterial (Segel = Banner)
window._navalHulls = new Map();   // lt.key -> [hullMaterial,...] (Owner-Färbung)
window._navalShipGroups = new Map();   // lt.key -> ship.group (für Auswahl-Anheben)
window._pieceLtKey = window._pieceLtKey || {};   // Stück-ID -> lt.key (für Auswahl-Glow)
let _navalBuilt = false;
window.map3d_initNavalFleet = function(){
  if(!IS_NAVAL || _navalBuilt) return;
  if(typeof territoryMeshById === 'undefined' || typeof LOGICAL_TERRITORIES === 'undefined') return;
  _navalBuilt = true;

  const fleetGroup = new THREE.Group();
  fleetGroup.name = 'navalFleet';
  scene.add(fleetGroup);
  /* Nur die Schiffsrümpfe sind die anklickbaren Marker (siehe tryPick). */
  window._navalShipPickables = [];

  function _nHash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return ((h>>>0)%100000)/100000; }

  // Weltmittelpunkt + Oberkante EINES Teilstücks. Bewusst territoryMeshById
  // (genau ein Mesh je Stück-ID), NICHT _meshById — letzteres fasst gleichnamige
  // Geschwister bereits zusammen, wodurch beide Stücke denselben Mittelpunkt
  // lieferten und die Fregatte nicht mehr entlang ihrer Achse ausrichtbar wäre.
  function pieceInfo(id){
    const m = territoryMeshById.get(id);
    if(!m) return null;
    const bb = new THREE.Box3().setFromObject(m);
    return {
      x:(bb.min.x+bb.max.x)/2, z:(bb.min.z+bb.max.z)/2, top:bb.max.y,
      minDim: Math.min(bb.max.x-bb.min.x, bb.max.z-bb.min.z)
    };
  }

  // Ein Kriegsschiff, Längsachse = +Z, Bug bei +Z. Gibt Gruppe + Segelmaterialien.
  const _wsDark = new THREE.MeshStandardMaterial({color:0x33210f, roughness:.9});
  const _wsMid  = new THREE.MeshStandardMaterial({color:0x5b3b20, roughness:.82});
  const _wsDeck = new THREE.MeshStandardMaterial({color:0x7c552a, roughness:.8});
  const _wsMast = new THREE.MeshStandardMaterial({color:0x2a1a0c, roughness:.92});
  function buildWarship(L){
    const g = new THREE.Group();
    const hullDark = _wsDark.clone();   // pro Schiff geklont, damit Owner-Färbung je Schiff wirkt
    const hullMid  = _wsMid.clone();
    const hullMats = [hullDark, hullMid];
    const hullW = Math.max(3.0, L*0.26);
    const hullH = Math.max(2.0, L*0.16);
    const bodyLen = L*0.62;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(hullW, hullH, bodyLen), hullDark);
    hull.position.y = hullH*0.5; hull.castShadow = hull.receiveShadow = true; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(hullW*0.5, L*0.28, 4), hullMid);
    bow.rotation.x = Math.PI/2; bow.rotation.z = Math.PI/4;
    bow.position.set(0, hullH*0.5, bodyLen*0.5 + L*0.14); bow.castShadow = true; g.add(bow);
    const stern = new THREE.Mesh(new THREE.ConeGeometry(hullW*0.52, L*0.16, 4), hullMid);
    stern.rotation.x = -Math.PI/2; stern.rotation.z = Math.PI/4;
    stern.position.set(0, hullH*0.55, -bodyLen*0.5 - L*0.08); stern.castShadow = true; g.add(stern);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(hullW*0.82, hullH*0.28, bodyLen*0.92), _wsDeck);
    deck.position.y = hullH*1.02; g.add(deck);
    const aft = new THREE.Mesh(new THREE.BoxGeometry(hullW*0.8, hullH*0.9, bodyLen*0.2), hullMid);
    aft.position.set(0, hullH*1.3, -bodyLen*0.34); aft.castShadow = true; g.add(aft);
    /* GENAU EIN Mast mittschiffs. Das Rahsegel IST das Banner: seine Textur
       (Hausfarbe + Wappen + Truppenzahl + Spezial-Chips) wird in
       map3d_updateBanners je nach Besitzer neu gezeichnet. */
    const mastH = L*0.78;
    const mz = bodyLen*0.04;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.3,L*0.022), Math.max(0.4,L*0.03), mastH, 8), _wsMast);
    mast.position.set(0, hullH + mastH*0.5, mz); mast.castShadow = true; g.add(mast);
    const sailW = hullW*1.75, sailH = mastH*0.66;
    const yardY = hullH + mastH*0.92;
    /* Segel-Billboard EXAKT wie ein Banner: eine Schwenkgruppe (Gieren um die
       Mastachse) + eine Nickgruppe (Kippen zur Kamerahöhe). Die Render-Schleife
       richtet beide zur Kamera aus → das Segel ist aus JEDEM Blickwinkel gut
       lesbar und liegt durch den Versatz nach +z (immer zur Kamera) stets VOR
       dem Mast. Das Rahsegel weht zusätzlich im Wind (Wind-Shader). */
    const sailSwivel = new THREE.Group(); sailSwivel.position.set(0, 0, mz); g.add(sailSwivel);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.15,L*0.012), Math.max(0.15,L*0.012), sailW*1.08, 6), _wsMast);
    yard.rotation.z = Math.PI/2; yard.position.set(0, yardY, 0); sailSwivel.add(yard);
    const sailPitch = new THREE.Group(); sailPitch.position.set(0, yardY, 0); sailSwivel.add(sailPitch);
    const sailMat = _makeSailMat(_makeSailTex('neutral', null, null), Math.max(0.9, sailW*0.16));
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(sailW, sailH, 16, 12), sailMat);
    sail.position.set(0, -sailH*0.5 - 0.2, Math.max(0.7, hullW*0.14));   // unter der Rah, nach +z (zur Kamera → vor den Mast)
    sail.castShadow = true; sailPitch.add(sail);
    /* Auswahl-Ring: flach auf der Wasserlinie um den Rumpf. Eigenständiger,
       garantiert sichtbarer Marker (unabhängig vom subtilen Rumpf-Glow) — wird
       in der Render-Schleife über selCur ein-/ausgeblendet und pulsiert. */
    const ringR = Math.max(9, L*0.85);
    const selRing = new THREE.Mesh(
      new THREE.RingGeometry(ringR*0.82, ringR, 40),
      new THREE.MeshBasicMaterial({ color:0xffd24a, transparent:true, opacity:0,
        side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending })
    );
    selRing.rotation.x = -Math.PI/2;   // flach in die XZ-Ebene legen
    selRing.position.y = 0.6;          // knapp über der Wasserlinie
    selRing.visible = false;
    g.add(selRing);
    // mastTop = Höhe der Mastspitze im Schiff-Lokalraum (Kiel = 0)
    return { group:g, sailMat:sailMat, sailSwivel:sailSwivel, sailPitch:sailPitch, yardY:yardY, hullMats:hullMats, mastTop: hullH + mastH, selRing:selRing };
  }

  const smokeSpots = [];
  const shipPos = new Map();   // lt.key -> {x,z,y} Schiffsmittelpunkt (für Seewege)
  let shipCount = 0;

  LOGICAL_TERRITORIES.forEach(lt => {
    const infos = lt.pieceIds.map(pieceInfo).filter(Boolean);
    if(!infos.length) return;
    let L, cx, cz, topY, angle;
    if(infos.length >= 2){
      infos.sort((a,b)=> (b.minDim||0)-(a.minDim||0));
      const a = infos[0], b = infos[1];
      cx = (a.x+b.x)/2; cz = (a.z+b.z)/2; topY = Math.max(a.top, b.top);
      const dx = b.x-a.x, dz = b.z-a.z;
      const dist = Math.hypot(dx,dz) || 12;
      L = Math.max(16, Math.min(40, dist*1.06));
      angle = Math.atan2(dx, dz);   // Bug (+Z) entlang a->b
    } else {
      const a = infos[0];
      cx = a.x; cz = a.z; topY = a.top;
      L = Math.max(12, Math.min(22, (a.minDim||14)*1.15));
      angle = _nHash(lt.key)*Math.PI*2;
    }
    const ship = buildWarship(L);
    ship.group.position.set(cx, topY, cz);
    ship.group.rotation.y = angle;
    fleetGroup.add(ship.group);
    window._navalSails.set(lt.key, ship.sailMat);
    window._navalHulls.set(lt.key, ship.hullMats);
    lt.pieceIds.forEach(pid => { window._pieceLtKey[pid] = lt.key; });
    /* Schiff anklickbar machen: Gruppe mit Repräsentativ-Stück taggen und in die
       Pick-Liste aufnehmen. tryPick löst Treffer → territoryMeshById[pickTerrId] auf. */
    ship.group.userData.pickTerrId = lt.pieceIds[0];
    ship.group.userData.navalLtKey = lt.key;
    /* Auswahl-Anheben: Basishöhe + Lerp-Zustand merken (Animation im Render-Loop) */
    ship.group.userData.baseY = topY;
    ship.group.userData.selCur = 0;
    ship.group.userData.selTarget = 0;
    ship.group.userData.bobPhase = _nHash(lt.key)*Math.PI*2;
    /* Segel-Billboard: Handles + Schiffswinkel + Material fürs Ausrichten/Aufleuchten */
    ship.group.userData.sailSwivel = ship.sailSwivel;
    ship.group.userData.sailPitch  = ship.sailPitch;
    ship.group.userData.yardY      = ship.yardY;
    ship.group.userData.shipAngle  = angle;
    ship.group.userData.sailMat    = ship.sailMat;
    ship.group.userData.selRing    = ship.selRing;   // Auswahl-Ring (Wasserlinie)
    window._navalShipGroups.set(lt.key, ship.group);
    window._navalShipPickables.push(ship.group);
    shipPos.set(lt.key, {x:cx, z:cz, y:topY, mastTop: topY + ship.mastTop});
    shipCount++;

    // Kielwasser hinter dem Heck: schmale, auslaufende Schaumspur (kein Block)
    const wakeG = new THREE.Group();
    wakeG.position.set(cx, topY+0.06, cz);
    wakeG.rotation.y = angle;
    const wakeMat = new THREE.MeshBasicMaterial({map:_wakeTex(), transparent:true, opacity:0.85, depthWrite:false, side:THREE.DoubleSide});
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(L*0.5, L*1.15), wakeMat);
    wake.rotation.x = -Math.PI/2; wake.position.z = -L*0.72; wake.renderOrder = 2;
    wakeG.add(wake);
    fleetGroup.add(wakeG);

    if(shipCount % 3 === 0) smokeSpots.push({x:cx, y:topY + L*0.35, z:cz});
  });

  /* Naval trägt KEIN schwebendes Banner-Tuch mehr — die Truppenzahl, das
     Wappen und die Spezial-Chips stehen direkt auf dem Rahsegel (siehe
     _makeSailTex / map3d_updateBanners). Die von map3d_initBanners angelegten
     _tBanners bleiben unsichtbar. */

  /* Seewege: zwischen benachbarten Schiffen (logische Adjazenz = mögliche
     Angriffs-/Bewegungswege) ein flaches Tau-/Steg-Band auf dem Wasser ziehen,
     damit erkennbar ist, welche Schiffe einen Übergang haben. Ein Band je Paar. */
  if(typeof _logicalAdj !== 'undefined'){
    const laneMat = new THREE.MeshBasicMaterial({
      color:0xe4c37a, transparent:true, opacity:0.55, depthWrite:false, side:THREE.DoubleSide
    });
    const laneEdgeMat = new THREE.MeshBasicMaterial({
      color:0x8a6a2e, transparent:true, opacity:0.5, depthWrite:false, side:THREE.DoubleSide
    });
    const drawn = new Set();
    let laneCount = 0;
    shipPos.forEach((pa, ka) => {
      const adj = _logicalAdj[ka];
      if(!adj) return;
      adj.forEach(kb => {
        const pb = shipPos.get(kb);
        if(!pb) return;
        const pair = ka < kb ? (ka+'|'+kb) : (kb+'|'+ka);
        if(drawn.has(pair)) return;
        drawn.add(pair);
        const dx = pb.x-pa.x, dz = pb.z-pa.z;
        const dist = Math.hypot(dx,dz);
        if(!dist) return;
        const laneG = new THREE.Group();
        laneG.position.set((pa.x+pb.x)/2, Math.max(pa.y, pb.y) + 0.25, (pa.z+pb.z)/2);
        laneG.rotation.y = Math.atan2(dx, dz);   // +Z entlang a->b
        // dunkler Unterzug + helleres Tau darüber (nur bis kurz vor die Rümpfe)
        const len = dist*0.78;
        const base = new THREE.Mesh(new THREE.PlaneGeometry(1.7, len), laneEdgeMat);
        base.rotation.x = -Math.PI/2; base.renderOrder = 1; laneG.add(base);
        const rope = new THREE.Mesh(new THREE.PlaneGeometry(0.7, len), laneMat);
        rope.rotation.x = -Math.PI/2; rope.position.y = 0.02; rope.renderOrder = 2; laneG.add(rope);
        fleetGroup.add(laneG);
        laneCount++;
      });
    });
    console.log('[naval] Seewege gezeichnet:', laneCount);
  }

  if(typeof _registerSmoke === 'function' && typeof _buildSmoke === 'function'){
    smokeSpots.forEach(s => _registerSmoke(s.x, s.y, s.z, 0.6));
    _buildSmoke();
  }
  console.log('[naval] Flotte platziert:', shipCount, 'Schiffe,', smokeSpots.length, 'Rauchquellen');
};

/* ── Holzbrücken + Seerouten visuell darstellen ───────────────────────
   Brücken: Holzfahrbahn mit Pfosten/Handlauf, flacher Bogen, Widerlager.
   Endpunkte per Raycast auf echte Geländehöhe gesetzt (EDGE_FRAC 0.46).
   Seerouten: Kubischer Bezier-Bogen vom Ufer ins offene Meer,
   mit Markerpunkten und gestrichelten Verbindungslinien. */
window.map3d_initBridges = function() {
  if(!_meshById) return;

  /* ── HOLZBRÜCKEN ── Paare kartenspezifisch, daher aus valcaryn.js ──── */
  const BRIDGE_PAIRS = __WB_MAP.bridgePairs || [];

  const regById = {};
  if (Array.isArray(REGIONS)) REGIONS.forEach(r => { regById[r.id] = r; });

  function terrData(id) {
    const ms = _meshById.get(id) || [];
    if (!ms.length) return null;
    const reg = regById[id];
    if (reg && reg.cx != null && reg.cy != null) {
      const grp = ms[0].userData.group;
      const grpData = MAP3D_REGIONS[grp];
      return { cx: (reg.cx - CX) * MAP_SCALE, cy: grpData ? grpData.height : 2.0, cz: (reg.cy - CY) * MAP_SCALE, meshes: ms };
    }
    const bb = new THREE.Box3();
    ms.forEach(m => bb.expandByObject(m));
    return { cx: (bb.min.x + bb.max.x) / 2, cy: bb.max.y, cz: (bb.min.z + bb.max.z) / 2, meshes: ms };
  }

  // Echte Geländehöhe per Raycast; Fallback = Kontinentplateau-Höhe
  function snapY(x, z, meshes, fallback) {
    _terrainRay.set(new THREE.Vector3(x, 200, z), _terrainDir);
    const hits = _terrainRay.intersectObjects(meshes, false);
    return hits.length ? hits[0].point.y : fallback;
  }

  // Küstenlinie statt fixem Prozentsatz finden: läuft vom Gebietsschwerpunkt
  // Richtung Nachbar und sucht per Bisektion die Stelle, an der der Strahl
  // nicht mehr auf das EIGENE Gebietsmesh trifft — das ist die echte Küste,
  // sodass die Brücke immer am Wasser beginnt statt mitten auf dem Land.
  function findShoreline(fromX, fromZ, toX, toZ, meshes) {
    const sample = (t) => {
      const x = fromX + (toX - fromX) * t, z = fromZ + (toZ - fromZ) * t;
      _terrainRay.set(new THREE.Vector3(x, 200, z), _terrainDir);
      const hits = _terrainRay.intersectObjects(meshes, false);
      return hits.length ? hits[0].point.y : null;
    };
    const y0 = sample(0);
    if (y0 == null) return null;               // Schwerpunkt selbst liegt nicht auf dem Mesh — Fallback nutzen
    if (sample(1) != null) return null;         // kein Wasser auf dem Weg zum Nachbarn — keine Brücke nötig
    let lo = 0, hi = 1, loY = y0;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const y = sample(mid);
      if (y != null) { lo = mid; loY = y; } else hi = mid;
    }
    return { x: fromX + (toX - fromX) * lo, z: fromZ + (toZ - fromZ) * lo, y: loY };
  }

  const woodMat  = new THREE.MeshStandardMaterial({ color: 0xA07040, roughness: 0.85, metalness: 0.0 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x6B4828, roughness: 0.90, metalness: 0.0 });
  const worldUp  = new THREE.Vector3(0, 1, 0);
  const m4   = new THREE.Matrix4();
  const quat = new THREE.Quaternion();

  const EDGE_FRAC  = 0.46;   // Fallback-Endpunkte, falls keine Küste gefunden wird
  const WATER_BASE = 0.1;
  const ANCHOR_OVERLAP = 1.6; // wie weit die Brücke übers Ufer hinaus aufs Land reicht
  const W      = 3.4;        // Brückenbreite
  const DT     = 0.48;       // Fahrbahndicke
  const POST_H = 1.1;        // Pfostenhöhe
  const POST_W = 0.22;       // Pfosten-Querschnitt

  BRIDGE_PAIRS.forEach(([idA, idB]) => {
    const a = terrData(idA), b = terrData(idB);
    if (!a || !b) return;

    const dx = b.cx - a.cx, dz = b.cz - a.cz;
    const len = Math.sqrt(dx*dx + dz*dz);
    if (len < 2) return;

    // Echte Küstenlinie je Seite suchen; nur falls das fehlschlägt auf die
    // alte feste 46%-Schätzung zurückfallen.
    const shoreA = findShoreline(a.cx, a.cz, b.cx, b.cz, a.meshes);
    const shoreB = findShoreline(b.cx, b.cz, a.cx, a.cz, b.meshes);
    const exA = shoreA ? shoreA.x : a.cx + dx * EDGE_FRAC;
    const ezA = shoreA ? shoreA.z : a.cz + dz * EDGE_FRAC;
    const exB = shoreB ? shoreB.x : b.cx - dx * EDGE_FRAC;
    const ezB = shoreB ? shoreB.z : b.cz - dz * EDGE_FRAC;

    // Die Brücke ein Stück über die gefundene Küstenlinie hinaus aufs Land
    // ziehen, damit das Widerlager sichtbar "verankert" wirkt statt genau an
    // der Kante zu enden. Richtung: von der Küste zurück zum Gebietszentrum.
    function pullOntoLand(ex, ez, towardX, towardZ, meshes, fallbackY) {
      const ddx = towardX - ex, ddz = towardZ - ez;
      const d = Math.hypot(ddx, ddz);
      const t = d > 0.001 ? Math.min(1, ANCHOR_OVERLAP / d) : 0;
      const nx = ex + ddx * t, nz = ez + ddz * t;
      return new THREE.Vector3(nx, snapY(nx, nz, meshes, fallbackY), nz);
    }
    const ptA = pullOntoLand(exA, ezA, a.cx, a.cz, a.meshes, a.cy);
    const ptB = pullOntoLand(exB, ezB, b.cx, b.cz, b.meshes, b.cy);

    const spanLen  = ptA.distanceTo(ptB);
    const midY     = (ptA.y + ptB.y) / 2;
    const archRise = Math.max(0.25, spanLen * 0.08);
    const curve = new THREE.QuadraticBezierCurve3(
      ptA,
      new THREE.Vector3((ptA.x + ptB.x) / 2, midY + archRise * 1.5, (ptA.z + ptB.z) / 2),
      ptB
    );

    // Segmentanzahl an die tatsächliche Spannweite koppeln, statt fest auf 12 —
    // sonst werden einzelne Bohlen breiter (W) als lang und die Brücke wirkt
    // wie ein Haufen quer gestapelter Brettchen statt wie eine durchgehende Fahrbahn.
    const SEGS = Math.max(4, Math.min(24, Math.round(spanLen / (W * 0.85))));
    const pts = curve.getPoints(SEGS);

    for (let i = 0; i < SEGS; i++) {
      const p0 = pts[i], p1 = pts[i+1];
      const segLen = Math.max(0.1, p0.distanceTo(p1)) + 0.04;
      const midPt  = p0.clone().lerp(p1, 0.5);

      const dir = p1.clone().sub(p0).normalize();
      let right = new THREE.Vector3().crossVectors(worldUp, dir);
      if (right.lengthSq() < 0.0001) right.set(1, 0, 0); else right.normalize();
      const corrUp = new THREE.Vector3().crossVectors(dir, right).normalize();

      m4.makeBasis(right, corrUp, dir);
      quat.setFromRotationMatrix(m4);

      // Fahrbahnbohle
      const deck = new THREE.Mesh(new THREE.BoxGeometry(W, DT, segLen), woodMat);
      deck.position.copy(midPt);
      deck.quaternion.copy(quat);

      // Seitenpfosten + Handlauf
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(POST_W, POST_H, POST_W), darkWood);
        post.position.set(sx * (W/2 - POST_W/2), (DT + POST_H) / 2, 0);
        deck.add(post);

        const rail = new THREE.Mesh(new THREE.BoxGeometry(POST_W * 0.8, POST_W * 0.8, segLen + 0.05), darkWood);
        rail.position.set(sx * (W/2 - POST_W/2), DT/2 + POST_H - POST_W * 0.35, 0);
        deck.add(rail);
      }

      // Querbalken zwischen den Pfosten (jedes zweite Segment)
      if (i % 2 === 0) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(W - POST_W * 2, 0.13, 0.13), darkWood);
        brace.position.set(0, DT/2 + POST_H * 0.5, 0);
        deck.add(brace);
      }

      scene.add(deck);
    }

    // Holzwiderlager: Mittelpfahl + Auflagerbalken — müssen quer zur Brücken-
    // richtung an JEDEM Ende ausgerichtet werden, sonst stehen sie immer
    // achsparallel zur Welt und wirken bei diagonal verlaufenden Brücken schief.
    function endQuat(dirVec) {
      let right = new THREE.Vector3().crossVectors(worldUp, dirVec);
      if (right.lengthSq() < 0.0001) right.set(1, 0, 0); else right.normalize();
      const corrUp = new THREE.Vector3().crossVectors(dirVec, right).normalize();
      const mm = new THREE.Matrix4().makeBasis(right, corrUp, dirVec);
      return new THREE.Quaternion().setFromRotationMatrix(mm);
    }
    const endPoints = [
      { pt: ptA, q: endQuat(pts[1].clone().sub(pts[0]).normalize()) },
      { pt: ptB, q: endQuat(pts[SEGS].clone().sub(pts[SEGS - 1]).normalize()) },
    ];
    for (const { pt, q } of endPoints) {
      const pileH = Math.max(0.3, pt.y - WATER_BASE + 0.12);
      const pile = new THREE.Mesh(new THREE.BoxGeometry(W * 0.42, pileH, 0.6), darkWood);
      pile.position.set(pt.x, WATER_BASE + pileH / 2, pt.z);
      pile.quaternion.copy(q);
      scene.add(pile);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.85, 0.36, 0.68), darkWood);
      cap.position.set(pt.x, pt.y + DT * 0.5, pt.z);
      cap.quaternion.copy(q);
      scene.add(cap);
    }
  });

  /* ── SEEROUTEN ─────────────────────────────────────────────────────── */
  const harborIds = Array.isArray((__WB_MAP||{}).harbors) ? __WB_MAP.harbors : [];
  const harborInfo = [];
  harborIds.forEach(id => {
    const hObj = _harborsMap.get(id);
    if(hObj) {
      // Wasserrichtung: lokales +Z des Hafenobjekts (rotation.y → Richtung ins Meer)
      const θ = hObj.rotation.y;
      harborInfo.push({ id, px: hObj.position.x, pz: hObj.position.z,
                        wx: Math.sin(θ), wz: Math.cos(θ) });
    } else {
      const ms = _meshById.get(id) || [];
      if(!ms.length) return;
      const bb = new THREE.Box3();
      ms.forEach(m => bb.expandByObject(m));
      const c = bb.getCenter(new THREE.Vector3());
      harborInfo.push({ id, px: c.x, pz: c.z, wx: 0, wz: -1 });
    }
  });

  const D_SEA   = 115;  // Verbindungsreichweite (entspricht _connectHarborSeas)
  const SEA_Y   = 0.7;
  const OUT_DIST = 20;  // Wegpunkt-Abstand vom Ufer ins offene Meer
  const STEPS = 24;
  const drawn = new Set();
  const _seaAllMeshes = _getAllTerrMeshes();

  // Einheitliche Optik statt zufälliger Farbtöne pro Route (die machten die
  // Karte zu einem unübersichtlichen Regenbogen). Stattdessen ZWEI klar
  // unterscheidbare Kategorien mit je EINER festen Farbe und geteiltem Material
  // (auch billiger im Draw-Call):
  //   • Hafen-Fernrouten – Schifffahrtswege über offenes Meer → warmes Gold,
  //     etwas kräftiger, mit sparsamen Wegpunkten.
  //   • Wasserübergänge / Meerengen zwischen benachbarten Ufern → kühles Cyan,
  //     dünner und ohne Punkte, damit die vielen kurzen Übergänge ruhig bleiben.
  const HARBOR_LANE_COLOR = 0xf2c879;
  const STRAIT_COLOR      = 0x7fd4e8;
  // Zwei Varianten für Hafen-Fernrouten:
  //  • Standard (depthTest an): die Route wird jetzt echt ums Land herumgeführt
  //    (siehe _buildSeaCurvePoints), sitzt also im Wasser und wird von davor
  //    liegendem Land korrekt verdeckt.
  //  • Overlay (depthTest aus, hohe renderOrder): NUR-Fallback für Routen, die
  //    zwangsläufig über eine Landzunge müssen (keine Wasserpassage gefunden) —
  //    damit sie nicht komplett verschluckt werden.
  const harborLaneMat    = new THREE.LineBasicMaterial({ color: HARBOR_LANE_COLOR, transparent: true, opacity: 0.9 });
  const harborLaneMatTop = new THREE.LineBasicMaterial({ color: HARBOR_LANE_COLOR, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const straitMat        = new THREE.LineBasicMaterial({ color: STRAIT_COLOR,      transparent: true, opacity: 0.7 });
  const harborDotMat     = new THREE.MeshBasicMaterial({ color: HARBOR_LANE_COLOR, transparent: true, opacity: 0.95 });
  const harborDotMatTop  = new THREE.MeshBasicMaterial({ color: HARBOR_LANE_COLOR, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const SEA_RENDER_ORDER = 5;

  // Wasserübergänge dürfen nur für spiellogisch tatsächlich bestehende
  // Nachbarschaften gezeichnet werden. Geblacklistete Paare sind bewusst KEINE
  // Verbindung (aus _logicalAdj entfernt) und ergäben sonst Phantom-Seewege.
  const _seaBlacklist = new Set((__WB_MAP.blacklist || []).map(([a,b]) => [a,b].sort().join('|')));

  // Eine reine "von A nach B"-Bezierkurve kann mitten über eine dazwischen-
  // liegende Landmasse/Insel führen. Hier wird die Route per Downward-Raycast
  // auf Landkollisionen geprüft und nötigenfalls seitlich (quer zur direkten
  // Verbindung) verschoben, bis sie vollständig über Wasser verläuft — die
  // Route weicht so der Landmasse aus, statt sie zu durchschneiden.
  function _curveHitsLand(pts){
    // Erste/letzte Punkte = die Hafenpositionen selbst, die liegen naturgemäß
    // an der Küste (treffen also fast immer Land) — nur den offenen Seeweg
    // dazwischen prüfen, sonst gilt JEDE Route sofort als "blockiert" und die
    // Ausweich-Suche unten findet nie eine gültige Variante.
    for(let i = 2; i < pts.length - 2; i++){
      const p = pts[i];
      _shoreRay.set(new THREE.Vector3(p.x, 200, p.z), _shoreDirDown);
      if(_shoreRay.intersectObjects(_seaAllMeshes, false).length) return true;
    }
    return false;
  }
  /* ── Land/Wasser-Raster (einmalig) ─────────────────────────────────────
     Damit Seewege echt UM Landmassen herumführen (statt nur seitlich versetzt
     zu werden), legen wir ein Raster über die Karte und markieren je Zelle per
     Downward-Raycast Land/Wasser. Das Raster wird EINMAL gebaut und von allen
     Routen geteilt — die Pfadsuche (A*) darauf braucht dann keine Raycasts. */
  const SEA_CELL = 5;
  const _gridBB = new THREE.Box3();
  _seaAllMeshes.forEach(m => _gridBB.expandByObject(m));
  // Wasser-Rand um die Landmasse, damit Routen außen um Landzungen herumführen
  // können (Zellen außerhalb des Rasters gelten als Wand → A* bleibt begrenzt).
  _gridBB.expandByScalar(35);
  const _gx0 = _gridBB.min.x - SEA_CELL, _gz0 = _gridBB.min.z - SEA_CELL;
  const _gW = Math.max(1, Math.ceil((_gridBB.max.x - _gridBB.min.x) / SEA_CELL) + 2);
  const _gH = Math.max(1, Math.ceil((_gridBB.max.z - _gridBB.min.z) / SEA_CELL) + 2);
  const _land = new Uint8Array(_gW * _gH);   // 1 = Land, 0 = Wasser
  if(_seaAllMeshes.length){
    for(let gj = 0; gj < _gH; gj++) for(let gi = 0; gi < _gW; gi++){
      const x = _gx0 + (gi + 0.5) * SEA_CELL, z = _gz0 + (gj + 0.5) * SEA_CELL;
      _shoreRay.set(new THREE.Vector3(x, 200, z), _shoreDirDown);
      _land[gj * _gW + gi] = _shoreRay.intersectObjects(_seaAllMeshes, false).length ? 1 : 0;
    }
  }
  const _isWater = (gi, gj) => gi >= 0 && gj >= 0 && gi < _gW && gj < _gH && _land[gj * _gW + gi] === 0;
  const _cellOf = (x, z) => [
    Math.max(0, Math.min(_gW - 1, Math.floor((x - _gx0) / SEA_CELL))),
    Math.max(0, Math.min(_gH - 1, Math.floor((z - _gz0) / SEA_CELL)))
  ];
  const _cellCenter = (gi, gj) => new THREE.Vector3(_gx0 + (gi + 0.5) * SEA_CELL, SEA_Y, _gz0 + (gj + 0.5) * SEA_CELL);
  // Häfen liegen am Ufer (Landzelle) → nächste Wasserzelle als Start/Ziel suchen.
  function _nearestWater(gi, gj){
    if(_isWater(gi, gj)) return [gi, gj];
    for(let r = 1; r <= 14; r++){
      for(let dj = -r; dj <= r; dj++) for(let di = -r; di <= r; di++){
        if(Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if(_isWater(gi + di, gj + dj)) return [gi + di, gj + dj];
      }
    }
    return null;
  }
  // Sichtlinie zwischen zwei Punkten komplett über Wasser? (fürs String-Pulling)
  function _losWater(a, b){
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.ceil(dist / (SEA_CELL * 0.5)));
    for(let i = 0; i <= n; i++){
      const t = i / n;
      if(!_isWater(..._cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t))) return false;
    }
    return true;
  }
  // A* über Wasserzellen (8-fach, oktil). Liefert geglättete Weltpunkte oder null.
  function _seaAStar(ha, hb){
    const s = _nearestWater(..._cellOf(ha.px, ha.pz));
    const g = _nearestWater(..._cellOf(hb.px, hb.pz));
    if(!s || !g) return null;
    const start = s[1] * _gW + s[0], goal = g[1] * _gW + g[0];
    const H = (i, j) => { const dx = Math.abs(i - g[0]), dy = Math.abs(j - g[1]); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const gScore = new Map([[start, 0]]);
    const fScore = new Map([[start, H(s[0], s[1])]]);
    const came = new Map();
    const open = [start], inOpen = new Set([start]);
    while(open.length){
      let bi = 0;
      for(let k = 1; k < open.length; k++) if((fScore.get(open[k]) ?? 1e9) < (fScore.get(open[bi]) ?? 1e9)) bi = k;
      const cur = open.splice(bi, 1)[0]; inOpen.delete(cur);
      if(cur === goal) break;
      const ci = cur % _gW, cj = (cur - ci) / _gW;
      for(let dj = -1; dj <= 1; dj++) for(let di = -1; di <= 1; di++){
        if(!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if(!_isWater(ni, nj)) continue;
        if(di && dj && (!_isWater(ci, nj) || !_isWater(ni, cj))) continue;   // keine Diagonale durch Land-Ecke
        const nIdx = nj * _gW + ni;
        const t = (gScore.get(cur) ?? 1e9) + (di && dj ? Math.SQRT2 : 1);
        if(t < (gScore.get(nIdx) ?? 1e9)){
          came.set(nIdx, cur); gScore.set(nIdx, t); fScore.set(nIdx, t + H(ni, nj));
          if(!inOpen.has(nIdx)){ open.push(nIdx); inOpen.add(nIdx); }
        }
      }
    }
    if(!came.has(goal) && start !== goal) return null;
    // Zellpfad rekonstruieren …
    const cells = [goal]; let c = goal;
    while(came.has(c)){ c = came.get(c); cells.push(c); }
    cells.reverse();
    let way = cells.map(idx => { const i = idx % _gW; return _cellCenter(i, (idx - i) / _gW); });
    // … und per String-Pulling auf möglichst wenige Stützpunkte reduzieren.
    const pulled = [way[0]];
    let anchor = 0;
    for(let i = 2; i < way.length; i++){
      if(!_losWater(way[anchor], way[i])){ pulled.push(way[i - 1]); anchor = i - 1; }
    }
    pulled.push(way[way.length - 1]);
    return pulled;
  }
  function _buildSeaCurvePoints(ha, hb){
    const P0 = new THREE.Vector3(ha.px, SEA_Y, ha.pz);
    const P3 = new THREE.Vector3(hb.px, SEA_Y, hb.pz);
    const baseP1 = new THREE.Vector3(ha.px + ha.wx * OUT_DIST, SEA_Y, ha.pz + ha.wz * OUT_DIST);
    const baseP2 = new THREE.Vector3(hb.px + hb.wx * OUT_DIST, SEA_Y, hb.pz + hb.wz * OUT_DIST);
    const mkPts = (p1, p2) => new THREE.CubicBezierCurve3(P0, p1, p2, P3).getPoints(STEPS);
    // 1) Direkte, leicht gebogene Route — wenn schon frei, die schönste Lösung.
    let pts = mkPts(baseP1, baseP2);
    if(!_curveHitsLand(pts)) return pts;
    // 2) Echte Umfahrung: A* durch Wasserzellen, dann als weiche Kurve glätten.
    const way = _seaAStar(ha, hb);
    if(way && way.length >= 2){
      const ctrl = [P0, ...way.slice(1, -1), P3];   // Enden exakt auf den Häfen
      const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal', 0.5);
      const n = Math.max(STEPS, Math.round(curve.getLength() / 6));
      const cp = curve.getPoints(n);
      cp.forEach(p => { p.y = SEA_Y; });
      return cp;
    }
    // 3) Fallback: alte seitliche Verschiebung.
    const abDir = new THREE.Vector3(hb.px - ha.px, 0, hb.pz - ha.pz).normalize();
    const perp  = new THREE.Vector3(-abDir.z, 0, abDir.x);
    for(let amt = 15; amt <= 90; amt += 15){
      for(const side of [1, -1]){
        const off = perp.clone().multiplyScalar(side * amt);
        const testPts = mkPts(baseP1.clone().add(off), baseP2.clone().add(off));
        if(!_curveHitsLand(testPts)) return testPts;
      }
    }
    return pts;  // keine kollisionsfreie Variante gefunden — Originalroute zeigen
  }

  const _forceLinkKeys = new Set(
    (typeof FORCE_HARBOR_LINKS !== 'undefined' ? FORCE_HARBOR_LINKS : []).map(([a,b]) => [a,b].sort().join('|'))
  );
  harborInfo.forEach(ha => {
    harborInfo.forEach(hb => {
      if(ha.id === hb.id) return;
      const key = [ha.id, hb.id].sort().join('|');
      if(drawn.has(key)) return;
      const d = Math.hypot(ha.px - hb.px, ha.pz - hb.pz);
      // Optik folgt der Spiellogik: nur Paare zeichnen, die _connectHarborSeas
      // tatsächlich verbunden hat (Meer-Gruppen + Wasser-Distanz). Fallback auf
      // die alte reine Distanzregel nur, falls das Set leer ist (Logik lief nicht).
      if(_harborSeaLinkSet.size){
        if(!_harborSeaLinkSet.has(key)) return;
      } else if(d > D_SEA && !_forceLinkKeys.has(key)) return;
      drawn.add(key);

      const curvePts = _buildSeaCurvePoints(ha, hb);
      const N = curvePts.length - 1;
      // Konnte die Route ums Land geführt werden? Dann normal (mit Tiefentest,
      // sauber vom Land verdeckt). Nur echte Landquerungen als Overlay obenauf.
      const overWater = !_curveHitsLand(curvePts);
      const lineMat = overWater ? harborLaneMat : harborLaneMatTop;
      const dotMat  = overWater ? harborDotMat  : harborDotMatTop;

      // Gestrichelte Linie (jeder zweite Abschnitt), einheitliches Gold.
      const dashPos = [];
      for(let i = 0; i + 1 <= N; i += 2) {
        const p = curvePts[i], q = curvePts[i+1];
        dashPos.push(p.x, SEA_Y, p.z, q.x, SEA_Y, q.z);
      }
      const dashGeo = new THREE.BufferGeometry();
      dashGeo.setAttribute('position', new THREE.Float32BufferAttribute(dashPos, 3));
      const laneLine = new THREE.LineSegments(dashGeo, lineMat);
      if(!overWater) laneLine.renderOrder = SEA_RENDER_ORDER;
      scene.add(laneLine);

      // Wenige, kleine Wegpunkte (~6 über die Route verteilt) — genug, um die
      // Fernroute als Schifffahrtsweg zu markieren, ohne die Karte zuzupflastern.
      const dotStep = Math.max(3, Math.round(N / 6));
      for(let i = 0; i <= N; i += dotStep) {
        const p = curvePts[i];
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.6, 5, 3), dotMat);
        dot.position.set(p.x, SEA_Y + 0.4, p.z);
        if(!overWater) dot.renderOrder = SEA_RENDER_ORDER;
        scene.add(dot);
      }
    });
  });

  /* ── WASSERÜBERGÄNGE ───────────────────────────────────────────────
     Viele Nachbar-Paare auf der Karte berühren sich nicht direkt, sondern
     sind durch offenes Wasser getrennt (Schären-Stücke EINES Gebiets wie
     Salzhafen_1/_2/_3, oder zwei verschiedene Ufer-Territorien über eine
     Meerenge). Dafür gab es bisher gar keine visuelle Markierung — anders
     als bei den Holzbrücken oben sind diese Lücken aber meist zu breit/
     offen für ein Bauwerk. Stattdessen: dieselbe dünne gestrichelte
     Linie + Punktmarker wie bei den Häfen-Seerouten, nur direkt zwischen
     den beiden Gebiets-Küstenlinien statt zwischen Hafenpositionen.
     Liste (kartenspezifisch, aus valcaryn.js) automatisch ermittelt: jedes
     Nachbar-Paar aus REGIONS, dessen Polygone (Kante-zu-Kante) mehr als
     0.5 WE Abstand haben — abzüglich der per Brücke verbundenen Paare und
     der in BLACKLIST bewusst entfernten "Nachbarn". */
  const WATER_CROSSING_PAIRS = __WB_MAP.waterCrossingPairs || [];
  let crossingsDrawn = 0;
  WATER_CROSSING_PAIRS.forEach(([idA, idB]) => {
    const a = terrData(idA), b = terrData(idB);
    if (!a || !b) return;
    const key = [idA, idB].sort().join('|');
    if (_seaBlacklist.has(key)) return;   // geblacklistet → spiellogisch keine Verbindung, keine Linie
    if (drawn.has(key)) return;   // schon über eine Hafen-Seeroute abgedeckt
    drawn.add(key);

    const dx = b.cx - a.cx, dz = b.cz - a.cz;
    const shoreA = findShoreline(a.cx, a.cz, b.cx, b.cz, a.meshes);
    const shoreB = findShoreline(b.cx, b.cz, a.cx, a.cz, b.meshes);
    const p0 = new THREE.Vector3(shoreA ? shoreA.x : a.cx + dx * EDGE_FRAC, SEA_Y, shoreA ? shoreA.z : a.cz + dz * EDGE_FRAC);
    const p3 = new THREE.Vector3(shoreB ? shoreB.x : b.cx - dx * EDGE_FRAC, SEA_Y, shoreB ? shoreB.z : b.cz - dz * EDGE_FRAC);
    if (p0.distanceTo(p3) < 0.5) return;  // praktisch identischer Punkt — nichts zu zeichnen

    const mid  = p0.clone().lerp(p3, 0.5);
    const diff = p3.clone().sub(p0);
    const perp = new THREE.Vector3(-diff.z, 0, diff.x).normalize();
    const bow  = Math.min(6, p0.distanceTo(p3) * 0.12);

    function curveFor(bend) {
      const ctrl = mid.clone().add(perp.clone().multiplyScalar(bend));
      return new THREE.QuadraticBezierCurve3(p0, ctrl, p3).getPoints(16);
    }
    let pts = curveFor(bow);
    if (_curveHitsLand(pts)) {
      for (let amt = 10; amt <= 50; amt += 10) {
        const left = curveFor(amt), right = curveFor(-amt);
        if (!_curveHitsLand(left)) { pts = left; break; }
        if (!_curveHitsLand(right)) { pts = right; break; }
      }
    }

    // Einheitliches Cyan, dünne gestrichelte Linie ohne Punkte — hält die
    // vielen kurzen Meerengen ruhig und klar von den goldenen Hafen-Fernrouten
    // unterscheidbar.
    const dashPos = [];
    for (let i = 0; i < pts.length - 1; i += 2) {
      const p = pts[i], q = pts[i + 1];
      dashPos.push(p.x, SEA_Y, p.z, q.x, SEA_Y, q.z);
    }
    const dashGeo = new THREE.BufferGeometry();
    dashGeo.setAttribute('position', new THREE.Float32BufferAttribute(dashPos, 3));
    scene.add(new THREE.LineSegments(dashGeo, straitMat));
    crossingsDrawn++;
  });

  console.log('[bridges+sea]', BRIDGE_PAIRS.length, 'Brücken,', drawn.size, 'Seerouten,', crossingsDrawn, 'Wasserübergänge');
};


/* ── Geometrien zusammenführen: reduziert Draw-Calls stark ──────
   Alle Meshes in einer Gruppe (inkl. Sub-Gruppen) werden nach
   Material zusammengefasst und zu einem Mesh pro Material vereint.
   Lines/Sprites bleiben unverändert.                              */
function _compactGroup(root) {
  const byMat = new Map();
  const tmpMat = new THREE.Matrix4();
  const tmpV   = new THREE.Vector3();
  const nMat   = new THREE.Matrix3();
  const linesToKeep = [];
  const flagsToKeep = [];

  function localMat(child) {
    const m = new THREE.Matrix4();
    let c = child;
    while(c && c !== root) { c.updateMatrix(); m.premultiply(c.matrix); c = c.parent; }
    return m;
  }

  root.traverse(function(child) {
    if(child === root) return;
    /* Flaggen NICHT zusammenführen: Geometrie bliebe verbacken (uv + Ausrichtung
       gingen verloren) und der Wehe-Shader würde brechen. Stattdessen die Flagge
       mit ihrer Welt-Lokal-Matrix als Transform (Geometrie unverändert) erhalten. */
    if(child.isMesh && child.userData && child.userData.flag){
      const lm = localMat(child);
      const nm = new THREE.Mesh(child.geometry, child.material);
      lm.decompose(nm.position, nm.quaternion, nm.scale);
      nm.castShadow = false; nm.receiveShadow = false;  // bewegt sich → kein statischer Schatten
      nm.userData.flag = true;
      flagsToKeep.push(nm); return;
    }
    if(child.isLine || child.isLineSegments || child.isSprite) {
      const lm = localMat(child);
      const geo = child.geometry.clone(); geo.applyMatrix4(lm);
      const ln  = new (child.isLine ? THREE.Line : THREE.LineSegments)(geo, child.material);
      linesToKeep.push(ln); return;
    }
    if(!child.isMesh || !child.geometry) return;

    const lm = localMat(child); nMat.getNormalMatrix(lm);
    const key = child.material.uuid;
    if(!byMat.has(key)) byMat.set(key, {mat:child.material, v:[], n:[]});
    const d = byMat.get(key);
    const geo = child.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const idx = geo.index;
    const cnt = idx ? idx.count : pos.count;

    for(let i=0;i<cnt;i++){
      const vi = idx ? idx.array[i] : i;
      tmpV.fromBufferAttribute(pos,vi).applyMatrix4(lm);
      d.v.push(tmpV.x,tmpV.y,tmpV.z);
      if(nor){ tmpV.fromBufferAttribute(nor,vi).applyNormalMatrix(nMat); d.n.push(tmpV.x,tmpV.y,tmpV.z); }
    }
  });

  while(root.children.length) root.remove(root.children[0]);

  byMat.forEach(function(d){
    if(!d.v.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.v), 3));
    if(d.n.length === d.v.length) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(d.n), 3));
    else g.computeVertexNormals();
    const m = new THREE.Mesh(g, d.mat);
    m.castShadow = true; m.receiveShadow = true;   // Strukturen werfen/empfangen Schatten
    root.add(m);
  });

  linesToKeep.forEach(function(l){ root.add(l); });
  flagsToKeep.forEach(function(f){ root.add(f); });
}

