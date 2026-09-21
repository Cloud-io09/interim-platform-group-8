import { connexion } from "@interimatch/core/db";
import { cle, configDiscord, redis, sansEchec, supprimerSalon, verifierMotDePasse } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { retirerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Suppression définitive du compte — droit à l'effacement (RGPD, article 17).
 *
 * Le mot de passe est redemandé : un cookie volé ou une session laissée ouverte sur
 * un poste de chantier ne doit pas suffire à effacer un profil et son historique de
 * certifications.
 *
 * Les cascades du schéma emportent profil, certifications, disponibilités,
 * candidatures et missions. Rien n'est conservé : annoncer un droit à l'effacement
 * puis garder des données serait pire que ne rien annoncer.
 *
 * Ce qui vit hors de la base est effacé explicitement, parce qu'aucune cascade ne
 * l'atteint : les traces de matching en cache, et le salon Discord privé — lequel
 * porte des messages nominatifs, habilitations et dates d'échéance comprises.
 */
export async function DELETE(requete: Request) {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ motDePasse?: string }>(requete);
  if (!saisie?.motDePasse) {
    return erreur("Confirmez avec votre mot de passe.", 422, [
      { champ: "motDePasse", message: "Votre mot de passe est nécessaire pour supprimer le compte." },
    ]);
  }

  const sql = connexion();
  try {
    const [compte] = await sql<{ mot_de_passe_hash: string; mot_de_passe_sel: string }[]>`
      select mot_de_passe_hash, mot_de_passe_sel from compte where id = ${garde.session.compteId}`;
    if (!compte) return erreur("Compte introuvable.", 404);

    const valide = await verifierMotDePasse(
      saisie.motDePasse,
      compte.mot_de_passe_hash,
      compte.mot_de_passe_sel
    );
    if (!valide) return erreur("Mot de passe incorrect.", 401);

    const missions = await sql<{ id: number }[]>`
      select id from mission where entreprise_id = ${garde.session.compteId}`;
    const [liaison] = await sql<{ discord_salon_id: string | null }[]>`
      select discord_salon_id from compte where id = ${garde.session.compteId}`;

    await sql`delete from compte where id = ${garde.session.compteId}`;

    // Le salon survivrait à la suppression : Discord ne sait rien de nos cascades.
    // L'échec n'annule pas la suppression — le compte est déjà parti — mais il se
    // lit dans le journal, et le salon reste supprimable à la main.
    await sansEchec(async () => {
      const config = configDiscord();
      if (config && liaison?.discord_salon_id) {
        await supprimerSalon(config, liaison.discord_salon_id);
      }
    }, "suppression du salon Discord");

    // Les traces de matching survivraient à la suppression : elles portent des
    // identifiants de profils. On les efface avec le reste.
    await sansEchec(async () => {
      const cache = redis();
      for (const m of missions) {
        await cache.del(cle.cacheMatching(m.id), cle.traceMatching(m.id));
      }
    }, "purge des traces de matching");

    await retirerSession();
    return succes({ supprime: true });
  } finally {
    await sql.end();
  }
}
