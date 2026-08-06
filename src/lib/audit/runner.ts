import { createServiceClient } from "@/lib/supabase";
import { USER_AGENT } from "@/lib/crawler";
import type { AuditContext, AuditPage, DimensionScore, SignalMeasurement, TopDimension } from "./types";
import {
  METHODOLOGY_VERSION,
  evaluatorsForSubDimension,
  signalRegistryVersion,
} from "./registry";
import { aggregateDimension, aggregateTopDimension } from "./aggregate";
import { fetchPageSpeed } from "./pagespeed";
import { fetchOrganicResults, serpEnabled } from "@/lib/serp";
import type { SerpQueryResult } from "./types";
// Importar registra las señales en el registry.
import { READINESS_SUBDIMENSIONS, SUBDIMENSIONS_BY_TOP } from "./signals";

const SERP_QUERY_CAP = 10; // máximo de queries a consultar en SERP (control de quota)

const FETCH_TIMEOUT_MS = 12000;

async function fetchText(url: string): Promise<{ text: string | null; status: number | null }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    return { text: res.ok ? await res.text() : null, status: res.status };
  } catch {
    return { text: null, status: null };
  } finally {
    clearTimeout(t);
  }
}

/** Arma el AuditContext desde el crawl guardado + robots/sitemaps en vivo. */
export async function buildAuditContext(projectId: string): Promise<{
  ctx: AuditContext;
  crawlId: string | null;
} | null> {
  const db = createServiceClient();

  const { data: project } = await db
    .from("projects")
    .select("root_url")
    .eq("id", projectId)
    .single();
  if (!project) return null;

  const { data: crawl } = await db
    .from("crawls")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pageRows } = await db
    .from("pages")
    .select("id, url, title, headings, clean_text, word_count, http_status, canonical_url, meta_robots, hreflang, internal_links, meta_description, img_total, img_with_alt")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const rootUrl = project.root_url;

  const pages: AuditPage[] = (pageRows ?? []).map((p) => ({
    id: p.id,
    url: p.url,
    title: p.title,
    httpStatus: p.http_status ?? null,
    canonicalUrl: p.canonical_url ?? null,
    metaRobots: p.meta_robots ?? null,
    hreflang: (p.hreflang as unknown as { lang: string; href: string }[]) ?? [],
    headings: (p.headings as unknown as { tag: string; text: string }[]) ?? [],
    internalLinks: (p.internal_links as unknown as string[]) ?? [],
    metaDescription: p.meta_description ?? null,
    imgTotal: p.img_total ?? 0,
    imgWithAlt: p.img_with_alt ?? 0,
    cleanText: p.clean_text,
    wordCount: p.word_count,
  }));

  const ctx = await buildContextFromPages(projectId, rootUrl, pages);

  // Queries objetivo para Visibility: preguntas priorizadas del proyecto.
  const { data: qs } = await db
    .from("questions")
    .select("text, priority_score")
    .eq("project_id", projectId)
    .order("priority_score", { ascending: false })
    .limit(30);
  ctx.targetQueries = (qs ?? []).map((q) => ({ text: q.text, priority: q.priority_score ?? 1 }));

  return { ctx, crawlId: crawl?.id ?? null };
}

/**
 * Arma un AuditContext a partir de una lista de páginas ya extraídas + fetch
 * en vivo de robots.txt y sitemaps del origen. Reutilizable para competidores.
 */
export async function buildContextFromPages(
  projectId: string,
  rootUrl: string,
  pages: AuditPage[]
): Promise<AuditContext> {
  const origin = new URL(rootUrl).origin;
  const domain = new URL(rootUrl).hostname.replace(/^www\./, "");
  const robotsRes = await fetchText(new URL("/robots.txt", origin).toString());
  const robotsTxt = robotsRes.text;
  const declaredSitemaps = robotsTxt
    ? Array.from(robotsTxt.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)).map((m) => m[1].trim())
    : [];
  const sitemapCandidates = Array.from(
    new Set([...declaredSitemaps, new URL("/sitemap.xml", origin).toString()])
  );
  const sitemaps = await Promise.all(
    sitemapCandidates.map(async (url) => {
      const r = await fetchText(url);
      return {
        url,
        httpStatus: r.status,
        xml: r.text,
        declaredInRobots: declaredSitemaps.includes(url),
      };
    })
  );
  return { projectId, rootUrl, origin, domain, pages, robotsTxt, sitemaps };
}

/**
 * Corre las sub-dimensiones de Readiness sobre un AuditContext ya armado
 * (páginas + robots + sitemaps + pagespeed) y devuelve las mediciones, los
 * DimensionScore por sub-dimensión y el roll-up de Readiness. Reutilizable
 * tanto para el proyecto como para competidores.
 */
