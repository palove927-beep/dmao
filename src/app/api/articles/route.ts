import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-paginate";

type ArticleRow = {
  id: string;
  title: string;
  source: string | null;
  article_date: string | null;
  article_type: string | null;
  created_at: string;
};

function extractSnippet(content: string, q: string): string {
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return content.slice(0, 160) + (content.length > 160 ? "…" : "");
  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, idx + q.length + 80);
  return (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "");
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  if (q) {
    // article_date 有大量並列，單獨用它排序無法穩定分頁，補 id 當決勝欄位
    const { rows, error } = await fetchAllRows<ArticleRow & { content: string | null }>(
      (from, to) =>
        getSupabase()
          .from("dmao_articles")
          .select("id, title, source, article_date, article_type, created_at, content")
          .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
          .order("article_date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
    );

    if (error) return NextResponse.json({ ok: false, error }, { status: 500 });

    const articles = rows.map(({ content, ...rest }) => ({
      ...rest,
      snippet: extractSnippet(content ?? "", q),
    }));
    return NextResponse.json({ ok: true, articles });
  }

  const { rows, error } = await fetchAllRows<ArticleRow>((from, to) =>
    getSupabase()
      .from("dmao_articles")
      .select("id, title, source, article_date, article_type, created_at")
      .order("article_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
  );

  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });

  return NextResponse.json({ ok: true, articles: rows });
}

export async function POST(req: NextRequest) {
  try {
    const { title, content, source, article_date, images, article_type, annotations, eps_forecasts } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { ok: false, error: "title 和 content 為必填" },
        { status: 400 }
      );
    }

    // 1. 文章日期：優先使用前端傳入，否則從標題解析，最後預設今天
    let articleDate = article_date;
    if (!articleDate) {
      const dateMatch = title.match(/^(\d{4})(\d{2})(\d{2})\s/);
      articleDate = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
        : new Date().toISOString().slice(0, 10);
    }

    // 2. 存入文章
    const { data: article, error: articleErr } = await getSupabase()
      .from("dmao_articles")
      .insert({
        title,
        content,
        source: source || null,
        article_date: articleDate,
        images: images || [],
        article_type: article_type || "other",
      })
      .select("id")
      .single();

    if (articleErr) {
      return NextResponse.json(
        { ok: false, error: articleErr.message },
        { status: 500 }
      );
    }

    // 3. 存入標記（前端已審核過的 annotations）
    let annotationCount = 0;
    if (annotations && annotations.length > 0) {
      const rows = annotations.map((m: { ticker: string; stock_name: string; paragraph: string; is_summary?: boolean }) => ({
        article_id: article.id,
        ticker: m.ticker,
        stock_name: m.stock_name,
        paragraph: m.paragraph,
        is_summary: m.is_summary || false,
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
      annotationCount = rows.length;
    }

    // 4. 存入財測 EPS
    let epsCount = 0;
    if (eps_forecasts && eps_forecasts.length > 0) {
      const epsRows = eps_forecasts.map((f: { ticker: string; stock_name: string; forecast_year: number; eps: number }) => ({
        article_id: article.id,
        ticker: f.ticker,
        stock_name: f.stock_name,
        forecast_year: f.forecast_year,
        eps: f.eps,
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
      annotationCount,
      epsCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
