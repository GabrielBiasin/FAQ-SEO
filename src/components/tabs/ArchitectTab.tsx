"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, pokeWorker } from "@/lib/api";

interface Page {
  type: string;
  title: string;
  url_slug: string;
  h1: string;
  intent: string;
  target_queries?: string[];
  outline?: { h2: string; h3?: string[] }[];
  covers_demand?: string[];
}
interface Segment {
  name: string;
  rationale: string;
  pages: Page[];
}
interface Structure {
  segments: Segment[];
  notes?: string;
}
interface Blueprint {
  id: string;
  status: string;
  structure: Structure;
  prompt_md: string | null;
  error: string | null;
  created_at: string;
}

const TYPE_BADGE: Record<string, string> = {
  home: "bg-zinc-800 text-white",
  landing: "bg-blue-100 text-blue-700",
  category: "bg-violet-100 text-violet-700",
  article: "bg-emerald-100 text-emerald-700",
  faq_hub: "bg-amber-100 text-amber-800",
};

export default function ArchitectTab({ projectId }: { projectId: string }) {
  const [bp, setBp] = useState<Blueprint | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"structure" | "prompt">("structure");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ blueprint: Blueprint | null }>(`/api/projects/${projectId}/blueprint`);
      setBp(r.blueprint);
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
      const { jobs } = await apiGet<{ jobs: { type: string; status: string }[] }>(
        `/api/jobs?project_id=${projectId}`
      );
      const active = jobs.some(
        (j) => j.type === "build_blueprint" && (j.status === "queued" || j.status === "running")
      );
      if (active) pokeWorker(projectId);
      else {
        setRunning(false);
        await load();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [running, projectId, load]);

  async function generate() {
    setRunning(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/blueprint`, {});
      pokeWorker(projectId);
      setTimeout(() => setRunning(false), 90000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setRunning(false);
    }
  }

  async function copyMd() {
    if (!bp?.prompt_md) return;
    await navigator.clipboard.writeText(bp.prompt_md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const structure = bp?.structure;
  const totalPages = structure?.segments?.reduce((n, s) => n + s.pages.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Arquitecto de sitio</h3>
          <p className="text-xs text-zinc-500">
            Estructura ideal desde tu demanda + gaps de cobertura + patrones de competidores.
            {bp?.created_at && !running && ` · ${new Date(bp.created_at).toLocaleString()}`}
          </p>
        </div>
        <button
          onClick={generate}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {running ? "Generando…" : bp ? "Regenerar" : "Generar arquitectura"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!bp && !running && (
        <p className="text-sm text-zinc-400">
          Sin arquitectura todavía. Generala (requiere demanda en Tópicos & Preguntas; usa competidores y
          cobertura si están disponibles).
        </p>
      )}

      {bp?.status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          La generación falló: {bp.error}
        </div>
      )}

      {structure?.segments?.length ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 text-xs">
              {(["structure", "prompt"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded px-3 py-1 ${tab === t ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500"}`}
                >
                  {t === "structure" ? "Estructura" : "Brief para IA de diseño"}
                </button>
              ))}
            </div>
            <span className="text-xs text-zinc-500">
              {structure.segments.length} segmentos · {totalPages} páginas
            </span>
          </div>

          {tab === "structure" ? (
            <div className="space-y-4">
              {structure.notes && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                  {structure.notes}
                </div>
              )}
              {structure.segments.map((seg, si) => (
                <div key={si} className="rounded-lg border border-zinc-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-zinc-800">{seg.name}</h4>
                  {seg.rationale && <p className="mt-0.5 text-xs text-zinc-500">{seg.rationale}</p>}
                  <ul className="mt-3 space-y-3">
                    {seg.pages.map((p, pi) => (
                      <li key={pi} className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[p.type] ?? "bg-zinc-200 text-zinc-700"}`}>
                            {p.type}
                          </span>
                          <span className="text-sm font-medium text-zinc-800">{p.title}</span>
                          <span className="font-mono text-[11px] text-zinc-400">/{p.url_slug.replace(/^\//, "")}</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600">
                          <span className="font-semibold">H1:</span> {p.h1}
                          <span className="ml-2 text-zinc-400">· {p.intent}</span>
                        </p>
                        {p.outline?.length ? (
                          <ul className="mt-1.5 space-y-0.5 border-l-2 border-zinc-200 pl-3 text-xs text-zinc-600">
                            {p.outline.map((o, oi) => (
                              <li key={oi}>
                                <span className="font-medium">{o.h2}</span>
                                {o.h3?.length ? (
                                  <span className="text-zinc-400"> — {o.h3.join(", ")}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {p.target_queries?.length ? (
                          <p className="mt-1.5 text-[11px] text-zinc-400">
                            Queries: {p.target_queries.join(" · ")}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-end gap-2">
                <button
                  onClick={copyMd}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {copied ? "¡Copiado!" : "Copiar Markdown"}
                </button>
              </div>
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
                {bp?.prompt_md}
              </pre>
              <p className="text-[11px] text-zinc-400">
                Pegá este brief en Claude, Stitch o Figma AI para generar los wireframes.
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
