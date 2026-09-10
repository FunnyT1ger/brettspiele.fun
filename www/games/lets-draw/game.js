(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const I18N = window.BFI18N || null;
  const t = (key, vars = {}, fallback = '') => {
    try { return I18N?.t?.(key, vars, fallback) ?? fallback ?? key; }
    catch (_) { return fallback || key; }
  };

  const GAME_ID = 'lets-draw';
  const playDrawSound = () => window.BrettSounds?.play?.('draw');
  const ROOM_RE = /[^A-Z0-9_-]/g;
  const TEAM_MODE = 'teams';
  const SOLO_MODE = 'solo';
  const DEFAULT_TARGET = 2000;
  const DEFAULT_SECONDS = 60;
  const BOARD_WIDTH = 1600;
  const BOARD_HEIGHT = 900;
  const BRUSH_LOGICAL_SCALE = 2.25;

  const WORDS = {
    alltag: { easy: ['Apfel', 'Sonne', 'Haus', 'Auto', 'Katze', 'Hund', 'Baum', 'Blume', 'Fahrrad', 'Pizza', 'Regenschirm', 'Schlüssel', 'Tasse', 'Schneemann', 'Buch', 'Ballon', 'Käse', 'Krone', 'Brille', 'Lampe', 'Wolke', 'Fisch', 'Stern', 'Schuh', 'Kerze', 'Banane', 'Roboter', 'Gitarre', 'Uhr', 'Rakete', 'Sonnenblume', 'Regenbogen', 'Traktor', 'Zug', 'Flugzeug', 'Eiscreme', 'Kuchen', 'Stuhl', 'Tisch', 'Fenster', 'Tür', 'Herz', 'Ball', 'Geschenk', 'Mütze', 'Mond', 'Berg', 'Insel', 'Boot', 'Schiff', 'Brücke', 'Turm', 'Schloss', 'Zelt', 'Leiter', 'Hammer', 'Säge', 'Eimer', 'Besen', 'Seife', 'Handtuch', 'Zahnbürste', 'Kamm', 'Spiegel', 'Koffer', 'Rucksack', 'Hut', 'Krawatte', 'Ring', 'Kette', 'Ohrring', 'Armband', 'Teddybär', 'Puppe', 'Kreisel', 'Würfel', 'Puzzle', 'Trommel', 'Flöte', 'Trompete', 'Glocke', 'Kompass', 'Landkarte', 'Globus', 'Teleskop', 'Glühbirne', 'Fernseher', 'Telefon', 'Tastatur', 'Computermaus', 'Kamera', 'Taschenlampe', 'Streichholz', 'Bleistift', 'Schere', 'Briefumschlag', 'Zeitung', 'Kalender', 'Wecker', 'Sanduhr', 'Thermometer'], medium: ['Zeitmaschine', 'Geheimgang', 'Wackelpudding', 'Feuerwehr', 'Zirkuszelt', 'Kletterwand', 'Schatzkarte', 'Drachenboot', 'Mondbasis', 'Bibliothek', 'Tarnkappe', 'Kaugummiautomat', 'Wasserfall', 'Stromausfall', 'Sandburg', 'Kochduell', 'Weltraumtaxi', 'Unterwasserstadt', 'Magnet', 'Kopfhörer', 'Rolltreppe', 'Schlafwandler', 'Fernbedienung', 'Labyrinth', 'Achterbahn', 'Geisterhaus', 'Vulkanausbruch', 'Dschungelexpedition', 'Weltraumstation', 'Unterwasserhöhle', 'Zeitkapsel', 'Roboterarm', 'Spielzeugfabrik', 'Wolkenkratzer', 'Schneesturm', 'Wüstenkarawane', 'Feuerwerk', 'Zauberlehrling', 'Geheimlabor', 'Geheimagent', 'Tauchglocke', 'Weltraumanzug', 'Sonnenfinsternis', 'Mondlandung', 'Roboterhund', 'Fliegender Teppich', 'Zaubertrick', 'Geisterbahn', 'Trampolinpark', 'Kletterpark', 'Baumhaus', 'Höhlenmalerei', 'Windmühle', 'Wasserrutsche', 'Karussell', 'Riesenrad', 'Jahrmarkt', 'Verwandlung', 'Doppelgänger', 'Geheimversteck', 'Schmugglerpfad', 'Piratenschatz', 'Inselhopping', 'Vulkanexpedition', 'Nordlichter', 'Polarforscher', 'Eisscholle', 'Dschungelcamp', 'Wüstenoase', 'Sanddüne', 'Höhlensystem', 'Geisterschiff', 'Bermudadreieck', 'Zeitschleife', 'Paralleluniversum', 'Traumfänger', 'Nachtwanderung', 'Sternwarte', 'Raumkapsel', 'Marslandung', 'Alienkontakt', 'Ufo-Sichtung', 'Fluchtplan', 'Escape Room', 'Detektivbüro', 'Verhörraum', 'Fingerabdruck', 'Tatortuntersuchung', 'Zauberduell', 'Drachenzähmung'], hard: ['Déjà-vu', 'Bürokratie', 'Missverständnis', 'Schwerkraft', 'Lampenfieber', 'Gedankenblitz', 'Gruppenzwang', 'Warteschlange', 'Klimawandel', 'Datenschutz', 'Heimweh', 'Optimismus', 'Verhandlung', 'Algorithmus', 'Blackout', 'Schuldgefühl', 'Aberglaube', 'Teamgeist', 'Eifersucht', 'Improvisation', 'Doppelleben', 'Kettenreaktion', 'Funkstille', 'Panikmodus', 'Perspektivwechsel', 'Nostalgie', 'Verantwortung', 'Zivilcourage', 'Zeitdruck', 'Selbstzweifel', 'Bauchgefühl', 'Wortwitz', 'Fernweh', 'Kompromiss', 'Vorurteil', 'Herzklopfen', 'Kettenraucher', 'Torschlusspanik', 'Realitätscheck', 'Zivilisation', 'Kreativität', 'Intuition', 'Existenzkrise', 'Wertschätzung', 'Selbstvertrauen', 'Verlustangst', 'Machtgefälle', 'Systemfehler', 'Kollektivgedächtnis', 'Wahrnehmung', 'Wirklichkeitsverlust', 'Sinneswandel', 'Charakterstärke', 'Verdrängung', 'Ambivalenz', 'Paradoxon', 'Determinismus', 'Zufallsprinzip', 'Kausalität', 'Symbolik', 'Ironie', 'Sarkasmus', 'Empathie', 'Apathie', 'Euphorie', 'Melancholie', 'Zeitgeist', 'Generationenkonflikt', 'Konsumrausch', 'Reizüberflutung', 'Multitasking', 'Prokrastination', 'Perfektionismus', 'Selbstsabotage', 'Ohnmachtsgefühl', 'Kontrollverlust', 'Vertrauensbruch', 'Verantwortungsgefühl', 'Existenzangst', 'Sinnkrise', 'Wertewandel', 'Machtmissbrauch', 'Systemkritik', 'Meinungsfreiheit'] },
    fantasy: { easy: ['Zauberstab', 'Drachenei', 'Katapult', 'Wachturm', 'Burgmauer', 'Zaubertrank', 'Kristallkugel', 'Ritterduell', 'Runenstein', 'Zauberschule', 'Trollhöhle', 'Feenstaub', 'Nachtwache', 'Goldmine', 'Kronjuwel', 'Hexenrat', 'Elfenkönigin', 'Zwergenkönig', 'Vampirschloss', 'Werwolfrudel', 'Dunkler Wald', 'Seeschlange', 'Riesenspinne', 'Einhornwald', 'Zauberportal'], medium: ['Belagerungsmaschine', 'Königlicher Spion', 'Verfluchter Hafen', 'Magischer Nebel', 'Eiserner Thron', 'Goblinmarkt', 'Bannerträger', 'Frostkönig', 'Schattengilde', 'Orakel', 'Geheime Allianz', 'Hafenmeister', 'Verräter am Hof', 'Inselbonus', 'Verlorene Festung', 'Zwergenschmiede', 'Elfenbogen', 'Drachenreiter', 'Kristallhöhle', 'Schwarzmagier', 'Verzauberter Wald', 'Trollbrücke', 'Feuerdämon', 'Sturmruf', 'Drachenzähmer', 'Nekromant', 'Dämonenpakt', 'Orkhorde', 'Hexenzirkel', 'Alchemistenlabor', 'Drachenklaue', 'Greifenreiter', 'Runenschwert', 'Magiestein', 'Erdgeist', 'Feuersalamander', 'Sandwurm', 'Wolkenschloss', 'Himmelsinsel'], hard: ['Drachenhort', 'Prophezeiung', 'Geheimer Pakt', 'Untotenarmee', 'Amulett der Macht', 'Zaubersiegel', 'Bannspruch', 'Fluchgegenstand', 'Schicksalsklinge', 'Heldenprüfung', 'Questgeber', 'Dungeonwächter', 'Geheimzeichen', 'Schattenkrieger', 'Lichtbringer', 'Sturmgott', 'Meeresgöttin', 'Eisgolem', 'Unterwelt', 'Portalwächter', 'Zeitmagier', 'Geistertor', 'Verfluchtes Schwert', 'Königsdrache', 'Thronfolge'] },
    animals: { easy: ['Elefant', 'Giraffe', 'Löwe', 'Tiger', 'Zebra', 'Affe', 'Hase', 'Kaninchen', 'Ente', 'Gans', 'Schwan', 'Frosch', 'Fuchs', 'Wolf', 'Eisbär', 'Panda', 'Hirsch', 'Reh', 'Eichhörnchen', 'Schildkröte', 'Schmetterling', 'Biene', 'Spinne', 'Wal', 'Delfin', 'Hai', 'Pinguin', 'Krokodil'], medium: ['Nashorn', 'Flamingo', 'Chamäleon', 'Igel', 'Eule', 'Kolibri', 'Koala', 'Känguru', 'Waschbär', 'Biber', 'Otter', 'Papagei', 'Gorilla', 'Schimpanse', 'Braunbär', 'Wildschwein', 'Dachs', 'Marder', 'Hamster', 'Meerschweinchen', 'Fledermaus', 'Storch', 'Adler', 'Falke', 'Pfau', 'Truthahn', 'Taube', 'Specht', 'Rabe', 'Strauß', 'Alligator'], hard: ['Faultier', 'Krake', 'Leguan', 'Gecko', 'Skorpion', 'Tausendfüßler', 'Ameise', 'Marienkäfer', 'Libelle', 'Grille', 'Heuschrecke', 'Qualle', 'Seepferdchen', 'Tintenfisch', 'Hummer', 'Krabbe', 'Muschel', 'Seestern', 'Robbe', 'Walross', 'Seelöwe', 'Orca', 'Narwal', 'Stachelrochen', 'Piranha'] },
    jobs: { easy: ['Feuerwehrmann', 'Zahnarzt', 'Astronaut', 'Pilot', 'Koch', 'Friseur', 'Detektiv', 'Bäcker', 'Polizist', 'Arzt', 'Pirat', 'Ritter', 'Cowboy', 'Bauer', 'Fischer', 'Maler', 'Sänger', 'Tänzer', 'Fotograf', 'Schauspieler', 'Kapitän', 'Taucher', 'Jäger', 'Krankenschwester', 'Kellner', 'Landwirt', 'Gärtner', 'Elektriker', 'Klempner', 'Bergsteiger'], medium: ['Lehrer', 'Anwalt', 'Schneider', 'Zauberer', 'Journalist', 'Dirigent', 'Ingenieur', 'Architekt', 'Wissenschaftler', 'Chemiker', 'Biologe', 'Astronom', 'Bibliothekar', 'Barkeeper', 'Sommelier', 'Konditor', 'Metzger', 'Winzer', 'Brauer', 'Töpfer', 'Schreiner', 'Maurer', 'Dachdecker', 'Installateur', 'Mechaniker', 'Stewardess', 'Busfahrer', 'Taxifahrer', 'Lokführer', 'Matrose', 'Förster', 'Imker', 'Tierarzt', 'Sanitäter', 'Chirurg'], hard: ['Programmierer', 'Historiker', 'Übersetzer', 'Dolmetscher', 'Buchhalter', 'Steuerberater', 'Bankangestellter', 'Immobilienmakler', 'Versicherungsagent', 'Unternehmensberater', 'Manager', 'Sekretärin', 'Empfangsdame', 'Fluglotse', 'Bergführer', 'Apotheker', 'Physiotherapeut', 'Psychologe', 'Sozialarbeiter', 'Erzieherin', 'Trainer', 'Schiedsrichter', 'Model', 'Komponist', 'Choreograf', 'Bildhauer', 'Grafikdesigner', 'Modedesigner', 'Juwelier', 'Uhrmacher'] },
    filmtv: { easy: ['Superheld', 'Zombie', 'Piratenschiff', 'Explosion', 'Popcorntüte', 'Kinosaal', 'Filmklappe', 'Talkshow', 'Kochshow', 'Quizshow', 'Horrorfilm', 'Trickfilm', 'Zeichentrickfilm', 'Verfolgungsjagd', 'Podcast', 'Livestream', 'Influencer', 'Wetterbericht', 'Stuntman', 'Actionheld'], medium: ['Zeitreise', 'Roboterinvasion', 'Detektivfall', 'Liebesfilm', 'Comicverfilmung', 'Nachrichtensprecher', 'Werbepause', 'Filmpremiere', 'Spezialeffekt', 'Regiestuhl', 'Popcornkino', 'Serienmarathon', 'Cliffhanger', 'Filmmusik', 'Actionszene', 'Filmset', 'Greenscreen', 'Synchronsprecher', 'Kameramann', 'Roter Teppich', 'Filmtrailer', 'Musikvideo'], hard: ['Weltraumschlacht', 'Drehbuchautor', 'Regisseur', 'Filmkritiker', 'Oscarverleihung', 'Filmfestival', 'Serienfinale', 'Zeichentrickserie', 'Superheldenfilm', 'Weltraumoper', 'Endzeitfilm', 'Liebeskomödie', 'Krimiserie', 'Dokumentarfilm', 'Talkmaster', 'Nachrichtenstudio', 'Filmmonster', 'Alieninvasion'] },
    sport: { easy: ['Fußball', 'Basketball', 'Tennis', 'Skifahren', 'Schwimmen', 'Boxen', 'Golf', 'Reiten', 'Laufen', 'Joggen', 'Wandern', 'Radrennen', 'Tischtennis', 'Handball', 'Volleyball', 'Segeln', 'Skateboard', 'Snowboard', 'Klettern', 'Baseball', 'Surfen'], medium: ['Turnen', 'Eishockey', 'Marathon', 'Weitsprung', 'Gewichtheben', 'Fechten', 'Bogenschießen', 'Kegeln', 'Bergsteigen', 'Kanufahren', 'Kajakfahren', 'Rudern', 'Wasserball', 'Squash', 'Badminton', 'Cricket', 'Rugby', 'Bowling', 'Darts', 'Billard', 'Ringen', 'Judo'], hard: ['Zehnkampf', 'Synchronschwimmen', 'Wasserspringen', 'Triathlon', 'Stabhochsprung', 'Kugelstoßen', 'Diskuswurf', 'Speerwurf', 'Hürdenlauf', 'Curling', 'Rodeln', 'Bobfahren', 'Biathlon', 'American Football', 'Karate', 'Taekwondo', 'Kickboxen'] }
  };

  const DEFAULT_TEAMS = [
    { name: 'Team Gold', score: 0, color: '#f2bf57' },
    { name: 'Team Blau', score: 0, color: '#65a8ff' },
    { name: 'Team Rot', score: 0, color: '#ff5b65' }
  ];
  const PALETTE = ['#171717', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#90a4ae'];

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const normalizeRoom = (value) => String(value || '').toUpperCase().replace(ROOM_RE, '').slice(0, 24);
  const normalizeName = (value, fallback = 'Player') => String(value || '').trim().slice(0, 32) || fallback;
  const initialRoomCode = normalizeRoom(new URLSearchParams(location.search).get('room') || '');
  const clientId = getPersistentClientId();

  const state = {
    teams: clone(DEFAULT_TEAMS),
    players: [],
    playMode: TEAM_MODE,
    phase: 'menu', // menu | lobby | playing | ended
    publicRoom: false,
    round: 1,
    targetScore: DEFAULT_TARGET,
    secondsTotal: DEFAULT_SECONDS,
    secondsLeft: DEFAULT_SECONDS,
    running: false,
    timerId: null,
    timerStartedAt: 0,
    timerEndAt: 0,
    currentWord: noWord(),
    currentCategory: wordLabel(),
    wordChoices: [],
    wordVisible: false,
    drawerId: null,
    turnIndex: 0,
    turnOrder: [],
    teamDrawerCursor: {},
    guesses: [],
    canvasVersion: 0,
    tool: 'pen',
    color: '#171717',
    brushSize: 9,
    drawing: false,
    lastPoint: null,
    history: [],
    customWords: []
  };

  const sync = {
    socket: null,
    connected: false,
    role: 'none', // none | host | guest
    room: '',
    playerName: '',
    playerTeamIndex: 0,
    joined: false,
    reconnecting: false
  };

  const canvas = $('drawCanvas');
  const ctx = canvas?.getContext('2d', { willReadFrequently: true });
  const remoteLines = new Map();
  let joinRetryTimer = null;

  function noWord() { return t('letsdraw.noWord', {}, 'Noch keiner'); }
  function wordLabel() { return t('letsdraw.word', {}, 'Begriff'); }
  function choiceOpen() { return t('letsdraw.choiceOpen', {}, 'Auswahl offen'); }

  function getPersistentClientId() {
    const key = `brettspiele.${GAME_ID}.clientId`;
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) {
      return `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function makeRoomCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
  function makeInviteUrl(room) {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('room', normalizeRoom(room));
    return url.toString();
  }
  function updateUrlRoom(room) {
    room = normalizeRoom(room);
    if (!room) return;
    const url = new URL(location.href);
    url.searchParams.set('room', room);
    history.replaceState({}, '', url.toString());
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e) { return false; }
    }
  }

  function wsUrl() {
    if (location.protocol === 'file:') return 'ws://localhost:8787/ws';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  function send(payload) {
    if (!sync.socket || sync.socket.readyState !== WebSocket.OPEN || !sync.room) return false;
    // Only the host's messages may set the public-room listing metadata —
    // a guest's own messages must never clobber it back to false.
    const hostMeta = sync.role === 'host' ? { public: !!state.publicRoom, hostName: sync.playerName || '' } : {};
    sync.socket.send(JSON.stringify({ game: GAME_ID, room: sync.room, clientId, ...hostMeta, ...payload }));
    return true;
  }

  function connect(role, room) {
    room = normalizeRoom(room);
    if (!room) return;
    if (sync.socket) {
      try { sync.socket.close(); } catch (_) {}
    }
    sync.role = role;
    sync.room = room;
    sync.connected = false;
    updateUrlRoom(room);
    fillRoomFields(room);
    setSyncStatus(t('letsdraw.connecting', {}, 'Verbinde…'));

    const socket = new WebSocket(wsUrl());
    sync.socket = socket;
    socket.addEventListener('open', () => {
      sync.connected = true;
      send({ type: role === 'host' ? 'create' : 'join' });
      if (role === 'host') {
        if (state.players.length) sendState('state');
        else send({ type: 'requestState' });
      } else {
        startJoinRetry();
      }
      updateUI();
      startPresence();
    });
    socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if ((msg.game || msg.gameId || GAME_ID) !== GAME_ID) return;
      if (normalizeRoom(msg.room) !== normalizeRoom(sync.room)) return;
      handleMessage(msg);
    });
    socket.addEventListener('close', () => {
      sync.connected = false;
      stopJoinRetry();
      stopPresence();
      setSyncStatus(t('letsdraw.offline', {}, 'Offline'));
      updateUI();
    });
    socket.addEventListener('error', () => setSyncStatus(t('letsdraw.syncError', {}, 'Sync-Fehler · WebSocket nicht erreichbar')));
  }

  // ── Präsenz-Heartbeat & Host-Migration ────────────────────────────────
  // Der Relay meldet einen Verbindungsabbruch nicht aktiv an die anderen
  // Clients. Deshalb sendet jeder verbundene Client periodisch ein kleines
  // {type:'presence'}-Lebenszeichen. Bleibt das des Hosts aus (Timeout) oder
  // schickt er beim Schließen des Tabs ein {type:'bye'}, wählt sich unter den
  // noch verbundenen Spielern deterministisch der mit dem kleinsten Index in
  // state.players zum neuen Host — alle Clients kommen dabei unabhängig
  // voneinander auf dasselbe Ergebnis, ein Rennen (z. B. weil der alte Host
  // zwischenzeitlich zurückkehrt) löst der Doppel-Host-Schutz unten auf.
  const HEARTBEAT_MS = 2500;
  const PEER_TIMEOUT_MS = 8000;
  const presence = { peers: new Map(), heartbeatTimer: null, checkTimer: null };
  function startPresence() {
    stopPresence();
    presence.heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
    presence.checkTimer = setInterval(checkPresence, 2000);
    sendHeartbeat();
  }
  function stopPresence() {
    clearInterval(presence.heartbeatTimer);
    clearInterval(presence.checkTimer);
    presence.heartbeatTimer = null;
    presence.checkTimer = null;
    presence.peers.clear();
  }
  function sendHeartbeat() {
    if (!sync.connected || sync.role === 'none') return;
    send({ type: 'presence', pRole: sync.role });
  }
  function notePeer(msg) {
    const id = msg.clientId;
    if (!id || id === clientId) return;
    let peer = presence.peers.get(id);
    if (!peer) { peer = { role: 'guest', lastSeen: 0 }; presence.peers.set(id, peer); }
    peer.lastSeen = Date.now();
    if (msg.type === 'presence' && msg.pRole) peer.role = msg.pRole;
  }
  function checkPresence() {
    const now = Date.now();
    for (const [id, peer] of [...presence.peers]) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
        presence.peers.delete(id);
        if (peer.role === 'host') migrateHost();
      }
    }
  }
  // Nur verbundene, im geteilten Spielerstand bekannte Clients zählen als
  // Kandidat:innen — sortiert nach ihrem Index in state.players.
  function connectedPlayerCandidates() {
    const connectedIds = new Set([clientId, ...presence.peers.keys()]);
    return state.players
      .map((p, index) => ({ id: p.id, index }))
      .filter((c) => connectedIds.has(c.id))
      .sort((a, b) => a.index - b.index);
  }
  function migrateHost() {
    if (sync.role !== 'guest') return;
    const candidates = connectedPlayerCandidates();
    if (!candidates.length || candidates[0].id !== clientId) return; // jemand anderes übernimmt
    sync.role = 'host';
    state.players.forEach((p) => { p.host = p.id === clientId; });
    saveIntent();
    showToast(t('letsdraw.msg.becameHost', {}, '👑 Du bist jetzt der Host'));
    send({ type: 'create' });
    sendHeartbeat();
    sendState('state');
    updateUI();
  }
  function demoteToGuest() {
    if (sync.role !== 'host') return;
    sync.role = 'guest';
    saveIntent();
    showToast(t('letsdraw.msg.hostElsewhere', {}, 'Ein anderer Spieler ist jetzt Host'));
    updateUI();
  }

  function handleMessage(msg) {
    notePeer(msg);
    if (msg.type === 'presence') {
      // Doppel-Host auflösen: laufen (z. B. weil der alte Host zurückkehrt)
      // zwei Hosts gleichzeitig, bleibt der mit dem kleineren Spieler-Index
      // Host; der andere wird wieder Gast.
      if (sync.role === 'host' && msg.pRole === 'host') {
        const otherIndex = state.players.findIndex((p) => p.id === msg.clientId);
        const myIndex = state.players.findIndex((p) => p.id === clientId);
        if (otherIndex >= 0 && myIndex >= 0 && otherIndex < myIndex) demoteToGuest();
      }
      return;
    }
    if (msg.type === 'bye') {
      const peer = presence.peers.get(msg.clientId);
      presence.peers.delete(msg.clientId);
      if (peer && peer.role === 'host') migrateHost();
      return;
    }
    if (msg.clientId === clientId && msg.type !== 'state' && msg.type !== 'snapshot') return;

    if (msg.type === 'sessionState' && msg.snapshot) {
      const snapshotHasMe = Array.isArray(msg.snapshot.players) && msg.snapshot.players.some((p) => p.id === clientId);
      applySnapshot(msg.snapshot, { keepLobby: sync.role === 'guest' && !sync.joined && !snapshotHasMe });
      navigateAfterSnapshot();
      return;
    }

    if (sync.role === 'host') {
      if (msg.type === 'joinPlayer') {
        upsertPlayer(msg.player || {});
        state.phase = state.phase === 'menu' ? 'lobby' : state.phase;
        sendState('state');
        return;
      }
      if (msg.type === 'guess') {
        evaluateGuess(msg.text || '', msg.playerId || msg.clientId);
        return;
      }
      if (msg.type === 'requestState') {
        sendState('state');
        return;
      }
    }

    if (msg.type === 'state' || msg.type === 'snapshot') {
      if (msg.snapshot) {
        applySnapshot(msg.snapshot);
        navigateAfterSnapshot();
      }
      return;
    }
    if (msg.type === 'startGame' && msg.snapshot) {
      applySnapshot(msg.snapshot);
      navigateAfterSnapshot();
      return;
    }
    if (msg.type === 'drawStart') return remoteDrawStart(msg);
    if (msg.type === 'drawMove') return remoteDrawMove(msg);
    if (msg.type === 'drawEnd') return remoteDrawEnd(msg);
    if (msg.type === 'clearCanvas') {
      if (msg.canvasVersion !== undefined) state.canvasVersion = Number(msg.canvasVersion) || state.canvasVersion;
      return clearCanvas(false, true);
    }
    if (msg.type === 'canvasImage') return loadCanvasImage(msg.dataUrl);
    if (msg.type === 'timerStart') {
      if (msg.snapshot) {
        applySnapshot(msg.snapshot);
        navigateAfterSnapshot();
      }
      if (msg.endAt) startTimerFromEndAt(msg.endAt, false);
    }
  }

  function sendState(type = 'state') { send({ type, snapshot: makeSnapshot() }); }
  // 'persist' is the only snapshot type the relay saves without rebroadcasting to
  // the room, so it's the right place to ship the (potentially large) canvas
  // pixels: a private save for *my* reload, never pushed to other peers, who stay
  // in sync via the lightweight live drawStart/drawMove/drawEnd stroke events.
  function persistState() { send({ type: 'persist', snapshot: makeSnapshot(true) }); }
  let persistCanvasTimer = null;
  function schedulePersistCanvas() {
    clearTimeout(persistCanvasTimer);
    persistCanvasTimer = setTimeout(persistState, 1200);
  }

  function makeSnapshot(includeCanvas = false) {
    return {
      phase: state.phase,
      teams: clone(state.teams),
      players: clone(state.players),
      playMode: state.playMode,
      round: state.round,
      targetScore: state.targetScore,
      secondsTotal: state.secondsTotal,
      secondsLeft: state.secondsLeft,
      running: state.running,
      timerEndAt: state.running ? state.timerEndAt : 0,
      currentWord: state.currentWord,
      currentCategory: state.currentCategory,
      wordChoices: clone(state.wordChoices),
      wordVisible: state.wordVisible,
      drawerId: state.drawerId,
      turnIndex: state.turnIndex,
      turnOrder: clone(state.turnOrder || []),
      teamDrawerCursor: clone(state.teamDrawerCursor || {}),
      guesses: clone(state.guesses || []),
      canvasVersion: Number(state.canvasVersion) || 0,
      customWords: clone(state.customWords),
      difficulty: $('difficulty')?.value || 'mixed',
      category: $('category')?.value || 'mixed',
      ...(includeCanvas ? { canvasDataUrl: (() => { try { return canvas.toDataURL('image/png'); } catch (_) { return undefined; } })() } : {})
    };
  }

  function applySnapshot(snap, opts = {}) {
    if (!snap || typeof snap !== 'object') return;
    const wasMenu = state.phase === 'menu';
    const oldCanvasVersion = Number(state.canvasVersion) || 0;
    const nextCanvasVersion = snap.canvasVersion === undefined ? oldCanvasVersion : Number(snap.canvasVersion) || 0;
    Object.assign(state, {
      phase: opts.keepLobby ? (snap.phase === 'playing' ? 'lobby' : (snap.phase || 'lobby')) : (snap.phase || state.phase),
      teams: Array.isArray(snap.teams) ? snap.teams : state.teams,
      players: Array.isArray(snap.players) ? snap.players : state.players,
      playMode: snap.playMode || state.playMode,
      round: Number(snap.round) || state.round,
      targetScore: Number(snap.targetScore) || state.targetScore,
      secondsTotal: Number(snap.secondsTotal) || state.secondsTotal,
      secondsLeft: Number(snap.secondsLeft) || state.secondsLeft,
      currentWord: snap.currentWord || state.currentWord,
      currentCategory: snap.currentCategory || state.currentCategory,
      wordChoices: Array.isArray(snap.wordChoices) ? snap.wordChoices : state.wordChoices,
      wordVisible: !!snap.wordVisible,
      drawerId: snap.drawerId || state.drawerId,
      turnIndex: Number(snap.turnIndex) || 0,
      turnOrder: Array.isArray(snap.turnOrder) ? snap.turnOrder : state.turnOrder,
      teamDrawerCursor: snap.teamDrawerCursor && typeof snap.teamDrawerCursor === 'object' ? snap.teamDrawerCursor : state.teamDrawerCursor,
      guesses: Array.isArray(snap.guesses) ? snap.guesses : state.guesses,
      canvasVersion: nextCanvasVersion,
      customWords: Array.isArray(snap.customWords) ? snap.customWords : state.customWords
    });
    if (nextCanvasVersion !== oldCanvasVersion) clearCanvas(false, true);
    if (snap.canvasDataUrl) loadCanvasImage(snap.canvasDataUrl);
    if (snap.difficulty && $('difficulty')) $('difficulty').value = snap.difficulty;
    if ($('lobbyDifficulty') && snap.difficulty) $('lobbyDifficulty').value = snap.difficulty;
    if (snap.category && $('category')) $('category').value = snap.category;
    if ($('lobbyCategory') && snap.category) $('lobbyCategory').value = snap.category;
    if (snap.running && snap.timerEndAt) startTimerFromEndAt(snap.timerEndAt, false);
    else stopTimer(false);
    if (wasMenu && sync.role === 'guest') showRoomView();
    updateUI();
    scheduleDrawerPrompt();
  }

  function navigateAfterSnapshot() {
    if (state.phase === 'playing' || state.phase === 'ended') {
      if (myPlayer() || sync.role === 'host') hideLobby();
      else showRoomView();
    } else if (sync.role === 'host' || sync.role === 'guest') {
      showRoomView();
    }
    scheduleDrawerPrompt();
  }

  function scheduleDrawerPrompt() {
    if (state.phase !== 'playing' || !isDrawer()) return;
    if (state.running || !isChoiceOpen()) return;
    clearTimeout(scheduleDrawerPrompt.timer);
    scheduleDrawerPrompt.timer = setTimeout(() => {
      if (state.phase === 'playing' && isDrawer() && !state.running && isChoiceOpen()) openRoundModal();
    }, 120);
  }

  function saveIntent() {
    try {
      localStorage.setItem(`brettspiele.${GAME_ID}.intent`, JSON.stringify({
        room: sync.room,
        role: sync.role,
        playerName: sync.playerName,
        playerTeamIndex: sync.playerTeamIndex,
        joined: sync.joined,
        updatedAt: Date.now()
      }));
    } catch (_) {}
  }
  function loadIntent() {
    try { return JSON.parse(localStorage.getItem(`brettspiele.${GAME_ID}.intent`) || 'null'); }
    catch (_) { return null; }
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1700);
  }
  function setSyncStatus(text) { if ($('syncStatus')) $('syncStatus').textContent = text; }

  function fillRoomFields(room) {
    room = normalizeRoom(room);
    const link = room ? makeInviteUrl(room) : '';
    ['syncRoomInput', 'joinRoomCode'].forEach((id) => { const el = $(id); if (el) el.value = room; });
    ['syncInviteLink', 'hostInviteLink', 'lobbyInviteLinkView'].forEach((id) => { const el = $(id); if (el) el.value = link; });
    if ($('lobbyRoomCodeLabel')) $('lobbyRoomCodeLabel').textContent = room || '—';
  }

  // Angemeldeter Nutzer: dessen Anzeige-/Benutzername soll überall als Spielername
  // dienen. Das Auth-Framework legt den Zustand unter window.BrettAuth ab.
  function accountName() {
    try {
      const st = window.BrettAuth?.getState?.();
      if (st && st.authenticated && st.user) {
        return String(st.user.displayName || st.user.username || '').trim();
      }
    } catch (_) {}
    return '';
  }
  // Belegt die Namensfelder mit dem Account-Namen vor. Der Account-Name überschreibt
  // leere Felder, den 'Host'-Platzhalter und den zuvor selbst gesetzten Account-Namen
  // (z.B. wenn erst der Benutzername und dann der Anzeigename nachgeladen wird) – aber
  // niemals einen Namen, den der Nutzer bewusst selbst eingetippt hat.
  let lastAppliedAccountName = '';
  function applyAccountName() {
    const name = accountName();
    if (!name) return;
    if (!sync.playerName || sync.playerName === lastAppliedAccountName) sync.playerName = name;
    ['hostPlayerName', 'joinPlayerName', 'lobbyPlayerName'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const cur = el.value.trim();
      if (!cur || cur === 'Host' || cur === lastAppliedAccountName) el.value = name;
    });
    lastAppliedAccountName = name;
  }

  let lobbyMenuMode = 'create';
  function setLobbyMenuMode(mode) {
    lobbyMenuMode = mode === 'join' ? 'join' : 'create';
    $('modeCreateTab')?.classList.toggle('active', lobbyMenuMode === 'create');
    $('modeCreateTab')?.setAttribute('aria-selected', String(lobbyMenuMode === 'create'));
    $('modeJoinTab')?.classList.toggle('active', lobbyMenuMode === 'join');
    $('modeJoinTab')?.setAttribute('aria-selected', String(lobbyMenuMode === 'join'));
    $('hostFormFields')?.classList.toggle('hidden', lobbyMenuMode !== 'create');
    $('joinFormFields')?.classList.toggle('hidden', lobbyMenuMode !== 'join');
    if ($('menuActionBtn')) {
      $('menuActionBtn').textContent = lobbyMenuMode === 'join'
        ? t('letsdraw.join', {}, 'Beitreten')
        : t('letsdraw.createLobby', {}, 'Lobby erstellen');
    }
    if (lobbyMenuMode === 'join') {
      // Namen aus einer früheren Sitzung vorbelegen (muss aber gesetzt sein).
      if ($('joinPlayerName') && !$('joinPlayerName').value) $('joinPlayerName').value = accountName() || sync.playerName || '';
      startPublicRoomsPolling();
    } else stopPublicRoomsPolling();
  }
  let publicRoomsPollTimer = null;
  async function fetchPublicRooms() {
    try {
      const res = await fetch(`/api/rooms?game=${GAME_ID}`, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderPublicRooms(Array.isArray(data.items) ? data.items : []);
    } catch (_) {
      // Browsing public rooms is a nice-to-have on top of joining by code.
    }
  }
  function renderPublicRooms(items) {
    const box = $('publicRoomsItems');
    if (!box) return;
    if (!items.length) {
      box.innerHTML = `<div class="public-rooms-empty muted">${t('letsdraw.publicRooms.empty', {}, 'Aktuell keine öffentlichen Räume.')}</div>`;
      return;
    }
    box.innerHTML = items.map((item) => `
      <button type="button" class="public-room-row" data-room="${escapeHtml(item.room)}">
        <strong>${escapeHtml(item.room)}</strong>
        <span>${escapeHtml(item.hostName || t('rollforge.defaultHost', {}, 'Host'))}</span>
        <span class="public-room-count">${item.playerCount}</span>
      </button>
    `).join('');
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
  function showOnlyLobby(part) {
    const ids = ['lobbyMenuForm', 'lobbyRoomView'];
    ids.forEach((id) => $(id)?.classList.toggle('hidden', id !== part));
    $('multiplayerLobby')?.classList.add('open');
    setSiteReturnVisible(true);
    if (part !== 'lobbyMenuForm' || lobbyMenuMode !== 'join') stopPublicRoomsPolling();
  }
  function showLobbyChoice() {
    sync.role = sync.role === 'host' || sync.role === 'guest' ? sync.role : 'none';
    showHostForm();
  }
  function showHostForm() {
    const room = makeRoomCode();
    fillRoomFields(room);
    if ($('hostPlayerName') && !$('hostPlayerName').value) $('hostPlayerName').value = sync.playerName || 'Host';
    applyAccountName();
    setLobbyMenuMode('create');
    showOnlyLobby('lobbyMenuForm');
  }
  function showJoinForm(room = '') {
    fillRoomFields(normalizeRoom(room || initialRoomCode || $('joinRoomCode')?.value || ''));
    setLobbyMenuMode('join');
    showOnlyLobby('lobbyMenuForm');
  }
  function showRoomView() {
    showOnlyLobby('lobbyRoomView');
    fillRoomFields(sync.room);
    updateLobbyProfile();
    renderLobbyPlayers();
    updateAccessControls();
  }
  function hideLobby() {
    $('multiplayerLobby')?.classList.remove('open');
    setSiteReturnVisible(false);
    stopPublicRoomsPolling();
  }
  function setSiteReturnVisible(visible) {
    const link = document.querySelector('.site-return');
    if (!link) return;
    link.classList.toggle('menu-visible', !!visible);
    link.classList.toggle('hidden', !visible);
  }

  function setGameLobbyReturnVisible(visible) {
    const btn = $('returnToLobbyBtn');
    if (!btn) return;
    btn.classList.toggle('hidden', !visible);
  }

  // In-page confirm dialog. The native window.confirm() can be silently
  // suppressed (sandboxed iframe without allow-modals, "block dialogs"), which
  // would leave the back/return controls doing nothing. Falls back to confirm()
  // only when the overlay markup is unavailable.
  function gameConfirm(msg, onYes) {
    const ov = $('gameConfirmOverlay');
    if (!ov) { if (onYes && window.confirm(msg)) onYes(); return; }
    $('gcMsg').textContent = msg;
    ov.removeAttribute('hidden');
    const close = () => ov.setAttribute('hidden', '');
    $('gcConfirmBtn').onclick = () => { close(); onYes && onYes(); };
    $('gcCancelBtn').onclick = close;
  }

  function returnToLobbyFromGame() {
    const msg = isHost()
      ? t('letsdraw.confirmReturnHost', {}, 'Wirklich zurück in die Lobby? Die laufende Runde wird für alle beendet.')
      : t('letsdraw.confirmReturnGuest', {}, 'Zurück zur Lobby? Das laufende Spiel bleibt für die anderen unverändert.');
    gameConfirm(msg, applyReturnToLobby);
  }

  function applyReturnToLobby() {
    if (isHost()) {
      stopTimer(false);
      closeRoundModal();
      hideEndRanking();
      state.phase = 'lobby';
      state.running = false;
      state.timerEndAt = 0;
      state.wordVisible = false;
      state.currentWord = choiceOpen();
      state.currentCategory = t('letsdraw.waitingLobby', {}, 'Warten auf Lobby');
      state.wordChoices = [];
      state.guesses = [];
      state.canvasVersion = (Number(state.canvasVersion) || 0) + 1;
      clearCanvas(false, true);
      sendState('state');
      persistState();
    }
    showRoomView();
    updateUI();
  }

  // Leave the current room entirely and return to this game's own create/join
  // menu (not the site catalogue). Mirrors the in-app disconnect control and
  // clears the saved reconnect intent so a later reload doesn't silently rejoin.
  function leaveRoomToMenu() {
    stopJoinRetry();
    stopTimer(false);
    try { sync.socket?.close(); } catch (_) {}
    sync.socket = null;
    sync.connected = false;
    sync.role = 'none';
    sync.room = '';
    sync.joined = false;
    state.phase = 'menu';
    try { localStorage.removeItem(`brettspiele.${GAME_ID}.intent`); } catch (_) {}
    try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState({}, '', u.toString()); } catch (_) {}
    showLobbyChoice();
    updateUI();
  }
  // Shared back button: the create/join menu form is the top level (next "back"
  // leaves to the catalogue); the room lobby returns to that menu form in-page,
  // and a live match steps back to the room lobby first. Driven off the *visible*
  // screen (DOM) rather than state.phase, which can lag behind during an intent
  // restore (room view shown while phase is still 'menu') and wrongly send the
  // back button to the catalogue.
  window.__brettBack = {
    atTop: () => {
      const lobby = $('multiplayerLobby');
      const menuForm = $('lobbyMenuForm');
      return !!(lobby && lobby.classList.contains('open') && menuForm && !menuForm.classList.contains('hidden'));
    },
    up: () => {
      const lobby = $('multiplayerLobby');
      if (!lobby || !lobby.classList.contains('open')) { returnToLobbyFromGame(); return; }
      leaveRoomToMenu();
    }
  };

  function createHostedLobby() {
    const room = normalizeRoom(makeRoomCode());
    const name = normalizeName($('hostPlayerName')?.value, 'Host');
    resetGameStateForLobby();
    state.phase = 'lobby';
    state.players = [{ id: clientId, name, teamIndex: 0, host: true, score: 0 }];
    sync.role = 'host';
    sync.room = room;
    sync.playerName = name;
    sync.playerTeamIndex = 0;
    sync.joined = true;
    fillRoomFields(room);
    syncLobbySettingsToState();
    connect('host', room);
    saveIntent();
    showRoomView();
    updateUI();
  }

  function joinHostedLobby() {
    // Name + Raumcode müssen VOR dem Beitreten feststehen.
    const name = normalizeName($('joinPlayerName')?.value, '');
    if (!name) return showToast(t('letsdraw.msg.enterName', {}, 'Bitte Namen eingeben'));
    const room = normalizeRoom($('joinRoomCode')?.value || initialRoomCode || '');
    if (!room) return showToast(t('letsdraw.msg.enterRoom', {}, 'Bitte Raumcode eingeben'));
    state.phase = 'lobby';
    sync.role = 'guest';
    sync.room = room;
    sync.playerName = name;
    sync.playerTeamIndex = 0;
    // Ein-Klick-Beitritt: der Gast gilt sofort als beigetreten. Sobald die
    // Verbindung steht, meldet ihn startJoinRetry (im connect-open-Handler)
    // beim Host an – kein zweiter Schritt im Raum-View mehr nötig. Das Team
    // lässt sich danach im Raum-View jederzeit umstellen.
    sync.joined = true;
    fillRoomFields(room);
    if ($('lobbyPlayerName')) $('lobbyPlayerName').value = name;   // Raum-View-Profil vorbelegen
    connect('guest', room);
    saveIntent();
    showRoomView();
    updateUI();
  }

  function submitLobbyProfile() {
    if (!sync.connected || !sync.room) return showToast(t('letsdraw.connecting', {}, 'Verbinde…'));
    const name = normalizeName($('lobbyPlayerName')?.value, t('rollforge.guest', {}, 'Gast'));
    const teamIndex = state.playMode === SOLO_MODE ? playerIndexById(clientId) : Number($('lobbyPlayerTeam')?.value || 0);
    sync.playerName = name;
    sync.playerTeamIndex = Math.max(0, teamIndex || 0);
    sync.joined = true;
    const player = { id: clientId, name, teamIndex: sync.playerTeamIndex, host: sync.role === 'host', score: playerById(clientId)?.score || 0 };
    if (sync.role === 'host') {
      upsertPlayer(player);
      sendState('state');
    } else {
      send({ type: 'joinPlayer', player });
      startJoinRetry();
    }
    saveIntent();
    updateUI();
  }

  function joinRetryAttempt() {
    if (sync.role !== 'guest' || !sync.joined || playerById(clientId)) {
      if (playerById(clientId)) stopJoinRetry();
      return;
    }
    send({ type: 'joinPlayer', player: { id: clientId, name: sync.playerName, teamIndex: sync.playerTeamIndex, host: false, score: 0 } });
    send({ type: 'requestState' });
  }
  function startJoinRetry() {
    stopJoinRetry();
    joinRetryAttempt();                       // sofort anmelden, nicht erst nach 1,2 s
    joinRetryTimer = setInterval(joinRetryAttempt, 1200);
  }
  function stopJoinRetry() { clearInterval(joinRetryTimer); joinRetryTimer = null; }

  function upsertPlayer(player) {
    const id = player.id || player.clientId;
    if (!id) return;
    const existing = state.players.find((p) => p.id === id);
    const soloIndex = existing ? existing.teamIndex : state.players.length;
    const next = {
      id,
      name: normalizeName(player.name, 'Player'),
      teamIndex: state.playMode === SOLO_MODE ? soloIndex : Math.max(0, Number(player.teamIndex) || 0),
      host: !!player.host || id === state.players.find((p) => p.host)?.id,
      score: Number(player.score) || existing?.score || 0
    };
    if (existing) Object.assign(existing, next);
    else state.players.push(next);
  }

  function playerById(id) { return state.players.find((p) => p.id === id); }
  function myPlayer() { return playerById(clientId); }
  function playerIndexById(id) { return Math.max(0, state.players.findIndex((p) => p.id === id)); }
  function currentDrawer() { return playerById(state.drawerId); }
  function isHost() { return sync.role === 'host'; }
  function isDrawer() { return state.drawerId === clientId; }
  function canHostControl() { return isHost(); }
  function canDraw() { return state.phase === 'playing' && isDrawer() && state.running; }
  function canGuess() { return state.phase === 'playing' && state.running && !!myPlayer() && !isDrawer() && currentWordIsGuessable(); }

  function resetGameStateForLobby() {
    stopTimer(false);
    state.publicRoom = false;
    state.teams = clone(DEFAULT_TEAMS);
    state.round = 1;
    state.targetScore = DEFAULT_TARGET;
    state.secondsTotal = DEFAULT_SECONDS;
    state.secondsLeft = DEFAULT_SECONDS;
    state.currentWord = noWord();
    state.currentCategory = wordLabel();
    state.wordChoices = [];
    state.wordVisible = false;
    state.drawerId = null;
    state.turnIndex = 0;
    state.turnOrder = [];
    state.teamDrawerCursor = {};
    state.guesses = [];
    state.canvasVersion = (Number(state.canvasVersion) || 0) + 1;
    clearCanvas(false, true);
  }

  function startHostedGame() {
    if (!isHost()) return;
    if (state.players.length < 2) return showToast(t('letsdraw.needPlayers', {}, 'Mindestens 2 Spieler benötigt'));
    syncLobbySettingsToState();
    // Delist the room once play actually starts.
    state.publicRoom = false;
    if ($('publicRoomCheck')) $('publicRoomCheck').checked = false;
    if (state.playMode === SOLO_MODE) {
      state.teams = state.players.map((p, i) => ({ name: p.name, score: Number(p.score) || 0, color: DEFAULT_TEAMS[i % DEFAULT_TEAMS.length].color }));
      state.players.forEach((p, i) => { p.teamIndex = i; });
    }
    state.phase = 'playing';
    state.round = 1;
    state.turnOrder = buildTurnOrder();
    state.teamDrawerCursor = randomDrawerCursors();
    state.turnIndex = 0;
    state.drawerId = drawerIdForTurn(state.turnIndex);
    playDrawSound();
    prepareRound();
    send({ type: 'startGame', snapshot: makeSnapshot() });
    sendState('state');
    hideLobby();
    updateUI();
    if (isDrawer()) openRoundModal();
  }

  function prepareRound() {
    stopTimer(false);
    state.secondsLeft = state.secondsTotal;
    state.currentWord = choiceOpen();
    state.currentCategory = t('letsdraw.chooseOne', {}, 'Wähle 1 von 3');
    state.wordChoices = getWordChoices(3);
    state.wordVisible = false;
    state.guesses = [];
    state.canvasVersion = (Number(state.canvasVersion) || 0) + 1;
    clearCanvas(false, true);
  }

  function regenerateWordChoices() {
    if (state.phase !== 'playing') return;
    if (state.running) return showToast(t('letsdraw.msg.pauseFirst', {}, 'Erst die laufende Runde stoppen.'));
    if (!isDrawer() && !isHost()) return;
    playDrawSound();
    state.currentWord = choiceOpen();
    state.currentCategory = t('letsdraw.chooseOne', {}, 'Wähle 1 von 3');
    state.wordChoices = getWordChoices(3);
    state.wordVisible = false;
    updateUI();
    sendState('state');
    if (isDrawer() || isHost()) openRoundModal();
  }

  function nextTurn() {
    if (!state.players.length) return;
    if (!Array.isArray(state.turnOrder) || !state.turnOrder.length) state.turnOrder = buildTurnOrder();
    state.round += 1;
    state.turnIndex = (state.turnIndex + 1) % Math.max(1, state.turnOrder.length);
    state.drawerId = drawerIdForTurn(state.turnIndex);
    playDrawSound();
    prepareRound();
    sendState('state');
    persistState();
    updateUI();
    if (isDrawer()) openRoundModal();
  }

  function shuffleList(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function buildTurnOrder() {
    if (state.playMode === SOLO_MODE) {
      return shuffleList(state.players.map((p) => ({ type: 'player', id: p.id })).filter((x) => x.id));
    }
    const activeTeams = state.teams
      .map((team, index) => ({ type: 'team', teamIndex: index }))
      .filter((entry) => state.players.some((p) => Number(p.teamIndex) === entry.teamIndex));
    return shuffleList(activeTeams.length ? activeTeams : state.players.map((p) => ({ type: 'player', id: p.id })));
  }

  // Auch der erste Zeichner INNERHALB jedes Teams wird zufällig gewählt (nicht
  // immer das zuerst beigetretene Mitglied), damit die Zugreihenfolge zu Beginn
  // vollständig ausgewürfelt ist. Im Einzelspieler-Modus ohne Belang.
  function randomDrawerCursors() {
    const cursors = {};
    if (state.playMode === SOLO_MODE) return cursors;
    state.teams.forEach((team, index) => {
      const count = state.players.filter((p) => Number(p.teamIndex) === index).length;
      if (count > 0) cursors[index] = Math.floor(Math.random() * count);
    });
    return cursors;
  }

  function drawerIdForTurn(turnIndex) {
    if (!state.players.length) return null;
    if (!Array.isArray(state.turnOrder) || !state.turnOrder.length) state.turnOrder = buildTurnOrder();
    const entry = state.turnOrder[turnIndex % state.turnOrder.length];
    if (!entry) return state.players[0]?.id || null;
    if (entry.type === 'player') return entry.id || state.players[0]?.id || null;
    const teamIndex = Number(entry.teamIndex) || 0;
    const members = state.players.filter((p) => Number(p.teamIndex) === teamIndex);
    if (!members.length) return state.players[0]?.id || null;
    const cursor = Number(state.teamDrawerCursor?.[teamIndex] || 0);
    const player = members[cursor % members.length];
    state.teamDrawerCursor = { ...(state.teamDrawerCursor || {}), [teamIndex]: (cursor + 1) % members.length };
    return player?.id || members[0]?.id || null;
  }

  function chooseWord(word) {
    if (!isDrawer() && !isHost()) return;
    state.currentWord = word;
    state.currentCategory = categoryFor(word);
    state.wordVisible = false;
    if ($('hintOverlay')) $('hintOverlay').style.display = 'none';
    updateUI();
    sendState('state');
    openRoundModal();
  }

  function startTimer() {
    if (!isDrawer() && !isHost()) return;
    if (!currentWordIsGuessable()) return openRoundModal();
    stopTimer(false);
    state.running = true;
    state.wordVisible = false;
    if ($('hintOverlay')) $('hintOverlay').style.display = 'none';
    state.timerEndAt = Date.now() + state.secondsLeft * 1000;
    runTimerLoop();
    send({ type: 'timerStart', endAt: state.timerEndAt, snapshot: makeSnapshot() });
    sendState('state');
    updateUI();
  }

  function startTimerFromEndAt(endAt, owner) {
    stopTimer(false);
    state.running = true;
    state.wordVisible = false;
    if ($('hintOverlay')) $('hintOverlay').style.display = 'none';
    state.timerEndAt = Number(endAt) || 0;
    runTimerLoop(owner);
  }

  function runTimerLoop() {
    clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      const left = Math.max(0, Math.ceil((state.timerEndAt - Date.now()) / 1000));
      state.secondsLeft = left;
      if (left <= 0) {
        stopTimer(false);
        if (isHost()) {
          nextTurn();
        }
      }
      updateUI();
    }, 250);
  }

  function stopTimer(broadcast = true) {
    state.running = false;
    clearInterval(state.timerId);
    state.timerId = null;
    if (broadcast && isHost()) sendState('state');
  }

  function toggleTimer() { state.running ? stopTimer(true) : startTimer(); }

  function isChoiceOpen() {
    return Array.isArray(state.wordChoices) && state.wordChoices.length > 0 && !state.wordChoices.includes(state.currentWord);
  }
  function currentWordIsGuessable() {
    return !!state.currentWord && state.currentWord !== noWord() && !isChoiceOpen();
  }
  function normalizeGuess(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function submitGuess(event) {
    event?.preventDefault?.();
    const input = $('guessInput');
    const text = input?.value || '';
    if (!text.trim()) return;
    if (!canGuess()) return showToast(t('letsdraw.guess.notAllowed', {}, 'Du kannst gerade nicht raten'));
    if (isHost()) evaluateGuess(text, clientId);
    else send({ type: 'guess', text, playerId: clientId });
    input.value = '';
  }

  function evaluateGuess(text, playerId) {
    if (!isHost() || !currentWordIsGuessable()) return;
    const player = playerById(playerId);
    if (!player || player.id === state.drawerId) return;
    const cleanText = String(text || '').trim().slice(0, 80);
    if (!cleanText) return;
    addGuessEntry(player, cleanText);
    const isCorrect = normalizeGuess(cleanText) === normalizeGuess(state.currentWord);
    if (!isCorrect) {
      sendState('state');
      return;
    }
    const points = Math.max(0, Number(state.secondsLeft) || 0);
    if (state.playMode === SOLO_MODE) {
      player.score = (Number(player.score) || 0) + points;
      const drawer = currentDrawer();
      if (drawer && drawer.id !== player.id) {
        const drawerBonus = Math.round(points / Math.max(1, state.players.length));
        drawer.score = (Number(drawer.score) || 0) + drawerBonus;
      }
    } else {
      const team = state.teams[player.teamIndex];
      if (team) team.score = (Number(team.score) || 0) + points;
    }
    showToast(t('letsdraw.guess.correct', { points }, `Richtig! +${points}`));
    stopTimer(false);
    if (hasWinner()) {
      state.phase = 'ended';
      sendState('state');
      showEndRanking();
    } else {
      nextTurn();
    }
  }

  function addGuessEntry(player, text) {
    state.guesses = Array.isArray(state.guesses) ? state.guesses : [];
    state.guesses.push({
      playerId: player.id,
      playerName: player.name || 'Player',
      text: String(text || '').trim().slice(0, 80),
      at: Date.now()
    });
    if (state.guesses.length > 60) state.guesses = state.guesses.slice(-60);
  }

  function hasWinner() {
    if (state.playMode === SOLO_MODE) return state.players.some((p) => (Number(p.score) || 0) >= state.targetScore);
    return state.teams.some((team) => (Number(team.score) || 0) >= state.targetScore);
  }

  function rankingRows() {
    if (state.playMode === SOLO_MODE) return [...state.players].map((p) => ({ name: p.name, score: Number(p.score) || 0 })).sort((a,b) => b.score - a.score);
    return [...state.teams].map((team) => ({ name: team.name, score: Number(team.score) || 0 })).sort((a,b) => b.score - a.score);
  }

  function showEndRanking() {
    const rows = rankingRows();
    const podium = $('rankingPodium');
    const list = $('rankingList');
    if (podium) podium.innerHTML = rows.slice(0,3).map((r,i) => `<div class="rank-podium rank-${i+1}"><span>#${i+1}</span><strong>${escapeHtml(r.name)}</strong><em>${r.score}</em></div>`).join('');
    if (list) list.innerHTML = rows.map((r,i) => `<div class="rank-row"><span>${i+1}</span><strong>${escapeHtml(r.name)}</strong><em>${r.score}</em></div>`).join('');
    const overlay = $('rankingOverlay');
    overlay?.classList.remove('hidden');
    overlay?.setAttribute('aria-hidden', 'false');
  }
  function hideEndRanking() {
    const overlay = $('rankingOverlay');
    overlay?.classList.add('hidden');
    overlay?.setAttribute('aria-hidden', 'true');
  }

  function isNestedWordSource(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return Object.values(obj).every((cat) => cat && typeof cat === 'object' && !Array.isArray(cat));
  }
  function getWordPool() {
    let localized = null;
    try { localized = I18N?.wordsForCurrentLanguage?.(); } catch (_) {}
    const source = isNestedWordSource(localized) ? localized : WORDS;
    const category = $('category')?.value || $('lobbyCategory')?.value || 'mixed';
    const difficulty = $('difficulty')?.value || $('lobbyDifficulty')?.value || 'mixed';
    const categories = category === 'mixed' ? Object.keys(source) : [category];
    let pool = [];
    for (const cat of categories) {
      const diffs = source[cat];
      if (!diffs) continue;
      const levels = difficulty === 'mixed' ? Object.keys(diffs) : [difficulty];
      for (const level of levels) pool.push(...(diffs[level] || []));
    }
    pool.push(...state.customWords);
    return [...new Set(pool.filter(Boolean))];
  }
  function getWordChoices(count) {
    const pool = getWordPool();
    const shuffled = pool.sort(() => Math.random() - 0.5);
    while (shuffled.length < count) shuffled.push('Kreative Leere');
    return shuffled.slice(0, count);
  }
  function categoryFor(word) {
    for (const [cat, diffs] of Object.entries(WORDS)) {
      for (const arr of Object.values(diffs)) if (arr.includes(word)) return cat;
    }
    return t('letsdraw.custom.word', {}, 'Eigener Begriff');
  }

  function resizeCanvas(keepContent = true) {
    if (!canvas || !ctx) return;
    const w = BOARD_WIDTH;
    const h = BOARD_HEIGHT;
    if (canvas.width === w && canvas.height === h) return;
    let snapshot = null;
    if (keepContent && canvas.width && canvas.height) {
      snapshot = document.createElement('canvas');
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext('2d').drawImage(canvas, 0, 0);
    }
    canvas.width = w;
    canvas.height = h;
    clearPaper();
    if (snapshot) ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, w, h);
  }
  function clearPaper() {
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fbf7ec';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();
  }
  function scale() {
    const rect = canvas.getBoundingClientRect();
    return { x: BOARD_WIDTH / (rect.width || 1), y: BOARD_HEIGHT / (rect.height || 1), avg: 1 };
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const s = scale();
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    const cx = touch ? touch.clientX : event.clientX;
    const cy = touch ? touch.clientY : event.clientY;
    return { x: (cx - rect.left) * s.x, y: (cy - rect.top) * s.y };
  }
  function drawDot(p, opt = {}) {
    const size = (opt.size || state.brushSize) * BRUSH_LOGICAL_SCALE;
    ctx.save();
    ctx.globalCompositeOperation = (opt.tool || state.tool) === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = opt.color || state.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, (opt.tool || state.tool) === 'eraser' ? size * 1.25 : size / 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawLine(from, to, opt = {}) {
    ctx.save();
    ctx.globalCompositeOperation = (opt.tool || state.tool) === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = opt.color || state.color;
    ctx.lineWidth = (opt.tool || state.tool) === 'eraser' ? (opt.size || state.brushSize) * BRUSH_LOGICAL_SCALE * 2.5 : (opt.size || state.brushSize) * BRUSH_LOGICAL_SCALE;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.restore();
  }
  function saveHistory() {
    try { state.history.push(canvas.toDataURL('image/png')); if (state.history.length > 25) state.history.shift(); } catch (_) {}
  }
  function undo() {
    if (!canDraw() && !isHost()) return;
    const src = state.history.pop();
    if (!src) return;
    loadCanvasImage(src);
    send({ type: 'canvasImage', dataUrl: src });
  }
  function loadCanvasImage(src) {
    const img = new Image();
    img.onload = () => { clearPaper(); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
    img.src = src;
  }
  function clearCanvas(save = true, remote = false) {
    if (save) saveHistory();
    if (!remote) state.canvasVersion = (Number(state.canvasVersion) || 0) + 1;
    clearPaper();
    if ($('hintOverlay')) $('hintOverlay').style.display = state.phase === 'playing' && state.running ? 'none' : 'block';
    if (!remote && (canDraw() || isHost())) {
      send({ type: 'clearCanvas', canvasVersion: state.canvasVersion });
      if (isHost()) sendState('state');
    }
  }
  function startDraw(event) {
    if (!canDraw()) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    state.drawing = true;
    state.lastPoint = point(event);
    saveHistory();
    $('hintOverlay') && ($('hintOverlay').style.display = 'none');
    drawDot(state.lastPoint);
    send({ type: 'drawStart', p: state.lastPoint, color: state.color, size: state.brushSize, tool: state.tool });
  }
  function moveDraw(event) {
    if (!state.drawing || !canDraw()) return;
    event.preventDefault();
    const p = point(event);
    drawLine(state.lastPoint, p);
    send({ type: 'drawMove', from: state.lastPoint, to: p, color: state.color, size: state.brushSize, tool: state.tool });
    state.lastPoint = p;
  }
  function endDraw() {
    if (!state.drawing) return;
    state.drawing = false; state.lastPoint = null;
    send({ type: 'drawEnd' });
    schedulePersistCanvas();
  }
  function remoteDrawStart(msg) {
    const p = msg.p; if (!p) return;
    remoteLines.set(msg.clientId, p);
    drawDot(p, msg);
    $('hintOverlay') && ($('hintOverlay').style.display = 'none');
  }
  function remoteDrawMove(msg) {
    if (msg.from && msg.to) drawLine(msg.from, msg.to, msg);
    else if (remoteLines.has(msg.clientId) && msg.to) drawLine(remoteLines.get(msg.clientId), msg.to, msg);
    if (msg.to) remoteLines.set(msg.clientId, msg.to);
  }
  function remoteDrawEnd(msg) { remoteLines.delete(msg.clientId); }

  function renderSwatches() {
    const wrap = $('colorSwatches'); if (!wrap) return;
    wrap.innerHTML = '';
    PALETTE.forEach((color) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `swatch${state.color === color ? ' active' : ''}`; b.style.background = color; b.title = color;
      b.addEventListener('click', () => { state.color = color; state.tool = 'pen'; renderSwatches(); });
      wrap.appendChild(b);
    });
  }

  function renderTeams() {
    const list = $('teamList'); if (!list) return;
    const rows = state.playMode === SOLO_MODE
      ? state.players.map((p, i) => ({ name: p.name, score: Number(p.score)||0, color: DEFAULT_TEAMS[i % DEFAULT_TEAMS.length].color, player: p }))
      : state.teams;
    list.innerHTML = rows.map((team, index) => {
      const active = state.playMode === SOLO_MODE ? team.player?.id === state.drawerId : currentDrawer()?.teamIndex === index;
      return `<div class="team-card ${active ? 'active' : ''}" style="--team-color:${team.color || '#f2bf57'}"><div class="team-color-dot"></div><div><div class="team-name">${escapeHtml(team.name)}</div></div><div class="score">${Number(team.score)||0}</div></div>`;
    }).join('');
  }

  function renderRoundGuesses() {
    const list = $('roundGuessesList');
    const panel = $('roundGuessesPanel');
    if (!list || !panel) return;
    const guesses = Array.isArray(state.guesses) ? state.guesses : [];
    panel.classList.toggle('is-empty', guesses.length === 0);
    if (!guesses.length) {
      list.innerHTML = `<div class="round-guess-empty">${t('letsdraw.guesses.empty', {}, 'Noch keine Eingaben.')}</div>`;
      return;
    }
    list.innerHTML = guesses.slice(-40).reverse().map((g) => {
      const name = escapeHtml(g.playerName || playerById(g.playerId)?.name || 'Player');
      const text = escapeHtml(g.text || '');
      return `<div class="round-guess-entry"><strong>${name}</strong><span>:</span><em>${text}</em></div>`;
    }).join('');
  }

  function ensurePlayModeControl() {
    if ($('lobbyPlayMode')) return;
    const panel = $('lobbyHostSettingsPanel');
    if (!panel) return;
    const label = document.createElement('label'); label.htmlFor = 'lobbyPlayMode'; label.textContent = t('letsdraw.mode', {}, 'Modus');
    const select = document.createElement('select'); select.id = 'lobbyPlayMode';
    select.innerHTML = `<option value="${TEAM_MODE}">${t('letsdraw.teams', {}, 'Teams')}</option><option value="${SOLO_MODE}">${t('letsdraw.mode.freeForAll', {}, 'Jeder gegen jeden')}</option>`;
    const anchor = $('lobbyTargetScore');
    panel.insertBefore(label, anchor?.previousElementSibling || panel.children[2] || null);
    panel.insertBefore(select, anchor?.previousElementSibling || panel.children[3] || null);
    select.addEventListener('change', () => { state.playMode = select.value === SOLO_MODE ? SOLO_MODE : TEAM_MODE; updateLobbyProfile(); updateUI(); if (isHost()) sendState('state'); });
    ensureLobbyTeamControls();
  }

  function ensureLobbyTeamControls() {
    if ($('lobbyTeamManager')) return;
    const panel = $('lobbyHostSettingsPanel');
    if (!panel) return;
    const wrap = document.createElement('div');
    wrap.id = 'lobbyTeamManager';
    wrap.className = 'ld-team-manager';
    wrap.innerHTML = `<div class="ld-team-manager-head"><strong>${t('letsdraw.teams.title', {}, 'Teams')}</strong><button id="lobbyAddTeamBtn" type="button" class="secondary">${t('letsdraw.addTeam', {}, '+ Team')}</button></div><div id="lobbyTeamManagerList" class="ld-team-manager-list"></div>`;
    const profile = $('lobbyProfilePanel');
    if (profile?.parentElement) profile.parentElement.insertBefore(wrap, profile);
    else panel.appendChild(wrap);
    $('lobbyAddTeamBtn')?.addEventListener('click', addTeam);
  }

  function renderLobbyTeamControls() {
    ensureLobbyTeamControls();
    const wrap = $('lobbyTeamManager');
    const list = $('lobbyTeamManagerList');
    if (!wrap || !list) return;
    // Team-Verwaltung (umbenennen/hinzufügen/entfernen) ist Host-Sache — Gäste
    // wählen ihr Team nur über das Dropdown im Profil-Panel.
    const visible = state.playMode !== SOLO_MODE && sync.role !== 'guest';
    wrap.classList.toggle('hidden', !visible);
    wrap.classList.toggle('read-only', !isHost());
    list.innerHTML = state.teams.map((team, index) => `<div class="ld-team-manager-row" style="--team-color:${team.color || '#f2bf57'}"><span class="ld-team-dot"></span><input data-team-name="${index}" value="${escapeHtml(team.name)}" ${isHost() ? '' : 'disabled'} /><button type="button" class="secondary" data-remove-team="${index}" ${(!isHost() || state.teams.length <= 1) ? 'disabled' : ''}>×</button></div>`).join('');
    list.querySelectorAll('[data-remove-team]').forEach((btn) => btn.addEventListener('click', () => removeTeam(btn.dataset.removeTeam)));
    list.querySelectorAll('[data-team-name]').forEach((input) => {
      input.addEventListener('change', () => renameTeam(input.dataset.teamName, input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    });
  }

  function updateLobbyProfile() {
    ensurePlayModeControl();
    if ($('lobbyPlayMode')) $('lobbyPlayMode').value = state.playMode;
    if ($('lobbyRoleLabel')) $('lobbyRoleLabel').textContent = sync.role === 'host' ? t('rollforge.host', {}, 'Host') : t('rollforge.guest', {}, 'Gast');
    if ($('lobbyPlayerName') && !$('lobbyPlayerName').value) $('lobbyPlayerName').value = accountName() || sync.playerName || '';
    const teamSelect = $('lobbyPlayerTeam');
    const teamLabel = document.querySelector('label[for="lobbyPlayerTeam"]');
    if (teamSelect) {
      teamSelect.innerHTML = state.teams.map((team, i) => `<option value="${i}">${escapeHtml(team.name)}</option>`).join('');
      teamSelect.value = String(sync.playerTeamIndex || 0);
      const hideTeam = state.playMode === SOLO_MODE;
      teamSelect.classList.toggle('hidden', hideTeam);
      teamSelect.disabled = hideTeam;
      teamSelect.hidden = hideTeam;
      teamLabel?.classList.toggle('hidden', hideTeam);
      if (teamLabel) teamLabel.hidden = hideTeam;
    }
    renderLobbyTeamControls();
    const already = !!myPlayer();
    if ($('lobbyJoinTeamBtn')) $('lobbyJoinTeamBtn').textContent = already ? t('letsdraw.lobby.updateSeat', {}, 'Platz aktualisieren') : t('letsdraw.lobby.joinTeam', {}, 'Dem Team beitreten');
    updateAccessControls();
  }

  function renderLobbyPlayers() {
    const wrap = $('lobbyPlayersList'); if (!wrap) return;
    if (!state.players.length) {
      wrap.innerHTML = `<div class="ld-empty">${t('letsdraw.lobby.noPlayers', {}, 'Noch niemand sitzt am Tisch.')}</div>`;
      return;
    }
    if (state.playMode === SOLO_MODE) {
      wrap.innerHTML = `<div class="ld-lobby-team"><h4>${t('letsdraw.mode.freeForAll', {}, 'Jeder gegen jeden')} · ${state.players.length}</h4>${state.players.map(playerPill).join('')}</div>`;
    } else {
      wrap.innerHTML = state.teams.map((team, i) => {
        const players = state.players.filter((p) => Number(p.teamIndex) === i);
        return `<div class="ld-lobby-team"><h4><span style="background:${team.color};"></span>${escapeHtml(team.name)} · ${players.length}</h4>${players.length ? players.map(playerPill).join('') : `<p class="muted">${t('letsdraw.lobby.emptyTeam', {}, 'Noch leer')}</p>`}</div>`;
      }).join('');
    }
    if ($('lobbyStartGameBtn')) $('lobbyStartGameBtn').disabled = !isHost() || state.players.length < 2;
  }
  function playerPill(p) {
    const tags = [];
    if (p.host) tags.push('Host');
    if (p.id === clientId) tags.push(t('letsdraw.you', {}, 'du'));
    if (p.id === state.drawerId) tags.push(t('letsdraw.drawer', {}, 'Zeichner'));
    return `<div class="ld-player-pill"><strong>${escapeHtml(p.name)}</strong>${tags.length ? `<span>${tags.join(' · ')}</span>` : ''}</div>`;
  }

  function updateUI() {
    document.documentElement.dataset.letsdrawMode = state.playMode === SOLO_MODE ? 'solo' : 'teams';
    if ($('roundNumber')) $('roundNumber').textContent = state.round;
    if ($('targetScoreLabel')) $('targetScoreLabel').textContent = state.targetScore;
    if ($('modeLabel')) $('modeLabel').textContent = state.playMode === SOLO_MODE ? t('letsdraw.mode.freeForAll', {}, 'Jeder gegen jeden') : t('letsdraw.teams', {}, 'Teams');
    const drawer = currentDrawer();
    const team = state.playMode === SOLO_MODE ? null : state.teams[drawer?.teamIndex || 0];
    if ($('currentTeamName')) $('currentTeamName').textContent = drawer ? (state.playMode === SOLO_MODE ? drawer.name : `${team?.name || ''} · ${drawer.name}`) : t('letsdraw.waiting', {}, 'Warten auf Lobby');
    $('currentTeamBadge')?.style.setProperty('--team-color', team?.color || '#f2bf57');
    if ($('timerText')) $('timerText').textContent = Math.max(0, state.secondsLeft);
    const deg = state.secondsTotal ? Math.max(0, state.secondsLeft / state.secondsTotal) * 360 : 0;
    $('timerCircle')?.style.setProperty('--timer-deg', `${deg}deg`);
    if ($('wordText')) $('wordText').textContent = state.currentWord;
    if ($('wordCategory')) $('wordCategory').textContent = state.currentCategory;
    // Nur der Zeichner (bzw. ein bewusst aufgedeckter Begriff) darf das Wort
    // sehen — NICHT der Host, sonst kennt er als Rater den geheimen Begriff des
    // aktuell zeichnenden Spielers schon zu Zugbeginn.
    const canSeeWordCard = currentWordIsGuessable() && !state.running && (state.wordVisible || isDrawer());
    $('wordCard')?.classList.toggle('hidden', !canSeeWordCard);
    if ($('brushSizeLabel')) $('brushSizeLabel').textContent = state.brushSize;
    if ($('targetScore')) $('targetScore').value = String(state.targetScore);
    if ($('roundTime')) $('roundTime').value = String(state.secondsTotal);
    if ($('lobbyTargetScore')) $('lobbyTargetScore').value = String(state.targetScore);
    if ($('lobbyRoundTime')) $('lobbyRoundTime').value = String(state.secondsTotal);
    if ($('publicRoomCheck')) $('publicRoomCheck').checked = !!state.publicRoom;
    if ($('guessSubmitBtn')) $('guessSubmitBtn').disabled = !canGuess();
    if ($('guessHint')) $('guessHint').textContent = isDrawer() ? t('letsdraw.guess.drawerHint', {}, 'Du zeichnest gerade. Raten müssen die anderen.') : canGuess() ? t('letsdraw.guess.hint', {}, 'Tipp eingeben und Enter drücken.') : t('letsdraw.guess.waiting', {}, 'Warte auf eine laufende Runde.');
    setGameLobbyReturnVisible(state.phase === 'playing');
    renderTeams();
    renderRoundGuesses();
    renderLobbyPlayers();
    updateLobbyProfile();
    updateAccessControls();
    setSyncStatus(sync.connected ? `${sync.role === 'host' ? 'Host' : 'Gast'} · ${sync.room}` : t('letsdraw.offline', {}, 'Offline'));
  }

  function updateAccessControls() {
    const host = isHost();
    document.documentElement.dataset.letsdrawRole = sync.role || 'none';
    // Gäste sehen die Host-/Rundeneinstellungen gar nicht — nur was zum
    // Beitreten nötig ist (Name, Team, Spielerliste). Im lokalen Modus
    // (role 'none') konfiguriert der Spieler selbst, daher weiter sichtbar.
    const isGuest = sync.role === 'guest';
    const hostSettings = $('lobbyHostSettingsPanel');
    if (hostSettings) {
      hostSettings.classList.toggle('hidden', isGuest);
      hostSettings.classList.toggle('read-only', !host);
      hostSettings.querySelectorAll('input, select, button').forEach((el) => { el.disabled = !host; });
    }
    // Sauber getrennte Menüs: Der Host sieht NUR die Host-Einstellungen (er ist
    // beim Erstellen bereits mit Name + erstem Team gesetzt); das beitreten-
    // spezifische „Dein Platz"-Panel (Name + Team wählen) gehört allein zum
    // Gast-/Beitreten-Fluss.
    const profilePanel = $('lobbyProfilePanel');
    if (profilePanel) profilePanel.classList.toggle('hidden', host);
    if ($('lobbyStartGameBtn')) {
      $('lobbyStartGameBtn').hidden = !host;
      $('lobbyStartGameBtn').disabled = !host || state.players.length < 2;
    }
    ['addTeamBtn', 'saveCustomWordsBtn', 'resetGameBtn', 'skipBtn', 'newRoundBtn', 'startPauseBtn', 'newWordsBtn'].forEach((id) => {
      const el = $(id); if (el) el.disabled = sync.role !== 'none' && !host;
    });
    if ($('customWords')) $('customWords').disabled = sync.role !== 'none' && !host;
    if ($('newWordsBtn')) $('newWordsBtn').disabled = state.running || state.phase !== 'playing' || (!isDrawer() && !host);
    if ($('lobbyAddTeamBtn')) $('lobbyAddTeamBtn').disabled = !host;
    if ($('lobbyWaitText')) $('lobbyWaitText').textContent = host
      ? t('letsdraw.hostStartHint', {}, 'Der Host startet das Spiel, sobald alle im richtigen Team sind.')
      : t('letsdraw.guestWaitHint', {}, 'Du kannst hier Namen und Team wählen. Einstellungen kommen vom Host, wie es sich für eine kleine Diktatur am Spieltisch gehört.');
  }

  function syncLobbySettingsToState() {
    state.targetScore = Math.max(10, Math.min(5000, Number($('lobbyTargetScore')?.value || $('targetScore')?.value || DEFAULT_TARGET)));
    state.secondsTotal = Math.max(10, Number($('lobbyRoundTime')?.value || $('roundTime')?.value || DEFAULT_SECONDS));
    if ($('publicRoomCheck')) state.publicRoom = $('publicRoomCheck').checked;
    if (!state.running) state.secondsLeft = state.secondsTotal;
    const nextMode = $('lobbyPlayMode')?.value === SOLO_MODE ? SOLO_MODE : TEAM_MODE;
    if (state.playMode !== nextMode) { state.turnOrder = []; state.teamDrawerCursor = {}; }
    state.playMode = nextMode;
    if ($('roundTime')) $('roundTime').value = String(state.secondsTotal);
    if ($('targetScore')) $('targetScore').value = String(state.targetScore);
    if ($('difficulty') && $('lobbyDifficulty')) $('difficulty').value = $('lobbyDifficulty').value;
    if ($('category') && $('lobbyCategory')) $('category').value = $('lobbyCategory').value;
  }

  function openRoundModal() {
    const modal = $('roundModal'); if (!modal) return;
    if (!state.wordChoices.length) state.wordChoices = getWordChoices(3);
    const modalWord = $('modalWord');
    $('modalCategory') && ($('modalCategory').textContent = isChoiceOpen() ? t('letsdraw.wordChoice', {}, 'Begriffsauswahl') : state.currentCategory);
    $('modalTitle') && ($('modalTitle').textContent = currentDrawer() ? `${currentDrawer().name} ${t('letsdraw.draws', {}, 'zeichnet')}` : t('letsdraw.newRound', {}, 'Neue Runde'));
    if (modalWord) {
      modalWord.className = 'word-options';
      modalWord.innerHTML = state.wordChoices.map((word) => `<button class="word-option ${word === state.currentWord ? 'active' : ''}" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button>`).join('');
      modalWord.querySelectorAll('.word-option').forEach((btn) => btn.addEventListener('click', () => chooseWord(btn.dataset.word)));
    }
    if ($('modalStartBtn')) $('modalStartBtn').disabled = isChoiceOpen();
    modal.classList.add('open');
  }
  function closeRoundModal() { $('roundModal')?.classList.remove('open'); }

  function saveCustomWords() {
    state.customWords = ($('customWords')?.value || '').split('\n').map((w) => w.trim()).filter(Boolean).filter((w, i, a) => a.indexOf(w) === i);
    showToast(t('letsdraw.msg.wordsSaved', { count: state.customWords.length }, `${state.customWords.length} Begriffe gespeichert`));
    if (isHost()) sendState('state');
  }

  function addTeam() {
    if (!isHost() && sync.role !== 'none') return;
    const colors = ['#57d68d', '#b85cff', '#ff8a4c', '#f06292', '#4dd0e1'];
    state.teams.push({ name: `Team ${state.teams.length + 1}`, score: 0, color: colors[state.teams.length % colors.length] });
    updateUI();
    if (isHost()) sendState('state');
  }

  function removeTeam(index) {
    if (!isHost() && sync.role !== 'none') return;
    index = Number(index);
    if (!Number.isInteger(index) || state.teams.length <= 1 || index < 0 || index >= state.teams.length) return;
    state.teams.splice(index, 1);
    state.players.forEach((p) => {
      if (Number(p.teamIndex) === index) p.teamIndex = 0;
      else if (Number(p.teamIndex) > index) p.teamIndex = Number(p.teamIndex) - 1;
    });
    sync.playerTeamIndex = Math.min(sync.playerTeamIndex || 0, state.teams.length - 1);
    updateUI();
    if (isHost()) sendState('state');
  }

  function renameTeam(index, name) {
    if (!isHost() && sync.role !== 'none') return;
    const team = state.teams[Number(index)];
    if (!team) return;
    team.name = normalizeName(name, `Team ${Number(index) + 1}`);
    updateUI();
    if (isHost()) sendState('state');
  }

  function saveImage() {
    const link = document.createElement('a');
    link.download = `lets-draw-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
  function exportGame() {
    const blob = new Blob([JSON.stringify(makeSnapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'lets-draw-session.json'; a.click(); URL.revokeObjectURL(url);
  }
  function importGame(file) {
    const reader = new FileReader();
    reader.onload = () => { try { applySnapshot(JSON.parse(reader.result)); if (isHost()) sendState('state'); } catch (_) { showToast(t('letsdraw.importFailed', {}, 'Import fehlgeschlagen')); } };
    reader.readAsText(file);
  }

  function copyInvite() {
    const room = normalizeRoom(sync.room || $('joinRoomCode')?.value || makeRoomCode());
    fillRoomFields(room);
    copyText(makeInviteUrl(room)).then((ok) => showToast(ok ? t('letsdraw.msg.linkCopied', {}, 'Link kopiert') : makeInviteUrl(room)));
  }

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function bind(id, handler, opts) { const el = $(id); if (el) el.addEventListener('click', handler, opts); }
  function bindEvents() {
    window.addEventListener('resize', () => requestAnimationFrame(() => resizeCanvas(true)));
    if ('ResizeObserver' in window && canvas) new ResizeObserver(() => requestAnimationFrame(() => resizeCanvas(true))).observe(canvas.parentElement || canvas);
    canvas?.addEventListener('pointerdown', startDraw);
    canvas?.addEventListener('pointermove', moveDraw);
    window.addEventListener('pointerup', endDraw);
    canvas?.addEventListener('pointerleave', endDraw);

    bind('modeCreateTab', () => setLobbyMenuMode('create'));
    bind('modeJoinTab', () => setLobbyMenuMode('join'));
    // Loggt sich jemand ein/aus, während die Lobby offen ist, den Namen nachziehen.
    window.addEventListener('brettspiele-auth-change', applyAccountName);
    bind('menuActionBtn', () => { if (lobbyMenuMode === 'join') joinHostedLobby(); else createHostedLobby(); });
    bind('lobbyCopyLinkBtn', copyInvite);
    bind('syncCopyLinkBtn', copyInvite);
    bind('lobbyStartGameBtn', startHostedGame);
    bind('lobbyJoinTeamBtn', submitLobbyProfile);
    bind('lobbyCloseBtn', () => { if (state.phase === 'playing') hideLobby(); else showLobbyChoice(); });
    bind('returnToLobbyBtn', returnToLobbyFromGame);
    bind('openLobbyBtn', () => sync.connected ? showRoomView() : showLobbyChoice());
    bind('syncDisconnectBtn', () => { try { sync.socket?.close(); } catch (_) {} sync.connected = false; sync.role = 'none'; showLobbyChoice(); updateUI(); });
    bind('syncNowBtn', () => { if (isHost()) { sendState('state'); persistState(); } });

    $('lobbyPlayerName')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLobbyProfile(); });
    $('hostPlayerName')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') createHostedLobby(); });
    $('joinPlayerName')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinHostedLobby(); });
    $('joinRoomCode')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinHostedLobby(); });
    $('lobbyPlayerTeam')?.addEventListener('change', () => { if (myPlayer()) submitLobbyProfile(); });
    $('lobbyTargetScore')?.addEventListener('input', () => { if (isHost()) { syncLobbySettingsToState(); updateUI(); sendState('state'); } });
    $('lobbyRoundTime')?.addEventListener('change', () => { if (isHost()) { syncLobbySettingsToState(); updateUI(); sendState('state'); } });
    $('lobbyDifficulty')?.addEventListener('change', () => { if (isHost()) { syncLobbySettingsToState(); sendState('state'); } });
    $('lobbyCategory')?.addEventListener('change', () => { if (isHost()) { syncLobbySettingsToState(); sendState('state'); } });
    $('publicRoomCheck')?.addEventListener('change', () => { if (isHost()) { syncLobbySettingsToState(); sendState('state'); } });
    $('publicRoomsItems')?.addEventListener('click', (e) => {
      const row = e.target.closest('.public-room-row');
      if (!row || !row.dataset.room) return;
      const input = $('joinRoomCode');
      if (input) input.value = row.dataset.room;
      joinHostedLobby();
    });

    $('brushSize')?.addEventListener('input', (e) => { state.brushSize = Number(e.target.value); updateUI(); });
    bind('penBtn', () => { if (!canDraw()) return; state.tool = 'pen'; });
    bind('eraserBtn', () => { if (!canDraw()) return; state.tool = 'eraser'; });
    bind('undoBtn', undo);
    bind('clearBtn', () => clearCanvas(true));
    bind('newWordsBtn', regenerateWordChoices);
    bind('saveImageBtn', saveImage);
    bind('newRoundBtn', () => { if (isHost()) nextTurn(); });
    bind('startPauseBtn', toggleTimer);
    bind('correctBtn', () => showToast(t('letsdraw.useGuess', {}, 'Bitte das Ratefeld verwenden.')));
    bind('skipBtn', () => { if (isHost()) nextTurn(); });
    bind('resetGameBtn', () => { if (isHost()) { resetGameStateForLobby(); sendState('state'); updateUI(); } });
    bind('addTeamBtn', addTeam);
    bind('saveCustomWordsBtn', saveCustomWords);
    bind('clearLogBtn', () => { if ($('log')) $('log').innerHTML = ''; });
    bind('closeModalBtn', closeRoundModal);
    bind('modalStartBtn', () => { closeRoundModal(); startTimer(); });
    bind('wordCard', () => { if (isDrawer() || isHost()) { state.wordVisible = !state.wordVisible; updateUI(); } });
    bind('exportBtn', exportGame);
    bind('importBtn', () => $('importFile')?.click());
    $('importFile')?.addEventListener('change', (e) => e.target.files?.[0] && importGame(e.target.files[0]));
    $('guessForm')?.addEventListener('submit', submitGuess);
    bind('rankingCloseBtn', hideEndRanking);
    bind('rankingAgainBtn', () => { if (isHost()) { state.phase = 'lobby'; showRoomView(); sendState('state'); } hideEndRanking(); });
    bind('rankingLobbyBtn', () => { hideEndRanking(); showRoomView(); });
    $('rankingOverlay')?.addEventListener('click', (e) => { if (e.target === $('rankingOverlay')) hideEndRanking(); });

    window.addEventListener('brettspiele-language-change', () => { I18N?.applyDomTranslations?.(document); updateUI(); });
  }

  function init() {
    ensurePlayModeControl();
    renderSwatches();
    bindEvents();
    applyAccountName();
    requestAnimationFrame(() => { resizeCanvas(false); updateUI(); });
    const intent = loadIntent();
    // A plain reload usually has no ?room= in the URL (only host/joinHostedLobby
    // push it there), so fall back to the saved intent's own room when the URL
    // doesn't carry one — otherwise every reload without a room param dumped the
    // player back to the lobby choice screen even mid-game.
    const resumableRoom = intent && (intent.role === 'host' || intent.role === 'guest')
      ? normalizeRoom(intent.room)
      : '';
    if (resumableRoom && (!initialRoomCode || resumableRoom === initialRoomCode)) {
      sync.role = intent.role;
      sync.room = resumableRoom;
      sync.playerName = intent.playerName || '';
      sync.playerTeamIndex = Number(intent.playerTeamIndex) || 0;
      // Reload soll NICHT ins Hauptmenü zurückwerfen: Wer zuvor beigetreten war,
      // wird beim Neuladen automatisch wieder angemeldet (startJoinRetry im
      // connect-open-Handler nutzt sync.joined). War der Beitritt noch nicht
      // abgeschlossen, bleibt er offen und der Gast tritt im Raum-View bewusst
      // bei. Läuft die Partie noch und er steckt im Host-Snapshot, resynct er
      // ohnehin nahtlos hinein.
      sync.joined = !!intent.joined;
      if ($('lobbyPlayerName')) $('lobbyPlayerName').value = sync.playerName;
      connect(sync.role, resumableRoom);
      showRoomView();
    } else if (initialRoomCode) {
      // Einladungslink: Raumcode ist bekannt, aber Name ggf. noch nicht. Nur
      // wenn bereits ein Name feststeht (Account/frühere Sitzung), direkt
      // beitreten; sonst das vorbelegte Beitreten-Formular zeigen, statt via
      // frühzeitigem Abbruch stumm im Menüformular hängen zu bleiben.
      showJoinForm(initialRoomCode);
      if (normalizeName($('joinPlayerName')?.value, '')) joinHostedLobby();
    } else {
      showLobbyChoice();
    }
    window.LetsDrawLobbyDebug = { state, sync, showHostForm, showJoinForm, createHostedLobby, joinHostedLobby, showRoomView, sendState };
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();

  // Beim Schließen/Verlassen des Tabs sofort abmelden (best effort — der
  // Präsenz-Timeout greift ohnehin, falls die Nachricht nicht mehr rausgeht,
  // z. B. bei einem Absturz statt eines sauberen Tab-Closes).
  window.addEventListener('pagehide', () => {
    if (sync.connected && sync.role !== 'none') send({ type: 'bye' });
  });
})();
