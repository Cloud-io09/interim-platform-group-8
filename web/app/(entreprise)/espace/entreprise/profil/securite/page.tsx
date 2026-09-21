import type { Metadata } from "next";
import OngletsProfil from "@/components/OngletsProfil";
import SecuriteCompte from "@/components/SecuriteCompte";
import SupprimerCompte from "@/components/SupprimerCompte";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Sécurité du compte", robots: { index: false, follow: false } };

export default async function SecuriteEntreprise() {
  await exigerSession("entreprise");

  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="petit secondaire"><a href="/espace/entreprise">← Mon espace</a></p>
        <h1 className="titre-page">Sécurité du compte</h1>
        <OngletsProfil role="entreprise" />
        <SecuriteCompte />
        <SupprimerCompte />
      </div>
    </section>
  );
}
