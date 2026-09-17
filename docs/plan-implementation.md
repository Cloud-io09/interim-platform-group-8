# Plan d'implémentation — InterimMatch BTP

Document opérationnel : le comment et dans quel ordre. Le quoi et le pourquoi sont dans
le [cahier des charges](cahier-des-charges-g8.pdf) et dans la spécification produit, qui
n'est pas versionnée — ce plan reprend donc toutes les règles métier dont il dépend, pour
rester lisible sans elle.

Statut : **en attente de validation**. Rédigé le 2026-09-16.

---

## 1. Ce que l'exploration API a réellement mesuré

Mesures faites le 2026-09-16 sur l'API Offres d'emploi v2, 600 offres `typeContrat=MIS`
des quatre domaines de terrain (F13 engins, F15 montage, F16 second œuvre, F17 gros œuvre).
Ces chiffres conditionnent la conception du module d'ingestion — ils ne sont pas décoratifs.

**Couverture des champs**

| Champ | Disponibilité | Conséquence |
|---|---|---|
| `description` | 600/600 (100 %) | seule source exploitable pour les certifications |
| `salaire.libelle` | 520/600 (87 %) | fourchette de rémunération viable |
| `lieuTravail.latitude/longitude` | 582/600 (97 %) | **les offres sont déjà géocodées** |
| `romeCode` + `appellationlibelle` | 100 % | source de normalisation des intitulés |
| `competences[]` (code, libellé, exigence `S`/`E`) | fréquent | compétences typiques du métier |
| `formations[]`, `permis[]` | absents sur l'échantillon | inutilisables |

**Conséquence n° 1 — le géocodage ne sert pas à l'ingestion.** Les offres portent
déjà lat/lon. Le géocodage n'est nécessaire que pour les adresses saisies à la main :
domicile de l'intérimaire, adresse de chantier d'une mission créée par une entreprise.

**Conséquence n° 2 — les certifications ne sont pas un champ structuré.** Il n'existe
aucun champ certification dans l'API. La seule extraction possible est du repérage de
motifs dans `intitule + description` :

| Motif | Occurrences / 600 | Exploitable ? |
|---|---|---|
| CACES (toutes mentions) | 175 (29 %) | oui |
| CACES R482 | 86 (14 %) | oui |
| Habilitation électrique | 47 (8 %) | oui |
| AIPR | 31 (5 %) | oui, à la limite |
| SST | 2 (0 %) | non |
| Amiante | 0 (0 %) | non |
| Carte BTP | 2 (0 %) | non — et hors périmètre du matching de toute façon |

Le préremplissage ne suggérera donc de certifications que pour CACES, habilitation
électrique et AIPR. Pour SST et amiante, le type reste dans la liste fermée et
saisissable, mais aucune suggestion ne remontera : le signal n'existe pas. **Annoncer
cette limite en soutenance vaut mieux que de la maquiller.**

Ce repérage de motifs **ne contredit pas** l'interdiction du matching sémantique : il
produit une *suggestion préremplie dans un formulaire*, que l'entreprise confirme ou
retire, et qui est ensuite stockée comme type énuméré. À aucun moment une chaîne libre
n'entre dans le modèle, et à aucun moment ce texte n'alimente le calcul de matching.

**Conséquence n° 3 — `salaire.libelle` est du texte libre à parser.** Formats observés :

```
Horaire de N Euros
Horaire de N Euros à N Euros
Mensuel de N Euros à N Euros
Annuel de N Euros à N Euros
Horaire de N Euros à N Euros - Panier repas          <- suffixe libre après " - "
Horaire de N Euros à N Euros - Selon grille du BTP
```

Règle de nettoyage : capturer `(Horaire|Mensuel|Annuel) de X( à Y)?`, ignorer le suffixe
après ` - `, convertir en **taux horaire** (mensuel ÷ 151,67 ; annuel ÷ 1 820) pour
obtenir une unité unique comparable. C'est la normalisation la plus visible du pipeline.

**Référentiels disponibles** (via `getReferentiel`, déjà implémenté) :
`metiers` (1 911), `appellations` (14 301), `domaines` (110), `typesContrats`, `permis`.
Le référentiel `appellations` est la liste fermée d'intitulés normalisés — il remplace
les intitulés bruts du type `MAÇON/MAÇONNE Traditionnel H/F (H/F)` ou `Tireur de rateau F/H`.

**Volumétrie** : 8 202 missions sur F17 seul, ~25 900 sur les quatre domaines de terrain.
Largement assez ; l'ingestion sera plafonnée, pas exhaustive.

