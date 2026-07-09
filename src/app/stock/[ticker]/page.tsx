"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { categories } from "@/lib/stock-list";
import type { TrackQuote } from "@/app/api/track/route";
import {
  ComposedChart, Bar, BarChart, Cell, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

const nameMap: Record<string, string> = Object.fromEntries(
  categories.flatMap((c) => c.stocks.map((s) => [s.ticker, s.name]))
);

type PricePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type HistoryData = {
  ticker: string;
  name: string;
  prices: PricePoint[];
};

type ChartMode = "candlestick" | "line";
type DateRange = "1m" | "3m" | "6m" | "1y";

const dateRanges: { key: DateRange; label: string; days: number }[] = [
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "6m", label: "6M", days: 180 },
  { key: "1y", label: "1Y", days: 366 },
];

function filterByRange(prices: PricePoint[], range: DateRange): PricePoint[] {
  const days = dateRanges.find((r) => r.key === range)!.days;
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return prices.filter((p) => p.date >= cutoff);
}

function formatDateShort(d: string) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function formatDateFull(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
}

function pickTicks(prices: PricePoint[], count = 10): string[] {
  if (prices.length === 0) return [];
  const step = Math.max(1, Math.floor(prices.length / count));
  return prices.filter((_, i) => i % step === 0).map((p) => p.date);
}

type CandleData = PricePoint & {
  bodyLow: number;
  candleBody: number;
  isUp: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CandlestickShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  const { high, low, bodyLow, candleBody, isUp } = payload as CandleData;
  const bodyHigh = bodyLow + candleBody;

  const fill = isUp ? "#dc2626" : "#16a34a";
  const candleWidth = Math.max(width * 0.7, 1);
  const cx = x + width / 2;
  const bodyX = cx - candleWidth / 2;

  // y = top of visible candle body (bodyHigh in price)
  // y + height = bottom of visible candle body (bodyLow in price)
  // Calculate pixel-per-price scale from the body
  const scale = candleBody > 0 && height > 0 ? height / candleBody : 0;
  const wickTop = scale > 0 ? y - (high - bodyHigh) * scale : y;
  const wickBottom = scale > 0 ? y + height + (bodyLow - low) * scale : y + height;
  const bodyH = Math.max(height, 1);

  return (
    <g>
      <line x1={cx} y1={wickTop} x2={cx} y2={wickBottom} stroke={fill} strokeWidth={1} />
      <rect x={bodyX} y={y} width={candleWidth} height={bodyH} fill={fill} stroke={fill} strokeWidth={0.5} />
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CandlestickTooltip({ active, payload, label }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as CandleData;
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
      padding: "8px 12px", fontSize: 13, lineHeight: 1.7,
    }}>
      <div style={{ fontWeight: "bold", marginBottom: 2 }}>{formatDateFull(label)}</div>
      <div>開盤：<b>{d.open.toFixed(2)}</b></div>
      <div>最高：<b style={{ color: "#dc2626" }}>{d.high.toFixed(2)}</b></div>
      <div>最低：<b style={{ color: "#16a34a" }}>{d.low.toFixed(2)}</b></div>
      <div>收盤：<b>{d.close.toFixed(2)}</b></div>
      {d.volume != null && d.volume > 0 && (
        <div>成交量：<b>{(d.volume / 1000).toLocaleString()}張</b></div>
      )}
    </div>
  );
}

