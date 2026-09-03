import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { sectorTiers, allSectorStocks } from "@/lib/sector-groups";
import { RANGES, type RangeKey } from "@/lib/sector-range";
import { isStale } from "@/lib/market-day";

export const dynamic = "force-dynamic";

// 往回推 n 個月，日數超過目標月份長度時夾到月底。
// 直接用 setMonth(-1) 會溢位：3/31 會變成 3/3（2/31 進位），
// 「一個月」就縮成三天。
function monthsAgo(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const r = new Date(d);
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() - n);
  const daysInMonth = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, daysInMonth));
  return r;
}

function baseDateFor(range: RangeKey, now = new Date()): string {
  const d = new Date(now);
  if (range === "1w") d.setUTCDate(d.getUTCDate() - 7);
  else if (range === "2w") d.setUTCDate(d.getUTCDate() - 14);
  else if (range === "1m") return monthsAgo(d, 1).toISOString().slice(0, 10);
  else if (range === "3m") return monthsAgo(d, 3).toISOString().slice(0, 10);
  else if (range === "6m") return monthsAgo(d, 6).toISOString().slice(0, 10);
  else if (range === "1y") return monthsAgo(d, 12).toISOString().slice(0, 10);
  else if (range === "ytd") return `${d.getUTCFullYear()}-01-01`;
  return d.toISOString().slice(0, 10);
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type PriceRow = { ticker: string; date: string; close: number | string };

// 讀取策略依區間而定：
// 一週／兩週：整段每日收盤都讀，走勢圖用日線，約一到兩千列。
// 一個月以上：讀整段是四萬列起跳，只為了一張迷你圖不划算，改成
//   先問出交易日、每週取最後一個交易日，再只讀那些日期的收盤。
//   一年因此從約四萬列降到約一萬列，走勢的形狀幾乎看不出差別。
const WINDOW_DAYS = 14;
const allTickers = allSectorStocks.map((s) => s.ticker);

// 推交易日曆用的樣本檔數。全表撈日期跟撈整段一樣貴，
// 取幾檔分散在清單裡的個股，聯集就是這段期間的交易日。
const CALENDAR_SAMPLE = 8;

function calendarTickers(): string[] {
  const step = Math.max(1, Math.floor(allTickers.length / CALENDAR_SAMPLE));
  return allTickers.filter((_, i) => i % step === 0).slice(0, CALENDAR_SAMPLE);
}

// 該日期所屬那一週的週一，當作分組用的 key
function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// 每週取最後一個交易日；區間的第一天與最後一天一定保留，
// 起算價與末端漲跌幅才對得上顯示的數字
function weeklyDates(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const lastOfWeek = new Map<string, string>();
  for (const d of dates) lastOfWeek.set(weekKey(d), d); // dates 已排序，後蓋前
  const picked = new Set(lastOfWeek.values());
  picked.add(dates[0]);
  picked.add(dates[dates.length - 1]);
  return [...picked].sort();
}

// 代碼分批帶入 in()，避免 181 檔一次塞進 query string 讓 URL 過長
// （/api/annotations 的 mates 查詢也是同樣理由分批）
const TICKER_CHUNK = 100;

// 只讀 date 欄、只讀樣本檔，用來推出這段期間有哪些交易日
async function readTradingDays(from: string, to: string): Promise<{ dates: string[]; error: string | null }> {
  const res = await fetchAllRows<{ date: string }>((offset, last) =>
    getSupabase()
      .from("dmao_stock_prices")
      .select("date")
      .in("ticker", calendarTickers())
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, last)
  );
  return { dates: [...new Set(res.rows.map((r) => r.date))].sort(), error: res.error };
}

