import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  Bot, 
  RefreshCw, 
  Activity, 
  Brain, 
  Compass, 
  User 
} from "lucide-react";
import { CoachMessage, Goal, CalendarEvent, AvailabilityWindow } from "../types";

interface AICoachProps {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  coachMessages: CoachMessage[];
  onAddMessage: (msg: CoachMessage) => void;
  onClearMessages: () => void;
}

export default function AICoach({
  goals,
  events,
  availability,
  coachMessages,
  onAddMessage,
  onClearMessages
}: AICoachProps) {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat to bottom when message arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [coachMessages]);

  const handleSendQuestion = async (textToSend?: string) => {
    const prompt = (textToSend || inputText).trim();
    if (!prompt) return;

    if (!textToSend) {
      // Create user message log
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
          availability
        })
      });

      const data = await response.json();
      
      const coachMsg: CoachMessage = {
        id: `c_${Date.now()}`,
        sender: "coach",
        text: data.text || "I was unable to analyze that schedule block, but remember: consistency translates to progress! Reach deep today.",
        timestamp: new Date().toISOString()
      };
      onAddMessage(coachMsg);
    } catch (err) {
      console.error("AI Coach query failed:", err);
      const errorMsg: CoachMessage = {
        id: `c_${Date.now()}`,
        sender: "coach",
        text: "My virtual receptors failed to sync with the solver node. Please check your internet connectivity or key config secret.",
        timestamp: new Date().toISOString()
      };
      onAddMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerAnalysis = () => {
    // Generate custom trigger analysis prompt
    const prompt = "Can you analyze my current set of fitness/study goals against this week's scheduled activities and suggest 3 optimizations to boost my weekly completion rates?";
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
    const prompt = "What are some highly effective study formats (e.g. Pomodoro, active recall) to map inside my study slots to improve comprehension?";
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
                {/* Avatar Icon */}
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border font-mono select-none ${
                  isCoach ? "bg-indigo-600 text-white border-transparent" : "bg-white/10 text-white border-white/10"
                }`}>
                  {isCoach ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>

                {/* Bubble */}
                <div className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-md ${
                  isCoach 
                    ? "bg-white/10 border border-white/10 text-slate-100" 
                    : "bg-[#131525]/85 border border-white/5 text-slate-100"
                }`}>
                  
                  {/* Clean Markdown styled rendering */}
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
              className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-lg shadow-indigo-650/20 disabled:opacity-40 cursor-pointer"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

      </div>

    </div>
  );
}
