# Déroulé de démonstration

Quatre parcours qui, mis bout à bout, passent par **toutes** les fonctionnalités. Chaque
étape dit quoi faire, ce qu'on doit voir, et la phrase à dire au jury. La colonne
« on doit voir » sert aussi de recette : si l'écran ne montre pas ça, c'est un défaut.

| Parcours | Rôle | Durée | Ce qu'il prouve |
|---|---|---|---|
| **A** | Intérimaire | 6 min | Une habilitation est une donnée datée, un CV ne décide jamais |
| **B** | Entreprise | 6 min | Le moteur filtre puis classe, et explique chaque exclusion |
| **C** | Les deux | 3 min | La règle clé : date de **fin** de mission, pas date du jour |
| **D** | Automatisations | 2 min | n8n → salon Discord privé de chaque personne |

**Version courte (10 min)** : C en entier, puis B2–B4, A4, D1. C'est la démonstration
du principe directeur ; le reste se montre si le jury pose des questions.

---

## Préparer la veille

**Deux navigateurs** (ou une fenêtre privée) : un par rôle, pour ne jamais se
déconnecter devant le jury.

| Compte | Rôle | À préparer |
|---|---|---|
| `demo-entreprise@…` | entreprise | profil rempli, **une fiche publiée la veille** (pour D3) |
| `karim@…` | intérimaire | conducteur d'engins, R482 cat. B1 valide **10 ans**, dispo sur 3 mois, Discord relié |
| `sofiane@…` | intérimaire | même profil, R482 B1 qui expire **au milieu** de la mission de C |
| — | intérimaire | un compte **créé en direct** pendant A |

Adresses réelles : les comptes doivent recevoir le courriel de vérification.

Le parcours A crée son compte en direct ; tout le reste existe déjà, pour que la
démonstration ne dépende pas de la vitesse de saisie.

Avant d'entrer : `GET /api/sante` doit être entièrement vert (base, Redis, courriel,
Discord), puis `npm run fumee:notifs -- https://<domaine>`.

---

## Parcours A — l'intérimaire

### A1. Inscription et vérification

| Faire | On doit voir | À dire |
|---|---|---|
| Accueil → « Je cherche des missions » | Formulaire d'inscription intérimaire | Deux types de compte, deux parcours distincts |
| Saisir un mot de passe trop court | Erreur **sur le champ fautif**, toutes les erreurs d'un coup | — |
| S'inscrire | Espace ouvert, bandeau « vérifiez votre adresse » | Authentification écrite à la main : scrypt, jetons opaques, sessions en Redis |
| Ouvrir le courriel, cliquer le lien | Adresse confirmée | Jeton à usage unique, stocké par empreinte |

### A2. Profil

| Faire | On doit voir | À dire |
|---|---|---|
| Profil → métiers | Liste fermée, métiers de terrain uniquement | Pas d'ingénieur, pas de conducteur de travaux : ils ne passent pas par l'intérim |
| Rayon de mobilité | 50 km par défaut, modifiable | Aligné sur le CDI intérimaire |
| Carte BTP | Champ **séparé** des habilitations | Elle atteste une situation d'emploi, pas une compétence : elle n'entre pas dans le matching |
| Agence d'emploi | Nom et ville de l'agence | L'intérimaire est salarié de son agence, pas de la plateforme |

### A3. Le CV — ce qu'il peut et ne peut pas faire

| Faire | On doit voir | À dire |
|---|---|---|
| Profil → CV, déposer un **scan** ou une photo | Progression de la lecture, dans le navigateur | Le fichier ne quitte pas le téléphone ; le serveur ne reçoit que le texte, chiffré |
| Résultat | Métiers et compétences **proposés**, chacun avec le passage qui l'a déclenché | Une suggestion fausse coûte plus cher qu'une manquante : détection stricte |
| Chercher une habilitation créée | **Aucune** | Un CV donne le type d'un titre, jamais sa date d'échéance — or c'est elle qui décide |
| Missions suggérées | Chaque suggestion porte le verdict du **vrai moteur** | Le CV suggère où regarder, jamais qu'on est éligible |

