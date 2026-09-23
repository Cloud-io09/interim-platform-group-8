import { dechiffrerOptionnel } from "@interimatch/core";
import { connexion } from "@interimatch/core/db";

/**
 * L'équipe affectée, une fois la fiche pourvue.
 *
 * **La fiche s'arrêtait à « pourvue ».** L'entreprise savait que le poste était
 * couvert, sans savoir par qui — il fallait retrouver la candidature acceptée dans
 * une autre liste. Or c'est le moment où l'on prépare l'accueil sur site : il faut
 * un nom, un numéro, et de quoi vérifier les titres à l'entrée.
 *
 * **Aucun déblocage n'est exigé ici.** On paie pour joindre un candidat qu'on n'a pas
 * encore retenu ; une fois l'affectation conclue, les deux parties sont engagées, et
 * facturer l'accès au numéro de son propre intérimaire n'aurait pas de sens.
 */

interface Affecte {
  compte_id: number;
  prenom: string;
  nom: string;
  ville: string;
  telephone_chiffre: string | null;
  email: string;
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
export default async function AffectationConclue({ missionId }: { missionId: number }) {
  const sql = connexion();
  try {
    const [a] = await sql<Affecte[]>`
      select i.compte_id, i.prenom, i.nom, i.ville, i.telephone_chiffre, c.email
        from mission m
        join interimaire i on i.compte_id = m.interimaire_affecte_id
        join compte c on c.id = i.compte_id
       where m.id = ${missionId}`;
    if (!a) return null;

    const telephone = dechiffrerOptionnel(a.telephone_chiffre);

    return (
      <section aria-labelledby="titre-affecte" className="carte carte--verdict-ok">
        <div className="tete-carte">
          <h2 id="titre-affecte" className="titre-carte">
            Qui vient sur le chantier
          </h2>
          <span className="pastille pastille--ok">affectation conclue</span>
        </div>

        <ul className="liste-nue">
          <li className="ligne">
            <span>{a.ville}</span>
            <strong>
              <a className="lien-bloc" href={`/missions/${missionId}/profils/${a.compte_id}`}>
                {a.prenom} {a.nom}
              </a>
            </strong>
          </li>
          <li className="ligne">
            <span>Téléphone</span>
            <strong>
              {telephone ? (
                <a href={`tel:${telephone}`}>{telephone}</a>
              ) : (
                <span className="petit secondaire">non renseigné</span>
              )}
            </strong>
          </li>
          <li className="ligne">
            <span>Adresse e-mail</span>
            <strong>
              <a href={`mailto:${a.email}`}>{a.email}</a>
            </strong>
          </li>
        </ul>

        <p className="petit secondaire">
          Les habilitations sont détaillées sur sa fiche, et vérifiées contre la date de
          fin de chantier. Le document de mission reprend les six mentions obligatoires.
        </p>
        <a className="bouton bouton--secondaire lien-bloc" href={`/missions/${missionId}/contrat`}>
          Document de mission
        </a>
      </section>
    );
  } finally {
    await sql.end();
  }
}
