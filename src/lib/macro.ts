// 2-1 總經提到的國際股市與金融市場：代號、分組與非常態訊號規則。
// 資料來源 Yahoo Finance chart API（不需 API key，與美股報價相同來源）。

export type MacroGroup = "stocks" | "taiwan" | "markets";

export type MacroInstrument = {
  key: string;
  label: string;
  symbol: string; // Yahoo Finance 代號
  // 預設 Yahoo。櫃買指數 Yahoo 沒有歷史資料，改抓櫃買中心；
  // 美債 2 年期 Yahoo 沒有現貨殖利率（2YY=F 期貨常停在舊價），改抓美國財政部每日殖利率曲線
  source?: "tpex" | "treasury";
  group: MacroGroup;
  layer?: string; // 2-1 的五層連動
  digits?: number;
  suffix?: string;
  tip?: string[]; // 「?」浮動說明：課程中這個指標的看點
};

export const MACRO_INSTRUMENTS: MacroInstrument[] = [
  { key: "sox", label: "費城半導體", symbol: "^SOX", group: "stocks", layer: "第一層", tip: ["第一層：與台股直接連動。", "若費半盤中下跌 5%，需優先觀測台積電 ADR 的變化；隔日台股開盤極大機率受其牽動。", "長期均線方向代表全球半導體產業的實體景氣循環：持續創高 → 半導體長循環是多頭；跌破均線且長期向下 → 長循環可能轉空，電子股要更謹慎。", "非常態：急跌 > 15–20% → 台積電及電子族群造成壓力，隔天台股大機率跟跌。"] },
  { key: "tsm", label: "台積電 ADR", symbol: "TSM", group: "stocks", layer: "第一層", tip: ["費半盤中下跌 5% 時，需優先觀測台積電 ADR 的變化。", "隔日台股開盤極大機率受其牽動，產生連鎖反應走勢。"] },
  { key: "dji", label: "道瓊", symbol: "^DJI", group: "stocks", layer: "美股", tip: ["美股四大指數：道瓊看信心。"] },
  { key: "spx", label: "S&P 500", symbol: "^GSPC", group: "stocks", layer: "美股", tip: ["美股四大指數：S&P 500 看資金流向。", "非常態：崩跌 > 5% → 外資撤離新興市場、黃金上漲；台股外資賣壓，短期承壓。"] },
  { key: "ixic", label: "那斯達克", symbol: "^IXIC", group: "stocks", layer: "美股", tip: ["美股四大指數：那斯達克看科技景氣。"] },
  { key: "kospi", label: "韓國 KOSPI", symbol: "^KS11", group: "stocks", layer: "第二層", tip: ["第二層：韓股與台股高度相近。", "產業結構很相似、兩國都是半導體大國、都是外資敏感型市場、都以科技出口為核心。"] },
  { key: "n225", label: "日經 225", symbol: "^N225", group: "stocks", layer: "第三層", tip: ["第三層：供應鏈關聯。", "如半導體設備與材料、被動元件、自動化與工具機等。"] },
  { key: "hsi", label: "恆生指數", symbol: "^HSI", group: "stocks", layer: "第三層", tip: ["第三層：政策關聯。", "當中國政策有重大變化時可以觀察反應。"] },
  { key: "stoxx", label: "歐洲 STOXX 50", symbol: "^STOXX50E", group: "stocks", layer: "第四層", tip: ["第四層：直接關聯小。", "但可用來判斷趨勢方向與系統性。"] },
  { key: "sse", label: "上證指數", symbol: "000001.SS", group: "stocks", layer: "第五層", tip: ["第五層：電子廠生產基地。", "遇到非常態時會傳導至台灣。"] },
  { key: "twii", label: "加權指數", symbol: "^TWII", group: "taiwan", tip: ["由大型權值股主導，易受到外部市場影響。", "與櫃買指數要同時看，觀察重點是時間差；兩者分歧是警訊。"] },
  { key: "twoii", label: "櫃買指數", symbol: "TPEx", group: "taiwan", source: "tpex", tip: ["以中小型公司為主，反應市場氛圍，常會率先反應。", "例：2025 年櫃買 3/28 先跌破兩年均線，加權 4/7 才跌破。"] },
  { key: "us10y", label: "美債 10 年殖利率", symbol: "^TNX", group: "markets", digits: 3, suffix: "%", tip: ["走強：市場預期通膨或升息，資金成本上升，高估值科技股承受估值下修壓力；資金移往債市、美元轉強，外資對台股賣壓增加。", "走弱：預期通膨降溫或降息，資金回流台股等新興市場。", "需辨別下行原因：若由衰退預期帶動、甚至出現 2 年期高於 10 年期的倒掛，可能為長循環的轉折訊號。"] },
  { key: "ust2y", label: "美債 2 年殖利率", symbol: "2 Yr", group: "markets", digits: 2, suffix: "%", source: "treasury", tip: ["與 10 年期比較：2 年期高於 10 年期即為倒掛。", "若殖利率下行由衰退預期帶動並出現倒掛，可能為長循環的轉折訊號。"] },
  { key: "dxy", label: "美元指數", symbol: "DX-Y.NYB", group: "markets", tip: ["速度：一個月內移動超過 5 個點，可開始注意股市變化。", "美元強：外資撤回美國呈現賣超、原物料下跌、台幣貶值。", "美元弱：資金回流新興市場、原物料上漲、台幣升值。", "急漲 > 5 點：出口商匯兌受益，外資需賣台股，財報好價格差。", "急跌 > 5 點：外資買台股，出口商匯兌壓力，財報差價格好。"] },
  { key: "twd", label: "美元／台幣", symbol: "TWD=X", group: "markets", digits: 3, tip: ["台幣升值：出口面臨匯損及競爭力降；進口降低成本。", "台幣貶值：出口增加匯兌利益；進口採購成本上升。", "例：2025 年台幣急升，出口導向電子大廠估算匯兌損失，EPS 衝擊成為市場焦點。"] },
  { key: "gold", label: "黃金", symbol: "GC=F", group: "markets", tip: ["恐慌型上漲（股市下跌快速）：短時間內快速拉升，避險需求驅動，伴隨風險資產同步走弱。", "通膨型上漲（股市下跌緩慢）：緩慢但持續地漲，代表對通膨擔憂上升、對法幣信心下降。", "非常態：急漲 > 5% → 市場恐慌、風險資產承壓；觀察 VIX，評估是否進入非常態。"] },
  { key: "brent", label: "布蘭特原油", symbol: "BZ=F", group: "markets", tip: ["暴漲（例：2022 烏俄戰爭）：通膨預期升溫、央行被迫加速升息、股市估值承壓、台股電子業雙重衝擊。", "暴跌（例：2020 疫情負油價）：通膨壓力消退、給央行降息空間、製造業成本下降，通常也是股市相對低點。", "非常態門檻：急漲或急跌 > 20%。"] },
  { key: "vix", label: "VIX 恐慌指數", symbol: "^VIX", group: "markets", tip: ["S&P 500 選擇權的隱含波動率，俗稱「恐慌指數」，越高代表越恐慌、越不確定。", "< 15 極度平靜、15–20 正常波動：維持正常策略。", "20–30 開始不安：開始注意市場變化，適度調整資金。", "30–40 明顯恐慌：研究被誤殺的標的，原部位以「不亂賣」為主。", "> 40 極端恐慌：行動窗口，需有準備積極找買點。"] },
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

export type MacroSignal = { key: string; level: "alert" | "watch"; title: string; meaning: string };

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
  if (sox != null && sox <= -15) out.push({ key: "sox_crash", level: "alert", title: `費半一個月急跌 ${Math.abs(sox).toFixed(1)}%`, meaning: "台積電及電子族群承壓；直接連動，隔天台股大機率跟跌" });
  const s = q.sox;
  if (s?.price != null && s.ma240 != null) {
    if (s.price < s.ma240 && s.ma240Rising === false) out.push({ key: "sox_below_ma240", level: "watch", title: "費半跌破年線且年線向下", meaning: "半導體長循環可能轉空，電子股要更謹慎，台股指數也會連動" });
  }

  const spx = pct("spx");
  if (spx != null && spx <= -5) out.push({ key: "spx_drop", level: "alert", title: `S&P 500 一個月下跌 ${Math.abs(spx).toFixed(1)}%`, meaning: "外資撤離新興市場、黃金上漲；台股外資賣壓，短期承壓" });

  const dxy = pts("dxy");
  if (dxy != null && dxy >= 5) out.push({ key: "dxy_up", level: "alert", title: `美元指數一個月急漲 ${dxy.toFixed(2)} 點`, meaning: "新興市場外資出走、台幣貶值；出口商匯兌受益，外資需賣台股，財報好價格差" });
  if (dxy != null && dxy <= -5) out.push({ key: "dxy_down", level: "alert", title: `美元指數一個月急跌 ${Math.abs(dxy).toFixed(2)} 點`, meaning: "新興市場資金回流、台幣升值；外資買台股，出口商匯兌壓力，財報差價格好" });

  const gold = pct("gold");
  if (gold != null && gold >= 5) out.push({ key: "gold_up", level: "watch", title: `黃金一個月上漲 ${gold.toFixed(1)}%`, meaning: "市場恐慌、風險資產承壓；觀察 VIX，評估是否進入非常態" });

  const brent = pct("brent");
  if (brent != null && brent >= 20) out.push({ key: "brent_up", level: "alert", title: `油價一個月急漲 ${brent.toFixed(1)}%`, meaning: "通膨預期升溫、升息預期強化；電子股估值受壓，物價通膨上升" });
  if (brent != null && brent <= -20) out.push({ key: "brent_down", level: "watch", title: `油價一個月急跌 ${Math.abs(brent).toFixed(1)}%`, meaning: "通膨預期降溫、降息空間打開；電子製造成本下降，同時也代表需求弱" });

  const vix = q.vix?.price ?? null;
  if (vix != null && vix >= 30) out.push({ key: "vix_30", level: "alert", title: `VIX 突破 30（${vix.toFixed(2)}）`, meaning: "全球多個市場觀察非常態；準備資金，找尋買點" });

  const y10 = q.us10y?.price ?? null;
  const y2 = q.ust2y?.price ?? null;
  if (y10 != null && y2 != null && y2 > y10) out.push({ key: "yield_inversion", level: "watch", title: `殖利率倒掛（2 年 ${y2.toFixed(2)}% ＞ 10 年 ${y10.toFixed(2)}%）`, meaning: "若殖利率下行由衰退預期帶動並出現倒掛，可能為長循環的轉折訊號" });

  // 2-1K：加權與櫃買要同時看，櫃買常率先跌破兩年均線
  const tw = q.twii, otc = q.twoii;
  if (otc?.price != null && otc.ma480 != null && tw?.price != null && tw.ma480 != null) {
    const otcBelow = otc.price < otc.ma480;
    const twBelow = tw.price < tw.ma480;
    if (otcBelow && !twBelow) out.push({ key: "otc_below_2y", level: "watch", title: "櫃買跌破兩年均線、加權仍在其上", meaning: "加權與櫃買分歧是警訊；櫃買反應市場氛圍，常會率先反應" });
    if (otcBelow && twBelow) out.push({ key: "tw_both_below_2y", level: "alert", title: "加權與櫃買都跌破兩年均線", meaning: "台股中長期分水嶺失守，留意是否進入非常態" });
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
  // 日線的最後一筆就是目前（或最近）這個交易日，前一筆才是昨收。
  // 不能拿即時價去比對最後一筆是否相等：兩者常只差浮點尾數（8774.862 vs 8774.8603…），
  // 比對失敗就會把今天的收盤當成昨收，今日漲跌變成 0。
  const prev = closes.length >= 2 ? closes[closes.length - 2] : null;
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
