import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

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

    // Extract HTML (for images) and raw text
    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ buffer }),
      mammoth.extractRawText({ buffer }),
    ]);

    const html = htmlResult.value;
    const text = textResult.value.trim();

    // Extract base64 images from HTML
    const images: string[] = [];
    const imgRegex = /<img[^>]+src="(data:[^"]+)"[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      images.push(imgMatch[1]);
    }

    // Title: use filename without extension (strip .docx)
    const title = file.name.replace(/\.docx$/i, "");

    return NextResponse.json({ ok: true, title, content: text, images });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}
