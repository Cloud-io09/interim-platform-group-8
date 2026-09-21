import LiaisonDiscord from "@/components/LiaisonDiscord";
import SecuriteCompte from "@/components/SecuriteCompte";
import type { Metadata } from "next";
import FormulaireProfilInterimaire from "@/components/FormulaireProfilInterimaire";
import SupprimerCompte from "@/components/SupprimerCompte";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Mon profil", robots: { index: false, follow: false } };

export default async function ProfilInterimaire({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  await exigerSession("interimaire");
  const { suite } = await searchParams;

  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <p className="petit secondaire"><a href="/espace/interimaire">← Mon espace</a></p>
        <h1 className="titre-page">Mon profil</h1>
        <p className="secondaire">
          Ces informations décident des missions qui vous sont proposées. Vos
          certifications et vos disponibilités se renseignent séparément.
        </p>
        {/* Après l'inscription, on enchaîne sur les certifications : c'est ce qui
            conditionne l'accès aux chantiers, donc la seule suite utile. */}
        <FormulaireProfilInterimaire
          apresEnregistrement={suite === "certifications" ? "/espace/interimaire/certifications" : undefined}
        />
        <hr className="separateur" />
        <hr className="separateur" />
        <LiaisonDiscord />
        <SecuriteCompte />

        <SupprimerCompte />
      </div>
    </section>
  );
}
