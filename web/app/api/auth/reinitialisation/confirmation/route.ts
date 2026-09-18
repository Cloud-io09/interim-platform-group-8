import { connexion } from "@interimatch/core/db";
import {
  cle,
  consommerJeton,
  fermerToutesLesSessions,
  hacherMotDePasse,
  redis,
  validerMotDePasse,
} from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";

export const dynamic = "force-dynamic";

/**
 * Consommation d'un lien de réinitialisation.
 *
 * Le jeton est consommé avant que le mot de passe ne change : un lien rejouable,
 * relu dans l'historique d'un navigateur partagé ou renvoyé par erreur, redeviendrait
 * une clé permanente.
 *
 * Toutes les sessions tombent ensuite, sans exception. Celui qui réinitialise n'est
 * pas connecté ; quiconque l'était ne doit plus l'être.
 */
export async function POST(requete: Request) {
  const saisie = await corpsJson<{ jeton?: string; nouveau?: string }>(requete);
  if (!saisie?.jeton || !saisie?.nouveau) {
    return erreur("Formulaire incomplet.", 422, [
      { champ: "nouveau", message: "Un lien valable et un nouveau mot de passe sont nécessaires." },
    ]);
  }

  const probleme = validerMotDePasse(saisie.nouveau);
  if (probleme) return erreur("Le nouveau mot de passe est trop faible.", 422, [probleme]);

  const cache = redis();
  const contenu = await consommerJeton(cache, saisie.jeton, "reinitialisation");
  if (!contenu) {
    return erreur("Ce lien n'est plus valable.", 403, [
      {
        champ: "jeton",
        message:
          "Il a peut-être expiré, ou déjà servi. Demandez-en un nouveau depuis la page « mot de passe oublié ».",
      },
    ]);
  }

  const sql = connexion();
  try {
    const { hash, sel } = await hacherMotDePasse(saisie.nouveau);
    const misAJour = await sql<{ email: string }[]>`
      update compte set mot_de_passe_hash = ${hash}, mot_de_passe_sel = ${sel}
      where id = ${contenu.compteId}
      returning email`;

    // Le compte a pu être supprimé entre l'émission du lien et son usage.
    if (misAJour.length === 0) return erreur("Ce compte n'existe plus.", 404);

    await fermerToutesLesSessions(cache, contenu.compteId);
    await cache.del(cle.demandesReinitialisation(misAJour[0]!.email));

    return succes({ change: true });
  } finally {
    await sql.end();
  }
}
