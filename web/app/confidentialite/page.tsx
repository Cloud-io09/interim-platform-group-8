import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Protection des données",
  description:
    "Base légale, données collectées, durées de conservation et droits des personnes sur la plateforme Intérimatch.",
  alternates: { canonical: "/confidentialite" },
};

export default function Confidentialite() {
  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <h1>Protection des données</h1>
        <p className="secondaire">
          Intérimatch traite des données personnelles pour mettre en relation des
          entreprises du bâtiment et des intérimaires. Cette page dit lesquelles, pourquoi,
          combien de temps, et ce que vous pouvez exiger.
        </p>

        <h2>Base légale</h2>
        <p>
          Le traitement repose sur <strong>l&apos;exécution de mesures précontractuelles</strong>{" "}
          prises à votre demande (article 6.1.b du RGPD) : créer un compte, déclarer vos
          habilitations et recevoir des propositions de mission constituent les étapes
          préalables à une éventuelle mission d&apos;intérim.
        </p>

        <h2>Données traitées</h2>
        <table>
          <caption className="secondaire petit">
            Données collectées selon le type de compte, et raison de leur collecte.
          </caption>
          <thead>
            <tr>
              <th scope="col">Donnée</th>
              <th scope="col">Pourquoi</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Adresse e-mail et mot de passe</th>
              <td>Authentification. Le mot de passe n&apos;est jamais stocké : seule son empreinte scrypt l&apos;est, avec un sel propre à chaque compte.</td>
            </tr>
            <tr>
              <th scope="row">Identité, commune, code postal</th>
              <td>Identifier le profil et calculer les distances entre domicile et chantier.</td>
            </tr>
            <tr>
              <th scope="row">Adresse précise et téléphone</th>
              <td>Facultatifs. Chiffrés au repos en AES-256-GCM. L&apos;adresse sert uniquement à affiner le géocodage.</td>
            </tr>
            <tr>
              <th scope="row">Certifications et habilitations</th>
              <td>Déterminer l&apos;éligibilité à une mission. Le numéro du titre est chiffré au repos.</td>
            </tr>
            <tr>
              <th scope="row">Carte BTP</th>
              <td>Documentée séparément. Elle n&apos;entre dans aucun calcul de correspondance.</td>
            </tr>
            <tr>
              <th scope="row">Texte du CV</th>
              <td>
                Facultatif. Le fichier déposé n&apos;est jamais conservé : seul le texte
                qui en est extrait l&apos;est, chiffré au repos, pour préremplir le profil
                et suggérer des missions proches. Retirable à tout moment depuis votre
                espace. Aucun service d&apos;analyse externe n&apos;est appelé.
              </td>
            </tr>
            <tr>
              <th scope="row">Disponibilités</th>
              <td>Mesurer le recouvrement avec les dates de mission.</td>
            </tr>
          </tbody>
        </table>

        <h2>Ce que nous ne faisons pas</h2>
        <ul>
          <li>
            Le CV ne sert qu&apos;à proposer : il ne décide jamais de votre accès à une
            mission. Cette décision repose uniquement sur vos certifications et leurs
            dates, que vous saisissez vous-même.
          </li>
          <li>Aucun profilage au-delà des critères annoncés.</li>
          <li>Aucune notation des intérimaires.</li>
          <li>Aucune revente ni transmission à des tiers.</li>
          <li>Aucun traceur publicitaire. Le seul cookie déposé est celui de session.</li>
        </ul>

        <h2>Durées de conservation</h2>
        <ul>
          <li><strong>Compte et profil</strong> : 24 mois après la dernière connexion, puis suppression.</li>
          <li><strong>Texte du CV</strong> : jusqu&apos;à son retrait par vous, ou la suppression du compte.</li>
          <li><strong>Session</strong> : 7 jours d&apos;inactivité, en base non relationnelle.</li>
          <li><strong>Tentatives de connexion</strong> : 15 minutes.</li>
          <li><strong>Traces de calcul de correspondance</strong> : 1 heure. Elles servent à expliquer un résultat, pas à archiver.</li>
        </ul>

        <h2>Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
          de limitation et de portabilité. Le profil et les certifications sont modifiables
          et supprimables à tout moment depuis votre espace. Pour une demande
          d&apos;effacement complet du compte, contactez l&apos;équipe.
        </p>
        <p className="secondaire">
          S&apos;agissant d&apos;un projet pédagogique, aucun délégué à la protection des
          données n&apos;est désigné.
        </p>
      </div>
    </section>
  );
}
