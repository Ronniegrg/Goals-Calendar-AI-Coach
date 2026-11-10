# Goal Knowledge Tester & Study Material Notes Hub

An active recall engine that empowers learners to attach study notes and document materials to specific goals. When a user clicks to start a study session, the Knowledge Test launches first with a configurable timer (default 10 minutes, customizable in Settings). After completing the test, learners receive immediate explanations and in-app study recommendations for any missed concepts, then dynamically transition into their main goal study session.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following specifications are confirmed and guide this implementation:

- **Confirmed Decision 1 (Pre-Session Launch Trigger)**: *(Updated per user request)* When the user clicks **"Timer"** or **"Start Goal Session"** (from the Active Execution HUD, Calendar View, or Goal Tracker), the **Knowledge Test triggers first** as an active recall warmup before studying begins.
- **Confirmed Decision 2 (Configurable Test Timer)**: *(Updated per user request)* The test includes a live countdown timer (default **10 minutes**). Users can configure their preferred test duration (e.g., 5 min, 10 min, 15 min, or disable pre-test) in the **Settings** page.
- **Confirmed Decision 3 (Seamless Dynamic Transition)**: *(Updated per user request)* When the test finishes (or is submitted early), the user views their score, instant explanations, and any flagged materials. Clicking **"Continue to Study Session"** dynamically launches the main focus study timer for that goal without losing momentum.
- **Confirmed Decision 4 (Missed Question Recommendations & In-App Reader)**: If a user misses any question, the tester identifies the related study note or file and provides a **"📖 Study This Material Now"** button. This opens the **In-App Study Reader** so the learner can review the exact text and concepts right inside the application.
- **Confirmed Decision 5 (Study Material Repository)**: Each goal (IT Support, React, Python, Cybersecurity, Job Search) has a dedicated materials manager to add rich text notes, summaries, and upload text files (`.txt`, `.md`, `.json`, code).
- **Confirmed Decision 6 (Resilient AI & Fallback Engine)**: Powered by Gemini 3.8 Flash via `/api/tester/generate` to synthesize structured questions directly from the goal's notes, backed by an intelligent local heuristic generator if offline.

---

### 1. Overview & Core Concept

- **What It Does**: 
  - **Goal Material Repository**: Attach notes, cheat sheets, summaries, and text files directly to individual goals.
  - **Pre-Session Knowledge Check**: Intercepts the "Start Goal Session" action to run a timed knowledge test first.
  - **10-Minute Test Countdown**: Enforces focused recall with a dedicated timer and auto-submission upon timeout.
  - **Instant Feedback & Remediation**: Real-time multiple-choice feedback with source citations and in-app study notes.
  - **Dynamic Progression**: One-click transition from test review into the full focus study timer.
  - **Settings Customization**: Dedicated section in Settings to adjust test duration, question count, and toggle the pre-session requirement.

- **Target Audience / Persona**:
  - Technical learners preparing for certifications, tech interviews, or deep coursework who want verified retention and immediate remediation of knowledge gaps before every study session.

