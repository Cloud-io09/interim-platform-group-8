"use client";

import { usePathname } from "next/navigation";

export interface Onglet {
  href: string;
  libelle: string;
}

/**
 * Onglets d'un espace, l'actif déduit du chemin courant.
 *
 * Client uniquement pour lire `usePathname` : la barre vit dans un layout, donc elle
 * n'est pas re-rendue d'une page à l'autre — seule la marque de l'onglet actif change.
 *
 * Un onglet est actif quand le chemin lui appartient, préfixe compris : `/mes-missions/12`
 * doit allumer « Mes missions ». Le plus long préfixe gagne, sinon `/espace/interimaire`
 * allumerait aussi « Tableau de bord » depuis `/espace/interimaire/certifications`.
 */
export default function OngletsEspace({ onglets, libelle }: { onglets: Onglet[]; libelle: string }) {
  const chemin = usePathname();

  const actif = onglets
    .filter((o) => chemin === o.href || chemin.startsWith(`${o.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="onglets" aria-label={libelle}>
      <ul className="liste-nue">
        {onglets.map((o) => (
          <li key={o.href}>
            <a
              href={o.href}
              className={o.href === actif ? "onglet onglet--actif" : "onglet"}
              aria-current={o.href === actif ? "page" : undefined}
            >
              {o.libelle}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
