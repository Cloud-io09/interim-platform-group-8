# Démonstration

Déroulé de l'oral, et recette manuelle. Quatre parcours qui passent par toutes les
fonctionnalités. Pour chaque étape : ce qu'on fait, ce qu'on doit voir, ce qu'on dit.
Si l'écran ne montre pas ce qu'indique la deuxième colonne, c'est un défaut.

| Parcours | Rôle | Durée | Ce qu'il montre |
|---|---|---|---|
| [A](#a-la-règle-qui-justifie-le-produit) | Les deux | 3 min | La date de fin de mission, pas la date du jour |
| [B](#b-lentreprise) | Entreprise | 6 min | Le moteur filtre, classe, explique ; le contact se paie |
| [C](#c-lintérimaire) | Intérimaire | 6 min | Une habilitation est une donnée datée ; un CV ne décide pas |
| [D](#d-les-automatisations) | n8n | 2 min | Chaque personne reçoit ses alertes dans son salon |

**Version de 10 minutes** : A, puis B3 à B5, C4, D1.

---

## Préparer

```bash
npm run ingest -- seed-demo
```

Crée une entreprise, huit intérimaires et la mission « Conducteur de pelle,
terrassement Reims centre » (du 1er au 21 octobre 2026, CACES R482 catégorie B1
exigé). Chaque profil illustre un cas du moteur. Mot de passe commun :
`demonstration-interimatch`.

| Compte (`…@demo.interimatch.test`) | Personne | Cas |
|---|---|---|
| `entreprise` | Bâtiment Rémois SAS | L'entreprise |
| `conforme` | Karim Benali | Conforme, doit sortir en tête |
| `expire-pendant` | Sofiane Roux | CACES valide aujourd'hui, échu le 10 octobre : **écarté** |
| `echeance-pile` | Lucie Marchand | Échéance le 21 octobre, dernier jour : retenue (borne incluse) |
| `sans-certification` | Mehdi Lopes | Aucun titre : écarté |
| `mauvaise-categorie` | Thomas Girard | CACES R482 C1 (chargeuse) au lieu de B1 (pelle) : écarté |
| `eloigne` | Nadia Perrot | Lille, hors rayon : retenue, distance à 0 |
| `peu-disponible` | Yannick Fabre | Disponible une semaine sur trois |
| `bientot-perime` | Ahmed Chevalier | Conforme ici, CACES échu fin novembre : cible de l'alerte n8n |

La commande supprime d'abord les comptes de démonstration existants : elle se rejoue
avant chaque répétition.

**Les dates sont fixes.** Le scénario A n'a tout son sens que tant que le CACES de
Sofiane est encore valide, soit jusqu'au 9 octobre 2026. Au-delà, décaler
`MISSION_DEBUT`, `MISSION_FIN` et les échéances dans `ingest/src/demo.ts`.

**Avant d'entrer :**

- deux navigateurs (ou une fenêtre privée), un par rôle ;
- `GET /api/sante` entièrement vert ;
- Karim, Ahmed et l'entreprise ont relié Discord (pour D) ;
- une agence déclarée sur le profil de Karim (le jeu n'en crée aucune ; sans elle, B4 affiche « aucune agence déclarée ») ;
- une adresse réelle pour le compte créé en direct (C1), qui doit recevoir le courriel.

---

## A. La règle qui justifie le produit

| Faire | On doit voir | À dire |
|---|---|---|
| Intérimaire Sofiane → Habilitations | CACES R482 B1, valide aujourd'hui | Un concurrent qui compare à la date du jour le retient |
| Entreprise → la mission → candidats | Karim en tête ; Sofiane dans les écartés, motif « expire avant la fin du chantier » | La comparaison se fait contre la fin du chantier. Une affectation non conforme engage la responsabilité pénale de l'entreprise |
| Montrer Lucie | Retenue : son titre échoit le dernier jour | La borne est incluse |
| Montrer Thomas | Écarté : bon type, mauvaise catégorie | Une catégorie de CACES correspond à un engin |
| Sofiane postule quand même | Accepté, marqué non conforme dans la liste de l'entreprise | Personne n'est empêché de postuler ; l'entreprise voit le verdict |
| L'entreprise débloque et sollicite Karim, Karim accepte | Mission pourvue des deux côtés | La conformité est vérifiée une seconde fois à l'acceptation |

---

## B. L'entreprise

### B1. Profil et offre

| Faire | On doit voir | À dire |
|---|---|---|
| Profil entreprise | Adresse géocodée | Géocodage mis en cache : le service public n'est interrogé qu'une fois par adresse |
| Mon abonnement | Découverte (3 crédits), Chantier, Régie | Le rapprochement et la conformité sont gratuits ; seul le contact se paie |

### B2. Publier une fiche

| Faire | On doit voir | À dire |
|---|---|---|
| Nouvelle fiche, métier « conducteur d'engins » | Encart des offres publiques : intitulés fréquents, habilitations typiques, fourchette de salaire locale avec le nombre d'offres | Données France Travail nettoyées par notre CLI |
| Exiger CACES R482 | Catégorie obligatoire, liste fermée | Aucun texte libre |
| Durée de plus de 18 mois | Refus citant l'article L1251-12 et la date limite | Contrôle légal à la saisie |
| Taux horaires | Préremplis sur la fourchette observée, avec la source sous les champs | Un repère tiré du marché, modifiable |
| Publier, puis modifier | Matching recalculé | Cache invalidé à la modification |

### B3. Le moteur

| Faire | On doit voir | À dire |
|---|---|---|
| Fiche → candidats | Retenus avec trois scores : compétences, distance, disponibilités | Deux étapes, jamais fusionnées |
| Nadia, Yannick | Distance à 0 ; disponibilités à un tiers | Le rayon et les disponibilités classent, ils n'excluent pas |
| Écartés | Chaque profil avec son motif | Trace en Redis : on sait dire pourquoi un profil n'apparaît pas |

### B4. Fiche profil et paiement

| Faire | On doit voir | À dire |
|---|---|---|
| Liste des candidats, puis profil de Karim | « Karim B. », mention « Coordonnées masquées » ; conformité habilitation par habilitation | Le verdict est visible avant de payer ; le nom complet ne l'est nulle part |
| Agence | Présence d'une agence, sans son nom | On sait qu'il y a un intermédiaire avant de payer |
| « Débloquer et solliciter » | Fenêtre de confirmation : ce qu'on obtient, ce qui est consommé (forfait ou crédit), ce qu'il restera | Rien n'est débité sans avoir été annoncé |
| Confirmer | Nom complet, téléphone, agence ; profil sollicité | Débloquer deux fois ne coûte qu'une fois |
| Même geste, crédits épuisés | La fenêtre l'annonce et propose les formules | Contrôlé aussi côté serveur (`402`), pas seulement à l'écran |

### B5. Conclure

| Faire | On doit voir | À dire |
|---|---|---|
| Candidatures | Chaque chantier dans sa carte, verdict dès la liste | |
| « Retenir ce profil » ou « Écarter ce profil » | Un motif facultatif peut accompagner le refus | Il est transmis : un refus expliqué dit quoi corriger |
| Fiche pourvue | Qui vient, comment le joindre | |
| Sur une autre fiche : « Clore la fiche… » | Deux motifs, chacun avec ses conséquences écrites | Les candidatures en attente passent à « expirée » : personne n'attend une réponse qui ne viendra pas |
| Document de mission → imprimer | Six mentions obligatoires, ou la liste de celles qui manquent | Impression du navigateur, rien n'est généré côté serveur |
| Tableau de bord | Chiffres clés, activité, prochain chantier | |

---

## C. L'intérimaire

### C1. Inscription, en direct

| Faire | On doit voir | À dire |
|---|---|---|
| Accueil → « Je cherche des missions » | Inscription intérimaire | Deux types de compte, deux parcours |
| Mot de passe trop court | Erreur sur le champ, toutes les erreurs d'un coup | |
| S'inscrire | 8 codes de récupération, affichés une fois | Authentification écrite à la main : scrypt, jetons opaques, sessions en Redis |
| Ouvrir le courriel reçu | Adresse confirmée | Jeton à usage unique, rangé par empreinte |

### C2. Profil

| Faire | On doit voir | À dire |
|---|---|---|
| Métiers | Liste fermée, métiers de terrain | Ni ingénieur ni conducteur de travaux : ils ne passent pas par l'intérim |
| Rayon de mobilité | 50 km par défaut, modifiable | |
| Carte BTP | Bloc séparé des habilitations | Elle atteste un emploi, pas une compétence : hors matching |
| Agences d'emploi | Nom et ville | L'intérimaire est salarié de son agence, pas de la plateforme |

### C3. Le CV

| Faire | On doit voir | À dire |
|---|---|---|
| Déposer un scan ou une photo | Lecture dans le navigateur, avec progression | Le fichier ne quitte pas le téléphone ; seul le texte part, chiffré |
| Résultat | Métiers et compétences proposés, chacun avec son passage | Détection stricte : une fausse suggestion coûte plus qu'une manquante |
| Habilitations créées | Aucune | Un CV ne donne jamais la date d'échéance, or c'est elle qui décide |
| Missions suggérées | Chaque suggestion avec le verdict du moteur | Le CV suggère où regarder, il ne rend pas éligible |

### C4. Habilitations

| Faire | On doit voir | À dire |
|---|---|---|
| Ajouter un CACES R482 | Catégories, organisme, numéro, dates ; échéance calculée à 10 ans | Durées CNAM, liste fermée |
| Échéance antérieure à l'obtention | Refus | |
| Lien vers l'organisme | Outil de vérification de l'émetteur | Aucun registre national : on structure, on ne certifie pas |
| Disponibilités | Période enregistrée | Elle pèse 25 % du score |

### C5. Candidater

| Faire | On doit voir | À dire |
|---|---|---|
| Opportunités | Missions accessibles et bloquées, chaque blocage expliqué | On ne cache rien, on dit ce qui manque |
| Postuler hors de ses métiers | Accepté, avec un avertissement | Le moteur ne classe que sur les métiers déclarés |
| Mes candidatures | État et conformité de chaque dossier | Savoir qu'un titre échoit avant la réponse |

### C6. Après l'affectation, et le compte

| Faire | On doit voir | À dire |
|---|---|---|
| Karim → Mes missions | Adresse, horaires, qui appeler | |
| Relier Discord | Salon privé, message d'accueil | Un salon par personne : une alerte nomme la personne et son titre |
| Sécurité → changer d'adresse | Lien à la nouvelle, avertissement à l'ancienne | |
| Supprimer le compte (créé en C1) | Tout est effacé, salon Discord compris | |

---

## D. Les automatisations

Dans n8n, ouvrir le flux, **Execute workflow**.

| Flux | Condition | On doit voir dans Discord |
|---|---|---|
| D1. Alerte d'échéance | Titres échus sous 90 jours : Sofiane, Ahmed | « votre CACES expire dans N jours… un renouvellement vous rouvrirait N missions » |
| D2. Mission correspondante | Mission publiée il y a moins de 24 h | Un message chez Karim ; rien chez Sofiane |
| D3. Relance non pourvue | Mission publiée depuis au moins 7 jours | Un message dans le salon de l'entreprise |

`seed-demo` publie la mission au moment où il s'exécute. Pour D3, antidater juste avant :

```sql
update mission set publiee_le = now() - interval '8 days'
where titre = 'Conducteur de pelle — terrassement Reims centre';
```

Vérifier les données sans n8n : [exploitation.md](exploitation.md#exécuter).

---

## Questions probables du jury

| Question | Réponse, et où la montrer |
|---|---|
| Et si on force la connexion ? | Dix échecs, blocage avec délai annoncé |
| Mot de passe oublié ? | Lien par courriel, 1 h, usage unique ; codes en repli |
| Qui emploie l'intérimaire ? | Son agence. [D6](decisions.md#d6-la-plateforme-nest-pas-lagence) |
| Pourquoi deux bases ? | [D10](decisions.md#d10-redis-comme-second-stockage-réel) |
| Comment vérifiez-vous les habilitations ? | On ne les authentifie pas ; on contrôle les dates et on renvoie vers l'organisme |
| Les tests ? | `npm run coverage`, `npm run parcours`. [Qualité](qualite.md) |
