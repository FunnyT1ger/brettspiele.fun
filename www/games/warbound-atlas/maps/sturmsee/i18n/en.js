/* Sturmsee map — region/continent translations for "en".
   Loaded before map3d.js alongside the engine-wide i18n/en.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "en" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["en"] || (g.WB_MAP_TX_DATA["en"] = {});
  var add = {"region":{"Blitzkutter":"Lightning Cutter","Brandungsbraut":"Surf Bride","Delfinsprung":"Dolphin Leap","Donnerhall":"Thunderpeal","Eisbrecher":"Icebreaker","Frostklinge":"Frostblade","Gischtreiter":"Spray Rider","Grauschleier":"Grey Veil","Klippenwacht":"Cliff Watch","Krakentöter":"Kraken Slayer","Nebelgänger":"Mistwalker","Nordwind":"North Wind","Passatwind":"Trade Wind","Riffbrecher":"Reefbreaker","Salzschaluppe":"Salt Sloop","Schwarzwoge":"Black Surge","Sonnensegel":"Sunsail","Stillwasser":"Stillwater","Sturzwelle":"Plunging Wave","Tiefenwacht":"Deep Watch","Wetterbö":"Squall"},"continent":{"Eisflotte":"Ice Fleet","Sturmflotte":"Storm Fleet","Korallenflotte":"Coral Fleet","Passatflotte":"Trade Wind Fleet","Klippenflotte":"Cliff Fleet","Nebelflotte":"Mist Fleet","Krakenflotte":"Kraken Fleet"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
