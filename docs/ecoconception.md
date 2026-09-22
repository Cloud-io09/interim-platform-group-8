# Éco-conception — pratiques RGESN appliquées

Le sujet demande **au moins deux pratiques concrètes, appliquées et documentées**. Ce document en recense cinq, chacune avec la mesure qui la justifie et l'endroit du code où elle vit. Une optimisation dont on ne peut pas montrer l'effet n'est pas une optimisation, c'est une intention.

Toutes les mesures ont été prises sur le serveur de production local (`next start`), le 18 septembre 2026.

---

## 1. Réduction du poids transféré — RGESN 4.4

**Pratique.** Compression HTTP activée, et aucune image sur les pages publiques : le logo est un SVG, la charte n'emploie ni photographie ni illustration décorative.

**Mesuré.** Page d'accueil : **22 506 octets bruts → 5 114 octets transférés**, soit une réduction de 77 %. Zéro requête image, une feuille de style.

**Où.** `compress: true` dans [web/next.config.ts](../web/next.config.ts). Formats modernes déclarés (`avif`, `webp`) pour les images que le produit pourrait ajouter plus tard.

**Ce que ça ne règle pas.** 170 Ko de JavaScript compressé restent nécessaires à l'hydratation de l'accueil. C'est le coût du framework, pas du produit — le réduire supposerait d'abandonner React sur les pages publiques, arbitrage non fait dans le temps imparti. Il est noté ici plutôt que passé sous silence.

---

## 2. Chargement différé des ressources lourdes — RGESN 4.7

**Pratique.** Le moteur de reconnaissance de caractères pèse 4,5 Mo : cœur WebAssembly et modèle de langue française. Il n'est **jamais téléchargé tant qu'un document n'en a pas besoin**.

**Mesuré.** Un CV PDF muni d'une couche texte est lu en 0,5 s sans télécharger un seul octet de Tesseract. Seul un scan ou une photo déclenche le chargement. La majorité des CV ayant une couche texte, la majorité des dépôts ne paie rien.

**Où.** `await import("tesseract.js")` dans [web/lib/lecture-cv.ts](../web/lib/lecture-cv.ts), appelé uniquement après constat que la couche texte rend moins de 120 caractères.

---

## 3. Calcul déporté sur l'appareil de l'utilisateur — RGESN 2.3

**Pratique.** La lecture des CV s'exécute dans le navigateur, pas sur le serveur.

**Pourquoi c'est un gain.** Une fonction serverless sans état recharge le moteur à chaque requête — douze mégaoctets décompressés, à chaque dépôt. Le navigateur, lui, le met en cache. Le premier choix d'implémentation était côté serveur ; il produisait des passerelles expirées et rechargeait le moteur indéfiniment.

**Effet secondaire, et il compte autant :** le document ne quitte pas l'appareil de son propriétaire.

**Où.** [web/lib/lecture-cv.ts](../web/lib/lecture-cv.ts).

---

## 4. Réduction du nombre de requêtes en base — RGESN 5.2

**Pratique.** Les écrans qui affichent plusieurs missions chargent **toutes** les missions et **tous** les profils concernés en un nombre fixe de requêtes, au lieu d'une série par mission.

**Mesuré.** Avec 73 missions en base :

| Écran | Avant | Après |
|---|---|---|
| Endpoint n8n « missions à notifier » | 20 s | 2,1 s |
| Tableau de bord entreprise | 10 s | 0,47 s |

**Où.** `chargerMissions` et `chargerProfilsParMetiers` dans [web/lib/depot.ts](../web/lib/depot.ts) : trois et quatre requêtes au total, quel que soit le nombre de missions. La lecture de profil est mémoïsée par requête avec `cache()` de React, le layout et la page la demandant chacun de leur côté.

---

## 5. Cache évitant recalculs et appels externes — RGESN 5.1

**Pratique.** Trois caches Redis, chacun avec une durée de vie choisie et une invalidation explicite.

- **Résultats de matching** — un calcul parcourt tous les profils d'un métier. TTL court, invalidé dès qu'une mission ou un profil concerné change.
- **Géocodage** — un couple commune / code postal ne bouge pas. TTL de 30 jours. **On n'interroge pas deux fois un service public pour la même adresse**, et la plateforme reste debout quand ce service est indisponible.
- **Référentiels** — métiers et compétences servis avec `revalidate`, ils changent au rythme des ingestions, pas des requêtes.

**Où.** [core/src/redis.ts](../core/src/redis.ts) pour les clés et les TTL, [core/src/geocodage.ts](../core/src/geocodage.ts) pour le cache d'adresses.

---

## Ce qui a été écarté, et pourquoi

**Recherche plein texte sur les CV.** Techniquement peu coûteuse, mais elle reviendrait à chercher des candidats par mots-clés — le contre-modèle exact que le produit oppose à ses concurrents. Écartée pour raison produit, pas pour raison technique.

**Images de mission.** Un chantier n'a pas besoin de photo pour être compris ; en ajouter une par fiche ferait passer une liste de dix missions de quelques kilo-octets à plusieurs mégaoctets, pour rien.

**Police web.** Aucune n'est chargée : la charte s'appuie sur la pile système. Zéro requête, zéro décalage de mise en page au chargement.

---

## Le PDF n'est pas généré côté serveur

Le document de mission s'enregistre par l'impression du navigateur, pas par un moteur
de rendu embarqué dans une fonction sans état.

**Ce qu'on évite.** Une génération serveur aurait demandé de charger un navigateur
sans interface à chaque appel — plusieurs mégaoctets et quelques secondes de calcul,
pour produire ce que le navigateur de la personne fait déjà, et mieux : il respecte
ses réglages d'impression, sa langue et son format de papier.

**Même raisonnement que la lecture de CV**, passée côté navigateur pour les mêmes
motifs. Une feuille de style d'impression coûte quelques lignes de CSS et zéro octet
transféré en plus.
