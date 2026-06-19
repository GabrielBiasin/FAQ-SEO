import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";

export const JUDGE_PROMPT_VERSION = "judge-v1.0.0";
export const JUDGE_MODEL = PRIMARY_MODEL;

// Rubric dimensions scored 1–5 by the judge.
export const RUBRIC_DIMENSIONS = [
  "grounding",
  "answer_first",
  "self_contained",
  "specificity",
  "no_fluff",
  "voice_fit",
  "format_valid",
] as const;

export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];
export type RubricScores = Record<RubricDimension, number>;

const SYSTEM_PROMPT = `Sos un juez experto en calidad de FAQs para AEO (Answer Engine Optimization). Evaluás UNA respuesta contra una rúbrica, puntuando cada dimensión de 1 (muy malo) a 5 (excelente).

Dimensiones:
- "grounding": ¿toda afirmación está sustentada por el contenido fuente? (si no hay fuente provista, evaluá plausibilidad y autocontención)
- "answer_first": ¿responde directamente en la primera oración, sin rodeos?
- "self_contained": ¿se entiende fuera de contexto, sin referencias a "este sitio"/"arriba"?
- "specificity": ¿usa entidades, datos, números, nombres concretos? (vs. genérica)
- "no_fluff": ¿sin relleno ni boilerplate?
- "voice_fit": ¿respeta la guía de voz? (si no hay guía, evaluá tono profesional y claro)
- "format_valid": ¿bien formada, completa, sin texto roto?

Si se provee una "respuesta ideal" (golden), usala como referencia de qué tan buena podría ser.

Devolvé SOLO JSON estricto (sin markdown):
{
  "scores": { "grounding": n, "answer_first": n, "self_contained": n, "specificity": n, "no_fluff": n, "voice_fit": n, "format_valid": n },
  "rationale": "string (1-2 oraciones)"
}`;

export interface JudgeResult {
  scores: RubricScores;
  overall_score: number; // average, 1–5
  rationale: string;
}

function clamp(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(5, v));
}

export async function judgeAnswer(input: {
  question: string;
  answer: string;
  sourceText?: string | null;
  idealAnswer?: string | null;
  voiceGuide?: string | null;
}): Promise<JudgeResult> {
  const { question, answer, sourceText, idealAnswer, voiceGuide } = input;

  const parts = [
    `## Pregunta\n${question}`,
    `## Respuesta a evaluar\n${answer || "(vacía)"}`,
  ];
  if (sourceText) parts.push(`## Contenido fuente\n${sourceText.slice(0, 4000)}`);
  if (idealAnswer) parts.push(`## Respuesta ideal (golden)\n${idealAnswer}`);
  if (voiceGuide) parts.push(`## Guía de voz\n${voiceGuide}`);

  const response = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: parts.join("\n\n") }],
  });

  const text = extractText(response);
  const parsed = parseLooseJson<{ scores?: Partial<RubricScores>; rationale?: string }>(text);

  const scores = {} as RubricScores;
  for (const dim of RUBRIC_DIMENSIONS) scores[dim] = clamp(parsed.scores?.[dim]);
  const overall_score =
    RUBRIC_DIMENSIONS.reduce((s, d) => s + scores[d], 0) / RUBRIC_DIMENSIONS.length;

  return {
    scores,
    overall_score: Number(overall_score.toFixed(2)),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}
