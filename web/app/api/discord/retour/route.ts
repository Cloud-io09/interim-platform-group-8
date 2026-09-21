import { connexion } from "@interimatch/core/db";
import { configDiscord } from "@interimatch/core";
import { exigerSession } from "@/lib/garde";
import { compteDeLEtat, identiteDepuisCode, ouvrirSalon } from "@/lib/discord";
import { origine } from "@/lib/verification-email";

export const dynamic = "force-dynamic";

/**
 * Retour de Discord : vérifie, crée le salon, et range les identifiants.
 *
 * Trois contrôles avant d'écrire quoi que ce soit, chacun pour une raison distincte.
 *
 * **L'état doit correspondre à une demande en cours.** Sans cela, faire ouvrir à
 * quelqu'un une adresse de retour forgée rattacherait le Discord de l'attaquant au
 * compte de la victime — dont les alertes partiraient alors chez lui.
 *
 * **L'état doit désigner le compte connecté.** Un état valable obtenu autrement ne
 * doit pas agir sur la session en cours.
 *
 * **L'identifiant Discord ne doit pas déjà servir ailleurs.** Deux comptes
 * Intérimatch reliés au même Discord rendraient les notifications indéchiffrables,
 * et permettraient de deviner qu'un second compte existe.
 */
export async function GET(requete: Request) {
  const session = await exigerSession();
  const base = origine(requete);
  const profil =
    session.role === "entreprise" ? "/espace/entreprise/profil/notifications"
      : "/espace/interimaire/profil/notifications";
  const vers = (etat: string) => Response.redirect(`${base}${profil}?discord=${etat}`, 302);

  const parametres = new URL(requete.url).searchParams;
  // La personne a refusé sur l'écran de Discord : ce n'est pas une panne.
  if (parametres.get("error")) return vers("refuse");

  const code = parametres.get("code");
  const compteId = await compteDeLEtat(parametres.get("state"));
  if (!code || compteId === null || compteId !== session.compteId) return vers("etat-invalide");

  const config = configDiscord();
  if (!config) return vers("non-configure");

  const resultat = await identiteDepuisCode(code, base);
  if (!resultat) return vers("echec");

  const sql = connexion();
  try {
    const [pris] = await sql<{ id: number }[]>`
      select id from compte
       where discord_utilisateur_id = ${resultat.identite.id} and id <> ${compteId}`;
    if (pris) return vers("deja-relie");

    // Une liaison refaite ne doit pas laisser l'ancien salon derrière elle : il
    // porterait des messages nominatifs dans un salon que plus rien ne suit.
    const [existant] = await sql<{ discord_salon_id: string | null }[]>`
      select discord_salon_id from compte where id = ${compteId}`;
    if (existant?.discord_salon_id) {
      const { detacher } = await import("@/lib/discord");
      await detacher(sql, compteId);
    }

    const { libelle, prenom } = await nomDuCompte(sql, compteId, session.role);
    const salon = await ouvrirSalon(
      config,
      compteId,
      libelle,
      prenom,
      resultat.identite,
      resultat.jetonAcces
    );
    if (!salon.ok) {
      process.stderr.write(`[discord] salon non créé pour le compte ${compteId} : ${salon.motif}\n`);
      return vers("salon-impossible");
    }

    await sql`
      update compte
         set discord_utilisateur_id = ${resultat.identite.id},
             discord_salon_id = ${salon.salonId},
             discord_relie_le = now()
       where id = ${compteId}`;

    return vers("ok");
  } finally {
    await sql.end();
  }
}

/**
 * Nom à donner au salon, et prénom pour s'adresser à la personne.
 *
 * Le profil peut ne pas être encore rempli : on retombe alors sur un libellé neutre
 * plutôt que d'échouer. Relier son Discord avant de compléter son profil est un
 * ordre parfaitement légitime.
 */
async function nomDuCompte(
  sql: ReturnType<typeof connexion>,
  compteId: number,
  role: string
): Promise<{ libelle: string; prenom: string }> {
  if (role === "entreprise") {
    const [e] = await sql<{ raison_sociale: string }[]>`
      select raison_sociale from entreprise where compte_id = ${compteId}`;
    return { libelle: e?.raison_sociale ?? `compte-${compteId}`, prenom: e?.raison_sociale ?? "à vous" };
  }
  const [i] = await sql<{ prenom: string; nom: string }[]>`
    select prenom, nom from interimaire where compte_id = ${compteId}`;
  return {
    libelle: i ? `${i.prenom} ${i.nom}` : `compte-${compteId}`,
    prenom: i?.prenom ?? "à vous",
  };
}
