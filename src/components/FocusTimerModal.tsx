import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Minus, 
  CheckCircle2, 
  X, 
  XCircle, 
  Sparkles, 
  Clock, 
  Flame, 
  VolumeX, 
  Volume1,
  Minimize2, 
  Maximize2,
  Bell,
  BellRing,
  Check,
  Radio,
  ChevronRight,
  ListOrdered,
  Trash2,
  Sliders,
  Layers,
  Wand2,
  Loader2,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  LayoutTemplate,
  BookmarkPlus,
  Save,
  Bookmark,
  Copy,
  Edit3,
  Info,
  Zap,
  Waves,
  CloudRain,
  Wind,
  ExternalLink,
  BookOpen,
  FileText,
  StickyNote,
  HelpCircle,
  Link2,
  ClipboardCheck,
  Award,
  RefreshCw,
  Upload,
  Video,
  Camera,
  ImagePlus,
  GripVertical,
  ArrowRight
} from "lucide-react";
import { SessionSubStep, CustomSessionTemplate, Goal, CalendarEvent, GoalKnowledgeHub, StudyArtifactNote, KnowledgeTestArtifact, KnowledgeQuestion, GoalStepType, ReadingRecommendationItem } from "../types";
import { isStepActive, isKnowledgeTesterStep, reorderSteps, subTaskToSessionSubStep } from "../lib/stepOrdering";
import { soundscapeEngine, SoundscapeType } from "../lib/soundscapes";
import { GoalKnowledgeHubModal } from "./GoalKnowledgeHubModal";
import {
  MAX_NOTE_IMAGES,
  captureClipboardPasteSnapshot,
  captureScreenScreenshot,
  extractImagesFromClipboardSnapshot,
  readImageFileAsDataUrl,
  stripInlineBase64ImagesFromText
} from "../lib/screenshotCapture";
import { resolveFillInBlankDraft } from "../lib/fillInBlank";
import {
  extractDirectQuestionsFromNotes,
  formatQuestionCorrectAnswerText,
  formatQuestionUserAnswerText,
  formatStudyMaterialForPrompt,
  getQuestionCorrectIndices,
  isMultiSelectQuestion,
  isQuestionAnswerCorrect,
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
import { TableNoteEditor } from "./TableNoteEditor";
import { FormattedStudyText, StudyNoteTextEditor } from "./StudyNoteTextEditor";
import { findPotentialDuplicateNotes } from "../lib/noteDuplicateCheck";
import { DuplicateWarningBanner } from "./DuplicateWarningBanner";
import {
  createEmptyTableHeaders,
  createEmptyTableRows,
  formatTableAsMarkdown,
  normalizeTableDraft
} from "../lib/tableNote";

export interface ActiveTimerData {
  title: string;
  totalSec: number;
  timeRemaining: number;
  targetEndTime: number | null; // Wall-clock timestamp in ms
  startedAt?: number | null; // Exact timestamp in ms when the user started studying
  lastPausedAt?: number | null; // Exact timestamp in ms when user clicked pause
  isRunning: boolean;
  isCompleted: boolean;
  eventId?: string;
  goalId?: string;
  category?: string;
  color: string;
  previousSessionNote?: string;
  sessionTakeawayNote: string;
  isMinimized: boolean;
  isOpen: boolean;
  subSteps?: SessionSubStep[];
  sessionStartedAt?: number;
  savedNoteStepKeys?: string[];
  isCompletionLogged?: boolean;
}

export interface SavedSessionProgress {
  key: string;
  goalId?: string;
  eventId?: string;
  title: string;
  totalSec: number;
  timeRemaining: number;
  timeSpentSec: number;
  category?: string;
  color: string;
  previousSessionNote?: string;
  sessionTakeawayNote: string;
  updatedAt: number;
  subSteps?: SessionSubStep[];
  sessionStartedAt?: number;
  savedNoteStepKeys?: string[];
}

export type SoundType = "tibetan_bell" | "crystal_chime" | "zen_bowl" | "alert_bell";

export const STORAGE_KEY = "active_focus_timer_v2";
const PROGRESS_MAP_KEY = "saved_focus_goal_progress_map_v2";
const SOUND_PREF_KEY = "focus_timer_sound_choice_v2";
const VOLUME_PREF_KEY = "focus_timer_volume_v2";
const REPEAT_SOUND_KEY = "focus_timer_repeat_sound_v2";
const SOUND_ENABLED_KEY = "focus_timer_sound_enabled_v2";
const CUSTOM_TEMPLATES_KEY = "focus_timer_custom_templates_v2";

export const DEFAULT_CUSTOM_TEMPLATES: CustomSessionTemplate[] = [
  {
    id: "tmpl_study_trio_custom",
    name: "Study Trio",
    icon: "🎓",
    description: "Review • Core Practice • Quiz & Notes",
    steps: [
      { id: "step_st_1", title: "Concept & Notes Review", durationMinutes: 10, description: "Review foundations" },
      { id: "step_st_2", title: "Core Deep Practice", durationMinutes: 25, description: "Active problem solving" },
      { id: "step_st_3", title: "Self-Quiz & Key Takeaways", durationMinutes: 10, description: "Quiz & summarize" }
    ],
    createdAt: Date.now() - 86400000
  },
  {
    id: "tmpl_cyber_custom",
    name: "Cyber Drill",
    icon: "🛡️",
    description: "Scope & Recon • Exploit / Patch • Report",
    steps: [
      { id: "step_cb_1", title: "Lab Setup & Scope", durationMinutes: 10, description: "Verify environment and targets" },
      { id: "step_cb_2", title: "Active Hands-on Drill", durationMinutes: 25, description: "Execute drill or labs" },
      { id: "step_cb_3", title: "Log Findings & Takeaways", durationMinutes: 10, description: "Document lessons & fixes" }
    ],
    createdAt: Date.now() - 43200000
  }
];

export const TEMPLATE_EMOJI_PRESETS = ["🎯", "🛡️", "💻", "🧠", "⚡", "🎓", "📚", "🔬", "🏋️", "🚀", "⏱️", "📝", "☕", "🧘"];

export const SOUND_OPTIONS: { id: SoundType; name: string; desc: string; icon: string }[] = [
  { id: "tibetan_bell", name: "Tibetan Singing Bowl", desc: "Warm meditative metallic tone with deep harmonics", icon: "🔔" },
  { id: "crystal_chime", name: "Crystal Chime", desc: "Bright, sparkling chime with clear acoustic ring", icon: "✨" },
  { id: "zen_bowl", name: "Zen Temple Gong", desc: "Resonant low-frequency gong with smooth decay", icon: "🪷" },
  { id: "alert_bell", name: "Digital Brass Chime", desc: "Crisp multi-tonal alert bell that cuts through noise", icon: "⏰" }
];

// Audio Context Singleton & Synthesizer
let globalAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return null;
    if (!globalAudioCtx || globalAudioCtx.state === "closed") {
      globalAudioCtx = new AudioCtxClass();
    }
    if (globalAudioCtx.state === "suspended") {
      globalAudioCtx.resume().catch(() => {});
    }
    return globalAudioCtx;
  } catch {
    return null;
  }
}

export function unlockAudioEngine() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  } catch {}
}

function synthesizeWavBell(sound: SoundType): string {
  const sampleRate = 44100;
  const duration = 2.4;
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, totalSamples * 2, true);

  let partials: { freq: number; gain: number; decay: number }[] = [];
  if (sound === "tibetan_bell") {
    partials = [
      { freq: 440, gain: 0.5, decay: 1.8 },
      { freq: 880, gain: 0.3, decay: 1.4 },
      { freq: 1320, gain: 0.15, decay: 1.0 },
      { freq: 1760, gain: 0.05, decay: 0.6 }
    ];
  } else if (sound === "crystal_chime") {
    partials = [
      { freq: 1046.5, gain: 0.45, decay: 1.2 },
      { freq: 1567.98, gain: 0.3, decay: 1.0 },
      { freq: 2093.0, gain: 0.2, decay: 0.8 },
      { freq: 3135.96, gain: 0.1, decay: 0.5 }
    ];
  } else if (sound === "zen_bowl") {
    partials = [
      { freq: 220, gain: 0.6, decay: 2.2 },
      { freq: 440, gain: 0.25, decay: 1.8 },
      { freq: 660, gain: 0.15, decay: 1.2 }
    ];
  } else {
    partials = [
      { freq: 587.33, gain: 0.4, decay: 1.5 },
      { freq: 880.0, gain: 0.35, decay: 1.2 },
      { freq: 1174.66, gain: 0.25, decay: 0.9 }
    ];
  }

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const p of partials) {
      const envelope = Math.exp(-t / (p.decay * 0.5));
      sample += Math.sin(2 * Math.PI * p.freq * t) * p.gain * envelope;
    }
    sample = Math.max(-1, Math.min(1, sample));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

export function playBellSound(sound: SoundType = "tibetan_bell", volume: number = 90) {
  const normVol = Math.max(0.05, Math.min(1, volume / 100));
  let webAudioSucceeded = false;

  try {
    const ctx = getAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(normVol, now);
      masterGain.connect(ctx.destination);

      let freqs: number[] = [];
      let gains: number[] = [];
      let decay = 2.4;

      if (sound === "tibetan_bell") {
        freqs = [440, 880, 1320, 1760];
        gains = [0.5, 0.3, 0.15, 0.05];
        decay = 2.8;
      } else if (sound === "crystal_chime") {
        freqs = [1046.5, 1567.98, 2093.0, 3135.96];
        gains = [0.45, 0.3, 0.2, 0.1];
        decay = 1.8;
      } else if (sound === "zen_bowl") {
        freqs = [220, 440, 660, 880];
        gains = [0.6, 0.25, 0.15, 0.08];
        decay = 3.2;
      } else {
        freqs = [587.33, 880.0, 1174.66, 1760.0];
        gains = [0.4, 0.35, 0.25, 0.1];
        decay = 2.0;
      }

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        const peak = (gains[idx] || 0.2) * normVol;
        oscGain.gain.setValueAtTime(0.0001, now);
        oscGain.gain.exponentialRampToValueAtTime(peak, now + 0.015);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

        osc.connect(oscGain);
        oscGain.connect(masterGain);

        osc.start(now);
        osc.stop(now + decay + 0.1);
      });

      webAudioSucceeded = true;
    }
  } catch {}

  if (!webAudioSucceeded) {
    try {
      const wavUrl = synthesizeWavBell(sound);
      const audio = new Audio(wavUrl);
      audio.volume = normVol;
      audio.play().catch(() => {});
    } catch {}
  }
}

const PHASE_SOUND_ENABLED_KEY = "focus_timer_phase_sound_enabled_v2";

export function playPhaseEndChime(volume: number = 90) {
  unlockAudioEngine();
  const normVol = Math.max(0.05, Math.min(1, volume / 100));
  let webAudioSucceeded = false;

  try {
    const ctx = getAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(normVol, now);
      masterGain.connect(ctx.destination);

      // Distinct, melodic ascending chime (D5 -> A5 -> D6) indicating phase complete!
      const notes = [
        { freq: 587.33, start: 0.0, decay: 1.2, gain: 0.45 },
        { freq: 880.00, start: 0.16, decay: 1.5, gain: 0.50 },
        { freq: 1174.66, start: 0.32, decay: 2.2, gain: 0.40 }
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        const peak = note.gain * normVol;
        oscGain.gain.setValueAtTime(0.0001, now + note.start);
        oscGain.gain.exponentialRampToValueAtTime(peak, now + note.start + 0.015);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.decay);

        osc.connect(oscGain);
        oscGain.connect(masterGain);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.decay + 0.1);
      });

      webAudioSucceeded = true;
    }
  } catch {}

  if (!webAudioSucceeded) {
    try {
      const wavUrl = synthesizeWavBell("crystal_chime");
      const audio = new Audio(wavUrl);
      audio.volume = normVol;
      audio.play().catch(() => {});
    } catch {}
  }
}

export function getProgressKey(goalId?: string, eventId?: string, title?: string): string {
  if (goalId) return `goal_${goalId}`;
  if (eventId) return `evt_${eventId}`;
  return `title_${(title || "focus").trim().toLowerCase()}`;
}

export function getSavedProgress(goalId?: string, eventId?: string, title?: string): SavedSessionProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_MAP_KEY);
    if (!raw) return null;
    const map: Record<string, SavedSessionProgress> = JSON.parse(raw);
    const key = getProgressKey(goalId, eventId, title);
    if (map[key]) return map[key];
    if (goalId && map[`goal_${goalId}`]) return map[`goal_${goalId}`];
    if (eventId && map[`evt_${eventId}`]) return map[`evt_${eventId}`];
    if (title && map[`title_${title.trim().toLowerCase()}`]) return map[`title_${title.trim().toLowerCase()}`];
    return null;
  } catch {
    return null;
  }
}

export function saveProgressToMap(data: ActiveTimerData) {
  try {
    const key = getProgressKey(data.goalId, data.eventId, data.title);
    const raw = localStorage.getItem(PROGRESS_MAP_KEY);
    const map: Record<string, SavedSessionProgress> = raw ? JSON.parse(raw) : {};

    if (data.isCompleted || data.timeRemaining <= 0) {
      delete map[key];
      if (data.goalId) delete map[`goal_${data.goalId}`];
      if (data.eventId) delete map[`evt_${data.eventId}`];
      if (data.title) delete map[`title_${data.title.trim().toLowerCase()}`];
    } else if (data.timeRemaining < data.totalSec && data.timeRemaining > 0) {
      const timeSpentSec = Math.max(0, data.totalSec - data.timeRemaining);
      const entry: SavedSessionProgress = {
        key,
        goalId: data.goalId,
        eventId: data.eventId,
        title: data.title,
        totalSec: data.totalSec,
        timeRemaining: data.timeRemaining,
        timeSpentSec,
        category: data.category,
        color: data.color,
        previousSessionNote: data.previousSessionNote,
        sessionTakeawayNote: data.sessionTakeawayNote,
        updatedAt: Date.now(),
        subSteps: data.subSteps,
        sessionStartedAt: data.sessionStartedAt,
        savedNoteStepKeys: data.savedNoteStepKeys
      };
      map[key] = entry;
      if (data.goalId) map[`goal_${data.goalId}`] = entry;
      if (data.eventId) map[`evt_${data.eventId}`] = entry;
      if (data.title) map[`title_${data.title.trim().toLowerCase()}`] = entry;
    }

    localStorage.setItem(PROGRESS_MAP_KEY, JSON.stringify(map));
  } catch {}
}

export function clearSavedProgress(goalId?: string, eventId?: string, title?: string) {
  try {
    const raw = localStorage.getItem(PROGRESS_MAP_KEY);
    if (!raw) return;
    const map: Record<string, SavedSessionProgress> = JSON.parse(raw);
    const keys = [
      goalId ? `goal_${goalId}` : null,
      eventId ? `evt_${eventId}` : null,
      title ? `title_${title.trim().toLowerCase()}` : null
    ].filter(Boolean) as string[];

    keys.forEach(k => delete map[k]);
    localStorage.setItem(PROGRESS_MAP_KEY, JSON.stringify(map));
  } catch {}
}

export function triggerFocusTimer(params: {
  title: string;
  duration: number; // in minutes
  eventId?: string;
  goalId?: string;
  category?: string;
  color?: string;
  previousSessionNote?: string;
  subSteps?: SessionSubStep[];
  autoStart?: boolean;
  openModal?: boolean;
}) {
  unlockAudioEngine();
  window.dispatchEvent(new CustomEvent("open_focus_timer", { detail: params }));
}

export function pauseFocusTimer() {
  unlockAudioEngine();
  window.dispatchEvent(new CustomEvent("focus_timer_pause"));
}

export function resumeFocusTimer() {
  unlockAudioEngine();
  window.dispatchEvent(new CustomEvent("focus_timer_resume"));
}

export function finishFocusTimer() {
  window.dispatchEvent(new CustomEvent("focus_timer_finish"));
}

export function updateActiveTimerSubSteps(subSteps: SessionSubStep[]) {
  window.dispatchEvent(new CustomEvent("focus_timer_update_substeps", { detail: { subSteps } }));
}

export function setActiveTimerDuration(durationMinutes: number) {
  window.dispatchEvent(new CustomEvent("focus_timer_set_duration", { detail: { durationMinutes } }));
}

export function getActiveTimerSnapshot(): ActiveTimerData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: ActiveTimerData = JSON.parse(raw);
    if (parsed.isRunning && parsed.targetEndTime) {
      const remaining = Math.max(0, Math.round((parsed.targetEndTime - Date.now()) / 1000));
      return { ...parsed, timeRemaining: remaining };
    }
    return parsed;
  } catch {
    return null;
  }
}

interface FocusTimerModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  sessionTitle?: string;
  initialDurationMinutes?: number;
  eventId?: string;
  goalId?: string;
  category?: string;
  color?: string;
  previousSessionNote?: string;
  subSteps?: SessionSubStep[];
  goals?: Goal[];
  onUpdateGoalChapters?: (goalId: string, chapters: { id: string; title: string; completed: boolean }[]) => void;
  onCompleteSession: (
    eventId?: string,
    goalId?: string,
    note?: string,
    title?: string,
    options?: { savedStepKeys?: string[]; sessionStartedAt?: number }
  ) => void;
  onExtendEventDuration?: (eventId: string, deltaMins: number) => void;
  onUpdateGoalKnowledgeHub?: (goalId: string, hub: GoalKnowledgeHub) => void;
  onSaveStepCarryoverNote?: (
    goalId: string,
    stepId: string,
    stepTitle: string,
    note: string,
    eventId?: string
  ) => void;
}

function resolveAndBalanceSubSteps(
  rawSubSteps: SessionSubStep[] | undefined,
  goalId?: string,
  sessionTitle?: string,
  sessionMinutes: number = 60,
  goalsList?: Goal[]
): SessionSubStep[] | undefined {
  let targetGoal: Goal | undefined;
  if (goalsList && goalsList.length > 0) {
    targetGoal = (goalId ? goalsList.find(g => g.id === goalId) : undefined)
      || (sessionTitle ? goalsList.find(g => g.name.toLowerCase() === sessionTitle.toLowerCase()) : undefined);
  }
  if (!targetGoal) {
    try {
      const rawCached = localStorage.getItem("cached_goals");
      if (rawCached) {
        const parsedGoals: Goal[] = JSON.parse(rawCached);
        targetGoal = (goalId ? parsedGoals.find(g => g.id === goalId) : undefined)
          || (sessionTitle ? parsedGoals.find(g => g.name.toLowerCase() === sessionTitle.toLowerCase()) : undefined);
      }
    } catch {}
  }

  let steps: SessionSubStep[] | undefined = rawSubSteps && rawSubSteps.length > 0 ? [...rawSubSteps] : undefined;

  // Enrich rawSubSteps with carryover notes & step metadata stored on targetGoal if missing
  if (steps && targetGoal) {
    const goalPool = [...(targetGoal.subtasks || []), ...(targetGoal.subSteps || [])];
    steps = steps.map(s => {
      const match = goalPool.find(
        g => (g.id === s.id || g.title.trim().toLowerCase() === s.title.trim().toLowerCase())
      );
      if (!match) return s;
      return {
        ...s,
        enabled: s.enabled ?? match.enabled,
        stepType: s.stepType ?? match.stepType,
        assignedLinkNoteId: s.assignedLinkNoteId ?? match.assignedLinkNoteId,
        assignedLinkUrl: s.assignedLinkUrl ?? match.assignedLinkUrl,
        assignedLinkTitle: s.assignedLinkTitle ?? match.assignedLinkTitle,
        lastTestScore: s.lastTestScore ?? match.lastTestScore,
        carryoverNote: s.carryoverNote ?? match.carryoverNote,
        carryoverNoteDate: s.carryoverNoteDate ?? match.carryoverNoteDate
      };
    });
  }

  // If no explicit subSteps were provided, try to inherit from goal
  if (!steps && targetGoal) {
    if (targetGoal.subSteps && targetGoal.subSteps.length > 0) {
      steps = targetGoal.subSteps.map(s => {
        const matchTask = targetGoal?.subtasks?.find(
          t => t.id === s.id || t.title.trim().toLowerCase() === s.title.trim().toLowerCase()
        );
        return {
          ...s,
          enabled: s.enabled ?? matchTask?.enabled,
          stepType: s.stepType ?? matchTask?.stepType,
          assignedLinkNoteId: s.assignedLinkNoteId ?? matchTask?.assignedLinkNoteId,
          assignedLinkUrl: s.assignedLinkUrl ?? matchTask?.assignedLinkUrl,
          assignedLinkTitle: s.assignedLinkTitle ?? matchTask?.assignedLinkTitle,
          lastTestScore: s.lastTestScore ?? matchTask?.lastTestScore,
          carryoverNote: s.carryoverNote ?? matchTask?.carryoverNote,
          carryoverNoteDate: s.carryoverNoteDate ?? matchTask?.carryoverNoteDate
        };
      });
    } else if (targetGoal.subtasks && targetGoal.subtasks.length > 0) {
      steps = targetGoal.subtasks.map(subTaskToSessionSubStep);
    }
  }

  if (!steps || steps.length === 0) return undefined;

  // Check if active steps sum to less than total session minutes (e.g. 15m review for a 60m session)
  const totalAllocated = steps.reduce(
    (sum, s) => sum + (isStepActive(s) ? (Number(s.durationMinutes) || 10) : 0),
    0
  );
  if (sessionMinutes > totalAllocated && (sessionMinutes - totalAllocated) >= 5) {
    const remainderMins = sessionMinutes - totalAllocated;
    const remainderTitle = sessionTitle ? `${sessionTitle} Practice & Focus` : "Core Practice & Deep Focus";
    steps.push({
      id: `step_remainder_${Date.now()}`,
      title: remainderTitle,
      durationMinutes: remainderMins,
      completed: false
    });
  }

  return steps;
}

