import type { Metadata } from "next";
import ConfirmationAdresse from "@/components/ConfirmationAdresse";

export const metadata: Metadata = {
  title: "Confirmation de votre adresse",
  robots: { index: false, follow: false },
};

/**
 * Écran d'arrivée des deux liens d'adresse : première vérification et changement.
 *
 * Volontairement hors des espaces authentifiés. Le lien s'ouvre le plus souvent sur le
 * téléphone, depuis une application de messagerie, alors que la session est ouverte
 * ailleurs : exiger d'être connecté ferait échouer le cas le plus courant.
 */
export default async function Verification({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string }>;
}) {
  const { jeton } = await searchParams;

  return (
    <section className="section">
      <div className="colonne colonne--etroite">
        <h1>Confirmation de votre adresse</h1>
        {jeton ? (
          <ConfirmationAdresse jeton={jeton} />
        ) : (
          <div className="carte carte--verdict-bloque">
            <h2 className="titre-carte">Ce lien est incomplet</h2>
            <p className="petit secondaire">
              Ouvrez le lien depuis le courriel reçu, sans le retaper à la main.
            </p>
            <a className="bouton bouton--secondaire" href="/espace">
              Revenir à mon espace
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
