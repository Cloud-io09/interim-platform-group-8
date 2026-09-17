import { lireParOcr } from "./ocr";

/**
 * Extraction du texte d'un CV déposé.
 *
 * Le fichier n'est jamais écrit sur disque ni conservé : il est lu en mémoire, son
 * texte est extrait, et l'objet est abandonné. Seul le texte est stocké, chiffré.
 *
 * Deux chemins pour un PDF : la couche texte quand elle existe, la reconnaissance de
 * caractères sinon. Beaucoup de CV du BTP sont des scans — un fichier réel testé ici
 * ne contenait aucune police et une seule image pleine page.
 *
 * L'OCR s'exécute sur notre serveur, avec un modèle servi depuis nos fichiers :
 * le document du candidat n'est transmis à aucun tiers.
 */

/** En deçà, la couche texte est absente ou inutilisable : on tente l'OCR. */
export const SEUIL_BASCULE_OCR = 120;

/** Vercel plafonne le corps d'une requête serverless : on refuse avant d'y arriver. */
export const TAILLE_MAX_OCTETS = 4 * 1024 * 1024;

export const TYPES_ACCEPTES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export class FichierRefuse extends Error {}

function verifierEnTete(octets: Uint8Array, type: string): void {
  // Le type déclaré par le navigateur vient du client : on vérifie la signature
  // réelle du fichier, sinon un exécutable renommé en .pdf passerait le contrôle.
  const signature = Array.from(octets.slice(0, 4))
    .map((o) => String.fromCharCode(o))
    .join("");
  if (type === "application/pdf" && !signature.startsWith("%PDF")) {
    throw new FichierRefuse("Ce fichier n'est pas un PDF valide.");
  }
  if (type.includes("wordprocessingml") && !signature.startsWith("PK")) {
    throw new FichierRefuse("Ce fichier n'est pas un document Word valide.");
  }
}

export async function extraireTexte(fichier: File): Promise<string> {
  if (fichier.size === 0) throw new FichierRefuse("Le fichier est vide.");
  if (fichier.size > TAILLE_MAX_OCTETS) {
    throw new FichierRefuse(
      `Le fichier dépasse ${Math.round(TAILLE_MAX_OCTETS / 1024 / 1024)} Mo. Exportez-le en PDF plus léger.`
    );
  }
  if (!TYPES_ACCEPTES.includes(fichier.type as (typeof TYPES_ACCEPTES)[number])) {
    throw new FichierRefuse("Formats acceptés : PDF, Word (.docx) ou texte brut.");
  }

  const tampon = await fichier.arrayBuffer();
  const octets = new Uint8Array(tampon);
  verifierEnTete(octets, fichier.type);

  if (fichier.type === "text/plain") {
    return new TextDecoder().decode(octets);
  }

  if (fichier.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    // pdf.js **détache** le tampon qu'on lui passe : sans copie préalable, la
    // seconde lecture — celle de l'OCR — échouerait sur un tampon vidé.
    const pourOcr = octets.slice();
    const document = await getDocumentProxy(octets);
    const { text } = await extractText(document, { mergePages: true });
    const coucheTexte = Array.isArray(text) ? text.join("\n") : text;
    if (coucheTexte.trim().length >= SEUIL_BASCULE_OCR) return coucheTexte;

    // Pas de couche texte exploitable : le PDF est un scan. On lit l'image.
    const reconnu = await lireParOcr(pourOcr);
    return reconnu.trim().length > coucheTexte.trim().length ? reconnu : coucheTexte;
  }

  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(octets) });
  return value;
}
