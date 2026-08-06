import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/projects/:id/competitors — lista de competidores + último snapshot.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { data: competitors } = await db
    .from("competitors")
    .select("*")
    .eq("project_id", id)
    .order("is_priority", { ascending: false })
    .order("created_at", { ascending: true });

  const ids = (competitors ?? []).map((c) => c.id);
  const { data: snaps } = ids.length
    ? await db
        .from("competitor_snapshots")
        .select("*")
        .in("competitor_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] as { competitor_id: string }[] };

  // Último snapshot por competidor.
  const latest = new Map<string, unknown>();
  for (const s of snaps ?? []) {
    if (!latest.has(s.competitor_id)) latest.set(s.competitor_id, s);
  }
  const enriched = (competitors ?? []).map((c) => ({
    ...c,
    snapshot: latest.get(c.id) ?? null,
  }));
  return NextResponse.json({ competitors: enriched });
}

// POST /api/projects/:id/competitors — alta manual de un competidor.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    root_url?: string;
    name?: string;
    is_priority?: boolean;
    max_pages?: number;
  };
  const raw = (body.root_url ?? "").trim();
  if (!raw) return NextResponse.json({ error: "root_url requerido" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("competitors")
    .insert({
      project_id: id,
      name: (body.name ?? url.hostname).trim(),
      root_url: url.toString(),
      domain: url.hostname,
      source: "manual",
      is_priority: Boolean(body.is_priority),
      max_pages: Math.min(Math.max(body.max_pages ?? 15, 3), 40),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ competitor: data }, { status: 201 });
}
