const SAVE_PREFIX = "warbound_save_";
const OPTS_KEY    = "warbound_options";
let gameMode      = "sp";

function gameConfirm(msg, onYes) {
  var ov  = document.getElementById('gameConfirmOverlay');
  var msgEl = document.getElementById('gcMsg');
  var yBtn  = document.getElementById('gcConfirmBtn');
  var nBtn  = document.getElementById('gcCancelBtn');
  if(!ov) { if(onYes && confirm(msg)) onYes(); return; }
  msgEl.textContent = msg;
  ov.removeAttribute('hidden');
  function close(){ ov.setAttribute('hidden',''); }
  yBtn.onclick = function(){ close(); onYes(); };
  nBtn.onclick = function(){ close(); };
}

function goScreen(id){
  // Beim Verlassen des Spielbildschirms (Sieg, Menü, Verbindungsabbruch) ein noch
  // offenes Kampf-Overlay zwingend abbauen — sonst blieb das Angriffs-/Verteidigungs-
  // Interface über der Lobby/dem Menü sichtbar hängen, wenn das Spiel mitten im
  // Kampf endete.
  if(id !== 'game'){
    const _ov = document.getElementById("battle-overlay");
    if(_ov && _ov.classList.contains("show")){
      _ov.classList.remove("show");
      autoRolling = false;
      battleCtx = null; _battleHighlight = null;
      const _dp = document.getElementById("defensePanel"); if(_dp){ _dp.style.display = "none"; _dp.innerHTML = ""; }
    }
  }
  document.querySelectorAll(".scene").forEach(s=>s.classList.remove("active"));
  const el=document.getElementById(id);
  if(el) el.classList.add("active");
  window.BrettSounds?.startMusic?.();
  if(id==="mainMenu"){
    const n=listSaves("all").length;
    const h=document.getElementById("mainSaveHint");
    if(h) h.textContent = n===0 ? "Keine gespeicherte Partie" : (n+" gespeicherte "+(n===1?"Partie":"Partien"));
  }
  /* Lobby über einen Seiten-Reload retten: beim Betreten sichern, beim Verlassen
     räumen (siehe wbPersistLobbyState / STARTUP-Restore weiter unten). */
  if(id==='lobby') wbPersistLobbyState();
  else wbClearLobbyState();
}
/* ── Lobby-Zustand über einen normalen Seiten-Reload retten ────────────────
   lobbyPlayers liegt nur im Speicher; ohne diese Sicherung landete man nach
   einem Reload in der Lobby wieder im Hauptmenü. Wir sichern die LOKALE Lobby
   (kein Online-Raum) laufend in sessionStorage und stellen sie beim Start wieder
   her (STARTUP-Block). Online-Lobbys (sync.role != 'none') lassen sich ohne
   Neu-Verbindung nicht wiederherstellen und bleiben außen vor. */
