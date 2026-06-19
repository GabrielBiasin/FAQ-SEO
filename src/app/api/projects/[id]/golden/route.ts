import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET — list golden FAQs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { data, error } = await db
    .from("golden_faqs")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ golden: data });
}

// POST — add a golden FAQ
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? "").trim();
  const ideal_answer = String(body?.ideal_answer ?? "").trim();
  if (!question || !ideal_answer) {
    return NextResponse.json(
      { error: "question e ideal_answer son obligatorios" },
      { status: 400 }
    );
  }
  const db = createServiceClient();
  const { data, error } = await db
    .from("golden_faqs")
    .insert({ project_id: id, question, ideal_answer, notes: body?.notes ?? null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ golden: data }, { status: 201 });
}

// DELETE — ?golden_id=
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const goldenId = req.nextUrl.searchParams.get("golden_id");
  if (!goldenId) return NextResponse.json({ error: "golden_id requerido" }, { status: 400 });
  const db = createServiceClient();
  const { error } = await db
    .from("golden_faqs")
    .delete()
    .eq("id", goldenId)
    .eq("project_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
