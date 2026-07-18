import React, { useState, useEffect, useRef } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Plus, 
  Check, 
  Trash2, 
  Upload, 
  Link2, 
  AlertTriangle,
  Info,
  RefreshCw,
  LogOut,
  Key,
  Globe,
  Send,
  CheckCircle2,
  CalendarCheck,
  Download,
  Lock
} from "lucide-react";
import { 
  Pencil, 
  Activity, 
  BookOpen, 
  Sparkles, 
  X,
  Target,
  Trophy,
  Sliders,
  CheckCircle,
  HelpCircle,
  Briefcase,
  Laptop,
  RotateCw,
  Smile
} from "lucide-react";
import { CalendarEvent, Goal, GoalType, TimePreference } from "../types";

interface CalendarViewProps {
  events: CalendarEvent[];
  goals: Goal[];
  onAddEvent: (event: Omit<CalendarEvent, "id">) => void;
  onToggleCompleteEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onImportCalendar: (name: string, dataString: string, realEvents?: CalendarEvent[]) => void;
  onAddGoal?: (goal: Omit<Goal, "id" | "completedCount" | "createdAt">) => void;
  onEditGoal?: (goalId: string, updatedFields: Partial<Omit<Goal, "id" | "createdAt">>) => void;
  onDeleteGoal?: (goalId: string) => void;
  onEditEvent?: (eventId: string, updatedFields: Partial<Omit<CalendarEvent, "id">>) => void;
}

