const URL_BAN = "https://api-adresse.data.gouv.fr/search/";

export interface Coordonnees {
  lat: number;
  lon: number;
  /** Adresse telle que la BAN l'a normalisée — à réafficher pour confirmation. */
  libelle: string;
  /** Confiance de la BAN, entre 0 et 1. */
  score: number;
}

/** Réponse GeoJSON de la Base Adresse Nationale, réduite à ce qu'on consomme. */
interface ReponseBAN {
  features?: {
    geometry?: { coordinates?: [number, number] };
    properties?: { label?: string; score?: number; postcode?: string };
  }[];
}

export class ErreurGeocodage extends Error {}

/**
 * Score minimal accepté. En dessous, la BAN a trouvé « quelque chose » sans rapport :
 * « 12 rue de la Paix » + Reims sans filtre de code postal remonte un résultat dans
 * les Yvelines à 0,65. Sur ce produit une mauvaise commune fausse toutes les distances.
 */
export const SCORE_MINIMAL = 0.5;

/**
 * Géocode une adresse française via la Base Adresse Nationale.
 *
 * Gratuite, sans clé, exhaustive sur la France. Le code postal est passé en filtre
 * `postcode` et non concaténé à la requête : c'est ce qui évite de tomber sur une rue
 * homonyme à l'autre bout du pays.
 *
 * `fetchImpl` est injectable pour que le traitement de la réponse se teste sans réseau.
 */
export async function geocoder(
  adresse: string,
  codePostal: string,
  fetchImpl: typeof fetch = fetch
): Promise<Coordonnees | null> {
  const requete = adresse.trim();
  if (requete.length < 3) return null;

  const url = new URL(URL_BAN);
  url.searchParams.set("q", requete);
  url.searchParams.set("postcode", codePostal);
  url.searchParams.set("limit", "1");

  const reponse = await fetchImpl(url);
  if (!reponse.ok) {
    throw new ErreurGeocodage(`La Base Adresse Nationale a répondu ${reponse.status}`);
  }

  const data = (await reponse.json()) as ReponseBAN;
  const premier = data.features?.[0];
  const coordonnees = premier?.geometry?.coordinates;
  if (!premier || !coordonnees) return null;

  const score = premier.properties?.score ?? 0;
  if (score < SCORE_MINIMAL) return null;

  // GeoJSON ordonne en [longitude, latitude] — l'inverse de l'intuition.
  const [lon, lat] = coordonnees;
  return { lat, lon, libelle: premier.properties?.label ?? requete, score };
}

/**
 * Repli quand l'adresse précise ne donne rien : centre de la commune.
 * Suffisant pour le calcul de distance, qui se joue à l'échelle du kilomètre.
 */
export async function geocoderCodePostal(
  codePostal: string,
  ville: string,
  fetchImpl: typeof fetch = fetch
): Promise<Coordonnees | null> {
  const url = new URL(URL_BAN);
  url.searchParams.set("q", ville);
  url.searchParams.set("postcode", codePostal);
  url.searchParams.set("type", "municipality");
  url.searchParams.set("limit", "1");

  const reponse = await fetchImpl(url);
  if (!reponse.ok) {
    throw new ErreurGeocodage(`La Base Adresse Nationale a répondu ${reponse.status}`);
  }

  const data = (await reponse.json()) as ReponseBAN;
  const premier = data.features?.[0];
  const coordonnees = premier?.geometry?.coordinates;
  if (!premier || !coordonnees) return null;

  const [lon, lat] = coordonnees;
  return {
    lat,
    lon,
    libelle: premier.properties?.label ?? ville,
    score: premier.properties?.score ?? 0,
  };
}
