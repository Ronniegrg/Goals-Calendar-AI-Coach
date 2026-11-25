import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { FileState, GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import dotenv from "dotenv";
import {
  buildUnifiedScheduleProposal,
  validateAndRepairScheduleProposal
} from "./src/lib/scheduleOptimizer";

dotenv.config();

const app = express();
const PORT = 3000;

// Enable CORS and handle preflight OPTIONS requests for iframe/preview embedding
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Initialize Gemini client lazily
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY environment variable is not defined. AI coach will operate in mock mode.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

/**
 * Detects Gemini quota / rate-limit errors (HTTP 429 / RESOURCE_EXHAUSTED).
 */
function isGeminiQuotaOrRateLimitError(err: any): boolean {
  const status = Number(err?.status || err?.code || 0);
  const msg = String(err?.message || err || "");
  return status === 429 || /RESOURCE_EXHAUSTED|"code"\s*:\s*429|\b429\b|quota|rate[- ]?limit/i.test(msg);
}

/**
 * Detects invalid or unauthorized Gemini API key errors.
 */
function isGeminiKeyError(err: any): boolean {
  const status = Number(err?.status || err?.code || 0);
  const msg = String(err?.message || err || "");
  if (/PERMISSION_DENIED|API_KEY_INVALID/i.test(msg)) return true;
  return (status === 403 || status === 400 || /\b(403|400)\b/.test(msg)) && /key|api/i.test(msg);
}

/**
 * Resilient Gemini Content Generator with multi-tier model fallback.
 * Cascades from gemini-4-hydrogen -> gemini-3.1-flash-lite.
 */
async function generateWithFallback(params: {
  contents: any;
  config?: any;
  primaryModel?: string;
  fallbackModel?: string;
  timeoutMs?: number;
}): Promise<any | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const ai = getAi();
  const requestTimeout = params.timeoutMs || 4000;

  const modelChain = [
    params.primaryModel || "gemini-4-hydrogen",
    params.fallbackModel || "gemini-3.1-flash-lite"
  ];
  const uniqueModels = Array.from(new Set(modelChain));

  for (let i = 0; i < uniqueModels.length; i++) {
    const model = uniqueModels[i];
    try {
      let timer: any;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Model ${model} request timeout after ${requestTimeout}ms`)), requestTimeout);
      });

      const apiPromise = ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config
      });

      const result = await Promise.race([apiPromise, timeoutPromise]) as any;
      clearTimeout(timer);

      if (result && result.text) {
        return result;
      }
    } catch (err: any) {
      const isLast = i === uniqueModels.length - 1;
      const status = err?.status || err?.code || (err?.message?.includes("503") ? 503 : undefined);
      const isDemandSpike = status === 503 || status === 429 || err?.message?.includes("high demand") || err?.message?.includes("RESOURCE_EXHAUSTED") || err?.message?.includes("timeout");

      if (!isLast) {
        const nextModel = uniqueModels[i + 1];
        console.warn(`[AI Service] Model ${model} ${isDemandSpike ? "busy (429/503/timeout)" : "unavailable"}. Transitioning to ${nextModel}...`);
        await new Promise((r) => setTimeout(r, 250));
      } else {
        console.warn(`[AI Service] All cloud models unavailable (${isQuotaOrRateLimitLabel(err)}). Using fallback where available.`);
      }
    }
  }

  return null;
}

function isQuotaOrRateLimitLabel(err: any): string {
  if (isGeminiQuotaOrRateLimitError(err)) return "quota/rate-limit 429";
  if (isGeminiKeyError(err)) return "API key error";
  return err?.message ? String(err.message).slice(0, 120) : "unavailable";
}

/**
 * Generates Gemini content across model tiers and rethrows the final error
 * so endpoints can surface accurate HTTP status codes (e.g. 429 RESOURCE_EXHAUSTED).
 */
async function generateContentWithModelFallback(params: {
  contents: any;
  config?: any;
  models?: string[];
  timeoutMs?: number;
}): Promise<any> {
  const ai = getAi();
  const models = Array.from(new Set(params.models && params.models.length > 0 ? params.models : ["gemini-4-hydrogen", "gemini-3.1-flash-lite"]));
  const requestTimeout = params.timeoutMs || 28000;
  let lastErr: any = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      let timer: any;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Model ${model} request timeout after ${requestTimeout}ms`)), requestTimeout);
      });

      const apiPromise = ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config
      });

      const result = await Promise.race([apiPromise, timeoutPromise]) as any;
      clearTimeout(timer);
      return result;
    } catch (err: any) {
      lastErr = err;
      const isLast = i === models.length - 1;
      if (isGeminiKeyError(err) || isLast) {
        throw err;
      }
      console.warn(`[AI Extraction] ${model} failed (${isQuotaOrRateLimitLabel(err)}); retrying with ${models[i + 1]}...`);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  throw lastErr || new Error("Gemini content generation failed.");
}

// Simple JSON File Database file path
const DB_FILE = path.join(process.cwd(), "db_sync.json");

// Helper to ensure initial database with clean state for new users
function getInitialData(userEmail: string) {
  return {
    goals: [],
    events: [],
    availability: [
      { dayOfWeek: 0, startTime: "09:00", endTime: "21:00", active: true }, // Sun
      { dayOfWeek: 1, startTime: "08:00", endTime: "22:00", active: true }, // Mon
      { dayOfWeek: 2, startTime: "08:00", endTime: "22:00", active: true }, // Tue
      { dayOfWeek: 3, startTime: "08:00", endTime: "22:00", active: true }, // Wed
      { dayOfWeek: 4, startTime: "08:00", endTime: "22:00", active: true }, // Thu
      { dayOfWeek: 5, startTime: "08:00", endTime: "18:00", active: true }, // Fri
      { dayOfWeek: 6, startTime: "09:00", endTime: "19:00", active: true }  // Sat
    ],
    notifications: [
      {
        id: "n1",
        title: "Welcome to Calendar Goals!",
        message: "Your workouts and study sessions can be automatically scheduled based on your daily availability.",
        timestamp: new Date().toISOString(),
        read: false,
        type: "success"
      }
    ],
    coachMessages: [
      {
        id: "m1",
        sender: "coach" as const,
        text: "Hello! I am your AI Routine Coach. Create your own goals and ask me to optimize your workout schedule, suggest study intervals, or analyze your completion consistency!",
        timestamp: new Date().toISOString()
      }
    ],
    coachChatSessions: [
      {
        id: "chat_default",
        title: "Routine Coaching Chat",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        persona: "mentor" as const,
        messages: [
          {
            id: "m1",
            sender: "coach" as const,
            text: "Hello! I am your AI Routine Coach. Create your own goals and ask me to optimize your workout schedule, suggest study intervals, or analyze your completion consistency!",
            timestamp: new Date().toISOString()
          }
        ]
      }
    ],
    activeCoachChatId: "chat_default",
    coachPersona: "mentor"
  };
}

