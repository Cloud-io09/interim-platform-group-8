import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Codes de récupération.
 *
 * Récupérer un mot de passe, c'est prouver qu'on est soi sans connaître le mot de
 * passe. Il faut donc une preuve que l'utilisateur possède déjà et qu'un attaquant
 * n'a pas. L'usage veut qu'on l'envoie par courriel ; encore faut-il une adresse
 * vérifiée, un domaine et un prestataire d'envoi.
 *
 * Les codes de récupération fournissent la même preuve **sans aucun canal** : ils
 * sont remis à l'inscription, l'utilisateur en garde un sur lui, et il le présente le
 * jour où il oublie son mot de passe. C'est le mécanisme de GitHub et de Google.
 *
 * Trois règles, et elles ne sont pas décoratives.
 *
 * **Ils ne sont montrés qu'une fois.** Seules les empreintes sont conservées : la
 * base ne permet donc pas de reconstituer les codes, pas plus qu'elle ne permet de
 * reconstituer un mot de passe.
 *
 * **Chacun ne sert qu'une fois.** Un code présenté est consommé, même si la suite
 * échoue — un code rejouable vaudrait un second mot de passe permanent.
 *
 * **Ils sont lisibles à voix haute.** Le public vise des ouvriers du bâtiment qui
 * recopieront un code depuis un bout de papier, parfois avec des gants : l'alphabet
 * exclut ce qui se confond — O et 0, I, l et 1.
 */

/** Alphabet sans caractères ambigus : ni O/0, ni I/l/1. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Quatre groupes de quatre : assez long pour résister, assez court pour se recopier. */
const GROUPES = 4;
const PAR_GROUPE = 4;

/** Nombre de codes remis. Assez pour ne pas être à court, assez peu pour être gardés. */
export const NOMBRE_CODES = 8;

function tirer(longueur: number): string {
  // `randomBytes` plutôt que `Math.random` : un code de récupération est un secret,
  // et un générateur prédictible en ferait une formalité à deviner.
  const octets = randomBytes(longueur);
  let sortie = "";
  for (let i = 0; i < longueur; i++) {
    sortie += ALPHABET[octets[i]! % ALPHABET.length];
  }
  return sortie;
}

export function genererCode(): string {
  return Array.from({ length: GROUPES }, () => tirer(PAR_GROUPE)).join("-");
}

export function genererCodes(combien = NOMBRE_CODES): string[] {
  return Array.from({ length: combien }, genererCode);
}

/**
 * Forme canonique d'un code saisi.
 *
 * Quelqu'un qui recopie un code met des espaces, oublie les tirets, ou tape en
 * minuscules. Refuser ces saisies-là serait refuser le geste qu'on lui demande.
 */
export function normaliserCode(saisi: string): string {
  return saisi.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Empreinte d'un code.
 *
 * SHA-256 sans sel, contrairement au mot de passe : un code est 16 caractères d'aléa
 * uniforme tirés d'un alphabet de 31 — soit plus de 79 bits d'entropie. Une recherche
 * exhaustive est hors de portée, et le salage n'apporterait rien qu'un coût de
 * recherche : on doit pouvoir retrouver un code parmi huit en une requête.
 */
export function empreinteCode(code: string): string {
  return createHash("sha256").update(normaliserCode(code)).digest("hex");
}

/** Comparaison en temps constant de deux empreintes. */
export function empreintesIdentiques(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Trouve l'empreinte correspondant à un code saisi, parmi celles d'un compte.
 *
 * Toutes les empreintes sont parcourues même après une correspondance : s'arrêter au
 * premier succès ferait varier le temps de réponse selon la position du code dans la
 * liste, ce qui n'apprend pas grand-chose mais ne coûte rien à éviter.
 */
export function trouverEmpreinte(codeSaisi: string, empreintes: readonly string[]): string | null {
  if (normaliserCode(codeSaisi).length !== GROUPES * PAR_GROUPE) return null;
  const cible = empreinteCode(codeSaisi);

  let trouvee: string | null = null;
  for (const e of empreintes) {
    if (empreintesIdentiques(e, cible)) trouvee = e;
  }
  return trouvee;
}
