import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET — sections with coverage counts + available intent templates
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  const [{ data: sections, error }, { data: questions }, { data: templates }] =
    await Promise.all([
      db.from("sections").select("*").eq("project_id", id).order("weight", { ascending: false }),
      db.from("questions").select("section_id, question_class").eq("project_id", id),
      db
        .from("intent_templates")
        .select("id, key, name, section_type, intent_brief, default_min, default_target, is_system")
        .or(`project_id.eq.${id},project_id.is.null`),
    ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Per-section counts (total + coverage).
  const counts = new Map<string, { total: number; coverage: number }>();
  for (const q of questions ?? []) {
    if (!q.section_id) continue;
    if (!counts.has(q.section_id)) counts.set(q.section_id, { total: 0, coverage: 0 });
    const c = counts.get(q.section_id)!;
    c.total++;
    if (q.question_class === "coverage") c.coverage++;
  }

  const enriched = (sections ?? []).map((s) => ({
    ...s,
    count: counts.get(s.id)?.total ?? 0,
    coverage_count: counts.get(s.id)?.coverage ?? 0,
  }));

  const unassigned = (questions ?? []).filter((q) => !q.section_id).length;

  return NextResponse.json({
    sections: enriched,
    templates: templates ?? [],
    unassigned,
  });
}
