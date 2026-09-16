import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Mes fiches de poste",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

const LIBELLE_STATUT: Record<string, string> = {
  brouillon: "Brouillon",
  publiee: "Publiée",
  pourvue: "Pourvue",
  close: "Close",
};

export default async function MesMissions() {
  const session = await exigerSession("entreprise");

  const sql = connexion();
  try {
    const missions = await sql<
      {
        id: number; titre: string; ville: string; statut: string;
        date_debut: string; date_fin: string; metier_libelle: string; nb_exigences: number;
      }[]
    >`
      select m.id, m.titre, m.ville, m.statut, m.date_debut::text, m.date_fin::text,
             me.libelle as metier_libelle,
             (select count(*)::int from mission_certification_requise r where r.mission_id = m.id) as nb_exigences
      from mission m join metier me on me.code = m.metier_code
      where m.entreprise_id = ${session.compteId}
      order by m.cree_le desc`;

    return (
      <section className="section">
        <div className="colonne">
          <div className="ligne-certification" style={{ marginBottom: "2rem" }}>
            <div>
              <h1 style={{ marginBottom: "0.25rem" }}>Mes fiches de poste</h1>
              <p className="secondaire" style={{ margin: 0 }}>
                {missions.length === 0
                  ? "Vous n'avez pas encore publié de fiche."
                  : `${missions.length} fiche${missions.length > 1 ? "s" : ""}.`}
              </p>
            </div>
            <a className="bouton" href="/missions/nouvelle">Publier une fiche de poste</a>
          </div>

          {missions.length === 0 ? (
            <div className="carte">
              <h2>Comment ça marche</h2>
              <p className="secondaire">
                Vous décrivez le besoin — métier, dates, habilitations exigées. Intérimatch
                écarte les profils non conformes, puis classe les autres par compatibilité.
                Vous ne voyez que des candidats dont les titres sont valides à la date de fin
                de votre chantier.
              </p>
            </div>
          ) : (
            <ul className="liste-nue">
              {missions.map((m) => (
                <li key={m.id} className="carte" style={{ marginBottom: "0.75rem" }}>
                  <div className="ligne-certification">
                    <div>
                      <h2 style={{ fontSize: "1.125rem", marginBottom: "0.25rem" }}>
                        <a href={`/missions/${m.id}`}>{m.titre}</a>
                      </h2>
                      <p className="petit secondaire" style={{ margin: 0 }}>
                        {m.metier_libelle} · {m.ville} · du {enDateFr(m.date_debut)} au{" "}
                        {enDateFr(m.date_fin)}
                        {m.nb_exigences > 0 && (
                          <> · {m.nb_exigences} habilitation{m.nb_exigences > 1 ? "s" : ""} exigée{m.nb_exigences > 1 ? "s" : ""}</>
                        )}
                      </p>
                    </div>
                    <span className="etiquette">{LIBELLE_STATUT[m.statut] ?? m.statut}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
