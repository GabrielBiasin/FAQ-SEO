import { createServiceClient } from "@/lib/supabase";
import { verifyAnswer } from "@/lib/ai/verify";
import { enqueueJob } from "@/lib/jobs";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

// Answers below this confidence (or with unsupported claims) need human review.
const CONFIDENCE_THRESHOLD = 0.8;
// FAQs verified per invocation; the rest continues in a follow-up job.
const BATCH = 6;

/**
 * verify_answers handler (batched).
 * Verifies un-verified FAQs (confidence is null) a few per run against their
 * source page, re-enqueuing itself until none remain. Keeps each invocation
 * short and crash-safe. Unsupported claims / low confidence → needs_review.
 *
 * Payload: { faq_ids?: string[] } to scope; otherwise all unverified.
 */
export async function handleVerifyAnswers(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const payload = (ctx.payload ?? {}) as { faq_ids?: string[] };

  // Only FAQs not yet verified (confidence null) and not approved/rejected.
  let q = db
    .from("faqs")
    .select("id, answer_text, source_page_id")
    .eq("project_id", ctx.projectId)
    .is("confidence", null)
    .in("status", ["draft", "needs_review"]);
  if (payload.faq_ids?.length) q = q.in("id", payload.faq_ids);

  const { data: faqs, error } = await q.limit(BATCH);
  if (error) throw new Error(`verify_answers: ${error.message}`);
  if (!faqs || faqs.length === 0) return { verified: 0, remaining: 0 } as Json;

  let flagged = 0;
  let verified = 0;
  for (const faq of faqs) {
    // No source or empty answer → cannot ground → needs review.
    if (!faq.source_page_id || !faq.answer_text.trim()) {
      await db
        .from("faqs")
        .update({ status: "needs_review", confidence: 0, unsupported_claims: [] })
        .eq("id", faq.id);
      flagged++;
      verified++;
      continue;
    }

    const { data: page } = await db
      .from("pages")
      .select("clean_text")
      .eq("id", faq.source_page_id)
      .single();

    const result = await verifyAnswer({
      answer: faq.answer_text,
      sourceText: page?.clean_text ?? "",
    });

    const needsReview =
      result.unsupported_claims.length > 0 || result.confidence < CONFIDENCE_THRESHOLD;

    await db
      .from("faqs")
      .update({
        confidence: result.confidence,
        unsupported_claims: result.unsupported_claims as unknown as Json,
        status: needsReview ? "needs_review" : "draft",
      })
      .eq("id", faq.id);

    if (needsReview) flagged++;
    verified++;
  }

  // If we filled the batch there are probably more — continue.
  if (faqs.length === BATCH) {
    await enqueueJob(ctx.projectId, "verify_answers", {
      faq_ids: payload.faq_ids ?? undefined,
    });
  }

  return { verified, flagged } as Json;
}
