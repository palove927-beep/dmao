"use client";

import { useEffect, useState } from "react";
import { MACRO_INSTRUMENTS, macroSignals, vixZone, type MacroGroup, type MacroQuote } from "@/lib/macro";

type SignalLog = { date: string; signal_key: string; level: "alert" | "watch"; title: string; meaning: string };

// 2-1 總經：國際股市與金融市場的即時儀表板，並依課程門檻標出非常態訊號
const GROUPS: { key: MacroGroup; title: string }[] = [
  { key: "stocks", title: "國際股市（五層連動）" },
  { key: "taiwan", title: "台股內部" },
  { key: "markets", title: "股市以外的五個金融市場訊號" },
];

const pctColor = (v: number | null | undefined) =>
  v == null || v === 0 ? "#6b7280" : v > 0 ? "#dc2626" : "#15803d";
const fmtPct = (v: number | null | undefined) =>
  v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

// 「?」說明：hover 或點一下（手機）顯示，覆蓋在卡片上方往下展開，不會超出畫面
function Help({ lines, title }: { lines: string[]; title: string }) {
  return (
    <span className="mdb-help" tabIndex={0} aria-label={`${title}的看點`}>
      ?
      <span className="mdb-tip" role="tooltip">
        <b>{title}</b>
        {lines.map((l) => <span key={l}>{l}</span>)}
      </span>
    </span>
  );
}

