import { NextResponse } from "next/server";
import { getTwseStockCodes } from "@/lib/stocks";

export const dynamic = "force-dynamic";

// 興櫃股票 — TWSE 查不到，需用 Fugle API
const EMERGING_STOCKS = ["6826", "7822", "7853"];

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

async function fetchWithRetry(
  url: string,
  retries = 3,
  extraHeaders?: Record<string, string>,
): Promise<Response | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", ...extraHeaders },
        cache: "no-store",
      });
      if (res.ok) return res;
    } catch {
      // retry
    }
  }
  return null;
}

function parseMsgArray(
  msgArray: Record<string, string>[],
  map: Map<string, StockPrice>,
) {
  for (const item of msgArray) {
    const ticker = item.c;
    const yesterday = parseNumber(item.y);
    // z=成交價, b=買價, a=賣價, u=漲停價, w=跌停價, y=昨收
    const effectivePrice =
      parseNumber(item.z) ?? parseNumber(item.b?.split("_")[0]) ?? parseNumber(item.a?.split("_")[0]) ?? parseNumber(item.u) ?? parseNumber(item.w) ?? yesterday;

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
      name: (item.n || "").replace(/\*/g, ""),
      price: effectivePrice,
      change,
      changePercent,
    });
  }
}

async function fetchAllPrices(): Promise<Map<string, StockPrice>> {
  const allCodes = getTwseStockCodes();
  const map = new Map<string, StockPrice>();

  // Separate emerging stocks
  const regularCodes = allCodes.filter(
    (c) => !EMERGING_STOCKS.includes(c),
  );
  const emergingCodes = allCodes.filter((c) =>
    EMERGING_STOCKS.includes(c),
  );

  // Build TSE + OTC URLs with all regular codes (API ignores invalid ones)
  const tseExCh = regularCodes.map((c) => `tse_${c}.tw`).join("|");
  const otcExCh = regularCodes.map((c) => `otc_${c}.tw`).join("|");

  const tseUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${tseExCh}`;
  const otcUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${otcExCh}`;

  // Fetch TSE + OTC in parallel
  const [tseRes, otcRes] = await Promise.all([
    fetchWithRetry(tseUrl),
    fetchWithRetry(otcUrl),
  ]);

  // OTC first, then TSE overwrites (TSE takes priority for dual-listed)
  if (otcRes) {
    try {
      const data = await otcRes.json();
      if (data.msgArray) parseMsgArray(data.msgArray, map);
    } catch {
      // parse error
    }
  }

  if (tseRes) {
    try {
      const data = await tseRes.json();
      if (data.msgArray) parseMsgArray(data.msgArray, map);
    } catch {
      // parse error
    }
  }

  // Fetch emerging stocks via Fugle API
  if (emergingCodes.length > 0) {
    const fuglePromises = emergingCodes.map(async (code) => {
      try {
        const res = await fetchWithRetry(
          `https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${code}`,
          3,
          { "X-API-KEY": process.env.FUGLE_API_KEY || "" },
        );
        if (!res) return;
        const data = await res.json();
        const price = data.lastPrice ?? data.closePrice ?? null;
        const yesterday = data.previousClose ?? null;
        const change =
          price !== null && yesterday !== null
            ? Math.round((price - yesterday) * 100) / 100
            : null;
        const changePercent =
          change !== null && yesterday !== null && yesterday !== 0
            ? Math.round((change / yesterday) * 10000) / 100
            : null;

        map.set(code, {
          ticker: code,
          name: `${data.name || ""}*`,
          price,
          change,
          changePercent,
        });
      } catch {
        // fugle failed for this code
      }
    });
    await Promise.all(fuglePromises);
  }

  return map;
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
