import React, { useState } from "react";
import { Plus, X, Table2, ClipboardPaste, Eye, EyeOff } from "lucide-react";
import { parseDelimitedOrMarkdownTable } from "../lib/tableNote";

interface TableNoteEditorProps {
  headers: string[];
  rows: string[][];
  onChange: (headers: string[], rows: string[][]) => void;
  compact?: boolean;
}

export const TableNoteEditor: React.FC<TableNoteEditorProps> = ({
  headers,
  rows,
  onChange,
  compact = false
}) => {
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteRaw, setPasteRaw] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const colCount = Math.max(headers.length, 1);

  const handleHeaderChange = (colIdx: number, value: string) => {
    const nextHeaders = [...headers];
    nextHeaders[colIdx] = value;
    onChange(nextHeaders, rows);
  };

  const handleCellChange = (rowIdx: number, colIdx: number, value: string) => {
    const nextRows = rows.map((r, rIdx) =>
      rIdx === rowIdx
        ? Array.from({ length: colCount }, (_, c) => (c === colIdx ? value : r[c] || ""))
        : r
    );
    onChange(headers, nextRows);
  };

  const handleAddColumn = () => {
    if (colCount >= 8) return;
    onChange(
      [...headers, ""],
      rows.map((r) => [...r, ""])
    );
  };

  const handleRemoveColumn = (colIdx: number) => {
    if (colCount <= 1) return;
    onChange(
      headers.filter((_, i) => i !== colIdx),
      rows.map((r) => r.filter((_, i) => i !== colIdx))
    );
  };

  const handleAddRow = () => {
    if (rows.length >= 25) return;
    onChange(headers, [...rows, Array.from({ length: colCount }, () => "")]);
  };

  const handleRemoveRow = (rowIdx: number) => {
    if (rows.length <= 1) return;
    onChange(
      headers,
      rows.filter((_, i) => i !== rowIdx)
    );
  };

  const handleApplyPastedTable = () => {
    const parsed = parseDelimitedOrMarkdownTable(pasteRaw);
    if (!parsed) {
      setPasteError("Paste a Markdown table (| a | b |), Google Sheets/Excel cells, or comma-separated lines.");
      return;
    }
    setPasteError(null);
    onChange(parsed.headers.slice(0, 8), parsed.rows.slice(0, 25).map((r) => r.slice(0, 8)));
    setPasteRaw("");
    setShowPasteBox(false);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <Table2 className="w-3.5 h-3.5 shrink-0" />
            <span>Study Table</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {colCount} cols × {rows.length} rows
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setShowPasteBox((prev) => !prev);
              setPasteError(null);
            }}
            className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-300 dark:border-white/15 text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <ClipboardPaste className="w-3 h-3 text-violet-600 dark:text-violet-400" />
            <span>{showPasteBox ? "Close Import" : "Paste Table"}</span>
          </button>
          <button
            type="button"
            onClick={handleAddColumn}
            disabled={colCount >= 8}
            className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/35 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Col</span>
          </button>
          <button
            type="button"
            onClick={handleAddRow}
            disabled={rows.length >= 25}
            className="px-2 py-1 rounded-md bg-violet-50 hover:bg-violet-100 dark:bg-violet-500/15 dark:hover:bg-violet-500/25 border border-violet-300 dark:border-violet-500/35 text-[11px] font-semibold text-violet-800 dark:text-violet-300 inline-flex items-center gap-1 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Row</span>
          </button>
        </div>
      </div>

      {showPasteBox && (
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-violet-300 dark:border-violet-700/40 space-y-2">
          <textarea
            rows={3}
            placeholder={"Paste Markdown table, Excel/Sheets copy, or CSV:\nProtocol | Port | Transport\nDNS | 53 | UDP/TCP\nHTTPS | 443 | TCP"}
            value={pasteRaw}
            onChange={(e) => {
              setPasteRaw(e.target.value);
              if (pasteError) setPasteError(null);
            }}
            className="w-full px-2.5 py-2 rounded-md bg-white dark:bg-[#0b0e18] border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-violet-500"
          />
          {pasteError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">{pasteError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPasteBox(false)}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyPastedTable}
              disabled={!pasteRaw.trim()}
              className="keep-white px-3 py-1 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-45 !text-white text-[11px] font-semibold cursor-pointer"
            >
              Fill Grid
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-300 dark:border-slate-700/70 bg-white dark:bg-[#0b0e18]">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-emerald-50/90 dark:bg-emerald-950/35 border-b border-slate-300 dark:border-slate-700/70">
              {headers.map((header, colIdx) => (
                <th
                  key={`h_${colIdx}`}
                  className="p-1.5 border-r border-slate-200 dark:border-slate-800 last:border-r-0 min-w-[110px]"
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      placeholder={`Column ${colIdx + 1}`}
                      value={header}
                      onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                      className={`w-full min-w-0 bg-white dark:bg-slate-900/90 border border-emerald-300/80 dark:border-emerald-700/40 rounded px-2 ${
                        compact ? "py-1 text-[11px]" : "py-1.5 text-xs"
                      } font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500`}
                    />
                    {colCount > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveColumn(colIdx)}
                        title={`Remove column ${colIdx + 1}`}
                        className="p-0.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {rows.length > 1 && <th className="w-7 p-1" aria-label="Row actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={`r_${rowIdx}`}
                className="border-b border-slate-200 dark:border-slate-800/80 last:border-b-0 odd:bg-white even:bg-slate-50/60 dark:odd:bg-[#0b0e18] dark:even:bg-slate-900/40"
              >
                {Array.from({ length: colCount }, (_, colIdx) => (
                  <td
                    key={`c_${rowIdx}_${colIdx}`}
                    className="p-1.5 border-r border-slate-200 dark:border-slate-800 last:border-r-0"
                  >
                    <input
                      type="text"
                      placeholder={rowIdx === 0 && colIdx === 0 ? "Value..." : ""}
                      value={row[colIdx] || ""}
                      onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                      className={`w-full min-w-0 bg-transparent border border-slate-200/80 dark:border-slate-800 rounded px-2 ${
                        compact ? "py-1 text-[11px]" : "py-1.5 text-xs"
                      } text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:bg-white dark:focus:bg-slate-900`}
                    />
                  </td>
                ))}
                {rows.length > 1 && (
                  <td className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(rowIdx)}
                      title={`Remove row ${rowIdx + 1}`}
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface StudyNoteTableViewProps {
  headers: string[];
  rows: string[][];
  compact?: boolean;
}

export const StudyNoteTableView: React.FC<StudyNoteTableViewProps> = ({
  headers,
  rows,
  compact = false
}) => {
  const [recallMode, setRecallMode] = useState(false);
  const [revealedCells, setRevealedCells] = useState<Record<string, boolean>>({});

  const canRecall = headers.length >= 2 && rows.length >= 1;

  const toggleCellReveal = (key: string) => {
    setRevealedCells((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
          <Table2 className="w-3 h-3" />
          <span>
            {headers.length} {headers.length === 1 ? "Col" : "Cols"} × {rows.length}{" "}
            {rows.length === 1 ? "Row" : "Rows"}
          </span>
        </span>
        {canRecall && (
          <button
            type="button"
            onClick={() => {
              setRecallMode((prev) => !prev);
              setRevealedCells({});
            }}
            className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200 underline cursor-pointer"
          >
            {recallMode ? (
              <>
                <Eye className="w-3 h-3" />
                <span>Show All Cells</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3 h-3" />
                <span>Recall Mode (Hide Answers)</span>
              </>
            )}
          </button>
        )}
      </div>

      <div
        className={`overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 ${
          compact ? "max-h-44" : "max-h-64"
        } overflow-y-auto custom-scrollbar`}
      >
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-emerald-50 dark:bg-emerald-950/80 border-b border-slate-200 dark:border-slate-800">
            <tr>
              {headers.map((header, idx) => (
                <th
                  key={`th_${idx}`}
                  className="px-2.5 py-2 font-semibold text-emerald-950 dark:text-emerald-200 border-r border-slate-200 dark:border-slate-800 last:border-r-0 whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-2.5 text-center italic text-slate-500 dark:text-slate-400"
                >
                  No data rows added yet.
                </td>
              </tr>
            ) : (
              rows.map((row, rIdx) => (
                <tr
                  key={`tr_${rIdx}`}
                  className="border-b border-slate-200/80 dark:border-slate-800/70 last:border-b-0 odd:bg-white even:bg-slate-50/75 dark:odd:bg-slate-950/30 dark:even:bg-slate-900/40"
                >
                  {headers.map((_, cIdx) => {
                    const cellText = row[cIdx] || "";
                    const cellKey = `${rIdx}_${cIdx}`;
                    const isHidden =
                      recallMode && cIdx > 0 && cellText.trim().length > 0 && !revealedCells[cellKey];
                    return (
                      <td
                        key={`td_${rIdx}_${cIdx}`}
                        className={`px-2.5 py-1.5 border-r border-slate-200/80 dark:border-slate-800/70 last:border-r-0 align-top ${
                          cIdx === 0
                            ? "font-medium text-slate-900 dark:text-slate-100"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {isHidden ? (
                          <button
                            type="button"
                            onClick={() => toggleCellReveal(cellKey)}
                            className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 border border-dashed border-emerald-400/70 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 cursor-pointer"
                            title="Click to reveal cell"
                          >
                            Click to reveal
                          </button>
                        ) : (
                          <span
                            onClick={() => {
                              if (recallMode && cIdx > 0 && cellText.trim().length > 0) {
                                toggleCellReveal(cellKey);
                              }
                            }}
                            className={`whitespace-pre-wrap break-words ${
                              recallMode && cIdx > 0 && cellText.trim().length > 0 ? "cursor-pointer" : ""
                            }`}
                          >
                            {cellText || "—"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
