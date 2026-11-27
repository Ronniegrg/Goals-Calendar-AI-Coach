import { KnowledgeQuestion, StudyArtifactNote } from "../types";

export type TestSourceMode = "hybrid" | "notes_only" | "ai_only";

export function normalizeIndicesList(indices: unknown, optionCount: number): number[] {
  if (!Array.isArray(indices) || optionCount <= 0) return [];
  const valid = new Set<number>();
  for (const raw of indices) {
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 0 && num < optionCount) {
      valid.add(num);
    }
  }
  return Array.from(valid).sort((a, b) => a - b);
}

export function isMultiSelectQuestion(
  q: Pick<KnowledgeQuestion, "isMultipleSelect" | "correctIndices">
): boolean {
  return Boolean(
    q.isMultipleSelect ||
      (Array.isArray(q.correctIndices) && q.correctIndices.length > 1)
  );
}

export function getQuestionCorrectIndices(
  q: Pick<KnowledgeQuestion, "isMultipleSelect" | "correctIndices" | "correctIndex" | "options">
): number[] {
  const optLen = Array.isArray(q.options) ? q.options.length : 0;
  if (isMultiSelectQuestion(q)) {
    const normalized = normalizeIndicesList(q.correctIndices, optLen);
    if (normalized.length > 0) return normalized;
  }
  if (typeof q.correctIndex === "number" && q.correctIndex >= 0 && (optLen === 0 || q.correctIndex < optLen)) {
    return [q.correctIndex];
  }
  return optLen > 0 ? [0] : [];
}

export function isQuestionAnswerCorrect(
  q: Pick<KnowledgeQuestion, "isMultipleSelect" | "correctIndices" | "correctIndex" | "options">,
  singleChoice?: number,
  multiChoices?: number[]
): boolean {
  if (isMultiSelectQuestion(q)) {
    const expected = getQuestionCorrectIndices(q);
    const chosen = normalizeIndicesList(multiChoices, q.options.length);
    if (expected.length === 0 || chosen.length !== expected.length) return false;
    return expected.every((val, idx) => chosen[idx] === val);
  }
  return singleChoice !== undefined && singleChoice === q.correctIndex;
}

export function formatQuestionCorrectAnswerText(
  q: Pick<KnowledgeQuestion, "isMultipleSelect" | "correctIndices" | "correctIndex" | "options">
): string {
  const indices = getQuestionCorrectIndices(q);
  return indices.map(i => q.options[i]).filter(Boolean).join(", ");
}

export function formatQuestionUserAnswerText(
  q: Pick<KnowledgeQuestion, "isMultipleSelect" | "correctIndices" | "options">,
  singleChoice?: number,
  multiChoices?: number[]
): string {
  if (isMultiSelectQuestion(q)) {
    const chosen = normalizeIndicesList(multiChoices, q.options.length);
    return chosen.map(i => q.options[i]).filter(Boolean).join(", ");
  }
  return singleChoice !== undefined ? (q.options[singleChoice] || "") : "";
}

export function formatStudyMaterialForPrompt(
  notes: StudyArtifactNote[],
  maxNotes = 24
): string {
  if (!Array.isArray(notes) || notes.length === 0) return "";
  return notes
    .slice(0, maxNotes)
    .map((n, idx) => {
      if (n.category === "multiple_select") {
        const opts = Array.isArray(n.options) ? n.options : [];
        const choicesText = opts
          .map((opt, optIdx) => `${String.fromCharCode(65 + optIdx)}) ${opt}`)
          .join(" | ");
        const correctIdxs = normalizeIndicesList(n.correctOptionIndices, opts.length);
        const correctSummary =
          correctIdxs.length > 0
            ? correctIdxs.map(i => `${String.fromCharCode(65 + i)}) ${opts[i]}`).join("; ")
            : n.answer || n.content;
        return `${idx + 1}. [Multiple Select - Select All That Apply] Q: ${n.question || n.title}${
          choicesText ? ` | Choices: ${choicesText}` : ""
        } | Correct Answers: ${correctSummary}${
          n.explanation ? ` | Explanation: ${n.explanation}` : ""
        }`;
      }
      if (n.category === "multiple_choice") {
        const choicesText = (n.options || [])
          .map((opt, optIdx) => `${String.fromCharCode(65 + optIdx)}) ${opt}`)
          .join(" | ");
        return `${idx + 1}. [Multiple Choice] Q: ${n.question || n.title}${
          choicesText ? ` | Choices: ${choicesText}` : ""
        } | Correct: ${n.answer || n.content}${
          n.explanation ? ` | Explanation: ${n.explanation}` : ""
        }`;
      }
      if (n.category === "true_false") {
        return `${idx + 1}. [True/False] Statement: ${n.question || n.title} | Answer: ${
          n.answer || n.content
        }${n.explanation ? ` | Explanation: ${n.explanation}` : ""}`;
      }
      if (n.category === "fill_in_blank") {
        return `${idx + 1}. [Fill-in-the-Blank] Prompt: ${
          n.question || n.title
        } | Missing Answer: ${n.answer || n.content}${
          n.explanation ? ` | Explanation: ${n.explanation}` : ""
        }`;
      }
      if (n.category === "qa") {
        return `${idx + 1}. [Q&A] Q: ${n.question || n.title} | A: ${
          n.answer || n.content
        }${n.explanation ? ` | Explanation: ${n.explanation}` : ""}`;
      }
      if (n.category === "definition") {
        return `${idx + 1}. [Definition] ${n.term || n.title}: ${
          n.definition || n.content
        }`;
      }
      if (n.category === "table") {
        const headers = Array.isArray(n.tableHeaders) && n.tableHeaders.length > 0 ? n.tableHeaders : [];
        const rows = Array.isArray(n.tableRows) ? n.tableRows : [];
        if (headers.length > 0) {
          const rowsSummary = rows
            .slice(0, 12)
            .map((r) => headers.map((h, i) => `${h}: ${r[i] || ""}`).join(", "))
            .join(" ; ");
          return `${idx + 1}. [Table] ${n.title}: Columns (${headers.join(" | ")})${
            rowsSummary ? ` | Rows: ${rowsSummary}` : ""
          }`.slice(0, 650);
        }
        return `${idx + 1}. [Table] ${n.title}: ${(n.content || "").slice(0, 550)}`;
      }
      if (n.category === "url") {
        return `${idx + 1}. [Resource: ${n.title}] ${
          n.urlNotes || n.content || ""
        }`.slice(0, 450);
      }
      return `${idx + 1}. [${n.category}] ${n.title}: ${(n.content || "").slice(
        0,
        450
      )}`;
    })
    .join("\n");
}

