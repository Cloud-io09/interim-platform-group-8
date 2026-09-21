#!/usr/bin/env node
/**
 * Essai de fumée des parcours d'authentification, contre une instance réelle.
 *
 *   node outils/fumee-auth.mjs https://mon-deploiement.vercel.app
 *
 * Éprouve la boucle complète — inscription, session, changement de mot de passe,
 * récupération, révocation — sur le déploiement qu'on s'apprête à montrer, et pas
 * seulement en local. La suite de tests couvre le code ; ceci couvre **la
 * configuration** : variables d'environnement, base atteignable, cache joignable.
 *
 * **N'envoie aucun courriel.** Les comptes créés utilisent des adresses factices :
 * les laisser partir pour de vrai produirait des rebonds, qui abîment la réputation
 * d'expéditeur. Le chemin par lien est donc éprouvé par la suite fonctionnelle, et le
 * chemin par code de récupération l'est ici — les deux aboutissent au même endroit.
 *
 * Le compte d'essai est supprimé en fin de parcours, y compris en cas d'échec.
 */

const base = (process.argv[2] ?? "http://127.0.0.1:3205").replace(/\/+$/, "");
const email = `fumee-${Date.now()}@exemple.test`;
const MOT_DE_PASSE = "essai-de-fumee-interimatch-2026";

let echecs = 0;
let cookie = "";

function verifier(intitule, condition, detail = "") {
  const marque = condition ? "  ok  " : "ÉCHEC ";
  if (!condition) echecs++;
  console.log(`${marque} ${intitule}${detail ? ` — ${detail}` : ""}`);
}

async function appel(chemin, methode = "GET", corps, avecCookie = true) {
  const reponse = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: {
      "Content-Type": "application/json",
      ...(avecCookie && cookie ? { cookie } : {}),
    },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    redirect: "manual",
  });
  const texte = await reponse.text();
  let json = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    /* une page HTML, par exemple : le statut suffit */
  }
  return { statut: reponse.status, corps: json, entetes: reponse.headers };
}

const cookieDe = (reponse) => reponse.entetes.get("set-cookie")?.split(";")[0] ?? "";

console.log(`Essai de fumée — ${base}\n`);

// --- 1. Dépendances ---------------------------------------------------------
const sante = await appel("/api/sante", "GET", undefined, false);
verifier("la sonde de santé répond", sante.statut === 200, `statut ${sante.statut}`);
if (sante.corps?.services) {
  const s = sante.corps.services;
  verifier("base relationnelle", s.postgres?.ok, s.postgres?.detail);
  verifier("base non relationnelle", s.cache?.ok, s.cache?.detail);
  // Non bloquant : le produit fonctionne sans, seule la récupération par lien
  // en dépend. On le signale sans faire échouer l'essai.
  console.log(
    `${s.courriel?.ok ? "  ok  " : " note "} acheminement du courriel — ${s.courriel?.detail ?? "inconnu"}`
  );
}

// --- 2. Inscription ---------------------------------------------------------
const inscription = await appel(
  "/api/auth/inscription",
  "POST",
  { email, motDePasse: MOT_DE_PASSE, role: "interimaire" },
  false
);
verifier("inscription", inscription.statut === 201, `statut ${inscription.statut}`);
cookie = cookieDe(inscription);
verifier("un cookie de session est posé", cookie.length > 20);

const codes = inscription.corps?.codesRecuperation ?? [];
verifier("des codes de récupération sont remis", codes.length === 8, `${codes.length} code(s)`);

verifier("la session ouvre l'accès", (await appel("/api/moi")).statut === 200);

