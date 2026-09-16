import { connexion } from "@interimatch/core/db";
import { cle, redis, sansEchec } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";

export const dynamic = "force-dynamic";

const STATUTS = ["brouillon", "publiee", "pourvue", "close"] as const;
type Statut = (typeof STATUTS)[number];

/**
 * Transitions autorisées.
 *
 * Une mission close ne redevient pas un brouillon, et une mission pourvue ne
 * retourne pas à l'état brouillon : l'historique d'une affectation ne se réécrit
 * pas. En revanche, dépublier une mission pourvue vers « publiée » reste possible —
 * une affectation peut tomber.
 */
const TRANSITIONS: Record<Statut, Statut[]> = {
  brouillon: ["publiee", "close"],
  publiee: ["pourvue", "close", "brouillon"],
  pourvue: ["publiee", "close"],
  close: [],
};

export async function PATCH(requete: Request, contexte: { params: Promise<{ id: string }> }) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const missionId = Number((await contexte.params).id);
  if (!Number.isInteger(missionId)) return erreur("Identifiant de mission invalide.", 400);

  const saisie = await corpsJson<{ statut?: string }>(requete);
  const vise = saisie?.statut as Statut | undefined;
  if (!vise || !STATUTS.includes(vise)) {
    return erreur("Statut inconnu.", 422, [
      { champ: "statut", message: "Statuts possibles : brouillon, publiée, pourvue, close." },
    ]);
  }

  const sql = connexion();
  try {
    const [mission] = await sql<{ entreprise_id: number; statut: Statut }[]>`
      select entreprise_id, statut from mission where id = ${missionId}`;
    if (!mission) return erreur("Mission introuvable.", 404);
    if (mission.entreprise_id !== garde.session.compteId) {
      return erreur("Cette mission ne vous appartient pas.", 403);
    }

    if (mission.statut === vise) return succes({ id: missionId, statut: vise });

    if (!TRANSITIONS[mission.statut].includes(vise)) {
      return erreur(`Une mission ${libelle(mission.statut)} ne peut pas passer à « ${libelle(vise)} ».`, 409, [
        { champ: "statut", message: "Cette transition n'est pas permise." },
      ]);
    }

    await sql`
      update mission
      set statut = ${vise},
          publiee_le = ${vise === "publiee" ? sql`coalesce(publiee_le, now())` : sql`publiee_le`}
      where id = ${missionId}`;

    await sansEchec(() => redis().del(cle.cacheMatching(missionId)), "invalidation changement de statut");
    return succes({ id: missionId, statut: vise });
  } finally {
    await sql.end();
  }
}

function libelle(statut: Statut): string {
  return { brouillon: "en brouillon", publiee: "publiée", pourvue: "pourvue", close: "close" }[statut];
}
