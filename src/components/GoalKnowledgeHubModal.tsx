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
  Clock
} from "lucide-react";

interface GoalKnowledgeHubModalProps {
  goal: Goal;
  isOpen: boolean;
  onClose: () => void;
  onUpdateKnowledgeHub: (goalId: string, updatedHub: GoalKnowledgeHub) => void;
}

export const GoalKnowledgeHubModal: React.FC<GoalKnowledgeHubModalProps> = ({
  goal,
  isOpen,
  onClose,
  onUpdateKnowledgeHub
}) => {
  if (!isOpen) return null;

  // Initialize hub with default if empty
  const currentHub: GoalKnowledgeHub = goal.knowledgeHub || {
    notes: [],
    tests: [],
    flashcards: [],
    overallMasteryScore: 0
  };

  const [activeTab, setActiveTab] = useState<"notes" | "tester" | "flashcards" | "overview">("notes");
  const [selectedNoteCategory, setSelectedNoteCategory] = useState<string>("all");
  
  // Note creation modal/form state
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState<StudyArtifactNote["category"]>("concept");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteKeyTerms, setNewNoteKeyTerms] = useState("");
  const [newNoteChapter, setNewNoteChapter] = useState("");
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

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

  // 3. Note Management
  const handleCreateManualNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return;

    const terms = newNoteKeyTerms
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    const note: StudyArtifactNote = {
      id: "note_" + Date.now(),
      title: newNoteTitle.trim(),
      category: newNoteCategory,
      content: newNoteContent.trim(),
      chapterTitle: newNoteChapter.trim() || undefined,
      keyTerms: terms.length > 0 ? terms : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    saveHub({
      ...currentHub,
      notes: [note, ...currentHub.notes]
    });

    setNewNoteTitle("");
    setNewNoteContent("");
    setNewNoteKeyTerms("");
    setNewNoteChapter("");
    setIsAddingNote(false);
  };

  const handleDeleteNote = (noteId: string) => {
    saveHub({
      ...currentHub,
      notes: currentHub.notes.filter(n => n.id !== noteId)
    });
  };

  const handleCopyNoteContent = (note: StudyArtifactNote) => {
    navigator.clipboard.writeText(`${note.title}\n\n${note.content}`);
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
                  onClick={() => setIsAddingNote(!isAddingNote)}
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
              
              {/* Add Note Collapsible Form */}
              {isAddingNote && (
                <form 
                  onSubmit={handleCreateManualNote}
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
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-xs font-medium text-slate-300">Artifact Title</label>
                      <input
                        type="text"
                        placeholder="e.g. DNS Resolution Flow & Troubleshooting Protocol"
                        value={newNoteTitle}
                        onChange={e => setNewNoteTitle(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300">Category Type</label>
                      <select
                        value={newNoteCategory}
                        onChange={e => setNewNoteCategory(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white focus:outline-none focus:border-violet-500"
                      >
                        <option value="concept">Concept Breakdown</option>
                        <option value="cheat_sheet">Cheat Sheet / Reference</option>
                        <option value="code_snippet">Code Snippet / Commands</option>
                        <option value="summary">Chapter Summary</option>
                        <option value="formula">Formula / Algorithm</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-300">Content (Markdown Supported)</label>
                    <textarea
                      rows={5}
                      placeholder="Write structured notes, bullet points, key equations, or code syntax..."
                      value={newNoteContent}
                      onChange={e => setNewNoteContent(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 font-mono text-xs"
                    />
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

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingNote(false)}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white shadow-md shadow-violet-900/40"
                    >
                      Save Study Artifact
                    </button>
                  </div>
                </form>
              )}

              {/* Notes Filter Category Bar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                {["all", "concept", "cheat_sheet", "code_snippet", "summary", "formula"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedNoteCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-all ${
                      selectedNoteCategory === cat
                        ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                        : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
                    }`}
                  >
                    {cat.replace("_", " ")}
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
                            <span className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold bg-violet-900/40 text-violet-300 border border-violet-700/30">
                              {note.category.replace("_", " ")}
                            </span>
                            {note.chapterTitle && (
                              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                                {note.chapterTitle}
                              </span>
                            )}
                            <h4 className="text-base font-bold text-white mt-2 leading-snug">
                              {note.title}
                            </h4>
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
                        <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-56 overflow-y-auto pr-1 custom-scrollbar bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                          {note.content}
                        </div>

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
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white">Diagnostic Knowledge Assessments</h3>
                      <p className="text-xs text-slate-400">
                        Exam-ready multiple choice tests with instant answers and rationale explanations.
                      </p>
                    </div>

                    <button
                      onClick={() => handleAIGenerateTest()}
                      disabled={isGeneratingTest}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-xs font-medium text-white shadow-lg shadow-indigo-900/30 inline-flex items-center gap-2 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>{isGeneratingTest ? "Authoring Test..." : "Generate New Test"}</span>
                    </button>
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
                                {test.chapterTitle && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 mt-1 inline-block">
                                    {test.chapterTitle}
                                  </span>
                                )}
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
    </div>
  );
};
