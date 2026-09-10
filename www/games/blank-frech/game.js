
(function(){
'use strict';
const GAME='blank-frech';
const $=id=>document.getElementById(id);
const clientId=sessionStorage.getItem('bf.clientId') || (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()));
sessionStorage.setItem('bf.clientId',clientId);
let role='guest', ws=null, connected=false, joinTimer=null, hasCreatedRoom=false, reconnectTimer=null, _botTimer=null;
const params=new URLSearchParams(location.search);
const I18N=window.BFI18N||null;
const tr=(key,vars={},fallback='')=>I18N?.t(key,vars,fallback)??(fallback||key);
function playDrawSound(){window.BrettSounds?.play?.('draw')}

// ===== Card decks =====
// Card content lives in per-language files (decks/<lang>.js) that register into
// window.BFDECKS. The HOST draws every card and ships the resulting TEXT to
// guests via the shared state, so one game always uses a single card language
// (the host's pick) and cross-language play keeps working no matter which UI
// language each guest has. Missing/partial decks fall back to German, then English.
function _decks(){return (typeof window!=='undefined'&&window.BFDECKS)||{};}
function deckLangs(){return Object.keys(_decks());}
function deckLabel(l){return (_decks()[l]&&_decks()[l].label)||l;}
function resolveDeckLang(l){const d=_decks();if(l&&d[l])return l;if(d.de)return 'de';const k=Object.keys(d);return k.length?k[0]:'de';}
function catData(lang,cat){const d=_decks();const pick=o=>(o&&o[cat])?o[cat]:null;return pick(d[lang])||pick(d.de)||pick(d.en)||{prompts:[],answers:[]};}
// Card sets the host can mix & match in the lobby (multi-select).
const DECK_META=[{id:'funny',label:'😄 Lustig & harmlos'},{id:'spicy',label:'🌶️ Frech & anzüglich (18+)'},{id:'dark',label:'🖤 Schwarzer Humor (18+)'}];

const initialState=()=>({phase:'menu',room:'',target:7,round:0,judgeIndex:0,judgeStart:0,prompt:'',players:[],answers:[],winner:null,hands:{},redrawUsed:{},drawPile:[],promptPile:[],usedAnswers:[],usedPrompts:[],rankingOpen:false,publicRoom:false,nextVotes:{},rematchVotes:{},categories:['funny'],deckLang:'de'});
let state=initialState();

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// A prompt may contain more than one ____ blank; count them so the player has
// to lay one card per blank (see #pickCard) instead of a single answer.
function blankCount(p){return (String(p||'').match(/____/g)||[]).length||1}
function promptHtml(p){return esc(p).replace(/____/g,'<span class="blank"></span>')}
function fillBlanks(p,cards){let i=0;return esc(p).replace(/____/g,()=>{const c=cards[i++];return c?`<span class="blank filled">${esc(c)}</span>`:'<span class="blank"></span>';})}
// One answer can now be several cards (one per blank); render them joined.
function ansText(a){const c=Array.isArray(a.cards)?a.cards:(a.answer!=null?[a.answer]:[]);return c.map(esc).join(' <span class="ans-sep">·</span> ')}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1700)}
function makeRoom(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function nameVal(){return ($('nameInput').value||$('hostNameInput').value||localStorage.getItem('bf.name')||tr('rollforge.player',{},'Spieler')).trim().slice(0,24)}
/* theme toggle handled by shared assets/game-chrome.js */
function saveSession(){try{sessionStorage.setItem('bf.session',JSON.stringify({room:state.room,role}))}catch(e){}}
function clearSession(){try{sessionStorage.removeItem('bf.session')}catch(e){}}
function getSavedSession(){try{return JSON.parse(sessionStorage.getItem('bf.session')||'null')}catch(e){return null}}

function wsUrl(){if(location.protocol==='file:')return 'ws://localhost:8787/ws';return (location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws'}
function send(msg){if(ws&&ws.readyState===1){const hostMeta=role==='host'?{public:!!state.publicRoom,hostName:nameVal()}:{};ws.send(JSON.stringify({game:GAME,room:state.room,clientId,name:nameVal(),...hostMeta,...msg}))}}
function persist(){send({type:'snapshot',snapshot:state})}
function connect(room){state.room=room.toUpperCase();$('roomOut').textContent=state.room;localStorage.setItem('bf.room',state.room);saveSession();if(ws)try{ws.close()}catch(e){};ws=new WebSocket(wsUrl());ws.onopen=()=>{connected=true;if(role==='host'&&!hasCreatedRoom){hasCreatedRoom=true;send({type:'create',snapshot:state});}else{send({type:'join'});}if(role!=='host') repeatJoin();};ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return}handle(m)};ws.onclose=()=>{connected=false;setTimeout(()=>state.room&&connect(state.room),1300)}}
function repeatJoin(){clearInterval(joinTimer);send({type:'joinRequest'});joinTimer=setInterval(()=>{if(state.players.some(p=>p.id===clientId))clearInterval(joinTimer);else send({type:'joinRequest'})},1100)}
function handle(m){if(m.game&&m.game!==GAME)return;if(m.type==='sessionState'&&m.snapshot){clearTimeout(reconnectTimer);reconnectTimer=null;state={...initialState(),...m.snapshot};if(role==='host')persist();render();return} if(m.type==='snapshot'&&m.clientId!==clientId){state={...initialState(),...m.snapshot};render();return} if(role==='host'){ if(m.type==='joinRequest') addPlayer(m.clientId,m.name||'Gast'); if(m.type==='playCard') playCard(m.clientId,m.name,m.cardIndexes??m.cardIndex,m.cardTexts??m.cardText); if(m.type==='redrawHand') redrawHand(m.clientId); if(m.type==='choose') chooseWinner(m.answerId); if(m.type==='continueReady') markContinue(m.clientId); if(m.type==='rematchReady') markRematch(m.clientId); }}
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
// Which card sets are in play (host choice). Falls back to "funny" so a game
// is never left without cards, and drops unknown ids defensively.
function activeCats(){const ids=DECK_META.map(d=>d.id);const c=(Array.isArray(state.categories)&&state.categories.length?state.categories:['funny']).filter(id=>ids.includes(id));return c.length?c:['funny'];}
function activeAnswers(){const lang=resolveDeckLang(state.deckLang);const out=[];for(const id of activeCats())out.push(...(catData(lang,id).answers||[]));return out.length?out:(catData(lang,'funny').answers||[]);}
function activePrompts(){const lang=resolveDeckLang(state.deckLang);const out=[];for(const id of activeCats())out.push(...(catData(lang,id).prompts||[]));return out.length?out:(catData(lang,'funny').prompts||[]);}
// Piles now hold the actual card/prompt strings (not indices) so they stay
// valid no matter which decks the host mixed together.
// Deck-Zustand: gezogene Karten/Prompts werden in usedAnswers/usedPrompts
// gemerkt, damit im selben Spiel keine Karte/kein Prompt doppelt vorkommt.
// Erst wenn der ganze Stapel einmal durch ist, wird recycelt — Karten, die
// gerade auf einer Hand liegen, bleiben dabei ausgeschlossen (keine Dubletten).
function ensurePiles(){state.drawPile=Array.isArray(state.drawPile)?state.drawPile:[];state.promptPile=Array.isArray(state.promptPile)?state.promptPile:[];state.usedAnswers=Array.isArray(state.usedAnswers)?state.usedAnswers:[];state.usedPrompts=Array.isArray(state.usedPrompts)?state.usedPrompts:[];}
function _cardsInHands(){const s=new Set();for(const id in state.hands){for(const c of state.hands[id]||[])s.add(c);}return s;}
function drawCards(count){ensurePiles();const A=activeAnswers();const out=[];for(let i=0;i<count;i++){if(!state.drawPile.length){const used=new Set(state.usedAnswers),held=_cardsInHands();let pool=A.filter(c=>!used.has(c)&&!held.has(c));if(!pool.length)pool=(state.usedAnswers=[],A.filter(c=>!held.has(c)));if(!pool.length)pool=[...A];state.drawPile=shuffle(pool);}const c=state.drawPile.pop();if(c==null)continue;out.push(c);if(!state.usedAnswers.includes(c))state.usedAnswers.push(c);}return out;}
function drawPrompt(){ensurePiles();const P=activePrompts();if(!state.promptPile.length){const used=new Set(state.usedPrompts);let pool=P.filter(p=>!used.has(p));if(!pool.length)pool=(state.usedPrompts=[],[...P]);state.promptPile=shuffle(pool);}const p=state.promptPile.pop();if(p!=null&&!state.usedPrompts.includes(p))state.usedPrompts.push(p);return p;}
function dealTo(id,count=10){state.hands[id]=drawCards(count)}
function fillHand(id){state.hands[id]=state.hands[id]||[];while(state.hands[id].length<10)state.hands[id].push(...drawCards(1));}
function refillPlayedCards(){const counts={};for(const a of state.answers||[]){const n=Array.isArray(a.cards)?a.cards.length:1;counts[a.playerId]=(counts[a.playerId]||0)+n;}for(const [id,n] of Object.entries(counts)){state.hands[id]=state.hands[id]||[];state.hands[id].push(...drawCards(n));while(state.hands[id].length>10)state.hands[id].shift();}}
function addPlayer(id,name){if(!state.players.some(p=>p.id===id)){state.players.push({id,name,score:0});state.redrawUsed[id]=false;dealTo(id,10);persist();render()}}
function currentJudge(){return state.players[state.judgeIndex%Math.max(1,state.players.length)]}
function amJudge(){return currentJudge()?.id===clientId}
function myPlayer(){return state.players.find(p=>p.id===clientId)}
function startHost(){role='host';hasCreatedRoom=false;clearSession();state=initialState();state.deckLang=resolveDeckLang($('deckLangSelect')?.value||document.documentElement.dataset.language||'de');state.target=Math.max(3,Math.min(20,Number($('targetInput')?.value)||7));state.categories=selectedCats();state.publicRoom=!!($('publicRoomCheck')&&$('publicRoomCheck').checked);state.room=makeRoom();state.phase='lobby';stopPublicRoomsPolling();ensurePiles();$('hostNameInput').value=nameVal();addPlayer(clientId,nameVal());connect(state.room);updateInvite();render();}
function joinRoom(){role='guest';clearSession();const room=($('roomInput').value||params.get('room')||'').trim().toUpperCase();if(!room)return toast(tr('blank.msg.enterRoom',{},'Raumcode fehlt'));localStorage.setItem('bf.name',nameVal());state.phase='lobby';stopPublicRoomsPolling();connect(room);render();}
// Return to this game's own menu in-page (instead of leaving the whole site).
// Wired into the shared back button (assets/game-chrome.js) via the hooks
// below. state.room is cleared first (via initialState) so the ws.onclose
// auto-reconnect — setTimeout(()=>state.room&&connect(state.room)) — sees an
// empty room and does not silently rejoin the match we are leaving.
// In-page confirm dialog. The native window.confirm() can be silently
// suppressed (sandboxed iframe without allow-modals, "block dialogs"), which
// returned false and left the back button doing nothing during a live match.
// Falls back to confirm() only when the overlay markup is unavailable.
function gameConfirm(msg,onYes,onNo){
  const ov=$('gameConfirmOverlay');
  if(!ov){ if(onYes&&window.confirm(msg))onYes(); else onNo&&onNo(); return; }
  $('gcMsg').textContent=msg;
  ov.removeAttribute('hidden');
  const close=()=>ov.setAttribute('hidden','');
  $('gcConfirmBtn').onclick=()=>{close();onYes&&onYes();};
  $('gcCancelBtn').onclick=()=>{close();onNo&&onNo();};
}

/* ── Jugendschutz: Sets ab 18 erst nach Altersbestätigung ──────────────────
   Die Einstufung der Seite steht maschinenlesbar in /age-de.xml. Die
   Bestätigung gilt je Browser, nicht je Konto — zum Spielen ist kein Konto
   nötig. Sie wird gemerkt, damit sie nicht jede Runde erneut abgefragt wird. */
const ADULT_DECKS=['spicy','dark'];
const ADULT_KEY='bf.adult.v1';
function adultConfirmed(){try{return localStorage.getItem(ADULT_KEY)==='1'}catch(e){return false}}
function askAdult(onYes,onNo){
  gameConfirm(tr('blank.adult.ask',{},'Diese Kartensets enthalten anzügliche Inhalte und schwarzen Humor und sind für Erwachsene bestimmt. Bist du mindestens 18 Jahre alt?'),
    ()=>{try{localStorage.setItem(ADULT_KEY,'1')}catch(e){}onYes&&onYes();}, onNo);
}
/* Gäste bekommen die Sets des Hosts vorgesetzt, treffen die Auswahl also nie
   selbst — deshalb greift die Abfrage auch hier, einmal je Sitzung und bevor
   die erste Karte zu sehen ist. Wer verneint, landet wieder im Menü. */
let _adultAsked=false;
function adultContentAllowed(){
  if(adultConfirmed())return true;
  const cats=Array.isArray(state.categories)?state.categories:[];
  if(!cats.some(c=>ADULT_DECKS.includes(c)))return true;
  if(state.phase==='menu'||state.phase==='lobby')return true;   // noch keine Karte sichtbar
  if(!_adultAsked){
    _adultAsked=true;
    askAdult(()=>render(),()=>{_adultAsked=false;toast(tr('blank.adult.left',{},'Ohne Bestätigung geht es hier nicht weiter.'));leaveToMenu();});
  }
  return false;
}
function leaveToMenu(){
  state=initialState();
  if(ws){try{ws.close()}catch(e){}ws=null}
  connected=false;hasCreatedRoom=false;role='guest';
  clearInterval(joinTimer);joinTimer=null;
  clearTimeout(reconnectTimer);reconnectTimer=null;
  clearTimeout(_botTimer);_botTimer=null;
  try{clearSession()}catch(e){}
  if(typeof stopPublicRoomsPolling==='function')stopPublicRoomsPolling();
  try{history.replaceState({},'',location.pathname)}catch(e){}
  render();
}
// Shared back button entry point: from a live match, confirm first (via the
// in-page dialog) before discarding the round; from the lobby/ended just go.
function backToMainMenu(){
  const live=['answering','judging','reveal'].includes(state.phase);
  if(live) gameConfirm(tr('blank.confirmMenu',{},'Zurück ins Hauptmenü? Die laufende Partie geht für dich verloren.'),leaveToMenu);
  else leaveToMenu();
}
// Shared back button: from the lobby or a live match it returns to this
// game's own menu (backToMainMenu); only the 'menu' screen counts as the top,
// from which game-chrome then leaves to the site catalogue.
window.__brettBack={
  atTop:()=>state.phase==='menu',
  up:backToMainMenu
};

let menuMode='create';
function setMenuMode(mode){menuMode=mode==='join'?'join':'create';$('modeCreateTab').classList.toggle('active',menuMode==='create');$('modeCreateTab').setAttribute('aria-selected',String(menuMode==='create'));$('modeJoinTab').classList.toggle('active',menuMode==='join');$('modeJoinTab').setAttribute('aria-selected',String(menuMode==='join'));$('joinFields').classList.toggle('hidden',menuMode!=='join');$('createFields')?.classList.toggle('hidden',menuMode!=='create');$('menuActionBtn').textContent=menuMode==='join'?tr('blank.joinRoom',{},'Raum beitreten'):tr('blank.createRoom',{},'Raum erstellen');if(menuMode==='join')startPublicRoomsPolling();else stopPublicRoomsPolling();}
let publicRoomsPollTimer=null;
async function fetchPublicRooms(){try{const res=await fetch('/api/rooms?game='+encodeURIComponent(GAME),{credentials:'include'});if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json();renderPublicRooms(Array.isArray(data.items)?data.items:[]);}catch(_){/* browsing rooms is a nice-to-have, keep the last known list on failure */}}
function renderPublicRooms(items){const box=$('publicRoomsItems');if(!box)return;if(!items.length){box.innerHTML=`<div class="public-rooms-empty muted">${esc(tr('blank.publicRooms.empty',{},'Aktuell keine öffentlichen Räume.'))}</div>`;return}box.innerHTML=items.map(item=>`<button type="button" class="public-room-row" data-room="${esc(item.room)}"><strong>${esc(item.room)}</strong><span>${esc(item.hostName||tr('rollforge.defaultHost',{},'Host'))}</span><span class="public-room-count">${item.playerCount}</span></button>`).join('');}
function startPublicRoomsPolling(){stopPublicRoomsPolling();fetchPublicRooms();publicRoomsPollTimer=setInterval(fetchPublicRooms,4000);}
function stopPublicRoomsPolling(){if(publicRoomsPollTimer)clearInterval(publicRoomsPollTimer);publicRoomsPollTimer=null;}
// ===== Card-set (deck) selection in the lobby =====
function selectedCats(){const ids=DECK_META.map(d=>d.id).filter(id=>$('deck-'+id)?.checked);return ids.length?ids:['funny'];}
function syncDeckChecks(){const cats=(Array.isArray(state.categories)&&state.categories.length?state.categories:['funny']);DECK_META.forEach(d=>{const el=$('deck-'+d.id);if(el)el.checked=cats.includes(d.id);});}
function commitDecks(){if(!selectedCats().length){/* never allow zero sets */const f=$('deck-funny');if(f)f.checked=true;}state.categories=selectedCats();if(role==='host')persist();}
function onDeckChange(ev){
  const el=ev&&ev.target;
  const id=el&&el.checked?String(el.id||'').replace(/^deck-/,''):'';
  if(id&&ADULT_DECKS.includes(id)&&!adultConfirmed()){
    // Zustand erst nach der Antwort übernehmen — sonst wäre das Set schon
    // aktiv, während der Dialog noch offen steht.
    askAdult(commitDecks,()=>{el.checked=false;commitDecks();});
    return;
  }
  commitDecks();
}
// Card language selector (host picks; cards then reach every guest via state).
function populateDeckLangSelect(){const sel=$('deckLangSelect');if(!sel)return;const langs=deckLangs();if(!langs.length)return;const cur=sel.value;sel.innerHTML=langs.map(l=>`<option value="${esc(l)}">${esc(deckLabel(l))}</option>`).join('');if(cur)sel.value=cur;}
function syncDeckLangSelect(){const sel=$('deckLangSelect');if(sel)sel.value=resolveDeckLang(state.deckLang);}
function onDeckLangChange(){const sel=$('deckLangSelect');if(!sel)return;state.deckLang=resolveDeckLang(sel.value);if(role==='host')persist();}
function startGame(){if(role!=='host')return;state.target=Math.max(3,Math.min(20,Number($('targetInput').value)||7));state.deckLang=resolveDeckLang($('deckLangSelect')?.value||state.deckLang);state.categories=selectedCats();const botCount=Math.max(0,Math.min(5,Number($('botCountInput')?.value)||0));state.players=state.players.filter(p=>!p.isBot);for(let i=0;i<botCount;i++){const bid='bot-'+(i+1);state.players.push({id:bid,name:'Bot '+(i+1),score:0,isBot:true});state.redrawUsed[bid]=false;}if(state.players.length<3)return toast(tr('blank.msg.needPlayers',{},'Mindestens 3 Spieler wären weniger traurig'));state.publicRoom=false;const pc=$('publicRoomCheck');if(pc)pc.checked=false;/* rebuild the piles + re-deal so the chosen card sets actually apply */state.drawPile=[];state.promptPile=[];state.usedAnswers=[];state.usedPrompts=[];shuffle(state.players);/* Zugreihenfolge zu Spielbeginn zufällig festlegen */state.judgeStart=Math.floor(Math.random()*state.players.length);/* erster Judge immer zufällig */state.players.forEach(p=>{dealTo(p.id,10);state.redrawUsed[p.id]=!!state.redrawUsed[p.id]});nextRound();}
function scheduleBotActions(){clearTimeout(_botTimer);if(role!=='host')return;if(state.phase==='answering'){const judgeId=currentJudge()?.id;const pendingBots=state.players.filter(p=>p.isBot&&p.id!==judgeId&&!state.answers.some(a=>a.playerId===p.id));if(!pendingBots.length)return;const blanks=blankCount(state.prompt);_botTimer=setTimeout(()=>{for(const bot of pendingBots){const hand=state.hands[bot.id]||[];if(hand.length<blanks)continue;const idxs=shuffle([...hand.keys()]).slice(0,blanks);playCard(bot.id,bot.name,idxs,idxs.map(i=>hand[i]));}},800+Math.random()*1200);}else if(state.phase==='judging'){if(currentJudge()?.isBot&&state.answers.length>0){_botTimer=setTimeout(()=>{const pick=state.answers[Math.floor(Math.random()*state.answers.length)];if(pick)chooseWinner(pick.id);},1500);}}}
function nextRound(){pending=[];refillPlayedCards();state.round++; if(state.players.some(p=>p.score>=state.target)){state.phase='ended';state.rematchVotes={};persist();render();return;} state.phase='answering';state.answers=[];state.winner=null;state.nextVotes={};state.judgeIndex=((state.judgeStart||0)+state.round-1)%state.players.length;state.prompt=drawPrompt();state.players.forEach(p=>fillHand(p.id));persist();render();}
// Lay one or more cards (one per ____ blank in the prompt). `indexes`/`texts`
// may be a single value (legacy / bots) or arrays for multi-blank prompts.
function playCard(id,name,indexes,texts){if(state.phase!=='answering'||currentJudge()?.id===id)return;if(state.answers.some(a=>a.playerId===id))return;const idxArr=Array.isArray(indexes)?indexes:[indexes];const txtArr=Array.isArray(texts)?texts:[texts];const blanks=blankCount(state.prompt);const hand=state.hands[id]||[];const cards=[],used=[];for(let k=0;k<txtArr.length;k++){const wantText=String(txtArr[k]??'');const wantIdx=Number(idxArr[k]);let pos=-1;if(Number.isInteger(wantIdx)&&hand[wantIdx]===wantText&&!used.includes(wantIdx))pos=wantIdx;else pos=hand.findIndex((c,i)=>c===wantText&&!used.includes(i));if(pos<0)continue;used.push(pos);cards.push(hand[pos]);}
  if(cards.length<blanks)return; // wait for the full set of cards before locking the answer in
  used.sort((a,b)=>b-a).forEach(i=>hand.splice(i,1));state.hands[id]=hand;
  state.answers.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),playerId:id,name,cards}); if(state.answers.length>=Math.max(0,state.players.length-1)){shuffle(state.answers);/* Antworten in zufälliger Reihenfolge zeigen */state.phase='judging';} persist();render();}
