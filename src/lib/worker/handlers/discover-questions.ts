import { createServiceClient } from "@/lib/supabase";
import { researchDemand } from "@/lib/ai/demand";
import { synthesizeQuestions, type CandidateQuestion } from "@/lib/ai/questions";
import { generateCoverageQuestions } from "@/lib/ai/coverage";
import { gatherSerpSignals } from "@/lib/serp";
import { runCoverageForSection } from "./coverage-shared";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

const MAX_EXPAND_ROUNDS = 2;

/**
 * discover_questions handler — the multi-source demand funnel + coverage loop.
 *
 * Sources feeding the synthesis step:
 *   1. seed_questions loaded by the user (sales/support) — highest priority and
 *      also used to bias discovery toward similar topics.
 *   2. Web-search demand research (real questions found online).
 *   3. PAA/autocomplete via SERP provider (optional, skipped without a key).
 *   4. Content-derived questions (added by the synthesis model).
 *
 * The synthesis assigns each question a topic, a SECTION (where the FAQ should
 * live), and a CLASS (demand vs coverage). Demand obeys the no-invented-long-tail
 * guardrail; coverage may be generated from real company info. Then a coverage
 * loop tops up any priority section below its min_faqs using only coverage-class
 * questions (never fabricated demand).
 */
export async function handleDiscoverQuestions(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();

  const [{ data: project }, { data: topics }, { data: pages }, { data: seeds }, { data: sections }] =
    await Promise.all([
      db.from("projects").select("topic_summary").eq("id", ctx.projectId).single(),
      db.from("topics").select("name, summary").eq("project_id", ctx.projectId).order("priority", { ascending: false }),
      db.from("pages").select("id, url, title, clean_text").eq("project_id", ctx.projectId).order("created_at", { ascending: true }),
      db.from("seed_questions").select("text, source").eq("project_id", ctx.projectId),
      db.from("sections").select("*").eq("project_id", ctx.projectId),
    ]);

  if (!pages || pages.length === 0) {
    throw new Error("discover_questions: no hay páginas. Corré un crawl primero.");
  }

  const topicList = (topics ?? []).map((t) => ({ name: t.name, summary: t.summary ?? "" }));
  const topicNames = topicList.map((t) => t.name);
  const sectionList = (sections ?? []).map((s) => ({ name: s.name, section_type: s.section_type }));

  // Seeds bias discovery: include their text as extra demand queries.
  const seedTexts = (seeds ?? []).map((s) => s.text);

  // --- Gather external demand signals in parallel ---
  const [demand, serp] = await Promise.all([
    topicNames.length || seedTexts.length
      ? researchDemand(project?.topic_summary ?? "", [...topicNames, ...seedTexts.slice(0, 5)]).catch(() => [])
      : Promise.resolve([]),
    gatherSerpSignals(
      [...topicNames, ...seedTexts].length ? [...topicNames, ...seedTexts] : [project?.topic_summary ?? ""]
    ).catch(() => []),
  ]);

  const candidates: CandidateQuestion[] = [
    ...(seeds ?? []).map((s) => ({ text: s.text, source: s.source })),
    ...demand.map((d) => ({ text: d.text, source: "web_search" })),
    ...serp.map((s) => ({ text: s.text, source: s.source })),
  ];

  // --- Synthesize the final question set ---
  const synthesized = await synthesizeQuestions({
    topics: topicList,
    sections: sectionList,
    pages: pages.map((p) => ({ url: p.url, title: p.title, cleanText: p.clean_text })),
    candidates,
  });

  // Map topic + section names back to ids.
  const topicIdByName = new Map<string, string>();
  const { data: topicRows } = await db
    .from("topics")
    .select("id, name")
    .eq("project_id", ctx.projectId);
  for (const t of topicRows ?? []) topicIdByName.set(t.name, t.id);
  const sectionIdByName = new Map((sections ?? []).map((s) => [s.name, s.id]));

  // Replace existing questions for a clean re-run.
  await db.from("questions").delete().eq("project_id", ctx.projectId);

  if (synthesized.length > 0) {
    const { error } = await db.from("questions").insert(
      synthesized.map((q) => ({
        project_id: ctx.projectId,
        topic_id: q.topic ? topicIdByName.get(q.topic) ?? null : null,
        section_id: q.section ? sectionIdByName.get(q.section) ?? null : null,
        text: q.text,
        tier: q.tier,
        intent: q.intent,
        source: q.source,
        question_class: q.question_class,
        priority_score: q.priority_score,
        status: "active",
      }))
    );
    if (error) throw new Error(`discover_questions: insert ${error.message}`);
  }

  // --- Coverage loop: top up priority sections below min_faqs ---
  let coverageAdded = 0;
  for (const section of (sections ?? []).filter((s) => s.is_priority && s.status === "active")) {
    const added = await runCoverageForSection({
      db,
      projectId: ctx.projectId,
      section,
      pages,
      maxRounds: MAX_EXPAND_ROUNDS,
      generate: generateCoverageQuestions,
    });
    coverageAdded += added;
  }

  return {
    questions_count: synthesized.length + coverageAdded,
    candidates_count: candidates.length,
    coverage_added: coverageAdded,
    seeds: seeds?.length ?? 0,
    demand: demand.length,
    serp: serp.length,
  } as Json;
}
