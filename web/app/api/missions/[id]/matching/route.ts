import { connexion } from "@interimatch/core/db";
import {
  cle,
  matcher,
  PONDERATIONS,
  redis,
  TTL,
  sansEchec,
  typeCertification,
  type ResultatMatching,
} from "@interimatch/core";
import { erreur } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { chargerMission, chargerProfils, type ProfilAvecIdentite } from "@/lib/depot";
import { deblocagesDeLaMission, lireDroits } from "@/lib/deblocage";

export const dynamic = "force-dynamic";

/** Résultat enrichi des identités, pour l'affichage. */
interface ReponseMatching {
  mission: { id: number; titre: string; dateDebut: string; dateFin: string; ville: string };
  ponderations: typeof PONDERATIONS;
  calculeLe: string;
  depuisCache: boolean;
  evalues: number;
  retenus: unknown[];
  ecartes: unknown[];
}

function habiller(resultat: ResultatMatching, profils: ProfilAvecIdentite[]) {
  const identite = new Map(profils.map((p) => [p.interimaireId, p]));
  const nom = (id: number) => {
    const p = identite.get(id);
    return p ? { prenom: p.prenom, nom: p.nom, ville: p.ville } : null;
  };

  return {
    retenus: resultat.retenus.map((s) => ({ ...s, ...nom(s.interimaireId) })),
    ecartes: resultat.ecartes.map((e) => ({
      ...e,
      ...nom(e.interimaireId),
      typeLibelle: typeCertification(e.typeCode)?.libelle ?? e.typeCode,
      // Le motif est rendu en clair : la question à laquelle cet écran répond est
      // « pourquoi ce profil n'apparaît-il pas ? », pas « combien en reste-t-il ? ».
      explication:
        e.motif === "certification_absente"
          ? `Ne détient pas ${typeCertification(e.typeCode)?.libelle ?? e.typeCode}${e.categorieCode ? ` catégorie ${e.categorieCode}` : ""}.`
          : `Sa certification expire le ${e.dateEcheance}, avant la fin de la mission.`,
    })),
  };
}

/**
 * Applique la barrière de déblocage à un résultat, calculé ou lu en cache.
 *
 * **Le nom complet fuitait ici.** Il était masqué sur la fiche profil et dans la liste
 * des candidatures, mais rendu en clair par cette route : l'entreprise lisait
 * « Claudio ALVADIA » dès la publication, sans rien débloquer. La barrière ne tenait
 * qu'aux écrans où on avait pensé à la poser.
 *
 * Elle s'applique **après** le cache, à chaque requête : le cache garde le calcul, qui
 * ne dépend pas de qui regarde, et le déblocage change indépendamment de lui.
 */
function presenter(
  corps: ReponseMatching,
  debloques: Set<number>,
  droits: Awaited<ReturnType<typeof lireDroits>>
) {
  const masquer = <T extends { interimaireId: number; nom?: string }>(p: T) => {
    const debloque = debloques.has(p.interimaireId);
    return { ...p, debloque, nom: debloque ? p.nom : p.nom ? `${p.nom.charAt(0)}.` : p.nom };
  };
  return {
    ...corps,
    retenus: (corps.retenus as { interimaireId: number; nom?: string }[]).map(masquer),
    ecartes: (corps.ecartes as { interimaireId: number; nom?: string }[]).map(masquer),
    // Ce qu'il faut pour dire, avant le clic, ce qu'un déblocage va consommer.
    droits: {
      plan: droits.plan.libelle,
      illimite: droits.illimite,
      quotaRestant: droits.quotaRestant,
      credits: droits.credits,
      peutDebloquer: droits.peutDebloquer,
    },
  };
}

export async function GET(requete: Request, contexte: { params: Promise<{ id: string }> }) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const { id } = await contexte.params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId)) return erreur("Identifiant de mission invalide.", 400);

  const forcer = new URL(requete.url).searchParams.get("recalculer") === "1";
  const cache = redis();

  const sql = connexion();
  try {
    const mission = await chargerMission(sql, missionId);
    if (!mission) return erreur("Mission introuvable.", 404);
    // Une entreprise ne voit que ses propres missions.
    if (mission.entrepriseId !== garde.session.compteId) {
      return erreur("Cette mission ne vous appartient pas.", 403);
    }

    const [debloques, droits] = await Promise.all([
      deblocagesDeLaMission(sql, garde.session.compteId, missionId),
      lireDroits(sql, garde.session.compteId),
    ]);

    if (!forcer) {
      const enCache = await sansEchec(() => cache.get(cle.cacheMatching(missionId)), "lecture cache matching");
      if (enCache) {
        const corps = (typeof enCache === "string" ? JSON.parse(enCache) : enCache) as ReponseMatching;
        return Response.json(presenter({ ...corps, depuisCache: true }, debloques, droits));
      }
    }

    // Ceux qui ont postulé sont évalués même sans avoir déclaré le métier : sinon
    // le compteur annonce « 0 profil conforme » à une entreprise qui vient de
    // recevoir une candidature.
    const candidats = await sql<{ interimaire_id: number }[]>`
      select interimaire_id from candidature where mission_id = ${missionId}`;
    const profils = await chargerProfils(
      sql,
      mission.metierCode,
      candidats.map((c) => c.interimaire_id)
    );
    const resultat = matcher(mission, profils);
    const habille = habiller(resultat, profils);

    const corps: ReponseMatching = {
      mission: {
        id: mission.missionId,
        titre: mission.titre,
        dateDebut: mission.dateDebut,
        dateFin: mission.dateFin,
        ville: mission.ville,
      },
      ponderations: PONDERATIONS,
      calculeLe: resultat.calculeLe,
      depuisCache: false,
      evalues: resultat.evalues,
      ...habille,
    };

    // Cache et trace ont des durées différentes : le cache évite de recalculer,
    // la trace sert à expliquer un résultat après coup et vit plus longtemps.
    await sansEchec(
      () =>
        Promise.all([
          cache.set(cle.cacheMatching(missionId), JSON.stringify(corps), { ex: TTL.cacheMatching }),
          cache.set(
        cle.traceMatching(missionId),
        JSON.stringify({
          missionId,
          calculeLe: resultat.calculeLe,
          dateFinComparee: mission.dateFin,
          evalues: resultat.evalues,
          retenus: resultat.retenus,
          ecartes: resultat.ecartes,
        }),
            { ex: TTL.traceMatching }
          ),
        ]),
      "écriture cache et trace matching"
    );

    return Response.json(presenter(corps, debloques, droits));
  } finally {
    await sql.end();
  }
}
