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
  // 現價是否等於 TWSE 給的漲停價／跌停價（興櫃等沒有漲跌停的則為 null）
  limit: "up" | "down" | null;
};

// 內部用：多帶 TWSE 的漲跌停價，最後才收斂成對外的 TrackQuote
type Quote = Omit<TrackQuote, "limit"> & {
  limitUp: number | null;
  limitDown: number | null;
  // Fugle 直接給的漲跌停旗標，TWSE 沒有漲跌停價可比對時當備援
  fugleLimit: "up" | "down" | null;
};

// 直接比對 TWSE 給的漲停價(u)/跌停價(w)，不用漲跌幅%推算（跳動單位會讓漲停幅度不足 10%）
function limitState(q: Quote): "up" | "down" | null {
  if (q.price === null) return null;
  if (q.limitUp !== null && q.price === q.limitUp) return "up";
  if (q.limitDown !== null && q.price === q.limitDown) return "down";
  // TWSE 沒給漲跌停價（如興櫃、或該檔整筆查無）時，用 Fugle 的旗標
  return q.fugleLimit;
}

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
  map: Map<string, Quote>,
) {
  for (const item of msgArray) {
    const ticker = item.c;
    const yesterday = parsePrice(item.y);
    // z=成交價, b=買價, a=賣價。
    // 不用漲停價(u)/跌停價(w)兜底：無從判斷該股今天是撞漲停還是跌停，
    // 猜錯方向會把跌停股顯示成飆漲。此處拿不到就留 null，交由 Fugle 補價。
    const effectivePrice =
      parsePrice(item.z) ?? parsePrice(item.b?.split("_")[0]) ?? parsePrice(item.a?.split("_")[0]);

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
      limitUp: parsePrice(item.u),
      limitDown: parsePrice(item.w),
      fugleLimit: null,
    });
  }
}

async function fetchFugleQuote(code: string): Promise<Quote | null> {
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
      // 興櫃無漲跌停；上市櫃走到這裡時會保留 TWSE 已取得的漲跌停價
      limitUp: null,
      limitDown: null,
      // Fugle 回傳裡直接就有是否觸及漲跌停，不必再比價
      fugleLimit: data.isLimitUpPrice ? "up" : data.isLimitDownPrice ? "down" : null,
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
    const map = new Map<string, Quote>();

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

    // 改用 Fugle 補價的情況：
    // 1. TWSE 完全查不到（興櫃）
    // 2. TWSE 查到但沒有有效現價（如跌停鎖死時 z/b/a 皆為空）
    const missing = codes.filter((c) => {
      const q = map.get(c);
      return !q || q.price === null;
    });
    if (missing.length > 0) {
      const results = await Promise.all(missing.map(fetchFugleQuote));
      for (const q of results) {
        if (!q) continue;
        const existing = map.get(q.ticker);
        if (!existing) {
          map.set(q.ticker, q);
        } else if (q.price !== null) {
          // 保留 TWSE 的股名與昨收，只補上 Fugle 的價格資訊
          const yesterday = existing.yesterday ?? q.yesterday;
          const change = yesterday !== null ? Math.round((q.price - yesterday) * 100) / 100 : null;
          map.set(q.ticker, {
            ...existing,
            price: q.price,
            change,
            changePercent:
              change !== null && yesterday !== null && yesterday !== 0
                ? Math.round((change / yesterday) * 10000) / 100
                : null,
            open: existing.open ?? q.open,
            high: existing.high ?? q.high,
            low: existing.low ?? q.low,
            yesterday,
            // 價格來自 Fugle，漲跌停旗標也一併採用
            fugleLimit: q.fugleLimit,
          });
        }
      }
    }

    const result: Record<string, TrackQuote> = {};
    for (const [ticker, data] of map) {
      // 兩個來源都拿不到現價 → 最後才退回昨收（顯示平盤，至少不會誤導漲跌方向）
      const fallback = data.price === null && data.yesterday !== null;
      result[ticker] = {
        ticker: data.ticker,
        name: data.name,
        price: fallback ? data.yesterday : data.price,
        change: fallback ? 0 : data.change,
        changePercent: fallback ? 0 : data.changePercent,
        open: data.open,
        high: data.high,
        low: data.low,
        yesterday: data.yesterday,
        volume: data.volume,
        limit: fallback ? null : limitState(data),
      };
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