export default function FocusTimerModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  sessionTitle: propSessionTitle,
  initialDurationMinutes: propInitialDurationMinutes,
  eventId: propEventId,
  goalId: propGoalId,
  category: propCategory,
  color: propColor = "#6366f1",
  previousSessionNote: propPreviousSessionNote,
  subSteps: propSubSteps,
  goals,
  onUpdateGoalChapters,
  onCompleteSession,
  onExtendEventDuration,
  onUpdateGoalKnowledgeHub,
  onSaveStepCarryoverNote
}: FocusTimerModalProps) {
  // Live Study Notes & Scratchpad State
  const [showLiveNotes, setShowLiveNotes] = useState(false);
  const [liveNoteTitle, setLiveNoteTitle] = useState("");
  const [liveNoteContent, setLiveNoteContent] = useState("");
  const [liveNoteQuestion, setLiveNoteQuestion] = useState("");
  const [liveNoteAnswer, setLiveNoteAnswer] = useState("");
  const [liveNoteExplanation, setLiveNoteExplanation] = useState("");
  const [liveNoteMcqOptions, setLiveNoteMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [liveNoteMcqCorrectIndex, setLiveNoteMcqCorrectIndex] = useState<number>(0);
  const [liveNoteMultiSelectIndices, setLiveNoteMultiSelectIndices] = useState<number[]>([0]);
  const [liveNoteTrueFalseAnswer, setLiveNoteTrueFalseAnswer] = useState<"true" | "false">("true");
  const [liveNoteTerm, setLiveNoteTerm] = useState("");
  const [liveNoteDefinition, setLiveNoteDefinition] = useState("");
  const [liveNoteTableHeaders, setLiveNoteTableHeaders] = useState<string[]>(() => createEmptyTableHeaders(3));
  const [liveNoteTableRows, setLiveNoteTableRows] = useState<string[][]>(() => createEmptyTableRows(3, 3));
  const [liveNoteUrl, setLiveNoteUrl] = useState("");
  const [liveNoteUrlContext, setLiveNoteUrlContext] = useState("");
  const [liveNoteRequiresLogin, setLiveNoteRequiresLogin] = useState(false);
  const [liveNoteAssignReading, setLiveNoteAssignReading] = useState(true);
  const [extractOnUrlSave, setExtractOnUrlSave] = useState(true);
  const [isExtractingLiveUrl, setIsExtractingLiveUrl] = useState(false);
  const [liveUploadVideoFile, setLiveUploadVideoFile] = useState<File | null>(null);
  const [liveUploadTranscriptFile, setLiveUploadTranscriptFile] = useState<File | null>(null);
  const [liveUploadTranscriptText, setLiveUploadTranscriptText] = useState("");
  const [isExtractingLiveUpload, setIsExtractingLiveUpload] = useState(false);
  const [liveUploadInputKey, setLiveUploadInputKey] = useState(0);
  const [liveNoteCategory, setLiveNoteCategory] = useState<StudyArtifactNote["category"] | "video_upload" | "reading_url">("concept");
  const liveNoteQuestionRef = useRef<HTMLTextAreaElement>(null);
  const liveNoteTermRef = useRef<HTMLInputElement>(null);
  const liveNoteUrlRef = useRef<HTMLInputElement>(null);
  const liveNoteTitleRef = useRef<HTMLInputElement>(null);
  const liveScreenshotFileInputRef = useRef<HTMLInputElement>(null);
  const [liveNoteScreenshots, setLiveNoteScreenshots] = useState<string[]>([]);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [isProcessingLivePasteImages, setIsProcessingLivePasteImages] = useState(false);
  const [showLiveAttachments, setShowLiveAttachments] = useState(false);
  const [screenshotFallbackNotice, setScreenshotFallbackNotice] = useState<string | null>(null);
  const [lightboxScreenshotUrl, setLightboxScreenshotUrl] = useState<string | null>(null);
  const [noteSavedFeedback, setNoteSavedFeedback] = useState<string | null>(null);
  const [allowDuplicateLiveNoteSave, setAllowDuplicateLiveNoteSave] = useState(false);
  const [blockedDuplicateLiveSave, setBlockedDuplicateLiveSave] = useState(false);
  const [showKnowledgeHubModal, setShowKnowledgeHubModal] = useState(false);
  const [knowledgeHubInitialTab, setKnowledgeHubInitialTab] = useState<"notes" | "tester" | "flashcards" | "overview">("notes");
  const [knowledgeHubInitialNoteId, setKnowledgeHubInitialNoteId] = useState<string | null>(null);

  // Embedded Self Test Step Runner State
  const [showSelfTestPanel, setShowSelfTestPanel] = useState(false);
  const [activeSelfTest, setActiveSelfTest] = useState<KnowledgeTestArtifact | null>(null);
  const [selfTestAnswers, setSelfTestAnswers] = useState<Record<string, number>>({});
  const [selfTestMultiAnswers, setSelfTestMultiAnswers] = useState<Record<string, number[]>>({});
  const [selfTestSubmitted, setSelfTestSubmitted] = useState(false);
  const [isGeneratingSelfTest, setIsGeneratingSelfTest] = useState(false);
  const [selfTestSourceMode, setSelfTestSourceMode] = useState<TestSourceMode>("hybrid");
  const [selfTestError, setSelfTestError] = useState<string | null>(null);
  const [selfTestReadingRecs, setSelfTestReadingRecs] = useState<ReadingRecommendationItem[]>([]);
  const [isGeneratingSelfTestReadings, setIsGeneratingSelfTestReadings] = useState(false);
  const [generatingSelfTestLessonTarget, setGeneratingSelfTestLessonTarget] = useState<{ qId: string; style: TopicLessonStyle } | null>(null);
  const [generatedSelfTestLessonNoteByQId, setGeneratedSelfTestLessonNoteByQId] = useState<Record<string, string>>({});
  const [standaloneGeneratedLessonsByQId, setStandaloneGeneratedLessonsByQId] = useState<Record<string, StudyArtifactNote>>({});
  const [selfTestLessonErrorByQId, setSelfTestLessonErrorByQId] = useState<Record<string, string>>({});
  const [reviewedCustomStepLinkIds, setReviewedCustomStepLinkIds] = useState<Record<string, boolean>>({});

  const [timerState, setTimerState] = useState<ActiveTimerData | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ActiveTimerData = JSON.parse(saved);
        if (parsed.isRunning && parsed.targetEndTime) {
          const remaining = Math.max(0, Math.round((parsed.targetEndTime - Date.now()) / 1000));
          if (remaining <= 0) {
            return {
              ...parsed,
              timeRemaining: 0,
              isRunning: false,
              isCompleted: true,
              isOpen: true,
              isMinimized: false
            };
          }
          return {
            ...parsed,
            timeRemaining: remaining
          };
        }
        return parsed;
      }
    } catch {}
    return null;
  });

  // Sound Settings State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(SOUND_ENABLED_KEY);
    return saved !== null ? saved === "true" : true;
  });

  const [soundChoice, setSoundChoice] = useState<SoundType>(() => {
    const saved = localStorage.getItem(SOUND_PREF_KEY) as SoundType;
    return saved || "tibetan_bell";
  });

  const [soundVolume, setSoundVolume] = useState<number>(() => {
    const saved = localStorage.getItem(VOLUME_PREF_KEY);
    return saved ? Number(saved) : 90;
  });

  const [repeatSound, setRepeatSound] = useState<boolean>(() => {
    const saved = localStorage.getItem(REPEAT_SOUND_KEY);
    return saved !== null ? saved === "true" : true;
  });

  // Phase End Sound Enabled state
  const [phaseSoundEnabled, setPhaseSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(PHASE_SOUND_ENABLED_KEY);
    return saved !== null ? saved === "true" : true;
  });
  const [isTestingPhaseSound, setIsTestingPhaseSound] = useState<boolean>(false);

  const handleTestPhaseSound = () => {
    unlockAudioEngine();
    setIsTestingPhaseSound(true);
    playPhaseEndChime(soundVolume);
    setTimeout(() => setIsTestingPhaseSound(false), 2200);
  };

  // Ambient Focus Soundscape Generator State
  const [activeSoundscape, setActiveSoundscape] = useState<SoundscapeType>("none");
  const [soundscapeVolume, setSoundscapeVolume] = useState<number>(() => soundscapeEngine.getVolume());

  const handleToggleSoundscape = (type: SoundscapeType) => {
    if (activeSoundscape === type) {
      soundscapeEngine.stop();
      setActiveSoundscape("none");
    } else {
      soundscapeEngine.play(type);
      setActiveSoundscape(type);
    }
  };

  const handleSoundscapeVolumeChange = (newVol: number) => {
    setSoundscapeVolume(newVol);
    soundscapeEngine.setVolume(newVol);
  };

  const [showAudioSettings, setShowAudioSettings] = useState<boolean>(false);
  const [showSubStepsEditor, setShowSubStepsEditor] = useState<boolean>(false);
  const [showCustomBreakdownBuilder, setShowCustomBreakdownBuilder] = useState<boolean>(false);
  const [draftSubSteps, setDraftSubSteps] = useState<SessionSubStep[]>([]);
  const [draggedDraftIdx, setDraggedDraftIdx] = useState<number | null>(null);
  const [dragOverDraftIdx, setDragOverDraftIdx] = useState<number | null>(null);
  const [isTestingSound, setIsTestingSound] = useState<boolean>(false);
  const [isAlarmRinging, setIsAlarmRinging] = useState<boolean>(false);
  const [isGeneratingAiSteps, setIsGeneratingAiSteps] = useState<boolean>(false);
  
  // Custom Session Templates state
  const [customTemplates, setCustomTemplates] = useState<CustomSessionTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Error loading custom templates:", e);
    }
    return DEFAULT_CUSTOM_TEMPLATES;
  });

  const [templateTab, setTemplateTab] = useState<"presets" | "custom">("presets");
  const [templateFeedbackMessage, setTemplateFeedbackMessage] = useState<string | null>(null);

  const [templateEditorState, setTemplateEditorState] = useState<{
    isOpen: boolean;
    mode: "create_from_current" | "create_blank" | "edit";
    templateId?: string;
    name: string;
    icon: string;
    description: string;
    steps: { id: string; title: string; durationMinutes: number; description?: string }[];
  } | null>(null);
  
  // Phase transition notification banner state
  const [phaseTransitionNotice, setPhaseTransitionNotice] = useState<{
    phaseTitle: string;
    phaseNum: number;
    totalPhases: number;
    durationMins: number;
  } | null>(null);

  // Per-Step Carryover Note inline editing inside FocusTimerModal
  const [editingStepNoteId, setEditingStepNoteId] = useState<string | null>(null);
  const [editingStepNoteText, setEditingStepNoteText] = useState<string>("");
  const [bottomNoteTargetStepId, setBottomNoteTargetStepId] = useState<string>("");
  const [bottomStepSavedToast, setBottomStepSavedToast] = useState<string | null>(null);

  const manualStepJumpRef = useRef<boolean>(false);

  const onCompleteRef = useRef(onCompleteSession);
  onCompleteRef.current = onCompleteSession;

  const onExtendRef = useRef(onExtendEventDuration);
  onExtendRef.current = onExtendEventDuration;

  const onSaveStepNoteRef = useRef(onSaveStepCarryoverNote);
  onSaveStepNoteRef.current = onSaveStepCarryoverNote;

  // Persist sound settings
  useEffect(() => {
    localStorage.setItem(SOUND_ENABLED_KEY, String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem(SOUND_PREF_KEY, soundChoice);
  }, [soundChoice]);

  useEffect(() => {
    localStorage.setItem(VOLUME_PREF_KEY, String(soundVolume));
  }, [soundVolume]);

  useEffect(() => {
    localStorage.setItem(REPEAT_SOUND_KEY, String(repeatSound));
  }, [repeatSound]);

  useEffect(() => {
    localStorage.setItem(PHASE_SOUND_ENABLED_KEY, String(phaseSoundEnabled));
  }, [phaseSoundEnabled]);

  const activeGoal = useMemo(() => {
    if (!goals || goals.length === 0 || !timerState) return null;
    return goals.find(g => g.id === timerState.goalId || g.name.toLowerCase() === timerState.title.toLowerCase());
  }, [goals, timerState?.goalId, timerState?.title]);

  const incompleteChapters = useMemo(() => {
    return activeGoal?.chapters?.filter(c => !c.completed) || [];
  }, [activeGoal?.chapters]);

  const currentSectionChapter = incompleteChapters[0] || null;
  const nextSectionChapter = incompleteChapters[1] || null;

  const handleToggleChapter = (chapterId: string) => {
    if (!activeGoal || !activeGoal.chapters || !onUpdateGoalChapters) return;
    const updated = activeGoal.chapters.map(ch => ch.id === chapterId ? { ...ch, completed: !ch.completed } : ch);
    onUpdateGoalChapters(activeGoal.id, updated);
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

  const loginStudyLinks = useMemo(() => {
    if (!activeGoal?.knowledgeHub?.notes) return [];
    return activeGoal.knowledgeHub.notes.filter(
      n => n.category === "url" && n.url && isSafeHttpUrl(n.url) && (n.requiresLogin || n.isReadingAssignment)
    );
  }, [activeGoal?.knowledgeHub?.notes]);

  const persistGoalKnowledgeHub = (goalId: string, updatedHub: GoalKnowledgeHub) => {
    if (onUpdateGoalKnowledgeHub) {
      onUpdateGoalKnowledgeHub(goalId, updatedHub);
    }
    try {
      const raw = localStorage.getItem("cached_goals");
      if (raw) {
        const cached: Goal[] = JSON.parse(raw);
        const next = cached.map(g => g.id === goalId ? { ...g, knowledgeHub: updatedHub } : g);
        localStorage.setItem("cached_goals", JSON.stringify(next));
      }
    } catch {}
  };

  const handleToggleLiveLinkAssignment = (noteId: string) => {
    if (!activeGoal?.knowledgeHub) return;
    const nowIso = new Date().toISOString();
    const updatedNotes = activeGoal.knowledgeHub.notes.map(n => {
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
    persistGoalKnowledgeHub(activeGoal.id, {
      ...activeGoal.knowledgeHub,
      notes: updatedNotes
    });
  };

  const goalLinkOptions = useMemo(() => {
    const notesLinks = (activeGoal?.knowledgeHub?.notes || [])
      .filter(n => n.category === "url" && n.url && isSafeHttpUrl(n.url))
      .map(n => ({
        id: n.id,
        title: n.title,
        url: n.url!,
        requiresLogin: Boolean(n.requiresLogin),
        reviewCompleted: Boolean(n.reviewCompleted),
        studyCount: n.studyCount || 0
      }));
    if (activeGoal?.resourceLink && isSafeHttpUrl(activeGoal.resourceLink)) {
      notesLinks.push({
        id: "goal_portal",
        title: activeGoal.resourceLabel || "Course Portal",
        url: activeGoal.resourceLink,
        requiresLogin: true,
        reviewCompleted: false,
        studyCount: 0
      });
    }
    return notesLinks;
  }, [activeGoal?.knowledgeHub?.notes, activeGoal?.resourceLink, activeGoal?.resourceLabel]);

  const buildStudyMaterialContext = () => {
    const notes = activeGoal?.knowledgeHub?.notes || [];
    return formatStudyMaterialForPrompt(notes, 18);
  };

  const handleLoadOrGenerateSelfTest = async (forceNew = false, modeOverride?: TestSourceMode) => {
    setSelfTestError(null);
    setSelfTestReadingRecs([]);
    const existingTests = activeGoal?.knowledgeHub?.tests || [];
    const selectedMode = modeOverride ?? selfTestSourceMode;
    const savedNotes = activeGoal?.knowledgeHub?.notes || [];

    if (!forceNew && existingTests.length > 0) {
      const assignedUrl = activeStepInfo?.assignedLinkUrl;
      const matching = (assignedUrl && existingTests.find(t => t.sourceUrl === assignedUrl))
        || existingTests[0];
      if (matching && matching.questions && matching.questions.length > 0) {
        setActiveSelfTest({
          ...matching,
          questions: matching.questions.map(q => ({ ...q, userSelectedIndex: undefined, userSelectedIndices: undefined }))
        });
        setSelfTestAnswers({});
        setSelfTestMultiAnswers({});
        setSelfTestSubmitted(false);
        return;
      }
    }

    if (selectedMode === "notes_only" && savedNotes.length === 0) {
      setSelfTestError("No saved notes found for this goal yet. Add Study Notes first or switch to AI + Notes.");
      return;
    }

    setIsGeneratingSelfTest(true);
    try {
      const includeNotes = selectedMode !== "ai_only" && savedNotes.length > 0;
      const studyMaterialContext = includeNotes ? buildStudyMaterialContext() : "";
      const directNoteQuestions = includeNotes ? extractDirectQuestionsFromNotes(savedNotes) : [];
      const activeChapter = activeGoal?.chapters?.find(c => !c.completed)?.title || "";
      const res = await fetch("/api/coach/generate-knowledge-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: activeGoal?.name || timerState?.title || "Study Session",
          goalCategory: activeGoal?.category || timerState?.category || "Study",
          chapterTitle: activeChapter || activeStepInfo?.title || "",
          examTitle: activeGoal?.targetExamTitle || "",
          difficulty: "medium",
          assignedLinkTitle: activeStepInfo?.assignedLinkTitle || "",
          sourceMode: selectedMode,
          studyMaterialContext,
          directNoteQuestions,
          questionCount: 5
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.test?.questions?.length) {
        setSelfTestError("Could not generate multiple-choice questions right now. Try again in a moment.");
        return;
      }
      const newTest: KnowledgeTestArtifact = {
        ...data.test,
        sourceUrl: activeStepInfo?.assignedLinkUrl || undefined
      };
      setActiveSelfTest(newTest);
      setSelfTestAnswers({});
      setSelfTestMultiAnswers({});
      setSelfTestSubmitted(false);

      if (activeGoal) {
        const currentHub: GoalKnowledgeHub = activeGoal.knowledgeHub || {
          notes: [],
          tests: [],
          flashcards: [],
          overallMasteryScore: 0
        };
        persistGoalKnowledgeHub(activeGoal.id, {
          ...currentHub,
          tests: [newTest, ...currentHub.tests]
        });
      }
    } catch {
      setSelfTestError("Network issue while creating your Self Test quiz.");
    } finally {
      setIsGeneratingSelfTest(false);
    }
  };

  const handleGenerateSelfTestReadings = async () => {
    if (!activeSelfTest) return;
    setIsGeneratingSelfTestReadings(true);
    setSelfTestError(null);
    try {
      const missedPayload = activeSelfTest.questions
        .filter(q => !isQuestionAnswerCorrect(q, selfTestAnswers[q.id], selfTestMultiAnswers[q.id]))
        .map(q => ({
          question: q.question,
          correctAnswer: formatQuestionCorrectAnswerText(q),
          userAnswer: formatQuestionUserAnswerText(q, selfTestAnswers[q.id], selfTestMultiAnswers[q.id]),
          explanation: q.explanation || ""
        }));

      const activeChapter = activeGoal?.chapters?.find(c => !c.completed)?.title || activeStepInfo?.title || "";
      const res = await fetch("/api/coach/recommend-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: activeGoal?.name || timerState?.title || "Study Session",
          goalCategory: activeGoal?.category || timerState?.category || "Study",
          chapterTitle: activeChapter,
          examTitle: activeGoal?.targetExamTitle || "",
          missedQuestions: missedPayload,
          existingNoteTitles: (activeGoal?.knowledgeHub?.notes || []).map(n => n.title).slice(0, 15),
          count: missedPayload.length > 0 ? Math.min(4, Math.max(2, missedPayload.length)) : 3
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.recommendations)) {
          setSelfTestReadingRecs(data.recommendations);
        }
      } else {
        setSelfTestError("Could not generate reading recommendations right now.");
      }
    } catch {
      setSelfTestError("Network issue while fetching reading recommendations.");
    } finally {
      setIsGeneratingSelfTestReadings(false);
    }
  };

  const handleSaveSelfTestReading = (rec: ReadingRecommendationItem) => {
    if (!activeGoal) return;
    const currentHub: GoalKnowledgeHub = activeGoal.knowledgeHub || {
      notes: [],
      tests: [],
      flashcards: [],
      overallMasteryScore: 0
    };
    if (isRecommendationSaved(rec, currentHub.notes)) return;
    const activeChapter = activeGoal.chapters?.find(c => !c.completed)?.title || activeStepInfo?.title;
    const savedNote = buildSavedReadingNote(rec, activeChapter);
    persistGoalKnowledgeHub(activeGoal.id, {
      ...currentHub,
      notes: [savedNote, ...currentHub.notes]
    });
  };

  const handleOpenSavedNoteFromSelfTest = (noteId: string) => {
    setKnowledgeHubInitialTab("notes");
    setKnowledgeHubInitialNoteId(noteId);
    setShowKnowledgeHubModal(true);
  };

  const handleGenerateLessonForSelfTestQuestion = async (
    q: KnowledgeQuestion,
    pickedOptionText: string,
    style: TopicLessonStyle = "lesson"
  ) => {
    setGeneratingSelfTestLessonTarget({ qId: q.id, style });
    setSelfTestLessonErrorByQId(prev => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    try {
      const activeChapter = activeGoal?.chapters?.find(c => !c.completed)?.title || activeStepInfo?.title || "";
      const res = await fetch("/api/coach/generate-topic-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: activeGoal?.name || timerState?.title || "Study Session",
          goalCategory: activeGoal?.category || timerState?.category || "Study",
          chapterTitle: activeChapter,
          examTitle: activeGoal?.targetExamTitle || "",
          question: q.question,
          correctAnswer: formatQuestionCorrectAnswerText(q),
          userAnswer: pickedOptionText,
          explanation: q.explanation || "",
          lessonStyle: style
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.lesson?.content) {
        setSelfTestLessonErrorByQId(prev => ({
          ...prev,
          [q.id]: data?.error || "Could not generate study material for this topic right now."
        }));
        return;
      }

      const savedNote = buildGeneratedTopicLessonNote(data.lesson, activeChapter);
      if (activeGoal) {
        const currentHub: GoalKnowledgeHub = activeGoal.knowledgeHub || {
          notes: [],
          tests: [],
          flashcards: [],
          overallMasteryScore: 0
        };
        persistGoalKnowledgeHub(activeGoal.id, {
          ...currentHub,
          notes: [savedNote, ...currentHub.notes]
        });
        setGeneratedSelfTestLessonNoteByQId(prev => ({ ...prev, [q.id]: savedNote.id }));
      } else {
        setStandaloneGeneratedLessonsByQId(prev => ({ ...prev, [q.id]: savedNote }));
      }
    } catch {
      setSelfTestLessonErrorByQId(prev => ({
        ...prev,
        [q.id]: "Network error while generating topic lesson."
      }));
    } finally {
      setGeneratingSelfTestLessonTarget(null);
    }
  };

  const handleSubmitSelfTest = () => {
    if (!activeSelfTest || !activeSelfTest.questions.length) return;
    const total = activeSelfTest.questions.length;
    const correctCount = activeSelfTest.questions.filter(
      q => isQuestionAnswerCorrect(q, selfTestAnswers[q.id], selfTestMultiAnswers[q.id])
    ).length;
    const scorePct = Math.round((correctCount / total) * 100);
    const nowIso = new Date().toISOString();

    const completedTest: KnowledgeTestArtifact = {
      ...activeSelfTest,
      completedAt: nowIso,
      lastScore: scorePct,
      lastScoreFraction: `${correctCount}/${total}`,
      attemptsCount: (activeSelfTest.attemptsCount || 0) + 1,
      questions: activeSelfTest.questions.map(q => ({
        ...q,
        userSelectedIndex: isMultiSelectQuestion(q) ? undefined : selfTestAnswers[q.id],
        userSelectedIndices: isMultiSelectQuestion(q) ? (selfTestMultiAnswers[q.id] || []) : undefined
      }))
    };
    setActiveSelfTest(completedTest);
    setSelfTestSubmitted(true);

    if (activeStepInfo) {
      updateTimerState(prev => {
        if (!prev?.subSteps) return prev;
        return {
          ...prev,
          subSteps: prev.subSteps.map(s =>
            s.id === activeStepInfo.id ? { ...s, lastTestScore: scorePct } : s
          )
        };
      });
    }

    if (activeGoal) {
      const currentHub: GoalKnowledgeHub = activeGoal.knowledgeHub || {
        notes: [],
        tests: [],
        flashcards: [],
        overallMasteryScore: 0
      };
      const exists = currentHub.tests.some(t => t.id === completedTest.id);
      const nextTests = exists
        ? currentHub.tests.map(t => (t.id === completedTest.id ? completedTest : t))
        : [completedTest, ...currentHub.tests];
      const scored = nextTests.filter(t => typeof t.lastScore === "number");
      const avgScore = scored.length > 0
        ? Math.round(scored.reduce((sum, t) => sum + (t.lastScore || 0), 0) / scored.length)
        : scorePct;
      persistGoalKnowledgeHub(activeGoal.id, {
        ...currentHub,
        tests: nextTests,
        lastTestedAt: nowIso,
        overallMasteryScore: avgScore
      });
    }
  };

  const handleTakeLiveScreenshot = async () => {
    if (isCapturingScreenshot) return;
    if (liveNoteScreenshots.length >= MAX_NOTE_IMAGES) {
      setScreenshotFallbackNotice(`Maximum ${MAX_NOTE_IMAGES} images per note. Save or remove one first.`);
      setTimeout(() => setScreenshotFallbackNotice(null), 3500);
      return;
    }
    setIsCapturingScreenshot(true);
    setScreenshotFallbackNotice(null);
    const result = await captureScreenScreenshot();
    setIsCapturingScreenshot(false);
    if (result.dataUrl) {
      setLiveNoteScreenshots(prev =>
        Array.from(new Set([...prev, result.dataUrl!])).slice(0, MAX_NOTE_IMAGES)
      );
      setNoteSavedFeedback("Screenshot attached! Save note whenever you're ready.");
      setTimeout(() => setNoteSavedFeedback(null), 3000);
    } else if (result.error) {
      setScreenshotFallbackNotice(result.error);
      setTimeout(() => setScreenshotFallbackNotice(null), 6000);
    }
  };

  const handleUploadLiveScreenshotFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setScreenshotFallbackNotice(null);
    const remaining = Math.max(0, MAX_NOTE_IMAGES - liveNoteScreenshots.length);
    if (remaining === 0) {
      setScreenshotFallbackNotice(`Maximum ${MAX_NOTE_IMAGES} images per note.`);
      setTimeout(() => setScreenshotFallbackNotice(null), 3500);
      return;
    }
    const added: string[] = [];
    const compact = files.length > 2;
    for (let i = 0; i < Math.min(files.length, remaining); i += 1) {
      try {
        const dataUrl = await readImageFileAsDataUrl(files[i], { compact });
        added.push(dataUrl);
      } catch {
        // Ignore invalid files
      }
    }
    if (added.length > 0) {
      setLiveNoteScreenshots(prev =>
        Array.from(new Set([...prev, ...added])).slice(0, MAX_NOTE_IMAGES)
      );
    }
  };

  const handleLiveNotesPaste = async (e: React.ClipboardEvent) => {
    // Read clipboard HTML/text/files synchronously before any await
    const snapshot = captureClipboardPasteSnapshot(e);
    if (!snapshot.hasPotentialImages) return;

    setScreenshotFallbackNotice(null);
    setIsProcessingLivePasteImages(true);
    try {
      const pastedImages = await extractImagesFromClipboardSnapshot(snapshot, MAX_NOTE_IMAGES);
      if (pastedImages.length > 0) {
        let addedCount = 0;
        let hitLimit = false;
        setLiveNoteScreenshots(prev => {
          const existingSet = new Set(prev);
          const uniqueNew = pastedImages.filter(src => !existingSet.has(src));
          const availableSlots = Math.max(0, MAX_NOTE_IMAGES - prev.length);
          addedCount = Math.min(uniqueNew.length, availableSlots);
          hitLimit = uniqueNew.length > availableSlots;
          return [...prev, ...uniqueNew].slice(0, MAX_NOTE_IMAGES);
        });
        if (addedCount > 0) {
          setNoteSavedFeedback(
            `Stored ${addedCount} image${addedCount === 1 ? "" : "s"} from pasted content${hitLimit ? ` (max ${MAX_NOTE_IMAGES})` : ""}!`
          );
          setTimeout(() => setNoteSavedFeedback(null), 4000);
        } else if (hitLimit) {
          setScreenshotFallbackNotice(`Maximum ${MAX_NOTE_IMAGES} images per note reached.`);
          setTimeout(() => setScreenshotFallbackNotice(null), 3500);
        }
      }
    } finally {
      setIsProcessingLivePasteImages(false);
    }
  };

  const insertBlankIntoLivePrompt = () => {
    const el = liveNoteQuestionRef.current;
    if (!el) {
      setLiveNoteQuestion(prev => (prev ? `${prev.trimEnd()} ___` : "___"));
      return;
    }
    const start = el.selectionStart ?? liveNoteQuestion.length;
    const end = el.selectionEnd ?? liveNoteQuestion.length;
    const before = liveNoteQuestion.slice(0, start);
    const after = liveNoteQuestion.slice(end);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
    const insertion = `${needsLeadingSpace ? " " : ""}___${needsTrailingSpace ? " " : ""}`;
    const nextValue = `${before}${insertion}${after}`;
    const nextCursor = start + insertion.length;
    setLiveNoteQuestion(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const compactMcqDraft = (opts: string[], selectedIdx: number) => {
    const mapped: { text: string; isCorrect: boolean }[] = [];
    opts.forEach((raw, idx) => {
      const trimmed = raw.trim();
      if (trimmed) {
        mapped.push({ text: trimmed, isCorrect: idx === selectedIdx });
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
      if (trimmed) {
        if (selectedSet.has(idx)) {
          correctIndices.push(cleanedOptions.length);
        }
        cleanedOptions.push(trimmed);
      }
    });
    return { cleanedOptions, correctIndices };
  };

  const handleSaveLiveStudyNote = async () => {
    const isQA = liveNoteCategory === "qa";
    const isFillInBlank = liveNoteCategory === "fill_in_blank";
    const isMultipleChoice = liveNoteCategory === "multiple_choice";
    const isMultipleSelect = liveNoteCategory === "multiple_select";
    const isTrueFalse = liveNoteCategory === "true_false";
    const isDefinition = liveNoteCategory === "definition";
    const isTable = liveNoteCategory === "table";
    const isReadingUrl = liveNoteCategory === "reading_url";
    const isUrl = liveNoteCategory === "url" || isReadingUrl;
    const isVideoUpload = liveNoteCategory === "video_upload";
    const hasScreenshots = liveNoteScreenshots.length > 0;
    if (!activeGoal) return;

    const currentHub: GoalKnowledgeHub = activeGoal.knowledgeHub || {
      notes: [],
      tests: [],
      flashcards: [],
      overallMasteryScore: 0
    };

    const activeChapter = activeGoal.chapters?.find(c => !c.completed)?.title || undefined;

    if (isVideoUpload) {
      const cleanedLiveTranscript = stripInlineBase64ImagesFromText(liveUploadTranscriptText).cleanedText.trim();
      if (!liveUploadVideoFile && !liveUploadTranscriptFile && !cleanedLiveTranscript) {
        if (hasScreenshots) {
          const screenshotNote: StudyArtifactNote = {
            id: `note_${Date.now()}`,
            title: liveNoteTitle.trim() || `${activeGoal.name} Lecture Images`,
            category: "summary",
            content: "Attached lecture images",
            screenshots: [...liveNoteScreenshots],
            chapterTitle: activeChapter,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          persistGoalKnowledgeHub(activeGoal.id, {
            ...currentHub,
            notes: [screenshotNote, ...currentHub.notes]
          });
          setNoteSavedFeedback(`Saved note with ${liveNoteScreenshots.length} stored image${liveNoteScreenshots.length === 1 ? "" : "s"}!`);
          setLiveNoteTitle("");
          setLiveNoteScreenshots([]);
          setShowLiveAttachments(false);
          setScreenshotFallbackNotice(null);
          setTimeout(() => setNoteSavedFeedback(null), 4000);
          return;
        }
        setNoteSavedFeedback("Please select a downloaded video/audio file, upload a transcript, paste text, or attach a screenshot.");
        setTimeout(() => setNoteSavedFeedback(null), 4000);
        return;
      }

      setIsExtractingLiveUpload(true);
      setNoteSavedFeedback(
        liveUploadVideoFile
          ? `Analyzing "${liveUploadVideoFile.name}"${cleanedLiveTranscript || liveUploadTranscriptFile ? " + text" : ""}... Larger videos may take 30–90s.`
          : "Extracting study notes & quiz questions from your lecture text..."
      );

      try {
        const formData = new FormData();
        if (liveUploadVideoFile) formData.append("video", liveUploadVideoFile);
        if (liveUploadTranscriptFile) formData.append("transcriptFile", liveUploadTranscriptFile);
        if (cleanedLiveTranscript) formData.append("transcriptText", cleanedLiveTranscript);
        if (liveNoteTitle.trim()) formData.append("lessonTitle", liveNoteTitle.trim());
        formData.append("goalTitle", activeGoal.name);
        formData.append("goalCategory", activeGoal.category || "General");
        formData.append("chapterTitle", activeChapter || "");
        formData.append("mode", "both");
        formData.append("questionCount", "5");

        const res = await fetch("/api/coach/extract-from-upload", {
          method: "POST",
          body: formData
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNoteSavedFeedback(data?.error || "Could not extract study notes or quiz from that upload.");
          setTimeout(() => setNoteSavedFeedback(null), res.status === 429 || res.status === 503 ? 8500 : 5500);
          return;
        }

        const rawExtractedNotes: StudyArtifactNote[] = Array.isArray(data.notes) ? data.notes : [];
        let extractedNotes = rawExtractedNotes;
        if (hasScreenshots) {
          if (rawExtractedNotes.length > 0) {
            extractedNotes = rawExtractedNotes.map((n, idx) =>
              idx === 0
                ? {
                    ...n,
                    screenshots: Array.from(
                      new Set([...(n.screenshots || []), ...liveNoteScreenshots])
                    ).slice(0, MAX_NOTE_IMAGES)
                  }
                : n
            );
          } else {
            extractedNotes = [
              {
                id: `note_${Date.now()}`,
                title: liveNoteTitle.trim() || data.extractedTitle || `${activeGoal.name} Study Material`,
                category: "summary",
                content: cleanedLiveTranscript ? cleanedLiveTranscript.slice(0, 12000) : "Attached study images",
                screenshots: [...liveNoteScreenshots],
                chapterTitle: activeChapter,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ];
          }
        }
        const extractedCards = Array.isArray(data.flashcards) ? data.flashcards : [];
        const extractedTests = data.test ? [data.test, ...currentHub.tests] : currentHub.tests;

        persistGoalKnowledgeHub(activeGoal.id, {
          ...currentHub,
          notes: [...extractedNotes, ...currentHub.notes],
          flashcards: [...extractedCards, ...currentHub.flashcards],
          tests: extractedTests
        });

        const parts: string[] = [];
        if (extractedNotes.length > 0) parts.push(`${extractedNotes.length} notes`);
        if (extractedCards.length > 0) parts.push(`${extractedCards.length} flashcards`);
        if (data.test) parts.push(`${data.test.questions?.length || 0} quiz Qs`);
        setNoteSavedFeedback(
          `Extracted ${parts.join(", ") || "study material"} from "${data.extractedTitle || "your lecture"}"!`
        );
        setLiveUploadVideoFile(null);
        setLiveUploadTranscriptFile(null);
        setLiveUploadTranscriptText("");
        setLiveNoteTitle("");
        setLiveNoteScreenshots([]);
        setShowLiveAttachments(false);
        setScreenshotFallbackNotice(null);
        setLiveUploadInputKey(k => k + 1);
        setTimeout(() => setNoteSavedFeedback(null), 6000);
      } catch {
        setNoteSavedFeedback("Upload failed or timed out. Check file size (max 250 MB) or include transcript text.");
        setTimeout(() => setNoteSavedFeedback(null), 5000);
      } finally {
        setIsExtractingLiveUpload(false);
      }
      return;
    }

    if (isQA) {
      if ((!liveNoteQuestion.trim() || !liveNoteAnswer.trim()) && !hasScreenshots) return;
    } else if (isFillInBlank) {
      const resolvedFill = resolveFillInBlankDraft(liveNoteQuestion, liveNoteAnswer);
      if ((!resolvedFill.prompt || !resolvedFill.answer) && !hasScreenshots) return;
    } else if (isMultipleChoice) {
      const { cleanedOptions, correctIndex } = compactMcqDraft(liveNoteMcqOptions, liveNoteMcqCorrectIndex);
      if ((!liveNoteQuestion.trim() || cleanedOptions.length < 2 || correctIndex < 0) && !hasScreenshots) return;
    } else if (isMultipleSelect) {
      const { cleanedOptions, correctIndices } = compactMultiSelectDraft(liveNoteMcqOptions, liveNoteMultiSelectIndices);
      if ((!liveNoteQuestion.trim() || cleanedOptions.length < 2 || correctIndices.length < 1) && !hasScreenshots) return;
    } else if (isTrueFalse) {
      if (!liveNoteQuestion.trim() && !hasScreenshots) return;
    } else if (isDefinition) {
      if ((!liveNoteTerm.trim() || !liveNoteDefinition.trim()) && !hasScreenshots) return;
    } else if (isTable) {
      const checkTable = normalizeTableDraft(liveNoteTableHeaders, liveNoteTableRows);
      if (!checkTable.hasContent && !hasScreenshots) return;
    } else if (isUrl) {
      if (!liveNoteUrl.trim() || !isSafeHttpUrl(liveNoteUrl)) {
        setNoteSavedFeedback("Please enter a valid http:// or https:// URL.");
        setTimeout(() => setNoteSavedFeedback(null), 3500);
        return;
      }
    } else if (!liveNoteContent.trim() && !hasScreenshots) {
      return;
    }

    const existingGoalNotes = activeGoal?.knowledgeHub?.notes || [];
    const liveDupAnswer = isMultipleSelect
      ? liveNoteMultiSelectIndices.map(i => liveNoteMcqOptions[i]?.trim()).filter(Boolean).join(", ")
      : isMultipleChoice
      ? (liveNoteMcqOptions[liveNoteMcqCorrectIndex]?.trim() || liveNoteAnswer)
      : liveNoteAnswer;
    const liveDupMatches = findPotentialDuplicateNotes(
      {
        category: liveNoteCategory,
        title: liveNoteTitle,
        content: liveNoteContent,
        question: liveNoteQuestion,
        answer: liveDupAnswer,
        explanation: liveNoteExplanation,
        term: liveNoteTerm,
        definition: liveNoteDefinition,
        url: liveNoteUrl,
        urlNotes: liveNoteUrlContext,
        tableHeaders: liveNoteTableHeaders,
        tableRows: liveNoteTableRows
      },
      existingGoalNotes,
      3
    );

    if (liveDupMatches.length > 0 && !allowDuplicateLiveNoteSave) {
      setBlockedDuplicateLiveSave(true);
      setNoteSavedFeedback(
        `Already saved (${liveDupMatches[0].similarityPercent}% similar: "${liveDupMatches[0].note.title}"). Review the highlighted warning below before adding.`
      );
      setTimeout(() => setNoteSavedFeedback(null), 5000);
      return;
    }

    const resolvedFillBlank = isFillInBlank ? resolveFillInBlankDraft(liveNoteQuestion, liveNoteAnswer) : null;
    const resolvedMcq = isMultipleChoice ? compactMcqDraft(liveNoteMcqOptions, liveNoteMcqCorrectIndex) : null;
    const resolvedMulti = isMultipleSelect ? compactMultiSelectDraft(liveNoteMcqOptions, liveNoteMultiSelectIndices) : null;
    const resolvedTable = isTable ? normalizeTableDraft(liveNoteTableHeaders, liveNoteTableRows) : null;
    const trimmedQuestion = isFillInBlank
      ? (resolvedFillBlank?.prompt || (hasScreenshots ? "Screenshot Fill-in-the-Blank" : ""))
      : (liveNoteQuestion.trim() || (
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
          ? resolvedMulti.correctIndices.map(i => resolvedMulti.cleanedOptions[i]).filter(Boolean).join(", ")
          : (hasScreenshots ? "See attached screenshot" : ""))
      : isMultipleChoice
      ? (resolvedMcq && resolvedMcq.correctIndex >= 0
          ? resolvedMcq.cleanedOptions[resolvedMcq.correctIndex]
          : (hasScreenshots ? "See attached screenshot" : ""))
      : isTrueFalse
      ? (liveNoteTrueFalseAnswer === "true" ? "True" : "False")
      : (liveNoteAnswer.trim() || (isQA && hasScreenshots ? "See attached screenshot" : ""));
    const trimmedExplanation = liveNoteExplanation.trim();
    const trimmedTerm = liveNoteTerm.trim() || (isDefinition && hasScreenshots ? "Screenshot Term" : "");
    const trimmedDefinition = liveNoteDefinition.trim() || (isDefinition && hasScreenshots ? "See attached screenshot" : "");
    const trimmedUrl = liveNoteUrl.trim();
    const trimmedUrlContext = liveNoteUrlContext.trim();

    let defaultUrlTitle = trimmedUrl;
    if (isUrl) {
      try {
        defaultUrlTitle = new URL(trimmedUrl).hostname.replace(/^www\./, "");
      } catch {}
    }

    const markLoginRequired = isUrl && !isReadingUrl && (liveNoteRequiresLogin || (isLikelyLoginProtectedUrl(trimmedUrl) && !trimmedUrlContext));
    const markReadingAssignment = isReadingUrl ? liveNoteAssignReading : false;

    const savedNoteId = `note_${Date.now()}`;
    const choiceSource = isMultipleSelect ? resolvedMulti?.cleanedOptions : resolvedMcq?.cleanedOptions;
    const mcqChoicesFormatted = choiceSource && choiceSource.length > 0
      ? choiceSource.map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`).join("\n")
      : "";
    const mcqCorrectLabel = resolvedMcq && resolvedMcq.correctIndex >= 0
      ? `${String.fromCharCode(65 + resolvedMcq.correctIndex)}) ${resolvedMcq.cleanedOptions[resolvedMcq.correctIndex]}`
      : trimmedAnswer;
    const multiCorrectLabel = resolvedMulti && resolvedMulti.correctIndices.length > 0
      ? resolvedMulti.correctIndices
          .map(i => `${String.fromCharCode(65 + i)}) ${resolvedMulti.cleanedOptions[i]}`)
          .join(", ")
      : trimmedAnswer;

    const newNote: StudyArtifactNote = {
      id: savedNoteId,
      title: isQA || isFillInBlank || isMultipleChoice || isMultipleSelect || isTrueFalse
        ? trimmedQuestion
        : isDefinition
        ? trimmedTerm
        : isTable
        ? (liveNoteTitle.trim() || `${activeGoal.name} Table (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`)
        : isUrl
        ? (liveNoteTitle.trim() || defaultUrlTitle)
        : liveNoteTitle.trim() || `${activeGoal.name} Study Note (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      category: isUrl ? "url" : (liveNoteCategory as StudyArtifactNote["category"]),
      content: isTable
        ? (resolvedTable?.hasContent ? formatTableAsMarkdown(resolvedTable.headers, resolvedTable.rows) : "Attached table screenshot")
        : isMultipleSelect
        ? `Q: ${trimmedQuestion}${mcqChoicesFormatted ? `\n\n${mcqChoicesFormatted}` : ""}\n\nCorrect Answers: ${multiCorrectLabel}${trimmedExplanation ? `\n\nExplanation: ${trimmedExplanation}` : ""}`
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
        : (liveNoteContent.trim() || "Attached screenshot"),
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
        ? (liveNoteTrueFalseAnswer === "true" ? 0 : 1)
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
      screenshots: hasScreenshots ? [...liveNoteScreenshots] : undefined,
      requiresLogin: isUrl ? markLoginRequired : undefined,
      urlAccessNote: markLoginRequired && !trimmedUrlContext
        ? "This link requires signing in. Open it directly to study and review."
        : undefined,
      chapterTitle: activeChapter,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const baseHub: GoalKnowledgeHub = {
      ...currentHub,
      notes: [newNote, ...currentHub.notes]
    };

    persistGoalKnowledgeHub(activeGoal.id, baseHub);

    const shouldExtract = isUrl && extractOnUrlSave && (!markLoginRequired || trimmedUrlContext.length > 0);

    if (shouldExtract) {
      setIsExtractingLiveUrl(true);
      setNoteSavedFeedback("Link saved. Extracting study notes & quiz questions...");
      let feedbackTimeoutMs = 5000;
      try {
        const res = await fetch("/api/coach/extract-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: trimmedUrl,
            goalTitle: activeGoal.name,
            goalCategory: activeGoal.category || "General",
            chapterTitle: activeChapter || "",
            userNotes: trimmedUrlContext,
            mode: "both"
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 429 || res.status === 503) feedbackTimeoutMs = 8500;
          setNoteSavedFeedback(
            data?.error
              ? `Link saved. ${data.error}`
              : "Link saved, but could not extract notes from this URL."
          );
        } else {
          const isRestricted = data.accessStatus === "restricted" || (data.accessStatus === "partial_public" && (!data.test || !data.notes?.length));
          const updatedNotesList = baseHub.notes.map(n =>
            n.id === savedNoteId
              ? {
                  ...n,
                  title: data.extractedTitle && !liveNoteTitle.trim() ? data.extractedTitle : n.title,
                  requiresLogin: isRestricted ? true : n.requiresLogin,
                  urlAccessNote: isRestricted ? (data.accessNote || "Login required — study this link directly.") : n.urlAccessNote
                }
              : n
          );
          const extractedNotes: StudyArtifactNote[] = Array.isArray(data.notes) ? data.notes : [];
          const extractedCards = Array.isArray(data.flashcards) ? data.flashcards : [];
          const extractedTests = data.test ? [data.test, ...baseHub.tests] : baseHub.tests;

          persistGoalKnowledgeHub(activeGoal.id, {
            ...baseHub,
            notes: [...extractedNotes, ...updatedNotesList],
            flashcards: [...extractedCards, ...baseHub.flashcards],
            tests: extractedTests
          });

          const summaryParts: string[] = [];
          if (extractedNotes.length > 0) summaryParts.push(`${extractedNotes.length} notes`);
          if (data.test) summaryParts.push(`${data.test.questions?.length || 0} quiz Qs`);
          const prefix = summaryParts.length > 0 ? `Extracted ${summaryParts.join(" & ")}! ` : "Link saved. ";
          setNoteSavedFeedback(`${prefix}${data.accessNote || ""}`.trim());
        }
      } catch {
        setNoteSavedFeedback("Link saved, but URL extraction failed. Open Hub to retry.");
      } finally {
        setIsExtractingLiveUrl(false);
        setLiveNoteUrl("");
        setLiveNoteUrlContext("");
        setLiveNoteRequiresLogin(false);
        setLiveNoteTitle("");
        setLiveNoteScreenshots([]);
        setShowLiveAttachments(false);
        setScreenshotFallbackNotice(null);
        setTimeout(() => setNoteSavedFeedback(null), feedbackTimeoutMs);
        requestAnimationFrame(() => {
          liveNoteUrlRef.current?.focus();
        });
      }
      return;
    }

    setNoteSavedFeedback(
      isMultipleSelect
        ? "Multiple Select question saved to Goal Study Hub!"
        : isMultipleChoice
        ? "Multiple Choice question saved to Goal Study Hub!"
        : isTrueFalse
        ? "True / False question saved to Goal Study Hub!"
        : isFillInBlank
        ? "Fill-in-the-Blank note saved to Goal Study Hub!"
        : isQA
        ? "Q&A note saved to Goal Study Hub!"
        : isDefinition
        ? "Definition saved to Goal Study Hub!"
        : isTable
        ? "Table note saved to Goal Study Hub!"
        : isReadingUrl && markReadingAssignment
        ? "Reading link saved! I'll remind you to read this website when studying, reviewing, or testing."
        : isUrl && markLoginRequired
        ? "Saved! I'll remind you to go study this link when you study, review, or test."
        : isUrl
        ? "URL saved to Goal Study Hub!"
        : "Note saved to Goal Study Hub!"
    );
    setLiveNoteContent("");
    setLiveNoteQuestion("");
    setLiveNoteAnswer("");
    setLiveNoteExplanation("");
    setLiveNoteMcqOptions(["", "", "", ""]);
    setLiveNoteMcqCorrectIndex(0);
    setLiveNoteMultiSelectIndices([0]);
    setLiveNoteTrueFalseAnswer("true");
    setLiveNoteTerm("");
    setLiveNoteDefinition("");
    setLiveNoteTableHeaders(createEmptyTableHeaders(3));
    setLiveNoteTableRows(createEmptyTableRows(3, 3));
    setLiveNoteUrl("");
    setLiveNoteUrlContext("");
    setLiveNoteRequiresLogin(false);
    setLiveNoteTitle("");
    setLiveNoteScreenshots([]);
    setShowLiveAttachments(false);
    setAllowDuplicateLiveNoteSave(false);
    setBlockedDuplicateLiveSave(false);
    setScreenshotFallbackNotice(null);
    setTimeout(() => setNoteSavedFeedback(null), 4000);
    requestAnimationFrame(() => {
      if (isQA || isFillInBlank || isMultipleChoice || isMultipleSelect || isTrueFalse) {
        liveNoteQuestionRef.current?.focus();
      } else if (isDefinition) {
        liveNoteTermRef.current?.focus();
      } else if (isUrl) {
        liveNoteUrlRef.current?.focus();
      } else {
        liveNoteTitleRef.current?.focus();
      }
    });
  };

  const liveDraftDuplicateMatches = useMemo(() => {
    const notes = activeGoal?.knowledgeHub?.notes || [];
    if (notes.length === 0 || liveNoteCategory === "video_upload") return [];
    const draftAnswer =
      liveNoteCategory === "multiple_select"
        ? liveNoteMultiSelectIndices.map(i => liveNoteMcqOptions[i]?.trim()).filter(Boolean).join(", ")
        : liveNoteCategory === "multiple_choice"
        ? (liveNoteMcqOptions[liveNoteMcqCorrectIndex]?.trim() || liveNoteAnswer)
        : liveNoteAnswer;
    return findPotentialDuplicateNotes(
      {
        category: liveNoteCategory,
        title: liveNoteTitle,
        content: liveNoteContent,
        question: liveNoteQuestion,
        answer: draftAnswer,
        explanation: liveNoteExplanation,
        term: liveNoteTerm,
        definition: liveNoteDefinition,
        url: liveNoteUrl,
        urlNotes: liveNoteUrlContext,
        tableHeaders: liveNoteTableHeaders,
        tableRows: liveNoteTableRows
      },
      notes,
      3
    );
  }, [
    activeGoal?.knowledgeHub?.notes,
    liveNoteCategory,
    liveNoteTitle,
    liveNoteContent,
    liveNoteQuestion,
    liveNoteAnswer,
    liveNoteMcqOptions,
    liveNoteMcqCorrectIndex,
    liveNoteMultiSelectIndices,
    liveNoteExplanation,
    liveNoteTerm,
    liveNoteDefinition,
    liveNoteUrl,
    liveNoteUrlContext,
    liveNoteTableHeaders,
    liveNoteTableRows
  ]);

  const liveDupSignature = liveDraftDuplicateMatches
    .map(m => `${m.note.id}:${m.similarityPercent}`)
    .join("|");

  useEffect(() => {
    setAllowDuplicateLiveNoteSave(false);
    setBlockedDuplicateLiveSave(false);
  }, [liveDupSignature]);

  const isLiveNoteSaveDisabled =
    isExtractingLiveUrl ||
    isExtractingLiveUpload ||
    (liveNoteCategory === "qa"
      ? (!liveNoteQuestion.trim() || !liveNoteAnswer.trim()) && liveNoteScreenshots.length === 0
      : liveNoteCategory === "fill_in_blank"
      ? (() => {
          const resolvedFill = resolveFillInBlankDraft(liveNoteQuestion, liveNoteAnswer);
          return (!resolvedFill.prompt || !resolvedFill.answer) && liveNoteScreenshots.length === 0;
        })()
      : liveNoteCategory === "multiple_choice"
      ? (() => {
          const resolvedMcq = compactMcqDraft(liveNoteMcqOptions, liveNoteMcqCorrectIndex);
          return (!liveNoteQuestion.trim() || resolvedMcq.cleanedOptions.length < 2 || resolvedMcq.correctIndex < 0) && liveNoteScreenshots.length === 0;
        })()
      : liveNoteCategory === "multiple_select"
      ? (() => {
          const resolvedMulti = compactMultiSelectDraft(liveNoteMcqOptions, liveNoteMultiSelectIndices);
          return (!liveNoteQuestion.trim() || resolvedMulti.cleanedOptions.length < 2 || resolvedMulti.correctIndices.length < 1) && liveNoteScreenshots.length === 0;
        })()
      : liveNoteCategory === "true_false"
      ? !liveNoteQuestion.trim() && liveNoteScreenshots.length === 0
      : liveNoteCategory === "definition"
      ? (!liveNoteTerm.trim() || !liveNoteDefinition.trim()) && liveNoteScreenshots.length === 0
      : liveNoteCategory === "table"
      ? !normalizeTableDraft(liveNoteTableHeaders, liveNoteTableRows).hasContent && liveNoteScreenshots.length === 0
      : liveNoteCategory === "url" || liveNoteCategory === "reading_url"
      ? !liveNoteUrl.trim()
      : liveNoteCategory === "video_upload"
      ? !liveUploadVideoFile && !liveUploadTranscriptFile && !liveUploadTranscriptText.trim() && liveNoteScreenshots.length === 0
      : !liveNoteContent.trim() && liveNoteScreenshots.length === 0);

  const liveNoteSaveShortcutRef = useRef<{
    canTrigger: boolean;
    disabled: boolean;
    save: () => Promise<void>;
    canInsertBlank: boolean;
    insertBlank: () => void;
  }>({
    canTrigger: false,
    disabled: true,
    save: handleSaveLiveStudyNote,
    canInsertBlank: false,
    insertBlank: insertBlankIntoLivePrompt
  });
  liveNoteSaveShortcutRef.current = {
    canTrigger: Boolean(showLiveNotes && !showKnowledgeHubModal),
    disabled: isLiveNoteSaveDisabled,
    save: handleSaveLiveStudyNote,
    canInsertBlank: Boolean(showLiveNotes && !showKnowledgeHubModal && liveNoteCategory === "fill_in_blank"),
    insertBlank: insertBlankIntoLivePrompt
  };

  // Request browser desktop notification permission on mount
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {}
  }, []);

  // Sync props if provided explicitly by parent
  useEffect(() => {
    if (propIsOpen && propSessionTitle && propInitialDurationMinutes) {
      unlockAudioEngine();
      const saved = getSavedProgress(propGoalId, propEventId, propSessionTitle);
      const initialSec = Math.max(1, propInitialDurationMinutes) * 60;

      const resolvedSteps = resolveAndBalanceSubSteps(
        propSubSteps,
        propGoalId,
        propSessionTitle,
        propInitialDurationMinutes,
        goals
      );

      if (saved && saved.timeRemaining > 0 && saved.timeRemaining < saved.totalSec) {
        const restoredTimer: ActiveTimerData = {
          title: saved.title || propSessionTitle,
          totalSec: saved.totalSec,
          timeRemaining: saved.timeRemaining,
          targetEndTime: null,
          isRunning: false,
          isCompleted: false,
          eventId: saved.eventId || propEventId,
          goalId: saved.goalId || propGoalId,
          category: saved.category || propCategory,
          color: saved.color || propColor,
          previousSessionNote: propPreviousSessionNote !== undefined ? propPreviousSessionNote : saved.previousSessionNote,
          sessionTakeawayNote: saved.sessionTakeawayNote || "",
          isMinimized: false,
          isOpen: true,
          subSteps: resolvedSteps || saved.subSteps || propSubSteps,
          sessionStartedAt: saved.sessionStartedAt || Date.now(),
          savedNoteStepKeys: saved.savedNoteStepKeys || []
        };
        setTimerState(restoredTimer);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredTimer));
      } else {
        const newTimer: ActiveTimerData = {
          title: propSessionTitle,
          totalSec: initialSec,
          timeRemaining: initialSec,
          targetEndTime: null,
          isRunning: false,
          isCompleted: false,
          eventId: propEventId,
          goalId: propGoalId,
          category: propCategory,
          color: propColor,
          previousSessionNote: propPreviousSessionNote,
          sessionTakeawayNote: "",
          isMinimized: false,
          isOpen: true,
          subSteps: resolvedSteps || propSubSteps,
          sessionStartedAt: Date.now(),
          savedNoteStepKeys: []
        };
        setTimerState(newTimer);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newTimer));
      }
    }
  }, [propIsOpen, propSessionTitle, propInitialDurationMinutes, propEventId, propGoalId, propCategory, propColor, propPreviousSessionNote, propSubSteps, goals]);

  // Global custom event listener
  useEffect(() => {
    const handleOpenTimerEvent = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      unlockAudioEngine();
      const openModal = detail.openModal !== false;
      const shouldAutoStart = detail.autoStart ?? false;

      const durationMinutes = Math.max(1, detail.duration || 60);
      const initialSec = durationMinutes * 60;
      const resolvedSteps = resolveAndBalanceSubSteps(
        detail.subSteps,
        detail.goalId,
        detail.title,
        durationMinutes,
        goals
      );

      setBottomNoteTargetStepId("");
      setEditingStepNoteId(null);
      setBottomStepSavedToast(null);

      setTimerState((prev) => {
        const matchesCurrent = prev && (
          (detail.goalId && prev.goalId === detail.goalId) ||
          (detail.eventId && prev.eventId === detail.eventId) ||
          (detail.title && prev.title?.toLowerCase() === detail.title?.toLowerCase())
        );

        const wantsExplicitFreshStart = Boolean(detail.forceNew);

        if (!wantsExplicitFreshStart && matchesCurrent && prev && prev.timeRemaining < prev.totalSec && !prev.isCompleted) {
          const now = Date.now();
          const isRunning = shouldAutoStart ? true : prev.isRunning;
          const targetEndTime = isRunning 
            ? (prev.targetEndTime || (now + prev.timeRemaining * 1000))
            : prev.targetEndTime;
          const startedAt = prev.startedAt || (isRunning ? now : null);

          const updated = {
            ...prev,
            isOpen: openModal ? true : prev.isOpen,
            isMinimized: openModal ? false : prev.isMinimized,
            isRunning,
            targetEndTime,
            startedAt,
            previousSessionNote: detail.previousSessionNote !== undefined ? detail.previousSessionNote : prev.previousSessionNote,
            subSteps: resolvedSteps || detail.subSteps || prev.subSteps
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        }

        const saved = wantsExplicitFreshStart ? null : getSavedProgress(detail.goalId, detail.eventId, detail.title);
        const now = Date.now();

        if (saved && saved.timeRemaining > 0 && saved.timeRemaining < saved.totalSec) {
          const remaining = saved.timeRemaining;
          const isRunning = shouldAutoStart;
          const targetEndTime = isRunning ? now + remaining * 1000 : null;
          const startedAt = isRunning ? now : null;

          const restoredTimer: ActiveTimerData = {
            title: saved.title || detail.title || "Focus Session",
            totalSec: saved.totalSec,
            timeRemaining: saved.timeRemaining,
            targetEndTime,
            startedAt,
            lastPausedAt: null,
            isRunning,
            isCompleted: false,
            eventId: saved.eventId || detail.eventId,
            goalId: saved.goalId || detail.goalId,
            category: saved.category || detail.category,
            color: saved.color || detail.color || "#6366f1",
            previousSessionNote: detail.previousSessionNote !== undefined ? detail.previousSessionNote : saved.previousSessionNote,
            sessionTakeawayNote: saved.sessionTakeawayNote || "",
            isMinimized: !openModal,
            isOpen: openModal,
            subSteps: resolvedSteps || saved.subSteps || detail.subSteps,
            sessionStartedAt: saved.sessionStartedAt || now,
            savedNoteStepKeys: saved.savedNoteStepKeys || []
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredTimer));
          return restoredTimer;
        }

        const isRunning = shouldAutoStart;
        const targetEndTime = isRunning ? now + initialSec * 1000 : null;
        const startedAt = isRunning ? now : null;

        // Auto-resolve eventId if not explicitly provided, but matching today's scheduled session
        let resolvedEventId = detail.eventId || saved?.eventId;
        if (!resolvedEventId) {
          try {
            const rawEvents = localStorage.getItem("cached_events");
            if (rawEvents) {
              const parsedEvts: CalendarEvent[] = JSON.parse(rawEvents);
              const todayStr = new Date().toDateString();
              const term = (detail.title || "").toLowerCase().trim();
              const found = parsedEvts.find(e => 
                !e.completed && 
                new Date(e.start).toDateString() === todayStr &&
                (
                  (detail.goalId && e.goalId === detail.goalId) ||
                  (term && (e.title.toLowerCase().includes(term) || term.includes(e.title.toLowerCase())))
                )
              );
              if (found) {
                resolvedEventId = found.id;
              }
            }
          } catch {}
        }

        // Suppress pre-session alert for this resolved event immediately
        if (resolvedEventId) {
          try {
            const existing: string[] = JSON.parse(localStorage.getItem("notified_event_alert_ids") || "[]");
            if (!existing.includes(resolvedEventId)) {
              localStorage.setItem("notified_event_alert_ids", JSON.stringify([...existing, resolvedEventId]));
            }
          } catch {}
        }

        const newTimer: ActiveTimerData = {
          title: detail.title || "Focus Session",
          totalSec: initialSec,
          timeRemaining: initialSec,
          targetEndTime,
          startedAt,
          lastPausedAt: null,
          isRunning,
          isCompleted: false,
          eventId: resolvedEventId,
          goalId: detail.goalId,
          category: detail.category,
          color: detail.color || "#6366f1",
          previousSessionNote: detail.previousSessionNote,
          sessionTakeawayNote: "",
          isMinimized: !openModal,
          isOpen: openModal,
          subSteps: resolvedSteps || detail.subSteps,
          sessionStartedAt: now,
          savedNoteStepKeys: []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newTimer));
        return newTimer;
      });
    };

    const handleGlobalPause = () => {
      unlockAudioEngine();
      const now = Date.now();
      setTimerState((prev) => {
        if (!prev) return null;
        const next = {
          ...prev,
          isRunning: false,
          lastPausedAt: now,
          targetEndTime: null
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        saveProgressToMap(next);
        return next;
      });
    };

    const handleGlobalResume = () => {
      unlockAudioEngine();
      const now = Date.now();
      setTimerState((prev) => {
        if (!prev) return null;
        let remaining = prev.timeRemaining;
        if (remaining <= 0) remaining = prev.totalSec;
        const next = {
          ...prev,
          timeRemaining: remaining,
          startedAt: prev.startedAt || now,
          lastPausedAt: null,
          targetEndTime: now + remaining * 1000,
          isRunning: true,
          isCompleted: false
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        saveProgressToMap(next);
        return next;
      });
    };

    const handleGlobalFinish = () => {
      unlockAudioEngine();
      let finishedData: {
        eventId?: string;
        goalId?: string;
        note?: string;
        title: string;
        savedStepKeys?: string[];
        sessionStartedAt?: number;
      } | null = null;
      setTimerState((prev) => {
        if (!prev) return null;
        finishedData = {
          eventId: prev.eventId,
          goalId: prev.goalId,
          note: prev.sessionTakeawayNote?.trim() || undefined,
          title: prev.title,
          savedStepKeys: prev.savedNoteStepKeys || [],
          sessionStartedAt: prev.sessionStartedAt || prev.startedAt || undefined
        };
        clearSavedProgress(prev.goalId, prev.eventId, prev.title);
        localStorage.removeItem(STORAGE_KEY);
        return null;
      });

      if (finishedData) {
        const data = finishedData;
        triggerCompletionBell(data.title);
        queueMicrotask(() => {
          if (onCompleteRef.current) {
            onCompleteRef.current(data.eventId, data.goalId, data.note, data.title, {
              savedStepKeys: data.savedStepKeys,
              sessionStartedAt: data.sessionStartedAt
            });
          }
          try {
            window.dispatchEvent(new CustomEvent("focus_session_completed", {
              detail: data
            }));
          } catch {}
        });
      }
    };

    const handleGlobalStepNoteSaved = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      const stepId: string | undefined = detail.stepId;
      const stepTitle: string = (detail.stepTitle || "").trim().toLowerCase();
      const normKey = stepTitle ? `title:${stepTitle}` : "";
      const isSaved = Boolean(detail.saved);
      setTimerState((prev) => {
        if (!prev) return null;
        if (detail.goalId && prev.goalId && detail.goalId !== prev.goalId) return prev;
        const currentKeys = new Set(prev.savedNoteStepKeys || []);
        if (isSaved) {
          if (stepId) currentKeys.add(stepId);
          if (normKey) currentKeys.add(normKey);
        } else {
          if (stepId) currentKeys.delete(stepId);
          if (normKey) currentKeys.delete(normKey);
        }
        const next = { ...prev, savedNoteStepKeys: Array.from(currentKeys) };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        saveProgressToMap(next);
        return next;
      });
    };

    const handleGlobalUpdateSubsteps = (e: any) => {
      const steps = e.detail?.subSteps;
      if (!steps) return;
      setTimerState((prev) => {
        if (!prev) return null;
        const next = { ...prev, subSteps: steps };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        saveProgressToMap(next);
        return next;
      });
    };

    const handleGlobalSetDuration = (e: any) => {
      const newMins = e.detail?.durationMinutes;
      if (!newMins || newMins <= 0) return;
      setTimerState((prev) => {
        if (!prev) return null;
        const newTotalSec = newMins * 60;
        const spent = prev.totalSec - prev.timeRemaining;
        const newRemaining = Math.max(1, newTotalSec - spent);
        const next = {
          ...prev,
          totalSec: newTotalSec,
          timeRemaining: newRemaining,
          targetEndTime: prev.isRunning ? Date.now() + newRemaining * 1000 : null
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        saveProgressToMap(next);
        return next;
      });
    };

    window.addEventListener("open_focus_timer" as any, handleOpenTimerEvent);
    window.addEventListener("focus_timer_pause", handleGlobalPause);
    window.addEventListener("focus_timer_resume", handleGlobalResume);
    window.addEventListener("focus_timer_finish", handleGlobalFinish);
    window.addEventListener("focus_timer_update_substeps" as any, handleGlobalUpdateSubsteps);
    window.addEventListener("focus_timer_set_duration" as any, handleGlobalSetDuration);
    window.addEventListener("focus_timer_step_note_saved" as any, handleGlobalStepNoteSaved);
    return () => {
      window.removeEventListener("open_focus_timer" as any, handleOpenTimerEvent);
      window.removeEventListener("focus_timer_pause", handleGlobalPause);
      window.removeEventListener("focus_timer_resume", handleGlobalResume);
      window.removeEventListener("focus_timer_finish", handleGlobalFinish);
      window.removeEventListener("focus_timer_update_substeps" as any, handleGlobalUpdateSubsteps);
      window.removeEventListener("focus_timer_set_duration" as any, handleGlobalSetDuration);
      window.removeEventListener("focus_timer_step_note_saved" as any, handleGlobalStepNoteSaved);
    };
  }, []);

  // Safely broadcast timer state changes to global listeners after React render commit
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent("focus_timer_state_change", { detail: timerState }));
    } catch {}
  }, [timerState]);

  // Save to localStorage and persistent progress map
  const updateTimerState = (updater: (prev: ActiveTimerData | null) => ActiveTimerData | null) => {
    setTimerState((prev) => {
      const next = updater(prev);
      if (next) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        saveProgressToMap(next);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      return next;
    });
  };

  // Safe flush on visibility change and beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (timerState && timerState.isRunning && timerState.targetEndTime) {
        const remaining = Math.max(0, Math.round((timerState.targetEndTime - Date.now()) / 1000));
        const updated: ActiveTimerData = {
          ...timerState,
          timeRemaining: remaining
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        saveProgressToMap(updated);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && timerState && timerState.isRunning && timerState.targetEndTime) {
        const remaining = Math.max(0, Math.round((timerState.targetEndTime - Date.now()) / 1000));
        const updated: ActiveTimerData = {
          ...timerState,
          timeRemaining: remaining
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        saveProgressToMap(updated);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [timerState]);

  // Sub-step calculations with cumulative offsets (excluding inactivated steps)
  const subStepsWithOffsets = useMemo(() => {
    const steps = timerState?.subSteps?.filter(step => isStepActive(step));
    if (!steps || steps.length === 0) return [];
    
    let currentOffsetSec = 0;
    return steps.map((step, index) => {
      const durSec = Math.max(1, Number(step.durationMinutes) || 10) * 60;
      const startSec = currentOffsetSec;
      const endSec = currentOffsetSec + durSec;
      currentOffsetSec = endSec;
      return {
        ...step,
        index,
        durSec,
        startSec,
        endSec
      };
    });
  }, [timerState?.subSteps]);

  const timeSpentSec = timerState ? Math.max(0, timerState.totalSec - timerState.timeRemaining) : 0;
  const timeSpentMins = Math.floor(timeSpentSec / 60);
  const remainingMins = timerState ? Math.ceil(timerState.timeRemaining / 60) : 0;
  const isPartialSession = timeSpentSec > 0 && timerState && timerState.timeRemaining > 0 && !timerState.isCompleted;

  // Active step calculation
  const activeStepInfo = useMemo(() => {
    if (subStepsWithOffsets.length === 0) return null;
    const spent = timeSpentSec;
    
    let found = subStepsWithOffsets.find(s => spent >= s.startSec && spent < s.endSec);
    if (!found) {
      if (spent >= (subStepsWithOffsets[subStepsWithOffsets.length - 1]?.endSec || 0)) {
        found = subStepsWithOffsets[subStepsWithOffsets.length - 1];
      } else {
        found = subStepsWithOffsets[0];
      }
    }
    
    if (!found) return null;

    const stepSpentSec = Math.max(0, spent - found.startSec);
    const stepRemainingSec = Math.max(0, found.endSec - spent);
    const stepProgressPercent = Math.min(100, Math.max(0, (stepSpentSec / found.durSec) * 100));

    return {
      ...found,
      stepSpentSec,
      stepRemainingSec,
      stepProgressPercent,
      isLastStep: found.index === subStepsWithOffsets.length - 1
    };
  }, [subStepsWithOffsets, timeSpentSec]);

  // Phase transition detection ref
  const previousStepIndexRef = useRef<number>(activeStepInfo ? activeStepInfo.index : 0);
  const currentSessionId = timerState ? `${timerState.goalId}_${timerState.eventId}_${timerState.title}` : null;
  const previousSessionIdRef = useRef<string | null>(null);

  const previousActiveStepKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentSessionId !== previousSessionIdRef.current) {
      previousSessionIdRef.current = currentSessionId;
      previousStepIndexRef.current = activeStepInfo?.index ?? 0;
      setActiveSelfTest(null);
      setSelfTestAnswers({});
      setSelfTestSubmitted(false);
      setSelfTestError(null);
      setReviewedCustomStepLinkIds({});
      previousActiveStepKeyRef.current = null;
    }
  }, [currentSessionId, activeStepInfo?.index]);

  useEffect(() => {
    const stepKey = activeStepInfo ? `${currentSessionId || "no_session"}_${activeStepInfo.id}_${activeStepInfo.index}` : null;
    if (!stepKey || stepKey === previousActiveStepKeyRef.current) return;
    previousActiveStepKeyRef.current = stepKey;

    const isSelfTestStep = Boolean(
      activeStepInfo && isKnowledgeTesterStep(activeStepInfo)
    );

    setActiveSelfTest(null);
    setSelfTestAnswers({});
    setSelfTestSubmitted(false);
    setSelfTestError(null);

    if (isSelfTestStep) {
      setShowSelfTestPanel(true);
      handleLoadOrGenerateSelfTest(false);
    } else {
      setShowSelfTestPanel(false);
    }
  }, [currentSessionId, activeStepInfo?.id, activeStepInfo?.index, activeStepInfo?.stepType, activeStepInfo?.title]);

  useEffect(() => {
    if (!activeStepInfo || !timerState?.isRunning) return;

    if (activeStepInfo.index > previousStepIndexRef.current) {
      previousStepIndexRef.current = activeStepInfo.index;

      if (manualStepJumpRef.current) {
        manualStepJumpRef.current = false;
        return;
      }

      if (soundEnabled && phaseSoundEnabled) {
        playPhaseEndChime(soundVolume);
      }

      // Standard non-blocking phase transition notice
      setPhaseTransitionNotice({
        phaseTitle: activeStepInfo.title,
        phaseNum: activeStepInfo.index + 1,
        totalPhases: subStepsWithOffsets.length,
        durationMins: activeStepInfo.durationMinutes
      });

      const timer = setTimeout(() => {
        setPhaseTransitionNotice(null);
      }, 5000);
      return () => clearTimeout(timer);
    } else if (activeStepInfo.index < previousStepIndexRef.current) {
      previousStepIndexRef.current = activeStepInfo.index;
    }
  }, [activeStepInfo?.index, timerState?.isRunning, soundEnabled, phaseSoundEnabled, soundVolume, subStepsWithOffsets.length]);

  // Audio completion trigger with 3-chime burst and tab notification
  const triggerCompletionBell = (sessionTitle: string) => {
    setIsAlarmRinging(true);

    if (soundEnabled) {
      // Chime 1: Immediately
      playBellSound(soundChoice, soundVolume);

      // Chime 2 & 3: Repeated for maximum audibility
      if (repeatSound) {
        setTimeout(() => {
          playBellSound(soundChoice, soundVolume);
        }, 1600);
        setTimeout(() => {
          playBellSound(soundChoice, soundVolume);
          setIsAlarmRinging(false);
        }, 3200);
      } else {
        setTimeout(() => setIsAlarmRinging(false), 2000);
      }
    }

    // Flash tab title
    const originalTitle = document.title;
    let flashCount = 0;
    const titleInterval = setInterval(() => {
      document.title = flashCount % 2 === 0 ? `🔔 Time's Up: ${sessionTitle}!` : `✨ Focus Goal Done!`;
      flashCount++;
      if (flashCount > 12) {
        clearInterval(titleInterval);
        document.title = originalTitle;
      }
    }, 750);

    // Desktop Browser Notification
    try {
      if (typeof window !== "undefined" && "Notification" in window && typeof Notification !== "undefined") {
        if (Notification.permission === "granted") {
          new Notification("🔔 Focus Session Finished!", {
            body: `Time is up! You finished your scheduled study session for "${sessionTitle}".`,
            icon: "/favicon.ico"
          });
        }
      }
    } catch {}
  };

  const handleTestBell = () => {
    unlockAudioEngine();
    setIsTestingSound(true);
    playBellSound(soundChoice, soundVolume);
    setTimeout(() => setIsTestingSound(false), 2200);
  };

  // Timer Tick Interval - Uses wall-clock timestamp calculations
  useEffect(() => {
    if (!timerState?.isRunning) return;

    const interval = setInterval(() => {
      let isTimerCompleted = false;
      let completedEventId: string | undefined;
      let completedGoalId: string | undefined;
      let completedNote: string | undefined;
      let completedSavedStepKeys: string[] | undefined;
      let completedSessionStartedAt: number | undefined;
      let finishedTitle: string = "Focus Session";

      setTimerState((prev) => {
        if (!prev || !prev.isRunning || !prev.targetEndTime) return prev;

        const now = Date.now();
        const diffSec = Math.max(0, Math.round((prev.targetEndTime - now) / 1000));

        if (diffSec <= 0) {
          isTimerCompleted = true;
          completedEventId = prev.eventId;
          completedGoalId = prev.goalId;
          completedNote = prev.sessionTakeawayNote.trim() || undefined;
          completedSavedStepKeys = prev.savedNoteStepKeys || [];
          completedSessionStartedAt = prev.sessionStartedAt || prev.startedAt || undefined;
          finishedTitle = prev.title;

          const savedSet = new Set(completedSavedStepKeys.map(k => k.toLowerCase()));
          const startMs = completedSessionStartedAt || 0;
          const cleanedSubSteps = prev.subSteps?.map(s => {
            const normKey = `title:${s.title.trim().toLowerCase()}`;
            const noteMs = s.carryoverNoteDate ? new Date(s.carryoverNoteDate).getTime() : 0;
            const kept = Boolean(
              s.carryoverNote &&
              s.carryoverNote.trim() &&
              (savedSet.has(s.id.toLowerCase()) || savedSet.has(normKey) || (startMs > 0 && noteMs >= startMs))
            );
            return kept ? s : { ...s, carryoverNote: undefined, carryoverNoteDate: undefined };
          });

          const completedState: ActiveTimerData = {
            ...prev,
            timeRemaining: 0,
            isRunning: false,
            isCompleted: true,
            isCompletionLogged: true,
            isOpen: true,
            isMinimized: false,
            subSteps: cleanedSubSteps
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(completedState));
          clearSavedProgress(prev.goalId, prev.eventId, prev.title);
          return completedState;
        }

        const updatedState = { ...prev, timeRemaining: diffSec };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedState));
        saveProgressToMap(updatedState);
        return updatedState;
      });

      if (isTimerCompleted) {
        triggerCompletionBell(finishedTitle);
        queueMicrotask(() => {
          if (onCompleteRef.current) {
            onCompleteRef.current(completedEventId, completedGoalId, completedNote, finishedTitle, {
              savedStepKeys: completedSavedStepKeys,
              sessionStartedAt: completedSessionStartedAt
            });
          }
          try {
            window.dispatchEvent(new CustomEvent("focus_session_completed", {
              detail: {
                eventId: completedEventId,
                goalId: completedGoalId,
                title: finishedTitle,
                note: completedNote
              }
            }));
          } catch {}
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timerState?.isRunning, soundEnabled, soundChoice, soundVolume, repeatSound]);

  // Format time display (HH:MM:SS or MM:SS)
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleAdjustMinutes = (deltaMins: number) => {
    unlockAudioEngine();
    const eventId = timerState.eventId;
    if (eventId) {
      queueMicrotask(() => {
        if (onExtendRef.current) {
          onExtendRef.current(eventId, deltaMins);
        }
      });
    }

    updateTimerState((prev) => {
      if (!prev) return null;
      const deltaSec = deltaMins * 60;
      const nextRemaining = Math.max(10, prev.timeRemaining + deltaSec);
      const nextTotal = Math.max(10, prev.totalSec + deltaSec);
      const isRunningNow = prev.isRunning;
      const nextTargetEnd = isRunningNow ? Date.now() + nextRemaining * 1000 : null;

      return {
        ...prev,
        totalSec: nextTotal,
        timeRemaining: nextRemaining,
        targetEndTime: nextTargetEnd,
        isRunning: isRunningNow,
        isCompleted: false
      };
    });
  };

  const handleStart = () => {
    unlockAudioEngine();
    const now = Date.now();
    updateTimerState((prev) => {
      if (!prev) return null;
      let remaining = prev.timeRemaining;
      if (remaining <= 0) {
        remaining = prev.totalSec;
      }
      return {
        ...prev,
        timeRemaining: remaining,
        startedAt: prev.isCompleted ? now : (prev.startedAt || now),
        sessionStartedAt: prev.isCompleted ? now : (prev.sessionStartedAt || now),
        savedNoteStepKeys: prev.isCompleted ? [] : (prev.savedNoteStepKeys || []),
        lastPausedAt: null,
        targetEndTime: now + remaining * 1000,
        isRunning: true,
        isCompleted: false,
        isCompletionLogged: false
      };
    });
  };

  const handlePause = () => {
    unlockAudioEngine();
    const now = Date.now();
    updateTimerState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        isRunning: false,
        lastPausedAt: now,
        targetEndTime: null
      };
    });
  };

  const handleReset = () => {
    unlockAudioEngine();
    clearSavedProgress(timerState.goalId, timerState.eventId, timerState.title);
    updateTimerState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        timeRemaining: prev.totalSec,
        isRunning: false,
        isCompleted: false,
        isCompletionLogged: false,
        targetEndTime: null
      };
    });
  };

  const handleMinimize = () => {
    updateTimerState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        isMinimized: true,
        isOpen: false
      };
    });
    if (propOnClose) propOnClose();
  };

  // Keyboard Shortcuts: Ctrl/Cmd+Enter to Save Study Note, Space to Play/Pause, M for Ambient Soundscape toggle
  useEffect(() => {
    if (!timerState?.isOpen) return;

    const handleTimerHotkeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter")) {
        if (liveNoteSaveShortcutRef.current.canTrigger) {
          e.preventDefault();
          if (!liveNoteSaveShortcutRef.current.disabled) {
            void liveNoteSaveShortcutRef.current.save();
          }
          return;
        }
      }

      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        (e.code === "KeyB" || e.key.toLowerCase() === "b")
      ) {
        if (liveNoteSaveShortcutRef.current.canInsertBlank) {
          e.preventDefault();
          liveNoteSaveShortcutRef.current.insertBlank();
          return;
        }
      }

      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (timerState?.isRunning) {
          handlePause();
        } else {
          handleStart();
        }
      } else if (e.key === "m" || e.key === "M") {
        if (activeSoundscape !== "none") {
          soundscapeEngine.stop();
          setActiveSoundscape("none");
        } else {
          handleToggleSoundscape("brown_noise");
        }
      }
    };

    window.addEventListener("keydown", handleTimerHotkeys);
    return () => window.removeEventListener("keydown", handleTimerHotkeys);
  }, [timerState?.isOpen, timerState?.isRunning, activeSoundscape]);

  const handleExpand = () => {
    unlockAudioEngine();
    updateTimerState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        isMinimized: false,
        isOpen: true
      };
    });
  };

  const handleClose = () => {
    if (timerState.isRunning) {
      handleMinimize();
      return;
    }

    if (isPartialSession) {
      saveProgressToMap(timerState);
      updateTimerState((prev) => prev ? { ...prev, isOpen: false, isMinimized: false } : null);
      if (propOnClose) propOnClose();
      return;
    }

    const note = timerState.sessionTakeawayNote.trim();
    const eventId = timerState.eventId;
    const goalId = timerState.goalId;

    clearSavedProgress(timerState.goalId, timerState.eventId, timerState.title);
    updateTimerState(() => null);
    if (propOnClose) propOnClose();

    if (note) {
      queueMicrotask(() => {
        if (onCompleteRef.current) {
          onCompleteRef.current(eventId, goalId, note);
        }
      });
    }
  };

  const handleFinishAndComplete = () => {
    unlockAudioEngine();
    const eventId = timerState.eventId;
    const goalId = timerState.goalId;
    const note = timerState.sessionTakeawayNote.trim() || undefined;
    const title = timerState.title;
    const alreadyLogged = Boolean(timerState.isCompletionLogged);
    const savedStepKeys = timerState.savedNoteStepKeys || [];
    const sessionStartedAt = timerState.sessionStartedAt || timerState.startedAt || undefined;

    if (!alreadyLogged) {
      triggerCompletionBell(timerState.title);
    }

    clearSavedProgress(timerState.goalId, timerState.eventId, timerState.title);
    updateTimerState(() => null);
    if (propOnClose) propOnClose();

    if (!alreadyLogged) {
      queueMicrotask(() => {
        if (onCompleteRef.current) {
          onCompleteRef.current(eventId, goalId, note, title, {
            savedStepKeys,
            sessionStartedAt
          });
        }
        try {
          window.dispatchEvent(new CustomEvent("focus_session_completed", {
            detail: { eventId, goalId, title, note }
          }));
        } catch {}
      });
    }
  };

  const handleSaveModalStepNote = (stepId: string, stepTitle: string, noteText: string) => {
    if (!timerState) return;
    const trimmed = noteText.trim();
    const nowIso = new Date().toISOString();
    const normTitle = stepTitle.trim().toLowerCase();
    const normTitleKey = normTitle ? `title:${normTitle}` : "";

    updateTimerState((prev) => {
      if (!prev) return null;
      const updatedSteps = prev.subSteps?.map(s =>
        s.id === stepId || (normTitle && s.title.trim().toLowerCase() === normTitle)
          ? {
              ...s,
              carryoverNote: trimmed || undefined,
              carryoverNoteDate: trimmed ? nowIso : undefined
            }
          : s
      );
      const nextSavedKeys = new Set(prev.savedNoteStepKeys || []);
      if (trimmed) {
        nextSavedKeys.add(stepId);
        if (normTitleKey) nextSavedKeys.add(normTitleKey);
      } else {
        nextSavedKeys.delete(stepId);
        if (normTitleKey) nextSavedKeys.delete(normTitleKey);
      }
      return { ...prev, subSteps: updatedSteps, savedNoteStepKeys: Array.from(nextSavedKeys) };
    });

    const targetGoalId = timerState.goalId || activeGoal?.id;
    if (targetGoalId && onSaveStepNoteRef.current) {
      onSaveStepNoteRef.current(targetGoalId, stepId, stepTitle, trimmed, timerState.eventId);
    }

    setEditingStepNoteId(null);
    setEditingStepNoteText("");
  };

  // Jump to specific sub-step
  const handleJumpToSubStep = (stepIndex: number) => {
    if (!subStepsWithOffsets[stepIndex]) return;
    const targetStep = subStepsWithOffsets[stepIndex];
    unlockAudioEngine();
    manualStepJumpRef.current = true;

    updateTimerState((prev) => {
      if (!prev) return null;
      const newTimeSpent = targetStep.startSec;
      const newRemaining = Math.max(1, prev.totalSec - newTimeSpent);
      const isRunningNow = prev.isRunning;
      const nextTargetEnd = isRunningNow ? Date.now() + newRemaining * 1000 : null;

      return {
        ...prev,
        timeRemaining: newRemaining,
        targetEndTime: nextTargetEnd
      };
    });
  };

  // Mark current sub-step as completed and advance to next
  const handleCompleteCurrentSubStep = () => {
    if (!activeStepInfo) return;
    unlockAudioEngine();

    if (activeStepInfo.isLastStep) {
      handleFinishAndComplete();
      return;
    }

    const nextIndex = activeStepInfo.index + 1;
    handleJumpToSubStep(nextIndex);
    if (soundEnabled && phaseSoundEnabled) {
      playPhaseEndChime(soundVolume);
    }
  };

  // Request AI Sub-Step breakdown inside timer
  const handleGenerateAiSubSteps = async () => {
    if (!timerState) return;
    setIsGeneratingAiSteps(true);
    try {
      const durationMins = Math.round(timerState.totalSec / 60);
      const res = await fetch("/api/coach/suggest-substeps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalName: timerState.title,
          category: timerState.category || "Study",
          durationMinutes: durationMins,
          difficulty: "intermediate",
          focusStyle: "balanced"
        })
      });

      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.subSteps && Array.isArray(data.subSteps) && data.subSteps.length > 0) {
          updateTimerState((prev) => prev ? { ...prev, subSteps: data.subSteps } : null);
          setDraftSubSteps(data.subSteps);
        }
      }
    } catch (err) {
      console.error("Failed to generate AI sub-steps:", err);
    } finally {
      setIsGeneratingAiSteps(false);
    }
  };

  // Open Custom Breakdown builder with existing steps or smart default phases
  const handleOpenCustomBreakdown = () => {
    if (timerState?.subSteps && timerState.subSteps.length > 0) {
      setDraftSubSteps([...timerState.subSteps]);
    } else {
      const totalMins = timerState ? Math.max(10, Math.round(timerState.totalSec / 60)) : 60;
      const p1 = Math.max(5, Math.round(totalMins * 0.2));
      const p3 = Math.max(5, Math.round(totalMins * 0.2));
      const p2 = Math.max(5, totalMins - p1 - p3);
      
      setDraftSubSteps([
        { id: `step_${Date.now()}_1`, title: "Phase 1: Concept & Notes Review", durationMinutes: p1, description: "Review foundations" },
        { id: `step_${Date.now()}_2`, title: "Phase 2: Core Deep Focus", durationMinutes: p2, description: "Active problem solving" },
        { id: `step_${Date.now()}_3`, title: "Phase 3: Self-Quiz & Review", durationMinutes: p3, description: "Quiz & log takeaways" },
      ]);
    }
    setShowCustomBreakdownBuilder(true);
  };

  // Quick Preset Templates for Custom Breakdown
  const applyTemplate = (templateType: string) => {
    if (!timerState) return;
    const totalMins = Math.max(10, Math.round(timerState.totalSec / 60));
    
    if (templateType === "pomodoro") {
      const steps: SessionSubStep[] = [];
      let rem = totalMins;
      let count = 1;
      while (rem > 0) {
        const focusDur = Math.min(25, rem);
        steps.push({
          id: `step_${Date.now()}_f${count}`,
          title: `Focus Sprint #${count}`,
          durationMinutes: focusDur,
          description: "Deep undistracted work"
        });
        rem -= focusDur;
        if (rem > 0) {
          const breakDur = Math.min(5, rem);
          steps.push({
            id: `step_${Date.now()}_b${count}`,
            title: `Rest Break #${count}`,
            durationMinutes: breakDur,
            description: "Step away, stretch, hydrate"
          });
          rem -= breakDur;
        }
        count++;
      }
      setDraftSubSteps(steps);
    } else if (templateType === "3phase") {
      const p1 = Math.max(5, Math.round(totalMins * 0.2));
      const p3 = Math.max(5, Math.round(totalMins * 0.2));
      const p2 = Math.max(5, totalMins - p1 - p3);
      setDraftSubSteps([
        { id: `step_${Date.now()}_1`, title: "1. Concept & Notes Review", durationMinutes: p1, description: "Review formulas, chapters, and key concepts" },
        { id: `step_${Date.now()}_2`, title: "2. Deep Practice & Core Drills", durationMinutes: p2, description: "Active problem-solving and deep work" },
        { id: `step_${Date.now()}_3`, title: "3. Self-Quiz & Key Takeaways", durationMinutes: p3, description: "Quiz yourself and summarize takeaways" },
      ]);
    } else if (templateType === "2phase") {
      const p2 = Math.max(5, Math.round(totalMins * 0.2));
      const p1 = Math.max(5, totalMins - p2);
      setDraftSubSteps([
        { id: `step_${Date.now()}_1`, title: "1. Core Deep Work Sprint", durationMinutes: p1, description: "Undivided focus on primary task" },
        { id: `step_${Date.now()}_2`, title: "2. Wrap-up & Output Summary", durationMinutes: p2, description: "Organize deliverables and plan next step" },
      ]);
    } else if (templateType === "workout") {
      const p1 = Math.max(5, Math.round(totalMins * 0.15));
      const p3 = Math.max(5, Math.round(totalMins * 0.15));
      const p2 = Math.max(5, totalMins - p1 - p3);
      setDraftSubSteps([
        { id: `step_${Date.now()}_1`, title: "1. Dynamic Warm-up", durationMinutes: p1, description: "Mobility drills and heart rate elevation" },
        { id: `step_${Date.now()}_2`, title: "2. Main Sets & Progression", durationMinutes: p2, description: "Core strength and conditioning blocks" },
        { id: `step_${Date.now()}_3`, title: "3. Cool Down & Stretching", durationMinutes: p3, description: "Static stretching, foam rolling, hydration" },
      ]);
    } else if (templateType === "4stage") {
      const p1 = Math.max(5, Math.round(totalMins * 0.15));
      const p4 = Math.max(5, Math.round(totalMins * 0.15));
      const rem = totalMins - p1 - p4;
      const p2 = Math.max(5, Math.floor(rem / 2));
      const p3 = Math.max(5, rem - p2);
      setDraftSubSteps([
        { id: `step_${Date.now()}_1`, title: "1. Primer / Warm-up", durationMinutes: p1, description: "Glance at objectives and setup workspace" },
        { id: `step_${Date.now()}_2`, title: "2. Foundation & Deep Reading", durationMinutes: p2, description: "Absorption of core materials" },
        { id: `step_${Date.now()}_3`, title: "3. Application Drills", durationMinutes: p3, description: "Build, code, or solve hard questions" },
        { id: `step_${Date.now()}_4`, title: "4. Review & Log Takeaway", durationMinutes: p4, description: "Capture learnings and bookmark next session" },
      ]);
    } else if (templateType === "lazy_jumpstart") {
      setDraftSubSteps([
        { id: `step_${Date.now()}_1`, title: "Step 1: 2-Minute Easy Setup", durationMinutes: 2, description: "Open tools, take a sip of water, zero pressure" },
        { id: `step_${Date.now()}_2`, title: "Step 2: 3-Minute Micro-Action", durationMinutes: 3, description: "Do just one tiny action. Stop anytime with zero guilt!" }
      ]);
    }
  };

  const showFeedback = (msg: string) => {
    setTemplateFeedbackMessage(msg);
    setTimeout(() => {
      setTemplateFeedbackMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const saveCustomTemplates = (templates: CustomSessionTemplate[]) => {
    setCustomTemplates(templates);
    try {
      localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
      window.dispatchEvent(new CustomEvent("sync_focus_templates", { detail: templates }));
    } catch (e) {
      console.error("Failed to save custom templates:", e);
    }
  };

  // Open template builder prefilled with current draft phases
  const handleOpenSaveCurrentAsTemplate = () => {
    if (draftSubSteps.length === 0) {
      showFeedback("Please add at least 1 phase before saving a template.");
      return;
    }

    const currentTitle = timerState?.title?.trim() || "Focus";
    let defaultIcon = "🎯";
    const lower = (timerState?.title + " " + timerState?.category).toLowerCase();
    if (lower.includes("cyber") || lower.includes("security") || lower.includes("network")) defaultIcon = "🛡️";
    else if (lower.includes("code") || lower.includes("dev") || lower.includes("program") || lower.includes("react") || lower.includes("python") || lower.includes("script")) defaultIcon = "💻";
    else if (lower.includes("workout") || lower.includes("gym") || lower.includes("fitness") || lower.includes("run") || lower.includes("cardio")) defaultIcon = "🏋️";
    else if (lower.includes("study") || lower.includes("read") || lower.includes("book") || lower.includes("cert") || lower.includes("exam")) defaultIcon = "🎓";
    else if (lower.includes("math") || lower.includes("science") || lower.includes("chem")) defaultIcon = "🔬";

    const totalMins = draftSubSteps.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
    const defaultDesc = `${draftSubSteps.length} phases • ${totalMins}m total`;

    setTemplateEditorState({
      isOpen: true,
      mode: "create_from_current",
      name: `${currentTitle} Routine`,
      icon: defaultIcon,
      description: defaultDesc,
      steps: draftSubSteps.map((s, i) => ({
        id: `tstep_${Date.now()}_${i}`,
        title: s.title || `Phase ${i + 1}`,
        durationMinutes: Number(s.durationMinutes) || 10,
        description: s.description || ""
      }))
    });
  };

  // Open blank template editor
  const handleOpenCreateBlankTemplate = () => {
    setTemplateEditorState({
      isOpen: true,
      mode: "create_blank",
      name: "New Focus Routine",
      icon: "🎯",
      description: "Custom session breakdown",
      steps: [
        { id: `tstep_${Date.now()}_1`, title: "Phase 1: Deep Focus", durationMinutes: 25, description: "Active uninterrupted work" },
        { id: `tstep_${Date.now()}_2`, title: "Phase 2: Review & Wrap-up", durationMinutes: 5, description: "Summary and action items" }
      ]
    });
  };

  // Open editor for an existing template
  const handleOpenEditTemplate = (template: CustomSessionTemplate) => {
    setTemplateEditorState({
      isOpen: true,
      mode: "edit",
      templateId: template.id,
      name: template.name,
      icon: template.icon || "🎯",
      description: template.description || "",
      steps: template.steps.map((s, i) => ({
        id: s.id || `tstep_${Date.now()}_${i}`,
        title: s.title,
        durationMinutes: Number(s.durationMinutes) || 10,
        description: s.description || ""
      }))
    });
  };

  // Save template changes from editor
  const handleSaveTemplateFromEditor = () => {
    if (!templateEditorState) return;
    const trimmedName = templateEditorState.name.trim() || "Untitled Template";

    if (templateEditorState.steps.length === 0) {
      showFeedback("Template must have at least one phase.");
      return;
    }

    const cleanSteps = templateEditorState.steps.map((s, idx) => ({
      id: s.id || `tstep_${Date.now()}_${idx}`,
      title: s.title.trim() || `Phase ${idx + 1}`,
      durationMinutes: Math.max(1, Number(s.durationMinutes) || 5),
      description: s.description?.trim() || ""
    }));

    if (templateEditorState.mode === "edit" && templateEditorState.templateId) {
      const updated = customTemplates.map((t) => {
        if (t.id === templateEditorState.templateId) {
          return {
            ...t,
            name: trimmedName,
            icon: templateEditorState.icon || "🎯",
            description: templateEditorState.description.trim() || `${cleanSteps.length} phases`,
            steps: cleanSteps,
            updatedAt: Date.now()
          };
        }
        return t;
      });
      saveCustomTemplates(updated);
      showFeedback(`Template "${trimmedName}" updated!`);
    } else {
      const newTemplate: CustomSessionTemplate = {
        id: `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: trimmedName,
        icon: templateEditorState.icon || "🎯",
        description: templateEditorState.description.trim() || `${cleanSteps.length} phases • ${cleanSteps.reduce((a, b) => a + b.durationMinutes, 0)}m`,
        steps: cleanSteps,
        createdAt: Date.now()
      };
      saveCustomTemplates([newTemplate, ...customTemplates]);
      showFeedback(`Saved template "${trimmedName}"!`);
    }

    setTemplateTab("custom");
    setTemplateEditorState(null);
  };

  // Delete template
  const handleDeleteTemplate = (templateId: string, templateName: string) => {
    const updated = customTemplates.filter((t) => t.id !== templateId);
    saveCustomTemplates(updated);
    showFeedback(`Template "${templateName}" deleted.`);
    if (templateEditorState?.templateId === templateId) {
      setTemplateEditorState(null);
    }
  };

  // Apply custom template to current draft phases
  const handleApplyCustomTemplate = (template: CustomSessionTemplate) => {
    const steps: SessionSubStep[] = template.steps.map((s, idx) => ({
      id: `step_${Date.now()}_${idx}`,
      title: s.title,
      durationMinutes: Number(s.durationMinutes) || 10,
      description: s.description || "",
      stepType: s.stepType
    }));
    setDraftSubSteps(steps);
    const totalMins = steps.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
    showFeedback(`Loaded "${template.name}" (${totalMins}m across ${steps.length} phases)`);
  };

  // Import draft phases into template editor
  const handleImportCurrentPhasesIntoEditor = () => {
    if (draftSubSteps.length === 0) {
      showFeedback("No draft phases in builder to import.");
      return;
    }
    setTemplateEditorState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        steps: draftSubSteps.map((s, idx) => ({
          id: `tstep_${Date.now()}_${idx}`,
          title: s.title || `Phase ${idx + 1}`,
          durationMinutes: Number(s.durationMinutes) || 10,
          description: s.description || ""
        }))
      };
    });
    showFeedback(`Imported ${draftSubSteps.length} phases from current builder.`);
  };

  // Template editor sub-step handlers
  const handleTemplateEditorAddPhase = () => {
    setTemplateEditorState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        steps: [
          ...prev.steps,
          {
            id: `tstep_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            title: `Phase ${prev.steps.length + 1}`,
            durationMinutes: 15
          }
        ]
      };
    });
  };

  const handleTemplateEditorRemovePhase = (index: number) => {
    setTemplateEditorState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        steps: prev.steps.filter((_, i) => i !== index)
      };
    });
  };

  const handleTemplateEditorMovePhase = (index: number, direction: -1 | 1) => {
    setTemplateEditorState((prev) => {
      if (!prev) return null;
      const target = index + direction;
      if (target < 0 || target >= prev.steps.length) return prev;
      const copy = [...prev.steps];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return {
        ...prev,
        steps: copy
      };
    });
  };

  const handleTemplateEditorUpdateStep = (index: number, field: "title" | "durationMinutes", value: any) => {
    setTemplateEditorState((prev) => {
      if (!prev) return null;
      const copy = prev.steps.map((s, i) => {
        if (i === index) {
          return { ...s, [field]: value };
        }
        return s;
      });
      return { ...prev, steps: copy };
    });
  };

  const handleDraftAddPhase = () => {
    setDraftSubSteps((prev) => [
      ...prev,
      {
        id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: `Phase ${prev.length + 1}`,
        durationMinutes: 15,
        stepType: "study"
      }
    ]);
  };

  const handleDraftAddSelfTestPhase = () => {
    const pendingLoginLink = loginStudyLinks.find(l => !l.reviewCompleted) || loginStudyLinks[0] || goalLinkOptions[0];
    setDraftSubSteps((prev) => [
      ...prev,
      {
        id: `step_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: "Knowledge Tester: Material MCQs & Link Review",
        durationMinutes: 10,
        enabled: true,
        stepType: "self_test",
        ...(pendingLoginLink ? {
          assignedLinkNoteId: pendingLoginLink.id,
          assignedLinkUrl: pendingLoginLink.url,
          assignedLinkTitle: pendingLoginLink.title
        } : {})
      }
    ]);
  };

  const handleDraftRemovePhase = (index: number) => {
    setDraftSubSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDraftMovePhase = (index: number, direction: -1 | 1) => {
    setDraftSubSteps((prev) => reorderSteps(prev, index, index + direction));
  };

  const handleDraftReorderPhase = (fromIndex: number, toIndex: number) => {
    setDraftSubSteps((prev) => reorderSteps(prev, fromIndex, toIndex));
  };

  const handleAutoScaleToTimer = () => {
    const activeDrafts = draftSubSteps.filter(s => isStepActive(s));
    if (!timerState || activeDrafts.length === 0) return;
    const targetMins = Math.max(5, Math.round(timerState.totalSec / 60));
    const currentSum = activeDrafts.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
    if (currentSum <= 0) return;

    let allocated = 0;
    let activeSeen = 0;
    const scaled = draftSubSteps.map((step) => {
      if (!isStepActive(step)) return step;
      activeSeen += 1;
      if (activeSeen === activeDrafts.length) {
        const remaining = Math.max(1, targetMins - allocated);
        return { ...step, durationMinutes: remaining };
      }
      const proportional = Math.max(1, Math.round((Number(step.durationMinutes) / currentSum) * targetMins));
      allocated += proportional;
      return { ...step, durationMinutes: proportional };
    });
    setDraftSubSteps(scaled);
  };

  const handleSyncTimerToPhases = () => {
    const sumMins = draftSubSteps.reduce(
      (acc, s) => acc + (isStepActive(s) ? (Number(s.durationMinutes) || 0) : 0),
      0
    );
    if (sumMins <= 0 || !timerState) return;
    const newTotalSec = sumMins * 60;
    updateTimerState((prev) => {
      if (!prev) return null;
      const isRunningNow = prev.isRunning;
      const spent = prev.totalSec - prev.timeRemaining;
      const newRemaining = Math.max(1, newTotalSec - spent);
      return {
        ...prev,
        totalSec: newTotalSec,
        timeRemaining: newRemaining,
        targetEndTime: isRunningNow ? Date.now() + newRemaining * 1000 : null
      };
    });
  };

  const handleApplyCustomBreakdown = () => {
    if (draftSubSteps.length === 0) {
      updateTimerState((prev) => prev ? { ...prev, subSteps: undefined } : null);
    } else {
      updateTimerState((prev) => prev ? { ...prev, subSteps: draftSubSteps } : null);
    }
    setShowCustomBreakdownBuilder(false);
  };

  const handleClearSubSteps = () => {
    updateTimerState((prev) => prev ? { ...prev, subSteps: undefined } : null);
    setDraftSubSteps([]);
    setShowCustomBreakdownBuilder(false);
  };

  // If timerState is null, do not render modal or mini-bar
  if (!timerState) return null;

  // Render Floating Mini-Timer Bar when minimized OR when modal closed with active/saved progress
  if (timerState.isMinimized || (!timerState.isOpen && (timerState.isRunning || isPartialSession || timerState.isCompleted))) {
    return (
      <div 
        id="floating_focus_timer_bar"
        className={`fixed bottom-16 sm:bottom-6 right-4 sm:right-6 z-50 bg-white/95 dark:bg-[#0f111a]/95 border rounded-2xl p-3 shadow-xl dark:shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-fade-in ${
          timerState.isCompleted 
            ? "border-amber-400 ring-2 ring-amber-400/50 shadow-amber-500/20 animate-pulse text-slate-900 dark:text-white" 
            : "border-slate-300 dark:border-indigo-500/40 ring-1 ring-slate-200 dark:ring-indigo-500/20 text-slate-900 dark:text-white"
        }`}
      >
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleExpand}>
          <span className="relative flex h-3 w-3 shrink-0">
            {timerState.isRunning ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            ) : timerState.isCompleted ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            ) : isPartialSession ? (
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400"></span>
            ) : null}
            <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: timerState.color }}></span>
          </span>
          <div className="min-w-0 max-w-[130px] sm:max-w-[170px]">
            <p className="text-[9px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 truncate font-mono">
              {timerState.isCompleted 
                ? "🔔 Time is Up!" 
                : activeStepInfo 
                ? `Phase ${activeStepInfo.index + 1}/${subStepsWithOffsets.length}: ${activeStepInfo.title}`
                : isPartialSession && !timerState.isRunning 
                ? `Paused (${timeSpentMins}m done)` 
                : timerState.category || "Focus Session"}
            </p>
            <h4 className="text-xs font-extrabold text-slate-950 dark:text-white truncate">
              {timerState.title}
            </h4>
          </div>
        </div>

        {/* Live Clock Display */}
        <div 
          onClick={handleExpand}
          className={`px-2.5 py-1 rounded-xl font-mono text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer shadow-xs border ${
            timerState.isCompleted 
              ? "bg-amber-100 dark:bg-amber-500/20 border-amber-300 dark:border-amber-400/50 text-amber-950 dark:text-amber-300" 
              : "bg-slate-100 dark:bg-black/60 border-slate-300 dark:border-white/10 text-slate-950 dark:text-white"
          }`}
        >
          <Clock className={`w-3.5 h-3.5 shrink-0 ${timerState.isRunning ? "text-emerald-600 dark:text-emerald-400" : timerState.isCompleted ? "text-amber-600 dark:text-amber-300" : isPartialSession ? "text-amber-600 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400"}`} />
          <span>{formatTime(timerState.timeRemaining)}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          {timerState.isCompleted ? (
            <button
              type="button"
              onClick={() => {
                unlockAudioEngine();
                playBellSound(soundChoice, soundVolume);
              }}
              className="p-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/30 dark:hover:bg-amber-500/40 text-amber-900 dark:text-amber-200 rounded-lg border border-amber-300 dark:border-amber-400/40 cursor-pointer transition shadow-xs"
              title="Play completion bell chime"
            >
              <Bell className="w-3.5 h-3.5 animate-bounce text-amber-600 dark:text-amber-300" />
            </button>
          ) : timerState.isRunning ? (
            <button
              type="button"
              onClick={handlePause}
              className="p-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-300 rounded-lg border border-amber-300 dark:border-amber-500/30 cursor-pointer transition shadow-xs"
              title="Pause Timer"
            >
              <Pause className="w-3.5 h-3.5 fill-current text-amber-700 dark:text-amber-300" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              className="p-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-400 rounded-lg border border-emerald-300 dark:border-emerald-500/30 cursor-pointer transition shadow-xs"
              title={isPartialSession ? `Resume (${remainingMins}m left)` : "Start Timer"}
            >
              <Play className="w-3.5 h-3.5 fill-current text-emerald-700 dark:text-emerald-400" />
            </button>
          )}

          <button
            type="button"
            onClick={() => handleAdjustMinutes(15)}
            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/35 text-indigo-700 dark:text-indigo-300 text-[10px] font-black rounded-lg border border-indigo-200 dark:border-indigo-400/30 cursor-pointer transition font-mono shadow-xs"
            title="Extend by 15 mins"
          >
            +15m
          </button>

          <button
            type="button"
            onClick={handleExpand}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer transition shadow-xs"
            title="Expand Full Timer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleFinishAndComplete}
            className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer transition shadow-xs"
            title="Finish & Log Progress"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (!timerState.isOpen) return null;

  // Calculate circular SVG progress percentage
  const progressPercent = timerState.totalSec > 0 ? ((timerState.totalSec - timerState.timeRemaining) / timerState.totalSec) * 100 : 0;
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div id="focus_timer_modal_backdrop" className="fixed inset-0 bg-slate-900/60 dark:bg-[#020205]/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div id="focus_timer_modal_card" className="bg-white dark:bg-[#0f111a] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-3xl shadow-2xl w-full max-w-md sm:max-w-lg p-5 sm:p-6 relative overflow-hidden max-h-[95vh] overflow-y-auto">
        {/* Glow accent matching color */}
        <div 
          className="absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-15 pointer-events-none"
          style={{ backgroundColor: timerState.color }}
        />

        {/* Modal Header */}
        <div className="relative z-10 mb-4 space-y-2.5">
          {/* Top Utility Bar: Unboxed Status Metadata + Single-Line Controls */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs min-w-0 tabular-nums">
              <span className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
                {timerState.category || "Focus"}
              </span>
              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
              <span className={`inline-flex items-center gap-1.5 font-semibold whitespace-nowrap truncate ${
                timerState.isCompleted
                  ? "text-amber-600 dark:text-amber-300"
                  : timerState.isRunning
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isPartialSession
                  ? "text-amber-600 dark:text-amber-300"
                  : timerState.timeRemaining === timerState.totalSec
                  ? "text-indigo-600 dark:text-indigo-300"
                  : "text-slate-600 dark:text-slate-400"
              }`}>
                {timerState.isCompleted ? (
                  <>
                    <BellRing className="w-3.5 h-3.5 shrink-0" />
                    <span>Time is up</span>
                  </>
                ) : timerState.isRunning ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span>In progress</span>
                  </>
                ) : isPartialSession ? (
                  <>
                    <Pause className="w-3 h-3 fill-current shrink-0" />
                    <span>Paused · {timeSpentMins}m studied</span>
                  </>
                ) : timerState.timeRemaining === timerState.totalSec ? (
                  <>
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Ready</span>
                  </>
                ) : (
                  <span>Paused</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Live Study Notes / Scratchpad Toggle */}
              <button
                type="button"
                onClick={() => setShowLiveNotes(!showLiveNotes)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                  showLiveNotes
                    ? "bg-violet-600 text-white border-violet-500 shadow-sm"
                    : "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10"
                }`}
                title="Take live study notes during this session"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>{showLiveNotes ? "Hide Notes" : "Notes"}</span>
                {activeGoal?.knowledgeHub?.notes && activeGoal.knowledgeHub.notes.length > 0 && (
                  <span className={`text-[11px] font-mono ${showLiveNotes ? "text-violet-200" : "text-slate-400"}`}>
                    {activeGoal.knowledgeHub.notes.length}
                  </span>
                )}
              </button>

              {/* Knowledge Hub Trigger */}
              {activeGoal && (
                <button
                  type="button"
                  onClick={() => setShowKnowledgeHubModal(true)}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0"
                  title="Open Study Materials & Knowledge Hub"
                >
                  <BookOpen className="w-4 h-4" />
                </button>
              )}

              {/* Audio Settings Toggle Button */}
              <button
                type="button"
                onClick={() => setShowAudioSettings(!showAudioSettings)}
                className={`p-2 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                  showAudioSettings
                    ? "bg-indigo-600 text-white border-indigo-500"
                    : soundEnabled
                    ? "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300"
                    : "bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-500 dark:text-rose-400"
                }`}
                title="Bell Chime Sound Settings"
              >
                {soundEnabled ? <BellRing className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={handleMinimize}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Minimize to bottom bar"
              >
                <Minimize2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Close Modal (saves in-progress time)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Session Heading */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: timerState.color }} />
            <h3 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white truncate">
              {timerState.title}
            </h3>
          </div>
        </div>

        {/* Phase Transition Alert Banner */}
        {phaseTransitionNotice && (
          <div className="mb-3 p-3 bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-indigo-400/60 rounded-2xl text-indigo-100 flex items-center justify-between animate-fade-in shadow-lg shadow-indigo-500/20">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-500/30 rounded-xl text-indigo-300">
                <Sparkles className="w-4 h-4 text-indigo-300 animate-spin" />
              </span>
              <div>
                <h4 className="font-extrabold text-white text-xs">
                  Starting Phase {phaseTransitionNotice.phaseNum} of {phaseTransitionNotice.totalPhases}
                </h4>
                <p className="text-[11px] text-indigo-200 font-medium">
                  {phaseTransitionNotice.phaseTitle} ({phaseTransitionNotice.durationMins}m)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPhaseTransitionNotice(null)}
              className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TIME'S UP LOUD BANNER & REPLAY BELL BUTTON */}
        {timerState.isCompleted && (
          <div className="mb-3 p-3.5 bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-teal-500/20 border border-amber-400/60 rounded-2xl text-amber-200 animate-fade-in shadow-lg shadow-amber-500/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-500/30 rounded-xl text-amber-300 shrink-0">
                  {timerState.totalSec <= 300 ? (
                    <Sparkles className="w-5 h-5 animate-bounce" />
                  ) : (
                    <BellRing className="w-5 h-5 animate-bounce" />
                  )}
                </span>
                <div>
                  <h4 className="font-extrabold text-white text-sm">
                    {timerState.totalSec <= 300 ? "🎉 Micro-Win Unlocked!" : "Session Complete!"}
                  </h4>
                  <p className="text-xs text-amber-200/90 font-medium">
                    {timerState.totalSec <= 300 
                      ? "You beat task paralysis! Showing up is 90% of the battle. Keep momentum rolling or stop guilt-free!"
                      : "Your scheduled focus timer has finished. Excellent job!"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  unlockAudioEngine();
                  playBellSound(soundChoice, soundVolume);
                }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition flex items-center gap-1.5 active:scale-95 shrink-0"
              >
                <Bell className="w-3.5 h-3.5 fill-current" />
                <span>Ring Bell</span>
              </button>
            </div>

            {/* Ride the Momentum Button for micro-starts */}
            {timerState.totalSec <= 300 && (
              <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                <button
                  type="button"
                  id="timer_ride_momentum_btn"
                  onClick={() => {
                    handleAdjustMinutes(15);
                    handleStart();
                  }}
                  className="flex-1 py-2 px-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-300 fill-current" />
                  <span>Ride the Momentum (+15m Deep Flow)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Collapsible Bell Sound & Audio Settings Panel */}
        {showAudioSettings && (
          <div className="mb-4 p-3 bg-[#0a0b12] border border-indigo-500/30 rounded-2xl animate-fade-in space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                <Bell className="w-3.5 h-3.5 text-indigo-400" />
                <span>Timer Finish Bell Chime</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  unlockAudioEngine();
                  setSoundEnabled(!soundEnabled);
                }}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                  soundEnabled 
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" 
                    : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                }`}
              >
                {soundEnabled ? "Sound ON" : "Sound MUTED"}
              </button>
            </div>

            {/* Sound Selection Grid */}
            <div className="grid grid-cols-2 gap-1.5">
              {SOUND_OPTIONS.map((snd) => (
                <button
                  key={snd.id}
                  type="button"
                  onClick={() => {
                    setSoundChoice(snd.id);
                    setSoundEnabled(true);
                    unlockAudioEngine();
                    playBellSound(snd.id, soundVolume);
                  }}
                  className={`p-2 rounded-xl text-left border transition flex flex-col justify-between cursor-pointer ${
                    soundChoice === snd.id && soundEnabled
                      ? "bg-indigo-600/25 border-indigo-400 text-white ring-1 ring-indigo-400/40"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-0.5">
                    <span className="text-xs font-bold flex items-center gap-1 text-slate-200">
                      <span>{snd.icon}</span>
                      <span className="truncate">{snd.name}</span>
                    </span>
                    {soundChoice === snd.id && soundEnabled && (
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 line-clamp-1 leading-tight">{snd.desc}</span>
                </button>
              ))}
            </div>

            {/* Volume Control and Test Bell Button */}
            <div className="space-y-2 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Volume1 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={soundVolume}
                    onChange={(e) => setSoundVolume(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    title="Sound Volume"
                  />
                  <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{soundVolume}%</span>
                </div>

                <button
                  type="button"
                  onClick={handleTestBell}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    isTestingSound 
                      ? "bg-emerald-500 text-white animate-pulse" 
                      : "bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 shadow-xs"
                  }`}
                  title="Click to test and hear the bell sound"
                >
                  <Bell className={`w-3.5 h-3.5 ${isTestingSound ? "animate-bounce" : ""}`} />
                  <span>{isTestingSound ? "Playing Bell..." : "Test Bell Sound"}</span>
                </button>
              </div>

              {/* Repeat Sound Option */}
              <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1">
                <span className="flex items-center gap-1 text-slate-400">
                  <Radio className="w-3 h-3 text-indigo-400" />
                  Ring 3 times on finish
                </span>
                <button
                  type="button"
                  onClick={() => setRepeatSound(!repeatSound)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                    repeatSound 
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" 
                      : "bg-white/5 text-slate-400 border-white/10"
                  }`}
                >
                  {repeatSound ? "Enabled (3 Rings)" : "Single Ring"}
                </button>
              </div>

              {/* Phase End Chime Sound Option */}
              <div className="flex items-center justify-between text-[11px] text-slate-300 pt-2 border-t border-white/10">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-200">Phase End Chime</span>
                    <p className="text-[9px] text-slate-400">Plays melodic chime whenever a study phase finishes</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleTestPhaseSound}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                      isTestingPhaseSound
                        ? "bg-amber-500 text-black border-amber-400 animate-pulse"
                        : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30"
                    }`}
                    title="Click to test and hear the phase end chime sound"
                  >
                    <span>{isTestingPhaseSound ? "Chiming..." : "▶ Test Phase Chime"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      unlockAudioEngine();
                      setPhaseSoundEnabled(!phaseSoundEnabled);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                      phaseSoundEnabled 
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" 
                        : "bg-white/5 text-slate-400 border-white/10"
                    }`}
                  >
                    {phaseSoundEnabled ? "Chime ON" : "MUTED"}
                  </button>
                </div>
              </div>

              {/* AMBIENT FOCUS SOUNDSCAPES GENERATOR */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                    <Waves className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Live Focus Soundscape</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {activeSoundscape === "none" ? "Muted" : "Active Playing"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: "none" as SoundscapeType, label: "Mute", icon: "🔇" },
                    { id: "brown_noise" as SoundscapeType, label: "Brown Noise", icon: "🌊" },
                    { id: "rain" as SoundscapeType, label: "Gentle Rain", icon: "🌧️" },
                    { id: "binaural_432" as SoundscapeType, label: "432Hz Alpha", icon: "🧘" }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleToggleSoundscape(s.id)}
                      className={`px-2 py-1.5 rounded-xl text-xs font-medium border text-center transition flex items-center justify-center gap-1.5 ${
                        activeSoundscape === s.id
                          ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/40 font-bold"
                          : "bg-white/5 text-slate-400 border-white/10 hover:text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>

                {activeSoundscape !== "none" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Volume1 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <input
                      type="range"
                      min="0.05"
                      max="1.0"
                      step="0.05"
                      value={soundscapeVolume}
                      onChange={(e) => handleSoundscapeVolumeChange(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      title="Soundscape Volume"
                    />
                    <span className="text-[10px] font-mono text-cyan-300 w-8 text-right">
                      {Math.round(soundscapeVolume * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Goal Syllabus / Chapters Checklist Banner */}
        {activeGoal && activeGoal.chapters && activeGoal.chapters.length > 0 && (
          <div className="mb-3 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl animate-fade-in space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200">
                  {activeGoal.name} Syllabus Progress
                </span>
                <span className="text-[10px] font-mono text-indigo-300">
                  ({activeGoal.chapters.filter(c => c.completed).length}/{activeGoal.chapters.length})
                </span>
              </div>
              {activeGoal.resourceLink && (
                <a
                  href={activeGoal.resourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1 underline underline-offset-2"
                >
                  <span>{activeGoal.resourceLabel || "Launch Material"}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>

            {/* Chapters Checklist */}
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {activeGoal.chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => handleToggleChapter(ch.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl border text-xs transition flex items-center justify-between gap-2 ${
                    ch.completed
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300/80 line-through"
                      : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] border ${
                      ch.completed ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-500 text-slate-400"
                    }`}>
                      {ch.completed ? "✓" : idx + 1}
                    </span>
                    <span className="truncate">{ch.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {ch.completed ? "Done" : "Pending"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resumed In-Progress Study Session Banner */}
        {isPartialSession && (
          <div className="mb-3 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center justify-between animate-fade-in shadow-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <div>
                <span className="font-bold text-emerald-200 block text-[11px]">Saved Study Session Restored:</span>
                <p className="text-[11px] text-emerald-300/90 font-mono">
                  <strong>{timeSpentMins}m</strong> completed • <strong>{remainingMins}m</strong> remaining
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 px-2 py-1 rounded-lg border border-emerald-500/30 font-bold cursor-pointer transition whitespace-nowrap"
              title="Reset timer to beginning duration"
            >
              Restart full {Math.round(timerState.totalSec / 60)}m
            </button>
          </div>
        )}

        {/* Previous Session Carryover Prep Note Banner */}
        {timerState.previousSessionNote && (
          <div className="mb-3 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200/90 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300 block text-[10px] uppercase tracking-wider">Prior Session Takeaway:</span>
              <p className="italic font-medium text-[11px] leading-snug">"{timerState.previousSessionNote}"</p>
            </div>
          </div>
        )}

        {/* Study & Review Assignment Links Banner */}
        {loginStudyLinks.length > 0 && (() => {
          const pendingLinksCount = loginStudyLinks.filter(l => !l.reviewCompleted).length;
          return (
            <div className="mb-3 p-3 bg-cyan-950/35 border border-cyan-500/35 rounded-xl text-xs space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Link2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-cyan-200">
                        Study &amp; Review {loginStudyLinks.length === 1 ? "Assignment" : "Assignments"}
                      </p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        pendingLinksCount > 0
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}>
                        {pendingLinksCount > 0 ? `${pendingLinksCount} to study` : "All studied ✓"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Assigned {loginStudyLinks.length === 1 ? "link" : "links"} — open to read/study, then check off:
                    </p>
                  </div>
                </div>
                {activeGoal && (
                  <button
                    type="button"
                    onClick={() => setShowKnowledgeHubModal(true)}
                    className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0 underline cursor-pointer"
                  >
                    Open Hub
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {loginStudyLinks.map(linkNote => (
                  <div
                    key={linkNote.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                      linkNote.reviewCompleted
                        ? "bg-emerald-950/25 border-emerald-700/30"
                        : "bg-slate-900/70 border-cyan-500/25"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleLiveLinkAssignment(linkNote.id)}
                      className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
                      title={linkNote.reviewCompleted ? "Click to assign for review again" : "Mark assignment as studied"}
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        linkNote.reviewCompleted
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-cyan-400/60 group-hover:border-cyan-300"
                      }`}>
                        {linkNote.reviewCompleted && <Check className="w-3 h-3" />}
                      </span>
                      <span className={`text-[11px] font-medium truncate ${
                        linkNote.reviewCompleted ? "line-through text-slate-400" : "text-slate-100"
                      }`}>
                        {linkNote.title}
                      </span>
                      {(linkNote.studyCount || 0) > 0 && (
                        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                          ({linkNote.studyCount}x)
                        </span>
                      )}
                    </button>

                    <a
                      href={linkNote.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      <span>{linkNote.reviewCompleted ? "Review" : linkNote.linkSubtype === "website_reading" ? "Go read" : "Go study"}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* IN-SESSION STUDY NOTES & SCRATCHPAD PANEL */}
        {showLiveNotes && (
          <div
            data-live-notes-panel="true"
            onPaste={handleLiveNotesPaste}
            onKeyDown={(e) => {
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
            className="mb-4 p-5 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-white/10 rounded-2xl animate-fade-in space-y-4"
          >
            {/* Calm Single-Row Panel Header */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Study Notes
                </h4>
                {activeGoal && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">·</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activeGoal.name}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeGoal && (
                  <button
                    type="button"
                    onClick={() => {
                      setKnowledgeHubInitialTab("notes");
                      setShowKnowledgeHubModal(true);
                    }}
                    className="px-2.5 py-1 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                    <span>Open Hub</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowLiveNotes(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                  title="Close notes"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {noteSavedFeedback && (
              <div className="px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span>{noteSavedFeedback}</span>
              </div>
            )}

            {/* Quick Mode Segmented Switcher + Full Type Selector */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-x-auto">
                  {(
                    [
                      { id: "concept", label: "Note" },
                      { id: "qa", label: "Q&A" },
                      { id: "definition", label: "Definition" },
                      { id: "multiple_choice", label: "Quiz Q" },
                      { id: "video_upload", label: "Import" }
                    ] as const
                  ).map((mode) => {
                    const isActive =
                      mode.id === "multiple_choice"
                        ? ["multiple_choice", "multiple_select", "true_false", "fill_in_blank"].includes(liveNoteCategory)
                        : liveNoteCategory === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setLiveNoteCategory(mode.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isActive
                            ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                <select
                  id="live_note_type_select"
                  tabIndex={0}
                  aria-label="Note Type"
                  value={liveNoteCategory}
                  onChange={(e) => setLiveNoteCategory(e.target.value as StudyArtifactNote["category"] | "video_upload" | "reading_url")}
                  className="text-xs px-2.5 py-1.5 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
                >
                  <option value="concept">Concept Breakdown</option>
                  <option value="cheat_sheet">Cheat Sheet</option>
                  <option value="code_snippet">Code Snippet / Command</option>
                  <option value="summary">Summary</option>
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

              {liveNoteCategory !== "qa" && liveNoteCategory !== "fill_in_blank" && liveNoteCategory !== "multiple_choice" && liveNoteCategory !== "multiple_select" && liveNoteCategory !== "true_false" && liveNoteCategory !== "definition" && (
                <input
                  ref={liveNoteTitleRef}
                  type="text"
                  placeholder={
                    liveNoteCategory === "video_upload"
                      ? "Lesson title (Optional — e.g. Week 2 Lecture)"
                      : liveNoteCategory === "reading_url"
                      ? "Article / Website title (Optional — auto-detected if blank)"
                      : liveNoteCategory === "url"
                      ? "Resource title (Optional — auto-detected if blank)"
                      : liveNoteCategory === "table"
                      ? "Table title (e.g. OSI Layers or Port Numbers)"
                      : "Note title (e.g. Chapter 3 DNS & Port 53)"
                  }
                  value={liveNoteTitle}
                  onChange={(e) => setLiveNoteTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              )}
            </div>

            {liveNoteCategory === "qa" ? (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Question</span>
                  </label>
                  <textarea
                    ref={liveNoteQuestionRef}
                    rows={2}
                    placeholder="Type your study question..."
                    value={liveNoteQuestion}
                    onChange={(e) => setLiveNoteQuestion(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-amber-300 dark:border-amber-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 custom-scrollbar"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Answer</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Type the answer..."
                    value={liveNoteAnswer}
                    onChange={(e) => setLiveNoteAnswer(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-emerald-300 dark:border-emerald-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 custom-scrollbar"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                    <span>Answer Explanation (Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional: explain why this is the answer..."
                    value={liveNoteExplanation}
                    onChange={(e) => setLiveNoteExplanation(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 custom-scrollbar"
                  />
                </div>
              </div>
            ) : liveNoteCategory === "fill_in_blank" ? (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-teal-600 dark:text-teal-300 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span>Sentence / Prompt with Blank</span>
                    </label>
                    <button
                      type="button"
                      onClick={insertBlankIntoLivePrompt}
                      title="Insert blank at cursor (Alt+B / Option+B)"
                      className="px-2 py-0.5 rounded-md bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/35 text-[11px] font-semibold text-teal-700 dark:text-teal-300 transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
                    >
                      <span>+ Insert ___</span>
                      <kbd className="px-1 py-0 rounded bg-teal-500/15 dark:bg-teal-950/60 border border-teal-500/30 font-mono text-[10px] text-teal-800 dark:text-teal-200">
                        Alt+B
                      </kbd>
                    </button>
                  </div>
                  <textarea
                    ref={liveNoteQuestionRef}
                    rows={2}
                    placeholder="e.g. DNS translates domain names into ___ addresses. (Or wrap [IP] in brackets)"
                    value={liveNoteQuestion}
                    onChange={(e) => setLiveNoteQuestion(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-teal-300 dark:border-teal-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 custom-scrollbar"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Missing Word / Answer</span>
                    </label>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Separate multiple blanks with commas
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="e.g. IP (or leave blank if using [brackets] above)"
                    value={liveNoteAnswer}
                    onChange={(e) => setLiveNoteAnswer(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-emerald-300 dark:border-emerald-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 custom-scrollbar"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                    <span>Answer Explanation (Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional: explain why this word/concept fits..."
                    value={liveNoteExplanation}
                    onChange={(e) => setLiveNoteExplanation(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 custom-scrollbar"
                  />
                </div>
              </div>
            ) : liveNoteCategory === "multiple_choice" ? (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Multiple Choice Question</span>
                  </label>
                  <textarea
                    ref={liveNoteQuestionRef}
                    rows={2}
                    placeholder="e.g. Which port does DNS use by default?"
                    value={liveNoteQuestion}
                    onChange={(e) => setLiveNoteQuestion(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-indigo-300 dark:border-indigo-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 custom-scrollbar"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Answer Choices (Click letter to mark correct)</span>
                    </label>
                    {liveNoteMcqOptions.length < 6 && (
                      <button
                        type="button"
                        onClick={() => setLiveNoteMcqOptions(prev => [...prev, ""])}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200 cursor-pointer"
                      >
                        + Add Choice
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {liveNoteMcqOptions.map((opt, idx) => {
                      const isCorrect = liveNoteMcqCorrectIndex === idx;
                      return (
                        <div key={idx} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setLiveNoteMcqCorrectIndex(idx)}
                            title={isCorrect ? "Marked as correct answer" : `Mark choice ${String.fromCharCode(65 + idx)} as correct`}
                            className={`w-7 h-7 rounded-lg border text-xs font-mono font-bold flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                              isCorrect
                                ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white shadow-sm"
                                : "bg-white dark:bg-[#0b0e18] border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:border-emerald-400"
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </button>
                          <input
                            type="text"
                            placeholder={`Choice ${String.fromCharCode(65 + idx)}${idx >= 2 ? " (optional if >=2 filled)" : ""}`}
                            value={opt}
                            onChange={(e) => {
                              const next = [...liveNoteMcqOptions];
                              next[idx] = e.target.value;
                              setLiveNoteMcqOptions(next);
                            }}
                            className={`flex-1 min-w-0 text-xs px-2.5 py-1.5 bg-white dark:bg-[#0b0e18] border rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none ${
                              isCorrect
                                ? "border-emerald-400 dark:border-emerald-600/60 focus:border-emerald-500"
                                : "border-slate-200 dark:border-white/12 focus:border-indigo-500"
                            }`}
                          />
                          {liveNoteMcqOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                setLiveNoteMcqOptions(prev => prev.filter((_, i) => i !== idx));
                                setLiveNoteMcqCorrectIndex(prev =>
                                  prev === idx ? 0 : prev > idx ? prev - 1 : prev
                                );
                              }}
                              title="Remove choice"
                              className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                    <span>Answer Explanation (Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional: explain why this choice is correct..."
                    value={liveNoteExplanation}
                    onChange={(e) => setLiveNoteExplanation(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 custom-scrollbar"
                  />
                </div>
              </div>
            ) : liveNoteCategory === "multiple_select" ? (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-600 dark:text-blue-300 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Multiple Select Question (Select All That Apply)</span>
                  </label>
                  <textarea
                    ref={liveNoteQuestionRef}
                    rows={2}
                    placeholder="e.g. Which protocols operate at the Transport layer? (Select all that apply)"
                    value={liveNoteQuestion}
                    onChange={(e) => setLiveNoteQuestion(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-blue-300 dark:border-blue-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 custom-scrollbar"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Answer Choices (Check all correct answers)</span>
                    </label>
                    {liveNoteMcqOptions.length < 6 && (
                      <button
                        type="button"
                        onClick={() => setLiveNoteMcqOptions(prev => [...prev, ""])}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 cursor-pointer"
                      >
                        + Add Choice
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {liveNoteMcqOptions.map((opt, idx) => {
                      const isChecked = liveNoteMultiSelectIndices.includes(idx);
                      return (
                        <div key={idx} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setLiveNoteMultiSelectIndices(prev =>
                                prev.includes(idx)
                                  ? prev.filter(i => i !== idx)
                                  : [...prev, idx].sort((a, b) => a - b)
                              )
                            }
                            title={isChecked ? "Uncheck correct answer" : `Check choice ${String.fromCharCode(65 + idx)} as correct`}
                            className={`h-7 px-2 rounded-lg border text-xs font-mono font-bold flex items-center justify-center gap-1 shrink-0 transition-colors cursor-pointer ${
                              isChecked
                                ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white shadow-sm"
                                : "bg-white dark:bg-[#0b0e18] border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:border-emerald-400"
                            }`}
                          >
                            <span
                              className={`w-3 h-3 rounded border flex items-center justify-center ${
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
                            onChange={(e) => {
                              const next = [...liveNoteMcqOptions];
                              next[idx] = e.target.value;
                              setLiveNoteMcqOptions(next);
                            }}
                            className={`flex-1 min-w-0 text-xs px-2.5 py-1.5 bg-white dark:bg-[#0b0e18] border rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none ${
                              isChecked
                                ? "border-emerald-400 dark:border-emerald-600/60 focus:border-emerald-500"
                                : "border-slate-200 dark:border-white/12 focus:border-blue-500"
                            }`}
                          />
                          {liveNoteMcqOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                setLiveNoteMcqOptions(prev => prev.filter((_, i) => i !== idx));
                                setLiveNoteMultiSelectIndices(prev =>
                                  prev
                                    .filter(i => i !== idx)
                                    .map(i => (i > idx ? i - 1 : i))
                                );
                              }}
                              title="Remove choice"
                              className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                    <span>Answer Explanation (Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional: explain why these choices are correct..."
                    value={liveNoteExplanation}
                    onChange={(e) => setLiveNoteExplanation(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 custom-scrollbar"
                  />
                </div>
              </div>
            ) : liveNoteCategory === "true_false" ? (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-purple-600 dark:text-purple-300 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>True / False Statement</span>
                  </label>
                  <textarea
                    ref={liveNoteQuestionRef}
                    rows={2}
                    placeholder="e.g. UDP guarantees ordered, reliable packet delivery."
                    value={liveNoteQuestion}
                    onChange={(e) => setLiveNoteQuestion(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-purple-300 dark:border-purple-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-500 custom-scrollbar"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Correct Answer</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLiveNoteTrueFalseAnswer("true")}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        liveNoteTrueFalseAnswer === "true"
                          ? "keep-white bg-emerald-600 border-emerald-600 text-white !text-white shadow-sm"
                          : "bg-white dark:bg-[#0b0e18] border-slate-200 dark:border-white/12 text-slate-700 dark:text-slate-300 hover:border-emerald-400"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>True</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLiveNoteTrueFalseAnswer("false")}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        liveNoteTrueFalseAnswer === "false"
                          ? "keep-white bg-rose-600 border-rose-600 text-white !text-white shadow-sm"
                          : "bg-white dark:bg-[#0b0e18] border-slate-200 dark:border-white/12 text-slate-700 dark:text-slate-300 hover:border-rose-400"
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>False</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                    <span>Answer Explanation (Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional: explain why this statement is True or False..."
                    value={liveNoteExplanation}
                    onChange={(e) => setLiveNoteExplanation(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 custom-scrollbar"
                  />
                </div>
              </div>
            ) : liveNoteCategory === "definition" ? (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-sky-600 dark:text-sky-300 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>Term / Concept</span>
                  </label>
                  <input
                    ref={liveNoteTermRef}
                    type="text"
                    placeholder="Type the term or concept..."
                    value={liveNoteTerm}
                    onChange={(e) => setLiveNoteTerm(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white dark:bg-[#0b0e18] border border-sky-300 dark:border-sky-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>Definition</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Type the definition or explanation..."
                    value={liveNoteDefinition}
                    onChange={(e) => setLiveNoteDefinition(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-emerald-300 dark:border-emerald-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 custom-scrollbar"
                  />
                </div>
              </div>
            ) : liveNoteCategory === "url" || liveNoteCategory === "reading_url" ? (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-cyan-600 dark:text-cyan-300 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {liveNoteCategory === "reading_url" ? "Website Reading URL" : "Video or Resource URL"}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={liveNoteUrlRef}
                      type="url"
                      placeholder={
                        liveNoteCategory === "reading_url"
                          ? "https://example.com/article, documentation, or reading page"
                          : "https://www.youtube.com/watch?v=..., Coursera, Udemy, or docs link"
                      }
                      value={liveNoteUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLiveNoteUrl(val);
                        if (liveNoteCategory === "url" && isLikelyLoginProtectedUrl(val)) {
                          setLiveNoteRequiresLogin(true);
                        }
                      }}
                      className="flex-1 min-w-0 text-xs px-3 py-2 bg-white dark:bg-[#0b0e18] border border-cyan-300 dark:border-cyan-700/40 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                    {isSafeHttpUrl(liveNoteUrl) && (
                      <a
                        href={liveNoteUrl.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                        title="Open website to read now"
                      >
                        <span>Read</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {liveNoteCategory === "reading_url" ? (
                  <label className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={liveNoteAssignReading}
                      onChange={(e) => setLiveNoteAssignReading(e.target.checked)}
                      className="rounded border-cyan-400 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span>Remind me to read this website when studying, reviewing, or testing</span>
                  </label>
                ) : (
                  <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={liveNoteRequiresLogin}
                      onChange={(e) => setLiveNoteRequiresLogin(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span>Requires login (remind me to go study this link when studying, reviewing, or testing)</span>
                  </label>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {liveNoteCategory === "reading_url"
                      ? "Reading Highlights or Notes (Optional)"
                      : "Lesson Context or Transcript (Optional)"}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={
                      liveNoteCategory === "reading_url"
                        ? "Optional: jot down key points from the website or leave blank to extract from the page."
                        : "Optional: paste key points or transcript so I can quiz you on login-protected lessons."
                    }
                    value={liveNoteUrlContext}
                    onChange={(e) => setLiveNoteUrlContext(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 custom-scrollbar"
                  />
                </div>
                {(liveNoteCategory === "reading_url" || !liveNoteRequiresLogin || liveNoteUrlContext.trim().length > 0) && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={extractOnUrlSave}
                      onChange={(e) => setExtractOnUrlSave(e.target.checked)}
                      className="rounded border-slate-400 text-violet-600 focus:ring-violet-500"
                    />
                    <span>
                      {liveNoteCategory === "reading_url"
                        ? "Extract study notes & quiz questions from this website"
                        : "Extract study notes & quiz questions from this link"}
                    </span>
                  </label>
                )}
              </div>
            ) : liveNoteCategory === "video_upload" ? (
              <div key={liveUploadInputKey} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="block p-2.5 rounded-lg bg-white dark:bg-[#0b0e18] border border-dashed border-cyan-400 dark:border-cyan-600/50 hover:border-cyan-500 transition cursor-pointer">
                    <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-300 flex items-center gap-1.5 mb-0.5">
                      <Video className="w-3.5 h-3.5 shrink-0" />
                      <span>Downloaded Video / Audio</span>
                    </span>
                    <input
                      type="file"
                      accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.m4v,.mp3,.wav,.m4a"
                      onChange={(e) => setLiveUploadVideoFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 block truncate">
                      {liveUploadVideoFile
                        ? `${liveUploadVideoFile.name} (${(liveUploadVideoFile.size / (1024 * 1024)).toFixed(1)} MB)`
                        : "Choose MP4, MOV, WebM, MKV (up to 250 MB)"}
                    </span>
                  </label>

                  <label className="block p-2.5 rounded-lg bg-white dark:bg-[#0b0e18] border border-dashed border-slate-300 dark:border-white/15 hover:border-violet-500 transition cursor-pointer">
                    <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-300 flex items-center gap-1.5 mb-0.5">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>Transcript File (Optional)</span>
                    </span>
                    <input
                      type="file"
                      accept=".txt,.vtt,.srt,.md,text/plain,text/vtt"
                      onChange={(e) => setLiveUploadTranscriptFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 block truncate">
                      {liveUploadTranscriptFile
                        ? liveUploadTranscriptFile.name
                        : "Optional: .txt, .vtt, .srt, or .md"}
                    </span>
                  </label>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Lecture Transcript or Text (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Optional: paste downloaded captions, transcript, or notes alongside (or instead of) the video..."
                    value={liveUploadTranscriptText}
                    onChange={(e) => setLiveUploadTranscriptText(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-[#0b0e18] border border-slate-200 dark:border-white/12 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 custom-scrollbar"
                  />
                </div>
              </div>
            ) : liveNoteCategory === "table" ? (
              <TableNoteEditor
                headers={liveNoteTableHeaders}
                rows={liveNoteTableRows}
                onChange={(nextHeaders, nextRows) => {
                  setLiveNoteTableHeaders(nextHeaders);
                  setLiveNoteTableRows(nextRows);
                }}
                compact
              />
            ) : (
              <StudyNoteTextEditor
                rows={4}
                placeholder="Type your notes here while studying... bulleted lists (- item), numbered lists (1. item), definitions, equations, or code."
                value={liveNoteContent}
                onChange={setLiveNoteContent}
                compact
                darkSurface
              />
            )}

            {/* Compact On-Demand Screenshot & Image Strip (Paste works anywhere in panel automatically) */}
            <div className="space-y-2 pt-0.5">
              <input
                ref={liveScreenshotFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  void handleUploadLiveScreenshotFiles(e.target.files);
                  e.target.value = "";
                }}
                className="sr-only"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLiveAttachments(prev => !prev)}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/12 text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Attach screenshots or paste text with images directly with Ctrl+V"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 shrink-0" />
                    <span>
                      {liveNoteScreenshots.length > 0
                        ? `Images (${liveNoteScreenshots.length}/${MAX_NOTE_IMAGES})`
                        : "Attach Image / Screenshot"}
                    </span>
                  </button>

                  {isProcessingLivePasteImages && (
                    <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Importing pasted images...</span>
                    </span>
                  )}
                </div>

                {!showLiveAttachments && liveNoteScreenshots.length === 0 && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                    Ctrl+V pastes text &amp; images
                  </span>
                )}
              </div>

              {(showLiveAttachments || liveNoteScreenshots.length > 0 || Boolean(screenshotFallbackNotice)) && (
                <div className="space-y-2 pt-1 animate-fadeIn">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleTakeLiveScreenshot}
                        disabled={isCapturingScreenshot || liveNoteScreenshots.length >= MAX_NOTE_IMAGES}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/5 hover:bg-violet-50 dark:hover:bg-violet-500/15 border border-slate-200 dark:border-white/12 hover:border-violet-400/50 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
                        title="Capture screen, or snip with Win+Shift+S / Cmd+Shift+4 and paste with Ctrl+V"
                      >
                        {isCapturingScreenshot ? (
                          <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin shrink-0" />
                        ) : (
                          <Camera className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                        )}
                        <span>{isCapturingScreenshot ? "Capturing..." : "Capture Screen"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => liveScreenshotFileInputRef.current?.click()}
                        disabled={liveNoteScreenshots.length >= MAX_NOTE_IMAGES}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/12 text-slate-600 dark:text-slate-300 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
                        title="Attach saved image files"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 shrink-0" />
                        <span>Choose File</span>
                      </button>
                    </div>

                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      Win+Shift+S / Cmd+Shift+4 → Ctrl+V
                    </span>
                  </div>

                  {screenshotFallbackNotice && (
                    <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300">
                      {screenshotFallbackNotice}
                    </div>
                  )}

                  {liveNoteScreenshots.length > 0 && (
                    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${liveNoteScreenshots.length > 4 ? "max-h-60 overflow-y-auto pr-1 custom-scrollbar" : ""}`}>
                      {liveNoteScreenshots.map((src, idx) => (
                        <div
                          key={`${idx}_${src.slice(0, 32)}`}
                          className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-white/15 bg-black/40 aspect-video"
                        >
                          <button
                            type="button"
                            onClick={() => setLightboxScreenshotUrl(src)}
                            className="w-full h-full block cursor-zoom-in"
                            title="Click to preview full size"
                          >
                            <img
                              src={src}
                              alt={`Note screenshot ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setLiveNoteScreenshots(prev => prev.filter((_, i) => i !== idx))
                            }
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/75 hover:bg-rose-600 text-white opacity-85 group-hover:opacity-100 transition-colors cursor-pointer"
                            title="Remove screenshot"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DuplicateWarningBanner
              matches={liveDraftDuplicateMatches}
              allowDuplicateSave={allowDuplicateLiveNoteSave}
              onToggleAllowDuplicate={(allowed) => {
                setAllowDuplicateLiveNoteSave(allowed);
                if (allowed) setBlockedDuplicateLiveSave(false);
              }}
              onViewExistingNote={(noteId) => {
                setKnowledgeHubInitialTab("notes");
                setKnowledgeHubInitialNoteId(noteId);
                setShowKnowledgeHubModal(true);
              }}
              compact
              wasBlockedOnSave={blockedDuplicateLiveSave}
            />

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-1.5 min-w-0 text-xs text-slate-500 dark:text-slate-400">
                <span className="tabular-nums whitespace-nowrap">
                  {activeGoal?.knowledgeHub?.notes?.length || 0} saved in hub
                </span>
                <span className="hidden sm:inline text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  · Ctrl+Enter to save
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowLiveNotes(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Collapse
                </button>
                <button
                  type="button"
                  onClick={handleSaveLiveStudyNote}
                  disabled={isLiveNoteSaveDisabled}
                  title="Save (Ctrl + Enter)"
                  className={`px-4 py-2 disabled:opacity-40 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    liveDraftDuplicateMatches.length > 0 && !allowDuplicateLiveNoteSave
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "bg-violet-600 hover:bg-violet-500"
                  }`}
                >
                  {isExtractingLiveUrl || isExtractingLiveUpload ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                  ) : liveNoteCategory === "video_upload" ? (
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Save className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {liveDraftDuplicateMatches.length > 0 && !allowDuplicateLiveNoteSave
                      ? "Already Added — Review"
                      : isExtractingLiveUpload
                      ? "Analyzing..."
                      : isExtractingLiveUrl
                      ? "Extracting..."
                      : liveNoteCategory === "qa"
                      ? "Save Q&A"
                      : liveNoteCategory === "fill_in_blank"
                      ? "Save Fill-in-the-Blank"
                      : liveNoteCategory === "multiple_choice"
                      ? "Save Multiple Choice"
                      : liveNoteCategory === "multiple_select"
                      ? "Save Multiple Select"
                      : liveNoteCategory === "true_false"
                      ? "Save True / False"
                      : liveNoteCategory === "definition"
                      ? "Save Definition"
                      : liveNoteCategory === "table"
                      ? "Save Table"
                      : liveNoteCategory === "url"
                      ? (extractOnUrlSave && (!liveNoteRequiresLogin || liveNoteUrlContext.trim().length > 0) ? "Save & Extract" : "Save Link")
                      : liveNoteCategory === "reading_url"
                      ? (extractOnUrlSave ? "Save & Extract" : "Save Reading Link")
                      : liveNoteCategory === "video_upload"
                      ? "Extract & Save"
                      : "Save Note"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick helper banner to open notes scratchpad if collapsed */}
        {!showLiveNotes && (
          <div className="mb-3 px-3 py-2 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
              <FileText className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
              <span className="truncate">Need to jot down notes, Q&amp;As, fill-in-the-blanks, or definitions?</span>
            </div>
            <button
              type="button"
              onClick={() => setShowLiveNotes(true)}
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Take Notes
            </button>
          </div>
        )}

        {/* SUB-STEPS / PHASES PROGRESS BAR & CURRENT PHASE CARD */}
        {subStepsWithOffsets.length > 0 && activeStepInfo && !showCustomBreakdownBuilder && (
          <div className="mb-4 bg-[#0a0c16] border border-indigo-500/30 rounded-2xl p-3 space-y-2.5">
            {/* Segmented Phase Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1 font-mono">
                  <ListOrdered className="w-3.5 h-3.5 text-indigo-400" />
                  Phase Breakdown ({activeStepInfo.index + 1} of {subStepsWithOffsets.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleOpenCustomBreakdown}
                    className="text-indigo-300 hover:text-white transition cursor-pointer text-[10px] flex items-center gap-1 bg-indigo-500/20 hover:bg-indigo-500/30 px-2 py-0.5 rounded-md border border-indigo-500/30 font-semibold"
                    title="Customize sub-step phases & timings"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Edit Phases</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSubStepsEditor(!showSubStepsEditor)}
                    className="text-slate-400 hover:text-white transition cursor-pointer text-[10px] flex items-center gap-0.5"
                  >
                    <span>{showSubStepsEditor ? "Hide" : "View All"}</span>
                  </button>
                </div>
              </div>

              {/* Segmented Track */}
              <div className="flex gap-1.5 w-full h-2 rounded-full overflow-hidden bg-black/40 p-0.5">
                {subStepsWithOffsets.map((step) => {
                  const isPast = timeSpentSec >= step.endSec;
                  const isCurrent = timeSpentSec >= step.startSec && timeSpentSec < step.endSec;
                  const currentPercent = isCurrent ? activeStepInfo.stepProgressPercent : isPast ? 100 : 0;

                  return (
                    <div 
                      key={step.id} 
                      onClick={() => handleJumpToSubStep(step.index)}
                      className={`h-full rounded-full transition-all duration-300 relative cursor-pointer group flex-1 bg-white/10 hover:bg-white/20`}
                      title={`${step.title} (${step.durationMinutes}m) - Click to jump`}
                    >
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isPast 
                            ? "bg-emerald-400" 
                            : isCurrent 
                            ? "bg-indigo-400" 
                            : "bg-transparent"
                        }`}
                        style={{ width: `${currentPercent}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Phase Focus Pill Banner */}
            {(() => {
              const isSelfTestPhase = isKnowledgeTesterStep(activeStepInfo);
              const assignedNoteObj = activeStepInfo.assignedLinkNoteId
                ? activeGoal?.knowledgeHub?.notes?.find(n => n.id === activeStepInfo.assignedLinkNoteId)
                : undefined;
              const stepLinkUrl = assignedNoteObj?.url || (isSafeHttpUrl(activeStepInfo.assignedLinkUrl) ? activeStepInfo.assignedLinkUrl : undefined);
              const stepLinkTitle = assignedNoteObj?.title || activeStepInfo.assignedLinkTitle || "Assigned Study Link";
              const linksToPrompt = stepLinkUrl
                ? [{
                    id: assignedNoteObj?.id || `step_link_${activeStepInfo.id}`,
                    title: stepLinkTitle,
                    url: stepLinkUrl,
                    isSavedNote: Boolean(assignedNoteObj),
                    reviewCompleted: assignedNoteObj ? Boolean(assignedNoteObj.reviewCompleted) : Boolean(reviewedCustomStepLinkIds[activeStepInfo.id]),
                    studyCount: assignedNoteObj?.studyCount || 0
                  }]
                : loginStudyLinks.map(l => ({
                    id: l.id,
                    title: l.title,
                    url: l.url!,
                    isSavedNote: true,
                    reviewCompleted: Boolean(l.reviewCompleted),
                    studyCount: l.studyCount || 0
                  }));

              return (
                <div className={`border p-2.5 rounded-xl space-y-2 ${
                  isSelfTestPhase
                    ? "bg-violet-950/45 border-violet-500/40"
                    : "bg-indigo-950/40 border-indigo-500/25"
                }`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`p-1.5 border rounded-lg shrink-0 ${
                        isSelfTestPhase
                          ? "bg-violet-600/35 border-violet-400/50 text-violet-200"
                          : "bg-indigo-600/30 border-indigo-400/40 text-indigo-300"
                      }`}>
                        {isSelfTestPhase ? (
                          <ClipboardCheck className="w-4 h-4 text-violet-300" />
                        ) : (
                          <Flame className="w-4 h-4 text-amber-400" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono ${
                            isSelfTestPhase
                              ? "text-violet-200 bg-violet-500/30"
                              : "text-indigo-300 bg-indigo-500/20"
                          }`}>
                            {isSelfTestPhase ? `Knowledge Tester · Phase ${activeStepInfo.index + 1}` : `Phase ${activeStepInfo.index + 1}`}
                          </span>
                          <span className="text-[10px] text-slate-300 font-mono">
                            {formatTime(activeStepInfo.stepRemainingSec)} left in phase
                          </span>
                          {typeof activeStepInfo.lastTestScore === "number" && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                              Score: {activeStepInfo.lastTestScore}%
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-white truncate drop-shadow-xs">
                          {activeStepInfo.title}
                        </h4>
                        {activeStepInfo.description && (
                          <p className="text-[10px] text-slate-400 truncate max-w-[200px] sm:max-w-[240px]">
                            {activeStepInfo.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Step Knowledge Tester + Note + Next Phase Controls */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {isSelfTestPhase && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const nextOpen = !showSelfTestPanel;
                              setShowSelfTestPanel(nextOpen);
                              if (nextOpen && !activeSelfTest && !isGeneratingSelfTest) {
                                handleLoadOrGenerateSelfTest(false);
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                              showSelfTestPanel
                                ? "bg-violet-600 text-white border-violet-400"
                                : "bg-violet-600/35 hover:bg-violet-600 border-violet-400/50 text-violet-100"
                            }`}
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            <span>{showSelfTestPanel ? "Hide Tester" : "Take Test"}</span>
                          </button>
                          {activeGoal && (
                            <button
                              type="button"
                              onClick={() => {
                                setKnowledgeHubInitialTab("tester");
                                setShowKnowledgeHubModal(true);
                              }}
                              className="px-2 py-1.5 rounded-xl text-[10px] font-bold bg-white/5 hover:bg-violet-500/25 border border-violet-400/30 text-violet-200 transition cursor-pointer"
                              title="Open full Knowledge Tester modal"
                            >
                              Hub Tester
                            </button>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (editingStepNoteId === activeStepInfo.id) {
                            setEditingStepNoteId(null);
                          } else {
                            setEditingStepNoteId(activeStepInfo.id);
                            setEditingStepNoteText(activeStepInfo.carryoverNote || "");
                          }
                        }}
                        className={`px-2 py-1.5 rounded-xl text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                          activeStepInfo.carryoverNote || editingStepNoteId === activeStepInfo.id
                            ? "bg-amber-500/20 border-amber-400/45 text-amber-200 hover:bg-amber-500/30"
                            : "bg-white/5 hover:bg-amber-500/15 border-white/10 text-slate-300 hover:text-amber-200"
                        }`}
                        title={activeStepInfo.carryoverNote ? "Edit carryover note for this step" : "Add carryover note for this step"}
                      >
                        <StickyNote className="w-3 h-3 text-amber-400" />
                        <span>{activeStepInfo.carryoverNote ? "Step Note" : "+ Note"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCompleteCurrentSubStep}
                        className="px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-400/40 text-indigo-200 hover:text-white rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                        title={activeStepInfo.isLastStep ? "Finish Session" : "Mark phase complete & advance to next phase"}
                      >
                        <span>{activeStepInfo.isLastStep ? "Finish" : "Next Phase"}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Embedded Self Test Step Runner (Login Link Review + Material MCQs) */}
                  {isSelfTestPhase && showSelfTestPanel && (
                    <div className="pt-2 border-t border-violet-500/25 space-y-3 animate-fade-in">
                      {/* 1. Login Link Reading / Review Prompt */}
                      {linksToPrompt.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-cyan-950/35 border border-cyan-500/30 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-cyan-200 flex items-center gap-1.5">
                              <Link2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>Review or read this login-required link as part of your test:</span>
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {linksToPrompt.map(lk => (
                              <div
                                key={lk.id}
                                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${
                                  lk.reviewCompleted
                                    ? "bg-emerald-950/25 border-emerald-700/35"
                                    : "bg-slate-900/75 border-cyan-500/25"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (lk.isSavedNote) {
                                      handleToggleLiveLinkAssignment(lk.id);
                                    } else {
                                      setReviewedCustomStepLinkIds(prev => ({
                                        ...prev,
                                        [activeStepInfo.id]: !prev[activeStepInfo.id]
                                      }));
                                    }
                                  }}
                                  className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
                                >
                                  <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                    lk.reviewCompleted
                                      ? "bg-emerald-500 border-emerald-500 text-white"
                                      : "border-cyan-400/60 group-hover:border-cyan-300"
                                  }`}>
                                    {lk.reviewCompleted && <Check className="w-3 h-3" />}
                                  </span>
                                  <span className={`font-medium truncate ${
                                    lk.reviewCompleted ? "line-through text-slate-400" : "text-slate-100"
                                  }`}>
                                    {lk.title}
                                  </span>
                                </button>
                                <a
                                  href={lk.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-semibold whitespace-nowrap shrink-0"
                                >
                                  <span>{lk.reviewCompleted ? "Reviewed ↗" : "Go read / review ↗"}</span>
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 2. Multiple Choice Questions on Material */}
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-violet-500/30 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[11px] font-bold text-violet-200 flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-amber-400" />
                            <span>
                              {activeSelfTest ? activeSelfTest.title : "Multiple-Choice Self Test"}
                            </span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            {activeGoal && (
                              <button
                                type="button"
                                onClick={() => {
                                  setKnowledgeHubInitialTab("tester");
                                  setShowKnowledgeHubModal(true);
                                }}
                                className="px-2 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/35 text-cyan-200 border border-cyan-500/35 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                                title="Upload a downloaded video & transcript text to generate notes and quiz questions"
                              >
                                <Upload className="w-3 h-3" />
                                <span>Upload Video / Text</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleLoadOrGenerateSelfTest(true)}
                              disabled={isGeneratingSelfTest}
                              className="px-2 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/35 text-violet-200 border border-violet-400/35 text-[10px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              {isGeneratingSelfTest ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              <span>New Questions</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-slate-400 mr-1">Mix:</span>
                          {(
                            [
                              { id: "hybrid", label: "AI + Notes" },
                              { id: "notes_only", label: "Notes Only" },
                              { id: "ai_only", label: "AI Only" }
                            ] as const
                          ).map(opt => (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={isGeneratingSelfTest}
                              onClick={() => {
                                setSelfTestSourceMode(opt.id);
                                handleLoadOrGenerateSelfTest(true, opt.id);
                              }}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition cursor-pointer disabled:opacity-50 ${
                                selfTestSourceMode === opt.id
                                  ? "bg-violet-600 border-violet-400 text-white"
                                  : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {selfTestError && (
                          <p className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-lg p-2">
                            {selfTestError}
                          </p>
                        )}

                        {isGeneratingSelfTest ? (
                          <div className="py-5 text-center space-y-2 text-xs text-slate-300">
                            <Loader2 className="w-5 h-5 animate-spin text-violet-400 mx-auto" />
                            <p>Building multiple-choice questions from your study material...</p>
                          </div>
                        ) : activeSelfTest && activeSelfTest.questions.length > 0 ? (
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                            {activeSelfTest.questions.map((q, qIdx) => {
                              const isMultiSelect = isMultiSelectQuestion(q);
                              const expectedCorrectIndices = getQuestionCorrectIndices(q);
                              const picked = selfTestAnswers[q.id];
                              const pickedMulti = selfTestMultiAnswers[q.id] || [];
                              const isQuestionCorrect = isQuestionAnswerCorrect(q, picked, pickedMulti);
                              const correctText = formatQuestionCorrectAnswerText(q);
                              const userPickedText = formatQuestionUserAnswerText(q, picked, pickedMulti);
                              return (
                                <div key={q.id} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10 space-y-2 text-xs">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-semibold text-slate-100 leading-snug">
                                      {qIdx + 1}. {q.question}
                                    </p>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isMultiSelect && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap border bg-blue-500/15 text-blue-200 border-blue-400/35">
                                          Select all
                                        </span>
                                      )}
                                      {q.sourceLabel && (
                                        <span
                                          className={`text-[9px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap shrink-0 border ${
                                            q.sourceType === "note"
                                              ? "bg-teal-500/15 text-teal-200 border-teal-400/35"
                                              : "bg-indigo-500/15 text-indigo-200 border-indigo-400/35"
                                          }`}
                                        >
                                          {q.sourceLabel}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    {q.options.map((opt, optIdx) => {
                                      const isSelected = isMultiSelect
                                        ? pickedMulti.includes(optIdx)
                                        : picked === optIdx;
                                      const isCorrectOpt = expectedCorrectIndices.includes(optIdx);
                                      let optionStyle = "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10";
                                      if (selfTestSubmitted) {
                                        if (isCorrectOpt) {
                                          optionStyle = "bg-emerald-500/20 border-emerald-400/60 text-emerald-200 font-semibold";
                                        } else if (isSelected && !isCorrectOpt) {
                                          optionStyle = "bg-rose-500/20 border-rose-400/60 text-rose-200";
                                        } else {
                                          optionStyle = "bg-white/[0.02] border-white/5 text-slate-500";
                                        }
                                      } else if (isSelected) {
                                        optionStyle = isMultiSelect
                                          ? "bg-blue-600/30 border-blue-400 text-white font-semibold"
                                          : "bg-violet-600/30 border-violet-400 text-white font-semibold";
                                      }

                                      return (
                                        <button
                                          key={optIdx}
                                          type="button"
                                          disabled={selfTestSubmitted}
                                          onClick={() => {
                                            if (isMultiSelect) {
                                              setSelfTestMultiAnswers(prev => {
                                                const cur = prev[q.id] || [];
                                                const next = cur.includes(optIdx)
                                                  ? cur.filter(i => i !== optIdx)
                                                  : [...cur, optIdx].sort((a, b) => a - b);
                                                return { ...prev, [q.id]: next };
                                              });
                                            } else {
                                              setSelfTestAnswers(prev => ({ ...prev, [q.id]: optIdx }));
                                            }
                                          }}
                                          className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[11px] transition flex items-center gap-2 cursor-pointer disabled:cursor-default ${optionStyle}`}
                                        >
                                          {isMultiSelect && (
                                            <span
                                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                                selfTestSubmitted && isCorrectOpt
                                                  ? "bg-emerald-500/30 border-emerald-300 text-emerald-100"
                                                  : selfTestSubmitted && isSelected && !isCorrectOpt
                                                  ? "bg-rose-500/30 border-rose-300 text-rose-100"
                                                  : isSelected
                                                  ? "bg-blue-500 border-blue-300 text-white"
                                                  : "border-white/25 bg-black/20 text-transparent"
                                              }`}
                                            >
                                              {(isSelected || (selfTestSubmitted && isCorrectOpt)) && (
                                                <Check className="w-2.5 h-2.5" />
                                              )}
                                            </span>
                                          )}
                                          <span className="font-mono text-[10px] opacity-75 shrink-0">
                                            {String.fromCharCode(65 + optIdx)}.
                                          </span>
                                          <span className="flex-1">{opt}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {selfTestSubmitted && q.explanation && (
                                    <p className="text-[10.5px] text-slate-300 bg-black/30 px-2.5 py-1.5 rounded border border-white/10 leading-snug">
                                      {q.explanation}
                                    </p>
                                  )}
                                  {selfTestSubmitted && !isQuestionCorrect && (() => {
                                    const allNotes = activeGoal?.knowledgeHub?.notes || [];
                                    const rawMatched = findMatchingNotesForQuestion(
                                      q.question,
                                      q.explanation || "",
                                      correctText,
                                      allNotes,
                                      2
                                    );
                                    const matchedNotes = mergeMatchedNotesWithGenerated(
                                      rawMatched,
                                      generatedSelfTestLessonNoteByQId[q.id],
                                      allNotes,
                                      3
                                    );
                                    const standaloneLesson = !activeGoal ? standaloneGeneratedLessonsByQId[q.id] : undefined;
                                    const isGeneratingThis = generatingSelfTestLessonTarget?.qId === q.id;
                                    const genError = selfTestLessonErrorByQId[q.id];

                                    if (matchedNotes.length > 0) {
                                      return (
                                        <div className="p-2 rounded-lg bg-amber-950/35 border border-amber-500/30 space-y-1.5">
                                          <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                                            <BookOpen className="w-3 h-3" />
                                            <span>Review From Your Notes (click to open):</span>
                                          </span>
                                          <div className="space-y-1">
                                            {matchedNotes.map(mn => (
                                              <div
                                                key={mn.id}
                                                className="flex items-center justify-between gap-2 rounded-md bg-black/25 hover:bg-amber-500/15 border border-amber-500/20 hover:border-amber-400/50 transition px-2 py-1"
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenSavedNoteFromSelfTest(mn.id)}
                                                  title="Open this saved note"
                                                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left text-[10.5px] text-amber-100 hover:text-white cursor-pointer group/stnote"
                                                >
                                                  <span className="truncate group-hover/stnote:underline">• {mn.title}</span>
                                                  <span className="text-[9.5px] font-semibold text-amber-300 shrink-0 inline-flex items-center gap-0.5">
                                                    <span>Open Note</span>
                                                    <ArrowRight className="w-2.5 h-2.5" />
                                                  </span>
                                                </button>
                                                {mn.url && isSafePublicHttpUrl(mn.url) && (
                                                  <a
                                                    href={mn.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-[10px] text-cyan-300 hover:underline shrink-0 inline-flex items-center gap-0.5"
                                                  >
                                                    <span>Link</span>
                                                    <ExternalLink className="w-2.5 h-2.5" />
                                                  </a>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    }

                                    if (standaloneLesson) {
                                      return (
                                        <div className="p-2.5 rounded-lg bg-violet-950/35 border border-violet-500/35 space-y-1.5">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10.5px] font-bold text-violet-200 flex items-center gap-1">
                                              <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                                              <span>{standaloneLesson.title}</span>
                                            </span>
                                          </div>
                                          <div className="max-h-40 overflow-y-auto pr-1 text-slate-200 [&_p]:text-slate-200 [&_li]:text-slate-200">
                                            <FormattedStudyText text={standaloneLesson.content} className="text-[10.5px]" />
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-500/25 space-y-1.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="text-[10px] font-semibold text-amber-200 flex items-center gap-1">
                                            <BookOpen className="w-3 h-3 text-amber-300 shrink-0" />
                                            <span>No saved note for this topic yet — generate &amp; save:</span>
                                          </span>
                                          <div className="flex items-center gap-1 flex-wrap">
                                            {(["lesson", "lecture", "note"] as TopicLessonStyle[]).map(style => {
                                              const isThisSpinning =
                                                isGeneratingThis && generatingSelfTestLessonTarget?.style === style;
                                              return (
                                                <button
                                                  key={style}
                                                  type="button"
                                                  disabled={Boolean(generatingSelfTestLessonTarget)}
                                                  onClick={() =>
                                                    handleGenerateLessonForSelfTestQuestion(
                                                      q,
                                                      userPickedText,
                                                      style
                                                    )
                                                  }
                                                  className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                                >
                                                  {isThisSpinning ? (
                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                  ) : (
                                                    <Sparkles className="w-2.5 h-2.5 text-amber-200" />
                                                  )}
                                                  <span>
                                                    AI {style === "lesson" ? "Lesson" : style === "lecture" ? "Lecture" : "Note"}
                                                  </span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                        {isGeneratingThis && (
                                          <p className="text-[10px] text-violet-200 flex items-center gap-1">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span>Generating &amp; saving topic study material...</span>
                                          </p>
                                        )}
                                        {genError && (
                                          <p className="text-[10px] text-rose-200 bg-rose-950/50 border border-rose-500/35 rounded px-2 py-1">
                                            {genError}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-3">
                            <button
                              type="button"
                              onClick={() => handleLoadOrGenerateSelfTest(false)}
                              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold cursor-pointer"
                            >
                              Load Multiple-Choice Questions
                            </button>
                          </div>
                        )}

                        {selfTestSubmitted && activeSelfTest && activeSelfTest.questions.length > 0 && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-[10.5px] text-cyan-200 font-semibold flex items-center gap-1">
                                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                                <span>
                                  {activeSelfTest.questions.some(q => !isQuestionAnswerCorrect(q, selfTestAnswers[q.id], selfTestMultiAnswers[q.id]))
                                    ? "Missed questions? Get targeted readings & save them:"
                                    : "Want deeper follow-up reading?"}
                                </span>
                              </span>
                              <button
                                type="button"
                                disabled={isGeneratingSelfTestReadings}
                                onClick={handleGenerateSelfTestReadings}
                                className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                {isGeneratingSelfTestReadings ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3 text-amber-200" />
                                )}
                                <span>
                                  {isGeneratingSelfTestReadings ? "Finding Readings..." : "AI Recommend Readings"}
                                </span>
                              </button>
                            </div>

                            {selfTestReadingRecs.length > 0 && (
                              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                {selfTestReadingRecs.map(rec => {
                                  const saved = isRecommendationSaved(rec, activeGoal?.knowledgeHub?.notes || []);
                                  return (
                                    <div
                                      key={rec.id}
                                      className="p-2 rounded-lg bg-cyan-950/35 border border-cyan-500/30 space-y-1 text-[11px]"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="font-semibold text-cyan-100 leading-snug">{rec.title}</span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <a
                                            href={getRecommendationOpenUrl(rec)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-cyan-200 text-[10px] font-semibold inline-flex items-center gap-0.5"
                                          >
                                            <ExternalLink className="w-2.5 h-2.5" />
                                            <span>Read</span>
                                          </a>
                                          {activeGoal && (
                                            <button
                                              type="button"
                                              disabled={saved}
                                              onClick={() => handleSaveSelfTestReading(rec)}
                                              className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-0.5 cursor-pointer ${
                                                saved
                                                  ? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 cursor-default"
                                                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
                                              }`}
                                            >
                                              {saved ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                                              <span>{saved ? "Saved" : "Save"}</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-[10px] text-slate-300 leading-snug">{rec.whyItHelps}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {activeSelfTest && activeSelfTest.questions.length > 0 && (
                          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                            {selfTestSubmitted ? (
                              <>
                                <span className="text-xs font-bold text-emerald-300">
                                  Score: {activeSelfTest.lastScoreFraction} ({activeSelfTest.lastScore}%)
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleLoadOrGenerateSelfTest(true)}
                                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] font-semibold cursor-pointer"
                                  >
                                    Retry / New Quiz
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowSelfTestPanel(false);
                                      handleCompleteCurrentSubStep();
                                    }}
                                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    {activeStepInfo.isLastStep ? "Finish Session ✓" : "Complete & Next Phase →"}
                                  </button>
                                </div>
                              </>
                            ) : (() => {
                              const answeredSelfTestCount = activeSelfTest.questions.filter(q =>
                                isMultiSelectQuestion(q)
                                  ? (selfTestMultiAnswers[q.id]?.length || 0) > 0
                                  : selfTestAnswers[q.id] !== undefined
                              ).length;
                              return (
                                <>
                                  <span className="text-[10px] text-slate-400">
                                    {answeredSelfTestCount}/{activeSelfTest.questions.length} answered
                                  </span>
                                  <button
                                    type="button"
                                    disabled={answeredSelfTestCount < activeSelfTest.questions.length}
                                    onClick={handleSubmitSelfTest}
                                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    Submit Answers
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Active Step Inline Note Editor or Saved Note Callout */}
                  {editingStepNoteId === activeStepInfo.id ? (
                    <div className="space-y-1.5 pt-1.5 border-t border-white/10">
                      <textarea
                        rows={2}
                        autoFocus
                        value={editingStepNoteText}
                        onChange={(e) => setEditingStepNoteText(e.target.value)}
                        placeholder={`Session carryover note for "${activeStepInfo.title}"...`}
                        className="w-full text-[11px] p-2 rounded-lg bg-slate-950/80 border border-amber-500/45 text-amber-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                      />
                      <div className="flex items-center justify-between gap-2">
                        {activeStepInfo.carryoverNote ? (
                          <button
                            type="button"
                            onClick={() => handleSaveModalStepNote(activeStepInfo.id, activeStepInfo.title, "")}
                            className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 cursor-pointer"
                          >
                            Clear Note
                          </button>
                        ) : <span />}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingStepNoteId(null)}
                            className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveModalStepNote(activeStepInfo.id, activeStepInfo.title, editingStepNoteText)}
                            className="px-2.5 py-0.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Save Step Note</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : activeStepInfo.carryoverNote ? (
                    <div
                      onClick={() => {
                        setEditingStepNoteId(activeStepInfo.id);
                        setEditingStepNoteText(activeStepInfo.carryoverNote || "");
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200/95 flex items-start justify-between gap-2 cursor-pointer hover:bg-amber-500/15 transition"
                      title="Click to edit carryover note for this step"
                    >
                      <span className="italic leading-snug break-words">📝 "{activeStepInfo.carryoverNote}"</span>
                      <span className="text-[9px] text-amber-300 underline font-bold shrink-0">Edit</span>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {/* Expandable Full Steps List */}
            {showSubStepsEditor && (
              <div className="space-y-1.5 pt-1 border-t border-white/10 max-h-48 overflow-y-auto pr-1">
                {subStepsWithOffsets.map((step) => {
                  const isDone = timeSpentSec >= step.endSec;
                  const isCurr = timeSpentSec >= step.startSec && timeSpentSec < step.endSec;
                  const isEditingThisStepNote = editingStepNoteId === step.id;

                  return (
                    <div 
                      key={step.id} 
                      onClick={() => {
                        if (!isEditingThisStepNote) handleJumpToSubStep(step.index);
                      }}
                      className={`p-2 rounded-xl border text-xs cursor-pointer transition space-y-1.5 ${
                        isCurr 
                          ? "bg-indigo-600/20 border-indigo-400/50 text-white font-bold ring-1 ring-indigo-400/30" 
                          : isDone 
                          ? "bg-black/30 border-white/5 text-slate-400 opacity-80" 
                          : "bg-black/20 border-white/5 text-slate-300 hover:border-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isDone ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : isCurr ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full bg-white/10 text-[9px] flex items-center justify-center font-mono text-slate-400 shrink-0">
                              {step.index + 1}
                            </span>
                          )}
                          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                            <span className={`truncate ${isDone ? "line-through text-slate-500" : ""}`}>
                              {step.title}
                            </span>
                            {isKnowledgeTesterStep(step) && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-violet-500/25 text-violet-200 border border-violet-400/35 shrink-0">
                                Knowledge Tester
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isEditingThisStepNote) {
                                setEditingStepNoteId(null);
                              } else {
                                setEditingStepNoteId(step.id);
                                setEditingStepNoteText(step.carryoverNote || "");
                              }
                            }}
                            className={`p-1 rounded transition cursor-pointer ${
                              step.carryoverNote || isEditingThisStepNote
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/35"
                                : "text-slate-400 hover:text-amber-300 hover:bg-white/10"
                            }`}
                            title={step.carryoverNote ? "Edit step carryover note" : "Add carryover note for this step"}
                          >
                            <StickyNote className="w-3 h-3" />
                          </button>

                          <span className="text-[10px] font-mono text-indigo-300 font-semibold shrink-0 bg-white/5 px-1.5 py-0.5 rounded">
                            {step.durationMinutes}m
                          </span>
                        </div>
                      </div>

                      {isEditingThisStepNote ? (
                        <div className="space-y-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            rows={2}
                            autoFocus
                            value={editingStepNoteText}
                            onChange={(e) => setEditingStepNoteText(e.target.value)}
                            placeholder={`Carryover note for "${step.title}"...`}
                            className="w-full text-[11px] p-1.5 rounded-lg bg-slate-950/90 border border-amber-500/40 text-amber-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 font-normal"
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingStepNoteId(null)}
                              className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveModalStepNote(step.id, step.title, editingStepNoteText)}
                              className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      ) : step.carryoverNote ? (
                        <div className="ml-5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-200/90 italic font-normal truncate">
                          📝 "{step.carryoverNote}"
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {(timerState?.subSteps || []).filter(s => !isStepActive(s)).map((step) => (
                  <div
                    key={step.id}
                    className="p-2 rounded-xl border border-dashed border-white/10 bg-slate-900/40 text-xs text-slate-400 flex items-center justify-between gap-2 opacity-75"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-white/10 shrink-0">
                        Inactive
                      </span>
                      {isKnowledgeTesterStep(step) && (
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-400/30 shrink-0">
                          Knowledge Tester
                        </span>
                      )}
                      <span className="truncate">{step.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTimerState((prev) => {
                          if (!prev?.subSteps) return prev;
                          return {
                            ...prev,
                            subSteps: prev.subSteps.map(s => s.id === step.id ? { ...s, enabled: true } : s)
                          };
                        });
                      }}
                      className="px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold cursor-pointer shrink-0 transition"
                    >
                      Activate
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CUSTOM BREAKDOWN BUILDER PANEL */}
        {showCustomBreakdownBuilder && (
          <div className="mb-4 p-3.5 bg-[#0b0e1b] border border-indigo-500/40 rounded-2xl animate-fade-in space-y-3 shadow-xl shadow-indigo-950/40">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-indigo-400">
                  <Layers className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-extrabold text-white">
                    {templateEditorState 
                      ? (templateEditorState.mode === "edit" ? "Edit Custom Template" : "Save as Custom Template") 
                      : "Custom Phase Breakdown"}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {templateEditorState 
                      ? "Configure and store reusable session routines" 
                      : "Design structured phases with custom timings & reusable templates"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (templateEditorState) {
                    setTemplateEditorState(null);
                  } else {
                    setShowCustomBreakdownBuilder(false);
                  }
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer transition"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* In-builder notification banner */}
            {templateFeedbackMessage && (
              <div className="p-2 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-xs text-indigo-200 flex items-center justify-between gap-2 animate-fade-in">
                <span className="flex items-center gap-1.5 font-medium">
                  <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  {templateFeedbackMessage}
                </span>
                <button
                  type="button"
                  onClick={() => setTemplateFeedbackMessage(null)}
                  className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* TEMPLATE EDITOR VIEW */}
            {templateEditorState ? (
              <div className="space-y-3 animate-fade-in">
                {/* Template Name & Icon */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Template Details
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative group shrink-0">
                      <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg cursor-pointer hover:bg-white/10 transition">
                        {templateEditorState.icon}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={templateEditorState.name}
                      onChange={(e) => setTemplateEditorState({ ...templateEditorState, name: e.target.value })}
                      placeholder="Template Name (e.g. Cyber Drill, Deep Study)"
                      className="flex-1 text-xs bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 font-semibold"
                    />
                  </div>

                  {/* Emoji Quick Palette */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                    <span className="text-[9px] text-slate-500 font-mono shrink-0 mr-1">Icon:</span>
                    {TEMPLATE_EMOJI_PRESETS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setTemplateEditorState({ ...templateEditorState, icon: emoji })}
                        className={`w-6 h-6 text-xs rounded-lg flex items-center justify-center cursor-pointer transition shrink-0 ${
                          templateEditorState.icon === emoji
                            ? "bg-indigo-600/40 border border-indigo-400 text-white scale-110"
                            : "bg-white/5 hover:bg-white/15 border border-white/5 text-slate-300"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={templateEditorState.description}
                    onChange={(e) => setTemplateEditorState({ ...templateEditorState, description: e.target.value })}
                    placeholder="Short description or summary (optional)"
                    className="w-full text-[11px] bg-white/5 border border-white/10 rounded-xl px-2.5 py-1 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                </div>

                {/* Template Phase Steps */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Template Phases ({templateEditorState.steps.length})</span>
                    {draftSubSteps.length > 0 && (
                      <button
                        type="button"
                        onClick={handleImportCurrentPhasesIntoEditor}
                        className="text-indigo-400 hover:text-indigo-300 text-[9px] font-semibold lowercase font-mono cursor-pointer hover:underline flex items-center gap-1"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        <span>import current phases ({draftSubSteps.length})</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {templateEditorState.steps.map((step, idx) => (
                      <div key={step.id || idx} className="p-2 bg-black/40 border border-white/10 rounded-xl flex items-center gap-2">
                        {/* Order controls */}
                        <div className="flex flex-col items-center justify-center">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleTemplateEditorMovePhase(idx, -1)}
                            className="text-slate-500 hover:text-slate-200 disabled:opacity-20 cursor-pointer p-0.5"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] font-mono font-bold text-indigo-300">{idx + 1}</span>
                          <button
                            type="button"
                            disabled={idx === templateEditorState.steps.length - 1}
                            onClick={() => handleTemplateEditorMovePhase(idx, 1)}
                            className="text-slate-500 hover:text-slate-200 disabled:opacity-20 cursor-pointer p-0.5"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Title input */}
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={step.title}
                            onChange={(e) => handleTemplateEditorUpdateStep(idx, "title", e.target.value)}
                            placeholder={`Phase ${idx + 1} Title`}
                            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 font-medium"
                          />
                        </div>

                        {/* Duration minutes stepper */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const cur = Number(step.durationMinutes) || 10;
                              handleTemplateEditorUpdateStep(idx, "durationMinutes", Math.max(1, cur - 5));
                            }}
                            className="w-6 h-6 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer transition border border-white/5"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="300"
                            value={step.durationMinutes}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value) || 1);
                              handleTemplateEditorUpdateStep(idx, "durationMinutes", val);
                            }}
                            className="w-11 text-xs bg-white/5 border border-white/10 rounded-lg px-1 py-1 text-white text-center font-mono font-bold focus:outline-none focus:border-indigo-400"
                          />
                          <span className="text-[10px] font-mono text-slate-400">m</span>
                          <button
                            type="button"
                            onClick={() => {
                              const cur = Number(step.durationMinutes) || 10;
                              handleTemplateEditorUpdateStep(idx, "durationMinutes", Math.min(300, cur + 5));
                            }}
                            className="w-6 h-6 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer transition border border-white/5"
                          >
                            +
                          </button>
                        </div>

                        {/* Remove Step */}
                        <button
                          type="button"
                          onClick={() => handleTemplateEditorRemovePhase(idx)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleTemplateEditorAddPhase}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-emerald-400" />
                      <span>+ Add Phase</span>
                    </button>
                    <span className="text-[10px] font-mono text-indigo-300 font-bold">
                      Total: {templateEditorState.steps.reduce((a, b) => a + (Number(b.durationMinutes) || 0), 0)}m
                    </span>
                  </div>
                </div>

                {/* Template Editor Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <div>
                    {templateEditorState.mode === "edit" && templateEditorState.templateId && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(templateEditorState.templateId!, templateEditorState.name)}
                        className="px-2 py-1 text-rose-400/80 hover:text-rose-300 text-[10px] font-bold cursor-pointer hover:bg-rose-500/10 rounded-md transition flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTemplateEditorState(null)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl border border-white/10 cursor-pointer transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTemplateFromEditor}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer transition flex items-center gap-1.5 active:scale-95"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Template</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* STANDARD BREAKDOWN BUILDER VIEW */
              <div className="space-y-3">
                {/* Templates Selector (Presets vs Custom Saved Templates) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center p-0.5 bg-black/40 border border-white/10 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setTemplateTab("presets")}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center gap-1.5 ${
                          templateTab === "presets"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>Presets</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemplateTab("custom")}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center gap-1.5 ${
                          templateTab === "custom"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Bookmark className="w-3 h-3 text-indigo-300" />
                        <span>My Templates ({customTemplates.length})</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenCreateBlankTemplate}
                      className="px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold border border-white/10 transition flex items-center gap-1 cursor-pointer"
                      title="Create new custom template"
                    >
                      <Plus className="w-3 h-3 text-indigo-400" />
                      <span>New Template</span>
                    </button>
                  </div>

                  {/* Preset Templates Grid */}
                  {templateTab === "presets" && (
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyTemplate("3phase")}
                        className="p-1.5 bg-white/5 hover:bg-indigo-600/25 hover:border-indigo-400/50 border border-white/10 rounded-xl text-left transition cursor-pointer group"
                      >
                        <p className="text-[10px] font-bold text-white group-hover:text-indigo-200">🎓 Study Trio</p>
                        <p className="text-[9px] text-slate-400 truncate">Review • Core • Quiz</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate("pomodoro")}
                        className="p-1.5 bg-white/5 hover:bg-rose-600/25 hover:border-rose-400/50 border border-white/10 rounded-xl text-left transition cursor-pointer group"
                      >
                        <p className="text-[10px] font-bold text-white group-hover:text-rose-200">🍅 Pomodoro</p>
                        <p className="text-[9px] text-slate-400 truncate">25m Work • 5m Rest</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate("2phase")}
                        className="p-1.5 bg-white/5 hover:bg-amber-600/25 hover:border-amber-400/50 border border-white/10 rounded-xl text-left transition cursor-pointer group"
                      >
                        <p className="text-[10px] font-bold text-white group-hover:text-amber-200">⚡ Power Sprint</p>
                        <p className="text-[9px] text-slate-400 truncate">80% Focus • 20% Wrap</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate("workout")}
                        className="p-1.5 bg-white/5 hover:bg-emerald-600/25 hover:border-emerald-400/50 border border-white/10 rounded-xl text-left transition cursor-pointer group"
                      >
                        <p className="text-[10px] font-bold text-white group-hover:text-emerald-200">🏋️ Workout Trio</p>
                        <p className="text-[9px] text-slate-400 truncate">Warm • Sets • Stretch</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate("4stage")}
                        className="p-1.5 bg-white/5 hover:bg-purple-600/25 hover:border-purple-400/50 border border-white/10 rounded-xl text-left transition cursor-pointer group"
                      >
                        <p className="text-[10px] font-bold text-white group-hover:text-purple-200">🚀 4-Stage Mastery</p>
                        <p className="text-[9px] text-slate-400 truncate">Primer • Deep • Drill</p>
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateAiSubSteps}
                        disabled={isGeneratingAiSteps}
                        className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 rounded-xl text-left transition cursor-pointer group disabled:opacity-50"
                      >
                        <p className="text-[10px] font-bold text-indigo-300 group-hover:text-white flex items-center gap-1">
                          <Wand2 className="w-3 h-3 text-indigo-400" />
                          AI Generate
                        </p>
                        <p className="text-[9px] text-slate-400 truncate">AI Coach Suggestion</p>
                      </button>
                    </div>
                  )}

                  {/* Custom Stored Templates Grid */}
                  {templateTab === "custom" && (
                    <div className="space-y-1.5">
                      {customTemplates.length === 0 ? (
                        <div className="p-3 bg-black/30 border border-dashed border-white/10 rounded-xl text-center">
                          <BookmarkPlus className="w-5 h-5 text-indigo-400 mx-auto mb-1 opacity-70" />
                          <p className="text-xs font-semibold text-slate-300">No custom templates yet</p>
                          <p className="text-[10px] text-slate-400 mb-2">Build your preferred phase breakdown below, then click "Save as Template".</p>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={handleOpenSaveCurrentAsTemplate}
                              disabled={draftSubSteps.length === 0}
                              className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-[10px] font-bold rounded-lg cursor-pointer transition disabled:opacity-40"
                            >
                              Save Current Phases
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenCreateBlankTemplate}
                              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-[10px] font-bold rounded-lg cursor-pointer transition"
                            >
                              Create Blank Template
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {customTemplates.map((tmpl) => {
                            const stepCount = tmpl.steps?.length || 0;
                            const durationSum = tmpl.steps?.reduce((a, b) => a + (Number(b.durationMinutes) || 0), 0) || 0;
                            return (
                              <div
                                key={tmpl.id}
                                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-400/40 rounded-xl flex items-center justify-between gap-1.5 transition group"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleApplyCustomTemplate(tmpl)}
                                  className="flex-1 text-left min-w-0 cursor-pointer"
                                  title={`Apply "${tmpl.name}" (${durationSum}m)`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm shrink-0">{tmpl.icon || "🎯"}</span>
                                    <p className="text-[11px] font-bold text-white group-hover:text-indigo-200 truncate">
                                      {tmpl.name}
                                    </p>
                                  </div>
                                  <p className="text-[9px] text-slate-400 truncate pl-5">
                                    {stepCount} phases • {durationSum}m total
                                  </p>
                                </button>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTemplate(tmpl)}
                                    className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-md transition cursor-pointer"
                                    title="Edit template"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)}
                                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-md transition cursor-pointer"
                                    title="Delete template"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Custom Phase Rows List (Draggable to reorder) */}
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {draftSubSteps.map((step, idx) => {
                    const isSelfTestStepRow = isKnowledgeTesterStep(step);
                    const isActiveDraftStep = isStepActive(step);
                    const isDraggingDraft = draggedDraftIdx === idx;
                    const isDropTargetDraft = dragOverDraftIdx === idx && draggedDraftIdx !== null && draggedDraftIdx !== idx;
                    return (
                      <div
                        key={step.id || idx}
                        draggable
                        onDragStart={(e) => {
                          setDraggedDraftIdx(idx);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(idx));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dragOverDraftIdx !== idx) {
                            setDragOverDraftIdx(idx);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedDraftIdx !== null && draggedDraftIdx !== idx) {
                            handleDraftReorderPhase(draggedDraftIdx, idx);
                          }
                          setDraggedDraftIdx(null);
                          setDragOverDraftIdx(null);
                        }}
                        onDragEnd={() => {
                          setDraggedDraftIdx(null);
                          setDragOverDraftIdx(null);
                        }}
                        className={`p-2 rounded-xl border space-y-1.5 transition ${
                          !isActiveDraftStep
                            ? "bg-slate-900/45 border-dashed border-white/10 opacity-60"
                            : isSelfTestStepRow
                            ? "bg-violet-950/30 border-violet-500/40"
                            : "bg-black/40 border-white/10"
                        } ${isDraggingDraft ? "opacity-40 scale-[0.99]" : ""} ${
                          isDropTargetDraft ? "ring-2 ring-indigo-400/80 border-indigo-400 bg-indigo-950/35" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                          <span
                            className="p-0.5 text-slate-500 hover:text-indigo-300 cursor-grab active:cursor-grabbing shrink-0"
                            title="Drag to reorder phase"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>
                          <div className="flex flex-col items-center justify-center shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleDraftMovePhase(idx, -1)}
                              className="text-slate-500 hover:text-slate-200 disabled:opacity-20 cursor-pointer p-0.5"
                              title="Move Phase Up"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <span className="text-[10px] font-mono font-bold text-indigo-300">{idx + 1}</span>
                            <button
                              type="button"
                              disabled={idx === draftSubSteps.length - 1}
                              onClick={() => handleDraftMovePhase(idx, 1)}
                              className="text-slate-500 hover:text-slate-200 disabled:opacity-20 cursor-pointer p-0.5"
                              title="Move Phase Down"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const nextType: GoalStepType = isSelfTestStepRow ? "study" : "self_test";
                              setDraftSubSteps(draftSubSteps.map((s, i) => i === idx ? { ...s, stepType: nextType, enabled: true } : s));
                            }}
                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition cursor-pointer shrink-0 flex items-center gap-1 ${
                              isSelfTestStepRow
                                ? "bg-violet-600/35 text-violet-200 border-violet-400/50"
                                : "bg-white/5 text-slate-400 hover:text-violet-300 border-white/10"
                            }`}
                            title="Switch between Study phase and Knowledge Tester phase"
                          >
                            <ClipboardCheck className="w-3 h-3" />
                            <span>{isSelfTestStepRow ? "Tester" : "Study"}</span>
                          </button>

                          {isSelfTestStepRow && (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isActiveDraftStep}
                              onClick={() => {
                                setDraftSubSteps(draftSubSteps.map((s, i) => i === idx ? { ...s, enabled: !isActiveDraftStep } : s));
                              }}
                              className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border text-[9px] font-bold transition cursor-pointer shrink-0 ${
                                isActiveDraftStep
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : "bg-slate-800 text-slate-400 border-white/10 hover:text-white"
                              }`}
                              title={isActiveDraftStep ? "Active — click to inactivate" : "Inactive — click to activate"}
                            >
                              <span className={`relative inline-flex h-3 w-5 shrink-0 rounded-full transition-colors ${
                                isActiveDraftStep ? "bg-emerald-500" : "bg-slate-600"
                              }`}>
                                <span className={`inline-block h-2 w-2 mt-0.5 rounded-full bg-white shadow transition-transform ${
                                  isActiveDraftStep ? "translate-x-2.5" : "translate-x-0.5"
                                }`} />
                              </span>
                              <span>{isActiveDraftStep ? "On" : "Off"}</span>
                            </button>
                          )}

                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={step.title}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraftSubSteps(draftSubSteps.map((s, i) => i === idx ? { ...s, title: val } : s));
                              }}
                              placeholder={isSelfTestStepRow ? "Knowledge Tester Title" : `Phase ${idx + 1} Title`}
                              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 font-medium"
                            />
                          </div>

                          {/* Duration Controls */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Number(step.durationMinutes) || 10;
                                const next = Math.max(1, cur - 5);
                                setDraftSubSteps(draftSubSteps.map((s, i) => i === idx ? { ...s, durationMinutes: next } : s));
                              }}
                              className="w-6 h-6 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer transition border border-white/5"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max="300"
                              value={step.durationMinutes}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                setDraftSubSteps(draftSubSteps.map((s, i) => i === idx ? { ...s, durationMinutes: val } : s));
                              }}
                              className="w-11 text-xs bg-white/5 border border-white/10 rounded-lg px-1 py-1 text-white text-center font-mono font-bold focus:outline-none focus:border-indigo-400"
                            />
                            <span className="text-[10px] font-mono text-slate-400">m</span>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Number(step.durationMinutes) || 10;
                                const next = Math.min(300, cur + 5);
                                setDraftSubSteps(draftSubSteps.map((s, i) => i === idx ? { ...s, durationMinutes: next } : s));
                              }}
                              className="w-6 h-6 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer transition border border-white/5"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDraftRemovePhase(idx)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                            title="Delete Phase"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {isSelfTestStepRow && (
                          <div className="pl-7 flex items-center gap-2 text-[10px]">
                            <Link2 className="w-3 h-3 text-cyan-400 shrink-0" />
                            <select
                              value={step.assignedLinkNoteId || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const picked = goalLinkOptions.find(l => l.id === val);
                                setDraftSubSteps(draftSubSteps.map((s, i) =>
                                  i === idx
                                    ? {
                                        ...s,
                                        assignedLinkNoteId: picked?.id,
                                        assignedLinkUrl: picked?.url,
                                        assignedLinkTitle: picked?.title
                                      }
                                    : s
                                ));
                              }}
                              className="flex-1 px-2 py-1 rounded-md bg-slate-950 border border-violet-500/30 text-slate-200 focus:outline-none focus:border-cyan-400"
                            >
                              <option value="">Auto: prompt any pending login-required links + MCQs</option>
                              {goalLinkOptions.map(l => (
                                <option key={l.id} value={l.id}>
                                  {l.requiresLogin ? "🔒 " : "🔗 "}Review: {l.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Phase & Duration Balance Summary */}
                <div className="space-y-2 pt-1.5 border-t border-white/10">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleDraftAddPhase}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-emerald-400" />
                        <span>+ Add Phase</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDraftAddSelfTestPhase}
                        className="px-2.5 py-1 bg-violet-600/25 hover:bg-violet-600/45 border border-violet-400/40 text-violet-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <ClipboardCheck className="w-3 h-3 text-violet-300" />
                        <span>+ Knowledge Tester</span>
                      </button>
                    </div>

                    {/* Phase Sum vs Timer Target Calculation */}
                    {(() => {
                      const draftSum = draftSubSteps.reduce(
                        (acc, s) => acc + (isStepActive(s) ? (Number(s.durationMinutes) || 0) : 0),
                        0
                      );
                      const timerMins = timerState ? Math.round(timerState.totalSec / 60) : 60;
                      const diff = draftSum - timerMins;

                      return (
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className={`font-bold ${diff === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                            Active: {draftSum}m / Target: {timerMins}m
                          </span>
                          {diff !== 0 && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={handleAutoScaleToTimer}
                                className="px-1.5 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-md text-[9px] font-bold cursor-pointer transition"
                                title={`Scale active phases proportionally to fit ${timerMins}m`}
                              >
                                Fit {timerMins}m
                              </button>
                              <button
                                type="button"
                                onClick={handleSyncTimerToPhases}
                                className="px-1.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-md text-[9px] font-bold cursor-pointer transition"
                                title={`Adjust timer to equal ${draftSum}m`}
                              >
                                Set Timer {draftSum}m
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Main Save / Apply / Clear Controls */}
                  <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleClearSubSteps}
                        className="px-2 py-1 text-rose-400/80 hover:text-rose-300 text-[10px] font-bold cursor-pointer hover:bg-rose-500/10 rounded-md transition"
                      >
                        Clear Phases
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenSaveCurrentAsTemplate}
                        disabled={draftSubSteps.length === 0}
                        className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-bold cursor-pointer transition flex items-center gap-1 disabled:opacity-40"
                        title="Save current breakdown as a reusable template"
                      >
                        <BookmarkPlus className="w-3 h-3" />
                        <span>Save as Template</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowCustomBreakdownBuilder(false)}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl border border-white/10 cursor-pointer transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyCustomBreakdown}
                        className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer transition flex items-center gap-1.5 active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Apply Breakdown</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* If no sub-steps exist and builder is closed, show quick helper bar with BOTH Custom & AI breakdown buttons */}
        {subStepsWithOffsets.length === 0 && !showCustomBreakdownBuilder && (
          <div className="mb-4 p-2.5 bg-[#0a0c16] border border-white/5 rounded-2xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-[11px] text-slate-300 font-medium">
                {timerState?.subSteps && timerState.subSteps.some(s => !isStepActive(s))
                  ? `${timerState.subSteps.filter(s => !isStepActive(s)).length} inactive step(s) paused — edit phases to activate`
                  : "Break session into study phases?"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleOpenCustomBreakdown}
                className="px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                title="Create custom breakdown phases"
              >
                <Plus className="w-3 h-3 text-cyan-400" />
                <span>+ Custom</span>
              </button>
              <button
                type="button"
                onClick={handleGenerateAiSubSteps}
                disabled={isGeneratingAiSteps}
                className="px-2.5 py-1 bg-indigo-600/25 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isGeneratingAiSteps ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Structuring...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3 h-3 text-indigo-400" />
                    <span>AI Breakdown</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Circular Countdown Ring */}
        <div className="relative flex flex-col items-center justify-center my-3 sm:my-5">
          <svg className="w-52 h-52 sm:w-60 sm:h-60 transform -rotate-90">
            {/* Background track circle */}
            <circle
              cx="104"
              cy="104"
              r="85"
              stroke="currentColor"
              strokeWidth="10"
              className="text-white/5 sm:hidden"
              fill="transparent"
            />
            <circle
              cx="120"
              cy="120"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              className="text-white/5 hidden sm:block"
              fill="transparent"
            />
            {/* Progress filled circle */}
            <circle
              cx="120"
              cy="120"
              r={radius}
              stroke={timerState.isCompleted ? "#fbbf24" : timerState.color}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-linear hidden sm:block"
            />
            <circle
              cx="104"
              cy="104"
              r="85"
              stroke={timerState.isCompleted ? "#fbbf24" : timerState.color}
              strokeWidth="10"
              strokeDasharray={2 * Math.PI * 85}
              strokeDashoffset={2 * Math.PI * 85 - (progressPercent / 100) * (2 * Math.PI * 85)}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-linear sm:hidden"
            />
          </svg>

          {/* Center Digital Clock Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={`text-3xl sm:text-4xl font-black font-mono tracking-tight drop-shadow-xs ${timerState.isCompleted ? "text-amber-500 dark:text-amber-300 animate-pulse" : "text-slate-950 dark:text-white"}`}>
              {formatTime(timerState.timeRemaining)}
            </span>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center gap-1.5 flex-wrap justify-center">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                <span>Target: {Math.round(timerState.totalSec / 60)}m</span>
              </span>
              {timeSpentSec > 0 && (
                <>
                  <span className="text-slate-400 dark:text-slate-600">•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{timeSpentMins}m studied</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick Time Adjustment Buttons */}
        <div className="bg-slate-50 dark:bg-[#0c0d16] border border-slate-200 dark:border-white/10 rounded-2xl p-2.5 mb-3 sm:mb-4">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-1.5">
            <span className="flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Adjust Time On The Fly
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="timer_lazy_5min_jumpstart_btn"
                onClick={() => {
                  const targetSec = 5 * 60;
                  const deltaMins = Math.round((targetSec - timerState.timeRemaining) / 60);
                  handleAdjustMinutes(deltaMins);
                }}
                className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition flex items-center gap-1 cursor-pointer active:scale-95"
                title="5-Minute Rule: Just commit to 5 mins. You have full permission to stop after 5 mins with zero guilt!"
              >
                <Zap className="w-3 h-3 fill-current text-amber-400" />
                <span>5-Min Lazy Start</span>
              </button>
              <span className="font-mono text-indigo-300">
                {timerState.timeRemaining > 0 ? `${remainingMins}m left` : "0m"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => handleAdjustMinutes(-15)}
              className="py-1.5 px-0.5 sm:px-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-[10px] sm:text-xs font-bold font-mono transition flex items-center justify-center gap-0.5 cursor-pointer"
              title="Reduce by 15 mins"
            >
              <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-rose-400 shrink-0" /> 15m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(-5)}
              className="py-1.5 px-0.5 sm:px-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-[10px] sm:text-xs font-bold font-mono transition flex items-center justify-center gap-0.5 cursor-pointer"
              title="Reduce by 5 mins"
            >
              <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-rose-400 shrink-0" /> 5m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(-1)}
              className="py-1.5 px-0.5 sm:px-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-[10px] sm:text-xs font-bold font-mono transition flex items-center justify-center gap-0.5 cursor-pointer"
              title="Reduce by 1 min"
            >
              <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-rose-400 shrink-0" /> 1m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(1)}
              className="py-1.5 px-0.5 sm:px-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-[10px] sm:text-xs font-bold font-mono transition flex items-center justify-center gap-0.5 cursor-pointer"
              title="Add 1 min"
            >
              <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400 shrink-0" /> 1m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(5)}
              className="py-1.5 px-0.5 sm:px-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-[10px] sm:text-xs font-bold font-mono transition flex items-center justify-center gap-0.5 cursor-pointer"
              title="Add 5 mins"
            >
              <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400 shrink-0" /> 5m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(15)}
              className="py-1.5 px-0.5 sm:px-1 bg-indigo-500/25 hover:bg-indigo-500/40 border border-indigo-400/40 text-indigo-200 hover:text-white rounded-xl text-[10px] sm:text-xs font-extrabold font-mono transition flex items-center justify-center gap-0.5 cursor-pointer shadow-sm shadow-indigo-500/20 ring-1 ring-indigo-400/30"
              title="Add 15 mins (Quick Extend)"
            >
              <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-300 shrink-0" /> 15m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(30)}
              className="py-1.5 px-0.5 sm:px-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-[10px] sm:text-xs font-bold font-mono transition flex items-center justify-center gap-0.5 cursor-pointer"
              title="Add 30 mins"
            >
              <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400 shrink-0" /> 30m
            </button>
          </div>
        </div>

        {/* Control Action Buttons */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            {!timerState.isRunning ? (
              <button
                type="button"
                id="timer_start_btn"
                onClick={handleStart}
                className="py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{timerState.isCompleted ? "Restart Timer" : isPartialSession ? `Resume (${remainingMins}m left)` : "Start Session"}</span>
              </button>
            ) : (
              <button
                type="button"
                id="timer_pause_btn"
                onClick={handlePause}
                className="py-3 px-4 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Pause className="w-5 h-5 fill-current" />
                <span>Pause</span>
              </button>
            )}

            <button
              type="button"
              id="timer_reset_btn"
              onClick={handleReset}
              className="py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              title={`Reset session to full ${Math.round(timerState.totalSec / 60)} minutes`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset to {Math.round(timerState.totalSec / 60)}m</span>
            </button>
          </div>

          {/* Goal Step Carryover Note (Scoped strictly to Goal Steps) */}
          {subStepsWithOffsets.length > 0 && (() => {
            const effectiveTargetStepId =
              (bottomNoteTargetStepId && subStepsWithOffsets.some(s => s.id === bottomNoteTargetStepId)
                ? bottomNoteTargetStepId
                : activeStepInfo?.id || subStepsWithOffsets[0]?.id) || "";
            const targetStepObj = subStepsWithOffsets.find(s => s.id === effectiveTargetStepId);

            return (
              <div className="bg-[#0c0d16] border border-white/10 rounded-2xl p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-[10px] font-bold text-amber-300/90 uppercase tracking-wider flex items-center gap-1">
                    <StickyNote className="w-3 h-3 text-amber-400" />
                    <span>Goal Step Carryover Note:</span>
                  </label>

                  <select
                    value={effectiveTargetStepId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setBottomNoteTargetStepId(nextId);
                      const found = subStepsWithOffsets.find(s => s.id === nextId);
                      updateTimerState((prev) => prev ? { ...prev, sessionTakeawayNote: found?.carryoverNote || "" } : null);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 border border-white/15 text-amber-200 focus:outline-none focus:border-amber-400 max-w-[190px] truncate"
                    title="Choose which goal step to attach a note to"
                  >
                    {subStepsWithOffsets.map((st, idx) => (
                      <option key={st.id} value={st.id} className="bg-[#0f111a] text-white">
                        Step {idx + 1}: {st.title}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={timerState.sessionTakeawayNote}
                  onChange={(e) => {
                    const text = e.target.value;
                    updateTimerState((prev) => prev ? { ...prev, sessionTakeawayNote: text } : null);
                  }}
                  placeholder={`Note for "${targetStepObj?.title || "selected step"}"...`}
                  rows={2}
                  className="w-full text-xs p-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-400 focus:bg-white/10 transition placeholder:text-slate-500"
                />

                <div className="flex items-center justify-between gap-2">
                  {bottomStepSavedToast ? (
                    <span className="text-[10px] text-emerald-400 font-semibold">{bottomStepSavedToast}</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Saves directly to selected goal step</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!targetStepObj) return;
                      handleSaveModalStepNote(targetStepObj.id, targetStepObj.title, timerState.sessionTakeawayNote);
                      setBottomStepSavedToast("Saved to step!");
                      setTimeout(() => setBottomStepSavedToast(null), 2500);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
                  >
                    <Save className="w-3 h-3" />
                    <span>Save to Step</span>
                  </button>
                </div>
              </div>
            );
          })()}

          <button
            type="button"
            id="timer_complete_session_btn"
            onClick={handleFinishAndComplete}
            className={`w-full py-3 px-4 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
              timerState.isCompleted 
                ? "bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-extrabold shadow-amber-500/30" 
                : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20"
            }`}
          >
            <CheckCircle2 className={`w-5 h-5 ${timerState.isCompleted ? "text-black" : "text-indigo-200"}`} />
            <span>Finish & Log Progress</span>
          </button>
        </div>
      </div>

      {/* Embedded Knowledge Hub & Tester Modal while studying */}
      {showKnowledgeHubModal && activeGoal && (
        <GoalKnowledgeHubModal
          goal={activeGoal}
          isOpen={showKnowledgeHubModal}
          initialTab={knowledgeHubInitialTab}
          initialNoteId={knowledgeHubInitialNoteId}
          onClose={() => {
            setShowKnowledgeHubModal(false);
            setKnowledgeHubInitialNoteId(null);
          }}
          onUpdateKnowledgeHub={(goalId, updatedHub) => {
            if (onUpdateGoalKnowledgeHub) {
              onUpdateGoalKnowledgeHub(goalId, updatedHub);
            }
            try {
              const raw = localStorage.getItem("cached_goals");
              if (raw) {
                const cached: Goal[] = JSON.parse(raw);
                const next = cached.map(g => g.id === goalId ? { ...g, knowledgeHub: updatedHub } : g);
                localStorage.setItem("cached_goals", JSON.stringify(next));
              }
            } catch {}
          }}
        />
      )}

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
}
