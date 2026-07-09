"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

// ─── 站內研究資料（EPS 財測、文章標記）────────────────────
type Annotation = {
  id: string;
  ticker: string;
  stock_name: string;
  paragraph: string;
  is_summary: boolean;
  article_id: string;
  dmao_articles: { id: string; title: string; article_date: string | null } | null;
};

type LatestEpsInfo = { eps: number; article_date: string | null };

const fmt2 = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : n.toFixed(2);

// 大數字去掉多餘小數，避免版面換行（台股 500 元以上跳動單位已是整數）
const fmtCompact = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "-";
  if (n >= 1000) return n.toFixed(0);
  if (n >= 100) return (Math.round(n * 10) / 10).toString();
  return n.toFixed(2);
};

const calcPE = (price: number | null | undefined, eps: number | undefined) => {
  if (!price || !eps || eps <= 0) return null;
  return Math.round((price / eps) * 10) / 10;
};

// 與 /stock 頁相同的本益比色階
const peColor = (pe: number): string => {
  if (pe < 15) return "#2563eb";
  if (pe < 20) return "#16a34a";
  if (pe < 25) return "#eab308";
  if (pe < 35) return "#ea580c";
  return "#dc2626";
};

const dateAgeColor = (dateStr: string): string => {
  const diff = (Date.now() - new Date(dateStr).getTime()) / (24 * 3600 * 1000);
  if (diff <= 14) return "#16a34a";
  if (diff <= 30) return "#2563eb";
  if (diff <= 90) return "#ea580c";
  return "#9ca3af";
};

const formatShortDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

function highlightKeywords(text: string, keywords: string[]) {
  const filtered = keywords.filter(Boolean);
  if (filtered.length === 0) return text;
  const escaped = filtered.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  escaped.sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    filtered.includes(part) ? (
      <mark key={i} style={{ background: "#fef9c3", padding: "1px 2px", borderRadius: 2 }}>{part}</mark>
    ) : (
      part
    )
  );
}

