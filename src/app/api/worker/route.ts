import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { drainQueue } from "@/lib/worker";
import { createServiceClient } from "@/lib/supabase";

// Allow long-running processing on Vercel (jobs do crawl + AI work).
export const maxDuration = 300;

/**
 * If queued jobs remain after this invocation's drain, trigger another worker
 * invocation so the queue self-drains to completion — independent of the
 * (daily, on Hobby) cron or the UI. Each invocation is short (drain budget),
 * and the next one is a fresh function, so nothing exceeds the timeout.
 */
async function chainIfPending(origin: string) {
  const db = createServiceClient();
  const { count } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");
  if (!count) return;
  // Run the self-trigger after the response is sent.
  after(async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.CRON_SECRET) headers["x-worker-chain"] = process.env.CRON_SECRET;
      await fetch(`${origin}/api/worker`, { method: "POST", headers, body: "{}" });
    } catch {
      /* best effort */
    }
  });
}

/**
 * POST /api/worker — drains the job queue.
 * Optional body: { project_id?: string } to scope draining to one project.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId: string | undefined = body?.project_id;
  try {
    const results = await drainQueue(projectId);
    await chainIfPending(req.nextUrl.origin);
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/worker — invoked by Vercel Cron to drain the global queue.
 * If CRON_SECRET is set, the request must carry `Authorization: Bearer <secret>`
 * (Vercel Cron sends this automatically).
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
    await chainIfPending(req.nextUrl.origin);
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
