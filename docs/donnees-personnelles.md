# Cartographie des données personnelles

*Rédigé le 18 septembre 2026, en réponse au §1 de l'audit de conformité au sujet.*

Le sujet demande le « chiffrement des données sensibles (coordonnées bancaires ou documents d'identité, **selon votre secteur**) ». Ce document dit ce que le produit collecte, ce qui est sensible ici, ce qui est chiffré, et — tout aussi important — **ce qui ne l'est pas et pourquoi**.

---

## L'arbitrage, et pourquoi il a été tranché ainsi

Le produit ne collecte ni coordonnées bancaires ni pièce d'identité. La question s'est donc posée d'ajouter un justificatif téléversé — photo de carte BTP ou de certificat CACES — pour faire exister une donnée sensible évidente. **Elle a été écartée**, pour trois raisons.

**Elle contredirait le positionnement.** Le principe directeur du produit est qu'il **ne vérifie pas l'authenticité** des habilitations : aucun registre national n'est interrogeable, chaque organisme testeur fournit son propre outil. On structure la déclaration, on contrôle la validité des dates, on renvoie vers l'organisme émetteur. Stocker une photo de carte laisse croire l'inverse. Et si personne ne la regarde, elle ne prouve rien : une photo n'est pas une vérification.

**Le coût n'est pas celui d'un champ.** Vercel n'a pas de disque persistant. Il faudrait un stockage binaire, le chiffrement de ce binaire, le contrôle d'accès à la relecture, l'effacement à la suppression de compte, la validation de type et de taille. Une journée au minimum, sur un projet de onze jours.

**Le risque augmenterait sans contrepartie.** Détenir des pièces proches de l'identité fait monter d'un cran les obligations, pour une base de démonstration partagée.

**Ce qui est sensible ici**, ce sont les coordonnées directes d'un ouvrier, l'adresse de son domicile, les identifiants nominatifs de ses titres, et le texte intégral de son CV — vingt ans d'historique d'emploi, ses employeurs, ses dates. Ces six colonnes sont chiffrées.

---

## Classification

Chiffrement **AES-256-GCM** au niveau applicatif. Enveloppe `iv.tag.chiffré` en base64url, clé unique tirée de `CLE_CHIFFREMENT`.

### Chiffré au repos

| Table.colonne | Donnée | Pourquoi elle est sensible |
|---|---|---|
| `interimaire.telephone_chiffre` | Téléphone personnel | Coordonnée directe, inutile au fonctionnement du moteur |
| `interimaire.adresse_chiffree` | Adresse précise du domicile | Localise une personne à son domicile |
| `interimaire.carte_btp_numero_chiffre` | Numéro de carte BTP | Identifiant nominatif rattaché à une situation d'emploi |
| `certification.numero_chiffre` | Numéro d'habilitation | Identifiant nominatif du titre |
| `interimaire.cv_texte_chiffre` | Texte du CV | Historique d'emploi complet : la donnée la plus riche du produit |
| `entreprise.telephone_chiffre` | Téléphone de l'entreprise | Coordonnée directe d'un interlocuteur |

### Volontairement en clair

Une donnée qu'on chiffrerait sans pouvoir s'en servir rendrait le produit inopérant. Chaque exception est un choix, pas un oubli.

| Donnée | Pourquoi elle reste lisible |
|---|---|
| `compte.email` | Identifiant de connexion : il doit être cherchable |
| `compte.mot_de_passe_hash` | Empreinte **scrypt**, non réversible par construction. Le mot de passe lui-même n'est jamais stocké |
| `compte.mot_de_passe_sel` | Un sel n'est pas un secret : il doit être lisible pour vérifier une empreinte |
| `interimaire.prenom`, `nom` | Affichés à l'entreprise qui reçoit une candidature — c'est la finalité du produit |
| `code_postal`, `ville`, `lat`, `lon` | Servent au géocodage et au calcul de distance. Les coordonnées sont celles de **la commune**, pas du domicile |
| `certification.type_code`, `categorie_id` | Le filtre éliminatoire s'appuie dessus. Les chiffrer rendrait le matching impossible |
| `certification.date_echeance` | **C'est la donnée qui décide de l'éligibilité** : elle doit rester comparable en SQL |
| `certification.organisme_emetteur` | Organisme de formation, pas une donnée personnelle |
| `entreprise.raison_sociale`, `siret` | Données publiques, consultables au registre du commerce |

---

## Comment c'est prouvé

« Les données sensibles sont chiffrées » est une phrase que tout le monde écrit. Elle est ici une propriété vérifiée par la suite de tests, dans [`web/test/chiffrement-au-repos.test.ts`](../web/test/chiffrement-au-repos.test.ts).

**Quatre garanties.**

1. Un parcours normal enregistre des valeurs témoins repérables, puis la base est relue **en direct, hors de l'application** : aucun témoin ne s'y trouve en clair, et chaque colonne porte bien l'enveloppe à trois segments.
2. L'aller-retour rend les valeurs d'origine à leur propriétaire — un chiffrement qui perdrait la donnée passerait le premier test sans être utile — et à lui seul.
3. **Toute colonne ajoutée à l'une des quatre tables porteuses de données personnelles doit être classée**, avec son état et sa raison, sinon la suite échoue. On ne peut pas glisser discrètement un champ sensible en clair.
4. L'inverse est vérifié aussi : une classification qui décrirait une colonne disparue donnerait une fausse impression de couverture.

Le troisième point a fait son travail dès sa première exécution, en repérant une colonne classée par erreur.

---

## Ce que ce chiffrement ne protège pas

Il faut le dire, sous peine de faire croire à une garantie plus large qu'elle ne l'est.

La clé vit dans l'environnement du serveur applicatif. **Un serveur compromis peut déchiffrer.** Ce chiffrement protège contre ce qu'il est conçu pour protéger : un dump de base, une sauvegarde qui fuite, un rôle Supabase mal configuré, un accès en lecture au tableau de bord de l'hébergeur. Ce sont les scénarios les plus probables — et de loin — pour un projet de cette taille.

Aller au-delà supposerait un service de gestion de clés séparé, avec rotation. Hors périmètre, et noté ici plutôt que passé sous silence.

---

## Durées de conservation

Annoncées sur [`/confidentialite`](../web/app/confidentialite/page.tsx) et appliquées :

| Donnée | Durée |
|---|---|
| Compte et profil | 24 mois après la dernière connexion |
| Texte du CV | Jusqu'à son retrait par l'utilisateur, ou la suppression du compte |
| Session | 7 jours d'inactivité, en base non relationnelle |
| Tentatives de connexion | 15 minutes |
| Traces de calcul de correspondance | 1 heure — elles expliquent un résultat, elles n'archivent pas |

La suppression de compte efface profil, habilitations, disponibilités, candidatures et texte de CV : les cascades du schéma le garantissent, et un test fonctionnel le vérifie.

---

## Base légale

**Exécution de mesures précontractuelles** prises à la demande de la personne (article 6.1.b du RGPD). Créer un compte, déclarer ses habilitations et recevoir des propositions sont les étapes préalables à une éventuelle mission d'intérim.

Le dépôt de CV est **facultatif** et retirable à tout moment : il relève du même fondement, et son retrait n'empêche aucune fonctionnalité — les habilitations déclarées, elles, décident seules de l'éligibilité.
