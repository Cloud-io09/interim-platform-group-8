import { connexion } from "@interimatch/core/db";
import EnteteEspace from "@/components/EnteteEspace";
import { exigerSession } from "@/lib/garde";
import { lireProfilEntreprise } from "@/lib/profils";

export const dynamic = "force-dynamic";

/** Chrome de l'espace entreprise. Même principe que côté intérimaire. */
export default async function LayoutEntreprise({ children }: { children: React.ReactNode }) {
  const session = await exigerSession("entreprise");

  const sql = connexion();
  let profil = null;
  try {
    profil = await lireProfilEntreprise(sql, session.compteId);
  } finally {
    await sql.end();
  }

  const initiales = profil
    ? profil.raisonSociale
        .split(" ")
        .map((m) => m[0] ?? "")
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <>
      <div className="bandeau-espace">
        <div className="colonne">
          <EnteteEspace
            initiales={initiales}
            titre={profil ? profil.raisonSociale : "Bienvenue"}
            sousTitre={
              profil
                ? `${profil.ville}${profil.siret ? ` · SIRET ${profil.siret}` : ""}`
                : "Renseignez votre entreprise pour publier"
            }
            libelleNavigation="Sections de mon espace"
            onglets={[
              { href: "/espace/entreprise", libelle: "Tableau de bord" },
              { href: "/missions", libelle: "Mes fiches" },
              { href: "/candidatures", libelle: "Candidatures" },
              { href: "/missions/nouvelle", libelle: "Publier" },
              { href: "/espace/entreprise/profil", libelle: "Mon entreprise" },
            ]}
          />
        </div>
      </div>
      {children}
    </>
  );
}
