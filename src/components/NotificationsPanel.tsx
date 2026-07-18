import React, { useState } from "react";
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
  Sun
} from "lucide-react";
import { AppNotification } from "../types";

interface NotificationsPanelProps {
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onClearAll: () => void;
  onAddNotification: (title: string, message: string, type: "upcoming" | "warning" | "motivation" | "success" | "sync") => void;
  onTriggerDailyDigest?: () => void;
}

export default function NotificationsPanel({
  notifications,
  onMarkRead,
  onClearAll,
  onAddNotification,
  onTriggerDailyDigest
}: NotificationsPanelProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" ? Notification.permission : "default"
  );

  // Request browser Notification permissions
  const handleRequestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        
        if (permission === "granted") {
          onAddNotification(
            "Browser Alerts Connected",
            "You will now receive desktop alerts for upcoming workout sessions.",
            "success"
          );
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
    playBeepSound();
  };

  const triggerOverdueGoalSim = () => {
    onAddNotification(
      "Goal Schedule Overdue Warning!",
      "React & TypeScript study targets are lagging this week (-1 completions needed prior to Saturday). Let's reschedule!",
      "warning"
    );
    playAlertSound();
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
  };

  // Simulated tone responses
  const playBeepSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, audioCtx.currentTime); // high melody
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // safe backup ignore in sandbox bounds
    }
  };

  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // lower warning
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {
      // safe backup ignore
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="notifications_grid_container">
      
      {/* SIDEBAR COL: CONTROLS & TEST SIMULATORS */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex flex-col justify-between h-[500px]" id="notifications_controls_panel">
        
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-indigo-400 animate-pulse" />
            <h3 className="font-sans font-bold text-white text-sm">Smart Event Alerts</h3>
          </div>
          
          <p className="text-xs text-slate-300 leading-relaxed">
            Configure system priorities and browser audio options to alert you to upcoming routines or lag indicators on your goals.
          </p>

          {/* Sound enable select */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 select-none">
            <div className="flex items-center gap-2">
              {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              <span className="text-xs font-semibold text-slate-200">In-App Notification Tones</span>
            </div>
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                playBeepSound();
              }}
              className={`text-[10px] px-2.5 py-1 rounded font-bold uppercase cursor-pointer ${
                soundEnabled ? "bg-indigo-500/15 text-indigo-300" : "bg-white/5 text-slate-400"
              }`}
            >
              {soundEnabled ? "On" : "Muted"}
            </button>
          </div>

          {/* Browser notification credentials status */}
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-200">OS Desktop Notifications</span>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                notificationPermission === "granted" ? "bg-emerald-500/15 text-emerald-300" : "bg-indigo-500/15 text-indigo-300"
              }`}>
                {notificationPermission}
              </span>
            </div>
            
            {notificationPermission !== "granted" && (
              <button
                onClick={handleRequestPermission}
                className="w-full text-center bg-indigo-600 hover:bg-indigo-550 text-white text-[11px] font-bold py-2 rounded-lg transition cursor-pointer"
              >
                Connect OS Push Notifications
              </button>
            )}
          </div>

          {/* TEST triggers */}
          <div className="space-y-1.5 pt-2">
            <h4 className="text-[10px] font-bold text-slate-405 uppercase tracking-widest leading-none mb-1">Simulate Alarm Core Triggers</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={triggerUpcomingSim}
                className="bg-white/5 hover:bg-white/10 border border-white/10 p-2.5 rounded-xl text-left transition flex items-center gap-1.5 text-[10px] font-bold text-slate-200 cursor-pointer"
              >
                <Play className="w-3 h-3 text-indigo-400 shrink-0" />
                Upcoming alarm
              </button>
              <button
                onClick={triggerOverdueGoalSim}
                className="bg-white/5 hover:bg-white/10 border border-white/10 p-2.5 rounded-xl text-left transition flex items-center gap-1.5 text-[10px] font-bold text-slate-200 cursor-pointer"
              >
                <AlertCircle className="w-3 h-3 text-rose-450 shrink-0" />
                Overdue alarm
              </button>
            </div>
            <button
              onClick={triggerMotivationSim}
              className="w-full bg-indigo-600 hover:bg-indigo-550 border border-white/10 text-white font-bold p-2.5 rounded-xl text-center text-[10px] uppercase tracking-wider transition mt-1 cursor-pointer"
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
              className="w-full bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 hover:border-emerald-500 text-emerald-300 hover:text-white font-bold p-2.5 rounded-xl text-center text-[10px] uppercase tracking-wider transition mt-2.5 cursor-pointer flex items-center justify-center gap-1.5"
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
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl space-y-4 lg:col-span-2 h-[500px] flex flex-col" id="notifications_history_card">
        <div className="flex justify-between items-center border-b border-white/10 pb-3 shrink-0">
          <div>
            <h3 className="font-sans font-semibold text-white text-base">Alarms & Notifications History</h3>
            <p className="text-xs text-slate-300 font-medium">Chronological record of goals schedules and optimizations.</p>
          </div>
          <button
            id="clear_notifications_all_btn"
            onClick={onClearAll}
            className="text-xs text-slate-400 hover:text-red-400 transition font-bold cursor-pointer"
          >
            Clear All
          </button>
        </div>

        {/* History Scroller List */}
        <div className="flex-1 overflow-y-auto space-y-2.5" id="notifications_list_scroller">
          {notifications.length === 0 ? (
            <div className="text-center py-16 text-slate-450 text-xs">
              <Bell className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              Notifications tray is empty. Trigger alarms using preset sims!
            </div>
          ) : (
            notifications.map((notif) => {
              const getTypeStyle = (type: string) => {
                if (type === "warning") return "border-red-500/20 bg-red-950/20 text-red-300";
                if (type === "upcoming") return "border-amber-500/20 bg-amber-950/20 text-amber-300";
                if (type === "motivation") return "border-purple-500/20 bg-purple-950/20 text-purple-300";
                if (type === "sync") return "border-cyan-500/20 bg-cyan-950/20 text-cyan-300";
                return "border-emerald-500/20 bg-emerald-950/20 text-emerald-300";
              };

              return (
                <div 
                  key={notif.id} 
                  id={`notif_record_${notif.id}`}
                  className={`p-3.5 border rounded-xl flex items-start justify-between gap-3 ${
                    notif.read ? "opacity-55" : ""
                  } ${getTypeStyle(notif.type)}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`w-1.5 h-1.5 rounded-full ${notif.read ? "bg-slate-500" : "bg-indigo-400 animate-ping"}`} />
                      <h4 className="text-xs font-bold leading-tight">{notif.title}</h4>
                      <span className="text-[9px] opacity-75 font-mono">
                        ({new Date(notif.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">{notif.message}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!notif.read && (
                      <button
                        id={`mark_read_btn_${notif.id}`}
                        onClick={() => onMarkRead(notif.id)}
                        className="p-1 border border-white/10 hover:border-white/30 rounded-lg bg-white/5 hover:bg-white/15 text-white transition cursor-pointer"
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
