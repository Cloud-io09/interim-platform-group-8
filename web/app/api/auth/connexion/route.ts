import { connexion } from "@interimatch/core/db";
import {
  compterTentative,
  MAX_TENTATIVES_EMAIL,
  MAX_TENTATIVES_IP,
  normaliserEmail,
  oublierTentatives,
  redis,
  verifierMotDePasse,
  cle,
  type RoleCompte,
} from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { adresseAppelante, poserCookieSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Hash factice utilisé quand aucun compte ne correspond.
 *
 * Sans lui, une adresse inconnue répondrait sans passer par scrypt, donc bien plus
 * vite qu'une adresse connue avec un mauvais mot de passe : le temps de réponse
 * suffirait à énumérer les comptes existants. On paie donc le même coût de calcul
 * dans les deux cas.
 */
const HASH_FACTICE = Buffer.alloc(64).toString("base64");
const SEL_FACTICE = Buffer.alloc(16).toString("base64");

interface Saisie {
  email?: string;
  motDePasse?: string;
}

export async function POST(requete: Request) {
  const saisie = await corpsJson<Saisie>(requete);
  if (!saisie?.email || !saisie.motDePasse) {
    return erreur("Adresse e-mail et mot de passe sont obligatoires.", 400);
  }

  const email = normaliserEmail(saisie.email);
  const ip = await adresseAppelante();
  const cache = redis();
  const cleIp = cle.tentativesIp(ip);
  const cleEmail = cle.tentativesEmail(email);

  // Compteur par IP *et* par email : l'un freine un attaquant unique qui balaie
  // beaucoup de comptes, l'autre protège un compte visé depuis plusieurs adresses.
  const [parIp, parEmail] = await Promise.all([
    compterTentative(cleIp, MAX_TENTATIVES_IP, cache),
    compterTentative(cleEmail, MAX_TENTATIVES_EMAIL, cache),
  ]);
  if (parIp.bloque || parEmail.bloque) {
    const reste = Math.max(parIp.resteSecondes, parEmail.resteSecondes);
    return Response.json(
      {
        ok: false,
        message: `Trop de tentatives. Réessayez dans ${Math.ceil(reste / 60)} minutes.`,
        problemes: [],
      },
      { status: 429, headers: { "Retry-After": String(reste) } }
    );
  }

  const sql = connexion();
  try {
    const [compte] = await sql<
      { id: number; role: RoleCompte; mot_de_passe_hash: string; mot_de_passe_sel: string }[]
    >`select id, role, mot_de_passe_hash, mot_de_passe_sel from compte where email = ${email}`;

    const valide = compte
      ? await verifierMotDePasse(saisie.motDePasse, compte.mot_de_passe_hash, compte.mot_de_passe_sel)
      : await verifierMotDePasse(saisie.motDePasse, HASH_FACTICE, SEL_FACTICE);

    // Message volontairement identique dans les deux cas : distinguer « compte
    // inconnu » de « mot de passe faux » permettrait d'énumérer les comptes — on
    // soumet une liste d'adresses et on apprend lesquelles sont inscrites. Le
    // cahier des charges impose une protection contre les attaques basiques, et
    // c'en est une.
    //
    // Le message reste utile sans être bavard : il dit quoi faire ensuite, dans les
    // deux cas, plutôt que de laisser l'utilisateur deviner lequel s'applique.
    if (!compte || !valide) {
      return erreur(
        "Adresse e-mail ou mot de passe incorrect.",
        401,
        [
          {
            champ: "email",
            message:
              "Vérifiez votre saisie. Si vous n'avez pas encore de compte, créez-en un depuis le lien sous le formulaire.",
          },
        ]
      );
    }

    await oublierTentatives([cleIp, cleEmail], cache);
    await poserCookieSession({ id: compte.id, role: compte.role, email });
    return succes({ compte: { id: compte.id, email, role: compte.role } });
  } finally {
    await sql.end();
  }
}
