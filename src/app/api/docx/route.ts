import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import zlib from "zlib";

// Robust ZIP entry reader using the central directory (correct sizes even with data descriptors)
function extractZipEntry(buffer: Buffer, targetName: string): string | null {
  let eocdOffset = -1;
  const searchFrom = Math.max(0, buffer.length - 22 - 65536);
  for (let i = buffer.length - 22; i >= searchFrom; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) return null;

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);

  let pos = cdOffset;
  while (pos + 46 <= buffer.length && pos < cdOffset + cdSize) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
    const compression = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const filenameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localHeaderOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + filenameLen).toString("utf8");

    if (name === targetName) {
      const localFilenameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFilenameLen + localExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (compression === 0) return data.toString("utf8");
      if (compression === 8) return zlib.inflateRawSync(data).subarray(0, uncompressedSize).toString("utf8");
      return null;
    }

    pos += 46 + filenameLen + extraLen + commentLen;
  }
  return null;
}

// Find character style IDs in styles.xml that have a non-white, non-auto shading fill.
// These are used for colored highlighting via character styles.
function findColoredCharStyles(stylesXml: string): { id: string; fill: string }[] {
  const results: { id: string; fill: string }[] = [];
  const styleRe = /<w:style\b[^>]*>([\s\S]*?)<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(stylesXml)) !== null) {
    const block = m[0];
    if (!block.includes('type="character"')) continue;
    const shdM = /<w:shd\b[^>]*w:fill="([^"]+)"/.exec(block);
    if (!shdM) continue;
    const fill = shdM[1].toLowerCase();
    if (fill === "ffffff" || fill === "auto" || fill === "none") continue;
    const idM = /w:styleId="([^"]+)"/.exec(block);
    if (idM) results.push({ id: idM[1], fill });
  }
  return results;
}

const XML_ENTITY: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
};
const decodeXmlEntities = (s: string) => s.replace(/&(?:amp|lt|gt|quot|apos);/g, (e) => XML_ENTITY[e] ?? e);

// Extract highlighted text spans from document.xml.
// Detects: w:highlight, colored w:shd inline, and character style references from styles.xml.
function extractHighlightedSpans(docXml: string, coloredStyleIds: string[]): string[] {
  const spans: string[] = [];
  const runRe = /<w:r[ >][\s\S]*?<\/w:r>/g;
  let current = "";
  let m: RegExpExecArray | null;

  while ((m = runRe.exec(docXml)) !== null) {
    const run = m[0];

    const directHighlight =
      /<w:highlight\b/.test(run) ||
      // Inline shd with any non-white, non-auto fill
      /<w:shd\b[^>]*w:fill="(?!(?:ffffff|FFFFFF|auto))[0-9a-fA-F]{6}"/.test(run);

    // Character style reference → highlighted unless overridden by white shd
    const styleHighlight =
      coloredStyleIds.length > 0 &&
      coloredStyleIds.some((id) => new RegExp(`w:val="${id}"`).test(run)) &&
      !/<w:shd\b[^>]*w:fill="(?:ffffff|FFFFFF)"/.test(run);

    const isHighlighted = directHighlight || styleHighlight;

    const tm = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/.exec(run);
    const text = tm ? decodeXmlEntities(tm[1]) : "";

    if (isHighlighted && text) {
      current += text;
    } else {
      if (current.trim()) { spans.push(current); current = ""; }
    }
  }
  if (current.trim()) spans.push(current);

  return spans.filter((s) => s.length >= 2);
}

// Wrap each highlighted span with ==...== in the markdown (idempotent)
function injectHighlightMarkers(markdown: string, spans: string[]): string {
  let result = markdown;
  for (const span of spans) {
    const escaped = span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`==${escaped}==`).test(result)) continue;
    result = result.replace(new RegExp(escaped, "g"), `==${span}==`);
  }
  return result;
}

function htmlToMarkdown(html: string): string {
  let result = html;
  result = result.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, "\n![圖片]($1)\n");
  result = result.replace(/<mark>(.*?)<\/mark>/gi, "==$1==");
  result = result.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, "\n");
  result = result.replace(/<[^>]+>/g, "");
  result = result.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
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

    const docXml = extractZipEntry(buffer, "word/document.xml");
    const stylesXml = extractZipEntry(buffer, "word/styles.xml");

    // Find character styles with colored fills (the yellow shading source)
    const coloredStyles = stylesXml ? findColoredCharStyles(stylesXml) : [];
    const coloredStyleIds = coloredStyles.map((s) => s.id);

    const highlightedSpans = docXml ? extractHighlightedSpans(docXml, coloredStyleIds) : [];

    const htmlResult = await mammoth.convertToHtml({ buffer }, { includeDefaultStyleMap: true });
    let content = htmlToMarkdown(htmlResult.value);
    if (highlightedSpans.length > 0) {
      content = injectHighlightMarkers(content, highlightedSpans);
    }

    const title = file.name.replace(/\.docx$/i, "");

    return NextResponse.json({ ok: true, title, content });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}
