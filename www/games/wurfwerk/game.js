// three.js liegt selbst gehostet im Repo (MIT, r164) — kein CDN-Abruf beim
// Spieler, siehe THIRD-PARTY.md.
import * as THREE from "../../assets/vendor/three/three.module.min-0.164.1.js";

    const I18N = window.BFI18N;
    const tt = (key, vars = {}, fallback = "") => I18N?.t(key, vars, fallback) ?? (fallback || key);

    const scenePanel = document.getElementById("scenePanel");
    const canvas = document.getElementById("threeCanvas");
    const scoreBody = document.getElementById("scoreBody");
    const allScoreSheets = document.getElementById("allScoreSheets");
    const rollBtn = document.getElementById("rollBtn");
    const releaseBtn = document.getElementById("releaseBtn");
    const newBtn = document.getElementById("newBtn");
    const exitBtn = document.getElementById("exitBtn");
    const playersBtn = document.getElementById("playersBtn");
    const messageEl = document.getElementById("message");
    const playerInfo = document.getElementById("playerInfo");
    const roundInfo = document.getElementById("roundInfo");
    const rollsLeftEl = document.getElementById("rollsLeft");
    const diceSumEl = document.getElementById("diceSum");
    const roomInput = getOrCreateHiddenInput("roomInput");
    const nameInput = getOrCreateHiddenInput("nameInput");
    const hostBtn = document.getElementById("hostBtn");
    const joinBtn = document.getElementById("joinBtn");
    const leaveBtn = document.getElementById("leaveBtn");
    const gameStatusPill = document.getElementById("gameStatusPill");
    const lobbyOverlay = document.getElementById("lobbyOverlay");
    const lobbyStatus = document.getElementById("lobbyStatus");
