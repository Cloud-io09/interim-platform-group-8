import type { Probleme } from "@interimatch/core";

/** Réponse d'erreur uniforme, pour que le front n'ait qu'un format à interpréter. */
export function erreur(
  message: string,
  status: number,
  problemes: Probleme[] = []
): Response {
  return Response.json({ ok: false, message, problemes }, { status });
}

export function succes(donnees: Record<string, unknown>, status = 200): Response {
  return Response.json({ ok: true, ...donnees }, { status });
}

/** Corps JSON, ou `null` si la requête n'en porte pas un valide. */
export async function corpsJson<T>(requete: Request): Promise<T | null> {
  try {
    return (await requete.json()) as T;
  } catch {
    return null;
  }
}
