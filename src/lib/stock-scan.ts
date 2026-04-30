import { categories } from "./stock-list";
import { stockLookup } from "./stock-lookup";

export type ScanStock = {
  ticker: string;
  name: string;
  aliases?: string[];
};

// Stocks for detection and highlighting only — not shown on /stock page.
// Aliases defined here are the single source of truth for both auto-detection
// and article text highlighting.
const extraStocks: ScanStock[] = [
  // ─── 雲端/CSP ───────────────────────────────────────────
  { ticker: "AMZN", name: "Amazon", aliases: ["AWS"] },
  { ticker: "MSFT", name: "Microsoft", aliases: ["Azure"] },
  { ticker: "GOOG", name: "Alphabet", aliases: ["Google", "GCP"] },
  // ─── 其他美股 ────────────────────────────────────────────
  { ticker: "STM", name: "STMicroelectronics", aliases: ["STMicro"] },
  { ticker: "7631", name: "聚賢研發-創", aliases: ["聚賢研發"] },
  // ─── 日股 ────────────────────────────────────────────────
  { ticker: "3407.T", name: "旭化成(Asahi Kasei)", aliases: ["旭化成", "Asahi Kasei", "Asahi"] },
  { ticker: "3110.T", name: "日東紡(Nittobo)", aliases: ["日東紡", "Nittobo"] },
  { ticker: "1899.T", name: "福田(Fukuda)", aliases: ["福田", "Fukuda"] },
  { ticker: "5706.T", name: "三井金屬(Mitsui Kinzoku)", aliases: ["三井金屬", "Mitsui Kinzoku"] },
  { ticker: "5801.T", name: "古河電工(Furukawa)", aliases: ["古河電工", "Furukawa"] },
  { ticker: "4004.T", name: "昭和電工(Resonac)", aliases: ["昭和電工", "Resonac"] },
  { ticker: "4182.T", name: "三菱瓦斯化學(MGC)", aliases: ["三菱瓦斯化學", "MGC"] },
  { ticker: "285A.T", name: "鎧俠(Kioxia)", aliases: ["鎧俠", "Kioxia"] },
  // ─── 韓股 ────────────────────────────────────────────────
  { ticker: "000157.KS", name: "斗山(Doosan)", aliases: ["斗山", "Doosan"] },
  // ─── 沙烏地 ──────────────────────────────────────────────
  { ticker: "2010.SR", name: "沙特基礎工業(SABIC)", aliases: ["沙特基礎工業", "SABIC", "Sabic"] },
];

// All stocks used for article auto-detection and text highlighting.
// = categories A~U (display list) + extraStocks (detection-only)
export const scanStocks: ScanStock[] = [
  ...categories.flatMap((c) => c.stocks.map((s) => ({ ticker: s.ticker, name: s.name, aliases: s.aliases }))),
  ...extraStocks,
];

export function lookupStock(query: string): { ticker: string; stock_name: string } | null {
  const q = query.trim();
  if (!q) return null;
  const ql = q.toLowerCase();
  // 1. Check scan stocks by ticker, name, or alias
  for (const s of scanStocks) {
    if (s.ticker.toLowerCase() === ql) return { ticker: s.ticker, stock_name: s.name };
    if (s.name.toLowerCase() === ql) return { ticker: s.ticker, stock_name: s.name };
    if (s.aliases?.some((a) => a.toLowerCase() === ql)) return { ticker: s.ticker, stock_name: s.name };
  }
  // 2. Check broad lookup table by ticker
  const tickerMatch = Object.keys(stockLookup).find((t) => t.toLowerCase() === ql);
  if (tickerMatch) return { ticker: tickerMatch, stock_name: stockLookup[tickerMatch] };
  // 3. Check broad lookup table by name — also handles compound names like "三井金屬(Mitsui Kinzoku)"
  for (const [ticker, name] of Object.entries(stockLookup)) {
    if (name.toLowerCase() === ql) return { ticker, stock_name: name };
    const parts = name.split(/[\s()]+/).filter(Boolean);
    if (parts.some((p) => p.toLowerCase() === ql)) return { ticker, stock_name: name };
  }
  return null;
}
