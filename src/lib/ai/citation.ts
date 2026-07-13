import { llmComplete, parseLooseJson } from "@/lib/claude";

export const CITATION_PROMPT_VERSION = "citation-v1.0.0";

const SYSTEM_PROMPT = `Sos un analista de share-of-voice para AEO. Para una PREGUNTA y una MARCA/DOMINIO dados, usás búsqueda web para evaluar si la marca aparece como una fuente citada o recomendada cuando se responde esa pregunta hoy.

Devolvé SOLO JSON estricto:
{
  "cited": boolean,        // ¿la marca/dominio aparece como fuente citable para esta pregunta?
  "position": number|null, // posición aproximada entre las fuentes (1 = primera), o null
  "evidence": "string"     // 1 oración con la evidencia encontrada
}

Basate SOLO en lo que encontrás. Si no hay evidencia de que la marca sea citada, "cited": false.`;

export interface CitationAssessment {
  cited: boolean;
  position: number | null;
  evidence: string;
}

export async function assessCitation(input: {
  question: string;
  brand: string;
  domain: string;
}): Promise<CitationAssessment> {
  const { question, brand, domain } = input;

  const text = await llmComplete({
    system: SYSTEM_PROMPT,
    user: `Marca: ${brand} (${domain})\nPregunta: ${question}\n\n¿Aparece ${domain} como fuente citada al responder esta pregunta? Devolvé el JSON.`,
    maxTokens: 800,
    webSearch: true,
  });
  try {
    const parsed = parseLooseJson<CitationAssessment>(text);
    return {
      cited: Boolean(parsed.cited),
      position:
        parsed.position != null && Number.isFinite(Number(parsed.position))
          ? Number(parsed.position)
          : null,
      evidence: typeof parsed.evidence === "string" ? parsed.evidence : "",
    };
  } catch {
    return { cited: false, position: null, evidence: "" };
  }
}
