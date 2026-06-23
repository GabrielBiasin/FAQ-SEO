import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";
import type { QuestionTier, QuestionIntent } from "@/types/database";

export const COVERAGE_PROMPT_VERSION = "coverage-v1.0.0";

const SYSTEM_PROMPT = `Sos un estratega de contenido AEO. Generás preguntas de clase "coverage" (cobertura/confianza) para una sección específica de un sitio.

Las preguntas de COVERAGE son dudas reales que un comprador se hace en esa sección aunque no tengan volumen de búsqueda medible (confianza, trayectoria, cómo trabajan, ubicación, contacto, diferenciación, etc.). NO son demanda de búsqueda: son buyer-facing y alimentan E-E-A-T.

REGLAS:
- Generá preguntas guiadas por el "brief de intención" de la sección y, si se da, por una "intención adicional" puntual.
- Fundá todo en la INFO REAL de la empresa que aparece en el contenido provisto. NO inventes datos, servicios, números ni afirmaciones que no estén en el contenido. Si el contenido no da para cierta pregunta, no la generes.
- NO repitas ni parafrasees las "preguntas ya existentes" provistas (evitá duplicados).
- Para cada pregunta asigná "tier" (head/mid/long) e "intent" (definitional/process/comparative/transactional/product).

Devolvé SOLO JSON estricto (sin markdown):
{
  "questions": [
    { "text": "string", "tier": "head|mid|long", "intent": "definitional|process|comparative|transactional|product" }
  ]
}`;

export interface CoverageQuestion {
  text: string;
  tier: QuestionTier;
  intent: QuestionIntent;
}

const VALID_TIERS: QuestionTier[] = ["head", "mid", "long"];
const VALID_INTENTS: QuestionIntent[] = [
  "definitional",
  "process",
  "comparative",
  "transactional",
  "product",
];

export async function generateCoverageQuestions(input: {
  sectionName: string;
  sectionType: string;
  intentBrief: string;
  extraIntent?: string | null;
  existingQuestions: string[];
  pages: { url: string; title: string | null; cleanText: string }[];
  needed: number;
}): Promise<CoverageQuestion[]> {
  const { sectionName, sectionType, intentBrief, extraIntent, existingQuestions, pages, needed } =
    input;

  const content = pages
    .slice(0, 20)
    .map((p) => `### ${p.title || "(sin título)"} — ${p.url}\n${p.cleanText.slice(0, 1500)}`)
    .join("\n\n");
  const existingBlock = existingQuestions.length
    ? existingQuestions.map((q) => `- ${q}`).join("\n")
    : "(ninguna)";

  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Sección\n${sectionName} (tipo: ${sectionType})\n\n## Brief de intención de la sección\n${intentBrief}${
          extraIntent ? `\n\n## Intención adicional puntual\n${extraIntent}` : ""
        }\n\n## Preguntas ya existentes (NO repetir)\n${existingBlock}\n\n## Contenido fuente (info real de la empresa)\n${content}\n\nGenerá hasta ${needed} preguntas nuevas de cobertura para esta sección.`,
      },
    ],
  });

  const text = extractText(response);
  let parsed: { questions?: CoverageQuestion[] };
  try {
    parsed = parseLooseJson<{ questions?: CoverageQuestion[] }>(text);
  } catch {
    return [];
  }
  return (parsed.questions ?? [])
    .filter((q) => q && typeof q.text === "string" && q.text.trim())
    .map((q) => ({
      text: q.text.trim(),
      tier: VALID_TIERS.includes(q.tier) ? q.tier : "mid",
      intent: VALID_INTENTS.includes(q.intent) ? q.intent : "definitional",
    }))
    .slice(0, needed);
}
