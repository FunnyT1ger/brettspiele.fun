/* Lacuna — 3D table scene (Three.js). Pure presentation layer: game.js feeds
   it a plain snapshot via Lacuna3D.sync(payload) on every render(); this file
   never mutates game state and knows only which hand card sits under a given
   screen point (pickHandCard), used by game.js for tap-to-play. Table and
   cards are procedural primitives + canvas textures; player characters
   (chair + sit/stand pose included) are external GLB models, see
   CHAR_MODEL_FILES/SEAT_MODEL_FILES below.

   Large parts of the engine below (orbit camera, camera-anchored hand-fan
   HUD, seat ring + avatar rig, canvas-texture helpers, GLB character
   select/preview rig, GLB chair models) are adapted near-verbatim from
   games/levelup/game.render3d.js on this same site, which documents the
   underlying tricks (camera-space HUD conversion, hitbox/visual separation
   on hover, painter's-algorithm renderOrder for a fanned overlap) in much
   more detail — read that file's own top-of-file REUSE MAP if any of this
   needs changing. This file drops LevelUp's rules-specific layer entirely
   (piles/melds/lay-zones/drag-drop/flight animations) since Lacuna's
   interaction is simpler: a single shared "trick" area in the middle of the
   table, and tap-(not drag-)to-play. */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') { window.Lacuna3D = { mount(){}, sync(){}, pickHandCard(){ return null; }, loadCharacterThumbnails(){ return Promise.resolve({}); }, mountCharPreview(){}, setCharPreview(){ return Promise.resolve(); } }; return; }

  const SEAT_COLORS = ['#b98cff', '#ff9f4a', '#4fd8e0', '#ff6b6b', '#7bdc9c', '#6c8bff'];

  // Character-select meeples (real GLB models, chosen by each player before
  // joining the lobby — see game.js CHARACTERS/openCharSelect). id here must
  // match game.js's CHARACTERS[].id. The models themselves are the exact
  // same shared assets used by games/levelup/models/ on this site (copied
  // byte-for-byte into this game's own models/ folder — every game keeps its
  // own local copy, no cross-game asset sharing at runtime).
  //
  // Two GLBs per character (matches levelup's 2026-09-09 update: real chairs
  // instead of a procedural one, still per-character customizable):
  // - CHAR_MODEL_FILES (this map): SEATED pose, no chair geometry of its own
  //   — used ONLY for the table avatar, combined with a separate seat GLB
  //   (see SEAT_MODEL_FILES/instantiateSeat below).
  // - CHAR_STAND_MODEL_FILES (same ids, "_stand" suffix): standing full-body
  //   pose — used ONLY for the char-select grid/thumbnails/big preview,
  //   where showing a chair makes no sense.
  // Both poses share one convention: floor at raw y≈0, figure centered on
  // x=0, +z = facing forward (verified from each GLB's accessor min/max on
  // levelup, same asset set here). The sit-pose additionally shares that
  // convention with every SEAT_MODEL_FILES chair (see instantiateSitCharacter/
  // instantiateSeat below for how that lets any character sit on any chair
  // with zero per-pair tuning).
  const CHAR_MODEL_FILES = {
    zauberer: 'meeple_01_zauberer.glb', roboter: 'meeple_02_roboter.glb', pirat: 'meeple_03_pirat.glb',
    astronaut: 'meeple_04_astronaut.glb', koch: 'meeple_05_koch.glb', ninja: 'meeple_06_ninja.glb',
    wikinger: 'meeple_07_wikinger.glb', ritter: 'meeple_08_ritter.glb', cowgirl: 'meeple_09_cowgirl.glb',
    alien: 'meeple_10_alien.glb', detektiv: 'meeple_11_detektiv.glb', taucher: 'meeple_12_taucher.glb',
    koenigin: 'meeple_13_koenigin.glb', rockstar: 'meeple_14_rockstar.glb', feuerwehr: 'meeple_15_feuerwehr.glb',
    yeti: 'meeple_16_yeti.glb', pharao: 'meeple_17_pharao.glb', pilot: 'meeple_18_pilot.glb',
    vampir: 'meeple_19_vampir.glb', superheldin: 'meeple_20_superheldin.glb'
  };
  const CHAR_STAND_MODEL_FILES = Object.fromEntries(
    Object.entries(CHAR_MODEL_FILES).map(([id, file]) => [id, file.replace(/\.glb$/, '_stand.glb')])
  );
  // Six chairs (game.js SEATS/CHAR_DEFAULT_SEAT — a character gets a
  // thematic default seat but the player can override it, see
  // game.js selectSeat). Same floor-at-0/centered-on-x convention as the
  // sit-pose characters above; every model's own seat-surface submesh tops
  // out at the same raw y=0.46 (per levelup's verification of this same
  // asset set), which is what makes any character+seat pairing work without
  // per-pair tuning.
  const SEAT_MODEL_FILES = {
    holzstuhl: 'seat_01_holzstuhl.glb', thron: 'seat_02_thron.glb', technik: 'seat_03_technik.glb',
    fass: 'seat_04_fass.glb', hocker: 'seat_05_hocker.glb', baumstumpf: 'seat_06_baumstumpf.glb'
  };
  const DEFAULT_SEAT_ID = 'holzstuhl';
  // Standing-pose preview height (char-select only — unrelated to the
  // seated table avatar, which uses the sit-pose GLBs at their own native
  // scale, see instantiateSitCharacter below). The stand-pose source models
  // are exported at wildly inconsistent raw scales/origins — loadCharacterModel()
  // normalizes every model the same way (centered x/z, feet at local y=0,
  // scaled to this fixed height) so they drop into the preview rig
  // interchangeably.
  const CHAR_TARGET_HEIGHT = 0.85;
  // id -> Promise<THREE.Group>. Each resolved group is a normalized "master"
  // that is NEVER added to a live scene directly — every use (char-select
  // thumbnail, big preview, seated avatar) adds a .clone(true) instead, so
  // geometry/materials stay shared (cheap) while each instance gets its own
  // transform. Because of that sharing, code that removes a clone from a
  // scene must plain .remove() it, never run it through the disposing
  // clearGroup()/disposeMeshLike() below.
  const characterCache = {};
  function loadCharacterModel(id) {
    if (characterCache[id]) return characterCache[id];
    const file = CHAR_STAND_MODEL_FILES[id];
    characterCache[id] = new Promise((resolve, reject) => {
      if (!file || typeof THREE.GLTFLoader !== 'function') { reject(new Error('no character loader')); return; }
      new THREE.GLTFLoader().load('models/' + file, gltf => {
        const raw = gltf.scene;
        const box = new THREE.Box3().setFromObject(raw);
        const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
        const rawH = Math.max(0.01, box.max.y - box.min.y);
        raw.position.set(-cx, -box.min.y, -cz);
        const wrap = new THREE.Group();
        wrap.add(raw);
        wrap.scale.setScalar(CHAR_TARGET_HEIGHT / rawH);
        wrap.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        resolve(wrap);
      }, undefined, reject);
    });
    return characterCache[id];
  }
  function instantiateCharacter(id) { return loadCharacterModel(id).then(master => master.clone(true)); }

  // Seated-table versions: NO recentering/rescaling, unlike loadCharacterModel
  // above — both the sit-pose character and every seat GLB were authored in
  // the same shared raw meter space (floor at y=0, x centered on 0, seat
  // surface at raw y=0.46 — see SEAT_MODEL_FILES comment), so simply adding
  // both as children of the same anchor at identity transform already lines
  // them up. Two separate caches (sit-pose character, seat) since either can
  // vary independently once the player overrides the default seat.
  const sitCharacterCache = {};
  function loadSitCharacterModel(id) {
    if (sitCharacterCache[id]) return sitCharacterCache[id];
    const file = CHAR_MODEL_FILES[id];
    sitCharacterCache[id] = new Promise((resolve, reject) => {
      if (!file || typeof THREE.GLTFLoader !== 'function') { reject(new Error('no character loader')); return; }
      new THREE.GLTFLoader().load('models/' + file, gltf => {
        const raw = gltf.scene;
        raw.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        resolve(raw);
      }, undefined, reject);
    });
    return sitCharacterCache[id];
  }
  function instantiateSitCharacter(id) { return loadSitCharacterModel(id).then(master => master.clone(true)); }
  const seatCache = {};
  function loadSeatModel(id) {
    if (seatCache[id]) return seatCache[id];
    const file = SEAT_MODEL_FILES[id];
    seatCache[id] = new Promise((resolve, reject) => {
      if (!file || typeof THREE.GLTFLoader !== 'function') { reject(new Error('no seat loader')); return; }
      new THREE.GLTFLoader().load('models/' + file, gltf => {
        const raw = gltf.scene;
        raw.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        resolve(raw);
      }, undefined, reject);
    });
    return seatCache[id];
  }
  function instantiateSeat(id) { return loadSeatModel(id).then(master => master.clone(true)); }

  // Small standalone lighting/camera rig shared by the char-select grid
  // thumbnails and the big preview canvas — both just need "one normalized
  // meeple, nicely lit, framed the same way", independent of the main table
  // scene/renderer/camera.
  function ensurePreviewRig(canvasEl, w, h) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(1.2, 2, 1.6); scene.add(key);
    const rim = new THREE.DirectionalLight(0xc0a8ff, 0.4); rim.position.set(-1.5, 0.6, -1); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(32, w / h, 0.05, 10);
    camera.position.set(0, 0.62, 1.45);
    camera.lookAt(0, 0.42, 0);
    return { renderer, scene, camera };
  }
  function renderCharacterFrame(rig, id) {
    return instantiateCharacter(id).then(inst => {
      rig.scene.add(inst);
      rig.renderer.render(rig.scene, rig.camera);
      rig.scene.remove(inst);
      return true;
    });
  }
  // Renders all characters once each into a shared offscreen canvas and
  // returns {id: dataURL}. Sequential rather than parallel — keeps GPU/
  // memory pressure low for what's a one-off, cached-after-first-open cost.
  function loadCharacterThumbnails() {
    const size = 192;
    const off = document.createElement('canvas'); off.width = size; off.height = size;
    const rig = ensurePreviewRig(off, size, size);
    const out = {};
    let chain = Promise.resolve();
    Object.keys(CHAR_STAND_MODEL_FILES).forEach(id => {
      chain = chain.then(() => renderCharacterFrame(rig, id)).then(() => { out[id] = rig.renderer.domElement.toDataURL('image/png'); });
    });
    return chain.then(() => { rig.renderer.dispose(); return out; }, err => { rig.renderer.dispose(); throw err; });
  }
  // Big, re-rendered-on-select preview shown next to the char-select grid.
  // Mounted once and reused across open/cancel/reopen cycles.
  let bigPreviewRig = null, lastPreviewId = null;
  function mountCharPreview(canvasEl) {
    if (bigPreviewRig && bigPreviewRig.canvas === canvasEl) { resizeCharPreview(); return; }
    const rect = canvasEl.getBoundingClientRect();
    const w = Math.max(64, Math.round(rect.width || 220)), h = Math.max(64, Math.round(rect.height || 220));
    bigPreviewRig = Object.assign(ensurePreviewRig(canvasEl, w, h), { canvas: canvasEl });
  }
  function resizeCharPreview() {
    if (!bigPreviewRig) return;
    const rect = bigPreviewRig.canvas.getBoundingClientRect();
    const w = Math.max(64, Math.round(rect.width || 220)), h = Math.max(64, Math.round(rect.height || 220));
    bigPreviewRig.renderer.setSize(w, h, false);
    bigPreviewRig.camera.aspect = w / h;
    bigPreviewRig.camera.updateProjectionMatrix();
  }
  function setCharPreview(id) {
    lastPreviewId = id;
    if (!bigPreviewRig) return Promise.resolve();
    return renderCharacterFrame(bigPreviewRig, id);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => { if (bigPreviewRig && lastPreviewId) { resizeCharPreview(); renderCharacterFrame(bigPreviewRig, lastPreviewId); } });
  }

  // Card "decade" palette (0..6 = Math.floor(value/10)) — purely cosmetic
  // grouping, not a game-relevant color like a suit; a light-spectrum
  // gradient to fit Lacuna's "gap/rift" theme.
  const DECADE_HEX = ['#ff6b6b', '#ff9f4a', '#ffd166', '#7bdc9c', '#4fd8e0', '#6c8bff', '#c07bff'];
  const DECADE_BG_LIGHT = ['#fff0ee', '#fff3e6', '#fff8df', '#eafff3', '#e8fdff', '#eef1ff', '#f6ecff'];
  const DECADE_INK = ['#5a0f0f', '#5a2c00', '#5a4400', '#04240f', '#00303a', '#0b1a4a', '#2c0a4a'];

  const CARD_W = 0.22, CARD_H = 0.305, CARD_T = 0.008;
  const TABLE_R = 1.55, TABLE_OVAL = 0.8, TABLE_TOP_Y = 0.72;
  const SURFACE_Y = TABLE_TOP_Y + 0.05;
  const SEAT_RX = 2.2, SEAT_RZ = 1.8;
  // The procedural chair (seat disc + legs + backrest) that used to live here
  // is gone (real chair models instead, still per-character customizable —
  // see SEAT_MODEL_FILES/game.js SEATS, matching levelup's 2026-09-09
  // update). Seats are now just an empty floor anchor at y=0 in the avatar
  // group's local frame — a seat model's own geometry sits on it, and a
  // sit-pose character model sits on top of THAT (see setSeatCharacter
  // below, which loads both per player and adds them side by side at
  // identity transform — no extra vertical offset needed, they share one raw
  // coordinate space by construction, see SEAT_MODEL_FILES comment).
  // FALLBACK_MEEPLE_FLOOR_OFFSET keeps the still-present procedural fallback
  // meeple (used for bots / while a model loads / on load failure) grounded
  // at the same floor level without having to re-tune every one of its
  // individual mesh y-positions, which were originally authored relative to
  // the old chair's seat top rather than the floor.
  const FALLBACK_MEEPLE_FLOOR_OFFSET = 0.485;
  // Real sit-pose character + seat models both sit squarely on the floor
  // (local y=0) at identity transform, see instantiateSitCharacter/
  // instantiateSeat above — characterMount itself therefore needs no extra
  // offset either.
  const CHAR_SEAT_Y = 0, CHAR_SEAT_Z = 0;
  const SEAT_SPOT_INTENSITY = 1.3, SEAT_SPOT_DISTANCE = 3.4, SEAT_SPOT_ANGLE = THREE.MathUtils.degToRad(32),
    SEAT_SPOT_PENUMBRA = 0.7, SEAT_SPOT_DECAY = 1.6;

  const ORBIT_TARGET = new THREE.Vector3(0, 0.62, 0);
  const ORBIT_RADIUS_DEFAULT = 2.7, ORBIT_RADIUS_MIN = 1.9, ORBIT_RADIUS_MAX = 3.9;
  const ORBIT_ELEV_DEFAULT = THREE.MathUtils.degToRad(54), ORBIT_ELEV_MIN = THREE.MathUtils.degToRad(38), ORBIT_ELEV_MAX = THREE.MathUtils.degToRad(74);
  const ORBIT_AZ_MAX = THREE.MathUtils.degToRad(62);
  const ORBIT_AZ_SENSITIVITY = 0.0055, ORBIT_EL_SENSITIVITY = 0.0045, ORBIT_ZOOM_SENSITIVITY = 0.0016;
  const ORBIT_EASE = 0.12;
  const WOBBLE_AXIS = new THREE.Vector3(0, 1, 0);

  // Hand fan docked to the camera (Tabletop-Simulator-style HUD) — see
  // levelup/game.render3d.js for the full derivation of every constant here.
  const HAND_SCALE = 1.25, HAND_TILT_X = 1.15, HAND_Z = -1.55, HAND_Y = -0.38;
  const HAND_CARD_RENDER_BASE = 100, HAND_CARD_RENDER_HOVER = 5000;
  const HOVER_LIFT_Y = 0.42, HOVER_FORWARD_Z = 0.14;
  const HAND_TILT_COS = Math.cos(HAND_TILT_X), HAND_TILT_SIN = Math.sin(HAND_TILT_X);
  const FAN_BOW_SCREEN_Y = 0.62;
  const FAN_ROLL_AXIS = new THREE.Vector3(0, HAND_TILT_SIN, HAND_TILT_COS);
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const _fanRollQuat = new THREE.Quaternion();
  const _fanTiltQuat = new THREE.Quaternion();

  const TRICK_GAP = CARD_W * 0.95;
  const TRICK_STAR_R = 0.028;

  let renderer, scene, camera, canvas, resizeObs;
  let tableGroup, trickGroup, stockGroup, markerGroup, handFanGroup;
  const seats = []; // {group, nameSprite, glow, stackGroup, seed}
  const textureCache = new Map();
  let backTexture = null;
  let raf = null, t0 = null;
  const _wobbleQuat = new THREE.Quaternion();

  let orbitAzimuth = 0, orbitElevation = ORBIT_ELEV_DEFAULT, orbitRadius = ORBIT_RADIUS_DEFAULT;
  let orbitTargetAzimuth = 0, orbitTargetElevation = ORBIT_ELEV_DEFAULT, orbitTargetRadius = ORBIT_RADIUS_DEFAULT;
  let orbitDragging = false, orbitLastX = 0, orbitLastY = 0;

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let handCardEntries = [];
  let hoveredCardId = null;
  let touchHoverTimer = null;

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function makeCanvasTexture(draw, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function fmtCard(v) { return String(v).padStart(2, '0'); }
  function isDouble(v) { return v % 11 === 0; }
  function isTen(v) { return v % 10 === 0; }
  function isFive(v) { return v % 10 === 5; }
  function cardKey(card) { return card ? 'v' + card.value : 'back'; }

  function getCardFrontTexture(card) {
    const key = cardKey(card);
    if (textureCache.has(key)) return textureCache.get(key);
    const v = card.value, d = Math.floor(v / 10) % DECADE_HEX.length;
    const tex = makeCanvasTexture((c, w, h) => {
      c.clearRect(0, 0, w, h);
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, DECADE_BG_LIGHT[d]); g.addColorStop(1, DECADE_HEX[d]);
      c.fillStyle = g; roundRect(c, 8, 8, w - 16, h - 16, 26); c.fill();
      const ink = DECADE_INK[d];
      c.strokeStyle = ink; c.lineWidth = 4; c.stroke();
      c.fillStyle = ink;
      c.font = 'bold ' + Math.round(h * 0.36) + 'px Georgia,serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(fmtCard(v), w / 2, h / 2 + 6);
      c.font = 'bold ' + Math.round(h * 0.12) + 'px Georgia,serif';
      c.textAlign = 'left'; c.fillText(fmtCard(v), w * 0.12, h * 0.18);
      const badge = isDouble(v) ? '∞' : (isTen(v) ? '★' : (isFive(v) ? '●' : ''));
      if (badge) { c.textAlign = 'right'; c.font = 'bold ' + Math.round(h * 0.17) + 'px Georgia,serif'; c.fillText(badge, w * 0.88, h * 0.18); }
    }, 128, 178);
    textureCache.set(key, tex);
    return tex;
  }
  function getBackTexture() {
    if (backTexture) return backTexture;
    backTexture = makeCanvasTexture((c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#2a2140'); g.addColorStop(1, '#0e0a1c');
      c.fillStyle = g; roundRect(c, 6, 6, w - 12, h - 12, 22); c.fill();
      c.strokeStyle = '#b98cff'; c.lineWidth = 5; c.stroke();
      c.strokeStyle = 'rgba(185,140,255,.5)'; c.lineWidth = 3;
      for (let i = -h; i < w; i += 16) { c.beginPath(); c.moveTo(i, h); c.lineTo(i + h, 0); c.stroke(); }
      c.fillStyle = '#b98cff'; c.font = 'bold ' + Math.round(w * 0.5) + 'px Georgia,serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('•', w / 2, h / 2);
    }, 128, 178);
    return backTexture;
  }
  function cardMesh(card, faceUp) {
    const geo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H);
    const front = faceUp ? getCardFrontTexture(card) : getBackTexture();
    const back = getBackTexture();
    const side = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: .8 });
    const mats = [side, side, new THREE.MeshStandardMaterial({ map: front, roughness: .5 }), new THREE.MeshStandardMaterial({ map: back, roughness: .5 }), side, side];
    return new THREE.Mesh(geo, mats);
  }
  function makeNameSprite(name, sub, hex) {
    const tex = makeCanvasTexture((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.font = 'bold 54px system-ui,sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const nameW = c.measureText(name).width;
      c.font = '700 38px system-ui,sans-serif';
      const subW = sub ? c.measureText(sub).width : 0;
      const tw = Math.max(nameW, subW) + 58;
      const th = sub ? h * 0.74 : h * 0.48;
      const by = sub ? h * 0.13 : h * 0.26;
      const bx = (w - tw) / 2;
      roundRect(c, bx, by, tw, th, 22);
      c.fillStyle = 'rgba(16,11,28,.82)'; c.fill();
      c.strokeStyle = hex; c.lineWidth = 4; c.stroke();
      c.fillStyle = '#f4eeff';
      c.font = 'bold 54px system-ui,sans-serif';
      c.fillText(name, w / 2, sub ? h * 0.36 : h / 2);
      if (sub) {
        c.font = '700 38px system-ui,sans-serif';
        c.fillStyle = 'rgba(244,238,255,.8)';
        c.fillText(sub, w / 2, h * 0.67);
      }
    }, 560, 190);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(1.0, 0.34, 1);
    spr.renderOrder = 10;
    return spr;
  }
  function buildAvatar(hex) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: hex, roughness: .75, metalness: .05 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c9a0, roughness: .8 });

    // Procedural fallback meeple — its own sub-group so it can be hidden in
    // one line once a real character model (see characterMount below) has
    // finished loading for this seat. Stays visible for bots, for a player
    // whose model is still loading, and as a safety net if a model fails.
    // Shifted down by FALLBACK_MEEPLE_FLOOR_OFFSET (see above) now that the
    // chair mesh that used to sit under it is gone — its individual mesh
    // y-positions below are otherwise untouched from when it sat on that
    // chair's seat top.
    const meepleGroup = new THREE.Group();
    meepleGroup.position.y = -FALLBACK_MEEPLE_FLOOR_OFFSET;
    g.add(meepleGroup);

    const profile = [[0, 0], [0.24, 0.02], [0.27, 0.18], [0.2, 0.4], [0.14, 0.53], [0.0, 0.57]].map(p => new THREE.Vector2(p[0], p[1]));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), bodyMat);
    body.position.y = 0.49; meepleGroup.add(body);

    const headY = 1.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), skinMat);
    head.position.y = headY; meepleGroup.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), bodyMat);
    visor.position.y = headY; visor.scale.set(1.05, 0.9, 1.05); meepleGroup.add(visor);

    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), bodyMat);
      arm.rotation.z = sx * 0.9; arm.rotation.x = -0.35;
      arm.position.set(sx * 0.24, 0.7, 0.16);
      meepleGroup.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat);
      hand.position.set(sx * 0.36, 0.6, 0.28);
      meepleGroup.add(hand);
    }

    // Holds the cloned sit-pose character model PLUS the cloned seat model
    // (see instantiateSitCharacter/instantiateSeat above) once both have
    // loaded for this seat — empty (and meepleGroup visible) until
    // setSeatCharacter() fills it in; see sync(). Position: see
    // CHAR_SEAT_Y/CHAR_SEAT_Z above — both children sit at identity
    // transform inside this mount, no further offset needed.
    const characterMount = new THREE.Group();
    characterMount.position.set(0, CHAR_SEAT_Y, CHAR_SEAT_Z);
    g.add(characterMount);

    const glow = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 32), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.015;
    g.add(glow);

    const nameSprite = makeNameSprite('', '', '#' + hex.toString(16).padStart(6, '0'));
    nameSprite.position.set(0, 1.62, 0);
    g.add(nameSprite);

    const stackGroup = new THREE.Group();
    stackGroup.position.set(0, 0.58, 0.32);
    g.add(stackGroup);

    const seatSpot = new THREE.SpotLight(
      new THREE.Color(hex).lerp(new THREE.Color(0xe6d8ff), 0.65),
      SEAT_SPOT_INTENSITY, SEAT_SPOT_DISTANCE, SEAT_SPOT_ANGLE, SEAT_SPOT_PENUMBRA, SEAT_SPOT_DECAY
    );
    seatSpot.position.set(0, 2.1, -0.35);
    seatSpot.target.position.set(0, 0.95, 0.15);
    g.add(seatSpot, seatSpot.target);

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { group: g, glow, nameSprite, stackGroup, meepleGroup, characterMount, currentCharacter: null, currentSeat: null, seed: Math.random() * 10 };
  }

  // Swaps a seat's visible figure to the player's chosen character+chair,
  // loading both (via the shared caches) if this is the first seat to need
  // either. No-ops if the seat already shows this exact pair — sync() calls
  // this every snapshot, so that guard matters (it would otherwise re-clone/
  // re-swap on every single render). Falls back to (and stays on) the
  // procedural meepleGroup for a null/unknown character id or a failed load;
  // an unknown/missing seatId falls back to DEFAULT_SEAT_ID rather than
  // dropping the chair entirely (a character floating with no chair would
  // look like a bug, not a fallback).
  function setSeatCharacter(seat, characterId, seatId) {
    const resolvedSeatId = SEAT_MODEL_FILES[seatId] ? seatId : DEFAULT_SEAT_ID;
    if (seat.currentCharacter === characterId && seat.currentSeat === resolvedSeatId) return;
    seat.currentCharacter = characterId;
    seat.currentSeat = resolvedSeatId;
    if (!characterId || !CHAR_MODEL_FILES[characterId]) {
      while (seat.characterMount.children.length) seat.characterMount.remove(seat.characterMount.children[0]);
      seat.meepleGroup.visible = true;
      return;
    }
    Promise.all([instantiateSitCharacter(characterId), instantiateSeat(resolvedSeatId)]).then(([charInst, seatInst]) => {
      if (seat.currentCharacter !== characterId || seat.currentSeat !== resolvedSeatId) return; // seat moved on while this was loading
      while (seat.characterMount.children.length) seat.characterMount.remove(seat.characterMount.children[0]);
      seat.characterMount.add(seatInst, charInst);
      seat.meepleGroup.visible = false;
    }).catch(() => { /* keep the procedural fallback visible */ });
  }
  function disposeMeshLike(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
  }
  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse(disposeMeshLike);
      g.remove(c);
    }
  }
  function seatAngle(localIndex, n) { return Math.PI / 2 + (localIndex / n) * Math.PI * 2; }
  function ensureSeats(n) {
    for (let i = 0; i < n; i++) {
      if (seats[i]) continue;
      const hex = SEAT_COLORS[i % SEAT_COLORS.length];
      const av = buildAvatar(new THREE.Color(hex).getHex());
      seats.push(av);
      tableGroup.add(av.group);
    }
    for (let i = seats.length - 1; i >= n; i--) {
      tableGroup.remove(seats[i].group);
      seats.pop();
    }
    seats.forEach((av, i) => {
      const a = seatAngle(i, n);
      const x = Math.cos(a) * SEAT_RX, z = Math.sin(a) * SEAT_RZ;
      av.group.userData.baseX = x; av.group.userData.baseZ = z;
      av.group.position.set(x, 0, z);
      av.group.lookAt(0, 0.55, 0);
      av.group.userData.baseQuat = av.group.quaternion.clone();
    });
  }
  function buildTable() {
    const felt = new THREE.MeshStandardMaterial({ color: 0x241a3a, roughness: .85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x1a1428, roughness: .55, metalness: .12 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.06, 48), felt);
    top.scale.set(1, 1, TABLE_OVAL);
    top.position.y = TABLE_TOP_Y;
    top.receiveShadow = true;
    const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R * 1.06, TABLE_R * 1.06, 0.09, 48), rimMat);
    rimMesh.scale.set(1, 1, TABLE_OVAL);
    rimMesh.position.y = TABLE_TOP_Y - 0.02;
    rimMesh.receiveShadow = true;
    const legH = TABLE_TOP_Y - 0.06;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, legH, 24), rimMat);
    leg.position.y = legH / 2;
    const g = new THREE.Group();
    g.add(rimMesh, top, leg);
    return g;
  }

  function mount(canvasEl) {
    canvas = canvasEl;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0714);
    scene.fog = new THREE.Fog(0x0a0714, 3.6, 9);

    camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
    scene.add(camera);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.add(new THREE.AmbientLight(0x2a2438, 0.24));
    const spot = new THREE.SpotLight(0xe6d8ff, 1.6, 9, THREE.MathUtils.degToRad(34), 0.6, 1.4);
    spot.position.set(0, 3.3, 0.25);
    spot.target.position.set(0, TABLE_TOP_Y, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 1.2;
    spot.shadow.camera.far = 7;
    spot.shadow.bias = -0.0025;
    scene.add(spot, spot.target);
    const fill = new THREE.DirectionalLight(0x6a4a9a, 0.16);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    tableGroup = new THREE.Group();
    tableGroup.add(buildTable());
    scene.add(tableGroup);

    trickGroup = new THREE.Group();
    tableGroup.add(trickGroup);

    stockGroup = new THREE.Group();
    stockGroup.position.set(-0.85, 0, -0.4);
    tableGroup.add(stockGroup);

    markerGroup = new THREE.Group();
    tableGroup.add(markerGroup);

    handFanGroup = new THREE.Group();
    handFanGroup.position.set(0, HAND_Y, HAND_Z);
    handFanGroup.rotation.x = HAND_TILT_X;
    camera.add(handFanGroup);

    resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(canvas.parentElement);
    onResize();
    attachHandPointerEvents();
    attachOrbitPointerEvents();
    updateOrbitCamera();

    t0 = performance.now();
    tick();
  }

  function updateOrbitCamera() {
    const horiz = orbitRadius * Math.cos(orbitElevation);
    camera.position.set(
      horiz * Math.sin(orbitAzimuth),
      ORBIT_TARGET.y + orbitRadius * Math.sin(orbitElevation),
      horiz * Math.cos(orbitAzimuth)
    );
    camera.lookAt(ORBIT_TARGET);
  }
  function attachOrbitPointerEvents() {
    canvas.addEventListener('pointerdown', e => {
      if (pickHandCard(e.clientX, e.clientY) != null) return;
      orbitDragging = true;
      orbitLastX = e.clientX; orbitLastY = e.clientY;
    });
    window.addEventListener('pointermove', e => {
      if (!orbitDragging) return;
      const dx = e.clientX - orbitLastX, dy = e.clientY - orbitLastY;
      orbitLastX = e.clientX; orbitLastY = e.clientY;
      orbitTargetAzimuth = THREE.MathUtils.clamp(orbitTargetAzimuth - dx * ORBIT_AZ_SENSITIVITY, -ORBIT_AZ_MAX, ORBIT_AZ_MAX);
      orbitTargetElevation = THREE.MathUtils.clamp(orbitTargetElevation + dy * ORBIT_EL_SENSITIVITY, ORBIT_ELEV_MIN, ORBIT_ELEV_MAX);
    });
    window.addEventListener('pointerup', () => { orbitDragging = false; });
    window.addEventListener('pointercancel', () => { orbitDragging = false; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      orbitTargetRadius = THREE.MathUtils.clamp(orbitTargetRadius + e.deltaY * ORBIT_ZOOM_SENSITIVITY, ORBIT_RADIUS_MIN, ORBIT_RADIUS_MAX);
    }, { passive: false });
  }

  function pickHandCard(clientX, clientY) {
    if (!camera || !canvas || !handCardEntries.length) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const meshes = handCardEntries.map(e => e.hitMesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const entry = handCardEntries.find(e => e.hitMesh === hits[0].object);
    return entry ? entry.cardId : null;
  }
  function setHoveredCard(cardId) {
    if (hoveredCardId === cardId) return;
    hoveredCardId = cardId;
    canvas.style.cursor = cardId != null ? 'pointer' : '';
  }
  function attachHandPointerEvents() {
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      setHoveredCard(pickHandCard(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointerleave', e => {
      if (e.pointerType === 'touch') return;
      setHoveredCard(null);
    });
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      if (touchHoverTimer) { clearTimeout(touchHoverTimer); touchHoverTimer = null; }
      setHoveredCard(pickHandCard(e.clientX, e.clientY));
    });
    window.addEventListener('pointerup', e => {
      if (e.pointerType !== 'touch' || hoveredCardId == null) return;
      touchHoverTimer = setTimeout(() => { setHoveredCard(null); touchHoverTimer = null; }, 380);
    });
  }
  function onResize() {
    if (!canvas || !canvas.parentElement) return;
    const w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function buildStock(count) {
    clearGroup(stockGroup);
    const n = Math.min(10, Math.max(0, count));
    for (let i = 0; i < n; i++) {
      const m = cardMesh(null, false);
      m.position.set(0, SURFACE_Y + i * 0.009, 0);
      m.rotation.y = (Math.random() - 0.5) * 0.1;
      stockGroup.add(m);
    }
  }
  // A small flat gold disc used as a point-value chip next to the trick, one
  // per point the trick is currently worth (capped visually at 6 — the exact
  // number is still spelled out in the 2D #trickPointsOut label). Distinct
  // from the (much bigger, glowing) Lacuna marker token below — this chip is
  // per-trick scoring, the marker token is the once-per-round "went out
  // first" award.
  function pointChip() {
    const geo = new THREE.CylinderGeometry(TRICK_STAR_R, TRICK_STAR_R, 0.006, 14);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: .35, metalness: .3, emissive: 0x3a2400, emissiveIntensity: .3 });
    return new THREE.Mesh(geo, mat);
  }
  // The Lacuna marker: awarded once per round to whoever empties their hand
  // first (+1 point, see game.js finishRound/doPlay). Rendered as a small
  // glowing gem on its own base, sitting on the table just in front of
  // whoever currently holds it — a literal, visible token, not just a number
  // in the players list — with a slow idle spin/bob (see tick()) so it reads
  // as a special object rather than another card.
  function buildMarkerToken() {
    const g = new THREE.Group();
    const gem = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.052, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xb98cff, emissiveIntensity: 0.55, roughness: .25, metalness: .45 })
    );
    gem.position.y = 0.05;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.012, 20),
      new THREE.MeshStandardMaterial({ color: 0x1a1428, roughness: .6 })
    );
    g.add(base, gem);
    g.userData.gem = gem;
    return g;
  }
  function buildMarker(markerPid, seatOrder) {
    clearGroup(markerGroup);
    if (!markerPid) return;
    const idx = seatOrder.indexOf(markerPid);
    const seat = seats[idx];
    if (!seat) return;
    const bx = seat.group.userData.baseX, bz = seat.group.userData.baseZ;
    const tok = buildMarkerToken();
    tok.position.set(bx * 0.85, SURFACE_Y + 0.01, bz * 0.85);
    markerGroup.add(tok);
  }
  // The shared trick area: every card played this trick, laid out flat in a
  // single evenly-spaced row sorted by value (frame cards scaled up/glowing,
  // a demoted ex-frame card scaled down) plus a small stack of point-value
  // chips. World-space (child of tableGroup) since this is shared state
  // every seat needs to read, unlike the camera-anchored hand fan.
  function buildTrick(trick) {
    clearGroup(trickGroup);
    if (!trick || !trick.playsCount) return;
    const all = trick.rangeCards.map(c => Object.assign({ isFrame: true }, c)).concat(trick.extraCards || []);
    all.sort((a, b) => a.value - b.value);
    const n = all.length;
    const totalW = (n - 1) * TRICK_GAP;
    all.forEach((c, i) => {
      const m = cardMesh(c, true);
      const x = -totalW / 2 + i * TRICK_GAP;
      const scale = c.isFrame ? 1.15 : (c.demoted ? 0.82 : 1);
      m.scale.setScalar(scale);
      m.position.set(x, SURFACE_Y + i * 0.003, 0);
      if (c.isFrame) {
        m.material.forEach(mat => { if (mat.emissive) { mat.emissive = new THREE.Color(0xb98cff); mat.emissiveIntensity = 0.18; } });
      }
      m.renderOrder = 20 + i;
      m.material.forEach(mat => { mat.depthTest = false; mat.depthWrite = false; });
      trickGroup.add(m);
    });
    const stars = Math.max(1, Math.min(6, trick.points || 1));
    for (let i = 0; i < stars; i++) {
      const s = pointChip();
      s.position.set(totalW / 2 + 0.16 + i * 0.052, SURFACE_Y + 0.02, 0.2);
      trickGroup.add(s);
    }
  }

  function buildHandFan(cards) {
    clearGroup(handFanGroup);
    handCardEntries = [];
    const n = cards.length;
    if (!n) return;
    const maxSpread = Math.min(1.3, 0.155 * n);
    cards.forEach((card, i) => {
      const t = n > 1 ? (i / (n - 1)) - 0.5 : 0;
      const angle = t * maxSpread;
      const pivot = new THREE.Group();
      const bowCam = FAN_BOW_SCREEN_Y * (Math.cos(angle) - 1);
      const baseX = Math.sin(angle) * 0.95;
      const baseY = bowCam * HAND_TILT_COS - 0.09;
      const baseZ = -bowCam * HAND_TILT_SIN + i * 0.0018;
      pivot.position.set(baseX, baseY, baseZ);
      pivot.quaternion.setFromAxisAngle(FAN_ROLL_AXIS, -angle);
      const m = cardMesh(card, true);
      m.scale.setScalar(HAND_SCALE);
      m.renderOrder = HAND_CARD_RENDER_BASE + i;
      m.material.forEach(mat => { mat.depthTest = false; mat.depthWrite = false; });
      pivot.add(m);
      handFanGroup.add(pivot);
      const hitMesh = new THREE.Mesh(
        new THREE.BoxGeometry(CARD_W * HAND_SCALE, CARD_T, CARD_H * HAND_SCALE),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hitMesh.position.set(baseX, baseY, baseZ);
      hitMesh.quaternion.setFromAxisAngle(FAN_ROLL_AXIS, -angle);
      handFanGroup.add(hitMesh);
      handCardEntries.push({ pivot, mesh: m, hitMesh, cardId: card.value, baseOrder: HAND_CARD_RENDER_BASE + i, base: { x: baseX, y: baseY, z: baseZ, rotZ: -angle }, hoverT: 0 });
    });
  }
  function tickHandFan() {
    handCardEntries.forEach(entry => {
      const target = entry.cardId === hoveredCardId ? 1 : 0;
      entry.hoverT += (target - entry.hoverT) * 0.22;
      if (Math.abs(entry.hoverT - target) < 0.002) entry.hoverT = target;
      const b = entry.base, ht = entry.hoverT;
      const dy = (HOVER_LIFT_Y * HAND_TILT_COS + HOVER_FORWARD_Z * HAND_TILT_SIN) * ht;
      const dz = (-HOVER_LIFT_Y * HAND_TILT_SIN + HOVER_FORWARD_Z * HAND_TILT_COS) * ht;
      entry.pivot.position.set(b.x, b.y + dy, b.z + dz);
      _fanRollQuat.setFromAxisAngle(FAN_ROLL_AXIS, b.rotZ * (1 - ht));
      _fanTiltQuat.setFromAxisAngle(X_AXIS, -HAND_TILT_X * ht * 0.65);
      entry.pivot.quaternion.copy(_fanTiltQuat).multiply(_fanRollQuat);
      entry.pivot.scale.setScalar(1 + ht * 0.3);
      entry.mesh.renderOrder = entry.cardId === hoveredCardId ? HAND_CARD_RENDER_HOVER : entry.baseOrder;
    });
  }

  function sync(payload) {
    if (!scene) return;
    const players = payload.players || [];
    const myIdx = Math.max(0, players.findIndex(p => p.isMe));
    const n = Math.max(2, players.length);
    ensureSeats(n);
    const order = [];
    for (let i = 0; i < n; i++) order.push(players[(myIdx + i) % players.length]?.id);
    players.forEach((p, idx) => {
      const localIndex = (idx - myIdx + players.length) % players.length;
      const seat = seats[localIndex];
      if (!seat) return;
      seat.nameSprite.material.map.dispose();
      const hex = SEAT_COLORS[localIndex % SEAT_COLORS.length];
      const sub = '×' + (p.handCount || 0) + (p.id === payload.dealerId ? '  ♦D' : '') + (p.id === payload.markerPid ? '  ✦' : '');
      const spr = makeNameSprite((p.name || '?') + (p.isMe ? ' •' : ''), sub, hex);
      seat.group.remove(seat.nameSprite);
      spr.position.set(0, 1.62, 0);
      seat.nameSprite = spr;
      seat.group.add(spr);
      seat.glow.material.opacity = (p.id === payload.currentPid) ? 0.55 : 0;
      setSeatCharacter(seat, p.character || null, p.seat || null);
      clearGroup(seat.stackGroup);
      if (!p.isMe) {
        const hc = Math.min(10, p.handCount || 0);
        for (let i = 0; i < hc; i++) {
          const m = cardMesh(null, false);
          m.position.set((i - hc / 2) * 0.045, i * 0.0008, 0);
          seat.stackGroup.add(m);
        }
      }
    });
    buildTrick(payload.trick);
    buildStock(payload.stockCount || 0);
    buildMarker(payload.markerPid, order);
    buildHandFan(payload.myHand || []);
    if (hoveredCardId != null && !handCardEntries.some(e => e.cardId === hoveredCardId)) hoveredCardId = null;
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!renderer) return;
    const t = (performance.now() - t0) / 1000;
    seats.forEach((s, i) => {
      if (i === 0) return;
      s.group.position.y = Math.sin(t * 0.9 + s.seed) * 0.01;
      const wobble = Math.sin(t * 0.6 + s.seed) * 0.025;
      _wobbleQuat.setFromAxisAngle(WOBBLE_AXIS, wobble);
      s.group.quaternion.copy(s.group.userData.baseQuat).multiply(_wobbleQuat);
    });
    orbitAzimuth += (orbitTargetAzimuth - orbitAzimuth) * ORBIT_EASE;
    orbitElevation += (orbitTargetElevation - orbitElevation) * ORBIT_EASE;
    orbitRadius += (orbitTargetRadius - orbitRadius) * ORBIT_EASE;
    updateOrbitCamera();
    tickHandFan();
    markerGroup.children.forEach(tok => {
      if (!tok.userData.gem) return;
      tok.userData.gem.rotation.y = t * 1.1;
      tok.userData.gem.position.y = 0.05 + Math.sin(t * 2.2) * 0.012;
    });
    renderer.render(scene, camera);
  }

  window.Lacuna3D = { mount, sync, pickHandCard, loadCharacterThumbnails, mountCharPreview, setCharPreview };
})();
