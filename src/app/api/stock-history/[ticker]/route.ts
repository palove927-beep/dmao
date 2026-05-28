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

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "zh-TW,zh;q=0.9",
};

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

async function fetchTpexMonthRaw(stockNo: string, year: number, month: number): Promise<unknown> {
  // Use literal / in the date parameter — some servers reject %2F
  const roc = `${year - 1911}/${String(month).padStart(2, "0")}`;
  const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${roc}&stkno=${stockNo}&s=0,asc,0`;
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, "Referer": "https://www.tpex.org.tw/" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { httpStatus: res.status };
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { rawText: text.slice(0, 300) }; }
}

async function fetchTpexMonth(stockNo: string, year: number, month: number): Promise<PriceRow[]> {
  try {
    const json = await fetchTpexMonthRaw(stockNo, year, month) as Record<string, unknown>;
    const rows = json.aaData ?? json.data ?? json.Data;
    if (!Array.isArray(rows)) return [];
    return parseRocRows(rows as string[][]);
  } catch { return []; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const isDebug = req.nextUrl.searchParams.get("debug") === "1";

  const months: { year: number; month: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  // Debug: show raw TPEX response for the most recent month
  if (isDebug) {
    const latest = months[months.length - 1];
    const raw = await fetchTpexMonthRaw(ticker, latest.year, latest.month);
    return NextResponse.json({ ticker, month: latest, raw });
  }

  try {
    const [twseChunks, tpexChunks] = await Promise.all([
      Promise.all(months.map(({ year, month }) => fetchTwseMonth(ticker, year, month))),
      Promise.all(months.map(({ year, month }) => fetchTpexMonth(ticker, year, month))),
    ]);

    const twsePrices = twseChunks.flat().sort((a, b) => a.date.localeCompare(b.date));
    const tpexPrices = tpexChunks.flat().sort((a, b) => a.date.localeCompare(b.date));
    const prices = twsePrices.length >= tpexPrices.length ? twsePrices : tpexPrices;

    if (prices.length === 0) {
      return NextResponse.json({ ok: false, error: "查無資料", twseCount: twsePrices.length, tpexCount: tpexPrices.length }, { status: 404 });
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
