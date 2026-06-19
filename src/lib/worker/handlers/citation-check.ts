import { createServiceClient } from "@/lib/supabase";
import { assessCitation } from "@/lib/ai/citation";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

// How many top-priority questions to check per run (keeps cost bounded).
const MAX_QUESTIONS = 5;

/**
 * citation_check handler (lightweight, Phase 1).
 * For the top key questions, uses a web-search proxy to assess whether the
 * brand is cited when answering, recording one citation_checks row per
 * question under the 'claude' engine (a generative-search proxy). Other
 * engines (chatgpt/perplexity/gemini) can be entered manually via the API.
 *
 * Payload: { limit?: number }
 */
export async function handleCitationCheck(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const { limit } = (ctx.payload ?? {}) as { limit?: number };
  const n = Math.min(Math.max(limit ?? MAX_QUESTIONS, 1), 15);

  const { data: project } = await db
    .from("projects")
    .select("name, domain")
    .eq("id", ctx.projectId)
    .single();
  if (!project) throw new Error("citation_check: proyecto no encontrado");

  const { data: questions } = await db
    .from("questions")
    .select("text, priority_score")
    .eq("project_id", ctx.projectId)
    .order("priority_score", { ascending: false })
    .limit(n);
  if (!questions || questions.length === 0) {
    throw new Error("citation_check: no hay preguntas. Corré el descubrimiento primero.");
  }

  let checked = 0;
  let cited = 0;
  for (const q of questions) {
    const result = await assessCitation({
      question: q.text,
      brand: project.name,
      domain: project.domain,
    });
    await db.from("citation_checks").insert({
      project_id: ctx.projectId,
      question: q.text,
      engine: "claude", // generative-search proxy
      cited: result.cited,
      position: result.position,
      checked_at: new Date().toISOString(),
    });
    checked++;
    if (result.cited) cited++;
  }

  return { checked, cited } as Json;
}
