# Registre des décisions

Chaque entrée donne la décision, ce qui a été écarté, et le motif. Les entrées sont
regroupées par domaine ; le numéro sert de référence stable.

| Domaine | Décisions |
|---|---|
| Produit et métier | [D1](#d1-une-habilitation-est-une-donnée-datée) · [D2](#d2-la-validité-se-juge-contre-la-fin-de-mission) · [D3](#d3-filtre-puis-score-jamais-un-score-unique) · [D4](#d4-le-cv-propose-il-ne-décide-pas) · [D5](#d5-on-paie-pour-agir-jamais-pour-décider) · [D6](#d6-la-plateforme-nest-pas-lagence) |
| Socle technique | [D7](#d7-nextjs-seul-pour-le-front-et-lapi) · [D8](#d8-supabase-comme-base-postgresql-uniquement) · [D9](#d9-un-client-postgresql-partagé) · [D10](#d10-redis-comme-second-stockage-réel) · [D11](#d11-fonctions-en-région-fra1) |
| Sécurité | [D12](#d12-authentification-écrite-à-la-main) · [D13](#d13-jetons-opaques-plutôt-que-jwt) · [D14](#d14-récupération--lien-par-courriel-puis-codes) · [D15](#d15-la-vérification-dadresse-ne-bloque-rien) |
| Traitements côté navigateur | [D16](#d16-le-cv-se-lit-dans-le-navigateur) · [D17](#d17-le-pdf-est-imprimé-par-le-navigateur) |
| Intégrations | [D18](#d18-discord-par-un-bot-un-salon-par-personne) · [D19](#d19-n8n-tire-les-données) |
| Qualité | [D20](#d20-pas-de-rapport-de-couverture-pour-web) |
| | [Hors périmètre](#hors-périmètre) |

---

## Produit et métier

### D1. Une habilitation est une donnée datée

**Décision.** Liste fermée de neuf types, catégorie quand le type l'exige, organisme,
numéro, dates d'obtention et d'échéance obligatoires. Durées de validité CNAM.

**Écarté.** Les mots-clés extraits d'un CV, comme chez les concurrents.

**Motif.** Un mot-clé ne périme pas. Une date permet de dire « ce profil ne peut pas
aller sur ce chantier », là où un mot-clé ne dit que « ce profil ressemble au poste ».
Les quatre CACES de levage (R483, R486, R487, R490) ont été ajoutés après mesure : un
grutier relève du R487 ou du R490 dans la moitié de ses offres, presque jamais du R482.

### D2. La validité se juge contre la fin de mission

**Décision.** Le moteur compare l'échéance de chaque titre à `mission.date_fin`.

**Écarté.** `date_echeance < now()`.

**Motif.** Une affectation non conforme engage la responsabilité pénale de l'entreprise
utilisatrice. Un titre qui échoit au milieu d'un chantier rend l'affectation
irrégulière. `core/src/matching.ts` ne contient aucun appel à l'horloge, et un test de
mutation vérifie que la suite échoue si on en réintroduit un.

### D3. Filtre, puis score. Jamais un score unique

**Décision.** Filtre éliminatoire sur les habilitations, puis score sur compétences
(0,40), distance (0,35) et disponibilités (0,25), exposé par critère.

**Écarté.** Un score pondéré incluant la conformité.

**Motif.** Dans un score unique, une bonne distance compenserait un titre périmé. Le
détail par critère permet d'expliquer chaque classement. Hors du rayon de mobilité, le
critère distance vaut 0 sans exclure : le rayon est une préférence, pas une obligation
légale.

### D4. Le CV propose, il ne décide pas

**Décision.** Un CV propose des métiers, des compétences et des types d'habilitation,
chacun avec le passage qui l'a déclenché. L'intérimaire valide ; seules des valeurs
typées sont enregistrées. Aucune habilitation n'est créée depuis un CV. Les missions
suggérées portent le verdict du vrai moteur.

**Écarté.** Le remplissage automatique ; la recherche de candidats par le texte du CV.

**Motif.** Un CV donne le type d'un titre, presque jamais son numéro, son organisme ni
sa date d'échéance, or c'est la date qui décide. Le cahier des charges demande
d'éviter de se baser **seulement** sur des mots-clés : le CV aide à découvrir et à
saisir. La détection est stricte (tous les termes distinctifs d'une compétence doivent
figurer) parce qu'une suggestion fausse coûte plus qu'une suggestion manquante.

### D5. On paie pour agir, jamais pour décider

**Décision.** Gratuit : rapprochement, score détaillé, conformité habilitation par
habilitation, présence d'une agence. Payant : nom complet, coordonnées, nom de
l'agence, droit de solliciter, et plus d'une mission en ligne à la fois. Paliers
Découverte (gratuit, 3 contacts offerts, 1 mission active), Starter (39 €/mois,
40 contacts, 4 missions actives) et Pro (129 €/mois, illimité) ; contacts à l'acte de
3,50 à 5 €, sans date d'expiration.

**Écarté.** Un accès payant aux résultats de matching ; une commission par mission
attribuée.

**Motif.** Faire payer le verdict de conformité reviendrait à vendre le risque que le
produit existe pour supprimer. Un déblocage porte sur un couple profil × mission,
jamais sur un profil seul : on ne vend pas l'accès à une base de candidats. Le prix
unitaire du plus gros pack reste supérieur à celui de l'abonnement, sans quoi personne
ne s'abonnerait. Le paiement est simulé ; les quotas, l'imputation, l'idempotence et la
transaction sont réels.

### D6. La plateforme n'est pas l'agence

**Décision.** La plateforme intervient en amont de la contractualisation. L'intérimaire
déclare ses agences d'emploi ; leur nombre est visible avant paiement, leur nom après.

**Écarté.** Devenir employeur ; se rémunérer au placement.

**Motif.** L'intérim impose deux contrats portés par une entreprise de travail
temporaire, activité réglementée (déclaration, garantie financière). Sans agence, le
prêt de main-d'œuvre est illicite. La plateforme identifie le profil, prouve qu'il est
affectable jusqu'à la fin du chantier et produit le récapitulatif que l'agence
transforme en contrat. Un crédit consommé que l'entreprise recrute ou non ne fait pas
d'elle un intermédiaire rémunéré au placement : la tarification soutient le
positionnement juridique.

---

## Socle technique

### D7. Next.js seul pour le front et l'API

**Décision.** Next.js (App Router), TypeScript strict. Les routes d'API sont le backend.

**Motif.** Un seul déploiement. Le rendu serveur satisfait le référencement des pages
publiques sans travail supplémentaire. Le domaine vit dans `core/`, indépendant du
framework.

### D8. Supabase comme base PostgreSQL uniquement

**Décision.** Accès direct par `postgres.js` au pooler Supavisor en mode transaction
(port 6543). Permissions vérifiées dans le code (`exigerSession(role)`), pas en RLS.

**Écarté.** Supabase Auth, `supabase-js`, les règles RLS.

**Motif.** Le sujet impose une authentification écrite à la main ; les RLS reposent sur
les jetons de Supabase Auth. En fonction sans état, chaque invocation ouvre une
connexion : sans pooler, la base sature vite.

### D9. Un client PostgreSQL partagé

**Décision.** Un client mémorisé pour la vie du processus. Sa méthode `end()` est
neutralisée ; `fermerConnexion()` ferme réellement (migrations, CLI, fin de tests).

**Écarté.** Un client par requête.

**Motif.** Mesuré : 115 ms par requête avec une connexion neuve, 14 ms sur une
connexion réutilisée. La suite fonctionnelle est passée de 430 à 180 s. Neutraliser
`end()` à l'endroit unique qui sait le client partagé protège la cinquantaine de routes
qui l'appellent dans leur `finally`.

### D10. Redis comme second stockage réel

**Décision.** Redis porte sessions, révocation, limitation, jetons à usage unique, état
OAuth, cache et trace de matching, cache de géocodage. Détail :
[architecture.md](architecture.md#base-non-relationnelle).

**Écarté.** Une colonne JSONB ; la recherche plein texte sur les CV.

**Motif.** Le sujet impose une base non relationnelle complémentaire et cite « cache,
logs de matching » : les deux sont présents. Le TTL fait le ménage sans tâche
planifiée ; un compteur de tentatives en table écrirait à chaque tentative, y compris
pendant une attaque. La recherche plein texte reviendrait à chercher des candidats par
mots-clés (voir D4).

### D11. Fonctions en région fra1

**Décision.** `regions: ["fra1"]` dans `web/vercel.json`.

**Motif.** La base et Redis sont en Europe. Depuis la région par défaut (Washington),
chaque lecture de session ferait un aller-retour transatlantique.

---

## Sécurité

### D12. Authentification écrite à la main

**Décision.** `scrypt` de `node:crypto`, sel de 16 octets par compte, comparaison en
temps constant ; cookie `httpOnly`, `sameSite=lax`, `secure` en production.

**Écarté.** NextAuth, Supabase Auth, toute bibliothèque d'authentification ; l'OAuth
comme mode de connexion.

**Motif.** Exigence du sujet. La bibliothèque standard ne laisse aucune ambiguïté sur
« bibliothèque d'authentification ». L'OAuth, facultatif, aurait imposé la liaison de
comptes et un mot de passe nullable pour aucun besoin identifié.

### D13. Jetons opaques plutôt que JWT

**Décision.** Jeton de session de 32 octets aléatoires, session en Redis, index des
sessions par compte.

**Motif.** Un jeton opaque se révoque immédiatement : changer de mot de passe ou
reprendre un compte ferme toutes les sessions. Un JWT n'y parvient qu'avec une liste
de révocation, c'est-à-dire en redevenant un jeton opaque.

### D14. Récupération : lien par courriel, puis codes

**Décision.** Chemin principal : lien envoyé à l'adresse du compte, valable 1 h, à usage
unique, rangé par empreinte SHA-256. Repli : 8 codes de récupération remis à
l'inscription.

**Écarté.** La réinitialisation par Supabase ; les codes comme chemin principal.

**Motif.** Supabase ne réinitialise que les comptes de `auth.users`, or les nôtres sont
dans `public.compte`. Qui perd son mot de passe a souvent perdu le papier des codes
aussi : le lien couvre le cas courant, les codes celui de la boîte perdue. Un dump de
Redis ne contient que des empreintes, donc aucun lien exploitable.

### D15. La vérification d'adresse ne bloque rien

**Décision.** Un lien de vérification part à l'inscription. Une adresse non vérifiée
ne reçoit aucun lien de réinitialisation ; rien d'autre n'est restreint.

**Écarté.** Bloquer le compte jusqu'à vérification.

**Motif.** L'adresse est devenue un facteur de reprise du compte : une coquille
(« gmial.com ») donnerait le compte au propriétaire de la boîte. La restriction couvre
exactement cette surface. Bloquer ferait abandonner un public qui s'inscrit sur
téléphone, et une panne d'envoi enfermerait tout le monde dehors. Les codes restent
utilisables, donc personne n'est sans recours.

---

## Traitements côté navigateur

### D16. Le CV se lit dans le navigateur

**Décision.** Couche texte du PDF ou du `.docx`, sinon Tesseract en WebAssembly (fichiers
servis depuis `web/public/ocr`). Le serveur reçoit le texte, le chiffre, et ne conserve
jamais le fichier.

**Écarté.** La reconnaissance côté serveur, premier choix.

**Motif.** En production, elle produisait des passerelles expirées : une fonction sans
état n'a ni le temps ni la mémoire de charger douze mégaoctets de moteur à chaque
requête. Le document ne quitte plus l'appareil du candidat.

### D17. Le PDF est imprimé par le navigateur

**Décision.** Feuille de style d'impression et `window.print()`.

**Écarté.** Un moteur de rendu côté serveur.

**Motif.** Même raison que D16, et le navigateur respecte déjà le format de papier et
les réglages de la personne.

---

## Intégrations

### D18. Discord par un bot, un salon par personne

**Décision.** Un bot (`Manage Channels`, `Send Messages`, `Create Instant Invite`) crée un
salon privé par personne. Rattachement OAuth2 avec les scopes `identify` et
`guilds.join`.

**Écarté.** Le webhook unique, pourtant suggéré par le sujet.

**Motif.** Un webhook n'écrit que dans son salon : tout le monde lisait les alertes de
tout le monde, alors qu'une alerte d'échéance nomme une personne et son titre. Le
rattachement ne compare aucune adresse : la même personne tient une session ici et
autorise Discord dans le même aller-retour, lié par un état à usage unique.

### D19. n8n tire les données

**Décision.** n8n appelle trois points d'entrée protégés par un secret partagé, puis
poste lui-même sur Discord. L'application rédige les messages.

**Écarté.** L'application qui pousse vers n8n.

**Motif.** n8n tourne sur un poste sans adresse publique. En tirant, il n'a jamais
besoin d'être joignable, et reste la couche d'automatisation : cadence, mise en forme,
reprises. Un secret plutôt qu'un compte : n8n n'est pas un utilisateur.

---

## Qualité

### D20. Pas de rapport de couverture pour `web`

**Décision.** Couverture publiée pour `core`. Pour `web`, la mesure est la liste des
routes traversées par la suite fonctionnelle.

**Motif.** Les tests de `web` interrogent un serveur lancé dans un autre processus ; le
fournisseur v8 n'instrumente que le processus de test et afficherait 0 % partout. Un
chiffre faux est pire qu'un chiffre absent.

---

## Hors périmètre

| Sujet | Motif |
|---|---|
| Vérification de l'authenticité des titres | Aucun registre national. On contrôle les dates et on renvoie vers l'outil de l'organisme émetteur |
| Justificatif téléversé (photo de CACES, de carte BTP) | Laisserait croire à une vérification qui n'a pas lieu ; stockage binaire chiffré hors de proportion |
| Connexion par un fournisseur tiers | Facultatif ; voir D12 |
| Chat entreprise ↔ intérimaire | Ne conditionne aucune autre fonctionnalité |
| Notation des intérimaires | Sensible au regard du RGPD |
| Signature électronique | Hors sujet |
| Récupération d'accès assistée par l'agence | Solide pour ce métier, mais demande un rôle administrateur |
| Réemploi d'EPI | Piste argumentée dans [qualite.md](qualite.md#réemploi-depi), non livrée |
