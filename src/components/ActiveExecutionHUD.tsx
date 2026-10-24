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
  Hourglass,
  Layers,
  BookOpen
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
import GoalStartBriefingModal from "./GoalStartBriefingModal";

interface ActiveExecutionHUDProps {
  events: CalendarEvent[];
  goals: Goal[];
  onToggleCompleteEvent: (eventId: string) => void;
  onEditEvent?: (eventId: string, updates: Partial<CalendarEvent>) => void;
  onEditGoal?: (goalId: string, updates: Partial<Goal>) => void;
  onNavigateToCalendar?: (date?: Date, eventId?: string) => void;
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

  // Compact HUD mode for minimal vertical footprint on laptop screens
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem("hud_compact_mode") === "true";
    } catch {
      return false;
    }
  });

  const toggleCompact = () => {
    setIsCompact(prev => {
      const next = !prev;
      try {
        localStorage.setItem("hud_compact_mode", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleToggleCompact = () => toggleCompact();
    window.addEventListener("toggle_hud_compact", handleToggleCompact);
    return () => window.removeEventListener("toggle_hud_compact", handleToggleCompact);
  }, []);

  // Active target session & target goal synchronized from the calendar (e.g. React)
  const [targetedEventId, setTargetedEventId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("calendar_spotlight_event_id");
    } catch {
      return null;
    }
  });
  const [targetedGoalId, setTargetedGoalId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("calendar_spotlight_goal_id");
    } catch {
      return null;
    }
  });

  // User-selected goal from "Other Goals" picker (in-memory override for this study session, not persisted across sessions)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  // Target goal and session for "Where to start" briefing note popup
  const [briefingTarget, setBriefingTarget] = useState<{
    goal: Goal;
    event?: CalendarEvent | null;
    isStudyAhead: boolean;
  } | null>(null);

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

  // Listen for calendar target session changes (e.g. when user clicks Focus Today's Goal or clicks a target session)
  useEffect(() => {
    const handleTargetChange = (e: any) => {
      const eventId = e.detail?.eventId || null;
      const goalId = e.detail?.goalId || null;
      setTargetedEventId(eventId);
      setTargetedGoalId(goalId);
      // Clear manual goal override so the targeted calendar session/goal (React) takes immediate priority
      setSelectedGoalId(null);
      try {
        localStorage.removeItem("hud_selected_goal_id");
      } catch {}
    };

    window.addEventListener("calendar_target_session_change" as any, handleTargetChange);
    return () => {
      window.removeEventListener("calendar_target_session_change" as any, handleTargetChange);
    };
  }, []);

  // Listen for session completion events (from FocusTimerModal finish button or calendar check toggle)
  useEffect(() => {
    const handleSessionCompleted = (e: any) => {
      const detail = e.detail || {};
      const completedEvtId = detail.eventId || detail.id;
      const completedGoalId = detail.goalId;

      // Clear targeted event if it's the one that finished
      if (completedEvtId && targetedEventId === completedEvtId) {
        setTargetedEventId(null);
        try {
          localStorage.removeItem("calendar_spotlight_event_id");
        } catch {}
      }

      // Clear targeted goal if it's the one that finished
      if (completedGoalId && targetedGoalId === completedGoalId) {
        setTargetedGoalId(null);
        try {
          localStorage.removeItem("calendar_spotlight_goal_id");
        } catch {}
      }

      // Also reset manual goal picker if the finished goal was selected
      if (selectedGoalId && (selectedGoalId === completedGoalId || selectedGoalId === targetedGoalId)) {
        setSelectedGoalId(null);
      }

      // Immediately refresh the ticking time to force HUD re-evaluation
      setTickerNow(Date.now());
    };

    window.addEventListener("session_completed_event" as any, handleSessionCompleted);
    window.addEventListener("focus_session_completed" as any, handleSessionCompleted);
    return () => {
      window.removeEventListener("session_completed_event" as any, handleSessionCompleted);
      window.removeEventListener("focus_session_completed" as any, handleSessionCompleted);
    };
  }, [targetedEventId, targetedGoalId, selectedGoalId]);

  // Purge any completed target IDs from localStorage and state
  useEffect(() => {
    if (targetedEventId) {
      const ev = events.find(e => e.id === targetedEventId);
      if (!ev || ev.completed) {
        setTargetedEventId(null);
        try {
          localStorage.removeItem("calendar_spotlight_event_id");
        } catch {}
      }
    }

    if (targetedGoalId) {
      const todayStr = new Date(tickerNow).toDateString();
      const uncompletedGoalEvt = events.find(e => 
        !e.completed && 
        (e.goalId === targetedGoalId || goals.find(g => g.id === targetedGoalId && e.title?.toLowerCase().includes(g.name.toLowerCase()))) &&
        new Date(e.start).toDateString() === todayStr
      );
      if (!uncompletedGoalEvt) {
        setTargetedGoalId(null);
        try {
          localStorage.removeItem("calendar_spotlight_goal_id");
        } catch {}
      }
    }
  }, [events, targetedEventId, targetedGoalId, goals, tickerNow]);

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

    // 1. Explicit calendar target session (e.g. when spotlighted on calendar) - ONLY if uncompleted!
    if (targetedEventId) {
      const targeted = todayEvents.find(e => e.id === targetedEventId && !e.completed) ||
                       events.find(e => e.id === targetedEventId && !e.completed);
      if (targeted) {
        const g = targeted.goalId ? goals.find(item => item.id === targeted.goalId) : undefined;
        return { currentEvent: targeted, matchedGoal: g, nextEvent: null };
      }
    }

    // 2. Explicit calendar target goal - ONLY if that goal still has an uncompleted session!
    if (targetedGoalId) {
      const g = goals.find(item => item.id === targetedGoalId);
      if (g) {
        const sortedAllEvents = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        const matchingEvt = todayEvents.find(e => !e.completed && (
          e.goalId === g.id ||
          (e.title && g.name && (
            e.title.toLowerCase().includes(g.name.toLowerCase()) ||
            g.name.toLowerCase().includes(e.title.toLowerCase())
          ))
        )) || sortedAllEvents.find(e => !e.completed && (
          e.goalId === g.id ||
          (e.title && g.name && (
            e.title.toLowerCase().includes(g.name.toLowerCase()) ||
            g.name.toLowerCase().includes(e.title.toLowerCase())
          ))
        ));

        // CRITICAL FIX: Only lock onto targetedGoalId if it actually has an uncompleted session!
        if (matchingEvt) {
          return { currentEvent: matchingEvt, matchedGoal: g, nextEvent: null };
        }
      }
    }

    // 3. Check if an event is currently slotted on the calendar right now (current clock time)
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

    // 4. Check upcoming today (starts in the future today)
    const upcoming = todayEvents.find(e => {
      if (e.completed) return false;
      return new Date(e.start).getTime() > nowMs;
    });

    if (upcoming) {
      const g = upcoming.goalId ? goals.find(item => item.id === upcoming.goalId) : undefined;
      return { currentEvent: upcoming, matchedGoal: g, nextEvent: upcoming };
    }

    // 5. Fallback: uncompleted today that has passed its scheduled end (overdue / pending today)
    const pendingToday = todayEvents.find(e => !e.completed);
    if (pendingToday) {
      const g = pendingToday.goalId ? goals.find(item => item.id === pendingToday.goalId) : undefined;
      return { currentEvent: pendingToday, matchedGoal: g, nextEvent: null };
    }

    return { currentEvent: null, matchedGoal: undefined, nextEvent: null };
  }, [events, goals, tickerNow, targetedEventId, targetedGoalId]);

  // Tomorrow's upcoming sessions for the "Study Ahead" feature
  const { allTodayCompleted, tomorrowEvents, nextTomorrowEvent, matchedTomorrowGoal } = useMemo(() => {
    const nowObj = new Date(tickerNow);
    const todayStr = nowObj.toDateString();

    const tomorrowObj = new Date(nowObj);
    tomorrowObj.setDate(nowObj.getDate() + 1);
    const tomorrowStr = tomorrowObj.toDateString();

    const todayEvents = events.filter(e => new Date(e.start).toDateString() === todayStr);
    const allTodayCompleted = todayEvents.length > 0 && todayEvents.every(e => e.completed);

    const tomorrowEvts = events
      .filter(e => new Date(e.start).toDateString() === tomorrowStr && !e.completed)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const nextTomorrow = tomorrowEvts[0] || null;
    const tomorrowGoal = nextTomorrow?.goalId ? goals.find(g => g.id === nextTomorrow.goalId) : undefined;

    return {
      allTodayCompleted,
      tomorrowEvents: tomorrowEvts,
      nextTomorrowEvent: nextTomorrow,
      matchedTomorrowGoal: tomorrowGoal
    };
  }, [events, goals, tickerNow]);

  const [selectedTomorrowEventId, setSelectedTomorrowEventId] = useState<string | null>(null);
  const [showTomorrowPicker, setShowTomorrowPicker] = useState(false);

  // Proactively clean up any stale hud_selected_goal_id from localStorage
  useEffect(() => {
    try {
      localStorage.removeItem("hud_selected_goal_id");
    } catch {}
  }, []);

  const activeTomorrowEvent = selectedTomorrowEventId
    ? (tomorrowEvents.find(e => e.id === selectedTomorrowEventId) || nextTomorrowEvent)
    : nextTomorrowEvent;
  const activeTomorrowGoal = activeTomorrowEvent?.goalId
    ? goals.find(g => g.id === activeTomorrowEvent.goalId)
    : matchedTomorrowGoal;

  // Find goal explicitly chosen via "Other Goals"
  const userSelectedGoal = useMemo(() => {
    if (!selectedGoalId) return undefined;
    return goals.find(g => g.id === selectedGoalId);
  }, [selectedGoalId, goals]);

  // If a goal was chosen via "Other Goals", find an event that genuinely belongs to that goal (if one exists today)
  const userSelectedGoalEvent = useMemo(() => {
    if (!userSelectedGoal) return null;
    const nowObj = new Date(tickerNow);
    const todayStr = nowObj.toDateString();
    const todayEvents = events.filter(e => new Date(e.start).toDateString() === todayStr);
    return todayEvents.find(e => 
      !e.completed && (
        (e.goalId && e.goalId === userSelectedGoal.id) ||
        (e.title && userSelectedGoal.name && (
          e.title.toLowerCase() === userSelectedGoal.name.toLowerCase() ||
          e.title.toLowerCase().includes(userSelectedGoal.name.toLowerCase()) ||
          userSelectedGoal.name.toLowerCase().includes(e.title.toLowerCase())
        ))
      )
    ) || null;
  }, [userSelectedGoal, events, tickerNow]);

  // Study Ahead mode triggers when user has no active timer and no remaining uncompleted events today, but has tomorrow events!
  const isStudyAheadMode = Boolean(!activeTimer && !currentEvent && activeTomorrowEvent);

  const currentEventGoal = useMemo(() => {
    if (!currentEvent) return undefined;
    return goals.find(g => 
      (currentEvent.goalId && g.id === currentEvent.goalId) ||
      (currentEvent.title && g.name && (
        currentEvent.title.toLowerCase().includes(g.name.toLowerCase()) ||
        g.name.toLowerCase().includes(currentEvent.title.toLowerCase())
      ))
    );
  }, [currentEvent, goals]);

  // If a scheduled target session exists on the calendar, it ALWAYS takes priority in the HUD!
  const hasTarget = Boolean(currentEvent || matchedGoal);

  const effectiveEvent = (hasTarget ? currentEvent : null) 
    || (userSelectedGoal ? userSelectedGoalEvent : null) 
    || (isStudyAheadMode ? activeTomorrowEvent : null)
    || currentEvent;

  const effectiveGoal = (hasTarget ? (matchedGoal || currentEventGoal) : null) 
    || (userSelectedGoal ? (userSelectedGoalEvent ? userSelectedGoal : undefined) : null) 
    || matchedGoal 
    || currentEventGoal
    || (isStudyAheadMode ? activeTomorrowGoal : undefined);

  // Compute total planned duration of this study session in minutes
  const totalSessionMinutes = useMemo(() => {
    if (activeTimer) {
      return Math.max(1, Math.round(activeTimer.totalSec / 60));
    }
    if (effectiveEvent) {
      return Math.max(15, Math.round((new Date(effectiveEvent.end).getTime() - new Date(effectiveEvent.start).getTime()) / 60000));
    }
    if (effectiveGoal?.durationMinutes) {
      return effectiveGoal.durationMinutes;
    }
    if (userSelectedGoal) {
      if (userSelectedGoalEvent) {
        return Math.max(15, Math.round((new Date(userSelectedGoalEvent.end).getTime() - new Date(userSelectedGoalEvent.start).getTime()) / 60000));
      }
      return userSelectedGoal.durationMinutes || 45;
    }
    return 45;
  }, [activeTimer, effectiveEvent, effectiveGoal, userSelectedGoal, userSelectedGoalEvent]);

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
    if (effectiveEvent?.subtasks && effectiveEvent.subtasks.length > 0) {
      return effectiveEvent.subtasks;
    }
    if (effectiveGoal?.subtasks && effectiveGoal.subtasks.length > 0) {
      return effectiveGoal.subtasks;
    }
    if (effectiveGoal?.subSteps && effectiveGoal.subSteps.length > 0) {
      return effectiveGoal.subSteps.map(s => ({
        id: s.id,
        title: s.title,
        durationMinutes: s.durationMinutes,
        completed: s.completed || false
      }));
    }
    return [];
  }, [activeTimer, effectiveEvent, effectiveGoal]);

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
    if (effectiveEvent?.id && onEditEvent) {
      onEditEvent(effectiveEvent.id, { subtasks: updated });
    } else if (effectiveGoal?.id && onEditGoal) {
      onEditGoal(effectiveGoal.id, { subtasks: updated });
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
    } else if (effectiveEvent?.id && onEditEvent) {
      const startMs = new Date(effectiveEvent.start).getTime();
      const newEnd = new Date(startMs + allocatedMinutes * 60000).toISOString();
      onEditEvent(effectiveEvent.id, { end: newEnd });
    } else if (effectiveGoal?.id && onEditGoal) {
      onEditGoal(effectiveGoal.id, { durationMinutes: allocatedMinutes });
    }
  };

  // Actual execution of study timer
  const executeStartStudying = (g?: Goal, evt?: CalendarEvent | null, noteOverride?: string) => {
    // Only use evt if it genuinely belongs to g, never an unrelated scheduled event from another goal (e.g. Python when studying Cybersecurity)
    const isMatchingEvent = evt && (!g || evt.goalId === g.id || (evt.title && g.name && (
      evt.title.toLowerCase().includes(g.name.toLowerCase()) ||
      g.name.toLowerCase().includes(evt.title.toLowerCase())
    )));
    const matchedEvt = isMatchingEvent ? evt : null;

    const title = matchedEvt?.title || g?.name || "Focus Study Session";
    const duration = matchedEvt 
      ? Math.max(15, Math.round((new Date(matchedEvt.end).getTime() - new Date(matchedEvt.start).getTime()) / 60000)) 
      : (g?.durationMinutes || 45);

    // Convert active subtasks to sessionSubSteps with their duration
    const subStepsToPass: SessionSubStep[] | undefined = activeSubtasks.length > 0 
      ? activeSubtasks.map((t) => ({
          id: t.id,
          title: t.title,
          durationMinutes: t.durationMinutes || Math.max(5, Math.round(duration / activeSubtasks.length)),
          completed: t.completed
        }))
      : (matchedEvt?.subSteps || g?.subSteps);

    // Suppress upcoming pre-session alerts because user is studying now
    try {
      const existing: string[] = JSON.parse(localStorage.getItem("notified_event_alert_ids") || "[]");
      let changed = false;
      if (matchedEvt?.id && !existing.includes(matchedEvt.id)) {
        existing.push(matchedEvt.id);
        changed = true;
      }
      const goalToMatch = g || (matchedEvt?.goalId ? goals.find(item => item.id === matchedEvt.goalId) : undefined);
      if (goalToMatch) {
        const todayStr = new Date().toDateString();
        events.forEach(e => {
          if (!existing.includes(e.id) && new Date(e.start).toDateString() === todayStr) {
            if (e.goalId === goalToMatch.id || (e.title && e.title.toLowerCase().includes(goalToMatch.name.toLowerCase()))) {
              existing.push(e.id);
              changed = true;
            }
          }
        });
      }
      if (changed) {
        localStorage.setItem("notified_event_alert_ids", JSON.stringify(existing));
      }
    } catch {}

    triggerFocusTimer({
      title,
      duration,
      eventId: matchedEvt?.id,
      goalId: g?.id || matchedEvt?.goalId,
      category: g?.category || matchedEvt?.type,
      color: g?.color || "#6366f1",
      previousSessionNote: noteOverride !== undefined ? noteOverride : g?.lastSessionNote,
      subSteps: subStepsToPass,
      autoStart: true,
      openModal: false
    });
    setSelectedGoalId(null);
    try {
      localStorage.removeItem("hud_selected_goal_id");
    } catch {}
    setShowGoalPicker(false);
    setShowTomorrowPicker(false);
  };

  // User Actions for Timer:
  // When user clicks "Start Studying Now" or "Study Ahead Now":
  // If the goal has a note saved, show the note so they know where to start!
  // Otherwise, start normally without interruption.
  const handleStartStudying = (overrideGoal?: Goal, overrideEvent?: CalendarEvent) => {
    // When called from the main "Start Studying Now" button with no override, ALWAYS study the scheduled target session (e.g. React)!
    const targetGoal = overrideGoal || effectiveGoal || matchedGoal || userSelectedGoal;

    // Find event specifically matching targetGoal
    let targetEvent: CalendarEvent | null | undefined = overrideEvent;
    if (!targetEvent && targetGoal) {
      const nowObj = new Date(tickerNow);
      const todayStr = nowObj.toDateString();
      const todayEvents = events.filter(e => new Date(e.start).toDateString() === todayStr);
      targetEvent = todayEvents.find(e => 
        !e.completed && (
          (e.goalId && e.goalId === targetGoal.id) ||
          (e.title && targetGoal.name && (
            e.title.toLowerCase() === targetGoal.name.toLowerCase() ||
            e.title.toLowerCase().includes(targetGoal.name.toLowerCase()) ||
            targetGoal.name.toLowerCase().includes(e.title.toLowerCase())
          ))
        )
      ) || null;
    }
    if (!targetEvent && !overrideGoal) {
      targetEvent = effectiveEvent;
    }

    const isAhead = Boolean(
      isStudyAheadMode || 
      (targetGoal && activeTomorrowGoal && targetGoal.id === activeTomorrowGoal.id) ||
      (targetEvent && tomorrowEvents.some(te => te.id === targetEvent.id))
    );

    // Check if goal has a saved note to tell the user where to start
    if (targetGoal && targetGoal.lastSessionNote && targetGoal.lastSessionNote.trim().length > 0) {
      setBriefingTarget({
        goal: targetGoal,
        event: targetEvent,
        isStudyAhead: isAhead
      });
      return;
    }

    // Otherwise, works normally
    executeStartStudying(targetGoal, targetEvent);
  };

  const handlePullTomorrowEventToToday = (evt: CalendarEvent) => {
    if (!onEditEvent) return;
    const now = new Date();
    const origDurationMs = new Date(evt.end).getTime() - new Date(evt.start).getTime();
    const durationMs = Math.max(15 * 60000, origDurationMs);
    const newEnd = new Date(now.getTime() + durationMs);

    onEditEvent(evt.id, {
      start: now.toISOString(),
      end: newEnd.toISOString()
    });

    handleStartStudying(activeTomorrowGoal, {
      ...evt,
      start: now.toISOString(),
      end: newEnd.toISOString()
    });
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
    } else if (effectiveGoal || effectiveEvent) {
      triggerFocusTimer({
        title: primaryTitle,
        duration: totalSessionMinutes,
        eventId: effectiveEvent?.id,
        goalId: effectiveGoal?.id,
        category: primaryCategory,
        color: primaryColor,
        openModal: true
      });
    }
  };

  const handleFinishSession = () => {
    if (activeTimer) {
      finishFocusTimer();
    } else if (effectiveEvent) {
      onToggleCompleteEvent(effectiveEvent.id);
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

  // If no timer active and no scheduled event today and no tomorrow event, and no goals, show nothing
  if (!hasActiveSession && !effectiveEvent && goals.length === 0) {
    return null;
  }

  // Find the most recently completed session
  const latestCompletedSession = useMemo(() => {
    const completedList = events.filter(e => e.completed);
    if (completedList.length === 0) return null;
    return [...completedList].sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];
  }, [events]);

  const primaryTitle = activeTimer 
    ? activeTimer.title 
    : (effectiveEvent 
        ? effectiveEvent.title 
        : (effectiveGoal 
            ? effectiveGoal.name 
            : (userSelectedGoal 
                ? (userSelectedGoalEvent ? userSelectedGoalEvent.title : userSelectedGoal.name) 
                : "Daily Focus Goal")));
  const primaryColor = activeTimer?.color || effectiveGoal?.color || userSelectedGoal?.color || "#6366f1";
  const primaryCategory = activeTimer?.category || effectiveGoal?.category || userSelectedGoal?.category || effectiveEvent?.type;

  if (isCompact) {
    return (
      <>
        {briefingTarget && (
          <GoalStartBriefingModal
            isOpen={Boolean(briefingTarget)}
            onClose={() => {
              setBriefingTarget(null);
              setSelectedGoalId(null);
            }}
            goal={briefingTarget.goal}
            event={briefingTarget.event}
            isStudyAhead={briefingTarget.isStudyAhead}
            onConfirmStart={(editedNote) => {
              executeStartStudying(briefingTarget.goal, briefingTarget.event, editedNote);
              setBriefingTarget(null);
              setSelectedGoalId(null);
            }}
            onUpdateGoalNote={(goalId, updatedNote) => {
              if (onEditGoal) {
                onEditGoal(goalId, {
                  lastSessionNote: updatedNote,
                  lastSessionNoteDate: new Date().toISOString()
                });
              }
            }}
          />
        )}
        <div 
          id="active_execution_hud_compact"
          className={`relative rounded-xl border transition-all duration-200 shadow-sm px-3.5 py-2 flex items-center justify-between gap-3 ${
            isTimerRunning 
              ? "bg-[#0b0f19] border-emerald-500/40 text-white shadow-emerald-950/30" 
              : isTimerPaused
                ? "bg-[#13110e] border-amber-500/40 text-white shadow-amber-950/20"
                : isStudyAheadMode
                  ? "bg-slate-900/95 dark:bg-[#0c101a] border-emerald-500/30 text-white"
                  : "bg-white/95 dark:bg-[#0c0e17] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
          }`}
          style={{ zIndex: 30 }}
        >
          {/* Left: Icon, Title & Status */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div 
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs"
              style={{ backgroundColor: primaryColor }}
            >
              {renderGoalIcon(activeGoal?.icon || effectiveGoal?.icon, activeGoal?.type || effectiveGoal?.type, "w-4 h-4")}
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
              <span className="font-extrabold text-xs sm:text-sm truncate">
                {primaryTitle}
              </span>

              {/* Status indicator */}
              {isTimerRunning ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  LIVE • {formatCountdown(realTimeRemainingSec)}
                </span>
              ) : isTimerPaused ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                  <Pause className="w-2.5 h-2.5" />
                  PAUSED • {formatCountdown(realTimeRemainingSec)}
                </span>
              ) : isStudyAheadMode ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                  STUDY AHEAD
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 shrink-0">
                  <Clock className="w-2.5 h-2.5" />
                  READY • {totalSessionMinutes}M
                </span>
              )}

              {finishingTimeString && isTimerRunning && (
                <span className="hidden md:inline-flex text-[10px] text-slate-400 font-medium">
                  Ends {finishingTimeString}
                </span>
              )}
            </div>
          </div>

          {/* Right: Actions & Expand Button */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isTimerRunning ? (
              <>
                <button
                  type="button"
                  id="hud_compact_pause_btn"
                  onClick={handlePause}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition cursor-pointer"
                  title="Pause active timer (Space)"
                >
                  <Pause className="w-3 h-3" />
                  <span className="hidden sm:inline">Pause</span>
                </button>
                <button
                  type="button"
                  id="hud_compact_done_btn"
                  onClick={handleFinishSession}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-xs"
                  title="Mark Finished Now"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Done</span>
                </button>
              </>
            ) : isTimerPaused ? (
              <>
                <button
                  type="button"
                  id="hud_compact_resume_btn"
                  onClick={handleResume}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-xs"
                  title="Resume study timer (Space)"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span className="hidden sm:inline">Resume</span>
                </button>
                <button
                  type="button"
                  id="hud_compact_done_btn"
                  onClick={handleFinishSession}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-700/80 hover:bg-emerald-700 text-white transition cursor-pointer"
                  title="Mark Finished"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Done</span>
                </button>
              </>
            ) : isStudyAheadMode ? (
              <button
                type="button"
                id="hud_compact_study_ahead_btn"
                onClick={() => handleStartStudying(activeTomorrowGoal, activeTomorrowEvent)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition cursor-pointer shadow-xs"
                title="Study Ahead Now"
              >
                <Zap className="w-3 h-3 fill-amber-300 text-amber-300" />
                <span>Study Ahead</span>
              </button>
            ) : (
              <button
                type="button"
                id="hud_compact_start_btn"
                onClick={() => handleStartStudying()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition cursor-pointer shadow-xs"
                title="Start Studying Now (Space)"
              >
                <Play className="w-3 h-3 fill-white" />
                <span>Start</span>
              </button>
            )}

            {/* Fullscreen focus button */}
            <button
              type="button"
              id="hud_compact_fullscreen_btn"
              onClick={handleOpenFullscreen}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition cursor-pointer"
              title="Expand Fullscreen Focus Room"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Expand to full cockpit */}
            <button
              type="button"
              id="hud_compact_expand_btn"
              onClick={toggleCompact}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-bold transition cursor-pointer"
              title="Expand to Full Cockpit (Press C)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Cockpit</span>
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div 
      id="active_execution_hud"
      className={`relative rounded-2xl border transition-all duration-300 shadow-md ${
        isTimerRunning 
          ? "bg-[#0b0f19] border-emerald-500/40 shadow-emerald-950/40 dark:shadow-emerald-950/50" 
          : isTimerPaused
            ? "bg-[#13110e] border-amber-500/40 shadow-amber-950/30"
            : isStudyAheadMode
              ? "bg-slate-900/95 dark:bg-[#0c101a] border-emerald-500/40 shadow-xl shadow-emerald-950/20"
              : "bg-white dark:bg-[#0c0e17] border-slate-200/90 dark:border-indigo-500/30 shadow-slate-200/40 dark:shadow-indigo-950/30"
      }`}
      style={{ zIndex: 30 }}
    >
      {/* Top glowing status bar */}
      <div 
        className="h-1.5 w-full rounded-t-2xl overflow-hidden transition-all duration-500"
        style={{
          background: isTimerRunning 
            ? "linear-gradient(90deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)"
            : isTimerPaused
              ? "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)"
              : isStudyAheadMode
                ? "linear-gradient(90deg, #10b981 0%, #34d399 50%, #f59e0b 100%)"
                : "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)"
        }}
      />

      <div className="p-4 sm:p-5">
        {/* Recently Finished Session Indicator */}
        {latestCompletedSession && !hasActiveSession && (
          <div className="mb-3.5 p-2.5 px-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-600/40 flex items-center justify-between gap-3 text-xs shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Check className="w-3 h-3 stroke-[3]" />
              </span>
              <span className="text-slate-700 dark:text-slate-200 truncate">
                <span className="text-emerald-700 dark:text-emerald-400 font-extrabold uppercase text-[10px] tracking-wide mr-1.5">Recently Finished:</span>
                <strong className="font-bold text-slate-900 dark:text-white">{latestCompletedSession.title}</strong>
                <span className="text-slate-500 dark:text-slate-400 text-[11px] ml-1.5">
                  ({new Date(latestCompletedSession.start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at {new Date(latestCompletedSession.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToCalendar?.(new Date(latestCompletedSession.start), latestCompletedSession.id)}
              className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1 shrink-0 cursor-pointer hover:underline"
              title="Highlight this completed session in the Calendar"
            >
              <span>View in Calendar</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* LEFT: Live Status Indicator, Goal Title & Real Timing Breakdown */}
          <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
            {/* Goal Icon */}
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md transition-transform"
              style={{ backgroundColor: primaryColor }}
            >
              {renderGoalIcon(activeGoal?.icon || effectiveGoal?.icon, activeGoal?.type || effectiveGoal?.type, "w-6 h-6")}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              {/* Badges / Context row (Zero-pill discipline: unboxed clean typographic metadata) */}
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
                ) : isStudyAheadMode ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400 text-[11px] tracking-wide">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      {allTodayCompleted ? "Today's Schedule Complete" : "Tomorrow's Goal"}
                    </span>
                    <span className="text-slate-600 dark:text-slate-500" aria-hidden="true">•</span>
                    <span className="text-emerald-300 font-semibold">Study Ahead</span>
                    {activeTomorrowEvent && (
                      <>
                        <span className="text-slate-600 dark:text-slate-500" aria-hidden="true">•</span>
                        <span className="text-slate-300 flex items-center gap-1 font-medium text-[11px]">
                          <Calendar className="w-3 h-3 text-emerald-400" />
                          Tomorrow {formatClockTime(new Date(activeTomorrowEvent.start))} – {formatClockTime(new Date(activeTomorrowEvent.end))} ({totalSessionMinutes}m)
                        </span>
                      </>
                    )}
                  </div>
                ) : hasTarget ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                    <Clock className="w-2.5 h-2.5" />
                    TARGET SESSION • READY TO START
                  </span>
                ) : userSelectedGoal ? (
                  userSelectedGoalEvent ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                      <Clock className="w-2.5 h-2.5" />
                      SCHEDULED TODAY • READY TO START
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                      <Target className="w-2.5 h-2.5" />
                      SELECTED GOAL • {userSelectedGoal.durationMinutes || 45}M TARGET
                    </span>
                  )
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
                ) : effectiveEvent && !isStudyAheadMode ? (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Scheduled: {formatClockTime(new Date(effectiveEvent.start))} – {formatClockTime(new Date(effectiveEvent.end))}
                  </span>
                ) : userSelectedGoal ? (
                  userSelectedGoalEvent ? (
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Scheduled: {formatClockTime(new Date(userSelectedGoalEvent.start))} – {formatClockTime(new Date(userSelectedGoalEvent.end))}
                    </span>
                  ) : null
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
            
            {/* Toggle Micro-tasks Checklist (Only shown when active or when subtasks exist) */}
            {(hasActiveSession || activeSubtasks.length > 0) && (
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
            )}

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
            ) : isStudyAheadMode ? (
              <>
                {/* Secondary: Pull to Today */}
                {onEditEvent && activeTomorrowEvent && (
                  <button
                    type="button"
                    id="hud_pull_to_today_btn"
                    onClick={() => handlePullTomorrowEventToToday(activeTomorrowEvent)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition active:scale-95 cursor-pointer shadow-xs"
                    title="Move this session from Tomorrow's calendar to Today and start now"
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Pull to Today</span>
                  </button>
                )}

                {/* Primary Hero: Study Ahead Now */}
                <button
                  type="button"
                  id="hud_study_ahead_btn"
                  onClick={() => handleStartStudying(activeTomorrowGoal, activeTomorrowEvent)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/40 transition active:scale-95 cursor-pointer"
                  title="Jump ahead and start studying tomorrow's session right now"
                >
                  <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                  <span>Study Ahead Now</span>
                </button>

                {/* Tomorrow's Agenda Dropdown */}
                {tomorrowEvents.length > 1 && (
                  <div className="relative">
                    <button
                      type="button"
                      id="hud_switch_tomorrow_btn"
                      onClick={() => setShowTomorrowPicker(!showTomorrowPicker)}
                      className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="Pick from tomorrow's scheduled sessions"
                    >
                      <Layers className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Tomorrow ({tomorrowEvents.length})</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {showTomorrowPicker && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShowTomorrowPicker(false)} 
                        />
                        <div className="absolute right-0 top-full mt-2 w-72 p-2 bg-white dark:bg-[#121624] border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xl z-50 space-y-1 backdrop-blur-md">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 py-1 block border-b border-slate-100 dark:border-slate-800/80 pb-1.5 mb-1">
                            Tomorrow's Sessions ({tomorrowEvents.length}):
                          </span>
                          <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
                            {tomorrowEvents.map(evt => {
                              const dur = Math.round((new Date(evt.end).getTime() - new Date(evt.start).getTime()) / 60000);
                              const isSelected = activeTomorrowEvent?.id === evt.id;
                              return (
                                <button
                                  key={evt.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTomorrowEventId(evt.id);
                                    setShowTomorrowPicker(false);
                                  }}
                                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition cursor-pointer ${
                                    isSelected 
                                      ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 font-bold border border-emerald-300 dark:border-emerald-500/30" 
                                      : "hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white"
                                  }`}
                                >
                                  <div className="min-w-0 flex-1 pr-2">
                                    <div className="truncate font-medium">{evt.title}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                      {formatClockTime(new Date(evt.start))} • {dur}m
                                    </div>
                                  </div>
                                  <Play className="w-3 h-3 text-emerald-500 shrink-0" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
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

            {/* Collapse to Slim Bar */}
            <button
              type="button"
              id="hud_collapse_compact_btn"
              onClick={toggleCompact}
              className="p-2 px-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
              title="Collapse to Slim Bar (Press C)"
            >
              <ChevronUp className="w-4 h-4" />
              <span className="hidden sm:inline">Compact</span>
            </button>

            {/* Quick Done / Finish Button: ONLY shown when an active session is in progress or today's scheduled event */}
            {(hasActiveSession || (currentEvent && !isStudyAheadMode)) && (
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
            )}

            {/* Switch goal quick dropdown */}
            {!hasActiveSession && goals.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  id="hud_switch_goal_btn"
                  onClick={() => setShowGoalPicker(!showGoalPicker)}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    userSelectedGoal
                      ? "border-indigo-400 dark:border-indigo-500/50 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                      : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-white"
                  }`}
                  title="Switch to studying another goal"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Other Goals</span>
                  {userSelectedGoal && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  )}
                </button>

                {showGoalPicker && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowGoalPicker(false)} 
                    />
                    <div className="absolute right-0 top-full mt-2 w-72 p-2 bg-white dark:bg-[#121624] border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xl z-50 space-y-1 backdrop-blur-md">
                      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 dark:border-slate-800/80 pb-1.5 mb-1">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Choose Goal to Study:
                        </span>
                        {selectedGoalId && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGoalId(null);
                              try {
                                localStorage.removeItem("hud_selected_goal_id");
                              } catch {}
                              setShowGoalPicker(false);
                            }}
                            className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            Reset to Scheduled
                          </button>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
                        {goals.map(g => {
                          const isSelected = (activeTimer?.goalId === g.id) || (userSelectedGoal?.id === g.id);
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                setShowGoalPicker(false);
                                handleStartStudying(g);
                              }}
                              className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition cursor-pointer ${
                                isSelected 
                                  ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 font-bold border border-indigo-200 dark:border-indigo-500/30"
                                  : "hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white"
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-2">
                                <div className="truncate font-medium">{g.name}</div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                  <span>{g.category || "Study"}</span>
                                  <span>•</span>
                                  <span>{g.durationMinutes || 45}m</span>
                                  {isSelected && (
                                    <span className="text-emerald-500 font-semibold">• Active</span>
                                  )}
                                </div>
                              </div>
                              <Play className="w-3 h-3 text-emerald-400 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
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
            
            {/* Goal Syllabus Modules Progress */}
            {effectiveGoal?.chapters && effectiveGoal.chapters.length > 0 && (
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Syllabus Checkpoints ({effectiveGoal.chapters.filter(c => c.completed).length}/{effectiveGoal.chapters.length})</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {Math.round((effectiveGoal.chapters.filter(c => c.completed).length / effectiveGoal.chapters.length) * 100)}% complete
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {effectiveGoal.chapters.map((ch, idx) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        if (effectiveGoal && onEditGoal) {
                          const updated = effectiveGoal.chapters?.map(c => c.id === ch.id ? { ...c, completed: !c.completed } : c) || [];
                          onEditGoal(effectiveGoal.id, { chapters: updated });
                        }
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-medium border flex items-center gap-1 transition cursor-pointer ${
                        ch.completed 
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 line-through" 
                          : "bg-white/5 hover:bg-white/10 text-slate-200 border-white/10"
                      }`}
                      title={ch.completed ? "Mark incomplete" : "Mark chapter complete"}
                    >
                      <Check className={`w-3 h-3 ${ch.completed ? "text-emerald-400" : "opacity-40"}`} />
                      <span>{idx + 1}. {ch.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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

      {/* Goal Carryover Note "Where to Start" Briefing Modal */}
      {briefingTarget && (
        <GoalStartBriefingModal
          isOpen={Boolean(briefingTarget)}
          onClose={() => {
            setBriefingTarget(null);
            setSelectedGoalId(null);
          }}
          goal={briefingTarget.goal}
          event={briefingTarget.event}
          isStudyAhead={briefingTarget.isStudyAhead}
          onConfirmStart={(editedNote) => {
            executeStartStudying(briefingTarget.goal, briefingTarget.event, editedNote);
            setBriefingTarget(null);
            setSelectedGoalId(null);
          }}
          onUpdateGoalNote={(goalId, updatedNote) => {
            if (onEditGoal) {
              onEditGoal(goalId, {
                lastSessionNote: updatedNote,
                lastSessionNoteDate: new Date().toISOString()
              });
            }
          }}
        />
      )}
    </div>
  );
}
