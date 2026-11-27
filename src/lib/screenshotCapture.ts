import type React from "react";
import { persistImageAssets } from "./mediaStorage";

export const MAX_NOTE_IMAGES = 24;

const MAX_SCREENSHOT_WIDTH = 1152;
const MAX_SCREENSHOT_HEIGHT = 864;
const JPEG_QUALITY = 0.78;

const COMPACT_IMAGE_WIDTH = 960;
const COMPACT_IMAGE_HEIGHT = 720;
const COMPACT_JPEG_QUALITY = 0.7;

interface DrawImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  background?: string;
}

function drawScaledToJpegDataUrl(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  options?: DrawImageOptions
): string {
  const maxW = options?.maxWidth ?? MAX_SCREENSHOT_WIDTH;
  const maxH = options?.maxHeight ?? MAX_SCREENSHOT_HEIGHT;
  const quality = options?.quality ?? JPEG_QUALITY;
  const bg = options?.background ?? "#0b0e18";

  const safeW = Math.max(1, srcWidth);
  const safeH = Math.max(1, srcHeight);
  const scale = Math.min(1, maxW / safeW, maxH / safeH);
  const targetW = Math.max(1, Math.round(safeW * scale));
  const targetH = Math.max(1, Math.round(safeH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not initialize image canvas.");
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", quality);
}

export interface ScreenshotCaptureResult {
  dataUrl?: string;
  reason?: "cancelled" | "blocked" | "unsupported" | "error";
  error?: string;
}

export async function captureScreenScreenshot(): Promise<ScreenshotCaptureResult> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== "function"
  ) {
    return {
      reason: "unsupported",
      error: "Direct capture isn't supported here. Snip with Win+Shift+S (Windows) or Cmd+Shift+4 (Mac), then press Ctrl+V to paste—or attach an image."
    };
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Timed out waiting for screen frame.")), 5000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Failed to load screen stream."));
      };
    });

    await video.play();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    if (!video.videoWidth || !video.videoHeight) {
      return {
        reason: "error",
        error: "Captured frame was empty. Snip with Win+Shift+S / Cmd+Shift+4 then press Ctrl+V, or attach an image."
      };
    }

    const dataUrl = drawScaledToJpegDataUrl(video, video.videoWidth, video.videoHeight, {
      background: "#0b0e18"
    });
    video.srcObject = null;
    return { dataUrl };
  } catch (err: any) {
    const name = String(err?.name || "");
    const msg = String(err?.message || "").toLowerCase();
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      if (msg.includes("policy") || msg.includes("permission") || msg.includes("disallowed") || msg.includes("iframe")) {
        return {
          reason: "blocked",
          error: "Screen capture is blocked by the preview frame. Snip with Win+Shift+S (Win) or Cmd+Shift+4 (Mac) and press Ctrl+V to paste—or attach an image."
        };
      }
      return {
        reason: "cancelled",
        error: "Screen capture cancelled. You can also snip with Win+Shift+S / Cmd+Shift+4 and press Ctrl+V to paste."
      };
    }
    return {
      reason: "error",
      error: "Could not capture screen. Snip with Win+Shift+S / Cmd+Shift+4 and press Ctrl+V to paste, or attach an image."
    };
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }
  }
}

