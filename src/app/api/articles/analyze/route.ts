import { NextRequest, NextResponse } from "next/server";
import { stockLookup } from "@/lib/stock-lookup";
import { generateObject } from "ai";
import { z } from "zod";

// Terms that look like tickers but are NOT companies
const NON_STOCK_TERMS = new Set([
  "GaAs", "InP", "GaN", "SiC", "III-V",
  "CPO", "AOC", "RF", "VCSEL", "EML", "PD",
  "800G", "1.6T", "100G", "200G", "400G",
  "CW", "LED", "LCD", "OLED", "USB", "PCB",
  "AI", "AR", "VR", "IoT", "5G", "6G",
  "M3", // Apple chip, not company
  "AGC", "SMC",
]);

function scanParagraphForStocks(text: string): { ticker: string; stock_name: string }[] {
  const found: Map<string, { ticker: string; stock_name: string }> = new Map();

  for (const [ticker, entry] of Object.entries(stockLookup)) {
    if (found.has(ticker)) continue;
    if (NON_STOCK_TERMS.has(ticker)) continue;
    // Match company name directly in text
    if (entry.name.length >= 2 && text.includes(entry.name)) {
      found.set(ticker, { ticker, stock_name: entry.name });
      continue;
    }
    // Match aliases in text
    if (entry.aliases?.some((a) => a.length >= 2 && text.includes(a))) {
      found.set(ticker, { ticker, stock_name: entry.name });
      continue;
    }
    // Match ticker in parentheses: (2330) or （2330）
    const tickerInParens = new RegExp(`[（(]${escapeRegex(ticker)}[)）]`);
    if (tickerInParens.test(text)) {
      found.set(ticker, { ticker, stock_name: entry.name });
    }
  }

  return Array.from(found.values());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(req: NextRequest) {
  try {
    const { title, paragraphs } = await req.json();

    if (!title || !paragraphs || !Array.isArray(paragraphs) || paragraphs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "title 和 paragraphs 為必填" },
        { status: 400 }
      );
    }

    // Build numbered paragraph list for the prompt
    const paragraphList = paragraphs
      .map((p: string, i: number) => `[段落 ${i}]\n${p}`)
      .join("\n\n");

    const MAX_CHARS = 300_000;
    const trimmedList = paragraphList.length > MAX_CHARS
      ? paragraphList.slice(0, MAX_CHARS) + "\n\n…（內容過長，已截斷）"
      : paragraphList;

    const { object: result } = await generateObject({
      model: "openai/gpt-5.4-nano",
      schema: z.object({
        article_type: z.enum(["stock", "weekly", "macro", "industry", "other"])
          .describe("文章分類：stock=個股分析, weekly=產業週報, macro=總經分析, industry=產業分析, other=其他"),
        subject_stock: z.object({
          ticker: z.string().describe("主角股票代碼"),
          stock_name: z.string().describe("主角股票名稱"),
        }).nullable().describe("若 article_type=stock，填入標題中的主角股票；否則為 null"),
        summary: z.string().nullable().describe("若 article_type=stock，用 3~5 句話摘要該個股的重點（營運展望、財務數據、產業地位等）；否則為 null"),
        paragraph_stocks: z.array(
          z.object({
            index: z.number().describe("段落索引（從 0 開始）"),
            stocks: z.array(
              z.object({
                ticker: z.string().describe("股票代碼"),
                stock_name: z.string().describe("股票名稱"),
              })
            ),
          })
        ).describe("每個段落中提及的股票"),
        eps_forecasts: z.array(
          z.object({
            ticker: z.string().describe("股票代碼"),
            stock_name: z.string().describe("股票名稱"),
            forecast_year: z.number().describe("財測年度"),
            eps: z.number().describe("財測 EPS 數值"),
          })
        ),
      }),
      prompt: `你是一位股票分析師。以下文章已被拆分成多個段落，請完成四項任務：

任務一：判斷文章分類（article_type）。
任務二：若為個股分析（article_type=stock），辨識標題中的主角股票（subject_stock）並撰寫摘要（summary）。
任務三：針對每個段落，找出該段落中提及的所有股票/公司。
任務四：找出文章中提及的「財測 EPS」預估數字。

任務一規則：
根據文章標題與內容，判斷文章屬於以下哪一類：
- stock：個股分析（標題直接寫某支股票名稱，如「環宇-KY(4991)：營運簡評」）
- weekly：產業週報（標題含「週報」「周報」）
- macro：總經分析（討論景氣、利率、匯率、地緣政治等宏觀議題）
- industry：產業分析（分析特定產業趨勢但非針對單一個股）
- other：以上皆非

任務二規則（僅 article_type=stock 時執行）：
1. subject_stock：從標題辨識主角股票的代碼與名稱（如標題「環宇-KY(4991)：營運簡評」→ ticker="4991", stock_name="環宇-KY"）
2. summary：針對該主角股票，用 3~5 句繁體中文摘要文章重點，包括：營運近況、財務數據亮點、未來展望或風險。語氣專業簡潔。
3. 若 article_type 不是 stock，subject_stock 和 summary 都填 null

任務三規則：
1. 針對每個段落，找出其中提及的所有公司，包括台灣上市櫃股票、海外上市股票、以及海外未上市但具知名度的公司
2. 股票代碼格式：台股為純數字（如 4991），海外股票為英文代碼（如 NVDA）。未上市或無法確認代碼的公司，ticker 填公司英文簡稱
3. 股票名稱可能以簡稱、全名、英文名或代號出現，即使文章只寫公司簡稱而未附代碼，也必須盡力辨識
4. 每個段落獨立判斷，只回傳在該段落中實際出現的股票。嚴格比對：股票名稱或代碼必須逐字出現在該段落的文字中，不可因為其他段落提到就標記到這個段落
5. 如果某段落沒有提及任何股票，不需要回傳該段落。注意：很多段落確實不含任何公司名稱，這是正常的，不要勉強標記
6. 重要：當段落開頭以股票名稱作為主角（例如「6. 威剛(3260)：2025Q4營收...」），該主角股票也必須被標記
7. 重要：以下這些不是公司，絕對不要標記為股票：
   - 化學材料與化合物：GaAs（砷化鎵）、InP（磷化銦）、GaN（氮化鎵）、SiC（碳化矽）、III-V族化合物半導體等
   - 技術與產品術語：CW Laser、PD（光偵測器）、EML、CPO（共封裝光學）、AOC、RF、VCSEL等
   - 產業規格：800G、1.6T、100G、200G等
   - 晶片/GPU架構代號：Vera Rubin（Intel GPU架構）、Blackwell、Hopper、Granite Rapids 等產品代號不是公司
   - 只有當這些縮寫明確指涉一家公司時才可標記（例如「CPO公司」不是公司，但「Coherent」是公司）

任務四規則（eps_forecasts）：
1. 只抽取文章中由定錨（作者）明確給出的「年度財測EPS」預估數字，通常出現在文章末段的估值或投資建議區塊
2. 必須同時包含「財測」或「預估」等字眼 + 明確的年度 + EPS 數值，三者缺一不可
3. 例如「2026年財測EPS上修至8.20元」→ forecast_year=2026, eps=8.20
4. 例如「2026/2027年財測EPS上修至10.60/17.36元」→ 兩筆
5. 若 EPS 為區間，取中間值
6. 每個年度的 EPS 為獨立一筆
7. 重要：以下情況不算財測EPS，絕對不要抽取：
   - 公司自己公布的當季實際EPS（如「non-GAAP EPS -0.01美元」）
   - 公司自己給出的下季財測區間（如「EPS區間-0.09~0美元」）
   - 這些是公司的guidance，不是定錨的年度財測EPS預估
8. 如果文章中沒有定錨給出的年度財測EPS，回傳空陣列 []

文章標題：${title}

${trimmedList}`,
    });

    // Normalize tickers: AI may return company name as ticker, fix via stockLookup
    const normalizeStock = (s: { ticker: string; stock_name: string }) => {
      if (stockLookup[s.ticker]) return { ticker: s.ticker, stock_name: stockLookup[s.ticker].name };
      const nameLower = s.stock_name.toLowerCase();
      const tickerLower = s.ticker.toLowerCase();
      for (const [ticker, entry] of Object.entries(stockLookup)) {
        if (
          entry.name.toLowerCase() === nameLower ||
          entry.name.toLowerCase() === tickerLower ||
          entry.aliases?.some((a) => a.toLowerCase() === nameLower)
        ) return { ticker, stock_name: entry.name };
      }
      return s;
    };

    const subjectStock = result.subject_stock ? normalizeStock(result.subject_stock) : null;

    // Validate: only keep stocks whose name/ticker actually appears in the paragraph text
    const stockAppearsInText = (
      text: string,
      normalized: { ticker: string; stock_name: string },
      original: { ticker: string; stock_name: string },
    ) => {
      if (text.includes(normalized.stock_name) || text.includes(normalized.ticker)) return true;
      if (text.includes(original.stock_name) || text.includes(original.ticker)) return true;
      return false;
    };

    // Build AI results per paragraph (validated)
    const aiStocksByParagraph = new Map<number, { ticker: string; stock_name: string }[]>();
    for (const ps of result.paragraph_stocks) {
      const paraText = paragraphs[ps.index] ?? "";
      const validated = ps.stocks
        .map((orig) => ({ orig, norm: normalizeStock(orig) }))
        .filter(({ orig, norm }) => stockAppearsInText(paraText, norm, orig))
        .map(({ norm }) => norm);
      if (validated.length > 0) {
        aiStocksByParagraph.set(ps.index, validated);
      }
    }

    // Run rule-based scan on every paragraph and merge with AI results
    const paragraphStocks: { index: number; stocks: { ticker: string; stock_name: string }[] }[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const paraText = paragraphs[i] ?? "";
      if (!paraText.trim()) continue;

      const aiStocks = aiStocksByParagraph.get(i) ?? [];
      const ruleStocks = scanParagraphForStocks(paraText);

      // Merge: AI first, then rule-based additions (deduplicate by ticker)
      const seen = new Set(aiStocks.map((s) => s.ticker));
      const merged = [...aiStocks];
      for (const rs of ruleStocks) {
        if (!seen.has(rs.ticker)) {
          seen.add(rs.ticker);
          merged.push(rs);
        }
      }

      if (merged.length > 0) {
        paragraphStocks.push({ index: i, stocks: merged });
      }
    }

    const epsForecasts = result.eps_forecasts
      .map((ef) => ({
        ...ef,
        ...normalizeStock(ef),
      }))
      .filter((ef, i, arr) =>
        arr.findIndex((x) => x.ticker === ef.ticker && x.forecast_year === ef.forecast_year) === i
      );

    return NextResponse.json({
      ok: true,
      article_type: result.article_type,
      subject_stock: subjectStock,
      summary: result.summary,
      paragraph_stocks: paragraphStocks,
      eps_forecasts: epsForecasts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
