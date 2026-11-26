"use client";

import { useEffect, useState } from "react";
import { MACRO_INSTRUMENTS, type MacroQuote, type TipBlock } from "@/lib/macro";

// /macro/[id] 走勢圖下方：這個項目相關的非常態規則（目前數值 vs 門檻）、訊號紀錄、課程看點

type SignalLog = { date: string; signal_key: string; level: "alert" | "watch"; title: string; meaning: string };
type Q = Record<string, MacroQuote>;
type RuleStatus = { value: string; hit: boolean } | null;
type Rule = {
  key: string; // 對應 macroSignals 的訊號代號
  level: "alert" | "watch";
  title: string;
  threshold: string;
  slide: string;
  check: (q: Q) => RuleStatus;
};

const f2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

const m1 = (k: string, ok: (v: number) => boolean) => (q: Q): RuleStatus => {
  const v = q[k]?.change1mPercent;
  return v == null ? null : { value: `一個月 ${pct(v)}`, hit: ok(v) };
};

const RULES: Rule[] = [
  { key: "sox_crash", level: "alert", title: "費半急跌", threshold: "一個月 ≤ -15%", slide: "2-1M", check: m1("sox", (v) => v <= -15) },
  {
    key: "sox_below_ma240", level: "watch", title: "費半跌破均線且長期向下", threshold: "現價 < 年線，且年線向下", slide: "2-1B",
    check: (q) => {
      const s = q.sox;
      if (s?.price == null || s.ma240 == null) return null;
      return {
        value: `現價 ${f2(s.price)}／年線 ${f2(s.ma240)}／年線${s.ma240Rising == null ? "方向未知" : s.ma240Rising ? "向上" : "向下"}`,
        hit: s.price < s.ma240 && s.ma240Rising === false,
      };
    },
  },
  { key: "spx_drop", level: "alert", title: "S&P 500 崩跌", threshold: "一個月 ≤ -5%", slide: "2-1M", check: m1("spx", (v) => v <= -5) },
  {
    key: "dxy_up", level: "alert", title: "美元指數急漲", threshold: "一個月 ≥ +5 點", slide: "2-1M",
    check: (q) => { const v = q.dxy?.change1m; return v == null ? null : { value: `一個月 ${v > 0 ? "+" : ""}${v.toFixed(2)} 點`, hit: v >= 5 }; },
  },
  {
    key: "dxy_down", level: "alert", title: "美元指數急跌", threshold: "一個月 ≤ -5 點", slide: "2-1M",
    check: (q) => { const v = q.dxy?.change1m; return v == null ? null : { value: `一個月 ${v > 0 ? "+" : ""}${v.toFixed(2)} 點`, hit: v <= -5 }; },
  },
  { key: "gold_up", level: "watch", title: "黃金急漲", threshold: "一個月 ≥ +5%", slide: "2-1M", check: m1("gold", (v) => v >= 5) },
  { key: "brent_up", level: "alert", title: "油價急漲", threshold: "一個月 ≥ +20%", slide: "2-1M", check: m1("brent", (v) => v >= 20) },
  { key: "brent_down", level: "watch", title: "油價急跌", threshold: "一個月 ≤ -20%", slide: "2-1M", check: m1("brent", (v) => v <= -20) },
  {
    key: "vix_30", level: "alert", title: "VIX 突破 30", threshold: "VIX ≥ 30", slide: "2-1M",
    check: (q) => { const v = q.vix?.price; return v == null ? null : { value: `VIX ${v.toFixed(2)}`, hit: v >= 30 }; },
  },
  {
    key: "yield_inversion", level: "watch", title: "殖利率倒掛", threshold: "2 年期 > 10 年期", slide: "2-1E",
    check: (q) => {
      const y10 = q.us10y?.price, y2 = q.ust2y?.price;
      if (y10 == null || y2 == null) return null;
      return { value: `10 年 ${y10.toFixed(2)}%／2 年 ${y2.toFixed(2)}%／利差 ${(y10 - y2).toFixed(2)}`, hit: y2 > y10 };
    },
  },
  {
    key: "otc_below_2y", level: "watch", title: "櫃買跌破兩年均線、加權仍在其上", threshold: "櫃買 < 兩年線，加權 ≥ 兩年線", slide: "2-1K",
    check: (q) => {
      const t = q.twii, o = q.twoii;
      if (t?.price == null || t.ma480 == null || o?.price == null || o.ma480 == null) return null;
      return {
        value: `櫃買 ${f2(o.price)}／兩年線 ${f2(o.ma480)}；加權 ${f2(t.price)}／兩年線 ${f2(t.ma480)}`,
        hit: o.price < o.ma480 && t.price >= t.ma480,
      };
    },
  },
  {
    key: "tw_both_below_2y", level: "alert", title: "加權與櫃買都跌破兩年均線", threshold: "兩者皆 < 兩年線", slide: "2-1K",
    check: (q) => {
      const t = q.twii, o = q.twoii;
      if (t?.price == null || t.ma480 == null || o?.price == null || o.ma480 == null) return null;
      return {
        value: `櫃買 ${f2(o.price)}／兩年線 ${f2(o.ma480)}；加權 ${f2(t.price)}／兩年線 ${f2(t.ma480)}`,
        hit: o.price < o.ma480 && t.price < t.ma480,
      };
    },
  },
];

