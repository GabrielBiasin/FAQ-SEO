import { createServiceClient } from "@/lib/supabase";
import { auditBrand } from "@/lib/ai/brand";
import type { JobContext } from "../index";
import type { Json } from "@/types/database";

/**
 * brand_audit handler.
 * Payload: { audit_id }. Runs web-search brand-presence analysis and stores
 * findings/gaps/summary on the brand_audits row.
 */
export async function handleBrandAudit(ctx: JobContext): Promise<Json> {
  const db = createServiceClient();
  const { audit_id } = (ctx.payload ?? {}) as { audit_id?: string };
  if (!audit_id) throw new Error("brand_audit: payload.audit_id requerido");

  const { data: project, error } = await db
    .from("projects")
    .select("name, domain, topic_summary")
    .eq("id", ctx.projectId)
    .single();
  if (error || !project) throw new Error("brand_audit: proyecto no encontrado");

  await db.from("brand_audits").update({ status: "running" }).eq("id", audit_id);

  try {
    const result = await auditBrand({
      name: project.name,
      domain: project.domain,
      topicSummary: project.topic_summary,
    });

    await db
      .from("brand_audits")
      .update({
        status: "done",
        findings: result.findings as unknown as Json,
        gaps: result.gaps as unknown as Json,
        summary: result.summary,
      })
      .eq("id", audit_id);

    return {
      findings: result.findings.length,
      gaps: result.gaps.length,
      citations: result.findings.filter((f) => f.is_citation).length,
    } as Json;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("brand_audits").update({ status: "error", summary: message }).eq("id", audit_id);
    throw err;
  }
}
