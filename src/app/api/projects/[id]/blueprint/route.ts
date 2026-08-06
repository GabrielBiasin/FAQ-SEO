import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// POST /api/projects/:id/blueprint — encola la generación del blueprint.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { count } = await db
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id);
  if (!count) {
    return NextResponse.json(
      { error: "No hay demanda todavía. Generá Tópicos & Preguntas primero." },
      { status: 400 }
    );
  }
  const job = await enqueueJob(id, "build_blueprint", {});
  return NextResponse.json({ job }, { status: 201 });
}

// GET /api/projects/:id/blueprint — último blueprint generado.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { data } = await db
    .from("site_blueprints")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ blueprint: data ?? null });
}
