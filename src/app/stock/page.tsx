"use client";

import { useEffect, useState, useCallback } from "react";
import { categories } from "@/lib/stocks";
import type { StockPrice } from "@/app/api/stock/route";

type PriceMap = Record<string, StockPrice>;

export default function StockPage() {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [error, setError] = useState<string>("");

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/stock");
      const json = await res.json();
      if (json.ok) {
        setPrices(json.data);
        setUpdatedAt(json.updatedAt);
        setError("");
      } else {
        setError("取得股價失敗");
      }
    } catch {
      setError("網路連線錯誤");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const formatPrice = (p: number | null) => {
    if (p === null) return "-";
    return p.toFixed(2);
  };

  const formatChange = (change: number | null, pct: number | null) => {
    if (change === null) return "-";
    const sign = change > 0 ? "+" : "";
    const pctStr = pct !== null ? ` (${sign}${pct.toFixed(2)}%)` : "";
    return `${sign}${change.toFixed(2)}${pctStr}`;
  };

  const changeColor = (change: number | null) => {
    if (change === null) return "text-zinc-500";
    if (change > 0) return "text-red-600 dark:text-red-400";
    if (change < 0) return "text-green-600 dark:text-green-400";
    return "text-zinc-500";
  };

  const changeBg = (change: number | null) => {
    if (change === null) return "";
    if (change > 0) return "bg-red-50 dark:bg-red-950/30";
    if (change < 0) return "bg-green-50 dark:bg-green-950/30";
    return "";
  };

  // Check if a ticker is a Taiwan stock (numeric)
  const isTwStock = (ticker: string) => /^\d+$/.test(ticker);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <a
            href="/"
            className="text-xl font-bold text-black dark:text-white"
          >
            DMAO
          </a>
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
              股票報價
            </h1>
            <button
              onClick={() => {
                setLoading(true);
                fetchPrices();
              }}
              disabled={loading}
              className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {loading ? "更新中..." : "重新整理"}
            </button>
          </div>
        </div>
        {updatedAt && (
          <div className="border-t border-zinc-100 bg-zinc-50 px-6 py-1 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
            最後更新：{new Date(updatedAt).toLocaleString("zh-TW")}
            {error && (
              <span className="ml-4 text-red-500">{error}</span>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {loading && Object.keys(prices).length === 0 ? (
          <div className="py-20 text-center text-zinc-500">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            載入股價中...
          </div>
        ) : (
          <div className="grid gap-5">
            {categories.map((cat) => (
              <section
                key={cat.id}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="border-b border-zinc-200 bg-zinc-100 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    <span className="mr-2 inline-block rounded bg-black px-2 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-black">
                      {cat.id}
                    </span>
                    {cat.label}
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      ({cat.stocks.length})
                    </span>
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        <th className="px-4 py-2 font-medium">代碼</th>
                        <th className="px-4 py-2 font-medium">股號</th>
                        <th className="px-4 py-2 font-medium">名稱</th>
                        <th className="px-4 py-2 text-right font-medium">
                          股價
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          漲跌
                        </th>
                        <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                          開盤
                        </th>
                        <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                          最高
                        </th>
                        <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                          最低
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.stocks.map((stock) => {
                        const p = prices[stock.ticker];
                        const hasTwData = isTwStock(stock.ticker) && p;
                        return (
                          <tr
                            key={stock.code}
                            className={`border-b border-zinc-50 transition-colors hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900 ${hasTwData ? changeBg(p.change) : ""}`}
                          >
                            <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                              {stock.code}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs font-semibold text-black dark:text-white">
                              {stock.ticker}
                            </td>
                            <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                              {hasTwData ? p.name || stock.name : stock.name}
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-bold text-black dark:text-white">
                              {hasTwData ? formatPrice(p.price) : "-"}
                            </td>
                            <td
                              className={`px-4 py-2 text-right font-mono text-sm ${hasTwData ? changeColor(p.change) : "text-zinc-400"}`}
                            >
                              {hasTwData
                                ? formatChange(p.change, p.changePercent)
                                : "-"}
                            </td>
                            <td className="hidden px-4 py-2 text-right font-mono text-zinc-600 dark:text-zinc-400 sm:table-cell">
                              {hasTwData ? formatPrice(p.open) : "-"}
                            </td>
                            <td className="hidden px-4 py-2 text-right font-mono text-zinc-600 dark:text-zinc-400 sm:table-cell">
                              {hasTwData ? formatPrice(p.high) : "-"}
                            </td>
                            <td className="hidden px-4 py-2 text-right font-mono text-zinc-600 dark:text-zinc-400 sm:table-cell">
                              {hasTwData ? formatPrice(p.low) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
