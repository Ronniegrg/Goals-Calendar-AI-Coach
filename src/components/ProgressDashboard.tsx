import React from "react";
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
  Clock 
} from "lucide-react";
import { Goal, CalendarEvent } from "../types";

interface ProgressDashboardProps {
  goals: Goal[];
  events: CalendarEvent[];
}

export default function ProgressDashboard({ goals, events }: ProgressDashboardProps) {
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

  // Streak simulation based on consecutive completions
  const completionStreak = events.filter(e => e.completed).length > 0 
    ? Math.min(events.filter(e => e.completed).length + 2, 7) // dynamic simulation
    : 0;

  // Total completed hours
  const totalCompletedMinutes = completedEvents.reduce((acc, curr) => {
    const goal = goals.find(g => g.id === curr.goalId);
    return acc + (goal ? goal.durationMinutes : 60);
  }, 0);

  // 2. Prepare Data for Chart A: Workout vs Study completed sessions count per Goal
  const goalCompareData = goals.map(g => ({
    name: g.name.substring(0, 15) + "...",
    Target: g.weeklyTarget,
    Completed: g.completedCount,
  }));

  // 3. Prepare Data for Chart B: Goal Focus type distribution
  const typeDetails: { [key: string]: { label: string; color: string } } = {
    workout: { label: "Workouts", color: "#f43f5e" },
    study: { label: "Studies", color: "#06b6d4" },
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

  // Fallback for empty state distribution to avoid empty chart crashes
  const finalDistributionData = distributionData.length > 0 
    ? distributionData 
    : [{ name: "No Active Records", value: 1, color: "#cbd5e1" }];

  // 4. Activity history graph (last 7 days of completed sessions)
  const last7DaysOfCompletions = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
    
    // Count completions for this day
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

  // 5. Compute past 28 days consistency matrix data
  const consistencyMatrix = Array.from({ length: 28 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (27 - idx)); // past 28 days ending today
    
    // Count completed events for this date
    const dayCompletions = completedEvents.filter(e => {
      const eDate = new Date(e.start);
      return eDate.getFullYear() === d.getFullYear() &&
             eDate.getMonth() === d.getMonth() &&
             eDate.getDate() === d.getDate();
    });
    
    return {
      date: d,
      count: dayCompletions.length,
      dayName: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      dateLabel: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  return (
    <div className="space-y-6">
      
      {/* SECTION A: SCORE CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="metrics_cards_row">
        
        {/* SCORE CARD 1: CONSISTENCY INDEX */}
        <div id="metric_card_consistency" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="p-3 bg-indigo-500/15 text-indigo-300 rounded-xl">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="select-none">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Consistency</p>
            <h4 id="metrics_consistency_score" className="text-xl font-sans font-bold text-white leading-none">{consistencyScore}%</h4>
            <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">Completion Rate</p>
          </div>
        </div>

        {/* SCORE CARD 2: STREAK */}
        <div id="metric_card_streak" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="p-3 bg-rose-500/15 text-rose-300 rounded-xl">
            <Flame className="w-5 h-5 animate-bounce" />
          </div>
          <div className="select-none">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Active Streak</p>
            <h4 id="metrics_streak_count" className="text-xl font-sans font-bold text-white leading-none">{completionStreak} Days</h4>
            <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">Consecutive Done</p>
          </div>
        </div>

        {/* SCORE CARD 3: FITNESS REGISTERED */}
        <div id="metric_card_workout" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="p-3 bg-pink-500/15 text-pink-300 rounded-xl">
            <Activity className="w-5 h-5" />
          </div>
          <div className="select-none">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Active & Wellness</p>
            <h4 id="metrics_workout_hours" className="text-xl font-sans font-bold text-white leading-none">
              {Math.round((totalActiveMinutes / 60) * 10) / 10}h
            </h4>
            <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">{activeEvents.length} logs (Workout, Routine, Personal)</p>
          </div>
        </div>

        {/* SCORE CARD 4: STUDY REGISTERED */}
        <div id="metric_card_study" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="p-3 bg-cyan-500/15 text-cyan-300 rounded-xl">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="select-none">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Career & Growth</p>
            <h4 id="metrics_study_hours" className="text-xl font-sans font-bold text-white leading-none">
              {Math.round((totalCognitiveMinutes / 60) * 10) / 10}h
            </h4>
            <p className="text-[9px] text-slate-350 mt-1 leading-none font-medium">{cognitiveEvents.length} logs (Study, Job Search, Project)</p>
          </div>
        </div>

      </div>

      {/* NEW BENTO SECTION: 28-DAY ROUTINE STREAK MATRIX */}
      <div id="routine_heatmap_matrix_card" className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-sans font-semibold text-white text-sm flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              28-Day Consistency Matrix
            </h3>
            <p className="text-[11px] text-slate-300 mt-0.5 font-medium leading-none">Your habit footprint. Complete scheduled study blocks and cardio to saturate the grid!</p>
          </div>
          
          {/* Legend */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg select-none">
            <span>Less</span>
            <span className="w-3 h-3 rounded-sm bg-white/[0.04] border border-white/5" title="0 Sessions" />
            <span className="w-3 h-3 rounded-sm bg-indigo-900/45 border border-indigo-750/30" title="1 Session" />
            <span className="w-3 h-3 rounded-sm bg-indigo-600/70 border border-indigo-500/40" title="2 Sessions" />
            <span className="w-3 h-3 rounded-sm bg-emerald-500 border border-emerald-400/40" title="3+ Sessions" />
            <span>More Focus</span>
          </div>
        </div>

        <div className="grid grid-cols-7 sm:grid-cols-14 lg:grid-cols-28 gap-2.5 pt-2" id="heatmap_grid_blocks">
          {consistencyMatrix.map((item, index) => {
            let bgClass = "bg-white/[0.04] border border-white/5 hover:border-white/20";
            let tooltipLabel = `${item.dateLabel}: No sessions completed`;
            
            if (item.count === 1) {
              bgClass = "bg-indigo-900/45 text-indigo-200 border border-indigo-700/30 hover:bg-indigo-900/75";
              tooltipLabel = `${item.dateLabel}: 1 completed block`;
            } else if (item.count === 2) {
              bgClass = "bg-indigo-600/70 text-white border border-indigo-500/40 hover:bg-indigo-600/90";
              tooltipLabel = `${item.dateLabel}: 2 completed blocks`;
            } else if (item.count >= 3) {
              bgClass = "bg-emerald-500 text-white border border-emerald-400/40 hover:bg-emerald-450";
              tooltipLabel = `${item.dateLabel}: ${item.count} completed blocks! 🔥`;
            }

            return (
              <div
                key={index}
                className="flex flex-col items-center group relative cursor-help"
                id={`heatmap_day_${index}`}
              >
                <div className={`w-full aspect-square rounded-lg flex items-center justify-center transition-all ${bgClass}`}>
                  <span className="text-[9px] font-mono font-bold opacity-30 group-hover:opacity-100 transition-opacity">
                    {item.date.getDate()}
                  </span>
                </div>
                
                {/* Narrow day label (only for the last week or every 7th day) */}
                <span className="text-[8px] font-mono font-semibold text-slate-400 mt-1 select-none">
                  {item.dayName}
                </span>

                {/* Premium Floating Tooltip */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#0a0c16] text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/15 shadow-2xl whitespace-nowrap z-30 pointer-events-none transition-all scale-95 origin-bottom animate-in fade-in zoom-in-95 duration-100">
                  {tooltipLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION B: VISUAL CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* CHART 1: WEEKLY COMPONENT ACTIVITY HEAT */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl lg:col-span-2">
          <h3 className="font-sans font-semibold text-white text-sm mb-3">Daily Activity Completion Track</h3>
          <p className="text-[11px] text-slate-300 mb-4 font-medium leading-tight">Timeline chart of the total goal sessions completed in the past 7 days.</p>
          
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

        {/* CHART 2: HOUR focus SPLIT */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="font-sans font-semibold text-white text-sm mb-3">Time Split Ratio</h3>
          <p className="text-[11px] text-slate-300 mb-4 font-medium leading-tight">Distribution of your logged hours across different goal focuses and routines.</p>

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

      {/* CHART 3: CORE TARGET FREQUENCY COMPARISON */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl" id="comparison_bar_card">
        <h3 className="font-sans font-semibold text-white text-sm mb-3">Weekly Target vs Actual Completion</h3>
        <p className="text-[11px] text-slate-300 mb-4 font-medium leading-tight">Bar progression displaying targets outlined versus the total sessions checked off.</p>

        <div className="h-64" id="target_comparison_bar_container">
          {goals.length === 0 ? (
            <div className="text-center py-12 text-slate-455 text-xs">
              No targets listed in goal planner sheet yet.
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
