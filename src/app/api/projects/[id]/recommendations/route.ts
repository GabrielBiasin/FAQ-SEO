import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { computeDemandCoverage, type DemandItem, type OfferPage } from "@/lib/audit/coverage";
import { buildRecommendations, type RecoMeasurement } from "@/lib/audit/recommendations";

// GET /api/projects/:id/recommendations — acciones priorizadas por gaps
// (señales bajas del último snapshot + cobertura de demanda). Determinista, live.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  // Último snapshot + mediciones + evidencia.
  const { data: snap } = await db
    .from("audit_snapshots")
    .select("id, created_at")
    .eq("project_id", id)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let measurements: RecoMeasurement[] = [];
  if (snap) {
    const { data: rows } = await db
      .from("signal_measurements")
      .select("id, signal_id, normalized, state")
      .eq("snapshot_id", snap.id);
    const ids = (rows ?? []).map((r) => r.id);
    const { data: ev } = ids.length
      ? await db.from("evidence_items").select("measurement_id, key, value, url").in("measurement_id", ids)
      : { data: [] as { measurement_id: string; key: string; value: unknown; url: string | null }[] };
    const evBy = new Map<string, { key: string; value: unknown; url: string | null }[]>();
    for (const e of ev ?? []) {
      if (!evBy.has(e.measurement_id)) evBy.set(e.measurement_id, []);
      evBy.get(e.measurement_id)!.push({ key: e.key, value: e.value, url: e.url });
    }
    measurements = (rows ?? []).map((r) => ({
      signalId: r.signal_id,
      normalized: r.normalized,
      state: r.state,
      evidence: evBy.get(r.id) ?? [],
    }));
  }

  // Cobertura de demanda (live).
  const [{ data: qs }, { data: pageRows }, { data: topics }] = await Promise.all([
    db.from("questions").select("id, text, priority_score, intent, topic_id").eq("project_id", id),
    db.from("pages").select("id, url, title, headings, clean_text").eq("project_id", id),
    db.from("topics").select("id, name").eq("project_id", id),
  ]);

  let coverage = null;
  if (qs && qs.length > 0 && pageRows && pageRows.length > 0) {
    const topicName = new Map((topics ?? []).map((t) => [t.id, t.name]));
    const demand: DemandItem[] = qs.map((q) => ({
      id: q.id,
      text: q.text,
      priority: q.priority_score ?? 1,
      intent: q.intent ?? null,
      topic: q.topic_id ? topicName.get(q.topic_id) ?? null : null,
    }));
    const pages: OfferPage[] = pageRows.map((p) => ({
      id: p.id,
      url: p.url,
      title: p.title,
      headings: (p.headings as unknown as { tag: string; text: string }[]) ?? [],
      cleanText: p.clean_text ?? "",
    }));
    coverage = computeDemandCoverage(demand, pages);
  }

  const recommendations = buildRecommendations({ measurements, coverage });
  return NextResponse.json({
    recommendations,
    hasSnapshot: Boolean(snap),
    snapshotAt: snap?.created_at ?? null,
  });
}
