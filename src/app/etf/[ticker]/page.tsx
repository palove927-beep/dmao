"use client";

import { useEffect, useState } from "react";
import { House } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { EtfHolding } from "@/app/api/etf-holdings/[ticker]/route";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      name: string | null;
      date: string | null;
      source: string;
      holdings: EtfHolding[];
    };

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  color: "#6b7280",
  fontWeight: 600,
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  borderBottom: "1px solid #f3f4f6",
};

// 一般個股（純數字）才連得到 /stock/[ticker]
const isPlainStock = (t: string) => /^\d{4,6}$/.test(t);

export default function EtfHoldingsPage() {
  const { ticker } = useParams() as { ticker: string };
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/etf-holdings/${ticker}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.ok) {
          setState({
            status: "ok",
            name: json.name ?? null,
            date: json.date ?? null,
            source: json.source,
            holdings: json.holdings ?? [],
          });
        } else {
          setState({ status: "error", message: json.error ?? "載入失敗" });
        }
      } catch {
        if (!cancelled) setState({ status: "error", message: "網路錯誤" });
      }
    };
    load();
    return () => { cancelled = true; };
  }, [ticker]);

  const totalShares =
    state.status === "ok"
      ? state.holdings.reduce((sum, h) => sum + (h.shares ?? 0), 0)
      : 0;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", margin: "16px 0 0" }}>
        <Link href="/stock" style={{ color: "#1a56db", textDecoration: "none", display: "flex", alignItems: "center" }} title="股票列表">
          <House size={20} strokeWidth={1.75} />
        </Link>
      </div>

      <div style={{ margin: "20px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 26, fontWeight: "bold", margin: 0 }}>
            {state.status === "ok" && state.name ? state.name : ticker}
          </h1>
          {state.status === "ok" && state.name && (
            <span style={{ fontSize: 15, color: "#6b7280" }}>{ticker}</span>
          )}
          <span style={{ fontSize: 13, color: "#9ca3af" }}>持股明細</span>
        </div>

        {state.status === "loading" && (
          <div style={{ color: "#999", marginTop: 24 }}>載入中...</div>
        )}

        {state.status === "error" && (
          <div style={{ marginTop: 24, padding: "16px 18px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
            <div style={{ fontSize: 14, color: "#b91c1c", marginBottom: 6 }}>{state.message}</div>
            <div style={{ fontSize: 12.5, color: "#7f1d1d", lineHeight: 1.7 }}>
              TWSE 的申購買回清單沒有公開的單一固定端點，這頁會依序嘗試幾條已知路徑。
              打開 <code>/api/etf-holdings/{ticker}?debug=1</code> 可看到每條路徑的實際回應，
              確認哪一條通之後就能把來源收斂成一條。
            </div>
          </div>
        )}

        {state.status === "ok" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", margin: "12px 0 16px", fontSize: 13, color: "#6b7280" }}>
              {state.date && <span>資料日期：{state.date}</span>}
              <span>共 {state.holdings.length} 檔</span>
              <span style={{ color: "#9ca3af" }}>來源：{state.source}</span>
            </div>

            {state.holdings.length === 0 ? (
              <div style={{ color: "#9ca3af", fontSize: 14, padding: "20px 0", borderTop: "1px solid #e5e7eb" }}>
                沒有持股資料
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "center", width: 44 }}>#</th>
                    <th style={{ ...thStyle, textAlign: "left" }}>代號</th>
                    <th style={{ ...thStyle, textAlign: "left" }}>名稱</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>股數</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>佔比</th>
                  </tr>
                </thead>
                <tbody>
                  {state.holdings.map((h, i) => {
                    // 來源沒給佔比時，用股數比例當替代（僅供排序參考，非實際權重）
                    const weight =
                      h.weight ??
                      (h.shares !== null && totalShares > 0
                        ? (h.shares / totalShares) * 100
                        : null);
                    return (
                      <tr key={`${h.ticker}-${i}`} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                        <td style={{ ...tdStyle, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>{i + 1}</td>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>
                          {isPlainStock(h.ticker) ? (
                            <Link href={`/stock/${h.ticker}`} style={{ color: "#1a56db", textDecoration: "none" }}>
                              {h.ticker}
                            </Link>
                          ) : (
                            h.ticker
                          )}
                        </td>
                        <td style={tdStyle}>{h.name || "-"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {h.shares !== null ? h.shares.toLocaleString() : "-"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: h.weight === null ? "#9ca3af" : "#374151" }}>
                          {weight !== null ? `${weight.toFixed(2)}%` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {state.holdings.length > 0 && state.holdings.every((h) => h.weight === null) && (
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
                來源未提供佔比，表中數字由股數比例推算，非實際權重（實際權重需以股數 × 股價計算）。
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
