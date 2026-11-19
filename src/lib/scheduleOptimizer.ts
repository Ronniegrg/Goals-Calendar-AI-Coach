import {
  AIScheduleProposal,
  AvailabilityWindow,
  CalendarEvent,
  DailyBurnoutLimits,
  EnergyLevel,
  Goal,
  GoalPriority,
  GoalType,
  ScheduleDiffItem,
  TimePreference,
  UserEnergyProfile
} from "../types";
import {
  calculateEventEnergyFit,
  DEFAULT_USER_ENERGY_PROFILE,
  getEnergyZoneForHour,
  inferGoalEnergyLevel
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
 * Parses "HH:MM" into decimal hours (e.g. "08:30" -> 8.5)
 */
export function parseTimeToDecimalHours(timeStr: string | undefined, fallback: number): number {
  if (!timeStr || typeof timeStr !== "string") return fallback;
  const parts = timeStr.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] || 0);
  if (Number.isNaN(h)) return fallback;
  return h + (Number.isNaN(m) ? 0 : m / 60);
}

/**
 * Strictly reads availability for a specific calendar day.
 * If the user explicitly marked that day inactive, returns active: false (never overridden).
 */
export function getAvailabilityBoundsForDay(
  day: Date,
  availability: AvailabilityWindow[] = []
): { active: boolean; startHour: number; endHour: number } {
  if (!availability || availability.length === 0) {
    return { active: true, startHour: 8, endHour: 22 };
  }
  const dayOfWeek = day.getDay();
  const avail = availability.find((a) => a.dayOfWeek === dayOfWeek);
  if (!avail) {
    return { active: true, startHour: 8, endHour: 22 };
  }
  if (!avail.active) {
    return { active: false, startHour: 0, endHour: 0 };
  }
  const startHour = parseTimeToDecimalHours(avail.startTime, 8);
  const endHour = parseTimeToDecimalHours(avail.endTime, 22);
  if (endHour <= startHour) {
    return { active: false, startHour: 0, endHour: 0 };
  }
  return { active: true, startHour, endHour };
}

/**
 * Computes effective goal priority combining base priority and upcoming exam/completion deadline urgency.
 */
export function getGoalEffectivePriority(
  goal?: Goal,
  refDate: Date = new Date()
): {
  baseScore: number;
  urgencyBoost: number;
  totalScore: number;
  daysUntilDeadline: number | null;
  isUrgentDeadline: boolean;
} {
  const baseScore = getPriorityScore(goal?.priority);
  const deadlineRaw = goal?.targetExamDate || goal?.targetCompletionDate;
  if (!deadlineRaw) {
    return {
      baseScore,
      urgencyBoost: 0,
      totalScore: baseScore,
      daysUntilDeadline: null,
      isUrgentDeadline: false
    };
  }

  const deadline = new Date(deadlineRaw);
  if (Number.isNaN(deadline.getTime())) {
    return {
      baseScore,
      urgencyBoost: 0,
      totalScore: baseScore,
      daysUntilDeadline: null,
      isUrgentDeadline: false
    };
  }

  const daysUntilDeadline = Math.ceil((deadline.getTime() - refDate.getTime()) / (24 * 3600 * 1000));
  let urgencyBoost = 0;
  if (daysUntilDeadline >= -1 && daysUntilDeadline <= 3) {
    urgencyBoost = 2.5;
  } else if (daysUntilDeadline > 3 && daysUntilDeadline <= 7) {
    urgencyBoost = 1.5;
  } else if (daysUntilDeadline > 7 && daysUntilDeadline <= 14) {
    urgencyBoost = 0.75;
  }

  return {
    baseScore,
    urgencyBoost,
    totalScore: baseScore + urgencyBoost,
    daysUntilDeadline,
    isUrgentDeadline: urgencyBoost > 0
  };
}

export function getEffectiveBufferMinutes(energyProfile?: UserEnergyProfile): number {
  const raw = energyProfile?.autoBufferMinutes;
  if (typeof raw === "number" && !Number.isNaN(raw) && raw >= 0) {
    return raw;
  }
  return 15;
}

export function isAutoScheduledEvent(evt: CalendarEvent): boolean {
  if (!evt || evt.completed || evt.type === "external") return false;
  if (evt.notes && (evt.notes.includes("Shifted") || evt.notes.includes("Delayed"))) {
    return false;
  }
  return (
    evt.id.startsWith("sch_") ||
    evt.id.includes("_sch_") ||
    evt.id.startsWith("ai_sch_") ||
    (!!evt.notes &&
      (evt.notes.toLowerCase().includes("auto-scheduled") ||
        evt.notes.toLowerCase().includes("intelligently mapped") ||
        evt.notes.toLowerCase().includes("ai autopilot:")))
  );
}

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
    return parseTimeToDecimalHours(goal.customTimeStart, 8);
  }
  return null;
}

export function getGoalTimeWindowBounds(
  availStart: number,
  availEnd: number,
  goal?: Goal
): { start: number; end: number; hasExplicitPreference: boolean } {
  if (!goal || !goal.timePreference || goal.timePreference === TimePreference.ANY) {
    return { start: availStart, end: availEnd, hasExplicitPreference: false };
  }

  let prefStart = availStart;
  let prefEnd = availEnd;

  if (goal.timePreference === TimePreference.EARLY_MORNING) {
    prefStart = Math.max(availStart, 5);
    prefEnd = Math.min(availEnd, 8.5);
  } else if (goal.timePreference === TimePreference.MORNING) {
    prefStart = Math.max(availStart, 8);
    prefEnd = Math.min(availEnd, 12.5);
  } else if (goal.timePreference === TimePreference.AFTERNOON) {
    prefStart = Math.max(availStart, 12);
    prefEnd = Math.min(availEnd, 17);
  } else if (goal.timePreference === TimePreference.EVENING) {
    prefStart = Math.max(availStart, 17);
    prefEnd = Math.min(availEnd, 22);
  } else if (goal.timePreference === TimePreference.NIGHT) {
    prefStart = Math.max(availStart, 21);
    prefEnd = Math.min(availEnd, 24);
  } else if (goal.timePreference === TimePreference.CUSTOM && goal.customTimeStart) {
    const customStart = parseTimeToDecimalHours(goal.customTimeStart, availStart);
    const customEnd = goal.customTimeEnd
      ? parseTimeToDecimalHours(goal.customTimeEnd, customStart + (goal.durationMinutes || 60) / 60)
      : customStart + (goal.durationMinutes || 60) / 60;
    prefStart = Math.max(availStart, customStart);
    prefEnd = Math.min(availEnd, customEnd);
  }

  return { start: prefStart, end: prefEnd, hasExplicitPreference: true };
}

export const findGoalForEvent = (evt: CalendarEvent, goals: Goal[]): Goal | undefined => {
  if (!evt) return undefined;
  if (evt.goalId) {
    const byId = goals.find((g) => g.id === evt.goalId);
    if (byId) return byId;
  }
  const cleanTitle = (evt.title || "").trim().toLowerCase();
  if (!cleanTitle) return undefined;
  return goals.find((g) => {
    const cleanGoal = (g.name || "").trim().toLowerCase();
    return cleanGoal && (cleanTitle === cleanGoal || cleanTitle.includes(cleanGoal) || cleanGoal.includes(cleanTitle));
  });
};

function mapGoalTypeToEventType(goalType: GoalType | string): CalendarEvent["type"] {
  if (goalType === GoalType.WORKOUT || goalType === "workout") return "workout";
  if (goalType === GoalType.STUDY || goalType === "study") return "study";
  if (goalType === GoalType.JOB_SEARCH || goalType === "job_search") return "job_search";
  if (goalType === GoalType.SIDE_PROJECT || goalType === "side_project") return "side_project";
  if (goalType === GoalType.ROUTINE || goalType === "routine") return "routine";
  return "personal";
}

