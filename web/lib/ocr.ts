import { join } from "node:path";
import { encoderPng } from "./png";

/**
 * Reconnaissance de caractères sur un PDF sans couche texte.
 *
 * Beaucoup de CV du BTP sont des scans : le fichier ne contient qu'une image, pas
 * un seul caractère. Mesuré sur un CV réel : `pdftotext` comme pdf.js en tirent zéro
 * caractère, l'OCR en tire 2 000 avec 89 % de confiance.
 *
 * Tout se passe **sur notre serveur** : le document n'est envoyé à aucun tiers, et
 * le modèle de langue est servi depuis nos propres fichiers plutôt que téléchargé
 * depuis un CDN à chaque démarrage à froid.
 */

/** Au-delà, le traitement dépasserait le temps d'exécution alloué à une fonction. */
const PAGES_MAX = 3;

/**
 * Délai au-delà duquel on abandonne l'OCR.
 *
 * Sous la limite de la fonction, volontairement : mieux vaut rendre une erreur
 * explicite que laisser la passerelle couper la requête et renvoyer une page HTML
 * que le client ne sait pas interpréter — c'est le « 504, réponse illisible » que
 * l'utilisateur voyait.
 */
const DELAI_MAX_MS = 40_000;

export class OcrTropLong extends Error {}
/** En deçà, l'image est une icône ou un logo : l'OCR n'y trouverait rien d'utile. */
const SURFACE_MIN = 200_000;

interface ImagePdf {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Récupère les images embarquées d'un PDF, sans le rastériser.
 *
 * Pour un scan, la page **est** une image : on la lit directement dans les objets de
 * pdf.js. Rendre la page demanderait un canvas, donc une dépendance native pénible
 * à déployer en serverless — ici, rien de tel.
 */
async function imagesDuPdf(octets: Uint8Array): Promise<ImagePdf[]> {
  const { getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(octets);
  const images: ImagePdf[] = [];

  for (let numero = 1; numero <= Math.min(document.numPages, PAGES_MAX); numero++) {
    const page = await document.getPage(numero);
    const operations = await page.getOperatorList();

    const noms = new Set(
      operations.argsArray
        .flat()
        .filter((a: unknown): a is string => typeof a === "string" && a.startsWith("img_"))
    );

    for (const nom of noms) {
      const image = await new Promise<ImagePdf | null>((resoudre) => {
        try {
          page.objs.get(nom, (valeur: ImagePdf) => resoudre(valeur ?? null));
        } catch {
          resoudre(null);
        }
      });
      if (!image?.data || !image.width || !image.height) continue;
      if (image.width * image.height < SURFACE_MIN) continue;
      images.push(image);
    }
  }
  return images;
}

/**
 * Lit le texte d'un PDF scanné. Rend une chaîne vide si rien n'est exploitable —
 * l'appelant décide alors du message à afficher.
 */
export async function lireParOcr(octets: Uint8Array): Promise<string> {
  const images = await imagesDuPdf(octets);
  if (images.length === 0) return "";

  const { createWorker } = await import("tesseract.js");
  let expire = false;
  const minuterie = setTimeout(() => {
    expire = true;
  }, DELAI_MAX_MS);

  const worker = await createWorker("fra", 1, {
    // Modèle servi depuis nos fichiers : pas d'appel réseau au démarrage à froid,
    // et un comportement identique en local et en production.
    langPath: join(process.cwd(), "public", "ocr"),
    gzip: true,
    logger: () => {},
  });

  try {
    const morceaux: string[] = [];
    for (const image of images) {
      if (expire) throw new OcrTropLong("La reconnaissance a dépassé le délai imparti.");
      const canaux = Math.round(image.data.length / (image.width * image.height));
      if (canaux < 3) continue; // niveaux de gris ou masque : format non géré ici
      const png = encoderPng(image.data, image.width, image.height, canaux);
      const { data } = await worker.recognize(png);
      if (data.text.trim().length > 0) morceaux.push(data.text);
    }
    return morceaux.join("\n");
  } finally {
    clearTimeout(minuterie);
    await worker.terminate();
  }
}