// Load database with default-preserving migration
function readDb(email: string) {
  const initial = getInitialData(email);
  try {
    let db: any = {};
    if (fs.existsSync(DB_FILE)) {
      const fileContent = fs.readFileSync(DB_FILE, "utf-8");
      try {
        db = JSON.parse(fileContent);
      } catch (parseErr) {
        console.warn("[Database] Corrupt db_sync.json detected, resetting safely:", parseErr);
        db = {};
      }
    }
    
    // Return user data if matches, merging with defaults to guarantee no undefined fields
    if (db[email]) {
      const userRecord = db[email];
      const resolvedMessages = Array.isArray(userRecord.coachMessages)
        ? userRecord.coachMessages
        : initial.coachMessages;
      const firstUserMsg = resolvedMessages.find((m: any) => m?.sender === "user" && typeof m?.text === "string");
      const migratedTitle = firstUserMsg
        ? (firstUserMsg.text.trim().length > 42
            ? `${firstUserMsg.text.trim().slice(0, 40)}...`
            : firstUserMsg.text.trim())
        : "Routine Coaching Chat";
      const resolvedSessions =
        Array.isArray(userRecord.coachChatSessions) && userRecord.coachChatSessions.length > 0
          ? userRecord.coachChatSessions
          : [
              {
                id: "chat_default",
                title: migratedTitle,
                createdAt: resolvedMessages[0]?.timestamp || new Date().toISOString(),
                updatedAt: resolvedMessages[resolvedMessages.length - 1]?.timestamp || new Date().toISOString(),
                persona: userRecord.coachPersona || "mentor",
                messages: resolvedMessages
              }
            ];
      const resolvedActiveChatId =
        typeof userRecord.activeCoachChatId === "string" &&
        resolvedSessions.some((s: any) => s.id === userRecord.activeCoachChatId)
          ? userRecord.activeCoachChatId
          : resolvedSessions[0].id;

      return {
        ...initial,
        ...userRecord,
        goals: Array.isArray(userRecord.goals) ? userRecord.goals : [],
        events: Array.isArray(userRecord.events) ? userRecord.events : [],
        availability: Array.isArray(userRecord.availability) && userRecord.availability.length > 0 
          ? userRecord.availability 
          : initial.availability,
        notifications: Array.isArray(userRecord.notifications) ? userRecord.notifications : initial.notifications,
        coachMessages: resolvedMessages,
        coachChatSessions: resolvedSessions,
        activeCoachChatId: resolvedActiveChatId,
        userEmail: email,
        lastSyncedAt: userRecord.lastSyncedAt || new Date().toISOString()
      };
    }
    
    // Initialize record for new user
    db[email] = initial;
    try {
      const tempFile = `${DB_FILE}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf-8");
      fs.renameSync(tempFile, DB_FILE);
    } catch (saveErr) {
      console.warn("[Database] Failed to write initial db_sync.json:", saveErr);
    }
    return db[email];
  } catch (err) {
    console.warn("[Database] Error reading db_sync.json, falling back to memory state:", err);
    return initial;
  }
}

// Save database with atomic replace to prevent race conditions
function writeDb(email: string, data: any) {
  try {
    let db: any = {};
    if (fs.existsSync(DB_FILE)) {
      const fileContent = fs.readFileSync(DB_FILE, "utf-8");
      try {
        db = JSON.parse(fileContent);
      } catch {
        db = {};
      }
    }
    const current = db[email] || getInitialData(email);
    db[email] = {
      ...current,
      ...data,
      userEmail: email,
      lastSyncedAt: new Date().toISOString()
    };
    
    const tempFile = `${DB_FILE}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
    
    return db[email];
  } catch (err) {
    console.warn("[Database] Error writing database:", err);
    return data;
  }
}

// 1. SYNC ENDPOINT: Get data
app.get("/api/sync", (req, res) => {
  try {
    const email = (req.query.email as string) || "rounigorgees@gmail.com";
    const data = readDb(email);
    res.json(data);
  } catch (err) {
    console.warn("[API] /api/sync GET error:", err);
    res.status(500).json({ error: "Failed to read database state" });
  }
});

// 2. SYNC ENDPOINT: Post data to update
app.post("/api/sync", (req, res) => {
  try {
    const payload = req.body || {};
    const email = payload.userEmail || "rounigorgees@gmail.com";
    const updatedData = writeDb(email, payload);
    res.json({ success: true, data: updatedData });
  } catch (err) {
    console.warn("[API] /api/sync POST error:", err);
    res.status(500).json({ error: "Failed to write database state" });
  }
});

/**
 * 2b. CALENDAR FEED & EXPORT ENDPOINTS (RFC 5545 iCalendar Standard)
 * Supports live subscription in:
 * - Apple Calendar (macOS, iOS, iPadOS via webcal://)
 * - Google Calendar (via "Add from URL")
 * - Microsoft Outlook (Web & Desktop via "Subscribe from web")
 */
function buildIcsFeedString(events: any[], goals: any[] = []): string {
  const formatUtc = (dateStr: string | Date) => {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    return d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  };

  const escapeIcs = (str: string) => {
    if (!str) return "";
    return str
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  };

  const nowUtc = formatUtc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendar Goals & AI Coach//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Calendar Goals & Routines",
    "X-WR-TIMEZONE:UTC",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M"
  ];

  const validEvents = (events || []).filter(e => e && e.start && e.end && e.type !== "external");

  for (const evt of validEvents) {
    const startUtc = formatUtc(evt.start);
    const endUtc = formatUtc(evt.end);
    const tiedGoal = (goals || []).find(g => g.id === evt.goalId);
    const icon = evt.icon || tiedGoal?.icon || (evt.type === "workout" ? "🏋️" : evt.type === "study" ? "📚" : "🎯");
    const summary = `${icon} ${evt.title}`;

    let desc = evt.notes || "Scheduled via Calendar Goals & AI Coach";
    if (evt.energyLevel) {
      desc += `\\n• Energy: ${evt.energyLevel.replace("_", " ").toUpperCase()}`;
    }
    if (tiedGoal) {
      desc += `\\n• Goal: ${tiedGoal.name} (${tiedGoal.completedCount}/${tiedGoal.weeklyTarget} weekly)`;
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${evt.id}@calendargoals.app`);
    lines.push(`DTSTAMP:${nowUtc}`);
    lines.push(`DTSTART:${startUtc}`);
    lines.push(`DTEND:${endUtc}`);
    lines.push(`SUMMARY:${escapeIcs(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcs(desc)}`);
    lines.push(`CATEGORIES:${(evt.type || "goal").toUpperCase()}`);
    lines.push(`STATUS:${evt.completed ? "COMPLETED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// Live Subscribable Feed (Apple Calendar, Google Calendar, Outlook)
app.get("/api/calendar/feed.ics", (req, res) => {
  try {
    const email = (req.query.email as string) || "rounigorgees@gmail.com";
    const data = readDb(email);
    const icsContent = buildIcsFeedString(data.events || [], data.goals || []);

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="calendar_goals.ics"');
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(icsContent);
  } catch (err) {
    console.warn("[API] /api/calendar/feed.ics error:", err);
    res.status(500).send("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Calendar Goals//EN\r\nEND:VCALENDAR");
  }
});

// Downloadable File Export
app.get("/api/calendar/export.ics", (req, res) => {
  try {
    const email = (req.query.email as string) || "rounigorgees@gmail.com";
    const data = readDb(email);
    const icsContent = buildIcsFeedString(data.events || [], data.goals || []);

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="calendar_goals_schedule.ics"');
    res.send(icsContent);
  } catch (err) {
    console.warn("[API] /api/calendar/export.ics error:", err);
    res.status(500).json({ error: "Failed to generate export file" });
  }
});

// Fetch Remote Calendar URL (bypasses browser CORS for Apple / Google / Outlook / iCal URLs)
app.post("/api/calendar/fetch-remote", async (req, res) => {
  try {
    let { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing calendar feed URL" });
    }

    url = url.trim();
    if (url.startsWith("webcal://")) {
      url = "https://" + url.substring(9);
    } else if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "CalendarGoals/1.0 (Mozilla/5.0 compatible)",
        "Accept": "text/calendar, text/plain, */*"
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Remote calendar server returned HTTP ${response.status}: ${response.statusText}`
      });
    }

    const text = await response.text();
    if (!text.includes("BEGIN:VCALENDAR") && !text.includes("BEGIN:VEVENT")) {
      return res.status(422).json({
        error: "The provided URL did not return valid iCalendar (.ics) data."
      });
    }

    res.json({ success: true, icsContent: text });
  } catch (err: any) {
    console.warn("[API] /api/calendar/fetch-remote error:", err);
    res.status(500).json({
      error: err.name === "AbortError" ? "Calendar feed request timed out after 12s." : (err.message || "Failed to fetch remote feed")
    });
  }
});

// Helper to synthesize rich, contextual coaching guidance locally when offline or during cloud failover
function generateLocalCoachingAdvice(
  prompt: string,
  goals: any[] = [],
  events: any[] = [],
  availability: any[] = [],
  coachPersona: "mentor" | "drill" | "data" = "mentor"
): string {
  const lowerPrompt = (prompt || "").toLowerCase();
  const firstGoal = goals.length > 0 ? goals[0] : null;
  const studyGoals = goals.filter((g: any) => g.type === "study" || (g.name || "").toLowerCase().includes("study") || (g.name || "").toLowerCase().includes("code") || (g.name || "").toLowerCase().includes("read"));
  const workoutGoals = goals.filter((g: any) => g.type === "workout" || (g.name || "").toLowerCase().includes("workout") || (g.name || "").toLowerCase().includes("gym") || (g.name || "").toLowerCase().includes("run") || (g.name || "").toLowerCase().includes("cardio"));

  // 1. PROPOSE NEW GOAL
  if (lowerPrompt.includes("new goal") || lowerPrompt.includes("add goal") || lowerPrompt.includes("create goal") || lowerPrompt.includes("propose") || lowerPrompt.includes("make goal") || lowerPrompt.includes("suggest a goal")) {
    const suggestedCategory = workoutGoals.length > studyGoals.length ? "Engineering" : "Wellness";
    const suggestedType = workoutGoals.length > studyGoals.length ? "study" : "workout";
    const suggestedName = workoutGoals.length > studyGoals.length ? "System Architecture & Deep Coding" : "Core Strength & Mobility";

    let badge = coachPersona === "drill" ? "💥 [DRILL SERGEANT] NEW TARGET ACQUIRED" : coachPersona === "data" ? "📊 [ANALYST ENGINE] OPTIMAL GOAL SYNTHESIS" : "✨ [AI COACH] RECOMMENDED GOAL PROPOSAL";

    let advice = "";
    if (coachPersona === "drill") {
      advice = `ATTENTION RECRUIT! I evaluated your current targets and your routine is ready for an upgrade! We are locking in **${suggestedName}** right now! 3 sessions per week, 45 minutes of pure focus. Click the button below, commit to the calendar, and DO NOT MISS A SESSION!`;
    } else if (coachPersona === "data") {
      advice = `**[Schedule Analysis & Capacity Modeling]**\n\nCross-referencing your weekly availability slots indicates an unallocated high-energy window. Introducing **${suggestedName}** creates balanced cognitive-muscular distribution with a projected 88.4% habit retention coefficient.\n\n### 📈 Recommended Parameters\n- **Target**: 3 sessions / week\n- **Duration**: 45 minutes\n- **Slot Alignment**: Morning Peak (08:30 - 10:30)\n\nReview the configuration below and confirm execution:`;
    } else {
      advice = `Hello! I took a close look at your schedule, and I'd love to propose **${suggestedName}** as a wonderful complement to your existing routine! 🌱\n\n- 🎯 **Why this fits**: Setting aside 3 gentle, 45-minute blocks each week gives you space to build lasting momentum without feeling overwhelmed.\n- 💡 **Best Window**: Morning hours when your energy is fresh and calm.\n\nClick the button below to add this goal and place its sessions directly onto your calendar:`;
    }

    return `**${badge}**\n\n${advice}\n\n\`\`\`json
{
  "goalAction": {
    "action": "create_goal",
    "goal": {
      "name": "${suggestedName}",
      "type": "${suggestedType}",
      "category": "${suggestedCategory}",
      "weeklyTarget": 3,
      "durationMinutes": 45,
      "timePreference": "morning",
      "priority": "high",
      "color": "indigo",
      "icon": "code"
    }
  }
}
\`\`\``;
  }

  // 2. MODIFY / UPDATE GOALS
  if (lowerPrompt.includes("modify") || lowerPrompt.includes("update") || lowerPrompt.includes("change goal") || lowerPrompt.includes("target")) {
    const targetGoal = firstGoal || { id: "g_default", name: "Deep Work Focus" };
    let badge = coachPersona === "drill" ? "🔥 [DRILL SERGEANT] STEPPING UP STANDARDS" : coachPersona === "data" ? "📊 [ANALYST ENGINE] PARAMETER RECALIBRATION" : "✏️ [AI COACH] GOAL OPTIMIZATION";

    let advice = "";
    if (coachPersona === "drill") {
      advice = `TIME TO RAISE THE BAR! You're getting too comfortable with **${targetGoal.name}**! We are upgrading your target to 4 sessions per week at 50 minutes each. Push through resistance and demand more of yourself!`;
    } else if (coachPersona === "data") {
      advice = `**[Routine Recalibration Model]**\n\nAnalysis of completion rates for **${targetGoal.name}** suggests capacity for volume expansion. Scaling to 4 weekly sessions of 45 minutes optimizes neural pathways without triggering the fatigue inflection threshold.`;
    } else {
      advice = `Great thinking! Tuning your goal targets is the best way to keep your routine engaging and sustainable. 🌱\n\nLet's update **${targetGoal.name}** to 4 sessions per week with 45-minute focus intervals. This creates steady, comfortable progress.`;
    }

    return `**${badge}**\n\n${advice}\n\n\`\`\`json
{
  "goalAction": {
    "action": "update_goal",
    "goalId": "${targetGoal.id}",
    "goalName": "${targetGoal.name}",
    "updatedFields": {
      "weeklyTarget": 4,
      "durationMinutes": 45,
      "timePreference": "morning"
    }
  }
}
\`\`\``;
  }

  // 3. PROCRASTINATION / LAZY / UNMOTIVATED / START
  if (lowerPrompt.includes("lazy") || lowerPrompt.includes("procrastin") || lowerPrompt.includes("unmotivated") || lowerPrompt.includes("start") || lowerPrompt.includes("overwhelm")) {
    let advice = "";
    if (coachPersona === "drill") {
      advice = `**🏋️‍♂️ [DRILL SERGEANT] THE 120-SECOND PROTOCOL**\n\nLISTEN UP RECRUIT! Motivation is a fleeting emotion, DISCIPLINE is an iron habit! You don't need to feel like doing it, you just need to START!\n\n### ⚡ Immediate Orders\n1. **The 2-Minute Rule**: Don't think about the whole session. Commit to exactly 120 SECONDS of execution right now.\n2. **Eliminate Friction**: Open your code editor, put on your training shoes, or open your notebook.\n3. **Kill the Phone**: Put your smartphone in another room or face-down.\n\nOnce the first 2 minutes pass, inertia is broken. GET UP AND GET TO WORK!`;
    } else if (coachPersona === "data") {
      advice = `**📊 [ANALYST ENGINE] FRICTION REDUCTION PROTOCOL**\n\nBehavioral telemetry reveals that 82% of task cancellations stem from perceived cognitive startup friction rather than the difficulty of the task itself.\n\n### 📈 Empirical De-escalation Strategy\n- **Micro-Initiation Threshold**: Commit to a 3-minute atomic start. Dopamine secretion triggers upon task engagement, reducing psychological resistance by 64%.\n- **Environmental Cues**: Clear digital clutter (close unused browser tabs, activate Do Not Disturb).\n- **Session Chunking**: Split the upcoming block into 25-minute Pomodoro bursts with mandatory 5-minute hydration stand-ups.`;
    } else {
      advice = `**🌸 [MENTOR COACH] GENTLE RESET & MINDFUL START**\n\nIt is completely okay to feel low energy or resistance today. Please don't be hard on yourself—everyone experiences days where starting feels like climbing a mountain. 🌱\n\n### 🌿 Gentle 3-Step Re-entry\n1. **Give yourself permission to do the bare minimum**: Tell yourself you're only going to sit down for 2 minutes with zero expectations.\n2. **Take 3 deep, grounding breaths**: Inhale calm, exhale the pressure.\n3. **Celebrate just opening the materials**: Often, simply showing up is the whole victory. If you still feel exhausted after 5 minutes, we can gently reschedule, and that is 100% okay! You are doing great.`;
    }
    return `${advice}\n\n\`\`\`json\n{\n  "goalAction": {\n    "action": "launch_timer",\n    "timerConfig": {\n      "title": "2-Minute Micro-Action Starter",\n      "durationMinutes": 2,\n      "category": "Focus"\n    }\n  }\n}\n\`\`\``;
  }

  // 4. STUDY / LEARNING STRATEGIES / POMODORO
  if (lowerPrompt.includes("study") || lowerPrompt.includes("learn") || lowerPrompt.includes("pomodoro") || lowerPrompt.includes("recall") || lowerPrompt.includes("focus")) {
    if (coachPersona === "drill") {
      return `**🧠 [DRILL SERGEANT] HIGH-INTENSITY COGNITIVE PROTOCOL**\n\nPASSIVE READING IS FOR AMATEURS! If you want real mastery in your study blocks, you must engage in ACTIVE DRILLING!\n\n### 🎯 Combat Study Rules\n- **Active Recall**: Close your notes and write down everything you remember from scratch. If you struggle, that means your brain is growing!\n- **Feynman Technique**: Explain the concept out loud as if teaching a 10-year-old recruit. If you stumble, re-study the gap immediately!\n- **50/10 Split**: 50 minutes of pure silent focus, zero notifications. 10 minutes of active walking and hydration. LOCK IN!`;
    } else if (coachPersona === "data") {
      return `**📊 [ANALYST ENGINE] COGNITIVE RETENTION OPTIMIZATION**\n\nOptimizing memory retention requires leveraging the spacing effect and testing effect to flatten the Ebbinghaus forgetting curve.\n\n### 🔬 Recommended Cognitive Architecture\n- **Interleaved Practice**: Alternate between complementary subjects (e.g., 45m algorithmic coding followed by 45m system design) to build flexible mental representations (+36% retention).\n- **Ultradian Rhythm Sync**: Limit continuous high-load cognitive blocks to 90 minutes, followed by a 20-minute systemic mental reset.\n- **Active Testing Cycles**: Spend 30% of time reading and 70% practicing retrieval and solving problems.`;
    } else {
      return `**📚 [MENTOR COACH] MINDFUL & EFFECTIVE LEARNING**\n\nLearning is a journey of curiosity! When you give your mind the space to absorb ideas calmly, deep understanding follows naturally. ✨\n\n### 💡 Beautiful Study Techniques to Try\n- **The Pomodoro Rhythm**: 25 minutes of cozy, undistracted focus, followed by 5 minutes to stretch, sip some tea, and rest your eyes.\n- **Teach It to a Friend**: Try summarizing the core idea in 3 simple sentences. It's a wonderful way to solidify your confidence.\n- **Honor Your Breaks**: True memory consolidation happens when your brain rests after a focus block. Enjoy your pauses!`;
    }
  }

  // 5. WORKOUT / FITNESS / CARDIO / EXERCISE
  if (lowerPrompt.includes("workout") || lowerPrompt.includes("fitness") || lowerPrompt.includes("cardio") || lowerPrompt.includes("gym") || lowerPrompt.includes("exercise") || lowerPrompt.includes("strength")) {
    if (coachPersona === "drill") {
      return `**🏋️‍♂️ [DRILL SERGEANT] PHYSICAL EXCELLENCE PROTOCOL**\n\nSWEAT SAVES SUFFERING! A strong body fuels a razor-sharp mind! When your workout block rings, NO DELAYS!\n\n### 💥 Execution Directives\n- **Warm Up with Purpose**: 5 minutes of dynamic mobility—jump rope, leg swings, arm circles.\n- **Progressive Overload**: More reps, more weight, or tighter rest intervals every single week.\n- **Finish Empty**: Give everything you've got in the final set. Cool down, rehydrate, and log the victory! DISCIPLINE WINS!`;
    } else if (coachPersona === "data") {
      return `**📊 [ANALYST ENGINE] PHYSIOLOGICAL ADAPTATION MATRIX**\n\nOptimal training distribution balances mechanical tension, metabolic stress, and central nervous system (CNS) recovery windows.\n\n### 📈 Prescribed Training Variables\n- **Split Frequency**: 3 to 4 resistance sessions weekly, spaced by at least 24–48 hours for target muscle groups.\n- **Heart Rate Zone 2 Base**: Include 30–45 minutes of steady Zone 2 cardio (60–70% HR max) to elevate mitochondrial density and cognitive alertness.\n- **Hydration & Electrolytes**: Maintain 500ml water intake per 45 minutes of training to avoid 15% neuromuscular power drops.`;
    } else {
      return `**🌱 [MENTOR COACH] NURTURING MOVEMENT & VITALITY**\n\nMovement is a celebration of what your body can do, not a chore! Moving regularly boosts your mood, clears your mind, and gives you wonderful energy for your creative goals. ✨\n\n### 🌿 Balanced Approach to Fitness\n- **Listen to Your Body**: Some days you'll feel like setting personal bests; other days, a brisk walk in the sunshine or gentle yoga is exactly what your spirit needs.\n- **Consistency Over Intensity**: Showing up 3 times a week with joy will always beat burning out in two weeks.\n- **Celebrate Every Session**: When you finish, take a moment to thank yourself for taking care of your health!`;
    }
  }

  // 6. OVERLAP / SCHEDULE / CONFLICTS / TIME-MANAGEMENT
  if (lowerPrompt.includes("overlap") || lowerPrompt.includes("conflict") || lowerPrompt.includes("busy") || lowerPrompt.includes("reschedule") || lowerPrompt.includes("time") || lowerPrompt.includes("calendar")) {
    let advice = "";
    if (coachPersona === "drill") {
      advice = `**⏱️ [DRILL SERGEANT] SCHEDULE DECONFLICT PROTOCOL**\n\nDOUBLE BOOKINGS ARE A SIGN OF POOR PLANNING, RECRUIT! We do not tolerate overlapping chaos on the calendar!\n\n### 🛡️ Battlefield Orders\n- **Buffer Zones**: Insert a mandatory 15-minute barrier between all appointments.\n- **Priority Sorting**: Non-negotiable deep work and workouts come FIRST. Everything else fits into the remaining gaps.\n- **Ruthless Elimination**: If an activity doesn't advance your mission, cancel it or delegate it immediately!`;
    } else if (coachPersona === "data") {
      advice = `**📊 [ANALYST ENGINE] SCHEDULE REBALANCING & ZERO-COLLISION MATRIX**\n\nCalendar analysis reveals potential friction when transition buffers drop below 10 minutes between contrasting cognitive task domains.\n\n### 🔍 Optimization Architecture\n- **Transition Dampening**: Add 15-minute buffers between study and social/work commitments to eliminate mental residue.\n- **Batch Processing**: Group reactive communication (emails, administrative check-ins) into a single 30-minute block at 16:30.\n- **Automated Rebalancing**: Use our AI Schedule Controller to automatically deconflict and shift overlapping blocks into open slots.`;
    } else {
      advice = `**🌸 [MENTOR COACH] CALM CALENDAR HARMONY**\n\nWhen our calendar feels crowded, it's a gentle sign to breathe, step back, and bring peace back into our day. You don't have to do everything all at once. ✨\n\n### 🌿 Restoring Schedule Peace\n- **Give yourself breathing room**: A 15-minute cup of tea or walk between commitments makes the whole day feel spacious.\n- **Flexibility with Kindness**: If an unexpected meeting pops up, simply slide your focus block to tomorrow without any guilt.\n- **Protect Your Evenings**: Keep your late evenings free of work so your mind can recharge deeply.`;
    }
    return `${advice}\n\n\`\`\`json\n{\n  "goalAction": {\n    "action": "auto_resolve_conflicts"\n  }\n}\n\`\`\``;
  }

  // 7. DEFAULT HOLISTIC COACHING ADVICE
  let defaultBadge = coachPersona === "drill" ? "🏋️‍♂️ [DRILL SERGEANT] DISCIPLINE AUDIT" : coachPersona === "data" ? "📊 [ANALYST ENGINE] ROUTINE PERFORMANCE AUDIT" : "🌸 [MENTOR COACH] EMPOWERMENT & MINDFUL COGNITION";

  let defaultText = "";
  if (coachPersona === "drill") {
    defaultText = `Regarding your query "${prompt || 'Weekly Routine Optimization'}":\n\n- **Stand Tall & Execute**: You have goals on your dashboard—commit to them like a warrior!\n- **Daily Accountability**: Check off each session the minute you complete it. No excuses!\n- **Relentless Focus**: Keep your momentum going and dominate today!`;
  } else if (coachPersona === "data") {
    defaultText = `**[Routine System Analysis for: "${prompt || 'Weekly Routine Optimization'}"]**\n\n- **Consistency Index**: 0.82 (High Performance Trajectory)\n- **Active Goal Allocations**: ${goals.length} active tracked objectives with ${events.length} weekly scheduled blocks.\n- **Prescription**: Prioritize morning focus blocks (08:30–11:30 AM) where cognitive output benchmarks reach maximum efficiency.`;
  } else {
    defaultText = `Thank you for asking about **"${prompt || 'your routine'}"**! 🌱\n\n- ✨ **You are on the right track**: Taking time to reflect on your schedule is the first step toward lasting, joyful habits.\n- 💡 **Actionable Tip**: Choose just one primary focus block today and give it your full, calm attention.\n- 🌿 **Consistency with Ease**: Remember that slow, steady progress builds true mastery. Keep shining!`;
  }

  return `**${defaultBadge}**\n\n${defaultText}`;
}

// 3. AI COACH ENDPOINT (ROBUST MULTI-TURN & CONTEXT-AWARE)
app.post("/api/coach/optimize", async (req, res) => {
  const { 
    prompt, 
    goals = [], 
    events = [], 
    availability = [], 
    coachPersona = "mentor",
    conversationHistory = [] 
  } = req.body;
  const keyAvailable = !!process.env.GEMINI_API_KEY;

  let personaInstruction = "";
  if (coachPersona === "drill") {
    personaInstruction = `Adopt the persona of a tough-love, high-energy, direct military Drill Sergeant coach. Use phrases like "LISTEN UP RECRUIT!", "NO EXCUSES!", "STAY DISCIPLINED!", and hold them strictly accountable with motivating energy!`;
  } else if (coachPersona === "data") {
    personaInstruction = `Adopt the persona of an analytical, quantitative data-science Productivity Systems Optimizer. Use terms like "consistency index", "probabilistic alignment", "performance metrics", and output trends, statistical models, and structured bullet lists.`;
  } else {
    personaInstruction = `Adopt the persona of an encouraging, warm, gentle, and empathetic mentor and life coach. Validate their challenges, build confidence, use kind words, positive mindfulness suggestions, and warm emojis.`;
  }

  const systemPrompt = `You are a world-class Productivity & Routine Optimizer Coach. ${personaInstruction}
You analyze calendar events, user availability, and workout/study goals to suggest smart scheduling optimizations, time management, motivational challenges, and productivity tips.

YOU HAVE FULL AUTHORITY TO PROPOSE CREATING NEW GOALS, MODIFYING EXISTING GOALS, DELETING INACTIVE GOALS, AUTO-RESOLVING SCHEDULE CONFLICTS, OR LAUNCHING TIMED FOCUS SESSIONS!

Format your output using elegant, clean Markdown:
- Use clear subheadings (e.g. ### 🎯 Section Title)
- Use bullet points with bold lead-ins (- **Concept**: Description)
- Highlight key terms with clean bold text (**React.js**, **20/5/5 Rule**)
- Do not output meta warnings or disclaimer apologies. Speak directly to the user.

INTERACTIVE ACTION PROPOSALS:
Whenever you suggest creating a goal, modifying a goal, deleting a goal, resolving calendar overlaps, or starting a focus sprint, append a JSON code block at the very end of your response so the user gets an interactive 1-click action button.

Valid formats:
For creating a new goal:
\`\`\`json
{
  "goalAction": {
    "action": "create_goal",
    "goal": {
      "name": "Goal Name",
      "type": "study",
      "category": "Engineering",
      "weeklyTarget": 3,
      "durationMinutes": 45,
      "timePreference": "morning",
      "priority": "high",
      "color": "indigo",
      "icon": "code"
    }
  }
}
\`\`\`

For updating an existing goal:
\`\`\`json
{
  "goalAction": {
    "action": "update_goal",
    "goalId": "EXACT_GOAL_ID",
    "goalName": "Goal Name",
    "updatedFields": {
      "weeklyTarget": 4,
      "durationMinutes": 45,
      "timePreference": "evening"
    }
  }
}
\`\`\`

For auto-resolving calendar conflicts, overlapping sessions, or schedule drift:
\`\`\`json
{
  "goalAction": {
    "action": "auto_resolve_conflicts"
  }
}
\`\`\`

For starting a focus session or 2-minute / 25-minute sprint:
\`\`\`json
{
  "goalAction": {
    "action": "launch_timer",
    "timerConfig": {
      "title": "Deep Work Sprint",
      "durationMinutes": 25,
      "category": "Study"
    }
  }
}
\`\`\`

Available Goals (with exact IDs):
${JSON.stringify(goals, null, 2)}

Weekly Calendar Events:
${JSON.stringify(events, null, 2)}

Availability:
${JSON.stringify(availability, null, 2)}`;

  if (keyAvailable) {
    try {
      // Build conversational contents with previous turns if available
      const contentsPayload: any[] = [];
      
      if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        conversationHistory.slice(-6).forEach((h: any) => {
          if (h.role && h.text) {
            contentsPayload.push({
              role: h.role === "user" ? "user" : "model",
              parts: [{ text: h.text }]
            });
          }
        });
      }

      // Add current user prompt
      const currentPromptText = prompt || "Analyze my current routine and suggest 3 direct optimizations to boost my weekly consistency.";
      contentsPayload.push({
        role: "user",
        parts: [{ text: currentPromptText }]
      });

      const result = await generateWithFallback({
        primaryModel: "gemini-4-hydrogen",
        fallbackModel: "gemini-3.1-flash-lite",
        contents: contentsPayload,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        },
        timeoutMs: 18000
      });

      if (result && result.text) {
        return res.json({ text: result.text });
      }
    } catch (err: any) {
      console.warn("[AI Coach API] Cloud model fallback to local intelligence:", err?.message || err);
    }
  }

  // Smart Context-Aware Local Guidance when offline or falling back
  const localAdvice = generateLocalCoachingAdvice(prompt, goals, events, availability, coachPersona);
  return res.json({ text: localAdvice });
});

// 4. AI WEEKLY DIGEST & INSIGHTS ENDPOINT
app.post("/api/coach/digest", async (req, res) => {
  const { goals = [], events = [], availability = [] } = req.body;
  const keyAvailable = !!process.env.GEMINI_API_KEY;

  const completedEvents = events.filter((e: any) => e.completed);
  const totalScheduled = events.length;
  const completionRate = totalScheduled > 0 ? Math.round((completedEvents.length / totalScheduled) * 100) : 78;

  const fallbackAdjustments = [
    {
      id: "adj_freq",
      text: "Reduce daily session frequency to prevent task backlog",
      actionType: "reduce_frequency",
      actionLabel: "Balance Daily Frequency",
      impact: "Caps next week to max 2 goal sessions/day & spreads excess load",
      params: { maxSessionsPerDay: 2 }
    },
    {
      id: "adj_review",
      text: "Prioritize the 'Review' subtasks to consolidate learning before moving to new material",
      actionType: "prioritize_review",
      actionLabel: "Prioritize Review First",
      impact: "Moves Review steps to Step 1 across Study goals & next week's sessions",
      params: { targetGoalScope: "study" }
    },
    {
      id: "adj_catchup",
      text: "Incorporate a dedicated 'catch-up' day to clear pending sessions without adding new ones",
      actionType: "catch_up_day",
      actionLabel: "Set Catch-Up Day",
      impact: "Reserves a day next week to clear pending tasks without adding new ones",
      params: { catchUpDayOfWeek: 5 }
    }
  ];

  if (!keyAvailable) {
    await new Promise((r) => setTimeout(r, 600));
    return res.json({
      productivityScore: completionRate,
      peakFocusWindow: "09:00 - 11:30 AM (92% completion rate)",
      reflectionSummary: "Your cognitive focus was exceptionally strong during morning slots (08:00–11:30 AM), achieving a 92% completion rate across Python Dev and React Masterclass sessions. Afternoon slots experienced slight dip friction.",
      productivityPatterns: [
        "Peak Cognitive Focus: Morning blocks (09:00 - 11:30 AM) show highest completion rate (92%) and zero distraction skips.",
        "Physical Routine Momentum: Morning Cardio sessions executed consistently when scheduled before 09:00 AM.",
        "Evening Fatigue Dip: Sessions scheduled after 20:30 PM saw a 35% higher drop rate due to cognitive fatigue."
      ],
      recommendedAdjustments: fallbackAdjustments
    });
  }

  try {
    const systemPrompt = `You are a Productivity Analytics AI generating a Weekly Digest & Insights report.
Analyze the user's goals and completed events. Return JSON with the following EXACT key structure:
{
  "productivityScore": number,
  "peakFocusWindow": string,
  "reflectionSummary": string,
  "productivityPatterns": [string, string, string],
  "recommendedAdjustments": [
    {
      "id": "string",
      "text": "clear recommendation sentence",
      "actionType": "reduce_frequency" | "prioritize_review" | "catch_up_day" | "shift_peak_window" | "cap_duration" | "add_buffers" | "general_rebalance",
      "actionLabel": "short 2-4 word action button label",
      "impact": "concise 1-line preview of what changes next week",
      "params": {
        "maxSessionsPerDay": number (optional),
        "catchUpDayOfWeek": number 0-6 (optional),
        "peakStartHour": number 0-23 (optional),
        "peakEndHour": number 0-23 (optional),
        "maxDurationMinutes": number (optional),
        "cutoffHour": number 0-23 (optional),
        "bufferMinutes": number (optional),
        "targetGoalScope": "all" | "study" | "light_routines" | "evening" (optional)
      }
    }
  ]
}
Provide 3 high-impact, concrete recommendedAdjustments tailored to the user's real patterns. Return ONLY valid JSON. No markdown syntax wrapper.`;

    const userPrompt = `Goals: ${JSON.stringify(goals)}\nCompleted/Scheduled Events: ${JSON.stringify(events)}\nAvailability: ${JSON.stringify(availability)}`;
    const result = await generateWithFallback({
      primaryModel: "gemini-4-hydrogen",
      fallbackModel: "gemini-3.1-flash-lite",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });

    if (result && result.text) {
      const parsed = JSON.parse(result.text.trim());
      if (parsed && typeof parsed.productivityScore === "number") {
        return res.json(parsed);
      }
    }
  } catch (err: any) {
    console.warn("Digest parsing/generation notice:", err?.message || err);
  }

  return res.json({
    productivityScore: completionRate,
    peakFocusWindow: "09:00 - 11:30 AM (High Focus Peak)",
    reflectionSummary: "Solid weekly progress! You maintained strong focus during technical study blocks, while overloaded days and pending tasks created avoidable friction.",
    productivityPatterns: [
      "Technical study blocks achieve strongest completion consistency in dedicated focus windows.",
      "High consistency across core technical domains when scheduled cleanly.",
      "Pending tasks accumulate quickly when daily scheduling density increases."
    ],
    recommendedAdjustments: fallbackAdjustments
  });
});

// 4b. LIVE PROACTIVE AI GOAL SENTINEL DEEP SCAN EVALUATOR
app.post("/api/sentinel/evaluate", async (req, res) => {
  const { 
    goals = [], 
    events = [], 
    energyProfile = {}, 
    burnoutLimits = {} 
  } = req.body;

  const keyAvailable = !!process.env.GEMINI_API_KEY;

  if (keyAvailable) {
    try {
      const systemPrompt = `You are an Autonomous Routine & Goal Sentinel. You actively monitor a user's weekly goals, scheduled calendar events, chronotype energy zones, and burnout limits.
Provide a sharp, encouraging, 1-2 sentence proactive directive to optimize their habit consistency, protect against circadian slumps, or catch up on lagging goals.
Do not include generic fluff. Be direct, specific, and actionable. Refer specifically to one of their goals or energy peak windows if possible.
Return a JSON object with:
{
  "personalizedAdvice": "string (1-2 sentences)",
  "focusRecommendation": "string"
}
Return ONLY valid JSON. No markdown ticks.`;

      const userPrompt = `Active Goals: ${JSON.stringify(goals.map((g: any) => ({ id: g.id, name: g.name, target: g.weeklyTarget, completed: g.completedCount, duration: g.durationMinutes })))}
Weekly Events Scheduled: ${events.length} events
Energy Chronotype: ${energyProfile.chronotype || "steady"} (Slump protection: ${energyProfile.slumpProtection !== false})
Burnout Ceiling: ${burnoutLimits.weekdayMaxHours || 3.5}h weekday / ${burnoutLimits.weekendMaxHours || 5.0}h weekend`;

      const result = await generateWithFallback({
        primaryModel: "gemini-4-hydrogen",
        fallbackModel: "gemini-3.1-flash-lite",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json"
        }
      });

      if (result && result.text) {
        const parsed = JSON.parse(result.text.trim());
        if (parsed && parsed.personalizedAdvice) {
          return res.json({
            success: true,
            personalizedAdvice: parsed.personalizedAdvice,
            focusRecommendation: parsed.focusRecommendation || "Align deep work blocks with morning alertness peak."
          });
        }
      }
    } catch (err: any) {
      console.warn("Sentinel evaluate AI generation notice:", err?.message || err);
    }
  }

  // Fallback intelligent heuristic synthesis
  const activeCount = Array.isArray(goals) ? goals.filter((g: any) => !g.isPaused).length : 0;
  const chronotype = energyProfile?.chronotype || "steady";
  let advice = "Your calendar schedule is synchronized with active goals.";
  if (chronotype === "early_bird") {
    advice = "Your Early Bird rhythm reaches maximum cognitive absorption before 11:30 AM. Protect morning hours for high-difficulty technical blocks.";
  } else if (chronotype === "night_owl") {
    advice = "Night Owl alertness naturally elevates in late afternoon and evening. Reserve midday slump periods for light administrative review and active movement.";
  } else {
    advice = "Keep high-priority sessions anchored to your morning peak, leaving a mandatory 15-minute buffer between tasks to eliminate cognitive fatigue.";
  }

  return res.json({
    success: true,
    personalizedAdvice: advice,
    focusRecommendation: "Protect your recovery windows and maintain daily session pacing."
  });
});

// 5. AI SUB-STEPS & SESSION PHASING GENERATOR
app.post("/api/coach/suggest-substeps", async (req, res) => {
  const { 
    goalName = "Deep Focus Session", 
    goalType = "study", 
    category = "General", 
    durationMinutes = 60,
    difficulty = "intermediate",
    focusStyle = "balanced"
  } = req.body;

  const keyAvailable = !!process.env.GEMINI_API_KEY;
  const targetDur = Math.max(15, Number(durationMinutes) || 60);

  // Smart heuristic algorithmic generator used when Gemini is not configured or as instant fallback
  function generateFallbackSubSteps(name: string, type: string, dur: number, diff: string) {
    const nameLower = name.toLowerCase();
    
    if (type === "workout" || nameLower.includes("cardio") || nameLower.includes("fitness") || nameLower.includes("run") || nameLower.includes("gym")) {
      const warmup = Math.max(5, Math.round(dur * 0.15));
      const cooldown = Math.max(5, Math.round(dur * 0.15));
      const main = Math.max(10, dur - warmup - cooldown);
      return {
        subSteps: [
          { id: "step_1", title: "Dynamic Warm-up & Mobility", durationMinutes: warmup, description: "Joint rotations, light cardio ramp, and activation." },
          { id: "step_2", title: "Core Workout Sets / Main Routine", durationMinutes: main, description: "Target muscle groups or high-intensity intervals." },
          { id: "step_3", title: "Cool-down & Static Stretching", durationMinutes: cooldown, description: "Lower heart rate and stretch major muscle groups." }
        ],
        rationale: `Optimal 3-stage training block: ${warmup}m injury-prevention warmup, ${main}m progressive intensity work, and ${cooldown}m recovery stretching.`,
        totalDuration: dur
      };
    }

    if (type === "job_search" || nameLower.includes("job") || nameLower.includes("interview") || nameLower.includes("resume")) {
      const research = Math.max(10, Math.round(dur * 0.25));
      const review = Math.max(10, Math.round(dur * 0.20));
      const apply = Math.max(15, dur - research - review);
      return {
        subSteps: [
          { id: "step_1", title: "Role Research & Job Board Scan", durationMinutes: research, description: "Identify 3-5 high-match target openings and recruiter contacts." },
          { id: "step_2", title: "Tailored Applications & Cover Notes", durationMinutes: apply, description: "Customize resume keywords and submit high-quality applications." },
          { id: "step_3", title: "Networking Outreach & Tracking", durationMinutes: review, description: "Send connection notes on LinkedIn and log entries in tracker." }
        ],
        rationale: `Structured pipeline: ${research}m sourcing, ${apply}m targeted submissions, and ${review}m relationship building.`,
        totalDuration: dur
      };
    }

    if (type === "side_project" || nameLower.includes("code") || nameLower.includes("build") || nameLower.includes("saas")) {
      const plan = Math.max(10, Math.round(dur * 0.20));
      const test = Math.max(10, Math.round(dur * 0.20));
      const build = Math.max(15, dur - plan - test);
      return {
        subSteps: [
          { id: "step_1", title: "Architecture & Spec Review", durationMinutes: plan, description: "Review backlog tickets, wireframes, and API contracts." },
          { id: "step_2", title: "Deep Feature Implementation", durationMinutes: build, description: "Write clean code, modules, and component logic." },
          { id: "step_3", title: "Testing, Refactoring & Commit", durationMinutes: test, description: "Run test suites, verify edge cases, and push git commit." }
        ],
        rationale: `Engineering flow: ${plan}m design check, ${build}m uninterrupted coding, and ${test}m verification.`,
        totalDuration: dur
      };
    }

    // Default Study / Learning Session Breakdown (Review -> Core Practice -> Quiz / Recall)
    if (dur <= 30) {
      const rev = 7;
      const core = 15;
      const quiz = 8;
      return {
        subSteps: [
          { id: "step_1", title: "Flashcard & Prerequisite Review", durationMinutes: rev, description: "Active recall of key terms and concepts from prior sessions." },
          { id: "step_2", title: "Focused Topic Study", durationMinutes: core, description: "Read new material or work through sample problems." },
          { id: "step_3", title: "Rapid Self-Quiz & Summary", durationMinutes: quiz, description: "Close books and write a quick 3-bullet takeaway quiz." }
        ],
        rationale: `Rapid 30m Micro-Sprint: ${rev}m recall ramp, ${core}m new content, and ${quiz}m retention checkpoint.`,
        totalDuration: 30
      };
    }

    if (dur >= 90) {
      const part1 = Math.round(dur * 0.18); // e.g. 15-20m
      const part2 = Math.round(dur * 0.42); // e.g. 38-40m
      const part3 = Math.round(dur * 0.25); // e.g. 20-25m
      const part4 = dur - part1 - part2 - part3; // e.g. 12-15m
      return {
        subSteps: [
          { id: "step_1", title: "Theory & Prerequisite Review", durationMinutes: part1, description: "Spaced repetition flashcards and review of previous session notes." },
          { id: "step_2", title: "Deep Practice & Problem Solving", durationMinutes: part2, description: "Solve complex questions and apply concepts actively without looking at answers." },
          { id: "step_3", title: "Timed Diagnostic Practice Quiz", durationMinutes: part3, description: "Simulated exam conditions / test questions under clock pressure." },
          { id: "step_4", title: "Error Analysis & Mistake Journaling", durationMinutes: part4, description: "Break down why errors occurred and record notes for next session." }
        ],
        rationale: `Intensive 4-Stage Mastery Session: ${part1}m theory review, ${part2}m deep practice, ${part3}m timed quiz, and ${part4}m mistake feedback loop.`,
        totalDuration: dur
      };
    }

    // Standard 45 - 60 min Study Breakdown
    const reviewMins = Math.max(10, Math.round(dur * 0.25)); // 15m for 60m
    const quizMins = Math.max(10, Math.round(dur * 0.20));   // 10-15m for 60m
    const practiceMins = Math.max(15, dur - reviewMins - quizMins); // 30-35m for 60m

    return {
      subSteps: [
        { 
          id: "step_1", 
          title: "Concept Review & Active Recall", 
          durationMinutes: reviewMins, 
          description: "Review prior formulas, flashcards, or highlight summary notes." 
        },
        { 
          id: "step_2", 
          title: "Deep Problem Set & Core Study", 
          durationMinutes: practiceMins, 
          description: "Execute primary learning exercises, code challenges, or textbook questions." 
        },
        { 
          id: "step_3", 
          title: "Self-Testing Quiz & Takeaways", 
          durationMinutes: quizMins, 
          description: "Take a self-quiz without notes and write key session takeaways in notes." 
        }
      ],
      rationale: `Evidence-based 3-stage study architecture: ${reviewMins}m retrieval warm-up, ${practiceMins}m deliberate practice, and ${quizMins}m testing effect reinforcement.`,
      totalDuration: dur
    };
  }

  if (!keyAvailable) {
    await new Promise((r) => setTimeout(r, 300));
    return res.json(generateFallbackSubSteps(goalName, goalType, targetDur, difficulty));
  }

  try {
    const systemPrompt = `You are an expert Learning Sciences & Productivity Coach.
Your task is to break down a study or focus session into 2 to 4 timed sub-steps (phases) totaling EXACTLY ${targetDur} minutes.
Recommended patterns:
- For Study/Academic: Step 1 = Concept & Formula Review (15-25%), Step 2 = Deep Practice Problems (50-60%), Step 3 = Self-Quiz & Mistake Logging (15-25%).
- For Workout: Step 1 = Dynamic Warmup (15%), Step 2 = Core Sets (70%), Step 3 = Cooldown & Stretch (15%).
- For Coding/Projects: Step 1 = Spec Review (20%), Step 2 = Implementation (60%), Step 3 = Testing & Committing (20%).

The sum of all "durationMinutes" across subSteps MUST equal exactly ${targetDur}.

Return JSON in this EXACT schema:
{
  "subSteps": [
    {
      "id": "step_1",
      "title": "Title of phase",
      "durationMinutes": 15,
      "description": "Short explanation of what to do in this phase"
    }
  ],
  "rationale": "One-sentence explanation of why this phase breakdown optimizes learning retention and cognitive pacing.",
  "totalDuration": ${targetDur}
}
Return ONLY valid JSON. No markdown ticks.`;

    const userPrompt = `Goal Name: "${goalName}"\nType: "${goalType}"\nCategory: "${category}"\nTotal Session Duration: ${targetDur} minutes\nDifficulty / Focus: "${difficulty}"`;

    const result = await generateWithFallback({
      primaryModel: "gemini-4-hydrogen",
      fallbackModel: "gemini-3.1-flash-lite",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });

    if (result && result.text) {
      const parsed = JSON.parse(result.text.trim());
      if (parsed && Array.isArray(parsed.subSteps) && parsed.subSteps.length > 0) {
        // Ensure ids are unique and durations sum up to targetDur
        let currentSum = parsed.subSteps.reduce((acc: number, s: any) => acc + (Number(s.durationMinutes) || 0), 0);
        if (currentSum !== targetDur && parsed.subSteps.length > 0) {
          const diff = targetDur - currentSum;
          parsed.subSteps[parsed.subSteps.length - 1].durationMinutes = Math.max(5, (parsed.subSteps[parsed.subSteps.length - 1].durationMinutes || 10) + diff);
        }
        parsed.totalDuration = targetDur;
        return res.json(parsed);
      }
    }

    return res.json(generateFallbackSubSteps(goalName, goalType, targetDur, difficulty));
  } catch (err: any) {
    console.warn("Sub-steps generator notice:", err?.message || err);
    return res.json(generateFallbackSubSteps(goalName, goalType, targetDur, difficulty));
  }
});

// 5b. GOAL KNOWLEDGE HUB - STUDY NOTES GENERATOR
app.post("/api/coach/generate-study-notes", async (req, res) => {
  const {
    goalTitle = "Study Session",
    goalCategory = "General",
    chapterTitle = "",
    examTitle = ""
  } = req.body;

  function generateFallbackNotes(title: string, category: string, chapter: string, exam: string) {
    const topic = chapter || title;
    const isSecurity = /cyber|security|soc|pen|threat|firewall/i.test(title + " " + topic);
    const isIT = /it|support|network|hardware|helpdesk|dns|ip/i.test(title + " " + topic);
    const isCoding = /code|react|typescript|python|web|program|dev/i.test(title + " " + topic);

    let summaryText = "";
    let terms: string[] = [];
    let flashcards: any[] = [];

    if (isSecurity) {
      summaryText = `### Core Concepts & Defense-in-Depth\n- **CIA Triad**: Confidentiality (encryption, ACLs), Integrity (hashing, checksums), Availability (redundancy, DDoS defense).\n- **Threat Vectors**: Phishing, social engineering, zero-day vulnerabilities, unpatched services.\n- **Zero Trust Principle**: Never trust, always verify. Enforce continuous identity inspection and least-privilege access controls.\n\n### Practical Safeguards\n- Multi-factor Authentication (MFA/FIDO2) prevents >99% of bulk credential attacks.\n- Automated audit logging and SIEM ingestion for real-time anomalous lateral movement detection.\n- Regular penetration testing and vulnerability scans with CVSS prioritization.`;
      terms = ["CIA Triad", "Zero Trust", "Least Privilege", "SIEM", "MFA", "Phishing Vector"];
      flashcards = [
        { id: "fc_1", front: "What are the three pillars of the CIA Triad?", back: "Confidentiality (protect data from unauthorized access), Integrity (ensure data isn't altered), and Availability (ensure systems are accessible).", mastered: false },
        { id: "fc_2", front: "What does the principle of Least Privilege dictate?", back: "Users and processes should only receive the minimum permissions necessary to perform their legitimate job functions.", mastered: false },
        { id: "fc_3", front: "What is the primary role of a SIEM system?", back: "Aggregating, correlating, and analyzing log data across an enterprise in real-time to alert on security events.", mastered: false }
      ];
    } else if (isIT) {
      summaryText = `### Foundational Troubleshooting Methodology\n- **Step 1**: Identify the problem (gather user reports, question changes, inspect symptoms).\n- **Step 2**: Establish a theory of probable cause (test simplest explanations first like cables and DHCP).\n- **Step 3**: Test theory to determine cause, then plan and implement resolution.\n- **Step 4**: Verify full system functionality and implement preventive countermeasures.\n- **Step 5**: Document findings, actions, and outcomes in ticketing system.\n\n### Essential Networking & Protocols\n- **DNS (Port 53)**: Domain name translation.\n- **DHCP (Ports 67/68)**: Automatic dynamic IP address assignment (DORA flow: Discover, Offer, Request, Acknowledge).\n- **TCP vs UDP**: TCP is connection-oriented and guaranteed delivery; UDP is low-latency connectionless.`;
      terms = ["CompTIA Troubleshooting Model", "DORA Process", "DNS Port 53", "DHCP", "Default Gateway", "Subnet Mask"];
      flashcards = [
        { id: "fc_1", front: "What are the 4 stages of DHCP address allocation?", back: "DORA: Discover (client broadcast), Offer (server response), Request (client selection), Acknowledge (server lease confirmation).", mastered: false },
        { id: "fc_2", front: "What command verifies end-to-end IP connectivity and round-trip latency?", back: "ping (uses ICMP Echo Request / Echo Reply packets).", mastered: false },
        { id: "fc_3", front: "What is the first step in the CompTIA 6-step troubleshooting methodology?", back: "Identify the problem (question the user, identify changes, review system logs).", mastered: false }
      ];
    } else if (isCoding) {
      summaryText = `### Key Architectural Paradigms\n- **Declarative vs Imperative**: Declarative programming defines *what* state should look like; the runtime manages DOM reconciliation.\n- **Pure Functions**: Deterministic outputs given same inputs, zero side effects outside scope.\n- **State Management**: Keep single source of truth; lift state up to common ancestors or leverage lightweight stores.\n\n### Optimization & Best Practices\n- Avoid premature optimization; profile render lifecycles before memoizing.\n- Clean async error boundaries with robust retry and optimistic update fallbacks.\n- Defensive input sanitization and TypeScript type narrowing.`;
      terms = ["Pure Functions", "Immutability", "State Lifting", "Async/Await", "Reconciliation", "Memoization"];
      flashcards = [
        { id: "fc_1", front: "What defines an idempotent or pure function?", back: "It always produces the identical output given the same input arguments and causes zero observable side effects.", mastered: false },
        { id: "fc_2", front: "Why should state updates in React be treated as immutable?", back: "React relies on reference equality checks (Object.is) to detect changes and trigger optimal component re-renders.", mastered: false },
        { id: "fc_3", front: "What is the key difference between optimistic and pessimistic updates?", back: "Optimistic updates immediately reflect UI changes before server confirmation, rolling back on failure; pessimistic waits for server 200 OK.", mastered: false }
      ];
    } else {
      summaryText = `### Mastery Overview for ${topic}\n- **Core Objective**: Build systematic, deep retention through spaced repetition and active conceptual mapping.\n- **Primary Principles**: Break down complex structures into atomic foundational concepts before tackling edge cases.\n- **Practical Application**: Relate theoretical constructs to real-world scenarios and hands-on lab problems.\n\n### Retention Checklist\n- Self-explain key concepts without reference notes.\n- Solve 3-5 application problems independently.\n- Summarize key takeaways in one concise sentence.`;
      terms = ["Foundational Concepts", "Spaced Repetition", "Active Recall", "First Principles", "Hands-on Practice"];
      flashcards = [
        { id: "fc_1", front: `What is the core premise of ${topic}?`, back: `Understanding foundational laws, definitions, and workflows that govern ${title} applications.`, mastered: false },
        { id: "fc_2", front: "Why is active recall more effective than passive reading?", back: "Retrieval practice actively strengthens neural pathways and reveals conceptual blind spots.", mastered: false },
        { id: "fc_3", front: "What is the recommended review schedule for spaced repetition?", back: "Reviewing material after 1 day, 3 days, 1 week, and 2 weeks to counteract the Ebbinghaus forgetting curve.", mastered: false }
      ];
    }

    const noteId = "note_" + Date.now();
    return {
      note: {
        id: noteId,
        title: topic ? `${topic} - Essential Study Guide` : `${title} Study Artifact`,
        category: "concept",
        content: summaryText,
        chapterTitle: chapter || undefined,
        keyTerms: terms,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      flashcards
    };
  }

  try {
    const systemPrompt = `You are an elite academic tutor and technical subject-matter expert.
Generate a structured, high-yield study guide artifact and 3-4 active recall flashcards.
The study material must be clear, actionable, technical, and formatted in clean markdown.

Return valid JSON in this EXACT schema:
{
  "title": "Topic or Chapter Guide Title",
  "category": "concept" | "cheat_sheet" | "summary",
  "content": "Comprehensive markdown text with ## headings, bullet points, core concepts, pitfalls, and best practices",
  "keyTerms": ["Term 1", "Term 2", "Term 3", "Term 4"],
  "flashcards": [
    {
      "front": "Prompt question or technical term to test active recall",
      "back": "Clear, concise definition or explanation"
    }
  ]
}
Return ONLY valid JSON. No markdown ticks outside the JSON.`;

    const userPrompt = `Goal: "${goalTitle}"\nCategory: "${goalCategory}"\nSpecific Chapter/Topic: "${chapterTitle || 'Core Curriculum'}"\nTarget Exam/Milestone: "${examTitle || 'Mastery'}"`;

    const result = await generateWithFallback({
      primaryModel: "gemini-4-hydrogen",
      fallbackModel: "gemini-3.1-flash-lite",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });

    if (result && result.text) {
      const parsed = JSON.parse(result.text.trim());
      if (parsed && parsed.content) {
        const noteId = "note_" + Date.now();
        const note = {
          id: noteId,
          title: parsed.title || `${chapterTitle || goalTitle} Study Guide`,
          category: parsed.category || "concept",
          content: parsed.content,
          chapterTitle: chapterTitle || undefined,
          keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const flashcards = Array.isArray(parsed.flashcards)
          ? parsed.flashcards.map((f: any, idx: number) => ({
              id: `fc_${Date.now()}_${idx}`,
              front: f.front || "Concept Question",
              back: f.back || "Concept Explanation",
              chapterTitle: chapterTitle || undefined,
              mastered: false
            }))
          : [];
        return res.json({ note, flashcards });
      }
    }

    return res.json(generateFallbackNotes(goalTitle, goalCategory, chapterTitle, examTitle));
  } catch (err: any) {
    console.warn("Study notes generation notice:", err?.message || err);
    return res.json(generateFallbackNotes(goalTitle, goalCategory, chapterTitle, examTitle));
  }
});

// 5c. GOAL KNOWLEDGE HUB - KNOWLEDGE TEST GENERATOR
app.post("/api/coach/generate-knowledge-test", async (req, res) => {
  const {
    goalTitle = "Knowledge Assessment",
    goalCategory = "General",
    chapterTitle = "",
    examTitle = "",
    difficulty = "medium",
    studyMaterialContext = "",
    assignedLinkTitle = "",
    questionCount = 6,
    sourceMode = "hybrid",
    directNoteQuestions = []
  } = req.body;
  const clampedCount = Math.min(12, Math.max(3, Number(questionCount) || 6));
  const safeContext = typeof studyMaterialContext === "string" ? studyMaterialContext.trim().slice(0, 12000) : "";
  const safeAssignedTitle = typeof assignedLinkTitle === "string" ? assignedLinkTitle.trim().slice(0, 200) : "";
  const requestedMode: "hybrid" | "notes_only" | "ai_only" =
    sourceMode === "notes_only" || sourceMode === "ai_only" ? sourceMode : "hybrid";
  const effectiveMode: "hybrid" | "notes_only" | "ai_only" =
    requestedMode === "ai_only"
      ? "ai_only"
      : !safeContext && (!Array.isArray(directNoteQuestions) || directNoteQuestions.length === 0)
      ? "ai_only"
      : requestedMode;

  const sanitizedDirectQuestions = (effectiveMode === "ai_only" || !Array.isArray(directNoteQuestions))
    ? []
    : directNoteQuestions
        .filter((q: any) => q && typeof q.question === "string" && q.question.trim() && Array.isArray(q.options) && q.options.length >= 2)
        .map((q: any, idx: number) => {
          const opts = q.options.map((o: any) => String(o).trim()).filter(Boolean).slice(0, 6);
          const corrIdx = typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < opts.length ? q.correctIndex : 0;
          return {
            id: typeof q.id === "string" && q.id.trim() ? q.id : `note_q_${Date.now()}_${idx}`,
            question: q.question.trim(),
            options: opts,
            correctIndex: corrIdx,
            explanation: typeof q.explanation === "string" && q.explanation.trim() ? q.explanation.trim() : "Verified from your saved study note.",
            difficulty: q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "medium",
            sourceType: "note" as const,
            sourceLabel: typeof q.sourceLabel === "string" && q.sourceLabel.trim() ? q.sourceLabel.trim() : "From Your Notes"
          };
        })
        .filter((q: any) => q.options.length >= 2);

  // Detect if there are other note types (definitions, summaries, concepts, tables, Q&A, fill-in-the-blank, etc.)
  const hasRichNoteContext = /\[(Definition|Q&A|Fill-in-the-Blank|Table|concept|cheat_sheet|code_snippet|summary|formula|Resource:)/i.test(safeContext);
  const directCap =
    effectiveMode === "notes_only"
      ? (hasRichNoteContext ? Math.max(1, Math.ceil(clampedCount * 0.5)) : clampedCount)
      : Math.max(1, Math.floor(clampedCount * 0.35));
  const pickedDirectQuestions = sanitizedDirectQuestions.slice(0, directCap);
  const aiCountNeeded = Math.max(0, clampedCount - pickedDirectQuestions.length);

  const interleaveQuestions = (noteQs: any[], aiQs: any[]) => {
    const merged: any[] = [];
    const maxLen = Math.max(noteQs.length, aiQs.length);
    for (let i = 0; i < maxLen; i += 1) {
      if (i < aiQs.length) merged.push(aiQs[i]);
      if (i < noteQs.length) merged.push(noteQs[i]);
    }
    return merged.slice(0, clampedCount);
  };

  function generateFallbackTest(title: string, category: string, chapter: string, diff: string) {
    const topic = chapter || title;
    const isSecurity = /cyber|security|soc|pen|threat|firewall/i.test(title + " " + topic);
    const isIT = /it|support|network|hardware|helpdesk|dns|ip/i.test(title + " " + topic);

    let questions: any[] = [];
    if (isSecurity) {
      questions = [
        {
          id: "q_1",
          question: "An organization wants to verify that incoming transmission packets have not been modified in transit. Which cryptographic control best satisfies this requirement?",
          options: [
            "Symmetric AES encryption",
            "Cryptographic hashing (SHA-256)",
            "Diffie-Hellman key exchange",
            "Digital certificate revocation list"
          ],
          correctIndex: 1,
          explanation: "Cryptographic hashing produces a fixed-length digest representing data state. If even one bit changes in transit, the recalculated hash will not match, guaranteeing integrity.",
          difficulty: "medium"
        },
        {
          id: "q_2",
          question: "Which of the following describes the Zero Trust architectural framework?",
          options: [
            "Trusting all authenticated internal subnet requests by default",
            "Enforcing perimeter boundary firewalls while leaving internal traffic uninspected",
            "Continuous verification and least-privilege enforcement regardless of network location",
            "Relying solely on complex passwords without multi-factor authentication"
          ],
          correctIndex: 2,
          explanation: "Zero Trust operates on the principle of 'never trust, always verify'. Every transaction, asset, and user identity is authenticated and authorized dynamically.",
          difficulty: "easy"
        },
        {
          id: "q_3",
          question: "A security analyst discovers multiple failed SSH login attempts followed by a successful login from an unexpected geographical IP. What is the immediate priority action?",
          options: [
            "Delete the affected server log files to prevent overflow",
            "Isolate the affected host from the network and preserve volatile memory",
            "Wait 24 hours to monitor if the attacker executes additional commands",
            "Reboot the host immediately without taking an image"
          ],
          correctIndex: 1,
          explanation: "Isolating the endpoint stops lateral movement and command-and-control communication while preserving volatile RAM artifacts essential for incident forensics.",
          difficulty: "hard"
        },
        {
          id: "q_4",
          question: "Which type of social engineering attack specifically targets high-ranking corporate executives with tailored fraudulent communications?",
          options: [
            "Vishing",
            "Whaling",
            "Baiting",
            "Tailgating"
          ],
          correctIndex: 1,
          explanation: "Whaling is a highly targeted form of spear-phishing aimed directly at C-suite executives and senior leaders.",
          difficulty: "easy"
        }
      ];
    } else if (isIT) {
      questions = [
        {
          id: "q_1",
          question: "A client workstation displays an IP address of 169.254.12.89 and cannot reach external web servers. What is the most probable root cause?",
          options: [
            "The DNS server is returning incorrect MX records",
            "The workstation failed to obtain a lease from the DHCP server (APIPA assigned)",
            "The default gateway has static routing disabled",
            "The client network card is operating in full-duplex mode"
          ],
          correctIndex: 1,
          explanation: "The 169.254.0.0/16 range is Automatic Private IP Addressing (APIPA), assigned by the OS when a DHCP server does not respond to DORA discovery broadcasts.",
          difficulty: "medium"
        },
        {
          id: "q_2",
          question: "Which default TCP/UDP port is utilized by the Domain Name System (DNS) protocol for query resolution?",
          options: [
            "Port 22",
            "Port 53",
            "Port 80",
            "Port 443"
          ],
          correctIndex: 1,
          explanation: "DNS utilizes Port 53 for standard name queries (primarily over UDP, with TCP used for zone transfers and packets exceeding 512 bytes).",
          difficulty: "easy"
        },
        {
          id: "q_3",
          question: "According to standard CompTIA troubleshooting methodology, what step should immediately follow establishing a theory of probable cause?",
          options: [
            "Document findings, actions, and outcomes",
            "Test the theory to determine cause",
            "Establish a plan of action and implement the solution",
            "Verify full system functionality"
          ],
          correctIndex: 1,
          explanation: "Once a theory of probable cause is established, you must test the theory to determine whether it is the true root cause before implementing modifications.",
          difficulty: "medium"
        },
        {
          id: "q_4",
          question: "A user reports that web browsing is failing, but they can still successfully ping 8.8.8.8. Which network component is malfunctioning?",
          options: [
            "Local Physical Network Interface Card",
            "Local Loopback Adapter (127.0.0.1)",
            "DNS Name Resolution Service",
            "Default Gateway Router"
          ],
          correctIndex: 2,
          explanation: "Being able to ping an IP address (8.8.8.8) proves routing and gateway connectivity work; the failure to resolve URLs points directly to a DNS failure.",
          difficulty: "easy"
        }
      ];
    } else {
      questions = [
        {
          id: "q_1",
          question: `In the study of ${topic}, which technique provides the highest long-term retention according to cognitive learning science?`,
          options: [
            "Re-reading highlighted textbook sections multiple times",
            "Active recall testing through practice questions and self-explanation",
            "Listening passively to recorded lectures during sleep",
            "Cramming all material the night before the target deadline"
          ],
          correctIndex: 1,
          explanation: "Empirical studies consistently prove that active recall and retrieval practice induce stronger neural consolidation than passive recognition or re-reading.",
          difficulty: "easy"
        },
        {
          id: "q_2",
          question: `When approaching a complex problem in ${topic}, what is the best first step?`,
          options: [
            "Immediately jump to the most advanced edge cases",
            "Deconstruct the problem into foundational sub-components and identify known constraints",
            "Rely entirely on guessing without forming a hypothesis",
            "Skip to the solution guide to memorize the final output"
          ],
          correctIndex: 1,
          explanation: "First-principles deconstruction allows you to isolate variables, understand underlying mechanics, and systematically resolve complexity.",
          difficulty: "medium"
        },
        {
          id: "q_3",
          question: "What is the primary benefit of tracking mistake patterns in a learning journal?",
          options: [
            "Discouraging further practice by highlighting weaknesses",
            "Targeting deliberate practice specifically on cognitive blind spots",
            "Satisfying administrative compliance requirements",
            "Resetting all previously mastered concepts to zero"
          ],
          correctIndex: 1,
          explanation: "Deliberate error analysis transforms mistakes into actionable feedback loops, preventing the repetition of systematic errors.",
          difficulty: "medium"
        },
        {
          id: "q_4",
          question: `How should spaced repetition intervals be scheduled for optimal mastery of ${title}?`,
          options: [
            "Equal 1-hour intervals repeated continuously for 24 hours",
            "Gradually expanding intervals (e.g. 1 day, 3 days, 1 week, 2 weeks) as retention strengthens",
            "A single intensive session with no subsequent follow-up",
            "Random intervals with no tracking"
          ],
          correctIndex: 1,
          explanation: "Expanding spaced intervals interrupt the forgetting curve at the optimal point when recall effort is highest, maximizing synaptic consolidation.",
          difficulty: "easy"
        }
      ];
    }

    const testId = "test_" + Date.now();
    const fallbackAiPool = questions.map((q: any) => ({
      ...q,
      sourceType: "ai" as const,
      sourceLabel: "AI Question"
    }));
    const combinedFallback = interleaveQuestions(pickedDirectQuestions, fallbackAiPool);
    return {
      test: {
        id: testId,
        title: topic
          ? `${topic} ${effectiveMode === "hybrid" ? "Mixed" : effectiveMode === "notes_only" ? "Notes" : "Knowledge"} Assessment`
          : `${title} Mastery Test`,
        chapterTitle: chapter || undefined,
        generationMode: effectiveMode,
        createdAt: new Date().toISOString(),
        questions: combinedFallback,
        attemptsCount: 0
      }
    };
  }

  // If notes_only has enough direct note questions to satisfy the entire test, return immediately
  if (aiCountNeeded === 0 && pickedDirectQuestions.length > 0) {
    return res.json({
      test: {
        id: "test_" + Date.now(),
        title: `${chapterTitle || goalTitle} · My Notes Assessment`,
        chapterTitle: chapterTitle || undefined,
        generationMode: effectiveMode,
        createdAt: new Date().toISOString(),
        questions: pickedDirectQuestions.slice(0, clampedCount),
        attemptsCount: 0
      }
    });
  }

  try {
    const noteGuidance =
      effectiveMode === "notes_only" && safeContext
        ? `ALL ${aiCountNeeded} questions MUST be derived strictly from the student's provided Study Material Notes (covering their Definitions, Tables, Summaries, Concepts, Cheat Sheets, Formulas, Code Snippets, Q&As, and Fill-in-the-Blank items). Do not ask unrelated outside trivia. Set "sourceType": "note" and "sourceLabel": "From Your Notes" on every question.`
        : effectiveMode === "hybrid" && safeContext
        ? `This is a COMBINATION assessment blending the student's saved study material with fresh AI exam questions:
- Roughly HALF of the ${aiCountNeeded} questions must be grounded directly in the student's provided Study Material Notes (turning their Definitions, Tables, Summaries, Concepts, Cheat Sheets, Formulas, Code Snippets, Q&As, and Fill-in-the-Blank items into rigorous multiple-choice questions). For these, set "sourceType": "note" and "sourceLabel": "From Your Notes".
- The OTHER HALF of the ${aiCountNeeded} questions must be fresh, complementary AI-authored exam/scenario questions covering broader concepts and real-world applications for "${goalTitle}"${chapterTitle ? ` (${chapterTitle})` : ""}. For these, set "sourceType": "ai" and "sourceLabel": "AI Question".`
        : `Author ${aiCountNeeded} fresh certification/exam-grade multiple-choice questions testing deep conceptual and applied understanding for this goal. Set "sourceType": "ai" and "sourceLabel": "AI Question" on every question.`;

    const alreadyUsedNoteText = pickedDirectQuestions.length > 0
      ? `\n\nAlready included from the student's saved MCQs/True-False notes (DO NOT repeat these):\n${pickedDirectQuestions.map((q: any, i: number) => `${i + 1}. ${q.question}`).join("\n")}`
      : "";

    const systemPrompt = `You are a professional test author and technical certification exam creator.
Create a rigorous, highly educational ${aiCountNeeded}-question multiple choice diagnostic assessment for the user's study goal.
${noteGuidance}
Each question must have:
- Exactly 4 plausible options (1 correct, 3 realistic distractors).
- A 0-indexed 'correctIndex' (0, 1, 2, or 3).
- A comprehensive 'explanation' clarifying why the correct option is right and what principle applies.
- Difficulty assigned as "easy", "medium", or "hard".
- "sourceType": "note" or "ai", and "sourceLabel": "From Your Notes" or "AI Question".

Return valid JSON in this EXACT schema:
{
  "title": "Assessment Title",
  "questions": [
    {
      "id": "q_1",
      "question": "Clear scenario or technical question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 1,
      "explanation": "Detailed explanation of why this option is correct.",
      "difficulty": "medium",
      "sourceType": "ai",
      "sourceLabel": "AI Question"
    }
  ]
}
Return ONLY valid JSON. No markdown ticks outside the JSON.`;

    const userPrompt = `Goal: "${goalTitle}"\nCategory: "${goalCategory}"\nChapter/Topic: "${chapterTitle || 'Core Focus'}"\nTarget Exam: "${examTitle || 'Certification'}"\nTarget Difficulty: "${difficulty}"\nTest Mode: "${effectiveMode}"${safeAssignedTitle ? `\nAssigned Reading/Lesson Topic: "${safeAssignedTitle}"` : ""}${safeContext && effectiveMode !== "ai_only" ? `\n\nStudent's Study Material Notes:\n"""\n${safeContext}\n"""` : ""}${alreadyUsedNoteText}`;

    const result = await generateWithFallback({
      primaryModel: "gemini-4-hydrogen",
      fallbackModel: "gemini-3.1-flash-lite",
      contents: userPrompt,
      timeoutMs: 9000,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });

    if (result && result.text) {
      const parsed = JSON.parse(result.text.trim());
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        const testId = "test_" + Date.now();
        const aiQuestions = parsed.questions.slice(0, aiCountNeeded).map((q: any, idx: number) => {
          const opts = Array.isArray(q.options) && q.options.length >= 2
            ? q.options.map((o: any) => String(o)).slice(0, 6)
            : ["Option A", "Option B", "Option C", "Option D"];
          const corrIdx = typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < opts.length
            ? q.correctIndex
            : 0;
          const inferredSourceType: "note" | "ai" =
            q.sourceType === "note" || (effectiveMode === "notes_only")
              ? "note"
              : "ai";
          return {
            id: q.id || `q_${Date.now()}_${idx}`,
            question: q.question,
            options: opts,
            correctIndex: corrIdx,
            explanation: q.explanation || "Correct answer.",
            difficulty: q.difficulty || difficulty,
            sourceType: inferredSourceType,
            sourceLabel:
              typeof q.sourceLabel === "string" && q.sourceLabel.trim()
                ? q.sourceLabel.trim()
                : inferredSourceType === "note"
                ? "From Your Notes"
                : "AI Question"
          };
        });

        const mergedQuestions = interleaveQuestions(pickedDirectQuestions, aiQuestions);
        const modeTitleSuffix =
          effectiveMode === "hybrid"
            ? " (AI + Notes Mix)"
            : effectiveMode === "notes_only"
            ? " (My Notes)"
            : "";

        const test = {
          id: testId,
          title: parsed.title || `${chapterTitle || goalTitle} Knowledge Test${modeTitleSuffix}`,
          chapterTitle: chapterTitle || undefined,
          generationMode: effectiveMode,
          createdAt: new Date().toISOString(),
          questions: mergedQuestions,
          attemptsCount: 0
        };
        return res.json({ test });
      }
    }

    return res.json(generateFallbackTest(goalTitle, goalCategory, chapterTitle, difficulty));
  } catch (err: any) {
    console.warn("Knowledge test generation notice:", err?.message || err);
    return res.json(generateFallbackTest(goalTitle, goalCategory, chapterTitle, difficulty));
  }
});

// 5c-2. GOAL KNOWLEDGE HUB - AI READING RECOMMENDATIONS (MISSED QUESTIONS & TOPIC STUDY)
app.post("/api/coach/recommend-reading", async (req, res) => {
  const {
    goalTitle = "Study Goal",
    goalCategory = "General",
    chapterTitle = "",
    examTitle = "",
    missedQuestions = [],
    existingNoteTitles = [],
    count = 4
  } = req.body;

  const clampedCount = Math.min(6, Math.max(2, Number(count) || 4));
  const sanitizedMissed = Array.isArray(missedQuestions)
    ? missedQuestions
        .filter((m: any) => m && typeof m.question === "string" && m.question.trim())
        .slice(0, 6)
        .map((m: any) => ({
          question: String(m.question).trim().slice(0, 400),
          correctAnswer: typeof m.correctAnswer === "string" ? m.correctAnswer.trim().slice(0, 240) : "",
          userAnswer: typeof m.userAnswer === "string" ? m.userAnswer.trim().slice(0, 240) : "",
          explanation: typeof m.explanation === "string" ? m.explanation.trim().slice(0, 400) : ""
        }))
    : [];

  const sanitizedExisting = Array.isArray(existingNoteTitles)
    ? existingNoteTitles.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 15)
    : [];

  const allowedTypes = new Set(["article", "documentation", "video", "book_chapter", "study_guide"]);

  function buildFallbackRecommendations() {
    const topicBase = chapterTitle || goalTitle;
    if (sanitizedMissed.length > 0) {
      return {
        recommendations: sanitizedMissed.slice(0, clampedCount).map((m: any, idx: number) => {
          const shortFocus = m.question.replace(/[?]+$/, "").slice(0, 80);
          return {
            id: `rec_${Date.now()}_${idx}`,
            title: `${topicBase}: Deep-Dive Guide on "${shortFocus}"`,
            sourceName: "Concept Review & Practice",
            type: "study_guide",
            topicFocus: m.correctAnswer ? `${topicBase} · ${m.correctAnswer.slice(0, 40)}` : topicBase,
            whyItHelps: `Targets the question you missed${m.correctAnswer ? ` ("${m.correctAnswer}")` : ""}${m.explanation ? `: ${m.explanation}` : "."}`,
            keyTakeaways: [
              m.correctAnswer ? `Core fact to remember: ${m.correctAnswer}` : `Revisit the foundational rule behind: ${shortFocus}`,
              m.explanation ? m.explanation : `Compare why "${m.userAnswer || "the distractor"}" differs from the correct mechanism.`,
              `Write a short summary or flashcard in your own words after reading.`
            ],
            searchQuery: `${goalTitle} ${m.correctAnswer || shortFocus} tutorial`,
            estimatedReadMinutes: 8,
            relatedQuestion: m.question
          };
        })
      };
    }

    return {
      recommendations: [
        {
          id: `rec_${Date.now()}_0`,
          title: `${topicBase} — Core Principles & Mental Models`,
          sourceName: "Study Reference",
          type: "study_guide",
          topicFocus: topicBase,
          whyItHelps: `Builds strong foundational clarity for ${goalTitle}${examTitle ? ` (${examTitle})` : ""}.`,
          keyTakeaways: [
            `Map how core terms in ${topicBase} relate to one another`,
            "Review common exam pitfalls and edge-case scenarios",
            "Test recall immediately using short active-recall prompts"
          ],
          searchQuery: `${goalTitle} ${topicBase} fundamentals guide`,
          estimatedReadMinutes: 10
        },
        {
          id: `rec_${Date.now()}_1`,
          title: `${goalTitle}: Practical Troubleshooting & Applied Scenarios`,
          sourceName: "Official Documentation / Practice",
          type: "documentation",
          topicFocus: `${goalTitle} Practice`,
          whyItHelps: "Bridges theory into real-world scenario questions often tested in assessments.",
          keyTakeaways: [
            "Walk through step-by-step diagnostic workflows",
            "Contrast similar concepts that often get confused",
            "Summarize key commands, rules, or formulas into cheat sheets"
          ],
          searchQuery: `${goalTitle} ${chapterTitle} official documentation examples`,
          estimatedReadMinutes: 12
        }
      ].slice(0, clampedCount)
    };
  }

  try {
    const missedBlock =
      sanitizedMissed.length > 0
        ? `\n\nQuestions the student answered INCORRECTLY (prioritize addressing these gaps!):\n${sanitizedMissed
            .map(
              (m: any, i: number) =>
                `${i + 1}. Question: ${m.question}${m.userAnswer ? `\n   Student chose (wrong): ${m.userAnswer}` : ""}${
                  m.correctAnswer ? `\n   Correct answer: ${m.correctAnswer}` : ""
                }${m.explanation ? `\n   Explanation: ${m.explanation}` : ""}`
            )
            .join("\n")}`
        : "";

    const existingBlock =
      sanitizedExisting.length > 0
        ? `\n\nNotes the student ALREADY has saved (avoid duplicating exact titles): ${sanitizedExisting.join(" | ")}`
        : "";

    const systemPrompt = `You are an expert study coach and curriculum advisor.
Recommend ${clampedCount} focused, high-yield reading materials (articles, official documentation, textbook chapters, study guides, or educational videos) to help the student master their study goal and close knowledge gaps.
${
  sanitizedMissed.length > 0
    ? "CRITICAL: Base your recommendations directly on the questions the student missed so they know exactly what to read next and why."
    : "Tailor recommendations to the student's goal, chapter, and target exam."
}

URL Rules (CRITICAL):
- If you know a stable, canonical, authoritative URL (such as MDN Web Docs, React.dev, Python docs, Microsoft Learn, OWASP, NIST, Cloudflare Learning Center, Cisco, Khan Academy, or Wikipedia), include it in "url".
- Otherwise, leave "url" as an empty string "" and provide a crisp "searchQuery" so the student can find the resource reliably without broken links. Never invent speculative deep URLs.

Always include 2-3 specific, actionable "keyTakeaways" bullet points for each recommendation so saving the reading immediately enriches the student's notes.`;

    const userPrompt = `Goal: "${goalTitle}"
Category: "${goalCategory}"
Chapter / Topic: "${chapterTitle || "Core Syllabus"}"
Target Exam: "${examTitle || "General Mastery"}"${missedBlock}${existingBlock}`;

    const result = await generateWithFallback({
      primaryModel: "gemini-4-hydrogen",
      fallbackModel: "gemini-3.1-flash-lite",
      contents: userPrompt,
      timeoutMs: 9000,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  sourceName: { type: Type.STRING },
                  type: { type: Type.STRING },
                  topicFocus: { type: Type.STRING },
                  whyItHelps: { type: Type.STRING },
                  keyTakeaways: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  searchQuery: { type: Type.STRING },
                  url: { type: Type.STRING },
                  estimatedReadMinutes: { type: Type.INTEGER },
                  relatedQuestion: { type: Type.STRING }
                },
                required: ["title", "type", "topicFocus", "whyItHelps", "keyTakeaways", "searchQuery"]
              }
            }
          },
          required: ["recommendations"]
        }
      }
    });

    if (result && result.text) {
      const parsed = JSON.parse(result.text.trim());
      if (parsed && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
        const recommendations = parsed.recommendations.slice(0, clampedCount).map((r: any, idx: number) => {
          const urlCheck = typeof r.url === "string" && r.url.trim() ? validatePublicStudyUrl(r.url.trim()) : { valid: false };
          const rawType = typeof r.type === "string" ? r.type.trim().toLowerCase() : "article";
          return {
            id: `rec_${Date.now()}_${idx}`,
            title: String(r.title || `${chapterTitle || goalTitle} Study Guide`).trim(),
            sourceName: typeof r.sourceName === "string" && r.sourceName.trim() ? r.sourceName.trim() : undefined,
            type: allowedTypes.has(rawType) ? rawType : "article",
            topicFocus: String(r.topicFocus || chapterTitle || goalTitle).trim(),
            whyItHelps: String(r.whyItHelps || "Reinforces key principles tested in this goal.").trim(),
            keyTakeaways: Array.isArray(r.keyTakeaways)
              ? r.keyTakeaways.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 4)
              : [],
            searchQuery: String(r.searchQuery || r.title || goalTitle).trim(),
            url: urlCheck.valid ? urlCheck.normalizedUrl : undefined,
            estimatedReadMinutes: typeof r.estimatedReadMinutes === "number" && r.estimatedReadMinutes > 0
              ? Math.min(90, Math.round(r.estimatedReadMinutes))
              : 10,
            relatedQuestion: typeof r.relatedQuestion === "string" && r.relatedQuestion.trim()
              ? r.relatedQuestion.trim()
              : undefined
          };
        });
        return res.json({ recommendations });
      }
    }

    return res.json(buildFallbackRecommendations());
  } catch (err: any) {
    console.warn("Reading recommendation notice:", err?.message || err);
    return res.json(buildFallbackRecommendations());
  }
});

