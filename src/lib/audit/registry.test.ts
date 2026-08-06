import { describe, it, expect } from "vitest";
import { computeRegistryVersion, aggregateDimension } from "./index";

describe("computeRegistryVersion", () => {
  const base = [
    { id: "discoverability.sitemap_valid", version: 1 },
    { id: "discoverability.robots_allows_crawl", version: 1 },
  ];

  it("es estable frente al reordenamiento", () => {
    const a = computeRegistryVersion(base);
    const b = computeRegistryVersion([...base].reverse());
    expect(a).toBe(b);
  });

  it("cambia si se bumpea la version de una señal", () => {
    const a = computeRegistryVersion(base);
    const bumped = base.map((d, i) => (i === 0 ? { ...d, version: 2 } : d));
    expect(computeRegistryVersion(bumped)).not.toBe(a);
  });

  it("cambia si se agrega o quita una señal", () => {
    const a = computeRegistryVersion(base);
    const added = [...base, { id: "discoverability.canonical_consistent", version: 1 }];
    expect(computeRegistryVersion(added)).not.toBe(a);
    expect(computeRegistryVersion([base[0]])).not.toBe(a);
  });
});

describe("aggregateDimension (regla de cobertura)", () => {
  const mk = (id: string, normalized: number | null) => ({
    signalId: id,
    signalVersion: 1,
    topDimension: "readiness" as const,
    subDimension: "discoverability",
    type: "deterministic" as const,
    state: (normalized === null ? "unavailable" : "measured") as
      | "measured"
      | "unavailable",
    raw: {},
    normalized,
    confidence: normalized === null ? null : 1,
    evidence: [],
  });

  it("score = null cuando la cobertura < mínimo (0.6)", () => {
    // 1 de 4 medidas = 0.25 cobertura
    const d = aggregateDimension({
      topDimension: "readiness",
      subDimension: "discoverability",
      totalSignals: 4,
      measurements: [mk("a", 10), mk("b", null), mk("c", null), mk("d", null)],
      weights: {},
    });
    expect(d.score).toBeNull();
    expect(d.state).toBe("unavailable");
    expect(d.coverage).toBeCloseTo(0.25, 3);
  });

  it("las señales no medibles no arrastran el puntaje", () => {
    // 3 de 4 medidas (0.75 >= 0.6); las medidas valen 10 → score 10, no penalizado por la faltante
    const d = aggregateDimension({
      topDimension: "readiness",
      subDimension: "discoverability",
      totalSignals: 4,
      measurements: [mk("a", 10), mk("b", 10), mk("c", 10), mk("d", null)],
      weights: {},
    });
    expect(d.score).toBe(10);
    expect(d.state).toBe("measured");
    expect(d.measuredSignals).toBe(3);
  });
});
