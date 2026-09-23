import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import {
  attendUneReponseDe,
  libelleEtat,
  typeCertification,
  type EtatCandidature,
} from "@interimatch/core";
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
  /** Les coordonnées ont-elles été débloquées pour cette mission ? */
  debloque: boolean;
  /** Affectable sur cette mission-ci, jugé contre sa date de fin. */
  conforme: boolean;
  /** Première exigence non couverte, quand il y en a une. */
  titre_bloquant: string | null;
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
             c.statut, c.motif, c.decide_par,
             -- **Le nom complet fuitait ici.** Il était masqué sur la fiche profil
             -- et rendu en clair dans cette liste : la barrière ne tenait qu'à
             -- l'écran où on avait pensé à la poser. On rapporte le déblocage avec
             -- la candidature, pour que l'affichage suive la même règle partout.
             -- **Le verdict, dès la liste.** Il fallait ouvrir chaque fiche pour
             -- savoir si un candidat était affectable — sur dix candidatures, dix
             -- allers-retours. La règle est la même qu'ailleurs : aucune exigence
             -- laissée sans titre couvrant la mission **jusqu'à sa date de fin**.
             -- Une seule requête pour toute la liste, pas une par ligne.
             not exists (
               select 1 from mission_certification_requise r
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
             ) as conforme,
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
             ) as titre_bloquant,
             exists (
               select 1 from deblocage d
               where d.entreprise_id = ${session.compteId}
                 and d.interimaire_id = c.interimaire_id
                 and d.mission_id = c.mission_id
             ) as debloque
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
                              {l.debloque ? `${l.prenom} ${l.nom}` : `${l.prenom} ${l.nom.charAt(0)}.`}
                            </a>
                          </strong>
                          <span className="petit secondaire"> — {l.ville}</span>
                          {/* Le verdict avant le clic : c'est ce qui décide si on
                              ouvre la fiche, et le taire obligeait à toutes les
                              ouvrir. Jamais la couleur seule — le mot est écrit. */}
                          <span
                            className={`etiquette ${l.conforme ? "etiquette--ok" : "etiquette--alerte"}`}
                            style={{ marginLeft: "0.5rem" }}
                          >
                            {l.conforme ? "✓ Conforme" : "△ Non conforme"}
                          </span>
                          {!l.conforme && l.titre_bloquant && (
                            <p className="petit secondaire" style={{ margin: "0.15rem 0 0" }}>
                              {typeCertification(l.titre_bloquant)?.libelle ?? l.titre_bloquant} —
                              manquant ou expirant avant la fin du chantier.
                            </p>
                          )}
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
