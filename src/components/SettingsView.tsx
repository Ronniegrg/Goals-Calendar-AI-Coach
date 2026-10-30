import React, { useState, useEffect } from "react";
import { 
  Settings as SettingsIcon, 
  Brain, 
  Zap, 
  Bot, 
  Calendar, 
  Bell, 
  Sun, 
  Moon, 
  Monitor, 
  Database, 
  Shield, 
  Check, 
  ChevronRight, 
  RotateCcw, 
  Download, 
  Upload, 
  Trash2, 
  Sparkles, 
  Clock, 
  Activity, 
  Sliders, 
  Flame, 
  Info,
  CheckCircle2,
  ExternalLink,
  Laptop
} from "lucide-react";
import { 
  Goal, 
  CalendarEvent, 
  AvailabilityWindow, 
  AutopilotMode, 
  AutopilotPacing, 
  DailyBurnoutLimits 
} from "../types";
import { 
  UserEnergyProfile, 
  DEFAULT_CHRONOTYPE_PROFILES, 
  Chronotype, 
  DEFAULT_USER_ENERGY_PROFILE 
} from "../lib/energyProfile";
import { generateIcsCalendar, downloadIcsFile } from "../lib/icalParser";

export interface SettingsViewProps {
  energyProfile: UserEnergyProfile;
  onUpdateEnergyProfile: (profile: UserEnergyProfile) => void;
  autopilotMode: AutopilotMode;
  onChangeAutopilotMode: (mode: AutopilotMode) => void;
  autopilotPacing: AutopilotPacing;
  onChangeAutopilotPacing: (pacing: AutopilotPacing) => void;
  burnoutLimits: DailyBurnoutLimits;
  onChangeBurnoutLimits: (limits: DailyBurnoutLimits) => void;
  coachPersona: "mentor" | "drill" | "data";
  onChangeCoachPersona: (persona: "mentor" | "drill" | "data") => void;
  themeMode: "auto" | "dark" | "light";
  onChangeThemeMode: (theme: "auto" | "dark" | "light") => void;
  resolvedTheme: "dark" | "light";
  alertLeadMinutes: number;
  onChangeAlertLeadMinutes: (mins: number) => void;
  alertPushEnabled: boolean;
  onChangeAlertPushEnabled: (enabled: boolean) => void;
  events: CalendarEvent[];
  goals: Goal[];
  availability: AvailabilityWindow[];
  userEmail: string;
  onClearExternalEvents?: () => void;
  onResetAndRegenerateCalendar?: (options?: { clearMode?: "uncompleted_goals" | "all_events"; keepExternal?: boolean }) => void;
  onImportData?: (data: { goals: Goal[]; events: CalendarEvent[]; energyProfile?: UserEnergyProfile; availability?: AvailabilityWindow[] }) => void;
  onNotify?: (title: string, message: string, type: any) => void;
  onNavigateToCalendar?: () => void;
  onNavigateToGoals?: () => void;
}

type SettingsSection = 
  | "energy" 
  | "autopilot" 
  | "coach" 
  | "calendar" 
  | "notifications" 
  | "appearance" 
  | "data";

