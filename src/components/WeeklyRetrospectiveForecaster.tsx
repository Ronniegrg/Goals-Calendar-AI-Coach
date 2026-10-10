import React, { useState, useMemo } from "react";
import { 
  Sparkles, 
  Calendar, 
  Clock, 
  Target, 
  CheckCircle2, 
  TrendingUp, 
  Award, 
  Flame, 
  Brain, 
  Search, 
  Star, 
  AlertTriangle, 
  ExternalLink, 
  Edit3, 
  Check, 
  X, 
  BookOpen, 
  ChevronRight,
  Filter,
  BarChart3,
  Bot
} from "lucide-react";
import { Goal, CalendarEvent } from "../types";

interface WeeklyRetrospectiveForecasterProps {
  goals: Goal[];
  events: CalendarEvent[];
  onEditGoal?: (goalId: string, fields: Partial<Omit<Goal, "id" | "createdAt">>) => void;
  onNavigateToCalendarDate?: (date: Date) => void;
}

export default function WeeklyRetrospectiveForecaster({
  goals,
  events,
  onEditGoal,
  onNavigateToCalendarDate
}: WeeklyRetrospectiveForecasterProps) {
  const [activeTab, setActiveTab] = useState<"retrospective" | "forecaster" | "vault">("retrospective");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editTotalHours, setEditTotalHours] = useState<number>(40);
  const [editTargetDate, setEditTargetDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGoalId, setFilterGoalId] = useState<string>("all");
  const [filterConfidence, setFilterConfidence] = useState<string>("all");

  const now = new Date();
  
  // Calculate current week bounds (Sunday 00:00 to Saturday 23:59)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  // Completed events this week
  const weekCompletedEvents = useMemo(() => {
    return events.filter(e => {
      if (!e.completed) return false;
      const s = new Date(e.start);
      return s >= startOfWeek && s <= endOfWeek;
    });
  }, [events, startOfWeek, endOfWeek]);

  // Total study minutes this week
  const totalMinutesThisWeek = useMemo(() => {
    return weekCompletedEvents.reduce((acc, curr) => {
      const dur = (new Date(curr.end).getTime() - new Date(curr.start).getTime()) / 60000;
      return acc + (dur > 0 ? dur : 45);
    }, 0);
  }, [weekCompletedEvents]);

  const totalHoursThisWeek = Math.round((totalMinutesThisWeek / 60) * 10) / 10;

  // Total scheduled events this week
  const weekTotalScheduled = useMemo(() => {
    return events.filter(e => {
      const s = new Date(e.start);
      return s >= startOfWeek && s <= endOfWeek && e.type !== "external";
    }).length;
  }, [events, startOfWeek, endOfWeek]);

  const consistencyRate = weekTotalScheduled > 0
    ? Math.min(100, Math.round((weekCompletedEvents.length / weekTotalScheduled) * 100))
    : 100;

  // Goals breakdown for this week
  const goalsWeekStats = useMemo(() => {
    return goals.map(g => {
      const gNameLower = g.name.toLowerCase();
      const evts = weekCompletedEvents.filter(
        e => e.goalId === g.id || (e.title && e.title.toLowerCase().includes(gNameLower))
      );
      const scheduledInWeek = events.filter(e => {
        const s = new Date(e.start);
        const inWk = s >= startOfWeek && s <= endOfWeek;
        const isGoal = e.goalId === g.id || (e.title && e.title.toLowerCase().includes(gNameLower));
        return inWk && isGoal && e.type !== "external";
      }).length;

      const completedCount = evts.length;
      const target = g.weeklyTarget;
      const percent = Math.min(100, Math.round((completedCount / target) * 100));

      // Total hours completed all-time for this goal
      const allCompletedGoalEvts = events.filter(e => {
        if (!e.completed) return false;
        return e.goalId === g.id || (e.title && e.title.toLowerCase().includes(gNameLower));
      });
      const allTimeMinutes = allCompletedGoalEvts.reduce((sum, e) => {
        const dur = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000;
        return sum + (dur > 0 ? dur : g.durationMinutes || 45);
      }, 0);
      const allTimeHours = Math.round((allTimeMinutes / 60) * 10) / 10;

      // Forecast calculation
      const targetCurriculumHours = g.targetTotalHours || 40; // Default 40h standard curriculum
      const remainingHours = Math.max(0, targetCurriculumHours - allTimeHours);
      const weeklyHoursPace = (g.durationMinutes * g.weeklyTarget) / 60;
      const weeksRemaining = weeklyHoursPace > 0 ? Math.ceil(remainingHours / weeklyHoursPace) : 4;

      const projectedDate = new Date(now);
      projectedDate.setDate(now.getDate() + weeksRemaining * 7);

      let paceStatus: "ahead" | "on_track" | "behind" = "on_track";
      if (g.targetCompletionDate) {
        const targetD = new Date(g.targetCompletionDate);
        if (projectedDate < targetD) paceStatus = "ahead";
        else if (projectedDate > targetD) paceStatus = "behind";
      }

      return {
        goal: g,
        completedCount,
        target,
        scheduledInWeek,
        percent,
        allTimeHours,
        targetCurriculumHours,
        remainingHours,
        weeklyHoursPace,
        weeksRemaining,
        projectedDate,
        paceStatus
      };
    });
  }, [goals, events, weekCompletedEvents, startOfWeek, endOfWeek]);

  // Extract all Knowledge Takeaways / Learning Log Entries
  const allLearningLogs = useMemo(() => {
    return events
      .filter(e => e.completed && (e.keyTakeaway || e.completionNote || (e.notes && e.notes.length > 5)))
      .map(e => {
        const matchedGoal = goals.find(g => g.id === e.goalId || (g.name && e.title.toLowerCase().includes(g.name.toLowerCase())));
        return {
          eventId: e.id,
          goalId: matchedGoal?.id,
          goalName: matchedGoal?.name || e.title,
          goalColor: matchedGoal?.color || "#6366f1",
          date: new Date(e.start),
          durationMinutes: Math.max(15, Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000)),
          takeaway: e.keyTakeaway || e.completionNote || e.notes || "",
          confidenceRating: e.confidenceRating || "good"
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [events, goals]);

  // Filtered learning logs
  const filteredLogs = useMemo(() => {
    return allLearningLogs.filter(log => {
      const matchSearch = searchQuery === "" || 
        log.takeaway.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.goalName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchGoal = filterGoalId === "all" || log.goalId === filterGoalId;
      const matchConfidence = filterConfidence === "all" || log.confidenceRating === filterConfidence;
      return matchSearch && matchGoal && matchConfidence;
    });
  }, [allLearningLogs, searchQuery, filterGoalId, filterConfidence]);

  const handleStartEditForecast = (goal: Goal) => {
    setEditingGoalId(goal.id);
    setEditTotalHours(goal.targetTotalHours || 40);
    setEditTargetDate(goal.targetCompletionDate || "");
  };

  const handleSaveForecast = (goalId: string) => {
    if (onEditGoal) {
      onEditGoal(goalId, {
        targetTotalHours: Number(editTotalHours) || 40,
        targetCompletionDate: editTargetDate || undefined
      });
    }
    setEditingGoalId(null);
  };

  return (
    <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-md space-y-6">
      {/* Top Header & Segmented Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
                Intelligence Engine
              </span>
              <span className="text-xs text-slate-400">
                Weekly Horizon
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Weekly Retrospective & Forecaster
            </h2>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("retrospective")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "retrospective"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Retrospective</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("forecaster")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "forecaster"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Course Forecaster</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("vault")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "vault"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Knowledge Vault ({allLearningLogs.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: WEEKLY RETROSPECTIVE */}
      {activeTab === "retrospective" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Executive Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Focus Time This Week
              </span>
              <div className="text-2xl font-black text-white mt-1">
                {totalHoursThisWeek} <span className="text-sm font-bold text-slate-400">hours</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {weekCompletedEvents.length} completed sessions logged
              </div>
            </div>

            <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                Weekly Consistency
              </span>
              <div className="text-2xl font-black text-white mt-1 flex items-center gap-2">
                <span>{consistencyRate}%</span>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                  High Momentum
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Streak protected with Zero-Guilt rest days
              </div>
            </div>

            <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-purple-400" />
                AI Autopilot Impact
              </span>
              <div className="text-2xl font-black text-purple-300 mt-1">
                Active & Guarded
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Continuous collision & overdue catch-up
              </div>
            </div>
          </div>

          {/* Goal Completion Velocity Grid */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-purple-400" />
              <span>Weekly Goals Velocity</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {goalsWeekStats.map(({ goal, completedCount, target, percent }) => (
                <div 
                  key={goal.id} 
                  className="bg-slate-950/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: goal.color }} />
                      <span className="text-sm font-bold text-white truncate">
                        {goal.name}
                      </span>
                      {goal.priority === "critical" && (
                        <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-black uppercase">
                          Critical
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-300 shrink-0">
                      {completedCount} / {target} days
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ 
                        width: `${percent}%`, 
                        backgroundColor: goal.color || "#818cf8" 
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COURSE & CERTIFICATION FORECASTER */}
      {activeTab === "forecaster" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-2xl p-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-200 leading-relaxed">
              <strong>Curriculum Pace Forecaster:</strong> Analyzes your actual weekly study velocity and predicts your exact course completion date. Click <strong>Edit Curriculum</strong> on any goal to adjust total course hours or target exam dates!
            </div>
          </div>

          <div className="space-y-3">
            {goalsWeekStats.map(({ goal, allTimeHours, targetCurriculumHours, remainingHours, weeklyHoursPace, projectedDate, paceStatus }) => (
              <div 
                key={goal.id}
                className="bg-slate-950/80 border border-white/10 rounded-2xl p-4 transition hover:border-white/20"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: goal.color }} />
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{goal.name}</span>
                        {goal.resourceLink && (
                          <a 
                            href={goal.resourceLink} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 text-[11px]"
                            title="Open Course Resource"
                          >
                            <span>({goal.resourceLabel || "Resource"})</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {goal.weeklyTarget} days/week • {goal.durationMinutes}m sessions ({weeklyHoursPace}h/week pace)
                      </div>
                    </div>
                  </div>

                  {/* Status Badge & Edit */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      paceStatus === "ahead" 
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : paceStatus === "behind"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                    }`}>
                      {paceStatus === "ahead" ? "🚀 Ahead of Schedule" : paceStatus === "behind" ? "⚠️ Pace Alert" : "🎯 On Track"}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleStartEditForecast(goal)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      title="Edit Course Target Hours"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Edit Target Inline Form */}
                {editingGoalId === goal.id ? (
                  <div className="p-3 bg-slate-900 border border-indigo-500/30 rounded-xl mb-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-300 font-bold">Total Curriculum Hours:</span>
                      <input
                        type="number"
                        min="5"
                        max="500"
                        value={editTotalHours}
                        onChange={(e) => setEditTotalHours(Number(e.target.value))}
                        className="w-20 bg-slate-950 border border-white/20 rounded-lg px-2 py-1 text-xs text-white"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-300 font-bold">Target Finish Date:</span>
                      <input
                        type="date"
                        value={editTargetDate}
                        onChange={(e) => setEditTargetDate(e.target.value)}
                        className="bg-slate-950 border border-white/20 rounded-lg px-2 py-1 text-xs text-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveForecast(goal.id)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingGoalId(null)}
                      className="px-2 py-1 text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}

                {/* Forecast Timeline Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-2 border-t border-white/5">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Completed So Far:</span>
                    <span className="font-bold text-white">{allTimeHours}h / {targetCurriculumHours}h</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Remaining To Complete:</span>
                    <span className="font-bold text-indigo-300">{remainingHours} hours</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Projected Finish Date:</span>
                    <span className="font-bold text-emerald-400">
                      {projectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: KNOWLEDGE VAULT (LEARNING LOG) */}
      {activeTab === "vault" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Filter / Search Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search learning takeaways (e.g., Wireshark, React hooks, TCP, Docker)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-hidden focus:border-emerald-500 transition"
              />
            </div>

            {/* Goal filter */}
            <select
              value={filterGoalId}
              onChange={(e) => setFilterGoalId(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 outline-hidden cursor-pointer"
            >
              <option value="all">All Subjects</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>

            {/* Confidence filter */}
            <select
              value={filterConfidence}
              onChange={(e) => setFilterConfidence(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 outline-hidden cursor-pointer"
            >
              <option value="all">All Confidence</option>
              <option value="mastered">Mastered ⭐⭐⭐</option>
              <option value="good">Solid ⭐⭐</option>
              <option value="needs_review">Needs Review 🔄</option>
            </select>
          </div>

          {/* Learning Log Cards */}
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 bg-slate-950/40 rounded-2xl border border-white/5">
              <Brain className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-300">No reflections logged yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Whenever you finish a study session, take 30 seconds to log what you learned. Your key takeaways will appear here!
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredLogs.map(log => (
                <div 
                  key={log.eventId}
                  className="bg-slate-950/80 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:border-white/20 transition"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span 
                        className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${log.goalColor}25`, color: log.goalColor }}
                      >
                        {log.goalName}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {log.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} • {log.durationMinutes}m block
                      </span>
                      {log.confidenceRating === "mastered" && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                          Mastered
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">
                      "{log.takeaway}"
                    </p>
                  </div>

                  {onNavigateToCalendarDate && (
                    <button
                      type="button"
                      onClick={() => onNavigateToCalendarDate(log.date)}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 shrink-0 font-bold cursor-pointer self-end sm:self-center"
                    >
                      <span>View in Calendar</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