function wbPersistLobbyState(){
  try{
    if(typeof sync !== 'undefined' && sync.role !== 'none') return;   // nur lokale Lobbys
    if(!Array.isArray(lobbyPlayers) || !lobbyPlayers.length) return;
    const _wc = document.getElementById('winCondition');
    const _rm = document.getElementById('ruleMode');
    sessionStorage.setItem('warbound.lobbyReturn', JSON.stringify({
      mode: (typeof gameMode !== 'undefined' ? gameMode : 'sp'),
      players: lobbyPlayers,
      winCondition: _wc ? _wc.value : null,
      ruleMode: _rm ? _rm.value : null
    }));
  }catch(e){}
}
function wbClearLobbyState(){
  try{ sessionStorage.removeItem('warbound.lobbyReturn'); }catch(e){}
}
// Shared back button (game-chrome.js): walk Warbound's scene stack one level
// up. Only the main menu is the top — from the lobby / join / load / how-to /
// a live match the button returns to mainMenu in-page instead of the site.
window.__brettBack={
  atTop:function(){
    const a=document.querySelector('.scene.active');
    return !a || a.id==='mainMenu';
  },
  up:function(){
    const a=document.querySelector('.scene.active');
    if(a && a.id==='game'){
      // Route through the in-game menu button so a running match is saved
      // (and confirmed) before leaving to the main menu.
      const b=document.getElementById('gmMainMenuBtn');
      if(b){ b.click(); return; }
    }
    goScreen('mainMenu');
  }
};
function joinGameByCode(code){
  const inp=document.getElementById("joinCode");
  const status=document.getElementById("joinStatus");
  if(!status) return;
  code = (code || (inp&&inp.value) || "").trim().toUpperCase();
  if(!code){ status.style.color="#e08a8a"; status.textContent="Bitte zuerst einen Spiel-Code eingeben."; return; }
  if(inp) inp.value = code;
  const nameInp = document.getElementById("joinName");
  sync.guestName = ((nameInp && nameInp.value) || "Spieler").trim().slice(0,22) || "Spieler";
  status.style.color="var(--gold2)";
  status.textContent="Verbinde mit Partie \u201E"+code+"\u201C \u2026";
  wbConnect('guest', code);
}
document.addEventListener('DOMContentLoaded', () => {
  const jc = document.getElementById('joinCode');
  if(jc) jc.addEventListener('keydown', e => { if(e.key === 'Enter') joinGameByCode(); });
  // Start the public-rooms polling only after the whole script has evaluated.
  // wbStartPublicRoomsPolling() reaches wbStopPublicRoomsPolling(), which reads
  // `wbPublicRoomsTimer` — a `let` declared further down. Calling it at module
  // eval time (before that declaration runs) hit the temporal dead zone and
  // threw, aborting game.js before the THREE renderer was ever created — i.e.
  // a fully black screen on every load. DOMContentLoaded fires after eval.
  wbStartPublicRoomsPolling();
  document.getElementById('wbPublicRoomsItems')?.addEventListener('click', e => {
    const row = e.target.closest('.public-room-row');
    if(!row || !row.dataset.room) return;
    joinGameByCode(row.dataset.room);
  });
});
function refreshSaveHint(mode){
  const n=listSaves(mode).length;
  const el=document.getElementById(mode+"SaveHint");
  if(el) el.textContent=n===0?"Keine Spielstände vorhanden":`${n} ${n===1?"Spielstand":"Spielstände"} vorhanden`;
}
function startNewGame(mode){
  gameMode=mode;
  lobbyPlayers=mode==="sp"?[
    {name:"Du",          faction:"valen",   type:"human"},
    {name:"Bot Mordrek", faction:"mordrek", type:"bot-easy"},
    {name:"Bot Dravik",  faction:"dravik",  type:"bot-easy"}
  ]:[
    {name:"Spieler 1", faction:"valen",   type:"human"},
    {name:"Spieler 2", faction:"mordrek", type:"human"}
  ];
  renderLobby();
  goScreen("lobby");
}
function openLoadScreen(mode){
  const eyebrow = (mode==="sp") ? "Einzelspieler · Spielstände"
    : (mode==="mp") ? "Mehrspieler · Spielstände" : "Spielstände";
  document.getElementById("loadEyebrow").textContent = eyebrow;
  document.getElementById("loadBackBtn").onclick = () => goScreen("mainMenu");
  renderSavesList(mode);
  goScreen("loadScreen");
}
function listSaves(mode){
  const saves=[];
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!key.startsWith(SAVE_PREFIX)) continue;
      try{const obj=JSON.parse(localStorage.getItem(key));if(!obj?.data)continue;if(mode&&mode!=="all"&&obj.mode!==mode)continue;saves.push({key,...obj});}catch(e){}
    }
  }catch(e){ /* localStorage nicht verfügbar (z. B. Privatmodus) */ }
  return saves.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
}
function renderSavesList(mode){
  const wrap=document.getElementById("savesList"),saves=listSaves(mode);
  if(!saves.length){wrap.innerHTML=`<div class="saves-empty"><span class="sv-emoji">📜</span>Noch keine Spielstände.<br><small>Im Spiel über 💾 speichern.</small></div>`;return;}
  wrap.innerHTML=saves.map(s=>{
    const d=s.date?new Date(s.date):null;
    const ds=d?`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:"—";
    return `<div class="save-item" data-k="${s.key}"><div class="sv-seal">${(s.name||"S").charAt(0).toUpperCase()}</div><div class="sv-info"><div class="sv-name">${s.name||"Unbenannt"}</div><div class="sv-meta">Runde ${s.round||1} · ${s.players||0} Spieler · ${ds}</div></div><button class="sv-rm" data-k="${s.key}">✕</button></div>`;
  }).join("");
  wrap.querySelectorAll(".save-item").forEach(el=>el.addEventListener("click",e=>{if(e.target.classList.contains("sv-rm"))return;loadGameFromKey(el.dataset.k);}));
  wrap.querySelectorAll(".sv-rm").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();if(confirm("Spielstand löschen?")){localStorage.removeItem(el.dataset.k);renderSavesList(mode);}}));
}
function getOptions(){
  try{return{...{startTroops:25,startGold:3,botDifficulty:"bot-easy",autosave:false,animations:true,troopFigures:false},...JSON.parse(localStorage.getItem(OPTS_KEY)||"{}")};}
  catch(e){return{startTroops:25,startGold:3,botDifficulty:"bot-easy",autosave:false,animations:true,troopFigures:false};}
}
function loadOptionsUI(){
  const o=getOptions();
  const as=document.getElementById("optAutoSave"); if(as) as.classList.toggle("on",!!o.autosave);
  const an=document.getElementById("optAnim");     if(an) an.classList.toggle("on",!!o.animations);
  const tf=document.getElementById("optTroopFigures"); if(tf) tf.classList.toggle("on",o.troopFigures!==false);
}
function _readOptions(){
  const tf=document.getElementById("optTroopFigures");
  return {
    autosave:   !!(document.getElementById("optAutoSave") && document.getElementById("optAutoSave").classList.contains("on")),
    animations: !!(document.getElementById("optAnim")     && document.getElementById("optAnim").classList.contains("on")),
    troopFigures: tf ? tf.classList.contains("on") : true
  };
}
function saveOptions(){
  localStorage.setItem(OPTS_KEY,JSON.stringify(_readOptions()));
  toast("✓ Einstellungen gespeichert");
}
/* Stilles Speichern (ohne Toast) — für die Optionen direkt in der Lobby. */
function persistOptions(){
  try{ localStorage.setItem(OPTS_KEY,JSON.stringify(_readOptions())); }catch(e){}
}
function resetOptions(){if(!confirm("Einstellungen zurücksetzen?"))return;localStorage.removeItem(OPTS_KEY);loadOptionsUI();toast("Zurückgesetzt");}
document.querySelectorAll(".toggle").forEach(t=>t.addEventListener("click",()=>t.classList.toggle("on")));
/* Optionen werden jetzt direkt in der Lobby angezeigt und bei jeder Änderung
   still gespeichert (kein separates Optionsmenü mehr). */
(function(){
  ["optAutoSave","optAnim","optTroopFigures"].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener("click", persistOptions); });
  loadOptionsUI();
})();
function saveCurrentGame(){
  if(!G){toast("Kein laufendes Spiel");return;}
  const key  = currentGameId ? SAVE_PREFIX+'g_'+currentGameId : SAVE_PREFIX+Date.now();
  const name = `Runde ${G.round} · ${currentPlayer() ? FACTIONS[currentPlayer().faction].name : '?'}`;
  try{
    localStorage.setItem(key, JSON.stringify({name:name.slice(0,60),mode:gameMode,date:new Date().toISOString(),round:G.round,players:G.players.length,factions:G.players.map(p=>p.faction),data:G}));
    toast('✓ Gespeichert');
  }catch(e){toast("Fehler beim Speichern");}
}
function loadGameFromKey(key){
  try{
    const obj=JSON.parse(localStorage.getItem(key));
    if(!obj?.data){toast("Ungültiger Spielstand");return;}
    G=obj.data;gameMode=obj.mode||"sp";
    // Set/restore game URL
    const gPrefix = SAVE_PREFIX+'g_';
    if(key.startsWith(gPrefix)){
      currentGameId = key.slice(gPrefix.length);
    } else {
      currentGameId = generateGameId();
      // Migrate: move old save to new URL-keyed slot
      localStorage.setItem(SAVE_PREFIX+'g_'+currentGameId, localStorage.getItem(key)||'');
    }
    setGameInUrl(currentGameId);
    _relinkTerritoryStates();
    mapVB={x:0,y:0,w:340,h:270};
    goScreen("game");
    renderMap();
    initMapControls();
    updateHUD();
    toast(`✓ Geladen: ${obj.name}`);
    if(currentPlayer()?.type!=="human")setTimeout(runBotTurn,800);
  }catch(e){
    // Ohne Aufräumen bliebe die defekte ?g=-URL samt Spielstand bestehen —
    // jeder weitere Reload würde dann denselben Fehler erneut auslösen
    // ("kommt IMMER ein Fehler"). Defekten Spielstand entfernen, zurück ins
    // Hauptmenü, und den eigentlichen Fehler für die Diagnose loggen.
    console.error('[warbound] Spielstand konnte nicht geladen werden:', e);
    try{ localStorage.removeItem(key); }catch(_){}
    G = null; currentGameId = null; clearGameUrl();
    toast("Fehler beim Laden — Spielstand war beschädigt und wurde entfernt");
    goScreen("mainMenu");
  }
}
function autosave(){
  if(!G) return;
  if(currentGameId){
    // Always auto-save to the game's URL key
    try{localStorage.setItem(SAVE_PREFIX+'g_'+currentGameId, JSON.stringify({name:`Auto · Runde ${G.round}`,mode:gameMode,date:new Date().toISOString(),round:G.round,players:G.players.length,factions:G.players.map(p=>p.faction),data:G}));}catch(e){}
  } else if(getOptions().autosave){
    try{localStorage.setItem(SAVE_PREFIX+"auto_"+gameMode,JSON.stringify({name:"Auto-Speichern",mode:gameMode,date:new Date().toISOString(),round:G.round,players:G.players.length,factions:G.players.map(p=>p.faction),data:G}));}catch(e){}
  }
}

"use strict";

/* ===== KARTEN DES HOHEN RATES (Referenz — Effekte via Charakterkarten) ===== */
const SIEGELKARTEN = [
  {type:"attack",  cost:3, name:"Siegel des Sturms",      effect:"Spiele diese Karte vor einem Angriff. Du darfst einen deiner Angriffswürfel neu würfeln."},
  {type:"attack",  cost:3, name:"Siegel der Klinge",       effect:"Wenn du diesen Kampf gewinnst, verliert der Verteidiger 1 zusätzliche Einheit."},
  {type:"attack",  cost:3, name:"Siegel des Durchbruchs",  effect:"Nach einer erfolgreichen Eroberung darfst du sofort ein weiteres angrenzendes Gebiet angreifen."},
  {type:"attack",  cost:3, name:"Siegel des Blutmonds",    effect:"In diesem Kampf gewinnt dein höchster Angriffswürfel bei Gleichstand gegen den höchsten Verteidigungswürfel."},
  {type:"attack",  cost:3, name:"Sturmangriff",            effect:"Du darfst diesen Kampf mit 4 Angriffswürfeln führen. Der niedrigste wird gestrichen."},
  {type:"attack",  cost:3, name:"Siegel des Verräters",    effect:"Wähle ein feindliches Gebiet mit 1 Einheit. Es wird kampflos deinem Reich eingegliedert."},
  {type:"attack",  cost:3, name:"Kriegstrommel",           effect:"Alle deine Angriffe in dieser Runde kosten den Verteidiger 1 Extraeinheit bei Niederlage."},
  {type:"attack",  cost:3, name:"Siegel des Feuers",       effect:"Dein Angriff ignoriert den Turmbonus des Verteidigers."},
  {type:"attack",  cost:3, name:"Siegel des Eisens",       effect:"Platziere vor dem Kampf 2 Einheiten im angreifenden Gebiet."},
  {type:"attack",  cost:3, name:"Blutpakt",                effect:"Opfere 2 eigene Einheiten. Dein Ziel verliert sofort 3 Einheiten."},
  {type:"attack",  cost:3, name:"Siegel des Jägers",       effect:"Du darfst ein nicht angrenzendes Gebiet angreifen, das nur 1 Einheit hat."},
  {type:"attack",  cost:3, name:"Kriegsrat",               effect:"Würfle alle Angriffswürfel neu. Du must das neue Ergebnis nehmen."},
  {type:"attack",  cost:3, name:"Siegel der Vergeltung",   effect:"Wird dein Angriff abgewehrt, darfst du sofort erneut angreifen."},
  {type:"attack",  cost:3, name:"Siegel des Kommandeurs",  effect:"+1 auf deinen höchsten Angriffswürfel (max. 6)."},
  {type:"attack",  cost:3, name:"Schwarze Fahne",          effect:"Kein Gebiet darf dir in dieser Runde durch Charakterkarten verteidigt werden."},
  {type:"attack",  cost:3, name:"Siegel der Kaperfahrt",   effect:"Solange du diese Runde einen Hafen besitzt, darfst du von dort jedes Küstengebiet angreifen — auch ohne gemeinsame Grenze und unabhängig von einem eigenen Hafen dort."},
  {type:"defense", cost:2, name:"Siegel des Schildes",     effect:"Spiele diese Karte vor der Verteidigung. Alle deine Verteidigungswürfel erhalten +1 (max. 6)."},
  {type:"defense", cost:2, name:"Siegel der Mauer",        effect:"Der Angreifer darf in diesem Kampf maximal 2 Würfel einsetzen."},
  {type:"defense", cost:2, name:"Siegel des Rückzugs",     effect:"Verlasse den Kampf ohne Verluste. Das Gebiet wird neutral (1 Einheit)."},
  {type:"defense", cost:2, name:"Siegel des Wächters",     effect:"Verdopple deine Verteidigungseinheiten für diesen Kampf (nur für Würfelanzahl)."},
  {type:"defense", cost:2, name:"Eiserner Wille",          effect:"Verliere in diesem Kampf höchstens 1 Einheit, egal wie die Würfel fallen."},
  {type:"defense", cost:2, name:"Siegel des Burggrabens",  effect:"Der Angreifer verliert automatisch 1 Einheit vor Kampfbeginn."},
  {type:"defense", cost:2, name:"Siegel der Festung",      effect:"Dieses Gebiet gilt für diesen Kampf als hätte es einen Turm."},
  {type:"defense", cost:2, name:"Siegel des Spiegels",     effect:"Tausche deine und die gegnerischen Würfelergebnisse für diesen Kampf."},
  {type:"defense", cost:2, name:"Siegel des letzten Manns",effect:"Hast du nur 1 Einheit, greife mit 2 Würfeln zurück."},
  {type:"defense", cost:2, name:"Siegel der Stille",       effect:"Der Angreifer darf in diesem Kampf keine Karten spielen."},
  {type:"defense", cost:2, name:"Siegel des Hinterhalts",  effect:"Vor dem Kampf darfst du 2 Einheiten aus einem angrenzenden eigenen Gebiet ins Verteidigungsgebiet verlegen."},
  {type:"defense", cost:2, name:"Treueschwur",             effect:"Alle angrenzenden eigenen Gebiete schicken je 1 Einheit zur Verstärkung."},
  {type:"defense", cost:2, name:"Siegel des Donners",      effect:"Gewinne ich die Verteidigung, erhält der Angreifer keine Karte für diesen Zug."},
  {type:"supply",  cost:2, name:"Siegel der Ernte",        effect:"Platziere sofort 2 Einheiten in deinem stärksten Gebiet."},
  {type:"supply",  cost:2, name:"Siegel des Handels",      effect:"Tausche diese Karte gegen 2 Karten deiner Wahl aus dem Ablagestapel."},
  {type:"supply",  cost:2, name:"Siegel der Schmiede",     effect:"Platziere sofort 2 Einheiten in einem deiner Gebiete."},
  {type:"supply",  cost:2, name:"Siegel des Wachstums",    effect:"Für jede vollständige Region unter deiner Kontrolle erhältst du 1 Extra-Einheit diesen Zug."},
  {type:"supply",  cost:2, name:"Kriegskasse",             effect:"Platziere 1 Einheit + 1 je diese Runde erobertem Gebiet (max 4) in deinem stärksten Gebiet."},
  {type:"supply",  cost:2, name:"Siegel der Fülle",        effect:"Ziehe 2 Karten vom Stapel."},
  {type:"supply",  cost:2, name:"Siegel des Schmugglerkönigs",effect:"Ziehe einem feindlichen Gebiet 2 Einheiten ab (mind. 1 bleibt)."},
  {type:"supply",  cost:2, name:"Siegel des Aufbaus",      effect:"Errichte kostenlos einen Turm oder Ritter in einem deiner Gebiete."},
  {type:"supply",  cost:2, name:"Siegel der Heerschau",    effect:"Platziere sofort 3 Einheiten in deinem stärksten Gebiet."},
  {type:"event",   cost:2, name:"Siegel des Erdbebens",    effect:"Zerstöre alle Spezialmarker (Türme, Ritter, Belagerungen) in einem gewählten Gebiet."},
  {type:"event",   cost:2, name:"Siegel der Pest",         effect:"Jedes Gebiet mit 4+ Einheiten verliert 1 Einheit (alle Spieler betroffen)."},
  {type:"event",   cost:2, name:"Siegel der Allianz",      effect:"Wähle einen Mitspieler. Ihr seid für 1 Runde verbündet (greift euch nicht an)."},
  {type:"event",   cost:2, name:"Siegel des Verrats",      effect:"Wähle ein gegnerisches Gebiet mit 1 Einheit. Es wechselt sofort in deinen Besitz."},
  {type:"event",   cost:2, name:"Siegel der Dürre",        effect:"Kein Spieler erhält in dieser Runde Einkommens-Bonus durch Regionen."},
  {type:"event",   cost:2, name:"Siegel des Sturms II",    effect:"Alle Angriffe in dieser Runde werden mit 1 Würfel weniger geführt."},
  {type:"event",   cost:2, name:"Siegel der Wiedergeburt", effect:"Hole dir eine zufällige Karte vom Ablagestapel zurück auf die Hand."},
  {type:"event",   cost:2, name:"Siegel des Botschafters", effect:"Tausche eine Handkarte mit einem beliebigen Mitspieler."},
  {type:"event",   cost:2, name:"Siegel der Prophezeiung", effect:"Sieh die obersten 3 Karten des Stapels. Lege sie in beliebiger Reihenfolge zurück."},
  {type:"event",   cost:2, name:"Siegel des Kometen",      effect:"Der Spieler mit den meisten Gebieten verliert 2 Einheiten aus einem Gebiet deiner Wahl."},
  {type:"event",   cost:2, name:"Siegel des Ausgleichs",   effect:"Der Spieler mit den wenigsten Gebieten erhält 3 Einheiten gratis."},
  {type:"event",   cost:2, name:"Schwarzer Regen",         effect:"Alle Spieler discarden 1 Handkarte ihrer Wahl."},
  {type:"event",   cost:2, name:"Siegel der Erschöpfung",  effect:"Ein Spieler deiner Wahl überspringt seine Angriffphase."},
  {type:"event",   cost:2, name:"Siegel der Wanderung",    effect:"Versetze bis zu 3 eigene Einheiten in ein beliebiges eigenes Gebiet."},
  {type:"shadow",  cost:3, name:"Siegel des Schattens",    effect:"Spiele diese Karte verdeckt. Aufdecken: Der Angreifer verliert 1 Würfel."},
  {type:"shadow",  cost:3, name:"Siegel des Doppelgängers",effect:"Kopiere den Effekt der zuletzt gespielten Karte eines Mitspielers."},
  {type:"shadow",  cost:3, name:"Siegel der Nacht",        effect:"Spiele diese Karte zu Beginn deines Zugs. Du spielst diese Runde verborgen — niemand sieht deine Würfelergebnisse."},
  {type:"shadow",  cost:3, name:"Siegel des Diebstahls",   effect:"Stehle eine zufällige Handkarte von einem Mitspieler."},
  {type:"shadow",  cost:3, name:"Siegel des Nebelläufers", effect:"Bewege Einheiten durch 1 feindliches Gebiet hindurch, als wäre es eines deiner eigenen."},
  {type:"shadow",  cost:3, name:"Siegel des Assassinen",   effect:"Entferne 1 Einheit aus einem beliebigen feindlichen Gebiet ohne Kampf."},
  {type:"shadow",  cost:3, name:"Siegel des Lauschers",    effect:"Sieh die komplette Hand eines Mitspielers deiner Wahl."},
  {type:"shadow",  cost:3, name:"Siegel der falschen Fahne",effect:"Ein feindliches Gebiet greift in dieser Runde nicht an (Spieler deiner Wahl)."},
  {type:"shadow",  cost:3, name:"Siegel des Spions",       effect:"Sieh die obersten 2 Karten des Stapels und behalte 1 davon."},
  {type:"shadow",  cost:3, name:"Siegel des Chaos",        effect:"Mische alle Handkarten aller Spieler und verteile sie zufällig neu."},
  {type:"shadow",  cost:3, name:"Siegel des Verhängnisses",effect:"Wähle ein Gebiet. Sein Besitzer muss am Ende seines nächsten Zuges 2 Einheiten von dort abziehen."},
];



/* ===== DATA: FRACTIONS — 7 Häuser der Valcaryn-Karte ===== */
const FACTIONS = {
  valen:    {key:"valen",    name:"Haus Valen",    color:"#a83838", sigil:"🦁", motto:"Blut und Ehre vereint", style:"Aggressiv, kampfstark, fest in der Schlacht."},
  mordrek:  {key:"mordrek",  name:"Haus Mordrek",  color:"#c89738", sigil:"👑", motto:"Im Glanz der Krone",   style:"Gold, Ordnung und flexible Kontrolle."},
  dravik:   {key:"dravik",   name:"Haus Dravik",   color:"#7a7a7a", sigil:"⚒",  motto:"Im Schmelzofen geschmiedet", style:"Belagerung, Maschinen, brutaler Druck."},
  aerlund:  {key:"aerlund",  name:"Haus Aerlund",  color:"#4d88c4", sigil:"🦅", motto:"Aus Eis erwächst Stahl", style:"Defensiv, zäh, schwer zu vertreiben."},
  sylverin: {key:"sylverin", name:"Haus Sylverin", color:"#57a24f", sigil:"🌳", motto:"Aus Wurzeln zur Wildnis", style:"Bewegung, Hinterhalte, flexible Linien."},
  kael:     {key:"kael",     name:"Haus Kael",     color:"#8a5ca8", sigil:"🗡", motto:"Im Schatten siegen wir",  style:"Sabotage, Verrat, schmutzige Tricks."},
  vorthan:  {key:"vorthan",  name:"Haus Vorthan",  color:"#d2843a", sigil:"☀",  motto:"Sand vergisst kein Blut", style:"Wüstenreiter, schnell und gnadenlos."}
};

/* ===== CHARACTER CARDS — 4 pro Haus ===== */
const CHARACTER_CARDS = {
  valen: [
    {name:"Roter Drache",     cost:3, timing:"Vor Angriff",          role:"Anführer",    effect:"Opfere 1 Armee. Dafür +1 auf alle Angriffswürfel diesen Kampf (max 7)."},
    {name:"Schwertschwester", cost:2, timing:"Nach gew. Kampf",      role:"Priesterin",  effect:"Platziere 1 Armee im eroberten Gebiet."},
    {name:"Wüter",            cost:1, timing:"Vor Angriff",          role:"Krieger",     effect:"+1 Angriffswürfel. Niedrigster Wurf wird ignoriert."},
    {name:"Leibgarde",        cost:2, timing:"Wenn angegriffen",     role:"Wache",       effect:"Erhöhe deinen höchsten Verteidigungswurf um +1 (max 7)."}
  ],
  mordrek: [
    {name:"Eiserne Königin", cost:2, timing:"Verstärkung",          role:"Anführerin",  effect:"+2 Verstärkungs-Einheiten pro Runde, wenn du eine vollständige Region kontrollierst."},
    {name:"Quartiermeister", cost:1, timing:"Verstärkung",          role:"Logistik",    effect:"+1 zusätzliche Verstärkungs-Einheit pro Runde."},
    {name:"Kronritter",      cost:2, timing:"Vor Kampf",            role:"Krieger",     effect:"Erhöhe einen eigenen Würfel um +1 (max 7)."},
    {name:"Ordenshüter",     cost:2, timing:"Wenn angegriffen",     role:"Wächter",     effect:"Der Angreifer würfelt in diesem Kampf mit 1 Würfel weniger."}
  ],
  dravik: [
    {name:"Schmiedekönig",    cost:3, timing:"Verstärkung",          role:"Anführer",    effect:"Platziere 1 Katapult in einem eigenen Gebiet."},
    {name:"Belagerer",        cost:3, timing:"Vor Angriff",          role:"Belagerung",  effect:"Ersetze einen Angriffswürfel durch einen W8."},
    {name:"Festungsvogt",     cost:2, timing:"Wenn angegriffen",     role:"Burgvogt",    effect:"Verteidigt diesen Kampf wie mit einem Turm (W8 statt W6)."},
    {name:"Kanonierin",       cost:2, timing:"Vor Angriff",          role:"Artillerie",  effect:"Beim ersten Gleichstand gewinnt der Angreifer."}
  ],
  aerlund: [
    {name:"Falkenkönig",      cost:3, timing:"Verstärkung",          role:"Anführer",    effect:"Platziere 2 Armeen in einem eigenen Gebiet."},
    {name:"Sturmmaid",        cost:2, timing:"Vor Verteidigung",     role:"Kriegerin",   effect:"Erhöhe deinen höchsten Verteidigungswurf um +1 (max 7)."},
    {name:"Adlerwächter",     cost:1, timing:"Wenn angegriffen",     role:"Wächter",     effect:"Angreifer muss 1 Gold zahlen oder mit 1 Würfel weniger angreifen."},
    {name:"Greifenreiter",    cost:2, timing:"Vor Angriff",         role:"Luftangriff", effect:"+1 auf alle Angriffswürfel diesen Kampf."}
  ],
  sylverin: [
    {name:"Waldherzog",       cost:2, timing:"Bewegungsphase",       role:"Anführer",    effect:"Führe eine zusätzliche Truppenbewegung durch."},
    {name:"Pfadfinder",       cost:1, timing:"Vor Angriff",          role:"Kundschafter",effect:"Nach dem ersten Wurf darfst du den Angriff abbrechen."},
    {name:"Nebelhexe",        cost:2, timing:"Wenn angegriffen",     role:"Magie",       effect:"Angreifer darf keine Würfel-Boni nutzen."},
    {name:"Hirschreiter",     cost:2, timing:"Nach gew. Angriff",    role:"Reiter",      effect:"Du darfst 2 zusätzliche Armeen nachziehen."}
  ],
  kael: [
    {name:"Schattenfürst",    cost:3, timing:"Vor Angriff",          role:"Anführer",    effect:"Entferne 1 gegnerische Armee aus dem Zielgebiet."},
    {name:"Klingenschwester", cost:2, timing:"Nach dem Würfeln",     role:"Assassine",   effect:"Verringere den höchsten gegnerischen Würfel um −1 (min 1)."},
    {name:"Sumpfgänger",      cost:1, timing:"Jederzeit",            role:"Taktiker",    effect:"Schaue dir die obersten 2 Karten des Stapels an."},
    {name:"Verräter",         cost:3, timing:"Vor Angriff",          role:"Saboteur",    effect:"Wähle ein Gebiet mit 3+ Armeen. Es verteidigt mit max. 1 Würfel."}
  ],
  vorthan: [
    {name:"Sonnenkalif",     cost:3, timing:"Verstärkung",          role:"Anführer",    effect:"Zu Rundenbeginn +1 Einheit je 6 kontrollierten Gebieten (max 3)."},
    {name:"Sandreiterin",    cost:2, timing:"Bewegungsphase",       role:"Reiterin",    effect:"Bewege Truppen über 2 verbundene eigene Gebiete."},
    {name:"Wüstenwächter",   cost:2, timing:"Wenn angegriffen",     role:"Späher",      effect:"Verringere den höchsten gegnerischen Angriffswürfel um −1 (min 1)."},
    {name:"Glutpriester",    cost:2, timing:"Vor Angriff",          role:"Magie",       effect:"+1 auf alle Angriffswürfel diesen Kampf."}
  ]
};

/* ===== Aktive Karte aus der WB_MAPS-Registry wählen ============================
   Kartendaten liegen in eigenen Dateien (valcaryn.js, …), die sich VOR game.js
   in window.WB_MAPS eintragen. Weitere Karten: zusätzliche <id>.js mit
   WB_MAPS["<id>"] = { id, name, continents, regions } vor game.js laden. Welche
   Karte aktiv ist, bestimmt window.WB_ACTIVE_MAP, sonst der URL-Parameter ?map=,
   sonst "valcaryn". CONTINENTS/REGIONS bleiben danach wie gewohnt verfügbar
   (auch für map3d.js); die Symmetrisierung/Bereinigung folgt unten unverändert. */
const __WB_MAPS = (typeof window !== "undefined" && window.WB_MAPS) || {};
function _wbPickMapId(){
  try {
    if (typeof window !== "undefined") {
      if (window.WB_ACTIVE_MAP && __WB_MAPS[window.WB_ACTIVE_MAP]) return window.WB_ACTIVE_MAP;
      const q = new URLSearchParams(window.location.search).get("map");
      if (q && __WB_MAPS[q]) return q;
    }
  } catch (e) {}
  return __WB_MAPS["valcaryn"] ? "valcaryn" : Object.keys(__WB_MAPS)[0];
}
const __WB_MAP_ID = _wbPickMapId();
const __WB_MAP = __WB_MAPS[__WB_MAP_ID];
if (!__WB_MAP) {
  throw new Error("[warbound] Keine Karte in WB_MAPS gefunden — wurde valcaryn.js vor game.js geladen?");
}
if (typeof window !== "undefined") window.WB_ACTIVE_MAP = __WB_MAP_ID;
/* In der Lobby gewählte Karte (kann von der geladenen abweichen, bis der Spieler
   startet — der Wechsel läuft dort reload-frei über die 2D-Minimap). */
if (typeof window !== "undefined" && !window.WB_LOBBY_MAP) window.WB_LOBBY_MAP = __WB_MAP_ID;
console.log("[warbound] Karte:", __WB_MAP_ID, "(" + (__WB_MAP.name || __WB_MAP_ID) + ")");
/* Naval-Karten (Sturmsee): reine Seeschlacht. Statt Insel-Landprops werden
   Schiffsrümpfe mit haus-gefärbten Segeln je Schiff platziert, plus Kielwasser
   und Kanonenrauch. Alle Naval-Sonderpfade sind über IS_NAVAL gekapselt, damit
   die Landkarte (Valcaryn) unberührt bleibt. */
const IS_NAVAL = (__WB_MAP_ID === "sturmsee") || !!__WB_MAP.naval;
const CONTINENTS = __WB_MAP.continents;
const REGIONS = __WB_MAP.regions;

/* ═══ NACHBARSCHAFTEN SYMMETRISCH MACHEN ══════════════════════════════════
   In den SVG-Daten waren 48 Kanten einseitig (A→B, aber B↛A). Dadurch wurden
   Grenzen "übersprungen": Angriff/Bewegung von B nach A schlug fehl, obwohl A
   von B aus angrenzt. Wir ergänzen fehlende Gegenrichtungen einmalig. */
(function symmetrizeNeighbors(){
  const byId = {};
  REGIONS.forEach(r => { byId[r.id] = r; if(!Array.isArray(r.neighbors)) r.neighbors = []; });
  let added = 0;
  REGIONS.forEach(r => {
    r.neighbors.forEach(nid => {
      const o = byId[nid];
      if(o && !o.neighbors.includes(r.id)){ o.neighbors.push(r.id); added++; }
    });
  });
  if(added) console.log('[adjacency] ' + added + ' fehlende Gegen-Nachbarschaften ergänzt');
})();

/* ═══ FALSCHE NACHBARSCHAFTEN ENTFERNEN ════════════════════════════════════
   Einzelne SVG-Kanten verbinden Gebiete, die gar nicht aneinander grenzen
   (z.B. Vorthan ↔ Schwarzklippe). Diese werden hier beidseitig gekappt. */
(function removeBogusEdges(){
  const BLACKLIST = __WB_MAP.blacklist || [];
  const byId = {}; REGIONS.forEach(r => byId[r.id] = r);
  BLACKLIST.forEach(([a,b]) => {
    if(byId[a]) byId[a].neighbors = byId[a].neighbors.filter(n => n !== b);
    if(byId[b]) byId[b].neighbors = byId[b].neighbors.filter(n => n !== a);
  });
})();
function _territoryBaseName(name){
  const n = String(name || '').trim();
  /* Platzhalter-Namen wie "(Aerlund)" oder "(_islands)" kennzeichnen
     unbenannte Regionen — diese werden NICHT zusammengelegt (jede ist
     ein eigenes Territorium). Rückgabe '' → Aufrufer nutzt die Stück-ID. */
  if(/^\(.*\)$/.test(n)) return '';
  return n.replace(/_\d+$/, '').trim();
}
const _regionById = {};
REGIONS.forEach(r => { _regionById[r.id] = r; });

const LOGICAL_TERRITORIES = (() => {
  const byKey = new Map();
  REGIONS.forEach(r => {
    /* Naval (Sturmsee): KEINE Zusammenlegung gleichnamiger Stücke — jedes Feld
       ist ein eigenes Territorium und trägt genau ein Schiff mit einem Segel,
       das zugleich sein Banner ist. Landkarten legen wie bisher gleichnamige
       Stücke (Festland+Insel) zu einem logischen Territorium zusammen. */
    const key = IS_NAVAL ? r.id : (_territoryBaseName(r.name) || r.id);
    if(!byKey.has(key)) byKey.set(key, { key, name:key, pieceIds:[] });
    byKey.get(key).pieceIds.push(r.id);
  });
  return [...byKey.values()];
})();
/* Stück-ID → logischer Schlüssel */
const _pieceToTerritory = {};
LOGICAL_TERRITORIES.forEach(lt => lt.pieceIds.forEach(id => { _pieceToTerritory[id] = lt.key; }));

/* Logische Nachbarschaft: zwei logische Territorien sind benachbart, wenn
   IRGENDEIN Stück des einen an IRGENDEIN Stück des anderen grenzt. So werden
   zusammengelegte Territorien (Festland + Insel) konsistent behandelt — egal,
   welches Stück man anklickt. */
const _logicalAdj = (() => {
  const adj = {};
  LOGICAL_TERRITORIES.forEach(lt => { adj[lt.key] = new Set(); });
  REGIONS.forEach(r => {
    const k = _pieceToTerritory[r.id];
    (r.neighbors || []).forEach(nid => {
      const nk = _pieceToTerritory[nid];
      if(k && nk && nk !== k) adj[k].add(nk);
    });
  });
  return adj;
})();
function _logKey(id){ return _pieceToTerritory[id]; }
function _logAdjacent(idA, idB){
  const a = _logKey(idA), b = _logKey(idB);
  return !!(a && b && a !== b && _logicalAdj[a] && _logicalAdj[a].has(b));
}
/* Alle Stück-IDs der logischen Nachbarn eines Stücks (für Highlights) */
function _logNeighborPieces(id){
  const k = _logKey(id); if(!k || !_logicalAdj[k]) return [];
  const out = [];
  REGIONS.forEach(r => { if(_logicalAdj[k].has(_logKey(r.id))) out.push(r.id); });
  return out;
}
/* Bewegungsphase: alle EIGENEN Stücke, die vom Quell-Stück aus über eine Kette
   ZUSAMMENHÄNGENDER eigener Territorien erreichbar sind (nicht nur direkte
   Nachbarn). BFS über die logische Nachbarschaft, nur durch eigene Gebiete. */
function _ownedConnectedPieces(srcId, ownerId){
  const startK = _logKey(srcId); if(!startK) return [];
  const stateByKey = {};
  LOGICAL_TERRITORIES.forEach(lt => { stateByKey[lt.key] = G.regions[lt.pieceIds[0]]; });
  const seen = new Set([startK]); const stack = [startK];
  while(stack.length){
    const k = stack.pop();
    const set = _logicalAdj[k]; if(!set) continue;
    set.forEach(nk => {
      if(seen.has(nk)) return;
      const st = stateByKey[nk];
      if(st && st.ownerId === ownerId){ seen.add(nk); stack.push(nk); }
    });
  }
  seen.delete(startK);
  const out = [];
  REGIONS.forEach(r => { if(seen.has(_logKey(r.id))) out.push(r.id); });
  return out;
}
function _ownedConnected(idA, idB, ownerId){
  const b = _logKey(idB);
  return _ownedConnectedPieces(idA, ownerId).some(pid => _logKey(pid) === b);
}

/* Eindeutige Territorien-States eines Spielers. Da gleichnamige Stücke sich
   EIN State-Objekt teilen, genügt die Deduplizierung über Objekt-Identität. */
function ownedTerritoryStates(playerId){
  const seen = new Set(), out = [];
  for(const r of REGIONS){
    const d = G.regions[r.id];
    if(d && d.ownerId === playerId && !seen.has(d)){ seen.add(d); out.push(d); }
  }
  return out;
}

/* Nach JSON-Laden: Objekt-Sharing wiederherstellen — JSON.parse erzeugt pro
   Schlüssel eine eigene Kopie, daher müssen die Stücke eines Territoriums
   wieder auf dasselbe State-Objekt verlinkt werden. */
function _relinkTerritoryStates(){
  if(!G || !G.regions) return;
  LOGICAL_TERRITORIES.forEach(lt => {
    const canon = G.regions[lt.pieceIds[0]];
    if(!canon) return;
    lt.pieceIds.forEach(id => { G.regions[id] = canon; });
  });
}

/* ===== GAME STATE ===== */
let G = null;  // game state
let currentGameId = null;

/* ===================================================================
   ONLINE MULTIPLAYER (host-authoritative, snapshot-broadcast over the
   shared brettspiele.fun relay — same /ws + /api/rooms used by the other
   games on this site).

   Design:
   - The HOST's own browser is the single source of truth. It runs every
     existing function exactly as it already does for hotseat play —
     including for "remote" player slots, except the click that triggers
     the action happens on a guest's browser instead of the host's.
   - Guests never mutate G directly. A guest's click on an action that
     belongs to their own player slot is forwarded to the host as an
     {type:'action'} message; the host looks the action up in
     WB_ACTION_HANDLERS and calls the *same* function a local click would
     have called. The host then re-broadcasts a fresh G snapshot.
   - Two pieces of state travel over the wire: G itself (the committed
     game state — clean, JSON-safe) and a small serialized mirror of the
     ephemeral battleCtx (dice UI / defense picks), which is NOT part of G
     but both players' battle overlays need to agree on it.
   =================================================================== */
const WB_GAME_ID = "warbound-atlas";
const wbClientId = (function(){
  // Stable identity per browser, kept in localStorage so it survives closing
  // and reopening the tab — that is what lets a player rejoin as the SAME
  // player. (sessionStorage, used previously, is wiped on tab close, so every
  // rejoin looked like a brand-new player to the host.) We migrate any old
  // per-tab id over so sessions in progress across the update keep their seat.
  try{
    let id = localStorage.getItem('wb.clientId');
    if(!id){
      try{ id = sessionStorage.getItem('wb.clientId'); }catch(_){}
      if(!id) id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()));
      localStorage.setItem('wb.clientId', id);
    }
    return id;
  }catch(e){
    // Private mode / storage blocked → best-effort per-tab fallback.
    try{
      let id = sessionStorage.getItem('wb.clientId');
      if(!id){ id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())); sessionStorage.setItem('wb.clientId', id); }
      return id;
    }catch(_){ return String(Date.now()+Math.random()); }
  }
})();
const sync = {
  role: 'none',        // 'none' | 'host' | 'guest'
  room: '',
  connected: false,
  socket: null,
  myPlayerId: null,    // index into lobbyPlayers / G.players this browser controls, once assigned
  publicRoom: false,
  hostName: '',
  guestName: ''
};

function wbWsUrl(){
  if(location.protocol === 'file:') return 'ws://localhost:8787/ws';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
function wbMakeRoomCode(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }

// Compact summary of the configured match, advertised in the public-room
// browser so players can see the settings/players/bots/map before joining.
function wbLobbyMeta(){
  const humans = lobbyPlayers.filter(p => p.type === 'human').length;
  const bots   = lobbyPlayers.filter(p => p.type && p.type.indexOf('bot') === 0).length;
  return {
    humans, bots,
    maxPlayers: lobbyPlayers.length,
    mapName: (typeof __WB_MAP !== 'undefined' && __WB_MAP.name) || (typeof __WB_MAP_ID !== 'undefined' ? __WB_MAP_ID : ''),
    ruleMode: $("ruleMode") ? $("ruleMode").value : 'standard',
    winCondition: $("winCondition") ? $("winCondition").value : 'elim'
  };
}
function wbSend(payload){
  if(!sync.socket || sync.socket.readyState !== WebSocket.OPEN) return;
  // Only the host's messages may set the public-room listing metadata — a
  // guest's own messages must never clobber it back to an unset value.
  const hostMeta = sync.role === 'host' ? { public: !!sync.publicRoom, hostName: sync.hostName || '', lobbyMeta: wbLobbyMeta() } : {};
  sync.socket.send(JSON.stringify({ game: WB_GAME_ID, room: sync.room, clientId: wbClientId, ...hostMeta, ...payload }));
}
function wbSendAction(name, args){ wbSend({ type:'action', action:name, args: args||[] }); }

function wbConnect(role, room){
  room = String(room||'').trim().toUpperCase();
  if(!room) return;
  if(sync.socket){ try{ sync.socket.close(); }catch(e){} }
  sync.role = role; sync.room = room; sync.connected = false;
  const socket = new WebSocket(wbWsUrl());
  sync.socket = socket;
  socket.addEventListener('open', () => {
    sync.connected = true;
    if(role === 'host'){
      // "Du" ist der Einzelspieler-Default für den eigenen Sitz — ein Selbstbezug,
      // der bei den Gästen nichts zu suchen hat. Beim Online-Gehen auf einen
      // neutralen Namen normalisieren, damit der Host nicht als "Du" erscheint.
      if(lobbyPlayers[0] && lobbyPlayers[0].name === 'Du') lobbyPlayers[0].name = 'Gastgeber';
      sync.hostName = (lobbyPlayers[0] && lobbyPlayers[0].name) || 'Gastgeber';
      // Claim our own seat so a joining guest doesn't grab slot 0 (the host's
      // own player) — wbHostAssignGuest only fills human slots with no clientId.
      if(lobbyPlayers[0]) lobbyPlayers[0].clientId = wbClientId;
      const codeOut = $("wbRoomCodeOut"); if(codeOut) codeOut.textContent = room;
      const inviteEl = $("wbInviteLink"); if(inviteEl) inviteEl.value = wbMakeInviteUrl(room);
      wbSend({ type: 'create' });
      wbBroadcastLobby();
      renderLobby();
    } else {
      wbSend({ type: 'join' });
      wbSend({ type:'joinRequest', name: sync.guestName || 'Spieler' });
      const st = $("joinStatus"); if(st){ st.style.color = "var(--gold2)"; st.textContent = "Verbunden — warte auf den Gastgeber …"; }
    }
    wbUpdateOnlineUI();
    wbStartPresence();
  });
  socket.addEventListener('message', (event) => {
    let msg; try{ msg = JSON.parse(event.data); }catch(e){ return; }
    if(msg.clientId === wbClientId) return;
    wbHandleMessage(msg);
  });
  socket.addEventListener('close', () => {
    if(sync.socket !== socket) return;   // ein alter Socket schließt beim Reconnect — neuen nicht stören
    sync.connected = false; wbStopPresence(); wbUpdateOnlineUI();
  });
  socket.addEventListener('error', () => {
    const st = $("joinStatus");
    if(st){ st.style.color = "#e08a8a"; st.textContent = "Verbindung fehlgeschlagen."; }
  });
}

function wbHandleMessage(msg){
  if((msg.game || WB_GAME_ID) !== WB_GAME_ID) return;
  if(String(msg.room||'').toUpperCase() !== sync.room) return;

  // Präsenz: jede Nachricht eines Peers ist ein Lebenszeichen (steuert die
  // „Spieler weg"-Meldung und die Host-Migration). Eigene Nachrichten wurden
  // schon vor dem Aufruf herausgefiltert.
  wbNotePeer(msg);
  if(msg.type === 'bye'){ wbHandlePeerGone(msg.clientId, true); return; }
  if(msg.type === 'presence'){
    // Doppel-Host auflösen: laufen (durch ein Wahl-Rennen) zwei Hosts, bleibt
    // der mit dem kleineren Sitzindex Host; der andere wird wieder Gast.
    if(sync.role === 'host' && msg.pRole === 'host' && G){
      const other = G.players.findIndex(p => p.clientId === msg.clientId);
      if(other >= 0 && sync.myPlayerId != null && other < sync.myPlayerId) wbDemoteToGuest();
    }
    // Sicherheitsnetz: Der Host läuft bereits im Spiel, dieser Gast hängt aber
    // noch ohne Spielstand (Start-Snapshot verpasst) → Snapshot nachfordern.
    if(sync.role === 'guest' && msg.pRole === 'host' && msg.inGame && !G){
      wbRequestSnapshot();
    }
    return;
  }

  if(sync.role === 'host'){
    if(msg.type === 'joinRequest'){ wbHostAssignGuest(msg.clientId, msg.name); return; }
    if(msg.type === 'action'){ wbHostHandleAction(msg); return; }
    return;
  }
  if(sync.role === 'guest'){
    if(msg.type === 'lobbyState'){ wbApplyLobbyState(msg); return; }
    if(msg.type === 'snapshot'){ wbApplySnapshot(msg); return; }
    if(msg.type === 'battleState'){ wbApplyBattleState(msg); return; }
    if(msg.type === 'battleDice'){ wbApplyBattleDice(msg); return; }
    if(msg.type === 'notice'){ if(msg.text) toast(msg.text); return; }
  }
}

/* Kurze Bei-/Austritts-Meldung an alle Clients. Austritte erkennt jeder Client
   selbst über den Präsenz-Timeout (wbHandlePeerGone läuft überall); Beitritte
   sieht nur der Host (er verarbeitet die joinRequests), also verteilt er sie per
   'notice' an die Gäste weiter. */
function wbBroadcastNotice(text){
  if(sync.role === 'host' && text) wbSend({ type:'notice', text });
}
const _wbJoinAnnounced = new Map();   // clientId → letzter Zeitpunkt (gegen Doppel-Meldungen)
function wbAnnounceJoin(name, clientId, reconnect){
  const now = Date.now();
  if(clientId && now - (_wbJoinAnnounced.get(clientId) || 0) < 8000) return;   // schnelle Rejoin-Requests nicht mehrfach melden
  if(clientId) _wbJoinAnnounced.set(clientId, now);
  const nm = name || 'Ein Spieler';
  const t = reconnect ? ('🔄 ' + nm + ' ist wieder beigetreten') : ('➕ ' + nm + ' ist beigetreten');
  toast(t);
  if(G && typeof log === 'function'){
    log(reconnect ? ('🔄 <b>' + escapeForAttr(nm) + '</b> ist wieder beigetreten.')
                  : ('➕ <b>' + escapeForAttr(nm) + '</b> ist der Partie beigetreten.'));
  }
  wbBroadcastNotice(t);
}

/* ── Lobby (pre-game) networking ──────────────────────────────────── */
function wbHostAssignGuest(clientId, name){
  if(sync.role !== 'host') return;
  // A guest can arrive after the match has already started (they opened the
  // invite late, or reconnected). lobbyPlayers no longer maps to anything once
  // G exists, so seating them there would leave them a permanent spectator —
  // seat them straight into a real G.players slot instead.
  if(G){ wbHostSeatGuestInGame(clientId, name); return; }
  let idx = lobbyPlayers.findIndex(p => p.clientId === clientId);
  if(idx < 0){
    idx = lobbyPlayers.findIndex(p => p.type === 'human' && !p.clientId);
    if(idx < 0){
      if(lobbyPlayers.length >= 7) return;
      const used = new Set(lobbyPlayers.map(p => p.faction));
      const free = FACTION_KEYS.find(k => !used.has(k));
      if(!free) return;
      lobbyPlayers.push({name: name || `Spieler ${lobbyPlayers.length+1}`, faction: free, type: 'human'});
      idx = lobbyPlayers.length - 1;
    }
  }
  const _wasClaimed = !!lobbyPlayers[idx].clientId;
  lobbyPlayers[idx].clientId = clientId;
  if(name) lobbyPlayers[idx].name = name;
  renderLobby();
  wbAnnounceJoin(lobbyPlayers[idx].name, clientId, _wasClaimed);
}
function wbHostSeatGuestInGame(clientId, name){
  if(sync.role !== 'host' || !G) return;
  // Reconnect first (same clientId already owns a seat), otherwise take over a
  // free human seat the host was running locally. Bots/neutral are never handed
  // out. No free seat → the guest stays a spectator, which is the honest result.
  // Reconnect first: either the seat still carries this clientId, or it was
  // turned into a bot when the player dropped (humanClientId remembers them).
  // Only if neither matches do we hand out a fresh free human seat.
  const existing = G.players.find(p => p.clientId === clientId)
                || G.players.find(p => p.humanClientId === clientId);
  let seat = existing || G.players.find(p => p.type === 'human' && !p.clientId);
  if(!seat) return;
  // Reclaiming a seat the host had been running as a bot → hand control back.
  if(seat.humanClientId === clientId && seat.type !== 'human') seat.type = 'human';
  seat.clientId = clientId;
  seat.humanClientId = null;
  if(name) seat.name = name;
  wbBroadcastSnapshot();   // guest's wbApplySnapshot now finds its clientId → real player
  wbAnnounceJoin(seat.name, clientId, !!existing);
}
function wbBroadcastLobby(){
  if(sync.role !== 'host') return;
  wbSend({
    type: 'lobbyState',
    lobbyPlayers,
    ruleMode: $("ruleMode") ? $("ruleMode").value : undefined,
    winCondition: $("winCondition") ? $("winCondition").value : undefined
  });
}
function wbApplyLobbyState(msg){
  if(sync.role !== 'guest') return;
  if(Array.isArray(msg.lobbyPlayers)) lobbyPlayers = msg.lobbyPlayers;
  sync.myPlayerId = lobbyPlayers.findIndex(p => p.clientId === wbClientId);
  if($("ruleMode") && msg.ruleMode) $("ruleMode").value = msg.ruleMode;
  if($("winCondition") && msg.winCondition) $("winCondition").value = msg.winCondition;
  if(!G){
    goScreen('lobby');
    renderLobby();
  }
}

/* ── Game snapshot (in-game) networking ───────────────────────────── */
function wbBroadcastSnapshot(){
  if(sync.role !== 'host' || !G) return;
  wbSend({ type:'snapshot', snapshot: G });
}
function wbApplySnapshot(msg){
  if(sync.role !== 'guest' || !msg.snapshot) return;
  const firstTime = !G;
  G = msg.snapshot;
  _relinkTerritoryStates();
  sync.myPlayerId = G.players.findIndex(p => p.clientId === wbClientId);
  if(firstTime){
    goScreen('game');
    renderMap();
    initMapControls();
  }
  refreshMapVisuals();
  updateHUD();
  renderLog();
}

/* ── Battle (ephemeral, not part of G) networking ─────────────────────
   battleCtx holds the live dice-battle UI state (who's ready, accumulated
   modifiers, armed defense cards/characters). It's deliberately NOT part
   of G — it only matters while the battle overlay is open — but both
   players' overlays need to agree on it, so it gets its own small synced
   message whenever it changes. */
function wbSerializeBattleCtx(){
  if(!battleCtx) return null;
  const {atkP, defP, armedDefChars, ...rest} = battleCtx;
  return { ...rest, atkPlayerId: atkP ? atkP.id : null, defPlayerId: defP ? defP.id : null, armedDefChars: armedDefChars ? [...armedDefChars] : [] };
}
function wbBroadcastBattleState(){
  if(sync.role !== 'host') return;
  wbSend({ type:'battleState', battle: wbSerializeBattleCtx() });
}
function wbApplyBattleState(msg){
  if(sync.role !== 'guest') return;
  const b = msg.battle;
  if(!b){
    // Host closed the battle (retreat / conquest / out of troops).
    $("battle-overlay")?.classList.remove("show");
    if(typeof window.map3d_restoreView === 'function') window.map3d_restoreView();
    battleCtx = null; _battleHighlight = null;
    const epb = $("endPhaseBtn"); if(epb) epb.disabled = false;
    return;
  }
  const wasOpen = !!battleCtx;
  const {atkPlayerId, defPlayerId, armedDefChars, needsTroopMoveChoice, ...rest} = b;
  battleCtx = { ...rest, atkP: G.players[atkPlayerId], defP: (defPlayerId != null ? G.players[defPlayerId] : null), armedDefChars: new Set(armedDefChars || []) };
  if(needsTroopMoveChoice && battleCtx.atkP && battleCtx.atkP.clientId === wbClientId){
    const {fromName, toName, minMove, maxMove, hasKnight, hasSiege} = needsTroopMoveChoice;
    askTroopMove(fromName, toName, minMove, maxMove, {hasKnight, hasSiege})
      .then(ch => wbSendAction('troopMoveChoice', [ch.num, ch.mvKnight, ch.mvSiege]))
      .catch(() => wbSendAction('troopMoveChoice', [minMove, false, false]));
    return;
  }
  if(!wasOpen){
    wbRenderBattleOverlay();   // battle just opened on the host — full setup
  } else {
    // Already open — only refresh the bits that actually change between
    // rounds/ready-toggles, instead of resetting the whole overlay (which
    // would wipe the dice that are mid-animation on the host's screen).
    updateBattleFxNote();
    if(typeof renderDefenseOptions === 'function') renderDefenseOptions();
    const atkTroopsEl = $("atkTroops"); if(atkTroopsEl) atkTroopsEl.textContent = G.regions[battleCtx.fromId]?.troops ?? '';
    const defTroopsEl = $("defTroops"); if(defTroopsEl) defTroopsEl.textContent = G.regions[battleCtx.toId]?.troops ?? '';
    if($("battleDefendBtn")){
      $("battleDefendBtn").classList.toggle("ready", !!battleCtx.defReady);
      $("battleDefendBtn").textContent = battleCtx.defReady ? "✓ Bereit" : "🛡 Verteidiger bereit";
      $("battleDefendBtn").disabled = !!battleCtx.defReady;
    }
  }
}

/* ── Dice broadcast (host → guests) ──────────────────────────────────
   The dice roll + result is animated only on whoever runs doOneBattleRound
   (always the host). Without this, a remote guest watching the battle saw an
   empty dice area — "the dice are just gone". The host therefore serialises
   the current #atkDice/#defDice rows and pushes them so guests can mirror the
   spinning dice and the final faces/win-lose highlight. */
function _wbSerializeDiceRow(rowEl){
  if(!rowEl) return [];
  return [...rowEl.querySelectorAll('.die')].map(d => ({
    v:      d.querySelector('.face')?.textContent || '1',
    gold:   d.classList.contains('gold'),
    white:  d.classList.contains('white'),
    roll:   d.classList.contains('roll'),
    win:    d.classList.contains('win'),
    lose:   d.classList.contains('lose'),
    unused: d.classList.contains('unused')
  }));
}
function wbBroadcastDice(phase, extra){
  if(sync.role !== 'host') return;
  wbSend({ type:'battleDice', phase,
           atk:_wbSerializeDiceRow($('atkDice')),
           def:_wbSerializeDiceRow($('defDice')),
           ...(extra||{}) });
}
function wbApplyBattleDice(msg){
  if(sync.role !== 'guest') return;
  const build = (rowId, arr) => {
    const row = $(rowId); if(!row) return;
    row.innerHTML = '';
    (arr||[]).forEach(d => {
      const type = d.gold ? 'gold' : (d.white ? 'white' : 'black');
      const el = makeDie(d.v, type);
      if(d.roll)   el.classList.add('roll');
      if(d.win)    el.classList.add('win');
      if(d.lose)   el.classList.add('lose');
      if(d.unused) el.classList.add('unused');
      row.appendChild(el);
    });
  };
  build('atkDice', msg.atk);
  build('defDice', msg.def);
  if(msg.phase === 'result'){
    if(msg.resultHtml != null && $('battleResultText')) $('battleResultText').innerHTML = msg.resultHtml;
    if(msg.pill != null && $('battleResultPill'))       $('battleResultPill').textContent = msg.pill;
    if($('battlePhase')) $('battlePhase').textContent = 'Treffer';
    window.WBSfx?.diceReveal?.();
  } else {
    if($('battlePhase')) $('battlePhase').textContent = 'Würfel rollen';
    window.WBSfx?.diceRoll?.(1200);
  }
}

/* ── Action relay ──────────────────────────────────────────────────
   Call as the first line of any function that mutates G as a direct
   result of a UI action. On a guest browser this forwards the call to
   the host (if it's actually this guest's turn) and returns true so the
   caller can `return` immediately, skipping its normal body. On the
   host, or in offline/hotseat play, it does nothing and returns false so
   the function runs exactly as before. */
/* ── Host: fremd-gesteuerte Gast-Sitze vor lokalen Host-Aktionen schützen ──
   Der Host ist die Spiel-Autorität und führt normalerweise jede lokale Aktion
   aus (auch im Hotseat für Sitze ohne clientId). Im Zug eines ENTFERNTEN Gasts
   (menschlicher Sitz mit fremder clientId) darf der Host aber NICHT selbst
   handeln — diesen Sitz steuert allein der Gast-Browser via relayed Aktionen.
   wbApplyingRemoteAction ist true, während der Host gerade eine solche relayed
   Aktion anwendet; dann greift der Schutz NICHT (sonst würde die legitime
   Gast-Aktion blockiert). Geprüft wird jeweils der zuständige Sitz: bei Zug-
   Aktionen der aktuelle Spieler, im Kampf der Angreifer bzw. Verteidiger — so
   darf der Host z. B. sein eigenes Gebiet gegen den Angriff eines Gasts
   verteidigen. */
let wbApplyingRemoteAction = false;
function wbHostBlocksLocal(p){
  if(sync.role !== 'host' || wbApplyingRemoteAction) return false;
  return !!(p && p.clientId && p.clientId !== wbClientId);
}

/* Does THIS browser control the given player seat? Mirrors the relay logic:
   offline/hotseat controls everything; the host runs its own seat plus every
   local/bot seat (no clientId); a guest controls only its own seat. Used to
   decide whether the attacker's dice-count panel / "Angreifen" button belongs
   to this client — otherwise a defending guest sees the attacker's dice
   selector and can't do anything with it. */
function wbControlsSeat(p){
  if(sync.role === 'none') return true;
  if(!p) return false;
  if(sync.role === 'host') return !p.clientId || p.clientId === wbClientId;
  return p.clientId === wbClientId;
}

function wbRelay(name, args){
  if(wbHostBlocksLocal(G && G.players[G.currentPlayerIdx])) return true; // Host: fremder Gast am Zug
  if(sync.role !== 'guest') return false;
  if(!G || sync.myPlayerId == null || G.currentPlayerIdx !== sync.myPlayerId) return true; // not my turn — ignore
  wbSendAction(name, args);
  return true;
}
/* Same idea but for the *defending* side of an active battle, which is
   never the current-turn player. */
function wbRelayDefense(name, args){
  if(wbHostBlocksLocal(battleCtx && battleCtx.defP)) return true; // Host verteidigt nicht für einen fremden Gast
  if(sync.role !== 'guest') return false;
  if(!battleCtx || !battleCtx.defP || battleCtx.defP.clientId !== wbClientId) return true;
  wbSendAction(name, args);
  return true;
}
/* …and for the attacking side specifically (battle roll/retreat), which
   IS the current-turn player but needs the dedicated battleCtx check too
   since G.currentPlayerIdx alone doesn't confirm a battle is even open. */
function wbRelayAttack(name, args){
  if(wbHostBlocksLocal(battleCtx && battleCtx.atkP)) return true; // Host greift nicht für einen fremden Gast an
  if(sync.role !== 'guest') return false;
  if(!battleCtx || !battleCtx.atkP || battleCtx.atkP.clientId !== wbClientId) return true;
  wbSendAction(name, args);
  return true;
}

const WB_ACTION_HANDLERS = {
  onRegionClick:     (args) => onRegionClick(args[0]),
  /* WICHTIG: ALLE Argumente durchreichen — args[3]/args[4] (Karten-Index bzw.
     Ritter/Katapult-mitnehmen) wurden hier früher verschluckt, wodurch im
     Online-Spiel weder der Spezialeinheiten-Kauf noch das Mitziehen von
     Ritter/Katapult funktionierte. */
  deployConfirm:     (args) => wbApplyDeployConfirm(args[0], args[1], args[2], args[3]),
  moveConfirm:       (args) => wbApplyMoveConfirm(args[0], args[1], args[2], args[3], args[4]),
  troopMoveChoice:   (args) => wbApplyTroopMoveChoice(args[0], args[1], args[2]),
  exchangeTroops:    (args) => wbApplyExchangeTroops(args[0], args[1]),
  playCouncilCard:   (args) => playCouncilCard(args[0]),
  endPhase:          () => wbDoEndPhase(),
  battleRoll:        (args) => wbDoBattleRoll(args[0]),
  battleAutoRoll:    (args) => runAutoRoll(args[0]),
  battleRetreat:     () => wbDoBattleRetreat(),
  battleDefendReady: () => wbDoDefendReady(),
  playDefenseCard:   (args) => playDefenseCardInBattle(args[0]),
  armDefChar:        (args) => _armDefChar(args[0]),
  hireDefChar:       (args) => wbDoHireDefChar(args[0], args[1])
};
function wbHostHandleAction(msg){
  if(sync.role !== 'host') return;
  const handler = WB_ACTION_HANDLERS[msg.action];
  if(!handler) return;
  // Same trust model as the rest of brettspiele.fun's relay-based games:
  // anyone in the room can act, the room code is the access control. The
  // host still only executes a fixed whitelist of named actions (never an
  // arbitrary function name from the network).
  // Flag setzen, damit der Host-Schutz (wbHostBlocksLocal) diese legitime,
  // vom zuständigen Gast stammende Aktion NICHT blockiert.
  wbApplyingRemoteAction = true;
  try{ handler(msg.args || []); }
  catch(e){ console.error('[warbound] action failed:', msg.action, e); }
  finally{ wbApplyingRemoteAction = false; }
}

/* ── Präsenz-Heartbeat, „Spieler weg"-Meldung & Host-Migration ────────
   Der Relay meldet einen Verbindungsabbruch NICHT aktiv an die Anderen. Deshalb
   sendet jeder Client periodisch ein kleines {type:'presence'}-Lebenszeichen.
   Bleibt das eines Peers aus (Timeout), gilt er als weg: alle zeigen eine
   Meldung, und war es der Host, wählt sich deterministisch ein verbundener
   Spieler zum neuen Host. Beim sauberen Schließen des Tabs wird zusätzlich ein
   sofortiges {type:'bye'} verschickt. Das funktioniert auch bei Absturz/Crash
   (kein sauberes Close-Frame), weil der Timeout unabhängig davon greift. */
const WB_HEARTBEAT_MS   = 2500;   // Sende-Takt der Lebenszeichen
const WB_PEER_TIMEOUT_MS = 8000;  // ~3 verpasste Takte → Peer gilt als weg
const wbPresence = { peers: new Map(), heartbeatTimer: null, checkTimer: null };

function wbMyName(){
  if(G && sync.myPlayerId != null && G.players[sync.myPlayerId]) return G.players[sync.myPlayerId].name;
  if(sync.role === 'host') return sync.hostName || 'Gastgeber';
  return sync.guestName || 'Spieler';
}
function wbStartPresence(){
  wbStopPresence();
  wbPresence.heartbeatTimer = setInterval(wbSendHeartbeat, WB_HEARTBEAT_MS);
  wbPresence.checkTimer     = setInterval(wbCheckPresence, 2000);
  wbSendHeartbeat();
}
function wbStopPresence(){
  if(wbPresence.heartbeatTimer) clearInterval(wbPresence.heartbeatTimer);
  if(wbPresence.checkTimer)     clearInterval(wbPresence.checkTimer);
  wbPresence.heartbeatTimer = wbPresence.checkTimer = null;
  wbPresence.peers.clear();
}
function wbSendHeartbeat(){
  if(!sync.connected || sync.role === 'none') return;
  // inGame teilt Gästen mit, dass der Host die Partie bereits gestartet hat.
  // Ein Gast, der (durch eine verlorene Start-Snapshot-Nachricht) noch in der
  // Lobby festhängt, kann daraufhin einen frischen Snapshot anfordern.
  wbSend({ type:'presence', pRole: sync.role, pName: wbMyName(), pPlayerId: sync.myPlayerId, inGame: !!G });
}
// Gedrosselte Snapshot-Anforderung eines noch nicht ins Spiel geholten Gastes.
let _wbLastSnapRequest = 0;
function wbRequestSnapshot(){
  const now = Date.now();
  if(now - _wbLastSnapRequest < 2000) return;   // höchstens alle 2 s
  _wbLastSnapRequest = now;
  // Der Host behandelt joinRequest bei laufendem Spiel via wbHostSeatGuestInGame,
  // das den Gast (re)platziert und einen Snapshot broadcastet.
  wbSend({ type:'joinRequest', name: sync.guestName || 'Spieler' });
}
function wbNotePeer(msg){
  const id = msg.clientId; if(!id) return;
  let peer = wbPresence.peers.get(id);
  if(!peer){ peer = { name:'Spieler', playerId:null, role:'guest', lastSeen:0 }; wbPresence.peers.set(id, peer); }
  peer.lastSeen = Date.now();
  if(msg.type === 'presence'){
    if(msg.pName) peer.name = msg.pName;
    if(msg.pRole) peer.role = msg.pRole;
    if(msg.pPlayerId !== undefined) peer.playerId = msg.pPlayerId;
  }
}
function wbCheckPresence(){
  const now = Date.now();
  for(const [id, peer] of [...wbPresence.peers]){
    if(now - peer.lastSeen > WB_PEER_TIMEOUT_MS) wbHandlePeerGone(id, false);
  }
}
function wbHandlePeerGone(id){
  const peer = wbPresence.peers.get(id);
  if(!peer) return;
  wbPresence.peers.delete(id);
  const name = peer.name || 'Ein Spieler';
  toast(`⚠ ${name} hat die Partie verlassen`);
  // Der Host schreibt die Meldung autoritativ in die Chronik (im Snapshot
  // enthalten); Gäste zeigen sie nur flüchtig als Toast an.
  if(sync.role === 'host' && G && typeof log === 'function'){
    log(`⚠ <b>${escapeForAttr(name)}</b> hat die Partie verlassen.`);
  }
  // War der Weggegangene der Host → Host-Migration.
  if(peer.role === 'host'){ wbMigrateHost(id, peer); return; }
  // Sonst: ein Mitspieler ist weg — der Host ersetzt seinen Sitz durch einen
  // Bot, damit das Spiel bei seinem Zug nicht stehen bleibt.
  if(sync.role === 'host') wbHostReplaceDepartedWithBot(id, name);
}

/* Host-seitig: verwaisten Sitz eines weggegangenen Menschen zum Bot machen,
   damit die bestehende Bot-Zug-Automatik (beginTurn) ihn künftig übernimmt.
   War der Sitz gerade am Zug, wird der Zug sauber beendet. */
function wbHostReplaceDepartedWithBot(clientId, name){
  if(sync.role !== 'host' || !G) return;
  const seat = G.players.find(p => p.clientId === clientId);
  if(!seat || seat.type !== 'human') return;
  const wasCurrent = (G.currentPlayerIdx === seat.id);
  seat.type = 'bot-normal';
  // Remember who used to hold this seat so a rejoin with the same clientId can
  // reclaim it (see wbHostSeatGuestInGame). We drop the live clientId so turn
  // logic treats it as a local bot, but keep the identity for reclaiming.
  seat.humanClientId = clientId;
  seat.clientId = null;
  log(`🤖 <b>${escapeForAttr(name || seat.name)}</b> wird durch einen Bot ersetzt.`);
  if(wasCurrent){
    forceCloseBattleOverlay();
    setTimeout(() => { if(sync.role === 'host' && G) nextTurn(); }, 500);
  } else {
    wbBroadcastSnapshot();
  }
}

/* Host ist weg: deterministische Wahl eines neuen Hosts. Es gewinnt der
   verbundene menschliche Spieler mit dem kleinsten Sitzindex — alle Gäste
   rechnen dieselbe Wahl aus dem geteilten Snapshot + der Präsenzliste, also
   promotet sich genau einer. Ein evtl. Rennen fängt der Doppel-Host-Schutz in
   wbHandleMessage ab. */
function wbMigrateHost(goneHostClientId, goneHostPeer){
  if(sync.role !== 'guest') return;
  if(!G){ toast('⚠ Der Gastgeber hat die Partie verlassen'); return; }
  const connected = new Set([wbClientId, ...wbPresence.peers.keys()]);
  const candidates = G.players
    .filter(p => p.type === 'human' && p.clientId && connected.has(p.clientId))
    .sort((a,b) => a.id - b.id);
  if(!candidates.length) return;                 // niemand kann übernehmen
  if(candidates[0].clientId !== wbClientId) return; // jemand anderes wird Host
  // ── Ich übernehme als neuer Host ──
  sync.role = 'host';
  sync.hostName = wbMyName();
  sync.publicRoom = false;
  const me = G.players[sync.myPlayerId];
  if(me) me.clientId = wbClientId;
  toast('👑 Du bist jetzt der Gastgeber');
  log(`👑 <b>${escapeForAttr(sync.hostName)}</b> übernimmt als Gastgeber.`);
  wbSend({ type:'create' });   // Raum-Meta neu registrieren
  wbSendHeartbeat();           // sofort als Host announcen (löst Doppel-Host-Wahl auf)
  wbBroadcastSnapshot();       // Autorität übernehmen
  wbUpdateOnlineUI();
  // Sitz des alten Hosts durch Bot ersetzen, sonst blockiert dessen Zug.
  wbHostReplaceDepartedWithBot(goneHostClientId, (goneHostPeer && goneHostPeer.name) || 'Gastgeber');
}
function wbDemoteToGuest(){
  if(sync.role !== 'host') return;
  sync.role = 'guest';
  sync.publicRoom = false;
  toast('Ein anderer Spieler ist Gastgeber');
  wbUpdateOnlineUI();
}

// Beim Schließen/Verlassen des Tabs sofort abmelden (best effort — der
// Timeout greift ohnehin, falls die Nachricht nicht mehr rausgeht).
window.addEventListener('pagehide', () => {
  if(sync.connected && sync.role !== 'none') wbSend({ type:'bye' });
});

/* ── Public-room visibility + join-by-code UI ─────────────────────── */
function wbUpdateOnlineUI(){
  const dot = $("wbOnlineDot");
  if(dot) dot.style.background = sync.connected ? '#7ee787' : '#777';
  const codeEl = $("wbRoomCodeOut");
  if(codeEl) codeEl.textContent = sync.room || '—';
}
let wbPublicRoomsTimer = null;
async function wbFetchPublicRooms(){
  try{
    const res = await fetch(`/api/rooms?game=${WB_GAME_ID}`, { credentials: 'include' });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    wbRenderPublicRooms(Array.isArray(data.items) ? data.items : []);
  }catch(e){ /* browsing rooms is a nice-to-have, keep the last known list */ }
}
const WB_RULEMODE_LABELS = { standard: "Standard", gefecht: "Gefecht" };
const WB_WINCOND_LABELS   = { elim: "Letzte Fraktion", dom: "Weltherrschaft", ziele: "Ziele" };
function wbRenderPublicRooms(items){
  const box = $("wbPublicRoomsItems");
  if(!box) return;
  if(!items.length){ box.innerHTML = `<div class="public-rooms-empty muted">Aktuell keine öffentlichen Partien.</div>`; return; }
  box.innerHTML = items.map(item => {
    const humans = item.humans || 0, bots = item.bots || 0;
    const seats  = item.maxPlayers || (humans + bots) || 0;
    const ruleLabel = WB_RULEMODE_LABELS[item.ruleMode] || item.ruleMode || "";
    const winLabel  = WB_WINCOND_LABELS[item.winCondition] || item.winCondition || "";
    const meta = [
      item.mapName ? `🗺 ${escapeForAttr(item.mapName)}` : "",
      ruleLabel ? `⚙ ${escapeForAttr(ruleLabel)}` : "",
      winLabel ? `🏆 ${escapeForAttr(winLabel)}` : "",
      `👤 ${humans} Spieler`,
      bots ? `🤖 ${bots} Bots` : ""
    ].filter(Boolean).join(" · ");
    return `
    <button type="button" class="public-room-row" data-room="${escapeForAttr(item.room)}">
      <span class="public-room-line">
        <strong>${escapeForAttr(item.room)}</strong>
        <span class="public-room-host">${escapeForAttr(item.hostName || 'Gastgeber')}</span>
        <span class="public-room-count">${item.playerCount}${seats ? ' / ' + seats : ''}</span>
      </span>
      <span class="public-room-meta muted">${meta}</span>
    </button>`;
  }).join("");
}
function wbStartPublicRoomsPolling(){
  wbStopPublicRoomsPolling();
  wbFetchPublicRooms();
  wbPublicRoomsTimer = setInterval(wbFetchPublicRooms, 4000);
}
function wbStopPublicRoomsPolling(){ if(wbPublicRoomsTimer) clearInterval(wbPublicRoomsTimer); wbPublicRoomsTimer = null; }

function generateGameId(){ return Math.random().toString(36).slice(2,8); }
function getGameIdFromUrl(){ try{ return new URL(location.href).searchParams.get('g')||null; }catch(_){ return null; } }
function setGameInUrl(id){ try{ const u=new URL(location.href); u.searchParams.set('g',id); history.replaceState({},'',u); }catch(_){} }
function clearGameUrl(){ try{ const u=new URL(location.href); u.searchParams.delete('g'); history.replaceState({},'',u); }catch(_){} }

function newGame(){
  return {
    players: [],
    regions: {},   // id -> {ownerId, troops, knight, tower, siege, runeShield}
    deck: [],
    discard: [],
    currentPlayerIdx: 0,
    phase: "reinforce",
    round: 1,
    selected: null,   // selected region id
    pendingTroops: 0, // troops to place
    extraMoveAvailable: false,
    pactPlayer: null,
    log: [],
    winCondition: "elim",
    settings: {startTroops: 25, startGold: 3}
  };
}

/* ===== UTILITY ===== */
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function rnd(maxFaces){ return Math.floor(Math.random() * maxFaces) + 1; }
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]} return arr; }
function toast(msg, ms=2200){
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove("show"), ms);
}
function log(html){
  G.log.unshift(html);
  if(G.log.length > 60) G.log.pop();
  renderLog();
}
function renderLog(){
  $("log").innerHTML = G.log.map(e => `<div class="log-entry">${e}</div>`).join("");
}
function currentPlayer(){ return G.players[G.currentPlayerIdx]; }
/* Der Sitz, den DIESER Browser besitzt — für die dauerhaft sichtbaren eigenen
   Infos (Kopf-/Fußzeile, Kartenliste). Im Online-Spiel ist das der eigene Sitz
   unabhängig davon, wer gerade am Zug ist; im Einzelspieler/Hotseat gibt es
   keinen festen eigenen Sitz, daher fällt es auf den aktuellen Spieler zurück
   (das Gerät wird ja weitergereicht). */
function wbLocalPlayer(){
  if(sync.role !== 'none' && sync.myPlayerId != null && sync.myPlayerId >= 0 && G.players[sync.myPlayerId])
    return G.players[sync.myPlayerId];
  return currentPlayer();
}
/* Nur Gebietskarten zählen zum Hand-Limit (max 5). Ratskarten zählen NICHT mit. */
function _territoryCardCount(p){ return (p && p.hand) ? p.hand.filter(c => c.type === 'territory').length : 0; }
const TERRITORY_CARD_LIMIT = 5;
/* Ratskarten werden getrennt behandelt: maximal 3 auf der Hand. */
function _councilCardCount(p){ return (p && p.hand) ? p.hand.filter(c => c.source === 'council').length : 0; }
const COUNCIL_CARD_LIMIT = 3;

/* ── Ziele-Modus: Auftrag zuweisen & prüfen ─────────────────────── */
function _assignObjective(p){
  const conts = CONTINENTS.filter(c => c.key !== '_islands' && c.ownerHouse && c.ownerHouse !== p.faction);
  const tc = conts.length ? conts[Math.floor(Math.random()*conts.length)] : CONTINENTS[0];
  // Territoriums-Ziel an die Kartengröße koppeln: Karten mit zusammengelegten
  // Gebieten (z.B. Sturmsee, ~21 logische Gebiete) hätten mit fixen 20 ein quasi
  // unerfüllbares Ziel. Deckelung bei 20 hält große Karten (Valcaryn) unverändert.
  const _terrGoal = Math.min(20, Math.max(8, Math.round(LOGICAL_TERRITORIES.length * 0.55)));
  const pool = [
    {type:'continent',   cont:tc.key,   label:'Erobere ganz ' + tc.name},
    {type:'territories', n:_terrGoal,   label:'Kontrolliere ' + _terrGoal + ' Gebiete'},
  ];
  // Hauptstadt-Ziel nur, wenn die aktive Karte überhaupt genug Hauptstädte hat
  // (Karten wie "Sturmsee" haben keine Städte -> Ziel wäre unerfüllbar).
  if (typeof FACTION_CAPITALS !== 'undefined' && Object.keys(FACTION_CAPITALS).length >= 3) {
    pool.push({type:'capitals', n:3, label:'Halte 3 Hauptstädte gleichzeitig'});
  }
  return pool[Math.floor(Math.random()*pool.length)];
}
function _objectiveMet(p){
  const o = p && p.objective; if(!o) return false;
  if(o.type === 'continent'){ const rs = REGIONS.filter(r => r.continent === o.cont); return rs.length>0 && rs.every(r => G.regions[r.id].ownerId === p.id); }
  if(o.type === 'territories'){ return _myLogical(p.id).length >= o.n; }
  if(o.type === 'capitals'){ return Object.values(FACTION_CAPITALS).filter(id => G.regions[id] && G.regions[id].ownerId === p.id).length >= o.n; }
  return false;
}
function _holdsCapital(p){ return !p || !p.capitalId || (G.regions[p.capitalId] && G.regions[p.capitalId].ownerId === p.id); }

/* ===== LOBBY ===== */
const FACTION_KEYS = Object.keys(FACTIONS);
let lobbyPlayers = [
  {name:"Spieler 1",  faction:"valen",   type:"human"},
  {name:"Bot Mordrek", faction:"mordrek", type:"bot-easy"}
];

function renderLobby(){
  // ----- Player slots -----
  const wrap = $("playerList");
  wrap.innerHTML = "";
  lobbyPlayers.forEach((p, i) => {
    const fac = FACTIONS[p.faction];
    const slot = document.createElement("div");
    slot.className = "player-slot" + (i === 0 ? " host" : "");
    slot.style.setProperty("--house-color", fac.color);
    const opts = FACTION_KEYS.map(k => {
      const f = FACTIONS[k];
      const tIdx = lobbyPlayers.findIndex((pp, idx) => idx !== i && pp.faction === k);
      const taken = tIdx >= 0, sel = (k === p.faction);
      return `<button class="house-opt${taken?' taken':''}${sel?' sel':''}" data-i="${i}" data-house="${k}" ${taken?'disabled':''}>
          <span class="ho-swatch" style="background:${f.color}">${f.sigil}</span>
          <span class="ho-info"><span class="ho-name">${f.name}</span><span class="ho-motto">${f.motto}</span></span>
          <span class="ho-tag">${taken ? escapeForAttr(lobbyPlayers[tIdx].name) : (sel ? '✓' : '')}</span>
        </button>`;
    }).join("");
    slot.innerHTML = `
      <div class="slot-head">
        <div class="house-select" data-i="${i}">
          <button class="house-badge" data-i="${i}" title="Haus wählen" style="background:${fac.color}">
            <span class="sig">${fac.sigil}</span><span class="hb-name">${fac.name.replace('Haus ','')}</span><span class="hb-caret">▾</span>
          </button>
          <div class="house-dropdown" data-i="${i}">${opts}</div>
        </div>
        <input type="text" class="name-input" data-i="${i}" value="${p.name.replace(/"/g,'&quot;')}" maxlength="22" />
        <button class="rm-slot" data-i="${i}" ${lobbyPlayers.length<=2?'disabled':''} title="Spieler entfernen">✕</button>
      </div>
      <div class="type-row">
        <button class="type-btn ${p.type==='human'?'active':''}"     data-i="${i}" data-t="human">👤 Mensch</button>
        <button class="type-btn ${p.type==='bot-easy'?'active':''}"  data-i="${i}" data-t="bot-easy">🤖 Leicht</button>
        <button class="type-btn ${p.type==='bot-normal'?'active':''}" data-i="${i}" data-t="bot-normal">🤖 Normal</button>
        <button class="type-btn ${p.type==='bot-hard'?'active':''}"  data-i="${i}" data-t="bot-hard">💀 Schwer</button>
      </div>
    `;
    wrap.appendChild(slot);
  });

  // Wire player-slot events
  wrap.querySelectorAll(".name-input").forEach(el => el.oninput = e => {
    const idx = +e.target.dataset.i;
    lobbyPlayers[idx].name = e.target.value;
    // Slot 0 gehört dem Gastgeber selbst — seinen Anzeigenamen mitziehen, damit
    // Gäste den Host nicht als Platzhalter ("Du"/"Spieler 1") sehen.
    if(idx === 0 && sync.role === 'host') sync.hostName = e.target.value || 'Gastgeber';
    // Umbenennungen im Online-Betrieb live an die Gäste spiegeln. Der oninput
    // feuert pro Tastendruck, deshalb entprellt broadcasten (nicht bei jedem
    // Zeichen ein Netzpaket).
    if(sync.role === 'host' && sync.connected){
      clearTimeout(renderLobby._nameBroadcastT);
      renderLobby._nameBroadcastT = setTimeout(wbBroadcastLobby, 250);
    }
  });
  wrap.querySelectorAll(".type-btn").forEach(el => el.onclick = e => {
    lobbyPlayers[+e.currentTarget.dataset.i].type = e.currentTarget.dataset.t;
    renderLobby();
  });
  wrap.querySelectorAll(".rm-slot").forEach(el => el.onclick = e => {
    lobbyPlayers.splice(+e.currentTarget.dataset.i, 1);
    renderLobby();
  });
  // Haus-Dropdown öffnen/schließen
  wrap.querySelectorAll(".house-badge").forEach(el => el.onclick = e => {
    e.stopPropagation();
    const dd = e.currentTarget.parentElement.querySelector(".house-dropdown");
    const wasOpen = dd.classList.contains("open");
    wrap.querySelectorAll(".house-dropdown.open").forEach(d => d.classList.remove("open"));
    if(!wasOpen) dd.classList.add("open");
  });
  // Haus aus dem Dropdown wählen (belegte sind deaktiviert)
  wrap.querySelectorAll(".house-opt").forEach(el => el.onclick = e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if(btn.classList.contains("taken")) return;
    lobbyPlayers[+btn.dataset.i].faction = btn.dataset.house;
    renderLobby();
  });
  // Klick außerhalb schließt offene Dropdowns (einmalig registrieren)
  if(!window._houseDDClose){
    window._houseDDClose = true;
    document.addEventListener("click", () => {
      document.querySelectorAll(".house-dropdown.open").forEach(d => d.classList.remove("open"));
    });
  }

  // ----- Player count -----
  const cnt = $("playerCount");
  if(cnt) cnt.textContent = `${lobbyPlayers.length} / 7`;

  // ----- Eyebrow text based on mode -----
  const eyebrow = $("lobbyEyebrow");
  if(eyebrow){
    const humans = lobbyPlayers.filter(p => p.type === "human").length;
    eyebrow.textContent = (humans > 1 ? "Hotseat · " : "") + "Neue Partie";
  }
  if(typeof renderLobbyMap === 'function') renderLobbyMap();
  if(typeof loadOptionsUI === 'function') loadOptionsUI();
  if(typeof wbUpdateFigureToggle === 'function') wbUpdateFigureToggle();

  // ----- Online: claimed-slot badges + host broadcast / guest read-only -----
  wrap.querySelectorAll(".player-slot").forEach((slot, i) => {
    const p = lobbyPlayers[i];
    if(p && p.clientId){
      const head = slot.querySelector(".slot-head");
      if(head && !head.querySelector(".wb-online-badge")){
        const badge = document.createElement("span");
        badge.className = "wb-online-badge";
        badge.textContent = (p.clientId === wbClientId) ? "🌐 Du" : "🌐 Online";
        badge.style.cssText = "font-size:11px;font-weight:700;color:#7ee787;padding:2px 7px;border-radius:999px;background:rgba(126,231,135,.14);white-space:nowrap";
        head.appendChild(badge);
      }
    } else if(sync.role === 'host' && sync.connected && p && p.type === 'human'){
      const head = slot.querySelector(".slot-head");
      if(head && !head.querySelector(".wb-online-badge")){
        const badge = document.createElement("span");
        badge.className = "wb-online-badge";
        badge.textContent = "⏳ Wartet auf Mitspieler";
        badge.style.cssText = "font-size:11px;font-weight:700;color:var(--muted);padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.06);white-space:nowrap";
        head.appendChild(badge);
      }
    }
  });
  if(sync.role === 'guest'){
    // Guests get a read-only mirror of the host's lobby — editing is the
    // host's job, the guest just watches and waits for "Spiel starten".
    const sb = $("startGameBtn"); if(sb) sb.style.display = "none";
    const oc = $("wbOnlineCard"); if(oc) oc.style.display = "none";
  } else if(sync.role === 'host'){
    wbBroadcastLobby();
  }
  // Lock the match settings whenever they're being advertised: guests always
  // see a read-only lobby, and a host freezes the configuration as soon as the
  // game is publicly listed so it can't drift from what the browser shows.
  wbSetLobbyEditingLocked(sync.role === 'guest' || (sync.role === 'host' && !!sync.publicRoom));
  /* Bearbeitungen (Spieler, Fraktionen, Typ) über einen Reload retten. */
  wbPersistLobbyState();
}

function wbSetLobbyEditingLocked(locked){
  const wrap = $("playerList");
  if(wrap) wrap.querySelectorAll(".name-input, .rm-slot, .house-badge, .type-btn").forEach(el => el.disabled = locked);
  const addRow = document.querySelector(".add-row");
  if(addRow) addRow.style.display = locked ? "none" : "";
  const rm = $("ruleMode"); if(rm) rm.disabled = locked;
  const wc = $("winCondition"); if(wc) wc.disabled = locked;
  const hint = $("wbLockHint");
  if(hint) hint.style.display = (locked && sync.role === 'host') ? "" : "none";
}

function escapeForAttr(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

// Cycle a player's house to the next available (taken or own) faction
function cycleHouse(playerIdx){
  const current = lobbyPlayers[playerIdx].faction;
  const used = new Set(lobbyPlayers.map((p,i) => i!==playerIdx ? p.faction : null));
  const order = FACTION_KEYS;
  const startAt = (order.indexOf(current) + 1) % order.length;
  for(let off = 0; off < order.length; off++){
    const k = order[(startAt + off) % order.length];
    if(!used.has(k)){
      lobbyPlayers[playerIdx].faction = k;
      renderLobby();
      return;
    }
  }
}

// Pick an unassigned house and give it to the first slot that doesn't already own it... or rotate
function assignHouseToFirstFreeSlot(houseKey){
  // If the current first slot already controls it, no-op
  if(lobbyPlayers[0].faction === houseKey) return;
  // If any slot has it, do nothing (it's taken)
  if(lobbyPlayers.some(p => p.faction === houseKey)) return;
  // Otherwise assign to slot 0 (the host)
  lobbyPlayers[0].faction = houseKey;
  renderLobby();
}

function addPlayer(type){
  if(lobbyPlayers.length >= 7){ toast("Maximal 7 Spieler"); return; }
  const used = new Set(lobbyPlayers.map(p => p.faction));
  const free = FACTION_KEYS.find(k => !used.has(k));
  if(!free){ toast("Alle Fraktionen vergeben"); return; }
  const idx = lobbyPlayers.length + 1;
  let name;
  if(type==="human") name = `Spieler ${idx}`;
  else if(type==="bot-easy")   name = `Bot ${FACTIONS[free].name.replace('Haus ','')}`;
  else if(type==="bot-normal") name = `Bot ${FACTIONS[free].name.replace('Haus ','')}`;
  else                          name = `${FACTIONS[free].name.replace('Haus ','')} ⚔`;
  lobbyPlayers.push({name, faction:free, type});
  renderLobby();
}

$("addHumanBtn").onclick     = () => addPlayer("human");
$("addBotEasyBtn").onclick   = () => addPlayer("bot-easy");
$("addBotNormalBtn").onclick = () => addPlayer("bot-normal");
$("addBotHardBtn").onclick   = () => addPlayer("bot-hard");

/* ── Lobby: "Online-Partie" host toggle ──────────────────────────── */
$("wbOnlineToggle")?.addEventListener("click", () => {
  const on = $("wbOnlineToggle").classList.contains("on"); // .toggle's own generic handler already flipped this class
  const box = $("wbOnlineHostBox");
  if(box) box.style.display = on ? "" : "none";
  if(on && sync.role === 'none'){
    wbConnect('host', wbMakeRoomCode());
  } else if(!on && sync.role === 'host'){
    if(sync.socket) try{ sync.socket.close(); }catch(e){}
    sync.role = 'none'; sync.connected = false;
    // Leaving online also drops the public listing — clear the flag and unlock.
    sync.publicRoom = false;
    const pc = $("wbPublicRoomCheck"); if(pc) pc.checked = false;
    renderLobby();
  }
});
$("wbPublicRoomCheck")?.addEventListener("change", () => {
  sync.publicRoom = $("wbPublicRoomCheck").checked;
  // Re-render so the settings lock is applied/removed; the host broadcast in
  // renderLobby carries the new public flag (in hostMeta) to the relay too.
  renderLobby();
});
$("wbCopyInviteBtn")?.addEventListener("click", () => {
  const v = $("wbInviteLink")?.value || "";
  if(navigator.clipboard) navigator.clipboard.writeText(v).then(() => toast("✓ Link kopiert")).catch(() => {});
});
function wbMakeInviteUrl(room){
  try{
    const u = new URL(location.href);
    u.search = "";
    u.searchParams.set('join', room);
    return u.toString();
  }catch(e){ return room; }
}

/* Sieg-/Regel-Auswahl über einen Reload retten (nur lokale Lobby). */
["ruleMode","winCondition"].forEach(id => {
  const el = document.getElementById(id);
  if(el) el.addEventListener("change", wbPersistLobbyState);
});

$("startGameBtn").onclick = () => {
  if(sync.role === 'guest') return;   // only the host starts the game
  if(lobbyPlayers.length < 2){ toast("Mindestens 2 Spieler"); return; }
  const facs = new Set(lobbyPlayers.map(p => p.faction));
  if(facs.size !== lobbyPlayers.length){ toast("Jede Fraktion nur einmal"); return; }
  /* Kartenwechsel in der Lobby läuft reload-frei (nur 2D-Minimap). Die 3D-Engine
     wurde aber für die BEIM LADEN gewählte Karte gebaut. Weicht die gewählte
     Karte davon ab, hier EINMALIG neu laden (mit Auto-Start), damit die neue
     Karte greift — statt bei jedem Kachel-Klick. */
  const sel = (typeof window !== 'undefined' && window.WB_LOBBY_MAP) || __WB_MAP_ID;
  if(sel !== __WB_MAP_ID && window.WB_MAPS && window.WB_MAPS[sel]){
    try{
      var _wc = document.getElementById('winCondition');
      var _rm = document.getElementById('ruleMode');
      sessionStorage.setItem('warbound.lobbyReturn', JSON.stringify({
        mode: (typeof gameMode !== 'undefined' ? gameMode : 'sp'),
        players: lobbyPlayers,
        winCondition: _wc ? _wc.value : null,
        ruleMode: _rm ? _rm.value : null
      }));
      sessionStorage.setItem('warbound.autostart', '1');
    }catch(e){}
    try{ localStorage.setItem('warbound.map', sel); }catch(e){}
    const url = new URL(location.href);
    url.searchParams.set('map', sel);
    location.href = url.toString();
    return;
  }
  startGame();
};

/* ===== GAME START — Risk-Style Setup ===== */

// Klassische Risk-Armeen pro Spieleranzahl
const RISK_START_ARMIES = {2:40, 3:35, 4:30, 5:25, 6:20, 7:15};

function startGame(){
  G = newGame();
  G.winCondition = $("winCondition").value;
  G.ruleMode = ($("ruleMode") && $("ruleMode").value) || "standard";
  // Startarmeen & Gold richten sich nach den Regeln, nicht nach Eingaben:
  // Armeen je nach Spielerzahl (RISK_START_ARMIES, siehe unten), Gold fest nach Modus.
  G.settings.startTroops = 25;                                  // Fallback; tatsächlich RISK_START_ARMIES
  G.settings.startGold   = (G.ruleMode === "gefecht") ? 0 : 3;  // Gefecht ohne Gold, sonst 3

  const realPlayerCount = lobbyPlayers.length;
  const is2Player = realPlayerCount === 2;

  G.players = lobbyPlayers.map((p, i) => ({
    id:i, name:p.name, faction:p.faction, type:p.type, clientId:p.clientId || null,
    gold:G.settings.startGold, hand:[], characters:[],
    troopsAvailable:0, eliminated:false
  }));

  if(is2Player){
    G.players.push({
      id:2, name:"Neutral", faction:"neutral", type:"neutral",
      gold:0, hand:[], characters:[], troopsAvailable:0, eliminated:false
    });
  }

  /* G.regions: gleichnamige Stücke teilen sich EIN State-Objekt → ein
     gemeinsamer Truppen-Pool & Besitzer pro logischem Territorium. */
  LOGICAL_TERRITORIES.forEach(lt => {
    const state = {ownerId:null, troops:0, knight:false, tower:false, siege:false, deployed:false};
    lt.pieceIds.forEach(id => { G.regions[id] = state; });
  });

  // Logische Territorien mischen und per Round-Robin verteilen
  // Zufällige Zugreihenfolge: Spieler vor der Territorien-Verteilung mischen
  G.players = shuffle(G.players);
  G.players.forEach((p, i) => { p.id = i; });

  const shuffledT = shuffle([...LOGICAL_TERRITORIES]);
  shuffledT.forEach((lt, i) => {
    const st = G.regions[lt.pieceIds[0]];
    st.ownerId = i % G.players.length;
    st.troops  = 1;
  });

  // Neutral-Bot (2-Spieler-Modus): startet wie alle anderen mit 1 Einheit
  // pro Gebiet (zuvor 2 — auf Wunsch vereinheitlicht).

  // Jedes Territorium startet mit genau 1 Truppe. Die übrigen Armeen werden
  // NICHT mehr automatisch auf Grenzgebiete gestapelt — stattdessen erhält
  // jeder Spieler seine Verstärkungen rundenweise (Runde 1 = Aufstellung)
  // und platziert sie selbst.

  // Gebietskarten: eine Karte pro Territorium, Symbol zyklisch zugewiesen
  const SYMBOLS = ['knight','tower','siege'];
  G.deck = shuffle(REGIONS.map((r, i) => ({
    type:    'territory',
    regionId: r.id,
    name:    r.name,
    symbol:  SYMBOLS[i % 3]
  })));
  G.discard = [];

  // Ziele-Modus: jedem Spieler die eigene Hauptstadt sichern + einen Auftrag geben
  if(G.winCondition === "ziele"){
    G.players.forEach(p => {
      if(p.type === "neutral") return;
      const capId = (typeof FACTION_CAPITALS !== 'undefined') ? FACTION_CAPITALS[p.faction] : null;
      if(capId && G.regions[capId]){
        const st = G.regions[capId];
        st.ownerId = p.id;
        st.troops = Math.max(st.troops, 3);
        p.capitalId = capId;
      }
      p.objective = _assignObjective(p);
    });
  }

  currentGameId = generateGameId();
  setGameInUrl(currentGameId);
  autosave();
  goScreen("game");
  renderMap();
  initMapControls();
  if(sync.role === 'host') wbBroadcastSnapshot();
  setTimeout(beginTurn, 200);
}


/* ===== MAP RENDERING — Valcaryn 3D (THREE.js) ===== */
let _map3d_ready = false;

/* Karten-Ladebildschirm: überbrückt den Moment zwischen Screen-Wechsel und
   fertig aufgebauter 3D-Karte (Banner/Städte/Burgen/Figuren poppen sonst
   sichtbar nach). Wird in renderMap() gezeigt und nach dem Aufbau ausgeblendet. */
let _mapLoaderSafety = null;
let _mapLoaderVisible = false;
/* Eine aufgeschobene Aktion (z. B. die Zugankündigung), die erst laufen soll,
   wenn der Ladebildschirm weg ist. runAfterMapLoader() reiht sie ein, solange
   der Loader sichtbar ist, sonst läuft sie sofort. */
let _pendingAfterLoader = null;
let _afterLoaderFallback = null;
/* Führt die aufgeschobene Aktion GENAU EINMAL aus (egal über welchen Weg:
   regulärer Loader-Flush oder Fallback-Timer). Verhindert doppelte oder
   verlorene Zugankündigungen. */
function _flushAfterLoader(delay){
  if(!_pendingAfterLoader) return;
  const cb = _pendingAfterLoader;
  _pendingAfterLoader = null;
  clearTimeout(_afterLoaderFallback);
  setTimeout(cb, delay);
}
function showMapLoader(){
  const el = document.getElementById('mapLoader');
  if(!el) return;
  clearTimeout(_mapLoaderSafety);
  _mapLoaderVisible = true;
  el.classList.remove('ml-hide');
  el.hidden = false;
  // Sicherheitsnetz: Loader nie länger als 5 s stehen lassen, falls der
  // Aufbau (z. B. wegen fehlender map3d-Funktionen) nie zurückmeldet.
  _mapLoaderSafety = setTimeout(hideMapLoader, 5000);
}
function hideMapLoader(){
  clearTimeout(_mapLoaderSafety);
  const wasVisible = _mapLoaderVisible;
  _mapLoaderVisible = false;
  const el = document.getElementById('mapLoader');
  if(el && !el.hidden){
    el.classList.add('ml-hide');         // Fade-out (0.5 s, siehe CSS)
    setTimeout(() => { el.hidden = true; }, 520);
  }
  // Aufgeschobene Aktion erst NACH dem Fade-out nachholen, damit die
  // Zugankündigung auf freiem Bildschirm (nicht überm Loader) erscheint.
  _flushAfterLoader(wasVisible ? 560 : 0);
}
/* Führt cb sofort aus, wenn kein Ladebildschirm läuft — sonst erst, sobald er
   vollständig ausgeblendet ist. Ein Fallback-Timer garantiert, dass cb auch
   dann läuft, wenn der Loader-Flush aus irgendeinem Grund ausbleibt (sonst
   erschien die Zugankündigung „unzuverlässig"). */
function runAfterMapLoader(cb){
  if(_mapLoaderVisible){
    _pendingAfterLoader = cb;
    clearTimeout(_afterLoaderFallback);
    _afterLoaderFallback = setTimeout(() => _flushAfterLoader(0), 2500);
  } else {
    cb();
  }
}

function renderMap(){
  showMapLoader();
  // Schwere Welt-Deko (Berge/Wälder/Felder/Sümpfe/Insel-Props/Nebel) wird beim
  // Laden aufgeschoben, damit die Seite schnell interaktiv ist. Spätestens hier
  // synchron nachbauen — VOR dem Berg-Kollisions-Pass (map3d_clearDecor…) und
  // bevor die Szene gezeigt wird (idempotent über _wbDecorBuilt).
  try{ if(typeof window._wbBuildDecorNow === 'function') window._wbBuildDecorNow(); }catch(e){}
  window._map3d_onClick = function(territoryId){
    onRegionClick(territoryId);
  };
  _map3d_ready = true;
  // Marker-Modus aus den gespeicherten Optionen übernehmen
  try{ window.WB_MARKER_MODE = getOptions().troopFigures === true ? 'figures' : 'banner'; }catch(e){}
  setTimeout(() => {
    if(typeof window.map3d_initBanners === 'function') window.map3d_initBanners();
    if(typeof window.map3d_initCities  === 'function') window.map3d_initCities();
    if(typeof window.map3d_initCastlesAndHarbors === 'function') window.map3d_initCastlesAndHarbors();
    if(typeof window.map3d_initNavalFleet === 'function') window.map3d_initNavalFleet();
    if(typeof window.map3d_initBridges === 'function') window.map3d_initBridges();
    // Spezialeinheiten weg von Städten/Burgen fächern + Figuren-Cluster ausrichten
    if(typeof window.map3d_placeSpecialsAway === 'function') window.map3d_placeSpecialsAway();
    // Berge aus den nun bekannten Gebäude-/Truppenzonen räumen
    if(typeof window.map3d_clearDecorObstructions === 'function') window.map3d_clearDecorObstructions();
    refreshMapVisuals();
    // Erst ausblenden, wenn die fertige Karte mindestens einmal gerendert wurde.
    requestAnimationFrame(() => requestAnimationFrame(hideMapLoader));
  }, 500);
}

// Push current game state colors + highlights into the 3D map
/* Feld, auf das gerade Truppen platziert werden (Verstärkung/Deploy). Nur für
   Naval-Karten genutzt: markiert das Schiff wie eine Auswahl, solange der
   Deploy-Dialog offen ist — sonst bliebe das Zielschiff unmarkiert, weil beim
   Platzieren kein G.selected gesetzt wird. */
let _placeMarkId = null;
function refreshMapVisuals(){
  if(!G || !_map3d_ready || typeof window.map3d_setOwnerColors !== 'function') return;

  // Build color map: territory id → faction color (or neutral)
  const colorMap = {};
  const selectedId  = G.selected || _placeMarkId || null;
  const p           = currentPlayer ? currentPlayer() : null;
  const targetIds   = [];
  const moveIds     = [];
  const disabledIds = [];

  REGIONS.forEach(r => {
    const data = G.regions[r.id];
    if(!data) return;

    if(data.ownerId === null){
      colorMap[r.id] = r.continent === 'Frostmark' ? '#aab4c2' : '#4a4a55';
    } else {
      const owner = G.players[data.ownerId];
      if(!owner) return;
      // Neutral bot → grau
      if(owner.type === "neutral"){
        colorMap[r.id] = '#6a7280';
      } else {
        colorMap[r.id] = FACTIONS[owner.faction].color;
      }
    }

    // Classify for highlight
    if(p){
      const owner = data.ownerId;
      if(G.phase === 'setup'){
        // In Setup: eigene Gebiete hervorheben, andere dimmen
        if(owner !== p.id) disabledIds.push(r.id);
      } else if(G.phase === 'reinforce'){
        if(owner !== p.id) disabledIds.push(r.id);
      } else if(G.phase === 'attack'){
        if(owner !== p.id || data.troops < 2) disabledIds.push(r.id);
      } else if(G.phase === 'move'){
        if(owner !== p.id || (data.troops < 2 && !data.knight && !data.siege)) disabledIds.push(r.id);
      }
    }
  });

  window.map3d_setOwnerColors(colorMap);

  /* Kontinent-Glow: hält EIN Spieler (Mensch oder Bot, nicht Neutral) ALLE
     Gebiete eines Kontinents, leuchtet dessen Umrandung in der Hausfarbe —
     der Kontinent-Bonus ist so direkt auf der Karte ablesbar. */
  if(typeof window.map3d_setContinentGlow === 'function'){
    const contGlow = {};
    CONTINENTS.forEach(c => {
      const regs = REGIONS.filter(r => r.continent === c.key);
      if(!regs.length) return;
      const first = G.regions[regs[0].id];
      const oid = first ? first.ownerId : null;
      if(oid === null || oid === undefined) return;
      if(!regs.every(r => G.regions[r.id] && G.regions[r.id].ownerId === oid)) return;
      const owner = G.players[oid];
      if(!owner || owner.type === 'neutral' || owner.eliminated) return;
      contGlow[c.key] = FACTIONS[owner.faction].color;
    });
    window.map3d_setContinentGlow(contGlow);
  }

  // 3D-Banner-System: ein Banner pro logischem Territorium
  if(typeof window.map3d_updateBanners === 'function'){
    const ownerMap = {};
    LOGICAL_TERRITORIES.forEach(lt => {
      const data = G.regions[lt.pieceIds[0]];
      if(!data || data.ownerId === null){ ownerMap[lt.key] = null; return; }
      const owner = G.players[data.ownerId];
      if(!owner || data.troops < 1){ ownerMap[lt.key] = null; return; }
      const facKey = owner.type === 'neutral' ? 'neutral' : owner.faction;
      const cfg = FACTION_BANNER_CFG[facKey] || FACTION_BANNER_CFG.neutral;
      ownerMap[lt.key] = {
        facKey, troops: data.troops, accent: cfg.accent,
        knight: !!data.knight, tower: !!data.tower, siege: !!data.siege
      };
    });
    window.map3d_updateBanners(ownerMap);
  }

  // Compute targets from selection
  if(selectedId && p){
    const sel = REGIONS.find(r => r.id === selectedId);
    if(sel){
      const nb = _logNeighborPieces(selectedId);   // logisch benachbarte Stücke
      if(G.phase === 'attack'){
        nb.forEach(nid => {
          if(G.regions[nid] && G.regions[nid].ownerId !== p.id) targetIds.push(nid);
        });
      } else if(G.phase === 'move'){
        // alle über EIGENE Gebiete zusammenhängenden eigenen Gebiete als Ziel
        _ownedConnectedPieces(selectedId, p.id).forEach(nid => {
          if(G.regions[nid]) moveIds.push(nid);
        });
      }
    }
  }

  // Kontinente, die komplett EINEM Besitzer gehören → hervorheben (Bonus aktiv)
  const bonusIds = [];
  CONTINENTS.forEach(c => {
    const regs = REGIONS.filter(r => r.continent === c.key);
    if(!regs.length) return;
    const first = G.regions[regs[0].id];
    const owner = first ? first.ownerId : null;
    if(owner === null || owner === undefined) return;
    if(regs.every(r => G.regions[r.id] && G.regions[r.id].ownerId === owner)){
      regs.forEach(r => bonusIds.push(r.id));
    }
  });
  if(typeof window.map3d_setBonusContinents === 'function') window.map3d_setBonusContinents(bonusIds);

  // Alle Teilstücke des ausgewählten logischen Territoriums hervorheben
  const selectedPieceIds = selectedId
    ? (LOGICAL_TERRITORIES.find(lt => lt.pieceIds.includes(selectedId))?.pieceIds || [selectedId])
    : [];

  if(_battleHighlight) {
    // Kampfmodus: alle Teilstücke beider Kampf-Territorien bestimmen
    const fromPieces = LOGICAL_TERRITORIES.find(lt => lt.pieceIds.includes(_battleHighlight.fromId))?.pieceIds || [_battleHighlight.fromId];
    const toPieces   = LOGICAL_TERRITORIES.find(lt => lt.pieceIds.includes(_battleHighlight.toId))?.pieceIds  || [_battleHighlight.toId];
    const combatSet  = new Set(disabledIds);
    const combatPieceSet = new Set([...fromPieces, ...toPieces]);
    REGIONS.forEach(r => { if(!combatPieceSet.has(r.id)) combatSet.add(r.id); });
    window.map3d_setHighlights(fromPieces, toPieces, [], [...combatSet], true);
  } else {
    window.map3d_setHighlights(selectedPieceIds, targetIds, moveIds, disabledIds, false);
  }
}

// Compatibility alias
function renderMarkers(){ refreshMapVisuals(); }

/* ===== EINHEITENMARKER =====
   Der Banner SELBST ist jetzt der Einheitenmarker: die Truppenzahl steht
   direkt auf dem Tuch (siehe _makeBannerTex), Spezialeinheiten als 3D-
   Modelle daneben. Das frühere HTML-Overlay (#markerLayer mit projizierten
   .troop-num-Elementen) wurde dadurch überflüssig und entfernt.          */

// Camera controls exposed to the zoom buttons in HTML
window.map3d_camZoom  = function(factor){ if(typeof zoomBy==='function') zoomBy(factor); };
window.map3d_camReset = function(){ if(typeof resetView==='function') resetView(); };

/* ===== PANEL TOGGLE ===== */
/* ===== Card viewer modal with tabs ===== */
function _switchCardsTab(tab){
  const terrPanel    = $("tabTerrPanel");
  const councilPanel = $("tabCouncilPanel");
  const terrBtn      = $("tabTerrBtn");
  const councilBtn2  = $("tabCouncilBtn");
  if(!terrPanel || !councilPanel) return;
  const showCouncil = (tab === 'council');
  if(showCouncil){ councilPanel.removeAttribute('hidden'); terrPanel.setAttribute('hidden',''); }
  else           { terrPanel.removeAttribute('hidden'); councilPanel.setAttribute('hidden',''); }
  if(terrBtn)    terrBtn.classList.toggle('active', !showCouncil);
  if(councilBtn2) councilBtn2.classList.toggle('active', showCouncil);
}
function openCardsModal(tab){
  // Defensive: nur die eigene Hand zeigen. Maßgeblich ist der EIGENE Sitz —
  // online sieht man so jederzeit die eigenen Karten, unabhängig davon, wer
  // gerade am Zug ist.
  if(wbLocalPlayer()?.type !== "human") return;
  const isCouncil = (tab === 'council');
  // Render only the relevant content
  if(!isCouncil){ try{ if(typeof renderCards === "function") renderCards(); }catch(e){} }
  else           { try{ if(typeof renderCouncilHandModal === "function") renderCouncilHandModal(); }catch(e){} }
  // Switch panels and hide the tab row so both can't be toggled
  _switchCardsTab(isCouncil ? 'council' : 'territory');
  const tabRow = $("cardsModal")?.querySelector('.cards-modal-tabs');
  if(tabRow) tabRow.style.display = 'none';
  // Update title
  const titleEl = $("cardsModal")?.querySelector('h2');
  if(titleEl) titleEl.textContent = isCouncil ? '🏛 Ratskarten' : '📜 Gebietskarten';
  const m = $("cardsModal"); if(m) m.classList.add("show");
}
function closeCardsModal(){
  const m = $("cardsModal"); if(m) m.classList.remove("show");
}
// Council hand: redirect into the cards modal council tab
function openCouncilHandModal(){ openCardsModal('council'); }
function closeCouncilHandModal(){ closeCardsModal(); }

/* Fraktion-Seitenleiste: großes Wappen, Klick zeigt Details aller Fraktionen.
   Hervorgehoben ("fsi-active") ist immer der Spieler/Bot, der gerade am Zug
   ist — kein Panel ist automatisch aufgeklappt, jedes (auch das aktive) wird
   nur per Klick ein-/ausgeklappt.
   _fsiOpenIdx merkt sich das manuell aufgeklappte Panel über Re-Renders hinweg —
   updateHUD() (und damit dieses Render) läuft auch während eines Bot-Zugs sehr
   häufig, ohne das würde ein gerade geöffnetes Panel sofort wieder zuklappen. */
let _fsiOpenIdx = null;
function _renderFactionSidebar(){
  const sb = $("factionSidebar");
  if(!sb || !G || !G.players) return;
  const activeIdx = G.currentPlayerIdx;
  if(_fsiOpenIdx != null && (!G.players[_fsiOpenIdx] || G.players[_fsiOpenIdx].eliminated)) _fsiOpenIdx = null;
  sb.innerHTML = G.players.map((p, idx) => {
    if(p.type === "neutral") return '';
    const fac   = FACTIONS[p.faction];
    const elim  = !!p.eliminated;
    const terrs = elim ? [] : ownedTerritoryStates(p.id);
    const troops      = terrs.reduce((s, d) => s + d.troops, 0);
    const terrCards   = _territoryCardCount(p);
    const councilCards= _councilCardCount(p);
    const isNow = !elim && (idx === activeIdx);
    const col   = fac.color;
    const cardStyle = isNow
      ? `border-color:${col};box-shadow:0 0 0 1px ${col}55,0 0 14px ${col}44;`
      : elim ? 'border-color:rgba(255,255,255,.06);'
             : `border-color:${col}44;`;
    const popup = !elim ? `
  <div class="fsi-popup">
    <div class="fsi-popup-head" style="color:${col}">${fac.sigil} ${fac.name}</div>
    <div class="fsi-popup-player">${p.name}</div>
    <div class="fsi-popup-stats">
      <div class="fsi-popup-row"><span>🗺 Gebiete</span><b>${terrs.length}</b></div>
      <div class="fsi-popup-row"><span>🛡 Truppen</span><b>${troops}</b></div>
      <div class="fsi-popup-row"><span>📜 Gebietskarten</span><b>${terrCards}</b></div>
      <div class="fsi-popup-row"><span>🏛 Ratskarten</span><b>${councilCards}</b></div>
    </div>
  </div>` : '';
    const clickable = !elim ? ' fsi-clickable' : '';
    const openCls = (idx === _fsiOpenIdx) ? ' fsi-open' : '';
    return `<div class="fsi-card${isNow?' fsi-active':''}${elim?' fsi-eliminated':''}${clickable}${openCls}" data-fsi-idx="${idx}" style="${cardStyle}">
  <div class="fsi-sigil" style="color:${elim?'var(--muted)':col}">${fac.sigil}</div>${popup}
</div>`;
  }).join('');

  sb.querySelectorAll('.fsi-clickable').forEach(card => {
    card.addEventListener('click', e => {
      e.stopPropagation();
      const idx = +card.dataset.fsiIdx;
      _fsiOpenIdx = (_fsiOpenIdx === idx) ? null : idx;
      sb.querySelectorAll('.fsi-card').forEach(c => c.classList.toggle('fsi-open', +c.dataset.fsiIdx === _fsiOpenIdx));
    });
  });

  if(!window._fsiClickClose){
    window._fsiClickClose = true;
    document.addEventListener('click', () => {
      _fsiOpenIdx = null;
      $("factionSidebar")?.querySelectorAll('.fsi-open').forEach(c => c.classList.remove('fsi-open'));
    });
  }
}

/* ===== MAP CONTROLS — now handled by the 3D OrbitControls ===== */
// initMapControls, mapZoomBtn kept as stubs to avoid ReferenceErrors
function initMapControls(){}
function mapZoomBtn(){}

/* ===== TOOLTIP ===== */
function showTooltip(e, html){
  const tt = $("tooltip");
  tt.innerHTML = html;
  tt.classList.add("show");
  tt.style.left = (e.clientX + 14) + "px";
  tt.style.top  = (e.clientY + 14) + "px";
}
function hideTooltip(){ $("tooltip").classList.remove("show"); }
function regionTooltip(id){
  const r = REGIONS.find(x => x.id === id);
  const d = G.regions[id];
  const owner = d.ownerId === null ? "Neutral" : G.players[d.ownerId].name;
  const fac = d.ownerId === null ? "" : FACTIONS[G.players[d.ownerId].faction].name;
  const c = CONTINENTS.find(x => x.key === r.continent);
  let specials = "";
  if(d.knight) specials += "♞ Ritter (+1 höchster Würfel)<br>";
  if(d.tower)  specials += "🏰 Turm (Verteidigung als W8)<br>";
  if(d.siege)  specials += "⚙ Katapult (1 W6 wird W8 beim Angriff)<br>";
  return `<b>${r.name}</b><br>
    <span style="color:#9a907c">${c.name} · ${owner}${fac?' ('+fac+')':''}</span><br>
    Truppen: <b>${d.troops}</b>
    ${specials ? "<br>"+specials : ""}`;
}

/* ===== TURN MANAGEMENT ===== */
async function beginTurn(){
  forceCloseBattleOverlay();   // hängendes Kampf-Dialogfenster nie ins eigene Zug mitnehmen
  const p = currentPlayer();
  if(p.eliminated){ nextTurn(); return; }

  const fac = FACTIONS[p.faction];
  G.phase = "reinforce";
  G.selected = null;
  G.pendingTarget = null;   // evtl. offene Zielauswahl der Vorrunde verwerfen
  // Sicherheit: endPhaseBtn immer freischalten zu Rundenanfang
  const _epb = $("endPhaseBtn"); if(_epb) _epb.disabled = false;
  // deployed-Flags zurücksetzen damit alle Territorien wieder belegbar sind
  Object.values(G.regions).forEach(r => { r.deployed = false; });

  // Income calculation
  const myTerr = ownedTerritoryStates(p.id);  // region-state objects
  // IDs aller eigenen Territorien (für Städte/Burgen-Abgleich)
  const myTerrIds = new Set(
    REGIONS.filter(r => G.regions[r.id] && G.regions[r.id].ownerId === p.id).map(r => r.id)
  );

  // Städte: Territorien in FACTION_CAPITALS die mir gehören (zählen doppelt)
  const cityCount = Object.values(FACTION_CAPITALS).filter(id => myTerrIds.has(id)).length;
  // Burgen: Territorien in _castlesMap die mir gehören
  const castleCount = (typeof _castlesMap !== 'undefined')
    ? [..._castlesMap.keys()].filter(id => myTerrIds.has(id)).length
    : 0;
  // Formel: ((städte × 2) + territorien + burgen) ÷ 3, min 3
  let troopGain = Math.max(3, Math.floor((cityCount * 2 + myTerr.length + castleCount) / 3));

  // Kontinent-Bonus (entfällt diese Runde bei „Siegel der Dürre")
  if(G.droughtRound !== G.round){
    CONTINENTS.forEach(c => {
      const regs = REGIONS.filter(r => r.continent === c.key);
      if(regs.every(r => G.regions[r.id].ownerId === p.id)) troopGain += c.bonus;
    });
  }
  // Fairness-Ausgleich für Runde 1: wer später am Zug ist, hat das Nachsehen,
  // weil frühere Spieler schon reagieren/angreifen können. p.id ist die
  // 0-basierte Zugreihenfolge → Spieler 1 +0, Spieler 2 +1, Spieler 3 +2, usw.
  if(G.round === 1) troopGain += p.id;
  p.troopsAvailable = Math.max(3, troopGain);  // Minimum immer 3
  const gefecht = (G.ruleMode === "gefecht");
  const goldGain = gefecht ? 0 : (2 + Math.floor(myTerr.length / 4));
  p.gold += goldGain;

  // Charaktereffekte zu Rundenbeginn (entfallen im Gefecht-Modus)
  p._conqueredCount = 0;            // für „Kriegskasse" / Eroberungs-Boni
  if(!gefecht) applyStartOfTurnCharacters(p);

  log(`<b>${p.name}</b> beginnt Runde ${G.round}. +${troopGain} Truppen${gefecht ? "" : (", +"+goldGain+" Gold")}.`);

  // Hoher-Rat-Phase: verdeckte Karte wird am Phasenende neu gezogen
  G.councilBoughtThisRound = false;

  // Save only now that troopsAvailable/gold/character effects for this turn
  // are actually applied — autosaving any earlier (e.g. right after
  // advancing currentPlayerIdx/round in nextTurn(), before this function
  // runs) persisted a snapshot from the *previous* turn. A reload during
  // the brand-new reinforce phase then restored troopsAvailable=0 (left
  // over from the end of that player's last turn), making it look like no
  // troops could ever be placed.
  autosave();

  updateHUD();

  // Zugankündigung: prominentes Banner für 2,5 Sekunden — für ALLE Spieler,
  // auch Bots, damit immer sichtbar ist, wer dran ist und wie viele Truppen
  // er bekommt (vorher nur für Menschen, Bot-Züge liefen unangekündigt).
  // Beim allerersten Zug erscheint das Banner (und der Zugstart) erst NACH dem
  // Karten-Ladebildschirm — sonst überdeckt der Loader die Truppen-Info bzw.
  // sie verstreicht noch hinter dem Ladescreen. runAfterMapLoader() läuft
  // sofort, wenn gerade kein Loader aktiv ist (alle Folgezüge).
  runAfterMapLoader(() => {
    const tb = $("turnBanner");
    if(tb){
      $("turnBannerFaction").textContent = fac.sigil;
      $("turnBannerFaction").style.color = fac.color;
      $("turnBannerName").textContent    = p.name;
      $("turnBannerSub").textContent     = FACTIONS[p.faction].name + " — Verstärkungsphase";
      const tbT = $("turnBannerTroops"); if(tbT) tbT.textContent = "+" + p.troopsAvailable;
      const tbTS = $("turnBannerTroopsSub"); if(tbTS) tbTS.style.display = "";
      tb.style.display   = "block";
      setTimeout(() => { tb.style.opacity="1"; tb.style.transform="translate(-50%,-50%) scale(1)"; }, 20);
      setTimeout(() => { tb.style.opacity="0"; tb.style.transform="translate(-50%,-50%) scale(.8)"; }, 2000);
      setTimeout(() => { tb.style.display="none"; if(tbTS) tbTS.style.display="none"; }, 2350);
    }

    if(p.type !== "human"){
      setTimeout(runBotTurn, 600);
    } else {
      toast(`${p.name} ist am Zug`);
      if(G.winCondition === "ziele" && p.objective){
        setTimeout(() => toast("🎯 Auftrag: " + p.objective.label + (_holdsCapital(p) ? "" : " ⚠ Hauptstadt verloren!")), 2600);
      }
    }
  });
}

function updateHUD(){
  if(!G) return;
  if(sync.role === 'host') wbBroadcastSnapshot();
  // cur = wer gerade am Zug ist (nur die Anzeige links oben). me = der eigene
  // Sitz dieses Browsers — Kopf-/Fußzeile und Kartenliste zeigen IMMER die
  // eigenen Werte, egal wer dran ist (im SP/Hotseat sind cur und me identisch).
  const cur = currentPlayer();
  const facCur = FACTIONS[cur.faction];
  const p = wbLocalPlayer();
  const fac = FACTIONS[p.faction];
  $("currentName").textContent = cur.name;
  $("currentDot").style.background = facCur.color;
  $("currentDot").style.color = facCur.color;

  const phaseLabels = {
    reinforce: "Verstärkung",
    attack:    "Angriff",
    move:      "Bewegung",
    bot:       "Bot denkt…"
  };
  const phaseLabel = phaseLabels[G.phase] || G.phase;
  $("phasePill").textContent = phaseLabel;
  if(!G.pendingTarget) $("phasePill").style.background = "";
  const epb2 = $("endPhaseBtn");
  if(epb2){
    let btnLabel;
    if(G.phase === "reinforce")   btnLabel = (G.round === 1) ? "Zug beenden ▶" : "Zur Angriffsphase ▶";
    else if(G.phase === "attack") btnLabel = "Zur Bewegungsphase ▶";
    else if(G.phase === "move")   btnLabel = "Zug beenden ▶";
    else                          btnLabel = "Phase beenden ▶";
    epb2.textContent = btnLabel;
  }
  // Hoher Rat nur in Verstärkungsphase; im Gefecht-Modus ausgeblendet
  const gefecht = (G.ruleMode === "gefecht");
  // Kauf-Aktionen (Rat/Charaktere) bleiben an den AKTUELLEN Spieler gebunden —
  // nur wer am Zug ist, kauft. Die reine Ansicht der EIGENEN Karten (bps-Buttons)
  // hängt dagegen am eigenen Sitz und bleibt immer verfügbar.
  const isCurHuman = cur.type === "human";
  const isMeHuman  = p.type === "human";
  const cb = $("councilBtn");
  if(cb){
    cb.style.display = (isCurHuman && !gefecht) ? "" : "none";
    cb.disabled = false;
    const canBuyNow = G.phase === "reinforce" && !G.councilBoughtThisRound;
    cb.title = canBuyNow ? "Ratskarte kaufen (1 Gold)" : "Ratskarten ansehen";
    cb.style.opacity = canBuyNow ? "" : "0.6";
  }
  const chb = $("charBtn"); if(chb) chb.style.display = (gefecht || !isCurHuman) ? "none" : "";
  ["bpsCardsBtn","bpsCouncilCardsBtn"].forEach(id => { const el = $(id); if(el) el.style.display = isMeHuman ? "" : "none"; });

  const myTerr   = ownedTerritoryStates(p.id);
  const myTroops = myTerr.reduce((s,d) => s + d.troops, 0);

  // ownedTerritoryStates() liefert die (deduplizierten) Zustandsobjekte —
  // die haben kein .id-Feld! Für Hauptstädte/Burgen/Häfen (definiert über
  // konkrete Pfad-IDs) muss direkt über G.regions[id].ownerId geprüft werden,
  // genau wie schon in beginTurn() bei der Einkommensberechnung.
  const myCapitals = Object.values(FACTION_CAPITALS).filter(id => G.regions[id] && G.regions[id].ownerId === p.id).length;
  const myCastles  = (typeof _castlesMap !== 'undefined')
    ? [..._castlesMap.keys()].filter(id => G.regions[id] && G.regions[id].ownerId === p.id).length : 0;
  const myHarbors  = (typeof _harborsMap !== 'undefined')
    ? [..._harborsMap.keys()].filter(id => G.regions[id] && G.regions[id].ownerId === p.id).length : 0;

  // Gold und Handkarten sind verdeckte Informationen, Truppen/Gebiete sind
  // ohnehin schon auf der Karte sichtbar und werden daher nicht maskiert.
  const _hidden = v => isMeHuman ? v : "-";

  $("statGold").textContent      = _hidden(p.gold);
  $("statTroops").textContent    = myTroops;
  $("statRegions").textContent   = myTerr.length;
  $("statCards").textContent     = _hidden(_territoryCardCount(p));
  { const el = $("statCapitals"); if(el) el.textContent = myCapitals; }
  { const el = $("statCastles");  if(el) el.textContent = myCastles; }
  { const el = $("statHarbors");  if(el) el.textContent = myHarbors; }

  $("piFaction").textContent  = fac.sigil + " " + fac.name;
  $("piFaction").style.color  = fac.color;
  $("piGold").textContent     = _hidden(p.gold);
  $("piRegions").textContent  = myTerr.length;
  $("piTotalTroops").textContent = myTroops;
  $("piMotto").textContent    = "„" + fac.motto + "\u201C";
  $("roundLabel").textContent = "Runde " + G.round;
  $("cardsLabel").textContent = _hidden(_territoryCardCount(p)) + "/5";
  { const cl = $("councilLabel"); if(cl) cl.textContent = _hidden(_councilCardCount(p)) + "/3"; }
  $("stripName").textContent    = fac.sigil + " " + p.name;
  $("stripGold").textContent    = _hidden(p.gold);
  $("stripRegions").textContent = myTerr.length;
  $("stripTroops").textContent  = myTroops;
  $("stripCards").textContent   = _hidden(_territoryCardCount(p));
  { const sp = $("stripPhase"); if(sp) sp.textContent = phaseLabel; }
  const scEl = $("stripCouncilCards"); if(scEl) scEl.textContent = _hidden(_councilCardCount(p));
  _renderFactionSidebar();

  if(isMeHuman) renderCards();
  refreshMapVisuals();
  if(typeof _bonusOn !== 'undefined' && _bonusOn && typeof renderBonusOverlay === 'function') renderBonusOverlay();
  if(typeof _overviewOn !== 'undefined' && _overviewOn && typeof renderTroopOverview === 'function') renderTroopOverview();
}

function markPossibleTargets(){
  const sel = REGIONS.find(r => r.id === G.selected);
  if(!sel) return;
  const p = currentPlayer();
  const nb = _logNeighborPieces(sel.id);
  if(G.phase === "attack"){
    nb.forEach(nid => {
      const data = G.regions[nid];
      if(data && data.ownerId !== p.id){ const el=$("region-"+nid); if(el) el.classList.add("target"); }
    });
  } else if(G.phase === "move"){
    // angrenzende EIGENE Gebiete als Zielgebiete markieren
    nb.forEach(nid => {
      const data = G.regions[nid];
      if(data && data.ownerId === p.id){ const el=$("region-"+nid); if(el) el.classList.add("target-move"); }
    });
  }
}

function reachableOwn(startId, ownerId){
  const visited = new Set([startId]);
  const queue = [startId];
  while(queue.length){
    const cur = REGIONS.find(r => r.id === queue.shift());
    if(!cur) continue;
    cur.neighbors.forEach(nid => {
      if(visited.has(nid)) return;
      if(!G.regions[nid] || G.regions[nid].ownerId !== ownerId) return;
      visited.add(nid);
      queue.push(nid);
    });
  }
  return visited;
}

/* ===== CLICK HANDLING ===== */
function onRegionClick(id){
  // ── Online-Gast: Klicks, die nur ein lokales Modal öffnen (Truppen aufstellen
  //    in der Verstärkungsphase, Truppen bewegen), dürfen NICHT an den Host
  //    weitergereicht werden — sonst öffnet sich das Deploy-/Move-Fenster auf
  //    dem Bildschirm des Hosts und der Gast kann nie selbst aufstellen. Diese
  //    Modals verändern G nicht; erst ihr „Bestätigen" wird relayed (deploy-
  //    Confirm/moveConfirm). Alle Zustands-ändernden Klicks (Auswahl, Angriff,
  //    interaktive Zielauswahl) laufen weiterhin über den Host.
  if(sync.role === 'guest'){
    if(!G || sync.myPlayerId == null || G.currentPlayerIdx !== sync.myPlayerId) return; // nicht mein Zug
    const gp = G.players[sync.myPlayerId];
    if(!gp || gp.type !== 'human') return;
    const gdata = G.regions[id];
    if(!G.pendingTarget && G.phase === 'reinforce'){
      if(!gdata || gdata.ownerId !== gp.id){ toast("Nicht dein Gebiet"); return; }
      if(gp.troopsAvailable <= 0){ toast("Keine Truppen mehr"); return; }
      openDeployModal(id);              // Aufstellen läuft lokal beim Gast
      return;
    }
    if(!G.pendingTarget && G.phase === 'move' && G.selected &&
       _logKey(id) !== _logKey(G.selected) && gdata && gdata.ownerId === gp.id &&
       _ownedConnected(G.selected, id, gp.id)){
      openMoveModal(G.selected, id);    // gültiges Ziel → Bewegungs-Modal lokal
      return;
    }
    wbSendAction('onRegionClick', [id]); // alles Übrige (Auswahl/Angriff) via Host
    return;
  }
  const p = currentPlayer();
  if(!p || p.type !== "human") return;
  // Online-Host: den Zug eines ENTFERNTEN Gasts nicht selbst fahren — dessen
  // Klicks kommen relayed von seinem Browser (wbApplyingRemoteAction). Eigene
  // Sitze und lokale Hotseat-Menschen (ohne clientId) bleiben bedienbar.
  if(wbHostBlocksLocal(p)) return;

  // Interaktive Zielauswahl (Karten-/Charaktereffekt) hat Vorrang
  if(G.pendingTarget){ resolvePendingTarget(id); return; }

  // Setup-Phase: Einheit platzieren
  if(G.phase === "setup"){
    setupPlaceArmy(id);
    return;
  }

  const data = G.regions[id];

  if(G.phase === "reinforce"){
    if(data.ownerId !== p.id){ toast("Nicht dein Gebiet"); return; }
    if(p.troopsAvailable <= 0){ toast("Keine Truppen mehr"); return; }
    openDeployModal(id);
  }
  else if(G.phase === "attack"){
    if(!G.selected){
      if(data.ownerId !== p.id || data.troops < 2){ toast("Mindestens 2 Truppen nötig"); return; }
      G.selected = id; window.WBSfx?.click?.(); updateHUD();
    } else {
      if(_logKey(id) === _logKey(G.selected)){ G.selected = null; window.WBSfx?.click?.(1); updateHUD(); return; }  // selbes Territorium → abwählen
      if(data.ownerId === p.id){ G.selected = id; window.WBSfx?.click?.(); updateHUD(); return; }                   // anderes eigenes → umwählen
      // Siegel der Kaperfahrt: diese Runde darf von einem Hafen aus JEDES
      // Küstengebiet angegriffen werden (nicht nur Gebiete mit eigenem
      // Hafen-Modell), auch ohne gemeinsame Grenze.
      const _raidActive = G.raidRound === G.round && G.raidPlayerId === p.id;
      const _harborIds = (typeof __WB_MAP !== 'undefined' && Array.isArray(__WB_MAP.harbors)) ? __WB_MAP.harbors : [];
      const _isCoastal = window._coastalTerritoryIds && window._coastalTerritoryIds.has(id);
      const _isRaid = _raidActive && _harborIds.includes(G.selected) && _isCoastal;
      if(!_isRaid && !_logAdjacent(G.selected, id)){ toast("Nicht angrenzend"); return; }
      // Bündnis (Siegel der Allianz): Angriff auf den Verbündeten diese Runde sperren
      if(G.allianceRound === G.round){
        const oId = data.ownerId;
        const allied = (G.allianceA===p.id && G.players[oId] && G.players[oId].id===G.allianceB) ||
                       (G.allianceB===p.id && G.players[oId] && G.players[oId].id===G.allianceA);
        if(allied){ toast("🤝 Bündnis aktiv — Angriff auf Verbündeten nicht möglich"); return; }
      }
      window.WBSfx?.attack?.(2.0);
      startBattle(G.selected, id);
    }
  }
  else if(G.phase === "move"){
    if(!G.selected){
      if(data.ownerId !== p.id){ toast("Wähle zuerst ein eigenes Gebiet (Quelle)"); return; }
      if(data.troops < 2 && !data.knight && !data.siege){ toast("Mindestens 2 Truppen nötig (oder Ritter/Katapult vorhanden)"); return; }
      G.selected = id; window.WBSfx?.click?.();
      toast("Quelle gewählt — jetzt ein über eigene Gebiete verbundenes Zielgebiet wählen");
      updateHUD();
    } else {
      if(_logKey(id) === _logKey(G.selected)){ G.selected = null; window.WBSfx?.click?.(1); updateHUD(); return; }   // selbe Quelle → abwählen
      if(data.ownerId !== p.id){ toast("Das Ziel muss dir gehören"); return; }
      if(!_ownedConnected(G.selected, id, p.id)){
        // Nicht verbunden: als neue Quelle wählen (falls Einheiten vorhanden), sonst Hinweis
        if(data.troops >= 2 || data.knight || data.siege){ G.selected = id; window.WBSfx?.click?.(); toast("Neue Quelle gewählt"); updateHUD(); return; }
        toast("Ziel ist nicht über eigene Gebiete mit der Quelle verbunden"); return;
      }
      openMoveModal(G.selected, id);
    }
  }
}

/* ===== DEPLOY MODAL ===== */
let deployContext = null;

/* ── Spezialeinheiten im Deploy-Modal ─────────────────────────
   Jede Einheit erfordert passende Gebietskarte + Gold.
   Ritter-Karte → Ritter (1💰), Turm-Karte → Turm (1💰), 
   Katapult-Karte → Katapult (2💰)                         */
function renderSpecialExchange(regionId, p) {
  const data = G.regions[regionId];
  const wrap = $("specialToggle");
  wrap.innerHTML = "";

  const unitDefs = [
    {key:"knight", sym:"knight", icon:"♞", name:"Ritter",   gold:1},
    {key:"tower",  sym:"tower",  icon:"🏰", name:"Turm",     gold:1},
    {key:"siege",  sym:"siege",  icon:"⚙",  name:"Katapult", gold:2},
  ].filter(u => !data[u.key]);

  if(unitDefs.length === 0){
    wrap.innerHTML = `<div style="font-size:11px;color:var(--muted);padding:6px 0;font-style:italic">Alle Einheiten bereits in diesem Gebiet vorhanden.</div>`;
    return;
  }

  // Karten nach Symbol gruppieren
  const cardsBySym = {knight:[], tower:[], siege:[]};
  p.hand.forEach((c,i) => { if(cardsBySym[c.symbol]) cardsBySym[c.symbol].push({c,i}); });

  wrap.innerHTML = `<div class="exchange-header">⚔ Einheit einlösen — Gebietskarte + Gold</div>`;

  unitDefs.forEach(u => {
    const available = cardsBySym[u.sym];
    const hasCard   = available.length > 0;
    const hasGold   = p.gold >= u.gold;
    const canBuy    = hasCard && hasGold;
    const div = document.createElement("div");
    div.className = "exch-deploy-row" + (canBuy ? "" : " locked");
    div.innerHTML = `
      <div class="edr-unit"><span style="font-size:16px">${u.icon}</span> ${u.name}</div>
      <div class="edr-cost">${u.gold} 💰 + 1 ${CARD_ICONS[u.sym]}-Karte</div>
      ${canBuy
        ? `<select class="edr-card-pick" data-sym="${u.sym}">
             ${available.map(({c,i}) => `<option value="${i}">${wbRegName(c.regionId)||c.name}</option>`).join("")}
           </select>
           <button class="edr-buy-btn" data-k="${u.key}" data-gold="${u.gold}">Einlösen</button>`
        : `<div class="edr-locked">${!hasCard?"Keine "+CARD_LABELS[u.sym]+"-Karte auf der Hand":("Zu wenig Gold ("+u.gold+" 💰)")}</div>`}
    `;
    wrap.appendChild(div);
  });

  // Buy button handlers — MEHRERE Einheiten gleichzeitig wählbar (Toggle je
  // Typ). Max. eine je Typ und Territorium erzwingt bereits die unitDefs-
  // Filterung oben (vorhandene Typen erscheinen gar nicht). Die Gold-Summe
  // aller gewählten Einheiten darf das Guthaben nicht übersteigen.
  const _goldSum = () => deployContext.buildings.reduce((s,b) => s + (b.gold || 0), 0);
  wrap.querySelectorAll(".edr-buy-btn").forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.k, gold = +btn.dataset.gold || 0;
      const idx = deployContext.buildings.findIndex(b => b.building === k);
      if(idx >= 0){   // bereits ausgewählt → abwählen
        deployContext.buildings.splice(idx, 1);
        btn.classList.remove("active");
        btn.textContent = "Einlösen";
        return;
      }
      const sel = btn.closest(".exch-deploy-row").querySelector(".edr-card-pick");
      const ci = sel ? +sel.value : -1;
      if(ci < 0 || ci >= p.hand.length){ toast("Karte nicht gefunden!"); return; }
      if(_goldSum() + gold > p.gold){ toast(`Zu wenig Gold für eine weitere Einheit (${_goldSum()}+${gold} > ${p.gold} 💰)`); return; }
      deployContext.buildings.push({ building: k, cardIndex: ci, gold });
      btn.classList.add("active");
      btn.textContent = "✓ Ausgewählt — tippen zum Abwählen";
    };
  });
}

function openDeployModal(regionId){
  const p = currentPlayer();
  const max = p.troopsAvailable;
  // buildings: gewählte Spezialeinheiten-Käufe [{building, cardIndex, gold}] —
  // mehrere gleichzeitig möglich (max. eine je Typ und Territorium)
  deployContext = {regionId, max, num: max, buildings: []};
  $("deployTitle").textContent = "Truppen platzieren";
  $("deploySub").textContent = `In ${REGIONS.find(r=>r.id===regionId).name} — verfügbar: ${max} Truppen, ${p.gold} Gold`;
  $("deployRange").min = 1;
  $("deployRange").max = max;
  $("deployRange").value = max;
  $("deployNum").textContent = max;
  // Spezialeinheiten: nur via Karte + Gold (kein Direktkauf mit Gold allein)
  const data = G.regions[regionId];
  renderSpecialExchange(regionId, p);
  $("deployModal").classList.add("show");
  // Naval: das Zielschiff markieren, solange platziert wird (kein G.selected im Deploy)
  if(IS_NAVAL){ _placeMarkId = regionId; refreshMapVisuals(); }
}

$("deployMinus").onclick = () => {
  const ctx = moveContext || deployContext;
  if(!ctx) return;
  const minVal = (moveContext && (G.regions[moveContext.fromId]?.knight || G.regions[moveContext.fromId]?.siege)) ? 0 : 1;
  if(ctx.num > minVal){ ctx.num--; updateDeployUI(); }
};
$("deployPlus").onclick = () => {
  const ctx = moveContext || deployContext;
  if(!ctx) return;
  if(ctx.num < ctx.max){ ctx.num++; updateDeployUI(); }
};
$("deployRange").oninput = e => {
  const v = +e.target.value;
  $("deployNum").textContent = v;
  if(moveContext){ moveContext.num = v; }
  else if(deployContext){ deployContext.num = v; }
};
function updateDeployUI(){
  const ctx = moveContext || deployContext;
  if(!ctx) return;
  $("deployNum").textContent = ctx.num;
  $("deployRange").value = ctx.num;
}
$("deployCancelBtn").onclick = () => {
  const wasMove = !!moveContext;
  $("deployModal").classList.remove("show");
  deployContext = null;
  moveContext = null;
  if(_placeMarkId != null){ _placeMarkId = null; refreshMapVisuals(); }
  /* Bewegung abbrechen = auch die QUELL-AUSWAHL aufheben. Vorher blieb das
     Quellgebiet gewählt und der nächste Gebietsklick öffnete sofort wieder
     das Bewegungs-Modal — die Bewegung wirkte nicht abbrechbar. */
  if(wasMove && G && G.selected){ G.selected = null; window.WBSfx?.click?.(1); updateHUD(); }
};
$("deployConfirmBtn").onclick = () => {
  // Branch based on which modal mode is active
  if(moveContext){
    const {fromId, toId, num} = moveContext;
    const fromR = G.regions[fromId];
    const mvKnight = fromR.knight && !!($("mvKnight") && $("mvKnight").checked);
    const mvSiege  = fromR.siege  && !!($("mvSiege")  && $("mvSiege").checked);
    if(num < 1 && !mvKnight && !mvSiege){ toast("Nichts ausgewählt zum Bewegen"); return; }
    $("deployModal").classList.remove("show");
    moveContext = null;
    if(wbRelay('moveConfirm', [fromId, toId, num, mvKnight, mvSiege])) return;
    wbApplyMoveConfirm(fromId, toId, num, mvKnight, mvSiege);
    return;
  }
  if(!deployContext) return;
  const {regionId, num, buildings} = deployContext;
  $("deployModal").classList.remove("show");
  deployContext = null;
  _placeMarkId = null;   // Platzierungs-Markierung des Schiffs aufheben
  if(wbRelay('deployConfirm', [regionId, num, buildings])){ refreshMapVisuals(); return; }
  wbApplyDeployConfirm(regionId, num, buildings);
};
function wbApplyMoveConfirm(fromId, toId, num, mvKnight, mvSiege){
  const fromR = G.regions[fromId];
  const toR   = G.regions[toId];
  fromR.troops -= num;
  toR.troops   += num;
  /* Ziel-belegt-Schutz (Relay/Desync): hat das Ziel die Einheit bereits,
     bleibt sie im Quellgebiet stehen statt ersatzlos zu verschwinden.
     Türme sind bewusst NIE beweglich — Bauwerk, kein Marschgepäck. */
  const tookKnight = !!mvKnight && !toR.knight;
  const tookSiege  = !!mvSiege  && !toR.siege;
  if(tookKnight){ fromR.knight = false; toR.knight = true; }
  if(tookSiege) { fromR.siege  = false; toR.siege  = true; }
  const unitStr = [tookKnight ? "♞" : null, tookSiege ? "⚙" : null].filter(Boolean).join(" ");
  const troopStr = num > 0 ? `<b>${num}</b> Truppen` : "";
  const sep      = troopStr && unitStr ? " + " : "";
  log(`${currentPlayer().name} bewegt ${troopStr}${sep}${unitStr} nach ${REGIONS.find(r=>r.id===toId).name}.`);
  G.selected = null;
  updateHUD();
  refreshMapVisuals();
  if(typeof window.map3d_drawMoveArrow === 'function') window.map3d_drawMoveArrow(fromId, toId, num);
  setTimeout(nextTurn, 1300);
}
function wbApplyDeployConfirm(regionId, num, building, cardIndex){
  const p = currentPlayer();
  const reg = G.regions[regionId];
  reg.troops += num;
  p.troopsAvailable -= num;
  /* Kauf-Liste normalisieren: NEU ist `building` ein Array
     [{building, cardIndex}] (mehrere Einheiten pro Aufstellen erlaubt),
     ALT ein Einzelwert + separater cardIndex — bleibt für ältere
     Online-Relays lesbar. */
  const purchases = Array.isArray(building) ? building
                  : (building ? [{ building, cardIndex }] : []);
  const goldCosts = {tower:1, knight:1, siege:2};
  const unitNames = {tower:"🏰 Turm", knight:"♞ Ritter", siege:"⚙ Katapult"};
  /* In ABSTEIGENDER Karten-Index-Reihenfolge einlösen — splice() verschiebt
     alle nachfolgenden Hand-Indizes, aufsteigend würden die falschen Karten
     geopfert. */
  const ordered = purchases
    .filter(b => b && goldCosts[b.building] != null &&
                 typeof b.cardIndex === "number" && b.cardIndex >= 0 && b.cardIndex < p.hand.length)
    .sort((a,b) => b.cardIndex - a.cardIndex);
  let bldMsg = "";
  for(const b of ordered){
    const goldCost = goldCosts[b.building];
    if(p.gold < goldCost) continue;   // Gold-Summe reicht nicht mehr
    if(reg[b.building])   continue;   // max. EINE je Typ und Territorium
    // Karte muss zum Einheitentyp passen (fängt verschobene Indizes/Duplikate ab)
    const card = p.hand[b.cardIndex];
    if(!card || card.symbol !== b.building) continue;
    reg[b.building] = true;
    p.gold -= goldCost;
    const spent = p.hand.splice(b.cardIndex, 1)[0];
    G.discard.push(spent);
    bldMsg += ` +${unitNames[b.building]} (📜 ${spent.name} −${goldCost}💰)`;
  }
  log(`${p.name} platziert <b>${num}</b> in ${REGIONS.find(r=>r.id===regionId).name}${bldMsg}.`);
  window.WBSfx?.deploy?.();
  updateHUD();
  refreshMapVisuals();   // Banner-Truppenzahl nach dem Platzieren hochzählen
}

/* ===== MOVE MODAL (reuses deploy modal UI) ===== */
let moveContext = null;
function openMoveModal(fromId, toId){
  const fromR = G.regions[fromId];
  const toR   = G.regions[toId];
  const max = fromR.troops - 1;   // max troops movable (0 if only 1 troop in territory)
  const hasUnits = fromR.knight || fromR.siege;
  if(max < 1 && !hasUnits){ toast("Mindestens 2 Truppen nötig"); return; }

  moveContext = {fromId, toId, max: Math.max(0, max), num: Math.max(0, max)};

  const fromName = REGIONS.find(r=>r.id===fromId).name;
  const toName   = REGIONS.find(r=>r.id===toId).name;
  $("deployTitle").textContent = max >= 1 ? "Truppen bewegen" : "Einheiten bewegen";
  $("deploySub").textContent   = `Von ${fromName} nach ${toName}${max >= 1 ? ` (max ${max})` : ""}`;

  const troopRow = $("deployTroopRow");
  if(troopRow) troopRow.style.display = max >= 1 ? "" : "none";
  if(max >= 1){
    $("deployRange").min   = hasUnits ? 0 : 1;
    $("deployRange").max   = max;
    $("deployRange").value = max;
    $("deployNum").textContent = max;
  }

  let unitHtml = "";
  if(fromR.knight){
    const blocked = toR.knight ? ' <span class="mu-blocked">(Ziel hat bereits Ritter)</span>' : "";
    unitHtml += `<label class="move-unit-toggle"><input type="checkbox" id="mvKnight"${toR.knight ? " disabled" : " checked"}> ♞ Ritter mitnehmen${blocked}</label>`;
  }
  if(fromR.siege){
    const blocked = toR.siege ? ' <span class="mu-blocked">(Ziel hat bereits Katapult)</span>' : "";
    unitHtml += `<label class="move-unit-toggle"><input type="checkbox" id="mvSiege"${toR.siege ? " disabled" : " checked"}> ⚙ Katapult mitnehmen${blocked}</label>`;
  }
  $("specialToggle").innerHTML = unitHtml;
  $("deployModal").classList.add("show");
}

/* ===== BATTLE ===== */
/* Kinematischer Kampfeffekt: Schwertblitz, Aufprall-Glanz, Streifen und ein
   kurzes Wackeln des Panels — synchron zur Würfelauflösung. Aus dem
   battle_overlay-Prototyp übernommen. */
function playBattleImpact(){
  const clash = $("battleClash"), flash = $("battleFlash"), slash = $("battleSlash");
  const sideA = document.querySelector(".battle-side.a");
  const sideD = document.querySelector(".battle-side.d");
  if(!clash || !flash || !slash) return;
  // Effekte zurücksetzen
  clash.classList.remove("show"); flash.classList.remove("on"); slash.classList.remove("on");
  if(sideA) sideA.classList.remove("advance");
  if(sideD) sideD.classList.remove("hit");
  // Reflow erzwingen, damit die Animationen neu starten
  void clash.offsetWidth; void flash.offsetWidth; void slash.offsetWidth;
  // Angreifer stürmt vor
  if(sideA){ void sideA.offsetWidth; sideA.classList.add("advance"); }
  slash.classList.add("on");
  setTimeout(() => flash.classList.add("on"), 120);
  // Kamera wackelt im Moment des Aufpralls
  setTimeout(() => { if(typeof window.map3d_cameraShake === 'function') window.map3d_cameraShake(8); }, 120);
  setTimeout(() => clash.classList.add("show"), 140);
  // Verteidiger wird getroffen
  setTimeout(() => { if(sideD){ void sideD.offsetWidth; sideD.classList.add("hit"); } }, 160);
}

let battleCtx = null;
let _battleEndResolve = null;   // löst den wartenden Bot-Angriff aus, wenn der Mensch verteidigt hat
let _battleHighlight  = null;   // { fromId, toId } — aktiver Kampf für Karten-Dimm-Effekt
let _troopMoveChoiceResolve = null;   // wartet auf die Nachrück-Entscheidung eines entfernten Angreifers
function _resolveBattleEnd(){ if(_battleEndResolve){ const r=_battleEndResolve; _battleEndResolve=null; r(); } }
function wbApplyTroopMoveChoice(num, mvKnight, mvSiege){
  if(_troopMoveChoiceResolve){
    const r = _troopMoveChoiceResolve; _troopMoveChoiceResolve = null;
    r({ num, mvKnight: !!mvKnight, mvSiege: !!mvSiege });
  }
}
/* Sicherheitsnetz: falls ein Bot-Angriff (z.B. durch einen Fehler mitten in
   doOneBattleRound/finalizeBattle*) nie den normalen Schließen-Pfad erreicht,
   bliebe das Kampf-Overlay sichtbar stehen — sichtbar wird das erst beim
   nächsten Kampf, der es überschreibt, oder eben gar nicht mehr, wenn es der
   letzte Kampf der Bot-Runde war. forceCloseBattleOverlay() räumt das vor dem
   eigenen Zug (beginTurn) und am Ende von runBotTurn garantiert auf. */
function forceCloseBattleOverlay(){
  const ov = $("battle-overlay");
  if(!ov || !ov.classList.contains("show")) return;
  ov.classList.remove("show");
  _battleHighlight = null;
  if(typeof window.map3d_restoreView === 'function') window.map3d_restoreView();
  battleCtx = null; G.selected = null;
  autoRolling = false;
  _rollInProgress = false;
  setBattleUILocked(false);
  const epb = $("endPhaseBtn"); if(epb) epb.disabled = false;
  if(sync.role === 'host') wbBroadcastBattleState();
  _resolveBattleEnd();
}
let selectedAtkDice = 3;
let autoRolling = false;
/* Verhindert, dass EINE Kampfrunde doppelt läuft. Klickt der Angreifer zuerst
   „Angreifen" (und wartet auf den Verteidiger) und macht sich dann ein
   menschlicher Verteidiger „bereit", lösen BEIDE Wege startRollIfReady() aus
   (der wartende Angreifer-Promise über _resolveBattleEnd UND der direkte Aufruf
   in wbDoDefendReady). Ohne diesen Riegel würfelte doOneBattleRound zweimal
   gleichzeitig → der Angreifer verlor doppelt (fälschlich „Sturmmaid tötet 2"). */
let _rollInProgress = false;

/* ── Würfelauswahl-Buttons (nur Angreifer) ─────────────────── */
function initDiceSelectors(maxAtk) {
  selectedAtkDice = Math.min(selectedAtkDice, maxAtk);
  document.querySelectorAll("#atkDiceSel .sel-btn").forEach(btn => {
    const n = +btn.dataset.n;
    btn.disabled = n > maxAtk;
    btn.classList.toggle("active", n === selectedAtkDice);
  });
}

document.querySelectorAll("#atkDiceSel .sel-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.disabled || autoRolling) return;
    selectedAtkDice = +btn.dataset.n;
    document.querySelectorAll("#atkDiceSel .sel-btn").forEach(b =>
      b.classList.toggle("active", +b.dataset.n === selectedAtkDice)
    );
  });
});

function setBattleUILocked(locked) {
  $("battleRollBtn").disabled    = locked;
  $("battleRetreatBtn").disabled = locked;
  $("battleDefendBtn").disabled  = locked;
  $("autoBtn1").disabled = $("autoBtn2").disabled = $("autoBtn3").disabled = locked;
  // Auch Hauptspiel-Buttons sperren damit kein Phasenwechsel während der Battle möglich ist
  const gameBtn = $("endPhaseBtn");
  if(gameBtn) gameBtn.disabled = locked;
  document.querySelectorAll("#atkDiceSel .sel-btn").forEach(b => {
    b.disabled = locked
      ? true
      : +b.dataset.n > Math.min(3, G.regions[battleCtx?.fromId]?.troops - 1 || 0);
  });
}

function startBattle(fromId, toId){
  const atkP = currentPlayer();
  const fromR = G.regions[fromId];
  const toR   = G.regions[toId];
  const defP  = toR.ownerId !== null ? G.players[toR.ownerId] : null;
  battleCtx = {fromId, toId, atkP, defP, retreated:false, atkReady:false, defReady:false, armedDefChars:new Set()};
  _rollInProgress = false;   // frischer Kampf: Doppel-Wurf-Riegel zurücksetzen

  // ── Kampf-Modifikatoren EINMAL je Kampf berechnen (Charaktere + Karten) ──
  const _mods = getCombatMods(atkP, defP, fromR, toR, toId);
  // einmalige Vorkampf-Effekte
  if(_mods.preAtkLoss) fromR.troops = Math.max(1, fromR.troops - _mods.preAtkLoss);
  if(_mods.preDefLoss) toR.troops   = Math.max(1, toR.troops   - _mods.preDefLoss);
  battleCtx.mods = _mods;
  battleCtx._preAtkApplied = _mods.preAtkLoss || 0;
  battleCtx._preDefApplied = _mods.preDefLoss || 0;
  battleCtx.protectAvailable = (_mods.capDefLoss === 0 && defP && defP._protectId === toId);
  // scharf gemachte Karten beider Seiten sind nun verbraucht
  consumeArmed(atkP); consumeArmed(defP);
  // kurzer Effekt-Hinweis im Kampf-Panel
  battleCtx.fxNote = _buildFxNote(_mods);

  wbRenderBattleOverlay();
  if(sync.role === 'host') wbBroadcastBattleState();
}

/* DOM setup for the battle overlay — reads purely from battleCtx + G, so it
   can run either right after startBattle() built battleCtx locally (host,
   or offline/hotseat), or after a guest reconstructed battleCtx from a
   synced battleState message. */
function wbRenderBattleOverlay(){
  const ctx = battleCtx; if(!ctx) return;
  const {fromId, toId, atkP, defP} = ctx;
  const fromR = G.regions[fromId], toR = G.regions[toId];
  autoRolling = false;
  const defIsHuman = defP && defP.type === "human";

  $("battleTitle").textContent = `⚔ ${REGIONS.find(r=>r.id===fromId).name} → ${REGIONS.find(r=>r.id===toId).name}`;
  $("battlePhase").textContent = "Bereit";
  $("atkName").textContent = atkP.name + " (" + FACTIONS[atkP.faction].name + ")";
  $("defName").textContent = defP ? (defP.name + " (" + FACTIONS[defP.faction].name + ")") : "Neutral";
  // Fraktionsfarben im Overlay anzeigen (statt fest Blau/Rot)
  const _atkCol = (FACTIONS[atkP.faction] && FACTIONS[atkP.faction].color) || '#6e98ff';
  const _defCol = (defP && FACTIONS[defP.faction] && FACTIONS[defP.faction].color) || '#9aa0aa';
  const _ov = $("battle-overlay");
  if(_ov){ _ov.style.setProperty('--atk-color', _atkCol); _ov.style.setProperty('--def-color', _defCol); }
  $("atkTroops").textContent = fromR.troops;
  $("defTroops").textContent = toR.troops;

  const atkSp = [];
  if(fromR.knight) atkSp.push("♞ Ritter +1");
  if(fromR.siege)  atkSp.push("⚙ Katapult: 1 W6→W8");
  $("atkSpecials").innerHTML = atkSp.join(" · ") || "<span style='color:var(--muted);font-size:12px'>—</span>";

  const defSp = [];
  if(toR.tower)  defSp.push("🏰 W8 Verteidigung");
  if(toR.knight) defSp.push("♞ Ritter +1");
  $("defSpecials").innerHTML = defSp.join(" · ") || "<span style='color:var(--muted);font-size:12px'>—</span>";

  $("atkDice").innerHTML = "";
  $("defDice").innerHTML = "";
  $("battleResultText").innerHTML = battleCtx.fxNote
    ? ("✨ <span style='color:var(--gold,#f6d98b);font-size:12px'>" + battleCtx.fxNote + "</span>")
    : "Würfel bereit…";
  $("battleResultPill").textContent = "Kampf beginnt";
  $("battleRollBtn").disabled = false;
  $("battleRollBtn").style.display = "";       // ggf. von einem Bot-Angriff ausgeblendet
  $("battleRetreatBtn").style.display = "";
  $("battleRetreatBtn").disabled = false;
  const _dp = $("defensePanel"); if(_dp){ _dp.style.display = "none"; _dp.innerHTML = ""; }  // Verteidigungs-Panel zurücksetzen
  $("battleRollBtn").textContent = "⚔ Angreifer bereit";
  $("battleRollBtn").classList.remove("ready");
  // Manueller Kampf: Würfelauswahl + „Angreifen" (eine Runde) NUR für den
  // menschlichen Angreifer; der Auto-Kampf (×1/×2/×3) bleibt zusätzlich verfügbar.
  // Würfelauswahl + „Angreifen" gehören ausschließlich dem Client, der den
  // Angreifer STEUERT. Im Online-Spiel sah sonst auch der verteidigende Gast
  // (oder der nur zuschauende Host) das Angreifer-Würfelpanel und konnte damit
  // „nichts auswählen" – der eigentliche Bug-Report.
  const _localAtk = (atkP.type === "human") && wbControlsSeat(atkP);
  const _dc = document.querySelector(".dice-choose");
  if(_dc) _dc.style.display = _localAtk ? "" : "none";
  $("battleRollBtn").style.display = _localAtk ? "" : "none";
  $("battleRollBtn").textContent = "⚔ Angreifen";
  // Verteidiger-Steuerung (Bereit-Button + Charakter-/Kartenauswahl) gehört
  // ausschließlich dem Client, der den VERTEIDIGER steuert. Andere Spieler (der
  // Angreifer, der zuschauende Host, unbeteiligte Gäste) dürfen die Auswahl-
  // Optionen NICHT sehen — sie sehen die getroffene Auswahl später nur als Ergebnis.
  const _localDef = defIsHuman && wbControlsSeat(defP);
  if(defIsHuman){
    $("battleDefendBtn").style.display = _localDef ? "" : "none";
    $("battleDefendBtn").textContent = "🛡 Verteidiger bereit";
    $("battleDefendBtn").classList.remove("ready");
    $("battleDefendBtn").disabled = false;
    renderDefenseOptions();   // zeigt Optionen nur dem steuernden Verteidiger (intern geprüft)
  } else {
    $("battleDefendBtn").style.display = "none";
    // Bot/Neutral: Verteidiger auto-bereit
    battleCtx.defReady = true;
  }
  // „Zurückziehen" ist eine Angreifer-Aktion: nur der Client, der den Angreifer
  // steuert, sieht sie — dadurch lässt sich JEDER Kampf (auch PvP gegen einen
  // menschlichen Verteidiger) abbrechen, ohne dass der Verteidiger den Knopf sieht.
  $("battleRetreatBtn").style.display = _localAtk ? "" : "none";
  $("autoStopBtn").style.display = "none";
  // Auto-Kampf (×1/×2/×3) ist ebenfalls eine Angreifer-Aktion — nur der Client,
  // der den Angreifer steuert, sieht die Knöpfe (sonst tauchten sie auch beim
  // Verteidiger und bei Zuschauern auf und taten dort nichts).
  [$("autoBtn1"),$("autoBtn2"),$("autoBtn3")].forEach(b=>{ b.style.display = _localAtk ? "" : "none"; b.disabled = false; });

  const maxAtk = Math.min(3, fromR.troops - 1);
  initDiceSelectors(maxAtk);

  ["battleClash","battleFlash","battleSlash"].forEach(eid => {
    const el = $(eid); if(el) el.classList.remove("show","on");
  });
  document.querySelectorAll(".battle-side.a, .battle-side.d")
    .forEach(s => s.classList.remove("advance","hit"));

  _battleHighlight = { fromId, toId };
  if(typeof window.map3d_focusTerritories === 'function') window.map3d_focusTerritories(fromId, toId);
  // Truppen in Stellung bringen: Angreifer in Angriffs-, Verteidiger in
  // Verteidigungsstellung (nur im Figuren-Marker-Modus sichtbar). Wird beim
  // Schließen des Kampfes über map3d_restoreView() automatisch gelöst.
  if(typeof window.map3d_setCombatStance === 'function')  window.map3d_setCombatStance(fromId, toId);
  if(typeof refreshMapVisuals === 'function') refreshMapVisuals();
  if(typeof window.map3d_cameraShake === 'function')     window.map3d_cameraShake(5);
  // Phasenwechsel während Battle verhindern
  const epb = $("endPhaseBtn"); if(epb) epb.disabled = true;
  $("battle-overlay").classList.add("show");
}

/* Kurz aufpoppende Verlust-Anzeige −N auf der betroffenen Kampfseite. */
function _battleDmgFloat(side, n){
  const host = document.querySelector('.battle-side.' + side);
  if(!host) return;
  const el = document.createElement('div');
  el.className = 'dmg-float';
  el.textContent = '\u2212' + n;
  host.appendChild(el);
  setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 1100);
}

function makeDie(val, type) {
  const el = document.createElement("div");
  const v  = Math.max(1, Math.min(8, parseInt(val) || 1));
  el.className = `die ${type} v${Math.min(v, 6)}`;
  let faces = "";
  for (let i = 1; i <= 6; i++) faces += `<div class="face f${i}">${v}</div>`;
  el.innerHTML = `<div class="cube">${faces}</div>`;
  return el;
}

/* ── Kern-Kampfrunde ─────────────────────────────────────── */
async function doOneBattleRound(atkCount) {
  const ctx = battleCtx;
  if (!ctx) return 'noTroops';
  const fromR = G.regions[ctx.fromId];
  const toR   = G.regions[ctx.toId];

  const M = (ctx.mods) ? ctx.mods : _freshMods();
  const _atkW8N = (fromR.siege ? 1 : 0) + (M.atkW8 || 0);                 // wie viele Angriffswürfel sind W8
  const _defW8  = (toR.tower && !M.ignoreTower) || M.defAsTower;          // verteidigt mit W8?

  atkCount = Math.min(atkCount + M.atkDice, fromR.troops - 1, M.atkMax);
  const defCount = Math.min(2 + M.defDice, toR.troops, M.defMax);
  if (atkCount < 1 || defCount < 1) return 'noTroops';
  ctx.lastAtkDice = atkCount;  // Anzahl Angriffswürfel dieser Runde — Mindest-Nachrückzahl bei Eroberung

  $("battlePhase").textContent = "Würfel rollen";

  const atkDiceEl = $("atkDice"); const defDiceEl = $("defDice");
  atkDiceEl.innerHTML = ""; defDiceEl.innerHTML = "";
  for(let i=0; i<atkCount; i++) atkDiceEl.appendChild(makeDie(1, "black"));
  for(let i=0; i<defCount; i++) defDiceEl.appendChild(makeDie(1, "white"));

  let atkFaces = atkDiceEl.querySelectorAll(".die");
  let defFaces = defDiceEl.querySelectorAll(".die");
  atkFaces.forEach((d,i)=>{ if(i<_atkW8N){ d.classList.remove("black"); d.classList.add("gold"); } });
  if(_defW8){ defFaces.forEach(d => { d.classList.remove("white"); d.classList.add("gold"); }); }

  atkFaces.forEach(d => d.classList.add("roll"));
  defFaces.forEach(d => d.classList.add("roll"));
  wbBroadcastDice('roll');   // guests: show spinning dice while the host animates
  const DICE_ROLL_MS = 1392, DICE_STEP_MS = 60;
  window.WBSfx?.diceRoll?.(DICE_ROLL_MS);
  const _diceSteps = Math.round(DICE_ROLL_MS / DICE_STEP_MS);   // ~23 frames
  for(let i=0; i<_diceSteps; i++){
    [...atkFaces, ...defFaces].forEach(d => {
      const isW8 = d.classList.contains("gold");
      const r = Math.floor(Math.random() * (isW8 ? 8 : 6)) + 1;
      d.classList.remove("v1","v2","v3","v4","v5","v6");
      d.classList.add("v" + (Math.floor(Math.random()*6)+1));
      d.querySelectorAll(".face").forEach(f => f.textContent = r);
    });
    await sleep(DICE_STEP_MS);
  }
  atkFaces.forEach(d => d.classList.remove("roll"));
  defFaces.forEach(d => d.classList.remove("roll"));

  const atkRolls = [];
  for(let i=0; i<atkCount; i++) atkRolls.push(rnd(i < _atkW8N ? 8 : 6));
  const defRolls = [];
  for(let i=0; i<defCount; i++) defRolls.push(rnd(_defW8 ? 8 : 6));

  // Neuwürfe (Ratskarten)
  if(M.atkRerollAll){ for(let i=0;i<atkRolls.length;i++) atkRolls[i]=rnd(i<_atkW8N?8:6); }
  else if(M.atkRerollLowest && atkRolls.length){ const mi=atkRolls.indexOf(Math.min(...atkRolls)); atkRolls[mi]=rnd(mi<_atkW8N?8:6); }

  // Ritter (+1 höchster)
  if(fromR.knight){ const mi=atkRolls.indexOf(Math.max(...atkRolls)); if(atkRolls[mi]<7) atkRolls[mi]++; }
  if(toR.knight){   const mi=defRolls.indexOf(Math.max(...defRolls)); if(defRolls[mi]<7) defRolls[mi]++; }

  // Würfel-Boni (Charaktere/Karten) — auf max. 8 begrenzt
  if(M.atkAllPlus) for(let i=0;i<atkRolls.length;i++) atkRolls[i]=Math.min(8, atkRolls[i]+M.atkAllPlus);
  if(M.defAllPlus) for(let i=0;i<defRolls.length;i++) defRolls[i]=Math.min(8, defRolls[i]+M.defAllPlus);
  if(M.atkHighPlus && atkRolls.length){ const mi=atkRolls.indexOf(Math.max(...atkRolls)); atkRolls[mi]=Math.min(8, atkRolls[mi]+M.atkHighPlus); }
  if(M.defHighPlus && defRolls.length){ const mi=defRolls.indexOf(Math.max(...defRolls)); defRolls[mi]=Math.min(8, defRolls[mi]+M.defHighPlus); }
  if(M.atkHighMinus && atkRolls.length){ const mi=atkRolls.indexOf(Math.max(...atkRolls)); atkRolls[mi]=Math.max(1, atkRolls[mi]-M.atkHighMinus); }

  let aSorted = [...atkRolls].sort((a,b)=>b-a);
  let dSorted = [...defRolls].sort((a,b)=>b-a);
  if(M.swap){ const tmp=aSorted; aSorted=dSorted; dSorted=tmp; }   // Siegel des Spiegels

  atkFaces.forEach((d, i) => {
    d.classList.remove("v1","v2","v3","v4","v5","v6"); d.classList.add("v1");
    d.querySelectorAll(".face").forEach(f => f.textContent = aSorted[i]);
  });
  defFaces.forEach((d, i) => {
    d.classList.remove("v1","v2","v3","v4","v5","v6"); d.classList.add("v1");
    d.querySelectorAll(".face").forEach(f => f.textContent = dSorted[i]);
  });

  window.WBSfx?.diceReveal?.();
  await sleep(500);
  $("battlePhase").textContent = "Treffer werden verglichen";
  playBattleImpact();
  await sleep(180);

  let atkLoss = 0, defLoss = 0;
  const compares = Math.min(atkCount, defCount);
  for(let i=0; i<compares; i++){
    const atkWins = M.tieToAttacker ? (aSorted[i] >= dSorted[i]) : (aSorted[i] > dSorted[i]);
    if(atkWins){ defLoss++; defFaces[i].classList.add("lose"); atkFaces[i].classList.add("win"); }
    else       { atkLoss++; atkFaces[i].classList.add("lose"); defFaces[i].classList.add("win"); }
  }
  for(let i=compares; i<atkCount; i++) atkFaces[i].classList.add("unused");
  for(let i=compares; i<defCount; i++) defFaces[i].classList.add("unused");

  // Zusatzverlust bei Sieg (Siegel der Klinge / Kriegstrommel)
  if(defLoss>0 && M.winDefExtra) defLoss += M.winDefExtra;
  // Runenkundige: erster Verlust im geschützten Gebiet wird verhindert
  if(ctx.protectAvailable && defLoss>0){ defLoss=Math.max(0,defLoss-1); ctx.protectAvailable=false; if(ctx.defP) _eff(ctx.defP,'Runenkundige','erster Verlust verhindert'); }
  // Verlust-Obergrenzen (Eiserner Wille / Siegel des Rückzugs)
  atkLoss = Math.min(atkLoss, M.capAtkLoss);
  defLoss = Math.min(defLoss, M.capDefLoss);
  // Verluste nicht unter Bestand
  atkLoss = Math.min(atkLoss, Math.max(0, fromR.troops));
  defLoss = Math.min(defLoss, Math.max(0, toR.troops));

  // Henker (Angreifer): +1 Einheit ins Angriffsgebiet pro feindl. Verlust, max 2/Runde
  if(defLoss>0 && ctx.atkP && _ownsChar(ctx.atkP,'Henker')){
    const give = Math.min(defLoss, 2 - (ctx.atkP._henkerUsed||0));
    if(give>0){ const fr=G.regions[ctx.fromId]; if(fr) fr.troops+=give; ctx.atkP._henkerUsed=(ctx.atkP._henkerUsed||0)+give; }
  }

  fromR.troops -= atkLoss;
  toR.troops   -= defLoss;

  $("atkTroops").textContent = fromR.troops;
  $("defTroops").textContent = toR.troops;
  $("battlePhase").textContent = "Treffer";
  // Verlust kurz als −N auf der betroffenen Seite einblenden
  if(atkLoss || defLoss) window.WBSfx?.attack?.();
  if(atkLoss) _battleDmgFloat('a', atkLoss);
  if(defLoss) _battleDmgFloat('d', defLoss);
  // Einheitenmarker auf der Karte zählen während des Kampfes mit
  if(typeof refreshMapVisuals === 'function') refreshMapVisuals();

  const parts = [];
  if(atkLoss) parts.push(`Angreifer −${atkLoss}`);
  if(defLoss) parts.push(`Verteidiger −${defLoss}`);
  $("battleResultText").innerHTML = `⚫ ${aSorted.join(", ")} <span style="color:var(--muted)">vs</span> ⚪ ${dSorted.join(", ")}`;
  $("battleResultPill").textContent = parts.join(" · ") || "Patt";
  wbBroadcastDice('result', { resultHtml: $("battleResultText").innerHTML, pill: $("battleResultPill").textContent });   // guests: reveal final faces + win/lose
  log(`<b>${ctx.atkP.name}</b> greift ${REGIONS.find(r=>r.id===ctx.toId).name} an: ${aSorted.join(",")} vs ${dSorted.join(",")} — ${parts.join(", ")||'patt'}`);

  await sleep(650);

  if(toR.troops <= 0)   return 'conquered';
  if(fromR.troops <= 1) return 'noTroops';

  initDiceSelectors(Math.min(3, fromR.troops - 1));
  return 'continue';
}

/* ── Truppenverschiebung nach Eroberung ───────────────────────
   Der Spieler wählt, wie viele Truppen ins eroberte Gebiet nachrücken —
   und ob Ritter/Katapult mitziehen (Türme sind Bauwerke, nie beweglich).
   Minimum = Anzahl der Würfel der letzten Angriffsrunde,
   Maximum = verfügbare Truppen − 1 (eine Truppe bleibt immer zurück).
   opts: { hasKnight, hasSiege } — Spezialeinheiten im Quellgebiet.
   Ergebnis: { num, mvKnight, mvSiege }. */
function askTroopMove(fromName, toName, minMove, maxMove, opts){
  const hasKnight = !!(opts && opts.hasKnight);
  const hasSiege  = !!(opts && opts.hasSiege);
  return new Promise(resolve => {
    // Kein Spielraum bei den Truppen UND keine Spezialeinheiten → nichts zu fragen
    if(maxMove <= minMove && !hasKnight && !hasSiege){
      resolve({ num: maxMove, mvKnight: false, mvSiege: false }); return;
    }
    let val = maxMove;  // Standard: so viele wie möglich nachziehen
    const clamp = v => Math.max(minMove, Math.min(maxMove, v));
    const hasRange = maxMove > minMove;

    const unitHtml =
      (hasKnight ? `<label class="move-unit-toggle"><input type="checkbox" id="tmKnight" checked> ♞ Ritter mitnehmen</label>` : "") +
      (hasSiege  ? `<label class="move-unit-toggle"><input type="checkbox" id="tmSiege" checked> ⚙ Katapult mitnehmen</label>` : "");

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop show";
    backdrop.style.zIndex = "6000";
    backdrop.innerHTML = `
      <div class="modal" style="max-width:440px">
        <h2>⚔ ${toName} erobert!</h2>
        <div class="sub">Wie viele Truppen rücken von ${fromName} nach?</div>
        <div class="deploy-dialog">
          <div class="big-num" id="tmNum">${val}</div>
          ${hasRange ? `
          <div class="controls">
            <button id="tmMinus">−</button>
            <input type="range" id="tmRange" min="${minMove}" max="${maxMove}" value="${val}" style="width:200px"/>
            <button id="tmPlus">+</button>
          </div>` : ""}
          <div style="color:var(--muted);font-size:11px;text-align:center;line-height:1.4">
            Mindestens ${minMove} (Anzahl der Angriffswürfel) · höchstens ${maxMove}<br>
            Eine Truppe bleibt in ${fromName} zurück.
          </div>
          ${unitHtml ? `<div id="tmUnits" style="text-align:center">${unitHtml}</div>` : ""}
        </div>
        <div class="modal-actions" style="justify-content:center">
          <button class="primary" id="tmConfirm">Truppen verschieben</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const range = backdrop.querySelector("#tmRange");
    const numEl = backdrop.querySelector("#tmNum");
    const sync  = () => { val = clamp(val); numEl.textContent = val; if(range) range.value = val; };
    if(range){
      range.addEventListener("input", () => { val = clamp(+range.value); sync(); });
      backdrop.querySelector("#tmMinus").onclick = () => { val = clamp(val - 1); sync(); };
      backdrop.querySelector("#tmPlus").onclick  = () => { val = clamp(val + 1); sync(); };
    }
    backdrop.querySelector("#tmConfirm").onclick = () => {
      const kEl = backdrop.querySelector("#tmKnight");
      const sEl = backdrop.querySelector("#tmSiege");
      const result = { num: clamp(val),
                       mvKnight: hasKnight && !!(kEl && kEl.checked),
                       mvSiege:  hasSiege  && !!(sEl && sEl.checked) };
      if(backdrop.parentNode) document.body.removeChild(backdrop);
      resolve(result);
    };
  });
}

