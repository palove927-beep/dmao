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

// --- TWSE monthly API (main-board only) ---
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
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  // TWSE main-board: full daily data for past 12 months
  const prices = await fetchTwse(ticker);
  if (prices.length > 0) {
    return NextResponse.json({ ok: true, ticker, name: nameMap.get(ticker) ?? ticker, currency: "TWD", prices });
  }

  // TPEX and others: no reliable free historical data source available
  return NextResponse.json(
    { ok: false, error: "上櫃股暫不支援歷史走勢圖（TPEX 歷史 API 已停用）" },
    { status: 404 }
  );
}
