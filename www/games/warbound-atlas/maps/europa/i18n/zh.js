/* Europa map — region/continent translations for "zh".
   Loaded before map3d.js alongside the engine-wide i18n/zh.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "zh" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["zh"] || (g.WB_MAP_TX_DATA["zh"] = {});
  var add = {"region":{"Africa (Karthago)":"阿非利加（迦太基）","Anatolien":"安纳托利亚","Britannien":"不列颠尼亚","Bulgarien":"保加利亚","Choresmien":"花剌子模","Deutschland":"德意志","Dänemark":"丹麦","Epirus":"伊庇鲁斯","Finnland":"芬兰","Frankreich":"法兰西","Friesland":"弗里西亚","Georgien":"格鲁吉亚","Hellas":"希腊","Helvetien":"赫尔维蒂","Hibernia":"希伯尼亚","Island":"冰岛","Italia":"意大利","Kasachensteppe":"哈萨克草原","Kastilien":"卡斯蒂利亚","Kiew":"基辅","Kiptschak-Steppe":"钦察草原","Kyrenaika":"昔兰尼加","Makedonien":"马其顿","Mauretanien":"毛里塔尼亚","Mesopotamien":"美索不达米亚","Moskau":"莫斯科","Norwegen":"挪威","Nowgorod":"诺夫哥罗德","Numidien":"努米底亚","Oberägypten":"上埃及","Palästina":"巴勒斯坦","Rjasan":"梁赞","Schweden":"瑞典","Sibirien":"西伯利亚","Transoxanien":"河中地区","Tripolitanien":"的黎波里塔尼亚","Ungarn":"匈牙利","Unterägypten":"下埃及","Walachei":"瓦拉几亚","Wolga-Bulgarien":"伏尔加保加利亚","Zypern":"塞浦路斯"},"continent":{"Heiliges Römisches Reich":"神圣罗马帝国","Reich der Franken":"法兰克帝国","Imperium Romanum":"罗马帝国","Byzantinisches Reich":"拜占庭帝国","Osmanisches Reich":"奥斯曼帝国","Kalifat der Araber":"阿拉伯哈里发国","Reich der Steppe":"草原帝国","Britannische Inseln":"不列颠群岛","Iberien & al-Andalus":"伊比利亚与安达卢斯","Nordland der Wikinger":"维京北地","Kiewer Rus":"基辅罗斯","Königreich Ungarn":"匈牙利王国","Maghreb":"马格里布"},"continentShort":{"HRR":"神罗","Franken":"法兰克","Rom":"罗马","Byzanz":"拜占庭","Osmanen":"奥斯曼","Kalifat":"哈里发","Steppe":"草原","Britannia":"不列颠","Iberien":"伊比利亚","Nordland":"维京","Rus":"罗斯","Ungarn":"匈牙利"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
