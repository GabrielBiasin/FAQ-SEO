import { createServiceClient } from "@/lib/supabase";
import { researchDemand } from "@/lib/ai/demand";
import { synthesizeQuestions, type CandidateQuestion } from "@/lib/ai/questions";
import { gatherSerpSignals } from "@/lib/serp";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

/**
 * discover_questions handler — the multi-source demand funnel.
 *
 * Sources feeding the synthesis step:
 *   1. seed_questions loaded by the user (sales/support) — highest priority.
 *   2. Web-search demand research (real questions found online).
 *   3. PAA/autocomplete via SERP provider (optional, skipped without a key).
 *   4. Content-derived questions (added by the synthesis model from the digest).
 *
 * The synthesis model clusters by topic, assigns tier/intent, dedupes, scores
 * priority, and orders general→specific. Long-tail is never fabricated — it
 * must trace back to a real signal.
 */
export async function handleDiscoverQuestions(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();

  const [{ data: project }, { data: topics }, { data: pages }, { data: seeds }] =
    await Promise.all([
      db.from("projects").select("topic_summary").eq("id", ctx.projectId).single(),
      db.from("topics").select("name, summary").eq("project_id", ctx.projectId).order("priority", { ascending: false }),
      db.from("pages").select("url, title, clean_text").eq("project_id", ctx.projectId).order("created_at", { ascending: true }),
      db.from("seed_questions").select("text, source").eq("project_id", ctx.projectId),
    ]);

  if (!pages || pages.length === 0) {
    throw new Error("discover_questions: no hay páginas. Corré un crawl primero.");
  }

  const topicList = (topics ?? []).map((t) => ({ name: t.name, summary: t.summary ?? "" }));
  const topicNames = topicList.map((t) => t.name);

  // --- Gather external demand signals in parallel ---
  const [demand, serp] = await Promise.all([
    topicNames.length
      ? researchDemand(project?.topic_summary ?? "", topicNames).catch(() => [])
      : Promise.resolve([]),
    gatherSerpSignals(topicNames.length ? topicNames : [project?.topic_summary ?? ""]).catch(
      () => []
    ),
  ]);

  const candidates: CandidateQuestion[] = [
    ...(seeds ?? []).map((s) => ({ text: s.text, source: s.source })),
    ...demand.map((d) => ({ text: d.text, source: "web_search" })),
    ...serp.map((s) => ({ text: s.text, source: s.source })),
  ];

  // --- Synthesize the final question set ---
  const synthesized = await synthesizeQuestions({
    topics: topicList,
    pages: pages.map((p) => ({ url: p.url, title: p.title, cleanText: p.clean_text })),
    candidates,
  });

  // Map topic names back to ids.
  const { data: topicRows } = await db
    .from("topics")
    .select("id, name")
    .eq("project_id", ctx.projectId);
  const topicIdByName = new Map((topicRows ?? []).map((t) => [t.name, t.id]));

  // Replace existing questions for a clean re-run.
  await db.from("questions").delete().eq("project_id", ctx.projectId);

  if (synthesized.length > 0) {
    const { error } = await db.from("questions").insert(
      synthesized.map((q) => ({
        project_id: ctx.projectId,
        topic_id: q.topic ? topicIdByName.get(q.topic) ?? null : null,
        text: q.text,
        tier: q.tier,
        intent: q.intent,
        source: q.source,
        priority_score: q.priority_score,
        status: "active",
      }))
    );
    if (error) throw new Error(`discover_questions: insert ${error.message}`);
  }

  return {
    questions_count: synthesized.length,
    candidates_count: candidates.length,
    seeds: seeds?.length ?? 0,
    demand: demand.length,
    serp: serp.length,
  } as Json;
}