- **Key Value**:
  - Primes the brain via **Retrieval Practice** right before studying: identifies what is already known and highlights what needs focus during the upcoming study block.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Starting a Study Session**:
     - User clicks **"Timer"** on a goal (e.g. *Cybersecurity*) in the Active Execution HUD or Calendar.
     - The app detects that a pre-session knowledge check is active.
     - `KnowledgeTesterModal` opens with a 10:00 countdown timer, displaying questions derived from that goal's materials.
  2. **Taking the Timed Knowledge Test**:
     - User navigates through multiple-choice questions with keyboard shortcuts (`1-4`) or mouse clicks.
     - Instant visual correctness indicators with full conceptual explanations appear.
     - If time runs out, answers are preserved and automatically submitted.
  3. **Remediation & In-App Study Reader**:
     - If the user misses a question, an alert badge shows: *"Review Recommended: [Material Title]"*.
     - Clicking **"📖 Study This Material Now"** opens the **In-App Study Reader** modal, displaying the exact note/snippet.
     - User reads the material inside the app and returns to the test summary.
  4. **Dynamic Transition to Study Session**:
     - User clicks the prominent primary button: **"🚀 Continue to Goal Study Session ([Duration]m)"**.
     - The test modal smoothly closes and immediately starts the `FocusTimerModal` for that goal.
  5. **Settings Configuration**:
     - Under Settings Section: "Knowledge Tester & Pre-Study Checks":
       - Toggle: "Run Knowledge Test Before Study Session" (Enabled / Disabled)
       - Test Timer Duration: Segmented slider / options (5m, 10m, 15m, 20m)
       - Question Count: (3, 5, or 10 questions)

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Dark slate technical dashboard with high legibility and distraction-free typography.
  - *Palette Tokens*:
    - Background: Deep slate (`#0B0F19`, `bg-slate-950`)
    - Test Timer: Amber-orange glow when under 2 minutes (`text-amber-400 font-mono`)
    - Correct: Emerald accent (`text-emerald-400`, `bg-emerald-950/40`, `border-emerald-500/40`)
    - Incorrect: Rose accent (`text-rose-400`, `bg-rose-950/40`, `border-rose-500/40`)
    - Transition button: Emerald gradient (`bg-emerald-600 hover:bg-emerald-500 text-white font-medium`)
  - *Typography*:
    - Monospace badges for timers and question counters (`font-mono 10:00 · Q1 of 3`).
    - Clean prose typography in the In-App Study Reader with markdown rendering.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Pre-Session vs Post-Session Timing**:
  - *Chosen Approach*: Trigger knowledge check *before* the study session begins, with a smooth one-click dynamic handoff into the main study timer.
  - *Why*: User specifically requested pre-session priming so the brain tests recall of past materials right before diving into new study, revealing exact weaknesses to focus on.

- **Decision 2: 10-Minute Test Timer & Settings Control**:
  - *Chosen Approach*: Default 10-minute timer with options in `SettingsView.tsx` to set 5, 10, 15 minutes, or skip/disable.
  - *Why*: Gives learners structure and urgency while providing full customization for different daily schedules.

- **Decision 3: Seamless State Handoff**:
  - *Chosen Approach*: When launching a timer from HUD or Calendar, store pending goal session state; upon test completion, pass that pending state directly into `FocusTimerModal`.
  - *Why*: Guarantees zero friction—the user never has to re-select the goal or re-click "Timer".

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌────────────────────────────────────────────────────────────────────────┐
│             User Clicks [Timer] in HUD, Calendar, or Goals             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        KnowledgeTesterModal.tsx                        │
│  - Pre-Session Test with 10:00 Timer (Configurable via Settings)       │
│  - Multiple-Choice Questions generated from Goal's Study Materials     │
│  - Immediate Explanations & Missed-Material Recommendations            │
│  - Action: [📖 Study This Material Now] ───► In-App Study Reader       │
│  - Action: [🚀 Continue to Study Session]                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ triggers dynamically
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          FocusTimerModal.tsx                           │
│  - Launches Main Focus Study Timer for Goal (e.g. 45 min)              │
│  - Ambient Soundscapes & Full Focus Controls                           │
└────────────────────────────────────────────────────────────────────────┘
```

- **Settings Model (`SettingsView.tsx` & `localStorage`)**:
  - `tester_enabled_before_session`: boolean (default: `true`)
  - `tester_duration_minutes`: number (default: `10`)
  - `tester_question_count`: number (default: `3`)

- **Data Models**:
  ```typescript
  export interface StudyMaterial {
    id: string;
    goalId: string;
    title: string;
    type: "note" | "file";
    content: string;
    fileName?: string;
    fileSize?: number;
    updatedAt: string;
  }

  export interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    sourceMaterialId?: string;
    sourceMaterialTitle?: string;
    sourceSnippet?: string;
  }
  ```

- **Components to Create / Update**:
  1. `src/components/StudyMaterialsModal.tsx`: Manage, add, and upload notes and files per goal.
  2. `src/components/StudyMaterialReaderModal.tsx`: In-app reader to view and study specific notes.
  3. `src/components/KnowledgeTesterModal.tsx`: Timed pre-session test with instant explanations, recommendation cards, and "Continue to Study Session" transition.
  4. `src/components/SettingsView.tsx`: Section to configure test duration (10 min default), question count, and toggle.
  5. `src/components/ActiveExecutionHUD.tsx` & `CalendarView.tsx`: Intercept "Timer" click to launch the pre-session test when enabled, then continue to `FocusTimerModal`.
  6. `server.ts`: `/api/tester/generate` endpoint with Gemini 3.8 Flash and robust local fallback.
