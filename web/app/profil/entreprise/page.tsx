import type { Metadata } from "next";
import FormulaireProfilEntreprise from "@/components/FormulaireProfilEntreprise";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Profil entreprise",
  robots: { index: false, follow: false },
};

export default async function ProfilEntreprise() {
  await exigerSession("entreprise");

  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="sur-titre">Étape 2 sur 2</p>
        <h1>Profil entreprise</h1>
        <p className="secondaire">
          Une fois ce profil renseigné, vous pourrez publier des fiches de poste et recevoir
          des profils déjà filtrés sur les habilitations exigées.
        </p>
        <FormulaireProfilEntreprise />
      </div>
    </section>
  );
}
