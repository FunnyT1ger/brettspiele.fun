
(function(){
'use strict';
const GAME='texas-hold-em';
const $=id=>document.getElementById(id);
const clientId=sessionStorage.getItem('the.clientId') || (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()));
sessionStorage.setItem('the.clientId',clientId);
let role='guest', ws=null, connected=false, joinTimer=null, hasCreatedRoom=false, reconnectTimer=null, _botTimer=null, _advTimer=null;
const params=new URLSearchParams(location.search);
const I18N=window.BFI18N||null;
const tr=(key,vars={},fallback='')=>I18N?.t(key,vars,fallback)??(fallback||key);

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1700)}
function makeRoom(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function nameVal(){return ($('nameInput').value||$('hostNameInput').value||localStorage.getItem('the.name')||tr('holdem.player',{},'Spieler')).trim().slice(0,24)}
function saveSession(){try{sessionStorage.setItem('the.session',JSON.stringify({room:state.room,role}))}catch(e){}}
function clearSession(){try{sessionStorage.removeItem('the.session')}catch(e){}}
function getSavedSession(){try{return JSON.parse(sessionStorage.getItem('the.session')||'null')}catch(e){return null}}
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
function fmtChips(n){return String(Math.round(n||0))}

// ===== characters (meeple selection) =====
// One real GLB model per entry (game.render3d.js loads+caches models/<file>
// and clones it both for the char-select preview and the seated table
// avatar), plus an emoji fallback used as a safety net if a model somehow
// fails to load. `id` is also the i18n key suffix under holdem.char.*. Same
// 20-character roster as LevelUp on this site (this game's own copy under
// models/ — every game directory is its own sandbox, no shared imports).
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
function characterById(id){return CHARACTERS.find(c=>c.id===id)||null}
function randomCharacterId(){return CHARACTERS[Math.floor(Math.random()*CHARACTERS.length)].id}

// ===== seats (chair selection) =====
// Six GLB chairs, each character gets a thematically fitting default
// (CHAR_DEFAULT_SEAT) but the player can still override it in char-select
// (see selectSeat/pendingSeat). All 6 GLBs share one authored seat-surface
// height and a floor origin at raw y≈0, which is what lets any character
// sit on any chair without per-pair tuning (see game.render3d.js).
const SEATS=[
  {id:'holzstuhl',file:'seat_01_holzstuhl.glb',emoji:'🪑'},
  {id:'thron',file:'seat_02_thron.glb',emoji:'👑'},
  {id:'technik',file:'seat_03_technik.glb',emoji:'🛰️'},
  {id:'fass',file:'seat_04_fass.glb',emoji:'🛢️'},
  {id:'hocker',file:'seat_05_hocker.glb',emoji:'🪵'},
  {id:'baumstumpf',file:'seat_06_baumstumpf.glb',emoji:'🌳'}
];
function seatById(id){return SEATS.find(s=>s.id===id)||null}
// Thematic default per character id — purely a starting suggestion, always
// overridable via selectSeat().
const CHAR_DEFAULT_SEAT={
  zauberer:'baumstumpf', roboter:'technik', pirat:'fass', astronaut:'technik', koch:'holzstuhl',
  ninja:'baumstumpf', wikinger:'fass', ritter:'holzstuhl', cowgirl:'hocker', alien:'technik',
  detektiv:'holzstuhl', taucher:'fass', koenigin:'thron', rockstar:'thron', feuerwehr:'holzstuhl',
  yeti:'baumstumpf', pharao:'thron', pilot:'technik', vampir:'thron', superheldin:'technik'
};
function defaultSeatFor(characterId){ return CHAR_DEFAULT_SEAT[characterId]||SEATS[0].id }

// ===== Cards =====
const RANK_LABEL={11:'J',12:'Q',13:'K',14:'A'};
const SUIT_SYMBOL={s:'♠',h:'♥',d:'♦',c:'♣'};
function rankLabel(r){return RANK_LABEL[r]||String(r)}
function freshDeck(){const suits=['s','h','d','c'];const out=[];for(const s of suits)for(let r=2;r<=14;r++)out.push({rank:r,suit:s});return out;}

// ===== Hand evaluation =====
// score = [category(0-8), tiebreak...]; higher category/tiebreaks win. Compared purely
// lexicographically — same-category hands always produce equal-length arrays (see below),
// different categories differ at index 0 already so length never matters across categories.
const HAND_NAME_KEYS=['highCard','pair','twoPair','trips','straight','flush','fullHouse','quads','straightFlush'];
function handNameKey(res){ if(res.score[0]===8 && res.score[1]===14) return 'royalFlush'; return HAND_NAME_KEYS[res.score[0]]; }
function compareScore(a,b){const n=Math.max(a.length,b.length);for(let i=0;i<n;i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;}
function evaluate5(cards){
  const ranks=cards.map(c=>c.rank).sort((a,b)=>b-a);
  const isFlush=cards.every(c=>c.suit===cards[0].suit);
  const uniq=[...new Set(ranks)];
  let straightHigh=null;
  if(uniq.length===5){
    if(uniq[0]-uniq[4]===4) straightHigh=uniq[0];
    else if(uniq[0]===14&&uniq[1]===5&&uniq[2]===4&&uniq[3]===3&&uniq[4]===2) straightHigh=5;
  }
  const isStraight=straightHigh!=null;
  const counts={}; ranks.forEach(r=>counts[r]=(counts[r]||0)+1);
  const groups=Object.entries(counts).map(([r,c])=>({r:+r,c})).sort((a,b)=>b.c-a.c||b.r-a.r);
  if(isStraight&&isFlush) return {score:[8,straightHigh]};
  if(groups[0].c===4) return {score:[7,groups[0].r,groups[1].r]};
  if(groups[0].c===3&&groups[1].c===2) return {score:[6,groups[0].r,groups[1].r]};
  if(isFlush) return {score:[5,...ranks]};
  if(isStraight) return {score:[4,straightHigh]};
  if(groups[0].c===3) return {score:[3,groups[0].r,groups[1].r,groups[2].r]};
  if(groups[0].c===2&&groups[1].c===2) return {score:[2,groups[0].r,groups[1].r,groups[2].r]};
  if(groups[0].c===2) return {score:[1,groups[0].r,groups[1].r,groups[2].r,groups[3].r]};
  return {score:[0,...ranks]};
}
function combinations(arr,k){const res=[];const n=arr.length;const idx=[];(function rec(start){if(idx.length===k){res.push(idx.map(i=>arr[i]));return;}for(let i=start;i<n;i++){idx.push(i);rec(i+1);idx.pop();}})(0);return res;}
function bestHand(cards){
  const combos=cards.length<=5?[cards]:combinations(cards,5);
  let best=null;
  for(const c of combos){const e=evaluate5(c);if(!best||compareScore(e.score,best.score)>0)best=e;}
  return best;
}
function preflopStrength(hole){
  if(!hole||hole.length<2) return 0.3;
  const [a,b]=hole; const hi=Math.max(a.rank,b.rank), lo=Math.min(a.rank,b.rank);
  let s=(hi+lo-4)/24;
  if(a.rank===b.rank) s+=0.22+(hi-2)/12*0.14;
  if(a.suit===b.suit) s+=0.07;
  if(a.rank!==b.rank) s-=Math.min(0.16,(hi-lo-1)*0.025);
  return Math.max(0.02,Math.min(1,s));
}
function handStrength(p){
  if(!state.community.length) return preflopStrength(p.holeCards);
  const best=bestHand([...p.holeCards,...state.community]);
  return Math.min(1,best.score[0]/8*0.82+((best.score[1]||0)/14)*0.18);
}

// ===== Live "your hand" / win-chance readout (own client only) =====
// Monte Carlo equity vs random opponent hands and a random runout — this
// client only knows its own hole cards, so (like a real player) it can't
// compute exact odds against opponents' actual hands, only an estimate
// against the range of hands they *could* have. Cached by a signature of
// the inputs so it only re-simulates when the board/street/opponent-set
// actually changes, not on every render() call (e.g. dragging the raise
// slider doesn't touch state and never invalidates the cache).
const EQUITY_TRIALS=200;
let _equityCache=null;
function equitySignature(me){
  return [state.street,state.community.map(c=>c.rank+c.suit).join(','),
    me.holeCards.map(c=>c.rank+c.suit).join(','),
    state.players.filter(p=>p.id!==me.id&&p.inHand&&!p.folded&&!p.out).map(p=>p.id).join(',')
  ].join('|');
}
function computeHandInfo(){
  const me=myPlayer();
  if(!me||!me.holeCards||me.holeCards.length<2||me.folded||me.out) return null;
  if(!['preflop','flop','turn','river'].includes(state.street)) return null;
  const sig=equitySignature(me);
  if(_equityCache&&_equityCache.sig===sig) return _equityCache;
  const known=[...me.holeCards,...state.community];
  const handKey=known.length>=5?handNameKey(bestHand(known)):null;
  const opponents=state.players.filter(p=>p.id!==me.id&&p.inHand&&!p.folded&&!p.out);
  let equity=1;
  if(opponents.length){
    const usedKeys=new Set(known.map(c=>c.rank+c.suit));
    const unseen=freshDeck().filter(c=>!usedKeys.has(c.rank+c.suit));
    const neededCommunity=5-state.community.length;
    let shareSum=0;
    for(let t=0;t<EQUITY_TRIALS;t++){
      const pool=shuffle(unseen.slice());
      let idx=0;
      const oppHoles=opponents.map(()=>[pool[idx++],pool[idx++]]);
      const board=[...state.community,...pool.slice(idx,idx+neededCommunity)];
      const myScore=bestHand([...me.holeCards,...board]).score;
      let bestScore=myScore,tieCount=1;
      for(const oh of oppHoles){
        const s=bestHand([...oh,...board]).score;
        const cmp=compareScore(s,bestScore);
        if(cmp>0){bestScore=s;tieCount=1;}
        else if(cmp===0){tieCount++;}
      }
      if(compareScore(myScore,bestScore)===0) shareSum+=1/tieCount;
    }
    equity=shareSum/EQUITY_TRIALS;
  }
  _equityCache={sig,handKey,equity};
  return _equityCache;
}
function renderHandInfo(){
  const box=$('handInfoBar'); if(!box)return;
  const info=state.phase==='playing'?computeHandInfo():null;
  box.classList.toggle('hidden',!info);
  if(!info)return;
  $('myHandLabel').textContent=info.handKey?tr('holdem.hand.'+info.handKey,{},info.handKey):tr('holdem.street.'+state.street,{},state.street);
  $('winChanceLabel').textContent=Math.round(info.equity*100)+'%';
}

// ===== Game state =====
const initialState=()=>({
  phase:'menu', room:'', publicRoom:false,
  players:[], dealerSeat:null, sbSeat:null, bbSeat:null,
  smallBlind:10, bigBlind:20, startingStack:1000,
  deck:[], community:[], street:'idle', toActId:null, currentBet:0, minRaise:0, lastAggressorId:null,
  handNumber:0, log:[], eventSeq:0, lastEvent:null, results:null, nextVotes:{}, rematchVotes:{}
});
let state=initialState();

function wsUrl(){if(location.protocol==='file:')return 'ws://localhost:8787/ws';return (location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws'}
function send(msg){if(ws&&ws.readyState===1){const hostMeta=role==='host'?{public:!!state.publicRoom,hostName:nameVal()}:{};ws.send(JSON.stringify({game:GAME,room:state.room,clientId,name:nameVal(),...hostMeta,...msg}))}}
function persist(){send({type:'snapshot',snapshot:state})}
function connect(room){state.room=room.toUpperCase();$('roomOut').textContent=state.room;localStorage.setItem('the.room',state.room);saveSession();if(ws)try{ws.close()}catch(e){};ws=new WebSocket(wsUrl());ws.onopen=()=>{connected=true;if(role==='host'&&!hasCreatedRoom){hasCreatedRoom=true;send({type:'create',snapshot:state});}else{send({type:'join'});}if(role!=='host') repeatJoin();};ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return}handle(m)};ws.onclose=()=>{connected=false;setTimeout(()=>state.room&&connect(state.room),1300)}}
function repeatJoin(){clearInterval(joinTimer);send({type:'joinRequest',character:pendingCharacter,seat:pendingSeat,confirmed:false});joinTimer=setInterval(()=>{if(state.players.some(p=>p.id===clientId))clearInterval(joinTimer);else send({type:'joinRequest',character:pendingCharacter,seat:pendingSeat,confirmed:false})},1100)}
function handle(m){
  if(m.game&&m.game!==GAME)return;
  if(m.type==='sessionState'&&m.snapshot){clearTimeout(reconnectTimer);reconnectTimer=null;state={...initialState(),...m.snapshot};if(role==='host')persist();render();return}
  if(m.type==='snapshot'&&m.clientId!==clientId){state={...initialState(),...m.snapshot};render();return}
  if(role==='host'){
    if(m.type==='joinRequest') addPlayer(m.clientId,m.name||'Gast',m.character,m.confirmed,m.seat);
    if(m.type==='confirmCharacter') doConfirmCharacter(m.clientId,m.character,m.seat);
    if(m.type==='action') doAction(m.clientId,m.action,m.amount);
    if(m.type==='continueReady') markContinue(m.clientId);
    if(m.type==='rematchReady') markRematch(m.clientId);
  }
}

// ===== Lobby / room lifecycle =====
// `confirmed:false` means "occupies a slot but is still on the character-
// select screen" (see openCharSelect/peekConnect below) — such placeholders
// are real entries in state.players (the only way to let them see who else
// is already in the room and which meeples are taken), but renderPlayers()/
// startGame() filter them out so nobody else sees a nameless placeholder in
// the lobby, or ends up dealt into a hand they never actually confirmed into.
function addPlayer(id,name,character,confirmed,seat){
  if(state.players.some(p=>p.id===id))return;
  if(state.phase!=='lobby')return;
  if(state.players.length>=6)return;
  const char=characterById(character)?character:null;
  const seatId=seatById(seat)?seat:defaultSeatFor(char);
  state.players.push({id,name,isBot:false,stack:0,out:false,inHand:false,holeCards:[],folded:false,allIn:false,committed:0,streetBet:0,acted:false,lastAction:null,character:char,seat:seatId,confirmed:confirmed!==false});
  persist();render();
}
function doConfirmCharacter(playerId,character,seat){
  if(state.phase!=='lobby')return;
  const p=state.players.find(x=>x.id===playerId);
  if(!p)return;
  p.character=characterById(character)?character:randomCharacterId();
  p.seat=seatById(seat)?seat:defaultSeatFor(p.character);
  p.confirmed=true;
  persist();render();
}
function botName(i){return tr('holdem.botName',{n:i+1},'Bot '+(i+1))}
function myPlayer(){return state.players.find(p=>p.id===clientId)}
function humanPlayers(){return state.players.filter(p=>!p.isBot)}

function startHost(){role='host';hasCreatedRoom=false;clearSession();state=initialState();state.publicRoom=!!($('publicRoomCheck')&&$('publicRoomCheck').checked);state.room=makeRoom();state.phase='lobby';stopPublicRoomsPolling();$('hostNameInput').value=nameVal();addPlayer(clientId,nameVal(),pendingCharacter,true,pendingSeat);connect(state.room);updateInvite();render();}
function joinRoom(){role='guest';clearSession();const room=($('roomInput').value||params.get('room')||'').trim().toUpperCase();if(!room)return toast(tr('holdem.msg.enterRoom',{},'Raumcode fehlt'));localStorage.setItem('the.name',nameVal());state.phase='lobby';stopPublicRoomsPolling();connect(room);render();}
function gameConfirm(msg,onYes){const ov=$('gameConfirmOverlay');if(!ov){if(onYes&&window.confirm(msg))onYes();return;}$('gcMsg').textContent=msg;ov.removeAttribute('hidden');const close=()=>ov.setAttribute('hidden','');$('gcConfirmBtn').onclick=()=>{close();onYes&&onYes();};$('gcCancelBtn').onclick=close;}
function leaveToMenu(){
  state=initialState();
  if(ws){try{ws.close()}catch(e){}ws=null}
  connected=false;hasCreatedRoom=false;role='guest';
  clearInterval(joinTimer);joinTimer=null;
  clearTimeout(reconnectTimer);reconnectTimer=null;
  clearTimeout(_botTimer);_botTimer=null;clearTimeout(_advTimer);_advTimer=null;
  try{clearSession()}catch(e){}
  if(typeof stopPublicRoomsPolling==='function')stopPublicRoomsPolling();
  try{history.replaceState({},'',location.pathname)}catch(e){}
  charSelectActive=false;peeking=false;
  render();
}
function backToMainMenu(){
  const live=state.phase==='playing';
  if(live) gameConfirm(tr('holdem.confirmMenu',{},'Zurück ins Hauptmenü? Die laufende Partie geht für dich verloren.'),leaveToMenu);
  else leaveToMenu();
}
window.__brettBack={atTop:()=>state.phase==='menu'&&!charSelectActive,up:()=>{ if(charSelectActive){ closeCharSelect(); return; } backToMainMenu(); }};

// ===== character select (pre-join screen) =====
// Purely local UI state, never networked directly — the chosen id only
// travels to the host as part of the join message (see repeatJoin/startHost)
// and from then on lives as player.character inside the synced state, like
// any other player field. `charSelectActive` gates render()'s menu-vs-
// charSelect branch independently of state.phase (still 'menu' throughout).
let charSelectActive=false;
let pendingCreate=true;
let pendingRoom='';
let pendingCharacter=localStorage.getItem('the.character')||CHARACTERS[0].id;
// Seat the player has chosen for pendingCharacter — reset to that
// character's thematic default whenever pendingCharacter changes (see
// selectCharacter), overridable per-session via selectSeat(). Deliberately
// NOT persisted in localStorage like pendingCharacter: a persisted raw seat
// id would reintroduce the "stale mismatched pick" problem this avoids.
let pendingSeat=defaultSeatFor(pendingCharacter);
// True while the char-select screen is connected to a JOIN target room as an
// unconfirmed placeholder (see peekConnect/confirmJoinAfterPeek below) —
// distinguishes "already connected, just send the final confirm" from a
// fresh connect() in joinRoom().
let peeking=false;
let charThumbCache=null; // null until first generated; {id: dataURL} after, cached for the rest of the page session
function takenCharacterIds(){ return new Set(state.players.map(p=>p.character).filter(Boolean)); }
function openCharSelect(create){
  let room='';
  if(!create){
    room=($('roomInput').value||params.get('room')||'').trim().toUpperCase();
    if(!room) return toast(tr('holdem.msg.enterRoom',{},'Raumcode fehlt'));
  }
  pendingCreate=create; pendingRoom=room;
  if(!characterById(pendingCharacter)) pendingCharacter=CHARACTERS[0].id;
  charSelectActive=true;
  stopPublicRoomsPolling();
  render();
  if(window.HoldEm3D){
    window.HoldEm3D.mountCharPreview($('charPreviewCanvas'));
    window.HoldEm3D.setCharPreview(pendingCharacter);
    if(!charThumbCache){
      window.HoldEm3D.loadCharacterThumbnails().then(map=>{ charThumbCache=map; if(charSelectActive) renderCharSelect(); });
    }
  }
  // Join: connect now (peek-only) so the live snapshot of who's already in
  // the room — and which meeples they hold — arrives while this screen is
  // still open, instead of only finding out after actually joining.
  if(!create) peekConnect(pendingRoom);
}
function peekConnect(room){
  role='guest'; clearSession();
  peeking=true;
  stopPublicRoomsPolling();
  connect(room);
}
function closeCharSelect(){
  charSelectActive=false;
  if(peeking){
    peeking=false;
    if(ws){try{ws.close()}catch(e){}ws=null}
    connected=false;
  }
  state=initialState();
  render();
}
function selectCharacter(id){
  if(!characterById(id)) return;
  pendingCharacter=id;
  pendingSeat=defaultSeatFor(id);
  try{localStorage.setItem('the.character',id)}catch(e){}
  renderCharSelect();
  if(window.HoldEm3D) window.HoldEm3D.setCharPreview(id);
}
function selectSeat(id){
  if(!seatById(id)) return;
  pendingSeat=id;
  renderCharSelect();
}
// Finishes a join that was already peekConnect()-ed: the placeholder join is
// in place, so this only needs to send the final chosen character/seat
// (possibly different from whatever repeatJoin() sent first) and flip
// state.phase to 'lobby' locally — no second connect(), unlike joinRoom().
function confirmJoinAfterPeek(){
  peeking=false;
  localStorage.setItem('the.name',nameVal());
  state.phase='lobby';
  if(role==='host') doConfirmCharacter(clientId,pendingCharacter,pendingSeat);
  else send({type:'confirmCharacter',character:pendingCharacter,seat:pendingSeat});
  saveSession();
  render();
}
function confirmCharSelect(){
  charSelectActive=false;
  if(pendingCreate){
    startHost();
  } else {
    $('roomInput').value=pendingRoom;
    if(peeking) confirmJoinAfterPeek(); else joinRoom();
  }
}
function renderCharSelect(){
  $('charConfirmBtn').textContent=pendingCreate?tr('holdem.createRoom',{},'Raum erstellen'):tr('holdem.joinRoom',{},'Raum beitreten');
  const taken=takenCharacterIds();
  const grid=$('charGrid');
  if(grid){
    grid.innerHTML=CHARACTERS.map(ch=>{
      const isTaken=taken.has(ch.id);
      const isSel=pendingCharacter===ch.id;
      const thumb=charThumbCache&&charThumbCache[ch.id];
      return `<button type="button" class="char-card${isSel?' selected':''}${isTaken?' taken':''}" data-char="${ch.id}">`
        +`<span class="char-thumb">${thumb?`<img src="${thumb}" alt="">`:`<span class="char-emoji-fallback">${ch.emoji}</span>`}</span>`
        +`<span class="char-name">${esc(tr('holdem.char.'+ch.id,{},ch.id))}</span>`
        +(isTaken?`<span class="char-inuse-badge">${esc(tr('holdem.char.inUse',{},'Vergeben'))}</span>`:'')
        +`</button>`;
    }).join('');
    grid.querySelectorAll('.char-card').forEach(btn=>{ btn.onclick=()=>selectCharacter(btn.dataset.char); });
  }
  $('charPreviewName').textContent=tr('holdem.char.'+pendingCharacter,{},pendingCharacter);
  const seatGrid=$('seatGrid');
  if(seatGrid){
    seatGrid.innerHTML=SEATS.map(s=>{
      const isSel=pendingSeat===s.id;
      return `<button type="button" class="seat-card${isSel?' selected':''}" data-seat="${s.id}" title="${esc(tr('holdem.seat.'+s.id,{},s.id))}">`
        +`<span class="seat-emoji">${s.emoji}</span>`
        +`<span class="seat-name">${esc(tr('holdem.seat.'+s.id,{},s.id))}</span>`
        +`</button>`;
    }).join('');
    seatGrid.querySelectorAll('.seat-card').forEach(btn=>{ btn.onclick=()=>selectSeat(btn.dataset.seat); });
  }
}

let menuMode='create';
function setMenuMode(mode){menuMode=mode==='join'?'join':'create';$('modeCreateTab').classList.toggle('active',menuMode==='create');$('modeCreateTab').setAttribute('aria-selected',String(menuMode==='create'));$('modeJoinTab').classList.toggle('active',menuMode==='join');$('modeJoinTab').setAttribute('aria-selected',String(menuMode==='join'));$('joinFields').classList.toggle('hidden',menuMode!=='join');$('createFields')?.classList.toggle('hidden',menuMode!=='create');$('menuActionBtn').textContent=menuMode==='join'?tr('holdem.joinRoom',{},'Raum beitreten'):tr('holdem.createRoom',{},'Raum erstellen');if(menuMode==='join')startPublicRoomsPolling();else stopPublicRoomsPolling();}
let publicRoomsPollTimer=null;
async function fetchPublicRooms(){try{const res=await fetch('/api/rooms?game='+encodeURIComponent(GAME),{credentials:'include'});if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json();renderPublicRooms(Array.isArray(data.items)?data.items:[]);}catch(_){}}
function renderPublicRooms(items){const box=$('publicRoomsItems');if(!box)return;if(!items.length){box.innerHTML=`<div class="public-rooms-empty muted">${esc(tr('holdem.publicRooms.empty',{},'Aktuell keine öffentlichen Räume.'))}</div>`;return}box.innerHTML=items.map(item=>`<button type="button" class="public-room-row" data-room="${esc(item.room)}"><strong>${esc(item.room)}</strong><span>${esc(item.hostName||tr('holdem.host',{},'Host'))}</span><span class="public-room-count">${item.playerCount}</span></button>`).join('');}
function startPublicRoomsPolling(){stopPublicRoomsPolling();fetchPublicRooms();publicRoomsPollTimer=setInterval(fetchPublicRooms,4000);}
function stopPublicRoomsPolling(){if(publicRoomsPollTimer)clearInterval(publicRoomsPollTimer);publicRoomsPollTimer=null;}
function updateInvite(){const link=new URL(location.href);link.searchParams.set('room',state.room);$('inviteInput').value=link.toString()}
function copyInvite(){const v=$('inviteInput').value; if(navigator.clipboard)navigator.clipboard.writeText(v).then(()=>toast(tr('holdem.msg.linkCopied',{},'Link kopiert'))).catch(fallback); else fallback(); function fallback(){const i=$('inviteInput');i.focus();i.select();document.execCommand('copy');toast(tr('holdem.msg.linkCopied',{},'Link kopiert'))}}

// ===== Seat-order helpers =====
// players[] order IS seat order around the table for the whole session (fixed at
// startGame(), never reshuffled mid-game) — dealerSeat/sbSeat/bbSeat/toActId are all
// resolved through this array by index, never by re-sorting.
function seatIndexAfter(fromIdx,predicate){const n=state.players.length;if(!n)return -1;for(let i=1;i<=n;i++){const idx=(fromIdx+i)%n;if(predicate(state.players[idx]))return idx;}return -1;}
function contenders(){return state.players.filter(p=>p.inHand&&!p.folded)}
function potTotal(){return state.players.reduce((s,p)=>s+p.committed,0)}
function pushLog(key,vars){state.log.push({id:(state.log.length?state.log[state.log.length-1].id:0)+1,key,vars:vars||{}});if(state.log.length>80)state.log.shift();}
function recordEvent(actorId,type,extra){state.eventSeq=(state.eventSeq||0)+1;state.lastEvent=Object.assign({id:state.eventSeq,actorId,type},extra||{});}

function startGame(){
  if(role!=='host')return;
  const startingStack=Math.max(100,Math.min(100000,Number($('stackInput').value)||1000));
  const sb=Math.max(1,Math.min(Math.floor(startingStack/4),Number($('blindInput').value)||10));
  state.startingStack=startingStack; state.smallBlind=sb; state.bigBlind=sb*2;
  const botCount=Math.max(0,Math.min(5,Number($('botCountInput').value)||0));
  state.players=state.players.filter(p=>!p.isBot&&p.confirmed!==false);
  const humanCount=state.players.length;
  const totalTarget=Math.min(6,humanCount+botCount);
  const addBots=Math.max(0,totalTarget-humanCount);
  for(let i=0;i<addBots;i++){
    const used=new Set(state.players.map(p=>p.character).filter(Boolean));
    const free=CHARACTERS.filter(c=>!used.has(c.id));
    const char=free.length?free[Math.floor(Math.random()*free.length)].id:randomCharacterId();
    state.players.push({id:'bot-'+(i+1),name:botName(i),isBot:true,stack:0,out:false,inHand:false,holeCards:[],folded:false,allIn:false,committed:0,streetBet:0,acted:false,lastAction:null,character:char,seat:defaultSeatFor(char)});
  }
  if(state.players.length<2) return toast(tr('holdem.msg.needPlayers',{},'Mindestens 2 Spieler nötig'));
  state.players.forEach(p=>{p.stack=startingStack;p.out=false;});
  shuffle(state.players);
  state.dealerSeat=Math.floor(Math.random()*state.players.length);
  state.phase='playing'; state.handNumber=0; state.log=[];
  state.publicRoom=false; const pc=$('publicRoomCheck'); if(pc)pc.checked=false;
  startHand();
}

function postBlind(p,amount){const actual=Math.min(amount,p.stack);p.stack-=actual;p.committed+=actual;p.streetBet+=actual;if(p.stack===0)p.allIn=true;return actual;}

function startHand(){
  const active=state.players.filter(p=>!p.out);
  if(active.length<2){state.phase='ended';persist();render();return;}
  state.handNumber++;
  if(state.handNumber>1) state.dealerSeat=seatIndexAfter(state.dealerSeat,p=>!p.out);
  else if(state.dealerSeat==null||state.players[state.dealerSeat].out) state.dealerSeat=seatIndexAfter(-1,p=>!p.out);
  state.players.forEach(p=>{p.folded=false;p.allIn=false;p.holeCards=[];p.committed=0;p.streetBet=0;p.acted=false;p.lastAction=null;p.inHand=!p.out;});
  state.deck=shuffle(freshDeck()); state.community=[]; state.street='preflop'; state.results=null; state.lastAggressorId=null;
  const n=state.players.length;
  const isHeadsUp=active.length===2;
  let sbIdx,bbIdx;
  if(isHeadsUp){sbIdx=state.dealerSeat;bbIdx=seatIndexAfter(sbIdx,p=>!p.out);}
  else{sbIdx=seatIndexAfter(state.dealerSeat,p=>!p.out);bbIdx=seatIndexAfter(sbIdx,p=>!p.out);}
  state.sbSeat=sbIdx; state.bbSeat=bbIdx;
  const sbP=state.players[sbIdx], bbP=state.players[bbIdx];
  pushLog('holdem.log.handStart',{n:state.handNumber});
  const sbActual=postBlind(sbP,state.smallBlind); recordEvent(sbP.id,'postBlind',{amount:sbActual}); pushLog('holdem.log.postSmall',{name:sbP.name,amount:sbActual}); persist();render();
  const bbActual=postBlind(bbP,state.bigBlind); recordEvent(bbP.id,'postBlind',{amount:bbActual}); pushLog('holdem.log.postBig',{name:bbP.name,amount:bbActual}); persist();render();
  state.currentBet=state.bigBlind; state.minRaise=state.bigBlind;
  const order=[]; for(let i=0;i<n;i++){const idx=(state.dealerSeat+1+i)%n; if(!state.players[idx].out) order.push(idx);}
  order.forEach(idx=>state.players[idx].holeCards.push(state.deck.pop()));
  order.forEach(idx=>state.players[idx].holeCards.push(state.deck.pop()));
  recordEvent(null,'deal',{});
  const firstIdx=isHeadsUp?sbIdx:seatIndexAfter(bbIdx,p=>p.inHand&&!p.folded&&!p.allIn&&!p.out);
  state.toActId=firstIdx>=0?state.players[firstIdx].id:null;
  persist();render();
  scheduleBotActions();
}

function bettingRoundOver(){
  const c=contenders();
  if(c.length<=1)return true;
  const live=c.filter(p=>!p.allIn);
  if(live.length===0)return true;
  return live.every(p=>p.acted&&p.streetBet===state.currentBet);
}
function nextToAct(afterId){const idx=state.players.findIndex(p=>p.id===afterId);if(idx<0)return null;const t=seatIndexAfter(idx,p=>p.inHand&&!p.folded&&!p.allIn&&!p.out);return t<0?null:state.players[t].id;}

function doAction(pid,type,amount){
  if(state.toActId!==pid||!['preflop','flop','turn','river'].includes(state.street))return;
  const p=state.players.find(x=>x.id===pid);
  if(!p||p.folded||p.allIn||p.out)return;
  const toCall=state.currentBet-p.streetBet;
  let chipsAdded=0, finalType=type;
  if(type==='fold'){ if(toCall<=0)return; p.folded=true; }
  else if(type==='check'){ if(toCall>0)return; }
  else if(type==='call'){
    if(toCall<=0)return;
    chipsAdded=Math.min(toCall,p.stack); p.stack-=chipsAdded; p.committed+=chipsAdded; p.streetBet+=chipsAdded;
    if(p.stack===0){p.allIn=true;finalType='allin';}
  } else if(type==='raise'||type==='allin'){
    const maxRaiseTo=p.streetBet+p.stack;
    if(maxRaiseTo<=p.streetBet)return;
    let raiseTo=type==='allin'?maxRaiseTo:Math.min(maxRaiseTo,Math.max(Math.round(Number(amount))||0,state.currentBet+state.minRaise));
    if(raiseTo<=state.currentBet&&raiseTo<maxRaiseTo)return;
    if(raiseTo<=p.streetBet)return;
    chipsAdded=raiseTo-p.streetBet; p.stack-=chipsAdded; p.committed+=chipsAdded; p.streetBet=raiseTo;
    if(raiseTo>state.currentBet){
      if(raiseTo-state.currentBet>=state.minRaise) state.minRaise=raiseTo-state.currentBet;
      state.currentBet=raiseTo; state.lastAggressorId=pid;
      state.players.forEach(pl=>{if(pl.id!==pid&&!pl.folded&&!pl.allIn&&!pl.out)pl.acted=false;});
    }
    if(p.stack===0){p.allIn=true;finalType='allin';}
  } else return;
  p.acted=true; p.lastAction=finalType;
  if(finalType==='fold') pushLog('holdem.log.fold',{name:p.name});
  else if(finalType==='check') pushLog('holdem.log.check',{name:p.name});
  else if(finalType==='call') pushLog('holdem.log.call',{name:p.name,amount:chipsAdded});
  else if(finalType==='raise') pushLog('holdem.log.raise',{name:p.name,amount:p.streetBet});
  else if(finalType==='allin') pushLog('holdem.log.allin',{name:p.name,amount:p.streetBet});
  recordEvent(pid,'action',{action:finalType,amount:chipsAdded});
  if(bettingRoundOver()){
    state.toActId=null; persist(); render();
    clearTimeout(_advTimer); _advTimer=setTimeout(()=>{if(role==='host')advanceStreet();},700);
  } else {
    state.toActId=nextToAct(pid); persist(); render();
  }
}

function advanceStreet(){
  const c=contenders();
  if(c.length<=1){ awardUncontested(c[0]); return; }
  if(state.street==='river'){ doShowdown(); return; }
  const dealMap={preflop:3,flop:1,turn:1};
  const n=dealMap[state.street];
  for(let i=0;i<n;i++) state.community.push(state.deck.pop());
  state.street=state.street==='preflop'?'flop':state.street==='flop'?'turn':'river';
  state.players.forEach(p=>{p.streetBet=0;p.acted=false;});
  state.currentBet=0; state.minRaise=state.bigBlind;
  recordEvent(null,'community',{count:n,street:state.street});
  const live=c.filter(p=>!p.allIn);
  if(live.length<=1){
    state.toActId=null; persist(); render();
    clearTimeout(_advTimer); _advTimer=setTimeout(()=>{if(role==='host')advanceStreet();},1100);
    return;
  }
  const idx=seatIndexAfter(state.dealerSeat,p=>p.inHand&&!p.folded&&!p.allIn&&!p.out);
  state.toActId=idx>=0?state.players[idx].id:null;
  persist(); render(); scheduleBotActions();
}

function computePots(){
  const parts=state.players.filter(p=>p.committed>0).map(p=>({id:p.id,committed:p.committed,folded:p.folded}));
  const levels=[...new Set(parts.map(p=>p.committed))].sort((a,b)=>a-b);
  let prev=0, carry=0; const pots=[];
  for(const level of levels){
    const layerPayers=parts.filter(p=>p.committed>=level);
    const amount=(level-prev)*layerPayers.length+carry;
    const eligible=layerPayers.filter(p=>!p.folded).map(p=>p.id);
    if(amount>0&&eligible.length>0){ pots.push({amount,eligiblePids:eligible}); carry=0; }
    else carry=amount;
    prev=level;
  }
  if(carry>0&&pots.length) pots[pots.length-1].amount+=carry;
  return pots;
}
function awardUncontested(winner){
  if(!winner){ persist(); render(); return; }
  const total=potTotal();
  winner.stack+=total;
  pushLog('holdem.log.winUncontested',{name:winner.name,amount:total});
  recordEvent(winner.id,'award',{winners:[{id:winner.id,amount:total}]});
  state.results={pots:[{amount:total,winners:[winner.id],handKey:null}],revealed:{}};
  finishHand();
}
function doShowdown(){
  state.street='showdown';
  const c=contenders();
  const evals={}; c.forEach(p=>{evals[p.id]=bestHand([...p.holeCards,...state.community]);});
  const pots=computePots();
  const results=[]; const winnerAwards=[];
  pots.forEach(pot=>{
    const elig=pot.eligiblePids.map(id=>state.players.find(p=>p.id===id));
    let bestScore=null, winners=[];
    elig.forEach(p=>{const e=evals[p.id];if(!bestScore){bestScore=e.score;winners=[p];}else{const cmp=compareScore(e.score,bestScore);if(cmp>0){bestScore=e.score;winners=[p];}else if(cmp===0)winners.push(p);}});
    const share=Math.floor(pot.amount/winners.length);
    let remainder=pot.amount-share*winners.length;
    winners.forEach((w,i)=>{const amt=share+(i<remainder?1:0);w.stack+=amt;winnerAwards.push({id:w.id,amount:amt});});
    results.push({amount:pot.amount,winners:winners.map(w=>w.id),handKey:handNameKey(evals[winners[0].id])});
  });
  results.forEach(r=>{r.winners.forEach(wid=>{const w=state.players.find(p=>p.id===wid);const amt=winnerAwards.filter(a=>a.id===wid).reduce((s,a)=>s+a.amount,0);pushLog('holdem.log.winShowdown',{name:w.name,amount:amt,handKey:r.handKey});});});
  recordEvent(null,'award',{winners:winnerAwards});
  state.results={pots:results,revealed:Object.fromEntries(c.map(p=>[p.id,p.holeCards]))};
  finishHand();
}
function finishHand(){
  state.players.forEach(p=>{if(p.stack<=0){p.stack=0;if(!p.out){p.out=true;pushLog('holdem.log.busted',{name:p.name});}}});
  state.street='handEnd'; state.toActId=null; state.nextVotes={};
  persist(); render(); scheduleBotActions();
}
function maybeAdvance(){
  if(role!=='host'||state.street!=='handEnd')return;
  const hp=humanPlayers();
  if(!hp.every(p=>state.nextVotes&&state.nextVotes[p.id]))return;
  const remaining=state.players.filter(p=>!p.out);
  if(remaining.length<=1){ state.phase='ended'; state.rematchVotes={}; persist(); render(); }
  else startHand();
}
function voteContinue(){state.nextVotes=state.nextVotes||{};state.nextVotes[clientId]=true;if(role==='host')markContinue(clientId);else send({type:'continueReady'});render();}
function markContinue(id){state.nextVotes=state.nextVotes||{};state.nextVotes[id]=true;persist();render();maybeAdvance();}
function voteRematch(){state.rematchVotes=state.rematchVotes||{};state.rematchVotes[clientId]=true;if(role==='host')markRematch(clientId);else send({type:'rematchReady'});render();}
function markRematch(id){state.rematchVotes=state.rematchVotes||{};state.rematchVotes[id]=true;persist();render();maybeRestart();}
function maybeRestart(){if(role!=='host'||state.phase!=='ended')return;if(!humanPlayers().every(p=>state.rematchVotes&&state.rematchVotes[p.id]))return;doRematch();}
function doRematch(){
  state.players.forEach(p=>{p.stack=state.startingStack;p.out=false;});
  shuffle(state.players);
  state.dealerSeat=Math.floor(Math.random()*state.players.length);
  state.handNumber=0; state.log=[]; state.rematchVotes={}; state.nextVotes={};
  state.phase='playing';
  startHand();
}

// ===== Bot AI =====
function raiseSuggestion(p,strength){const target=state.currentBet+Math.max(state.minRaise,Math.round(potTotal()*(0.4+strength*0.5)));return Math.min(p.streetBet+p.stack,target);}
function botDecision(p){
  const toCall=state.currentBet-p.streetBet;
  const strength=handStrength(p);
  const pot=potTotal();
  const potOdds=toCall>0?toCall/(pot+toCall):0;
  const eff=strength+(Math.random()-0.5)*0.12;
  if(toCall<=0){
    if(eff>0.68&&Math.random()<0.55&&p.stack>0) return {type:'raise',amount:raiseSuggestion(p,eff)};
    return {type:'check'};
  }
  if(eff<potOdds-0.05){
    if(toCall<=p.stack*0.06&&Math.random()<0.35) return {type:'call'};
    return {type:'fold'};
  }
  if(eff>0.82&&Math.random()<0.45&&p.stack>toCall) return {type:'raise',amount:raiseSuggestion(p,eff)};
  return {type:'call'};
}
function scheduleBotActions(){
  if(role!=='host')return;
  clearTimeout(_botTimer);
  if(state.phase!=='playing')return;
  if(['preflop','flop','turn','river'].includes(state.street)&&state.toActId){
    const p=state.players.find(x=>x.id===state.toActId);
    if(p&&p.isBot){_botTimer=setTimeout(()=>{const d=botDecision(p);doAction(p.id,d.type,d.amount);},700+Math.random()*900);}
  } else if(state.street==='handEnd'){
    const readyBots=state.players.filter(p=>p.isBot&&!(state.nextVotes&&state.nextVotes[p.id]));
    if(readyBots.length){_botTimer=setTimeout(()=>{readyBots.forEach(b=>markContinue(b.id));},900);}
  }
}

// ===== Rendering =====
function phaseLabel(p){return ({menu:'Menü',lobby:'Lobby',playing:'Spiel',ended:'Ende'}[p]||p)}
function render(){
  $('roomOut').textContent=state.room||'—';
  $('phaseOut').textContent=phaseLabel(state.phase);
  // Character select is local UI state independent of state.phase (it runs
  // before create/join, and while peeking a join target, state.phase gets
  // overwritten by whatever that room's ACTUAL phase is — see peekConnect).
  // Every phase-driven panel below is gated off while it's active, so a peek
  // into an already-started game can never show gameStage bleeding through
  // underneath the character grid.
  const inChar=charSelectActive;
  $('menuBox').classList.toggle('hidden',!(state.phase==='menu'&&!inChar));
  $('charSelectStage').classList.toggle('hidden',!inChar);
  $('lobbyBox').classList.toggle('hidden',!(state.phase==='lobby'&&!inChar));
  $('lobbyBox').classList.toggle('is-guest',role!=='host');
  if(state.room&&!inChar)updateInvite();
  const pc=$('publicRoomCheck'); if(pc)pc.checked=!!state.publicRoom;
  if(inChar) renderCharSelect();
  renderPlayers();
  renderStage();
  if(window.HoldEm3D) window.HoldEm3D.sync(buildSyncPayload());
  scheduleBotActions();
}
function seatBadge(p){
  const b=[];
  if(state.dealerSeat!=null&&state.players[state.dealerSeat]&&state.players[state.dealerSeat].id===p.id) b.push('D');
  if(state.sbSeat!=null&&state.players[state.sbSeat]&&state.players[state.sbSeat].id===p.id) b.push('SB');
  if(state.bbSeat!=null&&state.players[state.bbSeat]&&state.players[state.bbSeat].id===p.id) b.push('BB');
  return b.join(' ');
}
function renderPlayers(){
  const box=$('playersList');
  if(state.phase==='lobby'){
    const list=state.players.filter(p=>p.confirmed!==false);
    box.innerHTML=list.map(p=>`<div class="item ${p.id===clientId?'active':''}"><div class="row1"><strong>${esc(p.name)}${p.isBot?' \u{1F916}':''}</strong></div></div>`).join('')||'<p class="muted">Noch niemand am Tisch.</p>';
    return;
  }
  if(!['playing','ended'].includes(state.phase)){ box.innerHTML=''; return; }
  box.innerHTML=state.players.map(p=>{
    const badge=seatBadge(p);
    const status=p.out?tr('holdem.status.out',{},'Raus'):p.folded?tr('holdem.status.folded',{},'Gefoldet'):p.allIn?tr('holdem.status.allin',{},'All-in'):(state.toActId===p.id?tr('holdem.status.turn',{},'Am Zug'):'');
    return `<div class="item ${p.id===clientId?'active':''} ${state.toActId===p.id?'turn':''} ${p.out?'out':''}">
      <div class="row1"><strong>${esc(p.name)}${p.isBot?' \u{1F916}':''}</strong>${badge?`<span class="seat-badge">${badge}</span>`:''}</div>
      <div class="row2"><span>${fmtChips(p.stack)} Chips</span><span>${status}</span></div>
      ${p.streetBet>0?`<div class="row2 bet-row"><span>${tr('holdem.bet',{},'Einsatz')}: ${fmtChips(p.streetBet)}</span></div>`:''}
    </div>`;
  }).join('');
  renderLog();
}
function renderLog(){
  const box=$('logList'); if(!box)return;
  if(!state.log.length){ box.innerHTML=`<div class="log-empty muted">${esc(tr('holdem.log.empty',{},'Noch keine Aktionen'))}</div>`; return; }
  box.innerHTML=state.log.slice().reverse().map(e=>{
    const vars=Object.assign({},e.vars);
    if(vars.handKey) vars.hand=tr('holdem.hand.'+vars.handKey,{},vars.handKey);
    return `<div class="log-entry">${esc(tr(e.key,vars,e.key))}</div>`;
  }).join('');
}
function renderHandRanks(){
  const box=$('handRanksList'); if(!box||box.dataset.built)return;
  box.dataset.built='1';
  const order=['royalFlush','straightFlush','quads','fullHouse','flush','straight','trips','twoPair','pair','highCard'];
  box.innerHTML=order.map(k=>`<li>${esc(tr('holdem.hand.'+k,{},k))}</li>`).join('');
}
function myActionState(){
  const me=myPlayer();
  const canAct=state.phase==='playing'&&['preflop','flop','turn','river'].includes(state.street)&&state.toActId===clientId&&me&&!me.folded&&!me.allIn&&!me.out;
  return {me,canAct};
}
function renderActionBar(){
  const box=$('actionBar'); if(!box)return;
  const {me,canAct}=myActionState();
  box.classList.toggle('hidden',!canAct);
  if(!canAct)return;
  const toCall=state.currentBet-me.streetBet;
  const callBtn=$('callBtn');
  callBtn.textContent=toCall>0?tr('holdem.callAmount',{amount:fmtChips(toCall)},'Call '+fmtChips(toCall)):tr('holdem.check',{},'Check');
  callBtn.dataset.type=toCall>0?'call':'check';
  $('foldBtn').classList.toggle('hidden',toCall<=0);
  const maxRaiseTo=me.streetBet+me.stack;
  const minRaiseTo=Math.min(maxRaiseTo,state.currentBet+state.minRaise);
  const range=$('raiseRange');
  range.min=minRaiseTo; range.max=Math.max(minRaiseTo,maxRaiseTo);
  if(!range.dataset.touched||Number(range.value)<minRaiseTo||Number(range.value)>maxRaiseTo) range.value=minRaiseTo;
  $('raiseAmountOut').textContent=fmtChips(range.value);
  $('raiseBtn').disabled=maxRaiseTo<=state.currentBet;
  $('allInBtn').disabled=me.stack<=0;
}
function renderHandEnd(){
  const box=$('handEndBox'); if(!box)return;
  const show=state.phase==='playing'&&state.street==='handEnd'&&state.results;
  box.classList.toggle('hidden',!show);
  if(!show)return;
  const rows=state.results.pots.map(pot=>{
    const names=pot.winners.map(id=>{const p=state.players.find(x=>x.id===id);return p?esc(p.name):'?'}).join(', ');
    const hand=pot.handKey?tr('holdem.hand.'+pot.handKey,{},pot.handKey):tr('holdem.log.winUncontested',{},'Alle anderen gefoldet');
    return `<div class="pot-result"><strong>${fmtChips(pot.amount)}</strong> → ${names}<div class="muted">${hand}</div></div>`;
  }).join('');
  const revealHtml=Object.entries(state.results.revealed||{}).map(([pid,cards])=>{
    const p=state.players.find(x=>x.id===pid); if(!p)return'';
    const txt=cards.map(c=>rankLabel(c.rank)+SUIT_SYMBOL[c.suit]).join(' ');
    return `<div class="reveal-row"><span>${esc(p.name)}</span><span>${txt}</span></div>`;
  }).join('');
  $('handEndResults').innerHTML=rows+(revealHtml?`<div class="reveal-list">${revealHtml}</div>`:'');
  const hp=humanPlayers(); const ready=hp.filter(p=>state.nextVotes&&state.nextVotes[p.id]).length; const iReady=!!(state.nextVotes&&state.nextVotes[clientId]);
  const remaining=state.players.filter(p=>!p.out);
  $('nextHandBtn').classList.toggle('hidden',remaining.length<=1);
  $('nextHandBtn').disabled=iReady;
  $('nextHandBtn').textContent=iReady?tr('holdem.waitingOthers',{},'Warte auf die anderen…'):tr('holdem.nextHand',{},'Nächste Hand');
  $('handEndReady').textContent=`${ready}/${hp.length}`;
}
function renderEnded(){
  const box=$('gameOverBox'); const show=state.phase==='ended'; box.classList.toggle('hidden',!show); if(!show)return;
  const ranking=[...state.players].sort((a,b)=>b.stack-a.stack);
  const champ=ranking[0];
  $('winnerName').textContent=champ?champ.name:'—';
  $('finalScores').innerHTML=ranking.map((p,i)=>`<li class="${i===0?'gold':''}"><span>${esc(p.name)}</span><strong>${fmtChips(p.stack)}</strong></li>`).join('');
  const hp=humanPlayers(); const ready=hp.filter(p=>state.rematchVotes&&state.rematchVotes[p.id]).length; const iReady=!!(state.rematchVotes&&state.rematchVotes[clientId]);
  $('rematchBtn').disabled=iReady;
  $('rematchBtn').textContent=iReady?tr('holdem.waitingOthers',{},'Warte auf die anderen…'):tr('holdem.rematch',{},'Nochmal spielen');
  $('rematchReady').textContent=`${ready}/${hp.length}`;
}
function renderStage(){
  $('menuHero').classList.toggle('hidden',(state.phase!=='menu'&&state.phase!=='lobby')||charSelectActive);
  $('gameStage').classList.toggle('hidden',!(state.phase==='playing'||state.phase==='ended')||charSelectActive);
  const street=state.street;
  const banner=$('turnBanner');
  if(state.phase==='playing'){
    const streetLabel=tr('holdem.street.'+street,{},street);
    const potLabel=tr('holdem.potLabel',{amount:fmtChips(potTotal())},'Pot: '+fmtChips(potTotal()));
    if(street==='handEnd') banner.textContent=potLabel;
    else if(state.toActId===clientId) banner.textContent=tr('holdem.yourTurn',{},'Du bist am Zug')+' · '+potLabel;
    else{const p=state.players.find(x=>x.id===state.toActId);banner.textContent=(p?tr('holdem.turnOf',{name:p.name},p.name+' ist am Zug'):streetLabel)+' · '+potLabel;}
    banner.classList.toggle('mine',state.toActId===clientId);
  }
  renderActionBar();
  renderHandInfo();
  renderHandEnd();
  renderEnded();
  renderHandRanks();
}
function buildSyncPayload(){
  const me=myPlayer();
  return {
    players:state.players.map(p=>({
      id:p.id,name:p.name,isMe:p.id===clientId,isBot:p.isBot,stack:p.stack,bet:p.streetBet,committed:p.committed,
      folded:p.folded,allIn:p.allIn,out:p.out,active:state.toActId===p.id,
      isDealer:state.dealerSeat!=null&&state.players[state.dealerSeat]&&state.players[state.dealerSeat].id===p.id,
      revealed:(state.results&&state.results.revealed&&state.results.revealed[p.id])||null,
      character:p.character||null,seat:p.seat||defaultSeatFor(p.character)
    })),
    community:state.community,
    pot:potTotal(),
    street:state.street,
    myHoleCards:me?me.holeCards:[],
    lastEvent:state.lastEvent
  };
}

// ===== Wiring =====
$('modeCreateTab').onclick=()=>setMenuMode('create');
$('modeJoinTab').onclick=()=>setMenuMode('join');
$('menuActionBtn').onclick=()=>openCharSelect(menuMode!=='join');
$('charBackBtn').onclick=closeCharSelect;
$('charConfirmBtn').onclick=confirmCharSelect;
$('startBtn').onclick=startGame;
$('copyBtn').onclick=copyInvite;
$('publicRoomCheck').onchange=()=>{state.publicRoom=$('publicRoomCheck').checked;if(role==='host')persist();};
$('publicRoomsItems').addEventListener('click',e=>{const row=e.target.closest('.public-room-row');if(!row||!row.dataset.room)return;$('roomInput').value=row.dataset.room;openCharSelect(false);});
$('nameInput').value=localStorage.getItem('the.name')||'';
$('hostNameInput').value=$('nameInput').value||'Host';

function act(type,amount){
  const {canAct}=myActionState(); if(!canAct)return;
  if(role==='host')doAction(clientId,type,amount);
  else send({type:'action',action:type,amount});
}
$('foldBtn').onclick=()=>act('fold');
$('callBtn').onclick=()=>act($('callBtn').dataset.type||'call');
$('raiseBtn').onclick=()=>act('raise',Number($('raiseRange').value));
$('allInBtn').onclick=()=>act('allin');
$('raiseRange').addEventListener('input',()=>{$('raiseRange').dataset.touched='1';$('raiseAmountOut').textContent=fmtChips($('raiseRange').value);});
$('raiseHalfPotBtn').onclick=()=>{const me=myPlayer();if(!me)return;const target=Math.round(state.currentBet+potTotal()*0.5);const range=$('raiseRange');range.value=Math.max(Number(range.min),Math.min(Number(range.max),target));range.dataset.touched='1';$('raiseAmountOut').textContent=fmtChips(range.value);};
$('raisePotBtn').onclick=()=>{const me=myPlayer();if(!me)return;const target=Math.round(state.currentBet+potTotal());const range=$('raiseRange');range.value=Math.max(Number(range.min),Math.min(Number(range.max),target));range.dataset.touched='1';$('raiseAmountOut').textContent=fmtChips(range.value);};
$('nextHandBtn').onclick=voteContinue;
$('rematchBtn').onclick=voteRematch;
$('toMenuBtn')?.addEventListener('click',backToMainMenu);
if(window.HoldEm3D&&$('threeCanvas'))window.HoldEm3D.mount($('threeCanvas'));

function authName(){try{const st=window.BrettAuth&&BrettAuth.getState&&BrettAuth.getState();if(st&&st.authenticated&&st.user)return String(st.user.displayName||st.user.username||'').trim().slice(0,24);}catch(e){}return '';}
function autofillAuthName(){const dn=authName();if(!dn)return;const ni=$('nameInput'),hi=$('hostNameInput');if(ni&&!ni.value.trim())ni.value=dn;if(hi&&(!hi.value.trim()||hi.value==='Host'))hi.value=dn;try{if(!(localStorage.getItem('the.name')||'').trim())localStorage.setItem('the.name',dn);}catch(e){}}
autofillAuthName();window.addEventListener('brettspiele-auth-change',autofillAuthName);

if(params.get('room')){$('roomInput').value=params.get('room').toUpperCase();setMenuMode('join');}
(function(){
  const sess=getSavedSession();
  if(sess&&sess.room){
    role=sess.role||'guest';hasCreatedRoom=true;
    const n=localStorage.getItem('the.name')||''; if(n){$('nameInput').value=n;$('hostNameInput').value=n;}
    state.phase='lobby'; stopPublicRoomsPolling();
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;state=initialState();clearSession();render();},15000);
    connect(sess.room);
  } else if(params.get('room')){
    setMenuMode('join'); const ni=$('nameInput'); if(ni)setTimeout(()=>{ni.focus();ni.select();},0);
  }
  render();
}());
window.addEventListener('brettspiele-language-change',()=>{ const box=$('handRanksList'); if(box)box.dataset.built=''; render(); });

})();
