import React, { useState } from "react";
import { 
  X, 
  Zap, 
  Brain, 
  BatteryCharging, 
  Sun, 
  Moon, 
  ShieldCheck, 
  Sparkles, 
  Clock, 
  Sliders, 
  RotateCcw, 
  Check, 
  AlertCircle,
  TrendingUp,
  Activity,
  ChevronRight
} from "lucide-react";
import { UserEnergyProfile, Chronotype, EnergyZone, EnergyLevel } from "../types";
import { 
  DEFAULT_CHRONOTYPE_PROFILES, 
  DEFAULT_USER_ENERGY_PROFILE, 
  formatHour, 
  getEnergyBadgeData 
} from "../lib/energyProfile";

interface EnergyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserEnergyProfile;
  onSaveProfile: (profile: UserEnergyProfile) => void;
  onRealignCalendar?: () => void;
}

export default function EnergyProfileModal({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  onRealignCalendar
}: EnergyProfileModalProps) {
  const [currentProfile, setCurrentProfile] = useState<UserEnergyProfile>(profile || DEFAULT_USER_ENERGY_PROFILE);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  if (!isOpen) return null;

  const handleSelectChronotype = (type: Chronotype) => {
    if (type === "custom") {
      setCurrentProfile(prev => ({ ...prev, chronotype: "custom" }));
      setHasUnsavedChanges(true);
      return;
    }
    const preset = DEFAULT_CHRONOTYPE_PROFILES[type];
    if (preset) {
      setCurrentProfile(prev => ({
        ...prev,
        chronotype: type,
        zones: JSON.parse(JSON.stringify(preset.zones))
      }));
      setHasUnsavedChanges(true);
    }
  };

  const handleToggleSlumpProtection = () => {
    setCurrentProfile(prev => ({
      ...prev,
      slumpProtection: !prev.slumpProtection
    }));
    setHasUnsavedChanges(true);
  };

  const handleBufferChange = (minutes: number) => {
    setCurrentProfile(prev => ({
      ...prev,
      autoBufferMinutes: minutes
    }));
    setHasUnsavedChanges(true);
  };

  const handleMaxHoursChange = (hours: number) => {
    setCurrentProfile(prev => ({
      ...prev,
      maxDailyDeepFocusHours: hours
    }));
    setHasUnsavedChanges(true);
  };

  const handleSaveAndApply = () => {
    onSaveProfile(currentProfile);
    setHasUnsavedChanges(false);
    onRealignCalendar();
    onClose();
  };

  // Calculate total peak hours in current profile
  const totalPeakHours = currentProfile.zones
    .filter(z => z.level === "deep_focus")
    .reduce((acc, z) => {
      const dur = z.endHour >= z.startHour ? z.endHour - z.startHour : (24 - z.startHour) + z.endHour;
      return acc + dur;
    }, 0);

  const slumpZones = currentProfile.zones.filter(z => z.level === "light_recharge");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl my-8 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden text-neutral-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-800 bg-neutral-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Energy & Cognitive Load Mapping
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
                  Smart Bio-Schedule
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Match high-strain tasks with biological energy peaks and guard slump hours from burnout.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Chronotype Preset Switcher */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-400" />
              Circadian Chronotype Profile
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["steady", "early_bird", "night_owl"] as Chronotype[]).map((type) => {
                const preset = DEFAULT_CHRONOTYPE_PROFILES[type as keyof typeof DEFAULT_CHRONOTYPE_PROFILES];
                const isSelected = currentProfile.chronotype === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSelectChronotype(type)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      isSelected 
                        ? "bg-purple-950/30 border-purple-500 text-white shadow-md shadow-purple-500/10 ring-1 ring-purple-500" 
                        : "bg-neutral-800/60 border-neutral-700/80 hover:bg-neutral-800 hover:border-neutral-600 text-neutral-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm flex items-center gap-2 text-white">
                        {type === "early_bird" && "🌅 Early Bird"}
                        {type === "steady" && "⚡ Steady Performer"}
                        {type === "night_owl" && "🦉 Night Owl"}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-purple-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visual 24-Hour Energy Curve Bar */}
          <div className="space-y-3 p-4 bg-neutral-800/40 rounded-xl border border-neutral-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                24-Hour Energy Curve Distribution
              </label>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-purple-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  Peak Focus ({totalPeakHours}h)
                </span>
                <span className="flex items-center gap-1.5 text-sky-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  Steady Flow
                </span>
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Recharge / Slump
                </span>
              </div>
            </div>

            {/* Continuous 24h Timeline Bar */}
            <div className="relative h-10 w-full bg-neutral-900 rounded-lg overflow-hidden border border-neutral-700 flex shadow-inner">
              {currentProfile.zones.map((zone) => {
                let duration = zone.endHour >= zone.startHour 
                  ? zone.endHour - zone.startHour 
                  : (24 - zone.startHour) + zone.endHour;
                const widthPercent = (duration / 24) * 100;
                
                let bgColor = "bg-sky-600/80 hover:bg-sky-500";
                if (zone.level === "deep_focus") bgColor = "bg-purple-600/90 hover:bg-purple-500";
                if (zone.level === "light_recharge") bgColor = "bg-emerald-600/80 hover:bg-emerald-500";

                return (
                  <div
                    key={zone.id}
                    onClick={() => setActiveZoneId(activeZoneId === zone.id ? null : zone.id)}
                    style={{ width: `${widthPercent}%` }}
                    className={`h-full cursor-pointer transition-all border-r border-neutral-950/40 relative group flex items-center justify-center ${bgColor}`}
                    title={`${zone.name} (${formatHour(zone.startHour)} - ${formatHour(zone.endHour)}) - ${zone.level}`}
                  >
                    <span className="text-[10px] font-medium text-white/90 truncate px-1 opacity-90 group-hover:opacity-100 drop-shadow">
                      {zone.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Hour markers under timeline */}
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono px-0.5">
              <span>00:00</span>
              <span>04:00</span>
              <span>08:00</span>
              <span>12:00</span>
              <span>16:00</span>
              <span>20:00</span>
              <span>24:00</span>
            </div>

            {/* Zone breakdown list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {currentProfile.zones.map((zone) => {
                const badge = getEnergyBadgeData(zone.level);
                return (
                  <div
                    key={zone.id}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                      activeZoneId === zone.id 
                        ? "bg-neutral-800 border-purple-500/60" 
                        : "bg-neutral-850 border-neutral-800 hover:border-neutral-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm">{badge.icon}</span>
                      <div className="truncate">
                        <p className="font-semibold text-neutral-200 truncate">{zone.name}</p>
                        <p className="text-[11px] text-neutral-400">
                          {formatHour(zone.startHour)} – {formatHour(zone.endHour)}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${badge.bg}`}>
                      {badge.shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Smart Protection & Fatigue Guard Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Slump Protection Toggle */}
            <div className="p-4 bg-neutral-800/40 rounded-xl border border-neutral-800 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Slump Shield Protection
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Avoids auto-scheduling high-strain study or heavy workouts during recognized biological energy dips (e.g. 12:30 – 14:30).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSlumpProtection}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    currentProfile.slumpProtection ? "bg-purple-600" : "bg-neutral-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      currentProfile.slumpProtection ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <div className="pt-2 border-t border-neutral-800 flex items-center gap-2 text-xs text-neutral-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {currentProfile.slumpProtection ? "Active: Slump hours reserved for light recharge" : "Inactive: All slots open"}
              </div>
            </div>

            {/* Cognitive Buffer Selector */}
            <div className="p-4 bg-neutral-800/40 rounded-xl border border-neutral-800 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                  <BatteryCharging className="w-4 h-4 text-sky-400" />
                  Cognitive Recovery Buffer
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Automatic breathing space inserted between back-to-back intense sessions.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {[0, 15, 30].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleBufferChange(mins)}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                      currentProfile.autoBufferMinutes === mins
                        ? "bg-sky-600 text-white border-sky-500"
                        : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                    }`}
                  >
                    {mins === 0 ? "No Buffer" : `${mins} mins`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Daily Deep Focus Ceiling */}
          <div className="p-4 bg-neutral-800/40 rounded-xl border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  Daily Deep Work Limit
                </h4>
                <p className="text-xs text-neutral-400">
                  Maximum recommended high-strain hours per day to prevent cognitive burnout.
                </p>
              </div>
              <span className="text-sm font-bold text-purple-400 px-3 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20">
                {currentProfile.maxDailyDeepFocusHours} hours / day
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="7"
              step="0.5"
              value={currentProfile.maxDailyDeepFocusHours}
              onChange={(e) => handleMaxHoursChange(Number(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-neutral-500">
              <span>2.0 hrs (Light)</span>
              <span>4.0 hrs (Optimal)</span>
              <span>7.0 hrs (Intense)</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800 bg-neutral-900/90 sticky bottom-0">
          <button
            type="button"
            onClick={() => {
              setCurrentProfile(DEFAULT_USER_ENERGY_PROFILE);
              setHasUnsavedChanges(true);
            }}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Standard
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 transition-all shadow-md shadow-purple-600/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Save & Re-Align Calendar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
