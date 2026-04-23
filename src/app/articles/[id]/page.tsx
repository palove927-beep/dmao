"use client";

import { useEffect, useState } from "react";
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

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [epsForecasts, setEpsForecasts] = useState<EpsForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [expandedStock, setExpandedStock] = useState<string | null>(null);

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
  const allStockKeywords = [...new Set(annotations.flatMap((a) => [a.stock_name, a.ticker]))].filter(Boolean);
  allStockKeywords.sort((a, b) => b.length - a.length);

  // Build a map: ticker -> EPS forecasts for inline display
  const epsByTicker = new Map<string, EpsForecast[]>();
  for (const f of epsForecasts) {
    if (!epsByTicker.has(f.ticker)) epsByTicker.set(f.ticker, []);
    epsByTicker.get(f.ticker)!.push(f);
  }

  // Build stock keyword to ticker mapping for paragraph matching
  const keywordToTicker = new Map<string, string>();
  for (const a of annotations) {
    keywordToTicker.set(a.stock_name, a.ticker);
    keywordToTicker.set(a.ticker, a.ticker);
  }

  // Find EPS forecasts relevant to a paragraph
  const getParaEps = (text: string): EpsForecast[] => {
    const matched = new Set<string>();
    for (const [keyword, ticker] of keywordToTicker) {
      if (text.includes(keyword) && epsByTicker.has(ticker)) {
        matched.add(ticker);
      }
    }
    return [...matched].flatMap((t) => epsByTicker.get(t) || []);
  };

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

  const highlightText = (text: string, keywords: string[]) => {
    if (keywords.length === 0) return [text];
    const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = text.split(regex);
    const kw = new Set(keywords);
    return parts.map((part, i) =>
      kw.has(part) ? (
        <mark key={i} style={{ background: "#fef9c3", padding: "1px 2px", borderRadius: 2 }}>{part}</mark>
      ) : (
        part
      )
    );
  };

  const renderParagraph = (text: string) => {
    const parts = text.split(/(==.+?==)/gs);
    if (parts.length === 1) return highlightText(text, allStockKeywords);
    return parts.map((part, i) => {
      if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
        const inner = part.slice(2, -2);
        return (
          <mark key={i} style={{ background: "#fef08a", padding: "1px 3px", borderRadius: 3 }}>
            {highlightText(inner, allStockKeywords)}
          </mark>
        );
      }
      return <span key={i}>{highlightText(part, allStockKeywords)}</span>;
    });
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
              fontSize: 13,
              padding: "2px 10px",
              borderRadius: 12,
              background: TYPE_LABELS[article.article_type].bg,
              color: TYPE_LABELS[article.article_type].color,
              flexShrink: 0,
              fontWeight: 500,
            }}>
              {TYPE_LABELS[article.article_type].label}
            </span>
          )}
          <span>{article.title}</span>
        </h1>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => router.push(`/articles/${id}/edit`)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              border: "1px solid #1a56db",
              borderRadius: 4,
              background: "#fff",
              color: "#1a56db",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            編輯標記
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              border: "1px solid #dc2626",
              borderRadius: 4,
              background: "#fff",
              color: "#dc2626",
              cursor: deleting ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {deleting ? "刪除中..." : "刪除文章"}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
        {article.source && <span style={{ marginRight: 12 }}>來源：{article.source}</span>}
        {new Date(article.created_at).toLocaleString("zh-TW")}
      </div>

      {/* Annotation summary */}
      {annotations.length > 0 && (
        <div style={{ background: "#f0f4f8", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontWeight: "bold", fontSize: 14, marginBottom: 6 }}>提及的股票：</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[...new Map(annotations.map((a) => [a.ticker, a])).values()].map((a) => {
              const label = `${a.stock_name} (${a.ticker})`;
              const isExpanded = expandedStock === a.ticker;
              return (
                <span
                  key={a.ticker}
                  onClick={() => setExpandedStock(isExpanded ? null : a.ticker)}
                  style={{
                    background: isExpanded ? "#1e40af" : "#dbeafe",
                    color: isExpanded ? "#fff" : "#1e40af",
                    padding: "2px 10px",
                    borderRadius: 12,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
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
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      padding: "10px 12px",
                      marginBottom: 6,
                      fontSize: 14,
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {ann.is_summary && (
                      <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, marginRight: 6 }}>
                        AI 摘要
                      </span>
                    )}
                    {highlightText(ann.paragraph, [name, expandedStock])}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

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
          // Render markdown images: ![alt](url)
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
          const paraEps = getParaEps(trimmed);
          return (
            <div key={i}>
              <p style={{ margin: "8px 0" }}>
                {renderParagraph(trimmed)}
              </p>
              {paraEps.length > 0 && (
                <div style={{
                  background: "#fefce8",
                  border: "1px solid #fde68a",
                  borderRadius: 6,
                  padding: "6px 12px",
                  margin: "4px 0 8px 0",
                  fontSize: 13,
                  display: "inline-flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                }}>
                  <span style={{ fontWeight: "bold", color: "#92400e", marginRight: 4 }}>財測 EPS：</span>
                  {paraEps.map((f) => (
                    <span key={f.id} style={{ color: "#78350f" }}>
                      {f.stock_name}({f.ticker}) {f.forecast_year}年：
                      <span style={{ fontWeight: "bold", color: "#b45309" }}>{f.eps}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
