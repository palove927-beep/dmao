import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/lib/stock-list";

const nameMap = new Map(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

const tpexSet = new Set(
  categories.flatMap((c) => c.stocks.filter((s) => s.market === "tpex").map((s) => s.ticker))
);

type PriceRow = { date: string; close: number };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// --- Fugle MarketData API (TWSE + TPEX) ---
async function fetchFugle(ticker: string): Promise<PriceRow[]> {
  const apiKey = process.env.FUGLE_API_KEY;
  if (!apiKey) return [];

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 366 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const url = `https://api.fugle.tw/marketdata/v1.0/stock/historical/candles?symbol=${ticker}&resolution=D&from=${from}&to=${to}&apiToken=${apiKey}`;

  try {
    const res = await withTimeout(
      fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } }),
      8000
    );
    if (!res.ok) return [];
    const json = await res.json();
    // Fugle response: { symbol, candles: [...] } or nested under data
    const candles: Array<{ date: string; close: number }> =
      json?.candles ?? json?.data?.candles ?? json?.data ?? [];
    if (!Array.isArray(candles)) return [];
    return candles
      .filter((c) => c.date && c.close > 0)
      .map((c) => ({ date: c.date.slice(0, 10), close: c.close }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

// --- TWSE monthly API (fallback for main-board) ---
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const isTpex = tpexSet.has(ticker);

  // ?debug=1 returns raw Fugle JSON for troubleshooting
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const apiKey = process.env.FUGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "no FUGLE_API_KEY" });
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 366 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const url = `https://api.fugle.tw/marketdata/v1.0/stock/historical/candles?symbol=${ticker}&resolution=D&from=${from}&to=${to}&apiToken=${apiKey}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const json = await res.json();
    return NextResponse.json({ status: res.status, url: url.replace(apiKey, "***"), body: json });
  }

  if (isTpex) {
    // TPEX stocks: Fugle only
    const fuglePrices = await fetchFugle(ticker);
    if (fuglePrices.length > 0) {
      return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices: fuglePrices });
    }
    return NextResponse.json({ ok: false, error: "查無資料" }, { status: 404 });
  }

  // TWSE stocks: try TWSE first (free, reliable), Fugle as fallback
  const twsePrices = await fetchTwse(ticker);
  if (twsePrices.length > 0) {
    return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices: twsePrices });
  }

  const fuglePrices = await fetchFugle(ticker);
  if (fuglePrices.length > 0) {
    return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices: fuglePrices });
  }

  return NextResponse.json(
    { ok: false, error: "查無資料" },
    { status: 404 }
  );
}
