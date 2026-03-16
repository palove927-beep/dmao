import { NextResponse } from "next/server";
import { getTwseStockCodes } from "@/lib/stocks";

export const dynamic = "force-dynamic";

export type StockPrice = {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
};

function parseNumber(s: string): number | null {
  if (!s || s === "--" || s === "---" || s === " ") return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// Split array into chunks
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function fetchMisTwse(
  codes: string[],
  exchange: "tse" | "otc",
): Promise<Map<string, StockPrice>> {
  const map = new Map<string, StockPrice>();
  if (codes.length === 0) return map;

  const exCh = codes.map((c) => `${exchange}_${c}.tw`).join("|");
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exCh}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return map;

    const data = await res.json();
    if (!data.msgArray) return map;

    for (const item of data.msgArray) {
      const ticker = item.c;
      const price = parseNumber(item.z);
      const yesterday = parseNumber(item.y);

      // If no trade price, try best bid/ask midpoint or yesterday close
      const effectivePrice = price ?? yesterday;

      const change =
        effectivePrice !== null && yesterday !== null
          ? Math.round((effectivePrice - yesterday) * 100) / 100
          : null;
      const changePercent =
        change !== null && yesterday !== null && yesterday !== 0
          ? Math.round((change / yesterday) * 10000) / 100
          : null;

      map.set(ticker, {
        ticker,
        name: item.n || "",
        price: effectivePrice,
        change,
        changePercent,
      });
    }
  } catch {
    // fetch failed
  }

  return map;
}

async function fetchAllPrices(): Promise<Map<string, StockPrice>> {
  const allCodes = getTwseStockCodes();
  const batches = chunk(allCodes, 20);
  const combined = new Map<string, StockPrice>();

  // First pass: try all as TSE (上市)
  const tsePromises = batches.map((batch) => fetchMisTwse(batch, "tse"));
  const tseResults = await Promise.all(tsePromises);
  for (const result of tseResults) {
    for (const [k, v] of result) {
      combined.set(k, v);
    }
  }

  // Second pass: missing codes as OTC (上櫃)
  const missingCodes = allCodes.filter((c) => !combined.has(c));
  if (missingCodes.length > 0) {
    const otcBatches = chunk(missingCodes, 20);
    const otcPromises = otcBatches.map((batch) => fetchMisTwse(batch, "otc"));
    const otcResults = await Promise.all(otcPromises);
    for (const result of otcResults) {
      for (const [k, v] of result) {
        combined.set(k, v);
      }
    }
  }

  return combined;
}

export async function GET() {
  try {
    const quotes = await fetchAllPrices();
    const result: Record<string, StockPrice> = {};

    for (const [ticker, data] of quotes) {
      result[ticker] = data;
    }

    return NextResponse.json(
      {
        ok: true,
        data: result,
        count: Object.keys(result).length,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to fetch stock data" },
      { status: 500 },
    );
  }
}