---

## 2. Décisions techniques verrouillées

### Socle

| | Choix | Pourquoi ce choix précisément |
|---|---|---|
| Framework | **Next.js 15, App Router, TypeScript strict** | un seul déploiement Vercel ; les Server Components donnent le rendu serveur exigé par le SEO on-page sans travail supplémentaire ; les Route Handlers *sont* le backend Node/TS |
| Postgres | **Supabase, connexion directe via pooler** | voir ci-dessous |
| Redis | **Upstash** | client HTTP : pas de socket TCP à maintenir en serverless |
| Géocodage | **API Adresse (BAN), `api-adresse.data.gouv.fr`** | gratuit, sans clé, couverture France exhaustive — testé et fonctionnel. Filtrer par `postcode` : sans lui, « rue de la Paix Reims » remonte un résultat dans les Yvelines à 0,65 de score |
| Distance | **Haversine en TypeScript** | pas de PostGIS à activer ; à l'échelle d'un POC les profils tiennent en mémoire, et la fonction est testable unitairement |
| Tests | **Vitest + `@vitest/coverage-v8`** | rapport de coverage exigé par le sujet |
| CLI | **Commander** | déjà en place dans `explo-api/`, réutilisé pour l'ingestion |

### Supabase : base de données uniquement, pas d'authentification

**Supabase Auth est interdit par le sujet** (« pas de solution managée »). Or les RLS
Supabase s'appuient sur les JWT de Supabase Auth. Sans elles, on n'accède pas à la base
via `supabase-js` en mode anonyme de façon cohérente.

Décision : accès **Postgres direct** depuis les Route Handlers, avec `postgres.js`, sur
le **pooler Supavisor en mode transaction (port 6543)** — pas le port 5432. En serverless,
chaque invocation ouvre une connexion ; sans pooler, la base sature sous quelques dizaines
de requêtes concurrentes. Les permissions sont vérifiées dans le code applicatif, pas en RLS.

À dire en soutenance : « Supabase est utilisé comme PostgreSQL managé, pas comme
backend-as-a-service, parce que le sujet impose une authentification faite main. »

### Authentification maison

- **Hash : `scrypt` de `node:crypto`.** Bibliothèque standard — aucune dépendance, donc
  aucune ambiguïté sur « pas de librairie d'authentification clé en main ». Sel aléatoire
  de 16 octets par compte, comparaison en `timingSafeEqual`.
- **Sessions : jeton opaque**, 32 octets de `randomBytes`, stocké en cookie
  `httpOnly` + `Secure` + `SameSite=Lax`, avec la session en Redis sous `sess:<jeton>` et
  un TTL. Pas de JWT : la révocation immédiate est gratuite, et ça matérialise l'usage
  Redis que le sujet demande.
- **Limitation des tentatives : `INCR` + `EXPIRE`** sur `rl:ip:<ip>` et `rl:email:<email>`,
  fenêtre glissante. Verrou temporaire au-delà du seuil.
- **Chiffrement au repos : AES-256-GCM** (`node:crypto`) sur les colonnes sensibles
  uniquement — numéro de certification, numéro de carte BTP, téléphone, adresse précise.
  Stockage `iv:tag:ciphertext`. Clé en variable d'environnement Vercel. Le chiffrement en
  transit est acquis (TLS Vercel + TLS Supabase).

  Conséquence assumée : une colonne chiffrée n'est plus indexable ni triable. C'est
  pourquoi seuls les champs jamais utilisés en filtre le sont — surtout pas les dates
  d'échéance, qui sont le pivot du moteur de matching.

---

## 3. Modèle de données

Le point structurant : **une certification est une ligne typée, contrainte au niveau du
schéma**. Aucune colonne texte ne peut recevoir un intitulé de certification.

### Référentiels (données de seed, jamais saisies)

```sql
type_certification (
  code            text primary key,      -- CACES_R482, AIPR, HAB_ELEC, AMIANTE_SS4, SST
  libelle         text not null,
  validite_mois   int  not null,         -- 120, 60, 36, 36, 24
  exige_categorie boolean not null
)

categorie_certification (
  id        serial primary key,
  type_code text not null references type_certification(code),
  code      text not null,               -- A..G pour R482 ; B0,H0,B1,B2,BR pour HAB_ELEC
  libelle   text not null,
  unique (type_code, code)
)

metier (
  code        text primary key,          -- code appellation ROME
  libelle     text not null,             -- libellé normalisé du référentiel FT
  rome_code   text not null,             -- F1703
  domaine     char(3) not null,          -- F13 | F15 | F16 | F17 uniquement
  actif       boolean not null default true
)

competence (code text primary key, libelle text not null)
```

