# Décisions techniques, et pourquoi

*Pour l'équipe. Chaque section tient en un paragraphe : ce qu'on a choisi, ce qu'on a
écarté, et le motif. C'est ce qui se défend en soutenance — un jury ne conteste pas
une ligne de code, il conteste un arbitrage.*

---

## 1. Une certification est une donnée datée, jamais du texte

**Choisi.** Liste fermée de neuf types, catégories quand le type l'exige, dates
d'obtention et d'échéance obligatoires. Les durées de validité sont celles des
recommandations CNAM — dix ans pour un CACES R482, trois pour une habilitation
électrique.

**Écarté.** L'extraction de mots-clés depuis un CV, que pratiquent les plateformes
concurrentes.

**Pourquoi.** Un mot-clé ne périme pas. Une date, si. Tout le produit tient à cette
différence : c'est elle qui permet de dire « ce profil ne peut pas aller sur ce
chantier », là où un concurrent ne sait dire que « ce profil ressemble à ce poste ».

---

## 2. La validité se juge contre la date de fin de mission

**Choisi.** `matching.ts` reçoit la date de fin de chantier et compare les échéances
à elle.

**Écarté.** `date_echeance < now()`, qui paraît équivalent.

**Pourquoi.** Un CACES valable aujourd'hui mais périmé dans trois semaines rend une
affectation irrégulière sur un chantier d'un mois — et une affectation non conforme
engage la **responsabilité pénale** de l'entreprise utilisatrice. `core/src/matching.ts`
ne contient aucun `Date.now()`, et un test de mutation vérifie que la suite attrape la
régression si on l'y réintroduit.

---

## 3. Deux étapes de matching, jamais fondues en un score

**Choisi.** Filtre éliminatoire sur les habilitations, puis scoring sur compétences
(0,40), distance (0,35) et disponibilité (0,25), exposé **par critère**.

**Écarté.** Un score unique pondéré incluant la conformité.

**Pourquoi.** Un score unique laisserait une bonne distance compenser un titre périmé.
Et exposer le détail permet d'expliquer un classement — « pourquoi ce profil
n'apparaît-il pas ? » a une réponse, lisible par les deux parties.

---

## 4. L'authentification est écrite à la main

**Choisi.** `scrypt` de `node:crypto`, jetons opaques de 32 octets en Redis, cookie
`httpOnly` + `sameSite` + `secure`, deux compteurs de tentatives.

**Écarté.** Supabase Auth, NextAuth, et tout JWT.

**Pourquoi.** Le sujet l'exige mot pour mot. Conséquence vérifiée le 18 septembre :
**la récupération de mot de passe ne peut pas passer par Supabase** — un lien de
réinitialisation est un flux à jeton, donc dans l'énumération du sujet ; et
techniquement Supabase ne réinitialise que les comptes de `auth.users`, quand les
nôtres vivent dans `public.compte`. Un jeton opaque plutôt qu'un JWT parce qu'il se
révoque immédiatement : changer de mot de passe ferme **toutes** les sessions, ce
qu'un JWT ne sait pas faire sans liste de révocation — c'est-à-dire sans redevenir un
jeton opaque.

---

## 5. Redis n'est pas un cache décoratif

**Choisi.** Huit usages : sessions, index de révocation par compte, limitation de
tentatives, jetons à usage unique, état OAuth, cache de matching, **traces de
matching**, cache de géocodage.

**Écarté.** Une colonne `JSONB` dans PostgreSQL.

**Pourquoi.** Le sujet impose une base non relationnelle « pour un usage
complémentaire » et cite « cache, logs de matching » : les deux y sont. Une colonne
JSONB ne satisfait pas l'exigence — il faut un second stockage réel. Et chaque usage
a un motif propre : le TTL fait le ménage des sessions sans tâche planifiée, et un
compteur de tentatives en table produirait une écriture par tentative, y compris
pendant une attaque.

