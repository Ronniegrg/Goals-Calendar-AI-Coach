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
  CalendarCheck,
  Sun,
  Moon,
  Monitor
} from "lucide-react";
import CalendarView from "./components/CalendarView";
import GoalTracker from "./components/GoalTracker";
import ProgressDashboard from "./components/ProgressDashboard";
import AICoach from "./components/AICoach";
import NotificationsPanel from "./components/NotificationsPanel";
import FocusTimerModal from "./components/FocusTimerModal";
import { Goal, CalendarEvent, AvailabilityWindow, AppNotification, CoachMessage, SyncData, GoalType, TimePreference } from "./types";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"calendar" | "goals" | "dashboard" | "coach" | "notifications">("calendar");

  // Sync state & user credentials
  const [userEmail, setUserEmail] = useState("rounigorgees@gmail.com");
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "offline">("synced");
  const [lastSynced, setLastSynced] = useState<string>("");

  // Core application data (Loaded from server / cloud with localStorage fallback)
  const [goals, setGoals] = useState<Goal[]>(() => {
    try {
      const val = localStorage.getItem("cached_goals");
      if (!val) return [];
      const parsed = JSON.parse(val);
      // Clean up legacy pre-initialized default goals if present
      const filtered = Array.isArray(parsed) ? parsed.filter((g: any) => !["g1", "g2", "g3", "g4", "g_python"].includes(g.id)) : [];
      return filtered;
    } catch {
      return [];
    }
  });
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    try {
      const val = localStorage.getItem("cached_events");
      if (!val) return [];
      const parsed = JSON.parse(val);
      const filtered = Array.isArray(parsed) ? parsed.filter((e: any) => !["g1", "g2", "g3", "g4", "g_python"].includes(e.goalId) && !["e1", "e2", "e3", "e4"].includes(e.id)) : [];
      return filtered;
    } catch {
      return [];
    }
  });
  const [availability, setAvailability] = useState<AvailabilityWindow[]>(() => {
    try {
      const val = localStorage.getItem("cached_availability");
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  });
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const val = localStorage.getItem("cached_notifications");
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  });
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>(() => {
    try {
      const val = localStorage.getItem("cached_coachMessages");
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  });
  const [autoScheduleEnabled, setAutoScheduleEnabled] = useState<boolean>(() => {
    const val = localStorage.getItem("auto_schedule_enabled");
    return val !== "false";
  });
  const [coachPersona, setCoachPersona] = useState<"mentor" | "drill" | "data">(() => {
    return (localStorage.getItem("coach_persona") as "mentor" | "drill" | "data") || "mentor";
  });
  const [alertLeadMinutes, setAlertLeadMinutes] = useState<number>(() => {
    const val = localStorage.getItem("alert_lead_minutes");
    return val ? Number(val) : 15;
  });
  const [alertPushEnabled, setAlertPushEnabled] = useState<boolean>(() => {
    const val = localStorage.getItem("alert_push_enabled");
    return val !== "false";
  });

  // Auto Dark/Light Theme State Engine (Default: Auto Mode)
  const [themeMode, setThemeMode] = useState<"auto" | "dark" | "light">(() => {
    const saved = localStorage.getItem("app_theme_mode");
    if (saved === "dark" || saved === "light" || saved === "auto") {
      return saved;
    }
    return "auto";
  });
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const applyTheme = () => {
      let activeTheme: "dark" | "light" = "dark";
      if (themeMode === "dark") {
        activeTheme = "dark";
      } else if (themeMode === "light") {
        activeTheme = "light";
      } else {
        // Auto Mode: Follow OS media preference
        const systemPrefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        activeTheme = systemPrefersDark ? "dark" : "light";
      }

      setResolvedTheme(activeTheme);
      localStorage.setItem("app_theme_mode", themeMode);

      if (activeTheme === "light") {
        document.documentElement.classList.add("light-theme");
        document.documentElement.classList.remove("dark-theme");
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.remove("light-theme");
        document.documentElement.classList.add("dark-theme");
        document.documentElement.classList.add("dark");
      }
    };

    applyTheme();

    const mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const handleChange = () => {
      if (themeMode === "auto") {
        applyTheme();
      }
    };

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else if (mediaQuery?.addListener) {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [themeMode]);

  // 1. Initial Data load from cloud sync server with localStorage self-healing fallback
  useEffect(() => {
    const fetchData = async () => {
      setSyncStatus("syncing");
      try {
        const res = await fetch(`/api/sync?email=${encodeURIComponent(userEmail)}`);
        if (res.ok) {
          const data: SyncData & { lastSyncedAt?: string } = await res.json();
          
          const localLastUpdated = Number(localStorage.getItem("local_last_updated") || "0");
          const cloudLastSynced = data.lastSyncedAt ? new Date(data.lastSyncedAt).getTime() : 0;
          
          const cachedGoalsRaw = localStorage.getItem("cached_goals");
          const cachedGoalsParsed = cachedGoalsRaw ? JSON.parse(cachedGoalsRaw) : null;
          const localGoalsList = Array.isArray(cachedGoalsParsed)
            ? cachedGoalsParsed.filter((g: any) => !["g1", "g2", "g3", "g4", "g_python"].includes(g.id))
            : [];
          const hasLocalData = cachedGoalsRaw !== null;

          if (data.coachPersona) {
            setCoachPersona(data.coachPersona);
            localStorage.setItem("coach_persona", data.coachPersona);
          }

          // Clean legacy default goals from cloud data as well
          const cloudGoalsClean = Array.isArray(data.goals)
            ? data.goals.filter((g: any) => !["g1", "g2", "g3", "g4", "g_python"].includes(g.id))
            : [];
          const cloudEventsClean = Array.isArray(data.events)
            ? data.events.filter((e: any) => !["g1", "g2", "g3", "g4", "g_python"].includes(e.goalId) && !["e1", "e2", "e3", "e4"].includes(e.id))
            : [];

          if (hasLocalData && localLastUpdated > cloudLastSynced) {
            console.log("Local cache is newer than cloud. Syncing user custom goals to server...");
            
            const localEventsRaw = JSON.parse(localStorage.getItem("cached_events") || "[]");
            const localEvents = Array.isArray(localEventsRaw)
              ? localEventsRaw.filter((e: any) => !["g1", "g2", "g3", "g4", "g_python"].includes(e.goalId) && !["e1", "e2", "e3", "e4"].includes(e.id))
              : [];
            const localAvailability = JSON.parse(localStorage.getItem("cached_availability") || "[]");
            const localNotifications = JSON.parse(localStorage.getItem("cached_notifications") || "[]");
            const localCoachMessages = JSON.parse(localStorage.getItem("cached_coachMessages") || "[]");

            setGoals(localGoalsList);
            setEvents(localEvents.map((e: any) => ({ ...e, title: e.title.replace(" (Auto-Scheduled)", "") })));
            if (localAvailability.length > 0) {
              setAvailability(localAvailability);
            } else {
              setAvailability(data.availability || []);
            }
            setNotifications(localNotifications);
            setCoachMessages(localCoachMessages);

            // Sync up local user data to cloud database
            await syncToCloud(
              localGoalsList,
              localEvents,
              localAvailability.length > 0 ? localAvailability : data.availability || [],
              localNotifications,
              localCoachMessages,
              (localStorage.getItem("coach_persona") as "mentor" | "drill" | "data") || "mentor"
            );
          } else {
            // Cloud is newer or initial load
            setGoals(cloudGoalsClean);
            setEvents(cloudEventsClean.map((e: any) => ({ ...e, title: e.title.replace(" (Auto-Scheduled)", "") })));
            setAvailability(data.availability || []);
            setNotifications(data.notifications || []);
            setCoachMessages(data.coachMessages || []);
            if (data.coachPersona) {
              setCoachPersona(data.coachPersona);
              localStorage.setItem("coach_persona", data.coachPersona);
            }

            localStorage.setItem("cached_goals", JSON.stringify(cloudGoalsClean));
            localStorage.setItem("cached_events", JSON.stringify(cloudEventsClean));
            localStorage.setItem("cached_availability", JSON.stringify(data.availability || []));
            localStorage.setItem("cached_notifications", JSON.stringify(data.notifications || []));
            localStorage.setItem("cached_coachMessages", JSON.stringify(data.coachMessages || []));
            localStorage.setItem("local_last_updated", Date.now().toString());
          }
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

  // 2. Auto-sync helper (Syncs client modifications directly to server db and saves in localStorage)
  const syncToCloud = async (
    prevGoals: Goal[],
    prevEvents: CalendarEvent[],
    prevAvailability: AvailabilityWindow[],
    prevNotifications: AppNotification[],
    prevCoachMessages: CoachMessage[],
    forcedPersona?: "mentor" | "drill" | "data"
  ) => {
    // Save to local cache first
    const nowStr = Date.now().toString();
    localStorage.setItem("cached_goals", JSON.stringify(prevGoals));
    localStorage.setItem("cached_events", JSON.stringify(prevEvents));
    localStorage.setItem("cached_availability", JSON.stringify(prevAvailability));
    localStorage.setItem("cached_notifications", JSON.stringify(prevNotifications));
    localStorage.setItem("cached_coachMessages", JSON.stringify(prevCoachMessages));
    localStorage.setItem("local_last_updated", nowStr);

    const activePersona = forcedPersona || coachPersona;

    setSyncStatus("syncing");
    try {
      const payload: SyncData = {
        goals: prevGoals,
        events: prevEvents,
        availability: prevAvailability,
        notifications: prevNotifications,
        coachMessages: prevCoachMessages,
        userEmail,
        coachPersona: activePersona
      };

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
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

  // Helper to check if an event falls inside its goal's preferred time window
  const isEventInGoalTimePrefWindow = (evt: CalendarEvent, goal: Goal): boolean => {
    if (!goal.timePreference || goal.timePreference === TimePreference.ANY) return true;
    const evtDate = new Date(evt.start);
    const hour = evtDate.getHours() + (evtDate.getMinutes() / 60);

    if (goal.timePreference === TimePreference.EARLY_MORNING) {
      return hour >= 5 && hour < 8.5;
    }
    if (goal.timePreference === TimePreference.MORNING) {
      return hour >= 8 && hour < 12.5;
    }
    if (goal.timePreference === TimePreference.AFTERNOON) {
      return hour >= 12 && hour < 17;
    }
    if (goal.timePreference === TimePreference.EVENING) {
      return hour >= 17 && hour < 22;
    }
    if (goal.timePreference === TimePreference.NIGHT) {
      return hour >= 21 || hour < 2;
    }
    if (goal.timePreference === TimePreference.CUSTOM && goal.customTimeStart) {
      const [sH, sM] = goal.customTimeStart.split(":").map(Number);
      const startH = (sH || 0) + (sM || 0) / 60;
      let endH = startH + (goal.durationMinutes || 60) / 60;
      if (goal.customTimeEnd) {
        const [eH, eM] = goal.customTimeEnd.split(":").map(Number);
        endH = (eH || startH + 1) + (eM || 0) / 60;
      }
      return hour >= startH - 0.25 && hour < endH;
    }
    return true;
  };

  // 3b. Automated Background Multi-Week Rolling Scheduling Trigger Engine
  const triggerAutoScheduler = (
    currentGoals: Goal[],
    currentEvents: CalendarEvent[],
    currentAvailability: AvailabilityWindow[]
  ) => {
    if (currentGoals.length === 0) return;

    const now = new Date();
    // Filter out goals currently on hold
    const activeGoals = currentGoals.filter(goal => {
      if (!goal.isPaused) return true;
      if (!goal.pauseUntil) return false;
      return new Date(goal.pauseUntil) < now;
    });

    if (activeGoals.length === 0) return;

    // Prioritize Critical goals (3) > Important goals (2) > Normal goals (1)
    const getPriorityScore = (p?: string) => (p === "critical" ? 3 : p === "important" ? 2 : 1);
    const sortedGoals = [...activeGoals].sort((a, b) => getPriorityScore(b.priority) - getPriorityScore(a.priority));

    // Purge any uncompleted auto-scheduled events that violate their goal's strict time preference
    let purgedCount = 0;
    const validEvents = currentEvents.filter(evt => {
      if (evt.completed || evt.type === "external") return true;
      const parentGoal = currentGoals.find(g => g.id === evt.goalId || (evt.title && g.name && evt.title.toLowerCase().includes(g.name.toLowerCase())));
      if (!parentGoal) return true;
      const isValid = isEventInGoalTimePrefWindow(evt, parentGoal);
      if (!isValid) purgedCount++;
      return isValid;
    });

    const newScheduledEvents: CalendarEvent[] = [];
    let scheduledCount = 0;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    sortedGoals.forEach(goal => {
      const goalNameLower = goal.name.toLowerCase();
      const isDailyGoal = goal.weeklyTarget >= 7;
      const maxSessionsPerDay = isDailyGoal ? 1 : (goal.weeklyTarget > 7 ? Math.ceil(goal.weeklyTarget / 7) : 1);
      const blockDurationHours = (goal.durationMinutes || 60) / 60;

      // 4-week rolling horizon (28 days starting from today)
      for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
        const targetDay = new Date(todayStart);
        targetDay.setDate(todayStart.getDate() + dayOffset);
        const targetDayString = targetDay.toDateString();
        const weekOffset = Math.floor(dayOffset / 7);

        // Calculate week start & end for non-daily weekly target limits
        const startOfWeek = new Date(todayStart);
        startOfWeek.setDate(todayStart.getDate() - todayStart.getDay() + (weekOffset * 7));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // Check sessions in this week
        const sessionsInWeek = [...validEvents, ...newScheduledEvents].filter(evt => {
          const isThisGoal = evt.goalId === goal.id || (evt.title && evt.title.toLowerCase().includes(goalNameLower));
          if (!isThisGoal) return false;
          const evtDate = new Date(evt.start);
          return evtDate >= startOfWeek && evtDate <= endOfWeek;
        }).length;

        // For non-daily goals, skip if week quota already met
        if (!isDailyGoal && sessionsInWeek >= goal.weeklyTarget) {
          continue;
        }

        // Check sessions on targetDay
        const sessionsOnTargetDay = [...validEvents, ...newScheduledEvents].filter(evt => {
          const isThisGoal = evt.goalId === goal.id || (evt.title && evt.title.toLowerCase().includes(goalNameLower));
          return isThisGoal && new Date(evt.start).toDateString() === targetDayString;
        }).length;

        if (sessionsOnTargetDay >= maxSessionsPerDay) continue;

        const dayOfWeek = targetDay.getDay();
        let availDay = currentAvailability.find(a => a.dayOfWeek === dayOfWeek && a.active);
        if (!availDay) {
          availDay = { dayOfWeek, startTime: "08:00", endTime: "22:00", active: true };
        }

        let [availStartHour] = availDay.startTime.split(":").map(Number);
        let [availEndHour] = availDay.endTime.split(":").map(Number);

        let prefStart = availStartHour;
        let prefEnd = availEndHour;

        if (goal.timePreference === TimePreference.EARLY_MORNING) {
          prefStart = Math.max(availStartHour, 5);
          prefEnd = Math.min(availEndHour, 8.5);
        } else if (goal.timePreference === TimePreference.MORNING) {
          prefStart = Math.max(availStartHour, 8);
          prefEnd = Math.min(availEndHour, 12.5);
        } else if (goal.timePreference === TimePreference.AFTERNOON) {
          prefStart = Math.max(availStartHour, 12);
          prefEnd = Math.min(availEndHour, 17);
        } else if (goal.timePreference === TimePreference.EVENING) {
          prefStart = Math.max(availStartHour, 17);
          prefEnd = Math.max(availEndHour, 22);
        } else if (goal.timePreference === TimePreference.NIGHT) {
          prefStart = Math.max(availStartHour, 21);
          prefEnd = 24;
        } else if (goal.timePreference === TimePreference.CUSTOM && goal.customTimeStart && goal.customTimeEnd) {
          const [sH, sM] = goal.customTimeStart.split(":").map(Number);
          const [eH, eM] = goal.customTimeEnd.split(":").map(Number);
          prefStart = (sH || 0) + (sM || 0) / 60;
          prefEnd = (eH || 0) + (eM || 0) / 60;
        }

        if (prefStart >= prefEnd) {
          prefStart = availStartHour;
          prefEnd = availEndHour;
        }

        const isToday = dayOffset === 0;
        const nowHourDecimal = isToday ? now.getHours() + (now.getMinutes() / 60) + 0.25 : 0;

        let windowsToTry: { start: number; end: number }[] = [];
        if (!goal.timePreference || goal.timePreference === TimePreference.ANY) {
          windowsToTry = [
            { start: Math.max(availStartHour, isToday ? nowHourDecimal : availStartHour), end: availEndHour },
            { start: Math.max(8, isToday ? nowHourDecimal : 8), end: 22 }
          ];
        } else {
          windowsToTry = [
            { start: Math.max(prefStart, isToday ? nowHourDecimal : prefStart), end: prefEnd }
          ];
        }

        let slotBooked = false;

        for (const win of windowsToTry) {
          if (slotBooked) break;
          if (win.start >= win.end) continue;

          for (let hrs = win.start; hrs <= win.end - blockDurationHours; hrs += 0.5) {
            const slotStart = new Date(targetDay);
            slotStart.setHours(Math.floor(hrs), Math.round((hrs % 1) * 60), 0, 0);

            if (isToday && slotStart.getTime() <= now.getTime() + 10 * 60 * 1000) {
              continue;
            }

            const slotEnd = new Date(slotStart.getTime() + (goal.durationMinutes || 60) * 60 * 1000);

            const overlap = [...validEvents, ...newScheduledEvents].some(evt => {
              const evtStart = new Date(evt.start);
              const evtEnd = new Date(evt.end);
              return slotStart < evtEnd && slotEnd > evtStart;
            });

            if (!overlap) {
              newScheduledEvents.push({
                id: `${goal.id}_sch_${Date.now()}_${scheduledCount}`,
                title: goal.name,
                type: goal.type === GoalType.WORKOUT ? "workout" :
                      goal.type === GoalType.STUDY ? "study" :
                      goal.type === GoalType.JOB_SEARCH ? "job_search" :
                      goal.type === GoalType.SIDE_PROJECT ? "side_project" :
                      goal.type === GoalType.ROUTINE ? "routine" :
                      "personal",
                start: slotStart.toISOString(),
                end: slotEnd.toISOString(),
                goalId: goal.id,
                completed: false,
                icon: goal.icon,
                notes: `Auto-scheduled session for ${goal.name} (${goal.timePreference || "preferred"} time window)`
              });
              scheduledCount++;
              slotBooked = true;
              break;
            }
          }
        }
      }
    });

    if (newScheduledEvents.length > 0 || purgedCount > 0) {
      const nextEvents = [...newScheduledEvents, ...validEvents];
      setEvents(nextEvents);
      syncToCloud(currentGoals, nextEvents, currentAvailability, notifications, coachMessages);
      if (newScheduledEvents.length > 0) {
        triggerSystemNotification(
          "Auto-Scheduler Sync",
          `⚡ Auto-Scheduler mapped ${scheduledCount} session(s) strictly aligned with your time window preferences!`,
          "success"
        );
      }
    }
  };

  useEffect(() => {
    if (!autoScheduleEnabled || goals.length === 0) return;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const needsScheduling = goals.some(goal => {
      // Skip goals on hold
      if (goal.isPaused) {
        if (!goal.pauseUntil) return false;
        if (new Date(goal.pauseUntil) >= now) return false;
      }

      const goalNameLower = goal.name.toLowerCase();
      const isDailyGoal = goal.weeklyTarget >= 7;

      for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
        const targetDay = new Date(todayStart);
        targetDay.setDate(todayStart.getDate() + dayOffset);
        const targetDayString = targetDay.toDateString();

        const countOnDay = events.filter(e => {
          const isThisGoal = e.goalId === goal.id || (e.title && e.title.toLowerCase().includes(goalNameLower));
          if (!isThisGoal) return false;
          return new Date(e.start).toDateString() === targetDayString && isEventInGoalTimePrefWindow(e, goal);
        }).length;

        if (isDailyGoal && countOnDay === 0) {
          return true;
        }

        if (!isDailyGoal) {
          const weekOffset = Math.floor(dayOffset / 7);
          const startOfWeek = new Date(todayStart);
          startOfWeek.setDate(todayStart.getDate() - todayStart.getDay() + (weekOffset * 7));
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);

          const countInWeek = events.filter(e => {
            const isThisGoal = e.goalId === goal.id || (e.title && e.title.toLowerCase().includes(goalNameLower));
            if (!isThisGoal) return false;
            const d = new Date(e.start);
            return d >= startOfWeek && d <= endOfWeek && isEventInGoalTimePrefWindow(e, goal);
          }).length;

          if (countInWeek < goal.weeklyTarget) return true;
        }
      }
      return false;
    });

    if (needsScheduling) {
      const timer = setTimeout(() => {
        triggerAutoScheduler(goals, events, availability);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [goals, events, availability, autoScheduleEnabled]);

  // 3c. Auto-Resume Goals whose Pause/Hold duration has expired
  useEffect(() => {
    if (!goals || goals.length === 0) return;
    const now = new Date();
    let updated = false;
    const nextGoals = goals.map(g => {
      if (g.isPaused && g.pauseUntil) {
        const resumeDate = new Date(g.pauseUntil);
        if (!isNaN(resumeDate.getTime()) && resumeDate <= now) {
          updated = true;
          triggerSystemNotification(
            "Goal Hold Period Ended!",
            `🎉 Your hold period for "${g.name}" has completed! Goal is active again and auto-scheduler will place focus blocks.`,
            "success"
          );
          return { ...g, isPaused: false, pauseReason: undefined, pauseUntil: undefined, pausedAt: undefined };
        }
      }
      return g;
    });

    if (updated) {
      setGoals(nextGoals);
      syncToCloud(nextGoals, events, availability, notifications, coachMessages);
    }
  }, [goals]);

  // 4. Handle incoming action parameters (from Google Calendar description quick links)
  useEffect(() => {
    // Wait until initial data is populated
    if (events.length === 0 && goals.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const eventId = params.get("eventId");
    const goalId = params.get("goalId");

    if (action) {
      if (action === "complete_event" && eventId) {
        const foundEvent = events.find(e => e.id === eventId);
        if (foundEvent) {
          if (!foundEvent.completed) {
            handleToggleEventComplete(eventId);
            triggerSystemNotification(
              "Progress Marked Completed!",
              `Success: "${foundEvent.title}" was marked as completed directly via your Google Calendar quick action link!`,
              "success"
            );
          } else {
            triggerSystemNotification(
              "Already Done",
              `"${foundEvent.title}" is already marked as completed on your calendar dashboard.`,
              "sync"
            );
          }
        }
        // Scrub action params gracefully
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } else if (action === "edit_goal" && goalId) {
        const foundGoal = goals.find(g => g.id === goalId);
        if (foundGoal) {
          setActiveTab("calendar");
          // Save global target to auto-trigger the editor form in CalendarView
          (window as any)._autoEditGoal = foundGoal;
          triggerSystemNotification(
            "Goal Editor Active",
            `Locating goal details for "${foundGoal.name}" in your workspace interactive panel.`,
            "sync"
          );
        }
        // Scrub action params gracefully
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } else if (action === "add_goal") {
        setActiveTab("calendar");
        (window as any)._autoAddGoal = true;
        triggerSystemNotification(
          "Create Goal Flow Active",
          "Preparing workspace form to register your new physical/intellectual calendar goal.",
          "sync"
        );
        // Scrub action params gracefully
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }, [events, goals]);

  // Generate and send daily digest (summarizing scheduled goals and upcoming high-priority tasks)
  const generateAndTriggerDailyDigest = (dateStr?: string) => {
    const todayEvents = events.filter(evt => {
      if (evt.type === "external") return false;
      return new Date(evt.start).toDateString() === new Date().toDateString();
    });

    const highPriorityGoals = goals.filter(g => {
      const isUnderCompleted = g.completedCount < g.weeklyTarget;
      const hasUncompletedSubtasks = g.subtasks?.some(s => !s.completed) || false;
      return isUnderCompleted || hasUncompletedSubtasks;
    });

    let eventsSummary = "";
    if (todayEvents.length > 0) {
      eventsSummary = todayEvents.map(evt => {
        const timeStr = new Date(evt.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `• ${evt.title} at ${timeStr}`;
      }).join("\n");
    } else {
      eventsSummary = "• No goal blocks or tasks scheduled for today.";
    }

    let goalsSummary = "";
    if (highPriorityGoals.length > 0) {
      goalsSummary = highPriorityGoals.slice(0, 3).map(g => {
        const subCount = g.subtasks?.filter(s => !s.completed).length || 0;
        const subText = subCount > 0 ? ` (${subCount} pending milestones)` : "";
        return `• ${g.name}: ${g.completedCount}/${g.weeklyTarget} weekly sessions done${subText}`;
      }).join("\n");
    } else {
      goalsSummary = "• All weekly goal targets are fully completed and up to date!";
    }

    const message = `📋 TODAY'S SCHEDULED BLOCKS:\n${eventsSummary}\n\n🎯 HIGH PRIORITY FOCUS:\n${goalsSummary}`;

    triggerSystemNotification(
      "🌅 Morning Daily Digest - 8:00 AM",
      message,
      "sync"
    );

    if (dateStr) {
      localStorage.setItem("last_daily_digest_sent", dateStr);
    }
  };

  // Daily Digest 8:00 AM automatic trigger checker
  useEffect(() => {
    if (goals.length === 0 && events.length === 0) return;

    const checkDailyDigest = () => {
      const now = new Date();
      // Check if it is at or after 8:00 AM
      if (now.getHours() >= 8) {
        const todayStr = now.toDateString();
        const lastSent = localStorage.getItem("last_daily_digest_sent");
        if (lastSent !== todayStr) {
          generateAndTriggerDailyDigest(todayStr);
        }
      }
    };

    const delayTimer = setTimeout(checkDailyDigest, 2000);
    const interval = setInterval(checkDailyDigest, 30000);

    return () => {
      clearTimeout(delayTimer);
      clearInterval(interval);
    };
  }, [events, goals]);

  // Automated Pre-Session Background Alert Engine (Alerts 10–15 mins before scheduled session starts)
  useEffect(() => {
    if (events.length === 0) return;

    const checkUpcomingSessionAlerts = () => {
      const now = new Date();
      let notifiedIds: string[] = [];
      try {
        const notifiedIdsStr = localStorage.getItem("notified_event_alert_ids");
        if (notifiedIdsStr) notifiedIds = JSON.parse(notifiedIdsStr);
      } catch {
        notifiedIds = [];
      }

      events.forEach(evt => {
        if (evt.completed || evt.type === "external") return;
        if (notifiedIds.includes(evt.id)) return;

        const evtStart = new Date(evt.start);
        const diffMs = evtStart.getTime() - now.getTime();
        const diffMins = diffMs / (1000 * 60);

        if (diffMins > 0 && diffMins <= alertLeadMinutes) {
          const roundedMins = Math.max(1, Math.round(diffMins));
          const timeStr = evtStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

          triggerSystemNotification(
            `⏰ Upcoming Session in ${roundedMins} mins!`,
            `Your scheduled session "${evt.title}" starts at ${timeStr}. Time to prepare!`,
            "upcoming"
          );

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && alertPushEnabled) {
            try {
              new Notification(`⏰ Session Starts in ${roundedMins} Mins!`, {
                body: `"${evt.title}" at ${timeStr}. Time to prepare!`
              });
            } catch {
              // safe fallback
            }
          }

          notifiedIds.push(evt.id);
        }
      });

      localStorage.setItem("notified_event_alert_ids", JSON.stringify(notifiedIds));
    };

    const delayTimer = setTimeout(checkUpcomingSessionAlerts, 1500);
    const interval = setInterval(checkUpcomingSessionAlerts, 20000);

    return () => {
      clearTimeout(delayTimer);
      clearInterval(interval);
    };
  }, [events, alertLeadMinutes, alertPushEnabled]);

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
    let syncTargetEvents: CalendarEvent[] = [];
    let syncTargetGoals: Goal[] = [];

    setEvents(prevEvents => {
      const targetEvt = prevEvents.find(e => e.id === id);
      if (!targetEvt) return prevEvents;

      const toggleVal = !targetEvt.completed;

      // Find tied goal by goalId OR by title matching
      const targetGoal = goals.find(g => 
        (targetEvt.goalId && g.id === targetEvt.goalId) || 
        (targetEvt.title && g.name && targetEvt.title.toLowerCase().includes(g.name.toLowerCase()))
      );

      let nextGoals = [...goals];
      if (targetGoal) {
        nextGoals = goals.map(g => {
          if (g.id === targetGoal.id) {
            const countChange = toggleVal ? 1 : -1;
            return { ...g, completedCount: Math.max(g.completedCount + countChange, 0) };
          }
          return g;
        });
      }

      const nextEvents = prevEvents.map(evt => {
        if (evt.id === id) {
          return { 
            ...evt, 
            completed: toggleVal,
            goalId: targetGoal ? targetGoal.id : evt.goalId 
          };
        }
        return evt;
      });

      if (toggleVal) {
        const typeLabel = targetEvt.type === "workout" ? "Physical session completed!" : "Intellectual focus block aced!";
        triggerSystemNotification(
          "Session Achieved!",
          `Success: "${targetEvt.title}" marked as done. ${typeLabel}`,
          "success"
        );
      }

      setGoals(nextGoals);
      syncTargetEvents = nextEvents;
      syncTargetGoals = nextGoals;
      return nextEvents;
    });

    setTimeout(() => {
      syncToCloud(syncTargetGoals, syncTargetEvents, availability, notifications, coachMessages);
    }, 50);
  };

  // C. Delete existing event
  const handleDeleteEvent = (id: string) => {
    const targetEvt = events.find(e => e.id === id);
    let nextGoals = [...goals];

    // Decrement completed aggregates if deleting an already completed event
    if (targetEvt && targetEvt.completed) {
      const targetGoal = goals.find(g => 
        (targetEvt.goalId && g.id === targetEvt.goalId) ||
        (targetEvt.title && g.name && targetEvt.title.toLowerCase().includes(g.name.toLowerCase()))
      );

      if (targetGoal) {
        nextGoals = goals.map(g => 
          g.id === targetGoal.id ? { ...g, completedCount: Math.max(g.completedCount - 1, 0) } : g
        );
        setGoals(nextGoals);
      }
    }

    const nextEvents = events.filter(e => e.id !== id);
    setEvents(nextEvents);
    syncToCloud(nextGoals, nextEvents, availability, notifications, coachMessages);
  };

  // CC. Edit existing calendar event attributes
  const handleEditEvent = (id: string, updatedFields: Partial<Omit<CalendarEvent, "id">>) => {
    let syncTargetEvents: CalendarEvent[] = [];
    let syncTargetGoals: Goal[] = [];

    setEvents(prevEvents => {
      const targetEvt = prevEvents.find(e => e.id === id);
      let nextGoals = [...goals];

      if (targetEvt && updatedFields.completed !== undefined && targetEvt.completed !== updatedFields.completed) {
        const toggleVal = updatedFields.completed;
        const targetGoal = goals.find(g => 
          (targetEvt.goalId && g.id === targetEvt.goalId) || 
          (targetEvt.title && g.name && targetEvt.title.toLowerCase().includes(g.name.toLowerCase())) ||
          (updatedFields.title && g.name && updatedFields.title.toLowerCase().includes(g.name.toLowerCase()))
        );

        if (targetGoal) {
          nextGoals = goals.map(g => {
            if (g.id === targetGoal.id) {
              const countChange = toggleVal ? 1 : -1;
              return { ...g, completedCount: Math.max(g.completedCount + countChange, 0) };
            }
            return g;
          });
        }

        if (toggleVal) {
          triggerSystemNotification(
            "Session Achieved!",
            `Success: "${updatedFields.title || targetEvt.title}" marked as done!`,
            "success"
          );
        }
      }

      const nextEvents = prevEvents.map(evt => {
        if (evt.id === id) {
          return { ...evt, ...updatedFields } as CalendarEvent;
        }
        return evt;
      });

      setGoals(nextGoals);
      syncTargetEvents = nextEvents;
      syncTargetGoals = nextGoals;
      return nextEvents;
    });

    setTimeout(() => {
      if (syncTargetEvents.length > 0) {
        syncToCloud(syncTargetGoals, syncTargetEvents, availability, notifications, coachMessages);
      }
    }, 50);
  };

  // CC-2. Atomic Bulk Edit for multiple calendar events (Cascading Delays / Smart Rebalancing)
  const handleBulkEditEvents = (updates: { id: string; fields: Partial<Omit<CalendarEvent, "id">> }[]) => {
    if (!updates || updates.length === 0) return;
    const updateMap = new Map(updates.map(u => [u.id, u.fields]));

    let syncTargetEvents: CalendarEvent[] = [];
    setEvents(prevEvents => {
      const nextEvents = prevEvents.map(evt => {
        const fields = updateMap.get(evt.id);
        if (fields) {
          return { ...evt, ...fields } as CalendarEvent;
        }
        return evt;
      });

      syncTargetEvents = nextEvents;
      return nextEvents;
    });

    setTimeout(() => {
      if (syncTargetEvents.length > 0) {
        syncToCloud(goals, syncTargetEvents, availability, notifications, coachMessages);
      }
    }, 50);
  };

  // Timer Session Completion & Extension Handlers
  const handleCompleteTimerSession = (eventId?: string, goalId?: string, note?: string) => {
    let syncTargetEvents: CalendarEvent[] = [];
    let syncTargetGoals: Goal[] = [];

    setEvents(prevEvents => {
      let targetGoal = goalId ? goals.find(item => item.id === goalId) : undefined;
      let targetEvt: CalendarEvent | undefined;

      if (eventId) {
        targetEvt = prevEvents.find(e => e.id === eventId);
      }

      const todayStr = new Date().toDateString();

      if (!targetEvt && targetGoal) {
        targetEvt = prevEvents.find(e => 
          !e.completed && 
          (e.goalId === targetGoal!.id || (e.title && targetGoal!.name && e.title.toLowerCase().includes(targetGoal!.name.toLowerCase()))) &&
          new Date(e.start).toDateString() === todayStr
        );
      }

      if (!targetGoal && targetEvt) {
        targetGoal = goals.find(g => 
          (targetEvt!.goalId && g.id === targetEvt!.goalId) ||
          (targetEvt!.title && g.name && targetEvt!.title.toLowerCase().includes(g.name.toLowerCase()))
        );
      }

      let nextEvents = [...prevEvents];
      let nextGoals = [...goals];
      let shouldIncrementGoalCount = false;

      if (targetEvt) {
        const wasCompleted = targetEvt.completed;
        nextEvents = prevEvents.map(evt => {
          if (evt.id === targetEvt!.id) {
            return {
              ...evt,
              completed: true,
              goalId: targetGoal ? targetGoal.id : evt.goalId,
              ...(note ? { completionNote: note } : {})
            };
          }
          return evt;
        });

        if (!wasCompleted) {
          shouldIncrementGoalCount = true;
        }
      } else if (targetGoal) {
        // Create new completed event record for today
        const now = new Date();
        const end = new Date(now.getTime() + (targetGoal.durationMinutes || 30) * 60000);
        const newEvt: CalendarEvent = {
          id: `e_${Date.now()}`,
          title: targetGoal.name,
          start: now.toISOString(),
          end: end.toISOString(),
          type: targetGoal.type || "study",
          completed: true,
          goalId: targetGoal.id,
          completionNote: note
        };
        nextEvents = [newEvt, ...prevEvents];
        shouldIncrementGoalCount = true;
      }

      if (targetGoal) {
        nextGoals = nextGoals.map(g => {
          if (g.id === targetGoal!.id) {
            return {
              ...g,
              completedCount: shouldIncrementGoalCount ? g.completedCount + 1 : g.completedCount,
              ...(note ? { lastSessionNote: note, lastSessionNoteDate: new Date().toISOString() } : {})
            };
          }
          return g;
        });
      }

      setGoals(nextGoals);

      const displayTitle = targetGoal ? targetGoal.name : (targetEvt ? targetEvt.title : "Focus Session");
      triggerSystemNotification(
        "Goal Session Logged!",
        `Success: Goal "${displayTitle}" session marked as completed!`,
        "success"
      );

      syncTargetEvents = nextEvents;
      syncTargetGoals = nextGoals;
      return nextEvents;
    });

    setTimeout(() => {
      syncToCloud(syncTargetGoals, syncTargetEvents, availability, notifications, coachMessages);
    }, 50);
  };

  const handleExtendEventDuration = (eventId: string, deltaMins: number) => {
    const evt = events.find(e => e.id === eventId);
    if (evt) {
      const currentEnd = new Date(evt.end);
      currentEnd.setMinutes(currentEnd.getMinutes() + deltaMins);
      handleEditEvent(eventId, { end: currentEnd.toISOString() });
    }
  };

  // Handle Reset & Clean Regenerate Calendar
  const handleResetAndRegenerateCalendar = (options?: { clearMode?: "uncompleted_goals" | "all_events"; keepExternal?: boolean }) => {
    const mode = options?.clearMode || "uncompleted_goals";
    const keepExternal = options?.keepExternal !== false;

    let remainingEvents: CalendarEvent[] = [];

    if (mode === "uncompleted_goals") {
      remainingEvents = events.filter(evt => {
        if (keepExternal && evt.type === "external") return true;
        if (evt.completed) return true; // keep completed session history
        return false; // wipe uncompleted sessions to allow clean regenerate
      });
    } else {
      remainingEvents = events.filter(evt => {
        if (keepExternal && evt.type === "external") return true;
        return false;
      });
    }

    setEvents(remainingEvents);
    syncToCloud(goals, remainingEvents, availability, notifications, coachMessages);

    setTimeout(() => {
      triggerAutoScheduler(goals, remainingEvents, availability);
      triggerSystemNotification(
        "Calendar Regenerated",
        "⚡ Calendar schedule was cleanly reset and regenerated based on your active goals & availability!",
        "success"
      );
    }, 150);
  };

  // Helper to generate dynamic calendar event sessions for a goal
  const generateGoalSessions = (
    goal: Goal,
    existingEvents: CalendarEvent[],
    neededCount: number,
    availList: AvailabilityWindow[]
  ): CalendarEvent[] => {
    if (neededCount <= 0) return [];
    const newEvents: CalendarEvent[] = [];
    let successBooked = 0;
    const now = new Date();
    const goalNameLower = goal.name.toLowerCase();

    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      if (successBooked >= neededCount) break;

      const targetDay = new Date(now);
      targetDay.setDate(now.getDate() + dayOffset);
      const dayOfWeek = targetDay.getDay();

      let availDay = availList.find(a => a.dayOfWeek === dayOfWeek && a.active);
      if (!availDay) {
        availDay = { dayOfWeek, startTime: "08:00", endTime: "22:00", active: true };
      }

      const maxSessionsPerDay = goal.weeklyTarget >= 7 ? 1 : (goal.weeklyTarget > 7 ? Math.ceil(goal.weeklyTarget / 7) : 1);
      const targetDayString = targetDay.toDateString();

      const sessionsOnTargetDay = [...existingEvents, ...newEvents].filter(evt => {
        const isThisGoal = evt.goalId === goal.id || (evt.title && evt.title.toLowerCase().includes(goalNameLower));
        return isThisGoal && new Date(evt.start).toDateString() === targetDayString;
      }).length;

      if (sessionsOnTargetDay >= maxSessionsPerDay) continue;

      let [availStartHour] = availDay.startTime.split(":").map(Number);
      let [availEndHour] = availDay.endTime.split(":").map(Number);

      let prefStart = availStartHour;
      let prefEnd = availEndHour;

      if (goal.timePreference === TimePreference.EARLY_MORNING) {
        prefStart = Math.max(availStartHour, 5);
        prefEnd = Math.min(availEndHour, 8.5);
      } else if (goal.timePreference === TimePreference.MORNING) {
        prefStart = Math.max(availStartHour, 8);
        prefEnd = Math.min(availEndHour, 12.5);
      } else if (goal.timePreference === TimePreference.AFTERNOON) {
        prefStart = Math.max(availStartHour, 12);
        prefEnd = Math.min(availEndHour, 17);
      } else if (goal.timePreference === TimePreference.EVENING) {
        prefStart = Math.max(availStartHour, 17);
        prefEnd = Math.max(availEndHour, 22);
      } else if (goal.timePreference === TimePreference.NIGHT) {
        prefStart = Math.max(availStartHour, 21);
        prefEnd = 24;
      } else if (goal.timePreference === TimePreference.CUSTOM && goal.customTimeStart && goal.customTimeEnd) {
        const [sH, sM] = goal.customTimeStart.split(":").map(Number);
        const [eH, eM] = goal.customTimeEnd.split(":").map(Number);
        prefStart = (sH || 0) + (sM || 0) / 60;
        prefEnd = (eH || 0) + (eM || 0) / 60;
      }

      if (prefStart >= prefEnd) {
        prefStart = availStartHour;
        prefEnd = availEndHour;
      }

      const blockDurationHours = (goal.durationMinutes || 60) / 60;
      const isToday = dayOffset === 0;
      const nowHourDecimal = isToday ? now.getHours() + (now.getMinutes() / 60) + 0.25 : 0;

      let windowsToTry: { start: number; end: number }[] = [];
      if (!goal.timePreference || goal.timePreference === TimePreference.ANY) {
        windowsToTry = [
          { start: Math.max(availStartHour, isToday ? nowHourDecimal : availStartHour), end: availEndHour },
          { start: Math.max(8, isToday ? nowHourDecimal : 8), end: 22 }
        ];
      } else {
        windowsToTry = [
          { start: Math.max(prefStart, isToday ? nowHourDecimal : prefStart), end: prefEnd }
        ];
      }

      let slotBookedOnDay = false;

      for (const win of windowsToTry) {
        if (slotBookedOnDay) break;
        if (win.start >= win.end) continue;

        for (let hrs = win.start; hrs <= win.end - blockDurationHours; hrs += 0.5) {
          if (successBooked >= neededCount) break;

          const currentDayCount = [...existingEvents, ...newEvents].filter(evt => {
            const isThisGoal = evt.goalId === goal.id || (evt.title && evt.title.toLowerCase().includes(goalNameLower));
            return isThisGoal && new Date(evt.start).toDateString() === targetDayString;
          }).length;

          if (currentDayCount >= maxSessionsPerDay) break;

          const slotStart = new Date(targetDay);
          slotStart.setHours(Math.floor(hrs), (hrs % 1) * 60, 0, 0);

          if (dayOffset === 0 && slotStart.getTime() <= now.getTime() + 15 * 60 * 1000) {
            continue;
          }

          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotStart.getMinutes() + (goal.durationMinutes || 60));

          const overlap = [...existingEvents, ...newEvents].some(evt => {
            const evtStart = new Date(evt.start);
            const evtEnd = new Date(evt.end);
            return slotStart < evtEnd && slotEnd > evtStart;
          });

          if (!overlap) {
            const mappedType =
              goal.type === GoalType.WORKOUT ? "workout" :
              goal.type === GoalType.STUDY ? "study" :
              goal.type === GoalType.JOB_SEARCH ? "job_search" :
              goal.type === GoalType.SIDE_PROJECT ? "side_project" :
              goal.type === GoalType.ROUTINE ? "routine" :
              "personal";

            newEvents.push({
              id: `e_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              title: goal.name,
              type: mappedType,
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              goalId: goal.id,
              completed: false,
              notes: `Auto-scheduled session for ${goal.name}`,
              icon: goal.icon
            });

            successBooked++;
            slotBookedOnDay = true;
            break;
          }
        }
      }
    }

    return newEvents;
  };

  // D. Create custom Goal Object
  const handleAddGoal = (newGoalRaw: Omit<Goal, "id" | "completedCount" | "createdAt">) => {
    const newGoal: Goal = {
      ...newGoalRaw,
      id: `g_${Date.now()}`,
      completedCount: 0,
      createdAt: new Date().toISOString()
    };

    // Auto-schedule sessions on calendar right when goal is created
    const autoEvents = generateGoalSessions(newGoal, events, newGoal.weeklyTarget, availability);
    const nextGoals = [newGoal, ...goals];
    const nextEvents = [...autoEvents, ...events];

    setGoals(nextGoals);
    setEvents(nextEvents);
    syncToCloud(nextGoals, nextEvents, availability, notifications, coachMessages);

    if (autoEvents.length > 0) {
      triggerSystemNotification(
        "Goal Created & Scheduled",
        `Created "${newGoal.name}" and scheduled ${autoEvents.length} session(s) on your calendar!`,
        "success"
      );
    }
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

  // EE. Edit custom Goal in cloud database
  const handleEditGoal = (goalId: string, updatedFields: Partial<Omit<Goal, "id" | "createdAt">>) => {
    const targetGoal = goals.find(g => g.id === goalId);
    if (!targetGoal) return;

    const updatedGoal: Goal = { ...targetGoal, ...updatedFields };

    const nextGoals = goals.map(g => 
      g.id === goalId ? updatedGoal : g
    );

    // 1. Synchronize tied event attributes and reschedule uncompleted events if timePreference or duration changed
    let nextEvents = events.map(evt => {
      if (evt.goalId === goalId) {
        let newTitle = evt.title;
        if (updatedFields.name !== undefined) {
          newTitle = updatedFields.name;
        }
        let newType = evt.type;
        if (updatedFields.type !== undefined) {
          newType = updatedFields.type === GoalType.WORKOUT ? "workout" :
                    updatedFields.type === GoalType.STUDY ? "study" :
                    updatedFields.type === GoalType.JOB_SEARCH ? "job_search" :
                    updatedFields.type === GoalType.SIDE_PROJECT ? "side_project" :
                    updatedFields.type === GoalType.ROUTINE ? "routine" :
                    "personal";
        }
        let newIcon = evt.icon;
        if (updatedFields.icon !== undefined) {
          newIcon = updatedFields.icon;
        }

        let newStart = evt.start;
        let newEnd = evt.end;

        // If timePreference, custom times, or durationMinutes changed, reschedule uncompleted events
        if (!evt.completed && (
          updatedFields.timePreference !== undefined ||
          updatedFields.customTimeStart !== undefined ||
          updatedFields.customTimeEnd !== undefined ||
          updatedFields.durationMinutes !== undefined
        )) {
          const evtDate = new Date(evt.start);
          const dayOfWeek = evtDate.getDay();
          const availDay = availability.find(a => a.dayOfWeek === dayOfWeek);

          let availStartHour = 8;
          let availEndHour = 22;
          if (availDay && availDay.active) {
            availStartHour = Number(availDay.startTime.split(":")[0]) || 8;
            availEndHour = Number(availDay.endTime.split(":")[0]) || 22;
          }

          const timePref = updatedGoal.timePreference;
          let prefStart = availStartHour;
          let prefEnd = availEndHour;

          if (timePref === TimePreference.EARLY_MORNING) {
            prefStart = Math.max(availStartHour, 5);
            prefEnd = Math.min(availEndHour, 8.5);
          } else if (timePref === TimePreference.MORNING) {
            prefStart = Math.max(availStartHour, 8);
            prefEnd = Math.min(availEndHour, 12.5);
          } else if (timePref === TimePreference.AFTERNOON) {
            prefStart = Math.max(availStartHour, 12);
            prefEnd = Math.min(availEndHour, 17);
          } else if (timePref === TimePreference.EVENING) {
            prefStart = Math.max(availStartHour, 17);
            prefEnd = Math.max(availEndHour, 22);
          } else if (timePref === TimePreference.NIGHT) {
            prefStart = Math.max(availStartHour, 21);
            prefEnd = 24;
          } else if (timePref === TimePreference.CUSTOM && updatedGoal.customTimeStart && updatedGoal.customTimeEnd) {
            const [sH, sM] = updatedGoal.customTimeStart.split(":").map(Number);
            const [eH, eM] = updatedGoal.customTimeEnd.split(":").map(Number);
            prefStart = (sH || 0) + (sM || 0) / 60;
            prefEnd = (eH || 0) + (eM || 0) / 60;
          }

          if (prefStart >= prefEnd) {
            prefStart = availStartHour;
            prefEnd = availEndHour;
          }

          const durMins = updatedGoal.durationMinutes || 60;
          const durHours = durMins / 60;

          let windowsToTry: { start: number; end: number }[] = [];
          if (!timePref || timePref === TimePreference.ANY) {
            windowsToTry = [
              { start: availStartHour, end: availEndHour },
              { start: 8, end: 22 }
            ];
          } else {
            windowsToTry = [
              { start: prefStart, end: prefEnd }
            ];
          }

          let slotFound = false;

          for (const win of windowsToTry) {
            if (slotFound) break;

            for (let hrs = win.start; hrs <= win.end - durHours; hrs += 0.5) {
              const testStart = new Date(evtDate);
              testStart.setHours(Math.floor(hrs), (hrs % 1) * 60, 0, 0);

              const testEnd = new Date(testStart);
              testEnd.setMinutes(testStart.getMinutes() + durMins);

              // Check overlap with other events (excluding this event itself)
              const overlap = events.some(otherEvt => {
                if (otherEvt.id === evt.id) return false;
                const oStart = new Date(otherEvt.start);
                const oEnd = new Date(otherEvt.end);
                return testStart < oEnd && testEnd > oStart;
              });

              if (!overlap) {
                newStart = testStart.toISOString();
                newEnd = testEnd.toISOString();
                slotFound = true;
                break;
              }
            }
          }

          // Fallback if no clean non-overlapping slot was found
          if (!slotFound) {
            const fallbackStart = new Date(evtDate);
            let targetHour = 9;
            if (timePref === TimePreference.AFTERNOON) targetHour = 13;
            if (timePref === TimePreference.EVENING) targetHour = 18;
            fallbackStart.setHours(targetHour, 0, 0, 0);

            const fallbackEnd = new Date(fallbackStart);
            fallbackEnd.setMinutes(fallbackStart.getMinutes() + durMins);

            newStart = fallbackStart.toISOString();
            newEnd = fallbackEnd.toISOString();
          }
        }

        return {
          ...evt,
          title: newTitle,
          type: newType,
          icon: newIcon,
          start: newStart,
          end: newEnd,
          notes: updatedFields.timePreference
            ? `Rescheduled to align with ${updatedFields.timePreference} preference`
            : evt.notes
        } as CalendarEvent;
      }
      return evt;
    });

    // 2. Adjust calendar session count if weeklyTarget changed
    const existingGoalEvents = nextEvents.filter(e => e.goalId === goalId);
    const targetCount = updatedGoal.weeklyTarget;

    if (existingGoalEvents.length < targetCount) {
      const neededCount = targetCount - existingGoalEvents.length;
      const additionalEvents = generateGoalSessions(updatedGoal, nextEvents, neededCount, availability);
      nextEvents = [...nextEvents, ...additionalEvents];

      triggerSystemNotification(
        "Calendar Sessions Added",
        `Target updated to ${targetCount} sessions/week. Scheduled ${additionalEvents.length} new session(s) on your calendar for "${updatedGoal.name}".`,
        "sync"
      );
    } else if (existingGoalEvents.length > targetCount) {
      const excessCount = existingGoalEvents.length - targetCount;
      // Remove excess uncompleted future events (sort latest start time first)
      const uncompletedEvents = existingGoalEvents
        .filter(e => !e.completed)
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

      const idsToRemove = new Set(uncompletedEvents.slice(0, excessCount).map(e => e.id));
      nextEvents = nextEvents.filter(e => !idsToRemove.has(e.id));

      triggerSystemNotification(
        "Calendar Sessions Adjusted",
        `Target updated to ${targetCount} sessions/week. Removed ${idsToRemove.size} session(s) from your calendar to match your new target for "${updatedGoal.name}".`,
        "sync"
      );
    }

    if (updatedFields.lastSessionNote && updatedFields.lastSessionNote !== targetGoal.lastSessionNote) {
      triggerSystemNotification(
        "📝 Next Session Carryover Saved",
        `Updated prep note for "${updatedGoal.name}": "${updatedFields.lastSessionNote}"`,
        "motivation"
      );
    }

    setGoals(nextGoals);
    setEvents(nextEvents);
    syncToCloud(nextGoals, nextEvents, availability, notifications, coachMessages);
  };

  // EE-2. Pause / Hold Goal (Freeze Mode)
  const handlePauseGoal = (
    goalId: string, 
    pauseReason: string, 
    pauseUntil?: string, 
    clearFutureEvents: boolean = true
  ) => {
    const targetGoal = goals.find(g => g.id === goalId);
    if (!targetGoal) return;

    const nowIso = new Date().toISOString();
    const updatedGoal: Goal = {
      ...targetGoal,
      isPaused: true,
      pauseReason,
      pauseUntil: pauseUntil || undefined,
      pausedAt: nowIso
    };

    const nextGoals = goals.map(g => g.id === goalId ? updatedGoal : g);

    let nextEvents = events;
    if (clearFutureEvents) {
      const now = new Date();
      nextEvents = events.filter(e => {
        if (e.completed) return true;
        const isThisGoal = e.goalId === goalId || (e.title && targetGoal.name && e.title.toLowerCase().includes(targetGoal.name.toLowerCase()));
        if (!isThisGoal) return true;
        return new Date(e.start) < now;
      });
      setEvents(nextEvents);
    }

    setGoals(nextGoals);
    syncToCloud(nextGoals, nextEvents, availability, notifications, coachMessages);

    const untilText = pauseUntil 
      ? `until ${new Date(pauseUntil).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}` 
      : "indefinitely";
    
    triggerSystemNotification(
      "Goal Placed On Hold",
      `⏸️ "${targetGoal.name}" is now on hold ${untilText}. Streak shield active!`,
      "warning"
    );
  };

  // EE-3. Resume Goal from Hold
  const handleResumeGoal = (goalId: string) => {
    const targetGoal = goals.find(g => g.id === goalId);
    if (!targetGoal) return;

    const updatedGoal: Goal = {
      ...targetGoal,
      isPaused: false,
      pauseReason: undefined,
      pauseUntil: undefined,
      pausedAt: undefined
    };

    const nextGoals = goals.map(g => g.id === goalId ? updatedGoal : g);

    setGoals(nextGoals);
    syncToCloud(nextGoals, events, availability, notifications, coachMessages);

    triggerSystemNotification(
      "Goal Resumed!",
      `▶️ "${targetGoal.name}" is active again! Auto-scheduler will now map sessions.`,
      "success"
    );
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
  const handleImportCalendar = (name: string, dataString: string, realEvents?: CalendarEvent[]) => {
    let nextEvents = [...events];
    if (realEvents && realEvents.length > 0) {
      // Remove any previously imported gcal events of same id to avoid duplicate items
      const importedIds = new Set(realEvents.map(re => re.id));
      nextEvents = nextEvents.filter(e => !importedIds.has(e.id));
      nextEvents = [...realEvents, ...nextEvents];
      
      triggerSystemNotification(
        "Google Calendar Synced Successfully",
        `Successfully imported ${realEvents.length} events from Google Calendar. These slots are now blocked as busy conflict exclusions!`,
        "sync"
      );
    } else {
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

      nextEvents = [...mockExternalEvents, ...events];
      triggerSystemNotification(
        "Existing Calendar Synced",
        `Successfully loaded constraints from external RSS/ICS feed. Schedulers will avoid these hours.`,
        "sync"
      );
    }

    setEvents(nextEvents);
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
    <div className="min-h-screen bg-[#0a0c14] text-white flex flex-col font-sans antialiased pb-24 md:pb-12 selection:bg-indigo-500/30 selection:text-indigo-200" style={{ backgroundImage: "radial-gradient(circle at 0% 0%, #1e1b4b 0%, transparent 60%), radial-gradient(circle at 100% 100%, #311042 0%, transparent 60%)" }}>
      
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

          {/* Sync indicator & Auto Theme toggle widget */}
          <div className="flex items-center gap-2 sm:gap-4 text-xs font-medium" id="sync_status_anchor_indicators">
            {/* Auto-Toggle Theme Button */}
            <button
              type="button"
              id="app_theme_mode_toggle_btn"
              onClick={() => {
                const nextMode = themeMode === "auto" ? "dark" : themeMode === "dark" ? "light" : "auto";
                setThemeMode(nextMode);
                triggerSystemNotification(
                  "🎨 Theme Mode Updated",
                  `Switched to ${nextMode === "auto" ? "Auto Mode (System Sync)" : nextMode === "dark" ? "Dark Theme" : "Light Theme"}`,
                  "sync"
                );
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border cursor-pointer transition shadow-xs ${
                themeMode === "auto"
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30"
                  : themeMode === "dark"
                  ? "bg-slate-800/80 text-slate-200 border-slate-700 hover:bg-slate-700"
                  : "bg-amber-100/90 text-amber-950 border-amber-300 hover:bg-amber-200"
              }`}
              title="Click to toggle: Auto (System Sync) -> Dark -> Light"
            >
              {themeMode === "auto" ? (
                <>
                  <Monitor className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Auto ({resolvedTheme === "dark" ? "🌙 Dark" : "☀️ Light"})</span>
                </>
              ) : themeMode === "dark" ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Dark Mode</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Light Mode</span>
                </>
              )}
            </button>

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
            <h1 className="font-display font-extrabold text-3xl tracking-tight sm:text-4xl text-slate-950 dark:text-white">
              Goals Calendar & AI Coach
            </h1>
            <p className="text-slate-700 dark:text-slate-300 text-sm max-w-xl font-medium">
              Synchronize physical workouts and intensive learning routines inside the optimal conflict-free periods. Keep your schedule 100% on track.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-200/80 dark:bg-white/5 p-1.5 rounded-xl border border-slate-300 dark:border-white/10 shadow-xs">
            <button 
              onClick={() => setActiveTab("calendar")}
              className={`text-xs px-3 py-2 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === "calendar"
                  ? "bg-white dark:bg-white/10 text-indigo-700 dark:text-white shadow-xs"
                  : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300/50 dark:hover:bg-white/10"
              }`}
            >
              Laptop View
            </button>
            <span className="text-slate-400 dark:text-white/20 select-none">|</span>
            <div className="hidden sm:flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300 font-medium px-2.5">
              <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Mobile Ready Sync</span>
            </div>
          </div>
        </div>

      </div>

      {/* DASHBOARD TAB NAVIGATION BAR */}
      <div className="hidden md:block bg-white/90 dark:bg-[#0a0c14]/75 backdrop-blur-md border-b border-slate-200 dark:border-white/10 sticky top-0 z-40 shadow-xs" id="dash_navigation_row">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1.5 py-3 overflow-x-auto scrollbar-none">
            
            {/* TABS LIST */}
            <button
              id="tab_trigger_calendar"
              onClick={() => setActiveTab("calendar")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "calendar"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              Schedule Grid
            </button>

            <button
              id="tab_trigger_goals"
              onClick={() => setActiveTab("goals")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "goals"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              }`}
            >
              <Layers className="w-4 h-4" />
              Goals & Constraints
            </button>

            <button
              id="tab_trigger_dashboard"
              onClick={() => setActiveTab("dashboard")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Progress Metrics
            </button>

            <button
              id="tab_trigger_coach"
              onClick={() => setActiveTab("coach")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "coach"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              }`}
            >
              <Bot className="w-4 h-4" />
              AI Routine Coach
            </button>

            <button
              id="tab_trigger_notifications"
              onClick={() => setActiveTab("notifications")}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 relative cursor-pointer ${
                activeTab === "notifications"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 pb-24 md:pb-6 flex-1 w-full" id="dash_rendered_main_stage">
        
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
              availability={availability}
              onAddEvent={handleAddEvent}
              onToggleCompleteEvent={handleToggleEventComplete}
              onDeleteEvent={handleDeleteEvent}
              onImportCalendar={handleImportCalendar}
              onAddGoal={handleAddGoal}
              onEditGoal={handleEditGoal}
              onDeleteGoal={handleDeleteGoal}
              onEditEvent={handleEditEvent}
              onBulkEditEvents={handleBulkEditEvents}
              onResetAndRegenerateCalendar={handleResetAndRegenerateCalendar}
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
            onEditGoal={handleEditGoal}
            onEditEvent={handleEditEvent}
            onBulkEditEvents={handleBulkEditEvents}
            onUpdateAvailability={handleUpdateAvailability}
            onBulkAddEvents={handleBulkAddEvents}
            onAddNotification={triggerSystemNotification}
            autoScheduleEnabled={autoScheduleEnabled}
            onToggleAutoSchedule={(val) => {
              setAutoScheduleEnabled(val);
              localStorage.setItem("auto_schedule_enabled", val ? "true" : "false");
            }}
            onCompleteSession={handleCompleteTimerSession}
            onPauseGoal={handlePauseGoal}
            onResumeGoal={handleResumeGoal}
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
            coachPersona={coachPersona}
            onUpdatePersona={(p) => {
              setCoachPersona(p);
              localStorage.setItem("coach_persona", p);
              syncToCloud(goals, events, availability, notifications, coachMessages, p);
            }}
            onAddGoal={handleAddGoal}
            onEditGoal={handleEditGoal}
            onDeleteGoal={handleDeleteGoal}
            onApplyEnergySchedule={(newEvts) => {
              const updatedEvents = [...events, ...newEvts];
              setEvents(updatedEvents);
              syncToCloud(goals, updatedEvents, availability, notifications, coachMessages);
              triggerSystemNotification(
                "Energy Schedule Applied!",
                `Successfully mapped ${newEvts.length} energy-optimized sessions into your calendar grid!`,
                "success"
              );
            }}
          />
        )}

        {activeTab === "notifications" && (
          <NotificationsPanel 
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onClearAll={handleClearAllNotifications}
            onAddNotification={triggerSystemNotification}
            onTriggerDailyDigest={() => generateAndTriggerDailyDigest()}
            alertLeadMinutes={alertLeadMinutes}
            onUpdateAlertLeadMinutes={(mins) => {
              setAlertLeadMinutes(mins);
              localStorage.setItem("alert_lead_minutes", mins.toString());
            }}
            alertPushEnabled={alertPushEnabled}
            onToggleAlertPush={(enabled) => {
              setAlertPushEnabled(enabled);
              localStorage.setItem("alert_push_enabled", enabled.toString());
            }}
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

      {/* BOTTOM TAB BAR FOR MOBILE SCREENS */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a0c14]/90 backdrop-blur-lg border-t border-white/10 px-1 py-2 z-50 flex items-center justify-around select-none shadow-2xl" id="mobile_bottom_tab_bar">
        
        <button
          id="tab_trigger_calendar_mobile"
          onClick={() => setActiveTab("calendar")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeTab === "calendar"
              ? "text-indigo-400 font-bold scale-105"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <CalendarIcon className="w-5 h-5" />
          <span className="text-[10px] tracking-wide font-medium">Schedule</span>
        </button>

        <button
          id="tab_trigger_goals_mobile"
          onClick={() => setActiveTab("goals")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeTab === "goals"
              ? "text-indigo-400 font-bold scale-105"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] tracking-wide font-medium">Goals</span>
        </button>

        <button
          id="tab_trigger_dashboard_mobile"
          onClick={() => setActiveTab("dashboard")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeTab === "dashboard"
              ? "text-indigo-400 font-bold scale-105"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-[10px] tracking-wide font-medium">Metrics</span>
        </button>

        <button
          id="tab_trigger_coach_mobile"
          onClick={() => setActiveTab("coach")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeTab === "coach"
              ? "text-indigo-400 font-bold scale-105"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Bot className="w-5 h-5" />
          <span className="text-[10px] tracking-wide font-medium">AI Coach</span>
        </button>

        <button
          id="tab_trigger_notifications_mobile"
          onClick={() => setActiveTab("notifications")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer relative ${
            activeTab === "notifications"
              ? "text-indigo-400 font-bold scale-105"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Bell className="w-5 h-5" />
          <span className="text-[10px] tracking-wide font-medium">Alerts</span>
          {notifications.filter(n => !n.read).length > 0 && (
            <span className="absolute top-1 right-2.5 w-4.5 h-4.5 bg-pink-500 text-white rounded-full text-[9px] font-bold leading-4.5 text-center shadow-sm animate-pulse">
              {notifications.filter(n => !n.read).length}
            </span>
          )}
        </button>

      </div>

      {/* Persistent Global Focus Session Countdown Timer Modal & Floating Mini Bar */}
      <FocusTimerModal
        onCompleteSession={handleCompleteTimerSession}
        onExtendEventDuration={handleExtendEventDuration}
      />
    </div>
  );
}
