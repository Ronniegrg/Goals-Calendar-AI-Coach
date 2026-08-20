import React, { useState, useEffect, useRef } from "react";
import { 
  Bell, 
  BellRing, 
  Trash2, 
  Check, 
  AlertCircle, 
  Play, 
  Info, 
  Volume2, 
  VolumeX,
  Plus,
  Sun,
  Volume1,
  Music,
  Sparkles,
  Radio,
  Sliders
} from "lucide-react";
import { AppNotification } from "../types";

type AudibleSoundTheme = "chime" | "bell" | "harp" | "pulse" | "synth";
type VolumeLevel = "mute" | "low" | "medium" | "high";

interface NotificationsPanelProps {
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onClearAll: () => void;
  onAddNotification: (title: string, message: string, type: "upcoming" | "warning" | "motivation" | "success" | "sync") => void;
  onTriggerDailyDigest?: () => void;
  alertLeadMinutes?: number;
  onUpdateAlertLeadMinutes?: (mins: number) => void;
  alertPushEnabled?: boolean;
  onToggleAlertPush?: (enabled: boolean) => void;
}

export default function NotificationsPanel({
  notifications,
  onMarkRead,
  onClearAll,
  onAddNotification,
  onTriggerDailyDigest,
  alertLeadMinutes = 15,
  onUpdateAlertLeadMinutes,
  alertPushEnabled = true,
  onToggleAlertPush
}: NotificationsPanelProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window && typeof Notification !== "undefined") {
      try {
        return Notification.permission;
      } catch {
        return "default";
      }
    }
    return "default";
  });

  // Persistent audible browser alert sound settings
  const [audibleAlertsEnabled, setAudibleAlertsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("audible_browser_alerts_enabled");
    return saved !== null ? saved === "true" : true;
  });

  const [soundTheme, setSoundTheme] = useState<AudibleSoundTheme>(() => {
    if (typeof window === "undefined") return "chime";
    const saved = localStorage.getItem("audible_alert_theme") as AudibleSoundTheme;
    return saved || "chime";
  });

  const [volumeLevel, setVolumeLevel] = useState<VolumeLevel>(() => {
    if (typeof window === "undefined") return "medium";
    const saved = localStorage.getItem("audible_alert_volume") as VolumeLevel;
    return saved || "medium";
  });

  const [testToneFeedback, setTestToneFeedback] = useState<string | null>(null);

  // Convert volume selection to audio gain multiplier
  const getGainMultiplier = (level: VolumeLevel): number => {
    switch (level) {
      case "mute": return 0;
      case "low": return 0.25;
      case "medium": return 0.65;
      case "high": return 1.0;
      default: return 0.65;
    }
  };

  // Versatile Web Audio API synthesizer for audible browser notification sounds
  const playAudibleAlert = (
    type: AppNotification["type"] = "upcoming",
    overrideTheme?: AudibleSoundTheme,
    overrideVolume?: VolumeLevel
  ) => {
    const activeTheme = overrideTheme || soundTheme;
    const activeVol = overrideVolume || volumeLevel;
    const isEnabled = overrideTheme ? true : (audibleAlertsEnabled && soundEnabled);

    if (!isEnabled || activeVol === "mute") return;

    const multiplier = getGainMultiplier(activeVol);

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

      const playTone = (
        freq: number,
        startTime: number,
        duration: number,
        waveType: OscillatorType = "sine",
        vol = 0.12
      ) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);
        gain.gain.setValueAtTime(0.005, audioCtx.currentTime + startTime);
        gain.gain.linearRampToValueAtTime(vol * multiplier, audioCtx.currentTime + startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startTime + duration);
        osc.start(audioCtx.currentTime + startTime);
        osc.stop(audioCtx.currentTime + startTime + duration + 0.05);
      };

      if (activeTheme === "chime") {
        if (type === "warning") {
          // Urgent double warning chime
          playTone(440, 0, 0.18, "triangle", 0.16);
          playTone(330, 0.2, 0.25, "triangle", 0.16);
        } else if (type === "motivation" || type === "success") {
          // Ascending celebratory chime
          playTone(523.25, 0, 0.14, "sine", 0.12);
          playTone(659.25, 0.12, 0.14, "sine", 0.12);
          playTone(783.99, 0.24, 0.3, "sine", 0.12);
        } else if (type === "sync") {
          // Crisp short sync pulse
          playTone(880, 0, 0.1, "sine", 0.08);
        } else {
          // Default upcoming chime
          playTone(587.33, 0, 0.16, "sine", 0.12);
          playTone(880.00, 0.15, 0.35, "sine", 0.12);
        }
      } else if (activeTheme === "bell") {
        // Resonant harmonic bell tone
        const baseFreq = type === "warning" ? 440 : type === "success" ? 880 : 660;
        playTone(baseFreq, 0, 0.45, "sine", 0.15);
        playTone(baseFreq * 1.5, 0, 0.35, "triangle", 0.08);
      } else if (activeTheme === "harp") {
        // Soft arpeggiated harp
        const notes = type === "warning" ? [392, 493.88, 587.33] : [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          playTone(freq, idx * 0.07, 0.28, "sine", 0.11);
        });
      } else if (activeTheme === "pulse") {
        // Energetic double pulse
        const freq1 = type === "warning" ? 500 : 750;
        const freq2 = type === "warning" ? 400 : 1000;
        playTone(freq1, 0, 0.08, "square", 0.07);
        playTone(freq2, 0.12, 0.14, "square", 0.07);
      } else if (activeTheme === "synth") {
        // Contemporary rich synth sawtooth
        const freq = type === "warning" ? 350 : type === "success" ? 700 : 550;
        playTone(freq, 0, 0.18, "sawtooth", 0.08);
        playTone(freq * 1.25, 0.1, 0.24, "triangle", 0.08);
      }
    } catch {
      // AudioContext policy fallback in sandbox
    }
  };

  // Automatically play audible browser notification sound alongside any new visual alert
  const isInitialMountRef = useRef(true);
  const prevTopNotifIdRef = useRef<string | null>(notifications[0]?.id || null);

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevTopNotifIdRef.current = notifications[0]?.id || null;
      return;
    }
    const topNotif = notifications[0];
    if (topNotif && topNotif.id !== prevTopNotifIdRef.current) {
      prevTopNotifIdRef.current = topNotif.id;
      if (audibleAlertsEnabled && soundEnabled) {
        playAudibleAlert(topNotif.type);
      }
    }
  }, [notifications, audibleAlertsEnabled, soundEnabled, soundTheme, volumeLevel]);

  // Request browser Notification permissions
  const handleRequestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window && typeof Notification !== "undefined") {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        
        if (permission === "granted") {
          onAddNotification(
            "Browser Alerts Connected",
            "You will now receive desktop alerts for upcoming workout sessions.",
            "success"
          );
          playAudibleAlert("success");
        }
      } catch (err) {
        console.warn("Could not request notification settings inside iframe bounds", err);
      }
    }
  };

  // Run dynamic alarm simulation to satisfy "smart notifications"
  const triggerUpcomingSim = () => {
    onAddNotification(
      "Upcoming workout block in 15 mins",
      "Prepare for: Morning Cardio & Stretch! Grab water and start warm-up stretch.",
      "upcoming"
    );
    playAudibleAlert("upcoming");
  };

  const triggerOverdueGoalSim = () => {
    onAddNotification(
      "Goal Schedule Overdue Warning!",
      "React & TypeScript study targets are lagging this week (-1 completions needed prior to Saturday). Let's reschedule!",
      "warning"
    );
    playAudibleAlert("warning");
  };

  const triggerMotivationSim = () => {
    const quotes = [
      "The physical energy you produce during Cardio feeds your cognitive persistence in Study. Let's do this!",
      "Consistency is better than perfection. Log just 15 minutes today!",
      "Your mind coordinates muscle memory and code structures alike. Power up that laptop!",
      "A 45 minute fitness session is only 3% of your daily schedule."
    ];
    const item = quotes[Math.floor(Math.random() * quotes.length)];
    onAddNotification(
      "Daily Motivation Boost",
      item,
      "motivation"
    );
    playAudibleAlert("motivation");
  };

  // Simulated tone responses for compatibility
  const playBeepSound = () => {
    playAudibleAlert("upcoming");
  };

  const playAlertSound = () => {
    playAudibleAlert("warning");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="notifications_grid_container">
      
      {/* SIDEBAR COL: CONTROLS & TEST SIMULATORS */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 p-5 rounded-2xl flex flex-col justify-between min-h-[600px] h-auto lg:h-[660px] shadow-lg dark:shadow-none" id="notifications_controls_panel">
        
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            <h3 className="font-sans font-extrabold text-slate-950 dark:text-white text-sm">Smart Event Alerts</h3>
          </div>
          
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Configure system priorities and browser audio options to alert you to upcoming routines or lag indicators on your goals.
          </p>

          {/* AUDIBLE BROWSER NOTIFICATION SOUNDS PANEL */}
          <div className="bg-slate-50 dark:bg-white/5 p-3.5 rounded-xl border border-slate-200 dark:border-white/10 space-y-3 select-none shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {audibleAlertsEnabled && soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-pulse" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-xs font-bold text-slate-900 dark:text-white">Audible Browser Sounds</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !audibleAlertsEnabled;
                  setAudibleAlertsEnabled(next);
                  setSoundEnabled(next);
                  localStorage.setItem("audible_browser_alerts_enabled", String(next));
                  if (next) {
                    playAudibleAlert("upcoming", soundTheme, volumeLevel);
                  }
                }}
                className={`text-[10px] px-2.5 py-1 rounded font-bold uppercase cursor-pointer transition ${
                  audibleAlertsEnabled && soundEnabled
                    ? "bg-indigo-100 dark:bg-indigo-500/25 text-indigo-900 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40"
                    : "bg-slate-200 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-white/10"
                }`}
              >
                {audibleAlertsEnabled && soundEnabled ? "Audible ON" : "Muted"}
              </button>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
              Plays audible alert tones alongside visual notification alerts. Choose your sound profile & volume below:
            </p>

            {/* Sound Theme Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <Music className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>Alert Sound Style</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 uppercase">
                  {soundTheme}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 bg-slate-200/70 dark:bg-black/40 p-1 rounded-lg border border-slate-300 dark:border-white/5">
                {(["chime", "bell", "harp", "pulse", "synth"] as AudibleSoundTheme[]).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => {
                      setSoundTheme(theme);
                      localStorage.setItem("audible_alert_theme", theme);
                      playAudibleAlert("upcoming", theme, volumeLevel);
                      setTestToneFeedback(`🎵 Tested: ${theme.toUpperCase()}`);
                      setTimeout(() => setTestToneFeedback(null), 2500);
                    }}
                    className={`text-[10px] font-bold py-1.5 rounded capitalize transition cursor-pointer ${
                      soundTheme === theme
                        ? "bg-indigo-600 text-white shadow-sm font-extrabold"
                        : "text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            {/* Volume Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>Alert Volume</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 uppercase">
                  {volumeLevel === "mute" ? "Muted" : volumeLevel === "low" ? "25%" : volumeLevel === "medium" ? "65%" : "100%"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 bg-slate-200/70 dark:bg-black/40 p-1 rounded-lg border border-slate-300 dark:border-white/5">
                {(["low", "medium", "high", "mute"] as VolumeLevel[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      setVolumeLevel(level);
                      localStorage.setItem("audible_alert_volume", level);
                      if (level !== "mute") {
                        playAudibleAlert("sync", soundTheme, level);
                      }
                    }}
                    className={`text-[10px] font-bold py-1.5 rounded capitalize transition cursor-pointer ${
                      volumeLevel === level
                        ? "bg-indigo-600 text-white shadow-sm font-extrabold"
                        : "text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                    }`}
                  >
                    {level === "low" ? "25%" : level === "medium" ? "65%" : level === "high" ? "100%" : "Muted"}
                  </button>
                ))}
              </div>
            </div>

            {/* Test audible sound button */}
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => {
                  playAudibleAlert("upcoming", soundTheme, volumeLevel);
                  setTestToneFeedback(`🎵 Playing audible ${soundTheme.toUpperCase()} alert tone (${volumeLevel.toUpperCase()} vol)`);
                  setTimeout(() => setTestToneFeedback(null), 3000);
                }}
                className="w-full bg-indigo-100 dark:bg-indigo-600/20 hover:bg-indigo-200 dark:hover:bg-indigo-600 border border-indigo-300 dark:border-indigo-500/30 dark:hover:border-indigo-500 text-indigo-900 dark:text-indigo-300 hover:text-indigo-950 dark:hover:text-white font-bold py-1.5 px-3 rounded-lg text-center text-[11px] transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Test Audible Alert Sound</span>
              </button>
              {testToneFeedback && (
                <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold text-center mt-1.5 animate-pulse">
                  {testToneFeedback}
                </p>
              )}
            </div>
          </div>

          {/* Configurable Pre-Session Lead Time Selector */}
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Session Pre-Alert Timing</span>
              <span className="text-[10px] font-mono font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded">
                {alertLeadMinutes}m before
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-black/30 p-1 rounded-lg border border-white/5">
              {[10, 15, 30].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => onUpdateAlertLeadMinutes?.(mins)}
                  className={`text-[10px] font-bold py-1.5 rounded transition cursor-pointer ${
                    alertLeadMinutes === mins
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {mins} Mins
                </button>
              ))}
            </div>
          </div>

          {/* Browser notification credentials status & Push Toggle */}
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-200">Browser Desktop Push</span>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                notificationPermission === "granted" ? "bg-emerald-500/15 text-emerald-300" : "bg-indigo-500/15 text-indigo-300"
              }`}>
                {notificationPermission}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <span className="text-[11px] text-slate-300 font-medium">Automatic Popups</span>
              <button
                type="button"
                onClick={() => onToggleAlertPush?.(!alertPushEnabled)}
                className={`text-[10px] px-2.5 py-1 rounded font-bold uppercase cursor-pointer ${
                  alertPushEnabled ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/5 text-slate-400"
                }`}
              >
                {alertPushEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            
            {notificationPermission !== "granted" && (
              <button
                onClick={handleRequestPermission}
                className="w-full text-center bg-indigo-600 hover:bg-indigo-550 text-white text-[11px] font-bold py-2 rounded-lg transition cursor-pointer mt-1"
              >
                Connect OS Push Notifications
              </button>
            )}
          </div>

          {/* TEST triggers */}
          <div className="space-y-1.5 pt-1">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Simulate Alarm Core Triggers</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  triggerUpcomingSim();
                  if (typeof window !== "undefined" && "Notification" in window && typeof Notification !== "undefined" && Notification.permission === "granted") {
                    try {
                      new Notification(`⏰ Pre-Session Alert (${alertLeadMinutes}m before)`, {
                        body: `Upcoming session: Morning Cardio & Stretch starts in ${alertLeadMinutes} minutes!`
                      });
                    } catch {
                      // fallback
                    }
                  }
                }}
                className="bg-white/5 hover:bg-white/10 border border-white/10 p-2 rounded-xl text-left transition flex items-center gap-1.5 text-[10px] font-bold text-slate-200 cursor-pointer"
              >
                <Play className="w-3 h-3 text-indigo-400 shrink-0" />
                Pre-session ({alertLeadMinutes}m)
              </button>
              <button
                onClick={triggerOverdueGoalSim}
                className="bg-white/5 hover:bg-white/10 border border-white/10 p-2 rounded-xl text-left transition flex items-center gap-1.5 text-[10px] font-bold text-slate-200 cursor-pointer"
              >
                <AlertCircle className="w-3 h-3 text-rose-450 shrink-0" />
                Overdue alarm
              </button>
            </div>
            <button
              onClick={triggerMotivationSim}
              className="w-full bg-indigo-600 hover:bg-indigo-550 border border-white/10 text-white font-bold p-2 rounded-xl text-center text-[10px] uppercase tracking-wider transition cursor-pointer"
            >
              Request daily motivational tip
            </button>
            <button
              onClick={() => {
                if (onTriggerDailyDigest) {
                  onTriggerDailyDigest();
                  playBeepSound();
                }
              }}
              className="w-full bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 hover:border-emerald-500 text-emerald-300 hover:text-white font-bold p-2 rounded-xl text-center text-[10px] uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Sun className="w-3.5 h-3.5" />
              Simulate 8:00 AM Daily Digest
            </button>
          </div>
        </div>

        <p className="text-[9px] text-slate-450 italic">
          * Notifications sync immediately to cloud records and browser cache.
        </p>

      </div>

      {/* DETAILED NOTIFICATIONS INDEX LIST */}
      <div className="bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-lg dark:shadow-xl space-y-4 lg:col-span-2 min-h-[600px] h-auto lg:h-[660px] flex flex-col" id="notifications_history_card">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/10 pb-3 shrink-0 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-sans font-extrabold text-slate-950 dark:text-white text-base">Alarms & Notifications History</h3>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                audibleAlertsEnabled && soundEnabled
                  ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30"
                  : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-white/10"
              }`}>
                {audibleAlertsEnabled && soundEnabled ? (
                  <>
                    <Volume2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                    <span>Audible + Visual Alerts Active ({soundTheme.toUpperCase()})</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3 h-3" />
                    <span>Visual Alerts Only (Audible Muted)</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1">Chronological record of goals schedules and audible browser alert history.</p>
          </div>
          <button
            id="clear_notifications_all_btn"
            onClick={onClearAll}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition font-bold cursor-pointer"
          >
            Clear All
          </button>
        </div>

        {/* History Scroller List */}
        <div className="flex-1 overflow-y-auto space-y-2.5" id="notifications_list_scroller">
          {notifications.length === 0 ? (
            <div className="text-center py-16 text-slate-500 dark:text-slate-450 text-xs">
              <Bell className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
              Notifications tray is empty. Trigger alarms using preset sims!
            </div>
          ) : (
            notifications.map((notif) => {
              const getTypeStyle = (type: string) => {
                if (type === "warning") return "border-red-300 dark:border-red-500/20 bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-300";
                if (type === "upcoming") return "border-amber-300 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300";
                if (type === "motivation") return "border-purple-300 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-950/20 text-purple-900 dark:text-purple-300";
                if (type === "sync") return "border-cyan-300 dark:border-cyan-500/20 bg-cyan-50 dark:bg-cyan-950/20 text-cyan-900 dark:text-cyan-300";
                return "border-emerald-300 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300";
              };

              return (
                <div 
                  key={notif.id} 
                  id={`notif_record_${notif.id}`}
                  className={`p-3.5 border rounded-xl flex items-start justify-between gap-3 ${
                    notif.read ? "opacity-60" : ""
                  } ${getTypeStyle(notif.type)}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`w-1.5 h-1.5 rounded-full ${notif.read ? "bg-slate-400 dark:bg-slate-500" : "bg-indigo-600 dark:bg-indigo-400 animate-ping"}`} />
                      <h4 className="text-xs font-bold leading-tight">{notif.title}</h4>
                      <span className="text-[9px] opacity-75 font-mono">
                        ({new Date(notif.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                      </span>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/10 dark:bg-black/30 text-indigo-900 dark:text-indigo-300 flex items-center gap-1">
                        <Volume2 className="w-2.5 h-2.5" />
                        <span>{soundTheme.toUpperCase()}</span>
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-95 font-medium">{notif.message}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => playAudibleAlert(notif.type)}
                      className="p-1.5 border border-indigo-300 dark:border-indigo-500/30 hover:border-indigo-500 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 hover:bg-indigo-200 dark:hover:bg-indigo-500/25 text-indigo-900 dark:text-indigo-300 hover:text-indigo-950 dark:hover:text-white transition cursor-pointer flex items-center gap-1 text-[10px] font-bold shrink-0"
                      title="Play Audible Browser Notification Sound"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Play Sound</span>
                    </button>
                    {!notif.read && (
                      <button
                        id={`mark_read_btn_${notif.id}`}
                        onClick={() => onMarkRead(notif.id)}
                        className="p-1.5 border border-slate-300 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 rounded-lg bg-white/60 dark:bg-white/5 hover:bg-white dark:hover:bg-white/15 text-slate-800 dark:text-white transition cursor-pointer"
                        title="Mark Read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}
