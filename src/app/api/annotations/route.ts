import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { scanStocks } from "@/lib/stock-lookup";
import { fetchAllRows } from "@/lib/supabase-paginate";

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
    // 標記總筆數早就超過 Supabase 的單次回傳上限，不分頁會被無聲截斷，
    // 較新的標記全部算不到 —— 症狀是新標到的個股在 /stock 顯示「-」。
    const { rows, error } = await fetchAllRows<{ ticker: string }>((from, to) => {
      const base = getSupabase().from("dmao_annotations");
      const query = since
        ? base
            .select("ticker, dmao_articles!inner(article_date)")
            .gte("dmao_articles.article_date", since)
        : base.select("ticker");
      return query.order("id", { ascending: true }).range(from, to);
    });

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    const counts: Record<string, number> = {};
    for (const row of rows) {
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

  // 同一段落中「所有」被標記的個股（含其他股票），供前端把段落內每檔標記股都標色
  // key = article_id + paragraph：同段落的標記列，paragraph 內容完全相同
  const mateKey = (articleId: string, paragraph: string) => `${articleId}\0${paragraph}`;
  const mateMap = new Map<string, { ticker: string; stock_name: string; aliases: string[] }[]>();

  if (ticker) {
    const articleIds = [...new Set(filtered.map((a) => a.article_id).filter(Boolean))];
    // 分批查詢，避免 article_id 過多時 URL 過長
    const CHUNK = 100;
    for (let i = 0; i < articleIds.length; i += CHUNK) {
      const ids = articleIds.slice(i, i + CHUNK);
      // 100 篇文章的標記加起來也可能超過單次回傳上限，同樣要分頁讀完，
      // 否則段落內其他個股會漏掉、標色不完整
      const { rows: mates } = await fetchAllRows<{
        article_id: string;
        ticker: string;
        stock_name: string;
        paragraph: string;
      }>((from, to) =>
        getSupabase()
          .from("dmao_annotations")
          .select("article_id, ticker, stock_name, paragraph")
          .in("article_id", ids)
          .order("id", { ascending: true })
          .range(from, to)
      );

      for (const m of mates) {
        const key = mateKey(m.article_id, m.paragraph);
        const list = mateMap.get(key) ?? [];
        if (!list.some((x) => x.ticker === m.ticker)) {
          list.push({
            ticker: m.ticker,
            stock_name: m.stock_name,
            aliases: aliasMap.get(m.ticker) ?? [],
          });
          mateMap.set(key, list);
        }
      }
    }
  }

  const withAliases = filtered.map((ann) => ({
    ...ann,
    aliases: aliasMap.get(ann.ticker) ?? [],
    paragraph_stocks: mateMap.get(mateKey(ann.article_id, ann.paragraph)) ?? [],
  }));

  return NextResponse.json({ ok: true, annotations: withAliases });
}
