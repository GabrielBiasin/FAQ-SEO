import { createServiceClient } from "@/lib/supabase";
import { generateAnswer, ANSWERS_PROMPT_VERSION } from "@/lib/ai/answers";
import { topPagesForQuestion } from "@/lib/retrieval";
import { enqueueJob } from "@/lib/jobs";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

// Questions generated per invocation. Kept small so each job finishes well
// within the serverless timeout; the rest is processed by a continuation job.
const BATCH = 6;

/**
 * generate_answers handler (batched).
 * Generates answer-first grounded FAQs for questions that don't have one yet,
 * a few per run, re-enqueuing itself until all are done — then chains
 * verify_answers. This keeps every invocation short and crash-safe.
 *
 * Payload: { question_ids?: string[], continued?: boolean }. The first call
 * (not continued) clears prior FAQs for the target questions.
 */
export async function handleGenerateAnswers(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const payload = (ctx.payload ?? {}) as { question_ids?: string[]; continued?: boolean };

  const [{ data: project }, { data: pages }] = await Promise.all([
    db.from("projects").select("voice_guide").eq("id", ctx.projectId).single(),
    db
      .from("pages")
      .select("id, url, title, clean_text")
      .eq("project_id", ctx.projectId)
      .order("created_at", { ascending: true }),
  ]);
  if (!pages || pages.length === 0) {
    throw new Error("generate_answers: no hay páginas. Corré un crawl primero.");
  }

  // Target question set.
  let qQuery = db.from("questions").select("id, text").eq("project_id", ctx.projectId);
  if (payload.question_ids?.length) qQuery = qQuery.in("id", payload.question_ids);
  const { data: questions, error: qErr } = await qQuery;
  if (qErr) throw new Error(`generate_answers: ${qErr.message}`);
  if (!questions || questions.length === 0) {
    throw new Error("generate_answers: no hay preguntas. Corré el descubrimiento primero.");
  }
  const targetIds = questions.map((q) => q.id);

  // SAFEGUARD: never touch approved FAQs (human-reviewed work). Questions that
  // already have an approved FAQ are skipped entirely.
  const { data: approved } = await db
    .from("faqs")
    .select("question_id")
    .eq("project_id", ctx.projectId)
    .eq("status", "approved")
    .in("question_id", targetIds);
  const approvedQ = new Set((approved ?? []).map((f) => f.question_id));

  // On the first call, clear only NON-approved prior FAQs for a fresh run.
  if (!payload.continued) {
    await db
      .from("faqs")
      .delete()
      .eq("project_id", ctx.projectId)
      .neq("status", "approved")
      .in("question_id", targetIds);
  }

  // Questions that still need a FAQ (idempotent across continuations), excluding
  // those whose FAQ is already approved.
  const { data: existingFaqs } = await db
    .from("faqs")
    .select("question_id")
    .eq("project_id", ctx.projectId)
    .in("question_id", targetIds);
  const done = new Set((existingFaqs ?? []).map((f) => f.question_id));
  const remaining = questions.filter((q) => !done.has(q.id) && !approvedQ.has(q.id));

  const rankable = pages.map((p) => ({
    id: p.id,
    url: p.url,
    title: p.title,
    cleanText: p.clean_text,
  }));

  const batch = remaining.slice(0, BATCH);
  let generated = 0;
  for (const q of batch) {
    const top = topPagesForQuestion(q.text, rankable, 3);
    const answer = await generateAnswer({
      question: q.text,
      pages: top,
      voiceGuide: project?.voice_guide ?? null,
    });
    const { error } = await db.from("faqs").insert({
      project_id: ctx.projectId,
      question_id: q.id,
      answer_text: answer.answer_text,
      source_page_id: answer.source_page_id,
      status: answer.grounded ? "draft" : "needs_review",
      confidence: null,
      unsupported_claims: [],
      prompt_version: ANSWERS_PROMPT_VERSION,
    });
    if (error) throw new Error(`generate_answers: insert ${error.message}`);
    generated++;
  }

  const stillRemaining = remaining.length - batch.length;
  if (stillRemaining > 0) {
    // More to do: continue with the same target set.
    await enqueueJob(ctx.projectId, "generate_answers", {
      question_ids: payload.question_ids ?? undefined,
      continued: true,
    });
  } else {
    // All generated → verify everything that hasn't been verified yet.
    await enqueueJob(ctx.projectId, "verify_answers", {});
  }

  return { generated, remaining: stillRemaining } as Json;
}
