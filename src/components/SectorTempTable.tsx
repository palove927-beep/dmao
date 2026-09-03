"use client";

import { useEffect } from "react";

// 原始的「一到三線類股及水溫狀況」對照表。目前固定用這一張，
// 之後換圖只要覆蓋同一個檔名，或改這裡的路徑即可。
const CHART_SRC = "/20260831-PP.png";
const CHART_W = 1318;
const CHART_H = 1020;

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
          background: "#fff", borderRadius: 8, width: "100%", maxWidth: CHART_W,
          boxShadow: "0 20px 50px rgba(0,0,0,.3)", overflow: "hidden",
        }}
      >
        <div style={{
          background: NAVY, color: "#fff", padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <strong style={{ fontSize: 15 }}>一到三線類股及水溫狀況</strong>
          <span style={{ flex: 1 }} />
          <a
            href={CHART_SRC}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ color: "#bfdbfe", fontSize: 12, textDecoration: "none" }}
          >
            原尺寸開啟 ↗
          </a>
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

        {/* 圖比多數螢幕寬，容器內橫向可捲；圖本身維持原比例不變形 */}
        <div style={{ overflowX: "auto", background: "#fff" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={CHART_SRC}
            alt="一到三線類股及水溫狀況對照表"
            width={CHART_W}
            height={CHART_H}
            style={{ display: "block", width: "100%", height: "auto", minWidth: 720 }}
          />
        </div>
      </div>
    </div>
  );
}
