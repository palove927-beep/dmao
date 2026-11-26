// 總經儀表板的資料存取：Yahoo 日線 → Supabase（macro_prices），並逐日記錄非常態訊號。
// 每次 /api/macro 執行時都會補齊：
//   - 價格：保留至少兩年（不滿兩年就往前補）；並從最後一筆日期往後補到今天（中間幾天沒開也會一次補齊）
//   - 訊號：從最後檢查過的日期往後逐日重算；最近 3 天每次都重算，盤中數字收盤後會被更正
import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { MACRO_INSTRUMENTS, buildQuote, macroSignals, type MacroQuote, type MacroSignal } from "@/lib/macro";

const UA = { "User-Agent": "Mozilla/5.0" };
const DAY = 24 * 3600 * 1000;
const RECHECK_DAYS = 3;
// 兩年均線需要約 480 個交易日，讀回最近約 2.2 年
const HISTORY_DAYS = 800;

export type PriceRow = { key: string; date: string; close: number };
export type LivePrice = Record<string, number | null>;

type YahooResult = { live: number | null; rows: PriceRow[] };

async function fetchYahoo(key: string, symbol: string, query: string): Promise<YahooResult> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}&interval=1d`,
    { headers: UA, cache: "no-store", signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`Yahoo ${symbol} ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const closes: unknown[] = r?.indicators?.quote?.[0]?.close ?? [];
  // 時間戳加上交易所時差，日期才會落在當地的交易日
  const offset: number = r?.meta?.gmtoffset ?? 0;
  const rows: PriceRow[] = [];
  ts.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      rows.push({ key, date: new Date((t + offset) * 1000).toISOString().slice(0, 10), close: c });
    }
  });
  const live = r?.meta?.regularMarketPrice;
  return { live: typeof live === "number" && Number.isFinite(live) ? live : null, rows };
}