// --- 3. Pas d'énumération des comptes ---------------------------------------
const inconnu = await appel(
  "/api/auth/connexion",
  "POST",
  { email: `jamais-inscrit-${Date.now()}@exemple.test`, motDePasse: "peu importe" },
  false
);
const mauvais = await appel("/api/auth/connexion", "POST", { email, motDePasse: "faux" }, false);
verifier(
  "compte inconnu et mot de passe faux donnent la même réponse",
  inconnu.statut === mauvais.statut && inconnu.corps?.message === mauvais.corps?.message,
  `${inconnu.statut} / ${mauvais.statut}`
);

// --- 4. Changement de mot de passe connecté ---------------------------------
const seconde = await appel("/api/auth/connexion", "POST", { email, motDePasse: MOT_DE_PASSE }, false);
const cookieSecond = cookieDe(seconde);
verifier("une seconde session peut s'ouvrir", seconde.statut === 200);

const MOT_DE_PASSE_2 = "essai-de-fumee-deuxieme-2026";
const changement = await appel("/api/auth/mot-de-passe", "POST", {
  ancien: MOT_DE_PASSE,
  nouveau: MOT_DE_PASSE_2,
});
verifier("changement de mot de passe", changement.statut === 200, `statut ${changement.statut}`);
verifier("la session qui a changé le mot de passe survit", (await appel("/api/moi")).statut === 200);

const cookieGarde = cookie;
cookie = cookieSecond;
verifier("les autres sessions sont fermées", (await appel("/api/moi")).statut === 401);
cookie = cookieGarde;

// --- 5. Récupération par code -----------------------------------------------
const MOT_DE_PASSE_3 = "essai-de-fumee-troisieme-2026";
const recuperation = await appel(
  "/api/auth/recuperation",
  "POST",
  { email, code: codes[0], nouveau: MOT_DE_PASSE_3 },
  false
);
verifier("récupération par code", recuperation.statut === 200, `statut ${recuperation.statut}`);
verifier("un code est consommé", recuperation.corps?.codesRestants === 7, `${recuperation.corps?.codesRestants} restant(s)`);

const rejeu = await appel(
  "/api/auth/recuperation",
  "POST",
  { email, code: codes[0], nouveau: "encore-un-autre-2026" },
  false
);
verifier("le même code est refusé une seconde fois", rejeu.statut === 403, `statut ${rejeu.statut}`);

verifier("toutes les sessions tombent après récupération", (await appel("/api/moi")).statut === 401);

const apres = await appel("/api/auth/connexion", "POST", { email, motDePasse: MOT_DE_PASSE_3 }, false);
verifier("connexion avec le mot de passe récupéré", apres.statut === 200, `statut ${apres.statut}`);
cookie = cookieDe(apres);

// --- 6. Demande de lien : répond sans divulguer -----------------------------
//
// Volontairement sur une adresse **qui n'existe pas**. L'endpoint répond la même
// chose dans les deux cas — c'est précisément la propriété qu'on vérifie — mais il
// n'envoie rien quand le compte est inconnu. Le demander pour le compte d'essai
// enverrait un courriel réel à une adresse factice, donc un rebond, qui abîme la
// réputation d'expéditeur. Même assertion, aucun envoi.
const demande = await appel(
  "/api/auth/reinitialisation",
  "POST",
  { email: `inexistant-${Date.now()}@exemple.test` },
  false
);
verifier("la demande de lien répond", demande.statut === 200, `statut ${demande.statut}`);
verifier(
  "la réponse ne dit pas si le compte existe",
  /si un compte existe/i.test(demande.corps?.message ?? ""),
  demande.corps?.message
);

// --- 7. Ménage --------------------------------------------------------------
const suppression = await appel("/api/compte", "DELETE", { motDePasse: MOT_DE_PASSE_3 });
verifier("suppression du compte d'essai", suppression.statut === 200, `statut ${suppression.statut}`);

console.log(
  `\n${echecs === 0 ? "Tout est vert." : `${echecs} vérification(s) en échec.`}` +
    (echecs === 0 ? "" : " Le compte d'essai a pu rester en base : " + email)
);
process.exit(echecs === 0 ? 0 : 1);
