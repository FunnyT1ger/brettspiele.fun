/* Sturmsee — Schiffskampf-Karte für Warbound Atlas (automatisch generiert).
   Reine Archipel-Seeschlacht: KEINE Burgen, Häfen oder Städte.
   Registriert sich in window.WB_MAPS und wird VOR game.js geladen. */
(function (g) {
  g.WB_MAPS = g.WB_MAPS || {};
  g.WB_MAPS["sturmsee"] = {
    id: "sturmsee",
    name: "Sturmsee",
    naval: true,
    /* See-Karte: der Marker IST das Schiff (Segel trägt Wappen + Truppenzahl).
       Ein eigenes Boot-Figuren-Set ('naval') ist im Code vorbereitet, wird
       hier aber nicht genutzt — die Flotte selbst dient als Figur. */
    figures: "naval",
    /* Sektoren (Meeresarchipele): key/name/color/bonus/ownerHouse */
    continents: [
  {key:"Nordwacht", name:"Eisflotte", color:"#6da3c4", bonus:4, ownerHouse:null},
  {key:"Sturmkap", name:"Sturmflotte", color:"#4a5878", bonus:3, ownerHouse:null},
  {key:"Ostriff", name:"Korallenflotte", color:"#c8807a", bonus:4, ownerHouse:null},
  {key:"Suedstrom", name:"Passatflotte", color:"#e0c070", bonus:4, ownerHouse:null},
  {key:"Westklippen", name:"Klippenflotte", color:"#828a94", bonus:3, ownerHouse:null},
  {key:"Nebelbucht", name:"Nebelflotte", color:"#9aa0b0", bonus:3, ownerHouse:null},
  {key:"Krakentiefe", name:"Krakenflotte", color:"#3a4a66", bonus:5, ownerHouse:null}
    ],
    /* Territorien: id/name/continent/cx/cy/d (SVG-Pfad)/neighbors */
    regions: [
  {id:"isl1",name:"Frostklinge",continent:"Nordwacht",cx:134.8,cy:22.0,d:"M 145.57,22.00 L 144.43,28.96 L 137.73,30.88 L 131.51,32.27 L 126.81,27.84 L 125.47,22.00 L 125.49,15.20 L 131.86,12.81 L 137.72,13.15 L 143.66,15.60 Z",neighbors:["isl2", "isl4", "isl30"]},
  {id:"isl2",name:"Frostklinge_2",continent:"Nordwacht",cx:162.3,cy:22.0,d:"M 171.18,22.00 L 170.38,27.87 L 165.77,32.65 L 159.55,30.48 L 152.76,28.94 L 151.06,22.00 L 154.46,16.30 L 158.74,11.03 L 165.76,11.37 L 169.60,16.70 Z",neighbors:["isl1", "isl4", "isl3", "isl5"]},
  {id:"isl3",name:"Nordwind",continent:"Nordwacht",cx:189.8,cy:22.0,d:"M 200.51,22.00 L 199.35,28.96 L 192.65,30.88 L 186.44,32.26 L 181.73,27.84 L 180.50,22.00 L 180.42,15.21 L 186.79,12.84 L 192.65,13.14 L 198.61,15.58 Z",neighbors:["isl2", "isl4", "isl5", "isl6"]},
  {id:"isl4",name:"Eisbrecher",continent:"Nordwacht",cx:162.3,cy:50.2,d:"M 172.09,50.25 L 169.69,55.61 L 165.75,60.83 L 158.70,61.36 L 154.97,55.58 L 150.08,50.25 L 154.36,44.48 L 158.44,38.35 L 165.49,40.47 L 171.83,43.33 Z",neighbors:["isl1", "isl2", "isl3", "isl5"]},
  {id:"isl5",name:"Eisbrecher_2",continent:"Nordwacht",cx:189.8,cy:50.2,d:"M 201.43,50.25 L 198.66,56.71 L 192.63,59.06 L 186.74,59.58 L 180.92,56.68 L 179.41,50.25 L 179.70,42.93 L 186.47,40.10 L 193.53,38.68 L 197.77,44.44 Z",neighbors:["isl2", "isl3", "isl4", "isl6", "isl34"]},
  {id:"isl6",name:"Nordwind_2",continent:"Nordwacht",cx:217.2,cy:50.2,d:"M 226.97,50.25 L 224.59,55.60 L 220.64,60.74 L 213.62,61.35 L 209.91,55.57 L 204.99,50.25 L 208.67,44.03 L 213.36,38.33 L 220.41,40.46 L 226.74,43.34 Z",neighbors:["isl3", "isl5", "isl9"]},
  {id:"isl7",name:"Donnerhall",continent:"Sturmkap",cx:299.6,cy:22.0,d:"M 310.37,22.00 L 309.38,29.09 L 302.50,30.89 L 296.27,32.30 L 291.61,27.82 L 290.33,22.00 L 290.23,15.18 L 296.63,12.83 L 302.53,13.02 L 308.44,15.59 Z",neighbors:["isl9", "isl8", "isl10"]},
  {id:"isl8",name:"Donnerhall_2",continent:"Sturmkap",cx:327.1,cy:22.0,d:"M 336.26,22.00 L 335.31,27.98 L 330.55,32.68 L 324.31,30.52 L 317.55,28.92 L 315.92,22.00 L 319.20,16.28 L 323.52,11.05 L 330.58,11.23 L 334.40,16.68 Z",neighbors:["isl7", "isl9", "isl10"]},
  {id:"isl9",name:"Wetterbö",continent:"Sturmkap",cx:299.6,cy:50.2,d:"M 311.23,50.25 L 308.49,56.70 L 302.44,58.96 L 296.59,59.56 L 290.79,56.66 L 289.35,50.25 L 289.56,42.94 L 296.33,40.14 L 303.38,38.67 L 307.65,44.41 Z",neighbors:["isl7", "isl8", "isl10", "isl35", "isl6"]},
  {id:"isl10",name:"Wetterbö_2",continent:"Sturmkap",cx:327.1,cy:50.2,d:"M 336.83,50.25 L 334.42,55.59 L 330.49,60.75 L 323.46,61.40 L 319.76,55.56 L 314.94,50.25 L 318.53,44.04 L 323.22,38.37 L 330.26,40.44 L 336.63,43.31 Z",neighbors:["isl7", "isl8", "isl9", "isl11"]},
  {id:"isl11",name:"Blitzkutter",continent:"Sturmkap",cx:354.5,cy:78.5,d:"M 364.95,78.50 L 361.78,83.76 L 357.77,88.46 L 350.67,90.41 L 346.00,84.70 L 342.73,78.50 L 346.25,72.48 L 351.72,69.83 L 357.66,68.90 L 363.60,71.91 Z",neighbors:["isl10", "isl12"]},
  {id:"isl12",name:"Riffbrecher",continent:"Ostriff",cx:354.5,cy:106.8,d:"M 364.34,106.75 L 361.85,112.06 L 357.71,116.51 L 350.91,117.90 L 347.26,112.04 L 342.35,106.75 L 345.94,100.50 L 350.68,94.89 L 357.70,97.01 L 364.10,99.80 Z",neighbors:["isl13", "isl14", "isl11"]},
  {id:"isl13",name:"Brandungsbraut",continent:"Ostriff",cx:327.1,cy:135.0,d:"M 335.92,135.00 L 335.21,140.91 L 330.81,146.48 L 324.33,143.45 L 317.47,141.98 L 315.79,135.00 L 319.88,129.77 L 323.50,123.98 L 330.54,124.33 L 334.34,129.73 Z",neighbors:["isl12", "isl15", "isl14", "isl37"]},
  {id:"isl14",name:"Riffbrecher_2",continent:"Ostriff",cx:354.5,cy:135.0,d:"M 365.26,135.00 L 364.18,142.00 L 357.69,144.70 L 351.22,145.22 L 346.44,140.88 L 345.11,135.00 L 345.83,128.68 L 351.54,125.76 L 357.43,126.11 L 363.31,128.63 Z",neighbors:["isl12", "isl13", "isl15", "isl16"]},
  {id:"isl15",name:"Brandungsbraut_2",continent:"Ostriff",cx:327.1,cy:163.2,d:"M 337.02,163.25 L 334.70,168.79 L 330.46,173.66 L 323.35,174.72 L 319.68,168.62 L 314.81,163.25 L 319.15,157.49 L 323.25,151.47 L 330.34,153.21 L 336.51,156.39 Z",neighbors:["isl13", "isl14", "isl22"]},
  {id:"isl16",name:"Salzschaluppe",continent:"Ostriff",cx:382.0,cy:163.2,d:"M 394.45,163.25 L 390.58,169.49 L 385.59,174.30 L 378.78,173.16 L 372.13,170.42 L 371.85,163.25 L 374.69,157.94 L 378.54,152.60 L 385.62,152.10 L 389.74,157.63 Z",neighbors:["isl14"]},
  {id:"isl17",name:"Delfinsprung",continent:"Suedstrom",cx:189.8,cy:219.8,d:"M 199.06,219.75 L 197.50,225.37 L 193.32,230.69 L 186.87,228.67 L 182.08,225.34 L 179.03,219.75 L 181.61,213.82 L 186.06,208.32 L 193.10,209.49 L 199.70,212.54 Z",neighbors:["isl19", "isl20", "isl18", "isl21"]},
  {id:"isl18",name:"Sonnensegel",continent:"Suedstrom",cx:217.2,cy:219.8,d:"M 228.39,219.75 L 226.47,226.47 L 220.21,228.92 L 213.76,230.44 L 208.02,226.44 L 208.36,219.75 L 207.52,212.69 L 214.09,210.08 L 219.95,211.38 L 225.63,213.65 Z",neighbors:["isl17", "isl20", "isl21", "isl22", "isl38"]},
  {id:"isl19",name:"Passatwind",continent:"Suedstrom",cx:162.3,cy:248.0,d:"M 172.00,248.00 L 169.89,253.51 L 165.67,258.34 L 158.63,259.31 L 154.76,253.49 L 151.28,248.00 L 154.18,242.10 L 158.57,236.51 L 165.66,237.69 L 172.38,240.68 Z",neighbors:["isl17", "isl20", "isl28"]},
  {id:"isl20",name:"Passatwind_2",continent:"Suedstrom",cx:189.8,cy:248.0,d:"M 201.34,248.00 L 198.86,254.61 L 192.55,256.56 L 186.67,257.53 L 180.70,254.59 L 180.60,248.00 L 180.14,241.01 L 186.61,238.29 L 192.54,239.47 L 198.33,241.78 Z",neighbors:["isl17", "isl18", "isl19", "isl21"]},
  {id:"isl21",name:"Delfinsprung_2",continent:"Suedstrom",cx:217.2,cy:248.0,d:"M 226.93,248.00 L 224.82,253.51 L 220.59,258.33 L 213.56,259.30 L 209.67,253.49 L 206.20,248.00 L 209.12,242.10 L 213.50,236.52 L 220.47,238.02 L 227.29,240.69 Z",neighbors:["isl17", "isl18", "isl20", "isl22"]},
  {id:"isl22",name:"Sonnensegel_2",continent:"Suedstrom",cx:244.7,cy:248.0,d:"M 256.27,248.00 L 253.79,254.61 L 247.48,256.57 L 241.60,257.52 L 235.64,254.57 L 235.52,248.00 L 235.03,240.98 L 241.53,238.27 L 248.51,236.24 L 253.23,241.80 Z",neighbors:["isl18", "isl21", "isl15"]},
  {id:"isl23",name:"Klippenwacht",continent:"Westklippen",cx:52.5,cy:106.8,d:"M 64.22,106.75 L 61.64,113.42 L 55.28,115.43 L 49.33,116.38 L 43.50,113.26 L 43.40,106.75 L 42.90,99.80 L 49.27,96.92 L 56.32,94.87 L 60.34,101.02 Z",neighbors:["isl24", "isl25", "isl31"]},
  {id:"isl24",name:"Gischtreiter",continent:"Westklippen",cx:25.0,cy:135.0,d:"M 35.45,135.00 L 34.81,142.12 L 28.05,144.39 L 21.60,145.48 L 16.74,141.00 L 13.10,135.00 L 16.26,128.65 L 22.08,126.01 L 27.97,125.86 L 34.36,128.20 Z",neighbors:["isl23", "isl26", "isl25", "isl27"]},
  {id:"isl25",name:"Klippenwacht_2",continent:"Westklippen",cx:52.5,cy:135.0,d:"M 64.79,135.00 L 60.75,141.02 L 56.09,146.17 L 49.64,143.69 L 42.69,142.10 L 42.42,135.00 L 45.25,129.76 L 48.96,124.23 L 56.01,124.08 L 60.31,129.30 Z",neighbors:["isl23", "isl24", "isl26", "isl27"]},
  {id:"isl26",name:"Gischtreiter_2",continent:"Westklippen",cx:25.0,cy:163.2,d:"M 36.55,163.25 L 34.30,170.01 L 27.78,171.79 L 21.92,172.74 L 15.93,169.84 L 15.74,163.25 L 15.35,156.24 L 21.83,153.50 L 27.77,154.74 L 33.52,157.06 Z",neighbors:["isl24", "isl25", "isl27"]},
  {id:"isl27",name:"Sturzwelle",continent:"Westklippen",cx:52.5,cy:163.2,d:"M 62.14,163.25 L 60.24,168.90 L 55.82,173.58 L 48.80,174.52 L 44.90,168.75 L 41.33,163.25 L 44.33,157.35 L 48.72,151.72 L 55.81,152.95 L 62.50,155.96 Z",neighbors:["isl24", "isl25", "isl26", "isl28"]},
  {id:"isl28",name:"Sturzwelle_2",continent:"Westklippen",cx:79.9,cy:191.5,d:"M 89.74,191.50 L 87.42,196.95 L 83.10,201.27 L 76.29,202.69 L 72.65,196.78 L 67.84,191.50 L 71.33,185.26 L 76.08,179.68 L 83.13,181.63 L 89.51,184.54 Z",neighbors:["isl27", "isl36", "isl19"]},
  {id:"isl29",name:"Nebelgänger",continent:"Nebelbucht",cx:52.5,cy:50.2,d:"M 63.11,50.25 L 62.54,57.57 L 55.48,59.54 L 48.66,61.94 L 44.12,56.31 L 40.43,50.25 L 43.59,43.81 L 49.57,41.36 L 55.51,40.87 L 61.71,43.53 Z",neighbors:["isl31", "isl30", "isl32"]},
  {id:"isl30",name:"Nebelgänger_2",continent:"Nebelbucht",cx:79.9,cy:50.2,d:"M 92.44,50.25 L 88.49,56.47 L 83.52,61.33 L 76.70,60.15 L 70.07,57.41 L 69.75,50.25 L 72.58,44.91 L 76.46,39.58 L 83.55,39.09 L 87.67,44.62 Z",neighbors:["isl29", "isl31", "isl32", "isl33", "isl1"]},
  {id:"isl31",name:"Grauschleier",continent:"Nebelbucht",cx:52.5,cy:78.5,d:"M 63.68,78.50 L 61.84,85.32 L 55.21,86.95 L 48.97,89.26 L 43.31,85.15 L 43.66,78.50 L 42.73,71.43 L 49.34,68.90 L 55.20,70.09 L 60.92,72.36 Z",neighbors:["isl29", "isl30", "isl32", "isl23"]},
  {id:"isl32",name:"Grauschleier_2",continent:"Nebelbucht",cx:79.9,cy:78.5,d:"M 89.27,78.50 L 87.79,84.21 L 83.25,88.73 L 77.01,87.48 L 72.28,84.05 L 69.24,78.50 L 71.71,72.54 L 76.23,67.13 L 83.24,68.30 L 89.90,71.25 Z",neighbors:["isl29", "isl30", "isl31", "isl33"]},
  {id:"isl33",name:"Stillwasser",continent:"Nebelbucht",cx:107.4,cy:78.5,d:"M 118.61,78.50 L 116.77,85.32 L 110.13,86.94 L 103.89,89.25 L 98.23,85.15 L 98.57,78.50 L 97.66,71.43 L 104.27,68.91 L 110.12,70.08 L 115.85,72.35 Z",neighbors:["isl30", "isl32", "isl34"]},
  {id:"isl34",name:"Tiefenwacht",continent:"Krakentiefe",cx:189.8,cy:106.8,d:"M 199.24,106.75 L 197.55,112.40 L 193.34,117.75 L 186.89,115.61 L 182.03,112.37 L 178.97,106.75 L 182.22,101.27 L 186.11,95.49 L 193.19,96.22 L 199.65,99.57 Z",neighbors:["isl36", "isl35", "isl37", "isl5", "isl33"]},
  {id:"isl35",name:"Tiefenwacht_2",continent:"Krakentiefe",cx:217.2,cy:106.8,d:"M 228.57,106.75 L 226.52,113.50 L 220.23,115.97 L 213.78,117.39 L 207.97,113.48 L 208.29,106.75 L 208.13,100.14 L 214.14,97.24 L 219.97,98.32 L 225.58,100.68 Z",neighbors:["isl34", "isl36", "isl37", "isl9"]},
  {id:"isl36",name:"Krakentöter",continent:"Krakentiefe",cx:189.8,cy:135.0,d:"M 200.09,135.00 L 197.04,140.28 L 193.00,144.93 L 185.91,146.88 L 181.21,141.22 L 177.41,135.00 L 181.50,128.99 L 186.95,126.31 L 192.92,125.31 L 198.81,128.43 Z",neighbors:["isl34", "isl35", "isl37", "isl38", "isl28"]},
  {id:"isl37",name:"Schwarzwoge",continent:"Krakentiefe",cx:217.2,cy:135.0,d:"M 229.43,135.00 L 226.01,141.38 L 221.04,146.71 L 213.95,145.09 L 207.16,142.32 L 206.74,135.00 L 207.46,127.90 L 213.84,124.56 L 220.96,123.53 L 224.79,129.51 Z",neighbors:["isl34", "isl35", "isl36", "isl38", "isl13"]},
  {id:"isl38",name:"Schwarzwoge_2",continent:"Krakentiefe",cx:217.2,cy:163.2,d:"M 228.93,163.25 L 226.08,169.68 L 220.07,171.99 L 214.19,172.59 L 208.41,169.66 L 206.95,163.25 L 207.15,155.93 L 213.96,153.17 L 220.97,151.75 L 225.29,157.40 Z",neighbors:["isl36", "isl37", "isl18"]}
    ],
    /* Kein Burg-/Hafen-/Stadt-System: castles, harbors und capitals
       werden bewusst NICHT definiert, damit auf dieser Karte keine
       Landbauten platziert werden (reiner Schiffskampf). */
    castles: [],
    harbors: [],
    capitals: {},
    /* 3D-Aufbau (eigenständiger Datensatz, gleiche Geometrie). */
    allTerritories: [
      {"id":"isl1","label":"Frostklinge","group":"Nordwacht","d":"M 145.57,22.00 L 144.43,28.96 L 137.73,30.88 L 131.51,32.27 L 126.81,27.84 L 125.47,22.00 L 125.49,15.20 L 131.86,12.81 L 137.72,13.15 L 143.66,15.60 Z"},
      {"id":"isl2","label":"Frostklinge_2","group":"Nordwacht","d":"M 171.18,22.00 L 170.38,27.87 L 165.77,32.65 L 159.55,30.48 L 152.76,28.94 L 151.06,22.00 L 154.46,16.30 L 158.74,11.03 L 165.76,11.37 L 169.60,16.70 Z"},
      {"id":"isl3","label":"Nordwind","group":"Nordwacht","d":"M 200.51,22.00 L 199.35,28.96 L 192.65,30.88 L 186.44,32.26 L 181.73,27.84 L 180.50,22.00 L 180.42,15.21 L 186.79,12.84 L 192.65,13.14 L 198.61,15.58 Z"},
      {"id":"isl4","label":"Eisbrecher","group":"Nordwacht","d":"M 172.09,50.25 L 169.69,55.61 L 165.75,60.83 L 158.70,61.36 L 154.97,55.58 L 150.08,50.25 L 154.36,44.48 L 158.44,38.35 L 165.49,40.47 L 171.83,43.33 Z"},
      {"id":"isl5","label":"Eisbrecher_2","group":"Nordwacht","d":"M 201.43,50.25 L 198.66,56.71 L 192.63,59.06 L 186.74,59.58 L 180.92,56.68 L 179.41,50.25 L 179.70,42.93 L 186.47,40.10 L 193.53,38.68 L 197.77,44.44 Z"},
      {"id":"isl6","label":"Nordwind_2","group":"Nordwacht","d":"M 226.97,50.25 L 224.59,55.60 L 220.64,60.74 L 213.62,61.35 L 209.91,55.57 L 204.99,50.25 L 208.67,44.03 L 213.36,38.33 L 220.41,40.46 L 226.74,43.34 Z"},
      {"id":"isl7","label":"Donnerhall","group":"Sturmkap","d":"M 310.37,22.00 L 309.38,29.09 L 302.50,30.89 L 296.27,32.30 L 291.61,27.82 L 290.33,22.00 L 290.23,15.18 L 296.63,12.83 L 302.53,13.02 L 308.44,15.59 Z"},
      {"id":"isl8","label":"Donnerhall_2","group":"Sturmkap","d":"M 336.26,22.00 L 335.31,27.98 L 330.55,32.68 L 324.31,30.52 L 317.55,28.92 L 315.92,22.00 L 319.20,16.28 L 323.52,11.05 L 330.58,11.23 L 334.40,16.68 Z"},
      {"id":"isl9","label":"Wetterbö","group":"Sturmkap","d":"M 311.23,50.25 L 308.49,56.70 L 302.44,58.96 L 296.59,59.56 L 290.79,56.66 L 289.35,50.25 L 289.56,42.94 L 296.33,40.14 L 303.38,38.67 L 307.65,44.41 Z"},
      {"id":"isl10","label":"Wetterbö_2","group":"Sturmkap","d":"M 336.83,50.25 L 334.42,55.59 L 330.49,60.75 L 323.46,61.40 L 319.76,55.56 L 314.94,50.25 L 318.53,44.04 L 323.22,38.37 L 330.26,40.44 L 336.63,43.31 Z"},
      {"id":"isl11","label":"Blitzkutter","group":"Sturmkap","d":"M 364.95,78.50 L 361.78,83.76 L 357.77,88.46 L 350.67,90.41 L 346.00,84.70 L 342.73,78.50 L 346.25,72.48 L 351.72,69.83 L 357.66,68.90 L 363.60,71.91 Z"},
      {"id":"isl12","label":"Riffbrecher","group":"Ostriff","d":"M 364.34,106.75 L 361.85,112.06 L 357.71,116.51 L 350.91,117.90 L 347.26,112.04 L 342.35,106.75 L 345.94,100.50 L 350.68,94.89 L 357.70,97.01 L 364.10,99.80 Z"},
      {"id":"isl13","label":"Brandungsbraut","group":"Ostriff","d":"M 335.92,135.00 L 335.21,140.91 L 330.81,146.48 L 324.33,143.45 L 317.47,141.98 L 315.79,135.00 L 319.88,129.77 L 323.50,123.98 L 330.54,124.33 L 334.34,129.73 Z"},
      {"id":"isl14","label":"Riffbrecher_2","group":"Ostriff","d":"M 365.26,135.00 L 364.18,142.00 L 357.69,144.70 L 351.22,145.22 L 346.44,140.88 L 345.11,135.00 L 345.83,128.68 L 351.54,125.76 L 357.43,126.11 L 363.31,128.63 Z"},
      {"id":"isl15","label":"Brandungsbraut_2","group":"Ostriff","d":"M 337.02,163.25 L 334.70,168.79 L 330.46,173.66 L 323.35,174.72 L 319.68,168.62 L 314.81,163.25 L 319.15,157.49 L 323.25,151.47 L 330.34,153.21 L 336.51,156.39 Z"},
      {"id":"isl16","label":"Salzschaluppe","group":"Ostriff","d":"M 394.45,163.25 L 390.58,169.49 L 385.59,174.30 L 378.78,173.16 L 372.13,170.42 L 371.85,163.25 L 374.69,157.94 L 378.54,152.60 L 385.62,152.10 L 389.74,157.63 Z"},
      {"id":"isl17","label":"Delfinsprung","group":"Suedstrom","d":"M 199.06,219.75 L 197.50,225.37 L 193.32,230.69 L 186.87,228.67 L 182.08,225.34 L 179.03,219.75 L 181.61,213.82 L 186.06,208.32 L 193.10,209.49 L 199.70,212.54 Z"},
      {"id":"isl18","label":"Sonnensegel","group":"Suedstrom","d":"M 228.39,219.75 L 226.47,226.47 L 220.21,228.92 L 213.76,230.44 L 208.02,226.44 L 208.36,219.75 L 207.52,212.69 L 214.09,210.08 L 219.95,211.38 L 225.63,213.65 Z"},
      {"id":"isl19","label":"Passatwind","group":"Suedstrom","d":"M 172.00,248.00 L 169.89,253.51 L 165.67,258.34 L 158.63,259.31 L 154.76,253.49 L 151.28,248.00 L 154.18,242.10 L 158.57,236.51 L 165.66,237.69 L 172.38,240.68 Z"},
      {"id":"isl20","label":"Passatwind_2","group":"Suedstrom","d":"M 201.34,248.00 L 198.86,254.61 L 192.55,256.56 L 186.67,257.53 L 180.70,254.59 L 180.60,248.00 L 180.14,241.01 L 186.61,238.29 L 192.54,239.47 L 198.33,241.78 Z"},
      {"id":"isl21","label":"Delfinsprung_2","group":"Suedstrom","d":"M 226.93,248.00 L 224.82,253.51 L 220.59,258.33 L 213.56,259.30 L 209.67,253.49 L 206.20,248.00 L 209.12,242.10 L 213.50,236.52 L 220.47,238.02 L 227.29,240.69 Z"},
      {"id":"isl22","label":"Sonnensegel_2","group":"Suedstrom","d":"M 256.27,248.00 L 253.79,254.61 L 247.48,256.57 L 241.60,257.52 L 235.64,254.57 L 235.52,248.00 L 235.03,240.98 L 241.53,238.27 L 248.51,236.24 L 253.23,241.80 Z"},
      {"id":"isl23","label":"Klippenwacht","group":"Westklippen","d":"M 64.22,106.75 L 61.64,113.42 L 55.28,115.43 L 49.33,116.38 L 43.50,113.26 L 43.40,106.75 L 42.90,99.80 L 49.27,96.92 L 56.32,94.87 L 60.34,101.02 Z"},
      {"id":"isl24","label":"Gischtreiter","group":"Westklippen","d":"M 35.45,135.00 L 34.81,142.12 L 28.05,144.39 L 21.60,145.48 L 16.74,141.00 L 13.10,135.00 L 16.26,128.65 L 22.08,126.01 L 27.97,125.86 L 34.36,128.20 Z"},
      {"id":"isl25","label":"Klippenwacht_2","group":"Westklippen","d":"M 64.79,135.00 L 60.75,141.02 L 56.09,146.17 L 49.64,143.69 L 42.69,142.10 L 42.42,135.00 L 45.25,129.76 L 48.96,124.23 L 56.01,124.08 L 60.31,129.30 Z"},
      {"id":"isl26","label":"Gischtreiter_2","group":"Westklippen","d":"M 36.55,163.25 L 34.30,170.01 L 27.78,171.79 L 21.92,172.74 L 15.93,169.84 L 15.74,163.25 L 15.35,156.24 L 21.83,153.50 L 27.77,154.74 L 33.52,157.06 Z"},
      {"id":"isl27","label":"Sturzwelle","group":"Westklippen","d":"M 62.14,163.25 L 60.24,168.90 L 55.82,173.58 L 48.80,174.52 L 44.90,168.75 L 41.33,163.25 L 44.33,157.35 L 48.72,151.72 L 55.81,152.95 L 62.50,155.96 Z"},
      {"id":"isl28","label":"Sturzwelle_2","group":"Westklippen","d":"M 89.74,191.50 L 87.42,196.95 L 83.10,201.27 L 76.29,202.69 L 72.65,196.78 L 67.84,191.50 L 71.33,185.26 L 76.08,179.68 L 83.13,181.63 L 89.51,184.54 Z"},
      {"id":"isl29","label":"Nebelgänger","group":"Nebelbucht","d":"M 63.11,50.25 L 62.54,57.57 L 55.48,59.54 L 48.66,61.94 L 44.12,56.31 L 40.43,50.25 L 43.59,43.81 L 49.57,41.36 L 55.51,40.87 L 61.71,43.53 Z"},
      {"id":"isl30","label":"Nebelgänger_2","group":"Nebelbucht","d":"M 92.44,50.25 L 88.49,56.47 L 83.52,61.33 L 76.70,60.15 L 70.07,57.41 L 69.75,50.25 L 72.58,44.91 L 76.46,39.58 L 83.55,39.09 L 87.67,44.62 Z"},
      {"id":"isl31","label":"Grauschleier","group":"Nebelbucht","d":"M 63.68,78.50 L 61.84,85.32 L 55.21,86.95 L 48.97,89.26 L 43.31,85.15 L 43.66,78.50 L 42.73,71.43 L 49.34,68.90 L 55.20,70.09 L 60.92,72.36 Z"},
      {"id":"isl32","label":"Grauschleier_2","group":"Nebelbucht","d":"M 89.27,78.50 L 87.79,84.21 L 83.25,88.73 L 77.01,87.48 L 72.28,84.05 L 69.24,78.50 L 71.71,72.54 L 76.23,67.13 L 83.24,68.30 L 89.90,71.25 Z"},
      {"id":"isl33","label":"Stillwasser","group":"Nebelbucht","d":"M 118.61,78.50 L 116.77,85.32 L 110.13,86.94 L 103.89,89.25 L 98.23,85.15 L 98.57,78.50 L 97.66,71.43 L 104.27,68.91 L 110.12,70.08 L 115.85,72.35 Z"},
      {"id":"isl34","label":"Tiefenwacht","group":"Krakentiefe","d":"M 199.24,106.75 L 197.55,112.40 L 193.34,117.75 L 186.89,115.61 L 182.03,112.37 L 178.97,106.75 L 182.22,101.27 L 186.11,95.49 L 193.19,96.22 L 199.65,99.57 Z"},
      {"id":"isl35","label":"Tiefenwacht_2","group":"Krakentiefe","d":"M 228.57,106.75 L 226.52,113.50 L 220.23,115.97 L 213.78,117.39 L 207.97,113.48 L 208.29,106.75 L 208.13,100.14 L 214.14,97.24 L 219.97,98.32 L 225.58,100.68 Z"},
      {"id":"isl36","label":"Krakentöter","group":"Krakentiefe","d":"M 200.09,135.00 L 197.04,140.28 L 193.00,144.93 L 185.91,146.88 L 181.21,141.22 L 177.41,135.00 L 181.50,128.99 L 186.95,126.31 L 192.92,125.31 L 198.81,128.43 Z"},
      {"id":"isl37","label":"Schwarzwoge","group":"Krakentiefe","d":"M 229.43,135.00 L 226.01,141.38 L 221.04,146.71 L 213.95,145.09 L 207.16,142.32 L 206.74,135.00 L 207.46,127.90 L 213.84,124.56 L 220.96,123.53 L 224.79,129.51 Z"},
      {"id":"isl38","label":"Schwarzwoge_2","group":"Krakentiefe","d":"M 228.93,163.25 L 226.08,169.68 L 220.07,171.99 L 214.19,172.59 L 208.41,169.66 L 206.95,163.25 L 207.15,155.93 L 213.96,153.17 L 220.97,151.75 L 225.29,157.40 Z"}
    ],
    map3dRegions: {
      Nordwacht: { color: 0x6da3c4, height: 2.0, terrain: "ice", houseId: null, bonus: 4, displayName: "Eisflotte" },
      Sturmkap: { color: 0x4a5878, height: 2.2, terrain: "storm", houseId: null, bonus: 3, displayName: "Sturmflotte" },
      Ostriff: { color: 0xc8807a, height: 1.8, terrain: "reef", houseId: null, bonus: 4, displayName: "Korallenflotte" },
      Suedstrom: { color: 0xe0c070, height: 1.7, terrain: "atoll", houseId: null, bonus: 4, displayName: "Passatflotte" },
      Westklippen: { color: 0x828a94, height: 2.4, terrain: "cliffs", houseId: null, bonus: 3, displayName: "Klippenflotte" },
      Nebelbucht: { color: 0x9aa0b0, height: 2.0, terrain: "mist", houseId: null, bonus: 3, displayName: "Nebelflotte" },
      Krakentiefe: { color: 0x3a4a66, height: 1.6, terrain: "storm", houseId: null, bonus: 5, displayName: "Krakenflotte" }
    },
    houses: {
      valen: { name: "Haus Valen", color: 0x8b2a26 },
      mordrek: { name: "Haus Mordrek", color: 0xb08530 },
      dravik: { name: "Haus Dravik", color: 0x4a4a4a },
      aerlund: { name: "Haus Aerlund", color: 0x4d88c4 },
      sylverin: { name: "Haus Sylverin", color: 0x57a24f },
      kael: { name: "Haus Kael", color: 0x6a4178 },
      vorthan: { name: "Haus Vorthan", color: 0xc87530 }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
