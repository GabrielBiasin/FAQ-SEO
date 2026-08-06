// Motor de recomendaciones (determinista).
//
// Traduce los GAPS detectados —señales con puntaje bajo + queries sin cubrir—
// en acciones priorizadas y accionables. No usa LLM: cada recomendación sale
// de una regla explícita ligada a una señal o a la matriz de cobertura, con la
// evidencia concreta (URLs) para que el equipo sepa exactamente qué tocar.

import type { CoverageSummary } from "./coverage";

export type Severity = "high" | "medium" | "low";

export interface RecoMeasurement {
  signalId: string;
  normalized: number | null;
  state: string;
  evidence: { key: string; value: unknown; url: string | null }[];
}

export interface Recommendation {
  id: string; // estable por señal/gap
  title: string; // acción, en imperativo
  detail: string; // por qué / cómo
  area: string; // discoverability | onpage | performance | coverage
  severity: Severity;
  score: number | null; // puntaje actual de la señal (si aplica)
  impact: number; // 0..100 para ordenar (mayor = antes)
  urls: string[]; // páginas afectadas (evidencia)
}

// Plantilla por señal: cómo redactar la recomendación cuando esa señal falla.
const SIGNAL_TEMPLATE: Record<string, { title: string; detail: string; area: string }> = {
  "discoverability.sitemap_valid": {
    title: "Publicar un sitemap XML válido y declararlo en robots.txt",
    detail: "Sin sitemap consistente los motores tardan más en descubrir e indexar el contenido.",
    area: "discoverability",
  },
  "discoverability.robots_allows_crawl": {
    title: "Revisar robots.txt: está bloqueando el rastreo",
    detail: "Reglas Disallow demasiado amplias impiden que se indexe el sitio. Restringí solo lo necesario.",
    area: "discoverability",
  },
  "discoverability.canonical_consistent": {
    title: "Corregir canonicals inconsistentes",
    detail: "Canonicals a otro host o contradictorios diluyen señales y confunden la indexación.",
    area: "discoverability",
  },
  "discoverability.meta_robots_indexable": {
    title: "Quitar noindex de páginas que deberían indexarse",
    detail: "Hay páginas marcadas noindex que restan visibilidad orgánica y generativa.",
    area: "discoverability",
  },
  "discoverability.http_health": {
    title: "Resolver páginas con errores HTTP (4xx/5xx)",
    detail: "Los errores de servidor/no encontrado desperdician presupuesto de rastreo y pierden tráfico.",
    area: "discoverability",
  },
  "discoverability.orphans_click_depth": {
    title: "Enlazar internamente las páginas huérfanas",
    detail: "Páginas sin enlaces entrantes o muy profundas casi no se rastrean ni se citan.",
    area: "discoverability",
  },
  "discoverability.hreflang_valid": {
    title: "Corregir la implementación de hreflang",
    detail: "hreflang inválido o incompleto rompe el targeting por idioma/región.",
    area: "discoverability",
  },
  "performance.lcp": {
    title: "Mejorar el LCP (carga del contenido principal)",
    detail: "Optimizá imagen/hero, servidor y render para bajar el LCP por debajo de 2,5 s.",
    area: "performance",
  },
  "performance.inp": {
    title: "Reducir la latencia de interacción (INP)",
    detail: "Aligerá el JavaScript del hilo principal para respuestas por debajo de 200 ms.",
    area: "performance",
  },
  "performance.cls": {
    title: "Estabilizar el layout (bajar el CLS)",
    detail: "Reservá espacio para imágenes/anuncios y evitá inserciones que muevan el contenido.",
    area: "performance",
  },
  "performance.lighthouse_score": {
    title: "Subir el puntaje de performance (Lighthouse)",
    detail: "Performance general baja: comprimí assets, diferí scripts y usá caché/CDN.",
    area: "performance",
  },
  "onpage.title_present_unique": {
    title: "Completar títulos faltantes y desduplicar los repetidos",
    detail: "Cada página necesita un <title> único y descriptivo con su término objetivo.",
    area: "onpage",
  },
  "onpage.single_h1": {
    title: "Usar un único H1 por página",
    detail: "Páginas sin H1 o con varios diluyen la jerarquía semántica que leen los motores.",
    area: "onpage",
  },
  "onpage.meta_description": {
    title: "Agregar meta descriptions faltantes",
    detail: "La meta description mejora el CTR y da contexto a motores y respuestas generativas.",
    area: "onpage",
  },
  "onpage.image_alt": {
    title: "Agregar texto alternativo a las imágenes",
    detail: "El alt mejora accesibilidad, SEO de imágenes y comprensión del contenido.",
    area: "onpage",
  },
  "authority.content_depth": {
    title: "Profundizar el contenido de las páginas clave",
    detail: "Poca proporción de contenido sustancial (≥600 palabras). El contenido en profundidad genera autoridad temática y más citas.",
    area: "authority",
  },
  "authority.internal_linking": {
    title: "Reforzar el enlazado interno",
    detail: "Baja densidad de enlaces internos. Enlazá entre páginas relacionadas para distribuir autoridad y facilitar el rastreo.",
    area: "authority",
  },
  "visibility.serp_coverage": {
    title: "Ganar presencia orgánica en queries objetivo",
    detail: "El dominio no aparece en el top 10 para buena parte de tus queries. Priorizá contenido + on-page para esas búsquedas.",
    area: "visibility",
  },
  "visibility.serp_avg_position": {
    title: "Mejorar el ranking orgánico donde ya aparecés",
    detail: "Aparecés pero en posiciones bajas. Reforzá esas páginas (contenido, enlazado, intención) para subir posiciones.",
    area: "visibility",
  },
};

