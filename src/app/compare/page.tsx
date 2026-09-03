"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Trash2, SquarePen, Copy, Check, Import, GripVertical } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { scanStocks } from "@/lib/stock-lookup";
import { encodeGroup, decodeGroup } from "@/lib/group-share";
import PageHeader from "@/components/PageHeader";
import type { TrackQuote } from "@/app/api/track/route";

// ─── 比價群組（localStorage，與 /track 的追蹤群組各自獨立）───
// 群組為主的結構：每個群組各自持有一份股票清單，同一支股票可同時存在多個群組。
type Stock = { ticker: string; name: string };
type Group = { name: string; stocks: Stock[] };

type PricePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

const STORAGE_KEY = "dmao_compare_groups_v1";
const ACTIVE_GROUP_KEY = "dmao_compare_active_group";
// v1 是還沒有群組時的單一清單，載入時併成第一個群組
const LEGACY_LIST_KEY = "dmao_compare_v1";
const RANGE_KEY = "dmao_compare_range_v1";

const DEFAULT_GROUP = "群組1";
const MAX_STOCKS = 20;

// 只有台股（純數字代碼）有歷史股價來源
const isTwTicker = (t: string) => /^\d{4,6}$/.test(t);

function sanitizeStocks(arr: unknown): Stock[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: Stock[] = [];
  for (const s of arr) {
    if (s && typeof s.ticker === "string" && typeof s.name === "string" && !seen.has(s.ticker)) {
      seen.add(s.ticker);
      out.push({ ticker: s.ticker, name: s.name });
    }
  }
  return out.slice(0, MAX_STOCKS);
}

function defaultGroups(): Group[] {
  return [
    {
      name: DEFAULT_GROUP,
      stocks: [
        { ticker: "2330", name: "台積電" },
        { ticker: "2454", name: "聯發科" },
        { ticker: "2317", name: "鴻海" },
      ],
    },
  ];
}

function loadGroups(): Group[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((g) => g && typeof g.name === "string")
          .map((g) => ({ name: g.name, stocks: sanitizeStocks(g.stocks) }));
      }
    }
    // 舊版單一清單 → 併成第一個群組
    const legacy = localStorage.getItem(LEGACY_LIST_KEY);
    if (legacy !== null) {
      const stocks = sanitizeStocks(JSON.parse(legacy));
      if (stocks.length > 0) return [{ name: DEFAULT_GROUP, stocks }];
    }
  } catch {
    // fall through
  }
  return defaultGroups();
}

