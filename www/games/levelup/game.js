(function(){
'use strict';
const GAME='levelup';
const $=id=>document.getElementById(id);
const clientId=sessionStorage.getItem('lu.clientId') || (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()));
sessionStorage.setItem('lu.clientId',clientId);
let role='guest', ws=null, connected=false, joinTimer=null, hasCreatedRoom=false, reconnectTimer=null, _botTimer=null;
const params=new URLSearchParams(location.search);
const I18N=window.BFI18N||null;
const tr=(key,vars={},fallback='')=>I18N?.t(key,vars,fallback)??(fallback||key);

// ===== cards & levels =====
const COLORS=['red','blue','green','yellow'];
const LEVELS=[
  [{type:'set',count:3},{type:'set',count:3}],
  [{type:'set',count:3},{type:'run',count:4}],
  [{type:'set',count:4},{type:'run',count:4}],
  [{type:'run',count:7}],
  [{type:'run',count:8}],
  [{type:'run',count:9}],
  [{type:'set',count:4},{type:'set',count:4}],
  [{type:'color',count:7}],
  [{type:'set',count:5},{type:'set',count:2}],
  [{type:'set',count:5},{type:'set',count:3}]
];

// ===== characters (meeple selection) =====
// One real GLB model per entry (game.render3d.js loads+caches models/<file>
// and clones it both for the char-select preview and the seated table
// avatar), plus an emoji fallback used in the compact players-list row and
// as a safety net if a model somehow fails to load. `id` is also the i18n
// key suffix under levelup.char.*.
const CHARACTERS=[
  {id:'zauberer',file:'meeple_01_zauberer.glb',emoji:'🧙'},
  {id:'roboter',file:'meeple_02_roboter.glb',emoji:'🤖'},
  {id:'pirat',file:'meeple_03_pirat.glb',emoji:'🏴‍☠️'},
  {id:'astronaut',file:'meeple_04_astronaut.glb',emoji:'🧑‍🚀'},
  {id:'koch',file:'meeple_05_koch.glb',emoji:'👨‍🍳'},
  {id:'ninja',file:'meeple_06_ninja.glb',emoji:'🥷'},
  {id:'wikinger',file:'meeple_07_wikinger.glb',emoji:'🛡️'},
  {id:'ritter',file:'meeple_08_ritter.glb',emoji:'⚔️'},
  {id:'cowgirl',file:'meeple_09_cowgirl.glb',emoji:'🤠'},
  {id:'alien',file:'meeple_10_alien.glb',emoji:'👽'},
  {id:'detektiv',file:'meeple_11_detektiv.glb',emoji:'🕵️'},
  {id:'taucher',file:'meeple_12_taucher.glb',emoji:'🤿'},
  {id:'koenigin',file:'meeple_13_koenigin.glb',emoji:'👸'},
  {id:'rockstar',file:'meeple_14_rockstar.glb',emoji:'🎸'},
  {id:'feuerwehr',file:'meeple_15_feuerwehr.glb',emoji:'🧑‍🚒'},
  {id:'yeti',file:'meeple_16_yeti.glb',emoji:'🦣'},
  {id:'pharao',file:'meeple_17_pharao.glb',emoji:'🏺'},
  {id:'pilot',file:'meeple_18_pilot.glb',emoji:'🧑‍✈️'},
  {id:'vampir',file:'meeple_19_vampir.glb',emoji:'🧛'},
  {id:'superheldin',file:'meeple_20_superheldin.glb',emoji:'🦸‍♀️'}
];
function characterById(id){return CHARACTERS.find(c=>c.id===id)||null;}
function randomCharacterId(){return CHARACTERS[Math.floor(Math.random()*CHARACTERS.length)].id;}

// ===== seats (chair selection) =====
// Six GLB chairs (game.render3d.js loads+caches models/<file>, mirrors
// CHAR_MODEL_FILES' duplication pattern above), each character gets a
// thematically fitting default (CHAR_DEFAULT_SEAT) but the player can still
// override it in char-select (see selectSeat/pendingSeat) — Nutzerwunsch:
// "jeder Charakter hat einen passenden Standardstuhl, Spieler kann aber
// trotzdem noch auswählen". All 6 GLBs share one authored seat-surface
// height (measured directly from each file's accessors: every "_seatpad"
// submesh tops out at raw y=0.46, identical across all six models) and a
// floor origin at raw y≈0 — that consistency is what lets any character sit
// on any chair without per-pair tuning, see CHAR_MODEL_FILES/SEAT_MODEL_FILES
// composition comment in game.render3d.js.
const SEATS=[
  {id:'holzstuhl',file:'seat_01_holzstuhl.glb',emoji:'🪑'},
  {id:'thron',file:'seat_02_thron.glb',emoji:'👑'},
  {id:'technik',file:'seat_03_technik.glb',emoji:'🛰️'},
  {id:'fass',file:'seat_04_fass.glb',emoji:'🛢️'},
  {id:'hocker',file:'seat_05_hocker.glb',emoji:'🪵'},
  {id:'baumstumpf',file:'seat_06_baumstumpf.glb',emoji:'🌳'}
];
function seatById(id){return SEATS.find(s=>s.id===id)||null;}
// Thematic default per character id — purely a starting suggestion, always
// overridable via selectSeat(). Not meant to be exhaustively "correct", just
// a sensible starting point per character so most players never need to
// touch the seat row at all.
const CHAR_DEFAULT_SEAT={
  zauberer:'baumstumpf', roboter:'technik', pirat:'fass', astronaut:'technik', koch:'holzstuhl',
  ninja:'baumstumpf', wikinger:'fass', ritter:'holzstuhl', cowgirl:'hocker', alien:'technik',
  detektiv:'holzstuhl', taucher:'fass', koenigin:'thron', rockstar:'thron', feuerwehr:'holzstuhl',
  yeti:'baumstumpf', pharao:'thron', pilot:'technik', vampir:'thron', superheldin:'technik'
};
function defaultSeatFor(characterId){ return CHAR_DEFAULT_SEAT[characterId]||SEATS[0].id; }

function buildDeck(){
  const deck=[]; let uid=0;
  for(const color of COLORS) for(let v=1;v<=12;v++) for(let copy=0;copy<2;copy++) deck.push({id:'c'+(uid++),color,value:v});
  for(let i=0;i<8;i++) deck.push({id:'c'+(uid++),type:'wild'});
  for(let i=0;i<4;i++) deck.push({id:'c'+(uid++),type:'skip'});
  return deck;
}
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function cardPoints(c){if(c.type==='wild')return 25;if(c.type==='skip')return 15;return c.value<=9?5:10;}

// House rule: a group (Phase/meld) may never be more than half wildcards —
// applied to whatever the FINAL card count ends up being (post over-fulfill,
// post-hit), not just req.count, so e.g. 3 cards allow at most 1 wild, 4
// allow at most 2. Checked both when a group is first laid (resolveGroup)
// and whenever it's later extended (extendGroup), against the group's total
// card count each time — otherwise a legally-laid group could be pushed over
// the ratio afterwards by hitting it with more wilds.
function wildRatioOk(cardsArr){
  const wildCount=cardsArr.filter(c=>c.type==='wild').length;
  return wildCount<=Math.floor(cardsArr.length/2);
}
// Resolve a freshly-assigned group of cards against a level requirement.
// Wild cards are given a concrete "repValue"/"repColor" so the group can
// later be extended (hit) without re-deciding what each wild represents.
function resolveGroup(cards,req){
  // At least req.count cards are required, but more are welcome — e.g. a
  // 3er-Satz stays valid with a 4th matching card, a 7er-Reihe stays valid
  // extended all the way to 10 consecutive cards — as long as the extra
  // cards still fit the same set/run/color rule. Only the run branch below
  // needs a real behavior change for this (its target length used to be
  // pinned to req.count); set/color already accept any uniform-value/-color
  // group regardless of size once the count floor is met.
  if(!cards||cards.length<req.count) return null;
  if(cards.some(c=>c.type==='skip')) return null;
  if(!wildRatioOk(cards)) return null;
  const wilds=cards.filter(c=>c.type==='wild');
  const normals=cards.filter(c=>c.type!=='wild');
  if(req.type==='set'){
    const vals=new Set(normals.map(c=>c.value));
    if(vals.size>1) return null;
    const value=normals.length?normals[0].value:1;
    return {type:'set',value,cards:cards.map(c=>({...c,repValue:value}))};
  }
  if(req.type==='color'){
    const cols=new Set(normals.map(c=>c.color));
    if(cols.size>1) return null;
    const color=normals.length?normals[0].color:'red';
    return {type:'color',color,cards:cards.map(c=>({...c,repColor:color}))};
  }
  if(req.type==='run'){
    const vals=normals.map(c=>c.value);
    if(new Set(vals).size!==vals.length) return null;
    const count=cards.length; // run length grows with however many cards were submitted, not pinned to req.count
    let start;
    if(normals.length){
      const mn=Math.min(...vals),mx=Math.max(...vals);
      if(mx-mn>count-1) return null;
      const loStart=Math.max(1,mx-count+1), hiStart=Math.min(mn,12-count+1);
      if(loStart>hiStart) return null;
      start=hiStart;
    } else { start=1; if(12-count+1<1) return null; }
    const slot=new Array(count).fill(null);
    for(const c of normals) slot[c.value-start]=c;
    let wi=0;
    for(let i=0;i<count;i++) if(!slot[i]) slot[i]=wilds[wi++];
    if(wi!==wilds.length) return null;
    return {type:'run',start,len:count,cards:slot.map((c,i)=>({...c,repValue:start+i}))};
  }
  return null;
}
// Extend an already-laid group with additional cards ("hit"). `side`
// ('front'|'back') only matters for the run branch's all-wild case below,
// where there is no normal-valued card to anchor the new cards to one end —
// see the run branch for why that case is otherwise ambiguous.
function extendGroup(group,newCards,side){
  if(!newCards||!newCards.length) return null;
  if(newCards.some(c=>c.type==='skip')) return null;
  if(!wildRatioOk([...group.cards,...newCards])) return null;
  if(group.type==='set'){
    if(newCards.some(c=>c.type!=='wild'&&c.value!==group.value)) return null;
    return {...group,cards:[...group.cards,...newCards.map(c=>({...c,repValue:group.value}))]};
  }
  if(group.type==='color'){
    if(newCards.some(c=>c.type!=='wild'&&c.color!==group.color)) return null;
    return {...group,cards:[...group.cards,...newCards.map(c=>({...c,repColor:group.color}))]};
  }
  if(group.type==='run'){
    const combined=[...group.cards,...newCards];
    const newNormals=newCards.filter(c=>c.type!=='wild');
    if(new Set(newNormals.map(c=>c.value)).size!==newNormals.length) return null;
    for(const c of newNormals) if(c.value>=group.start && c.value<=group.start+group.len-1) return null;
    let start=group.start, len=group.len;
    if(newNormals.length){
      const mn=Math.min(...newNormals.map(c=>c.value)), mx=Math.max(...newNormals.map(c=>c.value));
      const newStart=Math.min(start,mn), newEnd=Math.max(start+len-1,mx);
      if(newStart<1||newEnd>12) return null;
      const newLen=newEnd-newStart+1;
      if(newLen-len!==newCards.length) return null;
      start=newStart; len=newLen;
    } else {
      // All-wild extension: nothing anchors the new cards to a specific
      // value, so both ends of the run can be legal at once (e.g. a run of
      // 5-8 can grow to 4-8 OR 5-9). Without an explicit side, default to the
      // old unconditional "prefer the tail, fall back to the front" behavior
      // — game.js only ever passes a side when both ends were actually legal
      // (see runHitAmbiguousSide()), so this default only fires when there
      // was no real choice to begin with, or for callers (bots, legality
      // pre-checks) that don't care which end gets picked.
      const addTail=newCards.length;
      const canTail=start+len-1+addTail<=12, canFront=start-addTail>=1;
      let useFront;
      if(side==='front'&&canFront) useFront=true;
      else if(side==='back'&&canTail) useFront=false;
      else if(canTail) useFront=false;
      else if(canFront) useFront=true;
      else return null;
      if(useFront){ start-=addTail; len+=addTail; } else { len+=addTail; }
    }
    const slot=new Array(len).fill(null);
    for(const c of combined.filter(c=>c.type!=='wild')) slot[c.value-start]=c;
    let wi=0; const wildsAll=combined.filter(c=>c.type==='wild');
    for(let i=0;i<len;i++) if(!slot[i]) slot[i]=wildsAll[wi++];
    if(wi!==wildsAll.length) return null;
    return {type:'run',start,len,cards:slot.map((c,i)=>({...c,repValue:start+i}))};
  }
  return null;
}

// ===== state =====
const initialState=()=>({
  phase:'menu', room:'', publicRoom:false, hostId:null,
  players:[], round:0, turnIndex:0, hasDrawn:false,
  deck:[], discard:[], table:{}, pendingSkip:null,
  winner:null, roundSummary:null, finalScores:null,
  log:[], eventSeq:0, lastEvent:null
});
let state=initialState();
let uiMode='idle'; // 'idle' | 'laying' | 'hitting'
let selectedIds=new Set();
let layAssignment=[];
let handSortMode=(['value','manual'].includes(localStorage.getItem('lu.sort')))?localStorage.getItem('lu.sort'):'color';
// Custom drag-to-reorder order for handSortMode==='manual' (Nutzerwunsch:
// "selbst sortieren können") — a plain array of card ids, session-only (never
// persisted: ids are per-deal, so there's nothing meaningful to restore after
// a reload). sortHand() below is the only place that mutates it: it prunes
// ids no longer in hand and appends newly-drawn ones, so this array always
// stays in sync with the current hand without any other call site needing to
// know about it.
let handOrder=[];

// ===== character select (pre-join screen) =====
// Purely local UI state, never networked directly — the chosen id only
// travels to the host as part of the join message (see repeatJoin/startHost)
// and from then on lives as player.character inside the synced state, like
// any other player field. `charSelectActive` gates render()'s menu-vs-
// charSelect branch independently of state.phase (still 'menu' throughout).
let charSelectActive=false;
let pendingCreate=true;
let pendingRoom='';
let pendingCharacter=localStorage.getItem('lu.character')||CHARACTERS[0].id;
// Seat the player has chosen for pendingCharacter — reset to that
// character's thematic default whenever pendingCharacter changes (see
// selectCharacter), overridable per-session via selectSeat(). Deliberately
// NOT persisted in localStorage like pendingCharacter: it's a per-character
// default, so persisting a raw seat id across a character switch would just
// reintroduce the same "stale mismatched pick" problem this is meant to avoid.
let pendingSeat=defaultSeatFor(pendingCharacter);
// True while the char-select screen is connected to a JOIN target room as an
// unconfirmed placeholder (see peekConnect/confirmJoinAfterPeek below) —
// distinguishes "already connected, just send the final confirm" from a
// fresh connect() in confirmCharSelect().
let peeking=false;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1900);}
// Short, translated label for a card in the move log ("Rot 7", "Joker",
// "Aussetzer") — separate from cardChip()'s DOM chip since the log is plain
// text, not a colored box.
function cardLabel(c){
  if(!c) return '';
  if(c.type==='wild') return tr('levelup.card.wild',{},'Joker');
  if(c.type==='skip') return tr('levelup.card.skip',{},'Aussetzer');
  return tr('levelup.color.'+c.color,{},c.color)+' '+c.value;
}
// [REUSABLE] Move-log pattern: a capped, append-only list of past turns,
// broadcast as part of the snapshot like everything else in state (see
// persist()) so every client — not just the actor — sees the same history.
// Entries store an i18n key + vars rather than pre-rendered text so the log
// re-translates correctly if a viewer switches language mid-game. Portable
// to any host-authoritative-snapshot game here: copy pushLog()+the state.log
// array+renderLog(), add your own i18n keys under your game's namespace, and
// call pushLog() from wherever your own applyAction()-equivalent resolves a
// move. See also renderLog() further down (auto-scroll only if already near
// the bottom) and cardLabel() for the "translate one logged item" helper.
function pushLog(key,vars){
  state.log=state.log||[];
  const id=(state.log.length?state.log[state.log.length-1].id:0)+1;
  state.log.push({id,key,vars:vars||{}});
  if(state.log.length>80) state.log.splice(0,state.log.length-80);
}
function makeRoom(){return Math.random().toString(36).slice(2,8).toUpperCase();}
function nameVal(){return ($('nameInput')?.value||$('hostNameInput')?.value||localStorage.getItem('lu.name')||tr('levelup.player',{},'Spieler')).trim().slice(0,24)||tr('levelup.player',{},'Spieler');}
function myPlayer(){return state.players.find(p=>p.id===clientId);}
function isMyTurn(){const cur=state.players[state.turnIndex];return !!cur && cur.id===clientId;}
function isHostActor(id){return id===state.hostId;}