function redrawHand(id){if(state.phase!=='answering')return;if(currentJudge()?.id===id)return;if(state.answers.some(a=>a.playerId===id))return;if(state.redrawUsed[id])return;state.hands[id]=drawCards(10);state.redrawUsed[id]=true;persist();render();}
// The reveal no longer auto-advances after a few seconds — the winning card
// used to vanish before everyone could read it. Instead every human player
// clicks "gelesen – weiter" and nextRound() only fires once all have (see
// markContinue/maybeAdvance).
function chooseWinner(answerId){if(state.phase!=='judging')return;const ans=state.answers.find(a=>a.id===answerId);if(!ans)return;const p=state.players.find(p=>p.id===ans.playerId);if(p)p.score++;state.winner=answerId;state.phase='reveal';state.nextVotes={};persist();render();}

// ===== Multi-card selection (one card per blank) =====
// pending holds the cards the local player has tapped so far this round. Once
// it reaches the prompt's blank count the whole set is submitted at once.
let pending=[];
function pickCard(index){if(state.phase!=='answering'||amJudge())return;if(state.answers.some(a=>a.playerId===clientId))return;const hand=state.hands[clientId]||[];const card=hand[index];if(card==null)return;if(pending.some(p=>p.index===index)){pending=pending.filter(p=>p.index!==index);render();return;} // tap again to deselect
  pending.push({index,text:card});if(pending.length>=blankCount(state.prompt))submitPending();else render();}
