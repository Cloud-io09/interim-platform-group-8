import { dechiffrerOptionnel } from "@interimatch/core";
import type { connexion } from "@interimatch/core/db";

/**
 * Ce qu'il faut savoir pour se présenter, une fois l'affectation conclue.
 *
 * **L'écran s'arrêtait à « Vous êtes affecté à ce chantier ».** C'est le moment où
 * l'application cesse d'être utile et où la vraie vie commence : il faut une adresse,
 * une heure, et quelqu'un à appeler quand le portail est fermé à 7 h 15. Rien de tout
 * cela n'était rendu, alors que tout était en base.
 *
 * **Le téléphone de l'entreprise est donné sans contrepartie.** L'entreprise paie
 * pour joindre un candidat qu'elle n'a pas encore retenu ; l'intérimaire, lui, est
 * affecté — lui faire payer le numéro du chantier où il doit se rendre n'aurait aucun
 * sens, et le rapport de force ne va pas dans ce sens-là.
 */

interface Chantier {
  adresse: string | null;
  code_postal: string;
  ville: string;
  horaires: string | null;
  date_debut: string;
  raison_sociale: string;
  telephone_chiffre: string | null;
}

const enDateFr = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/** Jours avant le début, négatif si le chantier a commencé. */
function joursAvant(iso: string): number {
  const debut = Date.parse(`${iso}T00:00:00Z`);
  const aujourdhui = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((debut - aujourdhui) / 86400000);
}

export default async function FicheChantier({
  sql,
  missionId,
}: {
  sql: ReturnType<typeof connexion>;
  missionId: number;
}) {
  const [c] = await sql<Chantier[]>`
    select m.adresse, m.code_postal, m.ville, m.horaires, m.date_debut::text,
           e.raison_sociale, e.telephone_chiffre
      from mission m join entreprise e on e.compte_id = m.entreprise_id
     where m.id = ${missionId}`;
  if (!c) return null;

  const adresseComplete = [c.adresse, `${c.code_postal} ${c.ville}`].filter(Boolean).join(", ");
  const telephone = dechiffrerOptionnel(c.telephone_chiffre);
  const jours = joursAvant(c.date_debut);

  const quand =
    jours > 1
      ? `Dans ${jours} jours — ${enDateFr(c.date_debut)}`
      : jours === 1
        ? `Demain — ${enDateFr(c.date_debut)}`
        : jours === 0
          ? `Aujourd'hui`
          : `Commencé le ${enDateFr(c.date_debut)}`;

  return (
    <section aria-labelledby="titre-chantier" className="carte carte--verdict-ok">
      <div className="tete-carte">
        <h2 id="titre-chantier" className="titre-carte">
          Vous présenter sur le chantier
        </h2>
        <span className={jours >= 0 ? "pastille pastille--ok" : "pastille"}>{quand}</span>
      </div>

      <ul className="liste-nue">
        <li className="ligne">
          <span>Adresse</span>
          <strong style={{ textAlign: "right" }}>
            {/* Une adresse sert à s'y rendre : le lien ouvre l'itinéraire dans
                l'application de cartes du téléphone, plutôt que de laisser
                recopier une rue à la main au volant. */}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresseComplete)}`}
              target="_blank"
              rel="noreferrer"
            >
              {adresseComplete}
            </a>
          </strong>
        </li>
        <li className="ligne">
          <span>Horaires</span>
          <strong style={{ textAlign: "right" }}>
            {c.horaires ?? <span className="petit secondaire">à confirmer avec l&apos;entreprise</span>}
          </strong>
        </li>
        <li className="ligne">
          <span>{c.raison_sociale}</span>
          <strong>
            {telephone ? (
              <a href={`tel:${telephone}`}>{telephone}</a>
            ) : (
              <span className="petit secondaire">aucun numéro renseigné</span>
            )}
          </strong>
        </li>
      </ul>

      <p className="petit secondaire">
        Présentez-vous avec vos habilitations et votre carte BTP : elles peuvent être
        contrôlées à l&apos;entrée du chantier.
      </p>
    </section>
  );
}
