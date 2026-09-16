import { TYPES_CERTIFICATION } from "@interimatch/core";

/**
 * Liste fermée des certifications, servie au formulaire.
 *
 * Statique : elle vient du code, pas d'une saisie. Le formulaire ne peut donc
 * proposer que des valeurs valides — c'est la première barrière contre le texte libre,
 * la seconde étant le trigger en base.
 */
export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    ok: true,
    types: TYPES_CERTIFICATION.map((t) => ({
      code: t.code,
      libelle: t.libelle,
      validiteMois: t.validiteMois,
      categories: t.categories,
    })),
  });
}
