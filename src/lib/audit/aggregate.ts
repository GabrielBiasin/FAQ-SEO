import type { DimensionScore, SignalMeasurement, TopDimension } from "./types";
import { COVERAGE_MIN } from "./registry";

/**
 * Roll-up de una dimensión top (ej. Readiness) a partir de sus sub-dimensiones.
 * Promedia los scores de las sub-dimensiones que tienen score (!= null).
 * coverage = sub-dimensiones con score / total de sub-dimensiones esperadas.
 * Si coverage < COVERAGE_MIN → score null (state unavailable).
 */
export function aggregateTopDimension(input: {
  topDimension: TopDimension;
  expectedSubDimensions: number;
  subScores: DimensionScore[];
}): DimensionScore {
  const { topDimension, expectedSubDimensions, subScores } = input;
  const scored = subScores.filter((s) => s.score !== null);
  const coverage = expectedSubDimensions > 0 ? scored.length / expectedSubDimensions : 0;

  if (scored.length === 0 || coverage < COVERAGE_MIN) {
    return {
      topDimension,
      subDimension: null,
      score: null,
      state: "unavailable",
      coverage: Number(coverage.toFixed(3)),
      confidence: null,
      measuredSignals: scored.reduce((n, s) => n + s.measuredSignals, 0),
      totalSignals: subScores.reduce((n, s) => n + s.totalSignals, 0),
    };
  }
  const avg = scored.reduce((a, s) => a + (s.score as number), 0) / scored.length;
  const confs = scored.map((s) => s.confidence).filter((c): c is number => c !== null);
  return {
    topDimension,
    subDimension: null,
    score: Number(avg.toFixed(2)),
    state: "measured",
    coverage: Number(coverage.toFixed(3)),
    confidence: confs.length ? Number((confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3)) : null,
    measuredSignals: scored.reduce((n, s) => n + s.measuredSignals, 0),
    totalSignals: subScores.reduce((n, s) => n + s.totalSignals, 0),
  };
}

/**
 * Agrega las mediciones de una sub-dimensión en un DimensionScore.
 *
 * Reglas:
 * - Solo cuentan como "medidas" las que tienen `normalized !== null`
 *   (estados unavailable/failed no arrastran el puntaje).
 * - coverage = medidas / totalSignals (señales definidas para la sub-dimensión).
 * - Si coverage < COVERAGE_MIN → score = null, state = "unavailable"
 *   (falta de datos no se convierte en un puntaje bajo).
 * - score = promedio ponderado por `weight` de las medidas.
 */
export function aggregateDimension(input: {
  topDimension: TopDimension;
  subDimension: string;
  totalSignals: number;
  measurements: SignalMeasurement[];
  weights: Record<string, number>; // signalId -> weight
}): DimensionScore {
  const { topDimension, subDimension, totalSignals, measurements, weights } = input;

  const measured = measurements.filter((m) => m.normalized !== null);
  const measuredCount = measured.length;
  const coverage = totalSignals > 0 ? measuredCount / totalSignals : 0;

  if (measuredCount === 0 || coverage < COVERAGE_MIN) {
    return {
      topDimension,
      subDimension,
      score: null,
      state: "unavailable",
      coverage: Number(coverage.toFixed(3)),
      confidence: null,
      measuredSignals: measuredCount,
      totalSignals,
    };
  }

  let weightSum = 0;
  let weighted = 0;
  for (const m of measured) {
    const w = weights[m.signalId] ?? 1;
    weightSum += w;
    weighted += w * (m.normalized as number);
  }
  const score = weightSum > 0 ? weighted / weightSum : null;

  const confs = measured
    .map((m) => m.confidence)
    .filter((c): c is number => c !== null && Number.isFinite(c));
  const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;

  return {
    topDimension,
    subDimension,
    score: score === null ? null : Number(score.toFixed(2)),
    state: "measured",
    coverage: Number(coverage.toFixed(3)),
    confidence: confidence === null ? null : Number(confidence.toFixed(3)),
    measuredSignals: measuredCount,
    totalSignals,
  };
}
