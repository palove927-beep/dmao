import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { categories } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabase();
  const allTickers = categories.flatMap((c) => c.stocks.map((s) => s.ticker));

  const results: { ticker: string; name: string; count: number; minDate: string | null; maxDate: string | null }[] = [];

  for (const ticker of allTickers) {
    const name = categories.flatMap((c) => c.stocks).find((s) => s.ticker === ticker)?.name ?? ticker;

    const { count } = await sb
      .from("dmao_stock_prices")
      .select("*", { count: "exact", head: true })
      .eq("ticker", ticker);

    const { data: minMax } = await sb
      .from("dmao_stock_prices")
      .select("date")
      .eq("ticker", ticker)
      .order("date", { ascending: true })
      .limit(1);

    const { data: maxData } = await sb
      .from("dmao_stock_prices")
      .select("date")
      .eq("ticker", ticker)
      .order("date", { ascending: false })
      .limit(1);

    results.push({
      ticker,
      name,
      count: count ?? 0,
      minDate: minMax?.[0]?.date ?? null,
      maxDate: maxData?.[0]?.date ?? null,
    });
  }

  results.sort((a, b) => a.count - b.count);

  const median = results.length > 0 ? results[Math.floor(results.length / 2)].count : 0;

  return NextResponse.json({
    total: results.length,
    median,
    stocks: results,
    anomalies: results.filter((r) => Math.abs(r.count - median) > 20 || r.count === 0),
  });
}
