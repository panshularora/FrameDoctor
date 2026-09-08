const base = "http://127.0.0.1:8787";

async function j(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`${r.status} ${t.slice(0, 200)}`);
  }
}

const created = await j(`${base}/api/sessions`, { method: "POST" });
const frames = Array.from({ length: 180 }, (_, i) => ({
  ms: [40, 41, 42, 90, 91].includes(i) ? 28 : 8.2,
}));
const heat = frames.map((_, i) => Math.min(1, i / 180));
const stop = await j(`${base}/api/sessions/${created.id}/stop`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    frames,
    duration_s: 20,
    battery_start_pct: 81,
    battery_end_pct: 79,
    heat_series: heat,
  }),
});
const report = await j(`${base}/api/sessions/${created.id}/report`, { method: "POST" });
const drop = await j(`${base}/api/sessions/${created.id}/export`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "file" }),
});
const clip = await j(`${base}/api/sessions/${created.id}/export`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "clipboard" }),
});
const inbox = await j(`${base}/api/inbox`);
const tracker = await j(`${base}/api/tracker`);
console.log(
  JSON.stringify(
    {
      id: created.id,
      p95: stop.p95_frame_ms,
      jank: stop.jank_frames,
      thermal: stop.peak_thermal,
      source: report.source,
      file: drop.filename,
      clip: clip.kind,
      inbox: inbox.length,
      tracker,
    },
    null,
    2
  )
);
