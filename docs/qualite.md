# Qualité

Tests, outils de contrôle, accessibilité et éco-conception. Chiffres relevés le
24 septembre 2026.

## Sommaire

1. [Stratégie de test](#stratégie-de-test)
2. [Couverture](#couverture)
3. [Outils de contrôle](#outils-de-contrôle)
4. [Accessibilité (RGAA)](#accessibilité-rgaa)
5. [Éco-conception (RGESN)](#éco-conception-rgesn)
6. [Réemploi d'EPI](#réemploi-depi)
7. [Ce qui n'est pas vérifié automatiquement](#ce-qui-nest-pas-vérifié-automatiquement)

---

## Stratégie de test

| Niveau | Où | Volume | Ce qui est testé |
|---|---|---|---|
| Unitaire | `core/test/` | 374 tests | Règles métier : matching, conformité, droit du travail, chiffrement, parseurs d'ingestion, offre commerciale, lecture de CV |
| Fonctionnel | `web/test/` | 226 tests | L'application construite, lancée par `next start` et interrogée en HTTP |

```bash
npm run verifier     # typecheck, puis tests de tous les workspaces
npm run coverage     # rapport de couverture de core (texte, HTML, lcov)
```

**Pourquoi un vrai serveur.** Les cookies, les en-têtes et la limitation par IP
n'existent que dans un contexte de requête : appeler les gestionnaires de route
directement ne les éprouverait pas. `npm test` dans `web` construit l'application avant
de la tester ; la suite porte donc toujours sur le code courant.

La suite fonctionnelle parle à la base et au cache distants, d'où un délai par test de
45 s. Chaque fichier crée ses comptes sous un préfixe unique et les supprime à la fin ;
les sessions orphelines sont purgées au démontage.

### Parcours critiques exigés par le sujet

| Parcours | Tests |
|---|---|
| Inscription | `web/test/inscription.test.ts`, `web/test/parcours-complet.test.ts` |
| Création de mission | `web/test/parcours-complet.test.ts`, `web/test/cycle-mission.test.ts` |
| Matching | `core/test/matching.test.ts`, `web/test/parcours-complet.test.ts`, `web/test/hors-metier.test.ts` |

### La suite détecte-t-elle la régression qui compte ?

Vérifié par mutation : remplacer, dans le filtre éliminatoire, la date de fin de
mission par la date du jour fait échouer deux tests unitaires et un test fonctionnel.

---

## Couverture

`core`, 374 tests :

| Instructions | Branches | Fonctions | Lignes |
|---|---|---|---|
| 96,8 % | 92,3 % | 97,9 % | 98,2 % |

Seuils configurés dans `core/vitest.config.ts` : 90 % (lignes, fonctions,
instructions), 85 % (branches). En dessous, la commande échoue. Le rapport HTML est
écrit dans `core/coverage/` et n'est pas versionné.

| Non couvert | Motif |
|---|---|
| Fabrique du client Redis | Câblage d'infrastructure ; la logique (compteurs, clés, tolérance aux pannes) est couverte |
| Garde-fou `NaN` du parseur de salaire | Inatteignable avec le motif actuel, conservé contre une modification future |
| `db.ts`, `env.ts`, `index.ts` | Exclus : connexion et réexports, sans logique |

**`web` n'a pas de rapport de couverture**, délibérément
([D20](decisions.md#d20-pas-de-rapport-de-couverture-pour-web)). La mesure retenue :
les 42 routes d'API sont toutes traversées par la suite fonctionnelle ou par
`npm run parcours`.

---

## Outils de contrôle

Une suite de tests vérifie qu'un écran répond, pas qu'il mène quelque part. Quatre
outils couvrent ce qu'elle ne voit pas. Les trois derniers acceptent une URL et
s'exécutent aussi contre un déploiement.

| Commande | Serveur | Ce qu'elle vérifie |
|---|---|---|
| `npm run audit` | non | Analyse statique des pages et composants (six règles, ci-dessous) |
| `npm run parcours` | oui | Les parcours des deux rôles de bout en bout, écrans d'après affectation compris |
| `npm run fumee` | oui | Inscription, connexion, déconnexion, limitation |
| `npm run fumee:notifs` | oui | Notifications, jusqu'à un message posté puis relu dans un vrai salon Discord |
| `npm run discord` | non | Configuration du bot : jeton, application, URL de retour, présence sur le serveur, permissions |

### Règles de `npm run audit`

| Règle | Défaut évité |
|---|---|
| Aucun lien interne vers une route inexistante | Un `404` au premier clic |
| Aucune entité HTML dans une chaîne JavaScript | « d&apos;un » affiché tel quel |
| Aucun intitulé de menu qui promet une destination absente | « Profil & CV » menant à une page sans CV |
| Aucun élément de bloc dans un élément en ligne | Texte déplacé par le navigateur hors de son conteneur |
| Aucun espacement hors de l'échelle | Éléments tantôt collés, tantôt trop écartés |
| Aucune taille de police posée en ligne | Hiérarchie typographique incohérente d'un écran à l'autre |

Chaque règle a été éprouvée en réintroduisant le défaut qu'elle vise.

L'échelle d'espacement compte sept paliers (`--espace-1` à `--espace-7`, de 0,25 à
3 rem) déclarés dans `web/app/globals.css`.

---

## Accessibilité (RGAA)

`web/test/accessibilite.test.ts` contrôle 22 pages, publiques et connectées, à chaque
exécution :

- langue du document, un seul `h1`, hiérarchie de titres sans saut ;
- repères `header`, `main`, `footer`, navigation nommée, lien d'évitement ;
- aucun `tabindex` positif, aucun élément interactif inatteignable au clavier ;
- chaque champ associé à une étiquette, chaque image dotée d'une alternative ;
- aucune information portée par la seule couleur : chaque état d'habilitation a un
  libellé et un symbole de forme distincte ;
- contrastes calculés sur les couleurs de la charte, tous au moins AA.

Pratiques appliquées dans l'interface : cibles tactiles de 44 px minimum (public
souvent ganté), messages d'erreur liés au champ fautif, focus visible partout,
animations coupées sous `prefers-reduced-motion`.

Déclaration d'accessibilité : `/accessibilite` (partiellement conforme).

---

## Éco-conception (RGESN)

Mesures prises sur `next start`, en local.

### 1. Poids transféré réduit (RGESN 4.4)

Compression HTTP (`compress: true`). Page d'accueil : 27,8 Ko de HTML brut, **5,9 Ko
transférés**. Les photos de l'accueil passent par `next/image`, qui sert de l'AVIF à la
taille de l'écran :

| Image | Source | Servie (ordinateur) | Servie (mobile) |
|---|---|---|---|
| Bandeau d'accueil | 2,7 Mo | 42 Ko | 11 Ko |
| Fond de « Vous recrutez » | 615 Ko | 96 Ko | |
| Illustration de « Vous cherchez des missions » | 835 Ko | 24 Ko | |

Pas de police web : la pile système suffit. Reste 176 Ko de JavaScript compressé sur
l'accueil, coût de l'hydratation React.

### 2. Chargement différé (RGESN 4.7)

- Deux des trois photos de l'accueil sont en `loading="lazy"` ; seule celle du bandeau,
  visible immédiatement, est prioritaire.
- Le moteur de reconnaissance de caractères (cœur WebAssembly et modèle français,
  environ 4,5 Mo) n'est téléchargé que si le document n'a pas de couche texte
  exploitable. Un PDF texte est lu en 0,5 s sans le charger.

### 3. Calcul sur l'appareil (RGESN 2.3)

La lecture du CV et la production du document de mission se font dans le navigateur
([D16](decisions.md#d16-le-cv-se-lit-dans-le-navigateur),
[D17](decisions.md#d17-le-pdf-est-imprimé-par-le-navigateur)). Une fonction sans état
rechargerait un moteur de plusieurs mégaoctets à chaque requête.

### 4. Requêtes en base regroupées (RGESN 5.2)

Les écrans à plusieurs missions chargent missions et profils en un nombre fixe de
requêtes, quel que soit le volume (`web/lib/depot.ts`). Avec 73 missions : point
d'entrée n8n de 20 s à 2,1 s, tableau de bord entreprise de 10 s à 0,47 s. Le client
PostgreSQL est partagé ([D9](decisions.md#d9-un-client-postgresql-partagé)).

### 5. Caches (RGESN 5.1)

Résultats de matching (15 min, invalidés à la modification), géocodage (30 jours : un
service public n'est jamais interrogé deux fois pour la même adresse), référentiels
revalidés au rythme des ingestions.

### Écarté

La recherche plein texte sur les CV (raison produit, voir
[D4](decisions.md#d4-le-cv-propose-il-ne-décide-pas)) et les photos par fiche de
mission (plusieurs mégaoctets par liste pour aucune information).

---

## Réemploi d'EPI

Piste d'achat responsable, non livrée.

Un intérimaire en mission courte reçoit casque, chaussures, gants, parfois harnais ;
l'équipement survit au contrat, et le chantier rééquipe le suivant. La plateforme
connaît déjà le chantier (coordonnées), les dates et le métier : repérer deux missions
successives sur un même site est une jointure sur des colonnes existantes. Il faudrait
ajouter un inventaire par chantier et un contrôle de date de péremption des EPI, la
même logique que pour les habilitations. Ce qui touche à l'hygiène (gants, masques,
protections auditives) ne se réemploie pas, et la fourniture reste de la responsabilité
de l'entreprise de travail temporaire.

---

## Ce qui n'est pas vérifié automatiquement

| Domaine | Comment c'est vérifié |
|---|---|
| Rendu visuel, élégance | À l'œil, en captures à 1280 et 390 px. Les règles d'audit ne vérifient que la structure |
| Lecture de CV | Dans un vrai navigateur : PDF texte 0,5 s, PDF scanné 2,1 s, photo 1,5 s |
| Liens reçus par courriel | La suite lit le journal du serveur ; l'arrivée réelle en boîte se vérifie à la main |
| Flux n8n | Sur une instance n8n réelle ; les points d'entrée sont testés par la suite |
| Restitution par un lecteur d'écran | Non faite ; listée comme limite sur `/accessibilite` |
