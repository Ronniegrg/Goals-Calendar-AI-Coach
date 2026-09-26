import React, { useState, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import { 
  Sparkles, 
  Send, 
  Bot, 
  RefreshCw, 
  Activity, 
  Brain, 
  User,
  FileText,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle,
  Sun,
  Moon,
  BatteryCharging,
  Calendar,
  Check,
  ChevronRight,
  Flame,
  Layers,
  Trash2,
  ShieldCheck,
  HelpCircle
} from "lucide-react";
import { CoachMessage, Goal, CalendarEvent, AvailabilityWindow, GoalType, TimePreference, UserEnergyProfile } from "../types";
import GoalRecommendationEngine from "./GoalRecommendationEngine";

export interface ParsedGoalAction {
  action: "create_goal" | "update_goal" | "delete_goal" | "auto_resolve_conflicts" | "launch_timer";
  goal?: {
    name?: string;
    type?: string;
    category?: string;
    weeklyTarget?: number;
    durationMinutes?: number;
    timePreference?: string;
    priority?: string;
    color?: string;
    icon?: string;
  };
  goalId?: string;
  goalName?: string;
  updatedFields?: {
    weeklyTarget?: number;
    durationMinutes?: number;
    timePreference?: string;
    name?: string;
    type?: string;
  };
  timerConfig?: {
    title?: string;
    durationMinutes?: number;
    category?: string;
    subSteps?: Array<{ id: string; title: string; durationMinutes: number; description?: string }>;
  };
}

function parseGoalActionFromText(text: string): { displayText: string; goalAction: ParsedGoalAction | null } {
  try {
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = text.match(jsonRegex);
    if (match && match[1]) {
      const parsed = JSON.parse(match[1]);
      if (parsed) {
        const actionObj = parsed.goalAction || (parsed.action ? parsed : null);
        if (actionObj && actionObj.action) {
          const displayText = text.replace(jsonRegex, "").trim();
          return { displayText, goalAction: actionObj };
        }
      }
    }
  } catch (e) {
    // ignore parse errors and treat as normal text
  }
  return { displayText: text, goalAction: null };
}

function GoalActionCard({ 
  action, 
  isApplied, 
  onApply,
  goals
}: { 
  action: ParsedGoalAction; 
  isApplied: boolean; 
  onApply: () => void;
  goals: Goal[];
}) {
  if (isApplied) {
    return (
      <div className="coach-action-card mt-3.5 p-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl flex items-center gap-3 text-sm text-emerald-200 font-semibold shadow-sm">
        <Check className="w-5 h-5 text-emerald-400 shrink-0" />
        <span>
          {action.action === "create_goal" && `Goal "${action.goal?.name}" created & scheduled on your calendar!`}
          {action.action === "update_goal" && `Goal updated & calendar sync updated!`}
          {action.action === "delete_goal" && `Goal removed from your tracker.`}
        </span>
      </div>
    );
  }

  if (action.action === "create_goal" && action.goal) {
    const g = action.goal;
    return (
      <div className="coach-action-card mt-4 p-4 bg-gradient-to-r from-indigo-950/95 via-slate-900/95 to-purple-950/95 border border-indigo-400/40 rounded-2xl space-y-3 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="coach-action-title flex items-center gap-2 text-indigo-200 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse shrink-0" />
            <span>Interactive Proposal: Create "{g.name || 'New Goal'}"</span>
          </div>
          <span className="coach-action-badge text-xs font-bold bg-indigo-500/25 text-indigo-200 px-2.5 py-0.5 rounded-full border border-indigo-400/30">
            {g.category || "Habit"}
          </span>
        </div>

        <div className="coach-action-grid grid grid-cols-2 gap-2.5 text-xs text-slate-200 bg-black/50 p-3 rounded-xl border border-white/10">
          <div><span className="text-slate-400">Target Sessions:</span> <strong className="text-white block font-bold">{g.weeklyTarget || 3}x per week</strong></div>
          <div><span className="text-slate-400">Duration:</span> <strong className="text-white block font-bold">{g.durationMinutes || 45} minutes</strong></div>
          <div><span className="text-slate-400">Preferred Window:</span> <strong className="text-white block font-bold capitalize">{g.timePreference || "Flexible"}</strong></div>
          <div><span className="text-slate-400">Priority Level:</span> <strong className="text-white block font-bold capitalize">{g.priority || "High"}</strong></div>
        </div>

        <button
          type="button"
          onClick={onApply}
          className="coach-action-btn w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-98 cursor-pointer"
        >
          <Check className="w-4 h-4 text-white" />
          <span>Commit Goal & Auto-Schedule Sessions</span>
        </button>
      </div>
    );
  }

  if (action.action === "update_goal") {
    const targetGoal = goals.find(g => g.id === action.goalId);
    const targetName = action.goalName || targetGoal?.name || "Target Goal";
    const uf = action.updatedFields || {};

    return (
      <div className="coach-action-card mt-4 p-4 bg-gradient-to-r from-cyan-950/95 via-slate-900/95 to-indigo-950/95 border border-cyan-400/40 rounded-2xl space-y-3 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="coach-action-title flex items-center gap-2 text-cyan-200 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
            <span>Interactive Proposal: Update "{targetName}"</span>
          </div>
        </div>

        <div className="coach-action-grid text-xs text-slate-200 bg-black/50 p-3 rounded-xl border border-white/10 space-y-1.5">
          {uf.weeklyTarget && <div><span>• Weekly Target:</span> <strong className="text-cyan-300 font-bold">{uf.weeklyTarget} sessions / week</strong></div>}
          {uf.durationMinutes && <div><span>• Duration:</span> <strong className="text-cyan-300 font-bold">{uf.durationMinutes} minutes</strong></div>}
          {uf.timePreference && <div><span>• Preferred Time:</span> <strong className="text-cyan-300 font-bold capitalize">{uf.timePreference}</strong></div>}
        </div>

        <button
          type="button"
          onClick={onApply}
          className="coach-action-btn w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/30 active:scale-98 cursor-pointer"
        >
          <Check className="w-4 h-4 text-white" />
          <span>Apply Updates to Goal</span>
        </button>
      </div>
    );
  }

  if (action.action === "delete_goal") {
    const targetName = action.goalName || "Target Goal";
    return (
      <div className="coach-action-card mt-4 p-4 bg-gradient-to-r from-rose-950/95 to-slate-900/95 border border-rose-500/40 rounded-2xl space-y-3 shadow-xl">
        <div className="coach-action-title flex items-center gap-2 text-rose-200 font-bold text-sm">
          <Trash2 className="w-4 h-4 text-rose-400" />
          <span>Proposal: Remove Inactive Goal "{targetName}"</span>
        </div>

        <button
          type="button"
          onClick={onApply}
          className="coach-action-btn w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 active:scale-98 cursor-pointer"
        >
          <Trash2 className="w-4 h-4 text-white" />
          <span>Confirm & Remove Goal</span>
        </button>
      </div>
    );
  }

  return null;
}

function FormattedCoachMessage({ text, isCoach }: { text: string; isCoach: boolean }) {
  if (!isCoach) {
    return (
      <div className="coach-message-text whitespace-pre-wrap font-sans text-sm leading-relaxed text-white font-medium">
        {text}
      </div>
    );
  }

  return (
    <div className="coach-message-text text-sm font-sans leading-relaxed text-slate-100">
      <Markdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-indigo-200 mt-3.5 mb-2 pb-1.5 border-b border-indigo-500/25 flex items-center gap-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-indigo-300 mt-3 mb-1.5 flex items-center gap-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="coach-heading-badge text-sm font-bold text-indigo-100 tracking-wide mt-3 mb-2 flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 px-3 py-1.5 rounded-xl shadow-xs">
              <Sparkles className="w-4 h-4 text-indigo-300 shrink-0" />
              <span>{children}</span>
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2.5 leading-relaxed text-slate-100 text-sm">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-white tracking-wide">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-indigo-300 font-medium">
              {children}
            </em>
          ),
          ul: ({ children }) => (
            <ul className="my-2.5 space-y-1.5 list-none pl-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 space-y-1.5 list-decimal pl-5 text-indigo-200 text-sm">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-slate-100 flex items-start gap-2.5 leading-relaxed my-1.5">
              <span className="coach-list-dot w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-2 shadow-xs shadow-indigo-400" />
              <div className="flex-1 space-y-0.5">{children}</div>
            </li>
          ),
          hr: () => (
            <div className="my-3.5 border-t border-indigo-500/20 relative" />
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 pl-4 border-l-2 border-indigo-400 bg-indigo-950/40 py-2.5 pr-3 rounded-r-xl text-slate-100 italic text-sm space-y-1 shadow-inner">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="font-mono text-xs bg-slate-950/90 text-cyan-300 px-2 py-0.5 rounded-md border border-cyan-500/25">
              {children}
            </code>
          )
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

interface AICoachProps {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  coachMessages: CoachMessage[];
  onAddMessage: (msg: CoachMessage) => void;
  onClearMessages: () => void;
  coachPersona?: "mentor" | "drill" | "data";
  onUpdatePersona?: (persona: "mentor" | "drill" | "data") => void;
  onApplyEnergySchedule?: (newEvents: CalendarEvent[]) => void;
  onAddGoal?: (goal: Omit<Goal, "id" | "completedCount" | "createdAt">) => void;
  onEditGoal?: (goalId: string, updatedFields: Partial<Omit<Goal, "id" | "createdAt">>) => void;
  onDeleteGoal?: (goalId: string) => void;
  userEnergyProfile?: UserEnergyProfile;
  onBulkAddEvents?: (newEvents: CalendarEvent[]) => void;
  onAddNotification?: (title: string, message: string, type: any) => void;
}

interface DigestData {
  productivityScore: number;
  peakFocusWindow: string;
  reflectionSummary: string;
  productivityPatterns: string[];
  recommendedAdjustments: string[];
}

export default function AICoach({
  goals,
  events,
  availability,
  coachMessages,
  onAddMessage,
  onClearMessages,
  coachPersona = "mentor",
  onUpdatePersona,
  onApplyEnergySchedule,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  userEnergyProfile,
  onBulkAddEvents,
  onAddNotification
}: AICoachProps) {
  const [activeSubTab, setActiveSubTab] = useState<"chat" | "digest" | "energy" | "recommendations">("chat");
  const [appliedGoalActions, setAppliedGoalActions] = useState<Record<string, boolean>>({});

  // Chat State
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Digest State
  const [digestData, setDigestData] = useState<DigestData | null>(null);
  const [loadingDigest, setLoadingDigest] = useState(false);

  // Energy Scheduler State
  const [energyProfile, setEnergyProfile] = useState<"lark" | "owl" | "balanced">("lark");
  const [loadingEnergy, setLoadingEnergy] = useState(false);
  const [energyResult, setEnergyResult] = useState<{
    summary: string;
    newEvents: CalendarEvent[];
    categorizedGoals: any[];
  } | null>(null);
  const [scheduleApplied, setScheduleApplied] = useState(false);

  const handleExecuteGoalAction = (msgId: string, action: ParsedGoalAction) => {
    if (action.action === "create_goal" && action.goal && onAddGoal) {
      const g = action.goal;
      const typeEnum = 
        g.type === "workout" ? GoalType.WORKOUT :
        g.type === "study" ? GoalType.STUDY :
        g.type === "job_search" ? GoalType.JOB_SEARCH :
        g.type === "side_project" ? GoalType.SIDE_PROJECT :
        g.type === "routine" ? GoalType.ROUTINE :
        GoalType.PERSONAL;

      const timePrefEnum = 
        g.timePreference === "early_morning" ? TimePreference.EARLY_MORNING :
        g.timePreference === "morning" ? TimePreference.MORNING :
        g.timePreference === "afternoon" ? TimePreference.AFTERNOON :
        g.timePreference === "evening" ? TimePreference.EVENING :
        g.timePreference === "night" ? TimePreference.NIGHT :
        TimePreference.ANY;

      onAddGoal({
        name: g.name || "New Goal",
        type: typeEnum,
        category: g.category || "Productivity",
        weeklyTarget: Number(g.weeklyTarget) || 3,
        durationMinutes: Number(g.durationMinutes) || 45,
        timePreference: timePrefEnum,
        color: g.color || "indigo",
        icon: g.icon || "code"
      });
      if (onAddNotification) {
        onAddNotification(
          "Goal Created & Scheduled! 🎯",
          `Added "${g.name || 'New Goal'}" with ${g.weeklyTarget || 3} weekly sessions placed on your calendar.`,
          "success"
        );
      }
    } else if (action.action === "update_goal" && action.goalId && onEditGoal) {
      const uf = action.updatedFields || {};
      const updatedPayload: any = {};
      if (uf.weeklyTarget !== undefined) updatedPayload.weeklyTarget = Number(uf.weeklyTarget);
      if (uf.durationMinutes !== undefined) updatedPayload.durationMinutes = Number(uf.durationMinutes);
      if (uf.timePreference !== undefined) {
        updatedPayload.timePreference = 
          uf.timePreference === "early_morning" ? TimePreference.EARLY_MORNING :
          uf.timePreference === "morning" ? TimePreference.MORNING :
          uf.timePreference === "afternoon" ? TimePreference.AFTERNOON :
          uf.timePreference === "evening" ? TimePreference.EVENING :
          uf.timePreference === "night" ? TimePreference.NIGHT :
          TimePreference.ANY;
      }
      onEditGoal(action.goalId, updatedPayload);
      if (onAddNotification) {
        onAddNotification(
          "Goal Updated! ✨",
          `Updated targets for "${action.goalName || 'Goal'}".`,
          "success"
        );
      }
    } else if (action.action === "delete_goal" && action.goalId && onDeleteGoal) {
      onDeleteGoal(action.goalId);
      if (onAddNotification) {
        onAddNotification(
          "Goal Removed",
          `Removed "${action.goalName || 'Goal'}" and cleared its upcoming sessions.`,
          "warning"
        );
      }
    }

    setAppliedGoalActions(prev => ({ ...prev, [msgId]: true }));
  };

  // Auto scroll chat to bottom when message arrives
  useEffect(() => {
    if (activeSubTab === "chat" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [coachMessages, activeSubTab]);

  // Fetch Digest
  const handleFetchDigest = async () => {
    setLoadingDigest(true);
    try {
      const res = await fetch("/api/coach/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals, events, availability })
      });
      const data = await res.json();
      setDigestData(data);
    } catch (err) {
      console.error("Failed to fetch digest:", err);
    } finally {
      setLoadingDigest(false);
    }
  };

  // Run Energy Schedule
  const handleRunEnergySchedule = async () => {
    setLoadingEnergy(true);
    setScheduleApplied(false);
    try {
      const res = await fetch("/api/coach/energy-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals, events, availability, energyProfile })
      });
      const data = await res.json();
      setEnergyResult(data);
    } catch (err) {
      console.error("Failed to run energy schedule:", err);
    } finally {
      setLoadingEnergy(false);
    }
  };

  const handleApplySchedule = () => {
    if (energyResult && energyResult.newEvents && onApplyEnergySchedule) {
      onApplyEnergySchedule(energyResult.newEvents);
      setScheduleApplied(true);
      if (onAddNotification) {
        onAddNotification(
          "Energy Schedule Applied! ⚡",
          `Committed ${energyResult.newEvents.length} energy-aligned sessions to your calendar grid.`,
          "success"
        );
      }
    }
  };

  // Auto-fetch digest when opening tab
  useEffect(() => {
    if (activeSubTab === "digest" && !digestData && !loadingDigest) {
      handleFetchDigest();
    }
  }, [activeSubTab]);

  // Auto-run energy schedule preview when opening tab
  useEffect(() => {
    if (activeSubTab === "energy" && !energyResult && !loadingEnergy) {
      handleRunEnergySchedule();
    }
  }, [activeSubTab]);

  const handleSendQuestion = async (textToSend?: string) => {
    const prompt = (textToSend || inputText).trim();
    if (!prompt) return;

    // Record user's message
    const userMsg: CoachMessage = {
      id: `u_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: "user",
      text: prompt,
      timestamp: new Date().toISOString()
    };
    onAddMessage(userMsg);
    setInputText("");
    setLoading(true);

    try {
      // Build conversation history for multi-turn continuity
      const conversationHistory = coachMessages.slice(-6).map((m) => ({
        role: m.sender === "coach" ? "model" : "user",
        text: m.text
      }));

      const response = await fetch("/api/coach/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          goals,
          events,
          availability,
          coachPersona,
          conversationHistory
        })
      });

      const data = await response.json();
      
      const coachMsg: CoachMessage = {
        id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sender: "coach",
        text: data.text || data.error || "I analyzed your routine! Staying consistent with your scheduled daily blocks is the key to steady progress.",
        timestamp: new Date().toISOString()
      };
      onAddMessage(coachMsg);
    } catch (err) {
      console.error("AI Coach query failed:", err);
      const errorMsg: CoachMessage = {
        id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sender: "coach",
        text: "I analyzed your routine goals! Consistency with your scheduled focus windows is the single best driver of long-term results.",
        timestamp: new Date().toISOString()
      };
      onAddMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerAnalysis = () => {
    const prompt = "Can you analyze my current set of fitness/study goals against this week's scheduled activities and suggest 3 direct optimizations?";
    handleSendQuestion(prompt);
  };

  const handleTriggerStudyStrategy = () => {
    const prompt = "What are the most effective cognitive learning formats (e.g., active recall, Feynman method, 50/10 focus intervals) to map inside my study slots?";
    handleSendQuestion(prompt);
  };

  return (
    <div className="coach-high-contrast space-y-6" id="ai_routine_coach_view">
      
      {/* 1. TOP SUB-HEADER TABS: HIGH CONTRAST & ACCESSIBLE */}
      <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 p-2 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg" id="aicoach_subnav_tabs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab("chat")}
            id="coach_tab_chat"
            className={`text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === "chat"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Bot className="w-4 h-4 text-indigo-300" />
            <span>Interactive AI Coach</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("digest")}
            id="coach_tab_digest"
            className={`text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === "digest"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <FileText className="w-4 h-4 text-amber-300" />
            <span>Weekly Digest & Insights</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("energy")}
            id="coach_tab_energy"
            className={`text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === "energy"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Zap className="w-4 h-4 text-emerald-300" />
            <span>Smart Energy Scheduling</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("recommendations")}
            id="coach_tab_recommendations"
            className={`text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === "recommendations"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>Routine Recommendations</span>
          </button>
        </div>

        <div className="text-xs text-slate-300 font-semibold px-3 py-1.5 bg-black/40 rounded-xl border border-white/10 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Gemini Intelligence Active</span>
        </div>
      </div>

      {/* 2. CHAT SUB-TAB */}
      {activeSubTab === "chat" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[620px] max-h-[85vh] h-[780px]" id="aicoach_container_grid">
          
          {/* SIDEBAR: SYSTEM INFORMATION & ACTIONS (4 Columns) */}
          <div className="coach-sidebar-panel lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-white/15 p-5 rounded-3xl flex flex-col justify-between space-y-4 shadow-xl overflow-y-auto" id="coach_info_panel">
            <div className="space-y-4">
              
              {/* Header Title */}
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm sm:text-base leading-tight">AI Routine Coach</h3>
                  <p className="text-xs text-slate-300 font-medium">Personalized daily guidance</p>
                </div>
              </div>

              <p className="text-xs text-slate-200 leading-relaxed font-normal">
                Your AI Coach evaluates your calendar sessions, goal targets, and chronotype to answer questions, deconflict hours, and propose custom habit updates.
              </p>

              {/* Instant Action Shortcuts */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Instant Coaching Prompts
                </h4>
                
                <button
                  type="button"
                  id="coach_analyze_routine_btn"
                  onClick={handleTriggerAnalysis}
                  disabled={loading}
                  className="coach-shortcut-btn w-full text-left text-xs bg-white/5 hover:bg-indigo-950/40 border border-white/10 hover:border-indigo-400/40 p-3 rounded-2xl transition flex items-center gap-3 cursor-pointer group"
                >
                  <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl group-hover:scale-105 transition-transform shrink-0">
                    <Sparkles className="w-4 h-4 text-indigo-300" />
                  </div>
                  <div>
                    <span className="coach-shortcut-title font-bold text-white block text-xs">Analyze Weekly Routine</span>
                    <span className="coach-shortcut-subtitle text-xs text-slate-300 font-medium">Scan completion rates & friction points</span>
                  </div>
                </button>

                <button
                  type="button"
                  id="coach_study_strategy_btn"
                  onClick={handleTriggerStudyStrategy}
                  disabled={loading}
                  className="coach-shortcut-btn w-full text-left text-xs bg-white/5 hover:bg-cyan-950/40 border border-white/10 hover:border-cyan-400/40 p-3 rounded-2xl transition flex items-center gap-3 cursor-pointer group"
                >
                  <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl group-hover:scale-105 transition-transform shrink-0">
                    <Brain className="w-4 h-4 text-cyan-300" />
                  </div>
                  <div>
                    <span className="coach-shortcut-title font-bold text-white block text-xs">Suggest Study Strategies</span>
                    <span className="coach-shortcut-subtitle text-xs text-slate-300 font-medium">Active recall & memory retention</span>
                  </div>
                </button>

                <button
                  type="button"
                  id="coach_lazy_procrastination_btn"
                  onClick={() => {
                    const prompt = "I'm feeling unmotivated and lazy today. Please look at my scheduled goals and give me one absurdly easy 2-minute micro-action to get started without overwhelm or guilt.";
                    handleSendQuestion(prompt);
                  }}
                  disabled={loading}
                  className="coach-shortcut-btn w-full text-left text-xs bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400/50 p-3 rounded-2xl transition flex items-center gap-3 cursor-pointer group"
                >
                  <div className="p-2 bg-amber-500/20 text-amber-300 rounded-xl group-hover:scale-105 transition-transform shrink-0">
                    <Zap className="w-4 h-4 fill-current text-amber-300" />
                  </div>
                  <div>
                    <span className="coach-shortcut-title font-bold text-amber-200 block text-xs">Procrastination & Lazy Buster</span>
                    <span className="coach-shortcut-subtitle text-xs text-amber-300 font-medium">120-second micro-action protocol</span>
                  </div>
                </button>
              </div>

              {/* Coach Persona Selector */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Coach Persona</h4>
                  <span className="text-xs text-indigo-300 font-semibold capitalize">{coachPersona} Mode</span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 bg-black/40 p-1.5 rounded-2xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => onUpdatePersona?.("mentor")}
                    className={`coach-persona-btn ${coachPersona === 'mentor' ? 'active' : ''} text-xs py-2 px-2 rounded-xl font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                      coachPersona === "mentor"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span>🌸 Mentor</span>
                    <span className="text-[10px] font-normal opacity-80 hidden sm:inline">Empathetic</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdatePersona?.("drill")}
                    className={`coach-persona-btn ${coachPersona === 'drill' ? 'active' : ''} text-xs py-2 px-2 rounded-xl font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                      coachPersona === "drill"
                        ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span>🏋️ Sergeant</span>
                    <span className="text-[10px] font-normal opacity-80 hidden sm:inline">Discipline</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdatePersona?.("data")}
                    className={`coach-persona-btn ${coachPersona === 'data' ? 'active' : ''} text-xs py-2 px-2 rounded-xl font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                      coachPersona === "data"
                        ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span>📊 Analyst</span>
                    <span className="text-[10px] font-normal opacity-80 hidden sm:inline">Data/Metrics</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium">Gemini 3 Series Engine</span>
              <button
                type="button"
                id="clear_coach_history_btn"
                onClick={onClearMessages}
                className="text-xs text-slate-400 hover:text-rose-400 transition font-bold cursor-pointer py-1 px-2 rounded-lg hover:bg-white/5"
              >
                Clear Chat History
              </button>
            </div>
          </div>

          {/* CHAT CONTAINER STAGE (8 Columns) */}
          <div className="coach-chat-panel lg:col-span-8 bg-slate-900/80 backdrop-blur-md border border-white/15 rounded-3xl flex flex-col h-full overflow-hidden shadow-xl" id="coach_chat_panel">
            
            {/* Chat Log Header Status */}
            <div className="coach-chat-header px-5 py-3 border-b border-white/10 bg-slate-950/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-white">Active Routine Session</span>
                <span className="text-slate-400">• {goals.length} Goals Tracked</span>
              </div>

              <span className="text-xs text-indigo-300 font-medium">
                Persona: <strong className="text-white capitalize">{coachPersona}</strong>
              </span>
            </div>

            {/* Chat Message Stream */}
            <div 
              ref={scrollRef}
              className="flex-1 p-5 overflow-y-auto space-y-4 bg-transparent"
              id="chat_messages_scroller"
            >
              {coachMessages.map((msg) => {
                const isCoach = msg.sender === "coach";
                const { displayText, goalAction } = parseGoalActionFromText(msg.text);
                const isActionApplied = !!appliedGoalActions[msg.id];

                return (
                  <div 
                    key={msg.id} 
                    className={`flex gap-3 max-w-[90%] sm:max-w-[85%] ${isCoach ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                  >
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border font-mono select-none shadow-md ${
                      isCoach 
                        ? "bg-indigo-600 text-white border-indigo-400/40" 
                        : "bg-purple-600 text-white border-purple-400/40"
                    }`}>
                      {isCoach ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>

                    {/* Bubble */}
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-lg ${
                      isCoach 
                        ? "coach-bubble-coach bg-slate-900/95 border border-indigo-500/30 text-slate-100 shadow-indigo-950/40" 
                        : "coach-bubble-user bg-indigo-600 border border-indigo-400/30 text-white shadow-indigo-600/30"
                    }`}>
                      <div id={`msg_bubble_${msg.id}`}>
                        <FormattedCoachMessage text={displayText} isCoach={isCoach} />
                        {isCoach && goalAction && (
                          <GoalActionCard 
                            action={goalAction}
                            isApplied={isActionApplied}
                            goals={goals}
                            onApply={() => handleExecuteGoalAction(msg.id, goalAction)}
                          />
                        )}
                      </div>

                      <span className={`${isCoach ? "coach-timestamp-coach text-slate-400" : "coach-timestamp-user text-indigo-100"} text-xs block mt-2 text-right font-medium`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex gap-3 max-w-[85%] mr-auto items-center p-3 bg-slate-900/70 border border-indigo-500/20 rounded-2xl animate-pulse" id="coach_loading_indicator">
                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 shrink-0 flex items-center justify-center animate-spin">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <span className="text-xs sm:text-sm text-indigo-200 font-bold">AI Coach is thinking and crafting your guidance...</span>
                </div>
              )}
            </div>

            {/* Quick Preset Chips: High Contrast & Accessible */}
            <div className="px-4 py-2.5 flex items-center gap-2 overflow-x-auto border-t border-white/10 bg-slate-950/60" id="coach_preset_prompt_chips" style={{ scrollbarWidth: "none" }}>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 select-none">Quick:</span>
              {[
                { label: "➕ Propose Goal", prompt: "Please analyze my schedule and propose a new goal with recommended targets and time windows for me!" },
                { label: "✏️ Modify Goal", prompt: "Can you review my goals and suggest updates or target modifications to optimize my weekly consistency?" },
                { label: "📊 Analyze Streaks", prompt: "How has my completion streak and consistency score changed this week? Please analyze my metrics and give me a motivational status report." },
                { label: "🏋️ Workout Plan", prompt: "How should I structure my active workout blocks? Can you design a simple but efficient high-intensity routine?" },
                { label: "📚 Study Strategy", prompt: "Can you provide a cognitive learning strategy to get the most out of my scheduled study hours? Explain active recall." },
                { label: "⏱️ Overlap Solver", prompt: "What should I do if my study blocks overlap with family or work events? How do I best reschedule them?" }
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (loading) return;
                    handleSendQuestion(chip.prompt);
                  }}
                  disabled={loading}
                  className="coach-preset-chip text-xs bg-slate-800/90 hover:bg-indigo-600 text-slate-200 hover:text-white border border-white/15 hover:border-indigo-400/40 px-3 py-1.5 rounded-xl transition font-semibold whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Input Panel Footer */}
            <div className="coach-chat-footer p-4 border-t border-white/10 bg-slate-950/90">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendQuestion();
                }} 
                className="flex items-center gap-2.5"
              >
                <input
                  type="text"
                  id="coach_message_input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask anything (e.g. 'How should I structure my 3 workout blocks and intensive math study?')..."
                  disabled={loading}
                  className="coach-input-field flex-1 text-xs sm:text-sm px-4 py-3 bg-slate-900 border border-white/20 rounded-2xl focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 text-white placeholder:text-slate-400 disabled:opacity-50 shadow-inner"
                />
                <button
                  type="submit"
                  id="coach_message_send_btn"
                  disabled={loading || !inputText.trim()}
                  className="coach-send-btn px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition shadow-lg shadow-indigo-600/30 disabled:opacity-40 cursor-pointer flex items-center justify-center shrink-0 font-bold"
                  title="Send Message"
                >
                  <Send className="w-4 h-4 mr-1 sm:mr-1.5" />
                  <span className="hidden sm:inline text-xs">Send</span>
                </button>
              </form>
            </div>

          </div>

        </div>
      )}

      {/* 3. WEEKLY DIGEST & INSIGHTS SUB-TAB */}
      {activeSubTab === "digest" && (
        <div className="coach-digest-panel space-y-6" id="weekly_digest_panel">
          
          {/* Header Action Row */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div>
              <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                AI Weekly Digest & Reflection Report
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Gemini analyzes your productivity patterns, peak cognitive windows, and provides tailored recommendations for next week.
              </p>
            </div>

            <button
              type="button"
              onClick={handleFetchDigest}
              disabled={loadingDigest}
              id="refresh_weekly_digest_btn"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDigest ? "animate-spin" : ""}`} />
              <span>{loadingDigest ? "Generating Insights..." : "Regenerate Digest"}</span>
            </button>
          </div>

          {loadingDigest ? (
            <div className="bg-slate-900/60 border border-white/10 p-12 rounded-3xl text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <p className="text-base font-bold text-white">Analyzing productivity telemetry & peak focus windows...</p>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">Gemini is parsing completion rates, session durations, and schedule friction points.</p>
            </div>
          ) : digestData ? (
            <div className="space-y-6 animate-fade-in">
              
              {/* Top Banner KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-indigo-900/50 via-slate-900/80 to-purple-900/40 border border-indigo-500/30 p-5 rounded-3xl shadow-xl flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">Weekly Reflection Score</span>
                    <h4 className="text-3xl font-black text-white">{digestData.productivityScore}%</h4>
                    <p className="text-xs text-slate-300 font-medium">Goal Completion & Habit Rate</p>
                  </div>
                  <div className="p-3.5 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-400/30">
                    <TrendingUp className="w-8 h-8 text-indigo-300" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-900/50 via-slate-900/80 to-indigo-900/40 border border-amber-500/30 p-5 rounded-3xl shadow-xl flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Peak Focus Window</span>
                    <h4 className="text-xl font-bold text-white">{digestData.peakFocusWindow}</h4>
                    <p className="text-xs text-slate-300 font-medium">Highest Cognitive Output Window</p>
                  </div>
                  <div className="p-3.5 bg-amber-500/20 text-amber-300 rounded-2xl border border-amber-400/30">
                    <Clock className="w-8 h-8 text-amber-300" />
                  </div>
                </div>
              </div>

              {/* Comprehensive Summary Reflection */}
              <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 p-6 rounded-3xl space-y-3 shadow-xl">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Brain className="w-4 h-4 text-cyan-400" />
                  Executive Productivity Reflection
                </h4>
                <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">
                  {digestData.reflectionSummary}
                </p>
              </div>

              {/* 2-Column Grid: Productivity Patterns vs Recommended Adjustments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Identified Productivity Patterns */}
                <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 p-5 rounded-3xl space-y-4 shadow-xl">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Key Productivity Patterns
                  </h4>

                  <ul className="space-y-3">
                    {digestData.productivityPatterns?.map((pattern, idx) => (
                      <li key={idx} className="bg-slate-950/70 border border-white/10 p-3.5 rounded-2xl text-xs sm:text-sm text-slate-100 font-medium flex items-start gap-3">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{pattern}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommended Adjustments */}
                <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 p-5 rounded-3xl space-y-4 shadow-xl">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Recommended Adjustments for Next Week
                  </h4>

                  <ul className="space-y-3">
                    {digestData.recommendedAdjustments?.map((adj, idx) => (
                      <li key={idx} className="bg-slate-950/70 border border-white/10 p-3.5 rounded-2xl text-xs sm:text-sm text-slate-100 font-medium flex items-start gap-3">
                        <ChevronRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>{adj}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

            </div>
          ) : null}

        </div>
      )}

      {/* 4. SMART ENERGY-BASED SCHEDULING SUB-TAB */}
      {activeSubTab === "energy" && (
        <div className="coach-energy-panel space-y-6" id="energy_scheduling_panel">
          
          {/* Top Energy Profile Selection Panel */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 p-5 rounded-3xl space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  Smart Energy-Based AI Scheduling
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Automatically aligns high-focus cognitive goals to peak focus windows, while placing light recovery tasks in slump windows.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunEnergySchedule}
                disabled={loadingEnergy}
                id="run_energy_reschedule_btn"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/30 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <BatteryCharging className={`w-4 h-4 ${loadingEnergy ? "animate-spin" : ""}`} />
                <span>{loadingEnergy ? "Calculating..." : "Run AI Energy Reschedule"}</span>
              </button>
            </div>

            {/* Profile Selector Cards */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Select Your Chronotype / Daily Energy Curve Profile:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <button
                  type="button"
                  onClick={() => setEnergyProfile("lark")}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2.5 ${
                    energyProfile === "lark"
                      ? "bg-amber-500/20 border-amber-400 text-white ring-2 ring-amber-400/40 shadow-lg"
                      : "bg-slate-950/70 border-white/10 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-2 text-amber-300">
                      <Sun className="w-4 h-4 text-amber-400" />
                      Morning Lark
                    </span>
                    {energyProfile === "lark" && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    Peak energy: <strong className="text-white">08:00–12:00 AM</strong>. Light tasks post-lunch.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setEnergyProfile("owl")}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2.5 ${
                    energyProfile === "owl"
                      ? "bg-indigo-500/20 border-indigo-400 text-white ring-2 ring-indigo-400/40 shadow-lg"
                      : "bg-slate-950/70 border-white/10 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-2 text-indigo-300">
                      <Moon className="w-4 h-4 text-indigo-400" />
                      Night Owl
                    </span>
                    {energyProfile === "owl" && <Check className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    Peak energy: <strong className="text-white">18:00–23:00 PM</strong>. Slow start mornings.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setEnergyProfile("balanced")}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2.5 ${
                    energyProfile === "balanced"
                      ? "bg-emerald-500/20 border-emerald-400 text-white ring-2 ring-emerald-400/40 shadow-lg"
                      : "bg-slate-950/70 border-white/10 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-2 text-emerald-300">
                      <BatteryCharging className="w-4 h-4 text-emerald-400" />
                      Balanced Curve
                    </span>
                    {energyProfile === "balanced" && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    Peaks: <strong className="text-white">09:00–12:00 AM</strong> & <strong className="text-white">16:00–18:00 PM</strong>.
                  </p>
                </button>
              </div>
            </div>

          </div>

          {/* Goal Energy Intensity Demands Breakdown */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 p-5 rounded-3xl space-y-3.5 shadow-xl">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Goal Cognitive Intensity & Energy Slot Mapping
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              {goals.map((g) => {
                const nameLower = (g.name || "").toLowerCase();
                const isHighDemand = nameLower.includes("python") || nameLower.includes("react") || nameLower.includes("ai") || g.type === "study";
                const isLightDemand = g.type === "workout" || nameLower.includes("cardio") || nameLower.includes("stretch");

                const demandLabel = isHighDemand 
                  ? "🔥 High Cognitive Demand" 
                  : isLightDemand 
                  ? "🍵 Light / Recovery" 
                  : "⚡ Moderate Demand";

                const demandBadgeClass = isHighDemand
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : isLightDemand
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40";

                return (
                  <div key={g.id} className="bg-slate-950/70 border border-white/10 p-4 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[170px]">{g.name}</span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${demandBadgeClass}`}>
                        {demandLabel}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-medium">
                      Target: {g.weeklyTarget}x/week ({g.durationMinutes}m) • Preferred: {g.timePreference}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Energy Schedule Preview Results */}
          {loadingEnergy ? (
            <div className="bg-slate-900/60 border border-white/10 p-12 rounded-3xl text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-base font-bold text-white">Generating energy-aligned schedule blocks...</p>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">Mapping high-focus sessions into peak cognitive windows.</p>
            </div>
          ) : energyResult ? (
            <div className="bg-slate-900/80 backdrop-blur-md border border-white/15 p-6 rounded-3xl space-y-5 shadow-xl animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    AI Energy Schedule Optimization Plan
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-200 mt-1 font-medium">{energyResult.summary}</p>
                </div>

                <button
                  type="button"
                  onClick={handleApplySchedule}
                  disabled={scheduleApplied}
                  id="apply_energy_schedule_to_calendar_btn"
                  className={`text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
                    scheduleApplied 
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                  }`}
                >
                  {scheduleApplied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Schedule Applied!</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4" />
                      <span>Apply Schedule to Calendar</span>
                    </>
                  )}
                </button>
              </div>

              {/* Preview List of Generated Energy Events */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Generated Energy-Optimized Slots Preview ({energyResult.newEvents.length} Sessions):
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {energyResult.newEvents.map((evt) => {
                    const startDate = new Date(evt.start);
                    const isHigh = evt.notes?.includes("HIGH");

                    return (
                      <div key={evt.id} className="bg-slate-950/70 border border-white/10 p-3.5 rounded-2xl space-y-1.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[180px]">{evt.title}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                            isHigh 
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/40" 
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          }`}>
                            {startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium">
                          {startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                        <p className="text-xs text-slate-400 italic truncate">{evt.notes}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          ) : null}

        </div>
      )}

      {/* 5. GOAL & ROUTINE RECOMMENDATION ENGINE SUB-TAB */}
      {activeSubTab === "recommendations" && (
        <div className="space-y-6">
          <GoalRecommendationEngine
            goals={goals}
            events={events}
            availability={availability}
            energyProfile={userEnergyProfile}
            onAddGoal={onAddGoal}
            onBulkAddEvents={onBulkAddEvents}
            onAddNotification={onAddNotification}
          />
        </div>
      )}

    </div>
  );
}
