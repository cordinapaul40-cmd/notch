// ============================================================
//  NOTCH · Programme et exercices
//  C'est ce fichier qu'on modifie pour changer le programme.
// ============================================================

// Pas de progression de charge selon le type de matériel (en kg)
const STEP = { barre: 2.5, haltere: 2, machine: 2.5, poulie: 1, pdc: 0 };

// Noms affichés des zones musculaires
const MUSCLES = {
  pecs: "Pectoraux", deltsF: "Épaules (avant et milieu)", deltsR: "Épaules (arrière)",
  biceps: "Biceps", triceps: "Triceps", forearms: "Avant-bras", abs: "Abdominaux",
  obliques: "Obliques", quads: "Quadriceps", hamstrings: "Ischio-jambiers", glutes: "Fessiers",
  calves: "Mollets", traps: "Trapèzes", lats: "Grand dorsal", midback: "Milieu du dos", lowerback: "Bas du dos"
};

// Bibliothèque d'exercices
// t : type de matériel · p : muscles principaux · s : muscles secondaires
// st : le geste, étape par étape · q : recherche pour la démo vidéo
const LIB = {
  dc: { n: "Développé couché", t: "barre", p: ["pecs"], s: ["deltsF", "triceps"], q: "développé couché barre technique",
    st: ["Yeux sous la barre, pieds à plat, omoplates serrées et basses.", "Descends la barre au bas des pecs, coudes à 45° du corps.", "Pousse en expirant, fesses et épaules collées au banc."] },
  tvl: { n: "Tirage vertical large", t: "machine", p: ["lats"], s: ["biceps", "deltsR", "forearms"], q: "lat pulldown prise large technique",
    st: ["Cuisses bloquées, buste légèrement penché en arrière.", "Descends d’abord les épaules, puis amène les coudes vers les poches.", "Remonte lentement jusqu’aux bras tendus."] },
  mil: { n: "Développé militaire", t: "haltere", p: ["deltsF"], s: ["triceps", "traps"], q: "développé militaire haltères assis technique",
    st: ["Dos collé au dossier presque vertical, abdos gainés.", "Haltères à hauteur des oreilles, pousse au-dessus de la tête.", "Ne cambre pas ; redescends à hauteur du menton."] },
  dsr: { n: "Divergent seated row", t: "machine", p: ["midback", "lats"], s: ["deltsR", "biceps"], q: "seated row machine technique",
    st: ["Poitrine collée au support, dos droit.", "Tire en serrant les omoplates, coudes le long du corps.", "Tiens 1 seconde, relâche en contrôle."] },
  el: { n: "Élévations latérales", t: "poulie", p: ["deltsF", "deltsR"], s: ["traps"], q: "élévation latérale poulie technique",
    st: ["Poulie basse, câble devant le corps, un bras à la fois.", "Monte jusqu’à hauteur d’épaule en menant avec le coude.", "Ne hausse pas les épaules ; redescends lentement."] },
  curl: { n: "Curl biceps assis", t: "haltere", p: ["biceps"], s: ["forearms"], q: "curl biceps haltères assis technique",
    st: ["Dos collé au banc, coudes fixes le long du corps.", "Monte en tournant la paume vers le haut, sans balancer.", "Redescends en 2 à 3 secondes."] },
  tri: { n: "Extension triceps corde", t: "poulie", p: ["triceps"], s: [], q: "extension triceps poulie corde technique",
    st: ["Coudes collés au corps, face à la poulie haute.", "Pousse vers le bas et écarte les bouts de la corde.", "Remonte en contrôle jusqu’à 90°."] },
  presse: { n: "Presse à cuisses", t: "machine", p: ["quads", "glutes"], s: ["hamstrings"], q: "presse à cuisses technique",
    st: ["Dos et fesses collés, pieds à largeur d’épaules.", "Descends à 90° aux genoux sans décoller le bas du dos.", "Pousse dans les talons, genoux dans l’axe, sans les verrouiller."] },
  lext: { n: "Leg extension", t: "machine", p: ["quads"], s: [], q: "leg extension technique",
    st: ["Dos collé, genoux alignés avec l’axe de la machine.", "Tends complètement et contracte 1 seconde.", "Redescends sans laisser claquer les poids."] },
  lcurl: { n: "Leg curl", t: "machine", p: ["hamstrings"], s: ["calves"], q: "leg curl machine technique",
    st: ["Genoux alignés avec l’axe, hanches plaquées.", "Fléchis au maximum et tiens 1 seconde.", "Redescends lentement."] },
  mol: { n: "Mollets", t: "machine", p: ["calves"], s: [], q: "mollets machine technique",
    st: ["Pointe des pieds au bord de la plateforme.", "Descends les talons au maximum pour étirer.", "Monte le plus haut possible, 1 seconde en haut, sans rebond."] },
  crunch: { n: "Crunch lesté", t: "haltere", p: ["abs"], s: ["obliques"], q: "crunch banc décliné lesté technique",
    st: ["Pieds bloqués sur le banc décliné, poids contre la poitrine.", "Enroule le buste sans tirer sur la nuque.", "Redescends lentement sans reposer le dos."] },
  incl: { n: "Développé incliné haltères", t: "haltere", p: ["pecs"], s: ["deltsF", "triceps"], q: "développé incliné haltères technique",
    st: ["Banc à 30° environ, omoplates serrées.", "Pousse en rapprochant légèrement les haltères.", "Redescends en 2 à 3 secondes jusqu’à l’étirement."] },
  tvs: { n: "Tirage vertical serré", t: "machine", p: ["lats"], s: ["biceps", "midback"], q: "tirage vertical prise serrée triangle technique",
    st: ["Poignée triangle, épaules basses.", "Tire vers le bas de la poitrine, coudes le long du corps.", "Remonte lentement jusqu’aux bras tendus."] },
  ecart: { n: "Écarté couché", t: "haltere", p: ["pecs"], s: ["deltsF"], q: "écarté couché haltères technique",
    st: ["Coudes légèrement fléchis et bloqués.", "Ouvre en arc de cercle, pas plus bas que le banc.", "Remonte comme si tu enlaçais un tronc d’arbre."] },
  thp: { n: "Tirage horizontal poulie", t: "machine", p: ["midback", "lats"], s: ["biceps", "deltsR"], q: "tirage horizontal poulie basse technique",
    st: ["Pieds sur le plateau, dos droit, genoux fléchis.", "Tire vers le nombril en serrant les omoplates.", "Le buste reste fixe ; relâche en contrôle."] },
  fp: { n: "Face pull", t: "poulie", p: ["deltsR", "traps"], s: ["midback"], q: "face pull corde technique",
    st: ["Poulie à hauteur du visage, corde.", "Tire vers le front en écartant les mains, coudes hauts.", "Finis en « double biceps », tiens 1 seconde."] },
  mart: { n: "Curl marteau", t: "haltere", p: ["biceps", "forearms"], s: [], q: "curl marteau technique",
    st: ["Paumes face à face, pouces vers le haut.", "Coudes fixes, monte sans élan.", "Redescends en 2 à 3 secondes."] },
  sdt: { n: "Soulevé de terre jambes tendues", t: "barre", p: ["hamstrings", "glutes"], s: ["lowerback"], q: "soulevé de terre roumain technique débutant",
    st: ["Barre devant les cuisses, genoux légèrement fléchis.", "Pousse les fesses en arrière, dos droit, barre qui glisse le long des cuisses.", "Remonte en serrant les fesses. Dos qui s’arrondit = trop lourd."] },
  presseh: { n: "Presse pieds hauts", t: "machine", p: ["glutes", "hamstrings"], s: ["quads"], q: "presse à cuisses pieds hauts fessiers",
    st: ["Pieds en haut de la plateforme.", "Descends talons collés : tu sens les fessiers.", "Pousse avec les talons, sans verrouiller."] },
  rel: { n: "Relevés de jambes", t: "pdc", p: ["abs"], s: ["obliques"], q: "relevés de jambes allongé technique",
    st: ["Allongé, mains sous les fesses, bas du dos plaqué.", "Monte les jambes sans élan.", "Redescends lentement sans cambrer."] }
};