function saveGroups(groups: Group[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
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

// 折線圖配色（依群組內的順序輪流取用）
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
  stock: Stock,
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
  const [groupsData, setGroupsData] = useState<Group[] | null>(null);
  const [activeGroup, setActiveGroup] = useState<string>("");

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

  // ─── 編輯彈窗（新增/刪除股票、群組皆先改草稿，按儲存才生效）───
  const [editMode, setEditMode] = useState(false);
  const [draftGroups, setDraftGroups] = useState<Group[]>([]);
  const [modalGroup, setModalGroup] = useState<string>("");
  const [modalQuery, setModalQuery] = useState("");
  const [showModalSuggestions, setShowModalSuggestions] = useState(false);
  const modalSearchRef = useRef<HTMLDivElement>(null);
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragGroupIndex, setDragGroupIndex] = useState<number | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState(false);

  const dataRef = useRef<Record<string, PricePoint[]>>({});
  const inflight = useRef<Set<string>>(new Set());

  // ─── 載入群組與偏好設定 ───
  useEffect(() => {
    const g = loadGroups();
    setGroupsData(g);
    const names = g.map((x) => x.name);
    let active = "";
    try {
      const saved = localStorage.getItem(ACTIVE_GROUP_KEY);
      if (saved && names.includes(saved)) active = saved;
      const r = localStorage.getItem(RANGE_KEY);
      if (r && (r === "custom" || RANGE_PRESETS.some((p) => p.key === r))) setRangeKey(r as RangeKey);
    } catch {
      // ignore
    }
    setActiveGroup(active || names[0] || "");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, rangeKey);
    } catch {
      // ignore
    }
  }, [rangeKey]);

  const changeActiveGroup = useCallback((name: string) => {
    setActiveGroup(name);
    setHidden(new Set());
    try {
      localStorage.setItem(ACTIVE_GROUP_KEY, name);
    } catch {
      // ignore
    }
  }, []);

  const commitGroups = useCallback((next: Group[]) => {
    setGroupsData(next);
    saveGroups(next);
  }, []);

  // 目前群組的股票 — 比價、走勢圖、表格都以此為準
  const stocks = useMemo(
    () => (groupsData ?? []).find((g) => g.name === activeGroup)?.stocks ?? [],
    [groupsData, activeGroup],
  );

  const groupNames = useMemo(() => (groupsData ?? []).map((g) => g.name), [groupsData]);

  // 基準若不在目前群組就取消
  useEffect(() => {
    if (benchmark && !stocks.some((s) => s.ticker === benchmark)) setBenchmark("");
  }, [stocks, benchmark]);

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
    ensureData(stocks.map((s) => s.ticker));
  }, [stocks, ensureData]);

  const refresh = useCallback(() => {
    ensureData(stocks.map((s) => s.ticker), true);
  }, [stocks, ensureData]);

  // 直接輸入代碼加入時，向報價 API 補股名
  const resolveName = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/track?tickers=${code}`);
      const json = await res.json();
      const quote: TrackQuote | undefined = json?.data?.[code];
      const name = quote?.name?.replace(/\*/g, "").trim();
      if (!name) return;
      setGroupsData((prev) => {
        if (!prev) return prev;
        const next = prev.map((g) => ({
          ...g,
          stocks: g.stocks.map((s) => (s.ticker === code && s.name === code ? { ...s, name } : s)),
        }));
        saveGroups(next);
        return next;
      });
    } catch {
      // 補不到就維持代碼
    }
  }, []);

  const toggleHidden = useCallback((ticker: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }, []);

  // ─── 編輯彈窗：以下操作皆只改草稿，按「儲存」才寫回 ───
  const cloneGroups = (gs: Group[]): Group[] => gs.map((g) => ({ name: g.name, stocks: g.stocks.map((s) => ({ ...s })) }));

  const enterEdit = () => {
    const src = groupsData ?? [];
    setDraftGroups(cloneGroups(src));
    const names = src.map((g) => g.name);
    setModalGroup(names.includes(activeGroup) ? activeGroup : (names[0] ?? ""));
    setModalQuery("");
    setShowModalSuggestions(false);
    setShowGroupInput(false);
    setNewGroupName("");
    setRenamingGroup(null);
    setRenameText("");
    setDragIndex(null);
    setDragGroupIndex(null);
    setCopied(false);
    setShowImport(false);
    setImportText("");
    setImportError(false);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setShowGroupInput(false);
    setNewGroupName("");
    setModalQuery("");
    setConfirmDeleteGroup(null);
    setShowImport(false);
    setImportText("");
    setImportError(false);
  };

  const saveEdit = () => {
    // 沒有股票的群組不儲存（等同移除）
    const cleaned = draftGroups.filter((g) => g.stocks.length > 0);
    commitGroups(cleaned);
    setEditMode(false);
    setShowGroupInput(false);
    setNewGroupName("");
    setModalQuery("");
    setConfirmDeleteGroup(null);
    setShowImport(false);
    setImportText("");
    setImportError(false);
    // 主畫面跟著彈窗最後編輯的群組走（剛整理完就想看那組的走勢）；
    // 該群組若已被刪除或清空，退回原本的群組、再退回第一組。
    const names = cleaned.map((g) => g.name);
    const next = [modalGroup, activeGroup, names[0] ?? ""].find((n) => names.includes(n)) ?? "";
    if (next !== activeGroup) changeActiveGroup(next);
  };

  const modalGroupStocks = useMemo(
    () => draftGroups.find((g) => g.name === modalGroup)?.stocks ?? [],
    [draftGroups, modalGroup],
  );

  const modalIsRealGroup = draftGroups.some((g) => g.name === modalGroup);

  const addStockToDraft = (stock: Stock) => {
    setDraftGroups((prev) =>
      prev.map((g) => {
        if (g.name !== modalGroup) return g;
        if (g.stocks.some((s) => s.ticker === stock.ticker)) return g;
        if (g.stocks.length >= MAX_STOCKS) return g;
        return { ...g, stocks: [...g.stocks, stock] };
      }),
    );
    setModalQuery("");
    setShowModalSuggestions(false);
  };

  const addCodeToDraft = (code: string) => {
    addStockToDraft({ ticker: code, name: code });
    resolveName(code);
  };

  const removeStockFromDraft = (ticker: string) => {
    setDraftGroups((prev) =>
      prev.map((g) => (g.name === modalGroup ? { ...g, stocks: g.stocks.filter((s) => s.ticker !== ticker) } : g)),
    );
  };

  const createGroupFromBar = () => {
    const n = newGroupName.trim();
    if (n && !draftGroups.some((g) => g.name === n)) {
      setDraftGroups((prev) => [...prev, { name: n, stocks: [] }]);
      setModalGroup(n);
    }
    setNewGroupName("");
    setShowGroupInput(false);
  };

  const deleteGroup = (name: string) => {
    setDraftGroups((prev) => prev.filter((g) => g.name !== name));
    if (modalGroup === name) {
      setModalGroup(draftGroups.filter((g) => g.name !== name)[0]?.name ?? "");
    }
  };

  const commitRename = () => {
    const oldName = renamingGroup;
    setRenamingGroup(null);
    if (!oldName) return;
    const n = renameText.trim();
    if (!n || n === oldName) return;
    if (draftGroups.some((g) => g.name === n)) return; // 名稱重複 → 放棄
    setDraftGroups((prev) => prev.map((g) => (g.name === oldName ? { ...g, name: n } : g)));
    if (modalGroup === oldName) setModalGroup(n);
    // 主畫面正在看這個群組 → 一併跟著改名
    if (activeGroup === oldName) changeActiveGroup(n);
  };

  const reorderStocks = (group: string, from: number, to: number) => {
    if (from === to) return;
    setDraftGroups((prev) =>
      prev.map((g) => {
        if (g.name !== group) return g;
        const next = [...g.stocks];
        const [moved] = next.splice(from, 1);
        if (!moved) return g;
        next.splice(to, 0, moved);
        return { ...g, stocks: next };
      }),
    );
  };

  const reorderGroups = (from: number, to: number) => {
    if (from === to) return;
    setDraftGroups((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // 複製目前群組為分享碼（與 /track 的追蹤群組通用）
  const copyGroup = async () => {
    const g = draftGroups.find((x) => x.name === modalGroup);
    if (!g) return;
    const code = encodeGroup(g);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪貼簿不可用（權限/舊瀏覽器）→ 放到匯入框讓使用者手動複製
      setShowImport(true);
      setImportText(code);
    }
  };

  const importGroup = () => {
    const g = decodeGroup(importText);
    if (!g) { setImportError(true); return; }
    const names = draftGroups.map((x) => x.name);
    let name = g.name;
    if (names.includes(name)) {
      let i = 2;
      while (names.includes(`${g.name} (${i})`)) i++;
      name = `${g.name} (${i})`;
    }
    // 比價群組不看張數／持倉，只留代碼與名稱
    setDraftGroups((prev) => [
      ...prev,
      { name, stocks: g.stocks.slice(0, MAX_STOCKS).map((s) => ({ ticker: s.ticker, name: s.name })) },
    ]);
    setModalGroup(name);
    setImportText("");
    setShowImport(false);
    setImportError(false);
  };

  // ─── 搜尋建議 ───
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modalSearchRef.current && !modalSearchRef.current.contains(e.target as Node)) setShowModalSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buildSuggestions = (q: string, added: Stock[]) => {
    const key = q.trim().toLowerCase();
    if (!key) return [];
    const has = new Set(added.map((s) => s.ticker));
    return scanStocks
      .filter((s) => isTwTicker(s.ticker) && !has.has(s.ticker))
      .filter(
        (s) =>
          s.ticker.startsWith(key) ||
          s.name.toLowerCase().includes(key) ||
          s.aliases?.some((a) => a.toLowerCase().includes(key)),
      )
      .slice(0, 8);
  };

  const modalSuggestions = useMemo(() => buildSuggestions(modalQuery, modalGroupStocks), [modalQuery, modalGroupStocks]);

  const modalRawCodeAddable =
    isTwTicker(modalQuery.trim()) &&
    !modalGroupStocks.some((s) => s.ticker === modalQuery.trim()) &&
    !modalSuggestions.some((s) => s.ticker === modalQuery.trim());

  const handleModalEnter = () => {
    if (modalSuggestions.length > 0) addStockToDraft({ ticker: modalSuggestions[0].ticker, name: modalSuggestions[0].name });
    else if (modalRawCodeAddable) addCodeToDraft(modalQuery.trim());
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
  const rows = useMemo(
    () =>
      stocks
        .map((s, i) => buildRow(s, lineColor(i), data[s.ticker] ?? [], start, end))
        .filter((r): r is CompareRow => r !== null),
    [stocks, data, start, end],
  );

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

  const maxAbsPct = useMemo(() => Math.max(1, ...rows.map((r) => Math.abs(r.pct))), [rows]);

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
  const chartSeries = useMemo(() => rows.filter((r) => !hidden.has(r.ticker)), [rows, hidden]);

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
  const pending = stocks.filter((s) => !data[s.ticker] && !errors[s.ticker]).length;

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

      <PageHeader
        subtitle={`${formatDateFull(start)} ~ ${formatDateFull(end)}`}
        actions={
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
        }
      />

      {/* 群組頁籤 + 編輯 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14, fontSize: 14 }}>
        <span style={{ color: "#666" }}>群組：</span>
        {groupNames.map((g) => (
          <button
            key={g}
            onClick={() => changeActiveGroup(g)}
            style={{
              padding: "5px 14px", fontSize: 14, border: "1px solid #7c3aed", borderRadius: 16,
              background: activeGroup === g ? "#7c3aed" : "#fff",
              color: activeGroup === g ? "#fff" : "#7c3aed",
              cursor: "pointer", fontWeight: activeGroup === g ? "bold" : "normal",
            }}
          >
            {g}
          </button>
        ))}
        <button
          onClick={enterEdit}
          style={{
            marginLeft: 4, padding: "5px 14px", fontSize: 13, border: "1px solid #374151", borderRadius: 16,
            background: "#fff", color: "#374151", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 5,
          }}
        >
          <SquarePen size={15} strokeWidth={1.75} />
          編輯
        </button>
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
          {stocks.map((s) => (
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
      {stocks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {stocks.map((s, i) => {
            const isHidden = hidden.has(s.ticker);
            const err = errors[s.ticker];
            const isLoading = loadingTickers.includes(s.ticker);
            return (
              <span
                key={s.ticker}
                onClick={() => toggleHidden(s.ticker)}
                title={isHidden ? "在圖上顯示" : "在圖上隱藏"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px",
                  border: `1px solid ${err ? "#fecaca" : "#e5e7eb"}`, borderRadius: 16, fontSize: 13,
                  background: err ? "#fef2f2" : "#fff", opacity: isHidden ? 0.45 : 1, cursor: "pointer",
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 5, background: lineColor(i), display: "inline-block" }} />
                <b>{s.name}</b>
                <span style={{ color: "#9ca3af" }}>{s.ticker}</span>
                {isLoading && <span style={{ color: "#9ca3af" }}>載入中…</span>}
                {err && <span style={{ color: "#dc2626" }}>{err}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* 空狀態 */}
      {groupsData !== null && groupNames.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#999", fontSize: 14 }}>
          尚無群組，按「編輯」新增群組與股票
        </div>
      )}

      {groupsData !== null && groupNames.length > 0 && stocks.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#999", fontSize: 14 }}>
          「{activeGroup}」群組尚無股票，按「編輯」加入
        </div>
      )}

      {stocks.length > 0 && rows.length === 0 && (
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

      {/* ─── 編輯彈窗 ─── */}
      {editMode && (
        <div
          onClick={cancelEdit}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560,
              height: "80vh", maxHeight: 600, display: "flex", flexDirection: "column",
              boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #eee", flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: "bold" }}>編輯比價群組</span>
              <button onClick={cancelEdit} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 22, color: "#9ca3af", lineHeight: 1 }}>×</button>
            </div>

            {/* 控制區（固定，不隨清單捲動）*/}
            <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ color: "#666", fontSize: 13 }}>群組：</span>
                {draftGroups.map((g, gi) =>
                  renamingGroup === g.name ? (
                    <input
                      key={g.name}
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingGroup(null);
                      }}
                      onBlur={commitRename}
                      style={{ padding: "4px 10px", fontSize: 13, border: "1px solid #7c3aed", borderRadius: 16, outline: "none", width: 120, fontWeight: "bold" }}
                    />
                  ) : (
                    <button
                      key={g.name}
                      draggable
                      onDragStart={(e) => { setDragGroupIndex(gi); e.dataTransfer.effectAllowed = "move"; }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragGroupIndex !== null && dragGroupIndex !== gi) {
                          reorderGroups(dragGroupIndex, gi);
                          setDragGroupIndex(gi);
                        }
                      }}
                      onDragEnd={() => setDragGroupIndex(null)}
                      onClick={() => {
                        // 點已選取的群組名 → 進入改名；否則先選取
                        if (modalGroup === g.name) { setRenamingGroup(g.name); setRenameText(g.name); }
                        else setModalGroup(g.name);
                      }}
                      title={modalGroup === g.name ? "再點一次可改名；拖曳可調整群組順序" : `${g.name}（拖曳可調整順序）`}
                      style={{
                        padding: "4px 12px", fontSize: 13, borderRadius: 16,
                        border: "1px solid #7c3aed", cursor: "pointer",
                        background: modalGroup === g.name ? "#7c3aed" : "#fff",
                        color: modalGroup === g.name ? "#fff" : "#7c3aed",
                        fontWeight: modalGroup === g.name ? "bold" : "normal",
                        opacity: dragGroupIndex === gi ? 0.5 : 1,
                      }}
                    >
                      {g.name}
                    </button>
                  ),
                )}
                {showGroupInput ? (
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createGroupFromBar();
                      if (e.key === "Escape") { setNewGroupName(""); setShowGroupInput(false); }
                    }}
                    onBlur={createGroupFromBar}
                    placeholder="群組名稱，Enter 建立"
                    style={{ padding: "4px 10px", fontSize: 13, border: "1px solid #7c3aed", borderRadius: 16, outline: "none", width: 140 }}
                  />
                ) : (
                  <button
                    onClick={() => setShowGroupInput(true)}
                    style={{ padding: "4px 12px", fontSize: 13, border: "1px dashed #a78bfa", borderRadius: 16, background: "#fff", color: "#7c3aed", cursor: "pointer" }}
                  >
                    ＋ 新增群組
                  </button>
                )}
                <button
                  onClick={() => { setShowImport((v) => !v); setImportError(false); }}
                  title="從分享碼匯入群組（可貼上追蹤清單的分享碼）"
                  aria-label="從分享碼匯入群組"
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", border: "none", background: showImport ? "#eef2ff" : "none", borderRadius: 8, cursor: "pointer", color: showImport ? "#1a56db" : "#374151", padding: 4 }}
                >
                  <Import size={18} strokeWidth={1.75} />
                </button>
                {modalIsRealGroup && (
                  <button
                    onClick={() => setConfirmDeleteGroup(modalGroup)}
                    title={`刪除群組「${modalGroup}」`}
                    aria-label={`刪除群組「${modalGroup}」`}
                    style={{ display: "flex", alignItems: "center", border: "none", background: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}
                  >
                    <Trash2 size={18} strokeWidth={1.75} />
                  </button>
                )}
              </div>

              {/* 新增股票 */}
              <div ref={modalSearchRef} style={{ position: "relative" }}>
                <input
                  type="text"
                  value={modalQuery}
                  onChange={(e) => { setModalQuery(e.target.value); setShowModalSuggestions(true); }}
                  onFocus={() => setShowModalSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleModalEnter();
                    if (e.key === "Escape") setShowModalSuggestions(false);
                  }}
                  disabled={!modalIsRealGroup}
                  placeholder={modalIsRealGroup ? `新增股票到「${modalGroup}」（代碼或名稱，如 2330、台積電）` : "先新增一個群組"}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 8, outline: "none", boxSizing: "border-box", background: modalIsRealGroup ? "#fff" : "#f9fafb" }}
                />
                {showModalSuggestions && (modalSuggestions.length > 0 || modalRawCodeAddable) && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 1100, overflow: "hidden",
                  }}>
                    {modalSuggestions.map((s) => (
                      <button
                        key={s.ticker}
                        onClick={() => addStockToDraft({ ticker: s.ticker, name: s.name })}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "8px 12px", fontSize: 14, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f4f8"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                      >
                        <span style={{ fontWeight: 600, color: "#1a56db", minWidth: 52 }}>{s.ticker}</span>
                        <span>{s.name}</span>
                      </button>
                    ))}
                    {modalRawCodeAddable && (
                      <button
                        onClick={() => addCodeToDraft(modalQuery.trim())}
                        style={{ display: "block", width: "100%", padding: "8px 12px", fontSize: 14, border: "none", borderTop: modalSuggestions.length > 0 ? "1px solid #f3f4f6" : "none", background: "none", cursor: "pointer", textAlign: "left", color: "#6b7280" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f4f8"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                      >
                        直接加入代碼「{modalQuery.trim()}」
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 匯入群組：貼上分享碼 */}
              {showImport && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      autoFocus
                      value={importText}
                      onChange={(e) => { setImportText(e.target.value); setImportError(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") importGroup(); }}
                      placeholder="貼上分享碼匯入群組，按「匯入」"
                      style={{ flex: 1, padding: "7px 10px", fontSize: 13, border: `1px solid ${importError ? "#fca5a5" : "#d1d5db"}`, borderRadius: 8, outline: "none", boxSizing: "border-box" }}
                    />
                    <button
                      onClick={importGroup}
                      style={{ padding: "7px 16px", fontSize: 13, fontWeight: "bold", border: "none", borderRadius: 8, background: "#1a56db", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      匯入
                    </button>
                  </div>
                  {importError && (
                    <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>分享碼無效，請確認完整貼上</div>
                  )}
                </div>
              )}
            </div>

            {/* 股票清單（可捲動）*/}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 14px" }}>
              {modalGroupStocks.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  {modalIsRealGroup ? "此群組尚無股票，用上方搜尋加入" : "尚無群組，按「＋ 新增群組」建立"}
                </div>
              ) : (
                modalGroupStocks.map((s, i) => (
                  <div
                    key={s.ticker}
                    draggable
                    onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null && dragIndex !== i) {
                        reorderStocks(modalGroup, dragIndex, i);
                        setDragIndex(i);
                      }
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px", borderBottom: "1px solid #f3f4f6", background: dragIndex === i ? "#f1f5f9" : "transparent" }}
                  >
                    <span title="拖曳調整順序（也就是圖上的顏色順序）" style={{ display: "flex", alignItems: "center", color: "#cbd5e1", cursor: "grab", flexShrink: 0 }}>
                      <GripVertical size={16} strokeWidth={1.75} />
                    </span>
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: lineColor(i), display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: "#1a56db", minWidth: 52 }}>{s.ticker}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <button
                      onClick={() => removeStockFromDraft(s.ticker)}
                      title={`從「${modalGroup}」刪除`}
                      aria-label={`從「${modalGroup}」刪除 ${s.name}`}
                      style={{ display: "flex", alignItems: "center", border: "none", background: "none", cursor: "pointer", color: "#c4c9d1", padding: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#c4c9d1"; }}
                    >
                      <Trash2 size={17} strokeWidth={1.75} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* footer */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderTop: "1px solid #eee" }}>
              <button
                onClick={copyGroup}
                disabled={!modalIsRealGroup}
                title="複製此群組為分享碼"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", fontSize: 13, borderRadius: 8,
                  border: "1px solid #d1d5db", background: "#fff", color: "#374151",
                  cursor: modalIsRealGroup ? "pointer" : "not-allowed",
                  opacity: modalIsRealGroup ? 1 : 0.5,
                }}
              >
                <Copy size={14} strokeWidth={1.75} />
                複製此群組
              </button>
              <span style={{ marginRight: "auto", color: "#9ca3af", fontSize: 12 }}>變更按「儲存」才生效</span>
              <button
                onClick={cancelEdit}
                style={{ padding: "7px 18px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#6b7280", cursor: "pointer" }}
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                style={{ padding: "7px 20px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 8, background: "#16a34a", color: "#fff", cursor: "pointer" }}
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 刪除群組確認 ─── */}
      {confirmDeleteGroup !== null && (
        <div
          onClick={() => setConfirmDeleteGroup(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 360, padding: "20px 22px", boxShadow: "0 10px 34px rgba(0,0,0,0.28)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%", background: "#fee2e2", color: "#dc2626", flexShrink: 0 }}>
                <Trash2 size={18} strokeWidth={1.75} />
              </span>
              <span style={{ fontSize: 16, fontWeight: "bold", color: "#111827" }}>刪除群組</span>
            </div>
            <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, marginBottom: 20 }}>
              確定刪除群組「<b>{confirmDeleteGroup}</b>」？
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                群組內的股票若也在其他群組，仍會保留。
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setConfirmDeleteGroup(null)}
                style={{ padding: "7px 18px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#6b7280", cursor: "pointer" }}
              >
                取消
              </button>
              <button
                onClick={() => { deleteGroup(confirmDeleteGroup); setConfirmDeleteGroup(null); }}
                style={{ padding: "7px 20px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 8, background: "#dc2626", color: "#fff", cursor: "pointer" }}
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast：複製成功 ─── */}
      {copied && (
        <div
          style={{
            position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
            zIndex: 1300, background: "#1e293b", color: "#fff", fontSize: 13,
            padding: "10px 18px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.3)", pointerEvents: "none",
          }}
        >
          <Check size={15} strokeWidth={2} />
          已複製分享碼
        </div>
      )}
    </div>
  );
}
