import { registerEvaluators } from "../registry";
import type { TopDimension } from "../types";
import { discoverabilityEvaluators } from "./discoverability";
import { performanceEvaluators } from "./performance";
import { onpageEvaluators } from "./onpage";
import { authorityEvaluators } from "./authority";
import { visibilityEvaluators } from "./visibility";

// Registro central de señales. Importar este módulo carga el registry.
registerEvaluators(
  ...discoverabilityEvaluators,
  ...performanceEvaluators,
  ...onpageEvaluators,
  ...authorityEvaluators,
  ...visibilityEvaluators
);

export {
  discoverabilityEvaluators,
  performanceEvaluators,
  onpageEvaluators,
  authorityEvaluators,
  visibilityEvaluators,
};

// Sub-dimensiones que componen Readiness (para el roll-up del runner).
export const READINESS_SUBDIMENSIONS = ["discoverability", "performance", "onpage"] as const;

// Mapa completo dimensión-top → sub-dimensiones (para computar todas).
export const SUBDIMENSIONS_BY_TOP: Record<TopDimension, string[]> = {
  readiness: [...READINESS_SUBDIMENSIONS],
  authority: ["onsite_proxy"],
  visibility: ["organic"],
};
