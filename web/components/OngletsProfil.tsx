import OngletsEspace from "./OngletsEspace";
import type { RoleCompte } from "@interimatch/core";

/**
 * Sous-navigation du profil.
 *
 * La page réunissait tout : formulaire d'identité, rattachement Discord, adresse
 * e-mail, mot de passe, codes de récupération et suppression de compte. Six sujets
 * sans rapport les uns avec les autres, empilés sur un seul défilement, tous rendus
 * dans la même carte grise — on ne voyait plus où l'un finissait.
 *
 * Trois sections, sur de vraies routes plutôt que des onglets en mémoire : chacune
 * s'ouvre par un lien, se partage, et le retour d'OAuth peut viser directement celle
 * qui le concerne.
 */
export default function OngletsProfil({ role }: { role: RoleCompte }) {
  const base = role === "entreprise" ? "/espace/entreprise/profil" : "/espace/interimaire/profil";

  return (
    <OngletsEspace
      libelle="Sections de mon profil"
      onglets={[
        { href: base, libelle: role === "entreprise" ? "Mon entreprise" : "Mes informations" },
        { href: `${base}/notifications`, libelle: "Notifications" },
        { href: `${base}/securite`, libelle: "Sécurité" },
      ]}
    />
  );
}
