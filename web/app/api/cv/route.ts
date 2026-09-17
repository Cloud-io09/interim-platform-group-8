import { connexion } from "@interimatch/core/db";
import { analyserCv, chiffrer, dechiffrerOptionnel } from "@interimatch/core";
import { erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { extraireTexte, FichierRefuse } from "@/lib/extraction-cv";

export const dynamic = "force-dynamic";

/**
 * La reconnaissance de caractères d'un CV scanné prend une à deux secondes, mais le
 * chargement initial du moteur WASM s'y ajoute au premier appel d'une instance. La
 * limite par défaut d'une fonction serverless ne suffit pas : sans cette déclaration,
 * la requête est coupée sans message et l'utilisateur voit une lecture qui n'aboutit
 * jamais.
 */
export const maxDuration = 60;

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

export async function POST(requete: Request) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  let fichier: File | null = null;
  try {
    const formulaire = await requete.formData();
    const champ = formulaire.get("cv");
    fichier = champ instanceof File ? champ : null;
  } catch {
    return erreur("Envoi illisible.", 400);
  }
  if (!fichier) return erreur("Aucun fichier reçu.", 422, [{ champ: "cv", message: "Choisissez un fichier." }]);

  let texte: string;
  try {
    texte = await extraireTexte(fichier);
  } catch (e) {
    if (e instanceof FichierRefuse) {
      return erreur(e.message, 422, [{ champ: "cv", message: e.message }]);
    }
    // Un PDF corrompu ou protégé fait échouer la bibliothèque : on l'explique
    // plutôt que de renvoyer une erreur serveur opaque.
    return erreur("Ce document n'a pas pu être lu. Essayez un autre export.", 422, [
      { champ: "cv", message: "Document illisible." },
    ]);
  }

  const sql = connexion();
  try {
    const { metiers, competences } = await referentiels(sql);
    const analyse = analyserCv(texte, metiers, competences);

    if (analyse.tropCourt) {
      return erreur(
        "Aucun texte exploitable dans ce document. S'il s'agit d'un scan, exportez plutôt un PDF contenant du texte.",
        422,
        [{ champ: "cv", message: "Document sans texte lisible." }]
      );
    }

    const misAJour = await sql`
      update interimaire
      set cv_texte_chiffre = ${chiffrer(texte)},
          cv_nom_fichier = ${fichier.name.slice(0, 160)},
          cv_depose_le = now()
      where compte_id = ${garde.session.compteId}
      returning compte_id`;

    if (misAJour.length === 0) {
      return erreur("Complétez d'abord votre profil.", 409, [
        { champ: "profil", message: "Renseignez votre profil avant de déposer un CV." },
      ]);
    }

    return succes(
      { cv: { nomFichier: fichier.name, longueur: texte.length, texte }, analyse },
      201
    );
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
