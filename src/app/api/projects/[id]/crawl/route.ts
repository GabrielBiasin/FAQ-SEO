import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// POST /api/projects/:id/crawl  — launch a crawl
// Body: { max_pages?: number }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const maxPages = Math.min(Math.max(Number(body?.max_pages) || 50, 1), 500);

  const db = createServiceClient();
  const { data: crawl, error } = await db
    .from("crawls")
    .insert({ project_id: id, status: "queued", max_pages: maxPages, pages_count: 0 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enqueueJob(id, "crawl_site", { crawl_id: crawl.id });
  return NextResponse.json({ crawl }, { status: 201 });
}

// GET /api/projects/:id/crawl  — latest crawl + its pages
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  const { data: crawls, error: cErr } = await db
    .from("crawls")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const latest = crawls?.[0] ?? null;
  let pages: unknown[] = [];
  if (latest) {
    const { data, error: pErr } = await db
      .from("pages")
      .select("id, url, title, word_count, created_at")
      .eq("crawl_id", latest.id)
      .order("created_at", { ascending: true });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    pages = data ?? [];
  }
  return NextResponse.json({ crawl: latest, pages });
}
