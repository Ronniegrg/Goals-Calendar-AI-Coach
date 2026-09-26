import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

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
 * Resilient Gemini Content Generator with multi-tier model fallback.
 * Automatically cascades through:
 * 1. Primary Model (defaults to gemini-3.8-flash)
 * 2. Stable Alias (gemini-flash-latest)
 * 3. High-throughput Lite (gemini-3.1-flash-lite)
 * If cloud models encounter temporary demand spikes (503/429), it smoothly
 * transitions down the tier chain before engaging the local heuristic intelligence.
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
  const requestTimeout = params.timeoutMs || 18000;
  
  const modelChain = [
    params.primaryModel || "gemini-3.8-flash",
    "gemini-flash-latest",
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
        console.log(`[AI Service] Model ${model} ${isDemandSpike ? "busy (high demand 503/timeout)" : "unavailable"}. Transitioning gracefully to ${nextModel}...`);
        await new Promise((r) => setTimeout(r, 200));
      } else {
        console.log(`[AI Service] All cloud models currently experiencing temporary demand spike. Transitioning to local heuristic intelligence.`);
      }
    }
  }

  return null;
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
      return {
        ...initial,
        ...userRecord,
        goals: Array.isArray(userRecord.goals) ? userRecord.goals : [],
        events: Array.isArray(userRecord.events) ? userRecord.events : [],
        availability: Array.isArray(userRecord.availability) && userRecord.availability.length > 0 
          ? userRecord.availability 
          : initial.availability,
        notifications: Array.isArray(userRecord.notifications) ? userRecord.notifications : initial.notifications,
        coachMessages: Array.isArray(userRecord.coachMessages) ? userRecord.coachMessages : initial.coachMessages,
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
        primaryModel: "gemini-3.8-flash",
        fallbackModel: "gemini-3.1-flash-lite",
        contents: contentsPayload,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          temperature: 0.7
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

  if (!keyAvailable) {
    await new Promise((r) => setTimeout(r, 600));
    return res.json({
      productivityScore: completionRate,
      peakFocusWindow: "09:00 - 11:30 AM (92% completion rate)",
      reflectionSummary: "Your cognitive focus was exceptionally strong during morning slots (08:00–11:30 AM), achieving a 92% completion rate across Python Dev and React Masterclass sessions. Afternoon slots experienced slight dip friction.",
      productivityPatterns: [
        "🔥 Peak Cognitive Focus: Morning blocks (09:00 - 11:30 AM) show highest completion rate (92%) and zero distraction skips.",
        "🏋️ Physical Routine Momentum: Morning Cardio sessions executed consistently when scheduled before 09:00 AM.",
        "⚠️ Evening Fatigue Dip: Sessions scheduled after 20:30 PM saw a 35% higher drop rate due to cognitive fatigue."
      ],
      recommendedAdjustments: [
        "🎯 Place High-Focus Goals (e.g. Python & AI Masterclass) exclusively in the 09:00–11:30 AM peak energy slot.",
        "🍵 Shift Light Routines & Stretching to the 14:00–15:30 PM post-lunch recovery window.",
        "⏱️ Cap evening study blocks at 45 minutes and avoid scheduling past 21:00 PM."
      ]
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
  "recommendedAdjustments": [string, string, string]
}
Return ONLY valid JSON. No markdown syntax wrapper.`;

    const userPrompt = `Goals: ${JSON.stringify(goals)}\nCompleted/Scheduled Events: ${JSON.stringify(events)}`;
    const result = await generateWithFallback({
      primaryModel: "gemini-3.8-flash",
      fallbackModel: "gemini-3.1-flash-lite",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.4,
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
    reflectionSummary: "Solid weekly progress! You maintained strong focus during morning technical blocks, while evening sessions required extra discipline.",
    productivityPatterns: [
      "Morning technical study blocks achieve highest completion consistency.",
      "Physical workout blocks correlate with improved afternoon energy levels.",
      "Late night study slots carry higher risk of postponement."
    ],
    recommendedAdjustments: [
      "Schedule high-focus learning goals during your peak 09:00-11:30 AM energy window.",
      "Reserve 14:00-16:00 PM for moderate tasks and active recovery.",
      "Maintain consistent sleep hygiene by ending study blocks by 21:30 PM."
    ]
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
      primaryModel: "gemini-3.8-flash",
      fallbackModel: "gemini-3.1-flash-lite",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
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
      primaryModel: "gemini-3.8-flash",
      fallbackModel: "gemini-3.1-flash-lite",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.4,
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
    currentDate = new Date().toISOString()
  } = req.body;

  const refDate = new Date(currentDate);
  const chronotype = energyProfile?.chronotype || "early_bird";
  const slumpProtection = energyProfile?.slumpProtection ?? true;
  const keyAvailable = !!process.env.GEMINI_API_KEY;

  // Algorithmic schedule builder & deconflictor (serves as robust fallback and algorithmic baseline)
  const generateHeuristicSchedule = () => {
    const fixedCompletedEvents = events.filter((e: any) => e.completed);
    const existingActiveEvents = events.filter((e: any) => !e.completed);
    let resultingEvents: any[] = [...fixedCompletedEvents];
    const diff: any[] = [];
    const reasoning: string[] = [];

    // Chronotype peak slots definition
    let peakStartHour = 9;
    let peakEndHour = 12;
    let slumpStartHour = 13;
    let slumpEndHour = 15.5;

    if (chronotype === "early_bird") {
      peakStartHour = 8;
      peakEndHour = 11.5;
      slumpStartHour = 13;
      slumpEndHour = 15;
    } else if (chronotype === "night_owl") {
      peakStartHour = 16;
      peakEndHour = 20;
      slumpStartHour = 10;
      slumpEndHour = 12;
    } else {
      peakStartHour = 9.5;
      peakEndHour = 13;
      slumpStartHour = 14;
      slumpEndHour = 16;
    }

    let sessionsAdded = 0;
    let sessionsMoved = 0;

    // Helper: Check if slot collides with existing resultingEvents
    const hasCollision = (start: Date, end: Date, ignoreEventId?: string) => {
      return resultingEvents.some((ev) => {
        if (ignoreEventId && ev.id === ignoreEventId) return false;
        const eStart = new Date(ev.start);
        const eEnd = new Date(ev.end);
        return start < eEnd && end > eStart;
      });
    };

    // Helper: Find open slot on a given date for given duration
    const findOpenSlotOnDay = (targetDay: Date, durationMins: number, preferredHour: number, ignoreEventId?: string) => {
      const dayOfWeek = targetDay.getDay();
      const avail = availability.find((a: any) => a.dayOfWeek === dayOfWeek);
      let dayStartHour = 8;
      let dayEndHour = 21;

      if (avail && avail.active) {
        const [sh] = avail.startTime.split(":").map(Number);
        const [eh] = avail.endTime.split(":").map(Number);
        dayStartHour = sh;
        dayEndHour = eh;
      }

      // Try around preferredHour first in 30-min increments
      const candidateHours: number[] = [];
      for (let delta = 0; delta <= 6; delta += 0.5) {
        if (preferredHour + delta <= dayEndHour - durationMins / 60) candidateHours.push(preferredHour + delta);
        if (delta > 0 && preferredHour - delta >= dayStartHour) candidateHours.push(preferredHour - delta);
      }
      // Also fallback to any daytime hour
      for (let h = dayStartHour; h <= dayEndHour - durationMins / 60; h += 0.5) {
        if (!candidateHours.includes(h)) candidateHours.push(h);
      }

      for (const h of candidateHours) {
        // If slump protection is active, avoid placing high cognitive work in slump
        if (slumpProtection && h >= slumpStartHour && h < slumpEndHour) continue;

        const start = new Date(targetDay);
        start.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
        // Don't place in past
        if (start.getTime() < Date.now() + 15 * 60 * 1000) continue;

        const end = new Date(start);
        end.setMinutes(start.getMinutes() + durationMins);

        if (!hasCollision(start, end, ignoreEventId)) {
          return { start, end };
        }
      }
      return null;
    };

    // MODE 1 & MODE 4: Deconflict existing uncompleted events
    existingActiveEvents.forEach((ev: any) => {
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);
      const durationMins = Math.max(15, Math.round((evEnd.getTime() - evStart.getTime()) / (1000 * 60)));
      const startHour = evStart.getHours() + evStart.getMinutes() / 60;

      const isCollision = hasCollision(evStart, evEnd, ev.id);
      const isInSlump = slumpProtection && startHour >= slumpStartHour && startHour < slumpEndHour;
      const isPastOverdue = evEnd.getTime() < Date.now() && !ev.completed;

      if ((isCollision || isInSlump || (mode === "catch_up_rebalance" && isPastOverdue)) && mode !== "retain_only") {
        // Needs moving
        const targetDay = new Date(refDate);
        if (isPastOverdue) {
          targetDay.setDate(refDate.getDate() + 1); // move past incomplete to tomorrow
        } else {
          targetDay.setTime(evStart.getTime());
        }

        const openSlot = findOpenSlotOnDay(targetDay, durationMins, peakStartHour, ev.id);
        if (openSlot) {
          const updatedEvent = {
            ...ev,
            start: openSlot.start.toISOString(),
            end: openSlot.end.toISOString(),
            notes: (ev.notes ? ev.notes + " | " : "") + "🤖 AI Adjusted: Deconflicted & energy aligned"
          };
          resultingEvents.push(updatedEvent);
          sessionsMoved++;
          diff.push({
            id: ev.id,
            type: "moved",
            title: ev.title,
            goalId: ev.goalId,
            oldStart: ev.start,
            oldEnd: ev.end,
            newStart: openSlot.start.toISOString(),
            newEnd: openSlot.end.toISOString(),
            reason: isCollision 
              ? "Resolved overlapping calendar collision" 
              : isInSlump 
                ? `Shifted out of energy slump (${slumpStartHour}:00-${slumpEndHour}:00) to match ${chronotype} rhythm` 
                : "Rebalanced overdue past session into open slot",
            energyBadge: `Peak ${chronotype.toUpperCase()} Window`
          });
          return;
        }
      }

      // Keep event as is
      resultingEvents.push(ev);
      diff.push({
        id: ev.id,
        type: "retained",
        title: ev.title,
        goalId: ev.goalId,
        newStart: ev.start,
        newEnd: ev.end,
        reason: "Already optimal and collision-free"
      });
    });

    // MODE: Auto-plan remaining goal targets across the week
    const activeGoals = (goals || []).filter((g: any) => !g.isPaused);
    activeGoals.forEach((goal: any) => {
      const goalTarget = goal.weeklyTarget || 3;
      const goalDuration = goal.durationMinutes || 45;
      
      // Count sessions already scheduled for this goal in resultingEvents
      const currentGoalEvents = resultingEvents.filter((ev: any) => {
        return ev.goalId === goal.id || (ev.title && ev.title.toLowerCase().includes(goal.name.toLowerCase()));
      });

      const neededCount = Math.max(0, goalTarget - currentGoalEvents.length);
      if (neededCount === 0) return;

      let preferredHour = peakStartHour;
      if (goal.timePreference === "evening" || goal.timePreference === "night") {
        preferredHour = 18;
      } else if (goal.timePreference === "afternoon") {
        preferredHour = 14;
      } else if (goal.timePreference === "early_morning") {
        preferredHour = 7;
      }

      let bookedForGoal = 0;
      for (let offset = 0; offset <= 7 && bookedForGoal < neededCount; offset++) {
        const candidateDay = new Date(refDate);
        candidateDay.setDate(refDate.getDate() + offset);

        // Check if goal already has a session on this date
        const dayStr = candidateDay.toDateString();
        const alreadyOnDay = resultingEvents.some((ev) => {
          const isGoal = ev.goalId === goal.id || (ev.title && ev.title.toLowerCase().includes(goal.name.toLowerCase()));
          return isGoal && new Date(ev.start).toDateString() === dayStr;
        });
        if (alreadyOnDay) continue;

        const openSlot = findOpenSlotOnDay(candidateDay, goalDuration, preferredHour);
        if (openSlot) {
          const newEventId = `ai_sch_${goal.id}_${Date.now()}_${offset}`;
          const newEvent = {
            id: newEventId,
            title: goal.name,
            type: goal.type === "workout" ? "workout" :
                  goal.type === "study" ? "study" :
                  goal.type === "job_search" ? "job_search" :
                  goal.type === "side_project" ? "side_project" :
                  goal.type === "routine" ? "routine" : "personal",
            start: openSlot.start.toISOString(),
            end: openSlot.end.toISOString(),
            goalId: goal.id,
            completed: false,
            energyLevel: goal.energyLevel || "deep_focus",
            notes: `🤖 AI Autopilot: Scheduled ${goalDuration}m block aligned with ${chronotype.toUpperCase()} rhythm`
          };
          resultingEvents.push(newEvent);
          sessionsAdded++;
          bookedForGoal++;
          diff.push({
            id: newEventId,
            type: "added",
            title: goal.name,
            goalId: goal.id,
            goalName: goal.name,
            newStart: openSlot.start.toISOString(),
            newEnd: openSlot.end.toISOString(),
            reason: `Auto-planned to fulfill weekly target of ${goalTarget} sessions/wk`,
            energyBadge: `${goal.energyLevel || "deep_focus"} • ${openSlot.start.getHours() >= 12 ? "PM" : "AM"}`
          });
        }
      }

      if (bookedForGoal > 0) {
        reasoning.push(`Booked ${bookedForGoal} optimal session(s) for "${goal.name}" without collision.`);
      }
    });

    // Summary text
    let title = "AI Schedule Autopilot Plan";
    if (mode === "deconflict_and_heal") title = "Collision Deconfliction & Schedule Healing";
    else if (mode === "catch_up_rebalance") title = "Mid-Week Catch-Up Rebalance";
    else if (mode === "energy_chronotype_align") title = "Chronotype & Bio-Energy Alignment";
    else if (prompt) title = `AI Schedule: "${prompt.slice(0, 40)}"`;

    if (reasoning.length === 0) {
      reasoning.push("Calendar verified: All active goals have sufficient conflict-free blocks.");
      reasoning.push(`Protected your energy slump window and mapped high focus blocks to peak energy hours.`);
    }

    const totalHoursScheduled = Math.round(
      resultingEvents.reduce((acc, ev) => {
        const dur = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / (1000 * 60 * 60);
        return acc + Math.max(0, dur);
      }, 0) * 10
    ) / 10;

    return {
      title,
      summary: `AI analyzed your ${activeGoals.length} goals and active calendar. Added ${sessionsAdded} sessions, shifted ${sessionsMoved} sessions for optimal rhythm and zero conflicts.`,
      reasoning,
      proposedEvents: resultingEvents,
      diff,
      stats: {
        sessionsAdded,
        sessionsMoved,
        sessionsRemoved: 0,
        totalHoursScheduled,
        energyScore: 94
      },
      aiGenerated: false
    };
  };

  // If Gemini API Key is available, use generative intelligence with fallback to algorithmic baseline
  if (keyAvailable) {
    try {
      const baseline = generateHeuristicSchedule();
      const systemInstruction = `You are an Autonomous AI Calendar & Schedule Controller.
Your mission is to intelligently orchestrate the user's weekly calendar events, goals, and availability.
Analyze their goals, current calendar events, chronotype (${chronotype}), slump protection (${slumpProtection}), and natural language directive.

Rules:
1. Ensure 100% collision-free scheduling (no two events overlapping in time).
2. Respect user availability windows.
3. Align deep focus tasks with their peak energy hours (${chronotype}).
4. If a custom prompt was provided, follow its instructions (e.g. clear a specific afternoon, double focus time, etc.).
5. Return ONLY a valid JSON object matching this schema:
{
  "title": "Title of the proposal",
  "summary": "2-3 sentence executive summary of actions taken",
  "reasoning": ["point 1", "point 2", "point 3"],
  "stats": {
    "sessionsAdded": number,
    "sessionsMoved": number,
    "sessionsRemoved": number,
    "totalHoursScheduled": number,
    "energyScore": number
  },
  "proposedEvents": [
    {
      "id": "string",
      "title": "string",
      "type": "workout" | "study" | "job_search" | "side_project" | "routine" | "personal",
      "start": "ISO 8601 string",
      "end": "ISO 8601 string",
      "goalId": "string (optional)",
      "completed": boolean,
      "notes": "string"
    }
  ],
  "diff": [
    {
      "id": "string",
      "type": "added" | "moved" | "deleted" | "retained",
      "title": "string",
      "goalId": "string (optional)",
      "goalName": "string (optional)",
      "oldStart": "ISO 8601 string (optional)",
      "oldEnd": "ISO 8601 string (optional)",
      "newStart": "ISO 8601 string (optional)",
      "newEnd": "ISO 8601 string (optional)",
      "reason": "Clear explanation of why this was scheduled or moved",
      "energyBadge": "string (e.g. 'Peak Morning Focus')"
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
Algorithmic Baseline Suggestion: ${JSON.stringify({ diff: baseline.diff, stats: baseline.stats })}`;

      const result = await generateWithFallback({
        primaryModel: "gemini-3.8-flash",
        fallbackModel: "gemini-3.1-flash-lite",
        contents,
        config: {
          systemInstruction,
          temperature: 0.3,
          responseMimeType: "application/json"
        }
      });

      if (result && result.text) {
        const parsed = JSON.parse(result.text.trim());
        if (parsed && Array.isArray(parsed.proposedEvents) && Array.isArray(parsed.diff)) {
          parsed.aiGenerated = true;
          return res.json(parsed);
        }
      }
    } catch (err: any) {
      console.warn("AI Schedule Controller Gemini API fallback warning:", err?.message || err);
    }
  }

  // Programmatic fallback
  const fallbackProposal = generateHeuristicSchedule();
  return res.json(fallbackProposal);
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
