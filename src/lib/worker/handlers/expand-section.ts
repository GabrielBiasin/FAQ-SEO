import { createServiceClient } from "@/lib/supabase";
import { generateCoverageQuestions } from "@/lib/ai/coverage";
import { runCoverageForSection } from "./coverage-shared";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

/**
 * expand_section handler.
 * Generates additional coverage-class questions for one section, guided by a
 * free-text intent the user typed, deduped against existing questions.
 *
 * Payload: { section_id: string, intent_text?: string }
 */
export async function handleExpandSection(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const { section_id, intent_text } = (ctx.payload ?? {}) as {
    section_id?: string;
    intent_text?: string;
  };
  if (!section_id) throw new Error("expand_section: payload.section_id requerido");

  const { data: section, error } = await db
    .from("sections")
    .select("*")
    .eq("id", section_id)
    .eq("project_id", ctx.projectId)
    .single();
  if (error || !section) throw new Error("expand_section: sección no encontrada");

  const { data: pages } = await db
    .from("pages")
    .select("id, url, title, clean_text")
    .eq("project_id", ctx.projectId)
    .order("created_at", { ascending: true });
  if (!pages || pages.length === 0) {
    throw new Error("expand_section: no hay páginas. Corré un crawl primero.");
  }

  const added = await runCoverageForSection({
    db,
    projectId: ctx.projectId,
    section,
    pages,
    maxRounds: 2,
    generate: generateCoverageQuestions,
    extraIntent: intent_text ?? null,
    force: true,
  });

  return { added, section: section.name } as Json;
}
