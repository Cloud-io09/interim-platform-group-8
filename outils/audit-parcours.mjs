#!/usr/bin/env node
/**
 * Audit statique du parcours : liens morts, entités mal placées, promesses de menu.
 *
 *   npm run audit
 *
 * **Pourquoi cet outil existe.** Les suites de tests vérifient qu'un écran répond,
 * pas qu'il mène quelque part. Un onglet intitulé « Profil & CV » pointant vers une
 * page sans CV, un lien vers une route supprimée, une entité HTML dans une chaîne
 * JavaScript : trois défauts que personne n'attrape en relisant du code, et que
 * l'utilisateur rencontre au premier clic. Ils se détectent pourtant sans navigateur.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = "web/app";
let problemes = 0;

function fichiers(dossier, filtre) {
  const sortie = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin, filtre));
    else if (filtre(entree)) sortie.push(chemin);
  }
  return sortie;
}

function signaler(titre, lignes) {
  if (lignes.length === 0) {
    console.log(`  ok   ${titre}`);
    return;
  }
  problemes += lignes.length;
  console.log(`ÉCHEC  ${titre} — ${lignes.length}`);
  for (const l of lignes) console.log(`       ${l}`);
}

// --- Les routes réellement servies -------------------------------------------
//
// Un groupe « (entreprise) » n'apparaît pas dans l'URL, un segment « [id] » accepte
// n'importe quelle valeur : on reconstitue les deux pour comparer des chemins
// comparables.
const routes = fichiers(RACINE, (f) => f === "page.tsx" || f === "route.ts").map((f) => {
  // La page racine n'a pas de dossier à retirer : « page.tsx » devient « / », pas
  // « /page.tsx ». Le séparateur est donc optionnel.
  const chemin = relative(RACINE, f).replace(/(^|[/\\])(page\.tsx|route\.ts)$/, "");
  return (
    "/" +
    chemin
      .split(/[/\\]/)
      .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")))
      .join("/")
  );
});
const motifs = routes.map((r) => new RegExp(`^${r.replace(/\[[^\]]+\]/g, "[^/]+")}/?$`));

const sources = [
  ...fichiers("web/app", (f) => f.endsWith(".tsx")),
  ...fichiers("web/components", (f) => f.endsWith(".tsx")),
];

// --- 1. Liens internes qui ne mènent nulle part -------------------------------
const morts = [];
for (const f of sources) {
  const texte = readFileSync(f, "utf8");
  for (const m of texte.matchAll(/href=(?:"(\/[^"#?]*)"|\{`(\/[^`$]*)`\})/g)) {
    const cible = (m[1] ?? m[2]).replace(/\/$/, "") || "/";
    if (!motifs.some((r) => r.test(cible))) {
      morts.push(`${f}:${texte.slice(0, m.index).split("\n").length} → ${cible}`);
    }
  }
}
signaler("aucun lien interne ne pointe vers une route inexistante", morts);

// --- 2. Entités HTML dans une chaîne JavaScript -------------------------------
//
// Dans du texte JSX, « &apos; » est correct et même exigé. Dans une chaîne entre
// guillemets, il s'affiche littéralement : « Durée de moins d&apos;un mois ».
const entites = [];
for (const f of sources) {
  const texte = readFileSync(f, "utf8");
  texte.split("\n").forEach((ligne, i) => {
    for (const m of ligne.matchAll(/"([^"<>]*&(?:apos|quot|amp|nbsp);[^"<>]*)"/g)) {
      entites.push(`${f}:${i + 1} — ${m[1].slice(0, 60)}`);
    }
  });
}
signaler("aucune entité HTML dans une chaîne JavaScript", entites);

// --- 3. Un intitulé de menu qui promet ce qu'il ne tient pas ------------------
//
// « Profil & CV » menait à une page sans CV. Un libellé composé annonce deux
// choses : la destination doit les porter toutes les deux.
const promesses = [];
for (const f of sources) {
  const texte = readFileSync(f, "utf8");
  for (const m of texte.matchAll(/href:\s*"([^"]+)",\s*libelle:\s*"([^"]+)"/g)) {
    const [, cible, libelle] = m;
    if (!/\s(&|et)\s/.test(libelle)) continue;
    const mots = libelle.split(/\s(?:&|et)\s/).map((x) => x.trim().toLowerCase());
    const manquants = mots.filter(
      (mot) => !cible.toLowerCase().includes(mot.replace(/^(mon|ma|mes)\s+/, ""))
    );
    if (manquants.length > 0) {
      promesses.push(`${f} — « ${libelle} » → ${cible} (absent : ${manquants.join(", ")})`);
    }
  }
}
signaler("aucun intitulé de menu ne promet une destination absente", promesses);

console.log(
  problemes === 0
    ? "\n\x1b[32mParcours : aucun défaut statique.\x1b[0m"
    : `\n${problemes} défaut(s) à traiter.`
);
process.exit(problemes === 0 ? 0 : 1);
