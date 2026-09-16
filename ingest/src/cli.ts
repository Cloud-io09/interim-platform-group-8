#!/usr/bin/env node
import { Command } from "commander";
import { connexion } from "@interimatch/core/db";
import {
  DOMAINES_TERRAIN,
  LIBELLE_DOMAINE,
  nettoyerLot,
  type OffreBrute,
  type OffreNettoyee,
} from "@interimatch/core";
import { getAccessToken, getReferentiel } from "interimatch-secteur-scan/client";
import { CHEMIN_BRUT, CHEMIN_NETTOYE, ecrire, lire } from "./cache";

const URL_RECHERCHE = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
/** L'API plafonne à 150 résultats par appel, et impose un throttle. */
const TAILLE_PAGE = 150;
const THROTTLE_MS = 140;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nombre = (n: number) => n.toLocaleString("fr-FR");

const program = new Command();
program.name("ingest").description("Pipeline d'ingestion France Travail pour InterimMatch");

// ---------------------------------------------------------------------------

program
  .command("seed-metiers")
  .description("Sème le référentiel métiers depuis l'API, limité aux métiers de terrain")
  .option("--dry-run", "affiche ce qui serait écrit sans toucher à la base")
  .action(async (opts: { dryRun?: boolean }) => {
    process.stderr.write("Récupération du référentiel ROME...\n");
    const tous = await getReferentiel("metiers");

    // Le code d'un métier ROME est de la forme F1703 : ses trois premiers caractères
    // sont le sous-domaine. F11 (conception) et F12 (encadrement) sont hors périmètre.
    const retenus = tous
      .filter((m) => DOMAINES_TERRAIN.some((d) => m.code.startsWith(d)))
      .map((m) => ({ code: m.code, libelle: m.libelle, rome_code: m.code, domaine: m.code.slice(0, 3) }))
      .sort((a, b) => a.code.localeCompare(b.code));

    console.log(`\n${tous.length} métiers au référentiel, ${retenus.length} retenus :`);
    for (const d of DOMAINES_TERRAIN) {
      const n = retenus.filter((m) => m.domaine === d).length;
      console.log(`  ${d}  ${String(n).padStart(3)} métiers  ${LIBELLE_DOMAINE[d]}`);
    }
    if (opts.dryRun) return void console.log("\n--dry-run : rien n'a été écrit.");

    const sql = connexion();
    try {
      await sql`
        insert into metier ${sql(retenus, "code", "libelle", "rome_code", "domaine")}
        on conflict (code) do update
          set libelle = excluded.libelle, domaine = excluded.domaine, actif = true`;
      const codes = retenus.map((m) => m.code);
      const desactives = await sql<{ code: string }[]>`
        update metier set actif = false where code <> all(${codes}) and actif returning code`;
      const [total] = await sql<{ n: number }[]>`select count(*)::int n from metier where actif`;
      console.log(`\n${total?.n} métiers actifs en base.`);
      if (desactives.length > 0) console.log(`${desactives.length} désactivé(s).`);
    } finally {
      await sql.end();
    }
  });

// ---------------------------------------------------------------------------

