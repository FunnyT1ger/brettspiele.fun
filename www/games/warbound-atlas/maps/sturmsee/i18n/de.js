/* Sturmsee map — region/continent translations for "de".
   Loaded before map3d.js alongside the engine-wide i18n/de.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "de" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["de"] || (g.WB_MAP_TX_DATA["de"] = {});
  var add = {"region":{"Blitzkutter":"Blitzkutter","Brandungsbraut":"Brandungsbraut","Delfinsprung":"Delfinsprung","Donnerhall":"Donnerhall","Eisbrecher":"Eisbrecher","Frostklinge":"Frostklinge","Gischtreiter":"Gischtreiter","Grauschleier":"Grauschleier","Klippenwacht":"Klippenwacht","Krakentöter":"Krakentöter","Nebelgänger":"Nebelgänger","Nordwind":"Nordwind","Passatwind":"Passatwind","Riffbrecher":"Riffbrecher","Salzschaluppe":"Salzschaluppe","Schwarzwoge":"Schwarzwoge","Sonnensegel":"Sonnensegel","Stillwasser":"Stillwasser","Sturzwelle":"Sturzwelle","Tiefenwacht":"Tiefenwacht","Wetterbö":"Wetterbö"},"continent":{"Eisflotte":"Eisflotte","Sturmflotte":"Sturmflotte","Korallenflotte":"Korallenflotte","Passatflotte":"Passatflotte","Klippenflotte":"Klippenflotte","Nebelflotte":"Nebelflotte","Krakenflotte":"Krakenflotte"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
