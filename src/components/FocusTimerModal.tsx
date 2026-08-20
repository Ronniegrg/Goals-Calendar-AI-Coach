import React, { useState, useEffect, useRef } from "react";
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
  Volume2, 
  VolumeX, 
  Minimize2, 
  Maximize2,
  BookmarkCheck
} from "lucide-react";

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
}

const STORAGE_KEY = "active_focus_timer_v2";
const PROGRESS_MAP_KEY = "saved_focus_goal_progress_map_v2";

export function getProgressKey(goalId?: string, eventId?: string, title?: string): string {
  if (goalId) return `goal_${goalId}`;
  if (eventId) return `evt_${eventId}`;
  return `title_${(title || "default").trim().toLowerCase()}`;
}

export function getSavedProgress(goalId?: string, eventId?: string, title?: string): SavedSessionProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_MAP_KEY);
    if (!raw) return null;
    const map: Record<string, SavedSessionProgress> = JSON.parse(raw);
    
    // Look up in order of priority: goalId -> eventId -> title
    const candidates = [
      goalId ? `goal_${goalId}` : null,
      eventId ? `evt_${eventId}` : null,
      title ? `title_${title.trim().toLowerCase()}` : null
    ].filter(Boolean) as string[];

    for (const key of candidates) {
      if (map[key]) {
        const item = map[key];
        // Valid if within last 48 hours and has remaining time > 0
        const isRecent = Date.now() - item.updatedAt < 48 * 60 * 60 * 1000;
        if (isRecent && item.timeRemaining > 0 && item.timeRemaining < item.totalSec) {
          return item;
        }
      }
    }
  } catch {
    // Ignore JSON errors
  }
  return null;
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
        updatedAt: Date.now()
      };
      map[key] = entry;
      if (data.goalId) map[`goal_${data.goalId}`] = entry;
      if (data.eventId) map[`evt_${data.eventId}`] = entry;
      if (data.title) map[`title_${data.title.trim().toLowerCase()}`] = entry;
    }

    localStorage.setItem(PROGRESS_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
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
  } catch {
    // Ignore errors
  }
}

