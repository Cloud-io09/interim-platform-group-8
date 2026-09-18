import { connexion } from "@interimatch/core/db";
import { verifierMotDePasse } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { codesRestants, remettreCodes } from "@/lib/recuperation";

export const dynamic = "force-dynamic";

/** Combien de codes restent utilisables. Les codes eux-mêmes ne se relisent jamais. */
export async function GET() {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    return succes({ restants: await codesRestants(sql, garde.session.compteId) });
  } finally {
    await sql.end();
  }
}

/**
 * Régénère les codes et les rend **une seule fois**.
 *
 * Le mot de passe est exigé, comme pour toute opération qui change la façon dont on
 * peut reprendre la main sur un compte : quelqu'un qui aurait volé un cookie pourrait
 * sinon se fabriquer un accès permanent, survivant au changement de mot de passe.
 *
 * La régénération **remplace** : les codes précédents cessent d'être valables. Un code
 * recopié il y a six mois ne doit pas rester une clé.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ motDePasse?: string }>(requete);
  if (!saisie?.motDePasse) {
    return erreur("Mot de passe nécessaire.", 422, [
      { champ: "motDePasse", message: "Confirmez votre mot de passe pour régénérer vos codes." },
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
    if (!valide) {
      return erreur("Mot de passe incorrect.", 403, [
        { champ: "motDePasse", message: "Ce n'est pas votre mot de passe." },
      ]);
    }

    // Rendus en clair ici, et nulle part ailleurs : la base n'en garde que les
    // empreintes, et aucune route ne permet de les relire.
    return succes({ codes: await remettreCodes(sql, garde.session.compteId) });
  } finally {
    await sql.end();
  }
}
