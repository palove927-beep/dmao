import { NextResponse } from "next/server";
import { getTwseStockCodes } from "@/lib/stocks";

export const dynamic = "force-dynamic";

// TWSE MIS API 單次請求的代碼數上限（過長的 ex_ch 會被忽略），分批查詢
const CHUNK_SIZE = 20;

export type StockPrice = {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  // 現價是否等於 TWSE 給的漲停價／跌停價（興櫃等沒有漲跌停的則為 null）
  limit: "up" | "down" | null;
};

function parseNumber(s: string | undefined): number | null {
  if (!s || s === "--" || s === "---" || s === " ") return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// 股價欄位永遠不會是 0——TWSE 對「當下無成交」（漲跌停鎖死、盤中零星時段）
// 常回傳字串 "0.00" 而非 "-"，若當成有效值 0 會提前中斷 ?? 備援鏈，
// 前端再把 0 當成無資料顯示成「-」。
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

// 內部用：多帶昨收與 TWSE 的漲跌停價，最後才收斂成對外的 StockPrice
type Quote = Omit<StockPrice, "limit"> & {
  yesterday: number | null;
  limitUp: number | null;
  limitDown: number | null;
};

// 直接比對 TWSE 給的漲停價(u)/跌停價(w)，不用漲跌幅%推算（跳動單位會讓漲停幅度不足 10%）
function limitState(q: Quote): "up" | "down" | null {
  if (q.price === null) return null;
  if (q.limitUp !== null && q.price === q.limitUp) return "up";
  if (q.limitDown !== null && q.price === q.limitDown) return "down";
  return null;
}

function calcChange(price: number | null, yesterday: number | null) {
  const change =
    price !== null && yesterday !== null
      ? Math.round((price - yesterday) * 100) / 100
      : null;
  const changePercent =
    change !== null && yesterday !== null && yesterday !== 0
      ? Math.round((change / yesterday) * 10000) / 100
      : null;
  return { change, changePercent };
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
    const price =
      parsePrice(item.z) ??
      parsePrice(item.b?.split("_")[0]) ??
      parsePrice(item.a?.split("_")[0]);

    map.set(ticker, {
      ticker,
      name: (item.n || "").replace(/\*/g, ""),
      price,
      ...calcChange(price, yesterday),
      yesterday,
      limitUp: parsePrice(item.u),
      limitDown: parsePrice(item.w),
    });
  }
}

// 興櫃股票 TWSE 查不到；上市櫃遇漲跌停鎖死時 TWSE 也可能沒有有效現價，
// 兩種情況都改由 Fugle 取得真實成交價。
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

    return {
      ticker: code,
      name: `${data.name || ""}*`,
      price,
      ...calcChange(price, yesterday),
      yesterday,
      // 興櫃無漲跌停；上市櫃走到這裡時會保留 TWSE 已取得的漲跌停價
      limitUp: null,
      limitDown: null,
    };
  } catch {
    return null;
  }
}

async function fetchAllPrices(): Promise<Map<string, Quote>> {
  const allCodes = getTwseStockCodes();
  const map = new Map<string, Quote>();

  const chunks: string[][] = [];
  for (let i = 0; i < allCodes.length; i += CHUNK_SIZE) {
    chunks.push(allCodes.slice(i, i + CHUNK_SIZE));
  }

  // 同時以上市/上櫃前綴查詢，API 會忽略不存在的代碼
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

  // TWSE 查不到、或查到但沒有有效現價（漲跌停鎖死等）→ 由 Fugle 補價
  const missing = allCodes.filter((c) => {
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
        // 保留 TWSE 的股名與昨收，只補上 Fugle 的價格
        const yesterday = existing.yesterday ?? q.yesterday;
        map.set(q.ticker, {
          ...existing,
          price: q.price,
          ...calcChange(q.price, yesterday),
          yesterday,
        });
      }
    }
  }

  return map;
}

export async function GET() {
  try {
    const quotes = await fetchAllPrices();
    const result: Record<string, StockPrice> = {};
    for (const [ticker, data] of quotes) {
      // 兩個來源都拿不到現價 → 最後才退回昨收（顯示平盤，至少不會誤導漲跌方向）
      const fallback = data.price === null && data.yesterday !== null;
      result[ticker] = {
        ticker: data.ticker,
        name: data.name,
        price: fallback ? data.yesterday : data.price,
        change: fallback ? 0 : data.change,
        changePercent: fallback ? 0 : data.changePercent,
        limit: fallback ? null : limitState(data),
      };
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
