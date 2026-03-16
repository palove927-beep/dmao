import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const articleId = req.nextUrl.searchParams.get("article_id");
  const mode = req.nextUrl.searchParams.get("mode");

  // Return counts grouped by ticker
  if (mode === "counts") {
    const { data, error } = await getSupabase()
      .from("dmao_annotations")
      .select("ticker");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      counts[row.ticker] = (counts[row.ticker] || 0) + 1;
    }
    return NextResponse.json({ ok: true, counts });
  }

  let query = getSupabase()
    .from("dmao_annotations")
    .select("*, dmao_articles(id, title, created_at)")
    .order("created_at", { ascending: false });

  if (ticker) {
    query = query.eq("ticker", ticker);
  }
  if (articleId) {
    query = query.eq("article_id", articleId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, annotations: data });
}
