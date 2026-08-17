"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { House, RefreshCw, X, Trash2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { scanStocks } from "@/lib/stock-lookup";
import type { TrackQuote } from "@/app/api/track/route";

// ─── 比價清單（localStorage，與 /track 的追蹤清單各自獨立）───
type CompareStock = { ticker: string; name: string };

type PricePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

const STORAGE_KEY = "dmao_compare_v1";
const RANGE_KEY = "dmao_compare_range_v1";
const MAX_STOCKS = 20;

// 只有台股（純數字代碼）有歷史股價來源
const isTwTicker = (t: string) => /^\d{4,6}$/.test(t);

function defaultStocks(): CompareStock[] {
  return [
    { ticker: "2330", name: "台積電" },
    { ticker: "2454", name: "聯發科" },
    { ticker: "2317", name: "鴻海" },
  ];
}

function loadStocks(): CompareStock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const seen = new Set<string>();
        const out: CompareStock[] = [];
        for (const s of parsed) {
          if (s && typeof s.ticker === "string" && typeof s.name === "string" && !seen.has(s.ticker)) {
            seen.add(s.ticker);
            out.push({ ticker: s.ticker, name: s.name });
          }
        }
        return out.slice(0, MAX_STOCKS);
      }
    }
  } catch {
    // fall through
  }
  return defaultStocks();
}

function saveStocks(list: CompareStock[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

// ─── 區間 ─────────────────────────────────────────────────
type RangeKey = "1w" | "1m" | "3m" | "6m" | "ytd" | "1y" | "custom";

const RANGE_PRESETS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "1w", label: "一週" },
  { key: "1m", label: "一個月" },
  { key: "3m", label: "三個月" },
  { key: "6m", label: "半年" },
  { key: "ytd", label: "今年以來" },
  { key: "1y", label: "一年" },
];

// /api/stock-history 只保留近一年日線，自訂區間的起日不早於此
const HISTORY_DAYS = 365;

function taiwanToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function presetStart(key: Exclude<RangeKey, "custom">): string {
  const today = taiwanToday();
  switch (key) {
    case "1w": return addDays(today, -7);
    case "1m": return addDays(today, -30);
    case "3m": return addDays(today, -91);
    case "6m": return addDays(today, -182);
    case "ytd": return `${today.slice(0, 4)}-01-01`;
    case "1y": return addDays(today, -HISTORY_DAYS);
  }
}

// ─── 顯示小工具 ───────────────────────────────────────────
const UP = "#dc2626";
const DOWN = "#16a34a";
const FLAT = "#6b7280";

