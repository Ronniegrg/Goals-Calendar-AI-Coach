import { EnergyLevel, EnergyZone, Chronotype, UserEnergyProfile, Goal, CalendarEvent, GoalType } from "../types";

export type { EnergyLevel, EnergyZone, Chronotype, UserEnergyProfile };

export const DEFAULT_CHRONOTYPE_PROFILES: Record<Exclude<Chronotype, "custom">, { name: string; description: string; zones: EnergyZone[] }> = {
  steady: {
    name: "Steady Performer",
    description: "Balanced energy curve with a robust morning peak, midday slump, and sustained afternoon flow.",
    zones: [
      { id: "z1", name: "Morning Wake & Warmup", startHour: 7.0, endHour: 8.5, level: "light_recharge", description: "Light cognitive routines, plan the day, hydrate." },
      { id: "z2", name: "Core Morning Peak", startHour: 8.5, endHour: 12.5, level: "deep_focus", description: "Maximum mental clarity, deep analytical problem solving and intense training." },
      { id: "z3", name: "Post-Lunch Slump Shield", startHour: 12.5, endHour: 14.5, level: "light_recharge", description: "Biological circadian dip. Best for lunch, walking, casual review." },
      { id: "z4", name: "Afternoon Flow Zone", startHour: 14.5, endHour: 18.0, level: "moderate", description: "Sustained execution, collaborative tasks, coding, steady cardio." },
      { id: "z5", name: "Evening Secondary Window", startHour: 18.0, endHour: 20.5, level: "moderate", description: "Skill practice, workouts, or creative side projects." },
      { id: "z6", name: "Night Wind-Down", startHour: 20.5, endHour: 23.5, level: "light_recharge", description: "Low cognitive strain, reading, rest preparation." }
    ]
  },
  early_bird: {
    name: "Early Bird (Lark)",
    description: "Surges with energy right at dawn. High cognitive peaks early morning, tapering off in the evening.",
    zones: [
      { id: "eb1", name: "Dawn Prime Peak", startHour: 5.5, endHour: 10.5, level: "deep_focus", description: "Absolute peak analytical and physical power before morning interruptions." },
      { id: "eb2", name: "Late Morning Flow", startHour: 10.5, endHour: 13.0, level: "moderate", description: "Execution and active communication." },
      { id: "eb3", name: "Early Slump Shield", startHour: 13.0, endHour: 15.5, level: "light_recharge", description: "Noticeable biological energy valley. Avoid high-stakes study or heavy lifts." },
      { id: "eb4", name: "Mid-Afternoon Steady", startHour: 15.5, endHour: 18.5, level: "moderate", description: "Light technical tasks, routines, flexibility workouts." },
      { id: "eb5", name: "Rest & Recovery", startHour: 18.5, endHour: 22.0, level: "light_recharge", description: "Mental decompression and early sleep readiness." }
    ]
  },
  night_owl: {
    name: "Night Owl (Wolf)",
    description: "Slower morning ramp-up, peaking strongly in the late afternoon, evening, and nocturnal hours.",
    zones: [
      { id: "no1", name: "Gentle Morning Warmup", startHour: 8.0, endHour: 11.5, level: "light_recharge", description: "Low cognitive friction tasks, hydration, review." },
      { id: "no2", name: "Midday Ramping Flow", startHour: 11.5, endHour: 15.5, level: "moderate", description: "Gradual energy buildup and steady workflow." },
      { id: "no3", name: "Late Afternoon Surge", startHour: 15.5, endHour: 18.5, level: "deep_focus", description: "Peak cognitive acuity kicking into full gear." },
      { id: "no4", name: "Evening Prime Focus", startHour: 18.5, endHour: 22.5, level: "deep_focus", description: "Deepest uninterrupted concentration block and intense workouts." },
      { id: "no5", name: "Late Night Creative Flow", startHour: 22.5, endHour: 1.5, level: "moderate", description: "Side-projects and creative exploration." }
    ]
  }
};

export const DEFAULT_USER_ENERGY_PROFILE: UserEnergyProfile = {
  chronotype: "steady",
  zones: DEFAULT_CHRONOTYPE_PROFILES.steady.zones,
  slumpProtection: true,
  autoBufferMinutes: 15,
  maxDailyDeepFocusHours: 4.0
};

/**
 * Automatically infers goal energy intensity if user hasn't explicitly chosen one.
 */
