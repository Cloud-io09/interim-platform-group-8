# Scénarios n8n

Les deux flux exigés par le sujet, prêts à importer.

| Fichier | Scénario |
|---|---|
| `1-alerte-echeance.json` | Alerte avant expiration d'une habilitation |
| `2-mission-correspondante.json` | Notification de mission correspondante |

Chacun poste dans le **salon privé du destinataire**, jamais dans un salon commun.

---

## Pourquoi un salon par personne

La première version postait vers une URL de webhook unique. Tout le monde lisait donc
les alertes de tout le monde — or une alerte d'échéance nomme la personne, son
habilitation et sa date d'expiration. Ce sont des données personnelles : les diffuser
à tous les membres d'un serveur est un défaut de confidentialité, pas un détail de
présentation.

Un webhook ne sait qu'écrire dans le salon auquel il est attaché. Créer un salon, et
surtout le restreindre à une personne, relève de l'API du serveur : **il faut un bot**.
C'est la seule voie, pas une préférence d'architecture.

**Aucune adresse e-mail n'est comparée.** Le rattachement repose sur le fait que la
même personne tient une session Intérimatch ouverte *et* autorise sur Discord dans le
même aller-retour OAuth. L'adresse Discord de quelqu'un n'a pas à être celle de son
compte Intérimatch, et nous ne la demandons pas.

---

## Mise en place, une seule fois

### 1. Le serveur Discord

Créez un serveur, ou servez-vous d'un serveur existant. Relevez son identifiant :
*Paramètres utilisateur → Avancés → Mode développeur*, puis clic droit sur l'icône du
serveur → **Copier l'identifiant**. C'est `DISCORD_SERVEUR_ID`.

### 2. L'application Discord

Sur <https://discord.com/developers/applications> → **New Application**.

| Onglet | Ce qu'on y prend, ou y règle |
|---|---|
| **OAuth2** | `Client ID` → `DISCORD_CLIENT_ID` · `Client Secret` → `DISCORD_CLIENT_SECRET` |
| **OAuth2 → Redirects** | Ajouter **exactement** `<URL_PUBLIQUE>/api/discord/retour` |
| **Bot** | *Reset Token* → `DISCORD_BOT_TOKEN`. Ce jeton n'est montré qu'une fois |

**L'URL de retour doit correspondre au caractère près.** C'est la cause d'échec la plus
fréquente : une URL de préversion Vercel change à chaque branche, donc `URL_PUBLIQUE`
doit être figée sur le domaine déclaré ici.

### 3. Inviter le bot dans le serveur

*OAuth2 → URL Generator* :

- **Scopes** : `bot`
- **Bot Permissions** : `Manage Channels`, `Send Messages`, `Create Instant Invite`

Ouvrez l'URL produite et choisissez le serveur.

Les trois permissions servent chacune à une chose, et aucune n'est superflue :
*Manage Channels* crée et supprime le salon, *Send Messages* y poste, *Create Instant
Invite* est ce que Discord exige pour qu'un bot puisse **ajouter un membre** — sans
quoi la personne ne verrait pas le salon créé pour elle.

### 4. Les quatre variables

Dans `.env`, et sur Vercel cochées pour **tous** les environnements où le produit
tourne :

```
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_SERVEUR_ID=
```

### Vérifier, plutôt que deviner

```bash
npm run discord
```

Six choses peuvent manquer, et aucune ne se signale clairement à l'usage : un
rattachement qui échoue affiche « Discord a refusé la création du salon » sans dire
laquelle. L'outil interroge Discord et nomme le point en cause — jeton refusé,
identifiant d'application qui ne correspond pas au bot, URL de retour non déclarée,
bot absent des serveurs, permission manquante.

Quand le bot n'est dans aucun serveur, il rend **l'adresse d'invitation toute faite**,
avec les bonnes permissions. Une fois l'invitation acceptée, il rend le
`DISCORD_SERVEUR_ID` à copier.

`GET /api/sante` couvre le même terrain côté déploiement : il nomme chaque variable
manquante et l'environnement courant, **et demande à Discord si le serveur existe**.
Une variable présente n'est pas une variable juste : l'identifiant d'un salon copié
à la place de celui du serveur passait pour une configuration correcte et n'échouait
qu'au rattachement, chez l'utilisateur, avec un « Unknown Guild » visible des seuls
journaux. Constaté le 21 septembre 2026, puis rendu détectable.

### 5. Relier un compte

Depuis l'espace → **Profil → Notifications sur Discord → Relier mon compte Discord**.
La personne autorise, est ajoutée au serveur, et son salon apparaît avec un message
d'accueil qui explique ce qu'elle y recevra et comment s'en défaire.

---

## Importer les flux

*Workflows → ⋯ → Import from File*, puis **trois valeurs à remplacer**, signalées par
`VOTRE-DOMAINE` et `REMPLACER`.

**1. L'adresse de l'application.** Dans le nœud qui appelle l'API, remplacer
`https://VOTRE-DOMAINE` par le domaine de production, ou par l'alias de branche que
Vercel garde stable :

