import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { sectorTiers, allSectorStocks } from "@/lib/sector-groups";
import { RANGES, type RangeKey } from "@/lib/sector-range";

export const dynamic = "force-dynamic";

// 往回推 n 個月，日數超過目標月份長度時夾到月底。
// 直接用 setMonth(-1) 會溢位：3/31 會變成 3/3（2/31 進位），
// 「一個月」就縮成三天。
function monthsAgo(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const r = new Date(d);
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() - n);
  const daysInMonth = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, daysInMonth));
  return r;
}

function baseDateFor(range: RangeKey, now = new Date()): string {
  const d = new Date(now);
  if (range === "1w") d.setUTCDate(d.getUTCDate() - 7);
  else if (range === "1m") return monthsAgo(d, 1).toISOString().slice(0, 10);
  else if (range === "3m") return monthsAgo(d, 3).toISOString().slice(0, 10);
  else if (range === "6m") return monthsAgo(d, 6).toISOString().slice(0, 10);
  else if (range === "1y") return monthsAgo(d, 12).toISOString().slice(0, 10);
  else if (range === "ytd") return `${d.getUTCFullYear()}-01-01`;
  return d.toISOString().slice(0, 10);
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type PriceRow = { ticker: string; date: string; close: number | string };

// 只取兩個窗口的收盤價，而不是整段區間：起算日往後、以及最近這幾天。
// 一年區間全撈是四萬多列，這樣壓到約兩千列，聚合結果完全相同。
const WINDOW_DAYS = 14;

const allTickers = allSectorStocks.map((s) => s.ticker);

// 代碼分批帶入 in()，避免 181 檔一次塞進 query string 讓 URL 過長
// （/api/annotations 的 mates 查詢也是同樣理由分批）
const TICKER_CHUNK = 100;

async function readWindow(from: string, to: string): Promise<{ rows: PriceRow[]; error: string | null }> {
  const rows: PriceRow[] = [];
  for (let i = 0; i < allTickers.length; i += TICKER_CHUNK) {
    const ids = allTickers.slice(i, i + TICKER_CHUNK);
    const res = await fetchAllRows<PriceRow>((offset, last) =>
      getSupabase()
        .from("dmao_stock_prices")
        .select("ticker, date, close")
        .in("ticker", ids)
        .gte("date", from)
        .lte("date", to)
        .order("ticker", { ascending: true })
        .order("date", { ascending: true })
        .range(offset, last)
    );
    if (res.error) return { rows, error: res.error };
    for (const r of res.rows) rows.push(r);
  }
  return { rows, error: null };
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get("range");
  const range: RangeKey =
    RANGES.find((r) => r.key === rangeParam)?.key ?? "1m";

  const baseDate = baseDateFor(range);
  const today = new Date().toISOString().slice(0, 10);

  const [baseRes, latestRes] = await Promise.all([
    // 起算日當天可能是假日，往後開一個窗口找第一個有交易的日子
    readWindow(baseDate, shift(baseDate, WINDOW_DAYS)),
    readWindow(shift(today, -WINDOW_DAYS), today),
  ]);

  const error = baseRes.error ?? latestRes.error;
  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  // 起算價＝窗口內最早一筆；最新價＝窗口內最晚一筆
  const pick = (rows: PriceRow[], keepEarliest: boolean) => {
    const out = new Map<string, { date: string; close: number }>();
    for (const r of rows) {
      const close = Number(r.close);
      if (!(close > 0)) continue;
      const cur = out.get(r.ticker);
      const better = !cur || (keepEarliest ? r.date < cur.date : r.date > cur.date);
      if (better) out.set(r.ticker, { date: r.date, close });
    }
    return out;
  };

  const basePrice = pick(baseRes.rows, true);
  const lastPrice = pick(latestRes.rows, false);

  const missing: { ticker: string; name: string }[] = [];

  const tiers = sectorTiers.map((tier) => ({
    tier: tier.tier,
    groups: tier.groups.map((g) => {
      const stocks = g.stocks.map((s) => {
        const b = basePrice.get(s.ticker);
        const l = lastPrice.get(s.ticker);
        const changePercent = b && l ? ((l.close - b.close) / b.close) * 100 : null;
        if (changePercent === null) missing.push({ ticker: s.ticker, name: s.name });
        return {
          ticker: s.ticker,
          name: s.name,
          market: s.market ?? null,
          basePrice: b?.close ?? null,
          baseDate: b?.date ?? null,
          price: l?.close ?? null,
          priceDate: l?.date ?? null,
          changePercent,
        };
      });

      // 族群漲幅＝成分股漲幅的等權平均（不按市值加權）
      const covered = stocks.filter((s) => s.changePercent !== null);
      const changePercent =
        covered.length > 0
          ? covered.reduce((sum, s) => sum + s.changePercent!, 0) / covered.length
          : null;

      return {
        id: g.id,
        label: g.label,
        tier: tier.tier,
        changePercent,
        total: stocks.length,
        covered: covered.length,
        stocks,
      };
    }),
  }));

  const dates = [...lastPrice.values()].map((v) => v.date).sort();

  return NextResponse.json({
    ok: true,
    range,
    baseDate,
    asOf: dates[dates.length - 1] ?? null,
    tiers,
    missing,
  });
}
