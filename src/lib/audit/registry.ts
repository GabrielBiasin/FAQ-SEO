import { createHash } from "crypto";
import type { Evaluator, SignalDefinition } from "./types";

/**
 * Versión global de la metodología. Se bumpea manualmente cuando cambia un
 * criterio transversal (pesos, umbral de cobertura, forma de agregación).
 */
export const METHODOLOGY_VERSION = "2026.1";

/**
 * Cobertura mínima para calcular el score de una dimensión. Si se mide menos
 * que esto, el score queda en null (cobertura insuficiente) — falta de datos
 * NO se convierte en un puntaje bajo.
 */
export const COVERAGE_MIN = 0.6;

// Registro de evaluadores. Se llena importando los módulos de señales.
const evaluators: Evaluator[] = [];

export function registerEvaluators(...items: Evaluator[]): void {
  for (const e of items) evaluators.push(e);
}

export function allEvaluators(): readonly Evaluator[] {
  return evaluators;
}

export function evaluatorsForSubDimension(subDimension: string): Evaluator[] {
  return evaluators.filter((e) => e.definition.subDimension === subDimension);
}

/**
 * Hash estable de un conjunto de definiciones: depende solo de (id, version),
 * ordenados. Cambia únicamente si se agrega/quita una señal o se bumpea su
 * version — no por reordenar imports. Pura y testeable.
 */
export function computeRegistryVersion(
  defs: { id: string; version: number }[]
): string {
  const fingerprint = defs
    .map((d) => `${d.id}@${d.version}`)
    .sort()
    .join("|");
  return "sig-" + createHash("sha1").update(fingerprint).digest("hex").slice(0, 12);
}

/** Versión del registry actualmente cargado. Sirve para estampar cada snapshot. */
export function signalRegistryVersion(): string {
  return computeRegistryVersion(evaluators.map((e) => e.definition));
}

/** Definiciones expuestas (para docs / UI). */
export function allDefinitions(): SignalDefinition[] {
  return evaluators.map((e) => e.definition);
}
