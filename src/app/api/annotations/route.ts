import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { scanStocks } from "@/lib/stock-lookup";

const aliasMap = new Map<string, string[]>(
  scanStocks.filter((s) => s.aliases).map((s) => [s.ticker, s.aliases!])
);

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
  const since = req.nextUrl.searchParams.get("since");

  // Return counts grouped by ticker
  if (mode === "counts") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: { data: { ticker: string }[] | null; error: any };
    if (since) {
      result = await getSupabase()
        .from("dmao_annotations")
        .select("ticker, dmao_articles!inner(article_date)")
        .gte("dmao_articles.article_date", since) as typeof result;
    } else {
      result = await getSupabase()
        .from("dmao_annotations")
        .select("ticker") as typeof result;
    }

    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
    }

    const counts: Record<string, number> = {};
    for (const row of result.data || []) {
      counts[row.ticker] = (counts[row.ticker] || 0) + 1;
    }
    return NextResponse.json({ ok: true, counts });
  }

  let query = getSupabase()
    .from("dmao_annotations")
    .select("*, dmao_articles(id, title, article_date)")
    .order("created_at", { ascending: false });

  if (ticker) query = query.eq("ticker", ticker);
  if (articleId) query = query.eq("article_id", articleId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const sorted = [...(data || [])].sort((a, b) => {
    const dateA = a.dmao_articles?.article_date ?? a.created_at ?? "";
    const dateB = b.dmao_articles?.article_date ?? b.created_at ?? "";
    return dateB.localeCompare(dateA);
  });

  const filtered = since
    ? sorted.filter((ann) => (ann.dmao_articles?.article_date ?? "") >= since)
    : sorted;

  const withAliases = filtered.map((ann) => ({
    ...ann,
    aliases: aliasMap.get(ann.ticker) ?? [],
  }));

  return NextResponse.json({ ok: true, annotations: withAliases });
}
