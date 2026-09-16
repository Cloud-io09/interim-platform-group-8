# Déploiement

## Pourquoi la région compte

Les fonctions sont épinglées à **`fra1` (Francfort)** dans [web/vercel.json](../web/vercel.json).

Par défaut, Vercel exécute les fonctions à `iad1` (Washington). Or la base Supabase est en
`eu-central-1` et Redis chez Upstash en Europe : chaque lecture de session — donc *chaque*
requête authentifiée — ferait un aller-retour transatlantique, soit environ 90 ms ajoutées
à chaque appel, plusieurs fois par page. Mesuré en local depuis la France : PostgreSQL
répond en ~110 ms et Redis en ~40 ms. Déployer à Washington multiplierait ces chiffres.

## Configuration du projet Vercel

| Réglage | Valeur |
|---|---|
| Framework | Next.js (détecté) |
| **Root Directory** | `web` |
| Install Command | laisser par défaut — Vercel détecte le workspace npm et installe depuis la racine |
| Node.js | 22.x |

Le dépôt est un workspace npm : `web/` dépend de `@interimatch/core`, qui est publié en
TypeScript source et transpilé par Next (`transpilePackages` dans
[web/next.config.ts](../web/next.config.ts)). Il ne faut donc **pas** réduire le contexte de
build au seul dossier `web/`.

## Variables d'environnement à déclarer

Mêmes noms qu'en local, à reprendre depuis `.env` (jamais versionné) :

| Variable | Source |
|---|---|
| `DATABASE_URL` | Supabase → Database → Connection pooling, **mode Transaction, port 6543** |
| `UPSTASH_REDIS_REST_URL` | Upstash → base → bloc REST API |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash → base → bloc REST API |
| `CLE_CHIFFREMENT` | `openssl rand -base64 32` |
| `FT_CLIENT_ID` | francetravail.io |
| `FT_CLIENT_SECRET` | francetravail.io |
| `SECRET_N8N` | chaîne aléatoire, partagée avec n8n |

**Le port 6543 n'est pas un détail.** En serverless, chaque invocation ouvre sa propre
connexion ; sans le pooler, la base sature à quelques dizaines de requêtes concurrentes.
La connexion directe (`db.<ref>.supabase.co:5432`) est en outre IPv6 uniquement.

## Vérifier qu'un déploiement est sain

```bash
curl -s https://<domaine>/api/sante | python3 -m json.tool
```

La sonde interroge réellement PostgreSQL et Redis, et rend `503` si l'un des deux ne
répond pas. Elle sert à valider la chaîne complète — fonction serverless → pooler
Supabase → Upstash — et pas seulement que le site s'affiche.

Réponse attendue :

```json
{
  "ok": true,
  "services": {
    "postgres": { "ok": true, "latenceMs": 109, "detail": "52 métiers actifs, 5 types de certification" },
    "cache":    { "ok": true, "latenceMs": 39,  "detail": "PONG" }
  }
}
```
