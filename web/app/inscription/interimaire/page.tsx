import type { Metadata } from "next";
import FormulaireAuth from "@/components/FormulaireAuth";

export const metadata: Metadata = {
  title: "Créer mon profil intérimaire",
  robots: { index: false, follow: false },
};

export default function InscriptionInterimaire() {
  return (
    <section className="section">
      <div className="colonne colonne--etroite">
        <div className="carte">
          <p className="sur-titre">Étape 1 sur 2</p>
          <FormulaireAuth
            mode="inscription"
            role="interimaire"
            titre="Créer mon compte intérimaire"
            intro="Vos identifiants d'abord. Ensuite, vos métiers, vos certifications et votre zone de déplacement."
            libelleBouton="Continuer"
          />
        </div>
        <p className="petit secondaire" style={{ marginTop: "1.5rem" }}>
          Vous recrutez pour un chantier ? <a href="/inscription/entreprise">Créer un compte entreprise</a>.
          <br />
          Déjà inscrit ? <a href="/connexion">Se connecter</a>.
        </p>
      </div>
    </section>
  );
}
