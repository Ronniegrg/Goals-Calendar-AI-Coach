# Calendar Goals & AI Coach ⚡📅

> **Smart, Chronotype-Aware Calendar Planner & Execution Cockpit**  
> An intelligent productivity ecosystem combining circadian energy curves, cognitive load management, autonomous habit scheduling, real-time focus execution, and a Gemini-powered AI Routine Coach.

---

## 📖 Table of Contents
1. [Overview & Philosophy](#overview--philosophy)
2. [Key Architecture & Tech Stack](#key-architecture--tech-stack)
3. [Core Feature Modules](#core-feature-modules)
   - [Calendar & Daily Rhythm](#1-calendar--daily-rhythm-calendarview)
   - [Real-Time Execution Cockpit & HUD](#2-real-time-execution-cockpit-activeexecutionhud)
   - [Goal Briefing & Note Integration](#3-goal-briefing--note-integration-goalstartbriefingmodal)
   - [Motivational Pulse Banner & Alerts](#4-motivational-pulse-banner-motivationalpulsebanner)
   - [Goals & Habit Management](#5-goals--habit-architecture-goaltracker)
   - [Autonomous AI Schedule Controller](#6-autonomous-ai-schedule-controller-aischedulecontroller)
   - [AI Routine Coach](#7-ai-routine-coach-aicoach)
   - [Focus Timer & Ambient Soundscapes](#8-focus-timer--ambient-soundscapes-focustimermodal)
   - [Streak Shield & Burnout Protection](#9-streak-shield--burnout-protection-streakshieldmodal)
   - [Analytics & Retrospectives](#10-analytics--retrospectives-weeklyretrospectiveforecaster)
   - [Two-Way Calendar & Mobile Sync](#11-two-way-calendar--mobile-sync)
4. [User Workflows & Hotkeys](#user-workflows--hotkeys)
5. [Backend & API Reference](#backend--api-reference)
6. [Development & Getting Started](#development--getting-started)

---

## Overview & Philosophy

Most calendar apps are passive grids that let tasks pile up without regard for human biological energy or task inertia. **Calendar Goals & AI Coach** is designed around cognitive pacing and execution psychology:

- **Energy & Cognitive Load Awareness**: Matches deep focus blocks (coding, complex study, writing) to your peak bio-energy hours and schedules physical workouts or restorative personal blocks during lower cognitive periods.
- **Frictionless Action**: Bridges the gap between planning and doing with a 1-click **Start Studying Now** HUD, a **Study Ahead** trigger for high-momentum days, and goal notes to tell you exactly where to pick up.
- **Autonomous Schedule Healing**: Automatically detects missed sessions, schedule drift, or overbooked days and rebalances your week with conflict-free adjustments.

---

## Key Architecture & Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite |
| **Styling & UI** | Tailwind CSS v4, Lucide React icons, Glassmorphism design system |
| **Animation & Charts** | Motion (`motion/react`), Recharts |
| **Backend & Proxy** | Node.js, Express (`server.ts`), TSX |
| **AI Intelligence** | Google GenAI SDK (`@google/genai`), server-side Gemini Flash models |
| **Audio Engine** | Web Audio API (custom binaural sound generator: pink noise, rain, flow, cafe) |
| **Persistence** | File-backed JSON store (`db_sync.json`) with auto-reconciliation |

---

## Core Feature Modules

### 1. Calendar & Daily Rhythm (`CalendarView`)
- **Multi-View Modes**: Switch between **Week Grid**, **Day Schedule**, and mobile-optimized **List View**.
- **Bio-Energy Overlay**: Visual chronotype curve showing peak focus, moderate focus, and rest windows.
- **Daily Cognitive Strain Meter**: Monitors planned deep focus hours against daily thresholds (Optimal vs. Overloaded).
- **Drag-and-Drop & Quick Resize**: Effortlessly reschedule sessions by dragging cards across time slots and days.
- **Direct Event Spotlighting**: When navigating to a specific session from alerts, goals, or the HUD, the calendar smoothly scrolls to the exact time slot, highlights the session card with an amber glowing ring, and centers the view.

### 2. Real-Time Execution Cockpit (`ActiveExecutionHUD`)
- **Now & Up-Next Execution**: Displays the session currently happening or the next upcoming block for today.
- **"Start Studying Now"**: 1-click launch that prompts you with your goal's progress and notes before opening the full-screen focus timer.
- **"Study Ahead"**: When all scheduled blocks for today are finished, the HUD surfaces tomorrow's earliest block. Users can preview it, view saved goal notes, and start studying ahead immediately.
- **Session Progress Bar**: Real-time elapsed indicator with minutes remaining and completion status.

### 3. Goal Briefing & Note Integration (`GoalStartBriefingModal`)
- When starting a session via **Start Studying Now** or **Study Ahead**:
  - If you have saved notes on the goal (e.g., chapters to read, exercises, exact starting page), the modal pops up displaying your notes so you know exactly where to begin.
  - Allows quick note editing or additions right before launching the timer.
  - If no note is saved, the session starts immediately without friction.

### 4. Motivational Pulse Banner (`MotivationalPulseBanner`)
- **Daily Briefing Digest**: Synthesizes today's scheduled blocks and high-priority goals into an actionable overview.
- **Alert Cards**: Displays completed session achievements, notifications, and AI recommendations.
- **"View Calendar" Button**: Direct navigation from any alert or briefing block to the calendar view with automatic date synchronization, window scrolling, and session spotlighting.
- **Daily Spark Insights**: Curated motivational rules and quotes that can be cycled on demand.

### 5. Goals & Habit Architecture (`GoalTracker`)
- **Customizable Goals**: Define goals with unique icons, colors, weekly target sessions, duration, and priority levels (**Critical**, **Important**, **Normal**).
- **Goal Categories**: Study, Physical Workout, Personal & Career Development.
- **Pacing & Delay Options**: Postpone or shift a goal agenda forward (e.g., during exam week or travel) with automated calendar decluttering.
- **Next Scheduled Session Badge**: Displays the next planned block for each goal with a direct **View Calendar** shortcut.

### 6. Autonomous AI Schedule Controller (`AIScheduleController`)
- **Sentinel Radar**: Continuously scans for schedule conflicts, cognitive overload spikes, and missed goals.
- **Autopilot Pacing Modes**:
  - **Gentle**: Prioritizes recovery breaks and reduced consecutive deep-work blocks.
  - **Balanced**: Standard harmony between focus sessions and downtime.
  - **Aggressive**: Maximizes goal velocity and fills available availability slots.
- **1-Click Apply & Full Undo**: Preview proposed calendar adjustments before committing, with instantaneous rollback support.

### 7. AI Routine Coach (`AICoach`)
- **Conversational Assistant**: Discuss workload, daily fatigue, exam preparation, and habits.
- **Sub-Step Breakdown**: Automatically breaks daunting goals into 15–30 minute actionable micro-tasks.
- **Energy-Aware Schedule Optimization**: Evaluates your calendar against your chronotype profile and proposes intelligent shifts.

### 8. Focus Timer & Ambient Soundscapes (`FocusTimerModal`)
- **Full-Screen & Mini Floating Bar**: Keep the timer visible while browsing other calendar views.
- **Pomodoro & Flow Modes**: Standard 25/5 intervals, custom durations, or open-ended stopwatch flow.
- **Built-in Soundscapes**: Web Audio synthesizers for Rain, White Noise, Pink Noise, Coffee Shop, and Deep Flow binaural beats.
- **Keyboard Shortcuts**: `Space` to Play/Pause, `M` to toggle soundscapes, `Esc` to minimize/close.
- **Session Reflection Modal**: Rate your focus quality (1–5 stars) and capture notes upon finishing a block.

### 9. Streak Shield & Burnout Protection (`StreakShieldModal`)
- **Streak Freeze Tokens**: Protect your consistency habits when unexpected life events or illness occur.
- **Burnout Defense Limits**: Set maximum daily deep work hours to prevent exhaustion.

### 10. Analytics & Retrospectives (`WeeklyRetrospectiveForecaster`)
- **Consistency Heatmap**: Visual GitHub-style commit grid for daily completed focus sessions.
- **Momentum Score**: Tracks completion rates and weekly volume trends.
- **Category Balance**: Visual breakdown of intellectual vs. physical workout sessions.

### 11. Two-Way Calendar & Mobile Sync
- **Live iCal Feed**: Subscribe via Google Calendar, Apple Calendar, or Outlook via `/api/calendar/feed.ics`.
- **Export & Import**: Export clean `.ics` calendar files or import existing external `.ics` files.
- **QR Code Mobile Sync**: Scan with your mobile device to synchronize sessions directly to your phone calendar.

---

## User Workflows & Hotkeys

### Starting a Focused Study Session
1. In the **Calendar & Daily Rhythm** tab, look at the **Active Execution HUD** at the top.
2. Click **Start Studying Now** (or **Study Ahead** if today's blocks are completed).
3. If notes exist on the goal, the **Session Briefing Modal** opens, highlighting where you left off.
4. Click **Start Focus Timer Now** to begin the session.

### Navigating Alerts to the Calendar Grid
- In any alert banner (e.g., *"Session Achieved! Cybersecurity: Finished on schedule"*), click **View Calendar**.
- The page smoothly scrolls directly to the **Schedule** section, sets the calendar date to the event's day, and pulses the target session card in amber.

### Keyboard Shortcuts (Focus Timer)
- `Space`: Pause / Resume timer.
- `M`: Mute / Unmute ambient soundscape.
- `Esc`: Minimize timer to floating bar.

---

## Backend & API Reference

The Node/Express backend (`server.ts`) powers persistent cloud sync, calendar subscription feeds, and Gemini AI endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/sync` | `GET` / `POST` | Fetches and persists goals, calendar events, availability, notifications, and coach logs. |
| `/api/calendar/feed.ics` | `GET` | Live iCalendar subscription endpoint for external calendar synchronization. |
| `/api/calendar/export.ics` | `GET` | Generates a downloadable `.ics` calendar snapshot. |
| `/api/coach/optimize` | `POST` | AI schedule optimization based on chronotype and commitments. |
| `/api/coach/digest` | `POST` | Generates daily strategic morning briefings. |
| `/api/coach/suggest-substeps` | `POST` | AI-generated task breakdown for complex learning goals. |
| `/api/coach/energy-schedule` | `POST` | Chronotype-aligned schedule generation. |
| `/api/coach/recommend-goals` | `POST` | Goal recommendations based on user interests. |

---

## Development & Getting Started

### Prerequisites
- Node.js (v18 or newer)
- npm or bun

### Installation
```bash
# Install dependencies
npm install

# Start the full-stack development server
npm run dev
```
The application will launch on `http://localhost:3000`.

### Building for Production
```bash
# Build frontend bundle and server
npm run build

# Start production server
npm run start
```
