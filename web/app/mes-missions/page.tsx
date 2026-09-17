import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Mes missions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

function joursAvant(iso: string): number {
  const jour = 24 * 60 * 60 * 1000;
  const n = new Date();
  const debut = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - debut) / jour);
}

interface Ligne {
  id: number;
  titre: string;
  ville: string;
  date_debut: string;
  date_fin: string;
  raison_sociale: string;
  taux_horaire_min: string | null;
}

/**
 * Les affectations, et elles seules.
 *
 * L'ancienne page mêlait les missions ouvertes, celles dont l'intérimaire était
 * écarté et celles hors de ses métiers : une liste de ce qu'il pourrait faire, pas de
 * ce qu'il fait. Elles sont maintenant sous « Opportunités ». Confondre les deux est
 * la confusion la plus coûteuse pour quelqu'un qui organise ses semaines.
 */
export default async function MesMissions() {
  const session = await exigerSession("interimaire");

  const sql = connexion();
  try {
    const lignes = await sql<Ligne[]>`
      select m.id, m.titre, m.ville, m.date_debut::text, m.date_fin::text,
             e.raison_sociale, m.taux_horaire_min::text
      from candidature c
      join mission m on m.id = c.mission_id
      join entreprise e on e.compte_id = m.entreprise_id
      where c.interimaire_id = ${session.compteId} and c.statut = 'acceptee'
      order by m.date_debut desc`;

    const aujourdhui = lignes.filter((l) => joursAvant(l.date_fin) >= 0);
    const passees = lignes.filter((l) => joursAvant(l.date_fin) < 0);

    const Carte = ({ l, terminee }: { l: Ligne; terminee: boolean }) => {
      const debut = joursAvant(l.date_debut);
      return (
        <li className="carte" style={{ marginBottom: "0.75rem" }}>
          <div className="ligne-meta" style={{ justifyContent: "space-between" }}>
            <div>
              <h3 style={{ margin: "0 0 0.2rem" }}>
                <a className="lien-bloc" href={`/mes-missions/${l.id}`}>{l.titre}</a>
              </h3>
              <p className="petit secondaire" style={{ margin: 0 }}>
                {l.raison_sociale} · {l.ville} · du {enDateFr(l.date_debut)} au{" "}
                {enDateFr(l.date_fin)}
                {l.taux_horaire_min && ` · ${Number(l.taux_horaire_min).toFixed(2).replace(".", ",")} €/h`}
              </p>
            </div>
            <span className={terminee ? "pastille pastille--info" : debut <= 0 ? "pastille pastille--ok" : "pastille pastille--info"}>
              {terminee ? "Terminée" : debut <= 0 ? "En cours" : debut === 1 ? "Démarre demain" : `Démarre dans ${debut} jours`}
            </span>
          </div>
        </li>
      );
    };

    return (
      <section className="section">
        <div className="colonne">
          <h1>Mes missions</h1>
          <p className="secondaire">
            Les chantiers sur lesquels vous êtes affecté. Ce que vous pourriez faire se
            trouve dans <a href="/opportunites">vos opportunités</a>, et les dossiers en
            cours dans <a href="/mes-candidatures">vos candidatures</a>.
          </p>

          <h2>En cours et à venir</h2>
          {aujourdhui.length === 0 ? (
            <div className="carte">
              <p style={{ margin: 0 }}>Aucune affectation en cours.</p>
              <p className="petit secondaire" style={{ margin: "0.5rem 0 1rem" }}>
                Une affectation naît d&apos;un accord des deux côtés : vous postulez et
                l&apos;entreprise retient, ou elle vous sollicite et vous acceptez.
              </p>
              <a className="bouton bouton--secondaire" href="/opportunites">Voir les opportunités</a>
            </div>
          ) : (
            <ul className="liste-nue">
              {aujourdhui.map((l) => (
                <Carte key={l.id} l={l} terminee={false} />
              ))}
            </ul>
          )}

          {passees.length > 0 && (
            <>
              <h2>Historique</h2>
              <ul className="liste-nue">
                {passees.map((l) => (
                  <Carte key={l.id} l={l} terminee />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
