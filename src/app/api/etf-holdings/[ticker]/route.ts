import { NextRequest, NextResponse } from "next/server";
import {
  extractHoldings,
  narrowToTicker,
  findString,
  NAME_KEYS,
  DATE_KEYS,
  type EtfHolding,
} from "@/lib/etf-pcf";

export const dynamic = "force-dynamic";

export type { EtfHolding };

export type EtfHoldingsData = {
  ticker: string;
  name: string | null;
  date: string | null;
  source: string; // 實際取得資料的來源代號，方便日後確認是哪條路通的
  holdings: EtfHolding[];
};

// TWSE 的 ETF 申購買回清單（PCF）沒有公開穩定的單一端點，
// 這裡按順序試幾條已知路徑，第一條解析出成分股的就採用。
// 用 ?debug=1 可看到每條的實際狀態與回傳片段，確認後可把清單收斂成一條。
const candidates = (ticker: string) => [
  {
    source: "twse-rwd-etfPCF",
    url: `https://www.twse.com.tw/rwd/zh/ETF/etfPCF?stkNo=${ticker}&response=json`,
  },
  {
    source: "twse-rwd-etfPCFDetail",
    url: `https://www.twse.com.tw/rwd/zh/ETF/etfPCFDetail?stkNo=${ticker}&response=json`,
  },
  {
    source: "twse-exchangeReport-ETFPCF",
    url: `https://www.twse.com.tw/exchangeReport/ETFPCF?response=json&stkNo=${ticker}`,
  },
  {
    source: "mis-all-etf",
    url: "https://mis.twse.com.tw/stock/data/all_etf.txt",
  },
];

async function fetchJson(url: string): Promise<{ status: number; text: string; json: unknown }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.twse.com.tw/",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 不是 JSON（例如被導到 HTML 錯誤頁）
  }
  return { status: res.status, text, json };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await params;
  const ticker = (raw || "").trim().toUpperCase();
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  if (!/^\d{4,6}[A-Z]?$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "代號格式不正確" }, { status: 400 });
  }

  const attempts: {
    source: string;
    url: string;
    status: number | string;
    holdings: number;
    sample?: string;
  }[] = [];

  for (const c of candidates(ticker)) {
    try {
      const { status, text, json } = await fetchJson(c.url);
      if (json === null) {
        attempts.push({ source: c.source, url: c.url, status, holdings: 0, sample: text.slice(0, 300) });
        continue;
      }

      const scope = c.source === "mis-all-etf" ? (narrowToTicker(json, ticker) ?? json) : json;
      const holdings = extractHoldings(scope);
      attempts.push({
        source: c.source,
        url: c.url,
        status,
        holdings: holdings.length,
        sample: text.slice(0, 300),
      });

      if (holdings.length > 0 && !debug) {
        const data: EtfHoldingsData = {
          ticker,
          name: findString(scope, NAME_KEYS),
          date: findString(scope, DATE_KEYS),
          source: c.source,
          holdings,
        };
        return NextResponse.json(
          { ok: true, ...data },
          { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" } },
        );
      }
    } catch (err: unknown) {
      attempts.push({
        source: c.source,
        url: c.url,
        status: err instanceof Error ? err.message : "fetch failed",
        holdings: 0,
      });
    }
  }

  if (debug) {
    return NextResponse.json({ ok: true, ticker, debug: attempts });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "TWSE 目前沒有回傳這檔 ETF 的持股明細",
      hint: "加上 ?debug=1 可看到各來源的實際回應",
      tried: attempts.map((a) => ({ source: a.source, status: a.status })),
    },
    { status: 502 },
  );
}
