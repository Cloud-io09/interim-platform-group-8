import { connexion } from "@interimatch/core/db";
import { analyserCv, chiffrer, dechiffrerOptionnel } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * La route ne fait plus que valider et enregistrer du texte : elle n'a plus besoin
 * d'un budget de temps particulier. La lecture — et la reconnaissance de caractères —
 * se fait dans le navigateur.
 */

/** Référentiels nécessaires à l'analyse, lus une fois par requête. */
async function referentiels(sql: ReturnType<typeof connexion>) {
  const [metiers, competences] = await Promise.all([
    sql<{ code: string; libelle: string }[]>`select code, libelle from metier where actif`,
    sql<{ code: string; libelle: string }[]>`select code, libelle from competence`,
  ]);
  return { metiers, competences };
}

/** État du CV déposé et suggestions qu'on en tire. */
export async function GET() {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    const [ligne] = await sql<
      { cv_texte_chiffre: string | null; cv_nom_fichier: string | null; cv_depose_le: string | null }[]
    >`
      select cv_texte_chiffre, cv_nom_fichier, cv_depose_le::text
      from interimaire where compte_id = ${garde.session.compteId}`;

    const texte = dechiffrerOptionnel(ligne?.cv_texte_chiffre);
    if (!texte) return succes({ cv: null, analyse: null });

    const { metiers, competences } = await referentiels(sql);
    return succes({
      cv: {
        nomFichier: ligne!.cv_nom_fichier,
        deposeLe: ligne!.cv_depose_le,
        longueur: texte.length,
        // Le texte lu est rendu pour que l'utilisateur vérifie lui-même ce qui a été
        // compris de son document — surtout après une reconnaissance de caractères,
        // qui se trompe parfois sans le signaler.
        texte,
      },
      analyse: analyserCv(texte, metiers, competences),
    });
  } finally {
    await sql.end();
  }
}

/** Un CV dépassant cette longueur n'est plus un CV : on refuse plutôt que de stocker. */
const LONGUEUR_MAX_TEXTE = 200_000;

interface Saisie {
  nomFichier?: string;
  texte?: string;
}

/**
 * Enregistre le texte lu **par le navigateur**.
 *
 * Le fichier n'est jamais transmis : la lecture, y compris la reconnaissance de
 * caractères, se fait sur le poste de l'utilisateur. Le serveur ne reçoit que du
 * texte, qu'il traite comme toute saisie utilisateur — borné, chiffré, et jamais
 * interprété autrement que par rapprochement lexical.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<Saisie>(requete);
  const texte = typeof saisie?.texte === "string" ? saisie.texte.trim() : "";
  const nomFichier = typeof saisie?.nomFichier === "string" ? saisie.nomFichier.slice(0, 160) : "document";

  if (texte.length === 0) {
    return erreur("Aucun texte reçu.", 422, [{ champ: "cv", message: "Le document n'a produit aucun texte." }]);
  }
  if (texte.length > LONGUEUR_MAX_TEXTE) {
    return erreur("Document trop volumineux.", 422, [
      { champ: "cv", message: "Ce document contient bien plus de texte qu'un CV." },
    ]);
  }

  const sql = connexion();
  try {
    const { metiers, competences } = await referentiels(sql);
    const analyse = analyserCv(texte, metiers, competences);

    if (analyse.tropCourt) {
      return erreur(
        "Trop peu de texte exploitable dans ce document. S'il s'agit d'un scan de mauvaise qualité, un export depuis un traitement de texte donnera un bien meilleur résultat.",
        422,
        [{ champ: "cv", message: "Texte insuffisant." }]
      );
    }

    const misAJour = await sql`
      update interimaire
      set cv_texte_chiffre = ${chiffrer(texte)},
          cv_nom_fichier = ${nomFichier},
          cv_depose_le = now()
      where compte_id = ${garde.session.compteId}
      returning compte_id`;

    if (misAJour.length === 0) {
      return erreur("Complétez d'abord votre profil.", 409, [
        { champ: "profil", message: "Renseignez votre profil avant de déposer un CV." },
      ]);
    }

    return succes({ cv: { nomFichier, longueur: texte.length, texte }, analyse }, 201);
  } finally {
    await sql.end();
  }
}

/** Retrait du CV — le texte est une donnée personnelle, il doit pouvoir disparaître. */
export async function DELETE() {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    await sql`
      update interimaire
      set cv_texte_chiffre = null, cv_nom_fichier = null, cv_depose_le = null
      where compte_id = ${garde.session.compteId}`;
    return succes({ supprime: true });
  } finally {
    await sql.end();
  }
}
