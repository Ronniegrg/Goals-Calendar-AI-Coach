import type React from "react";

const MAX_SCREENSHOT_WIDTH = 1280;
const MAX_SCREENSHOT_HEIGHT = 900;
const JPEG_QUALITY = 0.8;

function drawScaledToJpegDataUrl(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): string {
  const safeW = Math.max(1, srcWidth);
  const safeH = Math.max(1, srcHeight);
  const scale = Math.min(1, MAX_SCREENSHOT_WIDTH / safeW, MAX_SCREENSHOT_HEIGHT / safeH);
  const targetW = Math.max(1, Math.round(safeW * scale));
  const targetH = Math.max(1, Math.round(safeH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not initialize image canvas.");
  }
  ctx.fillStyle = "#0b0e18";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
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

    const dataUrl = drawScaledToJpegDataUrl(video, video.videoWidth, video.videoHeight);
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

export async function readImageFileAsDataUrl(file: File): Promise<string> {
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
    return drawScaledToJpegDataUrl(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function extractImagesFromClipboardEvent(
  e: ClipboardEvent | React.ClipboardEvent
): Promise<string[]> {
  const items = e.clipboardData?.items;
  if (!items || items.length === 0) return [];

  const files: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item && item.type && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length === 0) return [];

  const results: string[] = [];
  for (const file of files) {
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      results.push(dataUrl);
    } catch {
      // Ignore unreadable clipboard image entries
    }
  }
  return results;
}
