import { anthropic, PRIMARY_MODEL, extractText, parseLooseJson } from "@/lib/claude";

export const BRAND_PROMPT_VERSION = "brand-v1.0.0";

const SYSTEM_PROMPT = `Sos un analista de Earned AEO (Answer Engine Optimization). Usás búsqueda web para mapear cómo y dónde se menciona a una marca en la web, con foco en si aparece citada por motores generativos.

Te paso el nombre/dominio de la marca y un resumen de qué hace. Investigá en la web y devolvé:

1. "findings": menciones de la marca encontradas. Para cada una:
   - "url": dónde aparece.
   - "context": qué dice / en qué contexto se la menciona (1–2 oraciones).
   - "sentiment": "positive" | "neutral" | "negative".
   - "is_citation": true si es una cita/recomendación en una respuesta o contenido de tipo "respuesta a una pregunta" (señal de Earned AEO), false si es una mención casual.

2. "gaps": huecos de posicionamiento a reforzar o corregir. Cada uno:
   - "issue": el hueco (ej: "no aparece en comparativas del rubro", "información desactualizada en X").
   - "recommendation": qué hacer al respecto.

3. "summary": párrafo (máx. 100 palabras) con el panorama general de la presencia de la marca.

REGLAS: Basate SOLO en lo que encontrás en la búsqueda. No inventes menciones ni URLs. Si encontrás poco, decilo en el summary y devolvé pocas findings.

Devolvé SOLO JSON estricto (sin markdown, sin texto extra):
{
  "findings": [ { "url": "string", "context": "string", "sentiment": "positive|neutral|negative", "is_citation": boolean } ],
  "gaps": [ { "issue": "string", "recommendation": "string" } ],
  "summary": "string"
}`;

export interface BrandFinding {
  url: string;
  context: string;
  sentiment: "positive" | "neutral" | "negative";
  is_citation: boolean;
}
export interface BrandGap {
  issue: string;
  recommendation: string;
}
export interface BrandAuditResult {
  findings: BrandFinding[];
  gaps: BrandGap[];
  summary: string;
}

const VALID_SENTIMENT = ["positive", "neutral", "negative"];

export async function auditBrand(input: {
  name: string;
  domain: string;
  topicSummary: string | null;
}): Promise<BrandAuditResult> {
  const { name, domain, topicSummary } = input;

  const response = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 3500,
    system: SYSTEM_PROMPT,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    messages: [
      {
        role: "user",
        content: `Marca: ${name}\nDominio: ${domain}\nQué hace: ${
          topicSummary || "(no provisto)"
        }\n\nInvestigá la presencia de esta marca en la web y devolvé el JSON.`,
      },
    ],
  });

  const text = extractText(response);
  const parsed = parseLooseJson<Partial<BrandAuditResult>>(text);

  const findings = (parsed.findings ?? [])
    .filter((f) => f && typeof f.url === "string")
    .map((f) => ({
      url: f.url,
      context: typeof f.context === "string" ? f.context : "",
      sentiment: VALID_SENTIMENT.includes(f.sentiment as string)
        ? (f.sentiment as BrandFinding["sentiment"])
        : "neutral",
      is_citation: Boolean(f.is_citation),
    }));
  const gaps = (parsed.gaps ?? [])
    .filter((g) => g && typeof g.issue === "string")
    .map((g) => ({
      issue: g.issue,
      recommendation: typeof g.recommendation === "string" ? g.recommendation : "",
    }));

  return { findings, gaps, summary: typeof parsed.summary === "string" ? parsed.summary : "" };
}