// 每個項目相關的規則（台積電 ADR 跟著費半、台幣跟著美元指數）
const RULES_FOR: Record<string, string[]> = {
  sox: ["sox_crash", "sox_below_ma240"],
  tsm: ["sox_crash", "sox_below_ma240"],
  spx: ["spx_drop"],
  dxy: ["dxy_up", "dxy_down"],
  twd: ["dxy_up", "dxy_down"],
  gold: ["gold_up"],
  brent: ["brent_up", "brent_down"],
  vix: ["vix_30"],
  us10y: ["yield_inversion"],
  ust2y: ["yield_inversion"],
  twii: ["otc_below_2y", "tw_both_below_2y"],
  twoii: ["otc_below_2y", "tw_both_below_2y"],
};

function Line({ text }: { text: string }) {
  const m = text.match(/^([^：]{1,16})：(.+)$/);
  return <p>{m ? <><strong>{m[1]}：</strong>{m[2]}</> : text}</p>;
}

function TipBlocks({ blocks }: { blocks: TipBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <div key={i} className="msp-block">
          <div className="msp-btitle">{b.title}<span className="msp-slide">{b.slide}</span></div>
          {Object.keys(b).map((k) => {
            if (k === "lines") return b.lines!.map((l, j) => <Line key={`l${j}`} text={l} />);
            if (k === "table") return (
              <div key="t" className={`msp-tbl${b.table!.rows.every((r) => r[0].length <= 16) ? " bf" : ""}`}>
                <table>
                  <thead><tr>{b.table!.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{b.table!.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
            return null;
          })}
        </div>
      ))}
    </>
  );
}

