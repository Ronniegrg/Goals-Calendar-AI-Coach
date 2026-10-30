import { 
  Goal, 
  CalendarEvent, 
  UserEnergyProfile, 
  DailyBurnoutLimits, 
  SentinelSignal, 
  SentinelTelemetry, 
  SentinelSeverity,
  GoalType
} from "../types";

/**
 * Returns the Monday 00:00:00 of the current week for the given date.
 */
function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday is day 1
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Returns the Sunday 23:59:59 of the current week.
 */
function getWeekEnd(d: Date): Date {
  const start = getWeekStart(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Evaluates the live real-time state of goals, calendar events, circadian profile, and burnout limits.
 * Returns comprehensive telemetry with prioritized autonomous proactive signals.
 */
export function evaluateGoalSentinel(params: {
  goals: Goal[];
  events: CalendarEvent[];
  energyProfile: UserEnergyProfile;
  burnoutLimits: DailyBurnoutLimits;
  now?: Date;
}): SentinelTelemetry {
  const { goals, events, energyProfile, burnoutLimits } = params;
  const now = params.now || new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);
  const todayStr = now.toDateString();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const daysRemainingInWeek = Math.max(1, 7 - (dayOfWeek === 0 ? 7 : dayOfWeek) + 1);

  const signals: SentinelSignal[] = [];

  // Active (unpaused) goals
  const activeGoals = goals.filter(g => !g.isPaused);
  let onPaceCount = 0;
  let laggingCount = 0;

  // Events belonging to this week
  const thisWeekEvents = events.filter(e => {
    const d = new Date(e.start);
    return d >= weekStart && d <= weekEnd;
  });

  // Events for today specifically
  const todayEvents = events.filter(e => {
    return new Date(e.start).toDateString() === todayStr;
  });

  // 1. GOAL DEFICIT & PACING EVALUATOR
  for (const goal of activeGoals) {
    const goalEventsThisWeek = thisWeekEvents.filter(e => 
      e.goalId === goal.id || 
      (e.title && goal.name && e.title.toLowerCase().includes(goal.name.toLowerCase()))
    );

    const completedThisWeek = goalEventsThisWeek.filter(e => e.completed).length;
    const scheduledPendingThisWeek = goalEventsThisWeek.filter(e => !e.completed).length;
    const totalCovered = completedThisWeek + scheduledPendingThisWeek;
    const weeklyTarget = goal.weeklyTarget || 3;
    const deficit = weeklyTarget - totalCovered;

    if (deficit <= 0) {
      onPaceCount++;
    } else {
      laggingCount++;
      const isUrgent = deficit >= daysRemainingInWeek || daysRemainingInWeek <= 2;
      const severity: SentinelSeverity = isUrgent ? "urgent" : "warning";

      signals.push({
        id: `sentinel_deficit_${goal.id}`,
        type: "goal_deficit",
        severity,
        tag: isUrgent ? "CRITICAL DEFICIT" : "PACING BEHIND",
        icon: isUrgent ? "🚨" : "⚠️",
        headline: `${goal.name}: ${deficit} Session${deficit > 1 ? "s" : ""} Needed This Week`,
        message: `${completedThisWeek} completed, ${scheduledPendingThisWeek} scheduled out of ${weeklyTarget} target. Only ${daysRemainingInWeek} day${daysRemainingInWeek > 1 ? "s" : ""} left this week.`,
        subtext: `Goal priority: ${goal.priority?.toUpperCase() || "NORMAL"} • ${goal.durationMinutes || 45}m per session`,
        primaryAction: {
          type: "auto_schedule",
          label: `⚡ Auto-Schedule Slot`,
          tooltip: `Finds the next optimal non-overlapping slot in your availability for ${goal.name}`,
          goalId: goal.id,
          goalName: goal.name,
          durationMinutes: goal.durationMinutes || 45
        },
        secondaryAction: {
          type: "launch_timer",
          label: `🚀 Start ${Math.min(30, goal.durationMinutes || 30)}m Now`,
          tooltip: `Launch a sprint right now to log progress on ${goal.name}`,
          goalId: goal.id,
          goalName: goal.name,
          durationMinutes: Math.min(30, goal.durationMinutes || 30)
        },
        metric: {
          label: "Weekly Pace",
          value: `${totalCovered}/${weeklyTarget} sessions`
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  // 2. STREAK AT RISK EVALUATOR
  for (const goal of activeGoals) {
    const hasTodayCompleted = todayEvents.some(e => 
      e.completed && 
      (e.goalId === goal.id || (e.title && goal.name && e.title.toLowerCase().includes(goal.name.toLowerCase())))
    );
    const hasTodayScheduled = todayEvents.some(e => 
      !e.completed && 
      (e.goalId === goal.id || (e.title && goal.name && e.title.toLowerCase().includes(goal.name.toLowerCase())))
    );

    // If goal has positive completion history but no activity today and it's already afternoon/evening
    const currentHour = now.getHours() + (now.getMinutes() / 60);
    if (!hasTodayCompleted && !hasTodayScheduled && goal.completedCount >= 2 && currentHour >= 12) {
      signals.push({
        id: `sentinel_streak_${goal.id}`,
        type: "streak_risk",
        severity: currentHour >= 17 ? "urgent" : "warning",
        tag: "STREAK DEFENSE",
        icon: "🔥",
        headline: `${goal.name} Momentum at Risk`,
        message: `You've built consistent momentum (${goal.completedCount} total logged sessions), but zero sessions are booked or completed for today!`,
        subtext: `Keep the chain alive with a quick sprint or protect your streak with a shield token.`,
        primaryAction: {
          type: "launch_timer",
          label: `🚀 Quick 20m Sprint`,
          tooltip: `Launch a 20-minute focus session for ${goal.name}`,
          goalId: goal.id,
          goalName: goal.name,
          durationMinutes: 20
        },
        secondaryAction: {
          type: "streak_shield",
          label: `🛡️ Use Streak Shield`,
          tooltip: `Protect your streak using a Flex Token`,
          goalId: goal.id,
          goalName: goal.name
        },
        metric: {
          label: "Current Momentum",
          value: `${goal.completedCount} logged`
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  // 3. CIRCADIAN ENERGY SLUMP & MISMATCH EVALUATOR
  const slumpZones = energyProfile.zones.filter(z => z.level === "light_recharge");
  const peakZones = energyProfile.zones.filter(z => z.level === "deep_focus");

  for (const evt of todayEvents) {
    if (evt.completed) continue;
    const startD = new Date(evt.start);
    const endD = new Date(evt.end);
    const startHour = startD.getHours() + (startD.getMinutes() / 60);
    const endHour = endD.getHours() + (endD.getMinutes() / 60);

    // Is this a high focus event?
    const isHighCognitive = evt.type === "study" || evt.type === "workout" || evt.energyLevel === "deep_focus";

    if (isHighCognitive && energyProfile.slumpProtection) {
      for (const slump of slumpZones) {
        // Overlap test
        const overlapsSlump = Math.max(startHour, slump.startHour) < Math.min(endHour, slump.endHour);
        if (overlapsSlump) {
          const tiedGoal = goals.find(g => g.id === evt.goalId);
          signals.push({
            id: `sentinel_slump_${evt.id}`,
            type: "slump_conflict",
            severity: "warning",
            tag: "CIRCADIAN MISMATCH",
            icon: "⚡",
            headline: `"${evt.title}" Clashes with ${slump.name}`,
            message: `Scheduled during your ${energyProfile.chronotype.replace("_", " ")} slump window (${Math.floor(slump.startHour)}:${String(Math.round((slump.startHour % 1) * 60)).padStart(2, "0")} - ${Math.floor(slump.endHour)}:${String(Math.round((slump.endHour % 1) * 60)).padStart(2, "0")}). Studies show up to 34% drop in retention during this phase.`,
            subtext: `Shift into your morning or evening peak focus window for effortless flow.`,
            primaryAction: {
              type: "shift_to_peak",
              label: `☀️ Shift to Peak Window`,
              tooltip: `Move this block to your peak cognitive energy window`,
              eventId: evt.id,
              goalId: tiedGoal?.id
            },
            secondaryAction: {
              type: "insert_buffer",
              label: `🛡️ Split with 15m Buffer`,
              tooltip: `Insert a recovery buffer before this block`,
              eventId: evt.id
            },
            metric: {
              label: "Circadian Zone",
              value: slump.name
            },
            timestamp: new Date().toISOString()
          });
          break;
        }
      }
    }
  }

  // 4. BURNOUT DENSITY & COGNITIVE CEILING EVALUATOR
  let totalScheduledTodayMinutes = 0;
  for (const evt of todayEvents) {
    const s = new Date(evt.start).getTime();
    const e = new Date(evt.end).getTime();
    const durMins = Math.max(0, (e - s) / (1000 * 60));
    totalScheduledTodayMinutes += durMins;
  }
  const scheduledHoursToday = Math.round((totalScheduledTodayMinutes / 60) * 10) / 10;
  const maxBurnoutHours = isWeekend ? burnoutLimits.weekendMaxHours : burnoutLimits.weekdayMaxHours;
  const densityPercent = Math.min(200, Math.round((scheduledHoursToday / Math.max(1, maxBurnoutHours)) * 100));

  let burnoutLevel: "optimal" | "elevated" | "burnout_risk" = "optimal";
  if (scheduledHoursToday > maxBurnoutHours) {
    burnoutLevel = "burnout_risk";
    signals.push({
      id: "sentinel_burnout_ceiling",
      type: "burnout_risk",
      severity: "urgent",
      tag: "BURNOUT LIMIT EXCEEDED",
      icon: "🛑",
      headline: `Daily Cognitive Load Exceeded (${scheduledHoursToday}h / ${maxBurnoutHours}h)`,
      message: `You have ${scheduledHoursToday} hours of scheduled blocks today, passing your safe recovery threshold of ${maxBurnoutHours} hours. High risk of mental fatigue and diminished returns.`,
      subtext: `Activate Rest Day Protocol or rebalance uncompleted sessions forward.`,
      primaryAction: {
        type: "trigger_rest_day",
        label: `🌴 Activate Rest Day Protocol`,
        tooltip: `Safely moves today's pending blocks across the week without streak penalty`
      },
      secondaryAction: {
        type: "open_coach",
        label: `💬 Coach Deconflict`,
        tooltip: `Ask AI Coach to rebalance today's workload`,
        coachQuery: `My schedule for today has ${scheduledHoursToday} hours which exceeds my daily limit of ${maxBurnoutHours} hours. Please rebalance and prioritize my critical goals.`
      },
      metric: {
        label: "Load Density",
        value: `${densityPercent}% of capacity`
      },
      timestamp: new Date().toISOString()
    });
  } else if (scheduledHoursToday >= maxBurnoutHours * 0.85) {
    burnoutLevel = "elevated";
  }

  // Check back-to-back density without buffer (> 2.0 continuous hours)
  const sortedToday = [...todayEvents].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  for (let i = 0; i < sortedToday.length - 1; i++) {
    const curr = sortedToday[i];
    const next = sortedToday[i + 1];
    const currEnd = new Date(curr.end).getTime();
    const nextStart = new Date(next.start).getTime();
    const gapMinutes = (nextStart - currEnd) / (1000 * 60);

    const currDurMins = (currEnd - new Date(curr.start).getTime()) / (1000 * 60);
    const nextDurMins = (new Date(next.end).getTime() - nextStart) / (1000 * 60);

    if (gapMinutes >= 0 && gapMinutes < 5 && (currDurMins + nextDurMins) >= 120) {
      signals.push({
        id: `sentinel_backtoback_${curr.id}_${next.id}`,
        type: "burnout_risk",
        severity: "warning",
        tag: "COGNITIVE CONGESTION",
        icon: "🧠",
        headline: `Dense Back-to-Back Stack (${Math.round((currDurMins + nextDurMins) / 60 * 10) / 10}h)`,
        message: `"${curr.title}" flows directly into "${next.title}" without a cognitive decompression buffer.`,
        subtext: `A brief 15-minute mental reset prevents task-switching residue and preserves dopamine.`,
        primaryAction: {
          type: "insert_buffer",
          label: `🛡️ Insert 15m Reset Buffer`,
          tooltip: `Shifts the subsequent task by 15 minutes to allow recovery`,
          eventId: next.id
        },
        secondaryAction: {
          type: "view_schedule",
          label: `📅 View on Grid`
        },
        metric: {
          label: "Continuous Work",
          value: `${Math.round(currDurMins + nextDurMins)} mins`
        },
        timestamp: new Date().toISOString()
      });
      break; // One back-to-back warning is enough
    }
  }

  // 5. DEEP WORK WINDOW & POSITIVE MOMENTUM EVALUATOR
  const currentHourDecimal = now.getHours() + (now.getMinutes() / 60);
  const activeZone = energyProfile.zones.find(z => currentHourDecimal >= z.startHour && currentHourDecimal < z.endHour);
  const currentZoneLevel = activeZone ? activeZone.level : "moderate";
  const isSlumpNow = currentZoneLevel === "light_recharge";

  // Check if currently free during a peak focus zone
  const hasCurrentEvent = todayEvents.some(e => {
    const s = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    const nowMs = now.getTime();
    return nowMs >= s && nowMs <= end;
  });

  if (!hasCurrentEvent && currentZoneLevel === "deep_focus") {
    // Top priority goal needing attention
    const candidateGoal = activeGoals.find(g => g.priority === "critical") || activeGoals[0];
    if (candidateGoal) {
      signals.push({
        id: `sentinel_deep_window_${now.getHours()}`,
        type: "deep_work_window",
        severity: "insight",
        tag: "PRIME FOCUS WINDOW",
        icon: "⚡",
        headline: `Peak Circadian Zone Active (${activeZone?.name || "Deep Focus"})`,
        message: `Your neuro-chemical alertness is currently peaked with an open calendar window. Ideal time to make decisive progress on "${candidateGoal.name}".`,
        subtext: `Take advantage of high focus with a 25-minute Pomodoro sprint.`,
        primaryAction: {
          type: "launch_timer",
          label: `🚀 Launch 25m Focus Sprint`,
          tooltip: `Open focus countdown timer for ${candidateGoal.name}`,
          goalId: candidateGoal.id,
          goalName: candidateGoal.name,
          durationMinutes: 25
        },
        secondaryAction: {
          type: "auto_schedule",
          label: `⚡ Schedule Block Now`,
          goalId: candidateGoal.id,
          goalName: candidateGoal.name,
          durationMinutes: candidateGoal.durationMinutes || 45
        },
        metric: {
          label: "Current Energy",
          value: "Deep Focus ⚡"
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  // If no critical alerts and goals are in great shape: Celebrate & praise!
  if (activeGoals.length > 0 && laggingCount === 0 && signals.filter(s => s.severity === "urgent").length === 0) {
    const totalWeeklyTarget = activeGoals.reduce((sum, g) => sum + g.weeklyTarget, 0);
    const totalWeeklyCompleted = thisWeekEvents.filter(e => e.completed).length;

    signals.push({
      id: "sentinel_momentum_praise",
      type: "momentum_praise",
      severity: "celebration",
      tag: "PERFECT EXECUTION",
      icon: "🌟",
      headline: `All Goals on Pace! Flawless Rhythm`,
      message: `All ${activeGoals.length} tracked goals are fully meeting weekly targets (${totalWeeklyCompleted} completed sessions logged). System consistency is top tier!`,
      subtext: `Enjoy your flow state or ask AI Coach for advanced mastery challenges.`,
      primaryAction: {
        type: "open_coach",
        label: `💬 Ask Coach for Next Level Tips`,
        coachQuery: `My routine and goals are 100% on pace this week! What advanced techniques or habit upgrades do you recommend for sustaining this high level?`
      },
      secondaryAction: {
        type: "view_schedule",
        label: `📅 View Full Schedule`
      },
      metric: {
        label: "Weekly Pacing",
        value: "100% On Track"
      },
      timestamp: new Date().toISOString()
    });
  }

  // If no signals at all (e.g. no goals yet)
  if (signals.length === 0) {
    if (activeGoals.length === 0) {
      signals.push({
        id: "sentinel_get_started",
        type: "deep_work_window",
        severity: "insight",
        tag: "AI SENTINEL ONLINE",
        icon: "🎯",
        headline: "Sentinel Goal Guardian Active",
        message: "Add your workout or study goals in the Goals tab, and Sentinel will autonomously monitor pacing, deconflict overlaps, and protect your energy rhythm.",
        primaryAction: {
          type: "open_coach",
          label: `💬 Build Routine with AI`,
          coachQuery: "Help me design a balanced weekly workout and study routine tailored to my energy rhythm."
        },
        metric: {
          label: "Sentinel Status",
          value: "Watching"
        },
        timestamp: new Date().toISOString()
      });
    } else {
      signals.push({
        id: "sentinel_steady_calm",
        type: "momentum_praise",
        severity: "celebration",
        tag: "SCHEDULE STABLE",
        icon: "✨",
        headline: "Routine Rhythm Harmonized",
        message: "Zero schedule conflicts, balanced cognitive density, and active goals paced appropriately for today.",
        primaryAction: {
          type: "view_schedule",
          label: "📅 View Calendar"
        },
        metric: {
          label: "Schedule Health",
          value: "Optimal"
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  // Sort signals by severity priority
  const severityRank: Record<SentinelSeverity, number> = {
    urgent: 1,
    warning: 2,
    insight: 3,
    celebration: 4
  };
  signals.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const totalGoals = activeGoals.length;
  const weeklyProgressPercent = totalGoals > 0 
    ? Math.round((onPaceCount / totalGoals) * 100) 
    : 100;

  let circadianRecommendation = "Ideal state for deep conceptual problem solving.";
  if (isSlumpNow) {
    circadianRecommendation = "Low metabolic alertness window. Prioritize light tasks, hydration, or a brisk walk.";
  } else if (currentZoneLevel === "moderate") {
    circadianRecommendation = "Balanced energy. Great for active practice, reviews, or collaborative tasks.";
  }

  return {
    signals,
    activeGoalHealth: {
      totalGoals,
      onPaceGoals: onPaceCount,
      laggingGoals: laggingCount,
      weeklyProgressPercent
    },
    cognitiveLoadToday: {
      scheduledHours: scheduledHoursToday,
      maxHours: maxBurnoutHours,
      densityPercent,
      burnoutLevel
    },
    circadianStatus: {
      currentZoneName: activeZone?.name || (isWeekend ? "Weekend Pace" : "Balanced Hours"),
      level: currentZoneLevel,
      isSlumpNow,
      recommendation: circadianRecommendation
    },
    lastEvaluatedAt: new Date().toISOString()
  };
}