// ─── Sparkline（近一月收盤走勢）──────────────────────────
function Sparkline({ ticker }: { ticker: string }) {
  const [points, setPoints] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stock-history/${ticker}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok || !Array.isArray(json.prices)) return;
        const closes = json.prices
          .slice(-22)
          .map((p: { close: number }) => p.close)
          .filter((c: unknown): c is number => typeof c === "number");
        setPoints(closes);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticker]);

  if (!points || points.length < 2) return null;

  const w = 100, h = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map((c, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 3 - ((c - min) / range) * (h - 6)).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: "block", width: "100%", height: h }}
      aria-hidden="true"
    >
      <title>近一月走勢</title>
      <polyline
        points={coords}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function TrackPage() {
  const [list, setList] = useState<TrackedStock[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, TrackQuote>>({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("custom");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dmao_track_view");
      if (saved === "list" || saved === "card") setViewMode(saved);
    } catch {
      // ignore
    }
  }, []);

  const changeViewMode = (mode: "card" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("dmao_track_view", mode);
    } catch {
      // ignore
    }
  };

  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 站內研究資料
  const [latestEps2026, setLatestEps2026] = useState<Record<string, LatestEpsInfo>>({});
  const [latestEps2027, setLatestEps2027] = useState<Record<string, LatestEpsInfo>>({});
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});
  const [annotationsMap, setAnnotationsMap] = useState<Record<string, Annotation[]>>({});
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [loadingAnnotations, setLoadingAnnotations] = useState<string | null>(null);

  useEffect(() => {
    const fetchLatestEps = async (year: number, setter: (v: Record<string, LatestEpsInfo>) => void) => {
      try {
        const res = await fetch(`/api/eps-forecasts?forecast_year=${year}&latest=1`);
        const json = await res.json();
        if (json.ok) {
          const map: Record<string, LatestEpsInfo> = {};
          for (const f of json.forecasts) {
            map[f.ticker] = { eps: f.eps, article_date: f.dmao_articles?.article_date ?? null };
          }
          setter(map);
        }
      } catch {
        // ignore
      }
    };
    const fetchCounts = async () => {
      try {
        const res = await fetch("/api/annotations?mode=counts");
        const json = await res.json();
        if (json.ok) setAnnotationCounts(json.counts);
      } catch {
        // ignore
      }
    };
    fetchLatestEps(2026, setLatestEps2026);
    fetchLatestEps(2027, setLatestEps2027);
    fetchCounts();
  }, []);

  const toggleAnnotations = async (ticker: string) => {
    if (expandedTicker === ticker) {
      setExpandedTicker(null);
      return;
    }
    setExpandedTicker(ticker);
    if (annotationsMap[ticker]) return;
    setLoadingAnnotations(ticker);
    try {
      const res = await fetch(`/api/annotations?ticker=${ticker}`);
      const json = await res.json();
      if (json.ok) {
        setAnnotationsMap((prev) => ({ ...prev, [ticker]: json.annotations }));
      }
    } catch {
      // ignore
    } finally {
      setLoadingAnnotations(null);
    }
  };

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

        {/* 圖卡 / 清單 檢視切換 */}
        <div style={{ display: "flex" }}>
          {([
            { key: "card", label: "圖卡" },
            { key: "list", label: "清單" },
          ] as const).map((m, i) => (
            <button
              key={m.key}
              onClick={() => changeViewMode(m.key)}
              style={{
                padding: "5px 14px",
                fontSize: 13,
                border: "1px solid #d1d5db",
                borderLeft: i === 0 ? "1px solid #d1d5db" : "none",
                borderRadius: i === 0 ? "6px 0 0 6px" : "0 6px 6px 0",
                background: viewMode === m.key ? "#374151" : "#fff",
                color: viewMode === m.key ? "#fff" : "#374151",
                cursor: "pointer",
                fontWeight: viewMode === m.key ? "bold" : "normal",
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

      {viewMode === "card" ? (
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
              eps2026={latestEps2026[stock.ticker]}
              eps2027={latestEps2027[stock.ticker]}
              annotationCount={annotationCounts[stock.ticker] || 0}
              isExpanded={expandedTicker === stock.ticker}
              annotations={annotationsMap[stock.ticker]}
              isLoadingAnnotations={loadingAnnotations === stock.ticker}
              onToggleAnnotations={() => toggleAnnotations(stock.ticker)}
            />
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 780, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 14 }}>
            <colgroup>
              <col style={{ width: "17%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#1e3a5f", color: "#fff" }}>
                <th style={{ ...listThStyle, textAlign: "left" }}>股票</th>
                <th style={listThStyle}>近一月</th>
                <th style={{ ...listThStyle, textAlign: "right" }}>現價</th>
                <th style={{ ...listThStyle, textAlign: "right" }}>漲跌</th>
                <th style={{ ...listThStyle, textAlign: "right" }}>26E</th>
                <th style={{ ...listThStyle, textAlign: "right" }}>27E</th>
                <th style={{ ...listThStyle, textAlign: "center" }}>日期</th>
                <th style={{ ...listThStyle, textAlign: "center" }}>標記</th>
                <th style={listThStyle} />
              </tr>
            </thead>
            <tbody>
              {sortedList.map((stock, i) => {
                const q = quotes[stock.ticker];
                const eps26 = latestEps2026[stock.ticker];
                const eps27 = latestEps2027[stock.ticker];
                const annCount = annotationCounts[stock.ticker] || 0;
                const isExpanded = expandedTicker === stock.ticker;
                const anns = annotationsMap[stock.ticker];
                const pct = q?.changePercent ?? null;
                const pctColor = pct === null || pct === 0 ? "#6b7280" : pct > 0 ? "#dc2626" : "#15803d";
                const epsDate = eps26?.article_date ?? eps27?.article_date ?? null;
                const renderEps = (info: LatestEpsInfo | undefined) => {
                  if (!info) return "-";
                  const pe = calcPE(q?.price, info.eps);
                  return (
                    <span style={{ whiteSpace: "nowrap" }}>
                      <b style={{ color: "#b45309" }}>{info.eps}</b>
                      {pe !== null && (
                        <span style={{
                          marginLeft: 5, fontSize: 11, fontWeight: "bold", color: "#fff",
                          background: peColor(pe), padding: "1px 5px", borderRadius: 4,
                        }}>
                          {pe}x
                        </span>
                      )}
                    </span>
                  );
                };
                return (
                  <React.Fragment key={stock.ticker}>
                    <tr style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #eee" }}>
                      <td style={listTdStyle}>
                        <Link href={`/stock/${stock.ticker}`} style={{ color: "#1a56db", textDecoration: "none", fontWeight: 500 }}>
                          {stock.ticker}
                        </Link>
                        <Link href={`/stock/${stock.ticker}`} style={{ marginLeft: 8, color: "inherit", textDecoration: "none" }}>
                          {q?.name || stock.name}
                        </Link>
                      </td>
                      <td style={{ ...listTdStyle, padding: "4px 10px" }}>
                        <Sparkline ticker={stock.ticker} />
                      </td>
                      <td style={{ ...listTdStyle, textAlign: "right", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>
                        {q ? fmtCompact(q.price) : "-"}
                      </td>
                      <td style={{ ...listTdStyle, textAlign: "right", fontSize: 13, fontWeight: 600, color: pctColor, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {q && q.change !== null && pct !== null
                          ? `${q.change > 0 ? "+" : ""}${fmt2(q.change)} (${pct > 0 ? "+" : ""}${pct.toFixed(2)}%)`
                          : "-"}
                      </td>
                      <td style={{ ...listTdStyle, textAlign: "right" }}>{renderEps(eps26)}</td>
                      <td style={{ ...listTdStyle, textAlign: "right" }}>{renderEps(eps27)}</td>
                      <td style={{ ...listTdStyle, textAlign: "center", fontSize: 12, color: "#666" }}>
                        {epsDate ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: dateAgeColor(epsDate), flexShrink: 0 }} />
                            {formatShortDate(epsDate)}
                          </span>
                        ) : "-"}
                      </td>
                      <td style={{ ...listTdStyle, textAlign: "center" }}>
                        {annCount > 0 ? (
                          <button
                            onClick={() => toggleAnnotations(stock.ticker)}
                            style={{
                              padding: "2px 10px", fontSize: 13, fontWeight: "bold",
                              border: "none", borderRadius: 10,
                              background: isExpanded ? "#1a56db" : "#e0e7ff",
                              color: isExpanded ? "#fff" : "#1a56db",
                              cursor: "pointer", minWidth: 28,
                            }}
                          >
                            {annCount}
                          </button>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 13 }}>-</span>
                        )}
                      </td>
                      <td style={{ ...listTdStyle, textAlign: "center" }}>
                        <button
                          onClick={() => removeStock(stock.ticker)}
                          title={`移除 ${q?.name || stock.name}`}
                          style={{
                            border: "none", background: "none", cursor: "pointer",
                            color: "#c4c9d1", fontSize: 16, lineHeight: 1, padding: 4,
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <div style={{ background: "#f8fafc", borderLeft: "3px solid #1a56db", margin: "0 14px 8px", padding: "12px 16px" }}>
                            {loadingAnnotations === stock.ticker ? (
                              <div style={{ color: "#999", fontSize: 13 }}>載入中...</div>
                            ) : !anns || anns.length === 0 ? (
                              <div style={{ color: "#999", fontSize: 13 }}>尚無標記段落</div>
                            ) : (
                              anns.map((ann, idx) => (
                                <div
                                  key={ann.id}
                                  style={{
                                    marginBottom: idx < anns.length - 1 ? 12 : 0,
                                    paddingBottom: idx < anns.length - 1 ? 12 : 0,
                                    borderBottom: idx < anns.length - 1 ? "1px solid #e5e7eb" : "none",
                                  }}
                                >
                                  <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                                    <strong>{ann.dmao_articles?.title || "無標題"}</strong>
                                    {ann.dmao_articles?.article_date && (
                                      <span style={{ marginLeft: 8 }}>
                                        {formatShortDate(ann.dmao_articles.article_date)}
                                      </span>
                                    )}
                                    <Link href={`/articles/${ann.article_id}`} style={{ marginLeft: 8, color: "#1a56db", fontSize: 12 }}>
                                      查看全文 →
                                    </Link>
                                  </div>
                                  <div style={{ fontSize: 14, color: "#333", lineHeight: 1.6 }}>
                                    {ann.is_summary && (
                                      <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", marginRight: 6 }}>AI 摘要</span>
                                    )}
                                    {highlightKeywords(ann.paragraph, [ann.stock_name, ann.ticker])}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {list === null && (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>
      )}
    </div>
  );
}

const listThStyle: React.CSSProperties = {
  padding: "9px 10px",
  fontWeight: "bold",
  textAlign: "center",
  fontSize: 13,
};

const listTdStyle: React.CSSProperties = {
  padding: "8px 10px",
  color: "#222",
};

// ─── Stat card ───────────────────────────────────────────
// 台股慣例：紅漲綠跌；方向另以 ▲/▼ 符號標示，不只靠顏色
function StockCard({
  stock,
  quote,
  onRemove,
  eps2026,
  eps2027,
  annotationCount,
  isExpanded,
  annotations,
  isLoadingAnnotations,
  onToggleAnnotations,
}: {
  stock: TrackedStock;
  quote: TrackQuote | undefined;
  onRemove: () => void;
  eps2026: LatestEpsInfo | undefined;
  eps2027: LatestEpsInfo | undefined;
  annotationCount: number;
  isExpanded: boolean;
  annotations: Annotation[] | undefined;
  isLoadingAnnotations: boolean;
  onToggleAnnotations: () => void;
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

  const fmt = fmt2;

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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 600, color: valueColor, lineHeight: 1, whiteSpace: "nowrap" }}>
            {quote ? fmtCompact(quote.price) : "-"}
          </span>
          <span style={{
            fontSize: 12.5,
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

        <div style={{ marginBottom: 8, height: 30 }}>
          <Sparkline ticker={stock.ticker} />
        </div>

        <div style={{ display: "flex", gap: 8, fontSize: 11.5, color: "#6b7280", borderTop: "1px solid #f3f4f6", paddingTop: 8, whiteSpace: "nowrap" }}>
          <span>開 {fmtCompact(quote?.open)}</span>
          <span>高 {fmtCompact(quote?.high)}</span>
          <span>低 {fmtCompact(quote?.low)}</span>
          {quote?.volume !== null && quote?.volume !== undefined && (
            <span style={{ marginLeft: "auto" }}>{quote.volume.toLocaleString()} 張</span>
          )}
        </div>
      </Link>

      {/* 站內研究：EPS 財測、本益比、文章標記 */}
      {(eps2026 || eps2027 || annotationCount > 0) && (
        <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 8, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11.5 }}>
            {[
              { label: "26", info: eps2026 },
              { label: "27", info: eps2027 },
            ].map(({ label, info }) => {
              if (!info) return null;
              const pe = calcPE(quote?.price, info.eps);
              return (
                <span key={label} style={{ color: "#6b7280", whiteSpace: "nowrap" }}>
                  {label}E <b style={{ color: "#b45309" }}>{info.eps}</b>
                  {pe !== null && (
                    <span style={{
                      marginLeft: 4,
                      fontSize: 11,
                      fontWeight: "bold",
                      color: "#fff",
                      background: peColor(pe),
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}>
                      {pe}x
                    </span>
                  )}
                </span>
              );
            })}
            {(() => {
              const epsDate = eps2026?.article_date ?? eps2027?.article_date ?? null;
              return epsDate ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#9ca3af", whiteSpace: "nowrap" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: dateAgeColor(epsDate), flexShrink: 0 }} />
                  {formatShortDate(epsDate)}
                </span>
              ) : null;
            })()}
            {annotationCount > 0 && (
              <button
                onClick={onToggleAnnotations}
                style={{
                  marginLeft: "auto",
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: "bold",
                  border: "none",
                  borderRadius: 10,
                  background: isExpanded ? "#1a56db" : "#e0e7ff",
                  color: isExpanded ? "#fff" : "#1a56db",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                標記 {annotationCount}
              </button>
            )}
          </div>

          {isExpanded && (
            <div style={{
              marginTop: 8,
              maxHeight: 280,
              overflowY: "auto",
              background: "#f8fafc",
              borderLeft: "3px solid #1a56db",
              borderRadius: 4,
              padding: "10px 12px",
            }}>
              {isLoadingAnnotations ? (
                <div style={{ color: "#999", fontSize: 12 }}>載入中...</div>
              ) : !annotations || annotations.length === 0 ? (
                <div style={{ color: "#999", fontSize: 12 }}>尚無標記段落</div>
              ) : (
                annotations.map((ann, idx) => (
                  <div
                    key={ann.id}
                    style={{
                      marginBottom: idx < annotations.length - 1 ? 10 : 0,
                      paddingBottom: idx < annotations.length - 1 ? 10 : 0,
                      borderBottom: idx < annotations.length - 1 ? "1px solid #e5e7eb" : "none",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 3 }}>
                      <strong>{ann.dmao_articles?.title || "無標題"}</strong>
                      {ann.dmao_articles?.article_date && (
                        <span style={{ marginLeft: 6, color: "#9ca3af" }}>
                          {formatShortDate(ann.dmao_articles.article_date)}
                        </span>
                      )}
                      <Link href={`/articles/${ann.article_id}`} style={{ marginLeft: 6, color: "#1a56db" }}>
                        全文 →
                      </Link>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#333", lineHeight: 1.6 }}>
                      {ann.is_summary && (
                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "#fef3c7", color: "#92400e", marginRight: 5 }}>AI 摘要</span>
                      )}
                      {highlightKeywords(ann.paragraph, [ann.stock_name, ann.ticker])}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
