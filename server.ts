import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

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

// Simple JSON File Database file path
const DB_FILE = path.join(process.cwd(), "db_sync.json");

// Helper to ensure initial database with clean default presets
function getInitialData(userEmail: string) {
  return {
    goals: [
      {
        id: "g1",
        name: "Morning Cardio & Stretch",
        type: "workout",
        category: "Cardio",
        weeklyTarget: 3,
        durationMinutes: 45,
        timePreference: "morning",
        completedCount: 2,
        color: "#f43f5e", // Rose
        createdAt: new Date().toISOString()
      },
      {
        id: "g2",
        name: "React & TypeScript Masterclass",
        type: "study",
        category: "Programming",
        weeklyTarget: 4,
        durationMinutes: 90,
        timePreference: "afternoon",
        completedCount: 1,
        color: "#06b6d4", // Cyan
        createdAt: new Date().toISOString()
      },
      {
        id: "g3",
        name: "Strength Training",
        type: "workout",
        category: "Strength",
        weeklyTarget: 2,
        durationMinutes: 60,
        timePreference: "evening",
        completedCount: 0,
        color: "#8b5cf6", // Purple
        createdAt: new Date().toISOString()
      },
      {
        id: "g4",
        name: "Python & AI Engineering Masterclass",
        type: "study",
        category: "Python Dev",
        weeklyTarget: 4,
        durationMinutes: 60,
        timePreference: "evening",
        completedCount: 2,
        color: "#3b82f6", // Blue
        createdAt: new Date().toISOString()
      }
    ],
    events: [
      // Some pre-populated events for this week
      {
        id: "e1",
        title: "Morning Cardio & Stretch (Auto-Scheduled)",
        type: "workout",
        start: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 15 * 60 * 1000).toISOString(), // 2 days ago
        end: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString(),
        goalId: "g1",
        completed: true,
        notes: "Completed perfectly before work!"
      },
      {
        id: "e2",
        title: "React & TypeScript Masterclass (Auto-Scheduled)",
        type: "study",
        start: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        end: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(),
        goalId: "g2",
        completed: true,
        notes: "Studied components and high-order functions."
      },
      {
        id: "e3",
        title: "Morning Cardio & Stretch (Upcoming)",
        type: "workout",
        start: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // in 4 hours
        end: new Date(Date.now() + 4 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString(),
        goalId: "g1",
        completed: false,
        notes: "Will do dynamic stretches and brief run."
      },
      {
        id: "e4",
        title: "Python & AI Engineering Masterclass (Auto-Scheduled)",
        type: "study",
        start: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 19 * 60 * 60 * 1000).toISOString(),
        goalId: "g4",
        completed: false,
        notes: "Learn Python data structures, async syntax, and AI APIs."
      }
    ],
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
      },
      {
        id: "n2",
        title: "Upcoming Activity in 4 hours",
        message: "Get ready for Morning Cardio & Stretch! Make sure to stay hydrated.",
        timestamp: new Date().toISOString(),
        read: false,
        type: "upcoming"
      }
    ],
    coachMessages: [
      {
        id: "m1",
        sender: "coach" as const,
        text: "Hello! I am your AI Routine Coach. Ask me to optimize your workout schedule, suggest study intervals, or analyze your completion consistency!",
        timestamp: new Date().toISOString()
      }
    ],
    userEmail: userEmail || "default_user@gmail.com",
    lastSyncedAt: new Date().toISOString()
  };
}

// Load database
function readDb(email: string) {
  try {
    if (fs.existsSync(DB_FILE)) {
      const fileContent = fs.readFileSync(DB_FILE, "utf-8");
      const db = JSON.parse(fileContent);
      // Return user data if matches, otherwise return initialized template for that user
      if (db[email]) {
        return db[email];
      }
      // Migrate or initialize
      db[email] = getInitialData(email);
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
      return db[email];
    } else {
      const db = { [email]: getInitialData(email) };
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
      return db[email];
    }
  } catch (err) {
    console.error("Error reading db_sync.json, providing in-memory data:", err);
    return getInitialData(email);
  }
}

// Save database
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
    db[email] = {
      ...data,
      userEmail: email,
      lastSyncedAt: new Date().toISOString()
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db[email];
  } catch (err) {
    console.error("Error writing database:", err);
    return data;
  }
}

// 1. SYNC ENDPOINT: Get data
app.get("/api/sync", (req, res) => {
  const email = (req.query.email as string) || "rounigorgees@gmail.com";
  const data = readDb(email);
  res.json(data);
});

// 2. SYNC ENDPOINT: Post data to update
app.post("/api/sync", (req, res) => {
  const email = req.body.userEmail || "rounigorgees@gmail.com";
  const updatedData = writeDb(email, req.body);
  res.json({ success: true, data: updatedData });
});

