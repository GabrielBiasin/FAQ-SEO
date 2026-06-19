import { fetchRobots, isAllowed, type RobotsRules } from "./robots";
import { fetchSitemapUrls } from "./sitemap";
import { extractContent } from "./extract";

export const USER_AGENT =
  "FAQ-AEO-Bot/1.0 (+https://example.com/bot; respects robots.txt)";

// Default polite delay between requests (ms) when robots gives no crawl-delay.
const DEFAULT_DELAY_MS = 800;
const FETCH_TIMEOUT_MS = 15000;

export interface CrawlResult {
  url: string;
  title: string | null;
  headings: { tag: string; text: string }[];
  cleanText: string;
  wordCount: number;
}

export interface CrawlOptions {
  rootUrl: string;
  maxPages: number;
  onPage?: (page: CrawlResult, index: number) => Promise<void> | void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    u.hash = "";
    // Drop common tracking params to avoid duplicate pages.
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach(
      (p) => u.searchParams.delete(p)
    );
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

// Skip obvious non-HTML assets by extension.
const ASSET_RE = /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|pdf|zip|mp4|mp3|woff2?|ttf|xml|json)(\?|$)/i;

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Crawl a site politely:
 *  1. Honor robots.txt (disallow rules + crawl-delay).
 *  2. Seed URLs from sitemap.xml; fall back to BFS over internal links.
 *  3. Rate-limit, cap at maxPages, identifiable User-Agent, HTML-only.
 *
 * Calls onPage for each extracted page so the caller can persist incrementally.
 */
export async function crawlSite(opts: CrawlOptions): Promise<CrawlResult[]> {
  const { rootUrl, maxPages } = opts;
  const origin = new URL(rootUrl).origin;
  const robots: RobotsRules = await fetchRobots(origin, USER_AGENT);
  const delayMs = robots.crawlDelay ? robots.crawlDelay * 1000 : DEFAULT_DELAY_MS;

  const allowedPath = (u: string) => {
    try {
      return isAllowed(robots, new URL(u).pathname);
    } catch {
      return false;
    }
  };

  // Seed queue: sitemap first, else just the root.
  const sitemapSources = robots.sitemaps.length
    ? robots.sitemaps
    : [new URL("/sitemap.xml", origin).toString()];
  const sitemapUrls = (
    await Promise.all(sitemapSources.map((s) => fetchSitemapUrls(s, USER_AGENT)))
  ).flat();

  const seen = new Set<string>();
  const queue: string[] = [];
  const enqueue = (u: string | null) => {
    if (!u) return;
    const norm = normalizeUrl(u, rootUrl);
    if (!norm) return;
    if (seen.has(norm)) return;
    if (!sameHost(norm, rootUrl)) return;
    if (ASSET_RE.test(norm)) return;
    if (!allowedPath(norm)) return;
    seen.add(norm);
    queue.push(norm);
  };

  enqueue(rootUrl);
  sitemapUrls.forEach(enqueue);

  const results: CrawlResult[] = [];
  let i = 0;
  while (queue.length > 0 && results.length < maxPages) {
    const url = queue.shift()!;
    const html = await fetchHtml(url);
    if (html) {
      const extracted = extractContent(html, url);
      // Skip near-empty pages (likely redirects/landing shells).
      if (extracted.wordCount >= 20) {
        const page: CrawlResult = {
          url,
          title: extracted.title,
          headings: extracted.headings,
          cleanText: extracted.cleanText,
          wordCount: extracted.wordCount,
        };
        results.push(page);
        if (opts.onPage) await opts.onPage(page, i++);
      }
      // Discover more links (BFS) — useful when there's no sitemap.
      if (results.length < maxPages) {
        extracted.links.forEach(enqueue);
      }
    }
    if (queue.length > 0 && results.length < maxPages) await sleep(delayMs);
  }

  return results;
}