async function finalizeBattleConquest() {
  const ctx = battleCtx;
  if(!ctx){ setBattleUILocked(false); return; }
  _battleHighlight = null;
  $("battle-overlay").classList.remove("show");
  if(typeof window.map3d_restoreView === 'function') window.map3d_restoreView();

  // Truppen-Nachrückzahl + Spezialeinheiten-Mitnahme bestimmen
  const fromR   = G.regions[ctx.fromId];
  const maxMove = fromR ? Math.max(1, fromR.troops - 1) : 1;
  const minMove = Math.max(1, Math.min(ctx.lastAtkDice || 1, maxMove));
  const hasKnight = !!(fromR && fromR.knight);
  const hasSiege  = !!(fromR && fromR.siege);
  let moveCount = maxMove;              // Bots / kein Spielraum: maximal nachziehen
  let mvKnight = hasKnight, mvSiege = hasSiege;   // Bots: Angriffs-Einheiten rücken mit vor
  if(ctx.atkP && ctx.atkP.type === "human" && (maxMove > minMove || hasKnight || hasSiege)){
    const fromName = REGIONS.find(r=>r.id===ctx.fromId)?.name || "Herkunft";
    const toName   = REGIONS.find(r=>r.id===ctx.toId)?.name   || "Ziel";
    let choice = { num: minMove, mvKnight: false, mvSiege: false };
    if(sync.role === 'host' && ctx.atkP.clientId && ctx.atkP.clientId !== wbClientId){
      // Remote attacker: ask *their* browser and wait here for the reply.
      wbSend({ type:'battleState', battle: { ...wbSerializeBattleCtx(), needsTroopMoveChoice:{fromName,toName,minMove,maxMove,hasKnight,hasSiege} } });
      try { choice = await new Promise(res => { _troopMoveChoiceResolve = res; }); }
      catch(e){ /* Fallback bleibt minMove ohne Spezialeinheiten */ }
    } else {
      try { choice = await askTroopMove(fromName, toName, minMove, maxMove, {hasKnight, hasSiege}); }
      catch(e){ console.error("askTroopMove error:", e); }
    }
    moveCount = choice.num;
    mvKnight  = hasKnight && !!choice.mvKnight;
    mvSiege   = hasSiege  && !!choice.mvSiege;
  }

  battleCtx = null; G.selected = null;
  setBattleUILocked(false);  // Hauptspiel-Buttons wieder freigeben
  try { await conquerRegion(ctx.fromId, ctx.toId, moveCount, mvKnight, mvSiege); } catch(e){ console.error("conquerRegion error:", e); }
  try { updateHUD(); } catch(e){ console.error("updateHUD error:", e); }
  try { checkWin(); }  catch(e){ console.error("checkWin error:", e); }
  if(sync.role === 'host') wbBroadcastBattleState();
  _resolveBattleEnd();   // ggf. wartenden Bot-Angriff fortsetzen
}

