import type { Goal, StudyArtifactNote } from "../types";
import { auth } from "./firebase";
import { fetchDataUrlFromFirestoreMedia, saveDataUrlToFirestoreMedia } from "./firestoreSync";

const IDB_NAME = "study_media_v1";
const IDB_STORE = "images";
const IDB_VERSION = 1;

interface StoredMediaRecord {
  key: string;
  blob: Blob;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openMediaDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
    if (!match) return null;
    const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
    const base64 = match[2].replace(/\s+/g, "");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not convert blob to data URL."));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed reading blob."));
    reader.readAsDataURL(blob);
  });
}

function mimeToExtension(mime: string): string {
  const clean = mime.toLowerCase();
  if (clean.includes("png")) return "png";
  if (clean.includes("webp")) return "webp";
  if (clean.includes("gif")) return "gif";
  if (clean.includes("bmp")) return "bmp";
  if (clean.includes("avif")) return "avif";
  return "jpg";
}

async function computeBlobKey(blob: Blob): Promise<string> {
  const ext = mimeToExtension(blob.type || "image/jpeg");
  try {
    if (typeof crypto !== "undefined" && crypto.subtle && typeof blob.arrayBuffer === "function") {
      const buf = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const hex = Array.from(new Uint8Array(digest))
        .slice(0, 12)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return `med_${hex}.${ext}`;
    }
  } catch {
    // Fallback below
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `med_${Date.now().toString(16)}${rand}.${ext}`;
}

export async function saveBlobToIndexedDB(key: string, blob: Blob): Promise<boolean> {
  const db = await openMediaDatabase();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const record: StoredMediaRecord = {
        key,
        blob,
        createdAt: Date.now()
      };
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getBlobFromIndexedDB(key: string): Promise<Blob | null> {
  const db = await openMediaDatabase();
  if (!db) return null;
  return new Promise<Blob | null>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const res = req.result as StoredMediaRecord | undefined;
        resolve(res?.blob || null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function uploadDataUrlToServerMedia(dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch("/api/media/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl })
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data && typeof data.url === "string" && data.url.startsWith("/api/media/")) {
      return data.url;
    }
    return null;
  } catch {
    return null;
  }
}

export function isStoredMediaRef(src: string): boolean {
  return src.startsWith("/api/media/") || src.startsWith("idb://") || src.startsWith("fsimg://");
}

/**
 * Resolves a stored media reference (`fsimg://...` or `idb://...` or `/api/media/...`)
 * into an IndexedDB Blob, downloading from Firestore on-demand for cross-device sync.
 */
export async function resolveMediaBlobWithCloudFallback(src: string): Promise<Blob | null> {
  const cached = await getBlobFromIndexedDB(src);
  if (cached) return cached;

  if (src.startsWith("fsimg://")) {
    const dataUrl = await fetchDataUrlFromFirestoreMedia(src);
    if (dataUrl) {
      const blob = dataUrlToBlob(dataUrl);
      if (blob) {
        await saveBlobToIndexedDB(src, blob);
        return blob;
      }
    }
  }
  return null;
}

/**
 * Stores a captured/pasted image outside localStorage and JSON payloads:
 * - Saves to Firestore `/users/{uid}/media/{mediaId}` (`fsimg://<id>`) when signed in for cross-device sync
 * - Saves to dedicated server storage (`/api/media/<id>.<ext>`)
 * - Caches the binary Blob in browser IndexedDB (`study_media_v1`) for instant offline loads
 */
export async function persistImageAsset(src: string): Promise<string> {
  if (!src) return src;
  const trimmed = src.trim();
  const signedInUid = auth.currentUser?.emailVerified ? auth.currentUser.uid : null;

  if (trimmed.startsWith("fsimg://")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("/api/media/")) {
    if (signedInUid) {
      try {
        const cachedBlob = await getBlobFromIndexedDB(trimmed);
        let dataUrl: string | null = cachedBlob ? await blobToDataUrl(cachedBlob) : null;
        if (!dataUrl) {
          const resp = await fetch(trimmed);
          if (resp.ok) {
            const b = await resp.blob();
            dataUrl = await blobToDataUrl(b);
          }
        }
        if (dataUrl) {
          const fileStem = trimmed.replace(/^\/api\/media\//, "").replace(/\.[^.]+$/, "");
          const fsRef = await saveDataUrlToFirestoreMedia(signedInUid, dataUrl, fileStem);
          if (fsRef) {
            const blob = dataUrlToBlob(dataUrl);
            if (blob) await saveBlobToIndexedDB(fsRef, blob);
            return fsRef;
          }
        }
      } catch {
        // Keep /api/media/ ref if conversion fails
      }
    }
    return trimmed;
  }

  if (trimmed.startsWith("idb://")) {
    const blob = await getBlobFromIndexedDB(trimmed);
    if (!blob) return trimmed;
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (signedInUid) {
        const fsRef = await saveDataUrlToFirestoreMedia(signedInUid, dataUrl);
        if (fsRef) {
          await saveBlobToIndexedDB(fsRef, blob);
          return fsRef;
        }
      }
      const serverUrl = await uploadDataUrlToServerMedia(dataUrl);
      if (serverUrl) {
        await saveBlobToIndexedDB(serverUrl, blob);
        return serverUrl;
      }
    } catch {
      // Remain on idb:// handle if offline
    }
    return trimmed;
  }

  if (/^data:image\//i.test(trimmed)) {
    const blob = dataUrlToBlob(trimmed);
    if (signedInUid) {
      try {
        const fsRef = await saveDataUrlToFirestoreMedia(signedInUid, trimmed);
        if (fsRef) {
          if (blob) await saveBlobToIndexedDB(fsRef, blob);
          return fsRef;
        }
      } catch {
        // Fall through to server / IndexedDB fallback
      }
    }
    const serverUrl = await uploadDataUrlToServerMedia(trimmed);
    if (serverUrl) {
      if (blob) {
        await saveBlobToIndexedDB(serverUrl, blob);
      }
      return serverUrl;
    }
    if (blob) {
      const fallbackFileName = await computeBlobKey(blob);
      const idbKey = `idb://${fallbackFileName}`;
      const saved = await saveBlobToIndexedDB(idbKey, blob);
      if (saved) return idbKey;
    }
  }

  return trimmed;
}

export async function persistImageAssets(srcs: string[]): Promise<string[]> {
  if (!Array.isArray(srcs) || srcs.length === 0) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  const CONCURRENCY = 4;

  for (let i = 0; i < srcs.length; i += CONCURRENCY) {
    const chunk = srcs.slice(i, i + CONCURRENCY);
    const persistedChunk = await Promise.all(chunk.map((item) => persistImageAsset(item)));
    for (const url of persistedChunk) {
      if (url && !seen.has(url)) {
        seen.add(url);
        results.push(url);
      }
    }
  }
  return results;
}

export function goalsHaveUnmigratedMedia(goals: Goal[]): boolean {
  const signedIn = Boolean(auth.currentUser?.emailVerified);
  for (const goal of goals) {
    const notes = goal.knowledgeHub?.notes;
    if (!Array.isArray(notes)) continue;
    for (const note of notes) {
      if (!Array.isArray(note.screenshots)) continue;
      for (const src of note.screenshots) {
        if (
          typeof src === "string" &&
          (/^data:image\//i.test(src) || src.startsWith("idb://") || (signedIn && src.startsWith("/api/media/")))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export async function offloadGoalMediaDataUrls(
  goals: Goal[]
): Promise<{ goals: Goal[]; migratedCount: number }> {
  const signedIn = Boolean(auth.currentUser?.emailVerified);
  let migratedCount = 0;
  let anyGoalChanged = false;

  const nextGoals = await Promise.all(
    goals.map(async (goal) => {
      const notes = goal.knowledgeHub?.notes;
      if (!Array.isArray(notes) || notes.length === 0) return goal;

      let goalChanged = false;
      const nextNotes: StudyArtifactNote[] = await Promise.all(
        notes.map(async (note) => {
          if (!Array.isArray(note.screenshots) || note.screenshots.length === 0) return note;
          const needsOffload = note.screenshots.some(
            (s) =>
              typeof s === "string" &&
              (/^data:image\//i.test(s) || s.startsWith("idb://") || (signedIn && s.startsWith("/api/media/")))
          );
          if (!needsOffload) return note;

          const nextScreenshots = await persistImageAssets(note.screenshots);
          const diff =
            nextScreenshots.length !== note.screenshots.length ||
            nextScreenshots.some((val, idx) => val !== note.screenshots![idx]);
          if (diff) {
            goalChanged = true;
            anyGoalChanged = true;
            migratedCount += note.screenshots.filter(
              (s) => /^data:image\//i.test(s) || s.startsWith("idb://") || (signedIn && s.startsWith("/api/media/"))
            ).length;
            return {
              ...note,
              screenshots: nextScreenshots
            };
          }
          return note;
        })
      );

      if (!goalChanged || !goal.knowledgeHub) return goal;
      return {
        ...goal,
        knowledgeHub: {
          ...goal.knowledgeHub,
          notes: nextNotes
        }
      };
    })
  );

  return {
    goals: anyGoalChanged ? nextGoals : goals,
    migratedCount
  };
}
