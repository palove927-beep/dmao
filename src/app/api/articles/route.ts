import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { categories } from "@/lib/stocks";
import { generateObject } from "ai";
import { z } from "zod";

const allStocks = categories.flatMap((c) =>
  c.stocks.map((s) => ({ ticker: s.ticker, name: s.name }))
);

const stockListText = allStocks
  .map((s) => `${s.ticker} ${s.name}`)
  .join("\n");

export async function GET() {
  const { data, error } = await getSupabase()
    .from("dmao_articles")
    .select("id, title, source, article_date, article_type, created_at")
    .order("article_date", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, articles: data });
}

export async function POST(req: NextRequest) {
  try {
    const { title, content, source, article_date, images } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { ok: false, error: "title 和 content 為必填" },
        { status: 400 }
      );
    }

    // 1. 用 AI 抽取股票提及 + 財測 EPS
    const { object: annotations } = await generateObject({
      model: "google/gemini-3.1-flash-lite-preview",
      schema: z.object({
        article_type: z.enum(["stock", "weekly", "macro", "industry", "other"]).describe("文章分類：stock=個股分析, weekly=產業週報, macro=總經分析, industry=產業分析, other=其他"),
        mentions: z.array(
          z.object({
            ticker: z.string().describe("股票代碼"),
            stock_name: z.string().describe("股票名稱"),
            paragraph: z.string().describe("文章中提及該股票的完整段落原文"),
          })
        ),
        eps_forecasts: z.array(
          z.object({
            ticker: z.string().describe("股票代碼"),
            stock_name: z.string().describe("股票名稱"),
            forecast_year: z.number().describe("財測年度，例如 2026"),
            eps: z.number().describe("財測 EPS 數值"),
            prev_eps: z.number().nullable().describe("前次預估 EPS，若文章未提及則為 null"),
          })
        ),
      }),
      prompt: `你是一位股票分析師。以下是一篇文章，請完成三項任務：

任務一：判斷文章分類（article_type）。
任務二：找出文章中提及的所有股票，並擷取相關段落。
任務三：找出文章中提及的「財測 EPS」預估數字。

任務一規則：
根據文章標題與內容，判斷文章屬於以下哪一類：
- stock：個股分析（標題直接寫某支股票名稱，如「環宇-KY(4991)：營運簡評」「Fabrinet(FN)：財報電話會議摘要」）
- weekly：產業週報（標題含「週報」「周報」，如「台股產業週報 2026/3/22」）
- macro：總經分析（討論景氣、利率、匯率、地緣政治等宏觀議題，如「台灣景氣燈號與領先、同時指標」）
- industry：產業分析（分析特定產業趨勢但非針對單一個股，如「成熟製程晶圓代工產能緊張，PMIC、MCU、Nor Flash醞釀漲價」）
- other：以上皆非

以下是特別關注的股票清單（供參考，但不限於此清單）：
${stockListText}

任務二規則：
1. 找出文章中提及的所有台灣及海外上市股票，不限於上述清單
2. 股票代碼格式：台股為純數字（如 4991），海外股票為英文代碼（如 NVDA）
3. paragraph 必須是從文章中「逐字複製」的完整段落原文，絕對不可以截斷、刪減、摘要或改寫任何文字。即使段落很長也必須完整複製，不可省略任何內容
4. 段落回傳規則依文章分類而不同：
   - 若 article_type 為 stock（個股分析）：該主角股票的每個提及段落都要回傳（同一支股票可以有多筆，每段一筆）。其他順帶提及的股票仍只回傳一次最相關段落。
   - 若 article_type 為 weekly / macro / industry / other：每支股票只回傳一次，選擇最相關、資訊最豐富的那個段落。
5. 股票名稱可能以簡稱、全名或代號出現，例如「環宇-KY(4991)」、「台積電」、「Lumentum」
6. 所謂「段落」是指文章中以換行分隔的完整段落，從頭到尾完整複製，不可只取前幾句
7. 文章標題中若包含股票名稱與代碼，也必須辨識並回傳

任務三規則（eps_forecasts）：
1. 只抽取明確寫出「財測EPS」、「預估EPS」等字眼的數字
2. 例如「2026年財測EPS上修至8.20元」→ forecast_year=2026, eps=8.20
3. 例如「2026/2027年財測EPS上修至10.60/17.36元(前次預估10.00/10.28元)」→ 兩筆：forecast_year=2026, eps=10.60, prev_eps=10.00 以及 forecast_year=2027, eps=17.36, prev_eps=10.28
4. 每個年度的 EPS 為獨立一筆
5. 如果文章有提及「前次預估」的 EPS，填入 prev_eps；沒提到則為 null
6. 找出文章中所有股票的財測 EPS，不限於上述清單

文章標題：${title}
文章內容：
${content}`,
    });

    // 2. 文章日期：優先使用前端傳入，否則從標題解析，最後預設今天
    let articleDate = article_date;
    if (!articleDate) {
      const dateMatch = title.match(/^(\d{4})(\d{2})(\d{2})\s/);
      articleDate = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
        : new Date().toISOString().slice(0, 10);
    }

    // 3. 存入文章
    const { data: article, error: articleErr } = await getSupabase()
      .from("dmao_articles")
      .insert({ title, content, source: source || null, article_date: articleDate, images: images || [], article_type: annotations.article_type || "other" })
      .select("id")
      .single();

    if (articleErr) {
      return NextResponse.json(
        { ok: false, error: articleErr.message },
        { status: 500 }
      );
    }

    // 4. 存入標記
    // stock 類文章：主角股票保留所有段落，其他股票去重
    // 其他類文章：所有股票去重（每支只保留一筆）
    const isStockArticle = annotations.article_type === "stock";
    // 主角股票 = mentions 中出現次數最多的 ticker
    const tickerCounts = new Map<string, number>();
    for (const m of annotations.mentions) {
      tickerCounts.set(m.ticker, (tickerCounts.get(m.ticker) || 0) + 1);
    }
    const mainTicker = isStockArticle && tickerCounts.size > 0
      ? [...tickerCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    const seen = new Set<string>();
    const uniqueMentions = annotations.mentions.filter((m) => {
      // 主角股票保留所有段落
      if (m.ticker === mainTicker) return true;
      if (seen.has(m.ticker)) return false;
      seen.add(m.ticker);
      return true;
    });

    if (uniqueMentions.length > 0) {
      const rows = uniqueMentions.map((m) => ({
        article_id: article.id,
        ticker: m.ticker,
        stock_name: m.stock_name,
        paragraph: m.paragraph,
      }));

      const { error: annErr } = await getSupabase()
        .from("dmao_annotations")
        .insert(rows);

      if (annErr) {
        return NextResponse.json(
          { ok: false, error: annErr.message },
          { status: 500 }
        );
      }
    }

    // 5. 存入財測 EPS
    let epsCount = 0;
    if (annotations.eps_forecasts && annotations.eps_forecasts.length > 0) {
      const epsRows = annotations.eps_forecasts.map((f) => ({
        article_id: article.id,
        ticker: f.ticker,
        stock_name: f.stock_name,
        forecast_year: f.forecast_year,
        eps: f.eps,
        prev_eps: f.prev_eps ?? null,
      }));

      const { error: epsErr } = await getSupabase()
        .from("dmao_eps_forecasts")
        .insert(epsRows);

      if (epsErr) {
        return NextResponse.json(
          { ok: false, error: epsErr.message },
          { status: 500 }
        );
      }
      epsCount = epsRows.length;
    }

    return NextResponse.json({
      ok: true,
      articleId: article.id,
      annotationCount: uniqueMentions.length,
      epsCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
