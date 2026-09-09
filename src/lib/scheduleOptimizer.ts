import { CalendarEvent, Goal, GoalPriority, TimePreference, UserEnergyProfile, EnergyLevel } from "../types";
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
 * 3. MASTER SANITIZER & OPTIMIZER:
 * First cleans duplicates (1 session max per goal per day),
 * then re-aligns time slots by priority and cognitive energy zones.
 */
export function sanitizeAndOptimizeSchedule(
  events: CalendarEvent[],
  goals: Goal[],
  energyProfile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE
): { 
  optimizedEvents: CalendarEvent[]; 
  duplicatesRemoved: number; 
  priorityAdjusted: number;
  slumpAdjusted: number;
  buffersAdded: number;
} {
  const { deduplicated, removedCount } = deduplicateDailyGoalEvents(events, goals);
  const { alignedEvents, changedCount, slumpAdjusted, buffersAdded } = alignDailyEventsByPriority(deduplicated, goals, energyProfile);
  return {
    optimizedEvents: alignedEvents,
    duplicatesRemoved: removedCount,
    priorityAdjusted: changedCount,
    slumpAdjusted,
    buffersAdded
  };
}
