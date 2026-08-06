import { createServiceClient } from "@/lib/supabase";
import { crawlSite } from "@/lib/crawler";
import type { JobContext } from "../index";
import type { AuditPage } from "@/lib/audit/types";
import { buildContextFromPages, computeReadiness } from "@/lib/audit/runner";
import { fetchPageSpeed } from "@/lib/audit/pagespeed";
import { METHODOLOGY_VERSION, signalRegistryVersion } from "@/lib/audit/registry";
import { computeDemandCoverage, type DemandItem, type OfferPage } from "@/lib/audit/coverage";
import "@/lib/audit/signals"; // registra evaluadores
import type { Json } from "@/types/database";

interface Payload {
  competitor_id: string;
}

/**
 * run_competitor: crawl limitado del competidor + auditoría Readiness + cobertura
 * de la MISMA demanda del proyecto, y persiste un competitor_snapshot para el
 * benchmark relativo. Reutiliza el mismo pipeline determinista del proyecto.
 */
export async function handleRunCompetitor(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const { competitor_id } = ctx.payload as unknown as Payload;
  if (!competitor_id) throw new Error("run_competitor: payload.competitor_id requerido");

  const { data: comp, error: cErr } = await db
    .from("competitors")
    .select("*")
    .eq("id", competitor_id)
    .single();
  if (cErr || !comp) throw new Error(`run_competitor: competidor ${competitor_id} no encontrado`);

  await db
    .from("competitors")
    .update({ status: "running", error: null, pages_count: 0 })
    .eq("id", competitor_id);
  await db.from("competitor_pages").delete().eq("competitor_id", competitor_id);

  const crawled: AuditPage[] = [];
  try {
    await crawlSite({
      rootUrl: comp.root_url,
      maxPages: comp.max_pages,
      onPage: async (page) => {
        const { data: inserted } = await db
          .from("competitor_pages")
          .insert({
            competitor_id,
            url: page.url,
            title: page.title,
            headings: page.headings as unknown as Json,
            clean_text: page.cleanText,
            word_count: page.wordCount,
            http_status: page.httpStatus,
            canonical_url: page.canonicalUrl,
            meta_robots: page.metaRobots,
            hreflang: page.hreflang as unknown as Json,
            internal_links: page.internalLinks as unknown as Json,
            meta_description: page.metaDescription,
            img_total: page.imgTotal,
            img_with_alt: page.imgWithAlt,
          })
          .select("id")
          .single();
        crawled.push({
          id: inserted?.id ?? page.url,
          url: page.url,
          title: page.title,
          httpStatus: page.httpStatus,
          canonicalUrl: page.canonicalUrl,
          metaRobots: page.metaRobots,
          hreflang: page.hreflang,
          headings: page.headings,
          internalLinks: page.internalLinks,
          metaDescription: page.metaDescription,
          imgTotal: page.imgTotal,
          imgWithAlt: page.imgWithAlt,
          cleanText: page.cleanText,
          wordCount: page.wordCount,
        });
        await db
          .from("competitors")
          .update({ pages_count: crawled.length })
          .eq("id", competitor_id);
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("competitors")
      .update({ status: "error", error: message, last_run_at: new Date().toISOString() })
      .eq("id", competitor_id);
    throw err;
  }

  if (crawled.length === 0) {
    await db
      .from("competitors")
      .update({ status: "error", error: "El crawl no devolvió páginas", last_run_at: new Date().toISOString() })
      .eq("id", competitor_id);
    return { pages: 0 } as Json;
  }

  // Readiness (mismo pipeline que el proyecto).
  const auditCtx = await buildContextFromPages(ctx.projectId, comp.root_url, crawled);
  auditCtx.pagespeed = [await fetchPageSpeed(comp.root_url)];
  const { subScores, readiness } = await computeReadiness(auditCtx);

  // Cobertura de la MISMA demanda del proyecto contra las páginas del competidor.
  const { data: qs } = await db
    .from("questions")
    .select("id, text, priority_score, intent, topic_id")
    .eq("project_id", ctx.projectId);
  let coverageScore: number | null = null;
  if (qs && qs.length > 0) {
    const demand: DemandItem[] = qs.map((q) => ({
      id: q.id,
      text: q.text,
      priority: q.priority_score ?? 1,
    }));
    const offer: OfferPage[] = crawled.map((p) => ({
      id: p.id,
      url: p.url,
      title: p.title,
      headings: p.headings,
      cleanText: p.cleanText,
    }));
    coverageScore = computeDemandCoverage(demand, offer).score;
  }

  const dimensions = [readiness, ...subScores].map((d) => ({
    top_dimension: d.topDimension,
    sub_dimension: d.subDimension,
    score: d.score,
    state: d.state,
    coverage: d.coverage,
  }));

  await db.from("competitor_snapshots").insert({
    competitor_id,
    methodology_version: METHODOLOGY_VERSION,
    signal_registry_version: signalRegistryVersion(),
    readiness_score: readiness.score,
    coverage_score: coverageScore,
    dimensions: dimensions as unknown as Json,
  });

  await db
    .from("competitors")
    .update({ status: "done", pages_count: crawled.length, last_run_at: new Date().toISOString() })
    .eq("id", competitor_id);

  return { pages: crawled.length, readiness: readiness.score, coverage: coverageScore } as Json;
}
