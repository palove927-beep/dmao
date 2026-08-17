import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/lib/stock-list";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const nameMap = new Map(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

const tpexSet = new Set(
  categories.flatMap((c) => c.stocks.filter((s) => s.market === "tpex").map((s) => s.ticker))
);

type PriceRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMonthsSequentially<T>(
  months: { year: number; month: number }[],
  fetcher: (year: number, month: number) => Promise<T[]>,
  delayMs = 400,
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < months.length; i++) {
    const { year, month } = months[i];
    let rows = await fetcher(year, month);
    if (rows.length === 0) {
      await delay(delayMs);
      rows = await fetcher(year, month);
    }
    all.push(...rows);
    if (i < months.length - 1) await delay(delayMs);
  }
  return all;
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// ─── Supabase ────────────────────────────────────────────

async function readFromDb(ticker: string): Promise<PriceRow[]> {
  const sb = getSupabase();
  const oneYearAgo = new Date(Date.now() - 366 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("dmao_stock_prices")
    .select("date, open, high, low, close, volume")
    .eq("ticker", ticker)
    .gte("date", oneYearAgo)
    .order("date", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    date: r.date,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume ?? 0),
  }));
}

async function getLatestDate(ticker: string): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("dmao_stock_prices")
    .select("date")
    .eq("ticker", ticker)
    .order("date", { ascending: false })
    .limit(1);
  return data?.[0]?.date ?? null;
}

async function upsertToDb(ticker: string, rows: PriceRow[]) {
  if (rows.length === 0) return;
  const sb = getSupabase();
  const records = rows.map((r) => ({
    ticker,
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    updated_at: new Date().toISOString(),
  }));
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    await sb
      .from("dmao_stock_prices")
      .upsert(records.slice(i, i + BATCH), { onConflict: "ticker,date" });
  }
}

// ─── Fugle MarketData API ────────────────────────────────

