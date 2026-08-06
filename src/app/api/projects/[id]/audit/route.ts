import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// POST /api/projects/:id/audit — lanza una auditoría (P0: Discoverability).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
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
  const job = await enqueueJob(id, "run_audit", {});
  return NextResponse.json({ job }, { status: 201 });
}

// GET /api/projects/:id/audit — último snapshot con dimensiones + señales + evidencia.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  const { data: snap } = await db
    .from("audit_snapshots")
    .select("*")
    .eq("project_id", id)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!snap) return NextResponse.json({ snapshot: null });

  const [{ data: dims }, { data: measurements }] = await Promise.all([
    db.from("dimension_scores").select("*").eq("snapshot_id", snap.id),
    db
      .from("signal_measurements")
      .select("*")
      .eq("snapshot_id", snap.id)
      .order("signal_id", { ascending: true }),
  ]);

  const measurementIds = (measurements ?? []).map((m) => m.id);
  const { data: evidence } = measurementIds.length
    ? await db.from("evidence_items").select("*").in("measurement_id", measurementIds)
    : { data: [] as { measurement_id: string }[] };

  const evByMeasurement = new Map<string, unknown[]>();
  for (const e of evidence ?? []) {
    if (!evByMeasurement.has(e.measurement_id)) evByMeasurement.set(e.measurement_id, []);
    evByMeasurement.get(e.measurement_id)!.push(e);
  }
  const enrichedMeasurements = (measurements ?? []).map((m) => ({
    ...m,
    evidence: evByMeasurement.get(m.id) ?? [],
  }));

  return NextResponse.json({
    snapshot: snap,
    dimensions: dims ?? [],
    measurements: enrichedMeasurements,
  });
}
