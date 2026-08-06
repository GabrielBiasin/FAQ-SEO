// Señales PROXY de Authority. La autoridad real se mide con backlinks/menciones
// (APIs pagas tipo Ahrefs/Majestic). Sin esos datos, usamos proxies on-site
// deterministas —profundidad de contenido y densidad de enlazado interno— con
// CONFIANZA BAJA (0.5) para no sobrevender la señal. Se reemplazan por señales
// reales cuando se conecte una API de backlinks.

import type {
  AuditContext,
  Evaluator,
  EvidenceItem,
  SignalDefinition,
  SignalMeasurement,
} from "../types";

const SUB = "onsite_proxy";
const PROXY_CONFIDENCE = 0.5;

function measured<Raw>(
  def: SignalDefinition<Raw>,
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
    state: normalized === null ? "unavailable" : "estimated", // proxy → estimated, no "measured"
    raw,
    normalized,
    confidence: normalized === null ? null : PROXY_CONFIDENCE,
    evidence,
  };
}

function def(id: string, title: string, description: string): SignalDefinition {
  return {
    id,
    version: 1,
    topDimension: "authority",
    subDimension: SUB,
    type: "deterministic",
    title,
    description,
    source: ["crawler"],
    weight: 1,
    evidenceKeys: ["pages", "value"],
  };
}

// --- 1. Profundidad de contenido (proxy) ---
const depthDef = def(
  "authority.content_depth",
  "Profundidad de contenido (proxy)",
  "Proporción de páginas con contenido sustancial (≥600 palabras). Proxy de autoridad temática."
);
const contentDepth: Evaluator = {
  definition: depthDef,
  async measure(ctx: AuditContext) {
    const pages = ctx.pages;
    if (pages.length === 0) return measured(depthDef, { pages: 0 }, null, [{ key: "pages", kind: "count", value: 0 }]);
    const substantial = pages.filter((p) => p.wordCount >= 600).length;
    const norm = Number(((substantial / pages.length) * 10).toFixed(2));
    return measured(depthDef, { pages: pages.length, substantial }, norm, [
      { key: "pages", kind: "count", value: pages.length },
      { key: "value", kind: "count", value: `${substantial} con ≥600 palabras` },
    ]);
  },
};

// --- 2. Densidad de enlazado interno (proxy) ---
const linkDef = def(
  "authority.internal_linking",
  "Enlazado interno (proxy)",
  "Promedio de enlaces internos por página. Distribuye link equity; proxy de arquitectura de autoridad."
);
const internalLinking: Evaluator = {
  definition: linkDef,
  async measure(ctx: AuditContext) {
    const pages = ctx.pages;
    if (pages.length === 0) return measured(linkDef, { pages: 0 }, null, [{ key: "pages", kind: "count", value: 0 }]);
    const totalLinks = pages.reduce((n, p) => n + p.internalLinks.length, 0);
    const avg = totalLinks / pages.length;
    // ~15 enlaces/página se considera bien enlazado → 10.
    const norm = Number(Math.min((avg / 15) * 10, 10).toFixed(2));
    return measured(linkDef, { pages: pages.length, avg: Number(avg.toFixed(1)) }, norm, [
      { key: "pages", kind: "count", value: pages.length },
      { key: "value", kind: "count", value: `${avg.toFixed(1)} enlaces internos/página` },
    ]);
  },
};

export const authorityEvaluators: Evaluator[] = [contentDepth, internalLinking];
