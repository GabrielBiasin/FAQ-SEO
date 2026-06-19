import { createServiceClient } from "@/lib/supabase";
import { analyzeTopics } from "@/lib/ai/topics";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

/**
 * analyze_topics handler.
 * Reads the latest crawl's pages, asks Claude to produce a topic_summary and
 * topic clusters, then saves the summary on the project and (re)creates topics.
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

  // Save site-level summary on the project.
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

  return {
    topic_summary: analysis.topic_summary,
    topics_count: analysis.topics.length,
  } as Json;
}
