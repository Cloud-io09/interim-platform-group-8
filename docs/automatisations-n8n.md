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
