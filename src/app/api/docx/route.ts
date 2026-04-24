import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { inflateRawSync } from "zlib";

// Extract word/document.xml from the docx ZIP buffer using the Central Directory.
// The Central Directory (at the end of the ZIP) always has the correct compSize,
// even when local file headers use the data-descriptor flag (bit 3, compSize=0).
function extractDocumentXml(buffer: Buffer): string | null {
  try {
    // 1. Find End of Central Directory (EOCD) by scanning backwards
    let eocd = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (
        buffer[i] === 0x50 && buffer[i + 1] === 0x4b &&
        buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06
      ) { eocd = i; break; }
    }
    if (eocd === -1) return null;

    const cdOffset = buffer.readUInt32LE(eocd + 16);
    const cdSize   = buffer.readUInt32LE(eocd + 12);

    // 2. Walk the Central Directory entries
    let pos = cdOffset;
    while (pos < cdOffset + cdSize && pos + 46 <= buffer.length) {
      if (buffer.readUInt32LE(pos) !== 0x02014b50) break; // Central dir signature
      const method      = buffer.readUInt16LE(pos + 10);
      const compSize    = buffer.readUInt32LE(pos + 20);
      const fnLen       = buffer.readUInt16LE(pos + 28);
      const extraLen    = buffer.readUInt16LE(pos + 30);
      const commentLen  = buffer.readUInt16LE(pos + 32);
      const localOffset = buffer.readUInt32LE(pos + 42);
      const fn = buffer.subarray(pos + 46, pos + 46 + fnLen).toString("utf8");

      if (fn === "word/document.xml") {
        // 3. Read the local file header for its own extra-field length
        const localFnLen    = buffer.readUInt16LE(localOffset + 26);
        const localExtraLen = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localFnLen + localExtraLen;
        const data = buffer.subarray(dataStart, dataStart + compSize);
        if (method === 0) return data.toString("utf8");
        if (method === 8) return inflateRawSync(data).toString("utf8");
        return null;
      }

      pos += 46 + fnLen + extraLen + commentLen;
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
    if (!pPrMatch) continue;
    const shdMatch = pPrMatch[1].match(/<w:shd\b([^/]*)\//);
    if (!shdMatch) continue;
    const fillMatch = shdMatch[1].match(/w:fill="([^"]+)"/i);
    const fill = (fillMatch?.[1] ?? "").toLowerCase().replace(/^#/, "");
    // Skip white / auto / no-fill (these are default style resets, not actual highlights)
    if (!fill || fill === "auto" || fill === "ffffff" || fill === "f2f2f2") continue;
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
    let debugXmlExtracted = false;
    let debugShdCount = 0;
    let debugXmlSample = "";
    try {
      const xml = extractDocumentXml(buffer);
      if (xml) {
        debugXmlExtracted = true;
        debugShdCount = (xml.match(/<w:shd/g) || []).length;
        // Sample first 500 chars around first <w:shd> if found
        const shdIdx = xml.indexOf("<w:shd");
        if (shdIdx !== -1) debugXmlSample = xml.slice(Math.max(0, shdIdx - 200), shdIdx + 300);
        shadedTexts = getShadedParaTexts(xml);
      }
    } catch { /* fall through if XML parsing fails */ }

    const htmlResult = await mammoth.convertToHtml({ buffer });
    let content = htmlToMarkdown(htmlResult.value);
    content = applyParaHighlights(content, shadedTexts);

    const title = file.name.replace(/\.docx$/i, "");
    return NextResponse.json({
      ok: true, title, content,
      _debug: {
        xmlExtracted: debugXmlExtracted,
        shdTagCount: debugShdCount,
        shadedCount: shadedTexts.size,
        shadedTexts: Array.from(shadedTexts),
        xmlSample: debugXmlSample,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}
