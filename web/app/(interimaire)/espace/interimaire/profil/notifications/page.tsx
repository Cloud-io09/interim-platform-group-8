import type { Metadata } from "next";
import LiaisonDiscord from "@/components/LiaisonDiscord";
import OngletsProfil from "@/components/OngletsProfil";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Notifications", robots: { index: false, follow: false } };

export default async function NotificationsInterimaire() {
  await exigerSession("interimaire");

  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="petit secondaire"><a href="/espace/interimaire">← Mon espace</a></p>
        <h1 className="titre-page">Notifications</h1>
        <OngletsProfil role="interimaire" />
        <LiaisonDiscord />
      </div>
    </section>
  );
}
