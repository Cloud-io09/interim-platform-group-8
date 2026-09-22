# Conformité au sujet D-WEB-901 — état des lieux

*Établi le 2026-09-21. Chaque ligne est vérifiée dans le code ou par une exécution, jamais de mémoire. Ce qui n'est pas fait est écrit comme tel.*

Légende : **fait** · **partiel** — le nécessaire est là, il manque une pièce · **absent**

---

## Comptes et authentification

| Exigence | État | Où, et comment c'est vérifié |
|---|---|---|
| Deux types de comptes distincts, parcours et permissions différents | **fait** | `/inscription/interimaire` et `/inscription/entreprise` sont deux parcours. Les permissions sont vérifiées **côté serveur** par `exigerSession(role)` sur chaque page et chaque route, pas par masquage d'interface. Les vues ne sont plus partagées : deux groupes de routes, `(interimaire)` et `(entreprise)` |
| Hash des mots de passe | **fait** | `scrypt` de `node:crypto`, sel de 16 octets par compte, comparaison `timingSafeEqual`. `core/src/chiffrement.ts` |
| Gestion de session ou token | **fait** | Jetons opaques de 32 octets en Redis, cookie `httpOnly` + `sameSite=lax` + `secure` en production, TTL 7 jours glissant. Jamais de JWT : un jeton opaque se révoque immédiatement |
| Protection contre les attaques basiques | **fait** | Deux compteurs de tentatives (10 par e-mail, 100 par IP, fenêtre 15 min) ; hash factice sur adresse inconnue pour que le temps de réponse ne trahisse pas l'existence d'un compte ; message de refus identique dans les deux cas |
| Chiffrement des données sensibles **au repos** | **fait** | AES-256-GCM sur six colonnes. Démontré par `web/test/chiffrement-au-repos.test.ts`, qui relit la base hors de l'application. Un test refuse toute colonne ajoutée sans classification |
| Chiffrement **en transit** | **fait** | HTTPS par Vercel, HSTS. Les appels sortants (France Travail, BAN, Upstash, Brevo) sont tous en HTTPS |
| Vérification de l'adresse e-mail | **fait** | Lien envoyé dès l'inscription, renvoyable depuis l'espace. Tant que l'adresse n'est pas confirmée, **aucun lien de réinitialisation n'y part** |
| Changement d'adresse e-mail | **fait** | Mot de passe exigé, lien envoyé à la nouvelle adresse, avertissement à l'ancienne. Rien n'est écrit avant la confirmation |

**Parcours d'authentification complets** — au-delà de l'exigence : changement de mot de passe connecté, réinitialisation par lien envoyé à l'adresse du compte, codes de récupération en repli, vérification et changement d'adresse. Toute reprise en main ferme **toutes** les sessions.

**Pourquoi la vérification d'adresse était une faille, et pas un confort.** Depuis que le lien envoyé par courriel est le chemin principal de récupération, l'adresse saisie à l'inscription est devenue un facteur d'authentification. Qui s'inscrit avec « karim@gmial.com » — une coquille ordinaire — remet au propriétaire réel de cette boîte le moyen de réinitialiser son mot de passe, donc de prendre le compte.

**Le correctif est proportionné.** La vérification ne bloque ni l'inscription, ni la connexion, ni la moindre fonctionnalité : le public visé abandonnerait au premier obstacle, et une configuration d'envoi défaillante enfermerait tout le monde dehors. Elle conditionne une seule chose — l'envoi d'un lien de réinitialisation — soit exactement la surface de la faille. Les codes de récupération restent utilisables quelle que soit l'adresse, donc personne n'est sans recours. Le refus est silencieux : l'endpoint répond mot pour mot comme pour une adresse confirmée, sans quoi il deviendrait un moyen de savoir quels comptes ont confirmé la leur.

**Nos propres outils n'envoient toujours rien.** Une inscription déclenche désormais un courriel, et l'essai de fumée comme le parcours de bout en bout créent des comptes à chaque exécution. La couche d'envoi reconnaît les domaines que la **RFC 2606** réserve — `.test`, `.invalid`, `.example` — et journalise au lieu de transmettre. Sans ce filtre, chaque exécution produirait des rebonds durs, qui abîment durablement la réputation d'expéditeur. Vérifié le 2026-09-21 contre un serveur où Brevo *était* configuré : six messages journalisés, zéro transmis.

---

## Gestion des missions et matching

| Exigence | État | Détail |
|---|---|---|
| Création de mission : poste, dates, lieu, compétences requises, rémunération | **fait** | Les cinq champs existent. Le formulaire se préremplit depuis les offres publiques du métier |
| Profil intérimaire : compétences, disponibilités, zone géographique, expérience | **fait** | Les quatre existent. L'expérience est rendue **sur deux plans** : déclarée par métier, et **constatée** — missions réellement effectuées via la plateforme, avec leurs jours et leurs employeurs |
| Algorithme de matching avec scoring | **fait** | Deux étapes séquentielles : filtre éliminatoire sur les habilitations, puis scoring sur compétences (0,40), distance (0,35), disponibilité (0,25). Le score est exposé **par critère** |
| Tableau de bord de suivi : ouverte, pourvue, terminée | **fait** | Quatre états : brouillon, publiée, pourvue, close, avec les transitions permises en table |

