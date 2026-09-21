import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cle, TTL } from "./redis";
import type { MagasinSession } from "./auth";

/**
 * Jetons à usage unique — réinitialisation, vérification et changement d'adresse.
 *
 * Trois propriétés, et chacune répond à une attaque précise.
 *
 * **Indexés par empreinte, jamais par valeur.** Ce qui est stocké est le SHA-256 du
 * jeton, pas le jeton. Un dump de Redis — sauvegarde qui fuite, rôle mal configuré —
 * ne permet donc de réinitialiser aucun mot de passe : l'attaquant tient des
 * empreintes, et il lui faudrait inverser SHA-256 pour obtenir les liens.
 *
 * **À usage unique.** Consommer un jeton le supprime avant d'agir. Un lien renvoyé
 * par erreur, ou relu dans l'historique d'un navigateur partagé, ne sert qu'une fois.
 *
 * **À durée de vie courte.** Une heure pour une réinitialisation : assez pour relever
 * ses courriels, assez peu pour qu'un lien oublié dans une boîte cesse vite de nuire.
 */

export type TypeJeton = "reinitialisation" | "changement_email" | "verification_email";

export interface ContenuJeton {
  type: TypeJeton;
  compteId: number;
  /** Adresse visée, pour un changement d'adresse. Absente sinon. */
  cible?: string;
}

/** Longueur du secret. 32 octets : hors de portée d'une recherche exhaustive. */
const LONGUEUR_JETON = 32;

export function genererJeton(): string {
  return randomBytes(LONGUEUR_JETON).toString("base64url");
}

export function empreinteJeton(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

const DUREES: Record<TypeJeton, number> = {
  reinitialisation: TTL.jetonReinitialisation,
  changement_email: TTL.jetonChangementEmail,
  verification_email: TTL.jetonVerificationEmail,
};

/** Crée un jeton et le range sous son empreinte. Rend le secret, une seule fois. */
export async function emettreJeton(
  magasin: MagasinSession,
  contenu: ContenuJeton
): Promise<{ jeton: string; dureeSecondes: number }> {
  const jeton = genererJeton();
  const dureeSecondes = DUREES[contenu.type];
  await magasin.set(cle.jetonUsageUnique(empreinteJeton(jeton)), JSON.stringify(contenu), {
    ex: dureeSecondes,
  });
  return { jeton, dureeSecondes };
}

/**
 * Consomme un jeton : le lit, le supprime, et rend son contenu.
 *
 * La suppression précède l'usage. Si l'opération échoue ensuite, l'utilisateur devra
 * redemander un lien — c'est le bon sens de l'échec : mieux vaut un lien à redemander
 * qu'un lien rejouable.
 *
 * `typeAttendu` accepte une liste, pour le cas d'un écran qui reçoit un lien sans
 * savoir lequel des deux parcours d'adresse l'a produit. Passer un seul type reste la
 * règle : c'est ce qui empêche un jeton de vérification de servir à réinitialiser un
 * mot de passe.
 */
export async function consommerJeton(
  magasin: MagasinSession,
  jeton: string | undefined,
  typeAttendu: TypeJeton | readonly TypeJeton[]
): Promise<ContenuJeton | null> {
  if (!jeton || jeton.length < LONGUEUR_JETON) return null;

  const clef = cle.jetonUsageUnique(empreinteJeton(jeton));
  const brut = await magasin.get(clef);
  if (brut === null || brut === undefined) return null;
  await magasin.del(clef);

  const contenu = (typeof brut === "string" ? JSON.parse(brut) : brut) as ContenuJeton;
  // Un jeton de changement d'adresse ne doit pas servir à réinitialiser un mot de
  // passe : le type est vérifié, pas supposé.
  const acceptes = Array.isArray(typeAttendu) ? typeAttendu : [typeAttendu as TypeJeton];
  if (!acceptes.includes(contenu?.type) || typeof contenu.compteId !== "number") return null;
  return contenu;
}

/**
 * Comparaison en temps constant de deux jetons.
 *
 * Exportée pour les cas où l'on compare un jeton à une valeur connue : une
 * comparaison naïve fuit la position du premier octet différent, et une boucle de
 * mesures suffit alors à reconstituer le secret octet par octet.
 */
export function jetonsIdentiques(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
