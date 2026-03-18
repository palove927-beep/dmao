import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

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
