/**
 * Split article content into paragraphs.
 *
 * Priority order:
 * 1. <!-- split --> markers — explicit manual splits (highest priority)
 * 2. Numbered paragraphs (e.g., "1.", "2.", "(1)")
 * 3. Blank lines (fallback)
 *
 * Image lines (![...](url)) always act as paragraph boundaries.
 */

// Matches top-level numbered paragraph starts: "1. ", "2) ", "(1) ", etc.
const NUMBERED_RE = /^(?:\d+[.)]\s|\(\d+\)\s)/;
const IMAGE_RE = /^!\[[^\]]*\]\([^)]+\)\s*$/;
const SPLIT_MARKER = "<!-- split -->";

export function splitParagraphs(content: string): string[] {
  // If explicit split markers exist, use them as the primary splitter
  if (content.includes(SPLIT_MARKER)) {
    return content
      .split(SPLIT_MARKER)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .flatMap(splitAroundImages);
  }

  const lines = content.split("\n");

  // Detect if this article uses numbered paragraphs
  const numberedLines = lines.filter((l) => NUMBERED_RE.test(l.trimStart()));
  const useNumbered = numberedLines.length >= 2;

  const raw = useNumbered ? splitByNumbers(lines) : splitByBlankLines(lines);

  // Post-process: split any paragraph that contains image lines in the middle
  return raw.flatMap(splitAroundImages);
}

/** Split a single paragraph around image lines */
function splitAroundImages(paragraph: string): string[] {
  const lines = paragraph.split("\n");
  const result: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (IMAGE_RE.test(line.trim())) {
      // Flush text before the image
      if (current.length > 0) {
        const text = current.join("\n").trim();
        if (text) result.push(text);
        current = [];
      }
      // Image as its own paragraph
      result.push(line.trim());
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    const text = current.join("\n").trim();
    if (text) result.push(text);
  }

  return result;
}

function splitByNumbers(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (NUMBERED_RE.test(trimmed) && current.length > 0) {
      paragraphs.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) {
    const text = current.join("\n").trim();
    if (text) paragraphs.push(text);
  }

  return paragraphs.filter((p) => p.length > 0);
}

function splitByBlankLines(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        paragraphs.push(current.join("\n").trim());
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    const text = current.join("\n").trim();
    if (text) paragraphs.push(text);
  }

  return paragraphs;
}
