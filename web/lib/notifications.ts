import type { Sql } from "postgres";
import { matcher, type Acteur, type EtatCandidature } from "@interimatch/core";
import { configDiscord, posterDansSalon, sansEchec } from "@interimatch/core";
import { chargerMission, chargerProfils } from "./depot";

/**
 * Notifications dans l'application.
 *
 * Les deux automatisations n8n poussent vers Discord ; rien n'en revenait dans le
 * produit. Un intérimaire qui se connectait ne pouvait pas savoir qu'une mission lui
 * correspondant avait été publiée la veille : son tableau de bord affichait un
 * compteur, jamais un événement.
 *
 * Les notifications sont donc créées **par l'application, au moment de l'événement**,
 * et non par le scénario n8n. La fonctionnalité reste visible si l'automatisation ne
 * tourne pas — et n8n lit la même source pour ses envois.
 */

export type TypeNotification =
  | "mission_correspondante"
  | "certification_expire"
  | "candidature_proposee"
  | "candidature_repondue";

export interface Notification {
  id: number;
  type: TypeNotification;
  titre: string;
  corps: string | null;
  lien: string;
  creeLe: string;
  lue: boolean;
}

interface ANotifier {
  compteId: number;
  type: TypeNotification;
  titre: string;
  corps: string | null;
  lien: string;
  missionId?: number | null;
  certificationId?: number | null;
}

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

/**
 * Enregistre un lot de notifications.
 *
 * `do nothing` sur conflit : republier une fiche, rejouer un scénario ou rouvrir le
 * tableau de bord ne doit pas remplir la liste de doublons. L'index d'unicité porte
 * sur le couple (compte, type, objet concerné).
 */
export async function enregistrer(sql: Sql, lignes: readonly ANotifier[]): Promise<number> {
  if (lignes.length === 0) return 0;

  const inserees = await sql<{ id: number }[]>`
    insert into notification ${sql(
      lignes.map((l) => ({
        compte_id: l.compteId,
        type: l.type,
        titre: l.titre,
        corps: l.corps,
        lien: l.lien,
        mission_id: l.missionId ?? null,
        certification_id: l.certificationId ?? null,
      }))
    )}
    on conflict do nothing
    returning id`;

  return inserees.length;
}

/**
 * Prévient les intérimaires qu'une fiche publiée leur correspond.
 *
 * Le matching est rejoué plutôt que lu au cache : prévenir quelqu'un qui n'est plus
 * conforme serait pire que ne rien envoyer. Seuls les profils **retenus** par le
 * filtre éliminatoire sont notifiés — jamais les écartés.
 */
export async function notifierMissionPubliee(sql: Sql, missionId: number): Promise<number> {
  const mission = await chargerMission(sql, missionId);
  if (!mission || mission.statut !== "publiee") return 0;

  const profils = await chargerProfils(sql, mission.metierCode);
  const retenus = matcher(mission, profils).retenus;
  if (retenus.length === 0) return 0;

  return enregistrer(
    sql,
    retenus.map((score) => ({
      compteId: score.interimaireId,
      type: "mission_correspondante" as const,
      titre: `Nouvelle mission : ${mission.titre}`,
      corps:
        `${mission.ville} · du ${enDateFr(mission.dateDebut)} au ${enDateFr(mission.dateFin)} · ` +
        `à ${score.detail.distanceKm} km de chez vous · compatibilité ${Math.round(score.total * 100)} %.`,
      lien: `/mes-missions/${missionId}`,
      missionId,
    }))
  );
}

/**
 * Prévient **l'autre partie** d'un mouvement de candidature.
 *
 * Toujours l'autre : celui qui vient d'agir sait ce qu'il a fait. Une notification
 * qui renvoie à son auteur son propre geste est du bruit, et elle noie celles qui
 * appellent une réponse.
 */
export async function notifierCandidature(
  sql: Sql,
  missionId: number,
  interimaireId: number,
  acteur: Acteur,
  etat: EtatCandidature
): Promise<number> {
  const [ligne] = await sql<
    {
      entreprise_id: number; titre: string; ville: string;
      raison_sociale: string; prenom: string; nom: string;
    }[]
  >`
    select m.entreprise_id, m.titre, m.ville, e.raison_sociale, i.prenom, i.nom
    from mission m
    join entreprise e on e.compte_id = m.entreprise_id
    join interimaire i on i.compte_id = ${interimaireId}
    where m.id = ${missionId}`;
  if (!ligne) return 0;

  const versEntreprise = acteur === "interimaire";
  const destinataire = versEntreprise ? ligne.entreprise_id : interimaireId;
  const qui = versEntreprise ? `${ligne.prenom} ${ligne.nom}` : ligne.raison_sociale;

  const titre =
    etat === "candidatee"
      ? `${qui} a postulé à « ${ligne.titre} »`
      : etat === "sollicitee"
        ? `${qui} vous propose « ${ligne.titre} »`
        : etat === "acceptee"
          ? `Affectation confirmée : ${ligne.titre}`
          : `${qui} s'est retiré de « ${ligne.titre} »`;

  const corps =
    etat === "acceptee"
      ? `${ligne.ville}. ${versEntreprise ? `${qui} est affecté à ce chantier.` : "Vous êtes affecté à ce chantier."}`
      : etat === "declinee"
        ? null
        : `${ligne.ville}. Une réponse est attendue de votre part.`;

  // Un même couple mission/intérimaire peut enchaîner plusieurs mouvements : on
  // remplace, sinon l'index d'unicité ferait taire tous les suivants.
  await sql`
    delete from notification
    where compte_id = ${destinataire}
      and type in ('candidature_proposee', 'candidature_repondue')
      and mission_id = ${missionId}`;

  const ecrites = await enregistrer(sql, [
    {
      compteId: destinataire,
      type: versEntreprise ? "candidature_repondue" : "candidature_proposee",
      titre,
      corps,
      lien: versEntreprise ? `/missions/${missionId}` : `/mes-missions/${missionId}`,
      missionId,
    },
  ]);

  await relayerVersDiscord(sql, destinataire, `**${titre}**${corps ? `\n${corps}` : ""}`);
  return ecrites;
}

