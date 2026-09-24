import { connexion } from "@interimatch/core/db";
import { matcher } from "@interimatch/core";
import { chargerMissions, chargerProfilsParMetiers } from "@/lib/depot";
import { n8nAutorise, refusN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

/** Délai par défaut avant relance. Une semaine ouverte sans suite mérite un rappel. */
const JOURS_PAR_DEFAUT = 7;

/**
 * Scénario n8n n° 3 — relance des missions non pourvues.
 *
 * **Le seul flux adressé à l'entreprise**, et il répare une asymétrie : les deux
 * autres ne parcourent que des intérimaires, si bien qu'une entreprise ayant
 * rattaché son Discord obtenait un salon où rien n'arrivait jamais.
 *
 * **La relance n'est utile que si elle dit quoi faire.** « Votre fiche est ouverte
 * depuis huit jours » est un reproche ; « huit jours, et trois profils conformes que
 * vous n'avez pas encore sollicités » est une action. Le moteur est donc rejoué pour
 * compter ce qui est réellement mobilisable — et quand il ne reste personne, le
 * message le dit aussi, parce que la conduite à tenir est alors différente :
 * élargir le rayon, revoir les habilitations exigées, ou la rémunération.
 */
export async function GET(requete: Request) {
  if (!n8nAutorise(requete)) return refusN8n();

  const jours = Number(new URL(requete.url).searchParams.get("jours") ?? JOURS_PAR_DEFAUT);
  if (!Number.isFinite(jours) || jours <= 0 || jours > 90) {
    return Response.json({ ok: false, message: "Paramètre « jours » invalide." }, { status: 400 });
  }

  const sql = connexion();
  try {
    // Ouvertes depuis assez longtemps, et pas encore commencées : relancer sur un
    // chantier qui a déjà démarré n'aurait plus d'objet.
    const enSouffrance = await sql<{ id: number }[]>`
      select id from mission
      where statut = 'publiee'
        and publiee_le <= now() - make_interval(days => ${jours}::int)
        and date_debut >= current_date
      order by publiee_le
      limit 50`;

    if (enSouffrance.length === 0) {
      return Response.json({ ok: true, genereLe: new Date().toISOString(), fenetreJours: jours, relances: [] });
    }

    const missions = await chargerMissions(sql, enSouffrance.map((m) => m.id));
    const profilsParMetier = await chargerProfilsParMetiers(sql, missions.map((m) => m.metierCode));

    const ids = missions.map((m) => m.missionId);
    const candidatures = await sql<{ mission_id: number; interimaire_id: number; statut: string }[]>`
      select mission_id, interimaire_id, statut from candidature where mission_id = any(${ids})`;
    const contacts = await sql<
      { compte_id: number; raison_sociale: string; email: string; discord_salon_id: string | null }[]
    >`
      select e.compte_id, e.raison_sociale, c.email, c.discord_salon_id
      from entreprise e join compte c on c.id = e.compte_id
      where e.compte_id = any(${missions.map((m) => m.entrepriseId)})`;

    const relances = [];
    for (const mission of missions) {
      const profils = profilsParMetier.get(mission.metierCode) ?? [];
      const retenus = matcher(mission, profils).retenus;
      const surCetteMission = candidatures.filter((c) => c.mission_id === mission.missionId);
      const dejaEnLice = new Set(surCetteMission.map((c) => c.interimaire_id));

      // Conformes que personne n'a encore approchés : c'est le seul chiffre sur
      // lequel l'entreprise peut agir tout de suite.
      const mobilisables = retenus.filter((r) => !dejaEnLice.has(r.interimaireId)).length;
      const enAttente = surCetteMission.filter((c) => c.statut === "candidatee").length;
      const contact = contacts.find((c) => c.compte_id === mission.entrepriseId);
      if (!contact) continue;

      const joursAvantDebut = Math.max(
        0,
        Math.round((Date.parse(`${mission.dateDebut}T00:00:00Z`) - Date.now()) / 86400000)
      );

      const suite =
        enAttente > 0
          ? ` **${enAttente} candidature${enAttente > 1 ? "s" : ""}** attend${enAttente > 1 ? "ent" : ""} votre réponse.`
          : mobilisables > 0
            ? ` **${mobilisables} profil${mobilisables > 1 ? "s" : ""} conforme${mobilisables > 1 ? "s" : ""}** que vous n'avez pas encore sollicité${mobilisables > 1 ? "s" : ""}.`
            : ` Aucun profil conforme disponible : élargissez le rayon, revoyez les habilitations exigées, ou la rémunération.`;

      relances.push({
        missionId: mission.missionId,
        entrepriseId: mission.entrepriseId,
        raisonSociale: contact.raison_sociale,
        email: contact.email,
        discordSalonId: contact.discord_salon_id,
        titre: mission.titre,
        ville: mission.ville,
        dateDebut: mission.dateDebut,
        joursAvantDebut,
        candidaturesEnAttente: enAttente,
        profilsMobilisables: mobilisables,
        // Message prêt à poster : n8n n'a pas à connaître nos règles métier.
        message:
          `**${contact.raison_sociale}** — votre fiche **${mission.titre}** (${mission.ville}) ` +
          `n'est toujours attribuée à personne et le chantier démarre dans ${joursAvantDebut} jours.` +
          suite,
      });
    }

    return Response.json({
      ok: true,
      genereLe: new Date().toISOString(),
      fenetreJours: jours,
      missionsExaminees: missions.length,
      relances,
    });
  } finally {
    await sql.end();
  }
}
