import type { Sql, TransactionSql } from "postgres";
import { peutPublier, planParCode, PLANS } from "@interimatch/core";
import { erreur } from "@/lib/reponses";

/**
 * Limite de fiches publiées simultanément, selon le palier.
 *
 * **À appeler dans la transaction qui publie.** Le `for update` sur le compte
 * sérialise les publications d'une même entreprise : sans lui, deux onglets qui
 * publient en même temps liraient le même compte et dépasseraient la limite ensemble.
 *
 * Rend une réponse d'erreur prête à renvoyer, ou `null` si la publication est permise.
 */
export async function refusSiLimiteAtteinte(
  tx: Sql | TransactionSql,
  entrepriseId: number
): Promise<Response | null> {
  const [compte] = await tx<{ plan_code: string }[]>`
    select plan_code from compte where id = ${entrepriseId} for update`;
  const [compteur] = await tx<{ n: number }[]>`
    select count(*)::int as n from mission
     where entreprise_id = ${entrepriseId} and statut = 'publiee'`;

  const planCode = compte?.plan_code ?? "decouverte";
  if (peutPublier(planCode, compteur?.n ?? 0)) return null;

  const plan = planParCode(planCode) ?? PLANS[0]!;
  const max = plan.missionsActivesMax!;
  // 402, comme un contact refusé faute de crédit : c'est le palier qui bloque, pas la saisie.
  return erreur(
    `Le palier ${plan.libelle} permet ${max} fiche${max > 1 ? "s" : ""} en ligne à la fois.`,
    402,
    [{ champ: "palier", message: "Passez à un palier supérieur, ou clôturez une fiche attribuée." }]
  );
}
