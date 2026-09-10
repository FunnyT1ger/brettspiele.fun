
(function(){
'use strict';
const GAME='buchstabensturm';
const $=id=>document.getElementById(id);
const clientId=sessionStorage.getItem('slf.clientId') || (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()));
sessionStorage.setItem('slf.clientId',clientId);
let role='guest', ws=null, joinTimer=null, validationRun=0, hasCreatedRoom=false, reconnectTimer=null, menuMode='create';
let draft={}, draftRound=-1, lastSubmitRound=-1;
const params=new URLSearchParams(location.search);
const I18N=window.BFI18N||null;
const tr=(key,vars={},fallback='')=>I18N?.t(key,vars,fallback)??(fallback||key);
function playDrawSound(){window.BrettSounds?.play?.('draw')}
function saveSession(){try{sessionStorage.setItem('slf.session',JSON.stringify({room:state.room,role}))}catch(e){}}
function clearSession(){try{sessionStorage.removeItem('slf.session')}catch(e){}}
function getSavedSession(){try{return JSON.parse(sessionStorage.getItem('slf.session')||'null')}catch(e){return null}}
/* ===== DIAGNOSE-PATCH (temporär) — Ergebnistafel-Bug im Mehrspieler ==========
   Zeigt jede Ausnahme (auch asynchrone) + Kontext sichtbar unten auf der Seite,
   damit der eigentliche Fehler beim Spiel mit Freunden ablesbar/screenshotbar
   wird. Nach der Diagnose wieder entfernen (dieser ganze Block + die
   try/catch-Umhüllungen in finishRound/renderReview/runValidationChecks). */
function _slfDiag(label, info){
  try{
    const msg = (info && (info.stack || info.message)) ? String(info.stack || info.message) : String(info);
    console.error('[SLF-DIAG]', label, info);
    let box = document.getElementById('slfDiagBox');
    if(!box){
      box = document.createElement('div');
      box.id = 'slfDiagBox';
      box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;max-height:46vh;overflow:auto;background:#2a0d0d;color:#ffd7d7;border:2px solid #ff5b65;border-radius:12px;padding:12px 14px 12px;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;box-shadow:0 10px 30px rgba(0,0,0,.5)';
      const head = document.createElement('div');
      head.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;font-weight:900';
      head.innerHTML='<span>🩺 SLF-Diagnose (bitte abfotografieren)</span>';
      const close = document.createElement('button');
      close.textContent = '× schließen';
      close.style.cssText = 'background:#ff5b65;color:#180404;border:0;border-radius:8px;padding:4px 10px;font-weight:900;cursor:pointer';
      close.onclick = () => box.remove();
      head.appendChild(close); box.appendChild(head);
      (document.body||document.documentElement).appendChild(box);
    }
    const line = document.createElement('div');
    line.style.cssText='border-top:1px solid rgba(255,91,101,.35);padding-top:6px;margin-top:6px';
    line.textContent = '⚠ ' + label + ': ' + msg;
    box.appendChild(line);
  }catch(_){}
}
window.addEventListener('error', e => _slfDiag('window.error', e.error || (e.message+' @'+e.filename+':'+e.lineno)));
window.addEventListener('unhandledrejection', e => _slfDiag('unhandledrejection', e.reason));
/* ===== /DIAGNOSE-PATCH ===================================================== */
const ALL_PREDEFINED=[
  {id:'city',group:'classic'},{id:'country',group:'classic'},{id:'river',group:'classic'},{id:'name',group:'classic'},{id:'animal',group:'classic'},{id:'job',group:'classic'},{id:'plant',group:'classic'},
  {id:'tree',group:'nature'},{id:'bird',group:'nature'},{id:'fish',group:'nature'},{id:'insect',group:'nature'},{id:'flower',group:'nature'},{id:'mountain',group:'nature'},{id:'lake',group:'nature'},
  {id:'movie',group:'culture'},{id:'book',group:'culture'},{id:'sport',group:'culture'},{id:'carbrand',group:'culture'},{id:'food',group:'culture'},{id:'drink',group:'culture'},{id:'band',group:'culture'},{id:'instrument',group:'culture'},{id:'subject',group:'culture'},{id:'language',group:'culture'},{id:'color',group:'culture'},{id:'clothing',group:'culture'},{id:'bodypart',group:'culture'},
  {id:'fridge',group:'silly'},{id:'excuse',group:'silly'},{id:'fantasy',group:'silly'},{id:'wifi',group:'silly'},{id:'boardgame',group:'silly'},{id:'superpower',group:'silly'},{id:'dragon',group:'silly'},{id:'invention',group:'silly'},
];
const DEFAULT_CATS=['city','country','river','name','animal','job','plant'];
const CAT_GROUPS={classic:'slf.cat.group.classic',nature:'slf.cat.group.nature',culture:'slf.cat.group.culture',silly:'slf.cat.group.silly'};
const customCat=(label)=>({id:'custom-'+Math.random().toString(36).slice(2,8),label:String(label||'').trim()});
function catId(cat){return typeof cat==='object'&&cat?cat.id:String(cat||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')||'cat';}
function catLabel(cat){if(typeof cat==='object'&&cat)return cat.label||cat.id;return tr('slf.cat.'+cat,{},String(cat||''));}
function normalizeCats(cats){return (cats||[]).map(c=>typeof c==='string'&&['Stadt','Land','Fluss','Tier','Beruf','Pflanze','Name'].includes(c)?({Stadt:'city',Land:'country',Fluss:'river',Tier:'animal',Beruf:'job',Pflanze:'plant',Name:'name'}[c]):c);}

const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.replace(/[QXY]/g,'').split('');
let state={phase:'menu',room:'',players:[],categories:[...DEFAULT_CATS],seconds:90,rounds:8,round:0,letter:'',deadline:0,submissions:{},scores:{},history:[],review:null,publicRoom:false};
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function norm(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9äöüß\s-]/g,'').replace(/\s+/g,' ')}
function startsWithLetter(value,letter){return norm(value).replace(/^der |^die |^das |^the |^el |^la |^le |^les |^il |^lo |^l'/,'').toUpperCase().startsWith(letter)}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1700)}
function gameConfirm(msg,onYes){const ov=$('gameConfirmOverlay');if(!ov){if(onYes&&confirm(msg))onYes();return}$('gcMsg').textContent=msg;ov.removeAttribute('hidden');const close=()=>ov.setAttribute('hidden','');$('gcConfirmBtn').onclick=()=>{close();onYes()};$('gcCancelBtn').onclick=close}
function makeRoom(){return Math.random().toString(36).slice(2,8).toUpperCase()} function nameVal(){return ($('nameInput').value||$('hostNameInput').value||localStorage.getItem('slf.name')||tr('rollforge.player',{},'Spieler')).trim().slice(0,24)}
/* theme toggle handled by shared assets/game-chrome.js */
function wsUrl(){if(location.protocol==='file:')return 'ws://localhost:8787/ws';return (location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws'}
function send(msg){if(ws&&ws.readyState===1){const hostMeta=role==='host'?{public:!!state.publicRoom,hostName:nameVal()}:{};ws.send(JSON.stringify({game:GAME,room:state.room,clientId,name:nameVal(),...hostMeta,...msg}))}} function persist(){send({type:'snapshot',snapshot:state})}
function connect(room){state.room=room.toUpperCase();$('roomOut').textContent=state.room;localStorage.setItem('slf.room',state.room);saveSession(); if(ws)try{ws.close()}catch(e){}; ws=new WebSocket(wsUrl()); ws.onopen=()=>{if(role==='host'&&!hasCreatedRoom){hasCreatedRoom=true;send({type:'create',snapshot:state});}else{send({type:'join'});}if(role!=='host')repeatJoin()}; ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return}handle(m)}; ws.onclose=()=>setTimeout(()=>state.room&&connect(state.room),1300)}
function repeatJoin(){clearInterval(joinTimer);send({type:'joinRequest'});joinTimer=setInterval(()=>{if(state.players.some(p=>p.id===clientId))clearInterval(joinTimer);else send({type:'joinRequest'})},1000)}
function handle(m){if(m.game&&m.game!==GAME)return;if(m.type==='sessionState'&&m.snapshot){clearTimeout(reconnectTimer);reconnectTimer=null;state={...state,...m.snapshot};state.categories=normalizeCats(state.categories);if(role==='host')persist();render();return} if(m.type==='snapshot'&&m.clientId!==clientId){state={...state,...m.snapshot};state.categories=normalizeCats(state.categories);render();return} if(role==='host'){if(m.type==='joinRequest')addPlayer(m.clientId,m.name||'Gast'); if(m.type==='submit')addSubmission(m.clientId,m.name,m.answers); if(m.type==='judge')applyDecision(m.playerId,m.category,m.status,m.clientId)}}
function addPlayer(id,name){if(!state.players.some(p=>p.id===id)){state.players.push({id,name});state.scores[id]=state.scores[id]||0;persist();render()}}
function hostRoom(){role='host';hasCreatedRoom=false;clearSession();state={phase:'lobby',room:makeRoom(),players:[],categories:[...DEFAULT_CATS],seconds:90,rounds:8,round:0,letter:'',deadline:0,submissions:{},scores:{},history:[],review:null,publicRoom:false}; addPlayer(clientId,nameVal()); $('hostNameInput').value=nameVal(); connect(state.room); history.pushState({},'','?room='+state.room); render();}
function joinRoom(){role='guest';clearSession();const room=($('roomInput').value||params.get('room')||'').trim().toUpperCase(); if(!room)return toast('Raumcode fehlt');localStorage.setItem('slf.name',nameVal());state.phase='lobby';connect(room);history.pushState({},'','?room='+room);render()}
function updateLobbySettings(){state.seconds=Number($('secondsInput').value)||90;state.rounds=Number($('roundsInput').value)||8;state.categories=normalizeCats(state.categories).filter(c=>typeof c==='string'||c.label);if(!state.categories.length)state.categories=[...DEFAULT_CATS];}
function endGame(){if(role!=='host')return;gameConfirm(tr('slf.confirmEnd',{},'Spiel wirklich beenden?'),()=>{if(state.phase==='review')commitReview();state.phase='ended';persist();render();})}
function leaveToMenu(){
  if(ws){try{ws.close()}catch(e){}ws=null}
  clearInterval(joinTimer);clearTimeout(reconnectTimer);reconnectTimer=null;
  clearSession();role='guest';hasCreatedRoom=false;
  state={phase:'menu',room:'',players:[],categories:[...DEFAULT_CATS],seconds:90,rounds:8,round:0,letter:'',deadline:0,submissions:{},scores:{},history:[],review:null,publicRoom:false};
  history.replaceState({},'',location.pathname);
  render();
}
function backToMainMenu(){
  const inMatch=['playing','review'].includes(state.phase);
  const msg=(role==='host'&&inMatch)?tr('slf.confirmMenuHost',{},'Zum Hauptmenü zurück? Das Spiel wird damit für alle Mitspieler beendet.'):tr('slf.confirmMenu',{},'Wirklich zurück ins Hauptmenü?');
  gameConfirm(msg,()=>{
    if(role==='host'&&inMatch){if(state.phase==='review')commitReview();state.phase='ended';persist()}
    leaveToMenu();
  });
}
// Shared back button (game-chrome.js): the 'menu' screen is the top level;
// from the lobby or a live match it returns here in-page (with confirm via
// backToMainMenu), and only from 'menu' does it leave to the site catalogue.
window.__brettBack={
  atTop:()=>state.phase==='menu',
  up:backToMainMenu
};
function startGame(){if(role!=='host')return;updateLobbySettings();state.players.forEach(p=>state.scores[p.id]=state.scores[p.id]||0);state.round=0;state.history=[];state.publicRoom=false;const pc=$('publicRoomCheck');if(pc)pc.checked=false;nextRound()}
function commitReview(){if(!state.review||state.review.committed)return;recalcReview();for(const [id,pts] of Object.entries(state.review.roundScores||{}))state.scores[id]=(state.scores[id]||0)+pts;state.history.push(JSON.parse(JSON.stringify(state.review)));state.review.committed=true;state.review=null;}
function nextRound(){playDrawSound();if(state.phase==='review')commitReview();if(state.round>=state.rounds){state.phase='ended';persist();render();return}state.round++;state.phase='playing';state.letter=letters[Math.floor(Math.random()*letters.length)];state.deadline=Date.now()+state.seconds*1000;state.submissions={};state.review=null;persist();render()}
function submitAnswers(){const answers={...draft};document.querySelectorAll('[data-answer]').forEach(i=>answers[i.dataset.answer]=i.value);for(const k in answers)answers[k]=String(answers[k]||'').trim().slice(0,60);lastSubmitRound=state.round; if(role==='host')addSubmission(clientId,nameVal(),answers); else send({type:'submit',answers});toast(tr('slf.submitted',{},'Abgegeben'))}
function addSubmission(id,name,answers){if(state.phase!=='playing')return;state.submissions[id]={name,answers};
  if(Object.keys(state.submissions).length>=state.players.length){finishRound();return}
  // Stopp-Regel (klassisch): Der erste Abgeber beendet die Runde für alle. Wir ziehen die
  // Deadline auf jetzt — dadurch geben alle übrigen Clients via maybeTime() automatisch ihre
  // aktuell getippten Antworten ab (nichts geht verloren) und der Host wertet nach der kurzen
  // Karenzzeit (deadline+1500ms) aus. Nur verkürzen, nie verlängern.
  if(state.deadline>Date.now())state.deadline=Date.now();
  persist();render();}
function finishRound(){if(state.phase!=='playing')return;try{_slfDiag('finishRound:start','players='+state.players.length+' submissions='+Object.keys(state.submissions||{}).length+' cats='+state.categories.length+' categoryTypes='+JSON.stringify(state.categories.map(c=>typeof c)));state.review={round:state.round,letter:state.letter,categories:[...state.categories],submissions:JSON.parse(JSON.stringify(state.submissions)),decisions:{},suggestions:{},roundScores:{}};state.phase='review';initDecisions();recalcReview();persist();render();runValidationChecks();}catch(e){_slfDiag('finishRound',e);}}
function initDecisions(){const r=state.review;if(!r)return;for(const p of state.players){for(const cat of r.categories){const val=(r.submissions[p.id]?.answers?.[catId(cat)]||'').trim();const k=keyOf(p.id,cat);if(!val)r.decisions[k]='wrong';else if(!startsWithLetter(val,r.letter))r.decisions[k]='wrong';else r.decisions[k]='correct';}}markExactDuplicates();}
function markExactDuplicates(){const r=state.review;if(!r)return;for(const cat of r.categories){const buckets={};for(const p of state.players){const val=norm(r.submissions[p.id]?.answers?.[catId(cat)]||'');if(!val)continue;(buckets[val]=buckets[val]||[]).push(p.id)}for(const ids of Object.values(buckets)){if(ids.length>1)ids.forEach(id=>{const k=keyOf(id,cat);if(r.decisions[k]==='correct')r.decisions[k]='duplicate'})}}}
function keyOf(id,cat){return id+'::'+catId(cat)}
function recalcReview(){const r=state.review;if(!r)return;const scores={};state.players.forEach(p=>scores[p.id]=0);for(const p of state.players){for(const cat of r.categories){const status=r.decisions[keyOf(p.id,cat)]||'wrong';if(status==='correct')scores[p.id]+=10;else if(status==='duplicate')scores[p.id]+=5;}}r.roundScores=scores;}
function applyDecision(playerId,category,status,by){if(state.phase!=='review'||!state.review)return;if(!['correct','wrong','duplicate'].includes(status))return;const k=keyOf(playerId,category);state.review.decisions[k]=status;(state.review.manualKeys=state.review.manualKeys||{})[k]=true;recalcReview();persist();render();}
/* Cross-language Duplikate: die KI/Wiki-Prüfung liefert pro Antwort eine
   sprachunabhängige "canonical"-Kennung (Wikidata-ID bzw. übersetzter Name) —
   "Frankreich" und "France" landen so im selben Bucket, obwohl der reine
   Text-Vergleich in markExactDuplicates() sie nicht erkennen würde. Läuft erst,
   nachdem die Vorschläge für eine Kategorie vollständig sind, und überspringt
   Felder, die der Judge bereits manuell entschieden hat. */
function markCanonicalDuplicates(cat){
  const r=state.review;if(!r)return;
  const buckets={};
  for(const p of state.players){
    const k=keyOf(p.id,cat);
    const canon=(r.suggestions[k]?.canonical||'').trim().toLowerCase();
    if(!canon)continue;
    (buckets[canon]=buckets[canon]||[]).push(p.id);
  }
  for(const ids of Object.values(buckets)){
    if(ids.length<2)continue;
    for(const id of ids){
      const k=keyOf(id,cat);
      if(r.manualKeys&&r.manualKeys[k])continue;
      if(r.decisions[k]==='correct')r.decisions[k]='duplicate';
    }
  }
}
async function validateTerm(category,value,letter){
  const raw=String(value||'').trim();
  if(!raw)return{status:'wrong',definition:''};
  if(!startsWithLetter(raw,letter))return{status:'wrong',definition:tr('slf.notStartingWith',{letter},'Beginnt nicht mit '+letter+'.')};
  const cat=catLabel(category);
  try{
    const base=location.protocol==='file:'?'http://localhost:8787':'';
    const res=await fetch(base+'/api/ai-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({term:raw,category:cat,letter,lang:I18N?.getLanguage?.()??'de'}),signal:AbortSignal.timeout(10000)});
    if(res.ok){const d=await res.json();if(d.ok)return{status:d.status,definition:d.definition||'',canonical:d.canonical||''};}
  }catch(_){}
  return{status:'uncertain',definition:''};
}
async function runValidationChecks(){if(role!=='host'||state.phase!=='review'||!state.review)return;const run=++validationRun;const r=state.review;try{for(const cat of r.categories){for(const p of state.players){if(run!==validationRun)return;const val=r.submissions[p.id]?.answers?.[catId(cat)]||'';const k=keyOf(p.id,cat);r.suggestions[k]=await validateTerm(cat,val,r.letter);persist();render();}if(run!==validationRun)return;markCanonicalDuplicates(cat);recalcReview();persist();render();}}catch(e){_slfDiag('runValidationChecks',e);}}
function maybeTime(){
  if(state.phase==='playing'&&Date.now()>=state.deadline){
    // Bei Zeitablauf gibt JEDER Client automatisch seine bisherigen Eingaben ab,
    // damit nichts verloren geht. Der Host wartet danach eine kurze Karenzzeit,
    // damit die auto-abgegebenen Antworten der Gäste per WS noch ankommen, bevor
    // die Runde ausgewertet wird.
    if(lastSubmitRound!==state.round&&!state.submissions[clientId])submitAnswers();
    if(role==='host'&&Date.now()>=state.deadline+1500)finishRound();
  }
  renderTimer();
}
function renderTimer(){const left=state.phase==='playing'?Math.max(0,Math.ceil((state.deadline-Date.now())/1000)):null;$('timerOut').textContent=left==null?'—':left+'s'}
function updateInvite(){const link=new URL(location.href);link.searchParams.set('room',state.room);$('inviteInput').value=link.toString()}
function copyInvite(){const v=$('inviteInput').value; if(navigator.clipboard)navigator.clipboard.writeText(v).then(()=>toast('Link kopiert')).catch(fallback); else fallback(); function fallback(){const i=$('inviteInput');i.focus();i.select();document.execCommand('copy');toast('Link kopiert')}}
function setMenuMode(mode,focus){
  menuMode=mode;
  $('modeCreateTab').classList.toggle('active',mode==='create');
  $('modeCreateTab').setAttribute('aria-selected',String(mode==='create'));
  $('modeJoinTab').classList.toggle('active',mode==='join');
  $('modeJoinTab').setAttribute('aria-selected',String(mode==='join'));
  $('joinFields').classList.toggle('hidden',mode!=='join');
  $('menuActionBtn').textContent=mode==='create'?tr('slf.createRoom',{},'Raum erstellen'):tr('slf.joinRoom',{},'Raum beitreten');
  if(mode==='join')startPublicRoomsPolling();else stopPublicRoomsPolling();
  if(focus&&mode==='join')$('roomInput').focus();
}
let publicRoomsPollTimer=null;
async function fetchPublicRooms(){
  try{
    const base=location.protocol==='file:'?'http://localhost:8787':'';
    const res=await fetch(base+'/api/rooms?game='+encodeURIComponent(GAME),{credentials:'include'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    renderPublicRooms(Array.isArray(data.items)?data.items:[]);
  }catch(_){ /* browsing rooms is a nice-to-have, keep the last known list on failure */ }
}
function renderPublicRooms(items){
  const box=$('publicRoomsItems');if(!box)return;
  if(!items.length){box.innerHTML=`<div class="public-rooms-empty muted">${esc(tr('slf.publicRooms.empty',{},'Aktuell keine öffentlichen Räume.'))}</div>`;return}
  box.innerHTML=items.map(item=>`<button type="button" class="public-room-row" data-room="${esc(item.room)}"><strong>${esc(item.room)}</strong><span>${esc(item.hostName||tr('rollforge.defaultHost',{},'Host'))}</span><span class="public-room-count">${item.playerCount}</span></button>`).join('');
}
function startPublicRoomsPolling(){stopPublicRoomsPolling();fetchPublicRooms();publicRoomsPollTimer=setInterval(fetchPublicRooms,4000)}
function stopPublicRoomsPolling(){if(publicRoomsPollTimer)clearInterval(publicRoomsPollTimer);publicRoomsPollTimer=null}
function render(){
  const inGame=['playing','ended'].includes(state.phase);
  const isReview=state.phase==='review';
  const ls=$('lobbyScreen');if(ls)ls.classList.toggle('hidden',inGame||isReview);
  const gs=$('gameScreen');if(gs)gs.classList.toggle('hidden',!inGame);
  const rs=$('reviewScreen');if(rs)rs.classList.toggle('hidden',!isReview);
  $('roomOut').textContent=state.room||'—';
  const gro=$('gameRoomOut');if(gro)gro.textContent=state.room||'—';
  const egb=$('endGameBtn');if(egb)egb.style.display=(role==='host'&&['playing','review'].includes(state.phase))?'':'none';
  $('menuBox').classList.toggle('hidden',state.phase!=='menu');
  $('lobbyBox').classList.toggle('hidden',state.phase==='menu'||role!=='host');
  const gw=$('guestWaiting');if(gw)gw.classList.toggle('hidden',!(state.phase==='lobby'&&role!=='host'));
  const lpc=$('lobbyPlayersCard');if(lpc)lpc.classList.toggle('hidden',state.phase==='menu');
  const slg=document.querySelector('.slf-lobby-grid');if(slg)slg.classList.toggle('slf-lobby-grid-single',state.phase==='menu');
  if(state.phase==='menu')setMenuMode(menuMode);else stopPublicRoomsPolling();
  if(role==='host'&&state.phase==='lobby'){renderCatEditor();$('secondsInput').value=state.seconds;$('roundsInput').value=state.rounds;updateInvite();const pc=$('publicRoomCheck');if(pc)pc.checked=!!state.publicRoom;}
  renderPlayers();renderStage();renderTimer();
  if(isReview)renderReview();
}
function renderCatEditor(){
  const box=$('catEditor');
  state.categories=normalizeCats(state.categories);
  const selIds=new Set(state.categories.map(c=>catId(c)));
  const custom=state.categories.filter(c=>typeof c==='object'&&c&&String(c.id).startsWith('custom-'));
  const byGroup={};
  for(const c of ALL_PREDEFINED)(byGroup[c.group]=byGroup[c.group]||[]).push(c);
  let html='<div class="cat-picker">';
  for(const[g,cats]of Object.entries(byGroup)){
    html+=`<div class="cat-group"><div class="cat-group-label">${esc(tr(CAT_GROUPS[g],{},g))}</div><div class="cat-chips">`;
    for(const c of cats)html+=`<button type="button" class="cat-chip${selIds.has(c.id)?' selected':''}" data-cat-toggle="${esc(c.id)}">${esc(catLabel(c.id))}</button>`;
    html+='</div></div>';
  }
  if(custom.length){
    html+='<div class="cat-group"><div class="cat-group-label">'+esc(tr('slf.cat.group.custom',{},'Eigene'))+'</div><div class="cat-chips">';
    for(const c of custom)html+=`<span class="cat-chip selected">${esc(c.label)}<button type="button" class="cat-chip-remove" data-remove-cat="${esc(c.id)}">×</button></span>`;
    html+='</div></div>';
  }
  html+=`<div class="cat-status">${state.categories.length} ${esc(tr('slf.cat.selected',{},'ausgewählt'))}</div>`;
  html+=`<div class="cat-add-row"><input id="customCatInput" maxlength="32" placeholder="${esc(tr('slf.cat.custom.placeholder',{},'Eigene Kategorie…'))}"><button type="button" id="addCustomCatBtn">+</button></div>`;
  html+='</div>';
  box.innerHTML=html;
  box.querySelectorAll('[data-cat-toggle]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.catToggle;
    const idx=state.categories.indexOf(id);
    if(idx>=0){state.categories.splice(idx,1);}
    else{state.categories.push(id);}
    renderCatEditor();if(role==='host')persist();
  }));
  box.querySelectorAll('[data-remove-cat]').forEach(btn=>btn.addEventListener('click',()=>{
    state.categories=state.categories.filter(c=>catId(c)!==btn.dataset.removeCat);
    renderCatEditor();if(role==='host')persist();
  }));
  const addBtn=$('addCustomCatBtn');const customInput=$('customCatInput');
  if(addBtn&&customInput){
    const doAdd=()=>{
      const label=customInput.value.trim();if(!label)return;
      state.categories.push(customCat(label));customInput.value='';renderCatEditor();if(role==='host')persist();
    };
    addBtn.addEventListener('click',doAdd);
    customInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doAdd();}});
  }
}
function renderPlayers(){
  const html=state.players.map(p=>`<div class="item ${p.id===clientId?'active':''}"><div style="display:flex;justify-content:space-between"><strong>${esc(p.name)}</strong><span class="score">${state.scores[p.id]||0}${state.phase==='review'&&state.review?` <small>+${state.review.roundScores?.[p.id]||0}</small>`:''}</span></div><div class="mini">${state.submissions[p.id]?'abgegeben':'wartet'}</div></div>`).join('')||'<p class="muted">Noch niemand beigetreten.</p>';
  const box=$('playersList');if(box)box.innerHTML=html;
  const lbox=$('lobbyPlayersList');if(lbox)lbox.innerHTML=html;
}
function statusLabel(s){return s==='correct'?'richtig':s==='duplicate'?'doppelt':s==='wrong'?'falsch':'?'}
function suggestionHtml(s){if(!s)return '<span class="check pending">KI prüft…</span>';const cls=s.status==='correct'?'ok':s.status==='wrong'?'bad':'maybe';const label=s.status==='correct'?'✓ korrekt':s.status==='wrong'?'✗ falsch':'? unsicher';return `<span class="check ${cls}">${label}</span>${s.definition?`<span class="ai-def">${esc(s.definition)}</span>`:''}`}
function renderStage(){const s=$('stage');
  // ended phase shows tall content — disable vertical centering so content starts at top
  const scrollPhase=state.phase==='ended';
  s.style.display=scrollPhase?'block':'';
  s.style.minHeight=scrollPhase?'0':'';
  if(state.phase==='lobby'){s.innerHTML=`<div><div class="big">Lobby</div><p class="muted">${reconnectTimer?'Verbinde erneut…':role==='host'?'Kategorien einstellen, Link teilen, Start drücken.':'Du bist drin. Der Host sortiert noch die Zettel.'}</p></div>`;return} if(state.phase==='playing'){
    const mine=state.submissions[clientId];
    // Wenn die Spiel-Oberfläche für diese Runde bereits steht, NICHT neu aufbauen —
    // sonst würden eingehende Snapshots (z.B. wenn ein anderer Spieler abgibt) die
    // gerade getippten, noch nicht abgegebenen Eingaben löschen und den Fokus rauswerfen.
    const built=s.dataset.slfPlayRound===String(state.round)&&s.querySelector('[data-answer]');
    if(built){
      if(mine){
        s.querySelectorAll('[data-answer]').forEach(i=>{i.value=mine.answers?.[i.dataset.answer]||'';i.disabled=true;});
        const btn=$('submitBtn');if(btn){btn.disabled=true;btn.textContent=tr('slf.submitted',{},'Abgegeben');}
      }
      return;
    }
    if(state.round!==draftRound){draft={};draftRound=state.round;}
    s.dataset.slfPlayRound=String(state.round);
    s.innerHTML=`<div style="width:100%"><div class="section-title"><div><span class="muted">Runde ${state.round}/${state.rounds}</span><div class="letter">${state.letter}</div></div><button id="submitBtn" ${mine?'disabled':''}>${mine?'Abgegeben':'Antworten abgeben'}</button></div><div class="categories">${state.categories.map(cat=>{const cid=catId(cat);const v=mine?(mine.answers?.[cid]||''):(draft[cid]||'');return `<label class="catInput"><strong>${esc(catLabel(cat))}</strong><input data-answer="${esc(cid)}" ${mine?'disabled':''} value="${esc(v)}" placeholder="${state.letter}…"></label>`}).join('')}</div></div>`;
    $('submitBtn')?.addEventListener('click',submitAnswers);
    if(!mine)s.querySelectorAll('[data-answer]').forEach(i=>i.addEventListener('input',()=>{draft[i.dataset.answer]=i.value}));
    return} if(state.phase==='ended'){const r=[...state.players].sort((a,b)=>(state.scores[b.id]||0)-(state.scores[a.id]||0));const resetScores=()=>{state.round=0;state.history=[];state.scores={};state.players.forEach(p=>state.scores[p.id]=0)};s.innerHTML=`<div style="width:min(720px,100%)"><div class="big">Ranking</div><ol class="ranking">${r.map((p,i)=>`<li><span>${i+1}. ${esc(p.name)}</span><strong>${state.scores[p.id]||0}</strong></li>`).join('')}</ol>${role==='host'?'<div class="grid2" style="margin-top:14px"><button class="secondary" id="newSettingsBtn">⚙️ Einstellungen anpassen</button><button id="rematchBtn">🔁 Nochmal spielen</button></div>':'<p class="muted" style="margin-top:14px;text-align:center">Der Host startet die nächste Partie.</p>'}</div>`;$('rematchBtn')?.addEventListener('click',()=>{resetScores();nextRound()});$('newSettingsBtn')?.addEventListener('click',()=>{resetScores();state.phase='lobby';persist();render()});return} s.innerHTML='<div><div class="big">Stadt<br>Land<br>Fluss</div><p class="muted">Raum erstellen oder beitreten.</p></div>'}
function renderReview(){
 try{
  const el=$('reviewContent');
  if(!el||!state.review){ _slfDiag('renderReview:skip','reviewContentEl='+!!el+' state.review='+!!state.review+' phase='+state.phase); return; }
  const r=state.review;
  const scoresHtml=[...state.players].sort((a,b)=>(state.scores[b.id]||0)-(state.scores[a.id]||0)).map(p=>`<div class="review-score-chip${p.id===clientId?' self':''}"><strong>${esc(p.name)}</strong><span>${state.scores[p.id]||0} <span class="delta">+${r.roundScores?.[p.id]||0}</span></span></div>`).join('');
  const catsHtml=r.categories.map(cat=>{
    const rows=state.players.map(p=>{
      const val=r.submissions[p.id]?.answers?.[catId(cat)]||'';
      const k=keyOf(p.id,cat);
      const dec=r.decisions[k]||'wrong';
      const isSelf=p.id===clientId;
      return `<div class="review-row${isSelf?' review-row-self':''}"><div class="review-row-name">${esc(p.name)}${isSelf?` <span class="review-you">du</span>`:''}</div><div class="review-row-answer"><strong>${esc(val||'—')}</strong>${suggestionHtml(r.suggestions[k])}</div><div class="review-row-actions"><span class="statusTag ${dec}">${statusLabel(dec)}</span><div class="judgeBtns"><button data-status="${p.id}|${esc(catId(cat))}|correct" class="good${dec==='correct'?' vote-active':''}">✓</button><button data-status="${p.id}|${esc(catId(cat))}|duplicate" class="secondary${dec==='duplicate'?' vote-active':''}">≈</button><button data-status="${p.id}|${esc(catId(cat))}|wrong" class="danger${dec==='wrong'?' vote-active':''}">×</button></div></div></div>`;
    }).join('');
    return `<div class="card review-cat-block"><div class="pad"><h3 class="review-cat-title">${esc(catLabel(cat))}</h3><div class="review-rows">${rows}</div></div></div>`;
  }).join('');
  if(!catsHtml || !state.players.length){ _slfDiag('renderReview:empty','players='+state.players.length+' reviewCats='+(r.categories?r.categories.length:'n/a')+' scoresLen='+scoresHtml.length+' catsLen='+catsHtml.length); }
  el.innerHTML=`<div class="review-header"><div><h2>Auswertung · <span class="letterBubble">${esc(r.letter)}</span></h2><p class="muted" style="margin:4px 0 0">KI-Vorschlag inklusive Definition — klicke einen anderen Button um deine Bewertung zu ändern.</p></div>${role==='host'?`<div style="display:flex;gap:8px;flex-wrap:wrap"><button id="nextBtn">Nächste Runde →</button></div>`:''}</div><div class="review-scores">${scoresHtml}</div><div class="review-cats">${catsHtml}</div>`;
  $('nextBtn')?.addEventListener('click',nextRound);
  el.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{const[pid,cat,status]=b.dataset.status.split('|');if(role==='host')applyDecision(pid,cat,status,clientId);else send({type:'judge',playerId:pid,category:cat,status});});
 }catch(e){
  _slfDiag('renderReview',e);
  const el=$('reviewContent'); if(el) el.innerHTML='<div style="padding:18px;color:#ffd7d7;background:#2a0d0d;border:2px solid #ff5b65;border-radius:12px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap">⚠ renderReview-Fehler:\n'+esc(String(e&&(e.stack||e.message)||e))+'</div>';
 }
}
$('modeCreateTab').onclick=()=>setMenuMode('create',true);$('modeJoinTab').onclick=()=>setMenuMode('join',true);$('menuActionBtn').onclick=()=>{if(menuMode==='create')hostRoom();else joinRoom();};$('startBtn').onclick=startGame;$('copyBtn').onclick=copyInvite;$('publicRoomCheck').onchange=()=>{state.publicRoom=$('publicRoomCheck').checked;if(role==='host')persist();};$('publicRoomsItems').addEventListener('click',e=>{const row=e.target.closest('.public-room-row');if(!row||!row.dataset.room)return;$('roomInput').value=row.dataset.room;joinRoom();});$('addCatBtn').onclick=()=>{playDrawSound();state.categories=[...DEFAULT_CATS];renderCatEditor();if(role==='host')persist();};$('endGameBtn')?.addEventListener('click',endGame);$('randomCatsBtn').onclick=()=>{playDrawSound();const byG={};for(const c of ALL_PREDEFINED)(byG[c.group]=byG[c.group]||[]).push(c);const pick=(arr,n)=>arr.sort(()=>Math.random()-.5).slice(0,n);state.categories=[...pick(byG.classic||[],3).map(c=>c.id),...pick(byG.nature||[],2).map(c=>c.id),...pick(byG.culture||[],3).map(c=>c.id),...pick(byG.silly||[],2).map(c=>c.id)];renderCatEditor();if(role==='host')persist()};$('nameInput').value=localStorage.getItem('slf.name')||'';$('hostNameInput').value=$('nameInput').value||'Host';
// Angemeldeter Nutzer (brettspiele.fun): Anzeige-/Benutzernamen automatisch in die
// Namensfelder von Menü/Host und Beitreten übernehmen. Der Auth-Zustand liegt unter
// window.BrettAuth und kann asynchron nachladen, daher zusätzlich auf das Event
// 'brettspiele-auth-change' reagieren. Überschrieben werden nur leere Felder, der
// 'Host'-Platzhalter und ein zuvor automatisch gesetzter Account-Name — niemals ein
// Name, den der Nutzer selbst getippt hat.
function slfAccountName(){try{const st=window.BrettAuth?.getState?.();if(st&&st.authenticated&&st.user)return String(st.user.displayName||st.user.username||'').trim().slice(0,24)}catch(_){}return ''}
let lastAppliedAccountName='';
function applyAccountName(){const name=slfAccountName();if(!name)return;for(const[id,ph]of[['nameInput',''],['hostNameInput','Host']]){const el=$(id);if(!el)continue;const cur=el.value.trim();if(!cur||cur===ph||cur===lastAppliedAccountName)el.value=name}lastAppliedAccountName=name}
window.addEventListener('brettspiele-auth-change',applyAccountName);applyAccountName();
const _savedSession=getSavedSession();
const _urlRoom=(params.get('room')||'').trim().toUpperCase();
const _resumable=!!(_savedSession&&_savedSession.room&&(_savedSession.role==='host'||_savedSession.role==='guest')&&(!_urlRoom||_urlRoom===_savedSession.room));
if(_resumable){role=_savedSession.role;state.room=_savedSession.room;state.phase='lobby';$('roomOut').textContent=state.room;menuMode=role==='host'?'create':'join';}
else if(_urlRoom){$('roomInput').value=_urlRoom;menuMode='join';}
setMenuMode(menuMode);setInterval(maybeTime,500);render();
if(_resumable){connect(state.room);history.pushState({},'','?room='+state.room);}
else if(_urlRoom){/* Invite-Link → Beitritts-Formular mit editierbarem Namensfeld zeigen, statt automatisch beizutreten (Name vor dem Beitreten wählbar) */setMenuMode('join');const ni=$('nameInput');if(ni)setTimeout(()=>{ni.focus();ni.select();},0);}
window.addEventListener('brettspiele-language-change',()=>{render();});

})();
