import { connexion } from "@interimatch/core/db";
import { configDiscord } from "@interimatch/core";
import EnteteEspace from "@/components/EnteteEspace";
import RappelsEspace from "@/components/RappelsEspace";
import { exigerSession } from "@/lib/garde";
import { lireProfilInterimaire } from "@/lib/profils";

export const dynamic = "force-dynamic";

/**
 * Chrome de l'espace intérimaire.
 *
 * Toutes les vues du rôle vivent dans ce groupe de routes, ce qui permet de poser la
 * barre d'identité et les onglets **une seule fois** : Next conserve le layout d'une
 * page à l'autre, la barre n'est donc ni démontée ni redessinée à chaque navigation.
 *
 * La garde de rôle est ici aussi. Chaque page garde la sienne — la défense ne doit pas
 * tenir à un seul fichier — mais l'avoir au niveau du groupe évite qu'une page ajoutée
 * plus tard soit ouverte par oubli.
 */
export default async function LayoutInterimaire({ children }: { children: React.ReactNode }) {
  const session = await exigerSession("interimaire");

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
    profil = await lireProfilInterimaire(sql, session.compteId);
  } finally {
    await sql.end();
  }

  const initiales = profil
    ? `${profil.prenom[0] ?? ""}${profil.nom[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <>
      <div className="bandeau-espace">
        <div className="colonne">
          <EnteteEspace
            initiales={initiales}
            titre={profil ? `${profil.prenom} ${profil.nom}` : "Bienvenue"}
            sousTitre={
              profil
                ? `${profil.metiers.length} métier${profil.metiers.length > 1 ? "s" : ""} déclaré${profil.metiers.length > 1 ? "s" : ""} · ${profil.ville} · jusqu'à ${profil.rayonMobiliteKm} km`
                : "Renseignez votre profil pour commencer"
            }
            libelleNavigation="Sections de mon espace"
            onglets={[
              { href: "/espace/interimaire", libelle: "Tableau de bord" },
              { href: "/opportunites", libelle: "Opportunités" },
              { href: "/mes-candidatures", libelle: "Mes candidatures" },
              { href: "/mes-missions", libelle: "Mes missions" },
              { href: "/espace/interimaire/certifications", libelle: "Habilitations" },
              { href: "/espace/interimaire/profil", libelle: "Mon profil" },
            ]}
          />
        </div>
      </div>
      <RappelsEspace
        email={session.email}
        role="interimaire"
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
