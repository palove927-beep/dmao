"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RANGES, type RangeKey } from "@/lib/sector-range";

type SectorStockRow = {
  ticker: string;
  name: string;
  market: "tpex" | null;
  temp: "hot" | "warm" | null;
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
  series: (number | null)[];
  stocks: SectorStockRow[];
};

type ApiResult = {
  ok: boolean;
  range: RangeKey;
  baseDate: string;
  asOf: string | null;
  baseAsOf: string | null;
  hasSeries: boolean;
  sampling: "daily" | "weekly";
  dates: string[];
  tiers: { tier: string; groups: SectorGroupRow[] }[];
  missing: { ticker: string; name: string }[];
  stale: string[];
};

type SortKey = "change" | "table";

const UP = "#dc2626";
const DOWN = "#15803d";
const FLAT = "#6b7280";

// 一到三線各自的識別色。刻意避開紅／綠，才不會跟漲跌幅的顏色打架
const TIER_STYLE: Record<string, { bg: string; fg: string; bar: string }> = {
  一線: { bg: "#dbeafe", fg: "#1e40af", bar: "#3b82f6" },
  二線: { bg: "#ede9fe", fg: "#5b21b6", bar: "#8b5cf6" },
  三線: { bg: "#e2e8f0", fg: "#475569", bar: "#94a3b8" },
  個股: { bg: "#cffafe", fg: "#0e7490", bar: "#06b6d4" },
};
const tierStyle = (t: string) => TIER_STYLE[t] ?? { bg: "#f1f5f9", fg: "#475569", bar: "#cbd5e1" };

// 圖表的水溫：熱水區紅字、溫水區黃(橙)字、冷水區黑字
const TEMP_COLOR: Record<string, string> = { hot: "#dc2626", warm: "#e07b1f" };
const tempColor = (t: string | null) => (t ? TEMP_COLOR[t] ?? "#1f2937" : "#1f2937");

function changeColor(v: number | null): string {
  if (v === null || v === 0) return FLAT;
  return v > 0 ? UP : DOWN;
}

