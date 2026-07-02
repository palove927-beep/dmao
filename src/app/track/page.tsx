"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { scanStocks } from "@/lib/stock-lookup";
import type { TrackQuote } from "@/app/api/track/route";

// ─── Watchlist persistence (localStorage) ────────────────
type TrackedStock = { ticker: string; name: string };

const STORAGE_KEY = "dmao_track_list";

const DEFAULT_LIST: TrackedStock[] = [
  { ticker: "2330", name: "台積電" },
  { ticker: "2454", name: "聯發科" },
  { ticker: "2317", name: "鴻海" },
  { ticker: "2308", name: "台達電" },
];

function loadList(): TrackedStock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LIST;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (s): s is TrackedStock =>
          s && typeof s.ticker === "string" && typeof s.name === "string",
      );
    }
  } catch {
    // fall through
  }
  return DEFAULT_LIST;
}

function saveList(list: TrackedStock[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore (private mode etc.)
  }
}

// 只有台股（純數字代碼）才有報價來源
const isTwTicker = (t: string) => /^\d{4,6}$/.test(t);

type SortMode = "custom" | "gainers" | "losers";

export default function TrackPage() {
  const [list, setList] = useState<TrackedStock[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, TrackQuote>>({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("custom");

  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Load watchlist after mount (localStorage is client-only)
  useEffect(() => {
    setList(loadList());
  }, []);

  const tickers = useMemo(
    () => (list ?? []).map((s) => s.ticker).filter(isTwTicker),
    [list],
  );

  const fetchQuotes = useCallback(async () => {
    if (tickers.length === 0) {
      setQuotes({});
      setUpdatedAt(new Date().toISOString());
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/track?tickers=${tickers.join(",")}`);
      const json = await res.json();
      if (json.ok) {
        setQuotes(json.data);
        setUpdatedAt(json.updatedAt);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tickers]);

  useEffect(() => {
    if (list === null) return;
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 30000);
    return () => clearInterval(interval);
  }, [list, fetchQuotes]);

  // 報價回來後，把佔位名稱（=代碼）換成真實股名
  useEffect(() => {
    if (!list) return;
    let changed = false;
    const next = list.map((s) => {
      const q = quotes[s.ticker];
      if (q?.name && s.name === s.ticker) {
        changed = true;
        return { ...s, name: q.name };
      }
      return s;
    });
    if (changed) {
      setList(next);
      saveList(next);
    }
  }, [quotes, list]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addStock = (stock: TrackedStock) => {
    if (!list) return;
    if (list.some((s) => s.ticker === stock.ticker)) return;
    const next = [...list, stock];
    setList(next);
    saveList(next);
    setQuery("");
    setShowSuggestions(false);
  };

  const removeStock = (ticker: string) => {
    if (!list) return;
    const next = list.filter((s) => s.ticker !== ticker);
    setList(next);
    saveList(next);
  };

  // ─── Search suggestions ───
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const added = new Set((list ?? []).map((s) => s.ticker));
    return scanStocks
      .filter((s) => isTwTicker(s.ticker) && !added.has(s.ticker))
      .filter(
        (s) =>
          s.ticker.startsWith(q) ||
          s.name.toLowerCase().includes(q) ||
          s.aliases?.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [query, list]);

  const rawCodeAddable =
    isTwTicker(query.trim()) &&
    !(list ?? []).some((s) => s.ticker === query.trim()) &&
    !suggestions.some((s) => s.ticker === query.trim());

  const handleEnter = () => {
    if (suggestions.length > 0) {
      addStock({ ticker: suggestions[0].ticker, name: suggestions[0].name });
    } else if (rawCodeAddable) {
      const code = query.trim();
      addStock({ ticker: code, name: code });
    }
  };

  // ─── Sorting ───
  const sortedList = useMemo(() => {
    if (!list) return [];
    if (sortMode === "custom") return list;
    const pct = (s: TrackedStock) => quotes[s.ticker]?.changePercent ?? null;
    return [...list].sort((a, b) => {
      const pa = pct(a);
      const pb = pct(b);
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return sortMode === "gainers" ? pb - pa : pa - pb;
    });
  }, [list, sortMode, quotes]);

  // ─── Summary counts ───
  const summary = useMemo(() => {
    let up = 0, down = 0, flat = 0;
    for (const t of tickers) {
      const c = quotes[t]?.change;
      if (c === null || c === undefined) continue;
      if (c > 0) up++;
      else if (c < 0) down++;
      else flat++;
    }
    return { up, down, flat };
  }, [tickers, quotes]);

  const sortModes: { key: SortMode; label: string }[] = [
    { key: "custom", label: "自訂順序" },
    { key: "gainers", label: "漲幅排序" },
    { key: "losers", label: "跌幅排序" },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 20px" }}>
        <Link href="/" style={{ color: "#1a56db", textDecoration: "none", display: "flex", alignItems: "center" }} title="首頁">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </Link>
        <div style={{ flex: 1, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: "bold", margin: 0, display: "inline" }}>
            股票追蹤
          </h1>
          {updatedAt && (
            <span style={{ fontSize: 13, color: "#999", marginLeft: 10 }}>
              {new Date(updatedAt).toLocaleString("zh-TW")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/stock"
            style={{
              padding: "6px 16px",
              fontSize: 13,
              border: "1px solid #1a56db",
              borderRadius: 6,
              background: "#fff",
              color: "#1a56db",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            即時報價
          </Link>
          <button
            onClick={fetchQuotes}
            disabled={loading}
            title="重新整理"
            style={{
              background: "none",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              padding: "2px 6px",
              display: "flex",
              alignItems: "center",
              color: "#333",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18" style={loading ? { animation: "spin 1s linear infinite" } : undefined}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search + sort toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div ref={searchRef} style={{ position: "relative", flex: "1 1 260px", maxWidth: 360 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEnter();
              if (e.key === "Escape") setShowSuggestions(false);
            }}
            placeholder="輸入代碼或名稱新增追蹤（如 2330、台積電）"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 8,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {showSuggestions && (suggestions.length > 0 || rawCodeAddable) && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 100, overflow: "hidden",
            }}>
              {suggestions.map((s) => (
                <button
                  key={s.ticker}
                  onClick={() => addStock({ ticker: s.ticker, name: s.name })}
                  style={{
                    display: "flex", width: "100%", alignItems: "center", gap: 10,
                    padding: "8px 12px", fontSize: 14, border: "none",
                    background: "none", cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f4f8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <span style={{ fontWeight: 600, color: "#1a56db", minWidth: 52 }}>{s.ticker}</span>
                  <span>{s.name}</span>
                </button>
              ))}
              {rawCodeAddable && (
                <button
                  onClick={() => addStock({ ticker: query.trim(), name: query.trim() })}
                  style={{
                    display: "block", width: "100%", padding: "8px 12px", fontSize: 14,
                    border: "none", borderTop: suggestions.length > 0 ? "1px solid #f3f4f6" : "none",
                    background: "none", cursor: "pointer", textAlign: "left", color: "#6b7280",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f4f8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  直接加入代碼「{query.trim()}」
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {sortModes.map((m) => (
            <button
              key={m.key}
              onClick={() => setSortMode(m.key)}
              style={{
                padding: "5px 14px",
                fontSize: 13,
                border: "1px solid #1a56db",
                borderRadius: 16,
                background: sortMode === m.key ? "#1a56db" : "#fff",
                color: sortMode === m.key ? "#fff" : "#1a56db",
                cursor: "pointer",
                fontWeight: sortMode === m.key ? "bold" : "normal",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {(summary.up > 0 || summary.down > 0 || summary.flat > 0) && (
          <div style={{ fontSize: 13, color: "#666", marginLeft: "auto" }}>
            <span style={{ color: "#dc2626", fontWeight: 600 }}>▲ {summary.up} 檔上漲</span>
            <span style={{ margin: "0 8px", color: "#d1d5db" }}>·</span>
            <span style={{ color: "#15803d", fontWeight: 600 }}>▼ {summary.down} 檔下跌</span>
            {summary.flat > 0 && (
              <>
                <span style={{ margin: "0 8px", color: "#d1d5db" }}>·</span>
                <span>{summary.flat} 檔平盤</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cards */}
      {list !== null && list.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#999", fontSize: 14 }}>
          尚未追蹤任何股票，使用上方搜尋框加入
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
        gap: 14,
      }}>
        {sortedList.map((stock) => (
          <StockCard
            key={stock.ticker}
            stock={stock}
            quote={quotes[stock.ticker]}
            onRemove={() => removeStock(stock.ticker)}
          />
        ))}
      </div>

      {list === null && (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>
      )}
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────
// 台股慣例：紅漲綠跌；方向另以 ▲/▼ 符號標示，不只靠顏色
function StockCard({
  stock,
  quote,
  onRemove,
}: {
  stock: TrackedStock;
  quote: TrackQuote | undefined;
  onRemove: () => void;
}) {
  const change = quote?.change ?? null;
  const dir: "up" | "down" | "flat" | "none" =
    change === null ? "none" : change > 0 ? "up" : change < 0 ? "down" : "flat";

  const valueColor =
    dir === "up" ? "#dc2626" : dir === "down" ? "#15803d" : "#374151";
  const pillBg =
    dir === "up" ? "#fee2e2" : dir === "down" ? "#dcfce7" : "#f3f4f6";
  const pillColor =
    dir === "up" ? "#b91c1c" : dir === "down" ? "#166534" : "#6b7280";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";

  const fmt = (n: number | null | undefined) =>
    n === null || n === undefined ? "-" : n.toFixed(2);

  const displayName = quote?.name || stock.name;

  return (
    <div style={{
      position: "relative",
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      padding: "14px 16px 12px",
      background: "#fff",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      <button
        onClick={onRemove}
        title={`移除 ${displayName}`}
        style={{
          position: "absolute", top: 8, right: 8,
          border: "none", background: "none", cursor: "pointer",
          color: "#c4c9d1", fontSize: 16, lineHeight: 1, padding: 4,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#6b7280"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#c4c9d1"; }}
      >
        ×
      </button>

      <Link
        href={`/stock/${stock.ticker}`}
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, paddingRight: 20 }}>
          <span style={{ fontSize: 15, fontWeight: "bold", color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </span>
          <span style={{ fontSize: 13, color: "#9ca3af", flexShrink: 0 }}>{stock.ticker}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 600, color: valueColor, lineHeight: 1 }}>
            {quote ? fmt(quote.price) : "-"}
          </span>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: pillColor,
            background: pillBg,
            padding: "3px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap",
          }}>
            {dir === "none" ? (
              "無資料"
            ) : (
              <>
                {arrow} {change! > 0 ? "+" : ""}{fmt(change)}（{quote!.changePercent !== null && quote!.changePercent > 0 ? "+" : ""}{quote!.changePercent ?? "-"}%）
              </>
            )}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#6b7280", borderTop: "1px solid #f3f4f6", paddingTop: 8, flexWrap: "wrap" }}>
          <span>開 {fmt(quote?.open)}</span>
          <span>高 {fmt(quote?.high)}</span>
          <span>低 {fmt(quote?.low)}</span>
          {quote?.volume !== null && quote?.volume !== undefined && (
            <span style={{ marginLeft: "auto" }}>{quote.volume.toLocaleString()} 張</span>
          )}
        </div>
      </Link>
    </div>
  );
}
