/* Europa map — region/continent translations for "ru".
   Loaded before map3d.js alongside the engine-wide i18n/ru.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "ru" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["ru"] || (g.WB_MAP_TX_DATA["ru"] = {});
  var add = {"region":{"Africa (Karthago)":"Африка (Карфаген)","Anatolien":"Анатолия","Britannien":"Британия","Bulgarien":"Болгария","Choresmien":"Хорезм","Deutschland":"Германия","Dänemark":"Дания","Epirus":"Эпир","Finnland":"Финляндия","Frankreich":"Франция","Friesland":"Фрисландия","Georgien":"Грузия","Hellas":"Эллада","Helvetien":"Гельвеция","Hibernia":"Гиберния","Island":"Исландия","Italia":"Италия","Kasachensteppe":"Казахская степь","Kastilien":"Кастилия","Kiew":"Киев","Kiptschak-Steppe":"Кипчакская степь","Kyrenaika":"Киренаика","Makedonien":"Македония","Mauretanien":"Мавритания","Mesopotamien":"Месопотамия","Moskau":"Москва","Norwegen":"Норвегия","Nowgorod":"Новгород","Numidien":"Нумидия","Oberägypten":"Верхний Египет","Palästina":"Палестина","Rjasan":"Рязань","Schweden":"Швеция","Sibirien":"Сибирь","Transoxanien":"Мавераннахр","Tripolitanien":"Триполитания","Ungarn":"Венгрия","Unterägypten":"Нижний Египет","Walachei":"Валахия","Wolga-Bulgarien":"Волжская Булгария","Zypern":"Кипр"},"continent":{"Heiliges Römisches Reich":"Священная Римская империя","Reich der Franken":"Держава франков","Imperium Romanum":"Imperium Romanum","Byzantinisches Reich":"Византийская империя","Osmanisches Reich":"Османская империя","Kalifat der Araber":"Арабский халифат","Reich der Steppe":"Держава Степи","Britannische Inseln":"Британские острова","Iberien & al-Andalus":"Иберия и аль-Андалус","Nordland der Wikinger":"Северные земли викингов","Kiewer Rus":"Киевская Русь","Königreich Ungarn":"Королевство Венгрия","Maghreb":"Магриб"},"continentShort":{"HRR":"СРИ","Franken":"Франки","Rom":"Рим","Byzanz":"Византия","Osmanen":"Османы","Kalifat":"Халифат","Steppe":"Степь","Britannia":"Британия","Iberien":"Иберия","Nordland":"Викинги","Rus":"Русь","Ungarn":"Венгрия"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
