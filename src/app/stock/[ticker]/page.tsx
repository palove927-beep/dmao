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
  prices: PricePoint[];
};

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

export default function StockDetailPage() {
  const { ticker } = useParams() as { ticker: string };
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/stock-history/${ticker}`)
      .then((r) => r.json())
      .then((json) => { if (json.ok) setData(json); else setError(json.error ?? "載入失敗"); })
      .catch(() => setError("網路錯誤"))
      .finally(() => setLoading(false));
  }, [ticker]);

  const prices = data?.prices ?? [];
  const latest = prices[prices.length - 1]?.close;
  const first = prices[0]?.close;
  const change = latest != null && first != null ? latest - first : null;
  const changePct = change != null && first ? (change / first) * 100 : null;
  const isUp = (change ?? 0) >= 0;

  const minClose = prices.length ? Math.min(...prices.map((p) => p.close)) : 0;
  const maxClose = prices.length ? Math.max(...prices.map((p) => p.close)) : 0;
  const pad = (maxClose - minClose) * 0.06;
  const yMin = Math.floor((minClose - pad) / 5) * 5;
  const yMax = Math.ceil((maxClose + pad) / 5) * 5;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>← 股票列表</a>

      <div style={{ margin: "20px 0" }}>
        {loading ? (
          <div style={{ color: "#999" }}>載入中...</div>
        ) : error ? (
          <div style={{ color: "#dc2626" }}>{error}</div>
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
                  <span style={{ fontSize: 15, fontWeight: "bold", color: isUp ? "#16a34a" : "#dc2626" }}>
                    {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({Math.abs(changePct).toFixed(1)}%) 近一年
                  </span>
                )}
              </div>
            )}

            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 24 }}>
              {prices[0]?.date && prices[prices.length - 1]?.date &&
                `${formatDateFull(prices[0].date)} – ${formatDateFull(prices[prices.length - 1].date)}`}
            </div>

            <ResponsiveContainer width="100%" height={320}>
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
          </>
        )}
      </div>
    </div>
  );
}
