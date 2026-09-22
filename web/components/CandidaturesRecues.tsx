import { estConforme, libelleEtat, type EtatCandidature } from "@interimatch/core";
import { chargerMissionPourConformite, conformiteDetaillee } from "@/lib/candidatures";
import { connexion } from "@interimatch/core/db";

/**
 * Les candidatures réellement reçues sur une fiche.
 *
 * **Elles n'apparaissaient nulle part sur la fiche.** L'écran ne montrait que les
 * profils rapprochés par le moteur ; quelqu'un qui s'était porté candidat sans être
 * retenu — un titre manquant, ou un métier que le moteur n'évalue pas pour cette
 * fiche — restait invisible à l'entreprise. Le produit recevait une main levée et ne
 * la transmettait pas.
 *
 * **Et le verdict est dit franchement.** Un candidat non conforme n'est pas caché
 * derrière un score : on nomme l'habilitation qui manque. Masquer un refus ne
 * protège personne — ni l'entreprise, qui doit savoir pourquoi, ni le candidat, qui
 * mérite mieux qu'un silence.
 *
 * Le nom de famille suit la même règle que partout : il dépend du déblocage.
 */

interface Ligne {
  interimaire_id: number;
  prenom: string;
  nom: string;
  ville: string;
  statut: EtatCandidature;
  cree_le: string;
  debloque: boolean;
}


/**
 * **Ce composant ouvre sa propre connexion, et ne la reçoit pas.**
 *
 * Il la recevait de la page appelante, qui la refermait dans son `finally`. Or un
 * composant serveur asynchrone s'exécute pendant le rendu, donc **après** que la
 * fonction de page a rendu son JSX et fermé la connexion : la requête partait sur un
 * lien mort et l'écran affichait « Page couldn't load ». Le défaut ne se voit pas en
 * lisant le code — il faut connaître l'ordre d'exécution du rendu serveur.
 */
export default async function CandidaturesRecues({
  missionId,
  entrepriseId,
}: {
  missionId: number;
  entrepriseId: number;
}) {
  const sql = connexion();
  try {
    const lignes = await sql<Ligne[]>`
      select c.interimaire_id, i.prenom, i.nom, i.ville, c.statut, c.cree_le::text,
             exists (
               select 1 from deblocage d
               where d.entreprise_id = ${entrepriseId}
                 and d.interimaire_id = c.interimaire_id
                 and d.mission_id = ${missionId}
             ) as debloque
        from candidature c
        join interimaire i on i.compte_id = c.interimaire_id
       where c.mission_id = ${missionId}
         -- Celles que le moteur a seulement proposées ne sont pas des candidatures :
         -- personne n'a encore levé la main.
         and c.statut <> 'proposee'
       order by c.cree_le desc`;

    if (lignes.length === 0) {
      return (
        <section aria-labelledby="titre-candidatures" style={{ marginTop: "2.5rem" }}>
          <h2 id="titre-candidatures">Candidatures reçues</h2>
          <p className="secondaire">
            Personne ne s&apos;est encore porté candidat sur cette fiche. Les profils
            rapprochés par le moteur figurent plus bas — vous pouvez les solliciter.
          </p>
        </section>
      );
    }

    const mission = await chargerMissionPourConformite(sql, missionId);
    const verdicts = await Promise.all(
      lignes.map(async (l) => {
        const detail = mission ? await conformiteDetaillee(sql, mission, l.interimaire_id) : [];
        const bloquantes = detail.filter((c) => c.bloquant);
        return { ligne: l, conforme: detail.length > 0 && estConforme(detail), bloquantes };
      })
    );

    const enAttente = verdicts.filter((v) => v.ligne.statut === "candidatee").length;

    return (
      <section aria-labelledby="titre-candidatures" style={{ marginTop: "2.5rem" }}>
        <div className="tete-carte">
          <h2 id="titre-candidatures">Candidatures reçues</h2>
          {enAttente > 0 && (
            <span className="pastille pastille--attention">
              {enAttente} en attente de réponse
            </span>
          )}
        </div>
        <p className="secondaire">
          Ces personnes se sont portées candidates. Le verdict est celui du moteur, jugé
          sur la date de fin de chantier.
        </p>

        <ul className="liste-nue liste-cartes">
          {verdicts.map(({ ligne, conforme, bloquantes }) => (
            <li
              key={ligne.interimaire_id}
              className={`carte ${conforme ? "carte--verdict-ok" : "carte--verdict-bloque"}`}
           
            >
              <div className="ligne-certification">
                <div>
                  <h3 style={{ fontSize: "1rem", margin: "0 0 0.2rem" }}>
                    <a
                      className="lien-bloc"
                      href={`/missions/${missionId}/profils/${ligne.interimaire_id}`}
                    >
                      {ligne.debloque
                        ? `${ligne.prenom} ${ligne.nom}`
                        : `${ligne.prenom} ${ligne.nom.charAt(0)}.`}
                    </a>
                  </h3>
                  <p className="petit secondaire" style={{ margin: 0 }}>
                    {ligne.ville} · {libelleEtat(ligne.statut)}
                  </p>
                  {!conforme && bloquantes.length > 0 && (
                    <p className="petit" style={{ margin: "0.4rem 0 0" }}>
                      {/* `precision` dit l'état sans renommer le titre, qu'on vient
                          d'écrire juste avant : « expire le 20/04/2027, avant la fin
                          du chantier » plutôt que de répéter son intitulé. */}
                      <strong>{bloquantes[0]!.libelleType}</strong> — {bloquantes[0]!.precision}
                      {bloquantes.length > 1 && ` Et ${bloquantes.length - 1} autre(s).`}
                    </p>
                  )}
                </div>
                <span className={`etiquette ${conforme ? "etiquette--ok" : "etiquette--alerte"}`}>
                  {conforme ? "✓ Conforme" : "△ Non conforme"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  } finally {
    await sql.end();
  }
}
