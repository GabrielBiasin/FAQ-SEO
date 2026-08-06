"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, pokeWorker } from "@/lib/api";

interface DimScore {
  top_dimension: string;
  sub_dimension: string | null;
  score: number | null;
  state: string;
  coverage: number;
  confidence: number | null;
  measured_signals: number;
  total_signals: number;
}
interface Measurement {
  id: string;
  signal_id: string;
  normalized: number | null;
  state: string;
  type: string;
  error: string | null;
  evidence: { key: string; kind: string; value: unknown; url: string | null }[];
}
interface Snapshot {
  id: string;
  created_at: string;
  methodology_version: string;
  signal_registry_version: string;
}

const SIGNAL_LABEL: Record<string, string> = {
  "discoverability.sitemap_valid": "Sitemap válido y declarado",
  "discoverability.robots_allows_crawl": "robots.txt permite rastreo",
  "discoverability.canonical_consistent": "Canonical consistente",
  "discoverability.meta_robots_indexable": "Páginas indexables (sin noindex)",
  "discoverability.http_health": "Salud HTTP (2xx)",
  "discoverability.orphans_click_depth": "Huérfanas y profundidad de clics",
  "discoverability.hreflang_valid": "hreflang válido",
  "performance.lcp": "LCP (Largest Contentful Paint)",
  "performance.inp": "INP (Interaction to Next Paint)",
  "performance.cls": "CLS (Cumulative Layout Shift)",
  "performance.lighthouse_score": "Performance (Lighthouse)",
};

const DIM_LABEL: Record<string, string> = {
  readiness: "Readiness",
  authority: "Authority",
  visibility: "Visibility",
};

// Color por estado de medición.
function stateBadge(state: string): string {
  if (state === "measured" || state === "field_measured" || state === "lab_measured")
    return "bg-green-100 text-green-700";
  if (state === "failed") return "bg-red-100 text-red-700";
  if (state === "experimental" || state === "estimated" || state === "inferred")
    return "bg-amber-100 text-amber-800";
  return "bg-zinc-100 text-zinc-500"; // unavailable / budget_defined
}
const STATE_LABEL: Record<string, string> = {
  measured: "medido",
  unavailable: "no medible",
  failed: "error",
  estimated: "estimado",
  inferred: "inferido",
  experimental: "experimental",
  field_measured: "campo",
  lab_measured: "lab",
  budget_defined: "presupuesto",
};

// Color del número de score 0–10.
function scoreColor(score: number): string {
  if (score >= 7.5) return "text-green-600";
  if (score >= 5) return "text-amber-600";
  return "text-red-600";
}

export default function AuditTab({ projectId }: { projectId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dimensions, setDimensions] = useState<DimScore[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{
        snapshot: Snapshot | null;
        dimensions: DimScore[];
        measurements: Measurement[];
      }>(`/api/projects/${projectId}/audit`);
      setSnapshot(r.snapshot);
      setDimensions(r.dimensions ?? []);
      setMeasurements(r.measurements ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      await load();
      const { jobs } = await apiGet<{ jobs: { type: string; status: string }[] }>(
        `/api/jobs?project_id=${projectId}`
      );
      const active = jobs.some(
        (j) => j.type === "run_audit" && (j.status === "queued" || j.status === "running")
      );
      if (active) pokeWorker(projectId);
      else setRunning(false);
    }, 3000);
    return () => clearInterval(t);
  }, [running, load, projectId]);

  async function runAudit() {
    setRunning(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/audit`, {});
      pokeWorker(projectId);
      setTimeout(() => setRunning(false), 120000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Auditoría GEO — Readiness</h3>
          <p className="text-xs text-zinc-500">
            Señales deterministas con evidencia. {snapshot && `Metodología ${snapshot.methodology_version} · ${new Date(snapshot.created_at).toLocaleString()}`}
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {running ? "Auditando…" : snapshot ? "Re-auditar" : "Correr auditoría"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!snapshot ? (
        <p className="text-sm text-zinc-400">
          Sin auditoría todavía. Corré la auditoría (requiere un crawl previo).
        </p>
      ) : (
        <>
          {/* Dimensiones (roll-up top primero, luego sub-dimensiones) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[...dimensions]
              .sort((a, b) => (a.sub_dimension === null ? -1 : b.sub_dimension === null ? 1 : 0))
              .map((d) => {
              const inRange = d.score !== null;
              return (
                <div key={`${d.top_dimension}.${d.sub_dimension}`} className="rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {DIM_LABEL[d.top_dimension] ?? d.top_dimension}
                    {d.sub_dimension ? ` · ${d.sub_dimension}` : ""}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    {inRange ? (
                      <span className={`text-3xl font-bold ${scoreColor(d.score as number)}`}>
                        {(d.score as number).toFixed(1)}
                        <span className="text-base font-normal text-zinc-400">/10</span>
                      </span>
                    ) : (
                      <span className="text-lg font-semibold text-zinc-400">Cobertura insuficiente</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {d.measured_signals}/{d.total_signals} señales medidas · cobertura {Math.round(d.coverage * 100)}%
                    {d.confidence !== null && ` · confianza ${Math.round(d.confidence * 100)}%`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Señales */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-zinc-700">Señales</h4>
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
              {measurements.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <button
                    onClick={() => setOpen(open === m.id ? null : m.id)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="text-sm text-zinc-800">
                      {SIGNAL_LABEL[m.signal_id] ?? m.signal_id}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stateBadge(m.state)}`}>
                        {STATE_LABEL[m.state] ?? m.state}
                      </span>
                      <span
                        className={`w-10 text-right text-sm font-semibold ${
                          m.normalized === null ? "text-zinc-300" : scoreColor(m.normalized)
                        }`}
                      >
                        {m.normalized === null ? "—" : m.normalized.toFixed(0)}
                      </span>
                    </span>
                  </button>
                  {open === m.id && (
                    <div className="mt-2 rounded-md bg-zinc-50 p-2 text-xs text-zinc-600">
                      {m.error && <p className="text-red-600">Error: {m.error}</p>}
                      {m.evidence.length === 0 ? (
                        <span className="text-zinc-400">Sin evidencia.</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {m.evidence.map((e, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="font-mono text-zinc-500">{e.key}:</span>
                              {e.url ? (
                                <a href={e.url} target="_blank" rel="noreferrer" className="truncate text-blue-600 hover:underline">
                                  {String(e.value)}
                                </a>
                              ) : (
                                <span>{typeof e.value === "object" ? JSON.stringify(e.value) : String(e.value)}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
