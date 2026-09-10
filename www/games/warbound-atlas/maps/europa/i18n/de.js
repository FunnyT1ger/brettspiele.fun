/* Europa map — region/continent translations for "de".
   Loaded before map3d.js alongside the engine-wide i18n/de.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "de" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["de"] || (g.WB_MAP_TX_DATA["de"] = {});
  var add = {"region":{"Africa (Karthago)":"Africa (Karthago)","Anatolien":"Anatolien","Britannien":"Britannien","Bulgarien":"Bulgarien","Choresmien":"Choresmien","Deutschland":"Deutschland","Dänemark":"Dänemark","Epirus":"Epirus","Finnland":"Finnland","Frankreich":"Frankreich","Friesland":"Friesland","Georgien":"Georgien","Hellas":"Hellas","Helvetien":"Helvetien","Hibernia":"Hibernia","Island":"Island","Italia":"Italia","Kasachensteppe":"Kasachensteppe","Kastilien":"Kastilien","Kiew":"Kiew","Kiptschak-Steppe":"Kiptschak-Steppe","Kyrenaika":"Kyrenaika","Makedonien":"Makedonien","Mauretanien":"Mauretanien","Mesopotamien":"Mesopotamien","Moskau":"Moskau","Norwegen":"Norwegen","Nowgorod":"Nowgorod","Numidien":"Numidien","Oberägypten":"Oberägypten","Palästina":"Palästina","Rjasan":"Rjasan","Schweden":"Schweden","Sibirien":"Sibirien","Transoxanien":"Transoxanien","Tripolitanien":"Tripolitanien","Ungarn":"Ungarn","Unterägypten":"Unterägypten","Walachei":"Walachei","Wolga-Bulgarien":"Wolga-Bulgarien","Zypern":"Zypern"},"continent":{"Heiliges Römisches Reich":"Heiliges Römisches Reich","Reich der Franken":"Reich der Franken","Imperium Romanum":"Imperium Romanum","Byzantinisches Reich":"Byzantinisches Reich","Osmanisches Reich":"Osmanisches Reich","Kalifat der Araber":"Kalifat der Araber","Reich der Steppe":"Reich der Steppe","Britannische Inseln":"Britannische Inseln","Iberien & al-Andalus":"Iberien & al-Andalus","Nordland der Wikinger":"Nordland der Wikinger","Kiewer Rus":"Kiewer Rus","Königreich Ungarn":"Königreich Ungarn","Maghreb":"Maghreb"},"continentShort":{"HRR":"HRR","Franken":"Franken","Rom":"Rom","Byzanz":"Byzanz","Osmanen":"Osmanen","Kalifat":"Kalifat","Steppe":"Steppe","Britannia":"Britannia","Iberien":"Iberien","Nordland":"Nordland","Rus":"Rus","Ungarn":"Ungarn"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
