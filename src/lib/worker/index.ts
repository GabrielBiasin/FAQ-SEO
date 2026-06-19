import { claimNextJob, completeJob, failJob } from "../jobs";
import type { JobType, Json } from "@/types/database";
import { handleCrawlSite } from "./handlers/crawl-site";
import { handleAnalyzeTopics } from "./handlers/analyze-topics";
import { handleDiscoverQuestions } from "./handlers/discover-questions";

export interface JobContext {
  jobId: string;
  projectId: string;
  payload: Json;
}

export type JobHandler = (ctx: JobContext) => Promise<Json>;

/**
 * Handler registry. Each job type gets one handler.
 * Stubs return a placeholder result until the corresponding milestone lands.
 */
const handlers: Partial<Record<JobType, JobHandler>> = {
  crawl_site: handleCrawlSite,
  analyze_topics: handleAnalyzeTopics,
  discover_questions: handleDiscoverQuestions,
  // generate_answers:  filled in Milestone 6
  // verify_answers:    filled in Milestone 6
  // brand_audit:       filled in Milestone 7
  // run_eval:          filled in Milestone 9
  // citation_check:    filled in Milestone 10
};

export function registerHandler(type: JobType, handler: JobHandler) {
  handlers[type] = handler;
}

/**
 * Process the next queued job (optionally scoped to a project).
 * Returns a short status describing what happened — used by the worker route.
 */
export async function processNextJob(
  projectId?: string
): Promise<{ ran: boolean; jobId?: string; type?: JobType; ok?: boolean; error?: string }> {
  const job = await claimNextJob(projectId);
  if (!job) return { ran: false };

  const handler = handlers[job.type as JobType];
  if (!handler) {
    const msg = `No handler registered for job type "${job.type}" (not implemented yet)`;
    await failJob(job.id, job.attempts, msg);
    return { ran: true, jobId: job.id, type: job.type as JobType, ok: false, error: msg };
  }

  try {
    const result = await handler({
      jobId: job.id,
      projectId: job.project_id,
      payload: job.payload,
    });
    await completeJob(job.id, result);
    return { ran: true, jobId: job.id, type: job.type as JobType, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(job.id, job.attempts, message);
    return { ran: true, jobId: job.id, type: job.type as JobType, ok: false, error: message };
  }
}

/**
 * Drain the queue: keep processing until nothing is left or a cap is hit.
 */
export async function drainQueue(projectId?: string, maxJobs = 25) {
  const results = [];
  for (let i = 0; i < maxJobs; i++) {
    const r = await processNextJob(projectId);
    if (!r.ran) break;
    results.push(r);
  }
  return results;
}
