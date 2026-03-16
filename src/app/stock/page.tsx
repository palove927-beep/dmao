"use client";

import { useEffect, useState, useCallback } from "react";
import { categories } from "@/lib/stocks";
import type { StockPrice } from "@/app/api/stock/route";

type PriceMap = Record<string, StockPrice>;

export default function StockPage() {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/stock");
      const json = await res.json();
      if (json.ok) {
        setPrices(json.data);
        setUpdatedAt(json.updatedAt);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const formatPrice = (p: number | null) => {
    if (p === null) return "-";
    return p.toFixed(2);
  };

  const isTwStock = (ticker: string) => /^\d+$/.test(ticker);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif" }}>
      {/* Back link */}
      <a href="/" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
        ← 首頁
      </a>

      {/* Title row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 20px" }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", margin: 0 }}>
          股票即時報價
          {updatedAt && (
            <span style={{ fontSize: 13, fontWeight: "normal", color: "#999", marginLeft: 12 }}>
              {new Date(updatedAt).toLocaleString("zh-TW")}
            </span>
          )}
        </h1>
        <button
          onClick={() => { setLoading(true); fetchPrices(); }}
          disabled={loading}
          style={{
            padding: "8px 20px",
            fontSize: 14,
            border: "1px solid #333",
            borderRadius: 6,
            background: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "更新中..." : "重新整理"}
        </button>
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#1e3a5f", color: "#fff" }}>
            <th style={thStyle}>編號</th>
            <th style={thStyle}>類別</th>
            <th style={thStyle}>股票</th>
            <th style={thStyle}>代號</th>
            <th style={{ ...thStyle, textAlign: "right" }}>現價</th>
            <th style={{ ...thStyle, textAlign: "right" }}>2026 EPS</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <>
              {/* Category header row */}
              <tr key={`cat-${cat.id}`} style={{ background: "#f0f4f8" }}>
                <td
                  colSpan={6}
                  style={{ padding: "10px 14px", fontWeight: "bold", fontSize: 15, color: "#1e3a5f" }}
                >
                  {cat.label}
                </td>
              </tr>
              {/* Stock rows */}
              {cat.stocks.map((stock, i) => {
                const p = prices[stock.ticker];
                const hasTwData = isTwStock(stock.ticker) && p;
                return (
                  <tr
                    key={stock.code}
                    style={{
                      background: i % 2 === 0 ? "#fff" : "#f9fafb",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <td style={tdStyle}>{stock.code}</td>
                    <td style={tdStyle}>{cat.label}</td>
                    <td style={tdStyle}>{hasTwData ? p.name || stock.name : stock.name}</td>
                    <td style={tdStyle}>{stock.ticker}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: "bold" }}>
                      {hasTwData ? formatPrice(p.price) : "-"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#999" }}>-</td>
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>

      {loading && Object.keys(prices).length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
          載入股價中...
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontWeight: "bold",
  textAlign: "left",
  fontSize: 14,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
};
