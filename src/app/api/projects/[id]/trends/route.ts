import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/projects/:id/trends — serie temporal de KPIs vitales a partir de los
// snapshots ya persistidos (auditorías del proyecto + snapshots de competidores).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  // Snapshots del proyecto (orden cronológico).
  const { data: snaps } = await db
    .from("audit_snapshots")
    .select("id, created_at")
    .eq("project_id", id)
    .eq("status", "done")
    .order("created_at", { ascending: true })
    .limit(40);

  const snapIds = (snaps ?? []).map((s) => s.id);
  const { data: dims } = snapIds.length
    ? await db
        .from("dimension_scores")
        .select("snapshot_id, top_dimension, sub_dimension, score")
        .in("snapshot_id", snapIds)
    : { data: [] as { snapshot_id: string; top_dimension: string; sub_dimension: string | null; score: number | null }[] };

  // roll-up (sub_dimension null) por snapshot y dimensión.
  const rollup = new Map<string, Record<string, number | null>>();
  for (const d of dims ?? []) {
    if (d.sub_dimension !== null) continue;
    if (!rollup.has(d.snapshot_id)) rollup.set(d.snapshot_id, {});
    rollup.get(d.snapshot_id)![d.top_dimension] = d.score;
  }
  const project = (snaps ?? []).map((s) => {
    const r = rollup.get(s.id) ?? {};
    return {
      date: s.created_at,
      readiness: r.readiness ?? null,
      authority: r.authority ?? null,
      visibility: r.visibility ?? null,
    };
  });

  // Competidores: última medición de cada uno (para línea de referencia).
  const { data: competitors } = await db
    .from("competitors")
    .select("id, name")
    .eq("project_id", id);
  const compIds = (competitors ?? []).map((c) => c.id);
  const { data: csnaps } = compIds.length
    ? await db
        .from("competitor_snapshots")
        .select("competitor_id, readiness_score, coverage_score, created_at")
        .in("competitor_id", compIds)
        .order("created_at", { ascending: false })
    : { data: [] as { competitor_id: string; readiness_score: number | null; coverage_score: number | null; created_at: string }[] };
  const latestByComp = new Map<string, { readiness_score: number | null; coverage_score: number | null; created_at: string }>();
  for (const s of csnaps ?? []) {
    if (!latestByComp.has(s.competitor_id)) latestByComp.set(s.competitor_id, s);
  }
  const competitorRefs = (competitors ?? [])
    .map((c) => ({ name: c.name, ...(latestByComp.get(c.id) ?? null) }))
    .filter((c) => c.readiness_score != null);

  return NextResponse.json({ project, competitors: competitorRefs });
}
