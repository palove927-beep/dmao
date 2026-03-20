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
    const split = content
      .split(SPLIT_MARKER)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .flatMap(splitAroundImages);
    return mergeShortTitlesWithImages(split);
  }

  const lines = content.split("\n");

  // Detect if this article uses numbered paragraphs
  const numberedLines = lines.filter((l) => NUMBERED_RE.test(l.trimStart()));
  const useNumbered = numberedLines.length >= 2;

  const raw = useNumbered ? splitByNumbers(lines) : splitByBlankLines(lines);

  // Post-process: split any paragraph that contains image lines in the middle
  const split = raw.flatMap(splitAroundImages);

  // Post-process: merge short titles with adjacent image paragraphs
  return mergeShortTitlesWithImages(split);
}

/** Max characters for a short title that should stay with its image */
const SHORT_TITLE_MAX = 20;

/**
 * Merge across paragraph boundaries: if a paragraph ends with a short title
 * and the next paragraph starts with an image, move the title to the next paragraph.
 * Also: if a paragraph is entirely a short title and next starts with an image, merge them.
 */
function mergeShortTitlesWithImages(paragraphs: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const curr = paragraphs[i];
    const next = i + 1 < paragraphs.length ? paragraphs[i + 1] : null;
    const nextFirstLine = next ? next.split("\n")[0].trim() : "";
    const nextStartsWithImage = next !== null && IMAGE_RE.test(nextFirstLine);

    if (nextStartsWithImage) {
      const lines = curr.split("\n");
      const lastLine = lines[lines.length - 1].trim();
      if (curr.trim().length <= SHORT_TITLE_MAX) {
        // Entire paragraph is a short title — merge with next
        paragraphs[i + 1] = curr.trim() + "\n" + next;
        // Don't push curr; it will be part of next
        continue;
      } else if (lastLine.length <= SHORT_TITLE_MAX && lines.length > 1) {
        // Last line is a short title — detach and prepend to next
        const body = lines.slice(0, -1).join("\n").trim();
        if (body) result.push(body);
        paragraphs[i + 1] = lastLine + "\n" + next;
        continue;
      }
    }
    result.push(curr);
  }
  return result;
}

/** Split a single paragraph around image lines */
function splitAroundImages(paragraph: string): string[] {
  const lines = paragraph.split("\n");
  const result: string[] = [];
  let current: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (IMAGE_RE.test(line.trim())) {
      const pendingText = current.join("\n").trim();
      if (pendingText && pendingText.length <= SHORT_TITLE_MAX) {
        // All pending text is a short title — keep with image
        result.push(pendingText + "\n" + line.trim());
      } else if (current.length > 0) {
        // Check if the last line is a short title that belongs with the image
        const lastLine = current[current.length - 1].trim();
        if (lastLine && lastLine.length <= SHORT_TITLE_MAX) {
          // Flush everything except the last line
          const body = current.slice(0, -1).join("\n").trim();
          if (body) result.push(body);
          // Combine last line (short title) with image
          result.push(lastLine + "\n" + line.trim());
        } else {
          // No short title — flush text, image as own paragraph
          if (pendingText) result.push(pendingText);
          result.push(line.trim());
        }
      } else {
        // No pending text — image as its own paragraph
        result.push(line.trim());
      }
      current = [];
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
