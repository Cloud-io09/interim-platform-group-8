# Automatisations n8n

Deux scénarios, tous deux en **flux tiré** : n8n interroge l'application, met en forme,
et poste dans le salon Discord privé de chaque destinataire.

## Pourquoi tiré et non poussé

n8n tourne sur une machine sans URL publique. L'application, hébergée sur Vercel, ne
peut donc pas l'appeler. Si elle postait directement sur Discord, n8n ne serait plus
dans la boucle et l'exigence d'automatisation ne serait satisfaite qu'à moitié.

En inversant le sens, n8n redevient la couche d'automatisation : il décide de la
cadence, met en forme, gère les échecs et les reprises. L'application se contente
d'exposer des données prêtes à poster — elle ne connaît ni Discord ni n8n.

## Authentification

Les deux endpoints exigent l'en-tête `x-secret-n8n`, comparé en **temps constant** à
la variable `SECRET_N8N`. Un `===` s'arrêterait au premier octet différent et
laisserait deviner le secret par la durée de réponse.

Secret partagé plutôt qu'un compte : n8n n'est pas un utilisateur. Lui créer un compte
donnerait à une automatisation des droits qu'on ne saurait plus restreindre.

## Scénario 1 — alerte avant expiration

```
GET /api/n8n/certifications-expirantes?jours=60
x-secret-n8n: <SECRET_N8N>
```

Rend les certifications arrivant à échéance dans la fenêtre, **avec le nombre de
missions ouvertes qu'un renouvellement rouvrirait**. C'est ce chiffre qui rend
l'alerte actionnable : sans lui, c'est une contrainte administrative ; avec, c'est un
argument.

Le calcul ne compte que les missions dont la date de fin dépasse l'échéance actuelle —
une mission déjà couverte par le titre en cours ne serait « débloquée » par rien.

```json
{
  "alertes": [{
    "nomComplet": "Sofiane Roux",
    "certification": "CACES R482 — engins de chantier catégorie B1",
    "dateEcheance": "2026-10-10",
    "joursRestants": 24,
    "missionsDebloquees": 1,
    "message": "**Sofiane**, votre CACES R482 … expire dans 24 jours … Le renouveler vous rouvrirait **1 mission** actuellement ouverte."
  }]
}
```

**Cadence conseillée** : une fois par jour. La fenêtre de 60 jours laisse le temps de
repasser un CACES.

## Scénario 2 — notification de mission correspondante

```
GET /api/n8n/missions-a-notifier?heures=24
x-secret-n8n: <SECRET_N8N>
```

Rend, pour chaque mission publiée dans la fenêtre, les intérimaires qui **passent le
filtre éliminatoire**, avec leur score.

Le matching est rejoué à chaque appel plutôt que lu au cache : notifier quelqu'un qui
n'est plus conforme reviendrait à l'inviter sur un chantier où il ne peut pas aller.

**Cadence conseillée** : toutes les heures avec `heures=1`, ou une fois par jour avec
`heures=24`. Fenêtre et cadence doivent correspondre, sinon on notifie deux fois ou
on manque des missions.

## Partager le secret quand n8n tourne sur un autre poste

*Ajouté le 2026-09-21 : n8n tourne sur le portable d'une collègue, pas sur le serveur.*

Ce n'est pas un problème, parce que le flux est **tiré**. n8n fait des appels sortants
vers une URL publique ; il n'a jamais besoin d'être joignable depuis l'extérieur, donc
ni tunnel, ni ouverture de port, ni adresse fixe. Un portable derrière une box suffit.

Il reste une seule chose à faire circuler : une chaîne de caractères.

### 1. Générer le secret

```bash
openssl rand -base64 32
```

### 2. Le poser côté application

Dans Vercel → Settings → Environment Variables → `SECRET_N8N`. **Cocher les
environnements où les tests auront lieu** : une variable ajoutée à « Production » seule
laisse la préversion répondre `401`. Puis **relancer un déploiement** — une variable
ajoutée ne s'applique pas à un déploiement déjà en ligne.

### 3. Le poser côté n8n, **comme une credential et non dans le nœud**

Dans n8n : *Credentials → New → Header Auth*, nom de l'en-tête `x-secret-n8n`, valeur
le secret. Le nœud HTTP Request s'y rattache ensuite par référence.

**Ce point n'est pas cosmétique.** Le sujet demande de livrer l'export des scénarios
n8n. Un secret saisi directement dans le nœud **part dans le JSON exporté**, donc dans
le dépôt. Une credential est stockée à part et n'apparaît pas dans l'export : on peut
donc verser le scénario au dépôt sans verser le secret avec.