**La recherche full-text sur les CV est volontairement absente**, alors que le sujet
la cite : elle reviendrait à chercher des candidats par mots-clés, exactement le
contre-modèle que le produit oppose à ses concurrents.

---

## 6. La vérification d'adresse ne bloque rien

**Choisi.** Un lien part à l'inscription. L'adresse non confirmée n'empêche ni la
connexion ni aucune fonctionnalité — elle empêche **une seule chose** : qu'un lien de
réinitialisation y soit envoyé.

**Écarté.** Bloquer le compte tant que l'adresse n'est pas confirmée.

**Pourquoi.** La faille était précise : depuis que le lien par courriel est le chemin
principal de récupération, quelqu'un qui tape « karim@gmial.com » offre son compte au
propriétaire réel de cette boîte. Le correctif couvre exactement cette surface.
Bloquer aurait fait abandonner un public qui s'inscrit depuis un téléphone entre deux
chantiers, et une configuration d'envoi défaillante aurait enfermé tout le monde
dehors. Les codes de récupération restent ouverts à tous, donc personne n'est sans
recours.

---

## 7. Le CV se lit dans le navigateur

**Choisi.** Couche texte du PDF ou du `.docx`, sinon Tesseract en WebAssembly. Le
serveur ne reçoit que le texte, chiffré au repos.

**Écarté.** La reconnaissance côté serveur — qui était le premier choix.

**Pourquoi.** Une fonction sans état n'a ni le temps ni la mémoire de charger douze
mégaoctets de moteur à chaque requête : on obtenait des passerelles expirées. Effet de
bord heureux : **le document ne quitte jamais l'appareil du candidat**.

---

## 8. Discord par un bot, pas par un webhook

**Choisi.** Un bot avec `Manage Channels`, un salon privé par personne, rattachement
par OAuth2.

**Écarté.** Le webhook unique, que le sujet recommande pourtant.

**Pourquoi.** Un webhook n'écrit que dans le salon auquel il est attaché : tout le
monde lisait les alertes de tout le monde. Or une alerte d'échéance nomme la personne,
son habilitation et sa date d'expiration — c'est une donnée personnelle. **Aucune
adresse e-mail n'est comparée** au rattachement : la preuve tient à la simultanéité,
la même personne tenant une session ouverte ici *et* autorisant là-bas dans le même
aller-retour.

---

## 9. On paie pour agir, jamais pour décider

**Choisi.** Gratuit : le rapprochement, le score détaillé, **la conformité habilitation
par habilitation**, la distance, les disponibilités. Payant : le nom complet, les
coordonnées, le droit de solliciter.

**Écarté.** Un paywall sur les résultats de matching.

**Pourquoi.** Ce produit existe pour empêcher qu'on envoie quelqu'un sur un chantier
sans titre valable : faire payer ce verdict reviendrait à **vendre le risque** plutôt
qu'à le supprimer. Un déblocage porte sur un couple profil × mission, jamais sur un
profil seul — sinon on vend l'accès à une base de candidats, ce que le RGPD ne traite
pas comme une place de marché. L'intérimaire voit combien d'entreprises ont accédé à
ses coordonnées.

**Le paiement est simulé**, et les écrans ne le cachent pas. Ce qui est réel : paliers,
quotas, imputation, idempotence portée par un index unique, transaction.

---

## 10. Le PDF n'est pas généré côté serveur

**Choisi.** Une feuille de style d'impression et le `window.print()` du navigateur.

**Écarté.** Un moteur de rendu embarqué.

**Pourquoi.** Des mégaoctets chargés à chaque appel pour produire ce que le navigateur
fait déjà — et mieux : il respecte les réglages d'impression, la langue et le format de
papier. Même raisonnement qu'au point 7.

---

## 11. Pas de rapport de couverture pour `web`

**Choisi.** Couverture publiée pour `core` seulement. L'écart est chiffré autrement :
39 des 42 routes d'API traversées.

**Écarté.** Publier un rapport `web`.

