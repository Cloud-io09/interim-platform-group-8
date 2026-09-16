# InterimMatch BTP

Plateforme de mise en relation entre entreprises du BTP et intérimaires.
Projet scolaire Epitech, POC de 11 jours.

---

## Le principe directeur

**Les certifications de chantier sont des données avec une date de péremption, jamais du texte libre.**

Les plateformes concurrentes rapprochent des mots-clés extraits de CV. Ici, une certification est un objet structuré dont la date d'échéance décide si un profil peut aller sur le chantier ou non.

Toute implémentation qui stocke une certification sous forme de chaîne libre, ou qui fait du rapprochement sémantique sur un CV, est un échec fonctionnel — pas un raccourci acceptable.

**Le produit ne vérifie pas l'authenticité des certifications.** Aucun registre national n'est interrogeable : chaque organisme testeur fournit son propre outil de vérification. On structure la déclaration, on contrôle la validité des dates, et on renvoie l'utilisateur vers l'outil de l'organisme émetteur.

---

## Stack

| | |
|---|---|
| Hébergement | Vercel |
| Base relationnelle | Supabase (PostgreSQL) |
| Base non relationnelle | Redis — cache, sessions, rate limiting, traces de matching |
| Frontend | Libre — framework JS en TypeScript, responsive mobile / tablette / desktop |
| Backend | Libre — framework Node en TypeScript |
| Géocodage | Libre — nécessaire au calcul de distance |

**Pourquoi une seconde base.** Le sujet impose explicitement une base relationnelle **et** une base non relationnelle pour un usage complémentaire. Une colonne JSONB dans PostgreSQL ne satisfait pas cette exigence : il faut un second stockage réel. Redis couvre quatre usages :

- **Cache des résultats de matching** — un calcul parcourt tous les profils ; le recalculer à chaque affichage du tableau de bord est inutile. Mise en cache avec TTL, invalidée quand la mission ou un profil concerné change.
- **Sessions** — l'authentification étant faite maison, les sessions y sont stockées plutôt qu'en table relationnelle.
- **Limitation des tentatives de connexion** — compteur à expiration par IP et par email. C'est la réponse à l'exigence de « protection contre les attaques basiques » du sujet.
- **Traces d'exclusion du matching** — motif par profil écarté, avec TTL court. Suffisant pour expliquer un résultat en démonstration.

---

## Contraintes imposées par le sujet

- **L'authentification email/mot de passe est implémentée à la main** : hash, gestion de session ou token, protection contre les attaques basiques. Pas de librairie d'authentification clé en main, pas de solution managée. Si un fournisseur OAuth tiers est ajouté, il s'appuie sur une librairie existante — mais il n'est pas demandé.
- Chiffrement des données sensibles au repos et en transit.
- Deux types de comptes distincts, entreprise et intérimaire, avec des parcours d'inscription et des permissions différentes.
- Tests unitaires et fonctionnels sur les parcours critiques — inscription, création de mission, matching — avec rapport de coverage généré.
- Au moins une bibliothèque en ligne de commande dans la chaîne de traitement des données.

---

## Règles métier

### Certifications

Une certification porte obligatoirement : un type issu d'une liste fermée, une catégorie quand le type l'exige, l'organisme émetteur, un numéro, une date d'obtention et une date d'échéance.

Durées de validité réelles, à respecter :

| Type | Validité | Catégorie |
|---|---|---|
| CACES R482 — engins de chantier | 10 ans | oui, A à G |
| AIPR — intervention près des réseaux | 5 ans | non |
| Habilitation électrique (B0, H0, B1, B2, BR…) | 3 ans | oui |
| Amiante sous-section 4 | 3 ans | non |
| SST — sauveteur secouriste du travail | 2 ans | non |

Le POC peut se limiter à quatre ou cinq types. La liste reste fermée, jamais saisie librement.

### Carte BTP

Obligatoire sur chantier, mais **elle n'atteste d'aucune compétence** : elle documente une situation d'emploi régulière. Elle ne doit jamais figurer parmi les certifications techniques ni entrer dans le calcul de matching. Champ séparé, présentation séparée.

### Rayon de mobilité

Paramétrable par l'intérimaire, jamais codé en dur. Valeur par défaut : 40 km, alignée sur le plafond conventionnel du CDI intérimaire.

