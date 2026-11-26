import React from "react";
import { AlertTriangle, ArrowRight, CheckSquare, Square } from "lucide-react";
import { DuplicateNoteMatch } from "../lib/noteDuplicateCheck";

export const HighlightedDuplicateText: React.FC<{
  text: string;
  matchedWords: string[];
  maxLength?: number;
  className?: string;
}> = ({ text, matchedWords, maxLength, className = "" }) => {
  const trimmed = maxLength && text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
  const wordSet = React.useMemo(
    () => new Set(matchedWords.map(w => w.toLowerCase()).filter(w => w.length >= 2)),
    [matchedWords]
  );

  if (wordSet.size === 0) {
    return <span className={className}>{trimmed}</span>;
  }

  // Split preserving separators so original spacing and punctuation stay intact
  const tokens = trimmed.split(/([a-zA-Z0-9+#.-]+)/g);

  return (
    <span className={className}>
      {tokens.map((tok, idx) => {
        const clean = tok.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9+#]+$/g, "");
        if (clean && wordSet.has(clean)) {
          return (
            <mark
              key={idx}
              className="px-0.5 rounded bg-amber-300/80 text-amber-950 dark:bg-amber-400/35 dark:text-amber-100 font-semibold"
            >
              {tok}
            </mark>
          );
        }
        return <React.Fragment key={idx}>{tok}</React.Fragment>;
      })}
    </span>
  );
};

interface DuplicateWarningBannerProps {
  matches: DuplicateNoteMatch[];
  allowDuplicateSave: boolean;
  onToggleAllowDuplicate: (allowed: boolean) => void;
  onViewExistingNote?: (noteId: string) => void;
  compact?: boolean;
  wasBlockedOnSave?: boolean;
}

export const DuplicateWarningBanner: React.FC<DuplicateWarningBannerProps> = ({
  matches,
  allowDuplicateSave,
  onToggleAllowDuplicate,
  onViewExistingNote,
  compact = false,
  wasBlockedOnSave = false
}) => {
  if (!matches || matches.length === 0) return null;

  const topMatch = matches[0];
  const isExactOrNear = topMatch.similarityPercent >= 82;

  return (
    <div
      role="alert"
      className={`rounded-xl border transition-all animate-fadeIn ${
        wasBlockedOnSave
          ? "border-rose-400 bg-rose-50/95 ring-2 ring-rose-400/50 dark:border-rose-500/70 dark:bg-rose-950/45 dark:ring-rose-500/35"
          : isExactOrNear
          ? "border-amber-400 bg-amber-50/95 dark:border-amber-500/60 dark:bg-amber-950/35"
          : "border-amber-300 bg-amber-50/80 dark:border-amber-600/45 dark:bg-amber-950/25"
      } ${compact ? "p-2.5 space-y-2" : "p-3.5 space-y-2.5"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-amber-950 dark:text-amber-200 font-bold text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />
          <span>
            {wasBlockedOnSave
              ? "Duplicate Note Detected — Not Added Again"
              : topMatch.matchType === "exact"
              ? "Already Added (Exact Match Found)"
              : `Similar Note Already Saved (${topMatch.similarityPercent}% Match)`}
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-200/80 text-amber-950 dark:bg-amber-500/25 dark:text-amber-200">
          {matches.length} {matches.length === 1 ? "matching note" : "matching notes"}
        </span>
      </div>

      <div className={`space-y-1.5 ${compact ? "max-h-36 overflow-y-auto pr-0.5 custom-scrollbar" : ""}`}>
        {matches.map(({ note, similarityPercent, matchedWords, reason }) => {
          const previewText = note.definition || note.answer || note.urlNotes || note.content || "";
          return (
            <div
              key={note.id}
              className="p-2 rounded-lg bg-white/90 dark:bg-slate-900/80 border border-amber-200 dark:border-amber-700/40 space-y-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200 font-bold shrink-0">
                    {similarityPercent}% similar
                  </span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    <HighlightedDuplicateText text={note.title} matchedWords={matchedWords} />
                  </span>
                </div>
                {onViewExistingNote && (
                  <button
                    type="button"
                    onClick={() => onViewExistingNote(note.id)}
                    className="text-[10.5px] font-semibold text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-white inline-flex items-center gap-0.5 shrink-0 cursor-pointer underline"
                  >
                    <span>View Saved Note</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {previewText && previewText !== note.title && (
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug line-clamp-2">
                  <HighlightedDuplicateText
                    text={previewText}
                    matchedWords={matchedWords}
                    maxLength={170}
                  />
                </p>
              )}

              <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80">{reason}</p>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onToggleAllowDuplicate(!allowDuplicateSave)}
        className="w-full flex items-center gap-2 text-left text-[11px] font-medium text-amber-950 dark:text-amber-100 hover:opacity-90 pt-0.5 cursor-pointer"
      >
        {allowDuplicateSave ? (
          <CheckSquare className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
        ) : (
          <Square className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
        )}
        <span>
          {allowDuplicateSave
            ? "Confirmed: add this note anyway even though a similar note is already saved"
            : "Already added above — check here only if you still want to add it again"}
        </span>
      </button>
    </div>
  );
};
