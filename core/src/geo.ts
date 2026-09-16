const RAYON_TERRE_KM = 6371;

const enRadians = (degres: number): number => (degres * Math.PI) / 180;

/**
 * Distance orthodromique entre deux points, en kilomètres.
 *
 * Haversine plutôt que PostGIS : à l'échelle du POC les profils tiennent en mémoire,
 * et une fonction pure se teste unitairement là où une extension PostgreSQL ne se
 * teste qu'avec une base démarrée.
 */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const dLat = enRadians(b.lat - a.lat);
  const dLon = enRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(enRadians(a.lat)) * Math.cos(enRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
