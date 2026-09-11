import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Minus, 
  CheckCircle2, 
  X, 
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
  Pencil,
  Trash2,
  ArrowRight,
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
  Info
} from "lucide-react";
import { SessionSubStep, CustomSessionTemplate } from "../types";

export interface ActiveTimerData {
  title: string;
  totalSec: number;
  timeRemaining: number;
  targetEndTime: number | null; // Wall-clock timestamp in ms
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
}

export type SoundType = "tibetan_bell" | "crystal_chime" | "zen_bowl" | "alert_bell";

const STORAGE_KEY = "active_focus_timer_v2";
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
        subSteps: data.subSteps
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
}) {
  unlockAudioEngine();
  window.dispatchEvent(new CustomEvent("open_focus_timer", { detail: params }));
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
  onCompleteSession: (eventId?: string, goalId?: string, note?: string) => void;
  onExtendEventDuration?: (eventId: string, deltaMins: number) => void;
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
  onCompleteSession,
  onExtendEventDuration
}: FocusTimerModalProps) {
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

  const [showAudioSettings, setShowAudioSettings] = useState<boolean>(false);
  const [showSubStepsEditor, setShowSubStepsEditor] = useState<boolean>(false);
  const [showCustomBreakdownBuilder, setShowCustomBreakdownBuilder] = useState<boolean>(false);
  const [draftSubSteps, setDraftSubSteps] = useState<SessionSubStep[]>([]);
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

  const onCompleteRef = useRef(onCompleteSession);
  onCompleteRef.current = onCompleteSession;

  const onExtendRef = useRef(onExtendEventDuration);
  onExtendRef.current = onExtendEventDuration;

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
          subSteps: saved.subSteps || propSubSteps
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
          subSteps: propSubSteps
        };
        setTimerState(newTimer);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newTimer));
      }
    }
  }, [propIsOpen, propSessionTitle, propInitialDurationMinutes, propEventId, propGoalId, propCategory, propColor, propPreviousSessionNote, propSubSteps]);

  // Global custom event listener
  useEffect(() => {
    const handleOpenTimerEvent = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      unlockAudioEngine();

      setTimerState((prev) => {
        const matchesCurrent = prev && (
          (detail.goalId && prev.goalId === detail.goalId) ||
          (detail.eventId && prev.eventId === detail.eventId) ||
          (detail.title && prev.title?.toLowerCase() === detail.title?.toLowerCase())
        );

        if (matchesCurrent && prev && prev.timeRemaining < prev.totalSec && !prev.isCompleted) {
          const updated = {
            ...prev,
            isOpen: true,
            isMinimized: false,
            previousSessionNote: detail.previousSessionNote !== undefined ? detail.previousSessionNote : prev.previousSessionNote,
            subSteps: detail.subSteps || prev.subSteps
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        }

        const saved = getSavedProgress(detail.goalId, detail.eventId, detail.title);
        const initialSec = Math.max(1, detail.duration || 60) * 60;

        if (saved && saved.timeRemaining > 0 && saved.timeRemaining < saved.totalSec) {
          const restoredTimer: ActiveTimerData = {
            title: saved.title || detail.title || "Focus Session",
            totalSec: saved.totalSec,
            timeRemaining: saved.timeRemaining,
            targetEndTime: null,
            isRunning: false,
            isCompleted: false,
            eventId: saved.eventId || detail.eventId,
            goalId: saved.goalId || detail.goalId,
            category: saved.category || detail.category,
            color: saved.color || detail.color || "#6366f1",
            previousSessionNote: detail.previousSessionNote !== undefined ? detail.previousSessionNote : saved.previousSessionNote,
            sessionTakeawayNote: saved.sessionTakeawayNote || "",
            isMinimized: false,
            isOpen: true,
            subSteps: saved.subSteps || detail.subSteps
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredTimer));
          return restoredTimer;
        }

        const newTimer: ActiveTimerData = {
          title: detail.title || "Focus Session",
          totalSec: initialSec,
          timeRemaining: initialSec,
          targetEndTime: null,
          isRunning: false,
          isCompleted: false,
          eventId: detail.eventId,
          goalId: detail.goalId,
          category: detail.category,
          color: detail.color || "#6366f1",
          previousSessionNote: detail.previousSessionNote,
          sessionTakeawayNote: "",
          isMinimized: false,
          isOpen: true,
          subSteps: detail.subSteps
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newTimer));
        return newTimer;
      });
    };

    window.addEventListener("open_focus_timer" as any, handleOpenTimerEvent);
    return () => {
      window.removeEventListener("open_focus_timer" as any, handleOpenTimerEvent);
    };
  }, []);

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

  // Sub-step calculations with cumulative offsets
  const subStepsWithOffsets = useMemo(() => {
    const steps = timerState?.subSteps;
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

  useEffect(() => {
    if (!activeStepInfo || !timerState?.isRunning) return;

    if (activeStepInfo.index > previousStepIndexRef.current) {
      // Step advanced during active session!
      if (soundEnabled) {
        playBellSound("crystal_chime", soundVolume);
      }
      setPhaseTransitionNotice({
        phaseTitle: activeStepInfo.title,
        phaseNum: activeStepInfo.index + 1,
        totalPhases: subStepsWithOffsets.length,
        durationMins: activeStepInfo.durationMinutes
      });
      previousStepIndexRef.current = activeStepInfo.index;

      const timer = setTimeout(() => {
        setPhaseTransitionNotice(null);
      }, 5000);
      return () => clearTimeout(timer);
    } else if (activeStepInfo.index < previousStepIndexRef.current) {
      previousStepIndexRef.current = activeStepInfo.index;
    }
  }, [activeStepInfo?.index, timerState?.isRunning, soundEnabled, soundVolume, subStepsWithOffsets.length]);

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
          finishedTitle = prev.title;

          const completedState: ActiveTimerData = {
            ...prev,
            timeRemaining: 0,
            isRunning: false,
            isCompleted: true,
            isOpen: true,
            isMinimized: false
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
        if (onCompleteRef.current) {
          onCompleteRef.current(completedEventId, completedGoalId, completedNote);
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
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timerState?.isRunning, soundEnabled, soundChoice, soundVolume, repeatSound]);

  if (!timerState) return null;

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
    if (timerState.eventId && onExtendRef.current) {
      onExtendRef.current(timerState.eventId, deltaMins);
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
    updateTimerState((prev) => {
      if (!prev) return null;
      let remaining = prev.timeRemaining;
      if (remaining <= 0) {
        remaining = prev.totalSec;
      }
      return {
        ...prev,
        timeRemaining: remaining,
        targetEndTime: Date.now() + remaining * 1000,
        isRunning: true,
        isCompleted: false
      };
    });
  };

  const handlePause = () => {
    unlockAudioEngine();
    updateTimerState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        isRunning: false,
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

    if (timerState.sessionTakeawayNote.trim()) {
      onCompleteRef.current(timerState.eventId, timerState.goalId, timerState.sessionTakeawayNote.trim());
    }
    clearSavedProgress(timerState.goalId, timerState.eventId, timerState.title);
    updateTimerState(() => null);
    if (propOnClose) propOnClose();
  };

  const handleFinishAndComplete = () => {
    unlockAudioEngine();
    triggerCompletionBell(timerState.title);
    onCompleteRef.current(timerState.eventId, timerState.goalId, timerState.sessionTakeawayNote.trim() || undefined);
    clearSavedProgress(timerState.goalId, timerState.eventId, timerState.title);
    try {
      window.dispatchEvent(new CustomEvent("focus_session_completed", {
        detail: {
          eventId: timerState.eventId,
          goalId: timerState.goalId,
          title: timerState.title,
          note: timerState.sessionTakeawayNote.trim() || undefined
        }
      }));
    } catch {}
    updateTimerState(() => null);
    if (propOnClose) propOnClose();
  };

  // Jump to specific sub-step
  const handleJumpToSubStep = (stepIndex: number) => {
    if (!subStepsWithOffsets[stepIndex]) return;
    const targetStep = subStepsWithOffsets[stepIndex];
    unlockAudioEngine();

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
    if (soundEnabled) {
      playBellSound("crystal_chime", soundVolume);
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

      if (res.ok) {
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
      description: s.description || ""
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
        durationMinutes: 15
      }
    ]);
  };

  const handleDraftRemovePhase = (index: number) => {
    setDraftSubSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDraftMovePhase = (index: number, direction: -1 | 1) => {
    setDraftSubSteps((prev) => {
      const nextIdx = index + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[nextIdx];
      copy[nextIdx] = temp;
      return copy;
    });
  };

  const handleAutoScaleToTimer = () => {
    if (!timerState || draftSubSteps.length === 0) return;
    const targetMins = Math.max(5, Math.round(timerState.totalSec / 60));
    const currentSum = draftSubSteps.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
    if (currentSum <= 0) return;

    let allocated = 0;
    const scaled = draftSubSteps.map((step, idx) => {
      if (idx === draftSubSteps.length - 1) {
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
    const sumMins = draftSubSteps.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
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

  // Render Floating Mini-Timer Bar when minimized OR when modal closed with active/saved progress
  if (timerState.isMinimized || (!timerState.isOpen && (timerState.isRunning || isPartialSession || timerState.isCompleted))) {
    return (
      <div 
        id="floating_focus_timer_bar"
        className={`fixed bottom-16 sm:bottom-6 right-4 sm:right-6 z-50 bg-[#0f111a]/95 border rounded-2xl p-3 shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-fade-in ${
          timerState.isCompleted 
            ? "border-amber-400/80 ring-2 ring-amber-400/50 shadow-amber-500/20 animate-pulse" 
            : "border-indigo-500/40 ring-1 ring-indigo-500/20"
        }`}
      >
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleExpand}>
          <span className="relative flex h-3 w-3">
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
            <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 truncate font-mono">
              {timerState.isCompleted 
                ? "🔔 Time is Up!" 
                : activeStepInfo 
                ? `Phase ${activeStepInfo.index + 1}/${subStepsWithOffsets.length}: ${activeStepInfo.title}`
                : isPartialSession && !timerState.isRunning 
                ? `Paused (${timeSpentMins}m done)` 
                : timerState.category || "Focus Session"}
            </p>
            <h4 className="text-xs font-bold text-white truncate drop-shadow-xs">
              {timerState.title}
            </h4>
          </div>
        </div>

        {/* Live Clock Display */}
        <div 
          onClick={handleExpand}
          className={`px-2.5 py-1 rounded-xl font-mono text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer shadow-inner border ${
            timerState.isCompleted 
              ? "bg-amber-500/20 border-amber-400/50 text-amber-300" 
              : "bg-black/60 border-white/10 text-white"
          }`}
        >
          <Clock className={`w-3.5 h-3.5 shrink-0 ${timerState.isRunning ? "text-emerald-400" : timerState.isCompleted ? "text-amber-300" : isPartialSession ? "text-amber-400" : "text-indigo-400"}`} />
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
              className="p-1.5 bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 rounded-lg border border-amber-400/40 cursor-pointer transition"
              title="Play completion bell chime"
            >
              <Bell className="w-3.5 h-3.5 animate-bounce" />
            </button>
          ) : timerState.isRunning ? (
            <button
              type="button"
              onClick={handlePause}
              className="p-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg border border-amber-500/30 cursor-pointer transition"
              title="Pause Timer"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg border border-emerald-500/30 cursor-pointer transition"
              title={isPartialSession ? `Resume (${remainingMins}m left)` : "Start Timer"}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
          )}

          <button
            type="button"
            onClick={() => handleAdjustMinutes(15)}
            className="px-1.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 text-[10px] font-bold rounded-lg border border-indigo-400/30 cursor-pointer transition font-mono"
            title="Extend by 15 mins"
          >
            +15m
          </button>

          <button
            type="button"
            onClick={handleExpand}
            className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/10 cursor-pointer transition"
            title="Expand Full Timer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleFinishAndComplete}
            className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer transition"
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
    <div id="focus_timer_modal_backdrop" className="fixed inset-0 bg-[#020205]/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div id="focus_timer_modal_card" className="bg-[#0f111a] border border-white/12 rounded-3xl shadow-2xl w-full max-w-md p-5 sm:p-6 relative overflow-hidden max-h-[95vh] overflow-y-auto">
        {/* Glow accent matching color */}
        <div 
          className="absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: timerState.color }}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between relative z-10 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-slate-300 font-mono">
                {timerState.category || "Focus Session"}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                timerState.isCompleted
                  ? "bg-amber-500/25 text-amber-300 border border-amber-400/50 animate-pulse"
                  : timerState.isRunning 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse" 
                  : isPartialSession
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : timerState.timeRemaining === timerState.totalSec
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : "bg-slate-800 text-slate-400"
              }`}>
                {timerState.isCompleted ? (
                  <>
                    <BellRing className="w-3 h-3 text-amber-300 animate-bounce" />
                    TIME IS UP!
                  </>
                ) : timerState.isRunning ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    IN PROGRESS
                  </>
                ) : isPartialSession ? (
                  <>
                    <Pause className="w-3 h-3 text-amber-300 fill-current" />
                    PAUSED ({timeSpentMins}m studied)
                  </>
                ) : timerState.timeRemaining === timerState.totalSec ? (
                  <>
                    <Clock className="w-3 h-3 text-indigo-400" />
                    READY TO START
                  </>
                ) : (
                  "PAUSED"
                )}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white leading-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: timerState.color }} />
              <span className="truncate max-w-[200px] sm:max-w-[240px]">{timerState.title}</span>
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Audio Settings Toggle Button */}
            <button
              type="button"
              onClick={() => setShowAudioSettings(!showAudioSettings)}
              className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 ${
                showAudioSettings 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" 
                  : soundEnabled 
                  ? "bg-white/10 hover:bg-white/20 text-indigo-300" 
                  : "bg-rose-500/15 text-rose-400 hover:bg-rose-500/25"
              }`}
              title="Bell Chime Sound Settings"
            >
              {soundEnabled ? <BellRing className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleMinimize}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              title="Minimize to bottom bar"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              title="Close Modal (saves in-progress time)"
            >
              <X className="w-5 h-5" />
            </button>
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
          <div className="mb-3 p-3 bg-amber-500/20 border border-amber-400/60 rounded-2xl text-amber-200 flex items-center justify-between animate-fade-in shadow-lg shadow-amber-500/10">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-500/30 rounded-xl text-amber-300">
                <BellRing className="w-5 h-5 animate-bounce" />
              </span>
              <div>
                <h4 className="font-extrabold text-white text-sm">Session Complete!</h4>
                <p className="text-xs text-amber-300/90 font-medium">Your scheduled focus timer has finished.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                unlockAudioEngine();
                playBellSound(soundChoice, soundVolume);
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition flex items-center gap-1.5 active:scale-95"
            >
              <Bell className="w-3.5 h-3.5 fill-current" />
              <span>Ring Bell</span>
            </button>
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
            <div className="bg-indigo-950/40 border border-indigo-500/25 p-2.5 rounded-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-1.5 bg-indigo-600/30 border border-indigo-400/40 rounded-lg text-indigo-300 shrink-0">
                  <Flame className="w-4 h-4 text-amber-400" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/20 px-1.5 py-0.2 rounded font-mono">
                      Phase {activeStepInfo.index + 1}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {formatTime(activeStepInfo.stepRemainingSec)} left in phase
                    </span>
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

              {/* Next Step / Complete Step Button */}
              <button
                type="button"
                onClick={handleCompleteCurrentSubStep}
                className="px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-400/40 text-indigo-200 hover:text-white rounded-xl text-[11px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
                title={activeStepInfo.isLastStep ? "Finish Session" : "Mark phase complete & advance to next phase"}
              >
                <span>{activeStepInfo.isLastStep ? "Finish" : "Next Phase"}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expandable Full Steps List */}
            {showSubStepsEditor && (
              <div className="space-y-1 pt-1 border-t border-white/10 max-h-36 overflow-y-auto pr-1">
                {subStepsWithOffsets.map((step) => {
                  const isDone = timeSpentSec >= step.endSec;
                  const isCurr = timeSpentSec >= step.startSec && timeSpentSec < step.endSec;

                  return (
                    <div 
                      key={step.id} 
                      onClick={() => handleJumpToSubStep(step.index)}
                      className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition ${
                        isCurr 
                          ? "bg-indigo-600/20 border-indigo-400/50 text-white font-bold ring-1 ring-indigo-400/30" 
                          : isDone 
                          ? "bg-black/30 border-white/5 text-slate-400 opacity-70" 
                          : "bg-black/20 border-white/5 text-slate-300 hover:border-white/10"
                      }`}
                    >
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
                        <div className="min-w-0 truncate">
                          <span className={`truncate ${isDone ? "line-through text-slate-500" : ""}`}>
                            {step.title}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-indigo-300 font-semibold shrink-0 bg-white/5 px-1.5 py-0.5 rounded">
                        {step.durationMinutes}m
                      </span>
                    </div>
                  );
                })}
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

                {/* Custom Phase Rows List */}
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {draftSubSteps.map((step, idx) => (
                    <div key={step.id || idx} className="p-2 bg-black/40 border border-white/10 rounded-xl flex items-center gap-2">
                      <div className="flex flex-col items-center justify-center">
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

                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={step.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftSubSteps(draftSubSteps.map((s, i) => i === idx ? { ...s, title: val } : s));
                          }}
                          placeholder={`Phase ${idx + 1} Title`}
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
                  ))}
                </div>

                {/* Add Phase & Duration Balance Summary */}
                <div className="space-y-2 pt-1.5 border-t border-white/10">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleDraftAddPhase}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-emerald-400" />
                      <span>+ Add Phase</span>
                    </button>

                    {/* Phase Sum vs Timer Target Calculation */}
                    {(() => {
                      const draftSum = draftSubSteps.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
                      const timerMins = timerState ? Math.round(timerState.totalSec / 60) : 60;
                      const diff = draftSum - timerMins;

                      return (
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className={`font-bold ${diff === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                            Phases: {draftSum}m / Target: {timerMins}m
                          </span>
                          {diff !== 0 && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={handleAutoScaleToTimer}
                                className="px-1.5 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-md text-[9px] font-bold cursor-pointer transition"
                                title={`Scale phases proportionally to fit ${timerMins}m`}
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
              <span className="text-[11px] text-slate-300 font-medium">Break session into study phases?</span>
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
            <span className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight drop-shadow-md ${timerState.isCompleted ? "text-amber-300 animate-pulse" : "text-white"}`}>
              {formatTime(timerState.timeRemaining)}
            </span>
            <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-1.5 flex-wrap justify-center">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                Target: {Math.round(timerState.totalSec / 60)}m
              </span>
              {timeSpentSec > 0 && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-emerald-400 font-bold">{timeSpentMins}m studied</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick Time Adjustment Buttons */}
        <div className="bg-[#0c0d16] border border-white/10 rounded-2xl p-2.5 mb-3 sm:mb-4">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-1.5">
            <span className="flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Adjust Time On The Fly
            </span>
            <span className="font-mono text-indigo-300">
              {timerState.timeRemaining > 0 ? `${remainingMins}m left` : "0m"}
            </span>
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

          {/* Optional Carryover Note for Next Session */}
          <div className="bg-[#0c0d16] border border-white/10 rounded-2xl p-2.5">
            <label className="block text-[10px] font-bold text-amber-300/90 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Next Session Carryover Note (Optional):
            </label>
            <textarea
              value={timerState.sessionTakeawayNote}
              onChange={(e) => {
                const text = e.target.value;
                updateTimerState((prev) => prev ? { ...prev, sessionTakeawayNote: text } : null);
              }}
              placeholder="e.g. Finished Chapter 3; resume Section 4.1 practice problems next session..."
              rows={2}
              className="w-full text-xs p-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-400 focus:bg-white/10 transition placeholder:text-slate-500"
            />
          </div>

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
    </div>
  );
}
