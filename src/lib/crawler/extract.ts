import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface ExtractedPage {
  title: string | null;
  headings: { tag: string; text: string }[];
  cleanText: string;
  wordCount: number;
  links: string[];
}

/**
 * Parse raw HTML into clean article text (nav/footer/boilerplate stripped via
 * Readability), structured headings, and same-document links for crawling.
 */
export function extractContent(html: string, baseUrl: string): ExtractedPage {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;

  // Collect links before Readability mutates the DOM.
  const links = Array.from(doc.querySelectorAll("a[href]"))
    .map((a) => (a as HTMLAnchorElement).href)
    .filter(Boolean);

  // Collect headings from the original document for structure.
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3"))
    .map((h) => ({ tag: h.tagName.toLowerCase(), text: (h.textContent || "").trim() }))
    .filter((h) => h.text.length > 0);

  let cleanText = "";
  let title: string | null = doc.title?.trim() || null;
  try {
    const article = new Readability(doc).parse();
    if (article) {
      cleanText = (article.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
      title = article.title?.trim() || title;
    }
  } catch {
    // Fall back to body text if Readability fails on odd markup.
    cleanText = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  }

  const wordCount = cleanText ? cleanText.split(/\s+/).length : 0;
  return { title, headings, cleanText, wordCount, links };
}
