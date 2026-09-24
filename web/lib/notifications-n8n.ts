import type { Sql } from "postgres";
import { after } from "next/server";
import { connexion } from "@interimatch/core/db";
import { pousserVersN8n } from "./n8n";
import { matcher } from "@interimatch/core";
import { chargerMissions, chargerProfilsParMetiers } from "./depot";

export interface NotificationMission {
  missionId: number;
  interimaireId: number;
  nomComplet: string;
  email: string;
  discordSalonId: string | null;
  score: number;
  distanceKm: number;
  message: string;
}

/**
 * Qui prévenir pour ces missions, et quoi leur dire.
 *
 * Partagé par les deux chemins qui mènent à n8n : la route que le flux quotidien
 * interroge, et l'envoi immédiat à la publication d'une fiche. Une seule logique,
 * donc un seul message et une seule liste de destinataires, quel que soit le chemin.
 *
 * Le matching est rejoué plutôt que lu au cache : une notification adressée à
 * quelqu'un qui n'est plus conforme serait pire que pas de notification du tout.
 */
export async function notificationsDeMissions(
  sql: Sql,
  missionIds: readonly number[]
): Promise<NotificationMission[]> {
  const notifications: NotificationMission[] = [];
  // Trois requêtes pour l'ensemble des missions, au lieu de trois par mission.
  const missions = await chargerMissions(sql, [...missionIds]);
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
  return notifications;
}

/**
 * Pousse vers n8n les destinataires d'une fiche qui vient d'être publiée.
 *
 * Programmé avec `after()` : la publication répond d'abord, le rapprochement et
 * l'envoi se font ensuite. Une fonction Vercel coupe les promesses laissées en l'air
 * dès que la réponse part ; `after()` est le moyen prévu pour les laisser finir.
 */
export function annoncerPublication(missionId: number): void {
  if (!process.env.N8N_WEBHOOK_URL) return;
  after(async () => {
    const sql = connexion();
    const notifications = await notificationsDeMissions(sql, [missionId]);
    await pousserVersN8n("mission-publiee", { missionId, notifications });
  });
}
