/**
 * Extraction du texte d'un CV déposé.
 *
 * Le fichier n'est jamais écrit sur disque ni conservé : il est lu en mémoire, son
 * texte est extrait, et l'objet est abandonné. Seul le texte est stocké, chiffré.
 *
 * Aucun service d'OCR externe n'est appelé. Un CV scanné sans couche texte ne rendra
 * donc rien — on le dit à l'utilisateur plutôt que d'envoyer son document à un tiers.
 */

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
    const document = await getDocumentProxy(octets);
    const { text } = await extractText(document, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }

  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(octets) });
  return value;
}
