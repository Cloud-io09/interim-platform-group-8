import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { requis } from "./env";

const scrypt = promisify(scryptCallback) as (
  motDePasse: string,
  sel: Buffer,
  longueur: number
) => Promise<Buffer>;

// ---------------------------------------------------------------------------
// Chiffrement des données sensibles au repos
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm";
const LONGUEUR_IV = 12; // 96 bits, recommandé pour GCM

let cleEnCache: Buffer | null = null;

/** Lue paresseusement : en serverless l'environnement n'est pas prêt au moment de l'import. */
function cle(): Buffer {
  if (cleEnCache) return cleEnCache;
  const brute = Buffer.from(
    requis("CLE_CHIFFREMENT", "Générer une clé avec : openssl rand -base64 32"),
    "base64"
  );
  if (brute.length !== 32) {
    throw new Error(
      `CLE_CHIFFREMENT doit faire 32 octets une fois décodée (reçu ${brute.length}). ` +
      `Générer avec : openssl rand -base64 32`
    );
  }
  cleEnCache = brute;
  return brute;
}

/** Réinitialise le cache de clé — utilisé par les tests. */
export function oublierCle(): void {
  cleEnCache = null;
}

/**
 * Chiffre une donnée sensible pour stockage en base (AES-256-GCM).
 *
 * Sortie : `iv.tag.chiffre`, chaque partie en base64url. GCM est authentifié :
 * une valeur modifiée en base fait échouer le déchiffrement au lieu de rendre
 * des octets silencieusement faux.
 *
 * Réservé aux colonnes jamais utilisées en filtre ou en tri — surtout pas les
 * dates d'échéance, qui sont le pivot du moteur de matching.
 */
export function chiffrer(clair: string): string {
  const iv = randomBytes(LONGUEUR_IV);
  const cipher = createCipheriv(ALGO, cle(), iv);
  const chiffre = Buffer.concat([cipher.update(clair, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), chiffre].map((b) => b.toString("base64url")).join(".");
}

export function dechiffrer(charge: string): string {
  const parties = charge.split(".");
  if (parties.length !== 3) {
    throw new Error("Charge chiffrée mal formée (attendu iv.tag.chiffre)");
  }
  const [iv, tag, chiffre] = parties.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv(ALGO, cle(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(chiffre!), decipher.final()]).toString("utf8");
}

/** Chiffre une valeur optionnelle sans se soucier des `null` au point d'appel. */
export function chiffrerOptionnel(clair: string | null | undefined): string | null {
  return clair ? chiffrer(clair) : null;
}

export function dechiffrerOptionnel(charge: string | null | undefined): string | null {
  return charge ? dechiffrer(charge) : null;
}

// ---------------------------------------------------------------------------
// Hachage de mot de passe
// ---------------------------------------------------------------------------

// Paramètres scrypt : N = 2^14 par défaut dans Node, r = 8, p = 1.
const LONGUEUR_SEL = 16;
const LONGUEUR_HASH = 64;

/**
 * Hache un mot de passe avec scrypt.
 *
 * scrypt vient de `node:crypto` — bibliothèque standard, donc aucune ambiguïté sur
 * l'interdiction d'utiliser « une librairie d'authentification clé en main ». Le sel
 * est propre à chaque compte : deux utilisateurs avec le même mot de passe n'ont pas
 * le même hash, et une table arc-en-ciel ne sert à rien.
 */
export async function hacherMotDePasse(
  motDePasse: string
): Promise<{ hash: string; sel: string }> {
  const sel = randomBytes(LONGUEUR_SEL);
  const hash = await scrypt(motDePasse, sel, LONGUEUR_HASH);
  return { hash: hash.toString("base64"), sel: sel.toString("base64") };
}

/**
 * Vérifie un mot de passe en temps constant.
 *
 * `timingSafeEqual` plutôt que `===` : une comparaison qui s'arrête au premier octet
 * différent laisse fuir la longueur du préfixe correct par le temps de réponse.
 */
export async function verifierMotDePasse(
  motDePasse: string,
  hashAttendu: string,
  sel: string
): Promise<boolean> {
  const attendu = Buffer.from(hashAttendu, "base64");
  const calcule = await scrypt(motDePasse, Buffer.from(sel, "base64"), attendu.length);
  return attendu.length === calcule.length && timingSafeEqual(attendu, calcule);
}

/** Jeton de session opaque : 32 octets d'aléa, jamais un JWT (révocation immédiate). */
export function genererJetonSession(): string {
  return randomBytes(32).toString("base64url");
}
