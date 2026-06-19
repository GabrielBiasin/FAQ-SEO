// Lightweight lexical retrieval to pick the most relevant source pages for a
// question before grounding generation. No embeddings needed for Phase 1.

const STOP = new Set([
  "que", "qué", "cual", "cuál", "como", "cómo", "para", "por", "los", "las",
  "del", "una", "uno", "con", "the", "and", "for", "what", "how", "why",
  "are", "is", "of", "a", "an", "to", "in", "on", "de", "en", "el", "la",
  "se", "un", "es", "y", "o",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD") // decompose accents; the next replace strips the marks
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export interface RankablePage {
  id: string;
  url: string;
  title: string | null;
  cleanText: string;
}

/**
 * Rank pages by term-overlap with the question (title weighted higher).
 * Returns the top `k` pages, always returning at least one if any exist.
 */
export function topPagesForQuestion<T extends RankablePage>(
  question: string,
  pages: T[],
  k = 3
): T[] {
  const qTerms = new Set(tokenize(question));
  if (qTerms.size === 0) return pages.slice(0, k);

  const scored = pages.map((p) => {
    const titleTerms = tokenize(p.title || "");
    const bodyTerms = tokenize(p.cleanText.slice(0, 4000));
    let score = 0;
    const bodyCounts = new Map<string, number>();
    for (const t of bodyTerms) bodyCounts.set(t, (bodyCounts.get(t) || 0) + 1);
    for (const t of qTerms) {
      if (titleTerms.includes(t)) score += 3;
      score += Math.min(bodyCounts.get(t) || 0, 5);
    }
    return { page: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, k).map((s) => s.page);
  return top.length ? top : pages.slice(0, k);
}
