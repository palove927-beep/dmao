import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import zlib from "zlib";

// Minimal ZIP reader: extract a named file from a ZIP buffer (no extra deps)
function extractZipEntry(buffer: Buffer, targetName: string): string | null {
  let offset = 0;
  while (offset < buffer.length - 30) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // not a local file header
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const filenameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + filenameLen).toString("utf8");
    const dataStart = offset + 30 + filenameLen + extraLen;
    if (name === targetName) {
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      if (compression === 0) return compressed.toString("utf8");
      if (compression === 8) return zlib.inflateRawSync(compressed).slice(0, uncompressedSize).toString("utf8");
    }
    offset = dataStart + compressedSize;
  }
  return null;
}

// Parse word/document.xml and return highlighted text spans.
// Adjacent highlighted runs in the same paragraph are merged.
function extractHighlightedSpans(xml: string): string[] {
  const spans: string[] = [];
  const runRe = /<w:r[ >][\s\S]*?<\/w:r>/g;
  let current = "";
  let m: RegExpExecArray | null;

  while ((m = runRe.exec(xml)) !== null) {
    const run = m[0];
    const isHighlighted = /<w:highlight\b/.test(run);
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

// Wrap each highlighted span with ==...== in the markdown.
// Skips spans already wrapped (idempotent on re-run).
function injectHighlightMarkers(markdown: string, spans: string[]): string {
  let result = markdown;
  for (const span of spans) {
    const escaped = span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Don't double-wrap if already marked
    const alreadyMarked = new RegExp(`==${escaped}==`);
    if (alreadyMarked.test(result)) continue;
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

    // Extract highlighted spans directly from the OOXML before mammoth strips them
    const docXml = extractZipEntry(buffer, "word/document.xml");
    const highlightedSpans = docXml ? extractHighlightedSpans(docXml) : [];

    const htmlResult = await mammoth.convertToHtml({ buffer }, { includeDefaultStyleMap: true });

    let content = htmlToMarkdown(htmlResult.value);
    if (highlightedSpans.length > 0) {
      content = injectHighlightMarkers(content, highlightedSpans);
    }

    const title = file.name.replace(/\.docx$/i, "");

    return NextResponse.json({ ok: true, title, content, _debug: {
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
