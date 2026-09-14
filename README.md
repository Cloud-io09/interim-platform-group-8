# interimatch-secteur-scan

CLI TypeScript pour mesurer la volumétrie d'offres France Travail par secteur,
via l'API publique Offres d'emploi v2.

Développé pour trancher le choix du secteur d'InterimMatch — le secteur retenu
est le **BTP** (voir le dossier d'étude de marché). Le script reste utilisable
pour re-mesurer ou vérifier les chiffres avant la soutenance.

## Installation

```bash
npm install
cp .env.example .env
```

Récupérer `FT_CLIENT_ID` / `FT_CLIENT_SECRET` :
1. Créer un compte sur https://francetravail.io
2. Créer une application
3. Y associer l'API **Offres d'emploi v2**
4. Copier l'identifiant client et la clé secrète dans `.env`

## Commandes

### `scan-domaines` — la méthode retenue

```bash
npx tsx src/cli.ts scan-domaines              # les 110 domaines (~30s)
npx tsx src/cli.ts scan-domaines -p F -p N    # uniquement BTP et logistique
```

Récupère le référentiel officiel des domaines ROME (la classification métier de
France Travail), interroge chacun via le paramètre `domaine`, puis agrège par
grand domaine — la lettre du code : F pour la construction, N pour le transport
et la logistique, G pour l'hôtellerie-restauration, J pour la santé.

`-p, --prefix <lettre>` limite le scan à une ou plusieurs lettres. Répétable.

Sortie : une table agrégée par grand domaine (offres totales, dont missions,
part d'intérim), et un rapport JSON dans `reports/` contenant l'agrégat **et**
le détail par sous-domaine.

C'est la commande qui a produit les chiffres du dossier d'étude de marché.
Pour un relevé comparable entre secteurs, les scanner **dans un même appel** :
le nombre d'offres actives change tous les jours.

### `compare` — recherche par mots-clés

```bash
npm run compare -- -s restauration -s BTP -s logistique
```

Cherche un mot-clé dans les offres. Sans argument, teste les secteurs cités
dans le sujet.

**Cette méthode sous-estime fortement les volumes** — d'un facteur 5 à 9 selon
le secteur, mesuré sur le BTP et la santé. La plupart des offres d'un secteur
ne contiennent pas son nom dans l'intitulé : un poste de maçon ne dit pas
« BTP », un poste d'infirmier ne dit pas « santé ». À n'utiliser que pour
explorer un intitulé précis, jamais pour comparer des secteurs.

Seule commande qui affiche un échantillon d'intitulés — utile pour vérifier ce
que remonte réellement un mot-clé.

### `scan-all` — par secteur NAF, biaisé pour l'intérim

```bash
npx tsx src/cli.ts scan-all
npx tsx src/cli.ts scan-all -l 5    # debug rapide sur 5 secteurs
```

Scanne les ~88 divisions NAF via le paramètre `secteurActivite`.

**Inexploitable pour mesurer l'intérim** : `secteurActivite` encode le NAF de
l'entreprise qui publie l'offre, pas le secteur où la mission s'exerce. Les
missions d'intérim étant publiées par les agences, elles tombent presque toutes
sous la division 78 « Activités liées à l'emploi », quel que soit le métier
réel. Constaté en pratique : 87 secteurs sur 88 à 0 mission.

Conservée parce qu'elle reste valable pour mesurer le volume d'offres brut par
secteur NAF, hors question d'intérim.

## Lire les résultats

Deux indicateurs, à croiser :

- **Volume de missions** (`typeContrat=MIS`) — le gisement réellement exploitable
  pour une plateforme d'intérim, plus pertinent que le total d'offres.
- **Part d'intérim** — le rapport missions / offres totales du secteur. Un taux
  élevé signale un recours structurel à l'intérim.

Le détail par sous-domaine du rapport JSON est souvent plus parlant que
l'agrégat : sur le BTP, la part d'intérim passe de 55 % en agrégé à 67 % sur les
seuls métiers de terrain, les postes de conception et d'encadrement tirant la
moyenne vers le bas.

Ce script ne couvre que le critère « disponibilité de données publiques
exploitables ». La concurrence et les douleurs métier relèvent de l'étude
qualitative.

## Architecture

`src/franceTravailClient.ts` — authentification OAuth2 avec cache de token,
recherche paginée (le total vient de l'en-tête `Content-Range`, pas de la
longueur du tableau de résultats), accès aux référentiels.

`src/cli.ts` — les trois commandes, throttlées à 130 ms entre appels pour
rester sous la limite de l'API.

Le client est écrit pour être réutilisé tel quel par le pipeline d'ingestion
(module M5) : nettoyage et normalisation des offres pour alimenter une
fonctionnalité du produit. Ce dépôt couvre également la contrainte technique
« utilisation d'au moins une bibliothèque en ligne de commande » — via
Commander.

## Documentation

- API Offres d'emploi : https://francetravail.io/produits-partages/catalogue/offres-emploi/documentation#/
- Nomenclature ROME : https://www.francetravail.fr/employeur/vos-recrutements/le-rome-et-les-fiches-metiers.html