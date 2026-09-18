import { connexion } from "@interimatch/core/db";
import {
  hacherMotDePasse,
  normaliserEmail,
  validerInscription,
  type RoleCompte,
} from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { remettreCodes } from "@/lib/recuperation";
import { poserCookieSession } from "@/lib/session";

export const dynamic = "force-dynamic";

interface Saisie {
  email?: string;
  motDePasse?: string;
  role?: string;
}

/**
 * Création de compte.
 *
 * Deux types de comptes aux parcours distincts : ce premier temps ne crée que les
 * identifiants et le rôle. Le profil — entreprise ou intérimaire — est renseigné
 * ensuite, par un formulaire guidé propre à chaque rôle, parce que les deux n'ont
 * ni les mêmes champs obligatoires ni les mêmes permissions.
 */
export async function POST(requete: Request) {
  const saisie = await corpsJson<Saisie>(requete);
  if (!saisie) return erreur("Requête illisible.", 400);

  const problemes = validerInscription({
    email: saisie.email ?? "",
    motDePasse: saisie.motDePasse ?? "",
    role: saisie.role,
  });
  if (problemes.length > 0) return erreur("Saisie incomplète.", 422, problemes);

  const email = normaliserEmail(saisie.email!);
  const role = saisie.role as RoleCompte;
  const { hash, sel } = await hacherMotDePasse(saisie.motDePasse!);

  const sql = connexion();
  try {
    const cree = await sql<{ id: number }[]>`
      insert into compte (email, mot_de_passe_hash, mot_de_passe_sel, role)
      values (${email}, ${hash}, ${sel}, ${role})
      on conflict (email) do nothing
      returning id`;

    // `do nothing` plutôt qu'un select préalable : sans ça, deux inscriptions
    // simultanées avec le même email passeraient toutes deux le contrôle avant
    // que l'une n'insère.
    const compte = cree[0];
    if (!compte) {
      return erreur("Un compte existe déjà avec cette adresse e-mail.", 409, [
        { champ: "email", message: "Cette adresse est déjà utilisée." },
      ]);
    }

    // Codes de récupération remis à l'inscription, et rendus une seule fois : sans
    // eux, oublier son mot de passe reviendrait à perdre ses habilitations, ses
    // disponibilités et ses candidatures. La base n'en garde que les empreintes.
    const codes = await remettreCodes(sql, compte.id);

    await poserCookieSession({ id: compte.id, role, email });
    return succes(
      {
        compte: { id: compte.id, email, role },
        codesRecuperation: codes,
        etapeSuivante:
          role === "entreprise"
            ? "/espace/entreprise/profil?suite=premiere-mission"
            : "/espace/interimaire/profil?suite=certifications",
      },
      201
    );
  } finally {
    await sql.end();
  }
}
