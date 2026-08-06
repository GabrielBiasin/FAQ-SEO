import { registerEvaluators } from "../registry";
import { discoverabilityEvaluators } from "./discoverability";
import { performanceEvaluators } from "./performance";
import { onpageEvaluators } from "./onpage";

// Registro central de señales. Importar este módulo carga el registry.
registerEvaluators(...discoverabilityEvaluators, ...performanceEvaluators, ...onpageEvaluators);

export { discoverabilityEvaluators, performanceEvaluators, onpageEvaluators };

// Sub-dimensiones que componen Readiness (para el roll-up del runner).
export const READINESS_SUBDIMENSIONS = ["discoverability", "performance", "onpage"] as const;
