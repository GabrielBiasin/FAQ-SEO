import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// DELETE /api/projects/:id/competitors/:cid — elimina un competidor (cascade).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  const { cid } = await params;
  const db = createServiceClient();
  const { error } = await db.from("competitors").delete().eq("id", cid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
