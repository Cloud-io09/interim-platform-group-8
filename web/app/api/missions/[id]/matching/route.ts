import { connexion } from "@interimatch/core/db";
import {
  cle,
  matcher,
  PONDERATIONS,
  redis,
  TTL,
  typeCertification,
  type ResultatMatching,
} from "@interimatch/core";
import { erreur } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { chargerMission, chargerProfils, type ProfilAvecIdentite } from "@/lib/depot";

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

    if (!forcer) {
      const enCache = await cache.get(cle.cacheMatching(missionId));
      if (enCache) {
        const corps = typeof enCache === "string" ? JSON.parse(enCache) : enCache;
        return Response.json({ ...corps, depuisCache: true });
      }
    }

    const profils = await chargerProfils(sql, mission.metierCode);
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
    await Promise.all([
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
    ]);

    return Response.json(corps);
  } finally {
    await sql.end();
  }
}
