import { timingSafeEqual } from "node:crypto";

/**
 * Authentification des endpoints appelés par n8n.
 *
 * Secret partagé plutôt qu'une session : n8n n'est pas un utilisateur, il n'a pas de
 * compte, et lui en créer un donnerait à une automatisation des droits qu'on ne
 * saurait plus restreindre.
 *
 * Comparaison en temps constant : un `===` s'arrête au premier octet différent et
 * laisse deviner le secret par la durée de réponse, octet par octet.
 */
export function n8nAutorise(requete: Request): boolean {
  const attendu = process.env.SECRET_N8N;
  if (!attendu || attendu.length === 0) return false;

  const fourni = requete.headers.get("x-secret-n8n") ?? "";
  const a = Buffer.from(fourni);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function refusN8n(): Response {
  return Response.json({ ok: false, message: "Secret partagé invalide." }, { status: 401 });
}
