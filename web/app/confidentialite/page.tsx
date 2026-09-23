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
          <li>
            Aucune revente. Aucune transmission à un tiers, <strong>sauf une, et
            seulement si vous la demandez</strong> : le relais de vos notifications
            vers Discord, décrit ci-dessous.
          </li>
          <li>Aucun traceur publicitaire. Le seul cookie déposé est celui de session.</li>
        </ul>

        <h2>Notifications sur Discord</h2>
        <p>
          Facultatif, et inactif tant que vous ne l&apos;avez pas demandé depuis votre
          profil. Si vous rattachez un compte Discord, un{" "}
          <strong>salon privé</strong> est créé pour vous sur notre serveur : vous seul
          pouvez le lire, ni les autres membres ni les entreprises.
        </p>
        <ul>
          <li>
            <strong>Ce qui y est envoyé</strong> : vos habilitations qui approchent de
            leur échéance, et les missions qui correspondent à votre profil. Ni votre
            adresse, ni votre téléphone, ni vos numéros d&apos;habilitation, ni le texte
            de votre CV.
          </li>
          <li>
            <strong>Ce que nous demandons à Discord</strong> : votre identifiant, et le
            droit de vous ajouter à notre serveur - sans quoi vous ne verriez pas votre
            salon. Ni votre adresse e-mail, ni vos messages. Votre adresse Discord
            n&apos;a pas besoin d&apos;être celle de votre compte ici.
          </li>
          <li>
            <strong>Pour arrêter</strong> : un bouton dans votre profil. Le salon est
            supprimé, avec tout ce qui y a été posté. La suppression de votre compte
            fait de même.
          </li>
        </ul>
        <p>
          Ce traitement repose sur votre <strong>consentement</strong> (article 6.1.a du
          RGPD), distinct de celui qui fonde le reste. Le retirer ne demande pas votre
          mot de passe : un consentement doit se retirer aussi facilement qu&apos;il se
          donne.
        </p>

        <h2>Durées de conservation</h2>
        <ul>
          <li><strong>Compte et profil</strong> : 24 mois après la dernière connexion, puis suppression.</li>
          <li><strong>Texte du CV</strong> : jusqu&apos;à son retrait par vous, ou la suppression du compte.</li>
          <li><strong>Session</strong> : 7 jours d&apos;inactivité, en base non relationnelle.</li>
          <li><strong>Tentatives de connexion</strong> : 15 minutes.</li>
          <li><strong>Traces de calcul de correspondance</strong> : 1 heure. Elles servent à expliquer un résultat, pas à archiver.</li>
          <li><strong>Salon Discord privé</strong> : jusqu&apos;à son détachement, ou la suppression du compte.</li>
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
