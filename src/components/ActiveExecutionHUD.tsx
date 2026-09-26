import React, { useState, useEffect, useMemo } from "react";
import { 
  Play, 
  Pause,
  CheckCircle2, 
  Clock, 
  Sparkles, 
  ListTodo, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  Check, 
  Zap, 
  Calendar,
  Maximize2,
  RotateCcw,
  Target,
  ArrowRight,
  Flame,
  AlertTriangle,
  Sliders,
  Timer,
  Trash2,
  Hourglass
} from "lucide-react";
import { CalendarEvent, Goal, SubTask, SessionSubStep } from "../types";
import { 
  triggerFocusTimer, 
  pauseFocusTimer, 
  resumeFocusTimer, 
  finishFocusTimer, 
  updateActiveTimerSubSteps,
  setActiveTimerDuration,
  getActiveTimerSnapshot, 
  ActiveTimerData 
} from "./FocusTimerModal";
import { renderGoalIcon } from "../lib/goalIcons";

interface ActiveExecutionHUDProps {
  events: CalendarEvent[];
  goals: Goal[];
  onToggleCompleteEvent: (eventId: string) => void;
  onEditEvent?: (eventId: string, updates: Partial<CalendarEvent>) => void;
  onEditGoal?: (goalId: string, updates: Partial<Goal>) => void;
  onNavigateToCalendar?: () => void;
}

