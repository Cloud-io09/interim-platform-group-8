import { connexion } from "@interimatch/core/db";
import { notificationsDeMissions } from "@/lib/notifications-n8n";
import { n8nAutorise, refusN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

/** Fenêtre de publication examinée par défaut, en heures. */
const HEURES_PAR_DEFAUT = 24;

/**
 * Scénario n8n n° 2 — notification de mission correspondante.
 *
 * Flux tiré et non poussé : n8n tourne hors ligne publique, l'application ne peut
 * pas l'appeler. Il interroge donc cet endpoint à intervalle régulier, et poste
 * lui-même sur Discord.
 *
 * Le matching est rejoué ici plutôt que lu au cache : une notification adressée à
 * quelqu'un qui n'est plus conforme serait pire que pas de notification du tout.
 */
export async function GET(requete: Request) {
  if (!n8nAutorise(requete)) return refusN8n();

  const heures = Number(new URL(requete.url).searchParams.get("heures") ?? HEURES_PAR_DEFAUT);
  if (!Number.isFinite(heures) || heures <= 0 || heures > 720) {
    return Response.json({ ok: false, message: "Paramètre « heures » invalide." }, { status: 400 });
  }

  const sql = connexion();
  try {
    const recentes = await sql<{ id: number }[]>`
      select id from mission
      where statut = 'publiee'
        and publiee_le >= now() - make_interval(hours => ${heures}::int)
        and date_fin >= current_date
      order by publiee_le desc
      limit 50`;

    const notifications = await notificationsDeMissions(sql, recentes.map((m) => m.id));

    return Response.json({
      ok: true,
      genereLe: new Date().toISOString(),
      fenetreHeures: heures,
      missionsExaminees: recentes.length,
      notifications,
    });
  } finally {
    await sql.end();
  }
}
