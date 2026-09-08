import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { db, now, uid } from "./db.mjs";
import { analyzeSession } from "./analyze.mjs";
import { writeReport, toMarkdown, toJiraIssue } from "./report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

const sse = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sse) res.write(payload);
}

function rowToSession(r) {
  if (!r) return null;
  const bench = r.benchmark_json ? JSON.parse(r.benchmark_json) : {};
  return {
    id: r.id,
    session_id: r.id,
    created_at: r.created_at,
    status: r.status,
    duration_s: r.duration_s,
    avg_frame_ms: r.avg_frame_ms,
    p95_frame_ms: r.p95_frame_ms,
    pji: bench.pji ?? 0,
    pji_rating: bench.pji_rating ?? "",
    workload: bench.workload ?? "general",
    target_hz: bench.target_hz ?? 144,
    fixes: bench.fixes ?? [],
    sources: bench.sources ?? {},
    jank_frames: r.jank_frames,
    total_frames: r.total_frames,
    start_thermal: r.start_thermal,
    peak_thermal: r.peak_thermal,
    first_throttle_s: r.first_throttle_s,
    battery_start_pct: r.battery_start_pct,
    battery_end_pct: r.battery_end_pct,
    score: r.score,
    score_tier: r.score_tier,
    benchmark: bench,
    notes: r.notes_json ? JSON.parse(r.notes_json) : [],
    spark: r.spark_json ? JSON.parse(r.spark_json) : [],
    report_text: r.report_text,
    report_source: r.report_source,
    markdown: r.markdown,
    live: r.live_json ? JSON.parse(r.live_json) : null,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, lab: "FrameDoctor", device: "iQOO 15" });
});

app.get("/api/network", (_req, res) => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  // Prioritize real Wi-Fi/Ethernet subnets over virtual host-only adapters (e.g. 192.168.56.*)
  const nonVirtual = ips.filter((ip) => !ip.startsWith("192.168.56.") && !ip.startsWith("169.254."));
  const primaryIp = nonVirtual[0] || ips[0] || "127.0.0.1";
  res.json({
    ips,
    primaryIp,
    phoneUrl: `http://${primaryIp}:5173/`,
    deskUrl: `http://${primaryIp}:5173/#/desk`,
    hostname: os.hostname(),
  });
});

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  sse.add(res);
  req.on("close", () => sse.delete(res));
});

app.post("/api/sessions/clear", (_req, res) => {
  db.prepare("DELETE FROM sessions").run();
  db.prepare("DELETE FROM inbox").run();
  db.prepare("DELETE FROM tracker").run();
  broadcast("session", { status: "cleared" });
  res.json({ ok: true });
});

app.post("/api/sessions", (_req, res) => {
  const id = uid("run");
  db.prepare(
    `INSERT INTO sessions (id, created_at, status) VALUES (?, ?, 'running')`
  ).run(id, now());
  db.prepare(`INSERT INTO tracker (kind, seconds, meta, at) VALUES ('phone_use', 0, 'start', ?)`).run(now());
  broadcast("session", { id, status: "running" });
  res.json({ id, status: "running" });
});

app.patch("/api/sessions/:id/live", (req, res) => {
  const live = req.body || {};
  db.prepare(`UPDATE sessions SET live_json = ? WHERE id = ?`).run(JSON.stringify(live), req.params.id);
  broadcast("live", { id: req.params.id, live });
  res.json({ ok: true });
});

app.post("/api/sessions/:id/control", (req, res) => {
  const { action, value } = req.body || {};
  broadcast("control", { id: req.params.id, action, value });
  res.json({ ok: true, id: req.params.id, action, value });
});

app.post("/api/sessions/:id/stop", (req, res) => {
  const {
    frames = [],
    duration_s = 0,
    battery_start_pct,
    battery_end_pct,
    heat_series,
    thermal_series_os,
    workload = "general",
    target_hz = 144,
    sources = {},
  } = req.body || {};
  const summary = analyzeSession({
    id: req.params.id,
    frames,
    duration_s,
    battery_start_pct,
    battery_end_pct,
    heat_series,
    thermal_series_os,
    workload,
    target_hz,
    sources,
  });
  const benchmarkPayload = {
    ...(summary.benchmark || {}),
    pji: summary.pji,
    pji_rating: summary.pji_rating,
    workload: summary.workload,
    target_hz: summary.target_hz,
    fixes: summary.fixes,
    sources: summary.sources,
  };
  db.prepare(
    `UPDATE sessions SET
      status = 'complete',
      duration_s = ?, avg_frame_ms = ?, p95_frame_ms = ?,
      jank_frames = ?, total_frames = ?,
      start_thermal = ?, peak_thermal = ?, first_throttle_s = ?,
      battery_start_pct = ?, battery_end_pct = ?,
      score = ?, score_tier = ?, benchmark_json = ?,
      notes_json = ?, spark_json = ?, live_json = NULL
     WHERE id = ?`
  ).run(
    summary.duration_s,
    summary.avg_frame_ms,
    summary.p95_frame_ms,
    summary.jank_frames,
    summary.total_frames,
    summary.start_thermal,
    summary.peak_thermal,
    summary.first_throttle_s,
    summary.battery_start_pct,
    summary.battery_end_pct,
    summary.score,
    summary.score_tier,
    JSON.stringify(benchmarkPayload),
    JSON.stringify(summary.notes),
    JSON.stringify(summary.spark),
    req.params.id
  );
  db.prepare(`INSERT INTO tracker (kind, seconds, meta, at) VALUES ('phone_use', ?, 'stop', ?)`).run(
    summary.duration_s,
    now()
  );
  broadcast("session", { id: req.params.id, status: "complete", summary });
  res.json(summary);
});

