# Exports des scénarios n8n

Déposer ici les `.json` produits par *⋯ → Download* dans n8n. Le sujet les demande
comme livrable.

**Avant de committer**, vérifier qu'aucun secret n'a fui dans l'export :

```bash
grep -i "secret\|token\|webhook" docs/n8n/*.json
```

Seul le **nom** d'une credential doit apparaître, jamais sa valeur. Un secret visible
signifie qu'il a été saisi directement dans un nœud au lieu d'une credential : corriger
le flux, puis remplacer le secret des deux côtés.

L'URL du webhook Discord est elle aussi un secret — quiconque la détient peut poster
dans le salon. Si elle apparaît dans l'export, la ranger en credential et en régénérer
une depuis Discord.
