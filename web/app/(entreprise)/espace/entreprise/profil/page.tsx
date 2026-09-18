import type { Metadata } from "next";
import FormulaireProfilEntreprise from "@/components/FormulaireProfilEntreprise";
import SupprimerCompte from "@/components/SupprimerCompte";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Mon entreprise", robots: { index: false, follow: false } };

export default async function ProfilEntreprise({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  await exigerSession("entreprise");
  const { suite } = await searchParams;

  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="petit secondaire"><a href="/espace/entreprise">← Mon espace</a></p>
        <h1 className="titre-page">Mon entreprise</h1>
        <p className="secondaire">
          Ces informations servent de référence à vos fiches de poste. Chaque mission
          pourra avoir sa propre adresse de chantier.
        </p>
        {/* Après une inscription, on enchaîne directement sur la première fiche de
            poste : c'est la seule action utile à ce moment du parcours. */}
        <FormulaireProfilEntreprise
          apresEnregistrement={suite === "premiere-mission" ? "/missions/nouvelle" : undefined}
        />
        <hr className="separateur" />
        <SupprimerCompte />
      </div>
    </section>
  );
}
