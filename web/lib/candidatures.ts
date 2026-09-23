import type { Sql } from "postgres";
import { dejaDebloque } from "./deblocage";
import {
  attendUneReponseDe,
  conformitePourMission,
  estConforme,
  libelleConformite,
  precisionConformite,
  transitionPermise,
  typeCertification,
  type Acteur,
  type ConformiteExigence,
  type EtatCandidature,
} from "@interimatch/core";

/**
 * Opérations sur les candidatures.
 *
 * Une seule implémentation pour les deux rôles : l'acteur est déduit de la session,
 * jamais du corps de la requête. Deux routes distinctes auraient fini par diverger,
 * et une transition permise d'un côté mais pas de l'autre produirait des candidatures
 * que personne ne peut plus traiter.
 */

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

/** Aujourd'hui en ISO court. Le cœur ne lit jamais l'horloge ; la frontière, si. */
export function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface MissionPourConformite {
  id: number;
  titre: string;
  dateFin: string;
  statut: string;
  entrepriseId: number;
  certificationsRequises: { typeCode: string; categorieCode: string | null }[];
}

/** Mission avec ses exigences, telles que la conformité les attend. */
export async function chargerMissionPourConformite(
  sql: Sql,
  missionId: number
): Promise<MissionPourConformite | null> {
  const [mission] = await sql<
    { id: number; titre: string; date_fin: string; statut: string; entreprise_id: number }[]
  >`
    select id, titre, date_fin::text, statut, entreprise_id from mission where id = ${missionId}`;
  if (!mission) return null;

  const exigences = await sql<{ type_code: string; categorie_code: string | null }[]>`
    select mcr.type_code, cat.code as categorie_code
    from mission_certification_requise mcr
    left join categorie_certification cat on cat.id = mcr.categorie_id
    where mcr.mission_id = ${missionId}`;

  return {
    id: mission.id,
    titre: mission.titre,
    dateFin: mission.date_fin,
    statut: mission.statut,
    entrepriseId: mission.entreprise_id,
    certificationsRequises: exigences.map((e) => ({
      typeCode: e.type_code,
      categorieCode: e.categorie_code,
    })),
  };
}

/** Habilitations déclarées par un intérimaire. */
export async function chargerCertifications(sql: Sql, interimaireId: number) {
  const lignes = await sql<{ type_code: string; categorie_code: string | null; date_echeance: string }[]>`
    select c.type_code, cat.code as categorie_code, c.date_echeance::text
    from certification c
    left join categorie_certification cat on cat.id = c.categorie_id
    where c.interimaire_id = ${interimaireId}`;
  return lignes.map((l) => ({
    typeCode: l.type_code as never,
    categorieCode: l.categorie_code,
    dateEcheance: l.date_echeance,
  }));
}

export interface ConformiteLisible extends ConformiteExigence {
  /** Libellé complet du type, tel qu'affiché à l'utilisateur. */
  libelleType: string;
  /** Phrase complète, pour un message où rien d'autre n'est affiché. */
  explication: string;
  /** La même information sans renommer l'habilitation, pour une liste. */
  precision: string;
}

/**
 * Conformité détaillée d'un intérimaire vis-à-vis d'une mission.
 *
 * Rendue habilitation par habilitation, jamais en verdict global : « non conforme »
 * n'apprend rien à qui doit décider s'il renouvelle un titre.
 */
export async function conformiteDetaillee(
  sql: Sql,
  mission: MissionPourConformite,
  interimaireId: number,
  date = aujourdhui()
): Promise<ConformiteLisible[]> {
  const certifications = await chargerCertifications(sql, interimaireId);
  return conformitePourMission(
    { dateFin: mission.dateFin, certificationsRequises: mission.certificationsRequises as never },
    certifications,
    date
  ).map((c) => {
    const libelleType = typeCertification(c.typeCode)?.libelle ?? c.typeCode.replace(/_/g, " ");
    return {
      ...c,
      libelleType,
      explication: libelleConformite(c, libelleType, enDateFr),
      precision: precisionConformite(c, enDateFr),
    };
  });
}

export type ResultatAction =
  | {
      ok: true;
      etat: EtatCandidature;
      missionPourvue: boolean;
      /** Message qui n'empêche rien, mais que l'intéressé a intérêt à lire. */
      avertissement?: string;
    }
  | { ok: false; statut: number; message: string; conformite?: ConformiteLisible[] };

/**
 * Fait avancer une candidature.
 *
 * La conformité est **rejouée au moment d'accepter**, pas seulement au matching : un
 * titre peut avoir expiré entre le rapprochement et la décision, et c'est
 * l'affectation qui engage la responsabilité pénale de l'entreprise utilisatrice —
 * pas le classement qui l'a précédée.
 */
