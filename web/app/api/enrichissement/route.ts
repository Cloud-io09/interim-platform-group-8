import { connexion } from "@interimatch/core/db";
import { LIBELLE_DOMAINE, typeCertification } from "@interimatch/core";
import { erreur } from "@/lib/reponses";

export const dynamic = "force-dynamic";

/**
 * Fiche de poste enrichie, alimentée par les offres France Travail nettoyées.
 *
 * C'est la fonctionnalité visible que le sujet exige en sortie du pipeline : les
 * données ingérées ne sont pas affichées brutes, elles préremplissent un formulaire.
 *
 * Chaque chiffre est rendu avec son effectif. « CACES R482 dans 41 % des offres »
 * ne se lit pas pareil selon qu'il repose sur 8 offres ou sur 340, et une entreprise
 * ne peut pas juger d'une suggestion dont elle ignore l'assise.
 */

/** En dessous, l'échantillon local est trop mince : on élargit au niveau national. */
const EFFECTIF_MINIMAL_LOCAL = 15;

export async function GET(requete: Request) {
  const parametres = new URL(requete.url).searchParams;
  const metierCode = parametres.get("metier");
  const departement = parametres.get("departement");

  if (!metierCode) return erreur("Paramètre « metier » obligatoire.", 400);

  const sql = connexion();
  try {
    const [metier] = await sql<{ code: string; libelle: string; domaine: string }[]>`
      select code, libelle, domaine from metier where code = ${metierCode} and actif`;
    if (!metier) return erreur("Métier inconnu.", 404);

    // On tente d'abord le département : une rémunération se juge localement.
    let portee: "departement" | "national" = "departement";
    let effectif = 0;

    if (departement) {
      const [local] = await sql<{ n: number }[]>`
        select count(*)::int n from offre_ft
        where metier_code = ${metierCode} and departement = ${departement}`;
      effectif = local?.n ?? 0;
    }
    if (!departement || effectif < EFFECTIF_MINIMAL_LOCAL) {
      portee = "national";
      const [national] = await sql<{ n: number }[]>`
        select count(*)::int n from offre_ft where metier_code = ${metierCode}`;
      effectif = national?.n ?? 0;
    }

    const filtreDepartement = portee === "departement" && departement;

    const [remuneration] = await sql<
      { mediane: string | null; q1: string | null; q3: string | null; effectif: number }[]
    >`
      select
        percentile_cont(0.5) within group (order by (taux_horaire_min + taux_horaire_max) / 2)::numeric(6,2) as mediane,
        percentile_cont(0.25) within group (order by (taux_horaire_min + taux_horaire_max) / 2)::numeric(6,2) as q1,
        percentile_cont(0.75) within group (order by (taux_horaire_min + taux_horaire_max) / 2)::numeric(6,2) as q3,
        count(*)::int as effectif
      from offre_ft
      where metier_code = ${metierCode}
        and taux_horaire_min is not null
        ${filtreDepartement ? sql`and departement = ${departement}` : sql``}`;

    // **Un métier sans offre laissait les taux sans repère.** Huit métiers sur
    // cinquante-deux n'ont aucune offre observée — l'engin de damage, le ramonage,
    // les voies ferrées. Plutôt que « aucune donnée », on se replie sur les offres du
    // même domaine (les engins de chantier pour le damage), et l'écran dit que le
    // repère vient du domaine et non du métier.
    type Repere = { mediane: string | null; q1: string | null; q3: string | null; effectif: number; source: "metier" | "domaine" };
    let repere: Repere | null =
      remuneration && remuneration.effectif > 0 ? { ...remuneration, source: "metier" } : null;
    if (!repere) {
      const [voisin] = await sql<
        { mediane: string | null; q1: string | null; q3: string | null; effectif: number }[]
      >`
        select
          percentile_cont(0.5) within group (order by (o.taux_horaire_min + o.taux_horaire_max) / 2)::numeric(6,2) as mediane,
          percentile_cont(0.25) within group (order by (o.taux_horaire_min + o.taux_horaire_max) / 2)::numeric(6,2) as q1,
          percentile_cont(0.75) within group (order by (o.taux_horaire_min + o.taux_horaire_max) / 2)::numeric(6,2) as q3,
          count(*)::int as effectif
        from offre_ft o join metier m on m.code = o.metier_code
        where m.domaine = ${metier.domaine} and o.taux_horaire_min is not null`;
      if (voisin && voisin.effectif > 0) repere = { ...voisin, source: "domaine" };
    }

    const certifications = await sql<{ type_code: string; n: number }[]>`
      select c.type_code, count(*)::int as n
      from offre_ft_certification c
      join offre_ft o on o.id_ft = c.offre_id
      where o.metier_code = ${metierCode}
        ${filtreDepartement ? sql`and o.departement = ${departement}` : sql``}
      group by c.type_code order by n desc`;

    const competences = await sql<{ code: string; libelle: string; n: number }[]>`
      select comp.code, comp.libelle, count(*)::int as n
      from offre_ft_competence oc
      join offre_ft o on o.id_ft = oc.offre_id
      join competence comp on comp.code = oc.competence_code
      where o.metier_code = ${metierCode}
        ${filtreDepartement ? sql`and o.departement = ${departement}` : sql``}
      group by comp.code, comp.libelle order by n desc limit 8`;

    const intitules = await sql<{ intitule_normalise: string; n: number }[]>`
      select intitule_normalise, count(*)::int as n
      from offre_ft where metier_code = ${metierCode}
      group by intitule_normalise order by n desc limit 3`;

    return Response.json({
      ok: true,
      metier,
      portee,
      departement: portee === "departement" ? departement : null,
      effectif,
      intitulesFrequents: intitules.map((i) => i.intitule_normalise),
      remuneration: repere
        ? {
            mediane: Number(repere.mediane),
            q1: Number(repere.q1),
            q3: Number(repere.q3),
            effectif: repere.effectif,
            source: repere.source,
            domaine: LIBELLE_DOMAINE[metier.domaine] ?? metier.domaine,
          }
        : null,
      certifications: certifications.map((c) => ({
        typeCode: c.type_code,
        libelle: typeCertification(c.type_code)?.libelle ?? c.type_code,
        occurrences: c.n,
        part: effectif > 0 ? Math.round((c.n / effectif) * 100) : 0,
      })),
      competences: competences.map((c) => ({
        code: c.code,
        libelle: c.libelle,
        occurrences: c.n,
        part: effectif > 0 ? Math.round((c.n / effectif) * 100) : 0,
      })),
    });
  } finally {
    await sql.end();
  }
}
