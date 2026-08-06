import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { computeDemandCoverage, type DemandItem, type OfferPage } from "@/lib/audit/coverage";

// GET /api/projects/:id/coverage — matriz de cobertura de demanda (live).
// Cruza las preguntas objetivo (demanda) contra las páginas crawleadas (oferta).
// Determinista: se computa al vuelo, sin persistir todavía.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  const [{ data: qs }, { data: pageRows }, { data: topics }] = await Promise.all([
    db
      .from("questions")
      .select("id, text, priority_score, intent, topic_id")
      .eq("project_id", id),
    db
      .from("pages")
      .select("id, url, title, headings, clean_text")
      .eq("project_id", id),
    db.from("topics").select("id, name").eq("project_id", id),
  ]);

  if (!qs || qs.length === 0) {
    return NextResponse.json({ summary: null, reason: "no_demand" });
  }
  if (!pageRows || pageRows.length === 0) {
    return NextResponse.json({ summary: null, reason: "no_pages" });
  }

  const topicName = new Map((topics ?? []).map((t) => [t.id, t.name]));
  const demand: DemandItem[] = qs.map((q) => ({
    id: q.id,
    text: q.text,
    priority: q.priority_score ?? 1,
    intent: q.intent ?? null,
    topic: q.topic_id ? topicName.get(q.topic_id) ?? null : null,
  }));
  const pages: OfferPage[] = pageRows.map((p) => ({
    id: p.id,
    url: p.url,
    title: p.title,
    headings: (p.headings as unknown as { tag: string; text: string }[]) ?? [],
    cleanText: p.clean_text ?? "",
  }));

  const summary = computeDemandCoverage(demand, pages);
  return NextResponse.json({ summary });
}