function submitPending(){if(!pending.length)return;const idx=pending.map(p=>p.index),txt=pending.map(p=>p.text);pending=[];if(role==='host')playCard(clientId,nameVal(),idx,txt);else{send({type:'playCard',cardIndexes:idx,cardTexts:txt});render();}toast(tr('blank.msg.cardPlayed',{},'Karte gelegt'))}
function requestRedraw(){if(state.redrawUsed[clientId])return toast(tr('blank.msg.redrawUsed',{},'Handtausch bereits verbraten'));pending=[];if(role==='host')redrawHand(clientId);else send({type:'redrawHand'});}

// ===== "Everyone ready" gates: continue after reveal / rematch after end =====
// Bots never block — only human players have to click. The host is the source
// of truth and advances once all humans have voted.
function humanPlayers(){return state.players.filter(p=>!p.isBot)}
function voteContinue(){if(state.phase!=='reveal')return;state.nextVotes=state.nextVotes||{};state.nextVotes[clientId]=true;if(role==='host')markContinue(clientId);else send({type:'continueReady'});render()}
function markContinue(id){if(state.phase!=='reveal')return;state.nextVotes=state.nextVotes||{};state.nextVotes[id]=true;persist();render();maybeAdvance()}
function maybeAdvance(){if(role!=='host'||state.phase!=='reveal')return;if(humanPlayers().every(p=>state.nextVotes&&state.nextVotes[p.id]))nextRound()}
function voteRematch(){if(state.phase!=='ended')return;state.rematchVotes=state.rematchVotes||{};state.rematchVotes[clientId]=true;if(role==='host')markRematch(clientId);else send({type:'rematchReady'});render()}
function markRematch(id){if(state.phase!=='ended')return;state.rematchVotes=state.rematchVotes||{};state.rematchVotes[id]=true;persist();render();maybeRestart()}
function maybeRestart(){if(role!=='host'||state.phase!=='ended')return;if(humanPlayers().every(p=>state.rematchVotes&&state.rematchVotes[p.id]))doRematch()}
function doRematch(){state.players.forEach(p=>p.score=0);state.round=0;state.answers=[];state.winner=null;state.hands={};state.drawPile=[];state.promptPile=[];state.usedAnswers=[];state.usedPrompts=[];shuffle(state.players);/* neues Spiel → Zugreihenfolge & Deck frisch */state.judgeStart=Math.floor(Math.random()*state.players.length);/* erster Judge immer zufällig */state.redrawUsed={};state.rematchVotes={};state.nextVotes={};state.players.forEach(p=>{state.redrawUsed[p.id]=false;dealTo(p.id,10)});nextRound()}
function updateInvite(){const link=new URL(location.href);link.searchParams.set('room',state.room);$('inviteInput').value=link.toString()}
function copyInvite(){const v=$('inviteInput').value; if(navigator.clipboard)navigator.clipboard.writeText(v).then(()=>toast(tr('blank.msg.linkCopied',{},'Link kopiert'))).catch(fallback); else fallback(); function fallback(){const i=$('inviteInput');i.focus();i.select();document.execCommand('copy');toast(tr('blank.msg.linkCopied',{},'Link kopiert'))}}
// Zieh-Sound zentral & zustandsbasiert: genau EINMAL, wenn eine neue schwarze
// Karte gelegt wird (prompt wechselt) und EINMAL je gelegter Antwort
// (answers wächst). Ersetzt die verstreuten playDrawSound()-Aufrufe, die den
// Ton pro Karten-Tipp UND beim Sperren doppelt auslösten.
let _sndPrompt=null,_sndAnswers=0,_sndInit=false;
function checkDrawSounds(){
  const p=state.prompt||'', a=(state.answers||[]).length;
  if(!_sndInit){_sndInit=true;_sndPrompt=p;_sndAnswers=a;return;}   // Erstzustand/Reconnect ohne Ton
  if(p&&p!==_sndPrompt) playDrawSound();       // neue schwarze Karte
  else if(a>_sndAnswers) playDrawSound();       // eine Antwort wurde gelegt
  _sndPrompt=p;_sndAnswers=a;
}
function render(){ checkDrawSounds(); $('roomOut').textContent=state.room||'—';$('phaseOut').textContent=phaseLabel(state.phase); $('menuBox').classList.toggle('hidden',state.phase!=='menu');$('lobbyBox').classList.toggle('hidden',state.phase!=='lobby'||role!=='host'); if(state.room)updateInvite(); const pc=$('publicRoomCheck');if(pc)pc.checked=!!state.publicRoom; syncDeckChecks(); syncDeckLangSelect(); renderPlayers(); renderStage(); scheduleBotActions(); maybeSpeak();}
function phaseLabel(p){return ({menu:'Menü',lobby:'Lobby',answering:'Antworten',judging:'Judge',reveal:'Auflösung',ended:'Ende'}[p]||p)}
function renderPlayers(){const box=$('playersList');box.innerHTML=state.players.map((p,i)=>`<div class="item ${p.id===clientId?'active':''}"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(p.name)}${currentJudge()?.id===p.id?' <span class="judge">Judge</span>':''}</strong><span class="score">${p.score}</span></div><div class="mini">${(state.hands[p.id]||[]).length} Karten · ${state.redrawUsed[p.id]?'Handtausch weg':'Handtausch offen'}</div></div>`).join('')||'<p class="muted">Noch niemand am Tisch. Typisch.</p>'}
function renderStage(){const s=$('stage');
  if(!adultContentAllowed()){s.innerHTML=`<div class="center"><div><div class="big">18+</div><p class="muted">${esc(tr('blank.adult.blocked',{},'Dieser Raum spielt mit Kartensets für Erwachsene. Bitte bestätige dein Alter.'))}</p></div></div>`;return}
  if(state.phase==='lobby'){s.innerHTML=`<div><div class="big">Lobby</div><p class="muted">${reconnectTimer?'Verbinde erneut…':role==='host'?'Teile den Link. Ab drei Leuten darf die soziale Selbstachtung sinken.':'Du bist im Raum. Warte auf den Host.'}</p></div>`;return}
  if(state.phase==='answering'){
    const submitted=state.answers.some(a=>a.playerId===clientId);const judge=amJudge();const hand=state.hands[clientId]||[];
    const blanks=blankCount(state.prompt);const picked=pending.map(p=>p.text);
    const promptShow=pending.length?fillBlanks(state.prompt,picked):promptHtml(state.prompt);
    let body;
    if(judge)body='<p class="muted">Du bist Judge. Keine Karte legen, nur später gnadenlos urteilen.</p>';
    else if(submitted)body='<p class="muted">Karte liegt. Jetzt so tun, als wäre das genau die richtige Entscheidung gewesen.</p>';
    else{
      const hint=blanks>1?`<div class="pick-hint">Diese Karte hat ${blanks} Lücken – wähle ${blanks} Karten nacheinander. ${pending.length}/${blanks} gewählt.</div>`:'';
      const cards=hand.map((c,i)=>`<button class="white-card ${pending.some(p=>p.index===i)?'chosen':''}" data-card="${i}">${esc(c)}</button>`).join('');
      body=`${hint}<div class="hand-actions"><button class="secondary" id="redrawBtn" ${state.redrawUsed[clientId]?'disabled':''}>Hand abwerfen & neu ziehen</button><span class="muted">Einmal pro Partie. Danach ist Schluss mit Karten-Wellness.</span></div><div class="hand-grid">${cards}</div>`;
    }
    s.innerHTML=`<div style="width:100%"><div class="phase-tag">Runde ${state.round} · ${esc(currentJudge()?.name||'Judge')} urteilt · erster mit ${state.target} Punkten gewinnt</div><div class="prompt">${promptShow}</div>${body}</div>`;
    s.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>pickCard(Number(b.dataset.card)));
    $('redrawBtn')?.addEventListener('click',requestRedraw);
    return;
  }
  if(state.phase==='judging'||state.phase==='reveal'){
    const judge=amJudge();
    const answersHtml=state.answers.map(a=>`<div class="answer-card ${state.winner===a.id?'winner':''}">${ansText(a)}${state.phase==='judging'&&judge?`<button class="good" data-pick="${a.id}">Gewinnt</button>`:''}${state.phase==='reveal'?`<div class="muted" style="color:#17120a;margin-top:8px">— ${esc(a.name)}</div>`:''}</div>`).join('');
    let footer='';
    if(state.phase==='reveal'){
      const humans=humanPlayers();const ready=humans.filter(p=>state.nextVotes&&state.nextVotes[p.id]).length;const iReady=!!(state.nextVotes&&state.nextVotes[clientId]);
      footer=`<div class="continue-box"><button class="good" id="continueBtn" ${iReady?'disabled':''}>${iReady?'Warte auf die anderen…':'Gelesen – weiter'}</button><span class="muted">${ready}/${humans.length} bereit</span></div>`;
    }
    s.innerHTML=`<div style="width:100%"><div class="phase-tag">Judge-Zeit</div><div class="prompt">${promptHtml(state.prompt)}</div><div class="list" style="margin-top:18px">${answersHtml}</div>${footer}</div>`;
    s.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>role==='host'?chooseWinner(b.dataset.pick):send({type:'choose',answerId:b.dataset.pick}));
    $('continueBtn')?.addEventListener('click',voteContinue);
    return;
  }
  if(state.phase==='ended'){
    const ranking=[...state.players].sort((a,b)=>b.score-a.score);
    const champ=ranking[0];const iWon=!!(champ&&champ.id===clientId);
    const humans=humanPlayers();const ready=humans.filter(p=>state.rematchVotes&&state.rematchVotes[p.id]).length;const iReady=!!(state.rematchVotes&&state.rematchVotes[clientId]);
    const medals=['🥇','🥈','🥉'];
    s.innerHTML=`<div class="victory" style="width:min(720px,100%)"><div class="crown">👑</div><div class="phase-tag" style="font-size:15px">Siegerehrung</div><div class="champ-name">${esc(champ?champ.name:'—')}</div><div class="champ-sub">${iWon?'Du gewinnst':'gewinnt'} mit ${champ?champ.score:0} Punkten!</div><ol class="ranking">${ranking.map((p,i)=>`<li class="${i===0?'gold':''}"><span>${medals[i]||(i+1)+'.'} ${esc(p.name)}</span><strong>${p.score}</strong></li>`).join('')}</ol><div class="continue-box"><button class="good" id="againBtn" ${iReady?'disabled':''}>${iReady?'Warte auf die anderen…':'Neue Runde spielen'}</button><span class="muted">${ready}/${humans.length} wollen nochmal – alle müssen zustimmen</span></div><div class="endmenu"><button class="secondary" id="toMenuBtn">Zurück ins Hauptmenü</button></div></div>`;
    $('againBtn')?.addEventListener('click',voteRematch);
    $('toMenuBtn')?.addEventListener('click',backToMainMenu);
    return;
  }
  s.innerHTML='<div><div class="big">Blank<br>& Frech</div><p class="muted">Raum erstellen oder beitreten.</p></div>';}

