# InterimMatch BTP

Plateforme de mise en relation entre entreprises du BTP et intérimaires.
Projet Epitech D-WEB-901 — preuve de concept réalisée en 11 jours.

---

## Le principe

**Une certification de chantier est une donnée avec une date de péremption, jamais du texte libre.**

Les plateformes concurrentes rapprochent des mots-clés extraits de CV. Ici, une habilitation est un objet structuré dont la date d'échéance décide si un profil peut aller sur le chantier.

La règle centrale tient en une phrase : **la validité est comparée à la date de fin de mission, pas à la date du jour.** Un CACES valable aujourd'hui mais périmé avant la fin d'un chantier de trois semaines exclut le profil — une affectation non conforme engage la responsabilité pénale de l'entreprise utilisatrice.

---

## Démarrage

### Prérequis

- **Node.js ≥ 22** (`node -v`)
- Un projet [Supabase](https://supabase.com) — base relationnelle
- Une base [Upstash Redis](https://upstash.com) — base non relationnelle
- Un compte [francetravail.io](https://francetravail.io) avec l'API « Offres d'emploi v2 » — facultatif, seulement pour l'ingestion

### Installation

```bash
git clone <url-du-dépôt>
cd interim-platform
npm install
cp .env.example .env
```

Renseignez `.env` — chaque variable y est commentée, avec l'endroit exact où trouver sa valeur. Deux pièges fréquents :

- `DATABASE_URL` doit pointer le **pooler Supavisor en mode transaction (port 6543)**, pas la connexion directe en 5432. En serverless, chaque invocation ouvre une connexion.
- `CLE_CHIFFREMENT` se génère avec `openssl rand -base64 32`. **La perdre rend illisibles les données déjà chiffrées** : téléphones, adresses, numéros de carte BTP, textes de CV.

### Création du schéma

```bash
npm run migrate
```

Les migrations sont dans `core/migrations/`, numérotées et rejouées dans l'ordre. Elles sont idempotentes au niveau du lot : une migration déjà appliquée est ignorée.

### Lancer l'application

```bash
npm run dev        # développement, http://localhost:3000
npm run build      # construction de production
npm start          # ou : npm run -w @interimatch/web start
```

### Jeu de démonstration

```bash
npm run ingest -- demo
```

Crée une entreprise, cinq profils d'intérimaires et une mission conçue pour exposer les quatre cas du moteur : profil conforme, habilitation absente, habilitation expirée, et — le cas qui justifie le produit — habilitation **valide aujourd'hui mais périmée avant la fin du chantier**.

Tous les comptes de démonstration utilisent le mot de passe `demonstration-interimatch` :

| Compte | Rôle |
|---|---|
| `entreprise@demo.interimatch.test` | entreprise |
| `conforme@demo.interimatch.test` | intérimaire pleinement conforme |
| `expire-pendant@demo.interimatch.test` | titre qui expire pendant la mission |

---

## Vérifier

```bash
npm run verifier   # typecheck + tous les tests
npm run coverage   # rapport de couverture
```

`verifier` enchaîne `typecheck` puis `test` **sans pipe** : une redirection masquerait le code de sortie, et une suite rouge passerait pour verte.

La suite fonctionnelle démarre un vrai serveur `next start` et l'interroge en HTTP, plutôt que d'appeler les gestionnaires de route en direct : `cookies()` et `headers()` n'existent que dans un contexte de requête, et ce sont précisément les cookies et la limitation de tentatives qu'il faut éprouver. Elle parle à la base et au cache distants — d'où un délai de test volontairement large.

---

## Architecture

Monorepo npm workspaces.

| Espace | Rôle |
|---|---|
| `core/` | domaine métier : schéma, migrations, chiffrement, géocodage, moteur de matching, règles de droit du travail |
| `web/` | application Next.js — interfaces entreprise et intérimaire, API |
| `ingest/` | pipeline France Travail : collecte, nettoyage, normalisation, chargement |
| `explo-api/` | exploration initiale de l'API France Travail, conservée comme trace de mesure |

### Choix techniques

**Authentification écrite à la main**, comme le sujet l'impose : `scrypt` de `node:crypto` avec sel par compte, jetons de session opaques de 32 octets, comparaison en temps constant. Aucune librairie d'authentification, aucune solution managée — Supabase ne sert que de base de données.

**Deux bases, deux usages.** PostgreSQL pour les données structurées. Redis pour cinq usages complémentaires : sessions, limitation des tentatives de connexion, cache des résultats de matching, traces d'exclusion, cache de géocodage. Une colonne JSONB ne satisferait pas l'exigence : il faut un second stockage réel.

**Chiffrement au repos** en AES-256-GCM sur les colonnes sensibles : téléphone, adresse, numéro de carte BTP, texte de CV. HTTPS couvre le transit, pas le stockage.

**Lecture des CV dans le navigateur.** Le document ne quitte pas l'appareil : couche texte du PDF, ou reconnaissance de caractères (Tesseract en WebAssembly) pour un scan ou une photo. Le serveur ne reçoit que du texte.

---

## Moteur de matching

Deux étapes strictement séquentielles, jamais fondues en un score unique.

**Étape 1 — filtre éliminatoire.** Un profil est écarté, sans score, si une habilitation exigée est absente ou périmée **à la date de fin de mission**. `core/src/matching.ts` ne contient aucun `Date.now()` ni `new Date()` : c'est vérifiable par simple lecture, et un test de mutation prouve que la suite attrape la régression si on l'y introduit.

**Étape 2 — scoring**, sur les seuls survivants : compétences communes (0,40), distance rapportée au rayon de mobilité (0,35), chevauchement des disponibilités (0,25). Le score est exposé **par critère**, pas seulement en total.

**Traçabilité.** Chaque calcul laisse en Redis les profils évalués, les profils écartés avec leur motif et les scores détaillés, avec un TTL court. L'objectif n'est pas l'archivage mais de pouvoir répondre à « pourquoi ce profil n'apparaît-il pas ? ».

---

## Ingestion France Travail

```bash
npm run ingest -- --help
npm run ingest -- collecte --metier F1702 --pages 5
```

Le CLI s'appuie sur **commander**. Les données ne sont pas affichées brutes : elles sont dédoublonnées sur l'identifiant d'offre, les intitulés sont normalisés contre le référentiel des appellations, les rémunérations converties en taux horaire depuis des formulations libres, les lieux résolus en coordonnées.

Elles alimentent une fonctionnalité visible : **la fiche de poste enrichie**. À la création d'une mission, le formulaire se préremplit depuis les offres du métier choisi — intitulé normalisé, habilitations typiques, fourchette de rémunération observée localement.

---

## Conformité

**Droit du travail.** Durée de mission plafonnée à 18 mois renouvellements compris (article L1251-12), opposée à la saisie avec la date limite calculée. Document de mission portant les six mentions obligatoires vérifiables par un logiciel — poste, qualification, terme, lieu, horaires, rémunération — avec la liste de ce qui manque quand il est incomplet.

**RGAA 4.1.** Suite d'audit automatisée dans `web/test/accessibilite.test.ts` : un seul `h1` par page, hiérarchie de titres sans saut, étiquettes associées, alternatives textuelles, repères de navigation, contrastes calculés. L'état de validité d'une habilitation reste distinguable **sans percevoir les couleurs** : chaque état porte un libellé écrit et un symbole de forme distincte.

**RGESN** — voir [docs/ecoconception.md](docs/ecoconception.md).

**RGPD.** Base légale et durées de conservation énoncées sur `/confidentialite`, mentions légales sur `/mentions-legales`, suppression de compte effaçant profil, habilitations, disponibilités, candidatures et texte de CV.

**SEO.** Métadonnées sur les pages publiques, `sitemap.xml` et `robots.txt` générés, URLs lisibles.

---

## Documentation

| Document | Contenu |
|---|---|
| [docs/plan-implementation.md](docs/plan-implementation.md) | décisions techniques, mesures issues de l'exploration API, arbitrages |
| [docs/ecoconception.md](docs/ecoconception.md) | pratiques RGESN appliquées et mesurées |
| [docs/automatisations-n8n.md](docs/automatisations-n8n.md) | les deux scénarios, leurs endpoints et leur configuration |
| [docs/tests-et-couverture.md](docs/tests-et-couverture.md) | ce que la suite couvre, et ce qu'elle ne couvre pas |
| [docs/deploiement.md](docs/deploiement.md) | mise en ligne sur Vercel |
