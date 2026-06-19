import { createServiceClient } from "@/lib/supabase";
import { judgeAnswer, JUDGE_MODEL } from "@/lib/ai/judge";
import { runProgrammaticChecks } from "@/lib/ai/checks";
import { ANSWERS_PROMPT_VERSION } from "@/lib/ai/answers";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

// An eval "passes" when the combined score clears this bar (1–5 scale).
const PASS_THRESHOLD = 4.0;

/**
 * run_eval handler.
 * Scores a batch of FAQs with the LLM judge + programmatic checks, attaches a
 * golden ideal answer when the question matches the gold set, and stores one
 * evals row per FAQ tagged with the generation prompt_version.
 *
 * Payload: { faq_ids?: string[] } to scope; otherwise all approved/draft FAQs.
 */
export async function handleRunEval(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const payload = (ctx.payload ?? {}) as { faq_ids?: string[] };

  let q = db
    .from("faqs")
    .select("id, question_id, answer_text, source_page_id, prompt_version")
    .eq("project_id", ctx.projectId);
  if (payload.faq_ids?.length) q = q.in("id", payload.faq_ids);
  else q = q.in("status", ["draft", "approved", "needs_review"]);

  const { data: faqs, error } = await q;
  if (error) throw new Error(`run_eval: ${error.message}`);
  if (!faqs || faqs.length === 0) return { evaluated: 0 } as Json;

  const [{ data: project }, { data: golden }] = await Promise.all([
    db.from("projects").select("voice_guide").eq("id", ctx.projectId).single(),
    db.from("golden_faqs").select("question, ideal_answer").eq("project_id", ctx.projectId),
  ]);

  const questionIds = Array.from(new Set(faqs.map((f) => f.question_id)));
  const { data: questions } = await db
    .from("questions")
    .select("id, text")
    .in("id", questionIds.length ? questionIds : ["00000000-0000-0000-0000-000000000000"]);
  const qText = new Map((questions ?? []).map((q) => [q.id, q.text]));

  const goldenByQ = new Map(
    (golden ?? []).map((g) => [g.question.trim().toLowerCase(), g.ideal_answer])
  );

  let evaluated = 0;
  let passed = 0;
  for (const faq of faqs) {
    const question = qText.get(faq.question_id) ?? "";
    let sourceText: string | null = null;
    if (faq.source_page_id) {
      const { data: page } = await db
        .from("pages")
        .select("clean_text")
        .eq("id", faq.source_page_id)
        .single();
      sourceText = page?.clean_text ?? null;
    }
    const ideal = goldenByQ.get(question.trim().toLowerCase()) ?? null;

    const [judge, prog] = await Promise.all([
      judgeAnswer({
        question,
        answer: faq.answer_text,
        sourceText,
        idealAnswer: ideal,
        voiceGuide: project?.voice_guide ?? null,
      }),
      Promise.resolve(runProgrammaticChecks(faq.answer_text)),
    ]);

    // Blend judge rubric with programmatic checks (judge weighted higher).
    const combined = Number(
      (
        judge.overall_score * 0.7 +
        ((prog.answer_first + prog.no_fluff + prog.length_ok + prog.format_valid) / 4) * 0.3
      ).toFixed(2)
    );
    const didPass = combined >= PASS_THRESHOLD;

    await db.from("evals").insert({
      project_id: ctx.projectId,
      faq_id: faq.id,
      prompt_version: faq.prompt_version || ANSWERS_PROMPT_VERSION,
      judge_model: JUDGE_MODEL,
      rubric_scores: {
        ...judge.scores,
        programmatic: prog,
        rationale: judge.rationale,
        has_golden: Boolean(ideal),
      } as unknown as Json,
      overall_score: combined,
      passed: didPass,
    });
    evaluated++;
    if (didPass) passed++;
  }

  return { evaluated, passed } as Json;
}
