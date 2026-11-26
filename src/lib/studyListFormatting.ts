export type ListKind = "unordered" | "ordered";

const UNORDERED_LINE_RE = /^(\s*)([-*•])\s+(.*)$/;
const UNORDERED_EMPTY_RE = /^(\s*)([-*•])\s*$/;
const ORDERED_LINE_RE = /^(\s*)(\d+)([.)])\s+(.*)$/;
const ORDERED_EMPTY_RE = /^(\s*)(\d+)([.)])\s*$/;

export interface ParsedLineMeta {
  raw: string;
  indent: string;
  kind: ListKind | null;
  orderNumber: number | null;
  delimiter: string;
  body: string;
  isEmptyMarker: boolean;
}

export function inspectListLine(line: string): ParsedLineMeta {
  const unorderedMatch = line.match(UNORDERED_LINE_RE);
  if (unorderedMatch) {
    return {
      raw: line,
      indent: unorderedMatch[1],
      kind: "unordered",
      orderNumber: null,
      delimiter: unorderedMatch[2],
      body: unorderedMatch[3],
      isEmptyMarker: unorderedMatch[3].trim().length === 0
    };
  }

  const unorderedEmpty = line.match(UNORDERED_EMPTY_RE);
  if (unorderedEmpty) {
    return {
      raw: line,
      indent: unorderedEmpty[1],
      kind: "unordered",
      orderNumber: null,
      delimiter: unorderedEmpty[2],
      body: "",
      isEmptyMarker: true
    };
  }

  const orderedMatch = line.match(ORDERED_LINE_RE);
  if (orderedMatch) {
    return {
      raw: line,
      indent: orderedMatch[1],
      kind: "ordered",
      orderNumber: Number(orderedMatch[2]),
      delimiter: orderedMatch[3],
      body: orderedMatch[4],
      isEmptyMarker: orderedMatch[4].trim().length === 0
    };
  }

  const orderedEmpty = line.match(ORDERED_EMPTY_RE);
  if (orderedEmpty) {
    return {
      raw: line,
      indent: orderedEmpty[1],
      kind: "ordered",
      orderNumber: Number(orderedEmpty[2]),
      delimiter: orderedEmpty[3],
      body: "",
      isEmptyMarker: true
    };
  }

  const leadingSpaces = (line.match(/^(\s*)/) || ["", ""])[1];
  return {
    raw: line,
    indent: leadingSpaces,
    kind: null,
    orderNumber: null,
    delimiter: "",
    body: line.slice(leadingSpaces.length),
    isEmptyMarker: false
  };
}

function getLineSpanIndices(text: string, selectionStart: number, selectionEnd: number) {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, text.length));

  const lineStartOffset = text.lastIndexOf("\n", Math.max(0, safeStart - 1)) + 1;
  // If selection ends cleanly at index 0 of next line and is a non-empty range, exclude that trailing empty line edge
  const adjustedEnd =
    safeEnd > safeStart && text[safeEnd - 1] === "\n" ? safeEnd - 1 : safeEnd;
  const nextNewline = text.indexOf("\n", adjustedEnd);
  const lineEndOffset = nextNewline === -1 ? text.length : nextNewline;

  const before = text.slice(0, lineStartOffset);
  const block = text.slice(lineStartOffset, lineEndOffset);
  const after = text.slice(lineEndOffset);

  return {
    lineStartOffset,
    lineEndOffset,
    before,
    block,
    after,
    lines: block.split("\n")
  };
}

export function detectActiveListType(
  text: string,
  selectionStart: number,
  selectionEnd: number
): ListKind | null {
  const { lines } = getLineSpanIndices(text, selectionStart, selectionEnd);
  if (lines.length === 0) return null;
  const metas = lines.map(inspectListLine);
  const nonEmptyMetas = metas.filter((m, idx) => idx === 0 || m.raw.trim().length > 0);
  if (nonEmptyMetas.length === 0) return null;
  const firstKind = nonEmptyMetas[0].kind;
  if (!firstKind) return null;
  return nonEmptyMetas.every(m => m.kind === firstKind) ? firstKind : null;
}

