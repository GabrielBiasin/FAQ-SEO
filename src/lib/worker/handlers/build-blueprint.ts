import { createServiceClient } from "@/lib/supabase";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";
import { computeDemandCoverage, type DemandItem, type OfferPage } from "@/lib/audit/coverage";
import { generateBlueprint, renderDesignPrompt, type BlueprintInput } from "@/lib/architect/blueprint";

/**
 * build_blueprint: genera la arquitectura ideal del sitio a partir de la demanda
 * priorizada + estado de cobertura + estructura de competidores, y guarda el
 * blueprint + el brief en Markdown para IAs de diseño.
 */
export async function handleBuildBlueprint(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const projectId = ctx.projectId;

  const { data: project } = await db
    .from("projects")
    .select("name, root_url, topic_summary, voice_guide")
    .eq("id", projectId)
    .single();
  if (!project) throw new Error("build_blueprint: proyecto no encontrado");

  const [{ data: qs }, { data: pageRows }] = await Promise.all([
    db.from("questions").select("id, text, priority_score, intent").eq("project_id", projectId),
    db.from("pages").select("id, url, title, headings, clean_text").eq("project_id", projectId),
  ]);

  // Estado de cobertura por query (para priorizar gaps).
  const coverageByText = new Map<string, string>();
  if (qs && qs.length > 0 && pageRows && pageRows.length > 0) {
    const demand: DemandItem[] = qs.map((q) => ({ id: q.id, text: q.text, priority: q.priority_score ?? 1 }));
    const offer: OfferPage[] = pageRows.map((p) => ({
      id: p.id,
      url: p.url,
      title: p.title,
      headings: (p.headings as unknown as { tag: string; text: string }[]) ?? [],
      cleanText: p.clean_text ?? "",
    }));
    for (const r of computeDemandCoverage(demand, offer).rows) coverageByText.set(r.text, r.status);
  }

  // Estructura observada en competidores (títulos + H1/H2).
  const { data: competitors } = await db.from("competitors").select("id").eq("project_id", projectId);
  const compIds = (competitors ?? []).map((c) => c.id);
  const { data: compPages } = compIds.length
    ? await db.from("competitor_pages").select("title, headings").in("competitor_id", compIds).limit(200)
    : { data: [] as { title: string | null; headings: unknown }[] };
  const competitorTitles: string[] = [];
  for (const p of compPages ?? []) {
    if (p.title) competitorTitles.push(p.title);
    const hs = (p.headings as { tag: string; text: string }[]) ?? [];
    for (const h of hs) if (h.tag === "h1" || h.tag === "h2") competitorTitles.push(h.text);
  }

  const input: BlueprintInput = {
    brandName: project.name,
    rootUrl: project.root_url,
    topicSummary: project.topic_summary,
    voiceGuide: project.voice_guide,
    demand: (qs ?? []).map((q) => ({
      text: q.text,
      priority: q.priority_score ?? 1,
      intent: q.intent,
      coverage: coverageByText.get(q.text) ?? "missing",
    })),
    competitorTitles,
  };

  try {
    const { blueprint, model, promptVersion } = await generateBlueprint(input);
    const promptMd = renderDesignPrompt(input, blueprint);
    const { data, error } = await db
      .from("site_blueprints")
      .insert({
        project_id: projectId,
        status: "ready",
        structure: blueprint as unknown as Json,
        prompt_md: promptMd,
        model,
        prompt_version: promptVersion,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const segs = blueprint.segments.length;
    const pages = blueprint.segments.reduce((n, s) => n + s.pages.length, 0);
    return { blueprint_id: data.id, segments: segs, pages } as Json;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("site_blueprints").insert({
      project_id: projectId,
      status: "error",
      error: message,
    });
    throw err;
  }
}
