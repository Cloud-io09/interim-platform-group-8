import type { Metadata } from "next";
import FormulaireAuth from "@/components/FormulaireAuth";

export const metadata: Metadata = {
  title: "Connexion",
  // Page de compte : sans intérêt pour un moteur, et on évite d'exposer l'URL.
  robots: { index: false, follow: false },
};

export default function Connexion() {
  return (
    <section className="section">
      <div className="colonne colonne--etroite">
        <div className="carte">
          <FormulaireAuth
            mode="connexion"
            titre="Se connecter"
            intro="Accédez à votre espace intérimaire ou entreprise."
            libelleBouton="Se connecter"
          />
        </div>
        <p className="petit secondaire" style={{ marginTop: "1.5rem" }}>
          Pas encore de compte ? <a href="/inscription/interimaire">Créer un profil intérimaire</a>{" "}
          ou <a href="/inscription/entreprise">créer un compte entreprise</a>.
        </p>
      </div>
    </section>
  );
}
