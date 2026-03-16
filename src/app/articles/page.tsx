"use client";

import { useEffect, useState } from "react";

type Article = {
  id: string;
  title: string;
  source: string | null;
  article_date: string | null;
  created_at: string;
};

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/articles")
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) setArticles(json.articles);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
        ← 股票報價
      </a>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 20px" }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", margin: 0 }}>文章列表</h1>
        <a
          href="/stock/dmao"
          style={{
            padding: "8px 20px",
            fontSize: 14,
            border: "1px solid #1a56db",
            borderRadius: 6,
            background: "#1a56db",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          貼上文章
        </a>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>
      ) : articles.length === 0 ? (
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
              <div style={{ fontSize: 15, fontWeight: "bold", marginBottom: 4 }}>{a.title}</div>
              <div style={{ fontSize: 13, color: "#888" }}>
                {a.article_date && (
                  <span>{a.article_date}</span>
                )}
                {a.source && (
                  <span style={{ marginLeft: 12 }}>{a.source}</span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