Le `metier` est semé depuis le référentiel `appellations` de l'API, **filtré sur les
quatre domaines de terrain**. F11 (conception) et F12 (encadrement) sont exclus au seed,
conformément au périmètre — ce n'est pas un filtre d'affichage, ils n'entrent pas en base.

### Comptes

```sql
compte (
  id serial primary key,
  email citext unique not null,
  mot_de_passe_hash text not null,
  mot_de_passe_sel  text not null,
  role text not null check (role in ('entreprise','interimaire')),
  cree_le timestamptz not null default now()
)

entreprise (
  compte_id int primary key references compte(id) on delete cascade,
  raison_sociale text not null, siret text,
  adresse text, code_postal text, ville text, lat double precision, lon double precision,
  telephone_chiffre text
)

interimaire (
  compte_id int primary key references compte(id) on delete cascade,
  prenom text not null, nom text not null,
  telephone_chiffre text, adresse_chiffree text,
  code_postal text not null, ville text not null,
  lat double precision not null, lon double precision not null,
  rayon_mobilite_km int not null default 50 check (rayon_mobilite_km between 5 and 200),
  carte_btp_numero_chiffre text,          -- champ séparé, hors certifications
  carte_btp_echeance date,
  webhook_discord text
)
```

Le défaut de 50 km est une valeur de colonne, pas une constante dans le code — l'intérimaire
la change, et rien dans le moteur ne suppose une valeur particulière. 50 km vient du périmètre
de mobilité du CDI intérimaire cité par le cahier des charges ; la spécification produit disait 40, la
contradiction est tranchée en faveur du document que le jury lira.

### Certifications — le cœur

```sql
certification (
  id serial primary key,
  interimaire_id int not null references interimaire(compte_id) on delete cascade,
  type_code    text not null references type_certification(code),
  categorie_id int  references categorie_certification(id),
  organisme_emetteur text not null,
  numero_chiffre     text not null,
  date_obtention date not null,
  date_echeance  date not null,
  check (date_echeance > date_obtention)
)
create index on certification (interimaire_id, type_code, date_echeance);
```

Deux contraintes que Postgres ne peut pas exprimer en `CHECK` (elles nécessitent une
sous-requête), donc **trigger `BEFORE INSERT OR UPDATE`** :

1. `categorie_id` renseignée **si et seulement si** `type_certification.exige_categorie`
   est vrai — et la catégorie doit appartenir au bon type.
2. `date_echeance` cohérente avec `date_obtention + validite_mois` (tolérance de quelques
   mois : les organismes émettent parfois avec décalage). Avertissement applicatif plutôt
   que rejet dur, sauf dépassement grossier.

L'index `(interimaire_id, type_code, date_echeance)` sert directement l'étape 1 du matching.

### Missions

```sql
mission (
  id serial primary key,
  entreprise_id int not null references entreprise(compte_id),
  titre text not null,
  metier_code text not null references metier(code),
  description text,
  adresse text, code_postal text not null, ville text not null,
  lat double precision not null, lon double precision not null,
  date_debut date not null,
  date_fin   date not null,               -- NOT NULL : référence du filtre éliminatoire
  taux_horaire_min numeric(6,2), taux_horaire_max numeric(6,2),
  statut text not null default 'brouillon'
         check (statut in ('brouillon','publiee','pourvue','close')),
  cree_le timestamptz not null default now(),
  check (date_fin >= date_debut)
)

mission_certification_requise (
  mission_id int references mission(id) on delete cascade,
  type_code  text references type_certification(code),
  categorie_id int references categorie_certification(id),
  primary key (mission_id, type_code, categorie_id)
)

mission_competence (mission_id int, competence_code text, primary key (mission_id, competence_code))

disponibilite (
  id serial primary key,
  interimaire_id int not null references interimaire(compte_id) on delete cascade,
  date_debut date not null, date_fin date not null,
  check (date_fin >= date_debut)
)

candidature (
  id serial primary key,
  mission_id int not null references mission(id) on delete cascade,
  interimaire_id int not null references interimaire(compte_id) on delete cascade,
  statut text not null default 'proposee' check (statut in ('proposee','acceptee','refusee')),
  cree_le timestamptz not null default now(),
  unique (mission_id, interimaire_id)
)
```

`date_fin` est `NOT NULL` par décision : c'est la date contre laquelle le filtre
éliminatoire compare. Une mission sans date de fin rendrait la règle centrale du produit
inapplicable.

