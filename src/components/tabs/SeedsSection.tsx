"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import type { SeedQuestionRow, SeedSource } from "@/types/database";

const SOURCES: { value: SeedSource; label: string }[] = [
  { value: "sales", label: "Ventas" },
  { value: "support", label: "Soporte" },
  { value: "manual", label: "Manual" },
  { value: "search_console", label: "Search Console" },
];

export default function SeedsSection({ projectId }: { projectId: string }) {
  const [seeds, setSeeds] = useState<SeedQuestionRow[]>([]);
  const [text, setText] = useState("");
  const [source, setSource] = useState<SeedSource>("sales");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ seeds: SeedQuestionRow[] }>(`/api/projects/${projectId}/seeds`);
      setSeeds(r.seeds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/seeds`, { text, source });
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(seedId: string) {
    await apiDelete(`/api/projects/${projectId}/seeds?seed_id=${seedId}`);
    load();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-800">
        Preguntas semilla <span className="font-normal text-zinc-400">(de ventas/soporte — máxima prioridad)</span>
      </h3>
      <p className="mt-0.5 mb-3 text-xs text-zinc-500">
        Pegá preguntas reales, una por línea. Alimentan el descubrimiento sin inventar long-tail.
      </p>

      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"¿Cuánto tarda el envío?\n¿Hacen devoluciones?"}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SeedSource)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={busy || !text.trim()}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? "Cargando…" : "Cargar"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {seeds.length > 0 && (
        <ul className="mt-3 space-y-1">
          {seeds.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded bg-zinc-50 px-2.5 py-1.5 text-sm"
            >
              <span className="text-zinc-700">{s.text}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600">
                  {s.source}
                </span>
                <button
                  onClick={() => remove(s.id)}
                  className="text-xs text-zinc-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
