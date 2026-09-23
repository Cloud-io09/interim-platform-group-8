import { connexion } from "@interimatch/core/db";
import { packParCode, planParCode } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { lireDroits } from "@/lib/deblocage";

export const dynamic = "force-dynamic";

/**
 * Changement de palier, et achat de crédits.
 *
 * **Le paiement est simulé.** Aucune carte n'est demandée, aucun prestataire n'est
 * appelé, et l'interface l'annonce sans détour. Ce qui est réel : les paliers, les
 * quotas, le registre des déblocages et leur imputation — c'est là que vivent les
 * décisions, pas dans l'aller-retour vers une banque.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ planCode?: string; packCode?: string }>(requete);
  const sql = connexion();
  try {
    if (saisie?.planCode) {
      const plan = planParCode(saisie.planCode);
      if (!plan) return erreur("Palier inconnu.", 422);

      await sql`
        update compte set plan_code = ${plan.code}, plan_depuis = now()
         where id = ${garde.session.compteId}`;

      const droits = await lireDroits(sql, garde.session.compteId);
      return succes({
        plan: plan.code,
        message: `Vous êtes au palier ${plan.libelle}.`,
        quotaRestant: droits.illimite ? null : droits.quotaRestant,
        credits: droits.credits,
      });
    }

    if (saisie?.packCode) {
      const pack = packParCode(saisie.packCode);
      if (!pack) return erreur("Pack inconnu.", 422);

      // Incrément et non affectation : deux achats simultanés doivent s'ajouter.
      const [compte] = await sql<{ credits: number }[]>`
        update compte set credits = credits + ${pack.credits}
         where id = ${garde.session.compteId}
        returning credits`;

      return succes({
        credits: compte?.credits ?? 0,
        message: `${pack.credits} déblocage${pack.credits > 1 ? "s" : ""} ajouté${pack.credits > 1 ? "s" : ""}. Ils n'expirent pas.`,
      });
    }

    return erreur("Indiquez un palier ou un pack.", 422);
  } finally {
    await sql.end();
  }
}
