import React, { useState, useEffect } from "react";
import { 
  Calendar as CalendarIcon, 
  Layers, 
  Sparkles, 
  Bot, 
  Bell, 
  Smartphone, 
  Laptop, 
  RotateCcw, 
  Wifi, 
  WifiOff, 
  Info,
  CheckCircle2,
  CalendarCheck
} from "lucide-react";
import CalendarView from "./components/CalendarView";
import GoalTracker from "./components/GoalTracker";
import ProgressDashboard from "./components/ProgressDashboard";
import AICoach from "./components/AICoach";
import NotificationsPanel from "./components/NotificationsPanel";
import { Goal, CalendarEvent, AvailabilityWindow, AppNotification, CoachMessage, SyncData, GoalType, TimePreference } from "./types";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"calendar" | "goals" | "dashboard" | "coach" | "notifications">("calendar");

  // Sync state & user credentials
  const [userEmail, setUserEmail] = useState("rounigorgees@gmail.com");
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "offline">("synced");
  const [lastSynced, setLastSynced] = useState<string>("");

  // Core application data (Loaded from server / cloud)
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);

  // 1. Initial Data load from cloud sync server
  useEffect(() => {
    const fetchData = async () => {
      setSyncStatus("syncing");
      try {
        const res = await fetch(`/api/sync?email=${encodeURIComponent(userEmail)}`);
        if (res.ok) {
          const data: SyncData = await res.json();
          setGoals(data.goals || []);
          setEvents(data.events || []);
          setAvailability(data.availability || []);
          setNotifications(data.notifications || []);
          setCoachMessages(data.coachMessages || []);
          setLastSynced(new Date().toLocaleTimeString());
          setSyncStatus("synced");
        } else {
          setSyncStatus("offline");
        }
      } catch (err) {
        console.error("Cloud fetch sync failed:", err);
        setSyncStatus("offline");
      }
    };
    fetchData();
  }, [userEmail]);

  // 2. Auto-sync helper (Syncs client modifications directly to server db)
  const syncToCloud = async (
    prevGoals: Goal[],
    prevEvents: CalendarEvent[],
    prevAvailability: AvailabilityWindow[],
    prevNotifications: AppNotification[],
    prevCoachMessages: CoachMessage[]
  ) => {
    setSyncStatus("syncing");
    try {
      const payload: SyncData = {
        goals: prevGoals,
        events: prevEvents,
        availability: prevAvailability,
        notifications: prevNotifications,
        coachMessages: prevCoachMessages,
        userEmail
      };

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const syncedResult = await res.json();
        setLastSynced(new Date().toLocaleTimeString());
        setSyncStatus("synced");
      } else {
        setSyncStatus("offline");
      }
    } catch (err) {
      console.error("Cloud synchronization failed:", err);
      setSyncStatus("offline");
    }
  };

  // 3. Automated Routine checkers (Checks for overdue items or immediate notifications on mount / tick)
  useEffect(() => {
    if (goals.length === 0) return;

    // Checks if any workout or study target has 0 completions mid-week
    const runStartupOverdueScanner = () => {
      const dayOfWeek = new Date().getDay();
      
      // If it's Thursday, Friday or Saturday (mid-to-late week), send warning for unstarted schedules
      if (dayOfWeek >= 4) {
        const lagGoals = goals.filter(g => g.completedCount === 0);
        lagGoals.forEach(lg => {
          // Check if warning not already pushed recently
          const alreadyWarned = notifications.some(n => n.message.includes(lg.name) && n.type === "warning");
          if (!alreadyWarned) {
            triggerSystemNotification(
              "Goal Schedule Warning!",
              `Your goal "${lg.name}" has 0 completions recorded. Let's schedule a session today!`,
              "warning"
            );
          }
        });
      }
    };

    // Run review 1 second after startup
    const timer = setTimeout(runStartupOverdueScanner, 1200);
    return () => clearTimeout(timer);
  }, [goals]);

  // Dynamic system notification pusher
  const triggerSystemNotification = (
    title: string,
    message: string,
    type: AppNotification["type"]
  ) => {
    const newNotif: AppNotification = {
      id: `n_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false,
      type
    };

    setNotifications(prev => {
      const updated = [newNotif, ...prev];
      // Sync immediately with current variables
      syncToCloud(goals, events, availability, updated, coachMessages);
      return updated;
    });

    // Browser dynamic desktop alerts fallback if enabled
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body: message });
      } catch {
        // Safe backup catch
      }
    }
  };

  // --- REACTIVE MUTATORS FOR SUBCOMPONENTS ---

  // A. Add Calendar event (Manual)
  const handleAddEvent = (evt: Omit<CalendarEvent, "id">) => {
    const newEvt: CalendarEvent = {
      ...evt,
      id: `e_${Date.now()}`
    };
    const nextEvents = [newEvt, ...events];
    setEvents(nextEvents);
    
    // Auto-increment goal completion if checked directly (standalone manual entry)
    let nextGoals = [...goals];
    if (evt.goalId && evt.completed) {
      nextGoals = goals.map(g => 
        g.id === evt.goalId ? { ...g, completedCount: g.completedCount + 1 } : g
      );
      setGoals(nextGoals);
    }

    syncToCloud(nextGoals, nextEvents, availability, notifications, coachMessages);
  };

  // B. Toggle complete state on events
  const handleToggleEventComplete = (id: string) => {
    let nextGoals = [...goals];
    const nextEvents = events.map(evt => {
      if (evt.id === id) {
        const toggleVal = !evt.completed;
        
        // Update tied goals completion totals
        if (evt.goalId) {
          nextGoals = goals.map(g => {
            if (g.id === evt.goalId) {
              const countChange = toggleVal ? 1 : -1;
              return { ...g, completedCount: Math.max(g.completedCount + countChange, 0) };
            }
            return g;
          });
        }

        // Push congrats notification
        if (toggleVal) {
          const typeLabel = evt.type === "workout" ? "Physical session completed!" : "Intellectual study block aced!";
          triggerSystemNotification(
            "Session Achieved!",
            `Success: "${evt.title}" marked as done. ${typeLabel}`,
            "success"
          );
        }

        return { ...evt, completed: toggleVal };
      }
      return evt;
    });

    setEvents(nextEvents);
    setGoals(nextGoals);
    syncToCloud(nextGoals, nextEvents, availability, notifications, coachMessages);
  };

  // C. Delete existing event
  const handleDeleteEvent = (id: string) => {
    const targetEvt = events.find(e => e.id === id);
    let nextGoals = [...goals];

    // Decrement completed aggregates if deleting an already completed event
    if (targetEvt && targetEvt.completed && targetEvt.goalId) {
      nextGoals = goals.map(g => 
        g.id === targetEvt.goalId ? { ...g, completedCount: Math.max(g.completedCount - 1, 0) } : g
      );
      setGoals(nextGoals);
    }

    const nextEvents = events.filter(e => e.id !== id);
    setEvents(nextEvents);
    syncToCloud(nextGoals, nextEvents, availability, notifications, coachMessages);
  };

  // D. Create custom Goal Object
  const handleAddGoal = (newGoalRaw: Omit<Goal, "id" | "completedCount" | "createdAt">) => {
    const newGoal: Goal = {
      ...newGoalRaw,
      id: `g_${Date.now()}`,
      completedCount: 0,
      createdAt: new Date().toISOString()
    };
    const nextGoals = [newGoal, ...goals];
    setGoals(nextGoals);
    syncToCloud(nextGoals, events, availability, notifications, coachMessages);
  };

  // E. Delete custom Goal
  const handleDeleteGoal = (goalId: string) => {
    const nextGoals = goals.filter(g => g.id !== goalId);
    // Erase events tied to this goal
    const nextEvents = events.filter(e => e.goalId !== goalId);
    setGoals(nextGoals);
    setEvents(nextEvents);
    syncToCloud(nextGoals, nextEvents, availability, notifications, coachMessages);
  };

  // F. Push solver bulk scheduled blocks
  const handleBulkAddEvents = (newEvents: CalendarEvent[]) => {
    const nextEvents = [...newEvents, ...events];
    setEvents(nextEvents);
    syncToCloud(goals, nextEvents, availability, notifications, coachMessages);
  };

  // G. Update Active Availability
  const handleUpdateAvailability = (nextAvail: AvailabilityWindow[]) => {
    setAvailability(nextAvail);
    syncToCloud(goals, events, nextAvail, notifications, coachMessages);
  };

  // H. Reset or import external components
  const handleImportCalendar = (name: string, dataString: string) => {
    // Generate some simulated non-overlapping external events
    const today = new Date();
    const mockExternalEvents: CalendarEvent[] = [
      {
        id: `ext_${Date.now()}_1`,
        title: `Busy: ${name}`,
        type: "external",
        start: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 10, 0).toISOString(),
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12, 0).toISOString(),
        completed: false,
        notes: "Imported conflict constraint blocks schedule solver."
      },
      {
        id: `ext_${Date.now()}_2`,
        title: `Busy: ${name}`,
        type: "external",
        start: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 14, 0).toISOString(),
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 16, 0).toISOString(),
        completed: false,
        notes: "Overlap safety constraint."
      }
    ];

    const nextEvents = [...mockExternalEvents, ...events];
    setEvents(nextEvents);
    triggerSystemNotification(
      "Existing Calendar Synced",
      `Successfully loaded constraints from external RSS/ICS feed. Schedulers will avoid these hours.`,
      "sync"
    );
    syncToCloud(goals, nextEvents, availability, notifications, coachMessages);
  };

  // I. Add customized system messages
  const handleAddCoachMessage = (msg: CoachMessage) => {
    const nextMsgs = [...coachMessages, msg];
    setCoachMessages(nextMsgs);
    // We don't necessarily have to block the interface on syncing simple coach text, but doing so keeps cloud sync in pristine shape
    syncToCloud(goals, events, availability, notifications, nextMsgs);
  };

  const handleClearCoachHistory = () => {
    const cleanMsg: CoachMessage[] = [
      {
        id: "m_rst",
        sender: "coach",
        text: "Log initialized. Suggest optimized workout blocks now!",
        timestamp: new Date().toISOString()
      }
    ];
    setCoachMessages(cleanMsg);
    syncToCloud(goals, events, availability, notifications, cleanMsg);
  };

  const handleMarkNotificationRead = (notifId: string) => {
    const nextNotifs = notifications.map(n => 
      n.id === notifId ? { ...n, read: true } : n
    );
    setNotifications(nextNotifs);
    syncToCloud(goals, events, availability, nextNotifs, coachMessages);
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
    syncToCloud(goals, events, availability, [], coachMessages);
  };

  // Preset reset state to start fresh
  const handleResetApplicationState = () => {
    if (confirm("Are you sure you want to reset all goals, availability, and scheduled blocks?")) {
      const initial = {
        goals: [],
        events: [],
        availability: [
          { dayOfWeek: 0, startTime: "09:00", endTime: "21:00", active: true },
          { dayOfWeek: 1, startTime: "08:00", endTime: "22:00", active: true },
          { dayOfWeek: 2, startTime: "08:00", endTime: "22:00", active: true },
          { dayOfWeek: 3, startTime: "08:00", endTime: "22:00", active: true },
          { dayOfWeek: 4, startTime: "08:00", endTime: "22:00", active: true },
          { dayOfWeek: 5, startTime: "08:00", endTime: "18:00", active: true },
          { dayOfWeek: 6, startTime: "09:00", endTime: "19:00", active: true }
        ],
        notifications: [
          {
            id: `n_cln`,
            title: "Planner Reset",
            message: "Setup fresh physical and intellectual routines.",
            timestamp: new Date().toISOString(),
            read: false,
            type: "success" as const
          }
        ],
        coachMessages: [
          {
            id: `m_cln`,
            sender: "coach" as const,
            text: "Welcome back! Let's build a magnificent calendar routine.",
            timestamp: new Date().toISOString()
          }
        ]
      };

      setGoals([]);
      setEvents([]);
      setAvailability(initial.availability);
      setNotifications(initial.notifications);
      setCoachMessages(initial.coachMessages);
      syncToCloud([], [], initial.availability, initial.notifications, initial.coachMessages);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c14] text-white flex flex-col font-sans antialiased pb-12 selection:bg-indigo-500/30 selection:text-indigo-200" style={{ backgroundImage: "radial-gradient(circle at 0% 0%, #1e1b4b 0%, transparent 60%), radial-gradient(circle at 100% 100%, #311042 0%, transparent 60%)" }}>
      
      {/* GLORIOUS ACCENT TOP REGION (Frosted Glass Theme) */}
      <div className="bg-white/5 backdrop-blur-md border-b border-white/10 shadow-lg relative overflow-hidden" id="dash_global_accent_header">
        
        {/* Absolute ambient lines to anchor Swiss Design ethos */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-indigo-500/20 to-transparent opacity-80 z-0" />
        <div className="absolute left-1/4 -top-12 w-64 h-64 rounded-full bg-indigo-500/5 blur-3xl z-0" />

        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/5">
          
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-indigo-300">System Core Node</span>
          </div>

          {/* Sync indicator widget */}
          <div className="flex items-center gap-4 text-xs font-medium" id="sync_status_anchor_indicators">
            <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/10">
              <span className="hidden md:inline text-slate-400">Target Profile:</span>
              <span className="font-mono text-indigo-300 font-bold">{userEmail}</span>
            </div>

            <div className="flex items-center gap-2">
              {syncStatus === "synced" && (
                <div className="flex items-center gap-1 bg-emerald-500/15 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20 shadow-xs">
                  <Wifi className="w-3.5 h-3.5" />
                  <span className="font-bold text-[10px] uppercase">Synced with cloud</span>
                </div>
              )}
              {syncStatus === "syncing" && (
                <div className="flex items-center gap-1 bg-amber-500/15 text-amber-400 px-3 py-1 rounded-full border border-amber-500/20 animate-pulse">
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-bold text-[10px] uppercase">Syncing...</span>
                </div>
              )}
              {syncStatus === "offline" && (
                <div className="flex items-center gap-1 bg-rose-500/20 text-rose-400 px-3 py-1 rounded-full border border-rose-500/30">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span className="font-bold text-[10px] uppercase">Offline Mode</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Outer Visual layout Hero headings */}
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-10">
          <div className="space-y-1">
            <h1 className="font-display font-bold text-3xl tracking-tight sm:text-4xl text-white">
              Goals Calendar & AI Coach
            </h1>
            <p className="text-slate-300 text-sm max-w-xl font-medium">
              Synchronize physical workouts and intensive learning routines inside the optimal conflict-free periods. Keep your schedule 100% on track.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10">
            <button 
              onClick={() => setActiveTab("calendar")}
              className="text-xs px-3 py-2 rounded-lg font-bold hover:bg-white/10 text-white transition whitespace-nowrap"
            >
              Laptop View
            </button>
            <span className="text-white/20 select-none">|</span>
            <div className="hidden sm:flex items-center gap-1 text-xs text-slate-300 px-2.5">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <span>Mobile Ready Sync</span>
            </div>
          </div>
        </div>

      </div>

      {/* DASHBOARD TAB NAVIGATION BAR */}
      <div className="bg-[#0a0c14]/75 backdrop-blur-md border-b border-white/10 sticky top-0 z-40" id="dash_navigation_row">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1.5 py-3 overflow-x-auto scrollbar-none">
            
            {/* TABS LIST */}
            <button
              id="tab_trigger_calendar"
              onClick={() => setActiveTab("calendar")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 ${
                activeTab === "calendar"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              Schedule Grid
            </button>

            <button
              id="tab_trigger_goals"
              onClick={() => setActiveTab("goals")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 ${
                activeTab === "goals"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <Layers className="w-4 h-4" />
              Goals & Constraints
            </button>

            <button
              id="tab_trigger_dashboard"
              onClick={() => setActiveTab("dashboard")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 ${
                activeTab === "dashboard"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Progress Metrics
            </button>

            <button
              id="tab_trigger_coach"
              onClick={() => setActiveTab("coach")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 ${
                activeTab === "coach"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <Bot className="w-4 h-4" />
              AI Routine Coach
            </button>

            <button
              id="tab_trigger_notifications"
              onClick={() => setActiveTab("notifications")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 relative ${
                activeTab === "notifications"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <Bell className="w-4 h-4" />
              Alert Logs
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-pink-500 text-white rounded-full text-[9px] font-bold leading-5 text-center shadow-sm animate-pulse">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

          </div>
        </div>
      </div>

      {/* CORE DISPLAY WINDOW SECTION */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 flex-1 w-full" id="dash_rendered_main_stage">
        
        {/* ACTIVE TABS CONTROLLER */}
        {activeTab === "calendar" && (
          <div className="space-y-6">
            
            {/* Quick motivators */}
            {notifications.length > 0 && (
              <div id="motivation_floating_tip" className="bg-white/5 backdrop-blur-md border border-white/10 p-3.5 rounded-xl flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
                <p className="text-xs text-slate-100 leading-relaxed font-medium">
                  <span className="font-bold text-indigo-300">Motivational Pulse:</span> "{notifications[0].message}"
                </p>
              </div>
            )}

            <CalendarView 
              events={events}
              goals={goals}
              onAddEvent={handleAddEvent}
              onToggleCompleteEvent={handleToggleEventComplete}
              onDeleteEvent={handleDeleteEvent}
              onImportCalendar={handleImportCalendar}
            />
          </div>
        )}

        {activeTab === "goals" && (
          <GoalTracker 
            goals={goals}
            availability={availability}
            events={events}
            onAddGoal={handleAddGoal}
            onDeleteGoal={handleDeleteGoal}
            onUpdateAvailability={handleUpdateAvailability}
            onBulkAddEvents={handleBulkAddEvents}
            onAddNotification={triggerSystemNotification}
          />
        )}

        {activeTab === "dashboard" && (
          <ProgressDashboard 
            goals={goals}
            events={events}
          />
        )}

        {activeTab === "coach" && (
          <AICoach 
            goals={goals}
            events={events}
            availability={availability}
            coachMessages={coachMessages}
            onAddMessage={handleAddCoachMessage}
            onClearMessages={handleClearCoachHistory}
          />
        )}

        {activeTab === "notifications" && (
          <NotificationsPanel 
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onClearAll={handleClearAllNotifications}
            onAddNotification={triggerSystemNotification}
          />
        )}

      </main>

      {/* FOOTER ACTIONS AND REBOOTS */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 select-none" id="dash_footer">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Calendar Goals & AI Planner v1.2</span>
          <span>•</span>
          <span>Security Hardened Node Sandbox</span>
        </div>

        <button
          id="global_reset_system_btn"
          onClick={handleResetApplicationState}
          className="text-[10px] text-slate-400 hover:text-red-400 transition-colors tracking-wider font-bold uppercase cursor-pointer"
        >
          Factory Reset App Data
        </button>
      </footer>

    </div>
  );
}