### A4. Habilitations et disponibilités

| Faire | On doit voir | À dire |
|---|---|---|
| Habilitations → ajouter | Type en liste fermée, catégorie quand le type l'exige, organisme, numéro, dates | **Jamais de texte libre.** C'est le cœur du produit |
| Choisir CACES R482 | Catégories A à G ; échéance proposée à **10 ans** | Durées CNAM : R482 10 ans, autres CACES 5 ans, habilitation électrique 3 ans… |
| Saisir une échéance antérieure à l'obtention | Refus | — |
| Lien vers l'organisme | Renvoi vers l'outil de vérification de l'émetteur | Aucun registre national n'existe : on structure, on ne certifie pas |
| Disponibilités → une période | Période enregistrée | Elle compte dans le score |

### A5. Trouver et candidater

| Faire | On doit voir | À dire |
|---|---|---|
| Opportunités | Tout le marché, chaque mission avec son verdict (accessible / bloquée et pourquoi) | On ne cache rien : on dit ce qui manque |
| Ouvrir une mission bloquée | Le titre manquant, le plus grave en premier | — |
| « Postuler » sur une mission d'un autre métier | Accepté **avec un avertissement** | Le moteur ne classe que sur les métiers déclarés |
| Mes candidatures | État de chaque dossier + « vous êtes conforme / titre manquant » | Savoir qu'un titre expire avant que l'entreprise réponde |
| « Retirer ma candidature » | Dossier retiré | — |

### A6. Discord, sécurité, après l'affectation

| Faire | On doit voir | À dire |
|---|---|---|
| Profil → Notifications → Relier mon compte Discord | Salon privé créé, message d'accueil | Un salon par personne : une alerte d'échéance est une donnée personnelle |
| *(après C)* Mes missions → la mission | Adresse, horaires, qui appeler | — |
| Document de mission → Enregistrer en PDF | Feuille imprimable | Impression navigateur, aucun PDF généré côté serveur |
| Profil → Sécurité → changer d'adresse | Courriel à la **nouvelle** adresse, avertissement à l'ancienne | — |
| Codes de récupération | Huit codes, affichés une fois | Repli pour qui a aussi perdu sa boîte mail |
| *(fin de démo)* Supprimer mon compte | Compte, habilitations, CV effacés | RGPD : rien n'est conservé |

---

## Parcours B — l'entreprise

### B1. Inscription et profil

| Faire | On doit voir | À dire |
|---|---|---|
| Profil entreprise, adresse | Adresse géocodée | Commune + code postal mis en cache Redis : le service public n'est interrogé qu'une fois |
| Mon abonnement | Découverte (3 crédits offerts), Chantier, Régie | Le rapprochement et la conformité sont **gratuits** : seul le contact se paie |

### B2. Publier une fiche

| Faire | On doit voir | À dire |
|---|---|---|
| Nouvelle fiche → choisir « conducteur d'engins » | Encart « N offres de ce métier… » : intitulés fréquents, habilitations typiques, fourchette de salaire locale | Données France Travail nettoyées par notre CLI : libellés normalisés, doublons retirés |
| Ajouter l'exigence R482 B1 | Liste fermée, catégorie obligatoire | — |
| Publier | Fiche publiée, candidats classés | — |
| Modifier la fiche | Formulaire repris, matching recalculé | Cache de matching invalidé à la modification |

### B3. Le moteur

| Faire | On doit voir | À dire |
|---|---|---|
| Fiche → candidats | **Retenus** avec score détaillé : compétences 40 %, distance 35 %, disponibilités 25 % | Deux étapes, jamais fusionnées : une bonne distance ne rattrape pas un titre périmé |
| Section écartés | Chaque profil exclu **avec son motif** | Trace en Redis : on répond à « pourquoi ce profil n'apparaît pas ? » |

