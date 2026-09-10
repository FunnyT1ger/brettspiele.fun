/* Europa map — region/continent translations for "en".
   Loaded before map3d.js alongside the engine-wide i18n/en.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "en" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["en"] || (g.WB_MAP_TX_DATA["en"] = {});
  var add = {"region":{"Africa (Karthago)":"Africa (Carthage)","Anatolien":"Anatolia","Britannien":"Britannia","Bulgarien":"Bulgaria","Choresmien":"Khwarezm","Deutschland":"Germany","Dänemark":"Denmark","Epirus":"Epirus","Finnland":"Finland","Frankreich":"France","Friesland":"Frisia","Georgien":"Georgia","Hellas":"Hellas","Helvetien":"Helvetia","Hibernia":"Hibernia","Island":"Iceland","Italia":"Italia","Kasachensteppe":"Kazakh Steppe","Kastilien":"Castile","Kiew":"Kiev","Kiptschak-Steppe":"Kipchak Steppe","Kyrenaika":"Cyrenaica","Makedonien":"Macedonia","Mauretanien":"Mauritania","Mesopotamien":"Mesopotamia","Moskau":"Moscow","Norwegen":"Norway","Nowgorod":"Novgorod","Numidien":"Numidia","Oberägypten":"Upper Egypt","Palästina":"Palestine","Rjasan":"Ryazan","Schweden":"Sweden","Sibirien":"Siberia","Transoxanien":"Transoxiana","Tripolitanien":"Tripolitania","Ungarn":"Hungary","Unterägypten":"Lower Egypt","Walachei":"Wallachia","Wolga-Bulgarien":"Volga Bulgaria","Zypern":"Cyprus"},"continent":{"Heiliges Römisches Reich":"Holy Roman Empire","Reich der Franken":"Frankish Empire","Imperium Romanum":"Imperium Romanum","Byzantinisches Reich":"Byzantine Empire","Osmanisches Reich":"Ottoman Empire","Kalifat der Araber":"Arab Caliphate","Reich der Steppe":"Empire of the Steppe","Britannische Inseln":"British Isles","Iberien & al-Andalus":"Iberia & al-Andalus","Nordland der Wikinger":"Viking Northlands","Kiewer Rus":"Kievan Rus","Königreich Ungarn":"Kingdom of Hungary","Maghreb":"Maghreb"},"continentShort":{"HRR":"HRE","Franken":"Franks","Rom":"Rome","Byzanz":"Byzantium","Osmanen":"Ottomans","Kalifat":"Caliphate","Steppe":"Steppe","Britannia":"Britannia","Iberien":"Iberia","Nordland":"Vikings","Rus":"Rus","Ungarn":"Hungary"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
