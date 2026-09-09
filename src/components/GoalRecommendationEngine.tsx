import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Brain,
  Zap,
  Activity,
  BookOpen,
  Code,
  Moon,
  Sun,
  Check,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Plus,
  ShieldCheck,
  TrendingUp,
  Target,
  Sliders,
  Filter,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  BatteryCharging,
  Layers
} from "lucide-react";
import {
  Goal,
  GoalType,
  TimePreference,
  AvailabilityWindow,
  CalendarEvent,
  GoalPriority,
  EnergyLevel,
  UserEnergyProfile,
  GoalRecommendation,
  RecommendationEngineResponse,
  SessionSubStep
} from "../types";
import { renderGoalIcon } from "../lib/goalIcons";
import { getEnergyBadgeData, DEFAULT_USER_ENERGY_PROFILE } from "../lib/energyProfile";

interface GoalRecommendationEngineProps {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
  onAddGoal: (goal: Omit<Goal, "id" | "completedCount" | "createdAt">) => void;
  onBulkAddEvents: (newEvents: CalendarEvent[]) => void;
  onAddNotification: (
    title: string,
    message: string,
    type: "upcoming" | "warning" | "motivation" | "success" | "sync",
    action?: { label: string; onClick: () => void }
  ) => void;
  onCustomizeGoal?: (preset: Partial<Goal>) => void;
  onClose?: () => void;
}

