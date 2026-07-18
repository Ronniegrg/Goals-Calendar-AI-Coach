import React, { useState } from "react";
import { 
  Plus, 
  Trash2, 
  Activity, 
  BookOpen, 
  Clock, 
  Sparkles, 
  Check, 
  Calendar,
  Layers,
  Settings,
  Pencil,
  Briefcase,
  Laptop,
  RotateCw,
  Smile,
  X
} from "lucide-react";
import { Goal, GoalType, TimePreference, AvailabilityWindow, CalendarEvent, SubTask } from "../types";

// Premium Goal Quick-Add Templates Presets
const PRESET_TEMPLATES = [
  {
    name: "Couch to 5K Workout",
    type: GoalType.WORKOUT,
    category: "Cardio",
    weeklyTarget: 3,
    durationMinutes: 30,
    timePreference: TimePreference.MORNING,
    color: "#f43f5e",
    description: "Build stamina with walk-run sequences 3x a week."
  },
  {
    name: "Full Stack Coding Block",
    type: GoalType.STUDY,
    category: "Dev Skills",
    weeklyTarget: 4,
    durationMinutes: 90,
    timePreference: TimePreference.AFTERNOON,
    color: "#06b6d4",
    description: "Deep-dive intensive learning sessions."
  },
  {
    name: "Job Applications & Networking",
    type: GoalType.JOB_SEARCH,
    category: "Job Applications",
    weeklyTarget: 5,
    durationMinutes: 60,
    timePreference: TimePreference.MORNING,
    color: "#3b82f6",
    description: "Submit applications, tailor resumes, and connect with recruiters."
  },
  {
    name: "Interview Prep & Mocking",
    type: GoalType.JOB_SEARCH,
    category: "Career Prep",
    weeklyTarget: 3,
    durationMinutes: 90,
    timePreference: TimePreference.AFTERNOON,
    color: "#8b5cf6",
    description: "Practice technical challenges and mock behavioral sessions."
  },
  {
    name: "SaaS Side Project Dev",
    type: GoalType.SIDE_PROJECT,
    category: "Side Project",
    weeklyTarget: 4,
    durationMinutes: 120,
    timePreference: TimePreference.EVENING,
    color: "#ec4899",
    description: "Design modules, write clean code, and ship features."
  },
  {
    name: "Weekly Household Care",
    type: GoalType.ROUTINE,
    category: "Routine Care",
    weeklyTarget: 2,
    durationMinutes: 45,
    timePreference: TimePreference.AFTERNOON,
    color: "#10b981",
    description: "Deep clean spaces, digital decluttering, and organizing."
  },
  {
    name: "Read Non-Fiction Books",
    type: GoalType.PERSONAL,
    category: "Intellectual",
    weeklyTarget: 7,
    durationMinutes: 30,
    timePreference: TimePreference.EVENING,
    color: "#f59e0b",
    description: "Immersive reading to broaden professional and life acumen."
  }
];

interface GoalTrackerProps {
  goals: Goal[];
  availability: AvailabilityWindow[];
  events: CalendarEvent[];
  onAddGoal: (goal: Omit<Goal, "id" | "completedCount" | "createdAt">) => void;
  onDeleteGoal: (goalId: string) => void;
  onEditGoal: (goalId: string, updatedFields: Partial<Omit<Goal, "id" | "completedCount" | "createdAt">>) => void;
  onUpdateAvailability: (avail: AvailabilityWindow[]) => void;
  onBulkAddEvents: (newEvents: CalendarEvent[]) => void;
  onAddNotification: (title: string, message: string, type: "upcoming" | "warning" | "motivation" | "success" | "sync") => void;
  autoScheduleEnabled?: boolean;
  onToggleAutoSchedule?: (val: boolean) => void;
}