// ---------- Variantes (même zone travaillée, autre machine ou autre outil) ----------
Object.assign(LIB, {
  dch: { n: "Développé couché haltères", t: "haltere", p: ["pecs"], s: ["deltsF", "triceps"], q: "développé couché haltères technique",
    st: ["Haltères au-dessus de la poitrine, omoplates serrées.", "Descends en ouvrant légèrement les coudes jusqu’à l’étirement.", "Pousse en rapprochant les haltères, sans les cogner."] },
  chestpress: { n: "Chest press machine", t: "machine", p: ["pecs"], s: ["deltsF", "triceps"], q: "chest press machine technique",
    st: ["Poignées à hauteur du milieu des pecs, dos collé.", "Pousse sans verrouiller les coudes.", "Reviens lentement jusqu’à sentir l’étirement."] },
  pompes: { n: "Pompes", t: "pdc", p: ["pecs"], s: ["deltsF", "triceps", "abs"], q: "pompes technique",
    st: ["Mains un peu plus larges que les épaules, corps gainé en planche.", "Descends la poitrine près du sol, coudes à 45°.", "Pousse sans creuser le bas du dos."] },
  tracass: { n: "Tractions assistées", t: "machine", p: ["lats"], s: ["biceps", "midback"], q: "traction assistée machine technique",
    st: ["Genoux sur le support, mains plus larges que les épaules.", "Monte en tirant les coudes vers les hanches, menton au-dessus de la barre.", "Redescends lentement bras tendus. Plus de poids = plus d’aide."] },
  tvn: { n: "Tirage vertical prise neutre", t: "machine", p: ["lats"], s: ["biceps", "midback"], q: "tirage vertical prise neutre technique",
    st: ["Poignées parallèles, épaules basses.", "Tire vers le haut de la poitrine, coudes vers le bas.", "Remonte lentement jusqu’aux bras tendus."] },
  pullover: { n: "Pull-over poulie", t: "poulie", p: ["lats"], s: ["triceps"], q: "pull over poulie haute technique",
    st: ["Debout face à la poulie haute, bras tendus, buste penché.", "Descends la barre jusqu’aux cuisses en gardant les bras tendus.", "Remonte lentement jusqu’à l’étirement du dos."] },
  shpress: { n: "Shoulder press machine", t: "machine", p: ["deltsF"], s: ["triceps"], q: "shoulder press machine technique",
    st: ["Poignées à hauteur des épaules, dos collé.", "Pousse vers le haut sans verrouiller.", "Redescends à hauteur du menton."] },
  arnold: { n: "Arnold press", t: "haltere", p: ["deltsF"], s: ["triceps"], q: "arnold press technique",
    st: ["Assis, haltères devant le visage, paumes vers toi.", "Pousse en tournant les paumes vers l’avant.", "Redescends en refaisant la rotation inverse."] },
  rowh: { n: "Rowing haltère un bras", t: "haltere", p: ["midback", "lats"], s: ["biceps", "deltsR"], q: "rowing haltère un bras technique",
    st: ["Un genou et une main sur le banc, dos plat.", "Tire l’haltère vers la hanche, coude près du corps.", "Redescends lentement bras tendu."] },
  elh: { n: "Élévations latérales haltères", t: "haltere", p: ["deltsF", "deltsR"], s: ["traps"], q: "élévations latérales haltères technique",
    st: ["Debout, haltères le long du corps, buste légèrement penché.", "Monte sur les côtés jusqu’aux épaules, coudes un peu fléchis.", "Redescends lentement, sans élan."] },
  elm: { n: "Élévations latérales machine", t: "machine", p: ["deltsF", "deltsR"], s: ["traps"], q: "lateral raise machine technique",
    st: ["Coudes contre les coussins, épaules basses.", "Monte jusqu’à l’horizontale.", "Redescends en contrôle."] },
  curlez: { n: "Curl barre EZ", t: "barre", p: ["biceps"], s: ["forearms"], q: "curl barre ez technique",
    st: ["Debout, barre EZ en supination, coudes au corps.", "Monte sans balancer le buste.", "Redescends en 2 à 3 secondes."] },
  curlpup: { n: "Curl pupitre machine", t: "machine", p: ["biceps"], s: ["forearms"], q: "curl pupitre machine technique",
    st: ["Bras posés sur le pupitre, coudes alignés avec l’axe.", "Monte en contractant le biceps.", "Redescends jusqu’aux bras presque tendus."] },
  curlpoul: { n: "Curl poulie basse", t: "poulie", p: ["biceps"], s: ["forearms"], q: "curl poulie basse technique",
    st: ["Face à la poulie basse, barre droite, coudes au corps.", "Monte sans bouger les coudes.", "Redescends en gardant la tension."] },
  barfront: { n: "Barre au front", t: "barre", p: ["triceps"], s: [], q: "barre au front ez technique",
    st: ["Allongé, barre EZ au-dessus du visage, bras verticaux.", "Plie les coudes pour descendre la barre vers le front.", "Tends les bras sans écarter les coudes."] },
  tribar: { n: "Extension triceps barre", t: "poulie", p: ["triceps"], s: [], q: "extension triceps poulie barre droite technique",
    st: ["Barre droite à la poulie haute, coudes collés.", "Pousse jusqu’aux bras tendus.", "Remonte jusqu’à 90° sans décoller les coudes."] },
  dipsm: { n: "Dips machine", t: "machine", p: ["triceps"], s: ["pecs"], q: "dips machine assistée technique",
    st: ["Poignées le long du corps, buste droit.", "Pousse vers le bas jusqu’aux bras tendus.", "Remonte lentement jusqu’à 90°."] },
  hack: { n: "Hack squat", t: "machine", p: ["quads", "glutes"], s: ["hamstrings"], q: "hack squat machine technique",
    st: ["Dos collé au dossier, pieds à largeur d’épaules.", "Descends jusqu’à 90° ou plus bas si ton dos reste collé.", "Pousse dans les talons sans verrouiller."] },
  goblet: { n: "Squat goblet", t: "haltere", p: ["quads", "glutes"], s: ["abs"], q: "goblet squat technique",
    st: ["Haltère tenu contre la poitrine, pieds un peu plus larges que les épaules.", "Descends entre les talons, dos droit, genoux vers l’extérieur.", "Remonte en poussant dans les talons."] },
  smith: { n: "Squat à la Smith machine", t: "barre", p: ["quads", "glutes"], s: ["hamstrings"], q: "squat smith machine technique",
    st: ["Barre sur le haut du dos, pieds légèrement devant toi.", "Descends cuisses parallèles au sol, dos droit.", "Remonte en poussant dans les talons."] },
  fentes: { n: "Fentes haltères", t: "haltere", p: ["quads", "glutes"], s: ["hamstrings"], q: "fentes haltères technique",
    st: ["Un grand pas en avant, buste droit.", "Descends le genou arrière près du sol.", "Remonte en poussant dans le talon avant, puis change de jambe."] },
  lcurla: { n: "Leg curl allongé", t: "machine", p: ["hamstrings"], s: ["calves"], q: "leg curl allongé technique",
    st: ["Allongé, genoux juste après le bord du banc.", "Ramène les talons vers les fesses, hanches plaquées.", "Redescends lentement."] },
  sdth: { n: "Soulevé jambes tendues haltères", t: "haltere", p: ["hamstrings", "glutes"], s: ["lowerback"], q: "soulevé de terre jambes tendues haltères technique",
    st: ["Haltères devant les cuisses, genoux légèrement fléchis.", "Pousse les fesses en arrière, dos droit.", "Remonte en serrant les fesses."] },
  hipthrust: { n: "Hip thrust", t: "barre", p: ["glutes"], s: ["hamstrings"], q: "hip thrust technique",
    st: ["Haut du dos contre le banc, barre sur les hanches avec un coussin.", "Pousse les hanches vers le haut jusqu’à l’alignement épaules-genoux.", "Serre les fesses 1 seconde en haut, redescends en contrôle."] },
  molassis: { n: "Mollets assis", t: "machine", p: ["calves"], s: [], q: "mollets assis machine technique",
    st: ["Assis, coussin sur le bas des cuisses, pointe des pieds sur la marche.", "Descends les talons au maximum.", "Monte le plus haut possible, 1 seconde en haut."] },
  molpresse: { n: "Mollets à la presse", t: "machine", p: ["calves"], s: [], q: "mollets presse à cuisses technique",
    st: ["Pointe des pieds en bas de la plateforme, jambes presque tendues.", "Laisse descendre la plateforme pour étirer.", "Pousse avec la pointe des pieds le plus loin possible."] },
  crunchm: { n: "Crunch machine", t: "machine", p: ["abs"], s: ["obliques"], q: "crunch machine abdos technique",
    st: ["Poignées en main, dos contre le dossier.", "Enroule le buste vers les cuisses.", "Reviens lentement sans relâcher la tension."] },
  crunchp: { n: "Crunch à la poulie", t: "poulie", p: ["abs"], s: ["obliques"], q: "crunch poulie haute à genoux technique",
    st: ["À genoux face à la poulie haute, corde derrière la nuque.", "Enroule le buste vers le sol, hanches fixes.", "Remonte lentement."] },
  inclm: { n: "Développé incliné Smith", t: "barre", p: ["pecs"], s: ["deltsF", "triceps"], q: "développé incliné smith machine technique",
    st: ["Banc à 30° sous la barre, omoplates serrées.", "Descends la barre au haut des pecs.", "Pousse sans décoller les épaules."] },
  inclb: { n: "Développé incliné barre", t: "barre", p: ["pecs"], s: ["deltsF", "triceps"], q: "développé incliné barre technique",
    st: ["Banc à 30°, mains un peu plus larges que les épaules.", "Descends au haut des pecs, coudes à 45°.", "Pousse en expirant."] },
  pecdeck: { n: "Pec deck", t: "machine", p: ["pecs"], s: ["deltsF"], q: "pec deck technique",
    st: ["Poignées à hauteur des épaules, dos collé.", "Ramène les bras devant toi en serrant les pecs.", "Reviens lentement jusqu’à l’étirement."] },
  ecpoul: { n: "Écarté poulies vis-à-vis", t: "poulie", p: ["pecs"], s: ["deltsF"], q: "écarté poulie vis à vis technique",
    st: ["Entre les deux poulies, un pied devant, buste légèrement penché.", "Ramène les mains devant toi en arc de cercle.", "Reviens lentement, coudes légèrement fléchis."] },
  oiseau: { n: "Oiseau haltères", t: "haltere", p: ["deltsR"], s: ["midback", "traps"], q: "oiseau haltères technique",
    st: ["Buste penché à 45°, dos plat, haltères sous la poitrine.", "Ouvre les bras sur les côtés, coudes légèrement fléchis.", "Redescends lentement."] },
  revpec: { n: "Reverse pec deck", t: "machine", p: ["deltsR"], s: ["midback", "traps"], q: "reverse pec deck technique",
    st: ["Face au dossier, poignées devant toi.", "Ouvre les bras en arrière, épaules basses.", "Reviens en contrôle."] },
  martc: { n: "Curl marteau corde", t: "poulie", p: ["biceps", "forearms"], s: [], q: "curl marteau corde poulie technique",
    st: ["Corde à la poulie basse, pouces vers le haut.", "Monte en gardant les coudes au corps.", "Redescends lentement."] },
  relchaise: { n: "Relevés de genoux chaise romaine", t: "pdc", p: ["abs"], s: ["obliques"], q: "relevé de genoux chaise romaine technique",
    st: ["Avant-bras sur les appuis, dos contre le dossier.", "Monte les genoux vers la poitrine en enroulant le bassin.", "Redescends lentement sans balancer."] },
  crunchinv: { n: "Crunch inversé", t: "pdc", p: ["abs"], s: ["obliques"], q: "crunch inversé technique",
    st: ["Allongé, jambes pliées à 90°, mains au sol.", "Décolle les fesses en ramenant les genoux vers la poitrine.", "Redescends lentement."] }
});

