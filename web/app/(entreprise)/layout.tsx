import { connexion } from "@interimatch/core/db";
import { configDiscord } from "@interimatch/core";
import EnteteEspace from "@/components/EnteteEspace";
import RappelsEspace from "@/components/RappelsEspace";
import { exigerSession } from "@/lib/garde";
import { lireProfilEntreprise } from "@/lib/profils";

export const dynamic = "force-dynamic";

/** Chrome de l'espace entreprise. Même principe que côté intérimaire. */
export default async function LayoutEntreprise({ children }: { children: React.ReactNode }) {
  const session = await exigerSession("entreprise");

  const sql = connexion();
  let profil = null;
  let adresseVerifiee = true;
  let discordRelie = true;
  try {
    const [compte] = await sql<
      { email_verifie_le: Date | null; discord_utilisateur_id: string | null }[]
    >`select email_verifie_le, discord_utilisateur_id
        from compte where id = ${session.compteId}`;
    adresseVerifiee = compte?.email_verifie_le != null;
    discordRelie = compte?.discord_utilisateur_id != null;
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
              { href: "/espace/entreprise/abonnement", libelle: "Mon abonnement" },
              { href: "/espace/entreprise/profil", libelle: "Mon entreprise" },
            ]}
          />
        </div>
      </div>
      <RappelsEspace
        email={session.email}
        role="entreprise"
        adresseVerifiee={adresseVerifiee}
        discordRelie={discordRelie}
        discordDisponible={relaisDiscordMonte()}
      />
      {children}
    </>
  );
}

/** Le relais est-il monté ? Proposer un rattachement qui échouera ne sert personne. */
function relaisDiscordMonte(): boolean {
  return configDiscord() !== null && Boolean(process.env.DISCORD_CLIENT_SECRET?.trim());
}