function severityFromScore(score: number): Severity {
  if (score < 3) return "high";
  if (score < 6) return "medium";
  return "low";
}

// Extrae URLs de la evidencia de una medición (para "páginas afectadas").
function evidenceUrls(m: RecoMeasurement, max = 8): string[] {
  const urls = m.evidence.map((e) => e.url).filter((u): u is string => Boolean(u));
  return Array.from(new Set(urls)).slice(0, max);
}

const SIGNAL_GAP_MAX = 6; // señales por debajo de esto generan recomendación

export function buildRecommendations(input: {
  measurements: RecoMeasurement[];
  coverage: CoverageSummary | null;
}): Recommendation[] {
  const recs: Recommendation[] = [];

  // 1. Gaps de señales medidas con puntaje bajo.
  for (const m of input.measurements) {
    if (m.normalized === null || m.normalized >= SIGNAL_GAP_MAX) continue;
    const tpl = SIGNAL_TEMPLATE[m.signalId];
    if (!tpl) continue;
    const severity = severityFromScore(m.normalized);
    recs.push({
      id: `signal:${m.signalId}`,
      title: tpl.title,
      detail: tpl.detail,
      area: tpl.area,
      severity,
      score: m.normalized,
      // Impacto: cuanto más bajo el score, mayor la oportunidad.
      impact: Math.round((10 - m.normalized) * 10),
      urls: evidenceUrls(m),
    });
  }

  // 2. Gaps de cobertura de demanda: queries de alta prioridad sin responder.
  if (input.coverage) {
    const missing = input.coverage.rows.filter((r) => r.status === "missing");
    const partial = input.coverage.rows.filter((r) => r.status === "partial");
    if (missing.length > 0) {
      const top = [...missing].sort((a, b) => b.priority - a.priority);
      const maxPrio = top[0]?.priority ?? 1;
      recs.push({
        id: "coverage:missing",
        title: `Crear contenido para ${missing.length} queries sin cubrir`,
        detail:
          "Hay demanda objetivo que ninguna página responde. Priorizá landings/artículos/FAQs para: " +
          top.slice(0, 6).map((r) => `“${r.text}”`).join(", ") +
          (missing.length > 6 ? "…" : "."),
        area: "coverage",
        severity: maxPrio >= 4 ? "high" : "medium",
        score: null,
        impact: 60 + Math.min(missing.length, 20) + Math.round(maxPrio),
        urls: [],
      });
    }
    if (partial.length > 0) {
      recs.push({
        id: "coverage:partial",
        title: `Reforzar ${partial.length} queries cubiertas solo parcialmente`,
        detail:
          "Estas queries se tocan en el cuerpo pero ninguna página las trata como tema central. " +
          "Dedicá encabezados (H1/H2) explícitos para volverlas answerable: " +
          partial.slice(0, 6).map((r) => `“${r.text}”`).join(", ") +
          (partial.length > 6 ? "…" : "."),
        area: "coverage",
        severity: "medium",
        score: null,
        impact: 40 + Math.min(partial.length, 15),
        urls: [],
      });
    }
  }

  // Orden: severidad primero, luego impacto.
  const sevRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => {
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
    return b.impact - a.impact;
  });
}