export function resolveNoteCorrectIndices(note: StudyArtifactNote, options: string[]): number[] {
  const fromArray = normalizeIndicesList(note.correctOptionIndices, options.length);
  if (fromArray.length > 0) return fromArray;
  if (
    typeof note.correctOptionIndex === "number" &&
    note.correctOptionIndex >= 0 &&
    note.correctOptionIndex < options.length
  ) {
    return [note.correctOptionIndex];
  }
  const ansLower = (note.answer || "").trim().toLowerCase();
  if (!ansLower) return [];
  const tokens = ansLower
    .split(/[,;\n]+/)
    .map(t => t.replace(/^[a-z]\)\s*/i, "").trim())
    .filter(Boolean);
  const matched: number[] = [];
  options.forEach((opt, idx) => {
    const optLower = opt.trim().toLowerCase();
    if (optLower === ansLower || tokens.includes(optLower)) {
      matched.push(idx);
    }
  });
  return matched;
}

export function extractDirectQuestionsFromNotes(
  notes: StudyArtifactNote[]
): KnowledgeQuestion[] {
  if (!Array.isArray(notes) || notes.length === 0) return [];

  const extracted: KnowledgeQuestion[] = [];
  notes.forEach((note, idx) => {
    if (note.category === "multiple_select") {
      const options = Array.isArray(note.options)
        ? note.options.map(o => String(o).trim()).filter(Boolean)
        : [];
      const qText = (note.question || note.title || "").trim();
      if (!qText || options.length < 2) return;
      const resolvedIndices = resolveNoteCorrectIndices(note, options);
      const correctIndices = resolvedIndices.length > 0 ? resolvedIndices : [0];
      const correctLabels = correctIndices
        .map(i => `${String.fromCharCode(65 + i)}) ${options[i]}`)
        .join(", ");

      extracted.push({
        id: `note_q_${note.id}_${idx}`,
        question: qText,
        options,
        correctIndex: correctIndices[0],
        correctIndices,
        isMultipleSelect: true,
        explanation:
          note.explanation?.trim() ||
          `From your saved Multiple Select note: Correct answers are ${correctLabels}.`,
        difficulty: "medium",
        sourceType: "note",
        sourceLabel: "From Your Note · Multiple Select"
      });
    } else if (note.category === "multiple_choice") {
      const options = Array.isArray(note.options)
        ? note.options.map(o => String(o).trim()).filter(Boolean)
        : [];
      const qText = (note.question || note.title || "").trim();
      if (!qText || options.length < 2) return;
      const correctIdx =
        typeof note.correctOptionIndex === "number" &&
        note.correctOptionIndex >= 0 &&
        note.correctOptionIndex < options.length
          ? note.correctOptionIndex
          : Math.max(
              0,
              options.findIndex(
                o =>
                  o.toLowerCase() === (note.answer || "").trim().toLowerCase()
              )
            );

      extracted.push({
        id: `note_q_${note.id}_${idx}`,
        question: qText,
        options,
        correctIndex: correctIdx,
        explanation:
          note.explanation?.trim() ||
          `From your saved Multiple Choice note: Correct answer is "${options[correctIdx]}".`,
        difficulty: "medium",
        sourceType: "note",
        sourceLabel: "From Your Note · Multiple Choice"
      });
    } else if (note.category === "true_false") {
      const qText = (note.question || note.title || "").trim();
      if (!qText) return;
      const correctIdx =
        typeof note.correctOptionIndex === "number" &&
        (note.correctOptionIndex === 0 || note.correctOptionIndex === 1)
          ? note.correctOptionIndex
          : (note.answer || "").trim().toLowerCase() === "false"
          ? 1
          : 0;

      extracted.push({
        id: `note_q_${note.id}_${idx}`,
        question: `True or False: ${qText}`,
        options: ["True", "False"],
        correctIndex: correctIdx,
        explanation:
          note.explanation?.trim() ||
          `From your saved True / False note: This statement is ${
            correctIdx === 0 ? "True" : "False"
          }.`,
        difficulty: "easy",
        sourceType: "note",
        sourceLabel: "From Your Note · True / False"
      });
    }
  });

  // Shuffle so repeated test generation picks varied subsets of saved note questions
  for (let i = extracted.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [extracted[i], extracted[j]] = [extracted[j], extracted[i]];
  }
  return extracted;
}
