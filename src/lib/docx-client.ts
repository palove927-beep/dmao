// Client-side DOCX → markdown converter.
// Replaces /api/docx so large files (>4.5MB Vercel body limit) can be imported.
// Images become blob URLs registered with the caller; deferred S3 upload is preserved.

import mammoth from "mammoth";
import JSZip from "jszip";

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

// Inline-wrap detected shaded spans with ==...== within each content line
function applyHighlights(content: string, shaded: Set<string>): string {
  if (shaded.size === 0) return content;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const shadedNorms = Array.from(shaded).map(norm).filter((s) => s.length > 10);
  if (shadedNorms.length === 0) return content;
  return content.split("\n").map((line) => {
    let result = line;
    for (const s of shadedNorms) {
      const literalIdx = result.indexOf(s);
      if (literalIdx !== -1) {
        result = result.slice(0, literalIdx) + `==${s}==` + result.slice(literalIdx + s.length);
      }
    }
    return result;
  }).join("\n");
}

export type DocxImportResult = { title: string; content: string };

export async function importDocxClient(
  file: File,
  registerImage: (file: File) => string
): Promise<DocxImportResult> {
  const arrayBuffer = await file.arrayBuffer();

  // Detect run-level character shading (w:shd in w:rPr) which mammoth ignores
  let shaded = new Set<string>();
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (xml) shaded = getShadedRunTexts(xml);
  } catch { /* fall through */ }

  let imgIndex = 0;
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read("base64");
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const contentType = image.contentType || "image/png";
        const ext = contentType.split("/")[1] || "png";
        const blob = new Blob([bytes], { type: contentType });
        const imgFile = new File([blob], `docx-image-${imgIndex++}.${ext}`, { type: contentType });
        const src = registerImage(imgFile);
        return { src };
      }),
    }
  );

  let content = htmlToMarkdown(result.value);
  content = applyHighlights(content, shaded);

  const title = file.name.replace(/\.docx$/i, "");
  return { title, content };
}
