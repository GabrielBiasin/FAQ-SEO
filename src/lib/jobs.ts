import { createServiceClient } from "./supabase";
import type { JobType, Json } from "@/types/database";

const MAX_ATTEMPTS = 3;

/**
 * Enqueue a job. Returns the created job row.
 */
export async function enqueueJob(
  projectId: string,
  type: JobType,
  payload: Json = {}
) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("jobs")
    .insert({
      project_id: projectId,
      type,
      status: "queued",
      payload,
      result: null,
      error: null,
      attempts: 0,
    })
    .select()
    .single();
  if (error) throw new Error(`enqueueJob failed: ${error.message}`);
  return data;
}

/**
 * Claim the oldest queued job (optionally filtered by project) and mark it
 * running. Returns null if nothing is queued.
 *
 * Note: Phase 1 runs a single worker, so a naive claim is fine. For Phase 2
 * with concurrent workers, replace with a SELECT ... FOR UPDATE SKIP LOCKED
 * RPC to avoid double-claiming.
 */
// A "running" job older than this is treated as orphaned (its serverless
// invocation timed out) and may be reclaimed.
const STALE_RUNNING_MS = 3 * 60 * 1000;

export async function claimNextJob(projectId?: string) {
  const db = createServiceClient();

  // Prefer the oldest queued job; if none, reclaim a stale "running" one.
  const pick = async (status: "queued" | "running", staleBefore?: string) => {
    let q = db
      .from("jobs")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: true })
      .limit(1);
    if (projectId) q = q.eq("project_id", projectId);
    if (staleBefore) q = q.lt("created_at", staleBefore);
    const { data, error } = await q;
    if (error) throw new Error(`claimNextJob failed: ${error.message}`);
    return data?.[0] ?? null;
  };

  let job = await pick("queued");
  let fromStatus: "queued" | "running" = "queued";
  if (!job) {
    job = await pick("running", new Date(Date.now() - STALE_RUNNING_MS).toISOString());
    fromStatus = "running";
  }
  if (!job) return null;

  const { data: claimed, error: upErr } = await db
    .from("jobs")
    .update({ status: "running", attempts: job.attempts + 1 })
    .eq("id", job.id)
    .eq("status", fromStatus) // optimistic guard against double-claim
    .select()
    .single();
  if (upErr) {
    // Someone else claimed it; skip this round.
    return null;
  }
  return claimed;
}

export async function completeJob(jobId: string, result: Json) {
  const db = createServiceClient();
  const { error } = await db
    .from("jobs")
    .update({ status: "done", result, error: null })
    .eq("id", jobId);
  if (error) throw new Error(`completeJob failed: ${error.message}`);
}

/**
 * Mark a job failed. Re-queues it if attempts remain, otherwise sets error.
 */
export async function failJob(jobId: string, attempts: number, message: string) {
  const db = createServiceClient();
  const status = attempts >= MAX_ATTEMPTS ? "error" : "queued";
  const { error } = await db
    .from("jobs")
    .update({ status, error: message })
    .eq("id", jobId);
  if (error) throw new Error(`failJob failed: ${error.message}`);
}
