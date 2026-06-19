import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import type { Database, FaqStatus } from "@/types/database";

type FaqUpdate = Database["public"]["Tables"]["faqs"]["Update"];

const VALID_STATUS: FaqStatus[] = ["draft", "needs_review", "approved", "rejected"];

// PATCH — approve / reject / edit answer text
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  const { fid } = await params;
  const body = await req.json().catch(() => ({}));

  const update: FaqUpdate = {};
  if (typeof body.answer_text === "string") update.answer_text = body.answer_text;
  if (typeof body.status === "string" && VALID_STATUS.includes(body.status)) {
    update.status = body.status;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("faqs")
    .update(update)
    .eq("id", fid)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ faq: data });
}
