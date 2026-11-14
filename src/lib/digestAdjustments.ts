import {
  AvailabilityWindow,
  CalendarEvent,
  DigestAdjustmentActionType,
  DigestAdjustmentItem,
  DigestAdjustmentParams,
  Goal,
  GoalType,
  SessionSubStep,
  TimePreference,
  UserEnergyProfile
} from "../types";

export interface NextWeekRange {
  start: Date;
  end: Date;
  days: Date[];
  label: string;
}

export interface AdjustmentPreviewResult {
  canApply: boolean;
  headline: string;
  badgeText: string;
  affectedEventsCount: number;
  affectedGoalsCount: number;
  defaultCatchUpDay?: number;
}

export interface AdjustmentExecutionResult {
  updatedGoals: Goal[];
  updatedEvents: CalendarEvent[];
  summary: string;
  details: string[];
  affectedEventsCount: number;
  affectedGoalsCount: number;
  targetDate: Date;
  highlightedEventId?: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getNextWeekRange(referenceDate: Date = new Date()): NextWeekRange {
  const base = new Date(referenceDate);
  base.setHours(0, 0, 0, 0);
  const daysUntilNextSunday = (7 - base.getDay()) % 7 || 7;

  const start = new Date(base);
  start.setDate(base.getDate() + daysUntilNextSunday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return {
    start,
    end,
    days,
    label: `${fmt(start)} – ${fmt(end)}`
  };
}

function parseTimeDecimal(hhmm?: string, fallback = 9): number {
  if (!hhmm || !hhmm.includes(":")) return fallback;
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h)) return fallback;
  return h + (isNaN(m) ? 0 : m) / 60;
}

function goalTypeToEventType(type: GoalType): CalendarEvent["type"] {
  switch (type) {
    case GoalType.WORKOUT:
      return "workout";
    case GoalType.STUDY:
      return "study";
    case GoalType.JOB_SEARCH:
      return "job_search";
    case GoalType.SIDE_PROJECT:
      return "side_project";
    case GoalType.ROUTINE:
      return "routine";
    default:
      return "personal";
  }
}

function getGoalPreferredWindow(
  goal: Goal,
  availDay?: AvailabilityWindow
): { start: number; end: number } {
  const availStart = availDay ? parseTimeDecimal(availDay.startTime, 8) : 8;
  const availEnd = availDay ? parseTimeDecimal(availDay.endTime, 22) : 22;

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
    prefEnd = Math.max(availEnd, 22);
  } else if (goal.timePreference === TimePreference.NIGHT) {
    prefStart = Math.max(availStart, 21);
    prefEnd = 23.5;
  } else if (goal.timePreference === TimePreference.CUSTOM && goal.customTimeStart && goal.customTimeEnd) {
    prefStart = parseTimeDecimal(goal.customTimeStart, availStart);
    prefEnd = parseTimeDecimal(goal.customTimeEnd, availEnd);
  }

  if (prefStart >= prefEnd) {
    return { start: availStart, end: availEnd };
  }
  return { start: prefStart, end: prefEnd };
}

function findFreeSlotOnDay(
  day: Date,
  durationMinutes: number,
  allEvents: CalendarEvent[],
  availability: AvailabilityWindow[],
  preferredStartHour?: number,
  preferredEndHour?: number,
  bufferMinutes = 10,
  excludeEventId?: string
): { start: Date; end: Date } | null {
  const dow = day.getDay();
  const availDay = availability.find((a) => a.dayOfWeek === dow && a.active);
  const availStart = availDay ? parseTimeDecimal(availDay.startTime, 8) : 8;
  const availEnd = availDay ? parseTimeDecimal(availDay.endTime, 22) : 22;

  const durationHours = Math.max(15, durationMinutes) / 60;
  const dayStr = day.toDateString();
  const dayEvents = allEvents.filter(
    (e) => e.id !== excludeEventId && new Date(e.start).toDateString() === dayStr
  );

  const windows: Array<{ start: number; end: number }> = [];
  if (preferredStartHour !== undefined && preferredEndHour !== undefined && preferredStartHour < preferredEndHour) {
    windows.push({ start: preferredStartHour, end: preferredEndHour });
  }
  windows.push({ start: availStart, end: availEnd });
  windows.push({ start: 7, end: 22.5 });

  for (const win of windows) {
    for (let hrs = win.start; hrs <= win.end - durationHours + 0.001; hrs += 0.5) {
      const slotStart = new Date(day);
      const h = Math.floor(hrs);
      const m = Math.round((hrs - h) * 60);
      slotStart.setHours(h, m, 0, 0);

      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
      if (slotEnd.getDate() !== day.getDate()) continue;

      const bufMs = bufferMinutes * 60 * 1000;
      const hasCollision = dayEvents.some((evt) => {
        const es = new Date(evt.start).getTime() - bufMs;
        const ee = new Date(evt.end).getTime() + bufMs;
        return slotStart.getTime() < ee && slotEnd.getTime() > es;
      });

      if (!hasCollision) {
        return { start: slotStart, end: slotEnd };
      }
    }
  }

  return null;
}

