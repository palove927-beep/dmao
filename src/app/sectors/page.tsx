"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RANGES, type RangeKey } from "@/lib/sector-range";

type SectorStockRow = {
  ticker: string;
  name: string;
  market: "tpex" | null;
  basePrice: number | null;
  baseDate: string | null;
  price: number | null;
  priceDate: string | null;
  changePercent: number | null;
};

type SectorGroupRow = {
  id: string;
  label: string;
  tier: string;
  changePercent: number | null;
  total: number;
  covered: number;
  stocks: SectorStockRow[];
};

type ApiResult = {
  ok: boolean;
  range: RangeKey;
  baseDate: string;
  asOf: string | null;
  tiers: { tier: string; groups: SectorGroupRow[] }[];
  missing: { ticker: string; name: string }[];
};

type SortKey = "change" | "table";

const UP = "#dc2626";
const DOWN = "#15803d";
const FLAT = "#6b7280";

function changeColor(v: number | null): string {
  if (v === null || v === 0) return FLAT;
  return v > 0 ? UP : DOWN;
}

function formatPercent(v: number | null): string {
  if (v === null) return "-";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// 漲跌幅長條：以本頁最大絕對漲跌幅為滿格，從中線往兩側長
function ChangeBar({ value, max }: { value: number | null; max: number }) {
  const width = value === null || max === 0 ? 0 : (Math.abs(value) / max) * 50;
  const up = (value ?? 0) >= 0;
  return (
    <div style={{ position: "relative", height: 10, background: "#f1f5f9", borderRadius: 3 }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#cbd5e1" }} />
      <div
        style={{
          position: "absolute",
          top: 1,
          bottom: 1,
          left: up ? "50%" : `${50 - width}%`,
          width: `${width}%`,
          background: changeColor(value),
          borderRadius: 2,
        }}
      />
    </div>
  );
}

export default function SectorsPage() {
  const [range, setRange] = useState<RangeKey>("1m");
  const [tier, setTier] = useState<string>("全部");
  const [sort, setSort] = useState<SortKey>("change");
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // 換區間時的 loading／error 重設放在點擊當下，effect 只負責抓資料，
  // 否則會在 effect 內同步 setState、觸發連鎖 render
  const selectRange = (key: RangeKey) => {
    if (key === range) return;
    setLoading(true);
    setError(null);
    setRange(key);
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sector-returns?range=${range}`)
      .then((r) => r.json())
      .then((json: ApiResult & { error?: string }) => {
        if (cancelled) return;
        if (json.ok) setData(json);
        else setError(json.error ?? "讀取失敗");
      })
      .catch(() => { if (!cancelled) setError("讀取失敗"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const tiers = useMemo(() => ["全部", ...(data?.tiers.map((t) => t.tier) ?? [])], [data]);

  const groups = useMemo(() => {
    if (!data) return [];
    const flat = data.tiers
      .filter((t) => tier === "全部" || t.tier === tier)
      .flatMap((t) => t.groups);
    if (sort === "table") return flat;
    // 沒有任何成分股有資料的族群排最後，不要混在跌幅最深的地方
    return [...flat].sort((a, b) => {
      if (a.changePercent === null) return b.changePercent === null ? 0 : 1;
      if (b.changePercent === null) return -1;
      return b.changePercent - a.changePercent;
    });
  }, [data, tier, sort]);

  const maxAbs = useMemo(
    () => Math.max(...groups.map((g) => Math.abs(g.changePercent ?? 0)), 0.01),
    [groups]
  );

  const btn = (active: boolean) => ({
    padding: "6px 14px",
    fontSize: 13,
    border: "1px solid #1a56db",
    borderRadius: 6,
    background: active ? "#1a56db" : "#fff",
    color: active ? "#fff" : "#1a56db",
    fontWeight: active ? ("bold" as const) : ("normal" as const),
    cursor: "pointer",
  });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <PageHeader
        title="族群比較"
        subtitle={data?.asOf ? `${data.baseDate} → ${data.asOf}` : undefined}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => selectRange(r.key)} style={btn(range === r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {tiers.map((t) => (
          <button key={t} onClick={() => setTier(t)} style={{ ...btn(tier === t), padding: "5px 12px", fontSize: 12 }}>
            {t}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setSort(sort === "change" ? "table" : "change")}
          style={{ ...btn(false), padding: "5px 12px", fontSize: 12, borderColor: "#cbd5e1", color: "#475569" }}
        >
          {sort === "change" ? "依漲幅排序" : "依表格順序"}
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>}
      {error && <div style={{ padding: 16, background: "#fef2f2", color: "#b91c1c", borderRadius: 6 }}>{error}</div>}

      {!loading && !error && data && (
        <>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            {groups.map((g, i) => {
              const isOpen = expanded === g.id;
              return (
                <div key={g.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : g.id)}
                    aria-expanded={isOpen}
                    style={{
                      width: "100%", display: "grid",
                      gridTemplateColumns: "28px 52px minmax(96px, 1.1fr) 1fr 84px 56px",
                      alignItems: "center", gap: 10, padding: "10px 12px",
                      background: isOpen ? "#eff6ff" : "#fff",
                      border: "none", cursor: "pointer", textAlign: "left", font: "inherit",
                    }}
                  >
                    <span style={{ color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
                      {sort === "change" ? i + 1 : ""}
                    </span>
                    <span style={{ fontSize: 11, color: "#1e3a5f", background: "#e0e7ff", borderRadius: 4, padding: "2px 6px", textAlign: "center" }}>
                      {g.tier}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 4 }}>
                      <ChevronRight
                        size={14}
                        style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0, color: "#94a3b8" }}
                      />
                      {g.label}
                    </span>
                    <ChangeBar value={g.changePercent} max={maxAbs} />
                    <span style={{ textAlign: "right", fontWeight: "bold", fontVariantNumeric: "tabular-nums", color: changeColor(g.changePercent) }}>
                      {formatPercent(g.changePercent)}
                    </span>
                    <span style={{ textAlign: "right", fontSize: 12, color: g.covered < g.total ? "#b45309" : "#9ca3af" }}>
                      {g.covered}/{g.total}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ background: "#f8fafc", padding: "4px 12px 12px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                        <thead>
                          <tr style={{ color: "#64748b", fontSize: 12 }}>
                            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>個股</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500 }}>起算價</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500 }}>現價</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500 }}>漲跌幅</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...g.stocks]
                            .sort((a, b) => {
                              if (a.changePercent === null) return b.changePercent === null ? 0 : 1;
                              if (b.changePercent === null) return -1;
                              return b.changePercent - a.changePercent;
                            })
                            .map((s) => (
                              <tr key={s.ticker} style={{ borderTop: "1px solid #e5e7eb" }}>
                                <td style={{ padding: "6px 8px" }}>
                                  <a href={`/stock/${s.ticker}`} style={{ color: "#1a56db", textDecoration: "none" }}>
                                    {s.ticker}
                                  </a>
                                  <span style={{ marginLeft: 10 }}>{s.name}</span>
                                  {s.market === "tpex" && (
                                    <span style={{ marginLeft: 6, fontSize: 11, color: "#94a3b8" }}>櫃</span>
                                  )}
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "right", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                                  {s.basePrice?.toFixed(2) ?? "-"}
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                  {s.price?.toFixed(2) ?? "-"}
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: changeColor(s.changePercent) }}>
                                  {formatPercent(s.changePercent)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>
            族群漲幅為成分股漲幅的等權平均（未按市值加權）。右側 n/m 是有價格資料的檔數／成分股總數。
            {data.missing.length > 0 && (
              <>
                <br />
                <RefreshCw size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                有 {data.missing.length} 檔還沒有歷史股價，可執行
                <code style={{ margin: "0 4px", background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 }}>
                  /api/stock-refresh-all?source=sectors
                </code>
                補抓後重新整理。
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
