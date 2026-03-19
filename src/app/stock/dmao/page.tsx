"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { splitParagraphs } from "@/lib/paragraphs";

// ─── Types ──────────────────────────────────────────────
type StockTag = { ticker: string; stock_name: string };
type ParagraphData = { text: string; stocks: StockTag[] };
type EpsForecast = { ticker: string; stock_name: string; forecast_year: number; eps: number };

// ─── Toast ──────────────────────────────────────────────
function Toast({ message, persistent, onClose }: { message: string; persistent?: boolean; onClose: () => void }) {
  useEffect(() => {
    if (persistent) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose, persistent]);

  return (
    <div style={{
      position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)",
      background: "#222", color: "#fff", padding: "12px 28px", borderRadius: 8,
      fontSize: 14, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    }}>
      {message}
    </div>
  );
}

// ─── StockChips (per-paragraph stock tags with add/remove) ─
function StockChips({
  stocks,
  onRemove,
  onAdd,
}: {
  stocks: StockTag[];
  onRemove: (ticker: string) => void;
  onAdd: (stock: StockTag) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const handleAdd = () => {
    const val = input.trim();
    if (!val) { setAdding(false); return; }
    // Parse "ticker name" or just "name"
    const parts = val.match(/^(\S+)\s+(.+)$/);
    const stock: StockTag = parts
      ? { ticker: parts[1], stock_name: parts[2] }
      : { ticker: val, stock_name: val };
    onAdd(stock);
    setInput("");
    setAdding(false);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 }}>
      {stocks.map((s) => (
        <span
          key={s.ticker}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "#dbeafe", color: "#1e40af", padding: "2px 10px",
            borderRadius: 12, fontSize: 13,
          }}
        >
          {s.stock_name}({s.ticker})
          <button
            onClick={() => onRemove(s.ticker)}
            style={{
              border: "none", background: "none", color: "#1e40af",
              cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1,
              fontWeight: "bold",
            }}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setInput(""); } }}
            placeholder="代碼 名稱（如 2330 台積電）"
            style={{ padding: "2px 8px", fontSize: 13, border: "1px solid #c7d2fe", borderRadius: 8, width: 200 }}
          />
          <button onClick={handleAdd} style={{ border: "none", background: "#4f46e5", color: "#fff", borderRadius: 8, padding: "2px 10px", fontSize: 13, cursor: "pointer" }}>
            加入
          </button>
        </span>
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
  );
}

