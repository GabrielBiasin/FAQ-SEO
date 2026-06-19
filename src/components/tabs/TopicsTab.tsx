"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, pokeWorker } from "@/lib/api";
import type { TopicRow } from "@/types/database";

export default function TopicsTab({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ topic_summary: string | null; topics: TopicRow[] }>(
        `/api/projects/${projectId}/topics`
      );
      setSummary(r.topic_summary);
      setTopics(r.topics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll a few times after launching so new topics appear without a refresh.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  async function analyze() {
    setRunning(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/topics`, {});
      pokeWorker(projectId);
      // Stop polling after ~45s as a safety net.
      setTimeout(() => setRunning(false), 45000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al lanzar");
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Análisis de tópicos</h3>
          <p className="text-xs text-zinc-500">
            Claude lee el contenido crawleado y detecta de qué trata el sitio.
          </p>
        </div>
        <button
          onClick={analyze}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {running ? "Analizando…" : topics.length ? "Re-analizar" : "Analizar tópicos"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {summary && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Resumen del sitio
          </h4>
          <p className="text-sm leading-relaxed text-zinc-700">{summary}</p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">
          Tópicos {topics.length > 0 && `(${topics.length})`}
        </h3>
        {topics.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Sin tópicos todavía. Ejecutá el análisis (requiere un crawl previo).
          </p>
        ) : (
          <ul className="space-y-2">
            {topics.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-zinc-900">{t.name}</h4>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    prioridad {t.priority}
                  </span>
                </div>
                {t.summary && <p className="mt-1 text-sm text-zinc-600">{t.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
