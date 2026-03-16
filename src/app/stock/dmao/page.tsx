"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed",
      bottom: 40,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#222",
      color: "#fff",
      padding: "12px 28px",
      borderRadius: 8,
      fontSize: 14,
      zIndex: 9999,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    }}>
      {message}
    </div>
  );
}

export default function DmaoPage() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(today);
  const [formContent, setFormContent] = useState("");
  const [formSource, setFormSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleTitleChange = (value: string) => {
    setFormTitle(value);
    const m = value.match(/^(\d{4})(\d{2})(\d{2})\s/);
    setFormDate(m ? `${m[1]}-${m[2]}-${m[3]}` : today);
  };

  const clearToast = useCallback(() => setToast(null), []);

  const handleSubmitArticle = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSubmitting(true);
    setToast("分析中...");
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
        setToast(`已儲存，標記了 ${json.annotationCount} 個股票提及`);
        setTimeout(() => router.push("/articles"), 1500);
      } else {
        setToast(`錯誤：${json.error}`);
      }
    } catch (err) {
      setToast(`提交失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
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
        <div>
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
        </div>
      </div>

      {toast && <Toast message={toast} onClose={clearToast} />}
    </div>
  );
}
