/** FrameDoctor analyzer. Same module on the phone and on the lab server. */

export const THERMAL = ["NONE", "LIGHT", "MODERATE", "SEVERE", "CRITICAL", "EMERGENCY", "SHUTDOWN"];

export const VSNC_144_MS = 1000 / 144; // 6.944…
export const VSNC_60_MS = 1000 / 60; // 16.667…
export const JANK_MS = VSNC_60_MS * 2; // two 60 Hz periods

export function thermalFromHeat(heat) {
  if (heat >= 0.92) return 4;
  if (heat >= 0.72) return 3;
  if (heat >= 0.48) return 2;
  if (heat >= 0.22) return 1;
  return 0;
}

export function thermalLabel(idx) {
  return THERMAL[idx] ?? "NONE";
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export function stdDev(values, mean) {
  if (!values.length) return 0;
  const avg = mean ?? values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function generateActionableFixes({
  jank_frames,
  p95_frame_ms,
  peak_thermal,
  pji,
  workload = "general",
  target_hz = 144,
  thermal_source = "estimated",
}) {
  const fixes = [];
  const budget = 1000 / target_hz;

  if (workload === "feed") {
    fixes.push({
      category: "Main thread & layout",
      title: "Batch DOM reads/writes onto one rAF",
      impact: "Stops layout thrash during scroll",
      code: `requestAnimationFrame(() => {
  // write only — never read offsetHeight in the same turn
  el.style.transform = \`translate3d(0, \${y}px, 0)\`;
});
.feed-card { contain: layout style paint; will-change: transform; }`,
    });
    if (jank_frames > 0) {
      fixes.push({
        category: "List virtualization",
        title: "Recycle offscreen list nodes",
        impact: "Reduces layout tree depth and memory pressure",
        code: `// Render visible window + buffer cards only:
const visibleCards = cards.slice(Math.max(0, scrollIndex - 2), scrollIndex + 8);`,
      });
    }
  }

  if (workload === "shader3d" || workload === "triangles" || workload === "raymarch") {
    fixes.push({
      category: "GPU fill & rasterizer",
      title: "Cap fragment work when over vsync budget",
      impact: `Keep p95 under ${budget.toFixed(2)} ms (${target_hz} Hz)`,
      code: `// Drop post-process / extra lights when frame time slips
gl.hint(gl.FRAGMENT_SHADER_DERIVATIVE_HINT, gl.FASTEST);
if (lastFrameMs > ${budget.toFixed(2)}) quality = Math.max(0.6, quality * 0.92);`,
    });
    if (p95_frame_ms > budget * 1.05 || jank_frames > 0) {
      fixes.push({
        category: "Adreno shader precision",
        title: "Use mediump float in fragment pass",
        impact: "Doubles ALU throughput on Snapdragon 8 Elite",
        code: `precision mediump float;
// Avoid expensive highp in lighting equations:
vec3 light = normalize(uLightPos - vPos);`,
      });
    }
  }

  if (thermal_source === "os" && (peak_thermal === "MODERATE" || peak_thermal === "SEVERE" || peak_thermal === "CRITICAL")) {
    fixes.push({
      category: "Thermal headroom",
      title: "Offload work and scale resolution after moderate thermal",
      impact: "Holds sustained fps once PowerManager crosses MODERATE",
      code: `const worker = new Worker("sim.worker.js");
worker.postMessage(state);
canvas.width = Math.floor(cssWidth * (thermal >= 2 ? 0.8 : 1));`,
    });
  }

  if (pji >= 1.8) {
    fixes.push({
      category: "Frame pacing",
      title: "Lock updates to vsync, skip catch-up frames",
      impact: "Lowers pacing jitter (PJI)",
      code: `let last = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (now - last < ${budget.toFixed(2)} * 0.92) return;
  last = now;
  draw();
}`,
    });
  }

  if (!fixes.length) {
    fixes.push({
      category: `${target_hz} Hz budget`,
      title: `Hold ${budget.toFixed(2)} ms pacing`,
      impact: "Trace is inside budget — do not add blur/layers",
      code: `const TARGET_MS = ${budget.toFixed(2)}; // 1000/${target_hz}
requestAnimationFrame(function draw() {
  requestAnimationFrame(draw);
});`,
    });
  }

  return fixes.slice(0, 3);
}

export function analyzeSession({
  id,
  frames,
  duration_s,
  battery_start_pct,
  battery_end_pct,
  heat_series = [],
  thermal_series_os = [],
  workload = "general",
  target_hz = 144,
  sources = {},
}) {
  const rawTimes = (frames || [])
    .map((f) => Number(f.ms ?? f))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 400);
  const total = rawTimes.length;
  // Discard initial warmup frames (~25 frames) if session has enough samples, so mount/click jitter doesn't inflate PJI or p95
  const times = rawTimes.length > 45 ? rawTimes.slice(25) : rawTimes;
  const steadyTotal = times.length;
  const jankIdx = times.map((ms, i) => (ms >= JANK_MS ? i : -1)).filter((i) => i >= 0);
  const avg = steadyTotal ? times.reduce((a, b) => a + b, 0) / steadyTotal : 0;
  const p95 = percentile(times, 0.95);
  const paced = times.filter((ms) => ms < JANK_MS);
  const pji = round(stdDev(paced.length ? paced : times), 2);

  let pji_rating = "FLAT (inside 144 Hz noise)";
  if (pji >= 3.5) pji_rating = "HIGH PACING JITTER";
  else if (pji >= 1.8) pji_rating = "MODERATE JITTER";
  else if (pji >= 0.8) pji_rating = "STABLE";

  const usedOsThermal = Array.isArray(thermal_series_os) && thermal_series_os.length > 0;
  let thermalSeries;
  if (usedOsThermal) {
    thermalSeries = thermal_series_os.map((t) => {
      if (typeof t === "string") return Math.max(0, THERMAL.indexOf(t));
      return Math.max(0, Math.min(6, Number(t) || 0));
    });
  } else {
    const heat =
      heat_series.length === rawTimes.length
        ? heat_series
        : rawTimes.map((_, i) => {
            const window = rawTimes.slice(Math.max(0, i - 40), i + 1);
            const load = window.filter((ms) => ms > 12).length / Math.max(1, window.length);
            return Math.min(1, load * 0.7 + (i / Math.max(1, rawTimes.length)) * 0.45);
          });
    thermalSeries = (heat_series.length ? heat_series : heat).map(thermalFromHeat);
  }

  const start_thermal_idx = thermalSeries[0] ?? 0;
  const peak_thermal_idx = thermalSeries.reduce((a, b) => Math.max(a, b), 0);
  const throttleAt = thermalSeries.findIndex((t) => t >= 2);
  const first_throttle_s =
    throttleAt >= 0 && total ? (throttleAt / total) * duration_s : null;

  const notes = [];
  let clusterStart = null;
  let clusterCount = 0;
  jankIdx.forEach((i, n) => {
    const t = steadyTotal ? (i / steadyTotal) * duration_s : 0;
    if (clusterStart == null) {
      clusterStart = t;
      clusterCount = 1;
    } else if (t - clusterStart < 0.6) {
      clusterCount += 1;
    } else {
      if (clusterCount >= 3) {
        notes.push({
          t_s: round(clusterStart),
          type: "jank",
          detail: `${clusterCount} hitch frames around ${fmt(clusterStart)}`,
        });
      }
      clusterStart = t;
      clusterCount = 1;
    }
    if (n === jankIdx.length - 1 && clusterCount >= 3) {
      notes.push({
        t_s: round(clusterStart),
        type: "jank",
        detail: `${clusterCount} hitch frames around ${fmt(clusterStart)}`,
      });
    }
  });

  if (first_throttle_s != null) {
    notes.push({
      t_s: round(first_throttle_s),
      type: "thermal",
      detail: `${usedOsThermal ? "OS thermal" : "estimated thermal"} ${THERMAL[peak_thermal_idx]} first crossed moderate at ${fmt(first_throttle_s)}`,
    });
  }

  const drop = (battery_start_pct ?? 0) - (battery_end_pct ?? 0);
  if (Number.isFinite(drop) && drop >= 1) {
    notes.push({
      t_s: round(duration_s),
      type: "battery",
      detail: `battery ${battery_start_pct}% → ${battery_end_pct}% (−${drop.toFixed(1)} pts)`,
    });
  }

  const spark = downsample(times, 120);

  const src = {
    frames: sources.frames || "raf",
    thermal: usedOsThermal ? "os" : sources.thermal || "estimated",
    battery: sources.battery || (battery_start_pct == null ? "unavailable" : "web"),
    explainer: sources.explainer || "on-device",
  };

  const { score, tier, benchmark } = calculatePerformanceScore({
    p95_frame_ms: p95,
    jank_frames: jankIdx.length,
    total_frames: steadyTotal,
    peak_thermal_idx,
    first_throttle_s,
    duration_s,
    battery_drop: Math.max(0, drop),
    target_hz,
    thermal_source: src.thermal,
  });

  const fixes = generateActionableFixes({
    jank_frames: jankIdx.length,
    p95_frame_ms: p95,
    peak_thermal: THERMAL[peak_thermal_idx],
    pji,
    workload,
    target_hz,
    thermal_source: src.thermal,
  });

  return {
    session_id: id,
    workload,
    target_hz,
    duration_s: round(duration_s),
    avg_frame_ms: round(avg, 2),
    p95_frame_ms: round(p95, 2),
    pji,
    pji_rating,
    jank_frames: jankIdx.length,
    total_frames: total,
    start_thermal: THERMAL[start_thermal_idx],
    peak_thermal: THERMAL[peak_thermal_idx],
    first_throttle_s: first_throttle_s == null ? null : round(first_throttle_s, 2),
    battery_start_pct: battery_start_pct ?? null,
    battery_end_pct: battery_end_pct ?? null,
    score,
    score_tier: tier,
    benchmark,
    notes: notes.slice(0, 8),
    spark,
    fixes,
    sources: src,
  };
}

export function calculatePerformanceScore({
  p95_frame_ms,
  jank_frames,
  total_frames,
  peak_thermal_idx = 0,
  first_throttle_s,
  duration_s = 1,
  battery_drop = 0,
  target_hz = 144,
  thermal_source = "estimated",
}) {
  const budget = 1000 / target_hz;
  if (!total_frames) {
    return {
      score: 0,
      tier: "NO SAMPLES",
      benchmark: {
        budget_ms: round(budget, 2),
        target_hz,
        p95_vs_budget: "no frames",
        jank_rate_pct: 0,
      },
    };
  }

  let framePoints = 40;
  if (p95_frame_ms > budget) {
    const penalty = Math.min(35, ((p95_frame_ms - budget) / (VSNC_60_MS * 2)) * 35);
    framePoints = Math.max(5, 40 - penalty);
  }

  const jankRatio = jank_frames / total_frames;
  const jankPoints = Math.max(0, 25 * (1 - Math.min(1, jankRatio * 12)));

  let thermalPoints = 20;
  if (thermal_source === "os") {
    // Only penalize when reading real PowerManager on-device from APK
    const thermalMap = [20, 18, 14, 8, 2, 0, 0];
    thermalPoints = thermalMap[peak_thermal_idx] ?? 14;
    if (first_throttle_s == null || first_throttle_s > duration_s * 0.7) {
      thermalPoints = Math.min(20, thermalPoints + 2);
    }
  } else {
    // Estimated thermal in browser is a visual indicator only — do not penalize the score
    thermalPoints = 20;
  }

  const batteryPoints = Math.max(5, 15 - Math.max(0, battery_drop) * 3);
  const score = Math.round(Math.min(100, Math.max(12, framePoints + jankPoints + thermalPoints + batteryPoints)));

  let tier = "B — OVER BUDGET";
  if (score >= 90 && p95_frame_ms <= budget * 1.1) tier = "S — 144 Hz LOCK";
  else if (score >= 75) tier = "A — FLAGSHIP STABLE";
  else if (score >= 58) tier = "B — OVER BUDGET";
  else tier = "C — CRITICAL LOAD";

  const delta = budget - p95_frame_ms;
  const p95_vs_budget =
    delta >= 0
      ? `${round(delta, 2)} ms under ${target_hz} Hz budget`
      : `${round(-delta, 2)} ms over ${target_hz} Hz budget`;

  return {
    score,
    tier,
    benchmark: {
      budget_ms: round(budget, 2),
      target_hz,
      p95_vs_budget,
      jank_rate_pct: Number(((jank_frames / total_frames) * 100).toFixed(1)),
      thermal_note:
        peak_thermal_idx <= 1
          ? "Peak thermal NONE/LIGHT"
          : `Peak thermal ${THERMAL[peak_thermal_idx]}`,
    },
  };
}

export function recommendations(s) {
  const recs = [];
  const budget = 1000 / (s.target_hz || 144);
  const gpu = s.workload === "shader3d" || s.workload === "triangles" || s.workload === "raymarch";
  if (s.p95_frame_ms > budget * 1.3) {
    recs.push(gpu
      ? "Drop fragment loops and extra mesh copies when p95 slips the vsync budget."
      : "Cut full-screen blur and extra offscreen layers while the list is moving.");
  } else {
    recs.push("Keep extra layers off unless the shot needs them — p95 is near budget.");
  }
  if (s.sources?.thermal === "os" && s.peak_thermal !== "NONE" && s.peak_thermal !== "LIGHT") {
    recs.push("Cap animation to 60 fps after first moderate PowerManager thermal.");
  } else if (s.sources?.thermal !== "os") {
    recs.push("Browser thermal is estimated and not scored. Install the APK to read PowerManager.");
  } else {
    recs.push("OS thermal stayed low. Raise the overdraw bomb if you need a throttle window — do not invent numbers.");
  }
  if (s.jank_frames > 12) {
    recs.push(gpu
      ? "Skip catch-up frames and avoid drawing the same mesh more than once per vsync."
      : "Replace animated gradients with static bitmaps during scroll.");
  } else {
    recs.push("Hitch count is low. Ship the loop you measured, not more FX.");
  }
  return recs.slice(0, 3);
}

export function templateReport(s) {
  const hitch = (s.notes || []).find((n) => n.type === "jank");
  const therm = (s.notes || []).find((n) => n.type === "thermal");
  const recs = recommendations(s);
  const src = s.sources || {};
  const lines = [
    `FrameDoctor ${(s.session_id || s.id || "lab").toString().slice(0, 8)} · ${s.duration_s}s · score ${s.score ?? 0}/100 [${s.score_tier ?? "—"}].`,
    `p95 ${s.p95_frame_ms} ms · avg ${s.avg_frame_ms} ms · PJI ±${s.pji} ms · ${s.jank_frames} jank of ${s.total_frames} frames.`,
    `Budget is ${(1000 / (s.target_hz || 144)).toFixed(2)} ms at ${s.target_hz || 144} Hz. ${s.benchmark?.p95_vs_budget ?? ""}.`,
    hitch ? `First hitch cluster: ${hitch.detail}.` : `No hitch clusters (≥3 frames over ${JANK_MS.toFixed(1)} ms).`,
    therm
      ? `Thermal ${s.start_thermal} → ${s.peak_thermal} (${src.thermal === "os" ? "PowerManager" : "estimated"}). ${therm.detail}.`
      : `Thermal peak ${s.peak_thermal} (${src.thermal === "os" ? "PowerManager" : "estimated from frame load"}).`,
    s.battery_start_pct != null
      ? `Battery ${s.battery_start_pct}% → ${s.battery_end_pct}% (${src.battery || "web"}).`
      : `Battery unavailable in this browser.`,
    `Capture: ${src.frames || "raf"}. Explainer: on-device template.`,
    `1. ${recs[0]}`,
    `2. ${recs[1]}`,
    `3. ${recs[2]}`,
  ];
  return lines.join("\n");
}

function downsample(arr, n) {
  if (arr.length <= n) return arr.map((v) => round(v, 2));
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(round(arr[Math.floor(i * step)], 2));
  return out;
}

function round(n, d = 2) {
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1).padStart(4, "0");
  return m ? `${m}:${r}` : `${s.toFixed(1)}s`;
}
