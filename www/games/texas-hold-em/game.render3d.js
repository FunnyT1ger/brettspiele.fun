/* Texas Hold'em — 3D table scene (Three.js).
   Pure presentation layer: game.js feeds it a plain data snapshot via
   window.HoldEm3D.sync(payload) on every render(); this file never mutates
   game state and has no network/rule knowledge. Table, chips and the
   fallback avatar are built procedurally from Three.js primitives +
   canvas-drawn textures; seated characters AND their chairs are real GLB
   models chosen per player in the char-select screen (see CHAR_MODEL_FILES/
   SEAT_MODEL_FILES below) — same asset set already used by the LevelUp game
   on this site (this game's own copy under models/, per this site's
   "copy adopted ideas into your own game" rule since every game directory
   is its own sandbox with no shared imports).

   Camera engine, seat-ring layout, avatar rig, canvas-texture helpers, name
   sprite, and the character-select preview/thumbnail rig are adapted from
   LevelUp's game.render3d.js (tagged [REUSABLE] there) — same technique,
   poker-specific presentation layer (cards, chips, dealer button, pot) is
   new. */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') { window.HoldEm3D = { mount(){}, sync(){}, loadCharacterThumbnails(){ return Promise.resolve({}); }, mountCharPreview(){}, setCharPreview(){ return Promise.resolve(); } }; return; }

  const SEAT_COLORS = ['#5ec8a6', '#e0483a', '#2f6fd6', '#e0ac2b', '#8b5cf6', '#ff8fb3'];

  // Character models (real GLBs, chosen by each player in the char-select
  // screen before joining — see game.js CHARACTERS/openCharSelect). Same
  // asset set as LevelUp (this game's own copy under models/), including
  // LevelUp's 2026-09-09 upgrade to two GLBs per character + real chair
  // models instead of a procedural chair — see game.js CHARACTERS/SEATS and
  // LevelUp's game.render3d.js for the original design writeup:
  // - CHAR_MODEL_FILES (this map): SEATED pose, no chair geometry of its
  //   own — used ONLY for the table avatar, combined with a separate seat
  //   GLB (see SEAT_MODEL_FILES/instantiateSeat below).
  // - CHAR_STAND_MODEL_FILES (same ids, "_stand" suffix): standing
  //   full-body pose — used ONLY for the char-select grid/thumbnails/big
  //   preview, where showing a chair makes no sense.
  // Both poses share floor-at-y≈0/centered-on-x=0/+z=forward; the sit pose
  // additionally shares that convention with every SEAT_MODEL_FILES chair
  // (each chair's own "_seatpad" submesh tops out at the same raw y=0.46),
  // which is what lets any character sit on any chair with zero per-pair
  // tuning (see instantiateSitCharacter/instantiateSeat below).
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
  // thematic default seat but the player can override it).
  const SEAT_MODEL_FILES = {
    holzstuhl: 'seat_01_holzstuhl.glb', thron: 'seat_02_thron.glb', technik: 'seat_03_technik.glb',
    fass: 'seat_04_fass.glb', hocker: 'seat_05_hocker.glb', baumstumpf: 'seat_06_baumstumpf.glb'
  };
  const DEFAULT_SEAT_ID = 'holzstuhl';
  // Standing-pose preview height (char-select only — the seated table avatar
  // uses the sit-pose GLBs at their own native scale, see
  // instantiateSitCharacter below). The 20 stand-pose source models are
  // exported at inconsistent raw scales/origins, so loadCharacterModel()
  // normalizes every one the same way (centered x/z, feet at local y=0,
  // scaled to this fixed height) so they drop into the preview rig
  // interchangeably.
  const CHAR_TARGET_HEIGHT = 0.85;
  // id -> Promise<THREE.Group>, standing pose, normalized. Never added to a
  // live scene directly — every use clones it, so geometry/materials stay
  // shared across every char-select thumbnail/preview instance.
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
  // surface at raw y=0.46), so simply adding both as children of the same
  // anchor at identity transform already lines them up. Two separate caches
  // (sit-pose character, seat) since either can vary independently once the
  // player overrides the default seat.
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
  // thumbnails and the big preview canvas — independent of the main table
  // scene/renderer/camera.
  function ensurePreviewRig(canvasEl, w, h) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(1.2, 2, 1.6); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb0ff, 0.4); rim.position.set(-1.5, 0.6, -1); scene.add(rim);
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
  // memory pressure low for what's a one-off, cached-after-first-open cost
  // (see game.js's charThumbCache).
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
  // Big preview shown next to the char-select grid, re-rendered on select.
  // Mounted once and reused across open/cancel/reopen cycles (a fresh
  // WebGLRenderer per open would leak GL contexts).
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

  // ===== Cards =====
  const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const SUIT_RED = { h: true, d: true };
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  function rankLabel(r) { return RANK_LABEL[r] || String(r); }

  const CARD_W = 0.22, CARD_H = 0.305, CARD_T = 0.008;
  const TABLE_RX = 1.85, TABLE_RZ = 1.05, TABLE_TOP_Y = 0.72;
  const SURFACE_Y = TABLE_TOP_Y + 0.05;
  const SEAT_RX = 2.55, SEAT_RZ = 1.85;
  // The procedural chair (seat disc + legs + backrest) that used to live here
  // is gone (real chair models instead, still per-character customizable —
  // see SEAT_MODEL_FILES/game.js SEATS). Seats are now just an empty floor
  // anchor at y=0 in the avatar group's local frame — a seat model's own
  // geometry sits on it, and a sit-pose character model sits on top of THAT
  // (see setSeatCharacter below, which loads both per player and adds them
  // side by side at identity transform — no extra vertical offset needed,
  // they share one raw coordinate space by construction, see
  // SEAT_MODEL_FILES comment). FALLBACK_MEEPLE_FLOOR_OFFSET keeps the
  // still-present procedural fallback meeple (used for bots/while a model
  // loads/on load failure) grounded at the same floor level without having
  // to re-tune every one of its individual mesh y-positions, which were
  // originally authored relative to the old chair's seat top (0.46) rather
  // than the floor.
  const FALLBACK_MEEPLE_FLOOR_OFFSET = 0.46;
  // Real sit-pose character + seat models both sit squarely on the floor
  // (local y=0) at identity transform — characterMount itself therefore
  // needs no extra offset either.
  const CHAR_SEAT_Y = 0, CHAR_SEAT_Z = 0;
  const SEAT_SPOT_INTENSITY = 1.3, SEAT_SPOT_DISTANCE = 3.6, SEAT_SPOT_ANGLE = THREE.MathUtils.degToRad(32),
    SEAT_SPOT_PENUMBRA = 0.7, SEAT_SPOT_DECAY = 1.6;

  const ORBIT_TARGET = new THREE.Vector3(0, 0.62, 0);
  const ORBIT_RADIUS_DEFAULT = 3.0, ORBIT_RADIUS_MIN = 2.1, ORBIT_RADIUS_MAX = 4.4;
  const ORBIT_ELEV_DEFAULT = THREE.MathUtils.degToRad(52), ORBIT_ELEV_MIN = THREE.MathUtils.degToRad(36), ORBIT_ELEV_MAX = THREE.MathUtils.degToRad(72);
  const ORBIT_AZ_MAX = THREE.MathUtils.degToRad(70);
  const ORBIT_AZ_SENSITIVITY = 0.0055, ORBIT_EL_SENSITIVITY = 0.0045, ORBIT_ZOOM_SENSITIVITY = 0.0018, ORBIT_EASE = 0.12;
  const WOBBLE_AXIS = new THREE.Vector3(0, 1, 0);

  const HOLE_HUD_Y = -0.46, HOLE_HUD_Z = -1.05, HOLE_TILT_X = 1.05;
  const POP_EASE = 0.16;
  // Per-seat stagger for a fresh deal, so opponents' cards visibly arrive one
  // seat after another (like a dealer going around the table) instead of all
  // popping in at once. Community-card stagger is per-card within one batch.
  const DEAL_SEAT_STAGGER = 0.09, DEAL_CARD_STAGGER = 0.12;

  let renderer, scene, camera, canvas, resizeObs;
  let tableGroup, communityGroup, potGroup, dealerGroup, holeHudGroup;
  const seats = []; // {group, glow, nameSprite, stackGroup, betGroup, chipsGroup, meepleGroup, characterMount, currentCharacter, seed, stackSig, stackEntries}
  const textureCache = new Map();
  let backTexture = null;
  let raf = null, t0 = null, lastTickTime = null, clockNow = 0;
  const _wobbleQuat = new THREE.Quaternion();
  let orbitAzimuth = 0, orbitElevation = ORBIT_ELEV_DEFAULT, orbitRadius = ORBIT_RADIUS_DEFAULT;
  let orbitTargetAzimuth = 0, orbitTargetElevation = ORBIT_ELEV_DEFAULT, orbitTargetRadius = ORBIT_RADIUS_DEFAULT;
  let orbitDragging = false, orbitLastX = 0, orbitLastY = 0;
  let communityEntries = [], holeEntries = [], holeSig = null;
  let lastHandledEventId = null;
  let winnerPulseIds = [], winnerPulseT = 0;

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

  function cardKey(card) { return card ? card.rank + card.suit : 'back'; }
  function getCardFrontTexture(card) {
    const key = cardKey(card);
    if (textureCache.has(key)) return textureCache.get(key);
    const red = !!SUIT_RED[card.suit];
    const ink = red ? '#c33338' : '#1c2430';
    const tex = makeCanvasTexture((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#f7f4ec'; roundRect(c, 6, 6, w - 12, h - 12, 20); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3; c.stroke();
      c.fillStyle = ink;
      c.font = 'bold ' + Math.round(h * 0.16) + 'px Georgia,serif';
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText(rankLabel(card.rank), w * 0.1, h * 0.07);
      c.font = Math.round(h * 0.14) + 'px Georgia,serif';
      c.fillText(SUIT_SYMBOL[card.suit], w * 0.1, h * 0.22);
      c.font = 'bold ' + Math.round(h * 0.4) + 'px Georgia,serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(SUIT_SYMBOL[card.suit], w / 2, h / 2 + h * 0.03);
      c.save(); c.translate(w * 0.9, h * 0.93); c.rotate(Math.PI);
      c.font = 'bold ' + Math.round(h * 0.16) + 'px Georgia,serif';
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText(rankLabel(card.rank), 0, 0);
      c.restore();
    }, 128, 178);
    textureCache.set(key, tex);
    return tex;
  }
  function getBackTexture() {
    if (backTexture) return backTexture;
    backTexture = makeCanvasTexture((c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#3a2410'); g.addColorStop(1, '#150c04');
      c.fillStyle = g; roundRect(c, 6, 6, w - 12, h - 12, 20); c.fill();
      c.strokeStyle = '#e0ac2b'; c.lineWidth = 5; c.stroke();
      c.strokeStyle = 'rgba(224,172,43,.5)'; c.lineWidth = 3;
      for (let i = -h; i < w; i += 16) { c.beginPath(); c.moveTo(i, h); c.lineTo(i + h, 0); c.stroke(); }
      c.fillStyle = '#e0ac2b'; c.font = 'bold ' + Math.round(w * 0.4) + 'px Georgia,serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♠', w / 2, h / 2);
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
      c.fillStyle = 'rgba(20,12,4,.82)'; c.fill();
      c.strokeStyle = hex; c.lineWidth = 4; c.stroke();
      c.fillStyle = '#fff7e6';
      c.font = 'bold 54px system-ui,sans-serif';
      c.fillText(name, w / 2, sub ? h * 0.36 : h / 2);
      if (sub) {
        c.font = '700 38px system-ui,sans-serif';
        c.fillStyle = 'rgba(255,247,230,.85)';
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

    // Procedural fallback meeple (lathe-profile body, head, arms) — its own
    // sub-group so it can be hidden in one line once a real character model
    // (see characterMount below) has finished loading for this seat. Stays
    // the visible avatar for bots, for a player whose character model is
    // still loading, and as a safety net if a model fails to load. Shifted
    // down by FALLBACK_MEEPLE_FLOOR_OFFSET now that the procedural chair
    // mesh that used to sit under it is gone — its individual mesh
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
    // setSeatCharacter() fills it in. Position: see CHAR_SEAT_Y/CHAR_SEAT_Z
    // above — both children sit at identity transform inside this mount, no
    // further offset needed.
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
      new THREE.Color(hex).lerp(new THREE.Color(0xfff2d8), 0.65),
      SEAT_SPOT_INTENSITY, SEAT_SPOT_DISTANCE, SEAT_SPOT_ANGLE, SEAT_SPOT_PENUMBRA, SEAT_SPOT_DECAY
    );
    seatSpot.position.set(0, 2.1, -0.35);
    seatSpot.target.position.set(0, 0.95, 0.15);
    g.add(seatSpot, seatSpot.target);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    const betGroup = new THREE.Group();
    const chipsGroup = new THREE.Group();
    return { group: g, glow, nameSprite, stackGroup, betGroup, chipsGroup, meepleGroup, characterMount, currentCharacter: null, currentSeat: null, seed: Math.random() * 10, stackSig: null, stackEntries: [] };
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
      tableGroup.add(av.group, av.betGroup, av.chipsGroup);
    }
    for (let i = seats.length - 1; i >= n; i--) {
      tableGroup.remove(seats[i].group, seats[i].betGroup, seats[i].chipsGroup);
      seats.pop();
    }
    seats.forEach((av, i) => {
      const a = seatAngle(i, n);
      const x = Math.cos(a) * SEAT_RX, z = Math.sin(a) * SEAT_RZ;
      av.group.userData.baseX = x;
      av.group.userData.baseZ = z;
      av.group.position.set(x, 0, z);
      av.group.lookAt(0, 0.55, 0);
      av.group.userData.baseQuat = av.group.quaternion.clone();
      av.betGroup.position.set(x * 0.55, SURFACE_Y, z * 0.55);
      av.chipsGroup.position.set(x * 0.93, TABLE_TOP_Y, z * 0.93);
    });
  }

  function buildTable() {
    const felt = new THREE.MeshStandardMaterial({ color: 0x0f4d3a, roughness: .85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: .55, metalness: .12 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.06, 48), felt);
    top.scale.set(TABLE_RX, 1, TABLE_RZ);
    top.position.y = TABLE_TOP_Y;
    top.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 48), new THREE.MeshBasicMaterial({ color: 0xe0ac2b, transparent: true, opacity: .5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.scale.set(TABLE_RX, TABLE_RZ, 1); ring.position.y = TABLE_TOP_Y + 0.031;
    const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.09, 48), rimMat);
    rimMesh.scale.set(TABLE_RX, 1, TABLE_RZ);
    rimMesh.position.y = TABLE_TOP_Y - 0.02;
    rimMesh.receiveShadow = true;
    const legH = TABLE_TOP_Y - 0.06;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, legH, 24), rimMat);
    leg.position.y = legH / 2;
    const g = new THREE.Group();
    g.add(rimMesh, top, ring, leg);
    return g;
  }

  function chipColorForValue(v) {
    if (v >= 1000) return 0x1f2430;
    if (v >= 500) return 0xcc3348;
    if (v >= 200) return 0x2f9c60;
    if (v >= 50) return 0x3a6bd6;
    return 0xf2f2f2;
  }
  function chipDisc(colorHex) {
    const geo = new THREE.CylinderGeometry(0.052, 0.052, 0.016, 20);
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: .45, metalness: .15 });
    return new THREE.Mesh(geo, mat);
  }
  function buildChipStack(amount, group) {
    clearGroup(group);
    if (!amount || amount <= 0) return;
    const color = chipColorForValue(amount);
    const count = Math.max(1, Math.min(10, Math.round(Math.log2(amount / 4 + 1) * 2)));
    for (let i = 0; i < count; i++) {
      const m = chipDisc(color);
      m.position.set((Math.random() - 0.5) * 0.012, i * 0.017, (Math.random() - 0.5) * 0.012);
      m.rotation.y = Math.random() * Math.PI;
      m.castShadow = true;
      group.add(m);
    }
  }

  function mount(canvasEl) {
    canvas = canvasEl;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.Fog(0x05070a, 4, 10);

    camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
    scene.add(camera);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.add(new THREE.AmbientLight(0x30291f, 0.25));
    const spot = new THREE.SpotLight(0xfff2d8, 1.7, 9.5, THREE.MathUtils.degToRad(38), 0.6, 1.4);
    spot.position.set(0, 3.4, 0.25);
    spot.target.position.set(0, TABLE_TOP_Y, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 1.2;
    spot.shadow.camera.far = 7.5;
    spot.shadow.bias = -0.0025;
    scene.add(spot, spot.target);
    const fill = new THREE.DirectionalLight(0x8a6a4a, 0.16);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    tableGroup = new THREE.Group();
    tableGroup.add(buildTable());
    scene.add(tableGroup);

    communityGroup = new THREE.Group(); tableGroup.add(communityGroup);
    potGroup = new THREE.Group(); potGroup.position.set(0, TABLE_TOP_Y, -0.34); tableGroup.add(potGroup);
    dealerGroup = new THREE.Group(); dealerGroup.visible = false; tableGroup.add(dealerGroup);
    const buttonGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.012, 24);
    const buttonTex = makeCanvasTexture((c, w, h) => {
      c.fillStyle = '#f7f4ec'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#e0ac2b'; c.lineWidth = 5; c.stroke();
      c.fillStyle = '#1c1c1c'; c.font = 'bold ' + Math.round(w * 0.5) + 'px system-ui,sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('D', w / 2, h / 2 + 2);
    }, 96, 96);
    const buttonMat = new THREE.MeshStandardMaterial({ map: buttonTex, roughness: .5 });
    const buttonMesh = new THREE.Mesh(buttonGeo, buttonMat);
    dealerGroup.add(buttonMesh);

    holeHudGroup = new THREE.Group();
    holeHudGroup.position.set(0, HOLE_HUD_Y, HOLE_HUD_Z);
    holeHudGroup.rotation.x = HOLE_TILT_X;
    camera.add(holeHudGroup);

    // Own hole cards live in camera space, well outside the table spotlight's
    // cone (that one is aimed at the felt) — without their own light they'd
    // render almost black against the dark backroom background. This light
    // rides along as a camera child too, so it always lands on the cards
    // regardless of orbit angle.
    const holeLight = new THREE.PointLight(0xfff6df, 1.6, 3.4, 2);
    holeLight.position.set(0, HOLE_HUD_Y + 0.55, HOLE_HUD_Z + 0.35);
    camera.add(holeLight);

    resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(canvas.parentElement);
    onResize();
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
    canvas.addEventListener('pointerdown', e => { orbitDragging = true; orbitLastX = e.clientX; orbitLastY = e.clientY; });
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
  function onResize() {
    if (!canvas || !canvas.parentElement) return;
    const w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Generic "dealt card" entrance: the mesh starts offset from its resting
  // local transform (further out, tipped at a random angle, as if it just
  // left the dealer's hand) and eases into place once `delaySec` has
  // elapsed — the delay is what lets callers stagger several cards so they
  // visibly arrive one after another instead of all popping in at once.
  // Local-space only (never touches world/camera coordinates), so this
  // works unmodified for the camera-anchored hole-card HUD, a seat's own
  // rotated local frame, and the table-space community row alike.
  function spawnDealt(list, mesh, container, finalPos, finalRotZ, delaySec) {
    const startPos = { x: finalPos.x * 1.5, y: finalPos.y + 0.55, z: finalPos.z - 0.5 };
    const startRotZ = (finalRotZ || 0) + (Math.random() - 0.5) * 0.7;
    mesh.position.set(startPos.x, startPos.y, startPos.z);
    mesh.rotation.z = startRotZ;
    mesh.scale.setScalar(0.001);
    container.add(mesh);
    list.push({ mesh, pop: 0, appearAt: clockNow + (delaySec || 0), startPos, startRotZ, finalPos, finalRotZ: finalRotZ || 0 });
  }
  function tickDealtList(list) {
    list.forEach(e => {
      if (clockNow < e.appearAt) return;
      e.pop += (1 - e.pop) * POP_EASE;
      if (Math.abs(1 - e.pop) < 0.004) e.pop = 1;
      const p = e.pop;
      e.mesh.position.set(
        e.startPos.x + (e.finalPos.x - e.startPos.x) * p,
        e.startPos.y + (e.finalPos.y - e.startPos.y) * p,
        e.startPos.z + (e.finalPos.z - e.startPos.z) * p
      );
      e.mesh.rotation.z = e.startRotZ + (e.finalRotZ - e.startRotZ) * p;
      e.mesh.scale.setScalar(Math.max(0.001, p));
    });
  }

  function buildCommunity(cards) {
    const existing = communityEntries.length;
    if (existing > cards.length) { clearGroup(communityGroup); communityEntries = []; }
    const startCount = communityEntries.length;
    for (let i = startCount; i < cards.length; i++) {
      const m = cardMesh(cards[i], true);
      const finalPos = { x: (i - 2) * CARD_W * 1.16, y: SURFACE_Y + i * 0.003, z: 0 };
      spawnDealt(communityEntries, m, communityGroup, finalPos, 0, (i - startCount) * DEAL_CARD_STAGGER);
    }
  }

  // cards+hide signature so a resync that doesn't actually change what's in
  // the HUD (the vast majority of them — any other player's action, a chip
  // animation, etc.) leaves the existing meshes alone instead of clearing
  // and re-dealing them, which used to make the player's own hole cards
  // flicker out and pop back in on every single state update.
  function buildHoleHud(cards, hide, force) {
    const sig = hide || !cards || cards.length < 2 ? 'none' : cards.slice(0, 2).map(c => c.rank + c.suit).join(',');
    if (sig === holeSig && !force) return;
    const wasEmpty = force || holeSig === null || holeSig === 'none';
    holeSig = sig;
    clearGroup(holeHudGroup);
    holeEntries = [];
    if (sig === 'none') return;
    cards.slice(0, 2).forEach((card, i) => {
      const m = cardMesh(card, true);
      const finalPos = { x: (i - 0.5) * 0.26, y: 0, z: 0 };
      const finalRotZ = (i - 0.5) * -0.12;
      spawnDealt(holeEntries, m, holeHudGroup, finalPos, finalRotZ, wasEmpty ? i * DEAL_CARD_STAGGER : 0);
    });
  }

  function sync(payload) {
    if (!scene) return;
    const players = payload.players || [];
    if (!players.length) return;
    const myIdx = Math.max(0, players.findIndex(p => p.isMe));
    const n = Math.max(2, players.length);
    ensureSeats(n);

    // A genuinely new deal always re-plays the dealt-in animation for every
    // seat, even for a player whose text signature (e.g. "back") happens to
    // be identical to how they looked at the end of the previous hand — the
    // signature check below only guards against *redundant* rebuilds within
    // the same hand (any other player's action, a chip change, ...), not
    // against replaying the deal itself hand after hand.
    const freshDeal = !!(payload.lastEvent && payload.lastEvent.type === 'deal' && payload.lastEvent.id !== lastHandledEventId);

    let dealerLocalIndex = -1;
    players.forEach((p, idx) => {
      const localIndex = (idx - myIdx + players.length) % players.length;
      const seat = seats[localIndex];
      if (!seat) return;
      if (p.isDealer) dealerLocalIndex = localIndex;

      seat.nameSprite.material.map.dispose();
      const hex = SEAT_COLORS[localIndex % SEAT_COLORS.length];
      const sub = p.out ? '–' : (p.folded ? '–' : String(Math.round(p.stack || 0)));
      const spr = makeNameSprite((p.name || '?') + (p.isMe ? ' •' : ''), sub, hex);
      seat.group.remove(seat.nameSprite);
      spr.position.set(0, 1.62, 0);
      seat.nameSprite = spr;
      seat.group.add(spr);
      const pulsing = winnerPulseIds.includes(p.id) && winnerPulseT > 0.02;
      seat.glow.material.opacity = pulsing ? 0.35 + Math.sin(winnerPulseT * Math.PI) * 0.4 : (p.active ? 0.55 : 0);
      seat.glow.material.color.set(pulsing ? 0xffd27a : hex);

      setSeatCharacter(seat, p.character || null, p.seat || null);
      seat.meepleGroup.visible = seat.meepleGroup.visible; // unchanged; character swap handled async

      let stackSig = 'none';
      if (!p.isMe && !p.out) {
        if (p.revealed && p.revealed.length) stackSig = 'rev:' + p.revealed.map(c => c.rank + c.suit).join(',');
        else if (!p.folded) stackSig = 'back';
      }
      if (stackSig !== seat.stackSig || (freshDeal && stackSig === 'back')) {
        const wasEmpty = freshDeal || seat.stackSig === null || seat.stackSig === 'none';
        seat.stackSig = stackSig;
        clearGroup(seat.stackGroup);
        seat.stackEntries = [];
        if (stackSig.startsWith('rev:')) {
          p.revealed.forEach((card, i) => {
            const m = cardMesh(card, true);
            const finalPos = { x: (i - 0.5) * 0.16, y: i * 0.0008, z: 0 };
            spawnDealt(seat.stackEntries, m, seat.stackGroup, finalPos, 0, i * DEAL_CARD_STAGGER);
          });
        } else if (stackSig === 'back') {
          const seatDelay = wasEmpty ? localIndex * DEAL_SEAT_STAGGER : 0;
          for (let i = 0; i < 2; i++) {
            const m = cardMesh(null, false);
            const finalPos = { x: (i - 0.5) * 0.09, y: i * 0.0008, z: 0 };
            spawnDealt(seat.stackEntries, m, seat.stackGroup, finalPos, 0, seatDelay + i * DEAL_CARD_STAGGER);
          }
        }
      }

      buildChipStack(p.folded || p.out ? 0 : (p.bet || 0), seat.betGroup);
      buildChipStack(p.out ? 0 : (p.stack || 0), seat.chipsGroup);
    });

    dealerGroup.visible = dealerLocalIndex >= 0;
    if (dealerLocalIndex >= 0) {
      const seat = seats[dealerLocalIndex];
      const bx = seat.group.userData.baseX, bz = seat.group.userData.baseZ;
      dealerGroup.position.set(bx * 0.78, SURFACE_Y + 0.01, bz * 0.78);
    }

    buildCommunity(payload.community || []);
    buildChipStack(payload.pot || 0, potGroup);
    const me = players[myIdx];
    buildHoleHud(payload.myHoleCards, !me || me.folded || me.out, freshDeal);

    handleEvent(payload.lastEvent, players);
  }

  function handleEvent(ev, players) {
    if (!ev || ev.id === lastHandledEventId) return;
    lastHandledEventId = ev.id;
    if (ev.type === 'award' && ev.winners && ev.winners.length) {
      winnerPulseIds = ev.winners.map(w => w.id);
      winnerPulseT = 1;
    }
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!renderer) return;
    const t = (performance.now() - t0) / 1000;
    lastTickTime = t;
    clockNow = t;
    seats.forEach((s, i) => {
      if (i === 0) return;
      s.group.position.y = Math.sin(t * 0.9 + s.seed) * 0.01;
      const wobble = Math.sin(t * 0.6 + s.seed) * 0.02;
      _wobbleQuat.setFromAxisAngle(WOBBLE_AXIS, wobble);
      s.group.quaternion.copy(s.group.userData.baseQuat).multiply(_wobbleQuat);
    });
    orbitAzimuth += (orbitTargetAzimuth - orbitAzimuth) * ORBIT_EASE;
    orbitElevation += (orbitTargetElevation - orbitElevation) * ORBIT_EASE;
    orbitRadius += (orbitTargetRadius - orbitRadius) * ORBIT_EASE;
    updateOrbitCamera();
    tickDealtList(communityEntries);
    tickDealtList(holeEntries);
    seats.forEach(s => tickDealtList(s.stackEntries));
    if (winnerPulseT > 0) winnerPulseT = Math.max(0, winnerPulseT - 0.012);
    renderer.render(scene, camera);
  }

  window.HoldEm3D = { mount, sync, loadCharacterThumbnails, mountCharPreview, setCharPreview };
})();
