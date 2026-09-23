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
npm run verifier      # typecheck + tous les tests
npm run coverage      # rapport de couverture
npm run audit         # liens morts, entités mal placées, menus qui mentent — sans serveur
npm run parcours      # parcours complet des deux côtés, écrans compris
npm run fumee         # parcours d'authentification
npm run fumee:notifs  # notifications, jusqu'au message posté puis relu sur Discord
npm run discord       # configuration du bot : nomme ce qui manque
```

**Pourquoi quatre outils et pas seulement la suite.** Une suite de tests vérifie qu'un
écran répond, pas qu'il mène quelque part ni qu'il se comprend. Un onglet « Profil & CV »
menant à une page sans CV, trois pages qui ne chargeaient pas après une affectation, un
nom masqué sur une fiche et rendu en clair dans une liste : aucun test d'API ne les
attrape. `npm run audit` cherche les deux premiers statiquement, `npm run parcours`
ouvre désormais les écrans et pas seulement les routes.

Les trois derniers prennent une URL en argument et s'exécutent aussi bien contre un déploiement : `npm run parcours -- https://mon-app.vercel.app`. Ils vérifient la **configuration** là où la suite vérifie le **code**.

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

**Authentification écrite à la main**, comme le sujet l'impose : « *L'authentification classique (email/mot de passe, hash, sessions/tokens) doit être comprise et implémentée par vous-même.* » `scrypt` de `node:crypto` avec sel par compte, jetons de session opaques de 32 octets, comparaison en temps constant. Aucune librairie d'authentification, aucune solution managée — Supabase ne sert que de base de données.

**Récupération d'accès, deux chemins.** Un lien de réinitialisation envoyé à l'adresse du compte, valable une heure et à usage unique ; et, pour qui a aussi perdu l'accès à sa boîte, des codes de récupération remis à l'inscription. Le jeton est indexé par son empreinte SHA-256 : un dump de Redis ne donne aucun lien exploitable. Toute reprise en main ferme toutes les sessions.

**L'adresse est vérifiée, parce qu'elle est devenue un facteur d'authentification.** Dès lors qu'un lien envoyé par courriel permet de reprendre un compte, une adresse mal saisie — « karim@gmial.com » — offre cette prise au propriétaire réel de cette boîte. La vérification ne bloque donc rien : ni l'inscription, ni la connexion, ni aucune fonctionnalité. Elle conditionne une seule chose, l'envoi d'un lien de réinitialisation, et les codes de récupération restent ouverts à tous. Le changement d'adresse suit la même logique : mot de passe exigé, lien à la nouvelle boîte, avertissement à l'ancienne, et rien n'est écrit avant la confirmation.

Sans clé d'envoi configurée, les courriels partent au journal du serveur : le parcours reste complet et testable, et une configuration oubliée se voit au lieu d'échouer en silence. Voir `BREVO_API_KEY` dans `.env.example`.

**Deux bases, deux usages.** PostgreSQL pour les données structurées. Redis pour huit usages complémentaires : sessions, index de révocation par compte, limitation des tentatives de connexion, jetons à usage unique, état OAuth, cache des résultats de matching, traces d'exclusion, cache de géocodage. Une colonne JSONB ne satisferait pas l'exigence : il faut un second stockage réel.

**Chiffrement au repos** en AES-256-GCM sur les colonnes sensibles : téléphone, adresse, numéro de carte BTP, texte de CV. HTTPS couvre le transit, pas le stockage.

**Lecture des CV dans le navigateur.** Le document ne quitte pas l'appareil : couche texte du PDF, ou reconnaissance de caractères (Tesseract en WebAssembly) pour un scan ou une photo. Le serveur ne reçoit que du texte. Le document de mission s'enregistre en PDF par la même logique — l'impression du navigateur, plutôt qu'un moteur de rendu embarqué dans une fonction sans état.

**On paie pour agir, jamais pour décider.** Le rapprochement, le score détaillé et la conformité habilitation par habilitation sont gratuits et le resteront ; l'accès aux coordonnées d'un profil se paie, à l'acte ou par abonnement. Mettre le verdict de conformité derrière un paiement reviendrait à vendre le risque que cette plateforme existe pour supprimer. Un déblocage porte sur un couple **profil × mission**, et chaque intérimaire voit combien d'entreprises ont accédé à ses coordonnées. Le paiement est simulé, et les écrans ne le cachent pas : ce qui est réel, ce sont les quotas, l'imputation, l'idempotence et la transaction. Grille publique sur `/tarifs`.

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

