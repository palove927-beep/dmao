import { NextRequest, NextResponse } from "next/server";
import { extractHoldings, narrowToTicker, type EtfHolding } from "@/lib/etf-pcf";

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
};

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

    const data: EtfHoldingsData = {
      ticker,
      name: pickField(basic, "ETF簡稱"),
      fullName: pickField(basic, "名稱"),
      category: pickField(basic, "ETF類別"),
      listedDate: pickField(basic, "上市日期"),
      issuer: pickField(basic, "基金經理公司"),
      issuerSite: pickField(basic, "基金經理公司網站"),
      pcfUrl: pcfUrl && /^https?:\/\//.test(pcfUrl) ? pcfUrl : null,
      source: "twse-rwd-productContent",
      // TWSE 不提供成分股，持股要另外從 pcfUrl（各投信網站）取得
      holdings: [],
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