export default function MacroSignalPanel({ macroKey }: { macroKey: string }) {
  const inst = MACRO_INSTRUMENTS.find((m) => m.key === macroKey);
  const [data, setData] = useState<Q | null>(null);
  const [log, setLog] = useState<SignalLog[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await (await fetch("/api/macro")).json();
        if (cancelled) return;
        if (json.ok) { setData(json.data); setLog(json.signals ?? []); } else setError(true);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!inst) return null;
  const keys = RULES_FOR[macroKey] ?? [];
  const rules = RULES.filter((r) => keys.includes(r.key));
  const history = log.filter((s) => keys.includes(s.signal_key));
  const byDate = new Map<string, SignalLog[]>();
  for (const s of history) (byDate.get(s.date) ?? byDate.set(s.date, []).get(s.date)!).push(s);

  return (
    <div className="msp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <h2 className="msp-h2">非常態訊號</h2>

      <div className="msp-sub">目前檢查狀態</div>
      {rules.length === 0 ? (
        <div className="msp-note">2-1 速查表沒有針對「{inst.label}」設定非常態門檻，可參考下方課程看點觀察趨勢與系統性。</div>
      ) : (
        <div className="msp-tbl bf">
          <table>
            <thead><tr><th>規則</th><th>門檻</th><th>目前</th><th>狀態</th></tr></thead>
            <tbody>
              {rules.map((r) => {
                const st = data ? r.check(data) : null;
                return (
                  <tr key={r.key}>
                    <td>{r.title}<span className="msp-slide">{r.slide}</span></td>
                    <td>{r.threshold}</td>
                    <td>{st ? st.value : data ? "資料不足" : error ? "讀取失敗" : "載入中…"}</td>
                    <td>
                      {st == null ? "-" : st.hit
                        ? <span className={`msp-pill ${r.level}`}>{r.level === "alert" ? "🔴 觸發" : "🟡 觸發"}</span>
                        : <span className="msp-pill ok">未觸發</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rules.length > 0 && (
        <>
          <div className="msp-sub">訊號紀錄（近一年）</div>
          {byDate.size === 0 ? (
            <div className="msp-note">{data ? "近一年沒有觸發相關訊號。" : "載入中…"}</div>
          ) : (
            <div className="msp-log">
              {[...byDate.entries()].map(([d, items]) => (
                <div key={d} className="msp-log-row">
                  <span className="msp-log-date">{d}</span>
                  <span className="msp-log-items">
                    {items.map((s) => <span key={s.signal_key} className={`msp-pill ${s.level}`} title={s.meaning}>{s.title}</span>)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {inst.tip && (
        <>
          <div className="msp-sub">課程看點</div>
          <TipBlocks blocks={inst.tip} />
        </>
      )}
    </div>
  );
}

const CSS = `
.msp { margin-top:28px; border-top:1px solid #e5e7eb; padding-top:20px; font-size:14px; line-height:1.7; color:#1f2937; }
.msp-h2 { font-size:18px; color:#1e3a5f; margin:0 0 4px; }
.msp-sub { font-weight:700; color:#1e3a5f; margin:16px 0 8px; padding-left:10px; border-left:4px solid #1a56db; line-height:1.4; }
.msp-note { font-size:13px; color:#6b7280; }
.msp-slide { font-size:11px; font-weight:600; color:#9ca3af; border:1px solid #e5e7eb; border-radius:6px; padding:0 6px; margin-left:6px; }
.msp-tbl { overflow-x:auto; margin:8px 0 12px; border:1px solid #e5e7eb; border-radius:10px; }
.msp-tbl table { width:100%; border-collapse:collapse; min-width:520px; }
.msp-tbl th { background:#f1f5f9; color:#1e3a5f; text-align:left; font-size:13px; padding:8px 12px; white-space:nowrap; }
.msp-tbl td { padding:8px 12px; border-top:1px solid #f1f5f9; vertical-align:top; }
.msp-tbl tbody tr:nth-child(even) td { background:#fafbfc; }
.msp-tbl.bf td:first-child { font-weight:600; color:#111827; }
.msp-pill { display:inline-block; font-size:12px; border-radius:999px; padding:1px 10px; white-space:nowrap; font-weight:600; }
.msp-pill.alert { background:#fee2e2; color:#991b1b; }
.msp-pill.watch { background:#fef3c7; color:#92400e; }
.msp-pill.ok { background:#f3f4f6; color:#6b7280; }
.msp-log { border:1px solid #e5e7eb; border-radius:10px; max-height:320px; overflow-y:auto; }
.msp-log-row { display:flex; gap:12px; padding:7px 12px; border-top:1px solid #f1f5f9; align-items:flex-start; }
.msp-log-row:first-child { border-top:none; }
.msp-log-date { font-size:13px; font-weight:700; color:#374151; font-variant-numeric:tabular-nums; flex-shrink:0; width:88px; }
.msp-log-items { display:flex; flex-wrap:wrap; gap:6px; }
.msp-block { margin:10px 0 14px; }
.msp-btitle { font-weight:700; color:#1e3a5f; margin-bottom:4px; }
.msp p { margin:4px 0; }
`;
