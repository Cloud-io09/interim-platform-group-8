# Logo Intérimatch

Marque retenue : **les deux côtés** — deux crochets qui se font face, l'intérimaire et
l'entreprise, l'espace laissé entre eux étant la mise en relation.

## Fichiers

| Fichier | Usage |
| --- | --- |
| `interimatch-logo.svg` | Pavé principal, sur fond clair. Référence. |
| `interimatch-logo-inverse.svg` | Pavé clair, à poser sur un fond encre. |
| `interimatch-logo-une-encre.svg` | Une seule encre, pavé plein (tampon, gravure, fax). |
| `interimatch-logo-une-encre-noir.svg` | Crochets seuls en noir, sans pavé (marquage, pochoir). |
| `interimatch-signature.svg` | Pavé + nom, horizontal. En-tête, courrier, signature de mail. |
| `interimatch-signature-fond-sombre.svg` | Idem sur fond encre. |
| `interimatch-logo-1024.png` / `-512.png` | Réseaux sociaux, présentations, exports. |
| `interimatch-logo-inverse-512.png` | Même usage, sur fond sombre. |
| `interimatch-favicon-180.png` | Icône iOS / apple-touch-icon. |
| `interimatch-favicon-64.png` / `-32.png` | Favicon du site. |

Les SVG sont la source : ils sont vectoriels, sans dépendance, et se recolorent en modifiant
les attributs `fill`. Les PNG en sont des rendus, à ne pas réagrandir.

## Couleurs

- Encre `#1A1A18` — le pavé.
- Papier `#F6F6F4` — le crochet gauche, côté intérimaire.
- Haute visibilité `#F5D90A` — le crochet droit, côté entreprise.
- Haute visibilité sourde `#C9A800` — remplace le jaune vif dans la version inversée, où le
  pavé est clair : le jaune vif y perdrait tout contraste.

Aucune autre couleur n'est admise. Le logo est le seul emploi non fonctionnel du jaune de la
charte : il identifie, il ne signale rien, et n'apparaît donc qu'une fois par écran.

## Règles d'emploi

- **Taille minimale** : 20 px de côté à l'écran, 6 mm à l'impression. En dessous, les crochets
  se referment visuellement.
- **Zone de protection** : un quart de la hauteur du pavé sur les quatre côtés. Rien ne s'y
  place, pas même le nom de marque hors signature.
- **Rayon** : 4 px pour un pavé de 132 px, soit 3 % du côté — à l'échelle, jamais en absolu.
- **Interdits** : ne pas incliner, ne pas étirer, ne pas ajouter d'ombre ou de contour, ne pas
  recolorer les crochets dans une autre paire, ne pas poser le pavé principal sur une photo
  sans aplat encre derrière, ne pas séparer les deux crochets.

## Texte de la signature

Le nom est composé en **Instrument Sans 600**, interlettrage −0,01 em. Les fichiers signature
référencent la police par son nom : sur un poste qui ne l'a pas, le rendu retombe sur Arial.
Pour un usage hors navigateur (impression, imprimeur, sous-traitant), vectoriser le texte.

## Favicon

```html
<link rel="icon" href="/logo/interimatch-favicon-32.png" sizes="32x32">
<link rel="icon" href="/logo/interimatch-favicon-64.png" sizes="64x64">
<link rel="apple-touch-icon" href="/logo/interimatch-favicon-180.png">
```
