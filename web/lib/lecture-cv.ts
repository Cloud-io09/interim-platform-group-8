/**
 * Lecture d'un CV **dans le navigateur**.
 *
 * Le document ne quitte jamais le poste de l'utilisateur : seul le texte qui en est
 * extrait est envoyé. C'est plus sûr pour lui, et ça supprime la classe de problèmes
 * rencontrée côté serveur — une fonction sans état ne peut pas charger quarante
 * mégaoctets de moteur de reconnaissance dans le temps qui lui est alloué.
 *
 * Deux chemins, comme avant : la couche texte du PDF quand elle existe, la
 * reconnaissance de caractères sinon. Les fichiers de Tesseract ne sont téléchargés
 * qu'au moment où un scan l'exige — la plupart des CV n'en ont jamais besoin.
 */

/** En deçà, la couche texte est absente ou inutilisable : on tente la reconnaissance. */
export const SEUIL_BASCULE_OCR = 120;

/** Au-delà, le traitement serait trop long sur un téléphone. */
const PAGES_MAX = 3;

/**
 * Taille maximale acceptée.
 *
 * Le fichier n'est plus envoyé nulle part : la limite ne protège plus un serveur,
 * elle protège l'appareil. Au-delà, le rendu des pages sature la mémoire d'un
 * téléphone — et un CV ne pèse jamais ça.
 */
export const TAILLE_MAX_OCTETS = 12 * 1024 * 1024;

/** Formats que l'on sait ouvrir, par extension : le type MIME manque parfois. */
const EXTENSIONS = /\.(pdf|docx|txt|png|jpe?g)$/i;

/**
 * Largeur de rendu avant reconnaissance.
 *
 * Tesseract lit mal en dessous de 1 000 pixels de large, et au-delà de 1 600 le gain
 * ne compense plus le temps de calcul — sensible sur un téléphone de chantier.
 */
const LARGEUR_RENDU = 1400;

export type EtapeLecture =
  | { etape: "lecture"; message: string }
  | { etape: "telechargement"; message: string }
  | { etape: "reconnaissance"; message: string; progression: number };

export class LectureImpossible extends Error {}

type Signaler = (etape: EtapeLecture) => void;

async function chargerPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  // Worker servi depuis nos fichiers : la politique de sécurité interdit les CDN,
  // et on ne dépend de personne.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
  return pdfjs;
}

/** Texte de la couche texte du PDF, vide si le document est un scan. */
async function coucheTexte(document: Awaited<ReturnType<Awaited<ReturnType<typeof chargerPdfjs>>["getDocument"]>["promise"]>): Promise<string> {
  const morceaux: string[] = [];
  for (let n = 1; n <= Math.min(document.numPages, PAGES_MAX); n++) {
    const page = await document.getPage(n);
    const contenu = await page.getTextContent();
    morceaux.push(
      contenu.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
    );
  }
  return morceaux.join("\n").replace(/\s+/g, " ").trim();
}

/** Rend une page dans un canevas, à une largeur adaptée à la reconnaissance. */
async function rendrePage(
  document: Awaited<ReturnType<Awaited<ReturnType<typeof chargerPdfjs>>["getDocument"]>["promise"]>,
  numero: number
): Promise<HTMLCanvasElement> {
  const page = await document.getPage(numero);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: LARGEUR_RENDU / base.width });

  const canevas = window.document.createElement("canvas");
  canevas.width = Math.floor(viewport.width);
  canevas.height = Math.floor(viewport.height);
  const contexte = canevas.getContext("2d");
  if (!contexte) throw new LectureImpossible("Le navigateur n'a pas pu préparer le rendu.");

  await page.render({ canvas: canevas, canvasContext: contexte, viewport }).promise;
  return canevas;
}

/** Une page rendue, ou directement la photo déposée par l'utilisateur. */
type Image = HTMLCanvasElement | File;

async function reconnaitre(images: Image[], signaler: Signaler): Promise<string> {
  signaler({ etape: "telechargement", message: "Chargement du moteur de reconnaissance…" });

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("fra", 1, {
    // Tout est servi depuis nos fichiers : aucun appel à un CDN tiers, et le
    // comportement ne dépend pas de la disponibilité d'un service extérieur.
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    gzip: true,
    logger: (info: { status: string; progress: number }) => {
      if (info.status === "recognizing text") {
        signaler({
          etape: "reconnaissance",
          message: "Lecture du document…",
          progression: info.progress,
        });
      }
    },
  });

  try {
    const morceaux: string[] = [];
    for (const c of images) {
      const { data } = await worker.recognize(c);
      if (data.text.trim()) morceaux.push(data.text);
    }
    return morceaux.join("\n");
  } finally {
    await worker.terminate();
  }
}

export async function lireCv(fichier: File, signaler: Signaler): Promise<string> {
  if (!EXTENSIONS.test(fichier.name)) {
    throw new LectureImpossible(
      "Format non pris en charge. Déposez un PDF, un document Word (.docx), un fichier texte, ou une photo de votre CV."
    );
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    throw new LectureImpossible(
      `Ce fichier dépasse ${Math.round(TAILLE_MAX_OCTETS / 1024 / 1024)} Mo. Réduisez-le, ou déposez seulement les pages utiles.`
    );
  }

  signaler({ etape: "lecture", message: "Ouverture du document…" });

  if (/\.txt$/i.test(fichier.name)) {
    return fichier.text();
  }

  // Une photo de CV prise au téléphone : c'est le cas le plus fréquent sur chantier,
  // et il n'y a rien d'autre à en tirer qu'une reconnaissance de caractères.
  if (/\.(png|jpe?g)$/i.test(fichier.name)) {
    return (await reconnaitre([fichier], signaler)).trim();
  }

  if (/\.docx$/i.test(fichier.name)) {
    const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
    const { value } = await mammoth.extractRawText({ arrayBuffer: await fichier.arrayBuffer() });
    return value;
  }

  const pdfjs = await chargerPdfjs();
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let document;
  try {
    document = await pdfjs.getDocument({ data: octets }).promise;
  } catch {
    // Fichier corrompu, protégé par mot de passe, ou simplement renommé en .pdf.
    throw new LectureImpossible(
      "Ce PDF n'a pas pu être ouvert. Il est peut-être protégé par un mot de passe, ou endommagé."
    );
  }

  const texte = await coucheTexte(document);
  if (texte.length >= SEUIL_BASCULE_OCR) return texte;

  // Pas de couche texte : c'est un scan, on le lit à l'image.
  const pages: HTMLCanvasElement[] = [];
  for (let n = 1; n <= Math.min(document.numPages, PAGES_MAX); n++) {
    pages.push(await rendrePage(document, n));
  }
  const reconnu = await reconnaitre(pages, signaler);
  return reconnu.trim().length > texte.length ? reconnu : texte;
}
