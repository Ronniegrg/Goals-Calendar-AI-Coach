import { StudyArtifactNote } from "../types";

export function createEmptyTableHeaders(cols = 3): string[] {
  return Array.from({ length: cols }, () => "");
}

export function createEmptyTableRows(rows = 3, cols = 3): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function formatTableAsMarkdown(headers: string[], rows: string[][]): string {
  const colCount = Math.max(
    headers.length,
    ...rows.map((r) => r.length),
    1
  );
  const resolvedHeaders = Array.from({ length: colCount }, (_, idx) => {
    const h = (headers[idx] || "").trim();
    return escapeMarkdownCell(h || `Column ${idx + 1}`);
  });
  const headerLine = `| ${resolvedHeaders.join(" | ")} |`;
  const dividerLine = `| ${resolvedHeaders.map(() => "---").join(" | ")} |`;
  const bodyLines = rows.map((row) => {
    const cells = Array.from({ length: colCount }, (_, idx) =>
      escapeMarkdownCell(row[idx] || "")
    );
    return `| ${cells.join(" | ")} |`;
  });
  return [headerLine, dividerLine, ...bodyLines].join("\n");
}

export function normalizeTableDraft(
  rawHeaders: string[],
  rawRows: string[][]
): { headers: string[]; rows: string[][]; hasContent: boolean } {
  const maxCols = Math.max(
    rawHeaders.length,
    ...rawRows.map((r) => r.length),
    1
  );

  // Trim trailing completely-empty columns if more than 1 column exists
  let lastNonEmptyCol = -1;
  for (let c = 0; c < maxCols; c += 1) {
    const hasHeaderText = (rawHeaders[c] || "").trim().length > 0;
    const hasRowText = rawRows.some((r) => (r[c] || "").trim().length > 0);
    if (hasHeaderText || hasRowText) {
      lastNonEmptyCol = c;
    }
  }

  if (lastNonEmptyCol === -1) {
    return { headers: [], rows: [], hasContent: false };
  }

  const colCount = lastNonEmptyCol + 1;
  const headers = Array.from({ length: colCount }, (_, c) => {
    const val = (rawHeaders[c] || "").trim();
    return val || `Column ${c + 1}`;
  });

  const rows = rawRows
    .map((row) =>
      Array.from({ length: colCount }, (_, c) => (row[c] || "").trim())
    )
    .filter((row) => row.some((cell) => cell.length > 0));

  const hasContent =
    rawHeaders.some((h) => h.trim().length > 0) || rows.length > 0;

  return { headers, rows, hasContent };
}

function splitMarkdownPipeRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i += 1;
    } else if (trimmed[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += trimmed[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseDelimitedOrMarkdownTable(
  raw: string
): { headers: string[]; rows: string[][] } | null {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  const isMarkdownPipe = lines.some((l) => l.includes("|"));
  let parsedLines: string[][] = [];

  if (isMarkdownPipe) {
    const separatorRegex = /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/;
    const filtered = lines.filter((l) => !separatorRegex.test(l));
    parsedLines = filtered.map(splitMarkdownPipeRow);
  } else if (lines.some((l) => l.includes("\t"))) {
    parsedLines = lines.map((l) => l.split("\t").map((c) => c.trim()));
  } else if (lines.some((l) => l.includes(","))) {
    parsedLines = lines.map(splitCsvLine);
  } else {
    return null;
  }

  if (parsedLines.length === 0) return null;

  const colCount = Math.max(...parsedLines.map((r) => r.length), 1);
  if (colCount === 0) return null;

  const headers = Array.from({ length: colCount }, (_, idx) =>
    parsedLines[0]?.[idx] ?? `Column ${idx + 1}`
  );
  const body = parsedLines
    .slice(1)
    .map((row) => Array.from({ length: colCount }, (_, idx) => row[idx] ?? ""));

  return {
    headers,
    rows: body.length > 0 ? body : [Array.from({ length: colCount }, () => "")]
  };
}

export function resolveNoteTableData(
  note: Pick<StudyArtifactNote, "category" | "tableHeaders" | "tableRows" | "content">
): { headers: string[]; rows: string[][] } | null {
  if (Array.isArray(note.tableHeaders) && note.tableHeaders.length > 0) {
    const colCount = Math.max(
      note.tableHeaders.length,
      ...(Array.isArray(note.tableRows) ? note.tableRows.map((r) => r.length) : [0])
    );
    const headers = Array.from(
      { length: colCount },
      (_, idx) => String(note.tableHeaders?.[idx] ?? `Column ${idx + 1}`)
    );
    const rows = Array.isArray(note.tableRows)
      ? note.tableRows.map((r) =>
          Array.from({ length: colCount }, (_, idx) => String(r?.[idx] ?? ""))
        )
      : [];
    return { headers, rows };
  }

  if (note.category === "table" && note.content) {
    return parseDelimitedOrMarkdownTable(note.content);
  }

  return null;
}
