import type { Metadata } from "next";
import FormulaireRecuperation from "@/components/FormulaireRecuperation";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export default function MotDePasseOublie() {
  return (
    <section className="section">
      <div className="colonne colonne--etroite">
        <h1>Mot de passe oublié</h1>
        <p className="secondaire">
          Utilisez l&apos;un des codes de récupération qui vous ont été remis à
          l&apos;inscription. Chaque code ne sert qu&apos;une fois.
        </p>

        <div className="carte">
          <FormulaireRecuperation />
        </div>

        <p className="petit secondaire" style={{ marginTop: "1.5rem" }}>
          Vous n&apos;avez plus aucun code ? Contactez votre agence : elle seule peut
          vérifier votre identité. Nous ne pouvons pas rendre un accès sans preuve —
          ce serait le rendre à n&apos;importe qui.
        </p>
        <p className="petit secondaire">
          <a href="/connexion">Retour à la connexion</a>
        </p>
      </div>
    </section>
  );
}
