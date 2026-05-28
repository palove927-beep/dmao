import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/lib/stock-list";

const nameMap = new Map(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

type PriceRow = { date: string; close: number };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// --- TWSE monthly API (main-board) ---
function parseRocRows(rows: string[][]): PriceRow[] {
  return rows.flatMap((row) => {
    const parts = row[0].split("/");
    if (parts.length !== 3) return [];
    const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1]}-${parts[2]}`;
    const close = parseFloat(row[6].replace(/,/g, ""));
    if (isNaN(close) || close <= 0) return [];
    return [{ date: isoDate, close }];
  });
}

async function fetchTwseMonth(stockNo: string, year: number, month: number): Promise<PriceRow[]> {
  const date = `${year}${String(month).padStart(2, "0")}01`;
  try {
    const res = await withTimeout(
      fetch(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${stockNo}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 3600 },
      }),
      6000
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return [];
    return parseRocRows(json.data);
  } catch { return []; }
}

async function fetchTwse(ticker: string): Promise<PriceRow[]> {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const chunks = await Promise.all(months.map(({ year, month }) => fetchTwseMonth(ticker, year, month)));
  return chunks.flat().sort((a, b) => a.date.localeCompare(b.date));
}

// --- TPEX OpenAPI monthly-end sampling ---
function lastTradingDay(year: number, month: number, cap: Date): string {
  // Last calendar day of month, capped at today, adjusted back if weekend
  const d = new Date(Math.min(new Date(year, month + 1, 0).getTime(), cap.getTime()));
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() - 2);
  else if (dow === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchTpex(ticker: string): Promise<PriceRow[]> {
  const now = new Date();
  const dates = Array.from({ length: 12 }, (_, i) => {
    const m = now.getMonth() - (11 - i); // may be negative; JS Date handles wrap
    return lastTradingDay(now.getFullYear(), m, now);
  });

  const results = await Promise.all(dates.map(async (dateStr) => {
    try {
      const res = await withTimeout(
        fetch(`https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes?date=${dateStr}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          next: { revalidate: 3600 },
        }),
        6000
      );
      if (!res.ok) return null;
      const json: Array<Record<string, string>> = await res.json();
      const row = json.find((r) => r.SecuritiesCompanyCode === ticker);
      if (!row) return null;
      const close = parseFloat(row.Close.replace(/,/g, ""));
      if (!isNaN(close) && close > 0) return { date: dateStr, close };
    } catch { return null; }
    return null;
  }));

  return results.filter((r): r is PriceRow => r !== null);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  // Debug: test TPEX stk_day_all_result endpoint with a historical date
  if (req.nextUrl.searchParams.get("debug") === "1") {
    // Test with last day of a month ~6 months ago (ROC format)
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const roc = `${lastDay.getFullYear() - 1911}/${String(lastDay.getMonth() + 1).padStart(2, "0")}/${String(lastDay.getDate()).padStart(2, "0")}`;
    const url = `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_date/stk_day_all_result.php?l=zh-tw&d=${encodeURIComponent(roc)}&s=0,asc,0`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 400); }
      return NextResponse.json({ url, status: res.status, roc, parsed });
    } catch (e) { return NextResponse.json({ url, error: String(e) }); }
  }

  // 1. Try TWSE (main-board daily data)
  const twsePrices = await fetchTwse(ticker);
  if (twsePrices.length > 0) {
    return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices: twsePrices });
  }

  // 2. Fallback: TPEX OpenAPI monthly sampling
  const tpexPrices = await fetchTpex(ticker);
  if (tpexPrices.length > 0) {
    return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices: tpexPrices });
  }

  return NextResponse.json({ ok: false, error: "查無資料" }, { status: 404 });
}
