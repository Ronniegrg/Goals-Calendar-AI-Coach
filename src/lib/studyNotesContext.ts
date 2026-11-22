import { KnowledgeQuestion, StudyArtifactNote } from "../types";

export type TestSourceMode = "hybrid" | "notes_only" | "ai_only";

export function formatStudyMaterialForPrompt(
  notes: StudyArtifactNote[],
  maxNotes = 24
): string {
  if (!Array.isArray(notes) || notes.length === 0) return "";
  return notes
    .slice(0, maxNotes)
    .map((n, idx) => {
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

export function extractDirectQuestionsFromNotes(
  notes: StudyArtifactNote[]
): KnowledgeQuestion[] {
  if (!Array.isArray(notes) || notes.length === 0) return [];

  const extracted: KnowledgeQuestion[] = [];
  notes.forEach((note, idx) => {
    if (note.category === "multiple_choice") {
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
