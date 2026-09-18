import type { Metadata } from "next";
import DemandeReinitialisation from "@/components/DemandeReinitialisation";
import FormulaireRecuperation from "@/components/FormulaireRecuperation";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

/**
 * Deux chemins, dans l'ordre de ce qui marche pour le plus de monde.
 *
 * Le lien par courriel d'abord : c'est le mécanisme que tout le monde connaît, et
 * le seul qui fonctionne sans avoir rien gardé sur soi. Les codes de récupération
 * ensuite, repliés — ils servent à qui a aussi perdu l'accès à sa boîte, ce qui est
 * exactement leur rôle ailleurs.
 */
export default function MotDePasseOublie() {
  return (
    <section className="section">
      <div className="colonne colonne--etroite">
        <h1>Mot de passe oublié</h1>
        <p className="secondaire">
          Indiquez l&apos;adresse de votre compte : vous recevrez un lien pour choisir un
          nouveau mot de passe. Il est valable une heure.
        </p>

        <div className="carte">
          <DemandeReinitialisation />
        </div>

        <details className="carte" style={{ marginTop: "1.5rem" }}>
          <summary>Je n&apos;ai plus accès à cette boîte e-mail</summary>
          <p className="petit secondaire" style={{ marginTop: "0.75rem" }}>
            Utilisez l&apos;un des codes de récupération qui vous ont été remis à
            l&apos;inscription. Chaque code ne sert qu&apos;une fois.
          </p>
          <FormulaireRecuperation />
        </details>

        <p className="petit secondaire" style={{ marginTop: "1.5rem" }}>
          Ni accès à votre boîte, ni code ? Contactez votre agence : elle seule peut
          vérifier votre identité. Nous ne pouvons pas rendre un accès sans preuve — ce
          serait le rendre à n&apos;importe qui.
        </p>
        <p className="petit secondaire">
          <a href="/connexion">Retour à la connexion</a>
        </p>
      </div>
    </section>
  );
}
