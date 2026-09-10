/* Sturmsee map — region/continent translations for "es".
   Loaded before map3d.js alongside the engine-wide i18n/es.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "es" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["es"] || (g.WB_MAP_TX_DATA["es"] = {});
  var add = {"region":{"Blitzkutter":"Cúter del Rayo","Brandungsbraut":"Novia del Oleaje","Delfinsprung":"Salto del Delfín","Donnerhall":"Fragor del Trueno","Eisbrecher":"Rompehielos","Frostklinge":"Filo de Escarcha","Gischtreiter":"Jinete de Espuma","Grauschleier":"Velo Gris","Klippenwacht":"Guardia del Acantilado","Krakentöter":"Matakrakens","Nebelgänger":"Caminante de Niebla","Nordwind":"Viento del Norte","Passatwind":"Viento Alisio","Riffbrecher":"Rompearrecifes","Salzschaluppe":"Chalupa de Sal","Schwarzwoge":"Ola Negra","Sonnensegel":"Vela del Sol","Stillwasser":"Aguas Quietas","Sturzwelle":"Ola Rompiente","Tiefenwacht":"Guardia del Abismo","Wetterbö":"Turbonada"},"continent":{"Eisflotte":"Flota de Hielo","Sturmflotte":"Flota de la Tormenta","Korallenflotte":"Flota del Coral","Passatflotte":"Flota de los Alisios","Klippenflotte":"Flota del Acantilado","Nebelflotte":"Flota de la Niebla","Krakenflotte":"Flota del Kraken"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