// 櫃買指數：櫃買中心按月查詢（民國年），Yahoo 只有當日一筆、沒有歷史。
// 收盤後才有當天資料，沒有盤中即時價，現價就用最後一筆收盤。
async function fetchTpexIndex(key: string, from: Date): Promise<YahooResult> {
  const months: { y: number; m: number }[] = [];
  const end = new Date();
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  }
  const rows: PriceRow[] = [];
  // 一次 3 個月，避免對櫃買中心同時發太多請求
  for (let i = 0; i < months.length; i += 3) {
    const results = await Promise.all(months.slice(i, i + 3).map(async ({ y, m }) => {
      const res = await fetch(
        `https://www.tpex.org.tw/web/stock/iNdex_info/inxh/Inx_result.php?l=zh-tw&d=${y - 1911}/${String(m).padStart(2, "0")}&o=json`,
        { headers: UA, cache: "no-store", signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error(`TPEx ${y}/${m} ${res.status}`);
      const json = await res.json();
      const data: string[][] = json?.tables?.[0]?.data ?? [];
      return data.map((r) => ({ key, date: r[0].replace(/\//g, "-"), close: Number(String(r[4]).replace(/,/g, "")) }));
    }));
    for (const r of results.flat()) if (r.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) rows.push(r);
  }
  return { live: rows.at(-1)?.close ?? null, rows };
}

// 美國財政部每日殖利率曲線（CSV，按年份）。只有收盤後的官方數字，現價就用最後一筆。
async function fetchTreasury(key: string, column: string, from: Date): Promise<YahooResult> {
  const rows: PriceRow[] = [];
  for (let y = from.getUTCFullYear(); y <= new Date().getUTCFullYear(); y++) {
    const res = await fetch(
      `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`,
      { headers: UA, cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`Treasury ${y} ${res.status}`);
    const [header, ...lines] = (await res.text()).trim().split(/\r?\n/);
    const cols = header.split(",").map((c) => c.replace(/"/g, ""));
    const idx = cols.indexOf(column);
    if (idx < 0) throw new Error(`Treasury column ${column} not found`);
    for (const line of lines) {
      const f = line.split(",");
      const [mm, dd, yyyy] = f[0].split("/");
      const v = Number(f[idx]);
      if (yyyy && v > 0) rows.push({ key, date: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`, close: v });
    }
  }
  const since = from.toISOString().slice(0, 10);
  const sorted = rows.filter((r) => r.date >= since).sort((a, b) => a.date.localeCompare(b.date));
  return { live: sorted.at(-1)?.close ?? null, rows: sorted };
}

// 依資料來源抓 from 之後的日線
function fetchSince(m: { key: string; symbol: string; source?: "tpex" | "treasury" }, from: Date, yahooQuery: string) {
  if (m.source === "tpex") return fetchTpexIndex(m.key, from);
  if (m.source === "treasury") return fetchTreasury(m.key, m.symbol, from);
  return fetchYahoo(m.key, m.symbol, yahooQuery);
}

async function latestDates(): Promise<Record<string, string | null>> {
  const sb = getSupabase();
  const entries = await Promise.all(
    MACRO_INSTRUMENTS.map(async (m) => {
      const { data, error } = await sb
        .from("macro_prices")
        .select("date")
        .eq("key", m.key)
        .order("date", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return [m.key, data?.[0]?.date ?? null] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function upsertPrices(rows: PriceRow[]) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from("macro_prices")
      .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), { onConflict: "key,date" });
    if (error) throw new Error(error.message);
  }
}

// 補價格，同時回傳 Yahoo 的即時價（盤中顯示用）
// 歷史至少保留兩年，兩年均線（480 日）才算得出來
const BACKFILL_DAYS = 2 * 365 + 7;

async function earliestDates(): Promise<Record<string, string | null>> {
  const sb = getSupabase();
  const entries = await Promise.all(
    MACRO_INSTRUMENTS.map(async (m) => {
      const { data, error } = await sb
        .from("macro_prices")
        .select("date")
        .eq("key", m.key)
        .order("date", { ascending: true })
        .limit(1);
      if (error) throw new Error(error.message);
      return [m.key, data?.[0]?.date ?? null] as const;
    }),
  );
  return Object.fromEntries(entries);
}

const yahooRange = (from: Date, to: Date) =>
  `period1=${Math.floor(from.getTime() / 1000)}&period2=${Math.floor(to.getTime() / 1000)}`;

// 補價格，同時回傳 Yahoo 的即時價（盤中顯示用）。
// backfilled：這次有往前補舊歷史（例如由一年延長到兩年），訊號需要整段重算
export async function syncPrices(): Promise<{ live: LivePrice; backfilled: boolean }> {
  const [latest, earliest] = await Promise.all([latestDates(), earliestDates()]);
  const live: LivePrice = {};
  const now = new Date();
  const target = new Date(now.getTime() - BACKFILL_DAYS * DAY);
  let backfilled = false;
  const fetched = await Promise.all(
    MACRO_INSTRUMENTS.map(async (m) => {
      const last = latest[m.key];
      const first = earliest[m.key];
      const rows: PriceRow[] = [];
      try {
        // 從最後一筆的前一天起抓到今天（包含最後一筆，讓盤中寫入的數字被收盤價更正）；
        // 完全沒有資料時直接抓兩年
        const from = last ? new Date(Date.parse(`${last}T00:00:00Z`) - DAY) : target;
        const r = await fetchSince(m, from, yahooRange(from, now));
        live[m.key] = r.live;
        rows.push(...r.rows);
      } catch {
        live[m.key] = null;
      }
      // 已有資料但不滿兩年：往前補到兩年前（只會發生一次）
      if (first && Date.parse(`${first}T00:00:00Z`) > target.getTime() + 14 * DAY) {
        try {
          const end = new Date(Date.parse(`${first}T00:00:00Z`) + DAY);
          const r = await fetchSince(m, target, yahooRange(target, end));
          const older = r.rows.filter((x) => x.date < first);
          if (older.length > 0) { rows.push(...older); backfilled = true; }
        } catch {
          // 補舊資料失敗不影響今天的數字，下次再試
        }
      }
      return rows;
    }),
  );
  await upsertPrices(fetched.flat());
  return { live, backfilled };
}

// 清空訊號紀錄，下次 syncSignals 會依目前的歷史整段重算
export async function resetSignals() {
  const sb = getSupabase();
  const { error: e1 } = await sb.from("macro_signals").delete().gte("date", "1900-01-01");
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await sb.from("macro_signal_days").delete().gte("date", "1900-01-01");
  if (e2) throw new Error(e2.message);
}

export async function loadHistory(): Promise<Record<string, PriceRow[]>> {
  const since = new Date(Date.now() - HISTORY_DAYS * DAY).toISOString().slice(0, 10);
  const { rows, error } = await fetchAllRows<{ key: string; date: string; close: number | string }>((from, to) =>
    getSupabase()
      .from("macro_prices")
      .select("key, date, close")
      .gte("date", since)
      .order("key", { ascending: true })
      .order("date", { ascending: true })
      .range(from, to),
  );
  if (error) throw new Error(error);
  const out: Record<string, PriceRow[]> = {};
  for (const r of rows) (out[r.key] ??= []).push({ key: r.key, date: r.date, close: Number(r.close) });
  return out;
}

const toTs = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

// 某一天（含）以前的資料算出的各項指標；live 有值時以即時價當現價
export function quotesAsOf(history: Record<string, PriceRow[]>, date?: string, live?: LivePrice): Record<string, MacroQuote> {
  const out: Record<string, MacroQuote> = {};
  for (const m of MACRO_INSTRUMENTS) {
    const all = history[m.key] ?? [];
    const rows = date ? all.filter((r) => r.date <= date) : all;
    const lp = live?.[m.key];
    out[m.key] = buildQuote(
      m.key,
      lp != null ? { regularMarketPrice: lp } : undefined,
      rows.map((r) => r.close),
      rows.map((r) => toTs(r.date)),
    );
  }
  return out;
}

// 要重算訊號的日期：第一次跑是歷史裡的每一天；之後從最後檢查日往前 3 天起
// （中間幾天沒開也會全部補到；最近幾天重算是因為盤中數字在收盤後會變）
export function datesToCheck(history: Record<string, PriceRow[]>, lastChecked?: string): string[] {
  const allDates = [...new Set(Object.values(history).flat().map((r) => r.date))].sort();
  const from = lastChecked
    ? new Date(Date.parse(`${lastChecked}T00:00:00Z`) - RECHECK_DAYS * DAY).toISOString().slice(0, 10)
    : "";
  return allDates.filter((d) => d > from);
}

// 逐日記錄訊號。回傳這次處理的天數
export async function syncSignals(history: Record<string, PriceRow[]>): Promise<number> {
  const sb = getSupabase();
  const { data: lastRow, error } = await sb
    .from("macro_signal_days")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const dates = datesToCheck(history, lastRow?.[0]?.date);
  if (dates.length === 0) return 0;

  const signalRows: (MacroSignal & { date: string })[] = [];
  const dayRows: { date: string; signal_count: number; updated_at: string }[] = [];
  const now = new Date().toISOString();
  for (const d of dates) {
    const sigs = macroSignals(quotesAsOf(history, d));
    for (const s of sigs) signalRows.push({ ...s, date: d });
    dayRows.push({ date: d, signal_count: sigs.length, updated_at: now });
  }

  // 重算的日期先清掉舊訊號，再寫入（某天的訊號可能在收盤後消失）
  const { error: delErr } = await sb.from("macro_signals").delete().gte("date", dates[0]);
  if (delErr) throw new Error(delErr.message);
  for (let i = 0; i < signalRows.length; i += 500) {
    const batch = signalRows.slice(i, i + 500).map((s) => ({
      date: s.date, signal_key: s.key, level: s.level, title: s.title, meaning: s.meaning,
    }));
    const { error: e } = await sb.from("macro_signals").upsert(batch, { onConflict: "date,signal_key" });
    if (e) throw new Error(e.message);
  }
  for (let i = 0; i < dayRows.length; i += 500) {
    const { error: e } = await sb.from("macro_signal_days").upsert(dayRows.slice(i, i + 500), { onConflict: "date" });
    if (e) throw new Error(e.message);
  }
  return dates.length;
}

export type SignalLog = { date: string; signal_key: string; level: "alert" | "watch"; title: string; meaning: string };

export async function recentSignals(days = 365): Promise<SignalLog[]> {
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const { rows, error } = await fetchAllRows<SignalLog>((from, to) =>
    getSupabase()
      .from("macro_signals")
      .select("date, signal_key, level, title, meaning")
      .gte("date", since)
      .order("date", { ascending: false })
      .order("signal_key", { ascending: true })
      .range(from, to),
  );
  if (error) throw new Error(error);
  return rows;
}

// 資料表還沒建立或 Supabase 無法連線時：直接向 Yahoo 抓兩年，跟改版前一樣即時計算
export async function directFromYahoo(): Promise<Record<string, MacroQuote>> {
  const history: Record<string, PriceRow[]> = {};
  const live: LivePrice = {};
  await Promise.all(
    MACRO_INSTRUMENTS.map(async (m) => {
      try {
        const r = await fetchSince(m, new Date(Date.now() - 2 * 365 * DAY), "range=2y");
        history[m.key] = r.rows;
        live[m.key] = r.live;
      } catch {
        history[m.key] = [];
      }
    }),
  );
  return quotesAsOf(history, undefined, live);
}
