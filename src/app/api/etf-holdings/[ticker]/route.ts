import { NextRequest, NextResponse } from "next/server";
import {
  extractHoldings,
  extractUrls,
  narrowToTicker,
  parseHtmlTables,
  type EtfHolding,
} from "@/lib/etf-pcf";

export const dynamic = "force-dynamic";

export type { EtfHolding };

export type EtfInfo = {
  ticker: string;
  name: string | null; // ETF 簡稱
  fullName: string | null;
  category: string | null;
  listedDate: string | null;
  issuer: string | null; // 基金經理公司
  issuerSite: string | null;
  pcfUrl: string | null; // 投信的申購買回清單（成分股）頁
};

export type EtfHoldingsData = EtfInfo & {
  source: string;
  holdings: EtfHolding[];
  holdingsSource: string | null; // 持股實際是從哪個網址解析出來的
};

// 從投信的 PCF 頁面取持股：先試 JSON，再試伺服器端算好的 HTML 表格。
// 注意：部分投信（如統一 ezmoney）有 bot 偵測，會對非瀏覽器客戶端無限 302，
// 所以這裡不跟隨轉址——遇到 3xx 直接放棄，避免每次請求都去打對方站台十幾次。
async function fetchIssuerHoldings(
  pcfUrl: string,
  ticker: string,
): Promise<{ holdings: EtfHolding[]; via: string | null }> {
  const probe = await fetch(pcfUrl, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/json,*/*" },
    redirect: "manual",
    cache: "no-store",
  });
  if (probe.status >= 300 && probe.status < 400) return { holdings: [], via: null };

  const text = await probe.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 不是 JSON，往下用 HTML 表格解析
  }

  if (json !== null) {
    const scope = narrowToTicker(json, ticker) ?? json;
    const holdings = extractHoldings(scope);
    if (holdings.length > 0) return { holdings, via: `${pcfUrl} (json)` };
  }

  const fromHtml = parseHtmlTables(text);
  if (fromHtml.length > 0) return { holdings: fromHtml, via: `${pcfUrl} (html)` };

  return { holdings: [], via: null };
}

// TWSE 的 ETF 商品資訊 API（頁面 content.html 上宣告的 data-api，實測可用）。
// 參數名是 id，不是常見的 stkNo／stockNo。
const productContentUrl = (ticker: string) =>
  `https://www.twse.com.tw/rwd/zh/ETF/productContent?id=${ticker}`;

type TwseTable = { title?: string; fields?: string[]; data?: string[][] };

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

// 依欄位名取值，不用固定索引，TWSE 調整欄位順序也不會錯位
function pickField(table: TwseTable | undefined, field: string): string | null {
  if (!table?.fields || !table.data?.[0]) return null;
  const i = table.fields.indexOf(field);
  if (i < 0) return null;
  const v = table.data[0][i];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await params;
  const ticker = (raw || "").trim().toUpperCase();
  const customUrl = req.nextUrl.searchParams.get("url");
  const discover = req.nextUrl.searchParams.get("discover") === "1";

  if (!/^\d{4,6}[A-Z]?$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "代號格式不正確" }, { status: 400 });
  }

  // 探測任一 twse 端點，用來驗證新發現的資料來源，不必改 code 重新部署
  if (customUrl) {
    if (!/^https:\/\/([a-z0-9-]+\.)*twse\.com\.tw\//i.test(customUrl)) {
      return NextResponse.json({ ok: false, error: "只接受 twse.com.tw 的網址" }, { status: 400 });
    }
    const { status, text, json } = await fetchJson(customUrl);
    const scope = json === null ? null : (narrowToTicker(json, ticker) ?? json);
    return NextResponse.json({
      ok: true,
      ticker,
      probe: { url: customUrl, status, holdings: scope ? extractHoldings(scope).length : 0, sample: text.slice(0, 500) },
    });
  }

  try {
    const { json } = await fetchJson(productContentUrl(ticker));
    const payload = json as { stat?: string; tables?: TwseTable[] } | null;

    if (!payload || payload.stat !== "ok" || !payload.tables?.length) {
      return NextResponse.json(
        { ok: false, error: payload?.stat === "沒有此資料!" ? "TWSE 查無這檔 ETF" : "TWSE 回應異常" },
        { status: 404 },
      );
    }

    const basic = payload.tables[0];
    // TWSE 只在這個欄位放「各投信 PCF 頁面的連結」，本身不提供成分股
    const pcfTable = payload.tables.find((t) => /PCF|申購買回/.test(t.title ?? ""));
    const pcfUrl = pcfTable?.data?.[0]?.[0]?.trim() || null;

    const info: EtfInfo = {
      ticker,
      name: pickField(basic, "ETF簡稱"),
      fullName: pickField(basic, "名稱"),
      category: pickField(basic, "ETF類別"),
      listedDate: pickField(basic, "上市日期"),
      issuer: pickField(basic, "基金經理公司"),
      issuerSite: pickField(basic, "基金經理公司網站"),
      pcfUrl: pcfUrl && /^https?:\/\//.test(pcfUrl) ? pcfUrl : null,
    };

    // TWSE 不提供成分股，持股要再往投信的 PCF 頁面取
    let holdings: EtfHolding[] = [];
    let holdingsSource: string | null = null;

    if (info.pcfUrl) {
      try {
        const result = await fetchIssuerHoldings(info.pcfUrl, ticker);
        holdings = result.holdings;
        holdingsSource = result.via;
      } catch {
        // 投信網站抓不到就只回 TWSE 的基本資料
      }
    }

    // 投信頁多半是 JS 應用，抓不到持股時列出頁面裡的端點，方便定位真正的資料來源
    if (discover) {
      const probe = info.pcfUrl ? await fetchJson(info.pcfUrl).catch(() => null) : null;
      return NextResponse.json({
        ok: true,
        ticker,
        pcfUrl: info.pcfUrl,
        holdings: holdings.length,
        holdingsSource,
        page: probe
          ? {
              status: probe.status,
              size: probe.text.length,
              urls: extractUrls(probe.text, ["api", "json", "pcf", "etf", "fund", "holding", ".js"]),
              sample: probe.text.slice(0, 400),
            }
          : null,
      });
    }

    const data: EtfHoldingsData = {
      ...info,
      source: "twse-rwd-productContent",
      holdings,
      holdingsSource,
    };

    return NextResponse.json(
      { ok: true, ...data },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "查詢失敗" },
      { status: 502 },
    );
  }
}