function doesEventMatchGoal(evt: CalendarEvent, goal: Goal): boolean {
  if (evt.type === "external") return false;
  if (evt.goalId && evt.goalId === goal.id) return true;
  const gName = (goal.name || "").trim().toLowerCase();
  const eTitle = (evt.title || "").trim().toLowerCase();
  if (!gName || !eTitle) return false;
  return eTitle === gName || eTitle.includes(gName);
}

/**
 * 1. DEDUPLICATE DAILY EVENTS:
 * Strictly enforces AT MOST ONE uncompleted event per goal per calendar day.
 */
export function deduplicateDailyGoalEvents(
  events: CalendarEvent[],
  goals: Goal[]
): { deduplicated: CalendarEvent[]; removedCount: number } {
  const dayGoalMap = new Map<string, boolean>();
  const result: CalendarEvent[] = [];
  let removedCount = 0;

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
        removedCount++;
      } else {
        dayGoalMap.set(mapKey, true);
        result.push(evt);
      }
    }
  }

  result.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { deduplicated: result, removedCount };
}

/**
 * Checks whether a given decimal hour falls within the goal's preferred time window
 */
export function isHourInGoalPreference(hour: number, goal?: Goal): boolean {
  if (!goal || !goal.timePreference || goal.timePreference === TimePreference.ANY) return true;
  if (goal.timePreference === TimePreference.EARLY_MORNING) return hour >= 5 && hour < 8.5;
  if (goal.timePreference === TimePreference.MORNING) return hour >= 8 && hour < 12.5;
  if (goal.timePreference === TimePreference.AFTERNOON) return hour >= 12 && hour < 17;
  if (goal.timePreference === TimePreference.EVENING) return hour >= 17 && hour < 22;
  if (goal.timePreference === TimePreference.NIGHT) return hour >= 21 || hour < 2;
  if (goal.timePreference === TimePreference.CUSTOM && goal.customTimeStart) {
    const startH = parseTimeToDecimalHours(goal.customTimeStart, 8);
    let endH = startH + (goal.durationMinutes || 60) / 60;
    if (goal.customTimeEnd) {
      endH = parseTimeToDecimalHours(goal.customTimeEnd, startH + 1);
    }
    return hour >= startH - 0.25 && hour < endH + 0.5;
  }
  return true;
}

/**
 * Checks daily burnout limits & max daily deep-focus capacity before adding/moving a session onto a day.
 */
export function canDayAcceptSessionCapacity(
  day: Date,
  durationMinutes: number,
  taskEnergy: EnergyLevel,
  events: CalendarEvent[],
  goals: Goal[],
  burnoutLimits?: DailyBurnoutLimits,
  energyProfile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE,
  ignoreEventId?: string
): { allowed: boolean; existingGoalHours: number; existingDeepFocusHours: number } {
  const dayStr = day.toDateString();
  const dayOfWeek = day.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  let existingGoalMinutes = 0;
  let existingDeepFocusMinutes = 0;

  for (const ev of events) {
    if (ignoreEventId && ev.id === ignoreEventId) continue;
    if (ev.type === "external" || ev.completed) continue;
    const evStart = new Date(ev.start);
    if (evStart.toDateString() !== dayStr) continue;
    const durMins = Math.max(15, (new Date(ev.end).getTime() - evStart.getTime()) / (60 * 1000));
    existingGoalMinutes += durMins;

    const g = findGoalForEvent(ev, goals);
    const level = ev.energyLevel || (g ? inferGoalEnergyLevel(g) : "moderate");
    if (level === "deep_focus") {
      existingDeepFocusMinutes += durMins;
    }
  }

  const existingGoalHours = existingGoalMinutes / 60;
  const existingDeepFocusHours = existingDeepFocusMinutes / 60;
  const addedHours = durationMinutes / 60;

  const weekdayMax = burnoutLimits?.weekdayMaxHours ?? 3.5;
  const weekendMax = burnoutLimits?.weekendMaxHours ?? 5.0;
  const maxDailyCap = isWeekend ? weekendMax : weekdayMax;

  if (existingGoalHours + addedHours > maxDailyCap + 0.01) {
    return { allowed: false, existingGoalHours, existingDeepFocusHours };
  }

  const maxDeepFocus = energyProfile?.maxDailyDeepFocusHours ?? 4.0;
  if (taskEnergy === "deep_focus" && existingDeepFocusHours + addedHours > maxDeepFocus + 0.01) {
    return { allowed: false, existingGoalHours, existingDeepFocusHours };
  }

  return { allowed: true, existingGoalHours, existingDeepFocusHours };
}

export interface ScoredSlotResult {
  start: Date;
  end: Date;
  score: number;
  usedFlexWindow: boolean;
  isSlumpConflict: boolean;
  energyFitStatus: "ideal" | "acceptable" | "conflict";
}

/**
 * Evaluates and scores all valid buffered slots on a target day for a goal/session.
 * Strictly skips inactive days, enforces buffer spacing around existing events,
 * and separates Tier-1 (preferred time window) from Tier-2 (active-day flex).
 */
export function findBestSlotForGoalSession({
  day,
  durationMinutes,
  goal,
  taskEnergy,
  events,
  availability,
  energyProfile = DEFAULT_USER_ENERGY_PROFILE,
  burnoutLimits,
  nowMs = Date.now(),
  ignoreEventId,
  allowTier2Flex = false,
  enforceBurnoutCap = true
}: {
  day: Date;
  durationMinutes: number;
  goal?: Goal;
  taskEnergy?: EnergyLevel;
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
  burnoutLimits?: DailyBurnoutLimits;
  nowMs?: number;
  ignoreEventId?: string;
  allowTier2Flex?: boolean;
  enforceBurnoutCap?: boolean;
}): ScoredSlotResult | null {
  const availBounds = getAvailabilityBoundsForDay(day, availability);
  if (!availBounds.active) {
    return null; // Strict inactive day protection
  }

  const resolvedEnergy = taskEnergy || (goal ? inferGoalEnergyLevel(goal) : "moderate");
  const effectiveDurMins = Math.max(15, durationMinutes || goal?.durationMinutes || 60);
  const durHours = effectiveDurMins / 60;
  const durMs = effectiveDurMins * 60 * 1000;

  if (enforceBurnoutCap) {
    const capCheck = canDayAcceptSessionCapacity(
      day,
      effectiveDurMins,
      resolvedEnergy,
      events,
      goal ? [goal] : [],
      burnoutLimits,
      energyProfile,
      ignoreEventId
    );
    if (!capCheck.allowed) {
      return null;
    }
  }

  const bufferMins = getEffectiveBufferMinutes(energyProfile);
  const bufferMs = bufferMins * 60 * 1000;

  const dayStr = day.toDateString();
  const dayEvents = events
    .filter((ev) => {
      if (ignoreEventId && ev.id === ignoreEventId) return false;
      const s = new Date(ev.start);
      const e = new Date(ev.end);
      return s.toDateString() === dayStr || e.toDateString() === dayStr;
    })
    .map((ev) => ({
      startMs: new Date(ev.start).getTime(),
      endMs: new Date(ev.end).getTime()
    }));

  const tier1Bounds = getGoalTimeWindowBounds(availBounds.startHour, availBounds.endHour, goal);

  // Collect candidate decimal hours: 15-minute grid + exact post-buffer start times after existing events
  const candidateHourSet = new Set<number>();
  for (let h = availBounds.startHour; h <= availBounds.endHour - durHours + 0.001; h += 0.25) {
    candidateHourSet.add(Math.round(h * 100) / 100);
  }
  for (const ev of dayEvents) {
    const afterBufferDate = new Date(ev.endMs + bufferMs);
    if (afterBufferDate.toDateString() === dayStr) {
      const h = afterBufferDate.getHours() + afterBufferDate.getMinutes() / 60;
      if (h >= availBounds.startHour && h <= availBounds.endHour - durHours + 0.001) {
        candidateHourSet.add(Math.round(h * 100) / 100);
      }
    }
  }

  const priorityInfo = getGoalEffectivePriority(goal, new Date(nowMs));
  let bestSlot: ScoredSlotResult | null = null;

  for (const h of candidateHourSet) {
    const slotStart = new Date(day);
    slotStart.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const slotStartMs = slotStart.getTime();
    const slotEndMs = slotStartMs + durMs;

    // Must be in the future (10m safety margin)
    if (slotStartMs <= nowMs + 10 * 60 * 1000) continue;

    // Must fit cleanly inside active availability window
    const endHourDecimal = h + durHours;
    if (h < availBounds.startHour - 0.001 || endHourDecimal > availBounds.endHour + 0.001) continue;

    // Determine Tier-1 vs Tier-2 membership
    const inTier1 =
      !tier1Bounds.hasExplicitPreference ||
      (tier1Bounds.end > tier1Bounds.start &&
        h >= tier1Bounds.start - 0.001 &&
        endHourDecimal <= tier1Bounds.end + 0.001);

    if (!inTier1 && !allowTier2Flex) continue;

    // Enforce collision + buffer against existing events on this day
    const violatesBufferOrCollision = dayEvents.some(
      (ev) => slotStartMs - bufferMs < ev.endMs && slotEndMs + bufferMs > ev.startMs
    );
    if (violatesBufferOrCollision) continue;

    // Evaluate cognitive energy fit & slump protection
    const mockEvent: CalendarEvent = {
      id: "cand",
      title: goal?.name || "Session",
      type: goal ? mapGoalTypeToEventType(goal.type) : "study",
      start: slotStart.toISOString(),
      end: new Date(slotEndMs).toISOString(),
      completed: false,
      energyLevel: resolvedEnergy
    };
    const fit = calculateEventEnergyFit(mockEvent, goal, energyProfile);

    // Hard-avoid slump conflict during Tier-1 when slumpProtection is enabled
    if (energyProfile.slumpProtection && fit.isSlumpConflict && !allowTier2Flex) {
      continue;
    }

    let score = 0;
    score += inTier1 ? 120 : 0;

    if (fit.status === "ideal") score += 65;
    else if (fit.status === "acceptable") score += 25;
    else score -= energyProfile.slumpProtection ? 95 : 30;

    // Clock boundary neatness (:00 > :30 > :15/:45)
    const mins = slotStart.getMinutes();
    if (mins === 0) score += 8;
    else if (mins === 30) score += 5;
    else score += 2;

    // Earlier-in-window tie-breaker scaled by priority/deadline urgency
    score += (24 - h) * (0.15 + priorityInfo.totalScore * 0.08);

    if (!bestSlot || score > bestSlot.score) {
      bestSlot = {
        start: slotStart,
        end: new Date(slotEndMs),
        score,
        usedFlexWindow: !inTier1,
        isSlumpConflict: fit.isSlumpConflict,
        energyFitStatus: fit.status
      };
    }
  }

  return bestSlot;
}