// Pour chaque exercice du programme, les variantes que tu peux mettre à la place
const ALT = {
  dc: ["dch", "chestpress", "pompes"], tvl: ["tracass", "tvn", "pullover"], mil: ["shpress", "arnold"],
  dsr: ["rowh", "thp"], el: ["elh", "elm"], curl: ["curlez", "curlpup", "curlpoul"], tri: ["tribar", "barfront", "dipsm"],
  presse: ["hack", "goblet", "smith"], lext: ["fentes", "goblet"], lcurl: ["lcurla", "sdth"], mol: ["molassis", "molpresse"],
  crunch: ["crunchm", "crunchp"], incl: ["inclm", "inclb", "dch"], tvs: ["tvn", "tracass"], ecart: ["pecdeck", "ecpoul"],
  thp: ["dsr", "rowh"], fp: ["revpec", "oiseau"], mart: ["martc", "curlez"], sdt: ["sdth", "hipthrust"],
  presseh: ["hipthrust", "fentes"], rel: ["relchaise", "crunchinv"]
};

// Une ligne = un exercice : clé, séries, reps mini, reps maxi, repos (s), charge de départ (texte), charge de départ (nombre)
const E = (k, sets, lo, hi, rest, load, w0) => ({ k, sets, lo, hi, rest, load, w0 });