// ===== Humorvolle Sprachausgabe ==========================================
// Liest den Lückentext (Setup) und die Gewinnerkarte (Pointe) laut vor — in
// der Kartensprache des Hosts (state.deckLang), also automatisch in allen acht
// Deck-Sprachen. Komödiantisches Timing: Kunstpause an der Lücke, höhere
// Tonlage + langsameres Tempo für die Pointe, rotierende freche Ansagen und
// eine kurze Reaktion hinterher. Jeder Client liest für sich vor; per 🔊 im
// Header abschaltbar (Einstellung wird gemerkt).
const _synth = window.speechSynthesis || null;
let voiceOn = (()=>{try{return (localStorage.getItem('bf.voice')||'1')==='1'}catch(e){return true}})();
// Lautstärke der Sprachausgabe (0..1), pro Gerät gespeichert.
let _voiceVol = (()=>{try{const v=parseFloat(localStorage.getItem('bf.voiceVol'));return isNaN(v)?1:Math.min(1,Math.max(0,v))}catch(e){return 1}})();
// Manuell gewählte Stimme je Vorlese-Sprache (lokal pro Gerät, {lang: voiceURI})
let _voiceSel=(()=>{try{return JSON.parse(localStorage.getItem('bf.voiceSel')||'{}')||{}}catch(e){return {}}})();
// Grund-Tempo der Sprachausgabe: >1 = schneller. Standard-TTS bei 1.0 klingt langsam/roboterhaft;
// ein leicht erhöhtes Tempo wirkt natürlicher. Skaliert alle Teil-Raten (deren Variation bleibt erhalten).
const VOICE_RATE=1.2;
const _voicePhrases={
  de:{set:["Neue Runde. Füll die Lücke:","Achtung, Denksport:","Bitte ergänzen:"],win:["Und die Gewinnerkarte:","Die frechste Antwort:","Der Sieger des schlechten Geschmacks:"],react:["Autsch.","Grenzwertig.","Haha, gnadenlos.","Na dann Prost."]},
  en:{set:["New round. Fill the blank:","Brain time, complete this:","Please fill in:"],win:["And the winning card:","The cheekiest answer:","Champion of bad taste:"],react:["Ouch.","Bold move.","Ha, merciless.","Cheers to that."]},
  fr:{set:["Nouvelle manche. Complétez :","Attention, à trous :","À vous de compléter :"],win:["Et la carte gagnante :","La réponse la plus culottée :","Le champion du mauvais goût :"],react:["Aïe.","Audacieux.","Ha, sans pitié.","Santé."]},
  es:{set:["Nueva ronda. Rellena el hueco:","Atención, completa esto:","A rellenar:"],win:["Y la carta ganadora:","La respuesta más descarada:","Campeón del mal gusto:"],react:["Ay.","Qué atrevido.","Ja, sin piedad.","Salud."]},
  it:{set:["Nuovo round. Riempi lo spazio:","Attenzione, completa:","Da completare:"],win:["E la carta vincente:","La risposta più sfacciata:","Campione del cattivo gusto:"],react:["Ahia.","Che coraggio.","Ah, senza pietà.","Salute."]},
  ru:{set:["Новый раунд. Заполни пропуск:","Внимание, дополни:","Заполните:"],win:["И карта-победитель:","Самый дерзкий ответ:","Чемпион дурного вкуса:"],react:["Ай.","Смело.","Ха, беспощадно.","Ну за это."]},
  zh:{set:["新一轮，填空：","注意，请补全：","请填空："],win:["获胜卡牌：","最毒舌的答案：","低级趣味冠军："],react:["哎哟。","够大胆。","哈，毫不留情。","干杯。"]},
  ja:{set:["新しいラウンド。穴を埋めて：","さあ、埋めましょう：","空欄を埋めて："],win:["優勝カードは：","一番きわどい答え：","悪趣味チャンピオン："],react:["いてっ。","攻めるね。","容赦ないね。","乾杯。"]}
};
function _phr(lang,kind){const t=_voicePhrases[lang]||_voicePhrases.en;const a=t[kind]||[];return a.length?a[Math.floor(Math.random()*a.length)]:'';}
function _bcp(lang){return ({de:'de-DE',en:'en-US',fr:'fr-FR',es:'es-ES',it:'it-IT',ru:'ru-RU',zh:'zh-CN',ja:'ja-JP'})[lang]||lang;}
function _voiceScore(v,lang){let s=0;const n=(v.name||'').toLowerCase();if(new RegExp('^'+lang,'i').test(v.lang||''))s+=5;if(/natural|neural|online|premium|enhanced/.test(n))s+=6;if(/google/.test(n))s+=3;if(v.localService===false)s+=2;return s;}
let _voiceFor={};
function pickVoice(lang){if(!_synth)return null;const all=_synth.getVoices()||[];if(!all.length)return null;/* Stimmen noch nicht geladen → nicht cachen */const sel=_voiceSel[lang];if(sel){const v=all.find(x=>x.voiceURI===sel);if(v)return v;}if(lang in _voiceFor)return _voiceFor[lang];const match=all.filter(v=>new RegExp('^'+lang,'i').test(v.lang||''));const pool=(match.length?match:all).slice().sort((a,b)=>_voiceScore(b,lang)-_voiceScore(a,lang));return (_voiceFor[lang]=pool[0]||null);}
if(_synth){try{_synth.addEventListener('voiceschanged',()=>{_voiceFor={};});}catch(e){}}
// Chrome/Safari-Bug: ein speak() direkt nach cancel() beginnt oft mitten im Satz,
// weil die Sprach-Queue noch nicht geleert ist. Eine kurze Pause nach dem Abbruch behebt das.
let _speakTimer=null;
function _afterCancel(fn){if(_speakTimer){clearTimeout(_speakTimer);_speakTimer=null;}try{_synth&&_synth.cancel()}catch(e){}_speakTimer=setTimeout(()=>{_speakTimer=null;fn();},180);}
function speakSeq(parts,lang){if(!_synth||!voiceOn)return;const voice=pickVoice(lang);_afterCancel(()=>{let i=0;const next=()=>{if(i>=parts.length)return;const p=parts[i++];if(!p||!p.text){next();return;}const u=new SpeechSynthesisUtterance(p.text);u.lang=(voice&&voice.lang)||_bcp(lang);if(voice)u.voice=voice;u.rate=Math.min(2,(p.rate||1)*VOICE_RATE);u.pitch=p.pitch||1;u.volume=_voiceVol;u.onend=next;u.onerror=next;try{_synth.speak(u)}catch(e){next()}};try{_synth.resume()}catch(e){}next();});}
function cancelSpeech(){if(_speakTimer){clearTimeout(_speakTimer);_speakTimer=null;}if(_synth){try{_synth.cancel()}catch(e){}}}
// Lücke → gesprochene Kunstpause; bei der Pointe → die tatsächlichen Karten.
function _speakBlanks(p){return String(p||'').replace(/____/g,' … ')}
function _speakFill(p,cards){let i=0;return String(p||'').replace(/____/g,()=>{const c=cards[i++];return c?('„'+c+'“'):' … ';})}
let _spokeSig='';
function maybeSpeak(){
  if(!_synth||!voiceOn)return;
  const lang=resolveDeckLang(state.deckLang);
  if(state.phase==='answering'&&state.prompt){
    const sig='a'+state.round;
    if(sig!==_spokeSig){_spokeSig=sig;
      speakSeq([{text:_phr(lang,'set'),rate:1.02,pitch:1.06},{text:_speakBlanks(state.prompt),rate:0.98,pitch:1.0}],lang);
    }
  }else if(state.phase==='reveal'&&state.winner){
    const sig='r'+state.round+':'+state.winner;
    if(sig!==_spokeSig){_spokeSig=sig;
      const ans=(state.answers||[]).find(a=>a.id===state.winner);
      const cards=ans?(Array.isArray(ans.cards)?ans.cards:(ans.answer!=null?[ans.answer]:[])):[];
      speakSeq([{text:_phr(lang,'win'),rate:0.98,pitch:1.16},{text:_speakFill(state.prompt,cards),rate:0.95,pitch:1.24},{text:_phr(lang,'react'),rate:1.0,pitch:1.12}],lang);
    }
  }else if(state.phase==='menu'||state.phase==='lobby'||state.phase==='ended'){
    _spokeSig='';   // zurücksetzen, damit die nächste Partie wieder vorgelesen wird
  }
}
/* Sprachausgabe-Einstellungen (⚙): jeder Client steuert seine eigene Ausgabe —
   An/Aus + Stimmenauswahl je Vorlese-Sprache, lokal pro Gerät gemerkt. */
