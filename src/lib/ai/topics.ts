import { anthropic, PRIMARY_MODEL, extractText, parseJsonResponse } from "@/lib/claude";

// Versioned prompt — bump on any change so evals stay attributable.
export const TOPICS_PROMPT_VERSION = "topics-v1.0.0";

const SYSTEM_PROMPT = `Sos un analista de contenido para SEO/AEO. Te paso el contenido crawleado del sitio de un cliente y tenés que entender DE QUÉ TRATA antes de cualquier otra cosa.

Tu tarea:
1. Producir un "topic_summary": un párrafo conciso (máx. 120 palabras) que describa qué servicio/producto/categoría ofrece el sitio, a quién apunta y cuál es su propuesta. Basate SOLO en el contenido provisto, no inventes.
2. Identificar "topics": los clústeres temáticos principales del sitio. Cada clúster agrupa contenido relacionado que después servirá para generar FAQs. Asigná una prioridad (entero, mayor = más importante para el negocio, típicamente 0–100) según cuánto contenido lo respalda y su relevancia comercial.

Reglas:
- Fundá todo en el contenido real. Si algo no está, no lo afirmes.
- Entre 3 y 10 topics. Nombres cortos y específicos (no genéricos como "Servicios").
- Cada topic con un "summary" de 1–2 oraciones de qué cubre.

Devolvé JSON ESTRICTO, sin markdown, sin backticks, sin texto adicional, con esta forma exacta:
{
  "topic_summary": "string",
  "topics": [
    { "name": "string", "summary": "string", "priority": number }
  ]
}`;

export interface TopicAnalysis {
  topic_summary: string;
  topics: { name: string; summary: string; priority: number }[];
}

interface PageInput {
  url: string;
  title: string | null;
  cleanText: string;
}

/**
 * Build a bounded content digest so we stay within context limits even for
 * large crawls: cap per-page text and total pages.
 */
function buildDigest(pages: PageInput[], maxPages = 40, perPageChars = 2000): string {
  return pages
    .slice(0, maxPages)
    .map((p, i) => {
      const body = p.cleanText.slice(0, perPageChars);
      return `### Página ${i + 1}: ${p.title || "(sin título)"}\nURL: ${p.url}\n${body}`;
    })
    .join("\n\n");
}

export async function analyzeTopics(pages: PageInput[]): Promise<TopicAnalysis> {
  if (pages.length === 0) {
    throw new Error("analyzeTopics: no hay páginas para analizar");
  }
  const digest = buildDigest(pages);

  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Contenido crawleado del sitio (${pages.length} páginas):\n\n${digest}`,
      },
    ],
  });

  const text = extractText(response);
  const parsed = parseJsonResponse<TopicAnalysis>(text);

  // Defensive validation — never trust the shape blindly.
  if (!parsed.topic_summary || !Array.isArray(parsed.topics)) {
    throw new Error("analyzeTopics: respuesta con forma inválida");
  }
  parsed.topics = parsed.topics
    .filter((t) => t && typeof t.name === "string" && t.name.trim())
    .map((t) => ({
      name: t.name.trim(),
      summary: typeof t.summary === "string" ? t.summary.trim() : "",
      priority: Number.isFinite(t.priority) ? Math.round(t.priority) : 0,
    }));

  return parsed;
}
