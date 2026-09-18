import { connexion } from "@interimatch/core/db";
import { succes } from "@/lib/reponses";

/**
 * Référentiel des compétences, classé par pertinence pour des métiers donnés.
 *
 * Près de trois cents libellés : les servir dans l'ordre du référentiel reviendrait à
 * demander à un maçon de trouver « Appliquer les mortiers » entre « Poser des panneaux
 * solaires » et « Câbler un matériel ».
 *
 * Le classement vient des offres France Travail déjà ingérées : une compétence citée
 * cent fois sur les offres du métier passe devant une compétence citée deux fois.
 * C'est la même source que le préremplissage des fiches de poste — les données
 * publiques servent le produit, elles ne sont pas exposées brutes.
 */
export const revalidate = 3600;

export async function GET(requete: Request) {
  const demandes = new URL(requete.url).searchParams.get("metiers");
  const metiers = (demandes ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 10);

  const sql = connexion();
  try {
    const lignes = metiers.length
      ? await sql<{ code: string; libelle: string; occurrences: number }[]>`
          select c.code, c.libelle, count(o.id_ft)::int as occurrences
          from competence c
          left join offre_ft_competence ofc on ofc.competence_code = c.code
          left join offre_ft o on o.id_ft = ofc.offre_id and o.metier_code = any(${metiers})
          group by c.code, c.libelle
          order by count(o.id_ft) desc, c.libelle`
      : await sql<{ code: string; libelle: string; occurrences: number }[]>`
          select c.code, c.libelle, 0 as occurrences
          from competence c order by c.libelle`;

    return succes({
      competences: lignes.map((l) => ({ code: l.code, libelle: l.libelle })),
    });
  } finally {
    await sql.end();
  }
}
