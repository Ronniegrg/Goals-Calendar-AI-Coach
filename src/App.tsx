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

  // Core application data (Loaded from server / cloud with localStorage fallback)
  const defaultPythonGoal: Goal = {
    id: "g_python",
    name: "Python & AI Engineering Masterclass",
    type: GoalType.STUDY,
    category: "Python Dev",
    weeklyTarget: 4,
    durationMinutes: 60,
    timePreference: TimePreference.EVENING,
    completedCount: 2,
    color: "#3b82f6",
    createdAt: new Date().toISOString()
  };

  const ensurePythonGoal = (goalsList: Goal[]): Goal[] => {
    if (!Array.isArray(goalsList)) return [defaultPythonGoal];
    if (!goalsList.some(g => g.name && g.name.toLowerCase().includes("python"))) {
      return [...goalsList, defaultPythonGoal];
    }
    return goalsList;
  };

  const [goals, setGoals] = useState<Goal[]>(() => {
    try {
      const val = localStorage.getItem("cached_goals");
      const list = val ? JSON.parse(val) : [];
      return ensurePythonGoal(list);
    } catch {
      return [defaultPythonGoal];
    }
  });
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    try {
      const val = localStorage.getItem("cached_events");
      return val ? JSON.parse(val) : [];
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
          const localGoalsList = cachedGoalsRaw ? JSON.parse(cachedGoalsRaw) : [];
          const hasLocalData = Array.isArray(localGoalsList) && localGoalsList.length > 0;
          
          // Detect if the cloud is blank/default but local storage contains customized user records
          const cloudIsDefaultOrReset = !data.goals || data.goals.length === 0 || 
            (data.goals.length === 3 && data.goals.some(g => g.id === "g1" && g.name === "Morning Cardio & Stretch"));

          if (data.coachPersona) {
            setCoachPersona(data.coachPersona);
            localStorage.setItem("coach_persona", data.coachPersona);
          }

          if (hasLocalData && (localLastUpdated > cloudLastSynced || cloudIsDefaultOrReset)) {
            console.log("Local cache is newer/more complete than cloud. Restoring user custom goals to server...");
            
            const localEvents = JSON.parse(localStorage.getItem("cached_events") || "[]");
            const localAvailability = JSON.parse(localStorage.getItem("cached_availability") || "[]");
            const localNotifications = JSON.parse(localStorage.getItem("cached_notifications") || "[]");
            const localCoachMessages = JSON.parse(localStorage.getItem("cached_coachMessages") || "[]");

            const finalGoals = ensurePythonGoal(localGoalsList);
            setGoals(finalGoals);
            setEvents(localEvents.map((e: any) => ({ ...e, title: e.title.replace(" (Auto-Scheduled)", "") })));
            if (localAvailability.length > 0) {
              setAvailability(localAvailability);
            } else {
              setAvailability(data.availability || []);
            }
            setNotifications(localNotifications);
            setCoachMessages(localCoachMessages);

            // Sync up local data to cloud database
            await syncToCloud(
              finalGoals,
              localEvents,
              localAvailability.length > 0 ? localAvailability : data.availability || [],
              localNotifications,
              localCoachMessages,
              (localStorage.getItem("coach_persona") as "mentor" | "drill" | "data") || "mentor"
            );
          } else {
            // Cloud is newer, load cloud data and update local cache
            const cloudGoals = ensurePythonGoal(data.goals || []);
            setGoals(cloudGoals);
            setEvents((data.events || []).map((e: any) => ({ ...e, title: e.title.replace(" (Auto-Scheduled)", "") })));
            setAvailability(data.availability || []);
            setNotifications(data.notifications || []);
            setCoachMessages(data.coachMessages || []);
            if (data.coachPersona) {
              setCoachPersona(data.coachPersona);
              localStorage.setItem("coach_persona", data.coachPersona);
            }

            localStorage.setItem("cached_goals", JSON.stringify(cloudGoals));
            localStorage.setItem("cached_events", JSON.stringify(data.events || []));
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

  // 3b. Automated Background Scheduling Trigger Engine
  const triggerAutoScheduler = (
    currentGoals: Goal[],
    currentEvents: CalendarEvent[],
    currentAvailability: AvailabilityWindow[]
  ) => {
    if (currentGoals.length === 0 || currentAvailability.length === 0) return;

    const newScheduledEvents: CalendarEvent[] = [];
    let scheduledCount = 0;
    const today = new Date();

    currentGoals.forEach(goal => {
      const currentScheduled = currentEvents.filter(e => e.goalId === goal.id).length;
      const neededCount = Math.max(goal.weeklyTarget - currentScheduled, 0);

      if (neededCount === 0) return;

      let successBooked = 0;

      for (let dayOffset = 1; dayOffset <= 8; dayOffset++) {
        if (successBooked >= neededCount) break;

        const targetDay = new Date(today);
        targetDay.setDate(today.getDate() + dayOffset);
        const dayOfWeek = targetDay.getDay();

        const availDay = currentAvailability.find(a => a.dayOfWeek === dayOfWeek);
        if (!availDay || !availDay.active) continue;

        const maxSessionsPerDay = goal.weeklyTarget > 7 ? Math.ceil(goal.weeklyTarget / 7) : 1;
        const targetDayString = targetDay.toDateString();
        const sessionsOnTargetDay = [...currentEvents, ...newScheduledEvents].filter(evt => {
          if (evt.goalId !== goal.id) return false;
          return new Date(evt.start).toDateString() === targetDayString;
        }).length;

        if (sessionsOnTargetDay >= maxSessionsPerDay) continue;

        let [availStartHour, availStartMin] = availDay.startTime.split(":").map(Number);
        let [availEndHour, availEndMin] = availDay.endTime.split(":").map(Number);

        if (goal.timePreference === TimePreference.MORNING) {
          availStartHour = Math.max(availStartHour, 8);
          availEndHour = Math.min(availEndHour, 12);
        } else if (goal.timePreference === TimePreference.AFTERNOON) {
          availStartHour = Math.max(availStartHour, 12);
          availEndHour = Math.min(availEndHour, 17);
        } else if (goal.timePreference === TimePreference.EVENING) {
          availStartHour = Math.max(availStartHour, 17);
          availEndHour = Math.min(availEndHour, 21);
        }

        const blockDurationHours = goal.durationMinutes / 60;

        for (let hrs = availStartHour; hrs <= availEndHour - blockDurationHours; hrs += 1.5) {
          if (successBooked >= neededCount) break;

          const dayCount = [...currentEvents, ...newScheduledEvents].filter(evt => {
            if (evt.goalId !== goal.id) return false;
            return new Date(evt.start).toDateString() === targetDayString;
          }).length;

          if (dayCount >= maxSessionsPerDay) {
            break;
          }

          const slotStart = new Date(targetDay);
          slotStart.setHours(Math.floor(hrs), (hrs % 1) * 60, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotStart.getMinutes() + goal.durationMinutes);

          const overlap = [...currentEvents, ...newScheduledEvents].some(evt => {
            const evtStart = new Date(evt.start);
            const evtEnd = new Date(evt.end);
            return (slotStart < evtEnd && slotEnd > evtStart);
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
              notes: `Intelligently mapped in conflict-free time on ${slotStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            });
            successBooked++;
            scheduledCount++;
          }
        }
      }
    });

    if (newScheduledEvents.length > 0) {
      const nextEvents = [...newScheduledEvents, ...currentEvents];
      setEvents(nextEvents);
      syncToCloud(currentGoals, nextEvents, currentAvailability, notifications, coachMessages);
      triggerSystemNotification(
        "Auto-Scheduler Sync",
        `⚡ Automated Auto-Scheduler successfully mapped ${scheduledCount} new session blocks completely without interference!`,
        "success"
      );
    }
  };

  useEffect(() => {
    if (!autoScheduleEnabled || goals.length === 0 || availability.length === 0) return;

    // Check if there are any unallocated goals
    const hasUnallocated = goals.some(goal => {
      const currentScheduled = events.filter(e => e.goalId === goal.id).length;
      return goal.weeklyTarget > currentScheduled;
    });

    if (hasUnallocated) {
      const timer = setTimeout(() => {
        triggerAutoScheduler(goals, events, availability);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [goals, events, availability, autoScheduleEnabled]);

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

  // CC. Edit existing calendar event attributes
  const handleEditEvent = (id: string, updatedFields: Partial<Omit<CalendarEvent, "id">>) => {
    let nextGoals = [...goals];
    const nextEvents = events.map(evt => {
      if (evt.id === id) {
        if (updatedFields.completed !== undefined && evt.completed !== updatedFields.completed && evt.goalId) {
          const toggleVal = updatedFields.completed;
          nextGoals = goals.map(g => {
            if (g.id === evt.goalId) {
              const countChange = toggleVal ? 1 : -1;
              return { ...g, completedCount: Math.max(g.completedCount + countChange, 0) };
            }
            return g;
          });
          
          if (toggleVal) {
            triggerSystemNotification(
              "Session Achieved!",
              `Success: "${updatedFields.title || evt.title}" marked as done!`,
              "success"
            );
          }
        }
        return { ...evt, ...updatedFields } as CalendarEvent;
      }
      return evt;
    });

    setEvents(nextEvents);
    setGoals(nextGoals);
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

  // EE. Edit custom Goal in cloud database
  const handleEditGoal = (goalId: string, updatedFields: Partial<Omit<Goal, "id" | "createdAt">>) => {
    const nextGoals = goals.map(g => 
      g.id === goalId ? { ...g, ...updatedFields } : g
    );

    // If name or type changed, synchronize tied event attributes
    let nextEvents = [...events];
    if (updatedFields.name !== undefined || updatedFields.type !== undefined) {
      const oldGoal = goals.find(g => g.id === goalId);
      nextEvents = events.map(evt => {
        if (evt.goalId === goalId) {
          let newTitle = evt.title;
          if (oldGoal && updatedFields.name !== undefined) {
            newTitle = updatedFields.name;
          }
          return {
            ...evt,
            title: newTitle,
            type: updatedFields.type !== undefined
              ? (updatedFields.type === GoalType.WORKOUT ? "workout" :
                 updatedFields.type === GoalType.STUDY ? "study" :
                 updatedFields.type === GoalType.JOB_SEARCH ? "job_search" :
                 updatedFields.type === GoalType.SIDE_PROJECT ? "side_project" :
                 updatedFields.type === GoalType.ROUTINE ? "routine" :
                 "personal")
              : evt.type
          } as CalendarEvent;
        }
        return evt;
      });
    }

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
      <div className="hidden md:block bg-[#0a0c14]/75 backdrop-blur-md border-b border-white/10 sticky top-0 z-40" id="dash_navigation_row">
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
              onAddGoal={handleAddGoal}
              onEditGoal={handleEditGoal}
              onDeleteGoal={handleDeleteGoal}
              onEditEvent={handleEditEvent}
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
            onUpdateAvailability={handleUpdateAvailability}
            onBulkAddEvents={handleBulkAddEvents}
            onAddNotification={triggerSystemNotification}
            autoScheduleEnabled={autoScheduleEnabled}
            onToggleAutoSchedule={(val) => {
              setAutoScheduleEnabled(val);
              localStorage.setItem("auto_schedule_enabled", val ? "true" : "false");
            }}
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
          />
        )}

        {activeTab === "notifications" && (
          <NotificationsPanel 
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onClearAll={handleClearAllNotifications}
            onAddNotification={triggerSystemNotification}
            onTriggerDailyDigest={() => generateAndTriggerDailyDigest()}
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

    </div>
  );
}