function finalizeBattleNoTroops() {
  _onDefenderHeld(battleCtx);
  $("battleResultText").innerHTML = "\u2694 <b style='color:#ff7a7a'>Angriff gescheitert</b> \u2014 keine Truppen mehr verfügbar.";
  $("battlePhase").textContent = "⚔ Angriff gescheitert";
  toast("⚔ Angriff gescheitert — keine Truppen mehr verfügbar");
  setBattleUILocked(false);
  updateHUD();
  if(battleCtx && battleCtx.botAutoAfterDefend){
    // Bot-Angriff: Ergebnis kurz anzeigen, dann automatisch schließen
    setTimeout(() => {
      _battleHighlight = null;
      $("battle-overlay").classList.remove("show");
      if(typeof window.map3d_restoreView === 'function') window.map3d_restoreView();
      battleCtx = null; G.selected = null;
      if(sync.role === 'host') wbBroadcastBattleState();
      _resolveBattleEnd();
    }, 1400);
    return;
  }
  $("battleRollBtn").disabled = true;
  $("autoBtn1").disabled = $("autoBtn2").disabled = $("autoBtn3").disabled = true;
  // Hier als reiner "Schließen"-Button: der Kampf ist vorbei (keine Truppen
  // mehr), also muss er auch wieder sichtbar sein, falls startBattle() ihn für
  // einen menschlichen Verteidiger zuvor ausgeblendet hatte.
  $("battleRetreatBtn").style.display = "";
  $("battleRetreatBtn").textContent = "Schließen";
  $("battleRetreatBtn").disabled = false;
  if(sync.role === 'host') wbBroadcastBattleState();
}

