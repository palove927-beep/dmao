"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { House, RefreshCw, SquarePen, Trash2, Copy, Check, Import } from "lucide-react";
import { scanStocks } from "@/lib/stock-lookup";
import type { TrackQuote } from "@/app/api/track/route";

// ─── Watchlist persistence (localStorage) ────────────────
// 群組為主的結構：每個群組各自持有一份股票清單（同一支股票若跨群組，會分別存於各群組）
type Stock = { ticker: string; name: string };
type Group = { name: string; stocks: Stock[] };

const STORAGE_KEY = "dmao_track_groups_v2";
const ACTIVE_GROUP_KEY = "dmao_track_active_group";

const DEFAULT_GROUP = "群組1";

function defaultGroups(): Group[] {
  return [
    {
      name: DEFAULT_GROUP,
      stocks: [
        { ticker: "2330", name: "台積電" },
        { ticker: "2454", name: "聯發科" },
        { ticker: "2317", name: "鴻海" },
        { ticker: "2308", name: "台達電" },
      ],
    },
  ];
}

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
  return out;
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

// ─── 群組分享（複製為分享碼／從分享碼匯入）───
const SHARE_PREFIX = "DMAO1-";

function encodeGroup(g: Group): string {
  const payload = { v: 1, name: g.name, s: g.stocks.map((x) => [x.ticker, x.name]) };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const b64 = btoa(String.fromCharCode(...bytes));
  return SHARE_PREFIX + b64;
}

function decodeGroup(code: string): Group | null {
  try {
    const raw = code.trim().replace(/^DMAO1-/, "");
    if (!raw) return null;
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (!p || typeof p.name !== "string" || !Array.isArray(p.s)) return null;
    const seen = new Set<string>();
    const stocks: Stock[] = [];
    for (const it of p.s) {
      if (Array.isArray(it) && typeof it[0] === "string" && typeof it[1] === "string" && !seen.has(it[0])) {
        seen.add(it[0]);
        stocks.push({ ticker: it[0], name: it[1] });
      }
    }
    return { name: String(p.name).slice(0, 40) || "匯入群組", stocks };
  } catch {
    return null;
  }
}

// 只有台股（純數字代碼）才有報價來源
const isTwTicker = (t: string) => /^\d{4,6}$/.test(t);

type SortMode = "custom" | "gainers" | "losers";

type TimeRange = "all" | "1w" | "1m" | "3m";

function getSinceDate(range: TimeRange): string | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "1w") now.setDate(now.getDate() - 7);
  else if (range === "1m") now.setMonth(now.getMonth() - 1);
  else if (range === "3m") now.setMonth(now.getMonth() - 3);
  return now.toISOString().slice(0, 10);
}

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
// 滑鼠移過去會顯示該日的「日期 + 收盤價」
type SparkPoint = { date: string; close: number };

