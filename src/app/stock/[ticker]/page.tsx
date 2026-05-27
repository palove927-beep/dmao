"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

type PricePoint = { date: string; close: number };

type HistoryData = {
  ticker: string;
  name: string;
  currency: string;
  prices: PricePoint[];
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// Show ~12 evenly spaced ticks for the x-axis
function pickTicks(prices: PricePoint[], count = 12): string[] {
  if (prices.length === 0) return [];
  const step = Math.floor(prices.length / count);
  const ticks: string[] = [];
  for (let i = 0; i < prices.length; i += step) ticks.push(prices[i].date);
  return ticks;
}

export default function StockDetailPage() {
  const params = useParams();
  const ticker = params.ticker as string;

  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/stock-history/${ticker}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setData(json);
        else setError(json.error ?? "載入失敗");
      })
      .catch(() => setError("網路錯誤"))
      .finally(() => setLoading(false));
  }, [ticker]);

  const prices = data?.prices ?? [];
  const latest = prices[prices.length - 1]?.close;
  const first = prices[0]?.close;
  const change = latest != null && first != null ? latest - first : null;
  const changePct = change != null && first ? (change / first) * 100 : null;
  const isPositive = change != null && change >= 0;

  const minClose = prices.length ? Math.min(...prices.map((p) => p.close)) : 0;
  const maxClose = prices.length ? Math.max(...prices.map((p) => p.close)) : 0;
  const padding = (maxClose - minClose) * 0.05;
  const yMin = Math.floor((minClose - padding) / 5) * 5;
  const yMax = Math.ceil((maxClose + padding) / 5) * 5;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
        ← 股票列表
      </a>

      <div style={{ margin: "24px 0 20px" }}>
        {loading ? (
          <div style={{ color: "#999", fontSize: 15 }}>載入中...</div>
        ) : error ? (
          <div style={{ color: "#dc2626", fontSize: 15 }}>{error}</div>
        ) : data && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 26, fontWeight: "bold", margin: 0 }}>
                {data.name}
              </h1>
              <span style={{ fontSize: 16, color: "#6b7280" }}>{ticker}</span>
            </div>

            {latest != null && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "10px 0 4px" }}>
                <span style={{ fontSize: 32, fontWeight: "bold" }}>{latest.toFixed(2)}</span>
                {changePct != null && (
                  <span style={{ fontSize: 15, color: isPositive ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
                    {isPositive ? "▲" : "▼"} {Math.abs(change!).toFixed(2)} ({Math.abs(changePct).toFixed(1)}%) 近一年
                  </span>
                )}
              </div>
            )}
            <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>
              {prices[0]?.date && prices[prices.length - 1]?.date && (
                <>{formatDateFull(prices[0].date)} – {formatDateFull(prices[prices.length - 1].date)}</>
              )}
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={prices} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1a56db" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1a56db" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  ticks={pickTicks(prices)}
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip
                  formatter={(value: unknown) => [(value as number).toFixed(2), "收盤價"]}
                  labelFormatter={(label) => formatDateFull(label as string)}
                  contentStyle={{ fontSize: 13, borderRadius: 6, border: "1px solid #e5e7eb" }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#1a56db"
                  strokeWidth={1.5}
                  fill="url(#priceGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