### B4. Fiche profil, paiement, contact

| Faire | On doit voir | À dire |
|---|---|---|
| Ouvrir le profil de Karim | Conformité habilitation par habilitation ; nom réduit à « Karim B. » | La conformité est visible **avant** de payer |
| Agence | « Inscrit dans une agence » — sans son nom | On sait qu'il y a un intermédiaire avant de payer |
| Débloquer les coordonnées | Confirmation, un crédit consommé, nom complet + téléphone + agence nommée | Idempotent : débloquer deux fois ne coûte qu'une fois |
| Profil suivant, crédits épuisés | Écran de paiement | Contrôlé côté serveur (402), pas seulement masqué |

### B5. Conclure

| Faire | On doit voir | À dire |
|---|---|---|
| « Solliciter ce profil » | Demande envoyée, notification côté intérimaire | Ni l'un ni l'autre ne conclut seul |
| Candidatures | Chaque chantier dans sa carte, verdict dès la liste | — |
| « Retenir ce profil » / « Écarter ce profil » | Un motif peut accompagner le refus | Il est transmis à l'intérimaire : un refus expliqué lui dit quoi corriger |
| Fiche pourvue | Qui vient, comment le joindre, document de mission | — |
| Tableau de bord | Bandeau de chiffres, activité, prochain chantier | — |

---

## Parcours C — la règle qui justifie le produit

C'est **le** moment de l'oral. Préparé la veille : Karim et Sofiane ont le même profil,
seule l'échéance de leur R482 diffère.

| Faire | On doit voir | À dire |
|---|---|---|
| Montrer l'habilitation de Sofiane | Valide **aujourd'hui** | Un concurrent qui compare à la date du jour le retient |
| L'entreprise publie une mission de 3 semaines qui exige R482 B1 | — | — |
| Candidats | Karim retenu ; Sofiane **écarté**, motif « expire pendant la mission » | La comparaison se fait contre la **fin** du chantier. Une affectation non conforme engage la responsabilité pénale de l'entreprise |
| Sofiane postule quand même | Accepté, marqué non conforme dans la liste de l'entreprise | — |
| L'entreprise sollicite Karim, Karim « Accepter la mission » | Mission pourvue des deux côtés | La conformité est vérifiée **à nouveau** au moment de l'acceptation |

---

## Parcours D — les automatisations

Dans n8n, ouvrir le flux → **Execute workflow**. Détails et requêtes de vérification :
`docs/n8n/LISEZ-MOI.md`.

| Flux | Condition pour qu'il poste | On doit voir, dans Discord |
|---|---|---|
| D1. Alerte d'échéance | Habilitation qui expire sous 90 jours (Sofiane) | « votre CACES expire dans N jours… un renouvellement vous ouvrirait N missions » |
| D2. Mission correspondante | Fiche publiée depuis moins de 24 h, profil **retenu** | Message dans le salon de Karim, **rien** dans celui de Sofiane |
| D3. Relance non pourvue | Fiche publiée depuis au moins 7 jours, chantier pas commencé | Message dans le salon de l'entreprise |

Pour D3, la fiche publiée la veille avec `?jours=1` dans le nœud, ou antidater :
`update mission set publiee_le = now() - interval '8 days' where id = <id>;`

---

## Si le jury demande…

| Question | Où le montrer |
|---|---|
| « Et si on force la connexion ? » | Dix mauvais mots de passe → blocage avec délai annoncé |
| « Mot de passe oublié ? » | Connexion → mot de passe oublié → lien par courriel, 1 h, usage unique |
| « Accessibilité ? » | Navigation au clavier sur une fiche ; page `/accessibilite` |
| « Et la base non relationnelle ? » | Sessions, limitation, jetons, cache de matching, traces, géocodage : tout en Redis |
| « Les tests ? » | `npm run coverage` → rapport ; `npm run parcours` joue A à C en 60 vérifications |