function Sparkline({ ticker }: { ticker: string }) {
  const [points, setPoints] = useState<SparkPoint[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stock-history/${ticker}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok || !Array.isArray(json.prices)) return;
        const pts: SparkPoint[] = json.prices
          .slice(-22)
          .map((p: { date: string; close: number }) => ({ date: p.date, close: p.close }))
          .filter((p: SparkPoint) => typeof p.close === "number" && !!p.date);
        setPoints(pts);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticker]);

  if (!points || points.length < 2) return null;

  const w = 100, h = 30;
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const xAt = (i: number) => (i / (points.length - 1)) * w;
  const yAt = (i: number) => h - 3 - ((points[i].close - min) / range) * (h - 6);
  const coords = points.map((_, i) => `${xAt(i).toFixed(1)},${yAt(i).toFixed(1)}`).join(" ");

  const handleMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (points.length - 1)));
  };

  const hoverPt = hover !== null ? points[hover] : null;
  const hoverLeftPct = hover !== null ? (hover / (points.length - 1)) * 100 : 0;
  const hoverTopPct = hover !== null ? (yAt(hover) / h) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", height: h }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: h }}
        aria-hidden="true"
      >
        <polyline
          points={coords}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <line
            x1={xAt(hover)} y1={0} x2={xAt(hover)} y2={h}
            stroke="#cbd5e1" strokeWidth={1} vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {hover !== null && (
        <div
          style={{
            position: "absolute",
            left: `${hoverLeftPct}%`,
            top: `${hoverTopPct}%`,
            width: 6, height: 6, marginLeft: -3, marginTop: -3,
            borderRadius: "50%", background: "#475569",
            pointerEvents: "none",
          }}
        />
      )}
      {hoverPt && (
        <div
          style={{
            position: "absolute",
            left: `${hoverLeftPct}%`,
            bottom: "100%",
            marginBottom: 4,
            transform: hoverLeftPct > 60 ? "translateX(-100%)" : "translateX(-50%)",
            background: "#1e293b",
            color: "#fff",
            fontSize: 11,
            lineHeight: 1.4,
            padding: "3px 7px",
            borderRadius: 5,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 30,
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          {formatShortDate(hoverPt.date)}　<b>{fmtCompact(hoverPt.close)}</b>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  const [groupsData, setGroupsData] = useState<Group[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, TrackQuote>>({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("custom");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  // ─── 群組（群組為主）───
  const [activeGroup, setActiveGroup] = useState<string>("");
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // ─── 編輯彈窗（新增/刪除股票、群組皆先改草稿，按儲存才生效）───
  const [editMode, setEditMode] = useState(false); // = 編輯彈窗是否開啟
  const [draftGroups, setDraftGroups] = useState<Group[]>([]);
  const [modalGroup, setModalGroup] = useState<string>(""); // 彈窗內目前選取的群組
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<string | null>(null); // 待確認刪除的群組名
  const [copied, setCopied] = useState(false); // 複製分享碼的短暫回饋
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dmao_track_view");
      if (saved === "list" || saved === "card") setViewMode(saved);
      const savedSort = localStorage.getItem("dmao_track_sort");
      if (savedSort === "custom" || savedSort === "gainers" || savedSort === "losers") {
        setSortMode(savedSort);
      }
    } catch {
      // ignore
    }
  }, []);

  const changeActiveGroup = (g: string) => {
    setActiveGroup(g);
    try {
      localStorage.setItem(ACTIVE_GROUP_KEY, g);
    } catch {
      // ignore
    }
  };

  // 載入群組資料（localStorage 為 client-only）
  useEffect(() => {
    const g = loadGroups();
    setGroupsData(g);
    const names = g.map((x) => x.name);
    let active = "";
    try {
      const savedActive = localStorage.getItem(ACTIVE_GROUP_KEY);
      if (savedActive && names.includes(savedActive)) active = savedActive;
    } catch {
      // ignore
    }
    setActiveGroup(active || names[0] || "");
  }, []);

  const cloneGroups = (gs: Group[]): Group[] =>
    gs.map((g) => ({ name: g.name, stocks: g.stocks.map((s) => ({ ...s })) }));

  // 以下編輯操作皆只改「草稿」，按「儲存」才寫回 groupsData 與 localStorage。
  const enterEdit = () => {
    const src = groupsData ?? [];
    setDraftGroups(cloneGroups(src));
    const names = src.map((g) => g.name);
    setModalGroup(names.includes(activeGroup) ? activeGroup : (names[0] ?? ""));
    setShowGroupInput(false);
    setNewGroupName("");
    setQuery("");
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
    setQuery("");
    setConfirmDeleteGroup(null);
    setShowImport(false);
    setImportText("");
    setImportError(false);
  };

  // 複製目前群組為分享碼
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

  // 從分享碼匯入為新群組
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
    setDraftGroups((prev) => [...prev, { name, stocks: g.stocks }]);
    setModalGroup(name);
    setImportText("");
    setShowImport(false);
    setImportError(false);
  };

  const saveEdit = () => {
    setGroupsData(draftGroups);
    saveGroups(draftGroups);
    setEditMode(false);
    setShowGroupInput(false);
    setNewGroupName("");
    setQuery("");
    setConfirmDeleteGroup(null);
    setShowImport(false);
    setImportText("");
    setImportError(false);
    // 主畫面所選群組若已被刪除 → 校正回第一個群組
    const names = draftGroups.map((g) => g.name);
    if (!names.includes(activeGroup)) changeActiveGroup(names[0] ?? "");
  };

  // 在彈窗內新增群組並切換過去 — 草稿
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

  // 從目前群組刪除（只影響該群組；同股在其他群組不受影響）— 草稿
  const removeStockFromGroup = (ticker: string, group: string) => {
    setDraftGroups((prev) =>
      prev.map((g) =>
        g.name === group ? { ...g, stocks: g.stocks.filter((s) => s.ticker !== ticker) } : g,
      ),
    );
  };

  const changeSortMode = (mode: SortMode) => {
    setSortMode(mode);
    try {
      localStorage.setItem("dmao_track_sort", mode);
    } catch {
      // ignore
    }
  };

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
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

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
    fetchLatestEps(2026, setLatestEps2026);
    fetchLatestEps(2027, setLatestEps2027);
  }, []);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const since = getSinceDate(timeRange);
        const url = since
          ? `/api/annotations?mode=counts&since=${since}`
          : "/api/annotations?mode=counts";
        const res = await fetch(url);
        const json = await res.json();
        if (json.ok) setAnnotationCounts(json.counts);
      } catch {
        // ignore
      }
    };
    fetchCounts();
  }, [timeRange]);

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

  // 所有群組的股票代碼（去重）— 供報價查詢
  const tickers = useMemo(() => {
    const set = new Set<string>();
    for (const g of groupsData ?? []) {
      for (const s of g.stocks) {
        if (isTwTicker(s.ticker)) set.add(s.ticker);
      }
    }
    return [...set];
  }, [groupsData]);

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
    if (groupsData === null) return;
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 30000);
    return () => clearInterval(interval);
  }, [groupsData, fetchQuotes]);

  // 報價回來後，把佔位名稱（=代碼）換成真實股名（於所有群組內更新）
  useEffect(() => {
    if (!groupsData) return;
    let changed = false;
    const next = groupsData.map((g) => ({
      ...g,
      stocks: g.stocks.map((s) => {
        const q = quotes[s.ticker];
        if (q?.name && s.name === s.ticker) {
          changed = true;
          return { ...s, name: q.name };
        }
        return s;
      }),
    }));
    if (changed) {
      setGroupsData(next);
      saveGroups(next);
    }
  }, [quotes, groupsData]);

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

  // 新增股票 — 草稿（加入彈窗目前選取的群組；同群組去重）
  const addStock = (stock: Stock) => {
    setDraftGroups((prev) =>
      prev.map((g) => {
        if (g.name !== modalGroup) return g;
        if (g.stocks.some((s) => s.ticker === stock.ticker)) return g;
        return { ...g, stocks: [...g.stocks, { ticker: stock.ticker, name: stock.name }] };
      }),
    );
    setQuery("");
    setShowSuggestions(false);
  };

  // ─── Search suggestions（彈窗新增股票用；排除目前群組已有的股票）───
  const modalGroupStocks = useMemo(
    () => draftGroups.find((g) => g.name === modalGroup)?.stocks ?? [],
    [draftGroups, modalGroup],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const added = new Set(modalGroupStocks.map((s) => s.ticker));
    return scanStocks
      .filter((s) => isTwTicker(s.ticker) && !added.has(s.ticker))
      .filter(
        (s) =>
          s.ticker.startsWith(q) ||
          s.name.toLowerCase().includes(q) ||
          s.aliases?.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [query, modalGroupStocks]);

  const rawCodeAddable =
    isTwTicker(query.trim()) &&
    !modalGroupStocks.some((s) => s.ticker === query.trim()) &&
    !suggestions.some((s) => s.ticker === query.trim());

  const handleEnter = () => {
    if (suggestions.length > 0) {
      addStock({ ticker: suggestions[0].ticker, name: suggestions[0].name });
    } else if (rawCodeAddable) {
      const code = query.trim();
      addStock({ ticker: code, name: code });
    }
  };

  const groupNames = useMemo(() => (groupsData ?? []).map((g) => g.name), [groupsData]);

  // ─── 主畫面：目前所選群組的股票 ───
  const groupFilteredList = useMemo(
    () => (groupsData ?? []).find((g) => g.name === activeGroup)?.stocks ?? [],
    [groupsData, activeGroup],
  );

  // 彈窗內：目前選取群組的草稿股票
  const modalFilteredList = modalGroupStocks;
  const modalActiveIsRealGroup = draftGroups.some((g) => g.name === modalGroup);

  // ─── Sorting ───
  const sortedList = useMemo(() => {
    if (sortMode === "custom") return groupFilteredList;
    const pct = (s: Stock) => quotes[s.ticker]?.changePercent ?? null;
    return [...groupFilteredList].sort((a, b) => {
      const pa = pct(a);
      const pb = pct(b);
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return sortMode === "gainers" ? pb - pa : pa - pb;
    });
  }, [groupFilteredList, sortMode, quotes]);

  // ─── Summary counts（依目前群組篩選後的股票統計）───
  const summary = useMemo(() => {
    let up = 0, down = 0, flat = 0;
    for (const s of groupFilteredList) {
      if (!isTwTicker(s.ticker)) continue;
      const c = quotes[s.ticker]?.change;
      if (c === null || c === undefined) continue;
      if (c > 0) up++;
      else if (c < 0) down++;
      else flat++;
    }
    return { up, down, flat };
  }, [groupFilteredList, quotes]);

  const sortModes: { key: SortMode; label: string }[] = [
    { key: "custom", label: "自訂順序" },
    { key: "gainers", label: "漲幅排序" },
    { key: "losers", label: "跌幅排序" },
  ];

  const timeRanges: { key: TimeRange; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "1w", label: "一周" },
    { key: "1m", label: "一個月" },
    { key: "3m", label: "三個月" },
  ];

  const groupTab = (key: string, label: string) => (
    <button
      key={key}
      onClick={() => changeActiveGroup(key)}
      style={{
        padding: "5px 14px",
        fontSize: 14,
        border: "1px solid #7c3aed",
        borderRadius: 16,
        background: activeGroup === key ? "#7c3aed" : "#fff",
        color: activeGroup === key ? "#fff" : "#7c3aed",
        cursor: "pointer",
        fontWeight: activeGroup === key ? "bold" : "normal",
      }}
    >
      {label}
    </button>
  );

  const activeIsRealGroup = groupNames.includes(activeGroup);

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
            <RefreshCw size={18} strokeWidth={1.75} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {/* Row 1：排序 + 檢視（左） ... 標記區間（右） */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {sortModes.map((m) => (
            <button
              key={m.key}
              onClick={() => changeSortMode(m.key)}
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

        {/* 標記區間（靠右） */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <span style={{ color: "#666" }}>標記區間：</span>
          {timeRanges.map((r) => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              style={{
                padding: "5px 14px",
                fontSize: 14,
                border: "1px solid #1a56db",
                borderRadius: 16,
                background: timeRange === r.key ? "#1a56db" : "#fff",
                color: timeRange === r.key ? "#fff" : "#1a56db",
                cursor: "pointer",
                fontWeight: timeRange === r.key ? "bold" : "normal",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2：群組頁籤 + 編輯 ; 漲跌家數靠右 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, fontSize: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: "#666" }}>群組：</span>
          {groupNames.map((g) => groupTab(g, g))}
          <button
            onClick={enterEdit}
            style={{
              marginLeft: 4,
              padding: "5px 14px",
              fontSize: 13,
              border: "1px solid #374151",
              borderRadius: 16,
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <SquarePen size={15} strokeWidth={1.75} />
            編輯
          </button>
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
      {groupsData !== null && groupNames.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#999", fontSize: 14 }}>
          尚無群組，按「編輯」新增群組與股票
        </div>
      )}

      {groupsData !== null && groupNames.length > 0 && sortedList.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#999", fontSize: 14 }}>
          {activeIsRealGroup
            ? `「${activeGroup}」群組尚無股票，按「編輯」加入`
            : "此分類沒有股票"}
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
              <col style={{ width: "18%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
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
                        <div>
                          <Link href={`/stock/${stock.ticker}`} style={{ color: "#1a56db", textDecoration: "none", fontWeight: 500 }}>
                            {stock.ticker}
                          </Link>
                          <Link href={`/stock/${stock.ticker}`} style={{ marginLeft: 8, color: "inherit", textDecoration: "none" }}>
                            {q?.name || stock.name}
                          </Link>
                        </div>
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
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0 }}>
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

      {groupsData === null && (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>
      )}

      {/* ─── 編輯彈窗 ─── */}
      {editMode && (
        <div
          onClick={cancelEdit}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 16,
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
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #eee", flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: "bold" }}>編輯追蹤清單</span>
              <button onClick={cancelEdit} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 22, color: "#9ca3af", lineHeight: 1 }}>×</button>
            </div>

            {/* 控制區（固定，不隨清單捲動）*/}
            <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
              {/* 群組選擇 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ color: "#666", fontSize: 13 }}>群組：</span>
                {draftGroups.map((g) => (
                  <button
                    key={g.name}
                    onClick={() => setModalGroup(g.name)}
                    style={{
                      padding: "4px 12px", fontSize: 13, borderRadius: 16,
                      border: "1px solid #7c3aed", cursor: "pointer",
                      background: modalGroup === g.name ? "#7c3aed" : "#fff",
                      color: modalGroup === g.name ? "#fff" : "#7c3aed",
                      fontWeight: modalGroup === g.name ? "bold" : "normal",
                    }}
                  >
                    {g.name}
                  </button>
                ))}
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
                {modalActiveIsRealGroup && (
                  <button
                    onClick={() => setConfirmDeleteGroup(modalGroup)}
                    title={`刪除群組「${modalGroup}」`}
                    aria-label={`刪除群組「${modalGroup}」`}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", border: "none", background: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
                  >
                    <Trash2 size={18} strokeWidth={1.75} />
                  </button>
                )}
              </div>

              {/* 新增股票 */}
              <div ref={searchRef} style={{ position: "relative" }}>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEnter();
                    if (e.key === "Escape") setShowSuggestions(false);
                  }}
                  placeholder={`新增股票到「${modalActiveIsRealGroup ? modalGroup : "追蹤"}」（代碼或名稱，如 2330、台積電）`}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 8, outline: "none", boxSizing: "border-box" }}
                />
                {showSuggestions && (suggestions.length > 0 || rawCodeAddable) && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 1100, overflow: "hidden",
                  }}>
                    {suggestions.map((s) => (
                      <button
                        key={s.ticker}
                        onClick={() => addStock({ ticker: s.ticker, name: s.name })}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "8px 12px", fontSize: 14, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
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
                        style={{ display: "block", width: "100%", padding: "8px 12px", fontSize: 14, border: "none", borderTop: suggestions.length > 0 ? "1px solid #f3f4f6" : "none", background: "none", cursor: "pointer", textAlign: "left", color: "#6b7280" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f4f8"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                      >
                        直接加入代碼「{query.trim()}」
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 分享：複製此群組 / 匯入群組 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={copyGroup}
                  disabled={!modalActiveIsRealGroup}
                  title="複製此群組為分享碼"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 12px", fontSize: 13, borderRadius: 16,
                    border: "1px solid #d1d5db", background: "#fff",
                    color: copied ? "#16a34a" : "#374151",
                    cursor: modalActiveIsRealGroup ? "pointer" : "not-allowed",
                    opacity: modalActiveIsRealGroup ? 1 : 0.5,
                  }}
                >
                  {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
                  {copied ? "已複製" : "複製此群組"}
                </button>
                <button
                  onClick={() => { setShowImport((v) => !v); setImportError(false); }}
                  title="從分享碼匯入群組"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 12px", fontSize: 13, borderRadius: 16,
                    border: "1px solid #d1d5db", background: showImport ? "#f3f4f6" : "#fff",
                    color: "#374151", cursor: "pointer",
                  }}
                >
                  <Import size={14} strokeWidth={1.75} />
                  匯入群組
                </button>
              </div>

              {showImport && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      autoFocus
                      value={importText}
                      onChange={(e) => { setImportText(e.target.value); setImportError(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") importGroup(); }}
                      placeholder="貼上分享碼，按「匯入」"
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

            {/* 股票清單（可捲動；固定高度避免切換群組時跳動）*/}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px 14px" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                「{modalActiveIsRealGroup ? modalGroup : "全部"}」的股票（{modalFilteredList.length}）
              </div>
              {modalFilteredList.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  此群組尚無股票，用上方搜尋加入
                </div>
              ) : (
                modalFilteredList.map((s) => (
                  <div key={s.ticker} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ fontWeight: 600, color: "#1a56db", minWidth: 52 }}>{s.ticker}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <button
                      onClick={() => removeStockFromGroup(s.ticker, modalGroup)}
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
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1200, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, width: "100%", maxWidth: 360,
              padding: "20px 22px", boxShadow: "0 10px 34px rgba(0,0,0,0.28)",
            }}
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
  eps2026,
  eps2027,
  annotationCount,
  isExpanded,
  annotations,
  isLoadingAnnotations,
  onToggleAnnotations,
}: {
  stock: Stock;
  quote: TrackQuote | undefined;
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
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, paddingRight: 20 }}>
          <span style={{ fontSize: 15, fontWeight: "bold", color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </span>
          <Link
            href={`/stock/${stock.ticker}`}
            title={`${displayName} 詳細頁`}
            style={{ fontSize: 13, color: "#1a56db", flexShrink: 0, textDecoration: "none" }}
          >
            {stock.ticker}
          </Link>
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
      </div>


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
