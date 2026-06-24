"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

interface ApprovedFaq {
  id: string;
  answer_text: string;
  question: { text: string; placement_section: string | null } | null;
}

export default function ExportTab({ projectId }: { projectId: string }) {
  const [approved, setApproved] = useState<ApprovedFaq[]>([]);

  const load = useCallback(async () => {
    const r = await apiGet<{ faqs: (ApprovedFaq & { status: string })[] }>(
      `/api/projects/${projectId}/faqs`
    );
    setApproved(r.faqs.filter((f) => f.status === "approved"));
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-800">Exportar FAQs aprobadas</h3>
        <p className="text-xs text-zinc-500">
          Solo se exportan las {approved.length} FAQ{approved.length === 1 ? "" : "s"} aprobadas.
        </p>
        <div className="mt-3 flex gap-2">
          {formats.map((f) => (
            <a
              key={f.ext}
              href={`/api/projects/${projectId}/export?format=${f.ext}`}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                approved.length === 0
                  ? "pointer-events-none bg-zinc-100 text-zinc-400"
                  : "bg-zinc-900 text-white hover:bg-zinc-700"
              }`}
            >
              ↓ {f.label}
            </a>
          ))}
        </div>
        {approved.length === 0 && (
          <p className="mt-3 text-sm text-amber-600">
            No hay FAQs aprobadas. Aprobá respuestas en el tab FAQs primero.
          </p>
        )}
      </div>

      {approved.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-zinc-700">
            Vista previa <span className="font-normal text-zinc-400">(agrupada por sección destino)</span>
          </h4>
          {groupBySection(approved).map(([section, faqs]) => (
            <div key={section} className="mb-4">
              <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {section} <span className="text-zinc-400">({faqs.length})</span>
              </h5>
              <ul className="space-y-2">
                {faqs.map((f) => (
                  <li key={f.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                    <p className="text-sm font-medium text-zinc-900">{f.question?.text}</p>
                    <p className="mt-1 text-sm text-zinc-600">{f.answer_text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupBySection(faqs: ApprovedFaq[]): [string, ApprovedFaq[]][] {
  const map = new Map<string, ApprovedFaq[]>();
  for (const f of faqs) {
    const key = f.question?.placement_section || "Sin asignar";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return Array.from(map.entries());
}
