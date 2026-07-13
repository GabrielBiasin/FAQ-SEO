// Backwards-compatible shim. The app now goes through the provider-agnostic
// LLM layer in ./llm (Gemini by default, Anthropic optional).
export {
  llmComplete,
  parseJsonResponse,
  parseLooseJson,
  PROMPT_VERSION,
  PROVIDER,
} from "./llm";
