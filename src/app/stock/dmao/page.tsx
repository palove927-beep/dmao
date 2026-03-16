"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

function Toast({ message, persistent, onClose }: { message: string; persistent?: boolean; onClose: () => void }) {
  useEffect(() => {
    if (persistent) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose, persistent]);

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
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(today);
  const [formContent, setFormContent] = useState("");
  const [formSource, setFormSource] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; persistent?: boolean } | null>(null);

  const handleTitleChange = (value: string) => {
    setFormTitle(value);
    const m = value.match(/^(\d{4})(\d{2})(\d{2})\s/);
    setFormDate(m ? `${m[1]}-${m[2]}-${m[3]}` : today);
  };

  const clearToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((message: string, persistent?: boolean) => setToast({ message, persistent }), []);

  const insertImageAtCursor = (url: string) => {
    const tag = `![圖片](${url})`;
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = formContent.slice(0, start);
      const after = formContent.slice(end);
      const needNewlineBefore = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      const needNewlineAfter = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
      const newContent = before + needNewlineBefore + tag + needNewlineAfter + after;
      setFormContent(newContent);
      const cursorPos = (before + needNewlineBefore + tag + needNewlineAfter).length;
      requestAnimationFrame(() => {
        ta.selectionStart = cursorPos;
        ta.selectionEnd = cursorPos;
        ta.focus();
      });
    } else {
      setFormContent((prev) => prev + (prev && !prev.endsWith("\n") ? "\n" : "") + tag + "\n");
    }
  };

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.ok) {
        insertImageAtCursor(json.url);
        showToast("圖片上傳成功");
      } else {
        showToast(`上傳失敗：${json.error}`);
      }
    } catch {
      showToast("圖片上傳失敗");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(uploadFile);
    }
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      imageFiles.forEach(uploadFile);
      // Don't preventDefault — let text paste through normally
    }
  };

  const handleSubmitArticle = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSubmitting(true);
    showToast("分析中...", true);
    // Extract image URLs from content
    const imageUrls = Array.from(formContent.matchAll(/!\[.*?\]\((.*?)\)/g)).map((m) => m[1]);
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          content: formContent,
          source: formSource || undefined,
          article_date: formDate,
          images: imageUrls,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        showToast(`已儲存，標記了 ${json.annotationCount} 個股票提及`);
        setTimeout(() => router.push("/articles"), 1500);
      } else {
        showToast(`錯誤：${json.error}`);
      }
    } catch (err) {
      showToast(`提交失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{ maxWidth: 700, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}
      onPaste={handlePaste}
    >
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
            ref={textareaRef}
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder="貼上文章全文...（也可直接 Ctrl+V 貼上圖片，圖片會插入在游標位置）"
            rows={15}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
          />
        </div>

        {/* Image upload */}
        <div style={{ marginBottom: 12 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              border: "1px solid #ccc",
              borderRadius: 4,
              background: "#fff",
              cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "上傳中..." : "插入圖片"}
          </button>
          <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>
            或 Ctrl+V 貼上圖片（會插入在游標位置）
          </span>
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

      {toast && <Toast message={toast.message} persistent={toast.persistent} onClose={clearToast} />}
    </div>
  );
}
