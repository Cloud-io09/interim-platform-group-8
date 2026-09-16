import type { Metadata } from "next";
import FormulaireAuth from "@/components/FormulaireAuth";

export const metadata: Metadata = {
  title: "Créer un compte entreprise",
  robots: { index: false, follow: false },
};

export default function InscriptionEntreprise() {
  return (
    <section className="section">
      <div className="colonne colonne--etroite">
        <div className="carte">
          <p className="sur-titre">Étape 1 sur 2</p>
          <FormulaireAuth
            mode="inscription"
            role="entreprise"
            titre="Créer un compte entreprise"
            intro="Vos identifiants d'abord. Ensuite, votre raison sociale et l'adresse de vos chantiers."
            libelleBouton="Continuer"
          />
        </div>
        <p className="petit secondaire" style={{ marginTop: "1.5rem" }}>
          Vous cherchez des missions ? <a href="/inscription/interimaire">Créer un profil intérimaire</a>.
          <br />
          Déjà inscrit ? <a href="/connexion">Se connecter</a>.
        </p>
      </div>
    </section>
  );
}
