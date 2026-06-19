import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";

export const ANSWERS_PROMPT_VERSION = "answers-v1.0.0";

const SYSTEM_PROMPT = `Sos un redactor experto en AEO (Answer Engine Optimization). Generás respuestas de FAQ que los motores generativos (ChatGPT, Claude, Perplexity, Gemini) puedan citar.

Te paso UNA pregunta y un conjunto de páginas fuente (con su id, url y contenido). Tenés que responder fundándote EXCLUSIVAMENTE en ese contenido.

REGLAS DE LA RESPUESTA (todas obligatorias):
1. ANSWER-FIRST: la primera oración responde directamente la pregunta. Sin rodeos, sin "En esta página…".
2. AUTO-CONTENIDA: se entiende fuera de contexto, porque el motor la extrae sola. No uses "como se mencionó antes" ni referencias a "este sitio".
3. RICA EN ENTIDADES: usá datos, números, unidades, nombres concretos que estén en el contenido fuente.
4. LARGO CALIBRADO: completa pero sin relleno. Normalmente 2–5 oraciones.
5. GROUNDING ESTRICTO: NO inventes. Si el contenido no alcanza para responder bien, devolvé la mejor respuesta parcial posible y marcá "grounded": false.
6. Respetá la guía de voz si se provee.

Elegí la página que MEJOR respalda la respuesta y devolvé su id en "source_page_id".

Devolvé SOLO JSON estricto (sin markdown, sin texto extra):
{
  "answer_text": "string",
  "source_page_id": "string (id de la página usada) | null",
  "grounded": boolean
}`;

export interface GeneratedAnswer {
  answer_text: string;
  source_page_id: string | null;
  grounded: boolean;
}

export interface SourcePage {
  id: string;
  url: string;
  title: string | null;
  cleanText: string;
}

export async function generateAnswer(input: {
  question: string;
  pages: SourcePage[];
  voiceGuide?: string | null;
}): Promise<GeneratedAnswer> {
  const { question, pages, voiceGuide } = input;
  if (pages.length === 0) {
    return { answer_text: "", source_page_id: null, grounded: false };
  }

  const sourceBlock = pages
    .map(
      (p) =>
        `--- PÁGINA id=${p.id} ---\nURL: ${p.url}\nTítulo: ${p.title || "(sin título)"}\n${p.cleanText.slice(0, 3500)}`
    )
    .join("\n\n");

  const voiceBlock = voiceGuide
    ? `\n\n## Guía de voz / tono\n${voiceGuide}`
    : "";

  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Pregunta\n${question}\n\n## Páginas fuente\n${sourceBlock}${voiceBlock}`,
      },
    ],
  });

  const text = extractText(response);
  const parsed = parseLooseJson<GeneratedAnswer>(text);
  const validId = pages.some((p) => p.id === parsed.source_page_id)
    ? parsed.source_page_id
    : pages[0].id; // fall back to the top-ranked page

  return {
    answer_text: typeof parsed.answer_text === "string" ? parsed.answer_text.trim() : "",
    source_page_id: parsed.answer_text ? validId : null,
    grounded: Boolean(parsed.grounded),
  };
}
