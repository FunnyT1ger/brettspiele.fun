/* Lacuna — eigenstaendiges Stichspiel um eine sich verschiebende Zahlenluecke.
   Host-autoritatives WS-Snapshot-Muster identisch zu blank-frech/rollforge/
   levelup: der Host haelt den kompletten `state`, jede Aktion mutiert ihn
   lokal und broadcastet danach den ganzen Snapshot; Gaeste sind reine
   Renderer, die ihren lokalen `state` bei jedem Snapshot komplett ersetzen.

   Regelkern (siehe CLAUDE.md fuer die vollstaendige Herleitung aus der
   offiziellen Anleitung):
   - Jede Karte ist einfach ihr Zahlenwert 0..(N+1)*10-1 (N=Spielerzahl),
     eindeutig, keine Farbe im Sinn eines Kartenspiels — nur eine kosmetische
     "Dekade" (Math.floor(v/10)) fuer die Kartenfarbe in der UI.
   - Ein Stich beginnt mit zwei PFLICHT-Rahmenkarten (playsCount 0 und 1,
     beliebiger Wert). Ab der 3. Karte ist Passen erlaubt; jede weitere Karte
     muss entweder strikt zwischen den beiden Rahmenwerten liegen, eine
     Doppelziffer sein (immer erlaubt) oder ein Fuenfer sein, der statt in
     die Luecke auf eine Rahmenkarte gelegt wird (verschiebt den Rahmen).
   - Zehner geben beim Ausspielen sofort +1 Punkt für den Stich, kosten aber
     am Rundenende Minuspunkte, wenn sie noch auf der Hand liegen.
   - Wer zuletzt eine Karte spielt, bevor alle uebrigen aktiven Spieler
     passen, gewinnt den Stich. Wer zuerst leer ist, bekommt die Lacuna-Marke
     (+1) und beendet die Runde (der laufende Stich wird noch fertig
     gespielt). Ab 20 Punkten endet das Spiel, die hoechste Punktzahl
     gewinnt.
*/
(function(){
'use strict';
const GAME='lacuna';
const WIN_SCORE=20;
const $=id=>document.getElementById(id);
const clientId=sessionStorage.getItem('lc.clientId') || (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()));
sessionStorage.setItem('lc.clientId',clientId);
let role='guest', ws=null, joinTimer=null, hasCreatedRoom=false, reconnectTimer=null, _botTimer=null;
const params=new URLSearchParams(location.search);
const I18N=window.BFI18N||null;
const tr=(key,vars={},fallback='')=>I18N?.t(key,vars,fallback)??(fallback||key);

// ===== characters (meeple selection) =====
// One real GLB model per entry (game.render3d.js loads+caches models/<file>
// and clones it both for the char-select preview and the seated table
// avatar), plus an emoji fallback used in the compact players-list row and
// as a safety net if a model somehow fails to load. `id` is also the i18n
// key suffix under lacuna.char.*. Same 20 meeples as levelup (generic
// adventure/fantasy figures, not tied to any one game's theme) — models
// copied byte-for-byte into this game's own models/ folder.
const CHARACTERS=[
  {id:'zauberer',emoji:'🧙'},{id:'roboter',emoji:'🤖'},{id:'pirat',emoji:'🏴‍☠️'},
  {id:'astronaut',emoji:'🧑‍🚀'},{id:'koch',emoji:'👨‍🍳'},{id:'ninja',emoji:'🥷'},
  {id:'wikinger',emoji:'🛡️'},{id:'ritter',emoji:'⚔️'},{id:'cowgirl',emoji:'🤠'},
  {id:'alien',emoji:'👽'},{id:'detektiv',emoji:'🕵️'},{id:'taucher',emoji:'🤿'},
  {id:'koenigin',emoji:'👸'},{id:'rockstar',emoji:'🎸'},{id:'feuerwehr',emoji:'🧑‍🚒'},
  {id:'yeti',emoji:'🦣'},{id:'pharao',emoji:'🏺'},{id:'pilot',emoji:'🧑‍✈️'},
  {id:'vampir',emoji:'🧛'},{id:'superheldin',emoji:'🦸‍♀️'}
];
function characterById(id){ return CHARACTERS.find(c=>c.id===id)||null; }
function randomCharacterId(){ return CHARACTERS[Math.floor(Math.random()*CHARACTERS.length)].id; }

// ===== seats (chair selection) =====
// Six GLB chairs (game.render3d.js loads+caches models/<file>, same
// duplication pattern as CHARACTERS above). Each character gets a
// thematically fitting default (CHAR_DEFAULT_SEAT) but the player can still
// override it in char-select (see selectSeat/pendingSeat). Same shared asset
// set as levelup's SEATS (generic chairs, not tied to any one game's theme).
const SEATS=[
  {id:'holzstuhl',emoji:'🪑'},{id:'thron',emoji:'👑'},{id:'technik',emoji:'🛰️'},
  {id:'fass',emoji:'🛢️'},{id:'hocker',emoji:'🪵'},{id:'baumstumpf',emoji:'🌳'}
];
function seatById(id){ return SEATS.find(s=>s.id===id)||null; }
const CHAR_DEFAULT_SEAT={
  zauberer:'baumstumpf', roboter:'technik', pirat:'fass', astronaut:'technik', koch:'holzstuhl',
  ninja:'baumstumpf', wikinger:'fass', ritter:'holzstuhl', cowgirl:'hocker', alien:'technik',
  detektiv:'holzstuhl', taucher:'fass', koenigin:'thron', rockstar:'thron', feuerwehr:'holzstuhl',
  yeti:'baumstumpf', pharao:'thron', pilot:'technik', vampir:'thron', superheldin:'technik'
};
function defaultSeatFor(characterId){ return CHAR_DEFAULT_SEAT[characterId]||SEATS[0].id; }

let pendingCharacter=localStorage.getItem('lc.character')||CHARACTERS[0].id;
let pendingSeat=defaultSeatFor(pendingCharacter);
let pendingCreate=true, pendingRoom='';
let charSelectActive=false, peeking=false;
let charThumbCache=null;

// ===== card helpers =====
function fmtCard(v){ return String(v).padStart(2,'0'); }
function isTen(v){ return v%10===0; }
function isFive(v){ return v%10===5; }
function isDouble(v){ return v%11===0; }
function buildDeck(playerCount){
  const top=(playerCount+1)*10;
  const cards=[];
  for(let v=0;v<top;v++) cards.push(v);
  return cards;
}
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

function currentRange(trick){
  if(!trick||trick.rangeCards.length<2) return null;
  const a=trick.rangeCards[0].value, b=trick.rangeCards[1].value;
  return {lo:Math.min(a,b), hi:Math.max(a,b)};
}
function legalPlain(trick,v){
  if(trick.playsCount<2) return true;
  if(isDouble(v)) return true;
  const r=currentRange(trick);
  return !!r && v>r.lo && v<r.hi;
}
function legalOverlay(trick,v){
  if(trick.playsCount<2) return false;
  if(!isFive(v)) return false;
  if(v===55) return true;
  const r=currentRange(trick);
  return !!r && v>r.lo && v<r.hi;
}
function cardOptions(trick,v){ return { plain: legalPlain(trick,v), overlay: legalOverlay(trick,v) }; }

// ===== state =====
function initialState(){
  return {
    room:'', phase:'menu', publicRoom:false,
    players:[], hostId:null, turnOrder:[],
    dealerId:null, roundNumber:0,
    hands:{}, stockCount:0,
    trick:null, roundPoints:{}, markerTakenBy:null, roundEndingPending:false,
    trickResult:null, readyAck:null,
    scores:{}, lastRoundBreakdown:null, finalWinnerIds:null,
    log:[]
  };
}
let state=initialState();

function nameOf(pid){ const p=state.players.find(x=>x.id===pid); return p?p.name:'?'; }
function isHostActor(id){ return id===state.hostId; }
function pushLog(key,vars){ const id=state.log.length?state.log[state.log.length-1].id+1:1; state.log.push({id,key,vars:vars||{}}); if(state.log.length>80) state.log.shift(); }
function nextInOrder(pid){ const order=state.turnOrder; const i=order.indexOf(pid); return order[(i+1)%order.length]; }

function newTrick(firstPid){
  return { rangeCards:[], extraCards:[], points:1, playsCount:0, passed:{}, currentPid:firstPid, lastPlayerId:null, finished:false, winnerId:null, markerTakenBy:null };
}
function isEligible(trick,pid){ return (state.hands[pid]||[]).length>0 && !trick.passed[pid]; }
function advanceAfterAction(trick,actedPid){
  const eligible=state.turnOrder.filter(pid=>isEligible(trick,pid));
  // The trick only truly ends once nobody is left who could still respond.
  // If exactly one player remains eligible and it's the one who just acted,
  // nobody else CAN challenge them — they win uncontested. But if that one
  // remaining eligible player is somebody else (the actor just ran out of
  // cards), that player hasn't had their turn yet and must still get one —
  // ending here instead would rob them of a legitimate play/pass.
  if(eligible.length===0){ trick.finished=true; trick.winnerId=trick.lastPlayerId; return; }
  if(eligible.length===1 && eligible[0]===actedPid){ trick.finished=true; trick.winnerId=actedPid; return; }
  const order=state.turnOrder; const i=order.indexOf(actedPid);
  for(let step=1; step<=order.length; step++){
    const cand=order[(i+step)%order.length];
    if(isEligible(trick,cand)){ trick.currentPid=cand; return; }
  }
  trick.finished=true; trick.winnerId=trick.lastPlayerId;
}

function startRound(){
  const order=state.turnOrder, n=order.length;
  const deck=shuffle(buildDeck(n));
  state.hands={};
  order.forEach(pid=>{ state.hands[pid]=deck.splice(0,10).sort((a,b)=>a-b); });
  state.stockCount=deck.length;
  state.roundNumber=(state.roundNumber||0)+1;
  state.roundPoints={}; order.forEach(pid=>state.roundPoints[pid]=0);
  state.markerTakenBy=null; state.roundEndingPending=false; state.lastRoundBreakdown=null;
  const firstPid=nextInOrder(state.dealerId);
  state.trick=newTrick(firstPid);
  pushLog('lacuna.log.roundStart',{n:state.roundNumber,name:nameOf(state.dealerId)});
}

// A player who's not eligible for the rest of this trick is either out of
// cards or has passed — used to explain "why" in the trick-end overlay.
function trickDropReasons(trick,winner){
  const reasons={};
  state.turnOrder.forEach(pid=>{
    if(pid===winner) return;
    if((state.hands[pid]||[]).length===0) reasons[pid]='empty';
    else if(trick.passed[pid]) reasons[pid]='passed';
  });
  return reasons;
}
function resolveTrickIfFinished(){
  const trick=state.trick;
  if(!trick.finished) return;
  const winner=trick.winnerId;
  if(winner){
    state.roundPoints[winner]=(state.roundPoints[winner]||0)+trick.points;
    pushLog('lacuna.log.trickWon',{name:nameOf(winner),points:trick.points});
  }
  // Pause here with an ack-gated overlay (see doAckTrick) instead of moving
  // straight to the next trick/round — every human player must confirm they
  // saw who won (and why) before play continues. Bots can't click a button,
  // so they're pre-acked below.
  const ack={};
  state.turnOrder.forEach(pid=>{
    const p=state.players.find(x=>x.id===pid);
    if(p&&p.isBot) ack[pid]=true;
  });
  state.trickResult={
    winnerId:winner, points:trick.points,
    reasons: winner?trickDropReasons(trick,winner):{},
    markerPid: trick.markerTakenBy||null,
    nextAction: state.roundEndingPending?'finishRound':'newTrick',
    ack
  };
}
function doAckTrick(actorId){
  if(!state.trickResult) return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  if(!state.turnOrder.includes(actorId)) return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  state.trickResult.ack[actorId]=true;
  if(state.turnOrder.every(pid=>state.trickResult.ack[pid])){
    const {nextAction,winnerId}=state.trickResult;
    state.trickResult=null;
    if(nextAction==='finishRound') finishRound();
    else if(winnerId) state.trick=newTrick(winnerId);
  }
  return {ok:true};
}

function finishRound(){
  const breakdown={};
  state.turnOrder.forEach(pid=>{
    const tens=(state.hands[pid]||[]).filter(isTen).length;
    const marker=pid===state.markerTakenBy?1:0;
    const trickPts=state.roundPoints[pid]||0;
    const total=trickPts+marker-tens;
    breakdown[pid]={trickPoints:trickPts,marker,tens,total};
    state.scores[pid]=(state.scores[pid]||0)+total;
  });
  state.lastRoundBreakdown=breakdown;
  pushLog('lacuna.log.roundEnd',{n:state.roundNumber});
  state.dealerId=state.markerTakenBy||nextInOrder(state.dealerId);
  const anyWon=state.turnOrder.some(pid=>(state.scores[pid]||0)>=WIN_SCORE);
  if(anyWon){
    const maxScore=Math.max(...state.turnOrder.map(pid=>state.scores[pid]||0));
    state.finalWinnerIds=state.turnOrder.filter(pid=>(state.scores[pid]||0)===maxScore);
    state.phase='gameOver';
  } else {
    state.phase='roundEnd';
  }
  // Everyone must confirm before play continues (see doReadyContinue); bots
  // can't click a button, so they're pre-acked, same pattern as trickResult.
  const ack={};
  state.turnOrder.forEach(pid=>{
    const p=state.players.find(x=>x.id===pid);
    if(p&&p.isBot) ack[pid]=true;
  });
  state.readyAck=ack;
}

// ===== mutators (host-only, called via applyAction or directly by bots) =====
function doPlay(actorId,value,placement){
  if(state.phase!=='playing') return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  const trick=state.trick;
  if(!trick||trick.finished||trick.currentPid!==actorId) return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  const hand=state.hands[actorId]||[];
  const idx=hand.indexOf(value);
  if(idx<0) return {ok:false,msgKey:'lacuna.msg.illegalCard'};
  let placement2=placement;
  if(trick.playsCount<2){
    placement2='plain';
  } else {
    const opts=cardOptions(trick,value);
    if(placement2==='plain'){ if(!opts.plain) return {ok:false,msgKey:'lacuna.msg.illegalCard'}; }
    else if(placement2==='overlayA'||placement2==='overlayB'){ if(!opts.overlay) return {ok:false,msgKey:'lacuna.msg.illegalCard'}; }
    else return {ok:false,msgKey:'lacuna.msg.illegalCard'};
  }
  hand.splice(idx,1);
  const cardObj={value,by:actorId};
  if(trick.playsCount===0){
    trick.rangeCards=[cardObj];
    pushLog('lacuna.log.range1',{name:nameOf(actorId),card:fmtCard(value)});
  } else if(trick.playsCount===1){
    trick.rangeCards.push(cardObj);
    pushLog('lacuna.log.range2',{name:nameOf(actorId),card:fmtCard(value)});
  } else if(placement2==='plain'){
    trick.extraCards.push(cardObj);
    pushLog('lacuna.log.play',{name:nameOf(actorId),card:fmtCard(value)});
  } else {
    const slot=placement2==='overlayA'?0:1;
    const old=trick.rangeCards[slot];
    trick.extraCards.push({value:old.value,by:old.by,demoted:true});
    trick.rangeCards[slot]=cardObj;
    pushLog('lacuna.log.overlay',{name:nameOf(actorId),card:fmtCard(value),old:fmtCard(old.value)});
  }
  if(isTen(value)) trick.points+=1;
  trick.playsCount++;
  trick.lastPlayerId=actorId;
  if(hand.length===0 && !state.markerTakenBy){
    state.markerTakenBy=actorId; state.roundEndingPending=true; trick.markerTakenBy=actorId;
    pushLog('lacuna.log.marker',{name:nameOf(actorId)});
  }
  advanceAfterAction(trick,actorId);
  resolveTrickIfFinished();
  return {ok:true};
}
function doPass(actorId){
  if(state.phase!=='playing') return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  const trick=state.trick;
  if(!trick||trick.finished||trick.currentPid!==actorId) return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  if(trick.playsCount<2) return {ok:false,msgKey:'lacuna.msg.mustPlayRange'};
  trick.passed[actorId]=true;
  pushLog('lacuna.log.pass',{name:nameOf(actorId)});
  advanceAfterAction(trick,actorId);
  resolveTrickIfFinished();
  return {ok:true};
}
function botName(n){ const names=['Nova','Rift','Void','Echo','Prisma']; return 'Bot '+names[(n-1)%names.length]; }
function doStartGame(actorId,botCount){
  if(!isHostActor(actorId)) return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  if(state.phase!=='lobby') return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
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
    state.players.push({id:'bot-'+n,name:botName(n),isBot:true,connected:true,character:char,seat:defaultSeatFor(char)});
  }
  if(state.players.length<2) return {ok:false,msgKey:'lacuna.msg.notEnoughPlayers'};
  state.turnOrder=state.players.map(p=>p.id);
  state.scores={}; state.turnOrder.forEach(pid=>state.scores[pid]=0);
  state.roundNumber=0; state.log=[];
  state.dealerId=state.turnOrder[Math.floor(Math.random()*state.turnOrder.length)];
  startRound();
  state.phase='playing';
  return {ok:true};
}
// Both "next round" and "rematch" now wait for every player to confirm
// (not just the host) — mirrors the ack-gated trick-end overlay pattern
// (see doAckTrick/state.trickResult.ack above).
function doReadyContinue(actorId){
  if(state.phase!=='roundEnd'&&state.phase!=='gameOver') return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  if(!state.turnOrder.includes(actorId)) return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  if(!state.readyAck) state.readyAck={};
  state.readyAck[actorId]=true;
  if(state.turnOrder.every(pid=>state.readyAck[pid])){
    const wasGameOver=state.phase==='gameOver';
    state.readyAck=null;
    if(wasGameOver){
      state.scores={}; state.turnOrder.forEach(pid=>state.scores[pid]=0);
      state.roundNumber=0; state.finalWinnerIds=null; state.log=[];
      state.dealerId=state.turnOrder[Math.floor(Math.random()*state.turnOrder.length)];
    }
    startRound(); state.phase='playing';
  }
  return {ok:true};
}
// `confirmed:false` means "occupies a slot but is still on the character-
// select screen" (see openCharSelect/joinRoomFlow) — such players ARE real
// entries in state.players (the only way to let them see who else is
// already in the room and which meeples are taken), but doStartGame filters
// them back out before dealing, so nobody who never actually confirmed
// joining gets dealt into a round.
function addPlayer(id,name,character,seat,confirmed){
  if(state.phase!=='lobby') return;
  if(state.players.some(p=>p.id===id)) return;
  if(state.players.length>=6) return;
  const char=characterById(character)?character:null;
  const seatId=seatById(seat)?seat:defaultSeatFor(char);
  state.players.push({id,name,isBot:false,connected:true,character:char,seat:seatId,confirmed:confirmed!==false});
  persist(); render();
}
function doConfirmCharacter(actorId,character,seat){
  const p=state.players.find(x=>x.id===actorId);
  if(!p) return {ok:false,msgKey:'lacuna.msg.notYourTurn'};
  p.character=characterById(character)?character:p.character;
  p.seat=seatById(seat)?seat:defaultSeatFor(p.character);
  p.confirmed=true;
  return {ok:true};
}

