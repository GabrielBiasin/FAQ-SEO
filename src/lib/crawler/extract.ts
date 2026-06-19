export interface ExtractedPage {
  title: string | null;
  headings: { tag: string; text: string }[];
  cleanText: string;
  wordCount: number;
  links: string[];
}

function absolute(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/**
 * Parse raw HTML into clean article text (nav/footer/boilerplate stripped via
 * Readability), structured headings, and same-document links for crawling.
 *
 * Uses linkedom (a lightweight, serverless-friendly DOM) instead of jsdom,
 * which pulls native/ESM-incompatible transitive deps that crash on Vercel.
 * Imported dynamically to keep it out of the worker's static module graph.
 */
export async function extractContent(html: string, baseUrl: string): Promise<ExtractedPage> {
  const { parseHTML } = await import("linkedom");
  const { Readability } = await import("@mozilla/readability");

  const { document } = parseHTML(html);

  // Collect links (resolved to absolute against the page URL) before Readability
  // mutates the DOM.
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => absolute(a.getAttribute("href") || "", baseUrl))
    .filter((u): u is string => Boolean(u));

  // Collect headings from the original document for structure.
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((h) => ({ tag: h.tagName.toLowerCase(), text: (h.textContent || "").trim() }))
    .filter((h) => h.text.length > 0);

  let cleanText = "";
  let title: string | null = document.title?.trim() || null;
  try {
    // Readability accepts a Document-like object; linkedom's document qualifies.
    const article = new Readability(document as unknown as Document).parse();
    if (article) {
      cleanText = (article.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
      title = article.title?.trim() || title;
    }
  } catch {
    // Fall back to body text if Readability fails on odd markup.
    cleanText = (document.body?.textContent || "").replace(/\s+/g, " ").trim();
  }
  // Secondary fallback: if Readability produced little, use body text.
  if (cleanText.length < 40) {
    const body = (document.body?.textContent || "").replace(/\s+/g, " ").trim();
    if (body.length > cleanText.length) cleanText = body;
  }

  const wordCount = cleanText ? cleanText.split(/\s+/).length : 0;
  return { title, headings, cleanText, wordCount, links };
}
