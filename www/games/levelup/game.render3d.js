/* LevelUp — 3D table scene (Three.js).
   Pure presentation layer: game.js feeds it a plain data snapshot via
   LevelUp3D.sync(payload) on every render(); this file never mutates game
   state and has no network/game-rule knowledge. Table, cards and the
   fallback meeple avatar are built procedurally from Three.js primitives
   plus canvas-drawn textures; player characters (chair + sit/stand pose
   included) are external GLB models, see CHAR_MODEL_FILES below.

   Scale convention: 1 unit ≈ 1 meter (seated avatar ~1.5m tall, table ~3.1m
   across), so the table reads as a real card table with people sitting
   around it rather than a tiny figure at a giant slab.

   ============================================================================
   REUSE MAP — for another game's session reading this file (e.g. to build the
   same table+HUD look). Every other game on this site is a separate sandbox
   (own directory, no shared imports possible — see this game's CLAUDE.md), so
   "reuse" here always means: read this file, then copy/adapt the relevant
   piece into your own game's render file. Nothing below is LevelUp-specific
   by accident; the split is deliberate. Each generic piece is additionally
   tagged "[REUSABLE]" at its definition below, so grep -n "\[REUSABLE\]" in
   this file gives you the same list with line numbers.

   Generic table/camera engine — copy near-verbatim into any seated-players-
   around-a-table game (card or board):
   - Orbit camera (ORBIT_* consts, updateOrbitCamera, attachOrbitPointerEvents):
     drag-to-look-around + wheel-zoom, capped so it can't flip upside down,
     clip through the table, or spin a full 360° away from your own seat.
     Knows nothing about cards — works for any tabletop scene.
   - Camera-anchored HUD trick (scene.add(camera) + camera.add(hudGroup)):
     the standard way to dock any UI group (hand fan, a preview panel, a
     scoreboard) to a fixed spot on screen regardless of camera orbit.
   - Camera-space conversion math (HAND_TILT_COS/SIN, FAN_ROLL_AXIS): the fix
     for "I put a HUD group at a steep tilt, and now positions/rotations I set
     on its children don't move/rotate the way I expect on screen." Needed
     for ANY tilted camera-child group, not just a card fan — e.g. a tilted
     dice tray or tile rack would hit the exact same distortion.
   - Hover-vs-hitbox separation (buildHandFan's hitMesh, pickHandCard): never
     raycast against a mesh that hover itself animates — always keep a second,
     static, invisible hitbox at the resting pose. Applies to any hoverable/
     draggable object in any 3D scene, not just cards.
   - Painter's-algorithm overlap via renderOrder + depthTest:false (see
     buildHandFan/tickHandFan comments): needed whenever a fanned/stacked
     visual's *rendered* depth is deliberately distorted (a bow, an arc) so
     real z-depth is no longer a valid overlap order.
   - Seat ring layout + avatar rig (seatAngle, ensureSeats, buildAvatar): a
     generic "seat N players evenly around an ellipse, build a simple fallback
     meeple, keep an idle wobble that doesn't fight lookAt()" kit — reusable
     for literally any multiplayer tabletop game here.
   - lookAt() + idle-animation composition fix (see ensureSeats/tick comments
     on baseQuat + wobbleQuat multiplication): applies to any object that both
     faces a target via lookAt() and has its own idle motion on top.
   - clearGroup/disposeMeshLike: recursive Three.js scene cleanup for
     rebuild-every-sync() rendering — generic hygiene, not card-specific.
   - Flight animation (spawnFlight/tickFlights/FLIGHT_ARC): a generic "animate
     a transient object flying from world point A to world point B with an
     arc, then dispose it" helper — usable for cards, dice, tokens, anything.
   - Canvas-texture helpers (makeCanvasTexture, roundRect): generic
     draw-a-rounded-rect-to-a-CanvasTexture infra, useful for any procedural
     card/tile/token face, not just this game's number cards.
   - makeNameSprite: generic "name badge floating above a seat/avatar" sprite.

   LevelUp-specific (rules-aware) layer — do NOT copy as-is, reimplement per
   game's own rules instead:
   - getCardFrontTexture/getBackTexture/CARD_COLOR_*: this game's card faces.
   - buildPiles/buildMelds/buildPendingSkips/buildLayZones: draw-pile/discard/
     "Phase" (level group)/skip-card layout, specific to Phase-10-style rules.
   - sync()'s payload shape: LevelUp's own snapshot fields (table, myHand,
     uiMode, ...) — another game will have a different shape entirely.
   ============================================================================ */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') { window.LevelUp3D = { mount(){}, sync(){}, pickHandCard(){ return null; }, pickPile(){ return null; }, pickLayZone(){ return null; }, pickLayZoneCard(){ return null; }, pickMeld(){ return null; }, setHoveredLayZone(){}, setDragTargets(){}, setHandDragging(){}, isOverHandBand(){ return false; }, loadCharacterThumbnails(){ return Promise.resolve({}); }, mountCharPreview(){}, setCharPreview(){ return Promise.resolve(); } }; return; }

  const SEAT_COLORS = ['#5ec8a6', '#e0483a', '#2f6fd6', '#e0ac2b', '#8b5cf6', '#ff8fb3'];

  // Character models (real GLBs, chosen by each player before joining the
  // lobby — see game.js CHARACTERS/openCharSelect). id here must match
  // game.js's CHARACTERS[].id (kept as a small duplicated static map, same
  // pattern as SEAT_COLORS above: this file owns its own presentation
  // constants rather than importing config from game.js).
  //
  // Two GLBs per character (2026-09-09, Nutzerwunsch: real chairs instead of
  // the procedural one, still per-character customizable):
  // - CHAR_MODEL_FILES (this map): SEATED pose, no chair geometry of its own
  //   — used ONLY for the table avatar, combined with a separate seat GLB
  //   (see SEAT_MODEL_FILES/instantiateSeat below).
  // - CHAR_STAND_MODEL_FILES (same ids, "_stand" suffix): standing full-body
  //   pose — used ONLY for the char-select grid/thumbnails/big preview,
  //   where showing a chair makes no sense.
  // Verified directly from each GLB's accessor min/max (not guessed) that
  // both poses share one convention: floor at raw y≈0, figure centered on
  // x=0, +z = facing forward. The sit-pose additionally shares that
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
  // sit-pose characters above; every model's own "_seatpad" submesh tops out
  // at the same raw y=0.46 (checked across all six files directly), which is
  // what makes any character+seat pairing work without per-pair tuning.
  const SEAT_MODEL_FILES = {
    holzstuhl: 'seat_01_holzstuhl.glb', thron: 'seat_02_thron.glb', technik: 'seat_03_technik.glb',
    fass: 'seat_04_fass.glb', hocker: 'seat_05_hocker.glb', baumstumpf: 'seat_06_baumstumpf.glb'
  };
  const DEFAULT_SEAT_ID = 'holzstuhl';
  // Standing-pose preview height (char-select only — unrelated to the
  // seated table avatar, which uses the sit-pose GLBs at their own native
  // scale, see instantiateSitCharacter below). The 20 stand-pose source
  // models are exported at wildly inconsistent raw scales/origins (real
  // height 1.28m-1.5m depending on character, origin offset from a shared
  // Blender layout grid rather than each figure's own base) — verified by
  // reading each GLB's accessor min/max directly, not guessed.
  // loadCharacterModel() below normalizes every model the same way (centered
  // x/z, feet at local y=0, scaled to this fixed height) so they drop into
  // the preview rig interchangeably.
  const CHAR_TARGET_HEIGHT = 0.85;
  // id -> Promise<THREE.Group>. Each resolved group is a normalized "master"
  // that is NEVER added to a live scene directly — every use (char-select
  // thumbnail, big preview) adds a .clone(true) instead, so geometry/
  // materials stay shared (cheap) while each instance gets its own
  // transform. Because of that sharing, code that removes a clone from a
  // scene must plain .remove() it, never run it through the disposing
  // clearGroup()/disposeMeshLike() below — those would free geometry/
  // materials still in use by every other clone of the same character.
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
    const rim = new THREE.DirectionalLight(0x8fb0ff, 0.4); rim.position.set(-1.5, 0.6, -1); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(32, w / h, 0.05, 10);
    camera.position.set(0, 0.62, 1.45);
    camera.lookAt(0, 0.42, 0);
    return { renderer, scene, camera };
  }
  // Instantiates `id`, renders exactly one frame into rig, removes the
  // instance again (rig.scene stays empty between calls — callers read the
  // pixels off rig.renderer.domElement right after this resolves, either via
  // toDataURL for an offscreen thumbnail or directly since a mounted
  // #charPreviewCanvas already shows whatever was last rendered onto it).
  function renderCharacterFrame(rig, id) {
    return instantiateCharacter(id).then(inst => {
      rig.scene.add(inst);
      rig.renderer.render(rig.scene, rig.camera);
      rig.scene.remove(inst);
      return true;
    });
  }
  // Renders all characters once each into a shared offscreen canvas and
  // returns {id: dataURL}. Sequential (one GLTFLoader().load + render at a
  // time) rather than parallel — keeps GPU/memory pressure low for what's a
  // one-off, cached-after-first-open cost (see game.js's charThumbCache).
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
  // Big rotating... actually static, re-rendered-on-select preview shown
  // next to the char-select grid. Mounted once and reused across
  // open/cancel/reopen cycles of the char-select screen (a fresh
  // WebGLRenderer per open would leak GL contexts — browsers cap those
  // globally, and the main table canvas already holds one).
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
  const CARD_COLOR_HEX = { red: '#e0483a', blue: '#2f6fd6', green: '#2f9c60', yellow: '#e0ac2b' };
  const CARD_COLOR_BG = { red: ['#fff0ee', '#ffb7ac'], blue: ['#eaf3ff', '#a9c9ff'], green: ['#eafff3', '#9fe8bd'], yellow: ['#fff8df', '#ffce54'] };
  // Card number/border ink: everywhere else this just reuses CARD_COLOR_HEX,
  // but that hex IS the text color there too, and e0ac2b ("yellow") is a
  // light gold — on the pale yellow background it's low-contrast/hard to
  // read (both colors sit in the same light end of the scale). red/blue/
  // green's hues are dark enough against their own pale backgrounds to read
  // fine, so only yellow needs a dedicated, much darker ink for the number
  // and border while the background keeps its recognizable yellow hue.
  const CARD_COLOR_INK = { yellow: '#6b4400' };

  const CARD_W = 0.22, CARD_H = 0.305, CARD_T = 0.008;
  const TABLE_R = 1.55, TABLE_OVAL = 0.8, TABLE_TOP_Y = 0.72;
  // Felt top face sits at TABLE_TOP_Y + half its 0.06 thickness = 0.75. Anything
  // lying flat on the table needs clearance well above that or it z-fights with
  // the felt and flickers in and out depending on the camera angle/frame.
  const SURFACE_Y = TABLE_TOP_Y + 0.05;
  const SEAT_RX = 2.2, SEAT_RZ = 1.8;
  // The procedural chair (seat disc + legs + backrest) that used to live here
  // is gone (2026-09-09, Nutzerwunsch: real chair models instead, still
  // per-character customizable — see SEAT_MODEL_FILES/game.js SEATS). Seats
  // are now just an empty floor anchor at y=0 in the avatar group's local
  // frame — a seat model's own geometry sits on it, and a sit-pose character
  // model sits on top of THAT (see setSeatCharacter below, which loads both
  // per player and adds them side by side at identity transform — no extra
  // vertical offset needed, they share one raw coordinate space by
  // construction, see SEAT_MODEL_FILES comment). FALLBACK_MEEPLE_FLOOR_OFFSET
  // keeps the still-present procedural fallback meeple (used for bots /
  // while a model loads / on load failure) grounded at the same floor level
  // without having to re-tune every one of its individual mesh y-positions,
  // which were originally authored relative to the old chair's seat top
  // (0.485) rather than the floor.
  const FALLBACK_MEEPLE_FLOOR_OFFSET = 0.485;
  // Real sit-pose character + seat models both sit squarely on the floor
  // (local y=0) at identity transform, see instantiateSitCharacter/
  // instantiateSeat above — characterMount itself therefore needs no extra
  // offset either.
  const CHAR_SEAT_Y = 0, CHAR_SEAT_Z = 0;
  // Per-seat spotlight (Nutzerwunsch: "je ein Spotlight pro Spieler"). The
  // single overhead table spot (see mount()) is tightly aimed at the table
  // center and its cone falls off well before SEAT_RX/SEAT_RZ by design, so
  // without this every seated avatar reads only off the very dim ambient/fill
  // light — barely visible against the dark backroom background/fog. Local
  // coordinates below are in the AVATAR GROUP's own frame (child of av.group,
  // see buildAvatar), which already gets lookAt-oriented to face the table
  // center per seat — so "-Z" = outward/behind the seat (away from center,
  // where a real stage light rig would hang without blocking the camera's
  // view of the table) and "+Z" = toward the table, matching the "+Z is
  // toward center after lookAt" convention used by the arm nubs above.
  const SEAT_SPOT_INTENSITY = 1.3, SEAT_SPOT_DISTANCE = 3.4, SEAT_SPOT_ANGLE = THREE.MathUtils.degToRad(32),
    SEAT_SPOT_PENUMBRA = 0.7, SEAT_SPOT_DECAY = 1.6;

  // Orbit camera: position is recomputed every frame from these spherical
  // coordinates around ORBIT_TARGET (see updateOrbitCamera()/tick()), instead
  // of a single fixed camera.position set once in mount(). Azimuth is capped
  // well short of a full 360 — dragging peeks left/right at the neighboring
  // seats, it never spins around to look at the table from behind the
  // player's own seat. Elevation is capped so it can't flatten into a
  // straight top-down view or dip below the table edge. Radius (wheel zoom)
  // is capped so it can't zoom through the table or out past the fog.
  const ORBIT_TARGET = new THREE.Vector3(0, 0.62, 0);
  // Zoomed in further (Nutzerwunsch: table almost as wide as the viewport,
  // opponents near the screen edge) from the original 4.6/2.6/6.4.
  const ORBIT_RADIUS_DEFAULT = 2.7;
  const ORBIT_RADIUS_MIN = 1.9;
  const ORBIT_RADIUS_MAX = 3.9;
  const ORBIT_ELEV_DEFAULT = THREE.MathUtils.degToRad(54);
  const ORBIT_ELEV_MIN = THREE.MathUtils.degToRad(38);
  const ORBIT_ELEV_MAX = THREE.MathUtils.degToRad(74);
  const ORBIT_AZ_MAX = THREE.MathUtils.degToRad(62);
  const ORBIT_AZ_SENSITIVITY = 0.0055;
  const ORBIT_EL_SENSITIVITY = 0.0045;
  const ORBIT_ZOOM_SENSITIVITY = 0.0016;
  const ORBIT_EASE = 0.12;
  const WOBBLE_AXIS = new THREE.Vector3(0, 1, 0);

  // The hand fan is parented to the camera (camera-local space, not table
  // world space) so it behaves like a Tabletop-Simulator-style HUD docked to
  // the bottom edge of the view — always in the same place on screen,
  // regardless of the table underneath, and never overlapping it.
  const HAND_SCALE = 1.25;
  const HAND_TILT_X = 1.15;
  const HAND_Z = -1.55;
  // Raised from -0.66 (Nutzerwunsch: the leftmost card's corner number was
  // getting clipped by the bottom/edge of the canvas).
  const HAND_Y = -0.38;
  // How far the whole hand fan HUD drops (further local -Y, eased) while a
  // card is actively being dragged — Nutzerwunsch: the on-table lay-zone
  // plates (see buildLayZones) sit low/close to the camera and were getting
  // covered by the resting hand fan sitting right in front of them. Dropping
  // the fan mostly out of frame during a drag reveals them. Purely a
  // game.render3d.js-local animation, driven by setHandDragging() below —
  // game.js just reports drag start/end, same split as everywhere else in
  // this file (game.js owns rules, this file owns how state looks).
  const HAND_DRAG_DROP = 0.85;
  const HAND_DRAG_EASE = 0.22;
  // Dedicated light for the hand fan (Nutzerwunsch-Bugfix, 2026-09-08: "der
  // Fokusstrahler sollte sich beim Rauszoomen mit den Handkarten bewegen").
  // The hand fan is camera-anchored HUD (see handFanGroup below) so its
  // WORLD position moves every time the camera orbits/zooms, but until now
  // it was lit only by the fixed, narrow overhead table spot (see mount())
  // plus the near-black ambient/fill — as soon as zooming out moved the fan
  // out of that spot's cone, the hand went almost completely dark. Fix: a
  // small PointLight parented to the camera itself (not to handFanGroup,
  // whose local axes are tilted by HAND_TILT_X — a point light has no
  // direction, so camera-local coordinates are simpler here), positioned
  // just above/in front of the fan so it always travels with it regardless
  // of orbit/zoom. Distance is capped short so it doesn't meaningfully spill
  // onto the table itself and fight the "dark room, one spotlight" look.
  const HAND_LIGHT_Y = 0.55, HAND_LIGHT_Z = HAND_Z + 0.55;
  const HAND_LIGHT_INTENSITY = 1.7, HAND_LIGHT_DISTANCE = 2.6, HAND_LIGHT_DECAY = 2;
  // renderOrder values used to force hand-card draw order (see buildHandFan)
  // well above every other renderOrder already in use in the scene (name
  // sprites use 10) so hand cards always draw over the table/avatars, and a
  // hovered card always draws over its resting neighbors.
  const HAND_CARD_RENDER_BASE = 100;
  const HAND_CARD_RENDER_HOVER = 5000;
  // Meld cards sit flat, overlapping side-by-side at the exact same Y within
  // a group (see buildMelds) — without a forced draw order that's classic
  // z-fighting (cards flicker/shimmer through each other depending on camera
  // angle/frame). Same painter's-algorithm fix as the hand fan: renderOrder
  // ascending by card RANK (not array position) + depthTest:false/
  // depthWrite:false, so the highest-ranked card in the group always ends up
  // drawn last, i.e. visibly on top, regardless of viewing angle. Kept well
  // below HAND_CARD_RENDER_BASE so the hand fan HUD always wins over table
  // melds if the two ever overlap on screen.
  const MELD_CARD_RENDER_BASE = 20;
  // How far the hovered card should visually move in camera/screen space —
  // up, and a bit toward the viewer — converted into the fan group's own
  // (tilted) local axes in tickHandFan() via the inverse of its rotation.x.
  // Setting these as plain local-Y/Z offsets instead (the naive approach)
  // mostly pushed the card toward the camera and barely upward, or even
  // slightly *down* toward the screen edge, because the fan group's local Y
  // axis is tilted ~66° away from screen-up by HAND_TILT_X.
  //
  // This animated pivot is purely cosmetic — picking is done in
  // buildHandFan()/pickHandCard() against a separate, never-animated hitbox
  // per card. It didn't use to be: picking used to raycast this same
  // animated mesh, which caused a hover flicker / "can't select a card" bug
  // — lifting a card rotates and shifts its thin box (and, for anything off
  // the camera's dead center, moving it toward the camera also drifts its
  // screen position via ordinary perspective parallax), so a ray aimed at a
  // fixed screen point could stop hitting the very card it had just started
  // hovering, dropping the hover, letting it ease back down, bringing it
  // back under the ray, re-triggering the hover — an oscillation, with
  // clicks landing mid-swing just missing. A hitbox that never moves removes
  // that feedback loop regardless of how the visual pivot is animated.
  const HOVER_LIFT_Y = 0.42;
  const HOVER_FORWARD_Z = 0.14;
  const HAND_TILT_COS = Math.cos(HAND_TILT_X), HAND_TILT_SIN = Math.sin(HAND_TILT_X);
  // Resting-fan bow: how far the outermost cards dip below the center card,
  // in the same camera-space-Y sense as HOVER_LIFT_Y above (converted via
  // the same HAND_TILT_COS/SIN inverse-rotation). A plain local-Y dip here
  // (the old approach, magnitude 0.09) barely read as an arc on screen for
  // the same reason a naive hover offset didn't: the fan group's local Y
  // axis is tilted ~66° away from screen-up, so most of a local-Y-only
  // offset shows up as depth, not screen height. Routing it through
  // camera-space first is what makes the resting hand actually look like a
  // held fan of cards (center highest, ends curling down and away) instead
  // of a nearly flat row.
  const FAN_BOW_SCREEN_Y = 0.62;
  // Per-card "opened outward" tilt: each card should look rolled around the
  // CAMERA's own forward axis (like a real hand of cards fanned open toward
  // the viewer) — that reads as a clean, obvious bevel per card. Rotating
  // the pivot around its own local Z axis instead (the naive approach) rolls
  // it around an axis that itself sits inside the tilted fan group, which —
  // exactly like the naive position offsets above — ends up mixed with the
  // group's HAND_TILT_X and looks like a much weaker, skewed tilt instead of
  // a clean fan-blade opening. The fix is the same trick as the position
  // conversions above, just for a rotation instead of a translation: the
  // local axis that maps to the camera's actual forward (Z) axis once
  // HAND_TILT_X is applied is (0, sinθ, cosθ) — i.e. (0, HAND_TILT_SIN,
  // HAND_TILT_COS) — so rotating each card around THAT local axis (via
  // quaternion, not plain Euler rotation.z) is what actually shows up on
  // screen as the card rolling open around its own vertical screen axis.
  const FAN_ROLL_AXIS = new THREE.Vector3(0, HAND_TILT_SIN, HAND_TILT_COS);
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const _fanRollQuat = new THREE.Quaternion();
  const _fanTiltQuat = new THREE.Quaternion();

  let renderer, scene, camera, canvas, resizeObs;
  let tableGroup, pilesGroup, meldsGroup, skipsGroup, handFanGroup, layZoneGroup, flightGroup;
  const seats = []; // {group, nameSprite, glow, stackGroup, seed}
  const textureCache = new Map();
  let backTexture = null;
  let raf = null;
  let t0 = null;
  const _wobbleQuat = new THREE.Quaternion();

  // orbitAzimuth/orbitElevation are the eased (current) camera angles;
  // orbitTargetAzimuth/orbitTargetElevation are set instantly by drag input
  // and tick() eases toward them each frame — this is what makes the swing
  // feel like a smooth pan around the table instead of snapping the view.
  let orbitAzimuth = 0, orbitElevation = ORBIT_ELEV_DEFAULT, orbitRadius = ORBIT_RADIUS_DEFAULT;
  let orbitTargetAzimuth = 0, orbitTargetElevation = ORBIT_ELEV_DEFAULT, orbitTargetRadius = ORBIT_RADIUS_DEFAULT;
  let orbitDragging = false, orbitLastX = 0, orbitLastY = 0;

  // Hand-card picking/hover state. handCardEntries holds one entry per hand
  // card: {pivot, mesh, cardId, base:{x,y,z,rotZ}, hoverT}. hoverT eases
  // toward 1 for the pointed-at card and 0 for the rest each tick(), giving
  // the lift/enlarge/"turn to face you" animation without any extra libs.
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  const handBandVec = new THREE.Vector3();
  let handCardEntries = [];
  let hoveredCardId = null;
  let touchHoverTimer = null;

  // Discard-pile and laid-down-meld hover: same "ease hoverT toward 0/1, lift
  // + enlarge" idea as the hand fan, but these live in table/world space, not
  // camera space, so there's no HAND_TILT_X conversion needed — a plain
  // local-Y lift already reads as "up" here since these meshes aren't inside
  // a heavily tilted parent group. discardEntry is null when there's no
  // discard pile yet. meldEntries holds one entry per laid-down group
  // ("Phase" in the German ruleset naming) — {pivot, key, baseY, hoverT} —
  // hovering any card in a group lifts the whole pivot, not just that card.
  let discardEntry = null;
  let hoveredDiscard = false;
  let meldEntries = [];
  let hoveredMeldKey = null;
  const PILE_HOVER_LIFT = 0.09;
  const PILE_HOVER_SCALE = 0.22;
  const MELD_HOVER_LIFT = 0.15;
  const MELD_HOVER_SCALE = 0.22;
  // "Where can this dragged card legally go?" — set once per drag by
  // game.js via setDragTargets() (see computeDropTargets() there), null
  // whenever no drag is in progress. tickDiscardHover()/tickMeldHover() ease
  // toward a lower, constant "armed" lift/scale for anything in here even
  // without the pointer actually being over it, on top of the existing
  // hover-only lift for whatever the pointer IS currently over — so a player
  // sees every legal drop spot light up the instant they start dragging, not
  // just the one they happen to be pointing at.
  let dragArmed = null;
  const ARMED_LEVEL = 0.45;
  // Set by setHandDragging() (called from game.js's startCardDrag once an
  // actual drag crosses the DRAG_THRESHOLD, cleared on pointerup) — distinct
  // from dragArmed above, which also gets set for a purely tap-selected
  // "Anlegen" target with no pointer drag in progress at all. Only a REAL
  // drag should drop the hand fan out of the way.
  let handDragActive = false;
  let handDragT = 0;

  // Meld preview: hovering a laid-down group also flies a big, readable,
  // straight-on row of its cards into a fixed spot in the player's view
  // (camera-child HUD, like the hand fan) — the small in-place lift above
  // is barely readable from the default orbit angle/distance, especially
  // for another player's group across the table. meldPreviewKey tracks
  // which group is currently built into meldPreviewGroup; meldPreviewT
  // eases 0->1 in/out and drives a pure scale-in (0 scale reads as hidden,
  // no transparency/blending needed).
  let meldPreviewGroup;
  let meldPreviewKey = null;
  let meldPreviewT = 0;
  const MELD_PREVIEW_SCALE = 1.55;
  const MELD_PREVIEW_GAP = 0.34;
  const MELD_PREVIEW_EASE = 0.18;
  const MELD_PREVIEW_Y = 0.5;
  const MELD_PREVIEW_Z = -1.45;
  const MELD_PREVIEW_RENDER = 8000;

  // On-table lay-down zones: shown only while uiMode==='laying', one flat
  // plate per group letter (A/B/…) in front of the player's own seat —
  // world-space (children of tableGroup), unlike the camera-fixed hand fan/
  // meld preview, since this is meant to read as a literal spot on the
  // table to drop a card onto, redundant with (not a replacement for) the
  // HTML #layTrayBox trays. layZoneEntries mirrors meldEntries' shape.
  let layZoneEntries = [];
  // One entry per card currently resting on a lay zone plate (assigned via
  // layAssignment but not yet confirmed) — {mesh, cardId, trayIndex}. Lets a
  // pointerdown directly on such a card start a drag to re-assign it to a
  // different tray, the on-table counterpart of re-dragging a chip between
  // the HTML #layTrayBox trays (see pickLayZoneCard()/game.js's tableCanvas
  // pointerdown handler).
  let layZoneCardEntries = [];
  let hoveredLayZoneIndex = null;
  const LAY_ZONE_ANCHOR = 0.7;
  // Must clear a plate's own depth (CARD_H*1.4 ≈ 0.43) so consecutive trays
  // (see the rowStep stacking below, same "one further back per row" trick
  // as buildMelds) don't visually overlap.
  const LAY_ZONE_ROW_STEP = 0.46;
  const LAY_ZONE_OPACITY_BASE = 0.16;
  const LAY_ZONE_OPACITY_HOVER = 0.34;

  // Flight animations: transient cards that fly from a pile to a hand (draw)
  // or from a hand to a pile/seat (discard, skip). World-space (children of
  // scene directly, not tableGroup, to keep the math simple — tableGroup
  // has no offset of its own so the two spaces coincide anyway) so a plain
  // raycaster-independent lerp works regardless of the current orbit
  // camera. Purely decorative: the "real" state (new hand, new pile height)
  // is already rendered underneath by the same sync() call that spawned the
  // flight, so a flight is free to be dropped/skipped without desyncing
  // anything.
  let activeFlights = [];
  let lastHandledEventId = null;
  let lastTickTime = null;
  const FLIGHT_DURATION = 0.5;
  const FLIGHT_ARC = 0.32;
  const SHUFFLE_FLIGHT_COUNT = 8;
  const DECK_POS = new THREE.Vector3(-0.16, SURFACE_Y + 0.01, 0);
  const DISCARD_POS = new THREE.Vector3(0.16, SURFACE_Y + 0.015, 0);

  // [REUSABLE] generic rounded-rect path — see file-top REUSE MAP.
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // [REUSABLE] generic draw-to-CanvasTexture helper — see file-top REUSE MAP.
  function makeCanvasTexture(draw, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function cardKey(card) {
    if (!card) return 'back';
    if (card.type === 'wild') return 'wild';
    if (card.type === 'skip') return 'skip';
    return card.color + '-' + card.value;
  }

  function getCardFrontTexture(card) {
    const key = cardKey(card);
    if (textureCache.has(key)) return textureCache.get(key);
    const tex = makeCanvasTexture((c, w, h) => {
      c.clearRect(0, 0, w, h);
      if (card.type === 'wild') {
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#f0a8ff'); g.addColorStop(.4, '#8b5cf6'); g.addColorStop(.7, '#65a8ff'); g.addColorStop(1, '#57d68d');
        c.fillStyle = g; roundRect(c, 8, 8, w - 16, h - 16, 26); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 4; c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold ' + Math.round(h * 0.34) + 'px Georgia,serif';
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', w / 2, h / 2 + 4);
      } else if (card.type === 'skip') {
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#4b5563'); g.addColorStop(1, '#1f2430');
        c.fillStyle = g; roundRect(c, 8, 8, w - 16, h - 16, 26); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; c.stroke();
        c.strokeStyle = '#ff8f8f'; c.lineWidth = Math.round(w * 0.09);
        c.beginPath(); c.arc(w / 2, h / 2, w * 0.28, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(w * 0.32, h * 0.68); c.lineTo(w * 0.68, h * 0.32); c.stroke();
      } else {
        const bg = CARD_COLOR_BG[card.color] || ['#fff', '#ddd'];
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
        c.fillStyle = g; roundRect(c, 8, 8, w - 16, h - 16, 26); c.fill();
        const ink = CARD_COLOR_INK[card.color] || CARD_COLOR_HEX[card.color] || '#333';
        c.strokeStyle = ink; c.lineWidth = 4; c.stroke();
        c.fillStyle = ink;
        c.font = 'bold ' + Math.round(h * 0.4) + 'px Georgia,serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(card.value), w / 2, h / 2 + 6);
        c.font = 'bold ' + Math.round(h * 0.13) + 'px Georgia,serif';
        c.textAlign = 'left'; c.fillText(String(card.value), w * 0.12, h * 0.18);
      }
    }, 128, 178);
    textureCache.set(key, tex);
    return tex;
  }

  function getBackTexture() {
    if (backTexture) return backTexture;
    backTexture = makeCanvasTexture((c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#1d4d43'); g.addColorStop(1, '#0a1a17');
      c.fillStyle = g; roundRect(c, 6, 6, w - 12, h - 12, 22); c.fill();
      c.strokeStyle = '#5ec8a6'; c.lineWidth = 5; c.stroke();
      c.strokeStyle = 'rgba(94,200,166,.55)'; c.lineWidth = 3;
      for (let i = -h; i < w; i += 16) { c.beginPath(); c.moveTo(i, h); c.lineTo(i + h, 0); c.stroke(); }
      c.fillStyle = '#5ec8a6'; c.font = 'bold ' + Math.round(w * 0.22) + 'px system-ui,sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('10', w / 2, h / 2);
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

  // Two lines: name on top, level + hand-card count below — "Lv"/"×" are
  // left untranslated on purpose, matching how this badge already hardcoded
  // "Lv" before hand-count was added: it's a compact 3D decoration built
  // from plain numbers, not a UI string, so game.js never passes it through
  // tr()/i18n (see buildSyncPayload/sync() — only player.name is user text).
  // [REUSABLE] generic name-badge-over-avatar sprite — see file-top REUSE MAP.
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
      c.fillStyle = 'rgba(6,18,12,.8)'; c.fill();
      c.strokeStyle = hex; c.lineWidth = 4; c.stroke();
      c.fillStyle = '#eafff6';
      c.font = 'bold 54px system-ui,sans-serif';
      c.fillText(name, w / 2, sub ? h * 0.36 : h / 2);
      if (sub) {
        c.font = '700 38px system-ui,sans-serif';
        c.fillStyle = 'rgba(234,255,246,.8)';
        c.fillText(sub, w / 2, h * 0.67);
      }
    }, 560, 190);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const spr = new THREE.Sprite(mat);
    // Bumped again after the first pass (0.72/0.235) still read as "too
    // small" from the default orbit distance — this is meant to be readable
    // at a glance across the table, not a subtle label.
    spr.scale.set(1.0, 0.34, 1);
    spr.renderOrder = 10;
    return spr;
  }

  // [REUSABLE] generic fallback-meeple avatar rig — see file-top REUSE MAP.
  function buildAvatar(hex) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: hex, roughness: .75, metalness: .05 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c9a0, roughness: .8 });

    // Procedural fallback meeple (lathe-profile body, head, arms) — its own
    // sub-group so it can be hidden in one line once a real character model
    // (see characterMount below) has finished loading for this seat. Stays
    // the visible avatar for bots, for a player whose character model is
    // still loading, and as a safety net if a model fails to load. Shifted
    // down by FALLBACK_MEEPLE_FLOOR_OFFSET (see above) now that the chair
    // mesh that used to sit under it is gone — its individual mesh
    // y-positions below are otherwise untouched from when it sat on that
    // chair's seat top.
    const meepleGroup = new THREE.Group();
    meepleGroup.position.y = -FALLBACK_MEEPLE_FLOOR_OFFSET;
    g.add(meepleGroup);

    // rounded meeple body (lathe profile), sitting on the chair
    const profile = [[0, 0], [0.24, 0.02], [0.27, 0.18], [0.2, 0.4], [0.14, 0.53], [0.0, 0.57]].map(p => new THREE.Vector2(p[0], p[1]));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), bodyMat);
    body.position.y = 0.49; meepleGroup.add(body);

    // head
    const headY = 1.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), skinMat);
    head.position.y = headY; meepleGroup.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), bodyMat);
    visor.position.y = headY; visor.scale.set(1.05, 0.9, 1.05); meepleGroup.add(visor);

    // little arm nubs reaching toward the table (+Z is "toward center" after lookAt)
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

    // Per-player spotlight, hung above/behind the seat, aimed down at the
    // character and the near edge of the table in front of them (see
    // SEAT_SPOT_* comment above SEAT_RX). Attached as children of g rather
    // than tracked/positioned separately in tableGroup/scene: g already gets
    // lookAt-oriented per seat and add/removed wholesale in ensureSeats(), so
    // riding along as children means the light's aim and lifecycle both come
    // for free — no separate bookkeeping needed. No castShadow: the single
    // overhead spot already carries the scene's one shadow map, and six more
    // shadow-casting lights would be needless render cost for a subtle fill.
    const seatSpot = new THREE.SpotLight(
      new THREE.Color(hex).lerp(new THREE.Color(0xfff2d8), 0.65),
      SEAT_SPOT_INTENSITY, SEAT_SPOT_DISTANCE, SEAT_SPOT_ANGLE, SEAT_SPOT_PENUMBRA, SEAT_SPOT_DECAY
    );
    seatSpot.position.set(0, 2.1, -0.35);
    seatSpot.target.position.set(0, 0.95, 0.15);
    g.add(seatSpot, seatSpot.target);

    // Dark-room spotlight look (see mount()): avatars need to both cast a
    // shadow onto the table/each other and receive shadows on their own
    // bodies to read as three-dimensional under a single overhead light,
    // instead of flatly lit. Blanket-applied via traverse rather than per
    // mesh above since it's every solid part of the fallback rig (body, head,
    // arms) — the glow ring's MeshBasicMaterial ignores shadows entirely so
    // flagging it too is harmless.
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
      // Clones share geometry/materials with the cache (see characterCache
      // above) — plain .remove(), never clearGroup()'s disposing traversal.
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

  // Disposes geometries/materials recursively (hand-fan cards are wrapped in
  // pivot groups, so children are no longer always meshes directly). Texture
  // maps are never disposed here — they all come from textureCache/
  // backTexture and are meant to be reused across rebuilds.
  // [REUSABLE] generic recursive Three.js dispose — see file-top REUSE MAP.
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

  // [REUSABLE] generic even-ring seat layout — see file-top REUSE MAP.
  function seatAngle(localIndex, n) {
    // local index 0 = nearest the camera (front); spread evenly around the ellipse.
    return Math.PI / 2 + (localIndex / n) * Math.PI * 2;
  }

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
      av.group.userData.baseX = x;
      av.group.userData.baseZ = z;
      av.group.position.set(x, 0, z);
      av.group.lookAt(0, 0.55, 0);
      // tick()'s idle wobble must rotate relative to THIS orientation rather
      // than overwrite rotation.y directly. lookAt() here tilts the seat
      // toward table height, which mixes into all three Euler axes at once —
      // it is not a pure yaw. Stomping rotation.y each frame (the previous
      // code) discarded that mix and re-derived a bogus one from the
      // leftover x/z, which is what threw seated avatars face-first into the
      // table instead of a small idle sway. Storing the quaternion and
      // composing the wobble on top (see tick()) keeps the base pose intact.
      av.group.userData.baseQuat = av.group.quaternion.clone();
    });
  }

  function buildTable() {
    const felt = new THREE.MeshStandardMaterial({ color: 0x1d4d43, roughness: .85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: .55, metalness: .12 });
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
    scene.background = new THREE.Color(0x030705);
    scene.fog = new THREE.Fog(0x030705, 3.6, 9);

    camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
    // Position/orientation are driven every frame from orbitAzimuth/
    // orbitElevation by updateOrbitCamera() (see tick()), not set once here.
    // Added to the scene graph (not left parentless) purely so its children
    // — the camera-anchored hand-fan HUD — get traversed and rendered too;
    // this does not change the camera's own world transform above.
    scene.add(camera);

    // "Dark backroom, single spotlight over the table" look (Nutzerwunsch):
    // ambient is kept just barely above black (so seated opponents read as
    // present but dim, never fully invisible) and the spotlight does almost
    // all of the actual illumination, tightly aimed at the table so its cone
    // falls off well before reaching the seats at SEAT_RX/SEAT_RZ.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.add(new THREE.AmbientLight(0x2a3830, 0.22));
    const spot = new THREE.SpotLight(0xfff2d8, 1.6, 9, THREE.MathUtils.degToRad(34), 0.6, 1.4);
    spot.position.set(0, 3.3, 0.25);
    spot.target.position.set(0, TABLE_TOP_Y, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 1.2;
    spot.shadow.camera.far = 7;
    spot.shadow.bias = -0.0025;
    scene.add(spot, spot.target);
    // Very dim fill so the far side of a seated opponent isn't pure black —
    // a hint of shape/depth, not real illumination.
    const fill = new THREE.DirectionalLight(0x4a6a8a, 0.14);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    tableGroup = new THREE.Group();
    tableGroup.add(buildTable());
    scene.add(tableGroup);

    pilesGroup = new THREE.Group();
    tableGroup.add(pilesGroup);

    meldsGroup = new THREE.Group();
    tableGroup.add(meldsGroup);

    skipsGroup = new THREE.Group();
    tableGroup.add(skipsGroup);

    layZoneGroup = new THREE.Group();
    tableGroup.add(layZoneGroup);

    // Not parented to tableGroup: flights are timed, one-shot effects that
    // should keep flying at their own pace even if a future change ever
    // gives tableGroup its own transform/animation — scene-direct avoids
    // that coupling, and today the two spaces are identical anyway (see
    // DECK_POS/DISCARD_POS comment above).
    flightGroup = new THREE.Group();
    scene.add(flightGroup);

    // Own hand fan: parented to the camera (see HAND_* consts) so it reads as
    // a HUD docked to the bottom edge of the screen, like Tabletop
    // Simulator's hand tray — independent of the table underneath it.
    handFanGroup = new THREE.Group();
    handFanGroup.position.set(0, HAND_Y, HAND_Z);
    handFanGroup.rotation.x = HAND_TILT_X;
    camera.add(handFanGroup);

    // See HAND_LIGHT_* comment above — rides along with the camera (and
    // therefore the hand fan) instead of being fixed to the table.
    const handLight = new THREE.PointLight(0xfff2d8, HAND_LIGHT_INTENSITY, HAND_LIGHT_DISTANCE, HAND_LIGHT_DECAY);
    handLight.position.set(0, HAND_LIGHT_Y, HAND_LIGHT_Z);
    camera.add(handLight);

    // Same camera-child HUD trick as the hand fan (see comment above), just
    // parked higher up so a previewed meld's cards read clearly without
    // covering the hand. Starts at scale 0 (hidden) — see tickMeldPreview().
    meldPreviewGroup = new THREE.Group();
    meldPreviewGroup.position.set(0, MELD_PREVIEW_Y, MELD_PREVIEW_Z);
    meldPreviewGroup.rotation.x = HAND_TILT_X;
    meldPreviewGroup.scale.setScalar(0);
    meldPreviewGroup.visible = false;
    camera.add(meldPreviewGroup);

    resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(canvas.parentElement);
    onResize();
    attachHandPointerEvents();
    attachOrbitPointerEvents();
    updateOrbitCamera();

    t0 = performance.now();
    tick();
  }

  // [REUSABLE] generic orbit-camera math — see file-top REUSE MAP.
  function updateOrbitCamera() {
    const horiz = orbitRadius * Math.cos(orbitElevation);
    camera.position.set(
      horiz * Math.sin(orbitAzimuth),
      ORBIT_TARGET.y + orbitRadius * Math.sin(orbitElevation),
      horiz * Math.cos(orbitAzimuth)
    );
    camera.lookAt(ORBIT_TARGET);
  }

  // Drag-to-orbit swings the camera azimuth left/right and its elevation
  // between a shallower and a steeper look-down angle, like leaning over the
  // table to see past the seats on either side. Only engages when the
  // pointer doesn't land on a hand card (checked via the same raycast
  // game.js uses), so it never competes with the card-drag started there —
  // and it tracks pointermove/up on window rather than the canvas, matching
  // that same drag's pattern, so the swing keeps following the pointer even
  // if it leaves the canvas mid-drag. Wheel zoom just adjusts orbitRadius
  // within the same eased target/current pair as azimuth/elevation.
  // [REUSABLE] generic drag-to-orbit + wheel-zoom input handling — see
  // file-top REUSE MAP. The only game-specific line is the pickHandCard/
  // pickPile guard in the pointerdown handler below — swap that for
  // whatever your own game's "don't start an orbit here" check is.
  function attachOrbitPointerEvents() {
    canvas.addEventListener('pointerdown', e => {
      if (pickHandCard(e.clientX, e.clientY) || pickPile(e.clientX, e.clientY) || pickLayZoneCard(e.clientX, e.clientY)) return;
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

  // Table-space counterpart of pickHandCard(): lets a click directly on the
  // draw pile or the discard pile's top card draw from it, instead of only
  // through the drawDeckBtn/drawDiscardBtn buttons. Returns 'deck',
  // 'discard' or null — game.js still does all the turn/rule validation
  // before actually calling act('draw', ...), this only answers "what's
  // under the pointer".
  function pickPile(clientX, clientY) {
    if (!camera || !canvas || !pilesGroup || !pilesGroup.children.length) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const meshes = pilesGroup.children.filter(m => m.userData.hoverKind === 'deck' || m.userData.hoverKind === 'discard');
    if (!meshes.length) return null;
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object.userData.hoverKind : null;
  }

  function setHoveredCard(cardId) {
    if (hoveredCardId === cardId) return;
    hoveredCardId = cardId;
    canvas.style.cursor = cardId ? 'pointer' : '';
  }

  // Raycasts against the discard-pile top card and every laid-down-meld
  // card — the table-space counterpart of pickHandCard(), used only to
  // drive the hover-lift/enlarge look (see tickDiscardHover()/
  // tickMeldHover()), never for clicks: the 3D table stays non-interactive
  // beyond the hand, laying down/hitting still goes through the 2D
  // #tableMelds list.
  function pickWorldHover(clientX, clientY) {
    if (!camera || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const meshes = [];
    if (discardEntry) meshes.push(discardEntry.mesh);
    meldEntries.forEach(e => e.pivot.children.forEach(c => meshes.push(c)));
    if (!meshes.length) return null;
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object.userData : null;
  }

  function setHoveredDiscard(on) { hoveredDiscard = on; }
  function setHoveredMeld(key) { hoveredMeldKey = key; }

  // Called by game.js's startCardDrag() once per drag (drag-start with the
  // freshly computed targets, drag-end with null) — see dragArmed above.
  function setDragTargets(targets) {
    if (!targets) { dragArmed = null; return; }
    dragArmed = {
      layZones: new Set(targets.layZones || []),
      melds: new Set(targets.melds || []),
      discard: !!targets.discard
    };
  }

  // Raycast counterpart used on drop (startCardDrag's onUp): which laid-down
  // group, if any, is under the pointer — returns {pid,groupIndex} or null.
  // Restricted to meldEntries' own card meshes (buildMelds tags each with
  // meldPid/meldGroupIndex), the same set pickWorldHover() already uses for
  // hover, just resolved to concrete ids instead of the opaque hover key.
  function pickMeld(clientX, clientY) {
    if (!camera || !canvas || !meldEntries.length) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const meshes = [];
    meldEntries.forEach(e => e.pivot.children.forEach(c => meshes.push(c)));
    if (!meshes.length) return null;
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const ud = hits[0].object.userData;
    return ud.meldPid != null ? { pid: ud.meldPid, groupIndex: ud.meldGroupIndex } : null;
  }

  // Mouse gets continuous hover (pointermove). Touch has no hover concept,
  // so a touchstart on a card triggers the same lift as a "peek" and it
  // settles back down shortly after release — the closest touch equivalent
  // to a mouse hover, as requested.
  function attachHandPointerEvents() {
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const cardId = pickHandCard(e.clientX, e.clientY);
      setHoveredCard(cardId);
      if (cardId) {
        setHoveredDiscard(false);
        setHoveredMeld(null);
      } else {
        const hit = pickWorldHover(e.clientX, e.clientY);
        setHoveredDiscard(!!(hit && hit.hoverKind === 'discard'));
        setHoveredMeld(hit && hit.hoverKind === 'meld' ? hit.meldKey : null);
        // Cursor-only affordance for "this pile is clickable" — game.js does
        // the actual turn/rule validation when the click lands, this just
        // hints that something is there before the click.
        canvas.style.cursor = (pickPile(e.clientX, e.clientY) || pickLayZoneCard(e.clientX, e.clientY)) ? 'pointer' : '';
      }
    });
    canvas.addEventListener('pointerleave', e => {
      if (e.pointerType === 'touch') return;
      setHoveredCard(null);
      setHoveredDiscard(false);
      setHoveredMeld(null);
    });
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      if (touchHoverTimer) { clearTimeout(touchHoverTimer); touchHoverTimer = null; }
      setHoveredCard(pickHandCard(e.clientX, e.clientY));
    });
    window.addEventListener('pointerup', e => {
      if (e.pointerType !== 'touch' || !hoveredCardId) return;
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

  function buildPiles(drawCount, discardTop) {
    clearGroup(pilesGroup);
    discardEntry = null;
    const n = Math.min(20, Math.max(0, drawCount));
    for (let i = 0; i < n; i++) {
      const m = cardMesh(null, false);
      m.position.set(-0.16, SURFACE_Y + i * 0.009, 0);
      m.rotation.y = (Math.random() - 0.5) * 0.06;
      // Tagged on every card in the stack (not just the visual top one) so
      // pickPile() hits the pile regardless of which card-back the ray
      // happens to land on.
      m.userData.hoverKind = 'deck';
      pilesGroup.add(m);
    }
    if (discardTop) {
      const baseY = SURFACE_Y + 0.01;
      const m = cardMesh(discardTop, true);
      m.position.set(0.16, baseY, 0);
      m.rotation.y = 0.15;
      m.userData.hoverKind = 'discard';
      pilesGroup.add(m);
      discardEntry = { mesh: m, baseY, baseScale: 1, hoverT: 0 };
    }
  }

  // Laid-down level groups, arranged as clean readable rows on the table
  // between each player's seat and the center — so everyone can see at a
  // glance what is already down and whether their cards could extend it.
  // Each group ("Phase" in the German ruleset naming) gets its own pivot so
  // hovering any card in it can lift/enlarge the whole group as one piece —
  // see tickMeldHover() — rather than just the single card under the mouse.
  function buildMelds(table, seatOrder) {
    clearGroup(meldsGroup);
    meldEntries = [];
    seatOrder.forEach((pid, i) => {
      const groups = table[pid];
      if (!groups || !groups.length) return;
      const seat = seats[i];
      if (!seat) return;
      const bx = seat.group.userData.baseX, bz = seat.group.userData.baseZ;
      const dist = Math.hypot(bx, bz) || 1;
      const outX = bx / dist, outZ = bz / dist;
      const tanX = -outZ, tanZ = outX;
      const anchorX = bx * 0.46, anchorZ = bz * 0.46;
      groups.forEach((grp, gi) => {
        const rowStep = gi * 0.32;
        const rowX = anchorX - outX * rowStep, rowZ = anchorZ - outZ * rowStep;
        const cardGap = CARD_W * 0.62;
        const baseY = SURFACE_Y + gi * 0.004;
        const key = pid + '-' + gi;
        const pivot = new THREE.Group();
        pivot.position.set(rowX, baseY, rowZ);
        meldsGroup.add(pivot);
        const rotY = Math.atan2(tanX, tanZ);
        // Cards within a group all sit flat at the exact same Y, overlapping
        // side-by-side by design (cardGap < CARD_W) — without a forced draw
        // order that's z-fighting (see MELD_CARD_RENDER_BASE above), cards
        // flicker/shimmer through their neighbors depending on camera angle.
        // Fixed via the same painter's-algorithm trick as the hand fan:
        // renderOrder ascending by RANK (not array/spread position), plus
        // depthTest:false/depthWrite:false, so the group always looks like a
        // clean stack with its highest card fully on top, regardless of
        // where that card happens to sit in the row or how the camera is
        // angled.
        const rankOf = c => (typeof c.repValue === 'number') ? c.repValue : (typeof c.value === 'number') ? c.value : 99;
        const rankOrder = grp.cards.map((c, ci) => ci).sort((a, b) => rankOf(grp.cards[a]) - rankOf(grp.cards[b]));
        const drawOrder = new Array(grp.cards.length);
        rankOrder.forEach((ci, order) => { drawOrder[ci] = order; });
        grp.cards.forEach((card, ci) => {
          const spread = (ci - (grp.cards.length - 1) / 2) * cardGap;
          const m = cardMesh(card, true);
          // Positioned relative to the pivot (which already sits at rowX/
          // rowZ), so this only needs the tangential spread — the pivot
          // itself is never rotated, so world-aligned tanX/tanZ still apply
          // directly as a local offset here.
          m.position.set(tanX * spread, 0, tanZ * spread);
          m.rotation.y = rotY;
          m.renderOrder = MELD_CARD_RENDER_BASE + gi * 20 + drawOrder[ci];
          m.material.forEach(mat => { mat.depthTest = false; mat.depthWrite = false; });
          m.userData.hoverKind = 'meld';
          m.userData.meldKey = key;
          m.userData.meldPid = pid;
          m.userData.meldGroupIndex = gi;
          pivot.add(m);
        });
        meldEntries.push({ pivot, key, baseY, hoverT: 0, cards: grp.cards });
      });
    });
  }

  // A pending skip (Aussetzer) card sits face-up closer to its target's seat
  // than any meld row (0.74 here vs. buildMelds' 0.46 anchor) — a visible
  // marker that the card has already been played against this player and
  // their next turn is spoken for, instead of the old invisible flag that
  // only showed up as a toast once the skip actually happened.
  function buildPendingSkips(players, seatOrder) {
    clearGroup(skipsGroup);
    seatOrder.forEach((pid, i) => {
      const p = players.find(pl => pl.id === pid);
      if (!p || !p.pendingSkipCard) return;
      const seat = seats[i];
      if (!seat) return;
      const bx = seat.group.userData.baseX, bz = seat.group.userData.baseZ;
      const dist = Math.hypot(bx, bz) || 1;
      const outX = bx / dist, outZ = bz / dist;
      const m = cardMesh(p.pendingSkipCard, true);
      m.position.set(bx * 0.74, SURFACE_Y + 0.012, bz * 0.74);
      m.rotation.y = Math.atan2(outX, outZ);
      skipsGroup.add(m);
    });
  }

  // On-table counterpart of the HTML #layTrayBox: one translucent plate per
  // group letter, laid out in front of the player's OWN seat (always local
  // index 0, see sync()'s `order` construction) using the same seat-relative
  // anchor math as buildMelds, just parked further out (closer to the seat)
  // so it doesn't collide with actual laid-down groups once confirmed. Cards
  // already assigned to a tray (layAssignment) are shown resting on top of
  // its plate, mirroring the HTML tray's own card chips — and ARE the only
  // place they're shown once assigned (buildHandFan filters them out of the
  // hand, see there), so a card visibly moves from the fan to its phase
  // instead of appearing in both places at once. Pickable via
  // pickLayZoneCard() so they can be re-dragged straight into a different
  // tray.
  function buildLayZones(trayCount, layAssignment, myHand) {
    clearGroup(layZoneGroup);
    layZoneEntries = [];
    layZoneCardEntries = [];
    if (!trayCount) return;
    const seat = seats[0];
    if (!seat) return;
    const bx = seat.group.userData.baseX, bz = seat.group.userData.baseZ;
    const dist = Math.hypot(bx, bz) || 1;
    const outX = bx / dist, outZ = bz / dist;
    const tanX = -outZ, tanZ = outX;
    const anchorX = bx * LAY_ZONE_ANCHOR, anchorZ = bz * LAY_ZONE_ANCHOR;
    // Plate rotation is derived differently from buildMelds'/buildPendingSkips'
    // card rotation.y (also atan2(tanX,tanZ)) because those are plain box
    // cards that already lie flat by default — rotation.y alone re-aims their
    // local X axis. This plate is a PlaneGeometry that first gets flattened
    // (flattenQuat, R_x(-90°): local X stays world X, local Y -> world -Z,
    // normal -> world +Y) and only THEN spun around world Y — so the angle
    // needed to land the plate's local-X (its long CARD_W*3.6 side) on the
    // tangential (tanX,tanZ) direction is atan2(-tanZ,tanX), not
    // atan2(tanX,tanZ). Using the latter (the old bug) rotated the plate's
    // LONG side onto the RADIAL axis instead — i.e. stretched away from/
    // toward the player ("vertical" in front of them) instead of sideways
    // ("horizontal") like the card row resting on top of it.
    const rotY = Math.atan2(-tanZ, tanX);
    for (let i = 0; i < trayCount; i++) {
      const rowStep = i * LAY_ZONE_ROW_STEP;
      const rowX = anchorX - outX * rowStep, rowZ = anchorZ - outZ * rowStep;
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W * 3.6, CARD_H * 1.4),
        new THREE.MeshBasicMaterial({ color: 0x5ec8a6, transparent: true, opacity: LAY_ZONE_OPACITY_BASE, side: THREE.DoubleSide, depthWrite: false })
      );
      // Composed as quaternions (flatten around world X, THEN spin around
      // world Y), not plain rotation.x + rotation.z — setting both Euler
      // components on the same object at once doesn't mean "flatten, then
      // spin in-plane": with THREE's default 'XYZ' order the Z term is
      // applied in the ORIGINAL (pre-flatten) frame, so for rotY != 0 the
      // plate tilts up out of horizontal instead of staying flat and just
      // changing heading. Spinning around world Y *after* flattening keeps
      // it flat at any angle, same principle as the fan-roll/hover-lift
      // camera-space conversions elsewhere in this file.
      const flattenQuat = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 2);
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(WOBBLE_AXIS, rotY);
      plate.quaternion.copy(spinQuat).multiply(flattenQuat);
      plate.position.set(rowX, SURFACE_Y - 0.003, rowZ);
      plate.userData.hoverKind = 'layzone';
      plate.userData.trayIndex = i;
      layZoneGroup.add(plate);

      const ids = (layAssignment[i] || []);
      const cards = ids.map(id => myHand.find(c => c.id === id)).filter(Boolean);
      const cardGap = CARD_W * 0.62;
      cards.forEach((card, ci) => {
        const spread = (ci - (cards.length - 1) / 2) * cardGap;
        const m = cardMesh(card, true);
        m.position.set(rowX + tanX * spread, SURFACE_Y + 0.006, rowZ + tanZ * spread);
        m.rotation.y = rotY;
        // Pickable so a card already sitting in a tray can be picked straight
        // back up and dragged into a DIFFERENT tray (see pickLayZoneCard()) —
        // the same startCardDrag() flow already used for hand cards and the
        // HTML tray chips, just a third possible pointerdown origin.
        m.userData.hoverKind = 'layzoneCard';
        m.userData.cardId = card.id;
        layZoneGroup.add(m);
        layZoneCardEntries.push({ mesh: m, cardId: card.id, trayIndex: i });
      });
      layZoneEntries.push({ trayIndex: i, plate });
    }
  }

  // Raycast counterpart used by game.js's drag-drop (startCardDrag): returns
  // the trayIndex of the on-table zone under the pointer, or null.
  function pickLayZone(clientX, clientY) {
    if (!camera || !canvas || !layZoneEntries.length) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(layZoneEntries.map(e => e.plate), false);
    return hits.length ? hits[0].object.userData.trayIndex : null;
  }

  // Raycast counterpart for picking a card that's already resting on a lay
  // zone (i.e. already assigned to a tray), so game.js's tableCanvas
  // pointerdown handler can start a drag from it — moving it to a different
  // tray works exactly like moving it from the hand, just with a different
  // pick source feeding the same startCardDrag(). Checked before pickPile()
  // but the caller must check it before/alongside pickHandCard() too — since
  // assigned cards are no longer shown in the hand fan (see buildHandFan),
  // the two pick sets never overlap for the same card.
  function pickLayZoneCard(clientX, clientY) {
    if (!camera || !canvas || !layZoneCardEntries.length) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(layZoneCardEntries.map(e => e.mesh), false);
    return hits.length ? hits[0].object.userData.cardId : null;
  }

  function setHoveredLayZone(idx) { hoveredLayZoneIndex = idx == null ? null : idx; }

  function tickLayZones() {
    layZoneEntries.forEach(e => {
      const target = e.trayIndex === hoveredLayZoneIndex ? LAY_ZONE_OPACITY_HOVER : LAY_ZONE_OPACITY_BASE;
      e.plate.material.opacity += (target - e.plate.material.opacity) * 0.25;
    });
  }

  // Cards overlap into a fan (tangential arc + roll per card, like a real hand
  // of cards); n increases -> arc widens but per-card gap tightens, mirroring
  // how a real hand fans out with more cards without running off-screen.
  function buildHandFan(cards, uiState) {
    clearGroup(handFanGroup);
    handCardEntries = [];
    const ui = uiState || {};
    const selectedSet = new Set(ui.selectedIds || []);
    const layAssignment = ui.layAssignment || [];
    // A card already assigned to a lay-down tray is drawn resting on its
    // on-table zone plate instead (see buildLayZones) — showing it a second
    // time here, still in the hand, read as "it's still in my hand" even
    // though it's already spoken for. Filtering it out of the fan entirely
    // is what actually moves it "into the phase" visually; picking it back
    // up to reassign it goes through pickLayZoneCard() instead of
    // pickHandCard() from this point on.
    const assignedIds = new Set();
    layAssignment.forEach(g => g.forEach(id => assignedIds.add(id)));
    const visibleCards = assignedIds.size ? cards.filter(c => !assignedIds.has(c.id)) : cards;
    const n = visibleCards.length;
    if (!n) return;
    // Capped a bit lower than a first pass at this (1.5/0.17) — with the
    // fan-roll fix making the per-card tilt actually show up on screen (see
    // FAN_ROLL_AXIS), that wider spread pushed the outermost 1-2 cards of a
    // full 10-card hand past the edge of the camera's fixed FOV at this HUD
    // distance (HAND_Z) and they visibly clipped off the canvas.
    const maxSpread = Math.min(1.3, 0.155 * n);
    visibleCards.forEach((card, i) => {
      const t = n > 1 ? (i / (n - 1)) - 0.5 : 0;
      const angle = t * maxSpread;
      const pivot = new THREE.Group();
      // bowCam is the desired camera-space-Y dip for this card (0 at the
      // center card, increasingly negative outward) — see FAN_BOW_SCREEN_Y.
      const bowCam = FAN_BOW_SCREEN_Y * (Math.cos(angle) - 1);
      const baseX = Math.sin(angle) * 0.95;
      const baseY = bowCam * HAND_TILT_COS - 0.09;
      const baseZ = -bowCam * HAND_TILT_SIN + i * 0.0018;
      pivot.position.set(baseX, baseY, baseZ);
      pivot.quaternion.setFromAxisAngle(FAN_ROLL_AXIS, -angle);
      const m = cardMesh(card, true);
      m.scale.setScalar(HAND_SCALE);
      if (selectedSet.has(card.id)) {
        m.material[2].emissive = new THREE.Color(0x5ec8a6);
        m.material[2].emissiveIntensity = 0.6;
      }
      // The fan's bow (baseZ above) is shaped like a shallow "V" — it dips
      // in actual depth at the edges to sell the camera-space arc, so the
      // MIDDLE card ends up geometrically the farthest away, not the
      // leftmost. Left-to-right z-buffer depth is therefore the wrong thing
      // to sort overlap by: it made the center card the most hidden one
      // instead of a clean left-behind/right-in-front stack. renderOrder +
      // depthTest:false makes draw order (and therefore what covers what)
      // an explicit left-to-right index instead, independent of the actual
      // (intentionally non-monotonic) depth — so card i always draws over
      // card i-1, exposing that card's top-left corner index, matching how
      // a real held fan of cards reads.
      m.renderOrder = HAND_CARD_RENDER_BASE + i;
      m.material.forEach(mat => { mat.depthTest = false; mat.depthWrite = false; });
      pivot.add(m);
      handFanGroup.add(pivot);
      // Picking uses this separate, never-animated proxy box at the card's
      // resting transform — NOT the visual mesh `m` above, whose pivot gets
      // lifted/rotated/scaled by tickHandFan() on hover. Raycasting against
      // that moving target from a stationary mouse position was a real bug:
      // the lift visibly slides an off-center card sideways on screen
      // (perspective parallax) and its rotation.x/z change also swing its
      // thin box out of a ray that was aimed near its edge — exactly where
      // you're aiming on any card that's mostly covered by its neighbors in
      // the fan. That dropped the hover, which eased the card back down,
      // which brought it back under the ray, which re-triggered the hover:
      // a flicker loop, and clicks landing mid-swing just missed. A hitbox
      // that always stays put removes the feedback loop entirely.
      const hitMesh = new THREE.Mesh(
        new THREE.BoxGeometry(CARD_W * HAND_SCALE, CARD_T, CARD_H * HAND_SCALE),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hitMesh.position.set(baseX, baseY, baseZ);
      hitMesh.quaternion.setFromAxisAngle(FAN_ROLL_AXIS, -angle);
      handFanGroup.add(hitMesh);
      handCardEntries.push({ pivot, mesh: m, hitMesh, cardId: card.id, baseOrder: HAND_CARD_RENDER_BASE + i, base: { x: baseX, y: baseY, z: baseZ, rotZ: -angle }, hoverT: 0 });
    });
  }

  // Spawns one transient flying card. faceUp/card control the texture shown
  // mid-flight — deck draws fly as an anonymous card-back (nobody but the
  // drawer should "see" it), discard draws/discards/skips fly face-up since
  // that card is genuinely public knowledge at that point (it's either
  // coming off, or going onto, the shared discard pile).
  // [REUSABLE] generic fly-object-A-to-B-with-arc-then-dispose animation —
  // see file-top REUSE MAP. faceUp/card here are this game's texture choice;
  // swap for whatever visual the flying object should show in another game.
  // opts.delay staggers the start of this flight (seconds, ticked down
  // before the flight itself starts moving — see tickFlights) and
  // opts.spins sets how many full turns it makes over the flight, both used
  // by the reshuffle flourish below to make several cards flutter off at
  // slightly different times instead of moving as one rigid block; ordinary
  // single-card draw/discard/skip flights just take the defaults.
  function spawnFlight(from, to, faceUp, card, opts) {
    const o = opts || {};
    const delay = o.delay || 0;
    const m = cardMesh(faceUp ? card : null, faceUp);
    m.position.copy(from);
    m.renderOrder = MELD_PREVIEW_RENDER + 1;
    m.material.forEach(mat => { mat.depthTest = false; mat.depthWrite = false; });
    m.visible = delay <= 0;
    flightGroup.add(m);
    activeFlights.push({ mesh: m, from: from.clone(), to: to.clone(), t: 0, delay, spins: o.spins != null ? o.spins : 0.25 });
  }

  function tickFlights(dt) {
    if (!activeFlights.length) return;
    for (let i = activeFlights.length - 1; i >= 0; i--) {
      const f = activeFlights[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      if (!f.mesh.visible) f.mesh.visible = true;
      f.t = Math.min(1, f.t + dt / FLIGHT_DURATION);
      const e = 1 - Math.pow(1 - f.t, 3); // easeOutCubic
      f.mesh.position.lerpVectors(f.from, f.to, e);
      f.mesh.position.y += Math.sin(e * Math.PI) * FLIGHT_ARC;
      f.mesh.rotation.y = e * Math.PI * 2 * f.spins;
      if (f.t >= 1) {
        f.mesh.traverse(disposeMeshLike);
        flightGroup.remove(f.mesh);
        activeFlights.splice(i, 1);
      }
    }
  }

  // Resolves the world-space point a flight should start/end at for a given
  // player: the camera-anchored hand-fan HUD origin for "me" (converted to
  // world space through the CURRENT camera transform — good enough for a
  // half-second flight even though the orbit camera can itself move), or
  // the opponent's face-down stack near their seat otherwise.
  function handPoint(playerIsMe, seatIndex) {
    const v = new THREE.Vector3();
    if (playerIsMe) { handFanGroup.getWorldPosition(v); return v; }
    const seat = seats[seatIndex];
    if (!seat) return null;
    seat.stackGroup.getWorldPosition(v);
    return v;
  }

  // Reacts to payload.lastEvent (see game.js recordEvent()) by spawning the
  // matching flight — deduped by id so re-renders that don't carry a new
  // event (language switch, a second sync() with the same snapshot) don't
  // replay the same animation.
  function handleSyncEvent(ev, players, order) {
    if (!ev || ev.id === lastHandledEventId || !flightGroup) return;
    lastHandledEventId = ev.id;
    const seatIndexOf = pid => order.indexOf(pid);
    const actor = players.find(p => p.id === ev.actorId);
    if (!actor) return;
    const actorSeatIdx = seatIndexOf(ev.actorId);
    if (ev.type === 'draw') {
      const from = ev.source === 'discard' ? DISCARD_POS : DECK_POS;
      const to = handPoint(actor.isMe, actorSeatIdx);
      if (to) spawnFlight(from, to, ev.source === 'discard', ev.card);
    } else if (ev.type === 'discard') {
      const from = handPoint(actor.isMe, actorSeatIdx);
      if (from) spawnFlight(from, DISCARD_POS, true, ev.card);
    } else if (ev.type === 'skipPlayed') {
      const from = handPoint(actor.isMe, actorSeatIdx);
      const targetSeatIdx = seatIndexOf(ev.targetId);
      const targetSeat = seats[targetSeatIdx];
      if (from && targetSeat) {
        const bx = targetSeat.group.userData.baseX, bz = targetSeat.group.userData.baseZ;
        const to = new THREE.Vector3(bx * 0.74, SURFACE_Y + 0.012, bz * 0.74);
        spawnFlight(from, to, true, ev.card);
      }
    } else if (ev.type === 'reshuffle') {
      // Clearly reads as "the discard pile just got shuffled back into the
      // draw pile" (Nutzerwunsch): several anonymous card-backs flutter from
      // the discard spot to the deck spot with staggered start delays and
      // extra spin, instead of one plain single-card flight — a deliberately
      // busier, more chaotic motion than a normal draw/discard.
      for (let i = 0; i < SHUFFLE_FLIGHT_COUNT; i++) {
        const from = new THREE.Vector3(
          DISCARD_POS.x + (Math.random() - 0.5) * 0.12,
          DISCARD_POS.y + 0.015 + i * 0.002,
          DISCARD_POS.z + (Math.random() - 0.5) * 0.12
        );
        const to = new THREE.Vector3(
          DECK_POS.x + (Math.random() - 0.5) * 0.1,
          DECK_POS.y + 0.015 + i * 0.002,
          DECK_POS.z + (Math.random() - 0.5) * 0.1
        );
        spawnFlight(from, to, false, null, { delay: Math.random() * 0.3, spins: 1.5 + Math.random() * 1.5 });
      }
    }
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
      const spr = makeNameSprite(
        (p.name || '?') + (p.isMe ? ' •' : ''),
        'Lv' + (p.level || 1) + '   ×' + (p.handCount || 0),
        hex
      );
      seat.group.remove(seat.nameSprite);
      spr.position.set(0, 1.62, 0);
      seat.nameSprite = spr;
      seat.group.add(spr);
      seat.glow.material.opacity = p.active ? 0.55 : 0;
      setSeatCharacter(seat, p.character || null, p.seat || null);

      // My own hand is shown face-up in the dedicated static fan instead —
      // showing it a second time face-down here would just be visual noise.
      clearGroup(seat.stackGroup);
      if (!p.isMe) {
        const hc = Math.min(14, p.handCount || 0);
        for (let i = 0; i < hc; i++) {
          const m = cardMesh(null, false);
          m.position.set((i - hc / 2) * 0.045, i * 0.0008, 0);
          seat.stackGroup.add(m);
        }
      }
    });

    buildPiles(payload.drawCount || 0, payload.discardTopCard || null);
    buildMelds(payload.table || {}, order);
    buildPendingSkips(players, order);
    buildHandFan(payload.myHand || [], { uiMode: payload.uiMode, selectedIds: payload.selectedIds, layAssignment: payload.layAssignment });
    buildLayZones(payload.uiMode === 'laying' ? (payload.layAssignment || []).length : 0, payload.layAssignment || [], payload.myHand || []);
    if (hoveredCardId && !handCardEntries.some(e => e.cardId === hoveredCardId)) hoveredCardId = null;
    if (hoveredDiscard && !discardEntry) hoveredDiscard = false;
    if (hoveredMeldKey && !meldEntries.some(e => e.key === hoveredMeldKey)) hoveredMeldKey = null;
    if (hoveredLayZoneIndex != null && !layZoneEntries.some(e => e.trayIndex === hoveredLayZoneIndex)) hoveredLayZoneIndex = null;
    handleSyncEvent(payload.lastEvent, players, order);
  }

  // Eases each hand card's pivot toward its lifted/enlarged/"facing you"
  // pose when it's the hovered one, and back to its resting fan position
  // otherwise — this is what makes the pointed-at card visually pop above
  // its overlapping neighbors instead of staying half-covered by them.
  function tickHandFan() {
    handCardEntries.forEach(entry => {
      const target = entry.cardId === hoveredCardId ? 1 : 0;
      entry.hoverT += (target - entry.hoverT) * 0.22;
      if (Math.abs(entry.hoverT - target) < 0.002) entry.hoverT = target;
      const b = entry.base, ht = entry.hoverT;
      // Desired motion is straight up on screen (+ a touch toward the
      // camera), expressed in camera space and rotated into the fan
      // group's local frame — see HOVER_LIFT_Y/HOVER_FORWARD_Z above.
      const dy = (HOVER_LIFT_Y * HAND_TILT_COS + HOVER_FORWARD_Z * HAND_TILT_SIN) * ht;
      const dz = (-HOVER_LIFT_Y * HAND_TILT_SIN + HOVER_FORWARD_Z * HAND_TILT_COS) * ht;
      entry.pivot.position.set(b.x, b.y + dy, b.z + dz);
      // Composed as quaternions, not plain Euler fields, for the same reason
      // the roll itself uses FAN_ROLL_AXIS instead of rotation.z: this pivot
      // lives inside the tilted fan group, so Euler rotation.x/.z here don't
      // correspond to clean, independent screen-space axes — combining them
      // as plain numbers (the old code) reads fine only by coincidence for
      // small angles. _fanRollQuat eases the resting "opened outward" roll
      // back to 0 as the card is hovered; _fanTiltQuat eases in a counter-
      // tilt around the shared local X axis (safe as plain axis-angle here,
      // since this X axis IS the same physical axis as the group's own
      // HAND_TILT_X — no conjugation needed, unlike the Z roll) so the
      // hovered card stands up to face the viewer instead of staying at the
      // table-level tilt.
      _fanRollQuat.setFromAxisAngle(FAN_ROLL_AXIS, b.rotZ * (1 - ht));
      _fanTiltQuat.setFromAxisAngle(X_AXIS, -HAND_TILT_X * ht * 0.65);
      entry.pivot.quaternion.copy(_fanTiltQuat).multiply(_fanRollQuat);
      entry.pivot.scale.setScalar(1 + ht * 0.3);
      // Resting order is left-to-right (see buildHandFan), but a hovered
      // card needs to draw over ALL neighbors regardless of its own index —
      // otherwise hovering a left-side card would pop it up visually while
      // still drawing underneath the cards to its right.
      entry.mesh.renderOrder = entry.cardId === hoveredCardId ? HAND_CARD_RENDER_HOVER : entry.baseOrder;
    });
  }

  // Same ease-and-lift idea as tickHandFan(), but in plain table/world space
  // (no camera-tilt conversion needed): lifts the discard pile's top card
  // toward the camera and enlarges it while hovered.
  function tickDiscardHover() {
    if (!discardEntry) return;
    const armed = !!(dragArmed && dragArmed.discard);
    const target = hoveredDiscard ? 1 : (armed ? ARMED_LEVEL : 0);
    discardEntry.hoverT += (target - discardEntry.hoverT) * 0.22;
    if (Math.abs(discardEntry.hoverT - target) < 0.002) discardEntry.hoverT = target;
    const ht = discardEntry.hoverT;
    discardEntry.mesh.position.y = discardEntry.baseY + ht * PILE_HOVER_LIFT;
    discardEntry.mesh.scale.setScalar(1 + ht * PILE_HOVER_SCALE);
  }

  // Lifts/enlarges an entire laid-down meld group ("Phase") at once when any
  // of its cards is hovered, by animating the group's shared pivot rather
  // than a single card — see buildMelds(). Also eases toward a lower, steady
  // "armed" level while a drag is in progress and this group is one of the
  // legal drop targets (see dragArmed/setDragTargets), even before the
  // pointer is actually over it.
  function tickMeldHover() {
    meldEntries.forEach(entry => {
      const armed = !!(dragArmed && dragArmed.melds.has(entry.key));
      const target = entry.key === hoveredMeldKey ? 1 : (armed ? ARMED_LEVEL : 0);
      entry.hoverT += (target - entry.hoverT) * 0.22;
      if (Math.abs(entry.hoverT - target) < 0.002) entry.hoverT = target;
      const ht = entry.hoverT;
      entry.pivot.position.y = entry.baseY + ht * MELD_HOVER_LIFT;
      entry.pivot.scale.setScalar(1 + ht * MELD_HOVER_SCALE);
    });
  }

  // (Re)builds meldPreviewGroup with a plain, camera-facing, evenly spaced
  // row of the given group's cards — no arc/roll, this is a readability
  // popup, not a fan. Reuses the same off-screen-until-scaled-to-0 +
  // depthTest:false + high renderOrder recipe as the hand cards so it always
  // draws cleanly on top regardless of what the orbit camera is looking at.
  function rebuildMeldPreview(key) {
    clearGroup(meldPreviewGroup);
    meldPreviewKey = key;
    const entry = meldEntries.find(e => e.key === key);
    if (!entry) return;
    const cards = entry.cards;
    const n = cards.length;
    cards.forEach((card, i) => {
      const m = cardMesh(card, true);
      m.scale.setScalar(MELD_PREVIEW_SCALE);
      m.position.set((i - (n - 1) / 2) * MELD_PREVIEW_GAP, 0, 0);
      m.renderOrder = MELD_PREVIEW_RENDER;
      m.material.forEach(mat => { mat.depthTest = false; mat.depthWrite = false; });
      meldPreviewGroup.add(m);
    });
  }

  // Flies the hovered meld's cards into meldPreviewGroup and eases them back
  // out on unhover. Content is only rebuilt when the hovered *key* actually
  // changes (not every frame) — meldPreviewT alone drives the in/out motion
  // via scale, so switching straight from one hovered group to another just
  // swaps the row's content without re-triggering the pop-in animation.
  function tickMeldPreview() {
    const active = !!(hoveredMeldKey && meldEntries.some(e => e.key === hoveredMeldKey));
    if (active && hoveredMeldKey !== meldPreviewKey) rebuildMeldPreview(hoveredMeldKey);
    const target = active ? 1 : 0;
    meldPreviewT += (target - meldPreviewT) * MELD_PREVIEW_EASE;
    if (Math.abs(meldPreviewT - target) < 0.002) meldPreviewT = target;
    if (!active && meldPreviewT === 0 && meldPreviewKey) {
      clearGroup(meldPreviewGroup);
      meldPreviewKey = null;
    }
    meldPreviewGroup.scale.setScalar(meldPreviewT);
    meldPreviewGroup.visible = meldPreviewT > 0.001;
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!renderer) return;
    const t = (performance.now() - t0) / 1000;
    const dt = lastTickTime == null ? 1 / 60 : Math.min(0.1, t - lastTickTime);
    lastTickTime = t;
    seats.forEach((s, i) => {
      // Seat 0 is always "me" — keep it steady so the readable hand fan in
      // front of it never jitters; opponents get a small idle bob for life.
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
    handDragT += ((handDragActive ? 1 : 0) - handDragT) * HAND_DRAG_EASE;
    if (Math.abs(handDragT) < 0.001) handDragT = 0;
    if (handFanGroup) handFanGroup.position.y = HAND_Y - handDragT * HAND_DRAG_DROP;
    tickHandFan();
    tickDiscardHover();
    tickMeldHover();
    tickMeldPreview();
    tickLayZones();
    tickFlights(dt);
    renderer.render(scene, camera);
  }

  // Called from game.js's startCardDrag() on every pointermove once dragging
  // (not just once at DRAG_THRESHOLD) and again on pointerup (false) — see
  // handDragActive above for why this is a separate signal from
  // setDragTargets(). Continuous rather than a one-shot "true for the whole
  // drag" flag since isOverHandBand() below needs live input to decide
  // whether the fan should currently be up or retracted.
  function setHandDragging(active) { handDragActive = !!active; }

  // Projects a point given in the hand fan's own camera-local space (see
  // HAND_Y/HAND_Z) to a screen-space Y in CSS pixels — used only by
  // isOverHandBand() below, kept separate so that function reads as "top
  // edge of the band" + "is the pointer below that" rather than inline
  // projection math.
  function projectCamLocalY(camY, rect) {
    handBandVec.set(0, camY, HAND_Z);
    handBandVec.applyMatrix4(camera.matrixWorld);
    handBandVec.project(camera);
    return (1 - (handBandVec.y * 0.5 + 0.5)) * rect.height + rect.top;
  }
  // Answers "is this screen point roughly over the hand fan's rest area",
  // deliberately measured against where the fan WOULD sit at rest
  // (HAND_Y, ignoring the current handDragT retract offset) rather than its
  // live animated position — otherwise, once the fan starts retracting the
  // band would retract right along with it and a drag could never re-enter
  // it, defeating the whole point (Nutzerwunsch: while hovering back over the
  // hand during a manual-sort drag, the fan should rise back up so there's
  // something to sort against; only actually pulling the card away from the
  // hand should send it back down). The top edge is derived by projecting a
  // point offset from the fan's origin (in the same camera-local Y sense as
  // HAND_Y itself) and reading off the resulting pixel delta, rather than a
  // guessed screen-pixel constant — that way it automatically scales with
  // viewport size/FOV instead of drifting out of sync if HAND_Y or the
  // camera setup ever changes. +0.5 is generous slack ABOVE the fan's own
  // rest position, not the fan's own extent (FAN_BOW_SCREEN_Y/HOVER_LIFT_Y
  // above are themselves coefficients scaled down by trig/easing factors
  // before use, not literal camera-space offsets — a naive reading of those
  // as "0.62/0.42 units tall" would put the band top far above the visible
  // frustum at this depth; tuned empirically instead against the actual
  // on-screen fan, landing the band top roughly mid-canvas).
  function isOverHandBand(clientX, clientY) {
    if (!camera || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const bandTop = projectCamLocalY(HAND_Y + 0.5, rect);
    return clientY >= bandTop;
  }

  window.LevelUp3D = { mount, sync, pickHandCard, pickPile, pickLayZone, pickLayZoneCard, pickMeld, setHoveredLayZone, setDragTargets, setHandDragging, isOverHandBand, loadCharacterThumbnails, mountCharPreview, setCharPreview };
})();
