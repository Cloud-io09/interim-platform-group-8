import { describe, expect, it } from "vitest";
import { gunzipSync, inflateSync } from "node:zlib";
import { encoderPng } from "../lib/png";

/**
 * L'encodeur PNG existe pour éviter une dépendance native (canvas) dans une
 * fonction serverless. Il n'a pas de bibliothèque derrière lui : sa correction doit
 * donc être vérifiée octet par octet.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function morceaux(png: Buffer): { type: string; contenu: Buffer }[] {
  const liste: { type: string; contenu: Buffer }[] = [];
  let i = 8;
  while (i < png.length) {
    const longueur = png.readUInt32BE(i);
    const type = png.subarray(i + 4, i + 8).toString("latin1");
    liste.push({ type, contenu: png.subarray(i + 8, i + 8 + longueur) });
    i += 12 + longueur;
  }
  return liste;
}

describe("encoderPng", () => {
  it("produit la signature PNG et les trois morceaux obligatoires", () => {
    const png = encoderPng(new Uint8Array(2 * 2 * 3).fill(128), 2, 2, 3);
    expect(png.subarray(0, 8)).toEqual(SIGNATURE);
    expect(morceaux(png).map((m) => m.type)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("déclare les bonnes dimensions et un format RGB 8 bits", () => {
    const png = encoderPng(new Uint8Array(7 * 3 * 3), 7, 3, 3);
    const entete = morceaux(png).find((m) => m.type === "IHDR")!.contenu;
    expect(entete.readUInt32BE(0)).toBe(7);
    expect(entete.readUInt32BE(4)).toBe(3);
    expect(entete[8]).toBe(8); // profondeur
    expect(entete[9]).toBe(2); // RGB
  });

  it("restitue exactement les pixels fournis", () => {
    // Deux pixels : rouge pur, puis vert pur.
    const png = encoderPng(new Uint8Array([255, 0, 0, 0, 255, 0]), 2, 1, 3);
    const brut = inflateSync(morceaux(png).find((m) => m.type === "IDAT")!.contenu);
    // Une ligne = un octet de filtre, puis les pixels.
    expect([...brut]).toEqual([0, 255, 0, 0, 0, 255, 0]);
  });

  it("ignore le canal alpha d'une source RGBA", () => {
    // La transparence n'apporte rien à une reconnaissance de caractères.
    const png = encoderPng(new Uint8Array([10, 20, 30, 255, 40, 50, 60, 0]), 2, 1, 4);
    const brut = inflateSync(morceaux(png).find((m) => m.type === "IDAT")!.contenu);
    expect([...brut]).toEqual([0, 10, 20, 30, 40, 50, 60]);
  });

  it("écrit un octet de filtre par ligne", () => {
    const png = encoderPng(new Uint8Array(3 * 4 * 3), 3, 4, 3);
    const brut = inflateSync(morceaux(png).find((m) => m.type === "IDAT")!.contenu);
    expect(brut.length).toBe((3 * 3 + 1) * 4);
  });

  it("calcule un CRC valide sur chaque morceau", () => {
    // Un CRC faux rend le fichier illisible par Tesseract sans erreur explicite.
    const png = encoderPng(new Uint8Array(4 * 4 * 3).fill(200), 4, 4, 4 === 4 ? 3 : 3);
    for (const { type, contenu } of morceaux(png)) {
      const debut = png.indexOf(Buffer.from(type, "latin1"));
      const crcLu = png.readUInt32BE(debut + 4 + contenu.length);
      let crc = 0xffffffff;
      for (const o of Buffer.concat([Buffer.from(type, "latin1"), contenu])) {
        crc ^= o;
        for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
      expect((crc ^ 0xffffffff) >>> 0, type).toBe(crcLu);
    }
  });

  it("gère une image d'un seul pixel", () => {
    expect(() => encoderPng(new Uint8Array([1, 2, 3]), 1, 1, 3)).not.toThrow();
  });
});

describe("modèle de langue pour l'OCR", () => {
  it("est servi depuis nos fichiers, pas depuis un CDN", async () => {
    // Un téléchargement à chaque démarrage à froid ajouterait une dépendance réseau
    // et un délai, et enverrait une requête à un tiers.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    // Chemin relatif au fichier de test : `process.cwd()` dépend d'où vitest est lancé.
    const chemin = join(import.meta.dirname, "..", "public", "ocr", "fra.traineddata.gz");
    const contenu = readFileSync(chemin);
    expect(contenu.length).toBeGreaterThan(100_000);
    // Doit être un gzip valide : Tesseract le décompresse lui-même.
    expect(() => gunzipSync(contenu)).not.toThrow();
  });
});
