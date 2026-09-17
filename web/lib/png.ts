import { deflateSync } from "node:zlib";

/**
 * Encode une image brute en PNG, sans dépendance native.
 *
 * Tesseract attend un format d'image connu ; pdf.js rend des octets bruts. Passer
 * par une bibliothèque de rendu (canvas) imposerait une dépendance native, fragile à
 * déployer en serverless. `zlib` fait partie de Node, et un PNG sans filtre ni
 * palette tient en quelques dizaines de lignes.
 */

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(donnees: Buffer): number {
  let crc = 0xffffffff;
  for (const octet of donnees) crc = TABLE_CRC[(crc ^ octet) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function morceau(type: string, contenu: Buffer): Buffer {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(contenu.length);
  const corps = Buffer.concat([Buffer.from(type, "latin1"), contenu]);
  const controle = Buffer.alloc(4);
  controle.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, controle]);
}

/**
 * `canaux` vaut 3 (RGB) ou 4 (RGBA) selon ce que rend pdf.js. On écrit toujours du
 * RGB : la transparence n'apporte rien à une reconnaissance de caractères.
 */
export function encoderPng(
  donnees: Uint8Array | Uint8ClampedArray,
  largeur: number,
  hauteur: number,
  canaux: number
): Buffer {
  const brut = Buffer.alloc((largeur * 3 + 1) * hauteur);
  let sortie = 0;
  for (let y = 0; y < hauteur; y++) {
    brut[sortie++] = 0; // filtre « None » : le gain de compression ne vaut pas la complexité
    for (let x = 0; x < largeur; x++) {
      const source = (y * largeur + x) * canaux;
      brut[sortie++] = donnees[source]!;
      brut[sortie++] = donnees[source + 1]!;
      brut[sortie++] = donnees[source + 2]!;
    }
  }

  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8; // profondeur
  entete[9] = 2; // type couleur : RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau("IHDR", entete),
    morceau("IDAT", deflateSync(brut)),
    morceau("IEND", Buffer.alloc(0)),
  ]);
}
