import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";

export const DEMAND_PROMPT_VERSION = "demand-v1.0.0";

const SYSTEM_PROMPT = `Sos un investigador de demanda de búsqueda para AEO. Usás la herramienta de búsqueda web para encontrar PREGUNTAS REALES que la gente hace sobre un tema.

REGLA CRÍTICA E INNEGOCIABLE: NO inventes preguntas. Tu trabajo NO es generar preguntas que "suenan bien". Tu trabajo es ENCONTRAR preguntas que aparecen en señales de demanda real: resultados de búsqueda, "People Also Ask", foros, FAQs de la competencia, autocompletar. Si no encontraste evidencia de que una pregunta se busca de verdad, NO la incluyas. Es preferible devolver pocas preguntas reales que muchas inventadas.

Proceso:
1. Buscá en la web sobre los tópicos provistos (varias búsquedas con distintos ángulos).
2. Extraé las preguntas reales que la gente hace, basándote en lo que encontraste.
3. Para cada pregunta, registrá una "evidence": de dónde surge (ej: "People Also Ask en Google", "FAQ de competidor X", "foro Reddit", "autocompletar").

Devolvé SOLO JSON estricto (sin markdown, sin texto extra) al final, con esta forma:
{
  "questions": [
    { "text": "string", "evidence": "string" }
  ]
}`;

export interface DemandQuestion {
  text: string;
  evidence: string;
}

/**
 * Run web-search-grounded demand research for a site's topics.
 * Returns real questions found online (never fabricated long-tail).
 */
export async function researchDemand(
  topicSummary: string,
  topicNames: string[]
): Promise<DemandQuestion[]> {
  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 6,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Tema del sitio: ${topicSummary}\n\nTópicos a investigar:\n${topicNames
          .map((t) => `- ${t}`)
          .join("\n")}\n\nBuscá preguntas reales que la gente hace sobre estos tópicos y devolvé el JSON.`,
      },
    ],
  });

  const text = extractText(response);
  if (!text.trim()) return [];
  try {
    const parsed = parseLooseJson<{ questions?: DemandQuestion[] }>(text);
    return (parsed.questions ?? [])
      .filter((q) => q && typeof q.text === "string" && q.text.trim())
      .map((q) => ({
        text: q.text.trim(),
        evidence: typeof q.evidence === "string" ? q.evidence : "",
      }));
  } catch {
    // If the model didn't return parseable JSON, fail soft — demand is one of
    // several sources, the pipeline still has seeds + content.
    return [];
  }
}
