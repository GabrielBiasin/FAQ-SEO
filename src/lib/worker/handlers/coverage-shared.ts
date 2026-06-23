import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SectionRow } from "@/types/database";
import type {
  CoverageQuestion,
  generateCoverageQuestions as GenFn,
} from "@/lib/ai/coverage";

type DB = SupabaseClient<Database>;

interface PageRow {
  id: string;
  url: string;
  title: string | null;
  clean_text: string;
}

// Cheap dedupe key: lowercased, accent-stripped, punctuation-free.
function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a section's effective intent brief: explicit override wins, else the
 * linked template's brief, else a generic fallback.
 */
async function resolveIntentBrief(db: DB, section: SectionRow): Promise<string> {
  if (section.intent_override && section.intent_override.trim()) {
    return section.intent_override.trim();
  }
  if (section.intent_template_id) {
    const { data: tmpl } = await db
      .from("intent_templates")
      .select("intent_brief")
      .eq("id", section.intent_template_id)
      .single();
    if (tmpl?.intent_brief) return tmpl.intent_brief;
  }
  return "Preguntas relevantes para esta sección, fundadas en el contenido real de la empresa.";
}

/**
 * Top up a single section to its target using coverage-class questions only.
 * Generates in rounds, deduping against existing questions, until target is hit
 * or maxRounds is exhausted. Returns the number of questions added.
 *
 * `extraIntent` is the free-text angle from the "Ampliar sección" button.
 * When `force` is true (expand button) it generates even if already at/above min.
 */
export async function runCoverageForSection(opts: {
  db: DB;
  projectId: string;
  section: SectionRow;
  pages: PageRow[];
  maxRounds: number;
  generate: typeof GenFn;
  extraIntent?: string | null;
  force?: boolean;
}): Promise<number> {
  const { db, projectId, section, pages, maxRounds, generate, extraIntent, force } = opts;

  const intentBrief = await resolveIntentBrief(db, section);

  // Pages most relevant to this section: those whose url is listed, else all.
  const urls = Array.isArray(section.urls) ? (section.urls as string[]) : [];
  const sectionPages = urls.length
    ? pages.filter((p) => urls.includes(p.url))
    : pages;
  const usePages = (sectionPages.length ? sectionPages : pages).map((p) => ({
    url: p.url,
    title: p.title,
    cleanText: p.clean_text,
  }));

  let added = 0;
  for (let round = 0; round < maxRounds; round++) {
    // Current questions in this section.
    const { data: current } = await db
      .from("questions")
      .select("text")
      .eq("project_id", projectId)
      .eq("section_id", section.id);
    const currentCount = current?.length ?? 0;
    const target = section.target_faqs;

    // Stop when we've reached target (or, unless forced, the min is satisfied).
    if (currentCount >= target) break;
    if (!force && currentCount >= section.min_faqs && round > 0) break;

    const needed = Math.max(target - currentCount, 0);
    if (needed === 0) break;

    const existingTexts = (current ?? []).map((q) => q.text);
    const generated: CoverageQuestion[] = await generate({
      sectionName: section.name,
      sectionType: section.section_type,
      intentBrief,
      extraIntent: extraIntent ?? null,
      existingQuestions: existingTexts,
      pages: usePages,
      needed,
    });

    // Dedupe against existing + within this batch.
    const seen = new Set(existingTexts.map(norm));
    const fresh = generated.filter((q) => {
      const k = norm(q.text);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (fresh.length === 0) break; // model has nothing new to add

    const { error } = await db.from("questions").insert(
      fresh.map((q) => ({
        project_id: projectId,
        section_id: section.id,
        text: q.text,
        tier: q.tier,
        intent: q.intent,
        source: "content",
        question_class: "coverage" as const,
        priority_score: 50,
        status: "active",
      }))
    );
    if (error) break;
    added += fresh.length;
  }
  return added;
}
