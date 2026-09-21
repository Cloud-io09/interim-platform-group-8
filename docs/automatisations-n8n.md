# Automatisations n8n

Deux scénarios, tous deux en **flux tiré** : n8n interroge l'application, met en forme,
et poste sur Discord.

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

## Montage du flux n8n

```
Schedule Trigger ──▶ HTTP Request ──▶ Split Out (alertes / notifications) ──▶ Discord
   (cron)              GET + en-tête        un élément par message
```

Le champ `message` est prêt à poster : n8n n'a pas à connaître nos règles métier.
Le webhook Discord se crée dans : salon dédié → Paramètres du serveur → Intégrations
→ Webhooks → Nouveau webhook.

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
