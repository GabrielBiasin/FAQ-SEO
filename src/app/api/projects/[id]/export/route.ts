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
      ? db
          .from("questions")
          .select("id, text, placement_section, placement_page_id")
          .in("id", questionIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            text: string;
            placement_section: string | null;
            placement_page_id: string | null;
          }[],
        }),
    pageIds.length
      ? db.from("pages").select("id, url").in("id", pageIds)
      : Promise.resolve({ data: [] as { id: string; url: string }[] }),
  ]);
  const qMap = new Map((questions ?? []).map((q) => [q.id, q]));
  const pMap = new Map((pages ?? []).map((p) => [p.id, p.url]));

  const items = (faqs ?? []).map((f) => {
    const q = qMap.get(f.question_id);
    return {
      question: q?.text ?? "",
      answer: f.answer_text,
      source: f.source_page_id ? pMap.get(f.source_page_id) ?? null : null,
      section: q?.placement_section ?? "Sin asignar",
    };
  });

  // Group items by their target section for placement-aware exports.
  const bySection = new Map<string, typeof items>();
  for (const it of items) {
    if (!bySection.has(it.section)) bySection.set(it.section, []);
    bySection.get(it.section)!.push(it);
  }
  const sections = Array.from(bySection.entries());

  if (format === "json") {
    const grouped = sections.map(([section, faqs]) => ({
      section,
      faqs: faqs.map(({ question, answer, source }) => ({ question, answer, source })),
    }));
    return new NextResponse(JSON.stringify({ sections: grouped }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="faqs-${id}.json"`,
      },
    });
  }

  if (format === "md") {
    const md = sections
      .map(
        ([section, faqs]) =>
          `# ${section}\n\n` +
          faqs
            .map(
              (it) =>
                `## ${it.question}\n\n${it.answer}${
                  it.source ? `\n\n_Fuente: ${it.source}_` : ""
                }`
            )
            .join("\n\n")
      )
      .join("\n\n---\n\n");
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="faqs-${id}.md"`,
      },
    });
  }

  // txt
  const txt = sections
    .map(
      ([section, faqs]) =>
        `=== ${section} ===\n\n` +
        faqs.map((it) => `P: ${it.question}\nR: ${it.answer}`).join("\n\n")
    )
    .join("\n\n");
  return new NextResponse(txt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="faqs-${id}.txt"`,
    },
  });
}
