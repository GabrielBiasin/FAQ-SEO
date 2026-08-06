// Cliente de Google PageSpeed Insights API (gratis). Devuelve datos de CAMPO
// (CrUX) y de LABORATORIO (Lighthouse) por separado, para distinguir estados
// field_measured vs lab_measured. Sin API key funciona pero con rate limit;
// PAGESPEED_API_KEY (opcional) sube la cuota.

export type CruxCategory = "FAST" | "AVERAGE" | "SLOW";

export interface FieldMetric {
  p75: number; // percentil 75
  category: CruxCategory;
}

export interface PageSpeedResult {
  url: string;
  ok: boolean;
  field: { lcp?: FieldMetric; inp?: FieldMetric; cls?: FieldMetric } | null; // CrUX
  lab: { lcpMs?: number; cls?: number; tbtMs?: number; perfScore?: number } | null; // Lighthouse
  error?: string;
}

const PSI_TIMEOUT_MS = 30000;

function parseField(le: {
  metrics?: Record<string, { percentile?: number; category?: string }>;
}): PageSpeedResult["field"] {
  const m = le?.metrics;
  if (!m) return null;
  const pick = (key: string, div = 1): FieldMetric | undefined => {
    const e = m[key];
    if (!e || typeof e.percentile !== "number" || !e.category) return undefined;
    return { p75: e.percentile / div, category: e.category as CruxCategory };
  };
  const field = {
    lcp: pick("LARGEST_CONTENTFUL_PAINT_MS"),
    inp: pick("INTERACTION_TO_NEXT_PAINT"),
    cls: pick("CUMULATIVE_LAYOUT_SHIFT_SCORE", 100), // CrUX reporta CLS*100
  };
  return field.lcp || field.inp || field.cls ? field : null;
}

export async function fetchPageSpeed(
  url: string,
  strategy: "mobile" | "desktop" = "mobile"
): Promise<PageSpeedResult> {
  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", strategy);
  api.searchParams.append("category", "performance");
  if (process.env.PAGESPEED_API_KEY) api.searchParams.set("key", process.env.PAGESPEED_API_KEY);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PSI_TIMEOUT_MS);
  try {
    const res = await fetch(api.toString(), { signal: controller.signal });
    if (!res.ok) return { url, ok: false, field: null, lab: null, error: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      loadingExperience?: { metrics?: Record<string, { percentile?: number; category?: string }> };
      lighthouseResult?: {
        audits?: Record<string, { numericValue?: number }>;
        categories?: { performance?: { score?: number } };
      };
    };

    const field = data.loadingExperience ? parseField(data.loadingExperience) : null;
    const audits = data.lighthouseResult?.audits ?? {};
    const perfScore = data.lighthouseResult?.categories?.performance?.score;
    const lab = data.lighthouseResult
      ? {
          lcpMs: audits["largest-contentful-paint"]?.numericValue,
          cls: audits["cumulative-layout-shift"]?.numericValue,
          tbtMs: audits["total-blocking-time"]?.numericValue,
          perfScore: typeof perfScore === "number" ? perfScore : undefined,
        }
      : null;

    return { url, ok: true, field, lab };
  } catch (err) {
    return { url, ok: false, field: null, lab: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(t);
  }
}