### Référentiel métiers

Limité aux métiers de terrain : gros œuvre, second œuvre, engins de chantier, montage de structures. Les postes de conception et d'encadrement — ingénieur, conducteur de travaux — sont hors périmètre : ils recourent peu à l'intérim et sortent du positionnement produit.

---

## Moteur de matching

Deux étapes strictement séquentielles, à ne jamais fusionner en un score unique.

**Étape 1 — filtre éliminatoire.** Un profil est écarté, sans score, si une certification requise par la mission est absente, ou présente mais expirée.

**La comparaison se fait contre la date de fin de mission, pas contre la date du jour.** Une certification valide aujourd'hui mais qui expire pendant une mission de trois semaines doit exclure le profil. C'est la règle la plus importante du produit : une affectation non conforme engage la responsabilité pénale de l'entreprise utilisatrice. Un `date_echeance < now()` est un bug, pas une simplification.

**Étape 2 — scoring**, sur les seuls profils survivants : compétences communes, distance rapportée au rayon de mobilité, chevauchement des disponibilités avec les dates de mission. Le score doit être exposé par critère, pas seulement en total — on doit pouvoir expliquer un résultat en soutenance.

**Traçabilité.** Chaque calcul laisse une trace en Redis : profils évalués, profils écartés avec leur motif, scores détaillés. TTL court, l'objectif n'est pas l'archivage mais de pouvoir répondre à la question « pourquoi ce profil n'apparaît-il pas ? » — en usage comme en démonstration.

---

## Ingestion France Travail

Un client OAuth2 et un CLI existent déjà dans `interimatch-secteur-scan` — à réutiliser, pas à réécrire. Points d'attention de l'API : flux `client_credentials`, scope `o2dsoffre api_offresdemploiv2`, le total de résultats vient de l'en-tête `Content-Range` et non de la longueur du tableau, le statut 206 est une réponse normale en pagination, throttle nécessaire.

Les données doivent être nettoyées et normalisées — libellés de poste, dédoublonnage, formats de dates et de lieux — puis alimenter une fonctionnalité visible du produit. Un affichage brut à titre de démonstration ne satisfait pas l'exigence.

Fonctionnalité alimentée : **fiche de poste enrichie**. À la création d'une mission, les données nettoyées pré-remplissent le formulaire : intitulés normalisés, certifications typiques du métier, fourchette de rémunération observée localement.

---

## Automatisations n8n

Deux scénarios, via webhook Discord ou Slack — pas d'email ni de SMS, pour éviter les questions de délivrabilité et de coût.

1. **Alerte avant expiration d'une certification**, envoyée à l'intérimaire, accompagnée du nombre de missions ouvertes qu'un renouvellement lui ouvrirait. L'information doit être actionnable, pas administrative.
2. **Notification de mission correspondante** quand une mission publiée matche le profil.

---

## Conformité

**RGAA** — contrastes, textes alternatifs, navigation clavier, structure sémantique. Le public cible est composé d'ouvriers du bâtiment : formulaires guidés, vocabulaire simple, cibles tactiles larges.

**RGESN** — au moins deux pratiques appliquées et documentées : compression d'images, lazy loading, réduction des requêtes.

**RGPD** — base légale du traitement, durée de conservation annoncée, mentions légales.

**SEO on-page** sur les pages publiques (accueil, annonces de missions) — balises meta, un seul `h1` par page, hiérarchie de titres logique, URLs lisibles, sitemap minimal.

---

## Hors périmètre

| | Pourquoi |
|---|---|
| Vérification authentifiée des certifications | Aucun registre national interrogeable |
| Matching sémantique sur CV | Contredit frontalement le positionnement |
| Agent conversationnel IA | Hors budget ; l'accompagnement passe par un formulaire guidé |
| Chat entreprise ↔ intérimaire | Ne conditionne aucune autre fonctionnalité |
| Notation des intérimaires | Sensible au regard du RGPD |
| Signature électronique | Hors sujet |

---

## En cas de retard

Couper dans cet ordre : suivi de missions réduit à une liste simple sans statistiques ; référentiel de certifications limité à quatre types ; scoring ramené à deux critères.

**Jamais** : le filtre éliminatoire sur certification expirée, l'authentification faite maison, les deux automatisations n8n, le coverage.

