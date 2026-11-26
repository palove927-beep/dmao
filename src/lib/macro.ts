// 2-1 總經提到的國際股市與金融市場：代號、分組與非常態訊號規則。
// 資料來源 Yahoo Finance chart API（不需 API key，與美股報價相同來源）。

export type MacroGroup = "stocks" | "taiwan" | "markets";

export type MacroInstrument = {
  key: string;
  label: string;
  symbol: string; // Yahoo Finance 代號
  group: MacroGroup;
  layer?: string; // 2-1 的五層連動
  digits?: number;
  suffix?: string;
};

export const MACRO_INSTRUMENTS: MacroInstrument[] = [
  { key: "sox", label: "費城半導體", symbol: "^SOX", group: "stocks", layer: "第一層" },
  { key: "tsm", label: "台積電 ADR", symbol: "TSM", group: "stocks", layer: "第一層" },
  { key: "dji", label: "道瓊", symbol: "^DJI", group: "stocks", layer: "美股" },
  { key: "spx", label: "S&P 500", symbol: "^GSPC", group: "stocks", layer: "美股" },
  { key: "ixic", label: "那斯達克", symbol: "^IXIC", group: "stocks", layer: "美股" },
  { key: "kospi", label: "韓國 KOSPI", symbol: "^KS11", group: "stocks", layer: "第二層" },
  { key: "n225", label: "日經 225", symbol: "^N225", group: "stocks", layer: "第三層" },
  { key: "hsi", label: "恆生指數", symbol: "^HSI", group: "stocks", layer: "第三層" },
  { key: "stoxx", label: "歐洲 STOXX 50", symbol: "^STOXX50E", group: "stocks", layer: "第四層" },
  { key: "sse", label: "上證指數", symbol: "000001.SS", group: "stocks", layer: "第五層" },
  { key: "twii", label: "加權指數", symbol: "^TWII", group: "taiwan" },
  { key: "twoii", label: "櫃買指數", symbol: "^TWOII", group: "taiwan" },
  { key: "us10y", label: "美債 10 年殖利率", symbol: "^TNX", group: "markets", digits: 3, suffix: "%" },
  { key: "us2y", label: "美債 2 年殖利率", symbol: "2YY=F", group: "markets", digits: 3, suffix: "%" },
  { key: "dxy", label: "美元指數", symbol: "DX-Y.NYB", group: "markets" },
  { key: "twd", label: "美元／台幣", symbol: "TWD=X", group: "markets", digits: 3 },
  { key: "gold", label: "黃金", symbol: "GC=F", group: "markets" },
  { key: "brent", label: "布蘭特原油", symbol: "BZ=F", group: "markets" },
  { key: "vix", label: "VIX 恐慌指數", symbol: "^VIX", group: "markets" },
];

export type MacroQuote = {
  key: string;
  price: number | null;
  changePercent: number | null; // 今日
  change1m: number | null; // 約一個月（21 個交易日）的點數變化
  change1mPercent: number | null;
  ma240: number | null; // 年線
  ma240Rising: boolean | null; // 年線是否比一個月前高
  ma480: number | null; // 兩年均線
  asOf: string | null;
  spark: number[]; // 近三個月收盤，畫迷你走勢
};

export type MacroSignal = { level: "alert" | "watch" | "ok"; title: string; meaning: string };

// VIX 區間（2-1J）
export function vixZone(v: number | null): { label: string; color: string; meaning: string } | null {
  if (v == null) return null;
  if (v < 15) return { label: "極度平靜", color: "#16a34a", meaning: "維持正常策略" };
  if (v < 20) return { label: "正常波動", color: "#65a30d", meaning: "維持正常策略" };
  if (v < 30) return { label: "開始不安", color: "#eab308", meaning: "開始注意市場變化，適度調整資金" };
  if (v < 40) return { label: "明顯恐慌", color: "#ea580c", meaning: "開始研究被誤殺的標的，原部位以「不亂賣」為主" };
  return { label: "極端恐慌", color: "#dc2626", meaning: "行動窗口，需有準備積極找買點" };
}

