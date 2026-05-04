import { NextRequest, NextResponse } from "next/server";

function extractDocId(url: string): string | null {
  // Matches: docs.google.com/document/d/{ID}/...
  const m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ ok: false, error: "缺少 Google Doc 連結" }, { status: 400 });
    }

    const docId = extractDocId(url);
    if (!docId) {
      return NextResponse.json({ ok: false, error: "無法解析 Google Doc 連結，請確認格式正確" }, { status: 400 });
    }

    // Fetch document page and HTML export in parallel
    const pageUrl = `https://docs.google.com/document/d/${docId}/pub`;
    const htmlUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;

    const [pageRes, htmlRes] = await Promise.all([
      fetch(pageUrl, { redirect: "follow" }).catch(() => null),
      fetch(htmlUrl, { redirect: "follow" }),
    ]);

    if (!htmlRes.ok) {
      if (htmlRes.status === 404) {
        return NextResponse.json({ ok: false, error: "找不到該文件，請確認連結正確" }, { status: 404 });
      }
      return NextResponse.json(
        { ok: false, error: "無法存取該文件，請確認已設為「知道連結的人都能檢視」" },
        { status: 403 }
      );
    }

    const html = await htmlRes.text();

    // Extract title from the published page (has the real document title)
    let title = "";
    if (pageRes?.ok) {
      const pageHtml = await pageRes.text();
      const pageTitleMatch = pageHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (pageTitleMatch) {
        title = pageTitleMatch[1]
          .replace(/ - Google (?:Docs|文件|Документы|ドキュメント)$/i, "")
          .trim();
      }
    }

    // Fallback: try <title> from the export HTML
    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1]
          .replace(/ - Google (?:Docs|文件|Документы|ドキュメント)$/i, "")
          .trim();
      }
    }

    // Extract text content and image URLs from HTML
    const { text, images } = parseGoogleDocHtml(html);

    return NextResponse.json({ ok: true, title, content: text, images });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}

function parseGoogleDocHtml(html: string): { text: string; images: string[] } {
  const images: string[] = [];
  // Remove head section
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  let text = body;

  // Collect image URLs
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(text)) !== null) {
    images.push(imgMatch[1]);
  }

  // Replace <br> and block-level closing tags with newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "- ");

  // Replace images with markdown
  text = text.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (_, src) => `![圖片](${src})`);

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  // Clean up whitespace
  text = text.replace(/[ \t]+\n/g, "\n"); // trailing spaces
  text = text.replace(/\n{3,}/g, "\n\n"); // max 2 newlines
  text = text.trim();

  return { text, images };
}
