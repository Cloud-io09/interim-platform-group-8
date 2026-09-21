import type { Sql } from "postgres";
import { experienceConstatee, type ExperienceConstatee } from "@interimatch/core";

/**
 * Expérience constatée d'un intérimaire, lue en base.
 *
 * Ce qui compte comme expérience : une candidature **acceptée** sur une mission dont
 * la date de fin est passée. Ni une candidature en cours — elle n'a rien produit —
 * ni une mission à venir.
 *
 * La date du jour est décidée ici, en SQL, et non dans le calcul : le module du cœur
 * reçoit des missions déjà terminées et reste reproductible.
 */
export async function chargerExperience(
  sql: Sql,
  interimaireId: number
): Promise<ExperienceConstatee> {
  const lignes = await sql<
    {
      metier_code: string;
      metier_libelle: string;
      date_debut: string;
      date_fin: string;
      raison_sociale: string;
    }[]
  >`
    select m.metier_code, met.libelle as metier_libelle,
           m.date_debut::text, m.date_fin::text, e.raison_sociale
    from candidature c
    join mission m on m.id = c.mission_id
    join entreprise e on e.compte_id = m.entreprise_id
    left join metier met on met.code = m.metier_code
    where c.interimaire_id = ${interimaireId}
      and c.statut = 'acceptee'
      and m.date_fin < current_date
    order by m.date_fin desc`;

  return experienceConstatee(
    lignes.map((l) => ({
      metierCode: l.metier_code,
      metierLibelle: l.metier_libelle ?? l.metier_code,
      dateDebut: l.date_debut,
      dateFin: l.date_fin,
      entreprise: l.raison_sociale,
    }))
  );
}
