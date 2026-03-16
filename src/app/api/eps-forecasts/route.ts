import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const articleId = req.nextUrl.searchParams.get("article_id");

  let query = getSupabase()
    .from("dmao_eps_forecasts")
    .select("*, dmao_articles(id, title, article_date)")
    .order("forecast_year", { ascending: true });

  if (ticker) query = query.eq("ticker", ticker);
  if (articleId) query = query.eq("article_id", articleId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, forecasts: data });
}
