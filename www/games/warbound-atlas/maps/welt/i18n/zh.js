/* Welt map — region/continent translations for "zh".
   Loaded before map3d.js alongside the engine-wide i18n/zh.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "zh" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["zh"] || (g.WB_MAP_TX_DATA["zh"] = {});
  var add = {"region":{"Afghanistan":"阿富汗","Alaska":"阿拉斯加","Algerien":"阿尔及利亚","Amazonas":"亚马孙","Angola":"安哥拉","Argentinien":"阿根廷","Aserbaidschan":"阿塞拜疆","Bahamas":"巴哈马","Belarus":"白俄罗斯","Bolivien":"玻利维亚","Botswana":"博茨瓦纳","British Columbia":"不列颠哥伦比亚","Brunei":"文莱","Burkina Faso":"布基纳法索","Chile":"智利","Deutschland":"德国","Dom. Rep.":"多米尼加","Elfenbeink.":"科特迪瓦","Falklandinseln":"福克兰群岛","Fernost":"远东","Fidschi":"斐济","Finnland":"芬兰","Florida":"佛罗里达","Frankreich":"法国","Griechenland":"希腊","Großbritannien":"大不列颠","Grönland":"格陵兰","Guinea":"几内亚","Indien":"印度","Indonesien":"印度尼西亚","Irak":"伊拉克","Iran":"伊朗","Irland":"爱尔兰","Island":"冰岛","Italien":"意大利","Jamaika":"牙买加","Japan":"日本","Jemen":"也门","Kalifornien":"加利福尼亚","Kamerun":"喀麦隆","Kasachstan":"哈萨克斯坦","Kenia":"肯尼亚","Kolumbien":"哥伦比亚","Kongo":"刚果","Kongo-Br.":"刚果（布）","Kuba":"古巴","Lesotho":"莱索托","Libyen":"利比亚","Madagaskar":"马达加斯加","Malaysia":"马来西亚","Mali":"马里","Manitoba":"马尼托巴","Marokko":"摩洛哥","Mauretanien":"毛里塔尼亚","Mexiko":"墨西哥","Mongolei":"蒙古","Mosambik":"莫桑比克","Moskau":"莫斯科","Myanmar":"缅甸","Namibia":"纳米比亚","Neuengland":"新英格兰","Neukaledonien":"新喀里多尼亚","Neuseeland":"新西兰","Niger":"尼日尔","Nigeria":"尼日利亚","Nordeste":"东北部","Nordkorea":"朝鲜","Norwegen":"挪威","Oman":"阿曼","Osttimor":"东帝汶","Pakistan":"巴基斯坦","Papua-Neuguinea":"巴布亚新几内亚","Paraguay":"巴拉圭","Peking":"北京","Peru":"秘鲁","Philippinen":"菲律宾","Polen":"波兰","Puerto Rico":"波多黎各","Queensland":"昆士兰","Québec":"魁北克","Republik China":"台湾","Republik Zypern":"塞浦路斯","Rumänien":"罗马尼亚","Salomonen":"所罗门群岛","Sambia":"赞比亚","Saudi-Arabien":"沙特阿拉伯","Schweden":"瑞典","Sibirien":"西伯利亚","Sichuan":"四川","Simbabwe":"津巴布韦","Somalia":"索马里","Spanien":"西班牙","Sri Lanka":"斯里兰卡","Sudan":"苏丹","São Paulo":"圣保罗","Südafrika":"南非","Südsudan":"南苏丹","Tansania":"坦桑尼亚","Thailand":"泰国","Tibet":"西藏","Trinidad":"特立尼达","Tschad":"乍得","Turkmenistan":"土库曼斯坦","Türkei":"土耳其","Ukraine":"乌克兰","Ural":"乌拉尔","Usbekistan":"乌兹别克斯坦","Vanuatu":"瓦努阿图","Venezuela":"委内瑞拉","Vietnam":"越南","Westaustralien":"西澳大利亚","Westbalkan":"西巴尔干","Zentralafrika":"中非","Ägypten":"埃及","Äthiopien":"埃塞俄比亚"},"continent":{"Nordamerika":"北美洲","Südamerika":"南美洲","Europa":"欧洲","Naher Osten":"中东","Afrika":"非洲","Asien":"亚洲","Ozeanien":"大洋洲"},"continentShort":{"N-Amerika":"北美","S-Amerika":"南美","Nahost":"中东"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