export async function readImageFileAsDataUrl(
  file: File,
  options?: { compact?: boolean }
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file (PNG, JPG, WebP).");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image."));
      el.src = objectUrl;
    });
    return drawScaledToJpegDataUrl(img, img.naturalWidth || img.width, img.naturalHeight || img.height, {
      maxWidth: options?.compact ? COMPACT_IMAGE_WIDTH : MAX_SCREENSHOT_WIDTH,
      maxHeight: options?.compact ? COMPACT_IMAGE_HEIGHT : MAX_SCREENSHOT_HEIGHT,
      quality: options?.compact ? COMPACT_JPEG_QUALITY : JPEG_QUALITY,
      background: "#ffffff"
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressDataUrlToJpeg(
  dataUrl: string,
  compact = false
): Promise<string | null> {
  if (!/^data:image\//i.test(dataUrl)) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image data URI"));
      el.src = dataUrl;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    // Skip 1x1 / 2x2 tracking pixels or spacer gifs
    if (w <= 2 && h <= 2) return null;

    return drawScaledToJpegDataUrl(img, w, h, {
      maxWidth: compact ? COMPACT_IMAGE_WIDTH : MAX_SCREENSHOT_WIDTH,
      maxHeight: compact ? COMPACT_IMAGE_HEIGHT : MAX_SCREENSHOT_HEIGHT,
      quality: compact ? COMPACT_JPEG_QUALITY : JPEG_QUALITY,
      background: "#ffffff"
    });
  } catch {
    // Keep compact raster data URL as-is if canvas decode fails, skip huge/corrupt blobs
    if (dataUrl.length <= 250000 && /^data:image\/(?:png|jpeg|jpg|webp|gif|bmp|avif);base64,/i.test(dataUrl)) {
      return dataUrl;
    }
    return null;
  }
}

function isSafePublicImageSrc(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function fetchImageUrlAsStoredSrc(
  url: string,
  compact = false
): Promise<string | null> {
  if (!isSafePublicImageSrc(url)) return null;
  try {
    const res = await fetch("/api/coach/proxy-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data.dataUrl === "string" && data.dataUrl.startsWith("data:image/")) {
        const compressed = await compressDataUrlToJpeg(data.dataUrl, compact);
        return compressed || data.dataUrl;
      }
    }
  } catch {
    // Fall back to direct URL below if reachable in browser
  }
  // If remote image could not be proxied (e.g. auth cookie required in browser), keep safe public URL
  return url;
}

const INLINE_DATA_IMAGE_REGEX = /data:image\/(?:png|jpeg|jpg|webp|gif|bmp|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]{80,}/gi;

export function stripInlineBase64ImagesFromText(rawText: string): {
  cleanedText: string;
  extractedDataUrls: string[];
  hadInlineBase64: boolean;
} {
  if (!rawText) {
    return { cleanedText: "", extractedDataUrls: [], hadInlineBase64: false };
  }
  const extractedDataUrls: string[] = [];
  let imageCounter = 0;

  // First clean markdown ![alt](data:image/...) patterns cleanly
  let cleaned = rawText.replace(
    /!\[([^\]]*)\]\((data:image\/(?:png|jpeg|jpg|webp|gif|bmp|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]{80,})\)/gi,
    (_full, alt: string, dataUri: string) => {
      const compactUri = dataUri.replace(/\s+/g, "");
      extractedDataUrls.push(compactUri);
      imageCounter += 1;
      const cleanAlt = alt.trim();
      return cleanAlt ? `[Image ${imageCounter}: ${cleanAlt}]` : `[Image ${imageCounter}]`;
    }
  );

  // Clean HTML <img ... src="data:image/..."> patterns
  cleaned = cleaned.replace(
    /<img\b[^>]*\bsrc\s*=\s*(["'])(data:image\/(?:png|jpeg|jpg|webp|gif|bmp|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]{80,})\1[^>]*>/gi,
    (_full, _quote: string, dataUri: string) => {
      const compactUri = dataUri.replace(/\s+/g, "");
      extractedDataUrls.push(compactUri);
      imageCounter += 1;
      return `[Image ${imageCounter}]`;
    }
  );

  // Clean any remaining bare base64 data:image/... URIs
  cleaned = cleaned.replace(INLINE_DATA_IMAGE_REGEX, (match) => {
    const compactUri = match.replace(/\s+/g, "");
    extractedDataUrls.push(compactUri);
    imageCounter += 1;
    return `[Image ${imageCounter}]`;
  });

  return {
    cleanedText: cleaned,
    extractedDataUrls,
    hadInlineBase64: extractedDataUrls.length > 0
  };
}

function extractImageCandidatesFromHtml(html: string): string[] {
  if (!html || typeof DOMParser === "undefined") return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const imgs = Array.from(doc.querySelectorAll("img"));
    const candidates: string[] = [];
    for (const img of imgs) {
      const widthAttr = Number(img.getAttribute("width"));
      const heightAttr = Number(img.getAttribute("height"));
      if ((widthAttr > 0 && widthAttr <= 2) || (heightAttr > 0 && heightAttr <= 2)) {
        continue;
      }
      const rawSrc =
        img.getAttribute("src")?.trim() ||
        img.getAttribute("data-src")?.trim() ||
        img.getAttribute("data-original-src")?.trim() ||
        "";
      if (!rawSrc) continue;
      if (/^data:image\//i.test(rawSrc) || isSafePublicImageSrc(rawSrc)) {
        candidates.push(rawSrc);
      }
    }
    return candidates;
  } catch {
    return [];
  }
}

function extractImageCandidatesFromPlainText(plainText: string): string[] {
  if (!plainText) return [];
  const candidates: string[] = [];

  // Markdown images: ![alt](url)
  const mdRegex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdRegex.exec(plainText)) !== null) {
    const src = (mdMatch[1] || "").trim();
    if (/^data:image\//i.test(src) || isSafePublicImageSrc(src)) {
      candidates.push(src);
    }
  }

  // Raw HTML <img src="..."> inside plain text
  const htmlTagRegex = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = htmlTagRegex.exec(plainText)) !== null) {
    const src = (tagMatch[2] || "").trim();
    if (/^data:image\//i.test(src) || isSafePublicImageSrc(src)) {
      candidates.push(src);
    }
  }

  // Bare inline data URIs
  const base64Regex = new RegExp(INLINE_DATA_IMAGE_REGEX.source, "gi");
  let bMatch: RegExpExecArray | null;
  while ((bMatch = base64Regex.exec(plainText)) !== null) {
    candidates.push(bMatch[0].replace(/\s+/g, ""));
  }

  return candidates;
}