app.post("/api/sessions/:id/report", async (req, res) => {
  const r = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: "missing session" });
  const summary = rowToSession(r);
  const { text, source } = await writeReport(summary);
  db.prepare(`UPDATE sessions SET report_text = ?, report_source = ? WHERE id = ?`).run(
    text,
    source,
    req.params.id
  );
  broadcast("report", { id: req.params.id, source });
  res.json({ text, source });
});

app.post("/api/sessions/:id/export", (req, res) => {
  const r = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: "missing session" });
  const summary = rowToSession(r);
  const kind = req.body?.kind || "file";
  let body = "";
  let filename = "";

  if (kind === "clipboard") {
    body = (summary.report_text || "").slice(0, 1200);
    filename = `clipboard-${summary.id}.txt`;
  } else if (kind === "jira" || kind === "github") {
    body = toJiraIssue(summary, summary.report_text || "");
    filename = `jira-issue-${summary.id}.md`;
  } else if (kind === "perfetto" || kind === "trace") {
    const events = (summary.spark || []).map((ms, idx) => ({
      name: `DrawFrame_${idx + 1}`,
      cat: "rendering,vsync,iqoo15",
      ph: "X",
      ts: idx * 6944,
      dur: Math.round(ms * 1000),
      pid: 1015,
      tid: 1,
      args: { frame_ms: ms, jank: ms >= 33.3, p95: summary.p95_frame_ms },
    }));
    body = JSON.stringify({ traceEvents: events, displayTimeUnit: "ms" }, null, 2);
    filename = `perfetto-trace-${summary.id}.json`;
  } else if (kind === "csv") {
    const csvLines = ["frame_index,frame_ms,is_jank,timestamp_s,p95_baseline"];
    (summary.spark || []).forEach((ms, idx) => {
      csvLines.push(`${idx + 1},${ms},${ms >= 33.3 ? 1 : 0},${(idx * 0.05).toFixed(3)},${summary.p95_frame_ms}`);
    });
    body = csvLines.join("\n");
    filename = `framedoctor-telemetry-${summary.id}.csv`;
  } else {
    body = toMarkdown(summary, summary.report_text || "", summary.report_source || "template");
    filename = `framedoctor-report-${summary.id}.md`;
  }

  const id = uid("drop");
  db.prepare(
    `INSERT INTO inbox (id, session_id, filename, kind, body, dropped_at) VALUES (?,?,?,?,?,?)`
  ).run(id, summary.id, filename, kind, body, now());
  db.prepare(`UPDATE sessions SET markdown = ? WHERE id = ?`).run(body, summary.id);
  db.prepare(`INSERT INTO tracker (kind, seconds, meta, at) VALUES ('office_kit', 1, ?, ?)`).run(kind, now());
  const drop = { id, session_id: summary.id, filename, kind, body, dropped_at: now() };
  broadcast("drop", drop);
  res.json(drop);
});

app.get("/api/sessions/:id", (req, res) => {
  const r = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: "missing session" });
  res.json(rowToSession(r));
});

app.get("/api/sessions", (_req, res) => {
  const rows = db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC LIMIT 20`).all();
  res.json(rows.map(rowToSession));
});

app.get("/api/inbox", (_req, res) => {
  const rows = db.prepare(`SELECT * FROM inbox ORDER BY dropped_at DESC LIMIT 40`).all();
  res.json(rows);
});

app.get("/api/live", (_req, res) => {
  const r = db.prepare(`SELECT * FROM sessions WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`).get();
  res.json(r ? rowToSession(r) : null);
});

app.get("/api/tracker", (_req, res) => {
  const rows = db.prepare(`SELECT kind, SUM(seconds) AS seconds, COUNT(*) AS n FROM tracker GROUP BY kind`).all();
  const map = Object.fromEntries(rows.map((x) => [x.kind, x]));
  res.json({
    phone_use_s: map.phone_use?.seconds ?? 0,
    office_kit_drops: map.office_kit?.n ?? 0,
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, "0.0.0.0", () => {
  console.log(`FrameDoctor lab on 0.0.0.0:${port}`);
});