// ===== networking =====
function wsUrl(){if(location.protocol==='file:')return 'ws://localhost:8787/ws';return (location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws';}
function send(msg){if(ws&&ws.readyState===1){const hostMeta=role==='host'?{public:!!state.publicRoom,hostName:nameVal()}:{};ws.send(JSON.stringify({game:GAME,room:state.room,clientId,name:nameVal(),...hostMeta,...msg}));}}
function sendDirect(toId,msg){send({...msg,to:toId});}
function persist(){send({type:'snapshot',snapshot:state});}
function saveSession(){try{sessionStorage.setItem('lu.session',JSON.stringify({room:state.room,role}));}catch(e){}}
function clearSession(){try{sessionStorage.removeItem('lu.session');}catch(e){}}
function getSavedSession(){try{return JSON.parse(sessionStorage.getItem('lu.session')||'null');}catch(e){return null;}}

function connect(room){
  state.room=room.toUpperCase(); $('roomOut').textContent=state.room;
  localStorage.setItem('lu.room',state.room); saveSession();
  if(ws) try{ws.close();}catch(e){}
  ws=new WebSocket(wsUrl());
  ws.onopen=()=>{
    connected=true;
    if(role==='host'&&!hasCreatedRoom){ hasCreatedRoom=true; send({type:'create',snapshot:state}); }
    else send({type:'join'});
    if(role!=='host') repeatJoin();
  };
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch(_){return;}handle(m);};
  ws.onclose=()=>{connected=false;setTimeout(()=>state.room&&connect(state.room),1300);};
}
// Sent both for the very first join AND to keep retrying until our own id
// shows up in state.players — `confirmed:false` is what keeps us off of
// everyone else's visible player list while still on the character-select
// screen (see addPlayer/renderPlayersList/doStartGame). The character we
// join with here is whatever's currently highlighted; confirmCharSelect()
// sends the (possibly different, final) pick separately once chosen.
function repeatJoin(){clearInterval(joinTimer);send({type:'joinRequest',character:pendingCharacter,seat:pendingSeat,confirmed:false});joinTimer=setInterval(()=>{if(state.players.some(p=>p.id===clientId))clearInterval(joinTimer);else send({type:'joinRequest',character:pendingCharacter,seat:pendingSeat,confirmed:false});},1100);}

function handle(m){
  if(m.game&&m.game!==GAME) return;
  if(m.to&&m.to!==clientId) return;
  if(m.type==='actionError'){ toast(m.text); return; }
  if(m.type==='sessionState'&&m.snapshot){ clearTimeout(reconnectTimer); reconnectTimer=null; state={...initialState(),...m.snapshot}; if(role==='host'){ healEmptyHandDeadlock(); persist(); } render(); return; }
  if(m.type==='snapshot'&&m.clientId!==clientId){ state={...initialState(),...m.snapshot}; render(); return; }
  if(role!=='host') return;
  if(m.type==='joinRequest') addPlayer(m.clientId,m.name||tr('levelup.player',{},'Spieler'),m.character,m.confirmed,m.seat);
  else if(m.type==='draw') applyAction(m.clientId,'draw',{source:m.source});
  else if(m.type==='layDown') applyAction(m.clientId,'layDown',{groups:m.groups});
  else if(m.type==='hit') applyAction(m.clientId,'hit',{targetId:m.targetId,groupIndex:m.groupIndex,cardIds:m.cardIds});
  else if(m.type==='discard') applyAction(m.clientId,'discard',{cardId:m.cardId});
  else if(m.type==='skipTarget') applyAction(m.clientId,'skipTarget',{targetId:m.targetId});
  else if(m.type==='startGame') applyAction(m.clientId,'startGame',{botCount:m.botCount});
  else if(m.type==='nextRound') applyAction(m.clientId,'nextRound',{});
  else if(m.type==='rematch') applyAction(m.clientId,'rematch',{});
  else if(m.type==='confirmCharacter') applyAction(m.clientId,'confirmCharacter',{character:m.character,seat:m.seat});
  else if(m.type==='leaveRoom') applyAction(m.clientId,'leaveRoom',{});
}

function act(type,payload){ if(role==='host') applyAction(clientId,type,payload); else send({type,...payload}); }

// `confirmed:false` means "occupies a slot but is still on the character-
// select screen" — see openCharSelect/joinRoomFlow in the char-select
// section below. Such players are deliberately still real entries in
// state.players (there is no other way to let them see who else is already
// in the room and which meeples are taken — see the long comment on
// openCharSelect for why a true peek-without-joining isn't possible with
// this relay's message contract), but renderPlayersList()/doStartGame()
// filter them out so nobody else sees a nameless placeholder sitting in the
// lobby, or ends up dealt into a round they never actually confirmed into.
function addPlayer(id,name,character,confirmed,seat){
  if(state.phase!=='lobby') return;
  if(state.players.some(p=>p.id===id)) return;
  if(state.players.length>=6) return;
  const char=characterById(character)?character:null;
  const seatId=seatById(seat)?seat:defaultSeatFor(char);
  state.players.push({id,name,isBot:false,level:1,score:0,hand:[],laidThisRound:false,pendingSkipCard:null,character:char,seat:seatId,confirmed:confirmed!==false});
  persist(); render();
}
function doConfirmCharacter(playerId,character,seat){
  if(state.phase!=='lobby') return {ok:false};
  const p=state.players.find(x=>x.id===playerId);
  if(!p) return {ok:false};
  p.character=characterById(character)?character:randomCharacterId();
  p.seat=seatById(seat)?seat:defaultSeatFor(p.character);
  p.confirmed=true;
  return {ok:true};
}
function doLeaveLobby(playerId){
  if(state.phase!=='lobby') return {ok:false};
  const idx=state.players.findIndex(p=>p.id===playerId);
  if(idx<0) return {ok:false};
  state.players.splice(idx,1);
  return {ok:true};
}

// ===== turn engine =====
function currentPlayer(){return state.players[state.turnIndex];}
function newDeal(){
  state.deck=shuffle(buildDeck());
  state.players.forEach(p=>{p.hand=[];p.laidThisRound=false;p.pendingSkipCard=null;});
  for(let i=0;i<10;i++) state.players.forEach(p=>p.hand.push(state.deck.pop()));
  let first=state.deck.pop(),guard=0;
  while(first&&first.type==='skip'&&guard++<30){ state.deck.unshift(first); first=state.deck.pop(); }
  state.discard=first?[first]:[];
  state.table={}; state.hasDrawn=false; state.pendingSkip=null;
  state.turnIndex=(state.round-1)%Math.max(1,state.players.length);
  scheduleBotTurnIfNeeded();
}
function reshuffleDeck(){
  // Only ever called from doDraw() when the draw pile is actually empty —
  // already-discarded cards only become drawable again at that point, never
  // before (the discard pile itself stays untouched otherwise). Returns
  // whether a reshuffle actually happened so the caller can trigger the
  // "just shuffled" flourish (see doDraw()/recordEvent()'s 'draw' branch).
  if(state.discard.length<=1) return false;
  const top=state.discard[state.discard.length-1];
  state.deck=shuffle(state.discard.slice(0,-1));
  state.discard=[top];
  toast(tr('levelup.msg.reshuffled',{},'Nachziehstapel neu gemischt'));
  return true;
}
function endTurn(){
  state.hasDrawn=false;
  const n=state.players.length;
  let guard=0;
  do{
    state.turnIndex=(state.turnIndex+1)%n;
    const cur=state.players[state.turnIndex];
    if(cur.pendingSkipCard){
      state.discard.push(cur.pendingSkipCard);
      cur.pendingSkipCard=null;
      toast(tr('levelup.msg.skipApplied',{name:cur.name},cur.name+' setzt aus'));
      pushLog('skipApplied',{name:cur.name});
    }
    else break;
  }while(guard++<n*2);
  scheduleBotTurnIfNeeded();
}
function scheduleBotTurnIfNeeded(){
  if(role!=='host') return;
  clearTimeout(_botTimer);
  if(state.phase!=='playing'||state.pendingSkip) return;
  const cur=currentPlayer();
  if(cur&&cur.isBot) _botTimer=setTimeout(()=>runBotTurn(cur.id),850+Math.random()*500);
}

function finishRound(outPlayerId){
  const outPlayer=state.players.find(p=>p.id===outPlayerId);
  if(outPlayer) pushLog('wentOut',{name:outPlayer.name});
  const summary=[];
  state.players.forEach(p=>{
    const delta = p.id===outPlayerId?0:p.hand.reduce((s,c)=>s+cardPoints(c),0);
    p.score+=delta;
    summary.push({id:p.id,name:p.name,delta,total:p.score,leveledUp:p.laidThisRound});
  });
  const winners=state.players.filter(p=>p.laidThisRound&&p.level===10);
  if(winners.length){
    const winner=winners.slice().sort((a,b)=>a.score-b.score)[0];
    state.winner=winner.id;
    state.finalScores=state.players.slice().sort((a,b)=>a.score-b.score).map(p=>({id:p.id,name:p.name,total:p.score,level:p.level}));
    state.phase='gameOver';
  } else {
    state.players.forEach(p=>{ if(p.laidThisRound&&p.level<10) p.level+=1; });
    state.roundSummary=summary;
    state.phase='roundEnd';
  }
}

// One-time self-heal for games in progress from before the "keep one card
// to discard" house rule existed (see doLayDown()/doHit()): a player who
// reached 0 cards through laying down/hitting instead of discarding is
// stuck forever — every action button needs either a hand card or
// state.hasDrawn===false, so nothing the player (or a bot) can click ever
// fires another action, and the game never gets a chance to notice on its
// own. Reaching 0 cards is exactly what doDiscard() treats as "went out",
// so retroactively resolving the round that way is the least surprising
// fix. Checked once whenever the host (re)establishes session state (e.g.
// after a page reload) — the one code path guaranteed to still run even
// though every in-game button for the stuck player is disabled.
function healEmptyHandDeadlock(){
  if(state.phase!=='playing') return;
  const stuck=state.players.find(p=>p.hand.length===0);
  if(stuck) finishRound(stuck.id);
}

// ===== mutations (shared by network actions and bots) =====
function doDraw(playerId,source){
  const p=state.players.find(x=>x.id===playerId);
  if(!p||!isMyTurnOf(playerId)) return {ok:false,msgKey:'levelup.msg.notYourTurn'};
  if(state.hasDrawn) return {ok:false,msgKey:'levelup.msg.alreadyDrawn'};
  let card, reshuffled=false;
  if(source==='discard'){
    const top=state.discard[state.discard.length-1];
    if(!top) return {ok:false,msgKey:'levelup.msg.mustDrawFirst'};
    if(top.type==='skip') return {ok:false,msgKey:'levelup.msg.skipNoPickup'};
    card=state.discard.pop();
    p.hand.push(card);
  } else {
    if(!state.deck.length) reshuffled=reshuffleDeck();
    if(!state.deck.length) return {ok:false,msgKey:'levelup.msg.mustDrawFirst'};
    card=state.deck.pop();
    p.hand.push(card);
  }
  state.hasDrawn=true;
  return {ok:true,card,source,reshuffled};
}
function doLayDown(playerId,groupIdArrays){
  const p=state.players.find(x=>x.id===playerId);
  if(!p||!isMyTurnOf(playerId)) return {ok:false,msgKey:'levelup.msg.notYourTurn'};
  if(!state.hasDrawn) return {ok:false,msgKey:'levelup.msg.mustDrawFirst'};
  if(p.laidThisRound) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
  const req=LEVELS[p.level-1];
  if(!Array.isArray(groupIdArrays)||groupIdArrays.length!==req.length) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
  const usedIds=new Set(); const cardGroups=[];
  for(const ids of groupIdArrays){
    const cards=[];
    for(const id of ids){
      if(usedIds.has(id)) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
      const c=p.hand.find(x=>x.id===id);
      if(!c) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
      usedIds.add(id); cards.push(c);
    }
    cardGroups.push(cards);
  }
  const resolved=[];
  for(let i=0;i<req.length;i++){
    const r=resolveGroup(cardGroups[i],req[i]);
    if(!r) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
    resolved.push(r);
  }
  // House rule: a turn always ends by discarding, so laying down may never
  // claim the player's entire hand — otherwise there'd be nothing left to
  // discard and the turn (and the player) would be stuck forever. See the
  // matching check in doHit() below.
  if(p.hand.length-usedIds.size<1) return {ok:false,msgKey:'levelup.msg.mustKeepCard'};
  p.hand=p.hand.filter(c=>!usedIds.has(c.id));
  state.table[playerId]=resolved;
  p.laidThisRound=true;
  return {ok:true};
}
function doHit(playerId,targetId,groupIndex,cardIds,side){
  const p=state.players.find(x=>x.id===playerId);
  if(!p||!isMyTurnOf(playerId)) return {ok:false,msgKey:'levelup.msg.notYourTurn'};
  if(!state.hasDrawn) return {ok:false,msgKey:'levelup.msg.mustDrawFirst'};
  if(!p.laidThisRound) return {ok:false,msgKey:'levelup.msg.hitInvalid'};
  const groups=state.table[targetId];
  const group=groups&&groups[groupIndex];
  if(!group) return {ok:false,msgKey:'levelup.msg.hitInvalid'};
  const cards=[]; for(const id of (cardIds||[])){ const c=p.hand.find(x=>x.id===id); if(!c) return {ok:false,msgKey:'levelup.msg.hitInvalid'}; cards.push(c); }
  if(!cards.length) return {ok:false,msgKey:'levelup.msg.pickCardsFirst'};
  // House rule (see doLayDown() above): attaching cards may never leave the
  // hand empty, since a turn can only end via a discard, never via a hit.
  if(p.hand.length-cards.length<1) return {ok:false,msgKey:'levelup.msg.mustKeepCard'};
  const resolved=extendGroup(group,cards,side);
  if(!resolved) return {ok:false,msgKey:'levelup.msg.hitInvalid'};
  const usedIds=new Set(cards.map(c=>c.id));
  p.hand=p.hand.filter(c=>!usedIds.has(c.id));
  groups[groupIndex]=resolved;
  return {ok:true};
}
// House rule: only one Aussetzen-card may sit in front of a player at a
// time. eligibleSkipTargets() is the single source of truth for "who can
// legally be targeted right now" — used to filter both the bot's random
// pick and the human skip-target overlay, and re-checked authoritatively in
// doSkipTarget() itself. Falls back to "everyone else" if every other
// player already has a pending skip (only possible with several skips out
// at once) so a discard never soft-locks for lack of a legal target.
function eligibleSkipTargets(byId){
  const others=state.players.filter(p=>p.id!==byId);
  const free=others.filter(p=>!p.pendingSkipCard);
  return free.length?free:others;
}
function pickBotSkipTarget(botId){
  const pool=eligibleSkipTargets(botId);
  if(!pool.length) return null;
  const humans=pool.filter(p=>!p.isBot);
  const finalPool=humans.length?humans:pool;
  return finalPool[Math.floor(Math.random()*finalPool.length)].id;
}
function doDiscard(playerId,cardId){
  const p=state.players.find(x=>x.id===playerId);
  if(!p||!isMyTurnOf(playerId)) return {ok:false,msgKey:'levelup.msg.notYourTurn'};
  if(!state.hasDrawn) return {ok:false,msgKey:'levelup.msg.mustDrawFirst'};
  const idx=p.hand.findIndex(c=>c.id===cardId);
  if(idx<0) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
  const card=p.hand.splice(idx,1)[0];
  // Skip cards don't go to the shared discard pile right away — they stay
  // visible in front of the targeted player (target.pendingSkipCard) until
  // that player's turn actually gets skipped (see endTurn()), so everyone at
  // the table can see whose turn is already spoken for and why.
  if(card.type==='skip'){
    if(p.hand.length===0){ state.discard.push(card); finishRound(playerId); return {ok:true,card}; }
    if(p.isBot){
      const t=pickBotSkipTarget(playerId);
      const target=t&&state.players.find(x=>x.id===t);
      // A target hit by a second skip before their turn comes around only
      // actually skips once — mirrors the original skipNext-flag behavior
      // (idempotent) — but the earlier card must still land in the discard
      // pile here, or it vanishes from the 108-card deck entirely.
      if(target){ if(target.pendingSkipCard) state.discard.push(target.pendingSkipCard); target.pendingSkipCard=card; }
      else state.discard.push(card);
      endTurn();
      return {ok:true,card,skipTargetId:t};
    } else {
      state.pendingSkip={by:playerId,card};
    }
    return {ok:true,card,skipPending:true};
  }
  state.discard.push(card);
  if(p.hand.length===0){ finishRound(playerId); return {ok:true,card}; }
  endTurn();
  return {ok:true,card};
}
function doSkipTarget(playerId,targetId){
  if(!state.pendingSkip||state.pendingSkip.by!==playerId) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
  const target=state.players.find(x=>x.id===targetId);
  if(!target||targetId===playerId) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
  if(!eligibleSkipTargets(playerId).some(p=>p.id===targetId)) return {ok:false,msgKey:'levelup.msg.invalidGroup'};
  // Only reached with an already-pending target via eligibleSkipTargets()'s
  // fallback (everyone else already has one pending) — the old card must
  // still land in the discard pile here, or it vanishes from the 108-card
  // deck entirely instead of just being superseded.
  if(target.pendingSkipCard) state.discard.push(target.pendingSkipCard);
  const card=state.pendingSkip.card;
  target.pendingSkipCard=card;
  state.pendingSkip=null;
  endTurn();
  return {ok:true,card,targetId};
}
function doStartGame(playerId,botCount){
  if(!isHostActor(playerId)) return {ok:false,msgKey:'levelup.msg.notYourTurn'};
  // Drop anyone still on the character-select screen (confirmed:false, see
  // addPlayer) instead of dealing them in — they never actually confirmed
  // joining this lobby, they just occupied a slot long enough to see who
  // else/which meeples were already here.
  state.players=state.players.filter(p=>p.confirmed!==false);
  const wanted=Math.max(0,Math.min(5,Number(botCount)||0));
  const room=Math.max(0,6-state.players.length);
  const addBots=Math.min(wanted,room);
  for(let i=1;i<=addBots;i++){
    let n=1; while(state.players.some(p=>p.id==='bot-'+n)) n++;
    const taken=new Set(state.players.map(p=>p.character).filter(Boolean));
    const free=CHARACTERS.map(c=>c.id).filter(id=>!taken.has(id));
    const char=free.length?free[Math.floor(Math.random()*free.length)]:randomCharacterId();
    state.players.push({id:'bot-'+n,name:'Bot '+n,isBot:true,level:1,score:0,hand:[],laidThisRound:false,pendingSkipCard:null,character:char,seat:defaultSeatFor(char)});
  }
  if(state.players.length<2) return {ok:false,msgKey:'levelup.msg.notEnoughPlayers'};
  state.players.forEach(p=>{p.level=1;p.score=0;});
  state.round=1; state.phase='playing';
  state.log=[];
  newDeal();
  pushLog('roundStart',{n:state.round});
  return {ok:true};
}
function doNextRound(playerId){
  if(!isHostActor(playerId)) return {ok:false,msgKey:'levelup.msg.notYourTurn'};
  if(state.phase!=='roundEnd') return {ok:false,msgKey:'levelup.msg.invalidGroup'};
  state.round+=1; state.phase='playing'; state.roundSummary=null;
  newDeal();
  pushLog('roundStart',{n:state.round});
  return {ok:true};
}
function doRematch(playerId){
  if(!isHostActor(playerId)) return {ok:false,msgKey:'levelup.msg.notYourTurn'};
  state.players.forEach(p=>{p.level=1;p.score=0;});
  state.round=1; state.phase='playing'; state.winner=null; state.finalScores=null;
  state.log=[];
  newDeal();
  pushLog('roundStart',{n:state.round});
  return {ok:true};
}
function isMyTurnOf(playerId){const cur=currentPlayer();return !!cur&&cur.id===playerId;}

// [REUSABLE] state.lastEvent + incrementing eventSeq is a generic technique
// for triggering one-shot animations from a snapshot-broadcast model without
// building real state diffing: the sender stamps "the one thing that just
// happened" with an ever-increasing id, and the render layer dedupes by id
// (see lastHandledEventId in game.render3d.js) so a re-render that carries no
// new event (language switch, an unrelated second sync()) never replays it.
// Portable to any other snapshot-broadcast game here that wants a "fly this
// card/token/piece from A to B" effect without diffing two full states.
//
// Builds the move-log entry and the 3D layer's "what just happened" event
// for a successful action. Shared by applyAction() (human/network actions)
// and runBotTurn() (bots call doDraw/doDiscard/etc. directly, bypassing
// applyAction) so both sources of moves show up in the log and animate the
// same way. state.lastEvent is consumed once by game.render3d.js (matched
// by its incrementing id) to spawn a flight animation; pushLog() feeds the
// scrollable move-log card.
function recordEvent(actorId,type,payload,result){
  const actor=state.players.find(x=>x.id===actorId);
  if(!actor) return;
  if(type==='draw'){
    // A reshuffle (deck was empty) needs its own broadcast round BEFORE the
    // draw's own lastEvent below — state.lastEvent is a single slot, not a
    // queue, so setting both back-to-back without an interim persist/render
    // would have the draw event silently overwrite the reshuffle event
    // before any client ever saw/animated it (same reasoning as bots'
    // extra post-draw broadcast further down — see runBotTurn()).
    if(result.reshuffled){
      state.lastEvent={id:++state.eventSeq,type:'reshuffle',actorId};
      pushLog('reshuffled',{});
      persist(); render();
    }
    state.lastEvent={id:++state.eventSeq,type:'draw',actorId,source:result.source,card:result.source==='discard'?result.card:null};
    if(result.source==='discard') pushLog('drawDiscard',{name:actor.name,card:cardLabel(result.card)});
    else pushLog('draw',{name:actor.name});
  } else if(type==='discard'){
    if(result.card.type==='skip'){
      if(result.skipTargetId){
        const target=state.players.find(x=>x.id===result.skipTargetId);
        state.lastEvent={id:++state.eventSeq,type:'skipPlayed',actorId,targetId:result.skipTargetId,card:result.card};
        if(target) pushLog('skipPlayed',{name:actor.name,target:target.name});
      }
      // Human path: no target chosen yet (state.pendingSkip) — logged/
      // animated from the 'skipTarget' branch below once it is.
    } else {
      state.lastEvent={id:++state.eventSeq,type:'discard',actorId,card:result.card};
      pushLog('discard',{name:actor.name,card:cardLabel(result.card)});
    }
  } else if(type==='skipTarget'){
    const target=state.players.find(x=>x.id===payload.targetId);
    state.lastEvent={id:++state.eventSeq,type:'skipPlayed',actorId,targetId:payload.targetId,card:result.card};
    if(target) pushLog('skipPlayed',{name:actor.name,target:target.name});
  } else if(type==='layDown'){
    pushLog('layDown',{name:actor.name,level:actor.level});
  } else if(type==='hit'){
    const target=state.players.find(x=>x.id===payload.targetId);
    if(target) pushLog('hit',{name:actor.name,target:target.name});
  }
}

function applyAction(actorId,type,payload){
  let result;
  switch(type){
    case 'draw': result=doDraw(actorId,payload.source); break;
    case 'layDown': result=doLayDown(actorId,payload.groups); break;
    case 'hit': result=doHit(actorId,payload.targetId,payload.groupIndex,payload.cardIds,payload.side); break;
    case 'discard': result=doDiscard(actorId,payload.cardId); break;
    case 'skipTarget': result=doSkipTarget(actorId,payload.targetId); break;
    case 'startGame': result=doStartGame(actorId,payload.botCount); break;
    case 'nextRound': result=doNextRound(actorId); break;
    case 'rematch': result=doRematch(actorId); break;
    case 'confirmCharacter': result=doConfirmCharacter(actorId,payload.character,payload.seat); break;
    case 'leaveRoom': result=doLeaveLobby(actorId); break;
    default: return;
  }
  if(!result) return;
  if(!result.ok){
    const text=tr(result.msgKey,result.vars||{},result.msgKey);
    if(actorId===clientId) toast(text); else sendDirect(actorId,{type:'actionError',text});
    return;
  }
  recordEvent(actorId,type,payload,result);
  persist(); render();
}

// ===== bots =====
function findBestGroup(hand,req){
  const wilds=hand.filter(c=>c.type==='wild');
  const normals=hand.filter(c=>c.type!=='wild'&&c.type!=='skip');
  if(req.type==='set'){
    const byValue={}; normals.forEach(c=>{(byValue[c.value]=byValue[c.value]||[]).push(c);});
    for(const v in byValue){
      const arr=byValue[v]; const need=req.count-arr.length;
      if(need<=wilds.length) return [...arr.slice(0,req.count),...wilds.slice(0,Math.max(0,need))].slice(0,req.count);
    }
    return null;
  }
  if(req.type==='color'){
    const byColor={}; normals.forEach(c=>{(byColor[c.color]=byColor[c.color]||[]).push(c);});
    for(const col in byColor){
      const arr=byColor[col]; const need=req.count-arr.length;
      if(need<=wilds.length) return [...arr.slice(0,req.count),...wilds.slice(0,Math.max(0,need))].slice(0,req.count);
    }
    return null;
  }
  if(req.type==='run'){
    let best=null,bestScore=-1;
    for(let start=1;start+req.count-1<=12;start++){
      const windowVals=new Set(); for(let i=0;i<req.count;i++) windowVals.add(start+i);
      const seen=new Set(); const covering=[];
      for(const c of normals) if(windowVals.has(c.value)&&!seen.has(c.value)){seen.add(c.value);covering.push(c);}
      const need=req.count-covering.length;
      if(need<=wilds.length&&covering.length>bestScore){bestScore=covering.length;best=[...covering,...wilds.slice(0,need)];}
    }
    return best;
  }
  return null;
}
function tryFindGroups(hand,requirement){
  const work=hand.slice(); const result=[];
  for(const req of requirement){
    const found=findBestGroup(work,req);
    if(!found||found.length!==req.count) return null;
    result.push(found);
    for(const c of found){ const idx=work.findIndex(x=>x.id===c.id); if(idx>=0) work.splice(idx,1); }
  }
  return result;
}
function tryFindHit(bot){
  for(const targetId in state.table){
    const groups=state.table[targetId];
    for(let gi=0;gi<groups.length;gi++){
      for(const card of bot.hand){
        if(extendGroup(groups[gi],[card])) return {targetId,groupIndex:gi,cardIds:[card.id]};
      }
    }
  }
  return null;
}
function pickBotDiscard(bot){
  if(!bot.hand.length) return null;
  const skip=bot.hand.find(c=>c.type==='skip');
  if(skip) return skip;
  const nonWild=bot.hand.filter(c=>c.type!=='wild');
  if(nonWild.length) return nonWild.reduce((a,b)=>(b.value>a.value?b:a));
  return bot.hand[0];
}
function runBotTurn(botId){
  if(role!=='host') return;
  const bot=state.players.find(p=>p.id===botId);
  if(!bot||!bot.isBot||state.phase!=='playing'||!currentPlayer()||currentPlayer().id!==botId||state.pendingSkip) return;
  const top=state.discard[state.discard.length-1];
  let source='deck';
  if(top&&top.type!=='skip'&&!bot.laidThisRound){
    const sameValueCount=top.type==='wild'?0:bot.hand.filter(c=>c.value===top.value).length;
    if(sameValueCount>=1) source='discard';
  }
  const drawResult=doDraw(bot.id,source);
  if(drawResult.ok) recordEvent(bot.id,'draw',{source},drawResult);
  // Bots run their whole turn synchronously and only broadcast once at the
  // end (see final persist()/render() below) — without this extra cycle
  // right after drawing, the draw's lastEvent would just get overwritten by
  // the later layDown/hit/discard before anyone ever saw it rendered, so the
  // "card flies into the hand" animation would never actually play for bots.
  if(drawResult.ok){ persist(); render(); }
  if(!bot.laidThisRound){
    const req=LEVELS[bot.level-1];
    const groups=tryFindGroups(bot.hand.slice(),req);
    if(groups){ const r=doLayDown(bot.id,groups.map(g=>g.map(c=>c.id))); if(r.ok) recordEvent(bot.id,'layDown',{},r); }
  }
  if(bot.laidThisRound){
    for(let attempts=0;attempts<4;attempts++){
      const hit=tryFindHit(bot);
      if(!hit) break;
      const r=doHit(bot.id,hit.targetId,hit.groupIndex,hit.cardIds);
      if(!r.ok) break;
      recordEvent(bot.id,'hit',{targetId:hit.targetId},r);
    }
  }
  const choice=pickBotDiscard(bot);
  if(choice){ const r=doDiscard(bot.id,choice.id); if(r.ok) recordEvent(bot.id,'discard',{},r); }
  persist(); render();
}

// ===== room / lobby =====
function startHost(){
  role='host'; hasCreatedRoom=false; clearSession();
  state=initialState();
  state.room=makeRoom(); state.phase='lobby'; state.hostId=clientId;
  stopPublicRoomsPolling();
  state.publicRoom=!!$('publicRoomCheck')?.checked;
  $('hostNameInput').value=nameVal();
  state.players.push({id:clientId,name:nameVal(),isBot:false,level:1,score:0,hand:[],laidThisRound:false,pendingSkipCard:null,character:pendingCharacter,seat:pendingSeat});
  connect(state.room);
  render();
}
function joinRoomFlow(){
  role='guest'; clearSession();
  const room=($('roomInput').value||params.get('room')||'').trim().toUpperCase();
  if(!room) return toast(tr('levelup.msg.enterRoom',{},'Raumcode fehlt'));
  localStorage.setItem('lu.name',nameVal());
  state.phase='lobby';
  stopPublicRoomsPolling();
  connect(room);
  render();
}
// Connects to a JOIN target room the moment the char-select screen opens
// (see openCharSelect), as an unconfirmed placeholder (repeatJoin() always
// sends confirmed:false — see its own comment) — this is what makes
// takenCharacterIds()/renderCharSelect()'s "already in use" badges reflect
// the room's REAL occupants live, instead of only finding out who's there
// after already committing to join. `state.phase` deliberately stays
// whatever connect()'s incoming snapshot says (not forced to 'lobby' here
// the way joinRoomFlow() does it) so a peek at a room that's already mid-game
// doesn't misrepresent it as an open lobby.
function peekConnect(room){
  role='guest'; clearSession();
  peeking=true;
  stopPublicRoomsPolling();
  connect(room);
}
// Finishes a join that was already peekConnect()-ed: the placeholder join is
// in place, so this only needs to send the final chosen character (possibly
// different from whatever repeatJoin() sent first, see selectCharacter) and
// flip state.phase to 'lobby' locally — no second connect(), unlike
// joinRoomFlow(), which would tear down and rejoin from scratch.
function confirmJoinAfterPeek(){
  peeking=false;
  localStorage.setItem('lu.name',nameVal());
  state.phase='lobby';
  act('confirmCharacter',{character:pendingCharacter,seat:pendingSeat});
  saveSession();
  render();
}
// ===== character select (pre-join screen) =====
// Runs entirely before startHost()/joinRoomFlow() — nothing here touches the
// networked `state.players` for the LOCAL player until confirmCharSelect()
// hands off to one of those two. For the join case, `state.players` during
// this screen instead reflects whoever ELSE is already in the target room
// (see peekConnect), which is what drives the "already in use" badges.
let charThumbCache=null; // null until first generated; {id: dataURL} after, cached for the rest of the page session
function takenCharacterIds(){ return new Set(state.players.map(p=>p.character).filter(Boolean)); }
function openCharSelect(create){
  let room='';
  if(!create){
    room=($('roomInput').value||params.get('room')||'').trim().toUpperCase();
    if(!room) return toast(tr('levelup.msg.enterRoom',{},'Raumcode fehlt'));
  }
  pendingCreate=create; pendingRoom=room;
  if(!characterById(pendingCharacter)) pendingCharacter=CHARACTERS[0].id;
  charSelectActive=true;
  stopPublicRoomsPolling();
  render();
  if(window.LevelUp3D){
    window.LevelUp3D.mountCharPreview($('charPreviewCanvas'));
    window.LevelUp3D.setCharPreview(pendingCharacter);
    if(!charThumbCache){
      window.LevelUp3D.loadCharacterThumbnails().then(map=>{ charThumbCache=map; if(charSelectActive) renderCharSelect(); });
    }
  }
  // Join: connect now (peek-only) so the live snapshot of who's already in
  // the room — and which meeples they hold — arrives while this screen is
  // still open, instead of only finding out after actually joining.
  if(!create) peekConnect(pendingRoom);
}
function closeCharSelect(){
  charSelectActive=false;
  if(peeking){
    peeking=false;
    if(ws){try{ws.close();}catch(e){}ws=null;}
    connected=false;
  }
  state=initialState();
  render();
}
function selectCharacter(id){
  if(!characterById(id)) return;
  pendingCharacter=id;
  pendingSeat=defaultSeatFor(id);
  try{localStorage.setItem('lu.character',id);}catch(e){}
  renderCharSelect();
  if(window.LevelUp3D) window.LevelUp3D.setCharPreview(id);
}
function selectSeat(id){
  if(!seatById(id)) return;
  pendingSeat=id;
  renderCharSelect();
}
function confirmCharSelect(){
  charSelectActive=false;
  if(pendingCreate){
    startHost();
  } else {
    $('roomInput').value=pendingRoom;
    if(peeking) confirmJoinAfterPeek(); else joinRoomFlow();
  }
}
function renderCharSelect(){
  $('charConfirmBtn').textContent=pendingCreate?tr('levelup.createRoom',{},'Raum erstellen'):tr('levelup.joinRoom',{},'Raum beitreten');
  const taken=takenCharacterIds();
  const grid=$('charGrid');
  if(grid){
    grid.innerHTML=CHARACTERS.map(ch=>{
      const isTaken=taken.has(ch.id);
      const isSel=pendingCharacter===ch.id;
      const thumb=charThumbCache&&charThumbCache[ch.id];
      return `<button type="button" class="char-card${isSel?' selected':''}${isTaken?' taken':''}" data-char="${ch.id}">`
        +`<span class="char-thumb">${thumb?`<img src="${thumb}" alt="">`:`<span class="char-emoji-fallback">${ch.emoji}</span>`}</span>`
        +`<span class="char-name">${esc(tr('levelup.char.'+ch.id,{},ch.id))}</span>`
        +(isTaken?`<span class="char-inuse-badge">${esc(tr('levelup.char.inUse',{},'Vergeben'))}</span>`:'')
        +`</button>`;
    }).join('');
    grid.querySelectorAll('.char-card').forEach(btn=>{ btn.onclick=()=>selectCharacter(btn.dataset.char); });
  }
  $('charPreviewName').textContent=tr('levelup.char.'+pendingCharacter,{},pendingCharacter);
  const seatGrid=$('seatGrid');
  if(seatGrid){
    seatGrid.innerHTML=SEATS.map(s=>{
      const isSel=pendingSeat===s.id;
      return `<button type="button" class="seat-card${isSel?' selected':''}" data-seat="${s.id}" title="${esc(tr('levelup.seat.'+s.id,{},s.id))}">`
        +`<span class="seat-emoji">${s.emoji}</span>`
        +`<span class="seat-name">${esc(tr('levelup.seat.'+s.id,{},s.id))}</span>`
        +`</button>`;
    }).join('');
    seatGrid.querySelectorAll('.seat-card').forEach(btn=>{ btn.onclick=()=>selectSeat(btn.dataset.seat); });
  }
}

function leaveToMenu(){
  state=initialState();
  if(ws){try{ws.close();}catch(e){}ws=null;}
  connected=false; hasCreatedRoom=false; role='guest';
  clearInterval(joinTimer); joinTimer=null;
  clearTimeout(reconnectTimer); reconnectTimer=null;
  clearTimeout(_botTimer); _botTimer=null;
  try{clearSession();}catch(e){}
  stopPublicRoomsPolling();
  try{history.replaceState({},'',location.pathname);}catch(e){}
  uiMode='idle'; selectedIds=new Set(); layAssignment=[]; handOrder=[];
  charSelectActive=false; peeking=false;
  render();
}
function backToMainMenu(){
  const live=state.phase==='playing'||state.phase==='roundEnd';
  if(live) gameConfirm(tr('levelup.confirmMenu',{},'Zurück ins Hauptmenü? Die laufende Partie geht für dich verloren.'),leaveToMenu);
  else leaveToMenu();
}
window.__brettBack={ atTop:()=>state.phase==='menu'&&!charSelectActive, up:()=>{ if(charSelectActive){ closeCharSelect(); return; } backToMainMenu(); } };

function gameConfirm(msg,onYes){
  const ov=$('gameConfirmOverlay');
  if(!ov){ if(onYes&&window.confirm(msg)) onYes(); return; }
  $('gcMsg').textContent=msg;
  ov.removeAttribute('hidden');
  const close=()=>ov.setAttribute('hidden','');
  $('gcConfirmBtn').onclick=()=>{close();onYes&&onYes();};
  $('gcCancelBtn').onclick=close;
}

// A wild attached to a run with no normal-valued card alongside it has
// nothing to anchor it to one particular end — see extendGroup()'s run
// branch. Asks the player which end via a small local overlay instead of
// silently defaulting (Nutzerwunsch), but only when both ends are actually
// legal; onPick gets 'front'/'back', or null if the player backs out.
function pickRunSide(onPick){
  const ov=$('runSideOverlay');
  if(!ov){ onPick(null); return; }
  ov.removeAttribute('hidden');
  const close=()=>ov.setAttribute('hidden','');
  $('runSideFrontBtn').onclick=()=>{close();onPick('front');};
  $('runSideBackBtn').onclick=()=>{close();onPick('back');};
  $('runSideCancelBtn').onclick=()=>{close();onPick(null);};
}
function runHitAmbiguousSide(group,cards){
  if(!group||group.type!=='run'||!cards||!cards.length) return false;
  if(cards.some(c=>c.type!=='wild')) return false;
  const addTail=cards.length;
  return (group.start+group.len-1+addTail<=12)&&(group.start-addTail>=1);
}
// Single entry point for triggering a "hit" (attach) action — used by both
// the tap-to-select (onMeldClick) and drag-to-drop flows so the ambiguous-
// wild-on-a-run prompt only needs to live in one place. Fires the action
// (and afterFn, e.g. clearing selection/uiMode) right away when there's
// nothing to ask; otherwise waits for the overlay's answer first, and does
// neither if the player cancels there.
function performHit(targetId,groupIndex,cardIds,afterFn){
  const groups=state.table[targetId];
  const group=groups&&groups[groupIndex];
  const me=myPlayer();
  const cards=(cardIds||[]).map(id=>me&&me.hand.find(c=>c.id===id)).filter(Boolean);
  if(runHitAmbiguousSide(group,cards)){
    pickRunSide(side=>{
      if(!side) return;
      act('hit',{targetId,groupIndex,cardIds,side});
      afterFn&&afterFn();
    });
    return;
  }
  act('hit',{targetId,groupIndex,cardIds});
  afterFn&&afterFn();
}

// ===== public rooms =====
let publicRoomsPollTimer=null;
async function fetchPublicRooms(){
  try{
    const res=await fetch('/api/rooms?game='+encodeURIComponent(GAME),{credentials:'include'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    renderPublicRooms(Array.isArray(data.items)?data.items:[]);
  }catch(_){/* browsing rooms is a nice-to-have */}
}
function renderPublicRooms(items){
  const box=$('publicRoomsItems'); if(!box) return;
  if(!items.length){ box.innerHTML=`<div class="public-rooms-empty muted">${esc(tr('levelup.publicRooms.empty',{},'Aktuell keine öffentlichen Räume.'))}</div>`; return; }
  box.innerHTML=items.map(it=>`<button type="button" class="public-room-row" data-room="${esc(it.room)}"><strong>${esc(it.room)}</strong><span>${esc(it.hostName||tr('levelup.host',{},'Host'))}</span><span>${it.playerCount}</span></button>`).join('');
}
function startPublicRoomsPolling(){stopPublicRoomsPolling();fetchPublicRooms();publicRoomsPollTimer=setInterval(fetchPublicRooms,4000);}
function stopPublicRoomsPolling(){if(publicRoomsPollTimer)clearInterval(publicRoomsPollTimer);publicRoomsPollTimer=null;}

// ===== UI: menu tabs =====
function setMenuMode(mode){
  const create=mode!=='join';
  $('modeCreateTab').classList.toggle('active',create);
  $('modeCreateTab').setAttribute('aria-selected',String(create));
  $('modeJoinTab').classList.toggle('active',!create);
  $('modeJoinTab').setAttribute('aria-selected',String(!create));
  $('createFields').classList.toggle('hidden',!create);
  $('joinFields').classList.toggle('hidden',create);
  $('menuActionBtn').textContent=create?tr('levelup.createRoom',{},'Raum erstellen'):tr('levelup.joinRoom',{},'Raum beitreten');
  $('menuActionBtn').onclick=()=>openCharSelect(create);
  if(!create) startPublicRoomsPolling(); else stopPublicRoomsPolling();
}

// ===== rendering =====
function showIn(id,show){$(id).classList.toggle('hidden',!show);}
function phaseLabel(){
  switch(state.phase){
    case 'lobby': return tr('levelup.turn.waiting',{},'Warte auf Mitspieler…');
    case 'playing': return tr('levelup.roundLabel',{n:state.round},'Runde '+state.round);
    case 'roundEnd': return tr('levelup.roundOver',{},'Runde vorbei');
    case 'gameOver': return tr('levelup.finished',{},'Fertig');
    default: return '';
  }
}
function cardChip(c,draggable){
  const span=document.createElement('span');
  const cls=c.type==='wild'?'type-wild':c.type==='skip'?'type-skip':'color-'+c.color;
  span.className='card-chip '+cls+(draggable?' draggable':'');
  span.textContent=c.type==='wild'?'★':c.type==='skip'?'⛔':c.value;
  if(draggable) span.onpointerdown=e=>startCardDrag(e,c.id);
  return span;
}
function reqLabel(r){
  if(r.type==='set') return tr('levelup.req.set',{n:r.count},r.count+'er Satz');
  if(r.type==='run') return tr('levelup.req.run',{n:r.count},'Reihe aus '+r.count);
  return tr('levelup.req.color',{n:r.count},r.count+' Karten einer Farbe');
}
function sortHand(hand){
  if(handSortMode==='manual'){
    const ids=new Set(hand.map(c=>c.id));
    handOrder=handOrder.filter(id=>ids.has(id));
    hand.forEach(c=>{ if(!handOrder.includes(c.id)) handOrder.push(c.id); });
    return handOrder.map(id=>hand.find(c=>c.id===id));
  }
  const rank=handSortMode==='value'
    ? c=>(c.type==='wild'?1000:c.type==='skip'?2000:c.value*10)
    : c=>(c.type==='wild'?1000:c.type==='skip'?2000:COLORS.indexOf(c.color)*100+c.value);
  return hand.slice().sort((a,b)=>rank(a)-rank(b));
}

// [REUSABLE] Pointer-based drag (works for mouse + touch, unlike native HTML5
// DnD) — portable to any other game here that needs "drag an item onto one of
// several drop zones, but also allow a plain tap as a fallback". Copy this
// function plus DRAG_THRESHOLD into another game's own file and swap out:
//   - the cardId/myPlayer()/hand lookup at the top for your own item lookup,
//   - '.lay-tray' for your own drop-zone class,
//   - the ghost element's class/content for your own drag visual,
//   - the LevelUp3D.pickLayZone calls (only needed if you *also* have a 3D
//     on-table drop zone redundant with the DOM one, see game.render3d.js),
//   - the final onCardClick(cardId) fallback for your own tap handler.
// Works identically whether the drag started from a DOM element's
// onpointerdown (see cardChip()) or from a 3D raycast hit (see the
// #tableCanvas pointerdown listener near the bottom of this file) — the
// function only ever needs the originating event's clientX/clientY, never a
// DOM element, so both call sites can feed it as long as they resolve to the
// same cardId space.
//
// Drag a hand card — or a card already sitting in a lay-tray — onto one of
// the level's drop trays. A tap without movement falls back to the old
// click-to-cycle behavior so it stays usable without dragging too.
// Every legal place a dragged card could currently go: lay-trays while
// laying, any table group it could extend ("anlegen"/hit) once this player
// has already laid down, and the discard pile whenever a plain discard is
// legal right now. Computed once per drag (at drag-start, not every
// pointermove) and fed to both the 2D highlight toggling below and
// LevelUp3D.setDragTargets() for the 3D table — "show me where this card is
// allowed to go" only makes sense against a single evaluation of the rules,
// not a per-frame recheck.
function computeDropTargets(cardId){
  const me=myPlayer();
  const card=me&&me.hand.find(c=>c.id===cardId);
  const empty={layTrayIndices:[],meldTargets:[],discard:false};
  if(!me||!card) return empty;
  if(uiMode==='laying') return {layTrayIndices:(layAssignment||[]).map((_,i)=>i),meldTargets:[],discard:false};
  const canAct=isMyTurn()&&state.phase==='playing'&&!state.pendingSkip&&state.hasDrawn;
  const meldTargets=[];
  // House rule: never offer a hit that would empty the hand (see doHit()) —
  // this drag only ever carries the one dragged card, so hand.length>1 is
  // exactly "at least one card remains after it's gone".
  if(canAct&&me.laidThisRound&&me.hand.length>1){
    state.players.forEach(pl=>{
      const groups=state.table[pl.id];
      if(!groups) return;
      groups.forEach((g,gi)=>{ if(extendGroup(g,[card])) meldTargets.push({pid:pl.id,groupIndex:gi}); });
    });
  }
  return {layTrayIndices:[],meldTargets,discard:!!canAct};
}

// Static counterpart of computeDropTargets() above, for when a card is
// selected by TAP (idle mode, then "Anlegen") rather than by an active drag —
// used to keep highlighting the groups a selected card could attach to for
// as long as uiMode stays 'hitting', not just for the duration of a drag
// gesture. Reuses the same extendGroup() legality check and feeds the same
// 2D (.drop-armed class) / 3D (LevelUp3D.setDragTargets) highlight paths as
// the drag flow, see syncHitHighlight() below.
function computeHitTargets(){
  const me=myPlayer();
  if(!me||uiMode!=='hitting'||!selectedIds.size) return [];
  const cards=[...selectedIds].map(id=>me.hand.find(c=>c.id===id)).filter(Boolean);
  if(!cards.length) return [];
  const canAct=isMyTurn()&&state.phase==='playing'&&!state.pendingSkip&&state.hasDrawn&&me.laidThisRound;
  // House rule: never offer a hit that would empty the hand (see doHit()).
  if(!canAct||me.hand.length-cards.length<1) return [];
  const targets=[];
  state.players.forEach(pl=>{
    const groups=state.table[pl.id];
    if(!groups) return;
    groups.forEach((g,gi)=>{ if(extendGroup(g,cards)) targets.push({pid:pl.id,groupIndex:gi}); });
  });
  return targets;
}

// Applies computeHitTargets() to both the 2D meld-group elements and the 3D
// table (via the same setDragTargets() the drag flow uses) — called from
// renderGame() after every render so the highlight tracks selectedIds live,
// not just at drag-start like the drag flow's own highlighting does.
function syncHitHighlight(){
  const targets=computeHitTargets();
  document.querySelectorAll('.meld-group[data-pid]').forEach(m=>{
    const armed=targets.some(t=>t.pid===m.dataset.pid&&String(t.groupIndex)===m.dataset.groupIndex);
    m.classList.toggle('drop-armed',armed);
  });
  if(window.LevelUp3D&&window.LevelUp3D.setDragTargets){
    window.LevelUp3D.setDragTargets(targets.length?{layZones:[],melds:targets.map(t=>t.pid+'-'+t.groupIndex),discard:false}:null);
  }
}

const DRAG_THRESHOLD=6;
// How many horizontal pixels of drag == one slot of manual reorder (see the
// end of startCardDrag's onUp()) — deliberately a plain screen-space
// constant, not derived from the 3D hand fan's actual on-screen card
// spacing: the fan HUD retreats out of frame during ANY drag (see
// LevelUp3D.setHandDragging, used so the dragged card's ghost doesn't fight
// the on-table lay-zone plates for visibility), so there are no live card
// positions to measure against or drop onto mid-gesture. A fixed "nudge by
// roughly one card-width per this many pixels" gives a predictable feel
// without needing the retracted fan to be visible.
const MANUAL_REORDER_SLOT_PX=60;
function startCardDrag(e,cardId){
  const me=myPlayer(); const card=me&&me.hand.find(c=>c.id===cardId);
  if(!card) return;
  const layingActive=uiMode==='laying';
  e.preventDefault();
  const startX=e.clientX, startY=e.clientY;
  let dragging=false, ghost=null, dropTargets=null;
  function onMove(ev){
    const dx=ev.clientX-startX, dy=ev.clientY-startY;
    if(!dragging&&Math.hypot(dx,dy)>DRAG_THRESHOLD){
      dragging=true;
      dropTargets=computeDropTargets(cardId);
      ghost=document.createElement('div');
      const cls=card.type==='wild'?'type-wild':card.type==='skip'?'type-skip':'color-'+card.color;
      ghost.className='hand-card drag-ghost '+cls;
      ghost.textContent=card.type==='wild'?'★':card.type==='skip'?'⛔':card.value;
      document.body.appendChild(ghost);
      if(layingActive) document.querySelectorAll('.lay-tray').forEach(t=>t.classList.add('drop-armed'));
      document.querySelectorAll('.meld-group[data-pid]').forEach(m=>{
        const armed=dropTargets.meldTargets.some(t=>t.pid===m.dataset.pid&&String(t.groupIndex)===m.dataset.groupIndex);
        m.classList.toggle('drop-armed',armed);
      });
      if(window.LevelUp3D&&window.LevelUp3D.setDragTargets){
        window.LevelUp3D.setDragTargets({
          layZones:dropTargets.layTrayIndices,
          melds:dropTargets.meldTargets.map(t=>t.pid+'-'+t.groupIndex),
          discard:dropTargets.discard
        });
      }
    }
    if(dragging&&ghost){
      // Pull the hand fan HUD mostly out of frame once the drag actually
      // leaves the hand's own area, so it stops covering the on-table
      // lay-zone plates it sits right in front of — but keep it up (or bring
      // it back up) for as long as the pointer is still hovering over the
      // hand itself, e.g. while reordering in manual sort mode, so there's
      // something visible to sort against (Nutzerwunsch). Re-checked every
      // move rather than decided once at drag-start.
      if(window.LevelUp3D&&window.LevelUp3D.setHandDragging){
        const overHand=window.LevelUp3D.isOverHandBand&&window.LevelUp3D.isOverHandBand(ev.clientX,ev.clientY);
        window.LevelUp3D.setHandDragging(!overHand);
      }
      ghost.style.left=ev.clientX+'px'; ghost.style.top=ev.clientY+'px';
      let overTray=false;
      if(layingActive){
        document.querySelectorAll('.lay-tray').forEach(t=>{
          const r=t.getBoundingClientRect();
          const over=ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;
          if(over) overTray=true;
          t.classList.toggle('drop-hover',over);
        });
      }
      document.querySelectorAll('.meld-group.drop-armed').forEach(m=>{
        const r=m.getBoundingClientRect();
        const over=ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;
        m.classList.toggle('drop-hover',over);
      });
      // Redundant on-table drop zone (see LevelUp3D.pickLayZone/buildLayZones):
      // only checked once nothing in the HTML tray list is under the pointer,
      // so hovering the 2D trays always wins if the two ever visually overlap.
      if(layingActive&&window.LevelUp3D&&window.LevelUp3D.setHoveredLayZone){
        const zoneIdx=overTray?null:window.LevelUp3D.pickLayZone(ev.clientX,ev.clientY);
        window.LevelUp3D.setHoveredLayZone(zoneIdx);
      }
    }
  }
  function onUp(ev){
    window.removeEventListener('pointermove',onMove);
    window.removeEventListener('pointerup',onUp);
    document.querySelectorAll('.lay-tray').forEach(t=>{t.classList.remove('drop-hover');t.classList.remove('drop-armed');});
    document.querySelectorAll('.meld-group').forEach(m=>{m.classList.remove('drop-armed');m.classList.remove('drop-hover');});
    if(window.LevelUp3D&&window.LevelUp3D.setHoveredLayZone) window.LevelUp3D.setHoveredLayZone(null);
    if(window.LevelUp3D&&window.LevelUp3D.setDragTargets) window.LevelUp3D.setDragTargets(null);
    if(window.LevelUp3D&&window.LevelUp3D.setHandDragging) window.LevelUp3D.setHandDragging(false);
    if(ghost) ghost.remove();
    if(!dragging){ onCardClick(cardId); return; }
    if(layingActive){
      const dropTray=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.lay-tray');
      let targetIdx=dropTray?Number(dropTray.dataset.trayIndex):NaN;
      if(Number.isNaN(targetIdx)&&window.LevelUp3D&&window.LevelUp3D.pickLayZone){
        const zoneIdx=window.LevelUp3D.pickLayZone(ev.clientX,ev.clientY);
        if(zoneIdx!=null) targetIdx=zoneIdx;
      }
      layAssignment.forEach(g=>{const i=g.indexOf(cardId); if(i>=0) g.splice(i,1);});
      if(!Number.isNaN(targetIdx)&&layAssignment[targetIdx]) layAssignment[targetIdx].push(cardId);
      render();
      return;
    }
    // Outside laying mode, dropping directly on one of the highlighted spots
    // performs the action right away — a single-card hit on a meld, or a
    // discard on the pile — instead of requiring the separate select-then-
    // click-mode flow. Re-validated against dropTargets (computed once at
    // drag-start) rather than trusting elementFromPoint/pickMeld alone, so a
    // stale DOM/3D hit can't act on a target that was never actually shown
    // as legal.
    const dropMeld=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.meld-group[data-pid]');
    let meldMatch=null;
    if(dropMeld){
      const pid=dropMeld.dataset.pid, gi=Number(dropMeld.dataset.groupIndex);
      if(dropTargets.meldTargets.some(t=>t.pid===pid&&t.groupIndex===gi)) meldMatch={pid,groupIndex:gi};
    }
    if(!meldMatch&&window.LevelUp3D&&window.LevelUp3D.pickMeld){
      const hit=window.LevelUp3D.pickMeld(ev.clientX,ev.clientY);
      if(hit&&dropTargets.meldTargets.some(t=>t.pid===hit.pid&&t.groupIndex===hit.groupIndex)) meldMatch=hit;
    }
    if(meldMatch){
      performHit(meldMatch.pid,meldMatch.groupIndex,[cardId],()=>{ selectedIds=new Set(); uiMode='idle'; render(); });
      return;
    }
    if(dropTargets.discard&&window.LevelUp3D&&window.LevelUp3D.pickPile&&window.LevelUp3D.pickPile(ev.clientX,ev.clientY)==='discard'){
      act('discard',{cardId});
      selectedIds=new Set(); render();
      return;
    }
    // Dropped somewhere without a valid target: in manual sort mode, treat a
    // mostly-horizontal drag as "nudge this card N slots left/right" instead
    // of a plain no-op (Nutzerwunsch: "selbst sortieren können"). Scoped to
    // !layingActive because that branch already returns above and consumes
    // the whole gesture for tray assignment.
    if(handSortMode==='manual'){
      const shift=Math.round((ev.clientX-startX)/MANUAL_REORDER_SLOT_PX);
      const idx=handOrder.indexOf(cardId);
      if(shift&&idx>=0){
        const newIdx=Math.max(0,Math.min(handOrder.length-1,idx+shift));
        if(newIdx!==idx){ handOrder.splice(idx,1); handOrder.splice(newIdx,0,cardId); render(); }
      }
    }
  }
  window.addEventListener('pointermove',onMove);
  window.addEventListener('pointerup',onUp,{once:true});
}

function renderLevelRulesList(){
  const ol=$('levelRulesList'); if(!ol) return;
  const me=myPlayer();
  ol.innerHTML='';
  for(let i=1;i<=10;i++){
    const li=document.createElement('li');
    if(me&&state.phase==='playing'&&i<me.level) li.classList.add('done');
    li.innerHTML=`<strong>${tr('levelup.levelLabel',{n:i},'Level '+i)}:</strong> ${esc(tr('levelup.levelDesc.'+i,{},''))}`;
    ol.appendChild(li);
  }
}

function renderPlayersList(){
  const box=$('playersList'); if(!box) return;
  box.innerHTML='';
  // Players still on the character-select screen (confirmed:false) occupy a
  // real slot in state.players (see addPlayer) but shouldn't visibly appear
  // in anyone else's lobby until they confirm — doStartGame() strips them
  // before dealing, so this filter is a no-op once phase==='playing'.
  state.players.filter(p=>p.confirmed!==false).forEach((p,idx)=>{
    const item=document.createElement('div');
    item.className='item'+(state.phase==='playing'&&idx===state.turnIndex?' active':'');
    const row1=document.createElement('div'); row1.className='row1';
    const charEmoji=characterById(p.character)?.emoji||'';
    row1.innerHTML=`<span>${charEmoji?esc(charEmoji)+' ':''}${esc(p.name)}${p.id===clientId?' '+esc(tr('levelup.you',{},'(Du)')):''}${p.id===state.hostId?' 👑':''}</span><span>${p.score}</span>`;
    const row2=document.createElement('div'); row2.className='row2';
    row2.innerHTML=`<span>${esc(tr('levelup.levelOf',{cur:Math.min(p.level,10)},'Level '+p.level+' von 10'))}</span><span>${p.hand?p.hand.length:0}🂠</span>`;
    const track=document.createElement('div'); track.className='level-track';
    for(let i=1;i<=10;i++){
      const dot=document.createElement('div');
      dot.className='level-dot'+(i<p.level?' done':i===p.level?' current':'');
      track.appendChild(dot);
    }
    item.appendChild(row1); item.appendChild(row2); item.appendChild(track);
    box.appendChild(item);
  });
}

function onCardClick(cardId){
  if(uiMode==='laying'){
    const cur=layAssignment.findIndex(g=>g.includes(cardId));
    layAssignment.forEach(g=>{const i=g.indexOf(cardId); if(i>=0) g.splice(i,1);});
    const next=cur+1;
    if(next<layAssignment.length) layAssignment[next].push(cardId);
    render();
  } else {
    // Single-select everywhere outside laying mode (Nutzerwunsch): picking a
    // new card always replaces whatever was selected before, in idle mode
    // AND in hitting/"Anlegen" mode alike — tapping card B after card A
    // leaves just B selected, never both. This used to be a toggle-ADD in
    // hitting mode (to allow selecting 2 cards for a single multi-card
    // attach), but the user explicitly asked for replace-on-new-selection
    // instead, so that capability is intentionally gone now — attaching
    // still works fine one card at a time (repeat the drag/tap-then-Anlegen
    // flow per card).
    if(selectedIds.has(cardId)) selectedIds.delete(cardId);
    else selectedIds=new Set([cardId]);
    render();
  }
}

function renderTableMelds(){
  const box=$('tableMelds'); box.innerHTML='';
  state.players.forEach(p=>{
    const groups=state.table[p.id];
    const hasMelds=groups&&groups.length;
    if(!hasMelds&&!p.pendingSkipCard) return;
    const row=document.createElement('div'); row.className='meld-row';
    const owner=document.createElement('span'); owner.className='meld-owner'; owner.textContent=p.name;
    row.appendChild(owner);
    // A pending skip card stays visible in front of its target here (not
    // just an invisible flag) so everyone can see the card was already
    // played and this player's next turn is spoken for.
    if(p.pendingSkipCard){
      const gd=document.createElement('div'); gd.className='meld-group skip-pending';
      gd.title=tr('levelup.pendingSkip',{},'Setzt nächste Runde aus');
      gd.appendChild(cardChip(p.pendingSkipCard));
      row.appendChild(gd);
    }
    if(hasMelds) groups.forEach((g,gi)=>{
      const gd=document.createElement('div'); gd.className='meld-group';
      gd.dataset.pid=p.id; gd.dataset.groupIndex=String(gi);
      if(uiMode==='hitting'){ gd.classList.add('hittable'); gd.onclick=()=>onMeldClick(p.id,gi); }
      g.cards.forEach(c=>gd.appendChild(cardChip(c)));
      row.appendChild(gd);
    });
    box.appendChild(row);
  });
}
function onMeldClick(targetId,groupIndex){
  if(!selectedIds.size){ toast(tr('levelup.msg.pickCardsFirst',{},'Erst Karten auswählen')); return; }
  performHit(targetId,groupIndex,[...selectedIds],()=>{ selectedIds=new Set(); uiMode='idle'; render(); });
}

function renderLayTrayBox(){
  const box=$('layTrayBox'); const me=myPlayer();
  const active=uiMode==='laying';
  box.classList.toggle('hidden',!active);
  if(!active||!me) return;
  const req=LEVELS[me.level-1];
  const trays=$('layTrays'); trays.innerHTML='';
  let allValid=true; let totalAssigned=0;
  req.forEach((r,i)=>{
    const tray=document.createElement('div'); tray.className='lay-tray'; tray.dataset.trayIndex=String(i);
    const label=document.createElement('div'); label.className='lay-tray-label';
    label.textContent=String.fromCharCode(65+i)+' · '+reqLabel(r);
    const cardsDiv=document.createElement('div'); cardsDiv.className='lay-tray-cards';
    const ids=layAssignment[i]||[];
    const cards=ids.map(id=>me.hand.find(c=>c.id===id)).filter(Boolean);
    cards.forEach(c=>cardsDiv.appendChild(cardChip(c,true)));
    totalAssigned+=ids.length;
    const resolved=ids.length>=r.count&&resolveGroup(cards,r);
    tray.classList.toggle('valid',!!resolved);
    if(!resolved) allValid=false;
    tray.appendChild(label); tray.appendChild(cardsDiv);
    trays.appendChild(tray);
  });
  // House rule: a turn always ends by discarding, so laying down may never
  // claim the entire hand — see the matching server-side check in
  // doLayDown(). Surfaced as its own warning (not just a disabled button)
  // because the trays themselves can all look individually "valid" here.
  const keepsCard=totalAssigned<me.hand.length;
  if(!keepsCard) allValid=false;
  $('layTrayWarn').classList.toggle('hidden',keepsCard);
  $('layConfirmBtn').disabled=!allValid;
}

function renderActionBar(){
  const me=myPlayer(); if(!me) return;
  const canAct=isMyTurn()&&state.phase==='playing'&&!state.pendingSkip;
  const top=state.discard[state.discard.length-1];
  $('drawDeckBtn').disabled=!(canAct&&!state.hasDrawn);
  $('drawDiscardBtn').disabled=!(canAct&&!state.hasDrawn)||!top||top.type==='skip';
  $('layDownBtn').disabled=!(canAct&&state.hasDrawn&&!me.laidThisRound)||uiMode==='laying';
  $('hitModeBtn').disabled=!(canAct&&state.hasDrawn&&me.laidThisRound);
  $('hitModeBtn').classList.toggle('mode-on',uiMode==='hitting');
  $('discardBtn').disabled=!(canAct&&state.hasDrawn)||uiMode==='laying'||selectedIds.size!==1;
  $('hitHint').textContent=uiMode==='hitting'?tr('levelup.hitHint',{},'Handkarten wählen, dann eine Gruppe antippen'):'';
  $('actionHint').textContent=actionHintText(me,canAct);
}

// Tells the player in plain language what to do right now, since the action
// buttons alone don't explain *why* something is disabled (e.g. "Discard"
// only lights up once you've drawn AND selected exactly one card — a rule a
// new player has no way to infer just from a grayed-out button).
function actionHintText(me,canAct){
  if(!canAct||state.pendingSkip) return '';
  if(!state.hasDrawn) return tr('levelup.hint.draw',{},'Ziehe eine Karte oder nimm die Ablage, um deinen Zug zu beginnen.');
  if(uiMode==='laying') return tr('levelup.hint.laying',{},'Ordne deine Handkarten unten den Gruppen zu.');
  if(uiMode==='hitting') return tr('levelup.hint.hitting',{},'Wähle Handkarten und tippe dann eine Gruppe auf dem Tisch an.');
  if(selectedIds.size===1) return tr('levelup.hint.oneSelected',{},'1 Karte gewählt — jetzt ablegen, oder Level auslegen/anlegen.');
  if(selectedIds.size>1) return tr('levelup.hint.multiSelected',{},'Mehrere Karten gewählt — zum Anlegen auf „Anlegen“ tippen.');
  if(!me.laidThisRound) return tr('levelup.hint.idleBeforeLaid',{},'Wähle eine Karte zum Ablegen, oder lege dein Level aus.');
  return tr('levelup.hint.idleAfterLaid',{},'Wähle eine Karte zum Ablegen, oder Karten zum Anlegen.');
}

function buildSyncPayload(){
  const me=myPlayer();
  return {
    players: state.players.map((p,idx)=>({id:p.id,name:p.name,level:p.level,handCount:p.hand.length,active:state.phase==='playing'&&idx===state.turnIndex,isMe:p.id===clientId,pendingSkipCard:p.pendingSkipCard||null,character:p.character||null,seat:p.seat||defaultSeatFor(p.character)})),
    drawCount: state.deck.length,
    discardTopCard: state.discard[state.discard.length-1]||null,
    table: state.table,
    myHand: me?sortHand(me.hand):[],
    uiMode,
    selectedIds: [...selectedIds],
    layAssignment,
    lastEvent: state.lastEvent||null
  };
}

function renderGame(){
  const me=myPlayer(); if(!me) return;
  const cur=currentPlayer();
  if(!cur||cur.id!==clientId){ uiMode='idle'; }
  $('turnBanner').textContent=cur&&cur.id===clientId?tr('levelup.turn.yours',{},'Du bist am Zug'):tr('levelup.turn.other',{name:cur?cur.name:''},(cur?cur.name:'')+' ist am Zug');
  $('turnBanner').classList.toggle('mine',!!cur&&cur.id===clientId);
  $('scorePill').textContent=me.score;
  $('handLabel').textContent=tr('levelup.yourHand',{},'Deine Hand')+' · '+tr('levelup.levelOf',{cur:me.level},'Level '+me.level+' von 10');
  document.querySelectorAll('#sortToggle .sort-btn').forEach(b=>b.classList.toggle('active',b.dataset.sort===handSortMode));
  renderTableMelds();
  renderLayTrayBox();
  renderActionBar();
  if(window.LevelUp3D) window.LevelUp3D.sync(buildSyncPayload());
  syncHitHighlight();
}

function renderRoundEnd(){
  if(!state.roundSummary) return;
  const box=$('roundScores'); box.innerHTML='';
  state.roundSummary.slice().sort((a,b)=>a.total-b.total).forEach(s=>{
    const li=document.createElement('li');
    li.innerHTML=`<span>${esc(s.name)}${s.leveledUp?' ⬆️':''}</span><span>+${s.delta} = <strong>${s.total}</strong></span>`;
    box.appendChild(li);
  });
  const btn=$('nextRoundBtn'); btn.disabled=state.hostId!==clientId;
}
function renderGameOver(){
  const winner=state.players.find(p=>p.id===state.winner);
  $('winnerName').textContent=winner?winner.name:'';
  const list=$('finalScores'); list.innerHTML='';
  (state.finalScores||[]).forEach((s,i)=>{
    const li=document.createElement('li'); if(s.id===state.winner) li.classList.add('gold');
    li.innerHTML=`<span>#${i+1} ${esc(s.name)}</span><span>${s.total} · Lv${s.level}</span>`;
    list.appendChild(li);
  });
  const btn=$('rematchBtn'); btn.disabled=state.hostId!==clientId;
}
function renderSkipOverlay(){
  const ov=$('skipPickOverlay'); const me=myPlayer();
  const showFor=state.pendingSkip&&state.pendingSkip.by===clientId&&me&&!me.isBot;
  if(!showFor){ ov.setAttribute('hidden',''); return; }
  ov.removeAttribute('hidden');
  const box=$('skipTargets'); box.innerHTML='';
  // Only players without an already-pending skip are offered — only one
  // Aussetzen-card may lie in front of a player at a time (see
  // eligibleSkipTargets()); it falls back to everyone else if all of them
  // already have one, so this never renders an empty list.
  eligibleSkipTargets(clientId).forEach(p=>{
    const b=document.createElement('button'); b.type='button'; b.className='skip-target-btn';
    // Phase + hand count alongside the name so the choice of who to skip can
    // be strategic (e.g. target whoever is closest to going out) instead of
    // a blind pick by name alone.
    const nameEl=document.createElement('span'); nameEl.className='skip-target-name'; nameEl.textContent=p.name;
    const metaEl=document.createElement('span'); metaEl.className='skip-target-meta';
    metaEl.textContent=tr('levelup.levelOf',{cur:Math.min(p.level,10)},'Level '+p.level+' von 10')+' · '+(p.hand?p.hand.length:0)+'🂠';
    b.appendChild(nameEl); b.appendChild(metaEl);
    b.onclick=()=>{ act('skipTarget',{targetId:p.id}); ov.setAttribute('hidden',''); };
    box.appendChild(b);
  });
}
function renderLog(){
  const box=$('logList'); if(!box) return;
  const log=state.log||[];
  const nearBottom=box.scrollTop+box.clientHeight>=box.scrollHeight-30;
  if(!log.length){
    box.innerHTML=`<div class="log-empty muted">${esc(tr('levelup.log.empty',{},'Noch keine Züge'))}</div>`;
    return;
  }
  box.innerHTML='';
  log.forEach(entry=>{
    const li=document.createElement('div'); li.className='log-entry';
    li.textContent=tr('levelup.log.'+entry.key,entry.vars,entry.key);
    box.appendChild(li);
  });
  if(nearBottom) box.scrollTop=box.scrollHeight;
}
function updateInvite(){
  if(!state.room) return;
  const url=new URL(location.href); url.searchParams.set('room',state.room);
  const inv=$('inviteInput'); if(inv) inv.value=url.toString();
}

function render(){
  $('roomOut').textContent=state.room||'—';
  $('phaseOut').textContent=phaseLabel();
  // Character select is local UI state independent of state.phase (it runs
  // before create/join, and while peeking a join target, state.phase gets
  // overwritten by whatever that room's ACTUAL phase is — see peekConnect).
  // Every phase-driven panel below is gated off while it's active, so a peek
  // into an already-started game can never show gameStage bleeding through
  // underneath the character grid.
  const inChar=charSelectActive;
  showIn('menuBox',state.phase==='menu'&&!inChar);
  showIn('charSelectStage',inChar);
  showIn('lobbyBox',state.phase==='lobby'&&role==='host'&&!inChar);
  showIn('menuHero',(state.phase==='menu'||state.phase==='lobby')&&!inChar);
  showIn('gameStage',state.phase==='playing'&&!inChar);
  showIn('roundEndBox',state.phase==='roundEnd'&&!inChar);
  showIn('gameOverBox',state.phase==='gameOver'&&!inChar);
  if(inChar) renderCharSelect();
  if(state.phase==='lobby'&&!inChar) updateInvite();
  if(state.phase==='playing'&&!inChar) renderGame();
  if(state.phase==='roundEnd'&&!inChar) renderRoundEnd();
  if(state.phase==='gameOver'&&!inChar) renderGameOver();
  renderPlayersList();
  renderLog();
  renderLevelRulesList();
  renderSkipOverlay();
}

// ===== wiring =====
$('modeCreateTab').onclick=()=>setMenuMode('create');
$('modeJoinTab').onclick=()=>setMenuMode('join');
$('copyBtn').onclick=()=>{ updateInvite(); $('inviteInput').select(); try{document.execCommand('copy');}catch(e){} navigator.clipboard?.writeText($('inviteInput').value).catch(()=>{}); toast(tr('levelup.msg.linkCopied',{},'Link kopiert')); };
$('startBtn').onclick=()=>act('startGame',{botCount:Number($('botCountInput').value)||0});
$('publicRoomCheck').onchange=()=>{ state.publicRoom=$('publicRoomCheck').checked; if(role==='host') persist(); };
$('publicRoomsItems').addEventListener('click',e=>{ const row=e.target.closest('.public-room-row'); if(!row) return; $('roomInput').value=row.dataset.room; openCharSelect(false); });
$('charBackBtn').onclick=closeCharSelect;
$('charConfirmBtn').onclick=confirmCharSelect;
$('drawDeckBtn').onclick=()=>act('draw',{source:'deck'});
$('drawDiscardBtn').onclick=()=>act('draw',{source:'discard'});
$('layDownBtn').onclick=()=>{ const me=myPlayer(); if(!me) return; uiMode='laying'; layAssignment=LEVELS[me.level-1].map(()=>[]); render(); $('layTrayBox').scrollIntoView({behavior:'smooth',block:'nearest'}); };
$('layCancelBtn').onclick=()=>{ uiMode='idle'; layAssignment=[]; render(); };
$('layConfirmBtn').onclick=()=>{ act('layDown',{groups:layAssignment}); uiMode='idle'; layAssignment=[]; render(); };
// Turning hitting mode ON deliberately keeps whatever was already selected
// (Nutzerwunsch): if a card was tapped in idle mode before the "Anlegen"
// button, that's taken as "I want to attach this" rather than being wiped —
// renderTableMelds()/renderGame() then highlight the groups it could attach
// to. Turning it back OFF (second click while already hitting) does clear
// the selection, since that's the player backing out of attaching.
$('hitModeBtn').onclick=()=>{
  if(uiMode==='hitting'){ uiMode='idle'; selectedIds=new Set(); }
  else { uiMode='hitting'; }
  render();
};
document.querySelectorAll('#sortToggle .sort-btn').forEach(b=>{
  b.onclick=()=>{
    const newMode=b.dataset.sort;
    // Switching TO manual should pick up right where the previous sort left
    // off, not jump to raw deal order (Nutzerwunsch: cards were getting
    // shuffled on switch). sortHand() still reads the OLD handSortMode here
    // (it hasn't changed yet), so this captures exactly what's on screen
    // right now — handOrder then starts as that order, and manual mode's own
    // sortHand() branch (ids-not-in-handOrder-append-at-end) leaves it
    // untouched since every current card id is already accounted for.
    if(newMode==='manual'&&handSortMode!=='manual'){
      const me=myPlayer();
      if(me) handOrder=sortHand(me.hand).map(c=>c.id);
    }
    handSortMode=newMode;
    try{localStorage.setItem('lu.sort',handSortMode);}catch(e){}
    render();
  };
});
$('discardBtn').onclick=()=>{ if(selectedIds.size!==1) return; act('discard',{cardId:[...selectedIds][0]}); selectedIds=new Set(); render(); };
$('nextRoundBtn').onclick=()=>act('nextRound',{});
$('rematchBtn').onclick=()=>act('rematch',{});

// Two independent "make the table view bigger" toggles (user-requested).
// "Ansicht füllen" is a CSS-only stretch to the browser viewport (chrome
// stays visible); it reparents #gameStage to document.body while active
// because position:fixed inside main.card (which sets backdrop-filter)
// would otherwise be scoped to that ancestor's box, not the real viewport
// (see Stolperfallen in CLAUDE.md). Real fullscreen is requested on
// <html>, not #gameStage — the skip-target/run-side/game-confirm overlays
// are siblings of .app directly under <body>, so fullscreening only
// #gameStage would render on top of the whole page and hide those dialogs.
(function(){
  const expandBtn=$('expandViewBtn'), fsBtn=$('fullscreenBtn'), stage=$('gameStage');
  let expandAnchor=null;
  function setExpanded(on){
    if(on){
      if(stage.parentElement!==document.body){
        expandAnchor=document.createComment('gameStage-anchor');
        stage.parentElement.insertBefore(expandAnchor,stage);
        document.body.appendChild(stage);
      }
      stage.classList.add('view-expanded');
    } else {
      stage.classList.remove('view-expanded');
      if(expandAnchor&&expandAnchor.parentElement){ expandAnchor.parentElement.insertBefore(stage,expandAnchor); expandAnchor.remove(); }
      expandAnchor=null;
    }
    expandBtn.setAttribute('aria-pressed',on?'true':'false');
  }
  expandBtn.onclick=()=>setExpanded(!stage.classList.contains('view-expanded'));
  window.addEventListener('keydown',e=>{ if(e.key==='Escape'&&stage.classList.contains('view-expanded')) setExpanded(false); });

  const reqFsFn=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
  if(!reqFsFn){ fsBtn.style.display='none'; }
  else {
    const isFs=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
    fsBtn.onclick=()=>{
      if(isFs()) (document.exitFullscreen||document.webkitExitFullscreen).call(document);
      else reqFsFn.call(document.documentElement);
    };
    const syncFsBtn=()=>fsBtn.setAttribute('aria-pressed',isFs()?'true':'false');
    document.addEventListener('fullscreenchange',syncFsBtn);
    document.addEventListener('webkitfullscreenchange',syncFsBtn);
  }
})();
$('nameInput').value=localStorage.getItem('lu.name')||'';
$('hostNameInput').value=$('nameInput').value||'Host';
$('nameInput').addEventListener('input',()=>{try{localStorage.setItem('lu.name',$('nameInput').value);}catch(e){}});

window.addEventListener('brettspiele-language-change',render);

if(window.LevelUp3D&&$('tableCanvas')) window.LevelUp3D.mount($('tableCanvas'));

// Hand cards live in the 3D scene (Tabletop-Simulator-style fan docked to
// the bottom of the table view) instead of a DOM row, so picking which card
// was pressed goes through a raycast (LevelUp3D.pickHandCard) instead of a
// per-element onpointerdown — everything downstream (tap-to-select vs.
// drag-to-lay-down) is the same startCardDrag() used for lay-tray chips.
$('tableCanvas').addEventListener('pointerdown',e=>{
  if(state.phase!=='playing'||!window.LevelUp3D) return;
  const cardId=window.LevelUp3D.pickHandCard(e.clientX,e.clientY);
  if(cardId){ startCardDrag(e,cardId); return; }
  // A card already assigned to a lay-down tray is rendered resting on its
  // on-table zone plate instead of in the hand fan (see buildHandFan in
  // game.render3d.js) — picking it back up to move it to a DIFFERENT tray
  // goes through this raycast instead of pickHandCard.
  const zoneCardId=window.LevelUp3D.pickLayZoneCard?window.LevelUp3D.pickLayZoneCard(e.clientX,e.clientY):null;
  if(zoneCardId){ startCardDrag(e,zoneCardId); return; }
  // Clicking the draw pile or discard pile directly in the 3D scene draws
  // from it — same rules/validation as the drawDeckBtn/drawDiscardBtn
  // buttons (mirrored here so an invalid click just silently does nothing,
  // like a disabled button would, instead of round-tripping to the host for
  // a rejection toast).
  const pileHit=window.LevelUp3D.pickPile?window.LevelUp3D.pickPile(e.clientX,e.clientY):null;
  if(!pileHit) return;
  const canDraw=isMyTurn()&&!state.hasDrawn&&!state.pendingSkip;
  if(!canDraw) return;
  if(pileHit==='discard'){
    const top=state.discard[state.discard.length-1];
    if(!top||top.type==='skip') return;
  }
  act('draw',{source:pileHit});
});

if(params.get('room')){ $('roomInput').value=params.get('room').toUpperCase(); setMenuMode('join'); } else setMenuMode('create');
(function(){
  const sess=getSavedSession();
  if(sess&&sess.room){
    role=sess.role||'guest'; hasCreatedRoom=true;
    state.phase='lobby'; stopPublicRoomsPolling();
    reconnectTimer=setTimeout(()=>{ reconnectTimer=null; state=initialState(); clearSession(); render(); },15000);
    connect(sess.room);
  }
  render();
})();
})();
