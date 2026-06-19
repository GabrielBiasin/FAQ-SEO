import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/projects/:id/export?format=json|md|txt
// Exports ONLY approved FAQs (human-reviewed) — nothing else leaves the tool.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();
  const db = createServiceClient();

  const { data: faqs, error } = await db
    .from("faqs")
    .select("question_id, answer_text, source_page_id")
    .eq("project_id", id)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const questionIds = Array.from(new Set((faqs ?? []).map((f) => f.question_id)));
  const pageIds = Array.from(
    new Set((faqs ?? []).map((f) => f.source_page_id).filter(Boolean) as string[])
  );
  const [{ data: questions }, { data: pages }] = await Promise.all([
    questionIds.length
      ? db.from("questions").select("id, text").in("id", questionIds)
      : Promise.resolve({ data: [] as { id: string; text: string }[] }),
    pageIds.length
      ? db.from("pages").select("id, url").in("id", pageIds)
      : Promise.resolve({ data: [] as { id: string; url: string }[] }),
  ]);
  const qMap = new Map((questions ?? []).map((q) => [q.id, q.text]));
  const pMap = new Map((pages ?? []).map((p) => [p.id, p.url]));

  const items = (faqs ?? []).map((f) => ({
    question: qMap.get(f.question_id) ?? "",
    answer: f.answer_text,
    source: f.source_page_id ? pMap.get(f.source_page_id) ?? null : null,
  }));

  if (format === "json") {
    return new NextResponse(JSON.stringify({ faqs: items }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="faqs-${id}.json"`,
      },
    });
  }

  if (format === "md") {
    const md =
      "# FAQs\n\n" +
      items
        .map(
          (it) =>
            `## ${it.question}\n\n${it.answer}${
              it.source ? `\n\n_Fuente: ${it.source}_` : ""
            }`
        )
        .join("\n\n");
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="faqs-${id}.md"`,
      },
    });
  }

  // txt
  const txt = items
    .map((it) => `P: ${it.question}\nR: ${it.answer}`)
    .join("\n\n");
  return new NextResponse(txt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="faqs-${id}.txt"`,
    },
  });
}
