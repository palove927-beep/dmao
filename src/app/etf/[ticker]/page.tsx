"use client";

import { useEffect, useState } from "react";
import { House, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { EtfHolding, EtfInfo } from "@/app/api/etf-holdings/[ticker]/route";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; info: EtfInfo; holdings: EtfHolding[] };

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

const isPlainStock = (t: string) => /^\d{4,6}$/.test(t);

export default function EtfPage() {
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
          const { holdings = [], ...info } = json;
          setState({ status: "ok", info: info as EtfInfo, holdings });
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

  const info = state.status === "ok" ? state.info : null;
  const holdings = state.status === "ok" ? state.holdings : [];
  const totalShares = holdings.reduce((sum, h) => sum + (h.shares ?? 0), 0);

  const rows: [string, string | null][] = info
    ? [
        ["ETF 類別", info.category],
        ["上市日期", info.listedDate],
        ["基金經理公司", info.issuer],
      ]
    : [];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 24px", fontFamily: "sans-serif", background: "#fff", color: "#222", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", margin: "16px 0 0" }}>
        <Link href="/stock" style={{ color: "#1a56db", textDecoration: "none", display: "flex", alignItems: "center" }} title="股票列表">
          <House size={20} strokeWidth={1.75} />
        </Link>
      </div>

      <div style={{ margin: "20px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 26, fontWeight: "bold", margin: 0 }}>{info?.name ?? ticker}</h1>
          {info?.name && <span style={{ fontSize: 15, color: "#6b7280" }}>{ticker}</span>}
        </div>
        {info?.fullName && (
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{info.fullName}</div>
        )}

        {state.status === "loading" && <div style={{ color: "#999", marginTop: 24 }}>載入中...</div>}

        {state.status === "error" && (
          <div style={{ marginTop: 24, padding: "14px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 14, color: "#b91c1c" }}>
            {state.message}
          </div>
        )}

        {state.status === "ok" && info && (
          <>
            {rows.some(([, v]) => v) && (
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "16px 0", fontSize: 13, color: "#374151" }}>
                {rows.map(([label, value]) =>
                  value ? (
                    <span key={label}>
                      <span style={{ color: "#9ca3af" }}>{label}　</span>
                      {value}
                    </span>
                  ) : null,
                )}
              </div>
            )}

            <h2 style={{ fontSize: 17, fontWeight: "bold", margin: "24px 0 12px", color: "#1e3a5f" }}>持股明細</h2>

            {holdings.length === 0 ? (
              <div style={{ padding: "14px 16px", background: "#f8fafc", borderLeft: "3px solid #1a56db", borderRadius: 4, fontSize: 13.5, color: "#374151", lineHeight: 1.8 }}>
                證交所（TWSE）不提供 ETF 成分股，只在商品資訊裡給「申購買回清單（PCF）」的連結，
                實際持股由各投信自行公告。
                {info.pcfUrl ? (
                  <div style={{ marginTop: 10 }}>
                    <a
                      href={info.pcfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#1a56db", fontWeight: 600, textDecoration: "none" }}
                    >
                      前往{info.issuer ?? "投信"}的申購買回清單
                      <ExternalLink size={14} strokeWidth={1.75} />
                    </a>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, color: "#9ca3af" }}>這檔 ETF 沒有提供 PCF 連結。</div>
                )}
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
                  {holdings.map((h, i) => {
                    const weight =
                      h.weight ??
                      (h.shares !== null && totalShares > 0 ? (h.shares / totalShares) * 100 : null);
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
                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {weight !== null ? `${weight.toFixed(2)}%` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {info.issuerSite && (
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 14 }}>
                資料來源：證交所 ETF 商品資訊 ·{" "}
                <a href={info.issuerSite} target="_blank" rel="noopener noreferrer" style={{ color: "#9ca3af" }}>
                  {info.issuer}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
