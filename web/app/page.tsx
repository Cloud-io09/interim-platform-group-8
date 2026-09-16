import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "L'intérim du BTP, sur certifications vérifiées",
  alternates: { canonical: "/" },
};

/**
 * Chiffres du relevé France Travail du 14 septembre 2026, méthode `scan-domaines`
 * (agrégation par grand domaine ROME). La date est affichée : le nombre d'offres
 * actives change tous les jours, un chiffre sans date n'est pas vérifiable.
 */
const RELEVE = {
  date: "14 septembre 2026",
  offresBtp: 54158,
  missionsBtp: 29672,
  partMissions: 55,
  partMetiersTerrain: 67,
};

const nombre = (n: number) => n.toLocaleString("fr-FR");

const FONCTIONNALITES = [
  {
    titre: "Matching en deux temps",
    texte:
      "Un filtre éliminatoire écarte d'abord les profils non conformes, puis seuls les " +
      "profils restants sont classés. Aucun score ne rattrape une certification manquante.",
  },
  {
    titre: "Certifications à date d'échéance",
    texte:
      "La validité est comparée à la date de fin de mission, pas à celle du jour. Une " +
      "habilitation qui expire pendant le chantier écarte le profil.",
  },
  {
    titre: "Missions à proximité",
    texte:
      "Rayon de mobilité réglable par l'intérimaire, 50 km par défaut, aligné sur le " +
      "périmètre du CDI intérimaire.",
  },
  {
    titre: "Alerte avant expiration",
    texte:
      "L'intérimaire est prévenu en amont, avec le nombre de missions ouvertes qu'un " +
      "renouvellement lui débloquerait.",
  },
  {
    titre: "Notification de mission",
    texte: "Dès qu'une mission publiée correspond au profil, sans avoir à consulter la plateforme.",
  },
  {
    titre: "Fiche de poste enrichie",
    texte:
      "Intitulés normalisés, certifications typiques du métier et fourchette de " +
      "rémunération locale, issus des données publiques France Travail.",
  },
];

export default function Accueil() {
  return (
    <>
      <section className="section">
        <div className="colonne">
          <h1>Sur ce chantier, qui a le droit de monter dans l&apos;engin&nbsp;?</h1>
          <p style={{ maxWidth: "54ch", fontSize: "1.125rem" }} className="secondaire">
            Intérimatch écarte d&apos;emblée les profils dont le CACES, l&apos;AIPR ou
            l&apos;habilitation expire avant la fin de votre chantier. Vous ne recevez que
            des candidats affectables, classés par proximité et disponibilité.
          </p>
          <p style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "2rem" }}>
            <a className="bouton" href="/inscription/interimaire">
              Trouver une mission
            </a>
            <a className="bouton bouton--secondaire" href="/inscription/entreprise">
              Je recrute pour mon chantier
            </a>
          </p>
        </div>
      </section>

      <section className="section section--sombre">
        <div className="colonne">
          <p className="sur-titre">Le problème</p>
          <h2 style={{ maxWidth: "24ch" }}>
            Le BTP recourt le plus à l&apos;intérim, et sa mise en relation reste la plus
            artisanale.
          </h2>
          <div className="grille grille--3" style={{ marginTop: "2.5rem" }}>
            <div>
              <p className="statistique">{nombre(RELEVE.offresBtp)}</p>
              <p className="petit secondaire">
                offres BTP recensées via l&apos;API France Travail
              </p>
            </div>
            <div>
              <p className="statistique">{RELEVE.partMissions} %</p>
              <p className="petit secondaire">
                de ces offres sont des missions d&apos;intérim — le ratio le plus élevé des
                quatre secteurs mesurés
              </p>
            </div>
            <div>
              <p className="statistique">{RELEVE.partMetiersTerrain} %</p>
              <p className="petit secondaire">
                sur les seuls métiers de terrain, une fois écartés conception et
                encadrement de chantier
              </p>
            </div>
          </div>
          {/* La source et la date accompagnent les chiffres : sans elles, ils ne sont
              pas vérifiables — et c'est le reproche qu'on adresse aux concurrents. */}
          <p className="petit secondaire" style={{ marginTop: "1.5rem" }}>
            Relevé du {RELEVE.date}, API Offres d&apos;emploi France Travail, agrégation par
            grand domaine ROME. Le nombre d&apos;offres actives évolue chaque jour.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="colonne">
          <p className="sur-titre">Ce que fait la plateforme</p>
          <h2>Six fonctions, une seule promesse.</h2>
          <div className="grille grille--3" style={{ marginTop: "2rem" }}>
            {FONCTIONNALITES.map((f) => (
              <article className="carte" key={f.titre}>
                <h3>{f.titre}</h3>
                <p className="petit secondaire" style={{ margin: 0 }}>
                  {f.texte}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
