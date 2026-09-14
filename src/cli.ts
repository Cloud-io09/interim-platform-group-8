#!/usr/bin/env node
import { Command } from "commander";
import { mkdirSync, writeFileSync } from "node:fs";
import { searchOffres, search, getReferentiel } from "./franceTravailClient.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_SECTEURS = ["restauration", "BTP", "logistique", "santé", "événementiel"];

interface SecteurStats {
  secteur: string;
  totalOffres: number;
  totalMission: number;
  partMission: number;
  intitulesEchantillon: string[];
}

const program = new Command();

program
  .name("secteur-scan")
  .description("Compare la volumétrie d'offres France Travail par secteur, pour trancher le choix du secteur InterimMatch");

program
  .command("compare")
  .description("Interroge l'API France Travail pour une liste de secteurs et sort un comparatif")
  .option(
    "-s, --secteur <mots-cles>",
    "mot-clé de secteur à tester (répétable, ex: -s restauration -s BTP)",
    (value: string, previous: string[]) => previous.concat([value]),
    [] as string[]
  )
  .action(async (opts: { secteur: string[] }) => {
    const secteurs = opts.secteur.length > 0 ? opts.secteur : DEFAULT_SECTEURS;
    const stats: SecteurStats[] = [];

    for (const secteur of secteurs) {
      process.stderr.write(`Scan "${secteur}"...\n`);

      const globalRes = await searchOffres(secteur, "0-19");
      const missionRes = await searchOffres(secteur, "0-0", { typeContrat: "MIS" });

      const total = globalRes.total;
      const totalMission = missionRes.total;

      stats.push({
        secteur: secteur,
        totalOffres: total,
        totalMission: totalMission,
        partMission: total > 0 ? Math.round((totalMission / total) * 100) : 0,
        intitulesEchantillon: [...new Set(globalRes.offres.map((o) => o.intitule))].slice(0, 5),
      });
    }

    console.table(
      stats.map((s) => ({
        secteur: s.secteur,
        "total offres": s.totalOffres,
        "dont mission (MIS)": s.totalMission,
        "% mission": `${s.partMission}%`,
      }))
    );

    stats.forEach((s) => {
      console.log(`\n${s.secteur} — exemples d'intitulés:`);
      s.intitulesEchantillon.forEach((i) => console.log(`  - ${i}`));
    });

    mkdirSync("reports", { recursive: true });
    const outPath = `reports/secteur-scan-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(outPath, JSON.stringify(stats, null, 2), "utf-8");
    console.log(`\nRapport écrit dans ${outPath}`);
  });

program
  .command("scan-all")
  .description("Scanne l'intégralité des secteurs NAF du référentiel officiel de l'API")
  .option("-l, --limit <n>", "ne garder que les N premiers secteurs (debug rapide)", "0")
  .action(async (opts: { limit: string }) => {
    process.stderr.write("Récupération du référentiel secteursActivites...\n");
    let secteurs = await getReferentiel("secteursActivites");
    const limit = Number(opts.limit);
    if (limit > 0) secteurs = secteurs.slice(0, limit);

    const THROTTLE_MS = 130;
    process.stderr.write(`${secteurs.length} secteurs à scanner...\n`);

    const stats: SecteurStats[] = [];
    for (const secteur of secteurs) {
      const globalRes = await search({ secteurActivite: secteur.code, range: "0-0" });
      await sleep(THROTTLE_MS);
      const missionRes = await search({ secteurActivite: secteur.code, range: "0-0", typeContrat: "MIS" });
      await sleep(THROTTLE_MS);

      const total = globalRes.total;
      const totalMission = missionRes.total;
      stats.push({
        secteur: `${secteur.code} — ${secteur.libelle}`,
        totalOffres: total,
        totalMission: totalMission,
        partMission: total > 0 ? Math.round((totalMission / total) * 100) : 0,
        intitulesEchantillon: [],
      });
      process.stderr.write(`  ${secteur.code} ${secteur.libelle}: ${total} offres, ${totalMission} mission\n`);
    }

    const sorted = [...stats].sort((a, b) => b.totalMission - a.totalMission);
    console.table(
      sorted.slice(0, 20).map((s) => ({
        secteur: s.secteur,
        "total offres": s.totalOffres,
        "dont mission": s.totalMission,
        "% mission": `${s.partMission}%`,
      }))
    );

    mkdirSync("reports", { recursive: true });
    const outPath = `reports/secteur-scan-all-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(outPath, JSON.stringify(stats, null, 2), "utf-8");
    console.log(`Rapport complet écrit dans ${outPath}`);
  });

const DOMAIN_REFERENTIELS: Array<{ type: string; param: string }> = [
  { type: "grandsDomaines", param: "grandDomaine" },
  { type: "domaines", param: "domaine" },
];

