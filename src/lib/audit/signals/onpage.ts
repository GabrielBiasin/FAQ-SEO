// Señales deterministas de la sub-dimensión "onpage" (Readiness).
// Higiene on-page básica: títulos presentes y únicos, un solo H1, meta
// description, y alt en imágenes. Puras sobre AuditContext (sin red, sin LLM).

import type {
  AuditContext,
  Evaluator,
  EvidenceItem,
  SignalDefinition,
  SignalMeasurement,
} from "../types";

const SUB = "onpage";

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
    state: normalized === null ? "unavailable" : "measured",
    raw,
    normalized,
    confidence: normalized === null ? null : 1,
    evidence,
  };
}

function def(id: string, title: string, description: string, evidenceKeys: string[]): SignalDefinition {
  return {
    id,
    version: 1,
    topDimension: "readiness",
    subDimension: SUB,
    type: "deterministic",
    title,
    description,
    source: ["crawler"],
    weight: 1,
    evidenceKeys,
  };
}

const score10 = (n: number, total: number): number =>
  total <= 0 ? 0 : Number(((n / total) * 10).toFixed(2));

// --- 1. Título presente y único ------------------------------------------
const titleDef = def(
  "onpage.title_present_unique",
  "Título presente y único",
  "Cada página tiene <title> no vacío y no duplicado con otras.",
  ["pages", "missing", "duplicated"]
);
const titlePresentUnique: Evaluator = {
  definition: titleDef,
  async measure(ctx: AuditContext) {
    const pages = ctx.pages;
    if (pages.length === 0) return measured(titleDef, { pages: 0 }, null, [{ key: "pages", kind: "count", value: 0 }]);
    const norm = (t: string | null) => (t ?? "").trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const p of pages) {
      const t = norm(p.title);
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const missing = pages.filter((p) => !norm(p.title));
    const duplicated = pages.filter((p) => {
      const t = norm(p.title);
      return t && (counts.get(t) ?? 0) > 1;
    });
    const ok = pages.length - missing.length - duplicated.length;
    return measured(titleDef, { pages: pages.length, missing: missing.length, duplicated: duplicated.length }, score10(ok, pages.length), [
      { key: "pages", kind: "count", value: pages.length },
      { key: "missing", kind: "count", value: missing.length },
      { key: "duplicated", kind: "count", value: duplicated.length },
      ...missing.slice(0, 5).map((p): EvidenceItem => ({ key: "sin_title", kind: "url", value: p.url, url: p.url })),
      ...duplicated.slice(0, 5).map((p): EvidenceItem => ({ key: "title_duplicado", kind: "url", value: p.url, url: p.url })),
    ]);
  },
};

// --- 2. Un solo H1 --------------------------------------------------------
const h1Def = def(
  "onpage.single_h1",
  "Un solo H1 por página",
  "Cada página tiene exactamente un encabezado H1.",
  ["pages", "zero_h1", "multi_h1"]
);
const singleH1: Evaluator = {
  definition: h1Def,
  async measure(ctx: AuditContext) {
    const pages = ctx.pages;
    if (pages.length === 0) return measured(h1Def, { pages: 0 }, null, [{ key: "pages", kind: "count", value: 0 }]);
    const h1count = (p: AuditContext["pages"][number]) =>
      p.headings.filter((h) => h.tag === "h1").length;
    const zero = pages.filter((p) => h1count(p) === 0);
    const multi = pages.filter((p) => h1count(p) > 1);
    const ok = pages.length - zero.length - multi.length;
    return measured(h1Def, { pages: pages.length, zero_h1: zero.length, multi_h1: multi.length }, score10(ok, pages.length), [
      { key: "pages", kind: "count", value: pages.length },
      { key: "zero_h1", kind: "count", value: zero.length },
      { key: "multi_h1", kind: "count", value: multi.length },
      ...zero.slice(0, 5).map((p): EvidenceItem => ({ key: "sin_h1", kind: "url", value: p.url, url: p.url })),
      ...multi.slice(0, 5).map((p): EvidenceItem => ({ key: "multiples_h1", kind: "url", value: p.url, url: p.url })),
    ]);
  },
};

// --- 3. Meta description --------------------------------------------------
const metaDef = def(
  "onpage.meta_description",
  "Meta description presente",
  "Cada página declara <meta name=description> no vacía.",
  ["pages", "missing"]
);
const metaDescription: Evaluator = {
  definition: metaDef,
  async measure(ctx: AuditContext) {
    const pages = ctx.pages;
    if (pages.length === 0) return measured(metaDef, { pages: 0 }, null, [{ key: "pages", kind: "count", value: 0 }]);
    const missing = pages.filter((p) => !(p.metaDescription ?? "").trim());
    const ok = pages.length - missing.length;
    return measured(metaDef, { pages: pages.length, missing: missing.length }, score10(ok, pages.length), [
      { key: "pages", kind: "count", value: pages.length },
      { key: "missing", kind: "count", value: missing.length },
      ...missing.slice(0, 5).map((p): EvidenceItem => ({ key: "sin_description", kind: "url", value: p.url, url: p.url })),
    ]);
  },
};

// --- 4. Alt en imágenes ---------------------------------------------------
const altDef = def(
  "onpage.image_alt",
  "Imágenes con texto alternativo",
  "Proporción de <img> con atributo alt no vacío.",
  ["images", "with_alt", "without_alt"]
);
const imageAlt: Evaluator = {
  definition: altDef,
  async measure(ctx: AuditContext) {
    const total = ctx.pages.reduce((n, p) => n + p.imgTotal, 0);
    const withAlt = ctx.pages.reduce((n, p) => n + p.imgWithAlt, 0);
    if (total === 0) {
      // No hay imágenes → señal no aplica (no ensucia el score).
      return measured(altDef, { images: 0 }, null, [{ key: "images", kind: "count", value: 0 }]);
    }
    return measured(altDef, { images: total, with_alt: withAlt }, score10(withAlt, total), [
      { key: "images", kind: "count", value: total },
      { key: "with_alt", kind: "count", value: withAlt },
      { key: "without_alt", kind: "count", value: total - withAlt },
    ]);
  },
};

export const onpageEvaluators: Evaluator[] = [
  titlePresentUnique,
  singleH1,
  metaDescription,
  imageAlt,
];
