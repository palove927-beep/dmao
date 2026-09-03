"use client";

import { Fragment, useEffect } from "react";
import { sectorTiers } from "@/lib/sector-groups";

// 原始的「一到三線類股及水溫狀況」對照表。
// 直接用 sector-groups.ts 畫出來而不是放一張圖：資料就是頁面在用的那一份，
// 之後改水溫或增減成分股，這張表會跟著變，不會有圖跟資料對不上的問題。
const TEMP_COLOR: Record<string, string> = { hot: "#dc2626", warm: "#e07b1f" };
const COLD = "#1f2937";
const NAVY = "#1e3a5f";

export default function SectorTempTable({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // 開著的時候鎖住背景捲動
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="一到三線類股及水溫狀況"
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(15,23,42,.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "24px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 8, width: "100%", maxWidth: 1120,
          boxShadow: "0 20px 50px rgba(0,0,0,.3)", overflow: "hidden",
        }}
      >
        <div style={{
          background: NAVY, color: "#fff", padding: "12px 16px",
          display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
        }}>
          <strong style={{ fontSize: 16 }}>一到三線類股及水溫狀況</strong>
          <span style={{ fontSize: 12, opacity: 0.9 }}>
            熱水區：<span style={{ color: "#ff8a8a", fontWeight: 600 }}>紅字</span>、
            溫水區：<span style={{ color: "#ffbe76", fontWeight: 600 }}>橙字</span>、
            冷水區：<span style={{ color: "#e2e8f0", fontWeight: 600 }}>黑字</span>
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            aria-label="關閉"
            style={{
              background: "transparent", border: "none", color: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", padding: 2,
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 }}>
            <tbody>
              {sectorTiers.map((t) => (
                // 陣列元素要有 key，用 <> 包會拿不到，得寫成 Fragment
                <Fragment key={t.tier}>
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        background: "#eef2f7", color: NAVY, fontWeight: "bold",
                        textAlign: "center", padding: "6px 10px",
                        borderTop: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1",
                      }}
                    >
                      {t.tier}
                    </td>
                  </tr>
                  {t.groups.map((g) => (
                    <tr key={g.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th
                        scope="row"
                        style={{
                          width: 132, minWidth: 112, textAlign: "center", fontWeight: 500,
                          padding: "8px 10px", borderRight: "1px solid #e5e7eb",
                          verticalAlign: "middle", whiteSpace: "nowrap",
                        }}
                      >
                        {g.label}
                      </th>
                      <td style={{ padding: "8px 12px", lineHeight: 1.9 }}>
                        {g.stocks.map((s, i) => (
                          <span key={s.ticker}>
                            {i > 0 && <span style={{ color: "#94a3b8" }}>、</span>}
                            <span
                              title={s.ticker}
                              style={{
                                color: TEMP_COLOR[s.temp ?? ""] ?? COLD,
                                fontWeight: s.temp ? 700 : 400,
                              }}
                            >
                              {s.name}
                            </span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