export function toggleLineListFormat(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  targetKind: ListKind
): { nextText: string; nextSelectionStart: number; nextSelectionEnd: number } {
  const { lineStartOffset, before, after, lines } = getLineSpanIndices(
    text,
    selectionStart,
    selectionEnd
  );

  const metas = lines.map(inspectListLine);
  const relevantMetas = metas.filter(m => m.raw.trim().length > 0);
  const allAlreadyTarget =
    (relevantMetas.length > 0 ? relevantMetas : metas).every(m => m.kind === targetKind);

  let nextNumber = 1;
  if (targetKind === "ordered" && !allAlreadyTarget) {
    // Check preceding line at same indent to continue numbering seamlessly
    const precedingChunk = before.endsWith("\n") ? before.slice(0, -1) : before;
    if (precedingChunk.length > 0) {
      const prevLineStart = precedingChunk.lastIndexOf("\n") + 1;
      const prevLine = precedingChunk.slice(prevLineStart);
      const prevMeta = inspectListLine(prevLine);
      if (
        prevMeta.kind === "ordered" &&
        prevMeta.orderNumber !== null &&
        prevMeta.indent === metas[0].indent
      ) {
        nextNumber = prevMeta.orderNumber + 1;
      }
    }
  }

  let runningNum = nextNumber;
  const updatedLines = metas.map((meta, idx) => {
    if (lines.length > 1 && meta.raw.trim().length === 0) {
      return meta.raw;
    }

    if (allAlreadyTarget) {
      return `${meta.indent}${meta.body}`;
    }

    const prefix =
      targetKind === "unordered" ? "- " : `${runningNum++}. `;
    return `${meta.indent}${prefix}${meta.body}`;
  });

  const nextBlock = updatedLines.join("\n");
  const nextText = `${before}${nextBlock}${after}`;

  if (selectionStart === selectionEnd) {
    // Keep cursor nicely inside the single toggled line
    const firstOldLen = lines[0]?.length ?? 0;
    const firstNewLen = updatedLines[0]?.length ?? 0;
    const delta = firstNewLen - firstOldLen;
    const pos = Math.max(lineStartOffset, selectionStart + delta);
    return {
      nextText,
      nextSelectionStart: pos,
      nextSelectionEnd: pos
    };
  }

  return {
    nextText,
    nextSelectionStart: lineStartOffset,
    nextSelectionEnd: lineStartOffset + nextBlock.length
  };
}

export function shiftListLinesIndent(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  direction: "indent" | "outdent"
): { nextText: string; nextSelectionStart: number; nextSelectionEnd: number } {
  const { lineStartOffset, before, after, lines } = getLineSpanIndices(
    text,
    selectionStart,
    selectionEnd
  );

  let firstDelta = 0;
  let totalDelta = 0;

  const updatedLines = lines.map((line, idx) => {
    let nextLine = line;
    if (direction === "indent") {
      if (line.trim().length > 0 || lines.length === 1) {
        nextLine = `  ${line}`;
      }
    } else {
      if (line.startsWith("  ")) {
        nextLine = line.slice(2);
      } else if (line.startsWith("\t") || line.startsWith(" ")) {
        nextLine = line.slice(1);
      }
    }
    const d = nextLine.length - line.length;
    if (idx === 0) firstDelta = d;
    totalDelta += d;
    return nextLine;
  });

  const nextBlock = updatedLines.join("\n");
  const nextText = `${before}${nextBlock}${after}`;

  if (selectionStart === selectionEnd) {
    const nextPos = Math.max(lineStartOffset, selectionStart + firstDelta);
    return { nextText, nextSelectionStart: nextPos, nextSelectionEnd: nextPos };
  }

  return {
    nextText,
    nextSelectionStart: Math.max(lineStartOffset, selectionStart + firstDelta),
    nextSelectionEnd: Math.max(lineStartOffset, selectionEnd + totalDelta)
  };
}

