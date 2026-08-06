"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

interface Point {
  date: string;
  readiness: number | null;
  authority: number | null;
  visibility: number | null;
}
interface CompRef {
  name: string;
  readiness_score?: number | null;
  coverage_score?: number | null;
}

const SERIES = [
  { key: "readiness", label: "Readiness", color: "#0d9488" },
  { key: "authority", label: "Authority", color: "#7c3aed" },
  { key: "visibility", label: "Visibility", color: "#2563eb" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function TrackingTab({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Point[]>([]);
  const [competitors, setCompetitors] = useState<CompRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ project: Point[]; competitors: CompRef[] }>(
        `/api/projects/${projectId}/trends`
      );
      setProject(r.project ?? []);
      setCompetitors(r.competitors ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-zinc-400">Cargando evolución…</p>;
  if (error)
    return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;

  if (project.length === 0)
    return (
      <p className="text-sm text-zinc-400">
        Sin auditorías todavía. Corré la Auditoría GEO para empezar a trackear la evolución.
      </p>
    );

  const last = project[project.length - 1];
  const prev = project.length > 1 ? project[project.length - 2] : null;
  const leadComp = competitors
    .filter((c) => c.readiness_score != null)
    .sort((a, b) => (b.readiness_score as number) - (a.readiness_score as number))[0];

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SERIES.map((s) => {
          const cur = last[s.key];
          const before = prev?.[s.key] ?? null;
          const delta = cur != null && before != null ? cur - before : null;
          return (
            <div key={s.key} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{s.label}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-zinc-800">
                  {cur == null ? "—" : cur.toFixed(1)}
                  {cur != null && <span className="text-base font-normal text-zinc-400">/10</span>}
                </span>
                {delta != null && Math.abs(delta) >= 0.05 && (
                  <span className={`text-xs font-medium ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
                    {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {project.length} {project.length === 1 ? "medición" : "mediciones"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gap vs competidor líder */}
      {leadComp && last.readiness != null && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <span className="font-semibold text-zinc-800">Posición vs. competencia (Readiness): </span>
          {(() => {
            const gap = (last.readiness as number) - (leadComp.readiness_score as number);
            if (gap >= 0)
              return (
                <span className="text-green-700">
                  liderás por {gap.toFixed(1)} pts sobre {leadComp.name} ({leadComp.readiness_score?.toFixed(1)}).
                </span>
              );
            return (
              <span className="text-red-700">
                {leadComp.name} te supera por {Math.abs(gap).toFixed(1)} pts ({leadComp.readiness_score?.toFixed(1)} vs {(last.readiness as number).toFixed(1)}).
              </span>
            );
          })()}
        </div>
      )}

      {/* Gráfico de evolución */}
      {project.length < 2 ? (
        <p className="text-sm text-zinc-400">
          Necesitás al menos 2 auditorías para ver la curva de evolución. Volvé a auditar más adelante.
        </p>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-800">Evolución</h3>
          <LineChart points={project} />
          <div className="mt-3 flex flex-wrap gap-4">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-zinc-600">
                <span className="h-2 w-4 rounded" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LineChart({ points }: { points: Point[] }) {
  const W = 640;
  const H = 220;
  const P = { top: 12, right: 12, bottom: 26, left: 28 };
  const iw = W - P.left - P.right;
  const ih = H - P.top - P.bottom;
  const n = points.length;
  const x = (i: number) => P.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => P.top + ih - (v / 10) * ih;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img">
        {/* grid + labels y (0,5,10) */}
        {[0, 5, 10].map((g) => (
          <g key={g}>
            <line x1={P.left} y1={y(g)} x2={W - P.right} y2={y(g)} stroke="#f1f1f3" />
            <text x={P.left - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="#a1a1aa">
              {g}
            </text>
          </g>
        ))}
        {/* eje x: primera y última fecha */}
        <text x={x(0)} y={H - 8} textAnchor="start" fontSize="9" fill="#a1a1aa">
          {fmt(points[0].date)}
        </text>
        <text x={x(n - 1)} y={H - 8} textAnchor="end" fontSize="9" fill="#a1a1aa">
          {fmt(points[n - 1].date)}
        </text>
        {/* series */}
        {SERIES.map((s) => {
          const segs = points
            .map((p, i) => ({ i, v: p[s.key] }))
            .filter((d): d is { i: number; v: number } => d.v != null);
          if (segs.length === 0) return null;
          const path = segs
            .map((d, k) => `${k === 0 ? "M" : "L"} ${x(d.i).toFixed(1)} ${y(d.v).toFixed(1)}`)
            .join(" ");
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} />
              {segs.map((d) => (
                <circle key={d.i} cx={x(d.i)} cy={y(d.v)} r={2.5} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
