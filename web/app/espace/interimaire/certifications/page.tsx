import type { Metadata } from "next";
import Certifications from "@/components/Certifications";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Mes certifications", robots: { index: false, follow: false } };

export default async function PageCertifications() {
  await exigerSession("interimaire");
  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="petit secondaire"><a href="/espace/interimaire">← Mon espace</a></p>
        {/* Chaque page porte son propre h1 : sans lui, la navigation par titres
            d'un lecteur d'écran n'a aucun point d'entrée. */}
        <h1>Mes certifications</h1>
        <p className="secondaire">Ce sont elles qui décident si vous pouvez aller sur un chantier.</p>
        <Certifications />
      </div>
    </section>
  );
}