function _bfVoicesFor(lang){
  if(!_synth)return [];
  const all=_synth.getVoices()||[];
  const match=all.filter(v=>new RegExp('^'+lang,'i').test(v.lang||''));
  return (match.length?match:all).slice().sort((a,b)=>_voiceScore(b,lang)-_voiceScore(a,lang));
}
function _bfCurLang(){try{return resolveDeckLang(state&&state.deckLang);}catch(e){return 'de';}}
function populateVoiceSelectBF(){
  const sel=$('voiceSelectBF');if(!sel)return;
  const lang=_bfCurLang();
  const list=_bfVoicesFor(lang);
  sel.innerHTML='';
  const auto=document.createElement('option');
  auto.value='';auto.textContent=tr('blank.voice.auto',{},'Automatisch');
  sel.appendChild(auto);
  list.forEach(v=>{const o=document.createElement('option');o.value=v.voiceURI;o.textContent=v.name+' ('+v.lang+')';sel.appendChild(o);});
  const chosen=_voiceSel[lang]||'';
  sel.value=(chosen&&list.some(v=>v.voiceURI===chosen))?chosen:'';
}
function _bfSoundBtn(){const s=document.querySelector('.bs-ico');return s?(s.closest('button')||s.parentElement):null;}
function updateVoiceButtonBF(){const ico=voiceOn?'🔊':'🔇';const b=$('voiceSettingsBtn');if(b)b.textContent=ico;const s=document.querySelector('.bs-ico');if(s)s.textContent=ico;}
function openVoiceSettings(){
  const ov=$('voiceSettingsOverlay');if(!ov)return;
  const chk=$('voiceOnChk');if(chk)chk.checked=voiceOn;
  const vol=$('voiceVolBF');if(vol)vol.value=_voiceVol;
  populateVoiceSelectBF();
  ov.removeAttribute('hidden');
}
function closeVoiceSettings(){$('voiceSettingsOverlay')?.setAttribute('hidden','');}
/* Sound-/Sprach-Menü über den geteilten Chrome-Sound-Button (.bs-ico) öffnen statt über einen eigenen Button.
   Klick wird in der Capture-Phase abgefangen und gestoppt, damit die ursprüngliche Mute-Funktion nicht zusätzlich auslöst. */
