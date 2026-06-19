import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type QuestionUpdate = Database["public"]["Tables"]["questions"]["Update"];

// PATCH — edit a question's text/tier/intent/topic/priority
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ qid: string }> }
) {
  const { qid } = await params;
  const body = await req.json().catch(() => ({}));
  const update: QuestionUpdate = {};
  const allowed: (keyof QuestionUpdate)[] = [
    "text",
    "tier",
    "intent",
    "topic_id",
    "priority_score",
    "status",
  ];
  for (const k of allowed) {
    if (k in body) (update as Record<string, unknown>)[k] = body[k];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }
  const db = createServiceClient();
  const { data, error } = await db
    .from("questions")
    .update(update)
    .eq("id", qid)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}

// DELETE — remove a question
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ qid: string }> }
) {
  const { qid } = await params;
  const db = createServiceClient();
  const { error } = await db.from("questions").delete().eq("id", qid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