program
  .command("fetch")
  .description("Collecte les missions d'intérim BTP et les met en cache disque")
  .option("-d, --domaine <codes...>", "domaines ROME à collecter", [...DOMAINES_TERRAIN])
  .option("-m, --max <n>", "plafond d'offres par domaine", "600")
  .action(async (opts: { domaine: string[]; max: string }) => {
    const plafond = Number(opts.max);
    const jeton = await getAccessToken();
    const offres: OffreBrute[] = [];

    for (const domaine of opts.domaine) {
      let collectees = 0;
      for (let debut = 0; debut < plafond; debut += TAILLE_PAGE) {
        const url = new URL(URL_RECHERCHE);
        url.searchParams.set("domaine", domaine);
        // Seules les missions d'intérim nous intéressent : c'est le gisement du produit.
        url.searchParams.set("typeContrat", "MIS");
        url.searchParams.set("range", `${debut}-${Math.min(debut + TAILLE_PAGE, plafond) - 1}`);

        const reponse = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` } });
        await dormir(THROTTLE_MS);

        // 206 est la réponse normale de cette API en pagination ; 204 signale la fin.
        if (reponse.status === 204) break;
        if (!reponse.ok && reponse.status !== 206) {
          process.stderr.write(`  ${domaine} ${debut} -> HTTP ${reponse.status}, on passe\n`);
          break;
        }
        const lot = ((await reponse.json()) as { resultats?: OffreBrute[] }).resultats ?? [];
        if (lot.length === 0) break;
        offres.push(...lot);
        collectees += lot.length;
      }
      process.stderr.write(`  ${domaine} ${LIBELLE_DOMAINE[domaine] ?? ""} : ${collectees} offres\n`);
    }

    ecrire(CHEMIN_BRUT, { collecteLe: new Date().toISOString(), offres });
    console.log(`\n${nombre(offres.length)} offres brutes en cache : ${CHEMIN_BRUT}`);
  });

// ---------------------------------------------------------------------------

program
  .command("clean")
  .description("Nettoie, normalise et déduplique le cache brut, hors ligne")
  .action(async () => {
    const { collecteLe, offres } = lire<{ collecteLe: string; offres: OffreBrute[] }>(
      CHEMIN_BRUT,
      "npm run ingest -- fetch"
    );
    const { retenues, bilan } = nettoyerLot(offres);

    console.log(`Collecte du ${new Date(collecteLe).toLocaleString("fr-FR")}\n`);
    console.log(`${nombre(offres.length)} offres brutes`);
    for (const [motif, n] of Object.entries(bilan).filter(([m]) => m !== "retenues")) {
      console.log(`  écartées — ${motif.padEnd(22)} ${String(n).padStart(5)}`);
    }
    console.log(`  RETENUES ${" ".repeat(23)}${String(bilan.retenues).padStart(5)}`);

    const avecSalaire = retenues.filter((o) => o.tauxHoraireMin !== null).length;
    const avecGeo = retenues.filter((o) => o.lat !== null).length;
    const avecCertif = retenues.filter((o) => o.certifications.length > 0).length;
    console.log(`\nSur les offres retenues :`);
    console.log(`  rémunération exploitable : ${avecSalaire} (${Math.round((avecSalaire / retenues.length) * 100)} %)`);
    console.log(`  coordonnées présentes    : ${avecGeo} (${Math.round((avecGeo / retenues.length) * 100)} %)`);
    console.log(`  certification détectée   : ${avecCertif} (${Math.round((avecCertif / retenues.length) * 100)} %)`);

    ecrire(CHEMIN_NETTOYE, { collecteLe, nettoyeLe: new Date().toISOString(), offres: retenues, bilan });
    console.log(`\nÉcrit dans ${CHEMIN_NETTOYE}`);
  });

// ---------------------------------------------------------------------------

program
  .command("load")
  .description("Charge les offres nettoyées en base")
  .action(async () => {
    const { offres } = lire<{ offres: OffreNettoyee[] }>(CHEMIN_NETTOYE, "npm run ingest -- clean");
    const sql = connexion();
    try {
      const metiers = await sql<{ code: string }[]>`select code from metier where actif`;
      const connus = new Set(metiers.map((m) => m.code));

      // Les compétences arrivent avec les offres : on complète le référentiel au fil
      // de l'eau plutôt que d'écarter une offre parce qu'une compétence est nouvelle.
      const competences = new Map<string, string>();
      for (const o of offres) for (const c of o.competences) competences.set(c.code, c.libelle);
      if (competences.size > 0) {
        const lignes = [...competences].map(([code, libelle]) => ({ code, libelle }));
        await sql`insert into competence ${sql(lignes, "code", "libelle")}
                  on conflict (code) do update set libelle = excluded.libelle`;
      }

      /**
       * Insertions groupées plutôt qu'une transaction par offre.
       *
       * Une transaction par offre, c'est trois allers-retours par ligne à travers le
       * pooler : sur 1 800 offres, plusieurs minutes. Par lots de 200, le même
       * chargement tient en quelques secondes. Le facteur limitant est le nombre de
       * requêtes réseau, pas le volume de données.
       */
      const TAILLE_LOT = 200;
      const parLots = <T,>(liste: T[]): T[][] => {
        const lots: T[][] = [];
        for (let i = 0; i < liste.length; i += TAILLE_LOT) lots.push(liste.slice(i, i + TAILLE_LOT));
        return lots;
      };

      const lignesOffres = offres.map((o) => ({
        id_ft: o.idFt,
        intitule_brut: o.intituleBrut,
        intitule_normalise: o.intituleNormalise,
        metier_code: connus.has(o.romeCode) ? o.romeCode : null,
        rome_code: o.romeCode,
        code_postal: o.codePostal,
        commune_code: o.communeCode,
        departement: o.departement,
        lat: o.lat,
        lon: o.lon,
        taux_horaire_min: o.tauxHoraireMin,
        taux_horaire_max: o.tauxHoraireMax,
        date_creation_ft: o.dateCreationFt,
        empreinte: o.empreinte,
      }));

      for (const lot of parLots(lignesOffres)) {
        await sql`
          insert into offre_ft ${sql(
            lot, "id_ft", "intitule_brut", "intitule_normalise", "metier_code", "rome_code",
            "code_postal", "commune_code", "departement", "lat", "lon",
            "taux_horaire_min", "taux_horaire_max", "date_creation_ft", "empreinte"
          )}
          on conflict (id_ft) do update set
            intitule_normalise = excluded.intitule_normalise,
            taux_horaire_min = excluded.taux_horaire_min,
            taux_horaire_max = excluded.taux_horaire_max,
            ingere_le = now()`;
      }

      // Les liaisons sont remplacées en bloc : une offre republiée peut avoir changé
      // d'exigences, et un ajout seul laisserait traîner les anciennes.
      const ids = offres.map((o) => o.idFt);
      for (const lot of parLots(ids)) {
        await sql`delete from offre_ft_certification where offre_id = any(${lot})`;
        await sql`delete from offre_ft_competence where offre_id = any(${lot})`;
      }

      const liensCertif = offres.flatMap((o) =>
        o.certifications.map((type_code) => ({ offre_id: o.idFt, type_code }))
      );
      for (const lot of parLots(liensCertif)) {
        await sql`insert into offre_ft_certification ${sql(lot, "offre_id", "type_code")}
                  on conflict do nothing`;
      }

      const liensCompetence = offres.flatMap((o) =>
        o.competences.map((c) => ({ offre_id: o.idFt, competence_code: c.code }))
      );
      for (const lot of parLots(liensCompetence)) {
        await sql`insert into offre_ft_competence ${sql(lot, "offre_id", "competence_code")}
                  on conflict do nothing`;
      }

      const chargees = offres.length;
      const [total] = await sql<{ n: number }[]>`select count(*)::int n from offre_ft`;
      console.log(`${nombre(chargees)} offres chargées. ${nombre(total?.n ?? 0)} en base au total.`);
    } finally {
      await sql.end();
    }
  });

// ---------------------------------------------------------------------------

program
  .command("stats")
  .description("Agrégats de contrôle sur les offres chargées")
  .action(async () => {
    const sql = connexion();
    try {
      const parDomaine = await sql<{ domaine: string; n: number; median: number | null }[]>`
        select m.domaine,
               count(*)::int as n,
               percentile_cont(0.5) within group (
                 order by (o.taux_horaire_min + o.taux_horaire_max) / 2
               )::numeric(6,2) as median
        from offre_ft o join metier m on m.code = o.metier_code
        group by m.domaine order by m.domaine`;

      console.log("Par domaine :");
      for (const d of parDomaine) {
        const taux = d.median === null ? "—" : `${Number(d.median).toFixed(2)} €/h`;
        console.log(`  ${d.domaine}  ${String(d.n).padStart(5)} offres   médiane ${taux.padStart(10)}   ${LIBELLE_DOMAINE[d.domaine] ?? ""}`);
      }

      const parCertif = await sql<{ type_code: string; n: number }[]>`
        select type_code, count(*)::int n from offre_ft_certification
        group by type_code order by n desc`;
      console.log("\nCertifications citées :");
      for (const c of parCertif) console.log(`  ${c.type_code.padEnd(14)} ${String(c.n).padStart(5)} offres`);
    } finally {
      await sql.end();
    }
  });

program.parseAsync(process.argv);
