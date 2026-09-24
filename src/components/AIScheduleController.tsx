import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Sparkles, 
  Bot, 
  Calendar, 
  Layers, 
  CheckCircle2, 
  ArrowRight, 
  Clock, 
  Zap, 
  ShieldCheck, 
  RefreshCw, 
  AlertTriangle, 
  ArrowRightLeft, 
  Brain, 
  ChevronRight, 
  Check, 
  X, 
  Filter, 
  Flame, 
  Wand2,
  CalendarCheck,
  Send,
  Sliders,
  Radio,
  Play,
  Pause,
  History,
  Activity,
  CheckCircle,
  Eye,
  SlidersHorizontal,
  ChevronDown
} from "lucide-react";
import { 
  Goal, 
  CalendarEvent, 
  AvailabilityWindow, 
  UserEnergyProfile, 
  AIScheduleProposal, 
  ScheduleDiffItem,
  AutopilotMode,
  AutopilotLogEntry
} from "../types";

interface AIScheduleControllerProps {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  energyProfile: UserEnergyProfile;
  onApplySchedule: (newEvents: CalendarEvent[], summaryMsg: string) => void;
  onNavigateToGoals: () => void;
  onNavigateToCalendar: (date?: Date) => void;
  onAddNotification: (
    title: string, 
    message: string, 
    type: "upcoming" | "warning" | "motivation" | "success" | "sync",
    action?: { label: string; onClick: () => void }
  ) => void;
  userEmail?: string;
}

