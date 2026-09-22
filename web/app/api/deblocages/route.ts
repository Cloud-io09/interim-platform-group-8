import { connexion } from "@interimatch/core/db";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { debloquer, lireDroits } from "@/lib/deblocage";

export const dynamic = "force-dynamic";

/** Droits restants de l'entreprise connectée. */
export async function GET() {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    const d = await lireDroits(sql, garde.session.compteId);
    return succes({
      plan: { code: d.plan.code, libelle: d.plan.libelle },
      quotaRestant: d.illimite ? null : d.quotaRestant,
      credits: d.credits,
      illimite: d.illimite,
      peutDebloquer: d.peutDebloquer,
    });
  } finally {
    await sql.end();
  }
}

/**
 * Débloque les coordonnées d'un profil pour une mission.
 *
 * **Le paiement est simulé, et l'écran le dit.** Ce qui est construit pour de vrai est
 * la couche qui compte : quotas, imputation, idempotence, transaction. Brancher un
 * prestataire n'y ajouterait qu'un aller-retour réseau, sur la partie la moins
 * intéressante à défendre — et le sujet ne demande aucun paiement.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ interimaireId?: number; missionId?: number }>(requete);
  if (!Number.isInteger(saisie?.interimaireId) || !Number.isInteger(saisie?.missionId)) {
    return erreur("Profil et mission sont nécessaires.", 422);
  }

  const sql = connexion();
  try {
    const r = await debloquer(sql, garde.session.compteId, saisie!.interimaireId!, saisie!.missionId!);
    if (!r.ok) {
      if (r.motif === "droits_epuises") {
        return erreur(
          "Vous n'avez plus de déblocage disponible. Choisissez un palier ou achetez des crédits.",
          402
        );
      }
      return erreur("Cette mission ou ce profil ne vous est pas accessible.", 404);
    }

    const droits = await lireDroits(sql, garde.session.compteId);
    return succes({
      debloque: true,
      deja: r.deja,
      source: r.source,
      quotaRestant: droits.illimite ? null : droits.quotaRestant,
      credits: droits.credits,
      message: r.deja
        ? "Ce profil était déjà débloqué pour cette mission."
        : "Coordonnées débloquées. Ce déblocage vaut pour cette mission.",
    });
  } finally {
    await sql.end();
  }
}
