import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Plus, 
  Minus, 
  CheckCircle2, 
  X, 
  Sparkles, 
  Clock, 
  Flame, 
  BellRing,
  Volume2,
  VolumeX
} from "lucide-react";

interface FocusTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionTitle: string;
  initialDurationMinutes: number;
  eventId?: string;
  goalId?: string;
  category?: string;
  color?: string;
  onCompleteSession: (eventId?: string, goalId?: string) => void;
}

export default function FocusTimerModal({
  isOpen,
  onClose,
  sessionTitle,
  initialDurationMinutes,
  eventId,
  goalId,
  category,
  color = "#6366f1",
  onCompleteSession
}: FocusTimerModalProps) {
  // Timer state
  const totalDurationSecRef = useRef<number>(Math.max(1, initialDurationMinutes) * 60);
  const [totalSec, setTotalSec] = useState<number>(Math.max(1, initialDurationMinutes) * 60);
  const [timeRemaining, setTimeRemaining] = useState<number>(Math.max(1, initialDurationMinutes) * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Sync when props change if timer hasn't started
  useEffect(() => {
    if (!isRunning && timeRemaining === totalSec) {
      const newSec = Math.max(1, initialDurationMinutes) * 60;
      setTotalSec(newSec);
      setTimeRemaining(newSec);
      totalDurationSecRef.current = newSec;
      setIsCompleted(false);
    }
  }, [initialDurationMinutes, isOpen]);

  // Audio completion chime generator
  const playCompletionChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // Multi-note pleasant chord (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
        
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.8);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.8);
      });
    } catch {
      // Audio context policy fallback
    }
  };

  // Timer Tick Interval
  useEffect(() => {
    let interval: any = null;
    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsCompleted(true);
            playCompletionChime();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timeRemaining === 0 && isRunning) {
      setIsRunning(false);
      setIsCompleted(true);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeRemaining, soundEnabled]);

  if (!isOpen) return null;

  // Format time display (HH:MM:SS or MM:SS)
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Adjust duration by +/- minutes
  const handleAdjustMinutes = (deltaMins: number) => {
    const deltaSec = deltaMins * 60;
    setTimeRemaining((prev) => {
      const nextTime = Math.max(10, prev + deltaSec);
      // adjust totalSec proportionally if nextTime exceeds current totalSec
      if (nextTime > totalSec) {
        setTotalSec(nextTime);
      }
      return nextTime;
    });
    if (isCompleted) setIsCompleted(false);
  };

  const handleStart = () => {
    if (timeRemaining <= 0) {
      setTimeRemaining(totalSec);
    }
    setIsRunning(true);
    setIsCompleted(false);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsCompleted(false);
    setTimeRemaining(totalSec);
  };

  const handleFinishAndComplete = () => {
    setIsRunning(false);
    playCompletionChime();
    onCompleteSession(eventId, goalId);
    onClose();
  };

  // Calculate circular SVG progress percentage
  const progressPercent = totalSec > 0 ? ((totalSec - timeRemaining) / totalSec) * 100 : 0;
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div id="focus_timer_modal_backdrop" className="fixed inset-0 bg-[#020205]/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div id="focus_timer_modal_card" className="bg-[#0f111a] border border-white/12 rounded-3xl shadow-2xl w-full max-w-md p-6 relative overflow-hidden">
        {/* Glow accent matching color */}
        <div 
          className="absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: color }}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between relative z-10 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-slate-300 font-mono">
                {category || "Focus Session"}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                isRunning 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse" 
                  : isCompleted 
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-slate-800 text-slate-400"
              }`}>
                {isRunning ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    IN PROGRESS
                  </>
                ) : isCompleted ? (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    COMPLETED!
                  </>
                ) : (
                  "READY"
                )}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="truncate max-w-[260px]">{sessionTitle}</span>
            </h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer"
              title={soundEnabled ? "Mute audio notification" : "Unmute audio notification"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Circular Countdown Ring */}
        <div className="relative flex flex-col items-center justify-center my-6">
          <svg className="w-64 h-64 transform -rotate-90">
            {/* Background track circle */}
            <circle
              cx="128"
              cy="128"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              className="text-white/5"
              fill="transparent"
            />
            {/* Progress filled circle */}
            <circle
              cx="128"
              cy="128"
              r={radius}
              stroke={color}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>

          {/* Center Digital Clock Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-4xl sm:text-5xl font-extrabold text-white font-mono tracking-tight drop-shadow-md">
              {formatTime(timeRemaining)}
            </span>
            <span className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Initial: {Math.round(totalSec / 60)} mins
            </span>
          </div>
        </div>

        {/* Quick Time Adjustment Buttons (+5m, -5m, +15m, -15m) */}
        <div className="bg-[#0c0d16] border border-white/10 rounded-2xl p-3 mb-6">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-2">
            <span className="flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Adjust Time On The Fly
            </span>
            <span className="font-mono text-indigo-300">
              {timeRemaining > 0 ? `${Math.ceil(timeRemaining / 60)}m left` : "0m"}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleAdjustMinutes(-5)}
              className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold font-mono transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <Minus className="w-3 h-3 text-rose-400" /> 5m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(-1)}
              className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold font-mono transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <Minus className="w-3 h-3 text-rose-400" /> 1m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(1)}
              className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold font-mono transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3 text-emerald-400" /> 1m
            </button>
            <button
              type="button"
              onClick={() => handleAdjustMinutes(5)}
              className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold font-mono transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3 text-emerald-400" /> 5m
            </button>
          </div>
        </div>

        {/* Control Action Buttons (Start, Pause, Reset, Finish) */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            {!isRunning ? (
              <button
                type="button"
                id="timer_start_btn"
                onClick={handleStart}
                className="py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{timeRemaining < totalSec && timeRemaining > 0 ? "Resume" : "Start Session"}</span>
              </button>
            ) : (
              <button
                type="button"
                id="timer_pause_btn"
                onClick={handlePause}
                className="py-3 px-4 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Pause className="w-5 h-5 fill-current" />
                <span>Pause</span>
              </button>
            )}

            <button
              type="button"
              id="timer_reset_btn"
              onClick={handleReset}
              className="py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>

          <button
            type="button"
            id="timer_complete_session_btn"
            onClick={handleFinishAndComplete}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5 text-indigo-200" />
            <span>Finish & Log Progress</span>
          </button>
        </div>
      </div>
    </div>
  );
}
