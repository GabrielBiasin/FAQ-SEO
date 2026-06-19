import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/worker";

// Allow long-running processing on Vercel (jobs do crawl + AI work).
export const maxDuration = 300;

/**
 * POST /api/worker — drains the job queue.
 * The UI pings this after enqueuing work (fast feedback). Optional body:
 * { project_id?: string } to scope draining to one project.
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

/**
 * GET /api/worker — invoked by Vercel Cron to drain the global queue.
 * If CRON_SECRET is set, the request must carry `Authorization: Bearer <secret>`
 * (Vercel Cron sends this automatically). Without the env var, the endpoint is
 * open (fine for Phase 1 single-user).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const results = await drainQueue();
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
