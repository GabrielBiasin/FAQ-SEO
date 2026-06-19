import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import type { SeedSource } from "@/types/database";

const VALID_SOURCES: SeedSource[] = [
  "sales",
  "support",
  "manual",
  "web_search",
  "paa",
  "autocomplete",
  "search_console",
];

// GET — list seed questions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();
  const { data, error } = await db
    .from("seed_questions")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ seeds: data });
}

// POST — bulk add (paste textarea: one question per line) with a source
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const source: SeedSource = VALID_SOURCES.includes(body.source) ? body.source : "manual";
  const lines: string[] = String(body.text ?? "")
    .split("\n")
    .map((l: string) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return NextResponse.json({ error: "No hay preguntas para cargar" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("seed_questions")
    .insert(lines.map((text) => ({ project_id: id, text, source })))
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ seeds: data, added: data.length }, { status: 201 });
}

// DELETE — remove a single seed by ?seed_id=
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const seedId = req.nextUrl.searchParams.get("seed_id");
  if (!seedId) return NextResponse.json({ error: "seed_id requerido" }, { status: 400 });
  const db = createServiceClient();
  const { error } = await db
    .from("seed_questions")
    .delete()
    .eq("id", seedId)
    .eq("project_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
