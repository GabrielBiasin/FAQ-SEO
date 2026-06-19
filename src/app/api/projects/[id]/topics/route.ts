import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// POST /api/projects/:id/topics — launch topic analysis
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  // Guard: need crawled pages first.
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

  const job = await enqueueJob(id, "analyze_topics", {});
  return NextResponse.json({ job }, { status: 201 });
}

// GET /api/projects/:id/topics — topic_summary + topics
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  const { data: project } = await db
    .from("projects")
    .select("topic_summary")
    .eq("id", id)
    .single();

  const { data: topics, error } = await db
    .from("topics")
    .select("*")
    .eq("project_id", id)
    .order("priority", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    topic_summary: project?.topic_summary ?? null,
    topics: topics ?? [],
  });
}