export function inferGoalEnergyLevel(goal: Partial<Goal>): EnergyLevel {
  if (goal.energyLevel) return goal.energyLevel;

  const title = `${goal.name || ""} ${goal.category || ""}`.toLowerCase();
  
  if (
    title.includes("calculus") || 
    title.includes("leetcode") || 
    title.includes("algorithm") || 
    title.includes("interview") || 
    title.includes("system design") || 
    title.includes("masterclass") ||
    title.includes("ai") ||
    title.includes("heavy") ||
    title.includes("deep") ||
    goal.priority === "critical"
  ) {
    return "deep_focus";
  }

  if (
    goal.type === GoalType.ROUTINE || 
    title.includes("household") || 
    title.includes("cleaning") || 
    title.includes("admin") || 
    title.includes("flashcard") || 
    title.includes("stretch") ||
    title.includes("declutter")
  ) {
    return "light_recharge";
  }

  return "moderate";
}

/**
 * Returns the matching EnergyZone for a given hour (0-24 decimal)
 */
export function getEnergyZoneForHour(hour: number, profile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE): EnergyZone | undefined {
  const normHour = ((hour % 24) + 24) % 24;
  return profile.zones.find(z => {
    if (z.startHour <= z.endHour) {
      return normHour >= z.startHour && normHour < z.endHour;
    } else {
      // Zone wraps around midnight
      return normHour >= z.startHour || normHour < z.endHour;
    }
  });
}

/**
 * Returns the energy level expected at a particular hour of the day
 */
export function getEnergyLevelForHour(hour: number, profile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE): EnergyLevel {
  const zone = getEnergyZoneForHour(hour, profile);
  return zone ? zone.level : "moderate";
}

export interface EnergyFitResult {
  fitScore: number; // 0 - 100
  isSlumpConflict: boolean;
  isPeakMatch: boolean;
  status: "ideal" | "acceptable" | "conflict";
  message: string;
  idealHoursSummary?: string;
}

/**
 * Evaluates how well an event fits its scheduled time slot based on user's energy profile.
 */
export function calculateEventEnergyFit(
  event: CalendarEvent,
  goal: Goal | undefined,
  profile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE
): EnergyFitResult {
  const startDate = new Date(event.start);
  const startHour = startDate.getHours() + (startDate.getMinutes() / 60);
  const targetLevel = event.energyLevel || (goal ? inferGoalEnergyLevel(goal) : "moderate");
  const currentSlotLevel = getEnergyLevelForHour(startHour, profile);
  const currentZone = getEnergyZoneForHour(startHour, profile);

  // Peak Zones for target level
  const idealZones = profile.zones.filter(z => z.level === targetLevel);
  const idealHoursSummary = idealZones.map(z => `${formatHour(z.startHour)} - ${formatHour(z.endHour)}`).join(", ");

  if (targetLevel === "deep_focus") {
    if (currentSlotLevel === "deep_focus") {
      return {
        fitScore: 100,
        isSlumpConflict: false,
        isPeakMatch: true,
        status: "ideal",
        message: `Perfect! Scheduled inside your Peak Focus zone (${currentZone?.name || "Peak"}).`,
        idealHoursSummary
      };
    }
    if (currentSlotLevel === "light_recharge") {
      return {
        fitScore: 35,
        isSlumpConflict: true,
        isPeakMatch: false,
        status: "conflict",
        message: `High cognitive strain scheduled during ${currentZone?.name || "Slump/Recharge"}. Risk of cognitive fatigue.`,
        idealHoursSummary
      };
    }
    return {
      fitScore: 75,
      isSlumpConflict: false,
      isPeakMatch: false,
      status: "acceptable",
      message: `Acceptable slot in ${currentZone?.name || "Moderate zone"}. Peak focus is recommended for maximum retention.`,
      idealHoursSummary
    };
  }

  if (targetLevel === "light_recharge") {
    if (currentSlotLevel === "light_recharge") {
      return {
        fitScore: 100,
        isSlumpConflict: false,
        isPeakMatch: true,
        status: "ideal",
        message: `Optimal low-friction task during recharge window (${currentZone?.name || "Recharge"}).`,
        idealHoursSummary
      };
    }
    if (currentSlotLevel === "deep_focus") {
      return {
        fitScore: 60,
        isSlumpConflict: false,
        isPeakMatch: false,
        status: "acceptable",
        message: `Light task taking up valuable Peak Focus bandwidth. Consider moving heavy study here.`,
        idealHoursSummary
      };
    }
    return {
      fitScore: 85,
      isSlumpConflict: false,
      isPeakMatch: false,
      status: "ideal",
      message: `Solid placement in moderate window.`,
      idealHoursSummary
    };
  }

  // Moderate
  if (currentSlotLevel === "moderate") {
    return {
      fitScore: 100,
      isSlumpConflict: false,
      isPeakMatch: true,
      status: "ideal",
      message: `Great match for steady flow execution.`,
      idealHoursSummary
    };
  }

  return {
    fitScore: 80,
    isSlumpConflict: false,
    isPeakMatch: false,
    status: "acceptable",
    message: `Compatible schedule placement.`,
    idealHoursSummary
  };
}

