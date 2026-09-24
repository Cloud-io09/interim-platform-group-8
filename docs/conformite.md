# Conformité au sujet D-WEB-901

État de chaque exigence, avec l'endroit où elle se vérifie. Relevé le 24 septembre 2026.

**Fait** : livré et vérifié. **Partiel** : livré avec une réserve explicite.
**Absent** : non livré.

## Sommaire

1. [Comptes et authentification](#comptes-et-authentification)
2. [Missions et matching](#missions-et-matching)
3. [Données publiques](#données-publiques)
4. [Automatisations](#automatisations)
5. [Accessibilité, éco-conception, conformité légale](#accessibilité-éco-conception-conformité-légale)
6. [Référencement](#référencement)
7. [Contraintes techniques](#contraintes-techniques)
8. [Livrables](#livrables)

---

## Comptes et authentification

| Exigence | État | Preuve |
|---|---|---|
| Deux types de comptes, parcours et permissions distincts | Fait | Groupes de routes `(entreprise)` et `(interimaire)` ; rôle vérifié côté serveur sur chaque page et route |
| Hachage des mots de passe | Fait | `scrypt`, sel par compte. [Sécurité](securite-et-donnees.md#authentification) |
| Sessions ou jetons | Fait | Jetons opaques en Redis, révocables. [D13](decisions.md#d13-jetons-opaques-plutôt-que-jwt) |
| Protection contre les attaques basiques | Fait | Limitation par adresse et par IP, anti-énumération, en-têtes de sécurité. [Protections](securite-et-donnees.md#protections) |
| Chiffrement au repos | Fait | AES-256-GCM sur six colonnes, prouvé par `web/test/chiffrement-au-repos.test.ts` |
| Chiffrement en transit | Fait | HTTPS partout, HSTS |
| Authentification écrite par l'équipe | Fait | Aucune bibliothèque d'authentification. [D12](decisions.md#d12-authentification-écrite-à-la-main) |
| OAuth par bibliothèque si connexion tierce | Sans objet | Aucune connexion tierce. OAuth2 ne sert qu'à relier un compte Discord, session déjà ouverte |

Au-delà du sujet : vérification et changement d'adresse, réinitialisation par lien,
codes de récupération.

---

## Missions et matching

| Exigence | État | Preuve |
|---|---|---|
| Création de mission : poste, dates, lieu, compétences, rémunération | Fait | Formulaire prérempli par les données publiques ; modification possible après publication |
| Profil intérimaire : compétences, disponibilités, zone, expérience | Fait | Expérience déclarée par métier et expérience constatée (missions terminées), montrées séparément |
| Algorithme de matching avec score | Fait | Filtre éliminatoire puis score par critère. [Moteur](architecture.md#moteur-de-matching) |
| Tableau de bord de suivi | Fait | Missions brouillon, publiée, pourvue, close ; candidatures par état, des deux côtés |

Règle centrale : la validité d'une habilitation est comparée à la **date de fin de
mission**, vérifiée par un test de mutation.

---

## Données publiques

| Exigence | État | Preuve |
|---|---|---|
| Consommer une source publique | Fait | API France Travail « Offres d'emploi v2 », 1 762 offres chargées |
| Nettoyer : libellés, doublons, formats | Fait | [Ingestion](architecture.md#ingestion-france-travail) |
| Alimenter une fonctionnalité visible | Fait | Fiche de poste enrichie ; classement des compétences du profil |
| Script versionné | Fait | `ingest/`, CLI `commander` |

---

## Automatisations

| Exigence | État | Preuve |
|---|---|---|
| Deux automatisations réalistes | Fait | Trois flux n8n. [Flux](architecture.md#flux-n8n) |
| Canal webhook plutôt que courriel ou SMS | Fait | Discord, un salon privé par personne. [D18](decisions.md#d18-discord-par-un-bot-un-salon-par-personne) |
| Export des scénarios | Fait | `docs/n8n/*.json`, sans secret |

---

## Accessibilité, éco-conception, conformité légale

| Exigence | État | Preuve |
|---|---|---|
| RGAA 4.1, principes de base | Fait | Suite automatisée sur 22 pages. [Accessibilité](qualite.md#accessibilité-rgaa) |
| RGESN, au moins deux pratiques documentées | Fait | Cinq pratiques mesurées. [Éco-conception](qualite.md#éco-conception-rgesn) |
| RGPD : base légale, conservation, mentions | Fait | `/confidentialite`, `/mentions-legales`. [Données](securite-et-donnees.md#classification-des-données) |
| Durée maximale de mission | Fait | 18 mois renouvellements compris (art. L1251-12), refus avec la date limite |
| Mentions obligatoires du contrat | Fait | Document de mission : poste, qualification, terme, lieu, horaires, rémunération, et la liste de ce qui manque |
| Achat responsable, réemploi | Partiel | Piste argumentée, non livrée. [Réemploi d'EPI](qualite.md#réemploi-depi) |

---

## Référencement

| Exigence | État | Preuve |
|---|---|---|
| Balises meta sur les pages publiques | Fait | `web/test/pages-publiques.test.ts` |
| Un seul `h1`, hiérarchie logique | Fait | Suite d'accessibilité |
| URLs lisibles | Fait | |
| Sitemap | Fait | `sitemap.xml` et `robots.txt` générés ; espaces connectés exclus |

---

## Contraintes techniques

| Exigence | État | Preuve |
|---|---|---|
| Frontend JS en TypeScript, responsive | Fait | Next.js 16, React 19, TypeScript strict ; vérifié à 1280 et 390 px |
| Backend Node en TypeScript | Fait | Routes d'API Next.js |
| Base relationnelle | Fait | PostgreSQL : 22 tables, 15 migrations |
| Base non relationnelle complémentaire | Fait | Redis, dix usages. [Détail](architecture.md#base-non-relationnelle) |
| Tests unitaires | Fait | 374 dans `core` |
| Tests fonctionnels : inscription, mission, matching | Fait | 226 dans `web`, contre un serveur réel |
| Rapport de couverture | Partiel | `core` : 96,8 % des instructions. Pas de rapport pour `web`, délibérément. [D20](decisions.md#d20-pas-de-rapport-de-couverture-pour-web) |
| Bibliothèque en ligne de commande | Fait | `commander` dans `ingest/` |

---

## Livrables

| Livrable | État |
|---|---|
| Cahier des charges | Fait : `docs/cahier-des-charges-g8.pdf` |
| Dépôt avec README d'installation et de lancement | Fait |
| Export des scénarios n8n | Fait : `docs/n8n/` |
| Script de nettoyage des données publiques | Fait : `ingest/` |
| Dossier d'étude de marché | Partiel : volumes par domaine dans le cahier des charges ; pas de dossier dédié dans le dépôt |
| Chiffrage réel, écart avec l'estimé | Absent du dépôt |
| Support de pitch | Absent du dépôt |
