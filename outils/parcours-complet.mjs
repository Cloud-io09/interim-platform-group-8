#!/usr/bin/env node
/**
 * Parcours complet, des deux côtés, contre une instance réelle.
 *
 *   node outils/parcours-complet.mjs [url]
 *
 * Déroule l'histoire entière — une entreprise publie un chantier, des intérimaires
 * se déclarent, le moteur tranche, les deux parties s'accordent — et vérifie à chaque
 * étape ce que le produit promet. C'est à la fois un essai de bout en bout et la
 * source du document `docs/parcours.md` : le diagramme y décrit ce qui se passe
 * réellement, et non ce qu'on croit qu'il se passe.
 *
 * Trois profils sont créés, chacun pour éprouver une règle :
 *
 *   conforme        habilitation valide au-delà de la fin du chantier
 *   expire-pendant  habilitation valide aujourd'hui, périmée avant la fin — écarté
 *   sans-titre      aucune habilitation — écarté
 *
 * **N'envoie aucun courriel** : aucune étape ne demande de lien de réinitialisation.
 * Tous les comptes créés sont supprimés à la fin, y compris après un échec.
 */

const base = (process.argv[2] ?? "http://127.0.0.1:3205").replace(/\/+$/, "");
const MARQUE = `parcours-${Date.now()}`;
const MOT_DE_PASSE = "parcours-de-bout-en-bout-2026";

/** Chantier volontairement placé dans le futur, pour que les dates soient stables. */
const DEBUT = "2027-04-05";
const FIN = "2027-04-30";

let echecs = 0;
const comptes = [];

const titre = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
function verifier(intitule, condition, detail = "") {
  if (!condition) echecs++;
  console.log(`  ${condition ? "ok  " : "ÉCHEC"} ${intitule}${detail ? ` — ${detail}` : ""}`);
}