/* ── Zwei-seitiges Bereit-System ─────────────────────────── */
async function startRollIfReady() {
  if(!battleCtx || autoRolling || _rollInProgress) return;
  if(!battleCtx.atkReady || !battleCtx.defReady) return;
  const fromR = G.regions[battleCtx.fromId];
  const toR   = G.regions[battleCtx.toId];
  if(fromR.troops <= 1 || toR.troops <= 0) return;
  _rollInProgress = true;                       // Doppel-Wurf-Riegel (siehe _rollInProgress)
  setBattleUILocked(true);
  const result = await doOneBattleRound(selectedAtkDice);
  _rollInProgress = false;
  if (result === 'conquered')     { await finalizeBattleConquest(); }
  else if (result === 'noTroops') { finalizeBattleNoTroops(); }
  else {
    // Reset for next round
    battleCtx.atkReady = false;
    battleCtx.defReady = !!(battleCtx.defP && battleCtx.defP.type !== "human") || false;
    setBattleUILocked(false);
    $("battleRollBtn").textContent = "⚔ Angreifer bereit";
    $("battleRollBtn").classList.remove("ready");
    if(battleCtx.defP && battleCtx.defP.type === "human"){
      $("battleDefendBtn").textContent = "🛡 Verteidiger bereit";
      $("battleDefendBtn").classList.remove("ready");
      $("battleDefendBtn").disabled = false;
    } else {
      battleCtx.defReady = true;
    }
    $("battlePhase").textContent = "Nächste Runde";
    updateHUD();   // pushes this round's troop-count changes to guests too
    if(sync.role === 'host') wbBroadcastBattleState();
  }
}

$("battleRollBtn").onclick = async () => {
  if(wbRelayAttack('battleRoll', [selectedAtkDice])) return;
  wbDoBattleRoll(selectedAtkDice);
};
function wbDoBattleRoll(diceN){
  if(!battleCtx || autoRolling) return;
  // Vom Angreifer (lokal oder von einem Gast per Relay) gewählte Würfelanzahl
  // übernehmen; doOneBattleRound klemmt zusätzlich auf den gültigen Bereich.
  if(diceN != null){
    const maxAtk = Math.min(3, (G.regions[battleCtx.fromId]?.troops ?? 1) - 1);
    selectedAtkDice = Math.max(1, Math.min(+diceN || 1, maxAtk));
  }
  const fromR = G.regions[battleCtx.fromId], toR = G.regions[battleCtx.toId];
  if(!fromR || !toR || fromR.troops <= 1 || toR.troops <= 0) return;
  battleCtx.atkReady = true;
  if(!battleCtx.defReady){
    // Real wait: the defender (local hotseat, or a remote guest) gets to
    // arm characters/cards and click "ready" before the dice actually
    // roll — battleDefendBtn's handler resolves this via _resolveBattleEnd().
    $("battleRollBtn").textContent = "⏳ Warte auf Verteidiger…";
    $("battleRollBtn").disabled = true;
    if(sync.role === 'host') wbBroadcastBattleState();
    const ctx = battleCtx;
    new Promise(res => { _battleEndResolve = res; }).then(() => {
      if(battleCtx !== ctx || !battleCtx) return;   // battle closed/changed meanwhile
      $("battleRollBtn").disabled = false;
      startRollIfReady();
    });
    return;
  }
  startRollIfReady();
}

$("battleDefendBtn").onclick = () => {
  if(wbRelayDefense('battleDefendReady', [])) return;
  wbDoDefendReady();
};
function wbDoDefendReady(){
  if(!battleCtx || autoRolling || battleCtx.defReady) return;
  battleCtx.defReady = true;
  const dp = $("defensePanel"); if(dp){ dp.style.display='none'; dp.innerHTML=''; }
  if($("battleDefendBtn")){
    $("battleDefendBtn").textContent = "✓ Bereit";
    $("battleDefendBtn").classList.add("ready");
    $("battleDefendBtn").disabled = true;
  }
  if(sync.role === 'host') wbBroadcastBattleState();
  if(battleCtx.botAutoAfterDefend){
    // Lokaler Bot-Angriff: den wartenden Bot-Zug (botAttack) NICHT sofort
    // freigeben — sonst startet der Bot seinen nächsten Angriff (oder nextTurn)
    // sofort und überschreibt/schließt das Overlay, während runAutoRoll die
    // Würfel noch animiert; der Verteidiger sähe sein Würfelergebnis nie.
    // Erst finalizeBattle*/Rückzug löst _battleEndResolve am Kampfende aus.
    runAutoRoll(3);
  } else {
    _resolveBattleEnd();   // release a local-human / remote-guest attacker waiting on the ready toggle
    startRollIfReady();
  }
}

