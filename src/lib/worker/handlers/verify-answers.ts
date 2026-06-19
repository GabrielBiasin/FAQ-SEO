import { createServiceClient } from "@/lib/supabase";
import { verifyAnswer } from "@/lib/ai/verify";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

// Answers below this confidence (or with unsupported claims) need human review.
const CONFIDENCE_THRESHOLD = 0.8;

/**
 * verify_answers handler.
 * For each FAQ, checks the answer claim-by-claim against its source page's
 * clean_text. Unsupported claims and low confidence flip status to
 * needs_review; otherwise the draft is left as draft (ready for approval).
 *
 * Payload: { faq_ids?: string[] } to scope; otherwise all draft/needs_review.
 */
export async function handleVerifyAnswers(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const payload = (ctx.payload ?? {}) as { faq_ids?: string[] };

  let q = db
    .from("faqs")
    .select("id, answer_text, source_page_id, status")
    .eq("project_id", ctx.projectId);
  if (payload.faq_ids?.length) q = q.in("id", payload.faq_ids);
  else q = q.in("status", ["draft", "needs_review"]);

  const { data: faqs, error } = await q;
  if (error) throw new Error(`verify_answers: ${error.message}`);
  if (!faqs || faqs.length === 0) return { verified: 0 } as Json;

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
        // Don't downgrade an already-approved FAQ; only set draft/needs_review.
        status: needsReview ? "needs_review" : "draft",
      })
      .eq("id", faq.id);

    if (needsReview) flagged++;
    verified++;
  }

  return { verified, flagged } as Json;
}
