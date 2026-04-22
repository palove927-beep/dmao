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

// Recursively walk the mammoth document tree and mark highlighted runs
// with a custom styleName so the style map can match them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _highlightCount = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _runSamples: object[] = [];
const _elementTypes = new Set<string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function markHighlightedRuns(element: any): any {
  if (Array.isArray(element)) return element.map(markHighlightedRuns);
  if (!element || typeof element !== "object") return element;
  const children = element.children
    ? { children: markHighlightedRuns(element.children) }
    : {};
  // Track all unique element types
  if (element.type) _elementTypes.add(String(element.type));
  // Sample first 3 run-type elements to understand the schema
  if (element.type === "run" && _runSamples.length < 3) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { children: _c, ...rest } = element;
    _runSamples.push(rest);
  }
  // Check multiple possible property names mammoth may use for highlight
  const hasHighlight = element.highlight ||
    element.isHighlighted ||
    element.backgroundColor ||
    element.highlightColor;
  if (hasHighlight) {
    _highlightCount++;
    return { ...element, ...children, styleName: "DmaoHighlight" };
  }
  return { ...element, ...children };
}

function htmlToMarkdown(html: string): string {
  // Simple HTML-to-markdown conversion preserving images
  let result = html;

  // Convert images: <img src="..."> → ![圖片](...)
  result = result.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, "\n![圖片]($1)\n");

  // Preserve Word highlights as ==...== before stripping tags
  result = result.replace(/<mark>(.*?)<\/mark>/gi, "==$1==");

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
    _highlightCount = 0;
    _runSamples.length = 0;
    _elementTypes.clear();

    // Inspect raw XML to confirm highlight tags exist in the docx
    const docXml = extractZipEntry(buffer, "word/document.xml");
    const xmlHighlightCount = docXml ? (docXml.match(/<w:highlight\b/g) || []).length : -1;
    const xmlHighlightSample = docXml
      ? docXml.match(/<w:highlight[^/]*\/>/g)?.slice(0, 5) ?? []
      : [];
    const htmlResult = await mammoth.convertToHtml(
      { buffer },
      {
        transformDocument: markHighlightedRuns,
        styleMap: ["r[style-name='DmaoHighlight'] => mark"],
        includeDefaultStyleMap: true,
      },
    );
    const content = htmlToMarkdown(htmlResult.value);
    const title = file.name.replace(/\.docx$/i, "");
    const hasMarkInHtml = htmlResult.value.includes("<mark>");
    const hasMarkInContent = content.includes("==");

    return NextResponse.json({ ok: true, title, content, _debug: {
      highlightRunsFound: _highlightCount,
      hasMarkInHtml,
      hasMarkInContent,
      htmlSample: htmlResult.value.slice(0, 500),
      messages: htmlResult.messages,
      runSamples: _runSamples,
      elementTypes: [..._elementTypes],
      xmlHighlightCount,
      xmlHighlightSample,
    } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}
