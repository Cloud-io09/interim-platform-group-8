import { cookies, headers } from "next/headers";
import { fermerSession, lireSession, ouvrirSession, type Session } from "@interimatch/core";
import { redis } from "@interimatch/core";
import type { RoleCompte } from "@interimatch/core";

export const NOM_COOKIE = "interimatch_session";

/**
 * Cookie de session.
 *
 * `httpOnly` : inaccessible au JavaScript de la page, donc inexploitable par une
 * injection de script. `sameSite: lax` : le cookie n'accompagne pas les requêtes
 * inter-sites autres qu'une navigation de premier niveau, ce qui couvre le CSRF sur
 * les envois de formulaire. `secure` en production uniquement, sinon le
 * développement en HTTP local ne recevrait jamais le cookie.
 */
function optionsCookie(dureeSecondes: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: dureeSecondes,
  };
}

export async function poserCookieSession(compte: {
  id: number;
  role: RoleCompte;
  email: string;
}): Promise<void> {
  const { jeton, dureeSecondes } = await ouvrirSession(redis(), compte);
  (await cookies()).set(NOM_COOKIE, jeton, optionsCookie(dureeSecondes));
}

export async function sessionCourante(): Promise<Session | null> {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  return lireSession(redis(), jeton);
}

export async function retirerSession(): Promise<void> {
  const magasin = await cookies();
  const jeton = magasin.get(NOM_COOKIE)?.value;
  await fermerSession(redis(), jeton);
  magasin.delete(NOM_COOKIE);
}

/**
 * Adresse de l'appelant, pour la limitation de tentatives.
 * Derrière Vercel, l'adresse réelle est en tête du `x-forwarded-for`.
 */
export async function adresseAppelante(): Promise<string> {
  const entetes = await headers();
  const transmis = entetes.get("x-forwarded-for");
  return transmis?.split(",")[0]?.trim() || entetes.get("x-real-ip") || "inconnue";
}
