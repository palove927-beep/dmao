"use client";

import { useEffect, useState, useCallback } from "react";
import { categories } from "@/lib/stocks";
import type { StockPrice } from "@/app/api/stock/route";

type PriceMap = Record<string, StockPrice>;

type Annotation = {
  id: string;
  ticker: string;
  stock_name: string;
  paragraph: string;
  article_id: string;
  dmao_articles: { id: string; title: string; created_at: string } | null;
};

type EpsForecast = {
  id: string;
  ticker: string;
  stock_name: string;
  forecast_year: number;
  eps: number;
  prev_eps: number | null;
  dmao_articles: { id: string; title: string; article_date: string } | null;
};

export default function StockPage() {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  // Annotations & EPS
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [epsForecasts, setEpsForecasts] = useState<Record<string, EpsForecast[]>>({});
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [latestEps, setLatestEps] = useState<Record<string, number>>({});
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [loadingAnnotations, setLoadingAnnotations] = useState<string | null>(null);

  const fetchAnnotationCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/annotations?mode=counts");
      const json = await res.json();
      if (json.ok) {
        setAnnotationCounts(json.counts);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchLatestEps = useCallback(async () => {
    try {
      const res = await fetch("/api/eps-forecasts?forecast_year=2026&latest=1");
      const json = await res.json();
      if (json.ok) {
        const map: Record<string, number> = {};
        for (const f of json.forecasts) {
          map[f.ticker] = f.eps;
        }
        setLatestEps(map);
      }
    } catch {
      // ignore
    }
  }, []);

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
    fetchAnnotationCounts();
    fetchLatestEps();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [fetchPrices, fetchAnnotationCounts, fetchLatestEps]);

  const fetchAnnotations = async (ticker: string) => {
    if (expandedTicker === ticker) {
      setExpandedTicker(null);
      return;
    }
    setExpandedTicker(ticker);
    if (annotations[ticker]) return;

    setLoadingAnnotations(ticker);
    try {
      const [annRes, epsRes] = await Promise.all([
        fetch(`/api/annotations?ticker=${ticker}`).then((r) => r.json()),
        fetch(`/api/eps-forecasts?ticker=${ticker}`).then((r) => r.json()),
      ]);
      if (annRes.ok) {
        setAnnotations((prev) => ({ ...prev, [ticker]: annRes.annotations }));
      }
      if (epsRes.ok) {
        setEpsForecasts((prev) => ({ ...prev, [ticker]: epsRes.forecasts }));
      }
    } catch {
      // ignore
    } finally {
      setLoadingAnnotations(null);
    }
  };

  const formatPrice = (p: number | null) => {
    if (p === null) return "-";
    return p.toFixed(2);
  };

  const isTwStock = (ticker: string) => /^\d+$/.test(ticker);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <a href="/" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
        ← 首頁
      </a>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 20px" }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", margin: 0 }}>
          股票即時報價
          {updatedAt && (
            <span style={{ fontSize: 13, fontWeight: "normal", color: "#999", marginLeft: 12 }}>
              {new Date(updatedAt).toLocaleString("zh-TW")}
            </span>
          )}
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/articles"
            style={{
              padding: "8px 20px",
              fontSize: 14,
              border: "1px solid #1a56db",
              borderRadius: 6,
              background: "#fff",
              color: "#1a56db",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            文章列表
          </a>
          <a
            href="/stock/dmao"
            style={{
              padding: "8px 20px",
              fontSize: 14,
              border: "1px solid #1a56db",
              borderRadius: 6,
              background: "#fff",
              color: "#1a56db",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            貼上文章
          </a>
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
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#1e3a5f", color: "#fff" }}>
            <th style={thStyle}>編號</th>
            <th style={thStyle}>類別</th>
            <th style={thStyle}>股票</th>
            <th style={thStyle}>代號</th>
            <th style={{ ...thStyle, textAlign: "right" }}>現價</th>
            <th style={{ ...thStyle, textAlign: "right" }}>2026 EPS</th>
            <th style={{ ...thStyle, textAlign: "center", width: 60 }}>標記</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <>
              <tr key={`cat-${cat.id}`} style={{ background: "#f0f4f8" }}>
                <td
                  colSpan={7}
                  style={{ padding: "10px 14px", fontWeight: "bold", fontSize: 15, color: "#1e3a5f" }}
                >
                  {cat.label}
                </td>
              </tr>
              {cat.stocks.map((stock, i) => {
                const p = prices[stock.ticker];
                const hasTwData = isTwStock(stock.ticker) && p;
                const isExpanded = expandedTicker === stock.ticker;
                const stockAnnotations = annotations[stock.ticker] || [];
                const stockEps = epsForecasts[stock.ticker] || [];
                const isLoadingThis = loadingAnnotations === stock.ticker;

                return (
                  <>
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
                      <td style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: "bold",
                      }}>
                        {hasTwData ? formatPrice(p.price) : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#b45309", fontWeight: latestEps[stock.ticker] ? "bold" : "normal" }}>
                        {latestEps[stock.ticker] != null ? latestEps[stock.ticker] : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {(() => {
                          const count = annotationCounts[stock.ticker] || 0;
                          return count > 0 ? (
                            <button
                              onClick={() => fetchAnnotations(stock.ticker)}
                              style={{
                                padding: "2px 10px",
                                fontSize: 13,
                                fontWeight: "bold",
                                border: "none",
                                borderRadius: 10,
                                background: isExpanded ? "#1a56db" : "#e0e7ff",
                                color: isExpanded ? "#fff" : "#1a56db",
                                cursor: "pointer",
                                minWidth: 28,
                              }}
                            >
                              {count}
                            </button>
                          ) : (
                            <span style={{ color: "#ccc", fontSize: 13 }}>0</span>
                          );
                        })()}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`ann-${stock.ticker}`}>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <div style={{ background: "#f8fafc", borderLeft: "3px solid #1a56db", margin: "0 14px 8px", padding: "12px 16px" }}>
                            {isLoadingThis ? (
                              <div style={{ color: "#999", fontSize: 13 }}>載入中...</div>
                            ) : stockAnnotations.length === 0 && stockEps.length === 0 ? (
                              <div style={{ color: "#999", fontSize: 13 }}>尚無標記段落</div>
                            ) : (<>
                              {stockEps.length > 0 && (
                                <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
                                  <div style={{ fontSize: 13, fontWeight: "bold", color: "#b45309", marginBottom: 6 }}>財測 EPS</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {stockEps.map((f) => (
                                      <span key={f.id} style={{ background: "#fef9c3", padding: "3px 10px", borderRadius: 6, fontSize: 13 }}>
                                        {f.forecast_year}年：<strong>{f.eps}</strong>元
                                        {f.prev_eps != null && <span style={{ color: "#9ca3af", marginLeft: 4 }}>(前次 {f.prev_eps})</span>}
                                        {f.dmao_articles?.article_date && (
                                          <span style={{ color: "#9ca3af", marginLeft: 6, fontSize: 12 }}>
                                            {new Date(f.dmao_articles.article_date).toLocaleDateString("zh-TW")}
                                          </span>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {stockAnnotations.map((ann) => (
                                <div key={ann.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
                                  <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                                    <strong>{ann.dmao_articles?.title || "無標題"}</strong>
                                    {ann.dmao_articles?.created_at && (
                                      <span style={{ marginLeft: 8 }}>
                                        {new Date(ann.dmao_articles.created_at).toLocaleDateString("zh-TW")}
                                      </span>
                                    )}
                                    <a
                                      href={`/articles/${ann.article_id}`}
                                      style={{ marginLeft: 8, color: "#1a56db", fontSize: 12 }}
                                    >
                                      查看全文 →
                                    </a>
                                  </div>
                                  <div style={{ fontSize: 14, color: "#333", lineHeight: 1.6 }}>
                                    {ann.paragraph}
                                  </div>
                                </div>
                              ))}
                            </>)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
  color: "#222",
};
