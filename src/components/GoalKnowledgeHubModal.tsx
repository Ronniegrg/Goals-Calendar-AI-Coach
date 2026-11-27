import React, { useState } from "react";
import { 
  Goal, 
  GoalKnowledgeHub, 
  StudyArtifactNote, 
  KnowledgeTestArtifact, 
  FlashcardItem, 
  KnowledgeQuestion,
  ReadingRecommendationItem
} from "../types";
import { 
  BookOpen, 
  Sparkles, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  RotateCw, 
  Trash2, 
  Copy, 
  Check, 
  HelpCircle, 
  Award, 
  Layers, 
  FileText, 
  ArrowLeft,
  ArrowRight, 
  ChevronRight,
  Brain,
  Lightbulb,
  X,
  Target,
  RefreshCw,
  Clock,
  Link2,
  ExternalLink,
  Loader2,
  Upload,
  Video,
  Camera,
  ImagePlus,
  Edit3,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronUp,
  Download
} from "lucide-react";
import {
  MAX_NOTE_IMAGES,
  captureClipboardPasteSnapshot,
  captureScreenScreenshot,
  extractImagesFromClipboardSnapshot,
  readImageFileAsDataUrl,
  stripInlineBase64ImagesFromText
} from "../lib/screenshotCapture";
import { checkFillInBlankGuess, resolveFillInBlankDraft, splitFillInBlankSegments } from "../lib/fillInBlank";
import {
  extractDirectQuestionsFromNotes,
  formatQuestionCorrectAnswerText,
  formatQuestionUserAnswerText,
  formatStudyMaterialForPrompt,
  getQuestionCorrectIndices,
  isMultiSelectQuestion,
  isQuestionAnswerCorrect,
  resolveNoteCorrectIndices,
  TestSourceMode
} from "../lib/studyNotesContext";
import {
  buildGeneratedTopicLessonNote,
  buildSavedReadingNote,
  findMatchingNotesForQuestion,
  getRecommendationOpenUrl,
  isRecommendationSaved,
  isSafePublicHttpUrl,
  mergeMatchedNotesWithGenerated,
  TopicLessonStyle
} from "../lib/readingSuggestions";
import {
  findExistingDuplicateGroups,
  findPotentialDuplicateNotes
} from "../lib/noteDuplicateCheck";
import { DuplicateWarningBanner, HighlightedDuplicateText } from "./DuplicateWarningBanner";
import { TableNoteEditor, StudyNoteTableView } from "./TableNoteEditor";
import { FormattedStudyText, StudyNoteTextEditor } from "./StudyNoteTextEditor";
import {
  createEmptyTableHeaders,
  createEmptyTableRows,
  formatTableAsMarkdown,
  normalizeTableDraft,
  resolveNoteTableData
} from "../lib/tableNote";

interface GoalKnowledgeHubModalProps {
  goal: Goal;
  isOpen: boolean;
  onClose: () => void;
  onUpdateKnowledgeHub: (goalId: string, updatedHub: GoalKnowledgeHub) => void;
  initialTab?: "notes" | "tester" | "flashcards" | "overview";
  initialNoteId?: string | null;
}