export default function GoalTracker({
  goals,
  availability,
  events,
  onAddGoal,
  onDeleteGoal,
  onEditGoal,
  onUpdateAvailability,
  onBulkAddEvents,
  onAddNotification,
  autoScheduleEnabled = true,
  onToggleAutoSchedule
}: GoalTrackerProps) {
  // Goal Form State
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<GoalType>(GoalType.WORKOUT);
  const [category, setCategory] = useState("");
  const [weeklyTarget, setWeeklyTarget] = useState(3);
  const [isCustomTarget, setIsCustomTarget] = useState(false);
  const [customTargetVal, setCustomTargetVal] = useState("10");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [timePreference, setTimePreference] = useState<TimePreference>(TimePreference.ANY);
  const [color, setColor] = useState("#f43f5e");

  const handleApplyPresetTemplate = (preset: typeof PRESET_TEMPLATES[number]) => {
    setName(preset.name);
    setType(preset.type);
    setCategory(preset.category);
    setWeeklyTarget(preset.weeklyTarget);
    setIsCustomTarget(false);
    setDurationMinutes(preset.durationMinutes);
    setTimePreference(preset.timePreference);
    setColor(preset.color);
    setEditingGoalId(null);
    setShowAddGoal(true);
    
    // Smooth scroll down to the form anchor
    setTimeout(() => {
      document.getElementById("add_goal_form_anchor")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // State to manage availability input edits
  const [editAvailability, setEditAvailability] = useState<AvailabilityWindow[]>([...availability]);
  const [isEditingAvail, setIsEditingAvail] = useState(false);

  // Quick preset colors
  const presetColors = [
    "#f43f5e", // rose
    "#06b6d4", // cyan
    "#8b5cf6", // purple
    "#10b981", // emerald
    "#f59e0b", // amber
    "#3b82f6"  // blue
  ];

  const handleSubmitGoalForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingGoalId) {
      onEditGoal(editingGoalId, {
        name,
        type,
        category: category.trim() || (
          type === GoalType.WORKOUT ? "Fitness" : 
          type === GoalType.STUDY ? "Learning" : 
          type === GoalType.JOB_SEARCH ? "Career Applications" : 
          type === GoalType.SIDE_PROJECT ? "Side Project" : 
          type === GoalType.ROUTINE ? "Routine Habits" : 
          "Self Care"
        ),
        weeklyTarget,
        durationMinutes,
        timePreference,
        color
      });

      onAddNotification(
        "Goal Updated Successfully",
        `Goal "${name}" was updated successfully.`,
        "success"
      );
    } else {
      onAddGoal({
        name,
        type,
        category: category.trim() || (
          type === GoalType.WORKOUT ? "Fitness" : 
          type === GoalType.STUDY ? "Learning" : 
          type === GoalType.JOB_SEARCH ? "Career Applications" : 
          type === GoalType.SIDE_PROJECT ? "Side Project" : 
          type === GoalType.ROUTINE ? "Routine Habits" : 
          "Self Care"
        ),
        weeklyTarget,
        durationMinutes,
        timePreference,
        color
      });

      onAddNotification(
        "Goal Created Successfully",
        `New goal "${name}" added! Press 'Run Smart Auto-Scheduler' to plot slots.`,
        "success"
      );
    }

    // Reset Form
    setName("");
    setCategory("");
    setWeeklyTarget(3);
    setIsCustomTarget(false);
    setCustomTargetVal("10");
    setDurationMinutes(60);
    setTimePreference(TimePreference.ANY);
    setShowAddGoal(false);
    setEditingGoalId(null);
  };

  const handleAddNewGoalClick = () => {
    if (editingGoalId) {
      setEditingGoalId(null);
      setName("");
      setCategory("");
      setWeeklyTarget(3);
      setIsCustomTarget(false);
      setCustomTargetVal("10");
      setDurationMinutes(60);
      setTimePreference(TimePreference.ANY);
      setColor("#f43f5e");
      setShowAddGoal(true);
    } else {
      setShowAddGoal(!showAddGoal);
    }
  };

  const handleCancelClick = () => {
    setName("");
    setCategory("");
    setWeeklyTarget(3);
    setIsCustomTarget(false);
    setCustomTargetVal("10");
    setDurationMinutes(60);
    setTimePreference(TimePreference.ANY);
    setShowAddGoal(false);
    setEditingGoalId(null);
  };

  const handleStartEdit = (g: Goal) => {
    setEditingGoalId(g.id);
    setName(g.name);
    setType(g.type);
    setCategory(g.category);
    setWeeklyTarget(g.weeklyTarget);
    if (g.weeklyTarget > 7) {
      setIsCustomTarget(true);
      setCustomTargetVal(String(g.weeklyTarget));
    } else {
      setIsCustomTarget(false);
      setCustomTargetVal("10");
    }
    setDurationMinutes(g.durationMinutes);
    setTimePreference(g.timePreference);
    setColor(g.color);
    setShowAddGoal(true);
    
    // Smooth scroll to catalog header form
    const element = document.getElementById("goals_catalog_card");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Availability Change Handlers
  const handleToggleDay = (idx: number) => {
    const updated = editAvailability.map((item, i) => 
      i === idx ? { ...item, active: !item.active } : item
    );
    setEditAvailability(updated);
  };

  const handleTimeChange = (idx: number, field: "startTime" | "endTime", value: string) => {
    const updated = editAvailability.map((item, i) => 
      i === idx ? { ...item, [field]: value } : item
    );
    setEditAvailability(updated);
  };

  const handleSaveAvailability = () => {
    onUpdateAvailability(editAvailability);
    setIsEditingAvail(false);
    onAddNotification(
      "Availability Preset Dynamic Saved",
      "Your weekly scheduling timeline constraint has been synced.",
      "sync"
    );
  };

  // --- AUTOMATIC SCHEDULING ALGORITHM ---
  const handleAutoSchedule = () => {
    const newScheduledEvents: CalendarEvent[] = [];
    let scheduledCount = 0;

    // Start scheduling from tomorrow for next 7 days
    const today = new Date();
    
    // For each goal, determine how many sessions we need to schedule this week
    goals.forEach(goal => {
      // Find count of existing scheduled events for this goal id
      const currentScheduled = events.filter(e => e.goalId === goal.id).length;
      const neededCount = Math.max(goal.weeklyTarget - currentScheduled, 0);

      if (neededCount === 0) return; // already fully booked!

      // Keep counter of successes for this goal
      let successBooked = 0;

      // Try for next 7 days
      for (let dayOffset = 1; dayOffset <= 8; dayOffset++) {
        if (successBooked >= neededCount) break;

        const targetDay = new Date(today);
        targetDay.setDate(today.getDate() + dayOffset);
        const dayOfWeek = targetDay.getDay();

        // Check if day is active in availability
        const availDay = availability.find(a => a.dayOfWeek === dayOfWeek);
        if (!availDay || !availDay.active) continue;

        // Prevent scheduling the same goal multiple times per day (unless frequency target is > 7)
        const maxSessionsPerDay = goal.weeklyTarget > 7 ? Math.ceil(goal.weeklyTarget / 7) : 1;
        const targetDayString = targetDay.toDateString();
        const sessionsOnTargetDay = [...events, ...newScheduledEvents].filter(evt => {
          if (evt.goalId !== goal.id) return false;
          return new Date(evt.start).toDateString() === targetDayString;
        }).length;

        if (sessionsOnTargetDay >= maxSessionsPerDay) continue;

        // Determine hour boundaries based on availability and goal preference
        let [availStartHour, availStartMin] = availDay.startTime.split(":").map(Number);
        let [availEndHour, availEndMin] = availDay.endTime.split(":").map(Number);

        // Map Goal Time Preferences parameters:
        // MORNING = 08:00 - 12:00
        // AFTERNOON = 12:00 - 17:00
        // EVENING = 17:00 - 21:00
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

        // Search hour slots within bounds
        const blockDurationHours = goal.durationMinutes / 60;
        
        for (let hrs = availStartHour; hrs <= availEndHour - blockDurationHours; hrs += 1.5) { // search every 1.5 hour interval
          if (successBooked >= neededCount) break;

          // Prevent scheduling multiple times per day during slot searching
          const dayCount = [...events, ...newScheduledEvents].filter(evt => {
            if (evt.goalId !== goal.id) return false;
            return new Date(evt.start).toDateString() === targetDayString;
          }).length;

          if (dayCount >= maxSessionsPerDay) {
            break; // Reached daily limit, proceed to the next day
          }
          
          const slotStart = new Date(targetDay);
          slotStart.setHours(Math.floor(hrs), (hrs % 1) * 60, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotStart.getMinutes() + goal.durationMinutes);

          // Rule Check: Collision Detection
          // Check overlaps against all existing and newly scheduled events
          const overlap = [...events, ...newScheduledEvents].some(evt => {
            const evtStart = new Date(evt.start);
            const evtEnd = new Date(evt.end);
            return (slotStart < evtEnd && slotEnd > evtStart);
          });

          if (!overlap) {
            // Found a conflict-free slot! Book it.
            newScheduledEvents.push({
              id: `${goal.id}_sch_${Date.now()}_${scheduledCount}`,
              title: `${goal.name} (Auto-Scheduled)`,
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
      onBulkAddEvents(newScheduledEvents);
      onAddNotification(
        "Auto-Scheduler Success",
        `Successfully integrated ${scheduledCount} conflict-free workout and study blocks into your schedule!`,
        "success"
      );
    } else {
      onAddNotification(
        "Auto-Scheduler Notice",
        "Your calendar is already fully optimized and synced or has no pending targets.",
        "upcoming"
      );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* SECTION 1: AUTO SCHEDULER TRIGGER */}
      <div id="planner_solver_widget" className="bg-gradient-to-r from-indigo-600/30 to-indigo-800/35 border border-white/10 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-md">
        <div className="space-y-1 text-center md:text-left flex-1">
          <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
            <h3 className="font-sans font-bold text-lg tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
              AI Smart Goal Scheduler
            </h3>
            {autoScheduleEnabled && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
                ● Background Auto-Run Active
              </span>
            )}
          </div>
          <p className="text-indigo-100 text-xs">
            Scan your week's goals and map them dynamically against free slots within your availability. 100% collision-free.
            {autoScheduleEnabled && <span className="block mt-1 text-[11px] text-emerald-300 font-medium">⚡ Running silently in the background: New goals/presets will be scheduled instantly without interference!</span>}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0 justify-end">
          {onToggleAutoSchedule && (
            <label className="flex items-center gap-2 bg-[#0d0f19]/80 border border-white/10 hover:border-white/20 px-4 py-2.5 rounded-xl cursor-pointer select-none transition text-xs font-bold text-indigo-200">
              <input
                type="checkbox"
                checked={autoScheduleEnabled}
                onChange={(e) => onToggleAutoSchedule(e.target.checked)}
                className="rounded border-white/20 bg-slate-900 text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span>Autonomous Scheduling</span>
            </label>
          )}
          <button
            id="trigger_auto_schedule_solver"
            onClick={handleAutoSchedule}
            className="bg-indigo-600 hover:bg-indigo-700 text-white border border-white/20 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all shrink-0 uppercase tracking-wider cursor-pointer w-full sm:w-auto text-center"
          >
            Optimize Now
          </button>
        </div>
      </div>

      {/* SECTION 2: GOALS CATALOG */}
      <div id="goals_catalog_card" className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
          <div>
            <h3 className="font-sans font-semibold text-white text-base">Active Routine & Focus Goals</h3>
            <p className="text-xs text-slate-300 font-medium">Define target frequencies, duration windows, and options.</p>
          </div>
          <button
            id="toggle_add_goal_form_btn"
            onClick={handleAddNewGoalClick}
            className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/20 text-indigo-300 px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add New Goal
          </button>
        </div>

        {/* Preset Goal Quick-Add Templates Slider */}
        <div id="goal_presets_slider" className="mb-5 bg-white/5 border border-white/10 p-4 rounded-xl">
          <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-2.5 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-pulse" /> Click to Quick-Add Goal Presets
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3" id="goal_presets_slider_grid">
            {PRESET_TEMPLATES.map((tmpl, idx) => {
              const getBadgeStyles = (type: GoalType) => {
                switch (type) {
                  case GoalType.WORKOUT:
                    return { dot: "bg-rose-500", border: "border-rose-500/20 hover:border-rose-500/40" };
                  case GoalType.STUDY:
                    return { dot: "bg-cyan-500", border: "border-cyan-500/20 hover:border-cyan-500/40" };
                  case GoalType.JOB_SEARCH:
                    return { dot: "bg-blue-500", border: "border-blue-500/20 hover:border-blue-500/40" };
                  case GoalType.SIDE_PROJECT:
                    return { dot: "bg-pink-500", border: "border-pink-500/20 hover:border-pink-500/40" };
                  case GoalType.ROUTINE:
                    return { dot: "bg-emerald-500", border: "border-emerald-500/20 hover:border-emerald-500/40" };
                  case GoalType.PERSONAL:
                    return { dot: "bg-amber-500", border: "border-amber-500/20 hover:border-amber-500/40" };
                  default:
                    return { dot: "bg-purple-500", border: "border-purple-500/20 hover:border-purple-500/40" };
                }
              };
              const { dot: DotBg, border: BorderCol } = getBadgeStyles(tmpl.type);
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => handleApplyPresetTemplate(tmpl)}
                  className={`text-left p-3 rounded-xl border bg-[#0d0f19] ${BorderCol} hover:bg-white/5 cursor-pointer transition flex flex-col justify-between h-full group`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${DotBg}`} />
                      <span className="text-[9px] font-bold text-slate-400 capitalize">{tmpl.category}</span>
                    </div>
                    <h4 className="text-xs font-bold text-white leading-tight group-hover:text-indigo-300 transition">{tmpl.name}</h4>
                    <p className="text-[9px] text-slate-350 mt-1 lines-clamp-2 leading-relaxed">{tmpl.description}</p>
                  </div>
                  
                  <div className="mt-3.5 pt-2 border-t border-white/5 flex items-center justify-between text-[8px] font-mono font-bold text-slate-400">
                    <span>{tmpl.weeklyTarget}x/wk</span>
                    <span>{tmpl.durationMinutes} min</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Add Goal Form Container */}
        {showAddGoal && (
          <form id="add_goal_form_anchor" onSubmit={handleSubmitGoalForm} className="bg-white/5 p-4 rounded-xl mb-4 border border-white/10 space-y-3.5">
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2">
              {editingGoalId ? `Editing Goal: ${name}` : 'Create New Goal'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 mb-1">Goal Name</label>
                <input
                  type="text"
                  required
                  id="goal_name_input"
                  placeholder="e.g. Strength Training, JS Algorithms"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-indigo-400 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 mb-1">Goal Type</label>
                  <select
                    id="goal_type_select"
                    value={type}
                    onChange={(e) => setType(e.target.value as GoalType)}
                    className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white font-semibold"
                  >
                    <option value={GoalType.WORKOUT} className="bg-[#0f111a]">Workout Focus</option>
                    <option value={GoalType.STUDY} className="bg-[#0f111a]">Study Focus</option>
                    <option value={GoalType.JOB_SEARCH} className="bg-[#0f111a]">Job Search Focus</option>
                    <option value={GoalType.SIDE_PROJECT} className="bg-[#0f111a]">Side Project Focus</option>
                    <option value={GoalType.ROUTINE} className="bg-[#0f111a]">Routine / Chores Focus</option>
                    <option value={GoalType.PERSONAL} className="bg-[#0f111a]">Personal Focus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 mb-1">Subcategory</label>
                  <input
                    type="text"
                    id="goal_category_input"
                    placeholder="e.g. Legs, Programming"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-indigo-400 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 mb-1">Weekly Target Frequency</label>
                <div className="flex gap-2">
                  <select
                    id="goal_freq_select"
                    value={isCustomTarget ? "custom" : weeklyTarget}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        setIsCustomTarget(true);
                        setWeeklyTarget(Number(customTargetVal) || 10);
                      } else {
                        setIsCustomTarget(false);
                        setWeeklyTarget(Number(val));
                      }
                    }}
                    className="flex-1 text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white"
                  >
                    <option value={1} className="bg-[#0f111a]">1 time per week</option>
                    <option value={2} className="bg-[#0f111a]">2 times per week</option>
                    <option value={3} className="bg-[#0f111a]">3 times per week</option>
                    <option value={4} className="bg-[#0f111a]">4 times per week</option>
                    <option value={5} className="bg-[#0f111a]">5 times per week</option>
                    <option value={6} className="bg-[#0f111a]">6 times per week</option>
                    <option value={7} className="bg-[#0f111a]">7 times per week (Every Day)</option>
                    <option value="custom" className="bg-[#0f111a]">Custom count per week...</option>
                  </select>
                  
                  {isCustomTarget && (
                    <div className="flex items-center gap-1 shrink-0 w-24">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        id="goal_custom_freq_input"
                        placeholder="e.g. 10"
                        value={customTargetVal}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          setCustomTargetVal(valStr);
                          const valNum = Number(valStr);
                          if (valNum > 0) {
                            setWeeklyTarget(valNum);
                          }
                        }}
                        className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 font-bold"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 mb-1">Session Duration</label>
                <select
                  id="goal_duration_select"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white"
                >
                  <option value={30} className="bg-[#0f111a]">30 Minutes</option>
                  <option value={45} className="bg-[#0f111a]">45 Minutes</option>
                  <option value={60} className="bg-[#0f111a]">1 Hour / 60 mins</option>
                  <option value={90} className="bg-[#0f111a]">1.5 Hours / 90 mins</option>
                  <option value={120} className="bg-[#0f111a]">2 Hours / 120 mins</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 mb-1">Time Preference</label>
                <select
                  id="goal_preference_select"
                  value={timePreference}
                  onChange={(e) => setTimePreference(e.target.value as TimePreference)}
                  className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white"
                >
                  <option value={TimePreference.ANY} className="bg-[#0f111a]">Any hour of the day</option>
                  <option value={TimePreference.MORNING} className="bg-[#0f111a]">Morning (08:00 - 12:00)</option>
                  <option value={TimePreference.AFTERNOON} className="bg-[#0f111a]">Afternoon (12:00 - 17:00)</option>
                  <option value={TimePreference.EVENING} className="bg-[#0f111a]">Evening (17:00 - 21:00)</option>
                </select>
              </div>
            </div>

            {/* Custom Palette options */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-white/5">
              <div className="flex gap-2 items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Marker Color:</span>
                <div className="flex items-center gap-1.5">
                  {presetColors.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setColor(col)}
                      className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                        color === col ? "scale-125 border-white ring-2 ring-indigo-500/40" : "border-transparent"
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelClick}
                  className="text-xs px-3 py-1.5 text-slate-400 hover:text-white font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit_new_goal_btn"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 border border-white/5 rounded-lg font-bold shadow-lg shadow-indigo-600/20 transition cursor-pointer"
                >
                  {editingGoalId ? "Save Goal Changes" : "Create Goal Object"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Goals Grid Catalog */}
        {goals.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            No goals created yet. Use add form to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {goals.map((g) => {
              const countPercent = Math.min(Math.round((g.completedCount / g.weeklyTarget) * 100), 100);
              return (
                <div 
                  key={g.id} 
                  id={`goal_panel_card_${g.id}`}
                  className="border border-white/10 rounded-xl p-4 bg-white/5 flex flex-col justify-between hover:bg-white/10 hover:border-white/20 transition"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: `${g.color}25`, color: g.color }}>
                        {g.category}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          id={`edit_goal_btn_${g.id}`}
                          onClick={() => handleStartEdit(g)}
                          className="text-slate-400 hover:text-indigo-400 opacity-60 hover:opacity-100 p-1 rounded transition cursor-pointer"
                          title="Edit Goal"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`delete_goal_btn_${g.id}`}
                          onClick={() => onDeleteGoal(g.id)}
                          className="text-slate-400 hover:text-red-400 opacity-60 hover:opacity-100 p-1 rounded transition cursor-pointer"
                          title="Delete Goal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h4 className="font-sans font-bold text-xs text-white tracking-tight leading-tight pt-1">
                      {g.name}
                    </h4>

                    {/* Goal Description Parameters list details */}
                    <div className="text-[10px] text-slate-300 space-y-0.5 font-medium select-none pt-1">
                      <p className="flex items-center gap-1">
                        {g.type === GoalType.WORKOUT ? <Activity className="w-3.5 h-3.5 text-rose-400" /> :
                         g.type === GoalType.STUDY ? <BookOpen className="w-3.5 h-3.5 text-cyan-400" /> :
                         g.type === GoalType.JOB_SEARCH ? <Briefcase className="w-3.5 h-3.5 text-blue-400" /> :
                         g.type === GoalType.SIDE_PROJECT ? <Laptop className="w-3.5 h-3.5 text-pink-400" /> :
                         g.type === GoalType.ROUTINE ? <RotateCw className="w-3.5 h-3.5 text-emerald-400" /> :
                         <Smile className="w-3.5 h-3.5 text-amber-400" />}
                        {g.weeklyTarget} sessions per week
                      </p>
                      <p className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {g.durationMinutes} mins each ({g.timePreference} preference)
                      </p>
                    </div>

                    {/* Subtasks Section */}
                    <div className="pt-3 border-t border-white/5 mt-3 space-y-1.5" id={`goal_subtasks_sec_${g.id}`}>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Subtasks / Milestones</span>
                      
                      {g.subtasks && g.subtasks.length > 0 ? (
                        <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                          {g.subtasks.map((sub) => (
                            <div key={sub.id} className="flex items-center justify-between gap-1 group bg-black/15 px-2 py-1 rounded border border-white/5">
                              <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer flex-1 min-w-0 select-none">
                                <input
                                  type="checkbox"
                                  checked={sub.completed}
                                  onChange={() => {
                                    const updatedSubtasks = g.subtasks?.map(s => 
                                      s.id === sub.id ? { ...s, completed: !s.completed } : s
                                    ) || [];
                                    onEditGoal(g.id, { subtasks: updatedSubtasks });
                                  }}
                                  className="rounded border-white/10 text-indigo-600 focus:ring-indigo-500/20 bg-[#0f111a] w-3 h-3 cursor-pointer"
                                />
                                <span className={`truncate ${sub.completed ? "line-through text-slate-500 font-medium" : "font-semibold"}`}>
                                  {sub.title}
                                </span>
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedSubtasks = g.subtasks?.filter(s => s.id !== sub.id) || [];
                                  onEditGoal(g.id, { subtasks: updatedSubtasks });
                                }}
                                className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition p-0.5 cursor-pointer"
                                title="Delete Subtask"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[9px] text-slate-500 italic">No milestones defined yet.</p>
                      )}

                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const input = form.elements.namedItem("subtaskTitle") as HTMLInputElement;
                          const title = input.value.trim();
                          if (!title) return;
                          
                          const newSub: SubTask = {
                            id: `sub_${Date.now()}`,
                            title,
                            completed: false
                          };
                          const updatedSubtasks = [...(g.subtasks || []), newSub];
                          onEditGoal(g.id, { subtasks: updatedSubtasks });
                          input.value = "";
                        }}
                        className="flex items-center gap-1"
                      >
                        <input
                          type="text"
                          name="subtaskTitle"
                          placeholder="Add milestone..."
                          className="flex-1 bg-[#0f111a] text-[10px] p-1.5 border border-white/5 rounded text-white focus:outline-none focus:border-indigo-400 font-semibold"
                        />
                        <button
                          type="submit"
                          className="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white p-1 rounded transition text-[10px] font-bold shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Micro Progress Track */}
                  <div className="space-y-1 pt-4 border-t border-white/10 mt-4">
                    <div className="flex justify-between items-center text-[10px] font-bold select-none text-slate-350">
                      <span>Completed: {g.completedCount} / {g.weeklyTarget}</span>
                      <span>{countPercent}%</span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${countPercent}%`, backgroundColor: g.color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 3: TIMELINE TIMESTAMPS AVAILABILITY MANAGER */}
      <div id="availability_timeline_card" className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
          <div className="space-y-0.5">
            <h3 className="font-sans font-semibold text-white text-base flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-slate-300" />
              Hours of Daily Availability
            </h3>
            <p className="text-xs text-slate-400 font-medium">Configure days and active time blocks for automatic plotting.</p>
          </div>

          {!isEditingAvail ? (
            <button
              id="edit_avail_btn"
              onClick={() => {
                setEditAvailability([...availability]);
                setIsEditingAvail(true);
              }}
              className="text-xs text-slate-300 hover:text-indigo-400 font-semibold flex items-center gap-1 px-3 py-1.5 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 transition cursor-pointer"
            >
              Modify Timeline Constraints
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                id="cancel_avail_btn"
                onClick={() => setIsEditingAvail(false)}
                className="text-xs text-slate-400 hover:text-white font-semibold px-3 py-1.5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="save_avail_btn"
                onClick={handleSaveAvailability}
                className="text-xs bg-indigo-600 hover:bg-indigo-550 text-white font-bold px-3.5 py-1.5 rounded-xl transition cursor-pointer"
              >
                Save Constraints
              </button>
            </div>
          )}
        </div>

        {/* Display and forms of weekly active availability */}
        <div className="space-y-2.5">
          {availability.map((avail, idx) => {
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            
            // Editable/Not editable states
            if (isEditingAvail) {
              const currentEdit = editAvailability[idx] || avail;
              return (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-white/10 bg-white/5 rounded-xl gap-3 text-slate-200">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id={`avail_checkbox_${idx}`}
                      checked={currentEdit.active}
                      onChange={() => handleToggleDay(idx)}
                      className="rounded border-white/10 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-white w-24">{dayNames[avail.dayOfWeek]}</span>
                  </div>

                  {currentEdit.active ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        id={`avail_start_${idx}`}
                        value={currentEdit.startTime}
                        onChange={(e) => handleTimeChange(idx, "startTime", e.target.value)}
                        className="text-xs border border-white/10 p-1.5 rounded bg-white/5 text-white focus:outline-none focus:border-indigo-400"
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <input
                        type="time"
                        id={`avail_end_${idx}`}
                        value={currentEdit.endTime}
                        onChange={(e) => handleTimeChange(idx, "endTime", e.target.value)}
                        className="text-xs border border-white/10 p-1.5 rounded bg-white/5 text-white focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium italic">Unavailable for automatic schedules</span>
                  )}
                </div>
              );
            }

            // Normal Display mode
            return (
              <div key={idx} className="flex items-center justify-between p-3 border border-white/5 rounded-xl bg-white/5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${avail.active ? "bg-emerald-500" : "bg-slate-600"}`} />
                  <span className="text-xs font-semibold text-white w-24">{dayNames[avail.dayOfWeek]}</span>
                </div>

                {avail.active ? (
                  <span className="text-xs text-slate-200 font-mono flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {avail.startTime} - {avail.endTime}
                  </span>
                ) : (
                  <span className="text-xs text-slate-450 font-medium italic">Closed schedule</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
