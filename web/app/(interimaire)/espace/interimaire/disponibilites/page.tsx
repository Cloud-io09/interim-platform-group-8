import type { Metadata } from "next";
import Disponibilites from "@/components/Disponibilites";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Mes disponibilités", robots: { index: false, follow: false } };

export default async function PageDisponibilites() {
  await exigerSession("interimaire");
  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="petit secondaire"><a href="/espace/interimaire">← Mon espace</a></p>
        {/* Chaque page porte son propre h1 : sans lui, la navigation par titres
            d'un lecteur d'écran n'a aucun point d'entrée. */}
        <h1 className="titre-page">Mes disponibilités</h1>
        <p className="secondaire">Les périodes où vous pouvez travailler. Elles pèsent dans le classement, jamais dans l'exclusion.</p>
        <Disponibilites />
      </div>
    </section>
  );
}
