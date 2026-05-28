import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/lib/stock-list";

const nameMap = new Map(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

type PriceRow = { date: string; close: number };

// --- Yahoo Finance v7 CSV download ---
async function fetchYahoo(symbol: string): Promise<PriceRow[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 366 * 24 * 3600;
  const url = `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text.startsWith("Date,")) return [];
  return text.trim().split("\n").slice(1).flatMap((line) => {
    const cols = line.split(",");
    const date = cols[0];
    const close = parseFloat(cols[4]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(close) || close <= 0) return [];
    return [{ date, close }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// --- TWSE monthly API (main-board fallback) ---
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
    const res = await fetch(
      `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${stockNo}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } }
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// --- TPEX OpenAPI monthly-end sampling (12 points) ---
async function fetchTpex(ticker: string): Promise<PriceRow[]> {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (10 - i) + 1, 0);
    return d.toISOString().slice(0, 10);
  });

  const results = await Promise.all(months.map(async (dateStr) => {
    try {
      const res = await withTimeout(
        fetch(`https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes?date=${dateStr}`,
          { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } }),
        5000
      );
      if (!res.ok) return null;
      const json: Array<Record<string, string>> = await res.json();
      const row = json.find((r) => r.SecuritiesCompanyCode === ticker || r.StockNo === ticker);
      if (!row) return null;
      const close = parseFloat((row.Close ?? row.ClosingPrice ?? row["收盤價"] ?? "").replace(/,/g, ""));
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

  // Debug: show raw TPEX OpenAPI and TWSE responses
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const today = new Date().toISOString().slice(0, 10);
    const [tpexRes, twseRes] = await Promise.all([
      fetch(`https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes?date=${today}`, { headers: { "User-Agent": "Mozilla/5.0" } }),
      fetch(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${today.replace(/-/g, "")}&stockNo=${ticker}`, { headers: { "User-Agent": "Mozilla/5.0" } }),
    ]);
    const [tpexText, twseText] = await Promise.all([tpexRes.text(), twseRes.text()]);
    // Show first record of TPEX (to reveal field names) + first 3 chars of ticker match
    let tpexSample: unknown = null;
    try {
      const arr = JSON.parse(tpexText);
      tpexSample = {
        firstRecord: arr[0],
        matchedRecord: arr.find((r: Record<string, string>) => Object.values(r).includes(ticker)),
        totalRecords: arr.length,
      };
    } catch { tpexSample = tpexText.slice(0, 300); }
    return NextResponse.json({
      tpex: { status: tpexRes.status, data: tpexSample },
      twse: { status: twseRes.status, preview: twseText.slice(0, 300) },
    });
  }

  // 1. Try Yahoo .TW (TWSE-listed)
  let prices = await fetchYahoo(`${ticker}.TW`);

  // 2. Try Yahoo .TWO (TPEX-listed)
  if (prices.length === 0) prices = await fetchYahoo(`${ticker}.TWO`);

  // 3. Fallback: TWSE monthly API
  if (prices.length === 0) prices = await fetchTwse(ticker);

  // 4. Fallback: TPEX OpenAPI (monthly sampling)
  if (prices.length === 0) prices = await fetchTpex(ticker);

  if (prices.length === 0) {
    return NextResponse.json({ ok: false, error: "查無資料" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices });
}
