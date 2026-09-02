import { categories } from "./stock-list";
import { allSectorStocks } from "./sector-groups";
import { scanStocks } from "./stock-lookup";

// 代碼 → 名稱。來源優先序：/stock 清單 → 族群成分股 → 偵測用的完整清單。
// 只查 stock-list 的話，清單外的代碼（例如 6213 聯茂）會退化成顯示代碼本身，
// 個股頁的標題就變成「6213」而不是「聯茂」。
const nameByTicker = new Map<string, string>();

for (const s of categories.flatMap((c) => c.stocks)) nameByTicker.set(s.ticker, s.name);
for (const s of allSectorStocks) if (!nameByTicker.has(s.ticker)) nameByTicker.set(s.ticker, s.name);
for (const s of scanStocks) if (!nameByTicker.has(s.ticker)) nameByTicker.set(s.ticker, s.name);

// 查不到回 null，呼叫端自行決定要顯示代碼還是別的備援
export function stockName(ticker: string): string | null {
  return nameByTicker.get(ticker) ?? null;
}

// 查不到時退回代碼本身
export function stockNameOr(ticker: string): string {
  return nameByTicker.get(ticker) ?? ticker;
}
