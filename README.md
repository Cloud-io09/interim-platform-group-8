# InterimMatch BTP

Plateforme de mise en relation entre entreprises du BTP et intérimaires.
Projet Epitech D-WEB-901, preuve de concept réalisée en onze jours.

**Une habilitation de chantier est une donnée datée, jamais du texte libre.** Le moteur
écarte tout profil dont un titre exigé est absent ou échoit **avant la fin de la
mission**, puis classe les autres sur les compétences, la distance et les
disponibilités. Un CACES valable aujourd'hui mais échu au milieu d'un chantier exclut
le profil : une affectation non conforme engage la responsabilité pénale de
l'entreprise utilisatrice.

---

## Démarrage

### Prérequis

- Node.js 22 ou plus récent
- Un projet [Supabase](https://supabase.com) (PostgreSQL)
- Une base [Upstash](https://upstash.com) (Redis)
- Un compte [francetravail.io](https://francetravail.io) avec l'API « Offres d'emploi
  v2 » : les métiers et les compétences en viennent, une base neuve en a besoin
- Facultatif : Brevo pour les courriels, un bot Discord pour les notifications

### Installation

```bash
npm install
cp .env.example .env              # chaque variable y est commentée
npm run migrate                   # schéma et habilitations de référence

# Données publiques, à faire une fois sur une base neuve (quelques minutes)
npm run ingest -- seed-metiers    # les 52 métiers de terrain
npm run ingest -- fetch           # offres d'intérim des quatre domaines
npm run ingest -- clean           # nettoyage et normalisation
npm run ingest -- load            # chargement : compétences et fiche enrichie

npm run ingest -- seed-demo       # jeu de démonstration (facultatif)
npm run dev                       # http://localhost:3000
```

Deux points d'attention dans `.env` :

- `DATABASE_URL` pointe le pooler Supavisor en **mode transaction, port 6543**.
- `CLE_CHIFFREMENT` se génère par `openssl rand -base64 32`. La perdre rend
  illisibles les données déjà chiffrées.

Sans clé Brevo, les courriels sont écrits dans le journal du serveur : tous les
parcours restent utilisables en local.

Le jeu de démonstration crée une entreprise et huit intérimaires, chacun illustrant un
cas du moteur. Mot de passe commun : `demonstration-interimatch`.

---

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Construction de production |
| `npm run migrate` | Applique les migrations en attente |
| `npm run verifier` | Vérification des types, puis tous les tests |
| `npm run coverage` | Rapport de couverture du domaine (`core/coverage/`) |
| `npm run audit` | Analyse statique des pages : liens morts, balisage, espacements |
| `npm run parcours [url]` | Parcours complets des deux rôles, contre un serveur |
| `npm run fumee [url]` | Parcours d'authentification |
| `npm run fumee:notifs [url]` | Notifications, jusqu'au message relu dans Discord |
| `npm run discord` | Diagnostic de la configuration du bot Discord |
| `npm run ingest -- <commande>` | CLI France Travail : `seed-metiers`, `fetch`, `clean`, `load`, `stats`, `export`, `seed-demo`, `seed-missions` |

---

## Organisation

```
core/        domaine métier : matching, conformité, chiffrement, migrations
web/         application Next.js : interfaces, API, tests fonctionnels
ingest/      CLI d'ingestion France Travail et jeu de démonstration
explo-api/   exploration initiale de l'API France Travail
outils/      contrôles hors suite de tests
docs/        documentation, exports n8n, cahier des charges
```

Next.js 16 et TypeScript strict, PostgreSQL (Supabase), Redis (Upstash), déploiement
Vercel. Détail : [docs/architecture.md](docs/architecture.md).

---

## Documentation

| Document | Contenu |
|---|---|
| [Architecture](docs/architecture.md) | Composants, modèle de données, moteur de matching, ingestion, Redis, notifications |
| [Décisions](docs/decisions.md) | Chaque choix structurant, ce qui a été écarté, et pourquoi |
| [Sécurité et données](docs/securite-et-donnees.md) | Authentification, protections, chiffrement, RGPD |
| [Qualité](docs/qualite.md) | Tests, couverture, outils de contrôle, accessibilité, éco-conception |
| [Exploitation](docs/exploitation.md) | Variables, déploiement, Discord, n8n, dépannage |
| [Conformité](docs/conformite.md) | État de chaque exigence du sujet et sa preuve |

Livrables du projet, dans `docs/` :

| Document | Contenu |
|---|---|
| [Cahier des charges](docs/cahier-des-charges-g8.pdf) | Étude de marché, modules, chiffrage prévisionnel |
| [Présentation](docs/presentation-g8.pdf) | Support de soutenance |
| [Business plan](docs/business-plan.pdf) | Modèle économique et tarification |
| [Chiffrage](docs/chiffrage-g8.pdf) | Chiffrage du projet |
| [Design](docs/design/) | Logo et pistes de design |
| [Flux n8n](docs/n8n/) | Exports des trois automatisations |
| [Données publiques](docs/donnees/) | Jeu collecté (1 800 offres France Travail) et jeu nettoyé (1 762), produits par la CLI `ingest/` |
