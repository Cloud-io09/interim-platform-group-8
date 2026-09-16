/**
 * Navigation après un changement de session.
 *
 * On force un rechargement complet plutôt qu'une navigation côté client : le routeur
 * de Next conserve en cache les pages déjà rendues, et après un changement de compte
 * il servirait à un intérimaire des écrans rendus pour une entreprise. Un
 * `router.refresh()` ne vide pas ce cache pour les routes déjà visitées.
 */
export function rechargerVers(chemin: string): void {
  window.location.assign(chemin);
}

export interface ReponseApi<T = Record<string, unknown>> {
  ok: boolean;
  message?: string;
  problemes?: { champ: string; message: string }[];
  donnees: T;
}

/** Appel JSON uniforme : le corps est toujours lu, même en erreur. */
export async function envoyerJson<T = Record<string, unknown>>(
  chemin: string,
  methode: string,
  corps?: unknown
): Promise<{ statut: number; ok: boolean; corps: T & { message?: string; problemes?: { champ: string; message: string }[] } }> {
  const reponse = await fetch(chemin, {
    method: methode,
    headers: { "Content-Type": "application/json" },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  let lu: unknown = null;
  try {
    lu = await reponse.json();
  } catch {
    lu = { message: "Réponse illisible du serveur." };
  }
  return { statut: reponse.status, ok: reponse.ok, corps: lu as never };
}
