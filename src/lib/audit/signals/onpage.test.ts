import { describe, it, expect } from "vitest";
import type { AuditContext, AuditPage } from "../types";
import { onpageEvaluators } from "./onpage";

const byId = Object.fromEntries(onpageEvaluators.map((e) => [e.definition.id, e]));

function page(url: string, over: Partial<AuditPage> = {}): AuditPage {
  return {
    id: url,
    url,
    title: "Título único " + url,
    httpStatus: 200,
    canonicalUrl: url,
    metaRobots: null,
    hreflang: [],
    headings: [{ tag: "h1", text: "H1" }],
    internalLinks: [],
    metaDescription: "desc",
    imgTotal: 2,
    imgWithAlt: 2,
    cleanText: "x",
    wordCount: 1,
    ...over,
  };
}

function ctx(pages: AuditPage[]): AuditContext {
  return {
    projectId: "p",
    rootUrl: "https://acme.test/",
    origin: "https://acme.test",
    robotsTxt: null,
    sitemaps: [],
    pages,
  };
}

const run = (c: AuditContext, id: string) => byId[id].measure(c);

describe("onpage — fixture sano", () => {
  const GOOD = ctx([page("https://acme.test/"), page("https://acme.test/a")]);
  it("títulos presentes y únicos → 10", async () => {
    expect((await run(GOOD, "onpage.title_present_unique")).normalized).toBe(10);
  });
  it("un solo H1 → 10", async () => {
    expect((await run(GOOD, "onpage.single_h1")).normalized).toBe(10);
  });
  it("meta description presente → 10", async () => {
    expect((await run(GOOD, "onpage.meta_description")).normalized).toBe(10);
  });
  it("todas las imágenes con alt → 10", async () => {
    expect((await run(GOOD, "onpage.image_alt")).normalized).toBe(10);
  });
});

describe("onpage — fixture roto", () => {
  const BAD = ctx([
    page("https://acme.test/", { title: "Dup", metaDescription: "", headings: [], imgTotal: 2, imgWithAlt: 0 }),
    page("https://acme.test/a", { title: "Dup", metaDescription: null, headings: [{ tag: "h1", text: "a" }, { tag: "h1", text: "b" }], imgTotal: 0, imgWithAlt: 0 }),
  ]);
  it("títulos duplicados → 0", async () => {
    expect((await run(BAD, "onpage.title_present_unique")).normalized).toBe(0);
  });
  it("sin H1 y H1 múltiple → 0", async () => {
    expect((await run(BAD, "onpage.single_h1")).normalized).toBe(0);
  });
  it("sin meta description → 0", async () => {
    expect((await run(BAD, "onpage.meta_description")).normalized).toBe(0);
  });
  it("imágenes sin alt → 0", async () => {
    expect((await run(BAD, "onpage.image_alt")).normalized).toBe(0);
  });
});

describe("onpage — casos límite", () => {
  it("sin imágenes → unavailable (no ensucia)", async () => {
    const c = ctx([page("https://acme.test/", { imgTotal: 0, imgWithAlt: 0 })]);
    const m = await run(c, "onpage.image_alt");
    expect(m.normalized).toBeNull();
    expect(m.state).toBe("unavailable");
  });
  it("sin páginas → unavailable", async () => {
    const m = await run(ctx([]), "onpage.title_present_unique");
    expect(m.normalized).toBeNull();
  });
});
