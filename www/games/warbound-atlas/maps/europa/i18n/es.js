/* Europa map — region/continent translations for "es".
   Loaded before map3d.js alongside the engine-wide i18n/es.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "es" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["es"] || (g.WB_MAP_TX_DATA["es"] = {});
  var add = {"region":{"Africa (Karthago)":"Africa (Cartago)","Anatolien":"Anatolia","Britannien":"Britania","Bulgarien":"Bulgaria","Choresmien":"Corasmia","Deutschland":"Alemania","Dänemark":"Dinamarca","Epirus":"Epiro","Finnland":"Finlandia","Frankreich":"Francia","Friesland":"Frisia","Georgien":"Georgia","Hellas":"Hélade","Helvetien":"Helvecia","Hibernia":"Hibernia","Island":"Islandia","Italia":"Italia","Kasachensteppe":"Estepa kazaja","Kastilien":"Castilla","Kiew":"Kiev","Kiptschak-Steppe":"Estepa kipchak","Kyrenaika":"Cirenaica","Makedonien":"Macedonia","Mauretanien":"Mauritania","Mesopotamien":"Mesopotamia","Moskau":"Moscú","Norwegen":"Noruega","Nowgorod":"Nóvgorod","Numidien":"Numidia","Oberägypten":"Alto Egipto","Palästina":"Palestina","Rjasan":"Riazán","Schweden":"Suecia","Sibirien":"Siberia","Transoxanien":"Transoxiana","Tripolitanien":"Tripolitania","Ungarn":"Hungría","Unterägypten":"Bajo Egipto","Walachei":"Valaquia","Wolga-Bulgarien":"Bulgaria del Volga","Zypern":"Chipre"},"continent":{"Heiliges Römisches Reich":"Sacro Imperio Romano","Reich der Franken":"Imperio franco","Imperium Romanum":"Imperium Romanum","Byzantinisches Reich":"Imperio bizantino","Osmanisches Reich":"Imperio otomano","Kalifat der Araber":"Califato árabe","Reich der Steppe":"Imperio de la Estepa","Britannische Inseln":"Islas Británicas","Iberien & al-Andalus":"Iberia y al-Ándalus","Nordland der Wikinger":"Tierras nórdicas vikingas","Kiewer Rus":"Rus de Kiev","Königreich Ungarn":"Reino de Hungría","Maghreb":"Magreb"},"continentShort":{"HRR":"Sacro Imp.","Franken":"Francos","Rom":"Roma","Byzanz":"Bizancio","Osmanen":"Otomanos","Kalifat":"Califato","Steppe":"Estepa","Britannia":"Britania","Iberien":"Iberia","Nordland":"Vikingos","Rus":"Rus","Ungarn":"Hungría"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