// 5c-3. GOAL KNOWLEDGE HUB - AI TOPIC LESSON / LECTURE / STUDY NOTE GENERATOR FOR MISSED QUESTIONS
app.post("/api/coach/generate-topic-lesson", async (req, res) => {
  const {
    goalTitle = "Study Goal",
    goalCategory = "General",
    chapterTitle = "",
    examTitle = "",
    question = "",
    correctAnswer = "",
    userAnswer = "",
    explanation = "",
    lessonStyle = "lesson"
  } = req.body || {};

  const trimmedQuestion = typeof question === "string" ? question.trim() : "";
  if (!trimmedQuestion) {
    return res.status(400).json({ error: "A missed question or topic is required to generate a lesson." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
  }

  const normalizedStyle: "lesson" | "lecture" | "note" =
    lessonStyle === "lecture" || lessonStyle === "note" ? lessonStyle : "lesson";

  const styleInstruction =
    normalizedStyle === "lecture"
      ? "Write an engaging, professor-style mini lecture that walks the student intuitively from first principles to mastery."
      : normalizedStyle === "note"
      ? "Write a concise, high-yield structured study note and quick-reference review sheet."
      : "Write a clear, structured interactive lesson with step-by-step explanation, worked example, and exam takeaways.";

  const systemPrompt = `You are an expert tutor creating targeted study material when a student misses a test question and does not yet have saved notes on that topic.
${styleInstruction}

Requirements:
- Directly teach the underlying concept behind the missed question—not just repeating the answer.
- Clarify why the correct concept works AND why common mistakes or distractors are wrong.
- Format "content" cleanly with clear uppercase or labeled section headings and concise bullet lines (avoid cluttered raw markdown symbols like ** or ###; write clean readable plain text with sections such as:
  OVERVIEW
  CORE CONCEPT EXPLAINED
  WORKED EXAMPLE / PRACTICAL USAGE
  WHY DISTRACTORS ARE WRONG & PITFALLS
  KEY TAKEAWAYS).
- Provide 4 to 6 relevant keyTerms that identify the core topic, tool, rule, or concept.`;

  const userPrompt = `Goal: "${goalTitle}"
Category: "${goalCategory}"
Chapter / Topic: "${chapterTitle || "Core Curriculum"}"
Target Exam: "${examTitle || "Mastery"}"
Requested Format: ${normalizedStyle}

Missed Question:
${trimmedQuestion}
${userAnswer ? `\nStudent's Wrong Choice: ${String(userAnswer).trim()}` : ""}
${correctAnswer ? `\nCorrect Answer: ${String(correctAnswer).trim()}` : ""}
${explanation ? `\nQuiz Explanation: ${String(explanation).trim()}` : ""}`;

  try {
    const result = await generateContentWithModelFallback({
      models: ["gemini-4-hydrogen", "gemini-3.1-flash-lite"],
      contents: userPrompt,
      timeoutMs: 25000,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: { type: Type.STRING },
            content: { type: Type.STRING },
            keyTerms: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            estimatedMinutes: { type: Type.INTEGER }
          },
          required: ["title", "category", "content", "keyTerms"]
        }
      }
    });

    const rawText = result?.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: "Gemini returned an empty response while generating the lesson." });
    }

    const parsed = JSON.parse(rawText);
    const allowedCategory =
      parsed.category === "summary" || parsed.category === "cheat_sheet" ? parsed.category : "concept";

    return res.json({
      lesson: {
        title: String(parsed.title || `${chapterTitle || goalTitle} — Topic Lesson`).trim(),
        category: normalizedStyle === "lecture" ? "summary" : allowedCategory,
        content: String(parsed.content || "").trim(),
        keyTerms: Array.isArray(parsed.keyTerms)
          ? parsed.keyTerms.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 8)
          : [],
        estimatedMinutes:
          typeof parsed.estimatedMinutes === "number" && parsed.estimatedMinutes > 0
            ? Math.min(45, Math.round(parsed.estimatedMinutes))
            : 6,
        style: normalizedStyle
      }
    });
  } catch (err: any) {
    console.error("[AI Topic Lesson] Generation error:", err?.message || err);
    if (isGeminiQuotaOrRateLimitError(err)) {
      return res.status(429).json({
        error: err?.message || "Gemini API quota or rate limit exceeded (429 RESOURCE_EXHAUSTED). Please try again shortly."
      });
    }
    if (isGeminiKeyError(err)) {
      return res.status(401).json({
        error: err?.message || "Gemini API key is invalid or unauthorized."
      });
    }
    return res.status(500).json({
      error: err?.message || "Could not generate topic lesson right now."
    });
  }
});

// 5d. GOAL KNOWLEDGE HUB - EXTRACT NOTES & TEST FROM VIDEO / RESOURCE URL
function validatePublicStudyUrl(rawUrl: string): { valid: boolean; normalizedUrl?: string; reason?: string } {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { valid: false, reason: "Please provide a valid URL." };
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return { valid: false, reason: "URL is too long." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "Invalid URL format. Include https:// or http://." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, reason: "Only http:// and https:// URLs are supported." };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, reason: "URLs containing embedded credentials are not allowed." };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal"
  ) {
    return { valid: false, reason: "Local and internal network URLs are not allowed." };
  }
  // Block private / loopback / link-local IPv4 and IPv6 ranges
  if (
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    /^(fc|fd|fe80):/i.test(hostname)
  ) {
    return { valid: false, reason: "Private or link-local IP addresses are not allowed." };
  }
  return { valid: true, normalizedUrl: parsed.toString() };
}

function getCanonicalYouTubeUrl(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    let videoId: string | null = null;
    if (host === "youtu.be" || host === "www.youtu.be") {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] || null;
    } else if (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "www.youtube-nocookie.com"
    ) {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v");
      } else {
        const match = parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,20})/);
        if (match) videoId = match[1];
      }
    }
    if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  } catch {}
  return null;
}

function parseJsonFromModelText(raw: string): any | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

app.post("/api/coach/extract-from-url", async (req, res) => {
  const {
    url = "",
    goalTitle = "Study Session",
    goalCategory = "General",
    chapterTitle = "",
    userNotes = "",
    mode = "both"
  } = req.body || {};

  const validation = validatePublicStudyUrl(url);
  if (!validation.valid || !validation.normalizedUrl) {
    return res.status(400).json({ error: validation.reason || "Invalid URL." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: "AI extraction requires a configured Gemini API key. Check Settings > Secrets."
    });
  }

  const targetUrl = validation.normalizedUrl;
  const canonicalYoutubeUrl = getCanonicalYouTubeUrl(targetUrl);
  const safeUserNotes = typeof userNotes === "string" ? userNotes.trim().slice(0, 8000) : "";
  const isPaywalledPlatformHint = /(?:coursera\.org|udemy\.com|edx\.org|pluralsight\.com|linkedin\.com\/learning)/i.test(targetUrl);

  const ai = getAi();
  const extractionSchema = {
    type: Type.OBJECT,
    properties: {
      extractedTitle: { type: Type.STRING, description: "Concise title of the video, lecture, or article." },
      accessStatus: {
        type: Type.STRING,
        description: "Must be one of: 'full', 'partial_public', or 'restricted'."
      },
      accessNote: {
        type: Type.STRING,
        description: "Clear note explaining what content was accessed, or if a login wall restricted full lecture video access."
      },
      studyNotes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: { type: Type.STRING, description: "One of: concept, summary, qa, definition" },
            content: { type: Type.STRING },
            question: { type: Type.STRING },
            answer: { type: Type.STRING },
            term: { type: Type.STRING },
            definition: { type: Type.STRING },
            keyTerms: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "category", "content"]
        }
      },
      flashcards: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING }
          },
          required: ["front", "back"]
        }
      },
      testTitle: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctIndex: { type: Type.INTEGER },
            explanation: { type: Type.STRING },
            difficulty: { type: Type.STRING }
          },
          required: ["question", "options", "correctIndex", "explanation"]
        }
      }
    },
    required: ["extractedTitle", "accessStatus", "accessNote", "studyNotes", "questions"]
  };

  const extractionInstructions = `You are a study assistant extracting accurate study materials from a learning link for a student's goal "${goalTitle}" (${goalCategory}${chapterTitle ? `, Chapter: ${chapterTitle}` : ""}).
${safeUserNotes ? `\nThe user also provided these lesson notes/transcript context:\n"""\n${safeUserNotes}\n"""\n` : ""}
Task (mode="${mode}"):
1. Extract high-yield study notes (mix of concise summary/concept notes plus key Q&A and Definition items if appropriate), 3-4 active recall flashcards, and 4 rigorous multiple-choice test questions (each with 4 plausible options, 0-based correctIndex 0..3, explanation, and difficulty easy|medium|hard).
2. Be strictly honest about URL accessibility:
   - If you can access the full video or public page content, set accessStatus="full" and explain briefly in accessNote.
   - If the link points to a paywalled/logged-in platform (such as an authenticated Coursera or Udemy lecture) where only public syllabus/course overview info or the user's pasted notes were accessible, set accessStatus="partial_public" and explicitly state in accessNote that the private lecture video requires login, so extraction used the accessible public course info${safeUserNotes ? " and the notes you provided" : ""}.
   - If the URL could not be accessed at all and no user notes were provided, set accessStatus="restricted", leave studyNotes and questions empty, and explain clearly in accessNote so the user can paste a summary or transcript.`;

  try {
    let rawParsed: any = null;
    let groundingSources: { uri: string; title: string }[] = [];

    if (canonicalYoutubeUrl) {
      try {
        const ytResult = await generateContentWithModelFallback({
          models: ["gemini-4-hydrogen", "gemini-3.1-flash-lite"],
          timeoutMs: 32000,
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: canonicalYoutubeUrl } },
                { text: `${extractionInstructions}\n\nAnalyze this YouTube video (${canonicalYoutubeUrl}) and generate the structured JSON study notes, flashcards, and quiz questions.` }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: extractionSchema
          }
        });
        rawParsed = parseJsonFromModelText(ytResult.text || "");
      } catch (ytErr: any) {
        if (isGeminiQuotaOrRateLimitError(ytErr) || isGeminiKeyError(ytErr)) {
          throw ytErr;
        }
        console.warn("YouTube direct fileData extraction fallback to URL context:", ytErr?.message || ytErr);
      }
    }

    if (!rawParsed) {
      const urlPrompt = `${extractionInstructions}

Target URL: ${targetUrl}
${isPaywalledPlatformHint ? "Note: This domain often requires user sign-in for individual lecture videos. Check what public content is visible on the page or search results without fabricating unseen private lecture details." : ""}

Return ONLY valid JSON matching this schema:
{
  "extractedTitle": "string",
  "accessStatus": "full" | "partial_public" | "restricted",
  "accessNote": "string",
  "studyNotes": [
    {
      "title": "string",
      "category": "concept" | "summary" | "qa" | "definition",
      "content": "string",
      "question": "optional string for qa",
      "answer": "optional string for qa",
      "term": "optional string for definition",
      "definition": "optional string for definition",
      "keyTerms": ["string"]
    }
  ],
  "flashcards": [{ "front": "string", "back": "string" }],
  "testTitle": "string",
  "questions": [
    {
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "string",
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}`;

      let webResult: any = null;
      try {
        webResult = await generateContentWithModelFallback({
          models: ["gemini-4-hydrogen", "gemini-3.1-flash-lite"],
          timeoutMs: 32000,
          contents: urlPrompt,
          config: {
            tools: [{ urlContext: {} }, { googleSearch: {} }]
          }
        });
      } catch (toolErr: any) {
        if (isGeminiQuotaOrRateLimitError(toolErr) || isGeminiKeyError(toolErr)) {
          throw toolErr;
        }
        // If combined urlContext+googleSearch fails for non-quota reasons (e.g. unsupported tool on a model), retry with googleSearch or provided user notes
        if (safeUserNotes) {
          webResult = await generateContentWithModelFallback({
            models: ["gemini-4-hydrogen", "gemini-3.1-flash-lite"],
            timeoutMs: 28000,
            contents: urlPrompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: extractionSchema
            }
          });
        } else {
          webResult = await generateContentWithModelFallback({
            models: ["gemini-3.1-flash-lite", "gemini-4-hydrogen"],
            timeoutMs: 28000,
            contents: urlPrompt,
            config: {
              tools: [{ googleSearch: {} }]
            }
          });
        }
      }

      const chunks = webResult?.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        groundingSources = chunks
          .map((c: any) => (c?.web?.uri ? { uri: c.web.uri, title: c.web.title || c.web.uri } : null))
          .filter(Boolean) as { uri: string; title: string }[];
      }

      rawParsed = parseJsonFromModelText(webResult?.text || "");

      // If the tool-grounded call returned prose instead of JSON, structure it cleanly with responseSchema
      if (!rawParsed && webResult?.text && webResult.text.trim().length > 20) {
        const formatResult = await generateContentWithModelFallback({
          models: ["gemini-4-hydrogen", "gemini-3.1-flash-lite"],
          timeoutMs: 25000,
          contents: `Convert the following extracted study analysis for URL "${targetUrl}" into the exact JSON structure. Preserve honest accessStatus and accessNote.\n\nAnalysis:\n${webResult.text}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: extractionSchema
          }
        });
        rawParsed = parseJsonFromModelText(formatResult?.text || "");
      }
    }

    if (!rawParsed) {
      return res.status(502).json({
        error: "Could not extract structured study material from that URL. Try pasting a brief transcript or lesson outline in the optional notes box."
      });
    }

    const nowIso = new Date().toISOString();
    const baseTs = Date.now();
    const extractedTitle = typeof rawParsed.extractedTitle === "string" && rawParsed.extractedTitle.trim()
      ? rawParsed.extractedTitle.trim()
      : (canonicalYoutubeUrl ? "YouTube Video Study Guide" : new URL(targetUrl).hostname);

    const allowedCategories = new Set(["concept", "cheat_sheet", "code_snippet", "summary", "formula", "table", "qa", "fill_in_blank", "multiple_choice", "true_false", "definition"]);
    const rawNotes = Array.isArray(rawParsed.studyNotes) ? rawParsed.studyNotes : [];
    const notes = rawNotes
      .filter((n: any) => n && (n.content || (n.question && n.answer) || (n.term && n.definition)))
      .slice(0, 6)
      .map((n: any, idx: number) => {
        const cat = allowedCategories.has(n.category) ? n.category : "summary";
        const isQA = (cat === "qa" || cat === "fill_in_blank" || cat === "multiple_choice" || cat === "true_false") && n.question && n.answer;
        const isFillBlank = cat === "fill_in_blank" && n.question && n.answer;
        const isDef = cat === "definition" && n.term && n.definition;
        const opts = Array.isArray(n.options) ? n.options.map(String).filter(Boolean) : undefined;
        const correctIdx = typeof n.correctOptionIndex === "number" ? n.correctOptionIndex : undefined;
        return {
          id: `note_${baseTs}_${idx}`,
          title: isQA
            ? String(n.question).trim()
            : isDef
            ? String(n.term).trim()
            : String(n.title || extractedTitle).trim(),
          category: cat,
          content: isFillBlank
            ? `Prompt: ${String(n.question).trim()}\n\nAnswer: ${String(n.answer).trim()}${n.explanation ? `\n\nExplanation: ${String(n.explanation).trim()}` : ""}`
            : isQA
            ? `Q: ${String(n.question).trim()}\n\nA: ${String(n.answer).trim()}${n.explanation ? `\n\nExplanation: ${String(n.explanation).trim()}` : ""}`
            : isDef
            ? `${String(n.term).trim()}: ${String(n.definition).trim()}`
            : String(n.content || "").trim(),
          question: isQA ? String(n.question).trim() : undefined,
          answer: isQA ? String(n.answer).trim() : undefined,
          explanation: isQA && n.explanation ? String(n.explanation).trim() : undefined,
          options: opts && opts.length >= 2 ? opts : undefined,
          correctOptionIndex: typeof correctIdx === "number" ? correctIdx : undefined,
          term: isDef ? String(n.term).trim() : undefined,
          definition: isDef ? String(n.definition).trim() : undefined,
          url: targetUrl,
          chapterTitle: chapterTitle || undefined,
          keyTerms: Array.isArray(n.keyTerms) ? n.keyTerms.map(String).slice(0, 8) : undefined,
          createdAt: nowIso,
          updatedAt: nowIso
        };
      });

    const flashcards = Array.isArray(rawParsed.flashcards)
      ? rawParsed.flashcards
          .filter((f: any) => f && f.front && f.back)
          .slice(0, 6)
          .map((f: any, idx: number) => ({
            id: `fc_${baseTs}_${idx}`,
            front: String(f.front).trim(),
            back: String(f.back).trim(),
            chapterTitle: chapterTitle || undefined,
            mastered: false
          }))
      : [];

    const rawQuestions = Array.isArray(rawParsed.questions) ? rawParsed.questions : [];
    const formattedQuestions = rawQuestions
      .filter((q: any) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, 6)
      .map((q: any, idx: number) => {
        const opts = q.options.slice(0, 4).map(String);
        while (opts.length < 4) opts.push("None of the above");
        const cIdx = typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < opts.length ? q.correctIndex : 0;
        const diff = q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "medium";
        return {
          id: `q_${baseTs}_${idx}`,
          question: String(q.question).trim(),
          options: opts,
          correctIndex: cIdx,
          explanation: String(q.explanation || "Review the source material for details.").trim(),
          difficulty: diff
        };
      });

    const test = formattedQuestions.length > 0
      ? {
          id: `test_${baseTs}`,
          title: String(rawParsed.testTitle || `${extractedTitle} Quiz`).trim(),
          chapterTitle: chapterTitle || undefined,
          sourceUrl: targetUrl,
          createdAt: nowIso,
          questions: formattedQuestions,
          attemptsCount: 0
        }
      : null;

    return res.json({
      extractedTitle,
      accessStatus: rawParsed.accessStatus || (canonicalYoutubeUrl ? "full" : "partial_public"),
      accessNote: rawParsed.accessNote || "Extracted study materials from the provided URL.",
      notes,
      flashcards,
      test,
      sources: groundingSources.slice(0, 5)
    });
  } catch (err: any) {
    console.warn("URL extraction notice:", isQuotaOrRateLimitLabel(err));
    if (isGeminiQuotaOrRateLimitError(err)) {
      return res.status(429).json({
        error: "Gemini API quota or rate limit exceeded (429). Please wait a moment and try again, or check your Gemini API plan and billing details in AI Studio.",
        code: "RESOURCE_EXHAUSTED"
      });
    }
    if (isGeminiKeyError(err)) {
      return res.status(502).json({
        error: "Gemini API key error. Please check your key in Settings > Secrets."
      });
    }
    return res.status(500).json({
      error: "Failed to extract notes or quiz questions from that URL. If the lesson requires login (such as Coursera or Udemy), paste a quick summary or transcript in the notes field."
    });
  }
});

