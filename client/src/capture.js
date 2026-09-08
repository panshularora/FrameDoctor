import {
  nativeAvailable,
  nativeFrames,
  nativeSnapshot,
  nativeStartCapture,
  nativeStopCapture,
  nativeVibrate,
} from "./native.js";
import { thermalFromHeat, thermalLabel } from "../../shared/analyze.mjs";

export async function readBattery() {
  const snap = nativeSnapshot();
  if (snap && snap.batteryPct != null) {
    return { pct: Number(snap.batteryPct), tempC: snap.batteryTempC ?? null, source: "os" };
  }
  try {
    if (!navigator.getBattery) return { pct: null, tempC: null, source: "unavailable" };
    const b = await navigator.getBattery();
    return { pct: Math.round(b.level * 1000) / 10, tempC: null, source: "web" };
  } catch {
    return { pct: null, tempC: null, source: "unavailable" };
  }
}

export function triggerHaptic(type = "hitch") {
  const pattern =
    type === "bomb" ? [60, 40, 90] : type === "complete" ? [40, 30, 60, 35, 110] : [28, 35, 28];
  nativeVibrate(pattern);
}

export function createCapture({ bomb }) {
  const useNative = nativeAvailable();
  const frames = [];
  const heatSeries = [];
  const thermalOs = [];
  let raf = 0;
  let last = 0;
  let heat = 0.06;
  let fps = 0;
  let lastMs = 0;
  let ema = 8;
  let bombWasActive = false;
  let lastTouchTime = 0;
  let touchIntervalEma = 8;
  let inputLagEma = 8;
  let touchSamples = 0;

  const onPointer = (e) => {
    const nowTs = performance.now();
    if (lastTouchTime) {
      const delta = nowTs - lastTouchTime;
      if (delta > 0 && delta < 100) {
        touchIntervalEma = touchIntervalEma * 0.85 + delta * 0.15;
        touchSamples += 1;
      }
    }
    lastTouchTime = nowTs;
    if (e.timeStamp) {
      const lag = Math.max(0.4, Math.min(40, nowTs - e.timeStamp));
      inputLagEma = inputLagEma * 0.85 + lag * 0.15;
    }
  };

  const tick = (t) => {
    if (last) {
      const ms = t - last;
      if (ms > 0 && ms < 400) {
        frames.push({ t, ms });
        lastMs = ms;
        ema = ema * 0.82 + ms * 0.18;
        fps = 1000 / Math.max(ema, 1);

        const isBomb = Boolean(bomb?.());
        if (isBomb) bombWasActive = true;
        const heavyLoad = Math.max(0, (ms - 12) / 24);
        const heatDelta = (isBomb ? 0.0022 : 0) + heavyLoad * 0.0015;
        const decay = isBomb ? 0.999 : bombWasActive ? 0.995 : 0.988;
        const minFloor = isBomb ? 0.22 : 0.05;
        heat = Math.max(minFloor, Math.min(0.95, heat * decay + heatDelta));
        heatSeries.push(Math.round(heat * 1000) / 1000);

        if (useNative) {
          const snap = nativeSnapshot();
          if (snap && snap.thermal != null) thermalOs.push(Number(snap.thermal));
        }
      }
    }
    last = t;
    raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      last = 0;
      bombWasActive = false;
      if (useNative) nativeStartCapture();
      raf = requestAnimationFrame(tick);
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
    },
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      if (useNative) nativeStopCapture();
    },
    snapshot() {
      const snap = nativeSnapshot();
      const osThermal = snap?.thermal != null ? Number(snap.thermal) : null;
      const thermalIdx = osThermal != null ? osThermal : thermalFromHeat(heat);
      const nativeList = useNative ? nativeFrames() : [];
      const touchHz = touchSamples > 4 ? Math.round(1000 / Math.max(touchIntervalEma, 1)) : null;
      return {
        fps: Math.round(fps),
        lastMs: Math.round(lastMs * 10) / 10,
        thermal: thermalLabel(thermalIdx),
        thermalIndex: thermalIdx,
        thermalSource: osThermal != null ? "os" : "estimated",
        heat,
        batteryPct: snap?.batteryPct ?? null,
        batteryTempC: snap?.batteryTempC ?? null,
        touchHz,
        inputLagMs: touchSamples > 4 ? Math.round(inputLagEma * 10) / 10 : null,
        frames,
        heatSeries,
        thermalOs,
        nativeFrames: nativeList,
        captureSource: nativeList.length > 10 ? "choreographer" : "raf",
      };
    },
  };
}

export function answerQuery(queryText, summary) {
  const q = (queryText || "").toLowerCase();
  const notes = summary?.notes || [];

  if (q.includes("score") || q.includes("health") || q.includes("tier")) {
    return `Score ${summary?.score ?? 0} / 100, ${summary?.score_tier ?? "—"}. ${summary?.benchmark?.p95_vs_budget ?? ""}.`;
  }
  if (q.includes("throttle") || q.includes("heat") || q.includes("thermal")) {
    const how = summary?.sources?.thermal === "os" ? "PowerManager" : "estimated from frame load";
    if (summary?.first_throttle_s) {
      return `Moderate thermal (${how}) at ${summary.first_throttle_s}s. Peak ${summary.peak_thermal}.`;
    }
    return `No moderate thermal window. Peak ${summary?.peak_thermal || "NONE"} via ${how}.`;
  }
  if (q.includes("recommend") || q.includes("fix") || q.includes("advice")) {
    const hitch = notes.find((n) => n.type === "jank");
    if (hitch) return `Cut composite layers during scroll. First hitch: ${hitch.detail}.`;
    return `Inside budget. Lock ${summary?.target_hz || 144} Hz and skip extra offscreen layers.`;
  }

  const m = q.match(/(\d+(?:\.\d+)?)/);
  const t = m ? Number(m[1]) : null;
  if (t != null) {
    const hit = [...notes].sort((a, b) => Math.abs(a.t_s - t) - Math.abs(b.t_s - t))[0];
    if (hit && Math.abs(hit.t_s - t) <= 8) return `At ${hit.t_s}s: [${hit.type}] ${hit.detail}`;
    return `No note near ${t}s. Average frame ${summary?.avg_frame_ms ?? "—"} ms.`;
  }

  return `Session ${summary?.session_id?.slice(0, 6)}: ${summary?.jank_frames || 0} jank / ${summary?.duration_s || 0}s, peak thermal ${summary?.peak_thermal || "NONE"}.`;
}

export function speakText(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang.includes("en-IN") || v.lang.includes("en-GB") || v.lang.includes("en-US"));
    if (voice) utt.voice = voice;
    window.speechSynthesis.speak(utt);
  } catch {}
}

export function askVoice(summary) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return Promise.reject(new Error("no speech"));
  return new Promise((resolve, reject) => {
    const rec = new SR();
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      const said = e.results[0][0].transcript;
      const answer = answerQuery(said, summary);
      speakText(answer);
      resolve({ said, answer });
    };
    rec.onerror = () => reject(new Error("speech failed"));
    rec.start();
  });
}
