/* Europa map — region/continent translations for "fr".
   Loaded before map3d.js alongside the engine-wide i18n/fr.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "fr" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["fr"] || (g.WB_MAP_TX_DATA["fr"] = {});
  var add = {"region":{"Africa (Karthago)":"Africa (Carthage)","Anatolien":"Anatolie","Britannien":"Britannia","Bulgarien":"Bulgarie","Choresmien":"Khwarezm","Deutschland":"Allemagne","Dänemark":"Danemark","Epirus":"Épire","Finnland":"Finlande","Frankreich":"France","Friesland":"Frise","Georgien":"Géorgie","Hellas":"Hellade","Helvetien":"Helvétie","Hibernia":"Hibernia","Island":"Islande","Italia":"Italia","Kasachensteppe":"Steppe kazakhe","Kastilien":"Castille","Kiew":"Kiev","Kiptschak-Steppe":"Steppe kiptchak","Kyrenaika":"Cyrénaïque","Makedonien":"Macédoine","Mauretanien":"Mauritanie","Mesopotamien":"Mésopotamie","Moskau":"Moscou","Norwegen":"Norvège","Nowgorod":"Novgorod","Numidien":"Numidie","Oberägypten":"Haute-Égypte","Palästina":"Palestine","Rjasan":"Riazan","Schweden":"Suède","Sibirien":"Sibérie","Transoxanien":"Transoxiane","Tripolitanien":"Tripolitaine","Ungarn":"Hongrie","Unterägypten":"Basse-Égypte","Walachei":"Valachie","Wolga-Bulgarien":"Bulgarie de la Volga","Zypern":"Chypre"},"continent":{"Heiliges Römisches Reich":"Saint-Empire romain","Reich der Franken":"Empire des Francs","Imperium Romanum":"Imperium Romanum","Byzantinisches Reich":"Empire byzantin","Osmanisches Reich":"Empire ottoman","Kalifat der Araber":"Califat arabe","Reich der Steppe":"Empire de la Steppe","Britannische Inseln":"Îles Britanniques","Iberien & al-Andalus":"Ibérie & al-Andalus","Nordland der Wikinger":"Terres nordiques des Vikings","Kiewer Rus":"Rus’ de Kiev","Königreich Ungarn":"Royaume de Hongrie","Maghreb":"Maghreb"},"continentShort":{"HRR":"St-Empire","Franken":"Francs","Rom":"Rome","Byzanz":"Byzance","Osmanen":"Ottomans","Kalifat":"Califat","Steppe":"Steppe","Britannia":"Britannia","Iberien":"Ibérie","Nordland":"Vikings","Rus":"Rus’","Ungarn":"Hongrie"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
