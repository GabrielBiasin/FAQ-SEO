// Optional SERP provider for People-Also-Ask / autocomplete demand signals.
// Pluggable: if SERP_API_KEY is missing, every function returns [] so the
// pipeline keeps working without it.

export interface SerpQuestion {
  text: string;
  source: "paa" | "autocomplete";
  raw: unknown;
}

export function serpEnabled(): boolean {
  return Boolean(process.env.SERP_API_KEY);
}

/**
 * Fetch "People Also Ask" questions for a query via SerpApi (google engine).
 * Returns [] on any error or when no key is configured.
 */
export async function fetchPeopleAlsoAsk(query: string): Promise<SerpQuestion[]> {
  const key = process.env.SERP_API_KEY;
  if (!key) return [];
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", key);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as {
      related_questions?: { question?: string }[];
    };
    return (data.related_questions ?? [])
      .map((q) => q.question?.trim())
      .filter((q): q is string => Boolean(q))
      .map((text) => ({ text, source: "paa" as const, raw: { query } }));
  } catch {
    return [];
  }
}

/**
 * Fetch Google autocomplete suggestions for a query via SerpApi.
 * Returns [] on any error or when no key is configured.
 */
export async function fetchAutocomplete(query: string): Promise<SerpQuestion[]> {
  const key = process.env.SERP_API_KEY;
  if (!key) return [];
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_autocomplete");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", key);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: { value?: string }[] };
    return (data.suggestions ?? [])
      .map((s) => s.value?.trim())
      .filter((v): v is string => Boolean(v))
      // Keep question-like suggestions; autocomplete is noisy.
      .filter((v) => /^(qué|que|cómo|como|cuál|cual|cuándo|cuando|dónde|donde|por qué|por que|quién|quien|cuánto|cuanto|what|how|why|when|where|which|who|can|is|are|does)\b/i.test(v))
      .map((text) => ({ text, source: "autocomplete" as const, raw: { query } }));
  } catch {
    return [];
  }
}

/** Gather PAA + autocomplete for several seed queries, deduped by text. */
export async function gatherSerpSignals(queries: string[]): Promise<SerpQuestion[]> {
  if (!serpEnabled()) return [];
  const all: SerpQuestion[] = [];
  for (const q of queries.slice(0, 8)) {
    const [paa, ac] = await Promise.all([fetchPeopleAlsoAsk(q), fetchAutocomplete(q)]);
    all.push(...paa, ...ac);
  }
  const seen = new Set<string>();
  return all.filter((q) => {
    const k = q.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
