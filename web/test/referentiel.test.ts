import { describe, expect, it } from "vitest";
import { BASE } from "./serveur";

/**
 * Les trois référentiels servis à l'interface.
 *
 * **Les seules routes que la suite ne traversait pas.** Elles sont en lecture seule
 * et sans effet de bord, ce qui explique qu'on les ait laissées de côté — mais elles
 * alimentent trois choix de formulaire dont dépend tout le reste : un intérimaire ne
 * peut déclarer ni métier, ni compétence, ni habilitation sans elles. Une régression
 * ici viderait des listes déroulantes sans qu'aucun test ne bronche.
 *
 * Aucune n'est authentifiée : ce sont des nomenclatures publiques — ROME pour les
 * métiers, recommandations CNAM pour les habilitations.
 */

async function lire(chemin: string) {
  const r = await fetch(`${BASE}${chemin}`);
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : null };
}

describe("référentiel des métiers", () => {
  it("rend les métiers groupés par domaine", async () => {
    const r = await lire("/api/referentiel/metiers");
    expect(r.statut).toBe(200);
    expect(Array.isArray(r.corps.domaines)).toBe(true);
    expect(r.corps.domaines.length).toBeGreaterThan(0);
  });

  it("ne sert que des métiers de terrain", async () => {
    // Le périmètre est un choix produit : conception et encadrement recourent peu à
    // l'intérim. Les y voir signalerait un référentiel ré-importé sans filtre.
    const r = await lire("/api/referentiel/metiers");
    const libelles = JSON.stringify(r.corps.domaines).toLowerCase();
    expect(libelles).not.toMatch(/ingénieur d'étude|conducteur de travaux/);
  });

  it("porte des codes ROME exploitables", async () => {
    const r = await lire("/api/referentiel/metiers");
    const codes = JSON.stringify(r.corps.domaines).match(/"code":"([A-N]\d{4})"/g) ?? [];
    expect(codes.length).toBeGreaterThan(10);
  });
});

describe("référentiel des habilitations", () => {
  it("rend les types avec leur durée de validité", async () => {
    const r = await lire("/api/referentiel/certifications");
    expect(r.statut).toBe(200);
    const types = r.corps.types ?? [];
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) {
      expect(typeof t.code).toBe("string");
      // La durée est ce qui permet de calculer l'échéance à la saisie : sans elle,
      // le formulaire redemanderait une date que l'on sait déduire.
      expect(t.validiteMois).toBeGreaterThan(0);
    }
  });

  it("porte les durées réelles des recommandations CNAM", async () => {
    const r = await lire("/api/referentiel/certifications");
    const parCode = new Map(r.corps.types.map((t: { code: string }) => [t.code, t]));
    // Dix ans pour le R482, cinq pour les autres CACES, trois pour l'électrique.
    expect((parCode.get("CACES_R482") as { validiteMois: number }).validiteMois).toBe(120);
    expect((parCode.get("CACES_R490") as { validiteMois: number }).validiteMois).toBe(60);
    expect((parCode.get("HAB_ELEC") as { validiteMois: number }).validiteMois).toBe(36);
  });

  it("rend les catégories des types qui en exigent une", async () => {
    const r = await lire("/api/referentiel/certifications");
    const r482 = r.corps.types.find((t: { code: string }) => t.code === "CACES_R482");
    expect(r482.categories).toContain("B1");
    const sst = r.corps.types.find((t: { code: string }) => t.code === "SST");
    expect(sst.categories).toHaveLength(0);
  });
});

describe("référentiel des compétences", () => {
  it("rend la liste complète sans métier demandé", async () => {
    const r = await lire("/api/referentiel/competences");
    expect(r.statut).toBe(200);
    expect(r.corps.competences.length).toBeGreaterThan(0);
  });

  it("classe par fréquence réelle dans les offres du métier", async () => {
    // C'est l'un des deux usages des données publiques : proposer d'abord ce qui
    // revient le plus souvent dans les vraies offres, pas l'ordre alphabétique.
    const parMetier = await lire("/api/referentiel/competences?metiers=F1702");
    const sansMetier = await lire("/api/referentiel/competences");
    expect(parMetier.statut).toBe(200);
    expect(parMetier.corps.competences.length).toBeGreaterThan(0);
    expect(JSON.stringify(parMetier.corps.competences)).not.toBe(
      JSON.stringify(sansMetier.corps.competences)
    );
  });

  it("borne le nombre de métiers demandés", async () => {
    // Sans borne, une URL forgée ferait balayer la table des offres autant de fois
    // qu'on y met de codes.
    const beaucoup = Array.from({ length: 40 }, (_, i) => `F${1000 + i}`).join(",");
    const r = await lire(`/api/referentiel/competences?metiers=${beaucoup}`);
    expect(r.statut).toBe(200);
  });

  it("ignore une saisie vide ou malformée", async () => {
    expect((await lire("/api/referentiel/competences?metiers=")).statut).toBe(200);
    expect((await lire("/api/referentiel/competences?metiers=,,,")).statut).toBe(200);
  });
});
