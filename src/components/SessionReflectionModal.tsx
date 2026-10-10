import React, { useState } from "react";
import { 
  Sparkles, 
  X, 
  CheckCircle2, 
  Star, 
  BookOpen, 
  Brain, 
  ExternalLink,
  Flame,
  ArrowRight
} from "lucide-react";
import { CalendarEvent, Goal } from "../types";

interface SessionReflectionModalProps {
  event: CalendarEvent;
  goal?: Goal;
  durationMinutes: number;
  onSaveReflection: (eventId: string, takeaway: string, confidence: "mastered" | "good" | "needs_review") => void;
  onSkip: () => void;
}

export default function SessionReflectionModal({
  event,
  goal,
  durationMinutes,
  onSaveReflection,
  onSkip
}: SessionReflectionModalProps) {
  const [takeaway, setTakeaway] = useState("");
  const [confidence, setConfidence] = useState<"mastered" | "good" | "needs_review">("good");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveReflection(event.id, takeaway.trim(), confidence);
  };

  const goalName = goal?.name || event.title;
  const goalColor = goal?.color || "#6366f1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl shadow-2xl overflow-hidden p-6 text-white relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close / Skip button */}
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition cursor-pointer"
          title="Skip reflection"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebration Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0">
            <CheckCircle2 className="w-6 h-6 text-slate-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-widest uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                Session Complete! +50 XP
              </span>
              <span className="text-xs text-slate-400">
                {durationMinutes} mins logged
              </span>
            </div>
            <h3 className="text-lg font-black tracking-tight mt-0.5" style={{ color: goalColor }}>
              {goalName}
            </h3>
          </div>
        </div>

        {/* 30-Second Reflection Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-4">
            <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-yellow-400" />
              <span>30-Second Knowledge Takeaway:</span>
            </label>
            <p className="text-[11px] text-slate-400 mb-2.5">
              What key concept, tool, or command did you master today? (Saved to your Learning Log for interview & exam review).
            </p>
            <textarea
              value={takeaway}
              onChange={(e) => setTakeaway(e.target.value)}
              placeholder="e.g., Configured Wireshark display filters and identified TCP 3-way handshake flags (SYN, SYN-ACK, ACK)..."
              rows={3}
              autoFocus
              className="w-full bg-slate-900 border border-white/15 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl p-3 text-xs sm:text-sm text-white placeholder-slate-500 transition outline-hidden resize-none"
            />
          </div>

          {/* Confidence Rating */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              How do you feel about this material?
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setConfidence("mastered")}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                  confidence === "mastered"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20"
                    : "bg-slate-950/40 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center text-yellow-400">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <Star className="w-3.5 h-3.5 fill-current" />
                </div>
                <span>Mastered</span>
              </button>

              <button
                type="button"
                onClick={() => setConfidence("good")}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                  confidence === "good"
                    ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20"
                    : "bg-slate-950/40 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center text-indigo-400">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <Star className="w-3.5 h-3.5 opacity-30" />
                </div>
                <span>Solid</span>
              </button>

              <button
                type="button"
                onClick={() => setConfidence("needs_review")}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                  confidence === "needs_review"
                    ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm shadow-amber-500/20"
                    : "bg-slate-950/40 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <Star className="w-3.5 h-3.5 opacity-30" />
                  <Star className="w-3.5 h-3.5 opacity-30" />
                </div>
                <span>Review Soon</span>
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onSkip}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              Skip for Now
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center gap-2"
            >
              <span>Save to Learning Vault</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
