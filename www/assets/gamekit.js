/* GameKit — Grundfunktionen für Mehrspieler-Spiele auf brettspiele.fun.
 *
 * Warum es das gibt: Das Relay (relay.py) ist ein reiner Broadcast pro
 * `game:room` und kennt keinen Host, keine Spielerliste und keine Namen. Jedes
 * bestehende Spiel hat sich das deshalb selbst gebaut — mit dem Ergebnis, dass
 * es NIRGENDS eine Host-Weitergabe gibt: verlässt der Gastgeber die Runde,
 * steht sie. Dieses Modul erledigt das ein für alle Mal und wird neuen Spielen
 * automatisch mitgegeben (scaffold_new_game in codeterm.py).
 *
 * Was drin ist:
 *   · Raum anlegen/beitreten, Einladungslink, Raumcode aus der Adresszeile
 *   · Spielername automatisch (Konto → localStorage → „Spieler N")
 *   · Anwesenheitsliste mit Herzschlag, Ausscheiden nach Zeitablauf
 *   · HOST-WEITERGABE: fällt der Host aus, übernimmt deterministisch der
 *     nächste — ohne Server, ohne Absprache, ohne zwei Hosts
 *   · Spielstand verteilen und beim Beitreten/Übernehmen wiederherstellen
 *   · Automatischer Wiederaufbau der Verbindung
 *
 * Benutzung:
 *   const kit = GameKit.start({ game: "mein-spiel", onPlayers, onState });
 *   kit.setState({...})   // nur der Host; verteilt UND sichert serverseitig
 *   kit.send({t:"zug", ...})  // beliebiger Spieler
 */