export function triggerFocusTimer(params: {
  title: string;
  duration: number; // in minutes
  eventId?: string;
  goalId?: string;
  category?: string;
  color?: string;
  previousSessionNote?: string;
}) {
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
    } catch {
      // ignore JSON parse errors
    }
    return null;
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const onCompleteRef = useRef(onCompleteSession);
  onCompleteRef.current = onCompleteSession;

  const onExtendRef = useRef(onExtendEventDuration);
  onExtendRef.current = onExtendEventDuration;

  // Sync props if provided explicitly by parent
  useEffect(() => {
    if (propIsOpen && propSessionTitle && propInitialDurationMinutes) {
      // Check if saved progress exists for this goal / event / title
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
          previousSessionNote: saved.previousSessionNote || propPreviousSessionNote,
          sessionTakeawayNote: saved.sessionTakeawayNote || "",
          isMinimized: false,
          isOpen: true
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
          isOpen: true
        };
        setTimerState(newTimer);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newTimer));
      }
    }
  }, [propIsOpen, propSessionTitle, propInitialDurationMinutes, propEventId, propGoalId, propCategory, propColor, propPreviousSessionNote]);

  // Global custom event listener
  useEffect(() => {
    const handleOpenTimerEvent = (e: any) => {
      const detail = e.detail;
      if (!detail) return;

      setTimerState((prev) => {
        // If current state matches this session and has in-progress time, just open it!
        const matchesCurrent = prev && (
          (detail.goalId && prev.goalId === detail.goalId) ||
          (detail.eventId && prev.eventId === detail.eventId) ||
          (detail.title && prev.title?.toLowerCase() === detail.title?.toLowerCase())
        );

        if (matchesCurrent && prev && prev.timeRemaining < prev.totalSec && !prev.isCompleted) {
          const updated = {
            ...prev,
            isOpen: true,
            isMinimized: false
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        }

        // Check if there is saved progress for this goal / event
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
            previousSessionNote: saved.previousSessionNote || detail.previousSessionNote,
            sessionTakeawayNote: saved.sessionTakeawayNote || "",
            isMinimized: false,
            isOpen: true
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredTimer));
          return restoredTimer;
        }

        // Otherwise create brand new timer
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
          isOpen: true
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

  // Audio completion chime generator
  const playCompletionChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
        
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.8);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.8);
      });
    } catch {
      // Audio context policy fallback
    }
  };

  // Timer Tick Interval - Uses wall-clock timestamp calculations
  useEffect(() => {
    if (!timerState?.isRunning) return;

    const interval = setInterval(() => {
      let isTimerCompleted = false;
      let completedEventId: string | undefined;
      let completedGoalId: string | undefined;
      let completedNote: string | undefined;

      setTimerState((prev) => {
        if (!prev || !prev.isRunning || !prev.targetEndTime) return prev;

        const now = Date.now();
        const diffSec = Math.max(0, Math.round((prev.targetEndTime - now) / 1000));

        if (diffSec <= 0) {
          isTimerCompleted = true;
          completedEventId = prev.eventId;
          completedGoalId = prev.goalId;
          completedNote = prev.sessionTakeawayNote.trim() || undefined;

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
        playCompletionChime();
        if (onCompleteRef.current) {
          onCompleteRef.current(completedEventId, completedGoalId, completedNote);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timerState?.isRunning, soundEnabled]);

  if (!timerState) return null;

  // Time calculations
  const timeSpentSec = Math.max(0, timerState.totalSec - timerState.timeRemaining);
  const timeSpentMins = Math.floor(timeSpentSec / 60);
  const remainingMins = Math.ceil(timerState.timeRemaining / 60);
  const isPartialSession = timeSpentSec > 0 && timerState.timeRemaining > 0 && !timerState.isCompleted;

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
      // If running, minimize instead of destroying timer so user doesn't lose progress!
      handleMinimize();
      return;
    }

    // When paused with progress: save progress safely, don't destroy it!
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
    onCompleteRef.current(timerState.eventId, timerState.goalId, timerState.sessionTakeawayNote.trim() || undefined);
    playCompletionChime();
    clearSavedProgress(timerState.goalId, timerState.eventId, timerState.title);
    updateTimerState(() => null);
    if (propOnClose) propOnClose();
  };

  // Render Floating Mini-Timer Bar when minimized OR when modal closed with active/saved progress
  if (timerState.isMinimized || (!timerState.isOpen && (timerState.isRunning || isPartialSession))) {
    return (
      <div 
        id="floating_focus_timer_bar"
        className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 z-50 bg-[#0f111a]/95 border border-indigo-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-fade-in ring-1 ring-indigo-500/20"
      >
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleExpand}>
          <span className="relative flex h-3 w-3">
            {timerState.isRunning ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            ) : isPartialSession ? (
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400"></span>
            ) : null}
            <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: timerState.color }}></span>
          </span>
          <div className="min-w-0 max-w-[130px] sm:max-w-[170px]">
            <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 truncate font-mono">
              {isPartialSession && !timerState.isRunning ? `Paused (${timeSpentMins}m done)` : timerState.category || "Focus Session"}
            </p>
            <h4 className="text-xs font-bold text-white truncate drop-shadow-xs">
              {timerState.title}
            </h4>
          </div>
        </div>

        {/* Live Clock Display */}
        <div 
          onClick={handleExpand}
          className="bg-black/60 border border-white/10 px-2.5 py-1 rounded-xl font-mono text-xs sm:text-sm font-black text-white flex items-center gap-1.5 cursor-pointer shadow-inner"
        >
          <Clock className={`w-3.5 h-3.5 shrink-0 ${timerState.isRunning ? "text-emerald-400" : isPartialSession ? "text-amber-400" : "text-indigo-400"}`} />
          <span>{formatTime(timerState.timeRemaining)}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          {timerState.isRunning ? (
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
      <div id="focus_timer_modal_card" className="bg-[#0f111a] border border-white/12 rounded-3xl shadow-2xl w-full max-w-md p-6 relative overflow-hidden">
        {/* Glow accent matching color */}
        <div 
          className="absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: timerState.color }}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between relative z-10 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-slate-300 font-mono">
                {timerState.category || "Focus Session"}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                timerState.isRunning 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse" 
                  : timerState.isCompleted 
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : isPartialSession
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : timerState.timeRemaining === timerState.totalSec
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : "bg-slate-800 text-slate-400"
              }`}>
                {timerState.isRunning ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    IN PROGRESS
                  </>
                ) : timerState.isCompleted ? (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    COMPLETED!
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
            <h3 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: timerState.color }} />
              <span className="truncate max-w-[240px]">{timerState.title}</span>
            </h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer"
              title={soundEnabled ? "Mute audio notification" : "Unmute audio notification"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleMinimize}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer"
              title="Minimize to bottom bar"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer"
              title="Close Modal (saves in-progress time)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

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

        {/* Circular Countdown Ring */}
        <div className="relative flex flex-col items-center justify-center my-6">
          <svg className="w-64 h-64 transform -rotate-90">
            {/* Background track circle */}
            <circle
              cx="128"
              cy="128"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              className="text-white/5"
              fill="transparent"
            />
            {/* Progress filled circle */}
            <circle
              cx="128"
              cy="128"
              r={radius}
              stroke={timerState.color}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>

          {/* Center Digital Clock Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-4xl sm:text-5xl font-extrabold text-white font-mono tracking-tight drop-shadow-md">
              {formatTime(timerState.timeRemaining)}
            </span>
            <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-1.5">
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
        <div className="bg-[#0c0d16] border border-white/10 rounded-2xl p-3 mb-6">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-2">
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
                <span>{isPartialSession ? `Resume (${remainingMins}m left)` : "Start Session"}</span>
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
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5 text-indigo-200" />
            <span>Finish & Log Progress</span>
          </button>
        </div>
      </div>
    </div>
  );
}