export default function SettingsView({
  energyProfile,
  onUpdateEnergyProfile,
  autopilotMode,
  onChangeAutopilotMode,
  autopilotPacing,
  onChangeAutopilotPacing,
  burnoutLimits,
  onChangeBurnoutLimits,
  coachPersona,
  onChangeCoachPersona,
  themeMode,
  onChangeThemeMode,
  resolvedTheme,
  alertLeadMinutes,
  onChangeAlertLeadMinutes,
  alertPushEnabled,
  onChangeAlertPushEnabled,
  events,
  goals,
  availability,
  userEmail,
  onClearExternalEvents,
  onResetAndRegenerateCalendar,
  onImportData,
  onNotify,
  onNavigateToCalendar,
  onNavigateToGoals
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("energy");

  // Local settings state with instant localStorage backup
  const [soundAlerts, setSoundAlerts] = useState<boolean>(() => {
    return localStorage.getItem("sound_alerts_enabled") !== "false";
  });

  const [sundayRecapEnabled, setSundayRecapEnabled] = useState<boolean>(() => {
    return localStorage.getItem("sunday_recap_prompt_enabled") !== "false";
  });

  const [sentinelFrequency, setSentinelFrequency] = useState<"instant" | "hourly" | "quiet">(() => {
    return (localStorage.getItem("sentinel_alert_frequency") as "instant" | "hourly" | "quiet") || "instant";
  });

  const [focusTimerDuration, setFocusTimerDuration] = useState<number>(() => {
    const val = localStorage.getItem("default_focus_duration");
    return val ? Number(val) : 50;
  });

  const [autoGcalExport, setAutoGcalExport] = useState<boolean>(() => {
    return localStorage.getItem("auto_gcal_export") === "true";
  });

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetKeepExternal, setResetKeepExternal] = useState(true);

  // Sync settings helpers
  const handleToggleSound = (enabled: boolean) => {
    setSoundAlerts(enabled);
    localStorage.setItem("sound_alerts_enabled", enabled ? "true" : "false");
    onNotify?.("Sound Preferences", `Audio chime ${enabled ? "enabled" : "muted"}.`, "success");
  };

  const handleToggleSundayRecap = (enabled: boolean) => {
    setSundayRecapEnabled(enabled);
    localStorage.setItem("sunday_recap_prompt_enabled", enabled ? "true" : "false");
    onNotify?.("Sunday Report Card", `Sunday habit recap prompt ${enabled ? "enabled" : "disabled"}.`, "success");
  };

  const handleSetSentinelFrequency = (freq: "instant" | "hourly" | "quiet") => {
    setSentinelFrequency(freq);
    localStorage.setItem("sentinel_alert_frequency", freq);
    onNotify?.("Goal Sentinel Mode", `Proactive sentinel alerts set to ${freq}.`, "success");
  };

  const handleSetFocusTimerDuration = (mins: number) => {
    setFocusTimerDuration(mins);
    localStorage.setItem("default_focus_duration", String(mins));
    onNotify?.("Timer Interval", `Default focus session duration set to ${mins} minutes.`, "success");
  };

  const handleToggleAutoGcal = (enabled: boolean) => {
    setAutoGcalExport(enabled);
    localStorage.setItem("auto_gcal_export", enabled ? "true" : "false");
    onNotify?.("Google Calendar Sync", `Background auto-export ${enabled ? "enabled" : "disabled"}.`, "success");
  };

  // Chronotype switch helper
  const handleSelectChronotype = (chrono: Chronotype) => {
    if (chrono === "custom") return;
    const profilePreset = DEFAULT_CHRONOTYPE_PROFILES[chrono];
    if (profilePreset) {
      const updated: UserEnergyProfile = {
        ...energyProfile,
        chronotype: chrono,
        zones: profilePreset.zones
      };
      onUpdateEnergyProfile(updated);
      localStorage.setItem("user_energy_profile", JSON.stringify(updated));
      onNotify?.("Bio-Energy Updated", `Switched chronotype rhythm to ${profilePreset.name}.`, "success");
    }
  };

  // Slump protection toggle
  const handleToggleSlumpProtection = () => {
    const updated: UserEnergyProfile = {
      ...energyProfile,
      slumpProtection: !energyProfile.slumpProtection
    };
    onUpdateEnergyProfile(updated);
    localStorage.setItem("user_energy_profile", JSON.stringify(updated));
    onNotify?.(
      "Slump Shield", 
      `Biological slump shield ${updated.slumpProtection ? "activated" : "deactivated"}.`, 
      "success"
    );
  };

  // Export JSON backup
  const handleExportJsonBackup = () => {
    try {
      const payload = {
        appName: "Goals Calendar & AI Coach",
        exportedAt: new Date().toISOString(),
        userEmail,
        goals,
        events,
        energyProfile,
        availability,
        autopilotMode,
        autopilotPacing,
        burnoutLimits,
        coachPersona
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `goals-routine-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify?.("Backup Created", "Successfully exported complete routine data to JSON file.", "success");
    } catch (e) {
      onNotify?.("Export Failed", "Could not generate backup file.", "warning");
    }
  };

  // Import JSON backup
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed.goals && Array.isArray(parsed.goals)) {
          onImportData?.({
            goals: parsed.goals,
            events: Array.isArray(parsed.events) ? parsed.events : [],
            energyProfile: parsed.energyProfile || energyProfile,
            availability: Array.isArray(parsed.availability) ? parsed.availability : availability
          });
          onNotify?.(
            "Backup Restored", 
            `Imported ${parsed.goals.length} goals and ${parsed.events?.length || 0} events.`, 
            "success"
          );
        } else {
          onNotify?.("Invalid Backup", "The selected file does not contain valid routine goals.", "warning");
        }
      } catch (err) {
        onNotify?.("Import Error", "Failed to parse backup JSON file.", "warning");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // One-click iCal download
  const handleDownloadIcs = () => {
    const icsContent = generateIcsCalendar(events, goals);
    downloadIcsFile(icsContent, "calendar-goals-schedule.ics");
    onNotify?.("Calendar Exported", "Downloaded .ics calendar file for Apple/Outlook/Google Calendar.", "success");
  };

  // Navigation menu items
  const navItems: { id: SettingsSection; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: "energy", label: "Bio-Energy & Circadian", icon: <Brain className="w-4 h-4 text-purple-400" />, desc: "Chronotype, Slump Shield, peak focus windows" },
    { id: "autopilot", label: "Autopilot & Pacing", icon: <Zap className="w-4 h-4 text-amber-400" />, desc: "Autonomous rescheduling, burnout thresholds" },
    { id: "coach", label: "AI Coach & Sentinel", icon: <Bot className="w-4 h-4 text-indigo-400" />, desc: "Persona tone, proactive goal alerts" },
    { id: "calendar", label: "Sync & Feeds", icon: <Calendar className="w-4 h-4 text-blue-400" />, desc: "Google Calendar, Apple iCal, feed exports" },
    { id: "notifications", label: "Alerts & Timer", icon: <Bell className="w-4 h-4 text-emerald-400" />, desc: "Lead time, sounds, Sunday report prompt" },
    { id: "appearance", label: "Appearance & Theme", icon: <Sun className="w-4 h-4 text-yellow-400" />, desc: "Dark mode, daylight auto-switch" },
    { id: "data", label: "Data & Routine Reset", icon: <Database className="w-4 h-4 text-rose-400" />, desc: "Backup JSON, import, full slate regeneration" }
  ];

  return (
    <div className="space-y-6" id="settings_page_view">
      
      {/* HEADER SECTION */}
      <div className="bg-white/80 dark:bg-[#0f111a]/90 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25 shrink-0">
              <SettingsIcon className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">System Settings</h2>
                <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
                  v2.6
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure your circadian biological rhythms, AI autonomous scheduler, coach persona, and sync feeds.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportJsonBackup}
              className="text-xs font-bold px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-white/10 rounded-xl transition cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs"
              title="Download full routine backup (JSON)"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span>Export Routine</span>
            </button>
            {onNavigateToCalendar && (
              <button
                type="button"
                onClick={onNavigateToCalendar}
                className="text-xs font-bold px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md shadow-indigo-600/25 transition cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <span>Back to Grid</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: SECTION SELECTOR (HORIZONTAL SCROLL ON MOBILE, VERTICAL LIST ON DESKTOP) */}
        <aside className="lg:col-span-4 bg-white/70 dark:bg-[#0f111a]/70 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-3 sm:p-4 shadow-lg space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-3 py-1">
            Configuration Modules
          </p>
          <div className="flex lg:flex-col gap-1.5 overflow-x-auto scrollbar-none pb-1 lg:pb-0">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  id={`settings_nav_${item.id}`}
                  onClick={() => setActiveSection(item.id)}
                  className={`text-left p-3 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 shrink-0 lg:shrink w-auto lg:w-full select-none ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 font-bold"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${isActive ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-white/5"}`}>
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-snug truncate">{item.label}</div>
                      <div className={`text-[10.5px] truncate hidden sm:block ${isActive ? "text-indigo-100" : "text-slate-400 dark:text-slate-500"}`}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 shrink-0 hidden lg:block opacity-80" />}
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT COLUMN: ACTIVE SECTION PANEL */}
        <main className="lg:col-span-8 space-y-6">
          
          {/* 1. BIO-ENERGY & CIRCADIAN RHYTHM */}
          {activeSection === "energy" && (
            <div className="bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-200 dark:border-white/10 pb-4">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  <span>Bio-Energy & Chronotype Rhythm</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  The auto-scheduler aligns your heavy focus sessions (e.g. Calculus, LeetCode, Heavy Lifts) strictly to biological peak windows while sheltering you during fatigue valleys.
                </p>
              </div>

              {/* Chronotype Selector Cards */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                  Select Your Primary Chronotype
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(["early_bird", "steady", "night_owl"] as const).map((chrono) => {
                    const preset = DEFAULT_CHRONOTYPE_PROFILES[chrono];
                    const isSelected = energyProfile.chronotype === chrono;
                    return (
                      <div
                        key={chrono}
                        id={`chronotype_card_${chrono}`}
                        onClick={() => handleSelectChronotype(chrono)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                          isSelected
                            ? "bg-purple-500/15 border-purple-500 text-slate-900 dark:text-white shadow-lg shadow-purple-500/10 ring-2 ring-purple-400/50"
                            : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xl">
                              {chrono === "early_bird" ? "🌅" : chrono === "steady" ? "⚖️" : "🦉"}
                            </span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-purple-500 ring-4 ring-purple-500/20" />
                            )}
                          </div>
                          <h4 className="text-xs font-extrabold mt-1">{preset.name}</h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {preset.description}
                          </p>
                        </div>
                        <div className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-300 pt-2 border-t border-slate-200/50 dark:border-white/5">
                          {chrono === "early_bird" && "Peak: 05:30 – 10:30 AM"}
                          {chrono === "steady" && "Peak: 08:30 AM – 12:30 PM"}
                          {chrono === "night_owl" && "Peak: 06:30 – 10:30 PM"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Slump Shield Protection Switch */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🛡️</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Slump Shield Protection</span>
                    <span className="text-[9px] bg-amber-500/20 text-amber-600 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">Recommended</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Strictly locks out high-stakes learning or max-effort workout sessions during the post-lunch biological dip (12:30 PM – 2:30 PM).
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle_slump_shield_btn"
                  onClick={handleToggleSlumpProtection}
                  className={`w-12 h-6.5 rounded-full transition-colors relative cursor-pointer shrink-0 p-0.5 ${
                    energyProfile.slumpProtection ? "bg-emerald-600" : "bg-slate-300 dark:bg-white/20"
                  }`}
                >
                  <div
                    className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                      energyProfile.slumpProtection ? "translate-x-5.5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Deep Focus Daily Cap Slider */}
              <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    <span>Max Daily Deep Focus Limit</span>
                  </span>
                  <span className="font-mono text-xs font-black text-purple-600 dark:text-purple-300">
                    {energyProfile.maxDailyDeepFocusHours || 4.0} hours / day
                  </span>
                </div>
                <input
                  type="range"
                  min="2.0"
                  max="8.0"
                  step="0.5"
                  value={energyProfile.maxDailyDeepFocusHours || 4.0}
                  onChange={(e) => {
                    const updated = { ...energyProfile, maxDailyDeepFocusHours: parseFloat(e.target.value) };
                    onUpdateEnergyProfile(updated);
                    localStorage.setItem("user_energy_profile", JSON.stringify(updated));
                  }}
                  className="w-full accent-purple-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>2.0h (Sprint)</span>
                  <span>4.0h (Optimal cognitive threshold)</span>
                  <span>8.0h (Heavy load)</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. AUTOPILOT & PACING */}
          {activeSection === "autopilot" && (
            <div className="bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-200 dark:border-white/10 pb-4">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <span>Autonomous AI Scheduling & Pacing Engine</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Controls how aggressively the scheduler reacts when you miss or delay study sessions.
                </p>
              </div>

              {/* Mode Selection */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                  Autopilot Operating Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { mode: "full_autonomous" as const, title: "Autonomous (Self-Healing)", desc: "Automatically catches up missed sessions without prompt hurdles." },
                    { mode: "copilot_sentinel" as const, title: "Assisted (Proactive Sentinel)", desc: "Notifies you with 1-click resolve buttons when delays occur." },
                    { mode: "manual" as const, title: "Manual (User Driven)", desc: "Leaves missed sessions untouched until you manually reschedule." }
                  ].map((item) => {
                    const isSelected = autopilotMode === item.mode;
                    return (
                      <div
                        key={item.mode}
                        id={`autopilot_mode_${item.mode}`}
                        onClick={() => onChangeAutopilotMode(item.mode)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                          isSelected
                            ? "bg-indigo-500/15 border-indigo-500 text-slate-900 dark:text-white shadow-md shadow-indigo-500/10 ring-2 ring-indigo-400/50"
                            : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-extrabold">{item.title}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pacing Speed */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                  Weekly Schedule Pacing & Density
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { pacing: "aggressive" as const, title: "Aggressive Sprint", desc: "Front-loads targets into early week slots for maximum milestone velocity." },
                    { pacing: "balanced" as const, title: "Balanced Steady", desc: "Evenly spaces workouts and focus blocks with healthy daily buffer windows." },
                    { pacing: "gentle" as const, title: "Sustainable & Rest-Heavy", desc: "Prioritizes recovery days and ensures zero back-to-back heavy days." }
                  ].map((item) => {
                    const isSelected = autopilotPacing === item.pacing;
                    return (
                      <div
                        key={item.pacing}
                        id={`autopilot_pacing_${item.pacing}`}
                        onClick={() => onChangeAutopilotPacing(item.pacing)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                          isSelected
                            ? "bg-amber-500/15 border-amber-500 text-slate-900 dark:text-white shadow-md shadow-amber-500/10 ring-2 ring-amber-400/50"
                            : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-extrabold">{item.title}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Burnout Limits Controls */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-teal-500" />
                      <span>Daily Burnout Guardrails</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Caps scheduled routine intensity to prevent cognitive exhaustion.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex justify-between">
                      <span>Weekday Max Hours:</span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">{burnoutLimits.weekdayMaxHours} hrs</span>
                    </label>
                    <input
                      type="range"
                      min="1.5"
                      max="7.0"
                      step="0.5"
                      value={burnoutLimits.weekdayMaxHours}
                      onChange={(e) => onChangeBurnoutLimits({ ...burnoutLimits, weekdayMaxHours: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex justify-between">
                      <span>Weekend Max Hours:</span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">{burnoutLimits.weekendMaxHours} hrs</span>
                    </label>
                    <input
                      type="range"
                      min="1.0"
                      max="8.0"
                      step="0.5"
                      value={burnoutLimits.weekendMaxHours}
                      onChange={(e) => onChangeBurnoutLimits({ ...burnoutLimits, weekendMaxHours: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. AI COACH & SENTINEL */}
          {activeSection === "coach" && (
            <div className="bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-200 dark:border-white/10 pb-4">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Bot className="w-5 h-5 text-indigo-500" />
                  <span>AI Coach & Sentinel Personality</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Tailor the communication style of Gemini Live coaching advice, task reminders, and the Proactive Sentinel banner.
                </p>
              </div>

              {/* Persona Switcher */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                  Coaching Persona
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: "mentor" as const, title: "Empathetic Mentor", desc: "Constructive feedback, encouragement, and cognitive neuroscience pacing.", icon: "🌸" },
                    { id: "drill" as const, title: "Disciplined Drill Sergeant", desc: "Direct, no-nonsense accountability, zero excuses, and streak defense.", icon: "🎖️" },
                    { id: "data" as const, title: "Data Analyst", desc: "Metric-driven, completion velocity statistics, and circadian fit ratings.", icon: "📊" }
                  ].map((p) => {
                    const isSelected = coachPersona === p.id;
                    return (
                      <div
                        key={p.id}
                        id={`settings_persona_${p.id}`}
                        onClick={() => onChangeCoachPersona(p.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                          isSelected
                            ? "bg-indigo-600/15 border-indigo-500 text-slate-900 dark:text-white shadow-md shadow-indigo-500/10 ring-2 ring-indigo-400/50"
                            : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-2xl">{p.icon}</span>
                            {isSelected && <Check className="w-4 h-4 text-indigo-500 stroke-[3]" />}
                          </div>
                          <h4 className="text-xs font-extrabold">{p.title}</h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {p.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Proactive Sentinel Frequency */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Goal Sentinel Alert Sensitivity</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Controls how frequently the proactive banner suggests routine adjustments.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "instant" as const, label: "Immediate Reactive", sub: "Alerts as soon as a session expires" },
                    { id: "hourly" as const, label: "Hourly Batch", sub: "Gathers adjustments once per hour" },
                    { id: "quiet" as const, label: "Quiet Mode", sub: "Only show when opened directly" }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSetSentinelFrequency(item.id)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                        sentinelFrequency === item.id 
                          ? "bg-indigo-600 text-white border-indigo-500 font-bold shadow-xs" 
                          : "bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-slate-300"
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className={`text-[10px] ${sentinelFrequency === item.id ? "text-indigo-100" : "text-slate-400"}`}>{item.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4. CALENDAR SYNC & FEEDS */}
          {activeSection === "calendar" && (
            <div className="bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-200 dark:border-white/10 pb-4">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  <span>Calendar Synchronization & Feeds</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Export scheduled goals to Apple Calendar, Google Calendar, or Microsoft Outlook via standard .ics format.
                </p>
              </div>

              {/* Connected Account Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Active Google Account</span>
                  </div>
                  <p className="text-xs font-mono text-indigo-600 dark:text-indigo-300 font-bold">
                    {userEmail}
                  </p>
                  <p className="text-[10.5px] text-slate-400">
                    Your routines are cloud-synced with end-to-end local persistence.
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadIcs}
                    className="text-xs font-bold px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .ICS Feed</span>
                  </button>
                </div>
              </div>

              {/* Auto Gcal Export Toggle */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Auto-Push to Google Calendar</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    When you schedule or complete a study slot, automatically sync the event state to Google Calendar in the background.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleAutoGcal(!autoGcalExport)}
                  className={`w-12 h-6.5 rounded-full transition-colors relative cursor-pointer shrink-0 p-0.5 ${
                    autoGcalExport ? "bg-indigo-600" : "bg-slate-300 dark:bg-white/20"
                  }`}
                >
                  <div
                    className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                      autoGcalExport ? "translate-x-5.5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Clear External Events Helper */}
              {onClearExternalEvents && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-rose-900 dark:text-rose-200 block">Clear Imported External Events</span>
                    <span className="text-[11px] text-rose-700 dark:text-rose-300 block">
                      Removes imported Google/Apple busy blocks from the calendar without affecting your active goals.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClearExternalEvents();
                      onNotify?.("Cleaned Calendar", "Cleared all imported external busy blocks.", "success");
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0 shadow-sm"
                  >
                    Clear Busy Slots
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 5. NOTIFICATIONS & TIMER */}
          {activeSection === "notifications" && (
            <div className="bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-200 dark:border-white/10 pb-4">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-emerald-500" />
                  <span>Notifications & Focus Timer Preferences</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Fine-tune session countdown chimes, desktop alerts, and weekly habit retrospectives.
                </p>
              </div>

              {/* Alert Lead Time Selector */}
              <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Session Head-Start Alert Lead Time</span>
                  </span>
                  <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
                    {alertLeadMinutes} minutes prior
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[5, 10, 15, 30].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => onChangeAlertLeadMinutes(mins)}
                      className={`py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer text-center ${
                        alertLeadMinutes === mins
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                          : "bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-100"
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Focus Interval Duration */}
              <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Default Focus Timer Duration</span>
                  </span>
                  <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                    {focusTimerDuration} minutes
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[
                    { label: "25m (Pomodoro)", val: 25 },
                    { label: "50m (Classic)", val: 50 },
                    { label: "60m (1 Hour)", val: 60 },
                    { label: "90m (Ultradian)", val: 90 }
                  ].map(item => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => handleSetFocusTimerDuration(item.val)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                        focusTimerDuration === item.val
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                          : "bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-100"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound Audio Toggles */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">Timer Completion Chime</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Plays an acoustic crystal bowl chime when a scheduled study session finishes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSound(!soundAlerts)}
                  className={`w-12 h-6.5 rounded-full transition-colors relative cursor-pointer shrink-0 p-0.5 ${
                    soundAlerts ? "bg-emerald-600" : "bg-slate-300 dark:bg-white/20"
                  }`}
                >
                  <div
                    className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                      soundAlerts ? "translate-x-5.5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Sunday Habit Report Card Auto Prompt */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">Sunday AI Habit Report Prompt</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Displays the weekly consistency grade, circadian alignment score, and 1-click optimizations automatically on Sunday evenings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSundayRecap(!sundayRecapEnabled)}
                  className={`w-12 h-6.5 rounded-full transition-colors relative cursor-pointer shrink-0 p-0.5 ${
                    sundayRecapEnabled ? "bg-amber-500" : "bg-slate-300 dark:bg-white/20"
                  }`}
                >
                  <div
                    className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                      sundayRecapEnabled ? "translate-x-5.5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* 6. APPEARANCE & THEME */}
          {activeSection === "appearance" && (
            <div className="bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-200 dark:border-white/10 pb-4">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sun className="w-5 h-5 text-yellow-500" />
                  <span>Appearance & Interface Theme</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Personalize light or dark mode styling or let daylight rhythm automatically determine the theme.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "auto" as const, title: "Daylight Rhythm (Auto)", desc: "Light theme during daytime (6am–6pm), switches to Dark mode at twilight.", icon: <Monitor className="w-5 h-5 text-indigo-400" /> },
                  { id: "dark" as const, title: "Dark Midnight", desc: "Deep contrast obsidian palette. Minimizes eye fatigue during late study blocks.", icon: <Moon className="w-5 h-5 text-purple-400" /> },
                  { id: "light" as const, title: "Daylight Crisp", desc: "Clean, high-legibility white canvas with crisp borders for daylight reading.", icon: <Sun className="w-5 h-5 text-amber-500" /> }
                ].map(item => {
                  const isSelected = themeMode === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onChangeThemeMode(item.id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                        isSelected
                          ? "bg-indigo-600/15 border-indigo-500 text-slate-900 dark:text-white shadow-lg shadow-indigo-600/10 ring-2 ring-indigo-400/50"
                          : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="p-2 rounded-xl bg-white dark:bg-white/10 shadow-xs">
                            {item.icon}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-indigo-500 stroke-[3]" />}
                        </div>
                        <h4 className="text-xs font-extrabold mt-1">{item.title}</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {item.desc}
                        </p>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-200/50 dark:border-white/5">
                        {item.id === "auto" && `Currently resolved: ${resolvedTheme === "dark" ? "🌙 Dark" : "☀️ Light"}`}
                        {item.id === "dark" && "Fixed dark theme"}
                        {item.id === "light" && "Fixed light theme"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 7. DATA, BACKUP & REGENERATE */}
          {activeSection === "data" && (
            <div className="bg-white/80 dark:bg-[#0f111a]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-200 dark:border-white/10 pb-4">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-rose-500" />
                  <span>Data Maintenance, Backup & Routine Reset</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Safely export backups, restore data, or re-run the auto-scheduler from your active goals.
                </p>
              </div>

              {/* Backup & Restore Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Export Card */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Full Routine Backup (JSON)</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Downloads an encrypted-ready JSON snapshot of your active goals, milestone deadlines, completed sessions, and bio-energy profile.
                  </p>
                  <button
                    type="button"
                    onClick={handleExportJsonBackup}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON Backup</span>
                  </button>
                </div>

                {/* Import Card */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-emerald-500" />
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Restore Routine Backup</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Upload a previously exported routine backup file to instantly populate your calendar and goals.
                  </p>
                  <label className="w-full py-2 bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/15 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-white/15 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Select JSON File</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportJsonFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Reset & Regenerate Schedule from Active Goals */}
              <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>Clean Reset & Regenerate Schedule</span>
                    </h4>
                    <p className="text-[11px] text-purple-800 dark:text-purple-300 leading-relaxed">
                      Wipes uncompleted future sessions and cleanly recalculates conflict-free time slots based on your active goals, availability, and biological energy curve for the next 4 weeks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onResetAndRegenerateCalendar) {
                        onResetAndRegenerateCalendar({
                          clearMode: "uncompleted_goals",
                          keepExternal: resetKeepExternal
                        });
                        onNotify?.("Calendar Regenerated", "Schedule re-mapped cleanly for all active goals.", "success");
                      }
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0 shadow-md flex items-center gap-1.5 active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Regenerate Now</span>
                  </button>
                </div>
                <label className="flex items-center gap-2 pt-1 text-[11px] text-purple-900 dark:text-purple-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetKeepExternal}
                    onChange={(e) => setResetKeepExternal(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-purple-600 accent-purple-600 cursor-pointer"
                  />
                  <span>Preserve imported Google / Apple busy calendar events</span>
                </label>
              </div>

              {/* Stats & Storage Info */}
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono pt-2">
                <span>Stored Active Goals: {goals.length}</span>
                <span>Scheduled Sessions: {events.length}</span>
                <span>Active Availability Windows: {availability.filter(a => a.active).length}</span>
              </div>
            </div>
          )}

        </main>
      </div>

    </div>
  );
}
