"use client";

import { useEffect, useState } from "react";
import { MACRO_INSTRUMENTS, macroSignals, vixZone, type MacroGroup, type MacroQuote } from "@/lib/macro";

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const json = await (await fetch("/api/macro")).json();
        if (cancelled) return;
        if (json.ok) { setData(json.data); setUpdatedAt(json.updatedAt); setError(false); }
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
  const y2 = data?.us2y?.price ?? null;

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
          <div className="mdb-gtitle">非常態訊號檢查</div>
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
              {y10 - y2 < 0 ? "（倒掛）" : "（正斜率）"}；美債 2 年期以 CBOT 2 年殖利率期貨代表。
            </div>
          )}
        </div>
      ))}
      <div className="mdb-note">資料來源：Yahoo Finance，延遲報價，僅供參考；台股慣例紅漲綠跌。</div>
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
.mdb-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
.mdb-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; }
.mdb-card-top { display:flex; justify-content:space-between; align-items:center; gap:6px; }
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
`;