**Pourquoi.** Ses tests démarrent un vrai serveur dans un **autre processus** ; le
fournisseur v8 n'instrumente que le processus de test et rendrait **0 % sur chaque
fichier**. Publier ce chiffre serait plus trompeur que ne rien publier. Instrumenter
via `NODE_V8_COVERAGE` reste possible, mais le code exécuté est celui du bundle
Turbopack : le rapport serait approximatif, et un chiffre faux est pire qu'un chiffre
absent.

---

## 12. Trois outils qui cherchent ce que les tests ne voient pas

| Outil | Ce qu'il attrape |
|---|---|
| `npm run parcours` | le parcours des deux côtés, **écrans compris** — il s'arrêtait à l'API, et trois pages d'après-affectation ne chargeaient pas |
| `npm run audit` | liens vers une route inexistante, entités HTML dans une chaîne JS, intitulés de menu qui promettent une destination absente |
| `npm run fumee:notifs` | le trajet réel jusqu'à Discord : message posté **puis relu** |

**Pourquoi.** Une suite de tests vérifie qu'un écran répond, pas qu'il mène quelque
part ni qu'il se comprend. Les défauts trouvés à l'œil — un onglet « Profil & CV »
menant à une page sans CV, « Votre prochaine mission » affichant un chantier en cours,
un nom masqué sur une fiche et rendu en clair dans une liste — n'auraient été attrapés
par aucun test d'API. Les trois règles de `npm run audit` ont été éprouvées en
restaurant les fichiers fautifs.

---

## 13. Ce qu'un audit a trouvé, et ce qu'il a laissé passer

*Passe du 22 septembre 2026 : code mort, sécurité, éco-conception.*

**Corrigé.**

- **`/api/compte/email` n'avait aucune limitation de débit**, alors qu'il envoie
  **deux** courriels par appel — un à l'adresse visée, un avertissement à l'ancienne.
  Un compte authentifié devenait un relais d'inondation gratuit vers n'importe quelle
  boîte, en répétant la demande avec des adresses différentes. Le mot de passe exigé
  n'y changeait rien : c'est le titulaire lui-même qui en abuserait. Cinq demandes par
  heure, comptées sur le compte appelant.
- **`commander` était déclaré dans `core`** et utilisé dans `ingest`. Cela
  fonctionnait par remontée des dépendances du monorepo, mais `ingest` se serait
  cassé installé seul.

**Mesuré, et jugé correct.**

| Point | Constat |
|---|---|
| Composants orphelins | aucun |
| Classes CSS mortes | aucune |
| Vulnérabilités (`npm audit`) | zéro |
| Secrets dans le dépôt suivi | aucun ; `.env` n'est pas suivi |
| En-têtes de sécurité | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, et HSTS vérifié **en production** |
| Poids public | 12 Mo d'OCR, mais **un seul cœur de 3,7 Mo** est téléchargé par navigateur, et seulement si la couche texte du PDF a échoué |

**Laissé tel quel, sciemment.** Les insertions d'exigences et de compétences se font
dans une boucle, à la création comme à la modification d'une fiche. C'est un N+1
d'écriture, borné par le nombre d'habilitations d'une mission — quelques unités — et
enfermé dans une transaction. Le regrouper compliquerait la requête pour un gain
qu'aucune mesure ne justifie aujourd'hui.

`/api/deblocages`, `/api/abonnement` et `/api/candidatures` n'ont pas de compteur :
ils n'envoient rien vers l'extérieur, et le premier consomme le crédit de celui qui
l'appelle.

---

## Ce qu'on assume comme non fait

- **L'authenticité des certifications n'est pas vérifiée.** Aucun registre national
  n'est interrogeable ; chaque organisme fournit son propre outil. On structure la
  déclaration, on contrôle les dates, on renvoie vers l'organisme émetteur.
- **Pas de signature électronique, pas de chat, pas de notation.** Hors sujet, sans
  effet sur le reste, ou sensible au regard du RGPD.
- **Le réemploi d'EPI** est une piste écrite, pas une fonctionnalité.