async function fetchFugle(ticker: string, fromDate?: string): Promise<PriceRow[]> {
  const apiKey = process.env.FUGLE_API_KEY;
  if (!apiKey) return [];

  const to = new Date().toISOString().slice(0, 10);
  const from = fromDate ?? new Date(Date.now() - 366 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const url = `https://api.fugle.tw/marketdata/v1.0/stock/historical/candles/${ticker}?resolution=D&from=${from}&to=${to}`;

  try {
    const res = await withTimeout(
      fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Authorization": `Bearer ${apiKey}` }, cache: "no-store" }),
      8000
    );
    if (!res.ok) return [];
    const json = await res.json();
    const candles: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> =
      json?.candles ?? json?.data?.candles ?? json?.data ?? [];
    if (!Array.isArray(candles)) return [];
    return candles
      .filter((c) => c.date && c.close > 0)
      .map((c) => ({
        date: c.date.slice(0, 10),
        open: c.open ?? c.close,
        high: c.high ?? c.close,
        low: c.low ?? c.close,
        close: c.close,
        volume: c.volume ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

// ─── TPEX monthly API ────────────────────────────────────
// fields: 日期, 成交張數, 成交仟元, 開盤, 最高, 最低, 收盤, 漲跌, 筆數

async function fetchTpexMonth(stockNo: string, year: number, month: number): Promise<PriceRow[]> {
  const d = `${year}/${String(month).padStart(2, "0")}/01`;
  const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?date=${d}&code=${stockNo}&response=json`;
  try {
    const res = await withTimeout(
      fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }),
      10000
    );
    if (!res.ok) return [];
    const json = await res.json();
    const rows: string[][] = json?.tables?.[0]?.data;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      const parts = row[0].split("/");
      if (parts.length !== 3) return [];
      const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      const open = parseNum(row[3]);
      const high = parseNum(row[4]);
      const low = parseNum(row[5]);
      const close = parseNum(row[6]);
      const volume = parseNum(row[1]) * 1000; // 張 → 股
      if (close <= 0) return [];
      return [{ date: isoDate, open: open || close, high: high || close, low: low || close, close, volume }];
    });
  } catch { return []; }
}

async function fetchTpex(ticker: string, sinceDate?: string): Promise<PriceRow[]> {
  const months = buildMonthRange(sinceDate);
  const all = await fetchMonthsSequentially(months, (y, m) => fetchTpexMonth(ticker, y, m), 400);
  all.sort((a, b) => a.date.localeCompare(b.date));
  return sinceDate ? all.filter((r) => r.date > sinceDate) : all;
}

// ─── TWSE monthly API ────────────────────────────────────
// fields: 日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數

function parseTwseRows(rows: string[][]): PriceRow[] {
  return rows.flatMap((row) => {
    const parts = row[0].split("/");
    if (parts.length !== 3) return [];
    const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1]}-${parts[2]}`;
    const open = parseNum(row[3]);
    const high = parseNum(row[4]);
    const low = parseNum(row[5]);
    const close = parseNum(row[6]);
    const volume = parseNum(row[1]);
    if (close <= 0) return [];
    return [{ date: isoDate, open: open || close, high: high || close, low: low || close, close, volume }];
  });
}

async function fetchTwseMonth(stockNo: string, year: number, month: number): Promise<PriceRow[]> {
  const date = `${year}${String(month).padStart(2, "0")}01`;
  try {
    const res = await withTimeout(
      fetch(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${stockNo}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }),
      10000
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return [];
    return parseTwseRows(json.data);
  } catch { return []; }
}

async function fetchTwse(ticker: string, sinceDate?: string): Promise<PriceRow[]> {
  const months = buildMonthRange(sinceDate);
  const all = await fetchMonthsSequentially(months, (y, m) => fetchTwseMonth(ticker, y, m), 500);
  all.sort((a, b) => a.date.localeCompare(b.date));
  return sinceDate ? all.filter((r) => r.date > sinceDate) : all;
}

// ─── Helpers ─────────────────────────────────────────────

function buildMonthRange(sinceDate?: string): { year: number; month: number }[] {
  const now = new Date();
  if (sinceDate) {
    const start = new Date(sinceDate);
    const months: { year: number; month: number }[] = [];
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    while (d <= now) {
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      d.setMonth(d.getMonth() + 1);
    }
    return months;
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

function taiwanToday(): string {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  return tw.toISOString().slice(0, 10);
}

function isStale(latestDate: string): boolean {
  const today = taiwanToday();
  if (latestDate >= today) return false;
  const twNow = new Date(Date.now() + 8 * 3600 * 1000);
  const dayOfWeek = twNow.getUTCDay();
  // Saturday: latest should be Friday (1 day ago)
  // Sunday: latest should be Friday (2 days ago)
  // Monday before 15:00: latest should be Friday (3 days ago at most)
  const diff = (new Date(today).getTime() - new Date(latestDate).getTime()) / (24 * 3600 * 1000);
  if (dayOfWeek === 6) return diff > 1; // Saturday
  if (dayOfWeek === 0) return diff > 2; // Sunday
  if (dayOfWeek === 1 && twNow.getUTCHours() < 7) return diff > 3; // Monday before 15:00 TW (07:00 UTC)
  return diff > 1;
}

// ─── Fetch external data (TWSE/TPEX + Fugle fallback) ───

// 未列在 stock-list 的代碼（比價頁可自由加入）無從得知上市或上櫃，
// 因此兩個市場都試過才放棄。
async function fetchExternal(ticker: string, isTpex: boolean, sinceDate?: string): Promise<PriceRow[]> {
  if (isTpex) {
    const tpexPrices = await fetchTpex(ticker, sinceDate);
    if (tpexPrices.length > 0) return tpexPrices;
    const fuglePrices = await fetchFugle(ticker, sinceDate);
    if (fuglePrices.length > 0) return fuglePrices;
    return fetchTwse(ticker, sinceDate);
  }
  const twsePrices = await fetchTwse(ticker, sinceDate);
  if (twsePrices.length > 0) return twsePrices;
  const fuglePrices = await fetchFugle(ticker, sinceDate);
  if (fuglePrices.length > 0) return fuglePrices;
  return fetchTpex(ticker, sinceDate);
}

// ─── Route handler ───────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const isTpex = tpexSet.has(ticker);

  // ?debug=1 returns diagnostic info
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const diag: Record<string, unknown> = { ticker, isTpex, hasFugleKey: !!process.env.FUGLE_API_KEY };
    const latestDate = await getLatestDate(ticker).catch(() => null);
    diag.db = { latestDate, isStale: latestDate ? isStale(latestDate) : true };

    if (isTpex) {
      const now = new Date();
      const tpexUrl = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?date=${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/01&code=${ticker}&response=json`;
      try {
        const res = await fetch(tpexUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        const text = await res.text();
        diag.tpex = { status: res.status, url: tpexUrl, bodyPreview: text.slice(0, 500) };
      } catch (e) { diag.tpex = { error: String(e) }; }
    } else {
      const twseUrl = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}01&stockNo=${ticker}`;
      try {
        const res = await fetch(twseUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        const text = await res.text();
        diag.twse = { status: res.status, bodyPreview: text.slice(0, 500) };
      } catch (e) { diag.twse = { error: String(e) }; }
    }

    return NextResponse.json(diag);
  }

  try {
    // ?refresh=1 forces a full re-fetch
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

    // 1. Read existing data from Supabase
    const latestDate = await getLatestDate(ticker);
    const needsFetch = forceRefresh || !latestDate || isStale(latestDate);

    // 2. Fetch missing data from external API if needed
    if (needsFetch) {
      const sinceDate = forceRefresh ? undefined : (latestDate ?? undefined);
      const newData = await fetchExternal(ticker, isTpex, sinceDate);

      if (newData.length > 0) {
        await upsertToDb(ticker, newData).catch(() => {});
      } else if (latestDate) {
        // Incremental fetch returned nothing — data might be from wrong source
        // (e.g. stock transferred from TPEX to TWSE). Try full re-fetch.
        const today = taiwanToday();
        const gap = (new Date(today).getTime() - new Date(latestDate).getTime()) / (24 * 3600 * 1000);
        if (gap > 3) {
          const fullData = await fetchExternal(ticker, isTpex);
          if (fullData.length > 0) {
            await upsertToDb(ticker, fullData).catch(() => {});
          }
        }
      }
    }

    // 3. Read full dataset from DB
    const prices = await readFromDb(ticker);

    if (prices.length > 0) {
      return NextResponse.json({
        ok: true,
        ticker,
        name: nameMap.get(ticker) ?? ticker,
        currency: "TWD",
        prices,
        source: needsFetch ? "api+db" : "db",
      });
    }

    // 4. DB still empty — try direct external fetch as last resort
    const directPrices = await fetchExternal(ticker, isTpex);
    if (directPrices.length > 0) {
      await upsertToDb(ticker, directPrices).catch(() => {});
      return NextResponse.json({
        ok: true,
        ticker,
        name: nameMap.get(ticker) ?? ticker,
        currency: "TWD",
        prices: directPrices,
        source: "api",
      });
    }

    return NextResponse.json({ ok: false, error: "查無資料" }, { status: 404 });
  } catch {
    // Supabase unavailable — fall back to direct external fetch
    const prices = await fetchExternal(ticker, isTpex);
    if (prices.length > 0) {
      return NextResponse.json({
        ok: true,
        ticker,
        name: nameMap.get(ticker) ?? ticker,
        currency: "TWD",
        prices,
        source: "api-fallback",
      });
    }
    return NextResponse.json({ ok: false, error: "查無資料" }, { status: 404 });
  }
}
