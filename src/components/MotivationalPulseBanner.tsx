import React, { useState, useMemo } from "react";
import { 
  Sparkles, 
  Clock, 
  Target, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  Flame, 
  RotateCw, 
  Bell, 
  X, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Bot, 
  Zap,
  Check
} from "lucide-react";
import { AppNotification, CalendarEvent, Goal } from "../types";
import { renderGoalIcon } from "../lib/goalIcons";

interface MotivationalPulseBannerProps {
  notifications: AppNotification[];
  events: CalendarEvent[];
  goals: Goal[];
  onNavigateToTab?: (tab: "calendar" | "goals" | "dashboard" | "coach" | "notifications") => void;
  onNavigateToDate?: (date: Date) => void;
  onMarkNotificationRead?: (id: string) => void;
  onDismissNotification?: (id: string) => void;
  onTriggerDailyDigest?: () => void;
  onOpenCoachWithMessage?: (message: string) => void;
}

interface ParsedScheduleBlock {
  title: string;
  timeStr: string;
  isCompleted?: boolean;
  matchedEvent?: CalendarEvent;
  matchedGoal?: Goal;
}

interface ParsedGoalFocus {
  name: string;
  completed: number;
  target: number;
  milestonesNote?: string;
  matchedGoal?: Goal;
}

const MOTIVATIONAL_SPARKS = [
  "Consistency beats intensity: completing 1 focus session today protects your weekly momentum.",
  "Deep focus is a muscle: protect your scheduled blocks from unscheduled interruptions.",
  "Action precedes motivation: showing up for the first 5 minutes ignites the cognitive flow state.",
  "Stack your highest cognitive load during peak energy hours, and save routines for the recharge zone.",
  "Small daily disciplines compound into monumental masteries over 90 days."
];

