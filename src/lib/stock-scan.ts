import { categories } from "./stock-list";
import { stockLookup } from "./stock-lookup";

export type ScanStock = {
  ticker: string;
  name: string;
  aliases?: string[];
};

// Aliases for stocks in stock-list categories.
// Kept here so stock-list.ts stays as pure display config.
const categoryAliases: Record<string, string[]> = {
  // ─── IC設計 ──────────────────────────────────────────────
  "2379": ["Realtek"],
  "2454": ["MediaTek"],
  "5274": ["Aspeed"],
  // ─── 晶圓代工 ────────────────────────────────────────────
  "2303": ["UMC"],
  "2330": ["TSMC", "台積"],
  "5347": ["VIS", "世界先進"],
  // ─── 半導體封測 ──────────────────────────────────────────
  "3711": ["ASE", "日月光投控"],
  "6239": ["PTI"],
  "6257": ["Sigurd"],
  // ─── 半導體耗材 ──────────────────────────────────────────
  "1560": ["KINIK"],
  "1727": ["中華化學"],
  "3680": ["Gudeng"],
  "6488": ["GlobalWafers"],
  // ─── III-V族 ─────────────────────────────────────────────
  "4991": ["環宇"],
  // ─── 記憶體 ──────────────────────────────────────────────
  "2337": ["Macronix", "MXIC"],
  "2344": ["Winbond"],
  "2408": ["Nanya", "南亞科技"],
  "3260": ["ADATA"],
  "6531": ["Ap Memory", "ApMemory"],
  "8299": ["Phison"],
  // ─── 品牌/ODM ────────────────────────────────────────────
  "2317": ["Foxconn", "Hon Hai"],
  "2382": ["Quanta"],
  // ─── 電子零組件 ──────────────────────────────────────────
  "2301": ["Lite-On", "光寶"],
  "2308": ["Delta", "台達"],
  "3017": ["Asia Vital", "AVC"],
  // ─── PCB ─────────────────────────────────────────────────
  "2313": ["Compeq"],
  "3037": ["Unimicron"],
  "3715": ["定穎"],
  "4958": ["臻鼎", "ZDT"],
  "6191": ["GCE"],
  // ─── 車用零組件 ──────────────────────────────────────────
  "6271": ["Tong Hsing"],
  "8255": ["PanJit"],
  // ─── 功率元件 ────────────────────────────────────────────
  "5425": ["TSC"],
  // ─── 銅箔基板 ────────────────────────────────────────────
  "2383": ["EMC", "台光"],
  "6274": ["Taiflex"],
  "8358": ["Co-Tech"],
};

// Stocks for detection and highlighting only — not shown on /stock page.
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

// All stocks for article auto-detection and text highlighting.
// = categories A~U (with aliases from categoryAliases) + extraStocks
export const scanStocks: ScanStock[] = [
  ...categories.flatMap((c) =>
    c.stocks.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      aliases: categoryAliases[s.ticker],
    }))
  ),
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
