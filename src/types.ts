export enum GoalType {
  WORKOUT = "workout",
  STUDY = "study",
  JOB_SEARCH = "job_search",
  SIDE_PROJECT = "side_project",
  ROUTINE = "routine",
  PERSONAL = "personal"
}

export enum TimePreference {
  ANY = "any",
  EARLY_MORNING = "early_morning", // 05:00 - 08:00
  MORNING = "morning", // 08:00 - 12:00
  AFTERNOON = "afternoon", // 12:00 - 17:00
  EVENING = "evening", // 17:00 - 21:00
  NIGHT = "night", // 21:00 - 02:00
  CUSTOM = "custom" // Custom hours (e.g. 14:00 - 16:30)
}

export type GoalPriority = "critical" | "important" | "normal";

export type EnergyLevel = "deep_focus" | "moderate" | "light_recharge";

export interface EnergyZone {
  id: string;
  name: string;
  startHour: number; // Decimal hours, e.g. 8.5 = 08:30
  endHour: number;   // Decimal hours, e.g. 12.0 = 12:00
  level: EnergyLevel;
  description?: string;
}

export type Chronotype = "early_bird" | "steady" | "night_owl" | "custom";

export interface UserEnergyProfile {
  chronotype: Chronotype;
  zones: EnergyZone[];
  slumpProtection: boolean; // avoid placing deep_focus tasks during low energy slump hours
  autoBufferMinutes: number; // buffer between back-to-back heavy sessions
  maxDailyDeepFocusHours: number; // cognitive load ceiling (e.g. 4.0 hours)
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface SessionSubStep {
  id: string;
  title: string;
  durationMinutes: number;
  description?: string;
  completed?: boolean;
}

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  category: string; // e.g. "Legs", "React", "Calculus", "Cardio"
  weeklyTarget: number; // times per week
  durationMinutes: number;
  timePreference: TimePreference;
  customTimeStart?: string; // e.g. "14:00"
  customTimeEnd?: string;   // e.g. "16:30"
  completedCount: number;
  color: string;
  createdAt: string;
  subtasks?: SubTask[];
  subSteps?: SessionSubStep[];
  icon?: string;
  lastSessionNote?: string;
  lastSessionNoteDate?: string;
  priority?: GoalPriority;
  energyLevel?: EnergyLevel; // deep_focus | moderate | light_recharge
  isPaused?: boolean;
  pauseReason?: string;
  pauseUntil?: string;
  pausedAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  type: "workout" | "study" | "job_search" | "side_project" | "routine" | "personal" | "external";
  start: string; // ISO string
  end: string; // ISO string
  goalId?: string; // if tied to a goal
  completed: boolean;
  notes?: string;
  completionNote?: string;
  icon?: string;
  energyLevel?: EnergyLevel;
  subSteps?: SessionSubStep[];
}

export interface AvailabilityWindow {
  dayOfWeek: number; // 0 (Sunday) to 6 (Saturday)
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  active: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: "upcoming" | "warning" | "motivation" | "success" | "sync";
}

export interface CoachMessage {
  id: string;
  sender: "user" | "coach";
  text: string;
  timestamp: string;
}

export interface CustomSessionTemplate {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  steps: {
    id?: string;
    title: string;
    durationMinutes: number;
    description?: string;
  }[];
  createdAt: number;
  updatedAt?: number;
}

export interface GoalRecommendation {
  id: string;
  name: string;
  type: GoalType;
  category: string;
  recommendationType: "study_block" | "routine";
  weeklyTarget: number;
  durationMinutes: number;
  timePreference: TimePreference;
  priority: GoalPriority;
  energyLevel: EnergyLevel;
  color: string;
  icon?: string;
  badge: string;
  patternInsight: string;
  energyProfileMatch: string;
  expectedOutcome: string;
  subSteps?: SessionSubStep[];
  confidenceScore: number;
  suggestedScheduleDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
}

export interface RecommendationEngineResponse {
  recommendations: GoalRecommendation[];
  patternSummary: {
    completionRate: number;
    completedCount: number;
    totalTarget: number;
    cognitiveLoadDailyAvgHours: number;
    cognitiveLoadCeilingHours: number;
    chronotype: string;
    chronotypeName: string;
    peakEnergyWindow: string;
    slumpWindow: string;
    strengths: string[];
    gaps: string[];
  };
  aiGenerated: boolean;
}

export interface SyncData {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  notifications: AppNotification[];
  coachMessages: CoachMessage[];
  userEmail: string;
  lastSyncedAt?: string;
  coachPersona?: "mentor" | "drill" | "data";
  customTemplates?: CustomSessionTemplate[];
  userEnergyProfile?: UserEnergyProfile;
}
