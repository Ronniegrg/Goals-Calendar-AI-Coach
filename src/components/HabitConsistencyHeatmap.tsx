import React, { useState, useMemo } from "react";
import { 
  Flame, 
  Trophy, 
  Calendar as CalendarIcon, 
  Sparkles, 
  CheckCircle2, 
  Target, 
  Clock, 
  ArrowRight, 
  ChevronRight, 
  Layers,
  Activity,
  Zap,
  Info
} from "lucide-react";
import { Goal, CalendarEvent } from "../types";
import { renderGoalIcon } from "../lib/goalIcons";

interface HabitConsistencyHeatmapProps {
  goals: Goal[];
  events: CalendarEvent[];
  onNavigateToDate?: (date: Date) => void;
  title?: string;
  subtitle?: string;
  showGoalFilter?: boolean;
  initialSelectedGoalId?: string | "all";
}

type TimeframeOption = "30_days" | "12_weeks" | "6_months";

interface HeatmapDay {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  weekIndex: number;
  count: number;
  totalMinutes: number;
  completedEvents: Array<{
    id: string;
    title: string;
    goalName?: string;
    goalColor?: string;
    durationMinutes: number;
    start: string;
  }>;
}

export default function HabitConsistencyHeatmap({
  goals,
  events,
  onNavigateToDate,
  title = "Habit Consistency Matrix",
  subtitle = "GitHub-style contribution heatmap tracking daily habit streaks and routine consistency",
  showGoalFilter = true,
  initialSelectedGoalId = "all"
}: HabitConsistencyHeatmapProps) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | "all">(initialSelectedGoalId);
  const [timeframe, setTimeframe] = useState<TimeframeOption>("12_weeks");
  const [hoveredDay, setHoveredDay] = useState<HeatmapDay | null>(null);
  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);

  // Determine active goal if specific habit filtered
  const activeGoal = useMemo(() => {
    if (selectedGoalId === "all") return null;
    return goals.find(g => g.id === selectedGoalId) || null;
  }, [selectedGoalId, goals]);

  // Filter completed events according to selected goal
  const filteredCompletedEvents = useMemo(() => {
    return events.filter(e => {
      if (!e.completed) return false;
      if (e.type === "external") return false;

      if (selectedGoalId === "all") return true;

      if (e.goalId && e.goalId === selectedGoalId) return true;
      if (activeGoal && e.title && e.title.toLowerCase().includes(activeGoal.name.toLowerCase())) {
        return true;
      }
      return false;
    });
  }, [events, selectedGoalId, activeGoal]);

  // Calculate number of weeks based on timeframe
  const numWeeks = useMemo(() => {
    switch (timeframe) {
      case "30_days":
        return 5;
      case "12_weeks":
        return 12;
      case "6_months":
        return 26;
      default:
        return 12;
    }
  }, [timeframe]);

  // Generate matrix days aligned by Sunday (row 0) to Saturday (row 6)
  const { weeksData, allDays, monthLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // End date is current week's Saturday
    const endDayOfWeek = today.getDay(); // 0 = Sun ... 6 = Sat
    const daysUntilSaturday = 6 - endDayOfWeek;
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + daysUntilSaturday);
    endDate.setHours(23, 59, 59, 999);

    // Total days = numWeeks * 7
    const totalDays = numWeeks * 7;
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - totalDays + 1);
    startDate.setHours(0, 0, 0, 0);

    // Map completed events into a fast lookup map: YYYY-MM-DD -> events
    const eventsByDate = new Map<string, Array<CalendarEvent>>();
    for (const evt of filteredCompletedEvents) {
      const d = new Date(evt.start);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const existing = eventsByDate.get(key) || [];
      existing.push(evt);
      eventsByDate.set(key, existing);
    }

    const days: HeatmapDay[] = [];
    const weeks: HeatmapDay[][] = [];
    let currentWeek: HeatmapDay[] = [];
    const months: Array<{ label: string; weekIndex: number }> = [];
    let lastMonth = -1;

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dayOfWeek = d.getDay();
      const weekIndex = Math.floor(i / 7);

      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const evtsOnDate = eventsByDate.get(key) || [];

      // Add month label when month changes (or on first week)
      if (d.getMonth() !== lastMonth && dayOfWeek === 0) {
        lastMonth = d.getMonth();
        months.push({
          label: d.toLocaleDateString("en-US", { month: "short" }),
          weekIndex
        });
      }

      const dayEventsData = evtsOnDate.map(evt => {
        const tiedGoal = goals.find(g => g.id === evt.goalId || (g.name && evt.title.toLowerCase().includes(g.name.toLowerCase())));
        const duration = tiedGoal?.durationMinutes || 60;
        return {
          id: evt.id,
          title: evt.title,
          goalName: tiedGoal?.name,
          goalColor: tiedGoal?.color,
          durationMinutes: duration,
          start: evt.start
        };
      });

      const totalMins = dayEventsData.reduce((acc, curr) => acc + curr.durationMinutes, 0);

      const dayItem: HeatmapDay = {
        date: d,
        dateKey: key,
        dayOfWeek,
        weekIndex,
        count: dayEventsData.length,
        totalMinutes: totalMins,
        completedEvents: dayEventsData
      };

      days.push(dayItem);
      currentWeek.push(dayItem);

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return { weeksData: weeks, allDays: days, monthLabels: months };
  }, [numWeeks, filteredCompletedEvents, goals]);

  // Calculate consistency statistics
  const stats = useMemo(() => {
    const todayKey = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

    // Filter days up to today only for streak calculation
    const pastAndTodayDays = allDays.filter(d => d.date.getTime() <= new Date().getTime() || d.dateKey === todayKey);

    let currentStreak = 0;
    let longestStreak = 0;
    let runningStreak = 0;
    let activeDaysCount = 0;
    let totalCompletedSessions = 0;
    let totalMinutesLogged = 0;

    // Calculate longest streak and totals
    for (let i = 0; i < pastAndTodayDays.length; i++) {
      const day = pastAndTodayDays[i];
      if (day.count > 0) {
        runningStreak++;
        activeDaysCount++;
        totalCompletedSessions += day.count;
        totalMinutesLogged += day.totalMinutes;
        if (runningStreak > longestStreak) {
          longestStreak = runningStreak;
        }
      } else {
        runningStreak = 0;
      }
    }

    // Calculate current streak going backward from today
    for (let i = pastAndTodayDays.length - 1; i >= 0; i--) {
      const day = pastAndTodayDays[i];
      if (day.count > 0) {
        currentStreak++;
      } else {
        // If today has 0 count yet, allow checking yesterday before breaking
        if (day.dateKey === todayKey) {
          continue;
        }
        break;
      }
    }

    const consistencyRate = pastAndTodayDays.length > 0 
      ? Math.round((activeDaysCount / pastAndTodayDays.length) * 100) 
      : 0;

    const totalHours = (totalMinutesLogged / 60).toFixed(1);

    return {
      currentStreak,
      longestStreak,
      activeDaysCount,
      totalDays: pastAndTodayDays.length,
      totalCompletedSessions,
      totalMinutesLogged,
      totalHours,
      consistencyRate
    };
  }, [allDays]);

  // Color intensity calculator (Level 0 to 4)
  const getIntensityLevel = (count: number): number => {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    return 4;
  };

  // Color classes and inline styles for intensity levels based on active theme
  const getCellStyleAndClass = (level: number, isFuture: boolean) => {
    if (isFuture) {
      return {
        className: "bg-slate-200/40 dark:bg-white/[0.02] border-transparent opacity-25 cursor-default",
        style: undefined
      };
    }

    if (activeGoal?.color) {
      // Goal specific tinting with guaranteed high visibility in both light & dark mode
      if (level === 0) {
        return {
          className: "bg-[#ebedf0] dark:bg-[#161b22] border-[#d0d7de] dark:border-[#30363d]/80 hover:border-slate-400 dark:hover:border-white/30",
          style: undefined
        };
      }
      if (level === 1) {
        return {
          className: "hover:scale-110 transition-transform",
          style: {
            backgroundColor: `${activeGoal.color}35`,
            borderColor: `${activeGoal.color}66`
          }
        };
      }
      if (level === 2) {
        return {
          className: "hover:scale-110 transition-transform",
          style: {
            backgroundColor: `${activeGoal.color}70`,
            borderColor: `${activeGoal.color}99`
          }
        };
      }
      if (level === 3) {
        return {
          className: "hover:scale-110 transition-transform shadow-xs",
          style: {
            backgroundColor: `${activeGoal.color}AA`,
            borderColor: activeGoal.color
          }
        };
      }
      return {
        className: "hover:scale-110 transition-transform shadow-sm",
        style: {
          backgroundColor: activeGoal.color,
          borderColor: activeGoal.color,
          boxShadow: `0 0 6px ${activeGoal.color}66`
        }
      };
    }

    // Iconic GitHub emerald color scale with distinct borders in both themes
    switch (level) {
      case 1:
        return {
          className: "bg-[#9be9a8] dark:bg-[#0e4429] border-[#82d68f] dark:border-[#006d32] hover:border-emerald-600 dark:hover:border-emerald-400",
          style: undefined
        };
      case 2:
        return {
          className: "bg-[#40c463] dark:bg-[#006d32] border-[#34ab54] dark:border-[#26a641] hover:border-emerald-700 dark:hover:border-emerald-300",
          style: undefined
        };
      case 3:
        return {
          className: "bg-[#30a14e] dark:bg-[#26a641] border-[#278640] dark:border-[#39d353] hover:border-emerald-800 dark:hover:border-emerald-200 shadow-xs",
          style: undefined
        };
      case 4:
        return {
          className: "bg-[#216e39] dark:bg-[#39d353] border-[#18532a] dark:border-[#56df6f] shadow-sm hover:border-emerald-900 dark:hover:border-emerald-100",
          style: undefined
        };
      default:
        return {
          className: "bg-[#ebedf0] dark:bg-[#161b22] border-[#d0d7de] dark:border-[#30363d]/80 hover:border-slate-400 dark:hover:border-white/30",
          style: undefined
        };
    }
  };

  const nowTime = new Date().setHours(23, 59, 59, 999);

  return (
    <div 
      id="habit_consistency_heatmap_container" 
      className="bg-white/90 dark:bg-[#0c0f18]/95 backdrop-blur-xl border border-slate-200/90 dark:border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl space-y-5 text-slate-900 dark:text-white transition-colors"
    >
      {/* Top Header & Habit Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-xs">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="font-sans font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {title}
              {activeGoal && (
                <span 
                  className="text-xs font-bold px-2.5 py-0.5 rounded-lg border flex items-center gap-1.5 shadow-xs"
                  style={{ 
                    backgroundColor: `${activeGoal.color}20`, 
                    borderColor: `${activeGoal.color}50`,
                    color: activeGoal.color 
                  }}
                >
                  {renderGoalIcon(activeGoal.icon, activeGoal.type, "w-3.5 h-3.5")}
                  <span>{activeGoal.name}</span>
                </span>
              )}
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 font-medium leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        </div>

        {/* Controls: Timeframe & Habit Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Goal Selector Dropdown */}
          {showGoalFilter && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200 hidden sm:inline">Habit:</span>
              <select
                id="heatmap_goal_filter_select"
                value={selectedGoalId}
                onChange={(e) => {
                  setSelectedGoalId(e.target.value);
                  setSelectedDay(null);
                }}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/15 text-xs font-bold rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer shadow-xs"
              >
                <option value="all" className="bg-white dark:bg-[#0e121e] text-slate-900 dark:text-white">
                  All Habits & Goals ({goals.length})
                </option>
                {goals.map(g => (
                  <option key={g.id} value={g.id} className="bg-white dark:bg-[#0e121e] text-slate-900 dark:text-white">
                    {g.name} ({g.completedCount}/{g.weeklyTarget} weekly)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Timeframe Toggles */}
          <div className="flex items-center bg-slate-100 dark:bg-white/5 border border-slate-300/80 dark:border-white/10 p-1 rounded-xl shadow-xs">
            <button
              type="button"
              id="heatmap_range_30d"
              onClick={() => setTimeframe("30_days")}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeframe === "30_days" 
                  ? "bg-emerald-600 text-white shadow-xs" 
                  : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              id="heatmap_range_12w"
              onClick={() => setTimeframe("12_weeks")}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeframe === "12_weeks" 
                  ? "bg-emerald-600 text-white shadow-xs" 
                  : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              12 Weeks
            </button>
            <button
              type="button"
              id="heatmap_range_6m"
              onClick={() => setTimeframe("6_months")}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeframe === "6_months" 
                  ? "bg-emerald-600 text-white shadow-xs" 
                  : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              6 Months
            </button>
          </div>
        </div>
      </div>

      {/* Streak & Consistency Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Current Streak */}
        <div className="bg-slate-50/90 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 hover:border-amber-500/50 p-3.5 rounded-xl transition flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
            <Flame className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase font-mono tracking-wider text-slate-600 dark:text-slate-300 font-bold leading-none mb-1.5">Current Streak</p>
            <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate leading-tight">
              {stats.currentStreak} {stats.currentStreak === 1 ? "day" : "days"}
            </p>
          </div>
        </div>

        {/* Longest Streak */}
        <div className="bg-slate-50/90 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 hover:border-emerald-500/50 p-3.5 rounded-xl transition flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase font-mono tracking-wider text-slate-600 dark:text-slate-300 font-bold leading-none mb-1.5">Best Streak</p>
            <p className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 truncate leading-tight">
              {stats.longestStreak} {stats.longestStreak === 1 ? "day" : "days"}
            </p>
          </div>
        </div>

        {/* Active Days / Rate */}
        <div className="bg-slate-50/90 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 hover:border-indigo-500/50 p-3.5 rounded-xl transition flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase font-mono tracking-wider text-slate-600 dark:text-slate-300 font-bold leading-none mb-1.5">Consistency</p>
            <p className="text-base sm:text-lg font-extrabold text-indigo-600 dark:text-indigo-400 truncate leading-tight flex items-baseline gap-1">
              {stats.consistencyRate}% <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">({stats.activeDaysCount}d)</span>
            </p>
          </div>
        </div>

        {/* Total Sessions & Hours */}
        <div className="bg-slate-50/90 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 hover:border-rose-500/50 p-3.5 rounded-xl transition flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase font-mono tracking-wider text-slate-600 dark:text-slate-300 font-bold leading-none mb-1.5">Focus Time</p>
            <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate leading-tight flex items-baseline gap-1">
              {stats.totalHours} hrs <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">({stats.totalCompletedSessions})</span>
            </p>
          </div>
        </div>
      </div>

      {/* GitHub Heatmap Grid Area */}
      <div className="pt-2">
        <div className="overflow-x-auto pb-3 scrollbar-thin">
          <div className="min-w-[500px] flex flex-col gap-1 select-none">
            {/* Month Labels along top */}
            <div className="flex text-xs font-mono font-bold text-slate-700 dark:text-slate-300 pl-8 h-5 relative">
              {monthLabels.map((m, idx) => (
                <span 
                  key={idx} 
                  className="absolute font-mono font-bold text-xs text-slate-700 dark:text-slate-300 pointer-events-none"
                  style={{ left: `${m.weekIndex * 18 + 32}px` }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            {/* Matrix Grid: Days of week (0..6) rows, Weeks columns */}
            <div className="flex gap-1.5 items-start">
              {/* Day of week labels on left (Mon, Wed, Fri) */}
              <div className="flex flex-col gap-1 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 pt-0.5 w-7 shrink-0 text-right pr-1.5">
                <span className="h-3.5 leading-3.5 opacity-0 select-none">Sun</span>
                <span className="h-3.5 leading-3.5">Mon</span>
                <span className="h-3.5 leading-3.5 opacity-0 select-none">Tue</span>
                <span className="h-3.5 leading-3.5">Wed</span>
                <span className="h-3.5 leading-3.5 opacity-0 select-none">Thu</span>
                <span className="h-3.5 leading-3.5">Fri</span>
                <span className="h-3.5 leading-3.5 opacity-0 select-none">Sat</span>
              </div>

              {/* Weeks Columns */}
              <div className="flex gap-1">
                {weeksData.map((week, wIdx) => (
                  <div key={wIdx} className="flex flex-col gap-1">
                    {week.map((day) => {
                      const isFuture = day.date.getTime() > nowTime;
                      const level = isFuture ? 0 : getIntensityLevel(day.count);
                      const isSelected = selectedDay?.dateKey === day.dateKey;
                      const isToday = day.dateKey === (() => {
                        const d = new Date();
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      })();

                      const cellStyleData = getCellStyleAndClass(level, isFuture);

                      return (
                        <div
                          key={day.dateKey}
                          onClick={() => {
                            if (!isFuture) {
                              setSelectedDay(isSelected ? null : day);
                            }
                          }}
                          onMouseEnter={() => setHoveredDay(day)}
                          onMouseLeave={() => setHoveredDay(null)}
                          style={cellStyleData.style}
                          className={`w-3.5 h-3.5 rounded-[2.5px] border transition-all duration-150 relative cursor-pointer ${
                            cellStyleData.className
                          } ${
                            isSelected 
                              ? "ring-2 ring-indigo-600 dark:ring-white scale-125 z-20 shadow-md" 
                              : isToday 
                              ? "ring-2 ring-amber-500 dark:ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-[#0c0f18]" 
                              : ""
                          }`}
                          title={`${day.count} session${day.count === 1 ? "" : "s"} on ${day.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Heatmap Footer: Live Hover Detail & Color Legend */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 text-xs border-t border-slate-200/90 dark:border-white/10">
          <div className="flex items-center gap-2 min-h-[24px]">
            {hoveredDay ? (
              <div className="flex items-center gap-2 font-mono text-slate-800 dark:text-slate-200 animate-fade-in">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {hoveredDay.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}:
                </span>
                <span className="font-semibold">
                  {hoveredDay.count === 0 
                    ? "0 sessions logged" 
                    : `${hoveredDay.count} session${hoveredDay.count > 1 ? "s" : ""} (${(hoveredDay.totalMinutes / 60).toFixed(1)}h)`
                  }
                </span>
                {hoveredDay.completedEvents.length > 0 && (
                  <span className="text-slate-500 dark:text-slate-400 truncate max-w-xs font-sans">
                    • {hoveredDay.completedEvents.map(e => e.title).join(", ")}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-700 dark:text-slate-300 font-semibold font-sans">
                {activeGoal ? `Showing activity for ${activeGoal.name}` : "Habit Activity across all routines"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto font-mono text-xs text-slate-600 dark:text-slate-400">
            <span className="font-bold text-[11px]">Less</span>
            <div className="flex items-center gap-1">
              <span 
                className="w-3.5 h-3.5 rounded-[2.5px] bg-[#ebedf0] dark:bg-[#161b22] border border-[#d0d7de] dark:border-[#30363d]" 
                title="0 sessions" 
              />
              <span 
                style={activeGoal ? { backgroundColor: `${activeGoal.color}35`, borderColor: `${activeGoal.color}66` } : undefined}
                className={!activeGoal ? "w-3.5 h-3.5 rounded-[2.5px] bg-[#9be9a8] dark:bg-[#0e4429] border border-[#82d68f] dark:border-[#006d32]" : "w-3.5 h-3.5 rounded-[2.5px] border"}
                title="1 session" 
              />
              <span 
                style={activeGoal ? { backgroundColor: `${activeGoal.color}70`, borderColor: `${activeGoal.color}99` } : undefined}
                className={!activeGoal ? "w-3.5 h-3.5 rounded-[2.5px] bg-[#40c463] dark:bg-[#006d32] border border-[#34ab54] dark:border-[#26a641]" : "w-3.5 h-3.5 rounded-[2.5px] border"}
                title="2 sessions" 
              />
              <span 
                style={activeGoal ? { backgroundColor: `${activeGoal.color}AA`, borderColor: activeGoal.color } : undefined}
                className={!activeGoal ? "w-3.5 h-3.5 rounded-[2.5px] bg-[#30a14e] dark:bg-[#26a641] border border-[#278640] dark:border-[#39d353]" : "w-3.5 h-3.5 rounded-[2.5px] border"}
                title="3 sessions" 
              />
              <span 
                style={activeGoal ? { backgroundColor: activeGoal.color, borderColor: activeGoal.color } : undefined}
                className={!activeGoal ? "w-3.5 h-3.5 rounded-[2.5px] bg-[#216e39] dark:bg-[#39d353] border border-[#18532a] dark:border-[#56df6f] shadow-xs" : "w-3.5 h-3.5 rounded-[2.5px] border shadow-xs"}
                title="4+ sessions" 
              />
            </div>
            <span className="font-bold text-[11px]">More</span>
          </div>
        </div>
      </div>

      {/* Selected Day Drilldown Card */}
      {selectedDay && (
        <div id="heatmap_selected_day_panel" className="bg-slate-50 dark:bg-white/5 border-2 border-emerald-500/40 rounded-xl p-4 text-xs text-slate-900 dark:text-white space-y-3 animate-fade-in shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-bold text-sm text-slate-900 dark:text-white">
                {selectedDay.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className="font-mono text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-md border border-emerald-500/30 font-bold">
                {selectedDay.count} {selectedDay.count === 1 ? "session" : "sessions"} completed
              </span>
              {selectedDay.totalMinutes > 0 && (
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300 font-semibold">
                  • {(selectedDay.totalMinutes / 60).toFixed(1)} hrs total
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToDate && (
                <button
                  type="button"
                  onClick={() => onNavigateToDate(selectedDay.date)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  title="View this day in Schedule Grid"
                >
                  <span>View in Schedule</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-white/10 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {/* List of completed sessions */}
          {selectedDay.completedEvents.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-xs italic py-1 font-medium">
              Rest day — No routine or goal sessions were logged on this date.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {selectedDay.completedEvents.map((evt) => (
                <div 
                  key={evt.id}
                  className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                        {evt.title}
                      </p>
                      {evt.goalName && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                          Habit: <span className="text-slate-900 dark:text-slate-200 font-semibold">{evt.goalName}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10 shrink-0">
                    {evt.durationMinutes}m
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
