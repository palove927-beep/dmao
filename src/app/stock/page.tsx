"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, User } from "lucide-react";
import { categories } from "@/lib/stock-list";
import { isEditor, loginEditor, logoutEditor } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import type { StockPrice } from "@/app/api/stock/route";

type PriceMap = Record<string, StockPrice>;

type Annotation = {
  id: string;
  ticker: string;
  stock_name: string;
  paragraph: string;
  is_summary: boolean;
  article_id: string;
  aliases?: string[];
  // 同段落中所有被標記的個股（含其他股票），由 /api/annotations 回傳
  paragraph_stocks?: { ticker: string; stock_name: string; aliases?: string[] }[];
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

type LatestEpsInfo = {
  eps: number;
  article_date: string | null;
};

type TimeRange = "all" | "1w" | "1m" | "3m";

// 段落內要標色的關鍵字：同段落所有被標記的個股（名稱／代碼／別名）；
// 舊資料若沒有 paragraph_stocks，退回只標這檔自己
function annotationKeywords(ann: Annotation): string[] {
  const stocks = ann.paragraph_stocks?.length
    ? ann.paragraph_stocks
    : [{ ticker: ann.ticker, stock_name: ann.stock_name, aliases: ann.aliases }];
  return stocks.flatMap((s) => [s.stock_name, s.ticker, ...(s.aliases ?? [])]);
}

function highlightKeywords(text: string, keywords: string[]) {
  const filtered = [...new Set(keywords.filter(Boolean))];
  if (filtered.length === 0) return text;
  // 英數關鍵字要求前後不得接英數字元，否則 SEMCO 裡的 EMC 會被標色；
  // 中文沒有詞界，維持原樣。長的排前面，南亞科 才不會被 南亞 先吃掉。
  const escaped = [...filtered]
    .sort((a, b) => b.length - a.length)
    .map((k) => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return /^[\x00-\x7F]+$/.test(k) ? `(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])` : esc;
    });
  const regex = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    filtered.includes(part) ? (
      <span key={i} style={{ color: "#dc2626", fontWeight: 600 }}>{part}</span>
    ) : (
      part
    )
  );
}

function getSinceDate(range: TimeRange): string | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "1w") now.setDate(now.getDate() - 7);
  else if (range === "1m") now.setMonth(now.getMonth() - 1);
  else if (range === "3m") now.setMonth(now.getMonth() - 3);
  return now.toISOString().slice(0, 10);
}

const COL_COUNT = 8;

