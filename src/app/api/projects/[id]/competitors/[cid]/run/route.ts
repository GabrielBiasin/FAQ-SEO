import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs";

// POST /api/projects/:id/competitors/:cid/run — encola crawl+auditoría del competidor.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  const { id, cid } = await params;
  const db = createServiceClient();
  await db.from("competitors").update({ status: "queued", error: null }).eq("id", cid);
  const job = await enqueueJob(id, "run_competitor", { competitor_id: cid });
  return NextResponse.json({ job }, { status: 201 });
}
