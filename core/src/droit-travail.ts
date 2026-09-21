import type { DateISO } from "./types";

/**
 * Règles d'ordre public du travail temporaire.
 *
 * Le sujet impose de respecter « les grandes règles de l'intérim ». Deux d'entre
 * elles se vérifient par le logiciel, et deux seulement — le reste relève du contrat
 * signé entre l'entreprise utilisatrice et l'agence.
 *
 * Elles vivent dans le cœur, pas dans une route : la durée maximale doit être opposée
 * aussi bien à la création d'une mission qu'à la modification de ses dates, et les
 * mentions obligatoires doivent être vérifiables sans rendre une page.
 *
 * **Ce module ne lit pas l'horloge.** Une mission de dix-neuf mois est irrégulière le
 * jour où on la signe comme un an plus tard : seules les deux dates comptent.
 */

/**
 * Durée maximale d'une mission, renouvellements compris — article L1251-12.
 *
 * Des dérogations existent selon le motif de recours (9, 24 ou 36 mois). Les traiter
 * supposerait d'ajouter un motif au modèle de mission ; le plafond simple couvre le
 * cas général, qui est celui de l'intérim de chantier.
 */
export const DUREE_MAX_MOIS = 18;

export const ARTICLE_DUREE_MAX = "article L1251-12 du Code du travail";

/** Mois entiers séparant deux dates, la fraction restante comptant pour un mois entamé. */
export function moisEntre(debut: DateISO, fin: DateISO): number {
  const d = new Date(`${debut}T00:00:00Z`);
  const f = new Date(`${fin}T00:00:00Z`);
  const mois = (f.getUTCFullYear() - d.getUTCFullYear()) * 12 + (f.getUTCMonth() - d.getUTCMonth());
  // Le jour du mois décide du mois entamé : du 15 mars au 14 avril, il s'est écoulé
  // moins d'un mois plein.
  return f.getUTCDate() >= d.getUTCDate() ? mois : mois - 1;
}

export interface VerdictDuree {
  conforme: boolean;
  moisDemandes: number;
  /** Dernière date de fin admissible pour ce début, rendue pour être proposée. */
  finMaximale: DateISO;
}

/**
 * La durée demandée tient-elle dans le plafond légal ?
 *
 * On rend la date limite en plus du verdict : dire « c'est trop long » sans dire
 * jusqu'où on peut aller oblige l'utilisateur à chercher par tâtonnement.
 */
export function verifierDuree(debut: DateISO, fin: DateISO): VerdictDuree {
  const d = new Date(`${debut}T00:00:00Z`);
  const limite = new Date(d);
  limite.setUTCMonth(limite.getUTCMonth() + DUREE_MAX_MOIS);
  // Un mois plus court peut faire déborder le quantième : le 31 août + 6 mois donne
  // le 3 mars. On ramène alors au dernier jour du mois visé.
  if (limite.getUTCDate() !== d.getUTCDate()) limite.setUTCDate(0);

  const finMaximale = limite.toISOString().slice(0, 10) as DateISO;
  return {
    conforme: fin <= finMaximale,
    moisDemandes: moisEntre(debut, fin),
    finMaximale,
  };
}

/**
 * Mentions que doit porter un contrat de mission.
 *
 * Liste volontairement courte : ce sont celles qu'un logiciel peut garantir parce
 * qu'il détient la donnée. Les mentions relevant de l'accord entre l'agence et
 * l'entreprise utilisatrice — motif de recours, période d'essai, caractéristiques du
 * poste au regard de la médecine du travail — ne sont pas de son ressort.
 */
export const MENTIONS_OBLIGATOIRES = [
  "poste",
  "qualification",
  "terme",
  "lieu",
  "horaires",
  "remuneration",
] as const;

export type Mention = (typeof MENTIONS_OBLIGATOIRES)[number];

export const LIBELLE_MENTION: Record<Mention, string> = {
  poste: "Poste occupé",
  qualification: "Qualification requise",
  terme: "Terme de la mission",
  lieu: "Lieu d'exécution",
  horaires: "Horaires de travail",
  remuneration: "Rémunération",
};

export interface MissionContractuelle {
  titre: string | null;
  metierLibelle: string | null;
  dateFin: DateISO | null;
  ville: string | null;
  horaires: string | null;
  tauxHoraireMin: number | null;
}

/**
 * Mentions absentes d'une mission.
 *
 * Rendue comme une liste et non comme un booléen : une entreprise à qui l'on répond
 * « contrat incomplet » doit savoir quoi compléter, sans deviner.
 */
export function mentionsManquantes(mission: MissionContractuelle): Mention[] {
  const presentes: Record<Mention, boolean> = {
    poste: Boolean(mission.titre?.trim()),
    qualification: Boolean(mission.metierLibelle?.trim()),
    terme: Boolean(mission.dateFin),
    lieu: Boolean(mission.ville?.trim()),
    horaires: Boolean(mission.horaires?.trim()),
    remuneration: mission.tauxHoraireMin !== null && mission.tauxHoraireMin > 0,
  };
  return MENTIONS_OBLIGATOIRES.filter((m) => !presentes[m]);
}
