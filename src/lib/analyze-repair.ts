// ── 模型輸出形狀修正 ──
// 有些模型不完全遵守 JSON Schema，回傳的內容是對的、形狀卻不對：
//   - paragraph_stocks 回成 {"0": [...], "1": [...]} 這種以段落索引為 key 的物件
//   - ticker 回成數字 6894 而不是字串 "6894"
//   - forecast_year 回成 "2026年" 這種帶單位的字串
//   - eps_forecasts 只給年度與 EPS，省略 ticker／stock_name（反正標題就是那檔）
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

  type Stock = { ticker: string; stock_name: string };

  const asText = (v: unknown): string | null => {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    return null;
  };
  const asNumber = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  // 該是陣列卻給物件時，取它的值當成陣列
  const toArray = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>);
    return [];
  };

  // 一檔股票至少要有代碼或名稱其中之一。只給一個時，另一個先用同一份值頂著，
  // 路由後續的 lookupStock 會用代碼或名稱把正式的代碼與名稱查回來。
  // 兩個都沒有就退回 fallback（例如個股分析的主角股票），再沒有就放棄這筆。
  const fixStock = (v: unknown, fallback: Stock | null = null): Stock | null => {
    if (!v || typeof v !== "object") return fallback;
    const st = v as Record<string, unknown>;
    const ticker = asText(st.ticker);
    const name = asText(st.stock_name);
    if (!ticker && !name) return fallback;
    return { ticker: ticker ?? name!, stock_name: name ?? ticker! };
  };

  const subjectStock = fixStock(o.subject_stock);

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
    const index = asNumber(inner?.index ?? key);
    if (index === null) return [];
    const stocks = toArray(inner ? inner.stocks : item)
      .map((s) => fixStock(s))
      .filter((s): s is Stock => s !== null);
    return [{ index, stocks }];
  });

  const epsForecasts = toArray(o.eps_forecasts).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const e = item as Record<string, unknown>;
    // 個股分析常常只寫年度與 EPS，是哪檔股票在標題就講完了 → 用主角股票補上
    const stock = fixStock(e, subjectStock);
    const forecast_year = asNumber(e.forecast_year);
    const eps = asNumber(e.eps);
    // 少了年度或數值的財測沒有意義，寧可丟掉這筆也不要讓整篇分析失敗
    if (!stock || forecast_year === null || eps === null) return [];
    return [{ ...stock, forecast_year, eps }];
  });

  return JSON.stringify({
    ...o,
    article_type:
      typeof o.article_type === "string" ? o.article_type.trim().toLowerCase() : o.article_type,
    subject_stock: subjectStock,
    summary: asText(o.summary),
    paragraph_stocks: paragraphStocks,
    eps_forecasts: epsForecasts,
  });
}
