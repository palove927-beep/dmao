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
  articles: { id: string; title: string; created_at: string } | null;
};

export default function StockPage() {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  // Annotations
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [loadingAnnotations, setLoadingAnnotations] = useState<string | null>(null);

  // Article form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formSource, setFormSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);

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

  const fetchAnnotations = async (ticker: string) => {
    if (expandedTicker === ticker) {
      setExpandedTicker(null);
      return;
    }
    setExpandedTicker(ticker);
    if (annotations[ticker]) return;

    setLoadingAnnotations(ticker);
    try {
      const res = await fetch(`/api/annotations?ticker=${ticker}`);
      const json = await res.json();
      if (json.ok) {
        setAnnotations((prev) => ({ ...prev, [ticker]: json.annotations }));
      }
    } catch {
      // ignore
    } finally {
      setLoadingAnnotations(null);
    }
  };

  const handleSubmitArticle = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          content: formContent,
          source: formSource || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSubmitResult(`已儲存，標記了 ${json.annotationCount} 個股票提及`);
        setFormTitle("");
        setFormContent("");
        setFormSource("");
        // Clear annotation cache so next expand refetches
        setAnnotations({});
      } else {
        setSubmitResult(`錯誤：${json.error}`);
      }
    } catch (err) {
      setSubmitResult(`提交失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setSubmitting(false);
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
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: "8px 20px",
              fontSize: 14,
              border: "1px solid #1a56db",
              borderRadius: 6,
              background: showForm ? "#1a56db" : "#fff",
              color: showForm ? "#fff" : "#1a56db",
              cursor: "pointer",
            }}
          >
            {showForm ? "收起" : "貼上文章"}
          </button>
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

      {/* Article submission form */}
      {showForm && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 20, marginBottom: 20, background: "#fafbfc" }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>標題 *</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="文章標題"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>來源</label>
            <input
              type="text"
              value={formSource}
              onChange={(e) => setFormSource(e.target.value)}
              placeholder="例：工商時報、MoneyDJ（選填）"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>文章內容 *</label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="貼上文章全文..."
              rows={10}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleSubmitArticle}
              disabled={submitting || !formTitle.trim() || !formContent.trim()}
              style={{
                padding: "8px 24px",
                fontSize: 14,
                border: "none",
                borderRadius: 6,
                background: "#1a56db",
                color: "#fff",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "分析中..." : "送出分析"}
            </button>
            {submitResult && (
              <span style={{ fontSize: 13, color: submitResult.startsWith("錯誤") || submitResult.startsWith("提交失敗") ? "#dc2626" : "#16a34a" }}>
                {submitResult}
              </span>
            )}
          </div>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#1e3a5f", color: "#fff" }}>
            <th style={thStyle}>編號</th>
            <th style={thStyle}>類別</th>
            <th style={thStyle}>股票</th>
            <th style={thStyle}>代號</th>
            <th style={{ ...thStyle, textAlign: "right" }}>現價</th>
            <th style={{ ...thStyle, textAlign: "center", width: 60 }}>標記</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <>
              <tr key={`cat-${cat.id}`} style={{ background: "#f0f4f8" }}>
                <td
                  colSpan={6}
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
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button
                          onClick={() => fetchAnnotations(stock.ticker)}
                          style={{
                            padding: "2px 10px",
                            fontSize: 12,
                            border: "1px solid #ccc",
                            borderRadius: 4,
                            background: isExpanded ? "#e0e7ff" : "#fff",
                            cursor: "pointer",
                          }}
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`ann-${stock.ticker}`}>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div style={{ background: "#f8fafc", borderLeft: "3px solid #1a56db", margin: "0 14px 8px", padding: "12px 16px" }}>
                            {isLoadingThis ? (
                              <div style={{ color: "#999", fontSize: 13 }}>載入中...</div>
                            ) : stockAnnotations.length === 0 ? (
                              <div style={{ color: "#999", fontSize: 13 }}>尚無標記段落</div>
                            ) : (
                              stockAnnotations.map((ann) => (
                                <div key={ann.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
                                  <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                                    <strong>{ann.articles?.title || "無標題"}</strong>
                                    {ann.articles?.created_at && (
                                      <span style={{ marginLeft: 8 }}>
                                        {new Date(ann.articles.created_at).toLocaleDateString("zh-TW")}
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
                              ))
                            )}
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
