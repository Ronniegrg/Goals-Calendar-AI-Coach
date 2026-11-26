import { StudyArtifactNote } from "../types";

export interface NoteDraftCheckInput {
  category: string;
  title?: string;
  content?: string;
  question?: string;
  answer?: string;
  explanation?: string;
  term?: string;
  definition?: string;
  url?: string;
  urlNotes?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
}

export type DuplicateMatchType = "exact" | "near_duplicate" | "similar_wording";

export interface DuplicateNoteMatch {
  note: StudyArtifactNote;
  similarityPercent: number;
  matchType: DuplicateMatchType;
  matchedWords: string[];
  reason: string;
}

export interface ExistingDuplicateRelation {
  relatedNote: StudyArtifactNote;
  similarityPercent: number;
  matchType: DuplicateMatchType;
  matchedWords: string[];
  isNewerCopy: boolean;
}

export interface ExistingDuplicateReport {
  byNoteId: Record<string, ExistingDuplicateRelation[]>;
  duplicateNoteIds: string[];
  pairCount: number;
}

const DUPLICATE_STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "your", "have", "what",
  "which", "when", "where", "who", "whom", "why", "how", "are", "was", "were",
  "will", "would", "could", "should", "can", "into", "onto", "upon", "about",
  "after", "before", "above", "below", "between", "through", "during", "under",
  "over", "more", "most", "some", "such", "than", "then", "them", "they",
  "their", "there", "these", "those", "its", "only", "not", "does", "did",
  "has", "had", "but", "all", "any", "each", "use", "used", "using", "also",
  "you", "our", "out", "off", "per", "via"
]);