## Notifications

Chaque personne reçoit ses alertes dans un **salon Discord créé pour elle seule** —
habilitations qui approchent de leur échéance, missions correspondantes. Le relais est
facultatif : les mêmes informations vivent dans l'espace, dont Discord n'est qu'un
écho.

Ce n'était pas le premier choix. La première version postait vers un webhook unique,
et tout le monde lisait donc les alertes de tout le monde — or une alerte nomme la
personne, son habilitation et sa date d'expiration. Un webhook ne sachant qu'écrire
dans le salon auquel il est attaché, créer un salon par personne et le restreindre à
elle impose de passer par un bot : c'est la seule voie.

La mise en place se vérifie par `npm run discord`, qui interroge Discord et nomme ce qui manque plutôt que de laisser chercher parmi six causes possibles.

Le rattachement se fait en un clic, par OAuth. **Aucune adresse e-mail n'est
comparée** : la preuve tient à la simultanéité — la même personne tient une session
ouverte ici *et* autorise sur Discord dans le même aller-retour. On demande
l'identifiant et le droit d'ajouter au serveur, rien d'autre. Se détacher supprime le
salon.

## Conformité

**Droit du travail.** Durée de mission plafonnée à 18 mois renouvellements compris (article L1251-12), opposée à la saisie avec la date limite calculée. Document de mission portant les six mentions obligatoires vérifiables par un logiciel — poste, qualification, terme, lieu, horaires, rémunération — avec la liste de ce qui manque quand il est incomplet.

**RGAA 4.1.** Suite d'audit automatisée dans `web/test/accessibilite.test.ts` : un seul `h1` par page, hiérarchie de titres sans saut, étiquettes associées, alternatives textuelles, repères de navigation, contrastes calculés. L'état de validité d'une habilitation reste distinguable **sans percevoir les couleurs** : chaque état porte un libellé écrit et un symbole de forme distincte.

**RGESN** — voir [docs/ecoconception.md](docs/ecoconception.md).

**RGPD et chiffrement au repos.** Six colonnes chiffrées en AES-256-GCM — téléphones, adresse du domicile, numéro de carte BTP, numéro d'habilitation, texte du CV. Ce qui reste en clair l'est par choix documenté : chiffrer une date d'échéance rendrait le filtre éliminatoire inapplicable. La cartographie complète est dans [docs/donnees-personnelles.md](docs/donnees-personnelles.md), et la propriété est **vérifiée par la suite de tests** plutôt qu'affirmée : la base est relue hors de l'application, et toute colonne ajoutée sans être classée fait échouer la suite.

Base légale et durées de conservation énoncées sur `/confidentialite`, mentions légales sur `/mentions-legales`, suppression de compte effaçant profil, habilitations, disponibilités, candidatures et texte de CV.

**SEO.** Métadonnées sur les pages publiques, `sitemap.xml` et `robots.txt` générés, URLs lisibles.

---

## Documentation

| Document | Contenu |
|---|---|
| [docs/decisions-techniques.md](docs/decisions-techniques.md) | **les arbitrages et leur motif** — ce qui se défend en soutenance |
| [docs/conformite-sujet.md](docs/conformite-sujet.md) | **état des lieux exigence par exigence**, vérifié dans le code |
| [docs/parcours.md](docs/parcours.md) | **parcours de bout en bout des deux côtés**, diagrammes et scénarios éprouvés |
| [docs/plan-implementation.md](docs/plan-implementation.md) | décisions techniques, mesures issues de l'exploration API, arbitrages |
| [docs/donnees-personnelles.md](docs/donnees-personnelles.md) | cartographie du traitement, chiffrement au repos, durées de conservation |
| [docs/ecoconception.md](docs/ecoconception.md) | pratiques RGESN appliquées et mesurées |
| [docs/automatisations-n8n.md](docs/automatisations-n8n.md) | les deux scénarios, leurs endpoints et leur configuration |
| [docs/n8n/LISEZ-MOI.md](docs/n8n/LISEZ-MOI.md) | **monter le bot Discord et les salons privés**, pas à pas |
| [docs/tests-et-couverture.md](docs/tests-et-couverture.md) | ce que la suite couvre, et ce qu'elle ne couvre pas |
| [docs/deploiement.md](docs/deploiement.md) | mise en ligne sur Vercel |
