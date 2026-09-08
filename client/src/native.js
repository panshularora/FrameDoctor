/** Android JS bridge. Missing in Chrome — every metric is then labeled estimated/web. */

function bridge() {
  if (typeof window === "undefined") return null;
  return window.FrameDoctorNative || null;
}

export function nativeAvailable() {
  const b = bridge();
  if (!b) return false;
  try {
    if (typeof b.available === "function") return b.available() === true;
  } catch {}
  return b.available === true || typeof b.snapshot === "function" || typeof b.getSnapshot === "function";
}

export function nativeInfo() {
  const b = bridge();
  if (!b) {
    return {
      present: false,
      device: "browser",
      refreshHz: guessRefresh(),
    };
  }
  try {
    const raw = b.deviceInfo ? b.deviceInfo() : "{}";
    const info = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      present: true,
      device: info.model || info.device || "Android",
      brand: info.brand || "",
      sdk: info.sdk,
      refreshHz: Number(info.refreshHz) || guessRefresh(),
    };
  } catch {
    return { present: true, device: "Android", refreshHz: guessRefresh() };
  }
}

export function nativeSnapshot() {
  const b = bridge();
  if (!b) return null;
  try {
    const raw = b.snapshot ? b.snapshot() : b.getSnapshot?.();
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export function nativeStartCapture() {
  const b = bridge();
  try {
    b?.startCapture?.();
  } catch {}
}

export function nativeStopCapture() {
  const b = bridge();
  try {
    b?.stopCapture?.();
  } catch {}
}

export function nativeFrames() {
  const b = bridge();
  if (!b) return [];
  try {
    const raw = b.framesJson ? b.framesJson() : "[]";
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function nativeSave(filename, content) {
  const b = bridge();
  if (b?.saveToDownloads) {
    try {
      const raw = b.saveToDownloads(filename, content);
      const res = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (res?.ok || res?.path) return { ok: true, path: res.path || "Downloads/" + filename, native: true };
    } catch {}
  }
  downloadBlob(filename, content);
  return { ok: true, path: filename, native: false };
}

export function nativeClipboard(text) {
  const b = bridge();
  try {
    b?.clipboard?.(text);
  } catch {}
  return navigator.clipboard?.writeText(text).catch(() => {});
}

export function nativeVibrate(pattern = [40, 30, 60]) {
  const b = bridge();
  try {
    if (b?.vibrate) {
      b.vibrate(Array.isArray(pattern) ? pattern.join(",") : String(pattern));
      return;
    }
  } catch {}
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

function guessRefresh() {
  return 60;
}

function downloadBlob(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
