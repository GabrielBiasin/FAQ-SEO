import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";
import type { CitationEngine } from "@/types/database";

const ENGINES: CitationEngine[] = ["chatgpt", "claude", "perplexity", "gemini"];

// POST — launch a citation check, OR add a manual entry ({ action: "manual", ... })
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = createServiceClient();

  if (body?.action === "manual") {
    const engine: CitationEngine = ENGINES.includes(body.engine) ? body.engine : "chatgpt";
    const question = String(body?.question ?? "").trim();
    if (!question) return NextResponse.json({ error: "question requerido" }, { status: 400 });
    const { data, error } = await db
      .from("citation_checks")
      .insert({
        project_id: id,
        question,
        engine,
        cited: Boolean(body.cited),
        position: body.position != null ? Number(body.position) : null,
        checked_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ check: data }, { status: 201 });
  }

  const job = await enqueueJob(id, "citation_check", { limit: body?.limit ?? 5 });
  return NextResponse.json({ job }, { status: 201 });
}

// GET — recent checks + share-of-voice per engine
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { data: checks, error } = await db
    .from("citation_checks")
    .select("*")
    .eq("project_id", id)
    .order("checked_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Share of voice: % cited per engine.
  const byEngine = new Map<string, { total: number; cited: number }>();
  for (const c of checks ?? []) {
    if (!byEngine.has(c.engine)) byEngine.set(c.engine, { total: 0, cited: 0 });
    const agg = byEngine.get(c.engine)!;
    agg.total++;
    if (c.cited) agg.cited++;
  }
  const shareOfVoice = Array.from(byEngine.entries()).map(([engine, a]) => ({
    engine,
    total: a.total,
    cited: a.cited,
    share: Number((a.cited / a.total).toFixed(2)),
  }));

  return NextResponse.json({ checks: checks ?? [], shareOfVoice });
}
