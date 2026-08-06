import { describe, it, expect } from "vitest";
import { computeDemandCoverage, tokenize, type DemandItem, type OfferPage } from "./coverage";

const pages: OfferPage[] = [
  {
    id: "p1",
    url: "https://acme.test/envios",
    title: "Cuánto tarda el envío de un pedido",
    headings: [{ tag: "h2", text: "Plazos de envío y entrega" }],
    cleanText: "Los envíos tardan entre 3 y 5 días hábiles según la zona.",
  },
  {
    id: "p2",
    url: "https://acme.test/garantia",
    title: "Garantía de productos",
    headings: [{ tag: "h2", text: "Cobertura de la garantía" }],
    cleanText:
      "La garantía cubre defectos de fabricación. Realizamos devoluciones y cambios dentro de los 30 días.",
  },
];

const demand: DemandItem[] = [
  { id: "q1", text: "¿Cuánto tarda el envío?", priority: 3 },
  { id: "q2", text: "¿Hacen devoluciones y cambios?", priority: 2 },
  { id: "q3", text: "¿Tienen financiación en cuotas?", priority: 5 },
];

describe("tokenize", () => {
  it("quita acentos, stopwords y tokens cortos", () => {
    const t = tokenize("¿Cuánto tarda el envío?");
    expect(t.has("tarda")).toBe(true);
    expect(t.has("envio")).toBe(true);
    expect(t.has("el")).toBe(false);
  });
});

describe("computeDemandCoverage", () => {
  const cov = computeDemandCoverage(demand, pages);

  it("query respondida en el título → covered", () => {
    const r = cov.rows.find((x) => x.demandId === "q1")!;
    expect(r.status).toBe("covered");
    expect(r.bestPageUrl).toBe("https://acme.test/envios");
  });

  it("query tocada solo en el cuerpo → partial", () => {
    const r = cov.rows.find((x) => x.demandId === "q2")!;
    expect(r.status).toBe("partial");
  });

  it("query sin cobertura → missing", () => {
    const r = cov.rows.find((x) => x.demandId === "q3")!;
    expect(r.status).toBe("missing");
  });

  it("resumen: 1 covered, 1 partial, 1 missing", () => {
    expect(cov.covered).toBe(1);
    expect(cov.partial).toBe(1);
    expect(cov.missing).toBe(1);
    expect(cov.total).toBe(3);
  });

  it("ordena missing de mayor prioridad primero", () => {
    expect(cov.rows[0].demandId).toBe("q3"); // missing, priority 5
  });

  it("score ponderado por prioridad (0..10)", () => {
    // pesos: q1=3(covered→1), q2=2(partial→.5), q3=5(missing→0)
    // weighted = (3*1 + 2*.5 + 5*0)/(3+2+5) = 4/10 = 0.4 → 4.0
    expect(cov.score).toBeCloseTo(4.0, 1);
  });

  it("sin demanda → score null", () => {
    expect(computeDemandCoverage([], pages).score).toBeNull();
  });
});
