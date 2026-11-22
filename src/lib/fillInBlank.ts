export interface ResolvedFillInBlank {
  prompt: string;
  answer: string;
}

/**
 * Supports either explicit `___` in the prompt + Answer input,
 * or inline `[answer]` brackets in the prompt when the Answer field is left blank.
 */
export function resolveFillInBlankDraft(rawPrompt: string, rawAnswer: string): ResolvedFillInBlank {
  const prompt = rawPrompt.trim();
  const answer = rawAnswer.trim();

  if (answer) {
    return { prompt, answer };
  }

  const extracted: string[] = [];
  const convertedPrompt = prompt.replace(/\[([^\[\]]+)\]/g, (_match, inner) => {
    const trimmed = String(inner).trim();
    if (!trimmed) return "___";
    extracted.push(trimmed);
    return "___";
  });

  if (extracted.length > 0) {
    return {
      prompt: convertedPrompt,
      answer: extracted.join(", "),
    };
  }

  return { prompt, answer };
}

export interface BlankSegment {
  type: "text" | "blank";
  value: string;
  blankIndex?: number;
}

/**
 * Splits a prompt string containing `___` (3 or more underscores) into renderable text and blank segments.
 */
export function splitFillInBlankSegments(prompt: string): BlankSegment[] {
  const parts = prompt.split(/(_{3,})/g);
  const segments: BlankSegment[] = [];
  let blankIndex = 0;

  for (const part of parts) {
    if (!part) continue;
    if (/^_{3,}$/.test(part)) {
      segments.push({ type: "blank", value: part, blankIndex });
      blankIndex += 1;
    } else {
      segments.push({ type: "text", value: part });
    }
  }

  return segments;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Compares a learner's typed fill-in-the-blank answer against the expected answer(s).
 * Case-insensitive, whitespace-normalized, and supports comma-separated multi-blank answers.
 */
export function checkFillInBlankGuess(guess: string, expected: string): boolean {
  const normGuess = normalizeToken(guess);
  const normExpected = normalizeToken(expected);
  if (!normGuess || !normExpected) return false;

  if (normGuess === normExpected) return true;

  // Support slash-separated acceptable alternatives when checking a single answer (e.g., "HTTP / Hypertext Transfer Protocol")
  if (!normExpected.includes(",")) {
    const alts = normExpected
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (alts.length > 1 && alts.includes(normGuess)) {
      return true;
    }
  }

  // Support comma-separated multiple blanks (e.g., expected: "DNS, 53", guess: "dns, 53")
  const expectedParts = normExpected
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const guessParts = normGuess
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (expectedParts.length > 1 && expectedParts.length === guessParts.length) {
    return expectedParts.every((expPart, idx) => guessParts[idx] === expPart);
  }

  return false;
}
