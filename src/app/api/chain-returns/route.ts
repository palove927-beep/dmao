import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { RANGES, baseDateFor, type RangeKey } from "@/lib/sector-range";
import { isStale } from "@/lib/market-day";

export const dynamic = "force-dynamic";

// 指定個股的區間報酬（產業鏈比較頁用）。
// 與 /api/sector-returns 同樣讀 dmao_stock_prices，但只要起算價與最新價、不畫走勢，
// 所以只讀起算日與今天往回各 14 天兩個窗口。
const WINDOW_DAYS = 14;
const MAX_TICKERS = 100;

type PriceRow = { ticker: string; date: string; close: number | string };

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function readRange(tickers: string[], from: string, to: string) {
  return fetchAllRows<PriceRow>((offset, last) =>
    getSupabase()
      .from("dmao_stock_prices")
      .select("ticker, date, close")
      .in("ticker", tickers)
      .gte("date", from)
      .lte("date", to)
      .order("ticker", { ascending: true })
      .order("date", { ascending: true })
      .range(offset, last)
  );
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get("range");
  const range: RangeKey = RANGES.find((r) => r.key === rangeParam)?.key ?? "1m";
  const tickers = [
    ...new Set(
      (req.nextUrl.searchParams.get("tickers") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d{4,6}$/.test(s)),
    ),
  ].slice(0, MAX_TICKERS);

  if (tickers.length === 0) {
    return NextResponse.json({ ok: true, range, returns: {}, stale: [] });
  }

  const baseDate = baseDateFor(range);
  const today = new Date().toISOString().slice(0, 10);
  const [base, latest] = await Promise.all([
    readRange(tickers, baseDate, shift(baseDate, WINDOW_DAYS)),
    readRange(tickers, shift(today, -WINDOW_DAYS), today),
  ]);
  const err = base.error ?? latest.error;
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });

  // 起算價＝起算窗口內第一筆；最新價＝最近窗口內最後一筆
  const basePrice = new Map<string, { date: string; close: number }>();
  for (const r of base.rows) {
    const close = Number(r.close);
    if (!(close > 0)) continue;
    const b = basePrice.get(r.ticker);
    if (!b || r.date < b.date) basePrice.set(r.ticker, { date: r.date, close });
  }
  const lastPrice = new Map<string, { date: string; close: number }>();
  for (const r of latest.rows) {
    const close = Number(r.close);
    if (!(close > 0)) continue;
    const l = lastPrice.get(r.ticker);
    if (!l || r.date > l.date) lastPrice.set(r.ticker, { date: r.date, close });
  }

  const returns: Record<string, { baseDate: string | null; priceDate: string | null; changePercent: number | null }> = {};
  const stale: string[] = [];
  for (const t of tickers) {
    const b = basePrice.get(t);
    const l = lastPrice.get(t);
    returns[t] = {
      baseDate: b?.date ?? null,
      priceDate: l?.date ?? null,
      changePercent: b && l ? ((l.close - b.close) / b.close) * 100 : null,
    };
    // 沒有資料或最新一筆已落後的，交給前端逐檔呼叫 /api/stock-history 補
    if (!l || isStale(l.date) || !b) stale.push(t);
  }

  return NextResponse.json({ ok: true, range, baseDate, returns, stale });
}
