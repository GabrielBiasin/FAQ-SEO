"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Severity = "high" | "medium" | "low";

interface Reco {
  id: string;
  title: string;
  detail: string;
  area: string;
  severity: Severity;
  score: number | null;
  impact: number;
  urls: string[];
}

const SEV_META: Record<Severity, { label: string; badge: string; bar: string }> = {
  high: { label: "Alta", badge: "bg-red-100 text-red-700", bar: "bg-red-500" },
  medium: { label: "Media", badge: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  low: { label: "Baja", badge: "bg-zinc-100 text-zinc-600", bar: "bg-zinc-400" },
};

const AREA_LABEL: Record<string, string> = {
  discoverability: "Descubrimiento",
  onpage: "On-page",
  performance: "Performance",
  coverage: "Cobertura",
};

export default function RecommendationsTab({ projectId }: { projectId: string }) {
  const [recs, setRecs] = useState<Reco[]>([]);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<{ recommendations: Reco[]; hasSnapshot: boolean }>(
        `/api/projects/${projectId}/recommendations`
      );
      setRecs(r.recommendations ?? []);
      setHasSnapshot(r.hasSnapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-zinc-400">Analizando gaps…</p>;
  if (error)
    return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;

  const counts = {
    high: recs.filter((r) => r.severity === "high").length,
    medium: recs.filter((r) => r.severity === "medium").length,
    low: recs.filter((r) => r.severity === "low").length,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-800">Recomendaciones priorizadas</h3>
        <p className="text-xs text-zinc-500">
          Acciones derivadas de los gaps: señales bajas de la auditoría + queries sin cubrir.
          {!hasSnapshot && " Corré una auditoría GEO para incluir señales técnicas."}
        </p>
        {recs.length > 0 && (
          <div className="mt-2 flex gap-3 text-xs">
            <span className="text-red-600">{counts.high} alta</span>
            <span className="text-amber-600">{counts.medium} media</span>
            <span className="text-zinc-500">{counts.low} baja</span>
          </div>
        )}
      </div>

      {recs.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Sin recomendaciones. Corré una auditoría GEO y generá la demanda (Tópicos & Preguntas) para
          detectar oportunidades.
        </p>
      ) : (
        <ul className="space-y-2">
          {recs.map((r) => {
            const sev = SEV_META[r.severity];
            const isOpen = open === r.id;
            return (
              <li key={r.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                <button
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${sev.bar}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800">{r.title}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sev.badge}`}>
                        {sev.label}
                      </span>
                      <span>{AREA_LABEL[r.area] ?? r.area}</span>
                      {r.score !== null && <span>señal {r.score.toFixed(1)}/10</span>}
                      {r.urls.length > 0 && <span>{r.urls.length} páginas</span>}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
                    <p>{r.detail}</p>
                    {r.urls.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {r.urls.map((u) => (
                          <li key={u}>
                            <a href={u} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              {u}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
