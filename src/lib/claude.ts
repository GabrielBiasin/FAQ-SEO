import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Primary model for generation, analysis, and verification
export const PRIMARY_MODEL = "claude-opus-4-8";

// Lighter model for simple/cheap tasks
export const FAST_MODEL = "claude-haiku-4-5-20251001";

// Prompt version tag — bump when changing any prompt to keep eval history clean
export const PROMPT_VERSION = "v1.0.0";

/**
 * Parse a strict JSON response from Claude.
 * Claude is instructed to return raw JSON; this handles edge cases where
 * backticks or whitespace sneak in.
 */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`Failed to parse Claude JSON response: ${cleaned.slice(0, 200)}`);
  }
}

/**
 * Extract the last balanced JSON object/array from a string that may contain
 * surrounding prose (e.g. responses produced while using the web_search tool).
 * Falls back to parseJsonResponse for clean responses.
 */
export function parseLooseJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  // Try a straight parse first.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through to scanning */
  }
  // Scan for the last top-level { } or [ ] block.
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = cleaned.indexOf(open);
    const end = cleaned.lastIndexOf(close);
    if (start !== -1 && end > start) {
      const slice = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(slice) as T;
      } catch {
        /* try next bracket type */
      }
    }
  }
  throw new Error(`parseLooseJson: no JSON found in: ${cleaned.slice(0, 200)}`);
}

/**
 * Extract text content from an Anthropic message response.
 */
export function extractText(
  response: Anthropic.Message
): string {
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");
}
