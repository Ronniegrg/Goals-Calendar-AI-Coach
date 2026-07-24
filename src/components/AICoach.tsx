import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  Bot, 
  RefreshCw, 
  Activity, 
  Brain, 
  Compass, 
  User,
  FileText,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Sun,
  Moon,
  BatteryCharging,
  Calendar,
  Check,
  ChevronRight,
  Flame,
  Award,
  Layers
} from "lucide-react";
import { CoachMessage, Goal, CalendarEvent, AvailabilityWindow } from "../types";

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
  onApplyEnergySchedule
}: AICoachProps) {
  const [activeSubTab, setActiveSubTab] = useState<"chat" | "digest" | "energy">("chat");

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

    if (!textToSend) {
      const userMsg: CoachMessage = {
        id: `u_${Date.now()}`,
        sender: "user",
        text: prompt,
        timestamp: new Date().toISOString()
      };
      onAddMessage(userMsg);
      setInputText("");
    }

    setLoading(true);

    try {
      const response = await fetch("/api/coach/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          goals,
          events,
          availability,
          coachPersona
        })
      });

      const data = await response.json();
      
      const coachMsg: CoachMessage = {
        id: `c_${Date.now()}`,
        sender: "coach",
        text: data.text || "I was unable to analyze that schedule block, but remember: consistency translates to progress!",
        timestamp: new Date().toISOString()
      };
      onAddMessage(coachMsg);
    } catch (err) {
      console.error("AI Coach query failed:", err);
      const errorMsg: CoachMessage = {
        id: `c_${Date.now()}`,
        sender: "coach",
        text: "My virtual receptors failed to sync. Please verify connection or key setup.",
        timestamp: new Date().toISOString()
      };
      onAddMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerAnalysis = () => {
    const prompt = "Can you analyze my current set of fitness/study goals against this week's scheduled activities and suggest 3 optimizations?";
    const userMsg: CoachMessage = {
      id: `u_${Date.now()}`,
      sender: "user",
      text: "📊 [Trigger Action: Comprehensive Routine Optimization Review]",
      timestamp: new Date().toISOString()
    };
    onAddMessage(userMsg);
    handleSendQuestion(prompt);
  };

  const handleTriggerStudyStrategy = () => {
    const prompt = "What are some highly effective study formats (e.g. Pomodoro, active recall) to map inside my study slots?";
    const userMsg: CoachMessage = {
      id: `u_${Date.now()}`,
      sender: "user",
      text: "🧠 [Trigger Action: Smart Learning strategies]",
      timestamp: new Date().toISOString()
    };
    onAddMessage(userMsg);
    handleSendQuestion(prompt);
  };

  return (
    <div className="space-y-6">
      
      {/* SUB-HEADER TABS FOR AI COACH */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-2 rounded-2xl flex flex-wrap items-center justify-between gap-3" id="aicoach_subnav_tabs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab("chat")}
            id="coach_tab_chat"
            className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === "chat"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Bot className="w-4 h-4 text-indigo-300" />
            <span>Interactive AI Chat</span>
          </button>

          <button
            onClick={() => setActiveSubTab("digest")}
            id="coach_tab_digest"
            className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === "digest"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <FileText className="w-4 h-4 text-amber-300" />
            <span>Weekly Digest & Insights</span>
          </button>

          <button
            onClick={() => setActiveSubTab("energy")}
            id="coach_tab_energy"
            className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === "energy"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Zap className="w-4 h-4 text-emerald-300" />
            <span>Smart Energy Scheduling</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-400 font-mono px-3 py-1 bg-black/25 rounded-xl border border-white/5 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Gemini AI Engine Active</span>
        </div>
      </div>

      {/* 1. CHAT SUB-TAB */}
      {activeSubTab === "chat" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[720px]" id="aicoach_container_grid">
          
          {/* SIDEBAR: SYSTEM INFORMATION & ACTIONS */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex flex-col justify-between h-full space-y-4" id="coach_info_panel">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-400" />
                <h3 className="font-sans font-bold text-white text-sm">Dynamic Optimizations</h3>
              </div>
              
              <p className="text-xs text-slate-300 leading-relaxed">
                Your AI Routine Coach accesses your active schedule, sleep/hours preference, and workout frequency to deliver targeted suggestions.
              </p>

              <div className="space-y-2.5">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Instant Tasks</h4>
                
                <button
                  id="coach_analyze_routine_btn"
                  onClick={handleTriggerAnalysis}
                  disabled={loading}
                  className="w-full text-left text-xs bg-white/5 hover:bg-indigo-950/20 border border-white/10 hover:border-indigo-400/30 p-3 rounded-xl transition flex items-center gap-2.5 cursor-pointer"
                >
                  <div className="p-1.5 bg-indigo-500/15 text-indigo-300 rounded-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 block text-[11px]">Analyze Weekly Routine</span>
                    <span className="text-[9px] text-slate-400">Scan consistency index & conflicts</span>
                  </div>
                </button>

                <button
                  id="coach_study_strategy_btn"
                  onClick={handleTriggerStudyStrategy}
                  disabled={loading}
                  className="w-full text-left text-xs bg-white/5 hover:bg-cyan-950/20 border border-white/10 hover:border-cyan-400/30 p-3 rounded-xl transition flex items-center gap-2.5 cursor-pointer"
                >
                  <div className="p-1.5 bg-cyan-500/15 text-cyan-300 rounded-lg">
                    <Brain className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 block text-[11px]">Suggest Study Strategies</span>
                    <span className="text-[9px] text-slate-400">Pomodoro & memory techniques</span>
                  </div>
                </button>
              </div>

              <div className="space-y-2 border-t border-white/5 pt-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Coach Persona</h4>
                <div className="grid grid-cols-3 gap-1 bg-black/25 p-1 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => onUpdatePersona?.("mentor")}
                    className={`text-[10px] py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      coachPersona === "mentor"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Mentor
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdatePersona?.("drill")}
                    className={`text-[10px] py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      coachPersona === "drill"
                        ? "bg-rose-600 text-white shadow-md shadow-rose-600/10"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Sergeant
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdatePersona?.("data")}
                    className={`text-[10px] py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      coachPersona === "data"
                        ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/10"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Analyst
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 select-none font-medium">Powered by Gemini 1.5 Pro</span>
              <button
                id="clear_coach_history_btn"
                onClick={onClearMessages}
                className="text-[10px] text-slate-400 hover:text-red-400 transition font-bold cursor-pointer"
              >
                Clear Log
              </button>
            </div>
          </div>

          {/* CHAT CONTAINER STAGE */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl flex flex-col h-full lg:col-span-2 overflow-hidden" id="coach_chat_panel">
            
            {/* Chat log body */}
            <div 
              ref={scrollRef}
              className="flex-1 p-5 overflow-y-auto space-y-4 bg-transparent"
              id="chat_messages_scroller"
            >
              {coachMessages.map((msg) => {
                const isCoach = msg.sender === "coach";
                return (
                  <div 
                    key={msg.id} 
                    className={`flex gap-3 max-w-[85%] ${isCoach ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                  >
                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border font-mono select-none ${
                      isCoach ? "bg-indigo-600 text-white border-transparent" : "bg-white/10 text-white border-white/10"
                    }`}>
                      {isCoach ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>

                    <div className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-md ${
                      isCoach 
                        ? "bg-white/10 border border-white/10 text-slate-100" 
                        : "bg-[#131525]/85 border border-white/5 text-slate-100"
                    }`}>
                      <div className="whitespace-pre-line space-y-1.5 font-sans font-medium" id={`msg_bubble_${msg.id}`}>
                        {msg.text}
                      </div>

                      <span className="text-[9px] opacity-50 block mt-2 text-right text-slate-300">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex gap-3 max-w-[80%] mr-auto items-center" id="coach_loading_indicator">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 shrink-0 flex items-center justify-center animate-spin">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-slate-400 font-bold tracking-tight italic">AI Coach is calculating routine optimizations...</span>
                </div>
              )}
            </div>

            {/* Quick interactive coaching preset chips */}
            <div className="px-4 py-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-white/10" id="coach_preset_prompt_chips" style={{ scrollbarWidth: "none" }}>
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest shrink-0 select-none">Quick:</span>
              {[
                { label: "📊 Analyze Streaks", prompt: "How has my completion streak and consistency score changed this week? Please analyze my metrics and give me a motivational status report." },
                { label: "🏋️ Workout Advice", prompt: "How should I structure my active workout blocks? Can you design a simple but efficient high-intensity routine?" },
                { label: "📚 Study Strategy", prompt: "Can you provide a cognitive learning strategy to get the most out of my scheduled study hours? Explain active recall." },
                { label: "⏱️ Overlap Solver", prompt: "What should I do if my study blocks overlap with family or work events? How do I best reschedule them?" }
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (loading) return;
                    const userMsg: CoachMessage = {
                      id: `u_${Date.now()}_chip_${idx}`,
                      sender: "user",
                      text: `💡 [Trigger Quick Action: ${chip.label}]`,
                      timestamp: new Date().toISOString()
                    };
                    onAddMessage(userMsg);
                    handleSendQuestion(chip.prompt);
                  }}
                  disabled={loading}
                  className="text-[10px] bg-white/5 hover:bg-indigo-500/15 text-indigo-300 hover:text-white border border-white/10 hover:border-indigo-400/35 px-2.5 py-1 rounded-xl transition font-bold whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Input panel footer */}
            <div className="p-4 border-t border-white/10 bg-white/5">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendQuestion();
                }} 
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  id="coach_message_input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask anything (e.g. How do I balance 3 workout blocks and intensive math study?)..."
                  disabled={loading}
                  className="flex-1 text-xs px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-455 text-white placeholder:text-slate-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  id="coach_message_send_btn"
                  disabled={loading || !inputText.trim()}
                  className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-lg shadow-indigo-600/20 disabled:opacity-40 cursor-pointer"
                  title="Send Message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

          </div>

        </div>
      )}

      {/* 2. WEEKLY DIGEST & INSIGHTS SUB-TAB */}
      {activeSubTab === "digest" && (
        <div className="space-y-6" id="weekly_digest_panel">
          
          {/* Header Action Row */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-sans font-bold text-white text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                AI Weekly Digest & Reflection Report
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Gemini analyzes your productivity patterns, peak cognitive windows, and provides tailored recommendations for next week.
              </p>
            </div>

            <button
              onClick={handleFetchDigest}
              disabled={loadingDigest}
              id="refresh_weekly_digest_btn"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDigest ? "animate-spin" : ""}`} />
              <span>{loadingDigest ? "Generating Insights..." : "Regenerate Digest"}</span>
            </button>
          </div>

          {loadingDigest ? (
            <div className="bg-white/5 border border-white/10 p-12 rounded-2xl text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <p className="text-sm font-bold text-white">Analyzing productivity telemetry & peak focus windows...</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">Gemini is parsing completion rates, session durations, and schedule friction points.</p>
            </div>
          ) : digestData ? (
            <div className="space-y-6 animate-fade-in">
              
              {/* Top Banner KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/60 border border-indigo-500/20 p-5 rounded-2xl shadow-xl flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Weekly Reflection Score</span>
                    <h4 className="text-3xl font-black text-white">{digestData.productivityScore}%</h4>
                    <p className="text-[11px] text-slate-300 font-medium">Goal Completion & Habit Rate</p>
                  </div>
                  <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-2xl">
                    <TrendingUp className="w-8 h-8 text-indigo-400" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-900/40 to-slate-900/60 border border-amber-500/20 p-5 rounded-2xl shadow-xl flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Peak Focus Window</span>
                    <h4 className="text-lg font-bold text-white">{digestData.peakFocusWindow}</h4>
                    <p className="text-[11px] text-slate-300 font-medium">Highest Cognitive Output Window</p>
                  </div>
                  <div className="p-3 bg-amber-500/20 text-amber-300 rounded-2xl">
                    <Clock className="w-8 h-8 text-amber-400" />
                  </div>
                </div>
              </div>

              {/* Comprehensive Summary Reflection */}
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                  <Brain className="w-4 h-4 text-cyan-400" />
                  Executive Productivity Reflection
                </h4>
                <p className="text-sm text-slate-100 leading-relaxed font-medium">
                  {digestData.reflectionSummary}
                </p>
              </div>

              {/* 2-Column Grid: Productivity Patterns vs Recommended Adjustments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Identified Productivity Patterns */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2 border-b border-white/10 pb-3">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Key Productivity Patterns
                  </h4>

                  <ul className="space-y-3">
                    {digestData.productivityPatterns?.map((pattern, idx) => (
                      <li key={idx} className="bg-black/25 border border-white/5 p-3.5 rounded-xl text-xs text-slate-200 font-medium flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{pattern}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommended Adjustments */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2 border-b border-white/10 pb-3">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Recommended Adjustments for Next Week
                  </h4>

                  <ul className="space-y-3">
                    {digestData.recommendedAdjustments?.map((adj, idx) => (
                      <li key={idx} className="bg-black/25 border border-white/5 p-3.5 rounded-xl text-xs text-slate-200 font-medium flex items-start gap-2.5">
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

      {/* 3. SMART ENERGY-BASED SCHEDULING SUB-TAB */}
      {activeSubTab === "energy" && (
        <div className="space-y-6" id="energy_scheduling_panel">
          
          {/* Top Energy Profile Selection Panel */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h3 className="font-sans font-bold text-white text-base flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  Smart Energy-Based AI Scheduling
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Automatically aligns high-focus cognitive goals (e.g. Python AI Masterclass) to peak focus windows, while placing light routines in recovery windows.
                </p>
              </div>

              <button
                onClick={handleRunEnergySchedule}
                disabled={loadingEnergy}
                id="run_energy_reschedule_btn"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <BatteryCharging className={`w-4 h-4 ${loadingEnergy ? "animate-spin" : ""}`} />
                <span>{loadingEnergy ? "Calculating..." : "Run AI Energy Reschedule"}</span>
              </button>
            </div>

            {/* Profile Selector Cards */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Select Your Chronotype / Daily Energy Curve Profile:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setEnergyProfile("lark")}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                    energyProfile === "lark"
                      ? "bg-amber-500/15 border-amber-500/50 text-white ring-2 ring-amber-400/30"
                      : "bg-black/25 border-white/10 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-amber-300">
                      <Sun className="w-4 h-4 text-amber-400" />
                      Morning Lark
                    </span>
                    {energyProfile === "lark" && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Peak energy: <strong>08:00–12:00 AM</strong>. Light tasks post-lunch.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setEnergyProfile("owl")}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                    energyProfile === "owl"
                      ? "bg-indigo-500/15 border-indigo-500/50 text-white ring-2 ring-indigo-400/30"
                      : "bg-black/25 border-white/10 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-indigo-300">
                      <Moon className="w-4 h-4 text-indigo-400" />
                      Night Owl
                    </span>
                    {energyProfile === "owl" && <Check className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Peak energy: <strong>18:00–23:00 PM</strong>. Slow start mornings.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setEnergyProfile("balanced")}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                    energyProfile === "balanced"
                      ? "bg-emerald-500/15 border-emerald-500/50 text-white ring-2 ring-emerald-400/30"
                      : "bg-black/25 border-white/10 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-300">
                      <BatteryCharging className="w-4 h-4 text-emerald-400" />
                      Balanced Curve
                    </span>
                    {energyProfile === "balanced" && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Peaks: <strong>09:00–12:00 AM</strong> & <strong>16:00–18:00 PM</strong>.
                  </p>
                </button>
              </div>
            </div>

          </div>

          {/* Goal Energy Intensity Demands Breakdown */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Goal Cognitive Intensity & Energy Slot Mapping
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
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
                  ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                  : isLightDemand
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";

                return (
                  <div key={g.id} className="bg-black/25 border border-white/5 p-3.5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white truncate max-w-[170px]">{g.name}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${demandBadgeClass}`}>
                        {demandLabel}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400">
                      Target: {g.weeklyTarget}x/week ({g.durationMinutes}m) • Preferred: {g.timePreference}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Energy Schedule Preview Results */}
          {loadingEnergy ? (
            <div className="bg-white/5 border border-white/10 p-12 rounded-2xl text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-sm font-bold text-white">Generating energy-aligned schedule blocks...</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">Mapping high-focus sessions into peak cognitive windows.</p>
            </div>
          ) : energyResult ? (
            <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    AI Energy Schedule Optimization Plan
                  </h4>
                  <p className="text-xs text-slate-200 mt-1 font-medium">{energyResult.summary}</p>
                </div>

                <button
                  onClick={handleApplySchedule}
                  disabled={scheduleApplied}
                  id="apply_energy_schedule_to_calendar_btn"
                  className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
                    scheduleApplied 
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
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
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Generated Energy-Optimized Slots Preview ({energyResult.newEvents.length} Sessions):
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {energyResult.newEvents.map((evt) => {
                    const startDate = new Date(evt.start);
                    const isHigh = evt.notes?.includes("HIGH");

                    return (
                      <div key={evt.id} className="bg-black/30 border border-white/10 p-3 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white truncate max-w-[180px]">{evt.title}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                            isHigh ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
                          }`}>
                            {startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 font-mono">
                          {startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                        <p className="text-[9px] text-slate-400 italic truncate">{evt.notes}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          ) : null}

        </div>
      )}

    </div>
  );
}

