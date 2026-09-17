import type { Metadata } from "next";
import DepotCv from "@/components/DepotCv";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Mon CV", robots: { index: false, follow: false } };

export default async function PageCv() {
  await exigerSession("interimaire");
  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="petit secondaire"><a href="/espace/interimaire">← Mon espace</a></p>
        {/* Chaque page porte son propre h1 : sans lui, la navigation par titres
            d'un lecteur d'écran n'a aucun point d'entrée. */}
        <h1>Mon CV</h1>
        <p className="secondaire">Déposez-le pour préremplir votre profil et repérer des missions proches.</p>
        <DepotCv />
      </div>
    </section>
  );
}
