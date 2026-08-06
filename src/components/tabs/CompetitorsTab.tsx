"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, pokeWorker } from "@/lib/api";

interface Snapshot {
  readiness_score: number | null;
  coverage_score: number | null;
  created_at: string;
}
interface Competitor {
  id: string;
  name: string;
  domain: string;
  root_url: string;
  is_priority: boolean;
  status: string;
  pages_count: number;
  error: string | null;
  max_pages: number;
  snapshot: Snapshot | null;
}
interface DimScore {
  top_dimension: string;
  sub_dimension: string | null;
  score: number | null;
}

type Metric = "readiness" | "coverage";

function barColor(v: number): string {
  if (v >= 7.5) return "bg-green-500";
  if (v >= 5) return "bg-amber-500";
  return "bg-red-500";
}

export default function CompetitorsTab({ projectId }: { projectId: string }) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [ownReadiness, setOwnReadiness] = useState<number | null>(null);
  const [ownCoverage, setOwnCoverage] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>("readiness");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, a, cov] = await Promise.all([
        apiGet<{ competitors: Competitor[] }>(`/api/projects/${projectId}/competitors`),
        apiGet<{ dimensions?: DimScore[] }>(`/api/projects/${projectId}/audit`),
        apiGet<{ summary: { score: number | null } | null }>(`/api/projects/${projectId}/coverage`),
      ]);
      setCompetitors(c.competitors ?? []);
      const readiness = (a.dimensions ?? []).find(
        (d) => d.top_dimension === "readiness" && d.sub_dimension === null
      );
      setOwnReadiness(readiness?.score ?? null);
      setOwnCoverage(cov.summary?.score ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll mientras haya competidores corriendo.
  useEffect(() => {
    const anyRunning = competitors.some((c) => c.status === "queued" || c.status === "running");
    setPolling(anyRunning);
    if (!anyRunning) return;
    const t = setInterval(async () => {
      await load();
      pokeWorker(projectId);
    }, 3000);
    return () => clearInterval(t);
  }, [competitors, load, projectId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/competitors`, {
        root_url: url.trim(),
        name: name.trim() || undefined,
        is_priority: priority,
      });
      setUrl("");
      setName("");
      setPriority(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function run(cid: string) {
    await apiPost(`/api/projects/${projectId}/competitors/${cid}/run`, {});
    pokeWorker(projectId);
    await load();
  }
  async function runAll() {
    for (const c of competitors) await run(c.id);
  }
  async function remove(cid: string) {
    await apiDelete(`/api/projects/${projectId}/competitors/${cid}`);
    await load();
  }

  const own = metric === "readiness" ? ownReadiness : ownCoverage;
  const metricOf = (c: Competitor) =>
    metric === "readiness" ? c.snapshot?.readiness_score ?? null : c.snapshot?.coverage_score ?? null;

  // Filas del benchmark: tu sitio + competidores con dato, ordenadas desc.
  const benchRows = [
    { id: "own", label: "Tu sitio", value: own, own: true },
    ...competitors.map((c) => ({ id: c.id, label: c.name, value: metricOf(c), own: false })),
  ]
    .filter((r) => r.value !== null)
    .sort((a, b) => (b.value as number) - (a.value as number));

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Alta */}
      <form onSubmit={add} className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-800">Agregar competidor</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Competencia real de tu mercado. Se hace un crawl acotado y se audita con la misma metodología.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="competidor.com"
            className="min-w-[180px] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (opcional)"
            className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-zinc-600">
            <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} />
            Prioritario
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {busy ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </form>

      {/* Benchmark */}
      {benchRows.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">Posición relativa</h3>
            <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 text-xs">
              {(["readiness", "coverage"] as Metric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`rounded px-2 py-1 ${metric === m ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500"}`}
                >
                  {m === "readiness" ? "Readiness" : "Cobertura"}
                </button>
              ))}
            </div>
          </div>
          <ul className="space-y-2">
            {benchRows.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <span className={`w-32 shrink-0 truncate text-xs ${r.own ? "font-semibold text-zinc-900" : "text-zinc-600"}`}>
                  {r.own ? "★ " : ""}{r.label}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-zinc-100">
                  <div
                    className={`h-full ${r.own ? "bg-zinc-900" : barColor(r.value as number)}`}
                    style={{ width: `${(r.value as number) * 10}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold text-zinc-800">
                  {(r.value as number).toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-zinc-400">
            Escala 0–10. {metric === "coverage" ? "Cobertura de tu demanda objetivo por cada sitio." : "Readiness técnico (roll-up)."}
          </p>
        </div>
      )}

      {/* Lista */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-700">
            Competidores {competitors.length > 0 && `(${competitors.length})`}
          </h3>
          {competitors.length > 0 && (
            <button
              onClick={runAll}
              disabled={polling}
              className="text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {polling ? "Corriendo…" : "Auditar todos"}
            </button>
          )}
        </div>
        {competitors.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin competidores todavía. Agregá al menos uno para comparar.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {competitors.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm text-zinc-800">
                    {c.is_priority && <span className="text-amber-500">★</span>}
                    {c.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500">
                    <a href={c.root_url} target="_blank" rel="noreferrer" className="hover:underline">
                      {c.domain}
                    </a>
                    <StatusBadge status={c.status} />
                    {c.pages_count > 0 && <span>{c.pages_count} págs</span>}
                    {c.snapshot?.readiness_score != null && (
                      <span>Readiness {c.snapshot.readiness_score.toFixed(1)}</span>
                    )}
                    {c.snapshot?.coverage_score != null && (
                      <span>Cobertura {c.snapshot.coverage_score.toFixed(1)}</span>
                    )}
                    {c.error && <span className="text-red-600">{c.error}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => run(c.id)}
                    disabled={c.status === "queued" || c.status === "running"}
                    className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {c.snapshot ? "Re-auditar" : "Auditar"}
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "text-zinc-400",
    queued: "text-amber-600",
    running: "text-amber-600",
    done: "text-green-600",
    error: "text-red-600",
  };
  const label: Record<string, string> = {
    new: "sin auditar",
    queued: "en cola",
    running: "auditando…",
    done: "auditado",
    error: "error",
  };
  return <span className={map[status] ?? "text-zinc-400"}>{label[status] ?? status}</span>;
}
