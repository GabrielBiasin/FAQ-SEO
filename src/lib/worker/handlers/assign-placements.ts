import { createServiceClient } from "@/lib/supabase";
import { assignPlacements } from "@/lib/ai/placement";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

/**
 * assign_placements handler.
 * Maps each question to the site section/page where its FAQ should live
 * (Home, Contacto, each service/product page), targeting 5–10 per relevant
 * section. Stores placement_page_id + placement_section on each question.
 */
export async function handleAssignPlacements(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();

  const [{ data: questions }, { data: pages }] = await Promise.all([
    db
      .from("questions")
      .select("id, text, tier, intent")
      .eq("project_id", ctx.projectId)
      .order("priority_score", { ascending: false }),
    db
      .from("pages")
      .select("id, url, title, clean_text")
      .eq("project_id", ctx.projectId)
      .order("created_at", { ascending: true }),
  ]);

  if (!questions || questions.length === 0) {
    throw new Error("assign_placements: no hay preguntas. Corré el descubrimiento primero.");
  }
  if (!pages || pages.length === 0) {
    throw new Error("assign_placements: no hay páginas. Corré un crawl primero.");
  }

  const placements = await assignPlacements({
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      tier: q.tier,
      intent: q.intent,
    })),
    pages: pages.map((p) => ({
      id: p.id,
      url: p.url,
      title: p.title,
      summary: p.clean_text.slice(0, 300),
    })),
  });

  // Apply placements per question.
  let updated = 0;
  for (const pl of placements) {
    const { error } = await db
      .from("questions")
      .update({
        placement_page_id: pl.placement_page_id,
        placement_section: pl.section,
      })
      .eq("id", pl.question_id)
      .eq("project_id", ctx.projectId);
    if (!error) updated++;
  }

  // Tally per-section counts for visibility.
  const counts: Record<string, number> = {};
  for (const pl of placements) counts[pl.section] = (counts[pl.section] ?? 0) + 1;

  return { updated, sections: counts } as Json;
}
