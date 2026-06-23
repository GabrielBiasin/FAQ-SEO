import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";
import type { Database } from "@/types/database";

type SectionUpdate = Database["public"]["Tables"]["sections"]["Update"];

// PATCH — edit a section's config (type, priority, weight, template, override, min/target)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sid: string }> }
) {
  const { sid } = await params;
  const body = await req.json().catch(() => ({}));

  const update: SectionUpdate = {};
  const allowed: (keyof SectionUpdate)[] = [
    "name",
    "section_type",
    "is_priority",
    "weight",
    "intent_template_id",
    "intent_override",
    "min_faqs",
    "target_faqs",
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
    .from("sections")
    .update(update)
    .eq("id", sid)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ section: data });
}

// POST — launch an "expand section" job with a free-text intent
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sid: string }> }
) {
  const { sid } = await params;
  const body = await req.json().catch(() => ({}));
  const db = createServiceClient();

  const { data: section, error } = await db
    .from("sections")
    .select("project_id")
    .eq("id", sid)
    .single();
  if (error || !section) {
    return NextResponse.json({ error: "Sección no encontrada" }, { status: 404 });
  }

  const job = await enqueueJob(section.project_id, "expand_section", {
    section_id: sid,
    intent_text: typeof body?.intent_text === "string" ? body.intent_text : "",
  });
  return NextResponse.json({ job }, { status: 201 });
}

// DELETE — remove a section (questions keep, section_id set null via FK)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sid: string }> }
) {
  const { sid } = await params;
  const db = createServiceClient();
  const { error } = await db.from("sections").delete().eq("id", sid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
