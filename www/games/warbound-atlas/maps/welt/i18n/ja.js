/* Welt map — region/continent translations for "ja".
   Loaded before map3d.js alongside the engine-wide i18n/ja.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "ja" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["ja"] || (g.WB_MAP_TX_DATA["ja"] = {});
  var add = {"region":{"Afghanistan":"アフガニスタン","Alaska":"アラスカ","Algerien":"アルジェリア","Amazonas":"アマゾン","Angola":"アンゴラ","Argentinien":"アルゼンチン","Aserbaidschan":"アゼルバイジャン","Bahamas":"バハマ","Belarus":"ベラルーシ","Bolivien":"ボリビア","Botswana":"ボツワナ","British Columbia":"ブリティッシュコロンビア","Brunei":"ブルネイ","Burkina Faso":"ブルキナファソ","Chile":"チリ","Deutschland":"ドイツ","Dom. Rep.":"ドミニカ共和国","Elfenbeink.":"コートジボワール","Falklandinseln":"フォークランド諸島","Fernost":"極東","Fidschi":"フィジー","Finnland":"フィンランド","Florida":"フロリダ","Frankreich":"フランス","Griechenland":"ギリシャ","Großbritannien":"グレートブリテン","Grönland":"グリーンランド","Guinea":"ギニア","Indien":"インド","Indonesien":"インドネシア","Irak":"イラク","Iran":"イラン","Irland":"アイルランド","Island":"アイスランド","Italien":"イタリア","Jamaika":"ジャマイカ","Japan":"日本","Jemen":"イエメン","Kalifornien":"カリフォルニア","Kamerun":"カメルーン","Kasachstan":"カザフスタン","Kenia":"ケニア","Kolumbien":"コロンビア","Kongo":"コンゴ","Kongo-Br.":"コンゴ共和国","Kuba":"キューバ","Lesotho":"レソト","Libyen":"リビア","Madagaskar":"マダガスカル","Malaysia":"マレーシア","Mali":"マリ","Manitoba":"マニトバ","Marokko":"モロッコ","Mauretanien":"モーリタニア","Mexiko":"メキシコ","Mongolei":"モンゴル","Mosambik":"モザンビーク","Moskau":"モスクワ","Myanmar":"ミャンマー","Namibia":"ナミビア","Neuengland":"ニューイングランド","Neukaledonien":"ニューカレドニア","Neuseeland":"ニュージーランド","Niger":"ニジェール","Nigeria":"ナイジェリア","Nordeste":"ノルデステ","Nordkorea":"北朝鮮","Norwegen":"ノルウェー","Oman":"オマーン","Osttimor":"東ティモール","Pakistan":"パキスタン","Papua-Neuguinea":"パプアニューギニア","Paraguay":"パラグアイ","Peking":"北京","Peru":"ペルー","Philippinen":"フィリピン","Polen":"ポーランド","Puerto Rico":"プエルトリコ","Queensland":"クイーンズランド","Québec":"ケベック","Republik China":"台湾","Republik Zypern":"キプロス","Rumänien":"ルーマニア","Salomonen":"ソロモン諸島","Sambia":"ザンビア","Saudi-Arabien":"サウジアラビア","Schweden":"スウェーデン","Sibirien":"シベリア","Sichuan":"四川","Simbabwe":"ジンバブエ","Somalia":"ソマリア","Spanien":"スペイン","Sri Lanka":"スリランカ","Sudan":"スーダン","São Paulo":"サンパウロ","Südafrika":"南アフリカ","Südsudan":"南スーダン","Tansania":"タンザニア","Thailand":"タイ","Tibet":"チベット","Trinidad":"トリニダード","Tschad":"チャド","Turkmenistan":"トルクメニスタン","Türkei":"トルコ","Ukraine":"ウクライナ","Ural":"ウラル","Usbekistan":"ウズベキスタン","Vanuatu":"バヌアツ","Venezuela":"ベネズエラ","Vietnam":"ベトナム","Westaustralien":"西オーストラリア","Westbalkan":"西バルカン","Zentralafrika":"中部アフリカ","Ägypten":"エジプト","Äthiopien":"エチオピア"},"continent":{"Nordamerika":"北アメリカ","Südamerika":"南アメリカ","Europa":"ヨーロッパ","Naher Osten":"中東","Afrika":"アフリカ","Asien":"アジア","Ozeanien":"オセアニア"},"continentShort":{"N-Amerika":"北米","S-Amerika":"南米","Nahost":"中東"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