export default function GoalRecommendationEngine({
  goals,
  events,
  availability,
  energyProfile = DEFAULT_USER_ENERGY_PROFILE,
  onAddGoal,
  onBulkAddEvents,
  onAddNotification,
  onCustomizeGoal,
  onClose
}: GoalRecommendationEngineProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RecommendationEngineResponse | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "study" | "routine">("all");
  const [customPrompt, setCustomPrompt] = useState("");
  const [expandedSubsteps, setExpandedSubsteps] = useState<Record<string, boolean>>({});
  const [adoptedRecIds, setAdoptedRecIds] = useState<Record<string, boolean>>({});
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null);

  // Fetch or generate recommendations
  const fetchRecommendations = async (filter: "all" | "study" | "routine" = categoryFilter, promptText: string = customPrompt) => {
    setLoading(true);
    try {
      const res = await fetch("/api/coach/recommend-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goals,
          events,
          availability,
          energyProfile,
          categoryFilter: filter,
          customPrompt: promptText
        })
      });

      if (res.ok) {
        const json: RecommendationEngineResponse = await res.json();
        setData(json);
        setLastGeneratedAt(Date.now());
      }
    } catch (err) {
      console.error("Failed to load recommendations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations("all", "");
  }, []);

  const toggleSubsteps = (recId: string) => {
    setExpandedSubsteps(prev => ({ ...prev, [recId]: !prev[recId] }));
  };

  // Automatically schedule calendar events for an adopted recommendation
  const handleAdoptRecommendation = (rec: GoalRecommendation) => {
    // 1. Create the goal
    const newGoalPayload: Omit<Goal, "id" | "completedCount" | "createdAt"> = {
      name: rec.name,
      type: rec.type,
      category: rec.category,
      weeklyTarget: rec.weeklyTarget,
      durationMinutes: rec.durationMinutes,
      timePreference: rec.timePreference,
      color: rec.color,
      icon: rec.icon || (rec.type === GoalType.STUDY ? "book" : rec.type === GoalType.ROUTINE ? "coffee" : "target"),
      priority: rec.priority,
      energyLevel: rec.energyLevel,
      subSteps: rec.subSteps
    };

    onAddGoal(newGoalPayload);

    // 2. Schedule events in the upcoming week matching energy & suggested days
    const newEventsToSchedule: CalendarEvent[] = [];
    const now = new Date();
    const targetDays = rec.suggestedScheduleDays && rec.suggestedScheduleDays.length > 0 
      ? rec.suggestedScheduleDays 
      : [1, 3, 5];

    // Determine target start hour based on energy level & chronotype
    let startHour = 9;
    let startMinute = 0;

    if (rec.energyLevel === "deep_focus") {
      if (energyProfile.chronotype === "early_bird") {
        startHour = 7;
      } else if (energyProfile.chronotype === "night_owl") {
        startHour = 19;
      } else {
        startHour = 9;
        startMinute = 30;
      }
    } else if (rec.energyLevel === "light_recharge") {
      if (energyProfile.chronotype === "early_bird") {
        startHour = 14;
      } else if (energyProfile.chronotype === "night_owl") {
        startHour = 10;
      } else {
        startHour = 13;
        startMinute = 0;
      }
    } else {
      startHour = 15;
    }

    // Schedule 1 session per suggested day over the next 7 days
    targetDays.slice(0, rec.weeklyTarget).forEach((targetDayOfWeek, idx) => {
      const eventDate = new Date(now);
      const currentDay = now.getDay();
      let diff = targetDayOfWeek - currentDay;
      if (diff <= 0) diff += 7; // Place in upcoming cycle

      eventDate.setDate(now.getDate() + diff);
      eventDate.setHours(startHour, startMinute, 0, 0);

      const endDate = new Date(eventDate.getTime() + rec.durationMinutes * 60 * 1000);

      newEventsToSchedule.push({
        id: `rec_evt_${Date.now()}_${idx}`,
        title: rec.name,
        type: rec.type,
        start: eventDate.toISOString(),
        end: endDate.toISOString(),
        completed: false,
        icon: rec.icon,
        energyLevel: rec.energyLevel,
        notes: `AI-Recommended ${rec.recommendationType === "study_block" ? "Study Block" : "Routine"}: ${rec.badge}`,
        subSteps: rec.subSteps
      });
    });

    if (newEventsToSchedule.length > 0) {
      onBulkAddEvents(newEventsToSchedule);
    }

    // Mark as adopted locally
    setAdoptedRecIds(prev => ({ ...prev, [rec.id]: true }));

    // Send notification
    onAddNotification(
      `Goal Adopted: ${rec.name}`,
      `Successfully added to your goals and scheduled ${newEventsToSchedule.length} session${newEventsToSchedule.length > 1 ? "s" : ""} aligned with your ${energyProfile.chronotype.replace('_', ' ')} energy rhythm!`,
      "success"
    );
  };

  const handleCustomize = (rec: GoalRecommendation) => {
    if (onCustomizeGoal) {
      onCustomizeGoal({
        name: rec.name,
        type: rec.type,
        category: rec.category,
        weeklyTarget: rec.weeklyTarget,
        durationMinutes: rec.durationMinutes,
        timePreference: rec.timePreference,
        color: rec.color,
        icon: rec.icon,
        priority: rec.priority,
        energyLevel: rec.energyLevel,
        subSteps: rec.subSteps
      });
    }
  };

  const filteredRecs = data?.recommendations.filter(r => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "study") return r.recommendationType === "study_block" || r.type === "study";
    if (categoryFilter === "routine") return r.recommendationType === "routine" || r.type === "routine" || r.type === "workout";
    return true;
  }) || [];

  return (
    <div id="ai_recommendation_engine_container" className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 sm:p-6 space-y-6 shadow-xl text-slate-100">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl border border-indigo-500/30 text-indigo-400 shrink-0">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                AI Goal & Routine Recommendation Engine
              </h2>
              {data?.aiGenerated && (
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Gemini 3.8
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Personalized study blocks and restorative routines grounded in your goal completion patterns and energy curve.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            id="rec_engine_refresh_btn"
            onClick={() => fetchRecommendations(categoryFilter, customPrompt)}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-semibold transition border border-slate-700 cursor-pointer shadow-sm"
            title="Re-analyze patterns and generate fresh recommendations"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Analyzing..." : "Re-Analyze"}</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition text-xs font-medium cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      </div>

      {/* Pattern Intelligence Dashboard Bar */}
      {data?.patternSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/60 p-3.5 sm:p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/15 rounded-lg border border-indigo-500/20 text-indigo-400 shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Completion Pattern</span>
              <span className="text-sm font-bold text-white flex items-center gap-1.5">
                {data.patternSummary.completionRate}% Consistency
                <span className="text-[10px] text-indigo-300 font-normal">
                  ({data.patternSummary.completedCount}/{data.patternSummary.totalTarget || "–"} done)
                </span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/15 rounded-lg border border-amber-500/20 text-amber-400 shrink-0">
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Chronotype & Peak</span>
              <span className="text-sm font-bold text-white truncate max-w-[170px]" title={data.patternSummary.chronotypeName}>
                {data.patternSummary.chronotypeName}
              </span>
              <span className="text-[10px] text-amber-300 block">{data.patternSummary.peakEnergyWindow}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/15 rounded-lg border border-emerald-500/20 text-emerald-400 shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Cognitive Capacity</span>
              <span className="text-sm font-bold text-white">
                {data.patternSummary.cognitiveLoadDailyAvgHours}h / {data.patternSummary.cognitiveLoadCeilingHours}h max
              </span>
              <span className="text-[10px] text-emerald-400 block">
                {Math.max(0, Number((data.patternSummary.cognitiveLoadCeilingHours - data.patternSummary.cognitiveLoadDailyAvgHours).toFixed(1)))}h daily focus headroom
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/15 rounded-lg border border-purple-500/20 text-purple-400 shrink-0">
              <BatteryCharging className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Slump Protection</span>
              <span className="text-sm font-bold text-slate-200">
                {data.patternSummary.slumpWindow}
              </span>
              <span className="text-[10px] text-purple-300 block">Shielded from high strain</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs & Custom Focus Prompt */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => {
              setCategoryFilter("all");
              fetchRecommendations("all", customPrompt);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              categoryFilter === "all"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All Suggestions ({data?.recommendations.length || 0})
          </button>
          <button
            onClick={() => {
              setCategoryFilter("study");
              fetchRecommendations("study", customPrompt);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              categoryFilter === "study"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BookOpen className="w-3 h-3" />
            Study Blocks
          </button>
          <button
            onClick={() => {
              setCategoryFilter("routine");
              fetchRecommendations("routine", customPrompt);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              categoryFilter === "routine"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Activity className="w-3 h-3" />
            Routines & Wellness
          </button>
        </div>

        {/* Custom Focus Query */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="e.g. 'Focus on LeetCode', 'Short morning habits'..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                fetchRecommendations(categoryFilter, customPrompt);
              }
            }}
            className="w-full sm:w-64 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          <button
            onClick={() => fetchRecommendations(categoryFilter, customPrompt)}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition cursor-pointer shrink-0"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium animate-pulse text-slate-300">
            Synthesizing goal completion patterns and chronotype energy curves...
          </p>
        </div>
      )}

      {/* Recommendations List */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredRecs.map((rec) => {
            const isAdopted = adoptedRecIds[rec.id];
            const badgeData = getEnergyBadgeData(rec.energyLevel);
            const isSubstepsExpanded = !!expandedSubsteps[rec.id];

            return (
              <div
                key={rec.id}
                id={`recommendation_card_${rec.id}`}
                className={`flex flex-col justify-between p-4 sm:p-5 rounded-2xl border transition-all duration-200 ${
                  isAdopted 
                    ? "bg-emerald-950/20 border-emerald-500/40" 
                    : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Card Top Details */}
                <div className="space-y-3">
                  {/* Badge & Confidence */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {rec.badge}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>{rec.confidenceScore}% Match</span>
                    </div>
                  </div>

                  {/* Title & Category */}
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: rec.color }}
                      />
                      {rec.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                        {rec.category}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-[11px] font-semibold text-indigo-300">
                        {rec.weeklyTarget} sessions / wk
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-[11px] font-semibold text-slate-300">
                        {rec.durationMinutes} mins
                      </span>
                    </div>
                  </div>

                  {/* Energy & Timing Pill */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 ${badgeData.bg}`}>
                      <span>{badgeData.icon}</span>
                      {badgeData.label}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5 capitalize font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {rec.timePreference} Window
                    </span>
                  </div>

                  {/* Pattern Insight */}
                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>Pattern Diagnostic Insight:</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {rec.patternInsight}
                    </p>
                    <div className="flex items-start gap-1.5 pt-1 text-[11px] text-indigo-300">
                      <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span><strong>Circadian Fit:</strong> {rec.energyProfileMatch}</span>
                    </div>
                  </div>

                  {/* Phased Sub-steps Breakdown */}
                  {rec.subSteps && rec.subSteps.length > 0 && (
                    <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/50">
                      <button
                        onClick={() => toggleSubsteps(rec.id)}
                        className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Structured Phases ({rec.subSteps.length} steps totaling {rec.durationMinutes}m)</span>
                        </span>
                        {isSubstepsExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>

                      {isSubstepsExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-slate-800/80 pt-2 text-xs">
                          {rec.subSteps.map((step, sIdx) => (
                            <div key={step.id || sIdx} className="flex items-start gap-2 bg-black/40 p-2 rounded-lg">
                              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {sIdx + 1}
                              </span>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <strong className="text-slate-200">{step.title}</strong>
                                  <span className="text-[10px] text-slate-400 font-mono">{step.durationMinutes} min</span>
                                </div>
                                {step.description && (
                                  <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{step.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-4 mt-3 border-t border-slate-800/80 flex items-center gap-2">
                  {isAdopted ? (
                    <div className="w-full py-2.5 px-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center justify-center gap-2 text-xs text-emerald-300 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Goal Adopted & Sessions Scheduled!</span>
                    </div>
                  ) : (
                    <>
                      <button
                        id={`adopt_goal_btn_${rec.id}`}
                        onClick={() => handleAdoptRecommendation(rec)}
                        className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md active:scale-98 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adopt & Auto-Schedule</span>
                      </button>

                      {onCustomizeGoal && (
                        <button
                          onClick={() => handleCustomize(rec)}
                          className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                          title="Tweak parameters in goal editor before adding"
                        >
                          Customize
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
