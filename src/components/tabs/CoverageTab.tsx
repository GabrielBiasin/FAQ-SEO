"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Status = "covered" | "partial" | "missing";

interface Row {
  demandId: string;
  text: string;
  priority: number;
  intent: string | null;
  topic: string | null;
  status: Status;
  headingOverlap: number;
  bodyOverlap: number;
  bestPageId: string | null;
  bestPageUrl: string | null;
}
interface Summary {
  total: number;
  covered: number;
  partial: number;
  missing: number;
  coverageRate: number;
  weightedCoverageRate: number;
  score: number | null;
  rows: Row[];
}

const STATUS_META: Record<Status, { label: string; badge: string; dot: string }> = {
  covered: { label: "Cubierta", badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
  partial: { label: "Parcial", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  missing: { label: "Sin cubrir", badge: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

function scoreColor(s: number): string {
  if (s >= 7.5) return "text-green-600";
  if (s >= 5) return "text-amber-600";
  return "text-red-600";
}

export default function CoverageTab({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<{ summary: Summary | null; reason?: string }>(
        `/api/projects/${projectId}/coverage`
      );
      setSummary(r.summary);
      setReason(r.reason ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-zinc-400">Calculando cobertura…</p>;
  if (error)
    return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;

  if (!summary) {
    const msg =
      reason === "no_pages"
        ? "No hay páginas crawleadas. Corré un crawl primero."
        : "No hay preguntas/queries objetivo todavía. Generá la demanda en Tópicos & Preguntas.";
    return <p className="text-sm text-zinc-400">{msg}</p>;
  }

  const rows = filter === "all" ? summary.rows : summary.rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Cobertura (ponderada)
          </div>
          <div className="mt-1">
            {summary.score === null ? (
              <span className="text-lg text-zinc-400">—</span>
            ) : (
              <span className={`text-3xl font-bold ${scoreColor(summary.score)}`}>
                {summary.score.toFixed(1)}
                <span className="text-base font-normal text-zinc-400">/10</span>
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {Math.round(summary.weightedCoverageRate * 100)}% de la demanda (por prioridad)
          </div>
        </div>
        {(["covered", "partial", "missing"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(filter === s ? "all" : s)}
            className={`rounded-lg border p-4 text-left transition-colors ${
              filter === s ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {STATUS_META[s].label}
              </span>
            </div>
            <div className="mt-1 text-3xl font-bold text-zinc-800">{summary[s]}</div>
            <div className="mt-1 text-xs text-zinc-500">
              de {summary.total} queries
            </div>
          </button>
        ))}
      </div>

      {filter !== "all" && (
        <button onClick={() => setFilter("all")} className="text-xs text-blue-600 hover:underline">
          ← Ver todas
        </button>
      )}

      {/* Matriz */}
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {rows.map((r) => {
          const meta = STATUS_META[r.status];
          return (
            <li key={r.demandId} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-zinc-800">{r.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  {r.topic && <span>#{r.topic}</span>}
                  {r.intent && <span className="text-zinc-400">{r.intent}</span>}
                  <span>prioridad {r.priority.toFixed(0)}</span>
                  {r.bestPageUrl ? (
                    <a
                      href={r.bestPageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-blue-600 hover:underline"
                      title={r.bestPageUrl}
                    >
                      {new URL(r.bestPageUrl).pathname || "/"}
                    </a>
                  ) : (
                    <span className="text-zinc-400">sin página</span>
                  )}
                  <span className="text-zinc-400">
                    títulos {Math.round(r.headingOverlap * 100)}% · cuerpo {Math.round(r.bodyOverlap * 100)}%
                  </span>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}>
                {meta.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
