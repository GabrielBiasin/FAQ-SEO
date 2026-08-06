import type { DimensionScore, SignalMeasurement, TopDimension } from "./types";
import { COVERAGE_MIN } from "./registry";

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
