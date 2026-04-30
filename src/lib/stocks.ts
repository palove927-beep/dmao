// Re-exports for backward compatibility — prefer importing directly from stock-list or stock-scan
export type { Stock, Category } from "./stock-list";
export { categories, getTwseStockCodes } from "./stock-list";
export { scanStocks, lookupStock } from "./stock-scan";
export type { ScanStock } from "./stock-scan";
