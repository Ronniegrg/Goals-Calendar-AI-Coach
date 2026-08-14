import React, { useState } from "react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend 
} from "recharts";
import { 
  Trophy, 
  Flame, 
  Activity, 
  BookOpen, 
  Compass, 
  CheckCircle, 
  Clock,
  Award,
  Sparkles,
  Zap,
  Code,
  Dumbbell,
  Target,
  ShieldCheck,
  Calendar,
  Medal,
  Star,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Pause
} from "lucide-react";
import { Goal, CalendarEvent } from "../types";
import { renderGoalIcon } from "../lib/goalIcons";

interface ProgressDashboardProps {
  goals: Goal[];
  events: CalendarEvent[];
}

export default function ProgressDashboard({ goals, events }: ProgressDashboardProps) {
  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState<number | null>(null);

  // 1. Calculate general numbers
  const completedEvents = events.filter(e => e.completed);
  const studyEvents = completedEvents.filter(e => e.type === "study");
  const workoutEvents = completedEvents.filter(e => e.type === "workout");

  // Calculate sum of minutes
  const totalStudyMinutes = studyEvents.reduce((acc, curr) => {
    const goal = goals.find(g => g.id === curr.goalId);
    return acc + (goal ? goal.durationMinutes : 60);
  }, 0);

  const totalWorkoutMinutes = workoutEvents.reduce((acc, curr) => {
    const goal = goals.find(g => g.id === curr.goalId);
    return acc + (goal ? goal.durationMinutes : 45);
  }, 0);

  // Growth & Cognitive (study, job_search, side_project)
  const cognitiveEvents = completedEvents.filter(e => e.type === "study" || e.type === "job_search" || e.type === "side_project");
  const totalCognitiveMinutes = cognitiveEvents.reduce((acc, curr) => {
    const goal = goals.find(g => g.id === curr.goalId);
    return acc + (goal ? goal.durationMinutes : 60);
  }, 0);

  // Active & Wellness (workout, routine, personal)
  const activeEvents = completedEvents.filter(e => e.type === "workout" || e.type === "routine" || e.type === "personal");
  const totalActiveMinutes = activeEvents.reduce((acc, curr) => {
    const goal = goals.find(g => g.id === curr.goalId);
    return acc + (goal ? goal.durationMinutes : 45);
  }, 0);

  // Consistency Score formula: (completed events / total scheduled) %
  const totalScheduled = events.length;
  const consistencyScore = totalScheduled > 0 
    ? Math.round((completedEvents.length / totalScheduled) * 100) 
    : 0;

  // Total completed minutes
  const totalCompletedMinutes = completedEvents.reduce((acc, curr) => {
    const goal = goals.find(g => g.id === curr.goalId);
    return acc + (goal ? goal.durationMinutes : 60);
  }, 0);

  // 2. GitHub-style 30-Day Heatmap Data Calculation
  const past30Days = Array.from({ length: 30 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - idx));
    d.setHours(0, 0, 0, 0);

    const dayEvents = completedEvents.filter(e => {
      const eDate = new Date(e.start);
      eDate.setHours(0, 0, 0, 0);
      return eDate.getTime() === d.getTime();
    });

    const goalTitles = dayEvents.map(e => e.title || "Scheduled Goal");

    return {
      index: idx,
      date: d,
      dateStr: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dayOfWeek: d.toLocaleDateString("en-US", { weekday: "short" }),
      count: dayEvents.length,
      goalsCompleted: goalTitles,
    };
  });

  // Calculate streaks across past 30 days
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;

  for (let i = 29; i >= 0; i--) {
    if (past30Days[i].count > 0) {
      currentStreak++;
    } else {
      if (i === 29) {
        // Today hasn't ended yet; don't break streak if yesterday had count
        continue;
      }
      break;
    }
  }

  for (let i = 0; i < 30; i++) {
    if (past30Days[i].count > 0) {
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Badge tier helper
  const getBadgeTier = (count: number, bronzeThreshold = 2, silverThreshold = 5, goldThreshold = 10) => {
    if (count >= goldThreshold) return { label: "Gold Titan 🥇", color: "text-amber-300 bg-amber-500/10 border-amber-500/30", nextLevel: "MAX", target: goldThreshold, level: 3 };
    if (count >= silverThreshold) return { label: "Silver Master 🥈", color: "text-slate-200 bg-slate-400/10 border-slate-400/30", nextLevel: `${goldThreshold - count} to Gold`, target: goldThreshold, level: 2 };
    if (count >= bronzeThreshold) return { label: "Bronze Novice 🥉", color: "text-amber-500 bg-amber-700/10 border-amber-700/30", nextLevel: `${silverThreshold - count} to Silver`, target: silverThreshold, level: 1 };
    return { label: "Apprentice 🔒", color: "text-slate-400 bg-white/5 border-white/10", nextLevel: `${bronzeThreshold - count} to Bronze`, target: bronzeThreshold, level: 0 };
  };

  const streakBadge = getBadgeTier(maxStreak, 3, 5, 7);

  const [badgesCollapsed, setBadgesCollapsed] = useState(false);

  // Dynamic Goal Badges generated directly from active user goals
  const dynamicGoalBadges = goals.map(goal => {
    const goalEvts = completedEvents.filter(e => e.goalId === goal.id || (e.title && e.title.toLowerCase().includes(goal.name.toLowerCase())));
    const totalDone = Math.max(goal.completedCount, goalEvts.length);
    const tier = getBadgeTier(totalDone, 2, 5, 8);
    return {
      id: goal.id,
      name: goal.name,
      subtitle: goal.category || goal.type.toUpperCase(),
      color: goal.color || "#818cf8",
      icon: goal.icon,
      type: goal.type,
      totalDone,
      tier
    };
  });

  const [splitViewMode, setSplitViewMode] = useState<"scheduled" | "completed">(
    completedEvents.length > 0 ? "completed" : "scheduled"
  );
  const [paceTimeframe, setPaceTimeframe] = useState<"current_week" | "past_7_days">("current_week");
  const [paceMetricMode, setPaceMetricMode] = useState<"both" | "completed" | "scheduled">("both");
  const [targetChartTimeframe, setTargetChartTimeframe] = useState<"this_week" | "all_time">("this_week");
  const [dashboardGoalScope, setDashboardGoalScope] = useState<"all" | "active">("all");

  // Chart A: Target vs Actual bar chart data sorted by Goal Priority
  const getPriorityScore = (p?: string) => (p === "critical" ? 3 : p === "important" ? 2 : 1);
  const scopedGoals = goals.filter(g => dashboardGoalScope === "all" || !g.isPaused);
  const sortedGoals = [...scopedGoals].sort((a, b) => getPriorityScore(b.priority) - getPriorityScore(a.priority));

  const now = new Date();
  const day = now.getDay();
  const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMon);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const goalCompareData = sortedGoals.map(g => {
    const goalEvtsThisWeek = events.filter(e => {
      if (e.goalId !== g.id && (!e.title || !e.title.toLowerCase().includes(g.name.toLowerCase()))) return false;
      const d = new Date(e.start);
      return d >= startOfWeek && d < endOfWeek;
    });

    const completedThisWeek = goalEvtsThisWeek.filter(e => e.completed).length;
    const scheduledThisWeek = goalEvtsThisWeek.length;
    const totalCompleted = Math.max(
      g.completedCount,
      completedEvents.filter(e => e.goalId === g.id || (e.title && e.title.toLowerCase().includes(g.name.toLowerCase()))).length
    );

    const completedVal = targetChartTimeframe === "this_week" ? completedThisWeek : totalCompleted;
    const targetVal = g.weeklyTarget;

    return {
      id: g.id,
      fullName: g.name,
      name: g.name.length > 15 ? g.name.substring(0, 13) + "..." : g.name,
      priority: g.priority || "normal",
      category: g.category || g.type,
      isPaused: g.isPaused,
      pauseReason: g.pauseReason,
      Target: targetVal,
      Completed: completedVal,
      ScheduledThisWeek: scheduledThisWeek,
      CompletedThisWeek: completedThisWeek,
      TotalCompleted: totalCompleted,
      color: g.color || "#818cf8"
    };
  });

  // Chart B: Dynamic Category Distribution data
  const typeDetails: { [key: string]: { label: string; color: string } } = {
    workout: { label: "Workouts", color: "#f43f5e" },
    study: { label: "Studies & Dev", color: "#06b6d4" },
    job_search: { label: "Job Search", color: "#3b82f6" },
    side_project: { label: "Side Project", color: "#ec4899" },
    routine: { label: "Routine & Chores", color: "#10b981" },
    personal: { label: "Personal & Wellness", color: "#f59e0b" },
    external: { label: "External Busy", color: "#64748b" }
  };

  const catMap: { [key: string]: { name: string; value: number; color: string } } = {};
  const sourceEventsForSplit = splitViewMode === "completed" ? completedEvents : events;

  if (sourceEventsForSplit.length > 0) {
    sourceEventsForSplit.forEach(evt => {
      const goal = goals.find(g => g.id === evt.goalId);
      const catKey = goal?.category || goal?.name || (evt.type ? evt.type.replace('_', ' ').toUpperCase() : "General");
      const duration = goal ? goal.durationMinutes : Math.round((new Date(evt.end).getTime() - new Date(evt.start).getTime()) / 60000) || 60;
      const hours = duration / 60;
      const color = goal?.color || typeDetails[evt.type]?.color || "#818cf8";

      if (!catMap[catKey]) {
        catMap[catKey] = { name: catKey, value: 0, color };
      }
      catMap[catKey].value += hours;
    });
  } else if (goals.length > 0) {
    goals.forEach(goal => {
      const catKey = goal.category || goal.name;
      const hours = (goal.weeklyTarget * goal.durationMinutes) / 60;
      const color = goal.color || "#818cf8";
      if (!catMap[catKey]) {
        catMap[catKey] = { name: catKey, value: 0, color };
      }
      catMap[catKey].value += hours;
    });
  }

  const categorySplitData = Object.values(catMap)
    .map(item => ({ ...item, value: Math.round(item.value * 10) / 10 }))
    .filter(item => item.value > 0);

  const totalSplitHours = Math.round(categorySplitData.reduce((acc, c) => acc + c.value, 0) * 10) / 10;

  const finalDistributionData = categorySplitData.length > 0 
    ? categorySplitData 
    : [{ name: "No Active Records", value: 1, color: "#64748b" }];

  // Daily Completion & Scheduled Pace data calculation
  const getPaceDays = () => {
    if (paceTimeframe === "current_week") {
      const now = new Date();
      const day = now.getDay();
      const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.getFullYear(), now.getMonth(), diffToMon);

      return Array.from({ length: 7 }, (_, idx) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + idx);
        return d;
      });
    } else {
      return Array.from({ length: 7 }, (_, idx) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - idx));
        return d;
      });
    }
  };

  const dailyPaceData = getPaceDays().map((d) => {
    const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
    const fullDateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    
    const dayEvents = events.filter(e => {
      const eDate = new Date(e.start);
      return eDate.getFullYear() === d.getFullYear() && 
             eDate.getMonth() === d.getMonth() && 
             eDate.getDate() === d.getDate();
    });

    const scheduledCount = dayEvents.length;
    const completedCount = dayEvents.filter(e => e.completed).length;

    return {
      day: dayStr,
      fullDateStr,
      Scheduled: scheduledCount,
      Completed: completedCount,
      sessions: paceMetricMode === "completed" ? completedCount : (paceMetricMode === "scheduled" ? scheduledCount : Math.max(scheduledCount, completedCount))
    };
  });

  return (
    <div className="space-y-6">
      
      {/* SECTION 1: TOP METRICS HEADERS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="metrics_cards_row">
        
        {/* CONSISTENCY INDEX */}
        <div id="metric_card_consistency" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="p-3 bg-indigo-500/15 text-indigo-300 rounded-xl">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="select-none">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Consistency Index</p>
            <h4 id="metrics_consistency_score" className="text-xl font-sans font-bold text-white leading-none">{consistencyScore}%</h4>
            <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">Goal Completion Rate</p>
          </div>
        </div>

        {/* ACTIVE STREAK */}
        <div id="metric_card_streak" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="p-3 bg-rose-500/15 text-rose-300 rounded-xl">
            <Flame className="w-5 h-5 animate-bounce text-rose-400" />
          </div>
          <div className="select-none">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Active Streak</p>
            <h4 id="metrics_streak_count" className="text-xl font-sans font-bold text-white leading-none">{currentStreak} Days</h4>
            <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">Best: {maxStreak} Days Streak</p>
          </div>
        </div>

        {/* CARD 3: TOP GOAL 1 OR TOTAL FOCUS HOURS */}
        {goals.length > 0 ? (
          <div id="metric_card_goal1" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
            <div className="p-3 bg-emerald-500/15 text-emerald-300 rounded-xl shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div className="select-none min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5 truncate">
                {goals[0].name}
              </p>
              <h4 className="text-xl font-sans font-bold text-white leading-none">
                {completedEvents.filter(e => e.goalId === goals[0].id).length} Sessions
              </h4>
              <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium truncate">
                Target: {goals[0].weeklyTarget}/wk ({goals[0].category || "Active Goal"})
              </p>
            </div>
          </div>
        ) : (
          <div id="metric_card_focus_time" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
            <div className="p-3 bg-pink-500/15 text-pink-300 rounded-xl shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="select-none">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Total Focus Time</p>
              <h4 className="text-xl font-sans font-bold text-white leading-none">
                {Math.round((totalCompletedMinutes / 60) * 10) / 10}h
              </h4>
              <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">{completedEvents.length} Total Sessions Done</p>
            </div>
          </div>
        )}

        {/* CARD 4: TOP GOAL 2 OR ACTIVE GOALS COUNT */}
        {goals.length > 1 ? (
          <div id="metric_card_goal2" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
            <div className="p-3 bg-cyan-500/15 text-cyan-300 rounded-xl shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="select-none min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5 truncate">
                {goals[1].name}
              </p>
              <h4 className="text-xl font-sans font-bold text-white leading-none">
                {completedEvents.filter(e => e.goalId === goals[1].id).length} Sessions
              </h4>
              <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium truncate">
                Target: {goals[1].weeklyTarget}/wk ({goals[1].category || "Active Goal"})
              </p>
            </div>
          </div>
        ) : (
          <div id="metric_card_goals_count" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
            <div className="p-3 bg-cyan-500/15 text-cyan-300 rounded-xl shrink-0">
              <Code className="w-5 h-5" />
            </div>
            <div className="select-none">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Active Goals</p>
              <h4 className="text-xl font-sans font-bold text-white leading-none">
                {goals.length} {goals.length === 1 ? 'Goal' : 'Goals'}
              </h4>
              <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">
                {goals.length > 0 ? `Target: ${goals.reduce((acc, g) => acc + g.weeklyTarget, 0)} sessions/wk` : "Create goals to start"}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* SECTION 2: GITHUB-STYLE 30-DAY HABIT HEATMAP */}
      <div id="github_habit_heatmap_card" className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-2 border-b border-white/10">
          <div>
            <h3 className="font-sans font-semibold text-white text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              GitHub-Style 30-Day Habit Heatmap
            </h3>
            <p className="text-[11px] text-slate-300 mt-0.5 font-medium leading-tight">
              A visual 30-day activity matrix tracking daily completed goal blocks & consistency streaks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl flex items-center gap-1.5 font-medium">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Streak: <strong className="text-white">{currentStreak} days</strong></span>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-xl flex items-center gap-1.5 font-medium">
              <CheckCircle className="w-3.5 h-3.5 text-indigo-400" />
              <span>30-Day Total: <strong className="text-white">{completedEvents.length} done</strong></span>
            </div>
          </div>
        </div>

        {/* Heatmap Grid & Legend */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Past 30 Days Activity Log</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]">Less</span>
              <span className="w-3.5 h-3.5 rounded bg-slate-900/80 border border-white/5" title="0 Sessions" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-950 border border-emerald-800/40" title="1 Session" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-700/80 border border-emerald-600/50" title="2 Sessions" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-500 border border-emerald-400 shadow-sm shadow-emerald-500/30" title="3+ Sessions" />
              <span className="text-[10px]">More Focus</span>
            </div>
          </div>

          {/* 30-Day Heatmap Grid */}
          <div className="grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-15 gap-2.5 pt-1" id="heatmap_grid_blocks">
            {past30Days.map((item) => {
              let colorClass = "bg-slate-900/80 border-white/5 hover:border-white/20 text-slate-500";
              if (item.count === 1) {
                colorClass = "bg-emerald-950 border-emerald-800/50 text-emerald-300 hover:bg-emerald-900";
              } else if (item.count === 2) {
                colorClass = "bg-emerald-700/80 border-emerald-600/60 text-white hover:bg-emerald-600";
              } else if (item.count >= 3) {
                colorClass = "bg-emerald-500 border-emerald-400 text-white shadow-md shadow-emerald-500/30 hover:bg-emerald-400";
              }

              const isSelected = selectedHeatmapDay === item.index;

              return (
                <div
                  key={item.index}
                  onClick={() => setSelectedHeatmapDay(isSelected ? null : item.index)}
                  className={`relative group flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer ${colorClass} ${
                    isSelected ? "ring-2 ring-emerald-400 scale-105 z-20" : ""
                  }`}
                  id={`heatmap_tile_${item.index}`}
                >
                  <span className="text-[10px] font-mono font-bold leading-none">{item.date.getDate()}</span>
                  <span className="text-[8px] font-sans font-medium opacity-75 mt-0.5">{item.dayOfWeek}</span>

                  {item.count > 0 && (
                    <span className="absolute -top-1 -right-1 bg-emerald-400 text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
                      {item.count}
                    </span>
                  )}

                  {/* Hover Tooltip showing completed goal breakdown */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-[#0b0f19] border border-white/20 text-white p-2.5 rounded-xl shadow-2xl z-30 min-w-[150px] max-w-[220px] text-left pointer-events-none animate-fade-in">
                    <p className="text-[10px] font-bold text-emerald-400 mb-1 border-b border-white/10 pb-1">
                      {item.dateStr} ({item.dayOfWeek})
                    </p>
                    {item.count === 0 ? (
                      <p className="text-[10px] text-slate-400 italic">No goal sessions logged</p>
                    ) : (
                      <div className="space-y-1 text-[10px]">
                        <p className="font-semibold text-slate-300">Completed ({item.count}):</p>
                        <ul className="list-disc list-inside space-y-0.5 text-slate-200">
                          {item.goalsCompleted.map((title, gIdx) => (
                            <li key={gIdx} className="truncate">{title}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected day drilldown details */}
          {selectedHeatmapDay !== null && (
            <div className="mt-3 bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between text-xs text-slate-200 animate-fade-in">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="font-bold text-white">{past30Days[selectedHeatmapDay].dateStr}: </span>
                  <span>
                    {past30Days[selectedHeatmapDay].count === 0 
                      ? "Rest Day (0 completed sessions)" 
                      : `Log of completed sessions: ${past30Days[selectedHeatmapDay].goalsCompleted.join(", ")}`}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedHeatmapDay(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded bg-white/5"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: MILESTONE & STREAK BADGES */}
      <div id="milestone_streak_badges_card" className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/10">
          <div>
            <h3 className="font-sans font-semibold text-white text-sm flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              Milestone & Streak Badges
            </h3>
            <p className="text-[11px] text-slate-300 mt-0.5 font-medium leading-tight">
              Earn tiered rewards as you log sessions and maintain streaks across your routines.
            </p>
          </div>

          <button
            onClick={() => setBadgesCollapsed(!badgesCollapsed)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 border border-white/10 text-xs text-slate-300 hover:text-white transition cursor-pointer self-start sm:self-auto shrink-0"
          >
            {badgesCollapsed ? (
              <>
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>Show Badges ({dynamicGoalBadges.length + 1})</span>
                <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Hide Section</span>
                <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
              </>
            )}
          </button>
        </div>

        {!badgesCollapsed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* DYNAMIC GOAL BADGE CARDS */}
            {dynamicGoalBadges.map((badgeItem) => (
              <div 
                key={badgeItem.id} 
                className="bg-black/25 border border-white/10 p-4 rounded-xl space-y-3 flex flex-col justify-between relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 pr-1">
                    <div 
                      className="p-2 rounded-lg shrink-0"
                      style={{ backgroundColor: `${badgeItem.color}25`, color: badgeItem.color }}
                    >
                      {renderGoalIcon(badgeItem.icon, badgeItem.type, "w-4 h-4")}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate" title={badgeItem.name}>
                        {badgeItem.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 truncate">
                        {badgeItem.subtitle}
                      </p>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${badgeItem.tier.color}`}>
                    {badgeItem.tier.label}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                    <span>Completed: <strong>{badgeItem.totalDone}</strong></span>
                    <span>Next: {badgeItem.tier.nextLevel}</span>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        backgroundColor: badgeItem.color,
                        width: `${Math.min((badgeItem.totalDone / badgeItem.tier.target) * 100, 100)}%` 
                      }}
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 italic leading-tight">
                  {badgeItem.totalDone >= 8 
                    ? `🏆 Masterclass status! Unstoppable progress in ${badgeItem.name}.`
                    : `Complete ${Math.max(badgeItem.tier.target - badgeItem.totalDone, 1)} more sessions to elevate level.`}
                </p>
              </div>
            ))}

            {/* CONSISTENCY STREAK BADGE CARD */}
            <div className="bg-black/25 border border-white/10 p-4 rounded-xl space-y-3 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 pr-1">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg shrink-0">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">Consistency Streak</h4>
                    <p className="text-[10px] text-slate-400 truncate">Daily Goal Completion</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${streakBadge.color}`}>
                  {streakBadge.label}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                  <span>Max Streak: <strong>{maxStreak} Days</strong></span>
                  <span>Target: {streakBadge.target} Days</span>
                </div>
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((maxStreak / streakBadge.target) * 100, 100)}%` }}
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-400 italic leading-tight">
                {maxStreak >= 7 
                  ? "🔥 Unstoppable Streak Legend! Completed goals 7+ days in a row."
                  : `Maintain a ${streakBadge.target}-day consecutive goal streak for the next reward tier.`}
              </p>
            </div>

          </div>
        )}
      </div>

      {/* SECTION 4: VISUAL CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* CHART 1: WEEKLY COMPONENT ACTIVITY AREA CHART */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/10">
            <div>
              <h3 className="font-sans font-semibold text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                Daily Completion Pace
              </h3>
              <p className="text-[11px] text-slate-300 mt-0.5 font-medium leading-tight">
                Scheduled vs completed goal sessions across the {paceTimeframe === "current_week" ? "Current Week (Mon–Sun)" : "Past 7 Days"}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {/* Timeframe Toggle */}
              <div className="bg-black/30 p-1 rounded-lg border border-white/10 flex items-center gap-1">
                <button
                  onClick={() => setPaceTimeframe("current_week")}
                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                    paceTimeframe === "current_week" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Current Week
                </button>
                <button
                  onClick={() => setPaceTimeframe("past_7_days")}
                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                    paceTimeframe === "past_7_days" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Past 7 Days
                </button>
              </div>

              {/* Metric Toggle */}
              <div className="bg-black/30 p-1 rounded-lg border border-white/10 flex items-center gap-1">
                <button
                  onClick={() => setPaceMetricMode("both")}
                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                    paceMetricMode === "both" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Both
                </button>
                <button
                  onClick={() => setPaceMetricMode("completed")}
                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                    paceMetricMode === "completed" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setPaceMetricMode("scheduled")}
                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                    paceMetricMode === "scheduled" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Scheduled
                </button>
              </div>
            </div>
          </div>
          
          <div className="h-60" id="activity_history_container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyPaceData}>
                <defs>
                  <linearGradient id="colorScheduled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#cbd5e1' }} stroke="rgba(255,255,255,0.1)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#cbd5e1' }} stroke="rgba(255,255,255,0.1)" />
                <Tooltip 
                  labelFormatter={(label, payload) => {
                    const item = payload && payload[0]?.payload;
                    return item ? `${item.day} (${item.fullDateStr})` : label;
                  }}
                  contentStyle={{ fontSize: '11px', borderRadius: '12px', background: '#0c0f1a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }} 
                />
                {(paceMetricMode === "both" || paceMetricMode === "scheduled") && (
                  <Area 
                    type="monotone" 
                    dataKey="Scheduled" 
                    stroke="#818cf8" 
                    strokeWidth={2} 
                    strokeDasharray="4 4" 
                    fillOpacity={1} 
                    fill="url(#colorScheduled)" 
                    name="Scheduled Sessions"
                  />
                )}
                {(paceMetricMode === "both" || paceMetricMode === "completed") && (
                  <Area 
                    type="monotone" 
                    dataKey="Completed" 
                    stroke="#10b981" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#colorCompleted)" 
                    name="Completed Sessions"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: TIME SPLIT PIE */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div>
              <h3 className="font-sans font-semibold text-white text-sm">Category Split</h3>
              <p className="text-[11px] text-slate-300 mt-0.5 font-medium leading-tight">Focus time distribution by goal category.</p>
            </div>

            <div className="bg-black/30 p-1 rounded-lg border border-white/10 flex items-center gap-1 text-[10px]">
              <button
                onClick={() => setSplitViewMode("scheduled")}
                className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                  splitViewMode === "scheduled" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Scheduled
              </button>
              <button
                onClick={() => setSplitViewMode("completed")}
                className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                  splitViewMode === "completed" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Logged
              </button>
            </div>
          </div>

          <div className="h-44 relative flex items-center justify-center" id="ratio_pie_container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={finalDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {finalDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} hrs`} contentStyle={{ fontSize: '11px', borderRadius: '8px', background: '#0c0f1a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute flex flex-col justify-center items-center select-none pt-1">
              <span className="text-xl font-bold font-sans text-white">
                {totalSplitHours}h
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                {splitViewMode === "scheduled" ? "Planned" : "Logged"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10 select-none max-h-36 overflow-y-auto pr-1" id="pie_legend_list">
            {finalDistributionData.map((d, index) => (
              <div key={index} className="flex items-center justify-between text-[11px] font-medium text-slate-200">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="truncate">{d.name}</span>
                </div>
                <span className="font-bold shrink-0">{d.value} hrs</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* CHART 3: TARGET vs ACTUAL BAR CHART */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl space-y-4" id="comparison_bar_card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/10">
          <div>
            <h3 className="font-sans font-semibold text-white text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" />
              Target vs Actual Completion
            </h3>
            <p className="text-[11px] text-slate-300 mt-0.5 font-medium leading-tight">
              {targetChartTimeframe === "this_week"
                ? "Comparing weekly target session counts against completions recorded for the Current Week (Mon–Sun)."
                : "Comparing weekly targets against total all-time logged focus sessions."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] shrink-0">
            {/* Scope Toggle */}
            <div className="bg-black/30 p-1 rounded-lg border border-white/10 flex items-center gap-1">
              <button
                onClick={() => setDashboardGoalScope("all")}
                className={`px-2.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                  dashboardGoalScope === "all" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                All Goals ({goals.length})
              </button>
              <button
                onClick={() => setDashboardGoalScope("active")}
                className={`px-2.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                  dashboardGoalScope === "active" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Active Only ({goals.filter(g => !g.isPaused).length})
              </button>
            </div>

            {/* Timeframe Toggle */}
            <div className="bg-black/30 p-1 rounded-lg border border-white/10 flex items-center gap-1">
              <button
                onClick={() => setTargetChartTimeframe("this_week")}
                className={`px-2.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                  targetChartTimeframe === "this_week" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setTargetChartTimeframe("all_time")}
                className={`px-2.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                  targetChartTimeframe === "all_time" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                All-Time
              </button>
            </div>
          </div>
        </div>

        <div className="h-64" id="target_comparison_bar_container">
          {goals.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No active goals configured yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={goalCompareData}>
                <XAxis 
                  dataKey="name" 
                  stroke="rgba(255,255,255,0.15)" 
                  tick={{ fontSize: 10, fill: '#cbd5e1' }}
                  tickLine={false} 
                />
                <YAxis 
                  allowDecimals={false} 
                  stroke="rgba(255,255,255,0.15)" 
                  tick={{ fontSize: 10, fill: '#cbd5e1' }}
                  tickLine={false} 
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const priorityColor = 
                        data.priority === "critical" ? "text-rose-400 border-rose-500/40 bg-rose-500/10" :
                        data.priority === "important" ? "text-amber-400 border-amber-500/40 bg-amber-500/10" :
                        "text-blue-400 border-blue-500/40 bg-blue-500/10";

                      const pct = Math.round((data.Completed / Math.max(data.Target, 1)) * 100);

                      return (
                        <div className="bg-[#0c0f1a] border border-white/20 p-3 rounded-xl shadow-2xl space-y-2 text-xs min-w-[200px]">
                          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
                            <span className="font-bold text-white truncate max-w-[140px]">{data.fullName}</span>
                            <div className="flex items-center gap-1">
                              {data.isPaused && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/20 text-amber-300">
                                  ON HOLD
                                </span>
                              )}
                              <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border ${priorityColor}`}>
                                {data.priority}
                              </span>
                            </div>
                          </div>
                          
                          <div className="space-y-1 text-slate-300 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Weekly Target:</span>
                              <span className="font-semibold text-white">{data.Target} sessions</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">{targetChartTimeframe === "this_week" ? "Completed This Week:" : "Total Completed:"}</span>
                              <span className="font-semibold text-emerald-400">{data.Completed} sessions</span>
                            </div>
                            {targetChartTimeframe === "this_week" && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">Scheduled This Week:</span>
                                <span className="font-semibold text-indigo-300">{data.ScheduledThisWeek} sessions</span>
                              </div>
                            )}
                          </div>

                          <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Pace Progress:</span>
                            <span className={`font-bold ${pct >= 100 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-indigo-400"}`}>
                              {pct}% Achieved
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '12px', color: '#f1f5f9' }} 
                  formatter={(value) => <span className="text-slate-200 font-medium">{value}</span>}
                />
                <Bar 
                  dataKey="Target" 
                  name="Weekly Target" 
                  fill="#1e293b" 
                  stroke="#475569" 
                  strokeWidth={1} 
                  radius={[4, 4, 0, 0]} 
                />
                <Bar 
                  dataKey="Completed" 
                  name={targetChartTimeframe === "this_week" ? "Completed (This Week)" : "Completed (All-Time)"} 
                  fill="#6366f1" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      
    </div>
  );
}
