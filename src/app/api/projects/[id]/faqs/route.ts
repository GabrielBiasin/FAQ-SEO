import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// GET — list FAQs joined with their question and source page
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  const { data: faqs, error } = await db
    .from("faqs")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve question text and source page url in batch.
  const questionIds = Array.from(new Set((faqs ?? []).map((f) => f.question_id)));
  const pageIds = Array.from(
    new Set((faqs ?? []).map((f) => f.source_page_id).filter(Boolean) as string[])
  );

  const [{ data: questions }, { data: pages }] = await Promise.all([
    questionIds.length
      ? db.from("questions").select("id, text, tier, intent").in("id", questionIds)
      : Promise.resolve({ data: [] as { id: string; text: string; tier: string; intent: string }[] }),
    pageIds.length
      ? db.from("pages").select("id, url, title").in("id", pageIds)
      : Promise.resolve({ data: [] as { id: string; url: string; title: string | null }[] }),
  ]);

  const qMap = new Map((questions ?? []).map((q) => [q.id, q]));
  const pMap = new Map((pages ?? []).map((p) => [p.id, p]));

  const enriched = (faqs ?? []).map((f) => ({
    ...f,
    question: qMap.get(f.question_id) ?? null,
    source_page: f.source_page_id ? pMap.get(f.source_page_id) ?? null : null,
  }));

  return NextResponse.json({ faqs: enriched });
}

// POST — launch answer generation ({ action: "generate", question_ids? })
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = createServiceClient();

  if (body?.action === "generate") {
    const { count } = await db
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id);
    if (!count) {
      return NextResponse.json(
        { error: "No hay preguntas. Corré el descubrimiento primero." },
        { status: 400 }
      );
    }
    const job = await enqueueJob(id, "generate_answers", {
      question_ids: body.question_ids ?? undefined,
    });
    return NextResponse.json({ job }, { status: 201 });
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
