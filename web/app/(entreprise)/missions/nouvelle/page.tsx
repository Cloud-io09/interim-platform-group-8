import type { Metadata } from "next";
import FormulaireMission from "@/components/FormulaireMission";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Publier une fiche de poste",
  robots: { index: false, follow: false },
};

export default async function NouvelleMission() {
  await exigerSession("entreprise");

  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <h1 className="titre-page">Publier une fiche de poste</h1>
        <p className="secondaire">
          Décrivez le besoin réel du chantier. Les champs se préremplissent à partir des
          offres publiques France Travail pour le métier choisi - intitulés courants,
          habilitations habituellement exigées, rémunération observée localement.
        </p>
        <FormulaireMission />
      </div>
    </section>
  );
}