// 5e. GOAL KNOWLEDGE HUB - EXTRACT NOTES & TEST FROM DOWNLOADED VIDEO & TRANSCRIPT UPLOAD
const LECTURE_UPLOAD_DIR = path.resolve(os.tmpdir(), "study_planner_uploads");
if (!fs.existsSync(LECTURE_UPLOAD_DIR)) {
  fs.mkdirSync(LECTURE_UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MEDIA_EXT_TO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mp3",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg"
};

const ALLOWED_TEXT_EXTS = new Set([".txt", ".vtt", ".srt", ".md"]);

function sanitizeUploadDisplayName(rawName: string): string {
  const base = path.basename(rawName || "lecture_file");
  return base.replace(/[\r\n\t<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 140) || "lecture_file";
}

function resolveConfinedUploadPath(filePath?: string): string | null {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(LECTURE_UPLOAD_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

const lectureUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(LECTURE_UPLOAD_DIR)) {
      fs.mkdirSync(LECTURE_UPLOAD_DIR, { recursive: true });
    }
    cb(null, LECTURE_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = (ext in ALLOWED_MEDIA_EXT_TO_MIME || ALLOWED_TEXT_EXTS.has(ext)) ? ext : "";
    const randomId = crypto.randomBytes(8).toString("hex");
    cb(null, `lecture_${Date.now()}_${randomId}${safeExt}`);
  }
});

const lectureUploadMiddleware = multer({
  storage: lectureUploadStorage,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250 MB max per file
    files: 2
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    if (file.fieldname === "video") {
      if (ext in ALLOWED_MEDIA_EXT_TO_MIME || mime.startsWith("video/") || mime.startsWith("audio/")) {
        return cb(null, true);
      }
      return cb(new Error("Unsupported video/audio format. Please upload MP4, MOV, WebM, MKV, MP3, WAV, or M4A."));
    }
    if (file.fieldname === "transcriptFile") {
      if (ALLOWED_TEXT_EXTS.has(ext) || mime.startsWith("text/")) {
        return cb(null, true);
      }
      return cb(new Error("Unsupported transcript format. Please upload .txt, .vtt, .srt, or .md."));
    }
    return cb(new Error("Unexpected upload field."));
  }
});

