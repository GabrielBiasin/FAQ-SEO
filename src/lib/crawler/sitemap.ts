// Sitemap discovery. Handles sitemap index files (nested sitemaps) and plain
// urlset sitemaps. Best-effort: returns whatever URLs it can find.

export async function fetchSitemapUrls(
  sitemapUrl: string,
  userAgent: string,
  depth = 0
): Promise<string[]> {
  if (depth > 3) return []; // guard against sitemap loops
  try {
    const res = await fetch(sitemapUrl, { headers: { "User-Agent": userAgent } });
    if (!res.ok) return [];
    const xml = await res.text();

    const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)).map((m) =>
      m[1].trim()
    );

    // Sitemap index → recurse into child sitemaps.
    if (/<sitemapindex/i.test(xml)) {
      const nested = await Promise.all(
        locs.map((u) => fetchSitemapUrls(u, userAgent, depth + 1))
      );
      return dedupe(nested.flat());
    }
    return dedupe(locs);
  } catch {
    return [];
  }
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
