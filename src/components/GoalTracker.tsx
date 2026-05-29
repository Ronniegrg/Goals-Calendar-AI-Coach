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
  Settings
} from "lucide-react";
import { Goal, GoalType, TimePreference, AvailabilityWindow, CalendarEvent } from "../types";

interface GoalTrackerProps {
  goals: Goal[];
  availability: AvailabilityWindow[];
  events: CalendarEvent[];
  onAddGoal: (goal: Omit<Goal, "id" | "completedCount" | "createdAt">) => void;
  onDeleteGoal: (goalId: string) => void;
  onUpdateAvailability: (avail: AvailabilityWindow[]) => void;
  onBulkAddEvents: (newEvents: CalendarEvent[]) => void;
  onAddNotification: (title: string, message: string, type: "upcoming" | "warning" | "motivation" | "success" | "sync") => void;
}

export default function GoalTracker({
  goals,
  availability,
  events,
  onAddGoal,
  onDeleteGoal,
  onUpdateAvailability,
  onBulkAddEvents,
  onAddNotification
}: GoalTrackerProps) {
  // Goal Form State
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<GoalType>(GoalType.WORKOUT);
  const [category, setCategory] = useState("");
  const [weeklyTarget, setWeeklyTarget] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [timePreference, setTimePreference] = useState<TimePreference>(TimePreference.ANY);
  const [color, setColor] = useState("#f43f5e");

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

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onAddGoal({
      name,
      type,
      category: category.trim() || (type === GoalType.WORKOUT ? "Fitness" : "Learning"),
      weeklyTarget,
      durationMinutes,
      timePreference,
      color
    });

    // Reset Form
    setName("");
    setCategory("");
    setWeeklyTarget(3);
    setDurationMinutes(60);
    setTimePreference(TimePreference.ANY);
    setShowAddGoal(false);
    onAddNotification(
      "Goal Created Successfully",
      `New goal "${name}" added! Press 'Run Smart Auto-Scheduler' to plot slots.`,
      "success"
    );
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
              type: goal.type === GoalType.WORKOUT ? "workout" : "study",
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
        <div className="space-y-1 text-center md:text-left">
          <h3 className="font-sans font-bold text-lg tracking-tight flex items-center justify-center md:justify-start gap-2">
            <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
            AI Smart Goal Scheduler
          </h3>
          <p className="text-indigo-100 text-xs">
            Scan your week's goals and map them dynamically against free slots within your availability. 100% collision-free.
          </p>
        </div>
        <button
          id="trigger_auto_schedule_solver"
          onClick={handleAutoSchedule}
          className="bg-indigo-600 hover:bg-indigo-700 text-white border border-white/20 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all shrink-0 uppercase tracking-wider cursor-pointer"
        >
          Run Smart Auto-Scheduler
        </button>
      </div>

      {/* SECTION 2: GOALS CATALOG */}
      <div id="goals_catalog_card" className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
          <div>
            <h3 className="font-sans font-semibold text-white text-base">Workout & Study Goals</h3>
            <p className="text-xs text-slate-300 font-medium">Define target frequencies, duration windows, and options.</p>
          </div>
          <button
            id="toggle_add_goal_form_btn"
            onClick={() => setShowAddGoal(!showAddGoal)}
            className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/20 text-indigo-300 px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add New Goal
          </button>
        </div>

        {/* Add Goal Form Container */}
        {showAddGoal && (
          <form onSubmit={handleCreateGoal} className="bg-white/5 p-4 rounded-xl mb-4 border border-white/10 space-y-3.5">
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
                    className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white"
                  >
                    <option value={GoalType.WORKOUT} className="bg-[#0f111a]">Workout Focus</option>
                    <option value={GoalType.STUDY} className="bg-[#0f111a]">Study Focus</option>
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
                <select
                  id="goal_freq_select"
                  value={weeklyTarget}
                  onChange={(e) => setWeeklyTarget(Number(e.target.value))}
                  className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white"
                >
                  <option value={1} className="bg-[#0f111a]">1 time per week</option>
                  <option value={2} className="bg-[#0f111a]">2 times per week</option>
                  <option value={3} className="bg-[#0f111a]">3 times per week</option>
                  <option value={4} className="bg-[#0f111a]">4 times per week</option>
                  <option value={5} className="bg-[#0f111a]">5 times per week</option>
                </select>
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
                  onClick={() => setShowAddGoal(false)}
                  className="text-xs px-3 py-1.5 text-slate-400 hover:text-white font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit_new_goal_btn"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 border border-white/5 rounded-lg font-bold shadow-lg shadow-indigo-600/20 transition cursor-pointer"
                >
                  Create Goal Object
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
                      <button
                        id={`delete_goal_btn_${g.id}`}
                        onClick={() => onDeleteGoal(g.id)}
                        className="text-slate-400 hover:text-red-400 opacity-60 hover:opacity-100 p-1 rounded transition cursor-pointer"
                        title="Delete Goal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h4 className="font-sans font-bold text-xs text-white tracking-tight leading-tight pt-1">
                      {g.name}
                    </h4>

                    {/* Goal Description Parameters list details */}
                    <div className="text-[10px] text-slate-300 space-y-0.5 font-medium select-none pt-1">
                      <p className="flex items-center gap-1">
                        {g.type === GoalType.WORKOUT ? <Activity className="w-3.5 h-3.5 text-rose-400" /> : <BookOpen className="w-3.5 h-3.5 text-cyan-400" />}
                        {g.weeklyTarget} sessions per week
                      </p>
                      <p className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {g.durationMinutes} mins each ({g.timePreference} preference)
                      </p>
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
