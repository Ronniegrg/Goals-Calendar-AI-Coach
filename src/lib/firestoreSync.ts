import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import type { User } from "firebase/auth";
import {
  AppNotification,
  AutopilotMode,
  AutopilotPacing,
  AvailabilityWindow,
  CalendarEvent,
  CoachChatSession,
  DailyBurnoutLimits,
  FlashcardItem,
  Goal,
  KnowledgeTestArtifact,
  StudyArtifactNote
} from "../types";
import type { UserEnergyProfile } from "./energyProfile";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";

export interface FirestoreWorkspaceState {
  goals: Goal[];
  events: CalendarEvent[];
  availability: AvailabilityWindow[];
  notifications: AppNotification[];
  coachChatSessions: CoachChatSession[];
  activeCoachChatId: string;
  coachPersona: "mentor" | "drill" | "data";
  autopilotMode?: AutopilotMode;
  autopilotPacing?: AutopilotPacing;
  burnoutLimits?: DailyBurnoutLimits;
  energyProfile?: UserEnergyProfile;
  customTemplates?: any[];
}

export interface FirestoreSyncInput extends FirestoreWorkspaceState {
  email: string;
  displayName?: string | null;
}

const VALID_NOTE_CATEGORIES = new Set([
  "concept",
  "cheat_sheet",
  "code_snippet",
  "summary",
  "formula",
  "table",
  "qa",
  "fill_in_blank",
  "multiple_choice",
  "multiple_select",
  "true_false",
  "definition",
  "url"
]);

function clampString(val: unknown, maxLen: number, fallback = ""): string {
  const s = typeof val === "string" ? val : fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function clampNonEmptyString(val: unknown, maxLen: number, fallback: string): string {
  const raw = typeof val === "string" ? val.trim() : "";
  const s = raw.length > 0 ? (typeof val === "string" ? val : fallback) : fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function clampOptionalString(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== "string" || val.length === 0) return undefined;
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === "number" && Number.isFinite(val) ? val : fallback;
  return Math.min(max, Math.max(min, n));
}

function stripUndefinedDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (input && typeof input === "object" && !(input instanceof Date)) {
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype || proto === null) {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) {
          out[k] = stripUndefinedDeep(v);
        }
      }
      return out as T;
    }
  }
  return input;
}

