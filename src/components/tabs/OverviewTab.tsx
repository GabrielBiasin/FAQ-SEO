"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, pokeWorker } from "@/lib/api";
import { Gauge, ShieldCheck, Eye, Target, ArrowRight } from "lucide-react";

interface DimScore {
  top_dimension: string;
  sub_dimension: string | null;
  score: number | null;
}
interface Reco {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  area: string;
}
interface CompRef {
  name: string;
  readiness_score?: number | null;
}

const KPI = [
  { key: "readiness", label: "Readiness", icon: Gauge, color: "#0d9488" },
  { key: "authority", label: "Authority", icon: ShieldCheck, color: "#7c3aed" },
  { key: "visibility", label: "Visibility", icon: Eye, color: "#2563eb" },
] as const;

function scoreText(v: number | null): string {
  if (v == null) return "text-zinc-300";
  if (v >= 7.5) return "text-green-600";
  if (v >= 5) return "text-amber-600";
  return "text-red-600";
}

export default function OverviewTab({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate?: (tab: string) => void;
}) {
  const [dims, setDims] = useState<DimScore[]>([]);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [coverage, setCoverage] = useState<number | null>(null);
  const [recos, setRecos] = useState<Reco[]>([]);
  const [competitors, setCompetitors] = useState<CompRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlPages, setCrawlPages] = useState(0);

  const load = useCallback(async () => {
    try {
      const [a, cov, rec, tr] = await Promise.all([
        apiGet<{ snapshot: unknown; dimensions?: DimScore[] }>(`/api/projects/${projectId}/audit`),
        apiGet<{ summary: { score: number | null } | null }>(`/api/projects/${projectId}/coverage`),
        apiGet<{ recommendations: Reco[] }>(`/api/projects/${projectId}/recommendations`),
        apiGet<{ competitors: CompRef[] }>(`/api/projects/${projectId}/trends`),
      ]);
      setHasSnapshot(Boolean(a.snapshot));
      setDims(a.dimensions ?? []);
      setCoverage(cov.summary?.score ?? null);
      setRecos(rec.recommendations ?? []);
      setCompetitors(tr.competitors ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Vigila un crawl activo (recién creado el proyecto se cae acá con el crawl corriendo).
  const checkCrawl = useCallback(async () => {
    try {
      const { crawl } = await apiGet<{ crawl: { status: string; pages_count: number } | null }>(
        `/api/projects/${projectId}/crawl`
      );
      const active = crawl?.status === "queued" || crawl?.status === "running";
      setCrawling(Boolean(active));
      setCrawlPages(crawl?.pages_count ?? 0);
      if (active) pokeWorker(projectId);
      return Boolean(active);
    } catch {
      return false;
    }
  }, [projectId]);

  useEffect(() => {
    checkCrawl();
  }, [checkCrawl]);

  useEffect(() => {
    if (!crawling) return;
    const t = setInterval(async () => {
      const still = await checkCrawl();
      if (!still) load();
    }, 3000);
    return () => clearInterval(t);
  }, [crawling, checkCrawl, load]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const { jobs } = await apiGet<{ jobs: { type: string; status: string }[] }>(
        `/api/jobs?project_id=${projectId}`
      );
      const active = jobs.some((j) => j.type === "run_audit" && (j.status === "queued" || j.status === "running"));
      if (active) pokeWorker(projectId);
      else {
        setRunning(false);
        load();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [running, projectId, load]);

  const rollup = (top: string) =>
    dims.find((d) => d.top_dimension === top && d.sub_dimension === null)?.score ?? null;

  async function runAudit() {
    setRunning(true);
    try {
      await apiPost(`/api/projects/${projectId}/audit`, {});
      pokeWorker(projectId);
    } catch {
      setRunning(false);
    }
  }

  const lead = competitors
    .filter((c) => c.readiness_score != null)
    .sort((a, b) => (b.readiness_score as number) - (a.readiness_score as number))[0];
  const ownReadiness = rollup("readiness");

  if (loading) return <p className="text-sm text-zinc-400">Cargando resumen…</p>;

  return (
    <div className="space-y-5">
      {crawling ? (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-6">
          <span className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900">Crawleando el sitio…</h3>
            <p className="text-xs text-blue-700">
              {crawlPages > 0 ? `${crawlPages} páginas encontradas hasta ahora.` : "Descubriendo páginas."} En cuanto termine podés correr la Auditoría GEO.
            </p>
          </div>
        </div>
      ) : (
        !hasSnapshot && (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-800">Empezá tu diagnóstico</h3>
              <p className="text-xs text-zinc-500">Corré la primera Auditoría GEO para ver tus KPIs, gaps y recomendaciones.</p>
            </div>
            <button
              onClick={runAudit}
              disabled={running}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {running ? "Auditando…" : "Correr auditoría"}
            </button>
          </div>
        )
      )}

      {/* KPIs vitales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPI.map((k) => {
          const v = rollup(k.key);
          const Icon = k.icon;
          return (
            <div key={k.key} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2 text-zinc-500">
                <Icon size={15} style={{ color: k.color }} />
                <span className="text-xs font-semibold uppercase tracking-wide">{k.label}</span>
              </div>
              <div className={`mt-2 text-3xl font-bold ${scoreText(v)}`}>
                {v == null ? "—" : v.toFixed(1)}
                {v != null && <span className="text-sm font-normal text-zinc-400">/10</span>}
              </div>
            </div>
          );
        })}
        {/* Cobertura */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Target size={15} className="text-rose-500" />
            <span className="text-xs font-semibold uppercase tracking-wide">Cobertura</span>
          </div>
          <div className={`mt-2 text-3xl font-bold ${scoreText(coverage)}`}>
            {coverage == null ? "—" : coverage.toFixed(1)}
            {coverage != null && <span className="text-sm font-normal text-zinc-400">/10</span>}
          </div>
        </div>
      </div>

      {/* Posición vs competencia */}
      {lead && ownReadiness != null && (
        <button
          onClick={() => onNavigate?.("competitors")}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50"
        >
          <div className="text-sm">
            <span className="font-semibold text-zinc-800">Posición vs. competencia: </span>
            {(() => {
              const gap = ownReadiness - (lead.readiness_score as number);
              return gap >= 0 ? (
                <span className="text-green-700">liderás por {gap.toFixed(1)} pts sobre {lead.name}.</span>
              ) : (
                <span className="text-red-700">{lead.name} te supera por {Math.abs(gap).toFixed(1)} pts.</span>
              );
            })()}
          </div>
          <ArrowRight size={16} className="text-zinc-400" />
        </button>
      )}

      {/* Top recomendaciones */}
      {recos.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">Prioridades</h3>
            <button onClick={() => onNavigate?.("recommendations")} className="text-xs text-blue-600 hover:underline">
              Ver todas ({recos.length})
            </button>
          </div>
          <ul className="space-y-1.5">
            {recos.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm text-zinc-700">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    r.severity === "high" ? "bg-red-500" : r.severity === "medium" ? "bg-amber-500" : "bg-zinc-400"
                  }`}
                />
                {r.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
