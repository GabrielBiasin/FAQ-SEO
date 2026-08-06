import { describe, it, expect } from "vitest";
import type { AuditContext, AuditPage } from "../types";
import { authorityEvaluators } from "./authority";

const byId = Object.fromEntries(authorityEvaluators.map((e) => [e.definition.id, e]));

function page(over: Partial<AuditPage> = {}): AuditPage {
  return {
    id: "x",
    url: "https://acme.test/",
    title: "t",
    httpStatus: 200,
    canonicalUrl: null,
    metaRobots: null,
    hreflang: [],
    headings: [],
    internalLinks: [],
    metaDescription: null,
    imgTotal: 0,
    imgWithAlt: 0,
    cleanText: "x",
    wordCount: 100,
    ...over,
  };
}
function ctx(pages: AuditPage[]): AuditContext {
  return { projectId: "p", rootUrl: "https://acme.test/", origin: "https://acme.test", domain: "acme.test", pages, robotsTxt: null, sitemaps: [] };
}
const run = (c: AuditContext, id: string) => byId[id].measure(c);

describe("authority proxy", () => {
  it("content_depth: mitad de páginas con ≥600 palabras → 5, estado estimated", async () => {
    const c = ctx([page({ wordCount: 800 }), page({ wordCount: 100 })]);
    const m = await run(c, "authority.content_depth");
    expect(m.normalized).toBe(5);
    expect(m.state).toBe("estimated");
    expect(m.confidence).toBe(0.5);
  });

  it("internal_linking: 15 enlaces/página → 10", async () => {
    const links = Array.from({ length: 15 }, (_, i) => `https://acme.test/${i}`);
    const c = ctx([page({ internalLinks: links })]);
    const m = await run(c, "authority.internal_linking");
    expect(m.normalized).toBe(10);
  });

  it("sin páginas → unavailable", async () => {
    const m = await run(ctx([]), "authority.content_depth");
    expect(m.normalized).toBeNull();
  });
});
