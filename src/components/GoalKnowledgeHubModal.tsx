import React, { useState } from "react";
import { 
  Goal, 
  GoalKnowledgeHub, 
  StudyArtifactNote, 
  KnowledgeTestArtifact, 
  FlashcardItem, 
  KnowledgeQuestion 
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
  ImagePlus
} from "lucide-react";
import { captureScreenScreenshot, extractImagesFromClipboardEvent, readImageFileAsDataUrl } from "../lib/screenshotCapture";

interface GoalKnowledgeHubModalProps {
  goal: Goal;
  isOpen: boolean;
  onClose: () => void;
  onUpdateKnowledgeHub: (goalId: string, updatedHub: GoalKnowledgeHub) => void;
  initialTab?: "notes" | "tester" | "flashcards" | "overview";
}

export const GoalKnowledgeHubModal: React.FC<GoalKnowledgeHubModalProps> = ({
  goal,
  isOpen,
  onClose,
  onUpdateKnowledgeHub,
  initialTab = "notes"
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

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  
  // Note creation modal/form state
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isUploadingInNotes, setIsUploadingInNotes] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState<StudyArtifactNote["category"]>("concept");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteQuestion, setNewNoteQuestion] = useState("");
  const [newNoteAnswer, setNewNoteAnswer] = useState("");
  const [newNoteExplanation, setNewNoteExplanation] = useState("");
  const [newNoteTerm, setNewNoteTerm] = useState("");
  const [newNoteDefinition, setNewNoteDefinition] = useState("");
  const [newNoteUrl, setNewNoteUrl] = useState("");
  const [newNoteUrlContext, setNewNoteUrlContext] = useState("");
  const [newNoteRequiresLogin, setNewNoteRequiresLogin] = useState(false);
  const [extractOnHubUrlSave, setExtractOnHubUrlSave] = useState(true);
  const [newNoteKeyTerms, setNewNoteKeyTerms] = useState("");
  const [newNoteChapter, setNewNoteChapter] = useState("");
  const [newNoteScreenshots, setNewNoteScreenshots] = useState<string[]>([]);
  const [isCapturingHubScreenshot, setIsCapturingHubScreenshot] = useState(false);
  const [hubScreenshotNotice, setHubScreenshotNotice] = useState<string | null>(null);
  const [lightboxScreenshotUrl, setLightboxScreenshotUrl] = useState<string | null>(null);
  const hubScreenshotFileInputRef = React.useRef<HTMLInputElement>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [hiddenQaNoteAnswers, setHiddenQaNoteAnswers] = useState<Record<string, boolean>>({});

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
  const [isExtractingUpload, setIsExtractingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Active Test Runner state
  const [activeTest, setActiveTest] = useState<KnowledgeTestArtifact | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [testUserAnswers, setTestUserAnswers] = useState<{ [qIndex: number]: number }>({});
  const [isTestCompleted, setIsTestCompleted] = useState(false);

  // Flashcards state
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isAddingFlashcard, setIsAddingFlashcard] = useState(false);
  const [newCardFront, setNewCardFront] = useState("");
  const [newCardBack, setNewCardBack] = useState("");

  // Loading states for AI generation
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

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

  const handleAIGenerateTest = async (chapterTitle?: string) => {
    setIsGeneratingTest(true);
    setAiNotice("Authoring multi-choice knowledge assessment questions...");
    try {
      const res = await fetch("/api/coach/generate-knowledge-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: goal.name,
          goalCategory: goal.category || "General",
          chapterTitle: chapterTitle || (goal.chapters && goal.chapters[0]?.title) || "",
          examTitle: goal.targetExamTitle || "",
          difficulty: "medium"
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
          setAiNotice("New knowledge test created! Select it below to start.");
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
    n => n.category === "url" && n.url && isSafeHttpUrl(n.url) && n.requiresLogin
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

      const data = await res.json();
      if (!res.ok) {
        setAiNotice(data?.error || "Could not extract study material from that URL.");
        setTimeout(() => setAiNotice(null), 5000);
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
      console.error("Failed to extract from URL", err);
      setAiNotice("Could not extract from URL. Please check the link and try again.");
      setTimeout(() => setAiNotice(null), 4500);
    } finally {
      setIsExtractingUrl(false);
    }
  };

  const handleExtractFromUpload = async (options?: {
    mode?: "both" | "notes" | "test";
    startGeneratedTest?: boolean;
  }) => {
    if (!uploadedVideoFile && !uploadedTranscriptFile && !uploadedTranscriptText.trim()) {
      setUploadError("Select a downloaded video/audio file, upload a transcript file, or paste your lesson text.");
      return;
    }

    setUploadError(null);
    setIsExtractingUpload(true);
    setAiNotice(
      uploadedVideoFile
        ? `Analyzing "${uploadedVideoFile.name}"${uploadedTranscriptText.trim() || uploadedTranscriptFile ? " + transcript" : ""}... Larger videos may take 30–90 seconds.`
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
      if (uploadedTranscriptText.trim()) {
        formData.append("transcriptText", uploadedTranscriptText.trim());
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

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error || "Could not extract study materials from that video or transcript.";
        setUploadError(errMsg);
        setAiNotice(errMsg);
        setTimeout(() => setAiNotice(null), 5000);
        return;
      }

      const mode = options?.mode || "both";
      const extractedNotes: StudyArtifactNote[] =
        mode === "test" ? [] : (Array.isArray(data.notes) ? data.notes : []);
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
      setIsUploadingInNotes(false);

      if (options?.startGeneratedTest && newTest) {
        setActiveTab("tester");
        startTest(newTest);
      }

      const parts: string[] = [];
      if (extractedNotes.length > 0) parts.push(`${extractedNotes.length} notes`);
      if (extractedCards.length > 0) parts.push(`${extractedCards.length} flashcards`);
      if (newTest) parts.push(`${newTest.questions.length} quiz questions`);
      setAiNotice(`Ready! Created ${parts.join(", ")} from "${data.extractedTitle || "your lecture"}".`);
      setTimeout(() => setAiNotice(null), 6000);
    } catch (err) {
      console.error("Failed to extract from uploaded lecture:", err);
      const msg = "Upload failed or timed out. Check your file size (under 250 MB) or include the transcript text.";
      setUploadError(msg);
      setAiNotice(msg);
      setTimeout(() => setAiNotice(null), 5000);
    } finally {
      setIsExtractingUpload(false);
    }
  };

  // 3. Note Management
  const formatCategoryLabel = (cat: string) => {
    if (cat === "qa") return "Question & Answer";
    if (cat === "definition") return "Definition";
    if (cat === "url") return "URL / Video";
    if (cat === "all") return "All";
    return cat.replace("_", " ");
  };

  const handleTakeHubScreenshot = async () => {
    if (isCapturingHubScreenshot) return;
    if (newNoteScreenshots.length >= 4) {
      setHubScreenshotNotice("Maximum 4 screenshots per note.");
      setTimeout(() => setHubScreenshotNotice(null), 3500);
      return;
    }
    setIsCapturingHubScreenshot(true);
    setHubScreenshotNotice(null);
    const result = await captureScreenScreenshot();
    setIsCapturingHubScreenshot(false);
    if (result.dataUrl) {
      setNewNoteScreenshots(prev => [...prev, result.dataUrl!].slice(0, 4));
    } else if (result.error) {
      setHubScreenshotNotice(result.error);
      setTimeout(() => setHubScreenshotNotice(null), 6000);
    }
  };

  const handleUploadHubScreenshotFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setHubScreenshotNotice(null);
    const remaining = Math.max(0, 4 - newNoteScreenshots.length);
    const added: string[] = [];
    for (let i = 0; i < Math.min(files.length, remaining); i += 1) {
      try {
        const dataUrl = await readImageFileAsDataUrl(files[i]);
        added.push(dataUrl);
      } catch {
        // Ignore non-image files
      }
    }
    if (added.length > 0) {
      setNewNoteScreenshots(prev => [...prev, ...added].slice(0, 4));
    }
  };

  const handleHubFormPaste = async (e: React.ClipboardEvent) => {
    const pasted = await extractImagesFromClipboardEvent(e);
    if (pasted.length > 0) {
      e.preventDefault();
      setHubScreenshotNotice(null);
      setNewNoteScreenshots(prev => [...prev, ...pasted].slice(0, 4));
    }
  };

  const handleCreateManualNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const isQA = newNoteCategory === "qa";
    const isDefinition = newNoteCategory === "definition";
    const isUrl = newNoteCategory === "url";
    const hasScreenshots = newNoteScreenshots.length > 0;
    if (isQA) {
      if ((!newNoteQuestion.trim() || !newNoteAnswer.trim()) && !hasScreenshots) return;
    } else if (isDefinition) {
      if ((!newNoteTerm.trim() || !newNoteDefinition.trim()) && !hasScreenshots) return;
    } else if (isUrl) {
      if (!newNoteUrl.trim() || !isSafeHttpUrl(newNoteUrl)) {
        setAiNotice("Please enter a valid http:// or https:// URL.");
        setTimeout(() => setAiNotice(null), 4000);
        return;
      }
    } else if ((!newNoteTitle.trim() || !newNoteContent.trim()) && !hasScreenshots) {
      return;
    }

    const terms = newNoteKeyTerms
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    const trimmedQuestion = newNoteQuestion.trim() || (isQA && hasScreenshots ? "Screenshot Question" : "");
    const trimmedAnswer = newNoteAnswer.trim() || (isQA && hasScreenshots ? "See attached screenshot" : "");
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

    const markLoginRequired = isUrl && (newNoteRequiresLogin || (isLikelyLoginProtectedUrl(trimmedUrl) && !trimmedUrlContext));

    const noteId = "note_" + Date.now();
    const note: StudyArtifactNote = {
      id: noteId,
      title: isQA
        ? trimmedQuestion
        : isDefinition
        ? trimmedTerm
        : isUrl
        ? (newNoteTitle.trim() || defaultUrlTitle)
        : (newNoteTitle.trim() || "Screenshot Note"),
      category: newNoteCategory,
      content: isQA
        ? `Q: ${trimmedQuestion}\n\nA: ${trimmedAnswer}${trimmedExplanation ? `\n\nExplanation: ${trimmedExplanation}` : ""}`
        : isDefinition
        ? `${trimmedTerm}: ${trimmedDefinition}`
        : isUrl
        ? (trimmedUrlContext ? `${trimmedUrl}\n\n${trimmedUrlContext}` : trimmedUrl)
        : (newNoteContent.trim() || "Attached screenshot"),
      question: isQA ? trimmedQuestion : undefined,
      answer: isQA ? trimmedAnswer : undefined,
      explanation: isQA && trimmedExplanation ? trimmedExplanation : undefined,
      term: isDefinition ? trimmedTerm : undefined,
      definition: isDefinition ? trimmedDefinition : undefined,
      url: isUrl ? trimmedUrl : undefined,
      urlNotes: isUrl && trimmedUrlContext ? trimmedUrlContext : undefined,
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
    setNewNoteTerm("");
    setNewNoteDefinition("");
    setNewNoteUrl("");
    setNewNoteUrlContext("");
    setNewNoteRequiresLogin(false);
    setNewNoteKeyTerms("");
    setNewNoteChapter("");
    setNewNoteScreenshots([]);
    setHubScreenshotNotice(null);
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
    } else if (isUrl && markLoginRequired) {
      setAiNotice("Link saved! I'll remind you to go study this link when studying, reviewing, or testing.");
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
    const copyText = note.question && note.answer
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

  // 4. Test Runner Flow
  const startTest = (test: KnowledgeTestArtifact) => {
    setActiveTest(test);
    setCurrentQuestionIndex(0);
    setSelectedOptionIndex(null);
    setIsAnswerSubmitted(false);
    setTestUserAnswers({});
    setIsTestCompleted(false);
  };

  const handleSelectOption = (optIndex: number) => {
    if (isAnswerSubmitted) return;
    setSelectedOptionIndex(optIndex);
  };

  const handleSubmitQuestionAnswer = () => {
    if (selectedOptionIndex === null || !activeTest) return;
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
      setIsAnswerSubmitted(false);
    } else {
      // Complete test & calculate score
      finishTest();
    }
  };

  const finishTest = () => {
    if (!activeTest) return;
    let correctCount = 0;
    activeTest.questions.forEach((q, idx) => {
      const userChoice = testUserAnswers[idx] !== undefined ? testUserAnswers[idx] : selectedOptionIndex;
      if (userChoice === q.correctIndex) {
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

    setActiveTest(updatedTest);
    setIsTestCompleted(true);
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

  const filteredNotes = selectedNoteCategory === "all" 
    ? currentHub.notes 
    : currentHub.notes.filter(n => n.category === selectedNoteCategory);

  const totalFlashcards = currentHub.flashcards.length;
  const masteredFlashcards = currentHub.flashcards.filter(f => f.mastered).length;
  const masteryScore = currentHub.overallMasteryScore || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl h-[92vh] max-h-[900px] flex flex-col bg-[#11131f] border border-violet-900/40 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-violet-900/30 bg-[#161828]/80 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/30">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Knowledge Tester & Study Material Notes Hub
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-medium">
                  {goal.name}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Technical cheat sheets, diagnostic assessment tests & active recall flashcard system
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Mastery Badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-950/60 border border-violet-700/40 text-xs font-semibold text-violet-200">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Mastery: <span className="text-amber-400 font-bold">{masteryScore}%</span></span>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              title="Close Hub"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global AI Action Notification Toast */}
        {aiNotice && (
          <div className="px-6 py-2 bg-gradient-to-r from-violet-900/90 to-indigo-900/90 border-b border-violet-500/40 text-xs text-violet-200 flex items-center gap-2 animate-fadeIn">
            <Sparkles className="w-4 h-4 text-violet-300 animate-spin" />
            <span className="font-medium">{aiNotice}</span>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center justify-between px-6 border-b border-violet-900/20 bg-[#141624]">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab("notes")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-all ${
                activeTab === "notes"
                  ? "border-violet-500 text-white bg-violet-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="w-4 h-4 text-violet-400" />
              <span>Study Notes & Artifacts</span>
              <span className="text-xs px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                {currentHub.notes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("tester")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-all ${
                activeTab === "tester"
                  ? "border-indigo-500 text-white bg-indigo-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Brain className="w-4 h-4 text-indigo-400" />
              <span>Knowledge Tester</span>
              <span className="text-xs px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                {currentHub.tests.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("flashcards")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-all ${
                activeTab === "flashcards"
                  ? "border-emerald-500 text-white bg-emerald-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Active Recall Cards</span>
              <span className="text-xs px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                {masteredFlashcards}/{totalFlashcards}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-all ${
                activeTab === "overview"
                  ? "border-amber-500 text-white bg-amber-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span>Mastery Stats</span>
            </button>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 py-2">
            {activeTab === "notes" && (
              <>
                <button
                  onClick={() => handleAIGenerateStudyNotes()}
                  disabled={isGeneratingNotes}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-medium text-white shadow-md shadow-violet-950/40 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isGeneratingNotes ? "Generating..." : "AI Generate Guide"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadingInNotes(!isUploadingInNotes);
                    setIsAddingNote(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                    isUploadingInNotes
                      ? "bg-cyan-600/30 border-cyan-400 text-white"
                      : "bg-cyan-600/15 hover:bg-cyan-600/25 border-cyan-500/35 text-cyan-200"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Upload Video / Text</span>
                </button>
                <button
                  onClick={() => {
                    setIsAddingNote(!isAddingNote);
                    setIsUploadingInNotes(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-slate-200 border border-white/10 flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Note</span>
                </button>
              </>
            )}

            {activeTab === "tester" && (
              <button
                onClick={() => handleAIGenerateTest()}
                disabled={isGeneratingTest}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-xs font-medium text-white shadow-md shadow-indigo-950/40 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{isGeneratingTest ? "Authoring..." : "AI Author Test"}</span>
              </button>
            )}

            {activeTab === "flashcards" && (
              <button
                onClick={() => setIsAddingFlashcard(!isAddingFlashcard)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white shadow-md shadow-emerald-950/40 flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Card</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body / Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0e101a]/95 custom-scrollbar">
          
          {/* TAB 1: STUDY NOTES & ARTIFACTS */}
          {activeTab === "notes" && (
            <div className="space-y-6">
              {/* Upload Downloaded Video & Transcript Panel */}
              {isUploadingInNotes && (
                <div
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter")) {
                      e.preventDefault();
                      if (!isExtractingUpload && (uploadedVideoFile || uploadedTranscriptFile || uploadedTranscriptText.trim())) {
                        void handleExtractFromUpload({ mode: "both", startGeneratedTest: false });
                      }
                    }
                  }}
                  className="p-5 rounded-xl bg-[#16192a] border border-cyan-700/45 shadow-xl space-y-4 animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-cyan-900/30 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Video className="w-4 h-4 text-cyan-400" />
                        Upload Downloaded Lecture Video &amp; Transcript Text
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Upload a downloaded Coursera/course video (.mp4, .mov, .webm) and optionally attach a subtitle file (.vtt, .srt, .txt) or paste text to generate notes, flashcards &amp; a quiz.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsUploadingInNotes(false)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {uploadError && (
                    <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200">
                      {uploadError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block p-3 rounded-lg bg-slate-900/80 border border-dashed border-cyan-600/45 hover:border-cyan-400/70 transition cursor-pointer">
                      <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5 mb-1">
                        <Video className="w-3.5 h-3.5" />
                        <span>Video / Audio File (Max 250 MB)</span>
                      </span>
                      <input
                        type="file"
                        accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.m4v,.mp3,.wav,.m4a"
                        onChange={e => setUploadedVideoFile(e.target.files?.[0] || null)}
                        className="sr-only"
                      />
                      <span className="text-xs text-slate-300 block truncate">
                        {uploadedVideoFile
                          ? `${uploadedVideoFile.name} (${(uploadedVideoFile.size / (1024 * 1024)).toFixed(1)} MB)`
                          : "Choose downloaded video (MP4, MOV, WebM, MKV)..."}
                      </span>
                    </label>

                    <label className="block p-3 rounded-lg bg-slate-900/80 border border-dashed border-slate-700 hover:border-violet-500/60 transition cursor-pointer">
                      <span className="text-xs font-semibold text-violet-300 flex items-center gap-1.5 mb-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Transcript / Subtitle File (Optional)</span>
                      </span>
                      <input
                        type="file"
                        accept=".txt,.vtt,.srt,.md,text/plain,text/vtt"
                        onChange={e => setUploadedTranscriptFile(e.target.files?.[0] || null)}
                        className="sr-only"
                      />
                      <span className="text-xs text-slate-300 block truncate">
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
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />

                  <textarea
                    rows={3}
                    placeholder="Optional: paste transcript, captions, or extra lesson text here..."
                    value={uploadedTranscriptText}
                    onChange={e => setUploadedTranscriptText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-[11px] text-slate-400 mr-auto hidden sm:inline">
                      Tip: Press Ctrl+Enter to save &amp; extract
                    </span>
                    <button
                      type="button"
                      disabled={isExtractingUpload || (!uploadedVideoFile && !uploadedTranscriptFile && !uploadedTranscriptText.trim())}
                      onClick={() => handleExtractFromUpload({ mode: "both", startGeneratedTest: false })}
                      title="Save Notes & Quiz (Ctrl + Enter)"
                      className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isExtractingUpload ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                      <span>{isExtractingUpload ? "Analyzing Lecture..." : "Save Notes & Quiz"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExtractingUpload || (!uploadedVideoFile && !uploadedTranscriptFile && !uploadedTranscriptText.trim())}
                      onClick={() => handleExtractFromUpload({ mode: "both", startGeneratedTest: true })}
                      className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isExtractingUpload ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                      <span>{isExtractingUpload ? "Building Quiz..." : "Extract & Test Me Now"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Add Note Collapsible Form */}
              {isAddingNote && (
                <form 
                  onSubmit={handleCreateManualNote}
                  onPaste={handleHubFormPaste}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter")) {
                      e.preventDefault();
                      if (!isExtractingUrl) {
                        e.currentTarget.requestSubmit();
                      }
                    }
                  }}
                  className="p-5 rounded-xl bg-[#16192a] border border-violet-800/40 shadow-xl space-y-4 animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-violet-900/30 pb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-violet-400" />
                      Create New Study Material Artifact
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsAddingNote(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {newNoteCategory !== "qa" && newNoteCategory !== "definition" && (
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-medium text-slate-300">
                          {newNoteCategory === "url" ? "Resource Title (Optional)" : "Artifact Title"}
                        </label>
                        <input
                          type="text"
                          placeholder={
                            newNoteCategory === "url"
                              ? "e.g. CompTIA Security+ DNS Lecture (auto-detected if blank)"
                              : "e.g. DNS Resolution Flow & Troubleshooting Protocol"
                          }
                          value={newNoteTitle}
                          onChange={e => setNewNoteTitle(e.target.value)}
                          required={newNoteCategory !== "url" && newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    )}

                    <div className={`space-y-1 ${newNoteCategory === "qa" || newNoteCategory === "definition" ? "md:col-span-3" : ""}`}>
                      <label className="text-xs font-medium text-slate-300">Category Type</label>
                      <select
                        value={newNoteCategory}
                        onChange={e => {
                          if (e.target.value === "video_upload") {
                            setIsAddingNote(false);
                            setIsUploadingInNotes(true);
                            return;
                          }
                          setNewNoteCategory(e.target.value as StudyArtifactNote["category"]);
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white focus:outline-none focus:border-violet-500"
                      >
                        <option value="concept">Concept Breakdown</option>
                        <option value="cheat_sheet">Cheat Sheet / Reference</option>
                        <option value="code_snippet">Code Snippet / Commands</option>
                        <option value="summary">Chapter Summary</option>
                        <option value="formula">Formula / Algorithm</option>
                        <option value="qa">Question &amp; Answer</option>
                        <option value="definition">Definition</option>
                        <option value="url">Video / Resource URL</option>
                        <option value="video_upload">Upload Video / Text</option>
                      </select>
                    </div>
                  </div>

                  {newNoteCategory === "qa" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Question</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Write your study question..."
                          value={newNoteQuestion}
                          onChange={e => setNewNoteQuestion(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-amber-700/40 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Answer</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Write the answer..."
                          value={newNoteAnswer}
                          onChange={e => setNewNoteAnswer(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-emerald-700/40 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-violet-400" />
                          <span>Answer Explanation (Optional)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Optional: explain why this answer is correct..."
                          value={newNoteExplanation}
                          onChange={e => setNewNoteExplanation(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  ) : newNoteCategory === "definition" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-sky-300 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Term / Concept</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Zero Trust Architecture"
                          value={newNoteTerm}
                          onChange={e => setNewNoteTerm(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-sky-700/40 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          <span>Definition</span>
                        </label>
                        <textarea
                          rows={4}
                          placeholder="Write the clear definition and any important context..."
                          value={newNoteDefinition}
                          onChange={e => setNewNoteDefinition(e.target.value)}
                          required={newNoteScreenshots.length === 0}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-emerald-700/40 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ) : newNoteCategory === "url" ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-cyan-300 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Video or Resource URL</span>
                        </label>
                        <input
                          type="url"
                          placeholder="https://www.youtube.com/watch?v=..., Coursera, Udemy, or docs URL"
                          value={newNoteUrl}
                          onChange={e => {
                            const val = e.target.value;
                            setNewNoteUrl(val);
                            if (isLikelyLoginProtectedUrl(val)) {
                              setNewNoteRequiresLogin(true);
                            }
                          }}
                          required
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-cyan-700/40 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newNoteRequiresLogin}
                          onChange={e => setNewNoteRequiresLogin(e.target.checked)}
                          className="rounded border-amber-500 text-amber-500 focus:ring-amber-500"
                        />
                        <span>Requires login (remind me to go study this link when studying, reviewing, or testing)</span>
                      </label>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-300">
                          Lesson Context or Transcript (Optional)
                        </label>
                        <textarea
                          rows={3}
                          placeholder="Optional: paste key takeaways or transcript so I can extract notes & quiz questions for login-protected lessons."
                          value={newNoteUrlContext}
                          onChange={e => setNewNoteUrlContext(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      {(!newNoteRequiresLogin || newNoteUrlContext.trim().length > 0) && (
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={extractOnHubUrlSave}
                            onChange={e => setExtractOnHubUrlSave(e.target.checked)}
                            className="rounded border-slate-600 text-violet-600 focus:ring-violet-500"
                          />
                          <span>Extract AI study notes, flashcards &amp; quiz questions from this link</span>
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300">Content (Markdown Supported)</label>
                      <textarea
                        rows={5}
                        placeholder="Write structured notes, bullet points, key equations, or code syntax..."
                        value={newNoteContent}
                        onChange={e => setNewNoteContent(e.target.value)}
                        required={newNoteScreenshots.length === 0}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 font-mono text-xs"
                      />
                    </div>
                  )}

                  {/* Screenshot Capture & Paste Strip (All Note Types) */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTakeHubScreenshot}
                          disabled={isCapturingHubScreenshot || newNoteScreenshots.length >= 4}
                          className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-violet-950/60 border border-slate-700/70 hover:border-violet-500/60 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                          title="Capture a screenshot of your screen, window, or browser tab"
                        >
                          {isCapturingHubScreenshot ? (
                            <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                          ) : (
                            <Camera className="w-3.5 h-3.5 text-violet-400" />
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
                          disabled={newNoteScreenshots.length >= 4}
                          className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 text-xs font-medium text-slate-300 inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        >
                          <ImagePlus className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Attach Image</span>
                        </button>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {newNoteScreenshots.length > 0
                          ? `${newNoteScreenshots.length}/4 screenshots attached`
                          : "or press Ctrl+V to paste screenshot"}
                      </span>
                    </div>

                    {hubScreenshotNotice && (
                      <div className="px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-500/35 text-xs text-amber-200">
                        {hubScreenshotNotice}
                      </div>
                    )}

                    {newNoteScreenshots.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {newNoteScreenshots.map((src, idx) => (
                          <div key={`${idx}_${src.slice(0, 32)}`} className="relative group rounded-lg overflow-hidden border border-slate-700 bg-black aspect-video">
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
                              className="absolute top-1 right-1 p-1 rounded-full bg-black/75 hover:bg-rose-600 text-white cursor-pointer"
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
                      <label className="text-xs font-medium text-slate-300">Key Terms (Comma separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. Recursive Query, Authoritative Server, TTL"
                        value={newNoteKeyTerms}
                        onChange={e => setNewNoteKeyTerms(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300">Linked Syllabus Chapter (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Chapter 3: Networking Fundamentals"
                        value={newNoteChapter}
                        onChange={e => setNewNoteChapter(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <span className="text-[11px] text-slate-400 mr-auto hidden sm:inline">
                      Tip: Press Ctrl+Enter to save
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingNote(false)}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isExtractingUrl}
                      title="Save (Ctrl + Enter)"
                      className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md shadow-violet-900/40"
                    >
                      {newNoteCategory === "url" && extractOnHubUrlSave && (!newNoteRequiresLogin || newNoteUrlContext.trim().length > 0)
                        ? "Save & Extract from URL"
                        : "Save Study Artifact"}
                    </button>
                  </div>
                </form>
              )}

              {/* Notes Filter Category Bar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                {["all", "concept", "cheat_sheet", "code_snippet", "summary", "formula", "qa", "definition", "url"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedNoteCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg capitalize font-medium whitespace-nowrap transition-all ${
                      selectedNoteCategory === cat
                        ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                        : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
                    }`}
                  >
                    {formatCategoryLabel(cat)}
                  </button>
                ))}
              </div>

              {/* Notes List */}
              {filteredNotes.length === 0 ? (
                <div className="text-center py-16 px-4 border border-dashed border-violet-900/30 rounded-2xl bg-violet-950/10">
                  <BookOpen className="w-12 h-12 text-violet-400/40 mx-auto mb-3" />
                  <h4 className="text-base font-semibold text-slate-200">No study material notes recorded yet</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
                    Click "AI Generate Guide" to automatically draft high-yield concepts tailored to this goal, or click "Add Note" to write your own cheat sheets.
                  </p>
                  <button
                    onClick={() => handleAIGenerateStudyNotes()}
                    disabled={isGeneratingNotes}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-xs font-medium text-white shadow-lg shadow-violet-900/30 inline-flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Generate Instant Study Guide</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredNotes.map((note) => (
                    <div
                      key={note.id}
                      className="p-5 rounded-xl bg-[#141727] border border-violet-900/30 hover:border-violet-700/50 transition-all flex flex-col justify-between group shadow-lg"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold border ${
                              note.category === "qa"
                                ? "bg-amber-900/40 text-amber-300 border-amber-700/30"
                                : note.category === "definition"
                                ? "bg-sky-900/40 text-sky-300 border-sky-700/30"
                                : note.category === "url"
                                ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/30"
                                : "bg-violet-900/40 text-violet-300 border-violet-700/30"
                            }`}>
                              {formatCategoryLabel(note.category)}
                            </span>
                            {note.chapterTitle && (
                              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                                {note.chapterTitle}
                              </span>
                            )}
                            {note.sourceFileName && (
                              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-700/35">
                                {note.sourceFileName}
                              </span>
                            )}
                            {!(
                              (note.category === "qa" || (note.question && note.answer)) &&
                              note.title === (note.question || note.title)
                            ) &&
                              !(
                                (note.category === "definition" || (note.term && note.definition)) &&
                                note.title === (note.term || note.title)
                              ) && (
                                <h4 className="text-base font-bold text-white mt-2 leading-snug">
                                  {note.title}
                                </h4>
                              )}
                          </div>

                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleCopyNoteContent(note)}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                              title="Copy to clipboard"
                            >
                              {copiedNoteId === note.id ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Delete note"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Note Body */}
                        {note.category === "qa" || (note.question && note.answer) ? (
                          <div className="space-y-2.5">
                            <div className="bg-amber-950/30 p-3 rounded-lg border border-amber-800/30 space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                                <HelpCircle className="w-3 h-3" />
                                Question
                              </span>
                              <p className="text-xs text-slate-100 whitespace-pre-line leading-relaxed">
                                {note.question || note.title}
                              </p>
                            </div>
                            <div className="bg-emerald-950/25 p-3 rounded-lg border border-emerald-800/30 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
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
                                  className="text-[10px] font-semibold text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
                                >
                                  {hiddenQaNoteAnswers[note.id] ? "Show Answer" : "Hide Answer"}
                                </button>
                              </div>
                              {hiddenQaNoteAnswers[note.id] ? (
                                <p className="text-xs italic text-slate-400">
                                  Answer hidden for active recall. Click "Show Answer" to reveal.
                                </p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                  <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                                    {note.answer || note.content}
                                  </p>
                                  {note.explanation && (
                                    <div className="pt-2 border-t border-emerald-800/30 space-y-1">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300 block">
                                        Explanation
                                      </span>
                                      <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
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
                            <div className="bg-sky-950/30 p-3 rounded-lg border border-sky-800/30 space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1">
                                <BookOpen className="w-3 h-3" />
                                Term
                              </span>
                              <p className="text-xs font-semibold text-slate-100 whitespace-pre-line leading-relaxed">
                                {note.term || note.title}
                              </p>
                            </div>
                            <div className="bg-emerald-950/25 p-3 rounded-lg border border-emerald-800/30 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
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
                                  className="text-[10px] font-semibold text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
                                >
                                  {hiddenQaNoteAnswers[note.id] ? "Show Definition" : "Hide Definition"}
                                </button>
                              </div>
                              {hiddenQaNoteAnswers[note.id] ? (
                                <p className="text-xs italic text-slate-400">
                                  Definition hidden for active recall. Click "Show Definition" to reveal.
                                </p>
                              ) : (
                                <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                                  {note.definition || note.content}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : note.category === "url" && note.url && isSafeHttpUrl(note.url) ? (
                          <div className="space-y-2.5">
                            {note.requiresLogin && (
                              <div className={`p-2.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                                note.reviewCompleted
                                  ? "bg-emerald-950/30 border-emerald-700/35 text-emerald-200"
                                  : "bg-amber-950/35 border-amber-700/40 text-amber-200"
                              }`}>
                                <span>
                                  {note.reviewCompleted
                                    ? `Studied${note.studyCount ? ` (${note.studyCount}x)` : ""} — ready for next review`
                                    : "Study / Review Assignment — login required"}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded font-semibold uppercase text-[9px] shrink-0 ${
                                  note.reviewCompleted
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-amber-500/20 text-amber-300"
                                }`}>
                                  {note.reviewCompleted ? "Studied ✓" : "Assigned"}
                                </span>
                              </div>
                            )}
                            <a
                              href={note.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 p-3 rounded-lg bg-cyan-950/30 border border-cyan-800/40 text-xs text-cyan-300 hover:text-cyan-200 hover:border-cyan-600/60 transition-colors"
                            >
                              <span className="truncate font-mono">{note.url}</span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            </a>
                            {note.urlNotes && (
                              <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto pr-1 custom-scrollbar bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                                {note.urlNotes}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {note.requiresLogin && (
                                <>
                                  <a
                                    href={note.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                                  >
                                    <span>{note.reviewCompleted ? "Review Link" : "Go Study Link"}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLinkAssignment(note.id)}
                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                      note.reviewCompleted
                                        ? "bg-emerald-950/60 border-emerald-700/40 text-emerald-300 hover:bg-slate-900 hover:text-slate-200"
                                        : "bg-slate-900 border-slate-700 text-slate-200 hover:border-emerald-600/50 hover:text-emerald-300"
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>{note.reviewCompleted ? "Assign Again" : "Mark Studied"}</span>
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
                                  className="px-2.5 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/35 border border-violet-500/30 text-violet-200 text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <Sparkles className="w-3 h-3 text-amber-300" />
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
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/40 border border-indigo-500/35 text-indigo-200 text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                <Brain className="w-3 h-3 text-indigo-300" />
                                <span>Test Me from Link</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-56 overflow-y-auto pr-1 custom-scrollbar bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                            {note.content}
                          </div>
                        )}

                        {/* Attached Screenshots */}
                        {note.screenshots && note.screenshots.length > 0 && (
                          <div className={`grid gap-2 pt-1 ${note.screenshots.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                            {note.screenshots.map((src, sIdx) => (
                              <button
                                key={`${note.id}_ss_${sIdx}`}
                                type="button"
                                onClick={() => setLightboxScreenshotUrl(src)}
                                className="relative group rounded-lg overflow-hidden border border-slate-800 hover:border-violet-500/60 bg-black/50 transition-colors cursor-zoom-in"
                                title="Click to view screenshot full size"
                              >
                                <img
                                  src={src}
                                  alt={`${note.title} screenshot ${sIdx + 1}`}
                                  className="w-full max-h-44 object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Key Terms */}
                        {note.keyTerms && note.keyTerms.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {note.keyTerms.map((term, tIdx) => (
                              <span
                                key={tIdx}
                                className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/50 text-indigo-300 border border-indigo-800/30"
                              >
                                #{term}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-500 pt-3 border-t border-slate-800/50 flex items-center justify-between mt-3">
                        <span>Updated: {new Date(note.updatedAt).toLocaleDateString()}</span>
                        <span className="text-slate-400 font-mono">ID: {note.id.slice(-6)}</span>
                      </div>
                    </div>
                  ))}
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
                  <div className="flex items-center justify-between p-4 rounded-xl bg-[#161828] border border-indigo-900/40">
                    <div>
                      <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                        Active Diagnostic Assessment
                      </span>
                      <h3 className="text-lg font-bold text-white">{activeTest.title}</h3>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs text-slate-400">Progress</span>
                        <p className="text-sm font-bold text-indigo-300">
                          Question {currentQuestionIndex + 1} of {activeTest.questions.length}
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTest(null)}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                      >
                        Exit Test
                      </button>
                    </div>
                  </div>

                  {/* Test Finished Score Card */}
                  {isTestCompleted ? (
                    <div className="p-8 rounded-2xl bg-gradient-to-b from-[#1b1c35] to-[#121324] border border-indigo-500/40 text-center space-y-6 shadow-2xl">
                      <div className="w-20 h-20 mx-auto rounded-full bg-indigo-500/20 border-2 border-indigo-400 flex items-center justify-center text-indigo-300">
                        <Award className="w-10 h-10" />
                      </div>

                      <div>
                        <h4 className="text-2xl font-bold text-white">Assessment Complete!</h4>
                        <p className="text-sm text-slate-300 mt-1">
                          Diagnostic knowledge evaluation recorded for {goal.name}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                          <span className="text-xs text-slate-400">Final Score</span>
                          <p className="text-2xl font-bold text-emerald-400">{activeTest.lastScore}%</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                          <span className="text-xs text-slate-400">Correct</span>
                          <p className="text-2xl font-bold text-indigo-300">{activeTest.lastScoreFraction}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                          <span className="text-xs text-slate-400">Mastery</span>
                          <p className="text-sm font-bold text-amber-400 mt-1">
                            {(activeTest.lastScore || 0) >= 80 ? "Distinction" : (activeTest.lastScore || 0) >= 60 ? "Proficient" : "Needs Review"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-3 pt-4">
                        <button
                          onClick={() => startTest(activeTest)}
                          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-900/40 inline-flex items-center gap-2"
                        >
                          <RotateCw className="w-4 h-4" />
                          <span>Retake Assessment</span>
                        </button>
                        <button
                          onClick={() => setActiveTest(null)}
                          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                        >
                          Back to Test Bank
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Active Question Card */
                    <div className="p-6 rounded-2xl bg-[#141727] border border-indigo-900/30 space-y-6 shadow-xl">
                      {(() => {
                        const q = activeTest.questions[currentQuestionIndex];
                        return (
                          <>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-indigo-400">
                                  Question {currentQuestionIndex + 1}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-semibold tracking-wider ${
                                  q.difficulty === "hard" 
                                    ? "bg-rose-950/60 text-rose-300 border border-rose-800/40"
                                    : q.difficulty === "medium"
                                    ? "bg-amber-950/60 text-amber-300 border border-amber-800/40"
                                    : "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40"
                                }`}>
                                  {q.difficulty || "medium"}
                                </span>
                              </div>
                              <h4 className="text-base sm:text-lg font-semibold text-white leading-relaxed">
                                {q.question}
                              </h4>
                            </div>

                            {/* Multiple Choice Options */}
                            <div className="space-y-2.5">
                              {q.options.map((option, optIdx) => {
                                const isSelected = selectedOptionIndex === optIdx;
                                const isCorrect = optIdx === q.correctIndex;
                                
                                let btnClasses = "w-full text-left p-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-between ";

                                if (!isAnswerSubmitted) {
                                  btnClasses += isSelected
                                    ? "bg-indigo-600/20 border-indigo-500 text-white shadow-md shadow-indigo-900/30"
                                    : "bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-600 hover:bg-slate-900";
                                } else {
                                  if (isCorrect) {
                                    btnClasses += "bg-emerald-950/70 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-950/40";
                                  } else if (isSelected && !isCorrect) {
                                    btnClasses += "bg-rose-950/70 border-rose-500 text-rose-200 shadow-md shadow-rose-950/40";
                                  } else {
                                    btnClasses += "bg-slate-900/40 border-slate-800/40 text-slate-500 opacity-60";
                                  }
                                }

                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() => handleSelectOption(optIdx)}
                                    disabled={isAnswerSubmitted}
                                    className={btnClasses}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="w-6 h-6 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xs font-mono font-bold">
                                        {String.fromCharCode(65 + optIdx)}
                                      </span>
                                      <span>{option}</span>
                                    </div>

                                    {isAnswerSubmitted && (
                                      <div>
                                        {isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                                        {isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-400" />}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Explanation Card after submission */}
                            {isAnswerSubmitted && (
                              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-700/30 space-y-2 animate-fadeIn">
                                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                                  <Lightbulb className="w-4 h-4 text-amber-300" />
                                  <span>Explanation & Concept Application</span>
                                </div>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                  {q.explanation}
                                </p>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-2">
                              {!isAnswerSubmitted ? (
                                <button
                                  onClick={handleSubmitQuestionAnswer}
                                  disabled={selectedOptionIndex === null}
                                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-900/40 disabled:opacity-50 transition-all ml-auto"
                                >
                                  Submit Answer
                                </button>
                              ) : (
                                <button
                                  onClick={handleNextQuestion}
                                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-900/40 inline-flex items-center gap-2 ml-auto"
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
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-white">Diagnostic Knowledge Assessments</h3>
                      <p className="text-xs text-slate-400">
                        Exam-ready multiple choice tests with instant answers and rationale explanations.
                      </p>
                    </div>

                    <button
                      onClick={() => handleAIGenerateTest()}
                      disabled={isGeneratingTest}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-xs font-medium text-white shadow-lg shadow-indigo-900/30 inline-flex items-center gap-2 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>{isGeneratingTest ? "Authoring Test..." : "Generate New Test"}</span>
                    </button>
                  </div>

                  {/* Assigned Links for Study & Review in Tester */}
                  {(loginPromptLink || loginStudyLinks.length > 0) && (() => {
                    const pendingCount = loginStudyLinks.filter(l => !l.reviewCompleted).length;
                    return (
                      <div className="p-4 rounded-xl bg-amber-950/25 border border-amber-600/40 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <Link2 className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-semibold text-amber-200">
                                  {loginPromptLink
                                    ? `Study Assignment: "${loginPromptLink.title}"`
                                    : "Assigned Links to Study & Review"}
                                </h4>
                                {loginStudyLinks.length > 0 && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                    pendingCount > 0
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  }`}>
                                    {pendingCount > 0 ? `${pendingCount} pending` : "All studied ✓"}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-300 mt-0.5">
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
                                className="text-[11px] font-medium text-amber-300 hover:text-amber-200 underline cursor-pointer whitespace-nowrap"
                              >
                                Re-assign all
                              </button>
                            )}
                            {loginPromptLink && (
                              <button
                                type="button"
                                onClick={() => setLoginPromptLink(null)}
                                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
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
                              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
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
                                    ? "bg-emerald-950/20 border-emerald-700/35"
                                    : "bg-slate-900/75 border-amber-700/30"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleToggleLinkAssignment(linkNote.id)}
                                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                                >
                                  <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                                    linkNote.reviewCompleted
                                      ? "bg-emerald-500 border-emerald-500 text-white"
                                      : "border-amber-400/60 group-hover:border-amber-300"
                                  }`}>
                                    {linkNote.reviewCompleted && <Check className="w-3 h-3" />}
                                  </span>
                                  <span className={`text-xs font-medium truncate ${
                                    linkNote.reviewCompleted ? "line-through text-slate-400" : "text-slate-100"
                                  }`}>
                                    {linkNote.title}
                                  </span>
                                  {(linkNote.studyCount || 0) > 0 && (
                                    <span className="text-[10px] text-slate-400 shrink-0">
                                      Studied {linkNote.studyCount}x
                                    </span>
                                  )}
                                </button>

                                <a
                                  href={linkNote.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
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
                  <div className="p-4 rounded-xl bg-[#141727] border border-cyan-800/35 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {sourceTesterMode === "upload" ? (
                          <Video className="w-4 h-4 text-cyan-400 shrink-0" />
                        ) : (
                          <Link2 className="w-4 h-4 text-cyan-400 shrink-0" />
                        )}
                        <h4 className="text-sm font-semibold text-white">
                          {sourceTesterMode === "upload"
                            ? "Test Me from Downloaded Video & Text"
                            : "Test Me from Video or Resource URL"}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setSourceTesterMode("upload")}
                          className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                            sourceTesterMode === "upload"
                              ? "bg-cyan-600 text-white"
                              : "text-slate-400 hover:text-slate-200"
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
                              ? "bg-cyan-600 text-white"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Link2 className="w-3 h-3" />
                          <span>From URL</span>
                        </button>
                      </div>
                    </div>

                    {sourceTesterMode === "upload" ? (
                      <div className="space-y-2.5">
                        <p className="text-[11px] text-slate-400">
                          Downloaded a Coursera or course video? Upload the video (.mp4, .mov, .webm) and/or attach a transcript (.txt, .vtt, .srt) or paste lesson text to generate study notes &amp; test questions directly from it.
                        </p>

                        {uploadError && (
                          <p className="text-xs text-rose-300 bg-rose-950/35 border border-rose-500/35 rounded-lg px-3 py-2">
                            {uploadError}
                          </p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <label className="block p-2.5 rounded-lg bg-slate-900/80 border border-dashed border-cyan-600/45 hover:border-cyan-400/75 transition cursor-pointer">
                            <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5 mb-0.5">
                              <Video className="w-3.5 h-3.5" />
                              <span>Downloaded Video / Audio</span>
                            </span>
                            <input
                              type="file"
                              accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.m4v,.mp3,.wav,.m4a"
                              onChange={e => setUploadedVideoFile(e.target.files?.[0] || null)}
                              className="sr-only"
                            />
                            <span className="text-[11px] text-slate-300 block truncate">
                              {uploadedVideoFile
                                ? `${uploadedVideoFile.name} (${(uploadedVideoFile.size / (1024 * 1024)).toFixed(1)} MB)`
                                : "Select MP4, MOV, WebM, MKV, or MP3 (up to 250 MB)"}
                            </span>
                          </label>

                          <label className="block p-2.5 rounded-lg bg-slate-900/80 border border-dashed border-slate-700 hover:border-violet-500/60 transition cursor-pointer">
                            <span className="text-[11px] font-semibold text-violet-300 flex items-center gap-1.5 mb-0.5">
                              <FileText className="w-3.5 h-3.5" />
                              <span>Transcript / Subtitle File (Optional)</span>
                            </span>
                            <input
                              type="file"
                              accept=".txt,.vtt,.srt,.md,text/plain,text/vtt"
                              onChange={e => setUploadedTranscriptFile(e.target.files?.[0] || null)}
                              className="sr-only"
                            />
                            <span className="text-[11px] text-slate-300 block truncate">
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
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />

                        <textarea
                          rows={2}
                          placeholder="Optional: paste lecture transcript or text notes to combine with your video..."
                          value={uploadedTranscriptText}
                          onChange={e => setUploadedTranscriptText(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400">
                            Saves study notes, flashcards &amp; test to this goal
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isExtractingUpload || (!uploadedVideoFile && !uploadedTranscriptFile && !uploadedTranscriptText.trim())}
                              onClick={() => handleExtractFromUpload({ mode: "both", startGeneratedTest: true })}
                              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
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
                            className="flex-1 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
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
                            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
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
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />

                        {currentHub.notes.some(n => n.category === "url" && n.url && isSafeHttpUrl(n.url)) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-[11px] text-slate-400">Saved links:</span>
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
                                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-700/50 text-xs text-cyan-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
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
                    <div className="text-center py-16 px-4 border border-dashed border-indigo-900/30 rounded-2xl bg-indigo-950/10">
                      <Brain className="w-12 h-12 text-indigo-400/40 mx-auto mb-3" />
                      <h4 className="text-base font-semibold text-slate-200">No knowledge assessments created yet</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
                        Author comprehensive diagnostic test batteries to verify your retention before moving to subsequent syllabus modules.
                      </p>
                      <button
                        onClick={() => handleAIGenerateTest()}
                        disabled={isGeneratingTest}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-900/40 inline-flex items-center gap-2"
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
                          className="p-5 rounded-xl bg-[#141727] border border-indigo-900/30 hover:border-indigo-600/50 transition-all flex flex-col justify-between shadow-lg"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="text-base font-bold text-white">{test.title}</h4>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {test.chapterTitle && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 inline-block">
                                      {test.chapterTitle}
                                    </span>
                                  )}
                                  {test.sourceFileName && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-700/35 inline-block">
                                      {test.sourceFileName}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {test.lastScore !== undefined && (
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400">Last Score</span>
                                  <p className="text-sm font-bold text-emerald-400">
                                    {test.lastScore}% ({test.lastScoreFraction})
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-400 py-1">
                              <span>{test.questions.length} Questions</span>
                              <span>•</span>
                              <span>{test.attemptsCount || 0} Attempts</span>
                              <span>•</span>
                              <span>{new Date(test.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-800 flex items-center justify-between mt-3">
                            <button
                              onClick={() => {
                                saveHub({
                                  ...currentHub,
                                  tests: currentHub.tests.filter(t => t.id !== test.id)
                                });
                              }}
                              className="text-xs text-slate-500 hover:text-rose-400"
                            >
                              Delete
                            </button>

                            <button
                              onClick={() => startTest(test)}
                              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-950/40 inline-flex items-center gap-1.5"
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
                  <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-600/35 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Link2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-semibold text-cyan-200">
                              Link Study &amp; Review Assignments
                            </h4>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              pendingReviewCount > 0
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            }`}>
                              {pendingReviewCount > 0 ? `${pendingReviewCount} to review` : "All reviewed ✓"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-0.5">
                            Login-required lessons — open to review directly, then check them off:
                          </p>
                        </div>
                      </div>
                      {pendingReviewCount === 0 && (
                        <button
                          type="button"
                          onClick={handleResetAllLinkAssignments}
                          className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 underline cursor-pointer whitespace-nowrap shrink-0"
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
                              ? "bg-emerald-950/20 border-emerald-700/35"
                              : "bg-slate-900/75 border-cyan-700/35"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleLinkAssignment(linkNote.id)}
                            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                          >
                            <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                              linkNote.reviewCompleted
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "border-cyan-400/60 group-hover:border-cyan-300"
                            }`}>
                              {linkNote.reviewCompleted && <Check className="w-3 h-3" />}
                            </span>
                            <span className={`text-xs font-medium truncate ${
                              linkNote.reviewCompleted ? "line-through text-slate-400" : "text-slate-100"
                            }`}>
                              {linkNote.title}
                            </span>
                          </button>

                          <a
                            href={linkNote.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
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
                  className="p-5 rounded-xl bg-[#16192a] border border-emerald-800/40 space-y-4 shadow-xl animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-emerald-900/30 pb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      Add Active Recall Flashcard
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsAddingFlashcard(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-300">Front (Prompt / Term)</label>
                    <input
                      type="text"
                      placeholder="e.g. What is the difference between TCP and UDP?"
                      value={newCardFront}
                      onChange={e => setNewCardFront(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-300">Back (Answer / Definition)</label>
                    <textarea
                      rows={3}
                      placeholder="e.g. TCP provides guaranteed ordered packet delivery; UDP provides low-latency connectionless transport."
                      value={newCardBack}
                      onChange={e => setNewCardBack(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingFlashcard(false)}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-900/40"
                    >
                      Save Flashcard
                    </button>
                  </div>
                </form>
              )}

              {/* Flashcard Viewer */}
              {totalFlashcards === 0 ? (
                <div className="text-center py-16 px-4 border border-dashed border-emerald-900/30 rounded-2xl bg-emerald-950/10">
                  <Layers className="w-12 h-12 text-emerald-400/40 mx-auto mb-3" />
                  <h4 className="text-base font-semibold text-slate-200">No flashcards in this deck yet</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
                    Click "AI Generate Guide" in the notes tab to auto-populate cards, or click "New Card" to create your own recall cards.
                  </p>
                  <button
                    onClick={() => setIsAddingFlashcard(true)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-900/40 inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Card</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Progress Header */}
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Card {currentFlashcardIndex + 1} of {totalFlashcards}
                    </span>
                    <span className="font-semibold text-emerald-400">
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
                        className={`min-h-[260px] p-8 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col justify-between shadow-2xl relative select-none ${
                          isCardFlipped
                            ? "bg-[#181d33] border-emerald-500/50 shadow-emerald-950/20"
                            : "bg-[#141727] border-violet-900/40 hover:border-violet-700/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono uppercase font-bold tracking-wider ${
                            isCardFlipped 
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800" 
                              : "bg-violet-950 text-violet-300 border border-violet-800"
                          }`}>
                            {isCardFlipped ? "ANSWER / BACK" : "QUESTION / FRONT"}
                          </span>

                          {card.mastered && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Mastered</span>
                            </span>
                          )}
                        </div>

                        <div className="my-auto py-6 text-center">
                          <p className="text-lg sm:text-xl font-medium text-white leading-relaxed">
                            {isCardFlipped ? card.back : card.front}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-800/60">
                          <span>Click card to flip</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFlashcard(card.id);
                            }}
                            className="text-slate-500 hover:text-rose-400"
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
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 disabled:opacity-40"
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
                              ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800"
                              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40"
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
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 disabled:opacity-40"
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
              <div className="p-6 rounded-2xl bg-gradient-to-r from-violet-950/60 via-[#181b33] to-indigo-950/60 border border-violet-800/40 shadow-xl flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-violet-400">
                    Comprehensive Mastery Index
                  </span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    {goal.name} Knowledge Hub
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md">
                    Calculated from diagnostic test scores, active recall cards mastered, and study note artifacts.
                  </p>
                </div>

                <div className="text-center p-4 rounded-xl bg-black/40 border border-white/10 min-w-[120px]">
                  <span className="text-3xl font-black text-amber-400">{masteryScore}%</span>
                  <span className="block text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                    Mastery Rating
                  </span>
                </div>
              </div>

              {/* Metric Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-xl bg-[#141727] border border-violet-900/30">
                  <div className="flex items-center gap-2 text-violet-400 mb-2">
                    <FileText className="w-5 h-5" />
                    <span className="text-xs font-semibold uppercase">Study Notes</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{currentHub.notes.length}</p>
                  <span className="text-xs text-slate-400 mt-1 block">Artifacts compiled</span>
                </div>

                <div className="p-5 rounded-xl bg-[#141727] border border-indigo-900/30">
                  <div className="flex items-center gap-2 text-indigo-400 mb-2">
                    <Brain className="w-5 h-5" />
                    <span className="text-xs font-semibold uppercase">Assessments</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{currentHub.tests.length}</p>
                  <span className="text-xs text-slate-400 mt-1 block">Tests created</span>
                </div>

                <div className="p-5 rounded-xl bg-[#141727] border border-emerald-900/30">
                  <div className="flex items-center gap-2 text-emerald-400 mb-2">
                    <Layers className="w-5 h-5" />
                    <span className="text-xs font-semibold uppercase">Flashcards</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{masteredFlashcards}/{totalFlashcards}</p>
                  <span className="text-xs text-slate-400 mt-1 block">Cards mastered</span>
                </div>
              </div>

              {/* Target Exam or Milestone Details */}
              {(goal.targetExamTitle || goal.targetExamDate) && (
                <div className="p-5 rounded-xl bg-[#161a2f] border border-amber-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-300">
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-amber-300">
                        Target Certification Exam / Milestone
                      </span>
                      <h4 className="text-base font-bold text-white">
                        {goal.targetExamTitle || "Exam Assessment"}
                      </h4>
                      {goal.targetExamDate && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          Scheduled Target Date: <span className="text-white font-medium">{goal.targetExamDate}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase">Readiness</span>
                    <p className="text-sm font-bold text-emerald-400">
                      {masteryScore >= 75 ? "Exam Ready" : "In Training"}
                    </p>
                  </div>
                </div>
              )}

              {/* Chapters Progress Checklist */}
              {goal.chapters && goal.chapters.length > 0 && (
                <div className="p-5 rounded-xl bg-[#141727] border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-violet-400" />
                    Syllabus Chapters ({goal.chapters.filter(c => c.completed).length}/{goal.chapters.length} Completed)
                  </h4>
                  <div className="divide-y divide-slate-800">
                    {goal.chapters.map(ch => (
                      <div key={ch.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {ch.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-600" />
                          )}
                          <span className={ch.completed ? "text-slate-400 line-through" : "text-white font-medium"}>
                            {ch.title}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setActiveTab("notes");
                            handleAIGenerateStudyNotes(ch.title);
                          }}
                          className="text-violet-400 hover:text-violet-300 font-medium"
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
          className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-end gap-2"
          >
            <button
              type="button"
              onClick={() => setLightboxScreenshotUrl(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-white/15 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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
