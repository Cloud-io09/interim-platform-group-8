import { connexion } from "@interimatch/core/db";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { compterNonLues, lister, marquerLues, rattraperEcheances } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Notifications du compte connecté, les non lues d'abord. */
export async function GET() {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    // Une échéance n'est déclenchée par aucune action : si le scénario n8n n'a pas
    // tourné, l'alerte est créée ici. L'opération est sans effet quand elle existe.
    if (garde.session.role === "interimaire") {
      await rattraperEcheances(sql, garde.session.compteId);
    }

    return succes({
      notifications: await lister(sql, garde.session.compteId),
      nonLues: await compterNonLues(sql, garde.session.compteId),
    });
  } finally {
    await sql.end();
  }
}

/** Marque des notifications comme lues — toutes, ou celles citées. */
export async function PATCH(requete: Request) {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ ids?: unknown }>(requete);
  const ids = Array.isArray(saisie?.ids)
    ? saisie.ids.map(Number).filter((n) => Number.isInteger(n))
    : undefined;
  if (saisie?.ids !== undefined && ids === undefined) {
    return erreur("Liste d'identifiants invalide.", 422);
  }

  const sql = connexion();
  try {
    return succes({ marquees: await marquerLues(sql, garde.session.compteId, ids) });
  } finally {
    await sql.end();
  }
}
