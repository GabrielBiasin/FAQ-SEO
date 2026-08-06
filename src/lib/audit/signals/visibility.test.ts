import { describe, it, expect } from "vitest";
import type { AuditContext } from "../types";
import { visibilityEvaluators } from "./visibility";

const byId = Object.fromEntries(visibilityEvaluators.map((e) => [e.definition.id, e]));

function ctx(over: Partial<AuditContext> = {}): AuditContext {
  return {
    projectId: "p",
    rootUrl: "https://acme.test/",
    origin: "https://acme.test",
    domain: "acme.test",
    pages: [],
    robotsTxt: null,
    sitemaps: [],
    ...over,
  };
}

const run = (c: AuditContext, id: string) => byId[id].measure(c);

describe("visibility — sin SERP", () => {
  it("serp undefined → unavailable", async () => {
    const m = await run(ctx(), "visibility.serp_coverage");
    expect(m.normalized).toBeNull();
    expect(m.state).toBe("unavailable");
  });
});

describe("visibility — con SERP", () => {
  const c = ctx({
    serp: [
      { query: "q1", priority: 3, organic: [{ position: 2, domain: "acme.test", url: "u" }, { position: 1, domain: "otro.test", url: "u" }] },
      { query: "q2", priority: 1, organic: [{ position: 1, domain: "otro.test", url: "u" }] },
    ],
  });

  it("cobertura: aparece en 1 de 2 queries (ponderado por prioridad)", async () => {
    const m = await run(c, "visibility.serp_coverage");
    // presente en q1 (w3) de (w3+w1) = 3/4 = 0.75 → 7.5
    expect(m.normalized).toBeCloseTo(7.5, 1);
    expect(m.state).toBe("measured");
  });

  it("posición: media 2 → score 9", async () => {
    const m = await run(c, "visibility.serp_avg_position");
    // aparece solo en q1 en pos 2 → 11-2 = 9
    expect(m.normalized).toBe(9);
  });

  it("dominio nunca aparece → posición score 0 (medido)", async () => {
    const c2 = ctx({
      serp: [{ query: "q", priority: 1, organic: [{ position: 1, domain: "rival.test", url: "u" }] }],
    });
    const m = await run(c2, "visibility.serp_avg_position");
    expect(m.normalized).toBe(0);
    expect(m.state).toBe("measured");
  });
});