function formatPercent(v: number | null): string {
  if (v === null) return "-";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const shortDate = (d: string) => d.slice(5).replace("-", "/");

// 個股的基準日跟多數人不同時，把日期標出來，免得看不出平均混到了舊價
function StaleDate({ date, reference }: { date: string | null; reference: string | null }) {
  if (!date || !reference || date === reference) return null;
  return (
    <span style={{ marginLeft: 5, fontSize: 11, color: "#b45309" }}>{shortDate(date)}</span>
  );
}

// 族群走勢：起算日到最新收盤的累積漲跌幅曲線。
// 所有族群共用同一個 y 軸範圍（domain），線的陡峭程度才能互相比較——
// 各自縮放的話，漲 1% 和漲 30% 會畫成一樣的形狀。
const SPARK_W = 150;
const SPARK_H = 26;

function Sparkline({
  series,
  dates,
  domain,
}: {
  series: (number | null)[];
  dates: string[];
  domain: [number, number];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const points = series
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);

  if (points.length < 2) {
    return <div style={{ height: SPARK_H }} aria-hidden />;
  }

  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const x = (i: number) => (series.length < 2 ? 0 : (i / (series.length - 1)) * SPARK_W);
  const y = (v: number) => SPARK_H - ((v - lo) / span) * SPARK_H;

  const last = points[points.length - 1].v;
  const color = changeColor(last);
  const d = points.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const showZero = 0 >= lo && 0 <= hi;

  // 滑鼠位置換算成最近的取樣點。svg 用 preserveAspectRatio="none" 撐滿容器，
  // 所以要拿實際的 client 寬度來換算，不能用 viewBox 的座標。
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const raw = Math.round(ratio * (series.length - 1));
    // 該點沒有值（當天全員停牌）就往兩側找最近的有值點
    let best: number | null = null;
    let bestDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.i - raw);
      if (dist < bestDist) { bestDist = dist; best = p.i; }
    }
    setHover(best);
  };

  const hv = hover === null ? null : series[hover];
  const hoverDate = hover === null ? null : dates[hover];

  return (
    <div
      style={{ position: "relative" }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        width="100%"
        height={SPARK_H}
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
        aria-hidden
      >
        {showZero && (
          <line x1={0} y1={zeroY} x2={SPARK_W} y2={zeroY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        )}
        <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && hv !== null && hv !== undefined && (
          <>
            <line
              x1={x(hover)} y1={0} x2={x(hover)} y2={SPARK_H}
              stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(hover)} cy={y(hv)} r={3} fill="#fff" stroke={changeColor(hv)} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
        <circle cx={x(points[points.length - 1].i)} cy={y(last)} r={2} fill={color} vectorEffect="non-scaling-stroke" />
      </svg>

      {hover !== null && hv !== null && hv !== undefined && (
        <div
          style={{
            position: "absolute",
            // 往上移出圖外才不會蓋住線，但不能超過族群列的 10px 上留白——
            // 外層清單是 overflow:hidden，超出去第一列的提示框會被裁掉
            top: -10,
            // 貼著游標但夾在容器內，最左最右的點才不會被切掉
            left: `${Math.min(88, Math.max(12, (hover / Math.max(1, series.length - 1)) * 100))}%`,
            transform: "translateX(-50%)",
            padding: "1px 6px",
            borderRadius: 4,
            background: "rgba(15,23,42,.88)",
            color: "#fff",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {hoverDate ? `${hoverDate.slice(5).replace("-", "/")} ` : ""}
          {formatPercent(hv)}
        </div>
      )}
    </div>
  );
}

export default function SectorsPage() {
  // 預設兩週：屬於日線取樣，走勢圖點數夠密、讀取量也還輕
  const [range, setRange] = useState<RangeKey>("2w");
  const [tier, setTier] = useState<string>("全部");
  const [sort, setSort] = useState<SortKey>("change");
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sync, setSync] = useState<{ done: number; total: number } | null>(null);
  // 同一次瀏覽只自動補一輪，避免補完重抓後又觸發下一輪
  const syncedRef = useRef(false);

  // 換區間時的 loading／error 重設放在點擊當下，effect 只負責抓資料，
  // 否則會在 effect 內同步 setState、觸發連鎖 render
  const selectRange = (key: RangeKey) => {
    if (key === range) return;
    setLoading(true);
    setError(null);
    setRange(key);
  };

  const load = useCallback(async (key: RangeKey): Promise<ApiResult | null> => {
    try {
      const res = await fetch(`/api/sector-returns?range=${key}`);
      const json: ApiResult & { error?: string } = await res.json();
      if (json.ok) { setData(json); return json; }
      setError(json.error ?? "讀取失敗");
    } catch {
      setError("讀取失敗");
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  // 資料落後的個股逐檔補。/api/stock-history 是增量的——它從 DB 最新
  // 日期往後抓，所以隔一週才開也會一次補齊整週，不是只補一天。
  // 這裡由瀏覽器逐檔發請求而不是在 server 背景跑：serverless function
  // 回應送出後就會被回收，背景工作不保證跑得完。
  const backfill = useCallback(async (tickers: string[]) => {
    const CONCURRENCY = 3; // 外部行情站對連線數敏感，別開太大
    let done = 0;
    setSync({ done: 0, total: tickers.length });
    const queue = [...tickers];
    const worker = async () => {
      // 明確比對 undefined：用真假值判斷的話，代碼是空字串就會整條佇列提早停
      for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
        try {
          await fetch(`/api/stock-history/${t}?sync=1`);
        } catch {
          // 單檔失敗就跳過，不要擋住其他檔
        }
        done += 1;
        setSync({ done, total: tickers.length });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setSync(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const json = await load(range);
      if (cancelled || !json) return;
      if (syncedRef.current || json.stale.length === 0) return;
      syncedRef.current = true;
      await backfill(json.stale);
      if (!cancelled) await load(range);
    })();
    return () => { cancelled = true; };
  }, [range, load, backfill]);

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

  // 目前顯示中的族群，所有走勢點的最小／最大值，當作共用 y 軸範圍
  const domain = useMemo<[number, number]>(() => {
    const values = groups.flatMap((g) => g.series).filter((v): v is number => v !== null);
    if (values.length === 0) return [-1, 1];
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    const pad = (hi - lo) * 0.08 || 1;
    return [lo - pad, hi + pad];
  }, [groups]);

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
        subtitle={data?.asOf ? `收盤 ${data.baseAsOf ?? data.baseDate} → ${data.asOf}` : undefined}
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
          <button
            key={t}
            onClick={() => setTier(t)}
            style={{
              ...btn(tier === t),
              padding: "5px 12px",
              fontSize: 12,
              ...(t === "全部" ? {} : {
                borderColor: tierStyle(t).bar,
                background: tier === t ? tierStyle(t).bar : "#fff",
                color: tier === t ? "#fff" : tierStyle(t).fg,
              }),
            }}
          >
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

      {sync && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
          padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 6, fontSize: 13, color: "#1e40af",
        }}>
          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
          正在補抓落後的股價 {sync.done}/{sync.total}⋯（可繼續操作，補完會自動更新）
          <span style={{ flex: 1 }} />
          <span style={{ width: 120, height: 6, background: "#dbeafe", borderRadius: 3, overflow: "hidden" }}>
            <span style={{
              display: "block", height: "100%", borderRadius: 3, background: "#3b82f6",
              width: `${sync.total ? (sync.done / sync.total) * 100 : 0}%`, transition: "width .2s",
            }} />
          </span>
        </div>
      )}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>}
      {error && <div style={{ padding: 16, background: "#fef2f2", color: "#b91c1c", borderRadius: 6 }}>{error}</div>}

      {!loading && !error && data && (
        <>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "flex-end",
            gap: 6, marginBottom: 6, fontSize: 12, color: "#94a3b8",
          }}>
            走勢取樣：
            <strong style={{ color: "#475569", fontWeight: 600 }}>
              {data.sampling === "daily" ? "日線（每個交易日）" : "週線（每週最後一個交易日）"}
            </strong>
            <span>· {data.dates.length} 點</span>
          </div>

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
                      gridTemplateColumns: "52px minmax(96px, 1fr) 1.5fr 84px 56px",
                      alignItems: "center", gap: 10, padding: "10px 12px",
                      background: isOpen ? "#eff6ff" : "#fff",
                      border: "none", borderLeft: `3px solid ${tierStyle(g.tier).bar}`,
                      cursor: "pointer", textAlign: "left", font: "inherit",
                    }}
                  >
                    <span style={{
                      fontSize: 11, borderRadius: 4, padding: "2px 6px", textAlign: "center",
                      color: tierStyle(g.tier).fg, background: tierStyle(g.tier).bg, fontWeight: 600,
                    }}>
                      {g.tier}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 4 }}>
                      <ChevronRight
                        size={14}
                        style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0, color: "#94a3b8" }}
                      />
                      {g.label}
                    </span>
                    <Sparkline series={g.series} dates={data.dates} domain={domain} />
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
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500 }}>起算收盤</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500 }}>最新收盤</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500 }}>漲跌幅</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* 排序跟著上方的切換：依表格順序時，成分股也維持原表格由左到右的順序 */}
                          {(sort === "table"
                            ? g.stocks
                            : [...g.stocks].sort((a, b) => {
                                if (a.changePercent === null) return b.changePercent === null ? 0 : 1;
                                if (b.changePercent === null) return -1;
                                return b.changePercent - a.changePercent;
                              })
                          ).map((s) => (
                              <tr key={s.ticker} style={{ borderTop: "1px solid #e5e7eb" }}>
                                <td style={{ padding: "6px 8px" }}>
                                  <a href={`/stock/${s.ticker}`} style={{ color: "#1a56db", textDecoration: "none" }}>
                                    {s.ticker}
                                  </a>
                                  <span style={{ marginLeft: 10, color: tempColor(s.temp), fontWeight: s.temp ? 600 : 400 }}>
                                    {s.name}
                                  </span>
                                  {s.market === "tpex" && (
                                    <span style={{ marginLeft: 6, fontSize: 11, color: "#94a3b8" }}>櫃</span>
                                  )}
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "right", color: "#64748b", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                  {s.basePrice?.toFixed(2) ?? "-"}
                                  <StaleDate date={s.baseDate} reference={data.baseAsOf} />
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                  {s.price?.toFixed(2) ?? "-"}
                                  <StaleDate date={s.priceDate} reference={data.asOf} />
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
            表中價格為<strong>日收盤價</strong>，不是盤中即時報價 —— 盤中看到的最新收盤通常是昨收。
            個股的基準日與多數人不同時，會在價格旁以
            <span style={{ color: "#b45309" }}>橘色日期</span>標出。
            <br />
            個股名稱顏色沿用原表格的水溫：
            <span style={{ color: TEMP_COLOR.hot, fontWeight: 600 }}>熱水區</span>、
            <span style={{ color: TEMP_COLOR.warm, fontWeight: 600 }}>溫水區</span>、
            <span style={{ color: "#1f2937" }}>冷水區</span>，與即時漲跌幅無關。
            <br />
            走勢是起算日到最新收盤的累積漲跌幅，所有族群共用同一個縱軸範圍，
            線的陡峭程度可以直接互相比較。
            {data.sampling === "weekly" &&
              "一個月以上的區間改用週線取樣（每週最後一個交易日），讀取量約降到四分之一，形狀幾乎不受影響。"}
            <br />
            族群漲幅為成分股漲幅的等權平均（未按市值加權）。右側 n/m 是有價格資料的檔數／成分股總數。
            {data.missing.length > 0 && !sync && (
              <>
                <br />
                <RefreshCw size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                仍有 {data.missing.length} 檔取不到價格（可能是剛掛牌、長期停牌，或外部行情站暫時失敗）。
                重新整理會再試一次；要一次補齊也可執行
                <code style={{ margin: "0 4px", background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 }}>
                  /api/stock-refresh-all?source=sectors
                </code>
                。
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
