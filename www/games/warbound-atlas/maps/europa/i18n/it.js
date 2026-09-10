/* Europa map — region/continent translations for "it".
   Loaded before map3d.js alongside the engine-wide i18n/it.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "it" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["it"] || (g.WB_MAP_TX_DATA["it"] = {});
  var add = {"region":{"Africa (Karthago)":"Africa (Cartagine)","Anatolien":"Anatolia","Britannien":"Britannia","Bulgarien":"Bulgaria","Choresmien":"Corasmia","Deutschland":"Germania","Dänemark":"Danimarca","Epirus":"Epiro","Finnland":"Finlandia","Frankreich":"Francia","Friesland":"Frisia","Georgien":"Georgia","Hellas":"Ellade","Helvetien":"Elvezia","Hibernia":"Hibernia","Island":"Islanda","Italia":"Italia","Kasachensteppe":"Steppa kazaka","Kastilien":"Castiglia","Kiew":"Kiev","Kiptschak-Steppe":"Steppa dei Cumani","Kyrenaika":"Cirenaica","Makedonien":"Macedonia","Mauretanien":"Mauritania","Mesopotamien":"Mesopotamia","Moskau":"Mosca","Norwegen":"Norvegia","Nowgorod":"Novgorod","Numidien":"Numidia","Oberägypten":"Alto Egitto","Palästina":"Palestina","Rjasan":"Rjazan'","Schweden":"Svezia","Sibirien":"Siberia","Transoxanien":"Transoxiana","Tripolitanien":"Tripolitania","Ungarn":"Ungheria","Unterägypten":"Basso Egitto","Walachei":"Valacchia","Wolga-Bulgarien":"Bulgaria del Volga","Zypern":"Cipro"},"continent":{"Heiliges Römisches Reich":"Sacro Romano Impero","Reich der Franken":"Impero dei Franchi","Imperium Romanum":"Imperium Romanum","Byzantinisches Reich":"Impero bizantino","Osmanisches Reich":"Impero ottomano","Kalifat der Araber":"Califfato arabo","Reich der Steppe":"Impero della Steppa","Britannische Inseln":"Isole Britanniche","Iberien & al-Andalus":"Iberia e al-Andalus","Nordland der Wikinger":"Terre del Nord dei Vichinghi","Kiewer Rus":"Rus' di Kiev","Königreich Ungarn":"Regno d'Ungheria","Maghreb":"Maghreb"},"continentShort":{"HRR":"SRI","Franken":"Franchi","Rom":"Roma","Byzanz":"Bisanzio","Osmanen":"Ottomani","Kalifat":"Califfato","Steppe":"Steppa","Britannia":"Britannia","Iberien":"Iberia","Nordland":"Vichinghi","Rus":"Rus'","Ungarn":"Ungheria"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
