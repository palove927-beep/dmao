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

// --- TPEX OpenAPI monthly-end sampling (12 points) ---
async function fetchTpex(ticker: string): Promise<PriceRow[]> {
  const results: PriceRow[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // last day of month
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const res = await fetch(
        `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes?date=${dateStr}`,
        { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } }
      );
      if (!res.ok) continue;
      const json: Array<Record<string, string>> = await res.json();
      const row = json.find((r) => r.SecuritiesCompanyCode === ticker || r.StockNo === ticker);
      if (!row) continue;
      const close = parseFloat((row.Close ?? row.ClosingPrice ?? "").replace(/,/g, ""));
      if (!isNaN(close) && close > 0) results.push({ date: dateStr, close });
    } catch { continue; }
  }
  return results;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  // Debug: show raw response from all sources
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - 366 * 24 * 3600;
    const [twRes, twoRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v7/finance/download/${ticker}.TW?period1=${period1}&period2=${period2}&interval=1d&events=history`, { headers: { "User-Agent": "Mozilla/5.0" } }),
      fetch(`https://query1.finance.yahoo.com/v7/finance/download/${ticker}.TWO?period1=${period1}&period2=${period2}&interval=1d&events=history`, { headers: { "User-Agent": "Mozilla/5.0" } }),
    ]);
    const [twText, twoText] = await Promise.all([twRes.text(), twoRes.text()]);
    return NextResponse.json({
      tw: { status: twRes.status, preview: twText.slice(0, 200) },
      two: { status: twoRes.status, preview: twoText.slice(0, 200) },
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
