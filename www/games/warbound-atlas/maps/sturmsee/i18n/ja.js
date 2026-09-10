/* Sturmsee map — region/continent translations for "ja".
   Loaded before map3d.js alongside the engine-wide i18n/ja.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "ja" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["ja"] || (g.WB_MAP_TX_DATA["ja"] = {});
  var add = {"region":{"Blitzkutter":"雷光のカッター","Brandungsbraut":"波涛の花嫁","Delfinsprung":"イルカの跳躍","Donnerhall":"雷鳴の轟き","Eisbrecher":"砕氷船","Frostklinge":"霜の刃","Gischtreiter":"飛沫駆り","Grauschleier":"灰の帳","Klippenwacht":"断崖の守り","Krakentöter":"クラーケン狩り","Nebelgänger":"霧渡り","Nordwind":"北風","Passatwind":"貿易風","Riffbrecher":"砕礁号","Salzschaluppe":"塩のスループ","Schwarzwoge":"黒波","Sonnensegel":"陽の帆","Stillwasser":"静水","Sturzwelle":"崩れ波","Tiefenwacht":"深淵の守り","Wetterbö":"スコール"},"continent":{"Eisflotte":"氷の艦隊","Sturmflotte":"嵐の艦隊","Korallenflotte":"珊瑚の艦隊","Passatflotte":"貿易風の艦隊","Klippenflotte":"断崖の艦隊","Nebelflotte":"霧の艦隊","Krakenflotte":"クラーケンの艦隊"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