async function appel(chemin, methode = "GET", corps, cookie) {
  const r = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    redirect: "manual",
  });
  const t = await r.text();
  let json = null;
  try {
    json = t ? JSON.parse(t) : null;
  } catch {
    json = { html: t };
  }
  return { statut: r.status, corps: json, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

async function inscrire(suffixe, role) {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  const r = await appel("/api/auth/inscription", "POST", { email, motDePasse: MOT_DE_PASSE, role });
  comptes.push({ email, cookie: r.cookie, motDePasse: MOT_DE_PASSE });
  return { email, cookie: r.cookie, codes: r.corps?.codesRecuperation ?? [] };
}

// ===========================================================================
titre("1. L'entreprise ouvre un compte et se décrit");
// ===========================================================================
const ent = await inscrire("entreprise", "entreprise");
verifier("inscription entreprise", ent.cookie.length > 20);
verifier("codes de récupération remis", ent.codes.length === 8, `${ent.codes.length}`);

const profilEnt = await appel("/api/profil/entreprise", "POST", {
  raisonSociale: "Bâtiment du Parcours SAS",
  siret: "44306184100005",
  adresse: "25 rue de Vesle",
  codePostal: "51100",
  ville: "Reims",
}, ent.cookie);
verifier("profil entreprise enregistré", profilEnt.statut === 200);
verifier(
  "l'adresse est géocodée — sans coordonnées, aucune distance n'est calculable",
  typeof profilEnt.corps?.position?.lat === "number",
  `${profilEnt.corps?.position?.libelle}`
);

// ===========================================================================
titre("2. Les données publiques préremplissent la fiche de poste");
// ===========================================================================
const enrichi = await appel("/api/enrichissement?metier=F1302&codePostal=51100", "GET", undefined, ent.cookie);
verifier("enrichissement disponible", enrichi.statut === 200, `statut ${enrichi.statut}`);
if (enrichi.statut === 200) {
  const e = enrichi.corps;
  verifier(
    "des habilitations typiques du métier sont proposées",
    (e.certifications ?? []).length > 0,
    (e.certifications ?? []).slice(0, 2).map((c) => c.libelle).join(", ")
  );
  verifier(
    "une fourchette de rémunération observée est proposée",
    e.remuneration !== null,
    e.remuneration ? `médiane ${e.remuneration.mediane} €/h sur ${e.remuneration.effectif} offres` : ""
  );
}

// ===========================================================================
titre("3. Le Code du travail est opposé à la saisie");
// ===========================================================================
const tropLongue = await appel("/api/missions", "POST", {
  titre: "Chantier interminable", metierCode: "F1302",
  codePostal: "51100", ville: "Reims",
  dateDebut: DEBUT, dateFin: "2029-12-31",
  certificationsRequises: [], publier: true,
}, ent.cookie);
verifier("une mission de plus de 18 mois est refusée", tropLongue.statut === 422);
verifier(
  "le refus cite l'article et donne la date limite",
  /L1251-12/.test(JSON.stringify(tropLongue.corps)),
  (tropLongue.corps?.problemes ?? [])[0]?.message?.slice(0, 90)
);

// ===========================================================================
titre("4. La fiche de poste est publiée");
// ===========================================================================
const mission = await appel("/api/missions", "POST", {
  titre: "Conducteur de pelle — terrassement réseaux",
  metierCode: "F1302",
  description: "Terrassement et réseaux enterrés sur trois semaines.",
  adresse: "25 rue de Vesle", codePostal: "51100", ville: "Reims",
  dateDebut: DEBUT, dateFin: FIN,
  horaires: "7h30-12h / 13h-16h30, 35 h par semaine",
  tauxHoraireMin: 14, tauxHoraireMax: 16.5,
  certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
  competencesRequises: [],
  publier: true,
}, ent.cookie);
verifier("fiche publiée", mission.statut === 201, `statut ${mission.statut}`);
const missionId = mission.corps?.id;

const contrat = await appel(`/missions/${missionId}/contrat`, "GET", undefined, ent.cookie);
verifier("le document de mission est consultable", contrat.statut === 200);
verifier(
  "toutes les mentions obligatoires sont renseignées",
  /Toutes les mentions obligatoires/.test(contrat.corps?.html ?? ""),
  "poste, qualification, terme, lieu, horaires, rémunération"
);

// ===========================================================================
titre("5. Trois intérimaires se déclarent");
// ===========================================================================
const PROFIL = {
  prenom: "Prénom", nom: "Essai", codePostal: "51100", ville: "Reims",
  rayonMobiliteKm: 50,
  metiers: [{ code: "F1302", anneesExperience: 6 }],
};

async function interimaire(suffixe, prenom, certification) {
  const i = await inscrire(suffixe, "interimaire");
  await appel("/api/profil/interimaire", "POST", { ...PROFIL, prenom }, i.cookie);
  await appel("/api/disponibilites", "POST", { dateDebut: "2027-01-01", dateFin: "2027-12-31" }, i.cookie);
  if (certification) {
    await appel("/api/certifications", "POST", {
      typeCode: "CACES_R482", categorieCode: "B1", organismeEmetteur: "AFPA",
      numero: `C-${suffixe}-${Date.now()}`,
      dateObtention: "2024-01-15", dateEcheance: certification,
    }, i.cookie);
  }
  const moi = await appel("/api/moi", "GET", undefined, i.cookie);
  return { ...i, id: moi.corps?.compte?.id, prenom };
}

// Échéance au-delà de la fin du chantier : conforme.
const conforme = await interimaire("conforme", "Karim", "2034-01-15");
// Valide aujourd'hui, périmée AVANT la fin du chantier : le cas qui fonde le produit.
const expirePendant = await interimaire("expire-pendant", "Sofiane", "2027-04-20");
// Aucune habilitation déclarée.
const sansTitre = await interimaire("sans-titre", "Lucie", null);

verifier("trois profils créés", [conforme, expirePendant, sansTitre].every((p) => p.id > 0));

// ===========================================================================
titre("6. Le moteur tranche — filtre éliminatoire, puis score");
// ===========================================================================
const matching = await appel(`/api/missions/${missionId}/matching`, "GET", undefined, ent.cookie);
verifier("le matching répond", matching.statut === 200);

const retenus = matching.corps?.retenus ?? [];
const ecartes = matching.corps?.ecartes ?? [];
const estRetenu = (id) => retenus.some((r) => r.interimaireId === id);
const motifDe = (id) => ecartes.find((e) => e.interimaireId === id)?.motif;

verifier("Karim est retenu — son titre couvre la fin du chantier", estRetenu(conforme.id));
verifier(
  "Sofiane est ÉCARTÉ — son titre expire pendant la mission",
  !estRetenu(expirePendant.id) && motifDe(expirePendant.id) === "certification_expiree",
  "c'est la règle qui fonde le produit : on compare à la date de FIN, pas à aujourd'hui"
);
verifier(
  "Lucie est écartée — aucune habilitation déclarée",
  !estRetenu(sansTitre.id) && motifDe(sansTitre.id) === "certification_absente"
);

const score = retenus.find((r) => r.interimaireId === conforme.id);
verifier(
  "le score est exposé par critère, pas seulement en total",
  score && ["competences", "distance", "disponibilite"].every((c) => typeof score[c] === "number"),
  score ? `total ${Math.round(score.total * 100)} % — compétences ${score.competences}, distance ${score.distance}, dispo ${score.disponibilite}` : ""
);

// ===========================================================================
titre("7. L'intérimaire voit ce qui lui est ouvert, et ce qui lui est fermé");
// ===========================================================================
const vueKarim = await appel("/api/interimaire/missions", "GET", undefined, conforme.cookie);
verifier(
  "Karim voit la mission comme accessible",
  (vueKarim.corps?.accessibles ?? []).some((m) => m.id === missionId)
);

const vueSofiane = await appel("/api/interimaire/missions", "GET", undefined, expirePendant.cookie);
const bloquee = (vueSofiane.corps?.bloquees ?? []).find((m) => m.id === missionId);
verifier(
  "Sofiane la voit comme bloquée, avec le motif et le titre en cause",
  Boolean(bloquee),
  bloquee ? `${bloquee.certificationManquante} — ${bloquee.explication}` : ""
);

// ===========================================================================
titre("8. Le rapprochement est bilatéral — aucune partie ne conclut seule");
// ===========================================================================
const seul = await appel("/api/candidatures", "POST", { missionId, vers: "acceptee" }, conforme.cookie);
verifier("un intérimaire ne peut pas s'affecter lui-même", seul.statut === 409);

const postule = await appel("/api/candidatures", "POST", { missionId, vers: "candidatee" }, conforme.cookie);
verifier("Karim postule", postule.statut === 200, `état ${postule.corps?.etat}`);

// --- La barrière de déblocage, côté serveur ---------------------------------
//
// Solliciter envoie une notification nominative à quelqu'un dont l'entreprise n'a
// pas encore vu le nom : c'est l'acte qu'on facture. La barrière n'existait que dans
// l'interface, et masquer un bouton ne protège rien — il suffisait d'appeler la
// route. Ce parcours passait donc au vert en contournant le paywall sans le savoir.
const avantDeblocage = await appel("/api/candidatures", "POST", {
  missionId, interimaireId: expirePendant.id, vers: "sollicitee",
}, ent.cookie);
verifier(
  "solliciter sans avoir débloqué est refusé",
  avantDeblocage.statut === 402,
  `statut ${avantDeblocage.statut}`
);

const droitsAvant = await appel("/api/deblocages", "GET", undefined, ent.cookie);
verifier(
  "l'entreprise part avec les déblocages offerts",
  droitsAvant.corps?.credits === 3,
  `${droitsAvant.corps?.credits} crédit(s)`
);

const deblocage = await appel("/api/deblocages", "POST", {
  interimaireId: expirePendant.id, missionId,
}, ent.cookie);
verifier("elle débloque les coordonnées", deblocage.statut === 200, `statut ${deblocage.statut}`);
verifier("et un crédit est débité", deblocage.corps?.credits === 2, `${deblocage.corps?.credits} restant(s)`);

const rejeu = await appel("/api/deblocages", "POST", {
  interimaireId: expirePendant.id, missionId,
}, ent.cookie);
verifier("un second déblocage du même profil ne refacture pas", rejeu.corps?.credits === 2, `${rejeu.corps?.credits}`);

const sollicite = await appel("/api/candidatures", "POST", {
  missionId, interimaireId: expirePendant.id, vers: "sollicitee",
}, ent.cookie);
verifier("l'entreprise sollicite Sofiane malgré son titre expirant", sollicite.statut === 200);

const tourDeLAutre = await appel("/api/candidatures", "POST", {
  missionId, interimaireId: expirePendant.id, vers: "acceptee",
}, ent.cookie);
verifier(
  "elle ne peut pas conclure seule, et le refus dit à qui est le tour",
  tourDeLAutre.statut === 409 && /c'est à lui d'accepter/.test(tourDeLAutre.corps?.message ?? ""),
  tourDeLAutre.corps?.message
);

// Sofiane accepte : c'est son tour, mais la conformité est rejouée à cet instant.
const accepteNonConforme = await appel("/api/candidatures", "POST", {
  missionId, vers: "acceptee",
}, expirePendant.cookie);
verifier(
  "Sofiane ne peut PAS accepter — la conformité est rejouée à l'acceptation",
  accepteNonConforme.statut === 409,
  accepteNonConforme.corps?.message?.slice(0, 95)
);
verifier(
  "le refus détaille l'habilitation en cause, pas un verdict global",
  (accepteNonConforme.corps?.conformite ?? []).some((c) => c.bloquant && c.typeCode === "CACES_R482")
);

// ===========================================================================
titre("9. L'affectation, et ses conséquences");
// ===========================================================================
const affecte = await appel("/api/candidatures", "POST", {
  missionId, interimaireId: conforme.id, vers: "acceptee",
}, ent.cookie);
verifier("Karim est affecté", affecte.statut === 200);
verifier("la mission passe à « pourvue »", affecte.corps?.missionPourvue === true);

const candidatures = await appel(`/api/missions/${missionId}/candidatures`, "GET", undefined, ent.cookie);
const etatDe = (id) => (candidatures.corps?.candidatures ?? []).find((c) => c.interimaireId === id)?.statut;
verifier("la candidature de Karim est acceptée", etatDe(conforme.id) === "acceptee");
verifier(
  "celle de Sofiane devient caduque plutôt que de rester en attente",
  etatDe(expirePendant.id) === "expiree"
);

const notifs = await appel("/api/notifications", "GET", undefined, conforme.cookie);
verifier(
  "Karim est prévenu dans l'application",
  (notifs.corps?.notifications ?? []).some((n) => n.type === "candidature_proposee" || n.titre.includes("Affectation")),
  (notifs.corps?.notifications ?? [])[0]?.titre?.slice(0, 70)
);

// ===========================================================================
titre("10. Ce que l'entreprise voit du profil qu'elle a retenu");
// ===========================================================================
const fiche = await appel(`/missions/${missionId}/profils/${conforme.id}`, "GET", undefined, ent.cookie);
verifier("la fiche profil est consultable", fiche.statut === 200);
const html = fiche.corps?.html ?? "";
verifier("elle montre la conformité habilitation par habilitation", /CACES R482/.test(html));
verifier("elle distingue l'expérience constatée de l'expérience déclarée", /Constatée par la plateforme/.test(html));
verifier("elle dit que l'expérience déclarée n'entre pas dans le calcul", /n&#x27;entre pas dans le calcul/.test(html));

// ===========================================================================
titre("11. Une fois affecté : les deux parties ont-elles de quoi démarrer ?");
// ===========================================================================
//
// Le parcours s'arrêtait à « affecté » sans jamais ouvrir un seul écran d'après.
// Trois composants interrogeaient alors une connexion déjà refermée par leur page
// appelante — un composant serveur asynchrone s'exécute pendant le rendu, donc
// après le `finally` de la page — et l'utilisateur lisait « Page couldn't load ».
// Aucun test ne pouvait l'attraper : tous s'arrêtaient à l'API.
const pageInterimaire = await appel(`/mes-missions/${missionId}`, "GET", undefined, conforme.cookie);
verifier("l'intérimaire ouvre sa mission", pageInterimaire.statut === 200, `statut ${pageInterimaire.statut}`);
const vuInterimaire = pageInterimaire.corps?.html ?? "";
verifier("il sait où et quand se présenter", /Vous présenter sur le chantier/.test(vuInterimaire));
verifier("l'adresse du chantier y figure", /Fontenay|rue|Adresse/.test(vuInterimaire));
verifier("et qui appeler", /Horaires/.test(vuInterimaire));

const docInterimaire = await appel(`/mes-missions/${missionId}/document`, "GET", undefined, conforme.cookie);
verifier("son document de mission s'ouvre", docInterimaire.statut === 200, `statut ${docInterimaire.statut}`);
verifier(
  "sans entité mal échappée",
  !/&amp;apos;|d&apos;un mois/.test(docInterimaire.corps?.html ?? ""),
  "texte cassé détecté"
);

const pageEntreprise = await appel(`/missions/${missionId}`, "GET", undefined, ent.cookie);
verifier("l'entreprise ouvre sa fiche pourvue", pageEntreprise.statut === 200, `statut ${pageEntreprise.statut}`);
const vuEntreprise = pageEntreprise.corps?.html ?? "";
verifier("elle sait qui vient", /Qui vient sur le chantier/.test(vuEntreprise));
verifier("avec de quoi le joindre", /Téléphone|Adresse e-mail/.test(vuEntreprise));

const contratApres = await appel(`/missions/${missionId}/contrat`, "GET", undefined, ent.cookie);
verifier("le document de mission côté entreprise s'ouvre", contratApres.statut === 200, `statut ${contratApres.statut}`);

// ===========================================================================
titre("Ménage");
// ===========================================================================
for (const c of comptes) {
  const r = await appel("/api/compte", "DELETE", { motDePasse: c.motDePasse }, c.cookie);
  if (r.statut !== 200) console.log(`  note  compte non supprimé : ${c.email} (statut ${r.statut})`);
}
console.log(`  ok   ${comptes.length} comptes d'essai supprimés`);

console.log(`\n${echecs === 0 ? "\x1b[32mParcours complet : tout est vert.\x1b[0m" : `\x1b[31m${echecs} vérification(s) en échec.\x1b[0m`}`);
process.exit(echecs === 0 ? 0 : 1);
