import { ReadingRecommendationItem, StudyArtifactNote } from "../types";

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "your", "have", "what",
  "which", "when", "where", "who", "whom", "why", "how", "are", "was", "were",
  "will", "would", "could", "should", "can", "into", "onto", "upon", "about",
  "after", "before", "above", "below", "between", "through", "during", "under",
  "over", "most", "best", "first", "next", "true", "false", "following", "select",
  "option", "correct", "answer", "question", "statement", "not", "does", "did",
  "has", "had", "but", "all", "any", "each", "more", "some", "such", "than",
  "then", "them", "they", "their", "there", "these", "those", "its", "only",
  "uses", "used", "using", "based", "when", "likely", "primary", "main"
]);

function tokenizeKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9+#._/-]+/g, " ")
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
    )
  );
}

export function findMatchingNotesForQuestion(
  questionText: string,
  explanationText: string,
  correctOptionText: string,
  notes: StudyArtifactNote[],
  limit = 3
): StudyArtifactNote[] {
  if (!Array.isArray(notes) || notes.length === 0) return [];

  const queryKeywords = tokenizeKeywords(
    `${questionText} ${correctOptionText} ${explanationText}`
  );
  if (queryKeywords.length === 0) return [];

  const scored = notes
    .map(note => {
      const titleCorpus = `${note.title || ""} ${note.term || ""} ${note.question || ""} ${(note.keyTerms || []).join(" ")}`.toLowerCase();
      const bodyCorpus = `${note.definition || ""} ${note.content || ""} ${note.urlNotes || ""} ${note.explanation || ""} ${note.chapterTitle || ""}`.toLowerCase();

      let score = 0;
      for (const kw of queryKeywords) {
        if (titleCorpus.includes(kw)) score += 3;
        else if (bodyCorpus.includes(kw)) score += 1;
      }

      if (score > 0 && note.category === "url") {
        score += 1;
      }

      return { note, score };
    })
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(item => item.note);
}

export function isSafePublicHttpUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getRecommendationOpenUrl(rec: ReadingRecommendationItem): string {
  if (isSafePublicHttpUrl(rec.url)) {
    return rec.url!.trim();
  }
  const q = rec.searchQuery?.trim() || `${rec.title} ${rec.topicFocus}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function isRecommendationSaved(
  rec: ReadingRecommendationItem,
  notes: StudyArtifactNote[]
): boolean {
  const normTitle = rec.title.trim().toLowerCase();
  const targetUrl = getRecommendationOpenUrl(rec).toLowerCase();
  return notes.some(n => {
    const noteTitle = (n.title || "").trim().toLowerCase();
    const noteUrl = (n.url || "").trim().toLowerCase();
    return (
      (normTitle && noteTitle === normTitle) ||
      (isSafePublicHttpUrl(rec.url) && noteUrl && noteUrl === targetUrl)
    );
  });
}

export function buildSavedReadingNote(
  rec: ReadingRecommendationItem,
  chapterTitle?: string
): StudyArtifactNote {
  const nowIso = new Date().toISOString();
  const hasDirectUrl = isSafePublicHttpUrl(rec.url);
  const resolvedUrl = getRecommendationOpenUrl(rec);
  const takeawaysBlock =
    rec.keyTakeaways && rec.keyTakeaways.length > 0
      ? `\n\nKey Takeaways:\n${rec.keyTakeaways.map(t => `• ${t}`).join("\n")}`
      : "";
  const sourceLine = rec.sourceName
    ? `${rec.sourceName} (${rec.type.replace("_", " ")})`
    : rec.type.replace("_", " ");
  const readTimeLine = rec.estimatedReadMinutes
    ? ` • ~${rec.estimatedReadMinutes} min read`
    : "";
  const notesBody = `Topic Focus: ${rec.topicFocus}\nSource Type: ${sourceLine}${readTimeLine}\n\nWhy to read: ${rec.whyItHelps}${takeawaysBlock}${
    rec.relatedQuestion ? `\n\nAddresses missed question: ${rec.relatedQuestion}` : ""
  }`;

  return {
    id: `note_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: rec.title.trim(),
    category: "url",
    content: `${resolvedUrl}\n\n${notesBody}`,
    url: resolvedUrl,
    urlNotes: notesBody,
    linkSubtype: "website_reading",
    isReadingAssignment: true,
    requiresLogin: false,
    urlAccessNote: hasDirectUrl
      ? undefined
      : `AI-recommended search resource (${rec.searchQuery || rec.title})`,
    chapterTitle: chapterTitle?.trim() || rec.topicFocus || undefined,
    keyTerms: [rec.topicFocus, rec.type.replace("_", " ")].filter(Boolean),
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export type TopicLessonStyle = "lesson" | "lecture" | "note";

export interface GeneratedTopicLessonPayload {
  title: string;
  category?: "concept" | "summary" | "cheat_sheet";
  content: string;
  keyTerms?: string[];
  estimatedMinutes?: number;
  style?: TopicLessonStyle;
}

export function buildGeneratedTopicLessonNote(
  lesson: GeneratedTopicLessonPayload,
  chapterTitle?: string
): StudyArtifactNote {
  const nowIso = new Date().toISOString();
  const validCategory: StudyArtifactNote["category"] =
    lesson.category === "summary" || lesson.category === "cheat_sheet"
      ? lesson.category
      : "concept";

  return {
    id: `note_ai_lesson_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: (lesson.title || "AI Topic Lesson").trim(),
    category: validCategory,
    content: (lesson.content || "").trim(),
    chapterTitle: chapterTitle?.trim() || undefined,
    keyTerms: Array.isArray(lesson.keyTerms)
      ? lesson.keyTerms.map(t => String(t).trim()).filter(Boolean).slice(0, 8)
      : undefined,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export function mergeMatchedNotesWithGenerated(
  matchedNotes: StudyArtifactNote[],
  generatedNoteId: string | undefined,
  allNotes: StudyArtifactNote[],
  limit = 3
): StudyArtifactNote[] {
  if (!generatedNoteId) return matchedNotes.slice(0, limit);
  const generatedNote = allNotes.find(n => n.id === generatedNoteId);
  if (!generatedNote) return matchedNotes.slice(0, limit);
  const withoutDuplicate = matchedNotes.filter(n => n.id !== generatedNote.id);
  return [generatedNote, ...withoutDuplicate].slice(0, limit);
}

