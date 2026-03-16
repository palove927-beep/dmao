import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { categories } from "@/lib/stocks";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const allStocks = categories.flatMap((c) =>
  c.stocks.map((s) => ({ ticker: s.ticker, name: s.name }))
);

const stockListText = allStocks
  .map((s) => `${s.ticker} ${s.name}`)
  .join("\n");

export async function POST(req: NextRequest) {
  try {
    const { title, content, source } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { ok: false, error: "title 和 content 為必填" },
        { status: 400 }
      );
    }

    // 1. 用 AI 抽取股票提及
    const { object: annotations } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: z.object({
        mentions: z.array(
          z.object({
            ticker: z.string().describe("股票代碼"),
            stock_name: z.string().describe("股票名稱"),
            paragraph: z.string().describe("文章中提及該股票的完整段落原文"),
          })
        ),
      }),
      prompt: `你是一位股票分析師。以下是一篇文章，請找出文章中提及的股票，並擷取相關段落。

只需要找出以下清單中的股票：
${stockListText}

規則：
1. 只回傳清單中存在的股票
2. paragraph 必須是文章中的原文段落，不要自行編寫
3. 同一支股票如果在多個段落被提及，每個段落都要分別列出
4. 股票名稱可能以簡稱、全名或代號出現

文章標題：${title}
文章內容：
${content}`,
    });

    // 2. 存入文章
    const { data: article, error: articleErr } = await getSupabase()
      .from("articles")
      .insert({ title, content, source: source || null })
      .select("id")
      .single();

    if (articleErr) {
      return NextResponse.json(
        { ok: false, error: articleErr.message },
        { status: 500 }
      );
    }

    // 3. 存入標記
    if (annotations.mentions.length > 0) {
      const rows = annotations.mentions.map((m) => ({
        article_id: article.id,
        ticker: m.ticker,
        stock_name: m.stock_name,
        paragraph: m.paragraph,
      }));

      const { error: annErr } = await getSupabase()
        .from("annotations")
        .insert(rows);

      if (annErr) {
        return NextResponse.json(
          { ok: false, error: annErr.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      articleId: article.id,
      annotationCount: annotations.mentions.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
