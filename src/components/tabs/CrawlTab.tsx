"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, pokeWorker } from "@/lib/api";
import type { CrawlRow } from "@/types/database";

interface PageLite {
  id: string;
  url: string;
  title: string | null;
  word_count: number;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "En cola",
  running: "Crawleando…",
  done: "Completado",
  error: "Error",
};

export default function CrawlTab({ projectId }: { projectId: string }) {
  const [crawl, setCrawl] = useState<CrawlRow | null>(null);
  const [pages, setPages] = useState<PageLite[]>([]);
  const [maxPages, setMaxPages] = useState(50);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ crawl: CrawlRow | null; pages: PageLite[] }>(
        `/api/projects/${projectId}/crawl`
      );
      setCrawl(r.crawl);
      setPages(r.pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while a crawl is active.
  useEffect(() => {
    if (crawl?.status !== "queued" && crawl?.status !== "running") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [crawl?.status, load]);

  async function launch() {
    setLaunching(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/crawl`, { max_pages: maxPages });
      pokeWorker(projectId); // kick the worker to start draining
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al lanzar");
    } finally {
      setLaunching(false);
    }
  }

  const active = crawl?.status === "queued" || crawl?.status === "running";

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Máx. páginas
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            disabled={active}
            className="w-28 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:bg-zinc-100"
          />
        </div>
        <button
          onClick={launch}
          disabled={launching || active}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {active ? "Crawl en curso…" : launching ? "Lanzando…" : "Lanzar crawl"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {crawl && (
        <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              crawl.status === "done"
                ? "bg-green-100 text-green-700"
                : crawl.status === "error"
                ? "bg-red-100 text-red-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {STATUS_LABEL[crawl.status] ?? crawl.status}
          </span>
          <span className="text-zinc-600">
            {crawl.pages_count} página{crawl.pages_count === 1 ? "" : "s"} · tope {crawl.max_pages}
          </span>
          {crawl.error && <span className="text-red-500">{crawl.error}</span>}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">
          Páginas crawleadas {pages.length > 0 && `(${pages.length})`}
        </h3>
        {pages.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Todavía no hay páginas. Lanzá un crawl para empezar.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {pages.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-800">
                    {p.title || "(sin título)"}
                  </p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-zinc-400 hover:underline"
                  >
                    {p.url}
                  </a>
                </div>
                <span className="shrink-0 text-xs text-zinc-400">{p.word_count} palabras</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