export const GoalKnowledgeHubModal: React.FC<GoalKnowledgeHubModalProps> = ({
  goal,
  isOpen,
  onClose,
  onUpdateKnowledgeHub,
  initialTab = "notes",
  initialNoteId = null
}) => {
  if (!isOpen) return null;

  // Initialize hub with default if empty
  const currentHub: GoalKnowledgeHub = goal.knowledgeHub || {
    notes: [],
    tests: [],
    flashcards: [],
    overallMasteryScore: 0
  };

  const [activeTab, setActiveTab] = useState<"notes" | "tester" | "flashcards" | "overview">(initialTab);
  const [selectedNoteCategory, setSelectedNoteCategory] = useState<string>("all");
  const [selectedNoteGroup, setSelectedNoteGroup] = useState<"all" | "guides" | "questions" | "definitions" | "tables_code" | "links">("all");
  const [noteSearchQuery, setNoteSearchQuery] = useState<string>("");
  const [expandedNoteIds, setExpandedNoteIds] = useState<Record<string, boolean>>({});
  const [allNotesExpanded, setAllNotesExpanded] = useState<boolean>(false);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(initialNoteId || null);
  const [jumpedFromTestReview, setJumpedFromTestReview] = useState(false);

  React.useEffect(() => {
    if (isOpen && initialNoteId) {
      setActiveTab("notes");
      setSelectedNoteCategory("all");
      setSelectedNoteGroup("all");
      setNoteSearchQuery("");
      setHighlightedNoteId(initialNoteId);
      setExpandedNoteIds(prev => ({ ...prev, [initialNoteId]: true }));
      setJumpedFromTestReview(false);
    } else if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab, initialNoteId]);

  React.useEffect(() => {
    if (!isOpen || activeTab !== "notes" || !highlightedNoteId) return;
    const scrollTimer = window.setTimeout(() => {
      const targetEl = document.querySelector(`[data-note-id="${highlightedNoteId}"]`);
      if (targetEl && "scrollIntoView" in targetEl) {
        (targetEl as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 90);
    return () => window.clearTimeout(scrollTimer);
  }, [isOpen, activeTab, highlightedNoteId]);

  // Note creation modal/form state
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isUploadingInNotes, setIsUploadingInNotes] = useState(false);

  React.useEffect(() => {
    if (!isOpen || (!isAddingNote && !isUploadingInNotes)) return;
    const handleEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setIsAddingNote(false);
        setIsUploadingInNotes(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, isAddingNote, isUploadingInNotes]);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState<StudyArtifactNote["category"] | "reading_url">("concept");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteQuestion, setNewNoteQuestion] = useState("");
  const [newNoteAnswer, setNewNoteAnswer] = useState("");
  const [newNoteExplanation, setNewNoteExplanation] = useState("");
  const [newNoteMcqOptions, setNewNoteMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [newNoteMcqCorrectIndex, setNewNoteMcqCorrectIndex] = useState<number>(0);
  const [newNoteMultiSelectIndices, setNewNoteMultiSelectIndices] = useState<number[]>([0]);
  const [newNoteTrueFalseAnswer, setNewNoteTrueFalseAnswer] = useState<"true" | "false">("true");
  const [newNoteTerm, setNewNoteTerm] = useState("");
  const [newNoteDefinition, setNewNoteDefinition] = useState("");
  const [newNoteTableHeaders, setNewNoteTableHeaders] = useState<string[]>(() => createEmptyTableHeaders(3));
  const [newNoteTableRows, setNewNoteTableRows] = useState<string[][]>(() => createEmptyTableRows(3, 3));
  const [newNoteUrl, setNewNoteUrl] = useState("");
  const [newNoteUrlContext, setNewNoteUrlContext] = useState("");
  const [newNoteRequiresLogin, setNewNoteRequiresLogin] = useState(false);
  const [newNoteAssignReading, setNewNoteAssignReading] = useState(true);
  const [extractOnHubUrlSave, setExtractOnHubUrlSave] = useState(true);
  const [newNoteKeyTerms, setNewNoteKeyTerms] = useState("");
  const [newNoteChapter, setNewNoteChapter] = useState("");
  const [newNoteScreenshots, setNewNoteScreenshots] = useState<string[]>([]);
  const [isCapturingHubScreenshot, setIsCapturingHubScreenshot] = useState(false);
  const [isProcessingPastedImages, setIsProcessingPastedImages] = useState(false);
  const [hubScreenshotNotice, setHubScreenshotNotice] = useState<string | null>(null);
  const [lightboxScreenshotUrl, setLightboxScreenshotUrl] = useState<string | null>(null);
  const hubScreenshotFileInputRef = React.useRef<HTMLInputElement>(null);
  const hubUploadImageFileInputRef = React.useRef<HTMLInputElement>(null);
  const newNoteBlankPromptRef = React.useRef<HTMLTextAreaElement>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [hiddenQaNoteAnswers, setHiddenQaNoteAnswers] = useState<Record<string, boolean>>({});
  const [revealedBlankAnswers, setRevealedBlankAnswers] = useState<Record<string, boolean>>({});
  const [blankTryInputs, setBlankTryInputs] = useState<Record<string, string>>({});
  const [blankCheckResults, setBlankCheckResults] = useState<Record<string, "correct" | "incorrect" | null>>({});
  const [noteMcqSelectedChoices, setNoteMcqSelectedChoices] = useState<Record<string, number | undefined>>({});
  const [noteMultiSelectChoices, setNoteMultiSelectChoices] = useState<Record<string, number[]>>({});
  const [checkedMultiSelectNotes, setCheckedMultiSelectNotes] = useState<Record<string, boolean>>({});
  const [revealedMcqAnswers, setRevealedMcqAnswers] = useState<Record<string, boolean>>({});

  // URL & Video Upload Quiz Tester state
  const [sourceTesterMode, setSourceTesterMode] = useState<"upload" | "url">("upload");
  const [testerUrlInput, setTesterUrlInput] = useState("");
  const [testerUrlNotesInput, setTesterUrlNotesInput] = useState("");
  const [isExtractingUrl, setIsExtractingUrl] = useState(false);
  const [loginPromptLink, setLoginPromptLink] = useState<{ title: string; url: string; note?: string } | null>(null);

  // Downloaded Video & Transcript Upload state
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null);
  const [uploadedTranscriptFile, setUploadedTranscriptFile] = useState<File | null>(null);
  const [uploadedLessonTitle, setUploadedLessonTitle] = useState("");
  const [uploadedTranscriptText, setUploadedTranscriptText] = useState("");
  const [uploadedScreenshots, setUploadedScreenshots] = useState<string[]>([]);
  const [isProcessingUploadImages, setIsProcessingUploadImages] = useState(false);
  const [isExtractingUpload, setIsExtractingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Active Test Runner state
  const [activeTest, setActiveTest] = useState<KnowledgeTestArtifact | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [selectedMultiIndices, setSelectedMultiIndices] = useState<number[]>([]);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [testUserAnswers, setTestUserAnswers] = useState<{ [qIndex: number]: number }>({});
  const [testUserMultiAnswers, setTestUserMultiAnswers] = useState<{ [qIndex: number]: number[] }>({});
  const [isTestCompleted, setIsTestCompleted] = useState(false);

  // Flashcards state
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isAddingFlashcard, setIsAddingFlashcard] = useState(false);
  const [newCardFront, setNewCardFront] = useState("");
  const [newCardBack, setNewCardBack] = useState("");

  // Loading & generation configuration states
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [testSourceMode, setTestSourceMode] = useState<TestSourceMode>("hybrid");
  const [testQuestionCount, setTestQuestionCount] = useState<number>(6);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [readingRecommendations, setReadingRecommendations] = useState<ReadingRecommendationItem[]>([]);
  const [isGeneratingReadings, setIsGeneratingReadings] = useState(false);
  const [readingRecContextLabel, setReadingRecContextLabel] = useState<string | null>(null);
  const [previewReviewNoteId, setPreviewReviewNoteId] = useState<string | null>(null);
  const [topicLessonStyle, setTopicLessonStyle] = useState<TopicLessonStyle>("lesson");
  const [generatingLessonQKey, setGeneratingLessonQKey] = useState<string | null>(null);
  const [generatedLessonNoteByQKey, setGeneratedLessonNoteByQKey] = useState<Record<string, string>>({});
  const [topicLessonErrorByQKey, setTopicLessonErrorByQKey] = useState<Record<string, string>>({});
  const [allowDuplicateHubNoteSave, setAllowDuplicateHubNoteSave] = useState(false);
  const [blockedDuplicateHubSave, setBlockedDuplicateHubSave] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);

  const existingDuplicatesReport = React.useMemo(
    () => findExistingDuplicateGroups(currentHub.notes),
    [currentHub.notes]
  );

  const hubDraftDuplicateMatches = React.useMemo(() => {
    if (!isAddingNote) return [];
    const draftAnswer =
      newNoteCategory === "multiple_select"
        ? newNoteMultiSelectIndices
            .map(i => newNoteMcqOptions[i]?.trim())
            .filter(Boolean)
            .join(", ")
        : newNoteCategory === "multiple_choice"
        ? (newNoteMcqOptions[newNoteMcqCorrectIndex]?.trim() || newNoteAnswer)
        : newNoteAnswer;
    return findPotentialDuplicateNotes(
      {
        category: newNoteCategory,
        title: newNoteTitle,
        content: newNoteContent,
        question: newNoteQuestion,
        answer: draftAnswer,
        explanation: newNoteExplanation,
        term: newNoteTerm,
        definition: newNoteDefinition,
        url: newNoteUrl,
        urlNotes: newNoteUrlContext,
        tableHeaders: newNoteTableHeaders,
        tableRows: newNoteTableRows
      },
      currentHub.notes,
      3
    );
  }, [
    isAddingNote,
    newNoteCategory,
    newNoteTitle,
    newNoteContent,
    newNoteQuestion,
    newNoteAnswer,
    newNoteMcqOptions,
    newNoteMcqCorrectIndex,
    newNoteMultiSelectIndices,
    newNoteExplanation,
    newNoteTerm,
    newNoteDefinition,
    newNoteUrl,
    newNoteUrlContext,
    newNoteTableHeaders,
    newNoteTableRows,
    currentHub.notes
  ]);

  const hubDraftDuplicateSignature = hubDraftDuplicateMatches
    .map(m => `${m.note.id}:${m.similarityPercent}`)
    .join("|");

  React.useEffect(() => {
    setAllowDuplicateHubNoteSave(false);
    setBlockedDuplicateHubSave(false);
  }, [hubDraftDuplicateSignature, isAddingNote]);

  // 1. Helpers to update hub
  const saveHub = (updatedHub: GoalKnowledgeHub) => {
    // Recalculate overall mastery score
    let score = 0;
    const testScores = updatedHub.tests.filter(t => typeof t.lastScore === "number").map(t => t.lastScore!);
    const avgTestScore = testScores.length > 0 
      ? Math.round(testScores.reduce((a, b) => a + b, 0) / testScores.length) 
      : 0;

    const totalFlashcards = updatedHub.flashcards.length;
    const masteredFlashcards = updatedHub.flashcards.filter(f => f.mastered).length;
    const flashcardMastery = totalFlashcards > 0 
      ? Math.round((masteredFlashcards / totalFlashcards) * 100) 
      : 0;

    if (testScores.length > 0 && totalFlashcards > 0) {
      score = Math.round(avgTestScore * 0.7 + flashcardMastery * 0.3);
    } else if (testScores.length > 0) {
      score = avgTestScore;
    } else if (totalFlashcards > 0) {
      score = flashcardMastery;
    } else if (updatedHub.notes.length > 0) {
      score = Math.min(60, updatedHub.notes.length * 15);
    }

    const finalHub: GoalKnowledgeHub = {
      ...updatedHub,
      overallMasteryScore: score
    };
    onUpdateKnowledgeHub(goal.id, finalHub);
  };

  // 2. AI Generator Handlers
  const handleAIGenerateStudyNotes = async (chapterTitle?: string) => {
    setIsGeneratingNotes(true);
    setAiNotice("Synthesizing technical study guide and active recall flashcards...");
    try {
      const res = await fetch("/api/coach/generate-study-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: goal.name,
          goalCategory: goal.category || "General",
          chapterTitle: chapterTitle || (goal.chapters && goal.chapters[0]?.title) || "",
          examTitle: goal.targetExamTitle || ""
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.note) {
          const updatedNotes = [data.note, ...currentHub.notes];
          const updatedCards = Array.isArray(data.flashcards) 
            ? [...currentHub.flashcards, ...data.flashcards] 
            : currentHub.flashcards;

          saveHub({
            ...currentHub,
            notes: updatedNotes,
            flashcards: updatedCards
          });
          setAiNotice("Study guide artifact and flashcards successfully added!");
          setTimeout(() => setAiNotice(null), 3500);
        }
      }
    } catch (err) {
      console.error("Failed to generate study notes", err);
      setAiNotice("Could not reach generator. Please try again.");
      setTimeout(() => setAiNotice(null), 3500);
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const handleAIGenerateTest = async (chapterTitle?: string, modeOverride?: TestSourceMode) => {
    const selectedMode = modeOverride ?? testSourceMode;
    const savedNotesCount = currentHub.notes.length;

    if (selectedMode === "notes_only" && savedNotesCount === 0) {
      setAiNotice("You don't have any saved notes for this goal yet. Add notes first or choose Combination / AI Only.");
      setTimeout(() => setAiNotice(null), 4500);
      return;
    }

    setIsGeneratingTest(true);
    setAiNotice(
      selectedMode === "notes_only"
        ? "Authoring assessment questions strictly from your saved notes..."
        : selectedMode === "hybrid" && savedNotesCount > 0
        ? "Authoring combination test mixing AI questions with your saved notes..."
        : "Authoring AI-generated diagnostic assessment questions..."
    );

    try {
      const includeNotes = selectedMode !== "ai_only" && savedNotesCount > 0;
      const studyMaterialContext = includeNotes ? formatStudyMaterialForPrompt(currentHub.notes, 24) : "";
      const directNoteQuestions = includeNotes ? extractDirectQuestionsFromNotes(currentHub.notes) : [];

      const res = await fetch("/api/coach/generate-knowledge-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: goal.name,
          goalCategory: goal.category || "General",
          chapterTitle: chapterTitle || (goal.chapters && goal.chapters[0]?.title) || "",
          examTitle: goal.targetExamTitle || "",
          difficulty: "medium",
          sourceMode: selectedMode,
          studyMaterialContext,
          directNoteQuestions,
          questionCount: testQuestionCount
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.test) {
          const updatedTests = [data.test, ...currentHub.tests];
          saveHub({
            ...currentHub,
            tests: updatedTests
          });
          setAiNotice(
            selectedMode === "hybrid" && savedNotesCount > 0
              ? "Combination test (AI + Your Notes) created! Select it below to start."
              : selectedMode === "notes_only"
              ? "Test created from your saved notes! Select it below to start."
              : "New AI knowledge test created! Select it below to start."
          );
          setTimeout(() => setAiNotice(null), 3500);
        }
      }
    } catch (err) {
      console.error("Failed to generate test", err);
      setAiNotice("Could not author test questions. Please try again.");
      setTimeout(() => setAiNotice(null), 3500);
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const isSafeHttpUrl = (raw?: string) => {
    if (!raw) return false;
    try {
      const parsed = new URL(raw.trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const isLikelyLoginProtectedUrl = (raw?: string) => {
    if (!raw) return false;
    return /(?:coursera\.org|udemy\.com|edx\.org|pluralsight\.com|linkedin\.com\/learning|skillshare\.com|codecademy\.com|datacamp\.com|frontendmasters\.com|egghead\.io|laracasts\.com|oreilly\.com)/i.test(raw);
  };

  const loginStudyLinks = currentHub.notes.filter(
    n => n.category === "url" && n.url && isSafeHttpUrl(n.url) && (n.requiresLogin || n.isReadingAssignment)
  );

  const handleExtractFromUrl = async (params: {
    url: string;
    userNotes?: string;
    mode?: "both" | "notes" | "test";
    existingNoteId?: string;
    hubOverride?: GoalKnowledgeHub;
    startGeneratedTest?: boolean;
    requiresLogin?: boolean;
    title?: string;
  }) => {
    const targetUrl = params.url.trim();
    if (!isSafeHttpUrl(targetUrl)) {
      setAiNotice("Please provide a valid http:// or https:// URL.");
      setTimeout(() => setAiNotice(null), 4000);
      return;
    }

    const trimmedContext = (params.userNotes || "").trim();
    const knownLoginRequired = Boolean(params.requiresLogin || isLikelyLoginProtectedUrl(targetUrl));

    if (knownLoginRequired && !trimmedContext) {
      let hostLabel = "this link";
      try {
        hostLabel = params.title || new URL(targetUrl).hostname.replace(/^www\./, "");
      } catch {}
      const reminderNote =
        "This link requires signing in, so notes or quizzes cannot be auto-extracted from the private video. Go study the lesson directly in your browser (or paste your takeaways/transcript below to generate a quiz).";
      setLoginPromptLink({
        title: hostLabel,
        url: targetUrl,
        note: reminderNote
      });
      if (params.startGeneratedTest) {
        setActiveTab("tester");
      }
      setAiNotice(`Go study "${hostLabel}" directly — login is required to access that lesson.`);
      setTimeout(() => setAiNotice(null), 6000);
      return;
    }

    setLoginPromptLink(null);
    setIsExtractingUrl(true);
    setAiNotice(
      params.mode === "test"
        ? "Analyzing URL content and authoring review quiz questions..."
        : "Extracting study notes, flashcards, and quiz questions from URL..."
    );

    try {
      const res = await fetch("/api/coach/extract-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          goalTitle: goal.name,
          goalCategory: goal.category || "General",
          chapterTitle: newNoteChapter.trim() || (goal.chapters && goal.chapters[0]?.title) || "",
          userNotes: trimmedContext,
          mode: params.mode || "both"
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiNotice(data?.error || "Could not extract study material from that URL.");
        setTimeout(() => setAiNotice(null), res.status === 429 || res.status === 503 ? 8500 : 5500);
        return;
      }

      const workingHub = params.hubOverride || currentHub;
      const extractedNotes: StudyArtifactNote[] =
        params.mode === "test" ? [] : (Array.isArray(data.notes) ? data.notes : []);
      const extractedCards: FlashcardItem[] =
        params.mode === "test" ? [] : (Array.isArray(data.flashcards) ? data.flashcards : []);
      const newTest: KnowledgeTestArtifact | null = data.test || null;
      const isRestricted =
        data.accessStatus === "restricted" ||
        (data.accessStatus === "partial_public" && !newTest && extractedNotes.length === 0);

      const updatedExistingNotes = workingHub.notes.map(n => {
        const isMatch = params.existingNoteId ? n.id === params.existingNoteId : n.url === targetUrl;
        if (!isMatch) return n;
        return {
          ...n,
          title: data.extractedTitle && !newNoteTitle.trim() ? data.extractedTitle : n.title,
          requiresLogin: isRestricted ? true : n.requiresLogin,
          urlAccessNote: isRestricted ? (data.accessNote || "Login required — study this link directly.") : n.urlAccessNote
        };
      });

      saveHub({
        ...workingHub,
        notes: [...extractedNotes, ...updatedExistingNotes],
        flashcards: [...extractedCards, ...workingHub.flashcards],
        tests: newTest ? [newTest, ...workingHub.tests] : workingHub.tests
      });

      if (isRestricted) {
        setLoginPromptLink({
          title: data.extractedTitle || params.title || targetUrl,
          url: targetUrl,
          note: data.accessNote || "This lesson requires signing in. Go study it directly in your browser."
        });
      }

      if (params.startGeneratedTest && newTest) {
        setActiveTab("tester");
        startTest(newTest);
      }

      setAiNotice(data.accessNote || "Study material extracted from URL!");
      setTimeout(() => setAiNotice(null), 6000);
    } catch (err) {
      console.warn("URL extraction request failed", err);
      setAiNotice("Could not extract from URL. Please check the link and try again.");
      setTimeout(() => setAiNotice(null), 5000);
    } finally {
      setIsExtractingUrl(false);
    }
  };

  const handleExtractFromUpload = async (options?: {
    mode?: "both" | "notes" | "test";
    startGeneratedTest?: boolean;
  }) => {
    const cleanedTranscript = stripInlineBase64ImagesFromText(uploadedTranscriptText).cleanedText.trim();
    const hasUploadImages = uploadedScreenshots.length > 0;
    if (!uploadedVideoFile && !uploadedTranscriptFile && !cleanedTranscript) {
      setUploadError(
        hasUploadImages
          ? 'Use "Save Text & Images as Note" below to save your attached images directly, or include video/text for AI extraction.'
          : "Select a downloaded video/audio file, upload a transcript file, or paste your lesson text."
      );
      return;
    }

    setUploadError(null);
    setIsExtractingUpload(true);
    setAiNotice(
      uploadedVideoFile
        ? `Analyzing "${uploadedVideoFile.name}"${cleanedTranscript || uploadedTranscriptFile ? " + transcript" : ""}... Larger videos may take 30–90 seconds.`
        : "Extracting study notes, flashcards, and quiz questions from your lecture text..."
    );

    try {
      const formData = new FormData();
      if (uploadedVideoFile) {
        formData.append("video", uploadedVideoFile);
      }
      if (uploadedTranscriptFile) {
        formData.append("transcriptFile", uploadedTranscriptFile);
      }
      if (cleanedTranscript) {
        formData.append("transcriptText", cleanedTranscript);
      }
      if (uploadedLessonTitle.trim()) {
        formData.append("lessonTitle", uploadedLessonTitle.trim());
      }
      formData.append("goalTitle", goal.name);
      formData.append("goalCategory", goal.category || "General");
      formData.append(
        "chapterTitle",
        newNoteChapter.trim() || (goal.chapters && goal.chapters.find(c => !c.completed)?.title) || (goal.chapters && goal.chapters[0]?.title) || ""
      );
      formData.append("mode", options?.mode || "both");
      formData.append("questionCount", "5");

      const res = await fetch("/api/coach/extract-from-upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data?.error || "Could not extract study materials from that video or transcript.";
        setUploadError(errMsg);
        setAiNotice(errMsg);
        setTimeout(() => setAiNotice(null), res.status === 429 || res.status === 503 ? 8500 : 5500);
        return;
      }

      const mode = options?.mode || "both";
      const rawExtractedNotes: StudyArtifactNote[] =
        mode === "test" ? [] : (Array.isArray(data.notes) ? data.notes : []);
      let extractedNotes = rawExtractedNotes;

      if (hasUploadImages) {
        if (rawExtractedNotes.length > 0) {
          extractedNotes = rawExtractedNotes.map((n, idx) =>
            idx === 0
              ? {
                  ...n,
                  screenshots: Array.from(
                    new Set([...(n.screenshots || []), ...uploadedScreenshots])
                  ).slice(0, MAX_NOTE_IMAGES)
                }
              : n
          );
        } else {
          const fallbackChapter =
            newNoteChapter.trim() ||
            (goal.chapters && goal.chapters.find(c => !c.completed)?.title) ||
            (goal.chapters && goal.chapters[0]?.title) ||
            undefined;
          const fallbackImageNote: StudyArtifactNote = {
            id: `note_${Date.now()}`,
            title: uploadedLessonTitle.trim() || data.extractedTitle || `${goal.name} Study Material`,
            category: "summary",
            content: cleanedTranscript ? cleanedTranscript.slice(0, 12000) : "Attached study images",
            screenshots: [...uploadedScreenshots],
            chapterTitle: fallbackChapter,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          extractedNotes = [fallbackImageNote];
        }
      }

      const extractedCards: FlashcardItem[] =
        mode === "test" ? [] : (Array.isArray(data.flashcards) ? data.flashcards : []);
      const newTest: KnowledgeTestArtifact | null = data.test || null;

      saveHub({
        ...currentHub,
        notes: [...extractedNotes, ...currentHub.notes],
        flashcards: [...extractedCards, ...currentHub.flashcards],
        tests: newTest ? [newTest, ...currentHub.tests] : currentHub.tests
      });

      setUploadedVideoFile(null);
      setUploadedTranscriptFile(null);
      setUploadedLessonTitle("");
      setUploadedTranscriptText("");
      setUploadedScreenshots([]);
      setIsUploadingInNotes(false);

      if (options?.startGeneratedTest && newTest) {
        setActiveTab("tester");
        startTest(newTest);
      }

      const parts: string[] = [];
      if (extractedNotes.length > 0) parts.push(`${extractedNotes.length} notes`);
      if (hasUploadImages) parts.push(`${uploadedScreenshots.length} images`);
      if (extractedCards.length > 0) parts.push(`${extractedCards.length} flashcards`);
      if (newTest) parts.push(`${newTest.questions.length} quiz questions`);
      setAiNotice(`Ready! Created ${parts.join(", ")} from "${data.extractedTitle || "your lecture"}".`);
      setTimeout(() => setAiNotice(null), 6000);
    } catch (err) {
      console.warn("Uploaded lecture extraction request failed:", err);
      const msg = "Upload failed or timed out. Check your file size (under 250 MB) or include the transcript text.";
      setUploadError(msg);
      setAiNotice(msg);
      setTimeout(() => setAiNotice(null), 5000);
    } finally {
      setIsExtractingUpload(false);
    }
  };

  const handleSaveUploadDirectly = async () => {
    let rawText = uploadedTranscriptText;
    if (!rawText.trim() && uploadedTranscriptFile) {
      try {
        rawText = await uploadedTranscriptFile.text();
      } catch {
        rawText = "";
      }
    }
    const cleaned = stripInlineBase64ImagesFromText(rawText).cleanedText.trim();
    if (!cleaned && uploadedScreenshots.length === 0) {
      setUploadError("Paste text or attach images first to save directly as a note.");
      return;
    }

    const nowIso = new Date().toISOString();
    const activeChapter =
      newNoteChapter.trim() ||
      (goal.chapters && goal.chapters.find(c => !c.completed)?.title) ||
      (goal.chapters && goal.chapters[0]?.title) ||
      undefined;
    const directNote: StudyArtifactNote = {
      id: `note_${Date.now()}`,
      title:
        uploadedLessonTitle.trim() ||
        uploadedTranscriptFile?.name.replace(/\.[^/.]+$/, "") ||
        `${goal.name} Study Material`,
      category: "summary",
      content: cleaned || "Attached study images",
      screenshots: uploadedScreenshots.length > 0 ? [...uploadedScreenshots] : undefined,
      chapterTitle: activeChapter,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    saveHub({
      ...currentHub,
      notes: [directNote, ...currentHub.notes]
    });

    const savedImgCount = uploadedScreenshots.length;
    setUploadError(null);
    setUploadedVideoFile(null);
    setUploadedTranscriptFile(null);
    setUploadedLessonTitle("");
    setUploadedTranscriptText("");
    setUploadedScreenshots([]);
    setIsUploadingInNotes(false);

    setAiNotice(
      savedImgCount > 0
        ? `Saved note with ${savedImgCount} stored image${savedImgCount === 1 ? "" : "s"}!`
        : "Saved pasted text directly as a study note!"
    );
    setTimeout(() => setAiNotice(null), 4500);
  };

  // 3. Note Management
  const formatCategoryLabel = (cat: string) => {
    if (cat === "qa") return "Question & Answer";
    if (cat === "fill_in_blank") return "Fill in the Blank";
    if (cat === "multiple_choice") return "Multiple Choice";
    if (cat === "multiple_select") return "Multiple Select";
    if (cat === "true_false") return "True / False";
    if (cat === "definition") return "Definition";
    if (cat === "table") return "Table";
    if (cat === "url") return "URL / Video";
    if (cat === "all") return "All";
    return cat.replace("_", " ");
  };

  const compactMcqDraft = (opts: string[], selectedCorrectIdx: number) => {
    const mapped: Array<{ text: string; isCorrect: boolean }> = [];
    opts.forEach((raw, idx) => {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        mapped.push({ text: trimmed, isCorrect: idx === selectedCorrectIdx });
      }
    });
    return {
      cleanedOptions: mapped.map(m => m.text),
      correctIndex: mapped.findIndex(m => m.isCorrect)
    };
  };

  const compactMultiSelectDraft = (opts: string[], selectedIndices: number[]) => {
    const selectedSet = new Set(selectedIndices);
    const cleanedOptions: string[] = [];
    const correctIndices: number[] = [];
    opts.forEach((raw, idx) => {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        const nextIdx = cleanedOptions.length;
        cleanedOptions.push(trimmed);
        if (selectedSet.has(idx)) {
          correctIndices.push(nextIdx);
        }
      }
    });
    return {
      cleanedOptions,
      correctIndices
    };
  };

  const getTrueFalseCorrectIndex = (note: StudyArtifactNote) => {
    if (typeof note.correctOptionIndex === "number" && (note.correctOptionIndex === 0 || note.correctOptionIndex === 1)) {
      return note.correctOptionIndex;
    }
    return (note.answer || "").trim().toLowerCase() === "false" ? 1 : 0;
  };

  const insertBlankIntoHubPrompt = () => {
    const el = newNoteBlankPromptRef.current;
    if (!el) {
      setNewNoteQuestion(prev => (prev ? `${prev.trimEnd()} ___` : "___"));
      return;
    }
    const start = el.selectionStart ?? newNoteQuestion.length;
    const end = el.selectionEnd ?? newNoteQuestion.length;
    const before = newNoteQuestion.slice(0, start);
    const after = newNoteQuestion.slice(end);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
    const insertion = `${needsLeadingSpace ? " " : ""}___${needsTrailingSpace ? " " : ""}`;
    const nextValue = `${before}${insertion}${after}`;
    const nextCursor = start + insertion.length;
    setNewNoteQuestion(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleTakeHubScreenshot = async () => {
    if (isCapturingHubScreenshot) return;
    if (newNoteScreenshots.length >= MAX_NOTE_IMAGES) {
      setHubScreenshotNotice(`Maximum ${MAX_NOTE_IMAGES} images per note.`);
      setTimeout(() => setHubScreenshotNotice(null), 3500);
      return;
    }
    setIsCapturingHubScreenshot(true);
    setHubScreenshotNotice(null);
    const result = await captureScreenScreenshot();
    setIsCapturingHubScreenshot(false);
    if (result.dataUrl) {
      setNewNoteScreenshots(prev =>
        Array.from(new Set([...prev, result.dataUrl!])).slice(0, MAX_NOTE_IMAGES)
      );
    } else if (result.error) {
      setHubScreenshotNotice(result.error);
      setTimeout(() => setHubScreenshotNotice(null), 6000);
    }
  };

  const handleUploadHubScreenshotFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setHubScreenshotNotice(null);
    const remaining = Math.max(0, MAX_NOTE_IMAGES - newNoteScreenshots.length);
    if (remaining === 0) {
      setHubScreenshotNotice(`Maximum ${MAX_NOTE_IMAGES} images per note.`);
      setTimeout(() => setHubScreenshotNotice(null), 3500);
      return;
    }
    const added: string[] = [];
    const compact = files.length > 2;
    for (let i = 0; i < Math.min(files.length, remaining); i += 1) {
      try {
        const dataUrl = await readImageFileAsDataUrl(files[i], { compact });
        added.push(dataUrl);
      } catch {
        // Ignore non-image files
      }
    }
    if (added.length > 0) {
      setNewNoteScreenshots(prev =>
        Array.from(new Set([...prev, ...added])).slice(0, MAX_NOTE_IMAGES)
      );
    }
  };

  const handleHubFormPaste = async (e: React.ClipboardEvent) => {
    // Capture synchronously before any await so DataTransfer items/HTML remain intact
    const snapshot = captureClipboardPasteSnapshot(e);
    if (!snapshot.hasPotentialImages) return;

    setHubScreenshotNotice(null);
    setIsProcessingPastedImages(true);
    try {
      const pasted = await extractImagesFromClipboardSnapshot(snapshot, MAX_NOTE_IMAGES);
      if (pasted.length > 0) {
        let addedCount = 0;
        let hitLimit = false;
        setNewNoteScreenshots(prev => {
          const existingSet = new Set(prev);
          const uniqueNew = pasted.filter(src => !existingSet.has(src));
          const availableSlots = Math.max(0, MAX_NOTE_IMAGES - prev.length);
          addedCount = Math.min(uniqueNew.length, availableSlots);
          hitLimit = uniqueNew.length > availableSlots;
          return [...prev, ...uniqueNew].slice(0, MAX_NOTE_IMAGES);
        });
        if (addedCount > 0) {
          setAiNotice(
            `Stored ${addedCount} image${addedCount === 1 ? "" : "s"} from pasted content${hitLimit ? ` (capped at ${MAX_NOTE_IMAGES})` : ""}.`
          );
          setTimeout(() => setAiNotice(null), 4000);
        } else if (hitLimit) {
          setHubScreenshotNotice(`Maximum ${MAX_NOTE_IMAGES} images per note reached.`);
          setTimeout(() => setHubScreenshotNotice(null), 4000);
        }
      }
    } finally {
      setIsProcessingPastedImages(false);
    }
  };

  const handleUploadPanelImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    const remaining = Math.max(0, MAX_NOTE_IMAGES - uploadedScreenshots.length);
    if (remaining === 0) {
      setUploadError(`Maximum ${MAX_NOTE_IMAGES} images per upload note.`);
      return;
    }
    const added: string[] = [];
    const compact = files.length > 2;
    for (let i = 0; i < Math.min(files.length, remaining); i += 1) {
      try {
        const dataUrl = await readImageFileAsDataUrl(files[i], { compact });
        added.push(dataUrl);
      } catch {
        // Ignore non-image files
      }
    }
    if (added.length > 0) {
      setUploadedScreenshots(prev =>
        Array.from(new Set([...prev, ...added])).slice(0, MAX_NOTE_IMAGES)
      );
    }
  };

  const handleHubUploadPaste = async (e: React.ClipboardEvent) => {
    const snapshot = captureClipboardPasteSnapshot(e);
    if (!snapshot.hasPotentialImages) return;

    setUploadError(null);
    setIsProcessingUploadImages(true);
    try {
      const pasted = await extractImagesFromClipboardSnapshot(snapshot, MAX_NOTE_IMAGES);
      if (pasted.length > 0) {
        let addedCount = 0;
        let hitLimit = false;
        setUploadedScreenshots(prev => {
          const existingSet = new Set(prev);
          const uniqueNew = pasted.filter(src => !existingSet.has(src));
          const availableSlots = Math.max(0, MAX_NOTE_IMAGES - prev.length);
          addedCount = Math.min(uniqueNew.length, availableSlots);
          hitLimit = uniqueNew.length > availableSlots;
          return [...prev, ...uniqueNew].slice(0, MAX_NOTE_IMAGES);
        });
        if (addedCount > 0) {
          setAiNotice(
            `Captured ${addedCount} image${addedCount === 1 ? "" : "s"} from pasted content — will be stored with your note${hitLimit ? ` (max ${MAX_NOTE_IMAGES})` : ""}.`
          );
          setTimeout(() => setAiNotice(null), 4500);
        }
      }
    } finally {
      setIsProcessingUploadImages(false);
    }
  };

  const handleCreateManualNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const isQA = newNoteCategory === "qa";
    const isFillInBlank = newNoteCategory === "fill_in_blank";
    const isMultipleChoice = newNoteCategory === "multiple_choice";
    const isMultipleSelect = newNoteCategory === "multiple_select";
    const isTrueFalse = newNoteCategory === "true_false";
    const isDefinition = newNoteCategory === "definition";
    const isTable = newNoteCategory === "table";
    const isReadingUrl = newNoteCategory === "reading_url";
    const isUrl = newNoteCategory === "url" || isReadingUrl;
    const hasScreenshots = newNoteScreenshots.length > 0;
    const resolvedMcq = isMultipleChoice ? compactMcqDraft(newNoteMcqOptions, newNoteMcqCorrectIndex) : null;
    const resolvedMulti = isMultipleSelect ? compactMultiSelectDraft(newNoteMcqOptions, newNoteMultiSelectIndices) : null;
    const resolvedTable = isTable ? normalizeTableDraft(newNoteTableHeaders, newNoteTableRows) : null;

    if (isQA) {
      if ((!newNoteQuestion.trim() || !newNoteAnswer.trim()) && !hasScreenshots) return;
    } else if (isFillInBlank) {
      const resolvedFill = resolveFillInBlankDraft(newNoteQuestion, newNoteAnswer);
      if ((!resolvedFill.prompt || !resolvedFill.answer) && !hasScreenshots) return;
    } else if (isMultipleChoice) {
      if ((!newNoteQuestion.trim() || (resolvedMcq?.cleanedOptions.length || 0) < 2) && !hasScreenshots) {
        setAiNotice("Please enter a question and at least 2 answer choices.");
        setTimeout(() => setAiNotice(null), 4000);
        return;
      }
      if ((resolvedMcq?.cleanedOptions.length || 0) >= 2 && (resolvedMcq?.correctIndex ?? -1) < 0) {
        setAiNotice("Please enter text for the selected correct choice (or mark a filled choice).");
        setTimeout(() => setAiNotice(null), 4000);
        return;
      }
    } else if (isMultipleSelect) {
      if ((!newNoteQuestion.trim() || (resolvedMulti?.cleanedOptions.length || 0) < 2) && !hasScreenshots) {
        setAiNotice("Please enter a question and at least 2 answer choices.");
        setTimeout(() => setAiNotice(null), 4000);
        return;
      }
      if ((resolvedMulti?.cleanedOptions.length || 0) >= 2 && (resolvedMulti?.correctIndices.length || 0) < 1) {
        setAiNotice("Please check at least 1 filled choice as a correct answer.");
        setTimeout(() => setAiNotice(null), 4000);
        return;
      }
    } else if (isTrueFalse) {
      if (!newNoteQuestion.trim() && !hasScreenshots) return;
    } else if (isDefinition) {
      if ((!newNoteTerm.trim() || !newNoteDefinition.trim()) && !hasScreenshots) return;
    } else if (isTable) {
      if (!resolvedTable?.hasContent && !hasScreenshots) {
        setAiNotice("Please fill in at least one table header or cell (or attach a screenshot).");
        setTimeout(() => setAiNotice(null), 4000);
        return;
      }
    } else if (isUrl) {
      if (!newNoteUrl.trim() || !isSafeHttpUrl(newNoteUrl)) {
        setAiNotice("Please enter a valid http:// or https:// URL.");
        setTimeout(() => setAiNotice(null), 4000);
        return;
      }
    } else if ((!newNoteTitle.trim() || !newNoteContent.trim()) && !hasScreenshots) {
      return;
    }

    if (hubDraftDuplicateMatches.length > 0 && !allowDuplicateHubNoteSave) {
      setBlockedDuplicateHubSave(true);
      setAiNotice(
        `Possible duplicate already saved (${hubDraftDuplicateMatches[0].similarityPercent}% match: "${hubDraftDuplicateMatches[0].note.title}"). Review the highlighted warning below before adding.`
      );
      setTimeout(() => setAiNotice(null), 5000);
      return;
    }

    const terms = newNoteKeyTerms
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    const resolvedFillBlank = isFillInBlank ? resolveFillInBlankDraft(newNoteQuestion, newNoteAnswer) : null;
    const trimmedQuestion = isFillInBlank
      ? (resolvedFillBlank?.prompt || (hasScreenshots ? "Screenshot Fill-in-the-Blank" : ""))
      : (newNoteQuestion.trim() || (
          isMultipleSelect && hasScreenshots
            ? "Screenshot Multiple Select Question"
            : isMultipleChoice && hasScreenshots
            ? "Screenshot Multiple Choice Question"
            : isTrueFalse && hasScreenshots
            ? "Screenshot True / False Question"
            : isQA && hasScreenshots
            ? "Screenshot Question"
            : ""
        ));
    const trimmedAnswer = isFillInBlank
      ? (resolvedFillBlank?.answer || (hasScreenshots ? "See attached screenshot" : ""))
      : isMultipleSelect
      ? (resolvedMulti && resolvedMulti.correctIndices.length > 0
          ? resolvedMulti.correctIndices.map(i => resolvedMulti.cleanedOptions[i]).join(", ")
          : (hasScreenshots ? "See attached screenshot" : ""))
      : isMultipleChoice
      ? (resolvedMcq && resolvedMcq.correctIndex >= 0
          ? resolvedMcq.cleanedOptions[resolvedMcq.correctIndex]
          : (hasScreenshots ? "See attached screenshot" : ""))
      : isTrueFalse
      ? (newNoteTrueFalseAnswer === "true" ? "True" : "False")
      : (newNoteAnswer.trim() || (isQA && hasScreenshots ? "See attached screenshot" : ""));
    const trimmedExplanation = newNoteExplanation.trim();
    const trimmedTerm = newNoteTerm.trim() || (isDefinition && hasScreenshots ? "Screenshot Term" : "");
    const trimmedDefinition = newNoteDefinition.trim() || (isDefinition && hasScreenshots ? "See attached screenshot" : "");
    const trimmedUrl = newNoteUrl.trim();
    const trimmedUrlContext = newNoteUrlContext.trim();

    let defaultUrlTitle = trimmedUrl;
    if (isUrl) {
      try {
        defaultUrlTitle = new URL(trimmedUrl).hostname.replace(/^www\./, "");
      } catch {}
    }

    const markLoginRequired = isUrl && !isReadingUrl && (newNoteRequiresLogin || (isLikelyLoginProtectedUrl(trimmedUrl) && !trimmedUrlContext));
    const markReadingAssignment = isReadingUrl ? newNoteAssignReading : false;

    const choiceSource = isMultipleSelect ? resolvedMulti?.cleanedOptions : resolvedMcq?.cleanedOptions;
    const mcqChoicesFormatted = choiceSource && choiceSource.length > 0
      ? choiceSource.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join("\n")
      : "";
    const mcqCorrectLabel = isMultipleSelect
      ? (resolvedMulti && resolvedMulti.correctIndices.length > 0
          ? resolvedMulti.correctIndices
              .map(i => `${String.fromCharCode(65 + i)}) ${resolvedMulti.cleanedOptions[i]}`)
              .join(", ")
          : trimmedAnswer)
      : (resolvedMcq && resolvedMcq.correctIndex >= 0
          ? `${String.fromCharCode(65 + resolvedMcq.correctIndex)}) ${resolvedMcq.cleanedOptions[resolvedMcq.correctIndex]}`
          : trimmedAnswer);

    const noteId = "note_" + Date.now();
    const note: StudyArtifactNote = {
      id: noteId,
      title: isQA || isFillInBlank || isMultipleChoice || isMultipleSelect || isTrueFalse
        ? trimmedQuestion
        : isDefinition
        ? trimmedTerm
        : isTable
        ? (newNoteTitle.trim() || "Study Reference Table")
        : isUrl
        ? (newNoteTitle.trim() || defaultUrlTitle)
        : (newNoteTitle.trim() || "Screenshot Note"),
      category: isUrl ? "url" : newNoteCategory,
      content: isTable
        ? (resolvedTable?.hasContent ? formatTableAsMarkdown(resolvedTable.headers, resolvedTable.rows) : "Attached table screenshot")
        : isMultipleSelect
        ? `Q: ${trimmedQuestion}${mcqChoicesFormatted ? `\n\n${mcqChoicesFormatted}` : ""}\n\nCorrect Answers: ${mcqCorrectLabel}${trimmedExplanation ? `\n\nExplanation: ${trimmedExplanation}` : ""}`
        : isMultipleChoice
        ? `Q: ${trimmedQuestion}${mcqChoicesFormatted ? `\n\n${mcqChoicesFormatted}` : ""}\n\nCorrect Answer: ${mcqCorrectLabel}${trimmedExplanation ? `\n\nExplanation: ${trimmedExplanation}` : ""}`
        : isTrueFalse
        ? `Statement: ${trimmedQuestion}\n\nAnswer: ${trimmedAnswer}${trimmedExplanation ? `\n\nExplanation: ${trimmedExplanation}` : ""}`
        : isFillInBlank
        ? `Prompt: ${trimmedQuestion}\n\nAnswer: ${trimmedAnswer}${trimmedExplanation ? `\n\nExplanation: ${trimmedExplanation}` : ""}`
        : isQA
        ? `Q: ${trimmedQuestion}\n\nA: ${trimmedAnswer}${trimmedExplanation ? `\n\nExplanation: ${trimmedExplanation}` : ""}`
        : isDefinition
        ? `${trimmedTerm}: ${trimmedDefinition}`
        : isUrl
        ? (trimmedUrlContext ? `${trimmedUrl}\n\n${trimmedUrlContext}` : trimmedUrl)
        : (newNoteContent.trim() || "Attached screenshot"),
      tableHeaders: isTable && resolvedTable?.hasContent ? resolvedTable.headers : undefined,
      tableRows: isTable && resolvedTable?.hasContent ? resolvedTable.rows : undefined,
      question: isQA || isFillInBlank || isMultipleChoice || isMultipleSelect || isTrueFalse ? trimmedQuestion : undefined,
      answer: isQA || isFillInBlank || isMultipleChoice || isMultipleSelect || isTrueFalse ? trimmedAnswer : undefined,
      explanation: (isQA || isFillInBlank || isMultipleChoice || isMultipleSelect || isTrueFalse) && trimmedExplanation ? trimmedExplanation : undefined,
      options: isMultipleSelect
        ? (resolvedMulti?.cleanedOptions || [])
        : isMultipleChoice
        ? (resolvedMcq?.cleanedOptions || [])
        : isTrueFalse
        ? ["True", "False"]
        : undefined,
      correctOptionIndex: isMultipleSelect
        ? (resolvedMulti && resolvedMulti.correctIndices.length > 0 ? resolvedMulti.correctIndices[0] : undefined)
        : isMultipleChoice
        ? (resolvedMcq && resolvedMcq.correctIndex >= 0 ? resolvedMcq.correctIndex : undefined)
        : isTrueFalse
        ? (newNoteTrueFalseAnswer === "true" ? 0 : 1)
        : undefined,
      correctOptionIndices: isMultipleSelect
        ? (resolvedMulti && resolvedMulti.correctIndices.length > 0 ? resolvedMulti.correctIndices : undefined)
        : undefined,
      term: isDefinition ? trimmedTerm : undefined,
      definition: isDefinition ? trimmedDefinition : undefined,
      url: isUrl ? trimmedUrl : undefined,
      urlNotes: isUrl && trimmedUrlContext ? trimmedUrlContext : undefined,
      linkSubtype: isReadingUrl ? "website_reading" : isUrl ? "video_resource" : undefined,
      isReadingAssignment: markReadingAssignment || undefined,
      screenshots: hasScreenshots ? [...newNoteScreenshots] : undefined,
      requiresLogin: isUrl ? markLoginRequired : undefined,
      urlAccessNote: markLoginRequired && !trimmedUrlContext
        ? "This link requires signing in. Go study it directly in your browser."
        : undefined,
      chapterTitle: newNoteChapter.trim() || undefined,
      keyTerms: terms.length > 0 ? terms : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const nextHub: GoalKnowledgeHub = {
      ...currentHub,
      notes: [note, ...currentHub.notes]
    };
    saveHub(nextHub);

    setNewNoteTitle("");
    setNewNoteContent("");
    setNewNoteQuestion("");
    setNewNoteAnswer("");
    setNewNoteExplanation("");
    setNewNoteMcqOptions(["", "", "", ""]);
    setNewNoteMcqCorrectIndex(0);
    setNewNoteMultiSelectIndices([0]);
    setNewNoteTrueFalseAnswer("true");
    setNewNoteTerm("");
    setNewNoteDefinition("");
    setNewNoteTableHeaders(createEmptyTableHeaders(3));
    setNewNoteTableRows(createEmptyTableRows(3, 3));
    setNewNoteUrl("");
    setNewNoteUrlContext("");
    setNewNoteRequiresLogin(false);
    setNewNoteKeyTerms("");
    setNewNoteChapter("");
    setNewNoteScreenshots([]);
    setHubScreenshotNotice(null);
    setAllowDuplicateHubNoteSave(false);
    setBlockedDuplicateHubSave(false);
    setIsAddingNote(false);

    if (isUrl && extractOnHubUrlSave && (!markLoginRequired || trimmedUrlContext.length > 0)) {
      await handleExtractFromUrl({
        url: trimmedUrl,
        userNotes: trimmedUrlContext,
        mode: "both",
        existingNoteId: noteId,
        hubOverride: nextHub,
        requiresLogin: markLoginRequired,
        title: note.title
      });
    } else if (isUrl && (markLoginRequired || markReadingAssignment)) {
      setAiNotice(
        markReadingAssignment
          ? "Reading link saved! I'll remind you to read this website when studying, reviewing, or testing."
          : "Link saved! I'll remind you to go study this link when studying, reviewing, or testing."
      );
      setTimeout(() => setAiNotice(null), 5000);
    }
  };

  const handleDeleteNote = (noteId: string) => {
    saveHub({
      ...currentHub,
      notes: currentHub.notes.filter(n => n.id !== noteId)
    });
  };

  const handleToggleLinkAssignment = (noteId: string) => {
    const nowIso = new Date().toISOString();
    const updatedNotes = currentHub.notes.map(n => {
      if (n.id !== noteId) return n;
      const nextDone = !n.reviewCompleted;
      return {
        ...n,
        reviewCompleted: nextDone,
        lastStudiedAt: nextDone ? nowIso : n.lastStudiedAt,
        studyCount: nextDone ? (n.studyCount || 0) + 1 : n.studyCount,
        updatedAt: nowIso
      };
    });
    saveHub({
      ...currentHub,
      notes: updatedNotes
    });
  };

  const handleResetAllLinkAssignments = () => {
    const nowIso = new Date().toISOString();
    saveHub({
      ...currentHub,
      notes: currentHub.notes.map(n =>
        n.category === "url" && n.requiresLogin
          ? { ...n, reviewCompleted: false, updatedAt: nowIso }
          : n
      )
    });
  };

  const handleCopyNoteContent = (note: StudyArtifactNote) => {
    const mcqOpts = Array.isArray(note.options) ? note.options : [];
    const mcqChoicesText = mcqOpts.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join("\n");
    const multiCorrectIndices = note.category === "multiple_select" ? resolveNoteCorrectIndices(note, mcqOpts) : [];
    const multiCorrectLabel = multiCorrectIndices.length > 0
      ? multiCorrectIndices.map(i => `${String.fromCharCode(65 + i)}) ${mcqOpts[i]}`).join(", ")
      : (note.answer || "");
    const mcqCorrectLabel = typeof note.correctOptionIndex === "number" && mcqOpts[note.correctOptionIndex]
      ? `${String.fromCharCode(65 + note.correctOptionIndex)}) ${mcqOpts[note.correctOptionIndex]}`
      : (note.answer || "");

    const tableCopyData = note.category === "table" ? resolveNoteTableData(note) : null;
    const copyText = note.category === "table" && tableCopyData
      ? `${note.title}\n\n${formatTableAsMarkdown(tableCopyData.headers, tableCopyData.rows)}`
      : note.category === "multiple_select"
      ? `${note.title && note.title !== note.question ? `${note.title}\n\n` : ""}Q: ${note.question || note.title}${mcqChoicesText ? `\n\n${mcqChoicesText}` : ""}\n\nCorrect Answers: ${multiCorrectLabel || note.content}${note.explanation ? `\n\nExplanation: ${note.explanation}` : ""}`
      : note.category === "multiple_choice"
      ? `${note.title && note.title !== note.question ? `${note.title}\n\n` : ""}Q: ${note.question || note.title}${mcqChoicesText ? `\n\n${mcqChoicesText}` : ""}\n\nCorrect Answer: ${mcqCorrectLabel || note.content}${note.explanation ? `\n\nExplanation: ${note.explanation}` : ""}`
      : note.category === "true_false"
      ? `${note.title && note.title !== note.question ? `${note.title}\n\n` : ""}Statement: ${note.question || note.title}\n\nAnswer: ${note.answer || (note.correctOptionIndex === 1 ? "False" : "True")}${note.explanation ? `\n\nExplanation: ${note.explanation}` : ""}`
      : note.category === "fill_in_blank"
      ? `${note.title && note.title !== note.question ? `${note.title}\n\n` : ""}Fill in the Blank: ${note.question || note.title}\n\nAnswer: ${note.answer || note.content}${note.explanation ? `\n\nExplanation: ${note.explanation}` : ""}`
      : note.question && note.answer
      ? `${note.title && note.title !== note.question ? `${note.title}\n\n` : ""}Q: ${note.question}\n\nA: ${note.answer}${note.explanation ? `\n\nExplanation: ${note.explanation}` : ""}`
      : note.term && note.definition
      ? `${note.title && note.title !== note.term ? `${note.title}\n\n` : ""}${note.term}\n${note.definition}`
      : note.url
      ? `${note.title}\n${note.url}${note.urlNotes ? `\n\n${note.urlNotes}` : ""}`
      : `${note.title}\n\n${note.content}`;
    navigator.clipboard.writeText(copyText);
    setCopiedNoteId(note.id);
    setTimeout(() => setCopiedNoteId(null), 2000);
  };

  const handleExportNotesMarkdown = () => {
    if (currentHub.notes.length === 0) return;
    const lines: string[] = [
      `# ${goal.name} — Study Notes`,
      `Exported: ${new Date().toLocaleDateString()} (${currentHub.notes.length} notes)`,
      ""
    ];
    for (const note of currentHub.notes) {
      lines.push(`---`);
      lines.push(`## ${note.title || formatCategoryLabel(note.category)}`);
      const metaParts = [formatCategoryLabel(note.category)];
      if (note.chapterTitle) metaParts.push(note.chapterTitle);
      if (note.updatedAt) metaParts.push(`Updated ${new Date(note.updatedAt).toLocaleDateString()}`);
      lines.push(`*${metaParts.join(" · ")}*`);
      lines.push("");
      if (note.question && note.answer) {
        lines.push(`**Question:** ${note.question}`);
        if (Array.isArray(note.options) && note.options.length > 0) {
          note.options.forEach((opt, i) => lines.push(`- ${String.fromCharCode(65 + i)}) ${opt}`));
        }
        lines.push(`**Answer:** ${note.answer}`);
        if (note.explanation) lines.push(`**Explanation:** ${note.explanation}`);
      } else if (note.term && note.definition) {
        lines.push(`**${note.term}:** ${note.definition}`);
      } else if (note.url) {
        lines.push(note.url);
        if (note.urlNotes) lines.push("", note.urlNotes);
      } else {
        lines.push(note.content || "");
      }
      if (note.screenshots && note.screenshots.length > 0) {
        lines.push("", `*(${note.screenshots.length} attached image${note.screenshots.length === 1 ? "" : "s"} saved in app)*`);
      }
      if (note.keyTerms && note.keyTerms.length > 0) {
        lines.push("", `Key terms: ${note.keyTerms.map(t => `#${t}`).join(" ")}`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${goal.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "study"}-notes.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setAiNotice(`Exported ${currentHub.notes.length} notes as Markdown.`);
    setTimeout(() => setAiNotice(null), 3500);
  };

  // 4. Test Runner Flow
  const startTest = (test: KnowledgeTestArtifact) => {
    setActiveTest(test);
    setCurrentQuestionIndex(0);
    setSelectedOptionIndex(null);
    setSelectedMultiIndices([]);
    setIsAnswerSubmitted(false);
    setTestUserAnswers({});
    setTestUserMultiAnswers({});
    setIsTestCompleted(false);
    setPreviewReviewNoteId(null);
  };

  const handleSelectOption = (optIndex: number) => {
    if (isAnswerSubmitted) return;
    setSelectedOptionIndex(optIndex);
  };

  const handleToggleMultiOption = (optIndex: number) => {
    if (isAnswerSubmitted) return;
    setSelectedMultiIndices(prev =>
      prev.includes(optIndex)
        ? prev.filter(i => i !== optIndex)
        : [...prev, optIndex].sort((a, b) => a - b)
    );
  };

  const handleSubmitQuestionAnswer = () => {
    if (!activeTest) return;
    const currentQ = activeTest.questions[currentQuestionIndex];
    if (currentQ && isMultiSelectQuestion(currentQ)) {
      if (selectedMultiIndices.length === 0) return;
      const sorted = [...selectedMultiIndices].sort((a, b) => a - b);
      setIsAnswerSubmitted(true);
      setTestUserMultiAnswers(prev => ({
        ...prev,
        [currentQuestionIndex]: sorted
      }));
      return;
    }
    if (selectedOptionIndex === null) return;
    setIsAnswerSubmitted(true);
    setTestUserAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: selectedOptionIndex
    }));
  };

  const handleNextQuestion = () => {
    if (!activeTest) return;
    if (currentQuestionIndex + 1 < activeTest.questions.length) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedOptionIndex(null);
      setSelectedMultiIndices([]);
      setIsAnswerSubmitted(false);
      setPreviewReviewNoteId(null);
    } else {
      // Complete test & calculate score
      finishTest();
    }
  };

  const finishTest = () => {
    if (!activeTest) return;
    let correctCount = 0;
    const finalizedAnswers = { ...testUserAnswers };
    const finalizedMultiAnswers = { ...testUserMultiAnswers };
    const activeQ = activeTest.questions[currentQuestionIndex];
    if (activeQ && isMultiSelectQuestion(activeQ)) {
      if (selectedMultiIndices.length > 0 && !finalizedMultiAnswers[currentQuestionIndex]) {
        finalizedMultiAnswers[currentQuestionIndex] = [...selectedMultiIndices].sort((a, b) => a - b);
      }
    } else if (selectedOptionIndex !== null && finalizedAnswers[currentQuestionIndex] === undefined) {
      finalizedAnswers[currentQuestionIndex] = selectedOptionIndex;
    }

    activeTest.questions.forEach((q, idx) => {
      if (isQuestionAnswerCorrect(q, finalizedAnswers[idx], finalizedMultiAnswers[idx])) {
        correctCount++;
      }
    });

    const totalQuestions = activeTest.questions.length;
    const scorePercent = Math.round((correctCount / totalQuestions) * 100);
    const fraction = `${correctCount}/${totalQuestions}`;

    const updatedTest: KnowledgeTestArtifact = {
      ...activeTest,
      completedAt: new Date().toISOString(),
      lastScore: scorePercent,
      lastScoreFraction: fraction,
      attemptsCount: (activeTest.attemptsCount || 0) + 1
    };

    const updatedTests = currentHub.tests.map(t => t.id === activeTest.id ? updatedTest : t);
    saveHub({
      ...currentHub,
      tests: updatedTests,
      lastTestedAt: new Date().toISOString()
    });

    setTestUserAnswers(finalizedAnswers);
    setTestUserMultiAnswers(finalizedMultiAnswers);
    setActiveTest(updatedTest);
    setIsTestCompleted(true);
    setPreviewReviewNoteId(null);
  };

  const handleGenerateReadingRecommendations = async (
    missedQuestions?: Array<{
      question: string;
      correctAnswer: string;
      userAnswer?: string;
      explanation?: string;
    }>,
    contextLabel?: string
  ) => {
    setIsGeneratingReadings(true);
    const missedList = Array.isArray(missedQuestions) ? missedQuestions : [];
    setReadingRecContextLabel(
      contextLabel ||
        (missedList.length > 0
          ? `Tailored to ${missedList.length} missed ${missedList.length === 1 ? "question" : "questions"}`
          : `${goal.name} Study Topics`)
    );
    try {
      const res = await fetch("/api/coach/recommend-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: goal.name,
          goalCategory: goal.category || "General",
          chapterTitle: activeTest?.chapterTitle || (goal.chapters && goal.chapters[0]?.title) || "",
          examTitle: goal.targetExamTitle || "",
          missedQuestions: missedList,
          existingNoteTitles: currentHub.notes.map(n => n.title).slice(0, 15),
          count: missedList.length > 0 ? Math.min(5, Math.max(3, missedList.length)) : 4
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.recommendations)) {
          setReadingRecommendations(data.recommendations);
        }
      } else {
        setAiNotice("Could not generate reading recommendations right now. Please try again.");
        setTimeout(() => setAiNotice(null), 4000);
      }
    } catch (err) {
      console.error("Failed to generate reading recommendations", err);
      setAiNotice("Network issue while generating reading recommendations.");
      setTimeout(() => setAiNotice(null), 4000);
    } finally {
      setIsGeneratingReadings(false);
    }
  };

  const handleSaveReadingRecommendation = (rec: ReadingRecommendationItem) => {
    if (isRecommendationSaved(rec, currentHub.notes)) return;
    const savedNote = buildSavedReadingNote(
      rec,
      activeTest?.chapterTitle || (goal.chapters && goal.chapters[0]?.title)
    );
    saveHub({
      ...currentHub,
      notes: [savedNote, ...currentHub.notes]
    });
    setAiNotice(`Saved "${rec.title}" to your Study Notes!`);
    setTimeout(() => setAiNotice(null), 3500);
  };

  const handleOpenSavedNote = (noteId: string, fromTest = false) => {
    setSelectedNoteCategory("all");
    setSelectedNoteGroup("all");
    setNoteSearchQuery("");
    setHighlightedNoteId(noteId);
    setExpandedNoteIds(prev => ({ ...prev, [noteId]: true }));
    setJumpedFromTestReview(fromTest);
    setActiveTab("notes");
  };

  const handleGenerateTopicLessonForQuestion = async (
    qKey: string,
    payload: {
      question: string;
      correctAnswer: string;
      userAnswer?: string;
      explanation?: string;
    },
    styleOverride?: TopicLessonStyle
  ) => {
    const styleToUse = styleOverride || topicLessonStyle;
    setTopicLessonStyle(styleToUse);
    setGeneratingLessonQKey(qKey);
    setTopicLessonErrorByQKey(prev => {
      const next = { ...prev };
      delete next[qKey];
      return next;
    });
    try {
      const chapter = activeTest?.chapterTitle || (goal.chapters && goal.chapters[0]?.title) || "";
      const res = await fetch("/api/coach/generate-topic-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: goal.name,
          goalCategory: goal.category || "General",
          chapterTitle: chapter,
          examTitle: goal.targetExamTitle || "",
          question: payload.question,
          correctAnswer: payload.correctAnswer,
          userAnswer: payload.userAnswer || "",
          explanation: payload.explanation || "",
          lessonStyle: styleToUse
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.lesson?.content) {
        setTopicLessonErrorByQKey(prev => ({
          ...prev,
          [qKey]: data?.error || "Could not generate a lesson for this topic right now."
        }));
        return;
      }

      const savedNote = buildGeneratedTopicLessonNote(data.lesson, chapter);
      saveHub({
        ...currentHub,
        notes: [savedNote, ...currentHub.notes]
      });
      setGeneratedLessonNoteByQKey(prev => ({ ...prev, [qKey]: savedNote.id }));
      setAiNotice(`Saved AI ${styleToUse} "${savedNote.title}" to your Study Notes!`);
      setTimeout(() => setAiNotice(null), 4000);
    } catch {
      setTopicLessonErrorByQKey(prev => ({
        ...prev,
        [qKey]: "Network error while generating topic lesson."
      }));
    } finally {
      setGeneratingLessonQKey(null);
    }
  };

  const handleSaveAllReadingRecommendations = () => {
    const unsaved = readingRecommendations.filter(r => !isRecommendationSaved(r, currentHub.notes));
    if (unsaved.length === 0) return;
    const chapter = activeTest?.chapterTitle || (goal.chapters && goal.chapters[0]?.title);
    const newNotes = unsaved.map(r => buildSavedReadingNote(r, chapter));
    saveHub({
      ...currentHub,
      notes: [...newNotes, ...currentHub.notes]
    });
    setAiNotice(`Saved ${newNotes.length} AI reading ${newNotes.length === 1 ? "recommendation" : "recommendations"} to your Study Notes!`);
    setTimeout(() => setAiNotice(null), 4000);
  };

  const renderReadingRecommendationsPanel = () => {
    if (!isGeneratingReadings && readingRecommendations.length === 0) return null;
    const unsavedCount = readingRecommendations.filter(r => !isRecommendationSaved(r, currentHub.notes)).length;

    return (
      <div className="p-4 rounded-xl bg-cyan-50/90 border border-cyan-200 dark:bg-cyan-950/25 dark:border-cyan-700/40 space-y-3 text-left animate-fadeIn">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <BookOpen className="w-4 h-4 text-cyan-700 dark:text-cyan-300 shrink-0" />
            <h4 className="text-xs sm:text-sm font-bold text-cyan-950 dark:text-cyan-100">
              AI Reading Recommendations
            </h4>
            {readingRecContextLabel && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-cyan-800 border border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-200 dark:border-cyan-700/40 font-semibold">
                {readingRecContextLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isGeneratingReadings && unsavedCount > 0 && (
              <button
                type="button"
                onClick={handleSaveAllReadingRecommendations}
                className="keep-white px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-semibold text-white !text-white inline-flex items-center gap-1 cursor-pointer shadow-sm"
              >
                <Plus className="w-3 h-3" />
                <span>Save All ({unsavedCount})</span>
              </button>
            )}
            {!isGeneratingReadings && readingRecommendations.length > 0 && (
              <button
                type="button"
                onClick={() => setReadingRecommendations([])}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>

        {isGeneratingReadings ? (
          <div className="py-5 text-center space-y-2 text-xs text-cyan-900 dark:text-cyan-200">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-cyan-600 dark:text-cyan-400" />
            <p>Curating targeted reading materials &amp; key takeaways...</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {readingRecommendations.map((rec) => {
              const saved = isRecommendationSaved(rec, currentHub.notes);
              const openHref = getRecommendationOpenUrl(rec);
              const hasDirectUrl = isSafePublicHttpUrl(rec.url);
              return (
                <div
                  key={rec.id}
                  className="p-3.5 rounded-xl bg-white dark:bg-[#141727] border border-slate-200 dark:border-cyan-800/35 space-y-2 shadow-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700/35">
                          {rec.type.replace("_", " ")}
                        </span>
                        {rec.sourceName && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            {rec.sourceName}
                          </span>
                        )}
                        {rec.estimatedReadMinutes && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            ~{rec.estimatedReadMinutes} min read
                          </span>
                        )}
                      </div>
                      <h5 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {rec.title}
                      </h5>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={openHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-cyan-50 border border-slate-300 hover:border-cyan-400 text-[11px] font-semibold text-slate-800 hover:text-cyan-900 dark:bg-slate-800 dark:hover:bg-cyan-950/60 dark:border-slate-700 dark:text-slate-200 dark:hover:text-cyan-200 inline-flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{hasDirectUrl ? "Read" : "Search & Read"}</span>
                      </a>
                      <button
                        type="button"
                        disabled={saved}
                        onClick={() => handleSaveReadingRecommendation(rec)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                          saved
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700/40 cursor-default"
                            : "keep-white bg-cyan-600 hover:bg-cyan-500 text-white !text-white shadow-xs"
                        }`}
                      >
                        {saved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        <span>{saved ? "Saved to Notes" : "Save Reading"}</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {rec.whyItHelps}
                  </p>

                  {rec.keyTakeaways && rec.keyTakeaways.length > 0 && (
                    <ul className="space-y-1 pl-3.5 list-disc text-[11px] text-slate-600 dark:text-slate-300">
                      {rec.keyTakeaways.map((tk, tkIdx) => (
                        <li key={tkIdx} className="leading-snug">
                          {tk}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // 5. Flashcards Management
  const handleAddFlashcard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardFront.trim() || !newCardBack.trim()) return;

    const card: FlashcardItem = {
      id: "fc_" + Date.now(),
      front: newCardFront.trim(),
      back: newCardBack.trim(),
      mastered: false,
      lastReviewedAt: new Date().toISOString()
    };

    saveHub({
      ...currentHub,
      flashcards: [...currentHub.flashcards, card]
    });

    setNewCardFront("");
    setNewCardBack("");
    setIsAddingFlashcard(false);
  };

  const handleToggleCardMastery = (cardId: string) => {
    const updatedCards = currentHub.flashcards.map(c => 
      c.id === cardId ? { ...c, mastered: !c.mastered, lastReviewedAt: new Date().toISOString() } : c
    );
    saveHub({
      ...currentHub,
      flashcards: updatedCards
    });
  };

  const handleDeleteFlashcard = (cardId: string) => {
    const updatedCards = currentHub.flashcards.filter(c => c.id !== cardId);
    saveHub({
      ...currentHub,
      flashcards: updatedCards
    });
    if (currentFlashcardIndex >= updatedCards.length && updatedCards.length > 0) {
      setCurrentFlashcardIndex(updatedCards.length - 1);
    }
  };

  const matchesNoteGroup = (category: string) => {
    if (selectedNoteGroup === "all") return true;
    if (selectedNoteGroup === "guides") {
      return ["concept", "cheat_sheet", "summary", "formula"].includes(category);
    }
    if (selectedNoteGroup === "questions") {
      return ["qa", "fill_in_blank", "multiple_choice", "multiple_select", "true_false"].includes(category);
    }
    if (selectedNoteGroup === "definitions") {
      return category === "definition";
    }
    if (selectedNoteGroup === "tables_code") {
      return ["table", "code_snippet"].includes(category);
    }
    if (selectedNoteGroup === "links") {
      return category === "url";
    }
    return true;
  };

  const categoryFilteredNotes = currentHub.notes.filter((n) => {
    if (selectedNoteCategory !== "all") {
      return n.category === selectedNoteCategory;
    }
    return matchesNoteGroup(n.category);
  });

  const duplicateFilteredNotes = showOnlyDuplicates
    ? categoryFilteredNotes.filter(n => Boolean(existingDuplicatesReport.byNoteId[n.id]?.length))
    : categoryFilteredNotes;

  const trimmedSearchQuery = noteSearchQuery.trim().toLowerCase();
  const filteredNotes = trimmedSearchQuery
    ? duplicateFilteredNotes.filter((n) => {
        const haystack = [
          n.title,
          n.content,
          n.question,
          n.answer,
          n.explanation,
          n.term,
          n.definition,
          n.url,
          n.urlNotes,
          n.chapterTitle,
          n.sourceFileName,
          ...(n.keyTerms || []),
          ...(n.options || [])
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(trimmedSearchQuery);
      })
    : duplicateFilteredNotes;

  const totalFlashcards = currentHub.flashcards.length;
  const masteredFlashcards = currentHub.flashcards.filter(f => f.mastered).length;
  const masteryScore = currentHub.overallMasteryScore || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 dark:bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-6xl h-[92vh] max-h-[920px] flex flex-col bg-white dark:bg-[#11131f] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* Clean Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#141624]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="keep-white p-2.5 rounded-xl bg-violet-600 !text-white shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white truncate">
                {goal.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                <span>Study Hub</span>
                <span aria-hidden="true">·</span>
                <span>Mastery {masteryScore}%</span>
                <span aria-hidden="true">·</span>
                <span>{currentHub.notes.length} notes</span>
                <span aria-hidden="true">·</span>
                <span>{masteredFlashcards}/{totalFlashcards} cards mastered</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 rounded-xl transition-colors shrink-0 cursor-pointer"
            title="Close Hub"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global AI Action Notification Toast */}
        {aiNotice && (
          <div className="px-6 py-2 bg-violet-50 dark:bg-violet-950/70 border-b border-violet-200 dark:border-violet-800/60 text-xs text-violet-900 dark:text-violet-200 flex items-center gap-2 animate-fadeIn">
            <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-300 shrink-0" />
            <span className="font-medium">{aiNotice}</span>
          </div>
        )}

        {/* Clean Single-Row Navigation Tabs Bar */}
        <div className="flex items-center justify-between gap-4 px-6 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#121422]">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab("notes")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "notes"
                  ? "border-violet-600 dark:border-violet-400 text-slate-900 dark:text-white"
                  : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
              <span>Study Notes</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                ({currentHub.notes.length})
              </span>
            </button>

            <button
              onClick={() => setActiveTab("tester")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "tester"
                  ? "border-indigo-600 dark:border-indigo-400 text-slate-900 dark:text-white"
                  : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Knowledge Tester</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                ({currentHub.tests.length})
              </span>
            </button>

            <button
              onClick={() => setActiveTab("flashcards")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "flashcards"
                  ? "border-emerald-600 dark:border-emerald-400 text-slate-900 dark:text-white"
                  : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Flashcards</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                ({masteredFlashcards}/{totalFlashcards})
              </span>
            </button>

            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "overview"
                  ? "border-amber-500 text-slate-900 dark:text-white"
                  : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Award className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
              <span>Mastery Stats</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 py-2">
            {activeTab === "tester" && (
              <button
                onClick={() => handleAIGenerateTest()}
                disabled={isGeneratingTest}
                className="keep-white px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium !text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200 dark:text-amber-300" />
                <span>{isGeneratingTest ? "Authoring..." : "AI Author Test"}</span>
              </button>
            )}

            {activeTab === "flashcards" && (
              <button
                onClick={() => setIsAddingFlashcard(!isAddingFlashcard)}
                className="keep-white px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium !text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Card</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body / Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 bg-slate-50/60 dark:bg-[#0e101a] custom-scrollbar">
          
          {/* TAB 1: STUDY NOTES & ARTIFACTS */}
          {activeTab === "notes" && (
            <div className="space-y-6">
              {/* Calm Workspace Toolbar: Search + Primary Actions */}
              <div className="space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={noteSearchQuery}
                      onChange={e => setNoteSearchQuery(e.target.value)}
                      placeholder="Search notes, questions, terms, chapters, or #tags..."
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-[#141727] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                    />
                    {noteSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setNoteSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNote(true);
                        setIsUploadingInNotes(false);
                      }}
                      className="keep-white px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-semibold !text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Note</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsUploadingInNotes(true);
                        setIsAddingNote(false);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-[#141727] dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Upload Video / Text</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAIGenerateStudyNotes()}
                      disabled={isGeneratingNotes}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-[#141727] dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      <span>{isGeneratingNotes ? "Generating..." : "AI Guide"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (existingDuplicatesReport.duplicateNoteIds.length === 0) {
                          setShowOnlyDuplicates(false);
                          setAiNotice(
                            currentHub.notes.length < 2
                              ? "Add at least 2 notes to scan for duplicates."
                              : `Checked all ${currentHub.notes.length} notes from first to end — no duplicate or similar wording found!`
                          );
                          setTimeout(() => setAiNotice(null), 4000);
                          return;
                        }
                        const nextShow = !showOnlyDuplicates;
                        setShowOnlyDuplicates(nextShow);
                        if (nextShow) {
                          setSelectedNoteCategory("all");
                          setSelectedNoteGroup("all");
                          setAiNotice(
                            `Highlighted ${existingDuplicatesReport.duplicateNoteIds.length} notes with duplicate or similar wording.`
                          );
                          setTimeout(() => setAiNotice(null), 4000);
                        }
                      }}
                      title="Scan all notes from first to end for exact and non-exact duplicate wording"
                      className={`px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        existingDuplicatesReport.duplicateNoteIds.length > 0
                          ? showOnlyDuplicates
                            ? "keep-white bg-amber-600 border-amber-500 !text-white"
                            : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 dark:text-amber-200 dark:border-amber-600/40"
                          : "bg-white hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-[#141727] dark:hover:bg-slate-800 dark:text-slate-300 dark:border-slate-800"
                      }`}
                    >
                      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${
                        existingDuplicatesReport.duplicateNoteIds.length > 0
                          ? showOnlyDuplicates
                            ? "text-white"
                            : "text-amber-600 dark:text-amber-300"
                          : "text-slate-400"
                      }`} />
                      <span>
                        {existingDuplicatesReport.duplicateNoteIds.length > 0
                          ? showOnlyDuplicates
                            ? `Duplicates (${existingDuplicatesReport.duplicateNoteIds.length})`
                            : `${existingDuplicatesReport.duplicateNoteIds.length} Duplicates`
                          : "Check Duplicates"}
                      </span>
                    </button>

                    {currentHub.notes.length > 0 && (
                      <button
                        type="button"
                        onClick={handleExportNotesMarkdown}
                        title="Download all notes for this goal as a Markdown (.md) backup"
                        className="p-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-[#141727] dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Grouped Segmented Filter + Subtype Select + Compact/Expand Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#141727] border border-slate-200 dark:border-slate-800/80 overflow-x-auto max-w-full">
                    {(
                      [
                        { id: "all", label: "All" },
                        { id: "guides", label: "Notes & Guides" },
                        { id: "questions", label: "Practice Questions" },
                        { id: "definitions", label: "Definitions" },
                        { id: "tables_code", label: "Tables & Code" },
                        { id: "links", label: "Links & Videos" }
                      ] as const
                    ).map((grp) => {
                      const isActive = selectedNoteCategory === "all" && selectedNoteGroup === grp.id;
                      return (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => {
                            setSelectedNoteGroup(grp.id);
                            setSelectedNoteCategory("all");
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            isActive
                              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                          }`}
                        >
                          {grp.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <select
                      aria-label="Filter by exact note type"
                      value={selectedNoteCategory}
                      onChange={(e) => {
                        setSelectedNoteCategory(e.target.value);
                        if (e.target.value !== "all") {
                          setSelectedNoteGroup("all");
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#141727] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500 cursor-pointer"
                    >
                      <option value="all">Exact Type: Any</option>
                      <option value="concept">Concept</option>
                      <option value="cheat_sheet">Cheat Sheet</option>
                      <option value="summary">Summary</option>
                      <option value="formula">Formula</option>
                      <option value="code_snippet">Code Snippet</option>
                      <option value="table">Table</option>
                      <option value="qa">Question &amp; Answer</option>
                      <option value="fill_in_blank">Fill in the Blank</option>
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="multiple_select">Multiple Select</option>
                      <option value="true_false">True / False</option>
                      <option value="definition">Definition</option>
                      <option value="url">URL / Video</option>
                    </select>

                    {filteredNotes.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAllNotesExpanded(prev => !prev);
                          setExpandedNoteIds({});
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-[#141727] dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {allNotesExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Compact View</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>Expand All</span>
                          </>
                        )}
                      </button>
                    )}

                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {filteredNotes.length} of {currentHub.notes.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Focused Overlay Drawer for Upload Downloaded Video & Transcript */}
              {isUploadingInNotes && (
                <div
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setIsUploadingInNotes(false);
                  }}
                  className="fixed inset-0 z-40 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs flex items-start justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn"
                >
                <div
                  onPaste={handleHubUploadPaste}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter")) {
                      e.preventDefault();
                      if (!isExtractingUpload && (uploadedVideoFile || uploadedTranscriptFile || uploadedTranscriptText.trim())) {
                        void handleExtractFromUpload({ mode: "both", startGeneratedTest: false });
                      }
                    }
                  }}
                  className="w-full max-w-3xl my-auto p-6 rounded-2xl bg-white dark:bg-[#16192a] border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyan-900/30 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Video className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        Upload Downloaded Lecture Video &amp; Transcript Text
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Upload a course video (.mp4, .mov, .webm), attach a transcript (.vtt, .srt, .txt), or paste long text with embedded images — text and images are saved together.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsUploadingInNotes(false)}
                      className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {uploadError && (
                    <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/40 text-xs text-rose-800 dark:text-rose-200">
                      {uploadError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-dashed border-cyan-400 dark:border-cyan-600/45 hover:border-cyan-500 dark:hover:border-cyan-400/70 transition cursor-pointer">
                      <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 mb-1">
                        <Video className="w-3.5 h-3.5" />
                        <span>Video / Audio File (Max 250 MB)</span>
                      </span>
                      <input
                        type="file"
                        accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.m4v,.mp3,.wav,.m4a"
                        onChange={e => setUploadedVideoFile(e.target.files?.[0] || null)}
                        className="sr-only"
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300 block truncate">
                        {uploadedVideoFile
                          ? `${uploadedVideoFile.name} (${(uploadedVideoFile.size / (1024 * 1024)).toFixed(1)} MB)`
                          : "Choose downloaded video (MP4, MOV, WebM, MKV)..."}
                      </span>
                    </label>

                    <label className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-dashed border-slate-300 dark:border-slate-700 hover:border-violet-500/60 transition cursor-pointer">
                      <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5 mb-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Transcript / Subtitle File (Optional)</span>
                      </span>
                      <input
                        type="file"
                        accept=".txt,.vtt,.srt,.md,text/plain,text/vtt"
                        onChange={e => setUploadedTranscriptFile(e.target.files?.[0] || null)}
                        className="sr-only"
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300 block truncate">
                        {uploadedTranscriptFile
                          ? uploadedTranscriptFile.name
                          : "Optional: attach .txt, .vtt, .srt, or .md..."}
                      </span>
                    </label>
                  </div>

                  <input
                    type="text"
                    placeholder="Lesson Title (Optional — e.g. Week 2: Subnetting & CIDR)"
                    value={uploadedLessonTitle}
                    onChange={e => setUploadedLessonTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />

                  <textarea
                    rows={4}
                    placeholder="Optional: paste transcript, captions, or long rich text/markdown containing images here..."
                    value={uploadedTranscriptText}
                    onChange={e => setUploadedTranscriptText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />

                  {/* Pasted / Attached Images Strip inside Upload Panel */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          ref={hubUploadImageFileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={e => {
                            void handleUploadPanelImageFiles(e.target.files);
                            e.target.value = "";
                          }}
                          className="sr-only"
                        />
                        <button
                          type="button"
                          onClick={() => hubUploadImageFileInputRef.current?.click()}
                          disabled={uploadedScreenshots.length >= MAX_NOTE_IMAGES}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/90 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/70 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        >
                          <ImagePlus className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span>Attach Image</span>
                        </button>
                        {isProcessingUploadImages && (
                          <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Importing pasted images...</span>
                          </span>
                        )}
                      </div>
                      {uploadedScreenshots.length > 0 && (
                        <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300 tabular-nums">
                          {uploadedScreenshots.length}/{MAX_NOTE_IMAGES} images stored for this note
                        </span>
                      )}
                    </div>

                    {uploadedScreenshots.length > 0 && (
                      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${uploadedScreenshots.length > 4 ? "max-h-56 overflow-y-auto pr-1 custom-scrollbar" : ""}`}>
                        {uploadedScreenshots.map((src, idx) => (
                          <div key={`${idx}_${src.slice(0, 32)}`} className="relative group rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-black aspect-video">
                            <button
                              type="button"
                              onClick={() => setLightboxScreenshotUrl(src)}
                              className="w-full h-full block cursor-zoom-in"
                            >
                              <img src={src} alt={`Upload image ${idx + 1}`} className="w-full h-full object-cover" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setUploadedScreenshots(prev => prev.filter((_, i) => i !== idx))}
                              className="keep-white absolute top-1 right-1 p-1 rounded-full bg-black/75 hover:bg-rose-600 !text-white cursor-pointer"
                              title="Remove image"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-auto hidden sm:inline">
                      Tip: Press Ctrl+Enter to save &amp; extract
                    </span>
                    <button
                      type="button"
                      disabled={isExtractingUpload || (!uploadedTranscriptFile && !uploadedTranscriptText.trim() && uploadedScreenshots.length === 0)}
                      onClick={() => void handleSaveUploadDirectly()}
                      title="Save pasted text and images verbatim as a Study Note without AI summarization"
                      className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/90 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600/60 disabled:opacity-40 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Save Text &amp; Images as Note</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExtractingUpload || (!uploadedVideoFile && !uploadedTranscriptFile && !uploadedTranscriptText.trim())}
                      onClick={() => handleExtractFromUpload({ mode: "both", startGeneratedTest: false })}
                      title="Save Notes & Quiz (Ctrl + Enter)"
                      className="keep-white px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-xs font-semibold !text-white inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isExtractingUpload ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-200 dark:text-amber-300" />}
                      <span>{isExtractingUpload ? "Analyzing Lecture..." : "Save Notes & Quiz"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExtractingUpload || (!uploadedVideoFile && !uploadedTranscriptFile && !uploadedTranscriptText.trim())}
                      onClick={() => handleExtractFromUpload({ mode: "both", startGeneratedTest: true })}
                      className="keep-white px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold !text-white inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isExtractingUpload ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                      <span>{isExtractingUpload ? "Building Quiz..." : "Extract & Test Me Now"}</span>
                    </button>
                  </div>
                </div>
                </div>
              )}

              {/* Focused Overlay Drawer for Adding a Study Note */}
              {isAddingNote && (
                <div
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setIsAddingNote(false);
                  }}
                  className="fixed inset-0 z-40 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs flex items-start justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn"
                >
                <form 
                  onSubmit={handleCreateManualNote}
                  onPaste={handleHubFormPaste}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter")) {
                      e.preventDefault();
                      if (!isExtractingUrl) {
                        e.currentTarget.requestSubmit();
                      }
                      return;
                    }
                    if (
                      newNoteCategory === "fill_in_blank" &&
                      e.altKey &&
                      !e.ctrlKey &&
                      !e.metaKey &&
                      !e.shiftKey &&
                      (e.code === "KeyB" || e.key.toLowerCase() === "b")
                    ) {
                      e.preventDefault();
                      insertBlankIntoHubPrompt();
                      return;
                    }
                    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      const container = e.currentTarget;
                      const candidates = Array.from(
                        container.querySelectorAll<HTMLElement>(
                          'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]):not(.sr-only), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                        )
                      ).filter((el) => {
                        if (el.tabIndex < 0 || el.hasAttribute("disabled") || el.classList.contains("sr-only")) return false;
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                      });
                      const active = document.activeElement as HTMLElement | null;
                      const idx = active ? candidates.indexOf(active) : -1;
                      if (idx !== -1) {
                        if (!e.shiftKey && idx < candidates.length - 1) {
                          e.preventDefault();
                          candidates[idx + 1].focus();
                        } else if (e.shiftKey && idx > 0) {
                          e.preventDefault();
                          candidates[idx - 1].focus();
                        }
                      }
                    }
                  }}
                  className="w-full max-w-3xl my-auto p-6 rounded-2xl bg-white dark:bg-[#16192a] border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-violet-900/30 pb-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      Create New Study Material Artifact
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsAddingNote(false)}
                      className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {newNoteCategory !== "qa" && newNoteCategory !== "fill_in_blank" && newNoteCategory !== "multiple_choice" && newNoteCategory !== "multiple_select" && newNoteCategory !== "true_false" && newNoteCategory !== "definition" && (
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {newNoteCategory === "reading_url"
                            ? "Article / Website Title (Optional)"
                            : newNoteCategory === "url"
                            ? "Resource Title (Optional)"
                            : newNoteCategory === "table"
                            ? "Table Title (Optional)"
                            : "Artifact Title"}
                        </label>
                        <input
                          type="text"
                          placeholder={
                            newNoteCategory === "reading_url"
                              ? "e.g. MDN HTTP Guide or Reading Chapter (auto-detected if blank)"
                              : newNoteCategory === "url"
                              ? "e.g. CompTIA Security+ DNS Lecture (auto-detected if blank)"
                              : newNoteCategory === "table"
                              ? "e.g. OSI Model Layers or Common TCP/UDP Ports"
                              : "e.g. DNS Resolution Flow & Troubleshooting Protocol"
                          }
                          value={newNoteTitle}
                          onChange={e => setNewNoteTitle(e.target.value)}
                          required={newNoteCategory !== "url" && newNoteCategory !== "reading_url" && newNoteCategory !== "table" && newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    )}

                    <div className={`space-y-1 ${newNoteCategory === "qa" || newNoteCategory === "fill_in_blank" || newNoteCategory === "multiple_choice" || newNoteCategory === "multiple_select" || newNoteCategory === "true_false" || newNoteCategory === "definition" ? "md:col-span-3" : ""}`}>
                      <label
                        htmlFor="hub_note_type_select"
                        className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Category Type
                      </label>
                      <select
                        id="hub_note_type_select"
                        tabIndex={0}
                        aria-label="Category Type"
                        value={newNoteCategory}
                        onChange={e => {
                          if (e.target.value === "video_upload") {
                            setIsAddingNote(false);
                            setIsUploadingInNotes(true);
                            return;
                          }
                          setNewNoteCategory(e.target.value as StudyArtifactNote["category"] | "reading_url");
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/45"
                      >
                        <option value="concept">Concept Breakdown</option>
                        <option value="cheat_sheet">Cheat Sheet / Reference</option>
                        <option value="code_snippet">Code Snippet / Commands</option>
                        <option value="summary">Chapter Summary</option>
                        <option value="formula">Formula / Algorithm</option>
                        <option value="table">Table</option>
                        <option value="qa">Question &amp; Answer</option>
                        <option value="fill_in_blank">Fill in the Blank</option>
                        <option value="multiple_choice">Multiple Choice Question</option>
                        <option value="multiple_select">Multiple Select (Check All)</option>
                        <option value="true_false">True / False Question</option>
                        <option value="definition">Definition</option>
                        <option value="url">Video / Resource URL</option>
                        <option value="reading_url">Website Reading Link (Regular URL)</option>
                        <option value="video_upload">Upload Video / Text</option>
                      </select>
                    </div>
                  </div>

                  {newNoteCategory === "qa" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Question</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Write your study question..."
                          value={newNoteQuestion}
                          onChange={e => setNewNoteQuestion(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-amber-300 dark:border-amber-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Answer</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Write the answer..."
                          value={newNoteAnswer}
                          onChange={e => setNewNoteAnswer(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-emerald-300 dark:border-emerald-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          <span>Answer Explanation (Optional)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Optional: explain why this answer is correct..."
                          value={newNoteExplanation}
                          onChange={e => setNewNoteExplanation(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  ) : newNoteCategory === "fill_in_blank" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Sentence / Prompt with Blank</span>
                          </label>
                          <button
                            type="button"
                            onClick={insertBlankIntoHubPrompt}
                            title="Insert blank at cursor (Alt+B / Option+B)"
                            className="px-2 py-0.5 rounded-md bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-800 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 dark:border-teal-500/40 text-[11px] font-semibold dark:text-teal-300 transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
                          >
                            <span>+ Insert ___</span>
                            <kbd className="px-1 py-0 rounded bg-teal-100/80 dark:bg-teal-950/60 border border-teal-300 dark:border-teal-500/30 font-mono text-[10px] text-teal-900 dark:text-teal-200">
                              Alt+B
                            </kbd>
                          </button>
                        </div>
                        <textarea
                          ref={newNoteBlankPromptRef}
                          rows={2}
                          placeholder="e.g. DNS translates domain names into ___ addresses. (Or wrap [IP] in brackets)"
                          value={newNoteQuestion}
                          onChange={e => setNewNoteQuestion(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-teal-300 dark:border-teal-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Missing Word / Answer</span>
                          </label>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Separate multiple blanks with commas
                          </span>
                        </div>
                        <textarea
                          rows={2}
                          placeholder="e.g. IP (or leave blank if using [brackets] above)"
                          value={newNoteAnswer}
                          onChange={e => setNewNoteAnswer(e.target.value)}
                          required={newNoteScreenshots.length === 0 && !/\[[^\[\]]+\]/.test(newNoteQuestion)}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-emerald-300 dark:border-emerald-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          <span>Answer Explanation (Optional)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Optional: explain why this word/concept fits..."
                          value={newNoteExplanation}
                          onChange={e => setNewNoteExplanation(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  ) : newNoteCategory === "multiple_choice" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Multiple Choice Question</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="e.g. Which port does DNS use by default?"
                          value={newNoteQuestion}
                          onChange={e => setNewNoteQuestion(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-indigo-300 dark:border-indigo-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Answer Choices (Click letter to mark correct)</span>
                          </label>
                          {newNoteMcqOptions.length < 6 && (
                            <button
                              type="button"
                              onClick={() => setNewNoteMcqOptions(prev => [...prev, ""])}
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200 cursor-pointer"
                            >
                              + Add Choice
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {newNoteMcqOptions.map((opt, idx) => {
                            const isCorrect = newNoteMcqCorrectIndex === idx;
                            return (
                              <div key={idx} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setNewNoteMcqCorrectIndex(idx)}
                                  title={isCorrect ? "Marked as correct answer" : `Mark choice ${String.fromCharCode(65 + idx)} as correct`}
                                  className={`w-8 h-8 rounded-lg border text-xs font-mono font-bold flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                    isCorrect
                                      ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white shadow-sm"
                                      : "bg-white dark:bg-slate-900/80 border-slate-300 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 hover:border-emerald-400"
                                  }`}
                                >
                                  {String.fromCharCode(65 + idx)}
                                </button>
                                <input
                                  type="text"
                                  placeholder={`Choice ${String.fromCharCode(65 + idx)}${idx >= 2 ? " (optional if >=2 filled)" : ""}`}
                                  value={opt}
                                  required={idx < 2 && newNoteScreenshots.length === 0}
                                  onChange={e => {
                                    const next = [...newNoteMcqOptions];
                                    next[idx] = e.target.value;
                                    setNewNoteMcqOptions(next);
                                  }}
                                  className={`flex-1 min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none ${
                                    isCorrect
                                      ? "border-emerald-400 dark:border-emerald-600/60 focus:border-emerald-500"
                                      : "border-slate-300 dark:border-slate-700/60 focus:border-indigo-500"
                                  }`}
                                />
                                {newNoteMcqOptions.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewNoteMcqOptions(prev => prev.filter((_, i) => i !== idx));
                                      setNewNoteMcqCorrectIndex(prev =>
                                        prev === idx ? 0 : prev > idx ? prev - 1 : prev
                                      );
                                    }}
                                    title="Remove choice"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          <span>Answer Explanation (Optional)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Optional: explain why this choice is correct..."
                          value={newNoteExplanation}
                          onChange={e => setNewNoteExplanation(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  ) : newNoteCategory === "multiple_select" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Multiple Select Question (Select All That Apply)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="e.g. Which of the following protocols operate at the Transport layer? (Select all that apply)"
                          value={newNoteQuestion}
                          onChange={e => setNewNoteQuestion(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-blue-300 dark:border-blue-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Answer Choices (Check all correct answers)</span>
                          </label>
                          {newNoteMcqOptions.length < 6 && (
                            <button
                              type="button"
                              onClick={() => setNewNoteMcqOptions(prev => [...prev, ""])}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 cursor-pointer"
                            >
                              + Add Choice
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {newNoteMcqOptions.map((opt, idx) => {
                            const isChecked = newNoteMultiSelectIndices.includes(idx);
                            return (
                              <div key={idx} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setNewNoteMultiSelectIndices(prev =>
                                      prev.includes(idx)
                                        ? prev.filter(i => i !== idx)
                                        : [...prev, idx].sort((a, b) => a - b)
                                    )
                                  }
                                  title={isChecked ? "Uncheck correct answer" : `Check choice ${String.fromCharCode(65 + idx)} as correct`}
                                  className={`h-8 px-2 rounded-lg border text-xs font-mono font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                                    isChecked
                                      ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white shadow-sm"
                                      : "bg-white dark:bg-slate-900/80 border-slate-300 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 hover:border-emerald-400"
                                  }`}
                                >
                                  <span
                                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                      isChecked
                                        ? "border-white/90 bg-emerald-700/50"
                                        : "border-slate-400 dark:border-slate-500"
                                    }`}
                                  >
                                    {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
                                  </span>
                                  <span>{String.fromCharCode(65 + idx)}</span>
                                </button>
                                <input
                                  type="text"
                                  placeholder={`Choice ${String.fromCharCode(65 + idx)}${idx >= 2 ? " (optional if >=2 filled)" : ""}`}
                                  value={opt}
                                  required={idx < 2 && newNoteScreenshots.length === 0}
                                  onChange={e => {
                                    const next = [...newNoteMcqOptions];
                                    next[idx] = e.target.value;
                                    setNewNoteMcqOptions(next);
                                  }}
                                  className={`flex-1 min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none ${
                                    isChecked
                                      ? "border-emerald-400 dark:border-emerald-600/60 focus:border-emerald-500"
                                      : "border-slate-300 dark:border-slate-700/60 focus:border-blue-500"
                                  }`}
                                />
                                {newNoteMcqOptions.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewNoteMcqOptions(prev => prev.filter((_, i) => i !== idx));
                                      setNewNoteMultiSelectIndices(prev =>
                                        prev
                                          .filter(i => i !== idx)
                                          .map(i => (i > idx ? i - 1 : i))
                                      );
                                    }}
                                    title="Remove choice"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          <span>Answer Explanation (Optional)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Optional: explain why these choices are correct..."
                          value={newNoteExplanation}
                          onChange={e => setNewNoteExplanation(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  ) : newNoteCategory === "true_false" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>True / False Statement</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="e.g. UDP guarantees ordered, reliable packet delivery."
                          value={newNoteQuestion}
                          onChange={e => setNewNoteQuestion(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-purple-300 dark:border-purple-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Correct Answer</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setNewNoteTrueFalseAnswer("true")}
                            className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              newNoteTrueFalseAnswer === "true"
                                ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white shadow-sm"
                                : "bg-white dark:bg-slate-900/80 border-slate-300 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-emerald-400"
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>True</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewNoteTrueFalseAnswer("false")}
                            className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              newNoteTrueFalseAnswer === "false"
                                ? "keep-white bg-rose-600 border-rose-600 text-white !text-white shadow-sm"
                                : "bg-white dark:bg-slate-900/80 border-slate-300 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-rose-400"
                            }`}
                          >
                            <XCircle className="w-4 h-4" />
                            <span>False</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          <span>Answer Explanation (Optional)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Optional: explain why this statement is true or false..."
                          value={newNoteExplanation}
                          onChange={e => setNewNoteExplanation(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  ) : newNoteCategory === "definition" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Term / Concept</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Zero Trust Architecture"
                          value={newNoteTerm}
                          onChange={e => setNewNoteTerm(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-sky-300 dark:border-sky-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          <span>Definition</span>
                        </label>
                        <textarea
                          rows={4}
                          placeholder="Write the clear definition and any important context..."
                          value={newNoteDefinition}
                          onChange={e => setNewNoteDefinition(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-emerald-300 dark:border-emerald-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ) : newNoteCategory === "url" || newNoteCategory === "reading_url" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5" />
                          <span>
                            {newNoteCategory === "reading_url" ? "Website Reading URL" : "Video or Resource URL"}
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="url"
                            placeholder={
                              newNoteCategory === "reading_url"
                                ? "https://example.com/article, docs, or reading page"
                                : "https://www.youtube.com/watch?v=..., Coursera, Udemy, or docs URL"
                            }
                            value={newNoteUrl}
                            onChange={e => {
                              const val = e.target.value;
                              setNewNoteUrl(val);
                              if (newNoteCategory === "url" && isLikelyLoginProtectedUrl(val)) {
                                setNewNoteRequiresLogin(true);
                              }
                            }}
                            required
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-cyan-300 dark:border-cyan-700/40 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                          />
                          {isSafeHttpUrl(newNoteUrl) && (
                            <a
                              href={newNoteUrl.trim()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="keep-white px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 !text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <span>Read</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {newNoteCategory === "reading_url" ? (
                        <label className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newNoteAssignReading}
                            onChange={e => setNewNoteAssignReading(e.target.checked)}
                            className="rounded border-cyan-500 text-cyan-500 focus:ring-cyan-500"
                          />
                          <span>Remind me to read this website when studying, reviewing, or testing</span>
                        </label>
                      ) : (
                        <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newNoteRequiresLogin}
                            onChange={e => setNewNoteRequiresLogin(e.target.checked)}
                            className="rounded border-amber-500 text-amber-500 focus:ring-amber-500"
                          />
                          <span>Requires login (remind me to go study this link when studying, reviewing, or testing)</span>
                        </label>
                      )}

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {newNoteCategory === "reading_url"
                            ? "Reading Highlights or Notes (Optional)"
                            : "Lesson Context or Transcript (Optional)"}
                        </label>
                        <textarea
                          rows={3}
                          placeholder={
                            newNoteCategory === "reading_url"
                              ? "Optional: paste key takeaways from the webpage, or leave blank to extract notes directly from the website."
                              : "Optional: paste key takeaways or transcript so I can extract notes & quiz questions for login-protected lessons."
                          }
                          value={newNoteUrlContext}
                          onChange={e => setNewNoteUrlContext(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      {(newNoteCategory === "reading_url" || !newNoteRequiresLogin || newNoteUrlContext.trim().length > 0) && (
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={extractOnHubUrlSave}
                            onChange={e => setExtractOnHubUrlSave(e.target.checked)}
                            className="rounded border-slate-400 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
                          />
                          <span>
                            {newNoteCategory === "reading_url"
                              ? "Extract AI study notes, flashcards & quiz questions from this website"
                              : "Extract AI study notes, flashcards & quiz questions from this link"}
                          </span>
                        </label>
                      )}
                    </div>
                  ) : newNoteCategory === "table" ? (
                    <TableNoteEditor
                      headers={newNoteTableHeaders}
                      rows={newNoteTableRows}
                      onChange={(nextHeaders, nextRows) => {
                        setNewNoteTableHeaders(nextHeaders);
                        setNewNoteTableRows(nextRows);
                      }}
                    />
                  ) : (
                    <StudyNoteTextEditor
                      label="Content (Lists & Markdown Supported)"
                      rows={6}
                      placeholder="Write structured notes, bulleted lists (- item), numbered steps (1. item), key equations, or code syntax..."
                      value={newNoteContent}
                      onChange={setNewNoteContent}
                      required={newNoteScreenshots.length === 0}
                    />
                  )}

                  {/* Screenshot Capture & Paste Strip (All Note Types) */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTakeHubScreenshot}
                          disabled={isCapturingHubScreenshot || newNoteScreenshots.length >= MAX_NOTE_IMAGES}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-violet-50 dark:bg-slate-900/90 dark:hover:bg-violet-950/60 border border-slate-300 dark:border-slate-700/70 hover:border-violet-400 dark:hover:border-violet-500/60 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                          title="Capture screen, or snip with Win+Shift+S / Cmd+Shift+4 and paste with Ctrl+V"
                        >
                          {isCapturingHubScreenshot ? (
                            <Loader2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 animate-spin" />
                          ) : (
                            <Camera className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          )}
                          <span>{isCapturingHubScreenshot ? "Capturing..." : "Take Screenshot"}</span>
                        </button>

                        <input
                          ref={hubScreenshotFileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={e => {
                            void handleUploadHubScreenshotFiles(e.target.files);
                            e.target.value = "";
                          }}
                          className="sr-only"
                        />
                        <button
                          type="button"
                          onClick={() => hubScreenshotFileInputRef.current?.click()}
                          disabled={newNoteScreenshots.length >= MAX_NOTE_IMAGES}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/90 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/70 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        >
                          <ImagePlus className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span>Attach Image</span>
                        </button>

                        {isProcessingPastedImages && (
                          <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Importing pasted images...</span>
                          </span>
                        )}
                      </div>
                      {newNoteScreenshots.length > 0 && (
                        <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300 tabular-nums">
                          {newNoteScreenshots.length}/{MAX_NOTE_IMAGES} images attached
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                      <span>Snip or copy text with embedded images:</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[10px] text-slate-800 dark:text-slate-200">
                        Win+Shift+S
                      </kbd>
                      <span>/</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[10px] text-slate-800 dark:text-slate-200">
                        Cmd+Shift+4
                      </kbd>
                      <span>→</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[10px] text-slate-800 dark:text-slate-200">
                        Ctrl+V
                      </kbd>
                      <span>to store text &amp; images</span>
                    </div>

                    {hubScreenshotNotice && (
                      <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/35 text-xs text-amber-900 dark:text-amber-200">
                        {hubScreenshotNotice}
                      </div>
                    )}

                    {newNoteScreenshots.length > 0 && (
                      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${newNoteScreenshots.length > 4 ? "max-h-64 overflow-y-auto pr-1 custom-scrollbar" : ""}`}>
                        {newNoteScreenshots.map((src, idx) => (
                          <div key={`${idx}_${src.slice(0, 32)}`} className="relative group rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-black aspect-video">
                            <button
                              type="button"
                              onClick={() => setLightboxScreenshotUrl(src)}
                              className="w-full h-full block cursor-zoom-in"
                            >
                              <img src={src} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewNoteScreenshots(prev => prev.filter((_, i) => i !== idx))}
                              className="keep-white absolute top-1 right-1 p-1 rounded-full bg-black/75 hover:bg-rose-600 !text-white cursor-pointer"
                              title="Remove screenshot"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Key Terms (Comma separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. Recursive Query, Authoritative Server, TTL"
                        value={newNoteKeyTerms}
                        onChange={e => setNewNoteKeyTerms(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Linked Syllabus Chapter (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Chapter 3: Networking Fundamentals"
                        value={newNoteChapter}
                        onChange={e => setNewNoteChapter(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/60 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  <DuplicateWarningBanner
                    matches={hubDraftDuplicateMatches}
                    allowDuplicateSave={allowDuplicateHubNoteSave}
                    onToggleAllowDuplicate={(allowed) => {
                      setAllowDuplicateHubNoteSave(allowed);
                      if (allowed) setBlockedDuplicateHubSave(false);
                    }}
                    onViewExistingNote={(noteId) => {
                      setIsAddingNote(false);
                      handleOpenSavedNote(noteId, false);
                    }}
                    wasBlockedOnSave={blockedDuplicateHubSave}
                  />

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-auto hidden sm:inline">
                      Tip: Press Ctrl+Enter to save
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingNote(false)}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isExtractingUrl}
                      title="Save (Ctrl + Enter)"
                      className={`keep-white px-5 py-2 rounded-lg disabled:opacity-50 text-xs font-semibold !text-white shadow-md transition-colors ${
                        hubDraftDuplicateMatches.length > 0 && !allowDuplicateHubNoteSave
                          ? "bg-amber-600 hover:bg-amber-500 shadow-amber-900/20"
                          : "bg-violet-600 hover:bg-violet-500 shadow-violet-900/20 dark:shadow-violet-900/40"
                      }`}
                    >
                      {hubDraftDuplicateMatches.length > 0 && !allowDuplicateHubNoteSave
                        ? "Already Added — Review Duplicate"
                        : newNoteCategory === "url" && extractOnHubUrlSave && (!newNoteRequiresLogin || newNoteUrlContext.trim().length > 0)
                        ? "Save & Extract from URL"
                        : "Save Study Artifact"}
                    </button>
                  </div>
                </form>
                </div>
              )}

              {highlightedNoteId && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-300 dark:bg-amber-950/35 dark:border-amber-600/40 text-xs">
                  <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-medium">
                    <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />
                    <span>Showing your saved review note below.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {jumpedFromTestReview && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("tester");
                          setJumpedFromTestReview(false);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        <span>Back to Test Review</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setHighlightedNoteId(null);
                        setJumpedFromTestReview(false);
                      }}
                      className="text-[11px] font-medium text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-white underline cursor-pointer"
                    >
                      Clear highlight
                    </button>
                  </div>
                </div>
              )}

              {/* Notes List */}
              {filteredNotes.length === 0 ? (
                <div className="text-center py-16 px-4 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#141727]">
                  <BookOpen className="w-10 h-10 text-violet-500/60 dark:text-violet-400/50 mx-auto mb-3" />
                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {currentHub.notes.length === 0
                      ? "No study notes saved yet"
                      : "No matching notes found"}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto mt-1.5 mb-5">
                    {currentHub.notes.length === 0
                      ? 'Add your own notes, paste documents with images, or generate an AI study guide for this goal.'
                      : "Try clearing your search or switching back to All notes."}
                  </p>
                  {currentHub.notes.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingNote(true)}
                        className="keep-white px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-medium !text-white inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Note</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAIGenerateStudyNotes()}
                        disabled={isGeneratingNotes}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        <span>Generate AI Guide</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNoteSearchQuery("");
                        setSelectedNoteCategory("all");
                        setSelectedNoteGroup("all");
                        setShowOnlyDuplicates(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                  {filteredNotes.map((note) => {
                    const dupRelations = existingDuplicatesReport.byNoteId[note.id] || [];
                    const topDup = dupRelations[0];
                    const isDupHighlighted = Boolean(topDup);
                    const hasManualExpand = typeof expandedNoteIds[note.id] === "boolean";
                    const isCardExpanded = hasManualExpand
                      ? expandedNoteIds[note.id]
                      : allNotesExpanded ||
                        highlightedNoteId === note.id ||
                        (showOnlyDuplicates && isDupHighlighted) ||
                        currentHub.notes.length <= 2;

                    const isQuestionCard =
                      note.category === "qa" ||
                      note.category === "fill_in_blank" ||
                      note.category === "multiple_choice" ||
                      note.category === "multiple_select" ||
                      note.category === "true_false" ||
                      Boolean(note.question && note.answer);

                    const displayHeading =
                      isQuestionCard
                        ? note.question || note.title
                        : note.category === "definition" || (note.term && note.definition)
                        ? note.term || note.title
                        : note.title;

                    const summaryPreviewText =
                      note.category === "definition" || (note.term && note.definition)
                        ? note.definition || note.content
                        : note.category === "multiple_choice" || note.category === "multiple_select"
                        ? Array.isArray(note.options) && note.options.length > 0
                          ? note.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join(" · ")
                          : note.content
                        : note.category === "qa"
                        ? note.answer || note.content
                        : note.category === "url"
                        ? note.urlNotes || note.url || note.content
                        : note.content;

                    const imageCount = note.screenshots?.length || 0;

                    return (
                    <div
                      key={note.id}
                      data-note-id={note.id}
                      className={`p-5 rounded-xl bg-white dark:bg-[#141727] border transition-colors flex flex-col justify-between group ${
                        highlightedNoteId === note.id
                          ? "border-amber-500 ring-2 ring-amber-400/50 dark:border-amber-400 dark:ring-amber-400/35"
                          : isDupHighlighted
                          ? "border-amber-400 bg-amber-50/35 dark:bg-amber-950/15 dark:border-amber-500/50"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="space-y-3">
                        {topDup && (
                          <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-600/40 space-y-1 text-[11px]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 text-amber-950 dark:text-amber-200">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300 shrink-0" />
                                <span className="font-semibold truncate">
                                  {topDup.similarityPercent}% similar to &quot;{topDup.relatedNote.title}&quot;
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenSavedNote(topDup.relatedNote.id, false)}
                                  className="font-semibold text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-white underline cursor-pointer"
                                >
                                  View Match
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNote(note.id)}
                                  className="font-semibold text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-200 underline cursor-pointer"
                                >
                                  Remove Copy
                                </button>
                              </div>
                            </div>
                            {topDup.matchedWords.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 text-[10px] text-amber-900 dark:text-amber-200/90">
                                <span className="opacity-80">Shared wording:</span>
                                {topDup.matchedWords.slice(0, 6).map((mw, mIdx) => (
                                  <mark
                                    key={mIdx}
                                    className="px-1 rounded bg-amber-300/80 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100 font-medium"
                                  >
                                    {mw}
                                  </mark>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Clean Zero-Pill Header + Actions */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className={`font-semibold ${
                                note.category === "fill_in_blank"
                                  ? "text-teal-700 dark:text-teal-300"
                                  : note.category === "multiple_choice"
                                  ? "text-indigo-700 dark:text-indigo-300"
                                  : note.category === "multiple_select"
                                  ? "text-blue-700 dark:text-blue-300"
                                  : note.category === "true_false"
                                  ? "text-purple-700 dark:text-purple-300"
                                  : note.category === "qa"
                                  ? "text-amber-700 dark:text-amber-300"
                                  : note.category === "definition"
                                  ? "text-sky-700 dark:text-sky-300"
                                  : note.category === "table"
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : note.category === "url"
                                  ? "text-cyan-700 dark:text-cyan-300"
                                  : "text-violet-700 dark:text-violet-300"
                              }`}>
                                {formatCategoryLabel(note.category)}
                              </span>
                              {note.chapterTitle && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate max-w-[160px]">{note.chapterTitle}</span>
                                </>
                              )}
                              {note.sourceFileName && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate max-w-[140px]">{note.sourceFileName}</span>
                                </>
                              )}
                              {imageCount > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">{imageCount} {imageCount === 1 ? "image" : "images"}</span>
                                </>
                              )}
                            </div>

                            <h4
                              onClick={() =>
                                setExpandedNoteIds(prev => ({ ...prev, [note.id]: !isCardExpanded }))
                              }
                              className="text-[15px] font-semibold text-slate-900 dark:text-white leading-snug cursor-pointer hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                            >
                              {topDup ? (
                                <HighlightedDuplicateText text={displayHeading} matchedWords={topDup.matchedWords} />
                              ) : (
                                displayHeading
                              )}
                            </h4>
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedNoteIds(prev => ({ ...prev, [note.id]: !isCardExpanded }))
                              }
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title={isCardExpanded ? "Collapse note" : "Expand note"}
                            >
                              {isCardExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyNoteContent(note)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Copy to clipboard"
                            >
                              {copiedNoteId === note.id ? (
                                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Delete note"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {!isCardExpanded ? (
                          <div className="space-y-3 pt-1">
                            {summaryPreviewText && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                                {summaryPreviewText}
                              </p>
                            )}

                            {note.screenshots && note.screenshots.length > 0 && (
                              <div className="flex items-center gap-2 overflow-hidden">
                                {note.screenshots.slice(0, 3).map((src, sIdx) => (
                                  <button
                                    key={`${note.id}_thumb_${sIdx}`}
                                    type="button"
                                    onClick={() => setLightboxScreenshotUrl(src)}
                                    className="w-16 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-violet-500 shrink-0 cursor-zoom-in"
                                    title="Click to zoom"
                                  >
                                    <img src={src} alt={`${note.title} preview ${sIdx + 1}`} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                                {note.screenshots.length > 3 && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedNoteIds(prev => ({ ...prev, [note.id]: true }))}
                                    className="px-2.5 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shrink-0 cursor-pointer tabular-nums"
                                  >
                                    +{note.screenshots.length - 3} more
                                  </button>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1">
                              <button
                                type="button"
                                onClick={() => setExpandedNoteIds(prev => ({ ...prev, [note.id]: true }))}
                                className="text-xs font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-200 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>{isQuestionCard ? "Practice & Reveal Answer" : "Open Full Note"}</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-[11px] text-slate-400 tabular-nums">
                                {new Date(note.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>

                        {/* Note Body */}
                        {note.category === "fill_in_blank" ? (
                          <div className="space-y-2.5">
                            <div className="bg-teal-50/90 dark:bg-teal-950/30 p-3 rounded-lg border border-teal-200 dark:border-teal-800/35 space-y-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 flex items-center gap-1">
                                <Edit3 className="w-3 h-3" />
                                Fill in the Blank
                              </span>
                              <p className="text-xs text-slate-900 dark:text-slate-100 whitespace-pre-line leading-relaxed">
                                {splitFillInBlankSegments(note.question || note.title).map((seg, segIdx) =>
                                  seg.type === "blank" ? (
                                    <span
                                      key={segIdx}
                                      className="inline-block px-2 py-0.5 mx-1 rounded bg-teal-100 border-b-2 border-teal-600 text-teal-900 dark:bg-teal-500/20 dark:border-teal-400 font-mono text-[11px] font-semibold dark:text-teal-200 align-baseline"
                                    >
                                      ______
                                    </span>
                                  ) : (
                                    <React.Fragment key={segIdx}>{seg.value}</React.Fragment>
                                  )
                                )}
                              </p>
                            </div>

                            {/* Interactive Blank Practice Input */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Type missing word(s) to check..."
                                  value={blankTryInputs[note.id] || ""}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setBlankTryInputs(prev => ({ ...prev, [note.id]: val }));
                                    if (blankCheckResults[note.id]) {
                                      setBlankCheckResults(prev => ({ ...prev, [note.id]: null }));
                                    }
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const guess = blankTryInputs[note.id] || "";
                                      const isMatch = checkFillInBlankGuess(guess, note.answer || "");
                                      setBlankCheckResults(prev => ({
                                        ...prev,
                                        [note.id]: isMatch ? "correct" : "incorrect"
                                      }));
                                      if (isMatch) {
                                        setRevealedBlankAnswers(prev => ({ ...prev, [note.id]: true }));
                                      }
                                    }
                                  }}
                                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700/70 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500"
                                />
                                <button
                                  type="button"
                                  disabled={!(blankTryInputs[note.id] || "").trim()}
                                  onClick={() => {
                                    const guess = blankTryInputs[note.id] || "";
                                    const isMatch = checkFillInBlankGuess(guess, note.answer || "");
                                    setBlankCheckResults(prev => ({
                                      ...prev,
                                      [note.id]: isMatch ? "correct" : "incorrect"
                                    }));
                                    if (isMatch) {
                                      setRevealedBlankAnswers(prev => ({ ...prev, [note.id]: true }));
                                    }
                                  }}
                                  className="keep-white px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-45 !text-white text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                                >
                                  Check
                                </button>
                              </div>

                              {blankCheckResults[note.id] === "correct" && (
                                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Correct! Great recall.</span>
                                </p>
                              )}
                              {blankCheckResults[note.id] === "incorrect" && (
                                <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300 flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Not quite — try again or click Show Answer.</span>
                                </p>
                              )}
                            </div>

                            <div className="bg-emerald-50/90 dark:bg-emerald-950/25 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/30 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Answer
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedBlankAnswers(prev => ({
                                      ...prev,
                                      [note.id]: !prev[note.id]
                                    }))
                                  }
                                  className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200 underline cursor-pointer"
                                >
                                  {revealedBlankAnswers[note.id] ? "Hide Answer" : "Show Answer"}
                                </button>
                              </div>
                              {!revealedBlankAnswers[note.id] ? (
                                <p className="text-xs italic text-slate-600 dark:text-slate-400">
                                  Answer hidden for active recall. Type above or click &quot;Show Answer&quot;.
                                </p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 whitespace-pre-line leading-relaxed">
                                    {note.answer || note.content}
                                  </p>
                                  {note.explanation && (
                                    <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/30 space-y-1">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 block">
                                        Explanation
                                      </span>
                                      <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                        {note.explanation}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : note.category === "multiple_choice" ? (
                          (() => {
                            const mcqOptions = Array.isArray(note.options) ? note.options : [];
                            const resolvedCorrectIdx =
                              typeof note.correctOptionIndex === "number" &&
                              note.correctOptionIndex >= 0 &&
                              note.correctOptionIndex < mcqOptions.length
                                ? note.correctOptionIndex
                                : mcqOptions.findIndex(
                                    opt => opt.trim().toLowerCase() === (note.answer || "").trim().toLowerCase()
                                  );
                            const selectedIdx = noteMcqSelectedChoices[note.id];
                            const isAnswered = selectedIdx !== undefined;
                            const isRevealed = Boolean(revealedMcqAnswers[note.id]);
                            const showResult = isAnswered || isRevealed;

                            return (
                              <div className="space-y-2.5">
                                <div className="bg-indigo-50/90 dark:bg-indigo-950/30 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800/35 space-y-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                                    <HelpCircle className="w-3 h-3" />
                                    Multiple Choice Question
                                  </span>
                                  <p className="text-xs text-slate-900 dark:text-slate-100 whitespace-pre-line leading-relaxed">
                                    {note.question || note.title}
                                  </p>
                                </div>

                                {mcqOptions.length > 0 && (
                                  <div className="space-y-1.5">
                                    {mcqOptions.map((opt, optIdx) => {
                                      const isSelected = selectedIdx === optIdx;
                                      const isCorrectOpt = resolvedCorrectIdx === optIdx;
                                      const isWrongSelected = isSelected && resolvedCorrectIdx >= 0 && !isCorrectOpt;

                                      let optionBtnClasses =
                                        "bg-white dark:bg-slate-900/75 border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-200 hover:border-indigo-400 dark:hover:border-indigo-500/60";
                                      let letterBadgeClasses =
                                        "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";

                                      if (showResult && isCorrectOpt) {
                                        optionBtnClasses =
                                          "bg-emerald-50 dark:bg-emerald-950/35 border-emerald-400 dark:border-emerald-600/60 text-emerald-950 dark:text-emerald-100";
                                        letterBadgeClasses =
                                          "keep-white bg-emerald-600 border-emerald-600 text-white !text-white";
                                      } else if (isWrongSelected) {
                                        optionBtnClasses =
                                          "bg-rose-50 dark:bg-rose-950/35 border-rose-400 dark:border-rose-600/60 text-rose-950 dark:text-rose-100";
                                        letterBadgeClasses =
                                          "keep-white bg-rose-600 border-rose-600 text-white !text-white";
                                      } else if (isSelected) {
                                        optionBtnClasses =
                                          "bg-indigo-50 dark:bg-indigo-950/35 border-indigo-400 dark:border-indigo-600/60 text-indigo-950 dark:text-indigo-100";
                                        letterBadgeClasses =
                                          "keep-white bg-indigo-600 border-indigo-600 text-white !text-white";
                                      }

                                      return (
                                        <button
                                          key={optIdx}
                                          type="button"
                                          onClick={() =>
                                            setNoteMcqSelectedChoices(prev => ({ ...prev, [note.id]: optIdx }))
                                          }
                                          className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs flex items-center gap-2 transition-all cursor-pointer ${optionBtnClasses}`}
                                        >
                                          <span
                                            className={`w-5 h-5 rounded border text-[10px] font-mono font-bold flex items-center justify-center shrink-0 ${letterBadgeClasses}`}
                                          >
                                            {String.fromCharCode(65 + optIdx)}
                                          </span>
                                          <span className="flex-1 min-w-0 leading-snug">{opt}</span>
                                          {showResult && isCorrectOpt && (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                          )}
                                          {isWrongSelected && (
                                            <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="bg-emerald-50/90 dark:bg-emerald-950/25 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/30 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Answer
                                    </span>
                                    <div className="flex items-center gap-2.5">
                                      {isAnswered && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setNoteMcqSelectedChoices(prev => ({ ...prev, [note.id]: undefined }));
                                            setRevealedMcqAnswers(prev => ({ ...prev, [note.id]: false }));
                                          }}
                                          className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white underline cursor-pointer"
                                        >
                                          Reset
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRevealedMcqAnswers(prev => ({
                                            ...prev,
                                            [note.id]: !prev[note.id]
                                          }))
                                        }
                                        className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200 underline cursor-pointer"
                                      >
                                        {isRevealed ? "Hide Answer" : "Show Answer"}
                                      </button>
                                    </div>
                                  </div>

                                  {!showResult ? (
                                    <p className="text-xs italic text-slate-600 dark:text-slate-400">
                                      Select a choice above or click &quot;Show Answer&quot;.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {isAnswered && resolvedCorrectIdx >= 0 && (
                                        <p
                                          className={`text-[11px] font-medium flex items-center gap-1 ${
                                            selectedIdx === resolvedCorrectIdx
                                              ? "text-emerald-700 dark:text-emerald-300"
                                              : "text-rose-700 dark:text-rose-300"
                                          }`}
                                        >
                                          {selectedIdx === resolvedCorrectIdx ? (
                                            <>
                                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                              <span>Correct! Great recall.</span>
                                            </>
                                          ) : (
                                            <>
                                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                                              <span>
                                                Not quite — correct answer is {String.fromCharCode(65 + resolvedCorrectIdx)}){" "}
                                                {mcqOptions[resolvedCorrectIdx]}
                                              </span>
                                            </>
                                          )}
                                        </p>
                                      )}
                                      {(isRevealed || mcqOptions.length === 0) && (note.answer || resolvedCorrectIdx >= 0) && (
                                        <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 whitespace-pre-line leading-relaxed">
                                          {resolvedCorrectIdx >= 0 && mcqOptions[resolvedCorrectIdx]
                                            ? `${String.fromCharCode(65 + resolvedCorrectIdx)}) ${mcqOptions[resolvedCorrectIdx]}`
                                            : note.answer}
                                        </p>
                                      )}
                                      {note.explanation && (
                                        <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/30 space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 block">
                                            Explanation
                                          </span>
                                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                            {note.explanation}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        ) : note.category === "multiple_select" ? (
                          (() => {
                            const multiOptions = Array.isArray(note.options) ? note.options : [];
                            const resolvedCorrectIndices = resolveNoteCorrectIndices(note, multiOptions);
                            const selectedIndices = noteMultiSelectChoices[note.id] || [];
                            const isChecked = Boolean(checkedMultiSelectNotes[note.id]);
                            const isRevealed = Boolean(revealedMcqAnswers[note.id]);
                            const showResult = isChecked || isRevealed;
                            const sortedSelected = [...selectedIndices].sort((a, b) => a - b);
                            const isExactMatch =
                              resolvedCorrectIndices.length > 0 &&
                              sortedSelected.length === resolvedCorrectIndices.length &&
                              resolvedCorrectIndices.every((val, i) => sortedSelected[i] === val);
                            const correctLabelsSummary =
                              resolvedCorrectIndices.length > 0
                                ? resolvedCorrectIndices
                                    .map(i => `${String.fromCharCode(65 + i)}) ${multiOptions[i]}`)
                                    .join(", ")
                                : note.answer || "";

                            return (
                              <div className="space-y-2.5">
                                <div className="bg-blue-50/90 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800/35 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 flex items-center gap-1">
                                      <HelpCircle className="w-3 h-3" />
                                      Multiple Select
                                    </span>
                                    <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                      Select all that apply
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-900 dark:text-slate-100 whitespace-pre-line leading-relaxed">
                                    {note.question || note.title}
                                  </p>
                                </div>

                                {multiOptions.length > 0 && (
                                  <div className="space-y-1.5">
                                    {multiOptions.map((opt, optIdx) => {
                                      const isSelected = selectedIndices.includes(optIdx);
                                      const isCorrectOpt = resolvedCorrectIndices.includes(optIdx);
                                      const isWrongSelected = showResult && isSelected && !isCorrectOpt;

                                      let optionBtnClasses =
                                        "bg-white dark:bg-slate-900/75 border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-200 hover:border-blue-400 dark:hover:border-blue-500/60";
                                      let checkBoxClasses =
                                        "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent";

                                      if (showResult && isCorrectOpt) {
                                        optionBtnClasses =
                                          "bg-emerald-50 dark:bg-emerald-950/35 border-emerald-400 dark:border-emerald-600/60 text-emerald-950 dark:text-emerald-100";
                                        checkBoxClasses = isSelected
                                          ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white"
                                          : "bg-emerald-100 dark:bg-emerald-900/50 border-emerald-500 text-emerald-700 dark:text-emerald-300";
                                      } else if (isWrongSelected) {
                                        optionBtnClasses =
                                          "bg-rose-50 dark:bg-rose-950/35 border-rose-400 dark:border-rose-600/60 text-rose-950 dark:text-rose-100";
                                        checkBoxClasses =
                                          "keep-white bg-rose-600 border-rose-600 text-white !text-white";
                                      } else if (isSelected) {
                                        optionBtnClasses =
                                          "bg-blue-50 dark:bg-blue-950/35 border-blue-400 dark:border-blue-600/60 text-blue-950 dark:text-blue-100";
                                        checkBoxClasses =
                                          "keep-white bg-blue-600 border-blue-600 text-white !text-white";
                                      }

                                      return (
                                        <button
                                          key={optIdx}
                                          type="button"
                                          onClick={() => {
                                            setNoteMultiSelectChoices(prev => {
                                              const current = prev[note.id] || [];
                                              const next = current.includes(optIdx)
                                                ? current.filter(i => i !== optIdx)
                                                : [...current, optIdx].sort((a, b) => a - b);
                                              return { ...prev, [note.id]: next };
                                            });
                                            if (checkedMultiSelectNotes[note.id]) {
                                              setCheckedMultiSelectNotes(prev => ({ ...prev, [note.id]: false }));
                                            }
                                          }}
                                          className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs flex items-center gap-2 transition-all cursor-pointer ${optionBtnClasses}`}
                                        >
                                          <span
                                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checkBoxClasses}`}
                                          >
                                            {(isSelected || (showResult && isCorrectOpt)) && (
                                              <Check className="w-3 h-3" />
                                            )}
                                          </span>
                                          <span className="text-[10px] font-mono font-bold opacity-75 shrink-0">
                                            {String.fromCharCode(65 + optIdx)}.
                                          </span>
                                          <span className="flex-1 min-w-0 leading-snug">{opt}</span>
                                          {showResult && isCorrectOpt && (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                          )}
                                          {isWrongSelected && (
                                            <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="bg-emerald-50/90 dark:bg-emerald-950/25 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/30 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Answer
                                    </span>
                                    <div className="flex items-center gap-2.5">
                                      {selectedIndices.length > 0 && !isChecked && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setCheckedMultiSelectNotes(prev => ({ ...prev, [note.id]: true }))
                                          }
                                          className="keep-white px-2.5 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold !text-white cursor-pointer"
                                        >
                                          Check Answer
                                        </button>
                                      )}
                                      {(selectedIndices.length > 0 || isChecked) && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setNoteMultiSelectChoices(prev => ({ ...prev, [note.id]: [] }));
                                            setCheckedMultiSelectNotes(prev => ({ ...prev, [note.id]: false }));
                                            setRevealedMcqAnswers(prev => ({ ...prev, [note.id]: false }));
                                          }}
                                          className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white underline cursor-pointer"
                                        >
                                          Reset
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRevealedMcqAnswers(prev => ({
                                            ...prev,
                                            [note.id]: !prev[note.id]
                                          }))
                                        }
                                        className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200 underline cursor-pointer"
                                      >
                                        {isRevealed ? "Hide Answer" : "Show Answer"}
                                      </button>
                                    </div>
                                  </div>

                                  {!showResult ? (
                                    <p className="text-xs italic text-slate-600 dark:text-slate-400">
                                      {selectedIndices.length > 0
                                        ? `${selectedIndices.length} selected — click "Check Answer" or select more.`
                                        : 'Check all matching options above, then click "Check Answer" or "Show Answer".'}
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {isChecked && resolvedCorrectIndices.length > 0 && (
                                        <p
                                          className={`text-[11px] font-medium flex items-center gap-1 ${
                                            isExactMatch
                                              ? "text-emerald-700 dark:text-emerald-300"
                                              : "text-rose-700 dark:text-rose-300"
                                          }`}
                                        >
                                          {isExactMatch ? (
                                            <>
                                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                              <span>Correct! You selected every right answer.</span>
                                            </>
                                          ) : (
                                            <>
                                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                                              <span>Not quite — correct answers: {correctLabelsSummary}</span>
                                            </>
                                          )}
                                        </p>
                                      )}
                                      {(isRevealed || multiOptions.length === 0) && correctLabelsSummary && (
                                        <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 whitespace-pre-line leading-relaxed">
                                          {correctLabelsSummary}
                                        </p>
                                      )}
                                      {note.explanation && (
                                        <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/30 space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 block">
                                            Explanation
                                          </span>
                                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                            {note.explanation}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        ) : note.category === "true_false" ? (
                          (() => {
                            const correctTfIdx = getTrueFalseCorrectIndex(note);
                            const selectedIdx = noteMcqSelectedChoices[note.id];
                            const isAnswered = selectedIdx !== undefined;
                            const isRevealed = Boolean(revealedMcqAnswers[note.id]);
                            const showResult = isAnswered || isRevealed;

                            return (
                              <div className="space-y-2.5">
                                <div className="bg-purple-50/90 dark:bg-purple-950/30 p-3 rounded-lg border border-purple-200 dark:border-purple-800/35 space-y-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300 flex items-center gap-1">
                                    <HelpCircle className="w-3 h-3" />
                                    True / False Statement
                                  </span>
                                  <p className="text-xs text-slate-900 dark:text-slate-100 whitespace-pre-line leading-relaxed">
                                    {note.question || note.title}
                                  </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  {(["True", "False"] as const).map((label, tfIdx) => {
                                    const isSelected = selectedIdx === tfIdx;
                                    const isCorrectOpt = correctTfIdx === tfIdx;
                                    const isWrongSelected = isSelected && !isCorrectOpt;

                                    let tfClasses =
                                      "bg-white dark:bg-slate-900/75 border-slate-200 dark:border-slate-700/70 text-slate-700 dark:text-slate-200 hover:border-purple-400";
                                    if (showResult && isCorrectOpt) {
                                      tfClasses =
                                        "keep-white bg-emerald-600 border-emerald-600 text-white !text-white shadow-sm";
                                    } else if (isWrongSelected) {
                                      tfClasses =
                                        "keep-white bg-rose-600 border-rose-600 text-white !text-white shadow-sm";
                                    }

                                    return (
                                      <button
                                        key={label}
                                        type="button"
                                        onClick={() =>
                                          setNoteMcqSelectedChoices(prev => ({ ...prev, [note.id]: tfIdx }))
                                        }
                                        className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${tfClasses}`}
                                      >
                                        {tfIdx === 0 ? (
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                        ) : (
                                          <XCircle className="w-3.5 h-3.5" />
                                        )}
                                        <span>{label}</span>
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="bg-emerald-50/90 dark:bg-emerald-950/25 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/30 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Answer
                                    </span>
                                    <div className="flex items-center gap-2.5">
                                      {isAnswered && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setNoteMcqSelectedChoices(prev => ({ ...prev, [note.id]: undefined }));
                                            setRevealedMcqAnswers(prev => ({ ...prev, [note.id]: false }));
                                          }}
                                          className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white underline cursor-pointer"
                                        >
                                          Reset
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRevealedMcqAnswers(prev => ({
                                            ...prev,
                                            [note.id]: !prev[note.id]
                                          }))
                                        }
                                        className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200 underline cursor-pointer"
                                      >
                                        {isRevealed ? "Hide Answer" : "Show Answer"}
                                      </button>
                                    </div>
                                  </div>

                                  {!showResult ? (
                                    <p className="text-xs italic text-slate-600 dark:text-slate-400">
                                      Select True or False above or click &quot;Show Answer&quot;.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {isAnswered ? (
                                        <p
                                          className={`text-[11px] font-medium flex items-center gap-1 ${
                                            selectedIdx === correctTfIdx
                                              ? "text-emerald-700 dark:text-emerald-300"
                                              : "text-rose-700 dark:text-rose-300"
                                          }`}
                                        >
                                          {selectedIdx === correctTfIdx ? (
                                            <>
                                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                              <span>Correct! The statement is {correctTfIdx === 0 ? "True" : "False"}.</span>
                                            </>
                                          ) : (
                                            <>
                                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                                              <span>Not quite — the correct answer is {correctTfIdx === 0 ? "True" : "False"}.</span>
                                            </>
                                          )}
                                        </p>
                                      ) : (
                                        <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                                          {correctTfIdx === 0 ? "True" : "False"}
                                        </p>
                                      )}
                                      {note.explanation && (
                                        <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/30 space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 block">
                                            Explanation
                                          </span>
                                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                            {note.explanation}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        ) : note.category === "qa" || (note.question && note.answer) ? (
                          <div className="space-y-2.5">
                            <div className="bg-amber-50/90 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800/30 space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1">
                                <HelpCircle className="w-3 h-3" />
                                Question
                              </span>
                              <p className="text-xs text-slate-900 dark:text-slate-100 whitespace-pre-line leading-relaxed">
                                {note.question || note.title}
                              </p>
                            </div>
                            <div className="bg-emerald-50/90 dark:bg-emerald-950/25 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/30 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Answer
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHiddenQaNoteAnswers(prev => ({
                                      ...prev,
                                      [note.id]: !prev[note.id]
                                    }))
                                  }
                                  className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200 underline cursor-pointer"
                                >
                                  {hiddenQaNoteAnswers[note.id] ? "Show Answer" : "Hide Answer"}
                                </button>
                              </div>
                              {hiddenQaNoteAnswers[note.id] ? (
                                <p className="text-xs italic text-slate-600 dark:text-slate-400">
                                  Answer hidden for active recall. Click "Show Answer" to reveal.
                                </p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                  <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                                    {note.answer || note.content}
                                  </p>
                                  {note.explanation && (
                                    <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/30 space-y-1">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 block">
                                        Explanation
                                      </span>
                                      <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                        {note.explanation}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : note.category === "definition" || (note.term && note.definition) ? (
                          <div className="space-y-2.5">
                            <div className="bg-sky-50/90 dark:bg-sky-950/30 p-3 rounded-lg border border-sky-200 dark:border-sky-800/30 space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300 flex items-center gap-1">
                                <BookOpen className="w-3 h-3" />
                                Term
                              </span>
                              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-pre-line leading-relaxed">
                                {note.term || note.title}
                              </p>
                            </div>
                            <div className="bg-emerald-50/90 dark:bg-emerald-950/25 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/30 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  Definition
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHiddenQaNoteAnswers(prev => ({
                                      ...prev,
                                      [note.id]: !prev[note.id]
                                    }))
                                  }
                                  className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200 underline cursor-pointer"
                                >
                                  {hiddenQaNoteAnswers[note.id] ? "Show Definition" : "Hide Definition"}
                                </button>
                              </div>
                              {hiddenQaNoteAnswers[note.id] ? (
                                <p className="text-xs italic text-slate-600 dark:text-slate-400">
                                  Definition hidden for active recall. Click "Show Definition" to reveal.
                                </p>
                              ) : (
                                <div className="max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                                  <FormattedStudyText text={note.definition || note.content} />
                                </div>
                              )}
                            </div>
                          </div>
                        ) : note.category === "url" && note.url && isSafeHttpUrl(note.url) ? (
                          <div className="space-y-2.5">
                            {(note.requiresLogin || note.isReadingAssignment) && (
                              <div className={`p-2.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                                note.reviewCompleted
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-700/35 dark:text-emerald-200"
                                  : note.linkSubtype === "website_reading"
                                  ? "bg-cyan-50 border-cyan-200 text-cyan-900 dark:bg-cyan-950/35 dark:border-cyan-700/40 dark:text-cyan-200"
                                  : "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/35 dark:border-amber-700/40 dark:text-amber-200"
                              }`}>
                                <span>
                                  {note.reviewCompleted
                                    ? `Studied${note.studyCount ? ` (${note.studyCount}x)` : ""} — ready for next review`
                                    : note.linkSubtype === "website_reading"
                                    ? "Website Reading Assignment"
                                    : "Study / Review Assignment — login required"}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded font-semibold uppercase text-[9px] shrink-0 ${
                                  note.reviewCompleted
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : note.linkSubtype === "website_reading"
                                    ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                }`}>
                                  {note.reviewCompleted ? "Studied ✓" : "Assigned"}
                                </span>
                              </div>
                            )}
                            <a
                              href={note.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 p-3 rounded-lg bg-cyan-50/90 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/40 text-xs text-cyan-800 hover:text-cyan-950 dark:text-cyan-300 dark:hover:text-cyan-200 hover:border-cyan-400 dark:hover:border-cyan-600/60 transition-colors"
                            >
                              <span className="truncate font-mono">{note.url}</span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            </a>
                            {note.urlNotes && (
                              <div className="max-h-36 overflow-y-auto pr-1 custom-scrollbar bg-slate-50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-200 dark:border-slate-900">
                                <FormattedStudyText text={note.urlNotes} />
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {(note.requiresLogin || note.isReadingAssignment) && (
                                <>
                                  <a
                                    href={note.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="keep-white px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 !text-white text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                                  >
                                    <span>
                                      {note.reviewCompleted
                                        ? "Review Link"
                                        : note.linkSubtype === "website_reading"
                                        ? "Go Read Link"
                                        : "Go Study Link"}
                                    </span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLinkAssignment(note.id)}
                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                      note.reviewCompleted
                                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-slate-100 dark:bg-emerald-950/60 dark:border-emerald-700/40 dark:text-emerald-300 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                                        : "bg-slate-100 border-slate-300 text-slate-800 hover:border-emerald-500 hover:text-emerald-800 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-600/50 dark:hover:text-emerald-300"
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>
                                      {note.reviewCompleted
                                        ? "Assign Again"
                                        : note.linkSubtype === "website_reading"
                                        ? "Mark Read"
                                        : "Mark Studied"}
                                    </span>
                                  </button>
                                </>
                              )}
                              {(!note.requiresLogin || note.urlNotes) && (
                                <button
                                  type="button"
                                  disabled={isExtractingUrl}
                                  onClick={() =>
                                    handleExtractFromUrl({
                                      url: note.url!,
                                      userNotes: note.urlNotes,
                                      mode: "notes",
                                      existingNoteId: note.id,
                                      requiresLogin: note.requiresLogin,
                                      title: note.title
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-300 text-violet-900 dark:bg-violet-600/20 dark:hover:bg-violet-600/35 dark:border-violet-500/30 dark:text-violet-200 text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-300" />
                                  <span>Extract Notes</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isExtractingUrl}
                                onClick={() =>
                                  handleExtractFromUrl({
                                    url: note.url!,
                                    userNotes: note.urlNotes,
                                    mode: "test",
                                    existingNoteId: note.id,
                                    startGeneratedTest: true,
                                    requiresLogin: note.requiresLogin,
                                    title: note.title
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-900 dark:bg-indigo-600/25 dark:hover:bg-indigo-600/40 dark:border-indigo-500/35 dark:text-indigo-200 text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                <Brain className="w-3 h-3 text-indigo-600 dark:text-indigo-300" />
                                <span>Test Me from Link</span>
                              </button>
                            </div>
                          </div>
                        ) : note.category === "table" ? (
                          (() => {
                            const tableData = resolveNoteTableData(note);
                            return tableData ? (
                              <StudyNoteTableView headers={tableData.headers} rows={tableData.rows} />
                            ) : (
                              <div className="max-h-56 overflow-y-auto pr-1 custom-scrollbar bg-slate-50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-200 dark:border-slate-900">
                                <FormattedStudyText text={note.content} />
                              </div>
                            );
                          })()
                        ) : note.category === "code_snippet" ? (
                          <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto pr-1 custom-scrollbar bg-slate-50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-200 dark:border-slate-900">
                            {note.content}
                          </pre>
                        ) : (
                          <div className="max-h-56 overflow-y-auto pr-1 custom-scrollbar bg-slate-50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-200 dark:border-slate-900">
                            <FormattedStudyText text={note.content} />
                          </div>
                        )}

                        {/* Attached Screenshots */}
                        {note.screenshots && note.screenshots.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {note.screenshots.length > 4 && (
                              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                {note.screenshots.length} stored images (click any to zoom)
                              </div>
                            )}
                            <div
                              className={`grid gap-2 ${
                                note.screenshots.length === 1
                                  ? "grid-cols-1"
                                  : note.screenshots.length > 4
                                  ? "grid-cols-2 sm:grid-cols-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar"
                                  : "grid-cols-2"
                              }`}
                            >
                              {note.screenshots.map((src, sIdx) => (
                                <button
                                  key={`${note.id}_ss_${sIdx}`}
                                  type="button"
                                  onClick={() => setLightboxScreenshotUrl(src)}
                                  className="relative group rounded-lg overflow-hidden border border-slate-300 dark:border-slate-800 hover:border-violet-500/60 bg-slate-100 dark:bg-black/50 transition-colors cursor-zoom-in"
                                  title="Click to view image full size"
                                >
                                  <img
                                    src={src}
                                    alt={`${note.title} image ${sIdx + 1}`}
                                    className={`w-full object-cover ${note.screenshots!.length > 4 ? "h-28" : "max-h-44"}`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Key Terms (Clean Unboxed Inline Tags) */}
                        {note.keyTerms && note.keyTerms.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-indigo-600 dark:text-indigo-300">
                            {note.keyTerms.map((term, tIdx) => (
                              <span key={tIdx}>#{term}</span>
                            ))}
                          </div>
                        )}
                          </>
                        )}
                      </div>

                      {isCardExpanded && (
                        <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between mt-3 tabular-nums">
                          <span>Updated {new Date(note.updatedAt).toLocaleDateString()}</span>
                          <button
                            type="button"
                            onClick={() => setExpandedNoteIds(prev => ({ ...prev, [note.id]: false }))}
                            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                          >
                            Collapse
                          </button>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: KNOWLEDGE TESTER */}
          {activeTab === "tester" && (
            <div>
              {/* Active Test Runner View */}
              {activeTest ? (
                <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
                  
                  {/* Test Top Nav */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-indigo-200 dark:bg-[#161828] dark:border-indigo-900/40">
                    <div>
                      <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                        Active Diagnostic Assessment
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{activeTest.title}</h3>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Progress</span>
                        <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                          Question {currentQuestionIndex + 1} of {activeTest.questions.length}
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTest(null)}
                        className="px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 dark:border-transparent dark:text-slate-400 dark:hover:text-white dark:bg-slate-800 rounded-lg"
                      >
                        Exit Test
                      </button>
                    </div>
                  </div>

                  {/* Test Finished Score Card */}
                  {isTestCompleted ? (
                    <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-indigo-50 via-white to-slate-50 border border-indigo-200 dark:from-[#1b1c35] dark:via-[#15162c] dark:to-[#121324] dark:border-indigo-500/40 text-center space-y-6 shadow-xl dark:shadow-2xl">
                      <div className="w-20 h-20 mx-auto rounded-full bg-indigo-100 border-2 border-indigo-400 flex items-center justify-center text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                        <Award className="w-10 h-10" />
                      </div>

                      <div>
                        <h4 className="text-2xl font-bold text-slate-900 dark:text-white">Assessment Complete!</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                          Diagnostic knowledge evaluation recorded for {goal.name}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm dark:shadow-none dark:bg-slate-900/60 dark:border-slate-800">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Final Score</span>
                          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{activeTest.lastScore}%</p>
                        </div>
                        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm dark:shadow-none dark:bg-slate-900/60 dark:border-slate-800">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Correct</span>
                          <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{activeTest.lastScoreFraction}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm dark:shadow-none dark:bg-slate-900/60 dark:border-slate-800">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Mastery</span>
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mt-1">
                            {(activeTest.lastScore || 0) >= 80 ? "Distinction" : (activeTest.lastScore || 0) >= 60 ? "Proficient" : "Needs Review"}
                          </p>
                        </div>
                      </div>

                      {(() => {
                        const missedItems = activeTest.questions
                          .map((q, idx) => ({
                            q,
                            idx,
                            userChoice: testUserAnswers[idx],
                            userMulti: testUserMultiAnswers[idx]
                          }))
                          .filter(item => !isQuestionAnswerCorrect(item.q, item.userChoice, item.userMulti));

                        const missedPayload = missedItems.map(({ q, userChoice, userMulti }) => ({
                          question: q.question,
                          correctAnswer: formatQuestionCorrectAnswerText(q),
                          userAnswer: formatQuestionUserAnswerText(q, userChoice, userMulti),
                          explanation: q.explanation || ""
                        }));

                        return (
                          <div className="space-y-4 text-left pt-2">
                            {missedItems.length > 0 ? (
                              <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700/35 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <BookOpen className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
                                    <h5 className="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-200">
                                      Missed Questions &amp; Material to Review ({missedItems.length})
                                    </h5>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isGeneratingReadings}
                                    onClick={() =>
                                      handleGenerateReadingRecommendations(
                                        missedPayload,
                                        `Missed Questions (${missedItems.length}) · ${activeTest.title}`
                                      )
                                    }
                                    className="keep-white px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-[11px] font-semibold text-white !text-white inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                                  >
                                    {isGeneratingReadings ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                                    )}
                                    <span>
                                      {isGeneratingReadings
                                        ? "Generating Readings..."
                                        : "AI Recommend Readings for Missed"}
                                    </span>
                                  </button>
                                </div>

                                <div className="space-y-2.5">
                                  {missedItems.map(({ q, idx, userChoice, userMulti }) => {
                                    const qKey = `score_${q.id || idx}`;
                                    const correctAnswerText = formatQuestionCorrectAnswerText(q);
                                    const userAnswerText = formatQuestionUserAnswerText(q, userChoice, userMulti);
                                    const rawMatched = findMatchingNotesForQuestion(
                                      q.question,
                                      q.explanation || "",
                                      correctAnswerText,
                                      currentHub.notes,
                                      2
                                    );
                                    const matchingNotes = mergeMatchedNotesWithGenerated(
                                      rawMatched,
                                      generatedLessonNoteByQKey[qKey],
                                      currentHub.notes,
                                      3
                                    );
                                    const isGeneratingThis = generatingLessonQKey === qKey;
                                    const genError = topicLessonErrorByQKey[qKey];
                                    return (
                                      <div
                                        key={q.id}
                                        className="p-3 rounded-xl bg-white dark:bg-slate-900/75 border border-amber-200/80 dark:border-amber-800/30 space-y-2"
                                      >
                                        <p className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                                          Q{idx + 1}: {q.question}
                                        </p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                                          {userAnswerText && (
                                            <span className="text-rose-700 dark:text-rose-300">
                                              Your answer: <strong>{userAnswerText}</strong>
                                            </span>
                                          )}
                                          <span className="text-emerald-700 dark:text-emerald-300">
                                            Correct: <strong>{correctAnswerText}</strong>
                                          </span>
                                        </div>

                                        {matchingNotes.length > 0 ? (
                                          <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 block">
                                              Suggested From Your Notes (click to open saved note):
                                            </span>
                                            {matchingNotes.map((mn) => (
                                              <div
                                                key={mn.id}
                                                className="p-2 rounded-lg bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/35 space-y-1 hover:border-teal-400 dark:hover:border-teal-500/60 transition-colors"
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleOpenSavedNote(mn.id, true)}
                                                    title="Open this saved note in Study Notes"
                                                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left group/note cursor-pointer"
                                                  >
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200 uppercase font-semibold shrink-0">
                                                      {formatCategoryLabel(mn.category)}
                                                    </span>
                                                    <span className="text-xs font-semibold text-teal-950 dark:text-teal-100 group-hover/note:text-teal-700 dark:group-hover/note:text-amber-300 group-hover/note:underline truncate">
                                                      {mn.title}
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 shrink-0 inline-flex items-center gap-0.5 opacity-80 group-hover/note:opacity-100">
                                                      <span>Open Note</span>
                                                      <ArrowRight className="w-2.5 h-2.5" />
                                                    </span>
                                                  </button>
                                                  <div className="flex items-center gap-2 shrink-0">
                                                    {mn.url && isSafePublicHttpUrl(mn.url) && (
                                                      <a
                                                        href={mn.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-[10px] font-semibold text-cyan-700 hover:underline dark:text-cyan-300 inline-flex items-center gap-0.5"
                                                      >
                                                        <span>Link</span>
                                                        <ExternalLink className="w-2.5 h-2.5" />
                                                      </a>
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPreviewReviewNoteId(prev => (prev === mn.id ? null : mn.id));
                                                      }}
                                                      className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white underline cursor-pointer"
                                                    >
                                                      {previewReviewNoteId === mn.id ? "Hide" : "Quick Preview"}
                                                    </button>
                                                  </div>
                                                </div>
                                                {previewReviewNoteId === mn.id && (
                                                  mn.category === "table" && resolveNoteTableData(mn) ? (
                                                    <div className="pt-1.5 border-t border-teal-200/70 dark:border-teal-800/40">
                                                      <StudyNoteTableView
                                                        headers={resolveNoteTableData(mn)!.headers}
                                                        rows={resolveNoteTableData(mn)!.rows}
                                                        compact
                                                      />
                                                    </div>
                                                  ) : (
                                                    <div className="pt-1 border-t border-teal-200/70 dark:border-teal-800/40 max-h-32 overflow-y-auto custom-scrollbar">
                                                      <FormattedStudyText
                                                        text={mn.definition || mn.answer || mn.urlNotes || mn.content}
                                                        className="text-[11px]"
                                                      />
                                                    </div>
                                                  )
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <span className="text-[11px] text-amber-900 dark:text-amber-200/90 font-medium">
                                                No saved note covers this topic yet. Generate study material &amp; save to Notes:
                                              </span>
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                {(["lesson", "lecture", "note"] as TopicLessonStyle[]).map(style => (
                                                  <button
                                                    key={style}
                                                    type="button"
                                                    disabled={Boolean(generatingLessonQKey)}
                                                    onClick={() =>
                                                      handleGenerateTopicLessonForQuestion(
                                                        qKey,
                                                        {
                                                          question: q.question,
                                                          correctAnswer: correctAnswerText,
                                                          userAnswer: userAnswerText,
                                                          explanation: q.explanation || ""
                                                        },
                                                        style
                                                      )
                                                    }
                                                    className="keep-white px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-[10.5px] font-semibold !text-white inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                                  >
                                                    {isGeneratingThis && topicLessonStyle === style ? (
                                                      <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                      <Sparkles className="w-3 h-3 text-amber-200" />
                                                    )}
                                                    <span className="capitalize">AI {style === "note" ? "Note" : style}</span>
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                            {isGeneratingThis && (
                                              <p className="text-[10.5px] text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                <span>Generating &amp; saving study material on this topic...</span>
                                              </p>
                                            )}
                                            {genError && (
                                              <p className="text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-lg px-2.5 py-1.5">
                                                {genError}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/25 dark:border-emerald-800/35 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
                                  Perfect score! Want deeper reading material to master the next level?
                                </span>
                                <button
                                  type="button"
                                  disabled={isGeneratingReadings}
                                  onClick={() => handleGenerateReadingRecommendations([], `Next-Level Reading · ${goal.name}`)}
                                  className="keep-white px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-[11px] font-semibold text-white !text-white inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Generate Reading Recommendations</span>
                                </button>
                              </div>
                            )}

                            {renderReadingRecommendationsPanel()}
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button
                          onClick={() => startTest(activeTest)}
                          className="keep-white px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white !text-white shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/40 inline-flex items-center gap-2 cursor-pointer"
                        >
                          <RotateCw className="w-4 h-4" />
                          <span>Retake Assessment</span>
                        </button>
                        <button
                          onClick={() => setActiveTest(null)}
                          className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Back to Test Bank
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Active Question Card */
                    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-[#141727] dark:border-indigo-900/30 space-y-6 shadow-md dark:shadow-xl">
                      {(() => {
                        const q = activeTest.questions[currentQuestionIndex];
                        const isMultiSelect = isMultiSelectQuestion(q);
                        const expectedCorrectIndices = getQuestionCorrectIndices(q);
                        const isCurrentCorrect = isQuestionAnswerCorrect(
                          q,
                          selectedOptionIndex ?? undefined,
                          selectedMultiIndices
                        );
                        const currentCorrectText = formatQuestionCorrectAnswerText(q);
                        const currentUserAnswerText = formatQuestionUserAnswerText(
                          q,
                          selectedOptionIndex ?? undefined,
                          selectedMultiIndices
                        );
                        return (
                          <>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-mono font-semibold text-indigo-700 dark:text-indigo-400">
                                  Question {currentQuestionIndex + 1}
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isMultiSelect && (
                                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold border bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700/40">
                                      Select all that apply
                                    </span>
                                  )}
                                  {q.sourceLabel && (
                                    <span
                                      className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                                        q.sourceType === "note"
                                          ? "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-700/40"
                                          : "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-700/40"
                                      }`}
                                    >
                                      {q.sourceLabel}
                                    </span>
                                  )}
                                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-semibold tracking-wider ${
                                    q.difficulty === "hard" 
                                      ? "bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/40"
                                      : q.difficulty === "medium"
                                      ? "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40"
                                      : "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40"
                                  }`}>
                                    {q.difficulty || "medium"}
                                  </span>
                                </div>
                              </div>
                              <h4 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
                                {q.question}
                              </h4>
                            </div>

                            {/* Answer Options */}
                            <div className="space-y-2.5">
                              {q.options.map((option, optIdx) => {
                                const isSelected = isMultiSelect
                                  ? selectedMultiIndices.includes(optIdx)
                                  : selectedOptionIndex === optIdx;
                                const isCorrect = expectedCorrectIndices.includes(optIdx);
                                
                                let btnClasses = "w-full text-left p-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-between ";

                                if (!isAnswerSubmitted) {
                                  btnClasses += isSelected
                                    ? isMultiSelect
                                      ? "bg-blue-50 border-blue-500 text-blue-950 shadow-md shadow-blue-500/10 dark:bg-blue-600/20 dark:border-blue-500 dark:text-white dark:shadow-blue-900/30"
                                      : "bg-indigo-50 border-indigo-500 text-indigo-950 shadow-md shadow-indigo-500/10 dark:bg-indigo-600/20 dark:border-indigo-500 dark:text-white dark:shadow-indigo-900/30"
                                    : "bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-100 dark:bg-slate-900/60 dark:border-slate-800/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900";
                                } else {
                                  if (isCorrect) {
                                    btnClasses += "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-md shadow-emerald-500/10 dark:bg-emerald-950/70 dark:border-emerald-500 dark:text-emerald-200 dark:shadow-emerald-950/40";
                                  } else if (isSelected && !isCorrect) {
                                    btnClasses += "bg-rose-50 border-rose-500 text-rose-950 shadow-md shadow-rose-500/10 dark:bg-rose-950/70 dark:border-rose-500 dark:text-rose-200 dark:shadow-rose-950/40";
                                  } else {
                                    btnClasses += "bg-slate-50/70 border-slate-200 text-slate-400 opacity-70 dark:bg-slate-900/40 dark:border-slate-800/40 dark:text-slate-500 dark:opacity-60";
                                  }
                                }

                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() => (isMultiSelect ? handleToggleMultiOption(optIdx) : handleSelectOption(optIdx))}
                                    disabled={isAnswerSubmitted}
                                    className={btnClasses}
                                  >
                                    <div className="flex items-center gap-3">
                                      {isMultiSelect && (
                                        <span
                                          className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                                            isAnswerSubmitted && isCorrect
                                              ? isSelected
                                                ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white"
                                                : "bg-emerald-100 dark:bg-emerald-900/50 border-emerald-500 text-emerald-700 dark:text-emerald-300"
                                              : isAnswerSubmitted && isSelected && !isCorrect
                                              ? "keep-white bg-rose-600 border-rose-600 text-white !text-white"
                                              : isSelected
                                              ? "keep-white bg-blue-600 border-blue-600 text-white !text-white"
                                              : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-transparent"
                                          }`}
                                        >
                                          {(isSelected || (isAnswerSubmitted && isCorrect)) && (
                                            <Check className="w-3.5 h-3.5" />
                                          )}
                                        </span>
                                      )}
                                      <span className="w-6 h-6 rounded-lg bg-white border border-slate-300 text-slate-700 dark:bg-black/40 dark:border-white/10 dark:text-slate-200 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                                        {String.fromCharCode(65 + optIdx)}
                                      </span>
                                      <span>{option}</span>
                                    </div>

                                    {isAnswerSubmitted && (
                                      <div>
                                        {isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                                        {isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Explanation Card after submission */}
                            {isAnswerSubmitted && (
                              <div className="space-y-3 animate-fadeIn">
                                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-700/30 space-y-2">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                                    <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                                    <span>Explanation &amp; Concept Application</span>
                                  </div>
                                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {q.explanation}
                                  </p>
                                </div>

                                {!isCurrentCorrect && (() => {
                                  const qKey = `active_${q.id || currentQuestionIndex}`;
                                  const rawMatched = findMatchingNotesForQuestion(
                                    q.question,
                                    q.explanation || "",
                                    currentCorrectText,
                                    currentHub.notes,
                                    3
                                  );
                                  const matchingNotes = mergeMatchedNotesWithGenerated(
                                    rawMatched,
                                    generatedLessonNoteByQKey[qKey],
                                    currentHub.notes,
                                    3
                                  );
                                  const isGeneratingThis = generatingLessonQKey === qKey;
                                  const genError = topicLessonErrorByQKey[qKey];
                                  return (
                                    <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 dark:bg-amber-950/25 dark:border-amber-700/35 space-y-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-200">
                                          <BookOpen className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
                                          <span>Suggested Material to Read / Review</span>
                                        </div>
                                        <button
                                          type="button"
                                          disabled={isGeneratingReadings}
                                          onClick={() =>
                                            handleGenerateReadingRecommendations(
                                              [
                                                {
                                                  question: q.question,
                                                  correctAnswer: currentCorrectText,
                                                  userAnswer: currentUserAnswerText,
                                                  explanation: q.explanation || ""
                                                }
                                              ],
                                              `For Question ${currentQuestionIndex + 1}`
                                            )
                                          }
                                          className="keep-white px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-[11px] font-semibold text-white !text-white inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                        >
                                          {isGeneratingReadings ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <Sparkles className="w-3 h-3 text-amber-200" />
                                          )}
                                          <span>
                                            {isGeneratingReadings ? "Finding Readings..." : "AI Recommend Reading"}
                                          </span>
                                        </button>
                                      </div>

                                      {matchingNotes.length > 0 ? (
                                        <div className="space-y-2">
                                          <p className="text-[11px] text-amber-900 dark:text-amber-200/80">
                                            Related study notes &amp; links in your hub (click a note to open it):
                                          </p>
                                          {matchingNotes.map((mn) => (
                                            <div
                                              key={mn.id}
                                              className="p-2.5 rounded-lg bg-white dark:bg-slate-900/75 border border-amber-200/80 dark:border-amber-800/30 hover:border-amber-400 dark:hover:border-amber-500/60 transition-colors space-y-1.5"
                                            >
                                              <div className="flex items-center justify-between gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenSavedNote(mn.id, true)}
                                                  title="Open this saved note in Study Notes"
                                                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left group/note cursor-pointer"
                                                >
                                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200 uppercase font-semibold shrink-0">
                                                    {formatCategoryLabel(mn.category)}
                                                  </span>
                                                  <span className="text-xs font-semibold text-slate-900 dark:text-white group-hover/note:text-amber-700 dark:group-hover/note:text-amber-300 group-hover/note:underline truncate">
                                                    {mn.title}
                                                  </span>
                                                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 shrink-0 inline-flex items-center gap-0.5">
                                                    <span>Open Note</span>
                                                    <ArrowRight className="w-2.5 h-2.5" />
                                                  </span>
                                                </button>
                                                <div className="flex items-center gap-2 shrink-0">
                                                  {mn.url && isSafePublicHttpUrl(mn.url) && (
                                                    <a
                                                      href={mn.url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="text-[11px] font-semibold text-cyan-700 hover:underline dark:text-cyan-300 inline-flex items-center gap-0.5"
                                                    >
                                                      <span>Open Link</span>
                                                      <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setPreviewReviewNoteId(prev => (prev === mn.id ? null : mn.id));
                                                    }}
                                                    className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 dark:text-indigo-300 underline cursor-pointer"
                                                  >
                                                    {previewReviewNoteId === mn.id ? "Hide Note" : "Preview Note"}
                                                  </button>
                                                </div>
                                              </div>
                                              {previewReviewNoteId === mn.id && (
                                                mn.category === "table" && resolveNoteTableData(mn) ? (
                                                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800">
                                                    <StudyNoteTableView
                                                      headers={resolveNoteTableData(mn)!.headers}
                                                      rows={resolveNoteTableData(mn)!.rows}
                                                      compact
                                                    />
                                                  </div>
                                                ) : (
                                                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 max-h-36 overflow-y-auto custom-scrollbar">
                                                    <FormattedStudyText text={mn.definition || mn.answer || mn.urlNotes || mn.content} />
                                                  </div>
                                                )
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-amber-200 dark:border-amber-800/35 space-y-2">
                                          <p className="text-[11px] text-amber-950 dark:text-amber-200 font-medium">
                                            No saved note matches this topic yet. Let AI generate study material &amp; save it to your Notes:
                                          </p>
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            {(["lesson", "lecture", "note"] as TopicLessonStyle[]).map(style => (
                                              <button
                                                key={style}
                                                type="button"
                                                disabled={Boolean(generatingLessonQKey)}
                                                onClick={() =>
                                                  handleGenerateTopicLessonForQuestion(
                                                    qKey,
                                                    {
                                                      question: q.question,
                                                      correctAnswer: currentCorrectText,
                                                      userAnswer: currentUserAnswerText,
                                                      explanation: q.explanation || ""
                                                    },
                                                    style
                                                  )
                                                }
                                                className="keep-white px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-[11px] font-semibold !text-white inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                              >
                                                {isGeneratingThis && topicLessonStyle === style ? (
                                                  <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  <Sparkles className="w-3 h-3 text-amber-200" />
                                                )}
                                                <span>
                                                  Generate {style === "lesson" ? "Lesson" : style === "lecture" ? "Lecture" : "Study Note"}
                                                </span>
                                              </button>
                                            ))}
                                          </div>
                                          {isGeneratingThis && (
                                            <p className="text-[11px] text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                              <span>Writing &amp; saving study material for this concept...</span>
                                            </p>
                                          )}
                                          {genError && (
                                            <p className="text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-lg px-2.5 py-1.5">
                                              {genError}
                                            </p>
                                          )}
                                        </div>
                                      )}

                                      {renderReadingRecommendationsPanel()}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-2">
                              {!isAnswerSubmitted ? (
                                <button
                                  onClick={handleSubmitQuestionAnswer}
                                  disabled={isMultiSelect ? selectedMultiIndices.length === 0 : selectedOptionIndex === null}
                                  className="keep-white px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white !text-white shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/40 disabled:opacity-50 transition-all ml-auto"
                                >
                                  Submit Answer
                                </button>
                              ) : (
                                <button
                                  onClick={handleNextQuestion}
                                  className="keep-white px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white !text-white shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/40 inline-flex items-center gap-2 ml-auto"
                                >
                                  <span>
                                    {currentQuestionIndex + 1 < activeTest.questions.length ? "Next Question" : "View Scorecard"}
                                  </span>
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                /* Test Bank / Selection View */
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">Diagnostic Knowledge Assessments</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Combine AI exam questions with your saved notes (Concepts, Definitions, Summaries, Q&amp;As, Fill-in-the-Blank, MCQs &amp; True/False).
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleGenerateReadingRecommendations([], `${goal.name} Reading List`)}
                        disabled={isGeneratingReadings}
                        className="px-3.5 py-2 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-300 text-xs font-semibold text-cyan-900 dark:bg-cyan-600/20 dark:hover:bg-cyan-600/30 dark:border-cyan-500/40 dark:text-cyan-200 inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        {isGeneratingReadings ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-700 dark:text-cyan-300" />
                        ) : (
                          <BookOpen className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-300" />
                        )}
                        <span>{isGeneratingReadings ? "Finding Readings..." : "AI Recommend Readings"}</span>
                      </button>

                      <button
                        onClick={() => handleAIGenerateTest()}
                        disabled={isGeneratingTest}
                        className="keep-white px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-xs font-medium text-white !text-white shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/30 inline-flex items-center gap-2 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>{isGeneratingTest ? "Authoring Test..." : "Generate New Test"}</span>
                      </button>
                    </div>
                  </div>

                  {renderReadingRecommendationsPanel()}

                  {/* Test Question Mix & Length Selector */}
                  <div className="p-4 rounded-xl bg-white dark:bg-[#141727] border border-slate-200 dark:border-indigo-900/35 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Question Source Mix
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-medium">
                          {currentHub.notes.length} saved {currentHub.notes.length === 1 ? "note" : "notes"} available
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Length:</span>
                        {[4, 6, 8, 10].map((countOpt) => (
                          <button
                            key={countOpt}
                            type="button"
                            onClick={() => setTestQuestionCount(countOpt)}
                            className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                              testQuestionCount === countOpt
                                ? "keep-white bg-indigo-600 text-white !text-white shadow-sm"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {countOpt} Qs
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        {
                          id: "hybrid" as TestSourceMode,
                          title: "Combination (AI + My Notes)",
                          desc: "Blends AI exam questions with your definitions, summaries, Q&As, MCQs & more."
                        },
                        {
                          id: "notes_only" as TestSourceMode,
                          title: "My Notes Only",
                          desc: "Tests strictly from your saved study notes, definitions, summaries & questions."
                        },
                        {
                          id: "ai_only" as TestSourceMode,
                          title: "AI Exam Only",
                          desc: "Generates fresh AI certification-style questions for your goal & chapter."
                        }
                      ].map((modeOpt) => {
                        const isSelected = testSourceMode === modeOpt.id;
                        return (
                          <button
                            key={modeOpt.id}
                            type="button"
                            onClick={() => setTestSourceMode(modeOpt.id)}
                            className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/30 dark:bg-indigo-950/45 dark:border-indigo-400"
                                : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 dark:bg-slate-900/50 dark:hover:bg-slate-900 dark:border-slate-800"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-bold ${
                                  isSelected
                                    ? "text-indigo-900 dark:text-indigo-200"
                                    : "text-slate-800 dark:text-slate-200"
                                }`}
                              >
                                {modeOpt.title}
                              </span>
                              {isSelected && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                              {modeOpt.desc}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assigned Links for Study & Review in Tester */}
                  {(loginPromptLink || loginStudyLinks.length > 0) && (() => {
                    const pendingCount = loginStudyLinks.filter(l => !l.reviewCompleted).length;
                    return (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 dark:bg-amber-950/25 dark:border-amber-600/40 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <Link2 className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                                  {loginPromptLink
                                    ? `Study Assignment: "${loginPromptLink.title}"`
                                    : "Assigned Links to Study & Review"}
                                </h4>
                                {loginStudyLinks.length > 0 && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                    pendingCount > 0
                                      ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30"
                                      : "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30"
                                  }`}>
                                    {pendingCount > 0 ? `${pendingCount} pending` : "All studied ✓"}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                                {loginPromptLink?.note ||
                                  "These saved lessons require signing in. Open an assigned link to study or review directly, then check it off:"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {loginStudyLinks.length > 0 && pendingCount === 0 && (
                              <button
                                type="button"
                                onClick={handleResetAllLinkAssignments}
                                className="text-[11px] font-medium text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-200 underline cursor-pointer whitespace-nowrap"
                              >
                                Re-assign all
                              </button>
                            )}
                            {loginPromptLink && (
                              <button
                                type="button"
                                onClick={() => setLoginPromptLink(null)}
                                className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded cursor-pointer"
                                title="Dismiss"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {loginPromptLink && isSafeHttpUrl(loginPromptLink.url) && (
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={loginPromptLink.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="keep-white px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white !text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <span>Go Study: {loginPromptLink.title}</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}

                        {loginStudyLinks.length > 0 && (
                          <div className="space-y-1.5">
                            {loginStudyLinks.map(linkNote => (
                              <div
                                key={linkNote.id}
                                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors ${
                                  linkNote.reviewCompleted
                                    ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-700/35"
                                    : "bg-white border-amber-200 dark:bg-slate-900/75 dark:border-amber-700/30"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleToggleLinkAssignment(linkNote.id)}
                                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                                >
                                  <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                                    linkNote.reviewCompleted
                                      ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white dark:bg-emerald-500 dark:border-emerald-500"
                                      : "border-amber-500 group-hover:border-amber-600 dark:border-amber-400/60 dark:group-hover:border-amber-300"
                                  }`}>
                                    {linkNote.reviewCompleted && <Check className="w-3 h-3" />}
                                  </span>
                                  <span className={`text-xs font-medium truncate ${
                                    linkNote.reviewCompleted ? "line-through text-slate-400" : "text-slate-900 dark:text-slate-100"
                                  }`}>
                                    {linkNote.title}
                                  </span>
                                  {(linkNote.studyCount || 0) > 0 && (
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                                      Studied {linkNote.studyCount}x
                                    </span>
                                  )}
                                </button>

                                <a
                                  href={linkNote.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="keep-white px-2.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white !text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                                >
                                  <span>{linkNote.reviewCompleted ? "Review Link" : "Go Study"}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Test Me from Uploaded Video, Text, or URL Card */}
                  <div className="p-4 rounded-xl bg-white border border-cyan-200 shadow-sm dark:shadow-none dark:bg-[#141727] dark:border-cyan-800/35 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {sourceTesterMode === "upload" ? (
                          <Video className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                        ) : (
                          <Link2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                        )}
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {sourceTesterMode === "upload"
                            ? "Test Me from Downloaded Video & Text"
                            : "Test Me from Video or Resource URL"}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setSourceTesterMode("upload")}
                          className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                            sourceTesterMode === "upload"
                              ? "keep-white bg-cyan-600 text-white !text-white"
                              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                          }`}
                        >
                          <Upload className="w-3 h-3" />
                          <span>Upload Video / Text</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSourceTesterMode("url")}
                          className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                            sourceTesterMode === "url"
                              ? "keep-white bg-cyan-600 text-white !text-white"
                              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                          }`}
                        >
                          <Link2 className="w-3 h-3" />
                          <span>From URL</span>
                        </button>
                      </div>
                    </div>

                    {sourceTesterMode === "upload" ? (
                      <div className="space-y-2.5">
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          Downloaded a Coursera or course video? Upload the video (.mp4, .mov, .webm) and/or attach a transcript (.txt, .vtt, .srt) or paste lesson text to generate study notes &amp; test questions directly from it.
                        </p>

                        {uploadError && (
                          <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/35 dark:border-rose-500/35 rounded-lg px-3 py-2">
                            {uploadError}
                          </p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <label className="block p-2.5 rounded-lg bg-slate-50 border border-dashed border-cyan-400/70 hover:border-cyan-600 dark:bg-slate-900/80 dark:border-cyan-600/45 dark:hover:border-cyan-400/75 transition cursor-pointer">
                            <span className="text-[11px] font-semibold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5 mb-0.5">
                              <Video className="w-3.5 h-3.5" />
                              <span>Downloaded Video / Audio</span>
                            </span>
                            <input
                              type="file"
                              accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.m4v,.mp3,.wav,.m4a"
                              onChange={e => setUploadedVideoFile(e.target.files?.[0] || null)}
                              className="sr-only"
                            />
                            <span className="text-[11px] text-slate-600 dark:text-slate-300 block truncate">
                              {uploadedVideoFile
                                ? `${uploadedVideoFile.name} (${(uploadedVideoFile.size / (1024 * 1024)).toFixed(1)} MB)`
                                : "Select MP4, MOV, WebM, MKV, or MP3 (up to 250 MB)"}
                            </span>
                          </label>

                          <label className="block p-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-300 hover:border-violet-500 dark:bg-slate-900/80 dark:border-slate-700 dark:hover:border-violet-500/60 transition cursor-pointer">
                            <span className="text-[11px] font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-1.5 mb-0.5">
                              <FileText className="w-3.5 h-3.5" />
                              <span>Transcript / Subtitle File (Optional)</span>
                            </span>
                            <input
                              type="file"
                              accept=".txt,.vtt,.srt,.md,text/plain,text/vtt"
                              onChange={e => setUploadedTranscriptFile(e.target.files?.[0] || null)}
                              className="sr-only"
                            />
                            <span className="text-[11px] text-slate-600 dark:text-slate-300 block truncate">
                              {uploadedTranscriptFile
                                ? uploadedTranscriptFile.name
                                : "Optional: select .txt, .vtt, .srt, or .md"}
                            </span>
                          </label>
                        </div>

                        <input
                          type="text"
                          placeholder="Optional lesson title (e.g. Module 3: Supervised Learning)"
                          value={uploadedLessonTitle}
                          onChange={e => setUploadedLessonTitle(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-900/80 dark:border-slate-800 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />

                        <textarea
                          rows={2}
                          placeholder="Optional: paste lecture transcript or text notes to combine with your video..."
                          value={uploadedTranscriptText}
                          onChange={e => setUploadedTranscriptText(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-200 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Saves study notes, flashcards &amp; test to this goal
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isExtractingUpload || (!uploadedVideoFile && !uploadedTranscriptFile && !uploadedTranscriptText.trim())}
                              onClick={() => handleExtractFromUpload({ mode: "both", startGeneratedTest: true })}
                              className="keep-white px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold text-white !text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                            >
                              {isExtractingUpload ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                              <span>{isExtractingUpload ? "Analyzing Video & Building Quiz..." : "Analyze & Test Me"}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="url"
                            placeholder="Paste YouTube, Coursera, Udemy, or article URL..."
                            value={testerUrlInput}
                            onChange={e => setTesterUrlInput(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                          />
                          <button
                            type="button"
                            disabled={isExtractingUrl || !testerUrlInput.trim()}
                            onClick={() =>
                              handleExtractFromUrl({
                                url: testerUrlInput,
                                userNotes: testerUrlNotesInput,
                                mode: "test",
                                startGeneratedTest: true
                              })
                            }
                            className="keep-white px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold text-white !text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {isExtractingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                            <span>{isExtractingUrl ? "Building Quiz..." : "Generate Quiz from URL"}</span>
                          </button>
                        </div>

                        <input
                          type="text"
                          placeholder="Optional: paste lecture topics or transcript snippet (for login-protected Coursera/Udemy videos)"
                          value={testerUrlNotesInput}
                          onChange={e => setTesterUrlNotesInput(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-200 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />

                        {currentHub.notes.some(n => n.category === "url" && n.url && isSafeHttpUrl(n.url)) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">Saved links:</span>
                            {currentHub.notes
                              .filter(n => n.category === "url" && n.url && isSafeHttpUrl(n.url))
                              .slice(0, 5)
                              .map(urlNote => (
                                <button
                                  key={urlNote.id}
                                  type="button"
                                  disabled={isExtractingUrl}
                                  onClick={() =>
                                    handleExtractFromUrl({
                                      url: urlNote.url!,
                                      userNotes: urlNote.urlNotes,
                                      mode: "test",
                                      existingNoteId: urlNote.id,
                                      startGeneratedTest: true,
                                      requiresLogin: urlNote.requiresLogin,
                                      title: urlNote.title
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 text-xs text-cyan-700 dark:bg-slate-900 dark:hover:bg-cyan-950/60 dark:border-slate-700 dark:hover:border-cyan-700/50 dark:text-cyan-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  <Link2 className="w-3 h-3 shrink-0" />
                                  <span className="max-w-[180px] truncate">{urlNote.title}</span>
                                </button>
                              ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {currentHub.tests.length === 0 ? (
                    <div className="text-center py-16 px-4 border border-dashed border-indigo-300 rounded-2xl bg-indigo-50/70 dark:border-indigo-900/30 dark:bg-indigo-950/10">
                      <Brain className="w-12 h-12 text-indigo-400 dark:text-indigo-400/40 mx-auto mb-3" />
                      <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">No knowledge assessments created yet</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto mt-1 mb-5">
                        Author comprehensive diagnostic test batteries to verify your retention before moving to subsequent syllabus modules.
                      </p>
                      <button
                        onClick={() => handleAIGenerateTest()}
                        disabled={isGeneratingTest}
                        className="keep-white px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white !text-white shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/40 inline-flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Author First Test</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {currentHub.tests.map((test) => (
                        <div
                          key={test.id}
                          className="p-5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 shadow-sm dark:bg-[#141727] dark:border-indigo-900/30 dark:hover:border-indigo-600/50 transition-all flex flex-col justify-between dark:shadow-lg"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="text-base font-bold text-slate-900 dark:text-white">{test.title}</h4>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {test.generationMode && (
                                    <span
                                      className={`text-[10px] px-2 py-0.5 rounded border font-semibold inline-block ${
                                        test.generationMode === "hybrid"
                                          ? "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-700/35"
                                          : test.generationMode === "notes_only"
                                          ? "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-700/35"
                                          : "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-700/35"
                                      }`}
                                    >
                                      {test.generationMode === "hybrid"
                                        ? "AI + Notes Mix"
                                        : test.generationMode === "notes_only"
                                        ? "My Notes Only"
                                        : "AI Exam Only"}
                                    </span>
                                  )}
                                  {test.chapterTitle && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 dark:border-transparent dark:bg-slate-800 dark:text-slate-400 inline-block">
                                      {test.chapterTitle}
                                    </span>
                                  )}
                                  {test.sourceFileName && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-700/35 inline-block">
                                      {test.sourceFileName}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {test.lastScore !== undefined && (
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Last Score</span>
                                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                    {test.lastScore}% ({test.lastScoreFraction})
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 py-1">
                              <span>{test.questions.length} Questions</span>
                              <span>•</span>
                              <span>{test.attemptsCount || 0} Attempts</span>
                              <span>•</span>
                              <span>{new Date(test.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between mt-3">
                            <button
                              onClick={() => {
                                saveHub({
                                  ...currentHub,
                                  tests: currentHub.tests.filter(t => t.id !== test.id)
                                });
                              }}
                              className="text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                            >
                              Delete
                            </button>

                            <button
                              onClick={() => startTest(test)}
                              className="keep-white px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white !text-white shadow-md shadow-indigo-500/20 dark:shadow-indigo-950/40 inline-flex items-center gap-1.5"
                            >
                              <span>{test.attemptsCount ? "Retake Test" : "Start Test"}</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ACTIVE RECALL FLASHCARDS */}
          {activeTab === "flashcards" && (
            <div className="max-w-2xl mx-auto space-y-6">
              {loginStudyLinks.length > 0 && (() => {
                const pendingReviewCount = loginStudyLinks.filter(l => !l.reviewCompleted).length;
                return (
                  <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-600/35 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Link2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-semibold text-cyan-950 dark:text-cyan-200">
                              Link Study &amp; Review Assignments
                            </h4>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              pendingReviewCount > 0
                                ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30"
                            }`}>
                              {pendingReviewCount > 0 ? `${pendingReviewCount} to review` : "All reviewed ✓"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                            Login-required lessons — open to review directly, then check them off:
                          </p>
                        </div>
                      </div>
                      {pendingReviewCount === 0 && (
                        <button
                          type="button"
                          onClick={handleResetAllLinkAssignments}
                          className="text-[11px] font-medium text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200 underline cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Review again
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {loginStudyLinks.map(linkNote => (
                        <div
                          key={linkNote.id}
                          className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors ${
                            linkNote.reviewCompleted
                              ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-700/35"
                              : "bg-white border-cyan-200 dark:bg-slate-900/75 dark:border-cyan-700/35"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleLinkAssignment(linkNote.id)}
                            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                          >
                            <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                              linkNote.reviewCompleted
                                ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white dark:bg-emerald-500 dark:border-emerald-500"
                                : "border-cyan-500 group-hover:border-cyan-600 dark:border-cyan-400/60 dark:group-hover:border-cyan-300"
                            }`}>
                              {linkNote.reviewCompleted && <Check className="w-3 h-3" />}
                            </span>
                            <span className={`text-xs font-medium truncate ${
                              linkNote.reviewCompleted ? "line-through text-slate-400" : "text-slate-900 dark:text-slate-100"
                            }`}>
                              {linkNote.title}
                            </span>
                          </button>

                          <a
                            href={linkNote.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="keep-white px-2.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white !text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                          >
                            <span>{linkNote.reviewCompleted ? "Review" : "Go Study"}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Add Card Form */}
              {isAddingFlashcard && (
                <form
                  onSubmit={handleAddFlashcard}
                  className="p-5 rounded-xl bg-white border border-emerald-200 dark:bg-[#16192a] dark:border-emerald-800/40 space-y-4 shadow-md dark:shadow-xl animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-emerald-200 dark:border-emerald-900/30 pb-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Add Active Recall Flashcard
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsAddingFlashcard(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Front (Prompt / Term)</label>
                    <input
                      type="text"
                      placeholder="e.g. What is the difference between TCP and UDP?"
                      value={newCardFront}
                      onChange={e => setNewCardFront(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Back (Answer / Definition)</label>
                    <textarea
                      rows={3}
                      placeholder="e.g. TCP provides guaranteed ordered packet delivery; UDP provides low-latency connectionless transport."
                      value={newCardBack}
                      onChange={e => setNewCardBack(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingFlashcard(false)}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="keep-white px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white !text-white shadow-md shadow-emerald-500/20 dark:shadow-emerald-900/40"
                    >
                      Save Flashcard
                    </button>
                  </div>
                </form>
              )}

              {/* Flashcard Viewer */}
              {totalFlashcards === 0 ? (
                <div className="text-center py-16 px-4 border border-dashed border-emerald-300 rounded-2xl bg-emerald-50/70 dark:border-emerald-900/30 dark:bg-emerald-950/10">
                  <Layers className="w-12 h-12 text-emerald-500/60 dark:text-emerald-400/40 mx-auto mb-3" />
                  <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">No flashcards in this deck yet</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto mt-1 mb-5">
                    Click "AI Generate Guide" in the notes tab to auto-populate cards, or click "New Card" to create your own recall cards.
                  </p>
                  <button
                    onClick={() => setIsAddingFlashcard(true)}
                    className="keep-white px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white !text-white shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/40 inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Card</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Progress Header */}
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>
                      Card {currentFlashcardIndex + 1} of {totalFlashcards}
                    </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {masteredFlashcards} Mastered ({Math.round((masteredFlashcards / totalFlashcards) * 100)}%)
                    </span>
                  </div>

                  {/* 3D Flip Card */}
                  {(() => {
                    const card = currentHub.flashcards[currentFlashcardIndex];
                    if (!card) return null;

                    return (
                      <div
                        onClick={() => setIsCardFlipped(!isCardFlipped)}
                        className={`min-h-[260px] p-8 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between shadow-lg dark:shadow-2xl relative select-none ${
                          isCardFlipped
                            ? "bg-emerald-50/60 border-emerald-400 shadow-emerald-500/10 dark:bg-[#181d33] dark:border-emerald-500/50 dark:shadow-emerald-950/20"
                            : "bg-white border-violet-200 hover:border-violet-400 dark:bg-[#141727] dark:border-violet-900/40 dark:hover:border-violet-700/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono uppercase font-bold tracking-wider ${
                            isCardFlipped 
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800" 
                              : "bg-violet-100 text-violet-800 border border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800"
                          }`}>
                            {isCardFlipped ? "ANSWER / BACK" : "QUESTION / FRONT"}
                          </span>

                          {card.mastered && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Mastered</span>
                            </span>
                          )}
                        </div>

                        <div className="my-auto py-6 text-center">
                          <p className="text-lg sm:text-xl font-medium text-slate-900 dark:text-white leading-relaxed">
                            {isCardFlipped ? card.back : card.front}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-200 dark:border-slate-800/60">
                          <span>Click card to flip</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFlashcard(card.id);
                            }}
                            className="text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Navigation & Mastery Controls */}
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => {
                        setIsCardFlipped(false);
                        setCurrentFlashcardIndex(prev => Math.max(0, prev - 1));
                      }}
                      disabled={currentFlashcardIndex === 0}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-medium text-slate-700 dark:border-transparent dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 disabled:opacity-40"
                    >
                      Previous
                    </button>

                    {(() => {
                      const card = currentHub.flashcards[currentFlashcardIndex];
                      if (!card) return null;
                      return (
                        <button
                          onClick={() => handleToggleCardMastery(card.id)}
                          className={`px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                            card.mastered
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 dark:hover:border-rose-800"
                              : "keep-white bg-emerald-600 hover:bg-emerald-500 text-white !text-white shadow-lg shadow-emerald-500/20 dark:shadow-emerald-950/40"
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{card.mastered ? "Mark for Review" : "Mark as Mastered"}</span>
                        </button>
                      );
                    })()}

                    <button
                      onClick={() => {
                        setIsCardFlipped(false);
                        setCurrentFlashcardIndex(prev => Math.min(totalFlashcards - 1, prev + 1));
                      }}
                      disabled={currentFlashcardIndex >= totalFlashcards - 1}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-medium text-slate-700 dark:border-transparent dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MASTERY STATS OVERVIEW */}
          {activeTab === "overview" && (
            <div className="max-w-3xl mx-auto space-y-6">
              
              {/* Mastery Banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-violet-50 via-white to-indigo-50 border border-violet-200 shadow-sm dark:from-violet-950/60 dark:via-[#181b33] dark:to-indigo-950/60 dark:border-violet-800/40 dark:shadow-xl flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-violet-700 dark:text-violet-400">
                    Comprehensive Mastery Index
                  </span>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {goal.name} Knowledge Hub
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-md">
                    Calculated from diagnostic test scores, active recall cards mastered, and study note artifacts.
                  </p>
                </div>

                <div className="text-center p-4 rounded-xl bg-white border border-violet-200 shadow-sm dark:shadow-none dark:bg-black/40 dark:border-white/10 min-w-[120px]">
                  <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{masteryScore}%</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">
                    Mastery Rating
                  </span>
                </div>
              </div>

              {/* Metric Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm dark:shadow-none dark:bg-[#141727] dark:border-violet-900/30">
                  <div className="flex items-center gap-2 text-violet-700 dark:text-violet-400 mb-2">
                    <FileText className="w-5 h-5" />
                    <span className="text-xs font-semibold uppercase">Study Notes</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{currentHub.notes.length}</p>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Artifacts compiled</span>
                </div>

                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm dark:shadow-none dark:bg-[#141727] dark:border-indigo-900/30">
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 mb-2">
                    <Brain className="w-5 h-5" />
                    <span className="text-xs font-semibold uppercase">Assessments</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{currentHub.tests.length}</p>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Tests created</span>
                </div>

                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm dark:shadow-none dark:bg-[#141727] dark:border-emerald-900/30">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-2">
                    <Layers className="w-5 h-5" />
                    <span className="text-xs font-semibold uppercase">Flashcards</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{masteredFlashcards}/{totalFlashcards}</p>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Cards mastered</span>
                </div>
              </div>

              {/* Target Exam or Milestone Details */}
              {(goal.targetExamTitle || goal.targetExamDate) && (
                <div className="p-5 rounded-xl bg-amber-50/70 border border-amber-200 dark:bg-[#161a2f] dark:border-amber-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                        Target Certification Exam / Milestone
                      </span>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        {goal.targetExamTitle || "Exam Assessment"}
                      </h4>
                      {goal.targetExamDate && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          Scheduled Target Date: <span className="text-slate-900 dark:text-white font-medium">{goal.targetExamDate}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Readiness</span>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {masteryScore >= 75 ? "Exam Ready" : "In Training"}
                    </p>
                  </div>
                </div>
              )}

              {/* Chapters Progress Checklist */}
              {goal.chapters && goal.chapters.length > 0 && (
                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm dark:shadow-none dark:bg-[#141727] dark:border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-violet-700 dark:text-violet-400" />
                    Syllabus Chapters ({goal.chapters.filter(c => c.completed).length}/{goal.chapters.length} Completed)
                  </h4>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {goal.chapters.map(ch => (
                      <div key={ch.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {ch.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-400 dark:border-slate-600" />
                          )}
                          <span className={ch.completed ? "text-slate-400 line-through" : "text-slate-900 dark:text-white font-medium"}>
                            {ch.title}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setActiveTab("notes");
                            handleAIGenerateStudyNotes(ch.title);
                          }}
                          className="text-violet-700 hover:text-violet-900 dark:text-violet-400 dark:hover:text-violet-300 font-medium"
                        >
                          Generate Notes
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Fullscreen Screenshot Lightbox Preview */}
      {lightboxScreenshotUrl && (
        <div
          onClick={() => setLightboxScreenshotUrl(null)}
          className="fixed inset-0 z-[70] bg-slate-900/85 dark:bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-end gap-2"
          >
            <button
              type="button"
              onClick={() => setLightboxScreenshotUrl(null)}
              className="keep-white px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-white/20 text-white !text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Preview</span>
            </button>
            <img
              src={lightboxScreenshotUrl}
              alt="Screenshot preview"
              className="max-w-full max-h-[82vh] rounded-xl border border-white/15 shadow-2xl object-contain bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
};
