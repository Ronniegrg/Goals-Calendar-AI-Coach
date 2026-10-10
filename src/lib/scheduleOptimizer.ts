import { CalendarEvent, Goal, GoalPriority, TimePreference, UserEnergyProfile, EnergyLevel, AvailabilityWindow, DailyBurnoutLimits } from "../types";
import { 
  inferGoalEnergyLevel, 
  getEnergyLevelForHour, 
  getEnergyZoneForHour, 
  DEFAULT_USER_ENERGY_PROFILE 
} from "./energyProfile";

export const getPriorityScore = (priority?: GoalPriority | string): number => {
  if (!priority) return 1;
  const p = priority.toLowerCase().trim();
  if (p === "critical") return 3;
  if (p === "important") return 2;
  return 1;
};

export const getEnergyLevelScore = (level?: EnergyLevel): number => {
  if (level === "deep_focus") return 3;
  if (level === "moderate") return 2;
  if (level === "light_recharge") return 1;
  return 2;
};

/**
 * Returns minimum preferred start hour (0-24) based on goal timePreference
 */
export function getGoalMinStartHour(goal?: Goal): number | null {
  if (!goal || !goal.timePreference || goal.timePreference === TimePreference.ANY) return null;
  if (goal.timePreference === TimePreference.EARLY_MORNING) return 5;
  if (goal.timePreference === TimePreference.MORNING) return 8;
  if (goal.timePreference === TimePreference.AFTERNOON) return 12;
  if (goal.timePreference === TimePreference.EVENING) return 17;
  if (goal.timePreference === TimePreference.NIGHT) return 21;
  if (goal.timePreference === TimePreference.CUSTOM && goal.customTimeStart) {
    const [h, m] = goal.customTimeStart.split(":").map(Number);
    return (h || 0) + (m || 0) / 60;
  }
  return null;
}

export const findGoalForEvent = (evt: CalendarEvent, goals: Goal[]): Goal | undefined => {
  if (!evt) return undefined;
  if (evt.goalId) {
    const byId = goals.find(g => g.id === evt.goalId);
    if (byId) return byId;
  }
  const cleanTitle = (evt.title || "").trim().toLowerCase();
  if (!cleanTitle) return undefined;
  return goals.find(g => {
    const cleanGoal = (g.name || "").trim().toLowerCase();
    return cleanGoal && (cleanTitle === cleanGoal || cleanTitle.includes(cleanGoal) || cleanGoal.includes(cleanTitle));
  });
};

/**
 * 1. DEDUPLICATE DAILY EVENTS:
 * Strictly enforces AT MOST ONE uncompleted event per goal per calendar day.
 * If multiple uncompleted events exist for the same goal on the same day (e.g. from shifts or repeats),
 * redundant duplicates are pruned. Completed events and external events are always preserved.
 */
export function deduplicateDailyGoalEvents(
  events: CalendarEvent[],
  goals: Goal[]
): { deduplicated: CalendarEvent[]; removedCount: number } {
  const dayGoalMap = new Map<string, boolean>();
  const result: CalendarEvent[] = [];
  let removedCount = 0;

  // Sort completed first (so completed takes precedent on a day), then by start time
  const sorted = [...events].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  for (const evt of sorted) {
    if (evt.type === "external") {
      result.push(evt);
      continue;
    }

    const parentGoal = findGoalForEvent(evt, goals);
    const goalId = parentGoal ? parentGoal.id : (evt.title || "").trim().toLowerCase();
    const dayKey = new Date(evt.start).toDateString();
    const mapKey = `${dayKey}:::${goalId}`;

    if (evt.completed) {
      result.push(evt);
      dayGoalMap.set(mapKey, true);
    } else {
      if (dayGoalMap.has(mapKey)) {
        // Redundant duplicate on the same day!
        removedCount++;
      } else {
        dayGoalMap.set(mapKey, true);
        result.push(evt);
      }
    }
  }

  // Restore chronological order
  result.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { deduplicated: result, removedCount };
}

