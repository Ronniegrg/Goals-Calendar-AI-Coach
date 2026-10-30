import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldAlert, 
  Sparkles, 
  AlertTriangle, 
  Flame, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Zap, 
  ArrowRight, 
  X, 
  RotateCcw, 
  Brain, 
  Bot, 
  Calendar,
  Volume2,
  VolumeX,
  ExternalLink
} from "lucide-react";
import { 
  Goal, 
  CalendarEvent, 
  UserEnergyProfile, 
  DailyBurnoutLimits, 
  SentinelSignal, 
  SentinelTelemetry, 
  SentinelActionDirective 
} from "../types";
import { evaluateGoalSentinel } from "../lib/goalSentinelEngine";

interface ProactiveGoalSentinelProps {
  goals: Goal[];
  events: CalendarEvent[];
  energyProfile: UserEnergyProfile;
  burnoutLimits: DailyBurnoutLimits;
  onAutoScheduleGoal: (goalId: string) => void;
  onInsertBuffer: (eventId: string) => void;
  onShiftToPeakWindow: (eventId: string) => void;
  onLaunchFocusTimer: (goalId?: string, durationMinutes?: number, title?: string) => void;
  onOpenStreakShield: () => void;
  onTriggerRestDay: () => void;
  onOpenCoachWithQuery: (query: string) => void;
  onNavigateToCalendar: () => void;
  onNotify: (title: string, message: string, type: "success" | "warning" | "sync" | "upcoming" | "motivation") => void;
}

