# Scénarios n8n

Les deux flux exigés par le sujet, prêts à importer.

| Fichier | Scénario |
|---|---|
| `1-alerte-echeance.json` | Alerte avant expiration d'une habilitation |
| `2-mission-correspondante.json` | Notification de mission correspondante |

**Ces fichiers ont été importés et exécutés** sur n8n 2.8.4 le 2026-09-21, contre
l'application réelle : les quatre nœuds traversés, un message posté sur Discord, aucune
erreur. Ce ne sont pas des modèles écrits à la main en espérant qu'ils fonctionnent.

---

## Importer

*Workflows → ⋯ → Import from File*, puis **trois valeurs à remplacer**, signalées par
`VOTRE-DOMAINE` et `REMPLACER` :

**1. L'adresse de l'application.** Dans le nœud qui appelle l'API, remplacer
`https://VOTRE-DOMAINE` par le domaine de production, ou par l'alias de branche que
Vercel garde stable :

```
https://<projet>-git-<branche>-<compte>.vercel.app
```

**2. La credential.** Le nœud d'appel attend une credential *Header Auth*. La créer une
seule fois — *Credentials → New → Header Auth* — avec :

| Champ | Valeur |
|---|---|
| Name | `x-secret-n8n` |
| Value | la valeur de `SECRET_N8N` |

Puis la rattacher aux deux flux. **Le secret ne doit jamais être saisi dans le nœud
lui-même** : il partirait dans le JSON exporté, donc dans le dépôt.

**3. Le webhook Discord.** Dans le dernier nœud, remplacer l'URL par celle du webhook :
salon → *Paramètres du salon* → *Intégrations* → *Webhooks* → *Nouveau webhook*.

L'URL d'un webhook est un secret : quiconque la détient peut poster dans le salon. Elle
n'est pas dans ces fichiers, et ne doit pas y revenir.

---

## Éprouver

Bouton **Test workflow**. Chaque nœud s'allume vert l'un après l'autre.

Si rien n'arrive sur Discord, c'est probablement qu'il n'y a **rien à notifier** — et
c'est le comportement voulu : sans alerte, le nœud d'éclatement ne produit aucun
élément et le nœud Discord n'est pas exécuté. Le flux ne poste jamais dans le vide.
Vérifié à l'exécution.

Pour forcer des données, élargir la fenêtre dans l'URL :

| Flux | Défaut | Pour voir des données |
|---|---|---|
| Alerte d'échéance | `?jours=90` | `?jours=365` — maximum admis |
| Mission correspondante | `?heures=24` | `?heures=720` — maximum admis |

Au-delà de ces maximums, l'API répond `400` : ce n'est pas une panne, c'est une borne.

Attention au volume : sur le jeu de démonstration, `?heures=720` produit **44
notifications**, donc 44 messages Discord. Garder les fenêtres par défaut en usage
normal.

---

## Avant de committer un nouvel export

```bash
grep -i "secret\|token\|discord.com/api" docs/n8n/*.json
```

Seul le **nom** d'une credential doit apparaître, jamais sa valeur, et aucune URL de
webhook. Un secret visible signifie qu'il a été saisi dans un nœud : corriger le flux,
puis remplacer le secret des deux côtés.