/**
 * 2. ALIGN DAILY EVENTS BY PRIORITY, COGNITIVE ENERGY PROFILE & RECOVERY BUFFERS:
 * - Swaps inverted priority/deadline pairs when both fit preferred windows.
 * - Moves deep_focus events out of slump zones into better open active-availability slots on the same day.
 * - Enforces profile autoBufferMinutes between consecutive uncompleted sessions.
 */
export function alignDailyEventsByPriority(
  events: CalendarEvent[],
  goals: Goal[],
  energyProfile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE,
  availability: AvailabilityWindow[] = []
): {
  alignedEvents: CalendarEvent[];
  changedCount: number;
  slumpAdjusted: number;
  buffersAdded: number;
} {
  const dayMap = new Map<string, CalendarEvent[]>();
  events.forEach((e) => {
    const d = new Date(e.start).toDateString();
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push({ ...e });
  });

  let changedCount = 0;
  let slumpAdjusted = 0;
  let buffersAdded = 0;
  const finalEvents: CalendarEvent[] = [];
  const bufferMins = getEffectiveBufferMinutes(energyProfile);
  const bufferMs = bufferMins * 60 * 1000;
  const now = new Date();

  for (const [, dayEvts] of dayMap.entries()) {
    const fixedEvts = dayEvts.filter((e) => e.completed || e.type === "external");
    const uncompletedGoalEvts = dayEvts.filter((e) => !e.completed && e.type !== "external");

    if (uncompletedGoalEvts.length === 0) {
      finalEvents.push(...dayEvts);
      continue;
    }

    const workingList = [...uncompletedGoalEvts].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    // Pass A: Swap inverted priority/deadline pairs when compatible with both time preferences
    for (let pass = 0; pass < workingList.length - 1; pass++) {
      for (let i = 0; i < workingList.length - 1 - pass; i++) {
        const evtA = workingList[i];
        const evtB = workingList[i + 1];

        const gA = findGoalForEvent(evtA, goals);
        const gB = findGoalForEvent(evtB, goals);
        const pA = getGoalEffectivePriority(gA, now).totalScore;
        const pB = getGoalEffectivePriority(gB, now).totalScore;

        const energyA = evtA.energyLevel || (gA ? inferGoalEnergyLevel(gA) : "moderate");
        const energyB = evtB.energyLevel || (gB ? inferGoalEnergyLevel(gB) : "moderate");
        const eA = getEnergyLevelScore(energyA);
        const eB = getEnergyLevelScore(energyB);

        const shouldSwap = pB > pA || (Math.abs(pB - pA) < 0.01 && eB > eA);

        if (shouldSwap) {
          const dateA = new Date(evtA.start);
          const dateB = new Date(evtB.start);
          const hourA = dateA.getHours() + dateA.getMinutes() / 60;
          const hourB = dateB.getHours() + dateB.getMinutes() / 60;

          const durA = new Date(evtA.end).getTime() - dateA.getTime();
          const durB = new Date(evtB.end).getTime() - dateB.getTime();

          const canBTakeSlotA = isHourInGoalPreference(hourA, gB);
          const canATakeSlotB = isHourInGoalPreference(hourB, gA);

          // Also ensure swapped durations don't collide with fixed events or neighbors
          const newBEnd = dateA.getTime() + durB;
          const newAEnd = dateB.getTime() + durA;
          const bCollides = [...fixedEvts, ...workingList].some((other) => {
            if (other.id === evtA.id || other.id === evtB.id) return false;
            const os = new Date(other.start).getTime();
            const oe = new Date(other.end).getTime();
            return dateA.getTime() < oe && newBEnd > os;
          });
          const aCollides = [...fixedEvts, ...workingList].some((other) => {
            if (other.id === evtA.id || other.id === evtB.id) return false;
            const os = new Date(other.start).getTime();
            const oe = new Date(other.end).getTime();
            return dateB.getTime() < oe && newAEnd > os;
          });

          if (canBTakeSlotA && canATakeSlotB && !bCollides && !aCollides && newBEnd <= dateB.getTime()) {
            workingList[i] = {
              ...evtB,
              energyLevel: energyB,
              start: dateA.toISOString(),
              end: new Date(newBEnd).toISOString()
            };
            workingList[i + 1] = {
              ...evtA,
              energyLevel: energyA,
              start: dateB.toISOString(),
              end: new Date(newAEnd).toISOString()
            };
            changedCount += 2;
          }
        }
      }
    }

    // Pass B: Slump Protection - rescue deep_focus sessions placed inside a light_recharge slump zone
    if (energyProfile?.slumpProtection) {
      for (let i = 0; i < workingList.length; i++) {
        const evt = workingList[i];
        const g = findGoalForEvent(evt, goals);
        const energyLevel = evt.energyLevel || (g ? inferGoalEnergyLevel(g) : "moderate");

        if (energyLevel === "deep_focus") {
          const sDate = new Date(evt.start);
          if (sDate.getTime() <= now.getTime() + 10 * 60 * 1000) continue;

          const sHour = sDate.getHours() + sDate.getMinutes() / 60;
          const zone = getEnergyZoneForHour(sHour, energyProfile);

          if (zone && zone.level === "light_recharge") {
            const durMins = Math.max(15, Math.round((new Date(evt.end).getTime() - sDate.getTime()) / 60000));
            const dayAllEvents = [...fixedEvts, ...workingList];
            const betterSlot = findBestSlotForGoalSession({
              day: sDate,
              durationMinutes: durMins,
              goal: g,
              taskEnergy: "deep_focus",
              events: dayAllEvents,
              availability,
              energyProfile,
              nowMs: now.getTime(),
              ignoreEventId: evt.id,
              allowTier2Flex: false,
              enforceBurnoutCap: false
            });

            if (betterSlot && !betterSlot.isSlumpConflict) {
              workingList[i] = {
                ...evt,
                energyLevel,
                start: betterSlot.start.toISOString(),
                end: betterSlot.end.toISOString()
              };
              slumpAdjusted++;
              changedCount++;
            }
          }
        }
      }
    }

    // Pass C: Enforce recovery buffers between consecutive uncompleted sessions on the same day
    if (bufferMs > 0 && workingList.length > 1) {
      workingList.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      for (let i = 1; i < workingList.length; i++) {
        const prev = workingList[i - 1];
        const curr = workingList[i];
        const prevEnd = new Date(prev.end).getTime();
        const currStart = new Date(curr.start).getTime();
        const currEnd = new Date(curr.end).getTime();
        const currDur = currEnd - currStart;

        if (currStart >= prevEnd && currStart - prevEnd < bufferMs) {
          const targetStartMs = prevEnd + bufferMs;
          const targetEndMs = targetStartMs + currDur;
          const targetStartDate = new Date(targetStartMs);
          const availBounds = getAvailabilityBoundsForDay(targetStartDate, availability);
          const targetEndHour = targetStartDate.getHours() + targetStartDate.getMinutes() / 60 + currDur / (3600 * 1000);

          const fitsAvail = availBounds.active && targetEndHour <= availBounds.endHour + 0.001;
          const nextEv = workingList[i + 1];
          const nextStartMs = nextEv ? new Date(nextEv.start).getTime() : Infinity;
          const collidesWithFixed = fixedEvts.some((f) => {
            const fs = new Date(f.start).getTime();
            const fe = new Date(f.end).getTime();
            return targetStartMs < fe + bufferMs && targetEndMs + bufferMs > fs;
          });

          if (fitsAvail && targetEndMs + bufferMs <= nextStartMs && !collidesWithFixed) {
            workingList[i] = {
              ...curr,
              start: targetStartDate.toISOString(),
              end: new Date(targetEndMs).toISOString()
            };
            buffersAdded++;
            changedCount++;
          }
        }
      }
    }

    finalEvents.push(...fixedEvts, ...workingList);
  }

  finalEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { alignedEvents: finalEvents, changedCount, slumpAdjusted, buffersAdded };
}