export default function ProactiveGoalSentinel({
  goals,
  events,
  energyProfile,
  burnoutLimits,
  onAutoScheduleGoal,
  onInsertBuffer,
  onShiftToPeakWindow,
  onLaunchFocusTimer,
  onOpenStreakShield,
  onTriggerRestDay,
  onOpenCoachWithQuery,
  onNavigateToCalendar,
  onNotify
}: ProactiveGoalSentinelProps) {
  // Evaluated telemetry state
  const [activeSignalIndex, setActiveSignalIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sentinel_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [dismissedSignalIds, setDismissedSignalIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("sentinel_dismissed_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [aiCustomAdvice, setAiCustomAdvice] = useState<string | null>(null);

  // Compute live telemetry instantly whenever goals, events, or profiles change
  const telemetry: SentinelTelemetry = useMemo(() => {
    return evaluateGoalSentinel({
      goals,
      events,
      energyProfile,
      burnoutLimits
    });
  }, [goals, events, energyProfile, burnoutLimits]);

  // Filter out temporarily dismissed signals
  const visibleSignals = useMemo(() => {
    const list = telemetry.signals.filter(s => !dismissedSignalIds.includes(s.id));
    return list.length > 0 ? list : telemetry.signals; // fallback to showing primary if all dismissed
  }, [telemetry.signals, dismissedSignalIds]);

  // Keep index within bounds
  useEffect(() => {
    if (activeSignalIndex >= visibleSignals.length) {
      setActiveSignalIndex(0);
    }
  }, [visibleSignals.length, activeSignalIndex]);

  const currentSignal: SentinelSignal | undefined = visibleSignals[activeSignalIndex] || visibleSignals[0];

  const handleNext = () => {
    if (visibleSignals.length <= 1) return;
    setActiveSignalIndex((prev) => (prev + 1) % visibleSignals.length);
  };

  const handlePrev = () => {
    if (visibleSignals.length <= 1) return;
    setActiveSignalIndex((prev) => (prev - 1 + visibleSignals.length) % visibleSignals.length);
  };

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem("sentinel_collapsed", String(next));
    } catch {}
  };

  const handleDismissCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSignal) return;
    const nextDismissed = [...dismissedSignalIds, currentSignal.id];
    setDismissedSignalIds(nextDismissed);
    try {
      localStorage.setItem("sentinel_dismissed_ids", JSON.stringify(nextDismissed));
    } catch {}
    onNotify("Sentinel Alert Snoozed", `Snoozed alert: "${currentSignal.headline}"`, "sync");
  };

  const handleResetDismissed = () => {
    setDismissedSignalIds([]);
    try {
      localStorage.removeItem("sentinel_dismissed_ids");
    } catch {}
    setActiveSignalIndex(0);
    onNotify("Sentinel Reset", "Restored all active goal monitoring signals.", "success");
  };

  // Execute Action Directive
  const handleExecuteAction = (action?: SentinelActionDirective) => {
    if (!action) return;

    switch (action.type) {
      case "auto_schedule":
        if (action.goalId) {
          onAutoScheduleGoal(action.goalId);
        } else {
          onNotify("Auto-Schedule", "Please select a specific goal to schedule.", "warning");
        }
        break;

      case "shift_to_peak":
        if (action.eventId) {
          onShiftToPeakWindow(action.eventId);
        }
        break;

      case "insert_buffer":
        if (action.eventId) {
          onInsertBuffer(action.eventId);
        }
        break;

      case "launch_timer":
        onLaunchFocusTimer(action.goalId, action.durationMinutes || 25, action.goalName);
        break;

      case "streak_shield":
        onOpenStreakShield();
        break;

      case "trigger_rest_day":
        onTriggerRestDay();
        break;

      case "open_coach":
        if (action.coachQuery) {
          onOpenCoachWithQuery(action.coachQuery);
        } else {
          onOpenCoachWithQuery("How can I optimize my goals and schedule for the rest of this week?");
        }
        break;

      case "view_schedule":
        onNavigateToCalendar();
        break;

      default:
        break;
    }
  };

  // Run dynamic Gemini AI Sentinel deep scan
  const handleRunAiDeepScan = async () => {
    setIsAiScanning(true);
    setAiCustomAdvice(null);
    try {
      const res = await fetch("/api/sentinel/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goals,
          events,
          energyProfile,
          burnoutLimits
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.personalizedAdvice) {
          setAiCustomAdvice(data.personalizedAdvice);
          onNotify("✨ AI Sentinel Deep Scan Complete", "Personalized habit advice generated from your live schedule.", "motivation");
        } else if (data.signals && data.signals.length > 0) {
          onNotify("✨ Sentinel Scan Updated", "Analyzed schedule against your circadian peaks.", "success");
        }
      } else {
        // Fallback local synthesis
        setAiCustomAdvice(`Sentinel Intelligence: Maintain 15-minute buffers between technical blocks. Your ${energyProfile.chronotype.replace('_', ' ')} rhythm responds best to deep work before 12:30 PM.`);
      }
    } catch {
      setAiCustomAdvice(`Sentinel Local Heuristics: Goal momentum is healthy. Prioritize your highest priority objective during tomorrow's peak energy window.`);
    } finally {
      setIsAiScanning(false);
    }
  };

  if (!currentSignal) return null;

  // Severity-based styling palettes
  const severityStyles = {
    urgent: {
      cardBg: "bg-gradient-to-r from-rose-950/80 via-slate-900/95 to-slate-900/95 dark:from-rose-950/60 dark:via-[#101322] dark:to-[#0d0f1a]",
      border: "border-rose-500/40 hover:border-rose-500/60",
      glow: "shadow-lg shadow-rose-950/20",
      badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      accentText: "text-rose-400",
      primaryBtn: "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40",
      pulseColor: "bg-rose-500"
    },
    warning: {
      cardBg: "bg-gradient-to-r from-amber-950/70 via-slate-900/95 to-slate-900/95 dark:from-amber-950/50 dark:via-[#101322] dark:to-[#0d0f1a]",
      border: "border-amber-500/40 hover:border-amber-500/60",
      glow: "shadow-lg shadow-amber-950/20",
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      accentText: "text-amber-400",
      primaryBtn: "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40",
      pulseColor: "bg-amber-400"
    },
    insight: {
      cardBg: "bg-gradient-to-r from-indigo-950/70 via-slate-900/95 to-slate-900/95 dark:from-indigo-950/50 dark:via-[#101322] dark:to-[#0d0f1a]",
      border: "border-indigo-500/40 hover:border-indigo-500/60",
      glow: "shadow-lg shadow-indigo-950/20",
      badgeBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
      accentText: "text-indigo-400",
      primaryBtn: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40",
      pulseColor: "bg-indigo-400"
    },
    celebration: {
      cardBg: "bg-gradient-to-r from-emerald-950/70 via-slate-900/95 to-slate-900/95 dark:from-emerald-950/50 dark:via-[#101322] dark:to-[#0d0f1a]",
      border: "border-emerald-500/40 hover:border-emerald-500/60",
      glow: "shadow-lg shadow-emerald-950/20",
      badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      accentText: "text-emerald-400",
      primaryBtn: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40",
      pulseColor: "bg-emerald-400"
    }
  };

  const style = severityStyles[currentSignal.severity] || severityStyles.insight;

  return (
    <div 
      id="live_proactive_goal_sentinel_banner"
      className={`relative w-full rounded-2xl border transition-all duration-300 backdrop-blur-md overflow-hidden ${style.border} ${style.cardBg} ${style.glow}`}
    >
      {/* Top subtle highlight line */}
      <div className={`h-0.5 w-full ${style.primaryBtn}`} />

      {/* COMPACT MINIMALIST TICKER BAR (When user collapses) */}
      {isCollapsed ? (
        <div 
          onClick={toggleCollapse}
          className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-white/5 transition"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${style.pulseColor}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${style.pulseColor}`} />
            </span>

            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-white/5 text-slate-300 border-white/10 shrink-0">
              Sentinel Active
            </span>

            <span className="text-xs font-bold text-white truncate">
              {currentSignal.icon} {currentSignal.headline}
            </span>

            <span className="hidden sm:inline text-xs text-slate-400 truncate">
              — {currentSignal.message}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick 1-click directive right in compact mode */}
            {currentSignal.primaryAction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExecuteAction(currentSignal.primaryAction);
                }}
                className={`text-[11px] font-bold px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${style.primaryBtn}`}
              >
                <span>{currentSignal.primaryAction.label}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-white transition"
              title="Expand Sentinel Banner"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* EXPANDED FULL INTELLIGENCE COCKPIT */
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Header Row: Telemetry Chips & Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Left: Sentinel Status & Telemetry Indicators */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-white/10 text-white font-bold shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${style.pulseColor}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${style.pulseColor}`} />
                </span>
                <span className="text-[10px] tracking-wider uppercase font-black text-indigo-300">Live AI Sentinel</span>
              </div>

              {/* Tag / Category Badge */}
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${style.badgeBg}`}>
                {currentSignal.tag}
              </span>

              {/* Goal Pacing Chip */}
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-300">
                <span className="text-slate-400">Goals on Pace:</span>
                <span className={`font-bold ${telemetry.activeGoalHealth.laggingGoals === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {telemetry.activeGoalHealth.onPaceGoals}/{telemetry.activeGoalHealth.totalGoals}
                </span>
              </div>

              {/* Cognitive Load Chip */}
              <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-300">
                <span className="text-slate-400">Load:</span>
                <span className={`font-bold ${
                  telemetry.cognitiveLoadToday.burnoutLevel === "burnout_risk" ? "text-rose-400" :
                  telemetry.cognitiveLoadToday.burnoutLevel === "elevated" ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {telemetry.cognitiveLoadToday.scheduledHours}h / {telemetry.cognitiveLoadToday.maxHours}h
                </span>
              </div>

              {/* Circadian Zone Chip */}
              <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-300">
                <Zap className="w-3 h-3 text-yellow-400" />
                <span className="text-slate-300 font-medium">{telemetry.circadianStatus.currentZoneName}</span>
              </div>
            </div>

            {/* Right: AI Scan, Carousel Controls, Dismiss & Collapse */}
            <div className="flex items-center gap-1.5 text-xs ml-auto">
              {/* AI Deep Scan Button */}
              <button
                type="button"
                id="sentinel_ai_deep_scan_btn"
                onClick={handleRunAiDeepScan}
                disabled={isAiScanning}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 font-bold transition cursor-pointer disabled:opacity-50 text-[11px]"
                title="Run Gemini AI deep scan of your current routine and calendar"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isAiScanning ? "animate-spin" : "text-yellow-300"}`} />
                <span className="hidden sm:inline">{isAiScanning ? "Analyzing..." : "AI Deep Scan"}</span>
              </button>

              {/* Carousel navigation if multiple signals exist */}
              {visibleSignals.length > 1 && (
                <div className="flex items-center gap-1 bg-white/5 px-1 py-0.5 rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                    title="Previous advice signal"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono text-slate-400 px-1 font-bold">
                    {activeSignalIndex + 1}/{visibleSignals.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                    title="Next advice signal"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Dismiss / Snooze */}
              <button
                type="button"
                onClick={handleDismissCurrent}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Snooze this alert"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Collapse to ticker */}
              <button
                type="button"
                onClick={toggleCollapse}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Collapse to minimal ticker"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Core Content: Headline & Proactive Natural Language Message */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-8 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xl shrink-0 select-none">{currentSignal.icon}</span>
                <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                  {currentSignal.headline}
                </h3>
                {currentSignal.metric && (
                  <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/15">
                    {currentSignal.metric.label}: {currentSignal.metric.value}
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                {currentSignal.message}
              </p>

              {currentSignal.subtext && (
                <p className="text-[11px] text-slate-400 italic">
                  💡 {currentSignal.subtext}
                </p>
              )}

              {/* Dynamic AI Custom Advice Banner (If user invoked AI Deep Scan) */}
              {aiCustomAdvice && (
                <div className="mt-2.5 p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-200 text-xs flex items-start gap-2 animate-in fade-in duration-300">
                  <Bot className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-purple-300">Gemini Sentinel Synthesis: </span>
                    <span>{aiCustomAdvice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiCustomAdvice(null)}
                    className="text-purple-400 hover:text-white p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Direct Action Directives (1-Click Execution) */}
            <div className="md:col-span-4 flex flex-col sm:flex-row md:flex-col items-stretch md:items-end gap-2 justify-center">
              {currentSignal.primaryAction && (
                <button
                  type="button"
                  id="sentinel_primary_action_btn"
                  onClick={() => handleExecuteAction(currentSignal.primaryAction)}
                  className={`w-full text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 ${style.primaryBtn}`}
                  title={currentSignal.primaryAction.tooltip}
                >
                  <span>{currentSignal.primaryAction.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              )}

              {currentSignal.secondaryAction && (
                <button
                  type="button"
                  id="sentinel_secondary_action_btn"
                  onClick={() => handleExecuteAction(currentSignal.secondaryAction)}
                  className="w-full text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition flex items-center justify-center gap-1.5 cursor-pointer text-center"
                  title={currentSignal.secondaryAction.tooltip}
                >
                  <span>{currentSignal.secondaryAction.label}</span>
                </button>
              )}
            </div>
          </div>

          {/* Restored Snoozed Alert Pill (If any dismissed) */}
          {dismissedSignalIds.length > 0 && (
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
              <span>{dismissedSignalIds.length} alert(s) currently snoozed</span>
              <button
                type="button"
                onClick={handleResetDismissed}
                className="text-indigo-400 hover:text-indigo-300 font-medium underline cursor-pointer"
              >
                Restore all snoozed alerts
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
