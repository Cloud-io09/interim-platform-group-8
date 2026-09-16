import { geocoder, geocoderCodePostal, type Coordonnees } from "@interimatch/core";

/**
 * Résout une adresse en coordonnées, avec repli sur le centre de la commune.
 *
 * Le repli n'est pas un pis-aller : la distance se joue à l'échelle du kilomètre et
 * du rayon de mobilité, pas de la rue. Mieux vaut le centre de la bonne commune
 * qu'un refus d'inscription parce que la Base Adresse Nationale ne connaît pas un
 * numéro sur un chemin de campagne.
 */
export async function resoudreAdresse(
  adresse: string,
  codePostal: string,
  ville: string
): Promise<Coordonnees | null> {
  if (adresse.trim().length >= 3) {
    const precise = await geocoder(adresse, codePostal);
    if (precise) return precise;
  }
  return geocoderCodePostal(codePostal, ville);
}