export default function MotivationalPulseBanner({
  notifications,
  events,
  goals,
  onNavigateToTab,
  onNavigateToDate,
  onMarkNotificationRead,
  onDismissNotification,
  onTriggerDailyDigest,
  onOpenCoachWithMessage
}: MotivationalPulseBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pulse_banner_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [sparkIndex, setSparkIndex] = useState(0);

  // Safe index clamping if notifications list changes
  const validIndex = Math.min(activeIndex, Math.max(0, notifications.length - 1));
  const activeNotification: AppNotification | undefined = notifications[validIndex];

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  // Determine today's actual events from calendar
  const todayEvents = useMemo(() => {
    const todayStr = new Date().toDateString();
    return events
      .filter(e => new Date(e.start).toDateString() === todayStr)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events]);

  // Parse structured daily briefing message if current notification contains daily digest info
  const parsedData = useMemo(() => {
    if (!activeNotification) {
      return { isDigest: false, blocks: [], focusGoals: [] };
    }

    const raw = activeNotification.message || "";
    const isDigest = raw.includes("TODAY'S SCHEDULED BLOCKS") || raw.includes("HIGH PRIORITY FOCUS");

    const blocks: ParsedScheduleBlock[] = [];
    const focusGoals: ParsedGoalFocus[] = [];

    if (isDigest) {
      const parts = raw.split(/🎯\s*HIGH PRIORITY FOCUS:/i);
      const blocksPart = parts[0] || "";
      const goalsPart = parts[1] || "";

      // Parse schedule blocks (supports both newline and bullet-point splitting)
      const rawBlockItems = blocksPart.includes("•")
        ? blocksPart.split("•").map(s => s.trim()).filter(Boolean)
        : blocksPart.split("\n").map(s => s.trim().replace(/^•\s*/, "")).filter(Boolean);

      for (const cleaned of rawBlockItems) {
        if (cleaned.toUpperCase().includes("TODAY'S SCHEDULED BLOCKS") || cleaned.toUpperCase().includes("SCHEDULED BLOCKS:")) {
          continue;
        }
        // Check for "Title at 05:00 PM"
        const atMatch = cleaned.match(/^(.*?)\s+at\s+([0-9:APMapm\s]+)$/i);
        if (atMatch) {
          const title = atMatch[1].trim();
          const timeStr = atMatch[2].trim();

          // Try to match with actual calendar events
          const matchedEvt = todayEvents.find(e => 
            e.title.toLowerCase().includes(title.toLowerCase()) || 
            title.toLowerCase().includes(e.title.toLowerCase())
          );
          const matchedG = matchedEvt?.goalId 
            ? goals.find(g => g.id === matchedEvt.goalId)
            : goals.find(g => title.toLowerCase().includes(g.name.toLowerCase()));

          blocks.push({
            title,
            timeStr,
            isCompleted: matchedEvt?.completed || false,
            matchedEvent: matchedEvt,
            matchedGoal: matchedG
          });
        } else if (cleaned && !cleaned.toLowerCase().includes("no goal blocks")) {
          blocks.push({
            title: cleaned,
            timeStr: ""
          });
        }
      }

      // Parse goals focus (supports both newline and bullet-point splitting)
      const rawGoalItems = goalsPart.includes("•")
        ? goalsPart.split("•").map(s => s.trim()).filter(Boolean)
        : goalsPart.split("\n").map(s => s.trim().replace(/^•\s*/, "")).filter(Boolean);

      for (const cleaned of rawGoalItems) {
        if (cleaned.toUpperCase().includes("HIGH PRIORITY FOCUS") || cleaned.toUpperCase().includes("PRIORITY FOCUS:")) {
          continue;
        }
        // Match "Name: 2/5 weekly sessions done (optional milestones)"
        const goalMatch = cleaned.match(/^(.*?):\s*(\d+)\/(\d+)\s*weekly sessions done(?:\s*\((.*?)\))?/i);
        if (goalMatch) {
          const name = goalMatch[1].trim();
          const completed = parseInt(goalMatch[2], 10);
          const target = parseInt(goalMatch[3], 10);
          const milestonesNote = goalMatch[4] || undefined;

          const matchedG = goals.find(g => 
            g.name.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(g.name.toLowerCase())
          );

          focusGoals.push({
            name,
            completed: matchedG ? matchedG.completedCount : completed,
            target: matchedG ? matchedG.weeklyTarget : target,
            milestonesNote,
            matchedGoal: matchedG
          });
        }
      }
    }

    // Fallback: If it's not a digest string or has 0 blocks parsed, but today's calendar has real events
    // and user has active goals, we can present them cleanly
    const finalBlocks = blocks.length > 0 ? blocks : todayEvents.map(evt => {
      const g = goals.find(goal => goal.id === evt.goalId);
      return {
        title: evt.title,
        timeStr: new Date(evt.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isCompleted: evt.completed,
        matchedEvent: evt,
        matchedGoal: g
      };
    });

    const finalFocusGoals = focusGoals.length > 0 ? focusGoals : goals
      .filter(g => g.completedCount < g.weeklyTarget)
      .slice(0, 3)
      .map(g => ({
        name: g.name,
        completed: g.completedCount,
        target: g.weeklyTarget,
        milestonesNote: g.subtasks?.filter(s => !s.completed).length 
          ? `${g.subtasks.filter(s => !s.completed).length} pending milestones`
          : undefined,
        matchedGoal: g
      }));

    return {
      isDigest: isDigest || (finalBlocks.length > 0 && finalFocusGoals.length > 0),
      blocks: finalBlocks,
      focusGoals: finalFocusGoals
    };
  }, [activeNotification, todayEvents, goals]);

  if (!activeNotification && todayEvents.length === 0) {
    return null;
  }

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem("pulse_banner_collapsed", String(next));
    } catch {
      // ignore
    }
  };

  const handleNextNotification = () => {
    if (notifications.length > 1) {
      setActiveIndex((validIndex + 1) % notifications.length);
    }
  };

  const handlePrevNotification = () => {
    if (notifications.length > 1) {
      setActiveIndex((validIndex - 1 + notifications.length) % notifications.length);
    }
  };

  const handleCycleSpark = () => {
    setSparkIndex((sparkIndex + 1) % MOTIVATIONAL_SPARKS.length);
  };

  // Type-specific theme styling
  const notifType = activeNotification?.type || "motivation";
  const typeBadgeStyles = {
    motivation: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-500/30",
    upcoming: "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-500/30",
    success: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-500/30",
    warning: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-500/30",
    sync: "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-500/30"
  }[notifType];

  return (
    <div 
      id="motivation_floating_tip"
      className="relative overflow-hidden rounded-2xl border transition-all duration-300 shadow-sm bg-white dark:bg-[#0f111c] border-slate-200/90 dark:border-indigo-500/20 shadow-slate-200/50 dark:shadow-indigo-950/20"
    >
      {/* Top refined glowing gradient accent line */}
      <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-400 opacity-90" />

      {/* Subtle ambient back-glows */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-indigo-500/5 dark:bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 h-44 w-44 rounded-full bg-purple-500/5 dark:bg-purple-500/10 blur-3xl" />

      {/* ================= HEADER CONTROL BAR ================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 border-b border-slate-100 dark:border-white/5 relative z-10">
        
        {/* Left: Icon & Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xs shadow-indigo-500/20 shrink-0">
            {parsedData.isDigest ? (
              <Sparkles className="h-4 w-4 animate-pulse" />
            ) : notifType === "upcoming" ? (
              <Clock className="h-4 w-4" />
            ) : notifType === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : notifType === "warning" ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${typeBadgeStyles}`}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600 dark:bg-indigo-400"></span>
              </span>
              Motivational Pulse
            </span>

            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              {activeNotification?.title || "Today's Agenda & Routine Pulse"}
            </h3>
          </div>
        </div>

        {/* Right: Controls & Toggles */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Notification Pagination Switcher */}
          {notifications.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-0.5 text-xs">
              <button 
                type="button"
                onClick={handlePrevNotification} 
                title="Previous pulse"
                className="p-1 hover:bg-white dark:hover:bg-white/10 rounded transition cursor-pointer text-slate-600 dark:text-slate-300"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {validIndex + 1}/{notifications.length}
              </span>
              <button 
                type="button"
                onClick={handleNextNotification} 
                title="Next pulse"
                className="p-1 hover:bg-white dark:hover:bg-white/10 rounded transition cursor-pointer text-slate-600 dark:text-slate-300"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quick link to Alert logs */}
          <button
            type="button"
            onClick={() => onNavigateToTab?.("notifications")}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition cursor-pointer"
            title="View all notifications and sound settings"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Alerts</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-pink-500 text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Minimize / Expand Toggle */}
          <button
            type="button"
            onClick={toggleCollapse}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition cursor-pointer"
            title={isCollapsed ? "Expand detailed overview" : "Collapse to compact summary"}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          {/* Dismiss button */}
          {activeNotification && onDismissNotification && (
            <button
              type="button"
              onClick={() => onDismissNotification(activeNotification.id)}
              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ================= COMPACT / COLLAPSED STATE ================= */}
      {isCollapsed ? (
        <div className="px-4 py-2.5 sm:px-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 overflow-hidden text-slate-700 dark:text-slate-300 font-medium">
            <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {parsedData.blocks.length > 0 
                ? `${parsedData.blocks.length} Sessions Scheduled Today`
                : "Schedule Active"}
            </span>
            <span className="text-slate-300 dark:text-white/20 select-none">•</span>
            <span className="truncate text-slate-600 dark:text-slate-400">
              {parsedData.blocks.length > 0 
                ? parsedData.blocks.map(b => `${b.title}${b.timeStr ? ` (${b.timeStr})` : ""}`).join(" • ")
                : activeNotification?.message || "No upcoming blocks today."}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleCollapse}
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold text-xs ml-auto shrink-0 flex items-center gap-1 cursor-pointer"
          >
            Expand Details <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* ================= EXPANDED RICH STATE ================= */
        <div className="p-4 sm:p-5 space-y-4">
          
          {/* CASE 1: Structured Daily Briefing (or calendar sessions + focus goals) */}
          {parsedData.isDigest ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* SECTION A: Today's Scheduled Blocks (Timeline Chips) */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Today's Scheduled Blocks
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200/60 dark:border-indigo-500/20">
                    {parsedData.blocks.length} {parsedData.blocks.length === 1 ? "session" : "sessions"}
                  </span>
                </div>

                {parsedData.blocks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {parsedData.blocks.map((block, idx) => {
                      const goal = block.matchedGoal;
                      const accentColor = goal?.color || "#6366f1";

                      return (
                        <div
                          key={`${block.title}-${idx}`}
                          onClick={() => {
                            if (block.matchedEvent) {
                              onNavigateToDate?.(new Date(block.matchedEvent.start));
                            }
                          }}
                          className="group flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-white dark:hover:bg-white/10 transition cursor-pointer shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Goal Icon or Category Indicator */}
                            <div 
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs"
                              style={{ backgroundColor: accentColor }}
                            >
                              {renderGoalIcon(goal?.icon, goal?.type, "w-3.5 h-3.5")}
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                                {block.title}
                              </p>
                              {goal?.category && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  {goal.category}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Time Badge */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {block.timeStr ? (
                              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-[#0a0c14] border border-slate-200 dark:border-white/10 text-indigo-700 dark:text-indigo-300 shadow-2xs">
                                {block.timeStr}
                              </span>
                            ) : null}

                            {block.isCompleted ? (
                              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center" title="Session completed">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-white/10 text-xs text-slate-500">
                    No events scheduled for today yet.
                  </div>
                )}
              </div>

              {/* SECTION B: High Priority Focus & Weekly Targets */}
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      High Priority Focus
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateToTab?.("goals")}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    View Goals <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {parsedData.focusGoals.length > 0 ? (
                  <div className="space-y-2.5">
                    {parsedData.focusGoals.map((fg, idx) => {
                      const goal = fg.matchedGoal;
                      const accentColor = goal?.color || "#a855f7";
                      const percentage = Math.min(100, Math.round((fg.completed / Math.max(1, fg.target)) * 100));

                      return (
                        <div
                          key={`${fg.name}-${idx}`}
                          onClick={() => onNavigateToTab?.("goals")}
                          className="group p-2.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-white dark:hover:bg-white/10 transition cursor-pointer shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span 
                                className="w-2 h-2 rounded-full shrink-0" 
                                style={{ backgroundColor: accentColor }} 
                              />
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                                {fg.name}
                              </span>
                            </div>

                            <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                              {fg.completed}/{fg.target} <span className="text-[10px] font-normal text-slate-400">({percentage}%)</span>
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="h-2 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500"
                              style={{ 
                                width: `${percentage}%`,
                                backgroundColor: accentColor
                              }}
                            />
                          </div>

                          {fg.milestonesNote && (
                            <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate flex items-center gap-1">
                              <span>•</span> {fg.milestonesNote}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-white/10 text-xs text-slate-500">
                    All current weekly goals are 100% completed!
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* CASE 2: Regular Alert / Message Notification (Formatted beautifully) */
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white text-sm">
                  {activeNotification?.title}
                </p>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl whitespace-pre-line">
                  {activeNotification?.message}
                </p>
                {activeNotification?.timestamp && (
                  <p className="text-[10px] text-slate-400 font-mono pt-1">
                    {new Date(activeNotification.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>

              {/* Action button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigateToTab?.("calendar")}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer shadow-xs"
                >
                  View Calendar
                </button>
              </div>
            </div>
          )}

          {/* ================= INSPIRATIONAL SPARK / PRO-TIP FOOTER ================= */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2 min-w-0">
              <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0">Daily Spark:</span>
              <p className="truncate text-slate-700 dark:text-slate-300 font-medium">
                "{MOTIVATIONAL_SPARKS[sparkIndex]}"
              </p>
            </div>

            <div className="flex items-center gap-3 ml-auto shrink-0">
              <button
                type="button"
                onClick={handleCycleSpark}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                title="Get another motivational insight"
              >
                <RotateCw className="w-3 h-3" /> New Spark
              </button>

              <span className="text-slate-300 dark:text-white/20 select-none">•</span>

              <button
                type="button"
                onClick={() => onOpenCoachWithMessage?.("Can you review my scheduled blocks for today and suggest the best way to maintain focus?")}
                className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                title="Ask AI Routine Coach to optimize today's blocks"
              >
                <Bot className="w-3.5 h-3.5" /> Ask Coach
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