function pctColor(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return FLAT;
  return n > 0 ? UP : DOWN;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "-";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (n >= 1000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

function formatDateShort(d: string) {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

function formatDateFull(d: string) {
  return `${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}`;
}

// 折線圖配色（依加入順序輪流取用）
const LINE_COLORS = [
  "#1a56db", "#dc2626", "#16a34a", "#ea580c", "#7c3aed",
  "#0891b2", "#db2777", "#ca8a04", "#4b5563", "#0d9488",
  "#9333ea", "#b45309", "#2563eb", "#be123c", "#059669",
  "#c2410c", "#6d28d9", "#0e7490", "#a21caf", "#78716c",
];

const lineColor = (i: number) => LINE_COLORS[i % LINE_COLORS.length];

// ─── 區間統計 ─────────────────────────────────────────────
type CompareRow = {
  ticker: string;
  name: string;
  color: string;
  basePrice: number;
  baseDate: string;
  lastPrice: number;
  lastDate: string;
  pct: number;
  high: number;
  highDate: string;
  low: number;
  lowDate: string;
  amplitude: number;      // (最高 - 最低) / 最低
  fromHigh: number;       // 距區間高點
  days: number;           // 區間內交易日數
};

function buildRow(
  stock: CompareStock,
  color: string,
  prices: PricePoint[],
  start: string,
  end: string,
): CompareRow | null {
  const rows = prices.filter((p) => p.date >= start && p.date <= end && p.close > 0);
  if (rows.length === 0) return null;
  const base = rows[0];
  const last = rows[rows.length - 1];
  let high = rows[0];
  let low = rows[0];
  for (const r of rows) {
    if (r.high > high.high) high = r;
    if (r.low < low.low) low = r;
  }
  return {
    ticker: stock.ticker,
    name: stock.name,
    color,
    basePrice: base.close,
    baseDate: base.date,
    lastPrice: last.close,
    lastDate: last.date,
    pct: ((last.close - base.close) / base.close) * 100,
    high: high.high,
    highDate: high.date,
    low: low.low,
    lowDate: low.date,
    amplitude: low.low > 0 ? ((high.high - low.low) / low.low) * 100 : 0,
    fromHigh: high.high > 0 ? ((last.close - high.high) / high.high) * 100 : 0,
    days: rows.length,
  };
}

// ─── Tooltip ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const items = [...payload]
    .filter((p) => p.value !== null && p.value !== undefined)
    .sort((a, b) => b.value - a.value);
  if (items.length === 0) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
      padding: "8px 10px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
    }}>
      <div style={{ color: "#666", marginBottom: 4 }}>{formatDateFull(String(label))}</div>
      {items.map((it) => (
        <div key={it.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: it.color, display: "inline-block" }} />
          <span style={{ minWidth: 92 }}>{it.name}</span>
          <b style={{ color: pctColor(it.value), marginLeft: "auto" }}>{fmtPct(it.value)}</b>
        </div>
      ))}
    </div>
  );
}

type SortKey = "pct" | "amplitude" | "lastPrice" | "ticker";

