import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// GET — list questions (ordered by topic priority then general→specific)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  const { data: questions, error } = await db
    .from("questions")
    .select("*")
    .eq("project_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: topics } = await db
    .from("topics")
    .select("id, name, priority")
    .eq("project_id", id);

  const { data: pages } = await db
    .from("pages")
    .select("id, url, title")
    .eq("project_id", id);

  const { data: sections } = await db
    .from("sections")
    .select("id, name, section_type, min_faqs, target_faqs, weight, is_priority")
    .eq("project_id", id)
    .order("weight", { ascending: false });

  return NextResponse.json({
    questions: questions ?? [],
    topics: topics ?? [],
    pages: pages ?? [],
    sections: sections ?? [],
  });
}

// POST — either launch discovery ({ action: "discover" }) or add one question
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = createServiceClient();

  if (body?.action === "discover") {
    const { count } = await db
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id);
    if (!count) {
      return NextResponse.json(
        { error: "No hay páginas crawleadas. Corré un crawl primero." },
        { status: 400 }
      );
    }
    const job = await enqueueJob(id, "discover_questions", {});
    return NextResponse.json({ job }, { status: 201 });
  }

  if (body?.action === "assign_placements") {
    const { count } = await db
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id);
    if (!count) {
      return NextResponse.json(
        { error: "No hay preguntas. Corré el descubrimiento primero." },
        { status: 400 }
      );
    }
    const job = await enqueueJob(id, "assign_placements", {});
    return NextResponse.json({ job }, { status: 201 });
  }

  // Manual add.
  const text = String(body?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text requerido" }, { status: 400 });
  const { data, error } = await db
    .from("questions")
    .insert({
      project_id: id,
      topic_id: body.topic_id ?? null,
      text,
      tier: body.tier ?? "mid",
      intent: body.intent ?? "definitional",
      source: "manual",
      priority_score: Number(body.priority_score) || 50,
      status: "active",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data }, { status: 201 });
}
