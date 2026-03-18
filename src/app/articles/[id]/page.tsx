"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

type Article = {
  id: string;
  title: string;
  content: string;
  source: string | null;
  article_type: string | null;
  images: string[] | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  stock: { label: "個股分析", bg: "#dbeafe", color: "#1e40af" },
  weekly: { label: "產業週報", bg: "#d1fae5", color: "#065f46" },
  macro: { label: "總經分析", bg: "#fef3c7", color: "#92400e" },
  industry: { label: "產業分析", bg: "#ede9fe", color: "#5b21b6" },
};

type Annotation = {
  id: string;
  ticker: string;
  stock_name: string;
  paragraph: string;
  is_summary: boolean;
};

type EpsForecast = {
  id: string;
  ticker: string;
  stock_name: string;
  forecast_year: number;
  eps: number;
};

// ─── Add Stock Inline Input ───
function AddStockInput({ onAdd, onCancel }: { onAdd: (ticker: string, name: string) => void; onCancel: () => void }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    const val = input.trim();
    if (!val) { onCancel(); return; }
    const parts = val.match(/^(\S+)\s+(.+)$/);
    if (parts) {
      onAdd(parts[1], parts[2]);
    } else {
      onAdd(val, val);
    }
    setInput("");
  };

  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onCancel(); }}
        placeholder="代碼 名稱（如 2330 台積電）"
        style={{ padding: "2px 8px", fontSize: 13, border: "1px solid #c7d2fe", borderRadius: 8, width: 200 }}
      />
      <button onClick={handleSubmit} style={{ border: "none", background: "#4f46e5", color: "#fff", borderRadius: 8, padding: "2px 10px", fontSize: 13, cursor: "pointer" }}>
        加入
      </button>
    </span>
  );
}

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [epsForecasts, setEpsForecasts] = useState<EpsForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/articles/${id}`).then((r) => r.json()),
      fetch(`/api/annotations?article_id=${id}`).then((r) => r.json()),
      fetch(`/api/eps-forecasts?article_id=${id}`).then((r) => r.json()),
    ]).then(([artJson, annJson, epsJson]) => {
      if (artJson.ok) setArticle(artJson.article);
      if (annJson.ok) setAnnotations(annJson.annotations);
      if (epsJson.ok) setEpsForecasts(epsJson.forecasts);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px", fontFamily: "sans-serif" }}>
        載入中...
      </div>
    );
  }

  if (!article) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px", fontFamily: "sans-serif" }}>
        找不到文章
      </div>
    );
  }

  // Collect unique stock names and tickers for inline highlighting
  const stockKeywords = [...new Set(annotations.flatMap((a) => [a.stock_name, a.ticker]))].filter(Boolean);
  stockKeywords.sort((a, b) => b.length - a.length);

  const handleDelete = async () => {
    if (!confirm("確定要刪除這篇文章？（文章、標記、圖片將一併刪除）")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        router.push("/articles");
      } else {
        alert(`刪除失敗：${json.error}`);
      }
    } catch {
      alert("刪除失敗");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAnnotation = async (annId: string) => {
    const ann = annotations.find((a) => a.id === annId);
    if (!ann) return;

    // Check if this is the last annotation for this ticker
    const sameTickerCount = annotations.filter((a) => a.ticker === ann.ticker).length;
    const msg = sameTickerCount === 1
      ? `確定要刪除 ${ann.stock_name}(${ann.ticker}) 的標記？這是該股票的最後一筆標記。`
      : `確定要刪除 ${ann.stock_name}(${ann.ticker}) 的這筆段落標記？`;
    if (!confirm(msg)) return;

    try {
      const res = await fetch(`/api/annotations?id=${annId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setAnnotations((prev) => prev.filter((a) => a.id !== annId));
        // If we deleted the last annotation for the expanded stock, collapse it
        if (expandedStock === ann.ticker && sameTickerCount === 1) {
          setExpandedStock(null);
        }
        setToast(`已刪除 ${ann.stock_name} 的標記`);
      } else {
        alert(`刪除失敗：${json.error}`);
      }
    } catch {
      alert("刪除失敗");
    }
  };

  const handleDeleteAllForTicker = async (ticker: string) => {
    const tickerAnnotations = annotations.filter((a) => a.ticker === ticker);
    if (tickerAnnotations.length === 0) return;
    const name = tickerAnnotations[0].stock_name;
    if (!confirm(`確定要刪除 ${name}(${ticker}) 的所有 ${tickerAnnotations.length} 筆標記？`)) return;

    try {
      const results = await Promise.all(
        tickerAnnotations.map((a) =>
          fetch(`/api/annotations?id=${a.id}`, { method: "DELETE" }).then((r) => r.json())
        )
      );
      const allOk = results.every((r) => r.ok);
      if (allOk) {
        setAnnotations((prev) => prev.filter((a) => a.ticker !== ticker));
        if (expandedStock === ticker) setExpandedStock(null);
        setToast(`已刪除 ${name} 的所有標記`);
      } else {
        alert("部分刪除失敗");
      }
    } catch {
      alert("刪除失敗");
    }
  };

  const handleAddAnnotation = async (ticker: string, stockName: string) => {
    // Use full article content as the paragraph for manually added annotations
    const paragraph = `（手動新增標記）`;

    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_id: id,
          ticker,
          stock_name: stockName,
          paragraph,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setAnnotations((prev) => [...prev, json.annotation]);
        setAdding(false);
        setToast(`已新增 ${stockName}(${ticker})`);
      } else {
        alert(`新增失敗：${json.error}`);
      }
    } catch {
      alert("新增失敗");
    }
  };

  const highlightStocks = (text: string) => {
    if (stockKeywords.length === 0) return [text];
    const escaped = stockKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      stockKeywords.includes(part) ? (
        <mark key={i} style={{ background: "#fef9c3", padding: "1px 2px", borderRadius: 2 }}>{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
        ← 回到股票頁
      </a>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 20, marginBottom: 8, gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: "bold", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {article.article_type && TYPE_LABELS[article.article_type] && (
            <span style={{
              fontSize: 13, padding: "2px 10px", borderRadius: 12,
              background: TYPE_LABELS[article.article_type].bg,
              color: TYPE_LABELS[article.article_type].color,
              flexShrink: 0, fontWeight: 500,
            }}>
              {TYPE_LABELS[article.article_type].label}
            </span>
          )}
          <span>{article.title}</span>
        </h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: "6px 14px", fontSize: 13, border: "1px solid #dc2626", borderRadius: 4,
            background: "#fff", color: "#dc2626",
            cursor: deleting ? "not-allowed" : "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {deleting ? "刪除中..." : "刪除文章"}
        </button>
      </div>

      <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
        {article.source && <span style={{ marginRight: 12 }}>來源：{article.source}</span>}
        {new Date(article.created_at).toLocaleString("zh-TW")}
      </div>

      {/* Annotation summary - with edit controls */}
      <div style={{ background: "#f0f4f8", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
        <div style={{ fontWeight: "bold", fontSize: 14, marginBottom: 6 }}>提及的股票：</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {[...new Map(annotations.map((a) => [a.ticker, a])).values()].map((a) => {
            const label = `${a.stock_name} (${a.ticker})`;
            const isExpanded = expandedStock === a.ticker;
            return (
              <span
                key={a.ticker}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: isExpanded ? "#1e40af" : "#dbeafe",
                  color: isExpanded ? "#fff" : "#1e40af",
                  padding: "2px 10px", borderRadius: 12, fontSize: 13,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <span onClick={() => setExpandedStock(isExpanded ? null : a.ticker)}>
                  {label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteAllForTicker(a.ticker); }}
                  style={{
                    border: "none", background: "none",
                    color: isExpanded ? "#fff" : "#1e40af",
                    cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1, fontWeight: "bold",
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
          {adding ? (
            <AddStockInput
              onAdd={handleAddAnnotation}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              style={{
                border: "1px dashed #93a3b8", background: "none", color: "#64748b",
                borderRadius: 12, padding: "2px 10px", fontSize: 13, cursor: "pointer",
              }}
            >
              + 新增
            </button>
          )}
        </div>

        {/* Expanded stock annotations with per-annotation delete */}
        {expandedStock && (() => {
          const stockAnnotations = annotations.filter((a) => a.ticker === expandedStock);
          if (stockAnnotations.length === 0) return null;
          const name = stockAnnotations[0].stock_name;
          return (
            <div style={{ marginTop: 10, borderTop: "1px solid #d1d5db", paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: "bold", color: "#1e40af", marginBottom: 6 }}>
                {name} ({expandedStock}) 相關段落：
              </div>
              {stockAnnotations.map((ann, i) => (
                <div
                  key={ann.id || i}
                  style={{
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
                    padding: "10px 12px", marginBottom: 6, fontSize: 14,
                    lineHeight: 1.7, whiteSpace: "pre-wrap",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      {ann.is_summary && (
                        <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, marginRight: 6 }}>
                          AI 摘要
                        </span>
                      )}
                      {ann.paragraph}
                    </div>
                    <button
                      onClick={() => handleDeleteAnnotation(ann.id)}
                      title="刪除這筆標記"
                      style={{
                        border: "1px solid #e5e7eb", background: "#fff", color: "#dc2626",
                        borderRadius: 4, padding: "2px 8px", fontSize: 12,
                        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* EPS Forecasts */}
      {epsForecasts.length > 0 && (
        <div style={{ background: "#fefce8", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontWeight: "bold", fontSize: 14, marginBottom: 8 }}>財測 EPS：</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>股票</th>
                <th style={{ textAlign: "center", padding: "4px 8px" }}>年度</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>財測 EPS</th>
              </tr>
            </thead>
            <tbody>
              {epsForecasts.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "4px 8px" }}>{f.stock_name} ({f.ticker})</td>
                  <td style={{ textAlign: "center", padding: "4px 8px" }}>{f.forecast_year}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px", fontWeight: "bold", color: "#b45309" }}>{f.eps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Article content with inline stock highlighting */}
      <div style={{ lineHeight: 1.8, fontSize: 15 }}>
        {article.content.split("\n").map((para, i) => {
          const trimmed = para.trim();
          if (!trimmed) return <br key={i} />;
          const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
          if (imgMatch) {
            return (
              <div key={i} style={{ margin: "12px 0" }}>
                <img
                  src={imgMatch[2]}
                  alt={imgMatch[1] || "image"}
                  style={{ maxWidth: "100%", borderRadius: 6, border: "1px solid #e5e7eb" }}
                />
              </div>
            );
          }
          return (
            <p key={i} style={{ margin: "8px 0" }}>
              {highlightStocks(trimmed)}
            </p>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)",
          background: "#222", color: "#fff", padding: "12px 28px", borderRadius: 8,
          fontSize: 14, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
