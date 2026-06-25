import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/projects/:id/export?format=json|md|txt|xlsx
// Exports ONLY approved FAQs (human-reviewed) — nothing else leaves the tool.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();
  // scope=all (default): everything except rejected. scope=approved: approved only.
  const scope = (req.nextUrl.searchParams.get("scope") || "all").toLowerCase();
  const db = createServiceClient();

  let query = db
    .from("faqs")
    .select("question_id, answer_text, source_page_id, status, confidence")
    .eq("project_id", id)
    .order("created_at", { ascending: true });
  query = scope === "approved" ? query.eq("status", "approved") : query.neq("status", "rejected");

  const { data: faqs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const questionIds = Array.from(new Set((faqs ?? []).map((f) => f.question_id)));
  const pageIds = Array.from(
    new Set((faqs ?? []).map((f) => f.source_page_id).filter(Boolean) as string[])
  );
  const [{ data: questions }, { data: pages }, { data: sectionRows }] = await Promise.all([
    questionIds.length
      ? db.from("questions").select("id, text, section_id").in("id", questionIds)
      : Promise.resolve({
          data: [] as { id: string; text: string; section_id: string | null }[],
        }),
    pageIds.length
      ? db.from("pages").select("id, url").in("id", pageIds)
      : Promise.resolve({ data: [] as { id: string; url: string }[] }),
    db.from("sections").select("id, name").eq("project_id", id),
  ]);
  const qMap = new Map((questions ?? []).map((q) => [q.id, q]));
  const pMap = new Map((pages ?? []).map((p) => [p.id, p.url]));
  const sectionName = new Map((sectionRows ?? []).map((s) => [s.id, s.name]));

  // A FAQ lacks sufficient content when it has no grounding source or no answer.
  // We still export the question so the client can complete it.
  const INSUFFICIENT =
    "⚠️ El contenido del sitio no es suficiente para responder esta pregunta — a completar por el cliente.";
  const STATUS_LABEL: Record<string, string> = {
    draft: "Borrador",
    needs_review: "Revisar",
    approved: "Aprobada",
    rejected: "Rechazada",
  };

  const items = (faqs ?? []).map((f) => {
    const q = qMap.get(f.question_id);
    const insufficient = !f.answer_text.trim() || !f.source_page_id;
    return {
      question: q?.text ?? "",
      answer: insufficient ? INSUFFICIENT : f.answer_text,
      source: f.source_page_id ? pMap.get(f.source_page_id) ?? null : null,
      section: (q?.section_id && sectionName.get(q.section_id)) || "Sin asignar",
      status: STATUS_LABEL[f.status] ?? f.status,
      insufficient,
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
      faqs: faqs.map(({ question, answer, source, status, insufficient }) => ({
        question,
        answer,
        source,
        status,
        insufficient,
      })),
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
                `## ${it.question}\n\n${it.answer}\n\n_Estado: ${it.status}${
                  it.source ? ` · Fuente: ${it.source}` : ""
                }_`
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

  if (format === "xlsx") {
    // Dynamic import keeps exceljs out of the route's module graph at load.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "FAQ AEO Tool";
    const ws = wb.addWorksheet("FAQs");
    ws.columns = [
      { header: "Sección", key: "section", width: 26 },
      { header: "Pregunta", key: "question", width: 48 },
      { header: "Respuesta", key: "answer", width: 80 },
      { header: "Estado", key: "status", width: 14 },
      { header: "Completar cliente", key: "todo", width: 16 },
      { header: "Fuente", key: "source", width: 38 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const [section, faqs] of sections) {
      for (const it of faqs) {
        const row = ws.addRow({
          section,
          question: it.question,
          answer: it.answer,
          status: it.status,
          todo: it.insufficient ? "SÍ" : "",
          source: it.source ?? "",
        });
        // Highlight rows that need the client to complete the answer.
        if (it.insufficient) {
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFF3CD" }, // soft amber
            };
          });
        }
      }
    }
    ws.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="faqs-${id}.xlsx"`,
      },
    });
  }

  // txt
  const txt = sections
    .map(
      ([section, faqs]) =>
        `=== ${section} ===\n\n` +
        faqs
          .map((it) => `P: ${it.question}\nR: ${it.answer}\n[${it.status}]`)
          .join("\n\n")
    )
    .join("\n\n");
  return new NextResponse(txt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="faqs-${id}.txt"`,
    },
  });
}
