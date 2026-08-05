import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Smile,
  Play
} from "lucide-react";
import { CalendarEvent, Goal, GoalType, TimePreference, AvailabilityWindow } from "../types";
import { GoalIconPicker, renderGoalIcon } from "../lib/goalIcons";
import FocusTimerModal from "./FocusTimerModal";

const DEFAULT_AVAILABILITY: AvailabilityWindow[] = [
  { dayOfWeek: 0, startTime: "09:00", endTime: "21:00", active: true },
  { dayOfWeek: 1, startTime: "08:00", endTime: "22:00", active: true },
  { dayOfWeek: 2, startTime: "08:00", endTime: "22:00", active: true },
  { dayOfWeek: 3, startTime: "08:00", endTime: "22:00", active: true },
  { dayOfWeek: 4, startTime: "08:00", endTime: "22:00", active: true },
  { dayOfWeek: 5, startTime: "08:00", endTime: "18:00", active: true },
  { dayOfWeek: 6, startTime: "09:00", endTime: "19:00", active: true }
];

interface CalendarViewProps {
  events: CalendarEvent[];
  goals: Goal[];
  availability?: AvailabilityWindow[];
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
  availability,
  onAddEvent,
  onToggleCompleteEvent,
  onDeleteEvent,
  onImportCalendar,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  onEditEvent
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<"week" | "day" | "list">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return "list";
    }
    return "week";
  });
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Mobile & List View Search/Filter State
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [listCategoryFilter, setListCategoryFilter] = useState<"all" | "workout" | "study" | "personal" | "pending" | "completed">("all");
  
  // Goals Sidebar Form/Mode States
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalName, setGoalName] = useState("");
  const [goalType, setGoalType] = useState<GoalType>(GoalType.WORKOUT);
  const [goalCategory, setGoalCategory] = useState("");
  const [goalWeeklyTarget, setGoalWeeklyTarget] = useState(3);
  const [goalDuration, setGoalDuration] = useState(60);
  const [isCustomGoalDuration, setIsCustomGoalDuration] = useState(false);
  const [customGoalDurationVal, setCustomGoalDurationVal] = useState("25");
  const [goalTimePref, setGoalTimePref] = useState<TimePreference>(TimePreference.ANY);
  const [goalCustomStart, setGoalCustomStart] = useState("14:00");
  const [goalCustomEnd, setGoalCustomEnd] = useState("16:00");
  const [goalColor, setGoalColor] = useState("#f43f5e");
  const [goalIcon, setGoalIcon] = useState("target");
  
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

  // Focus Timer Modal state
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerTitle, setTimerTitle] = useState("Focus Session");
  const [timerDuration, setTimerDuration] = useState(60);
  const [timerEventId, setTimerEventId] = useState<string | undefined>();
  const [timerGoalId, setTimerGoalId] = useState<string | undefined>();
  const [timerCategory, setTimerCategory] = useState<string | undefined>();
  const [timerColor, setTimerColor] = useState<string>("#6366f1");

  const handleOpenTimerForEvent = (evt: CalendarEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const startMs = new Date(evt.start).getTime();
    const endMs = new Date(evt.end).getTime();
    const durationMins = Math.max(5, Math.round((endMs - startMs) / (1000 * 60)));
    
    const associatedGoal = goals.find(g => g.id === evt.goalId);
    
    setTimerTitle(evt.title);
    setTimerDuration(durationMins);
    setTimerEventId(evt.id);
    setTimerGoalId(evt.goalId);
    setTimerCategory(associatedGoal?.category || evt.type);
    setTimerColor(associatedGoal?.color || (evt.type === "study" ? "#3b82f6" : evt.type === "workout" ? "#f43f5e" : "#10b981"));
    setTimerOpen(true);
  };

  const handleOpenTimerForGoal = (goal: Goal, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTimerTitle(goal.name);
    setTimerDuration(goal.durationMinutes || 60);
    setTimerEventId(undefined);
    setTimerGoalId(goal.id);
    setTimerCategory(goal.category || goal.type);
    setTimerColor(goal.color || "#6366f1");
    setTimerOpen(true);
  };

  const handleCompleteTimerSession = (eventId?: string, goalId?: string, note?: string) => {
    if (eventId) {
      if (onEditEvent && note) {
        onEditEvent(eventId, { completed: true, completionNote: note });
      } else {
        onToggleCompleteEvent(eventId);
      }
    }
    if (goalId && onEditGoal) {
      const g = goals.find(item => item.id === goalId);
      if (g) {
        onEditGoal(g.id, {
          completedCount: eventId ? g.completedCount : g.completedCount + 1,
          ...(note ? { lastSessionNote: note, lastSessionNoteDate: new Date().toISOString() } : {})
        });
      }
    }
  };

  // External Calendar Sync State
  const [externalSource, setExternalSource] = useState("");
  const [externalName, setExternalName] = useState("");
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showDelayTodayMenu, setShowDelayTodayMenu] = useState(false);
  const [activeShiftMenuId, setActiveShiftMenuId] = useState<string | null>(null);
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

  // Live Current Time state for Google Calendar-style current time indicator line
  const [now, setNow] = useState<Date>(new Date());

  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // Drag & Drop and Rescheduling States
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ dayIdx?: number; hour: number } | null>(null);
  const [rebalanceStatus, setRebalanceStatus] = useState<string | null>(null);

  const missedSessionsCount = events.filter(evt => !evt.completed && evt.type !== "external" && new Date(evt.end) < now).length;

  const handleDragStart = (e: React.DragEvent, eventId: string) => {
    e.stopPropagation();
    setDraggedEventId(eventId);
    e.dataTransfer.setData("text/plain", eventId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, hour: number, dayIdx?: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCell?.hour !== hour || dragOverCell?.dayIdx !== dayIdx) {
      setDragOverCell({ hour, dayIdx });
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCell(null);
  };

  const handleDropEvent = (e: React.DragEvent, targetHour: number, targetDayIdx?: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const eventId = draggedEventId || e.dataTransfer.getData("text/plain");
    if (!eventId || !onEditEvent) return;

    const targetEvt = events.find(evt => evt.id === eventId);
    if (!targetEvt) return;

    const startObj = new Date(targetEvt.start);
    const endObj = new Date(targetEvt.end);
    const durationMs = endObj.getTime() - startObj.getTime();

    let newStart: Date;

    if (targetDayIdx !== undefined && viewMode === "week") {
      const targetDate = weekDates[targetDayIdx];
      newStart = new Date(targetDate);
      newStart.setHours(targetHour, startObj.getMinutes(), 0, 0);
    } else if (viewMode === "day") {
      newStart = new Date(currentDate);
      newStart.setHours(targetHour, startObj.getMinutes(), 0, 0);
    } else {
      return;
    }

    const newEnd = new Date(newStart.getTime() + durationMs);

    onEditEvent(eventId, {
      start: newStart.toISOString(),
      end: newEnd.toISOString()
    });

    setDraggedEventId(null);
  };

  const handleAdjustDuration = (e: React.MouseEvent, evt: CalendarEvent, deltaMinutes: number) => {
    e.stopPropagation();
    if (!onEditEvent) return;

    const currentStart = new Date(evt.start);
    const currentEnd = new Date(evt.end);
    const newEndMs = Math.max(currentStart.getTime() + 15 * 60 * 1000, currentEnd.getTime() + deltaMinutes * 60 * 1000);
    
    onEditEvent(evt.id, {
      end: new Date(newEndMs).toISOString()
    });
  };

  const handleSmartRebalance = () => {
    if (!onEditEvent) return;

    const currentTime = new Date();
    // Find uncompleted past sessions
    const missedEvents = events.filter(evt => {
      if (evt.completed || evt.type === "external") return false;
      return new Date(evt.end) < currentTime;
    });

    if (missedEvents.length === 0) {
      setRebalanceStatus("✨ All scheduled sessions are up to date! No missed blocks to re-balance.");
      setTimeout(() => setRebalanceStatus(null), 4000);
      return;
    }

    let updatedCount = 0;
    const currentEventsList = [...events];

    missedEvents.forEach(evt => {
      const originalStart = new Date(evt.start);
      const originalEnd = new Date(evt.end);
      const durationMs = originalEnd.getTime() - originalStart.getTime();

      let foundSlot = false;

      // Search across next 7 days
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        if (foundSlot) break;

        const searchDay = new Date(currentTime);
        searchDay.setDate(currentTime.getDate() + dayOffset);

        const startHour = dayOffset === 0 ? Math.max(8, currentTime.getHours() + 1) : 8;
        const endHour = 22;

        for (let hrs = startHour; hrs <= endHour - (durationMs / (3600 * 1000)); hrs += 0.5) {
          const slotStart = new Date(searchDay);
          slotStart.setHours(Math.floor(hrs), (hrs % 1) * 60, 0, 0);

          if (slotStart <= currentTime) continue;

          const slotEnd = new Date(slotStart.getTime() + durationMs);

          const hasOverlap = currentEventsList.some(other => {
            if (other.id === evt.id) return false;
            const oStart = new Date(other.start);
            const oEnd = new Date(other.end);
            return slotStart < oEnd && slotEnd > oStart;
          });

          if (!hasOverlap) {
            onEditEvent(evt.id, {
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              notes: `${evt.notes || ''} (Auto Re-balanced)`.trim()
            });

            const idx = currentEventsList.findIndex(e => e.id === evt.id);
            if (idx !== -1) {
              currentEventsList[idx] = {
                ...currentEventsList[idx],
                start: slotStart.toISOString(),
                end: slotEnd.toISOString()
              };
            }

            updatedCount++;
            foundSlot = true;
            break;
          }
        }
      }
    });

    if (updatedCount > 0) {
      setRebalanceStatus(`⚡ Successfully re-balanced ${updatedCount} missed session(s) into upcoming conflict-free slots!`);
    } else {
      setRebalanceStatus("⚠️ Could not find open slots for all missed sessions. Try adjusting availability or clearing busy times.");
    }

    setTimeout(() => setRebalanceStatus(null), 5000);
  };

  // Cascading Ripple Delay helper: Shifts a target event AND ripples all subsequent uncompleted events forward
  const handleCascadingDelayEvent = (targetEvt: CalendarEvent, delayMs: number, delayLabel: string) => {
    if (targetEvt.type === "external") {
      showCustomAlert("External Event", "External Google Calendar events cannot be shifted from here.");
      return;
    }

    const targetStart = new Date(targetEvt.start).getTime();
    const targetEnd = new Date(targetEvt.end).getTime();
    const duration = targetEnd - targetStart;

    const newTargetStart = targetStart + delayMs;
    const newTargetEnd = newTargetStart + duration;

    // Shift target event
    onEditEvent(targetEvt.id, {
      start: new Date(newTargetStart).toISOString(),
      end: new Date(newTargetEnd).toISOString(),
      notes: `${targetEvt.notes || ''} (Delayed +${delayLabel})`.trim()
    });

    // Find subsequent uncompleted non-external events starting at or after target's original start
    const subsequent = events.filter(e => {
      if (e.id === targetEvt.id || e.completed || e.type === "external") return false;
      const s = new Date(e.start).getTime();
      return s >= targetStart;
    }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    let rippleCount = 0;
    let currentOccupiedEnd = newTargetEnd;

    subsequent.forEach(subEvt => {
      const subStart = new Date(subEvt.start).getTime();
      const subEnd = new Date(subEvt.end).getTime();
      const subDur = subEnd - subStart;

      // If subEvt collides with or starts before the new occupied end, push it forward
      if (subStart < currentOccupiedEnd) {
        const newSubStart = currentOccupiedEnd + 15 * 60 * 1000; // 15 mins buffer
        const newSubEnd = newSubStart + subDur;

        onEditEvent(subEvt.id, {
          start: new Date(newSubStart).toISOString(),
          end: new Date(newSubEnd).toISOString(),
          notes: `${subEvt.notes || ''} (Cascading Ripple Shift)`.trim()
        });

        currentOccupiedEnd = newSubEnd;
        rippleCount++;
      } else {
        currentOccupiedEnd = Math.max(currentOccupiedEnd, subEnd);
      }
    });

    const msg = rippleCount > 0 
      ? `⚡ Shifted "${targetEvt.title}" (+${delayLabel}) & rippled ${rippleCount} downstream session(s) forward!`
      : `⚡ Shifted "${targetEvt.title}" forward by +${delayLabel}!`;
    
    setRebalanceStatus(msg);
    setTimeout(() => setRebalanceStatus(null), 5000);
  };

  // Delay all remaining sessions today by X minutes
  const handleDelayRemainingToday = (delayMinutes: number) => {
    const delayMs = delayMinutes * 60 * 1000;
    const nowTime = now.getTime();
    
    // Find today's uncompleted events that end after or around now
    const todayUncompleted = events.filter(e => {
      if (e.completed || e.type === "external") return false;
      const s = new Date(e.start);
      return isSameDay(s, now) && new Date(e.end).getTime() >= nowTime - 30 * 60 * 1000;
    }).sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    if (todayUncompleted.length === 0) {
      showCustomAlert("No Upcoming Sessions Today", "You have no remaining uncompleted sessions scheduled for today to delay.");
      return;
    }

    let count = 0;
    todayUncompleted.forEach(evt => {
      const s = new Date(evt.start).getTime();
      const e = new Date(evt.end).getTime();
      const dur = e - s;

      const newS = new Date(s + delayMs).toISOString();
      const newE = new Date(s + delayMs + dur).toISOString();

      onEditEvent(evt.id, {
        start: newS,
        end: newE,
        notes: `${evt.notes || ''} (Shifted +${delayMinutes}m)`.trim()
      });
      count++;
    });

    setRebalanceStatus(`⚡ Shifted ${count} remaining session(s) today forward by +${delayMinutes} minutes!`);
    setTimeout(() => setRebalanceStatus(null), 5000);
  };

  const gridScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToCurrentTimeLine = (smooth: boolean = true) => {
    if (!gridScrollRef.current) return;

    const scrollContainer = gridScrollRef.current;
    const currentHourDecimal = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const containerHeight = scrollContainer.clientHeight || 500;

    if (viewMode === "week") {
      // 64px per hour (8 AM start)
      const targetTopPixel = (currentHourDecimal - 8) * 64;
      const scrollToPixel = Math.max(0, targetTopPixel - containerHeight / 2);
      scrollContainer.scrollTo({
        top: scrollToPixel,
        behavior: smooth ? "smooth" : "auto"
      });
    } else if (viewMode === "day") {
      // 96px per hour (8 AM start)
      const targetTopPixel = (currentHourDecimal - 8) * 96;
      const scrollToPixel = Math.max(0, targetTopPixel - containerHeight / 2);
      scrollContainer.scrollTo({
        top: scrollToPixel,
        behavior: smooth ? "smooth" : "auto"
      });
    } else if (viewMode === "list") {
      const marker = scrollContainer.querySelector("#current_time_list_marker") as HTMLElement;
      if (marker) {
        const scrollToPixel = Math.max(0, marker.offsetTop - containerHeight / 2);
        scrollContainer.scrollTo({
          top: scrollToPixel,
          behavior: smooth ? "smooth" : "auto"
        });
      }
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll the Schedule Grid directly to where the current time horizontal line is located
  useEffect(() => {
    scrollToCurrentTimeLine(false);

    const t1 = setTimeout(() => scrollToCurrentTimeLine(false), 50);
    const t2 = setTimeout(() => scrollToCurrentTimeLine(true), 250);
    const t3 = setTimeout(() => scrollToCurrentTimeLine(true), 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [viewMode, currentDate]);

  // Resolve custom goal color if event is associated with a goal
  const getEventColorStyles = (evt: CalendarEvent) => {
    const goal = goals.find(g => g.id === evt.goalId);
    const baseColor = goal?.color;

    if (baseColor) {
      return {
        borderLeftColor: baseColor,
        backgroundColor: "#161828", // 100% solid dark navy base
        color: "#f8fafc",
        hoverBg: "#20253f", // 100% solid elevated dark navy base
        dotColor: baseColor,
        isCustom: true
      };
    }

    // Default Fallbacks based on category/type (All 100% solid opaque dark backgrounds)
    const fallbackColors: Record<string, { border: string; bg: string; text: string; hoverBg: string; dot: string }> = {
      workout: { border: "#f43f5e", bg: "#1f141a", text: "#fecdd3", hoverBg: "#2d1825", dot: "#f43f5e" },
      study: { border: "#06b6d4", bg: "#111d27", text: "#cffafe", hoverBg: "#172a39", dot: "#06b6d4" },
      job_search: { border: "#3b82f6", bg: "#121b2d", text: "#bfdbfe", hoverBg: "#192745", dot: "#3b82f6" },
      side_project: { border: "#ec4899", bg: "#211324", text: "#fbcfe8", hoverBg: "#311837", dot: "#ec4899" },
      routine: { border: "#10b981", bg: "#11201d", text: "#a7f3d0", hoverBg: "#182e29", dot: "#10b981" },
      personal: { border: "#f59e0b", bg: "#221c13", text: "#fde68a", hoverBg: "#332817", dot: "#f59e0b" },
      external: { border: "#64748b", bg: "#161922", text: "#cbd5e1", hoverBg: "#202533", dot: "#64748b" }
    };

    const current = fallbackColors[evt.type] || { border: "#6366f1", bg: "#16192c", text: "#e0e7ff", hoverBg: "#212643", dot: "#6366f1" };

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
    const iconId = evt.icon || goal?.icon;
    const type = goal ? goal.type : evt.type;
    const colors = getEventColorStyles(evt);
    
    return renderGoalIcon(iconId, type, "w-3.5 h-3.5 shrink-0", { color: colors.borderLeftColor });
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
    setTimeout(() => {
      scrollToCurrentTimeLine();
    }, 50);
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
    setIsCustomGoalDuration(false);
    setCustomGoalDurationVal("25");
    setGoalTimePref(TimePreference.ANY);
    setGoalCustomStart("14:00");
    setGoalCustomEnd("16:00");
    setGoalColor("#f43f5e");
    setGoalIcon("target");
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
    const standardDurations = [15, 30, 45, 60, 90, 120, 180];
    if (!standardDurations.includes(g.durationMinutes)) {
      setIsCustomGoalDuration(true);
      setCustomGoalDurationVal(String(g.durationMinutes));
    } else {
      setIsCustomGoalDuration(false);
      setCustomGoalDurationVal("25");
    }
    setGoalTimePref(g.timePreference);
    setGoalCustomStart(g.customTimeStart || "14:00");
    setGoalCustomEnd(g.customTimeEnd || "16:00");
    setGoalColor(g.color);
    setGoalIcon(g.icon || "target");
    setShowGoalForm(true);
  };

  // Submit Goal action: Creates or saves edited attributes
  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim()) return;

    const trimmedCategory = goalCategory.trim() || (goalType === GoalType.WORKOUT ? "Fitness" : "Study");
    const customStartVal = goalTimePref === TimePreference.CUSTOM ? goalCustomStart : undefined;
    const customEndVal = goalTimePref === TimePreference.CUSTOM ? goalCustomEnd : undefined;

    if (editingGoalId) {
      if (onEditGoal) {
        onEditGoal(editingGoalId, {
          name: goalName.trim(),
          type: goalType,
          category: trimmedCategory,
          weeklyTarget: Number(goalWeeklyTarget),
          durationMinutes: Number(goalDuration),
          timePreference: goalTimePref,
          customTimeStart: customStartVal,
          customTimeEnd: customEndVal,
          color: goalColor,
          icon: goalIcon
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
          customTimeStart: customStartVal,
          customTimeEnd: customEndVal,
          color: goalColor,
          icon: goalIcon
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

  // Helper to check if two dates are the same day
  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  // Hours array for Grid: 08:00 to 22:00
  const hours = Array.from({ length: 15 }, (_, i) => i + 8);

  const currentHourDecimal = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const currentTopPixelWeek = (currentHourDecimal - 8) * 64;
  const currentTopPixelDay = (currentHourDecimal - 8) * 96;
  const todayIdx = weekDates.findIndex(d => isSameDay(d, now));

  // Calculate overlapping layout columns for weekly view events
  const weekLayoutMap = useMemo(() => {
    const map = new Map<string, { colIndex: number; totalCols: number; dayDiff: number }>();

    weekDates.forEach((dayDate, dIdx) => {
      const dayEvts = events.filter((evt) => {
        const s = new Date(evt.start);
        return isSameDay(dayDate, s);
      });

      if (dayEvts.length === 0) return;

      const getGoalPriorityScore = (evt: CalendarEvent) => {
        const g = goals.find((item) => item.id === evt.goalId);
        const p = g?.priority || "normal";
        return p === "critical" ? 3 : p === "important" ? 2 : 1;
      };

      const sorted = [...dayEvts].sort((a, b) => {
        const aStart = new Date(a.start).getTime();
        const bStart = new Date(b.start).getTime();
        if (aStart !== bStart) return aStart - bStart;
        const pA = getGoalPriorityScore(a);
        const pB = getGoalPriorityScore(b);
        if (pA !== pB) return pB - pA;
        return new Date(b.end).getTime() - new Date(a.end).getTime();
      });

      const clusters: CalendarEvent[][] = [];
      let currentCluster: CalendarEvent[] = [];
      let clusterEnd = 0;

      sorted.forEach((evt) => {
        const start = new Date(evt.start).getTime();
        const end = new Date(evt.end).getTime();

        if (currentCluster.length === 0) {
          currentCluster.push(evt);
          clusterEnd = end;
        } else if (start < clusterEnd) {
          currentCluster.push(evt);
          if (end > clusterEnd) clusterEnd = end;
        } else {
          clusters.push(currentCluster);
          currentCluster = [evt];
          clusterEnd = end;
        }
      });
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }

      clusters.forEach((cluster) => {
        const columnsEndTimes: number[] = [];

        cluster.forEach((evt) => {
          const start = new Date(evt.start).getTime();
          const end = new Date(evt.end).getTime();

          let placed = false;
          for (let i = 0; i < columnsEndTimes.length; i++) {
            if (columnsEndTimes[i] <= start) {
              columnsEndTimes[i] = end;
              map.set(evt.id, { colIndex: i, totalCols: 1, dayDiff: dIdx });
              placed = true;
              break;
            }
          }
          if (!placed) {
            columnsEndTimes.push(end);
            map.set(evt.id, { colIndex: columnsEndTimes.length - 1, totalCols: 1, dayDiff: dIdx });
          }
        });

        const maxCols = columnsEndTimes.length;
        cluster.forEach((evt) => {
          const existing = map.get(evt.id)!;
          map.set(evt.id, { ...existing, totalCols: maxCols });
        });
      });
    });

    return map;
  }, [events, weekDates]);

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
    <div id="calendar_section_card" className="bg-white/95 dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[600px] h-auto md:h-[750px] text-slate-900 dark:text-white">
      
      {/* Calendar Header toolbar */}
      <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100/70 dark:bg-white/5">
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" id="header_cal_icon" />
            <h2 id="calendar_title_header" className="font-sans font-extrabold text-slate-950 dark:text-white text-base sm:text-lg tracking-tight">Schedule</h2>
            <span className="text-[11px] sm:text-xs bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200 px-2.5 py-0.5 rounded-full font-extrabold" id="total_schedule_count">
              {events.length} {events.length === 1 ? "Event" : "Events"}
            </span>
          </div>

          {/* View Mode Toggle for Mobile & Desktop */}
          <div className="bg-slate-200/80 dark:bg-white/10 border border-slate-300 dark:border-white/10 p-1 rounded-xl flex items-center shadow-inner">
            {(["week", "day", "list"] as const).map((mode) => (
              <button
                key={mode}
                id={`view_btn_${mode}`}
                onClick={() => setViewMode(mode)}
                className={`text-xs px-2.5 sm:px-3 py-1.5 rounded-lg font-bold capitalize transition cursor-pointer min-h-[36px] min-w-[48px] flex items-center justify-center ${
                  viewMode === mode 
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-extrabold" 
                    : "text-slate-800 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-300/50 dark:hover:bg-white/5"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation & Actions Row */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-white/5">
          {/* Date Navigation */}
          <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-white/5 border border-slate-300 dark:border-white/10 p-1 rounded-xl shadow-xs">
            <button 
              id="nav_prev_btn"
              onClick={handlePrev} 
              className="p-1.5 rounded-lg hover:bg-slate-300/60 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              id="nav_today_btn"
              onClick={handleToday} 
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-slate-300/60 dark:hover:bg-white/10 text-slate-900 dark:text-white transition cursor-pointer min-h-[36px] flex items-center"
            >
              Today
            </button>
            <button 
              id="nav_focus_now_btn"
              type="button"
              onClick={() => {
                setCurrentDate(new Date());
                setNow(new Date());
                setTimeout(() => scrollToCurrentTimeLine(true), 50);
              }} 
              className="text-xs font-extrabold px-2.5 py-1.5 rounded-lg bg-red-100 dark:bg-red-500/20 text-red-900 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-500/30 border border-red-300 dark:border-red-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 min-h-[36px]"
              title="Focus current time line in calendar"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
              </span>
              <span>Focus</span>
            </button>
            <button 
              id="nav_next_btn"
              onClick={handleNext} 
              className="p-1.5 rounded-lg hover:bg-slate-300/60 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div id="calendar_label_header" className="text-sm sm:text-base font-extrabold text-slate-950 dark:text-white text-center font-display shrink-0 px-2">
            {getHeaderLabel()}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
            <button
              id="open_sync_sidebar_btn"
              onClick={() => setShowSyncPanel(!showSyncPanel)}
              className="p-2 border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold px-2.5 min-h-[36px]"
              title="External Calendar Feeds"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect</span>
            </button>

            <button
              id="auto_rebalance_btn"
              onClick={handleSmartRebalance}
              className={`p-2 border rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold px-2.5 min-h-[36px] ${
                missedSessionsCount > 0
                  ? "bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-500/30 shadow-md shadow-amber-500/10 animate-pulse font-bold"
                  : "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 border-slate-300 dark:border-white/10"
              }`}
              title="Shift missed sessions to upcoming free time slots automatically"
            >
              <RotateCw className={`w-3.5 h-3.5 ${missedSessionsCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400"}`} />
              <span className="hidden sm:inline">Re-balance</span>
              {missedSessionsCount > 0 && (
                <span className="bg-amber-500 text-black text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {missedSessionsCount}
                </span>
              )}
            </button>

            {/* Delay Today Quick Trigger */}
            <div className="relative">
              <button
                id="delay_today_btn"
                type="button"
                onClick={() => setShowDelayTodayMenu(!showDelayTodayMenu)}
                className="p-2 border border-amber-300 dark:border-amber-500/30 bg-amber-100 dark:bg-amber-500/15 hover:bg-amber-200 dark:hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-bold px-2.5 min-h-[36px]"
                title="Shift today's remaining uncompleted sessions forward if running late"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">Delay Today</span>
              </button>
              {showDelayTodayMenu && (
                <div 
                  className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#121320] border border-slate-200 dark:border-white/20 rounded-xl shadow-2xl p-2 z-50 text-left animate-fade-in space-y-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-2 py-1">Shift Remaining Sessions:</p>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelayRemainingToday(30);
                      setShowDelayTodayMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-xs text-slate-900 dark:text-white font-medium flex items-center justify-between cursor-pointer"
                  >
                    <span>+30 Minutes</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">⏩</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelayRemainingToday(60);
                      setShowDelayTodayMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-xs text-slate-900 dark:text-white font-medium flex items-center justify-between cursor-pointer"
                  >
                    <span>+1 Hour</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">⏩</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelayRemainingToday(120);
                      setShowDelayTodayMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-xs text-slate-900 dark:text-white font-medium flex items-center justify-between cursor-pointer"
                  >
                    <span>+2 Hours</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">⏩</span>
                  </button>
                  <div className="border-t border-slate-200 dark:border-white/10 my-1"></div>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelayRemainingToday(24 * 60);
                      setShowDelayTodayMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded text-xs text-amber-900 dark:text-amber-200 font-bold flex items-center justify-between cursor-pointer"
                  >
                    <span>+1 Day</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">📅</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelayRemainingToday(2 * 24 * 60);
                      setShowDelayTodayMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded text-xs text-amber-900 dark:text-amber-200 font-bold flex items-center justify-between cursor-pointer"
                  >
                    <span>+2 Days</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">📅</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelayRemainingToday(7 * 24 * 60);
                      setShowDelayTodayMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded text-xs text-amber-900 dark:text-amber-200 font-bold flex items-center justify-between cursor-pointer"
                  >
                    <span>+1 Week</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">🗓️</span>
                  </button>
                </div>
              )}
            </div>

            <button
              id="open_add_goal_modal_btn"
              onClick={handleOpenAddGoal}
              className="bg-emerald-100 dark:bg-emerald-600/20 hover:bg-emerald-200 dark:hover:bg-emerald-600/30 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-all min-h-[36px]"
              title="Create a new routine goal"
            >
              <Target className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>+ Goal</span>
            </button>

            <button
              id="open_add_event_modal_btn"
              onClick={() => setShowAddModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-indigo-600/20 cursor-pointer transition-all min-h-[36px]"
            >
              <Plus className="w-4 h-4" />
              <span>+ Event</span>
            </button>
          </div>
        </div>
      </div>

      {rebalanceStatus && (
        <div className="bg-indigo-600/20 border-b border-indigo-500/30 px-4 py-2.5 flex items-center justify-between text-xs text-indigo-200 animate-fade-in font-medium">
          <div className="flex items-center gap-2">
            <RotateCw className="w-4 h-4 text-indigo-400 animate-spin" />
            <span>{rebalanceStatus}</span>
          </div>
          <button 
            onClick={() => setRebalanceStatus(null)}
            className="text-slate-400 hover:text-white transition cursor-pointer p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sync/External Calendar configuration Modal Overlay */}
      {showSyncPanel && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all animate-fade-in"
          onClick={() => setShowSyncPanel(false)}
        >
          <div 
            id="sync_calendar_modal"
            className="bg-[#121320] border border-white/15 rounded-2xl p-5 md:p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Calendar Sync & Integrations</h3>
                  <p className="text-xs text-slate-400">Connect Google Calendar or import external .ICS schedules</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncPanel(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Close Sync Panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <h3 className="font-sans font-semibold text-white text-sm mb-2 flex items-center gap-1.5">
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
                        className="w-full text-xs p-2.5 bg-white/5 text-white border border-white/10 rounded-lg focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">ICS Feed URL / Raw Text Data</label>
                      <textarea
                        rows={3}
                        placeholder="Paste calendar public URL, or raw .ics template blocks..."
                        value={icsInput}
                        onChange={(e) => setIcsInput(e.target.value)}
                        className="w-full text-xs p-2.5 bg-white/5 text-white border border-white/10 rounded-lg focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/10 text-[11px] font-bold py-2.5 rounded-lg transition cursor-pointer"
                    >
                      Import and Sync Availability
                    </button>
                  </form>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <h3 className="font-sans font-semibold text-white text-sm mb-2 flex items-center gap-1.5">
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
        </div>
      )}

      {/* Main Calendar Render Stage */}
      <div className="flex-1 overflow-y-auto" id="calendar_grid_wrapper" ref={gridScrollRef}>
        
        {/* VIEW 1: WEEKLY VIEW GRID */}
        {viewMode === "week" && (
          <div className="min-w-[800px] flex flex-col h-full">
            {/* Days row header */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-slate-200 dark:border-white/10 sticky top-0 bg-slate-100/95 dark:bg-[#0d0e16]/95 backdrop-blur-md z-10 shadow-xs">
              <div className="p-3 text-center text-xs font-bold text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-white/10 self-center">Time (UTC)</div>
              {weekDates.map((day, dIdx) => {
                const todayFlag = isSameDay(day, new Date());
                return (
                  <div 
                    key={dIdx} 
                    className={`p-3 text-center border-r border-slate-200 dark:border-white/10 ${
                      todayFlag ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className={`text-sm mt-0.5 font-extrabold rounded-lg inline-block w-7 h-7 leading-7 ${
                      todayFlag ? "bg-indigo-600 text-white text-center shadow-lg shadow-indigo-500/25 font-black" : "text-slate-900 dark:text-slate-200"
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
                  {Array.from({ length: 7 }).map((_, dIdx) => {
                    const isCellOver = dragOverCell?.hour === hour && dragOverCell?.dayIdx === dIdx;
                    return (
                      <div 
                        key={dIdx} 
                        onDragOver={(e) => handleDragOver(e, hour, dIdx)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropEvent(e, hour, dIdx)}
                        className={`border-r border-white/5 relative group transition-colors ${
                          isCellOver ? "bg-indigo-500/25 border-2 border-indigo-400 shadow-inner" : "hover:bg-white/5"
                        }`}
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
                    );
                  })}
                </div>
              ))}

              {/* Google Calendar Current Time Horizontal Line */}
              {todayIdx !== -1 && currentTopPixelWeek >= 0 && currentTopPixelWeek <= hours.length * 64 && (
                <div
                  id="current_time_week_line"
                  className="absolute z-30 pointer-events-none flex items-center left-[80px] right-0"
                  style={{ top: `${currentTopPixelWeek}px` }}
                  title={`Current Time: ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                >
                  {/* Glowing Time Badge on the left of red line */}
                  <div className="absolute -left-1 font-mono text-[9px] font-extrabold bg-red-600 text-white px-1.5 py-0.5 rounded-full shadow-lg shadow-red-500/80 z-50 -translate-x-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                    <span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>

                  {/* Red Circle Indicator centered on today's column vertical grid border */}
                  <div
                    className="absolute w-3.5 h-3.5 bg-red-500 rounded-full shadow-lg shadow-red-500/80 z-40 -translate-x-1/2 flex items-center justify-center transition-all duration-300"
                    style={{ left: `calc(${todayIdx} * (100% / 7))` }}
                  >
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                  {/* Red horizontal line across grid */}
                  <div className="h-[2px] bg-red-500 w-full shadow-md shadow-red-500/70"></div>
                </div>
              )}

              {/* Absolute Positioned Events on parameters */}
              {events.map((evt) => {
                const layoutInfo = weekLayoutMap.get(evt.id);
                if (!layoutInfo) return null; // not on this week grid

                const { colIndex, totalCols, dayDiff } = layoutInfo;
                const evtStart = new Date(evt.start);
                const evtEnd = new Date(evt.end);

                const startHour = evtStart.getHours() + evtStart.getMinutes() / 60;
                const endHour = evtEnd.getHours() + evtEnd.getMinutes() / 60;

                const hourHeight = 64; // pixels per hour
                const minOffsetHour = 8; // we start at 08:00
                const topPixel = (startHour - minOffsetHour) * hourHeight;
                const durationHours = Math.max(endHour - startHour, 0.25);
                const rawHeightPixel = durationHours * hourHeight;
                const heightPixel = Math.max(rawHeightPixel, 28); // clean min height

                const colors = getEventColorStyles(evt);
                const isHovered = hoveredEventId === evt.id;
                const isAnyHovered = hoveredEventId !== null;

                // Sub-column left and width calculation
                const subLeft = `calc(80px + (${dayDiff} * (100% - 80px) / 7) + (${colIndex} * ((100% - 80px) / 7) / ${totalCols}) + 1px)`;
                const subWidth = `calc((((100% - 80px) / 7) / ${totalCols}) - 2px)`;

                return (
                  <div
                    key={evt.id}
                    id={`event_card_week_${evt.id}`}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, evt.id)}
                    onClick={() => handleTriggerEditEvent(evt)}
                    onMouseEnter={() => setHoveredEventId(evt.id)}
                    onMouseLeave={() => setHoveredEventId(null)}
                    className={`absolute p-1.5 border-l-4 rounded-lg text-left transition-all cursor-grab active:cursor-grabbing select-none ${
                      draggedEventId === evt.id ? "opacity-40 ring-2 ring-indigo-400 scale-95" : ""
                    } ${
                      isHovered
                        ? "shadow-2xl ring-2 ring-indigo-400 z-[100] opacity-100 scale-[1.02]"
                        : isAnyHovered
                        ? "opacity-35 z-10 shadow-sm"
                        : "opacity-100 z-10 shadow-sm hover:z-20"
                    }`}
                    style={{
                      left: isHovered && totalCols > 1 ? `calc(80px + (${dayDiff} * (100% - 80px) / 7) + 1px)` : subLeft,
                      width: isHovered && totalCols > 1 ? `calc(((100% - 80px) / 7) - 2px)` : subWidth,
                      top: `${topPixel}px`,
                      height: isHovered ? `${Math.max(heightPixel, 115)}px` : `${heightPixel}px`,
                      borderLeftColor: colors.borderLeftColor,
                      backgroundColor: isHovered ? colors.hoverBg : colors.backgroundColor,
                      color: colors.color,
                      overflow: isHovered ? "visible" : "hidden"
                    }}
                  >
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <h4 className={`text-[10px] font-bold leading-tight flex items-center gap-1 min-w-0 ${evt.completed ? "line-through opacity-60" : ""}`}>
                            {getEventIcon(evt)}
                            <span className="truncate">{evt.title}</span>
                          </h4>
                          {totalCols > 2 && !isHovered && (
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.borderLeftColor }} />
                          )}
                        </div>
                        <p 
                          onClick={(e) => handleOpenTimerForEvent(evt, e)}
                          className="text-[8.5px] opacity-80 hover:opacity-100 text-indigo-300 flex items-center gap-0.5 font-mono mt-0.5 truncate cursor-pointer hover:underline"
                          title="Click to start Focus Timer for this session"
                        >
                          <Clock className="w-2.5 h-2.5 shrink-0 text-indigo-400" />
                          <span>{evtStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          <Play className="w-2 h-2 ml-0.5 fill-current text-emerald-400 shrink-0" />
                        </p>
                      </div>

                      {/* Hover Quick Resize Controls */}
                      {isHovered && (
                        <div className="flex items-center gap-1 my-1 py-0.5 border-t border-b border-white/10 text-[8.5px]" onClick={(e) => e.stopPropagation()}>
                          <span className="text-slate-400 font-mono">Length:</span>
                          <button
                            type="button"
                            onClick={(e) => handleAdjustDuration(e, evt, -15)}
                            className="bg-white/10 hover:bg-white/20 text-white px-1.5 py-0.5 rounded font-bold transition cursor-pointer"
                            title="Shorten by 15 min"
                          >
                            -15m
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleAdjustDuration(e, evt, 30)}
                            className="bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 px-1.5 py-0.5 rounded font-bold transition cursor-pointer"
                            title="Extend by 30 min"
                          >
                            +30m
                          </button>
                        </div>
                      )}

                      {/* Action buttons footer */}
                      {(isHovered || heightPixel >= 52) && (
                        <div className="flex items-center justify-between border-t border-white/10 pt-1 mt-0.5 gap-1">
                          <button
                            id={`timer_event_btn_week_${evt.id}`}
                            onClick={(e) => handleOpenTimerForEvent(evt, e)}
                            className="text-[8.5px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/30 transition cursor-pointer shrink-0"
                            title="Start Focus Timer"
                          >
                            <Play className="w-2 h-2 fill-current text-emerald-400" />
                            <span>Timer</span>
                          </button>

                          <button
                            id={`complete_event_btn_week_${evt.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleCompleteEvent(evt.id);
                            }}
                            className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 transition cursor-pointer shrink-0 ${
                              evt.completed 
                                ? "bg-emerald-600 text-white" 
                                : "bg-white/10 hover:bg-white/20 border border-white/10 text-white"
                            }`}
                          >
                            <Check className="w-2.5 h-2.5 font-bold" />
                            <span>{evt.completed ? "Done" : "Mark"}</span>
                          </button>
                          
                          {googleAccessToken && evt.type !== "external" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportToGoogleCalendar(evt);
                              }}
                              disabled={exportStatus[evt.id] === "syncing" || exportStatus[evt.id] === "success"}
                              className={`p-0.5 rounded transition cursor-pointer ${
                                exportStatus[evt.id] === "success"
                                  ? "text-emerald-400"
                                  : exportStatus[evt.id] === "error"
                                  ? "text-red-400"
                                  : exportStatus[evt.id] === "syncing"
                                  ? "text-indigo-400 animate-spin"
                                  : "text-slate-400 hover:text-indigo-400"
                              }`}
                              title="Export to Google"
                            >
                              {exportStatus[evt.id] === "success" ? (
                                <CheckCircle2 className="w-3 h-3 animate-pulse" />
                              ) : (
                                <CalendarCheck className="w-3 h-3" />
                              )}
                            </button>
                          )}

                          <button
                            id={`delete_event_btn_week_${evt.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteEvent(evt.id);
                            }}
                            className="opacity-60 hover:opacity-100 text-slate-300 hover:text-rose-400 p-0.5 transition cursor-pointer shrink-0"
                            title="Delete Event"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
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
              {/* Google Calendar Current Time Horizontal Line (Day View) */}
              {isSameDay(currentDate, now) && currentTopPixelDay >= 0 && currentTopPixelDay <= hours.length * 96 && (
                <div
                  id="current_time_day_line"
                  className="absolute z-30 pointer-events-none flex items-center left-[100px] right-0"
                  style={{ top: `${currentTopPixelDay}px` }}
                  title={`Current Time: ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                >
                  {/* Glowing Time Badge on the left of red line */}
                  <div className="absolute -left-1 font-mono text-[9px] font-extrabold bg-red-600 text-white px-1.5 py-0.5 rounded-full shadow-lg shadow-red-500/80 z-50 -translate-x-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                    <span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>

                  {/* Red Circle Indicator on 100px vertical time line border */}
                  <div className="absolute left-0 w-3.5 h-3.5 bg-red-500 rounded-full shadow-lg shadow-red-500/80 z-40 -translate-x-1/2 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                  {/* Red horizontal line across day view schedule */}
                  <div className="h-[2px] bg-red-500 w-full shadow-md shadow-red-500/70"></div>
                </div>
              )}

              {hours.map((hour) => {
                const hourEvents = events.filter(evt => {
                  const s = new Date(evt.start);
                  return isSameDay(s, currentDate) && s.getHours() === hour;
                }).sort((a, b) => {
                  const aStart = new Date(a.start).getTime();
                  const bStart = new Date(b.start).getTime();
                  if (aStart !== bStart) return aStart - bStart;
                  const getPriorityScore = (evtItem: CalendarEvent) => {
                    const g = goals.find(item => item.id === evtItem.goalId);
                    const p = g?.priority || "normal";
                    return p === "critical" ? 3 : p === "important" ? 2 : 1;
                  };
                  return getPriorityScore(b) - getPriorityScore(a);
                });
                const isDayCellOver = dragOverCell?.hour === hour;

                return (
                  <div 
                    key={hour} 
                    onDragOver={(e) => handleDragOver(e, hour)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDropEvent(e, hour)}
                    className={`grid grid-cols-[100px_1fr] border-b border-white/5 h-24 min-h-24 transition-colors ${
                      isDayCellOver ? "bg-indigo-500/20 border-2 border-indigo-400" : ""
                    }`}
                  >
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
                              draggable={true}
                              onDragStart={(e) => handleDragStart(e, evt.id)}
                              onClick={() => handleTriggerEditEvent(evt)}
                              onMouseEnter={() => setHoveredEventId(evt.id)}
                              onMouseLeave={() => setHoveredEventId(null)}
                              className={`p-3 rounded-xl shadow-md max-w-sm flex-1 cursor-grab active:cursor-grabbing transition hover:scale-[1.01] border-l-4 relative ${
                                draggedEventId === evt.id ? "opacity-40 ring-2 ring-indigo-400 scale-95" : ""
                              }`}
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

                              {/* Quick Resize controls in Day view */}
                              <div className="flex items-center gap-1.5 my-1.5 py-1 border-t border-b border-white/10 text-[10px]" onClick={(e) => e.stopPropagation()}>
                                <span className="text-slate-400 font-mono">Size:</span>
                                <button
                                  type="button"
                                  onClick={(e) => handleAdjustDuration(e, evt, -15)}
                                  className="bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded font-bold transition cursor-pointer"
                                  title="Shorten by 15 mins"
                                >
                                  -15m
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleAdjustDuration(e, evt, 30)}
                                  className="bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 px-2 py-0.5 rounded font-bold transition cursor-pointer"
                                  title="Extend by 30 mins"
                                >
                                  +30m
                                </button>
                              </div>
                              <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/5 gap-1">
                                <button
                                  type="button"
                                  id={`timer_event_btn_day_${evt.id}`}
                                  onClick={(e) => handleOpenTimerForEvent(evt, e)}
                                  className="text-[10px] px-2.5 py-1 rounded-md font-bold bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/30 transition flex items-center gap-1 cursor-pointer"
                                  title="Start Focus Timer"
                                >
                                  <Play className="w-3 h-3 fill-current text-indigo-400" />
                                  <span>Start Timer</span>
                                </button>

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

        {/* VIEW 3: SIMPLIFIED & MOBILE-OPTIMIZED LIST VIEW */}
        {viewMode === "list" && (
          <div className="p-3 sm:p-5 space-y-4 max-w-3xl mx-auto">
            
            {/* Header & Search Bar */}
            <div className="space-y-3 bg-white/5 border border-white/10 p-3.5 sm:p-4 rounded-2xl shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-sans font-bold text-white text-sm sm:text-base flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-indigo-400" />
                    Upcoming Schedule Blocks
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 font-medium">Chronological agenda for quick review and task execution.</p>
                </div>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono font-bold px-2.5 py-1 rounded-full self-start sm:self-auto">
                  {events.length} Total Registered
                </span>
              </div>

              {/* Search input & filter chips */}
              <div className="space-y-2.5 pt-1">
                <input 
                  type="text"
                  placeholder="🔍 Search schedule events or notes..."
                  value={listSearchQuery}
                  onChange={(e) => setListSearchQuery(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-900/60 text-white border border-white/10 rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-slate-900 transition placeholder:text-slate-500"
                />

                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
                  {(
                    [
                      { id: "all", label: "All Items" },
                      { id: "workout", label: "🏋️ Workouts" },
                      { id: "study", label: "📚 Study" },
                      { id: "personal", label: "⚙️ Personal" },
                      { id: "pending", label: "⏳ Pending" },
                      { id: "completed", label: "✅ Completed" }
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setListCategoryFilter(f.id)}
                      className={`text-[11px] px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer shrink-0 min-h-[32px] ${
                        listCategoryFilter === f.id
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                          : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {(() => {
              const filtered = events.filter(evt => {
                if (listSearchQuery.trim()) {
                  const q = listSearchQuery.toLowerCase();
                  const titleMatch = evt.title.toLowerCase().includes(q);
                  const notesMatch = evt.notes ? evt.notes.toLowerCase().includes(q) : false;
                  const typeMatch = evt.type.toLowerCase().includes(q);
                  if (!titleMatch && !notesMatch && !typeMatch) return false;
                }
                if (listCategoryFilter === "workout") return evt.type === "workout";
                if (listCategoryFilter === "study") return evt.type === "study";
                if (listCategoryFilter === "personal") return evt.type === "personal" || evt.type === "external";
                if (listCategoryFilter === "pending") return !evt.completed;
                if (listCategoryFilter === "completed") return evt.completed;
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="text-center p-8 border-2 border-dashed border-white/10 bg-white/5 rounded-2xl space-y-2">
                    <CalendarIcon className="w-8 h-8 text-slate-500 mx-auto" />
                    <p className="text-xs text-slate-300 font-semibold">No schedule items match your current filter.</p>
                    <p className="text-[11px] text-slate-500">Try clearing your search query or add a new event using "+ Event".</p>
                  </div>
                );
              }

              const sorted = [...filtered].sort((a,b) => {
                const aStart = new Date(a.start).getTime();
                const bStart = new Date(b.start).getTime();
                if (aStart !== bStart) return aStart - bStart;
                const getPriorityScore = (evtItem: CalendarEvent) => {
                  const g = goals.find(item => item.id === evtItem.goalId);
                  const p = g?.priority || "normal";
                  return p === "critical" ? 3 : p === "important" ? 2 : 1;
                };
                return getPriorityScore(b) - getPriorityScore(a);
              });
              const nowTime = now.getTime();
              const firstFutureIdx = sorted.findIndex(evt => new Date(evt.start).getTime() > nowTime);

              const timeMarker = (
                <div 
                  key="current_time_list_marker"
                  id="current_time_list_marker" 
                  className="py-2 my-2 flex items-center gap-2.5 bg-red-100 dark:bg-red-500/10 border-y border-red-300 dark:border-red-500/30 px-3 rounded-xl z-20 shadow-md"
                >
                  <div className="w-3 h-3 bg-red-500 rounded-full shadow-lg shadow-red-500/80 shrink-0 flex items-center justify-center animate-pulse">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                  </div>
                  <div className="h-[2px] bg-red-500 flex-1 shadow-sm shadow-red-500/50"></div>
                  <span className="text-[10px] font-mono font-black text-red-900 dark:text-red-400 bg-red-200 dark:bg-red-500/20 border border-red-300 dark:border-red-500/40 px-2.5 py-0.5 rounded-full shrink-0 flex items-center gap-1.5 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 animate-ping"></span>
                    NOW • {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );

              return (
                <div className="space-y-3">
                  {sorted.map((evt, idx) => {
                    const s = new Date(evt.start);
                    const e = new Date(evt.end);
                    const isCurrent = nowTime >= s.getTime() && nowTime <= e.getTime();
                    const showMarkerBefore = firstFutureIdx !== -1 ? idx === firstFutureIdx : false;

                    return (
                      <React.Fragment key={evt.id}>
                        {showMarkerBefore && timeMarker}
                        <div 
                          id={`event_card_list_${evt.id}`}
                          onClick={() => handleTriggerEditEvent(evt)}
                          className={`p-3.5 sm:p-4 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition cursor-pointer ${
                            isCurrent
                              ? "bg-indigo-50 dark:bg-indigo-500/15 border-red-400 dark:border-red-500/50 shadow-lg shadow-red-500/10 ring-1 ring-red-400 dark:ring-red-500/30"
                              : evt.completed
                              ? "bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 opacity-70"
                              : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <span 
                              className="w-3.5 h-3.5 rounded-full shrink-0 mt-0.5"
                              style={{ backgroundColor: getEventColorStyles(evt).dotColor }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className={`text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate ${evt.completed ? "line-through opacity-75" : ""}`}>
                                  {getEventIcon(evt)}
                                  <span className="truncate">{evt.title}</span>
                                </h4>
                                {(() => {
                                  const tiedGoal = goals.find(g => g.id === evt.goalId);
                                  if (tiedGoal?.priority === "critical") {
                                    return (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1 shrink-0">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                        CRITICAL
                                      </span>
                                    );
                                  } else if (tiedGoal?.priority === "important") {
                                    return (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        IMPORTANT
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                                {isCurrent && (
                                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-red-500 text-white animate-pulse flex items-center gap-1 shrink-0">
                                    <span className="w-1 h-1 rounded-full bg-white"></span>
                                    HAPPENING NOW
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-1.5 mt-1 font-medium">
                                <span className="font-bold text-slate-900 dark:text-slate-200">{s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                                <span className="text-slate-400 dark:text-slate-500">•</span>
                                <span className="font-mono text-indigo-700 dark:text-indigo-300 font-bold">{s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </p>
                              {evt.notes && (
                                <p className="text-[10px] text-slate-600 dark:text-slate-400 italic mt-1 line-clamp-2">
                                  "{evt.notes}"
                                </p>
                              )}
                              {evt.completionNote ? (
                                <p className="text-[10px] text-amber-900 dark:text-amber-300 font-bold italic mt-1.5 flex items-start gap-1 bg-amber-100 dark:bg-amber-500/10 p-1.5 rounded border border-amber-300 dark:border-amber-500/20">
                                  <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                  <span>Logged Takeaway: "{evt.completionNote}"</span>
                                </p>
                              ) : (
                                (() => {
                                  const tiedGoal = goals.find(g => g.id === evt.goalId);
                                  if (tiedGoal?.lastSessionNote) {
                                    return (
                                      <p className="text-[10px] text-amber-900 dark:text-amber-300/90 font-bold italic mt-1.5 flex items-start gap-1 bg-amber-100 dark:bg-amber-500/10 p-1.5 rounded border border-amber-300 dark:border-amber-500/20">
                                        <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                        <span>Prep Note for Next Session: "{tiedGoal.lastSessionNote}"</span>
                                      </p>
                                    );
                                  }
                                  return null;
                                })()
                              )}
                            </div>
                          </div>

                          {/* Action Buttons Row */}
                          <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-white/5 w-full sm:w-auto shrink-0">
                            <button
                              type="button"
                              id={`timer_event_btn_list_${evt.id}`}
                              onClick={(e) => handleOpenTimerForEvent(evt, e)}
                              className="text-[11px] px-3 py-2 rounded-xl font-bold bg-indigo-100 dark:bg-indigo-500/20 hover:bg-indigo-200 dark:hover:bg-indigo-500/30 text-indigo-900 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/30 flex items-center gap-1.5 cursor-pointer transition min-h-[38px] flex-1 sm:flex-none justify-center"
                              title="Start Focus Timer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current text-indigo-600 dark:text-indigo-400" />
                              <span>Timer</span>
                            </button>

                            {/* Delay/Shift Popover Menu */}
                            {!evt.completed && evt.type !== "external" && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveShiftMenuId(activeShiftMenuId === evt.id ? null : evt.id);
                                  }}
                                  className="text-[11px] px-2.5 py-2 rounded-xl font-bold bg-amber-100 dark:bg-amber-500/15 hover:bg-amber-200 dark:hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 flex items-center gap-1 cursor-pointer transition min-h-[38px] flex-1 sm:flex-none justify-center"
                                  title="Delay or shift this event forward"
                                >
                                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                  <span>Delay</span>
                                </button>

                                {activeShiftMenuId === evt.id && (
                                  <div 
                                    className="absolute right-0 bottom-full mb-1 w-44 bg-white dark:bg-[#121320] border border-slate-200 dark:border-white/20 rounded-xl shadow-2xl p-2 z-50 text-left space-y-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-2 py-0.5">Cascade Shift Forward:</p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleCascadingDelayEvent(evt, 30 * 60 * 1000, "30m");
                                        setActiveShiftMenuId(null);
                                      }}
                                      className="w-full text-left px-2 py-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-xs text-slate-900 dark:text-white font-medium flex items-center justify-between cursor-pointer"
                                    >
                                      <span>+30 Minutes</span>
                                      <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">⏩</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleCascadingDelayEvent(evt, 60 * 60 * 1000, "1h");
                                        setActiveShiftMenuId(null);
                                      }}
                                      className="w-full text-left px-2 py-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-xs text-slate-900 dark:text-white font-medium flex items-center justify-between cursor-pointer"
                                    >
                                      <span>+1 Hour</span>
                                      <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">⏩</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleCascadingDelayEvent(evt, 24 * 60 * 60 * 1000, "1d");
                                        setActiveShiftMenuId(null);
                                      }}
                                      className="w-full text-left px-2 py-1 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded text-xs text-amber-900 dark:text-amber-200 font-bold flex items-center justify-between cursor-pointer"
                                    >
                                      <span>+1 Day</span>
                                      <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">📅</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleCascadingDelayEvent(evt, 2 * 24 * 60 * 60 * 1000, "2d");
                                        setActiveShiftMenuId(null);
                                      }}
                                      className="w-full text-left px-2 py-1 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded text-xs text-amber-900 dark:text-amber-200 font-bold flex items-center justify-between cursor-pointer"
                                    >
                                      <span>+2 Days</span>
                                      <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">📅</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleCascadingDelayEvent(evt, 7 * 24 * 60 * 60 * 1000, "1w");
                                        setActiveShiftMenuId(null);
                                      }}
                                      className="w-full text-left px-2 py-1 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded text-xs text-amber-900 dark:text-amber-200 font-bold flex items-center justify-between cursor-pointer"
                                    >
                                      <span>+1 Week</span>
                                      <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold">🗓️</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            <button
                              id={`complete_event_btn_list_${evt.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleCompleteEvent(evt.id);
                              }}
                              className={`text-[11px] px-3 py-2 rounded-xl font-bold cursor-pointer transition min-h-[38px] flex-1 sm:flex-none justify-center ${
                                evt.completed 
                                  ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30" 
                                  : "bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 shadow-xs"
                              }`}
                            >
                              {evt.completed ? "Done ✅" : "Complete"}
                            </button>

                            {googleAccessToken && evt.type !== "external" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportToGoogleCalendar(evt);
                                }}
                                disabled={exportStatus[evt.id] === "syncing" || exportStatus[evt.id] === "success"}
                                className={`p-2 border rounded-xl transition cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center ${
                                  exportStatus[evt.id] === "success"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : exportStatus[evt.id] === "error"
                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                    : exportStatus[evt.id] === "syncing"
                                    ? "bg-indigo-600/10 text-indigo-400 animate-spin border-indigo-500/20"
                                    : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-indigo-400 border-white/10"
                                }`}
                                title={
                                  exportStatus[evt.id] === "success"
                                    ? "Synced to Google!"
                                    : "Export to Google Calendar"
                                }
                              >
                                {exportStatus[evt.id] === "success" ? (
                                  <CheckCircle2 className="w-4 h-4 animate-pulse" />
                                ) : (
                                  <CalendarCheck className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            <button
                              id={`delete_event_btn_list_${evt.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteEvent(evt.id);
                              }}
                              className="bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 p-2 rounded-xl transition border border-white/10 cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                              title="Delete event"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {firstFutureIdx === -1 && timeMarker}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* MODAL WINDOW: Create / Edit Goal */}
      {showGoalForm && (
        <div id="add_goal_modal_backdrop" className="fixed inset-0 bg-[#020205]/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div id="add_goal_modal_card" className="bg-[#0f111a] border border-white/12 rounded-2xl shadow-2xl w-full max-w-lg p-6 relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h3 className="font-sans font-bold text-white text-base flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-400" />
                {editingGoalId ? "Edit Routine Goal" : "Create New Goal"}
              </h3>
              <button
                type="button"
                onClick={() => setShowGoalForm(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Goal Name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Cybersecurity Study, Strength Workout"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type Focus</label>
                  <select
                    value={goalType}
                    onChange={(e) => setGoalType(e.target.value as GoalType)}
                    className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400"
                  >
                    <option value={GoalType.WORKOUT}>Workout Focus</option>
                    <option value={GoalType.STUDY}>Study Focus</option>
                    <option value={GoalType.JOB_SEARCH}>Job Search Focus</option>
                    <option value={GoalType.SIDE_PROJECT}>Side Project</option>
                    <option value={GoalType.ROUTINE}>Routine / Habit</option>
                    <option value={GoalType.PERSONAL}>Personal / Leisure</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Subcategory</label>
                  <input
                    type="text"
                    placeholder="e.g. Learning, Fitness"
                    value={goalCategory}
                    onChange={(e) => setGoalCategory(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Weekly Target</label>
                  <select
                    value={goalWeeklyTarget}
                    onChange={(e) => setGoalWeeklyTarget(Number(e.target.value))}
                    className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400"
                  >
                    <option value={1}>1 time / week</option>
                    <option value={2}>2 times / week</option>
                    <option value={3}>3 times / week</option>
                    <option value={4}>4 times / week</option>
                    <option value={5}>5 times / week</option>
                    <option value={6}>6 times / week</option>
                    <option value={7}>7 times / week (Daily)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Duration (Minutes)</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={isCustomGoalDuration ? "custom" : goalDuration}
                      onChange={(e) => {
                        if (e.target.value === "custom") {
                          setIsCustomGoalDuration(true);
                          const num = Number(customGoalDurationVal);
                          if (num > 0) setGoalDuration(num);
                        } else {
                          setIsCustomGoalDuration(false);
                          setGoalDuration(Number(e.target.value));
                        }
                      }}
                      className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400"
                    >
                      <option value={15}>15 minutes (Quick session)</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes (1 hour)</option>
                      <option value={90}>90 minutes (1.5 hrs)</option>
                      <option value={120}>120 minutes (2 hrs)</option>
                      <option value={180}>180 minutes (3 hrs)</option>
                      <option value="custom">Custom minutes...</option>
                    </select>

                    {isCustomGoalDuration && (
                      <div className="flex items-center gap-1 shrink-0 w-28">
                        <input
                          type="number"
                          min="5"
                          max="720"
                          placeholder="mins"
                          value={customGoalDurationVal}
                          onChange={(e) => {
                            const valStr = e.target.value;
                            setCustomGoalDurationVal(valStr);
                            const valNum = Number(valStr);
                            if (valNum > 0) {
                              setGoalDuration(valNum);
                            }
                          }}
                          className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 font-bold"
                        />
                        <span className="text-[10px] text-slate-400 font-medium">mins</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Time Preference</label>
                <select
                  value={goalTimePref}
                  onChange={(e) => setGoalTimePref(e.target.value as TimePreference)}
                  className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400"
                >
                  <option value={TimePreference.ANY}>Any hour of the day</option>
                  <option value={TimePreference.EARLY_MORNING}>Early Morning (05:00 - 08:00)</option>
                  <option value={TimePreference.MORNING}>Morning (08:00 - 12:00)</option>
                  <option value={TimePreference.AFTERNOON}>Afternoon (12:00 - 17:00)</option>
                  <option value={TimePreference.EVENING}>Evening (17:00 - 21:00)</option>
                  <option value={TimePreference.NIGHT}>Night / Late Night (21:00 - 02:00)</option>
                  <option value={TimePreference.CUSTOM}>Custom Time Window...</option>
                </select>

                {goalTimePref === TimePreference.CUSTOM && (
                  <div className="mt-2 p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg space-y-2">
                    <div className="text-[10px] font-semibold text-indigo-300 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Preferred Custom Window
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-0.5">Start Time</label>
                        <input
                          type="time"
                          value={goalCustomStart}
                          onChange={(e) => setGoalCustomStart(e.target.value)}
                          className="w-full text-xs p-2 bg-[#0f111a] border border-white/10 rounded-md text-white focus:outline-none focus:border-indigo-400 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-0.5">End Time</label>
                        <input
                          type="time"
                          value={goalCustomEnd}
                          onChange={(e) => setGoalCustomEnd(e.target.value)}
                          className="w-full text-xs p-2 bg-[#0f111a] border border-white/10 rounded-md text-white focus:outline-none focus:border-indigo-400 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Goal Icon Selector */}
              <GoalIconPicker selectedIcon={goalIcon} onSelectIcon={setGoalIcon} accentColor={goalColor} />

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Color Tag</label>
                <div className="flex items-center gap-2">
                  {["#f43f5e", "#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#3b82f6"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGoalColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                        goalColor === c ? "ring-2 ring-white scale-110" : "opacity-70 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowGoalForm(false)}
                  className="text-xs font-semibold px-4 py-2.5 border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs font-bold px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/25 cursor-pointer transition"
                >
                  {editingGoalId ? "Save Goal" : "Create Goal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                    {[...goals]
                      .sort((a, b) => {
                        const pScore = (p?: string) => p === "critical" ? 3 : p === "important" ? 2 : 1;
                        return pScore(b.priority) - pScore(a.priority);
                      })
                      .map((g) => {
                        const tag = g.priority === "critical" ? "🔴 [CRITICAL] " : g.priority === "important" ? "🟠 [IMPORTANT] " : "";
                        return (
                          <option key={g.id} value={g.id} className="bg-[#0f111a]">
                            {tag}{g.name} ({g.weeklyTarget}x/wk)
                          </option>
                        );
                      })}
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

      {/* Focus Session Countdown Timer Modal */}
      <FocusTimerModal
        isOpen={timerOpen}
        onClose={() => setTimerOpen(false)}
        sessionTitle={timerTitle}
        initialDurationMinutes={timerDuration}
        eventId={timerEventId}
        goalId={timerGoalId}
        category={timerCategory}
        color={timerColor}
        previousSessionNote={timerGoalId ? goals.find(g => g.id === timerGoalId)?.lastSessionNote : undefined}
        onCompleteSession={handleCompleteTimerSession}
      />
    </div>
  );
}
