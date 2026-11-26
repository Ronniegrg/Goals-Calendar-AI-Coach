import React, { useRef, useState } from "react";
import { Eye, Edit3, IndentDecrease, IndentIncrease, List, ListOrdered } from "lucide-react";
import {
  detectActiveListType,
  getListContinuationOnEnter,
  ListKind,
  parseStudyTextBlocks,
  shiftListLinesIndent,
  StudyTextListBlock,
  toggleLineListFormat
} from "../lib/studyListFormatting";

interface InlineSpanProps {
  text: string;
}

const InlineFormattedText: React.FC<InlineSpanProps> = ({ text }) => {
  // Safely render **bold** and `inline code` spans using React nodes only (no raw HTML)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={idx}
              className="px-1 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-[11px] font-mono text-violet-800 dark:text-violet-200"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </>
  );
};

const StudyTextListNode: React.FC<{ block: StudyTextListBlock; depth?: number }> = ({
  block,
  depth = 0
}) => {
  const ListTag = block.ordered ? "ol" : "ul";
  const listStyleClass = block.ordered
    ? depth % 2 === 0
      ? "list-decimal"
      : "list-[lower-alpha]"
    : depth % 2 === 0
    ? "list-disc"
    : "list-[circle]";

  return (
    <ListTag
      start={block.ordered ? block.start : undefined}
      className={`${listStyleClass} pl-5 space-y-1 text-slate-800 dark:text-slate-200 ${
        depth > 0 ? "mt-1" : ""
      }`}
    >
      {block.items.map((item, idx) => (
        <li key={idx} className="leading-relaxed marker:text-violet-600 dark:marker:text-violet-400">
          {item.text ? <InlineFormattedText text={item.text} /> : <span className="opacity-40">—</span>}
          {item.children.map((childBlock, cIdx) => (
            <StudyTextListNode key={cIdx} block={childBlock} depth={depth + 1} />
          ))}
        </li>
      ))}
    </ListTag>
  );
};

