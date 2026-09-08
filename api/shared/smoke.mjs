import { analyzeSession, JANK_MS, templateReport } from "./analyze.mjs";

const frames = Array.from({ length: 180 }, (_, i) => ({
  ms: [40, 41, 42, 90, 91].includes(i) ? 40 : 7.1,
}));
const heat = frames.map((_, i) => Math.min(1, i / 180));
const osThermal = frames.map((_, i) => (i > 100 ? 2 : 0));

const stop = analyzeSession({
  id: "run_test",
  frames,
  duration_s: 20,
  battery_start_pct: 81,
  battery_end_pct: 79,
  heat_series: heat,
  thermal_series_os: osThermal,
  workload: "shader3d",
  target_hz: 144,
  sources: { frames: "choreographer", thermal: "os", battery: "os" },
});

const report = templateReport(stop);
const checks = {
  p95: stop.p95_frame_ms > 7,
  jank: stop.jank_frames === 5,
  thermalOs: stop.peak_thermal === "MODERATE",
  throttle: stop.first_throttle_s != null,
  source: stop.sources.thermal === "os",
  noFakeFlagship: !JSON.stringify(stop).includes("Standard Flagship"),
  reportOnDevice: report.includes("on-device") || report.includes("PowerManager"),
};

const clean = analyzeSession({
  id: "run_clean",
  frames: Array.from({ length: 180 }, () => ({ ms: 7.05 })),
  duration_s: 20,
  battery_start_pct: 90,
  battery_end_pct: 89.7,
  heat_series: Array.from({ length: 180 }, () => 0.9),
  workload: "shader3d",
  target_hz: 144,
  sources: { frames: "raf", thermal: "estimated", battery: "web" },
});
checks.estNotScored = clean.score >= 85 && clean.sources.thermal === "estimated";
checks.gpuFixNotDom = (stop.fixes || []).every((f) => !/DOM|feed-card/i.test(`${f.title} ${f.code}`));

const failed = Object.entries(checks).filter(([, v]) => !v);
if (failed.length) {
  console.error(JSON.stringify({ stop, clean, checks, failed }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      p95: stop.p95_frame_ms,
      jank: stop.jank_frames,
      jankMs: JANK_MS,
      thermal: stop.peak_thermal,
      score: stop.score,
      tier: stop.score_tier,
      budget: stop.benchmark.p95_vs_budget,
    },
    null,
    2
  )
);
