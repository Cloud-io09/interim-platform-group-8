import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "L'intérim du BTP, sur habilitations vérifiées",
  alternates: { canonical: "/" },
};

/**
 * Relevé France Travail du 14 septembre 2026, méthode `scan-domaines` (agrégation par
 * grand domaine ROME). La date accompagne toujours les chiffres : le nombre d'offres
 * actives change chaque jour, et un chiffre sans date n'est pas vérifiable.
 */
const RELEVE = {
  date: "14 septembre 2026",
  offresBtp: 54158,
  missionsBtp: 29672,
  partMissions: 55,
  partMetiersTerrain: 67,
};

const nombre = (n: number) => n.toLocaleString("fr-FR");

/** Arguments écrits du point de vue de celui qui lit, dans ses termes à lui. */
const POUR_ENTREPRISES = [
  {
    titre: "Conformité d'abord, classement ensuite",
    texte:
      "Un profil auquel il manque une habilitation exigée ne vous est pas proposé. " +
      "Les autres sont classés par compétences communes, distance et disponibilité.",
  },
  {
    titre: "Validité vérifiée à la date de fin",
    texte:
      "Un CACES valide aujourd'hui mais périmé le 15 ne couvre pas un chantier qui " +
      "finit le 21. C'est cette date-là que nous comparons, pas celle du jour.",
  },
  {
    titre: "Fiche de poste préremplie",
    texte:
      "Choisissez le métier : les habilitations habituellement exigées et la " +
      "rémunération observée dans votre département viennent des offres publiques.",
  },
];

const POUR_INTERIMAIRES = [
  {
    titre: "Vos titres, avec leurs dates",
    texte:
      "Vous déclarez vos CACES, AIPR et habilitations avec leur échéance. Rien " +
      "d'autre ne détermine votre accès à un chantier - ni CV, ni notation.",
  },
  {
    titre: "Prévenu avant l'échéance",
    texte:
      "Une alerte avant qu'un titre expire, accompagnée du nombre de missions " +
      "ouvertes qu'un renouvellement vous rouvrirait.",
  },
  {
    titre: "Les missions viennent à vous",
    texte:
      "Dès qu'une mission publiée correspond à vos métiers et à vos titres valides, " +
      "vous êtes prévenu. Vous fixez vous-même votre zone de déplacement.",
  },
];

export default function Accueil() {
  return (
    <>
      <section className="section hero-section">
        <div className="hero-banniere">
          <Image
            src="/images/accueil-hero.jpg"
            alt=""
            fill
            sizes="100vw"
            quality={70}
            priority
            className="hero-banniere-image"
          />
          <div className="colonne hero-banniere-alignement">
            <div className="hero-banniere-contenu">
              <h1>L&apos;intérim du BTP, sur habilitations vérifiées.</h1>
              <p className="hero-texte">
                Les entreprises publient un besoin avec les habilitations exigées. Les
                intérimaires déclarent les leurs, avec leurs dates. Nous ne rapprochons que
                ce qui est conforme à la date du chantier.
              </p>
              <p className="hero-actions">
                <a className="bouton" href="/inscription/entreprise">
                  Je recrute pour un chantier
                </a>
                <a className="bouton bouton--secondaire bouton--sur-image" href="/inscription/interimaire">
                  Je cherche des missions
                </a>
              </p>
              {/* La grille était atteignable depuis l'en-tête seulement, alors que
                  l'accueil est la page qu'on lit avant de décider. Et la phrase dit ce
                  qui est gratuit avant d'annoncer un prix : c'est l'engagement du
                  produit, pas une accroche. Dans le bandeau plutôt qu'en dessous : la
                  photo descend jusqu'à cette ligne, elle ne s'arrête plus juste après
                  les boutons. */}
              <p className="hero-note">
                Pour les intérimaires, tout est gratuit. Pour les entreprises, le
                rapprochement et la conformité le sont aussi -{" "}
                <a href="/tarifs">voir ce qui se paie</a>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ borderTop: "1px solid var(--bordure)" }}>
        <div className="colonne">
          <p className="sur-titre sur-titre--accent-jaune">Pourquoi le BTP</p>
          <h2 style={{ maxWidth: "26ch" }}>
            Plus d&apos;une offre du BTP sur deux est une mission d&apos;intérim.
          </h2>
          <div className="grille grille--3" style={{ marginTop: "2rem" }}>
            <div>
              <p className="statistique">{nombre(RELEVE.offresBtp)}</p>
              <p className="petit secondaire">offres BTP recensées via l&apos;API France Travail</p>
            </div>
            <div>
              <p className="statistique">{RELEVE.partMissions} %</p>
              <p className="petit secondaire">
                sont des missions d&apos;intérim - le ratio le plus élevé des quatre
                secteurs mesurés
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
          <p className="petit secondaire" style={{ marginTop: "1.5rem" }}>
            Relevé du {RELEVE.date}, API Offres d&apos;emploi France Travail, agrégation
            par grand domaine ROME. Le nombre d&apos;offres actives évolue chaque jour.
          </p>
        </div>
      </section>

      {/* Deux blocs distincts plutôt qu'une liste mixte : un intérimaire n'a pas à
          trier ce qui le concerne dans une page écrite pour les entreprises. */}
      <section className="section section--sombre section--illustree-fond">
        <div className="fond-image" aria-hidden="true">
          <Image src="/images/accueil-grue.jpg" alt="" fill sizes="100vw" quality={60} />
        </div>
        <div className="colonne">
          <p className="sur-titre">Vous recrutez</p>
          <h2>Vous ne recevez que des profils affectables.</h2>
          <div className="grille grille--3" style={{ marginTop: "2rem" }}>
            {POUR_ENTREPRISES.map((f) => (
              <article className="carte" key={f.titre}>
                <h3>{f.titre}</h3>
                <p className="petit secondaire" style={{ margin: 0 }}>{f.texte}</p>
              </article>
            ))}
          </div>
          <p style={{ marginTop: "2rem" }}>
            <a className="bouton" href="/inscription/entreprise">Publier une fiche de poste</a>
          </p>
        </div>
      </section>

      <section className="section" style={{ borderTop: "1px solid var(--bordure)" }}>
        <div className="colonne">
          <div className="section-illustree section-illustree--inverse">
            <div>
              <p className="sur-titre">Vous cherchez des missions</p>
              <h2>Ce sont vos habilitations qui ouvrent les chantiers.</h2>
            </div>
            <div className="section-illustree-media">
              <Image
                src="/images/accueil-terrain.jpg"
                alt=""
                fill
                sizes="(min-width: 860px) 40vw, 90vw"
              />
            </div>
          </div>
          <div className="grille grille--3" style={{ marginTop: "2rem" }}>
            {POUR_INTERIMAIRES.map((f) => (
              <article className="carte" key={f.titre}>
                <h3>{f.titre}</h3>
                <p className="petit secondaire" style={{ margin: 0 }}>{f.texte}</p>
              </article>
            ))}
          </div>
          <p style={{ marginTop: "2rem" }}>
            <a className="bouton" href="/inscription/interimaire">Créer mon profil</a>
          </p>
        </div>
      </section>
    </>
  );
}
