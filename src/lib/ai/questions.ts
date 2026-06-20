import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";
import type { QuestionTier, QuestionIntent } from "@/types/database";

export const QUESTIONS_PROMPT_VERSION = "questions-v1.1.0";

const SYSTEM_PROMPT = `Sos un estratega de contenido AEO. Recibís: (a) los tópicos del sitio, (b) un digest del contenido de las páginas, y (c) una lista de preguntas candidatas que provienen de SEÑALES DE DEMANDA REAL (preguntas de ventas/soporte cargadas por el cliente, investigación de búsqueda web, People-Also-Ask, autocompletar).

Tu trabajo es SINTETIZAR, CLUSTERIZAR, ORDENAR y REDACTAR el set final de preguntas para generar FAQs.

REGLAS INNEGOCIABLES:
1. NO INVENTES preguntas long-tail. Las preguntas específicas (long-tail) SOLO pueden venir de las candidatas provistas (señales reales). Si no está respaldada por una candidata, no la incluyas como long-tail.
2. Podés derivar preguntas adicionales del CONTENIDO, pero solo si el contenido claramente las responde (preguntas "head"/"mid" de tipo definicional o de proceso que el sitio cubre). Estas se marcan source="content".
3. Deduplicá preguntas equivalentes (misma intención con distinta redacción) en una sola, conservando la mejor redacción.
4. Asigná cada pregunta a UN topic de los provistos (por nombre exacto). Si ninguna encaja, usá topic: null.
5. Para cada pregunta asigná:
   - "tier": "head" (amplia, alto volumen), "mid" (intermedia) o "long" (específica, long-tail).
   - "intent": uno de "definitional", "process", "comparative", "transactional", "product".
   - "source": de dónde viene ("sales","support","manual","web_search","paa","autocomplete","content"). Para candidatas, conservá su source original; para derivadas del contenido usá "content".
   - "priority_score": número 0–100. Priorizá ALTO las de intent "product" y "transactional" (alta intención comercial) y las que vienen de señales reales del cliente (sales/support).
6. Ordená el resultado de lo GENERAL a lo PARTICULAR dentro de cada topic (head → mid → long).

Limitá el resultado a las 40 preguntas más valiosas (no más), priorizando calidad y cobertura sobre cantidad.

Devolvé SOLO JSON estricto (sin markdown, sin texto extra):
{
  "questions": [
    { "text": "string", "topic": "string|null", "tier": "head|mid|long", "intent": "definitional|process|comparative|transactional|product", "source": "string", "priority_score": number }
  ]
}`;

export interface SynthQuestion {
  text: string;
  topic: string | null;
  tier: QuestionTier;
  intent: QuestionIntent;
  source: string;
  priority_score: number;
}

export interface CandidateQuestion {
  text: string;
  source: string;
}

interface PageInput {
  url: string;
  title: string | null;
  cleanText: string;
}

const VALID_TIERS: QuestionTier[] = ["head", "mid", "long"];
const VALID_INTENTS: QuestionIntent[] = [
  "definitional",
  "process",
  "comparative",
  "transactional",
  "product",
];

function buildDigest(pages: PageInput[], maxPages = 30, perPageChars = 1500): string {
  return pages
    .slice(0, maxPages)
    .map((p, i) => `### ${i + 1}. ${p.title || "(sin título)"} — ${p.url}\n${p.cleanText.slice(0, perPageChars)}`)
    .join("\n\n");
}

export async function synthesizeQuestions(input: {
  topics: { name: string; summary: string }[];
  pages: PageInput[];
  candidates: CandidateQuestion[];
}): Promise<SynthQuestion[]> {
  const { topics, pages, candidates } = input;

  const topicBlock = topics.length
    ? topics.map((t) => `- ${t.name}: ${t.summary}`).join("\n")
    : "(sin tópicos definidos)";
  const candidateBlock = candidates.length
    ? candidates.map((c) => `- [${c.source}] ${c.text}`).join("\n")
    : "(sin candidatas externas — derivá solo head/mid del contenido)";

  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Tópicos del sitio\n${topicBlock}\n\n## Preguntas candidatas (señales de demanda real)\n${candidateBlock}\n\n## Digest del contenido\n${buildDigest(
          pages
        )}`,
      },
    ],
  });

  const text = extractText(response);
  // Tolerate a truncated response (model hit the token cap): if the JSON won't
  // parse whole, salvage the complete question objects from the array.
  let rawQuestions: SynthQuestion[];
  try {
    rawQuestions = parseLooseJson<{ questions?: SynthQuestion[] }>(text).questions ?? [];
  } catch {
    rawQuestions = salvageQuestions(text);
  }
  const topicNames = new Set(topics.map((t) => t.name));

  return rawQuestions
    .filter((q) => q && typeof q.text === "string" && q.text.trim())
    .map((q) => ({
      text: q.text.trim(),
      topic: q.topic && topicNames.has(q.topic) ? q.topic : null,
      tier: VALID_TIERS.includes(q.tier) ? q.tier : "mid",
      intent: VALID_INTENTS.includes(q.intent) ? q.intent : "definitional",
      source: typeof q.source === "string" && q.source ? q.source : "content",
      priority_score: Number.isFinite(q.priority_score)
        ? Math.max(0, Math.min(100, q.priority_score))
        : 0,
    }));
}

/**
 * Recover question objects from a truncated/invalid synthesis response by
 * scanning for balanced top-level `{...}` objects and JSON-parsing each one.
 * Drops the trailing incomplete object instead of failing the whole job.
 */
function salvageQuestions(text: string): SynthQuestion[] {
  const start = text.indexOf("[");
  if (start === -1) return [];
  const out: SynthQuestion[] = [];
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
          out.push(JSON.parse(text.slice(objStart, i + 1)) as SynthQuestion);
        } catch {
          /* skip malformed object */
        }
        objStart = -1;
      }
    }
  }
  return out;
}
