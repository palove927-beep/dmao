import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { article_id, ticker, stock_name, paragraph, is_summary } = await req.json();

    if (!article_id || !ticker || !stock_name || !paragraph) {
      return NextResponse.json(
        { ok: false, error: "article_id, ticker, stock_name, paragraph 為必填" },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabase()
      .from("dmao_annotations")
      .insert({ article_id, ticker, stock_name, paragraph, is_summary: is_summary || false })
      .select("id, ticker, stock_name, paragraph, is_summary")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, annotation: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const annId = req.nextUrl.searchParams.get("id");

  if (!annId) {
    return NextResponse.json({ ok: false, error: "id 為必填" }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("dmao_annotations")
    .delete()
    .eq("id", annId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const articleId = req.nextUrl.searchParams.get("article_id");
  const mode = req.nextUrl.searchParams.get("mode");

  // Return counts grouped by ticker
  if (mode === "counts") {
    const { data, error } = await getSupabase()
      .from("dmao_annotations")
      .select("ticker");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      counts[row.ticker] = (counts[row.ticker] || 0) + 1;
    }
    return NextResponse.json({ ok: true, counts });
  }

  let query = getSupabase()
    .from("dmao_annotations")
    .select("*, dmao_articles(id, title, created_at)")
    .order("created_at", { ascending: false });

  if (ticker) {
    query = query.eq("ticker", ticker);
  }
  if (articleId) {
    query = query.eq("article_id", articleId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, annotations: data });
}
