import { NextResponse } from "next/server";
import { getTwseStockCodes } from "@/lib/stocks";

export const revalidate = 30; // cache for 30 seconds

type TwseRow = [
  string, // 0: 證券代號
  string, // 1: 證券名稱
  string, // 2: 成交股數
  string, // 3: 成交筆數
  string, // 4: 成交金額
  string, // 5: 開盤價
  string, // 6: 最高價
  string, // 7: 最低價
  string, // 8: 收盤價
  string, // 9: 漲跌(+/-)
  string, // 10: 漲跌價差
  string, // 11: 最後揭示買價
  string, // 12: 最後揭示買量
  string, // 13: 最後揭示賣價
  string, // 14: 最後揭示賣量
  string, // 15: 本益比
];

export type StockPrice = {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  time: string;
};

function parseNumber(s: string): number | null {
  if (!s || s === "--" || s === "---") return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

async function fetchTwseQuotes(): Promise<Map<string, StockPrice>> {
  const map = new Map<string, StockPrice>();

  // TWSE 全部股價 API (上市)
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const twseUrl = `https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json&date=${dateStr}`;

  // Also try the real-time endpoint for today's prices
  const realtimeUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${getTwseStockCodes().map((c) => `tse_${c}.tw`).join("|")}`;

  try {
    const res = await fetch(realtimeUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
      next: { revalidate: 30 },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.msgArray) {
        for (const item of data.msgArray) {
          const ticker = item.c; // stock code
          const price = parseNumber(item.z); // latest trade price
          const open = parseNumber(item.o); // open
          const high = parseNumber(item.h); // high
          const low = parseNumber(item.l); // low
          const yesterday = parseNumber(item.y); // yesterday close
          const volume = parseNumber(item.v); // volume (lots)

          const change =
            price !== null && yesterday !== null ? price - yesterday : null;
          const changePercent =
            change !== null && yesterday !== null && yesterday !== 0
              ? (change / yesterday) * 100
              : null;

          map.set(ticker, {
            ticker,
            name: item.n || "",
            price,
            change: change !== null ? Math.round(change * 100) / 100 : null,
            changePercent:
              changePercent !== null
                ? Math.round(changePercent * 100) / 100
                : null,
            open,
            high,
            low,
            volume: volume !== null ? volume * 1000 : null,
            time: item.t || "",
          });
        }
      }
    }
  } catch {
    // If real-time fails, try OTC
  }

  // Also fetch OTC (上櫃) stocks
  const otcCodes = getTwseStockCodes();
  const missingCodes = otcCodes.filter((c) => !map.has(c));

  if (missingCodes.length > 0) {
    try {
      const otcRealtimeUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${missingCodes.map((c) => `otc_${c}.tw`).join("|")}`;
      const res = await fetch(otcRealtimeUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
        next: { revalidate: 30 },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.msgArray) {
          for (const item of data.msgArray) {
            const ticker = item.c;
            const price = parseNumber(item.z);
            const open = parseNumber(item.o);
            const high = parseNumber(item.h);
            const low = parseNumber(item.l);
            const yesterday = parseNumber(item.y);
            const volume = parseNumber(item.v);

            const change =
              price !== null && yesterday !== null ? price - yesterday : null;
            const changePercent =
              change !== null && yesterday !== null && yesterday !== 0
                ? (change / yesterday) * 100
                : null;

            map.set(ticker, {
              ticker,
              name: item.n || "",
              price,
              change: change !== null ? Math.round(change * 100) / 100 : null,
              changePercent:
                changePercent !== null
                  ? Math.round(changePercent * 100) / 100
                  : null,
              open,
              high,
              low,
              volume: volume !== null ? volume * 1000 : null,
              time: item.t || "",
            });
          }
        }
      }
    } catch {
      // OTC fetch failed
    }
  }

  return map;
}

export async function GET() {
  try {
    const quotes = await fetchTwseQuotes();
    const result: Record<string, StockPrice> = {};

    for (const [ticker, data] of quotes) {
      result[ticker] = data;
    }

    return NextResponse.json({
      ok: true,
      data: result,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to fetch stock data" },
      { status: 500 },
    );
  }
}