/**
 * Calculates daily cognitive and physical strain for a given calendar day.
 */
export function getDailyCognitiveLoad(
  date: Date,
  events: CalendarEvent[],
  goals: Goal[],
  profile: UserEnergyProfile = DEFAULT_USER_ENERGY_PROFILE
) {
  const dateStr = date.toDateString();
  const dayEvents = events.filter(e => new Date(e.start).toDateString() === dateStr);

  let deepFocusMinutes = 0;
  let moderateMinutes = 0;
  let rechargeMinutes = 0;

  dayEvents.forEach(evt => {
    const parentGoal = goals.find(g => g.id === evt.goalId);
    const durationMs = new Date(evt.end).getTime() - new Date(evt.start).getTime();
    const durationMins = Math.max(15, Math.round(durationMs / (60 * 1000)));
    const level = evt.energyLevel || (parentGoal ? inferGoalEnergyLevel(parentGoal) : "moderate");

    if (level === "deep_focus") {
      deepFocusMinutes += durationMins;
    } else if (level === "moderate") {
      moderateMinutes += durationMins;
    } else {
      rechargeMinutes += durationMins;
    }
  });

  const totalMinutes = deepFocusMinutes + moderateMinutes + rechargeMinutes;
  const maxDeepFocusMinutes = (profile.maxDailyDeepFocusHours || 4) * 60;
  
  // Weighted cognitive load index (deep focus has 2.0x weight, moderate 1.0x, recharge 0.3x)
  const weightedLoad = (deepFocusMinutes * 2.0) + (moderateMinutes * 1.0) + (rechargeMinutes * 0.3);
  const baselineCapacity = (maxDeepFocusMinutes * 2.0) + (120 * 1.0); // benchmark healthy capacity
  const loadPercentage = Math.min(100, Math.round((weightedLoad / baselineCapacity) * 100));

  const deepFocusHours = Number((deepFocusMinutes / 60).toFixed(1));
  const isOverloaded = deepFocusHours > (profile.maxDailyDeepFocusHours || 4);

  let status: "optimal" | "moderate" | "overloaded" | "light" = "optimal";
  if (totalMinutes === 0) status = "light";
  else if (isOverloaded || loadPercentage > 85) status = "overloaded";
  else if (loadPercentage < 45) status = "light";
  else if (loadPercentage >= 70) status = "moderate";

  return {
    totalMinutes,
    deepFocusMinutes,
    moderateMinutes,
    rechargeMinutes,
    deepFocusHours,
    loadPercentage,
    isOverloaded,
    status
  };
}

export function formatHour(hourDecimal: number): string {
  const norm = ((hourDecimal % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = Math.round((norm - h) * 60);
  const hStr = h.toString().padStart(2, "0");
  const mStr = m.toString().padStart(2, "0");
  return `${hStr}:${mStr}`;
}

export function getEnergyBadgeData(level?: EnergyLevel) {
  switch (level) {
    case "deep_focus":
      return {
        label: "Deep Focus",
        shortLabel: "Peak",
        icon: "🧠",
        bg: "bg-purple-500/15 text-purple-300 border-purple-500/30",
        solidBg: "bg-purple-600 text-white",
        dotColor: "bg-purple-400",
        description: "High cognitive strain & prime focus"
      };
    case "light_recharge":
      return {
        label: "Light Recharge",
        shortLabel: "Recharge",
        icon: "🔋",
        bg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        solidBg: "bg-emerald-600 text-white",
        dotColor: "bg-emerald-400",
        description: "Low-friction routines & recovery"
      };
    case "moderate":
    default:
      return {
        label: "Steady Flow",
        shortLabel: "Flow",
        icon: "⚡",
        bg: "bg-sky-500/15 text-sky-300 border-sky-500/30",
        solidBg: "bg-sky-600 text-white",
        dotColor: "bg-sky-400",
        description: "Balanced cognitive or physical flow"
      };
  }
}