async function readDates(dates: string[]): Promise<{ rows: PriceRow[]; error: string | null }> {
  if (dates.length === 0) return { rows: [], error: null };
  const rows: PriceRow[] = [];
  for (let i = 0; i < allTickers.length; i += TICKER_CHUNK) {
    const ids = allTickers.slice(i, i + TICKER_CHUNK);
    const res = await fetchAllRows<PriceRow>((offset, last) =>
      getSupabase()
        .from("dmao_stock_prices")
        .select("ticker, date, close")
        .in("ticker", ids)
        .in("date", dates)
        .order("ticker", { ascending: true })
        .order("date", { ascending: true })
        .range(offset, last)
    );
    if (res.error) return { rows, error: res.error };
    for (const r of res.rows) rows.push(r);
  }
  return { rows, error: null };
}

async function readRange(from: string, to: string): Promise<{ rows: PriceRow[]; error: string | null }> {
  const rows: PriceRow[] = [];
  for (let i = 0; i < allTickers.length; i += TICKER_CHUNK) {
    const ids = allTickers.slice(i, i + TICKER_CHUNK);
    const res = await fetchAllRows<PriceRow>((offset, last) =>
      getSupabase()
        .from("dmao_stock_prices")
        .select("ticker, date, close")
        .in("ticker", ids)
        .gte("date", from)
        .lte("date", to)
        .order("ticker", { ascending: true })
        .order("date", { ascending: true })
        .range(offset, last)
    );
    if (res.error) return { rows, error: res.error };
    for (const r of res.rows) rows.push(r);
  }
  return { rows, error: null };
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get("range");
  // 未指定或指定了無效值時的預設，與頁面的預設區間一致
  const range: RangeKey =
    RANGES.find((r) => r.key === rangeParam)?.key ?? "2w";

  const baseDate = baseDateFor(range);
  const today = new Date().toISOString().slice(0, 10);

  // 一週／兩週用日線，一個月以上改成每週一點
  const daily = range === "1w" || range === "2w";
  const sampling: "daily" | "weekly" = daily ? "daily" : "weekly";

  let rows: PriceRow[];
  let seriesDates: string[] = [];

  if (daily) {
    const res = await readRange(baseDate, today);
    if (res.error) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    rows = res.rows;
  } else {
    const cal = await readTradingDays(baseDate, today);
    if (cal.error) return NextResponse.json({ ok: false, error: cal.error }, { status: 500 });
    seriesDates = weeklyDates(cal.dates);

    // 每週那一點之外，另外讀起算日與最近各 14 天兩個窗口：
    // 個別個股停牌或資料落後時，它的起算價與最新價不見得落在週取樣日上
    const [weekly, base, latest] = await Promise.all([
      readDates(seriesDates),
      readRange(baseDate, shift(baseDate, WINDOW_DAYS)),
      readRange(shift(today, -WINDOW_DAYS), today),
    ]);
    const err = weekly.error ?? base.error ?? latest.error;
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });
    rows = [...weekly.rows, ...base.rows, ...latest.rows];
  }

  // 每檔的每日收盤，以及該檔的起算價（區間內第一筆）與最新價（最後一筆）
  const closesByTicker = new Map<string, Map<string, number>>();
  const basePrice = new Map<string, { date: string; close: number }>();
  const lastPrice = new Map<string, { date: string; close: number }>();
  const dateSet = new Set<string>();

  for (const r of rows) {
    const close = Number(r.close);
    if (!(close > 0)) continue;
    dateSet.add(r.date);

    let byDate = closesByTicker.get(r.ticker);
    if (!byDate) { byDate = new Map(); closesByTicker.set(r.ticker, byDate); }
    byDate.set(r.date, close);

    const b = basePrice.get(r.ticker);
    if (!b || r.date < b.date) basePrice.set(r.ticker, { date: r.date, close });
    const l = lastPrice.get(r.ticker);
    if (!l || r.date > l.date) lastPrice.set(r.ticker, { date: r.date, close });
  }

  // 走勢圖的取樣點：交易日可能有兩百多天，抽稀到最多 120 點，
  // 畫在幾十像素寬的迷你圖上看不出差別，回傳量卻少一半以上。
  // 一定保留最後一天，線的末端才會對得上顯示的漲跌幅。
  const MAX_POINTS = 120;
  const allDates = [...dateSet].sort();
  let sampled: string[];
  if (daily) {
    const step = Math.max(1, Math.ceil(allDates.length / MAX_POINTS));
    sampled = allDates.filter((_, i) => i % step === 0);
    if (allDates.length > 0 && sampled[sampled.length - 1] !== allDates[allDates.length - 1]) {
      sampled.push(allDates[allDates.length - 1]);
    }
  } else {
    // 週取樣日裡實際有資料的那些（沒讀到資料的日期畫出來會是斷點）
    sampled = seriesDates.filter((d) => dateSet.has(d));
  }

  const missing: { ticker: string; name: string }[] = [];
  // 完全沒有資料、或最新一筆已經落後的個股，交給前端逐檔補。
  // 補的動作走 /api/stock-history，那支本來就是增量的：
  // 它會從 DB 最新日期往後抓，所以隔一週才開也會把整週補齊。
  const stale: string[] = [];
  for (const s2 of allSectorStocks) {
    const l = lastPrice.get(s2.ticker);
    if (!l || isStale(l.date)) stale.push(s2.ticker);
  }

  const tiers = sectorTiers.map((tier) => ({
    tier: tier.tier,
    groups: tier.groups.map((g) => {
      const stocks = g.stocks.map((s) => {
        const b = basePrice.get(s.ticker);
        const l = lastPrice.get(s.ticker);
        const changePercent = b && l ? ((l.close - b.close) / b.close) * 100 : null;
        if (changePercent === null) missing.push({ ticker: s.ticker, name: s.name });
        return {
          ticker: s.ticker,
          name: s.name,
          market: s.market ?? null,
          temp: s.temp ?? null,
          basePrice: b?.close ?? null,
          baseDate: b?.date ?? null,
          price: l?.close ?? null,
          priceDate: l?.date ?? null,
          changePercent,
        };
      });

      // 族群漲幅＝成分股漲幅的等權平均（不按市值加權）
      const covered = stocks.filter((s) => s.changePercent !== null);
      const changePercent =
        covered.length > 0
          ? covered.reduce((sum, s) => sum + s.changePercent!, 0) / covered.length
          : null;

      // 走勢：每個取樣日都用「當天有報價的成分股」重算一次等權平均漲幅。
      // 當天沒報價的個股（停牌、尚未補到資料）不列入該點的分母。
      const members = g.stocks
        .map((s) => ({ base: basePrice.get(s.ticker)?.close, closes: closesByTicker.get(s.ticker) }))
        .filter((m): m is { base: number; closes: Map<string, number> } => !!m.base && !!m.closes);

      const series = sampled.map((d) => {
        let sum = 0;
        let n = 0;
        for (const m of members) {
          const c = m.closes.get(d);
          if (c === undefined) continue;
          sum += ((c - m.base) / m.base) * 100;
          n += 1;
        }
        return n > 0 ? Number((sum / n).toFixed(2)) : null;
      });

      return {
        id: g.id,
        label: g.label,
        tier: tier.tier,
        changePercent,
        total: stocks.length,
        covered: covered.length,
        series,
        stocks,
      };
    }),
  }));

  // asOf＝最新一筆收盤的日期；baseAsOf＝起算日之後第一個有交易的日子。
  // 兩者都是「多數個股」的基準日，個股落後時前端會逐檔標出來。
  const lastDates = [...lastPrice.values()].map((v) => v.date).sort();
  const baseDates = [...basePrice.values()].map((v) => v.date).sort();

  return NextResponse.json({
    ok: true,
    range,
    baseDate,
    asOf: lastDates[lastDates.length - 1] ?? null,
    baseAsOf: baseDates[0] ?? null,
    hasSeries: true,
    sampling,
    dates: sampled,
    tiers,
    missing,
    stale,
  });
}
