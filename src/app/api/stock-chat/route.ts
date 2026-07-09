import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { streamText } from "ai";

// ── 個股 AI 問答 ──
// 以該股票最近三個月的標記段落（dmao_annotations）作為知識來源，
// 回答使用者針對這支股票的提問。回覆以純文字串流傳回。

type ChatMessage = { role: "user" | "assistant"; content: string };

type AnnotationRow = {
  paragraph: string;
  is_summary: boolean;
  dmao_articles: { title: string | null; article_date: string | null } | null;
};

const MAX_HISTORY = 8; // 只保留最近幾輪對話，控制 token 用量
const MAX_ANNOTATIONS = 150;

export async function POST(req: NextRequest) {
  try {
    const { ticker, stock_name, question, history } = await req.json();

    if (!ticker || !question) {
      return NextResponse.json(
        { ok: false, error: "ticker 和 question 為必填" },
        { status: 400 }
      );
    }

    // 最近三個月
    const since = new Date();
    since.setMonth(since.getMonth() - 3);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await getSupabase()
      .from("dmao_annotations")
      .select("paragraph, is_summary, dmao_articles!inner(title, article_date)")
      .eq("ticker", ticker)
      .gte("dmao_articles.article_date", sinceStr)
      .limit(MAX_ANNOTATIONS);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as AnnotationRow[];
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "近三個月沒有這支股票的標記資料，無法回答" },
        { status: 404 }
      );
    }

    // 依文章分組、日期新到舊排列，組成知識庫文字
    const byArticle = new Map<string, { title: string; date: string; paragraphs: string[] }>();
    for (const row of rows) {
      const art = row.dmao_articles;
      const date = art?.article_date ? String(art.article_date).slice(0, 10) : "";
      const title = art?.title || "無標題";
      const key = `${date}|${title}`;
      if (!byArticle.has(key)) byArticle.set(key, { title, date, paragraphs: [] });
      const entry = byArticle.get(key)!;
      const text = row.is_summary ? `（AI 摘要）${row.paragraph}` : row.paragraph;
      if (row.is_summary) entry.paragraphs.unshift(text);
      else entry.paragraphs.push(text);
    }
    const contextText = Array.from(byArticle.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((a) => `【${a.date}｜${a.title}】\n${a.paragraphs.map((p) => `- ${p}`).join("\n")}`)
      .join("\n\n");

    const today = new Date().toISOString().slice(0, 10);
    const displayName = stock_name ? `${stock_name}（${ticker}）` : ticker;

    const priorMessages: ChatMessage[] = Array.isArray(history)
      ? (history as ChatMessage[])
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-MAX_HISTORY)
      : [];

    const result = streamText({
      model: "anthropic/claude-sonnet-5",
      system: `你是一位專業的台股研究助理。今天是 ${today}。
使用者正在查看 ${displayName} 的個股頁面，以下是近三個月分析文章中與這支股票相關的標記段落，這是你唯一的資料來源：

${contextText}

回答規則：
1. 只根據上述標記段落回答，不要憑自己的知識補充營運數字或財測。
2. 引用觀點時註明出處日期，例如「根據 2026/06/15 的週報…」。
3. 若資料中沒有足以回答的內容，直接說明「近三個月的標記資料中沒有相關資訊」，不要猜測。
4. 使用繁體中文，語氣專業簡潔，適當條列。
5. 資料為分析師觀點而非投資建議，若使用者詢問買賣決策，提醒僅供參考。`,
      messages: [...priorMessages, { role: "user", content: question }],
    });

    return result.toTextStreamResponse();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