app.post("/api/coach/extract-from-upload", (req, res) => {
  lectureUploadMiddleware.fields([
    { name: "video", maxCount: 1 },
    { name: "transcriptFile", maxCount: 1 }
  ])(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      if (uploadErr?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: "File exceeds the 250 MB upload limit. Try a compressed MP4 or paste the transcript text."
        });
      }
      return res.status(400).json({
        error: uploadErr?.message || "Invalid file upload."
      });
    }

    const filesMap = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const videoUpload = filesMap.video?.[0];
    const transcriptUpload = filesMap.transcriptFile?.[0];

    const verifiedVideoPath = resolveConfinedUploadPath(videoUpload?.path);
    const verifiedTranscriptPath = resolveConfinedUploadPath(transcriptUpload?.path);

    let uploadedGeminiFileName: string | null = null;
    const ai = getAi();

    const cleanupFiles = async () => {
      for (const p of [verifiedVideoPath, verifiedTranscriptPath]) {
        if (p) {
          try {
            await fs.promises.unlink(p);
          } catch {}
        }
      }
      if (uploadedGeminiFileName && process.env.GEMINI_API_KEY) {
        try {
          await ai.files.delete({ name: uploadedGeminiFileName });
        } catch {}
      }
    };

    try {
      const {
        goalTitle = "Study Session",
        goalCategory = "General",
        chapterTitle = "",
        lessonTitle = "",
        transcriptText = "",
        mode = "both",
        questionCount = "5"
      } = (req.body || {}) as Record<string, string>;

      const clampedCount = Math.min(8, Math.max(4, Number(questionCount) || 5));
      let combinedTranscript = typeof transcriptText === "string" ? transcriptText.trim() : "";

      if (verifiedTranscriptPath) {
        try {
          const rawTranscript = await fs.promises.readFile(verifiedTranscriptPath, "utf-8");
          const cleanedFileText = rawTranscript.replace(/\r\n/g, "\n").trim();
          if (cleanedFileText) {
            combinedTranscript = combinedTranscript
              ? `${combinedTranscript}\n\n${cleanedFileText}`
              : cleanedFileText;
          }
        } catch {
          await cleanupFiles();
          return res.status(400).json({ error: "Could not read the uploaded transcript file as UTF-8 text." });
        }
      }

      const safeTranscript = combinedTranscript.slice(0, 35000);

      if (!verifiedVideoPath && !safeTranscript) {
        await cleanupFiles();
        return res.status(400).json({
          error: "Please upload a video/audio file, upload a transcript (.txt/.vtt/.srt), or paste your lesson text."
        });
      }

      if (!process.env.GEMINI_API_KEY) {
        await cleanupFiles();
        return res.status(503).json({
          error: "AI video and transcript analysis requires a configured Gemini API key. Check Settings > Secrets."
        });
      }

      const safeLessonTitle = typeof lessonTitle === "string" ? lessonTitle.trim().slice(0, 180) : "";
      const safeOriginalFileName = videoUpload
        ? sanitizeUploadDisplayName(videoUpload.originalname)
        : transcriptUpload
        ? sanitizeUploadDisplayName(transcriptUpload.originalname)
        : undefined;

      const uploadSchema = {
        type: Type.OBJECT,
        properties: {
          extractedTitle: { type: Type.STRING, description: "Concise, descriptive title for the uploaded lecture." },
          studyNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING, description: "One of: concept, summary, qa, definition" },
                content: { type: Type.STRING },
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                term: { type: Type.STRING },
                definition: { type: Type.STRING },
                keyTerms: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "category", "content"]
            }
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING }
              },
              required: ["front", "back"]
            }
          },
          testTitle: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
                difficulty: { type: Type.STRING }
              },
              required: ["question", "options", "correctIndex", "explanation"]
            }
          }
        },
        required: ["extractedTitle", "studyNotes", "questions"]
      };

      const promptText = `You are an expert educator and exam writer analyzing a student's downloaded lecture${verifiedVideoPath ? " video" : ""}${safeTranscript ? " and transcript/notes" : ""} for their study goal "${goalTitle}" (${goalCategory}${chapterTitle ? `, Chapter: ${chapterTitle}` : ""}).
${safeLessonTitle ? `Student's lesson title: "${safeLessonTitle}"\n` : ""}${safeOriginalFileName ? `Uploaded file: "${safeOriginalFileName}"\n` : ""}${safeTranscript ? `\nStudent-provided transcript / lecture text:\n"""\n${safeTranscript}\n"""\n` : ""}
Task (mode="${mode}"):
1. Extract 3-6 high-yield study notes grounded strictly in the actual lecture content (include a balanced mix of concise summaries, core concepts, key definitions, and Q&A takeaways where helpful).
2. Extract 4-6 active recall flashcards (concise front question/term and clear back answer).
3. Author ${clampedCount} rigorous multiple-choice test questions testing real comprehension of the lecture concepts, formulas, examples, or demonstrations shown/discussed (each with 4 plausible options, 0-indexed correctIndex 0..3, thorough explanation referencing the lesson, and difficulty easy|medium|hard).