**La règle centrale**, vérifiée par un test de mutation : la validité d'une habilitation est comparée à la **date de fin de mission**, jamais à la date du jour. `core/src/matching.ts` ne contient aucun `Date.now()`.

**Deux expériences, jamais confondues.** Le produit repose sur une distinction : une date d'échéance est un fait, un mot-clé de CV une affirmation. Elle vaut ici aussi. « Huit ans en maçonnerie » est utile et invérifiable ; « 2 missions, 38 jours travaillés, pour 1 entreprise » est établi par la plateforme elle-même, à partir des candidatures acceptées sur des chantiers terminés. Les additionner donnerait une ancienneté qui n'existe nulle part : elles sont montrées côte à côte, chacune étiquetée.

**L'expérience n'entre pas dans le score, et c'est délibéré.** Le sujet nomme lui-même les trois critères de scoring — compétences, zone, disponibilité — et l'éligibilité vient des habilitations datées, jamais de l'ancienneté déclarée. Elle est montrée à l'entreprise qui décide ; elle ne décide pas à sa place. La fiche profil le dit explicitement, sans quoi on supposerait qu'elle a pesé dans le classement.

---

## Données publiques

| Exigence | État | Détail |
|---|---|---|
| Consommer au moins une source publique | **fait** | API France Travail « Offres d'emploi v2 », OAuth2 `client_credentials` |
| Nettoyage : normalisation des libellés, dédoublonnage, conversion de formats | **fait** | Dédoublonnage sur l'identifiant d'offre ; intitulés normalisés contre le référentiel des appellations ; rémunérations converties en taux horaire depuis des formulations libres (687/687 sur les offres réelles) ; lieux résolus en coordonnées |
| Alimenter une fonctionnalité concrète et visible | **fait** | **Fiche de poste enrichie** : à la création d'une mission, intitulé normalisé, habilitations typiques du métier, fourchette de rémunération observée localement. Et le classement des compétences du profil par fréquence réelle dans les offres du métier |
| Script de nettoyage versionné | **fait** | `ingest/`, CLI `commander` |

---

## Automatisations nocode

| Exigence | État | Détail |
|---|---|---|
| Deux automatisations réalistes | **fait** | **Trois**, montées et exécutées. Cinq nœuds chacune : déclencheur, appel API, éclatement, filtre, envoi. Un flux lancé sur une fenêtre vide montre que le nœud Discord n'est pas exécuté quand il n'y a rien à notifier |
| Canal webhook plutôt qu'e-mail ou SMS | **fait** | Discord, **un salon privé par personne** |
| Export des scénarios livré | **fait** | [`n8n/`](n8n/) — réimportés tels quels pour vérifier qu'ils s'importent, et exempts de secret, d'URL de webhook et d'adresse locale |

**Vérifié en production le 2026-09-21** : les deux endpoints répondent `200` avec le secret, `401` sans. `SECRET_N8N` est bien posée sur Vercel.

**Le troisième flux existe parce que l'entreprise ne recevait rien.** Les deux premiers ne parcourent que des intérimaires : une entreprise qui rattachait son Discord obtenait un salon où rien n'arriverait jamais, et lisait un message d'accueil lui promettant « vos habilitations qui approchent de leur échéance » — elle n'en a aucune. La relance des missions non pourvues est l'un des exemples que le sujet cite lui-même, et elle dit **quoi faire** : combien de profils conformes restent à solliciter, ou qu'il n'y en a aucun et qu'il faut élargir le rayon. Les mouvements de candidature, eux, sont relayés directement par l'application — ce sont des événements, attendre le passage d'un automate pour les annoncer n'aurait aucun sens.

**Chaque destinataire a son salon, et c'est une correction, pas un ornement.** La première version postait vers une URL de webhook unique : tout le monde lisait les alertes de tout le monde. Or une alerte d'échéance nomme la personne, son habilitation et sa date d'expiration — la diffuser à tous les membres d'un serveur est un défaut de confidentialité. Un webhook ne sait qu'écrire dans le salon auquel il est attaché ; créer un salon et le restreindre à quelqu'un relève de l'API du serveur, donc d'un bot. C'est la seule voie, pas un choix d'architecture.

**Le rattachement ne compare aucune adresse e-mail.** Il repose sur la simultanéité : la même personne tient une session Intérimatch ouverte *et* autorise sur Discord dans le même aller-retour OAuth, lié par un état à usage unique rangé en Redis. On demande à Discord l'identifiant et le droit d'ajouter au serveur — ni l'adresse, ni les messages, ni les serveurs fréquentés. Une adresse Discord n'a donc pas à être celle du compte Intérimatch.

