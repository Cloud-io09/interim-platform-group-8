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

/**
 * Le code sans ses commentaires.
 *
 * Sans ça, l'outil se méfiait de sa propre documentation : un commentaire qui
 * explique « un `<p>` dans un `<span>` est interdit » contient littéralement les
 * deux balises, et l'analyse le signalait comme un défaut. Un contrôle qui accuse
 * la prose qui l'explique ne sera pas cru longtemps.
 */
function sansCommentaires(texte) {
  return texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

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

// --- 4. Balisage impossible : un bloc dans un élément en ligne ----------------
//
// Un `<p>` placé dans un `<span>` est interdit par HTML : le navigateur sort le
// paragraphe du conteneur, et ce qui devait s'aligner à côté se retrouve ailleurs.
// C'est la cause du « texte qui se balade » signalé sur trois écrans — et elle ne
// se voit ni à la relecture du code, ni dans un test qui ne lit que des chaînes.
const imbrications = [];
for (const f of sources) {
  const texte = sansCommentaires(readFileSync(f, "utf8"));
  for (const m of texte.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)) {
    // Le contenu d'une balise en ligne ne peut porter que des balises en ligne.
    const bloc = /<(p|div|ul|ol|section|h[1-6])\b/.exec(m[1]);
    if (bloc) {
      imbrications.push(`${f}:${texte.slice(0, m.index).split("\n").length} — <${bloc[1]}> dans <span>`);
    }
  }
}
signaler("aucun bloc placé dans un élément en ligne", imbrications);

// --- 5. Espacements hors échelle ---------------------------------------------
//
// Seize valeurs distinctes circulaient sans rapport entre elles : c'est ce qui
// produit des éléments tantôt collés, tantôt trop écartés — chaque écran inventait
// sa mesure. L'échelle vit dans `globals.css`, et rien ne doit s'en écarter.
const ECHELLE = ["0.25rem", "0.5rem", "0.75rem", "1rem", "1.25rem", "1.5rem", "2rem", "3rem"];
const horsEchelle = [];
for (const f of sources) {
  const texte = readFileSync(f, "utf8");
  for (const m of texte.matchAll(/style=\{\{[^}]*\}\}/g)) {
    for (const v of m[0].matchAll(/(margin|padding|gap)[A-Za-z]*: "([^"]*)"/g)) {
      for (const mesure of v[2].match(/[0-9.]+rem/g) ?? []) {
        if (!ECHELLE.includes(mesure)) {
          horsEchelle.push(`${f}:${texte.slice(0, m.index).split("\n").length} — ${mesure}`);
        }
      }
    }
  }
}
signaler("aucun espacement hors de l'échelle", horsEchelle);

console.log(
  problemes === 0
    ? "\n\x1b[32mParcours : aucun défaut statique.\x1b[0m"
    : `\n${problemes} défaut(s) à traiter.`
);
process.exit(problemes === 0 ? 0 : 1);
