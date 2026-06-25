"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, pokeWorker } from "@/lib/api";

interface EnrichedFaq {
  id: string;
  answer_text: string;
  status: "draft" | "needs_review" | "approved" | "rejected";
  confidence: number | null;
  unsupported_claims: string[];
  source_page_id: string | null;
  question: { id: string; text: string; tier: string; intent: string } | null;
  source_page: { id: string; url: string; title: string | null } | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  needs_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  needs_review: "Revisar",
  approved: "Aprobada",
  rejected: "Rechazada",
};

export default function FaqsTab({ projectId }: { projectId: string }) {
  const [faqs, setFaqs] = useState<EnrichedFaq[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [filter, setFilter] = useState<"all" | "needs_review" | "approved">("all");

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ faqs: EnrichedFaq[] }>(`/api/projects/${projectId}/faqs`);
      setFaqs(r.faqs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // While generating, keep poking the worker so batch continuations (each a
  // short job) drain, and stop once the queue has no active gen/verify jobs.
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await load();
      try {
        const { jobs } = await apiGet<{
          jobs: { type: string; status: string }[];
        }>(`/api/jobs?project_id=${projectId}`);
        const active = jobs.some(
          (j) =>
            (j.type === "generate_answers" || j.type === "verify_answers") &&
            (j.status === "queued" || j.status === "running")
        );
        if (active) pokeWorker(projectId);
        else setRunning(false);
      } catch {
        /* keep polling */
      }
    };
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [running, load, projectId]);

  async function generate() {
    setRunning(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/faqs`, { action: "generate" });
      pokeWorker(projectId);
      // Safety net: stop the spinner even if polling misses the end.
      setTimeout(() => setRunning(false), 600000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setRunning(false);
    }
  }

  async function patch(fid: string, body: Record<string, unknown>) {
    await fetch(`/api/faqs/${fid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  const counts = {
    total: faqs.length,
    needs_review: faqs.filter((f) => f.status === "needs_review").length,
    approved: faqs.filter((f) => f.status === "approved").length,
  };
  const visible = faqs.filter((f) =>
    filter === "all" ? true : f.status === filter
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Respuestas (FAQs)</h3>
          <p className="text-xs text-zinc-500">
            Answer-first, fundadas en la página fuente y verificadas. Nada se exporta sin revisión.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {running ? "Generando…" : faqs.length ? "Re-generar" : "Generar respuestas"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {faqs.length > 0 && (
        <div className="flex gap-2 text-sm">
          {(["all", "needs_review", "approved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 ${
                filter === f ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {f === "all"
                ? `Todas (${counts.total})`
                : f === "needs_review"
                ? `Revisar (${counts.needs_review})`
                : `Aprobadas (${counts.approved})`}
            </button>
          ))}
        </div>
      )}

      {faqs.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Sin respuestas todavía. Generá las respuestas (requiere preguntas descubiertas).
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((f) => (
            <li
              key={f.id}
              className={`rounded-lg border bg-white p-4 ${
                f.status === "needs_review" ? "border-amber-300" : "border-zinc-200"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-zinc-900">
                  {f.question?.text ?? "(pregunta)"}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {f.confidence !== null && (
                    <span
                      className="text-xs text-zinc-400"
                      title="confianza de grounding"
                    >
                      {Math.round(f.confidence * 100)}%
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[f.status]}`}>
                    {STATUS_LABEL[f.status]}
                  </span>
                </div>
              </div>

              {editing === f.id ? (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        patch(f.id, { answer_text: editText });
                        setEditing(null);
                      }}
                      className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white"
                    >
                      Guardar
                    </button>
                    <button onClick={() => setEditing(null)} className="text-sm text-zinc-400">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">
                  {f.answer_text || <span className="italic text-zinc-400">(vacía)</span>}
                </p>
              )}

              {f.unsupported_claims?.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="text-xs font-semibold text-amber-800">
                    Afirmaciones no sustentadas:
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-amber-700">
                    {f.unsupported_claims.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-zinc-400">
                  {f.source_page ? (
                    <a
                      href={f.source_page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      Fuente: {f.source_page.title || f.source_page.url}
                    </a>
                  ) : (
                    <span className="text-red-400">Sin fuente</span>
                  )}
                </div>
                {editing !== f.id && (
                  <div className="flex gap-2 text-sm">
                    <button
                      onClick={() => {
                        setEditing(f.id);
                        setEditText(f.answer_text);
                      }}
                      className="text-zinc-500 hover:text-zinc-800"
                    >
                      Editar
                    </button>
                    {f.status !== "approved" && (
                      <button
                        onClick={() => patch(f.id, { status: "approved" })}
                        className="font-medium text-green-700 hover:text-green-800"
                      >
                        Aprobar
                      </button>
                    )}
                    {f.status !== "rejected" && (
                      <button
                        onClick={() => patch(f.id, { status: "rejected" })}
                        className="text-red-600 hover:text-red-700"
                      >
                        Rechazar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