/* ── Auto-Roll ────────────────────────────────────────────── */
async function runAutoRoll(fixedAtkDice) {
  if (!battleCtx || autoRolling) return;
  autoRolling = true;
  $("autoBtn1").style.display = $("autoBtn2").style.display = $("autoBtn3").style.display = "none";
  // Bei einem Bot-Angriff auf einen Menschen darf der Verteidiger den Auto-Kampf
  // NICHT stoppen: der Angreifer ist der Bot, es gäbe niemanden, der „Weiter
  // würfeln" klickt, und der pausierte Bot-Zug bliebe hängen.
  $("autoStopBtn").style.display = (battleCtx && battleCtx.botAutoAfterDefend) ? "none" : "";
  setBattleUILocked(true);  // Spiel + Battle-UI vollständig sperren

  let result = 'continue';
  try {
    while (autoRolling && battleCtx && result === 'continue') {
      const fromR = G.regions[battleCtx.fromId];
      const toR   = G.regions[battleCtx.toId];
      if (!fromR || !toR || fromR.troops <= 1 || toR.troops <= 0) { result = 'noTroops'; break; }
      result = await doOneBattleRound(fixedAtkDice);
      if (result === 'continue') await sleep(280);
    }
  } catch(err) {
    console.error("Auto-Roll Fehler:", err);
    result = 'error';
  }

  const wasStopped = !autoRolling && result === 'continue';
  autoRolling = false;
  $("autoStopBtn").style.display = "none";
  [$("autoBtn1"),$("autoBtn2"),$("autoBtn3")].forEach(b=>{b.style.display="";b.disabled=false;});

  if (result === 'error') {
    // Fehler-Fallback: Battle schließen, Spiel weiterführen
    _battleHighlight = null;
    $("battle-overlay").classList.remove("show");
    if(typeof window.map3d_restoreView === 'function') window.map3d_restoreView();
    battleCtx = null; G.selected = null;
    setBattleUILocked(false);
    updateHUD();
    if(sync.role === 'host') wbBroadcastBattleState();
    _resolveBattleEnd();
  } else if (wasStopped) {
    setBattleUILocked(false);
    $("battleRollBtn").textContent = "Weiter würfeln ⚔";
    updateHUD();
    if(sync.role === 'host') wbBroadcastBattleState();
  } else if (result === 'conquered')  { await finalizeBattleConquest(); }
  else if (result === 'noTroops')     { finalizeBattleNoTroops(); }
  else                                { setBattleUILocked(false); } // Fallback
}

$("autoBtn1").onclick = () => { if(wbRelayAttack('battleAutoRoll', [1])) return; runAutoRoll(1); };
$("autoBtn2").onclick = () => { if(wbRelayAttack('battleAutoRoll', [2])) return; runAutoRoll(2); };
$("autoBtn3").onclick = () => { if(wbRelayAttack('battleAutoRoll', [3])) return; runAutoRoll(3); };
$("autoStopBtn").onclick = () => { autoRolling = false; };

/* ── Zurückziehen ─────────────────────────────────────────── */
$("battleRetreatBtn").onclick = () => {
  if(wbRelayAttack('battleRetreat', [])) return;
  wbDoBattleRetreat();
};
function wbDoBattleRetreat(){
  autoRolling = false;
  _onDefenderHeld(battleCtx);   // Angreifer zieht sich zurück → Verteidiger hat gehalten
  _battleHighlight = null;
  $("battle-overlay").classList.remove("show");
  if(typeof window.map3d_restoreView === 'function') window.map3d_restoreView();
  battleCtx = null; G.selected = null;
  const epb = $("endPhaseBtn"); if(epb) epb.disabled = false;
  updateHUD();
  if(sync.role === 'host') wbBroadcastBattleState();
  _resolveBattleEnd();   // falls ein Bot-Angriff auf das Schließen gewartet hat
}


async function conquerRegion(fromId, toId, moveCount, mvKnight, mvSiege){
  const fromR = G.regions[fromId];
  const toR   = G.regions[toId];
  const oldOwner = (toR.ownerId === null) ? null : G.players[toR.ownerId];
  const newOwner = currentPlayer();

  // Show banner
  const banner = $("conquerBanner");
  banner.textContent = `${REGIONS.find(r=>r.id===toId).name} erobert!`;
  banner.classList.add("show");
  window.WBSfx?.conquer?.();
  setTimeout(() => banner.classList.remove("show"), 1200);

  // Transfer — Anzahl nachrückender Truppen (mind. 1, höchstens fromR.troops − 1)
  toR.ownerId = newOwner.id;
  toR.tower = false;
  toR.knight = false;
  toR.siege = false;
  const maxMove = Math.max(1, fromR.troops - 1);
  let move = (typeof moveCount === "number" && !isNaN(moveCount)) ? moveCount : maxMove;
  move = Math.max(1, Math.min(move, maxMove));
  toR.troops = move;
  fromR.troops -= move;

  /* Angreifer-Spezialeinheiten mitführen (Wahl des Spielers im Nachrück-
     Dialog; Bots nehmen sie immer mit). Die Spezials des Verteidigers wurden
     oben zerstört, das Ziel ist also frei. Türme sind Bauwerke und bleiben
     grundsätzlich im Quellgebiet. */
  const movedUnits = [];
  if(mvKnight && fromR.knight){ fromR.knight = false; toR.knight = true; movedUnits.push("♞"); }
  if(mvSiege  && fromR.siege) { fromR.siege  = false; toR.siege  = true; movedUnits.push("⚙"); }

  // Karte wird am Rundenende gezogen (max 5 auf der Hand)
  newOwner.conqueredThisRound = true;
  newOwner._conqueredCount = (newOwner._conqueredCount || 0) + 1;  // für „Kriegskasse"
  // Nach-Eroberungs-Charaktere
  if(_ownsChar(newOwner,'Schwertschwester')){ toR.troops += 1; _eff(newOwner,'Schwertschwester','+1 Einheit im eroberten Gebiet'); }
  if(_ownsChar(newOwner,'Hirschreiter')){ toR.troops += 2; _eff(newOwner,'Hirschreiter','+2 nachgezogene Einheiten'); }
  const conquName = REGIONS.find(r=>r.id===toId).name;
  log(`<b>${newOwner.name}</b> erobert ${conquName}!${movedUnits.length ? " " + movedUnits.join(" ") + " rücken mit vor." : ""}`);
  if(_territoryCardCount(newOwner) < TERRITORY_CARD_LIMIT) toast(`${conquName} erobert! 📜 Gebietskarte bei Rundenwechsel`);

  // Check elimination
  if(oldOwner && !REGIONS.some(r => G.regions[r.id].ownerId === oldOwner.id)){
    oldOwner.eliminated = true;
    log(`☠ <b>${oldOwner.name}</b> wurde eliminiert!`);
    toast(`${oldOwner.name} eliminiert!`);
  }
  // Ziele-Modus: Verlust der eigenen Hauptstadt = Niederlage
  if(G.winCondition === "ziele" && oldOwner && oldOwner.capitalId === toId && !oldOwner.eliminated){
    oldOwner.eliminated = true;
    log(`🏰☠ <b>${oldOwner.name}</b> verliert die Hauptstadt und scheidet aus!`);
    toast(`${oldOwner.name}: Hauptstadt verloren!`);
  }

  await sleep(1000);
}

/* ===== CARDS RENDERING ===== */
/* ── Gebietskarten Hilfsfunktionen ────────────────────────────── */
const CARD_ICONS = {knight:"♞", tower:"🏰", siege:"⚙"};
const CARD_LABELS = {knight:"Ritter", tower:"Turm", siege:"Katapult"};
const CARD_COLORS = {
  knight:"rgba(100,160,255,.15)", tower:"rgba(214,170,77,.15)", siege:"rgba(220,100,80,.15)"
};
const CARD_BORDERS = {
  knight:"rgba(100,160,255,.4)", tower:"rgba(214,170,77,.4)", siege:"rgba(220,100,80,.4)"
};

function renderCards(){
  // Immer die EIGENE Hand rendern (online der eigene Sitz, nicht der aktuelle
  // Spieler) — Kartenaktionen sind ohnehin per Relay auf den eigenen Zug begrenzt.
  const p = wbLocalPlayer();
  const terrWrap = $("cardsScroll");
  if(!terrWrap) return;
  const terrCount = _territoryCardCount(p);
  const councilCount = _councilCardCount(p);
  $("cardsLabel").textContent = terrCount + "/5";
  const cl = $("councilLabel"); if(cl) cl.textContent = councilCount + "/3";

  const terrCards = [];
  p.hand.forEach(function(c, i){ if(c.source !== "council") terrCards.push({c:c, i:i}); });
  terrWrap.innerHTML = "";

  function emptyState(text){
    const d = document.createElement("div");
    d.style.cssText = "color:var(--muted);font-style:italic;font-size:11px;padding:20px 8px;text-align:center";
    d.textContent = text;
    return d;
  }

  if(terrCards.length === 0){
    terrWrap.appendChild(emptyState(wbUI('NoTerr')));
  } else {
    terrCards.forEach(function(entry){
      const c = entry.c, i = entry.i;
      const div = document.createElement("div");
      div.className = "terr-card";
      div.title = "Klicken zum Vergrößern";
      div.style.position = "relative";
      div.style.background  = CARD_COLORS[c.symbol]  || "";
      div.style.borderColor = CARD_BORDERS[c.symbol] || "var(--line)";
      div.innerHTML =
        _territorySvg(c.regionId) +
        '<div class="tc-type">'   + (CARD_LABELS[c.symbol] || c.symbol) + '</div>' +
        '<div class="tc-name">'   + (wbRegName(c.regionId) || c.name) + '</div>' +
        '<div class="tc-mini-sym">' + (CARD_ICONS[c.symbol] || "?") + '</div>';
      div.style.cursor = "pointer";
      div.onclick = function(){ showCardLarge(c); };
      terrWrap.appendChild(div);
    });

    // Exchange button (territory cards only) — mit proaktivem Kombi-Vorschlag
    const combo = _suggestCombo(p);
    const exBtn = document.createElement("div");
    exBtn.className = "exchange-trigger" + (combo ? " has-combo" : "");
    exBtn.textContent = combo
      ? ("\uD83D\uDCDC " + wbUI('Redeemable') + " " + combo.label + " \u2192 +" + combo.troops + " " + wbUI('Troops'))
      : ("\uD83D\uDCDC " + wbUI('RedeemTerr'));
    exBtn.onclick = openExchangeModal;
    terrWrap.appendChild(exBtn);
  }
}

/* ── Ratskarten-Hand-Viewer ─────────────────────────────────────
   openCouncilHandModal()/closeCouncilHandModal() sind weiter oben definiert
   (leiten in den Ratskarten-Tab des "Deine Karten"-Modals um). */
function renderCouncilHandModal(){
  const p = wbLocalPlayer();   // eigene Ratskarten-Hand, unabhängig vom Zug
  const wrap = $("councilHandScroll");
  if(!wrap) return;
  const councilCards = [];
  p.hand.forEach(function(c, i){ if(c.source === "council") councilCards.push({c:c, i:i}); });
  wrap.innerHTML = "";
  if(councilCards.length === 0){
    wrap.innerHTML = '<div style="color:var(--muted);font-style:italic;font-size:13px;padding:20px 8px;text-align:center">Keine Ratskarten auf der Hand.</div>';
    return;
  }
  councilCards.forEach(function(entry){
    const c = entry.c, i = entry.i;
    const div = document.createElement("div");
    if(!c.revealed){
      div.className = "play-card council facedown";
      div.title = wbUI('CouncilFaceCard');
      div.innerHTML =
        '<div class="pc-type">' + wbUI('Verdeckt') + '</div>' +
        '<div class="pc-seal">🏛</div>' +
        '<div class="pc-name">???</div>' +
        '<div class="pc-effect"></div>';
      const flipBtn = document.createElement("button");
      flipBtn.className = "tc-action-btn";
      flipBtn.textContent = wbUI('Aufdecken');
      flipBtn.onclick = function(e){ e.stopPropagation(); flipHandCard(i); renderCouncilHandModal(); };
      div.appendChild(flipBtn);
      div.onclick = function(){ flipHandCard(i); renderCouncilHandModal(); };
    } else {
      const icon = {attack:"⚔",defense:"🛡",supply:"⚙",event:"⭐",shadow:"🌑"}[c.type] || "📜";
      div.className = "play-card council " + (c.type || "");
      div.title = wbCardEffect(c);
      div.innerHTML =
        '<div class="pc-type">' + wbUI('Hoher Rat') + '</div>' +
        '<div class="pc-seal">' + icon + '</div>' +
        '<div class="pc-name">' + wbCardName(c) + '</div>' +
        '<div class="pc-meta">' + wbTypeLabel(c.type) + '</div>' +
        '<div class="pc-effect">' + wbCardEffect(c) + '</div>';
      const playBtn = document.createElement("button");
      playBtn.className = "tc-action-btn play";
      playBtn.textContent = wbUI('Spielen');
      playBtn.onclick = function(e){ e.stopPropagation(); closeCouncilHandModal(); playCouncilCard(i); };
      div.appendChild(playBtn);
      div.onclick = function(){ showCardLarge(c); };
    }
    div.style.cursor = "pointer";
    wrap.appendChild(div);
  });
}

/* ── Karten-Einlöse-Modal ────────────────────────────────────── */
function openExchangeModal(){
  const p = currentPlayer();
  const modal = $("exchangeModal");
  if(!modal) return;
  renderExchangeModal(p);
  modal.classList.add("show");
}

/* Schlägt die wertvollste einlösbare Kartenkombination vor (für Hervorhebung). */
function _suggestCombo(p){
  const bySym = {knight:[], tower:[], siege:[]};
  (p.hand||[]).forEach((c,i)=>{ if(bySym[c.symbol]) bySym[c.symbol].push(i); });
  if(bySym.knight.length>=1 && bySym.tower.length>=1 && bySym.siege.length>=1)
    return {troops:10, idx:[bySym.knight[0],bySym.tower[0],bySym.siege[0]], label:'1 von jedem'};
  if(bySym.tower.length>=3)  return {troops:7, idx:bySym.tower.slice(0,3),  label:'3 × Turm'};
  if(bySym.siege.length>=3)  return {troops:5, idx:bySym.siege.slice(0,3),  label:'3 × Katapult'};
  if(bySym.knight.length>=3) return {troops:3, idx:bySym.knight.slice(0,3), label:'3 × Ritter'};
  return null;
}

function renderExchangeModal(p){
  const counts = {knight:0, tower:0, siege:0};
  p.hand.forEach(c => { if(counts[c.symbol] !== undefined) counts[c.symbol]++; });
  const hasAll = counts.knight >= 1 && counts.tower >= 1 && counts.siege >= 1;

  // Troops exchange options
  const troopSets = [
    {symbols:["knight","knight","knight"], label:"3 × ♞ Ritter",    troops:3,  ok: counts.knight>=3},
    {symbols:["siege","siege","siege"],    label:"3 × ⚙ Katapult",  troops:5,  ok: counts.siege>=3},
    {symbols:["tower","tower","tower"],    label:"3 × 🏰 Turm",     troops:7,  ok: counts.tower>=3},
    {symbols:["knight","tower","siege"],   label:"1 von jedem",     troops:10, ok: hasAll},
  ];

  // My territories for unit purchase
  const myTerrIds = REGIONS.filter(r => G.regions[r.id].ownerId === p.id).map(r => r.id);

  // Card selection state
  window._exchSelected = {cardIdx: null, unitTarget: null};

  // Council cards live in the same p.hand array but must never show up here —
  // this strip is for redeeming territory-card symbol sets only.
  const terrEntries = [];
  p.hand.forEach((c,i) => { if(c.source !== "council") terrEntries.push({c, i}); });

  $("exchangeModalBody").innerHTML = `
    <div class="exch-section">
      <div class="exch-sect-title">📜 Deine Karten (${terrEntries.length}/5)</div>
      <div class="exch-cards-row" id="exchCardRow">
        ${terrEntries.map(({c,i}) => `
          <div class="exch-card" data-i="${i}" data-sym="${c.symbol}" style="border-color:${CARD_BORDERS[c.symbol]}">
            <div class="ec-icon">${CARD_ICONS[c.symbol]}</div>
            <div class="ec-type">${CARD_LABELS[c.symbol]}</div>
            <div class="ec-name">${wbRegName(c.regionId)||c.name}</div>
          </div>`).join("")}
      </div>
    </div>

    <div class="exch-section">
      <div class="exch-sect-title">🏹 Truppen erhalten — 3 Karten</div>
      <div class="exch-troops-grid">
        ${troopSets.map(s => `
          <div class="exch-troop-btn ${s.ok?'ok':'locked'}" data-syms="${s.symbols.join(',')}" data-troops="${s.troops}">
            <div class="etb-label">${s.label}</div>
            <div class="etb-reward">+${s.troops} Truppen</div>
            ${s.ok ? `<button class="etb-confirm">Einlösen</button>` : `<div class="etb-locked">Nicht genug Karten</div>`}
          </div>`).join("")}
      </div>
    </div>
  `;

  // Card click → unit buy setup
  const combo = _suggestCombo(p);
  if(combo){
    combo.idx.forEach(i => { const el = $("exchCardRow").querySelector('.exch-card[data-i="'+i+'"]'); if(el) el.classList.add('combo'); });
    const sect = $("exchCardRow").closest('.exch-section');
    const title = sect && sect.querySelector('.exch-sect-title');
    if(title) title.innerHTML += ' <span class="combo-hint">→ Kombi: ' + combo.label + ' (+' + combo.troops + ' Truppen)</span>';
  }

  // Troop exchange buttons
  $("exchangeModalBody").querySelectorAll(".etb-confirm").forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest(".exch-troop-btn");
      const syms = row.dataset.syms.split(",");
      const troops = +row.dataset.troops;
      $("exchangeModal").classList.remove("show");
      if(wbRelay('exchangeTroops', [syms, troops])) return;
      wbApplyExchangeTroops(syms, troops);
    };
  });
}
function wbApplyExchangeTroops(syms, troops){
  const p = currentPlayer();
  for(const sym of syms){
    const idx = p.hand.findIndex(c => c.symbol === sym);
    if(idx >= 0){ G.discard.push(p.hand.splice(idx,1)[0]); }
  }
  p.troopsAvailable += troops;
  const symLabels = {knight:'♞ Ritter', tower:'🏰 Turm', siege:'⚙ Katapult'};
  const setLabel = syms.map(s => symLabels[s] || s).join(' + ');
  log(`📜 ${p.name} löst <b>${setLabel}</b> ein: +${troops} Truppen`);
  toast(`+${troops} Truppen erhalten!`);
  updateHUD();
}

/* ===== CHARACTER CARDS MODAL ===== */
$("charBtn").onclick = () => openCharModal();

/* ── Boni-Overlay: Kontinent-Boni als Einblendung über der Karte ── */
let _bonusOn = false;
/* Kleiner Schiffs-Glyph (Rumpf + dreieckiges Segel + Mast) für die 2D-Naval-
   Übersicht. Zentriert auf (x,y), Größe s; fill = Segel-/Flottenfarbe,
   stroke = dunkler Rumpf/Mast. */
function _shipGlyphSvg(x, y, s, fill, stroke){
  const hull = 'M '+(x-1.15*s)+' '+(y+0.15*s)+
    ' Q '+x+' '+(y+1.05*s)+' '+(x+1.15*s)+' '+(y+0.15*s)+
    ' L '+(x+0.82*s)+' '+(y+0.45*s)+
    ' Q '+x+' '+(y+0.85*s)+' '+(x-0.82*s)+' '+(y+0.45*s)+' Z';
  const sail = 'M '+x+' '+(y-1.55*s)+
    ' L '+(x+0.98*s)+' '+(y+0.05*s)+
    ' L '+x+' '+(y+0.05*s)+' Z';
  return '<path d="'+hull+'" fill="'+stroke+'" stroke="'+stroke+'" stroke-width="'+(0.12*s)+'" stroke-linejoin="round"/>'+
    '<line x1="'+x+'" y1="'+(y-1.65*s)+'" x2="'+x+'" y2="'+(y+0.3*s)+'" stroke="'+stroke+'" stroke-width="'+(0.16*s)+'" stroke-linecap="round"/>'+
    '<path d="'+sail+'" fill="'+fill+'" fill-opacity="0.96" stroke="'+stroke+'" stroke-width="'+(0.12*s)+'" stroke-linejoin="round"/>';
}
/* Geteilter Kontinent-Karten-Renderer: liefert das SVG-Markup der farbigen
   Kontinentkarte (Festland + Inseln) mit Namen und Boni. Genutzt vom Boni-
   Overlay (Vollbild) und von der Hauptmenü-Karte. */
function buildContinentMapSvg(opts){
  opts = opts || {};
  /* Optionaler opts.map: rendert die Übersicht einer BELIEBIGEN Karte (für die
     Lobby-Auswahl), ohne die globale Kartenbindung (REGIONS/CONTINENTS/IS_NAVAL)
     anzutasten — die wird erst beim Spielstart der geladenen Karte gebraucht. */
  const _map        = opts.map || (typeof __WB_MAP !== 'undefined' ? __WB_MAP : null);
  const _regions    = (_map && _map.regions)    || REGIONS;
  const _continents = (_map && _map.continents) || CONTINENTS;
  const _naval      = _map ? (!!_map.naval || _map.id === 'sturmsee') : IS_NAVAL;
  const _fontScaleDef = (_map && _map.minimapFontScale) || 0.033;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  _regions.forEach(r => { const bb=_pathBBox(r.d); if(bb){ if(bb.minX<minX)minX=bb.minX; if(bb.minY<minY)minY=bb.minY; if(bb.minX+bb.w>maxX)maxX=bb.minX+bb.w; if(bb.minY+bb.h>maxY)maxY=bb.minY+bb.h; } });
  if(!isFinite(minX)) return '';
  const W = maxX-minX, H = maxY-minY;
  /* Font-Anteil der Kartenbreite: Aufruf-Override > per-Karte-Regler > Standard.
     Karten mit vielen dicht stehenden Reichen (Europa) setzen einen kleineren
     minimapFontScale, damit sich die Labels nicht überlappen. */
  const fs = Math.max(7, W*(opts.fontScale || _fontScaleDef));
  /* Add padding so edge paths and text labels aren't clipped by the viewBox */
  const pad = fs * 2.5;
  const vx = minX-pad, vy = minY-pad, vw = W+2*pad, vh = H+2*pad;
  const col = {}, agg = {};
  _continents.forEach(c => { col[c.key]=c.color; agg[c.key]={name:c.short||c.name,bonus:c.bonus,sx:0,sy:0,n:0}; });
  let paths = '';
  if(_naval){
    /* Naval-Übersicht (Sturmsee): offene See mit einem kleinen Schiffs-Glyph je
       Feld — die 2D-Karte spiegelt so die Flotten-Optik der 3D-Szene, statt
       flacher Inselpolygone. Segelfarbe = Flotte (Kontinent), Rumpf dunkel. */
    paths += '<rect x="'+vx+'" y="'+vy+'" width="'+vw+'" height="'+vh+'" fill="#26506e"/>';
    /* ein paar dezente Wellenlinien */
    for(let i=1;i<=5;i++){ const wy = vy + vh*i/6;
      paths += '<path d="M '+vx+' '+wy+' q '+(vw*0.06)+' '+(-fs*0.35)+' '+(vw*0.12)+' 0 t '+(vw*0.12)+' 0 t '+(vw*0.12)+' 0 t '+(vw*0.12)+' 0 t '+(vw*0.12)+' 0 t '+(vw*0.12)+' 0 t '+(vw*0.12)+' 0 t '+(vw*0.12)+' 0" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="'+(fs*0.12)+'"/>';
    }
    const gs = Math.max(fs*0.5, W*0.014);   // Glyph-Größe
    _regions.forEach(r => {
      const c = col[r.continent] || '#888';
      paths += _shipGlyphSvg(r.cx, r.cy, gs, c, 'rgba(10,18,28,0.92)');
      const a = agg[r.continent]; if(a){ a.sx+=r.cx; a.sy+=r.cy; a.n++; }
    });
  } else {
    _regions.forEach(r => {
      const c = col[r.continent] || '#555';
      paths += '<path d="'+r.d+'" fill="'+c+'" fill-opacity="0.85" stroke="rgba(0,0,0,.45)" stroke-width="0.6" stroke-linejoin="round"/>';
      const a = agg[r.continent]; if(a){ a.sx+=r.cx; a.sy+=r.cy; a.n++; }
    });
  }
  let labels = '';
  Object.keys(agg).forEach(k => {
    const a = agg[k]; if(!a.n) return;
    const x = a.sx/a.n, y = a.sy/a.n;
    labels += '<text x="'+x+'" y="'+y+'" text-anchor="middle" class="bo-map-name" style="font-size:'+fs+'px">'+a.name+'</text>' +
              '<text x="'+x+'" y="'+(y+fs*1.15)+'" text-anchor="middle" class="bo-map-bonus" style="font-size:'+fs+'px">+'+a.bonus+'</text>';
  });
  const cls = opts.svgClass || 'bo-map';
  return '<svg class="'+cls+'" viewBox="'+vx+' '+vy+' '+vw+' '+vh+'" preserveAspectRatio="xMidYMid meet">' + paths + labels + '</svg>';
}
function renderBonusOverlay(){
  const el = $("bonusOverlay"); if(!el) return;
  el.innerHTML = '<div class="bo-title">🏆 Kontinent-Boni</div>' +
                 '<div class="bo-hint">Tippen zum Schließen</div>' +
                 buildContinentMapSvg();
}
/* Lobby-Karte füllen: Kontinent-Übersicht der aktuell in der Lobby GEWÄHLTEN
   Karte (window.WB_LOBBY_MAP). Der Wechsel läuft ohne Reload — die eigentliche
   3D-Karte wird erst beim Spielstart (ggf. mit einmaligem Reload) geladen. */
function renderLobbyMap(mapId){
  const mm = document.getElementById("lobbyMap");
  if(!mm) return;
  const id  = mapId || (typeof window !== 'undefined' && window.WB_LOBBY_MAP) || __WB_MAP_ID;
  const map = (typeof window !== 'undefined' && window.WB_MAPS && window.WB_MAPS[id]) || __WB_MAP;
  mm.innerHTML = buildContinentMapSvg({ svgClass:'menu-map', map });
}
/* Figuren-Umschalter an die gewählte Karte anpassen: Seeschlacht-Karten (naval,
   z. B. Sturmsee) nutzen feste Schiffs-Figuren mit Banner-Segel — der Truppen-
   Figuren-Schalter hat dort keine Wirkung und wird deshalb ausgegraut & gesperrt. */
function wbUpdateFigureToggle(mapId){
  const tf = document.getElementById("optTroopFigures");
  if(!tf) return;
  const id    = mapId || (typeof window !== 'undefined' && window.WB_LOBBY_MAP) || __WB_MAP_ID;
  const map   = (typeof window !== 'undefined' && window.WB_MAPS && window.WB_MAPS[id]) || null;
  const naval = map ? (!!map.naval || id === 'sturmsee') : (typeof IS_NAVAL !== 'undefined' && IS_NAVAL);
  const row   = tf.closest(".opt-row");
  tf.classList.toggle("disabled", naval);
  if(row){
    row.classList.toggle("opt-disabled", naval);
    row.title = naval ? "Seeschlacht: feste Schiffs-Figuren (Banner-Segel) — nicht umschaltbar" : "";
  }
  if(naval){
    tf.classList.remove("on");   // Seeschlacht zeigt immer Schiffe
  }else{
    try{ tf.classList.toggle("on", getOptions().troopFigures !== false); }catch(e){}
  }
}
function toggleBonusOverlay(){
  _bonusOn = !_bonusOn;
  const el = $("bonusOverlay"), btn = $("bonusBtn");
  if(_bonusOn){ renderBonusOverlay(); if(el) el.style.display = ''; if(btn) btn.classList.add('active'); }
  else { if(el) el.style.display = 'none'; if(btn) btn.classList.remove('active'); }
}
$("bonusBtn").onclick = toggleBonusOverlay;
/* Klick auf das Vollbild-Overlay schließt es wieder. */
(function(){ const ov = $("bonusOverlay"); if(ov) ov.addEventListener('click', () => { if(_bonusOn) toggleBonusOverlay(); }); })();

/* ── Truppen-Übersicht: alle Häuser mit Gesamt-Truppen & Gebieten ───────
   Vollbild-Overlay über der Karte (Klick schließt). Wird bei offenem Overlay
   in updateHUD() automatisch neu gerendert, sodass sich Truppen-/Gebietszahlen
   live mitbewegen. Gibt den strategischen Überblick „wer sitzt wo wie stark". */
let _overviewOn = false;
function renderTroopOverview(){
  const el = $("overviewOverlay"); if(!el || !G) return;
  const T = (window.BFI18N && window.BFI18N.t) ? window.BFI18N.t : (k => k);
  const rows = G.players.map(p => {
    const terr = ownedTerritoryStates(p.id);
    return { p, fac: FACTIONS[p.faction] || {}, troops: terr.reduce((s,d) => s + d.troops, 0), regions: terr.length };
  }).sort((a,b) => b.troops - a.troops || b.regions - a.regions);
  const maxTroops = Math.max(1, ...rows.map(r => r.troops));
  const curId = currentPlayer() ? currentPlayer().id : -1;
  const youLabel  = T('warbound.overview.you');
  const elimLabel = T('warbound.overview.eliminated');
  const body = rows.map(r => {
    const isYou = r.p.id === curId;
    const dead  = r.regions === 0;
    const pct   = Math.round(100 * r.troops / maxTroops);
    const color = r.fac.color || '#888';
    return `<div class="ov-row${isYou ? ' ov-you' : ''}${dead ? ' ov-dead' : ''}">
      <span class="ov-sigil" style="color:${color}">${r.fac.sigil || '⚑'}</span>
      <span class="ov-name">${escapeForAttr(r.p.name)}${isYou ? ` <em>(${youLabel})</em>` : ''}</span>
      <span class="ov-bar-wrap"><span class="ov-bar" style="width:${pct}%;background:${color}"></span></span>
      <span class="ov-troops">🛡 ${dead ? `<span class="muted">${elimLabel}</span>` : r.troops}</span>
      <span class="ov-regions">🗺 ${r.regions}</span>
    </div>`;
  }).join("");
  el.innerHTML = `<div class="ov-panel">
      <div class="ov-title">📊 ${T('warbound.overview.title')}</div>
      <div class="ov-rows">${body}</div>
      <div class="ov-hint">${T('warbound.overview.close')}</div>
    </div>`;
}
function toggleTroopOverview(){
  _overviewOn = !_overviewOn;
  const el = $("overviewOverlay"), btn = $("overviewBtn");
  if(_overviewOn){
    if(typeof _bonusOn !== 'undefined' && _bonusOn) toggleBonusOverlay(); // beide Overlays nicht gleichzeitig
    renderTroopOverview();
    if(el) el.style.display = ''; if(btn) btn.classList.add('active');
  } else {
    if(el) el.style.display = 'none'; if(btn) btn.classList.remove('active');
  }
}
(function(){ const b = $("overviewBtn"); if(b) b.onclick = toggleTroopOverview; })();
(function(){ const ov = $("overviewOverlay"); if(ov) ov.addEventListener('click', () => { if(_overviewOn) toggleTroopOverview(); }); })();
renderLobbyMap();
$("charCloseBtn").onclick = () => $("charModal").classList.remove("show");

/* ── Hoher Rat Shop ──────────────────────────────────────── */
const COUNCIL_TYPE_LABELS = {
  attack:"⚔ Angriff", defense:"🛡 Verteidigung",
  supply:"⚙ Versorgung", event:"⭐ Ereignis", shadow:"🌑 Schatten"
};
/* ── Hoher Rat Button: Kauf in Verstärkungsphase, sonst Hand ansehen ── */
$("councilBtn").onclick = () => {
  if(!G) return;
  const cp = currentPlayer();
  if(!cp || cp.type !== "human") return;
  if(wbHostBlocksLocal(cp)) return;   // Host kauft/öffnet keine Ratskarten für einen fremden Gast
  if(G.phase === "reinforce" && !G.councilBoughtThisRound){
    G.councilBoughtThisRound = true;
    startCouncilPhase();
  } else {
    openCouncilHandModal();
  }
};

/* Emblem/Siegel je Charakter-Rolle für die Kartenoptik. */
const CHAR_ROLE_EMOJI = {
  "Anführer":"👑","Anführerin":"👑","Krieger":"⚔","Kriegerin":"⚔","Priesterin":"🕊",
  "Wache":"🛡","Wächter":"🛡","Burgvogt":"🏰","Logistik":"⚙","Belagerung":"💣",
  "Artillerie":"💥","Luftangriff":"🦅","Kundschafter":"🔭","Späher":"🔭","Magie":"✨",
  "Reiter":"🐎","Reiterin":"🐎","Assassine":"🗡","Saboteur":"🧨","Taktiker":"♟"
};
function _charSeal(c){ return (c && CHAR_ROLE_EMOJI[c.role]) || "👤"; }

function openCharModal(){
  const p = currentPlayer();
  if(!p || p.type !== "human") return;   // charBtn ist bei Bot-Zügen schon ausgeblendet
  if(wbHostBlocksLocal(p)) return;       // Host wirbt keine Charaktere für einen fremden Gast an
  const fac = FACTIONS[p.faction];
  const cards = CHARACTER_CARDS[p.faction];
  $("charModalTitle").textContent = `👥 Charaktere — ${fac.name}`;
  $("charModalSub").textContent = `${fac.style} — Du hast ${p.gold} 💰 Gold.`;
  $("charGrid").innerHTML = cards.map((c, i) => {
    const owned = p.characters.some(x => x.name === c.name);
    return `
      <div class="char-card" data-i="${i}" style="cursor:pointer">
        <div class="char-cost">${c.cost} 💰</div>
        <div class="role">${wbRole(c)}</div>
        <div class="char-seal">${_charSeal(c)}</div>
        <div class="char-name">${wbCardName(c)}</div>
        <div class="char-timing">⏱ ${wbTiming(c)}</div>
        <div class="char-effect">${wbCardEffect(c)}</div>
        <button class="char-buy" data-i="${i}" ${owned ? "disabled" : (p.gold < c.cost ? "disabled" : "")}>
          ${owned ? wbUI("AktivBtn") : (p.gold < c.cost ? wbUI("ZuWenigGold") : wbUI("Anwerben"))}
        </button>
      </div>
    `;
  }).join("");
  // Klick auf die Karte (nicht den Button): vergrößert anzeigen
  $("charGrid").querySelectorAll(".char-card").forEach(el => {
    el.onclick = () => showCardLarge(cards[+el.dataset.i]);
  });
  $("charGrid").querySelectorAll(".char-buy").forEach(el => {
    if(el.disabled) return;
    el.onclick = (e) => {
      e.stopPropagation();
      const i = +el.dataset.i;
      const c = cards[i];
      if(p.gold < c.cost) return;
      p.gold -= c.cost;
      p.characters.push({...c});
      log(`👥 ${p.name} wirbt <b>${wbCardName(c)}</b> an (−${c.cost} 💰)`);
      updateHUD();
      openCharModal(); // refresh
    };
  });
  $("charModal").classList.add("show");
}

/* ===== PHASE BUTTON ===== */

/* ── Hoher Rat Phase ──────────────────────────────────────────── */
function startCouncilPhase() {
  // Phase bleibt "reinforce" — Overlay zeigt verdeckte Karte
  const pool = shuffle([...SIEGELKARTEN]);
  G.councilDrawnCard = pool[0];

  $("cpoCard").classList.remove("flipped");
  $("cpoFront").innerHTML = "";
  $("cpoFront").style.background = "";
  $("cpoFront").style.borderColor = "";
  $("cpoSub").textContent = wbUI("CouncilFaceCard");

  const p = currentPlayer();
  const canBuy = G.round > 1 && p.gold >= 1 && _councilCardCount(p) < COUNCIL_CARD_LIMIT;   // ab Runde 2, max 3 Ratskarten
  const actions = $("cpoActions");
  actions.innerHTML = "";

  const buyBtn = document.createElement("button");
  buyBtn.className = "primary";
  buyBtn.disabled = !canBuy;
  buyBtn.textContent = canBuy ? (wbUI("BuyFaceDown") + " \u2014 1 \uD83D\uDCB0")
    : (G.round <= 1 ? wbUI("FromRound2")
      : (_councilCardCount(p) >= COUNCIL_CARD_LIMIT ? wbUI("CouncilHandFull") : wbUI("ZuWenigGold")));

  const skipBtn = document.createElement("button");
  skipBtn.textContent = wbUI("Decline");
  skipBtn.style.marginTop = "6px";
  skipBtn.style.opacity = "0.6";

  actions.appendChild(buyBtn);
  actions.appendChild(skipBtn);

  buyBtn.onclick = function() {
    const pp = currentPlayer();
    const card = G.councilDrawnCard;
    if(G.round > 1 && pp.gold >= 1 && _councilCardCount(pp) < COUNCIL_CARD_LIMIT) {
      pp.gold -= 1;
      pp.hand.push(Object.assign({}, card, {source:"council", revealed:true}));   // direkt aufgedeckt
      log("\uD83C\uDFDB <b>" + pp.name + "</b> kauft <b>" + wbCardName(card) + "</b> (\u22121 \uD83D\uDCB0)");
      if(pp.type==='human'){
        toast("\uD83D\uDCDC " + wbCardName(card) + " gekauft");
        animateCardPurchase(card);   // einfliegen, aufdecken, in die Hand
      }
    }
    $("councilPhaseOverlay").style.display = "none";
    updateHUD();
  };

  skipBtn.onclick = function() {
    log("\uD83C\uDFDB <b>" + currentPlayer().name + "</b> lehnt die Ratskarte ab.");
    $("councilPhaseOverlay").style.display = "none";
    updateHUD();
  };

  $("councilPhaseOverlay").style.display = "flex";
}