export default function StockPage() {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [editor, setEditor] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const [loginError, setLoginError] = useState(false);

  useEffect(() => { setEditor(isEditor()); }, []);

  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [epsForecasts, setEpsForecasts] = useState<Record<string, EpsForecast[]>>({});
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [latestEps2026, setLatestEps2026] = useState<Record<string, LatestEpsInfo>>({});
  const [latestEps2027, setLatestEps2027] = useState<Record<string, LatestEpsInfo>>({});
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [loadingAnnotations, setLoadingAnnotations] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const fetchAnnotationCounts = useCallback(async (range: TimeRange) => {
    try {
      const since = getSinceDate(range);
      const url = since
        ? `/api/annotations?mode=counts&since=${since}`
        : "/api/annotations?mode=counts";
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setAnnotationCounts(json.counts);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchLatestEps = useCallback(async (year: number, setter: (v: Record<string, LatestEpsInfo>) => void) => {
    try {
      const res = await fetch(`/api/eps-forecasts?forecast_year=${year}&latest=1`);
      const json = await res.json();
      if (json.ok) {
        const map: Record<string, LatestEpsInfo> = {};
        for (const f of json.forecasts) {
          map[f.ticker] = {
            eps: f.eps,
            article_date: f.dmao_articles?.article_date ?? null,
          };
        }
        setter(map);
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
    fetchAnnotationCounts(timeRange);
    fetchLatestEps(2026, setLatestEps2026);
    fetchLatestEps(2027, setLatestEps2027);
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [fetchPrices, fetchAnnotationCounts, fetchLatestEps, timeRange]);

  const fetchAnnotationsForTicker = async (ticker: string) => {
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
    if (p === null || p === 0) return "-";
    return p.toFixed(2);
  };

  // 漲停紅底、跌停綠底
  const limitBadgeStyle = (limit: "up" | "down"): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 6px",
    borderRadius: 4,
    background: limit === "up" ? "#dc2626" : "#15803d",
    color: "#fff",
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  };

  const calcPE = (price: number | null, eps: number | undefined) => {
    if (!price || !eps || eps <= 0) return null;
    return Math.round((price / eps) * 10) / 10;
  };

  const peColor = (pe: number | null): string => {
    if (pe === null) return "#ccc";
    if (pe < 15) return "#2563eb";
    if (pe < 20) return "#16a34a";
    if (pe < 25) return "#eab308";
    if (pe < 35) return "#ea580c";
    return "#dc2626";
  };

  const dateAgeColor = (dateStr: string | null): string => {
    if (!dateStr) return "#ccc";
    const diff = (Date.now() - new Date(dateStr).getTime()) / (24 * 3600 * 1000);
    if (diff <= 14) return "#16a34a";
    if (diff <= 30) return "#2563eb";
    if (diff <= 90) return "#ea580c";
    return "#9ca3af";
  };

  const isTwStock = (ticker: string) => /^\d+$/.test(ticker);

  const timeRanges: { key: TimeRange; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "1w", label: "一周" },
    { key: "1m", label: "一個月" },
    { key: "3m", label: "三個月" },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <PageHeader
        title="股票即時報價"
        subtitle={updatedAt ? new Date(updatedAt).toLocaleString("zh-TW") : undefined}
        actions={
          <>
            <button
              onClick={() => { setLoading(true); fetchPrices(); }}
              disabled={loading}
              title="重新整理"
              style={{
                background: "none",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                padding: "2px 6px",
                display: "flex",
                alignItems: "center",
                color: "#333",
              }}
            >
              <RefreshCw size={18} strokeWidth={1.75} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            </button>
            <button
              onClick={() => {
                if (editor) {
                  logoutEditor();
                  setEditor(false);
                } else {
                  setShowLogin(true);
                  setLoginCode("");
                  setLoginError(false);
                }
              }}
              title={editor ? "登出編輯模式" : "登入編輯模式"}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                color: editor ? "#16a34a" : "#999",
              }}
            >
              <User size={20} strokeWidth={1.75} />
            </button>
          </>
        }
      />

      {showLogin && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }} onClick={() => setShowLogin(false)}>
          <div
            style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", minWidth: 280, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16 }}>輸入編輯代碼</div>
            <input
              type="password"
              value={loginCode}
              onChange={(e) => { setLoginCode(e.target.value); setLoginError(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (loginEditor(loginCode)) {
                    setEditor(true);
                    setShowLogin(false);
                  } else {
                    setLoginError(true);
                  }
                }
              }}
              placeholder="代碼"
              autoFocus
              style={{
                width: "100%", padding: "8px 12px", fontSize: 14,
                border: `1px solid ${loginError ? "#dc2626" : "#d1d5db"}`,
                borderRadius: 6, outline: "none", boxSizing: "border-box",
              }}
            />
            {loginError && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 6 }}>代碼錯誤</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowLogin(false)}
                style={{ padding: "6px 16px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer" }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (loginEditor(loginCode)) {
                    setEditor(true);
                    setShowLogin(false);
                  } else {
                    setLoginError(true);
                  }
                }}
                style={{ padding: "6px 16px", fontSize: 14, border: "none", borderRadius: 6, background: "#1a56db", color: "#fff", cursor: "pointer" }}
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 14 }}>
        <span style={{ color: "#666" }}>標記區間：</span>
        {timeRanges.map((r) => (
          <button
            key={r.key}
            onClick={() => setTimeRange(r.key)}
            style={{
              padding: "5px 14px",
              fontSize: 14,
              border: "1px solid #1a56db",
              borderRadius: 16,
              background: timeRange === r.key ? "#1a56db" : "#fff",
              color: timeRange === r.key ? "#fff" : "#1a56db",
              cursor: "pointer",
              fontWeight: timeRange === r.key ? "bold" : "normal",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 720, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 15 }}>
        <colgroup>
          <col style={{ width: "5%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "7%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#1e3a5f", color: "#fff" }}>
            <th style={{ ...thStyle, textAlign: "center" }}>編號</th>
            <th style={thStyle}>股票</th>
            <th style={{ ...thStyle, textAlign: "right" }}>現價</th>
            <th style={{ ...thStyle, textAlign: "right" }}>漲跌</th>
            <th style={{ ...thStyle, textAlign: "center" }}>日期</th>
            <th style={{ ...thStyle, textAlign: "right" }}>2026 EPS</th>
            <th style={{ ...thStyle, textAlign: "right" }}>2027 EPS</th>
            <th style={{ ...thStyle, textAlign: "center" }}>標記</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <>
              <tr key={`cat-${cat.id}`} style={{ background: "#f0f4f8" }}>
                <td
                  colSpan={COL_COUNT}
                  style={{ padding: "10px 10px", fontWeight: "bold", fontSize: 15, color: "#1e3a5f" }}
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

                const eps2026 = latestEps2026[stock.ticker];
                const eps2027 = latestEps2027[stock.ticker];
                const price = hasTwData ? p.price : null;
                const pe2026 = calcPE(price, eps2026?.eps);
                const pe2027 = calcPE(price, eps2027?.eps);

                const epsDate = eps2026?.article_date ?? eps2027?.article_date ?? null;

                return (
                  <>
                    <tr
                      key={stock.code}
                      style={{
                        background: i % 2 === 0 ? "#fff" : "#f9fafb",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <td style={{ ...tdStyle, color: "#9ca3af", fontSize: 13, textAlign: "center" }}>{stock.code}</td>
                      <td style={tdStyle}>
                        {isTwStock(stock.ticker) ? (
                          <a href={`/stock/${stock.ticker}`} style={{ color: "#1a56db", textDecoration: "none", fontWeight: 500 }}>
                            {stock.ticker}
                          </a>
                        ) : (
                          <span style={{ fontWeight: 500 }}>{stock.ticker}</span>
                        )}
                        {isTwStock(stock.ticker) ? (
                          <a href={`/stock/${stock.ticker}`} style={{ marginLeft: 12, color: "inherit", textDecoration: "none" }}>
                            {hasTwData ? p.name || stock.name : stock.name}
                          </a>
                        ) : (
                          <span style={{ marginLeft: 12 }}>{stock.name}</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>
                        {!hasTwData ? "-" : p.limit ? (
                          <span title={p.limit === "up" ? "漲停" : "跌停"} style={limitBadgeStyle(p.limit)}>
                            {formatPrice(p.price)}
                          </span>
                        ) : formatPrice(p.price)}
                      </td>
                      <td style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        color: hasTwData && p.changePercent !== null && p.changePercent !== 0
                          ? (p.changePercent > 0 ? "#dc2626" : "#15803d")
                          : "#6b7280",
                      }}>
                        {hasTwData && p.changePercent !== null
                          ? `${p.changePercent > 0 ? "+" : ""}${p.changePercent.toFixed(2)}%`
                          : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontSize: 13, color: "#666" }}>
                        {epsDate ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{
                              width: 11,
                              height: 11,
                              borderRadius: "50%",
                              background: dateAgeColor(epsDate),
                              flexShrink: 0,
                            }} />
                            {formatDate(epsDate)}
                          </span>
                        ) : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {eps2026 ? (
                          <span>
                            <span style={{ color: "#b45309", fontWeight: "bold" }}>{eps2026.eps}</span>
                            {pe2026 !== null && (
                              <span style={{
                                marginLeft: 6,
                                fontSize: 12,
                                fontWeight: "bold",
                                color: "#fff",
                                background: peColor(pe2026),
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}>
                                {pe2026}x
                              </span>
                            )}
                          </span>
                        ) : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {eps2027 ? (
                          <span>
                            <span style={{ color: "#b45309", fontWeight: "bold" }}>{eps2027.eps}</span>
                            {pe2027 !== null && (
                              <span style={{
                                marginLeft: 6,
                                fontSize: 12,
                                fontWeight: "bold",
                                color: "#fff",
                                background: peColor(pe2027),
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}>
                                {pe2027}x
                              </span>
                            )}
                          </span>
                        ) : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {(() => {
                          const count = annotationCounts[stock.ticker] || 0;
                          return count > 0 ? (
                            <button
                              onClick={() => fetchAnnotationsForTicker(stock.ticker)}
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
                            <span style={{ color: "#ccc", fontSize: 13 }}>-</span>
                          );
                        })()}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`ann-${stock.ticker}`}>
                        <td colSpan={COL_COUNT} style={{ padding: 0 }}>
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
                                  <div style={{ fontSize: 14, color: "#333", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                    {ann.is_summary && (
                                      <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", marginRight: 6 }}>AI 摘要</span>
                                    )}
                                    {highlightKeywords(ann.paragraph, annotationKeywords(ann))}
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
      </div>

      {loading && Object.keys(prices).length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
          載入股價中...
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 10px",
  fontWeight: "bold",
  textAlign: "left",
  fontSize: 14,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  color: "#222",
};