function isNextWeekEvent(evt: CalendarEvent, range: NextWeekRange): boolean {
  const t = new Date(evt.start).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

function isGoalSessionEvent(evt: CalendarEvent): boolean {
  return evt.type !== "external" && Boolean(evt.goalId || evt.type === "study" || evt.type === "workout" || evt.type === "job_search" || evt.type === "side_project" || evt.type === "routine");
}

function hasReviewKeyword(title: string): boolean {
  return /\b(review|recap|consolidat|recall|warm[- ]?up|refresh|flashcard|quiz|sparring)\b/i.test(title);
}

export function classifyAdjustmentText(
  text: string,
  idx: number,
  peakFocusWindow?: string
): DigestAdjustmentItem {
  const lower = text.toLowerCase();

  let parsedHours: { start: number; end: number } | null = null;
  const hourRangeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (hourRangeMatch) {
    let sh = parseInt(hourRangeMatch[1], 10);
    const sm = hourRangeMatch[2] ? parseInt(hourRangeMatch[2], 10) : 0;
    const sampm = hourRangeMatch[3]?.toLowerCase();
    let eh = parseInt(hourRangeMatch[4], 10);
    const em = hourRangeMatch[5] ? parseInt(hourRangeMatch[5], 10) : 0;
    const eampm = hourRangeMatch[6]?.toLowerCase();

    if (sampm === "pm" && sh < 12) sh += 12;
    if (eampm === "pm" && eh < 12) eh += 12;
    if (!sampm && eampm === "pm" && sh < eh && sh < 12) sh += 12;
    if (sampm === "am" && sh === 12) sh = 0;
    if (eampm === "am" && eh === 12) eh = 0;

    if (!isNaN(sh) && !isNaN(eh) && eh > sh) {
      parsedHours = { start: sh + sm / 60, end: eh + em / 60 };
    }
  }

  if (
    lower.includes("frequency") ||
    lower.includes("backlog") ||
    lower.includes("fewer sessions") ||
    lower.includes("daily session") ||
    lower.includes("reduce") && lower.includes("session") ||
    lower.includes("density") ||
    lower.includes("overload")
  ) {
    const numMatch = lower.match(/(?:max|to|at)\s*(\d)\s*(?:sessions?|blocks?)/);
    const maxPerDay = numMatch ? Math.max(1, Math.min(4, parseInt(numMatch[1], 10))) : 2;
    return {
      id: `adj_${idx}_freq`,
      text,
      actionType: "reduce_frequency",
      actionLabel: "Balance Daily Frequency",
      impact: `Caps next week to max ${maxPerDay} goal sessions/day & spreads excess load`,
      params: { maxSessionsPerDay: maxPerDay }
    };
  }

  if (
    lower.includes("review") ||
    lower.includes("subtask") ||
    lower.includes("sub-task") ||
    lower.includes("consolidat") ||
    lower.includes("active recall") ||
    lower.includes("recap")
  ) {
    return {
      id: `adj_${idx}_review`,
      text,
      actionType: "prioritize_review",
      actionLabel: "Prioritize Review First",
      impact: "Moves Review steps first in Study goals & next week's sessions",
      params: { targetGoalScope: "study" }
    };
  }

  if (
    lower.includes("catch-up") ||
    lower.includes("catch up") ||
    lower.includes("clear pending") ||
    lower.includes("dedicated") && (lower.includes("day") || lower.includes("buffer"))
  ) {
    return {
      id: `adj_${idx}_catchup`,
      text,
      actionType: "catch_up_day",
      actionLabel: "Set Catch-Up Day",
      impact: "Reserves a day next week to clear pending tasks without adding new ones",
      params: { catchUpDayOfWeek: 5 } // Default Friday (can be customized in UI)
    };
  }

  if (
    lower.includes("cap") ||
    lower.includes("shorten") ||
    lower.includes("duration") ||
    /\b(25|30|40|45|50)\s*(min|minute|minutes|m)\b/i.test(lower)
  ) {
    const minsMatch = lower.match(/\b(25|30|40|45|50)\s*(?:min|minute|minutes|m)\b/i);
    const maxDur = minsMatch ? parseInt(minsMatch[1], 10) : 45;
    const isEvening = lower.includes("evening") || lower.includes("night") || lower.includes("21:");
    return {
      id: `adj_${idx}_cap`,
      text,
      actionType: "cap_duration",
      actionLabel: `Cap Blocks at ${maxDur}m`,
      impact: `Caps ${isEvening ? "evening " : ""}next-week blocks at ${maxDur}m & prevents late sessions`,
      params: {
        maxDurationMinutes: maxDur,
        cutoffHour: 21,
        targetGoalScope: isEvening ? "evening" : "study"
      }
    };
  }

  if (
    lower.includes("past 21") ||
    lower.includes("past 22") ||
    lower.includes("before 21") ||
    lower.includes("sleep") ||
    lower.includes("buffer") ||
    lower.includes("break") ||
    lower.includes("gap")
  ) {
    return {
      id: `adj_${idx}_buffers`,
      text,
      actionType: "add_buffers",
      actionLabel: "Add Buffers & Cutoff",
      impact: "Adds 15m recovery gaps & moves sessions earlier before 21:00",
      params: { cutoffHour: 21, bufferMinutes: 15 }
    };
  }

  if (
    lower.includes("peak") ||
    lower.includes("window") ||
    lower.includes("slot") ||
    lower.includes("morning") ||
    lower.includes("afternoon") ||
    lower.includes("evening") ||
    lower.includes("light routine") ||
    lower.includes("recovery") ||
    parsedHours !== null
  ) {
    const isLightRoutine =
      lower.includes("light") || lower.includes("routine") || lower.includes("stretching") || lower.includes("moderate");

    let startHour = parsedHours?.start;
    let endHour = parsedHours?.end;
    if (startHour === undefined || endHour === undefined) {
      if (isLightRoutine || lower.includes("afternoon") || lower.includes("post-lunch")) {
        startHour = 14;
        endHour = 16.5;
      } else if (lower.includes("evening") || lower.includes("late-evening")) {
        startHour = 18;
        endHour = 21;
      } else if (peakFocusWindow) {
        const peakMatch = peakFocusWindow.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
        if (peakMatch) {
          startHour = parseInt(peakMatch[1], 10);
          endHour = parseInt(peakMatch[3], 10);
          if (peakFocusWindow.toLowerCase().includes("pm") && endHour < 12) {
            if (startHour < 12) startHour += 12;
            endHour += 12;
          }
        }
      }
    }
    if (startHour === undefined || endHour === undefined) {
      startHour = 9;
      endHour = 12;
    }

    return {
      id: `adj_${idx}_peak`,
      text,
      actionType: "shift_peak_window",
      actionLabel: isLightRoutine ? "Shift Light Tasks" : "Align to Peak Window",
      impact: `Aligns next week's ${isLightRoutine ? "light routines" : "high-focus goals"} to ${Math.floor(startHour)}:00–${Math.floor(endHour)}:00`,
      params: {
        peakStartHour: startHour,
        peakEndHour: endHour,
        targetGoalScope: isLightRoutine ? "light_routines" : "study"
      }
    };
  }

  return {
    id: `adj_${idx}_rebalance`,
    text,
    actionType: "general_rebalance",
    actionLabel: "Optimize Next Week",
    impact: "Rebalances next week's sessions across open, low-friction slots",
    params: { maxSessionsPerDay: 3, bufferMinutes: 10 }
  };
}

export function normalizeDigestAdjustments(
  raw: Array<DigestAdjustmentItem | string> | undefined,
  peakFocusWindow?: string
): DigestAdjustmentItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    if (typeof item === "string") {
      return classifyAdjustmentText(item, idx, peakFocusWindow);
    }
    const fallback = classifyAdjustmentText(item.text || "", idx, peakFocusWindow);
    return {
      id: item.id || fallback.id,
      text: item.text || fallback.text,
      actionType: item.actionType || fallback.actionType,
      actionLabel: item.actionLabel || fallback.actionLabel,
      impact: item.impact || fallback.impact,
      params: { ...fallback.params, ...(item.params || {}) }
    };
  });
}

