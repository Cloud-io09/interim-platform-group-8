# Ce qui est implémenté, exigence par exigence

*Synthèse technique structurée sur le sujet D-WEB-901. Chaque chiffre a été mesuré le
22 septembre 2026, pas reconstitué de mémoire : 374 tests `core` (couverture 96,8 %),
199 tests `web`, 14 migrations, 21 tables, 42 routes d'API.*

---

## 1. Comptes et authentification

| Exigence | Techno | Ce que ça fait |
|---|---|---|
| Deux types de comptes | Next.js *route groups* `(interimaire)` / `(entreprise)` | Deux parcours d'inscription, deux espaces, deux jeux d'onglets. Les permissions sont vérifiées **côté serveur** à chaque page et route (`exigerSession(role)`), jamais par masquage d'interface |
| Hash des mots de passe | `scrypt` de `node:crypto` | Sel de 16 octets par compte, comparaison `timingSafeEqual`. Aucune librairie d'authentification |
| Sessions | Jetons opaques de 32 octets en **Redis** | Cookie `httpOnly` + `sameSite=lax` + `secure`, TTL 7 jours glissant. Pas de JWT : un jeton opaque se révoque **immédiatement** |
| Attaques basiques | Compteurs à expiration Redis | 10 tentatives par e-mail, 100 par IP, fenêtre 15 min. Hash factice sur adresse inconnue pour que le **temps de réponse** ne trahisse pas l'existence d'un compte |
| Chiffrement au repos | **AES-256-GCM**, enveloppe `iv.tag.chiffré` | Six colonnes : téléphone, adresse, n° de carte BTP, n° d'habilitation, texte de CV. Prouvé par un test qui **relit la base hors de l'application** |
| Chiffrement en transit | HTTPS Vercel + HSTS | Tous les appels sortants (France Travail, BAN, Upstash, Brevo, Discord) en HTTPS |

**Au-delà de l'exigence** : vérification de l'adresse e-mail, changement d'adresse,
réinitialisation par lien, codes de récupération en repli. Toute reprise en main ferme
**toutes** les sessions.

**Un test de classification** refuse toute colonne ajoutée sans décision explicite
« chiffrée ou en clair, et pourquoi ». Il a attrapé deux ajouts pendant le
développement.

---

## 2. Gestion des missions et matching

| Exigence | Techno | Ce que ça fait |
|---|---|---|
| Création de mission | Formulaire prérempli depuis les offres publiques | Poste, dates, lieu, habilitations exigées, rémunération. **Contrôle légal** : 18 mois maximum (L1251-12), refus citant l'article **et donnant la date limite** |
| Profil intérimaire | 52 métiers ROME, compétences classées par fréquence réelle | Compétences, disponibilités, commune géocodée, rayon de mobilité (50 km par défaut), expérience **déclarée** *et* **constatée** |
| Algorithme de matching | Fonctions pures dans `core/`, testées unitairement | **Deux étapes jamais fusionnées** : filtre éliminatoire sur les habilitations, puis scoring compétences 0,40 / distance 0,35 / disponibilité 0,25, exposé **par critère** |
| Tableau de bord | Quatre états, transitions en table | brouillon → publiée → pourvue → close |

**La règle centrale**, vérifiée par un test de mutation : la validité d'une
habilitation est comparée à la **date de fin de mission**, jamais à la date du jour.
`core/src/matching.ts` ne contient aucun `Date.now()`. Une affectation non conforme
engage la responsabilité pénale de l'entreprise utilisatrice.

**Deux expériences, jamais confondues.** « Huit ans en maçonnerie » est déclaratif et
invérifiable ; « 2 missions, 38 jours travaillés » est établi par la plateforme à
partir des candidatures acceptées sur des chantiers terminés. Montrées côte à côte,
étiquetées, et **ni l'une ni l'autre n'entre dans le score**.

---

## 3. Données publiques

| Exigence | Détail |
|---|---|
| Source publique | API France Travail « Offres d'emploi v2 », OAuth2 `client_credentials`, scope `o2dsoffre api_offresdemploiv2` |
| Nettoyage | Dédoublonnage sur l'identifiant d'offre ; intitulés normalisés contre le référentiel des appellations ; rémunérations converties en taux horaire depuis des formulations libres (687/687) ; lieux résolus en coordonnées |
| Fonctionnalité alimentée | **Fiche de poste enrichie** — à la création d'une mission : intitulé normalisé, habilitations typiques du métier, **fourchette de rémunération observée localement** (médiane 13,50 €/h sur 333 offres réelles) |
| Script versionné | `ingest/`, CLI `commander` |

Second usage : le classement des compétences proposées au profil, par fréquence réelle
dans les offres du métier déclaré.

---

## 4. Automatisations nocode

