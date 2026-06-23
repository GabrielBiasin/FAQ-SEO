"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, pokeWorker } from "@/lib/api";
import type { SectionRow, SectionType, IntentTemplateRow } from "@/types/database";

interface SectionWithCount extends SectionRow {
  count: number;
  coverage_count: number;
}

const SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "about_trust", label: "Confianza" },
  { value: "differentiation", label: "Diferenciación" },
  { value: "transactional", label: "Transaccional" },
  { value: "product", label: "Producto/Servicio" },
  { value: "other", label: "Otra" },
];

export default function SectionsSection({ projectId }: { projectId: string }) {
  const [sections, setSections] = useState<SectionWithCount[]>([]);
  const [templates, setTemplates] = useState<IntentTemplateRow[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [expandFor, setExpandFor] = useState<string | null>(null);
  const [intentText, setIntentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{
        sections: SectionWithCount[];
        templates: IntentTemplateRow[];
        unassigned: number;
      }>(`/api/projects/${projectId}/sections`);
      setSections(r.sections);
      setTemplates(r.templates);
      setUnassigned(r.unassigned);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(sid: string, body: Record<string, unknown>) {
    await fetch(`/api/sections/${sid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  async function expand(sid: string) {
    setBusy(true);
    try {
      await apiPost(`/api/sections/${sid}`, { intent_text: intentText });
      pokeWorker(projectId);
      setExpandFor(null);
      setIntentText("");
      setTimeout(load, 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-800">Secciones del sitio</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Se detectan al analizar tópicos. Corré el análisis para descubrir las secciones.
        </p>
      </div>
    );
  }

  // Templates grouped for the dropdown (system first).
  const templatesForType = (t: SectionType) =>
    templates.filter((tpl) => tpl.section_type === t || tpl.is_system);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-800">Secciones del sitio</h3>
        {unassigned > 0 && (
          <span className="text-xs text-amber-600">{unassigned} preguntas sin sección</span>
        )}
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Confirmá el tipo sugerido, marcá prioridad, ajustá objetivo de FAQs (min/target) y ampliá
        con una intención puntual. La app apunta a llenar cada sección prioritaria hasta su target.
      </p>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <ul className="space-y-3">
        {sections.map((s) => {
          const inRange = s.count >= s.min_faqs && s.count <= s.target_faqs;
          const pct = s.target_faqs ? Math.min(100, (s.count / s.target_faqs) * 100) : 0;
          return (
            <li key={s.id} className="rounded-lg border border-zinc-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900">{s.name}</span>
                  {s.suggested_type && s.suggested_type !== s.section_type && (
                    <span className="text-[10px] text-zinc-400">
                      (sugerido: {s.suggested_type})
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-1 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={s.is_priority}
                    onChange={(e) => patch(s.id, { is_priority: e.target.checked })}
                  />
                  prioritaria
                </label>
              </div>

              {/* coverage bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-100">
                  <div
                    className={`h-full ${inRange ? "bg-green-500" : "bg-amber-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-xs ${inRange ? "text-green-600" : "text-amber-600"}`}>
                  {s.count}/{s.target_faqs} {s.coverage_count > 0 && `· ${s.coverage_count} cob.`}
                </span>
              </div>

              {/* config row */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={s.section_type}
                  onChange={(e) => patch(s.id, { section_type: e.target.value })}
                  className="rounded border border-zinc-300 px-2 py-1"
                >
                  {SECTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select
                  value={s.intent_template_id ?? ""}
                  onChange={(e) => patch(s.id, { intent_template_id: e.target.value || null })}
                  className="rounded border border-zinc-300 px-2 py-1"
                  title="Plantilla de intención"
                >
                  <option value="">(sin plantilla)</option>
                  {templatesForType(s.section_type).map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                      {tpl.is_system ? " (sistema)" : ""}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-zinc-600">
                  min
                  <input
                    type="number"
                    min={0}
                    max={50}
                    defaultValue={s.min_faqs}
                    onBlur={(e) => patch(s.id, { min_faqs: Number(e.target.value) })}
                    className="w-14 rounded border border-zinc-300 px-1 py-1"
                  />
                </label>
                <label className="flex items-center gap-1 text-zinc-600">
                  target
                  <input
                    type="number"
                    min={0}
                    max={50}
                    defaultValue={s.target_faqs}
                    onBlur={(e) => patch(s.id, { target_faqs: Number(e.target.value) })}
                    className="w-14 rounded border border-zinc-300 px-1 py-1"
                  />
                </label>
                <button
                  onClick={() => {
                    setExpandFor(expandFor === s.id ? null : s.id);
                    setIntentText("");
                  }}
                  className="rounded border border-zinc-300 px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Ampliar
                </button>
              </div>

              {expandFor === s.id && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={intentText}
                    onChange={(e) => setIntentText(e.target.value)}
                    placeholder="Intención puntual a reforzar (ej. tiempos de entrega, garantías…)"
                    className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                  <button
                    onClick={() => expand(s.id)}
                    disabled={busy}
                    className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {busy ? "…" : "Generar"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
