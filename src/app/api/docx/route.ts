import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

function htmlToMarkdown(html: string): string {
  // Simple HTML-to-markdown conversion preserving images
  let result = html;

  // Convert images: <img src="..."> → ![圖片](...)
  result = result.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, "\n![圖片]($1)\n");

  // Remove other tags, converting block elements to newlines
  result = result.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, "\n");
  result = result.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  result = result.replace(/&amp;/g, "&");
  result = result.replace(/&lt;/g, "<");
  result = result.replace(/&gt;/g, ">");
  result = result.replace(/&quot;/g, '"');
  result = result.replace(/&#39;/g, "'");
  result = result.replace(/&nbsp;/g, " ");

  // Clean up excessive whitespace
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "缺少檔案" }, { status: 400 });
    }

    if (!file.name.endsWith(".docx")) {
      return NextResponse.json({ ok: false, error: "僅支援 .docx 格式" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const content = htmlToMarkdown(htmlResult.value);
    const title = file.name.replace(/\.docx$/i, "");

    return NextResponse.json({ ok: true, title, content });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}
