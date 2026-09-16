import { genererJetonSession } from "./chiffrement";
import { cle, TTL } from "./redis";
import type { RoleCompte } from "./types";

/**
 * Sessions côté serveur, stockées dans Redis.
 *
 * Jeton opaque plutôt que JWT : la révocation est immédiate (une clé supprimée est
 * une session morte), alors qu'un JWT reste valide jusqu'à son expiration quoi qu'on
 * fasse. C'est aussi ce qui matérialise l'usage de la base non relationnelle demandé
 * par le sujet, au lieu d'un simple cache décoratif.
 */

export interface Session {
  compteId: number;
  role: RoleCompte;
  email: string;
  creeeLe: string;
}

/** Sous-ensemble de Redis utilisé ici — injectable pour tester sans réseau. */
export interface MagasinSession {
  set(cle: string, valeur: string, options: { ex: number }): Promise<unknown>;
  get(cle: string): Promise<unknown>;
  expire(cle: string, secondes: number): Promise<unknown>;
  del(...cles: string[]): Promise<unknown>;
}

export interface SessionOuverte {
  jeton: string;
  session: Session;
  /** Durée de vie du cookie, en secondes. */
  dureeSecondes: number;
}

export async function ouvrirSession(
  magasin: MagasinSession,
  compte: { id: number; role: RoleCompte; email: string }
): Promise<SessionOuverte> {
  const jeton = genererJetonSession();
  const session: Session = {
    compteId: compte.id,
    role: compte.role,
    email: compte.email,
    creeeLe: new Date().toISOString(),
  };
  await magasin.set(cle.session(jeton), JSON.stringify(session), { ex: TTL.session });
  return { jeton, session, dureeSecondes: TTL.session };
}

/**
 * Lit une session et prolonge sa durée de vie.
 *
 * Le glissement est voulu ici, contrairement au compteur de tentatives : un
 * utilisateur actif ne doit pas être déconnecté au milieu de sa saisie, et la
 * session s'éteint sur l'inactivité, pas sur l'ancienneté.
 */
export async function lireSession(
  magasin: MagasinSession,
  jeton: string | undefined
): Promise<Session | null> {
  if (!jeton) return null;

  const brut = await magasin.get(cle.session(jeton));
  if (brut === null || brut === undefined) return null;

  // Upstash désérialise le JSON tout seul ; un client Redis classique rend une chaîne.
  const session = typeof brut === "string" ? (JSON.parse(brut) as Session) : (brut as Session);
  if (typeof session?.compteId !== "number" || !session.role) return null;

  await magasin.expire(cle.session(jeton), TTL.session);
  return session;
}

export async function fermerSession(
  magasin: MagasinSession,
  jeton: string | undefined
): Promise<void> {
  if (jeton) await magasin.del(cle.session(jeton));
}

// ---------------------------------------------------------------------------
// Validation des saisies d'inscription
// ---------------------------------------------------------------------------

export interface Probleme {
  champ: string;
  message: string;
}

/** Longueur minimale du mot de passe. Volontairement exprimée en constante nommée. */
export const LONGUEUR_MIN_MOT_DE_PASSE = 12;

/**
 * Validation d'email volontairement permissive : elle écarte les saisies
 * manifestement fausses sans prétendre décider de la validité d'une adresse, ce
 * qu'aucune expression régulière ne fait correctement. La vraie vérification,
 * ce serait un envoi — hors périmètre du POC.
 */
const MOTIF_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function validerEmail(email: string): Probleme | null {
  const valeur = email.trim();
  if (valeur.length === 0) return { champ: "email", message: "L'adresse e-mail est obligatoire." };
  if (valeur.length > 254) return { champ: "email", message: "L'adresse e-mail est trop longue." };
  if (!MOTIF_EMAIL.test(valeur)) {
    return { champ: "email", message: "Cette adresse e-mail n'est pas valide." };
  }
  return null;
}

/**
 * Politique de mot de passe : longueur d'abord.
 *
 * 12 caractères sans règle de composition plutôt que 8 avec majuscule, chiffre et
 * caractère spécial : les règles de composition produisent des mots de passe courts
 * et prévisibles (« Chantier1! »), là où la longueur est le seul facteur qui fait
 * réellement croître le coût d'une attaque. C'est aussi la recommandation de l'ANSSI
 * pour un facteur unique. Le public visé travaille souvent avec des gants sur un
 * téléphone : une règle de composition y coûte cher pour un gain négatif.
 */
export function validerMotDePasse(motDePasse: string): Probleme | null {
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return {
      champ: "motDePasse",
      message: `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
    };
  }
  if (motDePasse.length > 200) {
    return { champ: "motDePasse", message: "Le mot de passe est trop long." };
  }
  return null;
}

export function validerRole(role: unknown): Probleme | null {
  if (role !== "entreprise" && role !== "interimaire") {
    return { champ: "role", message: "Choisissez entreprise ou intérimaire." };
  }
  return null;
}

export interface SaisieInscription {
  email: string;
  motDePasse: string;
  role: unknown;
}

/** Rend tous les problèmes d'un coup : un formulaire qui les signale un par un est pénible. */
export function validerInscription(saisie: SaisieInscription): Probleme[] {
  return [
    validerEmail(saisie.email),
    validerMotDePasse(saisie.motDePasse),
    validerRole(saisie.role),
  ].filter((p): p is Probleme => p !== null);
}

/** Normalise l'email avant stockage et comparaison — la colonne est en citext. */
export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}
