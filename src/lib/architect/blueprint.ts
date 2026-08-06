// Arquitecto de sitio: genera una estructura ideal (segmentos → páginas →
// jerarquía H1/H2/H3) a partir de la demanda priorizada, los gaps de cobertura
// y la estructura observada en competidores. Emite además un brief en Markdown
// para que una IA de diseño (Claude/Stitch/Figma) arme las maquetas.

import { llmComplete, parseLooseJson, PROMPT_VERSION, PROVIDER } from "@/lib/llm";

export type PageType = "home" | "landing" | "category" | "article" | "faq_hub";

export interface BlueprintPage {
  type: PageType;
  title: string;
  url_slug: string;
  h1: string;
  intent: string;
  target_queries: string[];
  outline: { h2: string; h3?: string[] }[];
  covers_demand?: string[];
}
export interface BlueprintSegment {
  name: string;
  rationale: string;
  pages: BlueprintPage[];
}
export interface Blueprint {
  segments: BlueprintSegment[];
  notes?: string;
}

export interface BlueprintInput {
  brandName: string;
  rootUrl: string;
  topicSummary: string | null;
  voiceGuide: string | null;
  demand: { text: string; priority: number; intent?: string | null; coverage?: string }[];
  competitorTitles: string[]; // títulos/H1 observados en competidores (patrones de mercado)
}

const SYSTEM = `Sos un arquitecto de información y estratega SEO/GEO senior.
Diseñás la estructura IDEAL de un sitio de marca para maximizar visibilidad orgánica y en motores generativos (AEO/GEO).
Trabajás sobre la demanda real (queries priorizadas), los huecos de cobertura y los patrones de la competencia.
Devolvés EXCLUSIVAMENTE JSON válido con este esquema:
{
  "segments": [
    {
      "name": "string (segmento/sección del sitio)",
      "rationale": "string (por qué existe, a qué demanda responde)",
      "pages": [
        {
          "type": "home|landing|category|article|faq_hub",
          "title": "string (title SEO)",
          "url_slug": "string (kebab-case, sin dominio)",
          "h1": "string",
          "intent": "definitional|process|comparative|transactional|product|informational",
          "target_queries": ["query 1", "query 2"],
          "outline": [ { "h2": "string", "h3": ["opcional", "..."] } ],
          "covers_demand": ["texto de la query de demanda que responde"]
        }
      ]
    }
  ],
  "notes": "string (recomendaciones globales de arquitectura)"
}
Reglas: priorizá cubrir las queries 'missing' y reforzar las 'partial'. Cada página con un único H1 claro y answerable. 4–8 segmentos, con las páginas necesarias (no inventes relleno). Español.`;

function buildUserPrompt(input: BlueprintInput): string {
  const demandLines = input.demand
    .slice(0, 40)
    .map((d) => `- (${d.coverage ?? "?"}, prio ${d.priority}) ${d.text}`)
    .join("\n");
  const comp = Array.from(new Set(input.competitorTitles)).slice(0, 40).map((t) => `- ${t}`).join("\n");
  return `MARCA: ${input.brandName} (${input.rootUrl})
RESUMEN TEMÁTICO: ${input.topicSummary ?? "—"}
GUÍA DE VOZ: ${input.voiceGuide ?? "—"}

DEMANDA OBJETIVO (estado de cobertura actual, prioridad):
${demandLines || "—"}

PATRONES DE ESTRUCTURA EN COMPETIDORES (títulos/encabezados observados):
${comp || "—"}

Diseñá la arquitectura ideal del sitio siguiendo el esquema JSON. Priorizá cerrar los gaps de cobertura ('missing'/'partial').`;
}

/** Genera el blueprint vía LLM. Lanza si el JSON no parsea. */
export async function generateBlueprint(
  input: BlueprintInput
): Promise<{ blueprint: Blueprint; model: string; promptVersion: string }> {
  const raw = await llmComplete({
    system: SYSTEM,
    user: buildUserPrompt(input),
    json: true,
    maxTokens: 6000,
  });
  const blueprint = parseLooseJson<Blueprint>(raw);
  if (!blueprint || !Array.isArray(blueprint.segments)) {
    throw new Error("build_blueprint: respuesta LLM sin 'segments' válido");
  }
  return { blueprint, model: PROVIDER, promptVersion: PROMPT_VERSION };
}

/** Render determinista del brief en Markdown para IAs de diseño. */
export function renderDesignPrompt(input: BlueprintInput, bp: Blueprint): string {
  const lines: string[] = [];
  lines.push(`# Brief de wireframes — ${input.brandName}`);
  lines.push("");
  lines.push(
    `Generá maquetas esquemáticas (wireframes de baja fidelidad) para el sitio de **${input.brandName}** (${input.rootUrl}). ` +
      `Objetivo: máxima claridad para SEO/GEO. Cada página con un único H1 answerable y jerarquía H2/H3 explícita.`
  );
  if (bp.notes) {
    lines.push("");
    lines.push(`**Notas de arquitectura:** ${bp.notes}`);
  }
  lines.push("");
  lines.push("## Mapa del sitio");
  for (const seg of bp.segments) {
    lines.push("");
    lines.push(`### ${seg.name}`);
    if (seg.rationale) lines.push(`_${seg.rationale}_`);
    for (const p of seg.pages) {
      lines.push("");
      lines.push(`#### [${p.type}] ${p.title}`);
      lines.push(`- **URL:** \`/${p.url_slug.replace(/^\//, "")}\``);
      lines.push(`- **H1:** ${p.h1}`);
      lines.push(`- **Intención:** ${p.intent}`);
      if (p.target_queries?.length) lines.push(`- **Queries objetivo:** ${p.target_queries.join("; ")}`);
      if (p.outline?.length) {
        lines.push(`- **Estructura (secciones):**`);
        for (const o of p.outline) {
          lines.push(`  - H2: ${o.h2}`);
          for (const h3 of o.h3 ?? []) lines.push(`    - H3: ${h3}`);
        }
      }
    }
  }
  lines.push("");
  lines.push("## Requisitos de wireframe");
  lines.push("- Layout responsive (mobile-first). Un H1 por página.");
  lines.push("- Bloques por cada H2 con jerarquía visual clara y CTA primario donde aplique.");
  lines.push("- Zonas para FAQ (acordeón) en páginas tipo `faq_hub`.");
  lines.push("- Breadcrumbs y enlazado interno entre páginas del mismo segmento.");
  return lines.join("\n");
}