// ─── Main Page ─────────────────────────────────────────
export default function DmaoPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const docxRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Step 1: Input form state
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(today);
  const [formContent, setFormContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; persistent?: boolean } | null>(null);
  const [gdocUrl, setGdocUrl] = useState("");
  const [gdocLoading, setGdocLoading] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);
  const pendingImagesRef = useRef<Map<string, File | string>>(new Map());

  // Step 2: Review state
  const [step, setStep] = useState<1 | 2>(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [paragraphs, setParagraphs] = useState<ParagraphData[]>([]);
  const [articleType, setArticleType] = useState<string>("other");
  const [epsForecasts, setEpsForecasts] = useState<EpsForecast[]>([]);
  const [finalContent, setFinalContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleTitleChange = (value: string) => {
    setFormTitle(value);
    const m = value.match(/^(\d{4})(\d{2})(\d{2})\s/);
    setFormDate(m ? `${m[1]}-${m[2]}-${m[3]}` : today);
  };

  const clearToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((message: string, persistent?: boolean) => setToast({ message, persistent }), []);

  // ─── Import handlers (same as before) ───
  const handleGdocImport = async () => {
    if (!gdocUrl.trim()) return;
    setGdocLoading(true);
    showToast("正在匯入 Google 文件...", true);
    try {
      const res = await fetch("/api/gdoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gdocUrl }),
      });
      const json = await res.json();
      if (json.ok) {
        if (json.title) handleTitleChange(json.title);
        setFormContent(json.content || "");
        if (json.images?.length > 0) {
          for (const src of json.images) {
            pendingImagesRef.current.set(`pending:${src}`, src);
          }
        }
        setGdocUrl("");
        showToast(`已匯入「${json.title || "無標題"}」`);
      } else {
        showToast(`匯入失敗：${json.error}`);
      }
    } catch (err) {
      showToast(`匯入失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setGdocLoading(false);
    }
  };

  const queueLocalFile = (file: File): string => {
    const blobUrl = URL.createObjectURL(file);
    pendingImagesRef.current.set(blobUrl, file);
    return blobUrl;
  };

  const queueRemoteUrl = (src: string): string => {
    const placeholder = `pending:${src}`;
    pendingImagesRef.current.set(placeholder, src);
    return placeholder;
  };

  const handleDocxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setDocxLoading(true);
    showToast("正在匯入 Word 文件...", true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/docx", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        if (json.title) handleTitleChange(json.title);
        let content: string = json.content || "";
        const dataUriRegex = /!\[圖片\]\((data:image\/[^)]+)\)/g;
        let match;
        let imgIndex = 0;
        while ((match = dataUriRegex.exec(content)) !== null) {
          const dataUri = match[1];
          try {
            const resp = await fetch(dataUri);
            const blob = await resp.blob();
            const ext = blob.type.split("/")[1] || "png";
            const imgFile = new File([blob], `docx-image-${imgIndex++}.${ext}`, { type: blob.type });
            const blobUrl = queueLocalFile(imgFile);
            content = content.replace(dataUri, blobUrl);
          } catch { /* leave as-is */ }
        }
        setFormContent(content);
        showToast(`已匯入「${json.title || "無標題"}」`);
      } else {
        showToast(`匯入失敗：${json.error}`);
      }
    } catch (err) {
      showToast(`匯入失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setDocxLoading(false);
    }
  };

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file) => {
        const blobUrl = queueLocalFile(file);
        insertImageAtCursor(blobUrl);
      });
      showToast(`已插入 ${files.length} 張圖片`);
    }
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const html = e.clipboardData.getData("text/html");
    const hasImages = items.some((item) => item.type.startsWith("image/"));

    if (html && html.includes("<img")) {
      e.preventDefault();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const parts: string[] = [];
      const imgPlaceholders = new Map<string, string>();
      const imgs = doc.querySelectorAll("img");
      for (const img of imgs) {
        const src = img.getAttribute("src");
        if (src && !imgPlaceholders.has(src)) {
          imgPlaceholders.set(src, queueRemoteUrl(src));
        }
      }
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) parts.push(text);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (el.tagName === "IMG") {
            const src = el.getAttribute("src");
            const placeholder = src ? imgPlaceholders.get(src) : null;
            if (placeholder) parts.push(`![圖片](${placeholder})`);
          } else if (el.tagName === "BR") {
            parts.push("\n");
          } else {
            const isBlock = ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TR", "BLOCKQUOTE", "SECTION", "ARTICLE"].includes(el.tagName);
            if (isBlock && parts.length > 0) parts.push("\n");
            for (const child of el.childNodes) walk(child);
            if (isBlock) parts.push("\n");
          }
        }
      };
      walk(doc.body);
      const pastedContent = parts.join("").replace(/\n{3,}/g, "\n\n").trim();
      const ta = textareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = formContent.slice(0, start);
        const after = formContent.slice(end);
        const sep1 = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
        const sep2 = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
        setFormContent(before + sep1 + pastedContent + sep2 + after);
      } else {
        setFormContent((prev) => prev + (prev ? "\n" : "") + pastedContent);
      }
      const imgCount = imgPlaceholders.size;
      showToast(imgCount > 0 ? `已貼上，含 ${imgCount} 張圖片（儲存時上傳）` : "已貼上");
      return;
    }

    if (hasImages) {
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        for (const file of imageFiles) {
          const blobUrl = queueLocalFile(file);
          insertImageAtCursor(blobUrl);
        }
        showToast(`已插入 ${imageFiles.length} 張圖片（儲存時上傳）`);
      }
    }
  };

  const uploadPendingImages = async (content: string): Promise<string> => {
    const pending = pendingImagesRef.current;
    if (pending.size === 0) return content;
    let result = content;
    const entries = Array.from(pending.entries());
    const uploads = entries.map(async ([placeholder, source]) => {
      try {
        let url: string | null = null;
        if (source instanceof File) {
          const fd = new FormData();
          fd.append("file", source);
          fd.append("article_date", formDate);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          const json = await res.json();
          url = json.ok ? json.url : null;
        } else {
          const remoteSrc = placeholder.replace(/^pending:/, "");
          const res = await fetch("/api/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ src: remoteSrc, article_date: formDate }),
          });
          const json = await res.json();
          url = json.ok ? json.url : null;
        }
        return { placeholder, url };
      } catch {
        return { placeholder, url: null };
      }
    });
    const results = await Promise.all(uploads);
    for (const { placeholder, url } of results) {
      if (url) {
        result = result.split(placeholder).join(url);
      } else {
        result = result.replace(new RegExp(`!\\[.*?\\]\\(${placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\n?`, "g"), "");
      }
    }
    for (const [placeholder, source] of entries) {
      if (source instanceof File && placeholder.startsWith("blob:")) {
        URL.revokeObjectURL(placeholder);
      }
    }
    pending.clear();
    return result;
  };

  // ─── Step 1 → Step 2: Analyze ───
  const handleAnalyze = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setAnalyzing(true);

    try {
      // Upload pending images first
      if (pendingImagesRef.current.size > 0) {
        showToast("上傳圖片中...", true);
      }
      const uploaded = await uploadPendingImages(formContent);
      setFinalContent(uploaded);

      showToast("AI 分析段落中...", true);

      // Split into paragraphs
      const paras = splitParagraphs(uploaded);

      // Call analyze API
      const res = await fetch("/api/articles/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: formTitle, paragraphs: paras }),
      });
      const json = await res.json();

      if (json.ok) {
        // Build paragraph data with stock tags
        const paraData: ParagraphData[] = paras.map((text, i) => {
          const match = json.paragraph_stocks.find((ps: { index: number }) => ps.index === i);
          return { text, stocks: match ? match.stocks : [] };
        });
        setParagraphs(paraData);
        setArticleType(json.article_type);
        setEpsForecasts(json.eps_forecasts || []);
        setStep(2);
        showToast(`分析完成，共 ${paras.length} 個段落`);
      } else {
        showToast(`分析失敗：${json.error}`);
      }
    } catch (err) {
      showToast(`分析失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // ─── Step 2: Edit stock tags ───
  const handleRemoveStock = (paraIndex: number, ticker: string) => {
    setParagraphs((prev) =>
      prev.map((p, i) =>
        i === paraIndex ? { ...p, stocks: p.stocks.filter((s) => s.ticker !== ticker) } : p
      )
    );
  };

  const handleAddStock = (paraIndex: number, stock: StockTag) => {
    setParagraphs((prev) =>
      prev.map((p, i) =>
        i === paraIndex
          ? { ...p, stocks: p.stocks.some((s) => s.ticker === stock.ticker) ? p.stocks : [...p.stocks, stock] }
          : p
      )
    );
  };

  // Split a paragraph's text into movable sentences
  const splitSentences = (text: string): string[] => {
    const parts = text.match(/[^。！？!?\n]+[。！？!?\n]?/g);
    return parts ? parts : [text];
  };

  // Move the last sentence of paragraph[i] down to the start of paragraph[i+1]
  const handleMoveDown = (i: number) => {
    setParagraphs((prev) => {
      if (i >= prev.length - 1) return prev;
      const upper = prev[i];
      const lower = prev[i + 1];
      const sentences = splitSentences(upper.text);
      if (sentences.length <= 1) return prev;
      const moved = sentences.pop()!;
      const next = [...prev];
      next[i] = { ...upper, text: sentences.join("").trimEnd() };
      next[i + 1] = { ...lower, text: (moved.trimStart() + lower.text) };
      return next;
    });
  };

  // Move the first sentence of paragraph[i+1] up to the end of paragraph[i]
  const handleMoveUp = (i: number) => {
    setParagraphs((prev) => {
      if (i >= prev.length - 1) return prev;
      const upper = prev[i];
      const lower = prev[i + 1];
      const sentences = splitSentences(lower.text);
      if (sentences.length <= 1) return prev;
      const moved = sentences.shift()!;
      const next = [...prev];
      next[i] = { ...upper, text: (upper.text + moved.trimEnd()) };
      next[i + 1] = { ...lower, text: sentences.join("").trimStart() };
      return next;
    });
  };

  // Merge paragraph[i+1] into paragraph[i]
  const handleMerge = (i: number) => {
    setParagraphs((prev) => {
      if (i >= prev.length - 1) return prev;
      const upper = prev[i];
      const lower = prev[i + 1];
      const next = [...prev];
      const mergedStocks = [...upper.stocks];
      const seen = new Set(mergedStocks.map((s) => s.ticker));
      for (const s of lower.stocks) {
        if (!seen.has(s.ticker)) { mergedStocks.push(s); seen.add(s.ticker); }
      }
      next[i] = { text: upper.text + "\n" + lower.text, stocks: mergedStocks };
      next.splice(i + 1, 1);
      return next;
    });
  };

  // ─── Step 2 → Save ───
  const handleSave = async () => {
    setSubmitting(true);
    showToast("儲存中...", true);

    try {
      // Build annotations: for each paragraph with stocks, each stock gets one annotation row
      const annotations: { ticker: string; stock_name: string; paragraph: string; is_summary: boolean }[] = [];
      for (const para of paragraphs) {
        for (const stock of para.stocks) {
          annotations.push({
            ticker: stock.ticker,
            stock_name: stock.stock_name,
            paragraph: para.text,
            is_summary: false,
          });
        }
      }

      const imageUrls = Array.from(finalContent.matchAll(/!\[.*?\]\((.*?)\)/g)).map((m) => m[1]);

      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          content: finalContent,
          article_date: formDate,
          images: imageUrls,
          article_type: articleType,
          annotations,
          eps_forecasts: epsForecasts,
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
      showToast(`儲存失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───
  const totalStocks = new Set(paragraphs.flatMap((p) => p.stocks.map((s) => s.ticker))).size;
  const totalAnnotations = paragraphs.reduce((sum, p) => sum + p.stocks.length, 0);

  return (
    <div
      style={{ maxWidth: 700, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}
      onPaste={step === 1 ? handlePaste : undefined}
    >
      <a href="/stock" style={{ color: "#1a56db", textDecoration: "none", fontSize: 15 }}>
        ← 股票報價
      </a>

      <h1 style={{ fontSize: 28, fontWeight: "bold", margin: "24px 0 20px" }}>
        {step === 1 ? "貼上文章" : "審核標記"}
      </h1>

      {step === 1 && (
        <>
          {/* Document import */}
          <div style={{ border: "1px solid #c7d2fe", borderRadius: 8, padding: 16, background: "#eef2ff", marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>匯入文件</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={gdocUrl}
                onChange={(e) => setGdocUrl(e.target.value)}
                placeholder="貼上 Google Doc 連結..."
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14 }}
                onKeyDown={(e) => { if (e.key === "Enter") handleGdocImport(); }}
              />
              <button
                onClick={handleGdocImport}
                disabled={gdocLoading || !gdocUrl.trim()}
                style={{
                  padding: "8px 16px", fontSize: 14, border: "none", borderRadius: 4,
                  background: gdocLoading ? "#93a3b8" : "#4f46e5", color: "#fff",
                  cursor: gdocLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                }}
              >
                {gdocLoading ? "匯入中..." : "匯入"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "#6366f1" }}>
                文件需設為「知道連結的人都能檢視」
              </div>
              <div style={{ fontSize: 12, color: "#999" }}>或</div>
              <input ref={docxRef} type="file" accept=".docx" onChange={handleDocxImport} style={{ display: "none" }} />
              <button
                type="button"
                onClick={() => docxRef.current?.click()}
                disabled={docxLoading}
                style={{
                  padding: "4px 12px", fontSize: 13, border: "1px solid #c7d2fe", borderRadius: 4,
                  background: "#fff", color: "#4f46e5", cursor: docxLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                }}
              >
                {docxLoading ? "匯入中..." : "上傳 Word 檔"}
              </button>
            </div>
          </div>

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

            <div style={{ marginBottom: 12 }}>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: "none" }} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{
                  padding: "6px 16px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4,
                  background: "#fff", cursor: uploading ? "not-allowed" : "pointer",
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
                onClick={handleAnalyze}
                disabled={analyzing || !formTitle.trim() || !formContent.trim()}
                style={{
                  padding: "8px 24px", fontSize: 14, border: "none", borderRadius: 6,
                  background: "#1a56db", color: "#fff",
                  cursor: analyzing ? "not-allowed" : "pointer",
                  opacity: analyzing ? 0.6 : 1,
                }}
              >
                {analyzing ? "分析中..." : "分析段落"}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {/* Summary bar */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#f0f4f8", borderRadius: 8, padding: "10px 16px", marginBottom: 16,
          }}>
            <div style={{ fontSize: 14 }}>
              <strong>{paragraphs.length}</strong> 個段落 ·{" "}
              <strong>{totalStocks}</strong> 支股票 ·{" "}
              <strong>{totalAnnotations}</strong> 筆標記
              {epsForecasts.length > 0 && <> · <strong>{epsForecasts.length}</strong> 筆財測 EPS</>}
            </div>
            <button
              onClick={() => setStep(1)}
              style={{
                padding: "4px 14px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4,
                background: "#fff", cursor: "pointer",
              }}
            >
              返回編輯
            </button>
          </div>

          {/* Paragraphs with stock chips and separators */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {paragraphs.map((para, i) => (
              <div key={i}>
                <div
                  style={{
                    border: para.stocks.length > 0 ? "1px solid #c7d2fe" : "1px solid #e5e7eb",
                    borderRadius: 8, padding: "12px 16px",
                    background: para.stocks.length > 0 ? "#fafbff" : "#fafbfc",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>段落 {i + 1}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#333" }}>
                    {para.text.length > 500 ? para.text.slice(0, 500) + "..." : para.text}
                  </div>
                  <StockChips
                    stocks={para.stocks}
                    onRemove={(ticker) => handleRemoveStock(i, ticker)}
                    onAdd={(stock) => handleAddStock(i, stock)}
                  />
                </div>
                {/* Separator between paragraphs */}
                {i < paragraphs.length - 1 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 8, padding: "4px 0", margin: "2px 0",
                  }}>
                    <div style={{ flex: 1, height: 1, background: "#d1d5db" }} />
                    <button
                      onClick={() => handleMoveDown(i)}
                      title="分隔線上移：此段末句移到下段首"
                      style={{
                        border: "1px solid #d1d5db", background: "#fff", borderRadius: 4,
                        padding: "2px 8px", fontSize: 12, cursor: "pointer", color: "#6366f1",
                        lineHeight: 1,
                      }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMerge(i)}
                      title="合併兩段"
                      style={{
                        border: "1px solid #d1d5db", background: "#fff", borderRadius: 4,
                        padding: "2px 8px", fontSize: 11, cursor: "pointer", color: "#64748b",
                        lineHeight: 1,
                      }}
                    >
                      合併
                    </button>
                    <button
                      onClick={() => handleMoveUp(i)}
                      title="分隔線下移：下段首句移到此段末"
                      style={{
                        border: "1px solid #d1d5db", background: "#fff", borderRadius: 4,
                        padding: "2px 8px", fontSize: 12, cursor: "pointer", color: "#6366f1",
                        lineHeight: 1,
                      }}
                    >
                      ▼
                    </button>
                    <div style={{ flex: 1, height: 1, background: "#d1d5db" }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* EPS Forecasts preview */}
          {epsForecasts.length > 0 && (
            <div style={{ background: "#fefce8", borderRadius: 8, padding: "12px 16px", marginTop: 16 }}>
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
                  {epsForecasts.map((f, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 8px" }}>{f.stock_name} ({f.ticker})</td>
                      <td style={{ textAlign: "center", padding: "4px 8px" }}>{f.forecast_year}</td>
                      <td style={{ textAlign: "right", padding: "4px 8px", fontWeight: "bold", color: "#b45309" }}>{f.eps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Save button */}
          <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={submitting}
              style={{
                padding: "10px 32px", fontSize: 15, border: "none", borderRadius: 6,
                background: "#16a34a", color: "#fff", fontWeight: "bold",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "儲存中..." : "確認儲存"}
            </button>
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} persistent={toast.persistent} onClose={clearToast} />}
    </div>
  );
}
