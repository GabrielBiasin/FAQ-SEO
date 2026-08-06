// Señales de performance (Core Web Vitals) — sub-dimensión "performance" de
// Readiness. Tipo "external": leen el resultado de PageSpeed ya fetcheado en
// el AuditContext. Prefieren dato de CAMPO (CrUX → field_measured); si no hay,
// usan LABORATORIO (Lighthouse → lab_measured); si no hay ninguno → unavailable.

import type {
  AuditContext,
  Evaluator,
  EvidenceItem,
  MeasurementState,
  SignalDefinition,
  SignalMeasurement,
} from "../types";
import type { CruxCategory } from "../pagespeed";

const SUB = "performance";

const CATEGORY_SCORE: Record<CruxCategory, number> = { FAST: 10, AVERAGE: 5, SLOW: 0 };

function build<Raw>(
  def: SignalDefinition<Raw>,
  state: MeasurementState,
  raw: Raw,
  normalized: number | null,
  evidence: EvidenceItem[]
): SignalMeasurement<Raw> {
  return {
    signalId: def.id,
    signalVersion: def.version,
    topDimension: def.topDimension,
    subDimension: def.subDimension,
    type: def.type,
    state,
    raw,
    normalized,
    confidence: normalized === null ? null : state === "field_measured" ? 1 : 0.7,
    evidence,
  };
}

function root(ctx: AuditContext) {
  return ctx.pagespeed?.[0] ?? null;
}

// Umbral lab → score (good/needs-improvement/poor).
const labScore = (v: number, good: number, poor: number) =>
  v <= good ? 10 : v <= poor ? 5 : 0;

function def(id: string, title: string, description: string): SignalDefinition {
  return {
    id,
    version: 1,
    topDimension: "readiness",
    subDimension: SUB,
    type: "external",
    title,
    description,
    source: ["pagespeed"],
    weight: 1,
    evidenceKeys: ["source", "value", "category"],
  };
}

// --- LCP ---
const lcpDef = def(
  "performance.lcp",
  "LCP (Largest Contentful Paint)",
  "Tiempo de carga del contenido principal. Bueno ≤ 2,5 s."
);
const lcp: Evaluator = {
  definition: lcpDef,
  async measure(ctx) {
    const r = root(ctx);
    if (r?.field?.lcp) {
      const f = r.field.lcp;
      return build(lcpDef, "field_measured", { source: "field", ms: f.p75, category: f.category }, CATEGORY_SCORE[f.category], [
        { key: "source", kind: "flag", value: "CrUX (campo)" },
        { key: "value", kind: "count", value: `${Math.round(f.p75)} ms (p75)` },
        { key: "category", kind: "flag", value: f.category },
      ]);
    }
    if (typeof r?.lab?.lcpMs === "number") {
      const ms = r.lab.lcpMs;
      return build(lcpDef, "lab_measured", { source: "lab", ms }, labScore(ms, 2500, 4000), [
        { key: "source", kind: "flag", value: "Lighthouse (lab)" },
        { key: "value", kind: "count", value: `${Math.round(ms)} ms` },
      ]);
    }
    return build(lcpDef, "unavailable", { source: null }, null, []);
  },
};

// --- INP (solo campo) ---
const inpDef = def(
  "performance.inp",
  "INP (Interaction to Next Paint)",
  "Latencia de interacción. Bueno < 200 ms. Solo dato de campo (CrUX)."
);
const inp: Evaluator = {
  definition: inpDef,
  async measure(ctx) {
    const r = root(ctx);
    if (r?.field?.inp) {
      const f = r.field.inp;
      return build(inpDef, "field_measured", { source: "field", ms: f.p75, category: f.category }, CATEGORY_SCORE[f.category], [
        { key: "source", kind: "flag", value: "CrUX (campo)" },
        { key: "value", kind: "count", value: `${Math.round(f.p75)} ms (p75)` },
        { key: "category", kind: "flag", value: f.category },
      ]);
    }
    // Lighthouse no reporta INP directamente → no medible sin campo.
    return build(inpDef, "unavailable", { source: null }, null, [
      { key: "source", kind: "flag", value: "sin datos de campo" },
    ]);
  },
};

// --- CLS ---
const clsDef = def(
  "performance.cls",
  "CLS (Cumulative Layout Shift)",
  "Estabilidad visual. Bueno ≤ 0,1."
);
const cls: Evaluator = {
  definition: clsDef,
  async measure(ctx) {
    const r = root(ctx);
    if (r?.field?.cls) {
      const f = r.field.cls;
      return build(clsDef, "field_measured", { source: "field", cls: f.p75, category: f.category }, CATEGORY_SCORE[f.category], [
        { key: "source", kind: "flag", value: "CrUX (campo)" },
        { key: "value", kind: "count", value: f.p75.toFixed(3) },
        { key: "category", kind: "flag", value: f.category },
      ]);
    }
    if (typeof r?.lab?.cls === "number") {
      const v = r.lab.cls;
      return build(clsDef, "lab_measured", { source: "lab", cls: v }, labScore(v, 0.1, 0.25), [
        { key: "source", kind: "flag", value: "Lighthouse (lab)" },
        { key: "value", kind: "count", value: v.toFixed(3) },
      ]);
    }
    return build(clsDef, "unavailable", { source: null }, null, []);
  },
};

// --- Lighthouse performance score ---
const lhDef = def(
  "performance.lighthouse_score",
  "Puntaje de performance (Lighthouse)",
  "Score global de performance de laboratorio (0–100)."
);
const lighthouse: Evaluator = {
  definition: lhDef,
  async measure(ctx) {
    const r = root(ctx);
    if (typeof r?.lab?.perfScore === "number") {
      const s = r.lab.perfScore; // 0..1
      return build(lhDef, "lab_measured", { perfScore: s }, Number((s * 10).toFixed(2)), [
        { key: "source", kind: "flag", value: "Lighthouse (lab)" },
        { key: "value", kind: "count", value: `${Math.round(s * 100)}/100` },
      ]);
    }
    return build(lhDef, "unavailable", { perfScore: null }, null, []);
  },
};

export const performanceEvaluators: Evaluator[] = [lcp, inp, cls, lighthouse];
