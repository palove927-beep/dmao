import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { inflateRawSync } from "zlib";

// Extract word/document.xml from the docx ZIP using the Central Directory.
// The Central Directory always has the correct compSize, even when local
// file headers use the data-descriptor flag (bit 3, compSize=0).
function extractDocumentXml(buffer: Buffer): string | null {
  try {
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
    let pos = cdOffset;

    while (pos < cdOffset + cdSize && pos + 46 <= buffer.length) {
      if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
      const method      = buffer.readUInt16LE(pos + 10);
      const compSize    = buffer.readUInt32LE(pos + 20);
      const fnLen       = buffer.readUInt16LE(pos + 28);
      const extraLen    = buffer.readUInt16LE(pos + 30);
      const commentLen  = buffer.readUInt16LE(pos + 32);
      const localOffset = buffer.readUInt32LE(pos + 42);
      const fn = buffer.subarray(pos + 46, pos + 46 + fnLen).toString("utf8");

      if (fn === "word/document.xml") {
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

function isColoredFill(rPrXml: string): boolean {
  const m = rPrXml.match(/<w:shd\b[^>]*\/>/);
  if (!m) return false;
  const fill = (m[0].match(/w:fill="([^"]+)"/i)?.[1] ?? "").toLowerCase();
  return !!fill && fill !== "auto" && fill !== "ffffff" && fill !== "f2f2f2";
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// Collect text spans from runs that have non-white character shading (w:shd in w:rPr).
// Adjacent highlighted runs within the same paragraph are merged into one span.
function getShadedRunTexts(xml: string): Set<string> {
  const result = new Set<string>();
  const paraParts = xml.split(/<w:p\b/);

  for (let i = 1; i < paraParts.length; i++) {
    const pEnd = paraParts[i].indexOf("</w:p>");
    if (pEnd === -1) continue;
    const paraXml = paraParts[i].slice(0, pEnd);

    let buf: string[] = [];
    const runParts = paraXml.split(/<w:r\b/);

    for (let j = 1; j < runParts.length; j++) {
      const rEnd = runParts[j].indexOf("</w:r>");
      if (rEnd === -1) continue;
      const runXml = runParts[j].slice(0, rEnd);
      const rPrMatch = runXml.match(/<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/);
      const highlighted = rPrMatch ? isColoredFill(rPrMatch[1]) : false;

      if (highlighted) {
        const texts: string[] = [];
        const re = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(runXml)) !== null) texts.push(m[1]);
        buf.push(...texts);
      } else if (buf.length > 0) {
        const text = decodeXmlEntities(buf.join("")).trim();
        if (text) result.add(text);
        buf = [];
      }
    }
    if (buf.length > 0) {
      const text = decodeXmlEntities(buf.join("")).trim();
      if (text) result.add(text);
    }
  }
  return result;
}

function htmlToMarkdown(html: string): string {
  let result = html;
  // Merge adjacent <mark> elements (mammoth creates one per run for w:highlight)
  result = result.replace(/<\/mark>\s*<mark[^>]*>/gi, "");
  // Convert text highlights (w:highlight → mammoth → <mark>) to ==text==
  result = result.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, "==$1==");
  result = result.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, "\n![圖片]($1)\n");
  result = result.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, "\n");
  result = result.replace(/<[^>]+>/g, "");
  result = result
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

// Wrap content lines that match shaded texts with ==...==
function applyHighlights(content: string, shaded: Set<string>): string {
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

    // Detect run-level character shading (w:shd in w:rPr) which mammoth ignores
    let shadedTexts = new Set<string>();
    try {
      const xml = extractDocumentXml(buffer);
      if (xml) shadedTexts = getShadedRunTexts(xml);
    } catch { /* fall through */ }

    const htmlResult = await mammoth.convertToHtml({ buffer });
    let content = htmlToMarkdown(htmlResult.value);
    content = applyHighlights(content, shadedTexts);

    // Debug: sample of XML around first w:shd in w:rPr
    let debugRprShdSample = "";
    try {
      const xml = extractDocumentXml(buffer);
      if (xml) {
        // Find first <w:shd inside a <w:rPr block
        const rPrIdx = xml.indexOf("<w:rPr");
        if (rPrIdx !== -1) {
          const chunk = xml.slice(rPrIdx, rPrIdx + 600);
          debugRprShdSample = chunk;
        }
      }
    } catch { /* ignore */ }

    const title = file.name.replace(/\.docx$/i, "");
    return NextResponse.json({
      ok: true, title, content,
      _debug: {
        shadedCount: shadedTexts.size,
        shadedTexts: Array.from(shadedTexts).slice(0, 3),
        markInHtml: htmlResult.value.toLowerCase().includes("<mark"),
        rprShdSample: debugRprShdSample,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }
}
