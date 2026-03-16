"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Article = {
  id: string;
  title: string;
  content: string;
  source: string | null;
  images: string[] | null;
  created_at: string;
};

type Annotation = {
  id: string;
  ticker: string;
  stock_name: string;
  paragraph: string;
};

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/articles/${id}`).then((r) => r.json()),
      fetch(`/api/annotations?article_id=${id}`).then((r) => r.json()),
    ]).then(([artJson, annJson]) => {
      if (artJson.ok) setArticle(artJson.article);
      if (annJson.ok) setAnnotations(annJson.annotations);
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

  // Collect unique annotated paragraphs for highlighting
  const annotatedParagraphs = annotations.map((a) => a.paragraph);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
        ← 回到股票頁
      </a>

      <h1 style={{ fontSize: 24, fontWeight: "bold", marginTop: 20, marginBottom: 8 }}>
        {article.title}
      </h1>

      <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
        {article.source && <span style={{ marginRight: 12 }}>來源：{article.source}</span>}
        {new Date(article.created_at).toLocaleString("zh-TW")}
      </div>

      {/* Annotation summary */}
      {annotations.length > 0 && (
        <div style={{ background: "#f0f4f8", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontWeight: "bold", fontSize: 14, marginBottom: 6 }}>提及的股票：</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[...new Set(annotations.map((a) => `${a.stock_name} (${a.ticker})`))].map((label) => (
              <span
                key={label}
                style={{
                  background: "#dbeafe",
                  color: "#1e40af",
                  padding: "2px 10px",
                  borderRadius: 12,
                  fontSize: 13,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Article content with highlighting */}
      <div style={{ lineHeight: 1.8, fontSize: 15 }}>
        {article.content.split("\n").map((para, i) => {
          const trimmed = para.trim();
          if (!trimmed) return <br key={i} />;
          const isAnnotated = annotatedParagraphs.some(
            (ap) => trimmed.includes(ap) || ap.includes(trimmed)
          );
          return (
            <p
              key={i}
              style={{
                margin: "8px 0",
                ...(isAnnotated
                  ? { background: "#fef9c3", borderLeft: "3px solid #eab308", paddingLeft: 12 }
                  : {}),
              }}
            >
              {trimmed}
            </p>
          );
        })}
      </div>

      {/* Images */}
      {article.images && article.images.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: "bold", fontSize: 14, marginBottom: 8 }}>附圖：</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {article.images.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`article-image-${i}`}
                style={{ maxWidth: "100%", borderRadius: 6, border: "1px solid #e5e7eb" }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
