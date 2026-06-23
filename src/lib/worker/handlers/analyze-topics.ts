import { createServiceClient } from "@/lib/supabase";
import { analyzeTopics } from "@/lib/ai/topics";
import { detectSections } from "@/lib/ai/sections";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

/**
 * analyze_topics handler.
 * Reads the latest crawl's pages, asks Claude to produce a topic_summary and
 * topic clusters, AND detects the site's sections (suggesting a type +
 * matching system intent template per section). Persists topics + sections.
 *
 * Section detection only seeds NEW sections — it never overwrites sections the
 * user has already confirmed/edited (matched by name), so the hybrid flow's
 * manual confirmations survive a re-analysis.
 */
export async function handleAnalyzeTopics(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();

  const { data: pages, error } = await db
    .from("pages")
    .select("url, title, clean_text")
    .eq("project_id", ctx.projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`analyze_topics: ${error.message}`);
  if (!pages || pages.length === 0) {
    throw new Error("analyze_topics: no hay páginas crawleadas. Corré un crawl primero.");
  }

  const analysis = await analyzeTopics(
    pages.map((p) => ({ url: p.url, title: p.title, cleanText: p.clean_text }))
  );

  await db
    .from("projects")
    .update({ topic_summary: analysis.topic_summary })
    .eq("id", ctx.projectId);

  // Replace topics for a clean re-analysis.
  await db.from("topics").delete().eq("project_id", ctx.projectId);
  if (analysis.topics.length > 0) {
    const { error: insErr } = await db.from("topics").insert(
      analysis.topics.map((t) => ({
        project_id: ctx.projectId,
        name: t.name,
        summary: t.summary,
        priority: t.priority,
      }))
    );
    if (insErr) throw new Error(`analyze_topics: insert topics ${insErr.message}`);
  }

  // --- Section detection (hybrid: suggest, user confirms in UI) ---
  const detected = await detectSections({
    topicSummary: analysis.topic_summary,
    pages: pages.map((p) => ({
      url: p.url,
      title: p.title,
      summary: p.clean_text.slice(0, 250),
    })),
  });

  // System intent templates, keyed by section_type, for defaults.
  const { data: templates } = await db
    .from("intent_templates")
    .select("id, section_type, default_min, default_target")
    .is("project_id", null)
    .eq("is_system", true);
  const tmplByType = new Map((templates ?? []).map((t) => [t.section_type, t]));

  // Don't clobber sections the user already has (match by name, case-insensitive).
  const { data: existing } = await db
    .from("sections")
    .select("name")
    .eq("project_id", ctx.projectId);
  const existingNames = new Set((existing ?? []).map((s) => s.name.trim().toLowerCase()));

  const toInsert = detected
    .filter((s) => !existingNames.has(s.name.trim().toLowerCase()))
    .map((s) => {
      const tmpl = tmplByType.get(s.suggested_type);
      return {
        project_id: ctx.projectId,
        name: s.name,
        urls: s.urls as unknown as Json,
        section_type: s.suggested_type,
        suggested_type: s.suggested_type,
        is_priority: true,
        weight: 1,
        intent_template_id: tmpl?.id ?? null,
        min_faqs: tmpl?.default_min ?? 5,
        target_faqs: tmpl?.default_target ?? 10,
        status: "active",
      };
    });
  if (toInsert.length > 0) {
    await db.from("sections").insert(toInsert);
  }

  return {
    topic_summary: analysis.topic_summary,
    topics_count: analysis.topics.length,
    sections_detected: detected.length,
    sections_new: toInsert.length,
  } as Json;
}
