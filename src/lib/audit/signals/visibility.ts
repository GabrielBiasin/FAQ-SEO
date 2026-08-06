// Señales de Visibility (SOV orgánico). Tipo "external": leen los resultados
// SERP ya fetcheados por el runner en ctx.serp. Miden si el dominio del proyecto
// aparece —y en qué posición— para sus queries objetivo. Si SERP no se ejecutó
// (sin SERP_API_KEY) → unavailable (no ensucia el score).

import type {
  AuditContext,
  Evaluator,
  EvidenceItem,
  MeasurementState,
  SignalDefinition,
  SignalMeasurement,
} from "../types";

const SUB = "organic";

function build<Raw>(
  def: SignalDefinition<Raw>,
  state: MeasurementState,
  raw: Raw,
  normalized: number | null,
  evidence: EvidenceItem[],
  confidence: number | null,
  error?: string
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
    confidence,
    evidence,
    error,
  };
}

function def(id: string, title: string, description: string): SignalDefinition {
  return {
    id,
    version: 1,
    topDimension: "visibility",
    subDimension: SUB,
    type: "external",
    title,
    description,
    source: ["serp"],
    weight: 1,
    evidenceKeys: ["queries", "hits", "value"],
  };
}

// ¿El dominio del proyecto matchea el de un resultado (mismo host o subdominio)?
function isOwn(domain: string, hit: string): boolean {
  return hit === domain || hit.endsWith("." + domain);
}

// Mejor posición del dominio dentro de los orgánicos de una query (o null).
function bestPosition(ctx: AuditContext, organic: { position: number; domain: string }[]): number | null {
  const own = organic.filter((o) => isOwn(ctx.domain, o.domain));
  if (own.length === 0) return null;
  return Math.min(...own.map((o) => o.position));
}

function unavailable(ctx: AuditContext): string {
  if (!ctx.serp) return "SERP no ejecutado (sin SERP_API_KEY)";
  if (ctx.serp.length === 0) return "sin queries objetivo";
  if (ctx.serp.every((s) => s.organic.length === 0)) return "SERP sin resultados";
  return "no medible";
}

// --- 1. Cobertura SERP: en cuántas queries aparece el dominio (top 10) ---
const coverageDef = def(
  "visibility.serp_coverage",
  "Presencia orgánica (SOV top 10)",
  "Proporción de queries objetivo donde el dominio aparece en el top 10, ponderada por prioridad."
);
const serpCoverage: Evaluator = {
  definition: coverageDef,
  async measure(ctx) {
    const serp = ctx.serp;
    if (!serp || serp.length === 0 || serp.every((s) => s.organic.length === 0)) {
      const r = unavailable(ctx);
      return build(coverageDef, "unavailable", { present: 0 }, null, [{ key: "queries", kind: "flag", value: r }], null, r);
    }
    let wSum = 0;
    let wPresent = 0;
    let present = 0;
    for (const q of serp) {
      const w = Math.max(q.priority, 0.0001);
      wSum += w;
      if (bestPosition(ctx, q.organic) !== null) {
        wPresent += w;
        present++;
      }
    }
    const norm = wSum > 0 ? Number(((wPresent / wSum) * 10).toFixed(2)) : 0;
    return build(
      coverageDef,
      "measured",
      { present, total: serp.length },
      norm,
      [
        { key: "queries", kind: "count", value: `${present}/${serp.length} queries` },
        { key: "value", kind: "count", value: `${Math.round((present / serp.length) * 100)}% presencia` },
      ],
      0.9
    );
  },
};

// --- 2. Posición promedio cuando aparece ---
const positionDef = def(
  "visibility.serp_avg_position",
  "Posición orgánica promedio",
  "Posición media (ponderada) del dominio cuando rankea. Mejor posición = mayor puntaje."
);
const serpPosition: Evaluator = {
  definition: positionDef,
  async measure(ctx) {
    const serp = ctx.serp;
    if (!serp || serp.length === 0 || serp.every((s) => s.organic.length === 0)) {
      const r = unavailable(ctx);
      return build(positionDef, "unavailable", { avg: null }, null, [{ key: "queries", kind: "flag", value: r }], null, r);
    }
    let wSum = 0;
    let wPos = 0;
    let count = 0;
    for (const q of serp) {
      const pos = bestPosition(ctx, q.organic);
      if (pos === null) continue;
      const w = Math.max(q.priority, 0.0001);
      wSum += w;
      wPos += w * pos;
      count++;
    }
    if (count === 0) {
      // SERP corrió pero el dominio no aparece en ninguna → señal medida, peor puntaje.
      return build(
        positionDef,
        "measured",
        { avg: null, present: 0 },
        0,
        [{ key: "value", kind: "flag", value: "no aparece en ninguna query" }],
        0.9
      );
    }
    const avg = wPos / wSum;
    // pos1→10, pos10→1 (lineal, mínimo 0).
    const norm = Number(Math.max(0, 11 - avg).toFixed(2));
    return build(
      positionDef,
      "measured",
      { avg: Number(avg.toFixed(2)), present: count },
      Math.min(norm, 10),
      [{ key: "value", kind: "count", value: `posición media ${avg.toFixed(1)} (${count} queries)` }],
      0.9
    );
  },
};

export const visibilityEvaluators: Evaluator[] = [serpCoverage, serpPosition];
