import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/lib/stock-list";

const nameMap = new Map(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

type PriceRow = { date: string; close: number };

async function fetchStooq(stockNo: string): Promise<PriceRow[]> {
  const today = new Date();
  const d2 = today.toISOString().slice(0, 10).replace(/-/g, "");
  const past = new Date(today);
  past.setFullYear(today.getFullYear() - 1);
  const d1 = past.toISOString().slice(0, 10).replace(/-/g, "");

  const url = `https://stooq.com/q/d/l/?s=${stockNo}.tw&i=d&d1=${d1}&d2=${d2}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`stooq HTTP ${res.status}`);

  const text = await res.text();
  if (!text.includes(",") || text.toLowerCase().includes("no data")) return [];

  const lines = text.trim().split("\n");
  return lines.slice(1).flatMap((line) => {
    const cols = line.split(",");
    if (cols.length < 5) return [];
    const date = cols[0].trim();
    const close = parseFloat(cols[4]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(close) || close <= 0) return [];
    return [{ date, close }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// TWSE fallback for main-board stocks
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
};

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
      { headers: BROWSER_HEADERS, next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return [];
    return parseRocRows(json.data);
  } catch { return []; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  try {
    // Primary: Stooq (handles both TWSE and TPEX with .tw suffix)
    const prices = await fetchStooq(ticker);
    if (prices.length > 0) {
      return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices });
    }
  } catch { /* fall through to TWSE */ }

  // Fallback: TWSE API (main-board only)
  try {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
    const chunks = await Promise.all(months.map(({ year, month }) => fetchTwseMonth(ticker, year, month)));
    const prices = chunks.flat().sort((a, b) => a.date.localeCompare(b.date));
    if (prices.length > 0) {
      return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices });
    }
  } catch { /* ignore */ }

  return NextResponse.json({ ok: false, error: "查無資料" }, { status: 404 });
}
