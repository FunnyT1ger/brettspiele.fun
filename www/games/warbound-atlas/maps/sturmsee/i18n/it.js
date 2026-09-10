/* Sturmsee map — region/continent translations for "it".
   Loaded before map3d.js alongside the engine-wide i18n/it.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "it" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["it"] || (g.WB_MAP_TX_DATA["it"] = {});
  var add = {"region":{"Blitzkutter":"Cutter del Fulmine","Brandungsbraut":"Sposa della Risacca","Delfinsprung":"Salto del Delfino","Donnerhall":"Rombo di Tuono","Eisbrecher":"Rompighiaccio","Frostklinge":"Lama di Brina","Gischtreiter":"Cavalcaspruzzi","Grauschleier":"Velo Grigio","Klippenwacht":"Guardia della Scogliera","Krakentöter":"Uccisore di Kraken","Nebelgänger":"Camminanebbia","Nordwind":"Vento del Nord","Passatwind":"Aliseo","Riffbrecher":"Frangiscogli","Salzschaluppe":"Scialuppa del Sale","Schwarzwoge":"Onda Nera","Sonnensegel":"Vela del Sole","Stillwasser":"Acque Calme","Sturzwelle":"Onda Frangente","Tiefenwacht":"Guardia degli Abissi","Wetterbö":"Groppo"},"continent":{"Eisflotte":"Flotta del Ghiaccio","Sturmflotte":"Flotta della Tempesta","Korallenflotte":"Flotta del Corallo","Passatflotte":"Flotta degli Alisei","Klippenflotte":"Flotta della Scogliera","Nebelflotte":"Flotta della Nebbia","Krakenflotte":"Flotta del Kraken"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