export default function StockDetailPage() {
  const { ticker } = useParams() as { ticker: string };
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("candlestick");
  const [dateRange, setDateRange] = useState<DateRange>("1y");
  const [refreshing, setRefreshing] = useState(false);
  const [quote, setQuote] = useState<TrackQuote | null>(null);

  // 今日即時報價（含當日漲跌）
  useEffect(() => {
    if (!/^\d{4,6}$/.test(ticker)) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/track?tickers=${ticker}`);
        const json = await res.json();
        if (!cancelled && json.ok && json.data[ticker]) setQuote(json.data[ticker]);
      } catch {
        // ignore
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [ticker]);

  const fetchData = useCallback((refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    const url = refresh ? `/api/stock-history/${ticker}?refresh=1` : `/api/stock-history/${ticker}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) { setData(json); setError(null); }
        else setError(json.error ?? "載入失敗");
      })
      .catch(() => setError("網路錯誤"))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [ticker]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allPrices = data?.prices ?? [];
  const prices = filterByRange(allPrices, dateRange);
  const hasOhlc = prices.length > 0 && prices[0].open != null;

  const candleData: CandleData[] = prices.map((p) => {
    const o = p.open ?? p.close;
    const h = p.high ?? p.close;
    const l = p.low ?? p.close;
    const isUp = p.close >= o;
    const bodyLow = Math.min(o, p.close);
    const bodyHigh = Math.max(o, p.close);
    return {
      ...p,
      open: o,
      high: h,
      low: l,
      bodyLow,
      candleBody: Math.max(bodyHigh - bodyLow, 0.01),
      isUp,
    };
  });

  const latest = prices[prices.length - 1]?.close;
  const first = prices[0]?.close;
  const change = latest != null && first != null ? latest - first : null;
  const changePct = change != null && first ? (change / first) * 100 : null;
  const isUp = (change ?? 0) >= 0;
  const rangeLabel = dateRanges.find((r) => r.key === dateRange)!.label;

  const allLows = candleData.map((p) => p.low);
  const allHighs = candleData.map((p) => p.high);
  const minVal = allLows.length ? Math.min(...allLows) : 0;
  const maxVal = allHighs.length ? Math.max(...allHighs) : 0;
  const pad = (maxVal - minVal) * 0.06;
  const yMin = Math.floor((minVal - pad) / 5) * 5;
  const yMax = Math.ceil((maxVal + pad) / 5) * 5;

  const volumeData = candleData.map((p) => ({
    date: p.date,
    volume: p.volume ?? 0,
    isUp: p.isUp,
  }));
  const maxVolume = Math.max(...volumeData.map((v) => v.volume), 0);

  function formatVolume(v: number) {
    if (v >= 1e8) return `${(v / 1e8).toFixed(1)}億`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(0)}萬`;
    return v.toLocaleString();
  }

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 14px",
    fontSize: 13,
    border: "1px solid #1a56db",
    background: active ? "#1a56db" : "#fff",
    color: active ? "#fff" : "#1a56db",
    cursor: "pointer",
    fontWeight: active ? "bold" : "normal",
  });

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", margin: "16px 0 0" }}>
        <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", display: "flex", alignItems: "center" }} title="股票列表">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </a>
      </div>

      <div style={{ margin: "20px 0" }}>
        {loading ? (
          <div style={{ color: "#999" }}>載入中...</div>
        ) : error ? (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 16, color: "#374151", marginBottom: 8 }}>{nameMap[ticker] ?? ticker}</div>
            <div style={{ fontSize: 14, color: "#9ca3af", padding: "20px 0", borderTop: "1px solid #e5e7eb" }}>
              {error}
            </div>
          </div>
        ) : data && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 26, fontWeight: "bold", margin: 0 }}>{data.name}</h1>
              <span style={{ fontSize: 15, color: "#6b7280" }}>{ticker}</span>
            </div>

            {(latest != null || quote?.price != null) && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "10px 0 4px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 32, fontWeight: "bold" }}>
                  {(quote?.price ?? latest)!.toFixed(2)}
                </span>
                {quote?.change != null && quote?.changePercent != null && (
                  <span style={{
                    fontSize: 15,
                    fontWeight: "bold",
                    color: quote.change > 0 ? "#dc2626" : quote.change < 0 ? "#15803d" : "#6b7280",
                  }}>
                    {quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : "—"} {quote.change > 0 ? "+" : ""}{quote.change.toFixed(2)}（{quote.changePercent > 0 ? "+" : ""}{quote.changePercent}%）今日
                  </span>
                )}
                {change != null && changePct != null && (
                  <span style={{ fontSize: 14, fontWeight: "bold", color: isUp ? "#dc2626" : "#15803d" }}>
                    {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({Math.abs(changePct).toFixed(1)}%) {rangeLabel}
                  </span>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex" }}>
                  {dateRanges.map((r, i) => (
                    <button
                      key={r.key}
                      onClick={() => setDateRange(r.key)}
                      style={{
                        padding: "4px 12px",
                        fontSize: 13,
                        border: "1px solid #d1d5db",
                        borderLeft: i === 0 ? "1px solid #d1d5db" : "none",
                        borderRadius: i === 0 ? "6px 0 0 6px" : i === dateRanges.length - 1 ? "0 6px 6px 0" : 0,
                        background: dateRange === r.key ? "#374151" : "#fff",
                        color: dateRange === r.key ? "#fff" : "#374151",
                        cursor: "pointer",
                        fontWeight: dateRange === r.key ? "bold" : "normal",
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  {prices[0]?.date && prices[prices.length - 1]?.date &&
                    `${formatDateFull(prices[0].date)} – ${formatDateFull(prices[prices.length - 1].date)}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => fetchData(true)}
                  disabled={refreshing}
                  title="重新抓取完整一年資料"
                  style={{
                    padding: "5px 12px",
                    fontSize: 13,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    background: "#fff",
                    color: refreshing ? "#9ca3af" : "#374151",
                    cursor: refreshing ? "not-allowed" : "pointer",
                  }}
                >
                  {refreshing ? "重新抓取中..." : "重新抓取"}
                </button>
                {hasOhlc && (
                  <div style={{ display: "flex" }}>
                    <button
                      onClick={() => setChartMode("candlestick")}
                      style={{ ...toggleStyle(chartMode === "candlestick"), borderRadius: "6px 0 0 6px" }}
                    >
                      K線
                    </button>
                    <button
                      onClick={() => setChartMode("line")}
                      style={{ ...toggleStyle(chartMode === "line"), borderRadius: "0 6px 6px 0", borderLeft: "none" }}
                    >
                      折線
                    </button>
                  </div>
                )}
              </div>
            </div>

            {chartMode === "candlestick" && hasOhlc ? (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={candleData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
                  barGap={0} barCategoryGap="10%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip content={<CandlestickTooltip />} />
                  <Bar dataKey="bodyLow" stackId="candle" fill="transparent" stroke="none" isAnimationActive={false} />
                  <Bar dataKey="candleBody" stackId="candle" shape={<CandlestickShape />} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={prices} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1a56db" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1a56db" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip
                    formatter={(value: unknown) => [(value as number).toFixed(2), "收盤價"]}
                    labelFormatter={(label) => formatDateFull(label as string)}
                    contentStyle={{ fontSize: 13, borderRadius: 6, border: "1px solid #e5e7eb" }}
                  />
                  <Area type="monotone" dataKey="close" stroke="#1a56db" strokeWidth={1.5}
                    fill="url(#grad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {/* Volume chart */}
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={volumeData} margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" ticks={pickTicks(prices)} tickFormatter={formatDateShort}
                  tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, maxVolume * 1.1]} tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={false} tickLine={false} width={56}
                  tickFormatter={formatVolume} />
                <Tooltip
                  formatter={(value: unknown) => [`${((value as number) / 1000).toLocaleString()}張`, "成交量"]}
                  labelFormatter={(label) => formatDateFull(label as string)}
                  contentStyle={{ fontSize: 13, borderRadius: 6, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="volume" isAnimationActive={false}>
                  {volumeData.map((entry, index) => (
                    <Cell key={index} fill={entry.isUp ? "rgba(220,38,38,0.5)" : "rgba(22,163,74,0.5)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div style={{ textAlign: "right", fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
              共 {prices.length} 筆資料（{allPrices.length} 筆總計）
            </div>
          </>
        )}
      </div>
    </div>
  );
}
