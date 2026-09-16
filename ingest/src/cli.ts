#!/usr/bin/env node
import "@interimatch/core";
import { Command } from "commander";
import { connexion } from "@interimatch/core/db";
import { DOMAINES_TERRAIN, LIBELLE_DOMAINE } from "@interimatch/core";
import { getReferentiel } from "interimatch-secteur-scan/client";

const program = new Command();
program
  .name("ingest")
  .description("Pipeline d'ingestion France Travail pour InterimMatch");

program
  .command("seed-metiers")
  .description("Sème le référentiel métiers depuis l'API France Travail, limité aux métiers de terrain")
  .option("--dry-run", "affiche ce qui serait écrit sans toucher à la base")
  .action(async (opts: { dryRun?: boolean }) => {
    process.stderr.write("Récupération du référentiel ROME...\n");
    const tous = await getReferentiel("metiers");

    // Le code d'un métier ROME est de la forme F1703 : ses trois premiers caractères
    // sont le sous-domaine. F11 (conception) et F12 (encadrement) sont hors périmètre
    // produit — ils n'entrent pas en base, ce n'est pas un filtre d'affichage.
    const retenus = tous
      .filter((m) => DOMAINES_TERRAIN.some((d) => m.code.startsWith(d)))
      .map((m) => ({
        code: m.code,
        libelle: m.libelle,
        rome_code: m.code,
        domaine: m.code.slice(0, 3),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const parDomaine = new Map<string, number>();
    for (const m of retenus) parDomaine.set(m.domaine, (parDomaine.get(m.domaine) ?? 0) + 1);

    console.log(`\n${tous.length} métiers au référentiel, ${retenus.length} retenus :`);
    for (const d of DOMAINES_TERRAIN) {
      console.log(`  ${d}  ${String(parDomaine.get(d) ?? 0).padStart(3)} métiers  ${LIBELLE_DOMAINE[d]}`);
    }

    if (opts.dryRun) {
      console.log("\n--dry-run : rien n'a été écrit.");
      retenus.slice(0, 8).forEach((m) => console.log(`  ${m.code}  ${m.libelle}`));
      console.log(`  … et ${retenus.length - 8} autres`);
      return;
    }

    const sql = connexion();
    try {
      // Réexécutable : on met à jour les libellés plutôt que de dupliquer, et on
      // désactive les métiers disparus du référentiel sans casser les profils qui
      // les référencent encore.
      await sql`
        insert into metier ${sql(retenus, "code", "libelle", "rome_code", "domaine")}
        on conflict (code) do update
          set libelle = excluded.libelle, domaine = excluded.domaine, actif = true`;

      const codes = retenus.map((m) => m.code);
      const desactives = await sql<{ code: string }[]>`
        update metier set actif = false where code <> all(${codes}) and actif returning code`;

      const [total] = await sql<{ n: number }[]>`select count(*)::int n from metier where actif`;
      console.log(`\n${total?.n} métiers actifs en base.`);
      if (desactives.length > 0) {
        console.log(`${desactives.length} désactivé(s) : ${desactives.map((d) => d.code).join(", ")}`);
      }
    } finally {
      await sql.end();
    }
  });

program.parseAsync(process.argv);
