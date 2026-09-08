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
    const localId = uid("run");
    const local = { id: localId, session_id: localId, status: "running", created_at: new Date().toISOString() };
    await saveSession(local);
    try {
      const s = await tryFetch("/api/sessions", { method: "POST" });
      if (s && s.id) {
        local.remoteId = s.id;
        local.id = s.id;
        local.session_id = s.id;
        await saveSession(local);
      }
      return local;
    } catch {
      return local;
    }
  },

  async live(id, payload) {
    if (!id) return;
    try {
      await tryFetch(`/api/sessions/${id}/live`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {}
  },

  async stop(id, payload) {
    const safeId = id || uid("run");
    const summary = analyzeSession({ id: safeId, ...payload });
    const text = templateReport(summary);
    const session = {
      id: safeId,
      session_id: safeId,
      created_at: new Date().toISOString(),
      status: "complete",
      ...summary,
      report_text: text,
      report_source: "on-device",
      markdown: toMarkdown(summary, text, "on-device"),
    };
    await saveSession(session);
    try {
      const remote = await tryFetch(`/api/sessions/${safeId}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (remote && remote.score != null) {
        return { ...session, ...remote, report_text: session.report_text, report_source: "on-device" };
      }
      return session;
    } catch {
      return session;
    }
  },

  async report(id) {
    const local = (await listSessions(40)).find((s) => s.id === id);
    const fallbackText = local?.report_text || (local ? templateReport(local) : "FrameDoctor on-device diagnosis complete.");
    const fallback = {
      text: fallbackText,
      source: "on-device",
    };
    try {
      const r = await tryFetch(`/api/sessions/${id}/report`, { method: "POST" });
      if (r && r.text) return { text: r.text, source: r.source === "model" ? "spacexai" : r.source || "on-device" };
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
        cat: "rendering,vsync,iqoo15",
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
    if (kind === "clipboard" || kind === "jira") {
      await nativeClipboard(body);
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(body).catch(() => {});
      }
    }

    // Direct browser download trigger
    if (typeof window !== "undefined" && (kind === "file" || kind === "perfetto" || kind === "csv" || kind === "markdown")) {
      try {
        const mime = kind === "perfetto" ? "application/json" : kind === "csv" ? "text/csv" : "text/markdown;charset=utf-8";
        const blob = new Blob([body], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {}
    }

    try {
      const drop = await tryFetch(`/api/sessions/${id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (drop && drop.filename) {
        return { ...drop, body, filename, saved };
      }
      return { id: uid("drop"), session_id: id, filename, kind, body, saved, dropped_at: new Date().toISOString() };
    } catch {
      return { id: uid("drop"), session_id: id, filename, kind, body, saved, dropped_at: new Date().toISOString() };
    }
  },

  session: (id) => tryFetch(`/api/sessions/${id}`).catch(async () => (await listSessions(40)).find((s) => s.id === id)),
  sessions: () =>
    listSessions(20).then(async (local) => {
      try {
        const remote = await tryFetch("/api/sessions");
        const remoteList = Array.isArray(remote) ? remote : [];
        const localList = Array.isArray(local) ? local : [];
        const map = new Map();
        [...remoteList, ...localList].forEach((s) => {
          if (s && s.id) map.set(s.id, s);
        });
        return [...map.values()].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 20);
      } catch {
        return Array.isArray(local) ? local : [];
      }
    }),
  inbox: async () => {
    try {
      const r = await tryFetch("/api/inbox");
      return Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  },
  liveSession: async () => {
    try {
      const r = await tryFetch("/api/live");
      return r && r.live ? r : null;
    } catch {
      return null;
    }
  },
  tracker: async () => {
    try {
      const r = await tryFetch("/api/tracker");
      if (r && typeof r.phone_use_s === "number") return r;
      return { phone_use_s: 0, office_kit_drops: 0 };
    } catch {
      return { phone_use_s: 0, office_kit_drops: 0 };
    }
  },
  network: () => tryFetch("/api/network").catch(() => null),
  control: (id, action, value = null) =>
    tryFetch(`/api/sessions/${id}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
    }).catch(() => ({ ok: false })),
  checkControl: async (id) => {
    if (!id) return null;
    try {
      const r = await tryFetch(`/api/sessions/${id}/control`);
      return r && r.action ? r : null;
    } catch {
      return null;
    }
  },
  clearSessions: async () => {
    try {
      await tryFetch("/api/sessions/clear", { method: "POST" });
    } catch {}
    return { ok: true };
  },
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
  return () => {
    try {
      es.close();
    } catch {}
  };
}