Return ONLY valid JSON matching the requested schema.`;

      const contentParts: any[] = [];

      if (verifiedVideoPath && videoUpload) {
        const ext = path.extname(videoUpload.originalname || "").toLowerCase();
        const inferredMime =
          ALLOWED_MEDIA_EXT_TO_MIME[ext] ||
          (videoUpload.mimetype && videoUpload.mimetype !== "application/octet-stream"
            ? videoUpload.mimetype
            : "video/mp4");

        const uploadedFile = await ai.files.upload({
          file: verifiedVideoPath,
          config: {
            mimeType: inferredMime,
            displayName: safeOriginalFileName || "downloaded_lecture_video"
          }
        });

        uploadedGeminiFileName = uploadedFile.name || null;

        let activeFile = uploadedFile;
        const pollStart = Date.now();
        while (activeFile.state === FileState.PROCESSING) {
          if (Date.now() - pollStart > 120_000) {
            throw new Error("Video processing timed out. Try a shorter clip or include the transcript text.");
          }
          await new Promise((r) => setTimeout(r, 2500));
          if (!activeFile.name) break;
          activeFile = await ai.files.get({ name: activeFile.name });
        }

        if (activeFile.state === FileState.FAILED) {
          throw new Error("Could not process this video encoding. Try converting to standard MP4 or pasting the transcript.");
        }

        if (activeFile.uri) {
          contentParts.push({
            fileData: {
              fileUri: activeFile.uri,
              mimeType: activeFile.mimeType || inferredMime
            }
          });
        }
      }

      contentParts.push({ text: promptText });

      let rawParsed: any = null;
      const models = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];
      let lastModelErr: any = null;

      for (let i = 0; i < models.length; i++) {
        const modelName = models[i];
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: contentParts }],
            config: {
              responseMimeType: "application/json",
              responseSchema: uploadSchema
            }
          });
          rawParsed = parseJsonFromModelText(response.text || "");
          if (rawParsed) break;
        } catch (mErr: any) {
          lastModelErr = mErr;
          if (isGeminiKeyError(mErr)) break;
          console.warn(`Upload extraction with ${modelName} fallback:`, isQuotaOrRateLimitLabel(mErr));
          if (i < models.length - 1) {
            await new Promise((r) => setTimeout(r, 350));
          }
        }
      }

      if (!rawParsed) {
        throw lastModelErr || new Error("Could not extract structured notes or quiz questions from the uploaded material.");
      }

      const nowIso = new Date().toISOString();
      const baseTs = Date.now();
      const extractedTitle =
        safeLessonTitle ||
        (typeof rawParsed.extractedTitle === "string" && rawParsed.extractedTitle.trim()) ||
        (safeOriginalFileName ? safeOriginalFileName.replace(/\.[^.]+$/, "") : "Uploaded Lecture Study Guide");

      const allowedCategories = new Set(["concept", "cheat_sheet", "code_snippet", "summary", "formula", "table", "qa", "fill_in_blank", "multiple_choice", "true_false", "definition"]);
      const rawNotes = Array.isArray(rawParsed.studyNotes) ? rawParsed.studyNotes : [];
      const notes = rawNotes
        .filter((n: any) => n && (n.content || (n.question && n.answer) || (n.term && n.definition)))
        .slice(0, 6)
        .map((n: any, idx: number) => {
          const cat = allowedCategories.has(n.category) ? n.category : "summary";
          const isQA = (cat === "qa" || cat === "fill_in_blank" || cat === "multiple_choice" || cat === "true_false") && n.question && n.answer;
          const isFillBlank = cat === "fill_in_blank" && n.question && n.answer;
          const isDef = cat === "definition" && n.term && n.definition;
          const opts = Array.isArray(n.options) ? n.options.map(String).filter(Boolean) : undefined;
          const correctIdx = typeof n.correctOptionIndex === "number" ? n.correctOptionIndex : undefined;
          return {
            id: `note_${baseTs}_${idx}`,
            title: isQA
              ? String(n.question).trim()
              : isDef
              ? String(n.term).trim()
              : String(n.title || extractedTitle).trim(),
            category: cat,
            content: isFillBlank
              ? `Prompt: ${String(n.question).trim()}\n\nAnswer: ${String(n.answer).trim()}${n.explanation ? `\n\nExplanation: ${String(n.explanation).trim()}` : ""}`
              : isQA
              ? `Q: ${String(n.question).trim()}\n\nA: ${String(n.answer).trim()}${n.explanation ? `\n\nExplanation: ${String(n.explanation).trim()}` : ""}`
              : isDef
              ? `${String(n.term).trim()}: ${String(n.definition).trim()}`
              : String(n.content || "").trim(),
            question: isQA ? String(n.question).trim() : undefined,
            answer: isQA ? String(n.answer).trim() : undefined,
            explanation: isQA && n.explanation ? String(n.explanation).trim() : undefined,
            options: opts && opts.length >= 2 ? opts : undefined,
            correctOptionIndex: typeof correctIdx === "number" ? correctIdx : undefined,
            term: isDef ? String(n.term).trim() : undefined,
            definition: isDef ? String(n.definition).trim() : undefined,
            sourceFileName: safeOriginalFileName,
            chapterTitle: chapterTitle || undefined,
            keyTerms: Array.isArray(n.keyTerms) ? n.keyTerms.map(String).slice(0, 8) : undefined,
            createdAt: nowIso,
            updatedAt: nowIso
          };
        });

      const flashcards = Array.isArray(rawParsed.flashcards)
        ? rawParsed.flashcards
            .filter((f: any) => f && f.front && f.back)
            .slice(0, 6)
            .map((f: any, idx: number) => ({
              id: `fc_${baseTs}_${idx}`,
              front: String(f.front).trim(),
              back: String(f.back).trim(),
              chapterTitle: chapterTitle || undefined,
              mastered: false
            }))
        : [];

      const rawQuestions = Array.isArray(rawParsed.questions) ? rawParsed.questions : [];
      const formattedQuestions = rawQuestions
        .filter((q: any) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
        .slice(0, 8)
        .map((q: any, idx: number) => {
          const opts = q.options.slice(0, 4).map(String);
          while (opts.length < 4) opts.push("None of the above");
          const cIdx = typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < opts.length ? q.correctIndex : 0;
          const diff = q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "medium";
          return {
            id: `q_${baseTs}_${idx}`,
            question: String(q.question).trim(),
            options: opts,
            correctIndex: cIdx,
            explanation: String(q.explanation || "Review the lecture video or transcript for details.").trim(),
            difficulty: diff
          };
        });

      const test = formattedQuestions.length > 0
        ? {
            id: `test_${baseTs}`,
            title: String(rawParsed.testTitle || `${extractedTitle} Quiz`).trim(),
            chapterTitle: chapterTitle || undefined,
            sourceFileName: safeOriginalFileName,
            createdAt: nowIso,
            questions: formattedQuestions,
            attemptsCount: 0
          }
        : null;

      await cleanupFiles();

      return res.json({
        extractedTitle,
        sourceFileName: safeOriginalFileName,
        notes,
        flashcards,
        test
      });
    } catch (err: any) {
      await cleanupFiles();
      console.warn("Lecture upload extraction notice:", isQuotaOrRateLimitLabel(err));
      if (isGeminiQuotaOrRateLimitError(err)) {
        return res.status(429).json({
          error: "Gemini API quota or rate limit exceeded (429). Please wait a moment and try again, or check your Gemini API plan and billing details in AI Studio.",
          code: "RESOURCE_EXHAUSTED"
        });
      }
      if (isGeminiKeyError(err)) {
        return res.status(502).json({
          error: "Gemini API key error. Please check your key in Settings > Secrets."
        });
      }
      const msg = String(err?.message || "");
      return res.status(500).json({
        error: msg || "Failed to analyze the uploaded video or text. Try again or include transcript text."
      });
    }
  });
});

// 6. SMART ENERGY-BASED SCHEDULING ENDPOINT
app.post("/api/coach/energy-schedule", async (req, res) => {
  const { goals = [], events = [], availability = [], energyProfile = "lark" } = req.body;

  const categorizedGoals = goals.map((g: any) => {
    const nameLower = (g.name || "").toLowerCase();
    const catLower = (g.category || "").toLowerCase();
    
    let demand: "high" | "moderate" | "light" = "moderate";
    if (nameLower.includes("python") || nameLower.includes("react") || nameLower.includes("ai") || catLower.includes("programming") || g.type === "study") {
      demand = "high";
    } else if (g.type === "workout" || nameLower.includes("cardio") || nameLower.includes("stretch") || g.type === "routine") {
      demand = "light";
    }

    let targetHour = 10;
    if (energyProfile === "lark") {
      targetHour = demand === "high" ? 9 : demand === "moderate" ? 15 : 8;
    } else if (energyProfile === "owl") {
      targetHour = demand === "high" ? 18 : demand === "moderate" ? 14 : 10;
    } else {
      targetHour = demand === "high" ? 10 : demand === "moderate" ? 16 : 13;
    }

    return {
      ...g,
      demand,
      targetHour
    };
  });

  const now = new Date();
  const newEvents: any[] = [];

  categorizedGoals.forEach((goal: any) => {
    let booked = 0;
    const targetCount = goal.weeklyTarget || 3;

    for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
      if (booked >= targetCount) break;

      const day = new Date(now);
      day.setDate(now.getDate() + dayOffset);
      const dayOfWeek = day.getDay();

      const avail = availability.find((a: any) => a.dayOfWeek === dayOfWeek);
      if (avail && !avail.active) continue;

      const slotStart = new Date(day);
      slotStart.setHours(goal.targetHour, 0, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotStart.getMinutes() + (goal.durationMinutes || 60));

      const overlap = newEvents.some((e) => {
        const eStart = new Date(e.start);
        const eEnd = new Date(e.end);
        return slotStart < eEnd && slotEnd > eStart;
      });

      if (!overlap) {
        newEvents.push({
          id: `e_energy_${goal.id}_${dayOffset}`,
          title: `${goal.name}`,
          type: goal.type || "study",
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          goalId: goal.id,
          completed: false,
          notes: `⚡ Energy-Optimized: Placed in ${goal.demand.toUpperCase()} energy slot (${goal.targetHour}:00) for ${energyProfile.toUpperCase()} profile.`
        });
        booked++;
      }
    }
  });

  return res.json({
    energyProfile,
    summary: `Energy-based scheduling complete! High-focus goals (such as Python & AI Masterclass) were placed into peak focus hours, while lighter routines and workouts were mapped to recovery/dip windows.`,
    newEvents,
    categorizedGoals
  });
});

// 7. AI-DRIVEN GOAL & ROUTINE RECOMMENDATION ENGINE
app.post("/api/coach/recommend-goals", async (req, res) => {
  const { 
    goals = [], 
    events = [], 
    availability = [], 
    energyProfile = null,
    categoryFilter = "all", // "all" | "study" | "routine"
    customPrompt = "" 
  } = req.body;

  const keyAvailable = !!process.env.GEMINI_API_KEY;

  // Extract quantitative completion patterns
  const completedEvents = events.filter((e: any) => e.completed);
  const totalScheduled = events.length;
  const overallCompletionRate = totalScheduled > 0 
    ? Math.round((completedEvents.length / totalScheduled) * 100) 
    : (goals.length > 0 ? Math.round(goals.reduce((acc: number, g: any) => acc + (g.completedCount > 0 ? 1 : 0), 0) / goals.length * 100) : 78);

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

  // Goal types analysis
  const studyGoals = goals.filter((g: any) => g.type === "study" || g.type === "job_search" || g.type === "side_project");
  const routineGoals = goals.filter((g: any) => g.type === "workout" || g.type === "routine" || g.type === "personal");

  const studyCompletedTotal = studyGoals.reduce((acc: number, g: any) => acc + (g.completedCount || 0), 0);
  const routineCompletedTotal = routineGoals.reduce((acc: number, g: any) => acc + (g.completedCount || 0), 0);

  const maxDailyCeiling = energyProfile?.maxDailyDeepFocusHours || 4.0;
  
  // Calculate approximate current daily deep focus hours
  const totalWeeklyDeepFocusMinutes = studyGoals
    .filter((g: any) => g.energyLevel === "deep_focus" || !g.energyLevel)
    .reduce((acc: number, g: any) => acc + ((g.weeklyTarget || 3) * (g.durationMinutes || 60)), 0);
  const dailyAvgDeepFocusHours = Number((totalWeeklyDeepFocusMinutes / (7 * 60)).toFixed(1));

  // Heuristic Fallback Generator (Produces realistic, high quality, personalized recommendations)
  function generateHeuristicRecommendations() {
    const recs: any[] = [];

    // Study Block 1: Technical Mastery or Deep Problem Solving based on chronotype
    if (categoryFilter === "all" || categoryFilter === "study") {
      const hasPythonOrCode = goals.some((g: any) => 
        (g.name || "").toLowerCase().includes("python") || 
        (g.name || "").toLowerCase().includes("code") || 
        (g.name || "").toLowerCase().includes("react")
      );
      
      const studyBlockTimePref = chronotype === "early_bird" ? "early_morning" : chronotype === "night_owl" ? "evening" : "morning";

      if (hasPythonOrCode) {
        recs.push({
          id: "rec_sys_design",
          name: "System Architecture & Algorithmic Problem Solving",
          type: "study",
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
          patternInsight: `Your ${overallCompletionRate}% completion consistency shows high cognitive readiness. Adding a dedicated 45-min Deep Dive block builds on your coding momentum without exceeding your ${maxDailyCeiling}h daily deep focus ceiling.`,
          energyProfileMatch: `Targeted exclusively during your ${chronotypeName} Peak Focus zone (${peakWindow}). Slump-protected from midday circadian dips.`,
          expectedOutcome: "Accelerates technical problem-solving speed and structural system design comprehension by +35%.",
          subSteps: [
            { id: "s1", title: "Problem Specification & Constraint Analysis", durationMinutes: 10, description: "Analyze requirements, inputs/outputs, edge cases and time/space complexity bounds." },
            { id: "s2", title: "Core Implementation & Active Coding", durationMinutes: 25, description: "Write clean, modular code without consulting hints or solutions." },
            { id: "s3", title: "Complexity Verification & Mistake Journal", durationMinutes: 10, description: "Trace execution step-by-step and record key takeaways." }
          ],
          confidenceScore: 96,
          suggestedScheduleDays: [1, 3, 5] // Mon, Wed, Fri
        });
      } else {
        recs.push({
          id: "rec_deep_study",
          name: "Deep Conceptual Focus Sprint",
          type: "study",
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
        name: "Rapid Spaced Retrieval & Flashcards",
        type: "study",
        category: "Skill Retention",
        recommendationType: "study_block",
        weeklyTarget: 4,
        durationMinutes: 25,
        timePreference: chronotype === "night_owl" ? "afternoon" : "morning",
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
      const routineTimePref = chronotype === "early_bird" ? "afternoon" : chronotype === "night_owl" ? "early_morning" : "afternoon";

      recs.push({
        id: "rec_slump_recovery",
        name: "Midday Slump Shield & Mobility Walk",
        type: "routine",
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
        type: "routine",
        category: "Sleep & Recovery",
        recommendationType: "routine",
        weeklyTarget: 5,
        durationMinutes: 20,
        timePreference: "night",
        priority: "normal",
        energyLevel: "light_recharge",
        color: "#8b5cf6",
        icon: "moon",
        badge: "🌙 Restorative Wind-Down",
        patternInsight: "Consistent completion patterns depend heavily on deep sleep recovery. Closing screens 45 mins before sleep accelerates next-day alertness.",
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

    return {
      recommendations: recs,
      patternSummary: {
        completionRate: overallCompletionRate,
        completedCount: completedEvents.length,
        totalTarget: goals.reduce((acc: number, g: any) => acc + (g.weeklyTarget || 0), 0),
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
          `Current deep focus is at ${dailyAvgDeepFocusHours}h / ${maxDailyCeiling}h daily ceiling, leaving room for structured 30-45m blocks.`
        ]
      },
      aiGenerated: false
    };
  }

  if (!keyAvailable) {
    await new Promise((r) => setTimeout(r, 500));
    return res.json(generateHeuristicRecommendations());
  }

  // Real Gemini Model Request
  try {
    const systemPrompt = `You are a world-class Productivity & Cognitive Science AI.
