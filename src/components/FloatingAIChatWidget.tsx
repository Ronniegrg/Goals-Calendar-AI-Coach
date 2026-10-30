import React, { useState, useEffect } from "react";
import { 
  Bot, 
  Sparkles, 
  X, 
  Maximize2, 
  Minimize2, 
  MessageSquare, 
  ChevronDown,
  Layers,
  Calendar
} from "lucide-react";
import AICoach from "./AICoach";
import { Goal, CalendarEvent, AvailabilityWindow, CoachMessage, UserEnergyProfile } from "../types";

export interface FloatingAIChatWidgetProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  coachMessages: CoachMessage[];
  onAddMessage: (msg: CoachMessage) => void;
  onClearMessages: () => void;
  coachPersona: "mentor" | "drill" | "data";
  onUpdatePersona: (persona: "mentor" | "drill" | "data") => void;
  onAddGoal?: (goal: Omit<Goal, "id" | "completedCount" | "createdAt">) => void;
  onEditGoal?: (goalId: string, updatedFields: Partial<Omit<Goal, "id" | "createdAt">>) => void;
  onDeleteGoal?: (goalId: string) => void;
  userEnergyProfile?: UserEnergyProfile;
  onBulkAddEvents?: (newEvents: CalendarEvent[]) => void;
  onUpdateEvents?: (updatedEvts: CalendarEvent[]) => void;
  onAddNotification?: (title: string, message: string, type: any) => void;
  onApplyEnergySchedule?: (newEvents: CalendarEvent[]) => void;
  externalPrompt?: string;
  onClearExternalPrompt?: () => void;
  onNavigateToCalendar?: () => void;
  onNavigateToGoals?: () => void;
}