**Ce n'est pas une connexion tierce au sens du sujet.** Aucun compte ne se crée par ce chemin et personne ne s'authentifie avec Discord : la session doit déjà être ouverte. L'OAuth ne sert qu'à établir, une fois, à qui appartient quel identifiant — et il s'appuie sur le protocole du fournisseur, comme le sujet l'autorise.

---

## Accessibilité, éco-conception, conformité

| Exigence | État | Détail |
|---|---|---|
| RGAA 4.1, principes de base | **fait** | Suite d'audit automatisée : un seul `h1` par page, pas de saut de niveau, étiquettes associées, alternatives textuelles, repères de navigation, contrastes calculés. Cibles tactiles à 44 px. L'état d'une habilitation reste lisible **sans percevoir les couleurs** — libellé écrit et symbole de forme distincte |
| RGESN, deux pratiques documentées | **fait** | Cinq, chacune mesurée : [ecoconception.md](ecoconception.md) |
| RGPD : base légale, conservation, mentions légales | **fait** | `/confidentialite`, `/mentions-legales`, et la cartographie du traitement dans [donnees-personnelles.md](donnees-personnelles.md) |
| Code du travail : durée maximale | **fait** | 18 mois renouvellements compris (L1251-12), opposée à la saisie avec la date limite calculée, testée aux bornes |
| Code du travail : mentions obligatoires du contrat | **fait** | Document de mission portant poste, qualification, terme, lieu, horaires, rémunération — et nommant celles qui manquent |
| Achat responsable / réemploi | **absent** | Conditionnel dans le sujet (« si pertinent »). Piste à écrire : la plateforme sait qui travaille où et quand, ce qui la placerait bien pour mutualiser des EPI entre intérimaires d'un même chantier. Un paragraphe suffit |

---

## Référencement

| Exigence | État |
|---|---|
| Balises meta sur les pages publiques | **fait** |
| Un seul `h1`, hiérarchie logique | **fait** — vérifié par la suite d'accessibilité |
| URLs lisibles | **fait** |
| Sitemap minimal | **fait** — `sitemap.xml` et `robots.txt` générés |

---

## Contraintes techniques

| Exigence | État | Détail |
|---|---|---|
| Frontend : framework JS en TypeScript, responsive | **fait** | Next.js 16, TypeScript strict. Vérifié en capture réelle à 1280 px et 390 px |
| Backend : framework Node en TypeScript | **fait** | Routes Next.js en TypeScript |
| Base relationnelle | **fait** | PostgreSQL / Supabase, 21 tables, 14 migrations |
| Base non relationnelle, usage complémentaire | **fait** | Redis : sessions, limitation de tentatives, cache de matching, traces de calcul, cache de géocodage, jetons à usage unique |
| Tests unitaires | **fait** | 374 dans `core` |
| Tests fonctionnels sur inscription, création de mission, matching | **fait** | 199 dans `web`, contre un vrai serveur en HTTP |
| Coverage généré et transmis | **partiel** | `npm run coverage` produit le rapport de `core` (96,8 %). `web` n'en a **délibérément pas** : ses tests s'exécutent dans un autre processus, le rapport afficherait 0 % sur chaque fichier et serait trompeur. L'écart est chiffré autrement — 39 des 42 routes d'API traversées — dans [tests-et-couverture.md](tests-et-couverture.md) |
| Au moins une bibliothèque CLI | **fait** | `commander`, dans `ingest/` |
| Authentification classique écrite soi-même | **fait** | Aucune librairie d'authentification, aucune solution managée. Supabase n'est qu'une base de données |
| OAuth par librairie **si** connexion tierce proposée | **sans objet** | Aucune connexion tierce n'est proposée. Décision et justification dans le `CLAUDE.md` |

---

## Livrables

| Livrable | État |
|---|---|
| Cahier des charges | **fait** — `docs/cahier-des-charges-g8.pdf` |
| Dépôt avec README : installation et lancement | **fait** — [README.md](../README.md) |
| Export ou capture des scénarios n8n | **absent** |
| Script de nettoyage des données publiques | **fait** — `ingest/` |
| Dossier d'étude de marché | **absent** |
| Chiffrage réel : temps par fonctionnalité, écart contre l'estimé | **absent** |
| Support de pitch | **absent** |

---

## Ce qui reste, par ordre d'urgence

1. **Le chiffrage réel.** Il ne se reconstitue pas le dernier jour : l'écart entre estimé et réalisé est précisément ce qui est évalué. À démarrer maintenant, même grossièrement.
2. **Étude de marché et support de pitch.** Hors code.
3. **Un paragraphe sur le réemploi d'EPI.** Conditionnel, et peu coûteux.
