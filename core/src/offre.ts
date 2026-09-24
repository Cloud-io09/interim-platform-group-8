/**
 * Paliers, crédits et droits de déblocage.
 *
 * **Où passe la frontière payante, et pourquoi là.** Une entreprise voit gratuitement
 * tout ce qui l'aide à *décider* : qu'un profil est rapproché, son score détaillé, sa
 * conformité habilitation par habilitation, sa distance, ses disponibilités. Elle paie
 * pour *agir* : le nom, les coordonnées, le texte du CV, et le droit de solliciter.
 *
 * Ce n'est pas un arbitrage commercial mais une règle de sûreté. Le produit existe
 * pour empêcher qu'on envoie quelqu'un sur un chantier sans titre valable : mettre le
 * verdict de conformité derrière un paiement reviendrait à vendre le risque.
 *
 * **Un déblocage porte sur un profil × une mission**, jamais sur un profil seul. Une
 * entreprise qui recrute deux fois débloque deux fois. Sans cette borne, on vendrait
 * l'accès à une base de candidats — un métier de courtier en données, que le RGPD ne
 * traite pas comme une place de marché.
 */

export type CodePlan = "decouverte" | "starter" | "pro";

export interface Plan {
  code: CodePlan;
  libelle: string;
  /** En centimes, pour ne jamais manipuler de flottant sur de l'argent. */
  prixMensuelCents: number;
  /** Contacts inclus chaque mois. `null` = sans limite. */
  quotaMensuel: number | null;
  /** Crédits remis à l'ouverture du compte, une seule fois. */
  creditsOfferts: number;
  /** Fiches publiées simultanément. `null` = sans limite. Les brouillons ne comptent pas. */
  missionsActivesMax: number | null;
  /** Mis en avant sur les grilles. Un seul palier à la fois. */
  recommande: boolean;
  argument: string;
}

export const PLANS: readonly Plan[] = [
  {
    code: "decouverte",
    libelle: "Découverte",
    prixMensuelCents: 0,
    quotaMensuel: 0,
    // Trois, et pas un : assez pour éprouver le rapprochement sur une vraie fiche,
    // trop peu pour recruter une équipe sans jamais payer.
    creditsOfferts: 3,
    // Une fiche : de quoi aller au bout d'un recrutement, pas de quoi faire tourner
    // une activité entière sur le palier gratuit.
    missionsActivesMax: 1,
    recommande: false,
    argument: "Publiez une fiche, consultez les rapprochements, obtenez trois contacts.",
  },
  {
    code: "starter",
    libelle: "Starter",
    prixMensuelCents: 3900,
    quotaMensuel: 40,
    creditsOfferts: 0,
    missionsActivesMax: 4,
    recommande: true,
    // Ne jamais promettre ici une fonctionnalité que tous les paliers reçoivent
    // (la relance des fiches non pourvues, par exemple) : un test y veille.
    argument: "Quarante contacts par mois et quatre fiches en ligne, pour une équipe qui se renouvelle au fil des chantiers.",
  },
  {
    code: "pro",
    libelle: "Pro",
    prixMensuelCents: 12900,
    quotaMensuel: null,
    creditsOfferts: 0,
    missionsActivesMax: null,
    recommande: false,
    argument: "Contacts et fiches sans limite, pour qui recrute toute l'année.",
  },
] as const;

export interface PackCredits {
  code: string;
  credits: number;
  prixCents: number;
}

/**
 * Packs à l'acte, sans péremption.
 *
 * Le bâtiment recrute par à-coups : une entreprise qui embauche deux fois l'an ne
 * s'abonnera pas, et lui refuser le produit pour autant serait absurde.
 *
 * Le prix unitaire décroît — 5, 4, puis 3,50 € — mais reste au-dessus des 0,975 €
 * qu'implique le palier Starter. Des crédits moins chers que l'abonnement *et* sans
 * péremption rendraient l'abonnement strictement moins bon. Un test le vérifie.
 */