/**
 * 2. ALIGN DAILY EVENTS BY PRIORITY & COGNITIVE ENERGY PROFILE:
 * On ANY calendar day where multiple uncompleted goal sessions are scheduled,
 * strictly enforces that:
 *   - Critical goals (Priority 3) are scheduled BEFORE Important goals (Priority 2).
 *   - Important goals (Priority 2) are scheduled BEFORE Normal/Undefined goals (Priority 1).
 *   - Within equal priority tiers, Deep Focus sessions are prioritized for Peak Focus energy zones.
 *   - Enforces biological Slump Protection (shifting high strain study out of post-lunch dips if enabled).
 *   - Inserts cognitive buffer minutes between intense sessions.
 */
export function alignDailyEventsByPriority(
  events: CalendarEvent[],
  goals: Goal[],
  energyProfile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE
): { 
  alignedEvents: CalendarEvent[]; 
  changedCount: number; 
  slumpAdjusted: number; 
  buffersAdded: number; 
} {
  // Group events by calendar day
  const dayMap = new Map<string, CalendarEvent[]>();
  events.forEach(e => {
    const d = new Date(e.start).toDateString();
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push(e);
  });

  let changedCount = 0;
  let slumpAdjusted = 0;
  let buffersAdded = 0;
  const finalEvents: CalendarEvent[] = [];

  for (const [, dayEvts] of dayMap.entries()) {
    const fixedEvts = dayEvts.filter(e => e.completed || e.type === "external");
    const uncompletedGoalEvts = dayEvts.filter(e => !e.completed && e.type !== "external");

    if (uncompletedGoalEvts.length <= 1) {
      finalEvents.push(...dayEvts);
      continue;
    }

    // Sort chronologically
    const chrono = [...uncompletedGoalEvts].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    // Check if there is an inversion in priority or energy alignment or time preference
    let hasInversion = false;
    for (let i = 0; i < chrono.length - 1; i++) {
      const g1 = findGoalForEvent(chrono[i], goals);
      const g2 = findGoalForEvent(chrono[i + 1], goals);
      const p1 = getPriorityScore(g1?.priority);
      const p2 = getPriorityScore(g2?.priority);
      if (p1 < p2) {
        hasInversion = true;
        break;
      }
      if (p1 === p2) {
        const e1 = getEnergyLevelScore(chrono[i].energyLevel || (g1 ? inferGoalEnergyLevel(g1) : "moderate"));
        const e2 = getEnergyLevelScore(chrono[i + 1].energyLevel || (g2 ? inferGoalEnergyLevel(g2) : "moderate"));
        if (e1 < e2) {
          hasInversion = true;
          break;
        }
      }
    }

    let hasTimePrefViolation = false;
    for (const evt of uncompletedGoalEvts) {
      const g = findGoalForEvent(evt, goals);
      const minH = getGoalMinStartHour(g);
      if (minH !== null) {
        const evtDate = new Date(evt.start);
        const hour = evtDate.getHours() + evtDate.getMinutes() / 60;
        if (hour < minH) {
          hasTimePrefViolation = true;
          break;
        }
      }
    }

    if (!hasInversion && !hasTimePrefViolation) {
      finalEvents.push(...dayEvts);
      continue;
    }

    // Sort: Priority descending, then Energy Level descending (Deep Focus > Moderate > Recharge)
    const prioritized = [...uncompletedGoalEvts].sort((a, b) => {
      const gA = findGoalForEvent(a, goals);
      const gB = findGoalForEvent(b, goals);
      const pA = getPriorityScore(gA?.priority);
      const pB = getPriorityScore(gB?.priority);
      if (pB !== pA) return pB - pA;

      const eA = getEnergyLevelScore(a.energyLevel || (gA ? inferGoalEnergyLevel(gA) : "moderate"));
      const eB = getEnergyLevelScore(b.energyLevel || (gB ? inferGoalEnergyLevel(gB) : "moderate"));
      if (eB !== eA) return eB - eA;

      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    // Slots available in chronological order
    const originalSlots = chrono.map(e => ({
      start: new Date(e.start).getTime(),
      end: new Date(e.end).getTime()
    }));

    let currentStart = originalSlots[0].start;
    let prevEnergyLevel: EnergyLevel | null = null;

    const remapped: CalendarEvent[] = prioritized.map((evt, idx) => {
      const g = findGoalForEvent(evt, goals);
      const energyLevel = evt.energyLevel || (g ? inferGoalEnergyLevel(g) : "moderate");
      const dur = new Date(evt.end).getTime() - new Date(evt.start).getTime();
      const minH = getGoalMinStartHour(g);

      // Add cognitive recovery buffer if following a deep focus session
      if (prevEnergyLevel === "deep_focus" && energyProfile?.autoBufferMinutes) {
        currentStart += energyProfile.autoBufferMinutes * 60 * 1000;
        buffersAdded++;
      }

      if (minH !== null) {
        const prefDate = new Date(currentStart);
        prefDate.setHours(Math.floor(minH), Math.round((minH % 1) * 60), 0, 0);
        if (currentStart < prefDate.getTime()) {
          currentStart = prefDate.getTime();
        }
      }

      // Slump Protection: if deep_focus lands in a slump/recharge zone, try shifting past slump
      if (energyProfile?.slumpProtection && energyLevel === "deep_focus") {
        const checkDate = new Date(currentStart);
        const checkHour = checkDate.getHours() + (checkDate.getMinutes() / 60);
        const zone = getEnergyZoneForHour(checkHour, energyProfile);
        if (zone && zone.level === "light_recharge" && zone.endHour > checkHour && zone.endHour <= 19) {
          const shiftDate = new Date(currentStart);
          shiftDate.setHours(Math.floor(zone.endHour), Math.round((zone.endHour % 1) * 60), 0, 0);
          // Only shift if it doesn't push past 21:00
          if (shiftDate.getHours() < 21) {
            currentStart = shiftDate.getTime();
            slumpAdjusted++;
          }
        }
      }

      const slotStart = new Date(currentStart);
      const slotEnd = new Date(currentStart + dur);
      currentStart = currentStart + dur;

      if (idx + 1 < originalSlots.length && originalSlots[idx + 1].start > currentStart) {
        currentStart = originalSlots[idx + 1].start;
      }

      prevEnergyLevel = energyLevel;

      return {
        ...evt,
        energyLevel,
        start: slotStart.toISOString(),
        end: slotEnd.toISOString()
      };
    });

    changedCount += remapped.length;
    finalEvents.push(...fixedEvts, ...remapped);
  }

  finalEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { alignedEvents: finalEvents, changedCount, slumpAdjusted, buffersAdded };
}

/**
 * 2b. ENFORCE WEEKLY TARGET QUOTAS:
 * Strictly ensures non-daily goals (e.g. 4x/week, 5x/week, 3x/week) do NOT exceed
 * their weekly quota in any calendar week. If uncompleted sessions exceed the quota,
 * prunes excess sessions from the most crowded days so that evenings are not overloaded.
 */
export function enforceWeeklyTargetQuotas(
  events: CalendarEvent[],
  goals: Goal[]
): { prunedEvents: CalendarEvent[]; excessRemovedCount: number } {
  if (!goals || goals.length === 0 || events.length === 0) {
    return { prunedEvents: events, excessRemovedCount: 0 };
  }

  // Group events by calendar week (Sunday 00:00:00 to Saturday 23:59:59)
  const weekMap = new Map<string, CalendarEvent[]>();
  events.forEach(evt => {
    const d = new Date(evt.start);
    const sWeek = new Date(d);
    sWeek.setDate(d.getDate() - d.getDay());
    sWeek.setHours(0, 0, 0, 0);
    const key = sWeek.toISOString();
    if (!weekMap.has(key)) weekMap.set(key, []);
    weekMap.get(key)!.push(evt);
  });

  const idsToPrune = new Set<string>();
  let excessRemovedCount = 0;

  for (const [, weekEvts] of weekMap.entries()) {
    // For each goal, check its quota in this week
    for (const goal of goals) {
      if (!goal || goal.weeklyTarget >= 7) continue; // 7x goals can run every day

      const goalNameClean = (goal.name || "").trim().toLowerCase();
      const goalEvts = weekEvts.filter(e => {
        if (e.type === "external") return false;
        const isThisGoal = e.goalId === goal.id || (e.title && e.title.trim().toLowerCase().includes(goalNameClean));
        return isThisGoal;
      });

      if (goalEvts.length <= goal.weeklyTarget) continue;

      // We have excess sessions in this week!
      // Completed sessions are permanent anchors and cannot be deleted
      const completedSessions = goalEvts.filter(e => e.completed);
      const uncompletedSessions = goalEvts.filter(e => !e.completed);

      const allowedUncompleted = Math.max(0, goal.weeklyTarget - completedSessions.length);
      const excessCount = uncompletedSessions.length - allowedUncompleted;

      if (excessCount > 0) {
        // Count how many total events are on each day in this week
        const dayCrowdCount = new Map<string, number>();
        weekEvts.forEach(we => {
          const dayKey = new Date(we.start).toDateString();
          dayCrowdCount.set(dayKey, (dayCrowdCount.get(dayKey) || 0) + 1);
        });

        // Sort uncompleted sessions of this goal:
        // Prioritize pruning from the days with the highest crowd count (e.g. days with 6 or 7 goals)
        // and latest dates in the week
        const sortedForPruning = [...uncompletedSessions].sort((a, b) => {
          const crowdA = dayCrowdCount.get(new Date(a.start).toDateString()) || 0;
          const crowdB = dayCrowdCount.get(new Date(b.start).toDateString()) || 0;
          if (crowdB !== crowdA) return crowdB - crowdA; // most crowded day pruned first!
          return new Date(b.start).getTime() - new Date(a.start).getTime();
        });

        const toRemove = sortedForPruning.slice(0, excessCount);
        toRemove.forEach(ev => {
          idsToPrune.add(ev.id);
          excessRemovedCount++;
        });
      }
    }
  }

  const prunedEvents = events.filter(e => !idsToPrune.has(e.id));
  return { prunedEvents, excessRemovedCount };
}

/**
 * 3. MASTER SANITIZER & OPTIMIZER:
 * First cleans duplicates (1 session max per goal per day),
 * prunes excess weekly target quotas,
 * then re-aligns time slots by priority and cognitive energy zones.
 */
export function sanitizeAndOptimizeSchedule(
  events: CalendarEvent[],
  goals: Goal[],
  energyProfile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE
): { 
  optimizedEvents: CalendarEvent[]; 
  duplicatesRemoved: number; 
  quotaExcessRemoved: number;
  priorityAdjusted: number;
  slumpAdjusted: number;
  buffersAdded: number;
} {
  const { deduplicated, removedCount } = deduplicateDailyGoalEvents(events, goals);
  const { prunedEvents, excessRemovedCount } = enforceWeeklyTargetQuotas(deduplicated, goals);
  const { alignedEvents, changedCount, slumpAdjusted, buffersAdded } = alignDailyEventsByPriority(prunedEvents, goals, energyProfile);
  return {
    optimizedEvents: alignedEvents,
    duplicatesRemoved: removedCount,
    quotaExcessRemoved: excessRemovedCount,
    priorityAdjusted: changedCount,
    slumpAdjusted,
    buffersAdded
  };
}

/**
 * 4. AUTONOMOUS SELF-HEALING ENGINE (AI SCHEDULE AUTOPILOT):
 * Continuously and autonomously protects and heals schedule discrepancies:
 *  - Overdue Incomplete Sessions: Identifies uncompleted sessions whose end time has passed
 *    and shifts them forward into upcoming open availability slots (starting from today/now).
 *  - Collisions & Overlaps: Automatically deconflicts overlapping events with 15-minute buffers.
 */
export function autonomousSelfHealCalendar({
  events,
  goals,
  availability,
  energyProfile = DEFAULT_USER_ENERGY_PROFILE,
  maxDaysAhead = 14,
  burnoutLimits,
  pacing = "balanced"
}: {
  events: CalendarEvent[];
  goals: Goal[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
  maxDaysAhead?: number;
  burnoutLimits?: DailyBurnoutLimits;
  pacing?: "gentle" | "balanced" | "aggressive";
}): {
  healedEvents: CalendarEvent[];
  overdueRescheduledCount: number;
  collisionsResolvedCount: number;
  details: string[];
} {
  const now = new Date();
  const nowMs = now.getTime();
  const details: string[] = [];
  let overdueRescheduledCount = 0;
  let collisionsResolvedCount = 0;

  // Clone list
  let currentList: CalendarEvent[] = events.map(e => ({ ...e }));

  // Helper: check if a time window collides with existing events in currentList
  const hasOverlap = (startMs: number, endMs: number, ignoreEventId?: string) => {
    return currentList.some(ev => {
      if (ignoreEventId && ev.id === ignoreEventId) return false;
      const evStart = new Date(ev.start).getTime();
      const evEnd = new Date(ev.end).getTime();
      return startMs < evEnd && endMs > evStart;
    });
  };

  // Helper: find next open slot for a given duration starting from targetDay
  const findOpenSlot = (durationMs: number, startFromDate: Date, preferredMinHour: number | null = null, ignoreId?: string): { start: Date; end: Date } | null => {
    for (let dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset++) {
      const day = new Date(startFromDate);
      day.setDate(startFromDate.getDate() + dayOffset);
      const dayOfWeek = day.getDay();

      // Check burnout limits for this day
      if (burnoutLimits) {
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const maxDailyCap = isWeekend ? (burnoutLimits.weekendMaxHours || 5) : (burnoutLimits.weekdayMaxHours || 3.5);
        const dayDateStr = day.toDateString();
        const existingHoursOnDay = currentList
          .filter(e => !e.completed && new Date(e.start).toDateString() === dayDateStr && e.id !== ignoreId)
          .reduce((acc, ev) => acc + (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / (3600 * 1000), 0);

        if (existingHoursOnDay + (durationMs / (3600 * 1000)) > maxDailyCap) {
          continue; // Skip overloaded day to safeguard cognitive capacity
        }
      }

      const avail = availability.find(a => a.dayOfWeek === dayOfWeek && a.active);
      let dayStartH = 8;
      let dayEndH = 22;
      if (avail) {
        const [sh] = avail.startTime.split(":").map(Number);
        const [eh] = avail.endTime.split(":").map(Number);
        dayStartH = sh || 8;
        dayEndH = eh || 22;
      }

      const isToday = day.toDateString() === now.toDateString();
      let earliestHour = isToday ? Math.max(dayStartH, now.getHours() + (now.getMinutes() + 15) / 60) : dayStartH;
      if (preferredMinHour !== null) {
        earliestHour = Math.max(earliestHour, preferredMinHour);
      }

      for (let h = earliestHour; h <= dayEndH - (durationMs / (3600 * 1000)); h += 0.5) {
        const slotStart = new Date(day);
        slotStart.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
        const slotStartMs = slotStart.getTime();
        const slotEndMs = slotStartMs + durationMs;

        if (slotStartMs <= nowMs + 10 * 60 * 1000) continue;

        if (!hasOverlap(slotStartMs, slotEndMs, ignoreId)) {
          return { start: slotStart, end: new Date(slotEndMs) };
        }
      }
    }
    return null;
  };

  // STEP 1: RESCHEDULE PAST OVERDUE SESSIONS
  const pastOverdue = currentList.filter(
    e => !e.completed && e.type !== "external" && new Date(e.end).getTime() < nowMs
  );

  for (const ov of pastOverdue) {
    const parentGoal = findGoalForEvent(ov, goals);
    const durMs = Math.max(15 * 60 * 1000, new Date(ov.end).getTime() - new Date(ov.start).getTime());
    const minH = getGoalMinStartHour(parentGoal);

    // Find next open slot starting from now
    const nextSlot = findOpenSlot(durMs, now, minH, ov.id);
    if (nextSlot) {
      ov.start = nextSlot.start.toISOString();
      ov.end = nextSlot.end.toISOString();
      ov.notes = (ov.notes ? ov.notes + " | " : "") + "🤖 AI Autopilot: Rescheduled overdue session";
      overdueRescheduledCount++;
      details.push(
        `Rescheduled missed session "${ov.title}" to ${nextSlot.start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at ${nextSlot.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      );
    }
  }

  // STEP 2: DECONFLICT ANY OVERLAPPING SESSIONS (if balanced or aggressive)
  if (pacing !== "gentle") {
    const sorted = [...currentList].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    for (let i = 0; i < sorted.length; i++) {
      const evA = sorted[i];
      if (evA.completed) continue;

      for (let j = i + 1; j < sorted.length; j++) {
        const evB = sorted[j];
        if (evB.completed) continue;

        const aStart = new Date(evA.start).getTime();
        const aEnd = new Date(evA.end).getTime();
        const bStart = new Date(evB.start).getTime();
        const bEnd = new Date(evB.end).getTime();

        // Check collision
        if (aStart < bEnd && aEnd > bStart) {
          // Decide which event to shift: preserve external or higher-priority goal
          const gA = findGoalForEvent(evA, goals);
          const gB = findGoalForEvent(evB, goals);
          const scoreA = evA.type === "external" ? 999 : getPriorityScore(gA?.priority);
          const scoreB = evB.type === "external" ? 999 : getPriorityScore(gB?.priority);

          const eventToShift = scoreA >= scoreB ? evB : evA;
          const durMs = Math.max(15 * 60 * 1000, new Date(eventToShift.end).getTime() - new Date(eventToShift.start).getTime());
          const shiftGoal = findGoalForEvent(eventToShift, goals);
          const minH = getGoalMinStartHour(shiftGoal);

          // Find new open slot starting right after the collision
          const shiftFrom = new Date(Math.max(nowMs, aEnd + 15 * 60 * 1000));
          const newSlot = findOpenSlot(durMs, shiftFrom, minH, eventToShift.id);
          if (newSlot) {
            eventToShift.start = newSlot.start.toISOString();
            eventToShift.end = newSlot.end.toISOString();
            eventToShift.notes = (eventToShift.notes ? eventToShift.notes + " | " : "") + "🤖 AI Autopilot: Deconflicted overlap";
            collisionsResolvedCount++;
            details.push(`Deconflicted overlap for "${eventToShift.title}" with 15m buffer`);
          }
        }
      }
    }
  }

  // Deduplicate and re-align
  const { optimizedEvents } = sanitizeAndOptimizeSchedule(currentList, goals, energyProfile);

  return {
    healedEvents: optimizedEvents,
    overdueRescheduledCount,
    collisionsResolvedCount,
    details
  };
}

/**
 * 5. LIFE HAPPENED / TAKE TODAY OFF ENGINE:
 * Gracefully takes all uncompleted events scheduled for today and pushes them into
 * tomorrow and subsequent open availability slots this week, preserving completed progress.
 */
export function handleLifeHappenedToday({
  events,
  goals,
  availability,
  energyProfile = DEFAULT_USER_ENERGY_PROFILE,
  burnoutLimits,
  targetDate
}: {
  events: CalendarEvent[];
  goals: Goal[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
  burnoutLimits?: DailyBurnoutLimits;
  targetDate?: Date;
}): {
  updatedEvents: CalendarEvent[];
  movedCount: number;
  details: string[];
} {
  const chosenDate = targetDate ? new Date(targetDate) : new Date();
  const targetDayStr = chosenDate.toDateString();
  const dayAfter = new Date(chosenDate);
  dayAfter.setDate(chosenDate.getDate() + 1);
  dayAfter.setHours(8, 0, 0, 0);

  const currentList = events.map(e => ({ ...e }));
  const todayPending = currentList.filter(
    e => !e.completed && e.type !== "external" && new Date(e.start).toDateString() === targetDayStr
  );

  let movedCount = 0;
  const details: string[] = [];

  for (const ev of todayPending) {
    const parentGoal = findGoalForEvent(ev, goals);
    const durMs = Math.max(15 * 60 * 1000, new Date(ev.end).getTime() - new Date(ev.start).getTime());
    const minH = getGoalMinStartHour(parentGoal);

    // Look for slot starting from dayAfter
    let targetDayOffset = 1;
    let placed = false;

    while (targetDayOffset <= 6 && !placed) {
      const candDay = new Date(dayAfter);
      candDay.setDate(dayAfter.getDate() + (targetDayOffset - 1));
      const dayOfWeek = candDay.getDay();

      const avail = availability.find(a => a.dayOfWeek === dayOfWeek && a.active);
      if (avail) {
        const [sh] = avail.startTime.split(":").map(Number);
        const [eh] = avail.endTime.split(":").map(Number);
        const startH = Math.max(sh || 8, minH || 8);
        const endH = eh || 21;

        for (let h = startH; h <= endH - (durMs / (3600 * 1000)); h += 0.5) {
          const s = new Date(candDay);
          s.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
          const eTime = s.getTime() + durMs;

          const collides = currentList.some(other => {
            if (other.id === ev.id) return false;
            return s.getTime() < new Date(other.end).getTime() && eTime > new Date(other.start).getTime();
          });

          if (!collides) {
            ev.start = s.toISOString();
            ev.end = new Date(eTime).toISOString();
            ev.notes = (ev.notes ? ev.notes + " | " : "") + "🌴 Shifted: Life Happened / Rest Day";
            placed = true;
            movedCount++;
            details.push(`Moved "${ev.title}" to ${s.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at ${s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
            break;
          }
        }
      }
      targetDayOffset++;
    }
  }

  const { optimizedEvents } = sanitizeAndOptimizeSchedule(currentList, goals, energyProfile);

  return {
    updatedEvents: optimizedEvents,
    movedCount,
    details
  };
}

/**
 * 6. ICALENDAR (.ICS) EXPORT ENGINE:
 * Generates RFC 5545 standard .ics file format for Google Calendar, Apple Calendar, and Outlook.
 */
export function exportCalendarToICS(events: CalendarEvent[]): string {
  const formatICSDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };

  const escapeICS = (str: string) => {
    return (str || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  };

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Study Scheduler//Autonomous Schedule Engine//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:AI Study & Life Schedule"
  ];

  events.forEach(ev => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:study-scheduler-${ev.id}@ais-app`);
    lines.push(`DTSTAMP:${formatICSDate(new Date().toISOString())}`);
    lines.push(`DTSTART:${formatICSDate(ev.start)}`);
    lines.push(`DTEND:${formatICSDate(ev.end)}`);
    lines.push(`SUMMARY:${escapeICS(ev.title)}`);

    let description = ev.notes || "Autonomous Study Session";
    if (ev.activeChapterTitle) {
      description += `\\nActive Chapter: ${ev.activeChapterTitle}`;
    }
    if (ev.keyTakeaway) {
      description += `\\nReflection Takeaway: ${ev.keyTakeaway}`;
    }
    lines.push(`DESCRIPTION:${escapeICS(description)}`);
    lines.push(`STATUS:${ev.completed ? "CONFIRMED" : "TENTATIVE"}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICSFile(events: CalendarEvent[], filename = "My_Study_Schedule.ics") {
  const icsData = exportCalendarToICS(events);
  const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 7. SPACED REPETITION RETENTION SCHEDULER:
 * Creates quick 15-minute recall booster blocks at +3 and +7 days to cement long-term memory.
 */
export function scheduleSpacedRepetitionBlocks({
  completedEvent,
  goal,
  events,
  availability
}: {
  completedEvent: CalendarEvent;
  goal?: Goal;
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
}): {
  addedReviewEvents: CalendarEvent[];
} {
  const result: CalendarEvent[] = [];
  const intervals = [3, 7]; // Days ahead for retention intervals

  for (const intervalDays of intervals) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + intervalDays);
    const dayOfWeek = targetDate.getDay();

    const avail = availability.find(a => a.dayOfWeek === dayOfWeek && a.active);
    let startH = 9;
    let endH = 20;
    if (avail) {
      const [sh] = avail.startTime.split(":").map(Number);
      const [eh] = avail.endTime.split(":").map(Number);
      startH = sh || 9;
      endH = eh || 20;
    }

    // Try finding an open 15-minute slot
    for (let h = startH; h <= endH - 0.25; h += 0.5) {
      const s = new Date(targetDate);
      s.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      const eTime = s.getTime() + 15 * 60 * 1000;

      const collides = events.some(other => {
        return s.getTime() < new Date(other.end).getTime() && eTime > new Date(other.start).getTime();
      }) || result.some(r => {
        return s.getTime() < new Date(r.end).getTime() && eTime > new Date(r.start).getTime();
      });

      if (!collides) {
        result.push({
          id: `review_${completedEvent.id}_d${intervalDays}_${Date.now()}`,
          title: `Refresher (${intervalDays}d Recall): ${completedEvent.title}`,
          type: "study",
          start: s.toISOString(),
          end: new Date(eTime).toISOString(),
          completed: false,
          goalId: completedEvent.goalId,
          notes: `🧠 Spaced Repetition Refresher (${intervalDays}-day interval) for "${completedEvent.title}"`,
          isBufferCatchUp: true,
          energyLevel: "light_recharge"
        });
        break;
      }
    }
  }

  return { addedReviewEvents: result };
}
