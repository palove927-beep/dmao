import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_TICKERS = 30;

export type TrackQuote = {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  yesterday: number | null;
  volume: number | null; // 累積成交量（張）
};

function parseNumber(s: string | undefined): number | null {
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
  map: Map<string, TrackQuote>,
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
      open: parseNumber(item.o),
      high: parseNumber(item.h),
      low: parseNumber(item.l),
      yesterday,
      volume: parseNumber(item.v),
    });
  }
}

async function fetchFugleQuote(code: string): Promise<TrackQuote | null> {
  try {
    const res = await fetchWithRetry(
      `https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${code}`,
      2,
      { "X-API-KEY": process.env.FUGLE_API_KEY || "" },
    );
    if (!res) return null;
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

    return {
      ticker: code,
      name: `${data.name || ""}*`,
      price,
      change,
      changePercent,
      open: data.openPrice ?? null,
      high: data.highPrice ?? null,
      low: data.lowPrice ?? null,
      yesterday,
      volume: data.total?.tradeVolume ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("tickers") || "";
  const codes = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d{4,6}$/.test(s)),
    ),
  ).slice(0, MAX_TICKERS);

  if (codes.length === 0) {
    return NextResponse.json({ ok: true, data: {}, updatedAt: new Date().toISOString() });
  }

  try {
    const map = new Map<string, TrackQuote>();

    // 同時以上市/上櫃前綴查詢，API 會忽略不存在的代碼
    const tseExCh = codes.map((c) => `tse_${c}.tw`).join("|");
    const otcExCh = codes.map((c) => `otc_${c}.tw`).join("|");

    const [tseRes, otcRes] = await Promise.all([
      fetchWithRetry(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${tseExCh}`),
      fetchWithRetry(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${otcExCh}`),
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

    // TWSE 查不到的（興櫃）改用 Fugle
    const missing = codes.filter((c) => !map.has(c));
    if (missing.length > 0) {
      const results = await Promise.all(missing.map(fetchFugleQuote));
      for (const q of results) {
        if (q) map.set(q.ticker, q);
      }
    }

    const result: Record<string, TrackQuote> = {};
    for (const [ticker, data] of map) {
      result[ticker] = data;
    }

    return NextResponse.json(
      { ok: true, data: result, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to fetch quotes" },
      { status: 500 },
    );
  }
}