**Trois flux n8n**, tous en cinq nœuds : déclencheur → appel API → éclatement →
**filtre** → envoi Discord.

| Flux | Destinataire | Ce qu'il dit |
|---|---|---|
| Alerte avant expiration | intérimaire | « Votre CACES expire dans 23 jours. Le renouveler rouvrirait **4 missions** actuellement ouvertes » |
| Mission correspondante | intérimaire | Distance et compatibilité calculées |
| Relance des missions non pourvues | **entreprise** | « 3 profils conformes que vous n'avez pas encore sollicités » — ou qu'il n'y en a aucun, et quoi changer |

Le sujet en demande deux ; le troisième reprend son propre exemple et répare une
asymétrie — sans lui, une entreprise qui rattachait son Discord obtenait un salon où
rien n'arrivait jamais.

**Chaque destinataire a son salon privé**, créé par un bot Discord (`Manage Channels`),
rattaché par OAuth2. **Aucune adresse e-mail n'est comparée** : la preuve tient à la
simultanéité — la même personne tient une session ouverte ici *et* autorise là-bas dans
le même aller-retour. Le nœud filtre écarte qui n'a rien relié ; sans lui l'appel
partirait vers `/channels/null/messages`.

**Pourquoi Discord et pas l'e-mail** : le sujet le recommande explicitement
(délivrabilité, vérification de numéro, coûts).

---

## 5. Accessibilité, éco-conception, conformité

| Exigence | Comment |
|---|---|
| RGAA 4.1 | Suite automatisée sur 17 pages : un seul `h1`, pas de saut de niveau, étiquettes associées, alternatives textuelles, repères de navigation, **contrastes calculés**. Cibles tactiles à 44 px — public d'ouvriers, souvent gantés. L'état d'une habilitation reste lisible **sans percevoir les couleurs** : libellé écrit et symbole de forme distincte |
| RGESN | **Cinq** pratiques appliquées et mesurées, documentées dans `ecoconception.md` |
| RGPD | `/confidentialite`, `/mentions-legales`, cartographie du traitement dans `donnees-personnelles.md`. Base légale distincte pour Discord (consentement, 6.1.a), retirable **sans mot de passe** — un consentement doit se retirer aussi facilement qu'il se donne |
| Code du travail — durée | 18 mois renouvellements compris (L1251-12), opposée à la saisie avec la date limite calculée, testée aux bornes |
| Code du travail — mentions | Document de mission portant poste, qualification, terme, lieu, horaires, rémunération — et **nommant celles qui manquent** |
| SEO on-page | Meta `title` / `description`, `h1` unique, hiérarchie logique, URLs lisibles, `sitemap.xml` et `robots.txt` générés |
| Achat responsable / réemploi | **Absent** — conditionnel dans le sujet (« si pertinent »). Piste écrite : la plateforme sait qui travaille où et quand, ce qui la placerait bien pour mutualiser des EPI entre intérimaires d'un même chantier |

---

## 6. Contraintes techniques

| Exigence | Techno |
|---|---|
| Frontend | **Next.js 16.3.5** + React 19.2.8, TypeScript strict. Responsive vérifié en capture réelle à 1280 px et 390 px |
| Backend | Routes Next.js en TypeScript |
| Base relationnelle | **PostgreSQL / Supabase**, 21 tables, 14 migrations, 42 routes d'API |
| Base non relationnelle | **Redis / Upstash**, huit usages : sessions, index de révocation, limitation de tentatives, jetons à usage unique, état OAuth, cache de matching, **traces de matching**, cache de géocodage |
| Tests unitaires | **374** dans `core` |
| Tests fonctionnels | **199** dans `web`, contre un vrai serveur démarré en HTTP |
| Coverage | **96,8 %** sur `core`. Pas de rapport pour `web`, délibérément : ses tests s'exécutent dans un autre processus, le rapport afficherait 0 % sur chaque fichier et serait plus trompeur que son absence. L'écart est chiffré autrement — 39 des 42 routes traversées |
| CLI | **`commander`** dans `ingest/` — six commandes : `seed-metiers`, `fetch`, `clean`, `load`, `stats`, `demo` |
| Auth écrite soi-même | Aucune librairie d'authentification, aucune solution managée. Supabase n'est **qu'une base de données** |
| OAuth par librairie | Sans objet pour la connexion : aucune identification tierce n'est proposée. OAuth2 n'est utilisé que pour **rattacher un compte Discord**, jamais pour s'authentifier |

---

## Ce qui reste

1. **Le chiffrage réel** — écart entre estimé et réalisé. C'est précisément ce qui est
   évalué, et il ne se reconstitue pas le dernier jour.
2. **Étude de marché et support de pitch.** Hors code.
3. **Un paragraphe sur le réemploi d'EPI.** Conditionnel, et peu coûteux.
