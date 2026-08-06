// P0 — Contrato de señales (fuente de verdad en Git).
// La base de datos solo REGISTRA mediciones y la versión usada; las reglas y
// definiciones viven acá, versionadas en Git.

import type {
  MeasurementState,
  SignalTypeEnum,
  TopDimension,
} from "@/types/database";

export type { MeasurementState, TopDimension };
export type SignalType = SignalTypeEnum;

/**
 * Definición de una señal: qué mide, en qué dimensión, cómo se puntúa y qué
 * evidencia exige. Vive en código; su `version` se bumpea al cambiar la
 * metodología de esa señal.
 */
export interface SignalDefinition<Raw = unknown> {
  id: string; // "discoverability.sitemap_valid"
  version: number; // se incrementa al cambiar el método/rúbrica
  topDimension: TopDimension;
  subDimension: string; // "discoverability"
  type: SignalType;
  title: string;
  description: string;
  source: string[]; // ["crawler"] | ["pagespeed"] | ...
  weight: number; // peso dentro de la sub-dimensión
  evidenceKeys: string[]; // qué evidencia debe adjuntar la medición
}

export interface EvidenceItem {
  key: string;
  kind: "url" | "http_status" | "count" | "passage" | "flag";
  value: unknown;
  url?: string;
}

/**
 * Resultado de ejecutar una señal. Es lo que se persiste (con su evidencia).
 * `raw` conserva el dato bruto para poder recalcular al cambiar la metodología.
 */
export interface SignalMeasurement<Raw = unknown> {
  signalId: string;
  signalVersion: number;
  topDimension: TopDimension;
  subDimension: string;
  type: SignalType;
  state: MeasurementState;
  raw: Raw;
  normalized: number | null; // 0..10 | null
  confidence: number | null; // 0..1 | null
  model?: string; // solo llm_assisted
  promptVersion?: string; // solo llm_assisted
  error?: string;
  evidence: EvidenceItem[];
}

export interface DimensionScore {
  topDimension: TopDimension;
  subDimension: string | null;
  score: number | null; // null = cobertura insuficiente
  state: MeasurementState;
  coverage: number; // 0..1
  confidence: number | null;
  measuredSignals: number;
  totalSignals: number;
}

/**
 * Contexto de auditoría que reciben los evaluadores. En P0 se arma desde el
 * crawl existente. Se irá enriqueciendo (PageSpeed, etc.) en P1A.
 */
export interface AuditPage {
  id: string;
  url: string;
  title: string | null;
  httpStatus: number | null; // status HTTP capturado (null = no medido)
  canonicalUrl: string | null; // <link rel=canonical> resuelto a absoluto
  metaRobots: string | null; // contenido de <meta name=robots>
  hreflang: { lang: string; href: string }[];
  headings: { tag: string; text: string }[];
  internalLinks: string[]; // links absolutos al mismo host
  metaDescription: string | null; // <meta name=description>
  imgTotal: number; // cantidad de <img> en la página
  imgWithAlt: number; // <img> con alt no vacío
  cleanText: string;
  wordCount: number;
}

export interface SitemapFetch {
  url: string;
  httpStatus: number | null;
  xml: string | null; // contenido crudo (o null si 404/no accesible)
  declaredInRobots: boolean;
}

export interface AuditContext {
  projectId: string;
  rootUrl: string;
  origin: string; // https://host
  pages: AuditPage[];
  robotsTxt: string | null; // contenido crudo de robots.txt (o null si no hay)
  sitemaps: SitemapFetch[]; // candidatos ya fetcheados (robots + /sitemap.xml)
  // Resultados de PageSpeed ya fetcheados por el runner (external, no determinista).
  pagespeed?: import("./pagespeed").PageSpeedResult[];
}

/**
 * Un evaluador determinista implementa `measure`. SIEMPRE devuelve un estado
 * (nunca lanza silenciosamente): errores → state:"failed"; datos ausentes →
 * state:"unavailable".
 */
export interface Evaluator<Raw = unknown> {
  definition: SignalDefinition<Raw>;
  measure(ctx: AuditContext): Promise<SignalMeasurement<Raw>>;
}
