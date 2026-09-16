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
        <Certifications />
      </div>
    </section>
  );
}
