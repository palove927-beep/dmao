import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { inflateRawSync } from "zlib";

// Extract word/document.xml from the docx ZIP buffer (docx is a ZIP file)
function extractDocumentXml(buffer: Buffer): string | null {
  try {
    let pos = 0;
    while (pos < buffer.length - 30) {
      if (
        buffer[pos] !== 0x50 || buffer[pos + 1] !== 0x4b ||
        buffer[pos + 2] !== 0x03 || buffer[pos + 3] !== 0x04
      ) { pos++; continue; }
      const method = buffer.readUInt16LE(pos + 8);
      const compSize = buffer.readUInt32LE(pos + 18);
      const fnLen = buffer.readUInt16LE(pos + 26);
      const extraLen = buffer.readUInt16LE(pos + 28);
      const fn = buffer.subarray(pos + 30, pos + 30 + fnLen).toString("utf8");
      const dataPos = pos + 30 + fnLen + extraLen;
      if (fn === "word/document.xml") {
        const data = buffer.subarray(dataPos, dataPos + compSize);
        if (method === 0) return data.toString("utf8");
        if (method === 8) return inflateRawSync(data).toString("utf8");
        return null;
      }
      pos = compSize > 0 ? dataPos + compSize : pos + 1;
    }
  } catch { /* ignore */ }
  return null;
}

// Find paragraph texts that have shading (w:shd) in their paragraph properties (w:pPr)
function getShadedParaTexts(xml: string): Set<string> {
  const result = new Set<string>();
  const parts = xml.split(/<w:p\b/);
  for (let i = 1; i < parts.length; i++) {
    const endIdx = parts[i].indexOf("</w:p>");
    if (endIdx === -1) continue;
    const paraXml = parts[i].slice(0, endIdx);
    const pPrMatch = paraXml.match(/<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/);
    if (!pPrMatch || !pPrMatch[1].includes("<w:shd")) continue;
    const texts: string[] = [];
    const textRe = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = textRe.exec(paraXml)) !== null) texts.push(m[1]);
    const text = texts.join("")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    if (text) result.add(text);
  }
  return result;
}

function htmlToMarkdown(html: string): string {
  let result = html;
  // Merge adjacent <mark> elements (mammoth creates one per run)
  result = result.replace(/<\/mark>\s*<mark[^>]*>/gi, "");
  // Convert highlights to ==text==
  result = result.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, "==$1==");
  // Convert images
  result = result.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, "\n![圖片]($1)\n");
  // Block elements → newlines, strip remaining tags
  result = result.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, "\n");
  result = result.replace(/<[^>]+>/g, "");
  // Decode HTML entities
  result = result
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

// Wrap lines matching shaded paragraph texts with ==...==
function applyParaHighlights(content: string, shaded: Set<string>): string {
  if (shaded.size === 0) return content;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const normalizedSet = new Set(Array.from(shaded).map(norm));
  return content.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed || (trimmed.startsWith("==") && trimmed.endsWith("=="))) return line;
    if (normalizedSet.has(norm(trimmed))) return `==${trimmed}==`;
    return line;
  }).join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ ok: false, error: "缺少檔案" }, { status: 400 });
    if (!file.name.endsWith(".docx")) return NextResponse.json({ ok: false, error: "僅支援 .docx 格式" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Detect paragraph shading from raw XML (mammoth ignores w:shd)
    let shadedTexts = new Set<string>();
    try {
      const xml = extractDocumentXml(buffer);
      if (xml) shadedTexts = getShadedParaTexts(xml);
    } catch { /* fall through if XML parsing fails */ }

    const htmlResult = await mammoth.convertToHtml({ buffer });
    let content = htmlToMarkdown(htmlResult.value);
    content = applyParaHighlights(content, shadedTexts);

    const title = file.name.replace(/\.docx$/i, "");
    return NextResponse.json({
      ok: true, title, content,
      _debug: { shadedCount: shadedTexts.size, shadedTexts: Array.from(shadedTexts) },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}
