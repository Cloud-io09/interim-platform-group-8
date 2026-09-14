import "dotenv/config";

const TOKEN_URL =
  "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire";
const BASE_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2";
const SEARCH_URL = `${BASE_URL}/offres/search`;
const SCOPE = "o2dsoffre api_offresdemploiv2";

export interface Offre {
  id: string;
  intitule: string;
  typeContrat?: string;
  typeContratLibelle?: string;
  lieuTravail?: { libelle?: string };
  dateCreation?: string;
}

export interface SearchResult {
  total: number;
  offres: Offre[];
}

export interface ReferentielItem {
  code: string;
  libelle: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const clientId = process.env.FT_CLIENT_ID;
  const clientSecret = process.env.FT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "FT_CLIENT_ID / FT_CLIENT_SECRET manquants. Copiez .env.example vers .env et renseignez vos identifiants (portail francetravail.io)."
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(
      `Echec authentification France Travail (${res.status}): ${await res.text()}`
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    // marge de 30s avant expiration réelle pour éviter un 401 en plein appel
    expiresAt: Date.now() + (data.expires_in - 30) * 1000,
  };
  return cachedToken.value;
}

/**
 * Interroge l'endpoint de recherche d'offres.
 * `range` suit la pagination de l'API ("0-19" = 20 premiers résultats).
 * `total` provient du header Content-Range ("offres 0-19/1234"), pas de
 * resultats.length qui n'est qu'un échantillon.
 */
/**
 * Appel générique à l'endpoint de recherche. `params` accepte n'importe quel
 * paramètre documenté par l'API (motsCles, secteurActivite, typeContrat,
 * codeROME, range...) — cf. https://francetravail.io/data/api/offres-emploi
 */
export async function search(
  params: Record<string, string>
): Promise<SearchResult> {
  const token = await getAccessToken();
  const url = new URL(SEARCH_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 204) {
    return { total: 0, offres: [] };
  }
  // 206 (Partial Content) est la réponse normale de cette API en pagination
  if (!res.ok && res.status !== 206) {
    throw new Error(
      `Echec recherche (${JSON.stringify(params)}) (${res.status}): ${await res.text()}`
    );
  }

  const total = parseTotalFromContentRange(res.headers.get("Content-Range"));
  const data = (await res.json()) as { resultats?: Offre[] };
  return { total, offres: data.resultats ?? [] };
}

/** Raccourci pour une recherche par mots-clés (comportement historique du CLI). */
export async function searchOffres(
  motsCles: string,
  range = "0-19",
  extraParams: Record<string, string> = {}
): Promise<SearchResult> {
  return search({ motsCles, range, ...extraParams });
}

/**
 * Référentiel officiel utilisé par l'API (ex: "secteursActivites", "domaines",
 * "themes", "typesContrats"...). Permet de scanner TOUS les secteurs NAF
 * plutôt que de deviner des mots-clés.
 */
export async function getReferentiel(
  type: string
): Promise<ReferentielItem[]> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/referentiel/${type}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Echec référentiel "${type}" (${res.status}): ${await res.text()}`
    );
  }
  return (await res.json()) as ReferentielItem[];
}

function parseTotalFromContentRange(header: string | null): number {
  if (!header) return 0;
  const match = header.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}
