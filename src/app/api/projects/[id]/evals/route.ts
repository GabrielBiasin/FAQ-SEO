import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// POST — launch an eval run over the project's FAQs
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { count } = await db
    .from("faqs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id);
  if (!count) {
    return NextResponse.json(
      { error: "No hay FAQs para evaluar. Generá respuestas primero." },
      { status: 400 }
    );
  }
  const job = await enqueueJob(id, "run_eval", {});
  return NextResponse.json({ job }, { status: 201 });
}

// GET — eval dashboard: per-prompt_version aggregates + recent runs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { data: evals, error } = await db
    .from("evals")
    .select("prompt_version, overall_score, passed, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate by prompt_version.
  const byVersion = new Map<
    string,
    { count: number; sum: number; passed: number }
  >();
  for (const e of evals ?? []) {
    const v = e.prompt_version;
    if (!byVersion.has(v)) byVersion.set(v, { count: 0, sum: 0, passed: 0 });
    const agg = byVersion.get(v)!;
    agg.count++;
    agg.sum += e.overall_score;
    if (e.passed) agg.passed++;
  }
  const versions = Array.from(byVersion.entries()).map(([version, a]) => ({
    prompt_version: version,
    count: a.count,
    avg_score: Number((a.sum / a.count).toFixed(2)),
    pass_rate: Number((a.passed / a.count).toFixed(2)),
  }));

  return NextResponse.json({ versions, total: evals?.length ?? 0 });
}