export async function agir(
  sql: Sql,
  params: {
    missionId: number;
    interimaireId: number;
    acteur: Acteur;
    /** Compte connecté, pour vérifier qu'il a bien le droit d'agir sur cette ligne. */
    compteId: number;
    vers: EtatCandidature;
    motif?: string | null;
  }
): Promise<ResultatAction> {
  const { missionId, interimaireId, acteur, compteId, vers, motif } = params;

  const mission = await chargerMissionPourConformite(sql, missionId);
  if (!mission) return { ok: false, statut: 404, message: "Mission introuvable." };

  if (acteur === "entreprise" && mission.entrepriseId !== compteId) {
    return { ok: false, statut: 403, message: "Cette mission ne vous appartient pas." };
  }
  if (acteur === "interimaire" && interimaireId !== compteId) {
    return { ok: false, statut: 403, message: "Vous ne pouvez agir que pour votre compte." };
  }

  // **La barrière de déblocage est ici, pas seulement dans la page.**
  //
  // Elle n'existait que dans l'interface : masquer un bouton ne protège rien, il
  // suffit d'appeler la route. Or solliciter envoie une notification nominative à
  // quelqu'un dont l'entreprise n'a pas encore vu le nom — c'est précisément l'acte
  // qu'on facture. Tout le reste du produit vérifie ses droits côté serveur ; il n'y
  // avait aucune raison que celui-ci fasse exception.
  //
  // Seule la sollicitation est concernée : accepter une candidature *reçue*, ou
  // décliner, ne demande aucun déblocage — l'intérimaire s'est manifesté de lui-même.
  if (acteur === "entreprise" && vers === "sollicitee") {
    if (!(await dejaDebloque(sql, compteId, interimaireId, missionId))) {
      return {
        ok: false,
        statut: 402,
        message: "Débloquez les coordonnées de ce profil avant de le solliciter.",
      };
    }
  }

  if (mission.statut !== "publiee") {
    return {
      ok: false,
      statut: 409,
      message:
        mission.statut === "pourvue"
          ? "Cette mission est déjà pourvue."
          : "Cette mission n'est pas ouverte aux candidatures.",
    };
  }

  // Une candidature absente vaut « proposée » : c'est l'état d'un rapprochement que
  // le moteur a produit sans que personne n'ait encore agi.
  const [existante] = await sql<{ statut: EtatCandidature }[]>`
    select statut from candidature
    where mission_id = ${missionId} and interimaire_id = ${interimaireId}`;
  const depuis: EtatCandidature = existante?.statut ?? "proposee";

  if (!transitionPermise(depuis, acteur, vers)) {
    // Dire « impossible » sans dire pourquoi laisse croire à une panne. Le cas le
    // plus fréquent est qu'on a déjà engagé et que c'est à l'autre de répondre :
    // il faut le nommer, sinon on réessaie indéfiniment.
    const autre = acteur === "interimaire" ? "entreprise" : "interimaire";
    const message = attendUneReponseDe(depuis, autre)
      ? acteur === "entreprise"
        ? "Vous avez sollicité ce profil : c'est à lui d'accepter ou de décliner."
        : "Votre candidature est envoyée : c'est à l'entreprise de répondre."
      : depuis === "acceptee"
        ? "Cette candidature est déjà conclue."
        : depuis === "declinee"
          ? "Cette candidature a été écartée et ne peut plus évoluer."
          : depuis === "expiree"
            ? "La mission a été pourvue entre-temps : cette candidature est caduque."
            : "Cette action n'est plus possible sur cette candidature.";

    return { ok: false, statut: 409, message };
  }

  let conformite: ConformiteLisible[] = [];
  if (vers === "acceptee") {
    conformite = await conformiteDetaillee(sql, mission, interimaireId);
    if (!estConforme(conformite)) {
      const bloquantes = conformite.filter((c) => c.bloquant);
      return {
        ok: false,
        statut: 409,
        message:
          bloquantes.length === 1
            ? bloquantes[0]!.explication
            : `${bloquantes.length} habilitations exigées ne couvrent pas cette mission.`,
        conformite,
      };
    }
  }

  await sql`
    insert into candidature (mission_id, interimaire_id, statut, decide_par, motif, decide_le)
    values (${missionId}, ${interimaireId}, ${vers}, ${acteur}, ${motif ?? null}, now())
    on conflict (mission_id, interimaire_id) do update
      set statut = excluded.statut,
          decide_par = excluded.decide_par,
          motif = excluded.motif,
          decide_le = excluded.decide_le`;

  if (vers !== "acceptee") {
    // **Postuler hors de ses métiers déclarés reste permis, mais se dit.** L'écran
    // des opportunités montre délibérément tout le marché : cacher une offre
    // reviendrait à décider à la place de quelqu'un. Mais le moteur ne rapproche que
    // sur les métiers déclarés — sans cet avertissement, on candidate en croyant
    // être classé, et on ne l'est pas. Un mot suffit, et il est actionnable.
    let avertissement: string | undefined;
    if (acteur === "interimaire" && vers === "candidatee") {
      const [declare] = await sql<{ un: number }[]>`
        select 1 as un
          from mission m
          join interimaire_metier im
            on im.metier_code = m.metier_code and im.interimaire_id = ${compteId}
         where m.id = ${missionId}`;
      if (!declare) {
        avertissement =
          "Votre candidature est envoyée. Ce métier n'est pas déclaré à votre profil : " +
          "ajoutez-le pour que le moteur vous rapproche automatiquement des prochaines missions.";
      }
    }
    return { ok: true, etat: vers, missionPourvue: false, avertissement };
  }

  // Une acceptation pourvoit la mission et nomme l'affecté : « pourvue » sans
  // référence serait un statut sans contenu.
  await sql`
    update mission set statut = 'pourvue', interimaire_affecte_id = ${interimaireId}
    where id = ${missionId}`;

  // Les autres candidatures deviennent caduques. Le dire vaut mieux que de les
  // laisser en attente d'une réponse qui ne viendra jamais.
  await sql`
    update candidature set statut = 'expiree', decide_le = now()
    where mission_id = ${missionId} and interimaire_id <> ${interimaireId}
      and statut in ('proposee', 'candidatee', 'sollicitee')`;

  return { ok: true, etat: vers, missionPourvue: true };
}
