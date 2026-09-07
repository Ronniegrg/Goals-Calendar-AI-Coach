import { CalendarEvent, Goal, GoalPriority, TimePreference } from "../types";

export const getPriorityScore = (priority?: GoalPriority | string): number => {
  if (!priority) return 1;
  const p = priority.toLowerCase().trim();
  if (p === "critical") return 3;
  if (p === "important") return 2;
  return 1;
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
 * 2. ALIGN DAILY EVENTS BY PRIORITY:
 * On ANY calendar day where multiple uncompleted goal sessions are scheduled,
 * strictly enforces that:
 *   - Critical goals (Priority 3, e.g. IT Support) are scheduled BEFORE Important goals (Priority 2, e.g. Cybersecurity).
 *   - Important goals (Priority 2) are scheduled BEFORE Normal/Undefined goals (Priority 1, e.g. Reactjs, Python, Job Search, Keyboard typing).
 * If a lower priority session is scheduled earlier than a higher priority session on that day,
 * their time slots are re-allocated in strict priority order.
 */
export function alignDailyEventsByPriority(
  events: CalendarEvent[],
  goals: Goal[]
): { alignedEvents: CalendarEvent[]; changedCount: number } {
  // Group events by calendar day
  const dayMap = new Map<string, CalendarEvent[]>();
  events.forEach(e => {
    const d = new Date(e.start).toDateString();
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push(e);
  });

  let changedCount = 0;
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

    // Check if there is an inversion in priority order OR a time preference violation (e.g. morning slot for evening goal)
    let hasInversion = false;
    for (let i = 0; i < chrono.length - 1; i++) {
      const p1 = getPriorityScore(findGoalForEvent(chrono[i], goals)?.priority);
      const p2 = getPriorityScore(findGoalForEvent(chrono[i + 1], goals)?.priority);
      if (p1 < p2) {
        hasInversion = true;
        break;
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

    // Sort by priority descending (Critical=3, Important=2, Normal=1)
    // If priority is equal, maintain original chronological order
    const prioritized = [...uncompletedGoalEvts].sort((a, b) => {
      const pA = getPriorityScore(findGoalForEvent(a, goals)?.priority);
      const pB = getPriorityScore(findGoalForEvent(b, goals)?.priority);
      if (pB !== pA) return pB - pA;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    // Slots available in chronological order
    const originalSlots = chrono.map(e => ({
      start: new Date(e.start).getTime(),
      end: new Date(e.end).getTime()
    }));

    let currentStart = originalSlots[0].start;
    const remapped: CalendarEvent[] = prioritized.map((evt, idx) => {
      const g = findGoalForEvent(evt, goals);
      const dur = new Date(evt.end).getTime() - new Date(evt.start).getTime();
      const minH = getGoalMinStartHour(g);
      if (minH !== null) {
        const prefDate = new Date(currentStart);
        prefDate.setHours(Math.floor(minH), Math.round((minH % 1) * 60), 0, 0);
        if (currentStart < prefDate.getTime()) {
          currentStart = prefDate.getTime();
        }
      }
      const slotStart = new Date(currentStart);
      const slotEnd = new Date(currentStart + dur);
      currentStart = currentStart + dur;
      if (idx + 1 < originalSlots.length && originalSlots[idx + 1].start > currentStart) {
        currentStart = originalSlots[idx + 1].start;
      }
      return {
        ...evt,
        start: slotStart.toISOString(),
        end: slotEnd.toISOString()
      };
    });

    changedCount += remapped.length;
    finalEvents.push(...fixedEvts, ...remapped);
  }

  finalEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { alignedEvents: finalEvents, changedCount };
}

/**
 * 3. MASTER SANITIZER & OPTIMIZER:
 * First cleans duplicates (1 session max per goal per day),
 * then re-aligns time slots by priority (Critical > Important > Normal).
 */
export function sanitizeAndOptimizeSchedule(
  events: CalendarEvent[],
  goals: Goal[]
): { optimizedEvents: CalendarEvent[]; duplicatesRemoved: number; priorityAdjusted: number } {
  const { deduplicated, removedCount } = deduplicateDailyGoalEvents(events, goals);
  const { alignedEvents, changedCount } = alignDailyEventsByPriority(deduplicated, goals);
  return {
    optimizedEvents: alignedEvents,
    duplicatesRemoved: removedCount,
    priorityAdjusted: changedCount
  };
}
