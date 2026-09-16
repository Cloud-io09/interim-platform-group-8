import type { Metadata } from "next";
import Certifications from "@/components/Certifications";
import FormulaireProfilInterimaire from "@/components/FormulaireProfilInterimaire";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Mon profil intérimaire",
  robots: { index: false, follow: false },
};

export default async function ProfilInterimaire() {
  // Garde côté serveur : un contrôle dans le navigateur se contourne.
  await exigerSession("interimaire");

  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="sur-titre">Étape 2 sur 2</p>
        <h1>Mon profil</h1>
        <p className="secondaire">
          Ces informations décident des missions qui vous sont proposées. Vous pourrez les
          modifier à tout moment.
        </p>
        <FormulaireProfilInterimaire />
        <hr className="separateur" />
        <Certifications />
      </div>
    </section>
  );
}
