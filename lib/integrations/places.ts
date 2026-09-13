/**
 * Location normalization. The user types where they shop; when a Google Maps
 * key is configured the text is resolved to a canonical "City, State, Country"
 * so the product search localizes properly. Without a key, or when Google does
 * not recognise the text, the user's own words are kept exactly as typed. This
 * never invents a place.
 */

export const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ResolvedLocation {
  /** What the product search will use. */
  value: string;
  /** True when Google recognised it; false when the user's text is kept as typed. */
  verified: boolean;
}

interface GeocodeResult {
  formatted_address?: unknown;
  address_components?: Array<{ long_name?: unknown; short_name?: unknown; types?: unknown }>;
}

/** "Austin, TX 78701, USA" is fine for a human but SerpApi wants "Austin, Texas, United States". */
function fromComponents(result: GeocodeResult): string | null {
  const components = Array.isArray(result.address_components) ? result.address_components : [];
  const pick = (type: string): string | null => {
    for (const c of components) {
      const types = Array.isArray(c.types) ? c.types : [];
      if (types.includes(type) && typeof c.long_name === "string") return c.long_name;
    }
    return null;
  };
  const city = pick("locality") ?? pick("postal_town") ?? pick("administrative_area_level_2");
  const region = pick("administrative_area_level_1");
  const country = pick("country");
  const parts = [city, region, country].filter((p): p is string => typeof p === "string" && p.length > 0);
  return parts.length >= 2 ? parts.join(", ") : null;
}

export async function resolveLocation(
  text: string,
  options: { apiKey?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<ResolvedLocation> {
  const typed = text.trim().replace(/\s+/g, " ");
  if (typed.length === 0) return { value: "", verified: false };
  if (!options.apiKey) return { value: typed, verified: false };

  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", typed);
  url.searchParams.set("key", options.apiKey);

  try {
    const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(options.timeoutMs ?? 6000) });
    if (!res.ok) return { value: typed, verified: false };
    const body: unknown = await res.json().catch(() => null);
    if (!body || typeof body !== "object") return { value: typed, verified: false };
    const { status, results } = body as { status?: unknown; results?: unknown };
    if (status !== "OK" || !Array.isArray(results) || results.length === 0) return { value: typed, verified: false };
    const first = results[0] as GeocodeResult;
    const canonical = fromComponents(first) ?? (typeof first.formatted_address === "string" ? first.formatted_address : null);
    return canonical ? { value: canonical.slice(0, 200), verified: true } : { value: typed, verified: false };
  } catch {
    return { value: typed, verified: false };
  }
}
