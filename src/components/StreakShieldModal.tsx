import React, { useState, useEffect } from "react";
import {
  Shield,
  Zap,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Flame,
  Plus,
  X,
  History,
  Info,
} from "lucide-react";
import { CalendarEvent, Goal, StreakShieldBank } from "../types";
import {
  getStreakShieldBank,
  useFreezeToken,
  earnToken,
  rescueWithWeekendBuffer,
  isDateShielded,
} from "../lib/streakProtection";

interface StreakShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  goals: Goal[];
  onUpdateEvents: (newEvents: CalendarEvent[]) => void;
  onNotify?: (title: string, message: string, type: "success" | "warning" | "upcoming") => void;
}

export const StreakShieldModal: React.FC<StreakShieldModalProps> = ({
  isOpen,
  onClose,
  events,
  goals,
  onUpdateEvents,
  onNotify,
}) => {
  const [bank, setBank] = useState<StreakShieldBank>(getStreakShieldBank);
  const [selectedFreezeDate, setSelectedFreezeDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [freezeReason, setFreezeReason] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"rescue" | "plan" | "history">("rescue");
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    setBank(getStreakShieldBank());
    const handleUpdate = (e: any) => {
      if (e.detail) setBank(e.detail);
    };
    window.addEventListener("streak-bank-updated", handleUpdate);
    return () => window.removeEventListener("streak-bank-updated", handleUpdate);
  }, [isOpen]);

  if (!isOpen) return null;

  // Identify missed/overdue uncompleted sessions from the last 3 days
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const missedSessions = events.filter(evt => {
    if (evt.completed) return false;
    const evtEnd = new Date(evt.end);
    // Was scheduled in the past 72 hours, before now
    const isPast = evtEnd.getTime() < now.getTime() && evtEnd.getTime() > threeDaysAgo.getTime();
    return isPast;
  }).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

  const handleUseFreezeForDate = (dateStr: string, goalName?: string) => {
    const res = useFreezeToken(dateStr, goalName, freezeReason || undefined);
    if (res.success) {
      setBank(res.bank);
      setFeedbackMsg({ text: res.message, type: "success" });
      setFreezeReason("");
      if (onNotify) onNotify("Streak Shield Activated 🛡️", res.message, "success");
    } else {
      setFeedbackMsg({ text: res.message, type: "error" });
    }
  };

  const handleWeekendCatchUp = (session: CalendarEvent) => {
    const res = rescueWithWeekendBuffer(session, events);
    onUpdateEvents(res.updatedEvents);
    setBank(res.bank);
    setFeedbackMsg({ text: res.message, type: "success" });
    if (onNotify) onNotify("Session Rescheduled 🚀", res.message, "success");
  };

  const handleClaimWeeklyBonus = () => {
    const res = earnToken("Weekly Consistency Bonus: Claimed for active habit maintenance");
    if (res.success) {
      setBank(res.bank);
      setFeedbackMsg({ text: res.message, type: "success" });
      if (onNotify) onNotify("Token Claimed! 🎉", res.message, "success");
    } else {
      setFeedbackMsg({ text: res.message, type: "error" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col text-white">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border-b border-indigo-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-400 shadow-inner">
              <Shield className="w-5 h-5 text-indigo-400 fill-indigo-400/20" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Streak Protection & Buffer Bank
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-extrabold uppercase tracking-wider">
                  Live Guard
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Rescue missed sessions, freeze streaks guilt-free, and bank catch-up slots.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK BANNER */}
        {feedbackMsg && (
          <div
            className={`px-6 py-2.5 text-xs font-bold flex items-center justify-between border-b ${
              feedbackMsg.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-300"
                : "bg-rose-950/60 border-rose-500/30 text-rose-300"
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              onClick={() => setFeedbackMsg(null)}
              className="text-xs hover:underline cursor-pointer opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* BUFFER BANK WALLET ROW */}
        <div className="px-6 py-4 bg-white/5 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Flex Tokens Available</span>
              <span className="text-xs text-slate-500">({bank.tokens}/{bank.maxTokens})</span>
            </div>
            
            {/* Visual Token Shields */}
            <div className="flex items-center gap-2">
              {Array.from({ length: bank.maxTokens }).map((_, i) => {
                const isFilled = i < bank.tokens;
                return (
                  <div
                    key={i}
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                      isFilled
                        ? "bg-gradient-to-br from-amber-400 to-amber-600 border-amber-300/60 text-slate-950 shadow-lg shadow-amber-500/20 scale-105"
                        : "bg-white/5 border-white/10 text-slate-600"
                    }`}
                    title={isFilled ? "Active Flex Token" : "Empty Token Slot"}
                  >
                    <Shield className={`w-4 h-4 ${isFilled ? "fill-slate-950" : ""}`} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClaimWeeklyBonus}
              disabled={bank.tokens >= bank.maxTokens}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                bank.tokens >= bank.maxTokens
                  ? "bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 active:scale-95"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Claim Consistency Bonus (+1)</span>
            </button>
          </div>
        </div>

        {/* TAB CONTROLS */}
        <div className="px-6 pt-3 border-b border-white/10 flex space-x-4">
          <button
            onClick={() => setActiveTab("rescue")}
            className={`pb-2.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "rescue"
                ? "border-indigo-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Emergency Rescue</span>
            {missedSessions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-extrabold">
                {missedSessions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("plan")}
            className={`pb-2.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "plan"
                ? "border-indigo-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
            <span>Pre-Emptive Freeze</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`pb-2.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "history"
                ? "border-indigo-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span>Shield Audit Log</span>
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* TAB 1: EMERGENCY RESCUE */}
          {activeTab === "rescue" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-400" />
                    Overdue Sessions at Risk
                  </h4>
                  <p className="text-xs text-slate-400">
                    Sessions missed in the past 72 hours. Protect your streak with a Flex Token or shift into a weekend buffer.
                  </p>
                </div>
              </div>

              {missedSessions.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h5 className="text-sm font-bold text-white">All Clear! No Overdue Sessions</h5>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Your routines are 100% up to date. You can still pre-freeze upcoming dates if you have travel or exams coming up.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {missedSessions.map(session => {
                    const sessionDateStr = session.start.split("T")[0];
                    const isShielded = isDateShielded(sessionDateStr, bank);
                    const sessionStart = new Date(session.start);
                    const durationMinutes = Math.round((new Date(session.end).getTime() - sessionStart.getTime()) / 60000);

                    return (
                      <div
                        key={session.id}
                        className="p-4 rounded-2xl bg-white/5 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-amber-400/50"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{session.title}</span>
                            {isShielded ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 font-extrabold flex items-center gap-1">
                                <Shield className="w-3 h-3 text-indigo-400" />
                                Streak Shielded
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Overdue
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span>
                              {sessionStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at{" "}
                              {sessionStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </span>
                            <span>•</span>
                            <span>{durationMinutes} mins</span>
                          </div>
                        </div>

                        {/* Rescue Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Option A: Weekend Catch-Up */}
                          <button
                            type="button"
                            onClick={() => handleWeekendCatchUp(session)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/80 hover:bg-indigo-600 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                            title="Auto-place this session into an open weekend buffer block"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                            <span>Weekend Buffer</span>
                          </button>

                          {/* Option B: Use Freeze Token */}
                          {!isShielded && (
                            <button
                              type="button"
                              onClick={() => handleUseFreezeForDate(sessionDateStr, session.title)}
                              disabled={bank.tokens <= 0}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                bank.tokens <= 0
                                  ? "bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed"
                                  : "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 active:scale-95"
                              }`}
                              title="Spend 1 Flex Token to protect your streak"
                            >
                              <Shield className="w-3.5 h-3.5 text-amber-400" />
                              <span>Spend 1 Token</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PRE-EMPTIVE FREEZE */}
          {activeTab === "plan" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-2">
                <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                  <Info className="w-4 h-4" />
                  <span>Planning Travel, Rest, or Exams?</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Freeze an upcoming date in advance using a Flex Token. When a date is frozen, zero missed sessions will penalize your streak or trigger overdue warnings.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Select Date to Shield</label>
                  <input
                    type="date"
                    value={selectedFreezeDate}
                    onChange={e => setSelectedFreezeDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Reason / Note (Optional)</label>
                  <input
                    type="text"
                    value={freezeReason}
                    onChange={e => setFreezeReason(e.target.value)}
                    placeholder="e.g. Travel Day, Final Exams, Family Event"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleUseFreezeForDate(selectedFreezeDate)}
                  disabled={bank.tokens <= 0 || isDateShielded(selectedFreezeDate, bank)}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    bank.tokens <= 0 || isDateShielded(selectedFreezeDate, bank)
                      ? "bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 active:scale-98"
                  }`}
                >
                  <Shield className="w-4 h-4 text-indigo-200" />
                  <span>
                    {isDateShielded(selectedFreezeDate, bank)
                      ? "Date Already Shielded 🛡️"
                      : `Freeze Selected Date (Costs 1 Token)`}
                  </span>
                </button>
              </div>

              {/* ACTIVE FROZEN DATES */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Currently Shielded Dates</h5>
                {bank.frozenDates.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No frozen dates currently active.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {bank.frozenDates.map(dateStr => (
                      <span
                        key={dateStr}
                        className="px-3 py-1 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold flex items-center gap-1.5"
                      >
                        <Shield className="w-3 h-3 text-indigo-400" />
                        <span>{dateStr}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT HISTORY */}
          {activeTab === "history" && (
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Protection Log & Audit Trail</h5>
              {bank.history.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No history records yet.</p>
              ) : (
                <div className="space-y-2">
                  {bank.history.map(record => (
                    <div
                      key={record.id}
                      className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            record.type === "freeze_used"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                              : record.type === "weekend_catchup"
                              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-400/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                          }`}>
                            {record.type.replace("_", " ")}
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            {new Date(record.timestamp).toLocaleDateString()} at{" "}
                            {new Date(record.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-slate-200">{record.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Streaks are protected automatically when frozen</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
