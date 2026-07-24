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
  TrendingUp
} from "lucide-react";
import { Goal, CalendarEvent } from "../types";

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

  // 3. Goal-Specific Milestone & Streak Badges Computation
  const pythonGoal = goals.find(g => 
    g.name.toLowerCase().includes("python") || 
    (g.category && g.category.toLowerCase().includes("python"))
  );
  
  const pythonEvents = completedEvents.filter(e => {
    if (pythonGoal && e.goalId === pythonGoal.id) return true;
    return e.title && e.title.toLowerCase().includes("python");
  });

  const fitnessGoal = goals.find(g => 
    g.type === "workout" || 
    g.name.toLowerCase().includes("workout") || 
    g.name.toLowerCase().includes("fitness") ||
    g.name.toLowerCase().includes("gym")
  );

  const fitnessEvents = completedEvents.filter(e => {
    if (fitnessGoal && e.goalId === fitnessGoal.id) return true;
    return e.type === "workout" || (e.title && (e.title.toLowerCase().includes("workout") || e.title.toLowerCase().includes("fitness")));
  });

  const studyEventsAll = completedEvents.filter(e => e.type === "study");

  // Badge tier helper
  const getBadgeTier = (count: number, bronzeThreshold = 2, silverThreshold = 5, goldThreshold = 10) => {
    if (count >= goldThreshold) return { label: "Gold Titan 🥇", color: "text-amber-300 bg-amber-500/10 border-amber-500/30", nextLevel: "MAX", target: goldThreshold, level: 3 };
    if (count >= silverThreshold) return { label: "Silver Master 🥈", color: "text-slate-200 bg-slate-400/10 border-slate-400/30", nextLevel: `${goldThreshold - count} to Gold`, target: goldThreshold, level: 2 };
    if (count >= bronzeThreshold) return { label: "Bronze Novice 🥉", color: "text-amber-500 bg-amber-700/10 border-amber-700/30", nextLevel: `${silverThreshold - count} to Silver`, target: silverThreshold, level: 1 };
    return { label: "Apprentice 🔒", color: "text-slate-400 bg-white/5 border-white/10", nextLevel: `${bronzeThreshold - count} to Bronze`, target: bronzeThreshold, level: 0 };
  };

  const pythonBadge = getBadgeTier(pythonEvents.length, 2, 5, 8);
  const fitnessBadge = getBadgeTier(fitnessEvents.length, 2, 5, 8);
  const studyBadge = getBadgeTier(studyEventsAll.length, 2, 5, 10);
  const streakBadge = getBadgeTier(maxStreak, 3, 5, 7);

  // Chart A: Target vs Actual bar chart data
  const goalCompareData = goals.map(g => ({
    name: g.name.length > 18 ? g.name.substring(0, 15) + "..." : g.name,
    Target: g.weeklyTarget,
    Completed: g.completedCount,
  }));

  // Chart B: Distribution data
  const typeDetails: { [key: string]: { label: string; color: string } } = {
    workout: { label: "Workouts", color: "#f43f5e" },
    study: { label: "Studies & Dev", color: "#06b6d4" },
    job_search: { label: "Job Search", color: "#3b82f6" },
    side_project: { label: "Side Project", color: "#ec4899" },
    routine: { label: "Routine & Chores", color: "#10b981" },
    personal: { label: "Personal & Wellness", color: "#f59e0b" },
    external: { label: "External Busy", color: "#64748b" }
  };

  const distributionData = Object.entries(typeDetails).map(([typeKey, details]) => {
    const typeEvents = completedEvents.filter(e => e.type === typeKey);
    const totalMinutes = typeEvents.reduce((acc, curr) => {
      const goal = goals.find(g => g.id === curr.goalId);
      return acc + (goal ? goal.durationMinutes : 60);
    }, 0);
    const hours = Math.round((totalMinutes / 60) * 10) / 10;
    return {
      name: `${details.label}`,
      value: hours,
      color: details.color
    };
  }).filter(d => d.value > 0);

  const finalDistributionData = distributionData.length > 0 
    ? distributionData 
    : [{ name: "No Active Records", value: 1, color: "#cbd5e1" }];

  // Past 7 days area chart
  const last7DaysOfCompletions = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
    
    const count = completedEvents.filter(e => {
      const eDate = new Date(e.start);
      return eDate.getFullYear() === d.getFullYear() && 
             eDate.getMonth() === d.getMonth() && 
             eDate.getDate() === d.getDate();
    }).length;

    return {
      day: dayStr,
      sessions: count
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

        {/* ACTIVE & WELLNESS */}
        <div id="metric_card_workout" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="p-3 bg-pink-500/15 text-pink-300 rounded-xl">
            <Activity className="w-5 h-5" />
          </div>
          <div className="select-none">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Active & Fitness</p>
            <h4 id="metrics_workout_hours" className="text-xl font-sans font-bold text-white leading-none">
              {Math.round((totalActiveMinutes / 60) * 10) / 10}h
            </h4>
            <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">{fitnessEvents.length} Fitness Sessions Done</p>
          </div>
        </div>

        {/* PYTHON & CAREER */}
        <div id="metric_card_study" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="p-3 bg-cyan-500/15 text-cyan-300 rounded-xl">
            <Code className="w-5 h-5" />
          </div>
          <div className="select-none">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Python & Career</p>
            <h4 id="metrics_study_hours" className="text-xl font-sans font-bold text-white leading-none">
              {pythonEvents.length} Sessions
            </h4>
            <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">
              {pythonGoal ? `Target: ${pythonGoal.weeklyTarget}/wk` : "Python Masterclass"}
            </p>
          </div>
        </div>

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
        <div>
          <h3 className="font-sans font-semibold text-white text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            Milestone & Streak Badges
          </h3>
          <p className="text-[11px] text-slate-300 mt-0.5 font-medium leading-tight">
            Earn tiered rewards for maintaining weekly streaks in key routines like Python Dev or Fitness!
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* BADGE 1: PYTHON DEV MASTER */}
          <div className="bg-black/25 border border-white/10 p-4 rounded-xl space-y-3 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                  <Code className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Python Dev Master</h4>
                  <p className="text-[10px] text-slate-400">Coding & AI Engineering</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pythonBadge.color}`}>
                {pythonBadge.label}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                <span>Completed Sessions: <strong>{pythonEvents.length}</strong></span>
                <span>Next: {pythonBadge.nextLevel}</span>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((pythonEvents.length / pythonBadge.target) * 100, 100)}%` }}
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              {pythonEvents.length >= 8 
                ? "🏆 Elite Python Developer! Masterclass status achieved."
                : `Complete ${pythonBadge.target - pythonEvents.length} more sessions to reach the next Python badge level.`}
            </p>
          </div>

          {/* BADGE 2: FITNESS CHAMPION */}
          <div className="bg-black/25 border border-white/10 p-4 rounded-xl space-y-3 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg">
                  <Dumbbell className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Fitness Champion</h4>
                  <p className="text-[10px] text-slate-400">Workouts & Health</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${fitnessBadge.color}`}>
                {fitnessBadge.label}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                <span>Completed Workouts: <strong>{fitnessEvents.length}</strong></span>
                <span>Next: {fitnessBadge.nextLevel}</span>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-rose-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((fitnessEvents.length / fitnessBadge.target) * 100, 100)}%` }}
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              {fitnessEvents.length >= 8 
                ? "🏋️ Fitness Titan! Unstoppable physical momentum."
                : `Log ${fitnessBadge.target - fitnessEvents.length} more workout blocks to elevate your fitness badge.`}
            </p>
          </div>

          {/* BADGE 3: DEEP STUDY SCHOLAR */}
          <div className="bg-black/25 border border-white/10 p-4 rounded-xl space-y-3 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Deep Study Scholar</h4>
                  <p className="text-[10px] text-slate-400">Cognitive & Learning</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${studyBadge.color}`}>
                {studyBadge.label}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                <span>Study Sessions: <strong>{studyEventsAll.length}</strong></span>
                <span>Next: {studyBadge.nextLevel}</span>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((studyEventsAll.length / studyBadge.target) * 100, 100)}%` }}
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              {studyEventsAll.length >= 10 
                ? "🧠 Knowledge Titan! Mastered consistent deep focus."
                : `Complete ${studyBadge.target - studyEventsAll.length} more study blocks to upgrade badge.`}
            </p>
          </div>

          {/* BADGE 4: UNSTOPPABLE STREAK LEGEND */}
          <div className="bg-black/25 border border-white/10 p-4 rounded-xl space-y-3 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Consistency Streak</h4>
                  <p className="text-[10px] text-slate-400">Daily Goal Completion</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${streakBadge.color}`}>
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

            <p className="text-[10px] text-slate-400 italic">
              {maxStreak >= 7 
                ? "🔥 Unstoppable Streak Legend! Completed goals 7+ days in a row."
                : `Maintain a ${streakBadge.target}-day consecutive goal streak to earn the next reward tier.`}
            </p>
          </div>

        </div>
      </div>

      {/* SECTION 4: VISUAL CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* CHART 1: WEEKLY COMPONENT ACTIVITY AREA CHART */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl lg:col-span-2">
          <h3 className="font-sans font-semibold text-white text-sm mb-1">Daily Completion Pace</h3>
          <p className="text-[11px] text-slate-300 mb-4 font-medium leading-tight">Sessions completed per day over the past 7 days.</p>
          
          <div className="h-64" id="activity_history_container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7DaysOfCompletions}>
                <defs>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#cbd5e1' }} stroke="rgba(255,255,255,0.1)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#cbd5e1' }} stroke="rgba(255,255,255,0.1)" />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '12px', background: '#0c0f1a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }} />
                <Area type="monotone" dataKey="sessions" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorSessions)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: TIME SPLIT PIE */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="font-sans font-semibold text-white text-sm mb-1">Category Split</h3>
          <p className="text-[11px] text-slate-300 mb-4 font-medium leading-tight">Distribution of logged focus hours by goal category.</p>

          <div className="h-48 relative flex items-center justify-center" id="ratio_pie_container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={finalDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {finalDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} hrs`} contentStyle={{ fontSize: '11px', borderRadius: '8px', background: '#0c0f1a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute flex flex-col justify-center items-center select-none pt-2">
              <span className="text-xl font-bold font-sans text-white">
                {Math.round((totalCompletedMinutes / 60) * 10) / 10}h
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Logged</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t border-white/10 mt-2 select-none" id="pie_legend_list">
            {finalDistributionData.map((d, index) => (
              <div key={index} className="flex items-center justify-between text-[11px] font-medium text-slate-200">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span>{d.name}</span>
                </div>
                <span className="font-bold">{d.value} hrs</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* CHART 3: TARGET vs ACTUAL BAR CHART */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl" id="comparison_bar_card">
        <h3 className="font-sans font-semibold text-white text-sm mb-1">Weekly Target vs Actual Completion</h3>
        <p className="text-[11px] text-slate-300 mb-4 font-medium leading-tight">Bar progression comparing target session count against actual completed sessions.</p>

        <div className="h-64" id="target_comparison_bar_container">
          {goals.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No active goals configured yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={goalCompareData}>
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.1)" tick={{ fontSize: 10, fill: '#cbd5e1' }} />
                <YAxis stroke="rgba(255,255,255,0.1)" tick={{ fontSize: 10, fill: '#cbd5e1' }} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '12px', background: '#0c0f1a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Target" fill="rgba(255,255,255,0.15)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Completed" fill="#818cf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      
    </div>
  );
}