```
https://<projet>-git-<branche>-<compte>.vercel.app
```

**2. Deux credentials *Header Auth***, créées une fois puis rattachées aux deux flux.

| Nom dans n8n | Champ `Name` | Champ `Value` |
|---|---|---|
| Secret Intérimatch | `x-secret-n8n` | la valeur de `SECRET_N8N` |
| Bot Discord Intérimatch | `Authorization` | `Bot <DISCORD_BOT_TOKEN>` |

Le mot `Bot`, l'espace, puis le jeton — Discord refuse toute autre forme.

**Aucun secret ne doit être saisi dans un nœud** : il partirait dans le JSON exporté,
donc dans le dépôt.

---

## Ce que fait chaque flux

```
Chaque jour
   └─ appel API (credential « Secret Intérimatch »)
        └─ Un message par personne          éclate le tableau rendu
             └─ A un salon privé            écarte qui n'a pas relié son Discord
                  └─ Poster dans le salon   credential « Bot Discord Intérimatch »
```

Le nœud **A un salon privé** n'est pas décoratif : `discordSalonId` vaut `null` pour
qui n'a pas relié son compte, et sans ce filtre l'appel partirait vers
`/channels/null/messages` et échouerait à chaque exécution. Ceux qui sont écartés ne
perdent rien : la notification reste dans leur espace, dont Discord n'est qu'un relais.

Le champ `message` est rédigé côté serveur. n8n transporte, il ne décide pas — aucune
règle métier ne vit dans les flux.

---

## Éprouver

```bash
npm run fumee:notifs                                    # contre le serveur local
npm run fumee:notifs -- https://mon-deploiement.app      # contre un déploiement
```

Vingt-huit vérifications : les quatre types de notification dans l'application, les
deux points d'entrée que n8n interroge, et **le trajet réel jusqu'à Discord** — un
salon privé est créé pour de bon, le message y est posté, puis relu pour vérifier
qu'il est arrivé. Un flux qui « s'allume vert » sans que rien n'atterrisse dans un
salon est précisément ce que cet outil existe pour attraper. Les comptes et le salon
d'essai sont supprimés en fin de parcours, même en cas d'échec.

Puis, dans n8n, bouton **Test workflow**. Chaque nœud s'allume vert l'un après l'autre.

Si rien n'arrive sur Discord, trois causes possibles, dans cet ordre de fréquence :

1. **Personne n'a relié son compte** — le filtre écarte tout le monde. C'est le cas au
   premier essai.
2. **Il n'y a rien à notifier** — le nœud d'éclatement ne produit aucun élément et la
   suite n'est pas exécutée. Le flux ne poste jamais dans le vide.
3. **La credential du bot est mal formée** — le nœud Discord rend `401`. Vérifier le
   préfixe `Bot ` dans la valeur.

Pour forcer des données, élargir la fenêtre dans l'URL :

| Flux | Défaut | Pour voir des données |
|---|---|---|
| Alerte d'échéance | `?jours=90` | `?jours=365` — maximum admis |
| Mission correspondante | `?heures=24` | `?heures=720` — maximum admis |

Au-delà de ces maximums, l'API répond `400` : ce n'est pas une panne, c'est une borne.

Attention au volume : sur le jeu de démonstration, `?heures=720` produit **44
notifications**. Elles se répartissent désormais entre les salons privés au lieu de
tomber dans un seul, mais Discord limite le débit — voir ci-dessous.

---

## Un salon supprimé se recrée tout seul

Un salon effacé à la main — par son titulaire, ou par un administrateur qui fait le
ménage — laissait un identifiant mort en base. Les scénarios continuaient de poster
dessus, Discord répondait `404` à chaque exécution, et personne ne l'apprenait : ni
l'intéressé, qui cessait simplement de recevoir quoi que ce soit, ni nous.

L'application vérifie désormais l'existence du salon quand la personne ouvre
**Profil → Notifications**, et le recrée s'il a disparu. Aucun nouveau consentement
n'est demandé : l'identifiant Discord du titulaire est déjà connu. Une panne de
Discord ne déclenche rien — seul un `404` vaut disparition, sans quoi chaque incident
empilerait un salon de plus.

## Limites de débit

Discord borne sévèrement la **création** de salons. Relier une dizaine de comptes à la
suite peut produire un `429` : le message le dit explicitement plutôt que de le faire
passer pour une erreur de configuration. Il suffit d'attendre et de réessayer.

L'envoi de messages est bien plus permissif ; les volumes d'une démonstration ne
l'atteignent pas.

---

## Avant de committer un nouvel export

```bash
grep -i "secret\|token\|discord.com/api/webhooks" docs/n8n/*.json
```

Seul le **nom** d'une credential doit apparaître, jamais sa valeur, et aucune URL de
webhook. Un secret visible signifie qu'il a été saisi dans un nœud : corriger le flux,
puis remplacer le secret des deux côtés.
