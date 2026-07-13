import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

/**
 * Provider-agnostic LLM layer. The whole app calls `llmComplete`; the provider
 * is selected by LLM_PROVIDER ("google" default, or "anthropic").
 *
 * - Google (Gemini) has a free tier — the default so the app runs without
 *   paid Anthropic credits. Web search maps to Google Search grounding.
 * - Anthropic stays available if ANTHROPIC_API_KEY is set and LLM_PROVIDER
 *   is "anthropic". Web search maps to the web_search server tool.
 */

export const PROVIDER = (process.env.LLM_PROVIDER || "google").toLowerCase();

// Versioned so evals stay attributable across provider/model changes.
export const PROMPT_VERSION = "v2.0.0-gemini";

// --- Model ids -------------------------------------------------------------
// The "-latest" alias is what has free-tier quota (pinned versions like
// gemini-2.0-flash can return 429 with 0 free quota on some projects).
const GOOGLE_MODEL = process.env.GOOGLE_MODEL || "gemini-flash-lite-latest";
const ANTHROPIC_MODEL = "claude-opus-4-8";

// --- Lazy clients ----------------------------------------------------------
let _anthropic: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

let _google: GoogleGenAI | null = null;
function googleClient(): GoogleGenAI {
  if (!_google) {
    _google = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    });
  }
  return _google;
}

export interface LlmOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /** Enable web search / grounding (demand research, brand audit, citations). */
  webSearch?: boolean;
  /** Hint that the output should be pure JSON (used to tighten decoding). */
  json?: boolean;
}

/** Run a completion with the active provider and return the text output. */
export async function llmComplete(opts: LlmOptions): Promise<string> {
  if (PROVIDER === "anthropic") return anthropicComplete(opts);
  return googleComplete(opts);
}

// --- Google (Gemini) -------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generate(opts: LlmOptions, useSearch: boolean): Promise<string> {
  const ai = googleClient();
  const response = await ai.models.generateContent({
    model: GOOGLE_MODEL,
    contents: opts.user,
    config: {
      systemInstruction: opts.system,
      maxOutputTokens: opts.maxTokens ?? 4000,
      // Grounding and JSON mode can't be combined; grounding wins.
      tools: useSearch ? [{ googleSearch: {} }] : undefined,
      responseMimeType: !useSearch && opts.json ? "application/json" : undefined,
    },
  });
  return response.text ?? "";
}

async function googleComplete(opts: LlmOptions): Promise<string> {
  // Retry transient overload (503) and rate limits (429) with backoff. If
  // grounding is requested but unavailable (free-tier quota), fall back to a
  // plain generation so the pipeline keeps working.
  const attempt = async (useSearch: boolean) => {
    let lastErr: unknown;
    for (let i = 0; i < 5; i++) {
      try {
        return await generate(opts, useSearch);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const transient = msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE");
        if (!transient) throw err;
        await sleep(2000 * (i + 1)); // 2s, 4s, 6s, 8s, 10s
      }
    }
    throw lastErr;
  };

  if (!opts.webSearch) return attempt(false);
  try {
    return await attempt(true);
  } catch {
    // Grounding unavailable → degrade to plain generation.
    return attempt(false);
  }
}

// --- Anthropic -------------------------------------------------------------
async function anthropicComplete(opts: LlmOptions): Promise<string> {
  const client = anthropicClient();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    tools: opts.webSearch
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }]
      : undefined,
    messages: [{ role: "user", content: opts.user }],
  });
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");
}

// --- JSON parsing helpers (provider-agnostic) ------------------------------

/** Parse strict JSON, tolerating code fences. */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`Failed to parse JSON response: ${cleaned.slice(0, 200)}`);
  }
}

/**
 * Extract the last balanced JSON object/array from text that may contain
 * surrounding prose (e.g. grounded/web-search responses).
 */
export function parseLooseJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* scan below */
  }
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = cleaned.indexOf(open);
    const end = cleaned.lastIndexOf(close);
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* try next */
      }
    }
  }
  throw new Error(`parseLooseJson: no JSON found in: ${cleaned.slice(0, 200)}`);
}
