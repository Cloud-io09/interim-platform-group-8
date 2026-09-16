import { redirect } from "next/navigation";
import type { RoleCompte, Session } from "@interimatch/core";
import { sessionCourante } from "./session";

/**
 * Garde des pages et routes protégées.
 *
 * Vérification côté serveur à chaque accès, jamais côté client : un contrôle dans le
 * navigateur ne protège rien, il se contourne en désactivant JavaScript.
 *
 * On ne s'appuie pas non plus sur le rôle porté par le cookie seul — la session est
 * relue dans Redis, donc un compte fermé perd l'accès immédiatement.
 */
export async function exigerSession(role?: RoleCompte): Promise<Session> {
  const session = await sessionCourante();
  if (!session) redirect("/connexion");

  if (role && session.role !== role) {
    // On renvoie vers SON espace plutôt qu'une page d'erreur : se tromper de porte
    // n'est pas une faute, et le message « accès refusé » n'aide personne.
    redirect(session.role === "entreprise" ? "/profil/entreprise" : "/profil/interimaire");
  }
  return session;
}

/** Variante pour les routes d'API : rend la session ou une réponse d'erreur. */
export async function sessionOuErreur(
  role?: RoleCompte
): Promise<{ session: Session } | { reponse: Response }> {
  const session = await sessionCourante();
  if (!session) {
    return { reponse: Response.json({ ok: false, message: "Non authentifié." }, { status: 401 }) };
  }
  if (role && session.role !== role) {
    return {
      reponse: Response.json(
        { ok: false, message: "Cette action n'est pas permise pour votre type de compte." },
        { status: 403 }
      ),
    };
  }
  return { session };
}
