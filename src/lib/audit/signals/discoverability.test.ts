import { describe, it, expect } from "vitest";
import type { AuditContext, AuditPage } from "../types";
import { discoverabilityEvaluators } from "./discoverability";

const byId = Object.fromEntries(discoverabilityEvaluators.map((e) => [e.definition.id, e]));

function page(url: string, over: Partial<AuditPage> = {}): AuditPage {
  return {
    id: url,
    url,
    title: "t",
    httpStatus: 200,
    canonicalUrl: url,
    metaRobots: null,
    hreflang: [],
    headings: [],
    internalLinks: [],
    cleanText: "x",
    wordCount: 1,
    ...over,
  };
}

// --- Fixture "sano": todo correcto ---
const GOOD: AuditContext = {
  projectId: "p",
  rootUrl: "https://acme.test/",
  origin: "https://acme.test",
  robotsTxt: "User-agent: *\nDisallow:\nSitemap: https://acme.test/sitemap.xml",
  sitemaps: [
    {
      url: "https://acme.test/sitemap.xml",
      httpStatus: 200,
      declaredInRobots: true,
      xml: `<?xml version="1.0"?><urlset><url><loc>https://acme.test/</loc></url><url><loc>https://acme.test/a</loc></url></urlset>`,
    },
  ],
  pages: [
    page("https://acme.test/", { internalLinks: ["https://acme.test/a"] }),
    page("https://acme.test/a", { internalLinks: ["https://acme.test/"] }),
  ],
};

// --- Fixture "roto": sin sitemap, noindex, canonical cross-host, huérfana ---
const BAD: AuditContext = {
  projectId: "p",
  rootUrl: "https://acme.test/",
  origin: "https://acme.test",
  robotsTxt: "User-agent: *\nDisallow: /",
  sitemaps: [{ url: "https://acme.test/sitemap.xml", httpStatus: 404, declaredInRobots: false, xml: null }],
  pages: [
    page("https://acme.test/", { internalLinks: [] }),
    page("https://acme.test/orphan", {
      internalLinks: [],
      metaRobots: "noindex,follow",
      canonicalUrl: "https://other.test/x",
      httpStatus: 500,
    }),
  ],
};

async function run(ctx: AuditContext, id: string) {
  return byId[id].measure(ctx);
}

describe("discoverability — fixture sano", () => {
  it("sitemap válido y declarado → 10", async () => {
    expect((await run(GOOD, "discoverability.sitemap_valid")).normalized).toBe(10);
  });
  it("robots permite rastreo → 10", async () => {
    expect((await run(GOOD, "discoverability.robots_allows_crawl")).normalized).toBe(10);
  });
  it("canonical consistente → 10", async () => {
    expect((await run(GOOD, "discoverability.canonical_consistent")).normalized).toBe(10);
  });
  it("indexable (sin noindex) → 10", async () => {
    expect((await run(GOOD, "discoverability.meta_robots_indexable")).normalized).toBe(10);
  });
  it("http health 2xx → 10", async () => {
    expect((await run(GOOD, "discoverability.http_health")).normalized).toBe(10);
  });
  it("sin huérfanas, poca profundidad → 10", async () => {
    expect((await run(GOOD, "discoverability.orphans_click_depth")).normalized).toBe(10);
  });
  it("hreflang N/A → unavailable / null", async () => {
    const m = await run(GOOD, "discoverability.hreflang_valid");
    expect(m.normalized).toBeNull();
    expect(m.state).toBe("unavailable");
  });
});

describe("discoverability — fixture roto", () => {
  it("sin sitemap → 0", async () => {
    expect((await run(BAD, "discoverability.sitemap_valid")).normalized).toBe(0);
  });
  it("robots bloquea todo → 0", async () => {
    expect((await run(BAD, "discoverability.robots_allows_crawl")).normalized).toBe(0);
  });
  it("canonical: 1 de 2 cross-host → 5", async () => {
    expect((await run(BAD, "discoverability.canonical_consistent")).normalized).toBe(5);
  });
  it("1 de 2 con noindex → 5", async () => {
    expect((await run(BAD, "discoverability.meta_robots_indexable")).normalized).toBe(5);
  });
  it("http: 1 de 2 en 2xx → 5", async () => {
    expect((await run(BAD, "discoverability.http_health")).normalized).toBe(5);
  });
  it("1 huérfana de 2 → penaliza", async () => {
    const m = await run(BAD, "discoverability.orphans_click_depth");
    expect(m.normalized).toBe(5); // 10 - (1/2*10) = 5
  });
});

describe("determinismo (mismo input ⇒ misma salida)", () => {
  it("dos corridas dan resultados idénticos", async () => {
    for (const ev of discoverabilityEvaluators) {
      const a = await ev.measure(GOOD);
      const b = await ev.measure(GOOD);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