document.addEventListener('click',function(e){const t=e.target;const b=t&&t.closest?t.closest('button'):null;if(b&&b.querySelector&&b.querySelector('.bs-ico')){e.stopImmediatePropagation();e.preventDefault();openVoiceSettings();}},true);
function _bfLabelSoundBtn(){const b=_bfSoundBtn();if(!b)return;const l=tr('blank.voice.settings',{},'Sprachausgabe');try{b.setAttribute('aria-label',l);b.setAttribute('title',l);}catch(_e){}}
_bfLabelSoundBtn();
$('voiceSettingsBtn')?.addEventListener('click',openVoiceSettings);
$('voiceCloseBtn')?.addEventListener('click',closeVoiceSettings);
$('voiceSettingsOverlay')?.addEventListener('click',e=>{if(e.target.id==='voiceSettingsOverlay')closeVoiceSettings();});
$('voiceOnChk')?.addEventListener('change',e=>{voiceOn=!!e.target.checked;try{localStorage.setItem('bf.voice',voiceOn?'1':'0')}catch(_e){}updateVoiceButtonBF();if(!voiceOn)cancelSpeech();else{_spokeSig='';maybeSpeak();}});
$('voiceVolBF')?.addEventListener('input',e=>{_voiceVol=Math.min(1,Math.max(0,parseFloat(e.target.value)||0));try{localStorage.setItem('bf.voiceVol',String(_voiceVol))}catch(_e){}});
$('voiceVolBF')?.addEventListener('change',()=>{if(!_synth||!voiceOn)return;const lang=_bfCurLang();const v=pickVoice(lang);_afterCancel(()=>{const u=new SpeechSynthesisUtterance(_phr(lang,'set')||'Test');u.lang=(v&&v.lang)||_bcp(lang);if(v)u.voice=v;u.rate=VOICE_RATE;u.volume=_voiceVol;try{_synth.resume()}catch(_e){}try{_synth.speak(u)}catch(_e){}});});
updateVoiceButtonBF();
$('voiceSelectBF')?.addEventListener('change',e=>{const lang=_bfCurLang();const uri=e.target.value;if(uri)_voiceSel[lang]=uri;else delete _voiceSel[lang];delete _voiceFor[lang];try{localStorage.setItem('bf.voiceSel',JSON.stringify(_voiceSel))}catch(_e){}});
$('voiceTestBF')?.addEventListener('click',()=>{if(!_synth)return;const lang=_bfCurLang();const v=pickVoice(lang);_afterCancel(()=>{const u=new SpeechSynthesisUtterance(_phr(lang,'set')||'Test');u.lang=(v&&v.lang)||_bcp(lang);if(v)u.voice=v;u.rate=VOICE_RATE;try{_synth.resume()}catch(_e){}try{_synth.speak(u)}catch(_e){}});});

