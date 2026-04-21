"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { splitParagraphs } from "@/lib/paragraphs";
import { lookupStock } from "@/lib/stocks";
import { stockLookup } from "@/lib/stock-lookup";

// ─── Types ──────────────────────────────────────────────
type StockTag = { ticker: string; stock_name: string };
type ParagraphData = { text: string; stocks: StockTag[] };
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

// ─── Toast ──────────────────────────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

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

// ─── Text highlight helper ───────────────────────────────────
function highlightText(text: string, keywords: string[]) {
  if (keywords.length === 0) return <>{text}</>;
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(regex);
  const kw = new Set(keywords);
  return (
    <>
      {parts.map((part, i) =>
        kw.has(part)
          ? <mark key={i} style={{ background: "#fef9c3", padding: "1px 2px", borderRadius: 2 }}>{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
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
    // Try auto-lookup first (e.g. "2330" → 台積電)
    const found = lookupStock(val);
    if (found) {
      onAdd(found);
      setInput("");
      setAdding(false);
      return;
    }
    // Fallback: "代碼 名稱" format or raw ticker
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
      {stocks.filter((s, i, arr) => arr.findIndex((x) => x.ticker === s.ticker) === i).map((s) => (
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

// ─── Main Edit Page ─────────────────────────────────────
export default function EditAnnotationsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [articleTitle, setArticleTitle] = useState("");
  const [paragraphs, setParagraphs] = useState<ParagraphData[]>([]);
  const [originalAnnotations, setOriginalAnnotations] = useState<Annotation[]>([]);
  const [epsForecasts, setEpsForecasts] = useState<EpsForecast[]>([]);

  const clearToast = useCallback(() => setToast(null), []);

  // Load article + annotations, then match annotations to paragraphs
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/articles/${id}`).then((r) => r.json()),
      fetch(`/api/annotations?article_id=${id}`).then((r) => r.json()),
      fetch(`/api/eps-forecasts?article_id=${id}`).then((r) => r.json()),
    ]).then(([artJson, annJson, epsJson]) => {
      if (!artJson.ok) { setLoading(false); return; }
      const article = artJson.article;
      setArticleTitle(article.title);
      const anns: Annotation[] = annJson.ok ? annJson.annotations : [];
      setOriginalAnnotations(anns);
      if (epsJson.ok) setEpsForecasts(epsJson.forecasts);

      // Split content into paragraphs, filter out image-only paragraphs
      const paraTexts = splitParagraphs(article.content).filter(
        (t) => !/^!\[[^\]]*\]\([^)]+\)$/.test(t.trim())
      );

      // Match each annotation to a paragraph by checking if paragraph text contains the annotation's paragraph text
      const paraData: ParagraphData[] = paraTexts.map((text) => {
        const matchedStocks: StockTag[] = [];
        const seen = new Set<string>();
        for (const ann of anns) {
          if (seen.has(ann.ticker)) continue;
          // Match if the paragraph text contains the annotation paragraph, or vice versa
          if (text.includes(ann.paragraph) || ann.paragraph.includes(text) || ann.paragraph === "（手動新增標記）") {
            // For manual annotations, attach to the first paragraph only
            if (ann.paragraph === "（手動新增標記）") continue;
            matchedStocks.push({ ticker: ann.ticker, stock_name: ann.stock_name });
            seen.add(ann.ticker);
          }
        }
        return { text, stocks: matchedStocks };
      });

      // Annotations not matched to any paragraph (e.g., manual ones) → attach as "unmatched"
      // We'll show them separately or attach to the first paragraph
      const matchedTickers = new Set(paraData.flatMap((p) => p.stocks.map((s) => s.ticker)));
      const unmatchedAnns = anns.filter((a) => !matchedTickers.has(a.ticker));
      if (unmatchedAnns.length > 0 && paraData.length > 0) {
        const seen = new Set(paraData[0].stocks.map((s) => s.ticker));
        for (const ann of unmatchedAnns) {
          if (!seen.has(ann.ticker)) {
            paraData[0].stocks.push({ ticker: ann.ticker, stock_name: ann.stock_name });
            seen.add(ann.ticker);
          }
        }
      }

      setParagraphs(paraData);
      setLoading(false);
    });
  }, [id]);

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
    // Split by Chinese/English sentence-ending punctuation, keeping the punctuation attached
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
      if (sentences.length <= 1) return prev; // Don't empty the paragraph
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
      if (sentences.length <= 1) return prev; // Don't empty the paragraph
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

  // Build EPS lookup by ticker for inline display
  const epsByTicker = new Map<string, EpsForecast[]>();
  for (const f of epsForecasts) {
    if (!epsByTicker.has(f.ticker)) epsByTicker.set(f.ticker, []);
    epsByTicker.get(f.ticker)!.push(f);
  }

  const getParaEps = (stocks: StockTag[]): EpsForecast[] => {
    return stocks.flatMap((s) => epsByTicker.get(s.ticker) || []);
  };

  const totalStocks = new Set(paragraphs.flatMap((p) => p.stocks.map((s) => s.ticker))).size;
  const totalAnnotations = paragraphs.reduce((sum, p) => sum + p.stocks.length, 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Delete all existing annotations for this article
      const deletePromises = originalAnnotations.map((a) =>
        fetch(`/api/annotations?id=${a.id}`, { method: "DELETE" })
      );
      await Promise.all(deletePromises);

      // 2. Create new annotations based on current paragraph state
      const createPromises: Promise<Response>[] = [];
      for (const para of paragraphs) {
        for (const stock of para.stocks) {
          createPromises.push(
            fetch("/api/annotations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                article_id: id,
                ticker: stock.ticker,
                stock_name: stock.stock_name,
                paragraph: para.text,
              }),
            })
          );
        }
      }
      await Promise.all(createPromises);

      setToast("標記已儲存");
      // Navigate back to article detail after short delay
      setTimeout(() => router.push(`/articles/${id}`), 1000);
    } catch {
      alert("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px", fontFamily: "sans-serif" }}>
        載入中...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16 }}>
        編輯標記：{articleTitle}
      </h2>

      {/* Summary bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#f0f4f8", borderRadius: 8, padding: "10px 16px", marginBottom: 16,
      }}>
        <div style={{ fontSize: 14 }}>
          <strong>{paragraphs.length}</strong> 個段落 ·{" "}
          <strong>{totalStocks}</strong> 支股票 ·{" "}
          <strong>{totalAnnotations}</strong> 筆標記
        </div>
        <button
          onClick={() => router.push(`/articles/${id}`)}
          style={{
            padding: "4px 14px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4,
            background: "#fff", cursor: "pointer",
          }}
        >
          返回文章
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
                {highlightText(para.text, [...new Set(para.stocks.flatMap((s) => {
                  const entry = stockLookup[s.ticker];
                  return [s.stock_name, s.ticker, ...(entry?.aliases ?? []), entry?.name ?? ""];
                }))].filter((k) => k.length >= 2).sort((a, b) => b.length - a.length))}
              </div>
              <StockChips
                stocks={para.stocks}
                onRemove={(ticker) => handleRemoveStock(i, ticker)}
                onAdd={(stock) => handleAddStock(i, stock)}
              />
              {(() => {
                const paraEps = getParaEps(para.stocks);
                if (paraEps.length === 0) return null;
                return (
                  <div style={{
                    background: "#fefce8",
                    border: "1px solid #fde68a",
                    borderRadius: 6,
                    padding: "6px 12px",
                    marginTop: 6,
                    fontSize: 13,
                    display: "flex",
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
                );
              })()}
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

      {/* Save button */}
      <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 32px", fontSize: 15, border: "none", borderRadius: 6,
            background: "#16a34a", color: "#fff", fontWeight: "bold",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "儲存中..." : "確認儲存"}
        </button>
      </div>

      {toast && <Toast message={toast} onClose={clearToast} />}
    </div>
  );
}