const DAYS = [
  { id: "haut-a", tab: "Haut A", day: "Lundi", wd: 1, title: "Haut du corps A", tag: "Force", cardio: "15 à 20 min de tapis incliné à 3 km/h",
    ex: [E("dc", 3, 6, 8, 120, "50 kg, barre comprise", 50), E("tvl", 3, 8, 10, 120, "69 kg", 69), E("mil", 3, 8, 10, 120, "12 à 14 kg par haltère", 12),
         E("dsr", 3, 8, 10, 120, "66 kg", 66), E("el", 3, 12, 15, 90, "4,5 kg", 4.5), E("curl", 2, 10, 12, 90, "14 à 16 kg par haltère", 14), E("tri", 2, 10, 12, 90, "13 kg", 13)] },
  { id: "bas-a", tab: "Bas A", day: "Mardi", wd: 2, title: "Bas du corps A", tag: "Presse", cardio: "Pas de tapis : la séance jambes suffit",
    ex: [E("presse", 4, 8, 10, 120, "116 kg", 116), E("lext", 3, 10, 12, 90, "70 kg", 70), E("lcurl", 3, 10, 12, 90, "54 kg", 54), E("mol", 4, 12, 15, 60, "À trouver", null), E("crunch", 3, 12, 15, 60, "10 kg", 10)] },
  { id: "haut-b", tab: "Haut B", day: "Jeudi", wd: 4, title: "Haut du corps B", tag: "Volume", cardio: "15 à 20 min de tapis incliné à 3 km/h",
    ex: [E("incl", 3, 8, 10, 120, "16 à 18 kg par haltère", 16), E("tvs", 3, 10, 12, 120, "≈ 60 kg", 60), E("ecart", 3, 12, 15, 90, "12 kg par haltère", 12),
         E("thp", 3, 10, 12, 90, "Ta charge habituelle", null), E("fp", 3, 12, 15, 90, "Léger", null), E("el", 2, 12, 15, 60, "4,5 kg", 4.5), E("mart", 2, 10, 12, 90, "14 kg par haltère", 14)] },
  { id: "bas-b", tab: "Bas B", day: "Vendredi", wd: 5, title: "Bas du corps B", tag: "Chaîne arrière", cardio: "Pas de tapis : la séance jambes suffit",
    ex: [E("sdt", 3, 8, 10, 120, "Barre seule, puis +5 kg par séance", 20), E("lcurl", 3, 10, 12, 90, "54 kg", 54), E("presseh", 3, 12, 15, 90, "90 à 100 kg", 90),
         E("lext", 2, 12, 15, 90, "60 à 70 kg", 60), E("mol", 4, 12, 15, 60, "Même charge que mardi", null), E("rel", 3, 12, 15, 60, "Poids du corps", 0)] }
];
