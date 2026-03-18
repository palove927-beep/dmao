/**
 * Split article content into paragraphs using a hybrid approach:
 * 1. If numbered paragraphs are detected (e.g., "1.", "2.", "(1)", "a.", "b."),
 *    split by those markers.
 * 2. Otherwise, fall back to splitting by blank lines / newlines.
 *
 * Image lines (![...](url)) are merged into the preceding paragraph.
 */

// Matches top-level numbered paragraph starts: "1. ", "2) ", "(1) ", etc.
const NUMBERED_RE = /^(?:\d+[.)]\s|\(\d+\)\s)/;

export function splitParagraphs(content: string): string[] {
  const lines = content.split("\n");

  // Detect if this article uses numbered paragraphs
  const numberedLines = lines.filter((l) => NUMBERED_RE.test(l.trimStart()));
  const useNumbered = numberedLines.length >= 2;

  if (useNumbered) {
    return splitByNumbers(lines);
  }
  return splitByBlankLines(lines);
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

  // If there was content before the first numbered paragraph, keep it
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
