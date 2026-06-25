"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

interface ExportFaq {
  id: string;
  answer_text: string;
  status: "draft" | "needs_review" | "approved" | "rejected";
  source_page_id: string | null;
  question: { text: string; placement_section: string | null } | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  needs_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  needs_review: "Revisar",
  approved: "Aprobada",
};
const INSUFFICIENT =
  "⚠️ El contenido del sitio no es suficiente para responder esta pregunta — a completar por el cliente.";

export default function ExportTab({ projectId }: { projectId: string }) {
  const [faqs, setFaqs] = useState<ExportFaq[]>([]);
  const [scope, setScope] = useState<"all" | "approved">("all");

  const load = useCallback(async () => {
    const r = await apiGet<{ faqs: ExportFaq[] }>(`/api/projects/${projectId}/faqs`);
    // Everything except rejected is exportable.
    setFaqs(r.faqs.filter((f) => f.status !== "rejected"));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const formats: { ext: string; label: string }[] = [
    { ext: "xlsx", label: "Excel" },
    { ext: "md", label: "Markdown" },
    { ext: "json", label: "JSON" },
    { ext: "txt", label: "Texto" },
  ];

  const approvedCount = faqs.filter((f) => f.status === "approved").length;
  const visible = scope === "approved" ? faqs.filter((f) => f.status === "approved") : faqs;
  const insufficientCount = visible.filter((f) => !f.answer_text.trim() || !f.source_page_id).length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-800">Exportar FAQs</h3>
        <p className="text-xs text-zinc-500">
          {scope === "approved"
            ? `${approvedCount} aprobadas.`
            : `${faqs.length} FAQs (todas menos las rechazadas), incluidas las que están para revisar.`}
          {insufficientCount > 0 && scope === "all" && (
            <>
              {" "}
              <span className="text-amber-600">
                {insufficientCount} sin contenido suficiente — se exportan con la pregunta para que
                el cliente las complete.
              </span>
            </>
          )}
        </p>

        <div className="mt-2 flex gap-2 text-xs">
          {(["all", "approved"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-full px-3 py-1 ${
                scope === s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {s === "all" ? "Todas" : "Solo aprobadas"}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          {formats.map((f) => (
            <a
              key={f.ext}
              href={`/api/projects/${projectId}/export?format=${f.ext}&scope=${scope}`}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                visible.length === 0
                  ? "pointer-events-none bg-zinc-100 text-zinc-400"
                  : "bg-zinc-900 text-white hover:bg-zinc-700"
              }`}
            >
              ↓ {f.label}
            </a>
          ))}
        </div>
        {visible.length === 0 && (
          <p className="mt-3 text-sm text-amber-600">
            No hay FAQs para exportar en este filtro. Generá o aprobá respuestas en el tab FAQs.
          </p>
        )}
      </div>

      {visible.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-zinc-700">
            Vista previa <span className="font-normal text-zinc-400">(agrupada por sección destino)</span>
          </h4>
          {groupBySection(visible).map(([section, items]) => (
            <div key={section} className="mb-4">
              <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {section} <span className="text-zinc-400">({items.length})</span>
              </h5>
              <ul className="space-y-2">
                {items.map((f) => {
                  const insufficient = !f.answer_text.trim() || !f.source_page_id;
                  return (
                    <li
                      key={f.id}
                      className={`rounded-lg border bg-white p-3 ${
                        insufficient ? "border-amber-300" : "border-zinc-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-900">{f.question?.text}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_BADGE[f.status] ?? "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {STATUS_LABEL[f.status] ?? f.status}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-sm ${
                          insufficient ? "italic text-amber-700" : "text-zinc-600"
                        }`}
                      >
                        {insufficient ? INSUFFICIENT : f.answer_text}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupBySection(faqs: ExportFaq[]): [string, ExportFaq[]][] {
  const map = new Map<string, ExportFaq[]>();
  for (const f of faqs) {
    const key = f.question?.placement_section || "Sin asignar";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return Array.from(map.entries());
}
