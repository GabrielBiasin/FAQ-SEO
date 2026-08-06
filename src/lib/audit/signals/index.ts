import { registerEvaluators } from "../registry";
import { discoverabilityEvaluators } from "./discoverability";

// Registro central de señales. Importar este módulo carga el registry.
registerEvaluators(...discoverabilityEvaluators);

export { discoverabilityEvaluators };
