import React, { useMemo } from "react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend 
} from "recharts";
import { 
  Zap, 
  ShieldCheck, 
  AlertTriangle, 
  BatteryCharging, 
  Sparkles, 
  Clock, 
  TrendingUp,
  Brain,
  Info
} from "lucide-react";
import { Goal, CalendarEvent, UserEnergyProfile } from "../types";
import { 
  DEFAULT_USER_ENERGY_PROFILE, 
  calculateEventEnergyFit, 
  getDailyCognitiveLoad,
  inferGoalEnergyLevel 
} from "../lib/energyProfile";

interface EnergyScheduleAnalyticsProps {
  goals: Goal[];
  events: CalendarEvent[];
  energyProfile?: UserEnergyProfile;
}

export default function EnergyScheduleAnalytics({
  goals,
  events,
  energyProfile = DEFAULT_USER_ENERGY_PROFILE
}: EnergyScheduleAnalyticsProps) {

  // 1. Analyze 7 days of schedule alignment
  const { 
    dailyBreakdowns, 
    weeklyScore, 
    deepFocusTotalHours, 
    slumpConflictCount, 
    optimalMatchCount,
    totalSessionsCount 
  } = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sun
    const diffToMon = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMon);
    startOfWeek.setHours(0, 0, 0, 0);

    const days = [];
    let totalFitSum = 0;
    let totalAssessedEvents = 0;
    let slumpConflicts = 0;
    let optimalMatches = 0;
    let deepFocusMins = 0;

    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    for (let i = 0; i < 7; i++) {
      const currentDay = new Date(startOfWeek);
      currentDay.setDate(startOfWeek.getDate() + i);
      const dateStr = currentDay.toDateString();

      const dayEvents = events.filter(e => {
        if (e.type === "external") return false;
        return new Date(e.start).toDateString() === dateStr;
      });

      let dayFitSum = 0;
      let dayDeepFocusMins = 0;
      let dayModerateMins = 0;
      let dayRechargeMins = 0;

      dayEvents.forEach(evt => {
        const goal = goals.find(g => g.id === evt.goalId);
        const startH = new Date(evt.start).getHours() + new Date(evt.start).getMinutes() / 60;
        const endH = new Date(evt.end).getHours() + new Date(evt.end).getMinutes() / 60;
        const durMins = Math.max(15, Math.round((new Date(evt.end).getTime() - new Date(evt.start).getTime()) / 60000));
        
        const targetLevel = evt.energyLevel || (goal ? inferGoalEnergyLevel(goal) : "moderate");

        if (targetLevel === "deep_focus") dayDeepFocusMins += durMins;
        else if (targetLevel === "moderate") dayModerateMins += durMins;
        else dayRechargeMins += durMins;

        const fit = calculateEventEnergyFit(evt, goal, energyProfile);
        dayFitSum += fit.fitScore;
        totalFitSum += fit.fitScore;
        totalAssessedEvents++;

        if (fit.isSlumpConflict) slumpConflicts++;
        if (fit.isPeakMatch) optimalMatches++;
      });

      deepFocusMins += dayDeepFocusMins;

      const avgDayFit = dayEvents.length > 0 ? Math.round(dayFitSum / dayEvents.length) : 100;

      days.push({
        dayName: dayLabels[i],
        dateFormatted: `${currentDay.getMonth() + 1}/${currentDay.getDate()}`,
        DeepFocusHours: parseFloat((dayDeepFocusMins / 60).toFixed(1)),
        ModerateHours: parseFloat((dayModerateMins / 60).toFixed(1)),
        RechargeHours: parseFloat((dayRechargeMins / 60).toFixed(1)),
        AlignmentScore: avgDayFit,
        sessionCount: dayEvents.length
      });
    }

    const calculatedWeeklyScore = totalAssessedEvents > 0 
      ? Math.round(totalFitSum / totalAssessedEvents) 
      : 95;

    return {
      dailyBreakdowns: days,
      weeklyScore: calculatedWeeklyScore,
      deepFocusTotalHours: parseFloat((deepFocusMins / 60).toFixed(1)),
      slumpConflictCount: slumpConflicts,
      optimalMatchCount: optimalMatches,
      totalSessionsCount: totalAssessedEvents
    };
  }, [events, goals, energyProfile]);

  return (
    <div id="weekly_energy_analytics_card" className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="font-sans font-bold text-white text-base">
              Circadian & Energy Schedule Alignment
            </h3>
          </div>
          <p className="text-xs text-slate-300 mt-1 font-medium">
            Plan vs. Actual circadian sync based on your <strong>{energyProfile.chronotype.replace("_", " ").toUpperCase()}</strong> chronotype curve.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Weekly Sync Score</span>
            <span className={`text-base font-black ${
              weeklyScore >= 85 ? "text-emerald-400" : weeklyScore >= 70 ? "text-amber-400" : "text-rose-400"
            }`}>
              {weeklyScore}%
            </span>
          </div>
        </div>
      </div>

      {/* 3 Metric Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Peak Deep Focus</span>
            <span className="text-sm font-extrabold text-white">{deepFocusTotalHours} hrs scheduled</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Prime Slot Matches</span>
            <span className="text-sm font-extrabold text-emerald-300">
              {optimalMatchCount} / {totalSessionsCount || 1} sessions
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            slumpConflictCount > 0 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
          }`}>
            {slumpConflictCount > 0 ? <AlertTriangle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Slump Fatigue Warnings</span>
            <span className={`text-sm font-extrabold ${slumpConflictCount > 0 ? "text-rose-300" : "text-slate-200"}`}>
              {slumpConflictCount === 0 ? "0 Conflicts (Protected)" : `${slumpConflictCount} in fatigue zones`}
            </span>
          </div>
        </div>
      </div>

      {/* Stacked Bar Chart: Energy Load Distribution Across This Week */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Daily Cognitive Strain (Hours by Intensity)
          </h4>
          <span className="text-[11px] text-slate-400">
            Ceiling: {energyProfile.maxDailyDeepFocusHours}h Deep Focus/day
          </span>
        </div>

        <div className="h-56" id="energy_load_bar_container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyBreakdowns}>
              <XAxis 
                dataKey="dayName" 
                stroke="rgba(255,255,255,0.2)" 
                tick={{ fontSize: 11, fill: '#cbd5e1' }}
                tickLine={false} 
              />
              <YAxis 
                unit="h"
                stroke="rgba(255,255,255,0.2)" 
                tick={{ fontSize: 11, fill: '#cbd5e1' }}
                tickLine={false} 
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#0c0f1a] border border-white/20 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[170px]">
                        <div className="font-bold text-white border-b border-white/10 pb-1 flex justify-between">
                          <span>{data.dayName} ({data.dateFormatted})</span>
                          <span className="text-amber-400 font-mono">{data.AlignmentScore}% Sync</span>
                        </div>
                        <div className="text-indigo-300 flex justify-between">
                          <span>Deep Focus:</span>
                          <span className="font-bold">{data.DeepFocusHours}h</span>
                        </div>
                        <div className="text-teal-300 flex justify-between">
                          <span>Moderate Execution:</span>
                          <span className="font-bold">{data.ModerateHours}h</span>
                        </div>
                        <div className="text-emerald-300 flex justify-between">
                          <span>Light Recharge:</span>
                          <span className="font-bold">{data.RechargeHours}h</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#f1f5f9' }} 
                formatter={(val) => <span className="text-slate-200 font-medium">{val}</span>}
              />
              <Bar 
                dataKey="DeepFocusHours" 
                name="Deep Focus (Peak)" 
                stackId="a" 
                fill="#6366f1" 
                radius={[0, 0, 0, 0]} 
              />
              <Bar 
                dataKey="ModerateHours" 
                name="Moderate Flow" 
                stackId="a" 
                fill="#0ea5e9" 
                radius={[0, 0, 0, 0]} 
              />
              <Bar 
                dataKey="RechargeHours" 
                name="Light / Recharge" 
                stackId="a" 
                fill="#10b981" 
                radius={[4, 4, 0, 0]} 
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