### 4. Quelle URL viser

L'adresse d'un déploiement de préversion change à chaque commit. n8n doit donc viser
soit le domaine de production, soit **l'alias de branche** que Vercel maintient stable :

```
https://<projet>-git-<branche>-<compte>.vercel.app
```

### 5. Transmettre le secret

Par un canal privé — gestionnaire de mots de passe, message direct. Pas dans un salon
d'équipe, pas dans le dépôt. S'il fuite, le remplacer coûte une variable d'environnement
et une credential : c'est la raison même du secret partagé plutôt que d'un compte.

### Ce que ça protège, et ce que ça ne protège pas

Ces endpoints sont publics, protégés par un secret partagé posé sur un poste de
travail. C'est proportionné à ce qu'ils exposent — des rappels d'échéance et des
rapprochements déjà calculés — et à la durée de vie d'un POC. Ce ne serait pas
suffisant pour un service en production détenant des données de paie.

## Le plus rapide : importer les flux déjà faits

Les deux scénarios sont dans [`n8n/`](n8n/), **importés et exécutés** sur n8n 2.8.4 le
2026-09-21 contre l'application réelle. Trois valeurs à remplacer, et c'est monté :
l'adresse de l'application, les deux credentials. Marche à suivre
dans [`n8n/LISEZ-MOI.md`](n8n/LISEZ-MOI.md).

La section qui suit reste utile pour comprendre ce que fait chaque nœud, ou pour
remonter un flux de zéro.

## Montage du flux n8n, pas à pas

*Récrit le 2026-09-21 : la version précédente supposait qu'on savait déjà se servir
de n8n.*

### Avant de toucher à n8n : vérifier que la donnée arrive

Ne montez pas le flux en aveugle. Si l'endpoint ne répond pas, vous chercherez
l'erreur dans n8n alors qu'elle est ailleurs.

```bash
curl -s -H "x-secret-n8n: <le-secret>" \
  "https://<domaine>/api/n8n/certifications-expirantes?jours=90"
```

Trois réponses possibles, et une seule est un problème de n8n :

| Réponse | Ce que ça veut dire |
|---|---|
| `{"ok":true,"alertes":[...]}` | tout va bien, montez le flux |
| `{"ok":true,"alertes":[]}` | ça marche, mais aucune habilitation n'expire dans la fenêtre — élargissez avec `?jours=3650` pour voir des données |
| `401` | le secret ne correspond pas, ou `SECRET_N8N` est absente de cet environnement |

### 1. Lancer n8n

Sur le poste qui l'hébergera, avec Node installé :

```bash
npx n8n
```

n8n s'ouvre sur `http://localhost:5678`. **Il ne tourne que tant que ce terminal est
ouvert** : un flux programmé ne se déclenchera pas portable fermé. Pour la soutenance,
on déclenche à la main — voir plus bas.

### 2. Créer le flux et son déclencheur

*Workflows → Add workflow*. Sur la toile vide, cliquer le **+**, chercher
**Schedule Trigger**, l'ajouter.

Réglage : *Trigger Interval* → `Days`, *Days Between Triggers* → `1`. Une alerte
d'échéance n'a aucune raison de partir plus souvent qu'une fois par jour.

### 3. Ajouter l'appel à l'API

Cliquer le **+** à droite du déclencheur, chercher **HTTP Request**.

| Champ | Valeur |
|---|---|
| Method | `GET` |
| URL | `https://<domaine>/api/n8n/certifications-expirantes?jours=90` |
| Authentication | `Generic Credential Type` |
| Generic Auth Type | `Header Auth` |

Puis *Credential for Header Auth* → **Create new credential** :

| Champ | Valeur |
|---|---|
| Name | `x-secret-n8n` |
| Value | le secret partagé |

Nommer la credential, par exemple « Secret Intérimatch », et enregistrer.

**C'est ici que le secret doit vivre, et nulle part ailleurs.** Saisi dans le nœud, il
partirait dans le JSON exporté — donc dans le dépôt. Rangé en credential, il n'apparaît
pas dans l'export.

Cliquer **Test step** : la sortie doit montrer l'objet avec son tableau `alertes`.

### 4. Séparer les alertes en messages

L'API renvoie **un objet contenant un tableau**. Discord attend **un message par
destinataire**. Il faut donc éclater le tableau.

**+** → **Split Out**. *Fields To Split Out* → `alertes`.

