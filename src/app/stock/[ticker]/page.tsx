"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { categories } from "@/lib/stock-list";
import {
  ComposedChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip,
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
  const [refreshing, setRefreshing] = useState(false);

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

  const prices = data?.prices ?? [];
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

  const allLows = candleData.map((p) => p.low);
  const allHighs = candleData.map((p) => p.high);
  const minVal = allLows.length ? Math.min(...allLows) : 0;
  const maxVal = allHighs.length ? Math.max(...allHighs) : 0;
  const pad = (maxVal - minVal) * 0.06;
  const yMin = Math.floor((minVal - pad) / 5) * 5;
  const yMax = Math.ceil((maxVal + pad) / 5) * 5;

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
      <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>← 股票列表</a>

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

            {latest != null && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "10px 0 4px" }}>
                <span style={{ fontSize: 32, fontWeight: "bold" }}>{latest.toFixed(2)}</span>
                {change != null && changePct != null && (
                  <span style={{ fontSize: 15, fontWeight: "bold", color: isUp ? "#dc2626" : "#16a34a" }}>
                    {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({Math.abs(changePct).toFixed(1)}%) 近一年
                  </span>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                {prices[0]?.date && prices[prices.length - 1]?.date &&
                  `${formatDateFull(prices[0].date)} – ${formatDateFull(prices[prices.length - 1].date)}`}
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
              <ResponsiveContainer width="100%" height={380}>
                <ComposedChart data={candleData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
                  barGap={0} barCategoryGap="10%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" ticks={pickTicks(prices)} tickFormatter={formatDateShort}
                    tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip content={<CandlestickTooltip />} />
                  {/* Invisible base: lifts candle body to correct Y position */}
                  <Bar dataKey="bodyLow" stackId="candle" fill="transparent" stroke="none" isAnimationActive={false} />
                  {/* Visible candle body + wicks via custom shape */}
                  <Bar dataKey="candleBody" stackId="candle" shape={<CandlestickShape />} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <AreaChart data={prices} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1a56db" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1a56db" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" ticks={pickTicks(prices)} tickFormatter={formatDateShort}
                    tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
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
          </>
        )}
      </div>
    </div>
  );
}
