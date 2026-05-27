import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/lib/stock-list";

const nameMap = new Map(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

type PriceRow = { date: string; close: number };

function parseRocRows(rows: string[][]): PriceRow[] {
  return rows.flatMap((row) => {
    const parts = row[0].split("/");
    if (parts.length !== 3) return [];
    const ad = parseInt(parts[0]) + 1911;
    const isoDate = `${ad}-${parts[1]}-${parts[2]}`;
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

async function fetchTpexMonth(stockNo: string, year: number, month: number): Promise<PriceRow[]> {
  const roc = `${year - 1911}/${String(month).padStart(2, "0")}`;
  const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${encodeURIComponent(roc)}&stkno=${stockNo}&s=0,asc,0`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json.aaData)) return [];
    return parseRocRows(json.aaData);
  } catch { return []; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  const months: { year: number; month: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  try {
    // Fetch TWSE and TPEX in parallel — use whichever has data
    const [twseChunks, tpexChunks] = await Promise.all([
      Promise.all(months.map(({ year, month }) => fetchTwseMonth(ticker, year, month))),
      Promise.all(months.map(({ year, month }) => fetchTpexMonth(ticker, year, month))),
    ]);

    const twsePrices = twseChunks.flat().sort((a, b) => a.date.localeCompare(b.date));
    const tpexPrices = tpexChunks.flat().sort((a, b) => a.date.localeCompare(b.date));
    const prices = twsePrices.length >= tpexPrices.length ? twsePrices : tpexPrices;

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