Après ce nœud, chaque élément est une alerte, et `{{ $json.message }}` désigne son
message. S'il n'y a aucune alerte, le nœud ne produit rien et la suite ne s'exécute
pas : le flux ne poste donc jamais dans le vide.

### 5. Écarter qui n'a pas relié son Discord

**+** → **Filter**. Condition : `{{ $json.discordSalonId }}` — *String* → *is not
empty*.

Ce nœud n'est pas décoratif. `discordSalonId` vaut `null` pour qui n'a pas rattaché son
compte, et sans lui l'appel suivant partirait vers `/channels/null/messages` et
échouerait à chaque exécution. Ceux qui sont écartés ne perdent rien : la notification
reste dans leur espace, dont Discord n'est qu'un relais.

### 6. Poster dans le salon privé du destinataire

Un second **HTTP Request** — plus stable d'une version de n8n à l'autre que le nœud
Discord natif, dont l'interface bouge.

| Champ | Valeur |
|---|---|
| Method | `POST` |
| URL | `https://discord.com/api/v10/channels/{{ $json.discordSalonId }}/messages` |
| Authentication | `Generic Credential Type` → `Header Auth` |
| Credential | *Bot Discord Intérimatch* |
| Send Body | activé |
| Body Content Type | `JSON` |
| Specify Body | `Using Fields Below` |
| Name | `content` |
| Value | `{{ $json.message }}` |

**L'URL porte l'identifiant du salon de chaque destinataire**, et c'est tout l'objet du
changement : la première version postait vers un webhook unique, donc tout le monde
lisait les alertes de tout le monde. Une alerte d'échéance nomme la personne, son
habilitation et sa date d'expiration — la diffuser à tout un serveur était un défaut de
confidentialité.

La credential *Bot Discord Intérimatch* est une **Header Auth** :

| Champ | Valeur |
|---|---|
| Name | `Authorization` |
| Value | `Bot <DISCORD_BOT_TOKEN>` |

Le mot `Bot`, un espace, puis le jeton. Discord refuse toute autre forme, et répond
`401`.

La création du bot, ses permissions et le rattachement des comptes sont décrits dans
[`n8n/LISEZ-MOI.md`](n8n/LISEZ-MOI.md).

### 7. Éprouver le flux

Bouton **Test workflow**, en bas de la toile. Chaque nœud s'allume vert l'un après
l'autre, et le message doit apparaître dans Discord.

Si un nœud passe au rouge, son panneau de sortie affiche la réponse HTTP reçue : un
`401` vient du secret, un `400` d'un paramètre d'URL, un `404` d'une faute dans le
chemin.

### 8. Le second scénario

Dupliquer le flux (*⋯ → Duplicate*) et changer deux choses :

| | Scénario 1 | Scénario 2 |
|---|---|---|
| URL | `…/certifications-expirantes?jours=90` | `…/missions-a-notifier?heures=24` |
| Split Out | `alertes` | `notifications` |

Le reste est identique : le champ `message` est prêt dans les deux cas.

### 8. Livrer l'export

Le sujet demande l'export des scénarios. *⋯ → Download* produit un `.json` à ranger
dans `docs/n8n/`. **Vérifier avant de le committer** que le secret n'y figure pas :

```bash
grep -i "x-secret-n8n\|secret" docs/n8n/*.json
```

Seul le **nom** de la credential doit apparaître, jamais sa valeur. Si vous y trouvez
le secret, c'est qu'il a été saisi dans le nœud plutôt qu'en credential : refaites
l'étape 3, puis changez le secret des deux côtés.

### Pour la soutenance

Un n8n local ne tourne que pendant qu'il est ouvert. Le jour J, ne comptez pas sur la
programmation : ouvrez le flux et cliquez **Test workflow** devant le jury. C'est aussi
plus démonstratif — on voit la donnée traverser chaque nœud.

Pour qu'il y ait quelque chose à montrer, `?jours=3650` garantit des alertes quelle que
soit la base.

## Vérifier sans n8n

```bash
SECRET=$(grep '^SECRET_N8N=' .env | cut -d= -f2-)
curl -s -H "x-secret-n8n: $SECRET" \
  "https://<domaine>/api/n8n/certifications-expirantes?jours=60" | python3 -m json.tool
```

Un `401` signifie l'une de deux choses, et une seule : le secret ne correspond pas, ou
`SECRET_N8N` est absente de l'environnement visé. La garde échoue fermée — secret
absent, accès refusé — donc un déploiement sans la variable rend les automatisations
inutilisables plutôt que ouvertes.