export default function FloatingAIChatWidget({
  isOpen,
  onToggleOpen,
  onClose,
  goals,
  events,
  availability,
  coachMessages,
  onAddMessage,
  onClearMessages,
  coachPersona,
  onUpdatePersona,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  userEnergyProfile,
  onBulkAddEvents,
  onUpdateEvents,
  onAddNotification,
  onApplyEnergySchedule,
  externalPrompt,
  onClearExternalPrompt,
  onNavigateToCalendar,
  onNavigateToGoals
}: FloatingAIChatWidgetProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [hasUnreadAlert, setHasUnreadAlert] = useState<boolean>(false);

  // When external prompt arrives, ensure widget is open
  useEffect(() => {
    if (externalPrompt) {
      if (!isOpen) {
        onToggleOpen();
      }
    }
  }, [externalPrompt, isOpen, onToggleOpen]);

  // Flash indicator on new coach messages when closed
  useEffect(() => {
    if (!isOpen && coachMessages.length > 0) {
      const last = coachMessages[coachMessages.length - 1];
      if (last.sender === "coach") {
        setHasUnreadAlert(true);
      }
    } else if (isOpen) {
      setHasUnreadAlert(false);
    }
  }, [coachMessages, isOpen]);

  return (
    <>
      {/* 1. FLOATING CHAT TRIGGER BUTTON (ALWAYS VISIBLE AT BOTTOM) */}
      <div 
        className="fixed z-50 bottom-20 right-4 md:bottom-6 md:right-6 select-none"
        id="floating_ai_chat_fab_container"
      >
        <button
          type="button"
          id="btn_floating_ai_chat_trigger"
          onClick={onToggleOpen}
          className={`group relative flex items-center gap-3 px-4 py-3 rounded-full font-bold text-xs sm:text-sm shadow-2xl transition-all duration-300 cursor-pointer border ${
            isOpen
              ? "bg-slate-900 text-indigo-300 border-indigo-500/50 shadow-indigo-500/20 ring-2 ring-indigo-500/30"
              : "bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border-white/25 shadow-indigo-600/40 hover:shadow-indigo-500/70 hover:scale-105 active:scale-95"
          }`}
          title={isOpen ? "Close AI Routine Coach (Esc)" : "Chat with AI Routine Coach & Goal Builder (Press C)"}
          aria-expanded={isOpen}
          aria-label="Toggle AI Routine Coach chat"
        >
          {/* Animated Glow Halo */}
          {!isOpen && (
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 opacity-30 blur-md group-hover:opacity-75 transition duration-300 -z-10 animate-pulse" />
          )}

          {/* Icon with Live AI Pulse Dot */}
          <div className="relative shrink-0">
            <div className={`p-1.5 rounded-full ${isOpen ? "bg-indigo-500/20 text-indigo-400" : "bg-white/20 text-white"}`}>
              {isOpen ? (
                <X className="w-5 h-5 transition-transform group-hover:rotate-90" />
              ) : (
                <Bot className="w-5 h-5 transition-transform group-hover:scale-110" />
              )}
            </div>
            
            {/* Realtime Live Online Status Dot */}
            {!isOpen && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-slate-900"></span>
              </span>
            )}
            {hasUnreadAlert && !isOpen && (
              <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900 animate-bounce" />
            )}
          </div>

          {/* Text Labels & Sparkles */}
          <div className="flex flex-col items-start leading-tight text-left">
            <div className="flex items-center gap-1.5">
              <span className="tracking-tight font-extrabold">
                {isOpen ? "Close Coach" : "Ask AI Coach"}
              </span>
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            </div>
            <span className={`text-[10px] font-medium hidden sm:inline ${isOpen ? "text-slate-400" : "text-indigo-100"}`}>
              {isOpen ? "Click to minimize" : "Routine & Habit Assistant"}
            </span>
          </div>

          {/* Keyboard shortcut hint */}
          <kbd className="hidden lg:inline px-1.5 py-0.5 text-[9px] font-mono rounded bg-black/40 text-slate-300 border border-white/10 uppercase">
            C
          </kbd>
        </button>
      </div>

      {/* 2. FLOATING / SLIDE-OVER AI CHAT DRAWER */}
      {isOpen && (
        <>
          {/* Backdrop when in expanded modal mode */}
          {isExpanded && (
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity animate-in fade-in"
              onClick={() => setIsExpanded(false)}
            />
          )}

          <div
            id="floating_ai_chat_window"
            className={`fixed z-50 transition-all duration-300 ease-out flex flex-col bg-slate-950/95 border border-indigo-500/30 text-white rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden ${
              isExpanded
                ? "inset-3 sm:inset-6 md:inset-10 lg:inset-16 max-w-6xl mx-auto"
                : "bottom-24 right-4 sm:bottom-20 sm:right-6 w-[94vw] sm:w-[500px] md:w-[540px] h-[640px] max-h-[85vh]"
            } animate-in fade-in slide-in-from-bottom-6`}
          >
            {/* EMBEDDED AI COACH WITH FLOATING CONFIG */}
            <div className="flex-1 overflow-y-auto flex flex-col h-full">
              <AICoach
                goals={goals}
                events={events}
                availability={availability}
                coachMessages={coachMessages}
                onAddMessage={onAddMessage}
                onClearMessages={onClearMessages}
                coachPersona={coachPersona}
                onUpdatePersona={onUpdatePersona}
                onAddGoal={onAddGoal}
                onEditGoal={onEditGoal}
                onDeleteGoal={onDeleteGoal}
                userEnergyProfile={userEnergyProfile}
                onBulkAddEvents={onBulkAddEvents}
                onUpdateEvents={onUpdateEvents}
                onAddNotification={onAddNotification}
                onApplyEnergySchedule={onApplyEnergySchedule}
                externalPrompt={externalPrompt}
                onClearExternalPrompt={onClearExternalPrompt}
                isFloatingMode={true}
                isExpanded={isExpanded}
                onToggleExpand={() => setIsExpanded(prev => !prev)}
                onCloseFloating={onClose}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
