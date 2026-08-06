// TWSE 各 ETF 端點的回傳格式不一致（有 { fields, data } 表格式，也有巢狀物件），
// 這裡不綁定特定欄位名，改用結構特徵把成分股清單找出來。
export type EtfHolding = {
  ticker: string;
  name: string;
  shares: number | null;
  weight: number | null; // 佔比（%），來源沒給就是 null
};

// 從 HTML／JS／JSON 文字中撈出可能是資料端點的網址（給 ?discover=1 用）。
// TWSE 前端是 JS 應用，實際的資料端點藏在頁面或 bundle 裡，撈出來比猜網址可靠。
export function extractUrls(text: string, keywords = ["etf", "pcf", "nav", "fund"]): string[] {
  const found = new Set<string>();
  const patterns = [
    /https?:\/\/[^\s"'<>()\\]+/g,
    /["'](\/[a-zA-Z0-9_\-./]+\.(?:json|txt|jsp|csv))["'?]/g,
    /["'](\/rwd\/[a-zA-Z0-9_\-./]+)["'?]/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const url = (m[1] ?? m[0]).replace(/[.,;]+$/, "");
      if (url.length > 200) continue;
      if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|css)$/i.test(url)) continue;
      const lower = url.toLowerCase();
      if (keywords.some((k) => lower.includes(k))) found.add(url);
    }
  }
  return [...found].slice(0, 40);
}

const isStockCode = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4,6}[A-Z]?$/.test(v.trim());

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = parseFloat(v.replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isNaN(n) ? null : n;
}

const SHARE_KEYS = ["股數", "張數", "數量", "shares", "quantity", "qty"];
const WEIGHT_KEYS = ["權重", "比重", "佔比", "百分比", "weight", "percent", "ratio"];
export const NAME_KEYS = ["名稱", "股票名稱", "商品名稱", "name"];
const matchesKey = (key: string, words: string[]) =>
  words.some((w) => key.toLowerCase().includes(w.toLowerCase()));

// 一列成分股：物件（有欄位名）或陣列（純資料列，需搭配 fields 表頭）
export function parseRow(row: unknown, fields: string[] | null): EtfHolding | null {
  const entries: [string, unknown][] = Array.isArray(row)
    ? row.map((v, i) => [fields?.[i] ?? String(i), v])
    : row && typeof row === "object"
      ? Object.entries(row as Record<string, unknown>)
      : [];
  if (entries.length === 0) return null;

  const codeEntry = entries.find(([, v]) => isStockCode(v));
  if (!codeEntry) return null;
  const ticker = String(codeEntry[1]).trim();

  // 名稱：優先看欄位名，其次取第一個「不是代號也不是數字」的字串
  const named = entries.find(([k, v]) => matchesKey(k, NAME_KEYS) && typeof v === "string");
  const fallbackName = entries.find(
    ([, v]) => typeof v === "string" && v.trim() !== ticker && toNumber(v) === null && v.trim() !== "",
  );
  const name = String(named?.[1] ?? fallbackName?.[1] ?? "").trim();

  const sharesEntry = entries.find(([k]) => matchesKey(k, SHARE_KEYS));
  const weightEntry = entries.find(([k]) => matchesKey(k, WEIGHT_KEYS));

  // 沒有可辨識的欄位名時（純資料列且無表頭）：最大的數字當股數
  const numbers = entries.map(([, v]) => toNumber(v)).filter((n): n is number => n !== null);
  const shares = sharesEntry ? toNumber(sharesEntry[1]) : numbers.length ? Math.max(...numbers) : null;
  const weight = weightEntry ? toNumber(weightEntry[1]) : null;

  return { ticker, name, shares, weight };
}

// 投信的 PCF 頁若是伺服器端算好的 HTML 表格，直接從 <table> 解析
function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseHtmlTables(html: string): EtfHolding[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  let best: EtfHolding[] = [];

  for (const table of tables) {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []).map((tr) =>
      (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(stripTags),
    );
    if (rows.length < 3) continue;

    // 第一列若沒有股票代號，視為表頭
    const firstRowIsData = rows[0].some(isStockCode);
    const fields = firstRowIsData ? null : rows[0];
    const body = firstRowIsData ? rows : rows.slice(1);

    const holdings = body
      .map((r) => parseRow(r, fields))
      .filter((h): h is EtfHolding => h !== null);

    // 版面用的表格常混進像股票代號的數字（例如年份 2026），
    // 要求至少兩檔、且過半的列都解析得出成分股，才視為持股表
    if (holdings.length < 2 || holdings.length < body.length * 0.5) continue;
    if (holdings.length > best.length) best = holdings;
  }

  return best;
}

// 走訪整棵 JSON，找出「解析出最多成分股」的那個陣列
export function extractHoldings(node: unknown, fields: string[] | null = null, depth = 0): EtfHolding[] {
  if (depth > 8 || node === null || typeof node !== "object") return [];

  if (Array.isArray(node)) {
    const rows = node.map((r) => parseRow(r, fields)).filter((h): h is EtfHolding => h !== null);
    // 至少兩檔才視為成分股清單，避免把單筆報價誤判成持股
    if (rows.length >= 2) return rows;
    return node.flatMap((child) => extractHoldings(child, fields, depth + 1));
  }

  const obj = node as Record<string, unknown>;
  // TWSE 常見的 { fields: [...表頭], data: [[...]] } 格式
  const localFields = Array.isArray(obj.fields)
    ? (obj.fields as unknown[]).map(String)
    : fields;

  let best: EtfHolding[] = [];
  for (const value of Object.values(obj)) {
    const found = extractHoldings(value, localFields, depth + 1);
    if (found.length > best.length) best = found;
  }
  return best;
}

// all_etf.txt 之類「一次回傳所有 ETF」的來源：先收斂到該檔 ETF 的子樹
export function narrowToTicker(node: unknown, ticker: string, depth = 0): unknown {
  if (depth > 8 || node === null || typeof node !== "object") return null;

  if (!Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    const hit = Object.values(obj).some(
      (v) => typeof v === "string" && v.trim().toUpperCase() === ticker.toUpperCase(),
    );
    if (hit) return obj;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = narrowToTicker(value, ticker, depth + 1);
    if (found) return found;
  }
  return null;
}

export const DATE_KEYS = ["日期", "date", "資料日期"];

export function findString(node: unknown, words: string[], depth = 0): string | null {
  if (depth > 6 || node === null || typeof node !== "object") return null;
  if (!Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (matchesKey(k, words) && typeof v === "string" && v.trim()) return v.trim();
    }
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    const found = findString(v, words, depth + 1);
    if (found) return found;
  }
  return null;
}

