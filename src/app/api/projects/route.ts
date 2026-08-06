import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

export async function GET() {
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  // Solo la URL es obligatoria: dominio y nombre se derivan de ella.
  const raw = String(body.root_url ?? "").trim();
  if (!raw) return NextResponse.json({ error: "La URL del sitio es obligatoria" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  const domain = url.hostname.replace(/^www\./, "");
  const name = String(body.name ?? "").trim() || domain;
  const startCrawl = body.start_crawl !== false; // por defecto true
  const maxPages = Math.min(Math.max(Number(body.max_pages) || 50, 1), 500);

  const db = createServiceClient();
  const { data: project, error } = await db
    .from("projects")
    .insert({
      name,
      domain,
      root_url: url.toString(),
      voice_guide: body.voice_guide || null,
      topic_summary: null,
      status: "active",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Arranca el crawl automáticamente para que el proyecto no quede vacío.
  let crawlStarted = false;
  if (startCrawl) {
    const { data: crawl } = await db
      .from("crawls")
      .insert({ project_id: project.id, status: "queued", max_pages: maxPages, pages_count: 0 })
      .select()
      .single();
    if (crawl) {
      await enqueueJob(project.id, "crawl_site", { crawl_id: crawl.id });
      crawlStarted = true;
    }
  }

  return NextResponse.json({ project, crawlStarted }, { status: 201 });
}