$('modeCreateTab').onclick=()=>setMenuMode('create');$('modeJoinTab').onclick=()=>setMenuMode('join');$('menuActionBtn').onclick=()=>{if(menuMode==='join')joinRoom();else startHost();};$('startBtn').onclick=startGame;$('copyBtn').onclick=copyInvite;$('publicRoomCheck').onchange=()=>{state.publicRoom=$('publicRoomCheck').checked;if(role==='host')persist();};DECK_META.forEach(d=>{const el=$('deck-'+d.id);if(el)el.onchange=onDeckChange;});populateDeckLangSelect();{const dl=$('deckLangSelect');if(dl)dl.onchange=onDeckLangChange;}$('publicRoomsItems').addEventListener('click',e=>{const row=e.target.closest('.public-room-row');if(!row||!row.dataset.room)return;$('roomInput').value=row.dataset.room;joinRoom();});$('nameInput').value=localStorage.getItem('bf.name')||'';$('hostNameInput').value=$('nameInput').value||'Host';
/* Name automatisch aus dem angemeldeten Konto vorausfüllen (Anzeigename), ohne einen bereits selbst gewählten Namen zu überschreiben. Auth-Status lädt asynchron, daher zusätzlich auf das Auth-Change-Event hören. */
function authName(){try{const st=window.BrettAuth&&BrettAuth.getState&&BrettAuth.getState();if(st&&st.authenticated&&st.user)return String(st.user.displayName||st.user.username||'').trim().slice(0,24);}catch(e){}return '';}
function autofillAuthName(){const dn=authName();if(!dn)return;const ni=$('nameInput'),hi=$('hostNameInput');if(ni&&!ni.value.trim())ni.value=dn;if(hi&&(!hi.value.trim()||hi.value==='Host'))hi.value=dn;try{if(!(localStorage.getItem('bf.name')||'').trim())localStorage.setItem('bf.name',dn);}catch(e){}}
autofillAuthName();window.addEventListener('brettspiele-auth-change',autofillAuthName);
if(params.get('room')){$('roomInput').value=params.get('room').toUpperCase();setMenuMode('join');}(function(){const sess=getSavedSession();if(sess&&sess.room){role=sess.role||'guest';hasCreatedRoom=true;const n=localStorage.getItem('bf.name')||'';if(n){$('nameInput').value=n;$('hostNameInput').value=n;}state.phase='lobby';stopPublicRoomsPolling();reconnectTimer=setTimeout(()=>{reconnectTimer=null;state=initialState();clearSession();render();},15000);connect(sess.room);}else if(params.get('room')){/* Invite-Link → Beitritts-Formular mit editierbarem, vorausgefülltem Namensfeld zeigen, statt automatisch beizutreten (Name vor dem Beitreten wählbar) */setMenuMode('join');const ni=$('nameInput');if(ni)setTimeout(()=>{ni.focus();ni.select();},0);}render();}());
window.addEventListener('brettspiele-language-change',()=>{if($('voiceSettingsOverlay')&&!$('voiceSettingsOverlay').hasAttribute('hidden'))populateVoiceSelectBF();_bfLabelSoundBtn();render();});

})();
