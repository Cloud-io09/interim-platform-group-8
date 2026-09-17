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
        <DepotCv />
      </div>
    </section>
  );
}
