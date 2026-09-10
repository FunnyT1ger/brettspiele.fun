/* ============================================================================
   Warbound Atlas — runtime card/territory translation layer (display only).
   Card & character .name/.effect/.role/.timing stay German in the data (they
   are logic keys); we translate ONLY at the render sites via these helpers.
   Region/faction/continent names + unit/type labels carry no logic and are
   mutated in place. Re-applies on language change.
   ============================================================================ */
var WB_TX = (function () {
  /* Translations now live in per-language packs that load before this file:
     i18n/<lang>.js (engine-wide: cardName/cardEffect/role/timing/ui) populates
     window.WB_TX_DATA, and maps/<map>/i18n/<lang>.js (map-specific: region/
     factionName/factionMotto/factionStyle/continent/mapLabel) populates
     window.WB_MAP_TX_DATA. Merge both per language before reassembling the
     original WB_TX shape { LANGS, <category>: { <germanKey>: [de,en,...] } }
     so all the helpers below keep working unchanged. */
  var LANGS = ["de","en","fr","es","it","ru","zh","ja"];
  var CATS = ["cardName","cardEffect","role","timing","region","factionName","factionMotto","factionStyle","continent","continentShort","ui","mapLabel"];
  var ENGINE_D = (typeof window !== "undefined" && window.WB_TX_DATA) || {};
  var MAP_D = (typeof window !== "undefined" && window.WB_MAP_TX_DATA) || {};
  var D = {};
  LANGS.forEach(function (l) {
    D[l] = Object.assign({}, ENGINE_D[l], MAP_D[l]);
  });
  var base = D[LANGS[0]] || {};
  if (!ENGINE_D[LANGS[0]]) console.warn("[warbound] WB_TX_DATA missing — did i18n/<lang>.js load before map3d.js?");
  if (!MAP_D[LANGS[0]]) console.warn("[warbound] WB_MAP_TX_DATA missing — did maps/<map>/i18n/<lang>.js load before map3d.js?");
  var out = { LANGS: LANGS };
  CATS.forEach(function (cat) {
    out[cat] = {};
    var bcat = base[cat] || {};
    Object.keys(bcat).forEach(function (key) {
      out[cat][key] = LANGS.map(function (l) {
        var c = (D[l] && D[l][cat]) || {};
        return (key in c) ? c[key] : bcat[key];
      });
    });
  });
  return out;
})();
(function(){
  function lang(){ try{ return (window.BFI18N && BFI18N.getLanguage && BFI18N.getLanguage()) || 'de'; }catch(e){ return 'de'; } }
  function idx(){ var i = WB_TX.LANGS.indexOf(lang()); return i < 0 ? 0 : i; }
  function pick(tbl, key){
    if(key == null) return '';
    var row = tbl && tbl[key];
    if(!row) return key;                          // unknown source -> show as-is (German)
    var v = row[idx()];
    return (v == null || v === '') ? (row[0] || key) : v;
  }
  // ---- per-region logical key (captured ONCE from original names) ----
  var REGION_TKEY = {};
  function captureRegionKeys(){
    try{ REGIONS.forEach(function(r){ REGION_TKEY[r.id] = (typeof _territoryBaseName==='function' ? (_territoryBaseName(r.name)||r.id) : r.id); }); }catch(e){}
  }
  var CONT_ORIG = {};
  var CONT_SHORT_ORIG = {};
  function captureContKeys(){
    try{ CONTINENTS.forEach(function(c){
      if(!(c.key in CONT_ORIG)) CONT_ORIG[c.key] = c.name;
      if(!(c.key in CONT_SHORT_ORIG)) CONT_SHORT_ORIG[c.key] = c.short || '';
    }); }catch(e){}
  }
  // ---- display helpers (global) ----
  window.wbRegName  = function(id){ var k = REGION_TKEY[id]; return k ? pick(WB_TX.region, k) : (id||''); };
  window.wbCardName = function(c){
    if(!c) return '';
    if(c.type === 'territory') return (c.regionId ? wbRegName(c.regionId) : '') || c.name || pick(WB_TX.ui,'Gebietskarte');
    return pick(WB_TX.cardName, c.name);
  };
  window.wbCardEffect = function(c){ return c ? pick(WB_TX.cardEffect, c.effect || '') : ''; };
  window.wbRole    = function(c){ return c ? pick(WB_TX.role, c.role || '') : ''; };
  window.wbTiming  = function(c){ return c ? pick(WB_TX.timing, c.timing || '') : ''; };
  window.wbUI      = function(key){ return pick(WB_TX.ui, key); };
  WB_TX.ui.NoTerr = ["Noch keine Gebietskarten. Erobere Gebiete!","No territory cards yet. Conquer territories!","Pas encore de cartes de territoire. Conquiers des territoires !","Aún no hay cartas de territorio. ¡Conquista territorios!","Ancora nessuna carta territorio. Conquista territori!","Карт территорий пока нет. Захватывайте территории!","暂无领地卡。去占领领地吧！","領地カードはまだありません。領地を征服しよう！"];
WB_TX.ui.NoCouncil = ["Noch keine Ratskarten. Kaufe im Hohen Rat!","No council cards yet. Buy from the High Council!","Pas encore de cartes du Conseil. Achète au Haut Conseil !","Aún no hay cartas del Consejo. ¡Compra en el Alto Consejo!","Ancora nessuna carta del Consiglio. Acquista nell'Alto Consiglio!","Карт совета пока нет. Покупайте в Высшем совете!","暂无议会卡。在高级议会购买吧！","評議会カードはまだありません。高等評議会で購入しよう！"];
  
  window.wbTypeLabel = function(type){ var m={attack:'Angriff',defense:'Verteidigung',supply:'Versorgung',event:'Ereignis',shadow:'Schatten'}; return wbUI(m[type] || 'Karte'); };
  window.wbUnitLabel = function(sym){ var m={knight:'Ritter',tower:'Turm',siege:'Katapult'}; return wbUI(m[sym] || sym); };
  window.wbCharName  = function(name){ return pick(WB_TX.cardName, name); };   // by raw German name (defense chips)
  window.wbMapLabel  = function(de){ return pick(WB_TX.mapLabel, de); };       // 3D-map territory labels (keyed by German label)
  window.wbContName  = function(key){ var orig = CONT_ORIG[key] || key; return pick(WB_TX.continent, orig); }; // big map continent labels (by continent key)
  // ---- in-place translation of logic-free data + label maps ----
  window.wbApplyInPlace = function(){
    var i = idx();
    try{ REGIONS.forEach(function(r){ var k=REGION_TKEY[r.id]; var row=k&&WB_TX.region[k]; if(row){ var v=row[i]||row[0]; if(v) r.name=v; } }); }catch(e){}
    try{ for(var fk in FACTIONS){ var f=FACTIONS[fk];
      if(WB_TX.factionName[fk])  f.name  = WB_TX.factionName[fk][i]  || f.name;
      if(WB_TX.factionMotto[fk]) f.motto = WB_TX.factionMotto[fk][i] || f.motto;
      if(WB_TX.factionStyle[fk]) f.style = WB_TX.factionStyle[fk][i] || f.style;
    } }catch(e){}
    try{ CONTINENTS.forEach(function(c){
      var orig=CONT_ORIG[c.key]; var row=orig&&WB_TX.continent[orig];
      var name=null;
      if(row){ var v=row[i]||row[0]; if(v){ c.name=v; name=v; } }
      /* Kurzlabel des Boni-Overlays (game.js nutzt c.short||c.name). Eigene
         Übersetzung, wenn es eine gibt; sonst nur dann der volle Name, wenn
         das Kurzlabel ohnehin mit ihm identisch war — ein unübersetztes
         Kurzlabel bleibt lieber stehen, als das enge Overlay zu sprengen. */
      var sOrig=CONT_SHORT_ORIG[c.key];
      if(sOrig){
        var sRow=WB_TX.continentShort[sOrig];
        if(sRow){ var sv=sRow[i]||sRow[0]; if(sv) c.short=sv; }
        else if(name && sOrig===orig){ c.short=name; }
      }
    }); }catch(e){}
    try{ CARD_LABELS.knight=wbUI('Ritter'); CARD_LABELS.tower=wbUI('Turm'); CARD_LABELS.siege=wbUI('Katapult'); }catch(e){}
    try{ COUNCIL_TYPE_LABELS.attack='⚔ '+wbUI('Angriff'); COUNCIL_TYPE_LABELS.defense='🛡 '+wbUI('Verteidigung'); COUNCIL_TYPE_LABELS.supply='⚙ '+wbUI('Versorgung'); COUNCIL_TYPE_LABELS.event='⭐ '+wbUI('Ereignis'); COUNCIL_TYPE_LABELS.shadow='🌑 '+wbUI('Schatten'); }catch(e){}
  };
  window.wbReRender = function(){
    function activeScene(id){ var el=document.getElementById(id); return el && el.classList.contains('active'); }
    try{ if(typeof renderCards==='function' && activeScene('game')) renderCards(); }catch(e){}
    try{ if(typeof updateHUD==='function' && activeScene('game')) updateHUD(); }catch(e){}
    try{ if(typeof refreshMapVisuals==='function' && activeScene('game')) refreshMapVisuals(); }catch(e){}
    try{ var cm=document.getElementById('charModal'); if(cm && cm.classList.contains('show') && typeof openCharModal==='function') openCharModal(); }catch(e){}
  };
  window.wbInitI18n = function(){ captureRegionKeys(); captureContKeys(); wbApplyInPlace(); try{ if(typeof wbApplyMapLabelLang==='function') wbApplyMapLabelLang(); }catch(e){} };
  // initial apply (game script already ran: REGIONS/FACTIONS/CONTINENTS exist)
  try{ wbInitI18n(); }catch(e){ console.error('wbInitI18n', e); }
  // re-apply + re-render whenever the shared language switcher fires
  window.addEventListener('brettspiele-language-change', function(){
    try{ wbApplyInPlace(); wbReRender(); if(typeof wbApplyMapLabelLang==='function') wbApplyMapLabelLang(); }catch(e){ console.error('wb lang change', e); }
  });
})();
