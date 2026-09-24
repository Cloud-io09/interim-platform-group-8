# Sécurité et données personnelles

Ce document décrit l'authentification, les protections en place, le chiffrement et le
traitement des données personnelles. Les motifs des choix sont dans
[decisions.md](decisions.md#sécurité).

## Sommaire

1. [Authentification](#authentification)
2. [Protections](#protections)
3. [Chiffrement](#chiffrement)
4. [Classification des données](#classification-des-données)
5. [Conservation et suppression](#conservation-et-suppression)
6. [Données transmises à Discord](#données-transmises-à-discord)
7. [Base légale](#base-légale)
8. [Limites connues](#limites-connues)

---

## Authentification

Écrite dans le projet, sans bibliothèque d'authentification ni service managé.
Code : `core/src/auth.ts`, `core/src/jetons.ts`, `core/src/recuperation.ts`,
`web/lib/garde.ts`.

| Élément | Mise en œuvre |
|---|---|
| Mot de passe | `scrypt` (`node:crypto`), sel aléatoire de 16 octets par compte. Longueur minimale imposée à la saisie |
| Session | Jeton opaque de 32 octets, session en Redis (7 jours, glissante), cookie `httpOnly`, `sameSite=lax`, `secure` en production |
| Révocation | Index des sessions par compte. Changement de mot de passe, réinitialisation et changement d'adresse ferment **toutes** les sessions |
| Rôles | Deux rôles exclusifs. Chaque page et chaque route vérifie le rôle côté serveur (`exigerSession(role)`) ; masquer un bouton n'est jamais un contrôle |
| Vérification d'adresse | Lien envoyé à l'inscription, valable 48 h. Seul effet d'une adresse non vérifiée : aucun lien de réinitialisation n'y est envoyé |
| Changement d'adresse | Mot de passe exigé ; lien à la nouvelle adresse (24 h), avertissement à l'ancienne ; rien n'est modifié avant confirmation |
| Réinitialisation | Lien à usage unique valable 1 h, envoyé seulement à une adresse vérifiée. Réponse identique que l'adresse existe ou non |
| Codes de récupération | 8 codes remis à l'inscription, affichés une fois, stockés sous forme d'empreinte, chacun utilisable une fois |

Les jetons à usage unique (vérification, changement d'adresse, réinitialisation) sont
rangés dans Redis sous leur empreinte SHA-256. Un jeton est supprimé avant d'être
utilisé, et son type est contrôlé : un jeton de vérification ne peut pas réinitialiser
un mot de passe.

---

## Protections

| Menace | Protection |
|---|---|
| Force brute sur un compte | 10 tentatives par adresse sur 15 min, puis blocage avec délai annoncé |
| Balayage de nombreux comptes | 100 tentatives par IP sur 15 min. Seuil large : une IP mobile regroupe souvent tout un chantier |
| Énumération des comptes | Même message et même durée de réponse pour une adresse inconnue et un mauvais mot de passe (empreinte factice calculée) |
| Inondation de courriels | 5 demandes de réinitialisation par adresse et par heure ; 5 demandes de changement d'adresse par compte et par heure |
| Comparaison de secrets par la durée | `timingSafeEqual` pour les empreintes, les jetons et le secret n8n |
| Accès aux coordonnées sans paiement | Contrôlé côté serveur : `402` sur le déblocage et la sollicitation sans droit |
| Injection SQL | Requêtes paramétrées exclusivement (gabarits `postgres.js`) |
| Clickjacking, détournement de contenu | En-têtes : `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. HSTS posé par Vercel en production |
| Courriels vers des adresses de test | Les domaines réservés par la RFC 2606 (`.test`, `.example`, `.invalid`) ne sont jamais transmis au prestataire |

La CSP autorise `wasm-unsafe-eval` pour la lecture de CV en WebAssembly, et
`unsafe-eval` en développement seulement.

---

## Chiffrement

**En transit.** HTTPS partout : Vercel pour l'application, TLS vers Supabase, Upstash,
France Travail, l'API Adresse, Brevo et Discord.

**Au repos.** AES-256-GCM appliqué par l'application sur six colonnes. Enveloppe
`iv.tag.chiffré` en base64url, clé unique `CLE_CHIFFREMENT` (32 octets). Code :
`core/src/chiffrement.ts`.

La propriété est vérifiée par `web/test/chiffrement-au-repos.test.ts` :

1. des valeurs témoins enregistrées par un parcours normal sont absentes en clair quand
   la base est relue directement, hors de l'application ;
2. l'aller-retour rend la valeur d'origine à son propriétaire, et à lui seul ;
3. toute colonne des tables porteuses de données personnelles doit figurer dans la
   classification ci-dessous, sinon la suite échoue ;
4. une classification qui décrit une colonne disparue fait aussi échouer la suite.

---

## Classification des données

### Chiffrées

| Colonne | Donnée |
|---|---|
| `interimaire.telephone_chiffre` | Téléphone personnel |
| `interimaire.adresse_chiffree` | Adresse du domicile |
| `interimaire.carte_btp_numero_chiffre` | Numéro de carte BTP |
| `interimaire.cv_texte_chiffre` | Texte du CV |
| `certification.numero_chiffre` | Numéro d'habilitation |
| `entreprise.telephone_chiffre` | Téléphone de l'entreprise |

### En clair, et pourquoi

| Donnée | Motif |
|---|---|
| `compte.email` | Identifiant de connexion, doit être cherchable |
| `compte.mot_de_passe_hash`, `mot_de_passe_sel` | Empreinte non réversible ; un sel n'est pas un secret |
| `compte.email_verifie_le` | Date seule, lue à chaque demande de réinitialisation |
| `compte.discord_utilisateur_id`, `discord_salon_id` | Identifiants techniques ; l'unicité du premier exige qu'il reste comparable |
| `interimaire.prenom`, `nom` | Affichés à l'entreprise ; le nom est réduit à l'initiale avant déblocage |
| `code_postal`, `ville`, `lat`, `lon` | Calcul des distances. Coordonnées de la **commune**, pas du domicile |
| `certification.type_code`, `categorie_id`, `date_echeance` | Utilisées par le filtre éliminatoire, qui doit pouvoir les comparer en SQL |
| `certification.organisme_emetteur` | Organisme de formation, pas une donnée personnelle |
| `entreprise.raison_sociale`, `siret` | Données publiques |

Le produit ne collecte ni coordonnées bancaires ni pièce d'identité, et aucun fichier :
le CV est lu dans le navigateur et seul son texte est transmis.

---

## Conservation et suppression

Durées annoncées sur `/confidentialite` :

| Donnée | Durée |
|---|---|
| Compte et profil | 24 mois après la dernière connexion |
| Texte du CV | Jusqu'à son retrait ou la suppression du compte |
| Session | 7 jours d'inactivité |
| Compteurs de tentatives | 15 minutes |
| Traces de matching | 1 heure |
| Salon Discord | Jusqu'au détachement ou la suppression du compte |

La suppression de compte efface profil, habilitations, disponibilités, candidatures,
agences et texte de CV (cascades du schéma, vérifiées par un test fonctionnel), et
supprime le salon Discord, qu'aucune cascade n'atteint.

L'intérimaire voit combien d'entreprises ont débloqué ses coordonnées.

---

## Données transmises à Discord

Traitement facultatif, inactif tant que la personne ne relie pas son compte.

| | |
|---|---|
| Ce qui part | Le texte des notifications : prénom, habilitation concernée, date d'échéance, intitulé et lieu d'une mission. Jamais d'adresse, de téléphone, de numéro de titre ni de texte de CV |
| Ce qui est demandé à Discord | L'identifiant du compte et le droit de l'ajouter au serveur (`identify`, `guilds.join`). Ni adresse, ni messages, ni liste des serveurs |
| Qui peut lire | La personne et le bot. Le salon refuse `@everyone` ; ces permissions sont vérifiées par un test |
| Retrait | Un bouton dans le profil, sans mot de passe. Le salon est supprimé, pas seulement délié |
| Sollicitation | Proposition contextuelle dans l'espace, avec un refus explicite retenu dans le navigateur. Pas de bandeau global |

---

## Base légale

| Traitement | Base (RGPD) |
|---|---|
| Compte, profil, habilitations, candidatures | Mesures précontractuelles à la demande de la personne (art. 6.1.b) |
| Texte du CV | Même base ; facultatif, retirable, sans effet sur l'éligibilité |
| Relais Discord | Consentement (art. 6.1.a), retirable aussi simplement qu'il est donné |

Mentions légales sur `/mentions-legales`, politique de confidentialité sur
`/confidentialite`.

---

## Limites connues

- **La clé de chiffrement vit dans l'environnement du serveur.** Un serveur compromis
  peut déchiffrer. Le chiffrement protège contre une fuite de base ou de sauvegarde et
  un accès en lecture au tableau de bord de l'hébergeur. Aller plus loin demanderait un
  service de gestion de clés avec rotation.
- **Perdre `CLE_CHIFFREMENT` rend illisibles** les colonnes chiffrées existantes.
- **L'authenticité des habilitations n'est pas vérifiée.** Aucun registre national
  n'est interrogeable ; l'écran renvoie vers l'outil de l'organisme émetteur.
- **Les points d'entrée n8n reposent sur un secret partagé.** Proportionné à ce qu'ils
  exposent (rappels d'échéance, rapprochements), insuffisant pour des données de paie.
