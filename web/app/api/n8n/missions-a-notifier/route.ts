import { connexion } from "@interimatch/core/db";
import { matcher } from "@interimatch/core";
import { chargerMissions, chargerProfilsParMetiers } from "@/lib/depot";
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

    const notifications = [];
    // Trois requêtes pour l'ensemble des missions, au lieu de trois par mission.
    const missions = await chargerMissions(sql, recentes.map((m) => m.id));
    // Tous les profils concernés en une fois : l'union des métiers des missions.
    const profilsParMetier = await chargerProfilsParMetiers(sql, missions.map((m) => m.metierCode));
    for (const mission of missions) {
      const profils = profilsParMetier.get(mission.metierCode) ?? [];
      const resultat = matcher(mission, profils);
      const identites = new Map(profils.map((p) => [p.interimaireId, p]));

      const contacts = await sql<{ compte_id: number; email: string; discord_salon_id: string | null }[]>`
        select i.compte_id, c.email, c.discord_salon_id
        from interimaire i join compte c on c.id = i.compte_id
        where i.compte_id = any(${resultat.retenus.map((r) => r.interimaireId)})`;

      for (const score of resultat.retenus) {
        const profil = identites.get(score.interimaireId);
        const contact = contacts.find((c) => c.compte_id === score.interimaireId);
        if (!profil || !contact) continue;

        const remuneration =
          mission.tauxHoraireMin === null
            ? ""
            : ` · ${mission.tauxHoraireMin.toFixed(2)} €/h` +
              (mission.tauxHoraireMax && mission.tauxHoraireMax !== mission.tauxHoraireMin
                ? ` à ${mission.tauxHoraireMax.toFixed(2)} €/h`
                : "");

        notifications.push({
          missionId: mission.missionId,
          interimaireId: score.interimaireId,
          nomComplet: `${profil.prenom} ${profil.nom}`,
          email: contact.email,
          discordSalonId: contact.discord_salon_id,
          score: Math.round(score.total * 100),
          distanceKm: score.detail.distanceKm,
          message:
            `**${profil.prenom}**, une mission correspond à votre profil : ` +
            `**${mission.titre}** à ${mission.ville}, ` +
            `du ${new Date(`${mission.dateDebut}T00:00:00Z`).toLocaleDateString("fr-FR")} ` +
            `au ${new Date(`${mission.dateFin}T00:00:00Z`).toLocaleDateString("fr-FR")}` +
            `${remuneration}. ` +
            `À ${score.detail.distanceKm} km de chez vous · compatibilité ${Math.round(score.total * 100)} %.`,
        });
      }
    }

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