/**
 * Relaie une notification vers le salon Discord de son destinataire, s'il en a un.
 *
 * **Pourquoi ici et non par n8n.** Les deux scénarios n8n sont périodiques et ne
 * parcourent que des intérimaires : une entreprise qui rattachait son Discord
 * obtenait un salon où rien n'arrivait jamais. Les mouvements de candidature, eux,
 * sont des événements — ils ont un instant précis, et attendre le prochain passage
 * d'un automate pour les annoncer n'aurait aucun sens.
 *
 * Cela ne remplace pas les deux automatisations exigées : celles-ci relèvent d'un
 * calendrier — une échéance qui approche, des missions publiées depuis la veille —
 * et n'ont pas d'événement applicatif où s'accrocher.
 *
 * Sans échec : Discord n'est qu'un écho. La notification est déjà en base, et c'est
 * elle qui fait foi.
 */
async function relayerVersDiscord(sql: Sql, compteId: number, message: string): Promise<void> {
  await sansEchec(async () => {
    const config = configDiscord();
    if (!config) return;

    const [compte] = await sql<{ discord_salon_id: string | null }[]>`
      select discord_salon_id from compte where id = ${compteId}`;
    if (!compte?.discord_salon_id) return;

    await posterDansSalon(config, compte.discord_salon_id, message);
  }, "relais Discord d'une notification");
}

/** Au-delà de ce délai, une échéance n'est plus une alerte mais une information. */
export const JOURS_ALERTE_ECHEANCE = 90;

/**
 * Crée les alertes d'échéance manquantes pour un intérimaire.
 *
 * Une échéance est un événement du calendrier, pas une action d'utilisateur : elle
 * n'a aucun moment naturel où se déclencher côté application. Le scénario n8n s'en
 * charge quotidiennement ; ce rattrapage à l'ouverture du tableau de bord garantit
 * que l'alerte existe même si l'automatisation n'a pas tourné. L'index d'unicité
 * rend l'opération sans effet quand elle a déjà eu lieu.
 */
export async function rattraperEcheances(sql: Sql, compteId: number): Promise<number> {
  const proches = await sql<{ id: number; type_code: string; date_echeance: string }[]>`
    select id, type_code, date_echeance::text
    from certification
    where interimaire_id = ${compteId}
      and date_echeance between current_date and current_date + ${JOURS_ALERTE_ECHEANCE}::int`;

  return enregistrer(
    sql,
    proches.map((c) => ({
      compteId,
      type: "certification_expire" as const,
      titre: `${c.type_code.replace(/_/g, " ")} expire le ${enDateFr(c.date_echeance)}`,
      corps: "Sans renouvellement, vous serez écarté de toute mission qui l'exige.",
      lien: "/espace/interimaire/certifications",
      certificationId: c.id,
    }))
  );
}

/** Notifications les plus récentes d'un compte. */
export async function lister(sql: Sql, compteId: number, limite = 8): Promise<Notification[]> {
  const lignes = await sql<
    {
      id: number; type: TypeNotification; titre: string; corps: string | null;
      lien: string; cree_le: string; lue_le: string | null;
    }[]
  >`
    select id, type, titre, corps, lien, cree_le::text, lue_le::text
    from notification where compte_id = ${compteId}
    order by lue_le nulls first, cree_le desc
    limit ${limite}`;

  return lignes.map((l) => ({
    id: l.id,
    type: l.type,
    titre: l.titre,
    corps: l.corps,
    lien: l.lien,
    creeLe: l.cree_le,
    lue: l.lue_le !== null,
  }));
}

export async function compterNonLues(sql: Sql, compteId: number): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from notification
    where compte_id = ${compteId} and lue_le is null`;
  return r?.n ?? 0;
}

/** Marque comme lues les notifications d'un compte — toutes, ou celles citées. */
export async function marquerLues(sql: Sql, compteId: number, ids?: readonly number[]): Promise<number> {
  const misesAJour =
    ids && ids.length > 0
      ? await sql<{ id: number }[]>`
          update notification set lue_le = now()
          where compte_id = ${compteId} and lue_le is null and id = any(${ids as number[]})
          returning id`
      : await sql<{ id: number }[]>`
          update notification set lue_le = now()
          where compte_id = ${compteId} and lue_le is null
          returning id`;
  return misesAJour.length;
}
