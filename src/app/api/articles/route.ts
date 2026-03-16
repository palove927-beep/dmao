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

export async function POST(req: NextRequest) {
  try {
    const { title, content, source, article_date } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { ok: false, error: "title 和 content 為必填" },
        { status: 400 }
      );
    }

    // 1. 用 AI 抽取股票提及
    const { object: annotations } = await generateObject({
      model: "google/gemini-3-flash",
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
3. 每支股票只回傳一次，選擇最相關、資訊最豐富的那個段落
4. 股票名稱可能以簡稱、全名或代號出現

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
      .from("articles")
      .insert({ title, content, source: source || null, article_date: articleDate })
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
      annotationCount: uniqueMentions.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
