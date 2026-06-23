import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";
import type { SectionType } from "@/types/database";

export const SECTIONS_PROMPT_VERSION = "sections-v1.0.0";

const VALID_TYPES: SectionType[] = [
  "home",
  "about_trust",
  "differentiation",
  "transactional",
  "product",
  "other",
];

const SYSTEM_PROMPT = `Sos un arquitecto de información. A partir de las páginas crawleadas de un sitio (url + título + resumen), detectás las SECCIONES reales del sitio agrupando páginas por estructura de URL, navegación y temática. Cada sitio tiene las suyas; no asumas nada predefinido.

Para cada sección detectada sugerí un "suggested_type" de esta lista genérica (no atada a ningún rubro):
- "home": la página principal / landing general.
- "about_trust": quiénes son, trayectoria, equipo, cómo trabajan, confianza.
- "differentiation": por qué elegirlos, diferenciación, comparativa.
- "transactional": contacto, presupuesto, cómo empezar, cobertura, precios.
- "product": una página de un producto o servicio específico.
- "other": cualquier otra sección relevante.

Reglas:
- Agrupá páginas de portfolio/casos/blog en pocas secciones amplias o marcalas como "other" (no una sección por cada caso).
- Devolvé entre 3 y 12 secciones. Nombres cortos y legibles.
- "urls": las URLs de las páginas que componen la sección (de las provistas).

Devolvé SOLO JSON estricto (sin markdown):
{
  "sections": [
    { "name": "string", "suggested_type": "home|about_trust|differentiation|transactional|product|other", "urls": ["string"] }
  ]
}`;

export interface DetectedSection {
  name: string;
  suggested_type: SectionType;
  urls: string[];
}

interface PageInput {
  url: string;
  title: string | null;
  summary: string;
}

export async function detectSections(input: {
  topicSummary: string | null;
  pages: PageInput[];
}): Promise<DetectedSection[]> {
  const { topicSummary, pages } = input;
  if (pages.length === 0) return [];

  const pageBlock = pages
    .slice(0, 60)
    .map((p) => `- ${p.url} | ${p.title || "(sin título)"}\n  ${p.summary}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Tema del sitio: ${topicSummary || "(no provisto)"}\n\n## Páginas\n${pageBlock}`,
      },
    ],
  });

  const text = extractText(response);
  const parsed = parseLooseJson<{ sections?: DetectedSection[] }>(text);
  return (parsed.sections ?? [])
    .filter((s) => s && typeof s.name === "string" && s.name.trim())
    .map((s) => ({
      name: s.name.trim(),
      suggested_type: VALID_TYPES.includes(s.suggested_type) ? s.suggested_type : "other",
      urls: Array.isArray(s.urls) ? s.urls.filter((u) => typeof u === "string") : [],
    }));
}
