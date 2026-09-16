import { connexion } from "@interimatch/core/db";
import { LIBELLE_DOMAINE } from "@interimatch/core";

export const revalidate = 3600;

/** Métiers de terrain, groupés par domaine pour un formulaire lisible. */
export async function GET() {
  const sql = connexion();
  try {
    const metiers = await sql<{ code: string; libelle: string; domaine: string }[]>`
      select code, libelle, domaine from metier where actif order by domaine, libelle`;

    const domaines = [...new Set(metiers.map((m) => m.domaine))].map((domaine) => ({
      domaine,
      libelle: LIBELLE_DOMAINE[domaine] ?? domaine,
      metiers: metiers.filter((m) => m.domaine === domaine).map(({ code, libelle }) => ({ code, libelle })),
    }));

    return Response.json({ ok: true, domaines });
  } finally {
    await sql.end();
  }
}
