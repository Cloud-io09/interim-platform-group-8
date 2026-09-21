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


---

## Variables d'environnement sur Vercel

*Ajouté le 2026-09-21, après un lien de réinitialisation resté sans effet en préversion.*

`.env` est ignoré par git : **Vercel n'a que ce qui est saisi dans son tableau de bord**. Une variable oubliée ne fait pas échouer le déploiement, elle change silencieusement le comportement.

| Variable | Portée | Sans elle |
|---|---|---|
| `DATABASE_URL` | production + préversion | rien ne fonctionne |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | production + préversion | ni session ni limitation de tentatives |
| `CLE_CHIFFREMENT` | production + préversion | les colonnes chiffrées deviennent illisibles |
| `BREVO_API_KEY` | production + préversion | **la réinitialisation répond 200 sans rien envoyer** |
| `COURRIEL_EXPEDITEUR` | production + préversion | idem : la clé seule ne suffit pas |
| `COURRIEL_EXPEDITEUR_NOM` | facultatif | « Intérimatch » par défaut |
| `SECRET_N8N` | production | les deux automatisations renvoient 401 |
| `FT_CLIENT_ID` / `FT_CLIENT_SECRET` | ingestion seulement | pas d'ingestion ; le site fonctionne |

### `URL_PUBLIQUE` : à renseigner en production, **pas en préversion**

Elle compose les liens envoyés par courriel. En préversion, chaque déploiement a une URL différente : y figer l'adresse de production enverrait les utilisateurs de la préversion vers le site de production. Laissée vide, l'origine de la requête est utilisée, ce qui est le comportement voulu.

En production derrière un proxy, l'origine de la requête peut valoir une adresse interne — d'où la nécessité de la fixer là.

### Constater la configuration sans lire les logs

`GET /api/sante` rend l'état de chaque dépendance, courriel compris :

```json
"courriel": { "ok": false, "detail": "aucun prestataire : les courriels partent au journal, donc nulle part" }
```

C'est le premier endroit à regarder quand un parcours « répond bien » mais ne produit rien.
