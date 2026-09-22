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

export type CodePlan = "decouverte" | "chantier" | "regie";

export interface Plan {
  code: CodePlan;
  libelle: string;
  /** En centimes, pour ne jamais manipuler de flottant sur de l'argent. */
  prixMensuelCents: number;
  /** Déblocages inclus chaque mois. `null` = sans limite. */
  quotaMensuel: number | null;
  /** Crédits remis à l'ouverture du compte, une seule fois. */
  creditsOfferts: number;
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
    argument: "Publiez, consultez les rapprochements, débloquez trois profils.",
  },
  {
    code: "chantier",
    libelle: "Chantier",
    prixMensuelCents: 8900,
    quotaMensuel: 10,
    creditsOfferts: 0,
    // La première version promettait ici « la relance automatique de vos fiches non
    // pourvues ». Elle n'était réservée à personne — tous les paliers la reçoivent —
    // et le rappel dit justement combien de profils restent à solliciter : le
    // retirer au palier gratuit reviendrait à couper la conversion de ceux qu'on
    // veut convertir. La promesse est corrigée, pas la fonctionnalité.
    argument: "Dix déblocages par mois, pour une équipe qui se renouvelle au fil des chantiers.",
  },
  {
    code: "regie",
    libelle: "Régie",
    prixMensuelCents: 24900,
    quotaMensuel: null,
    creditsOfferts: 0,
    argument: "Déblocages sans limite, pour qui recrute toute l'année.",
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
 * Le prix unitaire décroît — 12, 11, puis 10 € — mais reste au-dessus des 8,90 €
 * qu'implique le palier Chantier. La première grille descendait à 8 € l'unité sur le
 * gros pack : des crédits moins chers que l'abonnement *et* sans péremption rendaient
 * l'abonnement strictement moins bon. Un test le vérifie désormais.
 */
export const PACKS: readonly PackCredits[] = [
  { code: "unite", credits: 1, prixCents: 1200 },
  { code: "cinq", credits: 5, prixCents: 5500 },
  { code: "vingt", credits: 20, prixCents: 20000 },
] as const;

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

/** Prix en euros, à la française. Jamais de division flottante ailleurs que là. */
export function enEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