function applyAction(actorId,type,payload){
  let result;
  switch(type){
    case 'play': result=doPlay(actorId,payload.value,payload.placement); break;
    case 'pass': result=doPass(actorId); break;
    case 'startGame': result=doStartGame(actorId,payload.botCount); break;
    case 'nextRound': result=doReadyContinue(actorId); break;
    case 'rematch': result=doReadyContinue(actorId); break;
    case 'confirmCharacter': result=doConfirmCharacter(actorId,payload.character,payload.seat); break;
    case 'ackTrick': result=doAckTrick(actorId); break;
    default: return;
  }
  if(!result) return;
  if(!result.ok){
    const text=tr(result.msgKey,result.vars||{},result.msgKey);
    if(actorId===clientId) toast(text); else sendDirect(actorId,{type:'actionError',text});
    return;
  }
  persist(); render(); scheduleBotActions();
}

// ===== bots =====
function botChoose(pid){
  const trick=state.trick, hand=state.hands[pid]||[];
  if(trick.playsCount<2){
    const plain=hand.filter(v=>!isDouble(v)&&!isFive(v)&&!isTen(v));
    const pool=plain.length?plain:hand.slice();
    return { value: pool[Math.floor(pool.length/2)], placement:'plain' };
  }
  // Doppelziffern/55 sind immer per "plain" spielbar (siehe legalPlain) —
  // Bots nutzen die Fuenfer-Rahmenverschiebung absichtlich nie (kein
  // Lookahead noetig, reine Ablage-Heuristik reicht fuer Solo-/Bot-Spiel).
  const options=hand.filter(v=>legalPlain(trick,v));
  if(!options.length) return null;
  options.sort((a,b)=>(isDouble(a)?1:0)-(isDouble(b)?1:0) || a-b);
  return { value: options[0], placement:'plain' };
}
function runBotTurn(){
  const trick=state.trick;
  if(!trick||trick.finished) return;
  const pid=trick.currentPid;
  const player=state.players.find(p=>p.id===pid);
  if(!player||!player.isBot) return;
  const choice=botChoose(pid);
  if(choice) doPlay(pid,choice.value,choice.placement); else doPass(pid);
  persist(); render();
  scheduleBotActions();
}
function scheduleBotActions(){
  clearTimeout(_botTimer);
  if(role!=='host'||state.phase!=='playing') return;
  const trick=state.trick;
  if(!trick||trick.finished) return;
  const player=state.players.find(p=>p.id===trick.currentPid);
  if(!player||!player.isBot) return;
  _botTimer=setTimeout(runBotTurn,700+Math.random()*700);
}

