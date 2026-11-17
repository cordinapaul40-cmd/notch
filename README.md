# Notch

**Monte d'un cran.** L'appli de musculation de Paul : programme haut / bas du corps sur 4 séances, séance guidée série par série, minuteur de récupération, coach automatique, courbes de progrès et suivi de la sèche.

## Installer l'appli sur Android

1. Ouvre **https://cordinapaul40-cmd.github.io/notch/** dans Chrome.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Notch apparaît avec son icône et s'ouvre en plein écran, même sans réseau à la salle.

## Pendant une séance

- Chaque exercice commence par un écran qui montre les muscles travaillés et le geste en 3 points.
- Une série à la fois : la charge et les répétitions sont reprises de la dernière fois, tu ajustes avec − et +.
- « Série validée » lance la récup en plein écran. Les 10 dernières secondes passent en rouge et le téléphone vibre à chaque seconde.
- L'écran reste allumé pendant la séance. Ne verrouille pas le téléphone pendant la récup : le minuteur ne pourrait pas te prévenir.

## Tes données

Tout est enregistré **uniquement sur le téléphone**. Rien n'est envoyé sur GitHub ni ailleurs.
Sur l'accueil, **Exporter** télécharge un fichier de sauvegarde. Fais-le chaque semaine : c'est ta sauvegarde si tu changes de téléphone (bouton **Importer**), et c'est le fichier à envoyer à Claude pour un bilan.

## Modifier l'appli

| Fichier | Contenu |
|---|---|
| `data.js` | Le programme : exercices, séries, répétitions, repos, charges de départ |
| `app.js` | Le fonctionnement de l'appli |
| `styles.css` | Les couleurs, polices et animations |
| `sw.js` | Le fonctionnement hors ligne |

Après chaque modification, **augmente le numéro de `VERSION` dans `sw.js`** (`notch-v1` → `notch-v2`…) pour que le téléphone récupère la nouvelle version. Ferme puis rouvre l'appli deux fois pour la voir.

## Identité

- Bleu Notch `#2F5FE8` (sombre : `#4C7DFF`), fond `#F4F5F7`, texte `#0B0C0E`
- Vert `#12804F` pour la progression, ambre `#8A5A00` pour la stagnation, rouge `#E5322D` réservé aux 10 dernières secondes de récup
- Titres et chiffres en Archivo Expanded, texte en Inter
