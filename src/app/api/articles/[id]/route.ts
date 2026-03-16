import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await getSupabase()
    .from("articles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "找不到文章" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, article: data });
}
