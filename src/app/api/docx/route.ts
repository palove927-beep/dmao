import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import zlib from "zlib";

// Robust ZIP entry reader: uses the central directory (always has correct sizes,
// even when local headers use data descriptors with sizes=0).
function extractZipEntry(buffer: Buffer, targetName: string): string | null {
  // Find End of Central Directory record (EOCD) by scanning from the end
  let eocdOffset = -1;
  const searchFrom = Math.max(0, buffer.length - 22 - 65536);
  for (let i = buffer.length - 22; i >= searchFrom; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);

  // Walk central directory entries
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
      // Locate data: skip local file header (sizes here may be 0 for data-descriptor files)
      const localFilenameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFilenameLen + localExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (compression === 0) return data.toString("utf8");
      if (compression === 8) return zlib.inflateRawSync(data).subarray(0, uncompressedSize).toString("utf8");
      return null; // unsupported compression method
    }

    pos += 46 + filenameLen + extraLen + commentLen;
  }
  return null;
}

// Parse word/document.xml and return highlighted text spans.
// Merges adjacent highlighted runs; also detects yellow shading as highlight.
function extractHighlightedSpans(xml: string): string[] {
  const spans: string[] = [];
  const runRe = /<w:r[ >][\s\S]*?<\/w:r>/g;
  let current = "";
  let m: RegExpExecArray | null;

  while ((m = runRe.exec(xml)) !== null) {
    const run = m[0];
    const isHighlighted =
      /<w:highlight\b/.test(run) ||
      // Yellow shading: fill="FFFF00" or similar bright yellow shades
      /<w:shading[^>]+w:fill="(?:FFFF00|FFD700|FFFF4D|FFFE00|FFF000|F9E400)"/.test(run);

    const tm = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/.exec(run);
    const text = tm
      ? tm[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
      : "";

    if (isHighlighted && text) {
      current += text;
    } else {
      if (current.trim()) {
        spans.push(current);
        current = "";
      }
    }
  }
  if (current.trim()) spans.push(current);

  return spans.filter((s) => s.length >= 2);
}

// Wrap each highlighted span with ==...== in the markdown (idempotent).
function injectHighlightMarkers(markdown: string, spans: string[]): string {
  let result = markdown;
  for (const span of spans) {
    const escaped = span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`==${escaped}==`).test(result)) continue; // already wrapped
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
  result = result.replace(/&amp;/g, "&");
  result = result.replace(/&lt;/g, "<");
  result = result.replace(/&gt;/g, ">");
  result = result.replace(/&quot;/g, '"');
  result = result.replace(/&#39;/g, "'");
  result = result.replace(/&nbsp;/g, " ");
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
    const xmlFound = docXml !== null;
    const xmlHighlightTags = xmlFound ? (docXml!.match(/<w:highlight\b/g) || []).length : 0;
    const xmlShadingTags = xmlFound ? (docXml!.match(/<w:shading\b/g) || []).length : 0;
    const highlightedSpans = docXml ? extractHighlightedSpans(docXml) : [];

    const htmlResult = await mammoth.convertToHtml({ buffer }, { includeDefaultStyleMap: true });

    let content = htmlToMarkdown(htmlResult.value);
    if (highlightedSpans.length > 0) {
      content = injectHighlightMarkers(content, highlightedSpans);
    }

    const title = file.name.replace(/\.docx$/i, "");

    return NextResponse.json({ ok: true, title, content, _debug: {
      xmlFound,
      xmlHighlightTags,
      xmlShadingTags,
      highlightedSpans,
      hasMarkInContent: content.includes("=="),
    } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}
