import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const articleId = req.nextUrl.searchParams.get("article_id");
  const forecastYear = req.nextUrl.searchParams.get("forecast_year");

  let query = getSupabase()
    .from("dmao_eps_forecasts")
    .select("*, dmao_articles(id, title, article_date)")
    .order("created_at", { ascending: false })
    .order("forecast_year", { ascending: true });

  if (ticker) query = query.eq("ticker", ticker);
  if (articleId) query = query.eq("article_id", articleId);
  if (forecastYear) query = query.eq("forecast_year", Number(forecastYear));

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // latest=1: keep only the most recent forecast per ticker
  const latest = req.nextUrl.searchParams.get("latest");
  if (latest === "1" && data) {
    const seen = new Set<string>();
    const filtered = data.filter((f: { ticker: string }) => {
      if (seen.has(f.ticker)) return false;
      seen.add(f.ticker);
      return true;
    });
    return NextResponse.json({ ok: true, forecasts: filtered });
  }

  return NextResponse.json({ ok: true, forecasts: data });
}