### Ingestion France Travail

```sql
offre_ft (
  id_ft text primary key,                -- identifiant API, clé de dédoublonnage exact
  intitule_brut text not null,
  intitule_normalise text not null,      -- libellé du référentiel appellations
  metier_code text references metier(code),
  rome_code text,
  code_postal text, commune_code text, lat double precision, lon double precision,
  taux_horaire_min numeric(6,2), taux_horaire_max numeric(6,2),   -- toujours en horaire
  date_creation_ft timestamptz,
  ingere_le timestamptz not null default now(),
  empreinte text not null                -- hash(intitule_normalise, commune, entreprise)
)
create index on offre_ft (metier_code, code_postal);
create index on offre_ft (empreinte);

offre_ft_certification (offre_id text, type_code text, primary key (offre_id, type_code))
offre_ft_competence   (offre_id text, competence_code text, primary key (offre_id, competence_code))
```

Deux niveaux de dédoublonnage : `id_ft` pour l'exact (réingestion), `empreinte` pour le
quasi-doublon (une agence publie la même mission sur plusieurs communes).

---

## 4. Moteur de matching

Module TypeScript pur, sans accès base — il reçoit les données, il rend un résultat.
C'est ce qui le rend testable unitairement avec un coverage sérieux, et c'est là que
le coverage doit être le plus élevé.

```ts
type Exclusion = { interimaireId: number; motif: "certification_absente" | "certification_expiree";
                   typeCode: string; categorieCode?: string; dateEcheance?: string };

type Score = { interimaireId: number;
               competences: number; distance: number; disponibilite: number;  // 0..1 chacun
               total: number;
               detail: { competencesCommunes: string[]; distanceKm: number;
                         rayonKm: number; joursChevauchement: number; joursMission: number } };

type ResultatMatching = { missionId: number; evalues: number;
                          retenus: Score[]; ecartes: Exclusion[]; calculeLe: string };
```

### Étape 1 — filtre éliminatoire

