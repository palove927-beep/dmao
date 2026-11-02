// 美股即時報價（/stock 清單裡的非台股代碼用）。
// 主要來源 Yahoo Finance chart API，失敗時退回 Stooq CSV；兩者都不需要 API key。

export type UsQuote = {
  ticker: string;
  price: number | null;
  yesterday: number | null;
};

const UA = { "User-Agent": "Mozilla/5.0" };

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchYahoo(ticker: string): Promise<UsQuote | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
      { headers: UA, cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = num(meta?.regularMarketPrice);
    if (price === null) return null;
    // previousClose 是前一交易日收盤；chartPreviousClose 是查詢區間起點前的收盤，只當備援
    const yesterday = num(meta?.previousClose) ?? num(meta?.chartPreviousClose);
    return { ticker, price, yesterday };
  } catch {
    return null;
  }
}

// Stooq：https://stooq.com/q/l/?s=cls.us&f=sd2t2ohlcp&h&e=csv
// 欄位 Symbol,Date,Time,Open,High,Low,Close,Prev
async function fetchStooq(ticker: string): Promise<UsQuote | null> {
  try {
    const res = await fetch(
      `https://stooq.com/q/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&f=sd2t2ohlcp&h&e=csv`,
      { headers: UA, cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const [, row] = (await res.text()).trim().split(/\r?\n/);
    if (!row) return null;
    const cols = row.split(",");
    const price = num(cols[6]);
    if (price === null) return null;
    return { ticker, price, yesterday: num(cols[7]) };
  } catch {
    return null;
  }
}

export async function fetchUsQuotes(tickers: string[]): Promise<UsQuote[]> {
  const results = await Promise.all(
    tickers.map(async (t) => (await fetchYahoo(t)) ?? (await fetchStooq(t))),
  );
  return results.filter((q): q is UsQuote => q !== null);
}
