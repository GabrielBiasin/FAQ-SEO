import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";
import type { QuestionTier, QuestionIntent } from "@/types/database";

export const QUESTIONS_PROMPT_VERSION = "questions-v1.2.0";

const SYSTEM_PROMPT = `Sos un estratega de contenido AEO. Recibís: (a) los tópicos del sitio, (b) las secciones del sitio (con su tipo), (c) un digest del contenido, y (d) preguntas candidatas que provienen de SEÑALES DE DEMANDA REAL (ventas/soporte, búsqueda web, People-Also-Ask, autocompletar).

Tu trabajo es SINTETIZAR, CLUSTERIZAR, ORDENAR, CLASIFICAR y REDACTAR el set final de preguntas para FAQs.

CLASES DE PREGUNTA (campo "question_class"):
- "demand": informacional/producto que persigue volumen y citación. GUARDRAIL: NO inventar. Solo incluila si proviene de una candidata real o el contenido la respalda claramente. Si no hay señal, no la generes.
- "coverage": duda buyer-facing legítima que el comprador hace en la página aunque no tenga volumen de búsqueda medible (confianza, trayectoria, cómo trabajan, ubicación, contacto, diferenciación). SÍ podés generarla fundándote en la info real de la empresa del contenido. No es inventar volumen: es responder dudas reales (E-E-A-T).

REGLAS:
1. Guardrail diferenciado por clase (arriba). Ambas clases se fundan SIEMPRE en el contenido real; nada inventado.
2. Deduplicá equivalentes en una sola (mejor redacción).
3. Asigná cada pregunta a UN topic provisto (nombre exacto) o topic:null.
4. Asigná cada pregunta a UNA section provista (nombre exacto de la lista de secciones) según dónde debería vivir el FAQ. Si ninguna encaja, section:null.
5. Por pregunta: "tier" (head/mid/long), "intent" (definitional/process/comparative/transactional/product), "source" (sales/support/manual/web_search/paa/autocomplete/content), "question_class" (demand/coverage), "priority_score" (0–100; priorizá product/transactional y señales del cliente).
6. Ordená de lo GENERAL a lo PARTICULAR dentro de cada topic (head→mid→long).

Limitá a las 40 preguntas más valiosas. Calidad sobre cantidad.

Devolvé SOLO JSON estricto (sin markdown, sin texto extra):
{
  "questions": [
    { "text": "string", "topic": "string|null", "section": "string|null", "tier": "head|mid|long", "intent": "definitional|process|comparative|transactional|product", "source": "string", "question_class": "demand|coverage", "priority_score": number }
  ]
}`;

export interface SynthQuestion {
  text: string;
  topic: string | null;
  section: string | null;
  tier: QuestionTier;
  intent: QuestionIntent;
  source: string;
  question_class: "demand" | "coverage";
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
  sections: { name: string; section_type: string }[];
  pages: PageInput[];
  candidates: CandidateQuestion[];
}): Promise<SynthQuestion[]> {
  const { topics, sections, pages, candidates } = input;

  const topicBlock = topics.length
    ? topics.map((t) => `- ${t.name}: ${t.summary}`).join("\n")
    : "(sin tópicos definidos)";
  const sectionBlock = sections.length
    ? sections.map((s) => `- ${s.name} (${s.section_type})`).join("\n")
    : "(sin secciones definidas)";
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
        content: `## Tópicos del sitio\n${topicBlock}\n\n## Secciones del sitio\n${sectionBlock}\n\n## Preguntas candidatas (señales de demanda real)\n${candidateBlock}\n\n## Digest del contenido\n${buildDigest(
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
  const sectionNames = new Set(sections.map((s) => s.name));

  return rawQuestions
    .filter((q) => q && typeof q.text === "string" && q.text.trim())
    .map((q) => ({
      text: q.text.trim(),
      topic: q.topic && topicNames.has(q.topic) ? q.topic : null,
      section: q.section && sectionNames.has(q.section) ? q.section : null,
      tier: VALID_TIERS.includes(q.tier) ? q.tier : "mid",
      intent: VALID_INTENTS.includes(q.intent) ? q.intent : "definitional",
      source: typeof q.source === "string" && q.source ? q.source : "content",
      question_class: q.question_class === "coverage" ? "coverage" : "demand",
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
