import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getR2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await getSupabase()
    .from("dmao_articles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "找不到文章" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, article: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabase();

  // 1. Fetch article to get image URLs
  const { data: article } = await supabase
    .from("dmao_articles")
    .select("content, images")
    .eq("id", id)
    .single();

  if (!article) {
    return NextResponse.json({ ok: false, error: "找不到文章" }, { status: 404 });
  }

  // 2. Delete annotations
  await supabase.from("dmao_annotations").delete().eq("article_id", id);
  await supabase.from("dmao_eps_forecasts").delete().eq("article_id", id);

  // 3. Delete images from R2
  const imageUrls: string[] = [];
  if (article.images && Array.isArray(article.images)) {
    imageUrls.push(...article.images);
  }
  // Also extract from content
  const contentMatches = (article.content || "").matchAll(/!\[.*?\]\((.*?)\)/g);
  for (const m of contentMatches) {
    const url = (m as RegExpMatchArray)[1];
    if (!imageUrls.includes(url)) imageUrls.push(url);
  }

  const r2 = getR2();
  const prefix = R2_PUBLIC_URL + "/";
  await Promise.all(
    imageUrls
      .filter((url) => url.startsWith(prefix))
      .map((url) => {
        const key = url.slice(prefix.length);
        return r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
      })
  );

  // 4. Delete article
  const { error } = await supabase.from("dmao_articles").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
