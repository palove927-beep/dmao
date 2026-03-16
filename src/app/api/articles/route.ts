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
    .select("id, title, source, article_date, created_at")
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
      prompt: `你是一位股票分析師。以下是一篇文章，請完成兩項任務：

任務一：找出文章中提及的股票，並擷取相關段落。
任務二：找出文章中提及的「財測 EPS」預估數字。

只需要找出以下清單中的股票：
${stockListText}

任務一規則：
1. 只回傳清單中存在的股票
2. paragraph 必須是從文章中「逐字複製」的完整段落原文，絕對不可以截斷、刪減、摘要或改寫任何文字。即使段落很長也必須完整複製，不可省略任何內容
3. 每支股票只回傳一次，選擇最相關、資訊最豐富的那個段落
4. 股票名稱可能以簡稱、全名或代號出現
5. 所謂「段落」是指文章中以換行分隔的完整段落，從頭到尾完整複製，不可只取前幾句

任務二規則（eps_forecasts）：
1. 只抽取明確寫出「財測EPS」、「預估EPS」等字眼的數字
2. 例如「2026年財測EPS上修至8.20元」→ forecast_year=2026, eps=8.20
3. 例如「2026/2027年財測EPS上修至10.60/17.36元(前次預估10.00/10.28元)」→ 兩筆：forecast_year=2026, eps=10.60, prev_eps=10.00 以及 forecast_year=2027, eps=17.36, prev_eps=10.28
4. 每個年度的 EPS 為獨立一筆
5. 如果文章有提及「前次預估」的 EPS，填入 prev_eps；沒提到則為 null
6. 只回傳清單中存在的股票

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
      .insert({ title, content, source: source || null, article_date: articleDate, images: images || [] })
      .select("id")
      .single();

    if (articleErr) {
      return NextResponse.json(
        { ok: false, error: articleErr.message },
        { status: 500 }
      );
    }

    // 4. 存入標記（每支股票只保留一筆）
    const seen = new Set<string>();
    const uniqueMentions = annotations.mentions.filter((m) => {
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
