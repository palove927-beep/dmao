import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_TICKERS = 100;
// TWSE MIS API 單次請求的代碼數上限（過長的 ex_ch 會被忽略），分批查詢
const CHUNK_SIZE = 20;

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

// 股價/累計均價等欄位永遠不會是 0——TWSE 對「今日尚無成交」等情況常回傳
// 字串 "0.00" 而非 "-"，若當成有效值 0 會提前中斷 ?? 備援鏈導致現價顯示 0。
function parsePrice(s: string | undefined): number | null {
  const n = parseNumber(s);
  return n === null || n <= 0 ? null : n;
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
    const yesterday = parsePrice(item.y);
    // z=成交價, b=買價, a=賣價, u=漲停價, w=跌停價, y=昨收
    const effectivePrice =
      parsePrice(item.z) ?? parsePrice(item.b?.split("_")[0]) ?? parsePrice(item.a?.split("_")[0]) ?? parsePrice(item.u) ?? parsePrice(item.w) ?? yesterday;

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
      open: parsePrice(item.o),
      high: parsePrice(item.h),
      low: parsePrice(item.l),
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
    const chunks: string[][] = [];
    for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
      chunks.push(codes.slice(i, i + CHUNK_SIZE));
    }

    const misUrl = (chunk: string[], prefix: "tse" | "otc") =>
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${chunk.map((c) => `${prefix}_${c}.tw`).join("|")}`;

    const [tseResList, otcResList] = await Promise.all([
      Promise.all(chunks.map((chunk) => fetchWithRetry(misUrl(chunk, "tse")))),
      Promise.all(chunks.map((chunk) => fetchWithRetry(misUrl(chunk, "otc")))),
    ]);

    // OTC first, then TSE overwrites (TSE takes priority for dual-listed)
    for (const res of [...otcResList, ...tseResList]) {
      if (!res) continue;
      try {
        const data = await res.json();
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
