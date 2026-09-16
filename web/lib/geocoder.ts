import { geocoder, geocoderCodePostal, redis, type Coordonnees } from "@interimatch/core";

/** Un couple commune / code postal ne bouge pas : 30 jours de cache est prudent. */
const TTL_CACHE_SECONDES = 30 * 24 * 3600;

const cleCache = (adresse: string, codePostal: string, ville: string) =>
  `geo:${codePostal}:${ville.toLowerCase().trim()}:${adresse.toLowerCase().trim()}`;

export class ServiceGeocodageIndisponible extends Error {}

/**
 * Résout une adresse en coordonnées, avec cache et repli sur le centre de la commune.
 *
 * Le repli n'est pas un pis-aller : la distance se joue à l'échelle du kilomètre et
 * du rayon de mobilité, pas de la rue. Mieux vaut le centre de la bonne commune
 * qu'un refus d'inscription parce que la Base Adresse Nationale ne connaît pas un
 * numéro sur un chemin de campagne.
 *
 * Le cache Redis sert deux objectifs : ne pas réinterroger un service public pour
 * une adresse déjà résolue (écoconception), et rester debout quand ce service est
 * indisponible ou nous limite en débit — ce qui arrive réellement.
 */
export async function resoudreAdresse(
  adresse: string,
  codePostal: string,
  ville: string
): Promise<Coordonnees | null> {
  const cache = redis();
  const cle = cleCache(adresse, codePostal, ville);

  try {
    const memorise = await cache.get(cle);
    if (memorise) {
      return typeof memorise === "string" ? (JSON.parse(memorise) as Coordonnees) : (memorise as Coordonnees);
    }
  } catch {
    // Un cache indisponible ne doit pas empêcher un géocodage : on continue.
  }

  let resolu: Coordonnees | null = null;
  try {
    if (adresse.trim().length >= 3) {
      resolu = await geocoder(adresse, codePostal);
    }
    if (!resolu) {
      resolu = await geocoderCodePostal(codePostal, ville);
    }
  } catch (erreur) {
    // La BAN limite le débit et tombe parfois. Sans ce traitement, l'utilisateur
    // recevait une erreur 500 opaque au lieu d'une explication.
    throw new ServiceGeocodageIndisponible(
      erreur instanceof Error ? erreur.message : "Service de géocodage injoignable"
    );
  }

  if (resolu) {
    try {
      await cache.set(cle, JSON.stringify(resolu), { ex: TTL_CACHE_SECONDES });
    } catch {
      // Idem : l'échec d'écriture du cache n'invalide pas le résultat.
    }
  }
  return resolu;
}
