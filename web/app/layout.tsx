import type { Metadata } from "next";
import "./globals.css";
import Entete from "@/components/Entete";

export const metadata: Metadata = {
  metadataBase: new URL("https://interimatch.vercel.app"),
  title: {
    default: "Intérimatch — l'intérim du BTP, sur certifications vérifiées",
    template: "%s | Intérimatch",
  },
  description:
    "Plateforme de mise en relation entre entreprises du BTP et intérimaires. " +
    "Le rapprochement se fait sur des certifications structurées et leur validité " +
    "à la date de la mission, pas sur des mots-clés de CV.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Intérimatch",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a className="lien-evitement" href="#contenu">
          Aller au contenu principal
        </a>

        <Entete />

        <main id="contenu">{children}</main>

        <footer className="pied">
          <div className="colonne grille grille--3">
            <div>
              <h2>Intérimatch</h2>
              <p>
                La plateforme d&apos;intérim dédiée au BTP. Projet Epitech, preuve de
                concept réalisée en 11 jours.
              </p>
            </div>
            <div>
              <h2>Conformité</h2>
              <ul>
                <li><a href="/mentions-legales">Mentions légales</a></li>
                <li><a href="/confidentialite">Protection des données</a></li>
                <li><a href="/accessibilite">Accessibilité — partiellement conforme</a></li>
              </ul>
            </div>
            <div>
              <h2>Données</h2>
              <ul>
                <li>Offres enrichies via l&apos;API France Travail</li>
                <li>Géocodage par la Base Adresse Nationale</li>
                <li>Écoconception : compression, chargement différé</li>
              </ul>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
