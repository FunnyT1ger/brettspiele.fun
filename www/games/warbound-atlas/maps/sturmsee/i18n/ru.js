/* Sturmsee map — region/continent translations for "ru".
   Loaded before map3d.js alongside the engine-wide i18n/ru.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "ru" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["ru"] || (g.WB_MAP_TX_DATA["ru"] = {});
  var add = {"region":{"Blitzkutter":"Молниевый Куттер","Brandungsbraut":"Невеста Прибоя","Delfinsprung":"Прыжок Дельфина","Donnerhall":"Раскат Грома","Eisbrecher":"Ледокол","Frostklinge":"Морозный Клинок","Gischtreiter":"Всадник Брызг","Grauschleier":"Серая Вуаль","Klippenwacht":"Стража Утёсов","Krakentöter":"Убийца Кракенов","Nebelgänger":"Идущий в Тумане","Nordwind":"Северный Ветер","Passatwind":"Пассат","Riffbrecher":"Рифолом","Salzschaluppe":"Солёный Шлюп","Schwarzwoge":"Чёрный Вал","Sonnensegel":"Солнечный Парус","Stillwasser":"Тихие Воды","Sturzwelle":"Обрушная Волна","Tiefenwacht":"Стража Глубин","Wetterbö":"Шквал"},"continent":{"Eisflotte":"Ледяной флот","Sturmflotte":"Штормовой флот","Korallenflotte":"Коралловый флот","Passatflotte":"Пассатный флот","Klippenflotte":"Утёсный флот","Nebelflotte":"Туманный флот","Krakenflotte":"Флот Кракена"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
