// Matriz de cobertura de demanda (determinista, sin LLM).
//
// Cruza la DEMANDA (preguntas/queries objetivo ya generadas) contra la OFERTA
// (páginas crawleadas). Para cada query determina si el sitio tiene una página
// que la responde y con qué fuerza:
//   - "covered": los términos clave aparecen en título/encabezados de una página
//     (la página es *sobre* esa query → responde de forma directa/answerable).
//   - "partial": los términos aparecen solo en el cuerpo (se toca, pero no es el
//     foco de ninguna página).
//   - "missing": la query no está cubierta.
//
// El objetivo GEO es que las queries de alto valor tengan páginas que las
// respondan de forma explícita (títulos/H2/H3), que es lo que citan los motores.

export interface DemandItem {
  id: string;
  text: string;
  priority: number; // peso relativo (prioridad de la query)
  intent?: string | null;
  topic?: string | null;
}

export interface OfferPage {
  id: string;
  url: string;
  title: string | null;
  headings: { tag: string; text: string }[];
  cleanText: string;
}

export type CoverageStatus = "covered" | "partial" | "missing";

export interface CoverageRow {
  demandId: string;
  text: string;
  priority: number;
  intent: string | null;
  topic: string | null;
  status: CoverageStatus;
  headingOverlap: number; // 0..1 (título + encabezados)
  bodyOverlap: number; // 0..1 (cuerpo)
  bestPageId: string | null;
  bestPageUrl: string | null;
}

export interface CoverageSummary {
  total: number;
  covered: number;
  partial: number;
  missing: number;
  coverageRate: number; // covered / total (0..1)
  weightedCoverageRate: number; // ponderado por priority
  score: number | null; // 0..10 (weighted*10), null si no hay demanda
  rows: CoverageRow[];
}

// Umbrales de solapamiento.
const HEADING_COVERED = 0.6; // la página es *sobre* la query → covered
const HEADING_PARTIAL = 0.3;
const BODY_PARTIAL = 0.5; // la query se toca en el cuerpo → partial

const STOPWORDS = new Set([
  // ES
  "el","la","los","las","un","una","unos","unas","de","del","al","a","y","o","u","e","que","como","cual","cuales",
  "es","son","para","por","con","sin","su","sus","se","lo","mi","tu","en","the","of","and","or","to","for","is",
  "are","how","what","which","do","does","can","cuánto","cuanto","cuánta","cuanta","cómo","como","qué","que","dónde",
  "donde","cuándo","cuando","cuál","cuál","por","qué","mejor","más","mas","muy","hay","tiene","tienen","puede","pueden",
  // verbos/auxiliares genéricos que diluyen la query
  "puedo","hacer","hacen","haces","tienes","tengo","quiero","necesito","dar","dan","ser","estar","tener","hace",
]);

// Stemmer ES muy liviano: colapsa plurales para que envío/envíos y
// devolución/devoluciones matcheen. No pretende ser lingüísticamente exacto.
function stem(t: string): string {
  if (t.length > 5 && t.endsWith("es")) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

// Normaliza: minúsculas, sin acentos, tokens de contenido (>=3 chars, sin stopwords, con stem).
export function tokenize(text: string): Set<string> {
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9áéíóúñ\s]/gi, " ");
  const out = new Set<string>();
  for (const raw of norm.split(/\s+/)) {
    if (raw.length >= 3 && !STOPWORDS.has(raw)) out.add(stem(raw));
  }
  return out;
}

// Proporción de tokens de la query presentes en el conjunto de la página.
function overlap(queryTokens: Set<string>, pageTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;
  let hit = 0;
  for (const t of queryTokens) if (pageTokens.has(t)) hit++;
  return hit / queryTokens.size;
}

interface PageTokens {
  page: OfferPage;
  heading: Set<string>;
  body: Set<string>;
}

function prepPages(pages: OfferPage[]): PageTokens[] {
  return pages.map((page) => ({
    page,
    heading: tokenize([page.title ?? "", ...page.headings.map((h) => h.text)].join(" ")),
    body: tokenize(page.cleanText),
  }));
}

export function computeDemandCoverage(
  demand: DemandItem[],
  pages: OfferPage[]
): CoverageSummary {
  const prepped = prepPages(pages);
  const rows: CoverageRow[] = demand.map((d) => {
    const qt = tokenize(d.text);
    let bestHeading = 0;
    let bestBody = 0;
    let bestHeadingPage: OfferPage | null = null;
    let bestBodyPage: OfferPage | null = null;
    for (const p of prepped) {
      const ho = overlap(qt, p.heading);
      const bo = overlap(qt, p.body);
      if (ho > bestHeading) { bestHeading = ho; bestHeadingPage = p.page; }
      if (bo > bestBody) { bestBody = bo; bestBodyPage = p.page; }
    }
    let status: CoverageStatus;
    let bestPage: OfferPage | null;
    if (bestHeading >= HEADING_COVERED) { status = "covered"; bestPage = bestHeadingPage; }
    else if (bestBody >= BODY_PARTIAL || bestHeading >= HEADING_PARTIAL) {
      status = "partial";
      bestPage = bestBody >= BODY_PARTIAL ? bestBodyPage : bestHeadingPage;
    } else { status = "missing"; bestPage = bestBodyPage ?? bestHeadingPage; }
    return {
      demandId: d.id,
      text: d.text,
      priority: d.priority,
      intent: d.intent ?? null,
      topic: d.topic ?? null,
      status,
      headingOverlap: Number(bestHeading.toFixed(2)),
      bodyOverlap: Number(bestBody.toFixed(2)),
      bestPageId: bestPage?.id ?? null,
      bestPageUrl: bestPage?.url ?? null,
    };
  });

  const total = rows.length;
  const covered = rows.filter((r) => r.status === "covered").length;
  const partial = rows.filter((r) => r.status === "partial").length;
  const missing = rows.filter((r) => r.status === "missing").length;

  // Peso por query: covered=1, partial=0.5, missing=0.
  const credit = (s: CoverageStatus) => (s === "covered" ? 1 : s === "partial" ? 0.5 : 0);
  const weightSum = rows.reduce((a, r) => a + Math.max(r.priority, 0.0001), 0);
  const weighted = rows.reduce((a, r) => a + Math.max(r.priority, 0.0001) * credit(r.status), 0);
  const weightedCoverageRate = weightSum > 0 ? weighted / weightSum : 0;

  return {
    total,
    covered,
    partial,
    missing,
    coverageRate: total > 0 ? Number((covered / total).toFixed(3)) : 0,
    weightedCoverageRate: Number(weightedCoverageRate.toFixed(3)),
    score: total > 0 ? Number((weightedCoverageRate * 10).toFixed(2)) : null,
    // Orden: primero lo no cubierto de mayor prioridad (accionable arriba).
    rows: rows.sort((a, b) => {
      const rank = { missing: 0, partial: 1, covered: 2 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return b.priority - a.priority;
    }),
  };
}
