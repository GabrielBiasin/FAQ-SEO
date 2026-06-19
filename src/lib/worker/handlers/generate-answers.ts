import { createServiceClient } from "@/lib/supabase";
import { generateAnswer, ANSWERS_PROMPT_VERSION } from "@/lib/ai/answers";
import { topPagesForQuestion } from "@/lib/retrieval";
import { enqueueJob } from "@/lib/jobs";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

/**
 * generate_answers handler.
 * For each question without an approved/draft FAQ, retrieves the best source
 * pages, generates an answer-first grounded answer, and stores a draft FAQ.
 * Then auto-enqueues verify_answers for the new drafts.
 *
 * Payload: { question_ids?: string[] } to scope a re-generation; otherwise all.
 */
export async function handleGenerateAnswers(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const payload = (ctx.payload ?? {}) as { question_ids?: string[] };

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

  let qQuery = db.from("questions").select("id, text").eq("project_id", ctx.projectId);
  if (payload.question_ids?.length) qQuery = qQuery.in("id", payload.question_ids);
  const { data: questions, error: qErr } = await qQuery;
  if (qErr) throw new Error(`generate_answers: ${qErr.message}`);
  if (!questions || questions.length === 0) {
    throw new Error("generate_answers: no hay preguntas. Corré el descubrimiento primero.");
  }

  const rankable = pages.map((p) => ({
    id: p.id,
    url: p.url,
    title: p.title,
    cleanText: p.clean_text,
  }));

  // Regenerating: clear prior FAQs for these questions.
  await db
    .from("faqs")
    .delete()
    .eq("project_id", ctx.projectId)
    .in(
      "question_id",
      questions.map((q) => q.id)
    );

  let generated = 0;
  const newFaqIds: string[] = [];
  for (const q of questions) {
    const top = topPagesForQuestion(q.text, rankable, 3);
    const answer = await generateAnswer({
      question: q.text,
      pages: top,
      voiceGuide: project?.voice_guide ?? null,
    });

    const { data: faq, error } = await db
      .from("faqs")
      .insert({
        project_id: ctx.projectId,
        question_id: q.id,
        answer_text: answer.answer_text,
        source_page_id: answer.source_page_id,
        // Ungrounded answers go straight to needs_review.
        status: answer.grounded ? "draft" : "needs_review",
        confidence: null,
        unsupported_claims: [],
        prompt_version: ANSWERS_PROMPT_VERSION,
      })
      .select("id")
      .single();
    if (error) throw new Error(`generate_answers: insert ${error.message}`);
    newFaqIds.push(faq.id);
    generated++;
  }

  // Chain verification automatically.
  if (newFaqIds.length > 0) {
    await enqueueJob(ctx.projectId, "verify_answers", { faq_ids: newFaqIds });
  }

  return { generated, verify_enqueued: newFaqIds.length } as Json;
}
