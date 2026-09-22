/**
 * Cycle de vie d'une candidature.
 *
 * Le rapprochement est bilatéral : une candidature naît d'un rapprochement du moteur,
 * puis l'une des deux parties engage, et l'autre répond. Aucune des deux ne peut
 * conclure seule — c'est ce qui distingue une mise en relation d'une affectation
 * unilatérale.
 *
 * La table est ici, et pas dispersée dans les routes : une transition autorisée d'un
 * côté et refusée de l'autre produirait des candidatures impossibles à traiter.
 */

export type EtatCandidature =
  /** Le moteur a rapproché ; ni l'un ni l'autre n'a encore agi. */
  | "proposee"
  /** L'intérimaire a postulé ; l'entreprise doit répondre. */
  | "candidatee"
  /** L'entreprise a sollicité ; l'intérimaire doit répondre. */
  | "sollicitee"
  /** Accord des deux côtés : devient une affectation. */
  | "acceptee"
  /** Refus, terminal. Le motif et son auteur sont conservés. */
  | "declinee"
  /** La mission a démarré ou a été pourvue avant qu'on réponde. */
  | "expiree";

export type Acteur = "interimaire" | "entreprise";

/** Ce que chaque partie peut faire depuis un état donné. */
const TRANSITIONS: Record<EtatCandidature, Record<Acteur, EtatCandidature[]>> = {
  // Un rapprochement n'engage personne : chacun peut le saisir ou l'écarter.
  proposee: {
    interimaire: ["candidatee", "declinee"],
    entreprise: ["sollicitee", "declinee"],
  },
  // L'intérimaire s'est engagé : c'est à l'entreprise de trancher. Il peut encore
  // se retirer — un chantier trouvé ailleurs ne doit pas le laisser prisonnier.
  candidatee: {
    interimaire: ["declinee"],
    entreprise: ["acceptee", "declinee"],
  },
  // Symétrique.
  sollicitee: {
    interimaire: ["acceptee", "declinee"],
    entreprise: ["declinee"],
  },
  acceptee: { interimaire: [], entreprise: [] },
  declinee: { interimaire: [], entreprise: [] },
  expiree: { interimaire: [], entreprise: [] },
};

export function transitionPermise(
  depuis: EtatCandidature,
  acteur: Acteur,
  vers: EtatCandidature
): boolean {
  return TRANSITIONS[depuis][acteur].includes(vers);
}

/** Actions offertes à une partie, dans l'ordre où on les présente. */
export function actionsPossibles(depuis: EtatCandidature, acteur: Acteur): EtatCandidature[] {
  return TRANSITIONS[depuis][acteur];
}

/** Vrai quand la candidature attend une réponse de cette partie. */
export function attendUneReponseDe(etat: EtatCandidature, acteur: Acteur): boolean {
  if (etat === "candidatee") return acteur === "entreprise";
  if (etat === "sollicitee") return acteur === "interimaire";
  return false;
}

const LIBELLES: Record<EtatCandidature, string> = {
  proposee: "Proposée par le moteur",
  candidatee: "Candidature envoyée",
  sollicitee: "Sollicité par l'entreprise",
  acceptee: "Affectation confirmée",
  declinee: "Écartée",
  expiree: "Expirée",
};

export function libelleEtat(etat: EtatCandidature): string {
  return LIBELLES[etat];
}

/**
 * Formulation d'une action, du point de vue de celui qui la déclenche.
 *
 * « Décliner » et « refuser » désignent le même état mais pas le même geste : un
 * intérimaire décline un chantier, une entreprise écarte un profil. Employer le même
 * mot des deux côtés effacerait qui a décidé quoi.
 */
export function libelleAction(
  vers: EtatCandidature,
  acteur: Acteur,
  /** État d'où l'on part. Il change le sens du refus, et donc son libellé. */
  depuis?: EtatCandidature
): string {
  if (vers === "candidatee") return "Postuler";
  if (vers === "sollicitee") return "Solliciter ce profil";
  if (vers === "acceptee") return acteur === "interimaire" ? "Accepter la mission" : "Retenir ce profil";

  if (vers === "declinee") {
    // **Décliner et se retirer ne sont pas le même geste.** On décline ce qu'on
    // vous propose ; on retire ce qu'on a soi-même envoyé. Le bouton disait
    // « Décliner » sur sa propre candidature en cours, ce qui se lit comme un refus
    // adressé à soi-même — et laisse croire qu'on refuse une offre qu'on n'a pas
    // reçue. Même transition, même état d'arrivée, deux situations distinctes.
    if (acteur === "interimaire") return depuis === "candidatee" ? "Retirer ma candidature" : "Décliner";
    return depuis === "sollicitee" ? "Annuler ma sollicitation" : "Écarter ce profil";
  }
  return vers;
}