export function insertTextIntoFocusedControl(
  target: EventTarget | null,
  textToInsert: string
): boolean {
  if (
    !(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) ||
    target.readOnly ||
    target.disabled
  ) {
    return false;
  }
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  const nextValue = `${target.value.slice(0, start)}${textToInsert}${target.value.slice(end)}`;
  const nextCursor = start + textToInsert.length;

  const proto = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(target, nextValue);
  } else {
    target.value = nextValue;
  }
  target.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => {
    try {
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
    } catch {}
  });
  return true;
}

export interface ClipboardPasteSnapshot {
  plainText: string;
  htmlText: string;
  imageFiles: File[];
  htmlCandidates: string[];
  textCandidates: string[];
  hasText: boolean;
  hasPotentialImages: boolean;
}

/**
 * Synchronously reads clipboard items, files, HTML, and plain text before any await
 * (browsers clear DataTransfer after the synchronous paste tick completes).
 */
export function captureClipboardPasteSnapshot(
  e: ClipboardEvent | React.ClipboardEvent
): ClipboardPasteSnapshot {
  const clipboard = e.clipboardData;
  const plainText = clipboard?.getData("text/plain") || "";
  const htmlText = clipboard?.getData("text/html") || "";

  const imageFiles: File[] = [];
  const seenFileKeys = new Set<string>();

  const addFile = (f: File | null | undefined) => {
    if (!f || !f.type || !f.type.startsWith("image/")) return;
    const key = `${f.name}_${f.size}_${f.type}`;
    if (!seenFileKeys.has(key)) {
      seenFileKeys.add(key);
      imageFiles.push(f);
    }
  };

  if (clipboard?.items) {
    for (let i = 0; i < clipboard.items.length; i += 1) {
      const item = clipboard.items[i];
      if (item && item.type && item.type.startsWith("image/")) {
        addFile(item.getAsFile());
      }
    }
  }
  if (clipboard?.files) {
    for (let i = 0; i < clipboard.files.length; i += 1) {
      addFile(clipboard.files[i]);
    }
  }

  const htmlCandidates = extractImageCandidatesFromHtml(htmlText);
  const textCandidates = extractImageCandidatesFromPlainText(plainText);

  // If user pastes raw Markdown/HTML plain text containing massive base64 blobs into a text control,
  // clean out the base64 strings while preserving the readable text and storing the images cleanly.
  const base64Check = stripInlineBase64ImagesFromText(plainText);
  if (base64Check.hadInlineBase64 && (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
    const inserted = insertTextIntoFocusedControl(e.target, base64Check.cleanedText);
    if (inserted) {
      e.preventDefault();
    }
  } else if (!plainText.trim() && imageFiles.length > 0 && htmlCandidates.length === 0) {
    // Pure image snip/paste (Win+Shift+S / Cmd+Shift+4 / Copy Image): keep text fields clean
    e.preventDefault();
  }

  return {
    plainText,
    htmlText,
    imageFiles,
    htmlCandidates,
    textCandidates,
    hasText: plainText.trim().length > 0,
    hasPotentialImages:
      imageFiles.length > 0 || htmlCandidates.length > 0 || textCandidates.length > 0
  };
}

export async function extractImagesFromClipboardSnapshot(
  snapshot: ClipboardPasteSnapshot,
  maxImages = MAX_NOTE_IMAGES
): Promise<string[]> {
  if (!snapshot.hasPotentialImages || maxImages <= 0) return [];

  const seenUrls = new Set<string>();
  const rawSrcCandidates: string[] = [];

  for (const src of [...snapshot.htmlCandidates, ...snapshot.textCandidates]) {
    if (!seenUrls.has(src)) {
      seenUrls.add(src);
      rawSrcCandidates.push(src);
    }
  }

  const totalExpected = rawSrcCandidates.length + snapshot.imageFiles.length;
  const compact = totalExpected > 2;
  const resolved: string[] = [];
  const dedupedOutput = new Set<string>();

  const pushUnique = (imgSrc: string | null) => {
    if (!imgSrc) return;
    if (!dedupedOutput.has(imgSrc)) {
      dedupedOutput.add(imgSrc);
      resolved.push(imgSrc);
    }
  };

  // When pasting pure single image from a webpage, browsers provide both imageFile and html <img>;
  // prefer the direct clipboard binary file first if plainText is empty so we preserve exact pixels without network calls.
  if (!snapshot.hasText && snapshot.imageFiles.length > 0) {
    for (const file of snapshot.imageFiles) {
      if (resolved.length >= maxImages) break;
      try {
        const dataUrl = await readImageFileAsDataUrl(file, { compact });
        pushUnique(dataUrl);
      } catch {
        // Ignore unreadable clipboard image entries
      }
    }
    if (resolved.length > 0) {
      return resolved.slice(0, maxImages);
    }
  }

  // Extract embedded document/webpage images (data:image/... and http(s)://...) in order of appearance
  const cappedCandidates = rawSrcCandidates.slice(0, maxImages);
  const CONCURRENCY = 4;
  for (let i = 0; i < cappedCandidates.length; i += CONCURRENCY) {
    if (resolved.length >= maxImages) break;
    const chunk = cappedCandidates.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (src) => {
        if (/^data:image\//i.test(src)) {
          return compressDataUrlToJpeg(src, compact);
        }
        return fetchImageUrlAsStoredSrc(src, compact);
      })
    );
    for (const item of chunkResults) {
      if (resolved.length >= maxImages) break;
      pushUnique(item);
    }
  }

  // Append any binary clipboard image files (e.g., Word/OneNote local file images or mixed snips)
  for (const file of snapshot.imageFiles) {
    if (resolved.length >= maxImages) break;
    try {
      const dataUrl = await readImageFileAsDataUrl(file, { compact });
      pushUnique(dataUrl);
    } catch {
      // Ignore unreadable clipboard image entries
    }
  }

  if (resolved.length === 0) return [];
  return persistImageAssets(resolved.slice(0, maxImages));
}

export async function extractImagesFromClipboardEvent(
  e: ClipboardEvent | React.ClipboardEvent,
  maxImages = MAX_NOTE_IMAGES
): Promise<string[]> {
  const snapshot = captureClipboardPasteSnapshot(e);
  return extractImagesFromClipboardSnapshot(snapshot, maxImages);
}