export const FormattedStudyText: React.FC<{
  text: string;
  className?: string;
  emptyPlaceholder?: string;
}> = ({ text, className = "", emptyPlaceholder }) => {
  const blocks = React.useMemo(() => parseStudyTextBlocks(text), [text]);

  if (blocks.length === 0) {
    return emptyPlaceholder ? (
      <p className={`text-xs italic text-slate-400 dark:text-slate-500 ${className}`}>
        {emptyPlaceholder}
      </p>
    ) : null;
  }

  return (
    <div className={`space-y-2 text-xs leading-relaxed ${className}`}>
      {blocks.map((block, bIdx) => {
        if (block.type === "heading") {
          return (
            <h5
              key={bIdx}
              className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-white pt-1"
            >
              <InlineFormattedText text={block.text} />
            </h5>
          );
        }
        if (block.type === "list") {
          return <StudyTextListNode key={bIdx} block={block} />;
        }
        return (
          <p
            key={bIdx}
            className="whitespace-pre-line text-slate-800 dark:text-slate-200 leading-relaxed"
          >
            {block.lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && "\n"}
                <InlineFormattedText text={line} />
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};

interface StudyNoteTextEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  label?: string;
  compact?: boolean;
  darkSurface?: boolean;
  className?: string;
}

export const StudyNoteTextEditor: React.FC<StudyNoteTextEditorProps> = ({
  value,
  onChange,
  placeholder = "Write notes, bulleted lists (- item), or numbered steps (1. item)...",
  rows = 5,
  required = false,
  label,
  compact = false,
  darkSurface = false,
  className = ""
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeListType, setActiveListType] = useState<ListKind | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const syncSelectionState = () => {
    const el = textareaRef.current;
    if (!el) return;
    setActiveListType(detectActiveListType(value, el.selectionStart, el.selectionEnd));
  };

  const applySelectionResult = (
    nextText: string,
    nextStart: number,
    nextEnd: number
  ) => {
    onChange(nextText);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextStart, nextEnd);
      setActiveListType(detectActiveListType(nextText, nextStart, nextEnd));
    });
  };

  const handleToggleList = (kind: ListKind) => {
    const el = textareaRef.current;
    const selStart = el ? el.selectionStart : value.length;
    const selEnd = el ? el.selectionEnd : value.length;
    const { nextText, nextSelectionStart, nextSelectionEnd } = toggleLineListFormat(
      value,
      selStart,
      selEnd,
      kind
    );
    if (showPreview) setShowPreview(false);
    applySelectionResult(nextText, nextSelectionStart, nextSelectionEnd);
  };

  const handleIndent = (direction: "indent" | "outdent") => {
    const el = textareaRef.current;
    const selStart = el ? el.selectionStart : value.length;
    const selEnd = el ? el.selectionEnd : value.length;
    const { nextText, nextSelectionStart, nextSelectionEnd } = shiftListLinesIndent(
      value,
      selStart,
      selEnd,
      direction
    );
    if (showPreview) setShowPreview(false);
    applySelectionResult(nextText, nextSelectionStart, nextSelectionEnd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = e.currentTarget;
      const result = getListContinuationOnEnter(value, el.selectionStart, el.selectionEnd);
      if (result && result.handled) {
        e.preventDefault();
        applySelectionResult(result.nextText, result.nextCursorPos, result.nextCursorPos);
      }
      return;
    }

    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = e.currentTarget;
      const currentKind = detectActiveListType(value, el.selectionStart, el.selectionEnd);
      if (currentKind) {
        e.preventDefault();
        handleIndent(e.shiftKey ? "outdent" : "indent");
      }
    }
  };

  const borderClasses = darkSurface
    ? "border-slate-200 dark:border-white/12 bg-white dark:bg-[#0b0e18]"
    : "border-slate-300 dark:border-slate-700/60 bg-white dark:bg-slate-900/80";

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
          {label}
        </label>
      )}

      <div className={`rounded-lg border overflow-hidden focus-within:border-violet-500 transition-colors ${borderClasses}`}>
        {/* List Formatting Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1.5 bg-slate-50/90 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleToggleList("unordered")}
              title="Toggle bulleted (unordered) list on current or selected lines"
              className={`px-2 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                activeListType === "unordered" && !showPreview
                  ? "bg-violet-600 text-white shadow-xs"
                  : "bg-white hover:bg-violet-50 text-slate-700 border border-slate-200 dark:bg-slate-900 dark:hover:bg-violet-950/60 dark:text-slate-200 dark:border-slate-700/70"
              }`}
            >
              <List className="w-3.5 h-3.5 shrink-0" />
              <span>{compact ? "Bullets" : "Bulleted List"}</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleToggleList("ordered")}
              title="Toggle numbered (ordered) list on current or selected lines"
              className={`px-2 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                activeListType === "ordered" && !showPreview
                  ? "bg-violet-600 text-white shadow-xs"
                  : "bg-white hover:bg-violet-50 text-slate-700 border border-slate-200 dark:bg-slate-900 dark:hover:bg-violet-950/60 dark:text-slate-200 dark:border-slate-700/70"
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5 shrink-0" />
              <span>{compact ? "Numbered" : "Numbered List"}</span>
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleIndent("indent")}
              title="Indent line / create sub-list item (Tab)"
              className="p-1 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 dark:border-slate-700/70 cursor-pointer"
            >
              <IndentIncrease className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleIndent("outdent")}
              title="Outdent line / sub-list item (Shift+Tab)"
              className="p-1 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 dark:border-slate-700/70 cursor-pointer"
            >
              <IndentDecrease className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowPreview(prev => !prev)}
            className={`px-2 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
              showPreview
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
            }`}
            title={showPreview ? "Return to editing text" : "Preview formatted lists"}
          >
            {showPreview ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{showPreview ? "Edit" : "Preview"}</span>
          </button>
        </div>

        {showPreview ? (
          <div className={`px-3 py-2.5 overflow-y-auto custom-scrollbar ${compact ? "min-h-[96px] max-h-48" : "min-h-[120px] max-h-60"}`}>
            <FormattedStudyText
              text={value}
              emptyPlaceholder="Nothing written yet — switch to Edit to type or insert a list."
            />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            rows={rows}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={syncSelectionState}
            onKeyUp={syncSelectionState}
            onSelect={syncSelectionState}
            required={required && !showPreview}
            className="w-full px-3 py-2 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-mono text-xs resize-y custom-scrollbar"
          />
        )}
      </div>
    </div>
  );
};
