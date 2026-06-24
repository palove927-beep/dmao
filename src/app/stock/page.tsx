"use client";

import { useEffect, useState, useCallback } from "react";
import { categories } from "@/lib/stock-list";
import type { StockPrice } from "@/app/api/stock/route";

const EDITOR_KEY = "dmao_editor";
const EDITOR_CODE = "0800";

type PriceMap = Record<string, StockPrice>;

type Annotation = {
  id: string;
  ticker: string;
  stock_name: string;
  paragraph: string;
  is_summary: boolean;
  article_id: string;
  dmao_articles: { id: string; title: string; created_at: string } | null;
};

type EpsForecast = {
  id: string;
  ticker: string;
  stock_name: string;
  forecast_year: number;
  eps: number;
  dmao_articles: { id: string; title: string; article_date: string } | null;
};

function highlightKeywords(text: string, keywords: string[]) {
  const filtered = keywords.filter(Boolean);
  if (filtered.length === 0) return text;
  const escaped = filtered.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  escaped.sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    filtered.includes(part) ? (
      <mark key={i} style={{ background: "#fef9c3", padding: "1px 2px", borderRadius: 2 }}>{part}</mark>
    ) : (
      part
    )
  );
}

export default function StockPage() {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  // Editor auth
  const [isEditor, setIsEditor] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    setIsEditor(localStorage.getItem(EDITOR_KEY) === "true");
  }, []);

  const handleAuthSubmit = () => {
    if (authCode === EDITOR_CODE) {
      localStorage.setItem(EDITOR_KEY, "true");
      setIsEditor(true);
      setShowAuthModal(false);
      setAuthCode("");
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(EDITOR_KEY);
    setIsEditor(false);
    setShowAuthModal(false);
  };

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
          ← stock頁面
        </a>
        <button
          onClick={() => { setShowAuthModal(true); setAuthCode(""); setAuthError(false); }}
          title={isEditor ? "編輯者（已登入）" : "登入為編輯者"}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 22,
            padding: "4px 8px",
            borderRadius: 8,
            color: isEditor ? "#16a34a" : "#9ca3af",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
      </div>

      {showAuthModal && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.4)", zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowAuthModal(false)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 12, padding: "28px 32px",
              minWidth: 320, boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isEditor ? (
              <>
                <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, textAlign: "center" }}>
                  目前為編輯模式
                </div>
                <div style={{ textAlign: "center", color: "#16a34a", fontSize: 14, marginBottom: 20 }}>
                  您已登入為編輯者，可以上傳及刪除文章。
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button
                    onClick={handleLogout}
                    style={{
                      padding: "8px 24px", fontSize: 14, border: "1px solid #dc2626",
                      borderRadius: 6, background: "#fff", color: "#dc2626", cursor: "pointer",
                    }}
                  >
                    登出
                  </button>
                  <button
                    onClick={() => setShowAuthModal(false)}
                    style={{
                      padding: "8px 24px", fontSize: 14, border: "1px solid #d1d5db",
                      borderRadius: 6, background: "#fff", color: "#374151", cursor: "pointer",
                    }}
                  >
                    關閉
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, textAlign: "center" }}>
                  輸入編輯者代碼
                </div>
                <input
                  type="password"
                  value={authCode}
                  onChange={(e) => { setAuthCode(e.target.value); setAuthError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAuthSubmit()}
                  placeholder="請輸入代碼"
                  autoFocus
                  style={{
                    width: "100%", padding: "10px 14px", fontSize: 15,
                    border: authError ? "2px solid #dc2626" : "1px solid #d1d5db",
                    borderRadius: 6, boxSizing: "border-box", outline: "none",
                    marginBottom: 8,
                  }}
                />
                {authError && (
                  <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>
                    代碼錯誤，請重新輸入
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    onClick={() => setShowAuthModal(false)}
                    style={{
                      padding: "8px 20px", fontSize: 14, border: "1px solid #d1d5db",
                      borderRadius: 6, background: "#fff", color: "#374151", cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAuthSubmit}
                    style={{
                      padding: "8px 20px", fontSize: 14, border: "none",
                      borderRadius: 6, background: "#1a56db", color: "#fff", cursor: "pointer",
                    }}
                  >
                    確認
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
          {isEditor && (
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
          )}
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
                      <td style={tdStyle}>
                        {isTwStock(stock.ticker) ? (
                          <a href={`/stock/${stock.ticker}`} style={{ color: "#1a56db", textDecoration: "none", fontWeight: 500 }}>
                            {stock.ticker}
                          </a>
                        ) : stock.ticker}
                      </td>
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
                                    {ann.is_summary && (
                                      <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", marginRight: 6 }}>AI 摘要</span>
                                    )}
                                    {highlightKeywords(ann.paragraph, [ann.stock_name, ann.ticker])}
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
