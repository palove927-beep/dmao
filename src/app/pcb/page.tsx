"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { pcbChain, pcbTickers, type ChainSegment } from "@/lib/pcb-chain";
import { RANGES, type RangeKey } from "@/lib/sector-range";
import type { TrackQuote } from "@/app/api/track/route";

type Returns = Record<string, { baseDate: string | null; priceDate: string | null; changePercent: number | null }>;
type EpsMap = Record<string, { eps: number; article_date: string | null }>;

const RANGE_KEY = "dmao_pcb_range_v1";

// 台股慣例：紅漲綠跌
const pctColor = (v: number | null | undefined) =>
  v == null || v === 0 ? "#6b7280" : v > 0 ? "#dc2626" : "#15803d";
const fmtPct = (v: number | null | undefined) =>
  v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
// 以下 EPS／本益比的呈現與 /stock 頁一致
const calcPE = (price: number | null, eps: number | undefined) =>
  !price || !eps || eps <= 0 ? null : Math.round((price / eps) * 10) / 10;

const peColor = (pe: number): string => {
  if (pe < 15) return "#2563eb";
  if (pe < 20) return "#16a34a";
  if (pe < 25) return "#eab308";
  if (pe < 35) return "#ea580c";
  return "#dc2626";
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

// 財測日期新舊：兩週內綠、一個月內藍、三個月內橘，更舊灰
const dateAgeColor = (dateStr: string, now: number): string => {
  const diff = (now - new Date(dateStr).getTime()) / (24 * 3600 * 1000);
  if (diff <= 14) return "#16a34a";
  if (diff <= 30) return "#2563eb";
  if (diff <= 90) return "#ea580c";
  return "#9ca3af";
};

function EpsCell({ eps, price }: { eps?: { eps: number }; price: number | null }) {
  if (!eps) return <>-</>;
  const pe = calcPE(price, eps.eps);
  return (
    <span>
      <span style={{ color: "#b45309", fontWeight: "bold" }}>{eps.eps}</span>
      {pe !== null && (
        <span style={{
          marginLeft: 6, fontSize: 12, fontWeight: "bold", color: "#fff",
          background: peColor(pe), padding: "1px 6px", borderRadius: 4,
        }}>
          {pe}x
        </span>
      )}
    </span>
  );
}

// 等權平均，略過沒有資料的個股
function avg(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export default function PcbPage() {
  const [range, setRange] = useState<RangeKey>("1m");
  const [quotes, setQuotes] = useState<Record<string, TrackQuote>>({});
  const [returns, setReturns] = useState<Returns>({});
  const [eps2026, setEps2026] = useState<EpsMap>({});
  const [eps2027, setEps2027] = useState<EpsMap>({});
  const [sync, setSync] = useState<{ done: number; total: number } | null>(null);
  const syncedRef = useRef(false);
  const [mountedAt] = useState(() => Date.now());

  // 記住上次選的區間（只是個人偏好，讀不到就用預設）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RANGE_KEY);
      if (saved && RANGES.some((r) => r.key === saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 只在掛載時讀一次偏好
        setRange(saved as RangeKey);
      }
    } catch { /* ignore */ }
  }, []);
  const selectRange = (key: RangeKey) => {
    setRange(key);
    try { localStorage.setItem(RANGE_KEY, key); } catch { /* ignore */ }
  };

  // 即時報價，30 秒更新
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const json = await (await fetch(`/api/track?tickers=${pcbTickers.join(",")}`)).json();
        if (!cancelled && json.ok) setQuotes(json.data);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // 定錨文章的最新財測 EPS
  useEffect(() => {
    const load = async (year: number, set: (m: EpsMap) => void) => {
      try {
        const json = await (await fetch(`/api/eps-forecasts?forecast_year=${year}&latest=1`)).json();
        if (!json.ok) return;
        const m: EpsMap = {};
        for (const f of json.forecasts) {
          m[f.ticker] = { eps: Number(f.eps), article_date: f.dmao_articles?.article_date ?? null };
        }
        set(m);
      } catch { /* ignore */ }
    };
    load(2026, setEps2026);
    load(2027, setEps2027);
  }, []);

  const loadReturns = useCallback(async (key: RangeKey): Promise<string[]> => {
    try {
      const json = await (await fetch(`/api/chain-returns?range=${key}&tickers=${pcbTickers.join(",")}`)).json();
      if (json.ok) { setReturns(json.returns); return json.stale; }
    } catch { /* ignore */ }
    return [];
  }, []);

  // 區間報酬；資料庫沒有或落後的個股先逐檔補歷史股價（只補一次），補完再重讀
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stale = await loadReturns(range);
      if (cancelled || syncedRef.current || stale.length === 0) return;
      syncedRef.current = true;
      let done = 0;
      setSync({ done: 0, total: stale.length });
      const queue = [...stale];
      const worker = async () => {
        for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
          try { await fetch(`/api/stock-history/${t}?sync=1`); } catch { /* 單檔失敗略過 */ }
          done += 1;
          setSync({ done, total: stale.length });
        }
      };
      await Promise.all(Array.from({ length: 3 }, worker));
      setSync(null);
      if (!cancelled) await loadReturns(range);
    })();
    return () => { cancelled = true; };
  }, [range, loadReturns]);

  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? "";

  const segmentStats = (seg: ChainSegment) => {
    const today = seg.stocks.map((s) => quotes[s.ticker]?.changePercent);
    return {
      today: avg(today),
      period: avg(seg.stocks.map((s) => returns[s.ticker]?.changePercent)),
      up: today.filter((v) => v != null && v > 0).length,
      down: today.filter((v) => v != null && v < 0).length,
    };
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <PageHeader subtitle={sync ? `補齊歷史股價中 ${sync.done}/${sync.total}` : undefined} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "#6b7280", marginRight: 4 }}>區間報酬</span>
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => selectRange(r.key)}
            style={{
              padding: "4px 12px", fontSize: 13, borderRadius: 6, cursor: "pointer",
              border: "1px solid #d1d5db",
              background: range === r.key ? "#1a56db" : "#fff",
              color: range === r.key ? "#fff" : "#374151",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 各環節總覽：等權平均，方便橫向比較 */}
      <div style={{ overflowX: "auto", marginBottom: 28 }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ background: "#1e3a5f", color: "#fff" }}>
              <th style={th}>層級</th>
              <th style={th}>環節</th>
              <th style={{ ...th, textAlign: "right" }}>家數</th>
              <th style={{ ...th, textAlign: "right" }}>今日平均</th>
              <th style={{ ...th, textAlign: "right" }}>{rangeLabel}平均</th>
              <th style={{ ...th, textAlign: "right" }}>今日漲跌家數</th>
            </tr>
          </thead>
          <tbody>
            {pcbChain.flatMap((layer) =>
              layer.segments.map((seg, i) => {
                const st = segmentStats(seg);
                return (
                  <tr key={seg.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ ...td, color: "#6b7280", fontSize: 13 }}>{i === 0 ? layer.layer : ""}</td>
                    <td style={td}><a href={`#${seg.id}`} style={{ color: "#1a56db", textDecoration: "none" }}>{seg.label}</a></td>
                    <td style={{ ...td, ...num }}>{seg.stocks.length}</td>
                    <td style={{ ...td, ...num, color: pctColor(st.today) }}>{fmtPct(st.today)}</td>
                    <td style={{ ...td, ...num, color: pctColor(st.period), fontWeight: 600 }}>{fmtPct(st.period)}</td>
                    <td style={{ ...td, ...num }}>
                      <span style={{ color: "#dc2626" }}>▲ {st.up}</span>
                      <span style={{ color: "#15803d", marginLeft: 8 }}>▼ {st.down}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pcbChain.map((layer) => (
        <section key={layer.layer} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, color: "#1e3a5f", margin: "0 0 12px" }}>{layer.layer}</h2>
          {layer.segments.map((seg) => {
            const st = segmentStats(seg);
            return (
              <div key={seg.id} id={seg.id} style={{ marginBottom: 18, scrollMarginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <strong style={{ fontSize: 15 }}>{seg.label}</strong>
                  <span style={{ fontSize: 13, color: pctColor(st.period) }}>({rangeLabel} {fmtPct(st.period)})</span>
                  {seg.note && <span style={{ fontSize: 12, color: "#9ca3af" }}>{seg.note}</span>}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={{ background: "#f0f4f8" }}>
                        <th style={th}>個股</th>
                        <th style={{ ...th, textAlign: "right" }}>現價</th>
                        <th style={{ ...th, textAlign: "right" }}>今日</th>
                        <th style={{ ...th, textAlign: "right" }}>{rangeLabel}</th>
                        <th style={{ ...th, textAlign: "center" }}>日期</th>
                        <th style={{ ...th, textAlign: "right" }}>2026 EPS</th>
                        <th style={{ ...th, textAlign: "right" }}>2027 EPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seg.stocks.map((s) => {
                        const q = quotes[s.ticker];
                        const price = q?.price ?? null;
                        const r = returns[s.ticker]?.changePercent;
                        const e26 = eps2026[s.ticker];
                        const e27 = eps2027[s.ticker];
                        const epsDate = e26?.article_date ?? e27?.article_date ?? null;
                        return (
                          <tr key={s.ticker} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={td}>
                              <Link href={`/stock/${s.ticker}`} style={{ color: "#1a56db", textDecoration: "none", fontWeight: 500 }}>{s.ticker}</Link>
                              <Link href={`/stock/${s.ticker}`} style={{ marginLeft: 10, color: "inherit", textDecoration: "none" }}>{s.name}</Link>
                            </td>
                            <td style={{ ...td, ...num, fontWeight: "bold" }}>{price ? price.toFixed(2) : "-"}</td>
                            <td style={{ ...td, ...num, color: pctColor(q?.changePercent) }}>{fmtPct(q?.changePercent)}</td>
                            <td style={{ ...td, ...num, color: pctColor(r), fontWeight: 600 }}>{fmtPct(r)}</td>
                            <td style={{ ...td, textAlign: "center", fontSize: 13, color: "#666" }}>
                              {epsDate ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ width: 11, height: 11, borderRadius: "50%", background: dateAgeColor(epsDate, mountedAt), flexShrink: 0 }} />
                                  {formatDate(epsDate)}
                                </span>
                              ) : "-"}
                            </td>
                            <td style={{ ...td, ...num }}><EpsCell eps={e26} price={price} /></td>
                            <td style={{ ...td, ...num }}><EpsCell eps={e27} price={price} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {seg.peers && seg.peers.length > 0 && (
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <span>國外／中國同業：</span>
                    {seg.peers.map((p) => (
                      <span key={p.name} style={{ background: "#f3f4f6", borderRadius: 4, padding: "1px 8px" }}>
                        {p.name}{p.ticker && <span style={{ color: "#9ca3af", marginLeft: 4 }}>{p.ticker}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}

      <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.7 }}>
        平均為環節內個股的等權平均（不按市值加權），沒有報價的個股不列入。EPS 為定錨文章中最新一次的財測，
        EPS 旁的色塊是本益比（現價 ÷ 財測 EPS）；日期是該筆財測的文章日期。南亞同時列在銅箔與銅箔基板兩個環節。
      </p>
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 };
const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", fontWeight: "bold", fontSize: 13, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", whiteSpace: "nowrap" };
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