Your mission is to analyze the user's current goal completion patterns, chronotype, cognitive load capacity, and energy zones to recommend 3 to 4 targeted new goals:
- Study Blocks: Intensive or micro deep-work sessions (e.g. System Design, Data Structures, Technical Sprints, Spaced Retrieval) placed in their PEAK energy windows.
- Routines: Restorative, circadian, or habit-stacking routines (e.g. Midday Slump Shield Walk, Morning Primer, Screen-Free Sunset) placed in MODERATE or LIGHT RECHARGE windows.

Respect their chronotype (${chronotypeName}):
- Peak Energy: ${peakWindow}
- Slump/Valley: ${slumpWindow}
- Max Daily Deep Focus Ceiling: ${maxDailyCeiling} hours (Current estimate: ${dailyAvgDeepFocusHours} hours/day).

Return JSON with this EXACT structure:
{
  "recommendations": [
    {
      "id": "rec_1",
      "name": "Specific Name of Goal or Routine",
      "type": "study" | "workout" | "routine" | "side_project" | "personal" | "job_search",
      "category": "Category Name",
      "recommendationType": "study_block" | "routine",
      "weeklyTarget": 3,
      "durationMinutes": 45,
      "timePreference": "morning" | "afternoon" | "evening" | "early_morning" | "night",
      "priority": "critical" | "important" | "normal",
      "energyLevel": "deep_focus" | "moderate" | "light_recharge",
      "color": "#6366f1",
      "icon": "code",
      "badge": "🔥 High Momentum Progression",
      "patternInsight": "Clear explanation referencing their actual completion rate and consistency.",
      "energyProfileMatch": "Specific explanation of how this maps to their chronotype peak or slump protection.",
      "expectedOutcome": "Clear cognitive, physical, or habit benefit.",
      "subSteps": [
        { "id": "s1", "title": "Phase 1 Name", "durationMinutes": 10, "description": "Phase 1 details" },
        { "id": "s2", "title": "Phase 2 Name", "durationMinutes": 25, "description": "Phase 2 details" },
        { "id": "s3", "title": "Phase 3 Name", "durationMinutes": 10, "description": "Phase 3 details" }
      ],
      "confidenceScore": 95,
      "suggestedScheduleDays": [1, 3, 5]
    }
  ],
  "patternSummary": {
    "completionRate": ${overallCompletionRate},
    "completedCount": ${completedEvents.length},
    "totalTarget": ${goals.reduce((acc: number, g: any) => acc + (g.weeklyTarget || 0), 0)},
    "cognitiveLoadDailyAvgHours": ${dailyAvgDeepFocusHours},
    "cognitiveLoadCeilingHours": ${maxDailyCeiling},
    "chronotype": "${chronotype}",
    "chronotypeName": "${chronotypeName}",
    "peakEnergyWindow": "${peakWindow}",
    "slumpWindow": "${slumpWindow}",
    "strengths": ["string", "string"],
    "gaps": ["string", "string"]
  }
}
Return ONLY valid JSON. No markdown ticks.`;

    const userPrompt = `User Goals: ${JSON.stringify(goals, null, 2)}
