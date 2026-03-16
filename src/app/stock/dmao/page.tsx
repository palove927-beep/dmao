"use client";

import { useState } from "react";

export default function DmaoPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(today);
  const [formContent, setFormContent] = useState("");
  const [formSource, setFormSource] = useState("");

  const handleTitleChange = (value: string) => {
    setFormTitle(value);
    const m = value.match(/^(\d{4})(\d{2})(\d{2})\s/);
    setFormDate(m ? `${m[1]}-${m[2]}-${m[3]}` : today);
  };
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);

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
          article_date: formDate,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSubmitResult(`已儲存，標記了 ${json.annotationCount} 個股票提及`);
        setFormTitle("");
        setFormDate(today);
        setFormContent("");
        setFormSource("");
      } else {
        setSubmitResult(`錯誤：${json.error}`);
      }
    } catch (err) {
      setSubmitResult(`提交失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
        ← 股票報價
      </a>

      <h1 style={{ fontSize: 28, fontWeight: "bold", margin: "24px 0 20px" }}>
        貼上文章
      </h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 20, background: "#fafbfc" }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>標題 *</label>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="文章標題"
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>文章日期</label>
          <input
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14 }}
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
            rows={15}
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
    </div>
  );
}