export default function ComparePage() {
  const [stocks, setStocks] = useState<CompareStock[] | null>(null);
  const [data, setData] = useState<Record<string, PricePoint[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingTickers, setLoadingTickers] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const [rangeKey, setRangeKey] = useState<RangeKey>("3m");
  const [customStart, setCustomStart] = useState(presetStart("3m"));
  const [customEnd, setCustomEnd] = useState(taiwanToday());

  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [sortAsc, setSortAsc] = useState(false);
  const [benchmark, setBenchmark] = useState<string>("");

  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const dataRef = useRef<Record<string, PricePoint[]>>({});
  const inflight = useRef<Set<string>>(new Set());

  // ─── 載入／保存清單 ───
  useEffect(() => {
    setStocks(loadStocks());
    try {
      const r = localStorage.getItem(RANGE_KEY);
      if (r && (r === "custom" || RANGE_PRESETS.some((p) => p.key === r))) {
        setRangeKey(r as RangeKey);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (stocks === null) return;
    saveStocks(stocks);
  }, [stocks]);

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, rangeKey);
    } catch {
      // ignore
    }
  }, [rangeKey]);

  // ─── 抓歷史股價（每檔一次，最多同時 4 個請求）───
  const ensureData = useCallback(async (tickers: string[], force = false) => {
    const todo = tickers.filter(
      (t) => isTwTicker(t) && (force || !dataRef.current[t]) && !inflight.current.has(t),
    );
    if (todo.length === 0) return;

    todo.forEach((t) => inflight.current.add(t));
    setLoadingTickers([...inflight.current]);

    let cursor = 0;
    const worker = async () => {
      while (cursor < todo.length) {
        const ticker = todo[cursor++];
        try {
          const res = await fetch(`/api/stock-history/${ticker}`);
          const json = await res.json();
          if (!res.ok || !json.ok || !Array.isArray(json.prices)) {
            throw new Error(json?.error || "查無資料");
          }
          dataRef.current[ticker] = json.prices as PricePoint[];
          setData({ ...dataRef.current });
          setErrors((prev) => {
            if (!prev[ticker]) return prev;
            const next = { ...prev };
            delete next[ticker];
            return next;
          });
        } catch (e) {
          setErrors((prev) => ({ ...prev, [ticker]: e instanceof Error ? e.message : "載入失敗" }));
        } finally {
          inflight.current.delete(ticker);
          setLoadingTickers([...inflight.current]);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
  }, []);

  useEffect(() => {
    if (stocks === null) return;
    ensureData(stocks.map((s) => s.ticker));
  }, [stocks, ensureData]);

  const refresh = useCallback(() => {
    if (stocks === null) return;
    ensureData(stocks.map((s) => s.ticker), true);
  }, [stocks, ensureData]);

  // ─── 加入／移除股票 ───
  const addStock = useCallback((stock: CompareStock) => {
    setStocks((prev) => {
      const list = prev ?? [];
      if (list.some((s) => s.ticker === stock.ticker)) return list;
      if (list.length >= MAX_STOCKS) return list;
      return [...list, stock];
    });
    setQuery("");
    setShowSuggestions(false);
  }, []);

  // 直接輸入代碼加入時，向報價 API 補股名
  const addByCode = useCallback(async (code: string) => {
    addStock({ ticker: code, name: code });
    try {
      const res = await fetch(`/api/track?tickers=${code}`);
      const json = await res.json();
      const quote: TrackQuote | undefined = json?.data?.[code];
      if (quote?.name) {
        const name = quote.name.replace(/\*/g, "").trim();
        if (name) {
          setStocks((prev) => (prev ?? []).map((s) => (s.ticker === code && s.name === code ? { ...s, name } : s)));
        }
      }
    } catch {
      // 補不到就維持代碼
    }
  }, [addStock]);

  const removeStock = useCallback((ticker: string) => {
    setStocks((prev) => (prev ?? []).filter((s) => s.ticker !== ticker));
    setBenchmark((b) => (b === ticker ? "" : b));
  }, []);

  const toggleHidden = useCallback((ticker: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }, []);

  // ─── 搜尋建議 ───
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const added = new Set((stocks ?? []).map((s) => s.ticker));
    return scanStocks
      .filter((s) => isTwTicker(s.ticker) && !added.has(s.ticker))
      .filter(
        (s) =>
          s.ticker.startsWith(q) ||
          s.name.toLowerCase().includes(q) ||
          s.aliases?.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [query, stocks]);

  const rawCodeAddable =
    isTwTicker(query.trim()) &&
    !(stocks ?? []).some((s) => s.ticker === query.trim()) &&
    !suggestions.some((s) => s.ticker === query.trim());

  const handleEnter = () => {
    if (suggestions.length > 0) {
      addStock({ ticker: suggestions[0].ticker, name: suggestions[0].name });
    } else if (rawCodeAddable) {
      addByCode(query.trim());
    }
  };

  // ─── 區間 ───
  const { start, end } = useMemo(() => {
    if (rangeKey === "custom") {
      const minStart = addDays(taiwanToday(), -HISTORY_DAYS);
      const s = customStart < minStart ? minStart : customStart;
      const e = customEnd || taiwanToday();
      return s <= e ? { start: s, end: e } : { start: e, end: s };
    }
    return { start: presetStart(rangeKey), end: taiwanToday() };
  }, [rangeKey, customStart, customEnd]);

  // ─── 每檔的區間統計 ───
  const rows = useMemo(() => {
    if (stocks === null) return [];
    return stocks
      .map((s, i) => buildRow(s, lineColor(i), data[s.ticker] ?? [], start, end))
      .filter((r): r is CompareRow => r !== null);
  }, [stocks, data, start, end]);

  const rowMap = useMemo(() => new Map(rows.map((r) => [r.ticker, r])), [rows]);

  const benchmarkRow = benchmark ? rowMap.get(benchmark) ?? null : null;

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "ticker": return a.ticker.localeCompare(b.ticker);
        case "amplitude": return a.amplitude - b.amplitude;
        case "lastPrice": return a.lastPrice - b.lastPrice;
        default: return a.pct - b.pct;
      }
    });
    return sortAsc ? sorted : sorted.reverse();
  }, [rows, sortKey, sortAsc]);

  const maxAbsPct = useMemo(
    () => Math.max(1, ...rows.map((r) => Math.abs(r.pct))),
    [rows],
  );

  const summary = useMemo(() => {
    let up = 0, down = 0, flat = 0;
    for (const r of rows) {
      if (r.pct > 0) up++;
      else if (r.pct < 0) down++;
      else flat++;
    }
    const avg = rows.length > 0 ? rows.reduce((sum, r) => sum + r.pct, 0) / rows.length : 0;
    return { up, down, flat, avg };
  }, [rows]);

  // ─── 折線圖資料：各檔以區間起點為 0%，缺值沿用前一筆 ───
  const chartSeries = useMemo(
    () => rows.filter((r) => !hidden.has(r.ticker)),
    [rows, hidden],
  );

  const chartData = useMemo(() => {
    if (chartSeries.length === 0) return [];
    const dateSet = new Set<string>();
    const pctByTicker = new Map<string, Map<string, number>>();

    for (const row of chartSeries) {
      const map = new Map<string, number>();
      for (const p of data[row.ticker] ?? []) {
        if (p.date < start || p.date > end || p.close <= 0) continue;
        dateSet.add(p.date);
        map.set(p.date, ((p.close - row.basePrice) / row.basePrice) * 100);
      }
      pctByTicker.set(row.ticker, map);
    }

    const dates = [...dateSet].sort();
    const last = new Map<string, number>();
    return dates.map((date) => {
      const point: Record<string, string | number | null> = { date };
      for (const row of chartSeries) {
        const v = pctByTicker.get(row.ticker)?.get(date);
        if (v !== undefined) last.set(row.ticker, v);
        const carried = last.get(row.ticker);
        point[row.ticker] = carried === undefined ? null : Math.round(carried * 100) / 100;
      }
      return point;
    });
  }, [chartSeries, data, start, end]);

  const xTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const step = Math.max(1, Math.floor(chartData.length / 8));
    return chartData.filter((_, i) => i % step === 0).map((d) => d.date as string);
  }, [chartData]);

  const loading = loadingTickers.length > 0;
  const pending = (stocks ?? []).filter((s) => !data[s.ticker] && !errors[s.ticker]).length;

  const sortHeader = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <th
      onClick={() => {
        if (sortKey === key) setSortAsc((v) => !v);
        else { setSortKey(key); setSortAsc(false); }
      }}
      style={{
        padding: "8px 10px", textAlign: align, cursor: "pointer", whiteSpace: "nowrap",
        color: sortKey === key ? "#1a56db" : "#666", fontWeight: sortKey === key ? "bold" : "normal",
      }}
    >
      {label}{sortKey === key ? (sortAsc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 20px" }}>
        <Link href="/" style={{ color: "#1a56db", textDecoration: "none", display: "flex", alignItems: "center" }} title="首頁">
          <House size={20} strokeWidth={1.75} />
        </Link>
        <div style={{ flex: 1, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: "bold", margin: 0, display: "inline" }}>
            股價比價
          </h1>
          <span style={{ fontSize: 13, color: "#999", marginLeft: 10 }}>
            {formatDateFull(start)} ~ {formatDateFull(end)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/stock"
            style={{
              padding: "6px 16px", fontSize: 13, border: "1px solid #1a56db", borderRadius: 6,
              background: "#fff", color: "#1a56db", textDecoration: "none", display: "inline-block",
            }}
          >
            即時報價
          </Link>
          <Link
            href="/track"
            style={{
              padding: "6px 16px", fontSize: 13, border: "1px solid #1a56db", borderRadius: 6,
              background: "#fff", color: "#1a56db", textDecoration: "none", display: "inline-block",
            }}
          >
            追蹤清單
          </Link>
          <button
            onClick={refresh}
            disabled={loading}
            title="重新整理"
            style={{
              background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1, padding: "2px 6px", display: "flex", alignItems: "center", color: "#333",
            }}
          >
            <RefreshCw size={18} strokeWidth={1.75} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {/* 加入股票 */}
      <div ref={searchRef} style={{ position: "relative", marginBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => { if (e.key === "Enter") handleEnter(); }}
          placeholder={`加入股票比價（代碼或名稱，如 2330、台積電）— 最多 ${MAX_STOCKS} 檔`}
          style={{
            width: "100%", padding: "9px 12px", fontSize: 14, border: "1px solid #d1d5db",
            borderRadius: 6, outline: "none", boxSizing: "border-box",
          }}
        />
        {showSuggestions && (suggestions.length > 0 || rawCodeAddable) && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff",
            border: "1px solid #e5e7eb", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 20,
            maxHeight: 300, overflowY: "auto",
          }}>
            {suggestions.map((s) => (
              <button
                key={s.ticker}
                onClick={() => addStock({ ticker: s.ticker, name: s.name })}
                style={{
                  display: "block", width: "100%", padding: "8px 12px", fontSize: 14, border: "none",
                  background: "none", cursor: "pointer", textAlign: "left", color: "#222",
                }}
              >
                <span style={{ color: "#6b7280", marginRight: 8 }}>{s.ticker}</span>
                {s.name}
              </button>
            ))}
            {rawCodeAddable && (
              <button
                onClick={() => addByCode(query.trim())}
                style={{
                  display: "block", width: "100%", padding: "8px 12px", fontSize: 14, border: "none",
                  borderTop: suggestions.length > 0 ? "1px solid #f3f4f6" : "none",
                  background: "none", cursor: "pointer", textAlign: "left", color: "#6b7280",
                }}
              >
                直接加入代碼「{query.trim()}」
              </button>
            )}
          </div>
        )}
      </div>

      {/* 區間選擇 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12, fontSize: 14 }}>
        <span style={{ color: "#666" }}>比較區間：</span>
        {RANGE_PRESETS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRangeKey(r.key)}
            style={{
              padding: "5px 14px", fontSize: 14, border: "1px solid #1a56db", borderRadius: 16,
              background: rangeKey === r.key ? "#1a56db" : "#fff",
              color: rangeKey === r.key ? "#fff" : "#1a56db",
              cursor: "pointer", fontWeight: rangeKey === r.key ? "bold" : "normal",
            }}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => setRangeKey("custom")}
          style={{
            padding: "5px 14px", fontSize: 14, border: "1px solid #1a56db", borderRadius: 16,
            background: rangeKey === "custom" ? "#1a56db" : "#fff",
            color: rangeKey === "custom" ? "#fff" : "#1a56db",
            cursor: "pointer", fontWeight: rangeKey === "custom" ? "bold" : "normal",
          }}
        >
          自訂
        </button>
        {rangeKey === "custom" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="date"
              value={customStart}
              min={addDays(taiwanToday(), -HISTORY_DAYS)}
              max={taiwanToday()}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{ padding: "4px 8px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
            <span style={{ color: "#9ca3af" }}>~</span>
            <input
              type="date"
              value={customEnd}
              min={addDays(taiwanToday(), -HISTORY_DAYS)}
              max={taiwanToday()}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{ padding: "4px 8px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>（僅提供近一年日線）</span>
          </span>
        )}
      </div>

      {/* 基準 + 摘要 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14, fontSize: 14 }}>
        <span style={{ color: "#666" }}>比較基準：</span>
        <select
          value={benchmark}
          onChange={(e) => setBenchmark(e.target.value)}
          style={{ padding: "5px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", color: "#222" }}
        >
          <option value="">不設定</option>
          {(stocks ?? []).map((s) => (
            <option key={s.ticker} value={s.ticker}>{s.name} {s.ticker}</option>
          ))}
        </select>
        {benchmarkRow && (
          <span style={{ fontSize: 13, color: "#666" }}>
            基準區間漲跌 <b style={{ color: pctColor(benchmarkRow.pct) }}>{fmtPct(benchmarkRow.pct)}</b>
          </span>
        )}
        {rows.length > 0 && (
          <span style={{ fontSize: 13, color: "#666", marginLeft: "auto" }}>
            <span style={{ color: UP, fontWeight: 600 }}>▲ {summary.up} 檔上漲</span>
            <span style={{ margin: "0 8px", color: "#d1d5db" }}>·</span>
            <span style={{ color: DOWN, fontWeight: 600 }}>▼ {summary.down} 檔下跌</span>
            {summary.flat > 0 && (
              <>
                <span style={{ margin: "0 8px", color: "#d1d5db" }}>·</span>
                <span>{summary.flat} 檔平盤</span>
              </>
            )}
            <span style={{ margin: "0 8px", color: "#d1d5db" }}>·</span>
            <span>平均 <b style={{ color: pctColor(summary.avg) }}>{fmtPct(summary.avg)}</b></span>
          </span>
        )}
      </div>

      {/* 股票標籤（點名稱可在圖上隱藏／顯示） */}
      {(stocks ?? []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {(stocks ?? []).map((s, i) => {
            const isHidden = hidden.has(s.ticker);
            const err = errors[s.ticker];
            const isLoading = loadingTickers.includes(s.ticker);
            return (
              <span
                key={s.ticker}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px",
                  border: `1px solid ${err ? "#fecaca" : "#e5e7eb"}`, borderRadius: 16, fontSize: 13,
                  background: err ? "#fef2f2" : "#fff", opacity: isHidden ? 0.45 : 1,
                }}
              >
                <span
                  onClick={() => toggleHidden(s.ticker)}
                  title={isHidden ? "在圖上顯示" : "在圖上隱藏"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 5, background: lineColor(i), display: "inline-block" }} />
                  <b>{s.name}</b>
                  <span style={{ color: "#9ca3af" }}>{s.ticker}</span>
                  {isLoading && <span style={{ color: "#9ca3af" }}>載入中…</span>}
                  {err && <span style={{ color: "#dc2626" }}>{err}</span>}
                </span>
                <button
                  onClick={() => removeStock(s.ticker)}
                  title="移除"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#9ca3af" }}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </span>
            );
          })}
          {(stocks ?? []).length > 1 && (
            <button
              onClick={() => { setStocks([]); setBenchmark(""); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", fontSize: 13,
                border: "1px solid #e5e7eb", borderRadius: 16, background: "#fff", color: "#6b7280", cursor: "pointer",
              }}
            >
              <Trash2 size={13} strokeWidth={1.75} />
              清空
            </button>
          )}
        </div>
      )}

      {/* 空狀態 */}
      {stocks !== null && stocks.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#999", fontSize: 14 }}>
          尚未加入股票，用上方搜尋加入要比價的個股
        </div>
      )}

      {stocks !== null && stocks.length > 0 && rows.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#999", fontSize: 14 }}>
          {pending > 0 ? "載入股價中…" : "此區間查無股價資料"}
        </div>
      )}

      {/* 走勢圖（以區間起點為 0%） */}
      {chartData.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>
            區間走勢（以 {formatDateFull(start)} 起算的漲跌幅 %）
          </div>
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={xTicks}
                  tickFormatter={formatDateShort}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={{ stroke: "#e5e7eb" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                <Tooltip content={<ChartTooltip />} />
                {chartSeries.map((r) => (
                  <Line
                    key={r.ticker}
                    type="monotone"
                    dataKey={r.ticker}
                    name={`${r.name} ${r.ticker}`}
                    stroke={r.color}
                    strokeWidth={r.ticker === benchmark ? 2.6 : 1.6}
                    strokeDasharray={r.ticker === benchmark ? "5 3" : undefined}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 比價表 */}
      {sortedRows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#fafafa" }}>
                {sortHeader("ticker", "股票", "left")}
                <th style={{ padding: "8px 10px", textAlign: "right", color: "#666", whiteSpace: "nowrap" }}>起點價</th>
                {sortHeader("lastPrice", "迄點價")}
                {sortHeader("pct", "區間漲跌")}
                <th style={{ padding: "8px 10px", textAlign: "left", color: "#666", width: 150 }}>幅度</th>
                {benchmarkRow && (
                  <th style={{ padding: "8px 10px", textAlign: "right", color: "#666", whiteSpace: "nowrap" }}>相對基準</th>
                )}
                <th style={{ padding: "8px 10px", textAlign: "right", color: "#666", whiteSpace: "nowrap" }}>區間高／低</th>
                {sortHeader("amplitude", "振幅")}
                <th style={{ padding: "8px 10px", textAlign: "right", color: "#666", whiteSpace: "nowrap" }}>距高點</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const rel = benchmarkRow ? r.pct - benchmarkRow.pct : null;
                return (
                  <tr key={r.ticker} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 5, background: r.color, display: "inline-block", marginRight: 7 }} />
                      <Link href={`/stock/${r.ticker}`} style={{ color: "#1a56db", textDecoration: "none", fontWeight: 600 }}>
                        {r.name}
                      </Link>
                      <span style={{ color: "#9ca3af", marginLeft: 6 }}>{r.ticker}</span>
                      {r.ticker === benchmark && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 4, padding: "1px 5px" }}>基準</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {fmtPrice(r.basePrice)}
                      <span style={{ fontSize: 11, color: "#c0c4cc", marginLeft: 5 }}>{formatDateShort(r.baseDate)}</span>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {fmtPrice(r.lastPrice)}
                      <span style={{ fontSize: 11, color: "#c0c4cc", marginLeft: 5 }}>{formatDateShort(r.lastDate)}</span>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: "bold", color: pctColor(r.pct), whiteSpace: "nowrap" }}>
                      {fmtPct(r.pct)}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ position: "relative", height: 8, background: "#f3f4f6", borderRadius: 4 }}>
                        <div
                          style={{
                            position: "absolute", left: "50%", top: 0, height: 8, borderRadius: 4,
                            width: `${(Math.abs(r.pct) / maxAbsPct) * 50}%`,
                            background: pctColor(r.pct),
                            transform: r.pct < 0 ? "translateX(-100%)" : undefined,
                          }}
                        />
                        <div style={{ position: "absolute", left: "50%", top: -2, width: 1, height: 12, background: "#d1d5db" }} />
                      </div>
                    </td>
                    {benchmarkRow && (
                      <td style={{ padding: "8px 10px", textAlign: "right", color: pctColor(rel), whiteSpace: "nowrap" }}>
                        {r.ticker === benchmark ? "-" : fmtPct(rel)}
                      </td>
                    )}
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6b7280", whiteSpace: "nowrap" }}>
                      <span style={{ color: UP }}>{fmtPrice(r.high)}</span>
                      <span style={{ color: "#d1d5db", margin: "0 4px" }}>/</span>
                      <span style={{ color: DOWN }}>{fmtPrice(r.low)}</span>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {r.amplitude.toFixed(2)}%
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: pctColor(r.fromHigh), whiteSpace: "nowrap" }}>
                      {r.fromHigh === 0 ? "高點" : fmtPct(r.fromHigh)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 10, lineHeight: 1.8 }}>
            區間漲跌 =（迄點收盤 − 起點收盤）／起點收盤。起點取區間內第一個交易日，各檔若上市／停牌日期不同，起點日期會標在價格旁。
          </div>
        </div>
      )}
    </div>
  );
}
