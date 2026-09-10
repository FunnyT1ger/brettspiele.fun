/* Europa map — region/continent translations for "ja".
   Loaded before map3d.js alongside the engine-wide i18n/ja.js pack; map3d.js
   merges window.WB_MAP_TX_DATA with window.WB_TX_DATA before building WB_TX.
   Keys are the original German strings (logic keys); edit the "ja" values here.

   Merged in per category, NOT assigned: alle Karten teilen sich den Sprach-Slot
   in WB_MAP_TX_DATA. Ein "=" hier würde die zuvor geladenen Karten still
   auslöschen — dann stünden ihre Gebiete wieder auf Deutsch da. */
(function (g) {
  g.WB_MAP_TX_DATA = g.WB_MAP_TX_DATA || {};
  var slot = g.WB_MAP_TX_DATA["ja"] || (g.WB_MAP_TX_DATA["ja"] = {});
  var add = {"region":{"Africa (Karthago)":"アフリカ（カルタゴ）","Anatolien":"アナトリア","Britannien":"ブリタンニア","Bulgarien":"ブルガリア","Choresmien":"ホラズム","Deutschland":"ドイツ","Dänemark":"デンマーク","Epirus":"エピロス","Finnland":"フィンランド","Frankreich":"フランス","Friesland":"フリースラント","Georgien":"ジョージア","Hellas":"ヘラス","Helvetien":"ヘルウェティア","Hibernia":"ヒベルニア","Island":"アイスランド","Italia":"イタリア","Kasachensteppe":"カザフ草原","Kastilien":"カスティーリャ","Kiew":"キエフ","Kiptschak-Steppe":"キプチャク草原","Kyrenaika":"キレナイカ","Makedonien":"マケドニア","Mauretanien":"モーリタニア","Mesopotamien":"メソポタミア","Moskau":"モスクワ","Norwegen":"ノルウェー","Nowgorod":"ノヴゴロド","Numidien":"ヌミディア","Oberägypten":"上エジプト","Palästina":"パレスチナ","Rjasan":"リャザン","Schweden":"スウェーデン","Sibirien":"シベリア","Transoxanien":"トランスオクシアナ","Tripolitanien":"トリポリタニア","Ungarn":"ハンガリー","Unterägypten":"下エジプト","Walachei":"ワラキア","Wolga-Bulgarien":"ヴォルガ・ブルガール","Zypern":"キプロス"},"continent":{"Heiliges Römisches Reich":"神聖ローマ帝国","Reich der Franken":"フランク王国","Imperium Romanum":"ローマ帝国","Byzantinisches Reich":"ビザンツ帝国","Osmanisches Reich":"オスマン帝国","Kalifat der Araber":"アラブ・カリフ国","Reich der Steppe":"草原の帝国","Britannische Inseln":"ブリテン諸島","Iberien & al-Andalus":"イベリアとアル＝アンダルス","Nordland der Wikinger":"ヴァイキングの北地","Kiewer Rus":"キエフ・ルーシ","Königreich Ungarn":"ハンガリー王国","Maghreb":"マグリブ"},"continentShort":{"HRR":"神聖ローマ","Franken":"フランク","Rom":"ローマ","Byzanz":"ビザンツ","Osmanen":"オスマン","Kalifat":"カリフ国","Steppe":"草原","Britannia":"ブリタンニア","Iberien":"イベリア","Nordland":"ヴァイキング","Rus":"ルーシ","Ungarn":"ハンガリー"}};
  for (var cat in add) {
    slot[cat] = slot[cat] || {};
    for (var k in add[cat]) slot[cat][k] = add[cat][k];
  }
})(typeof window !== "undefined" ? window : globalThis);
