import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// POST — launch a brand audit
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { data: audit, error } = await db
    .from("brand_audits")
    .insert({ project_id: id, status: "queued", findings: [], gaps: [] })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enqueueJob(id, "brand_audit", { audit_id: audit.id });
  return NextResponse.json({ audit }, { status: 201 });
}

// GET — latest brand audit
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { data, error } = await db
    .from("brand_audits")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ audit: data?.[0] ?? null });
}