/* -- Karte in der Hand aufdecken -------------------------------- */
function flipHandCard(i) {
  const p = currentPlayer();
  if(!p.hand[i] || p.hand[i].source !== "council") return;
  p.hand[i] = Object.assign({}, p.hand[i], {revealed:true});
  animateCardDraw(p.hand[i]);   // jetzt aufgedeckt kurz einfliegen lassen
  updateHUD();
  toast("\uD83D\uDCDC " + p.hand[i].name + ": " + p.hand[i].effect);
}

/* ════════════════════════════════════════════════════════════════════
   EFFEKT-ENGINE — Ratskarten & Charakterkarten wirken jetzt tatsächlich.
   • Sofort-Effekte (Gold, Truppen, Ziehen, Flächenschaden, Annektieren …)
     werden direkt ausgeführt, ggf. mit interaktiver Zielauswahl.
   • Kampf-Effekte werden in getCombatMods() gesammelt und in der
     Kampfrunde berücksichtigt.
   • Charaktere gelten als aktiv, sobald sie angeworben wurden ("✓ Aktiv").
   ════════════════════════════════════════════════════════════════════ */

function _eff(p, src, msg){ log(`✨ <b>${p.name}</b> · <b>${src}</b> — ${msg}`); toast(`${src}: ${msg}`); }
function _ownsChar(p, name){ return !!(p && p.characters && p.characters.some(c => c.name === name)); }
function _myRegionIds(pid){ return REGIONS.filter(r => G.regions[r.id] && G.regions[r.id].ownerId === pid).map(r => r.id); }
function _myLogical(pid){ return LOGICAL_TERRITORIES.filter(lt => G.regions[lt.pieceIds[0]].ownerId === pid); }
function _strongestOwnId(pid){
  let best=null, bt=-1;
  _myLogical(pid).forEach(lt => { const st=G.regions[lt.pieceIds[0]]; if(st.troops>bt){bt=st.troops; best=lt.pieceIds[0];} });
  return best;
}
function _ownsFullContinent(pid){
  return CONTINENTS.some(c => {
    const regs = REGIONS.filter(r => r.continent === c.key);
    return regs.length>0 && regs.every(r => G.regions[r.id] && G.regions[r.id].ownerId === pid);
  });
}
function _symLabel(s){ return s==='siege'?'⚙ Katapult':(s==='tower'?'🏰 Turm':'♞ Ritter'); }
function _symRank(s){ return s==='siege'?2:1; }
/* Siegel des Donners: hält der Donner-Besitzer die Verteidigung, zieht der
   Angreifer für diesen Zug keine Gebietskarte. */
function _onDefenderHeld(ctx){
  if(!ctx || !ctx.defP || !ctx.atkP) return;
  if(G.thunderRound === G.round && G.thunderOwner === ctx.defP.id){
    ctx.atkP._noCardThisTurn = true;
    _eff(ctx.defP, 'Siegel des Donners', ctx.atkP.name + ' zieht keine Karte');
  }
}

/* Karten-Einflug: kurz aufgedeckt einfliegen lassen, dann in die Hand „verschwinden".
   faceDown=true zeigt eine Kartenrückseite (z.B. verdeckt gekaufte Ratskarte). */
function animateCardDraw(card, faceDown){
  try{
    window.BrettSounds?.play?.("draw");
    const el = document.createElement('div');
    el.className = 'card-flyin';
    if(faceDown){
      el.innerHTML = '<div class="cfi-back">📜</div>';
    } else if(card && card.type === 'territory'){
      const icon = card.symbol==='siege'?'⚙':(card.symbol==='tower'?'🏰':'♞');
      const sub  = wbUnitLabel(card.symbol);
      el.innerHTML = `<div class="cfi-card"><div class="cfi-icon">${icon}</div><div class="cfi-name">${wbRegName(card.regionId)||card.name||wbUI('Gebietskarte')}</div><div class="cfi-sub">${sub}</div></div>`;
    } else if(card){
      const tEmoji = {attack:'⚔',defense:'🛡',supply:'📦',event:'✦'}[card.type] || '📜';
      el.innerHTML = `<div class="cfi-card"><div class="cfi-icon">${tEmoji}</div><div class="cfi-name">${wbCardName(card)||wbUI('Ratskarte')}</div><div class="cfi-sub">${wbCardEffect(card)||''}</div></div>`;
    } else {
      el.innerHTML = '<div class="cfi-card"><div class="cfi-icon">📜</div><div class="cfi-name">' + wbUI('Karte') + '</div></div>';
    }
    document.body.appendChild(el);
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 1850);
  }catch(e){ console.error('animateCardDraw', e); }
}

/* Karte vergrößert anzeigen: fliegt ein, bleibt lesbar bis zum Tippen.
   Akzeptiert Ratskarten ({type,name,effect}), Gebietskarten ({type:'territory',symbol,name})
   und Charakterkarten ({name,role,timing,effect,cost}). */
function showCardLarge(card, action){
  try{
    const old = document.getElementById('cardZoom'); if(old) old.remove();
    let icon, label, name, effect, meta = '', shape = '';
    if(card && (card.role !== undefined || card.timing !== undefined)){          // Charakterkarte
      icon = '👤';
      label = [wbRole(card), wbTiming(card)].filter(Boolean).join(' · ') || wbUI('Charakter');
      name = wbCardName(card); effect = wbCardEffect(card);
      if(card.cost !== undefined) meta = '💰 ' + card.cost + ' ' + wbUI('Gold');
    } else if(card && card.type === 'territory'){                                 // Gebietskarte
      icon = card.symbol==='siege' ? '⚙' : (card.symbol==='tower' ? '🏰' : '♞');
      label = wbUI('Gebietskarte') + ' · ' + wbUnitLabel(card.symbol);
      name = wbCardName(card); effect = wbUI('RedeemHint');
      shape = _territorySvg(card.regionId);
    } else if(card){                                                              // Ratskarte
      const M = {attack:['⚔','Angriff'],defense:['🛡','Verteidigung'],supply:['⚙','Versorgung'],event:['⭐','Ereignis'],shadow:['🌑','Schatten']}[card.type] || ['📜','Karte'];
      icon = M[0]; label = wbUI('Hoher Rat') + ' · ' + wbTypeLabel(card.type); name = wbCardName(card); effect = wbCardEffect(card);
      if(card.cost !== undefined) meta = '💰 ' + card.cost + ' ' + wbUI('Gold');
    } else { return; }
    const back = document.createElement('div');
    back.id = 'cardZoom'; back.className = 'card-zoom-backdrop';
    back.innerHTML = '<div class="card-zoom">' +
      (shape ? '<div class="cz-shape">' + shape + '</div>' : '<div class="cz-icon">' + icon + '</div>') +
      '<div class="cz-label">' + label + '</div>' +
      '<div class="cz-name">' + (name||'') + '</div>' +
      (meta ? '<div class="cz-meta">' + meta + '</div>' : '') +
      '<div class="cz-effect">' + (effect||'') + '</div>' +
      (action ? '<button class="cz-action">' + action.label + '</button>' : '') +
      '<div class="cz-hint">' + (action ? wbUI('TapOutside') : wbUI('TapClose')) + '</div></div>';
    back.onclick = (e) => {
      if(action && e.target.closest('.card-zoom') && !e.target.classList.contains('cz-action')) return; // im Kartenbereich nichts tun (außer Button)
      back.classList.add('closing'); setTimeout(() => back.remove(), 250);
    };
    if(action){
      const btn = back.querySelector('.cz-action');
      if(btn) btn.onclick = (e) => { e.stopPropagation(); back.classList.add('closing'); setTimeout(() => back.remove(), 250); action.onConfirm(); };
    }
    document.body.appendChild(back);
  }catch(e){ console.error('showCardLarge', e); }
}

/* Ratskarten-Kauf: Karte fliegt verdeckt ein, dreht sich auf (Flip) und
   schrumpft danach in die Hand. */
function animateCardPurchase(card){
  try{
    window.BrettSounds?.play?.("draw");
    const M = {attack:['⚔','Angriff'],defense:['🛡','Verteidigung'],supply:['⚙','Versorgung'],event:['⭐','Ereignis'],shadow:['🌑','Schatten']}[card.type] || ['📜','Karte'];
    const el = document.createElement('div'); el.className = 'card-purchase';
    el.innerHTML =
      '<div class="cp-inner">' +
        '<div class="cp-face cp-back">📜</div>' +
        '<div class="cp-face cp-front">' +
          '<div style="font-size:42px;line-height:1">' + M[0] + '</div>' +
          '<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#cdbb93">' + wbUI('Hoher Rat') + ' · ' + wbTypeLabel(card.type) + '</div>' +
          '<div style="font-size:16px;font-weight:800;color:#f6d98b;line-height:1.2">' + (wbCardName(card)||'') + '</div>' +
          '<div style="font-size:11px;line-height:1.4;color:#e8dcc0">' + (wbCardEffect(card)||'') + '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 2350);
  }catch(e){ console.error('animateCardPurchase', e); }
}

/* Bounding-Box eines SVG-Pfads (grobe Schätzung über alle Zahlenpaare). */
function _pathBBox(d){
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || [];
  let x=0, y=0, sx=0, sy=0, minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity, i=0, cmd='';
  const ext=(px,py)=>{ if(px<minX)minX=px; if(px>maxX)maxX=px; if(py<minY)minY=py; if(py>maxY)maxY=py; };
  const num=()=>parseFloat(toks[i++]);
  while(i<toks.length){
    const t=toks[i];
    if(/[A-Za-z]/.test(t)){ cmd=t; i++; if(cmd==='Z'||cmd==='z'){ x=sx; y=sy; continue; } }
    const rel = (cmd===cmd.toLowerCase());
    switch(cmd.toUpperCase()){
      case 'M': { let nx=num(),ny=num(); x=rel?x+nx:nx; y=rel?y+ny:ny; sx=x; sy=y; ext(x,y); cmd=rel?'l':'L'; break; }
      case 'L': { let nx=num(),ny=num(); x=rel?x+nx:nx; y=rel?y+ny:ny; ext(x,y); break; }
      case 'H': { let nx=num(); x=rel?x+nx:nx; ext(x,y); break; }
      case 'V': { let ny=num(); y=rel?y+ny:ny; ext(x,y); break; }
      case 'C': { let x1=num(),y1=num(),x2=num(),y2=num(),nx=num(),ny=num(); if(rel){x1+=x;y1+=y;x2+=x;y2+=y;nx+=x;ny+=y;} ext(x1,y1); ext(x2,y2); ext(nx,ny); x=nx; y=ny; break; }
      case 'S': case 'Q': { let x1=num(),y1=num(),nx=num(),ny=num(); if(rel){x1+=x;y1+=y;nx+=x;ny+=y;} ext(x1,y1); ext(nx,ny); x=nx; y=ny; break; }
      case 'T': { let nx=num(),ny=num(); if(rel){nx+=x;ny+=y;} ext(nx,ny); x=nx; y=ny; break; }
      case 'A': { num();num();num();num();num(); let nx=num(),ny=num(); if(rel){nx+=x;ny+=y;} ext(nx,ny); x=nx; y=ny; break; }
      default: i++;
    }
  }
  if(!isFinite(minX)) return null;
  return { minX, minY, w:Math.max(1,maxX-minX), h:Math.max(1,maxY-minY) };
}
/* Mini-SVG der tatsächlichen Gebietsform (für Gebietskarten). */
function _territorySvg(regionId, fill, stroke){
  const reg = REGIONS.find(r => r.id === regionId);
  if(!reg || !reg.d) return '';
  const bb = _pathBBox(reg.d); if(!bb) return '';
  const pad = Math.max(bb.w,bb.h)*0.1;
  const vb = (bb.minX-pad)+' '+(bb.minY-pad)+' '+(bb.w+pad*2)+' '+(bb.h+pad*2);
  const sw = Math.max(0.6, Math.max(bb.w,bb.h)*0.018);
  return '<svg class="terr-shape" viewBox="'+vb+'" preserveAspectRatio="xMidYMid meet">'+
    '<path d="'+reg.d+'" fill="'+(fill||'rgba(214,170,77,.30)')+'" stroke="'+(stroke||'#e6c578')+'" '+
    'stroke-width="'+sw+'" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
}

/* — interaktive Zielauswahl über den bestehenden Gebiets-Klick — */
function requestTarget(promptText, filterFn, cb){
  if(!REGIONS.some(r => filterFn(r.id))){ toast("Kein gültiges Ziel — Karte verfällt"); return false; }
  G.pendingTarget = { filterFn, cb };
  toast("🎯 " + promptText);
  const pill=$("phasePill"); if(pill){ pill.textContent="🎯 Ziel wählen"; pill.style.background="rgba(214,170,77,.3)"; }
  return true;
}
function resolvePendingTarget(id){
  const t = G.pendingTarget; if(!t) return false;
  if(!t.filterFn(id)){ toast("Ungültiges Ziel"); return true; }   // bleibt im Zielmodus
  G.pendingTarget = null;
  const pill=$("phasePill"); if(pill) pill.style.background="";
  t.cb(id); updateHUD();
  return true;
}

/* — Kampf-Modifikatoren — */
function _freshMods(){
  /* atkMax=4 (nicht 3): Die Basis-Würfelauswahl ist ohnehin auf 3 begrenzt
     (initDiceSelectors), aber Angriffs-Boni wie „Sturmangriff" oder der
     Charakter „Wüter" (atkDice+1) sollen einen ECHTEN 4. Würfel bringen (beste
     2 von 4 zählen). Mit atkMax=3 wurde dieser Bonus stumm weggedeckelt.
     Verteidigungskarten (Siegel der Mauer/Schatten) senken den Cap weiterhin. */
  return { atkDice:0, atkMax:4, atkAllPlus:0, atkHighPlus:0, atkHighMinus:0, atkW8:0,
           atkRerollLowest:false, atkRerollAll:false,
           defDice:0, defMax:3, defAllPlus:0, defHighPlus:0,
           ignoreTower:false, defAsTower:false, tieToAttacker:false,
           preAtkLoss:0, preDefLoss:0, capAtkLoss:99, capDefLoss:99,
           winDefExtra:0, swap:false, atkBonusBlocked:false, defCharsBlocked:false };
}
function _applyMods(m, src){
  for(const k in src){
    const v = src[k];
    if(typeof v === 'boolean'){ if(v) m[k] = true; }
    else if(k==='atkMax'||k==='defMax'||k==='capAtkLoss'||k==='capDefLoss'){ m[k] = Math.min(m[k], v); }
    else m[k] = (m[k]||0) + v;
  }
}
function armAtk(p, mods){ if(!p.armedAtk) p.armedAtk=_freshMods(); _applyMods(p.armedAtk, mods); }
function armDef(p, mods){ if(!p.armedDef) p.armedDef=_freshMods(); _applyMods(p.armedDef, mods); }

function getCombatMods(atkP, defP, fromR, toR, toId){
  const m = _freshMods();
  // — Angreifer-Charaktere (aktiv = angeworben) —
  if(atkP){
    if(_ownsChar(atkP,'Roter Drache'))  m.atkAllPlus+=1;
    if(_ownsChar(atkP,'Glutpriester'))  m.atkAllPlus+=1;
    if(_ownsChar(atkP,'Greifenreiter')) m.atkAllPlus+=1;
    if(_ownsChar(atkP,'Wüter'))         m.atkDice+=1;
    if(_ownsChar(atkP,'Kronritter'))    m.atkHighPlus+=1;
    if(_ownsChar(atkP,'Belagerer'))     m.atkW8+=1;
    if(_ownsChar(atkP,'Kanonierin'))    m.tieToAttacker=true;
    if(_ownsChar(atkP,'Schattenfürst')) m.preDefLoss+=1;
    if(_ownsChar(atkP,'Verräter') && toR.troops>=3) m.defMax=Math.min(m.defMax,1);
    if(_ownsChar(atkP,'Gesandter'))     m.defCharsBlocked=true;
    if(atkP.armedAtk) _applyMods(m, atkP.armedAtk);
  }
  // — Rundenweite Effekte —
  if(G.blackFlagRound === G.round) m.defCharsBlocked = true;        // Schwarze Fahne
  if(G.stormRound === G.round)     m.atkDice -= 1;                  // Siegel des Sturms II
  if(G.warDrumRound === G.round && atkP && G.warDrumOwner===atkP.id) m.winDefExtra += 1;  // Kriegstrommel
  // — Verteidiger-Charaktere: Bots automatisch, Mensch nur wenn ausgewählt
  //   (einmal pro Runde verbrauchbar). —
  if(defP && !m.defCharsBlocked){
    const autoAll = defP.type !== 'human';
    const armed = (battleCtx && battleCtx.armedDefChars) ? battleCtx.armedDefChars : null;
    _DEF_CHARS.forEach(name => {
      if(!_ownsChar(defP, name)) return;
      if(autoAll || (armed && armed.has(name))) _applyDefCharMod(m, name, defP, toId);
    });
  }
  if(defP && defP.armedDef) _applyMods(m, defP.armedDef);
  // Nebelhexe / Siegel der Stille: Angreifer-Boni neutralisieren
  if(m.atkBonusBlocked){ m.atkAllPlus=0; m.atkHighPlus=0; m.atkW8=0; m.atkRerollLowest=false; m.atkRerollAll=false; if(m.atkDice>0) m.atkDice=0; }
  return m;
}
/* Einzel-Charakter-Effekt eines Verteidigers in die Mods einrechnen — für die
   inkrementelle Auswahl im Verteidigungs-Panel (ohne kompletten Neuberechnung). */
function _applyDefCharMod(m, name, defP, toId){
  if(name==='Sturmmaid')              m.defHighPlus+=1;
  else if(name==='Adlerwächter')      m.atkDice-=1;
  else if(name==='Nebelhexe'){        m.atkBonusBlocked=true; m.atkAllPlus=0; m.atkHighPlus=0; m.atkW8=0; m.atkRerollLowest=false; m.atkRerollAll=false; if(m.atkDice>0) m.atkDice=0; }
  else if(name==='Klingenschwester')  m.atkHighMinus+=1;
  else if(name==='Leibgarde')         m.defHighPlus+=1;
  else if(name==='Ordenshüter')       m.atkDice-=1;
  else if(name==='Festungsvogt')      m.defAsTower=true;
  else if(name==='Wüstenwächter')     m.atkHighMinus+=1;
  else if(name==='Runenkundige' && defP && defP._protectId===toId) m.capDefLoss=Math.min(m.capDefLoss,0);
}
function consumeArmed(p){ if(p){ p.armedAtk=null; p.armedDef=null; } }

/* Kurzer Effekt-Hinweis-String aus den Kampf-Mods. */
function _buildFxNote(m){
  if(!m) return "";
  const fx = [];
  if(m.atkDice)      fx.push((m.atkDice>0?"+":"")+m.atkDice+" Angr.-Würfel");
  if(m.atkAllPlus)   fx.push("Angr. alle +"+m.atkAllPlus);
  if(m.atkHighPlus)  fx.push("Angr. höchster +"+m.atkHighPlus);
  if(m.atkW8)        fx.push(m.atkW8+"× W8 Angriff");
  if(m.tieToAttacker)fx.push("Gleichstand→Angreifer");
  if(m.ignoreTower)  fx.push("Turm ignoriert");
  if(m.defAllPlus)   fx.push("Vert. alle +"+m.defAllPlus);
  if(m.defHighPlus)  fx.push("Vert. höchster +"+m.defHighPlus);
  if(m.defDice)      fx.push("+"+m.defDice+" Vert.-Würfel");
  if(m.defAsTower)   fx.push("Vert. als Turm");
  if(m.atkMax<3)     fx.push("Angr. max "+m.atkMax);
  if(m.defMax<3)     fx.push("Vert. max "+m.defMax);
  if(m.capDefLoss<99)fx.push("Vert. Verlust ≤"+m.capDefLoss);
  return fx.join(" · ");
}
function updateBattleFxNote(){
  if(!battleCtx) return;
  battleCtx.fxNote = _buildFxNote(battleCtx.mods);
  const el = $("battleResultText");
  if(el) el.innerHTML = battleCtx.fxNote
    ? ("✨ <span style='color:var(--gold,#f6d98b);font-size:12px'>" + battleCtx.fxNote + "</span>")
    : "Würfel bereit…";
}

/* Verteidigungs-Optionen anzeigen (nur wenn der Mensch verteidigt):
   aktive Verteidigungs-Charaktere + spielbare Verteidigungs-Ratskarten. */
const _DEF_CHARS = ['Sturmmaid','Adlerwächter','Nebelhexe','Klingenschwester','Leibgarde','Ordenshüter','Festungsvogt','Wüstenwächter'];
function _armDefChar(name){
  if(wbRelayDefense('armDefChar', [name])) return;
  if(!battleCtx) return;
  const dP = battleCtx.defP; if(!dP) return;
  battleCtx.armedDefChars = battleCtx.armedDefChars || new Set();
  if(battleCtx.armedDefChars.has(name)) return;
  battleCtx.armedDefChars.add(name);
  dP._defCharUsed = dP._defCharUsed || {};
  dP._defCharUsed[name] = G.round;            // für diese Runde verbraucht
  _applyDefCharMod(battleCtx.mods, name, dP, battleCtx.toId);
  updateBattleFxNote();
  if(sync.role === 'host') wbBroadcastBattleState();
}
function wbDoHireDefChar(name, cost){
  const dP = battleCtx && battleCtx.defP; if(!dP) return;
  if(dP.gold < cost){ toast(wbUI('NichtGenugGold')); return; }
  const tmpl = (CHARACTER_CARDS[dP.faction]||[]).find(c => c.name === name); if(!tmpl) return;
  dP.gold -= cost; dP.characters.push({...tmpl});
  log('👥 ' + dP.name + ' wirbt <b>' + wbCharName(name) + '</b> an (−' + cost + ' 💰)');
  _armDefChar(name);   // safe to call directly here: we're already on the host
  toast('👤 ' + wbCharName(name) + ' angeworben & eingesetzt');
  if(typeof updateHUD === 'function') updateHUD();
  renderDefenseOptions();
}
function renderDefenseOptions(){
  const el = $("defensePanel"); if(!el) return;
  const defP = battleCtx && battleCtx.defP;
  if(!defP || defP.type !== 'human'){ el.style.display='none'; el.innerHTML=''; return; }
  battleCtx.armedDefChars = battleCtx.armedDefChars || new Set();
  // Nicht-steuernde Clients (Angreifer, Zuschauer, unbeteiligte Gäste) dürfen die
  // Auswahl-BUTTONS nicht sehen — nur eine schreibgeschützte Anzeige dessen, was
  // der Verteidiger bereits eingesetzt hat. So sieht jeder die Auswahl im Kampf,
  // aber nur der Verteidiger kann sie treffen.
  if(!wbControlsSeat(defP)){
    const armed = [...battleCtx.armedDefChars];
    if(!armed.length){ el.style.display='none'; el.innerHTML=''; return; }
    el.innerHTML = '<div class="def-opts-label">' + wbUI('DefHeader') + '</div><div class="def-opts-row">' +
      armed.map(n => '<div class="def-chip char active">👤 ' + wbCharName(n) + ' ✓ ' + wbUI('DefActive') + '</div>').join('') +
      '</div>';
    el.style.display = '';
    return;
  }
  // Verteidigungs-Charaktere des EIGENEN Hauses — besessen (einsetzen) oder anwerbbar
  const houseDef = (CHARACTER_CARDS[defP.faction]||[]).filter(c => _DEF_CHARS.includes(c.name));
  const defCards = (defP.hand||[]).map((c,i)=>({c,i})).filter(o => o.c.source==='council' && o.c.revealed && o.c.type==='defense');
  let html = '<div class="def-opts-label">' + wbUI('DefHeader') + '</div><div class="def-opts-row">';
  houseDef.forEach(c => {
    const owned = (defP.characters||[]).some(x => x.name === c.name);
    const used  = defP._defCharUsed && defP._defCharUsed[c.name] === G.round;
    const armed = battleCtx.armedDefChars.has(c.name);
    if(armed)
      html += '<div class="def-chip char active" title="'+wbCardEffect(c)+'">👤 '+wbCharName(c.name)+' ✓ '+wbUI('DefActive')+'</div>';
    else if(used)
      html += '<button class="def-chip char" disabled title="Diese Runde bereits verbraucht">👤 '+wbCharName(c.name)+' ('+wbUI('DefUsed')+')</button>';
    else if(owned)
      html += '<button class="def-chip char-arm" data-name="'+c.name+'" title="'+wbCardEffect(c)+'">👤 '+wbCharName(c.name)+' — '+wbUI('DefDeploy')+'</button>';
    else if(defP.gold >= c.cost)
      html += '<button class="def-chip char-hire" data-name="'+c.name+'" data-cost="'+c.cost+'" title="'+wbCardEffect(c)+'">👤 '+wbCharName(c.name)+' — '+wbUI('DefRecruit')+' ('+c.cost+' 💰)</button>';
    else
      html += '<button class="def-chip char" disabled title="'+wbUI('ZuWenigGold')+'">👤 '+wbCharName(c.name)+' — '+c.cost+' 💰</button>';
  });
  defCards.forEach(o => { html += '<button class="def-chip card suitable" data-i="'+o.i+'" title="'+wbCardEffect(o.c)+'">🛡 '+wbCardName(o.c)+'</button>'; });
  (defP.hand||[]).forEach((c,i)=>{ if(c.source==='council' && c.revealed && c.type!=='defense'){ html += '<button class="def-chip card" disabled title="'+wbCardEffect(c)+'">📜 '+wbCardName(c)+'</button>'; } });
  html += '</div>';
  if(!houseDef.length && !defCards.length) html += '<div class="def-opts-none">' + wbUI('DefNone') + '</div>';
  el.innerHTML = html;
  el.style.display = '';
  el.querySelectorAll('.def-chip.card.suitable').forEach(btn => {
    btn.onclick = () => {
      const i = +btn.dataset.i;
      const card = battleCtx && battleCtx.defP && battleCtx.defP.hand[i];
      if(!card) return;
      showCardLarge(card, { label: '🛡 Einsetzen', onConfirm: () => playDefenseCardInBattle(i) });
    };
  });
  el.querySelectorAll('.def-chip.char-arm').forEach(btn => {
    btn.onclick = () => { _armDefChar(btn.dataset.name); toast('👤 ' + wbCharName(btn.dataset.name) + ' eingesetzt'); renderDefenseOptions(); };
  });
  el.querySelectorAll('.def-chip.char-hire').forEach(btn => {
    btn.onclick = () => {
      const name = btn.dataset.name, cost = +btn.dataset.cost;
      if(wbRelayDefense('hireDefChar', [name, cost])) return;
      wbDoHireDefChar(name, cost);
    };
  });
}
function playDefenseCardInBattle(i){
  if(wbRelayDefense('playDefenseCard', [i])) return;
  if(!battleCtx) return;
  const defP = battleCtx.defP; if(!defP) return;
  const card = defP.hand[i];
  if(!card || card.source!=='council' || !card.revealed || card.type!=='defense') return;
  defP.hand.splice(i,1); G.discard.push(card);
  const msg = applyCouncilEffect(defP, card);   // ruft armDef(...)
  if(defP.armedDef){
    const fromR = G.regions[battleCtx.fromId], toR = G.regions[battleCtx.toId];
    // einmalige Vorkampf-Effekte der NEUEN Karte sofort anwenden
    const preA = defP.armedDef.preAtkLoss||0, preD = defP.armedDef.preDefLoss||0;
    if(preA>0){ fromR.troops = Math.max(1, fromR.troops - preA); battleCtx._preAtkApplied=(battleCtx._preAtkApplied||0)+preA; }
    if(preD>0){ toR.troops   = Math.max(1, toR.troops   - preD); battleCtx._preDefApplied=(battleCtx._preDefApplied||0)+preD; }
    _applyMods(battleCtx.mods, defP.armedDef);   // in bestehende Mods einrechnen
    consumeArmed(defP);
    battleCtx.protectAvailable = (battleCtx.mods.capDefLoss===0 && defP._protectId===battleCtx.toId);
  }
  if(msg) toast("🛡 " + wbCardName(card) + ": " + msg);
  updateBattleFxNote();
  renderDefenseOptions();
  refreshMapVisuals(); updateHUD();
  if(sync.role === 'host') wbBroadcastBattleState();
}

/* — Charaktereffekte zu Rundenbeginn (Einkommen/Verstärkung/Vorbereitung) — */
function applyStartOfTurnCharacters(p){
  p._henkerUsed = 0;
  p._protectId  = null;
  if(!p.characters || !p.characters.length) return;
  let gold=0, troops=0;
  p.characters.forEach(c => {
    switch(c.name){
      case 'Quartiermeister': troops+=1; break;
      case 'Eiserne Königin': if(_ownsFullContinent(p.id)) troops+=2; break;
      // Kartenunabhängig: skaliert mit der Gesamtzahl kontrollierter Gebiete
      // (früher an Vorthan-Kontinent gebunden — auf reinen Seekarten unbrauchbar).
      case 'Sonnenkalif': { const d=_myLogical(p.id).length; troops+=Math.min(3,Math.floor(d/6)); } break;
      case 'Falkenkönig':  troops+=2; break;
      case 'Erzhammer':    troops+=2; break;
      case 'Schmiedekönig':{ const s=_strongestOwnId(p.id); if(s) G.regions[s].siege=true; } break;
      case 'Runenkundige': { const s=_strongestOwnId(p.id); if(s) p._protectId=s; } break;
      default: break;  // Kampf-/Bewegungs-Charaktere wirken anderswo
    }
  });
  if(gold)   p.gold += gold;
  if(troops) p.troopsAvailable += troops;
  if(gold||troops){ const parts=[]; if(gold)parts.push('+'+gold+' 💰'); if(troops)parts.push('+'+troops+' Truppen'); _eff(p, 'Charaktere', parts.join(', ')); }

  // — Späh-/Bewegungs-/Späher-Charaktere —
  // Sumpfgänger: obersten 2 Kartensymbole des Stapels offenlegen
  if(_ownsChar(p,'Sumpfgänger') && G.deck.length){
    const peek = G.deck.slice(-2).reverse().map(c => _symLabel(c.symbol));
    _eff(p, 'Sumpfgänger', 'oberste Karten: ' + peek.join(', '));
  }
  // Schleier-Adept: oberste 2 ansehen, die stärkere behalten, die andere ablegen
  if(_ownsChar(p,'Schleier-Adept') && _territoryCardCount(p)<TERRITORY_CARD_LIMIT && G.deck.length){
    const a = G.deck.pop();
    const b = G.deck.length ? G.deck.pop() : null;
    let keep = a, drop = b;
    if(b && _symRank(b.symbol) > _symRank(a.symbol)){ keep = b; drop = a; }
    p.hand.push(keep);
    if(drop) G.discard.push(drop);
    if(p.type==='human') animateCardDraw(keep);
    _eff(p, 'Schleier-Adept', _symLabel(keep.symbol) + '-Karte behalten');
  }
  // Bewegungs-Charaktere: Bewegung ist bereits mehrstufig über eigene Gebiete möglich
  if(_ownsChar(p,'Waldherzog') || _ownsChar(p,'Sandreiterin')){
    _eff(p, 'Bewegung', 'zusätzliche/erweiterte Truppenbewegung verfügbar');
  }
  // Pfadfinder: Rückzug nach dem ersten Wurf ist im Kampf jederzeit möglich
  if(_ownsChar(p,'Pfadfinder')){
    _eff(p, 'Pfadfinder', 'Angriff jederzeit abbrechbar (Zurückziehen)');
  }
}

