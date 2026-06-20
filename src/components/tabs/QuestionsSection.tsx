"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { pokeWorker } from "@/lib/api";
import type { QuestionRow, QuestionTier } from "@/types/database";

interface TopicLite {
  id: string;
  name: string;
  priority: number;
}
interface PageLite {
  id: string;
  url: string;
  title: string | null;
}

const TIER_ORDER: Record<QuestionTier, number> = { head: 0, mid: 1, long: 2 };
const TIER_BADGE: Record<string, string> = {
  head: "bg-indigo-100 text-indigo-700",
  mid: "bg-sky-100 text-sky-700",
  long: "bg-zinc-100 text-zinc-600",
};
const INTENT_BADGE: Record<string, string> = {
  product: "bg-amber-100 text-amber-800",
  transactional: "bg-green-100 text-green-700",
  comparative: "bg-purple-100 text-purple-700",
  process: "bg-blue-100 text-blue-700",
  definitional: "bg-zinc-100 text-zinc-600",
};

export default function QuestionsSection({ projectId }: { projectId: string }) {
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [topics, setTopics] = useState<TopicLite[]>([]);
  const [pages, setPages] = useState<PageLite[]>([]);
  const [running, setRunning] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [groupBy, setGroupBy] = useState<"topic" | "section">("section");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{
        questions: QuestionRow[];
        topics: TopicLite[];
        pages: PageLite[];
      }>(`/api/projects/${projectId}/questions`);
      setQuestions(r.questions);
      setTopics(r.topics);
      setPages(r.pages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!running && !placing) return;
    const t = setInterval(load, 3500);
    return () => clearInterval(t);
  }, [running, placing, load]);

  async function assignSections() {
    setPlacing(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/questions`, {
        action: "assign_placements",
      });
      pokeWorker(projectId);
      setTimeout(() => setPlacing(false), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setPlacing(false);
    }
  }

  async function discover() {
    setRunning(true);
    setError(null);
    try {
      await apiPost(`/api/projects/${projectId}/questions`, { action: "discover" });
      pokeWorker(projectId);
      setTimeout(() => setRunning(false), 90000); // web search + synthesis can take a while
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setRunning(false);
    }
  }

  async function saveEdit(qid: string) {
    await fetch(`/api/questions/${qid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editText }),
    });
    setEditing(null);
    load();
  }

  async function remove(qid: string) {
    await apiDelete(`/api/questions/${qid}`);
    load();
  }

  // Build groups by the active axis (section or topic). Each group keeps the
  // general→specific order (head→long, then priority desc).
  const sortQs = (list: QuestionRow[]) =>
    list.sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.priority_score - a.priority_score
    );

  const topicName = (tid: string | null) =>
    tid ? topics.find((t) => t.id === tid)?.name ?? "Sin tópico" : "Sin tópico";
  const pageById = (pid: string | null): PageLite | null =>
    (pid ? pages.find((p) => p.id === pid) : null) ?? null;
  const hasPlacements = questions.some((q) => q.placement_section);

  interface Group {
    key: string;
    label: string;
    page: PageLite | null;
    items: QuestionRow[];
  }
  let groups: Group[] = [];

  if (groupBy === "section") {
    const map = new Map<string, QuestionRow[]>();
    for (const q of questions) {
      const key = q.placement_section || "Sin asignar";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    groups = Array.from(map.entries())
      .map(([label, items]) => ({
        key: label,
        label,
        page: pageById(items.find((q) => q.placement_page_id)?.placement_page_id ?? null),
        items: sortQs(items),
      }))
      // "Sin asignar" last; otherwise by size desc.
      .sort((a, b) =>
        a.label === "Sin asignar" ? 1 : b.label === "Sin asignar" ? -1 : b.items.length - a.items.length
      );
  } else {
    const map = new Map<string | null, QuestionRow[]>();
    for (const q of questions) {
      if (!map.has(q.topic_id)) map.set(q.topic_id, []);
      map.get(q.topic_id)!.push(q);
    }
    const orderedTopicIds = [
      ...[...topics].sort((a, b) => b.priority - a.priority).map((t) => t.id),
      null,
    ].filter((tid) => map.has(tid));
    groups = orderedTopicIds.map((tid) => ({
      key: tid ?? "none",
      label: topicName(tid),
      page: null,
      items: sortQs(map.get(tid)!),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Preguntas</h3>
          <p className="text-xs text-zinc-500">
            Embudo multi-fuente: seeds + búsqueda web + contenido. Sin inventar long-tail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {questions.length > 0 && (
            <button
              onClick={assignSections}
              disabled={placing}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {placing ? "Asignando…" : hasPlacements ? "Re-asignar secciones" : "Asignar a secciones"}
            </button>
          )}
          <button
            onClick={discover}
            disabled={running}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {running ? "Descubriendo…" : questions.length ? "Re-descubrir" : "Descubrir preguntas"}
          </button>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Agrupar por:</span>
          {(["section", "topic"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`rounded-full px-3 py-1 ${
                groupBy === g ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {g === "section" ? "Sección del sitio" : "Tópico"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {questions.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Sin preguntas todavía. Cargá seeds y ejecutá el descubrimiento.
        </p>
      ) : (
        <div className="space-y-5">
          {groupBy === "section" && !hasPlacements && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Todavía no asignaste las preguntas a secciones del sitio. Hacé clic en
              “Asignar a secciones” para mapear cada FAQ a su página (Home, Contacto,
              cada servicio/producto), apuntando a 5–10 por sección.
            </div>
          )}
          {groups.map((grp) => {
            const n = grp.items.length;
            // 5–10 per relevant section is the target; flag out-of-range.
            const inRange = n >= 5 && n <= 10;
            const countClass =
              groupBy === "section" && grp.label !== "Sin asignar"
                ? inRange
                  ? "text-green-600"
                  : "text-amber-600"
                : "text-zinc-400";
            return (
            <div key={grp.key}>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {grp.label}
                </h4>
                <span className={`text-xs font-medium ${countClass}`}>({n})</span>
                {grp.page && (
                  <a
                    href={grp.page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[11px] text-zinc-400 hover:underline"
                  >
                    {grp.page.url}
                  </a>
                )}
              </div>
              <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                {grp.items.map((q) => (
                  <li key={q.id} className="px-4 py-3">
                    {editing === q.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => saveEdit(q.id)}
                          className="text-sm font-medium text-green-700"
                        >
                          Guardar
                        </button>
                        <button onClick={() => setEditing(null)} className="text-sm text-zinc-400">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-zinc-800">{q.text}</p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {groupBy === "topic" && q.placement_section && (
                            <span
                              className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                              title="sección destino"
                            >
                              📍 {q.placement_section}
                            </span>
                          )}
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TIER_BADGE[q.tier]}`}>
                            {q.tier}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${INTENT_BADGE[q.intent]}`}>
                            {q.intent}
                          </span>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500" title="source">
                            {q.source}
                          </span>
                          <span className="text-[10px] text-zinc-400" title="priority_score">
                            {Math.round(q.priority_score)}
                          </span>
                          <button
                            onClick={() => {
                              setEditing(q.id);
                              setEditText(q.text);
                            }}
                            className="ml-1 text-xs text-zinc-400 hover:text-zinc-700"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => remove(q.id)}
                            className="text-xs text-zinc-400 hover:text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