const lobbyStepMode = document.getElementById("lobbyStepMode");
    function playDiceSound(durationMs) { window.BrettSounds?.diceRoll?.(durationMs ?? 1200); }
    const lobbyStepSettings = document.getElementById("lobbyStepSettings");
    const lobbySettingsTitle = document.getElementById("lobbySettingsTitle");
    const lobbyBackBtn = document.getElementById("lobbyBackBtn");
    const chooseHotseatBtn = document.getElementById("chooseHotseatBtn");
    const chooseHostBtn = document.getElementById("chooseHostBtn");
    const chooseJoinBtn = document.getElementById("chooseJoinBtn");
    const hotseatSettings = document.getElementById("hotseatSettings");
    const hostSettings = document.getElementById("hostSettings");
    const joinSettings = document.getElementById("joinSettings");
    const variantPicker = document.getElementById("variantPicker");
    const lobbyHotseatName = document.getElementById("lobbyHotseatName");
    const lobbyHotseatPlayers = document.getElementById("lobbyHotseatPlayers");
    const lobbyHotseatBots = document.getElementById("lobbyHotseatBots");
    const lobbyHotseatBtn = document.getElementById("lobbyHotseatBtn");
    const lobbyHostName = document.getElementById("lobbyHostName");
    const lobbyHostBots = document.getElementById("lobbyHostBots");
    const lobbyHostRoom = document.getElementById("lobbyHostRoom");
    const lobbyHostInviteLink = document.getElementById("lobbyHostInviteLink");
    const copyHostInviteBtn = document.getElementById("copyHostInviteBtn");
    const onlineWaitingRoom = document.getElementById("onlineWaitingRoom");
    const onlineWaitingTitle = document.getElementById("onlineWaitingTitle");
    const onlineWaitingCode = document.getElementById("onlineWaitingCode");
    const onlineInviteView = document.getElementById("onlineInviteView");
    const copyOnlineInviteBtn = document.getElementById("copyOnlineInviteBtn");
    const onlineLobbyPlayers = document.getElementById("onlineLobbyPlayers");
    const onlineStartGameBtn = document.getElementById("onlineStartGameBtn");
    const onlineWaitingHint = document.getElementById("onlineWaitingHint");
    const onlineHostSettings = document.getElementById("onlineHostSettings");
    const onlineHostName = document.getElementById("onlineHostName");
    const onlineHostBots = document.getElementById("onlineHostBots");
    const onlineVariantPicker = document.getElementById("onlineVariantPicker");
    const joinInviteHint = document.getElementById("joinInviteHint");
    const lobbyHostBtn = document.getElementById("lobbyHostBtn");
    const lobbyJoinName = document.getElementById("lobbyJoinName");
    const lobbyJoinRoom = document.getElementById("lobbyJoinRoom");
    const lobbyJoinBtn = document.getElementById("lobbyJoinBtn");
    const modeCreateTab = document.getElementById("modeCreateTab");
    const modeJoinTab = document.getElementById("modeJoinTab");
    const menuNameInput = document.getElementById("menuNameInput");
    const menuJoinFields = document.getElementById("menuJoinFields");
    const menuRoomInput = document.getElementById("menuRoomInput");
    const menuJoinInviteHint = document.getElementById("menuJoinInviteHint");
    const menuActionBtn = document.getElementById("menuActionBtn");
    const publicRoomCheckHost = document.getElementById("publicRoomCheckHost");
    const keepRerollsCheck = document.getElementById("keepRerollsCheck");
    const keepRerollsCheckHost = document.getElementById("keepRerollsCheckHost");
    const publicRoomsItems = document.getElementById("publicRoomsItems");
    const exitConfirmOverlay = document.getElementById("exitConfirmOverlay");
    const confirmTitle = document.getElementById("confirmTitle");
    const confirmText = document.getElementById("confirmText");
    const cancelExitBtn = document.getElementById("cancelExitBtn");
    const confirmExitBtn = document.getElementById("confirmExitBtn");
    const rankingOverlay = document.getElementById("rankingOverlay");
    const rankingPodium = document.getElementById("rankingPodium");
    const rankingList = document.getElementById("rankingList");
    const rankingSubtitle = document.getElementById("rankingSubtitle");
    const rankingAgainBtn = document.getElementById("rankingAgainBtn");
    const rankingCloseBtn = document.getElementById("rankingCloseBtn");
    const rankingLobbyBtn = document.getElementById("rankingLobbyBtn");
    let pendingConfirmAction = null;
    let botTimer = null;
    let autoRollTimer = null;
    let botIsActing = false;
    let selectedLobbyType = "host";
    const userOpenScoreSheets = new Set();
    let lastRankingSignature = "";
    let pendingRemoteSnapshot = null;
    let trustedRemoteAction = false;

    const allCategories = [
      { id: "ones", label: "Ones", desc: "Score all ones", section: "Upper", score: d => upperScore(d, 1) },
      { id: "twos", label: "Twos", desc: "Score all twos", section: "Upper", score: d => upperScore(d, 2) },
      { id: "threes", label: "Threes", desc: "Score all threes", section: "Upper", score: d => upperScore(d, 3) },
      { id: "fours", label: "Fours", desc: "Score all fours", section: "Upper", score: d => upperScore(d, 4) },
      { id: "fives", label: "Fives", desc: "Score all fives", section: "Upper", score: d => upperScore(d, 5) },
      { id: "sixes", label: "Sixes", desc: "Score all sixes", section: "Upper", score: d => upperScore(d, 6) },
      { id: "threeKind", label: "Three of a Kind", desc: "At least 3 matching: total", section: "Lower", score: d => hasSame(d, 3) ? sum(d) : 0 },
      { id: "fourKind", label: "Four of a Kind", desc: "At least 4 matching: total", section: "Lower", score: d => hasSame(d, 4) ? sum(d) : 0 },
      { id: "fullHouse", label: "Full House", desc: "3 matching + 2 matching: 25", section: "Lower", score: d => isFullHouse(d) ? 25 : 0 },
      { id: "smallStraight", label: "Small Straight", desc: "Sequence of 4: 30", section: "Lower", score: d => hasStraight(d, 4) ? 30 : 0 },
      { id: "largeStraight", label: "Large Straight", desc: "Sequence of 5: 40", section: "Lower", score: d => hasStraight(d, 5) ? 40 : 0 },
      { id: "fiveKind", label: "Five of a Kind", desc: "5 matching: 50", section: "Lower", score: d => hasSame(d, 5) ? 50 : 0 },
      { id: "sixKind", label: "Six of a Kind", desc: "6 matching: 90", section: "Lower", score: d => hasSame(d, 6) ? 90 : 0 },
      { id: "sevenKind", label: "Seven of a Kind", desc: "7 matching: 140", section: "Lower", score: d => hasSame(d, 7) ? 140 : 0 },
      { id: "castle", label: "Castle", desc: "4 matching + 3 matching: 70", section: "Lower", score: d => castleScore(d) ? 70 : 0 },
      { id: "threePairs", label: "Three Pairs", desc: "Three different pairs: 45", section: "Lower", score: d => threePairsScore(d) ? 45 : 0 },
      { id: "fullRun", label: "Full Run", desc: "1-2-3-4-5-6: 60", section: "Lower", score: d => hasFullRun(d) ? 60 : 0 },
      { id: "royalWildcard", label: "Royal Wildcard", desc: "Total of all dice + 20", section: "Lower", score: d => sum(d) + 20 },
      { id: "chance", label: "Wildcard", desc: "Total of all dice", section: "Lower", score: d => sum(d) },
      { id: "pair", label: "Pair", desc: "Highest pair: pair total", section: "Extra", score: d => pairScore(d, 2) },
      { id: "twoPairs", label: "Two Pairs", desc: "Two different pairs: pair totals", section: "Extra", score: d => twoPairsScore(d) },
      { id: "lowRun", label: "Low Run", desc: "1-2-3-4-5: 35", section: "Extra", score: d => isExactRun(d, [1,2,3,4,5]) ? 35 : 0 },
      { id: "highRun", label: "High Run", desc: "2-3-4-5-6: 35", section: "Extra", score: d => isExactRun(d, [2,3,4,5,6]) ? 35 : 0 }
    ];

    const gameModes = {
      classic: {
        label: "Classic Forge",
        diceCount: 5,
        upperBonusThreshold: 63,
        upperBonusValue: 35,
        categoryIds: ["ones", "twos", "threes", "fours", "fives", "sixes", "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "fiveKind", "chance"]
      },
      extended: {
        label: "Extended Forge",
        diceCount: 5,
        upperBonusThreshold: 63,
        upperBonusValue: 35,
        categoryIds: ["ones", "twos", "threes", "fours", "fives", "sixes", "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "fiveKind", "chance", "pair", "twoPairs", "lowRun", "highRun"]
      }
    };

    let activeModeId = "classic";
    let categories = buildCategories();

    allCategories.forEach((cat) => {
      cat.baseLabel = cat.label;
      cat.baseDesc = cat.desc;
      cat.baseSection = cat.section;
    });
    Object.values(gameModes).forEach((mode) => { mode.baseLabel = mode.label; });

    function localizeWurfwerkModel() {
      allCategories.forEach((cat) => {
        cat.label = tt(`rollforge.cat.${cat.id}`, {}, cat.baseLabel);
        cat.desc = tt(`rollforge.desc.${cat.id}`, {}, cat.baseDesc);
        cat.section = tt(`rollforge.section.${cat.baseSection}`, {}, cat.baseSection);
      });
      Object.entries(gameModes).forEach(([id, mode]) => {
        mode.label = tt(`rollforge.variant.${id}`, {}, mode.baseLabel);
      });
      categories = buildCategories();
      I18N?.applyDomTranslations(document);
    }
    localizeWurfwerkModel();
    window.addEventListener("brettspiele-language-change", () => {
      localizeWurfwerkModel();
      renderAll?.();
    });

    const upperIds = ["ones", "twos", "threes", "fours", "fives", "sixes"];

    function buildCategories() {
      const ids = gameModes[activeModeId].categoryIds;
      return ids.map(id => allCategories.find(cat => cat.id === id)).filter(Boolean);
    }

    function currentDiceCount() {
      return gameModes[activeModeId]?.diceCount || 5;
    }

    function upperBonusThreshold() {
      return gameModes[activeModeId]?.upperBonusThreshold || 63;
    }

    function upperBonusValue() {
      return gameModes[activeModeId]?.upperBonusValue || 35;
    }

    function startingXPositions(count) {
      const spacing = count > 6 ? 1.34 : count > 5 ? 1.55 : 1.9;
      const offset = (count - 1) * spacing / 2;
      return Array.from({ length: count }, (_, i) => -offset + i * spacing);
    }

    const state = {
      dice: [],
      players: [],
      playerCount: 2,
      currentPlayer: 0,
      rollsLeft: 3,
      hasRolled: false,
      isRolling: false,
      gameOver: false,
      message: "Drücke Würfeln. Danach wählst du die Würfel aus, die neu gewürfelt werden sollen.",
      botCount: 0,
      keepRerolls: false,
      publicRoom: false,
      phase: "idle"
    };

    const GAME_ID = "wurfwerk";
    const urlParams = new URLSearchParams(window.location.search);
    const initialRoomCode = normalizeRoomCode(urlParams.get("room") || "");

    function normalizeRoomCode(room) {
      return String(room || "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "").slice(0, 24);
    }

    function getPersistentClientId(gameId) {
      // Tab-scoped, not browser-wide: this keeps reload/rejoin stable in the
      // same tab, but still lets a host and a guest be tested in two tabs of
      // the same browser without sharing one clientId.
      const key = `brettspiele.${gameId}.tabClientId`;
      const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
      try {
        const current = sessionStorage.getItem(key);
        if (current) return current;
        const next = makeId();
        sessionStorage.setItem(key, next);
        return next;
      } catch (e) {
        return makeId();
      }
    }

    function sessionMetaKey() { return `brettspiele.${GAME_ID}.sessionMeta`; }
    // Browser-weites Backup (localStorage): übersteht das komplette Schließen
    // des Browsers, damit man dieselbe Runde später wieder aufnehmen kann.
    function onlineBackupKey() { return `brettspiele.${GAME_ID}.onlineBackup`; }

    // Wie lange nach dem Schließen des Browsers noch automatisch in dieselbe
    // Runde zurückgekehrt wird (danach gilt der Raum als abgelaufen).
    const ONLINE_BACKUP_TTL_MS = 24 * 60 * 60 * 1000;

    function currentOnlineMeta() {
      return {
        room: normalizeRoomCode(online.room || roomInput.value || initialRoomCode),
        role: online.role,
        name: nameInput.value || onlineHostName?.value || lobbyJoinName?.value || lobbyHostName?.value || "",
        activeModeId,
        botCount: state.botCount || 0,
        keepRerolls: !!state.keepRerolls,
        ts: Date.now()
      };
    }

    function saveOnlineSessionMeta() {
      const meta = currentOnlineMeta();
      const payload = JSON.stringify(meta);
      // Tab-scoped: hält Reload/Rejoin im selben Tab stabil und erlaubt zwei
      // Tabs (Host + Gast) im selben Browser beim Testen.
      try { sessionStorage.setItem(sessionMetaKey(), payload); } catch (e) {}
      // Browser-weites Backup nur für echte Online-Rollen schreiben, damit ein
      // gültiger Stand nicht durch einen Offline-Zustand überschrieben wird.
      if (["host", "client"].includes(meta.role) && meta.room) {
        try { localStorage.setItem(onlineBackupKey(), payload); } catch (e) {}
      }
    }

    function normalizeMeta(data) {
      if (!data || !data.room || !["host", "client"].includes(data.role)) return null;
      data.room = normalizeRoomCode(data.room);
      data.botCount = Math.max(0, Math.min(5, Number(data.botCount) || 0));
      data.activeModeId = gameModes[data.activeModeId] ? data.activeModeId : "classic";
      data.keepRerolls = !!data.keepRerolls;
      return data;
    }

    function loadOnlineSessionMeta() {
      try {
        return normalizeMeta(JSON.parse(sessionStorage.getItem(sessionMetaKey()) || "null"));
      } catch (e) {
        return null;
      }
    }

    // Backup aus localStorage — nur für den Fall „Browser war komplett zu"
    // (kein Tab-Stand mehr vorhanden). Bewusst getrennt gehalten, damit der
    // Zwei-Tab-Testfall (Host + Gast) nicht das Backup des jeweils anderen liest.
    function loadOnlineBackup() {
      try {
        const raw = JSON.parse(localStorage.getItem(onlineBackupKey()) || "null");
        if (raw && raw.ts && (Date.now() - Number(raw.ts)) > ONLINE_BACKUP_TTL_MS) {
          try { localStorage.removeItem(onlineBackupKey()); } catch (e) {}
          return null;
        }
        return normalizeMeta(raw);
      } catch (e) {
        return null;
      }
    }

    function clearOnlineSessionMeta() {
      try { sessionStorage.removeItem(sessionMetaKey()); } catch (e) {}
      try { localStorage.removeItem(onlineBackupKey()); } catch (e) {}
    }

    function hotseatSnapshotKey() { return `brettspiele.${GAME_ID}.hotseatSnapshot`; }

    // Keeps a local (non-online) game resumable across a page reload. Gated on
    // the lobby overlay's visibility rather than state.phase, so leaving to the
    // lobby (which shows the overlay again) self-clears the saved snapshot the
    // next time renderAll() runs, without needing a separate cleanup call.
    function persistHotseatState() {
      if (online.connected) return;
      try {
        if (lobbyOverlay.classList.contains("hidden") && state.players.length) {
          sessionStorage.setItem(hotseatSnapshotKey(), JSON.stringify({
            botCount: state.botCount || 0,
            keepRerolls: !!state.keepRerolls,
            snapshot: makeSnapshot()
          }));
        } else {
          sessionStorage.removeItem(hotseatSnapshotKey());
        }
      } catch (e) {}
    }

    function loadHotseatState() {
      try {
        const data = JSON.parse(sessionStorage.getItem(hotseatSnapshotKey()) || "null");
        if (!data || !data.snapshot || !Array.isArray(data.snapshot.players) || !data.snapshot.players.length) return null;
        data.botCount = Math.max(0, Math.min(5, Number(data.botCount) || 0));
        data.keepRerolls = !!data.keepRerolls;
        data.snapshot.activeModeId = gameModes[data.snapshot.activeModeId] ? data.snapshot.activeModeId : "classic";
        return data;
      } catch (e) {
        return null;
      }
    }

    function resumeHotseatState() {
      const saved = loadHotseatState();
      if (!saved) return false;
      // Hide the lobby first: applySnapshot() triggers its own renderAll(),
      // which must already see the overlay hidden or persistHotseatState()
      // would mistake the still-open lobby for "returned to menu" and erase
      // the snapshot we just loaded.
      closeLobby();
      state.botCount = saved.botCount;
      state.keepRerolls = saved.keepRerolls;
      syncKeepRerollsUI();
      applySnapshot(saved.snapshot);
      updateVariantCards();
      return true;
    }

    function makeInviteUrl(room) {
      const url = new URL("./", window.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("room", normalizeRoomCode(room));
      return url.toString();
    }

    function updateUrlRoom(room) {
      room = normalizeRoomCode(room);
      if (!room) return;
      const url = new URL(window.location.href);
      url.searchParams.set("room", room);
      window.history.replaceState({}, "", url.toString());
    }

    async function copyText(text) {
      const value = String(text || "");
      if (!value) return false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (e) {}
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return !!ok;
      } catch (e) {
        return false;
      }
    }

    const online = {
      connected: false,
      role: "offline",
      socket: null,
      room: "",
      clientId: getPersistentClientId(GAME_ID),
      playerIndex: 0,
      playerMap: {},
      restoreTimer: null,
      restoredFromSession: false,
      heartbeatTimer: null,
      presenceTimer: null,
      awaitingSeatChoice: false
    };
    // Präsenz: clientId -> { role, seat, name, lastSeen } (für Host-Migration).
    const onlinePeers = new Map();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(getRenderPixelRatio());
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 8.8, 10.5);
    camera.lookAt(0, 0, 0);
    updateCameraForViewport();

    const ambient = new THREE.HemisphereLight(0xfff7ed, 0x0f172a, 1.25);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffedd5, 2.8);
    key.position.set(-4.5, 9, 6);
    key.castShadow = true;
    // Smaller shadow map on phones/small viewports: the shadow pass re-renders
    // every frame while dice are rolling, so this is a real GPU cost there.
    const shadowMapSize = Math.min(window.innerWidth, window.innerHeight) < 700 ? 1024 : 2048;
    key.shadow.mapSize.width = shadowMapSize;
    key.shadow.mapSize.height = shadowMapSize;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 24;
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x60a5fa, 1.25);
    rim.position.set(6, 5, -7);
    scene.add(rim);

    const heldGlowColor = new THREE.Color(0xfbbf24);
    const normalDiceColor = new THREE.Color(0xfff7ed);

    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    const tableMat = new THREE.MeshStandardMaterial({ color: 0x103627, roughness: .9, metalness: .03 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(11.6, .42, 7.2), tableMat);
    table.position.y = -0.24;
    table.receiveShadow = true;
    tableGroup.add(table);

    const railMat = new THREE.MeshStandardMaterial({ color: 0x4a2815, roughness: .72, metalness: .02 });
    const railBack = new THREE.Mesh(new THREE.BoxGeometry(12.2, .75, .42), railMat);
    railBack.position.set(0, .1, -3.85);
    railBack.castShadow = true;
    railBack.receiveShadow = true;
    tableGroup.add(railBack);

    const railFront = railBack.clone();
    railFront.position.z = 3.85;
    tableGroup.add(railFront);

    const railLeft = new THREE.Mesh(new THREE.BoxGeometry(.42, .75, 7.65), railMat);
    railLeft.position.set(-6.1, .1, 0);
    railLeft.castShadow = true;
    railLeft.receiveShadow = true;
    tableGroup.add(railLeft);

    const railRight = railLeft.clone();
    railRight.position.x = 6.1;
    tableGroup.add(railRight);

    const gridHelper = new THREE.GridHelper(10.8, 16, 0x2f6b50, 0x194534);
    gridHelper.position.y = .01;
    gridHelper.material.opacity = .18;
    gridHelper.material.transparent = true;
    tableGroup.add(gridHelper);

    function applyWurfwerkVisualTheme() {
      const light = document.documentElement.dataset.theme === "light";
      scene.background.set(light ? 0xf7efe3 : 0x070b14);
      tableMat.color.set(light ? 0xd4b989 : 0x103627);
      railMat.color.set(light ? 0x8a5b35 : 0x4a2815);
      const gridColor = light ? 0xb48545 : 0x2f6b50;
      if (Array.isArray(gridHelper.material)) {
        gridHelper.material.forEach((mat) => mat.color && mat.color.set(gridColor));
      } else if (gridHelper.material?.color) {
        gridHelper.material.color.set(gridColor);
      }
      renderer.domElement.style.background = light ? "#f7efe3" : "#070b14";
    }
    applyWurfwerkVisualTheme();
    window.addEventListener("brettspiele-theme-change", applyWurfwerkVisualTheme);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();

    // Reused scratch objects for the per-frame dice animation below — avoids
    // allocating new Vector3/Quaternion instances every frame per rolling die,
    // which was generating enough garbage to cause visible GC stutter.
    const scratchBezierAB = new THREE.Vector3();
    const scratchBezierBC = new THREE.Vector3();
    const scratchBaseQuat = new THREE.Quaternion();
    const scratchSpinQuat = new THREE.Quaternion();
    const blackColor = new THREE.Color(0x000000);

    const faceQuaternions = {
      // Lokale Würfelflächen:
      // 1 = +Y, 6 = -Y, 2 = +X, 5 = -X, 3 = +Z, 4 = -Z.
      // Diese Rotationen drehen die jeweilige Fläche nach oben in Welt-+Y.
      1: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)),
      6: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)),
      2: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
      5: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)),
      3: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
      4: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
    };

    function newGame(options = {}) {
      clearDice();
      state.dice = [];
      if (options.preservePlayers) {
        state.players = state.players.map((p) => ({
          ...p,
          scores: {},
          reserveRolls: 0,
          rollBonus: 0
        }));
      } else {
        state.players = createPlayersWithBots();
      }
      shuffleTurnOrder();
      state.phase = "playing";
      rebuildOnlinePlayerMap();
      state.currentPlayer = 0;
      state.rollsLeft = startingRollsForCurrentPlayer();
      state.hasRolled = false;
      state.isRolling = false;
      state.gameOver = false;
      categories = buildCategories();
      state.message = tt("rollforge.message.starts", { player: currentPlayerLabel() }, `${currentPlayerLabel()} starts. Rolling automatically...`);
      messageEl.classList.remove("game-over");

      const startX = startingXPositions(currentDiceCount());
      for (let i = 0; i < currentDiceCount(); i++) {
        const die = createDie(i);
        die.group.position.set(startX[i], .68, .6 + Math.sin(i) * .28);
        die.group.rotation.set(rand(-.12, .12), rand(-.12, .12), rand(-.12, .12));
        die.value = null;
        state.dice.push(die);
        scene.add(die.group);
      }
      renderAll();
      scheduleAutoFirstRoll();
    }

    function clearDice() {
      if (!state.dice) return;
      for (const die of state.dice) {
        scene.remove(die.group);
        die.group.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        });
      }
    }

    function ensureDiceCount(count) {
      if (state.dice.length === count) return;
      clearDice();
      state.dice = [];
      const startX = startingXPositions(count);
      for (let i = 0; i < count; i++) {
        const die = createDie(i);
        die.group.position.set(startX[i], .68, .6 + Math.sin(i) * .28);
        die.group.rotation.set(rand(-.8, .8), rand(-.8, .8), rand(-.8, .8));
        die.value = 1;
        state.dice.push(die);
        scene.add(die.group);
      }
    }

    function createDie(index) {
      const group = new THREE.Group();
      group.userData.dieIndex = index;

      const core = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 1.18, 1.18, 10, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xfff7ed, roughness: .58, metalness: .02 })
      );
      core.castShadow = true;
      core.receiveShadow = true;
      group.add(core);

      addFace(group, 1, new THREE.Vector3(0, .603, 0), new THREE.Euler(-Math.PI / 2, 0, 0));
      addFace(group, 6, new THREE.Vector3(0, -.603, 0), new THREE.Euler(Math.PI / 2, 0, 0));
      addFace(group, 2, new THREE.Vector3(.603, 0, 0), new THREE.Euler(0, Math.PI / 2, 0));
      addFace(group, 5, new THREE.Vector3(-.603, 0, 0), new THREE.Euler(0, -Math.PI / 2, 0));
      addFace(group, 3, new THREE.Vector3(0, 0, .603), new THREE.Euler(0, 0, 0));
      addFace(group, 4, new THREE.Vector3(0, 0, -.603), new THREE.Euler(0, Math.PI, 0));

      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.2, 1.2)),
        new THREE.LineBasicMaterial({ color: 0x4b5563, transparent: true, opacity: .38 })
      );
      group.add(outline);

      const glowShell = new THREE.Mesh(
        new THREE.BoxGeometry(1.36, 1.36, 1.36, 10, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      glowShell.visible = false;
      group.add(glowShell);

      const heldLight = new THREE.PointLight(0xfbbf24, 0, 3.2);
      heldLight.position.set(0, .85, 0);
      group.add(heldLight);

      const hitbox = new THREE.Mesh(
        // Click area is intentionally almost exactly the physical die size.
        // It should not include the glow shell or any generous surrounding space.
        new THREE.BoxGeometry(1.22, 1.22, 1.22),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hitbox.userData.dieIndex = index;
      hitbox.userData.isDieHitbox = true;
      hitbox.visible = true;
      hitbox.renderOrder = -1;
      group.add(hitbox);

      return {
        index,
        group,
        core,
        outline,
        glowShell,
        heldLight,
        hitbox,
        value: null,
        held: false,
        rolling: false,
        rollStart: 0,
        rollDuration: 0,
        startPos: new THREE.Vector3(),
        controlPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        startQuat: new THREE.Quaternion(),
        endQuat: new THREE.Quaternion(),
        spinAxis: new THREE.Vector3(1, 1, 0).normalize(),
        spinTurns: 0,
        bounceAmp: 0,
        targetValue: 1
      };
    }

    function addFace(group, value, position, rotation) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const c = canvas.getContext("2d");
      drawFaceTexture(c, value, 256);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;

      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: .5,
        metalness: .02,
        transparent: true
      });

      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.08), mat);
      face.position.copy(position);
      face.rotation.copy(rotation);
      face.userData.faceValue = value;
      group.add(face);
    }

    function drawFaceTexture(c, value, size) {
      c.clearRect(0, 0, size, size);

      const g = c.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, "#fffdf7");
      g.addColorStop(.75, "#ffedd5");
      g.addColorStop(1, "#ead4b7");
      c.fillStyle = g;
      roundRect2d(c, 10, 10, size - 20, size - 20, 42);
      c.fill();

      c.strokeStyle = "rgba(17,24,39,.18)";
      c.lineWidth = 7;
      c.stroke();

      c.fillStyle = "#111827";
      const p = {
        tl: [75, 75], tr: [181, 75], ml: [75, 128], mr: [181, 128], bl: [75, 181], br: [181, 181], c: [128, 128]
      };
      const map = {
        1: [p.c],
        2: [p.tl, p.br],
        3: [p.tl, p.c, p.br],
        4: [p.tl, p.tr, p.bl, p.br],
        5: [p.tl, p.tr, p.c, p.bl, p.br],
        6: [p.tl, p.tr, p.ml, p.mr, p.bl, p.br]
      };
      for (const [x, y] of map[value]) {
        c.beginPath();
        c.arc(x, y, 18, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "rgba(255,255,255,.16)";
        c.beginPath();
        c.arc(x - 5, y - 5, 5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#111827";
      }
    }

    function roundRect2d(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function rollDice() {
      clearTimeout(autoRollTimer);
      if (state.gameOver || state.isRolling || state.rollsLeft <= 0 || !canAct()) return;

      const diceHaveRealValues = values().length === state.dice.length;
      const isFirstRollOfTurn = !state.hasRolled || !diceHaveRealValues;
      const freeDice = isFirstRollOfTurn
        ? state.dice
        : state.dice.filter(d => d.held);

      if (!isFirstRollOfTurn && freeDice.length === 0) {
        state.message = tt("rollforge.message.selectDie", {}, "Select at least one die to reroll first.");
        renderAll();
        return;
      }

      playDiceSound(Math.max(1, freeDice.length - 1) * 60 + 1200);
      state.hasRolled = true;
      state.isRolling = true;
      state.rollsLeft--;
      state.message = tt("rollforge.message.rolling", {}, "Dice are rolling...");

      const targets = finalPositionsAvoiding(freeDice);
      const now = performance.now();
      const rollPayload = {
        rollId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        activeModeId,
        currentPlayer: state.currentPlayer,
        rollsLeft: state.rollsLeft,
        hasRolled: state.hasRolled,
        message: state.message,
        diceCount: state.dice.length,
        dice: []
      };

      freeDice.forEach((die, idx) => {
        const delay = idx * rand(25, 95);
        die.rolling = true;
        die.rollStart = now + delay;
        die.rollDuration = rand(900, 1350);
        die.startPos.copy(die.group.position);
        die.startPos.y = .68;
        die.controlPos.copy(makeThrowControlPoint(die.startPos, targets[idx], idx));
        die.startQuat.copy(die.group.quaternion);
        die.targetValue = randomDie();
        die.value = die.targetValue;
        die.endPos.copy(targets[idx]);
        die.endQuat.copy(faceQuaternions[die.targetValue]);
        const randomZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(-.28, .28));
        die.endQuat.multiply(randomZ);
        die.spinAxis.set(rand(-1, 1), rand(.25, 1), rand(-1, 1)).normalize();
        die.spinTurns = rand(2.4, 4.6) + die.startPos.distanceTo(die.endPos) * .18;
        die.bounceAmp = rand(.75, 1.35) + die.startPos.distanceTo(die.endPos) * .16;

        rollPayload.dice.push({
          index: die.index,
          value: die.targetValue,
          delay,
          duration: die.rollDuration,
          startPos: serializeVector3(die.startPos),
          controlPos: serializeVector3(die.controlPos),
          endPos: serializeVector3(die.endPos),
          startQuat: serializeQuaternion(die.startQuat),
          endQuat: serializeQuaternion(die.endQuat),
          spinAxis: serializeVector3(die.spinAxis),
          spinTurns: die.spinTurns,
          bounceAmp: die.bounceAmp
        });
      });

      broadcastRollAnimation(rollPayload);
      renderAll();
    }

    function serializeVector3(v) {
      return { x: v.x, y: v.y, z: v.z };
    }

    function vectorFromData(data, fallback = new THREE.Vector3()) {
      if (!data) return fallback.clone();
      return new THREE.Vector3(Number(data.x) || 0, Number(data.y) || 0, Number(data.z) || 0);
    }

    function serializeQuaternion(q) {
      return { x: q.x, y: q.y, z: q.z, w: q.w };
    }

    function quaternionFromData(data, fallback = new THREE.Quaternion()) {
      if (!data) return fallback.clone();
      return new THREE.Quaternion(
        Number(data.x) || 0,
        Number(data.y) || 0,
        Number(data.z) || 0,
        Number.isFinite(Number(data.w)) ? Number(data.w) : 1
      ).normalize();
    }

    function applyRemoteRollAnimation(roll) {
      if (!roll || !Array.isArray(roll.dice) || roll.dice.length === 0) return;
      clearTimeout(autoRollTimer);
      activeModeId = roll.activeModeId || activeModeId;
      categories = buildCategories();
      ensureDiceCount(roll.diceCount || currentDiceCount());
      updateVariantCards();

      state.currentPlayer = Number.isInteger(roll.currentPlayer) ? roll.currentPlayer : state.currentPlayer;
      state.rollsLeft = Number.isInteger(roll.rollsLeft) ? roll.rollsLeft : state.rollsLeft;
      state.hasRolled = !!roll.hasRolled;
      state.isRolling = true;
      state.message = roll.message || tt("rollforge.message.rolling", {}, "Dice are rolling...");

      const now = performance.now();
      for (const step of roll.dice) {
        const die = state.dice[step.index];
        if (!die) continue;
        die.rolling = true;
        die.rollStart = now + (Number(step.delay) || 0);
        die.rollDuration = Number(step.duration) || 1000;
        die.startPos.copy(vectorFromData(step.startPos, die.group.position));
        die.controlPos.copy(vectorFromData(step.controlPos, die.startPos));
        die.endPos.copy(vectorFromData(step.endPos, die.startPos));
        die.startQuat.copy(quaternionFromData(step.startQuat, die.group.quaternion));
        die.endQuat.copy(quaternionFromData(step.endQuat, faceQuaternions[step.value] || die.group.quaternion));
        die.spinAxis.copy(vectorFromData(step.spinAxis, new THREE.Vector3(1, 1, 0))).normalize();
        die.spinTurns = Number(step.spinTurns) || 3;
        die.bounceAmp = Number(step.bounceAmp) || 1;
        die.targetValue = step.value;
        die.value = step.value;
        die.group.position.copy(die.startPos);
        die.group.quaternion.copy(die.startQuat);
      }

      renderAll();
    }

    function makeThrowControlPoint(start, end, index) {
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(.5);
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const curve = rand(-.75, .75) + (index - 2) * .08;
      mid.x += nx * curve;
      mid.z += nz * curve;
      mid.y = .68;
      return mid;
    }

    function finalPositions(count) {
      return laneLayout(count).map(lane => new THREE.Vector3(lane.x, .68, lane.z));
    }

    function finalPositionsAvoiding(rerollDice) {
      const minDistance = 1.55;
      const occupied = state.dice
        .filter(d => !rerollDice.includes(d))
        .map(d => d.group.position.clone());

      const candidates = landingCandidates();
      const targets = [];

      for (let i = 0; i < rerollDice.length; i++) {
        const die = rerollDice[i];
        const current = die.group.position;

        let best = null;
        let bestScore = Infinity;

        for (const candidate of candidates) {
          const blockedByOccupied = occupied.some(pos => distanceXZ(candidate, pos) < minDistance);
          const blockedByTarget = targets.some(pos => distanceXZ(candidate, pos) < minDistance);
          if (blockedByOccupied || blockedByTarget) continue;

          // Etwas Nähe zur bisherigen Position wirkt ruhiger, Zufall sorgt für natürliche Verteilung.
          const score = distanceXZ(candidate, current) + rand(0, .45);
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }

        if (!best) {
          best = emergencyLandingSpot([...occupied, ...targets], i);
        }

        targets.push(best.clone());
      }

      return targets;
    }

    function landingCandidates() {
      // Feste Rasterpunkte auf dem Würfeltisch. Alle Punkte haben genug Abstand,
      // sodass liegende Würfel als echte Hindernisse behandelt werden können.
      const xs = [-4.25, -2.85, -1.45, 0, 1.45, 2.85, 4.25];
      const zs = [-1.55, -.55, .55, 1.55];
      const points = [];

      for (const z of zs) {
        for (const x of xs) {
          if (Math.abs(x) > 3.95 && Math.abs(z) > 1.25) continue;
          points.push(new THREE.Vector3(x, .68, z));
        }
      }

      // Mitte bevorzugt leicht, damit die Würfel nicht immer am Rand kleben.
      return points.sort((a, b) => {
        const da = Math.hypot(a.x * .75, a.z);
        const db = Math.hypot(b.x * .75, b.z);
        return da - db + rand(-.2, .2);
      });
    }

    function emergencyLandingSpot(blocked, index) {
      // Fallback, falls das Raster durch ungünstige alte Positionen voll wirkt.
      // Spiralähnliche Suche mit großem Mindestabstand.
      const minDistance = 1.45;
      for (let radius = .5; radius <= 4.2; radius += .35) {
        for (let step = 0; step < 28; step++) {
          const angle = step / 28 * Math.PI * 2 + index * .7;
          const pos = new THREE.Vector3(
            clamp(Math.cos(angle) * radius, -4.2, 4.2),
            .68,
            clamp(Math.sin(angle) * radius * .65, -2.15, 2.15)
          );
          if (blocked.every(other => distanceXZ(pos, other) >= minDistance)) return pos;
        }
      }
      return new THREE.Vector3(rand(-3.4, 3.4), .68, rand(-1.8, 1.8));
    }

    function distanceXZ(a, b) {
      return Math.hypot(a.x - b.x, a.z - b.z);
    }

    function laneLayout(count) {
      const layouts = {
        1: [[0, 0]],
        2: [[-1.35, -.72], [1.35, .72]],
        3: [[-2.25, -.96], [0, 0], [2.25, .96]],
        4: [[-3.05, -1.18], [-1.05, .72], [1.05, -.72], [3.05, 1.18]],
        5: [[-3.65, -1.32], [-1.82, .82], [0, -.2], [1.82, 1.18], [3.65, -.98]],
        6: [[-4.05, -1.35], [-2.4, .75], [-.8, -1.05], [.8, 1.05], [2.4, -.75], [4.05, 1.35]],
        7: [[-4.25, -1.35], [-2.85, .95], [-1.42, -.85], [0, 1.35], [1.42, -.35], [2.85, 1.05], [4.25, -1.25]]
      }[count] || [];

      return layouts.map(([x, z]) => ({ x, z }));
    }

    function keepRollingDiceSeparated() {
      // Die Zielpositionen werden bereits vor dem Wurf so gewählt, dass sie nicht
      // mit liegenden Würfeln kollidieren. Während der Fluganimation wird bewusst
      // nicht mehr hart verschoben, weil genau dieses nachträgliche Wegdrücken
      // sichtbares Zucken verursacht hat.
    }

    function finishRollingIfDone() {
      if (!state.isRolling) return;
      const anyRolling = state.dice.some(d => d.rolling);
      if (anyRolling) return;

      state.isRolling = false;
      for (const die of state.dice) {
        die.held = false;
        setDieHeldVisual(die, false);
      }

      state.message = state.rollsLeft === 0
        ? "Dice are settled. No rolls left — choose a category."
        : "Dice are settled. Select dice to reroll, or score a category."
      renderAll();
      // Realtime: a roll finishes asynchronously after the click handler returns.
      // Broadcast here so online clients see the settled dice without refreshing.
      broadcastSnapshot();
      if (online.connected && online.role === "client" && pendingRemoteSnapshot) {
        const snapshot = pendingRemoteSnapshot;
        pendingRemoteSnapshot = null;
        applySnapshot(snapshot);
      }
    }

    function toggleHold(die) {
      if (!state.hasRolled || values().length !== state.dice.length || state.isRolling || state.gameOver || state.rollsLeft <= 0 || !canAct()) return;
      die.held = !die.held;
      setDieHeldVisual(die, die.held);
      die.group.position.y = die.held ? .92 : .68;
      state.message = die.held
        ? `Die ${die.index + 1} will be rerolled next.`
        : `Die ${die.index + 1} will stay.`
      renderAll();
    }

    function releaseAll() {
      if (state.isRolling || state.gameOver || !canAct() || values().length !== state.dice.length) return;
      for (const die of state.dice) {
        die.held = false;
        setDieHeldVisual(die, false);
        die.group.position.y = .68;
      }
      state.message = tt("rollforge.message.selectionCleared", {}, "Selection cleared. Without selected dice, nothing will reroll.")
      renderAll();
    }

    function chooseCategory(id) {
      clearTimeout(autoRollTimer);
      if (values().length !== state.dice.length) return;
      if (state.gameOver || state.isRolling || !state.hasRolled || currentScores()[id] !== undefined || !canAct()) return;
      const cat = categories.find(c => c.id === id);
      const points = cat.score(values());
      currentScores()[id] = points;
      const bankedRolls = bankUnusedRolls();

      if (allPlayersFinished()) {
        state.gameOver = true;
        const winner = winnerText();
        state.message = `${tt("rollforge.message.gameOver", {}, "Game over!")} ${winner}`;
        messageEl.classList.add("game-over");
      } else {
        advanceToNextPlayer();
        state.message = `${cat.label}: ${points} ${tt("ranking.points", {}, "points")}.${bankedRolls > 0 ? ` ${bankedRolls} ${tt("rollforge.rollsBanked", {}, "rolls banked")}.` : ""} ${currentPlayerLabel()} ${tt("rollforge.isUpAuto", {}, "is up. Rolling automatically...")}`;
        resetDiceForNextRound();
      }
      renderAll();
      scheduleAutoFirstRoll();
    }

    function advanceToNextPlayer() {
      let guard = 0;
      do {
        state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
        guard++;
      } while (isPlayerFinished(state.currentPlayer) && guard <= state.players.length);
      state.rollsLeft = startingRollsForCurrentPlayer();
      state.hasRolled = false;
    }

    function resetDiceForNextRound() {
      const positions = startingXPositions(currentDiceCount());
      state.dice.forEach((die, i) => {
        die.value = null;
        die.targetValue = null;
        die.held = false;
        die.rolling = false;
        setDieHeldVisual(die, false);
        die.group.position.set(positions[i], .68, .6 + Math.sin(i) * .28);
        die.group.quaternion.copy(faceQuaternions[1]);
        die.group.rotation.y += rand(-.15, .15);
      });
    }

    function animate() {
      const dt = clock.getDelta();
      const now = performance.now();

      for (const die of state.dice) {
        if (!die.rolling) {
          if (die.held) {
            die.group.rotation.y += Math.sin(now * .003 + die.index) * dt * .08;
            die.glowShell.material.opacity = .18 + Math.sin(now * .006 + die.index) * .055;
            die.heldLight.intensity = 1.25 + Math.sin(now * .006 + die.index) * .25;
          }
          continue;
        }

        const localTime = now - die.rollStart;
        if (localTime < 0) continue;

        const t = clamp(localTime / die.rollDuration, 0, 1);
        const e = easeOutCubic(t);
        const curvedPos = quadraticBezier(die.startPos, die.controlPos, die.endPos, e);
        die.group.position.copy(curvedPos);

        const flightArc = Math.sin(t * Math.PI) * die.bounceAmp;
        const landingCushion = Math.sin(t * Math.PI * 2) * 0.035 * (1 - t);
        die.group.position.y = .68 + Math.max(0, flightArc + landingCushion);

        scratchBaseQuat.slerpQuaternions(die.startQuat, die.endQuat, e);
        scratchSpinQuat.setFromAxisAngle(die.spinAxis, Math.PI * 2 * die.spinTurns * (1 - easeInOutQuad(t)));
        die.group.quaternion.copy(scratchBaseQuat).multiply(scratchSpinQuat);

        const wobble = Math.sin(t * Math.PI * 6) * (1 - t) * .018;
        die.group.scale.set(1 + wobble, 1 - wobble * .35, 1 + wobble * .18);

        if (t >= 1) {
          die.rolling = false;
          die.group.position.copy(die.endPos);
          die.group.position.y = .68;
          die.group.quaternion.copy(die.endQuat);
          die.group.scale.set(1, 1, 1);
        }
      }

      keepRollingDiceSeparated();
      finishRollingIfDone();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    function createPlayersWithBots() {
      const humans = Math.max(online.connected ? 1 : 1, state.playerCount - state.botCount);
      const players = [];
      for (let i = 0; i < humans; i++) {
        players.push({
          name: i === 0 ? (nameInput.value.trim() || (online.connected ? tt("rollforge.defaultHost", {}, "Host") : tt("rollforge.defaultPlayer", {}, "Player 1"))) : `Player ${i + 1}`,
          scores: {},
          reserveRolls: 0,
          clientId: online.connected && i === 0 ? online.clientId : null,
          isBot: false
        });
      }
      for (let i = 0; i < state.botCount; i++) {
        players.push({
          name: `Bot ${i + 1}`,
          scores: {},
          reserveRolls: 0,
          clientId: null,
          isBot: true
        });
      }
      return players;
    }

    function shuffleTurnOrder() {
      for (let i = state.players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.players[i], state.players[j]] = [state.players[j], state.players[i]];
      }
    }

    function rebuildOnlinePlayerMap() {
      if (!online.connected || online.role !== "host") return;
      online.playerMap = {};
      state.players.forEach((player, index) => {
        if (player.clientId) online.playerMap[player.clientId] = index;
      });
      online.playerIndex = online.playerMap[online.clientId] ?? 0;
    }

    function renderAll() {
      updateOnlineLobbyUI();
      const activeScores = state.players.length ? currentScores() : {};
      playerInfo.textContent = `${state.players.length ? state.currentPlayer + 1 : 0} / ${state.players.length}`;
      roundInfo.textContent = `${Math.min(Object.keys(activeScores).length + 1, categories.length)} / ${categories.length}`;
      rollsLeftEl.textContent = state.rollsLeft;
      diceSumEl.textContent = state.hasRolled ? sum(values()) : 0;
      messageEl.textContent = state.message;
      if (!state.gameOver) messageEl.classList.remove("game-over");

      rollBtn.disabled = state.gameOver || state.isRolling || state.rollsLeft <= 0 || !canActLocally();
      releaseBtn.disabled = state.gameOver || state.isRolling || !state.hasRolled || !canActLocally();
      newBtn.disabled = state.isRolling || (online.connected && online.role !== "host");
playersBtn.textContent = `${tt("rollforge.playersSection", {}, "Players")}: ${state.playerCount}`;
      playersBtn.disabled = true;
      playersBtn.style.display = "none";
      const statusPlayer = state.phase === "playing" && state.players.length ? currentPlayerLabel() : "Lobby";
      gameStatusPill.innerHTML = online.connected
        ? `${gameModes[activeModeId].label} · ${online.role === "host" ? "Online Host" : "Online Client"} · <strong>${statusPlayer}</strong>`
        : `${gameModes[activeModeId].label} · ${tt("rollforge.status.offline", {}, "Lobby · Offline")} · <strong>${statusPlayer}</strong>`;
      renderAllScoreSheets();
      scheduleBotTurn();
      if (state.gameOver) showEndRanking(false);
      else if (rankingOverlay && !rankingOverlay.classList.contains("hidden")) hideEndRanking();
      persistHotseatState();
    }

    function renderAllScoreSheets() {
      if (!allScoreSheets) return;
      const activeIndex = state.currentPlayer;
      allScoreSheets.innerHTML = state.players.map((player, index) => {
        const scores = player.scores || {};
        const active = index === activeIndex && !state.gameOver;
        const open = active || userOpenScoreSheets.has(index);
        let currentSection = null;
        const rows = [];

        for (const cat of categories) {
          if (cat.section !== currentSection) {
            currentSection = cat.section;
            rows.push(`<div class="mini-row section"><span>${escapeHtml(currentSection)}</span><span></span></div>`);
          }

          const used = scores[cat.id] !== undefined;
          const canScoreHere = active && !used && state.hasRolled && !state.isRolling && canActLocally();
          const possible = active && state.hasRolled && !state.isRolling ? cat.score(values()) : "—";
          const value = used ? scores[cat.id] : possible;
          const rowClass = [
            "mini-row",
            used ? "used" : "unused",
            canScoreHere ? "score-category possible" : "locked"
          ].join(" ");

          if (canScoreHere) {
            rows.push(`
              <button type="button" class="${rowClass}" data-category-id="${escapeHtml(cat.id)}" title="${escapeHtml(cat.desc)}">
                <span><strong>${escapeHtml(cat.label)}</strong><small>${escapeHtml(cat.desc)}</small></span>
                <span class="mini-points">${value}</span>
              </button>
            `);
          } else {
            rows.push(`
              <div class="${rowClass}" title="${escapeHtml(cat.desc)}">
                <span><strong>${escapeHtml(cat.label)}</strong><small>${escapeHtml(cat.desc)}</small></span>
                <span class="mini-points">${value}</span>
              </div>
            `);
          }

          if (cat.id === "sixes") {
            const uTot = upperTotal(scores), thr = upperBonusThreshold(), bVal = upperBonusValue();
            const need = Math.max(0, thr - uTot);
            const upperNote = need > 0
              ? tt("rollforge.bonusNeed", { n: need, v: bVal }, `noch ${need} für +${bVal}`)
              : tt("rollforge.bonusReached", { v: bVal }, `Bonus +${bVal} erreicht`);
            rows.push(`<div class="mini-row total"><span>${escapeHtml(tt("rollforge.upperTotal", {}, "Upper Total"))} <small class="mini-note">${escapeHtml(upperNote)}</small></span><span class="mini-points">${uTot} / ${thr}</span></div>`);
            rows.push(`<div class="mini-row total"><span>${escapeHtml(tt("rollforge.bonus", {}, "Bonus"))} <small class="mini-note">${escapeHtml(tt("rollforge.bonusGives", { threshold: thr, value: bVal }, `ab ${thr} Punkten: +${bVal}`))}</small></span><span class="mini-points">${upperBonus(scores)}</span></div>`);
          }
        }

        rows.push(`<div class="mini-row total"><span>${escapeHtml(tt("rollforge.lowerTotal", {}, "Lower Total"))}</span><span class="mini-points">${lowerTotal(scores)}</span></div>`);
        rows.push(`<div class="mini-row grand"><span>${escapeHtml(tt("rollforge.grandTotal", {}, "Grand Total"))}</span><span class="mini-points">${grandTotalFor(scores, player.rollBonus)}</span></div>`);

        return `
          <details class="player-sheet${active ? " active" : ""}" data-player-index="${index}" ${open ? "open" : ""}>
            <summary>
              <span>${active ? "▶ " : ""}${escapeHtml(player.name)}${player.isBot ? " · Bot" : ""}
                <span class="sheet-meta">${Object.keys(scores).length} / ${categories.length} ${escapeHtml(tt("rollforge.th.category", {}, "categories"))} · ${grandTotalFor(scores, player.rollBonus)} ${tt("ranking.points", {}, "pts")}${active ? " · ▶" : ""}</span>
              </span>
            </summary>
            <div class="mini-table">${rows.join("")}</div>
          </details>
        `;
      }).join("");

      allScoreSheets.querySelectorAll(".player-sheet").forEach((sheet) => {
        sheet.addEventListener("toggle", () => {
          const index = Number(sheet.dataset.playerIndex);
          if (!Number.isInteger(index) || index === state.currentPlayer) return;
          if (sheet.open) userOpenScoreSheets.add(index);
          else userOpenScoreSheets.delete(index);
        });
      });

      allScoreSheets.querySelectorAll(".score-category[data-category-id]").forEach((row) => {
        row.addEventListener("click", () => requestAction({ type: "choose", categoryId: row.dataset.categoryId }));
      });
    }

    function renderScoreboard() {
      if (!scoreBody) return;
      scoreBody.innerHTML = "";
      renderPlayerSummaryRows();
      let currentSection = null;

      for (const cat of categories) {
        if (cat.section !== currentSection) {
          currentSection = cat.section;
          const sectionRow = document.createElement("tr");
          sectionRow.className = "section";
          sectionRow.innerHTML = `<td colspan="3">${currentSection}</td>`;
          scoreBody.appendChild(sectionRow);
        }

        const used = currentScores()[cat.id] !== undefined;
        const locked = !state.hasRolled || state.isRolling || state.gameOver || !canActLocally();
        const possible = state.hasRolled && !state.isRolling ? cat.score(values()) : "–";
        const row = document.createElement("tr");
        row.className = `category ${used ? "used" : ""} ${locked ? "locked" : ""}`;
        row.innerHTML = `
          <td><strong>${cat.label}</strong></td>
          <td>${cat.desc}</td>
          <td class="points ${!used && !locked ? "possible" : ""}">${used ? currentScores()[cat.id] : possible}</td>
        `;
        row.addEventListener("click", () => requestAction({ type: "choose", categoryId: cat.id }));
        scoreBody.appendChild(row);

        if (cat.id === "sixes") {
          appendTotalRow(tt("rollforge.upperTotal", {}, "Upper Total"), upperTotal(), "");
          appendTotalRow(tt("rollforge.bonus", {}, "Bonus"), upperBonus(), upperBonus() > 0 ? `+${upperBonusValue()}` : `${Math.max(0, upperBonusThreshold() - upperTotal())}`);
        }
      }

      appendTotalRow(tt("rollforge.lowerTotal", {}, "Lower Total"), lowerTotal(), "");
      appendTotalRow(tt("rollforge.grandTotal", {}, "Grand Total"), grandTotal(), "", true);
    }

    function appendTotalRow(label, value, desc = "", grand = false) {
      const row = document.createElement("tr");
      row.className = `total ${grand ? "grand" : ""}`;
      row.innerHTML = `<td>${label}</td><td>${desc}</td><td class="points">${value}</td>`;
      scoreBody.appendChild(row);
    }

    function renderPlayerSummaryRows() {
      const sectionRow = document.createElement("tr");
      sectionRow.className = "section";
      sectionRow.innerHTML = `<td colspan="3">${tt("rollforge.playersSection", {}, "Players")}</td>`;
      scoreBody.appendChild(sectionRow);

      state.players.forEach((player, index) => {
        const row = document.createElement("tr");
        const active = index === state.currentPlayer && !state.gameOver;
        row.className = `total ${active ? "grand" : ""}`;
        row.innerHTML = `
          <td>${active ? "▶ " : ""}${player.name}</td>
          <td>${Object.keys(player.scores).length} / ${categories.length} ${escapeHtml(tt("rollforge.th.category", {}, "categories"))} · next rolls: ${3 + (player.reserveRolls || 0)}</td>
          <td class="points">${grandTotalFor(player.scores, player.rollBonus)}</td>
        `;
        scoreBody.appendChild(row);
      });
    }

    function resize() {
      const rect = scenePanel.getBoundingClientRect();
      renderer.setPixelRatio(getRenderPixelRatio());
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      updateCameraForViewport();
      camera.updateProjectionMatrix();
    }

    function getRenderPixelRatio() {
      const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
      return Math.min(window.devicePixelRatio || 1, isSmall ? 1.35 : 2);
    }

    function updateCameraForViewport() {
      const isPortrait = window.innerWidth < 700 && window.innerHeight > window.innerWidth;
      const isSmallLandscape = window.innerHeight < 560;
      // Looking at a point above the table (instead of dead-on at y=0) shifts
      // the rendered table/dice further DOWN in the frame. On tall mobile
      // panels the table otherwise lands too close to the top edge, under the
      // topbar overlay.
      let lookAtY = 0;
      if (isPortrait) {
        camera.fov = 56;
        camera.position.set(0, 12.6, 15.2);
        lookAtY = 3.5;
      } else if (isSmallLandscape) {
        camera.fov = 44;
        camera.position.set(0, 8.2, 10.2);
      } else {
        camera.fov = 42;
        camera.position.set(0, 8.8, 10.5);
      }
      // Fit-to-screen: guarantee the full dice spread stays visible on any panel
      // aspect ratio. Only ever pull the camera *back* (never closer), so wide
      // screens keep their tuned framing while narrow/tall panels zoom out enough
      // to keep every die on screen.
      const NEED_HALF_WIDTH = 5.6;                       // half dice spread + margin (covers 7 dice)
      const vFov = camera.fov * Math.PI / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1));
      const dist = Math.hypot(camera.position.y, camera.position.z);
      const visibleHalfWidth = dist * Math.tan(hFov / 2);
      if (visibleHalfWidth > 0 && visibleHalfWidth < NEED_HALF_WIDTH) {
        const f = NEED_HALF_WIDTH / visibleHalfWidth;
        camera.position.y *= f;
        camera.position.z *= f;
      }
      camera.lookAt(0, lookAtY, 0);
    }

    function onPointerMove(event) {
      const hit = pickDie(event);
      document.body.style.cursor = hit && state.hasRolled && !state.isRolling && state.rollsLeft > 0 && canActLocally() ? "pointer" : "default";
    }

    function onPointerClick(event) {
      const die = pickDie(event);
      if (die) requestAction({ type: "toggle", dieIndex: die.index });
    }

    function pickDie(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hitboxes = state.dice.map(d => d.hitbox);
      const hits = raycaster.intersectObjects(hitboxes, false);
      if (!hits.length) return null;

      const index = hits[0].object.userData.dieIndex;
      return Number.isInteger(index) ? state.dice[index] : null;
    }

    function setDieHeldVisual(die, held) {
      die.glowShell.visible = held;
      die.glowShell.material.opacity = held ? .2 : 0;
      die.heldLight.intensity = held ? 1.25 : 0;
      die.core.material.emissive.copy(held ? heldGlowColor : blackColor);
      die.core.material.emissiveIntensity = held ? .22 : 0;
      die.outline.material.color.set(held ? 0xfbbf24 : 0x4b5563);
      die.outline.material.opacity = held ? .85 : .38;
    }

    // Ob eine AKTION ausgeführt werden darf — inkl. Übernahme entfernter
    // (relayed) und lokaler Bot-Aktionen. Nur in Aktions-Handlern verwenden.
    function canAct() {
      if (trustedRemoteAction || botIsActing) return true;
      return canActLocally();
    }
    // Ob der LOKALE menschliche Spieler gerade selbst am Zug ist — für die
    // UI-Darstellung (Buttons/Zeilen). Ignoriert bewusst trustedRemoteAction/
    // botIsActing, damit der Würfel-Button beim Verarbeiten der Aktion eines
    // ANDEREN Spielers nicht kurz aufleuchtet.
    function canActLocally() {
      const player = currentPlayer();
      if (!player || player.isBot || state.gameOver) return false;
      if (!online.connected) return true;
      return online.playerIndex === state.currentPlayer;
    }

    function scheduleAutoFirstRoll() {
      clearTimeout(autoRollTimer);
      if (state.gameOver || state.isRolling || state.hasRolled || state.rollsLeft <= 0) return;
      if (currentPlayer()?.isBot) return;
      if (!canAct()) return;

      autoRollTimer = setTimeout(startTurnAutoRoll, 250);
    }

    function startTurnAutoRoll() {
      clearTimeout(autoRollTimer);
      if (state.gameOver || state.isRolling || state.hasRolled || state.rollsLeft <= 0) return;
      if (currentPlayer()?.isBot) return;
      if (!canAct()) return;
      requestAction({ type: "roll" });
    }

    function scheduleBotTurn() {
      clearTimeout(botTimer);
      const player = currentPlayer();
      if (!player?.isBot || state.gameOver || state.isRolling) return;
      if (online.connected && online.role !== "host") return;

      botTimer = setTimeout(() => runBotTurn(), state.hasRolled ? 700 : 900);
    }

    function runBotTurn() {
      const player = currentPlayer();
      if (!player?.isBot || state.gameOver || state.isRolling) return;

      botIsActing = true;
      try {
        if (!state.hasRolled) {
          state.message = tt("rollforge.message.botRolling", { name: player.name }, `${player.name} is rolling...`);
          rollDice();
          return;
        }

        if (state.rollsLeft > 0 && shouldBotReroll()) {
          selectBotRerollDice();
          state.message = tt("rollforge.message.botReroll", { name: player.name }, `${player.name} rerolls selected dice...`);
          rollDice();
          return;
        }

        const category = bestBotCategory();
        if (category) {
          chooseCategory(category.id);
          broadcastSnapshot();
        }
      } finally {
        botIsActing = false;
      }
    }

    function shouldBotReroll() {
      const bestScore = bestBotCategory()?.score(values()) || 0;
      if (state.rollsLeft >= 2) return true;
      return bestScore < Math.max(18, currentDiceCount() * 4);
    }

    function selectBotRerollDice() {
      const dice = values();
      if (dice.length !== state.dice.length) return;
      const counts = dice.reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      }, {});

      let keepValue = dice[0];
      let keepCount = 0;
      for (let value = 6; value >= 1; value--) {
        const count = counts[value] || 0;
        if (count > keepCount) {
          keepValue = value;
          keepCount = count;
        }
      }

      state.dice.forEach((die, index) => {
        const shouldReroll = die.value !== keepValue && die.value <= 4;
        die.held = shouldReroll;
        setDieHeldVisual(die, shouldReroll);
        die.group.position.y = shouldReroll ? .92 : .68;
      });

      if (!state.dice.some(die => die.held)) {
        const lowestIndex = dice.indexOf(Math.min(...dice));
        const die = state.dice[lowestIndex];
        die.held = true;
        setDieHeldVisual(die, true);
        die.group.position.y = .92;
      }
    }

    function bestBotCategory() {
      const scores = currentScores();
      const dice = values();
      if (dice.length !== state.dice.length) return null;
      let best = null;
      let bestScore = -1;

      for (const category of categories) {
        if (scores[category.id] !== undefined) continue;
        const score = category.score(dice);
        const priorityBonus = category.section === "Upper" ? 2 : 0;
        if (score + priorityBonus > bestScore) {
          best = category;
          bestScore = score + priorityBonus;
        }
      }

      return best;
    }

    function requestAction(action) {
      if (online.connected && online.role === "client") {
        if (!canAct()) return;
        sendOnline({ type: "action", action });
        return;
      }

      if (!canAct()) return;
      performAction(action);
      if (online.connected && online.role === "host" && action.type !== "roll") {
        broadcastSnapshot();
      }
    }

    function performAction(action) {
      if (action.type === "roll") rollDice();
      if (action.type === "toggle") toggleHold(state.dice[action.dieIndex]);
      if (action.type === "release") releaseAll();
      if (action.type === "choose") chooseCategory(action.categoryId);
    }

    function createOnlineLobby(name) {
      clearDice();
      state.dice = [];
      state.phase = "lobby";
      state.gameOver = false;
      state.isRolling = false;
      state.hasRolled = false;
      state.currentPlayer = 0;
      const hostName = name || tt("rollforge.defaultHost", {}, "Host");
      state.players = [{
        name: hostName,
        scores: {},
        reserveRolls: 0,
        clientId: online.clientId,
        isBot: false
      }];
      for (let i = 0; i < state.botCount; i++) {
        state.players.push({
          name: `Bot ${i + 1}`,
          scores: {},
          reserveRolls: 0,
          clientId: null,
          isBot: true
        });
      }
      state.playerCount = state.players.length;
      rebuildOnlinePlayerMap();
      state.message = tt("rollforge.message.roomOpen", { room: online.room }, `Room ${online.room} is open. Waiting for players...`);
      updateOnlineLobbyUI();
    }

    function startOnlineGameFromLobby() {
      if (!online.connected || online.role !== "host") return;
      if (state.phase !== "lobby") return;
      syncLobbyHostSettings({ updatePlayers: true, broadcast: false });
      // Delist the room once play actually starts — the public browser is
      // for finding open lobbies, not for spectating/joining a match already
      // underway.
      state.publicRoom = false;
      if (publicRoomCheckHost) publicRoomCheckHost.checked = false;
      newGame({ preservePlayers: true });
      closeLobby();
      broadcastSnapshot();
      scheduleAutoFirstRoll();
    }

    function syncLobbyHostSettings({ updatePlayers = true, broadcast = true } = {}) {
      if (!online.connected || online.role !== "host" || state.phase !== "lobby") return;
      const hostName = (onlineHostName?.value || nameInput.value || lobbyHostName?.value || tt("rollforge.defaultHost", {}, "Host")).trim() || tt("rollforge.defaultHost", {}, "Host");
      nameInput.value = hostName;
      if (state.players[online.playerIndex]) state.players[online.playerIndex].name = hostName;
      const bots = clamp(Number(onlineHostBots?.value ?? lobbyHostBots?.value) || 0, 0, 5);
      state.botCount = bots;
      // The online host lobby (waiting room) checkbox is the control shown next to
      // "Start Game", so it wins. The pre-connect checkbox is kept mirrored to it.
      const keepChk = keepRerollsCheckHost || keepRerollsCheck;
      state.keepRerolls = keepChk ? keepChk.checked : state.keepRerolls;
      state.publicRoom = publicRoomCheckHost ? publicRoomCheckHost.checked : state.publicRoom;
      if (updatePlayers) syncLobbyBots(bots);
      categories = buildCategories();
      state.playerCount = state.players.length;
      rebuildOnlinePlayerMap();
      saveOnlineSessionMeta();
      updateVariantCards();
      if (broadcast) broadcastSnapshot();
    }

    function syncLobbyBots(targetCount) {
      const humans = state.players.filter((p) => !p.isBot);
      const bots = [];
      for (let i = 0; i < targetCount; i++) {
        const existing = state.players.filter((p) => p.isBot)[i];
        bots.push(existing || { name: `Bot ${i + 1}`, scores: {}, reserveRolls: 0, clientId: null, isBot: true });
        bots[i].name = bots[i].name || `Bot ${i + 1}`;
        bots[i].isBot = true;
      }
      state.players = [...humans, ...bots];
    }

    function setHostLobbyDefaults() {
      if (onlineHostName && !onlineHostName.value) onlineHostName.value = nameInput.value || lobbyHostName?.value || tt("rollforge.defaultHost", {}, "Host");
      if (onlineHostBots) onlineHostBots.value = String(state.botCount || 0);
      if (publicRoomCheckHost) publicRoomCheckHost.checked = !!state.publicRoom;
      syncKeepRerollsUI();
      updateVariantCards();
    }

    // Both keep-rerolls checkboxes (pre-connect host settings + online waiting
    // room) mirror the single source of truth, state.keepRerolls, so it no longer
    // matters which one the host toggles before starting.
    function syncKeepRerollsUI() {
      if (keepRerollsCheck) keepRerollsCheck.checked = !!state.keepRerolls;
      if (keepRerollsCheckHost) keepRerollsCheckHost.checked = !!state.keepRerolls;
    }

    // Sitz gilt als frei/übernehmbar, wenn er kein Bot ist und entweder keinen
    // Besitzer hat oder dessen Besitzer nicht (mehr) verbunden ist. Der eigene
    // Sitz und der des lebenden Hosts bzw. präsenter Peers sind geschützt.
    function onlineSeatClaimable(player) {
      if (!player || player.isBot) return false;
      // Beim Reconnect (Sitz-Auswahl) muss der eigene frühere Sitz wieder
      // wählbar sein: bei einem Reload im selben Tab bleibt die clientId
      // erhalten, sonst gäbe es keinen Button, um wieder als derselbe
      // Spieler einzusteigen. Im normalen Lobby-Betrieb bleibt der eigene
      // Sitz geschützt (kein Button).
      if (player.clientId === online.clientId) return online.awaitingSeatChoice;
      if (!player.clientId) return true;                       // freier Sitz
      // Besitzer vorhanden — nur übernehmbar, wenn nicht präsent (kein Host, kein Peer)
      return !onlinePeers.has(player.clientId);
    }
    function updateOnlineLobbyUI() {
      if (!onlineWaitingRoom) return;
      const inLobby = online.connected && state.phase === "lobby";
      const show = inLobby || (online.connected && online.awaitingSeatChoice);
      onlineWaitingRoom.classList.toggle("hidden", !show);
      if (show) {
        lobbyStepMode?.classList.add("hidden");
        lobbyStepSettings?.classList.add("hidden");
      }
      if (!show) return;
      setHostLobbyDefaults();
      const isHost = online.role === "host";
      onlineHostSettings?.classList.toggle("hidden", !isHost);
      const room = normalizeRoomCode(online.room || roomInput.value || lobbyHostRoom?.value || lobbyJoinRoom?.value || "");
      if (onlineWaitingTitle) onlineWaitingTitle.textContent = online.awaitingSeatChoice ? tt("rollforge.pickSeat", {}, "Sitz wählen") : isHost ? tt("rollforge.onlineLobby", {}, "Online Lobby") : tt("rollforge.waitingRoom", {}, "Waiting Room");
      if (onlineWaitingCode) onlineWaitingCode.textContent = room || "ROOM";
      if (onlineInviteView) onlineInviteView.value = makeInviteUrl(room);
      if (onlineStartGameBtn) onlineStartGameBtn.style.display = (isHost && !online.awaitingSeatChoice) ? "inline-flex" : "none";
      if (onlineWaitingHint) onlineWaitingHint.textContent = online.awaitingSeatChoice ? tt("rollforge.pickSeatHint", {}, "Wähle, welcher Spieler du bist, dann weiter.") : isHost ? tt("rollforge.waitingHost", {}, "Share the link, adjust settings, then start the game.") : tt("rollforge.waitingGuest", {}, "Waiting for the host to start the game.");
      if (onlineLobbyPlayers) {
        const mySeat = state.players.findIndex(p => p.clientId === online.clientId);
        const myName = mySeat >= 0 ? (state.players[mySeat].name || "") : ((nameInput.value || "").trim());
        const nameField = `
          <label class="online-setting-field online-your-name">
            <span>${tt("rollforge.yourName", {}, "Dein Name")}</span>
            <input id="onlineMyNameInput" maxlength="18" placeholder="${tt("rollforge.yourName", {}, "Dein Name")}" value="${escapeHtml(myName)}" />
          </label>`;
        const rows = state.players.map((player, index) => {
          const isMe = player.clientId === online.clientId;
          const claimable = onlineSeatClaimable(player);
          const tag = player.isBot ? tt("rollforge.bot", {}, "Bot")
            : isMe ? tt("rollforge.you", {}, "You")
            : player.clientId && onlinePeers.has(player.clientId) ? tt("rollforge.joined", {}, "Joined")
            : player.clientId ? tt("rollforge.seat", {}, "Seat")
            : tt("rollforge.seat", {}, "Seat");
          const claimBtn = claimable ? `<button type="button" class="secondary online-claim-btn" data-claim="${index}">${tt("rollforge.claimSeat", {}, "Übernehmen")}</button>` : "";
          return `
          <div class="online-player-row${isMe ? " me" : ""}">
            <strong>${escapeHtml(player.name || `Player ${index + 1}`)}</strong>
            <span>${tag}${claimBtn}</span>
          </div>`;
        }).join("");
        onlineLobbyPlayers.innerHTML = nameField + rows;
        const nameEl = document.getElementById("onlineMyNameInput");
        if (nameEl) nameEl.addEventListener("change", () => submitOnlineRename(nameEl.value));
        onlineLobbyPlayers.querySelectorAll(".online-claim-btn").forEach(btn => {
          btn.addEventListener("click", () => claimOnlineSeat(Number(btn.dataset.claim)));
        });
      }
    }

    // Namen des eigenen Sitzes ändern (Gast schickt rename an den Host).
    function submitOnlineRename(rawName) {
      const name = (rawName || "").trim().slice(0, 18);
      if (!name) return;
      nameInput.value = name;
      if (online.role === "host") {
        const seat = online.playerMap[online.clientId];
        if (state.players[seat] && !state.players[seat].isBot) state.players[seat].name = name;
        saveOnlineSessionMeta();
        broadcastSnapshot();
        renderAll();
      } else if (online.role === "client") {
        sendOnline({ type: "rename", name });
      }
    }
    // Einen (freien/verwaisten) Sitz übernehmen — „welcher Spieler bin ich".
    function claimOnlineSeat(index) {
      const name = ((document.getElementById("onlineMyNameInput") && document.getElementById("onlineMyNameInput").value) || nameInput.value || "").trim().slice(0, 18);
      if (name) nameInput.value = name;
      if (online.role === "host") {
        hostAssignSeat(online.clientId, index, name);
        online.awaitingSeatChoice = false;
        if (state.phase === "playing") closeLobby();
        renderAll();
      } else if (online.role === "client") {
        sendOnline({ type: "claimSeat", seatIndex: index, name });
      }
    }
    // Host-seitig: einen Client einem Sitz zuordnen (für Sitz-Auswahl/Rename).
    function hostAssignSeat(clientId, index, name) {
      if (!online.connected || online.role !== "host") return;
      const target = state.players[index];
      if (!target || target.isBot) return;
      const occupiedByLive = target.clientId && target.clientId !== clientId &&
        (target.clientId === online.clientId || onlinePeers.has(target.clientId));
      if (occupiedByLive) {
        sendOnline({ type: "roomFull", to: clientId, message: tt("rollforge.seatTaken", {}, "Sitz ist bereits belegt.") });
        return;
      }
      state.players.forEach((p, i) => { if (i !== index && p.clientId === clientId) p.clientId = null; });
      target.clientId = clientId;
      const nm = (name || "").trim().slice(0, 18);
      if (nm) target.name = nm;
      state.playerCount = state.players.length;
      rebuildOnlinePlayerMap();
      sendOnline({ type: "assignPlayer", to: clientId, playerIndex: index, snapshot: makeSnapshot() });
      broadcastSnapshot();
      renderAll();
    }

    function connectOnline(role, { freshRoom = false } = {}) {
      disconnectOnline(true);
      const url = getWebSocketUrl();
      const room = normalizeRoomCode(roomInput.value.trim() || makeRoomCode());
      const name = nameInput.value.trim() || (role === "host" ? tt("rollforge.defaultHost", {}, "Host") : tt("rollforge.defaultGuest", {}, "Guest"));
      roomInput.value = room;
      nameInput.value = name;

      const socket = new WebSocket(url);
      online.socket = socket;
      online.role = role;
      online.room = room;
      online.connected = false;
      online.restoredFromSession = false;
      clearTimeout(online.restoreTimer);
      lobbyStatus.innerHTML = `Connecting to <strong>${url}</strong> ...`;   

      socket.addEventListener("open", () => {
        online.connected = true;
        lobbyStatus.innerHTML = role === "host"
          ? `<strong>Online Host</strong> · Room ${room}`
          : `<strong>Online Client</strong> · Room ${room}`;

        sendOnline({ type: role === "host" ? "create" : "join", room, name });

        saveOnlineSessionMeta();

        if (role === "host") {
          updateUrlRoom(room);
          if (freshRoom) {
            // Brand-new room (no prior session anywhere to wait for) — open
            // the lobby immediately instead of the reconnect-safety delay below.
            createOnlineLobby(name);
            broadcastSnapshot();
          } else {
            // 450ms was too tight for a real reconnect round trip (WS handshake +
            // server lookup + sessionState reply) on anything but localhost — on
            // a real reload this fired before the saved game arrived and wiped
            // the match back to a fresh lobby via createOnlineLobby(). Give the
            // server a realistic window before giving up and starting fresh.
            online.restoreTimer = setTimeout(() => {
              if (online.restoredFromSession) return;
              createOnlineLobby(name);
              broadcastSnapshot();
              renderAll();
            }, 4000);
          }
        } else {
          updateUrlRoom(room);
          // Beim Reconnect NICHT automatisch dem alten Sitz zuweisen — der
          // Spieler wählt im Warteraum selbst seinen Sitz (awaitingSeatChoice).
          if (!online.awaitingSeatChoice) sendJoinRequestUntilAssigned(name);
        }
        renderAll();
        startPresence();
      });

      socket.addEventListener("message", event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.clientId && msg.clientId === online.clientId) return;
          handleOnlineMessage(msg);
        } catch (err) {
          console.warn("Ungültige Online-Nachricht", err);
        }
      });

      socket.addEventListener("close", () => {
        if (online.socket === socket) stopPresence();   // veralteten Socket beim Reconnect nicht die neue Präsenz stoppen lassen
        online.connected = false;
        const hint = location.protocol === "file:"
          ? "Check whether the local WebSocket server is running on port 8787."
          : "Check whether your web server forwards /ws to the WebSocket server.";
        lobbyStatus.innerHTML = `Offline · disconnected. ${hint}`;
        openLobby();
        renderAll();
      });

      socket.addEventListener("error", () => {
        lobbyStatus.innerHTML = `Connection error · server unreachable: <strong>${url}</strong>`;
      });
    }

    function disconnectOnline(closeSocket = true) {
      stopPresence();
      online.awaitingSeatChoice = false;
      if (closeSocket && online.socket) online.socket.close();
      online.socket = null;
      online.connected = false;
      online.role = "offline";
      online.room = "";
      online.playerIndex = 0;
      online.playerMap = {};
      lobbyStatus.innerHTML = `${tt("letsdraw.offline", {}, "Offline")} · ${tt("rollforge.lobby.chooseHostJoin", {}, "Create a room or join one.")}`;
      renderAll?.();
    }

    function sendJoinRequestUntilAssigned(name) {
      const playerName = name || nameInput.value.trim() || tt("rollforge.defaultGuest", {}, "Guest");
      let attempts = 0;
      const send = () => {
        if (!online.connected || online.role !== "client") return;
        if (state.players.some((player) => player.clientId === online.clientId)) return;
        sendOnline({ type: "joinRequest", name: playerName });
        attempts += 1;
        if (attempts < 10) setTimeout(send, 700);
      };
      send();
    }

    function handleOnlineMessage(msg) {
      if (!online.connected || normalizeRoomCode(msg.room) !== normalizeRoomCode(online.room)) return;

      // Präsenz: jede Nachricht eines Peers ist ein Lebenszeichen (Host-Migration).
      notePeer(msg);
      if (msg.type === "presence") {
        // Doppel-Host auflösen: laufen (durch ein Wahl-Rennen) zwei Hosts, bleibt
        // der mit dem kleineren Sitzindex Host; der andere wird wieder Client.
        if (online.role === "host" && msg.pRole === "host" &&
            typeof msg.pSeat === "number" && msg.pSeat < online.playerIndex) {
          demoteFromHost();
        }
        return;
      }

      if (msg.type === "sessionState" && msg.game === GAME_ID && msg.snapshot) {
        restoreOnlineSession(msg.snapshot);
        return;
      }

      if (online.role === "host") {
        if (msg.type === "joinRequest") {
          assignOnlinePlayer(msg.clientId, msg.name || tt("rollforge.defaultGuest", {}, "Guest"));
          return;
        }

        if (msg.type === "rename") {
          const seat = online.playerMap[msg.clientId];
          if (state.players[seat] && !state.players[seat].isBot) {
            const nm = (msg.name || "").trim().slice(0, 18);
            if (nm) state.players[seat].name = nm;
            broadcastSnapshot();
            renderAll();
          }
          return;
        }

        if (msg.type === "claimSeat") {
          hostAssignSeat(msg.clientId, Number(msg.seatIndex), msg.name);
          return;
        }

        if (msg.type === "action") {
          const playerIndex = online.playerMap[msg.clientId];
          if (playerIndex !== state.currentPlayer) return;
          trustedRemoteAction = true;
          try {
            performAction(msg.action);
          } finally {
            trustedRemoteAction = false;
          }
          if (msg.action.type !== "roll") broadcastSnapshot();
          return;
        }
      }

      if (online.role === "client") {
        if (msg.type === "assignPlayer" && msg.to === online.clientId) {
          online.playerIndex = msg.playerIndex;
          online.awaitingSeatChoice = false;   // Sitz ist gewählt/zugewiesen
          applySnapshot(msg.snapshot);
          lobbyStatus.innerHTML = `<strong>Online Client</strong> · Room ${online.room} · You are Player ${online.playerIndex + 1}`;
          if (state.phase === "playing") {
            closeLobby();
            scheduleAutoFirstRoll();
          } else {
            openLobby();
            updateOnlineLobbyUI();
          }
          return;
        }

        if (msg.type === "roomFull" && msg.to === online.clientId) {
          lobbyStatus.innerHTML = msg.message || "Room is full.";
          return;
        }

        if (msg.type === "rollAnimation") {
          pendingRemoteSnapshot = null;
          applyRemoteRollAnimation(msg.roll);
          return;
        }

        if (msg.type === "snapshot") {
          if (state.isRolling) {
            pendingRemoteSnapshot = msg.snapshot;
            return;
          }
          applySnapshot(msg.snapshot);
        }
      }
    }

    function restoreOnlineSession(snapshot) {
      clearTimeout(online.restoreTimer);
      online.restoredFromSession = true;
      applySnapshot(snapshot);
      if (online.role === "host") {
        adoptHostSeat(nameInput.value.trim() || tt("rollforge.defaultHost", {}, "Host"));
        state.players.forEach((player, index) => {
          if (index !== online.playerIndex && !player.isBot) player.clientId = null;
        });
        online.playerMap = { [online.clientId]: online.playerIndex };
        state.message = tt("rollforge.message.roomRestored", { room: online.room }, `Room ${online.room} restored from invite link.`);
        if (state.phase === "playing") closeLobby();
        else openLobby();
        broadcastSnapshot();
      } else if (online.awaitingSeatChoice) {
        // Reconnect eines Gasts: Warteraum mit Sitz-Auswahl zeigen (auch mitten
        // im Spiel), statt automatisch dem alten Sitz zugewiesen zu werden.
        state.message = tt("rollforge.message.pickSeatOnReload", {}, "Wähle deinen Sitz, um fortzufahren.");
        openLobby();
        updateOnlineLobbyUI();
      } else {
        state.message = tt("rollforge.message.savedLoaded", { room: online.room }, `Saved room ${online.room} loaded. Waiting for host assignment...`);
        if (state.phase === "playing") closeLobby();
        else openLobby();
      }
      saveOnlineSessionMeta();
      renderAll();
    }

    function adoptHostSeat(name) {
      if (!state.players.length) return;
      const preferred = state.players.findIndex(player => !player.isBot && (!player.clientId || player.clientId === online.clientId || player.name === name));
      const index = preferred >= 0 ? preferred : 0;
      state.players[index].name = name || state.players[index].name || tt("rollforge.defaultHost", {}, "Host");
      state.players[index].clientId = online.clientId;
      online.playerIndex = index;
    }

    function assignOnlinePlayer(clientId, name) {
      if (online.playerMap[clientId] !== undefined) {
        const existingIndex = online.playerMap[clientId];
        if (state.players[existingIndex]) {
          state.players[existingIndex].name = name || state.players[existingIndex].name || `Player ${existingIndex + 1}`;
          state.players[existingIndex].clientId = clientId;
        }
        sendOnline({ type: "assignPlayer", to: clientId, playerIndex: existingIndex, snapshot: makeSnapshot() });
        broadcastSnapshot();
        renderAll();
        return;
      }

      let playerIndex = state.players.findIndex(player => !player.isBot && !Object.values(online.playerMap).includes(state.players.indexOf(player)) && (player.name || "").toLowerCase() === String(name || "").toLowerCase());
      if (playerIndex < 0) {
        playerIndex = state.players.findIndex(player => !player.isBot && !Object.values(online.playerMap).includes(state.players.indexOf(player)) && player.clientId && player.clientId !== online.clientId);
      }
      if (playerIndex < 0) {
        if (state.players.length >= 6) {
          sendOnline({ type: "roomFull", to: clientId, message: "Room is full." });
          return;
        }
        playerIndex = state.players.length;
        state.players.push({
          name: name || `Player ${playerIndex + 1}`,
          scores: {},
          reserveRolls: 0,
          clientId,
          isBot: false
        });
      } else {
        state.players[playerIndex].name = name || state.players[playerIndex].name || `Player ${playerIndex + 1}`;
        state.players[playerIndex].clientId = clientId;
      }
      state.playerCount = state.players.length;
      rebuildOnlinePlayerMap();

      sendOnline({ type: "assignPlayer", to: clientId, playerIndex, snapshot: makeSnapshot() });
      broadcastSnapshot();
      renderAll();
    }

    function makeSnapshot() {
      return {
        players: state.players.map(p => ({ name: p.name, scores: { ...p.scores }, reserveRolls: p.reserveRolls || 0, rollBonus: p.rollBonus || 0, clientId: p.clientId || null, isBot: !!p.isBot })),
playerCount: state.playerCount,
        activeModeId,
        currentPlayer: state.currentPlayer,
        rollsLeft: state.rollsLeft,
        hasRolled: state.hasRolled,
        gameOver: state.gameOver,
        message: state.message,
        phase: state.phase,
        diceCount: currentDiceCount(),
        dice: state.dice.map(d => ({
          value: d.value,
          held: d.held,
          position: serializeVector3(d.group.position),
          quaternion: serializeQuaternion(d.group.quaternion)
        }))
      };
    }

    function applySnapshot(snapshot) {
      state.players = snapshot.players.map(p => ({ name: p.name, scores: { ...p.scores }, reserveRolls: p.reserveRolls || 0, rollBonus: p.rollBonus || 0, clientId: p.clientId || null, isBot: !!p.isBot }));
      const ownIndex = state.players.findIndex((p) => p.clientId === online.clientId);
      if (ownIndex >= 0) online.playerIndex = ownIndex;
      state.playerCount = snapshot.playerCount;
      activeModeId = snapshot.activeModeId || "classic";
      categories = buildCategories();
      ensureDiceCount(snapshot.dice?.length || currentDiceCount());
      updateVariantCards();
      state.currentPlayer = snapshot.currentPlayer;
      state.rollsLeft = snapshot.rollsLeft;
      state.hasRolled = snapshot.hasRolled;
      state.gameOver = snapshot.gameOver;
      state.message = snapshot.message;
      state.phase = snapshot.phase || (snapshot.hasRolled || (snapshot.dice && snapshot.dice.length) ? "playing" : "lobby");

      (snapshot.dice || []).forEach((remoteDie, i) => {
        const die = state.dice[i];
        if (!die) return;
        die.value = remoteDie.value;
        die.targetValue = remoteDie.value;
        die.held = !!remoteDie.held;
        die.rolling = false;
        die.group.position.copy(vectorFromData(remoteDie.position, die.group.position));
        if (remoteDie.quaternion) {
          die.group.quaternion.copy(quaternionFromData(remoteDie.quaternion, die.group.quaternion));
        } else if (faceQuaternions[remoteDie.value]) {
          die.group.quaternion.copy(faceQuaternions[remoteDie.value]);
        }
        die.group.position.y = die.held ? .92 : .68;
        setDieHeldVisual(die, die.held);
      });

      state.isRolling = false;
      renderAll();
      if (online.connected && state.phase === "lobby") openLobby();
      if (online.connected && state.phase === "playing") {
        closeLobby();
        scheduleAutoFirstRoll();
      }
    }

    function broadcastRollAnimation(roll) {
      if (!online.connected || online.role !== "host") return;
      sendOnline({ type: "rollAnimation", roll });
    }

    function broadcastSnapshot() {
      if (!online.connected || online.role !== "host") return;
      sendOnline({ type: "snapshot", snapshot: makeSnapshot() });
    }

    function sendOnline(payload) {
      if (!online.socket || online.socket.readyState !== WebSocket.OPEN) return;
      // Only the host's messages may set the public-room listing metadata —
      // a guest's own messages (joinRequest, action, ...) must never clobber
      // it back to an unset/false value.
      const hostMeta = online.role === "host" ? {
        public: !!state.publicRoom,
        hostName: (nameInput.value || "").trim() || undefined,
        maxPlayers: state.playerCount || undefined
      } : {};
      online.socket.send(JSON.stringify({
        ...payload,
        ...hostMeta,
        game: GAME_ID,
        room: online.room,
        clientId: online.clientId
      }));
    }

    // ── Präsenz-Heartbeat + Host-Migration ───────────────────────────────
    // Der Relay meldet Verbindungsabbrüche nicht aktiv. Jeder Client sendet
    // periodisch ein Lebenszeichen; bleibt das des Hosts aus (Timeout), wird
    // der verbundene menschliche Spieler mit dem kleinsten Sitzindex neuer Host.
    const RF_HEARTBEAT_MS = 2500;
    const RF_PEER_TIMEOUT_MS = 8000;
    function startPresence() {
      stopPresence();
      online.heartbeatTimer = setInterval(sendHeartbeat, RF_HEARTBEAT_MS);
      online.presenceTimer = setInterval(checkPresence, 2000);
      sendHeartbeat();
    }
    function stopPresence() {
      if (online.heartbeatTimer) clearInterval(online.heartbeatTimer);
      if (online.presenceTimer) clearInterval(online.presenceTimer);
      online.heartbeatTimer = online.presenceTimer = null;
      onlinePeers.clear();
    }
    function onlineMyName() {
      const p = state.players[online.playerIndex];
      return (p && p.name) || (nameInput.value || "").trim() || "";
    }
    function sendHeartbeat() {
      if (!online.connected || online.role === "offline") return;
      sendOnline({ type: "presence", pRole: online.role, pSeat: online.playerIndex, pName: onlineMyName() });
    }
    function notePeer(msg) {
      const id = msg.clientId;
      if (!id || id === online.clientId) return;
      let peer = onlinePeers.get(id);
      if (!peer) { peer = { role: "client", seat: null, name: "", lastSeen: 0 }; onlinePeers.set(id, peer); }
      peer.lastSeen = Date.now();
      if (msg.type === "presence") {
        if (msg.pRole) peer.role = msg.pRole;
        if (typeof msg.pSeat === "number") peer.seat = msg.pSeat;
        if (msg.pName) peer.name = msg.pName;
      }
    }
    function checkPresence() {
      const now = Date.now();
      for (const [id, peer] of [...onlinePeers]) {
        if (now - peer.lastSeen > RF_PEER_TIMEOUT_MS) {
          onlinePeers.delete(id);
          if (peer.role === "host") migrateHost(peer);
        }
      }
    }
    function connectedHumanSeats() {
      const seats = new Set();
      if (typeof online.playerIndex === "number") seats.add(online.playerIndex);
      for (const peer of onlinePeers.values()) {
        if (peer.role !== "host" && typeof peer.seat === "number") seats.add(peer.seat);
      }
      return seats;
    }
    // Der Host ist weg: deterministische Wahl — der verbundene Mensch mit dem
    // kleinsten Sitzindex übernimmt. Alle Clients rechnen dieselbe Wahl aus dem
    // geteilten Snapshot + der Präsenzliste, es promotet sich also genau einer;
    // ein Rennen fängt der Doppel-Host-Schutz in handleOnlineMessage ab.
    function migrateHost(goneHost) {
      if (online.role !== "client") return;
      const seats = connectedHumanSeats();
      const mySeat = online.playerIndex;
      let min = mySeat;
      seats.forEach(s => { if (s < min) min = s; });
      if (min !== mySeat) return; // jemand anderes übernimmt
      online.role = "host";
      if (state.players[online.playerIndex]) state.players[online.playerIndex].clientId = online.clientId;
      // Verwaisten Host-Sitz zum Bot machen, sonst blockiert dessen Zug das Spiel
      // (Bot-Züge fährt der Host automatisch).
      if (goneHost && typeof goneHost.seat === "number" && state.players[goneHost.seat] && !state.players[goneHost.seat].isBot) {
        const seat = state.players[goneHost.seat];
        seat.isBot = true;
        seat.clientId = null;
        seat.name = seat.name || tt("rollforge.bot", {}, "Bot");
      }
      rebuildOnlinePlayerMap();
      online.restoredFromSession = true;
      saveOnlineSessionMeta();
      sendOnline({ type: "create", room: online.room, name: onlineMyName() });
      sendHeartbeat();
      broadcastSnapshot();
      state.message = tt("rollforge.message.becameHost", {}, "Du bist jetzt der Gastgeber.");
      if (state.phase === "lobby") openLobby();
      renderAll();
    }
    function demoteFromHost() {
      if (online.role !== "host") return;
      online.role = "client";
      state.message = tt("rollforge.message.hostElsewhere", {}, "Ein anderer Spieler ist jetzt Gastgeber.");
      renderAll();
    }

    function makeRoomCode() {
      return Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function getWebSocketUrl() {
      // Beitritt läuft für Spieler nur über den Raumcode.
      // Der Client nimmt automatisch denselben Host wie die Webseite.
      // Lokal geöffnet per file:// fällt er auf localhost:8787 zurück.
      // In lokalen Preview-Umgebungen gibt es kein /ws, daher ebenfalls localhost.
      const host = location.hostname.toLowerCase();
      const isPreview = host.includes("sandbox") || host.includes("oaiusercontent");
      if (location.protocol === "file:" || isPreview) return "ws://localhost:8787";
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}/ws`;
    }

    function getOrCreateHiddenInput(id) {
      let input = document.getElementById(id);
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.id = id;
        document.body.appendChild(input);
      }
      return input;
    }

    function openLobby() {
      hideEndRanking();
      clearTimeout(autoRollTimer);
      clearTimeout(botTimer);
      lobbyOverlay.classList.remove("hidden");
      setSiteReturnVisible(true);
      if (online.connected && state.phase === "lobby") updateOnlineLobbyUI();
      else showLobbyModeStep();
    }
    function setSiteReturnVisible(visible) {
      document.querySelector(".site-return")?.classList.toggle("menu-visible", !!visible);
    }

    function closeLobby() {
      lobbyOverlay.classList.add("hidden");
      setSiteReturnVisible(false);
      stopPublicRoomsPolling();
    }
    function showLobbyModeStep() {
      onlineWaitingRoom?.classList.add("hidden");
      lobbyStepMode.classList.remove("hidden");
      lobbyStepSettings.classList.add("hidden");
      setLobbyMenuMode("create");
      lobbyStatus.innerHTML = `${tt("letsdraw.offline", {}, "Offline")} · ${tt("rollforge.lobby.chooseHostJoin", {}, "Create a room or join one.")}`;
    }
    let lobbyMenuMode = "create";
    function setLobbyMenuMode(mode) {
      lobbyMenuMode = mode === "join" ? "join" : "create";
      modeCreateTab.classList.toggle("active", lobbyMenuMode === "create");
      modeCreateTab.setAttribute("aria-selected", String(lobbyMenuMode === "create"));
      modeJoinTab.classList.toggle("active", lobbyMenuMode === "join");
      modeJoinTab.setAttribute("aria-selected", String(lobbyMenuMode === "join"));
      menuJoinFields.classList.toggle("hidden", lobbyMenuMode !== "join");
      menuActionBtn.textContent = lobbyMenuMode === "join"
        ? tt("rollforge.joinRoom", {}, "Join Room")
        : tt("rollforge.createRoom", {}, "Create Room");
      if (lobbyMenuMode === "join") startPublicRoomsPolling();
      else stopPublicRoomsPolling();
    }

    let publicRoomsPollTimer = null;
    async function fetchPublicRooms() {
      try {
        const res = await fetch(`/api/rooms?game=${GAME_ID}`, { credentials: "include" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        renderPublicRooms(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        // Browsing public rooms is a nice-to-have on top of joining by code,
        // so a failed fetch just leaves the last known list in place.
      }
    }
    function renderPublicRooms(items) {
      if (!publicRoomsItems) return;
      if (!items.length) {
        publicRoomsItems.innerHTML = `<div class="public-rooms-empty muted">${tt("rollforge.publicRooms.empty", {}, "No public rooms right now.")}</div>`;
        return;
      }
      publicRoomsItems.innerHTML = items.map(item => `
        <button type="button" class="public-room-row" data-room="${escapeHtml(item.room)}">
          <strong>${escapeHtml(item.room)}</strong>
          <span>${escapeHtml(item.hostName || tt("rollforge.defaultHost", {}, "Host"))}</span>
          <span class="public-room-count">${item.playerCount}${item.maxPlayers ? "/" + item.maxPlayers : ""}</span>
        </button>
      `).join("");
    }
    function startPublicRoomsPolling() {
      stopPublicRoomsPolling();
      fetchPublicRooms();
      publicRoomsPollTimer = setInterval(fetchPublicRooms, 4000);
    }
    function stopPublicRoomsPolling() {
      if (publicRoomsPollTimer) clearInterval(publicRoomsPollTimer);
      publicRoomsPollTimer = null;
    }
    publicRoomsItems?.addEventListener("click", event => {
      const row = event.target.closest(".public-room-row");
      if (!row || !row.dataset.room) return;
      menuRoomInput.value = row.dataset.room;
      nameInput.value = menuNameInput.value.trim() || tt("rollforge.defaultGuest", {}, "Guest");
      roomInput.value = normalizeRoomCode(row.dataset.room);
      connectOnline("client");
    });
    function showLobbySettingsStep(type) {
      selectedLobbyType = type;
      lobbyStepMode.classList.add("hidden");
      lobbyStepSettings.classList.remove("hidden");
      hotseatSettings.classList.add("hidden");
      hostSettings.classList.toggle("hidden", type !== "host");
      joinSettings.classList.toggle("hidden", type !== "join");
      variantPicker.classList.toggle("hidden", type === "join");
      lobbySettingsTitle.textContent = type === "host" ? tt("rollforge.host.title", {}, "Host Online Settings") : tt("rollforge.join.title", {}, "Join Online");
      if (type === "host") {
        lobbyHostRoom.value = makeRoomCode();
        updateHostInviteLink(lobbyHostRoom.value);
        lobbyStatus.innerHTML = `${tt("rollforge.roomCode", {}, "Room code")}: <strong>${lobbyHostRoom.value}</strong>`;
      } else {
        lobbyStatus.innerHTML = type === "join" ? tt("rollforge.join.desc", {}, "Enter only your player name and the host room code.") : tt("rollforge.settings", {}, "Choose game settings and start.");
      }
    }
    function updateHostInviteLink(room) {
      const code = normalizeRoomCode(room);
      const url = code ? makeInviteUrl(code) : "";
      if (lobbyHostInviteLink) lobbyHostInviteLink.value = url;
      return url;
    }

    function openConfirm({ title, text, confirmLabel, action }) {
      confirmTitle.textContent = title;
      confirmText.textContent = text;
      confirmExitBtn.textContent = confirmLabel;
      pendingConfirmAction = action;
      exitConfirmOverlay.classList.remove("hidden");
    }
    function openExitConfirm() {
      openConfirm({
        title: tt("rollforge.confirm.endTitle", {}, "End current game?"),
        text: tt("rollforge.confirm.endText", {}, "This will leave the current match and return to the lobby. Unsaved scores and the current room session will be lost."),
        confirmLabel: tt("rollforge.confirm.endButton", {}, "End Game"),
        action: exitToLobby
      });
    }
    function openNewGameConfirm() {
      openConfirm({
        title: tt("rollforge.confirm.newTitle", {}, "Start new game?"),
        text: tt("rollforge.confirm.newText", {}, "This will reset the current score sheet and start a fresh game with the current player setup."),
        confirmLabel: tt("rollforge.confirm.newButton", {}, "New Game"),
        action: startNewGameConfirmed
      });
    }
    function closeExitConfirm() {
      exitConfirmOverlay.classList.add("hidden");
      pendingConfirmAction = null;
    }
    function exitToLobby() {
      hideEndRanking();
      closeExitConfirm();
      disconnectOnline(true);
      clearOnlineSessionMeta();
      state.isRolling = false;
      state.gameOver = false;
      state.hasRolled = false;
      state.rollsLeft = startingRollsForCurrentPlayer();
      state.message = tt("rollforge.message.lobby", {}, "Create a room or join one. The dice are pretending to be patient.");
      openLobby();
      renderAll();
    }
    function startNewGameConfirmed() {
      closeExitConfirm();
      if (online.connected && online.role !== "host") return;
      newGame(online.connected && online.role === "host" ? { preservePlayers: true } : {});
      broadcastSnapshot();
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char] || char));
    }

    function values() { return state.dice.map(d => d.value).filter(value => Number.isInteger(value)); }
    function randomDie() { return Math.floor(Math.random() * 6) + 1; }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function sum(dice) { return dice.reduce((a, b) => a + b, 0); }
    function counts(dice) { return dice.reduce((acc, v) => (acc[v] = (acc[v] || 0) + 1, acc), {}); }
    function upperScore(dice, n) { return dice.filter(v => v === n).length * n; }
    function hasSame(dice, n) { return Object.values(counts(dice)).some(c => c >= n); }
    function isFullHouse(dice) {
      const vals = Object.values(counts(dice)).sort((a, b) => b - a);
      if (dice.length <= 5) return vals.length === 2 && vals.includes(2) && vals.includes(3);
      return vals.some(v => v >= 3) && vals.some((v, i) => v >= 2 && vals.findIndex(x => x >= 3) !== i);
    }
    function hasStraight(dice, length) {
      const unique = [...new Set(dice)].sort((a, b) => a - b).join("");
      const straights = length === 4 ? ["1234", "2345", "3456"] : ["12345", "23456"];
      return straights.some(straight => unique.includes(straight));
    }
    function pairScore(dice, amount) {
      const c = counts(dice);
      for (let value = 6; value >= 1; value--) {
        if ((c[value] || 0) >= amount) return value * amount;
      }
      return 0;
    }
    function twoPairsScore(dice) {
      const c = counts(dice);
      const pairs = [];
      for (let value = 6; value >= 1; value--) {
        if ((c[value] || 0) >= 2) pairs.push(value);
      }
      return pairs.length >= 2 ? (pairs[0] + pairs[1]) * 2 : 0;
    }
    function threePairsScore(dice) {
      const c = counts(dice);
      return Object.values(c).filter(v => v >= 2).length >= 3;
    }
    function castleScore(dice) {
      const vals = Object.values(counts(dice)).sort((a, b) => b - a);
      return vals.some(v => v >= 4) && vals.some((v, i) => v >= 3 && vals.findIndex(x => x >= 4) !== i);
    }
    function hasFullRun(dice) {
      const unique = [...new Set(dice)].sort((a, b) => a - b).join("");
      return unique.includes("123456");
    }
    function isExactRun(dice, run) {
      const sorted = [...dice].sort((a, b) => a - b);
      return run.every((value, index) => sorted[index] === value);
    }

    function escapeRankingHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function getFinalRanking() {
      return [...state.players]
        .map((player, index) => ({
          index,
          name: player.name || `Player ${index + 1}`,
          points: grandTotalFor(player.scores || {}, player.rollBonus),
          categoriesDone: Object.keys(player.scores || {}).length
        }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    }

    function makeRankingSignature(ranking = getFinalRanking()) {
      return ranking.map((row) => `${row.name}:${row.points}:${row.categoriesDone}`).join("|");
    }

    function rankingMedal(index) {
      return ["🏆", "🥈", "🥉"][index] || "🎲";
    }

    function rankingClass(index) {
      return ["first", "second", "third"][index] || "";
    }

    function showEndRanking(force = false) {
      if (!rankingOverlay || !state.gameOver || !state.players.length) return;
      const ranking = getFinalRanking();
      const signature = makeRankingSignature(ranking);
      if (!force && signature && signature === lastRankingSignature && !rankingOverlay.classList.contains("hidden")) return;
      lastRankingSignature = signature;

      const winner = ranking[0];
      if (rankingSubtitle) {
        const tieCount = ranking.filter((row) => row.points === winner.points).length;
        rankingSubtitle.textContent = tieCount > 1
          ? tt("rollforge.ranking.tie", { points: winner.points }, `Tie at ${winner.points} points.`)
          : tt("rollforge.ranking.win", { name: winner.name, points: winner.points }, `${winner.name} wins with ${winner.points} points.`);
      }

      const podiumOrder = ranking.slice(0, 3);
      if (rankingPodium) {
        rankingPodium.innerHTML = podiumOrder.map((row, index) => `
          <section class="ranking-place ${rankingClass(index)}" style="--delay:${index * 120}ms">
            <div class="ranking-medal" aria-hidden="true">${rankingMedal(index)}</div>
            <div class="ranking-rank">#${index + 1}</div>
            <div class="ranking-name">${escapeRankingHtml(row.name)}</div>
            <div class="ranking-points">${row.points} ${tt("ranking.points", {}, "pts")}</div>
          </section>
        `).join("");
      }

      if (rankingList) {
        rankingList.innerHTML = ranking.map((row, index) => `
          <div class="ranking-row" style="--delay:${220 + index * 55}ms">
            <span class="num">#${index + 1}</span>
            <span class="name">${escapeRankingHtml(row.name)}</span>
            <span class="pts">${row.points} ${tt("ranking.points", {}, "pts")}</span>
          </div>
        `).join("");
      }

      rankingAgainBtn && (rankingAgainBtn.disabled = online.connected && online.role !== "host");
      rankingOverlay.classList.remove("hidden");
      rankingOverlay.setAttribute("aria-hidden", "false");
      burstRankingSparks();
    }

    function hideEndRanking() {
      if (!rankingOverlay) return;
      rankingOverlay.classList.add("hidden");
      rankingOverlay.setAttribute("aria-hidden", "true");
      lastRankingSignature = "";
    }

    function burstRankingSparks(count = 64) {
      const colors = ["#fbbf24", "#fb923c", "#60a5fa", "#34d399", "#f8fafc"];
      for (let i = 0; i < count; i++) {
        const piece = document.createElement("i");
        piece.className = "ranking-spark";
        piece.style.setProperty("--x", `${Math.random() * 100}%`);
        piece.style.setProperty("--d", `${1.8 + Math.random() * 1.9}s`);
        piece.style.setProperty("--c", colors[i % colors.length]);
        piece.style.animationDelay = `${Math.random() * .25}s`;
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 4200);
      }
    }

    function currentPlayer() { return state.players[state.currentPlayer]; }
    function bankUnusedRolls() {
      if (!state.keepRerolls) return 0;
      if (!state.hasRolled || state.rollsLeft <= 0 || state.gameOver) return 0;
      const banked = state.rollsLeft;
      currentPlayer().reserveRolls = (currentPlayer().reserveRolls || 0) + banked;
      return banked;
    }
    function startingRollsForCurrentPlayer() {
      const bonus = currentPlayer()?.reserveRolls || 0;
      if (currentPlayer()) currentPlayer().reserveRolls = 0;
      return 3 + bonus;
    }
    function currentPlayerLabel() {
      const player = currentPlayer();
      if (!player) return tt("rollforge.lobby", {}, "Lobby");
      return `${player.name} · ${grandTotalFor(player.scores, player.rollBonus)} ${tt("ranking.points", {}, "pts")}`;
    }
    function currentScores() { return currentPlayer()?.scores || {}; }
    function upperTotal(scores = currentScores()) { return upperIds.reduce((a, id) => a + (scores[id] || 0), 0); }
    function upperBonus(scores = currentScores()) { return upperTotal(scores) >= upperBonusThreshold() ? upperBonusValue() : 0; }
    function lowerTotal(scores = currentScores()) { return categories.filter(c => !upperIds.includes(c.id)).reduce((a, c) => a + (scores[c.id] || 0), 0); }
    function grandTotal(scores = currentScores()) { return upperTotal(scores) + upperBonus(scores) + lowerTotal(scores); }
    function grandTotalFor(scores, rollBonus = 0) { return grandTotal(scores) + (Number(rollBonus) || 0); }
    function isPlayerFinished(index) { return Object.keys(state.players[index].scores).length >= categories.length; }
    function allPlayersFinished() { return state.players.every((_, index) => isPlayerFinished(index)); }
    function winnerText() {
      const ranking = [...state.players]
        .map(player => ({ name: player.name, points: grandTotalFor(player.scores, player.rollBonus) }))
        .sort((a, b) => b.points - a.points);
      const top = ranking[0];
      const ties = ranking.filter(p => p.points === top.points);
      if (ties.length > 1) return tt("rollforge.ranking.tie", { points: top.points }, `Tie at ${top.points} points.`);
      return tt("rollforge.ranking.win", { name: top.name, points: top.points }, `${top.name} wins with ${top.points} points.`);
    }
    function ratingText(score) {
      if (score >= 300) return "Royal-tier rolling.";
      if (score >= 250) return "Very strong game.";
      if (score >= 200) return "Solid round.";
      return "The dice were tiny goblins today.";
    }
    function quadraticBezier(a, b, c, t) {
      scratchBezierAB.lerpVectors(a, b, t);
      scratchBezierBC.lerpVectors(b, c, t);
      return scratchBezierAB.lerp(scratchBezierBC, t);
    }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutQuad(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function createHostRoomDirect() {
      const room = normalizeRoomCode(makeRoomCode());
      roomInput.value = room;
      if (lobbyHostRoom) lobbyHostRoom.value = room;
      state.botCount = clamp(Number(onlineHostBots?.value ?? lobbyHostBots?.value) || 0, 0, 5);
      if (onlineHostBots) onlineHostBots.value = String(state.botCount);
      nameInput.value = (onlineHostName?.value || lobbyHostName?.value || nameInput.value || tt("rollforge.defaultHost", {}, "Host")).trim() || tt("rollforge.defaultHost", {}, "Host");
      if (onlineHostName) onlineHostName.value = nameInput.value;
      updateHostInviteLink(room);
      connectOnline("host", { freshRoom: true });
    }

    function reconnectFromStoredSession(roomFromUrl = initialRoomCode, { allowBackup = false } = {}) {
      // Erst der Tab-Stand (Reload). Nur wenn keiner da ist und es ausdrücklich
      // erlaubt ist (Browser war komplett zu), das localStorage-Backup nutzen.
      const meta = loadOnlineSessionMeta() || (allowBackup ? loadOnlineBackup() : null);
      const room = normalizeRoomCode(roomFromUrl || meta?.room || "");
      if (!room || !meta || normalizeRoomCode(meta.room) !== room) return false;
      activeModeId = meta.activeModeId || activeModeId;
      categories = buildCategories();
      state.botCount = meta.botCount || 0;
      state.keepRerolls = !!meta.keepRerolls;
      syncKeepRerollsUI();
      roomInput.value = room;
      nameInput.value = meta.name || nameInput.value || (meta.role === "host" ? tt("rollforge.defaultHost", {}, "Host") : tt("rollforge.defaultGuest", {}, "Guest"));
      if (meta.role === "host") {
        if (onlineHostName) onlineHostName.value = nameInput.value;
        if (onlineHostBots) onlineHostBots.value = String(state.botCount || 0);
        if (lobbyHostRoom) lobbyHostRoom.value = room;
        updateHostInviteLink(room);
      } else {
        if (lobbyJoinName) lobbyJoinName.value = nameInput.value;
        if (lobbyJoinRoom) lobbyJoinRoom.value = room;
      }
      connectOnline(meta.role);
      // Gast beim Reload: Sitz im Warteraum selbst wählen (kein Auto-Rejoin).
      if (meta.role === "client") online.awaitingSeatChoice = true;
      return true;
    }

    rankingCloseBtn?.addEventListener("click", hideEndRanking);
    rankingOverlay?.addEventListener("click", (event) => { if (event.target === rankingOverlay) hideEndRanking(); });
    rankingLobbyBtn?.addEventListener("click", () => { hideEndRanking(); openExitConfirm(); });
    rankingAgainBtn?.addEventListener("click", () => {
      if (online.connected && online.role !== "host") return;
      hideEndRanking();
      newGame();
      broadcastSnapshot();
    });

    rollBtn.addEventListener("click", () => requestAction({ type: "roll" }));
    releaseBtn.addEventListener("click", () => requestAction({ type: "release" }));
    newBtn.addEventListener("click", () => {
      if (online.connected && online.role !== "host") return;
      openNewGameConfirm();
    });
    exitBtn.addEventListener("click", openExitConfirm);
    cancelExitBtn.addEventListener("click", closeExitConfirm);
    confirmExitBtn.addEventListener("click", () => {
      if (typeof pendingConfirmAction === "function") pendingConfirmAction();
    });
    exitConfirmOverlay.addEventListener("click", event => {
      if (event.target === exitConfirmOverlay) closeExitConfirm();
    });
    playersBtn.addEventListener("click", () => {
      if (state.isRolling || (online.connected && online.role !== "host")) return;
      state.playerCount = state.playerCount >= 6 ? 2 : state.playerCount + 1;
      newGame();
      broadcastSnapshot();
    });
    chooseHotseatBtn?.addEventListener("click", () => showLobbySettingsStep("host"));
    chooseHostBtn.addEventListener("click", createHostRoomDirect);
    chooseJoinBtn.addEventListener("click", () => showLobbySettingsStep("join"));
    lobbyBackBtn.addEventListener("click", showLobbyModeStep);
    // Shared back button (assets/game-chrome.js): the lobby's mode-choice step
    // is the game's own top menu, so only from there does "back" leave to the
    // site catalogue. The settings step and an online room walk one level up to
    // that menu in-page (leaving the room first when online); during a match the
    // button reopens the lobby instead of dropping straight out to the site.
    window.__brettBack = {
      atTop: () => !lobbyOverlay.classList.contains("hidden") && !lobbyStepMode.classList.contains("hidden"),
      up: () => {
        if (lobbyOverlay.classList.contains("hidden")) { openExitConfirm(); return; }
        if (online.connected) disconnectOnline();
        showLobbyModeStep();
      }
    };
    modeCreateTab.addEventListener("click", () => setLobbyMenuMode("create"));
    modeJoinTab.addEventListener("click", () => setLobbyMenuMode("join"));
    menuActionBtn.addEventListener("click", () => {
      if (lobbyMenuMode === "join") {
        nameInput.value = menuNameInput.value.trim() || tt("rollforge.defaultGuest", {}, "Guest");
        roomInput.value = normalizeRoomCode(menuRoomInput.value.trim());
        if (!roomInput.value) {
          lobbyStatus.innerHTML = tt("rollforge.enterRoomFirst", {}, "Enter a room code first.");
          return;
        }
        connectOnline("client");
      } else {
        nameInput.value = menuNameInput.value.trim() || tt("rollforge.defaultHost", {}, "Host");
        createHostRoomDirect();
      }
    });
    onlineStartGameBtn?.addEventListener("click", () => {
      syncLobbyHostSettings({ updatePlayers: true, broadcast: true });
      startOnlineGameFromLobby();
    });
    copyOnlineInviteBtn?.addEventListener("click", async () => {
      const text = onlineInviteView?.value || makeInviteUrl(online.room || roomInput.value);
      const ok = await copyText(text);
      lobbyStatus.innerHTML = ok ? tt("rollforge.inviteCopied", {}, "Invite link copied.") : `${tt("rollforge.inviteLink", {}, "Invite link")}: <strong>${escapeHtml(text)}</strong>`;
    });

    variantPicker.addEventListener("click", event => {
      const card = event.target.closest(".variant-card");
      if (!card) return;
      activeModeId = card.dataset.mode || "classic";
      categories = buildCategories();
      updateVariantCards();
      renderAll();
    });
    function updateVariantCards() {
      variantPicker?.querySelectorAll(".variant-card").forEach(card => {
        card.classList.toggle("active", card.dataset.mode === activeModeId);
      });
      onlineVariantPicker?.querySelectorAll(".variant-card").forEach(card => {
        card.classList.toggle("active", card.dataset.mode === activeModeId);
      });
    }

    onlineVariantPicker?.addEventListener("click", event => {
      const card = event.target.closest(".variant-card");
      if (!card || online.role !== "host" || state.phase !== "lobby") return;
      activeModeId = card.dataset.mode || "classic";
      categories = buildCategories();
      syncLobbyHostSettings({ updatePlayers: true, broadcast: true });
      renderAll();
    });

    onlineHostName?.addEventListener("input", () => {
      syncLobbyHostSettings({ updatePlayers: false, broadcast: true });
      renderAll();
    });

    onlineHostBots?.addEventListener("change", () => {
      syncLobbyHostSettings({ updatePlayers: true, broadcast: true });
      renderAll();
    });

    publicRoomCheckHost?.addEventListener("change", () => {
      syncLobbyHostSettings({ updatePlayers: false, broadcast: true });
    });

    keepRerollsCheck?.addEventListener("change", () => {
      state.keepRerolls = keepRerollsCheck.checked;
      if (keepRerollsCheckHost) keepRerollsCheckHost.checked = state.keepRerolls;
      syncLobbyHostSettings({ updatePlayers: false, broadcast: true });
    });

    keepRerollsCheckHost?.addEventListener("change", () => {
      state.keepRerolls = keepRerollsCheckHost.checked;
      if (keepRerollsCheck) keepRerollsCheck.checked = state.keepRerolls;
      syncLobbyHostSettings({ updatePlayers: false, broadcast: true });
    });

    lobbyHotseatBtn?.addEventListener("click", () => {
      showLobbySettingsStep("host");
    });
    lobbyHostBtn.addEventListener("click", () => {
      nameInput.value = lobbyHostName.value.trim() || tt("rollforge.defaultHost", {}, "Host");
      state.botCount = clamp(Number(lobbyHostBots.value) || 0, 0, 5);
      state.playerCount = 1 + state.botCount;
      roomInput.value = normalizeRoomCode(lobbyHostRoom.value.trim() || makeRoomCode());
      lobbyHostRoom.value = roomInput.value;
      updateHostInviteLink(roomInput.value);
      connectOnline("host");
    });
    lobbyJoinBtn.addEventListener("click", () => {
      nameInput.value = lobbyJoinName.value.trim() || tt("rollforge.defaultGuest", {}, "Guest");
      roomInput.value = normalizeRoomCode(lobbyJoinRoom.value.trim());
      if (!roomInput.value) {
        lobbyStatus.innerHTML = tt("rollforge.enterRoomFirst", {}, "Enter a room code first.");
        return;
      }
      connectOnline("client");
    });
    copyHostInviteBtn?.addEventListener("click", async () => {
      const text = updateHostInviteLink(lobbyHostRoom.value);
      const ok = await copyText(text);
      lobbyStatus.innerHTML = ok ? tt("rollforge.inviteCopied", {}, "Invite link copied.") : `${tt("rollforge.inviteLink", {}, "Invite link")}: <strong>${escapeHtml(text)}</strong>`;
    });
    lobbyHostRoom?.addEventListener("input", () => updateHostInviteLink(lobbyHostRoom.value));
    hostBtn?.addEventListener("click", () => connectOnline("host"));
    joinBtn?.addEventListener("click", () => connectOnline("client"));
    leaveBtn?.addEventListener("click", disconnectOnline);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerClick);
    window.addEventListener("resize", resize);

    function initInviteFromUrl() {
      const room = initialRoomCode;
      if (!room) return false;
      if (reconnectFromStoredSession(room)) return true;
      roomInput.value = room;
      menuRoomInput.value = room;
      setLobbyMenuMode("join");
      if (menuJoinInviteHint) menuJoinInviteHint.style.display = "block";
      // Invite-Link → Beitritts-Formular mit editierbarem, vorausgefülltem
      // Namensfeld zeigen, statt automatisch beizutreten (Name vor dem
      // Beitreten wählbar). Der Gast tippt seinen Namen und klickt „Beitreten".
      if (menuNameInput) setTimeout(() => { menuNameInput.focus(); menuNameInput.select(); }, 0);
      return true;
    }

    if (!initInviteFromUrl()) {
      // Kein Invite-Link in der URL: prüfen, ob der Browser komplett geschlossen
      // war und es ein Online-Backup gibt, um dieselbe Runde wieder aufzunehmen.
      if (!reconnectFromStoredSession(null, { allowBackup: true })) {
        if (!resumeHotseatState()) newGame();
      }
    }
    resize();
    animate();
