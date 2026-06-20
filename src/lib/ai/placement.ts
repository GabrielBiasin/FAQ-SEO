import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";

export const PLACEMENT_PROMPT_VERSION = "placement-v1.1.0";

const SYSTEM_PROMPT = `Sos un estratega de arquitectura de contenido AEO. Recibís (a) las páginas reales del sitio de un cliente (cada una con id, url, título y un resumen), y (b) un set de preguntas/FAQ. Tu tarea es decidir EN QUÉ SECCIÓN O PÁGINA del sitio debería incorporarse cada FAQ.

Criterios:
- SECCIONES RELEVANTES = solo: la Home, la página de Contacto, y cada página de SERVICIO o PRODUCTO. NADA MÁS.
- NO uses como sección las páginas de casos/proyectos/portfolio/blog/"nuestro trabajo"/equipo/nosotros: esas NO llevan FAQ propio. Las preguntas que se relacionen con un caso de portfolio van a la página de SERVICIO más relacionada (ej. una pregunta sobre un rebranding industrial va a "Servicio: Branding"), o a la Home si es general.
- Ignorá páginas utilitarias (privacidad, términos, 404).
- Asigná cada pregunta a la sección relevante MÁS adecuada por intención y tema. FAQ definicional general → Home; sobre un servicio/producto → esa página; transaccional o "cómo contratar/contactar/presupuesto" → Contacto.
- OBJETIVO DE DISTRIBUCIÓN (importante): CADA sección que devuelvas debe terminar con entre 5 y 10 FAQs. Consolidá agresivamente: si una sección quedaría con menos de 5, fusioná esas preguntas en el servicio relacionado o en la Home hasta llegar a 5+. Si una quedaría con más de 10, dejá las 10 más valiosas y movés el resto a otra sección relevante o a la Home. No devuelvas secciones de 1–4 preguntas.
- Usá "placement_page_id" = el id de la página destino cuando esa sección tenga una página crawleada. Para "Contacto" sin página propia, dejá placement_page_id: null.
- "section": etiqueta corta y legible (ej. "Home", "Contacto", "Servicio: Brand Strategy", "Producto: Packaging").

Devolvé SOLO JSON estricto (sin markdown, sin texto extra):
{
  "placements": [
    { "question_id": "string", "placement_page_id": "string|null", "section": "string" }
  ]
}`;

export interface Placement {
  question_id: string;
  placement_page_id: string | null;
  section: string;
}

interface QuestionInput {
  id: string;
  text: string;
  tier: string;
  intent: string;
}
interface PageInput {
  id: string;
  url: string;
  title: string | null;
  summary: string;
}

export async function assignPlacements(input: {
  questions: QuestionInput[];
  pages: PageInput[];
}): Promise<Placement[]> {
  const { questions, pages } = input;
  if (questions.length === 0) return [];

  const pageBlock = pages
    .map((p) => `- id=${p.id} | ${p.title || "(sin título)"} | ${p.url}\n  ${p.summary}`)
    .join("\n");
  const qBlock = questions
    .map((q) => `- id=${q.id} [${q.tier}/${q.intent}] ${q.text}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Páginas del sitio (secciones candidatas)\n${pageBlock}\n\n## Preguntas a ubicar\n${qBlock}`,
      },
    ],
  });

  const text = extractText(response);
  const validPageIds = new Set(pages.map((p) => p.id));
  const validQIds = new Set(questions.map((q) => q.id));

  let raw: Placement[];
  try {
    raw = parseLooseJson<{ placements?: Placement[] }>(text).placements ?? [];
  } catch {
    raw = salvagePlacements(text);
  }

  return raw
    .filter((p) => p && typeof p.question_id === "string" && validQIds.has(p.question_id))
    .map((p) => ({
      question_id: p.question_id,
      placement_page_id:
        p.placement_page_id && validPageIds.has(p.placement_page_id)
          ? p.placement_page_id
          : null,
      section: typeof p.section === "string" && p.section.trim() ? p.section.trim() : "Home",
    }));
}

/** Salvage complete placement objects from a truncated array. */
function salvagePlacements(text: string): Placement[] {
  const start = text.indexOf("[");
  if (start === -1) return [];
  const out: Placement[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          out.push(JSON.parse(text.slice(objStart, i + 1)) as Placement);
        } catch {
          /* skip */
        }
        objStart = -1;
      }
    }
  }
  return out;
}
