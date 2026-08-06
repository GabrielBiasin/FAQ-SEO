import { createServiceClient } from "@/lib/supabase";
import { USER_AGENT } from "@/lib/crawler";
import type { AuditContext, AuditPage, DimensionScore, SignalMeasurement } from "./types";
import {
  METHODOLOGY_VERSION,
  evaluatorsForSubDimension,
  signalRegistryVersion,
} from "./registry";
import { aggregateDimension, aggregateTopDimension } from "./aggregate";
import { fetchPageSpeed } from "./pagespeed";
// Importar registra las señales en el registry.
import { READINESS_SUBDIMENSIONS } from "./signals";

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
    .select("id, url, title, headings, clean_text, word_count, http_status, canonical_url, meta_robots, hreflang, internal_links")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const rootUrl = project.root_url;
  const origin = new URL(rootUrl).origin;

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
    cleanText: p.clean_text,
    wordCount: p.word_count,
  }));

  // robots.txt + sitemaps (pocas fetches).
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

  return {
    ctx: { projectId, rootUrl, origin, pages, robotsTxt, sitemaps },
    crawlId: crawl?.id ?? null,
  };
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

  const allMeasurements: SignalMeasurement[] = [];
  const subScores: DimensionScore[] = [];

  for (const sub of READINESS_SUBDIMENSIONS) {
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
        topDimension: "readiness",
        subDimension: sub,
        totalSignals: evaluators.length,
        measurements,
        weights,
      })
    );
  }

  // Roll-up de Readiness a partir de las sub-dimensiones.
  const readinessScore = aggregateTopDimension({
    topDimension: "readiness",
    expectedSubDimensions: READINESS_SUBDIMENSIONS.length,
    subScores,
  });
  const dimensionRows = [readinessScore, ...subScores];
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
