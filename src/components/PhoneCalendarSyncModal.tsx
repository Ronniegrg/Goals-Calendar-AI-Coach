import React, { useState } from "react";
import { 
  X, 
  Smartphone, 
  Calendar as CalendarIcon, 
  Copy, 
  Check, 
  ExternalLink, 
  Bell, 
  RefreshCw, 
  Zap, 
  ShieldCheck 
} from "lucide-react";

interface PhoneCalendarSyncModalProps {
  userEmail?: string;
  onClose: () => void;
}

export default function PhoneCalendarSyncModal({
  userEmail = "rounigorgees@gmail.com",
  onClose
}: PhoneCalendarSyncModalProps) {
  const [copied, setCopied] = useState(false);

  // Construct absolute feed URLs
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const host = typeof window !== "undefined" ? window.location.host : "localhost:3000";
  const httpsUrl = `${origin}/api/calendar/feed.ics?email=${encodeURIComponent(userEmail)}`;
  const webcalUrl = `webcal://${host}/api/calendar/feed.ics?email=${encodeURIComponent(userEmail)}`;
  const googleCalUrl = `https://calendar.google.com/calendar/r/settings/addbyurl?curl=${encodeURIComponent(httpsUrl)}`;

  const handleCopy = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-slate-900 border border-white/15 rounded-3xl shadow-2xl overflow-hidden p-6 text-white relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-widest uppercase bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                2-Way Phone & Desktop Sync
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                Live .ICS Feed
              </span>
            </div>
            <h3 className="text-xl font-black tracking-tight text-white mt-0.5">
              Sync Calendar to Your Phone
            </h3>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-5">
          Subscribe to your study schedule on your <strong>iPhone, Android, Google Calendar, or Mac Calendar</strong>. Whenever AI Autopilot adjusts or adds sessions, your phone updates automatically with <strong>15-minute lock screen notifications</strong>!
        </p>

        {/* 1-Click Platform Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {/* Apple Calendar / iPhone */}
          <a
            href={webcalUrl}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950/70 hover:bg-slate-950 border border-white/15 hover:border-indigo-400/50 transition cursor-pointer group shadow-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <CalendarIcon className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition flex items-center gap-1">
                <span>Apple / iPhone Calendar</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                1-Click 15-min lock screen alerts
              </div>
            </div>
          </a>

          {/* Google Calendar */}
          <a
            href={googleCalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950/70 hover:bg-slate-950 border border-white/15 hover:border-emerald-400/50 transition cursor-pointer group shadow-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition flex items-center gap-1">
                <span>Google Calendar</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Subscribe in web & Android app
              </div>
            </div>
          </a>
        </div>

        {/* Direct Feed Link Copy Section */}
        <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              Universal Subscription URL (.ics)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Auto-syncs every 15 min
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={httpsUrl}
              className="flex-1 bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 select-all outline-hidden"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