const SIGNAL_RULES = [
  "費半一個月急跌 > 15%：台積電及電子族群承壓，隔天台股大機率跟跌",
  "S&P 500 一個月下跌 > 5%：外資撤離新興市場、黃金上漲；台股外資賣壓",
  "美元指數一個月急漲 > 5 點：台幣貶值；出口商匯兌受益，外資需賣台股",
  "美元指數一個月急跌 > 5 點：台幣升值；外資買台股，出口商匯兌壓力",
  "黃金一個月急漲 > 5%：市場恐慌；觀察 VIX，評估是否進入非常態",
  "油價一個月急漲或急跌 > 20%：通膨與升降息預期改變",
  "VIX ≥ 30：全球多個市場觀察非常態；準備資金，找尋買點",
  "另外：費半跌破年線且年線向下、2 年期高於 10 年期（倒掛）、櫃買或加權跌破兩年均線",
];

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 100, h = 28;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 28, display: "block" }} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function MacroDashboard() {
  const [data, setData] = useState<Record<string, MacroQuote> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [log, setLog] = useState<SignalLog[]>([]);
  const [source, setSource] = useState<"supabase" | "yahoo" | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const json = await (await fetch("/api/macro")).json();
        if (cancelled) return;
        if (json.ok) {
          setData(json.data); setUpdatedAt(json.updatedAt); setError(false);
          setLog(json.signals ?? []); setSource(json.source ?? null);
        }
        else setError(true);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const signals = data ? macroSignals(data) : [];
  const vix = data?.vix?.price ?? null;
  const zone = vixZone(vix);
  const y10 = data?.us10y?.price ?? null;
  const y2 = data?.ust2y?.price ?? null;

  return (
    <div className="mdb">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mdb-head">
        <div>
          <div className="mdb-title">即時市場儀表板</div>
          <div className="mdb-sub">
            {updatedAt ? `更新於 ${new Date(updatedAt).toLocaleString("zh-TW")}・每 5 分鐘自動更新` : error ? "讀取失敗" : "載入中…"}
          </div>
        </div>
        {zone && (
          <div className="mdb-vix" style={{ borderColor: zone.color }}>
            <span className="mdb-dot" style={{ background: zone.color }} />
            VIX {vix!.toFixed(2)}・{zone.label}
            <div className="mdb-vix-sub">{zone.meaning}</div>
          </div>
        )}
      </div>

      {data && (
        <div className="mdb-signals">
          <div className="mdb-gtitle mdb-gtitle-help">非常態訊號檢查 <Help title="判斷門檻（2-1 全球市場連動速查表）" lines={SIGNAL_RULES} /></div>
          {signals.length === 0 ? (
            <div className="mdb-ok">目前沒有觸發 2-1 速查表中的非常態門檻。</div>
          ) : (
            <ul>
              {signals.map((s) => (
                <li key={s.title} className={s.level}>
                  <b>{s.title}</b>
                  <span>{s.meaning}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mdb-note">「急跌／急漲」以約一個月（21 個交易日）的變化衡量；美元指數看點數，其餘看百分比。</div>
        </div>
      )}

      {GROUPS.map((g) => (
        <div key={g.key}>
          <div className="mdb-gtitle">{g.title}</div>
          <div className="mdb-grid">
            {MACRO_INSTRUMENTS.filter((m) => m.group === g.key).map((m) => {
              const q = data?.[m.key];
              const digits = m.digits ?? 2;
              const up1m = q?.change1mPercent ?? null;
              return (
                <div key={m.key} className="mdb-card">
                  <div className="mdb-card-top">
                    <span className="mdb-name">{m.label}</span>
                    {m.layer && <span className="mdb-layer">{m.layer}</span>}
                    {m.tip && <Help title={m.label} lines={m.tip} />}
                  </div>
                  <div className="mdb-price">
                    {q?.price != null ? q.price.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "-"}
                    {q?.price != null && m.suffix}
                  </div>
                  <div className="mdb-chg">
                    <span style={{ color: pctColor(q?.changePercent) }}>今日 {fmtPct(q?.changePercent)}</span>
                    <span style={{ color: pctColor(up1m) }}>月 {m.key === "dxy" && q?.change1m != null ? `${q.change1m > 0 ? "+" : ""}${q.change1m.toFixed(2)} 點` : fmtPct(up1m)}</span>
                  </div>
                  <Spark data={q?.spark ?? []} color={pctColor(up1m)} />
                  {q?.ma240 != null && q.price != null && (m.group !== "markets") && (
                    <div className="mdb-ma">
                      {q.price >= q.ma240 ? "年線之上" : "年線之下"}
                      {q.ma240Rising != null && `・年線${q.ma240Rising ? "向上" : "向下"}`}
                      {q.ma480 != null && `・${q.price >= q.ma480 ? "兩年線之上" : "兩年線之下"}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {g.key === "markets" && y10 != null && y2 != null && (
            <div className="mdb-note">
              10 年－2 年利差：<b style={{ color: y10 - y2 < 0 ? "#dc2626" : "#15803d" }}>{(y10 - y2).toFixed(3)}%</b>
              {y10 - y2 < 0 ? "（倒掛）" : "（正斜率）"}；美債殖利率 2 年期取自美國財政部每日殖利率曲線。
            </div>
          )}
        </div>
      ))}
      <div className="mdb-gtitle">訊號紀錄（近一年）</div>
      {source === "yahoo" ? (
        <div className="mdb-note">尚未連上資料庫（請先在 Supabase 建立 macro_* 資料表），目前僅顯示即時數據，沒有訊號紀錄。</div>
      ) : (() => {
        const byDate = new Map<string, SignalLog[]>();
        for (const s of log) (byDate.get(s.date) ?? byDate.set(s.date, []).get(s.date)!).push(s);
        const dates = [...byDate.keys()];
        if (dates.length === 0) return <div className="mdb-note">{data ? "近一年沒有觸發任何非常態訊號。" : "載入中…"}</div>;
        const shown = showAll ? dates : dates.slice(0, 15);
        return (
          <>
            <div className="mdb-log">
              {shown.map((d) => (
                <div key={d} className="mdb-log-row">
                  <div className="mdb-log-date">{d}</div>
                  <div className="mdb-log-items">
                    {byDate.get(d)!.map((s) => (
                      <span key={s.signal_key} className={`mdb-pill ${s.level}`} title={s.meaning}>{s.title}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {dates.length > 15 && (
              <button className="mdb-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "收合" : `顯示全部 ${dates.length} 天`}
              </button>
            )}
          </>
        );
      })()}

      <div className="mdb-note">資料來源：Yahoo Finance，每日收盤存於資料庫，延遲報價，僅供參考；台股慣例紅漲綠跌。</div>
    </div>
  );
}

const CSS = `
.mdb { border:1px solid #dbeafe; background:linear-gradient(180deg,#f8fbff,#fff); border-radius:12px; padding:16px; margin:6px 0 20px; }
.mdb-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
.mdb-title { font-weight:800; color:#1e3a5f; font-size:16px; }
.mdb-sub { font-size:12px; color:#6b7280; }
.mdb-vix { border:2px solid; border-radius:10px; padding:6px 12px; font-weight:700; font-size:14px; background:#fff; }
.mdb-vix-sub { font-weight:400; font-size:12px; color:#4b5563; }
.mdb-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; }
.mdb-gtitle { font-size:13px; font-weight:700; color:#1e3a5f; margin:14px 0 8px; }
.mdb-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:10px; }
.mdb-card { position:relative; background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; }
.mdb-card-top { display:flex; align-items:center; gap:6px; }
.mdb-card-top .mdb-name { flex:1; min-width:0; }
.mdb-name { font-size:13px; font-weight:600; color:#374151; }
.mdb-layer { font-size:11px; color:#1a56db; background:#eff6ff; border-radius:999px; padding:0 7px; white-space:nowrap; }
.mdb-price { font-size:18px; font-weight:800; font-variant-numeric:tabular-nums; margin:2px 0; }
.mdb-chg { display:flex; justify-content:space-between; gap:6px; font-size:12px; font-weight:600; font-variant-numeric:tabular-nums; margin-bottom:4px; }
.mdb-ma { font-size:11px; color:#6b7280; margin-top:4px; }
.mdb-signals ul { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.mdb-signals li { border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:2px; font-size:14px; }
.mdb-signals li.alert { background:#fee2e2; border:1px solid #fecaca; }
.mdb-signals li.watch { background:#fef3c7; border:1px solid #fde68a; }
.mdb-signals li span { font-size:13px; color:#374151; }
.mdb-ok { background:#dcfce7; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; font-size:14px; color:#166534; }
.mdb-note { font-size:12px; color:#6b7280; margin-top:8px; }
.mdb-help { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; margin-left:5px;
  border-radius:50%; background:#e5e7eb; color:#4b5563; font-size:11px; font-weight:800; cursor:help; vertical-align:1px; outline:none; flex-shrink:0; }
.mdb-help:hover, .mdb-help:focus { background:#1a56db; color:#fff; }
.mdb-tip { display:none; position:absolute; left:0; right:0; top:0; z-index:20; min-height:100%; box-sizing:border-box;
  background:#fff; color:#1f2937; border:1px solid #93c5fd; border-radius:10px; padding:10px 12px;
  box-shadow:0 8px 24px rgba(15,23,42,.18); font-size:12px; font-weight:400; line-height:1.6; text-align:left; cursor:default; }
.mdb-tip b { display:block; font-size:13px; color:#1e3a5f; margin-bottom:4px; }
.mdb-tip span { display:block; margin-top:4px; }
.mdb-help:hover .mdb-tip, .mdb-help:focus .mdb-tip, .mdb-help:focus-within .mdb-tip { display:block; }
.mdb-signals { position:relative; }
.mdb-gtitle-help { display:flex; align-items:center; justify-content:space-between; }
.mdb-log { border:1px solid #e5e7eb; border-radius:10px; background:#fff; }
.mdb-log-row { display:flex; gap:12px; padding:8px 12px; border-top:1px solid #f1f5f9; align-items:flex-start; }
.mdb-log-row:first-child { border-top:none; }
.mdb-log-date { font-size:13px; font-weight:700; color:#374151; font-variant-numeric:tabular-nums; flex-shrink:0; width:88px; }
.mdb-log-items { display:flex; flex-wrap:wrap; gap:6px; }
.mdb-pill { font-size:12px; border-radius:999px; padding:2px 10px; }
.mdb-pill.alert { background:#fee2e2; color:#991b1b; }
.mdb-pill.watch { background:#fef3c7; color:#92400e; }
.mdb-more { margin-top:8px; font-size:13px; border:1px solid #d1d5db; background:#fff; border-radius:6px; padding:4px 12px; cursor:pointer; }
`;
