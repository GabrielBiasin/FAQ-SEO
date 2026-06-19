// Cheap programmatic (non-AI) checks for AEO answer quality.
// These run for free and complement the LLM judge.

export interface ProgrammaticChecks {
  answer_first: number; // 1–5: does the answer respond in the first sentence?
  no_fluff: number; // 1–5: low filler/boilerplate
  length_ok: number; // 1–5: calibrated length (not too short/long)
  format_valid: number; // 1–5: non-empty, well-formed
}

const FLUFF_PHRASES = [
  "en este artículo",
  "en esta página",
  "en este sitio",
  "como mencionamos",
  "como se mencionó",
  "vale la pena destacar",
  "es importante mencionar",
  "en el mundo de hoy",
  "hoy en día",
  "sin más preámbulos",
];

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

/**
 * Heuristic: an answer is "answer-first" if the first sentence is substantive
 * (not a throat-clearing lead-in) and reasonably concise.
 */
export function runProgrammaticChecks(answer: string): ProgrammaticChecks {
  const text = answer.trim();
  const words = text ? text.split(/\s+/).length : 0;

  // format_valid
  const format_valid = !text ? 1 : words >= 5 ? 5 : 3;

  // answer_first: penalize leading filler; reward a direct first sentence.
  const fs = firstSentence(text).toLowerCase();
  const startsWithFluff = FLUFF_PHRASES.some((p) => fs.startsWith(p));
  const fsWords = fs ? fs.split(/\s+/).length : 0;
  let answer_first = 5;
  if (!text) answer_first = 1;
  else if (startsWithFluff) answer_first = 2;
  else if (fsWords > 40) answer_first = 3; // overly long first sentence buries the answer
  else answer_first = 5;

  // no_fluff: count fluff phrase occurrences anywhere.
  const lower = text.toLowerCase();
  const fluffHits = FLUFF_PHRASES.filter((p) => lower.includes(p)).length;
  const no_fluff = !text ? 1 : fluffHits === 0 ? 5 : fluffHits === 1 ? 3 : 1;

  // length_ok: AEO answers ~25–110 words are ideal.
  let length_ok = 5;
  if (!text) length_ok = 1;
  else if (words < 12) length_ok = 2;
  else if (words < 25) length_ok = 4;
  else if (words <= 110) length_ok = 5;
  else if (words <= 160) length_ok = 3;
  else length_ok = 2;

  return { answer_first, no_fluff, length_ok, format_valid };
}
