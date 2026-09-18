import { connexion } from "@interimatch/core/db";
import {
  cle,
  fermerToutesLesSessions,
  hacherMotDePasse,
  MAX_DEMANDES_REINITIALISATION,
  normaliserEmail,
  redis,
  TTL,
  validerMotDePasse,
} from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { consommerCode, codesRestants } from "@/lib/recuperation";

export const dynamic = "force-dynamic";

/**
 * Récupération d'un accès perdu, par code de récupération.
 *
 * Récupérer un mot de passe, c'est prouver qu'on est soi sans le connaître. La preuve
 * est ici un code remis à l'inscription, que l'utilisateur garde sur lui — ce qui
 * évite d'avoir à exploiter un canal d'envoi, et donc les questions de délivrabilité
 * que le sujet invite à éviter.
 *
 * **L'ordre des opérations compte.** Le code est consommé avant que le mot de passe
 * ne change, et l'échec du reste laisse le code perdu : un code rejouable vaudrait un
 * second mot de passe permanent.
 *
 * **La réponse ne dit pas si le compte existe.** Un compte inconnu et un mauvais code
 * produisent le même refus : sans cela, l'endpoint deviendrait un moyen d'énumérer
 * les comptes inscrits, précisément ce que le message de connexion évite déjà.
 */
export async function POST(requete: Request) {
  const saisie = await corpsJson<{ email?: string; code?: string; nouveau?: string }>(requete);
  if (!saisie?.email || !saisie?.code || !saisie?.nouveau) {
    return erreur("Formulaire incomplet.", 422, [
      { champ: "code", message: "Votre adresse, un code de récupération et un nouveau mot de passe sont nécessaires." },
    ]);
  }

  const probleme = validerMotDePasse(saisie.nouveau);
  if (probleme) return erreur("Le nouveau mot de passe est trop faible.", 422, [probleme]);

  const email = normaliserEmail(saisie.email);
  const cache = redis();

  // Un compteur par compte visé : sans lui, l'endpoint permettrait d'essayer les
  // codes d'un compte au rythme du réseau. La fenêtre ne glisse pas — sinon un
  // attaquant persistant la maintiendrait ouverte indéfiniment.
  const clefTentatives = cle.demandesReinitialisation(email);
  const tentatives = await cache.incr(clefTentatives);
  if (tentatives === 1) await cache.expire(clefTentatives, TTL.demandesReinitialisation);
  if (tentatives > MAX_DEMANDES_REINITIALISATION) {
    return erreur(
      "Trop de tentatives de récupération. Réessayez dans une heure.",
      429,
      [{ champ: "code", message: "Trop de tentatives." }]
    );
  }

  const sql = connexion();
  try {
    const [compte] = await sql<{ id: number }[]>`select id from compte where email = ${email}`;

    // Refus identique dans les deux cas : compte inconnu, ou code invalide.
    const refus = erreur("Adresse ou code de récupération incorrect.", 403, [
      {
        champ: "code",
        message:
          "Vérifiez le code recopié. Chaque code ne sert qu'une fois — si vous les avez tous utilisés, contactez votre agence.",
      },
    ]);
    if (!compte) return refus;
    if (!(await consommerCode(sql, compte.id, saisie.code))) return refus;

    const { hash, sel } = await hacherMotDePasse(saisie.nouveau);
    await sql`
      update compte set mot_de_passe_hash = ${hash}, mot_de_passe_sel = ${sel}
      where id = ${compte.id}`;

    // Toutes les sessions tombent, sans exception : celui qui récupère son compte
    // n'est pas connecté, et quiconque l'était ne doit plus l'être.
    await fermerToutesLesSessions(cache, compte.id);
    await cache.del(clefTentatives);

    return succes({ change: true, codesRestants: await codesRestants(sql, compte.id) });
  } finally {
    await sql.end();
  }
}