(function (global) {
  "use strict";

  var HEARTBEAT_MS = 3000;    // wie oft „ich bin noch da"
  var PEER_TIMEOUT_MS = 9000; // ohne Lebenszeichen gilt ein Spieler als weg
  var HOST_GRACE_MS = 6000;   // so lange wird auf ein Lebenszeichen des Hosts gewartet
  var RECONNECT_MS = 1500;

  function uid() {
    // Sortierbar und eindeutig: der Zeitstempel vorne macht die Host-Wahl
    // stabil (wer am längsten da ist, übernimmt), der Zufall trennt Gleichstände.
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function roomCode() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // ohne I/O/0/1
    var out = "";
    for (var i = 0; i < 5; i++) out += abc[Math.floor(Math.random() * abc.length)];
    return out;
  }
  function readRoomFromUrl() {
    var p = new URLSearchParams(location.search);
    var r = p.get("room") || (location.hash.match(/[#&]room=([A-Za-z0-9]+)/) || [])[1] || "";
    return String(r).toUpperCase().slice(0, 12);
  }

  /* Name in dieser Reihenfolge: angemeldetes Konto → zuletzt benutzter Name →
     neutraler Platzhalter. Das Konto gewinnt, weil es der Name ist, unter dem
     einen die Mitspieler ohnehin kennen. */
  function autoName(gameId) {
    try {
      var st = global.BrettAuth && BrettAuth.getState && BrettAuth.getState();
      if (st && st.authenticated && st.user) {
        var n = String(st.user.displayName || st.user.username || "").trim();
        if (n) return n.slice(0, 24);
      }
    } catch (e) {}
    try {
      var saved = localStorage.getItem("gamekit." + gameId + ".name");
      if (saved && saved.trim()) return saved.trim().slice(0, 24);
    } catch (e) {}
    return "Spieler " + (1 + Math.floor(Math.random() * 89));
  }

  function start(opts) {
    opts = opts || {};
    var gameId = String(opts.game || "spiel");
    var kit = {
      game: gameId,
      room: (opts.room || readRoomFromUrl() || roomCode()).toUpperCase(),
      me: { id: uid(), name: opts.name || autoName(gameId), since: Date.now() },
      host: false,
      connected: false,
      state: opts.initialState || {},
      peers: {}   // id → {id, name, since, host, lastSeen}
    };
    var ws = null, hbTimer = null, reconnectTimer = null, lastHostSeen = 0, claimTimer = null;

    function emit(name, a, b) {
      var fn = opts["on" + name];
      if (typeof fn === "function") { try { fn(a, b); } catch (e) { console.error(e); } }
    }
    function send(obj) {
      if (!ws || ws.readyState !== 1) return false;
      obj.game = gameId; obj.room = kit.room; obj.from = kit.me.id;
      try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    }

    /* ── Anwesenheit ── */
    function alivePeers() {
      var now = Date.now(), out = [];
      Object.keys(kit.peers).forEach(function (id) {
        if (now - kit.peers[id].lastSeen <= PEER_TIMEOUT_MS) out.push(kit.peers[id]);
      });
      return out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    }
    function players() {
      var mine = { id: kit.me.id, name: kit.me.name, since: kit.me.since, host: kit.host, me: true };
      var list = alivePeers().filter(function (p) { return p.id !== kit.me.id; })
                            .map(function (p) { return { id: p.id, name: p.name, since: p.since, host: !!p.host, me: false }; });
      list.push(mine);
      return list.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    }
    function announcePlayers() { emit("Players", players(), kit); }

    function heartbeat() {
      send({ type: "hello", name: kit.me.name, since: kit.me.since, host: kit.host });
      var now = Date.now();
      // Abgelaufene Mitspieler entfernen und die Runde darüber informieren.
      var before = alivePeers().length;
      Object.keys(kit.peers).forEach(function (id) {
        if (now - kit.peers[id].lastSeen > PEER_TIMEOUT_MS) delete kit.peers[id];
      });
      if (alivePeers().length !== before) announcePlayers();
      maybeClaimHost();
    }

    /* ── Host-Weitergabe ──
       Kein Server entscheidet das. Jeder Teilnehmer prüft: ist seit
       HOST_GRACE_MS ein Host zu sehen? Wenn nicht, übernimmt derjenige mit der
       KLEINSTEN ID unter den Anwesenden — die IDs beginnen mit dem
       Beitrittszeitpunkt, also übernimmt, wer am längsten dabei ist. Weil alle
       dieselbe Liste und dieselbe Regel haben, kommt genau einer zum Zug. */
    function maybeClaimHost() {
      if (kit.host) return;
      if (Date.now() - lastHostSeen < HOST_GRACE_MS) return;
      var candidates = alivePeers().map(function (p) { return p.id; }).concat([kit.me.id]).sort();
      if (candidates[0] !== kit.me.id) return;
      becomeHost(true);
    }
    function becomeHost(takeover) {
      if (kit.host) return;
      kit.host = true;
      lastHostSeen = Date.now();
      send({ type: "hello", name: kit.me.name, since: kit.me.since, host: true });
      // Der neue Host verteilt sofort den Stand, den er hat — sonst wäre für
      // Beitretende unklar, wer gerade die Wahrheit besitzt.
      if (kit.state && Object.keys(kit.state).length) pushState();
      announcePlayers();
      emit("Host", { takeover: !!takeover }, kit);
    }

    /* ── Spielstand ── */
    function pushState() {
      // type "state" mit snapshot: das Relay legt ihn ab und spielt ihn
      // Beitretenden von sich aus als "sessionState" wieder ein.
      send({ type: "state", snapshot: kit.state });
    }
    kit.setState = function (next) {
      kit.state = next || {};
      if (kit.host) pushState();
      emit("State", kit.state, { local: true, host: kit.host });
    };
    kit.send = function (op) {
      var m = { type: "op", op: op };
      send(m);
      return m;
    };
    kit.setName = function (name) {
      kit.me.name = String(name || "").trim().slice(0, 24) || kit.me.name;
      try { localStorage.setItem("gamekit." + gameId + ".name", kit.me.name); } catch (e) {}
      send({ type: "hello", name: kit.me.name, since: kit.me.since, host: kit.host });
      announcePlayers();
    };
    kit.inviteLink = function () {
      return location.origin + location.pathname + "?room=" + encodeURIComponent(kit.room);
    };
    kit.players = players;

    /* ── Verbindung ── */
    function handle(msg) {
      if (!msg || msg.from === kit.me.id) return;   // eigene Nachrichten ignorieren
      if (msg.type === "sessionState" && msg.snapshot) {
        // Vom Server beim Beitreten: bisheriger Stand der Runde.
        kit.state = msg.snapshot;
        emit("State", kit.state, { local: false, restored: true });
        return;
      }
      if (msg.from) {
        var p = kit.peers[msg.from] || (kit.peers[msg.from] = { id: msg.from, name: "", since: 0, host: false });
        p.lastSeen = Date.now();
        if (msg.name) p.name = String(msg.name).slice(0, 24);
        if (msg.since) p.since = msg.since;
        if (msg.type === "hello") {
          var wasHost = p.host;
          p.host = !!msg.host;
          if (p.host) {
            lastHostSeen = Date.now();
            // Zwei Hosts können nur kurz gleichzeitig auftreten (Netzriss);
            // es gewinnt die kleinere ID, der andere tritt zurück.
            if (kit.host && msg.from < kit.me.id) {
              kit.host = false;
              emit("Host", { takeover: false, resigned: true }, kit);
            }
          }
          if (wasHost !== p.host) announcePlayers();
          else announcePlayers();
          return;
        }
      }
      if (msg.type === "bye") { delete kit.peers[msg.from]; announcePlayers(); return; }
      if (msg.type === "state" && msg.snapshot) {
        kit.state = msg.snapshot;
        emit("State", kit.state, { local: false, host: false });
        return;
      }
      if (msg.type === "op") { emit("Op", msg.op, msg.from); return; }
      emit("Message", msg, msg.from);
    }

    function connect() {
      var proto = location.protocol === "https:" ? "wss://" : "ws://";
      ws = new WebSocket(proto + location.host + "/ws");
      ws.onopen = function () {
        kit.connected = true;
        emit("Connection", { connected: true }, kit);
        // "join" lässt sich das Relay als Anlass nehmen, den gesicherten Stand
        // zu schicken; "hello" macht uns bei den Mitspielern bekannt.
        send({ type: "join", name: kit.me.name });
        send({ type: "hello", name: kit.me.name, since: kit.me.since, host: kit.host });
        // Ist außer uns niemand da, werden wir nach der Gnadenfrist Host.
        clearTimeout(claimTimer);
        claimTimer = setTimeout(maybeClaimHost, HOST_GRACE_MS);
        announcePlayers();
      };
      ws.onmessage = function (ev) {
        var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        handle(msg);
      };
      ws.onclose = function () {
        kit.connected = false;
        emit("Connection", { connected: false }, kit);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };
      ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }

    kit.leave = function () {
      send({ type: "bye" });
      clearInterval(hbTimer); clearTimeout(reconnectTimer); clearTimeout(claimTimer);
      if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} }
      kit.connected = false;
    };
    // Beim Schließen des Tabs abmelden, damit die Runde nicht auf ein
    // Zeitfenster warten muss, um den Host neu zu wählen.
    global.addEventListener("pagehide", function () { try { send({ type: "bye" }); } catch (e) {} });

    connect();
    hbTimer = setInterval(heartbeat, HEARTBEAT_MS);
    // Kontoanmeldung kann nach dem Start eintreffen — Namen dann nachziehen.
    global.addEventListener("brettspiele-auth-change", function () {
      var n = autoName(gameId);
      if (n && n !== kit.me.name && !opts.name) kit.setName(n);
    });
    return kit;
  }

  global.GameKit = { start: start, autoName: autoName, roomCode: roomCode };
})(window);
