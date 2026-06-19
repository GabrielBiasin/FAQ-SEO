import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

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

  const { name, domain, root_url, voice_guide } = body;
  if (!name || !domain || !root_url) {
    return NextResponse.json(
      { error: "name, domain y root_url son obligatorios" },
      { status: 400 }
    );
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      name,
      domain,
      root_url,
      voice_guide: voice_guide || null,
      topic_summary: null,
      status: "active",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}