/**
 * 2b. ENFORCE WEEKLY TARGET QUOTAS:
 * Strictly ensures non-daily goals do NOT exceed their weekly quota in any calendar week.
 */
export function enforceWeeklyTargetQuotas(
  events: CalendarEvent[],
  goals: Goal[]
): { prunedEvents: CalendarEvent[]; excessRemovedCount: number } {
  if (!goals || goals.length === 0 || events.length === 0) {
    return { prunedEvents: events, excessRemovedCount: 0 };
  }

  const weekMap = new Map<string, CalendarEvent[]>();
  events.forEach((evt) => {
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
    for (const goal of goals) {
      if (!goal || goal.weeklyTarget >= 7) continue;

      const goalEvts = weekEvts.filter((e) => doesEventMatchGoal(e, goal));
      if (goalEvts.length <= goal.weeklyTarget) continue;

      const completedSessions = goalEvts.filter((e) => e.completed);
      const uncompletedSessions = goalEvts.filter((e) => !e.completed);

      const allowedUncompleted = Math.max(0, goal.weeklyTarget - completedSessions.length);
      const excessCount = uncompletedSessions.length - allowedUncompleted;

      if (excessCount > 0) {
        const dayCrowdCount = new Map<string, number>();
        weekEvts.forEach((we) => {
          const dayKey = new Date(we.start).toDateString();
          dayCrowdCount.set(dayKey, (dayCrowdCount.get(dayKey) || 0) + 1);
        });

        const sortedForPruning = [...uncompletedSessions].sort((a, b) => {
          const crowdA = dayCrowdCount.get(new Date(a.start).toDateString()) || 0;
          const crowdB = dayCrowdCount.get(new Date(b.start).toDateString()) || 0;
          if (crowdB !== crowdA) return crowdB - crowdA;
          return new Date(b.start).getTime() - new Date(a.start).getTime();
        });

        sortedForPruning.slice(0, excessCount).forEach((ev) => {
          idsToPrune.add(ev.id);
          excessRemovedCount++;
        });
      }
    }
  }

  const prunedEvents = events.filter((e) => !idsToPrune.has(e.id));
  return { prunedEvents, excessRemovedCount };
}

/**
 * 3. MASTER SANITIZER & OPTIMIZER:
 * Deduplicates daily goals, trims weekly excess, aligns priorities/deadlines/slumps, and enforces buffers.
 */
export function sanitizeAndOptimizeSchedule(
  events: CalendarEvent[],
  goals: Goal[],
  energyProfile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE,
  availability: AvailabilityWindow[] = []
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
  const { alignedEvents, changedCount, slumpAdjusted, buffersAdded } = alignDailyEventsByPriority(
    prunedEvents,
    goals,
    energyProfile,
    availability
  );
  return {
    optimizedEvents: alignedEvents,
    duplicatesRemoved: removedCount,
    quotaExcessRemoved: excessRemovedCount,
    priorityAdjusted: changedCount,
    slumpAdjusted,
    buffersAdded
  };
}

export interface UnifiedAutoScheduleResult {
  optimizedEvents: CalendarEvent[];
  addedEvents: CalendarEvent[];
  addedCount: number;
  removedCount: number;
  priorityAdjusted: number;
  slumpAdjusted: number;
  buffersAdded: number;
  flexedCount: number;
  urgentGoalsBoosted: string[];
  unplacedReasons: string[];
}

/**
 * 3b. UNIFIED MULTI-WEEK CONSTRAINT-AWARE AUTO-SCHEDULER:
 * Shared engine for background auto-scheduling, single-goal "+ Schedule", "Optimize Now", and server baseline.
 * - Strictly respects inactive availability days
 * - Prioritizes Tier-1 preferred windows; flexes to Tier-2 active-day slots only when needed
 * - Enforces profile recovery buffers, daily burnout limits, and max daily deep-focus hours
 * - Weights upcoming exam / completion deadlines alongside base priority
 */
export function runUnifiedAutoScheduler({
  goals,
  events,
  availability,
  energyProfile = DEFAULT_USER_ENERGY_PROFILE,
  burnoutLimits,
  horizonDays = 28,
  rebuildAutoScheduled = false,
  targetGoalId,
  refDate = new Date()
}: {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
  burnoutLimits?: DailyBurnoutLimits;
  horizonDays?: number;
  rebuildAutoScheduled?: boolean;
  targetGoalId?: string;
  refDate?: Date;
}): UnifiedAutoScheduleResult {
  const now = new Date(refDate);
  const nowMs = now.getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const activeGoals = goals.filter((goal) => {
    if (targetGoalId && goal.id !== targetGoalId) return false;
    if (!goal.isPaused) return true;
    if (!goal.pauseUntil) return false;
    return new Date(goal.pauseUntil) < now;
  });

  if (activeGoals.length === 0) {
    return {
      optimizedEvents: events,
      addedEvents: [],
      addedCount: 0,
      removedCount: 0,
      priorityAdjusted: 0,
      slumpAdjusted: 0,
      buffersAdded: 0,
      flexedCount: 0,
      urgentGoalsBoosted: [],
      unplacedReasons: []
    };
  }

  // Optionally strip existing uncompleted auto-scheduled blocks so "Optimize Now" rebuilds cleanly
  let baseEvents = events;
  let rebuiltRemoved = 0;
  if (rebuildAutoScheduled) {
    baseEvents = events.filter((ev) => {
      if (targetGoalId && ev.goalId !== targetGoalId) return true;
      const shouldDrop = isAutoScheduledEvent(ev) && new Date(ev.start).getTime() >= todayStart.getTime();
      if (shouldDrop) rebuiltRemoved++;
      return !shouldDrop;
    });
  }

  const { deduplicated, removedCount: dupRemoved } = deduplicateDailyGoalEvents(baseEvents, goals);
  const { prunedEvents, excessRemovedCount } = enforceWeeklyTargetQuotas(deduplicated, goals);
  const workingEvents: CalendarEvent[] = prunedEvents.map((e) => ({ ...e }));

  // Sort goals by composite priority (base priority + deadline urgency) then cognitive intensity
  const urgentGoalsBoosted: string[] = [];
  const sortedGoals = [...activeGoals].sort((a, b) => {
    const pA = getGoalEffectivePriority(a, now);
    const pB = getGoalEffectivePriority(b, now);
    if (Math.abs(pB.totalScore - pA.totalScore) > 0.01) {
      return pB.totalScore - pA.totalScore;
    }
    const eA = getEnergyLevelScore(inferGoalEnergyLevel(a));
    const eB = getEnergyLevelScore(inferGoalEnergyLevel(b));
    return eB - eA;
  });

  sortedGoals.forEach((g) => {
    const eff = getGoalEffectivePriority(g, now);
    if (eff.isUrgentDeadline) {
      urgentGoalsBoosted.push(g.name);
    }
  });

  const addedEvents: CalendarEvent[] = [];
  let flexedCount = 0;
  const unplacedReasons: string[] = [];
  let seqCounter = 0;

  for (const goal of sortedGoals) {
    const isDailyGoal = (goal.weeklyTarget || 1) >= 7;
    const durationMinutes = Math.max(15, goal.durationMinutes || 60);
    const taskEnergy = inferGoalEnergyLevel(goal);

    const upcomingGoalEvents = workingEvents
      .filter((evt) => !evt.completed && doesEventMatchGoal(evt, goal) && new Date(evt.start) >= todayStart)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const hasShifted = upcomingGoalEvents.some(
      (e) => e.notes && (e.notes.includes("Shifted") || e.notes.includes("Delayed"))
    );
    const earliestAllowedDayStart =
      hasShifted && upcomingGoalEvents.length > 0
        ? new Date(new Date(upcomingGoalEvents[0].start).setHours(0, 0, 0, 0))
        : todayStart;

    // Group horizon days by calendar week (Sun..Sat)
    const weekBuckets = new Map<string, { startOfWeek: Date; endOfWeek: Date; days: Date[] }>();
    for (let offset = 0; offset < horizonDays; offset++) {
      const targetDay = new Date(todayStart);
      targetDay.setDate(todayStart.getDate() + offset);
      if (targetDay < earliestAllowedDayStart) continue;

      const sWeek = new Date(targetDay);
      sWeek.setDate(targetDay.getDate() - targetDay.getDay());
      sWeek.setHours(0, 0, 0, 0);

      const eWeek = new Date(sWeek);
      eWeek.setDate(sWeek.getDate() + 6);
      eWeek.setHours(23, 59, 59, 999);

      const weekKey = sWeek.toISOString();
      if (!weekBuckets.has(weekKey)) {
        weekBuckets.set(weekKey, { startOfWeek: sWeek, endOfWeek: eWeek, days: [] });
      }
      weekBuckets.get(weekKey)!.days.push(targetDay);
    }

    for (const [, bucket] of weekBuckets.entries()) {
      const countSessionsInWeek = () =>
        workingEvents.filter((evt) => {
          if (!doesEventMatchGoal(evt, goal)) return false;
          const d = new Date(evt.start);
          return d >= bucket.startOfWeek && d <= bucket.endOfWeek;
        }).length;

      if (isDailyGoal) {
        // Daily goal: attempt 1 session on every active day in bucket
        for (const day of bucket.days) {
          const dayStr = day.toDateString();
          const alreadyOnDay = workingEvents.some(
            (evt) => doesEventMatchGoal(evt, goal) && new Date(evt.start).toDateString() === dayStr
          );
          if (alreadyOnDay) continue;

          let best = findBestSlotForGoalSession({
            day,
            durationMinutes,
            goal,
            taskEnergy,
            events: workingEvents,
            availability,
            energyProfile,
            burnoutLimits,
            nowMs,
            allowTier2Flex: false
          });

          if (!best) {
            best = findBestSlotForGoalSession({
              day,
              durationMinutes,
              goal,
              taskEnergy,
              events: workingEvents,
              availability,
              energyProfile,
              burnoutLimits,
              nowMs,
              allowTier2Flex: true
            });
          }

          if (best) {
            const newEvt = buildScheduledEventFromSlot(goal, taskEnergy, best, seqCounter++);
            workingEvents.push(newEvt);
            addedEvents.push(newEvt);
            if (best.usedFlexWindow) flexedCount++;
          }
        }
        continue;
      }

      // Non-daily goal: Two-Pass placement (Tier-1 preferred window across best days -> Tier-2 flex only if needed)
      let currentWeekCount = countSessionsInWeek();
      const targetQuota = goal.weeklyTarget || 1;

      const pickAndBookBestDay = (allowTier2Flex: boolean): boolean => {
        const remainingNeeded = targetQuota - currentWeekCount;
        if (remainingNeeded <= 0) return false;

        let bestDayCandidate: { day: Date; slot: ScoredSlotResult; dayScore: number } | null = null;
        const eligibleDaysCount = bucket.days.filter((d) => {
          const avail = getAvailabilityBoundsForDay(d, availability);
          if (!avail.active) return false;
          const dStr = d.toDateString();
          return !workingEvents.some(
            (evt) => doesEventMatchGoal(evt, goal) && new Date(evt.start).toDateString() === dStr
          );
        }).length;

        for (const day of bucket.days) {
          const dayStr = day.toDateString();
          const alreadyOnDay = workingEvents.some(
            (evt) => doesEventMatchGoal(evt, goal) && new Date(evt.start).toDateString() === dayStr
          );
          if (alreadyOnDay) continue;

          const slot = findBestSlotForGoalSession({
            day,
            durationMinutes,
            goal,
            taskEnergy,
            events: workingEvents,
            availability,
            energyProfile,
            burnoutLimits,
            nowMs,
            allowTier2Flex
          });
          if (!slot) continue;

          // Compute spacing & day-load balancing score
          const prevDay = new Date(day);
          prevDay.setDate(day.getDate() - 1);
          const nextDay = new Date(day);
          nextDay.setDate(day.getDate() + 1);

          const adjacentSession = workingEvents.some((evt) => {
            if (!doesEventMatchGoal(evt, goal)) return false;
            const dStr = new Date(evt.start).toDateString();
            return dStr === prevDay.toDateString() || dStr === nextDay.toDateString();
          });

          const existingGoalHoursOnDay = workingEvents
            .filter((e) => !e.completed && e.type !== "external" && new Date(e.start).toDateString() === dayStr)
            .reduce((acc, ev) => acc + (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / (3600 * 1000), 0);

          let dayScore = slot.score;
          dayScore -= existingGoalHoursOnDay * 12; // Prefer spreading workload across lighter days
          if (adjacentSession && eligibleDaysCount > remainingNeeded) {
            dayScore -= 35; // Prefer 1-day rest breathers when week has room
          }

          if (!bestDayCandidate || dayScore > bestDayCandidate.dayScore) {
            bestDayCandidate = { day, slot, dayScore };
          }
        }

        if (!bestDayCandidate) return false;

        const newEvt = buildScheduledEventFromSlot(goal, taskEnergy, bestDayCandidate.slot, seqCounter++);
        workingEvents.push(newEvt);
        addedEvents.push(newEvt);
        if (bestDayCandidate.slot.usedFlexWindow) flexedCount++;
        currentWeekCount++;
        return true;
      };

      // Pass 1: Fill as many sessions as possible inside Tier-1 preferred windows
      while (currentWeekCount < targetQuota) {
        const booked = pickAndBookBestDay(false);
        if (!booked) break;
      }

      // Pass 2: Controlled Tier-2 Flex across active days only if quota still unmet
      while (currentWeekCount < targetQuota) {
        const booked = pickAndBookBestDay(true);
        if (!booked) break;
      }

      if (currentWeekCount < targetQuota && bucket.startOfWeek <= todayStart && bucket.endOfWeek >= todayStart) {
        unplacedReasons.push(
          `"${goal.name}": ${currentWeekCount}/${targetQuota} placed this week (limited by inactive days, buffers, or daily burnout caps)`
        );
      }
    }
  }

  const { alignedEvents, changedCount, slumpAdjusted, buffersAdded } = alignDailyEventsByPriority(
    workingEvents,
    goals,
    energyProfile,
    availability
  );

  return {
    optimizedEvents: alignedEvents,
    addedEvents,
    addedCount: addedEvents.length,
    removedCount: dupRemoved + excessRemovedCount + rebuiltRemoved,
    priorityAdjusted: changedCount,
    slumpAdjusted,
    buffersAdded,
    flexedCount,
    urgentGoalsBoosted,
    unplacedReasons
  };
}

function buildScheduledEventFromSlot(
  goal: Goal,
  taskEnergy: EnergyLevel,
  slot: ScoredSlotResult,
  seq: number
): CalendarEvent {
  const flexSuffix = slot.usedFlexWindow ? " [Flexed to open active-day window]" : "";
  return {
    id: `${goal.id}_sch_${Date.now()}_${seq}`,
    title: goal.name,
    type: mapGoalTypeToEventType(goal.type),
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    goalId: goal.id,
    completed: false,
    icon: goal.icon,
    energyLevel: taskEnergy,
    notes: `Auto-scheduled session for ${goal.name} (${goal.timePreference || "any"} preference)${flexSuffix}`,
    subtasks: goal.subtasks && goal.subtasks.length > 0 ? goal.subtasks : undefined,
    subSteps:
      goal.subSteps ||
      (goal.subtasks && goal.subtasks.length > 0
        ? goal.subtasks.map((s) => ({
            id: s.id,
            title: s.title,
            durationMinutes: s.durationMinutes || 15,
            completed: s.completed || false,
            carryoverNote: s.carryoverNote,
            carryoverNoteDate: s.carryoverNoteDate
          }))
        : undefined)
  };
}

/**
 * 4. AUTONOMOUS SELF-HEALING ENGINE (AI SCHEDULE AUTOPILOT):
 * - Reschedules past overdue uncompleted sessions into highest-scoring open slots
 * - Deconflicts overlapping sessions with enforced recovery buffers & strict inactive days
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
  const bufferMins = getEffectiveBufferMinutes(energyProfile);
  const bufferMs = bufferMins * 60 * 1000;

  const currentList: CalendarEvent[] = events.map((e) => ({ ...e }));

  const findScoredSlotAcrossHorizon = (
    durationMs: number,
    startFromDate: Date,
    goal?: Goal,
    taskEnergy?: EnergyLevel,
    ignoreId?: string
  ): ScoredSlotResult | null => {
    const durationMinutes = Math.max(15, Math.round(durationMs / 60000));
    for (const allowTier2Flex of [false, true]) {
      for (let dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset++) {
        const day = new Date(startFromDate);
        day.setDate(startFromDate.getDate() + dayOffset);
        const slot = findBestSlotForGoalSession({
          day,
          durationMinutes,
          goal,
          taskEnergy,
          events: currentList,
          availability,
          energyProfile,
          burnoutLimits,
          nowMs,
          ignoreEventId: ignoreId,
          allowTier2Flex
        });
        if (slot) return slot;
      }
    }
    return null;
  };

  // STEP 1: RESCHEDULE PAST OVERDUE SESSIONS
  const pastOverdue = currentList.filter(
    (e) => !e.completed && e.type !== "external" && new Date(e.end).getTime() < nowMs
  );

  for (const ov of pastOverdue) {
    const parentGoal = findGoalForEvent(ov, goals);
    const durMs = Math.max(15 * 60 * 1000, new Date(ov.end).getTime() - new Date(ov.start).getTime());
    const taskEnergy = ov.energyLevel || (parentGoal ? inferGoalEnergyLevel(parentGoal) : "moderate");

    const nextSlot = findScoredSlotAcrossHorizon(durMs, now, parentGoal, taskEnergy, ov.id);
    if (nextSlot) {
      ov.start = nextSlot.start.toISOString();
      ov.end = nextSlot.end.toISOString();
      ov.energyLevel = taskEnergy;
      ov.notes = (ov.notes ? ov.notes + " | " : "") + "🤖 AI Autopilot: Rescheduled overdue session";
      overdueRescheduledCount++;
      details.push(
        `Rescheduled missed session "${ov.title}" to ${nextSlot.start.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric"
        })} at ${nextSlot.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      );
    }
  }

  // STEP 2: DECONFLICT ANY OVERLAPPING OR BUFFER-VIOLATING SESSIONS
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

        const isHardOverlap = aStart < bEnd && aEnd > bStart;
        const isBufferViolation =
          evA.type !== "external" &&
          evB.type !== "external" &&
          bufferMs > 0 &&
          aStart < bEnd + bufferMs &&
          aEnd + bufferMs > bStart;

        if (isHardOverlap || isBufferViolation) {
          const gA = findGoalForEvent(evA, goals);
          const gB = findGoalForEvent(evB, goals);
          const scoreA = evA.type === "external" ? 999 : getGoalEffectivePriority(gA, now).totalScore;
          const scoreB = evB.type === "external" ? 999 : getGoalEffectivePriority(gB, now).totalScore;

          const eventToShift = scoreA >= scoreB ? evB : evA;
          if (eventToShift.type === "external") continue;

          const durMs = Math.max(
            15 * 60 * 1000,
            new Date(eventToShift.end).getTime() - new Date(eventToShift.start).getTime()
          );
          const shiftGoal = findGoalForEvent(eventToShift, goals);
          const taskEnergy = eventToShift.energyLevel || (shiftGoal ? inferGoalEnergyLevel(shiftGoal) : "moderate");

          const shiftFrom = new Date(Math.max(nowMs, new Date(eventToShift.start).getTime()));
          const newSlot = findScoredSlotAcrossHorizon(durMs, shiftFrom, shiftGoal, taskEnergy, eventToShift.id);
          if (newSlot) {
            eventToShift.start = newSlot.start.toISOString();
            eventToShift.end = newSlot.end.toISOString();
            eventToShift.energyLevel = taskEnergy;
            eventToShift.notes =
              (eventToShift.notes ? eventToShift.notes + " | " : "") +
              `🤖 AI Autopilot: Deconflicted with ${bufferMins}m recovery buffer`;
            collisionsResolvedCount++;
            details.push(`Deconflicted "${eventToShift.title}" with ${bufferMins}m buffer`);
          }
        }
      }
    }
  }

  const { optimizedEvents } = sanitizeAndOptimizeSchedule(currentList, goals, energyProfile, availability);

  return {
    healedEvents: optimizedEvents,
    overdueRescheduledCount,
    collisionsResolvedCount,
    details
  };
}

/**
 * 5. LIFE HAPPENED / TAKE TODAY OFF ENGINE:
 * Gracefully shifts all uncompleted events for today into active upcoming availability slots
 * while respecting buffers, burnout limits, and energy curves.
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
  dayAfter.setHours(0, 0, 0, 0);

  const nowMs = Date.now();
  const currentList = events.map((e) => ({ ...e }));
  const todayPending = currentList.filter(
    (e) => !e.completed && e.type !== "external" && new Date(e.start).toDateString() === targetDayStr
  );

  let movedCount = 0;
  const details: string[] = [];

  for (const ev of todayPending) {
    const parentGoal = findGoalForEvent(ev, goals);
    const durMins = Math.max(15, Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000));
    const taskEnergy = ev.energyLevel || (parentGoal ? inferGoalEnergyLevel(parentGoal) : "moderate");

    let placedSlot: ScoredSlotResult | null = null;
    for (const allowTier2Flex of [false, true]) {
      for (let offset = 0; offset < 7 && !placedSlot; offset++) {
        const candDay = new Date(dayAfter);
        candDay.setDate(dayAfter.getDate() + offset);
        placedSlot = findBestSlotForGoalSession({
          day: candDay,
          durationMinutes: durMins,
          goal: parentGoal,
          taskEnergy,
          events: currentList,
          availability,
          energyProfile,
          burnoutLimits,
          nowMs,
          ignoreEventId: ev.id,
          allowTier2Flex
        });
      }
      if (placedSlot) break;
    }

    if (placedSlot) {
      ev.start = placedSlot.start.toISOString();
      ev.end = placedSlot.end.toISOString();
      ev.energyLevel = taskEnergy;
      ev.notes = (ev.notes ? ev.notes + " | " : "") + "🌴 Shifted: Life Happened / Rest Day";
      movedCount++;
      details.push(
        `Moved "${ev.title}" to ${placedSlot.start.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric"
        })} at ${placedSlot.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      );
    }
  }

  const { optimizedEvents } = sanitizeAndOptimizeSchedule(currentList, goals, energyProfile, availability);

  return {
    updatedEvents: optimizedEvents,
    movedCount,
    details
  };
}

/**
 * 6. SHARED AI SCHEDULE PROPOSAL BUILDER & VALIDATOR (USED BY SERVER & CLIENT CONTROLLER):
 */
function computeScheduleDiff(
  originalEvents: CalendarEvent[],
  proposedEvents: CalendarEvent[],
  goals: Goal[],
  reasonMap: Map<string, string> = new Map()
): {
  diff: ScheduleDiffItem[];
  sessionsAdded: number;
  sessionsMoved: number;
  sessionsRemoved: number;
} {
  const origMap = new Map(originalEvents.map((e) => [e.id, e]));
  const propMap = new Map(proposedEvents.map((e) => [e.id, e]));
  const diff: ScheduleDiffItem[] = [];
  let sessionsAdded = 0;
  let sessionsMoved = 0;
  let sessionsRemoved = 0;

  for (const ev of proposedEvents) {
    const parentGoal = findGoalForEvent(ev, goals);
    const energy = ev.energyLevel || (parentGoal ? inferGoalEnergyLevel(parentGoal) : "moderate");
    const energyBadge =
      energy === "deep_focus" ? "Deep Focus" : energy === "light_recharge" ? "Light Recharge" : "Steady Flow";

    const orig = origMap.get(ev.id);
    if (!orig) {
      sessionsAdded++;
      diff.push({
        id: ev.id,
        type: "added",
        title: ev.title,
        goalId: ev.goalId || parentGoal?.id,
        goalName: parentGoal?.name,
        newStart: ev.start,
        newEnd: ev.end,
        reason: reasonMap.get(ev.id) || `Auto-planned within active availability & recovery buffers`,
        energyBadge
      });
    } else if (orig.start !== ev.start || orig.end !== ev.end) {
      sessionsMoved++;
      diff.push({
        id: ev.id,
        type: "moved",
        title: ev.title,
        goalId: ev.goalId || parentGoal?.id,
        goalName: parentGoal?.name,
        oldStart: orig.start,
        oldEnd: orig.end,
        newStart: ev.start,
        newEnd: ev.end,
        reason: reasonMap.get(ev.id) || `Re-aligned for zero overlap, recovery buffer, and peak energy`,
        energyBadge
      });
    } else {
      diff.push({
        id: ev.id,
        type: "retained",
        title: ev.title,
        goalId: ev.goalId || parentGoal?.id,
        goalName: parentGoal?.name,
        newStart: ev.start,
        newEnd: ev.end,
        reason: "Already optimal and conflict-free",
        energyBadge
      });
    }
  }

  for (const orig of originalEvents) {
    if (!propMap.has(orig.id)) {
      sessionsRemoved++;
      diff.push({
        id: orig.id,
        type: "deleted",
        title: orig.title,
        goalId: orig.goalId,
        oldStart: orig.start,
        oldEnd: orig.end,
        reason: "Pruned duplicate or excess weekly quota block"
      });
    }
  }

  return { diff, sessionsAdded, sessionsMoved, sessionsRemoved };
}

export function buildUnifiedScheduleProposal({
  mode = "auto_plan_goals",
  prompt = "",
  goals = [],
  events = [],
  availability = [],
  energyProfile = DEFAULT_USER_ENERGY_PROFILE,
  burnoutLimits,
  currentDate = new Date().toISOString()
}: {
  mode?: string;
  prompt?: string;
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
  burnoutLimits?: DailyBurnoutLimits;
  currentDate?: string;
}): AIScheduleProposal {
  const refDate = new Date(currentDate);
  const bufferMins = getEffectiveBufferMinutes(energyProfile);
  const reasonMap = new Map<string, string>();
  const reasoning: string[] = [];

  // Step 1: Self-heal collisions & overdue items
  const healResult = autonomousSelfHealCalendar({
    events,
    goals,
    availability,
    energyProfile,
    burnoutLimits,
    pacing: "balanced"
  });

  let workingEvents = healResult.healedEvents;

  // Step 2: Run unified auto-planner (rebuilds uncompleted auto-scheduled slots cleanly in energy/align mode)
  const rebuildAuto = mode === "energy_chronotype_align";
  const autoResult = runUnifiedAutoScheduler({
    goals,
    events: workingEvents,
    availability,
    energyProfile,
    burnoutLimits,
    horizonDays: 14,
    rebuildAutoScheduled: rebuildAuto,
    refDate
  });
  workingEvents = autoResult.optimizedEvents;

  if (healResult.overdueRescheduledCount > 0) {
    reasoning.push(`Rebalanced ${healResult.overdueRescheduledCount} overdue session(s) into upcoming active windows.`);
  }
  if (healResult.collisionsResolvedCount > 0) {
    reasoning.push(`Resolved ${healResult.collisionsResolvedCount} overlapping conflict(s) with ${bufferMins}m recovery buffers.`);
  }
  if (autoResult.addedCount > 0) {
    reasoning.push(`Planned ${autoResult.addedCount} new session(s) honoring inactive days and daily burnout caps.`);
  }
  if (autoResult.slumpAdjusted > 0) {
    reasoning.push(`Shifted ${autoResult.slumpAdjusted} deep-focus block(s) out of biological slump windows.`);
  }
  if (autoResult.buffersAdded > 0) {
    reasoning.push(`Enforced ${autoResult.buffersAdded} recovery buffer gap(s) (${bufferMins}m) between consecutive sessions.`);
  }
  if (autoResult.urgentGoalsBoosted.length > 0) {
    reasoning.push(`Boosted priority for approaching exam/deadline goals: ${autoResult.urgentGoalsBoosted.join(", ")}.`);
  }
  if (autoResult.flexedCount > 0) {
    reasoning.push(`Flexed ${autoResult.flexedCount} session(s) to secondary active-day slots because preferred windows were full.`);
  }
  if (reasoning.length === 0) {
    reasoning.push("Calendar verified: All active goals are collision-free, buffered, and aligned with your energy curve.");
  }

  const { diff, sessionsAdded, sessionsMoved, sessionsRemoved } = computeScheduleDiff(
    events,
    workingEvents,
    goals,
    reasonMap
  );

  const totalHoursScheduled =
    Math.round(
      workingEvents.reduce((acc, ev) => {
        const dur = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / (1000 * 60 * 60);
        return acc + Math.max(0, dur);
      }, 0) * 10
    ) / 10;

  // Calculate average energy fit score across active events
  const activeEvts = workingEvents.filter((e) => !e.completed && e.type !== "external");
  const avgEnergyScore =
    activeEvts.length > 0
      ? Math.round(
          activeEvts.reduce(
            (sum, ev) => sum + calculateEventEnergyFit(ev, findGoalForEvent(ev, goals), energyProfile).fitScore,
            0
          ) / activeEvts.length
        )
      : 95;

  let title = "AI Schedule Autopilot Plan";
  if (mode === "deconflict_and_heal") title = "Collision Deconfliction & Buffer Healing";
  else if (mode === "catch_up_rebalance") title = "Catch-Up Rebalance & Recovery";
  else if (mode === "energy_chronotype_align") title = "Chronotype & Bio-Energy Alignment";
  else if (prompt) title = `AI Schedule: "${prompt.slice(0, 42)}"`;

  const activeGoalCount = goals.filter((g) => !g.isPaused).length;

  return {
    title,
    summary: `Analyzed ${activeGoalCount} active goal(s) with ${bufferMins}m buffers and strict inactive-day guards. Added ${sessionsAdded}, shifted ${sessionsMoved}, and removed ${sessionsRemoved} redundant session(s).`,
    reasoning,
    proposedEvents: workingEvents,
    diff,
    stats: {
      sessionsAdded,
      sessionsMoved,
      sessionsRemoved,
      totalHoursScheduled,
      energyScore: avgEnergyScore
    },
    aiGenerated: false
  };
}

/**
 * Validates and repairs an LLM-generated schedule proposal so hard constraints
 * (completed history, external events, inactive days, zero overlaps, recovery buffers)
 * can never be violated by model output.
 */
export function validateAndRepairScheduleProposal({
  proposal,
  originalEvents,
  goals,
  availability,
  energyProfile = DEFAULT_USER_ENERGY_PROFILE,
  burnoutLimits
}: {
  proposal: Partial<AIScheduleProposal>;
  originalEvents: CalendarEvent[];
  goals: Goal[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
  burnoutLimits?: DailyBurnoutLimits;
}): AIScheduleProposal {
  const nowMs = Date.now();
  const bufferMins = getEffectiveBufferMinutes(energyProfile);
  const bufferMs = bufferMins * 60 * 1000;

  // Always preserve all completed and external original events intact
  const anchoredEvents: CalendarEvent[] = originalEvents
    .filter((e) => e.completed || e.type === "external")
    .map((e) => ({ ...e }));
  const anchoredIds = new Set(anchoredEvents.map((e) => e.id));

  const candidateEvents = Array.isArray(proposal.proposedEvents) ? proposal.proposedEvents : [];
  const validatedEvents: CalendarEvent[] = [...anchoredEvents];

  for (const rawEv of candidateEvents) {
    if (!rawEv || !rawEv.start || !rawEv.end) continue;
    if (anchoredIds.has(rawEv.id)) continue;

    const startDate = new Date(rawEv.start);
    const endDate = new Date(rawEv.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      continue;
    }

    const parentGoal = findGoalForEvent(rawEv, goals);
    const taskEnergy = rawEv.energyLevel || (parentGoal ? inferGoalEnergyLevel(parentGoal) : "moderate");
    const durMins = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000));

    const avail = getAvailabilityBoundsForDay(startDate, availability);
    const sHour = startDate.getHours() + startDate.getMinutes() / 60;
    const eHour = sHour + durMins / 60;
    const insideAvail = avail.active && sHour >= avail.startHour - 0.001 && eHour <= avail.endHour + 0.001;

    const violatesBufferOrCollision = validatedEvents.some((other) => {
      const os = new Date(other.start).getTime();
      const oe = new Date(other.end).getTime();
      return startDate.getTime() - bufferMs < oe && endDate.getTime() + bufferMs > os;
    });

    if (insideAvail && !violatesBufferOrCollision) {
      validatedEvents.push({
        ...rawEv,
        completed: false,
        energyLevel: taskEnergy
      });
    } else {
      // Repair into nearest valid buffered slot on an active day
      let repaired: ScoredSlotResult | null = null;
      for (const allowTier2Flex of [false, true]) {
        for (let offset = 0; offset <= 10 && !repaired; offset++) {
          const candDay = new Date(startDate);
          candDay.setDate(startDate.getDate() + offset);
          repaired = findBestSlotForGoalSession({
            day: candDay,
            durationMinutes: durMins,
            goal: parentGoal,
            taskEnergy,
            events: validatedEvents,
            availability,
            energyProfile,
            burnoutLimits,
            nowMs,
            allowTier2Flex
          });
        }
        if (repaired) break;
      }

      if (repaired) {
        validatedEvents.push({
          ...rawEv,
          start: repaired.start.toISOString(),
          end: repaired.end.toISOString(),
          completed: false,
          energyLevel: taskEnergy,
          notes: (rawEv.notes ? rawEv.notes + " | " : "") + `Validated with ${bufferMins}m buffer & active-day guard`
        });
      }
    }
  }

  const { optimizedEvents } = sanitizeAndOptimizeSchedule(validatedEvents, goals, energyProfile, availability);
  const { diff, sessionsAdded, sessionsMoved, sessionsRemoved } = computeScheduleDiff(
    originalEvents,
    optimizedEvents,
    goals
  );

  const totalHoursScheduled =
    Math.round(
      optimizedEvents.reduce((acc, ev) => {
        const dur = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / (1000 * 60 * 60);
        return acc + Math.max(0, dur);
      }, 0) * 10
    ) / 10;

  const activeEvts = optimizedEvents.filter((e) => !e.completed && e.type !== "external");
  const avgEnergyScore =
    activeEvts.length > 0
      ? Math.round(
          activeEvts.reduce(
            (sum, ev) => sum + calculateEventEnergyFit(ev, findGoalForEvent(ev, goals), energyProfile).fitScore,
            0
          ) / activeEvts.length
        )
      : 95;

  return {
    title: proposal.title || "AI Schedule Plan",
    summary:
      proposal.summary ||
      `Validated schedule with ${sessionsAdded} added, ${sessionsMoved} shifted, and ${bufferMins}m recovery buffers.`,
    reasoning: Array.isArray(proposal.reasoning) && proposal.reasoning.length > 0 ? proposal.reasoning : ["Validated all events against inactive days, collisions, and recovery buffers."],
    proposedEvents: optimizedEvents,
    diff,
    stats: {
      sessionsAdded,
      sessionsMoved,
      sessionsRemoved,
      totalHoursScheduled,
      energyScore: avgEnergyScore
    },
    aiGenerated: true
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

  events.forEach((ev) => {
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
  availability,
  energyProfile = DEFAULT_USER_ENERGY_PROFILE
}: {
  completedEvent: CalendarEvent;
  goal?: Goal;
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
}): {
  addedReviewEvents: CalendarEvent[];
} {
  const result: CalendarEvent[] = [];
  const intervals = [3, 7];

  for (const intervalDays of intervals) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + intervalDays);

    // Respect inactive days when placing spaced-repetition recall boosters
    for (let searchOffset = 0; searchOffset <= 3; searchOffset++) {
      const candDay = new Date(targetDate);
      candDay.setDate(targetDate.getDate() + searchOffset);
      const slot = findBestSlotForGoalSession({
        day: candDay,
        durationMinutes: 15,
        goal,
        taskEnergy: "light_recharge",
        events: [...events, ...result],
        availability,
        energyProfile,
        nowMs: Date.now(),
        allowTier2Flex: true,
        enforceBurnoutCap: false
      });

      if (slot) {
        result.push({
          id: `review_${completedEvent.id}_d${intervalDays}_${Date.now()}`,
          title: `Refresher (${intervalDays}d Recall): ${completedEvent.title}`,
          type: "study",
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
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
