import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/lib/stock-list";

// Build a lookup map from ticker → stock name
const nameMap = new Map(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

type PriceRow = { date: string; close: number };

async function fetchTwseMonth(stockNo: string, year: number, month: number): Promise<PriceRow[]> {
  const date = `${year}${String(month).padStart(2, "0")}01`;
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${stockNo}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return [];

    return json.data.flatMap((row: string[]) => {
      // date format: 114/05/02 (ROC year/month/day)
      const parts = row[0].split("/");
      if (parts.length !== 3) return [];
      const ad = parseInt(parts[0]) + 1911;
      const isoDate = `${ad}-${parts[1]}-${parts[2]}`;
      const close = parseFloat(row[6].replace(/,/g, ""));
      if (isNaN(close)) return [];
      return [{ date: isoDate, close }];
    });
  } catch {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  // Generate last 12 months
  const months: { year: number; month: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  try {
    const chunks = await Promise.all(
      months.map(({ year, month }) => fetchTwseMonth(ticker, year, month))
    );

    const prices = chunks
      .flat()
      .sort((a, b) => a.date.localeCompare(b.date));

    if (prices.length === 0) {
      return NextResponse.json({ ok: false, error: "查無資料" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      ticker,
      name: nameMap.get(ticker) ?? ticker,
      currency: "TWD",
      prices,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
