"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Compte {
  role: "entreprise" | "interimaire";
}

/**
 * En-tête dépendant de la session.
 *
 * Composant client volontairement : lire le cookie côté serveur dans le layout
 * rendrait TOUTES les pages dynamiques, y compris l'accueil et les pages légales,
 * qui doivent rester prérendues pour le SEO et pour la sobriété.
 *
 * Tant que la session n'est pas connue, la zone d'action reste vide plutôt que
 * d'afficher « Se connecter » à quelqu'un qui l'est déjà : un état faux affiché puis
 * corrigé est plus déroutant qu'un court silence.
 */
export default function Entete() {
  const router = useRouter();
  const [compte, setCompte] = useState<Compte | null | undefined>(undefined);
  const [deconnexionEnCours, setDeconnexion] = useState(false);

  useEffect(() => {
    fetch("/api/moi")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCompte(d?.compte ?? null))
      .catch(() => setCompte(null));
  }, []);

  async function deconnecter() {
    setDeconnexion(true);
    await fetch("/api/auth/deconnexion", { method: "POST" });
    setCompte(null);
    setDeconnexion(false);
    router.push("/");
    router.refresh();
  }

  const liens =
    compte?.role === "entreprise"
      ? [
          { href: "/missions", libelle: "Mes fiches de poste" },
          { href: "/missions/nouvelle", libelle: "Publier" },
          { href: "/espace/entreprise", libelle: "Mon espace" },
        ]
      : compte?.role === "interimaire"
        ? [
            { href: "/mes-missions", libelle: "Les missions" },
            { href: "/espace/interimaire", libelle: "Mon espace" },
          ]
        : [];

  return (
    <header className="entete">
      <div className="colonne">
        <a href="/" className="marque" aria-label="Intérimatch, accueil">
          <span className="marque-carre" aria-hidden="true" />
          Intérimatch
          <span className="marque-etiquette">BTP</span>
        </a>

        <nav aria-label="Navigation principale" className="navigation">
          {liens.map((l) => (
            <a key={l.href} href={l.href} className="lien-navigation">
              {l.libelle}
            </a>
          ))}
          {compte === undefined ? null : compte ? (
            <button className="bouton bouton--secondaire" onClick={deconnecter} disabled={deconnexionEnCours}>
              {deconnexionEnCours ? "Déconnexion…" : "Se déconnecter"}
            </button>
          ) : (
            <a className="bouton bouton--secondaire" href="/connexion">
              Se connecter
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