export async function computeTopDimension(
  top: TopDimension,
  subDimensions: string[],
  ctx: AuditContext
): Promise<{ measurements: SignalMeasurement[]; subScores: DimensionScore[]; rollup: DimensionScore }> {
  const allMeasurements: SignalMeasurement[] = [];
  const subScores: DimensionScore[] = [];

  for (const sub of subDimensions) {
    const evaluators = evaluatorsForSubDimension(sub);
    if (evaluators.length === 0) continue;
    const measurements: SignalMeasurement[] = [];
    for (const ev of evaluators) {
      try {
        measurements.push(await ev.measure(ctx));
      } catch (err) {
        measurements.push({
          signalId: ev.definition.id,
          signalVersion: ev.definition.version,
          topDimension: ev.definition.topDimension,
          subDimension: ev.definition.subDimension,
          type: ev.definition.type,
          state: "failed",
          raw: {},
          normalized: null,
          confidence: null,
          error: err instanceof Error ? err.message : String(err),
          evidence: [],
        });
      }
    }
    allMeasurements.push(...measurements);
    const weights = Object.fromEntries(evaluators.map((e) => [e.definition.id, e.definition.weight]));
    subScores.push(
      aggregateDimension({
        topDimension: top,
        subDimension: sub,
        totalSignals: evaluators.length,
        measurements,
        weights,
      })
    );
  }

  const rollup = aggregateTopDimension({
    topDimension: top,
    expectedSubDimensions: subDimensions.length,
    subScores,
  });
  return { measurements: allMeasurements, subScores, rollup };
}

/** Atajo de Readiness (reutilizado por el pipeline de competidores). */
export async function computeReadiness(ctx: AuditContext): Promise<{
  measurements: SignalMeasurement[];
  subScores: DimensionScore[];
  readiness: DimensionScore;
}> {
  const r = await computeTopDimension("readiness", [...READINESS_SUBDIMENSIONS], ctx);
  return { measurements: r.measurements, subScores: r.subScores, readiness: r.rollup };
}

/**
 * Fetch de resultados orgánicos para las queries objetivo (cap de quota).
 * Devuelve undefined si SERP no está configurado o no hay queries → las señales
 * de Visibility quedan unavailable (no ensucian).
 */
async function fetchSerpForQueries(
  queries: { text: string; priority: number }[]
): Promise<SerpQueryResult[] | undefined> {
  if (!serpEnabled() || queries.length === 0) return undefined;
  const top = [...queries].sort((a, b) => b.priority - a.priority).slice(0, SERP_QUERY_CAP);
  const out: SerpQueryResult[] = [];
  for (const q of top) {
    const organic = await fetchOrganicResults(q.text);
    out.push({ query: q.text, priority: q.priority, organic });
  }
  return out;
}

/** Corre la auditoría P0 (dimensión Discoverability) y persiste un snapshot. */
export async function runAudit(projectId: string): Promise<{ snapshotId: string; measured: number }> {
  const built = await buildAuditContext(projectId);
  if (!built) throw new Error("run_audit: proyecto no encontrado");
  const { ctx, crawlId } = built;
  if (ctx.pages.length === 0) {
    throw new Error("run_audit: no hay páginas crawleadas. Corré un crawl primero.");
  }

  // PageSpeed del root (external, no determinista). Best-effort: si falla,
  // las señales de performance quedan unavailable y no arrastran.
  ctx.pagespeed = [await fetchPageSpeed(ctx.rootUrl)];

  // SERP para las queries objetivo (Visibility). Best-effort: sin key → serp
  // queda undefined y las señales de Visibility salen unavailable.
  ctx.serp = await fetchSerpForQueries(ctx.targetQueries ?? []);

  // Computa las 3 dimensiones top (readiness/authority/visibility).
  const allMeasurements: SignalMeasurement[] = [];
  const dimensionRows: DimensionScore[] = [];
  for (const top of Object.keys(SUBDIMENSIONS_BY_TOP) as TopDimension[]) {
    const { measurements: ms, subScores, rollup } = await computeTopDimension(
      top,
      SUBDIMENSIONS_BY_TOP[top],
      ctx
    );
    allMeasurements.push(...ms);
    dimensionRows.push(rollup, ...subScores);
  }
  const readinessScore = dimensionRows.find(
    (d) => d.topDimension === "readiness" && d.subDimension === null
  )!;
  const measurements = allMeasurements;

  const db = createServiceClient();
  const { data, error } = await db.rpc("insert_audit_snapshot", {
    p_project_id: projectId,
    p_methodology_version: METHODOLOGY_VERSION,
    p_signal_registry_version: signalRegistryVersion(),
    p_input_kind: "site",
    p_root_url: ctx.rootUrl,
    p_crawl_id: crawlId,
    p_measurements: measurements.map((m) => ({
      signal_id: m.signalId,
      signal_version: m.signalVersion,
      top_dimension: m.topDimension,
      sub_dimension: m.subDimension,
      type: m.type,
      state: m.state,
      raw: m.raw,
      normalized: m.normalized,
      confidence: m.confidence,
      model: m.model ?? null,
      prompt_version: m.promptVersion ?? null,
      error: m.error ?? null,
      evidence: m.evidence,
    })) as unknown as never,
    p_dimensions: dimensionRows.map((d) => ({
      top_dimension: d.topDimension,
      sub_dimension: d.subDimension,
      score: d.score,
      state: d.state,
      coverage: d.coverage,
      confidence: d.confidence,
      measured_signals: d.measuredSignals,
      total_signals: d.totalSignals,
    })) as unknown as never,
  });
  if (error) throw new Error(`run_audit: persist ${error.message}`);

  return { snapshotId: data as unknown as string, measured: readinessScore.measuredSignals };
}
