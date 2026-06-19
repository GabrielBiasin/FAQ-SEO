"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, pokeWorker } from "@/lib/api";

interface Golden {
  id: string;
  question: string;
  ideal_answer: string;
}
interface VersionAgg {
  prompt_version: string;
  count: number;
  avg_score: number;
  pass_rate: number;
}
interface SovEngine {
  engine: string;
  total: number;
  cited: number;
  share: number;
}

export default function EvalTab({ projectId }: { projectId: string }) {
  const [golden, setGolden] = useState<Golden[]>([]);
  const [versions, setVersions] = useState<VersionAgg[]>([]);
  const [sov, setSov] = useState<SovEngine[]>([]);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [running, setRunning] = useState(false);
  const [citRunning, setCitRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [g, e, c] = await Promise.all([
      apiGet<{ golden: Golden[] }>(`/api/projects/${projectId}/golden`),
      apiGet<{ versions: VersionAgg[] }>(`/api/projects/${projectId}/evals`),
      apiGet<{ shareOfVoice: SovEngine[] }>(`/api/projects/${projectId}/citations`),
    ]);
    setGolden(g.golden);
    setVersions(e.versions);
    setSov(c.shareOfVoice);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!running && !citRunning) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, citRunning, load]);

  async function runCitation() {
    setCitRunning(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/citations`, { limit: 5 });
      pokeWorker(projectId);
      setTimeout(() => setCitRunning(false), 120000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setCitRunning(false);
    }
  }

  async function addGolden() {
    if (!q.trim() || !a.trim()) return;
    try {
      await apiPost(`/api/projects/${projectId}/golden`, { question: q, ideal_answer: a });
      setQ("");
      setA("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function runEval() {
    setRunning(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/evals`, {});
      pokeWorker(projectId);
      setTimeout(() => setRunning(false), 120000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setRunning(false);
    }
  }

  const maxScore = 5;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Dashboard */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Dashboard de eval</h3>
            <p className="text-xs text-zinc-500">Score promedio por versión del prompt de generación.</p>
          </div>
          <button
            onClick={runEval}
            disabled={running}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {running ? "Evaluando…" : "Correr eval"}
          </button>
        </div>
        {versions.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin evals todavía. Corré una evaluación.</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.prompt_version} className="flex items-center gap-3">
                <span className="w-40 shrink-0 font-mono text-xs text-zinc-600">{v.prompt_version}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-100">
                  <div
                    className="h-full bg-zinc-800"
                    style={{ width: `${(v.avg_score / maxScore) * 100}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-zinc-600">
                  {v.avg_score}/5 · {Math.round(v.pass_rate * 100)}% pass ({v.count})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Share of voice (citation tracking) */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">Share of voice por motor</h3>
            <p className="text-xs text-zinc-500">
              ¿Aparece la marca citada al responder las preguntas clave? (proxy vía búsqueda web)
            </p>
          </div>
          <button
            onClick={runCitation}
            disabled={citRunning}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {citRunning ? "Chequeando…" : "Chequear citaciones"}
          </button>
        </div>
        {sov.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin chequeos todavía.</p>
        ) : (
          <ul className="space-y-2">
            {sov.map((s) => (
              <li key={s.engine} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-zinc-600">{s.engine}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-100">
                  <div className="h-full bg-indigo-500" style={{ width: `${s.share * 100}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-zinc-600">
                  {Math.round(s.share * 100)}% citado ({s.cited}/{s.total})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Golden set */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-800">Golden set</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Preguntas con su respuesta ideal validada por vos. Sirven de referencia al juez.
        </p>
        <div className="space-y-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pregunta"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <textarea
            value={a}
            onChange={(e) => setA(e.target.value)}
            rows={2}
            placeholder="Respuesta ideal"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            onClick={addGolden}
            disabled={!q.trim() || !a.trim()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Agregar al golden set
          </button>
        </div>

        {golden.length > 0 && (
          <ul className="mt-4 space-y-2">
            {golden.map((g) => (
              <li key={g.id} className="rounded-md bg-zinc-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-800">{g.question}</p>
                  <button
                    onClick={async () => {
                      await apiDelete(`/api/projects/${projectId}/golden?golden_id=${g.id}`);
                      load();
                    }}
                    className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{g.ideal_answer}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
