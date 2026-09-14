// ── 模型輸出形狀修正 ──
// 有些模型不完全遵守 JSON Schema，回傳的內容是對的、形狀卻不對：
//   - paragraph_stocks 回成 {"0": [...], "1": [...]} 這種以段落索引為 key 的物件
//   - ticker 回成數字 6894 而不是字串 "6894"
//   - forecast_year 回成 "2026年" 這種帶單位的字串
// 這種情況整篇分析失敗太可惜，交給 generateObject 的 repairText 在驗證前修回來。
// 只有在解析或驗證失敗時才會被呼叫，正常回應不經過這裡。
export function repairAnalysisJson(text: string): string | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const asString = (v: unknown) => (typeof v === "number" ? String(v) : v);
  const asNumber = (v: unknown) => {
    if (typeof v !== "string") return v;
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : v;
  };
  // 該是陣列卻給物件時，取它的值當成陣列
  const toArray = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>);
    return [];
  };
  const fixStock = (v: unknown) => {
    if (!v || typeof v !== "object") return v;
    const st = v as Record<string, unknown>;
    return { ...st, ticker: asString(st.ticker), stock_name: asString(st.stock_name) };
  };

  // paragraph_stocks：陣列維持原樣，物件則把 key 當成段落索引
  const entries: [string | null, unknown][] = Array.isArray(o.paragraph_stocks)
    ? o.paragraph_stocks.map((item) => [null, item])
    : o.paragraph_stocks && typeof o.paragraph_stocks === "object"
      ? Object.entries(o.paragraph_stocks as Record<string, unknown>)
      : [];

  const paragraphStocks = entries.flatMap(([key, item]) => {
    // item 可能是 {index, stocks}，也可能直接就是該段落的股票陣列
    const wrapped =
      !!item && typeof item === "object" && !Array.isArray(item) && "stocks" in item;
    const inner = wrapped ? (item as Record<string, unknown>) : null;
    const index = asNumber(inner?.index ?? key ?? undefined);
    if (typeof index !== "number" || !Number.isFinite(index)) return [];
    return [{ index, stocks: toArray(inner ? inner.stocks : item).map(fixStock) }];
  });

  const epsForecasts = toArray(o.eps_forecasts).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const e = item as Record<string, unknown>;
    return [{
      ticker: asString(e.ticker),
      stock_name: asString(e.stock_name),
      forecast_year: asNumber(e.forecast_year),
      eps: asNumber(e.eps),
    }];
  });

  return JSON.stringify({
    ...o,
    article_type: typeof o.article_type === "string" ? o.article_type.trim().toLowerCase() : o.article_type,
    subject_stock: o.subject_stock ? fixStock(o.subject_stock) : null,
    summary: o.summary ?? null,
    paragraph_stocks: paragraphStocks,
    eps_forecasts: epsForecasts,
  });
}