// ===== networking (host-authoritative snapshot pattern, identical to
// blank-frech/rollforge/levelup) =====
function wsUrl(){ if(location.protocol==='file:') return 'ws://localhost:8787/ws'; return (location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws'; }
function send(msg){ if(ws&&ws.readyState===1){ const hostMeta=role==='host'?{public:!!state.publicRoom,hostName:nameVal()}:{}; ws.send(JSON.stringify({game:GAME,room:state.room,clientId,name:nameVal(),...hostMeta,...msg})); } }
function sendDirect(toId,msg){ send({...msg,to:toId}); }
function persist(){ send({type:'snapshot',snapshot:state}); }
function saveSession(){ try{ sessionStorage.setItem('lc.session',JSON.stringify({room:state.room,role})); }catch(e){} }
function clearSession(){ try{ sessionStorage.removeItem('lc.session'); }catch(e){} }
function getSavedSession(){ try{ return JSON.parse(sessionStorage.getItem('lc.session')||'null'); }catch(e){ return null; } }
function makeRoom(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
function nameVal(){ return ($('nameInput')&&$('nameInput').value.trim()) || ($('hostNameInput')&&$('hostNameInput').value.trim()) || localStorage.getItem('lc.name') || 'Gast'; }

function connect(room){
  state.room=room.toUpperCase(); $('roomOut').textContent=state.room;
  try{ localStorage.setItem('lc.room',state.room); }catch(e){}
  saveSession();
  if(ws){ try{ ws.close(); }catch(e){} }
  ws=new WebSocket(wsUrl());
  ws.onopen=()=>{
    if(role==='host'&&!hasCreatedRoom){ hasCreatedRoom=true; send({type:'create',snapshot:state}); }
    else send({type:'join'});
    if(role!=='host') repeatJoin();
  };
  ws.onmessage=e=>{ let m; try{ m=JSON.parse(e.data); }catch(_){ return; } handle(m); };
  ws.onclose=()=>{ reconnectTimer=setTimeout(()=>state.room&&connect(state.room),1300); };
}
// Sent both for the very first join AND to keep retrying until our own id
// shows up in state.players — `confirmed:false` is what keeps us off of
// everyone else's visible player list while still on the character-select
// screen (see addPlayer/renderPlayersList/doStartGame). The character we
// join with here is whatever's currently highlighted; confirmCharSelect()
// sends the (possibly different, final) pick separately once chosen.
function repeatJoin(){
  clearInterval(joinTimer);
  send({type:'joinRequest',character:pendingCharacter,seat:pendingSeat,confirmed:false});
  joinTimer=setInterval(()=>{
    if(state.players.some(p=>p.id===clientId)) clearInterval(joinTimer);
    else send({type:'joinRequest',character:pendingCharacter,seat:pendingSeat,confirmed:false});
  },1100);
}
function handle(m){
  if(m.game&&m.game!==GAME) return;
  if(m.to&&m.to!==clientId) return;
  if(m.type==='actionError'){ toast(m.text); return; }
  if(m.type==='sessionState'&&m.snapshot){ clearTimeout(reconnectTimer); reconnectTimer=null; state={...initialState(),...m.snapshot}; if(role==='host') persist(); render(); scheduleBotActions(); return; }
  if(m.type==='snapshot'&&m.clientId!==clientId){ state={...initialState(),...m.snapshot}; render(); return; }
  if(role!=='host') return;
  if(m.type==='joinRequest') addPlayer(m.clientId,m.name||tr('lacuna.player',{},'Spieler'),m.character,m.seat,m.confirmed);
  else if(m.type==='play') applyAction(m.clientId,'play',{value:m.value,placement:m.placement});
  else if(m.type==='pass') applyAction(m.clientId,'pass',{});
  else if(m.type==='startGame') applyAction(m.clientId,'startGame',{botCount:m.botCount});
  else if(m.type==='nextRound') applyAction(m.clientId,'nextRound',{});
  else if(m.type==='rematch') applyAction(m.clientId,'rematch',{});
  else if(m.type==='confirmCharacter') applyAction(m.clientId,'confirmCharacter',{character:m.character,seat:m.seat});
  else if(m.type==='ackTrick') applyAction(m.clientId,'ackTrick',{});
}
function act(type,payload){ if(role==='host') applyAction(clientId,type,payload); else send({type,...payload}); }

// ===== lobby flows =====
function startHost(){
  role='host'; hasCreatedRoom=false; clearSession();
  state=initialState();
  state.room=makeRoom(); state.phase='lobby'; state.hostId=clientId;
  stopPublicRoomsPolling();
  state.publicRoom=!!$('publicRoomCheck').checked;
  $('hostNameInput').value=nameVal();
  state.players.push({id:clientId,name:nameVal(),isBot:false,connected:true,character:pendingCharacter,seat:pendingSeat,confirmed:true});
  connect(state.room);
  render();
}
function joinRoomFlow(){
  role='guest'; clearSession();
  const room=($('roomInput').value||params.get('room')||'').trim().toUpperCase();
  if(!room){ toast(tr('lacuna.msg.enterRoom',{},'Raumcode fehlt')); return; }
  try{ localStorage.setItem('lc.name',nameVal()); }catch(e){}
  state.phase='lobby';
  stopPublicRoomsPolling();
  connect(room);
  render();
}
// Connects to a JOIN target room the moment the char-select screen opens
// (see openCharSelect), as an unconfirmed placeholder (repeatJoin() always
// sends confirmed:false) — this is what makes takenCharacterIds()/
// renderCharSelect()'s "already in use" badges reflect the room's REAL
// occupants live, instead of only finding out who's there after already
// committing to join. `state.phase` deliberately stays whatever connect()'s
// incoming snapshot says (not forced to 'lobby' the way joinRoomFlow() does
// it) so a peek at a room that's already mid-game doesn't misrepresent it
// as an open lobby.
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
  localStorage.setItem('lc.name',nameVal());
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
function takenCharacterIds(){ return new Set(state.players.map(p=>p.character).filter(Boolean)); }
function openCharSelect(create){
  let room='';
  if(!create){
    room=($('roomInput').value||params.get('room')||'').trim().toUpperCase();
    if(!room){ toast(tr('lacuna.msg.enterRoom',{},'Raumcode fehlt')); return; }
  }
  pendingCreate=create; pendingRoom=room;
  if(!characterById(pendingCharacter)) pendingCharacter=CHARACTERS[0].id;
  charSelectActive=true;
  stopPublicRoomsPolling();
  render();
  if(window.Lacuna3D){
    window.Lacuna3D.mountCharPreview($('charPreviewCanvas'));
    window.Lacuna3D.setCharPreview(pendingCharacter);
    if(!charThumbCache){
      window.Lacuna3D.loadCharacterThumbnails().then(map=>{ charThumbCache=map; if(charSelectActive) renderCharSelect(); });
    }
  }
  if(!create) peekConnect(pendingRoom);
}
function closeCharSelect(){
  charSelectActive=false;
  if(peeking){
    peeking=false;
    if(ws){ try{ ws.close(); }catch(e){} ws=null; }
  }
  state=initialState();
  render();
}
function selectCharacter(id){
  if(!characterById(id)) return;
  pendingCharacter=id;
  pendingSeat=defaultSeatFor(id);
  try{ localStorage.setItem('lc.character',id); }catch(e){}
  renderCharSelect();
  if(window.Lacuna3D) window.Lacuna3D.setCharPreview(id);
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
  $('charConfirmBtn').textContent=pendingCreate?tr('lacuna.createRoom',{},'Raum erstellen'):tr('lacuna.joinRoom',{},'Raum beitreten');
  const taken=takenCharacterIds();
  const grid=$('charGrid');
  if(grid){
    grid.innerHTML=CHARACTERS.map(ch=>{
      const isTaken=taken.has(ch.id);
      const isSel=pendingCharacter===ch.id;
      const thumb=charThumbCache&&charThumbCache[ch.id];
      return `<button type="button" class="char-card${isSel?' selected':''}${isTaken?' taken':''}" data-char="${ch.id}">`
        +`<span class="char-thumb">${thumb?`<img src="${thumb}" alt="">`:`<span class="char-emoji-fallback">${ch.emoji}</span>`}</span>`
        +`<span class="char-name">${esc(tr('lacuna.char.'+ch.id,{},ch.id))}</span>`
        +(isTaken?`<span class="char-inuse-badge">${esc(tr('lacuna.char.inUse',{},'Vergeben'))}</span>`:'')
        +`</button>`;
    }).join('');
    grid.querySelectorAll('.char-card').forEach(btn=>{ btn.onclick=()=>selectCharacter(btn.dataset.char); });
  }
  $('charPreviewName').textContent=tr('lacuna.char.'+pendingCharacter,{},pendingCharacter);
  const seatGrid=$('seatGrid');
  if(seatGrid){
    seatGrid.innerHTML=SEATS.map(s=>{
      const isSel=pendingSeat===s.id;
      return `<button type="button" class="seat-card${isSel?' selected':''}" data-seat="${s.id}" title="${esc(tr('lacuna.seat.'+s.id,{},s.id))}">`
        +`<span class="seat-emoji">${s.emoji}</span>`
        +`<span class="seat-name">${esc(tr('lacuna.seat.'+s.id,{},s.id))}</span>`
        +`</button>`;
    }).join('');
    seatGrid.querySelectorAll('.seat-card').forEach(btn=>{ btn.onclick=()=>selectSeat(btn.dataset.seat); });
  }
}

function leaveToMenu(){
  state=initialState();
  if(ws){ try{ ws.close(); }catch(e){} ws=null; }
  role='guest'; hasCreatedRoom=false;
  clearInterval(joinTimer); joinTimer=null;
  clearTimeout(reconnectTimer); reconnectTimer=null;
  clearTimeout(_botTimer); _botTimer=null;
  try{ clearSession(); }catch(e){}
  stopPublicRoomsPolling();
  try{ history.replaceState({},'',location.pathname); }catch(e){}
  charSelectActive=false; peeking=false;
  render();
}
function backToMainMenu(){
  const live=state.phase==='playing'||state.phase==='roundEnd';
  if(live) gameConfirm(tr('lacuna.confirmMenu',{},'Zurück ins Hauptmenü? Die laufende Partie geht für dich verloren.'),leaveToMenu);
  else leaveToMenu();
}
window.__brettBack={ atTop:()=>state.phase==='menu'&&!charSelectActive, up:()=>{ if(charSelectActive){ closeCharSelect(); return; } backToMainMenu(); } };
function gameConfirm(msg,onYes){
  const ov=$('gameConfirmOverlay');
  if(!ov){ if(onYes&&window.confirm(msg)) onYes(); return; }
  $('gcMsg').textContent=msg;
  ov.removeAttribute('hidden');
  const close=()=>ov.setAttribute('hidden','');
  $('gcConfirmBtn').onclick=()=>{ close(); onYes&&onYes(); };
  $('gcCancelBtn').onclick=close;
}

// ===== public rooms =====
let publicRoomsPollTimer=null;
async function fetchPublicRooms(){
  try{
    const res=await fetch('/api/rooms?game='+encodeURIComponent(GAME),{credentials:'include'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    renderPublicRooms(Array.isArray(data.items)?data.items:[]);
  }catch(_){ /* browsing rooms is a nice-to-have */ }
}
function renderPublicRooms(items){
  const box=$('publicRoomsItems'); if(!box) return;
  if(!items.length){ box.innerHTML=`<div class="public-rooms-empty muted">${esc(tr('lacuna.publicRooms.empty',{},'Aktuell keine öffentlichen Räume.'))}</div>`; return; }
  box.innerHTML=items.map(it=>`<button type="button" class="public-room-row" data-room="${esc(it.room)}"><strong>${esc(it.room)}</strong><span>${esc(it.hostName||tr('lacuna.host',{},'Host'))}</span><span>${it.playerCount}</span></button>`).join('');
}
function startPublicRoomsPolling(){ stopPublicRoomsPolling(); fetchPublicRooms(); publicRoomsPollTimer=setInterval(fetchPublicRooms,4000); }
function stopPublicRoomsPolling(){ if(publicRoomsPollTimer) clearInterval(publicRoomsPollTimer); publicRoomsPollTimer=null; }

// ===== menu tabs =====
function setMenuMode(mode){
  const create=mode!=='join';
  $('modeCreateTab').classList.toggle('active',create);
  $('modeCreateTab').setAttribute('aria-selected',String(create));
  $('modeJoinTab').classList.toggle('active',!create);
  $('modeJoinTab').setAttribute('aria-selected',String(!create));
  $('createFields').classList.toggle('hidden',!create);
  $('joinFields').classList.toggle('hidden',create);
  $('menuActionBtn').textContent=create?tr('lacuna.createRoom',{},'Raum erstellen'):tr('lacuna.joinRoom',{},'Raum beitreten');
  $('menuActionBtn').onclick=()=>openCharSelect(create);
  if(!create) startPublicRoomsPolling(); else stopPublicRoomsPolling();
}

// ===== small UI utils =====
function esc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(m){ const t=$('toast'); t.textContent=m; t.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove('show'),1900); }
function showIn(id,show){ $(id).classList.toggle('hidden',!show); }
function updateInvite(){ const link=new URL(location.href); link.searchParams.set('room',state.room); $('inviteInput').value=link.toString(); }

// ===== the five-card placement overlay =====
function attemptPlayTap(value){
  const trick=state.trick;
  if(!trick||trick.finished) return;
  if(trick.currentPid!==clientId){ toast(tr('lacuna.msg.notYourTurn',{},'Du bist nicht am Zug')); return; }
  if(trick.playsCount<2){ act('play',{value,placement:'plain'}); return; }
  const opts=cardOptions(trick,value);
  if(!opts.plain&&!opts.overlay){ toast(tr('lacuna.msg.illegalCard',{},'Diese Karte passt nicht in die Lücke')); return; }
  if(opts.overlay) openFiveChoice(value,trick,opts);
  else act('play',{value,placement:'plain'});
}
function openFiveChoice(value,trick,opts){
  const ov=$('fiveChoiceOverlay'), box=$('fiveOptions');
  box.innerHTML='';
  const addBtn=(cls,label,placement)=>{
    const b=document.createElement('button'); b.className=cls; b.textContent=label;
    b.onclick=()=>{ ov.setAttribute('hidden',''); act('play',{value,placement}); };
    box.appendChild(b);
  };
  if(opts.plain) addBtn('secondary',tr('lacuna.five.plain',{},'In die Lücke legen'),'plain');
  addBtn('good',tr('lacuna.five.overlayA',{card:fmtCard(trick.rangeCards[0].value)},''),'overlayA');
  addBtn('good',tr('lacuna.five.overlayB',{card:fmtCard(trick.rangeCards[1].value)},''),'overlayB');
  ov.removeAttribute('hidden');
}

// ===== rendering =====
function phaseLabel(){
  switch(state.phase){
    case 'lobby': return tr('lacuna.turn.waiting',{},'Warte auf Mitspieler…');
    case 'playing': return tr('lacuna.roundLabel',{n:state.roundNumber},'Runde '+state.roundNumber);
    case 'roundEnd': return tr('lacuna.roundOver',{},'Runde vorbei');
    case 'gameOver': return '🏆';
    default: return '';
  }
}
function gapDashEl(){ const d=document.createElement('div'); d.className='trick-gap-dash'; return d; }
function cardChipEl(c,isFrame){
  const wrap=document.createElement('div'); wrap.className='trick-frame-slot';
  if(isFrame){ const tag=document.createElement('div'); tag.className='frame-tag'; tag.textContent=tr('lacuna.trick.frame',{},'Rahmen'); wrap.appendChild(tag); }
  const chip=document.createElement('div'); chip.className='card-chip d'+Math.floor(c.value/10)+(c.demoted?' demoted':'');
  const badge=isDouble(c.value)?'∞':(isTen(c.value)?'★':(isFive(c.value)?'●':''));
  chip.innerHTML=fmtCard(c.value)+(badge?`<span class="badge">${badge}</span>`:'');
  wrap.appendChild(chip);
  return wrap;
}
function renderTrickBoard(){
  const trick=state.trick, el=$('trickBoard');
  el.innerHTML='';
  if(!trick||!trick.playsCount){
    el.innerHTML=`<span class="trick-empty">${esc(tr('lacuna.trick.empty',{},'Noch keine Karte gespielt'))}</span>`;
    $('trickPointsOut').textContent='';
    return;
  }
  const frag=document.createDocumentFragment();
  frag.appendChild(cardChipEl(trick.rangeCards[0],true));
  const extras=trick.extraCards.slice().sort((a,b)=>a.value-b.value);
  if(trick.rangeCards[1]||extras.length) frag.appendChild(gapDashEl());
  extras.forEach(c=>{ frag.appendChild(cardChipEl(c,false)); frag.appendChild(gapDashEl()); });
  if(trick.rangeCards[1]) frag.appendChild(cardChipEl(trick.rangeCards[1],true));
  el.appendChild(frag);
  $('trickPointsOut').textContent=tr('lacuna.trick.points',{n:trick.points},trick.points+' Punkt(e)');
}
function buildSyncPayload(){
  const order=state.turnOrder;
  const players=order.map(pid=>{ const p=state.players.find(x=>x.id===pid); return { id:pid, name:nameOf(pid), isMe:pid===clientId, handCount:(state.hands[pid]||[]).length, character:p?p.character:null, seat:p?(p.seat||defaultSeatFor(p.character)):null }; });
  const myHand=(state.hands[clientId]||[]).slice().sort((a,b)=>a-b).map(v=>({value:v}));
  return { players, myHand, trick:state.trick, stockCount:state.stockCount, currentPid:state.trick?state.trick.currentPid:null, dealerId:state.dealerId, markerPid:state.markerTakenBy };
}
function sync3D(){ if(window.Lacuna3D) window.Lacuna3D.sync(buildSyncPayload()); }
function renderGame(){
  const trick=state.trick;
  const myTurn=!!trick&&!trick.finished&&trick.currentPid===clientId;
  $('turnBanner').textContent= myTurn? tr('lacuna.turn.yours',{},'Du bist am Zug') : tr('lacuna.turn.other',{name:nameOf(trick?trick.currentPid:null)},'');
  $('turnBanner').classList.toggle('mine',myTurn);
  $('roundBanner').textContent=tr('lacuna.roundLabel',{n:state.roundNumber},'Runde '+state.roundNumber)+' · '+tr('lacuna.stock',{n:state.stockCount},state.stockCount+' Karten beiseitegelegt');
  $('scorePill').textContent=state.scores[clientId]||0;
  renderTrickBoard();
  $('passBtn').disabled=!(myTurn&&trick&&trick.playsCount>=2);
  let hintKey='lacuna.hint.waiting';
  if(myTurn&&trick){
    if(trick.playsCount===0) hintKey='lacuna.hint.range1';
    else if(trick.playsCount===1) hintKey='lacuna.hint.range2';
    else hintKey='lacuna.hint.play';
  }
  $('actionHint').textContent=tr(hintKey,{},'');
  sync3D();
}
function renderTrickEndOverlay(){
  const ov=$('trickEndOverlay'), res=state.trickResult;
  if(!res){ ov.setAttribute('hidden',''); return; }
  $('trickEndWinner').textContent=tr('lacuna.trickEnd.winner',{name:nameOf(res.winnerId),points:res.points},'');
  const list=$('trickEndReasons'); list.innerHTML='';
  state.turnOrder.forEach(pid=>{
    const reason=res.reasons[pid];
    if(!reason) return;
    const li=document.createElement('li');
    li.textContent=tr(reason==='empty'?'lacuna.trickEnd.reasonEmpty':'lacuna.trickEnd.reasonPassed',{name:nameOf(pid)},'');
    list.appendChild(li);
  });
  const markerEl=$('trickEndMarker');
  if(res.markerPid){ markerEl.textContent=tr('lacuna.trickEnd.marker',{name:nameOf(res.markerPid)},''); markerEl.classList.remove('hidden'); }
  else markerEl.classList.add('hidden');
  const iAcked=!!res.ack[clientId];
  $('trickEndNextBtn').disabled=iAcked;
  const waitingNames=state.turnOrder.filter(pid=>!res.ack[pid]).map(nameOf);
  $('trickEndWaiting').textContent=waitingNames.length?tr('lacuna.trickEnd.waitingFor',{names:waitingNames.join(', ')},''):'';
  ov.removeAttribute('hidden');
}
function renderRoundEnd(){
  const el=$('roundScores'); el.innerHTML='';
  const bd=state.lastRoundBreakdown||{};
  const sorted=state.turnOrder.slice().sort((a,b)=>(state.scores[b]||0)-(state.scores[a]||0));
  const maxScore=Math.max(0,...state.turnOrder.map(pid=>state.scores[pid]||0));
  sorted.forEach(pid=>{
    const li=document.createElement('li');
    if((state.scores[pid]||0)===maxScore) li.classList.add('gold');
    const b=bd[pid]||{trickPoints:0,marker:0,tens:0,total:0};
    li.innerHTML=`<div class="rank-row1"><span>${esc(nameOf(pid))}</span><strong>${state.scores[pid]||0}</strong></div>`+
      `<div class="rank-row2">${esc(tr('lacuna.roundBreakdown',{trick:b.trickPoints,marker:b.marker,tens:b.tens,total:b.total},''))}</div>`;
    el.appendChild(li);
  });
  renderReadyGate('nextRoundBtn','roundEndWaiting');
}
function renderGameOver(){
  const winners=state.finalWinnerIds||[];
  $('winnerName').textContent=winners.map(nameOf).join(' & ');
  const el=$('finalScores'); el.innerHTML='';
  const sorted=state.turnOrder.slice().sort((a,b)=>(state.scores[b]||0)-(state.scores[a]||0));
  sorted.forEach(pid=>{
    const li=document.createElement('li');
    if(winners.includes(pid)) li.classList.add('gold');
    li.innerHTML=`<div class="rank-row1"><span>${esc(nameOf(pid))}</span><strong>${state.scores[pid]||0}</strong></div>`;
    el.appendChild(li);
  });
  renderReadyGate('rematchBtn','gameOverWaiting');
}
function renderReadyGate(btnId,waitingId){
  const ack=state.readyAck||{};
  const iAcked=!!ack[clientId];
  $(btnId).disabled=iAcked;
  const waitingNames=state.turnOrder.filter(pid=>!ack[pid]).map(nameOf);
  $(waitingId).textContent=waitingNames.length?tr('lacuna.trickEnd.waitingFor',{names:waitingNames.join(', ')},''):'';
}
function renderPlayersList(){
  const el=$('playersList'); el.innerHTML='';
  const list=state.turnOrder.length?state.turnOrder:state.players.filter(p=>p.confirmed!==false).map(p=>p.id);
  list.forEach(pid=>{
    const p=state.players.find(pp=>pp.id===pid); if(!p) return;
    const isTurn=state.phase==='playing'&&state.trick&&!state.trick.finished&&state.trick.currentPid===pid;
    const li=document.createElement('div'); li.className='item'+(isTurn?' active':'');
    const handCount=(state.hands[pid]||[]).length;
    const tags=[];
    if(pid===clientId) tags.push(tr('lacuna.you',{},'(Du)'));
    if(pid===state.hostId) tags.push(tr('lacuna.host',{},'Host'));
    const badges=[];
    if(pid===state.dealerId&&state.phase==='playing') badges.push(esc(tr('lacuna.dealer.badge',{},'Geber')));
    if(pid===state.markerTakenBy&&state.phase==='playing') badges.push(esc(tr('lacuna.marker.badge',{},'Lacuna-Marke')));
    li.innerHTML=`<div class="row1"><span>${esc(p.name)}${tags.length?' <span class="muted">'+esc(tags.join(' · '))+'</span>':''}</span><strong>${state.scores[pid]||0}</strong></div>`+
      `<div class="row2"><span>${esc(tr('lacuna.roundLabel',{n:state.roundNumber||0},''))}</span><span>${handCount} 🂠</span></div>`+
      (badges.length?`<div class="row3 dealer-tag">${badges.join(' · ')}</div>`:'');
    el.appendChild(li);
  });
}
function renderLog(){
  const el=$('logList');
  if(!state.log.length){ el.innerHTML=`<div class="log-empty">${esc(tr('lacuna.log.empty',{},'Noch keine Züge'))}</div>`; return; }
  const wasNearBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-30;
  el.innerHTML=state.log.map(e=>`<div class="log-entry">${esc(tr(e.key,e.vars,e.key))}</div>`).join('');
  if(wasNearBottom) el.scrollTop=el.scrollHeight;
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
  renderTrickEndOverlay();
}

// ===== wiring =====
$('modeCreateTab').onclick=()=>setMenuMode('create');
$('modeJoinTab').onclick=()=>setMenuMode('join');
$('copyBtn').onclick=()=>{ updateInvite(); $('inviteInput').select(); try{ document.execCommand('copy'); }catch(e){} navigator.clipboard?.writeText($('inviteInput').value).catch(()=>{}); toast(tr('lacuna.msg.linkCopied',{},'Link kopiert')); };
$('startBtn').onclick=()=>act('startGame',{botCount:Number($('botCountInput').value)||0});
$('publicRoomCheck').onchange=()=>{ state.publicRoom=$('publicRoomCheck').checked; if(role==='host') persist(); };
$('publicRoomsItems').addEventListener('click',e=>{ const row=e.target.closest('.public-room-row'); if(!row) return; $('roomInput').value=row.dataset.room; openCharSelect(false); });
$('charBackBtn').onclick=closeCharSelect;
$('charConfirmBtn').onclick=confirmCharSelect;
$('passBtn').onclick=()=>act('pass',{});
$('nextRoundBtn').onclick=()=>act('nextRound',{});
$('rematchBtn').onclick=()=>act('rematch',{});
$('fiveCancelBtn').onclick=()=>$('fiveChoiceOverlay').setAttribute('hidden','');
$('trickEndNextBtn').onclick=()=>act('ackTrick',{});

$('nameInput').value=localStorage.getItem('lc.name')||'';
$('hostNameInput').value=$('nameInput').value||'Host';
$('nameInput').addEventListener('input',()=>{ try{ localStorage.setItem('lc.name',$('nameInput').value); }catch(e){} });

window.addEventListener('brettspiele-language-change',render);

if(window.Lacuna3D&&$('tableCanvas')) window.Lacuna3D.mount($('tableCanvas'));

// Tap-to-play: hand cards live only in the 3D fan (see game.render3d.js
// buildHandFan), so picking which one was pressed goes through a raycast
// (Lacuna3D.pickHandCard) instead of a per-element onclick. A simple
// move/time threshold distinguishes a tap from an orbit-camera drag — both
// listeners hang independently off the same canvas without stopPropagation,
// same pattern as every other 3D game on this site.
let tapStart=null;
$('tableCanvas').addEventListener('pointerdown',e=>{
  if(state.phase!=='playing'||!window.Lacuna3D){ tapStart=null; return; }
  const cardId=window.Lacuna3D.pickHandCard(e.clientX,e.clientY);
  tapStart=(cardId==null)?null:{value:cardId,x:e.clientX,y:e.clientY,t:Date.now()};
});
window.addEventListener('pointerup',e=>{
  if(!tapStart) return;
  const dx=e.clientX-tapStart.x, dy=e.clientY-tapStart.y;
  const moved=Math.hypot(dx,dy), dt=Date.now()-tapStart.t;
  const value=tapStart.value; tapStart=null;
  if(moved<12&&dt<600) attemptPlayTap(value);
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
