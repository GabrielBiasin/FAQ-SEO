import { describe, it, expect } from "vitest";
import { buildRecommendations, type RecoMeasurement } from "./recommendations";
import type { CoverageSummary } from "./coverage";

const m = (signalId: string, normalized: number | null, urls: string[] = []): RecoMeasurement => ({
  signalId,
  normalized,
  state: normalized === null ? "unavailable" : "measured",
  evidence: urls.map((u) => ({ key: "url", value: u, url: u })),
});

const coverage: CoverageSummary = {
  total: 3,
  covered: 1,
  partial: 1,
  missing: 1,
  coverageRate: 0.33,
  weightedCoverageRate: 0.4,
  score: 4,
  rows: [
    { demandId: "q3", text: "financiación en cuotas", priority: 5, intent: null, topic: null, status: "missing", headingOverlap: 0, bodyOverlap: 0, bestPageId: null, bestPageUrl: null },
    { demandId: "q2", text: "devoluciones", priority: 2, intent: null, topic: null, status: "partial", headingOverlap: 0, bodyOverlap: 0.6, bestPageId: "p2", bestPageUrl: "u" },
    { demandId: "q1", text: "envío", priority: 3, intent: null, topic: null, status: "covered", headingOverlap: 1, bodyOverlap: 1, bestPageId: "p1", bestPageUrl: "u" },
  ],
};

describe("buildRecommendations", () => {
  it("genera recomendación para señal con score bajo, con URLs de evidencia", () => {
    const recs = buildRecommendations({
      measurements: [m("performance.lcp", 1.5, ["https://a.test/x"])],
      coverage: null,
    });
    const r = recs.find((x) => x.id === "signal:performance.lcp")!;
    expect(r).toBeTruthy();
    expect(r.severity).toBe("high");
    expect(r.urls).toContain("https://a.test/x");
  });

  it("ignora señales con score alto o no medibles", () => {
    const recs = buildRecommendations({
      measurements: [m("performance.lcp", 8), m("performance.inp", null)],
      coverage: null,
    });
    expect(recs).toHaveLength(0);
  });

  it("genera gaps de cobertura (missing high + partial)", () => {
    const recs = buildRecommendations({ measurements: [], coverage });
    expect(recs.find((r) => r.id === "coverage:missing")?.severity).toBe("high");
    expect(recs.find((r) => r.id === "coverage:partial")).toBeTruthy();
  });

  it("ordena high antes que medium", () => {
    const recs = buildRecommendations({
      measurements: [m("onpage.meta_description", 5)], // medium
      coverage,
    });
    expect(recs[0].severity).toBe("high");
  });
});
