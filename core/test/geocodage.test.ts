import { describe, expect, it } from "vitest";
import {
  ErreurGeocodage,
  geocoder,
  geocoderCodePostal,
  SCORE_MINIMAL,
} from "../src/geocodage";

/** Fabrique une réponse BAN factice, au format GeoJSON réellement renvoyé par l'API. */
function fauxFetch(
  corps: unknown,
  ok = true,
  status = 200
): { impl: typeof fetch; urlsAppelees: URL[] } {
  const urlsAppelees: URL[] = [];
  const impl = (async (url: URL) => {
    urlsAppelees.push(url);
    return { ok, status, json: async () => corps } as Response;
  }) as unknown as typeof fetch;
  return { impl, urlsAppelees };
}

const reponseReims = {
  features: [
    {
      geometry: { coordinates: [4.055595, 49.250948] },
      properties: { label: "25 Rue de Vesle 51100 Reims", score: 0.982, postcode: "51100" },
    },
  ],
};

describe("geocoder", () => {
  it("rend les coordonnées en remettant latitude et longitude dans le bon ordre", async () => {
    const { impl } = fauxFetch(reponseReims);
    const r = await geocoder("25 rue de Vesle", "51100", impl);
    // GeoJSON ordonne [lon, lat] : l'inversion est le bug classique sur cette API.
    expect(r).toEqual({
      lat: 49.250948,
      lon: 4.055595,
      libelle: "25 Rue de Vesle 51100 Reims",
      score: 0.982,
    });
  });

  it("passe le code postal en filtre plutôt que de le coller à la requête", async () => {
    const { impl, urlsAppelees } = fauxFetch(reponseReims);
    await geocoder("25 rue de Vesle", "51100", impl);
    const url = urlsAppelees[0]!;
    expect(url.searchParams.get("q")).toBe("25 rue de Vesle");
    expect(url.searchParams.get("postcode")).toBe("51100");
  });

  it("rejette un résultat sous le score minimal", async () => {
    // Cas réel : « 12 rue de la Paix » à Reims remonte « 12 Boulevard de la Paix » à 0,447.
    const { impl } = fauxFetch({
      features: [
        {
          geometry: { coordinates: [4.04, 49.25] },
          properties: { label: "12 Boulevard de la Paix 51100 Reims", score: 0.447 },
        },
      ],
    });
    expect(await geocoder("12 rue de la Paix", "51100", impl)).toBeNull();
  });

  it("accepte un résultat exactement au seuil", async () => {
    const { impl } = fauxFetch({
      features: [
        { geometry: { coordinates: [4.04, 49.25] }, properties: { label: "X", score: SCORE_MINIMAL } },
      ],
    });
    expect(await geocoder("une adresse", "51100", impl)).not.toBeNull();
  });

  it("rend null quand la BAN ne trouve rien", async () => {
    const { impl } = fauxFetch({ features: [] });
    expect(await geocoder("xyzzy qwerty", "51100", impl)).toBeNull();
  });

  it("rend null sans appeler l'API si la requête est trop courte", async () => {
    const { impl, urlsAppelees } = fauxFetch(reponseReims);
    expect(await geocoder("ab", "51100", impl)).toBeNull();
    expect(await geocoder("   ", "51100", impl)).toBeNull();
    expect(urlsAppelees).toHaveLength(0);
  });

  it("remonte une erreur explicite si la BAN est en panne", async () => {
    const { impl } = fauxFetch({}, false, 503);
    await expect(geocoder("25 rue de Vesle", "51100", impl)).rejects.toThrow(ErreurGeocodage);
  });

  it("tolère un résultat sans libellé ni score", async () => {
    const { impl } = fauxFetch({
      features: [{ geometry: { coordinates: [4.04, 49.25] }, properties: {} }],
    });
    expect(await geocoder("une adresse", "51100", impl)).toBeNull();
  });

  it("tolère une réponse sans géométrie", async () => {
    const { impl } = fauxFetch({ features: [{ properties: { score: 0.9 } }] });
    expect(await geocoder("une adresse", "51100", impl)).toBeNull();
  });

  it("retombe sur la requête d'origine quand la BAN ne renvoie pas de libellé", async () => {
    const { impl } = fauxFetch({
      features: [{ geometry: { coordinates: [4.04, 49.25] }, properties: { score: 0.9 } }],
    });
    expect(await geocoder("25 rue de Vesle", "51100", impl)).toMatchObject({
      libelle: "25 rue de Vesle",
    });
  });
});

describe("geocoderCodePostal — repli au centre de la commune", () => {
  it("cible le référentiel des communes", async () => {
    const { impl, urlsAppelees } = fauxFetch({
      features: [
        { geometry: { coordinates: [4.055595, 49.250948] }, properties: { label: "Reims", score: 0.959 } },
      ],
    });
    const r = await geocoderCodePostal("51100", "Reims", impl);
    expect(urlsAppelees[0]!.searchParams.get("type")).toBe("municipality");
    expect(r).toMatchObject({ lat: 49.250948, lon: 4.055595, libelle: "Reims" });
  });

  it("n'applique pas le seuil de score : un centre de commune approximatif reste utile", async () => {
    const { impl } = fauxFetch({
      features: [{ geometry: { coordinates: [4.0, 49.2] }, properties: { label: "Commune", score: 0.2 } }],
    });
    expect(await geocoderCodePostal("51100", "Commune", impl)).not.toBeNull();
  });

  it("rend null quand la commune est introuvable", async () => {
    const { impl } = fauxFetch({ features: [] });
    expect(await geocoderCodePostal("99999", "Nulle part", impl)).toBeNull();
  });

  it("remonte une erreur explicite si la BAN est en panne", async () => {
    const { impl } = fauxFetch({}, false, 500);
    await expect(geocoderCodePostal("51100", "Reims", impl)).rejects.toThrow(ErreurGeocodage);
  });

  it("tolère une réponse sans géométrie", async () => {
    const { impl } = fauxFetch({ features: [{ properties: { label: "Reims" } }] });
    expect(await geocoderCodePostal("51100", "Reims", impl)).toBeNull();
  });

  it("retombe sur le nom de ville et un score nul si la BAN ne les renvoie pas", async () => {
    const { impl } = fauxFetch({
      features: [{ geometry: { coordinates: [4.05, 49.25] }, properties: {} }],
    });
    expect(await geocoderCodePostal("51100", "Reims", impl)).toMatchObject({
      libelle: "Reims",
      score: 0,
    });
  });
});