/* — Ratskarten-Dispatcher (echte Effekte je Kartennamen) — */
function applyCouncilEffect(p, card){
  const n = card.name;
  // ===== VERSORGUNG =====
  if(n==="Siegel der Ernte"){ const s=_strongestOwnId(p.id); if(s){ G.regions[s].troops+=2; refreshMapVisuals(); } return "+2 Einheiten in deinem stärksten Gebiet"; }
  if(n==="Siegel der Fülle"){ let d=0; while(d<2 && _territoryCardCount(p)<TERRITORY_CARD_LIMIT && (G.deck.length||G.discard.length)){ if(!G.deck.length){G.deck=shuffle([...G.discard]);G.discard=[];} const c=G.deck.pop(); p.hand.push(c); if(p.type==='human'){ const di=d; setTimeout(()=>animateCardDraw(c), di*320); } d++; } return d+" Karte(n) gezogen"; }
  if(n==="Siegel des Handels"){ let d=0; while(d<2 && _territoryCardCount(p)<TERRITORY_CARD_LIMIT && G.discard.length){ const c=G.discard.pop(); p.hand.push(c); if(p.type==='human'){ const di=d; setTimeout(()=>animateCardDraw(c), di*320); } d++; } return d+" Karte(n) aus dem Ablagestapel"; }
  if(n==="Siegel des Wachstums"){ const c=CONTINENTS.filter(ct=>{const rs=REGIONS.filter(r=>r.continent===ct.key);return rs.length&&rs.every(r=>G.regions[r.id].ownerId===p.id);}).length; p.troopsAvailable+=c; return "+"+c+" Truppen (vollständige Regionen)"; }
  if(n==="Kriegskasse"){ const g=Math.min(4, 1+(p._conqueredCount||0)); const s=_strongestOwnId(p.id); if(s){ G.regions[s].troops+=g; refreshMapVisuals(); } return "+"+g+" Einheiten (Eroberungen)"; }
  if(n==="Siegel der Heerschau"){ const s=_strongestOwnId(p.id); if(s){ G.regions[s].troops+=3; refreshMapVisuals(); } return "+3 Einheiten in deinem stärksten Gebiet"; }
  if(n==="Siegel des Schmugglerkönigs"){ requestTarget("Feindliches Gebiet (−2 Einheiten) wählen", id=>G.regions[id]&&G.regions[id].ownerId!==p.id&&G.regions[id].ownerId!==null, id=>{ const st=G.regions[id]; st.troops=Math.max(1, st.troops-2); refreshMapVisuals(); _eff(p,n,"−2 Einheiten in "+REGIONS.find(r=>r.id===id).name); }); return "Ziel wählen…"; }
  if(n==="Siegel der Schmiede"){ requestTarget("Eigenes Gebiet für +2 Einheiten wählen", id=>G.regions[id]&&G.regions[id].ownerId===p.id, id=>{ G.regions[id].troops+=2; refreshMapVisuals(); _eff(p,n,"+2 Einheiten in "+REGIONS.find(r=>r.id===id).name); }); return "Ziel wählen…"; }
  if(n==="Siegel des Aufbaus"){ requestTarget("Eigenes Gebiet für Turm wählen", id=>G.regions[id]&&G.regions[id].ownerId===p.id, id=>{ G.regions[id].tower=true; refreshMapVisuals(); _eff(p,n,"🏰 Turm in "+REGIONS.find(r=>r.id===id).name); }); return "Ziel wählen…"; }
  // ===== EREIGNIS =====
  if(n==="Siegel der Pest"){ let cnt=0; Object.values(G.regions).forEach(r=>{ if(r.troops>=4){ r.troops-=1; cnt++; } }); refreshMapVisuals(); return cnt+" Gebiete −1 Einheit"; }
  if(n==="Siegel der Dürre"){ G.droughtRound=G.round; return "Regionen-Bonus diese Runde aus"; }
  if(n==="Siegel des Sturms II"){ G.stormRound=G.round; return "alle Angriffe −1 Würfel diese Runde"; }
  if(n==="Siegel der Wiedergeburt"){ if(G.discard.length && _territoryCardCount(p)<TERRITORY_CARD_LIMIT){ const c=G.discard.splice(Math.floor(Math.random()*G.discard.length),1)[0]; p.hand.push(c); if(p.type==='human') animateCardDraw(c); return "Karte „"+c.name+"“ zurückgeholt"; } return "Ablagestapel leer"; }
  if(n==="Siegel des Erdbebens"){ requestTarget("Gebiet wählen (Marker zerstören)", id=>!!G.regions[id], id=>{ const r=G.regions[id]; r.tower=r.knight=r.siege=false; refreshMapVisuals(); _eff(p,n,"Marker in "+REGIONS.find(x=>x.id===id).name+" zerstört"); }); return "Ziel wählen…"; }
  if(n==="Siegel des Verrats" || n==="Siegel des Verräters" || n==="Siegel des Jägers"){ requestTarget("Feindliches Gebiet mit 1 Einheit wählen", id=>G.regions[id]&&G.regions[id].ownerId!==p.id&&G.regions[id].ownerId!==null&&G.regions[id].troops<=1, id=>{ const lt=LOGICAL_TERRITORIES.find(l=>l.pieceIds.includes(id)); const st=G.regions[id]; st.ownerId=p.id; st.troops=1; if(lt) lt.pieceIds.forEach(pid=>{G.regions[pid]=st;}); refreshMapVisuals(); _eff(p,n,REGIONS.find(r=>r.id===id).name+" annektiert"); }); return "Ziel wählen…"; }
  if(n==="Siegel der Allianz"){ const opp=G.players.filter(o=>o.id!==p.id&&!o.eliminated); if(opp.length){ const t=opp[0]; G.allianceRound=G.round; G.allianceA=p.id; G.allianceB=t.id; return "Bündnis mit "+t.name+" (1 Runde)"; } return "kein Partner"; }
  if(n==="Blutpakt"){ requestTarget("Feindliches Gebiet (−3 Einheiten) wählen", id=>G.regions[id]&&G.regions[id].ownerId!==p.id&&G.regions[id].ownerId!==null, id=>{ const st=G.regions[id]; st.troops=Math.max(1,st.troops-3); const s=_strongestOwnId(p.id); if(s) G.regions[s].troops=Math.max(1,G.regions[s].troops-2); refreshMapVisuals(); _eff(p,n,"−3 auf Ziel, −2 eigene"); }); return "Ziel wählen…"; }
  if(n==="Siegel des Botschafters"){ const opp=G.players.filter(o=>o.id!==p.id&&!o.eliminated&&o.hand.length); if(!opp.length||!p.hand.length) return "kein Tauschpartner"; const t=opp[Math.floor(Math.random()*opp.length)]; const myI=Math.floor(Math.random()*p.hand.length), theirI=Math.floor(Math.random()*t.hand.length); const tmp=p.hand[myI]; p.hand[myI]=t.hand[theirI]; t.hand[theirI]=tmp; return "Karte mit "+t.name+" getauscht"; }
  if(n==="Siegel der Prophezeiung"){ if(!G.deck.length) return "Stapel leer"; const top=G.deck.slice(-3).reverse().map(c=>wbCardName(c)); return "Oben: "+top.join(", "); }
  if(n==="Siegel des Kometen"){ const counts=G.players.filter(o=>!o.eliminated).map(o=>({o,n:_myLogical(o.id).length})); if(!counts.length) return "kein Ziel"; counts.sort((a,b)=>b.n-a.n); const target=counts[0].o; requestTarget("Gebiet von "+target.name+" wählen (−2 Einheiten)", id=>G.regions[id]&&G.regions[id].ownerId===target.id, id=>{ const st=G.regions[id]; st.troops=Math.max(1,st.troops-2); refreshMapVisuals(); _eff(p,n,"−2 Einheiten in "+REGIONS.find(r=>r.id===id).name); }); return target.name+" (meiste Gebiete) — Ziel wählen…"; }
  if(n==="Siegel des Ausgleichs"){ const counts=G.players.filter(o=>!o.eliminated).map(o=>({o,n:_myLogical(o.id).length})); if(!counts.length) return "kein Ziel"; counts.sort((a,b)=>a.n-b.n); const target=counts[0].o; const s=_strongestOwnId(target.id); if(s){ G.regions[s].troops+=3; refreshMapVisuals(); } return target.name+" (wenigste Gebiete) erhält +3 Einheiten"; }
  if(n==="Schwarzer Regen"){ let cnt=0; G.players.forEach(o=>{ if(!o.eliminated && o.hand.length){ const idx=Math.floor(Math.random()*o.hand.length); const c=o.hand.splice(idx,1)[0]; G.discard.push(c); cnt++; } }); return cnt+" Spieler discarden je 1 Karte"; }
  if(n==="Siegel der Erschöpfung"){ const opp=G.players.filter(o=>o.id!==p.id&&!o.eliminated); if(!opp.length) return "kein Ziel"; const t=opp[Math.floor(Math.random()*opp.length)]; const s=_strongestOwnId(t.id); if(s){ G.regions[s].troops=Math.max(1,G.regions[s].troops-2); refreshMapVisuals(); } return t.name+" ist erschöpft: −2 Einheiten"; }
  if(n==="Siegel der Wanderung"){ const s=_strongestOwnId(p.id); if(!s||G.regions[s].troops<=1) return "keine Einheiten zum Verlegen"; const moveN=Math.min(3, G.regions[s].troops-1); requestTarget("Eigenes Zielgebiet wählen (+"+moveN+" Einheiten)", id=>G.regions[id]&&G.regions[id].ownerId===p.id&&id!==s, id=>{ G.regions[s].troops-=moveN; G.regions[id].troops+=moveN; refreshMapVisuals(); _eff(p,n,moveN+" Einheiten verlegt"); }); return "Zielgebiet wählen…"; }
  // ===== SCHATTEN-RATSKARTEN =====
  if(n==="Siegel des Schattens"){ armDef(p,{atkMax:2}); return "Verteidigung: Angreifer max. 2 Würfel (Schatten-Hinterhalt)"; }
  if(n==="Siegel des Doppelgängers"){ const last=G.lastPlayedCard; if(!last || last.by===p.id) return "keine fremde Karte zum Kopieren"; return "Kopiert ("+wbCardName(last.card)+"): "+applyCouncilEffect(p, {...last.card}); }
  if(n==="Siegel der Nacht"){ armAtk(p,{atkRerollLowest:true}); return "Im Schutz der Nacht: niedrigster Würfel wird neu gewürfelt"; }
  if(n==="Siegel des Diebstahls"){ const opp=G.players.filter(o=>o.id!==p.id&&!o.eliminated&&o.hand.length); if(!opp.length) return "kein Ziel"; const t=opp[Math.floor(Math.random()*opp.length)]; const idx=Math.floor(Math.random()*t.hand.length); const c=t.hand.splice(idx,1)[0]; p.hand.push(c); if(p.type==='human') animateCardDraw(c, !c.revealed); return "Karte von "+t.name+" gestohlen"; }
  if(n==="Siegel des Nebelläufers"){ const s=_strongestOwnId(p.id); if(!s||G.regions[s].troops<=1) return "keine Einheiten verfügbar"; requestTarget("Zielgebiet wählen (1 Einheit verlegen, auch nicht angrenzend)", id=>G.regions[id]&&G.regions[id].ownerId===p.id&&id!==s, id=>{ G.regions[s].troops-=1; G.regions[id].troops+=1; refreshMapVisuals(); _eff(p,n,"1 Einheit nach "+REGIONS.find(r=>r.id===id).name+" verlegt"); }); return "Zielgebiet wählen…"; }
  if(n==="Siegel des Assassinen"){ requestTarget("Feindliches Gebiet wählen (−1 Einheit, ohne Kampf)", id=>G.regions[id]&&G.regions[id].ownerId!==p.id&&G.regions[id].ownerId!==null&&G.regions[id].troops>1, id=>{ G.regions[id].troops-=1; refreshMapVisuals(); _eff(p,n,"−1 Einheit in "+REGIONS.find(r=>r.id===id).name); }); return "Ziel wählen…"; }
  if(n==="Siegel des Lauschers"){ const opp=G.players.filter(o=>o.id!==p.id&&!o.eliminated); if(!opp.length) return "kein Ziel"; const t=opp[Math.floor(Math.random()*opp.length)]; const names=t.hand.map(c=>c.source==='council'?(c.revealed?wbCardName(c):'verdeckt'):wbCardName(c)); return t.name+"s Hand: "+(names.join(', ')||'leer'); }
  if(n==="Siegel der falschen Fahne"){ requestTarget("Feindliches Gebiet wählen (greift diese Runde nicht an)", id=>G.regions[id]&&G.regions[id].ownerId!==p.id&&G.regions[id].ownerId!==null, id=>{ const st=G.regions[id]; st.troops=Math.max(1, Math.floor(st.troops*0.7)); refreshMapVisuals(); _eff(p,n,REGIONS.find(r=>r.id===id).name+" geschwächt"); }); return "Ziel wählen…"; }
  if(n==="Siegel des Spions"){ if(!G.deck.length) return "Stapel leer"; if(_territoryCardCount(p)>=TERRITORY_CARD_LIMIT) return "Handlimit erreicht"; const c=G.deck.pop(); p.hand.push(c); if(p.type==='human') animateCardDraw(c); return "Karte „"+wbCardName(c)+"“ gezogen"; }
  if(n==="Siegel des Chaos"){ const active=G.players.filter(o=>!o.eliminated); if(active.length<2) return "zu wenige Spieler"; const a=active[Math.floor(Math.random()*active.length)]; let b=active[Math.floor(Math.random()*active.length)]; if(b.id===a.id) b=active[(active.indexOf(a)+1)%active.length]; const tmp=a.hand; a.hand=b.hand; b.hand=tmp; return a.name+" und "+b.name+" tauschen komplette Hände"; }
  if(n==="Siegel des Verhängnisses"){ requestTarget("Gebiet wählen (Besitzer verliert 2 Einheiten)", id=>!!G.regions[id]&&G.regions[id].troops>1, id=>{ const st=G.regions[id]; st.troops=Math.max(1, st.troops-2); refreshMapVisuals(); _eff(p,n,REGIONS.find(r=>r.id===id).name+" verliert 2 Einheiten"); }); return "Ziel wählen…"; }
  // ===== ANGRIFFS-RATSKARTEN (Kampf-Mods für nächsten Angriff) =====
  if(n==="Siegel des Sturms"){       armAtk(p,{atkRerollLowest:true});  return "Angriff: niedrigster Würfel wird neu gewürfelt"; }
  if(n==="Kriegsrat"){               armAtk(p,{atkRerollAll:true});     return "Angriff: alle Würfel neu"; }
  if(n==="Siegel des Kommandeurs"){  armAtk(p,{atkHighPlus:1});         return "Angriff: höchster Würfel +1"; }
  if(n==="Siegel des Blutmonds"){    armAtk(p,{tieToAttacker:true});    return "Angriff gewinnt bei Gleichstand"; }
  if(n==="Sturmangriff"){            armAtk(p,{atkDice:1});             return "Angriff: +1 Würfel"; }
  if(n==="Siegel des Feuers"){       armAtk(p,{ignoreTower:true});      return "Angriff ignoriert Turm"; }
  if(n==="Siegel der Klinge"){       armAtk(p,{winDefExtra:1});         return "Sieg: Verteidiger −1 extra"; }
  if(n==="Siegel der Vergeltung" || n==="Siegel des Durchbruchs"){ armAtk(p,{atkHighPlus:1}); return "Angriff: höchster Würfel +1"; }
  if(n==="Siegel des Eisens"){ requestTarget("Eigenes Angriffsgebiet (+2 Einheiten)", id=>G.regions[id]&&G.regions[id].ownerId===p.id, id=>{ G.regions[id].troops+=2; refreshMapVisuals(); _eff(p,n,"+2 Einheiten in "+REGIONS.find(r=>r.id===id).name); }); return "Ziel wählen…"; }
  if(n==="Kriegstrommel"){ G.warDrumRound=G.round; G.warDrumOwner=p.id; return "diese Runde: Verteidiger −1 extra bei Niederlage"; }
  if(n==="Schwarze Fahne"){ G.blackFlagRound=G.round; return "diese Runde: keine Verteidigungs-Charaktere gegen dich"; }
  if(n==="Siegel der Kaperfahrt"){ G.raidRound=G.round; G.raidPlayerId=p.id; return "diese Runde: Angriff von einem Hafen auf jedes Küstengebiet möglich"; }
  // ===== VERTEIDIGUNGS-RATSKARTEN (Kampf-Mods für nächste Verteidigung) =====
  if(n==="Siegel des Schildes"){     armDef(p,{defAllPlus:1});   return "Verteidigung: alle Würfel +1"; }
  if(n==="Siegel der Mauer"){        armDef(p,{atkMax:2});       return "Verteidigung: Angreifer max. 2 Würfel"; }
  if(n==="Siegel des Wächters"){     armDef(p,{defDice:1});      return "Verteidigung: +1 Würfel"; }
  if(n==="Siegel des letzten Manns"){armDef(p,{defDice:1});      return "Verteidigung: +1 Würfel"; }
  if(n==="Eiserner Wille"){          armDef(p,{capDefLoss:1});   return "Verteidigung: höchstens −1 Einheit"; }
  if(n==="Siegel des Rückzugs"){     armDef(p,{capDefLoss:0});   return "Verteidigung: keine Verluste"; }
  if(n==="Siegel des Burggrabens"){  armDef(p,{preAtkLoss:1});   return "Verteidigung: Angreifer −1 vor Kampf"; }
  if(n==="Siegel der Festung"){      armDef(p,{defAsTower:true});return "Verteidigung: zählt als Turm (W8)"; }
  if(n==="Siegel des Spiegels"){     armDef(p,{swap:true});      return "Verteidigung: Würfel werden getauscht"; }
  if(n==="Siegel der Stille"){       armDef(p,{atkBonusBlocked:true}); return "Verteidigung: Angreifer ohne Boni"; }
  if(n==="Siegel des Hinterhalts"){ requestTarget("Eigenes Grenzgebiet (+2 Einheiten)", id=>G.regions[id]&&G.regions[id].ownerId===p.id, id=>{ G.regions[id].troops+=2; refreshMapVisuals(); _eff(p,n,"+2 Einheiten in "+REGIONS.find(r=>r.id===id).name); }); return "Ziel wählen…"; }
  if(n==="Treueschwur"){ requestTarget("Eigenes Gebiet (Nachbarn schicken je 1)", id=>G.regions[id]&&G.regions[id].ownerId===p.id, id=>{ const r=REGIONS.find(x=>x.id===id); let s=0; r.neighbors.forEach(nid=>{ const nb=G.regions[nid]; if(nb&&nb.ownerId===p.id&&nb.troops>1){ nb.troops-=1; G.regions[id].troops+=1; s++; } }); refreshMapVisuals(); _eff(p,n,"+"+s+" Einheiten aus Nachbargebieten"); }); return "Ziel wählen…"; }
  if(n==="Siegel des Donners"){ G.thunderOwner=p.id; G.thunderRound=G.round; return "bei erfolgreicher Verteidigung: Angreifer zieht keine Karte"; }
  // Fallback
  if(card.type==="supply" || card.type==="event"){ const s=_strongestOwnId(p.id); if(s){ G.regions[s].troops+=2; refreshMapVisuals(); } return "+2 Einheiten"; }
  return card.effect;
}


/* -- Ratskarte ausspielen (Effekt über die Engine) -------------- */
function playCouncilCard(i) {
  if(wbRelay('playCouncilCard', [i])) return;
  const p = currentPlayer();
  const card = p.hand[i];
  if(!card || card.source !== "council" || !card.revealed) return;
  // Karte verbrauchen, dann Effekt ausführen (kann Zielauswahl starten)
  p.hand.splice(i, 1);
  G.discard.push(card);
  const msg = applyCouncilEffect(p, card);
  G.lastPlayedCard = {card, by: p.id};   // für Siegel des Doppelgängers
  if(msg){
    log("\uD83D\uDCDC <b>" + p.name + "</b> spielt <b>" + wbCardName(card) + "</b> \u2014 " + msg);
    toast("\uD83D\uDCDC " + wbCardName(card) + ": " + msg);
  }
  updateHUD();
}

$("endPhaseBtn").onclick = () => {
  const p = currentPlayer();
  if(!p || p.type !== "human") return;
  if(sync.role === 'guest'){
    if(!G || sync.myPlayerId == null || G.currentPlayerIdx !== sync.myPlayerId) return;
    // Mirror the host-side guard checks that would otherwise just open a
    // modal on the *host's* screen instead of this guest's — these only
    // read synced G state, so it's safe to duplicate them here.
    if(G.phase === "reinforce"){
      if(p.troopsAvailable > 0){
        toast(`⚠ Noch ${p.troopsAvailable} Truppen übrig — alle Truppen müssen platziert werden!`);
        return;
      }
      if(G.round > 1 && _territoryCardCount(p) >= TERRITORY_CARD_LIMIT){
        toast("⚠ 5 Gebietskarten — du musst Karten einlösen bevor du angreifen kannst!");
        openExchangeModal();
        return;
      }
    }
    wbSendAction('endPhase', []);
    return;
  }
  if(wbHostBlocksLocal(p)) return;   // Host beendet nicht den Zug eines fremden Gasts
  wbDoEndPhase();
};
function wbDoEndPhase(){
  const p = currentPlayer();
  if(!p || p.type !== "human") return;
  if(G.pendingTarget){ G.pendingTarget = null; }   // offene Zielauswahl beenden
  console.log("[endPhase] phase=", G.phase, "round=", G.round, "player=", p.name, "troops=", p.troopsAvailable);
  if(G.phase === "reinforce"){
    if(p.troopsAvailable > 0){
      toast(`⚠ Noch ${p.troopsAvailable} Truppen übrig — alle Truppen müssen platziert werden!`);
      return;
    }
    // Runde 1 = reine Aufstellungsphase: kein Angriff UND keine Bewegung
    if(G.round === 1){
      toast("Aufstellungsphase (Runde 1) — Zug wird beendet");
      G.selected = null;
      nextTurn();
      return;
    }
    // 5 Gebietskarten → Einlösen erzwingen
    if(_territoryCardCount(p) >= TERRITORY_CARD_LIMIT){
      toast("⚠ 5 Gebietskarten — du musst Karten einlösen bevor du angreifen kannst!");
      openExchangeModal();
      return;
    }
    else {
      G.phase = "attack";
      toast("Angriffsphase — wähle dein Gebiet");
    }
    G.selected = null;
    updateHUD();
    autosave();   // sonst geht beim Reload mitten in der Angriffsphase die platzierte Verstärkung verloren
  }
  else if(G.phase === "attack"){
    G.phase = "move";
    toast("Bewegungsphase — verschiebe Truppen oder beende");
    G.selected = null;
    updateHUD();
    autosave();   // sonst gehen eroberte Gebiete beim Reload mitten in der Bewegungsphase verloren
  }
  else if(G.phase === "move"){
    nextTurn();
  } else {
    // Fallback: Phase zurücksetzen falls unbekannter Zustand
    console.warn("[endPhase] Unbekannte Phase:", G.phase, "— setze auf reinforce");
    G.phase = "reinforce";
    updateHUD();
  }
}

let _nextTurnBusy = false;
async function nextTurn(){
  // The card fly-in delay below leaves G.phase/currentPlayer unchanged for ~1.9s;
  // without this guard a second click on End Phase in that window could trigger
  // nextTurn() twice and skip a player's turn.
  if(_nextTurnBusy) return;
  _nextTurnBusy = true;
  const _epb = $("endPhaseBtn"); if(_epb) _epb.disabled = true;
  G.selected = null;
  // Karte ziehen für den Spieler der gerade dran war (falls Gebiet erobert, max 5)
  const prevPlayer = G.players[G.currentPlayerIdx];
  let cardFlyInPending = false;
  if(prevPlayer && prevPlayer.conqueredThisRound && !prevPlayer._noCardThisTurn && _territoryCardCount(prevPlayer) < TERRITORY_CARD_LIMIT){
    if(G.deck.length === 0 && G.discard.length > 0){
      G.deck = shuffle([...G.discard]); G.discard = [];
    }
    if(G.deck.length > 0){
      const drawn = G.deck.pop();
      prevPlayer.hand.push(drawn);
      log(`📜 <b>${prevPlayer.name}</b> zieht eine Gebietskarte (${prevPlayer.hand.length}/5).`);
      if(prevPlayer.type === 'human'){ animateCardDraw(drawn); cardFlyInPending = true; }
    }
  } else if(prevPlayer && prevPlayer.conqueredThisRound && prevPlayer._noCardThisTurn){
    log(`⚡ <b>${prevPlayer.name}</b> zieht keine Karte (Siegel des Donners).`);
  }
  if(prevPlayer){ prevPlayer.conqueredThisRound = false; prevPlayer._noCardThisTurn = false; }
  // Die Gebietskarten-Einflug-Animation (animateCardDraw) blendet sich für ~1.85s
  // ein/aus. Ohne Wartezeit überlappt sie mit dem Zugbanner von beginTurn(), das
  // sofort danach erscheint — beide Popups gleichzeitig sind nicht lesbar.
  if(cardFlyInPending) await sleep(1900);

  let safe = 0;
  do {
    G.currentPlayerIdx = (G.currentPlayerIdx + 1) % G.players.length;
    if(G.currentPlayerIdx === 0){
      G.round++;
    }
    safe++;
    if(safe > G.players.length * 2) break;
  } while(
    G.players[G.currentPlayerIdx].eliminated ||
    G.players[G.currentPlayerIdx].type === "neutral"
  );
  // Persisting here (independent of the optional "autosave" toggle, which
  // only controls the legacy non-URL-linked slot) would save *before*
  // beginTurn() applies this turn's troopsAvailable/gold/character effects —
  // see the autosave() call at the end of beginTurn() instead.
  _nextTurnBusy = false;
  beginTurn();
}

/* ===== WIN CHECK ===== */
function checkWin(){
  const alive = G.players.filter(p => !p.eliminated);
  // Ziele-Modus: Auftrag erfüllt UND eigene Hauptstadt gehalten
  if(G.winCondition === "ziele"){
    for(const p of alive){
      if(p.type === "neutral") continue;
      if(_objectiveMet(p) && _holdsCapital(p)){ declareWin(p); return; }
    }
    if(alive.filter(p => p.type !== "neutral").length === 1){ declareWin(alive.find(p=>p.type!=="neutral")); return; }
    return;
  }
  if(G.winCondition === "elim" && alive.length === 1){
    declareWin(alive[0]);
    return;
  }
  if(G.winCondition === "dom"){
    const owners = new Set(REGIONS.map(r => G.regions[r.id].ownerId));
    if(owners.size === 1){
      declareWin(G.players[owners.values().next().value]);
    }
  }
}
function declareWin(p){
  window.BrettSounds?.stopMusic?.();   // silence the loop so the victory fanfare is clear
  log(`👑 <b>${p.name}</b> hat das Reich gewonnen!`);
  window.WBSfx?.victory?.();
  // Build a proper victory modal
  const fac = FACTIONS[p.faction];
  const winModal = document.createElement("div");
  winModal.className = "modal-backdrop show";
  winModal.style.zIndex = "5000";
  winModal.innerHTML = `
    <div class="modal" style="max-width:500px;text-align:center">
      <div style="font-size:80px;margin-bottom:10px">${fac.sigil}</div>
      <h2 style="color:${fac.color};font-size:32px;margin-bottom:8px">${p.name}</h2>
      <div class="sub" style="font-size:16px;margin-bottom:16px">
        ${fac.name} herrscht über Warbound Atlas!
      </div>
      <div style="font-style:italic;color:var(--gold2);margin-bottom:20px">
        „${fac.motto}\u201C
      </div>
      <div style="color:var(--muted);font-size:13px;margin-bottom:18px">
        Sieg nach ${G.round} Runden ·
        ${ownedTerritoryStates(p.id).length} Gebiete erobert
      </div>
      <div class="modal-actions" style="justify-content:center">
        <button class="primary" id="winRestart" style="padding:14px 28px">Neues Spiel</button>
      </div>
    </div>
  `;
  document.body.appendChild(winModal);
  document.getElementById("winRestart").onclick = () => { G = null; currentGameId = null; clearGameUrl(); document.body.removeChild(winModal); goScreen("mainMenu"); };
}

/* ===== BOT AI (simple, deterministic-ish) ===== */
/* Markiert das gerade vom Bot bearbeitete Gebiet mit demselben Auswahl-Glow,
   den auch ein menschlicher Spieler sieht. So lässt sich Schritt für Schritt
   mitverfolgen, was der Bot tut — beim Host wie bei den Gästen, denn G.selected
   wandert im Snapshot mit und refreshMapVisuals() rendert es auf beiden Seiten. */
function _botSpotlight(regionId){
  G.selected = regionId || null;
  if(typeof refreshMapVisuals === 'function') refreshMapVisuals();
}
function _botName(id){
  const r = REGIONS.find(rr => rr.id === id);
  return r ? (_territoryBaseName(r.name) || r.name) : '';
}

async function runBotTurn(){
 try {
  const p = currentPlayer();
  const fac = FACTIONS[p.faction] || {sigil:'•'};
  const isHard   = p.type === "bot-hard";
  const isNormal = p.type === "bot-normal";
  const isEasy   = p.type === "bot-easy";

  G.phase = "bot";
  updateHUD();

  // 1) Reinforce: je Territorium genau einmal befüllen (Stellplatz-Regel)
  await sleep(900);
  while(p.troopsAvailable > 0){
    // noch unbefüllte eigene Territorien (pro logischem Gebiet ein Stück)
    const seen = new Set(), cands = [];
    for(const r of REGIONS){
      const d = G.regions[r.id];
      if(d && d.ownerId === p.id && !d.deployed && !seen.has(d)){
        seen.add(d); cands.push(r);
      }
    }
    if(!cands.length) break;   // alle Stellplätze befüllt → Rest verfällt
    // Grenz-Territorien bevorzugen
    const borders = cands.filter(r => r.neighbors.some(nid =>
      G.regions[nid] && G.regions[nid].ownerId !== p.id));
    const target = borders.length ? borders[Math.floor(Math.random()*borders.length)] : cands[0];
    // Hard: bundles big stacks. Normal: medium. Easy: spreads thin.
    const reinforceChunk = isHard
      ? Math.ceil(p.troopsAvailable/2)
      : isNormal
        ? Math.max(2, Math.ceil(p.troopsAvailable/3))
        : (1 + Math.floor(Math.random()*3));
    const place = Math.min(p.troopsAvailable, reinforceChunk);
    // Zuerst zeigen, WOHIN verstärkt wird (Glow + Hinweis), dann kurz warten,
    // erst danach die Truppen setzen — so ist die Entscheidung nachvollziehbar.
    _botSpotlight(target.id);
    toast(`${fac.sigil} ${p.name} verstärkt ${_botName(target.id)} (+${place})`, 1500);
    await sleep(650);
    G.regions[target.id].troops += place;
    G.regions[target.id].deployed = true;   // Stellplatz befüllt
    p.troopsAvailable -= place;
    log(`${p.name} verstärkt ${_territoryBaseName(target.name) || target.name} um ${place}.`);
    updateHUD();
    await sleep(650);
  }
  p.troopsAvailable = 0;   // ungenutzte Truppen verfallen (alle Stellplätze voll)

  // 2) Attack: opportunistic — in Runde 1 (Aufstellungsphase) kein Angriff
  if(G.round > 1){
  G.phase = "attack";
  updateHUD();
  let attackCount = 0;
  const maxAttacks    = isHard ? 6 : (isNormal ? 4 : 3);
  const minAdvantage  = isHard ? 0 : (isNormal ? 0 : 1);
  while(attackCount < maxAttacks){
    const myReg = REGIONS.filter(r => G.regions[r.id].ownerId === p.id && G.regions[r.id].troops >= 3);
    if(!myReg.length) break;
    // Find best target: weakest enemy neighbor
    let best = null;
    myReg.forEach(r => {
      r.neighbors.forEach(nid => {
        const d = G.regions[nid];
        if(!d || d.ownerId === p.id) return;
        const advantage = G.regions[r.id].troops - d.troops;
        if(advantage >= minAdvantage){
          if(!best || advantage > best.adv){
            best = {from:r.id, to:nid, adv:advantage};
          }
        }
      });
    });
    if(!best) break;
    // Angriff ankündigen: Ausgangsgebiet markieren (zeigt zugleich die
    // erreichbaren Ziele) und benennen, wer wen angreift, dann kurz warten.
    _botSpotlight(best.from);
    toast(`${fac.sigil} ${p.name} greift ${_botName(best.to)} an`, 1600);
    await sleep(950);
    await botAttack(best.from, best.to);
    await sleep(600);
    attackCount++;
  }
  } // end if(G.round > 1)

  // 3) Move: shuffle troops to front — in Runde 1 (Aufstellung) keine Bewegung
  if(G.round > 1){
  G.phase = "move";
  updateHUD();
  await sleep(700);
  // Find largest interior region and move troops to a border
  const myReg = REGIONS.filter(r => G.regions[r.id].ownerId === p.id);
  const interior = myReg.find(r => r.neighbors.every(nid => G.regions[nid] && G.regions[nid].ownerId === p.id) && G.regions[r.id].troops > 1);
  if(interior){
    const borders = myReg.filter(r => r.neighbors.some(nid => G.regions[nid] && G.regions[nid].ownerId !== p.id));
    if(borders.length){
      // Find connected border
      const reachable = reachableOwn(interior.id, p.id);
      const target = borders.find(b => reachable.has(b.id));
      if(target){
        const mv = G.regions[interior.id].troops - 1;
        // Bewegung sichtbar machen: Ausgangsgebiet markieren, Pfeil zum Ziel
        // zeichnen und benennen, dann kurz warten, bevor die Truppen wandern.
        _botSpotlight(interior.id);
        if(typeof window.map3d_drawMoveArrow === 'function') window.map3d_drawMoveArrow(interior.id, target.id, mv);
        toast(`${fac.sigil} ${p.name} verlegt ${mv} → ${_botName(target.id)}`, 1700);
        await sleep(950);
        G.regions[interior.id].troops -= mv;
        G.regions[target.id].troops += mv;
        log(`${p.name} bewegt ${mv} von ${interior.name} → ${target.name}.`);
        updateHUD();
      }
    }
  }
  await sleep(800);
  } // end if(G.round > 1) — Bewegung
 } catch(err){
  console.error("Bot-Zug abgebrochen (Fehler abgefangen):", err);
  forceCloseBattleOverlay();   // ein hängendes Kampf-Overlay darf den nächsten Zug nicht blockieren
 }
  // Auswahl-Glow des Bots wieder entfernen, bevor der nächste Spieler dran ist.
  G.selected = null;
  if(typeof refreshMapVisuals === 'function') refreshMapVisuals();
  nextTurn();
}

async function botAttack(fromId, toId){
  // Bot-Kampf über dasselbe Battle-Overlay wie Spieler-Kämpfe
  window.WBSfx?.attack?.(2.0);
  startBattle(fromId, toId);
  const defIsHuman = battleCtx && battleCtx.defP && battleCtx.defP.type === 'human';
  if(defIsHuman){
    // Mensch verteidigt: Bestätigungsschritt einlegen, damit der Spieler den
    // Kampf sieht und (vorab scharf gemachte) Verteidigung bestätigen kann.
    battleCtx.atkReady = true;             // Bot (Angreifer) ist bereit
    battleCtx.botAutoAfterDefend = true;   // nach Bestätigung automatisch würfeln
    setBattleUILocked(false);              // Verteidiger-Button bedienbar lassen
    $("battleRollBtn").style.display = "none";                 // Angreifer ist der Bot
    $("battleRetreatBtn").style.display = "none";              // Verteidiger zieht sich nicht zurück
    ["autoBtn1","autoBtn2","autoBtn3","autoStopBtn"].forEach(id=>{ const e=$(id); if(e) e.style.display="none"; });
    $("battleDefendBtn").style.display = "";
    $("battleDefendBtn").disabled = false;
    $("battleDefendBtn").classList.remove("ready");
    $("battleDefendBtn").textContent = "🛡 Verteidigung bestätigen";
    $("battlePhase").textContent = "Du wirst angegriffen — bereitmachen";
    if(typeof renderDefenseOptions === 'function') renderDefenseOptions();   // Karten/Charaktere anbieten
    if(sync.role === 'host') wbBroadcastBattleState();
    // Bot-Zug pausieren, bis der Mensch verteidigt hat und der Kampf beendet ist
    await new Promise(res => { _battleEndResolve = res; });
    return;  // Es geht weiter, sobald der Spieler bestätigt (battleDefendBtn).
  }
  setBattleUILocked(true);  // Spieler-Buttons während Bot-Zug sperren
  await sleep(900);         // kurze Pause damit der Spieler den Kampfbildschirm sieht
  await runAutoRoll(3);     // Bot würfelt automatisch mit max 3 Würfeln
  // Ergebnis (Sieg/Niederlage) wird in runAutoRoll → finalizeBattleConquest/NoTroops verarbeitet
}
/* === INIT ===
   Die eingebettete 3D-Rendering-Engine (Valcaryn 3D Map, ~7000 Zeilen) wurde
   nach game.render3d.js ausgelagert — sie lädt direkt nach dieser Datei und
   teilt denselben globalen Scope. Unten folgt nur noch der Bootstrap. */
/* ===== STARTUP: resume via URL or show main menu ===== */
(function(){
  function start(){
    // A map change in the lobby needs a full reload (the active map is chosen at
    // load time). Restore the lobby the player was setting up instead of dropping
    // them back on the main menu.
    try{
      const raw = sessionStorage.getItem('warbound.lobbyReturn');
      if(raw){
        sessionStorage.removeItem('warbound.lobbyReturn');
        const obj = JSON.parse(raw);
        if(obj && Array.isArray(obj.players) && obj.players.length){
          gameMode = obj.mode || 'sp';
          lobbyPlayers = obj.players;
          renderLobby();
          goScreen('lobby');
          /* Regel-Auswahl über den Reload hinweg wiederherstellen. */
          try{
            var _wc = document.getElementById('winCondition');
            var _rm = document.getElementById('ruleMode');
            if(_wc && obj.winCondition) _wc.value = obj.winCondition;
            if(_rm && obj.ruleMode) _rm.value = obj.ruleMode;
          }catch(_){}
          /* Kam der Reload von einem Kartenwechsel beim "Spiel starten"? Dann
             jetzt (mit der neu geladenen Karte) direkt ins Spiel. */
          let autostart = false;
          try{ autostart = sessionStorage.getItem('warbound.autostart') === '1'; }catch(_){}
          if(autostart){
            try{ sessionStorage.removeItem('warbound.autostart'); }catch(_){}
            if(typeof startGame === 'function') setTimeout(startGame, 0);
          }
          return;
        }
      }
    }catch(_){}
    let joinCode = null;
    try{ joinCode = new URL(location.href).searchParams.get('join'); }catch(_){}
    if(joinCode){
      goScreen("joinMenu");
      const jc = document.getElementById("joinCode");
      if(jc) jc.value = joinCode.toUpperCase();
      return;
    }
    const resumeId = getGameIdFromUrl();
    if(resumeId){
      const key = SAVE_PREFIX+'g_'+resumeId;
      try{
        const obj = JSON.parse(localStorage.getItem(key)||'null');
        if(obj?.data){ loadGameFromKey(key); return; }
      }catch(_){}
      clearGameUrl();   // stale ID → drop it
    }
    goScreen("mainMenu");
  }
  // map3d.js (defines window.wbUI and friends) loads after game.js, so wait
  // until the whole document has parsed before resuming a saved game.
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

/* ===== IN-GAME QUICK MENU ===== */
(function(){
  var wrap   = document.getElementById('gameMenuWrap');
  var togBtn = document.getElementById('gameMenuToggle');
  var panel  = document.getElementById('gameMenuPanel');
  if(!wrap || !togBtn || !panel) return;

  function openPanel(){
    var o = getOptions();
    var gmAs = document.getElementById('gmOptAutoSave');
    var gmAn = document.getElementById('gmOptAnim');
    var gmTf = document.getElementById('gmOptTroopFigures');
    if(gmAs) gmAs.classList.toggle('on', !!o.autosave);
    if(gmAn) gmAn.classList.toggle('on', !!o.animations);
    if(gmTf) gmTf.classList.toggle('on', o.troopFigures!==false);
    /* Seeschlacht-Karten (naval): feste Schiffs-Figuren — Umschalter sperren. */
    if(gmTf && typeof IS_NAVAL !== 'undefined'){
      var gmTfRow = gmTf.closest('.gm-opt-row');
      gmTf.classList.toggle('disabled', IS_NAVAL);
      if(gmTfRow){ gmTfRow.classList.toggle('opt-disabled', IS_NAVAL); gmTfRow.title = IS_NAVAL ? 'Seeschlacht: feste Schiffs-Figuren — nicht umschaltbar' : ''; }
      if(IS_NAVAL) gmTf.classList.remove('on');
    }
    var slM = document.getElementById('gmMusicVol');
    var slS = document.getElementById('gmSfxVol');
    var slC = document.getElementById('gmClickVol');
    if(slM && window.BrettSounds) slM.value = window.BrettSounds.getMusicVolume();
    if(slS && window.WBSfx) slS.value = window.WBSfx.getVolume();
    if(slC && window.WBSfx) slC.value = window.WBSfx.getClickVolume();
    panel.removeAttribute('hidden');
    togBtn.classList.add('open');
  }
  function closePanel(){
    panel.setAttribute('hidden', '');
    togBtn.classList.remove('open');
  }
  function isOpen(){ return !panel.hasAttribute('hidden'); }

  togBtn.addEventListener('click', function(e){
    e.stopPropagation();
    isOpen() ? closePanel() : openPanel();
  });

  // Close when clicking outside the menu
  document.addEventListener('click', function(e){
    if(isOpen() && !wrap.contains(e.target)) closePanel();
  });

  // Option toggles — .on class is already flipped by the global .toggle listener.
  // This handler persists the new state and keeps the lobby toggles in sync.
  ['gmOptAutoSave','gmOptAnim','gmOptTroopFigures'].forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('click', function(){
      var o = getOptions();
      o.autosave   = document.getElementById('gmOptAutoSave').classList.contains('on');
      o.animations = document.getElementById('gmOptAnim').classList.contains('on');
      var gmTf = document.getElementById('gmOptTroopFigures');
      if(gmTf) o.troopFigures = gmTf.classList.contains('on');
      try{ localStorage.setItem(OPTS_KEY, JSON.stringify(o)); }catch(e){}
      var la = document.getElementById('optAutoSave');
      var ln = document.getElementById('optAnim');
      var lt = document.getElementById('optTroopFigures');
      if(la) la.classList.toggle('on', o.autosave);
      if(ln) ln.classList.toggle('on', o.animations);
      if(lt) lt.classList.toggle('on', o.troopFigures!==false);
      // Live-Umschaltung auf der Karte
      if(id==='gmOptTroopFigures' && typeof window.map3d_setMarkerMode==='function'){
        window.map3d_setMarkerMode(o.troopFigures ? 'figures' : 'banner');
      }
    });
  });

  var slM = document.getElementById('gmMusicVol');
  var slS = document.getElementById('gmSfxVol');
  var slC = document.getElementById('gmClickVol');
  if(slM) slM.addEventListener('input', function(){
    if(window.BrettSounds) window.BrettSounds.setMusicVolume(+this.value);
  });
  if(slS) slS.addEventListener('input', function(){
    var v = +this.value;
    if(window.BrettSounds) window.BrettSounds.setSfxVolume(v);
    if(window.WBSfx) window.WBSfx.setVolume(v);
  });
  if(slC) slC.addEventListener('input', function(){
    if(window.WBSfx) window.WBSfx.setClickVolume(+this.value);
  });

  document.getElementById('gmSaveBtn').addEventListener('click', function(){
    closePanel(); saveCurrentGame();
  });

  document.getElementById('gmMainMenuBtn').addEventListener('click', function(){
    closePanel();
    if(!G){ currentGameId = null; clearGameUrl(); goScreen('mainMenu'); return; }
    gameConfirm('Zum Hauptmenü? Das Spiel wird automatisch gespeichert.', function(){
      saveCurrentGame();
      G = null; currentGameId = null; clearGameUrl(); goScreen('mainMenu');
    });
  });
})();
