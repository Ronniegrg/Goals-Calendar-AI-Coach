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

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
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
  icon?: string;
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
  icon?: string;
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

export interface SyncData {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  notifications: AppNotification[];
  coachMessages: CoachMessage[];
  userEmail: string;
  lastSyncedAt?: string;
  coachPersona?: "mentor" | "drill" | "data";
}
