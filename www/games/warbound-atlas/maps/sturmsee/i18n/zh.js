/* Sturmsee map — region/continent translations for "zh".
   Loaded before map3d.js alongside the engine-wide i18n/zh.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "zh" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["zh"] || (g.WB_MAP_TX_DATA["zh"] = {});
  var add = {"region":{"Blitzkutter":"闪电快帆","Brandungsbraut":"碎浪新娘","Delfinsprung":"海豚跃","Donnerhall":"雷鸣回响","Eisbrecher":"破冰船","Frostklinge":"霜刃","Gischtreiter":"逐浪者","Grauschleier":"灰纱","Klippenwacht":"崖岸守望","Krakentöter":"屠海妖者","Nebelgänger":"雾行者","Nordwind":"北风","Passatwind":"信风","Riffbrecher":"碎礁号","Salzschaluppe":"盐帆艇","Schwarzwoge":"黑涌","Sonnensegel":"日帆","Stillwasser":"静水","Sturzwelle":"崩浪","Tiefenwacht":"深渊守望","Wetterbö":"骤风"},"continent":{"Eisflotte":"冰之舰队","Sturmflotte":"风暴舰队","Korallenflotte":"珊瑚舰队","Passatflotte":"信风舰队","Klippenflotte":"峭壁舰队","Nebelflotte":"迷雾舰队","Krakenflotte":"海妖舰队"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
