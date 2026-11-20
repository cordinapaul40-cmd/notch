# Notch

**Monte d'un cran.** L'appli de musculation de Paul : programme haut / bas du corps sur 4 séances, séance guidée série par série, variantes d'exercices, minuteur de récupération, coach automatique, courbes de progrès, suivi de la sèche et widgets Android.

## Installer ou mettre à jour l'appli

1. Sur ton téléphone, ouvre la page **Releases** du dépôt (colonne de droite sur GitHub) et prends la dernière version.
2. Touche le fichier **Notch-vN.apk** pour le télécharger, puis ouvre-le pour l'installer.
3. Chaque envoi sur GitHub construit automatiquement une nouvelle version. Si la construction échoue, une « issue » est créée avec l'erreur.

Tes données restent sur le téléphone lors des mises à jour.

## Widgets et raccourcis

- **Prochaine séance** : la séance du jour, tes séances de la semaine et un bouton pour commencer directement.
- **Le coach** : le prochain cran à franchir, ou l'exercice qui stagne.
- **Muscles de la semaine** : la silhouette se colore selon les muscles travaillés, avec le muscle à travailler.

## Notifications

- **Récupération** et **C'est reparti** : quand tu quittes l'appli pendant une récup.
- **Rappel de séance** (17 h 30 par défaut) : les jours d'entraînement, si la séance n'est pas faite.
- **Bilan du dimanche** (19 h) : séances de la semaine, records, muscle à travailler.

Tout se règle dans Réglages (roue dentée sur l'accueil), avec aussi « Réduire la transparence » et le bip de fin de récup.

## Connexions

- **Écran verrouillé** : pendant une séance, la série ou la récup en cours s'affiche dans les notifications et sur l'écran verrouillé, avec ses boutons (**Série validée**, **+15 s**, **Passer**, **C'est parti**). Plus besoin de déverrouiller entre deux séries.
- **Mini-lecteur** (Réglages → Musique) : pause et morceau suivant sur les écrans de série et de récup. Il pilote le lecteur en cours (Spotify, Deezer, YouTube Music…), sans abonnement particulier. Android demande d'autoriser « l'accès aux notifications » ; si l'interrupteur est grisé : infos de l'appli Notch → ⋮ → *Autoriser les paramètres restreints*. Tu peux aussi coller un lien de playlist par séance.
- **Agenda** (Réglages → Agenda) : choisis l'heure de tes séances. Notch lit ton agenda : si une séance tombe pendant un cours ou un rendez-vous, l'accueil te propose deux créneaux libres et décale la séance d'un appui. En option, tes séances sont ajoutées à ton agenda et suivent les décalages.
- **Arrivée à la salle** (Réglages → Arrivée à la salle) : enregistre l'endroit une fois sur place. Quand tu restes 2 minutes au Basic-Fit un jour de séance, une notification propose de la lancer et d'ouvrir l'appli Basic-Fit (QR code d'entrée). Il faut autoriser la position « Toujours ».

## Les crans

Dans Progrès : ton niveau (un cran de plus avec tes séances, le premier en une semaine) et 14 badges qui récompensent la régularité et les progrès (semaines complètes, records, stagnation cassée, kilos perdus). Les nouveautés s'affichent dans le bilan de séance.

## Gestes

- Glisser à gauche / droite pendant la séance : exercice suivant / précédent.
- Tirer la barre du haut vers le bas : fermer la séance (elle reste en mémoire).
- Les panneaux (variantes, réglages) se ferment en les tirant vers le bas.
- Appui long sur l'icône Notch : *Séance du jour*, *Noter mon poids*, *Mes progrès*.

## Pendant une séance

- Chaque exercice commence par un écran qui montre les muscles travaillés et le geste en 3 points. Le bouton **Remplacer par une variante** propose 2 ou 3 exercices qui travaillent les mêmes muscles, pour la séance ou pour toujours.
- Une série à la fois : charge et répétitions reprises de la dernière fois, ajustables avec − et +.
- **Tes réglages** : une note par exercice (siège, dossier, pieds…), rappelée avant chaque série.
- **Échauffement** : avant le premier exercice chargé, 2 séries légères (50 % × 10, 75 % × 5).
- **Disques** : pour les exercices à la barre, ce qu'il faut mettre de chaque côté (barre de 20 kg, ou 10 kg pour la barre EZ).
- Récupération en plein écran. Les 10 dernières secondes passent en rouge, le téléphone vibre chaque seconde et bipe sur les 3 dernières.
- Si tu verrouilles le téléphone ou quittes l'appli, le compte à rebours continue dans les notifications et une alerte te prévient à la fin.

## Tes données

Tout est enregistré **uniquement sur le téléphone**. Sur l'accueil, **Exporter** enregistre un fichier de sauvegarde : fais-le chaque semaine. C'est aussi le fichier à envoyer à Claude pour un bilan.

## Organisation du code

| Dossier / fichier | Contenu |
|---|---|
| `docs/data.js` | Le programme : exercices, variantes, séries, répétitions, repos, charges de départ |
| `docs/app.js` | Le fonctionnement des écrans |
| `docs/connect.js` | Écran verrouillé, musique, agenda, arrivée à la salle, crans |
| `docs/styles.css` | Couleurs, polices, animations |
| `app/src/main/java/app/notch/` | La partie Android : écran principal, minuteur (`Rest.kt`), séance sur l'écran verrouillé (`Live.kt`), musique (`Music.kt`), agenda (`Cal.kt`), salle (`Gym.kt`), widgets (`Widgets.kt`) |
| `.github/workflows/build.yml` | La construction automatique de l'APK |

Le dossier `docs/` est aussi une version web de Notch : dans les réglages GitHub, *Pages* → branche `main`, dossier `/docs`. Après une modification de `docs/`, augmente `VERSION` dans `docs/sw.js` pour la version web.

## Identité

- Bleu Notch `#2F5FE8` (sombre : `#4C7DFF`), fond `#F4F5F7`, texte `#0B0C0E`
- Vert `#12804F` pour la progression, ambre `#8A5A00` pour la stagnation, rouge `#E5322D` réservé aux 10 dernières secondes de récup
- Titres et chiffres en Archivo Expanded, texte en Inter
