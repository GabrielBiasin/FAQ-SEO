import { runAudit } from "@/lib/audit/runner";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

/**
 * run_audit handler (P0). Corre la auditoría determinista (Discoverability) y
 * persiste un snapshot inmutable. Payload: {} (usa el último crawl del proyecto).
 */
export async function handleRunAudit(ctx: JobContext): Promise<Json> {
  const result = await runAudit(ctx.projectId);
  return { snapshot_id: result.snapshotId, measured_signals: result.measured } as Json;
}