export default function CalendarView({
  events,
  goals,
  onAddEvent,
  onToggleCompleteEvent,
  onDeleteEvent,
  onImportCalendar,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  onEditEvent
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<"week" | "day" | "list">("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Goals Sidebar Form/Mode States
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalName, setGoalName] = useState("");
  const [goalType, setGoalType] = useState<GoalType>(GoalType.WORKOUT);
  const [goalCategory, setGoalCategory] = useState("");
  const [goalWeeklyTarget, setGoalWeeklyTarget] = useState(3);
  const [goalDuration, setGoalDuration] = useState(60);
  const [goalTimePref, setGoalTimePref] = useState<TimePreference>(TimePreference.ANY);
  const [goalColor, setGoalColor] = useState("#f43f5e");
  
  // Event Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<CalendarEvent["type"]>("personal");
  const [newDay, setNewDay] = useState(new Date().toISOString().split("T")[0]);
  const [newStartTime, setNewStartTime] = useState("09:00");
  const [newEndTime, setNewEndTime] = useState("10:00");
  const [newNotes, setNewNotes] = useState("");
  const [newGoalId, setNewGoalId] = useState("");
  const [newCompleted, setNewCompleted] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // External Calendar Sync State
  const [externalSource, setExternalSource] = useState("");
  const [externalName, setExternalName] = useState("");
  const [showSyncPanel, setShowSyncPanel] = useState(true);
  const [icsInput, setIcsInput] = useState("");

  // Google Calendar Integration State
  const [googleAccessToken, setGoogleAccessToken] = useState(() => localStorage.getItem("gcal_access_token") || "");
  const [googleEmail, setGoogleEmail] = useState(() => localStorage.getItem("gcal_email") || "");
  const [gcalStatus, setGcalStatus] = useState<string>("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [manualTokenVal, setManualTokenVal] = useState("");
  const [importingGcal, setImportingGcal] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ [id: string]: "idle" | "syncing" | "success" | "error" }>({});
  const [autoGcalExport, setAutoGcalExport] = useState(() => localStorage.getItem("auto_gcal_export") === "true");

  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // Resolve custom goal color if event is associated with a goal
  const getEventColorStyles = (evt: CalendarEvent) => {
    const goal = goals.find(g => g.id === evt.goalId);
    const baseColor = goal?.color;

    if (baseColor) {
      return {
        borderLeftColor: baseColor,
        backgroundColor: `${baseColor}20`, // 12% opacity
        color: "#f8fafc",
        hoverBg: `${baseColor}40`, // 25% opacity
        dotColor: baseColor,
        isCustom: true
      };
    }

    // Default Fallbacks based on category/type
    const fallbackColors: Record<string, { border: string; bg: string; text: string; hoverBg: string; dot: string }> = {
      workout: { border: "#f43f5e", bg: "rgba(244, 63, 94, 0.15)", text: "#fecdd3", hoverBg: "rgba(244, 63, 94, 0.3)", dot: "#f43f5e" },
      study: { border: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", text: "#cffafe", hoverBg: "rgba(6, 182, 212, 0.3)", dot: "#06b6d4" },
      job_search: { border: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)", text: "#bfdbfe", hoverBg: "rgba(59, 130, 246, 0.3)", dot: "#3b82f6" },
      side_project: { border: "#ec4899", bg: "rgba(236, 72, 153, 0.15)", text: "#fbcfe8", hoverBg: "rgba(236, 72, 153, 0.3)", dot: "#ec4899" },
      routine: { border: "#10b981", bg: "rgba(16, 185, 129, 0.15)", text: "#a7f3d0", hoverBg: "rgba(16, 185, 129, 0.3)", dot: "#10b981" },
      personal: { border: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", text: "#fde68a", hoverBg: "rgba(245, 158, 11, 0.3)", dot: "#f59e0b" },
      external: { border: "#64748b", bg: "rgba(100, 116, 139, 0.15)", text: "#cbd5e1", hoverBg: "rgba(100, 116, 139, 0.3)", dot: "#64748b" }
    };

    const current = fallbackColors[evt.type] || { border: "#6366f1", bg: "rgba(99, 102, 241, 0.15)", text: "#e0e7ff", hoverBg: "rgba(99, 102, 241, 0.3)", dot: "#6366f1" };

    return {
      borderLeftColor: current.border,
      backgroundColor: current.bg,
      color: current.text,
      hoverBg: current.hoverBg,
      dotColor: current.dot,
      isCustom: false
    };
  };

  const getEventIcon = (evt: CalendarEvent) => {
    const goal = goals.find(g => g.id === evt.goalId);
    const type = goal ? goal.type : evt.type;
    const colors = getEventColorStyles(evt);
    
    switch (type) {
      case "workout":
      case GoalType.WORKOUT:
        return <Activity className="w-3.5 h-3.5 shrink-0" style={{ color: colors.borderLeftColor }} />;
      case "study":
      case GoalType.STUDY:
        return <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: colors.borderLeftColor }} />;
      case "job_search":
      case GoalType.JOB_SEARCH:
        return <Briefcase className="w-3.5 h-3.5 shrink-0" style={{ color: colors.borderLeftColor }} />;
      case "side_project":
      case GoalType.SIDE_PROJECT:
        return <Laptop className="w-3.5 h-3.5 shrink-0" style={{ color: colors.borderLeftColor }} />;
      case "routine":
      case GoalType.ROUTINE:
        return <RotateCw className="w-3.5 h-3.5 shrink-0" style={{ color: colors.borderLeftColor }} />;
      case "personal":
      case GoalType.PERSONAL:
        return <Smile className="w-3.5 h-3.5 shrink-0" style={{ color: colors.borderLeftColor }} />;
      default:
        return <Activity className="w-3.5 h-3.5 shrink-0" style={{ color: colors.borderLeftColor }} />;
    }
  };

  // Custom modal dialog to replace blocking system alerts/confirms that get blocked in sandbox iframes
  const [customDialog, setCustomDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    isAlertOnly?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const unexportedCount = events.filter(e => e.type !== "external" && exportStatus[e.id] !== "success").length;

  // Implicit flow parser and popup controller
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const token = params.get("access_token");
      if (token) {
        if (window.opener) {
          try {
            window.opener.postMessage({ type: "GOOGLE_OAUTH_TOKEN", token }, window.location.origin);
            window.close();
            return;
          } catch (e) {
            console.error("Failed to post message to main window: ", e);
          }
        }
        setGoogleAccessToken(token);
        localStorage.setItem("gcal_access_token", token);
        setGcalStatus("Successfully connected!");
        window.location.hash = ""; // Clear hash
        fetchGoogleProfile(token);
      }
    } else if (googleAccessToken) {
      fetchGoogleProfile(googleAccessToken);
    }
  }, []);

  // Popup message handler listener for the main application window
  useEffect(() => {
    const handleGoogleMessage = (e: MessageEvent) => {
      // Accept messages from preview container domains or local server
      if (e.origin && !e.origin.endsWith(".run.app") && !e.origin.includes("localhost") && !e.origin.includes("127.0.0.1")) {
        return;
      }
      if (e.data && e.data.type === "GOOGLE_OAUTH_TOKEN" && e.data.token) {
        const token = e.data.token;
        setGoogleAccessToken(token);
        localStorage.setItem("gcal_access_token", token);
        setGcalStatus("Successfully verified with Google Calendar via secure popup!");
        fetchGoogleProfile(token);
      }
    };
    window.addEventListener("message", handleGoogleMessage);
    return () => window.removeEventListener("message", handleGoogleMessage);
  }, []);

  // Listen for external URL trigger events forwarded from App.tsx
  useEffect(() => {
    if (typeof window !== "undefined") {
      if ((window as any)._autoEditGoal) {
        const g: Goal = (window as any)._autoEditGoal;
        delete (window as any)._autoEditGoal;
        
        // Open edit panel preloaded with attributes
        setEditingGoalId(g.id);
        setGoalName(g.name);
        setGoalType(g.type);
        setGoalCategory(g.category);
        setGoalWeeklyTarget(g.weeklyTarget);
        setGoalDuration(g.durationMinutes);
        setGoalTimePref(g.timePreference);
        setGoalColor(g.color);
        setShowGoalForm(true);
      } else if ((window as any)._autoAddGoal) {
        delete (window as any)._autoAddGoal;
        
        // Open clean add panel
        setEditingGoalId(null);
        setGoalName("");
        setGoalType(GoalType.WORKOUT);
        setGoalCategory("");
        setGoalWeeklyTarget(3);
        setGoalDuration(60);
        setGoalTimePref(TimePreference.ANY);
        setGoalColor("#f43f5e");
        setShowGoalForm(true);
      }
    }
  }, [events, goals]);

  const fetchGoogleProfile = async (token: string) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.email) {
          setGoogleEmail(data.email);
          localStorage.setItem("gcal_email", data.email);
        }
      }
    } catch (err) {
      console.warn("Could not retrieve email from Google Account payload", err);
    }
  };

  const handleLaunchGoogleOAuth = () => {
    const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email");
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const implicitUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=742721019992-0bmb2dajms66ehm65j8siv3clj08v70l.apps.googleusercontent.com&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&prompt=consent`;
    
    // Open Google Accounts Auth directly in a popup (Google prohibits loading inside iframes)
    const width = 600;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const popup = window.open(
      implicitUrl,
      "google_oauth_popup",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
    );
    
    if (popup) {
      popup.focus();
      setGcalStatus("Authentication popup initiated. Please sign in there...");
    } else {
      // Fallback if browser blocks popups
      setGcalStatus("Popup window blocked! Please allow popups for this site, or we will redirect your page...");
      setTimeout(() => {
        window.location.href = implicitUrl;
      }, 2500);
    }
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = manualTokenVal.trim();
    if (token) {
      setGoogleAccessToken(token);
      localStorage.setItem("gcal_access_token", token);
      setGcalStatus("Connected manually using custom Developer Token!");
      setManualTokenVal("");
      setShowTokenInput(false);
      fetchGoogleProfile(token);
    }
  };

  const handleDisconnectGoogle = () => {
    setGoogleAccessToken("");
    setGoogleEmail("");
    localStorage.removeItem("gcal_access_token");
    localStorage.removeItem("gcal_email");
    setGcalStatus("Disconnected Google Account.");
  };

  // 📥 IMPORT: Fetch and import Google Calendar events within current week bounds
  const handleImportGoogleCalendar = async () => {
    if (!googleAccessToken) return;
    setImportingGcal(true);
    setGcalStatus("Initiating sync with Google Calendar API...");
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 7500); // 7.5 seconds timeout limit

    try {
      const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(); // 30 days before
      const timeMax = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); // 1 month after
      
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=150`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 401) {
          handleDisconnectGoogle();
          throw new Error("Invalid or expired OAuth Access Token. Your session has been safely reset; please click 'Connect Google Calendar' again to re-authenticate.");
        }
        throw new Error(`Google API request failed with status: ${res.status}`);
      }

      const data = await res.json();
      const items = data.items || [];
      
      const normalizedEvents: CalendarEvent[] = items.map((item: any) => {
        const startRaw = item.start?.dateTime || item.start?.date || new Date().toISOString();
        const endRaw = item.end?.dateTime || item.end?.date || new Date(Date.now() + 1 * 3600 * 1000).toISOString();
        return {
          id: `gcal_${item.id}`,
          title: item.summary || "Google Calendar Event (Busy)",
          type: "external" as const,
          start: new Date(startRaw).toISOString(),
          end: new Date(endRaw).toISOString(),
          completed: false,
          notes: item.description || "Synced directly from your Google Calendar."
        };
      });

      onImportCalendar("Google Calendar", "", normalizedEvents);
      setGcalStatus(`Successfully synchronized ${normalizedEvents.length} events from your Google Calendar!`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error("Google Calendar import failed: ", err);
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        setGcalStatus("Connection timed out (7.5s limit). This is normally caused by: 1) browser extensions (e.g. Brave Shields, AdBlockers, privacy/cookie filters) intercepting API requests, or 2) sandbox iframe security. Try opening the app in a NEW TAB!");
      } else {
        setGcalStatus(`Error syncing Calendar items: ${err.message || err}`);
      }
    } finally {
      setImportingGcal(false);
    }
  };

  // Helper to show a safe alert inside sandboxed iframes
  const showCustomAlert = (title: string, message: string) => {
    setCustomDialog({
      isOpen: true,
      title,
      message,
      confirmText: "Close",
      isAlertOnly: true,
      onConfirm: () => setCustomDialog(prev => ({ ...prev, isOpen: false })),
    });
  };

  // 📤 EXPORT: Export custom workouts or study blocks to actual Google Calendar
  const handleExportToGoogleCalendar = (evt: CalendarEvent) => {
    if (!googleAccessToken) return;
    
    setCustomDialog({
      isOpen: true,
      title: "Export Calendar Event",
      message: `Would you like to sync "${evt.title}" straight to your main Google Calendar account (${googleEmail || "Active Account"})? This will post the scheduled block to your calendar.`,
      confirmText: "📤 Export Event",
      cancelText: "Cancel",
      onConfirm: () => proceedSingleExport(evt),
    });
  };

  const proceedSingleExport = async (evt: CalendarEvent) => {
    setCustomDialog(prev => ({ ...prev, isOpen: false }));
    setExportStatus(prev => ({ ...prev, [evt.id]: "syncing" }));
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "https://ai-studio.google";
      const doneLink = `${appUrl}?action=complete_event&eventId=${evt.id}`;
      const editGoalLink = evt.goalId ? `${appUrl}?action=edit_goal&goalId=${evt.goalId}` : "";
      const addGoalLink = `${appUrl}?action=add_goal`;

      let desc = evt.notes || "Scheduled conflict-free using smart AI routine engine.";
      desc += "\n\n──────────────────────────────";
      desc += "\n🎯 QUICK WORKSPACE ACTIONS:";
      desc += `\n✅ Click to Mark This Hour Done:\n   ${doneLink}`;
      if (editGoalLink) {
        desc += `\n\n✏️ Click to Edit Associated Goal:\n   ${editGoalLink}`;
      }
      desc += `\n\n➕ Click to Register a New Goal:\n   ${addGoalLink}`;
      desc += "\n──────────────────────────────";

      const postBody = {
        summary: `${evt.type === "workout" ? "🏋️" : "📚"} ${evt.title}`,
        description: desc,
        start: { dateTime: evt.start },
        end: { dateTime: evt.end }
      };

      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(postBody)
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleDisconnectGoogle();
          throw new Error("Invalid or expired OAuth Access Token. Your session has been safely reset; please click 'Connect Google Calendar' again to re-authenticate.");
        }
        throw new Error(`Google POST request failed with status: ${res.status}`);
      }

      setExportStatus(prev => ({ ...prev, [evt.id]: "success" }));
      setTimeout(() => {
        setExportStatus(prev => {
          const next = { ...prev };
          delete next[evt.id];
          return next;
        });
      }, 5000);
    } catch (err: any) {
      console.error("Failed to export slot to Google: ", err);
      setExportStatus(prev => ({ ...prev, [evt.id]: "error" }));
      showCustomAlert("Export Failed", `Failed to export "${evt.title}": ${err.message || err}`);
    }
  };

  // Bulk Export all unexported workouts & study events
  const handleBulkExportUnexported = () => {
    let unexported = events.filter(e => e.type !== "external" && exportStatus[e.id] !== "success" && exportStatus[e.id] !== "syncing");
    
    if (unexported.length === 0) {
      const totalCustomCount = events.filter(e => e.type !== "external").length;
      if (totalCustomCount === 0) {
        showCustomAlert(
          "No Sessions Scheduled",
          "You don't have any scheduled sessions (workouts, study blocks, etc.) on your calendar to export yet!\n\nPro-Tips to get started:\n1. Click the 'Goal Tracker' tab.\n2. Add some active goals (e.g. Learning React) if you haven't yet.\n3. Click 'Run Smart Auto-Scheduler' to automatically generate a conflict-free routine.\n4. Or, double-click empty timeslots in this Calendar to add them manually.\n5. Once you have events, click this button to sync them with your real Google Calendar!"
        );
        return;
      } else {
        setCustomDialog({
          isOpen: true,
          title: "All Sessions Synced",
          message: "All of your active routines are already successfully synced and exported to Google Calendar!\n\nWould you like to re-export all of them anyway?",
          confirmText: "Re-export All",
          cancelText: "Cancel",
          onConfirm: () => {
            const allCustom = events.filter(e => e.type !== "external" && exportStatus[e.id] !== "syncing");
            triggerBulkExportExecution(allCustom);
          }
        });
        return;
      }
    }

    setCustomDialog({
      isOpen: true,
      title: "Bulk Export Routine",
      message: `Export Routine? Let's write ${unexported.length} scheduled workout and study hours to your main Google Calendar.`,
      confirmText: "📤 Export Routine",
      cancelText: "Cancel",
      onConfirm: () => triggerBulkExportExecution(unexported),
    });
  };

  const triggerBulkExportExecution = async (unexported: CalendarEvent[]) => {
    setCustomDialog(prev => ({ ...prev, isOpen: false }));
    setExportingAll(true);
    setGcalStatus(`Exporting ${unexported.length} scheduled slots to Google Calendar...`);
    
    let successCount = 0;
    let failCount = 0;

    for (const evt of unexported) {
      setExportStatus(prev => ({ ...prev, [evt.id]: "syncing" }));
      try {
        const appUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "https://ai-studio.google";
        const doneLink = `${appUrl}?action=complete_event&eventId=${evt.id}`;
        const editGoalLink = evt.goalId ? `${appUrl}?action=edit_goal&goalId=${evt.goalId}` : "";
        const addGoalLink = `${appUrl}?action=add_goal`;

        let desc = evt.notes || "Auto-programmed with conflict-free AI scheduler.";
        desc += "\n\n──────────────────────────────";
        desc += "\n🎯 QUICK WORKSPACE ACTIONS:";
        desc += `\n✅ Click to Mark This Hour Done:\n   ${doneLink}`;
        if (editGoalLink) {
          desc += `\n\n✏️ Click to Edit Associated Goal:\n   ${editGoalLink}`;
        }
        desc += `\n\n➕ Click to Register a New Goal:\n   ${addGoalLink}`;
        desc += "\n──────────────────────────────";

        const postBody = {
          summary: `${evt.type === "workout" ? "🏋️" : "📚"} ${evt.title}`,
          description: desc,
          start: { dateTime: evt.start },
          end: { dateTime: evt.end }
        };

        const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(postBody)
        });

        if (res.ok) {
          successCount++;
          setExportStatus(prev => ({ ...prev, [evt.id]: "success" }));
        } else {
          const errMsg = await res.text();
          console.error(`Google Event POST failed for [${evt.title}]: `, errMsg);
          if (res.status === 401) {
            handleDisconnectGoogle();
            setGcalStatus("Your Google Calendar connection has expired. Your session has been safely reset — please click 'Connect Google Calendar' again.");
            showCustomAlert(
              "Authentication Expired",
              "Your Google Calendar session has expired or is invalid. Your session has been safely reset; please click 'Connect Google Calendar' again to renew access."
            );
            failCount += unexported.length - successCount;
            break;
          }
          failCount++;
          setExportStatus(prev => ({ ...prev, [evt.id]: "error" }));
        }
      } catch (err) {
        console.error(`Google Event POST failed for [${evt.title}] with network error: `, err);
        failCount++;
        setExportStatus(prev => ({ ...prev, [evt.id]: "error" }));
      }
    }

    setExportingAll(false);
    if (failCount > 0) {
      setGcalStatus(`Export processed with some errors. Connected but failed to write ${failCount} slots properly. Successfully wrote ${successCount} slots into your real Google Calendar.`);
    } else {
      setGcalStatus(`Export Finished! Successfully wrote ${successCount} slots into your real Google Calendar.`);
    }
  };

  const prevEventIdsRef = useRef<Set<string>>(new Set(events.map(e => e.id)));

  useEffect(() => {
    if (!googleAccessToken || !autoGcalExport) {
      prevEventIdsRef.current = new Set(events.map(e => e.id));
      return;
    }

    const currentIds = new Set(events.map(e => e.id));
    const newEvents = events.filter(e => e.type !== "external" && !prevEventIdsRef.current.has(e.id) && exportStatus[e.id] !== "success" && exportStatus[e.id] !== "syncing");

    if (newEvents.length > 0) {
      console.log("Auto-exporting new calendar events background: ", newEvents);
      triggerBulkExportExecution(newEvents);
    }

    prevEventIdsRef.current = currentIds;
  }, [events, googleAccessToken, autoGcalExport]);

  // Helper: Get start of current week (starts from current/selected date to show 7 days rolling)
  const getStartOfWeek = (date: Date) => {
    return new Date(date);
  };

  const startOfWeek = getStartOfWeek(currentDate);

  // Helper: Get range dates of current week
  const getWeekDates = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const weekDates = getWeekDates();

  // Navigation handlers
  const handlePrev = () => {
    const nextDate = new Date(currentDate);
    if (viewMode === "week") {
      nextDate.setDate(currentDate.getDate() - 7);
    } else {
      nextDate.setDate(currentDate.getDate() - 1);
    }
    setCurrentDate(nextDate);
  };

  const handleNext = () => {
    const nextDate = new Date(currentDate);
    if (viewMode === "week") {
      nextDate.setDate(currentDate.getDate() + 7);
    } else {
      nextDate.setDate(currentDate.getDate() + 1);
    }
    setCurrentDate(nextDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Submit new manual event or edit current
  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const startISO = `${newDay}T${newStartTime}:00`;
    const endISO = `${newDay}T${newEndTime}:00`;

    if (editingEventId) {
      if (onEditEvent) {
        onEditEvent(editingEventId, {
          title: newTitle,
          type: newType,
          start: new Date(startISO).toISOString(),
          end: new Date(endISO).toISOString(),
          completed: newCompleted,
          notes: newNotes,
          goalId: newGoalId || undefined
        });
      }
    } else {
      onAddEvent({
        title: newTitle,
        type: newType,
        start: new Date(startISO).toISOString(),
        end: new Date(endISO).toISOString(),
        completed: newCompleted,
        notes: newNotes,
        goalId: newGoalId || undefined
      });
    }

    // Reset Form
    setNewTitle("");
    setNewNotes("");
    setNewGoalId("");
    setNewCompleted(false);
    setEditingEventId(null);
    setShowAddModal(false);
  };

  // Prepopulate modal form with existing event fields for editing
  const handleTriggerEditEvent = (evt: CalendarEvent) => {
    const sDate = new Date(evt.start);
    const eDate = new Date(evt.end);
    
    // Format to YYYY-MM-DD
    const y = sDate.getFullYear();
    const m = String(sDate.getMonth() + 1).padStart(2, "0");
    const d = String(sDate.getDate()).padStart(2, "0");
    const formattedDay = `${y}-${m}-${d}`;

    const formattedStart = `${String(sDate.getHours()).padStart(2, "0")}:${String(sDate.getMinutes()).padStart(2, "0")}`;
    const formattedEnd = `${String(eDate.getHours()).padStart(2, "0")}:${String(eDate.getMinutes()).padStart(2, "0")}`;

    setEditingEventId(evt.id);
    setNewTitle(evt.title);
    setNewType(evt.type);
    setNewDay(formattedDay);
    setNewStartTime(formattedStart);
    setNewEndTime(formattedEnd);
    setNewNotes(evt.notes || "");
    setNewGoalId(evt.goalId || "");
    setNewCompleted(evt.completed || false);
    setShowAddModal(true);
  };

  // Open helper with clean defaults for adding a goal
  const handleOpenAddGoal = () => {
    setEditingGoalId(null);
    setGoalName("");
    setGoalType(GoalType.WORKOUT);
    setGoalCategory("");
    setGoalWeeklyTarget(3);
    setGoalDuration(60);
    setGoalTimePref(TimePreference.ANY);
    setGoalColor("#f43f5e");
    setShowGoalForm(true);
  };

  // Open helper preloaded to edit an existing goal
  const handleOpenEditGoal = (g: Goal) => {
    setEditingGoalId(g.id);
    setGoalName(g.name);
    setGoalType(g.type);
    setGoalCategory(g.category);
    setGoalWeeklyTarget(g.weeklyTarget);
    setGoalDuration(g.durationMinutes);
    setGoalTimePref(g.timePreference);
    setGoalColor(g.color);
    setShowGoalForm(true);
  };

  // Submit Goal action: Creates or saves edited attributes
  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim()) return;

    const trimmedCategory = goalCategory.trim() || (goalType === GoalType.WORKOUT ? "Fitness" : "Study");

    if (editingGoalId) {
      if (onEditGoal) {
        onEditGoal(editingGoalId, {
          name: goalName.trim(),
          type: goalType,
          category: trimmedCategory,
          weeklyTarget: Number(goalWeeklyTarget),
          durationMinutes: Number(goalDuration),
          timePreference: goalTimePref,
          color: goalColor
        });
      }
    } else {
      if (onAddGoal) {
        onAddGoal({
          name: goalName.trim(),
          type: goalType,
          category: trimmedCategory,
          weeklyTarget: Number(goalWeeklyTarget),
          durationMinutes: Number(goalDuration),
          timePreference: goalTimePref,
          color: goalColor
        });
      }
    }

    // Reset Form
    setShowGoalForm(false);
    setEditingGoalId(null);
    setGoalName("");
  };

  // Quick action: makes the goal done or toggles completion states directly!
  const handleToggleCompleteGoalDirect = (g: Goal) => {
    if (!onEditGoal) return;
    const isCompleted = g.completedCount >= g.weeklyTarget;
    // Highlight done or toggle around
    const newCount = isCompleted ? 0 : g.weeklyTarget;
    onEditGoal(g.id, { completedCount: newCount });
  };

  // Simulate Calendar file import (or preset feeds)
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = externalName.trim() || "Work Existing Calendar";
    
    // Simulate importing real ICS file or standard entries
    const sampleICS = `
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      SUMMARY:${name} Sync Block
      DTSTART:${new Date().toISOString().slice(0,10).replace(/-/g,'')}T090000Z
      DTEND:${new Date().toISOString().slice(0,10).replace(/-/g,'')}T110000Z
      END:VEVENT
      END:VCALENDAR
    `;
    onImportCalendar(name, sampleICS);
    setExternalName("");
    setExternalSource("");
    setIcsInput("");
    setShowSyncPanel(false);
  };

  // Preset quick import feeds
  const handleSelectPresetImport = (presetName: string, type: string) => {
    const sampleICS = `Simulated preset import for ${presetName}`;
    onImportCalendar(`${presetName} (${type})`, sampleICS);
    setShowSyncPanel(false);
  };

  // Hours array for Grid: 08:00 to 22:00
  const hours = Array.from({ length: 15 }, (_, i) => i + 8);

  // Filter events for the rendered dates
  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  // Format month and year label
  const getHeaderLabel = () => {
    if (viewMode === "day") {
      return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
      return startOfWeek.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    return `${startOfWeek.toLocaleDateString("en-US", { month: "short" })} - ${endOfWeek.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
  };

  return (
    <div id="calendar_section_card" className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[750px] text-white">
      
      {/* Calendar Header toolbar */}
      <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-white/5">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-indigo-400" id="header_cal_icon" />
          <h2 id="calendar_title_header" className="font-sans font-semibold text-white text-lg tracking-tight">Schedule</h2>
          <span className="text-xs bg-white/10 text-slate-200 px-2.5 py-0.5 rounded-full font-medium" id="total_schedule_count">
            {events.length} Events Total
          </span>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 p-1 rounded-xl shadow-xs">
          <button 
            id="nav_prev_btn"
            onClick={handlePrev} 
            className="p-1 px-1.5 rounded-lg hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
            title="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            id="nav_today_btn"
            onClick={handleToday} 
            className="text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-white/10 text-white transition cursor-pointer"
          >
            Today
          </button>
          <button 
            id="nav_next_btn"
            onClick={handleNext} 
            className="p-1 px-1.5 rounded-lg hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
            title="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div id="calendar_label_header" className="text-sm font-semibold text-slate-200 min-w-[200px] text-center font-display">
          {getHeaderLabel()}
        </div>

        {/* View Mode Dropdowns and Event Addition triggers */}
        <div className="flex items-center gap-2">
          <div className="bg-white/5 border border-white/5 p-0.5 rounded-lg flex items-center">
            {(["week", "day", "list"] as const).map((mode) => (
              <button
                key={mode}
                id={`view_btn_${mode}`}
                onClick={() => setViewMode(mode)}
                className={`text-xs px-3 py-1.5 rounded-md font-semibold capitalize transition cursor-pointer ${
                  viewMode === mode 
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            id="open_sync_sidebar_btn"
            onClick={() => setShowSyncPanel(!showSyncPanel)}
            className="p-2 border border-white/10 bg-white/5 text-slate-300 hover:text-indigo-400 hover:bg-white/10 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold px-3"
            title="External Calendar Feeds"
          >
            <Link2 className="w-4 h-4" />
            <span>Connect & Sync</span>
          </button>

          <button
            id="open_add_event_modal_btn"
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 md:px-4 md:py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Add Event</span>
          </button>
        </div>
      </div>

      {/* Sync/External Calendar configuration Drawer overlay */}
      {showSyncPanel && (
        <div id="sync_calendar_drawer" className="bg-white/5 border-b border-white/10 p-4 transition-all">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
              <h3 className="font-sans font-semibold text-white text-sm mb-1.5 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-emerald-400" />
                Sync Existing Calendar (.ICS or Web URL)
              </h3>
              <form onSubmit={handleImportSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Calendar Source Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. My Google Work Calendar"
                    value={externalName}
                    onChange={(e) => setExternalName(e.target.value)}
                    className="w-full text-xs p-2 bg-white/5 text-white border border-white/10 rounded-lg focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">ICS Feed URL / Raw Text Data</label>
                  <textarea
                    rows={2}
                    placeholder="Paste calendar public URL, or raw .ics template blocks..."
                    value={icsInput}
                    onChange={(e) => setIcsInput(e.target.value)}
                    className="w-full text-xs p-2 bg-white/5 text-white border border-white/10 rounded-lg focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-white/10 hover:bg-white/15 text-white border border-white/10 text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer"
                >
                  Import and Sync Availability
                </button>
              </form>
            </div>

            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h3 className="font-sans font-semibold text-white text-sm mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  Google Calendar Live Sync
                </h3>

                {gcalStatus && (
                  <p className="text-[11px] text-pink-400 bg-pink-500/10 border border-pink-500/20 px-2.5 py-1.5 rounded-lg mb-3">
                    {gcalStatus}
                  </p>
                )}

                {!googleAccessToken ? (
                  <div className="space-y-3.5 pt-1">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Connect your Google Calendar live to import conflicts (so the smart auto-scheduler avoids overlaps) and export scheduled routines!
                    </p>
                    
                    <button
                      type="button"
                      id="gcal_connect_oauth_btn"
                      onClick={handleLaunchGoogleOAuth}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-lg border border-white/5 shadow-indigo-600/15 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Globe className="w-4 h-4" /> Connect Automatically
                    </button>

                    <div className="text-center">
                      <button
                        type="button"
                        id="toggle_manual_token_form_btn"
                        onClick={() => setShowTokenInput(!showTokenInput)}
                        className="text-[10.5px] text-slate-400 hover:text-white font-medium underline transition"
                      >
                        {showTokenInput ? "Hide Developer Auth" : "Advanced: Developer Token Connection"}
                      </button>
                    </div>

                    {showTokenInput && (
                      <form onSubmit={handleManualTokenSubmit} className="bg-slate-900/40 p-3 rounded-lg border border-white/5 mt-2 space-y-2">
                        <p className="text-[10px] text-slate-400 leading-normal">
                          For instant, reliable iframe connection, you can copy an ACCESS TOKEN from the <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-indigo-400 underline hover:text-indigo-300">Google OAuth Playground</a> (Calendar API v3), then paste it here:
                        </p>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            required
                            placeholder="ya29.a0Acv..."
                            value={manualTokenVal}
                            onChange={(e) => setManualTokenVal(e.target.value)}
                            className="bg-white/5 text-[11px] p-2 rounded border border-white/10 text-white flex-1 focus:outline-none focus:border-indigo-400"
                          />
                          <button
                            type="submit"
                            className="bg-indigo-600 text-white text-[11.5px] px-3 py-1.5 rounded font-bold hover:bg-indigo-500 cursor-pointer"
                          >
                            Set Token
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Connected Account</p>
                        <p className="text-xs font-mono text-slate-200 mt-0.5 max-w-[200px] truncate" title={googleEmail}>
                          {googleEmail || "Active OAuth User"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDisconnectGoogle}
                        className="text-[10px] bg-white/5 hover:bg-red-500/10 text-slate-300 hover:text-red-400 border border-white/10 p-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                        title="Disconnect"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Disconnect
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-left select-none">
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300 font-bold">
                        <input
                          type="checkbox"
                          checked={autoGcalExport}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setAutoGcalExport(next);
                            localStorage.setItem("auto_gcal_export", next ? "true" : "false");
                            if (next) {
                              setGcalStatus("Real-time auto-sync activated! New schedules will auto-sync.");
                            } else {
                              setGcalStatus("Real-time auto-sync deactivated.");
                            }
                          }}
                          className="rounded border-white/20 bg-slate-900 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>⚡ Real-time Google Calendar Sync</span>
                      </label>
                      <span className="text-[9px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold">AUTO</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center">
                      <button
                        type="button"
                        id="gcal_import_btn"
                        disabled={importingGcal}
                        onClick={handleImportGoogleCalendar}
                        className="bg-white/5 hover:bg-white/10 text-slate-100 text-xs font-bold py-2.5 px-3 border border-white/10 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {importingGcal ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                        ) : (
                          <Download className="w-4 h-4 text-indigo-400" />
                        )}
                        <span>{importingGcal ? "Importing..." : "📥 Import Busy Blocks"}</span>
                      </button>

                      <button
                        type="button"
                        id="gcal_bulk_export_btn"
                        disabled={exportingAll}
                        onClick={handleBulkExportUnexported}
                        className={`text-xs font-bold py-2.5 px-3 border rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          unexportedCount > 0
                            ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 font-extrabold"
                            : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
                        }`}
                      >
                        {exportingAll ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                        ) : (
                          <Send className={`w-4 h-4 ${unexportedCount > 0 ? "text-emerald-300 animate-pulse" : "text-pink-400"}`} />
                        )}
                        <span>{exportingAll ? "Exporting..." : `📤 Export Routines (${unexportedCount})`}</span>
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-normal italic text-center">
                      * Imported Google events act as busy exclusions in auto-scheduling. Exporting pushes workouts & study blocks to your Google app.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Calendar Render Stage */}
      <div className="flex-1 overflow-y-auto" id="calendar_grid_wrapper">
        
        {/* VIEW 1: WEEKLY VIEW GRID */}
        {viewMode === "week" && (
          <div className="min-w-[800px] flex flex-col h-full">
            {/* Days row header */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-white/10 sticky top-0 bg-[#0d0e16]/95 backdrop-blur-md z-10 shadow-lg">
              <div className="p-3 text-center text-xs font-bold text-slate-400 border-r border-white/10 self-center">Time (UTC)</div>
              {weekDates.map((day, dIdx) => {
                const todayFlag = isSameDay(day, new Date());
                return (
                  <div 
                    key={dIdx} 
                    className={`p-3 text-center border-r border-white/10 ${
                      todayFlag ? "bg-indigo-500/10 text-indigo-400" : "text-slate-300"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider">
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className={`text-sm mt-0.5 font-bold rounded-lg inline-block w-7 h-7 leading-7 ${
                      todayFlag ? "bg-indigo-600 text-white text-center shadow-lg shadow-indigo-500/25" : ""
                    }`}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hourly schedule rows */}
            <div className="relative flex-1 bg-transparent">
              {hours.map((hour) => (
                <div key={hour} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-white/5 h-16 min-h-16">
                  {/* Hour Label */}
                  <div className="p-1 px-2 text-right text-[10px] font-mono text-slate-400 border-r border-white/10 bg-transparent select-none whitespace-nowrap self-center">
                    {hour === 12 ? "12:00 PM" : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
                  </div>

                  {/* Day Cells background */}
                  {Array.from({ length: 7 }).map((_, dIdx) => (
                    <div 
                      key={dIdx} 
                      className="border-r border-white/5 hover:bg-white/5 relative group"
                    >
                      {/* Empty cell hover creation help */}
                      <button 
                        onClick={() => {
                          const dateObj = weekDates[dIdx];
                          setNewDay(dateObj.toISOString().split("T")[0]);
                          setNewStartTime(`${String(hour).padStart(2, "0")}:00`);
                          setNewEndTime(`${String(hour + 1).padStart(2, "0")}:00`);
                          setShowAddModal(true);
                        }}
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-indigo-500/10 flex items-center justify-center transition-opacity cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-indigo-400" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {/* Absolute Positioned Events on parameters */}
              {events.map((evt) => {
                const evtStart = new Date(evt.start);
                const evtEnd = new Date(evt.end);
                
                // Find day of week relative to startOfWeek (0-6)
                const dayDiff = weekDates.findIndex(d => isSameDay(d, evtStart));
                if (dayDiff === -1) return null; // not this week

                const startHour = evtStart.getHours() + evtStart.getMinutes() / 60;
                const endHour = evtEnd.getHours() + evtEnd.getMinutes() / 60;
                
                // Scale values
                const hourHeight = 64; // pixels per hour
                const minOffsetHour = 8; // we start at 08:00
                const topPixel = (startHour - minOffsetHour) * hourHeight;
                const heightPixel = Math.max((endHour - startHour) * hourHeight, 82); // minimum height to ensure Mark Done fits beautifully

                const colors = getEventColorStyles(evt);

                return (
                  <div
                    key={evt.id}
                    id={`event_card_week_${evt.id}`}
                    onClick={() => handleTriggerEditEvent(evt)}
                    onMouseEnter={() => setHoveredEventId(evt.id)}
                    onMouseLeave={() => setHoveredEventId(null)}
                    className="absolute p-2 border-l-4 rounded-lg shadow-md hover:shadow-lg text-left transition-all overflow-hidden cursor-pointer"
                    style={{
                      left: `calc(80px + (${dayDiff} * (100% - 80px) / 7) + 2px)`,
                      width: `calc(((100% - 80px) / 7) - 4px)`,
                      top: `${topPixel}px`,
                      height: hoveredEventId === evt.id ? `${Math.max(heightPixel, 98)}px` : `${heightPixel}px`,
                      zIndex: hoveredEventId === evt.id ? 50 : 5,
                      borderLeftColor: colors.borderLeftColor,
                      backgroundColor: hoveredEventId === evt.id ? colors.hoverBg : colors.backgroundColor,
                      color: colors.color,
                      overflow: hoveredEventId === evt.id ? "visible" : "hidden"
                    }}
                  >
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h4 className={`text-[11px] font-bold leading-tight flex items-center gap-1.5 ${evt.completed ? "line-through text-slate-400 opacity-60" : ""}`}>
                            {getEventIcon(evt)}
                            <span className="truncate">{evt.title}</span>
                          </h4>
                        </div>
                        <p className="text-[9px] opacity-80 flex items-center gap-0.5 font-mono mt-0.5 select-none">
                          <Clock className="w-2.5 h-2.5" />
                          {evtStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-1 mt-1 gap-1">
                        <button
                          id={`complete_event_btn_week_${evt.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCompleteEvent(evt.id);
                          }}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 transition cursor-pointer ${
                            evt.completed 
                              ? "bg-emerald-600 text-white" 
                              : "bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 font-bold" />
                          {evt.completed ? "Done" : "Mark Done"}
                        </button>
                        
                        {googleAccessToken && evt.type !== "external" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportToGoogleCalendar(evt);
                            }}
                            disabled={exportStatus[evt.id] === "syncing" || exportStatus[evt.id] === "success"}
                            className={`p-1 rounded transition cursor-pointer ${
                              exportStatus[evt.id] === "success"
                                ? "text-emerald-400"
                                : exportStatus[evt.id] === "error"
                                ? "text-red-400"
                                : exportStatus[evt.id] === "syncing"
                                ? "text-indigo-400 animate-spin"
                                : "text-slate-400 hover:text-indigo-400"
                            }`}
                            title={
                              exportStatus[evt.id] === "success"
                                ? "Synced to Google!"
                                : "Export to Google Calendar"
                            }
                          >
                            {exportStatus[evt.id] === "success" ? (
                              <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                            ) : (
                              <CalendarCheck className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        <button
                          id={`delete_event_btn_week_${evt.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEvent(evt.id);
                          }}
                          className="opacity-50 hover:opacity-100 text-slate-300 hover:text-red-400 p-0.5 transition cursor-pointer"
                          title="Delete Event"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: DAILY VIEW GRID */}
        {viewMode === "day" && (
          <div className="flex flex-col h-full bg-transparent">
            <div className="border-b border-white/10 p-4 sticky top-0 bg-[#0c0d16]/95 backdrop-blur-md z-10 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
              <p className="text-xs text-slate-300 font-medium font-sans">Viewing single day schedule.</p>
            </div>
            
            <div className="relative flex-1 bg-transparent">
              {hours.map((hour) => {
                const hourEvents = events.filter(evt => {
                  const s = new Date(evt.start);
                  return isSameDay(s, currentDate) && s.getHours() === hour;
                });

                return (
                  <div key={hour} className="grid grid-cols-[100px_1fr] border-b border-white/5 h-24 min-h-24">
                    <div className="p-3 text-right text-xs font-mono text-slate-400 border-r border-white/10 bg-transparent select-none">
                      {hour === 12 ? "12:00 PM" : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
                    </div>
                    
                    <div className="p-2 flex flex-wrap gap-2 items-center bg-transparent relative group">
                      {hourEvents.length === 0 ? (
                        <button
                          onClick={() => {
                            setNewDay(currentDate.toISOString().split("T")[0]);
                            setNewStartTime(`${String(hour).padStart(2, "0")}:00`);
                            setNewEndTime(`${String(hour + 1).padStart(2, "0")}:00`);
                            setShowAddModal(true);
                          }}
                          className="text-[10px] text-slate-400 group-hover:text-indigo-400 font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all absolute inset-0 pl-4 justify-start cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Block hour
                        </button>
                      ) : (
                        hourEvents.map(evt => {
                          const colors = getEventColorStyles(evt);
                          return (
                            <div 
                              key={evt.id} 
                              id={`event_card_day_${evt.id}`}
                              onClick={() => handleTriggerEditEvent(evt)}
                              onMouseEnter={() => setHoveredEventId(evt.id)}
                              onMouseLeave={() => setHoveredEventId(null)}
                              className="p-3 rounded-xl shadow-md max-w-sm flex-1 cursor-pointer transition hover:scale-[1.01] border-l-4"
                              style={{
                                borderLeftColor: colors.borderLeftColor,
                                backgroundColor: hoveredEventId === evt.id ? colors.hoverBg : colors.backgroundColor,
                                color: colors.color
                              }}
                            >
                              <div className="flex justify-between items-start mb-1.5 gap-2">
                                <h4 className={`text-xs font-bold flex items-center gap-1.5 ${evt.completed ? "line-through opacity-50" : ""}`}>
                                  {getEventIcon(evt)}
                                  <span>{evt.title}</span>
                                </h4>
                                <span className="text-[9px] font-mono opacity-80">
                                  {new Date(evt.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              {evt.notes && <p className="text-[10px] opacity-75 mb-2 italic">"{evt.notes}"</p>}
                              <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/5 gap-1">
                                <button
                                  id={`complete_event_btn_day_${evt.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleCompleteEvent(evt.id);
                                  }}
                                  className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                                    evt.completed 
                                      ? "bg-emerald-600 text-white" 
                                      : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
                                  }`}
                                >
                                  {evt.completed ? "Done" : "Mark Done"}
                                </button>

                                {googleAccessToken && evt.type !== "external" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExportToGoogleCalendar(evt);
                                    }}
                                    disabled={exportStatus[evt.id] === "syncing" || exportStatus[evt.id] === "success"}
                                    className={`p-1.5 rounded transition cursor-pointer ${
                                      exportStatus[evt.id] === "success"
                                        ? "text-emerald-400"
                                        : exportStatus[evt.id] === "error"
                                        ? "text-red-400"
                                        : exportStatus[evt.id] === "syncing"
                                        ? "text-indigo-400 animate-spin"
                                        : "text-slate-400 hover:text-indigo-400"
                                    }`}
                                    title={
                                      exportStatus[evt.id] === "success"
                                        ? "Synced to Google!"
                                        : "Export to Google Calendar"
                                    }
                                  >
                                    {exportStatus[evt.id] === "success" ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                                    ) : (
                                      <CalendarCheck className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}

                                <button 
                                  id={`delete_event_btn_day_${evt.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteEvent(evt.id);
                                  }}
                                  className="text-red-400 opacity-70 hover:opacity-100 transition p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: SIMPLIFIED LIST VIEW */}
        {viewMode === "list" && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-semibold text-white text-sm">All Upcoming Blocks</h3>
              <p className="text-xs text-slate-400 font-medium font-sans">Sorted by chronological priority.</p>
            </div>

            {events.length === 0 ? (
              <div className="text-center p-8 border-2 border-dashed border-white/10 bg-white/5 rounded-2xl">
                <CalendarIcon className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No events scheduled. Use automatic smart schedule solver!</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[...events]
                  .sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                  .map(evt => {
                    const s = new Date(evt.start);
                    return (
                      <div 
                        key={evt.id} 
                        id={`event_card_list_${evt.id}`}
                        onClick={() => handleTriggerEditEvent(evt)}
                        className={`p-3 border border-white/10 rounded-xl flex items-center justify-between gap-3 bg-white/5 hover:bg-white/10 transition cursor-pointer ${
                          evt.completed ? "bg-white/[0.02] opacity-60" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span 
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: getEventColorStyles(evt).dotColor }}
                          />
                          <div>
                            <h4 className={`text-xs font-bold text-white flex items-center gap-1.5 ${evt.completed ? "line-through opacity-75" : ""}`}>
                              {getEventIcon(evt)}
                              <span>{evt.title}</span>
                            </h4>
                            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <span className="font-semibold text-slate-300">{s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                              <span>•</span>
                              <span>{s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              {evt.notes && <span className="italic">("{evt.notes}")</span>}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            id={`complete_event_btn_list_${evt.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleCompleteEvent(evt.id);
                            }}
                            className={`text-[10px] p-2 px-3 leading-none rounded-lg font-bold cursor-pointer transition ${
                              evt.completed 
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" 
                                : "bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20"
                            }`}
                          >
                            {evt.completed ? "Completed!" : "Complete"}
                          </button>

                          {googleAccessToken && evt.type !== "external" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportToGoogleCalendar(evt);
                              }}
                              disabled={exportStatus[evt.id] === "syncing" || exportStatus[evt.id] === "success"}
                              className={`p-2 border rounded-lg transition border-white/10 cursor-pointer ${
                                exportStatus[evt.id] === "success"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : exportStatus[evt.id] === "error"
                                  ? "bg-red-500/10 text-red-400"
                                  : exportStatus[evt.id] === "syncing"
                                  ? "bg-indigo-600/10 text-indigo-400 animate-spin"
                                  : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-indigo-400 focus:text-indigo-400"
                              }`}
                              title={
                                exportStatus[evt.id] === "success"
                                  ? "Synced to Google!"
                                  : "Export to Google Calendar"
                              }
                            >
                              {exportStatus[evt.id] === "success" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                              ) : (
                                <CalendarCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          <button
                            id={`delete_event_btn_list_${evt.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteEvent(evt.id);
                            }}
                            className="bg-white/5 hover:bg-rose-500/20 text-slate-455 hover:text-rose-455 p-2 rounded-lg transition border border-white/5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL WINDOW: Create manual schedule events */}
      {showAddModal && (
        <div id="add_event_modal_backdrop" className="fixed inset-0 bg-[#020205]/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div id="add_event_modal_card" className="bg-[#0f111a] border border-white/12 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <h3 className="font-sans font-semibold text-white text-base mb-4 flex items-center gap-1.5">
              <CalendarIcon className="w-5 h-5 text-indigo-400" />
              {editingEventId ? "Edit Scheduled Slot" : "Manually Schedule Slot"}
            </h3>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  id="event_title_input"
                  placeholder="e.g. Legs Cardio or React Tutorial"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type Focus</label>
                  <select
                    id="event_type_select"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as CalendarEvent["type"])}
                    className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 transition"
                  >
                    <option value="workout" className="bg-[#0f111a]">Workout Session</option>
                    <option value="study" className="bg-[#0f111a]">Study Block</option>
                    <option value="job_search" className="bg-[#0f111a]">Job Search Session</option>
                    <option value="side_project" className="bg-[#0f111a]">Side Project Session</option>
                    <option value="routine" className="bg-[#0f111a]">Routine / Chores</option>
                    <option value="personal" className="bg-[#0f111a]">Personal / Leisure</option>
                    <option value="external" className="bg-[#0f111a]">Busy Block (External)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Associate Goal</label>
                  <select
                    id="event_goal_select"
                    value={newGoalId}
                    onChange={(e) => setNewGoalId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 transition"
                  >
                    <option value="" className="bg-[#0f111a]">None / Standalone</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id} className="bg-[#0f111a]">
                        {g.name} ({g.weeklyTarget}x/wk)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date</label>
                <input
                  type="date"
                  required
                  id="event_date_input"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    id="event_start_time_input"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    id="event_end_time_input"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes / Instructions</label>
                <textarea
                  id="event_notes_textarea"
                  placeholder="e.g. focus on Javascript array methods..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition placeholder:text-slate-500"
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="event_completed_checkbox"
                  checked={newCompleted}
                  onChange={(e) => setNewCompleted(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-white/5 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 transition cursor-pointer"
                />
                <label htmlFor="event_completed_checkbox" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Mark this slot as completed
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  id="close_add_event_modal_btn"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingEventId(null);
                    setNewTitle("");
                    setNewNotes("");
                    setNewGoalId("");
                    setNewCompleted(false);
                  }}
                  className="text-xs font-semibold px-4 py-2.5 border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit_add_event_btn"
                  className="text-xs font-semibold px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/25 cursor-pointer transition"
                >
                  {editingEventId ? "Save Changes" : "Confirm Slot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM DIALOG MODAL (Saves from cross-origin iframe window.confirm blockages) */}
      {customDialog.isOpen && (
        <div id="custom_dialog_backdrop" className="fixed inset-0 bg-[#020205]/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div id="custom_dialog_card" className="bg-[#111322] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
            <div className="flex items-center gap-2.5 mb-3 text-indigo-400">
              <span className="p-2 bg-indigo-500/10 rounded-xl">
                <CalendarCheck className="w-5 h-5 text-indigo-400" />
              </span>
              <h3 className="font-sans font-extrabold text-white text-base">
                {customDialog.title}
              </h3>
            </div>
            
            <div className="text-xs text-slate-300 leading-relaxed font-sans mb-5 whitespace-pre-wrap">
              {customDialog.message}
            </div>
            
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/5">
              {!customDialog.isAlertOnly && (
                <button
                  type="button"
                  id="custom_dialog_cancel_btn"
                  onClick={() => setCustomDialog(prev => ({ ...prev, isOpen: false }))}
                  className="text-xs font-semibold px-4 py-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition cursor-pointer"
                >
                  {customDialog.cancelText || "Cancel"}
                </button>
              )}
              <button
                type="button"
                id="custom_dialog_confirm_btn"
                onClick={customDialog.onConfirm}
                className="text-xs font-bold px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/25 cursor-pointer transition flex items-center gap-1.5"
              >
                {customDialog.confirmText || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
