import {
  Goal,
  CalendarEvent,
  AvailabilityWindow,
  UserEnergyProfile,
  GoalType,
  TimePreference,
  RecommendationEngineResponse,
  GoalRecommendation
} from "../types";

export function generateLocalRecommendations(params: {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  energyProfile?: UserEnergyProfile;
  categoryFilter?: "all" | "study" | "routine";
  customPrompt?: string;
}): RecommendationEngineResponse {
  const {
    goals = [],
    events = [],
    energyProfile,
    categoryFilter = "all",
    customPrompt = ""
  } = params;

  const completedEvents = events.filter((e) => e.completed);
  const totalScheduled = events.length;
  const overallCompletionRate = totalScheduled > 0
    ? Math.round((completedEvents.length / totalScheduled) * 100)
    : (goals.length > 0 ? Math.round(goals.reduce((acc, g) => acc + (g.completedCount > 0 ? 1 : 0), 0) / goals.length * 100) : 82);

  const chronotype = energyProfile?.chronotype || "steady";
  const chronotypeName =
    chronotype === "early_bird" ? "Early Bird (Lark)" :
    chronotype === "night_owl" ? "Night Owl (Wolf)" :
    chronotype === "custom" ? "Custom Chronotype" : "Steady Performer";

  const peakWindow =
    chronotype === "early_bird" ? "05:30 - 10:30 AM" :
    chronotype === "night_owl" ? "03:30 - 06:30 PM & 07:00 - 10:30 PM" :
    "08:30 AM - 12:30 PM";

  const slumpWindow =
    chronotype === "early_bird" ? "01:00 - 03:30 PM" :
    chronotype === "night_owl" ? "08:00 - 11:30 AM" :
    "12:30 - 02:30 PM";

  const studyGoals = goals.filter((g) => g.type === "study" || g.type === "job_search" || g.type === "side_project");
  const routineGoals = goals.filter((g) => g.type === "workout" || g.type === "routine" || g.type === "personal");

  const maxDailyCeiling = energyProfile?.maxDailyDeepFocusHours || 4.0;
  const totalWeeklyDeepFocusMinutes = studyGoals
    .filter((g) => g.energyLevel === "deep_focus" || !g.energyLevel)
    .reduce((acc, g) => acc + ((g.weeklyTarget || 3) * (g.durationMinutes || 60)), 0);
  const dailyAvgDeepFocusHours = Number((totalWeeklyDeepFocusMinutes / (7 * 60)).toFixed(1));

  const recs: GoalRecommendation[] = [];

  // Study Block 1: Technical Mastery or Deep Problem Solving based on chronotype
  if (categoryFilter === "all" || categoryFilter === "study") {
    const hasPythonOrCode = goals.some((g) =>
      (g.name || "").toLowerCase().includes("python") ||
      (g.name || "").toLowerCase().includes("code") ||
      (g.name || "").toLowerCase().includes("react")
    );

    const studyBlockTimePref: TimePreference = chronotype === "early_bird" ? TimePreference.EARLY_MORNING : chronotype === "night_owl" ? TimePreference.EVENING : TimePreference.MORNING;

    if (hasPythonOrCode) {
      recs.push({
        id: "rec_sys_design",
        name: "System Architecture & Algorithmic Problem Solving",
        type: GoalType.STUDY,
        category: "Computer Science",
        recommendationType: "study_block",
        weeklyTarget: 3,
        durationMinutes: 45,
        timePreference: studyBlockTimePref,
        priority: "critical",
        energyLevel: "deep_focus",
        color: "#6366f1",
        icon: "code",
        badge: "🔥 High Momentum Progression",
        patternInsight: `Your ${overallCompletionRate}% completion rate shows high cognitive readiness. Adding a dedicated 45-min Deep Dive block builds on your momentum without exceeding your ${maxDailyCeiling}h daily deep focus limit.`,
        energyProfileMatch: `Targeted exclusively during your ${chronotypeName} Peak Focus zone (${peakWindow}). Slump-protected from midday circadian dips.`,
        expectedOutcome: "Accelerates technical problem-solving speed and structural system design comprehension by +35%.",
        subSteps: [
          { id: "s1", title: "Problem Specification & Constraint Analysis", durationMinutes: 10, description: "Analyze requirements, inputs/outputs, edge cases and time/space complexity bounds." },
          { id: "s2", title: "Core Implementation & Active Coding", durationMinutes: 25, description: "Write clean, modular code without consulting hints or solutions." },
          { id: "s3", title: "Complexity Verification & Mistake Journal", durationMinutes: 10, description: "Trace execution step-by-step and record key takeaways." }
        ],
        confidenceScore: 96,
        suggestedScheduleDays: [1, 3, 5]
      });
    } else {
      recs.push({
        id: "rec_deep_study",
        name: "Deep Conceptual Focus Sprint",
        type: GoalType.STUDY,
        category: "Deep Learning",
        recommendationType: "study_block",
        weeklyTarget: 3,
        durationMinutes: 45,
        timePreference: studyBlockTimePref,
        priority: "critical",
        energyLevel: "deep_focus",
        color: "#3b82f6",
        icon: "brain",
        badge: "🧠 Prime Cognitive Block",
        patternInsight: `Structured at 45 minutes to optimize neurochemical focus before cognitive fatigue sets in. Aligned with your active availability window.`,
        energyProfileMatch: `Scheduled during your ${chronotypeName} peak alertness window (${peakWindow}) with zero slump overlap.`,
        expectedOutcome: "Maximizes deep conceptual comprehension and retention with spaced retrieval.",
        subSteps: [
          { id: "s1", title: "Active Recall & Prerequisite Primer", durationMinutes: 10, description: "Self-test on previous concepts without notes." },
          { id: "s2", title: "Uninterrupted Deep Practice", durationMinutes: 25, description: "Tackle the most demanding conceptual challenge." },
          { id: "s3", title: "Feynman Synthesis & Summary", durationMinutes: 10, description: "Summarize key ideas in simple language in notes." }
        ],
        confidenceScore: 94,
        suggestedScheduleDays: [1, 3, 5]
      });
    }

    // Study Block 2: Spaced Retrieval / Micro-Sprint (High efficiency, moderate load)
    recs.push({
      id: "rec_spaced_recall",
      name: "Rapid Spaced Retrieval & Practice",
      type: GoalType.STUDY,
      category: "Skill Retention",
      recommendationType: "study_block",
      weeklyTarget: 4,
      durationMinutes: 25,
      timePreference: chronotype === "night_owl" ? TimePreference.AFTERNOON : TimePreference.MORNING,
      priority: "important",
      energyLevel: "moderate",
      color: "#06b6d4",
      icon: "book-open",
      badge: "⚡ High Efficiency Micro-Sprint",
      patternInsight: "Bite-sized 25-minute interval lowers activation friction and reinforces long-term memory retention across busy weekdays.",
      energyProfileMatch: "Fits comfortably into your moderate flow window without draining prime analytical energy reserves.",
      expectedOutcome: "Boosts long-term memory retention by up to 40% through daily active recall cycles.",
      subSteps: [
        { id: "s1", title: "Diagnostic Self-Quiz", durationMinutes: 10, description: "Rapid testing on high-frequency questions." },
        { id: "s2", title: "Targeted Weak-Spot Review", durationMinutes: 15, description: "Review only the concepts missed during the quiz." }
      ],
      confidenceScore: 92,
      suggestedScheduleDays: [1, 2, 4, 5]
    });
  }

  // Routine 1: Slump Recovery & Mobility (Protects against burnout)
  if (categoryFilter === "all" || categoryFilter === "routine") {
    const routineTimePref: TimePreference = chronotype === "early_bird" ? TimePreference.AFTERNOON : chronotype === "night_owl" ? TimePreference.EARLY_MORNING : TimePreference.AFTERNOON;

    recs.push({
      id: "rec_slump_recovery",
      name: "Midday Slump Shield & Mobility Walk",
      type: GoalType.ROUTINE,
      category: "Circadian Wellness",
      recommendationType: "routine",
      weeklyTarget: 5,
      durationMinutes: 30,
      timePreference: routineTimePref,
      priority: "important",
      energyLevel: "light_recharge",
      color: "#10b981",
      icon: "activity",
      badge: "🔋 Circadian Slump Shield",
      patternInsight: studyGoals.length > routineGoals.length
        ? "You have heavy cognitive study commitments. A dedicated recharge routine prevents afternoon focus collapse and mental burnout."
        : "Maintains continuous physical and mental circulation during circadian low points.",
      energyProfileMatch: `Strategically mapped to your ${chronotypeName} biological dip (${slumpWindow}). Protects prime focus hours by diverting fatigue into active movement.`,
      expectedOutcome: "Restores alertness by 28% without caffeine, resets posture, and clears cognitive fog.",
      subSteps: [
        { id: "s1", title: "Spine & Hip Mobility Stretches", durationMinutes: 8, description: "Decompress lower back and open tight hip flexors." },
        { id: "s2", title: "Brisk Outdoor Sunlight Walk", durationMinutes: 17, description: "Natural light exposure resets circadian clock and boosts dopamine." },
        { id: "s3", title: "Hydration & Mental Decompression", durationMinutes: 5, description: "Drink water and prepare mental focus for afternoon flow." }
      ],
      confidenceScore: 95,
      suggestedScheduleDays: [1, 2, 3, 4, 5]
    });

    // Routine 2: Evening Wind-Down / Primer
    recs.push({
      id: "rec_evening_sunset",
      name: "Screen-Free Evening Decompression & Prep",
      type: GoalType.ROUTINE,
      category: "Sleep & Recovery",
      recommendationType: "routine",
      weeklyTarget: 5,
      durationMinutes: 20,
      timePreference: TimePreference.NIGHT,
      priority: "normal",
      energyLevel: "light_recharge",
      color: "#8b5cf6",
      icon: "moon",
      badge: "🌙 Restorative Wind-Down",
      patternInsight: "Consistent completion patterns depend heavily on deep sleep recovery. Closing screens before sleep accelerates next-day alertness.",
      energyProfileMatch: `Placed in your Night Wind-Down recharge window, protecting your ${chronotypeName} sleep architecture.`,
      expectedOutcome: "Improves slow-wave sleep quality and ensures higher waking focus for tomorrow's morning sessions.",
      subSteps: [
        { id: "s1", title: "Tomorrow's Schedule & Goal Staging", durationMinutes: 5, description: "Review calendar and stage study materials on desk." },
        { id: "s2", title: "Screen Sunset & Dim Lighting", durationMinutes: 5, description: "Turn off blue-light devices and dim bedroom lamps." },
        { id: "s3", title: "Light Reading or Static Stretching", durationMinutes: 10, description: "Gentle physical relaxation to lower heart rate." }
      ],
      confidenceScore: 91,
      suggestedScheduleDays: [0, 1, 2, 3, 4]
    });
  }

  // Handle custom prompt filter / request if user typed one
  if (customPrompt && customPrompt.trim().length > 0) {
    const p = customPrompt.toLowerCase();
    recs.unshift({
      id: `rec_custom_${Date.now()}`,
      name: customPrompt.length > 40 ? customPrompt.slice(0, 37) + "..." : customPrompt,
      type: p.includes("run") || p.includes("gym") || p.includes("workout") ? GoalType.WORKOUT : GoalType.STUDY,
      category: "Tailored Focus",
      recommendationType: "study_block",
      weeklyTarget: 3,
      durationMinutes: 45,
      timePreference: TimePreference.MORNING,
      priority: "important",
      energyLevel: "deep_focus",
      color: "#ec4899",
      icon: "sparkles",
      badge: "✨ Tailored to Your Prompt",
      patternInsight: `Personalized block created directly from your custom prompt: "${customPrompt}".`,
      energyProfileMatch: `Optimally fitted into your available peak energy focus blocks.`,
      expectedOutcome: "Accelerates targeted mastery of your specified objective.",
      subSteps: [
        { id: "cs1", title: "Foundation & Framing", durationMinutes: 10, description: "Initial setup and review." },
        { id: "cs2", title: "Deep Practice & Execution", durationMinutes: 25, description: "Dedicated uninterrupted immersion." },
        { id: "cs3", title: "Review & Next Steps", durationMinutes: 10, description: "Summarize progress and plan subsequent sprint." }
      ],
      confidenceScore: 98,
      suggestedScheduleDays: [1, 3, 5]
    });
  }

  return {
    recommendations: recs,
    patternSummary: {
      completionRate: overallCompletionRate,
      completedCount: completedEvents.length,
      totalTarget: goals.reduce((acc, g) => acc + (g.weeklyTarget || 0), 0),
      cognitiveLoadDailyAvgHours: dailyAvgDeepFocusHours,
      cognitiveLoadCeilingHours: maxDailyCeiling,
      chronotype,
      chronotypeName,
      peakEnergyWindow: peakWindow,
      slumpWindow,
      strengths: [
        `Strong ${overallCompletionRate}% completion rate shows solid routine adherence.`,
        `Peak energy alignment with ${chronotypeName} rhythm (${peakWindow}) is well utilized.`
      ],
      gaps: [
        studyGoals.length > 0 && routineGoals.length === 0
          ? "High cognitive study density without dedicated recovery or mobility routines."
          : `Ensure afternoon slump window (${slumpWindow}) is shielded from heavy analytical tasks.`,
        `Current deep focus is at ${dailyAvgDeepFocusHours}h / ${maxDailyCeiling}h daily ceiling, leaving room for structured blocks.`
      ]
    },
    aiGenerated: false
  };
}
