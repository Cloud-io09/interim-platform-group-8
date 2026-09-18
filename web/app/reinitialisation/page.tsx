import type { Metadata } from "next";
import FormulaireNouveauMotDePasse from "@/components/FormulaireNouveauMotDePasse";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  robots: { index: false, follow: false },
};

export default async function Reinitialisation({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string }>;
}) {
  const { jeton } = await searchParams;

  return (
    <section className="section">
      <div className="colonne colonne--etroite">
        <h1>Nouveau mot de passe</h1>
        {jeton ? (
          <>
            <p className="secondaire">
              Choisissez un nouveau mot de passe. Toutes vos sessions ouvertes seront
              fermées.
            </p>
            <div className="carte">
              <FormulaireNouveauMotDePasse jeton={jeton} />
            </div>
          </>
        ) : (
          <div className="carte carte--verdict-bloque">
            <h2 className="titre-carte">Ce lien est incomplet</h2>
            <p className="petit secondaire">
              Ouvrez le lien depuis le courriel reçu, sans le retaper à la main.
            </p>
            <a className="bouton bouton--secondaire" href="/mot-de-passe-oublie">
              Demander un nouveau lien
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