Pour chaque certification requise par la mission, l'intérimaire doit détenir une
certification du même `type_code` (et de la même catégorie si le type l'exige) telle que :

```
certification.date_echeance >= mission.date_fin
```

**Contre `mission.date_fin`, jamais contre `now()`.** Une seule fonction fait cette
comparaison, elle prend la date de fin en paramètre, et il n'existe aucun appel à
`new Date()` dans le module de filtrage — c'est vérifiable par lecture et testé par un
cas dédié : certification valide aujourd'hui, expirant au milieu d'une mission de trois
semaines, profil écarté.

Un profil écarté l'est **sans score** : il ne traverse pas l'étape 2.

### Étape 2 — scoring

Trois critères, normalisés 0..1, exposés séparément **et** en total.

| Critère | Calcul |
|---|---|
| Compétences | `|communes| / |requises|` — 1 si la mission n'en exige aucune |
| Distance | `max(0, 1 − distanceKm / rayonMobiliteKm)` ; au-delà du rayon : 0 |
| Disponibilité | `joursChevauchement / joursMission`, sur l'union des périodes de dispo |

Pondérations en constantes nommées et exportées, pas de nombres magiques dans le calcul.
Départ proposé : compétences 0,4 — distance 0,35 — disponibilité 0,25.

> **Question ouverte n° 2** (voir §8) : hors rayon de mobilité, score 0 ou exclusion ?
> La spécification produit place le rayon en étape 2, donc score 0 — un profil à 45 km avec un
> rayon de 40 reste visible en bas de liste. À confirmer.

### Traçabilité Redis

| Clé | Contenu | TTL |
|---|---|---|
| `match:cache:<mission_id>` | `ResultatMatching` complet | 15 min, invalidé à la modification de la mission ou d'un profil concerné |
| `match:trace:<mission_id>` | évalués, écartés + motif, scores détaillés | 1 h |

La trace répond à « pourquoi ce profil n'apparaît-il pas ? ». Elle est consultable depuis
le tableau de bord entreprise, pas seulement en base — sinon elle ne sert pas en démonstration.

---

## 5. Pipeline d'ingestion

CLI Commander, réutilisant `explo-api/src/franceTravailClient.ts` **sans le réécrire**.

```
ingest fetch    --domaine F13 F15 F16 F17 --max 2000    # collecte brute, throttle 130 ms
ingest clean                                            # normalise et dédoublonne
ingest load                                             # charge en base
ingest stats                                            # agrégats de contrôle
```

Étapes de nettoyage, dans l'ordre :

1. **Normalisation d'intitulé** — `romeCode` + `appellationlibelle` → `metier.code`.
   Remplace l'intitulé brut (`MAÇON/MAÇONNE Traditionnel H/F (H/F)`) par le libellé
   du référentiel. Rejet des offres hors des quatre domaines de terrain.
2. **Normalisation de rémunération** — parsing de `salaire.libelle`, conversion en taux
   horaire (mensuel ÷ 151,67 ; annuel ÷ 1 820), suffixe libre ignoré.
3. **Normalisation de lieu** — `lieuTravail` : lat/lon reprises telles quelles (97 % de
   couverture) ; les 3 % restants sont géocodés via la BAN à partir du code postal, ou écartés.
4. **Extraction de certifications** — motifs sur `intitule + description`, projetés sur la
   liste fermée. CACES / habilitation électrique / AIPR uniquement (cf. §1).
5. **Dédoublonnage** — `id_ft` puis `empreinte`.
6. **Normalisation de dates** — ISO 8601, `date_creation_ft` en `timestamptz`.

Chaque étape est une fonction pure, testée sur des cas réels prélevés dans l'échantillon —
y compris les formats de salaire tordus.

### Fonctionnalité alimentée : fiche de poste enrichie

À la création d'une mission, dès que le métier et le code postal sont choisis, le formulaire
se préremplit depuis `offre_ft` :

- **intitulé** normalisé proposé à partir du métier ;
- **certifications typiques**, par fréquence d'apparition sur ce métier — chaque suggestion
  affichée avec son taux observé (« CACES R482 — présent dans 41 % des offres de ce métier »),
  case à cocher, jamais préselectionné en dur ;
- **fourchette de rémunération locale** — médiane et quartiles des taux horaires observés
  sur le même métier dans le département, avec le nombre d'offres qui fondent le chiffre.

Un nombre affiché sans son effectif n'est pas exploitable : « 13,50 €/h médian sur 8 offres »
et « sur 340 offres » ne se lisent pas pareil.

---

## 6. Calendrier — 11 jours

> La date de soutenance n'est pas connue (question ouverte n° 1, §8). Jours numérotés en relatif.

| Jour | Livrable | Point de vigilance |
|---|---|---|
| **J1** | Next.js + TS strict, Supabase et Upstash provisionnés, runner de migrations SQL, schéma complet, seed des référentiels depuis l'API, **déploiement Vercel qui répond** | déployer dès J1. Les surprises Vercel se découvrent à J1, pas à J10 |
| **J2** | Auth maison complète : scrypt, sessions Redis, cookies, rate limit, garde de rôle, les deux parcours d'inscription. Tests unitaires. | premier bloc exigé par le sujet, et rien n'est testable tant qu'on ne peut pas se connecter |
| **J3** | Profil intérimaire : formulaire guidé, **certifications typées**, carte BTP séparée, rayon, géocodage BAN, chiffrement AES-GCM | le cœur du produit. Si un seul jour doit déborder, c'est celui-ci |
| **J4** | Profil entreprise, CRUD missions (sans enrichissement), disponibilités | |
| **J5** | Pipeline d'ingestion : CLI, nettoyage, dédoublonnage, chargement. Tests des parseurs. | indépendant du reste — décalable en cas de retard |
| **J6** | Fiche de poste enrichie branchée sur le formulaire mission | |
| **J7** | **Moteur de matching** : filtre, scoring, traces Redis, cache. Tests denses. | le jour à ne pas rogner |
| **J8** | Tableaux de bord : entreprise (candidats + explication du score), intérimaire (missions, certifs expirantes) | |
| **J9** | n8n : les deux scénarios Discord + endpoint interne protégé par secret partagé | |
| **J10** | Conformité : RGAA (clavier, contrastes, sémantique), SEO pages publiques, RGPD, RGESN documenté. Tests fonctionnels + **rapport de coverage** | |
| **J11** | Marge : correctifs, jeu de données de démo, déroulé de soutenance | la marge se consomme toujours |

### Ordre de coupe en cas de retard

Dans cet ordre : suivi de missions réduit à une liste sans statistiques → référentiel
limité à quatre types de certification → scoring ramené à deux critères (compétences +
distance, la disponibilité saute en premier).

**Jamais coupés** : le filtre éliminatoire sur certification expirée, l'authentification
maison, les deux automatisations n8n, le coverage.

### Répartition des exigences transverses

| Exigence du sujet | Où elle est traitée |
|---|---|
| Base relationnelle | J1 — Supabase |
| Base non relationnelle | J2 (sessions, rate limit) + J7 (cache, traces) |
| Auth maison | J2 |
| Chiffrement | J3 (au repos) ; en transit acquis dès J1 |
| Deux types de comptes | J2 (inscription) + J3/J4 (parcours distincts) |
| Tests + coverage | J2, J5, J7 au fil de l'eau ; consolidation J10 |
| Bibliothèque CLI | J5 — Commander dans le pipeline |
| n8n | J9 |
| RGAA / RGESN / RGPD / SEO | J10, mais RGAA anticipé dès J3 sur les formulaires |

Le RGAA ne se rattrape pas à J10 : refaire l'accessibilité d'un formulaire déjà écrit coûte
plus cher que de l'écrire correctement. Balises `label`, `fieldset`/`legend`, messages
d'erreur liés par `aria-describedby` et cibles tactiles de 44 px dès le premier formulaire, J3.

---

## 7. La maquette et ce qu'elle impose

Captures dans [docs/maquette/](maquette/) : [landing](maquette/01-landing-le-projet.png)
et [inscription](maquette/02-application-inscription.png).

### Charte à reprendre

| | |
|---|---|
| Fond | blanc cassé `#F7F7F5`, cartes blanches, sections d'appui noir `#111` |
| Accent | jaune/ambre, uniquement en soulignement d'onglet actif et en sur-titre de section |
| Typographie | grotesque géométrique, titres larges à interlettrage serré, pas de serif |
| Cartes | bordure 1 px gris clair, rayon ~10 px, padding généreux |
| Boutons | primaire noir plein / texte blanc ; secondaire blanc bordé. Rayon ~8 px |
| Colonne | centrée, ~1 100 px maximum |
| Motifs | pastilles numérotées carrées sombres, grands chiffres-statistiques légendés, accordéon FAQ, pied de page sombre en 4 colonnes (Intérimatch / Contact / Conformité / Données) |

La carte de résultat de matching de la landing est directement réutilisable au J8 :
score en pourcentage à gauche, intitulé + entreprise + distance au centre, taux horaire
à droite. C'est exactement la sortie du moteur — à condition d'y ajouter le détail par
critère, que la maquette n'affiche pas et que le sujet exige.

L'accessibilité de cette charte est bonne (contrastes noir sur blanc cassé, cibles larges),
sauf l'accent ambre : **à ne jamais utiliser comme seul porteur d'information**, son contraste
sur blanc ne passe pas le RGAA. Dans la maquette il est décoratif — le garder décoratif.

### La grille de fonctionnalités est refaite

La maquette n'est **qu'une exploration visuelle** : la charte est retenue, le contenu est
réaligné sur le brief. Sept tuiles promettaient des choses que la spécification produit
exclut explicitement — et deux d'entre elles contredisaient le moteur de matching.

Retirées, avec le motif :

| Tuile supprimée | Motif |
|---|---|
| Signature électronique | hors périmètre, « hors sujet » |
| Notation chantier | hors périmètre (RGPD) — et « la fiabilité pèse dans le score » casse le scoring en trois critères |
| Acompte rapide sous 24 h | service financier, jamais au programme |
| Contrat conforme généré | génération de contrat, jamais au programme |
| Suivi des heures / pointage | le suivi de missions est la *première* chose coupée en cas de retard |
| Coffre à documents | stockage de fichiers hors programme ; seule la relance J-30 est retenue, comme scénario n8n |
| Coefficient de facturation 1,92 | modèle de facturation, aucun système de paiement prévu |

Grille de remplacement — six tuiles, une par fonctionnalité réellement livrée et
démontrable en soutenance :

1. **Matching en deux temps** — filtre éliminatoire sur les certifications, puis score.
   Aucun profil non conforme ne remonte, même excellent par ailleurs.
2. **Certifications à date d'échéance** — comparées à la **date de fin de mission**, pas
   à la date du jour. Une habilitation qui expire pendant le chantier écarte le profil.
3. **Missions à proximité** — rayon de mobilité réglable par l'intérimaire, 50 km par défaut.
4. **Alerte avant expiration** — prévenu en amont, avec le nombre de missions ouvertes
   qu'un renouvellement débloquerait.
5. **Notification de mission correspondante** — dès qu'une mission publiée matche le profil.
6. **Fiche de poste enrichie** — intitulés normalisés, certifications typiques du métier et
   fourchette de rémunération locale, issus des données publiques France Travail.

La carte BTP apparaît sur le profil, dans un bloc séparé et jamais parmi les certifications
techniques : elle atteste d'une situation d'emploi, pas d'une compétence.

La carte de résultat de matching de la landing est reprise telle quelle au J8 — score à
gauche, intitulé + entreprise + distance au centre, taux horaire à droite — **augmentée du
détail par critère**, que la maquette n'affiche pas et que le sujet exige.

### Le dépôt de CV — décision révisée le 2026-09-17

**La décision de couper a été renversée.** Le retour d'intervenant après soutenance
blanche suggérait explicitement la lecture de CV, et l'équipe a tranché pour un
dépôt de CV servant à la fois au préremplissage **et** à la suggestion de missions.

Ce que ça implique, et qui doit être assumé devant le jury :

- **Le préremplissage ne pose pas de problème.** Le CV propose des métiers, des
  compétences et des types d'habilitation ; l'intérimaire valide ; seules des valeurs
  typées entrent en base. Le moteur ne voit jamais le texte.
- **Les certifications ne sont jamais appliquées automatiquement.** Un CV donne le
  type du titre, presque jamais son numéro, son organisme ni sa date d'échéance — or
  c'est cette date qui décide de l'éligibilité. Les détections ouvrent le formulaire,
  l'intérimaire complète ce qui compte.
- **La suggestion de missions depuis le texte** a été réglée le 2026-09-17, en
  relisant le cahier des charges de plus près. Il écrit : « … tout en évitant de se
  baser **seulement** sur des mots-clés extraits d'un CV. » Le mot « seulement »
  rend le produit conforme à sa propre description : le CV aide à découvrir et à
  saisir, il ne décide jamais. C'est le CLAUDE.md qui était plus strict que le
  document de rendu ; il a été aligné, pas l'inverse.

Garde-fou retenu dans le code : **chaque suggestion issue du CV porte le verdict du
vrai moteur** — conforme, habilitation manquante, ou métier non déclaré. Sans ça, un
intérimaire croirait pouvoir postuler à une mission dont il est écarté, c'est-à-dire
exactement la confusion que le produit existe pour supprimer.

Le fichier n'est jamais conservé : seul son texte l'est, chiffré, retirable, et
effacé avec le compte. Aucun service d'OCR ou d'analyse externe n'est appelé — un PDF
scanné sans couche texte est refusé avec une explication.

### Ce qui avait motivé la coupe initiale

L'écran d'inscription proposait « déposez votre CV, on remplit le profil ».

L'idée n'était pas indéfendable : le CV préremplit un formulaire, l'utilisateur valide
chaque élément, seules des valeurs typées entrent en base, et le moteur ne voit jamais le
CV — la maquette le disait elle-même (« le matching se fait sur vos qualifications réelles,
pas sur un CV envoyé au hasard »). C'est le même raisonnement que pour l'extraction de
certifications dans les descriptions d'offres (§1), et il tient.

Mais le coût n'est pas le même : parsing PDF/DOCX, extraction, écran de validation —
une journée pleine qui n'existe pas dans le calendrier, pour un gain que la suggestion de
certifications typiques du métier (§5) apporte déjà à un dixième du prix.

**Décision : retiré.** Le formulaire guidé est le parcours d'inscription unique — ce qui
sert aussi le RGAA, puisqu'un parcours unique se teste au clavier une seule fois. Si du
temps reste à J11, c'est le premier bonus à ajouter.

### Chiffres de la landing : faux, à recalculer

La landing affiche **10 338 offres BTP**, **45 % de missions**, **4 686 missions ouvertes**.
Mesuré le 2026-09-16 par `scan-domaines` : **54 158 offres, 29 672 missions, 55 %**.

L'écart est d'un facteur 5 à 6 — exactement le biais que le
[README de l'explo](../explo-api/README.md) attribue à la méthode par mots-clés, qu'il
déconseille explicitement. Les chiffres de la maquette viennent donc de la commande que
notre propre documentation dit de ne pas utiliser pour comparer des secteurs. Un jury qui
lit le README relève la contradiction.

À remplacer par les chiffres `scan-domaines`, **avec la date du relevé affichée** : le
nombre d'offres actives change tous les jours, un chiffre sans date n'est pas vérifiable.

Deux autres chiffres n'ont aucune source — « 48 h, délai type pour couvrir un besoin
urgent » et « 36 h, délai moyen pour pourvoir un poste » : à sourcer dans l'étude de
marché ou à retirer. Les trois témoignages signés (Karim B., Sophie L., Mehdi D.) sont
fictifs : à retirer ou à marquer comme illustratifs. Un faux témoignage sur une page
publique est un risque inutile pour zéro gain.

### Détail à aligner

La maquette écrit deux fois « haché avec **bcrypt** ». Le plan retient `scrypt` de
`node:crypto` (§2), parce que la bibliothèque standard ne laisse aucune prise à la question
« est-ce une librairie d'authentification ? ». bcrypt conviendrait aussi — c'est une
primitive de hachage, pas une solution d'authentification. Une fois tranché, **aligner le
texte de l'interface sur le code** : une mention fausse dans l'UI est un point perdu gratuitement.

---

## 7 bis. Ce que la base non relationnelle fait, et ce qu'elle ne fera pas

Le sujet cite « cache, logs de matching, recherche full-text » comme exemples
d'usage complémentaire. Redis en couvre **cinq** : sessions, limitation de
tentatives, cache de matching, traces de calcul, cache de géocodage — dont deux
figurent littéralement dans la parenthèse du sujet.

**La recherche full-text sur les CV est écartée, et c'est un choix**, pas un oubli.
Elle reviendrait à chercher des candidats par mots-clés extraits de leur CV,
c'est-à-dire exactement le contre-modèle que l'étude de marché oppose aux
concurrents : « les plateformes existantes traitent les certifications comme du
texte, nous les traitons comme des données avec une date de péremption ». L'ajouter
donnerait au jury une contradiction écrite dans notre propre document, pour un gain
nul — l'exigence étant déjà satisfaite deux fois.

## 7 ter. À reprendre dans le cahier des charges

Le document de rendu ne décrit plus exactement le produit. Trois points :

1. **Le dépôt de CV n'y figure pas.** Il est à ajouter au périmètre, avec la
   distinction qui le rend conforme : le CV propose, il ne décide pas. Le tableau de
   chiffrage doit recevoir la ligne correspondante.
2. **Le référentiel compte neuf types de certification**, pas cinq. Les quatre CACES
   de levage ont été ajoutés après mesure : un grutier relève du R487 ou du R490,
   presque jamais du R482. Sans eux, le produit ignorait ce métier.
3. **Le rayon de mobilité par défaut est de 50 km**, aligné sur le périmètre du CDI
   intérimaire que cite l'étude de marché.

---

## 8. Questions ouvertes

Aucune ne bloque le démarrage de J1.

1. **Date de soutenance ?** Le calendrier est en jours relatifs. Savoir si les 11 jours sont
   consécutifs ou étalés change l'ordre des coupes.
2. **Hors rayon de mobilité : score 0 ou exclusion ?** Proposition : score 0, profil visible
   en bas de liste — le rayon est un critère d'étape 2, pas un filtre. Bloque J7.
3. **Carte BTP : bloquante ou informative ?** Lecture retenue : affichée et signalée si
   expirée, mais n'écarte aucun profil, conformément à l'interdiction de la faire entrer
   dans le matching. À confirmer.
4. **Comptes Supabase et Upstash déjà créés ?** Si non, à faire avant J1 — paliers gratuits
   suffisants.
5. **n8n auto-hébergé ou n8n Cloud ?** Cloud suffit pour deux scénarios et évite un
   hébergement de plus à gérer le jour de la soutenance. Bloque J9.
6. **scrypt ou bcrypt ?** Proposition : `scrypt` (§2, §7).

### Tranchées

- ~~Grille de fonctionnalités de la landing~~ — refaite, six tuiles alignées sur le brief (§7).
- ~~Dépôt de CV~~ — retiré du POC, premier bonus si du temps reste à J11 (§7).

---

## 9. État du dépôt

```
explo-api/          exploration France Travail (client OAuth2 + CLI Commander + rapports)
                    -> réutilisé tel quel par le pipeline d'ingestion, pas réécrit
docs/
  plan-implementation.md      ce plan
  cahier-des-charges-g8.pdf   rendu Epitech : étude de marché, modules, chiffrage
  maquette/                   captures de l'exploration front
.claude/CLAUDE.md             spécification produit — NON versionnée (.gitignore)
```

La spécification produit est volontairement hors du dépôt. Les règles métier qu'elle porte
sont reprises ici : liste fermée et durées de validité des certifications (§3), carte BTP
hors matching (§3), filtre éliminatoire comparé à la date de fin de mission (§4), ordre de
coupe en cas de retard (§6).

L'application Next.js sera créée à J1. Arborescence cible à trancher à ce moment-là :
`app/` à la racine avec `explo-api/` en dossier frère, ou un vrai workspace npm — le second
n'a d'intérêt que si le pipeline doit importer du code applicatif (types partagés, accès base).
Il le devra probablement pour `ingest load` : **workspace npm recommandé**, décision à J1.