export function getListContinuationOnEnter(
  text: string,
  selectionStart: number,
  selectionEnd: number
): { handled: boolean; nextText: string; nextCursorPos: number } | null {
  if (selectionStart !== selectionEnd) return null;

  const lineStart = text.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndRaw = text.indexOf("\n", selectionStart);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  const currentLine = text.slice(lineStart, lineEnd);
  const meta = inspectListLine(currentLine);

  if (!meta.kind) return null;

  // Ensure cursor is past the marker prefix, or handle naturally
  const markerLen =
    meta.indent.length +
    (meta.kind === "unordered"
      ? meta.delimiter.length + 1
      : `${meta.orderNumber}${meta.delimiter} `.length);

  if (selectionStart < lineStart + Math.min(markerLen, currentLine.length)) {
    return null;
  }

  if (meta.isEmptyMarker) {
    // Exit the list cleanly by removing the empty marker on this line
    const nextText = `${text.slice(0, lineStart)}${meta.indent}${text.slice(lineEnd)}`;
    const nextPos = lineStart + meta.indent.length;
    return { handled: true, nextText, nextCursorPos: nextPos };
  }

  const nextMarker =
    meta.kind === "unordered"
      ? `${meta.indent}${meta.delimiter} `
      : `${meta.indent}${(meta.orderNumber || 1) + 1}${meta.delimiter} `;

  const beforeCursor = text.slice(0, selectionStart);
  const afterCursor = text.slice(selectionStart);
  const nextText = `${beforeCursor}\n${nextMarker}${afterCursor}`;
  const nextCursorPos = selectionStart + 1 + nextMarker.length;

  return { handled: true, nextText, nextCursorPos };
}

export interface StudyTextListItem {
  text: string;
  children: StudyTextListBlock[];
}

export interface StudyTextListBlock {
  type: "list";
  ordered: boolean;
  start: number;
  items: StudyTextListItem[];
}

export interface StudyTextParagraphBlock {
  type: "paragraph";
  lines: string[];
}

export interface StudyTextHeadingBlock {
  type: "heading";
  level: number;
  text: string;
}

export type StudyTextBlock = StudyTextListBlock | StudyTextParagraphBlock | StudyTextHeadingBlock;

const HEADING_LINE_RE = /^(#{1,4})\s+(.+)$/;

function parseListRecursive(
  lines: string[],
  startIndex: number,
  baseIndent: number
): { block: StudyTextListBlock; nextIndex: number } {
  const firstMeta = inspectListLine(lines[startIndex]);
  const ordered = firstMeta.kind === "ordered";
  const start = ordered && firstMeta.orderNumber ? firstMeta.orderNumber : 1;
  const items: StudyTextListItem[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0) {
      // Check if list continues at same or deeper indent after a blank line
      const lookahead = lines[i + 1];
      if (lookahead !== undefined) {
        const nextMeta = inspectListLine(lookahead);
        if (nextMeta.kind && nextMeta.indent.length >= baseIndent) {
          i++;
          continue;
        }
      }
      break;
    }

    const meta = inspectListLine(line);
    if (!meta.kind) break;

    const indentLen = meta.indent.length;
    if (indentLen < baseIndent) {
      break;
    }

    if (indentLen > baseIndent) {
      // Nested sublist attached to the previous item if one exists
      if (items.length > 0) {
        const nested = parseListRecursive(lines, i, indentLen);
        items[items.length - 1].children.push(nested.block);
        i = nested.nextIndex;
        continue;
      }
      // No parent item yet — flatten to current base indent
    }

    if ((meta.kind === "ordered") !== ordered && indentLen === baseIndent) {
      break;
    }

    items.push({
      text: meta.body,
      children: []
    });
    i++;
  }

  return {
    block: { type: "list", ordered, start, items },
    nextIndex: i
  };
}

export function parseStudyTextBlocks(text: string): StudyTextBlock[] {
  if (!text || !text.trim()) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: StudyTextBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0) {
      i++;
      continue;
    }

    const headingMatch = line.trim().match(HEADING_LINE_RE);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim()
      });
      i++;
      continue;
    }

    const meta = inspectListLine(line);
    if (meta.kind) {
      const { block, nextIndex } = parseListRecursive(lines, i, meta.indent.length);
      blocks.push(block);
      i = nextIndex;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (cur.trim().length === 0) break;
      if (cur.trim().match(HEADING_LINE_RE)) break;
      if (inspectListLine(cur).kind) break;
      paraLines.push(cur);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paraLines });
    }
  }

  return blocks;
}
