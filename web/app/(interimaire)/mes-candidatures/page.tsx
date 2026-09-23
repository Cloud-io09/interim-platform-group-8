import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import {
  attendUneReponseDe,
  libelleEtat,
  typeCertification,
  type EtatCandidature,
} from "@interimatch/core";
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
  /** Première exigence non couverte pour cette mission, s'il y en a une. */
  titre_bloquant: string | null;
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
             c.statut, c.motif, c.decide_par, e.raison_sociale,
             -- **Le même verdict, du côté de celui qui postule.** Une candidature
             -- peut dormir des jours alors qu'un titre a expiré entre-temps : le
             -- savoir ici, c'est pouvoir le renouveler avant la réponse.
             (
               select r.type_code from mission_certification_requise r
               left join categorie_certification rc on rc.id = r.categorie_id
               where r.mission_id = c.mission_id
                 and not exists (
                   select 1 from certification cert
                   left join categorie_certification cc on cc.id = cert.categorie_id
                   where cert.interimaire_id = c.interimaire_id
                     and cert.type_code = r.type_code
                     and (rc.code is null or cc.code = rc.code)
                     and cert.date_echeance >= m.date_fin
                 )
               limit 1
             ) as titre_bloquant
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
          <h1 className="titre-page">Mes candidatures</h1>
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
                  <li key={l.mission_id} className="carte carte-mission carte--cliquable">
                    <div className="carte-mission-corps">
                      <h2 className="titre-carte-liste">
                        <a className="lien-etire" href={`/mes-missions/${l.mission_id}`}>{l.titre}</a>
                      </h2>
                      <p className="petit secondaire ligne-meta">
                        <span>
                          {l.raison_sociale} · {l.ville} · du {enDateFr(l.date_debut)} au{" "}
                          {enDateFr(l.date_fin)}
                        </span>
                        <span className={attend ? "pastille pastille--attention" : "pastille pastille--info"}>
                          {libelleEtat(l.statut)}
                        </span>
                        <span
                          className={`etiquette ${l.titre_bloquant ? "etiquette--alerte" : "etiquette--ok"}`}
                        >
                          {l.titre_bloquant ? "△ Titre manquant" : "✓ Vous êtes conforme"}
                        </span>
                      </p>
                      {l.titre_bloquant && (
                        <p className="petit" style={{ margin: "0.25rem 0 0" }}>
                          <strong>
                            {typeCertification(l.titre_bloquant)?.libelle ?? l.titre_bloquant}
                          </strong>{" "}
                          ne couvre pas la fin de ce chantier. L&apos;entreprise ne pourra pas
                          vous affecter tant qu&apos;il n&apos;est pas à jour.
                        </p>
                      )}
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

                    {/* Une action et un lien : rien qui justifie un cadre dans le
                        cadre de la carte. */}
                    <div className="carte-mission-action">
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
                      <p className="petit secondaire">
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