export function toSafeFirestoreId(rawId: string, prefix = "doc"): string {
  const cleaned = String(rawId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  if (cleaned.length >= 1 && cleaned.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    return cleaned;
  }
  // Deterministic FNV-1a hash fallback for oversized or irregular IDs
  let hash = 2166136261;
  const source = String(rawId || `${prefix}_${Date.now()}`);
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(16).padStart(8, "0");
  const head = cleaned.slice(0, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${prefix}_${head ? `${head}_` : ""}${suffix}`.slice(0, 128);
}

function dataUrlToBytesAndMime(dataUrl: string): { mimeType: string; byteSize: number } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const cleanB64 = match[2].replace(/\s+/g, "");
  const byteSize = Math.floor((cleanB64.length * 3) / 4);
  return { mimeType, byteSize };
}

async function compressDataUrlForFirestore(dataUrl: string): Promise<string> {
  if (dataUrl.length <= 860_000) return dataUrl;
  if (typeof document === "undefined") return dataUrl.slice(0, 860_000);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode failed"));
      el.src = dataUrl;
    });
    const maxW = 960;
    const maxH = 720;
    const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth), maxH / Math.max(1, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.68, 0.52, 0.38]) {
      const candidate = canvas.toDataURL("image/jpeg", q);
      if (candidate.length <= 860_000) return candidate;
    }
    return canvas.toDataURL("image/jpeg", 0.32);
  } catch {
    return dataUrl;
  }
}

async function computeMediaIdFromDataUrl(dataUrl: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const bytes = new TextEncoder().encode(dataUrl);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hex = Array.from(new Uint8Array(digest))
        .slice(0, 12)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return `med_${hex}`;
    }
  } catch {
    // Fallback below
  }
  let h = 2166136261;
  for (let i = 0; i < dataUrl.length; i += Math.max(1, Math.floor(dataUrl.length / 512))) {
    h ^= dataUrl.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `med_${(h >>> 0).toString(16)}${dataUrl.length.toString(16)}`;
}

// Per-user diffing caches so unchanged documents aren't rewritten every sync
const knownDocsByUid = new Map<string, Set<string>>();
const lastHashesByUid = new Map<string, Map<string, string>>();
const savedMediaIdsByUid = new Map<string, Set<string>>();

function getUidDocSet(uid: string): Set<string> {
  let set = knownDocsByUid.get(uid);
  if (!set) {
    set = new Set<string>();
    knownDocsByUid.set(uid, set);
  }
  return set;
}

function getUidHashMap(uid: string): Map<string, string> {
  let map = lastHashesByUid.get(uid);
  if (!map) {
    map = new Map<string, string>();
    lastHashesByUid.set(uid, map);
  }
  return map;
}

function getUidMediaSet(uid: string): Set<string> {
  let set = savedMediaIdsByUid.get(uid);
  if (!set) {
    set = new Set<string>();
    savedMediaIdsByUid.set(uid, set);
  }
  return set;
}

export function clearFirestoreSyncCache(uid?: string) {
  if (uid) {
    knownDocsByUid.delete(uid);
    lastHashesByUid.delete(uid);
    savedMediaIdsByUid.delete(uid);
  } else {
    knownDocsByUid.clear();
    lastHashesByUid.clear();
    savedMediaIdsByUid.clear();
  }
}

export async function ensureParentWorkspaceDoc(
  uid: string,
  meta: {
    email: string;
    displayName?: string | null;
    coachPersona: "mentor" | "drill" | "data";
    autopilotMode?: AutopilotMode;
    autopilotPacing?: AutopilotPacing;
    activeCoachChatId?: string;
    availability?: AvailabilityWindow[];
    energyProfile?: UserEnergyProfile;
    burnoutLimits?: DailyBurnoutLimits;
    customTemplates?: any[];
  }
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, "users", uid);
  const known = getUidDocSet(uid);
  const hashes = getUidHashMap(uid);

  const mutableFields = stripUndefinedDeep({
    email: clampString(meta.email || auth.currentUser?.email || "user@example.com", 254, "user@example.com"),
    displayName: clampOptionalString(meta.displayName || auth.currentUser?.displayName || undefined, 120),
    coachPersona: ["mentor", "drill", "data"].includes(meta.coachPersona) ? meta.coachPersona : "mentor",
    autopilotMode: ["manual", "copilot_sentinel", "suggest_only", "full_autonomous"].includes(String(meta.autopilotMode))
      ? meta.autopilotMode!
      : "full_autonomous",
    autopilotPacing: ["gentle", "balanced", "aggressive"].includes(String(meta.autopilotPacing))
      ? meta.autopilotPacing!
      : "balanced",
    activeCoachChatId: clampOptionalString(meta.activeCoachChatId, 128),
    availability: Array.isArray(meta.availability) ? meta.availability.slice(0, 14) : undefined,
    energyProfile: meta.energyProfile,
    burnoutLimits: meta.burnoutLimits,
    customTemplates: Array.isArray(meta.customTemplates) ? meta.customTemplates.slice(0, 50) : undefined
  });

  const hash = JSON.stringify(mutableFields);
  if (known.has(path) && hashes.get(path) === hash) {
    return;
  }

  try {
    if (known.has(path)) {
      try {
        await updateDoc(ref, {
          ...mutableFields,
          updatedAt: serverTimestamp()
        });
        hashes.set(path, hash);
        return;
      } catch (err: any) {
        if (err?.code !== "not-found") {
          throw err;
        }
      }
    }

    const snap = await getDoc(ref);
    if (snap.exists()) {
      known.add(path);
      await updateDoc(ref, {
        ...mutableFields,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(ref, {
        ownerUid: uid,
        ...mutableFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      known.add(path);
    }
    hashes.set(path, hash);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveDataUrlToFirestoreMedia(
  uid: string,
  rawDataUrl: string,
  preferredMediaId?: string
): Promise<string | null> {
  if (!auth.currentUser || auth.currentUser.uid !== uid || !auth.currentUser.emailVerified) {
    return null;
  }

  const compactDataUrl = await compressDataUrlForFirestore(rawDataUrl);
  const meta = dataUrlToBytesAndMime(compactDataUrl);
  if (!meta || compactDataUrl.length > 900_000 || meta.byteSize > 700_000) {
    return null;
  }

  const rawId = preferredMediaId || (await computeMediaIdFromDataUrl(compactDataUrl));
  const mediaId = toSafeFirestoreId(rawId, "med");
  const savedSet = getUidMediaSet(uid);
  const docPath = `users/${uid}/media/${mediaId}`;

  if (savedSet.has(mediaId)) {
    return `fsimg://${mediaId}`;
  }

  try {
    // Media security rules enforce hasValidParentWorkspace(uid); guarantee parent /users/{uid} exists first
    const userDocPath = `users/${uid}`;
    if (!getUidDocSet(uid).has(userDocPath)) {
      await ensureParentWorkspaceDoc(uid, {
        email: auth.currentUser.email || "user@example.com",
        displayName: auth.currentUser.displayName,
        coachPersona: "mentor"
      });
    }

    const mediaRef = doc(db, "users", uid, "media", mediaId);
    const existingSnap = await getDoc(mediaRef);
    if (!existingSnap.exists()) {
      await setDoc(mediaRef, {
        mediaId,
        ownerUid: uid,
        mimeType: meta.mimeType.slice(0, 64),
        dataUrl: compactDataUrl,
        byteSize: Math.max(1, Math.min(700_000, meta.byteSize)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    savedSet.add(mediaId);
    getUidDocSet(uid).add(docPath);
    return `fsimg://${mediaId}`;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function fetchDataUrlFromFirestoreMedia(mediaRef: string): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  const mediaId = toSafeFirestoreId(mediaRef.replace(/^fsimg:\/\//, ""), "med");
  const path = `users/${currentUser.uid}/media/${mediaId}`;
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "media", mediaId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return typeof data?.dataUrl === "string" ? data.dataUrl : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function resolveNoteScreenshotsForFirestore(
  uid: string,
  screenshots: string[] | undefined
): Promise<string[] | undefined> {
  if (!Array.isArray(screenshots) || screenshots.length === 0) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of screenshots.slice(0, 24)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    let resolved = raw.trim();

    if (/^data:image\//i.test(resolved)) {
      const fsRef = await saveDataUrlToFirestoreMedia(uid, resolved);
      if (fsRef) resolved = fsRef;
    } else if (resolved.startsWith("/api/media/")) {
      const filePart = resolved.replace(/^\/api\/media\//, "").replace(/\.[^.]+$/, "");
      const candidateId = toSafeFirestoreId(filePart, "med");
      const savedSet = getUidMediaSet(uid);
      if (savedSet.has(candidateId)) {
        resolved = `fsimg://${candidateId}`;
      } else {
        try {
          const resp = await fetch(resolved);
          if (resp.ok) {
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Read error"));
              reader.onerror = () => reject(reader.error || new Error("Read error"));
              reader.readAsDataURL(blob);
            });
            const fsRef = await saveDataUrlToFirestoreMedia(uid, dataUrl, candidateId);
            if (fsRef) resolved = fsRef;
          }
        } catch {
          // Keep original ref if fetch fails
        }
      }
    }

    if (resolved.length <= 512 && !seen.has(resolved)) {
      seen.add(resolved);
      out.push(resolved);
    }
  }

  return out.length > 0 ? out : undefined;
}

async function upsertDocDiffed(
  uid: string,
  collectionName: string,
  docId: string,
  immutableFields: Record<string, any>,
  mutableFields: Record<string, any>
): Promise<void> {
  const path = `users/${uid}/${collectionName}/${docId}`;
  const known = getUidDocSet(uid);
  const hashes = getUidHashMap(uid);

  const cleanImmutable = stripUndefinedDeep(immutableFields);
  const cleanMutable = stripUndefinedDeep(mutableFields);
  const hash = JSON.stringify({ ...cleanImmutable, ...cleanMutable });

  if (known.has(path) && hashes.get(path) === hash) {
    return;
  }

  const ref = doc(db, "users", uid, collectionName, docId);
  try {
    if (known.has(path)) {
      try {
        await updateDoc(ref, {
          ...cleanMutable,
          updatedAt: serverTimestamp()
        });
        hashes.set(path, hash);
        return;
      } catch (err: any) {
        if (err?.code !== "not-found") {
          throw err;
        }
      }
    }

    await setDoc(ref, {
      ...cleanImmutable,
      ...cleanMutable,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    known.add(path);
    hashes.set(path, hash);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function deleteRemovedDocs(
  uid: string,
  collectionName: string,
  activeIds: Set<string>
): Promise<void> {
  const prefix = `users/${uid}/${collectionName}/`;
  const known = getUidDocSet(uid);
  const hashes = getUidHashMap(uid);

  const stalePaths: string[] = [];
  for (const path of known) {
    if (path.startsWith(prefix)) {
      const id = path.slice(prefix.length);
      if (!activeIds.has(id)) {
        stalePaths.push(path);
      }
    }
  }

  for (const path of stalePaths) {
    const id = path.slice(prefix.length);
    try {
      await deleteDoc(doc(db, "users", uid, collectionName, id));
      known.delete(path);
      hashes.delete(path);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

export async function loadUserWorkspaceFromFirestore(
  uid: string
): Promise<(FirestoreWorkspaceState & { email?: string; hasRemoteData: boolean }) | null> {
  const known = getUidDocSet(uid);
  const hashes = getUidHashMap(uid);

  const userPath = `users/${uid}`;
  let userSnapData: Record<string, any> | null = null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      known.add(userPath);
      userSnapData = snap.data();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!userSnapData) {
    return null;
  }

  const readSubcollection = async (name: string): Promise<Array<{ docId: string; data: Record<string, any> }>> => {
    const path = `users/${uid}/${name}`;
    try {
      const q = query(collection(db, "users", uid, name), where("ownerUid", "==", uid));
      const snap = await getDocs(q);
      const items: Array<{ docId: string; data: Record<string, any> }> = [];
      snap.forEach((docSnap) => {
        const docPath = `${path}/${docSnap.id}`;
        known.add(docPath);
        const data = docSnap.data();
        const { createdAt: _c, updatedAt: _u, ...rest } = data;
        hashes.set(docPath, JSON.stringify(rest));
        items.push({ docId: docSnap.id, data });
      });
      return items;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  };

  const [goalDocs, noteDocs, testDocs, flashcardDocs, eventDocs, notifDocs, chatDocs] =
    await Promise.all([
      readSubcollection("goals"),
      readSubcollection("notes"),
      readSubcollection("tests"),
      readSubcollection("flashcards"),
      readSubcollection("events"),
      readSubcollection("notifications"),
      readSubcollection("coachChats")
    ]);

  // Group notes, tests, and flashcards by goalId
  const notesByGoal = new Map<string, StudyArtifactNote[]>();
  for (const { data } of noteDocs) {
    const unwrappedRows = Array.isArray(data.tableRows)
      ? data.tableRows.map((row: any) => (Array.isArray(row?.cells) ? row.cells : Array.isArray(row) ? row : []))
      : undefined;
    const note: StudyArtifactNote = stripUndefinedDeep({
      id: data.id,
      title: data.title,
      category: data.category,
      content: data.content,
      tableHeaders: data.tableHeaders,
      tableRows: unwrappedRows,
      question: data.question,
      answer: data.answer,
      explanation: data.explanation,
      options: data.options,
      correctOptionIndex: data.correctOptionIndex,
      correctOptionIndices: data.correctOptionIndices,
      term: data.term,
      definition: data.definition,
      url: data.url,
      urlNotes: data.urlNotes,
      linkSubtype: data.linkSubtype,
      isReadingAssignment: data.isReadingAssignment,
      sourceFileName: data.sourceFileName,
      screenshots: data.screenshots,
      requiresLogin: data.requiresLogin,
      urlAccessNote: data.urlAccessNote,
      reviewCompleted: data.reviewCompleted,
      lastStudiedAt: data.lastStudiedAt,
      studyCount: data.studyCount,
      chapterId: data.chapterId,
      chapterTitle: data.chapterTitle,
      keyTerms: data.keyTerms,
      createdAt: data.clientCreatedAt || new Date().toISOString(),
      updatedAt: data.clientUpdatedAt || new Date().toISOString()
    });
    const list = notesByGoal.get(data.goalId) || [];
    list.push(note);
    notesByGoal.set(data.goalId, list);
  }

  const testsByGoal = new Map<string, KnowledgeTestArtifact[]>();
  for (const { data } of testDocs) {
    const test: KnowledgeTestArtifact = stripUndefinedDeep({
      id: data.id,
      title: data.title,
      chapterTitle: data.chapterTitle,
      sourceUrl: data.sourceUrl,
      sourceFileName: data.sourceFileName,
      generationMode: data.generationMode,
      questions: Array.isArray(data.questions) ? data.questions : [],
      completedAt: data.completedAt,
      lastScore: data.lastScore,
      lastScoreFraction: data.lastScoreFraction,
      attemptsCount: data.attemptsCount,
      createdAt: data.clientCreatedAt || new Date().toISOString()
    });
    const list = testsByGoal.get(data.goalId) || [];
    list.push(test);
    testsByGoal.set(data.goalId, list);
  }

  const cardsByGoal = new Map<string, FlashcardItem[]>();
  for (const { data } of flashcardDocs) {
    const card: FlashcardItem = stripUndefinedDeep({
      id: data.id,
      front: data.front,
      back: data.back,
      chapterTitle: data.chapterTitle,
      mastered: Boolean(data.mastered),
      lastReviewedAt: data.lastReviewedAt
    });
    const list = cardsByGoal.get(data.goalId) || [];
    list.push(card);
    cardsByGoal.set(data.goalId, list);
  }

  const goals: Goal[] = goalDocs.map(({ data }) => {
    const goalNotes = (notesByGoal.get(data.id) || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const goalTests = (testsByGoal.get(data.id) || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const goalCards = cardsByGoal.get(data.id) || [];
    const hasHub =
      Boolean(data.enableKnowledgeHub) ||
      goalNotes.length > 0 ||
      goalTests.length > 0 ||
      goalCards.length > 0;

    return stripUndefinedDeep({
      id: data.id,
      name: data.name,
      type: data.type,
      category: data.category,
      weeklyTarget: data.weeklyTarget,
      durationMinutes: data.durationMinutes,
      timePreference: data.timePreference,
      customTimeStart: data.customTimeStart,
      customTimeEnd: data.customTimeEnd,
      completedCount: data.completedCount,
      color: data.color,
      createdAt: data.clientCreatedAt || new Date().toISOString(),
      subtasks: data.subtasks,
      subSteps: data.subSteps,
      icon: data.icon,
      lastSessionNote: data.lastSessionNote,
      lastSessionNoteDate: data.lastSessionNoteDate,
      description: data.description,
      priority: data.priority,
      energyLevel: data.energyLevel,
      isPaused: data.isPaused,
      pauseReason: data.pauseReason,
      pauseUntil: data.pauseUntil,
      pausedAt: data.pausedAt,
      resourceLink: data.resourceLink,
      resourceLabel: data.resourceLabel,
      targetTotalHours: data.targetTotalHours,
      targetCompletionDate: data.targetCompletionDate,
      targetExamDate: data.targetExamDate,
      targetExamTitle: data.targetExamTitle,
      chapters: data.chapters,
      enableKnowledgeHub: data.enableKnowledgeHub,
      knowledgeHub: hasHub
        ? {
            notes: goalNotes,
            tests: goalTests,
            flashcards: goalCards,
            overallMasteryScore: typeof data.overallMasteryScore === "number" ? data.overallMasteryScore : 0,
            lastTestedAt: data.lastTestedAt
          }
        : undefined
    }) as Goal;
  });

  const isGoalCompleted = (g: Goal) => {
    const targetReached = (g.weeklyTarget || 0) > 0 && g.completedCount >= g.weeklyTarget;
    const allChaptersDone = Array.isArray(g.chapters) && g.chapters.length > 0 && g.chapters.every((c) => c.completed);
    return targetReached || allChaptersDone;
  };
  goals.sort((a, b) => {
    const compDiff = Number(isGoalCompleted(a)) - Number(isGoalCompleted(b));
    if (compDiff !== 0) return compDiff;
    const pausedDiff = Number(Boolean(a.isPaused)) - Number(Boolean(b.isPaused));
    if (pausedDiff !== 0) return pausedDiff;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const events: CalendarEvent[] = eventDocs.map(({ data }) =>
    stripUndefinedDeep({
      id: data.id,
      goalId: data.goalId,
      title: data.title,
      type: data.goalType || "study",
      start: data.start,
      end: data.end,
      completed: Boolean(data.completed),
      notes: data.notes,
      completionNote: data.completionNote,
      keyTakeaway: data.keyTakeaway,
      confidenceRating: data.confidenceRating,
      icon: data.icon,
      energyLevel: data.energyLevel,
      subtasks: data.subtasks,
      subSteps: data.subSteps,
      activeChapterId: data.activeChapterId,
      activeChapterTitle: data.activeChapterTitle,
      isBufferCatchUp: data.isBufferCatchUp,
      isShielded: data.isShielded
    }) as CalendarEvent
  );

  const notifications: AppNotification[] = notifDocs
    .map(({ data }) =>
      stripUndefinedDeep({
        id: data.id,
        title: data.title,
        message: data.message,
        timestamp: data.timestamp,
        read: Boolean(data.read),
        type: data.type
      }) as AppNotification
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const coachChatSessions: CoachChatSession[] = chatDocs
    .map(({ data }) =>
      stripUndefinedDeep({
        id: data.id,
        title: data.title,
        persona: data.persona,
        messages: Array.isArray(data.messages) ? data.messages : [],
        createdAt: data.clientCreatedAt || new Date().toISOString(),
        updatedAt: data.clientUpdatedAt || new Date().toISOString()
      }) as CoachChatSession
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    email: typeof userSnapData.email === "string" ? userSnapData.email : undefined,
    goals,
    events,
    availability: Array.isArray(userSnapData.availability) ? userSnapData.availability : [],
    notifications,
    coachChatSessions,
    activeCoachChatId:
      typeof userSnapData.activeCoachChatId === "string"
        ? userSnapData.activeCoachChatId
        : coachChatSessions[0]?.id || "chat_default",
    coachPersona: ["mentor", "drill", "data"].includes(userSnapData.coachPersona)
      ? userSnapData.coachPersona
      : "mentor",
    autopilotMode: userSnapData.autopilotMode,
    autopilotPacing: userSnapData.autopilotPacing,
    burnoutLimits: userSnapData.burnoutLimits,
    energyProfile: userSnapData.energyProfile,
    customTemplates: Array.isArray(userSnapData.customTemplates) ? userSnapData.customTemplates : undefined,
    hasRemoteData: goals.length > 0 || events.length > 0 || coachChatSessions.length > 0
  };
}

export async function syncWorkspaceToFirestore(
  user: User,
  payload: FirestoreSyncInput
): Promise<void> {
  if (!user || !user.uid || !user.emailVerified) return;
  const uid = user.uid;

  // 1. Ensure parent /users/{uid} workspace exists before any subcollection writes
  await ensureParentWorkspaceDoc(uid, {
    email: payload.email || user.email || "user@example.com",
    displayName: payload.displayName ?? user.displayName,
    coachPersona: payload.coachPersona,
    autopilotMode: payload.autopilotMode,
    autopilotPacing: payload.autopilotPacing,
    activeCoachChatId: payload.activeCoachChatId,
    availability: payload.availability,
    energyProfile: payload.energyProfile,
    burnoutLimits: payload.burnoutLimits,
    customTemplates: payload.customTemplates
  });

  // 2. Track active doc IDs per collection for clean deletion sync
  const activeGoalIds = new Set<string>();
  const activeNoteIds = new Set<string>();
  const activeTestIds = new Set<string>();
  const activeCardIds = new Set<string>();
  const activeEventIds = new Set<string>();
  const activeNotifIds = new Set<string>();
  const activeChatIds = new Set<string>();

  // 3. Goals + Knowledge Hub Notes/Tests/Flashcards/Media
  for (const goal of payload.goals) {
    const goalId = toSafeFirestoreId(goal.id, "goal");
    activeGoalIds.add(goalId);
    const hub = goal.knowledgeHub;

    await upsertDocDiffed(
      uid,
      "goals",
      goalId,
      { id: goalId, ownerUid: uid },
      {
        name: clampNonEmptyString(goal.name, 200, "Untitled Goal"),
        type: clampNonEmptyString(goal.type, 64, "study"),
        category: clampString(goal.category, 120, "General"),
        weeklyTarget: clampNumber(goal.weeklyTarget, 0, 50, 3),
        durationMinutes: clampNumber(goal.durationMinutes, 1, 720, 45),
        timePreference: clampNonEmptyString(goal.timePreference, 64, "any"),
        completedCount: clampNumber(goal.completedCount, 0, 100000, 0),
        color: clampNonEmptyString(goal.color, 64, "indigo"),
        customTimeStart: clampOptionalString(goal.customTimeStart, 16),
        customTimeEnd: clampOptionalString(goal.customTimeEnd, 16),
        subtasks: Array.isArray(goal.subtasks) ? goal.subtasks.slice(0, 100) : undefined,
        subSteps: Array.isArray(goal.subSteps) ? goal.subSteps.slice(0, 100) : undefined,
        icon: clampOptionalString(goal.icon, 64),
        lastSessionNote: clampOptionalString(goal.lastSessionNote, 4000),
        lastSessionNoteDate: clampOptionalString(goal.lastSessionNoteDate, 64),
        description: clampOptionalString(goal.description, 4000),
        priority: clampOptionalString(goal.priority, 32),
        energyLevel: clampOptionalString(goal.energyLevel, 32),
        isPaused: typeof goal.isPaused === "boolean" ? goal.isPaused : undefined,
        pauseReason: clampOptionalString(goal.pauseReason, 500),
        pauseUntil: clampOptionalString(goal.pauseUntil, 64),
        pausedAt: clampOptionalString(goal.pausedAt, 64),
        resourceLink: clampOptionalString(goal.resourceLink, 2000),
        resourceLabel: clampOptionalString(goal.resourceLabel, 120),
        targetTotalHours:
          typeof goal.targetTotalHours === "number" && Number.isFinite(goal.targetTotalHours)
            ? goal.targetTotalHours
            : undefined,
        targetCompletionDate: clampOptionalString(goal.targetCompletionDate, 64),
        targetExamDate: clampOptionalString(goal.targetExamDate, 64),
        targetExamTitle: clampOptionalString(goal.targetExamTitle, 200),
        chapters: Array.isArray(goal.chapters) ? goal.chapters.slice(0, 100) : undefined,
        enableKnowledgeHub: typeof goal.enableKnowledgeHub === "boolean" ? goal.enableKnowledgeHub : undefined,
        overallMasteryScore:
          typeof hub?.overallMasteryScore === "number" && Number.isFinite(hub.overallMasteryScore)
            ? hub.overallMasteryScore
            : undefined,
        lastTestedAt: clampOptionalString(hub?.lastTestedAt, 64),
        clientCreatedAt: clampString(goal.createdAt, 64, new Date().toISOString())
      }
    );

    if (hub) {
      for (const note of hub.notes || []) {
        const noteId = toSafeFirestoreId(note.id, "note");
        activeNoteIds.add(noteId);
        const safeScreenshots = await resolveNoteScreenshotsForFirestore(uid, note.screenshots);
        const wrappedTableRows = Array.isArray(note.tableRows)
          ? note.tableRows.slice(0, 200).map((row) => ({
              cells: Array.isArray(row) ? row.map((cell) => clampString(cell, 2000)) : []
            }))
          : undefined;
        const safeCategory = VALID_NOTE_CATEGORIES.has(note.category) ? note.category : "summary";

        await upsertDocDiffed(
          uid,
          "notes",
          noteId,
          { id: noteId, ownerUid: uid },
          {
            goalId,
            title: clampNonEmptyString(note.title, 500, "Study Note"),
            category: safeCategory,
            content: clampString(note.content, 120000, ""),
            tableHeaders: Array.isArray(note.tableHeaders) ? note.tableHeaders.slice(0, 20) : undefined,
            tableRows: wrappedTableRows,
            question: clampOptionalString(note.question, 4000),
            answer: clampOptionalString(note.answer, 12000),
            explanation: clampOptionalString(note.explanation, 8000),
            options: Array.isArray(note.options) ? note.options.slice(0, 12) : undefined,
            correctOptionIndex:
              typeof note.correctOptionIndex === "number" && Number.isFinite(note.correctOptionIndex)
                ? note.correctOptionIndex
                : undefined,
            correctOptionIndices: Array.isArray(note.correctOptionIndices)
              ? note.correctOptionIndices.slice(0, 12)
              : undefined,
            term: clampOptionalString(note.term, 500),
            definition: clampOptionalString(note.definition, 8000),
            url: clampOptionalString(note.url, 2000),
            urlNotes: clampOptionalString(note.urlNotes, 12000),
            linkSubtype: clampOptionalString(note.linkSubtype, 64),
            isReadingAssignment: typeof note.isReadingAssignment === "boolean" ? note.isReadingAssignment : undefined,
            sourceFileName: clampOptionalString(note.sourceFileName, 300),
            screenshots: safeScreenshots,
            requiresLogin: typeof note.requiresLogin === "boolean" ? note.requiresLogin : undefined,
            urlAccessNote: clampOptionalString(note.urlAccessNote, 1000),
            reviewCompleted: typeof note.reviewCompleted === "boolean" ? note.reviewCompleted : undefined,
            lastStudiedAt: clampOptionalString(note.lastStudiedAt, 64),
            studyCount:
              typeof note.studyCount === "number" && Number.isFinite(note.studyCount)
                ? note.studyCount
                : undefined,
            chapterId: clampOptionalString(note.chapterId, 128),
            chapterTitle: clampOptionalString(note.chapterTitle, 300),
            keyTerms: Array.isArray(note.keyTerms)
              ? note.keyTerms.slice(0, 50).map((t) => clampString(t, 120)).filter(Boolean)
              : undefined,
            clientCreatedAt: clampString(note.createdAt, 64, new Date().toISOString()),
            clientUpdatedAt: clampString(note.updatedAt, 64, new Date().toISOString())
          }
        );
      }

      for (const test of hub.tests || []) {
        const testId = toSafeFirestoreId(test.id, "test");
        activeTestIds.add(testId);
        await upsertDocDiffed(
          uid,
          "tests",
          testId,
          { id: testId, ownerUid: uid },
          {
            goalId,
            title: clampNonEmptyString(test.title, 300, "Practice Test"),
            chapterTitle: clampOptionalString(test.chapterTitle, 300),
            sourceUrl: clampOptionalString(test.sourceUrl, 2000),
            sourceFileName: clampOptionalString(test.sourceFileName, 300),
            generationMode: clampOptionalString(test.generationMode, 32),
            questions: Array.isArray(test.questions) ? test.questions.slice(0, 100) : [],
            completedAt: clampOptionalString(test.completedAt, 64),
            lastScore:
              typeof test.lastScore === "number" && Number.isFinite(test.lastScore) ? test.lastScore : undefined,
            lastScoreFraction: clampOptionalString(test.lastScoreFraction, 32),
            attemptsCount:
              typeof test.attemptsCount === "number" && Number.isFinite(test.attemptsCount)
                ? test.attemptsCount
                : undefined,
            clientCreatedAt: clampString(test.createdAt, 64, new Date().toISOString())
          }
        );
      }

      for (const card of hub.flashcards || []) {
        const cardId = toSafeFirestoreId(card.id, "card");
        activeCardIds.add(cardId);
        await upsertDocDiffed(
          uid,
          "flashcards",
          cardId,
          { id: cardId, ownerUid: uid },
          {
            goalId,
            front: clampNonEmptyString(card.front, 2000, "Prompt"),
            back: clampNonEmptyString(card.back, 8000, "Answer"),
            chapterTitle: clampOptionalString(card.chapterTitle, 300),
            mastered: Boolean(card.mastered),
            lastReviewedAt: clampOptionalString(card.lastReviewedAt, 64)
          }
        );
      }
    }
  }

  // 4. Calendar Events
  for (const evt of payload.events) {
    const eventId = toSafeFirestoreId(evt.id, "evt");
    activeEventIds.add(eventId);
    await upsertDocDiffed(
      uid,
      "events",
      eventId,
      { id: eventId, ownerUid: uid },
      {
        goalId: clampOptionalString(evt.goalId, 128),
        title: clampNonEmptyString(evt.title, 300, "Session"),
        start: clampNonEmptyString(evt.start, 64, new Date().toISOString()),
        end: clampNonEmptyString(evt.end, 64, new Date().toISOString()),
        completed: Boolean(evt.completed),
        goalType: clampNonEmptyString(evt.type, 64, "study"),
        subtasks: Array.isArray(evt.subtasks) ? evt.subtasks.slice(0, 100) : undefined,
        subSteps: Array.isArray(evt.subSteps) ? evt.subSteps.slice(0, 100) : undefined,
        notes: clampOptionalString(evt.notes, 4000),
        completionNote: clampOptionalString(evt.completionNote, 4000),
        keyTakeaway: clampOptionalString(evt.keyTakeaway, 4000),
        confidenceRating: clampOptionalString(evt.confidenceRating, 32),
        icon: clampOptionalString(evt.icon, 64),
        energyLevel: clampOptionalString(evt.energyLevel, 32),
        activeChapterId: clampOptionalString(evt.activeChapterId, 128),
        activeChapterTitle: clampOptionalString(evt.activeChapterTitle, 300),
        isBufferCatchUp: typeof evt.isBufferCatchUp === "boolean" ? evt.isBufferCatchUp : undefined,
        isShielded: typeof evt.isShielded === "boolean" ? evt.isShielded : undefined
      }
    );
  }

  // 5. Notifications (keep latest 100)
  for (const notif of (payload.notifications || []).slice(0, 100)) {
    const notifId = toSafeFirestoreId(notif.id, "notif");
    activeNotifIds.add(notifId);
    await upsertDocDiffed(
      uid,
      "notifications",
      notifId,
      { id: notifId, ownerUid: uid },
      {
        title: clampNonEmptyString(notif.title, 300, "Notification"),
        message: clampString(notif.message, 2000, ""),
        timestamp: clampNonEmptyString(notif.timestamp, 64, new Date().toISOString()),
        read: Boolean(notif.read),
        type: clampNonEmptyString(notif.type, 64, "sync")
      }
    );
  }

  // 6. Coach Chat Sessions
  for (const chat of payload.coachChatSessions || []) {
    const chatId = toSafeFirestoreId(chat.id, "chat");
    activeChatIds.add(chatId);
    await upsertDocDiffed(
      uid,
      "coachChats",
      chatId,
      { id: chatId, ownerUid: uid },
      {
        title: clampNonEmptyString(chat.title, 200, "Coaching Chat"),
        persona: clampOptionalString(chat.persona, 32),
        messages: Array.isArray(chat.messages) ? chat.messages.slice(-200) : [],
        clientCreatedAt: clampString(chat.createdAt, 64, new Date().toISOString()),
        clientUpdatedAt: clampString(chat.updatedAt, 64, new Date().toISOString())
      }
    );
  }

  // 7. Delete removed items across collections
  await Promise.all([
    deleteRemovedDocs(uid, "goals", activeGoalIds),
    deleteRemovedDocs(uid, "notes", activeNoteIds),
    deleteRemovedDocs(uid, "tests", activeTestIds),
    deleteRemovedDocs(uid, "flashcards", activeCardIds),
    deleteRemovedDocs(uid, "events", activeEventIds),
    deleteRemovedDocs(uid, "notifications", activeNotifIds),
    deleteRemovedDocs(uid, "coachChats", activeChatIds)
  ]);
}