function formatClockTime(dateOrMs: Date | number): string {
  const d = typeof dateOrMs === "number" ? new Date(dateOrMs) : dateOrMs;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatCountdown(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export default function ActiveExecutionHUD({
  events,
  goals,
  onToggleCompleteEvent,
  onEditEvent,
  onEditGoal,
  onNavigateToCalendar
}: ActiveExecutionHUDProps) {
  // 1. Live Active Timer State (tracks actual start, pause, finish time)
  const [activeTimer, setActiveTimer] = useState<ActiveTimerData | null>(() => getActiveTimerSnapshot());
  
  // Real-time ticking clock for exact finish and countdown computation
  const [tickerNow, setTickerNow] = useState<number>(Date.now());
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtaskMinutes, setNewSubtaskMinutes] = useState<number>(15);

  // Sync with global timer events (dispatched by FocusTimerModal on start, pause, resume, tick, finish)
  useEffect(() => {
    const handleTimerChange = (e: any) => {
      const detail = e.detail || null;
      queueMicrotask(() => {
        setActiveTimer(detail);
      });
    };

    window.addEventListener("focus_timer_state_change" as any, handleTimerChange);
    return () => {
      window.removeEventListener("focus_timer_state_change" as any, handleTimerChange);
    };
  }, []);

  // Update ticker every second when timer is running or active
  useEffect(() => {
    const interval = setInterval(() => {
      setTickerNow(Date.now());
      // Self-refresh timer snapshot in case tab was backgrounded
      const snap = getActiveTimerSnapshot();
      if (snap) {
        setActiveTimer(snap);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Find corresponding goal if active timer has goalId
  const activeGoal = useMemo(() => {
    if (!activeTimer?.goalId) return undefined;
    return goals.find(g => g.id === activeTimer.goalId);
  }, [activeTimer?.goalId, goals]);

  // If no timer running, inspect today's scheduled events to know what's ready to study
  const { currentEvent, matchedGoal, nextEvent } = useMemo(() => {
    const nowObj = new Date(tickerNow);
    const todayStr = nowObj.toDateString();
    const nowMs = tickerNow;

    const todayEvents = events
      .filter(e => new Date(e.start).toDateString() === todayStr)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Check if an event is currently slotted on the calendar
    const slotted = todayEvents.find(e => {
      if (e.completed) return false;
      const startMs = new Date(e.start).getTime();
      const endMs = new Date(e.end).getTime();
      return nowMs >= startMs && nowMs <= endMs;
    });

    if (slotted) {
      const g = slotted.goalId ? goals.find(item => item.id === slotted.goalId) : undefined;
      return { currentEvent: slotted, matchedGoal: g, nextEvent: null };
    }

    // Check upcoming today
    const upcoming = todayEvents.find(e => {
      if (e.completed) return false;
      return new Date(e.start).getTime() > nowMs;
    });

    if (upcoming) {
      const g = upcoming.goalId ? goals.find(item => item.id === upcoming.goalId) : undefined;
      return { currentEvent: upcoming, matchedGoal: g, nextEvent: upcoming };
    }

    // Fallback: uncompleted today that has passed its scheduled end
    const pendingToday = todayEvents.find(e => !e.completed);
    if (pendingToday) {
      const g = pendingToday.goalId ? goals.find(item => item.id === pendingToday.goalId) : undefined;
      return { currentEvent: pendingToday, matchedGoal: g, nextEvent: null };
    }

    return { currentEvent: null, matchedGoal: undefined, nextEvent: null };
  }, [events, goals, tickerNow]);

  // Compute total planned duration of this study session in minutes
  const totalSessionMinutes = useMemo(() => {
    if (activeTimer) {
      return Math.max(1, Math.round(activeTimer.totalSec / 60));
    }
    if (currentEvent) {
      return Math.max(15, Math.round((new Date(currentEvent.end).getTime() - new Date(currentEvent.start).getTime()) / 60000));
    }
    if (matchedGoal?.durationMinutes) {
      return matchedGoal.durationMinutes;
    }
    return 45;
  }, [activeTimer, currentEvent, matchedGoal]);

  // Subtasks logic (merging active timer subtasks, event subtasks, or goal subtasks)
  const activeSubtasks: SubTask[] = useMemo(() => {
    if (activeTimer?.subSteps && activeTimer.subSteps.length > 0) {
      return activeTimer.subSteps.map(s => ({
        id: s.id,
        title: s.title,
        durationMinutes: s.durationMinutes,
        completed: s.completed || false
      }));
    }
    if (currentEvent?.subtasks && currentEvent.subtasks.length > 0) {
      return currentEvent.subtasks;
    }
    if (matchedGoal?.subtasks && matchedGoal.subtasks.length > 0) {
      return matchedGoal.subtasks;
    }
    if (matchedGoal?.subSteps && matchedGoal.subSteps.length > 0) {
      return matchedGoal.subSteps.map(s => ({
        id: s.id,
        title: s.title,
        durationMinutes: s.durationMinutes,
        completed: s.completed || false
      }));
    }
    return [];
  }, [activeTimer, currentEvent, matchedGoal]);

  const completedSubtasksCount = activeSubtasks.filter(t => t.completed).length;

  // Time-budget calculations for micro-tasks
  const allocatedMinutes = useMemo(() => {
    return activeSubtasks.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);
  }, [activeSubtasks]);

  const unallocatedMinutes = totalSessionMinutes - allocatedMinutes;
  const isOverallocated = allocatedMinutes > totalSessionMinutes;
  const hasTimingOnSteps = activeSubtasks.some(t => typeof t.durationMinutes === "number" && t.durationMinutes > 0);

  // Synchronize subtasks to event, goal, and active timer
  const persistSubtasks = (updated: SubTask[]) => {
    if (currentEvent?.id && onEditEvent) {
      onEditEvent(currentEvent.id, { subtasks: updated });
    } else if (matchedGoal?.id && onEditGoal) {
      onEditGoal(matchedGoal.id, { subtasks: updated });
    }

    if (activeTimer) {
      const convertedSteps: SessionSubStep[] = updated.map((t, idx) => ({
        id: t.id,
        title: t.title,
        durationMinutes: t.durationMinutes || 10,
        completed: t.completed
      }));
      updateActiveTimerSubSteps(convertedSteps);
    }
  };

  const handleToggleSubtask = (taskId: string) => {
    const updated = activeSubtasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
    persistSubtasks(updated);
  };

  const handleAdjustSubtaskDuration = (taskId: string, deltaMinutes: number) => {
    const updated = activeSubtasks.map(t => {
      if (t.id !== taskId) return t;
      const current = t.durationMinutes || 10;
      const nextVal = Math.max(1, Math.min(180, current + deltaMinutes));
      return { ...t, durationMinutes: nextVal };
    });
    persistSubtasks(updated);
  };

  const handleDeleteSubtask = (taskId: string) => {
    const updated = activeSubtasks.filter(t => t.id !== taskId);
    persistSubtasks(updated);
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const dur = Math.max(1, Number(newSubtaskMinutes) || 15);
    const newTask: SubTask = {
      id: `task_${Date.now()}`,
      title: newSubtaskTitle.trim(),
      durationMinutes: dur,
      completed: false
    };
    const nextList = [...activeSubtasks, newTask];
    setNewSubtaskTitle("");
    persistSubtasks(nextList);
  };

  // Quick Action: Distribute total session minutes evenly across all subtasks
  const handleDistributeEvenly = () => {
    if (activeSubtasks.length === 0) return;
    const count = activeSubtasks.length;
    const base = Math.max(1, Math.floor(totalSessionMinutes / count));
    const remainder = totalSessionMinutes - (base * count);

    const updated = activeSubtasks.map((task, idx) => ({
      ...task,
      durationMinutes: idx === count - 1 ? base + remainder : base
    }));
    persistSubtasks(updated);
  };

  // Quick Action: Proportionally scale all steps so they sum to totalSessionMinutes
  const handleAutoScaleToSession = () => {
    if (activeSubtasks.length === 0) return;
    const currentSum = allocatedMinutes;
    if (currentSum <= 0) {
      handleDistributeEvenly();
      return;
    }

    let allocated = 0;
    const count = activeSubtasks.length;
    const scaled = activeSubtasks.map((step, idx) => {
      if (idx === count - 1) {
        const rem = Math.max(1, totalSessionMinutes - allocated);
        return { ...step, durationMinutes: rem };
      }
      const proportional = Math.max(1, Math.round(((step.durationMinutes || 10) / currentSum) * totalSessionMinutes));
      allocated += proportional;
      return { ...step, durationMinutes: proportional };
    });
    persistSubtasks(scaled);
  };

  // Quick Action: Match total session duration to the sum of steps
  const handleMatchSessionToSteps = () => {
    if (allocatedMinutes <= 0) return;
    if (activeTimer) {
      setActiveTimerDuration(allocatedMinutes);
    } else if (currentEvent?.id && onEditEvent) {
      const startMs = new Date(currentEvent.start).getTime();
      const newEnd = new Date(startMs + allocatedMinutes * 60000).toISOString();
      onEditEvent(currentEvent.id, { end: newEnd });
    } else if (matchedGoal?.id && onEditGoal) {
      onEditGoal(matchedGoal.id, { durationMinutes: allocatedMinutes });
    }
  };

  // User Actions for Timer:
  const handleStartStudying = (overrideGoal?: Goal) => {
    const g = overrideGoal || matchedGoal;
    const evt = currentEvent;

    const title = g?.name || evt?.title || "Focus Study Session";
    const duration = g?.durationMinutes || (evt ? Math.max(15, Math.round((new Date(evt.end).getTime() - new Date(evt.start).getTime()) / 60000)) : 45);

    // Convert active subtasks to sessionSubSteps with their duration
    const subStepsToPass: SessionSubStep[] | undefined = activeSubtasks.length > 0 
      ? activeSubtasks.map((t, idx) => ({
          id: t.id,
          title: t.title,
          durationMinutes: t.durationMinutes || Math.max(5, Math.round(duration / activeSubtasks.length)),
          completed: t.completed
        }))
      : (evt?.subSteps || g?.subSteps);

    triggerFocusTimer({
      title,
      duration,
      eventId: evt?.id,
      goalId: g?.id || evt?.goalId,
      category: g?.category || evt?.type,
      color: g?.color || "#6366f1",
      previousSessionNote: g?.lastSessionNote,
      subSteps: subStepsToPass,
      autoStart: true,
      openModal: false
    });
    setShowGoalPicker(false);
  };

  const handlePause = () => {
    pauseFocusTimer();
  };

  const handleResume = () => {
    resumeFocusTimer();
  };

  const handleOpenFullscreen = () => {
    if (activeTimer) {
      triggerFocusTimer({
        title: activeTimer.title,
        duration: Math.max(1, Math.round(activeTimer.totalSec / 60)),
        eventId: activeTimer.eventId,
        goalId: activeTimer.goalId,
        category: activeTimer.category,
        color: activeTimer.color,
        previousSessionNote: activeTimer.previousSessionNote,
        subSteps: activeTimer.subSteps,
        autoStart: activeTimer.isRunning,
        openModal: true
      });
    } else if (currentEvent) {
      const dur = Math.max(15, Math.round((new Date(currentEvent.end).getTime() - new Date(currentEvent.start).getTime()) / 60000));
      triggerFocusTimer({
        title: currentEvent.title,
        duration: dur,
        eventId: currentEvent.id,
        goalId: currentEvent.goalId,
        category: matchedGoal?.category || currentEvent.type,
        color: matchedGoal?.color || "#6366f1",
        openModal: true
      });
    }
  };

  const handleFinishSession = () => {
    if (activeTimer) {
      finishFocusTimer();
    } else if (currentEvent) {
      onToggleCompleteEvent(currentEvent.id);
    }
  };

  // Compute live metrics if timer exists
  const isTimerRunning = Boolean(activeTimer?.isRunning);
  const isTimerPaused = Boolean(activeTimer && !activeTimer.isRunning && activeTimer.timeRemaining > 0 && !activeTimer.isCompleted);
  const hasActiveSession = isTimerRunning || isTimerPaused;

  // Real elapsed calculations
  let realTimeRemainingSec = 0;
  let realElapsedSec = 0;
  let realProgressPercent = 0;
  let finishingTimeString = "";
  let startedTimeString = "";
  let pausedTimeString = "";

  if (activeTimer) {
    if (isTimerRunning && activeTimer.targetEndTime) {
      realTimeRemainingSec = Math.max(0, Math.round((activeTimer.targetEndTime - tickerNow) / 1000));
      finishingTimeString = formatClockTime(activeTimer.targetEndTime);
    } else {
      realTimeRemainingSec = activeTimer.timeRemaining;
      const projectedFinish = tickerNow + activeTimer.timeRemaining * 1000;
      finishingTimeString = `~${formatClockTime(projectedFinish)} once resumed`;
    }

    realElapsedSec = Math.max(0, activeTimer.totalSec - realTimeRemainingSec);
    realProgressPercent = Math.min(100, Math.max(0, Math.round((realElapsedSec / Math.max(1, activeTimer.totalSec)) * 100)));

    if (activeTimer.startedAt) {
      startedTimeString = formatClockTime(activeTimer.startedAt);
    }
    if (activeTimer.lastPausedAt) {
      pausedTimeString = formatClockTime(activeTimer.lastPausedAt);
    }
  }

  // Calculate live pacing and which micro-task should be active now based on elapsed time
  const subtasksTimeline = useMemo(() => {
    let runningSec = 0;
    return activeSubtasks.map((task, idx) => {
      const durMins = task.durationMinutes || Math.max(5, Math.floor(totalSessionMinutes / Math.max(1, activeSubtasks.length)));
      const durSec = durMins * 60;
      const startSec = runningSec;
      const endSec = runningSec + durSec;
      runningSec = endSec;
      return {
        ...task,
        idx,
        durMins,
        startSec,
        endSec,
        durSec
      };
    });
  }, [activeSubtasks, totalSessionMinutes]);

  // Current paced step
  const currentPacedStep = useMemo(() => {
    if (!hasActiveSession || subtasksTimeline.length === 0) return null;
    let found = subtasksTimeline.find(s => realElapsedSec >= s.startSec && realElapsedSec < s.endSec);
    if (!found) {
      if (realElapsedSec >= (subtasksTimeline[subtasksTimeline.length - 1]?.endSec || 0)) {
        found = subtasksTimeline[subtasksTimeline.length - 1];
      } else {
        found = subtasksTimeline[0];
      }
    }
    const stepRemainingSec = found ? Math.max(0, found.endSec - realElapsedSec) : 0;
    const stepElapsedSec = found ? Math.min(found.durSec, Math.max(0, realElapsedSec - found.startSec)) : 0;
    const stepProgressPercent = found && found.durSec > 0 ? Math.min(100, Math.round((stepElapsedSec / found.durSec) * 100)) : 0;
    return {
      step: found,
      remainingSec: stepRemainingSec,
      elapsedSec: stepElapsedSec,
      progressPercent: stepProgressPercent
    };
  }, [hasActiveSession, subtasksTimeline, realElapsedSec]);

  // If no timer active and no scheduled event today, show nothing
  if (!hasActiveSession && !currentEvent && goals.length === 0) {
    return null;
  }

  const primaryTitle = activeTimer ? activeTimer.title : (currentEvent ? currentEvent.title : "Daily Focus Goal");
  const primaryColor = activeTimer?.color || matchedGoal?.color || "#6366f1";
  const primaryCategory = activeTimer?.category || matchedGoal?.category;

  return (
    <div 
      id="active_execution_hud"
      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 shadow-md ${
        isTimerRunning 
          ? "bg-[#0b0f19] border-emerald-500/40 shadow-emerald-950/40 dark:shadow-emerald-950/50" 
          : isTimerPaused
            ? "bg-[#13110e] border-amber-500/40 shadow-amber-950/30"
            : "bg-white dark:bg-[#0c0e17] border-slate-200/90 dark:border-indigo-500/30 shadow-slate-200/40 dark:shadow-indigo-950/30"
      }`}
    >
      {/* Top glowing status bar */}
      <div 
        className="h-1.5 w-full transition-all duration-500"
        style={{
          background: isTimerRunning 
            ? "linear-gradient(90deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)"
            : isTimerPaused
              ? "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)"
              : "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)"
        }}
      />

      <div className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* LEFT: Live Status Indicator, Goal Title & Real Timing Breakdown */}
          <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
            {/* Goal Icon */}
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md transition-transform"
              style={{ backgroundColor: primaryColor }}
            >
              {renderGoalIcon(activeGoal?.icon || matchedGoal?.icon, activeGoal?.type || matchedGoal?.type, "w-6 h-6")}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                {isTimerRunning ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    STUDYING NOW (TIMER RUNNING)
                  </span>
                ) : isTimerPaused ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Pause className="w-2.5 h-2.5" />
                    STUDY SESSION PAUSED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                    <Clock className="w-2.5 h-2.5" />
                    SCHEDULED TODAY • READY TO START
                  </span>
                )}

                {/* EXACT START TIMESTAMP */}
                {startedTimeString ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/10 text-slate-200 flex items-center gap-1">
                    <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                    Started at {startedTimeString}
                  </span>
                ) : currentEvent ? (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Scheduled: {formatClockTime(new Date(currentEvent.start))} – {formatClockTime(new Date(currentEvent.end))}
                  </span>
                ) : null}

                {/* PAUSED TIMESTAMP IF APPLICABLE */}
                {isTimerPaused && pausedTimeString && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 flex items-center gap-1 border border-amber-500/30">
                    Paused at {pausedTimeString}
                  </span>
                )}

                {/* EXACT ESTIMATED FINISHING TIME */}
                {finishingTimeString && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 flex items-center gap-1 border border-indigo-500/30">
                    <Clock className="w-3 h-3 text-indigo-400" />
                    Finishing: {finishingTimeString}
                  </span>
                )}
              </div>

              {/* Title & Live Countdown */}
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  {primaryTitle}
                </h3>
                {primaryCategory && (
                  <span className="text-xs text-slate-400 font-medium">
                    • {primaryCategory}
                  </span>
                )}

                {hasActiveSession && (
                  <span className={`text-sm font-mono font-black ${
                    isTimerRunning ? "text-emerald-400" : "text-amber-400"
                  }`}>
                    [{formatCountdown(realTimeRemainingSec)} left of {totalSessionMinutes}m]
                  </span>
                )}
              </div>

              {/* CURRENT ACTIVE PACED STEP CALLOUT */}
              {isTimerRunning && currentPacedStep?.step && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    <Timer className="w-3 h-3 text-indigo-400" />
                    Step {currentPacedStep.step.idx + 1} of {subtasksTimeline.length}: {currentPacedStep.step.title}
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 font-bold">
                    {formatCountdown(currentPacedStep.remainingSec)} left of {currentPacedStep.step.durMins}m
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Primary Controls for Start, Pause, Resume, and Finish */}
          <div className="flex items-center gap-2 w-full lg:w-auto justify-end flex-wrap">
            
            {/* Toggle Micro-tasks Checklist */}
            <button
              type="button"
              id="hud_toggle_subtasks_btn"
              onClick={() => setShowSubtasks(!showSubtasks)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                showSubtasks || activeSubtasks.length > 0
                  ? "bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white border-slate-300 dark:border-white/10"
                  : "bg-transparent text-slate-600 dark:text-slate-400 border-dashed border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
              title="Micro-task steps with time budgeting"
            >
              <ListTodo className="w-3.5 h-3.5 text-indigo-400" />
              <span>Micro-Tasks</span>
              {activeSubtasks.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                  {completedSubtasksCount}/{activeSubtasks.length}
                </span>
              )}
              {allocatedMinutes > 0 && (
                <span className={`text-[10px] font-mono font-bold ${
                  isOverallocated ? "text-amber-400" : "text-emerald-400"
                }`}>
                  ({allocatedMinutes}m)
                </span>
              )}
              {showSubtasks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {/* LIVE STUDY CONTROLS */}
            {isTimerRunning ? (
              <button
                type="button"
                id="hud_pause_session_btn"
                onClick={handlePause}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition active:scale-95 cursor-pointer"
                title="Pause study session timer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            ) : isTimerPaused ? (
              <button
                type="button"
                id="hud_resume_session_btn"
                onClick={handleResume}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 transition active:scale-95 cursor-pointer"
                title="Resume study session"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Resume Studying</span>
              </button>
            ) : (
              <button
                type="button"
                id="hud_start_studying_btn"
                onClick={() => handleStartStudying()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/40 transition active:scale-95 cursor-pointer"
                title="Click to start studying now - tracks start time, pauses, and exact finishing time"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Studying Now</span>
              </button>
            )}

            {/* Open Fullscreen Focus Room */}
            <button
              type="button"
              id="hud_expand_fullscreen_btn"
              onClick={handleOpenFullscreen}
              className="p-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition cursor-pointer"
              title="Expand full-screen ambient focus room"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Quick Done / Finish Button */}
            <button
              type="button"
              id="hud_mark_complete_btn"
              onClick={handleFinishSession}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 transition active:scale-95 cursor-pointer"
              title="Finish and log this session"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Done</span>
            </button>

            {/* Switch goal quick dropdown */}
            {!hasActiveSession && goals.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  id="hud_switch_goal_btn"
                  onClick={() => setShowGoalPicker(!showGoalPicker)}
                  className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Switch to studying another goal"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Other Goal</span>
                </button>

                {showGoalPicker && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 p-2 bg-[#0d121f] border border-white/15 rounded-xl shadow-2xl z-50 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
                      Choose Goal to Study:
                    </span>
                    {goals.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => handleStartStudying(g)}
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/10 text-left text-xs text-white transition cursor-pointer"
                      >
                        <span className="truncate">{g.name}</span>
                        <Play className="w-3 h-3 text-emerald-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

        {/* Real Study Progress Bar (elapsed time vs planned duration) */}
        {hasActiveSession && (
          <div className="mt-3.5 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Flame className={`w-3.5 h-3.5 ${isTimerRunning ? "text-emerald-400" : "text-amber-400"}`} />
                {isTimerRunning ? "Active Study Time Elapsed" : "Session Paused"}
              </span>
              <span className="font-mono font-bold text-white">
                {Math.floor(realElapsedSec / 60)}m elapsed • {realProgressPercent}% complete
              </span>
            </div>
            
            {/* Multi-segment step bar if subtasks exist, else solid bar */}
            {subtasksTimeline.length > 0 && allocatedMinutes > 0 ? (
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden flex gap-0.5 p-0.5">
                {subtasksTimeline.map((step) => {
                  const stepWeight = (step.durSec / Math.max(1, totalSessionMinutes * 60)) * 100;
                  const isCurrent = currentPacedStep?.step?.id === step.id;
                  const isPassed = realElapsedSec >= step.endSec;
                  return (
                    <div 
                      key={step.id} 
                      className="h-full rounded-sm relative overflow-hidden transition-all duration-300"
                      style={{ width: `${stepWeight}%` }}
                      title={`${step.title} (${step.durMins}m)`}
                    >
                      <div 
                        className={`h-full w-full ${
                          isPassed 
                            ? "bg-emerald-500" 
                            : isCurrent 
                              ? "bg-indigo-400 animate-pulse" 
                              : "bg-white/20"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${
                    isTimerRunning 
                      ? "bg-gradient-to-r from-emerald-500 to-cyan-400" 
                      : "bg-amber-500"
                  }`}
                  style={{ width: `${realProgressPercent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Collapsible Micro-Tasks Drawer with Time Budgeting */}
        {showSubtasks && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-white/5 space-y-3.5">
            
            {/* Header with Total Allocation & Budgeting Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Micro-Tasks & Time Budgeting
                </h4>
              </div>

              {/* Time Budget Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono">
                  <Hourglass className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-slate-300 font-bold">
                    Planned: <span className={isOverallocated ? "text-amber-400" : "text-emerald-400"}>{allocatedMinutes}m</span> / {totalSessionMinutes}m
                  </span>
                  {unallocatedMinutes > 0 && (
                    <span className="text-slate-400 text-[10px]">({unallocatedMinutes}m buffer)</span>
                  )}
                  {isOverallocated && (
                    <span className="text-amber-400 text-[10px] flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" /> +{allocatedMinutes - totalSessionMinutes}m over
                    </span>
                  )}
                </div>

                {/* Quick Auto-Budgeting Helpers */}
                {activeSubtasks.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleDistributeEvenly}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-slate-300 hover:text-white transition cursor-pointer"
                      title={`Split ${totalSessionMinutes}m equally across all ${activeSubtasks.length} steps`}
                    >
                      Split Evenly
                    </button>
                    {isOverallocated && (
                      <button
                        type="button"
                        onClick={handleAutoScaleToSession}
                        className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-[10px] font-bold text-indigo-300 transition cursor-pointer"
                        title="Proportionally scale down all steps to fit session"
                      >
                        Auto-Fit to {totalSessionMinutes}m
                      </button>
                    )}
                    {allocatedMinutes > 0 && allocatedMinutes !== totalSessionMinutes && (
                      <button
                        type="button"
                        onClick={handleMatchSessionToSteps}
                        className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-[10px] font-bold text-emerald-300 transition cursor-pointer"
                        title="Adjust total session duration to match step sum"
                      >
                        Set Session to {allocatedMinutes}m
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* List of subtasks with step duration indicators */}
            {activeSubtasks.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {subtasksTimeline.map((task) => {
                  const isCurrentPaced = isTimerRunning && currentPacedStep?.step?.id === task.id;
                  return (
                    <div
                      key={task.id}
                      className={`relative flex items-center justify-between gap-2.5 p-2.5 rounded-xl border transition group ${
                        task.completed
                          ? "bg-slate-50/60 dark:bg-white/5 border-slate-200/60 dark:border-white/5 text-slate-400 dark:text-slate-500"
                          : isCurrentPaced
                            ? "bg-indigo-950/40 border-indigo-500/50 shadow-sm shadow-indigo-500/20 text-white"
                            : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 hover:border-indigo-400/50"
                      }`}
                    >
                      {/* Checkbox & Title */}
                      <div 
                        onClick={() => handleToggleSubtask(task.id)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none"
                      >
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition shrink-0 ${
                          task.completed
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-slate-300 dark:border-white/20"
                        }`}>
                          {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold truncate ${task.completed ? "line-through text-slate-400" : ""}`}>
                              {task.title}
                            </span>
                            {isCurrentPaced && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse shrink-0">
                                ACTIVE NOW
                              </span>
                            )}
                          </div>
                          
                          {/* If current paced step, display time remaining on this specific step */}
                          {isCurrentPaced && (
                            <div className="text-[10px] font-mono text-indigo-300 mt-0.5">
                              {formatCountdown(currentPacedStep.remainingSec)} remaining on this step
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Step Time Badge & Adjust Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* -5 min */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdjustSubtaskDuration(task.id, -5);
                          }}
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition cursor-pointer"
                          title="Subtract 5 mins"
                        >
                          -5
                        </button>

                        {/* Duration Pill */}
                        <div 
                          className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1"
                          title="Minutes allocated for this step"
                        >
                          <Clock className="w-3 h-3 text-indigo-400" />
                          <span>{task.durationMinutes || 10}m</span>
                        </div>

                        {/* +5 min */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdjustSubtaskDuration(task.id, +5);
                          }}
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition cursor-pointer"
                          title="Add 5 mins"
                        >
                          +5
                        </button>

                        {/* Delete subtask */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSubtask(task.id);
                          }}
                          className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition p-1 cursor-pointer"
                          title="Delete step"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                No micro-tasks added yet. Break down your {totalSessionMinutes}-minute session into timed steps below to stay on track!
              </p>
            )}

            {/* Quick add subtask form with minute allocation */}
            <form onSubmit={handleAddSubtask} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                placeholder="Add a step (e.g. 'Review notes', 'Solve practice problem #3')..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              {/* Minute budget input */}
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <div className="flex items-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-2.5 py-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 mr-1" />
                  <input
                    type="number"
                    value={newSubtaskMinutes}
                    onChange={e => setNewSubtaskMinutes(Math.max(1, Number(e.target.value) || 1))}
                    min={1}
                    max={180}
                    className="w-8 text-xs font-mono font-bold text-center text-slate-900 dark:text-white bg-transparent focus:outline-none"
                    title="Allocated minutes"
                  />
                  <span className="text-[11px] font-mono text-slate-400">mins</span>
                </div>

                {/* Quick chip for remaining buffer if available */}
                {unallocatedMinutes > 0 && unallocatedMinutes !== newSubtaskMinutes && (
                  <button
                    type="button"
                    onClick={() => setNewSubtaskMinutes(unallocatedMinutes)}
                    className="px-2 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 transition cursor-pointer"
                    title="Use remaining session buffer"
                  >
                    Use rest ({unallocatedMinutes}m)
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!newSubtaskTitle.trim()}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Step</span>
                </button>
              </div>
            </form>

          </div>
        )}

      </div>
    </div>
  );
}