// 3. AI COACH ENDPOINT
app.post("/api/coach/optimize", async (req, res) => {
  const { prompt, goals, events, availability, coachPersona = "mentor" } = req.body;
  const keyAvailable = !!process.env.GEMINI_API_KEY;

  if (!keyAvailable) {
    // Elegant fallback simulation customized by persona if API Key is not set
    let mockResponses: string[] = [];
    let badge = "";

    if (coachPersona === "drill") {
      badge = "🏋️‍♂️ [DIFFICULTY: HIGH] SERGEANT HARDCORE DISCIPLINE CHATBOT";
      mockResponses = [
        "ATTENTION RECRUIT! Your calendar is looking soft! I checked your **Morning Cardio** completions and you are lagging behind! SCHEDULE THOSE BLOCKS AT 08:00 SHARP! No snooze button, no crying! DISCIPLINE IS THE FUEL OF PROGRESS! GET UP AND DOMINATE!",
        "LISTENING TO EXCUSES IS NOT IN MY CODE! You've got Study targets to hit but you're letting prime focus windows waste away. Block out 90 minutes of absolute silent execution today. LOCK YOUR PHONE, UNPLUG THE TV, AND GET TO WORK!",
        "SQUAT DOWN AND DIG DEEP! Maintaining consistency isn't about feeling motivated, it's about following the schedule layout like an absolute machine. Lock in your routines now. DISCIPLINE REAPS REWARDS!",
        "IF YOU WEAR OUT, YOU WIN! IF YOU GIVE UP, YOU LOSE! Get those study and side project hours allocated. I want to see conflict-free blocks of pure performance scheduled immediately!"
      ];
    } else if (coachPersona === "data") {
      badge = "📊 [ANALYST MODE] DATA-DRIVEN STOCHASTIC ROUTINE SYSTEMS";
      mockResponses = [
        "**[Metrics Report] Consistency Index: 0.64 (Moderate)**\n\n- **Quantitative Observation**: Shift of **React Learning** blocks by +90 minutes correlates with a 24.3% increase in session completion probabilities.\n- **Optimized Window**: Tuesday & Thursday afternoons display the lowest probability of scheduling conflicts.",
        "**[Routine Performance Analysis]**\n\n- **Bottleneck Identified**: Stacked side-project and workout sessions show a high correlation with fatigue-induced skips (coefficient: 0.72).\n- **Prescription**: Interject a 45-minute active recovery or hydration buffer to reset your metabolic and mental focus levels.",
        "**[Time-Block Correlation Model]**\n\n- Active study sessions placed between 09:00 and 11:30 achieve maximum cognitive retention. Avoid late night allocations where cognitive capacity drops by up to 40% based on user telemetry benchmarks.",
        "**[Optimized Distribution Strategy]**\n\n- Distribute your 4x weekly workouts in a 1-day-on, 1-day-off pattern rather than loading weekends. This optimizes muscular recovery timelines and keeps cardiovascular fatigue minimal."
      ];
    } else {
      badge = "🌸 [MENTOR COACH] EMPOWERMENT & MINDFUL COGNITION";
      mockResponses = [
        "Hello! You're doing a truly wonderful job taking steps toward your goals. 🌱\n\n- Let's look at your **Morning Cardio** - if mornings are feeling a bit rushed, how about we set them for a comfortable 30-minute block? Be gentle with yourself; slow, steady progress is what builds lifelong habits. You've got this!",
        "I'm super proud of you for keeping your study goals in focus! 📚 To make things easier, try breaking your sessions into a 45-minute deep-focus period, followed by a warm cup of tea and some deep breathing. Your mental wellness is just as important as your progress.",
        "It's completely okay if some days don't go exactly as planned. Life happens! The important thing is we simply look forward to tomorrow. Try placing your **Side Project** block on a relaxing Thursday evening, and enjoy the process of creating.",
        "Finding your personal rhythm takes a little time, and you are doing beautifully. Let's make sure we schedule a gentle self-care routine window during the weekend to recharge your creative batteries."
      ];
    }

    const item = mockResponses[Math.floor(Math.random() * mockResponses.length)];
    const simulatedCoachMessage = `**${badge}**\n\n${item}\n\n*(Note: Running in optimized local guidance mode. When a live GEMINI_API_KEY is configured, this AI assistant activates the real-time Gemini model using this custom persona!)*`;
    
    // Brief delay to simulate actual dynamic call processing
    await new Promise((resolve) => setTimeout(resolve, 800));
    return res.json({ text: simulatedCoachMessage });
  }

  try {
    const ai = getAi();
    
    let personaInstruction = "";
    if (coachPersona === "drill") {
      personaInstruction = `Adopt the persona of a tough-love, high-energy, loud, direct military Drill Sergeant coach. Use phrases like "LISTEN UP RECRUIT!", "NO EXCUSES!", "STAY DISCIPLINED!", and emphasize your points with passionate capitalizations. Hold them strictly accountable with aggressive motivational challenges!`;
    } else if (coachPersona === "data") {
      personaInstruction = `Adopt the persona of an extremely analytical, quantitative data-science Productivity Systems Optimizer. Use terms like "consistency index", "probability distribution of success", "stochastic alignment", "performance metrics", and output trends and statistical models. Use tables and bullet lists to present data-driven scheduling prescriptions.`;
    } else {
      personaInstruction = `Adopt the persona of an encouraging, warm, gentle, and highly empathetic life coach and mentor. Validate their challenges, build confidence, use kind words and positive mindfulness suggestions, and guide them gently. Use warm emojis.`;
    }

    const systemPrompt = `You are a world-class Productivity & Routine Optimizer Coach. ${personaInstruction}
You analyze calendar events, user availability, and workout/study goals to suggest smart scheduling optimizations, time management, motivational challenges, and productivity tips.
Use clear, actionable bullet points, keep markdown styling very clean and readable. Include references to their specific goals structure if appropriate.

Available Goals:
${JSON.stringify(goals, null, 2)}

Weekly Calendar Events:
${JSON.stringify(events, null, 2)}

Availability:
${JSON.stringify(availability, null, 2)}`;

    const userPrompt = prompt || "Analyze my current routine and suggest 3 direct optimizations to boost my weekly consistency and completion rate.";

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7
      }
    });

    res.json({ text: result.text });
  } catch (err: any) {
    console.error("Error communicating with Gemini: ", err);
    res.status(500).json({ error: "Failed to fetch recommendation from AI Coach. Please check secret key configurations." });
  }
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
