import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";

export const VERIFY_PROMPT_VERSION = "verify-v1.0.0";

const SYSTEM_PROMPT = `Sos un verificador anti-alucinación. Recibís una RESPUESTA y el CONTENIDO FUENTE en el que debería estar fundada. Tu trabajo es chequear afirmación por afirmación si la respuesta está sustentada por la fuente.

Proceso:
1. Descomponé la respuesta en afirmaciones atómicas (claims).
2. Para cada claim, decidí si está sustentado por la fuente: "supported" (la fuente lo dice), "partial" (parcialmente / impreciso) o "unsupported" (no está en la fuente o la contradice).
3. Calculá un "confidence" global entre 0 y 1: proporción de la respuesta que está bien fundada (supported pesa 1, partial 0.5, unsupported 0).

Sé estricto: si un dato (número, nombre, fecha) no aparece en la fuente, es "unsupported" aunque suene plausible.

Devolvé SOLO JSON estricto (sin markdown, sin texto extra):
{
  "claims": [
    { "claim": "string", "verdict": "supported|partial|unsupported" }
  ],
  "confidence": number
}`;

export type Verdict = "supported" | "partial" | "unsupported";

export interface VerificationResult {
  claims: { claim: string; verdict: Verdict }[];
  unsupported_claims: string[];
  confidence: number;
}

const WEIGHT: Record<Verdict, number> = { supported: 1, partial: 0.5, unsupported: 0 };

export async function verifyAnswer(input: {
  answer: string;
  sourceText: string;
}): Promise<VerificationResult> {
  const { answer, sourceText } = input;

  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Respuesta a verificar\n${answer}\n\n## Contenido fuente\n${sourceText.slice(0, 6000)}`,
      },
    ],
  });

  const text = extractText(response);
  const parsed = parseLooseJson<{
    claims?: { claim: string; verdict: Verdict }[];
    confidence?: number;
  }>(text);

  const claims = (parsed.claims ?? []).filter(
    (c) => c && typeof c.claim === "string" && c.claim.trim()
  );
  const unsupported = claims
    .filter((c) => c.verdict === "unsupported")
    .map((c) => c.claim.trim());

  // Prefer the model's confidence; fall back to a computed score from verdicts.
  let confidence = parsed.confidence;
  if (!Number.isFinite(confidence) || confidence! < 0 || confidence! > 1) {
    confidence = claims.length
      ? claims.reduce((s, c) => s + (WEIGHT[c.verdict] ?? 0), 0) / claims.length
      : 0;
  }

  return {
    claims,
    unsupported_claims: unsupported,
    confidence: Number(confidence!.toFixed(3)),
  };
}
