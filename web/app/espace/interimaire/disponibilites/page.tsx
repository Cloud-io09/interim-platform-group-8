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
        <Disponibilites />
      </div>
    </section>
  );
}
