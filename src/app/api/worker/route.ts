import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/worker";

// Allow long-running processing on Vercel (jobs do crawl + AI work).
export const maxDuration = 300;

/**
 * POST /api/worker — drains the job queue.
 * In Phase 1 the UI pings this after enqueuing work; in Phase 2 this can be
 * driven by a Vercel Cron or an external scheduler.
 *
 * Optional body: { project_id?: string } to scope draining to one project.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId: string | undefined = body?.project_id;
  try {
    const results = await drainQueue(projectId);
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
