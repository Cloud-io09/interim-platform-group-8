# Tests et couverture

**378 tests** : 247 unitaires sur le domaine métier, 131 fonctionnels sur l'application.

```bash
npm run verifier     # typecheck + tests + construction, sur tout le dépôt
npm run coverage     # rapport de couverture du domaine (texte, HTML, lcov)
```

Le rapport HTML est écrit dans `core/coverage/index.html`. Il n'est pas versionné : un
rapport committé cesse d'être vrai dès la modification suivante.

## Couverture du domaine métier

| | Couverture |
|---|---|
| Instructions | **97,6 %** (560/574) |
| Branches | **95,6 %** (395/413) |
| Fonctions | **99,1 %** (106/107) |
| Lignes | **98,8 %** |

Des seuils sont configurés — 90 % sur les lignes, fonctions et instructions, 85 % sur les
branches. Passer en dessous fait échouer la commande, donc la construction.

### Ce qui n'est pas couvert, et pourquoi

| Fichier | Non couvert | Raison |
|---|---|---|
| `redis.ts` | la fabrique de client | Câblage d'infrastructure : la tester demanderait un vrai Redis sans rien prouver sur le métier. La logique — compteurs, clés, tolérance aux pannes — est couverte. |
| `salaire.ts` | garde-fou contre `NaN` | Inatteignable : l'expression régulière ne capture que des chiffres. Conservé contre une modification future du motif. |
| `cv.ts` | deux branches de repli | Cas dégradés du rapprochement lexical, sans effet observable. |
| `db.ts`, `env.ts`, `index.ts` | exclus du périmètre | Connexion et réexports, sans logique propre. |

## Parcours critiques exigés par le sujet

Les trois parcours nommés dans le sujet sont couverts, **par des tests fonctionnels qui
attaquent le vrai serveur en HTTP** — pas par des appels directs aux fonctions.

| Parcours | Où |
|---|---|
| Inscription | `web/test/inscription.test.ts`, `web/test/parcours-complet.test.ts` |
| Création de mission | `web/test/parcours-complet.test.ts`, `web/test/cycle-mission.test.ts` |
| Matching | `core/test/matching.test.ts` (unitaire), `web/test/parcours-complet.test.ts` (bout en bout) |

### Une limite à connaître

Les tests fonctionnels lancent l'application construite et l'interrogent par HTTP. C'est
volontaire : `cookies()` et les en-têtes n'existent que dans un contexte de requête, et ce
sont précisément les cookies de session et la limitation par IP qu'il faut éprouver.

**Conséquence : la couche HTTP n'est pas instrumentée.** Les 131 tests fonctionnels la
parcourent réellement, mais leur passage n'apparaît pas dans le pourcentage ci-dessus, qui
ne mesure que le domaine. Annoncer un chiffre global en agrégeant les deux serait faux.

## La suite est-elle complaisante ?

Un test qui passe ne prouve rien s'il passerait aussi sur du code cassé. Vérifié par
**mutation** : en remplaçant dans le filtre éliminatoire la date de fin de mission par la
date du jour — le bug que le produit existe pour empêcher — **deux tests unitaires et un
test fonctionnel tombent**, dont celui nommé « compare à la date de fin de mission et non
à la date du jour ».

## Audit d'accessibilité

`web/test/accessibilite.test.ts` vérifie neuf familles de critères RGAA sur les dix-sept
pages, à chaque exécution : langue, titre unique, hiérarchie continue, repères de
navigation, lien d'évitement, absence de `tabindex` positif, étiquetage des champs,
alternatives d'images, information jamais portée par la seule couleur.

Ce qui ne se vérifie pas mécaniquement — ordre de tabulation perçu, restitution par un
lecteur d'écran, parcours avec un utilisateur en situation de handicap — est listé comme
limite connue sur la page `/accessibilite`.