async function getDomainReferentiel(): Promise<{
  items: { code: string; libelle: string }[];
  param: string;
  type: string;
}> {
  let lastErr: unknown;
  for (const { type, param } of DOMAIN_REFERENTIELS) {
    try {
      const items = await getReferentiel(type);
      return { items: items, param: param, type: type };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

interface GrandDomaineAgg {
  lettre: string;
  totalOffres: number;
  totalMission: number;
  partMission: number;
  exemples: string[];
}

interface GrandDomaineGroup {
  totalOffres: number;
  totalMission: number;
  domaines: { libelle: string; total: number }[];
}

function aggregateByGrandDomaine(stats: SecteurStats[]): GrandDomaineAgg[] {
  const groups = new Map<string, GrandDomaineGroup>();

  for (const s of stats) {
    const parts = s.secteur.split(" — ");
    const code = parts[0];
    const libelle = parts.slice(1).join(" — ");
    const lettre = code.trim().charAt(0);
    const existing = groups.get(lettre);
    const g: GrandDomaineGroup = existing || { totalOffres: 0, totalMission: 0, domaines: [] };
    g.totalOffres += s.totalOffres;
    g.totalMission += s.totalMission;
    g.domaines.push({ libelle: libelle, total: s.totalOffres });
    groups.set(lettre, g);
  }

  const result: GrandDomaineAgg[] = [];
  groups.forEach((g, lettre) => {
    const sortedDomaines = g.domaines.slice().sort((a, b) => b.total - a.total);
    result.push({
      lettre: lettre,
      totalOffres: g.totalOffres,
      totalMission: g.totalMission,
      partMission: g.totalOffres > 0 ? Math.round((g.totalMission / g.totalOffres) * 100) : 0,
      exemples: sortedDomaines.slice(0, 2).map((d) => d.libelle),
    });
  });

  result.sort((a, b) => b.totalMission - a.totalMission);
  return result;
}

program
  .command("scan-domaines")
  .description("Scanne le référentiel de domaines ROME, agrège par grand domaine")
  .option(
    "-p, --prefix <lettres>",
    "ne scanner que les domaines dont le code commence par ces lettres (ex: -p N)",
    (value: string, previous: string[]) => previous.concat([value.toUpperCase()]),
    [] as string[]
  )
  .action(async (opts: { prefix: string[] }) => {
    process.stderr.write("Récupération du référentiel de domaines...\n");
    const referentiel = await getDomainReferentiel();
    const allItems = referentiel.items;
    const param = referentiel.param;
    const type = referentiel.type;
    const items = opts.prefix.length > 0
      ? allItems.filter((d) => opts.prefix.indexOf(d.code.charAt(0)) !== -1)
      : allItems;
    process.stderr.write("Référentiel: " + type + ", " + items.length + "/" + allItems.length + " domaines, filtre: " + param + "\n");

    const THROTTLE_MS = 130;
    const stats: SecteurStats[] = [];
    for (let i = 0; i < items.length; i++) {
      const domaine = items[i];
      const missionParams: Record<string, string> = {};
      missionParams[param] = domaine.code;
      missionParams["range"] = "0-0";
      missionParams["typeContrat"] = "MIS";
      const missionRes = await search(missionParams);
      await sleep(THROTTLE_MS);

      const totalParams: Record<string, string> = {};
      totalParams[param] = domaine.code;
      totalParams["range"] = "0-0";
      const totalRes = await search(totalParams);
      await sleep(THROTTLE_MS);

      stats.push({
        secteur: `${domaine.code} — ${domaine.libelle}`,
        totalOffres: totalRes.total,
        totalMission: missionRes.total,
        partMission: totalRes.total > 0 ? Math.round((missionRes.total / totalRes.total) * 100) : 0,
        intitulesEchantillon: [],
      });

      if ((i + 1) % 10 === 0 || i === items.length - 1) {
        process.stderr.write(`  ${i + 1}/${items.length} domaines scannés...\n`);
      }
    }

    const aggregated = aggregateByGrandDomaine(stats);
    console.table(
      aggregated.map((g) => ({
        "grand domaine": g.lettre,
        "total offres": g.totalOffres,
        "dont mission": g.totalMission,
        "% mission": `${g.partMission}%`,
        exemples: g.exemples.join(", "),
      }))
    );

    mkdirSync("reports", { recursive: true });
    const outPath = `reports/domaine-scan-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(outPath, JSON.stringify({ aggregated: aggregated, detail: stats }, null, 2), "utf-8");
    console.log(`\nDétail complet (${stats.length} domaines) + agrégat écrits dans ${outPath}`);
  });

program.parseAsync(process.argv);