// 依 2-1 的門檻判斷目前出現哪些非常態訊號。
// 「急跌／急漲」沒有指定期間，這裡以約一個月（21 個交易日）的變化衡量。
export function macroSignals(q: Record<string, MacroQuote>): MacroSignal[] {
  const out: MacroSignal[] = [];
  const pct = (k: string) => q[k]?.change1mPercent ?? null;
  const pts = (k: string) => q[k]?.change1m ?? null;

  const sox = pct("sox");
  if (sox != null && sox <= -15) out.push({ level: "alert", title: `費半一個月急跌 ${Math.abs(sox).toFixed(1)}%`, meaning: "台積電及電子族群承壓；直接連動，隔天台股大機率跟跌" });
  const s = q.sox;
  if (s?.price != null && s.ma240 != null) {
    if (s.price < s.ma240 && s.ma240Rising === false) out.push({ level: "watch", title: "費半跌破年線且年線向下", meaning: "半導體長循環可能轉空，電子股要更謹慎，台股指數也會連動" });
  }

  const spx = pct("spx");
  if (spx != null && spx <= -5) out.push({ level: "alert", title: `S&P 500 一個月下跌 ${Math.abs(spx).toFixed(1)}%`, meaning: "外資撤離新興市場、黃金上漲；台股外資賣壓，短期承壓" });

  const dxy = pts("dxy");
  if (dxy != null && dxy >= 5) out.push({ level: "alert", title: `美元指數一個月急漲 ${dxy.toFixed(2)} 點`, meaning: "新興市場外資出走、台幣貶值；出口商匯兌受益，外資需賣台股，財報好價格差" });
  if (dxy != null && dxy <= -5) out.push({ level: "alert", title: `美元指數一個月急跌 ${Math.abs(dxy).toFixed(2)} 點`, meaning: "新興市場資金回流、台幣升值；外資買台股，出口商匯兌壓力，財報差價格好" });

  const gold = pct("gold");
  if (gold != null && gold >= 5) out.push({ level: "watch", title: `黃金一個月上漲 ${gold.toFixed(1)}%`, meaning: "市場恐慌、風險資產承壓；觀察 VIX，評估是否進入非常態" });

  const brent = pct("brent");
  if (brent != null && brent >= 20) out.push({ level: "alert", title: `油價一個月急漲 ${brent.toFixed(1)}%`, meaning: "通膨預期升溫、升息預期強化；電子股估值受壓，物價通膨上升" });
  if (brent != null && brent <= -20) out.push({ level: "watch", title: `油價一個月急跌 ${Math.abs(brent).toFixed(1)}%`, meaning: "通膨預期降溫、降息空間打開；電子製造成本下降，同時也代表需求弱" });

  const vix = q.vix?.price ?? null;
  if (vix != null && vix >= 30) out.push({ level: "alert", title: `VIX 突破 30（${vix.toFixed(2)}）`, meaning: "全球多個市場觀察非常態；準備資金，找尋買點" });

  const y10 = q.us10y?.price ?? null;
  const y2 = q.us2y?.price ?? null;
  if (y10 != null && y2 != null && y2 > y10) out.push({ level: "watch", title: `殖利率倒掛（2 年 ${y2.toFixed(2)}% ＞ 10 年 ${y10.toFixed(2)}%）`, meaning: "若殖利率下行由衰退預期帶動並出現倒掛，可能為長循環的轉折訊號" });

  // 2-1K：加權與櫃買要同時看，櫃買常率先跌破兩年均線
  const tw = q.twii, otc = q.twoii;
  if (otc?.price != null && otc.ma480 != null && tw?.price != null && tw.ma480 != null) {
    const otcBelow = otc.price < otc.ma480;
    const twBelow = tw.price < tw.ma480;
    if (otcBelow && !twBelow) out.push({ level: "watch", title: "櫃買跌破兩年均線、加權仍在其上", meaning: "加權與櫃買分歧是警訊；櫃買反應市場氛圍，常會率先反應" });
    if (otcBelow && twBelow) out.push({ level: "alert", title: "加權與櫃買都跌破兩年均線", meaning: "台股中長期分水嶺失守，留意是否進入非常態" });
  }
  return out;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// 由日線收盤算出現價、今日漲跌、約一個月變化、年線與兩年均線
export function buildQuote(key: string, meta: Record<string, unknown> | undefined, closesRaw: unknown[], timestamps: number[]): MacroQuote {
  const closes: number[] = [];
  const dates: number[] = [];
  closesRaw.forEach((c, i) => {
    const v = num(c);
    if (v != null && v > 0) { closes.push(v); dates.push(timestamps[i]); }
  });
  const live = num(meta?.regularMarketPrice);
  const price = live ?? closes.at(-1) ?? null;
  // 現價若已是今天的收盤，前一筆才是昨收
  const lastClose = closes.at(-1) ?? null;
  const prev = lastClose != null && price != null && Math.abs(lastClose - price) < 1e-9 ? closes.at(-2) ?? null : lastClose;
  const changePercent = price != null && prev ? ((price - prev) / prev) * 100 : null;

  const base1m = closes.length > 21 ? closes[closes.length - 22] : null;
  const change1m = price != null && base1m != null ? price - base1m : null;
  const change1mPercent = change1m != null && base1m ? (change1m / base1m) * 100 : null;

  const ma = (n: number, endOffset = 0) => {
    const end = closes.length - endOffset;
    return end >= n ? avg(closes.slice(end - n, end)) : null;
  };
  const ma240 = ma(240);
  const ma240Prev = ma(240, 21);
  const ma480 = ma(480);

  const t = dates.at(-1);
  return {
    key,
    price,
    changePercent,
    change1m,
    change1mPercent,
    ma240,
    ma240Rising: ma240 != null && ma240Prev != null ? ma240 > ma240Prev : null,
    ma480,
    asOf: t ? new Date(t * 1000).toISOString().slice(0, 10) : null,
    spark: closes.slice(-63),
  };
}