export const PACKS: readonly PackCredits[] = [
  { code: "unite", credits: 1, prixCents: 500 },
  { code: "cinq", credits: 5, prixCents: 2000 },
  { code: "dix", credits: 10, prixCents: 3500 },
] as const;

/** Mention légale des crédits, affichée partout où ils se vendent. */
export const MENTION_CREDITS =
  "Crédits sans date d'expiration. Un contact = les coordonnées d'un profil pour une mission.";

/**
 * Ce que contient un palier, en clair — une ligne par limite.
 *
 * Partagé par la page Tarifs, l'accueil et l'espace abonnement : trois grilles qui
 * formuleraient chacune les quotas à leur façon finiraient par se contredire.
 */
export function contenuPlan(p: Plan): string[] {
  const contacts =
    p.quotaMensuel === null
      ? "Contacts illimités"
      : p.quotaMensuel === 0
        ? `${p.creditsOfferts} contacts offerts`
        : `${p.quotaMensuel} contacts par mois`;
  const missions =
    p.missionsActivesMax === null
      ? "Missions actives illimitées"
      : `${p.missionsActivesMax} mission${p.missionsActivesMax > 1 ? "s" : ""} active${p.missionsActivesMax > 1 ? "s" : ""}`;
  return [contacts, missions];
}

export function planParCode(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}

export function packParCode(code: string): PackCredits | undefined {
  return PACKS.find((p) => p.code === code);
}

export interface EtatDroits {
  plan: Plan;
  /** Déblocages déjà consommés sur le mois en cours. */
  utilisesCeMois: number;
  /** Crédits achetés ou offerts, qui n'expirent pas. */
  credits: number;
  quotaRestant: number;
  illimite: boolean;
  /** Reste-t-il de quoi débloquer un profil ? */
  peutDebloquer: boolean;
}

/**
 * Ce dont dispose une entreprise à l'instant présent.
 *
 * Le quota mensuel se consomme **avant** les crédits : il se remet à zéro au mois
 * suivant, alors qu'un crédit acheté ne périme pas. L'ordre inverse ferait perdre de
 * l'argent à l'entreprise sans qu'elle s'en aperçoive.
 */
export function etatDroits(entree: {
  planCode: string;
  utilisesCeMois: number;
  credits: number;
}): EtatDroits {
  const plan = planParCode(entree.planCode) ?? PLANS[0]!;
  const illimite = plan.quotaMensuel === null;
  const quotaRestant = illimite
    ? Number.POSITIVE_INFINITY
    : Math.max(0, plan.quotaMensuel! - entree.utilisesCeMois);

  return {
    plan,
    utilisesCeMois: entree.utilisesCeMois,
    credits: entree.credits,
    quotaRestant: illimite ? Number.POSITIVE_INFINITY : quotaRestant,
    illimite,
    peutDebloquer: illimite || quotaRestant > 0 || entree.credits > 0,
  };
}

export type SourceDeblocage = "abonnement" | "credit";

/** Sur quoi le prochain déblocage sera imputé, ou `null` s'il n'y a plus rien. */
export function sourceDuProchain(droits: EtatDroits): SourceDeblocage | null {
  if (droits.illimite || droits.quotaRestant > 0) return "abonnement";
  return droits.credits > 0 ? "credit" : null;
}

/**
 * L'entreprise peut-elle mettre une fiche de plus en ligne ?
 *
 * Seules les fiches publiées comptent : un brouillon ne coûte rien et ne sollicite
 * personne, une fiche pourvue ou close n'est plus en recherche. Un passage à un
 * palier inférieur ne dépublie rien — il empêche seulement d'en publier de nouvelles.
 */
export function peutPublier(planCode: string, missionsActives: number): boolean {
  const plan = planParCode(planCode) ?? PLANS[0]!;
  return plan.missionsActivesMax === null || missionsActives < plan.missionsActivesMax;
}

/** Prix en euros, à la française. Jamais de division flottante ailleurs que là. */
export function enEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