/**
 * Ensures next week has baseline goal sessions if the user hasn't generated next week yet,
 * so next-week adjustments produce visible, concrete changes on the calendar.
 */
function ensureNextWeekBaselineSessions(
  goals: Goal[],
  events: CalendarEvent[],
  availability: AvailabilityWindow[],
  nextWeek: NextWeekRange,
  skipDayOfWeek?: number
): { seededEvents: CalendarEvent[]; addedCount: number } {
  const activeGoals = goals.filter((g) => !g.isPaused && (g.weeklyTarget || 0) > 0);
  const existingNextWeekGoalEvents = events.filter(
    (e) => isNextWeekEvent(e, nextWeek) && isGoalSessionEvent(e)
  );

  // If next week already has meaningful sessions, keep them as-is
  if (existingNextWeekGoalEvents.length >= Math.min(3, activeGoals.length)) {
    return { seededEvents: [...events], addedCount: 0 };
  }

  const workingEvents = [...events];
  let addedCount = 0;

  for (const goal of activeGoals) {
    const existingForGoal = workingEvents.filter(
      (e) =>
        isNextWeekEvent(e, nextWeek) &&
        (e.goalId === goal.id || e.title.toLowerCase() === goal.name.toLowerCase())
    ).length;

    const needed = Math.max(0, (goal.weeklyTarget || 1) - existingForGoal);
    if (needed === 0) continue;

    let booked = 0;
    // Spread evenly across next week days
    const step = Math.max(1, Math.floor(7 / needed));
    const orderedDays = [...nextWeek.days];
    // Reorder so skipped catch-up day is avoided
    for (let pass = 0; pass < 2 && booked < needed; pass++) {
      for (let i = pass === 0 ? 0 : 1; i < orderedDays.length && booked < needed; i += pass === 0 ? step : 1) {
        const day = orderedDays[i];
        if (skipDayOfWeek !== undefined && day.getDay() === skipDayOfWeek) continue;

        const dayStr = day.toDateString();
        const alreadyGoalOnDay = workingEvents.some(
          (e) =>
            new Date(e.start).toDateString() === dayStr &&
            (e.goalId === goal.id || e.title.toLowerCase() === goal.name.toLowerCase())
        );
        if (alreadyGoalOnDay) continue;

        const availDay = availability.find((a) => a.dayOfWeek === day.getDay() && a.active);
        const prefWin = getGoalPreferredWindow(goal, availDay);
        const slot = findFreeSlotOnDay(
          day,
          goal.durationMinutes || 60,
          workingEvents,
          availability,
          prefWin.start,
          prefWin.end,
          10
        );

        if (slot) {
          workingEvents.push({
            id: `e_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title: goal.name,
            type: goalTypeToEventType(goal.type),
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            goalId: goal.id,
            completed: false,
            notes: `Planned session for ${goal.name}`,
            icon: goal.icon,
            energyLevel: goal.energyLevel,
            subtasks: goal.subtasks && goal.subtasks.length > 0 ? goal.subtasks.map((s) => ({ ...s })) : undefined,
            subSteps: goal.subSteps && goal.subSteps.length > 0 ? goal.subSteps.map((s) => ({ ...s })) : undefined
          });
          booked++;
          addedCount++;
        }
      }
    }
  }

  return { seededEvents: workingEvents, addedCount };
}

export function pickOptimalCatchUpDay(
  events: CalendarEvent[],
  nextWeek: NextWeekRange
): number {
  // Prefer Friday (5), Wednesday (3), or Sunday (0) — pick whichever has fewest existing events next week
  const candidateDows = [5, 3, 6, 0, 4, 2, 1];
  let bestDow = 5;
  let minCount = Infinity;

  for (const dow of candidateDows) {
    const day = nextWeek.days.find((d) => d.getDay() === dow);
    if (!day) continue;
    const dayStr = day.toDateString();
    const count = events.filter((e) => new Date(e.start).toDateString() === dayStr).length;
    if (count < minCount) {
      minCount = count;
      bestDow = dow;
    }
  }
  return bestDow;
}

export function previewAdjustmentForNextWeek(
  item: DigestAdjustmentItem,
  goals: Goal[],
  events: CalendarEvent[],
  availability: AvailabilityWindow[],
  _userEnergyProfile?: UserEnergyProfile,
  overrideParams?: Partial<DigestAdjustmentParams>
): AdjustmentPreviewResult {
  const nextWeek = getNextWeekRange();
  const params = { ...(item.params || {}), ...(overrideParams || {}) };
  const nextWeekGoalEvents = events.filter(
    (e) => isNextWeekEvent(e, nextWeek) && isGoalSessionEvent(e) && !e.completed
  );
  const activeGoals = goals.filter((g) => !g.isPaused);

  switch (item.actionType) {
    case "reduce_frequency": {
      const maxPerDay = params.maxSessionsPerDay ?? 2;
      const dayCounts = new Map<string, number>();
      nextWeekGoalEvents.forEach((e) => {
        const key = new Date(e.start).toDateString();
        dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
      });
      const overloadedDays = Array.from(dayCounts.values()).filter((c) => c > maxPerDay).length;
      const targetCapCount = activeGoals.filter((g) => g.weeklyTarget > 3).length;
      return {
        canApply: activeGoals.length > 0 || nextWeekGoalEvents.length > 0,
        headline: `Max ${maxPerDay} sessions/day for ${nextWeek.label}`,
        badgeText:
          overloadedDays > 0
            ? `${overloadedDays} busy day${overloadedDays > 1 ? "s" : ""} to rebalance`
            : targetCapCount > 0
              ? `Paces ${targetCapCount} high-frequency goal${targetCapCount > 1 ? "s" : ""}`
              : `Balances ${nextWeekGoalEvents.length || activeGoals.length} next-week blocks`,
        affectedEventsCount: nextWeekGoalEvents.length,
        affectedGoalsCount: targetCapCount || activeGoals.length
      };
    }

    case "prioritize_review": {
      const studyGoals = activeGoals.filter(
        (g) => g.type === GoalType.STUDY || g.type === GoalType.SIDE_PROJECT || (g.subSteps && g.subSteps.length > 0) || (g.subtasks && g.subtasks.length > 0)
      );
      const reviewTargetCount = studyGoals.length || activeGoals.length;
      return {
        canApply: reviewTargetCount > 0 || nextWeekGoalEvents.length > 0,
        headline: `Review-first session blueprint`,
        badgeText: `${reviewTargetCount} goal${reviewTargetCount === 1 ? "" : "s"} • Review moved to Step 1`,
        affectedEventsCount: nextWeekGoalEvents.length,
        affectedGoalsCount: reviewTargetCount
      };
    }

    case "catch_up_day": {
      const dow = params.catchUpDayOfWeek ?? pickOptimalCatchUpDay(events, nextWeek);
      const pendingPast = events.filter(
        (e) => !e.completed && isGoalSessionEvent(e) && new Date(e.start).getTime() < nextWeek.start.getTime()
      );
      return {
        canApply: true,
        headline: `Dedicated Catch-Up Day: ${DAY_NAMES[dow]}`,
        badgeText:
          pendingPast.length > 0
            ? `Moves ${Math.min(4, pendingPast.length)} pending task${pendingPast.length > 1 ? "s" : ""} to ${SHORT_DAY_NAMES[dow]}`
            : `Keeps ${SHORT_DAY_NAMES[dow]} clear for review & catch-up`,
        affectedEventsCount: pendingPast.length,
        affectedGoalsCount: 0,
        defaultCatchUpDay: dow
      };
    }

    case "cap_duration": {
      const maxDur = params.maxDurationMinutes ?? 45;
      const longEvents = nextWeekGoalEvents.filter((e) => {
        const dur = Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000);
        return dur > maxDur;
      });
      const longGoals = activeGoals.filter((g) => g.durationMinutes > maxDur);
      return {
        canApply: activeGoals.length > 0 || nextWeekGoalEvents.length > 0,
        headline: `Cap blocks at ${maxDur}m next week`,
        badgeText: `${longEvents.length || longGoals.length || activeGoals.length} blocks shortened to ${maxDur}m`,
        affectedEventsCount: longEvents.length,
        affectedGoalsCount: longGoals.length
      };
    }

    case "shift_peak_window": {
      const sh = Math.floor(params.peakStartHour ?? 9);
      const eh = Math.floor(params.peakEndHour ?? 12);
      return {
        canApply: activeGoals.length > 0 || nextWeekGoalEvents.length > 0,
        headline: `Align ${params.targetGoalScope === "light_routines" ? "light routines" : "focus blocks"} (${sh}:00–${eh}:00)`,
        badgeText: `${nextWeekGoalEvents.length || activeGoals.length} blocks checked for alignment`,
        affectedEventsCount: nextWeekGoalEvents.length,
        affectedGoalsCount: activeGoals.length
      };
    }

    case "add_buffers": {
      const cutoff = params.cutoffHour ?? 21;
      const lateCount = nextWeekGoalEvents.filter((e) => {
        const end = new Date(e.end);
        return end.getHours() + end.getMinutes() / 60 > cutoff;
      }).length;
      return {
        canApply: activeGoals.length > 0 || nextWeekGoalEvents.length > 0,
        headline: `15m buffers + ${cutoff}:00 cutoff`,
        badgeText: lateCount > 0 ? `${lateCount} late block${lateCount > 1 ? "s" : ""} moved earlier` : `Spacing & evening protection`,
        affectedEventsCount: nextWeekGoalEvents.length,
        affectedGoalsCount: 0
      };
    }

    default:
      return {
        canApply: activeGoals.length > 0 || nextWeekGoalEvents.length > 0,
        headline: `Optimize ${nextWeek.label}`,
        badgeText: `${nextWeekGoalEvents.length || activeGoals.length} sessions checked`,
        affectedEventsCount: nextWeekGoalEvents.length,
        affectedGoalsCount: activeGoals.length
      };
  }
}

export function applyAdjustmentForNextWeek(
  item: DigestAdjustmentItem,
  goals: Goal[],
  events: CalendarEvent[],
  availability: AvailabilityWindow[],
  userEnergyProfile?: UserEnergyProfile,
  overrideParams?: Partial<DigestAdjustmentParams>
): AdjustmentExecutionResult {
  const nextWeek = getNextWeekRange();
  const params: DigestAdjustmentParams = { ...(item.params || {}), ...(overrideParams || {}) };

  let workingGoals: Goal[] = goals.map((g) => ({
    ...g,
    subSteps: g.subSteps ? g.subSteps.map((s) => ({ ...s })) : undefined,
    subtasks: g.subtasks ? g.subtasks.map((s) => ({ ...s })) : undefined
  }));

  // Ensure next week has concrete goal sessions if it's currently empty
  const skipSeedDow = item.actionType === "catch_up_day"
    ? (params.catchUpDayOfWeek ?? pickOptimalCatchUpDay(events, nextWeek))
    : undefined;
  const { seededEvents, addedCount: seededCount } = ensureNextWeekBaselineSessions(
    workingGoals,
    events,
    availability,
    nextWeek,
    skipSeedDow
  );
  let workingEvents: CalendarEvent[] = seededEvents.map((e) => ({
    ...e,
    subSteps: e.subSteps ? e.subSteps.map((s) => ({ ...s })) : undefined,
    subtasks: e.subtasks ? e.subtasks.map((s) => ({ ...s })) : undefined
  }));

  const details: string[] = [];
  if (seededCount > 0) {
    details.push(`Populated ${seededCount} baseline session${seededCount > 1 ? "s" : ""} into ${nextWeek.label} so adjustments appear on your calendar.`);
  }

  let affectedEventsCount = 0;
  let affectedGoalsCount = 0;
  let targetDate = nextWeek.start;
  let highlightedEventId: string | undefined;

  if (item.actionType === "reduce_frequency") {
    const maxPerDay = Math.max(1, Math.min(4, params.maxSessionsPerDay ?? 2));
    const priorityRank = (gId?: string) => {
      const g = workingGoals.find((x) => x.id === gId);
      if (!g) return 2;
      return g.priority === "critical" ? 0 : g.priority === "important" ? 1 : 2;
    };

    // 1. Reduce weeklyTarget by 1 on high-frequency non-critical goals (>= 4/week) to curb chronic backlog
    const totalWeeklySessionsRequested = workingGoals
      .filter((g) => !g.isPaused)
      .reduce((sum, g) => sum + (g.weeklyTarget || 0), 0);

    if (totalWeeklySessionsRequested > maxPerDay * 6) {
      workingGoals = workingGoals.map((g) => {
        if (!g.isPaused && g.weeklyTarget >= 4 && g.priority !== "critical") {
          affectedGoalsCount++;
          const nextTarget = Math.max(2, g.weeklyTarget - 1);
          details.push(`Adjusted "${g.name}" pace from ${g.weeklyTarget}×/wk → ${nextTarget}×/wk to prevent backlog.`);
          return { ...g, weeklyTarget: nextTarget };
        }
        return g;
      });
    }

    // 2. Rebalance next-week days exceeding maxPerDay
    const getNextWeekDayCount = (dStr: string) =>
      workingEvents.filter(
        (e) =>
          isNextWeekEvent(e, nextWeek) &&
          isGoalSessionEvent(e) &&
          !e.completed &&
          new Date(e.start).toDateString() === dStr
      ).length;

    let movedCount = 0;
    let trimmedCount = 0;

    for (const day of nextWeek.days) {
      const dayStr = day.toDateString();
      const dayGoalEvents = workingEvents
        .filter(
          (e) =>
            isNextWeekEvent(e, nextWeek) &&
            isGoalSessionEvent(e) &&
            !e.completed &&
            new Date(e.start).toDateString() === dayStr
        )
        .sort((a, b) => priorityRank(b.goalId) - priorityRank(a.goalId)); // move lower priority first

      if (dayGoalEvents.length <= maxPerDay) continue;

      const overflowEvents = dayGoalEvents.slice(0, dayGoalEvents.length - maxPerDay);
      for (const overflowEvt of overflowEvents) {
        const durMins = Math.max(
          20,
          Math.round((new Date(overflowEvt.end).getTime() - new Date(overflowEvt.start).getTime()) / 60000)
        );
        // Find lightest day in next week under maxPerDay that doesn't already have this goal
        const candidateDays = [...nextWeek.days]
          .filter((d) => d.toDateString() !== dayStr)
          .sort((a, b) => getNextWeekDayCount(a.toDateString()) - getNextWeekDayCount(b.toDateString()));

        let placed = false;
        for (const candDay of candidateDays) {
          const candStr = candDay.toDateString();
          if (getNextWeekDayCount(candStr) >= maxPerDay) continue;

          const sameGoalOnDay = workingEvents.some(
            (e) =>
              e.id !== overflowEvt.id &&
              new Date(e.start).toDateString() === candStr &&
              ((overflowEvt.goalId && e.goalId === overflowEvt.goalId) || e.title === overflowEvt.title)
          );
          if (sameGoalOnDay) continue;

          const goalObj = workingGoals.find((g) => g.id === overflowEvt.goalId);
          const availDay = availability.find((a) => a.dayOfWeek === candDay.getDay() && a.active);
          const prefWin = goalObj ? getGoalPreferredWindow(goalObj, availDay) : { start: 8, end: 21 };

          const freeSlot = findFreeSlotOnDay(
            candDay,
            durMins,
            workingEvents,
            availability,
            prefWin.start,
            prefWin.end,
            15,
            overflowEvt.id
          );

          if (freeSlot) {
            workingEvents = workingEvents.map((e) =>
              e.id === overflowEvt.id
                ? {
                    ...e,
                    start: freeSlot.start.toISOString(),
                    end: freeSlot.end.toISOString(),
                    notes: `${e.notes ? e.notes + " • " : ""}Rebalanced for max ${maxPerDay}/day pace`
                  }
                : e
            );
            movedCount++;
            affectedEventsCount++;
            if (!highlightedEventId) highlightedEventId = overflowEvt.id;
            targetDate = freeSlot.start;
            placed = true;
            break;
          }
        }

        // If every day in next week is already at capacity, trim lowest-priority overflow if over weekly target
        if (!placed) {
          const goalObj = workingGoals.find((g) => g.id === overflowEvt.goalId);
          const remainingForGoal = workingEvents.filter(
            (e) => e.id !== overflowEvt.id && isNextWeekEvent(e, nextWeek) && e.goalId === overflowEvt.goalId
          ).length;
          if (!goalObj || remainingForGoal >= Math.max(1, goalObj.weeklyTarget - 1)) {
            workingEvents = workingEvents.filter((e) => e.id !== overflowEvt.id);
            trimmedCount++;
            affectedEventsCount++;
          }
        }
      }
    }

    if (movedCount > 0) {
      details.push(`Spread ${movedCount} clustered next-week session${movedCount > 1 ? "s" : ""} onto lighter days (max ${maxPerDay}/day).`);
    }
    if (trimmedCount > 0) {
      details.push(`Cleared ${trimmedCount} excess next-week session${trimmedCount > 1 ? "s" : ""} that exceeded your sustainable daily cap.`);
    }
    if (details.length === 0) {
      details.push(`Verified next week (${nextWeek.label}) respects a sustainable ${maxPerDay} sessions/day cap.`);
    }

    return {
      updatedGoals: workingGoals,
      updatedEvents: workingEvents,
      summary: `Balanced next week to max ${maxPerDay} sessions/day${movedCount > 0 ? ` (${movedCount} moved)` : ""}.`,
      details,
      affectedEventsCount,
      affectedGoalsCount,
      targetDate,
      highlightedEventId
    };
  }

  if (item.actionType === "prioritize_review") {
    const reorderSubSteps = (steps: SessionSubStep[] | undefined, totalMins: number): { next: SessionSubStep[]; changed: boolean } => {
      if (steps && steps.length > 0) {
        const reviewIdx = steps.findIndex((s) => hasReviewKeyword(s.title));
        if (reviewIdx === 0) {
          return { next: steps, changed: false };
        }
        if (reviewIdx > 0) {
          const reviewStep = { ...steps[reviewIdx], completed: false };
          const others = steps.filter((_, idx) => idx !== reviewIdx);
          return { next: [reviewStep, ...others], changed: true };
        }
        // No review step yet: prepend a dedicated Review step first and rebalance longest step
        const reviewMins = totalMins >= 45 ? 15 : 10;
        const copy = steps.map((s) => ({ ...s }));
        let longestIdx = 0;
        copy.forEach((s, idx) => {
          if (s.durationMinutes > copy[longestIdx].durationMinutes) longestIdx = idx;
        });
        if (copy[longestIdx].durationMinutes > reviewMins + 10) {
          copy[longestIdx].durationMinutes -= reviewMins;
        }
        const reviewStep: SessionSubStep = {
          id: `step_rev_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          title: "Review & Consolidate Previous Material",
          durationMinutes: reviewMins,
          description: "Active recall & quick recap before starting new concepts",
          completed: false
        };
        return { next: [reviewStep, ...copy], changed: true };
      }

      // Goal/event didn't have subSteps yet -> create structured Review-first micro-steps
      const reviewMins = totalMins >= 45 ? 15 : 10;
      const coreMins = Math.max(15, totalMins - reviewMins);
      return {
        next: [
          {
            id: `step_rev_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            title: "Review & Consolidate Previous Material",
            durationMinutes: reviewMins,
            description: "Summarize prior takeaways & drill weak points first",
            completed: false
          },
          {
            id: `step_core_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            title: "Core New Material & Practice",
            durationMinutes: coreMins,
            description: "Deep focus on new lesson modules after review",
            completed: false
          }
        ],
        changed: true
      };
    };

    const prioritizeSubtasks = (subtasks?: Goal["subtasks"]) => {
      if (!subtasks || subtasks.length === 0) return { next: subtasks, changed: false };
      const idx = subtasks.findIndex((s) => !s.completed && hasReviewKeyword(s.title));
      if (idx > 0) {
        const picked = subtasks[idx];
        const rest = subtasks.filter((_, i) => i !== idx);
        return { next: [picked, ...rest], changed: true };
      }
      if (idx === -1) {
        return {
          next: [
            {
              id: `st_rev_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
              title: "Review previous session notes before new material",
              completed: false,
              durationMinutes: 10
            },
            ...subtasks
          ],
          changed: true
        };
      }
      return { next: subtasks, changed: false };
    };

    const targetGoalIds = new Set<string>();
    workingGoals = workingGoals.map((g) => {
      if (g.isPaused) return g;
      const isLearningGoal =
        g.type === GoalType.STUDY ||
        g.type === GoalType.SIDE_PROJECT ||
        g.type === GoalType.JOB_SEARCH ||
        (g.subSteps && g.subSteps.length > 0) ||
        (g.subtasks && g.subtasks.length > 0);

      if (!isLearningGoal) return g;

      const stepRes = reorderSubSteps(g.subSteps, g.durationMinutes || 45);
      const taskRes = prioritizeSubtasks(g.subtasks);
      if (stepRes.changed || taskRes.changed) {
        affectedGoalsCount++;
        targetGoalIds.add(g.id);
        return {
          ...g,
          subSteps: stepRes.next,
          subtasks: taskRes.next
        };
      }
      return g;
    });

    workingEvents = workingEvents.map((evt) => {
      if (!isNextWeekEvent(evt, nextWeek) || evt.completed) return evt;
      const isLearningEvt =
        evt.type === "study" ||
        evt.type === "side_project" ||
        evt.type === "job_search" ||
        (evt.goalId && targetGoalIds.has(evt.goalId)) ||
        (evt.subSteps && evt.subSteps.length > 0) ||
        (evt.subtasks && evt.subtasks.length > 0);

      if (!isLearningEvt) return evt;

      const durMins = Math.max(
        25,
        Math.round((new Date(evt.end).getTime() - new Date(evt.start).getTime()) / 60000)
      );
      const matchingGoal = workingGoals.find((g) => g.id === evt.goalId);
      const stepRes =
        evt.subSteps && evt.subSteps.length > 0
          ? reorderSubSteps(evt.subSteps, durMins)
          : matchingGoal?.subSteps
            ? { next: matchingGoal.subSteps.map((s) => ({ ...s, completed: false })), changed: true }
            : reorderSubSteps(undefined, durMins);

      const taskRes = prioritizeSubtasks(evt.subtasks);

      if (stepRes.changed || taskRes.changed) {
        affectedEventsCount++;
        if (!highlightedEventId) highlightedEventId = evt.id;
        return {
          ...evt,
          subSteps: stepRes.next,
          subtasks: taskRes.next,
          notes: evt.notes?.includes("Review-First") ? evt.notes : `Review-First Focus • ${evt.notes || evt.title}`
        };
      }
      return evt;
    });

    details.push(
      `Prioritized Review & Consolidation as Step 1 across ${affectedGoalsCount} study goal${affectedGoalsCount === 1 ? "" : "s"} and ${affectedEventsCount} next-week session${affectedEventsCount === 1 ? "" : "s"}.`
    );

    return {
      updatedGoals: workingGoals,
      updatedEvents: workingEvents,
      summary: `Prioritized Review subtasks first across ${affectedGoalsCount} goals & ${affectedEventsCount} next-week sessions.`,
      details,
      affectedEventsCount,
      affectedGoalsCount,
      targetDate,
      highlightedEventId
    };
  }

  if (item.actionType === "catch_up_day") {
    const catchUpDow = params.catchUpDayOfWeek ?? pickOptimalCatchUpDay(workingEvents, nextWeek);
    const catchUpDay = nextWeek.days.find((d) => d.getDay() === catchUpDow) || nextWeek.days[5];
    const catchUpDayStr = catchUpDay.toDateString();
    targetDate = catchUpDay;

    // 1. Move any NEW regular (non-catch-up) uncompleted goal sessions off the Catch-Up Day so no new sessions are added on that day
    const regularOnCatchUp = workingEvents.filter(
      (e) =>
        new Date(e.start).toDateString() === catchUpDayStr &&
        isGoalSessionEvent(e) &&
        !e.completed &&
        !e.isBufferCatchUp
    );

    let clearedNewCount = 0;
    for (const evt of regularOnCatchUp) {
      const durMins = Math.max(20, Math.round((new Date(evt.end).getTime() - new Date(evt.start).getTime()) / 60000));
      const otherDays = nextWeek.days
        .filter((d) => d.toDateString() !== catchUpDayStr)
        .sort((a, b) => {
          const ca = workingEvents.filter((x) => new Date(x.start).toDateString() === a.toDateString()).length;
          const cb = workingEvents.filter((x) => new Date(x.start).toDateString() === b.toDateString()).length;
          return ca - cb;
        });

      for (const altDay of otherDays) {
        const altStr = altDay.toDateString();
        const sameGoalOnAlt = workingEvents.some(
          (x) =>
            x.id !== evt.id &&
            new Date(x.start).toDateString() === altStr &&
            ((evt.goalId && x.goalId === evt.goalId) || x.title === evt.title)
        );
        if (sameGoalOnAlt) continue;

        const goalObj = workingGoals.find((g) => g.id === evt.goalId);
        const availDay = availability.find((a) => a.dayOfWeek === altDay.getDay() && a.active);
        const prefWin = goalObj ? getGoalPreferredWindow(goalObj, availDay) : { start: 8, end: 21 };

        const slot = findFreeSlotOnDay(altDay, durMins, workingEvents, availability, prefWin.start, prefWin.end, 15, evt.id);
        if (slot) {
          workingEvents = workingEvents.map((x) =>
            x.id === evt.id
              ? {
                  ...x,
                  start: slot.start.toISOString(),
                  end: slot.end.toISOString(),
                  notes: `${x.notes ? x.notes + " • " : ""}Shifted off ${SHORT_DAY_NAMES[catchUpDow]} Catch-Up Day`
                }
              : x
          );
          clearedNewCount++;
          affectedEventsCount++;
          break;
        }
      }
    }

    // 2. Gather pending/overdue uncompleted sessions prior to nextWeek.start (up to 4) and schedule onto Catch-Up Day
    const pendingBacklog = workingEvents
      .filter(
        (e) =>
          !e.completed &&
          isGoalSessionEvent(e) &&
          new Date(e.start).getTime() < nextWeek.start.getTime()
      )
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 4);

    let movedPendingCount = 0;
    for (const pendingEvt of pendingBacklog) {
      const durMins = Math.max(
        25,
        Math.round((new Date(pendingEvt.end).getTime() - new Date(pendingEvt.start).getTime()) / 60000)
      );
      const slot = findFreeSlotOnDay(catchUpDay, durMins, workingEvents, availability, 9, 20, 20, pendingEvt.id);
      if (slot) {
        workingEvents = workingEvents.map((x) =>
          x.id === pendingEvt.id
            ? {
                ...x,
                start: slot.start.toISOString(),
                end: slot.end.toISOString(),
                isBufferCatchUp: true,
                notes: `🔄 Catch-Up Day (${DAY_NAMES[catchUpDow]}): Clearing pending session without adding new material`
              }
            : x
        );
        movedPendingCount++;
        affectedEventsCount++;
        highlightedEventId = pendingEvt.id;
      }
    }

    // 3. Always ensure a visible Catch-Up Buffer block exists if there were 0 pending sessions moved
    if (movedPendingCount === 0) {
      const alreadyHasCatchUpBlock = workingEvents.some(
        (e) => new Date(e.start).toDateString() === catchUpDayStr && e.isBufferCatchUp
      );
      if (!alreadyHasCatchUpBlock) {
        const slot = findFreeSlotOnDay(catchUpDay, 60, workingEvents, availability, 10, 19, 15);
        if (slot) {
          const newCatchUpId = `e_catchup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          workingEvents.push({
            id: newCatchUpId,
            title: "Catch-Up & Pending Review Buffer",
            type: "routine",
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            completed: false,
            isBufferCatchUp: true,
            isShielded: true,
            icon: "refresh",
            energyLevel: "moderate",
            notes: `Dedicated ${DAY_NAMES[catchUpDow]} Catch-Up Day — reserved exclusively for clearing pending tasks without adding new material.`,
            subSteps: [
              { id: "cu_1", title: "Clear any unfinished tasks or overdue modules", durationMinutes: 30, completed: false },
              { id: "cu_2", title: "Review notes & prep carryover for next session", durationMinutes: 30, completed: false }
            ]
          });
          affectedEventsCount++;
          highlightedEventId = newCatchUpId;
        }
      }
    }

    if (clearedNewCount > 0) {
      details.push(`Cleared ${clearedNewCount} new session${clearedNewCount > 1 ? "s" : ""} off ${DAY_NAMES[catchUpDow]} so no new material is added.`);
    }
    if (movedPendingCount > 0) {
      details.push(`Moved ${movedPendingCount} pending session${movedPendingCount > 1 ? "s" : ""} into spaced Catch-Up slots on ${DAY_NAMES[catchUpDow]}.`);
    } else {
      details.push(`Protected ${DAY_NAMES[catchUpDow]} (${catchUpDay.toLocaleDateString(undefined, { month: "short", day: "numeric" })}) with a dedicated Catch-Up & Review buffer.`);
    }

    return {
      updatedGoals: workingGoals,
      updatedEvents: workingEvents,
      summary: `Dedicated ${DAY_NAMES[catchUpDow]} set as your next-week Catch-Up Day!`,
      details,
      affectedEventsCount,
      affectedGoalsCount,
      targetDate: catchUpDay,
      highlightedEventId
    };
  }

  if (item.actionType === "cap_duration") {
    const maxMins = params.maxDurationMinutes ?? 45;
    const cutoff = params.cutoffHour ?? 21;
    const onlyEvening = params.targetGoalScope === "evening";

    const matchingGoalIds = new Set<string>();
    workingGoals = workingGoals.map((g) => {
      if (g.isPaused) return g;
      const matchesScope = onlyEvening
        ? g.timePreference === TimePreference.EVENING || g.timePreference === TimePreference.NIGHT
        : g.type === GoalType.STUDY || g.type === GoalType.SIDE_PROJECT || g.durationMinutes > maxMins;

      if (matchesScope && g.durationMinutes > maxMins) {
        affectedGoalsCount++;
        matchingGoalIds.add(g.id);
        const scaledSteps = g.subSteps?.map((s) => ({
          ...s,
          durationMinutes: Math.max(5, Math.round((s.durationMinutes / g.durationMinutes) * maxMins))
        }));
        return {
          ...g,
          durationMinutes: maxMins,
          subSteps: scaledSteps
        };
      }
      return g;
    });

    workingEvents = workingEvents.map((evt) => {
      if (!isNextWeekEvent(evt, nextWeek) || evt.completed || !isGoalSessionEvent(evt)) return evt;
      const start = new Date(evt.start);
      const end = new Date(evt.end);
      const curMins = Math.round((end.getTime() - start.getTime()) / 60000);
      const isEveningEvt = start.getHours() >= 17 || end.getHours() + end.getMinutes() / 60 > cutoff;
      const shouldCap = onlyEvening ? isEveningEvt : curMins > maxMins || (evt.goalId && matchingGoalIds.has(evt.goalId));

      if (!shouldCap && end.getHours() + end.getMinutes() / 60 <= cutoff) return evt;

      let nextStart = new Date(start);
      const nextDuration = curMins > maxMins ? maxMins : curMins;
      let nextEnd = new Date(nextStart.getTime() + nextDuration * 60000);

      if (nextEnd.getHours() + nextEnd.getMinutes() / 60 > cutoff) {
        nextStart.setHours(Math.max(8, Math.floor(cutoff - nextDuration / 60 - 0.5)), 0, 0, 0);
        nextEnd = new Date(nextStart.getTime() + nextDuration * 60000);
      }

      const scaledSteps = evt.subSteps?.map((s) => ({
        ...s,
        durationMinutes: Math.max(5, Math.round((s.durationMinutes / Math.max(1, curMins)) * nextDuration))
      }));

      affectedEventsCount++;
      if (!highlightedEventId) highlightedEventId = evt.id;

      return {
        ...evt,
        start: nextStart.toISOString(),
        end: nextEnd.toISOString(),
        subSteps: scaledSteps,
        notes: `${evt.notes ? evt.notes + " • " : ""}Capped to ${nextDuration}m before ${cutoff}:00`
      };
    });

    details.push(`Capped ${affectedEventsCount} next-week sessions and ${affectedGoalsCount} goal defaults at ${maxMins}m (ending by ${cutoff}:00).`);
    return {
      updatedGoals: workingGoals,
      updatedEvents: workingEvents,
      summary: `Shortened next week's blocks to max ${maxMins}m and protected evenings past ${cutoff}:00.`,
      details,
      affectedEventsCount,
      affectedGoalsCount,
      targetDate,
      highlightedEventId
    };
  }

  if (item.actionType === "shift_peak_window") {
    const startHr = params.peakStartHour ?? 9;
    const endHr = params.peakEndHour ?? 12;
    const isLightScope = params.targetGoalScope === "light_routines";

    const prefEnum =
      startHr < 8
        ? TimePreference.EARLY_MORNING
        : startHr < 12
          ? TimePreference.MORNING
          : startHr < 17
            ? TimePreference.AFTERNOON
            : startHr < 21
              ? TimePreference.EVENING
              : TimePreference.NIGHT;

    const alignedGoalIds = new Set<string>();
    workingGoals = workingGoals.map((g) => {
      if (g.isPaused) return g;
      const matches = isLightScope
        ? g.type === GoalType.ROUTINE || g.type === GoalType.WORKOUT || g.energyLevel === "light_recharge"
        : g.type === GoalType.STUDY || g.type === GoalType.SIDE_PROJECT || g.energyLevel === "deep_focus";

      if (matches) {
        alignedGoalIds.add(g.id);
        affectedGoalsCount++;
        return { ...g, timePreference: prefEnum };
      }
      return g;
    });

    for (const evt of workingEvents) {
      if (!isNextWeekEvent(evt, nextWeek) || evt.completed || !isGoalSessionEvent(evt)) continue;
      const matchesEvt =
        (evt.goalId && alignedGoalIds.has(evt.goalId)) ||
        (isLightScope ? evt.type === "routine" || evt.type === "workout" : evt.type === "study" || evt.type === "side_project");
      if (!matchesEvt) continue;

      const evtDay = new Date(evt.start);
      const durMins = Math.max(25, Math.round((new Date(evt.end).getTime() - evtDay.getTime()) / 60000));
      const freeSlot = findFreeSlotOnDay(evtDay, durMins, workingEvents, availability, startHr, endHr, 15, evt.id);
      if (freeSlot) {
        workingEvents = workingEvents.map((x) =>
          x.id === evt.id
            ? {
                ...x,
                start: freeSlot.start.toISOString(),
                end: freeSlot.end.toISOString(),
                notes: `${x.notes ? x.notes + " • " : ""}Aligned to ${Math.floor(startHr)}:00–${Math.floor(endHr)}:00 window`
              }
            : x
        );
        affectedEventsCount++;
        if (!highlightedEventId) highlightedEventId = evt.id;
      }
    }

    details.push(`Aligned ${affectedGoalsCount} goal preferences and ${affectedEventsCount} next-week blocks into ${Math.floor(startHr)}:00–${Math.floor(endHr)}:00.`);
    return {
      updatedGoals: workingGoals,
      updatedEvents: workingEvents,
      summary: `Aligned next week's ${isLightScope ? "light routines" : "peak focus blocks"} to ${Math.floor(startHr)}:00–${Math.floor(endHr)}:00.`,
      details,
      affectedEventsCount,
      affectedGoalsCount,
      targetDate,
      highlightedEventId
    };
  }

  // add_buffers OR general_rebalance
  const cutoff = params.cutoffHour ?? 21;
  const bufferMins = params.bufferMinutes ?? (userEnergyProfile?.autoBufferMinutes || 15);

  for (const day of nextWeek.days) {
    const dayStr = day.toDateString();
    const dayEvts = workingEvents
      .filter((e) => new Date(e.start).toDateString() === dayStr && isGoalSessionEvent(e) && !e.completed)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    for (let i = 0; i < dayEvts.length; i++) {
      const evt = dayEvts[i];
      const evtStart = new Date(evt.start);
      const evtEnd = new Date(evt.end);
      const durMins = Math.max(20, Math.round((evtEnd.getTime() - evtStart.getTime()) / 60000));
      const endsTooLate = evtEnd.getHours() + evtEnd.getMinutes() / 60 > cutoff;
      const overlapsPrev =
        i > 0 && evtStart.getTime() < new Date(dayEvts[i - 1].end).getTime() + bufferMins * 60000;

      if (endsTooLate || overlapsPrev) {
        const slot = findFreeSlotOnDay(day, durMins, workingEvents, availability, 9, cutoff, bufferMins, evt.id);
        if (slot) {
          workingEvents = workingEvents.map((x) =>
            x.id === evt.id
              ? {
                  ...x,
                  start: slot.start.toISOString(),
                  end: slot.end.toISOString(),
                  notes: `${x.notes ? x.notes + " • " : ""}Spaced with ${bufferMins}m recovery buffer`
                }
              : x
          );
          dayEvts[i] = { ...evt, start: slot.start.toISOString(), end: slot.end.toISOString() };
          affectedEventsCount++;
          if (!highlightedEventId) highlightedEventId = evt.id;
        }
      }
    }
  }

  details.push(
    affectedEventsCount > 0
      ? `Adjusted ${affectedEventsCount} next-week block${affectedEventsCount > 1 ? "s" : ""} for ${bufferMins}m buffers and a ${cutoff}:00 evening cutoff.`
      : `Verified next week (${nextWeek.label}) already has clean spacing and no sessions past ${cutoff}:00.`
  );

  return {
    updatedGoals: workingGoals,
    updatedEvents: workingEvents,
    summary: `Optimized next week's spacing with ${bufferMins}m buffers and ${cutoff}:00 cutoff.`,
    details,
    affectedEventsCount,
    affectedGoalsCount,
    targetDate,
    highlightedEventId
  };
}
