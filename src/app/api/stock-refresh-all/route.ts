import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/lib/stock-list";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const tpexSet = new Set(
  categories.flatMap((c) => c.stocks.filter((s) => s.market === "tpex").map((s) => s.ticker))
);

const nameMap = new Map(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

type PriceRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// ─── Fetch helpers (duplicated to keep this route self-contained) ───

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
      const volume = parseNum(row[1]) * 1000;
      if (close <= 0) return [];
      return [{ date: isoDate, open: open || close, high: high || close, low: low || close, close, volume }];
    });
  } catch { return []; }
}

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

async function fetchFugle(ticker: string, fromDate?: string): Promise<PriceRow[]> {
  const apiKey = process.env.FUGLE_API_KEY;
  if (!apiKey) return [];
  const to = new Date().toISOString().slice(0, 10);
  const from = fromDate ?? new Date(Date.now() - 366 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const url = `https://api.fugle.tw/marketdata/v1.0/stock/historical/candles/${ticker}?resolution=D&from=${from}&to=${to}`;
  try {
    const res = await withTimeout(
      fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Authorization: `Bearer ${apiKey}` }, cache: "no-store" }),
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

function buildMonthRange(): { year: number; month: number }[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

async function fetchFullYear(ticker: string, isTpex: boolean): Promise<PriceRow[]> {
  const months = buildMonthRange();
  const all: PriceRow[] = [];
  const fetcher = isTpex ? fetchTpexMonth : fetchTwseMonth;
  const delayMs = isTpex ? 400 : 500;

  for (let i = 0; i < months.length; i++) {
    const { year, month } = months[i];
    const rows = await fetcher(ticker, year, month);
    all.push(...rows);
    if (i < months.length - 1) await delay(delayMs);
  }

  if (all.length === 0) {
    const fugle = await fetchFugle(ticker);
    if (fugle.length > 0) return fugle;
  }

  return all.sort((a, b) => a.date.localeCompare(b.date));
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

// ─── Route handler ───

export async function GET(req: NextRequest) {
  const threshold = parseInt(req.nextUrl.searchParams.get("threshold") ?? "220");
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  const sb = getSupabase();
  const allTickers = categories.flatMap((c) => c.stocks.map((s) => s.ticker));

  const toRefresh: { ticker: string; name: string; count: number }[] = [];

  for (const ticker of allTickers) {
    const { count } = await sb
      .from("dmao_stock_prices")
      .select("*", { count: "exact", head: true })
      .eq("ticker", ticker);
    if ((count ?? 0) < threshold) {
      toRefresh.push({ ticker, name: nameMap.get(ticker) ?? ticker, count: count ?? 0 });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      mode: "dry-run",
      threshold,
      toRefresh: toRefresh.length,
      stocks: toRefresh,
    });
  }

  const results: { ticker: string; name: string; before: number; after: number; status: string }[] = [];

  for (let i = 0; i < toRefresh.length; i++) {
    const { ticker, name, count: before } = toRefresh[i];
    const isTpex = tpexSet.has(ticker);

    try {
      await sb.from("dmao_stock_prices").delete().eq("ticker", ticker);
      const prices = await fetchFullYear(ticker, isTpex);
      await upsertToDb(ticker, prices);
      results.push({ ticker, name, before, after: prices.length, status: "ok" });
    } catch (e) {
      results.push({ ticker, name, before, after: 0, status: `error: ${e}` });
    }

    if (i < toRefresh.length - 1) await delay(1500);
  }

  return NextResponse.json({
    mode: "refresh",
    threshold,
    processed: results.length,
    results,
  });
}
