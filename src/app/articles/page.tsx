"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import PageHeader from "@/components/PageHeader";

type Article = {
  id: string;
  title: string;
  source: string | null;
  article_date: string | null;
  article_type: string | null;
  created_at: string;
  snippet?: string;
};

const TYPE_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  stock: { label: "個股", bg: "#dbeafe", color: "#1e40af" },
  weekly: { label: "週報", bg: "#d1fae5", color: "#065f46" },
  macro: { label: "總經", bg: "#fef3c7", color: "#92400e" },
  industry: { label: "產業", bg: "#ede9fe", color: "#5b21b6" },
};

function highlightSnippet(snippet: string, q: string) {
  if (!q) return snippet;
  const parts = snippet.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} style={{ background: "#fef9c3", padding: "0 1px", borderRadius: 2 }}>{part}</mark>
    ) : part
  );
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // loading 初值就是 true，首次載入不需要再設一次；
  // 搜尋時的 loading 由事件處理器負責，不放在 effect 裡
  const fetchArticles = useCallback(async (q: string) => {
    const url = q ? `/api/articles?q=${encodeURIComponent(q)}` : "/api/articles";
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setArticles(json.articles ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchArticles(""); }, [fetchArticles]);

  const handleSearch = () => {
    const q = searchInput.trim();
    setActiveQuery(q);
    setLoading(true);
    fetchArticles(q);
  };

  const handleClear = () => {
    setSearchInput("");
    setActiveQuery("");
    setLoading(true);
    fetchArticles("");
    inputRef.current?.focus();
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <PageHeader />

      {/* 搜尋列 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          ref={inputRef}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="搜尋文章內容（如：台積電、碳化矽）"
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #d1d5db",
            borderRadius: 6,
            outline: "none",
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            padding: "8px 18px",
            fontSize: 14,
            border: "none",
            borderRadius: 6,
            background: "#1a56db",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          搜尋
        </button>
        {activeQuery && (
          <button
            onClick={handleClear}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            清除
          </button>
        )}
      </div>

      {/* 搜尋結果摘要 */}
      {activeQuery && !loading && (
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
          {articles.length > 0
            ? `共 ${articles.length} 篇符合「${activeQuery}」`
            : `沒有符合「${activeQuery}」的文章`}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>
      ) : articles.length === 0 && !activeQuery ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>尚無文章</div>
      ) : (
        <div>
          {articles.map((a) => (
            <a
              key={a.id}
              href={`/articles/${a.id}`}
              style={{
                display: "block",
                padding: "14px 16px",
                marginBottom: 8,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                textDecoration: "none",
                color: "#222",
                background: "#fafbfc",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: "bold", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                {a.article_type && TYPE_LABELS[a.article_type] && (
                  <span style={{
                    fontSize: 11,
                    padding: "1px 8px",
                    borderRadius: 10,
                    background: TYPE_LABELS[a.article_type].bg,
                    color: TYPE_LABELS[a.article_type].color,
                    flexShrink: 0,
                  }}>
                    {TYPE_LABELS[a.article_type].label}
                  </span>
                )}
                <span>{a.title}</span>
              </div>
              <div style={{ fontSize: 13, color: "#888" }}>
                {a.article_date && <span>{a.article_date}</span>}
                {a.source && <span style={{ marginLeft: 12 }}>{a.source}</span>}
              </div>
              {a.snippet && (
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6, lineHeight: 1.5 }}>
                  {highlightSnippet(a.snippet, activeQuery)}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