export default function AIScheduleController({
  goals,
  events,
  availability,
  energyProfile,
  onApplySchedule,
  onNavigateToGoals,
  onNavigateToCalendar,
  onAddNotification,
  userEmail = "rounigorgees@gmail.com"
}: AIScheduleControllerProps) {
  // Autopilot settings
  const [autopilotMode, setAutopilotMode] = useState<AutopilotMode>(() => {
    const saved = localStorage.getItem("ai_autopilot_mode");
    return (saved as AutopilotMode) || "full_autonomous";
  });

  const [activeMode, setActiveMode] = useState<
    "auto_plan_goals" | "deconflict_and_heal" | "catch_up_rebalance" | "energy_chronotype_align" | "custom_directive"
  >("auto_plan_goals");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<AIScheduleProposal | null>(null);
  const [diffFilter, setDiffFilter] = useState<"all" | "added" | "moved" | "retained">("all");
  const [hasApplied, setHasApplied] = useState(false);

  // Dynamic Autopilot Sentinel State
  const [isSentinelActive, setIsSentinelActive] = useState(true);
  const [lastScanTime, setLastScanTime] = useState<Date>(new Date());
  const [radarPulse, setRadarPulse] = useState(0);
  const [pendingCountdown, setPendingCountdown] = useState<number | null>(null);
  const [pendingCountdownProposal, setPendingCountdownProposal] = useState<AIScheduleProposal | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isExecutingAutonomousRef = useRef(false);

  // Autonomous Activity Feed Log
  const [autopilotLog, setAutopilotLog] = useState<AutopilotLogEntry[]>(() => {
    const saved = localStorage.getItem("ai_autopilot_log");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [
      {
        id: "log_init_1",
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        actionType: "sentinel_scan",
        title: "Autonomous Sentinel Armed",
        description: "Scanning goal quotas, collision vectors, and chronotype alignment continuously.",
        badge: "Watchdog Active",
        affectedCount: 0
      }
    ];
  });

  const appendAutopilotLog = useCallback((entry: Omit<AutopilotLogEntry, "id">) => {
    const newEntry: AutopilotLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setAutopilotLog((prev) => {
      const updated = [newEntry, ...prev].slice(0, 30);
      try {
        localStorage.setItem("ai_autopilot_log", JSON.stringify(updated));
      } catch (e) { /* ignore */ }
      return updated;
    });
  }, []);

  // Quick stats calculation
  const activeGoals = goals.filter((g) => !g.isPaused);
  const totalWeeklyTargetSessions = activeGoals.reduce((sum, g) => sum + (g.weeklyTarget || 0), 0);
  const totalScheduledSessions = events.filter((e) => !e.completed).length;
  const completedSessions = events.filter((e) => e.completed).length;
  
  // Overdue / missed sessions detection
  const nowMs = Date.now();
  const pastIncompleteEvents = events.filter((e) => !e.completed && new Date(e.end).getTime() < nowMs);
  
  // Overlapping collisions detection
  const detectedCollisions = events.reduce((acc: { a: CalendarEvent; b: CalendarEvent }[], evA, idx) => {
    const aStart = new Date(evA.start).getTime();
    const aEnd = new Date(evA.end).getTime();
    events.slice(idx + 1).forEach((evB) => {
      const bStart = new Date(evB.start).getTime();
      const bEnd = new Date(evB.end).getTime();
      if (aStart < bEnd && aEnd > bStart) {
        acc.push({ a: evA, b: evB });
      }
    });
    return acc;
  }, []);

  // Unscheduled Goal Gap detection
  const unmetGoals = activeGoals.filter((g) => {
    const count = events.filter((e) => e.goalId === g.id || (e.title && e.title.toLowerCase().includes(g.name.toLowerCase()))).length;
    return count < (g.weeklyTarget || 1);
  });

  // Mode change handler with local persistence
  const handleAutopilotModeChange = (mode: AutopilotMode) => {
    setAutopilotMode(mode);
    localStorage.setItem("ai_autopilot_mode", mode);
    
    // Clear any active countdown if switching away
    if (mode !== "copilot_sentinel" && countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      setPendingCountdown(null);
      setPendingCountdownProposal(null);
    }

    appendAutopilotLog({
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      actionType: "sentinel_scan",
      title: `Autopilot Mode: ${mode === "full_autonomous" ? "Full Autonomous (Hands-Free)" : mode === "copilot_sentinel" ? "Co-Pilot Sentinel" : "Manual Review"}`,
      description: mode === "full_autonomous" 
        ? "AI will proactively detect issues and apply optimizations without prompt requests."
        : mode === "copilot_sentinel"
          ? "AI will detect issues and auto-commit after a 10-second countdown."
          : "AI is on manual standby.",
      badge: mode === "full_autonomous" ? "Autonomous" : mode === "copilot_sentinel" ? "Co-Pilot" : "Standby",
      affectedCount: 0
    });

    onAddNotification(
      "Autopilot Mode Updated",
      mode === "full_autonomous"
        ? "Autonomous Mode Active: AI will continuously optimize and self-heal your schedule."
        : mode === "copilot_sentinel"
          ? "Co-Pilot Active: AI will alert you with countdown auto-commits."
          : "Manual Mode: Schedule will only change when explicitly requested.",
      "success"
    );
  };

  // Trigger Schedule Generation API
  const generateProposal = async (modeToUse = activeMode, promptToUse = customPrompt): Promise<AIScheduleProposal | null> => {
    try {
      const res = await fetch("/api/coach/ai-schedule-controller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: modeToUse,
          prompt: promptToUse,
          goals,
          events,
          availability,
          energyProfile,
          currentDate: new Date().toISOString()
        })
      });

      if (!res.ok) {
        throw new Error(`API error ${res.status}`);
      }

      const proposal: AIScheduleProposal = await res.json();
      return proposal;
    } catch (err: any) {
      console.warn("AI Schedule Controller Proposal API issue:", err);
      return null;
    }
  };

  // Manual Trigger
  const handleGenerateSchedule = async (modeToUse = activeMode, promptToUse = customPrompt) => {
    setIsGenerating(true);
    setHasApplied(false);

    try {
      const proposal = await generateProposal(modeToUse, promptToUse);
      if (proposal) {
        setCurrentProposal(proposal);
        onAddNotification(
          "AI Schedule Generated",
          proposal.summary || "AI calculated an optimized, collision-free schedule proposal!",
          "success"
        );
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyChanges = (proposalToApply: AIScheduleProposal | null = currentProposal) => {
    if (!proposalToApply) return;
    onApplySchedule(
      proposalToApply.proposedEvents,
      `Applied ${proposalToApply.stats.sessionsAdded} new sessions, ${proposalToApply.stats.sessionsMoved} shifts with zero collisions!`
    );
    setHasApplied(true);
    setCurrentProposal(null);
    setPendingCountdown(null);
    setPendingCountdownProposal(null);

    appendAutopilotLog({
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      actionType: "deconflict",
      title: "Schedule Changes Committed",
      description: `Committed ${proposalToApply.stats.sessionsAdded} added and ${proposalToApply.stats.sessionsMoved} shifted sessions.`,
      badge: "Applied",
      affectedCount: proposalToApply.stats.sessionsAdded + proposalToApply.stats.sessionsMoved
    });

    onAddNotification(
      "Calendar Updated Successfully! ✨",
      `Committed ${proposalToApply.stats.sessionsAdded} added and ${proposalToApply.stats.sessionsMoved} shifted sessions.`,
      "success",
      {
        label: "View Calendar",
        onClick: () => onNavigateToCalendar()
      }
    );
  };

  // -------------------------------------------------------------
  // DYNAMIC AUTONOMOUS WATCHDOG EFFECT
  // Scans schedule discrepancies continuously without user requests
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isSentinelActive || autopilotMode === "manual") return;

    const runAutonomousSentinelCheck = async () => {
      if (isExecutingAutonomousRef.current || isGenerating) return;

      setRadarPulse((p) => p + 1);
      setLastScanTime(new Date());

      const hasCollisions = detectedCollisions.length > 0;
      const hasPastOverdue = pastIncompleteEvents.length > 0;
      const hasUnscheduledGoals = unmetGoals.length > 0;

      // If everything is already in perfect harmony, don't disrupt
      if (!hasCollisions && !hasPastOverdue && !hasUnscheduledGoals) {
        return;
      }

      // We have a discrepancy that AI should autonomously fix!
      isExecutingAutonomousRef.current = true;

      try {
        let selectedAutoMode: "deconflict_and_heal" | "catch_up_rebalance" | "auto_plan_goals" = "auto_plan_goals";
        let autoReason = "";

        if (hasCollisions) {
          selectedAutoMode = "deconflict_and_heal";
          autoReason = `Detected ${detectedCollisions.length} overlapping collision(s). Deconflicted dynamically.`;
        } else if (hasPastOverdue) {
          selectedAutoMode = "catch_up_rebalance";
          autoReason = `Detected ${pastIncompleteEvents.length} missed/overdue session(s). Rebalanced to upcoming slots.`;
        } else if (hasUnscheduledGoals) {
          selectedAutoMode = "auto_plan_goals";
          autoReason = `Detected ${unmetGoals.length} goal(s) below weekly target. Auto-planned open slots.`;
        }

        const proposal = await generateProposal(selectedAutoMode, autoReason);

        if (!proposal || (proposal.stats.sessionsAdded === 0 && proposal.stats.sessionsMoved === 0)) {
          isExecutingAutonomousRef.current = false;
          return;
        }

        if (autopilotMode === "full_autonomous") {
          // FULL AUTONOMOUS MODE: Apply dynamically without asking!
          onApplySchedule(
            proposal.proposedEvents,
            `🤖 Autopilot Dynamic Action: ${autoReason}`
          );

          appendAutopilotLog({
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            actionType: hasCollisions ? "deconflict" : hasPastOverdue ? "rebalance_overdue" : "auto_plan_goal",
            title: hasCollisions ? "Autonomous Collision Deconfliction" : hasPastOverdue ? "Autonomous Catch-Up Rebalance" : "Autonomous Goal Auto-Planning",
            description: autoReason,
            badge: "⚡ Hands-Free Auto-Fixed",
            affectedCount: proposal.stats.sessionsAdded + proposal.stats.sessionsMoved
          });

          onAddNotification(
            "🤖 AI Autopilot Self-Healed Schedule",
            `${autoReason} (${proposal.stats.sessionsAdded} added, ${proposal.stats.sessionsMoved} shifted).`,
            "motivation"
          );
        } else if (autopilotMode === "copilot_sentinel") {
          // CO-PILOT SENTINEL MODE: 10-Second countdown auto-commit
          setPendingCountdownProposal(proposal);
          setPendingCountdown(10);
        }
      } catch (err) {
        console.warn("Sentinel autonomous check error:", err);
      } finally {
        isExecutingAutonomousRef.current = false;
      }
    };

    // Run first check 2 seconds after mounting, then pulse every 15 seconds
    const initialTimer = setTimeout(() => {
      runAutonomousSentinelCheck();
    }, 2000);

    const interval = setInterval(() => {
      runAutonomousSentinelCheck();
    }, 15000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [
    isSentinelActive, 
    autopilotMode, 
    detectedCollisions.length, 
    pastIncompleteEvents.length, 
    unmetGoals.length, 
    events, 
    goals
  ]);

  // Countdown timer for Co-Pilot Sentinel mode
  useEffect(() => {
    if (pendingCountdown === null) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      return;
    }

    if (pendingCountdown <= 0) {
      // Countdown reached 0: Auto-commit!
      if (pendingCountdownProposal) {
        handleApplyChanges(pendingCountdownProposal);
      }
      setPendingCountdown(null);
      setPendingCountdownProposal(null);
      return;
    }

    countdownTimerRef.current = setInterval(() => {
      setPendingCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [pendingCountdown, pendingCountdownProposal]);

  // Simulator helper: Let the user test dynamic AI reaction with 1 click
  const handleSimulateDisruption = () => {
    if (events.length === 0) {
      onAddNotification("Simulation Info", "Create at least one session to test collision deconfliction.", "warning");
      return;
    }
    const target = events[0];
    const overlappingStart = target.start;
    const overlappingEnd = target.end;
    const simulatedEvent: CalendarEvent = {
      id: `sim_disrupt_${Date.now()}`,
      title: "⚡ Urgent Client Meeting (Simulation)",
      type: "personal",
      start: overlappingStart,
      end: overlappingEnd,
      completed: false,
      notes: "Simulated collision to test AI Autopilot dynamic self-healing."
    };

    onApplySchedule([simulatedEvent, ...events], "Injected simulated collision. Watch AI Autopilot react dynamically!");
    
    appendAutopilotLog({
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      actionType: "sentinel_scan",
      title: "Disruption Injected (Simulation)",
      description: "Added conflicting meeting. AI Sentinel will dynamically deconflict within seconds.",
      badge: "Simulation",
      affectedCount: 1
    });

    onAddNotification(
      "Simulated Collision Injected! ⚡",
      "Watch the Autonomous Sentinel detect and deconflict this block without manual commands.",
      "warning"
    );
  };

  const filteredDiff = (currentProposal?.diff || []).filter((item) => {
    if (diffFilter === "all") return true;
    return item.type === diffFilter;
  });

  const quickPromptChips = [
    { label: "🚀 Auto-plan all unscheduled goal hours", mode: "auto_plan_goals" as const, prompt: "Auto-plan all unscheduled goal hours across open slots" },
    { label: "🩹 Deconflict overlaps & add buffers", mode: "deconflict_and_heal" as const, prompt: "Deconflict all overlapping calendar events and insert 15-minute buffers" },
    { label: "🔄 Rebalance missed sessions into open slots", mode: "catch_up_rebalance" as const, prompt: "Mid-week catchup: reschedule past overdue sessions into upcoming open slots" },
    { label: "🌅 Shift high-focus tasks to morning peak", mode: "energy_chronotype_align" as const, prompt: "Shift all deep focus sessions to morning peak hours and avoid the 1-3 PM slump" },
    { label: "🦥 Clear Friday afternoon", mode: "custom_directive" as const, prompt: "Clear my Friday afternoon schedule and move sessions into Thursday or Saturday" }
  ];

  return (
    <div className="space-y-6" id="ai_schedule_controller_view">
      
      {/* 1. TOP SEGMENTED TOGGLE: GOALS TRACKER ⇄ AI CONTROLLER SCHEDULE */}
      <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* The Core Toggle Switch */}
        <div className="flex items-center p-1.5 bg-slate-950/80 rounded-xl border border-white/10 w-full sm:w-auto shadow-inner">
          <button
            type="button"
            id="toggle_to_goals_view_btn"
            onClick={onNavigateToGoals}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer text-slate-400 hover:text-white hover:bg-white/5"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Goals & Constraints</span>
            <span className="text-[10px] bg-white/10 text-slate-300 px-1.5 py-0.5 rounded-full font-semibold">
              {goals.length}
            </span>
          </button>

          <button
            type="button"
            id="toggle_ai_schedule_active_btn"
            className="flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30"
          >
            <Bot className="w-4 h-4 text-yellow-300 animate-pulse" />
            <span>AI Schedule Controller</span>
            <span className="text-[9px] bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider">
              Autopilot
            </span>
          </button>
        </div>

        {/* Quick Return to Calendar Button */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => onNavigateToCalendar()}
            className="text-xs px-3.5 py-2 rounded-xl font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition flex items-center gap-2 cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span>View Calendar Grid</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

      </div>

      {/* 2. DYNAMIC AUTOPILOT COCKPIT & LIVE SENTINEL RADAR */}
      <div className="bg-gradient-to-br from-indigo-950/70 via-slate-900/90 to-purple-950/60 border border-indigo-500/30 p-6 rounded-3xl text-white shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            
            {/* Live Sentinel Status Badge */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 bg-slate-950/80 border border-indigo-400/30 rounded-full text-xs font-bold shadow-inner">
              <span className="relative flex h-2.5 w-2.5">
                {isSentinelActive && autopilotMode !== "manual" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  autopilotMode === "manual" ? "bg-slate-400" : isSentinelActive ? "bg-emerald-400" : "bg-amber-400"
                }`}></span>
              </span>
              
              <span className="text-white">
                {autopilotMode === "full_autonomous" ? "Autonomous Sentinel: Active" : autopilotMode === "copilot_sentinel" ? "Co-Pilot Sentinel: Active" : "Manual Mode: Standby"}
              </span>

              <span className="text-[10px] text-indigo-300 border-l border-white/20 pl-2">
                Pulse #{radarPulse} • {lastScanTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <span>Autonomous AI Schedule Control</span>
              {autopilotMode === "full_autonomous" && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                  <span>Hands-Free Self-Driving</span>
                </span>
              )}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              When in <strong className="text-emerald-400">Full Autonomous</strong> mode, AI continuously protects your schedule: it automatically deconflicts overlaps, reschedules missed sessions, and books your weekly goal targets without waiting for you to ask.
            </p>

            {/* Dynamic Autopilot Level Selector */}
            <div className="pt-1 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Autopilot Level:</span>
              
              <button
                type="button"
                id="select_full_autonomous_mode"
                onClick={() => handleAutopilotModeChange("full_autonomous")}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  autopilotMode === "full_autonomous"
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                    : "bg-slate-950/70 text-slate-300 hover:text-white border border-white/10"
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-yellow-300" />
                <span>🚀 Full Self-Driving</span>
              </button>

              <button
                type="button"
                id="select_copilot_sentinel_mode"
                onClick={() => handleAutopilotModeChange("copilot_sentinel")}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  autopilotMode === "copilot_sentinel"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "bg-slate-950/70 text-slate-300 hover:text-white border border-white/10"
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-indigo-300" />
                <span>⏱️ Co-Pilot (10s Countdown)</span>
              </button>

              <button
                type="button"
                id="select_manual_review_mode"
                onClick={() => handleAutopilotModeChange("manual")}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  autopilotMode === "manual"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                    : "bg-slate-950/70 text-slate-300 hover:text-white border border-white/10"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-300" />
                <span>✋ Manual Review</span>
              </button>
            </div>
          </div>

          {/* Quick Schedule Health Counters & Test Disruption Button */}
          <div className="flex flex-col gap-3 w-full lg:w-auto shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-900/80 border border-white/10 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Active Goals</span>
                <span className="text-base font-bold text-white">{activeGoals.length}</span>
                <span className="text-[10px] text-indigo-300 block">{unmetGoals.length === 0 ? "100% planned" : `${unmetGoals.length} need slots`}</span>
              </div>

              <div className="bg-slate-900/80 border border-white/10 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Scheduled</span>
                <span className="text-base font-bold text-emerald-400">{totalScheduledSessions}</span>
                <span className="text-[10px] text-slate-400 block">{completedSessions} completed</span>
              </div>

              <div className="bg-slate-900/80 border border-white/10 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Overdue Missed</span>
                <span className={`text-base font-bold ${pastIncompleteEvents.length > 0 ? "text-amber-400" : "text-slate-400"}`}>
                  {pastIncompleteEvents.length}
                </span>
                <span className="text-[10px] text-slate-400 block">{pastIncompleteEvents.length === 0 ? "0 backlog" : "auto-rebalancing"}</span>
              </div>

              <div className="bg-slate-900/80 border border-white/10 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Collisions</span>
                <span className={`text-base font-bold ${detectedCollisions.length > 0 ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>
                  {detectedCollisions.length}
                </span>
                <span className="text-[10px] text-slate-400 block">{detectedCollisions.length === 0 ? "zero overlaps" : "resolving"}</span>
              </div>
            </div>

            {/* Test Simulation Button */}
            <button
              type="button"
              id="test_simulate_disruption_btn"
              onClick={handleSimulateDisruption}
              className="text-xs py-2 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-amber-200 rounded-xl font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              title="Inject a simulated collision to watch AI Autopilot immediately self-heal in real time!"
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Test AI Reaction: Simulate Overlap Disruption</span>
            </button>
          </div>
        </div>

      </div>

      {/* 2.5 CO-PILOT 10-SECOND COUNTDOWN AUTO-APPLY BANNER */}
      {pendingCountdown !== null && pendingCountdownProposal && (
        <div className="bg-gradient-to-r from-amber-600/30 via-indigo-900/50 to-emerald-600/30 border-2 border-amber-500/40 p-5 rounded-3xl shadow-2xl backdrop-blur-md animate-in slide-in-from-top duration-300 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Co-Pilot Auto-Optimizing: Applying in {pendingCountdown}s</span>
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                  {pendingCountdownProposal.stats.sessionsAdded} added • {pendingCountdownProposal.stats.sessionsMoved} shifted
                </span>
              </div>
              <p className="text-xs text-slate-200">
                {pendingCountdownProposal.summary}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPendingCountdown(null);
                  setPendingCountdownProposal(null);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-900/60 border border-white/10 transition cursor-pointer"
              >
                Pause / Dismiss
              </button>

              <button
                type="button"
                onClick={() => handleApplyChanges(pendingCountdownProposal)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/30 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Apply Immediately ({pendingCountdown}s)</span>
              </button>
            </div>
          </div>

          {/* Countdown Progress Bar */}
          <div className="w-full bg-slate-950/80 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-amber-400 h-full transition-all duration-1000 ease-linear"
              style={{ width: `${(pendingCountdown / 10) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 3. 1-CLICK AUTONOMOUS ACTION CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Action 1: Auto-Plan Entire Week */}
        <div 
          onClick={() => {
            setActiveMode("auto_plan_goals");
            handleGenerateSchedule("auto_plan_goals", "Auto-plan all unscheduled goal hours across open slots");
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none group relative overflow-hidden flex flex-col justify-between ${
            activeMode === "auto_plan_goals"
              ? "bg-indigo-900/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10"
              : "bg-slate-900/50 border-white/10 hover:border-indigo-400/30 hover:bg-slate-900/80"
          }`}
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 group-hover:scale-110 transition-transform">
              <Wand2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
              🚀 Auto-Plan Entire Week
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Scans all active goal targets and books open calendar slots in your availability with zero overlaps.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-bold text-indigo-400">
            <span>Run Auto-Planner</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Action 2: Deconflict & Auto-Heal */}
        <div 
          onClick={() => {
            setActiveMode("deconflict_and_heal");
            handleGenerateSchedule("deconflict_and_heal", "Deconflict all calendar events and insert 15-minute buffers");
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none group relative overflow-hidden flex flex-col justify-between ${
            activeMode === "deconflict_and_heal"
              ? "bg-indigo-900/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10"
              : "bg-slate-900/50 border-white/10 hover:border-emerald-400/30 hover:bg-slate-900/80"
          }`}
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
              🩹 Auto-Heal & Deconflict
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Fixes double-bookings, resolves collisions, and inserts 15-minute recovery buffers between deep focus blocks.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-bold text-emerald-400">
            <span>Deconflict Calendar</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Action 3: Catch-Up Rebalancer */}
        <div 
          onClick={() => {
            setActiveMode("catch_up_rebalance");
            handleGenerateSchedule("catch_up_rebalance", "Reschedule past incomplete sessions evenly across remaining days");
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none group relative overflow-hidden flex flex-col justify-between ${
            activeMode === "catch_up_rebalance"
              ? "bg-indigo-900/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10"
              : "bg-slate-900/50 border-white/10 hover:border-amber-400/30 hover:bg-slate-900/80"
          }`}
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 group-hover:scale-110 transition-transform">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
              🔄 Catch-Up Rebalance
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Missed a session earlier this week? AI redistributes overdue focus hours without overloading any single day.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-bold text-amber-400">
            <span>Rebalance Overdue</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Action 4: Peak Energy & Chronotype Alignment */}
        <div 
          onClick={() => {
            setActiveMode("energy_chronotype_align");
            handleGenerateSchedule("energy_chronotype_align", "Align schedule with chronotype peak hours and slump protection");
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer select-none group relative overflow-hidden flex flex-col justify-between ${
            activeMode === "energy_chronotype_align"
              ? "bg-indigo-900/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10"
              : "bg-slate-900/50 border-white/10 hover:border-purple-400/30 hover:bg-slate-900/80"
          }`}
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30 group-hover:scale-110 transition-transform">
              <Brain className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
              ⚡ Bio-Energy Alignment
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Maps high cognitive load work into your {energyProfile?.chronotype?.replace("_", " ") || "morning"} peak and shields your slump window.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-bold text-purple-400">
            <span>Align to Chronotype</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

      </div>

      {/* 4. NATURAL LANGUAGE DIRECTIVE COMMAND BAR */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 p-5 rounded-3xl shadow-xl space-y-4">
        
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Natural Language Schedule Directives</h3>
              <p className="text-xs text-slate-400">Or type custom instructions in plain English to shape your schedule.</p>
            </div>
          </div>
          
          <span className="text-[11px] text-slate-400 hidden sm:inline-flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5" />
            <span>Autonomous Directive Mode</span>
          </span>
        </div>

        {/* Input Field */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (!customPrompt.trim() && !isGenerating) {
              handleGenerateSchedule("auto_plan_goals", "Auto-plan all unscheduled goal hours across open slots");
            } else if (!isGenerating) {
              handleGenerateSchedule("custom_directive", customPrompt);
            }
          }}
          className="flex flex-col sm:flex-row items-center gap-2.5"
        >
          <div className="relative flex-1 w-full">
            <input
              type="text"
              id="ai_schedule_prompt_input"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. 'Pack my coding into Tuesday & Thursday mornings, keep Friday light, and add 20m breaks'..."
              className="w-full bg-slate-950/80 border border-white/15 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-2xl px-4 py-3 text-xs sm:text-sm text-white placeholder-slate-500 transition outline-hidden"
              disabled={isGenerating}
            />
            {customPrompt && (
              <button
                type="button"
                onClick={() => setCustomPrompt("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="submit"
            id="run_ai_schedule_controller_btn"
            disabled={isGenerating}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>AI Generating Plan...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span>Generate Schedule</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] text-slate-400 shrink-0 font-medium">Quick suggestions:</span>
          {quickPromptChips.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setCustomPrompt(chip.prompt);
                setActiveMode(chip.mode);
                handleGenerateSchedule(chip.mode, chip.prompt);
              }}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition shrink-0 cursor-pointer"
            >
              {chip.label}
            </button>
          ))}
        </div>

      </div>

      {/* 5. LIVE AUTONOMOUS ACTION STREAM / AUDIT FEED */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 p-5 rounded-3xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Live Autonomous Action Stream</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
              Real-Time Audit
            </span>
          </div>
          
          <button
            type="button"
            onClick={() => {
              setAutopilotLog([]);
              localStorage.removeItem("ai_autopilot_log");
            }}
            className="text-[11px] text-slate-400 hover:text-white transition cursor-pointer"
          >
            Clear Log
          </button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {autopilotLog.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              No autonomous actions logged yet. Watchdog is monitoring in background.
            </div>
          ) : (
            autopilotLog.map((log) => (
              <div 
                key={log.id} 
                className="p-3 bg-slate-950/70 border border-white/5 rounded-xl flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{log.title}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                        {log.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{log.description}</p>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                  {log.timestamp}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 6. PROPOSAL REVIEW & INTERACTIVE SCHEDULE DIFF (IF GENERATED) */}
      {currentProposal && (
        <div className="bg-slate-900/90 border border-indigo-500/30 p-6 rounded-3xl shadow-2xl space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
          
          {/* Header & Executive Summary */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>{currentProposal.title}</span>
                </h3>
                {currentProposal.aiGenerated && (
                  <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full font-bold">
                    Gemini Intelligence
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                {currentProposal.summary}
              </p>
            </div>

            {/* Apply Schedule Action CTA */}
            <div className="flex items-center gap-3 w-full lg:w-auto shrink-0 justify-end">
              <button
                type="button"
                id="discard_ai_proposal_btn"
                onClick={() => setCurrentProposal(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              >
                Discard
              </button>

              <button
                type="button"
                id="apply_ai_schedule_proposal_btn"
                onClick={() => handleApplyChanges(currentProposal)}
                disabled={hasApplied}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg ${
                  hasApplied
                    ? "bg-emerald-600 text-white shadow-emerald-600/30"
                    : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/25 active:scale-95"
                }`}
              >
                {hasApplied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Applied to Calendar!</span>
                  </>
                ) : (
                  <>
                    <CalendarCheck className="w-4 h-4" />
                    <span>Apply Changes to Calendar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* AI Reasoning Points */}
          {currentProposal.reasoning && currentProposal.reasoning.length > 0 && (
            <div className="bg-indigo-950/30 border border-indigo-500/20 p-4 rounded-2xl space-y-2">
              <span className="text-[11px] uppercase font-bold text-indigo-300 tracking-wider flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                <span>AI Scheduling Rationales & Logic</span>
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-300">
                {currentProposal.reasoning.map((r, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-900/50 p-2.5 rounded-xl border border-white/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diff Stats & Filter Switcher */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-300">Schedule Changes:</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                +{currentProposal.stats.sessionsAdded} Added
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                {currentProposal.stats.sessionsMoved} Shifted
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                {currentProposal.stats.totalHoursScheduled}h Total Scheduled
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setDiffFilter("all")}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  diffFilter === "all" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                All ({currentProposal.diff.length})
              </button>
              <button
                type="button"
                onClick={() => setDiffFilter("added")}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  diffFilter === "added" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400 hover:text-white"
                }`}
              >
                Added ({currentProposal.diff.filter(d => d.type === "added").length})
              </button>
              <button
                type="button"
                onClick={() => setDiffFilter("moved")}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  diffFilter === "moved" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-white"
                }`}
              >
                Moved ({currentProposal.diff.filter(d => d.type === "moved").length})
              </button>
            </div>
          </div>

          {/* Detailed Diff Cards Grid */}
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {filteredDiff.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/50 rounded-2xl border border-white/5">
                No items match the selected filter.
              </div>
            ) : (
              filteredDiff.map((diffItem, i) => {
                const newStartDate = diffItem.newStart ? new Date(diffItem.newStart) : null;
                const newEndDate = diffItem.newEnd ? new Date(diffItem.newEnd) : null;
                const oldStartDate = diffItem.oldStart ? new Date(diffItem.oldStart) : null;
                const oldEndDate = diffItem.oldEnd ? new Date(diffItem.oldEnd) : null;

                const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const formatDate = (d: Date) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

                return (
                  <div
                    key={diffItem.id || i}
                    className="p-3.5 bg-slate-950/70 border border-white/10 hover:border-white/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        {diffItem.type === "added" && (
                          <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs font-bold">
                            +
                          </span>
                        )}
                        {diffItem.type === "moved" && (
                          <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-xs font-bold">
                            ⇄
                          </span>
                        )}
                        {diffItem.type === "retained" && (
                          <span className="w-6 h-6 rounded-lg bg-slate-500/20 text-slate-400 border border-white/10 flex items-center justify-center text-xs font-bold">
                            ✓
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-xs sm:text-sm text-white font-bold truncate">
                            {diffItem.title}
                          </strong>
                          {diffItem.goalName && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-medium">
                              {diffItem.goalName}
                            </span>
                          )}
                          {diffItem.energyBadge && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-medium">
                              {diffItem.energyBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{diffItem.reason}</p>
                      </div>
                    </div>

                    {/* Time Slot Diff View */}
                    <div className="shrink-0 text-left sm:text-right text-xs">
                      {diffItem.type === "moved" && oldStartDate && oldEndDate && newStartDate && newEndDate && (
                        <div className="space-y-0.5">
                          <div className="text-[11px] text-slate-500 line-through">
                            {formatDate(oldStartDate)} • {formatTime(oldStartDate)} - {formatTime(oldEndDate)}
                          </div>
                          <div className="text-xs font-bold text-amber-300 flex items-center sm:justify-end gap-1">
                            <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                            <span>{formatDate(newStartDate)} • {formatTime(newStartDate)} - {formatTime(newEndDate)}</span>
                          </div>
                        </div>
                      )}

                      {diffItem.type === "added" && newStartDate && newEndDate && (
                        <div className="text-xs font-bold text-emerald-400">
                          {formatDate(newStartDate)} • {formatTime(newStartDate)} - {formatTime(newEndDate)}
                        </div>
                      )}

                      {diffItem.type === "retained" && newStartDate && newEndDate && (
                        <div className="text-xs text-slate-400">
                          {formatDate(newStartDate)} • {formatTime(newStartDate)} - {formatTime(newEndDate)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Call to Action if not yet applied */}
          {!hasApplied && (
            <div className="pt-2 flex items-center justify-between border-t border-white/10">
              <span className="text-xs text-slate-400">
                Ready to commit these adjustments to your schedule?
              </span>
              <button
                type="button"
                onClick={() => handleApplyChanges(currentProposal)}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span>Apply All Changes</span>
              </button>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
