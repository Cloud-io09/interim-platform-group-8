import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import { attendUneReponseDe, libelleEtat, type EtatCandidature } from "@interimatch/core";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Candidatures", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

interface Ligne {
  mission_id: number;
  titre: string;
  date_debut: string;
  date_fin: string;
  interimaire_id: number;
  prenom: string;
  nom: string;
  ville: string;
  statut: EtatCandidature;
  motif: string | null;
  decide_par: string | null;
}

/** Ce qui attend une réponse de l'entreprise passe devant. */
const RANG: Record<EtatCandidature, number> = {
  candidatee: 0,
  proposee: 1,
  sollicitee: 2,
  acceptee: 3,
  declinee: 4,
  expiree: 5,
};

/**
 * Candidatures à traiter, toutes missions confondues.
 *
 * Les fiches de poste montrent chacune leurs candidats ; il manquait la vue
 * transverse — celle qui répond à « qu'est-ce qui attend une réponse de ma part ? »
 * sans avoir à ouvrir chaque chantier l'un après l'autre.
 */
export default async function CandidaturesEntreprise() {
  const session = await exigerSession("entreprise");

  const sql = connexion();
  try {
    const lignes = await sql<Ligne[]>`
      select c.mission_id, m.titre, m.date_debut::text, m.date_fin::text,
             c.interimaire_id, i.prenom, i.nom, i.ville,
             c.statut, c.motif, c.decide_par
      from candidature c
      join mission m on m.id = c.mission_id
      join interimaire i on i.compte_id = c.interimaire_id
      where m.entreprise_id = ${session.compteId}
      order by m.date_debut`;

    const triees = [...lignes].sort((a, b) => RANG[a.statut] - RANG[b.statut]);
    const aTraiter = triees.filter((l) => attendUneReponseDe(l.statut, "entreprise"));

    // Regroupées par mission : une candidature se juge dans le contexte de son
    // chantier, dont les dates décident de la conformité.
    const parMission = new Map<number, Ligne[]>();
    for (const l of triees) {
      const lot = parMission.get(l.mission_id) ?? [];
      lot.push(l);
      parMission.set(l.mission_id, lot);
    }

    return (
      <section className="section">
        <div className="colonne">
          <h1 className="titre-page">Candidatures</h1>
          <p className="secondaire">
            {aTraiter.length === 0
              ? "Aucune candidature n'attend votre réponse."
              : aTraiter.length === 1
                ? "Une candidature attend votre réponse."
                : `${aTraiter.length} candidatures attendent votre réponse.`}{" "}
            Une candidature se juge sur les dates de son chantier : ouvrez le profil pour
            voir l&apos;état de chaque habilitation exigée.
          </p>

          {triees.length === 0 ? (
            <div className="carte">
              <p style={{ margin: 0 }}>Aucune candidature pour le moment.</p>
              <p className="petit secondaire" style={{ margin: "0.5rem 0 1rem" }}>
                Vous pouvez solliciter directement les profils que le moteur vous propose
                sur chaque fiche de poste.
              </p>
              <a className="bouton bouton--secondaire" href="/missions">Voir mes fiches de poste</a>
            </div>
          ) : (
            [...parMission.entries()].map(([missionId, lot]) => (
              <section key={missionId} aria-labelledby={`mission-${missionId}`}>
                <div className="tete-section">
                  <h2 id={`mission-${missionId}`} style={{ fontSize: "1.125rem" }}>
                    <a className="lien-bloc" href={`/missions/${missionId}`}>{lot[0]!.titre}</a>
                  </h2>
                  <p className="petit secondaire">
                    du {enDateFr(lot[0]!.date_debut)} au {enDateFr(lot[0]!.date_fin)}
                  </p>
                </div>

                <ul className="liste-nue lignes" style={{ marginBottom: "2rem" }}>
                  {lot.map((l) => {
                    const attend = attendUneReponseDe(l.statut, "entreprise");
                    return (
                      <li key={l.interimaire_id} className="ligne">
                        <span>
                          <strong>
                            <a
                              className="lien-bloc"
                              href={`/missions/${missionId}/profils/${l.interimaire_id}`}
                            >
                              {l.prenom} {l.nom}
                            </a>
                          </strong>
                          <span className="petit secondaire"> — {l.ville}</span>
                          {l.statut === "declinee" && (
                            <p className="petit secondaire" style={{ margin: "0.15rem 0 0" }}>
                              {l.decide_par === "interimaire"
                                ? "A décliné le chantier."
                                : "Vous avez écarté ce profil."}
                              {l.motif ? ` Motif : ${l.motif}` : ""}
                            </p>
                          )}
                        </span>
                        <span className={attend ? "pastille pastille--attention" : "pastille pastille--info"}>
                          {libelleEtat(l.statut)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
