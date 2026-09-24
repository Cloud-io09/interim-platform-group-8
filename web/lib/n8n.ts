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

/**
 * Prévient n8n qu'un événement vient de se produire.
 *
 * **Deux chemins vers n8n, et celui-ci est facultatif.** Les flux planifiés
 * interrogent l'application chaque jour ; cet envoi-ci pousse l'événement au moment
 * où il a lieu, pour qu'une fiche publiée atteigne les intérimaires concernés dans la
 * minute et non le lendemain. Il n'est actif que si `N8N_WEBHOOK_URL` est posée —
 * n8n doit alors être joignable depuis Internet, ce que le flux quotidien n'exige pas.
 *
 * Ne lève jamais et ne retarde personne : il est appelé après la réponse, et une
 * panne de n8n ne doit pas faire échouer une publication. Le secret partagé part en
 * en-tête, le même que n8n présente quand c'est lui qui appelle.
 */
export async function pousserVersN8n(evenement: string, donnees: Record<string, unknown>): Promise<boolean> {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.SECRET_N8N;
  if (!url || !secret) return false;
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/${evenement}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret-n8n": secret,
        // Le tunnel gratuit ngrok intercale une page d'avertissement ; cet en-tête la
        // saute. Sans effet sur tout autre hébergement de n8n.
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({ evenement, emisLe: new Date().toISOString(), ...donnees }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) process.stderr.write(`[n8n] ${evenement} refusé : ${r.status}\n`);
    return r.ok;
  } catch (e) {
    process.stderr.write(`[n8n] ${evenement} injoignable : ${e instanceof Error ? e.message : "inconnu"}\n`);
    return false;
  }
}
