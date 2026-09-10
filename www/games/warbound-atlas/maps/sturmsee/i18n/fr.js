/* Sturmsee map — region/continent translations for "fr".
   Loaded before map3d.js alongside the engine-wide i18n/fr.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "fr" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["fr"] || (g.WB_MAP_TX_DATA["fr"] = {});
  var add = {"region":{"Blitzkutter":"Cotre de Foudre","Brandungsbraut":"Fiancée du Ressac","Delfinsprung":"Saut du Dauphin","Donnerhall":"Fracas de Tonnerre","Eisbrecher":"Brise-Glace","Frostklinge":"Lame de Givre","Gischtreiter":"Chevaucheur d’Écume","Grauschleier":"Voile Grise","Klippenwacht":"Garde des Falaises","Krakentöter":"Tueur de Kraken","Nebelgänger":"Marcheur de Brume","Nordwind":"Vent du Nord","Passatwind":"Alizé","Riffbrecher":"Brise-Récif","Salzschaluppe":"Chaloupe de Sel","Schwarzwoge":"Vague Noire","Sonnensegel":"Voile de Soleil","Stillwasser":"Eaux Calmes","Sturzwelle":"Lame Déferlante","Tiefenwacht":"Garde des Profondeurs","Wetterbö":"Bourrasque"},"continent":{"Eisflotte":"Flotte de Glace","Sturmflotte":"Flotte des Tempêtes","Korallenflotte":"Flotte de Corail","Passatflotte":"Flotte des Alizés","Klippenflotte":"Flotte des Falaises","Nebelflotte":"Flotte des Brumes","Krakenflotte":"Flotte du Kraken"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
