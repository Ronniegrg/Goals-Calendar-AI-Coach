import React, { useState, useEffect } from "react";
import { 
  Play, 
  Zap, 
  StickyNote, 
  Clock, 
  CheckCircle2, 
  X, 
  Edit3, 
  Check, 
  BookOpen, 
  Layers,
  Sparkles
} from "lucide-react";
import { Goal, CalendarEvent } from "../types";

export interface GoalStartBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: Goal;
  event?: CalendarEvent | null;
  isStudyAhead?: boolean;
  isReviewMode?: boolean;
  onConfirmStart: (note?: string, startAsReview?: boolean) => void;
  onUpdateGoalNote?: (goalId: string, updatedNote: string) => void;
  onUpdateStepNote?: (goalId: string, stepId: string, stepTitle: string, updatedNote: string) => void;
}

export default function GoalStartBriefingModal({
  isOpen,
  onClose,
  goal,
  event,
  isStudyAhead = false,
  isReviewMode = false,
  onConfirmStart,
  onUpdateGoalNote,
  onUpdateStepNote
}: GoalStartBriefingModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedNote, setEditedNote] = useState(goal.lastSessionNote || "");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editedStepText, setEditedStepText] = useState("");
  const [localStepNotes, setLocalStepNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    setEditedNote(goal.lastSessionNote || "");
    setIsEditing(false);
    setEditingStepId(null);
    setEditedStepText("");
    setLocalStepNotes({});
  }, [goal, isOpen]);

  if (!isOpen) return null;

  const noteText = editedNote.trim();
  const formattedDate = goal.lastSessionNoteDate 
    ? new Date(goal.lastSessionNoteDate).toLocaleDateString([], { 
        month: "short", 
        day: "numeric", 
        hour: "2-digit", 
        minute: "2-digit" 
      })
    : null;

  // Merge steps from goal.subtasks & goal.subSteps (deduped by id / normalized title)
  const mergedSteps: {
    id: string;
    index: number;
    title: string;
    durationMinutes?: number;
    completed?: boolean;
    carryoverNote?: string;
    carryoverNoteDate?: string;
  }[] = [];
  const seenKeys = new Set<string>();
  const rawCombined = [...(goal.subtasks || []), ...(goal.subSteps || [])];
  rawCombined.forEach((step) => {
    const normTitle = step.title.trim().toLowerCase();
    const key = step.id || normTitle;
    if (seenKeys.has(key) || (normTitle && seenKeys.has(normTitle))) {
      const existing = mergedSteps.find(m => m.id === step.id || m.title.trim().toLowerCase() === normTitle);
      if (existing) {
        if (!existing.carryoverNote && step.carryoverNote) {
          existing.carryoverNote = step.carryoverNote;
          existing.carryoverNoteDate = step.carryoverNoteDate;
        }
        if (!existing.durationMinutes && step.durationMinutes) {
          existing.durationMinutes = step.durationMinutes;
        }
      }
      return;
    }
    seenKeys.add(key);
    if (normTitle) seenKeys.add(normTitle);
    mergedSteps.push({
      id: step.id,
      index: mergedSteps.length + 1,
      title: step.title,
      durationMinutes: step.durationMinutes,
      completed: step.completed,
      carryoverNote: localStepNotes[step.id] !== undefined ? localStepNotes[step.id] : step.carryoverNote,
      carryoverNoteDate: step.carryoverNoteDate
    });
  });

  const stepsWithNotes = mergedSteps.filter(s => s.carryoverNote && s.carryoverNote.trim().length > 0);

  // Ensure the event genuinely belongs to this goal, never an unrelated scheduled session (e.g. Python when studying Cybersecurity)
  const isMatchingEvent = Boolean(
    event && (
      event.goalId === goal.id || 
      (event.title && (
        event.title.toLowerCase().includes(goal.name.toLowerCase()) ||
        goal.name.toLowerCase().includes(event.title.toLowerCase())
      ))
    )
  );
  const matchedEvent = isMatchingEvent ? event : null;

  const durationMins = matchedEvent 
    ? Math.max(15, Math.round((new Date(matchedEvent.end).getTime() - new Date(matchedEvent.start).getTime()) / 60000))
    : (goal.durationMinutes || 45);

  const nextChapter = goal.chapters?.find(c => !c.completed);
  const nextSubtask = goal.subtasks?.find(s => !s.completed) || goal.subSteps?.find(s => !s.completed);

  const handleSaveNote = () => {
    if (onUpdateGoalNote && editedNote.trim() !== (goal.lastSessionNote || "").trim()) {
      onUpdateGoalNote(goal.id, editedNote.trim());
    }
    setIsEditing(false);
  };

  const handleSaveStepEdit = (stepId: string, stepTitle: string, nextVal: string) => {
    const trimmed = nextVal.trim();
    setLocalStepNotes(prev => ({ ...prev, [stepId]: trimmed }));
    if (onUpdateStepNote) {
      onUpdateStepNote(goal.id, stepId, stepTitle, trimmed);
    }
    setEditingStepId(null);
  };

  const handleStart = (startAsReview: boolean = isReviewMode) => {
    if (isEditing) {
      handleSaveNote();
    }
    const summaryNote =
      editedNote.trim() ||
      (stepsWithNotes.length > 0
        ? stepsWithNotes.map(s => `${s.title}: ${s.carryoverNote}`).join(" • ")
        : "");
    onConfirmStart(summaryNote, startAsReview);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-[#121624] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="briefing_modal_title"
      >
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
              isStudyAhead 
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25" 
                : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25"
            }`}>
              {isStudyAhead ? (
                <Zap className="w-5 h-5 fill-current" />
              ) : (
                <StickyNote className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="briefing_modal_title" className="text-sm font-bold text-slate-900 dark:text-white">
                  {isReviewMode ? "15m Review Briefing" : isStudyAhead ? "Study Ahead Briefing" : "Where to Start"}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isReviewMode
                    ? "bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300"
                    : isStudyAhead 
                    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                    : "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300"
                }`}>
                  {isReviewMode ? "15m Review" : stepsWithNotes.length > 0 && !noteText ? `${stepsWithNotes.length} Step Note${stepsWithNotes.length > 1 ? "s" : ""}` : "Saved Note"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                {goal.name} {goal.category ? `• ${goal.category}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Goal & Session Info Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span 
                className="w-3 h-3 rounded-full shrink-0" 
                style={{ backgroundColor: goal.color || "#6366f1" }} 
              />
              <span className="font-semibold text-slate-800 dark:text-white truncate">
                {matchedEvent?.title || goal.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-medium shrink-0">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{isReviewMode ? "15m review session" : `${durationMins}m target session`}</span>
            </div>
          </div>

          {/* Prominent Goal Note Box - "Where to Start" */}
          {(noteText || isEditing || stepsWithNotes.length === 0) && (
            <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-2.5 relative shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Where you left off & where to start:
                  </span>
                </div>

                {!isEditing && onUpdateGoalNote && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 hover:underline cursor-pointer"
                    title="Edit note before starting"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit Note</span>
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2 pt-1">
                  <textarea
                    value={editedNote}
                    onChange={(e) => setEditedNote(e.target.value)}
                    rows={3}
                    className="w-full text-xs p-2.5 rounded-lg border border-amber-300 dark:border-amber-500/50 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    placeholder="Where should you start this session? (e.g. Chapter 4 quiz, revise formulas...)"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditedNote(goal.lastSessionNote || "");
                        setIsEditing(false);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      className="flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-[11px] font-bold cursor-pointer transition"
                    >
                      <Check className="w-3 h-3" />
                      <span>Save Note</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-sm text-slate-800 dark:text-slate-100 font-medium leading-relaxed italic bg-white/70 dark:bg-black/30 p-3 rounded-lg border border-amber-200/50 dark:border-amber-500/20 whitespace-pre-wrap">
                    "{noteText}"
                  </div>
                  {formattedDate && (
                    <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 flex items-center gap-1 pt-0.5">
                      <span>Recorded from previous session on {formattedDate}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Per-Step Carryover Notes Section */}
          {stepsWithNotes.length > 0 && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-950/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-indigo-800 dark:text-indigo-300">
                  <StickyNote className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Step Carryover Notes ({stepsWithNotes.length})
                  </span>
                </div>
                {!noteText && !isEditing && onUpdateGoalNote && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                  >
                    + Add Goal Note
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                {stepsWithNotes.map((step) => {
                  const isEditingThisStep = editingStepId === step.id;
                  const stepDateStr = step.carryoverNoteDate
                    ? new Date(step.carryoverNoteDate).toLocaleDateString([], { month: "short", day: "numeric" })
                    : null;

                  return (
                    <div
                      key={step.id}
                      className="p-2.5 rounded-lg bg-white/85 dark:bg-black/30 border border-indigo-200/70 dark:border-indigo-500/20 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/25 text-indigo-800 dark:text-indigo-200 font-mono text-[10px] font-bold shrink-0">
                            Step {step.index}
                          </span>
                          <span className={`text-xs font-bold truncate ${step.completed ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>
                            {step.title}
                          </span>
                          {step.completed && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {stepDateStr && (
                            <span className="text-[10px] font-mono text-slate-400">{stepDateStr}</span>
                          )}
                          {!isEditingThisStep && onUpdateStepNote && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStepId(step.id);
                                setEditedStepText(step.carryoverNote || "");
                              }}
                              className="flex items-center gap-1 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditingThisStep ? (
                        <div className="space-y-1.5 pt-1">
                          <textarea
                            value={editedStepText}
                            onChange={(e) => setEditedStepText(e.target.value)}
                            rows={2}
                            autoFocus
                            className="w-full text-xs p-2 rounded-lg border border-indigo-300 dark:border-indigo-500/50 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                            placeholder="Update carryover note for this step..."
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingStepId(null)}
                              className="px-2 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveStepEdit(step.id, step.title, editedStepText)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[10px] font-bold cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-700 dark:text-slate-200 italic leading-relaxed whitespace-pre-wrap pl-1 border-l-2 border-amber-400/70">
                          "{step.carryoverNote}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Context Checklist / Chapters if applicable */}
          {(nextChapter || nextSubtask) && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/5 space-y-1.5 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Next Up in Curriculum:
              </span>
              {nextChapter && (
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold truncate">Chapter: {nextChapter.title}</span>
                </div>
              )}
              {nextSubtask && !nextChapter && (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold truncate">Sub-step: {nextSubtask.title}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {!isReviewMode && (
              <button
                type="button"
                id="briefing_start_15m_review_btn"
                onClick={() => handleStart(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-sm transition active:scale-95 cursor-pointer"
                title="Start a 15-minute review; prompts to save a carryover note when done"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Start 15m Review</span>
              </button>
            )}

            <button
              type="button"
              id="briefing_confirm_start_btn"
              onClick={() => handleStart(isReviewMode)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition active:scale-95 cursor-pointer ${
                isReviewMode
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-900/30"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/30"
              }`}
            >
              {isReviewMode ? (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Got it, Start 15m Review</span>
                </>
              ) : isStudyAhead ? (
                <>
                  <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />
                  <span>Got it, Study Ahead Now</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Got it, Start Studying Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