User Completed/Scheduled Events: ${JSON.stringify(events, null, 2)}
Energy Profile: ${JSON.stringify(energyProfile, null, 2)}
Filter Requested: ${categoryFilter}
Custom Focus/Request: ${customPrompt || "None"}`;

    const result = await generateWithFallback({
      primaryModel: "gemini-4-hydrogen",
      fallbackModel: "gemini-3.1-flash-lite",
      timeoutMs: 3500,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });

    if (result && result.text) {
      const parsed = JSON.parse(result.text.trim());
      if (parsed && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
        parsed.aiGenerated = true;
        return res.json(parsed);
      }
    }

    const fallback = generateHeuristicRecommendations();
    return res.json(fallback);
  } catch (err: any) {
    console.warn("Recommendation engine Gemini notice:", err?.message || err);
    return res.json(generateHeuristicRecommendations());
  }
});

// 8. AUTONOMOUS AI SCHEDULE CONTROLLER ENDPOINT
app.post("/api/coach/ai-schedule-controller", async (req, res) => {
  const {
    prompt = "",
    mode = "auto_plan_goals",
    goals = [],
    events = [],
    availability = [],
    energyProfile = null,
    burnoutLimits = undefined,
    currentDate = new Date().toISOString()
  } = req.body;

  const chronotype = energyProfile?.chronotype || "steady";
  const slumpProtection = energyProfile?.slumpProtection ?? true;
  const bufferMinutes = energyProfile?.autoBufferMinutes ?? 15;
  const keyAvailable = !!process.env.GEMINI_API_KEY;

  // Unified deterministic baseline solver (shared with client engine)
  const baseline = buildUnifiedScheduleProposal({
    mode,
    prompt,
    goals,
    events,
    availability,
    energyProfile: energyProfile || undefined,
    burnoutLimits,
    currentDate
  });

  // Use Gemini for natural-language directives or generative scheduling refinement,
  // then pass through the deterministic validator so hard constraints are never violated.
  const shouldUseGemini = keyAvailable && (mode === "custom_directive" || (typeof prompt === "string" && prompt.trim().length > 0 && mode === "auto_plan_goals"));

  if (shouldUseGemini) {
    try {
      const inactiveDays = (availability || [])
        .filter((a: any) => !a.active)
        .map((a: any) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][a.dayOfWeek])
        .filter(Boolean);

      const systemInstruction = `You are an Autonomous AI Calendar & Schedule Controller.
Your mission is to intelligently orchestrate the user's weekly calendar events, goals, and availability.
Analyze their goals (including targetExamDate urgency), current calendar events, chronotype (${chronotype}), slump protection (${slumpProtection}), buffer (${bufferMinutes} minutes), burnout limits (${JSON.stringify(burnoutLimits || { weekdayMaxHours: 3.5, weekendMaxHours: 5.0 })}), inactive days (${inactiveDays.join(", ") || "None"}), and natural language directive.

Rules:
1. Ensure 100% collision-free scheduling with at least ${bufferMinutes} minutes buffer between consecutive sessions.
2. NEVER schedule on inactive days (${inactiveDays.join(", ") || "None"}), and respect user availability hours.
3. Align deep focus tasks with peak energy hours (${chronotype}) and boost priority for approaching exam deadlines.
4. Preserve all completed events and external events untouched.
5. Follow the custom user directive accurately while honoring weekly targets.
6. Return ONLY a valid JSON object matching this schema:
{
  "title": "Title of the proposal",
  "summary": "2-3 sentence executive summary of actions taken",
  "reasoning": ["point 1", "point 2", "point 3"],
  "proposedEvents": [
    {
      "id": "string",
      "title": "string",
      "type": "workout" | "study" | "job_search" | "side_project" | "routine" | "personal" | "external",
      "start": "ISO 8601 string",
      "end": "ISO 8601 string",
      "goalId": "string (optional)",
      "completed": boolean,
      "notes": "string"
    }
  ]
}`;

      const contents = `Reference Date: ${currentDate}
Mode: ${mode}
User Custom Directive: ${prompt || "None provided. Automatically optimize and plan schedule."}
Goals: ${JSON.stringify(goals, null, 2)}
Current Calendar Events: ${JSON.stringify(events, null, 2)}
Availability: ${JSON.stringify(availability, null, 2)}
Chronotype Profile: ${JSON.stringify(energyProfile, null, 2)}
Daily Burnout Limits: ${JSON.stringify(burnoutLimits || { weekdayMaxHours: 3.5, weekendMaxHours: 5.0 })}
Unified Algorithmic Baseline Suggestion: ${JSON.stringify({ diff: baseline.diff, stats: baseline.stats, reasoning: baseline.reasoning })}`;

      const result = await generateWithFallback({
        primaryModel: "gemini-4-hydrogen",
        fallbackModel: "gemini-3.1-flash-lite",
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      if (result && result.text) {
        const parsed = JSON.parse(result.text.trim());
        if (parsed && Array.isArray(parsed.proposedEvents)) {
          const validated = validateAndRepairScheduleProposal({
            proposal: parsed,
            originalEvents: events,
            goals,
            availability,
            energyProfile: energyProfile || undefined,
            burnoutLimits
          });
          return res.json(validated);
        }
      }
    } catch (err: any) {
      console.warn("AI Schedule Controller Gemini API fallback warning:", err?.message || err);
    }
  }

  return res.json(baseline);
});

// Ensure any unhandled /api/* route returns clean JSON 404 instead of HTML SPA page
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.path} not found` });
});

// Serve frontend assets
async function serveApp() {
  if (process.env.NODE_ENV !== "production") {
    // Development configuration mounting Vite middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production configuration serving dist static assets and SPA fallbacks
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

serveApp();
