import { analyzeSession, templateReport } from "./shared/analyze.mjs";
import { toMarkdown, toJiraIssue } from "./shared/reportFormat.mjs";

// In-memory runtime state for serverless instances
let sessions = [];
let liveSession = null;
let inbox = [];
let tracker = { phone_use_s: 0, office_kit_drops: 0 };
let controlQueue = {};

function uid(prefix = "run") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Parse path
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  let pathname = url.pathname;
  if (!pathname.startsWith("/api")) {
    pathname = "/api" + (pathname.startsWith("/") ? pathname : "/" + pathname);
  }

  // Ensure JSON body is parsed if string
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {}
  }
  body = body || {};

  // 1. Health
  if (pathname === "/api/health") {
    return res.status(200).json({ ok: true, lab: "FrameDoctor", device: "iQOO 15", cloud: "vercel" });
  }

  // 2. Network
  if (pathname === "/api/network") {
    return res.status(200).json({
      ips: ["cloud.vercel.app"],
      primaryIp: "cloud.vercel.app",
      phoneUrl: "/",
      deskUrl: "/#/desk",
      hostname: "vercel-edge",
    });
  }

  // 3. Clear sessions
  if (pathname === "/api/sessions/clear" && req.method === "POST") {
    sessions = [];
    inbox = [];
    liveSession = null;
    tracker = { phone_use_s: 0, office_kit_drops: 0 };
    controlQueue = {};
    return res.status(200).json({ ok: true });
  }

  // 4. Live Session
  if (pathname === "/api/live") {
    return res.status(200).json(liveSession);
  }

  // 5. Inbox
  if (pathname === "/api/inbox") {
    return res.status(200).json(Array.isArray(inbox) ? inbox.slice(0, 40) : []);
  }

  // 6. Tracker
  if (pathname === "/api/tracker") {
    return res.status(200).json(tracker);
  }

  // 7. Sessions collection
  if (pathname === "/api/sessions" || pathname === "/api/sessions/") {
    if (req.method === "GET") {
      return res.status(200).json(Array.isArray(sessions) ? sessions.slice(0, 20) : []);
    }
    if (req.method === "POST") {
      const id = uid("run");
      const session = {
        id,
        session_id: id,
        created_at: new Date().toISOString(),
        status: "running",
      };
      sessions.unshift(session);
      liveSession = { id, status: "running", live: null };
      return res.status(200).json(session);
    }
  }

  // 8. Individual session matching: /api/sessions/:id/...
  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(.*))?$/);
  if (sessionMatch) {
    const id = sessionMatch[1];
    const sub = sessionMatch[2] || "";

    // GET /api/sessions/:id
    if (!sub && req.method === "GET") {
      const found = sessions.find((s) => s.id === id);
      if (!found) return res.status(404).json({ error: "missing session" });
      return res.status(200).json(found);
    }

    // PATCH /api/sessions/:id/live
    if (sub === "live" && req.method === "PATCH") {
      liveSession = { id, status: "running", live: body };
      if (body.elapsed) {
        tracker.phone_use_s = Math.max(tracker.phone_use_s, body.elapsed);
      }
      return res.status(200).json({ ok: true });
    }

    // POST /api/sessions/:id/control or GET /api/sessions/:id/control
    if (sub === "control") {
      if (req.method === "POST") {
        const { action, value } = body;
        controlQueue[id] = { action, value, timestamp: Date.now() };
        return res.status(200).json({ ok: true, id, action, value });
      }
      if (req.method === "GET") {
        const cmd = controlQueue[id] || null;
        if (cmd) delete controlQueue[id];
        return res.status(200).json(cmd || { ok: true });
      }
    }

    // POST /api/sessions/:id/stop
    if (sub === "stop" && req.method === "POST") {
      const summary = analyzeSession({ id, ...body });
      const text = templateReport(summary);
      const session = {
        id,
        session_id: id,
        created_at: new Date().toISOString(),
        status: "complete",
        ...summary,
        report_text: text,
        report_source: "on-device",
        markdown: toMarkdown(summary, text, "on-device"),
      };
      const idx = sessions.findIndex((s) => s.id === id);
      if (idx >= 0) sessions[idx] = session;
      else sessions.unshift(session);
      liveSession = null;
      if (summary.duration_s) {
        tracker.phone_use_s += summary.duration_s;
      }
      return res.status(200).json(session);
    }

    // POST /api/sessions/:id/report
    if (sub === "report" && req.method === "POST") {
      const found = sessions.find((s) => s.id === id);
      if (!found) {
        return res.status(200).json({ text: "FrameDoctor diagnostic report.", source: "on-device" });
      }
      return res.status(200).json({
        text: found.report_text || templateReport(found),
        source: found.report_source || "on-device",
      });
    }

    // POST /api/sessions/:id/export
    if (sub === "export" && req.method === "POST") {
      const found = sessions.find((s) => s.id === id) || {};
      const kind = body?.kind || "file";
      let fileContent = "";
      let filename = "";
      if (kind === "clipboard") {
        fileContent = (found.report_text || "").slice(0, 1200);
        filename = `clipboard-${id}.txt`;
      } else if (kind === "jira" || kind === "github") {
        fileContent = toJiraIssue(found, found.report_text || "");
        filename = `jira-issue-${id}.md`;
      } else {
        fileContent = toMarkdown(found, found.report_text || "", "on-device");
        filename = `framedoctor-report-${id}.md`;
      }
      const drop = {
        id: uid("drop"),
        session_id: id,
        filename,
        kind,
        body: fileContent,
        dropped_at: new Date().toISOString(),
      };
      inbox.unshift(drop);
      tracker.office_kit_drops++;
      return res.status(200).json(drop);
    }
  }

  // Fallback
  return res.status(200).json({ ok: true, path: pathname });
}
