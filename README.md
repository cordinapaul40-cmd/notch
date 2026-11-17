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

## Gestes

- Glisser à gauche / droite pendant la séance : exercice suivant / précédent.
- Tirer la barre du haut vers le bas : fermer la séance (elle reste en mémoire).
- Les panneaux (variantes, réglages) se ferment en les tirant vers le bas.
- Appui long sur l'icône Notch : *Séance du jour*, *Noter mon poids*, *Mes progrès*.

## Pendant une séance

- Chaque exercice commence par un écran qui montre les muscles travaillés et le geste en 3 points. Le bouton **Remplacer par une variante** propose 2 ou 3 exercices qui travaillent les mêmes muscles, pour la séance ou pour toujours.
- Une série à la fois : charge et répétitions reprises de la dernière fois, ajustables avec − et +.
- Récupération en plein écran. Les 10 dernières secondes passent en rouge, le téléphone vibre chaque seconde et bipe sur les 3 dernières.
- Si tu verrouilles le téléphone ou quittes l'appli, le compte à rebours continue dans les notifications et une alerte te prévient à la fin.

## Tes données

Tout est enregistré **uniquement sur le téléphone**. Sur l'accueil, **Exporter** enregistre un fichier de sauvegarde : fais-le chaque semaine. C'est aussi le fichier à envoyer à Claude pour un bilan.

## Organisation du code

| Dossier / fichier | Contenu |
|---|---|
| `docs/data.js` | Le programme : exercices, variantes, séries, répétitions, repos, charges de départ |
| `docs/app.js` | Le fonctionnement des écrans |
| `docs/styles.css` | Couleurs, polices, animations |
| `app/src/main/java/app/notch/` | La partie Android : écran principal, minuteur et notifications (`Rest.kt`), widgets (`Widgets.kt`) |
| `.github/workflows/build.yml` | La construction automatique de l'APK |

Le dossier `docs/` est aussi une version web de Notch : dans les réglages GitHub, *Pages* → branche `main`, dossier `/docs`. Après une modification de `docs/`, augmente `VERSION` dans `docs/sw.js` pour la version web.

## Identité

- Bleu Notch `#2F5FE8` (sombre : `#4C7DFF`), fond `#F4F5F7`, texte `#0B0C0E`
- Vert `#12804F` pour la progression, ambre `#8A5A00` pour la stagnation, rouge `#E5322D` réservé aux 10 dernières secondes de récup
- Titres et chiffres en Archivo Expanded, texte en Inter
