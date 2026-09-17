import { connexion } from "@interimatch/core/db";
import { dechiffrerOptionnel, matcher, rapprocherMissions } from "@interimatch/core";
import { erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { chargerMission, chargerProfils } from "@/lib/depot";

export const dynamic = "force-dynamic";

/** Nombre de suggestions rendues. Au-delà, la liste cesse d'être une suggestion. */
const MAXIMUM = 8;

/**
 * Missions dont le vocabulaire ressemble à celui du CV.
 *
 * **Ce n'est pas le moteur de matching.** Ce rapprochement ignore les habilitations,
 * les dates et la distance : il sert à faire découvrir des fiches, pas à dire qui
 * peut aller sur un chantier.
 *
 * Chaque suggestion porte donc son verdict de conformité, calculé par le vrai moteur.
 * Sans ça, un intérimaire croirait pouvoir postuler à une mission dont il est écarté —
 * exactement la confusion que le produit existe pour supprimer.
 */
export async function GET() {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;
  const moi = garde.session.compteId;

  const sql = connexion();
  try {
    const [ligne] = await sql<{ cv_texte_chiffre: string | null }[]>`
      select cv_texte_chiffre from interimaire where compte_id = ${moi}`;
    const texte = dechiffrerOptionnel(ligne?.cv_texte_chiffre);
    if (!texte) return erreur("Aucun CV déposé.", 409, [{ champ: "cv", message: "Déposez un CV d'abord." }]);

    const ouvertes = await sql<
      { id: number; titre: string; description: string | null; metier_libelle: string }[]
    >`
      select m.id, m.titre, m.description, me.libelle as metier_libelle
      from mission m join metier me on me.code = m.metier_code
      where m.statut = 'publiee' and m.date_fin >= current_date
      limit 200`;

    const suggestions = rapprocherMissions(
      texte,
      ouvertes.map((m) => ({
        missionId: m.id,
        titre: m.titre,
        description: m.description,
        metierLibelle: m.metier_libelle,
      }))
    ).slice(0, MAXIMUM);

    const enrichies = [];
    for (const s of suggestions) {
      const mission = await chargerMission(sql, s.missionId);
      if (!mission) continue;

      const profils = await chargerProfils(sql, mission.metierCode);
      const resultat = matcher(mission, profils);
      const retenu = resultat.retenus.some((r) => r.interimaireId === moi);
      const ecarte = resultat.ecartes.find((e) => e.interimaireId === moi);

      enrichies.push({
        missionId: mission.missionId,
        titre: mission.titre,
        entreprise: mission.raisonSociale,
        ville: mission.ville,
        dateDebut: mission.dateDebut,
        dateFin: mission.dateFin,
        proximite: Math.round(s.proximite * 100),
        motsCommuns: s.motsCommuns.slice(0, 6),
        // Le verdict du vrai moteur accompagne toujours la suggestion.
        conformite: retenu
          ? ("conforme" as const)
          : ecarte
            ? ("ecarte" as const)
            : ("metier_non_declare" as const),
      });
    }

    return succes({ suggestions: enrichies });
  } finally {
    await sql.end();
  }
}
