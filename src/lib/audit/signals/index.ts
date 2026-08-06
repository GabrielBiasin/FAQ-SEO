import { registerEvaluators } from "../registry";
import { discoverabilityEvaluators } from "./discoverability";
import { performanceEvaluators } from "./performance";

// Registro central de señales. Importar este módulo carga el registry.
registerEvaluators(...discoverabilityEvaluators, ...performanceEvaluators);

export { discoverabilityEvaluators, performanceEvaluators };

// Sub-dimensiones que componen Readiness (para el roll-up del runner).
export const READINESS_SUBDIMENSIONS = ["discoverability", "performance"] as const;
