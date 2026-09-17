import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import { attendUneReponseDe, libelleEtat, type EtatCandidature } from "@interimatch/core";
import ActionCandidature from "@/components/ActionCandidature";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Mes candidatures", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

interface Ligne {
  mission_id: number;
  titre: string;
  ville: string;
  date_debut: string;
  date_fin: string;
  statut: EtatCandidature;
  motif: string | null;
  decide_par: string | null;
  raison_sociale: string;
}

/** Dans quel ordre on lit sa propre liste : ce qui attend une action d'abord. */
const RANG: Record<EtatCandidature, number> = {
  sollicitee: 0,
  proposee: 1,
  candidatee: 2,
  acceptee: 3,
  declinee: 4,
  expiree: 5,
};

/**
 * Suivi des candidatures, vue intérimaire.
 *
 * Trois choses au même endroit, et il faut qu'elles restent distinctes : ce que j'ai
 * envoyé, ce qu'on m'a proposé, et ce qui est clos. Sans cette vue, un intérimaire ne
 * peut pas savoir où il en est — et « Mes missions » ne montre que les affectations
 * déjà confirmées.
 */
export default async function MesCandidatures() {
  const session = await exigerSession("interimaire");

  const sql = connexion();
  try {
    const lignes = await sql<Ligne[]>`
      select c.mission_id, m.titre, m.ville, m.date_debut::text, m.date_fin::text,
             c.statut, c.motif, c.decide_par, e.raison_sociale
      from candidature c
      join mission m on m.id = c.mission_id
      join entreprise e on e.compte_id = m.entreprise_id
      where c.interimaire_id = ${session.compteId}
      order by m.date_debut`;

    const triees = [...lignes].sort((a, b) => RANG[a.statut] - RANG[b.statut]);
    const aTraiter = triees.filter((l) => attendUneReponseDe(l.statut, "interimaire")).length;

    return (
      <section className="section">
        <div className="colonne">
          <h1>Mes candidatures</h1>
          <p className="secondaire">
            Ce que vous avez envoyé, ce qu&apos;on vous a proposé, et où chaque dossier en est.
            {aTraiter > 0 && (
              <>
                {" "}
                <strong>
                  {aTraiter === 1
                    ? "Une sollicitation attend votre réponse."
                    : `${aTraiter} sollicitations attendent votre réponse.`}
                </strong>
              </>
            )}
          </p>

          {triees.length === 0 ? (
            <div className="carte">
              <p style={{ margin: 0 }}>Vous n&apos;avez encore aucune candidature.</p>
              <p className="petit secondaire" style={{ margin: "0.5rem 0 1rem" }}>
                Les missions qui correspondent à vos métiers et à vos habilitations sont
                listées dans vos opportunités.
              </p>
              <a className="bouton bouton--secondaire" href="/opportunites">Voir les opportunités</a>
            </div>
          ) : (
            <ul className="liste-nue">
              {triees.map((l) => {
                const attend = attendUneReponseDe(l.statut, "interimaire");
                return (
                  <li key={l.mission_id} className="carte carte-mission">
                    <div className="carte-mission-corps">
                      <h2 style={{ fontSize: "1.0625rem", margin: "0 0 0.2rem" }}>
                        <a className="lien-bloc" href={`/mes-missions/${l.mission_id}`}>{l.titre}</a>
                      </h2>
                      <p className="petit secondaire ligne-meta">
                        <span>
                          {l.raison_sociale} · {l.ville} · du {enDateFr(l.date_debut)} au{" "}
                          {enDateFr(l.date_fin)}
                        </span>
                        <span className={attend ? "pastille pastille--attention" : "pastille pastille--info"}>
                          {libelleEtat(l.statut)}
                        </span>
                      </p>
                      {l.statut === "declinee" && (
                        <p className="petit secondaire" style={{ margin: "0.5rem 0 0" }}>
                          {l.decide_par === "entreprise"
                            ? "L'entreprise a écarté votre candidature."
                            : "Vous avez décliné cette mission."}
                          {l.motif ? ` Motif : ${l.motif}` : ""}
                        </p>
                      )}
                      {l.statut === "expiree" && (
                        <p className="petit secondaire" style={{ margin: "0.5rem 0 0" }}>
                          La mission a été pourvue avant que le dossier n&apos;aboutisse.
                        </p>
                      )}
                    </div>

                    <div className="encart-score">
                      <ActionCandidature
                        missionId={l.mission_id}
                        acteur="interimaire"
                        etat={l.statut}
                        retour="/mes-candidatures"
                        conclusion={
                          l.statut === "acceptee"
                            ? "Affectation confirmée."
                            : l.statut === "candidatee"
                              ? "En attente de la réponse de l'entreprise."
                              : "Dossier clos."
                        }
                      />
                      <p className="petit secondaire" style={{ margin: "0.75rem 0 0" }}>
                        <a href={`/mes-missions/${l.mission_id}`}>Voir le détail de la mission</a>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