export function normalizeStudyTextForCompare(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/^\s*(?:[-*•]|\d+[.)]|#{1,6})\s+/gm, "")
    .replace(/[`*_~|>]/g, " ")
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrlForCompare(raw?: string): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}${u.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function tokenizeWords(normalized: string): string[] {
  if (!normalized) return [];
  const rawTokens = normalized
    .split(/\s+/)
    .map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9+#]+$/g, ""))
    .filter(w => w.length >= 2);

  const meaningful = rawTokens.filter(w => !DUPLICATE_STOP_WORDS.has(w));
  return meaningful.length >= 2 ? meaningful : rawTokens;
}

function buildTrigrams(text: string): Map<string, number> {
  const padded = `  ${text}  `;
  const map = new Map<string, number>();
  if (padded.length < 3) return map;
  for (let i = 0; i <= padded.length - 3; i++) {
    const tri = padded.slice(i, i + 3);
    map.set(tri, (map.get(tri) || 0) + 1);
  }
  return map;
}

function computeTrigramDice(normA: string, normB: string): number {
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.length < 4 || normB.length < 4) return 0;
  const mapA = buildTrigrams(normA);
  const mapB = buildTrigrams(normB);
  let totalA = 0;
  let totalB = 0;
  let overlap = 0;
  mapA.forEach(cnt => { totalA += cnt; });
  mapB.forEach(cnt => { totalB += cnt; });
  mapA.forEach((cntA, tri) => {
    const cntB = mapB.get(tri);
    if (cntB) overlap += Math.min(cntA, cntB);
  });
  return totalA + totalB > 0 ? (2 * overlap) / (totalA + totalB) : 0;
}

function computeSetOverlap(wordsA: string[], wordsB: string[]) {
  if (wordsA.length === 0 || wordsB.length === 0) {
    return { jaccard: 0, containment: 0, matchedWords: [] as string[] };
  }
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const matched: string[] = [];
  setA.forEach(w => {
    if (setB.has(w)) matched.push(w);
  });
  const unionSize = setA.size + setB.size - matched.length;
  const minSize = Math.min(setA.size, setB.size);
  return {
    jaccard: unionSize > 0 ? matched.length / unionSize : 0,
    containment: minSize > 0 ? matched.length / minSize : 0,
    matchedWords: matched
  };
}

interface ExtractedNoteCorpus {
  titleNorm: string;
  bodyNorm: string;
  combinedNorm: string;
  urlNorm: string;
  titleWords: string[];
  combinedWords: string[];
}

function extractDraftCorpus(input: NoteDraftCheckInput): ExtractedNoteCorpus {
  const titleRaw = input.title || input.term || input.question || "";
  const tableText =
    input.category === "table" && (input.tableHeaders?.length || input.tableRows?.length)
      ? [
          ...(input.tableHeaders || []),
          ...(input.tableRows || []).flat()
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  const bodyParts = [
    input.definition || "",
    input.answer || "",
    input.explanation || "",
    input.urlNotes || "",
    input.content || "",
    tableText
  ]
    .map(s => s.trim())
    .filter(Boolean);

  const bodyRaw = bodyParts.join(" ");
  const titleNorm = normalizeStudyTextForCompare(titleRaw);
  const bodyNorm = normalizeStudyTextForCompare(bodyRaw);
  const combinedNorm = normalizeStudyTextForCompare(`${titleRaw} ${bodyRaw}`);

  return {
    titleNorm,
    bodyNorm,
    combinedNorm,
    urlNorm: normalizeUrlForCompare(input.url),
    titleWords: tokenizeWords(titleNorm),
    combinedWords: tokenizeWords(combinedNorm)
  };
}

function extractSavedNoteCorpus(note: StudyArtifactNote): ExtractedNoteCorpus {
  return extractDraftCorpus({
    category: note.category,
    title: note.title,
    content: note.content,
    question: note.question,
    answer: note.answer,
    explanation: note.explanation,
    term: note.term,
    definition: note.definition,
    url: note.url,
    urlNotes: note.urlNotes,
    tableHeaders: note.tableHeaders,
    tableRows: note.tableRows
  });
}

function compareCorpora(
  a: ExtractedNoteCorpus,
  b: ExtractedNoteCorpus
): { similarityPercent: number; matchType: DuplicateMatchType; matchedWords: string[]; reason: string } | null {
  if (a.urlNorm && b.urlNorm && a.urlNorm === b.urlNorm) {
    const words = computeSetOverlap(a.combinedWords, b.combinedWords).matchedWords;
    return {
      similarityPercent: 100,
      matchType: "exact",
      matchedWords: words,
      reason: "Same resource URL already saved"
    };
  }

  if (a.combinedNorm.length < 6 || b.combinedNorm.length < 6) {
    return null;
  }

  if (a.combinedNorm === b.combinedNorm) {
    return {
      similarityPercent: 100,
      matchType: "exact",
      matchedWords: Array.from(new Set(a.combinedWords)),
      reason: "Exact same note wording"
    };
  }

  if (
    a.bodyNorm.length >= 12 &&
    b.bodyNorm.length >= 12 &&
    a.bodyNorm === b.bodyNorm
  ) {
    return {
      similarityPercent: 98,
      matchType: "near_duplicate",
      matchedWords: Array.from(new Set(a.combinedWords)),
      reason: "Identical note content"
    };
  }

  const wordOverlap = computeSetOverlap(a.combinedWords, b.combinedWords);
  const combinedDice = computeTrigramDice(a.combinedNorm, b.combinedNorm);
  const titleOverlap = computeSetOverlap(a.titleWords, b.titleWords);
  const titleDice = computeTrigramDice(a.titleNorm, b.titleNorm);
  const bodyDice =
    a.bodyNorm.length >= 10 && b.bodyNorm.length >= 10
      ? computeTrigramDice(a.bodyNorm, b.bodyNorm)
      : 0;

  let rawScore = Math.max(
    wordOverlap.jaccard,
    combinedDice * 0.96,
    bodyDice * 0.94
  );

  // Catch reworded / subset duplicates where one note contains most of the key terms of the other
  const minWordCount = Math.min(a.combinedWords.length, b.combinedWords.length);
  if (minWordCount >= 4 && wordOverlap.containment >= 0.72 && (combinedDice >= 0.44 || wordOverlap.matchedWords.length >= 4)) {
    const containmentBlend = 0.65 * wordOverlap.containment + 0.35 * Math.max(combinedDice, wordOverlap.jaccard);
    rawScore = Math.max(rawScore, containmentBlend);
  }

  // Catch notes with the exact/very similar title AND shared body concepts
  const strongTitleScore = Math.max(titleOverlap.jaccard, titleDice);
  if (
    a.titleNorm.length >= 5 &&
    b.titleNorm.length >= 5 &&
    strongTitleScore >= 0.8 &&
    (wordOverlap.containment >= 0.45 || a.bodyNorm.length < 10 || b.bodyNorm.length < 10)
  ) {
    rawScore = Math.max(rawScore, 0.68 * strongTitleScore + 0.32 * Math.max(wordOverlap.containment, bodyDice));
  }

  const similarityPercent = Math.min(99, Math.round(rawScore * 100));
  if (similarityPercent < 56 || (wordOverlap.matchedWords.length < 2 && combinedDice < 0.65)) {
    return null;
  }

  const matchType: DuplicateMatchType =
    similarityPercent >= 82 ? "near_duplicate" : "similar_wording";

  const reason =
    similarityPercent >= 85
      ? "Nearly identical wording"
      : strongTitleScore >= 0.8
      ? "Very similar title & overlapping content"
      : "Similar phrasing / overlapping concepts";

  return {
    similarityPercent,
    matchType,
    matchedWords: wordOverlap.matchedWords,
    reason
  };
}

export function findPotentialDuplicateNotes(
  draft: NoteDraftCheckInput,
  existingNotes: StudyArtifactNote[],
  limit = 3
): DuplicateNoteMatch[] {
  if (!Array.isArray(existingNotes) || existingNotes.length === 0) return [];
  const draftCorpus = extractDraftCorpus(draft);
  if (draftCorpus.combinedNorm.length < 6 && !draftCorpus.urlNorm) return [];

  const matches: DuplicateNoteMatch[] = [];
  for (const note of existingNotes) {
    const savedCorpus = extractSavedNoteCorpus(note);
    const cmp = compareCorpora(draftCorpus, savedCorpus);
    if (cmp) {
      matches.push({
        note,
        similarityPercent: cmp.similarityPercent,
        matchType: cmp.matchType,
        matchedWords: cmp.matchedWords,
        reason: cmp.reason
      });
    }
  }

  return matches
    .sort((a, b) => b.similarityPercent - a.similarityPercent)
    .slice(0, limit);
}

/**
 * Scans all saved notes from first (index 0) to end (index N-1)
 * to highlight any exact or near-duplicate wording across notes.
 */
export function findExistingDuplicateGroups(notes: StudyArtifactNote[]): ExistingDuplicateReport {
  const byNoteId: Record<string, ExistingDuplicateRelation[]> = {};
  if (!Array.isArray(notes) || notes.length < 2) {
    return { byNoteId, duplicateNoteIds: [], pairCount: 0 };
  }

  const corpora = notes.map(n => ({
    note: n,
    corpus: extractSavedNoteCorpus(n),
    createdMs: Date.parse(n.createdAt || "") || 0
  }));

  let pairCount = 0;

  for (let i = 0; i < corpora.length; i++) {
    for (let j = i + 1; j < corpora.length; j++) {
      const itemA = corpora[i];
      const itemB = corpora[j];
      const cmp = compareCorpora(itemA.corpus, itemB.corpus);
      if (!cmp) continue;

      pairCount++;
      const aIsNewer =
        itemA.createdMs && itemB.createdMs
          ? itemA.createdMs >= itemB.createdMs
          : i < j; // notes are prepended newest-first

      if (!byNoteId[itemA.note.id]) byNoteId[itemA.note.id] = [];
      if (!byNoteId[itemB.note.id]) byNoteId[itemB.note.id] = [];

      byNoteId[itemA.note.id].push({
        relatedNote: itemB.note,
        similarityPercent: cmp.similarityPercent,
        matchType: cmp.matchType,
        matchedWords: cmp.matchedWords,
        isNewerCopy: aIsNewer
      });
      byNoteId[itemB.note.id].push({
        relatedNote: itemA.note,
        similarityPercent: cmp.similarityPercent,
        matchType: cmp.matchType,
        matchedWords: cmp.matchedWords,
        isNewerCopy: !aIsNewer
      });
    }
  }

  Object.keys(byNoteId).forEach(id => {
    byNoteId[id].sort((a, b) => b.similarityPercent - a.similarityPercent);
  });

  return {
    byNoteId,
    duplicateNoteIds: Object.keys(byNoteId),
    pairCount
  };
}
