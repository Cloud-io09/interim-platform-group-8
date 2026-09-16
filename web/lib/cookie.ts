/**
 * Nom du cookie de session, isolé dans son propre module.
 *
 * Le middleware s'exécute dans un contexte restreint, sans `next/headers` ni accès
 * réseau : importer le module de session entier l'y ferait échouer.
 */
export const NOM_COOKIE = "interimatch_session";
