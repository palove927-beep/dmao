import { NextRequest, NextResponse } from "next/server";
import {
  extractHoldings,
  extractUrls,
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

// TWSE 的 ETF 申購買回清單（PCF）沒有公開穩定的單一端點。已排除的路徑：
//   www.twse.com.tw/rwd/zh/ETF/etfPCF、etfPCFDetail、exchangeReport/ETFPCF → 皆回 404
//   mis.twse.com.tw/stock/data/all_etf.txt → 有資料但只有淨值／折溢價，沒有成分股
// 下面是仍待驗證的候選；用 ?discover=1 讓程式從 TWSE 頁面自己撈端點，
// 用 ?url=<網址> 可直接試任一網址，不必改 code 重新部署。
const candidates = (ticker: string) => [
  {
    source: "mis-etf-pcf",
    url: `https://mis.twse.com.tw/stock/data/all_etf_pcf.txt`,
  },
  {
    source: "mis-etf-pcf-single",
    url: `https://mis.twse.com.tw/stock/data/etf_pcf_${ticker}.txt`,
  },
  {
    source: "twse-rwd-etfPcf",
    url: `https://www.twse.com.tw/rwd/zh/ETF/etfPcf?stkNo=${ticker}&response=json`,
  },
  {
    source: "twse-rwd-fundHolding",
    url: `https://www.twse.com.tw/rwd/zh/ETF/fundHolding?stkNo=${ticker}&response=json`,
  },
];

// ?discover=1 會抓這些頁面，把裡面出現的端點網址撈出來給我們看
const discoverTargets = (ticker: string) => [
  {
    source: "openapi-swagger",
    url: "https://openapi.twse.com.tw/v1/swagger.json",
  },
  {
    source: "mis-etf-disclosure-page",
    url: "https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant",
  },
  {
    source: "twse-etf-product-page",
    url: `https://www.twse.com.tw/zh/products/securities/etf/products/content.html?${ticker}=`,
  },
  {
    source: "twse-etf-list",
    url: "https://www.twse.com.tw/rwd/zh/ETF/list?response=json",
  },
];

async function fetchText(url: string): Promise<{ status: number; text: string; json: unknown }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json, text/plain, text/html, */*",
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

type Attempt = {
  source: string;
  url: string;
  status: number | string;
  holdings: number;
  sample?: string;
};

async function probe(source: string, url: string, ticker: string) {
  const { status, text, json } = await fetchText(url);

  // 網址沒帶代號 = 一次回傳所有 ETF 的彙總檔，必須收斂到該檔 ETF 才算數；
  // 收斂不到就當作這個來源沒有這檔的資料，否則會把「ETF 清單」誤當成持股。
  const isAggregate = !url.toUpperCase().includes(ticker);
  const narrowed = json === null ? null : narrowToTicker(json, ticker);
  const scope = json === null ? null : isAggregate ? narrowed : (narrowed ?? json);
  const holdings = scope === null ? [] : extractHoldings(scope);
  return { attempt: { source, url, status, holdings: holdings.length, sample: text.slice(0, 400) }, scope, holdings };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await params;
  const ticker = (raw || "").trim().toUpperCase();
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const discover = req.nextUrl.searchParams.get("discover") === "1";
  const customUrl = req.nextUrl.searchParams.get("url");

  if (!/^\d{4,6}[A-Z]?$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "代號格式不正確" }, { status: 400 });
  }

  // ─── 探索模式：從 TWSE 的頁面／API 文件裡撈出可能的資料端點 ───
  if (discover) {
    const results = await Promise.all(
      discoverTargets(ticker).map(async (t) => {
        try {
          const { status, text } = await fetchText(t.url);
          return { source: t.source, url: t.url, status, urls: extractUrls(text), sample: text.slice(0, 200) };
        } catch (err: unknown) {
          return {
            source: t.source,
            url: t.url,
            status: err instanceof Error ? err.message : "fetch failed",
            urls: [] as string[],
          };
        }
      }),
    );
    return NextResponse.json({ ok: true, ticker, discover: results });
  }

  // ─── 指定網址模式：直接試某個網址，用來快速驗證新發現的端點 ───
  if (customUrl) {
    if (!/^https:\/\/([a-z0-9-]+\.)*twse\.com\.tw\//i.test(customUrl)) {
      return NextResponse.json(
        { ok: false, error: "只接受 twse.com.tw 的網址" },
        { status: 400 },
      );
    }
    try {
      const { attempt, scope, holdings } = await probe("custom", customUrl, ticker);
      if (holdings.length > 0 && !debug) {
        return NextResponse.json({
          ok: true,
          ticker,
          name: findString(scope, NAME_KEYS),
          date: findString(scope, DATE_KEYS),
          source: customUrl,
          holdings,
        });
      }
      return NextResponse.json({ ok: true, ticker, debug: [attempt] });
    } catch (err: unknown) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "fetch failed" },
        { status: 502 },
      );
    }
  }

  // ─── 一般模式：依序試候選端點 ───
  const attempts: Attempt[] = [];

  for (const c of candidates(ticker)) {
    try {
      const { attempt, scope, holdings } = await probe(c.source, c.url, ticker);
      attempts.push(attempt);

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
      hint: "?debug=1 看各候選端點的回應；?discover=1 從 TWSE 頁面撈出可能的端點；?url=<twse網址> 直接試某個端點",
      tried: attempts.map((a) => ({ source: a.source, status: a.status })),
    },
    { status: 502 },
  );
}
