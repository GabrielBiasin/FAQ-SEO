"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, pokeWorker } from "@/lib/api";

interface Finding {
  url: string;
  context: string;
  sentiment: "positive" | "neutral" | "negative";
  is_citation: boolean;
}
interface Gap {
  issue: string;
  recommendation: string;
}
interface Audit {
  id: string;
  status: "queued" | "running" | "done" | "error";
  findings: Finding[];
  gaps: Gap[];
  summary: string | null;
}

const SENT_BADGE: Record<string, string> = {
  positive: "bg-green-100 text-green-700",
  neutral: "bg-zinc-100 text-zinc-600",
  negative: "bg-red-100 text-red-700",
};

export default function BrandTab({ projectId }: { projectId: string }) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ audit: Audit | null }>(`/api/projects/${projectId}/brand`);
      setAudit(r.audit);
      if (r.audit && (r.audit.status === "queued" || r.audit.status === "running")) {
        setRunning(true);
      } else setRunning(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/brand`, {});
      pokeWorker(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setRunning(false);
    }
  }

  const citations = audit?.findings.filter((f) => f.is_citation).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Auditoría de marca (Earned AEO)</h3>
          <p className="text-xs text-zinc-500">
            Dónde y cómo se menciona la marca en la web, y si aparece citada por IA.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {running ? "Auditando…" : audit ? "Re-auditar" : "Lanzar auditoría"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {audit?.summary && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-2 flex gap-4 text-xs text-zinc-500">
            <span><strong className="text-zinc-800">{audit.findings.length}</strong> menciones</span>
            <span><strong className="text-zinc-800">{citations}</strong> citas en IA</span>
            <span><strong className="text-zinc-800">{audit.gaps.length}</strong> gaps</span>
          </div>
          <p className="text-sm leading-relaxed text-zinc-700">{audit.summary}</p>
        </div>
      )}

      {audit && audit.findings.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-zinc-700">Menciones</h4>
          <ul className="space-y-2">
            {audit.findings.map((f, i) => (
              <li key={i} className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-sm text-blue-600 hover:underline">
                    {f.url}
                  </a>
                  <div className="flex shrink-0 gap-1.5">
                    {f.is_citation && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                        cita IA
                      </span>
                    )}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SENT_BADGE[f.sentiment]}`}>
                      {f.sentiment}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{f.context}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {audit && audit.gaps.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-zinc-700">Gaps a reforzar</h4>
          <ul className="space-y-2">
            {audit.gaps.map((g, i) => (
              <li key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">{g.issue}</p>
                <p className="mt-0.5 text-sm text-amber-700">{g.recommendation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!audit && !running && (
        <p className="text-sm text-zinc-400">Sin auditoría todavía. Lanzá una para empezar.</p>
      )}
    </div>
  );
}
