#!/usr/bin/env node
/**
 * Runner de migrations SQL. Applique dans l'ordre les fichiers de core/migrations
 * qui n'ont pas encore été joués, en les enregistrant dans schema_migrations.
 *
 *   npm run migrate            applique les migrations en attente
 *   npm run migrate -- --liste montre l'état sans rien appliquer
 */
import "../src/env";
import { Command } from "commander";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connexion } from "../src/db";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

interface Migration {
  nom: string;
  sql: string;
  empreinte: string;
}

function lireMigrations(): Migration[] {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((nom) => {
      const sql = readFileSync(join(DOSSIER, nom), "utf-8");
      return { nom, sql, empreinte: createHash("sha256").update(sql).digest("hex").slice(0, 16) };
    });
}

const program = new Command();
program
  .name("migrate")
  .description("Applique les migrations SQL d'InterimMatch")
  .option("--liste", "affiche l'état des migrations sans rien appliquer")
  .action(async (opts: { liste?: boolean }) => {
    const sql = connexion();
    try {
      await sql`
        create table if not exists schema_migrations (
          nom         text primary key,
          empreinte   text        not null,
          applique_le timestamptz not null default now()
        )`;

      const appliquees = await sql<{ nom: string; empreinte: string }[]>`
        select nom, empreinte from schema_migrations`;
      const dejaJouees = new Map(appliquees.map((m) => [m.nom, m.empreinte]));
      const migrations = lireMigrations();

      if (opts.liste) {
        for (const m of migrations) {
          const connue = dejaJouees.get(m.nom);
          const etat = connue === undefined ? "en attente"
            : connue === m.empreinte ? "appliquée"
            : "MODIFIÉE APRÈS APPLICATION";
          console.log(`  ${m.nom.padEnd(34)} ${etat}`);
        }
        return;
      }

      let jouees = 0;
      for (const m of migrations) {
        const connue = dejaJouees.get(m.nom);
        if (connue === m.empreinte) continue;
        if (connue !== undefined) {
          throw new Error(
            `${m.nom} a déjà été appliquée puis modifiée. Créer une nouvelle migration ` +
            `plutôt que de réécrire celle-ci.`
          );
        }
        process.stderr.write(`→ ${m.nom}\n`);
        // Chaque migration est jouée dans sa propre transaction : un échec au milieu
        // ne laisse pas un schéma à moitié appliqué.
        await sql.begin(async (tx) => {
          await tx.unsafe(m.sql);
          await tx`insert into schema_migrations (nom, empreinte) values (${m.nom}, ${m.empreinte})`;
        });
        jouees++;
      }
      console.log(jouees === 0 ? "Schéma déjà à jour." : `${jouees} migration(s) appliquée(s).`);
    } finally {
      await sql.end();
    }
  });

program.parseAsync(process.argv);
