import { analyzeSession, templateReport } from "../../shared/analyze.mjs";
import { toMarkdown, toJiraIssue } from "../../shared/reportFormat.mjs";
import { listSessions, saveSession, uid } from "./storage.js";
import { nativeSave, nativeClipboard } from "./native.js";

const json = async (r) => {
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
};

async function tryFetch(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    return await json(r);
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  async createSession() {
    const local = { id: uid("run"), status: "running", created_at: new Date().toISOString() };
    await saveSession(local);
    try {
      const s = await tryFetch("/api/sessions", { method: "POST" });
      local.remoteId = s.id;
      local.id = s.id;
      await saveSession(local);
      return local;
    } catch {
      return local;
    }
  },

  async live(id, payload) {
    try {
      await tryFetch(`/api/sessions/${id}/live`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {}
  },

  async stop(id, payload) {
    const summary = analyzeSession({ id, ...payload });
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
    await saveSession(session);
    try {
      const remote = await tryFetch(`/api/sessions/${id}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { ...session, ...remote, report_text: session.report_text, report_source: "on-device" };
    } catch {
      return session;
    }
  },

  async report(id) {
    const local = (await listSessions(40)).find((s) => s.id === id);
    const fallback = {
      text: local?.report_text || templateReport(local || {}),
      source: "on-device",
    };
    try {
      const r = await tryFetch(`/api/sessions/${id}/report`, { method: "POST" });
      if (r?.text) return { text: r.text, source: r.source === "model" ? "spacexai" : r.source || "on-device" };
      return fallback;
    } catch {
      return fallback;
    }
  },

  async exportDrop(id, kind = "file") {
    const rows = await listSessions(40);
    const summary = rows.find((s) => s.id === id) || {};
    let body = "";
    let filename = "";
    if (kind === "clipboard") {
      body = (summary.report_text || "").slice(0, 1200);
      filename = `clipboard-${id}.txt`;
    } else if (kind === "jira" || kind === "github") {
      body = toJiraIssue(summary, summary.report_text || "");
      filename = `jira-issue-${id}.md`;
    } else if (kind === "perfetto" || kind === "trace") {
      const events = (summary.spark || []).map((ms, idx) => ({
        name: `DrawFrame_${idx + 1}`,
        cat: "rendering,vsync",
        ph: "X",
        ts: idx * 6944,
        dur: Math.round(ms * 1000),
        pid: 1015,
        tid: 1,
        args: { frame_ms: ms, jank: ms >= 33.3, p95: summary.p95_frame_ms },
      }));
      body = JSON.stringify({ traceEvents: events, displayTimeUnit: "ms" }, null, 2);
      filename = `perfetto-trace-${id}.json`;
    } else if (kind === "csv") {
      const csvLines = ["frame_index,frame_ms,is_jank,timestamp_s,p95_baseline"];
      (summary.spark || []).forEach((ms, idx) => {
        csvLines.push(`${idx + 1},${ms},${ms >= 33.3 ? 1 : 0},${(idx * 0.05).toFixed(3)},${summary.p95_frame_ms}`);
      });
      body = csvLines.join("\n");
      filename = `framedoctor-telemetry-${id}.csv`;
    } else {
      body = toMarkdown(summary, summary.report_text || "", summary.report_source || "on-device");
      filename = `framedoctor-report-${id}.md`;
    }

    const saved = await nativeSave(filename, body);
    if (kind === "clipboard" || kind === "jira") await nativeClipboard(body);

    try {
      const drop = await tryFetch(`/api/sessions/${id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      return { ...drop, body, filename, saved };
    } catch {
      return { id: uid("drop"), session_id: id, filename, kind, body, saved, dropped_at: new Date().toISOString() };
    }
  },

  session: (id) => tryFetch(`/api/sessions/${id}`).catch(async () => (await listSessions(40)).find((s) => s.id === id)),
  sessions: () => listSessions(20).then(async (local) => {
    try {
      const remote = await tryFetch("/api/sessions");
      const map = new Map();
      [...remote, ...local].forEach((s) => map.set(s.id, s));
      return [...map.values()].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 20);
    } catch {
      return local;
    }
  }),
  inbox: () => tryFetch("/api/inbox").catch(() => []),
  liveSession: () => tryFetch("/api/live").catch(() => null),
  tracker: () => tryFetch("/api/tracker").catch(() => ({ phone_use_s: 0, office_kit_drops: 0 })),
  network: () => tryFetch("/api/network").catch(() => null),
  control: (id, action, value = null) =>
    tryFetch(`/api/sessions/${id}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
    }),
  clearSessions: () =>
    tryFetch("/api/sessions/clear", { method: "POST" }).catch(() => ({ ok: true })),
};

export function subscribe(onEvent) {
  if (typeof EventSource === "undefined") return () => {};
  let es;
  try {
    es = new EventSource("/api/stream");
  } catch {
    return () => {};
  }
  ["session", "live", "report", "drop", "control"].forEach((name) => {
    es.addEventListener(name, (e) => {
      try {
        onEvent(name, JSON.parse(e.data));
      } catch {}
    });
  });
  es.onerror = () => {};
  return () => es.close();
}
