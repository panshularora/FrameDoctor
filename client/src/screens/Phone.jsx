import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api, subscribe } from "../api.js";
import { answerQuery, askVoice, createCapture, readBattery, speakText, triggerHaptic } from "../capture.js";
import { nativeAvailable, nativeInfo } from "../native.js";
import { Shader3DCanvas, TriangleMesh } from "../workloads/WebGLLab.jsx";
import DomFeedStress from "../workloads/DomFeed.jsx";
import { FrameHistogram, ScoreRing, SparkChart, generateShareCard } from "../charts.jsx";

gsap.registerPlugin(useGSAP);

function clock() {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

export default function Phone() {
  const [view, setView] = useState("home");
  const [workload, setWorkload] = useState("shader3d");
  const [time, setTime] = useState(clock);
  const [sessions, setSessions] = useState([]);
  const [run, setRun] = useState(null);
  const [hud, setHud] = useState(null);
  const [summary, setSummary] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bomb, setBomb] = useState(false);
  const [toast, setToast] = useState("");
  const [voice, setVoice] = useState(null);
  const [mode144, setMode144] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const cap = useRef(null);
  const started = useRef(0);
  const batteryStart = useRef(null);
  const batterySource = useRef("unavailable");
  const hudRoot = useRef(null);
  const bombRef = useRef(false);
  bombRef.current = bomb;
  const info = nativeInfo();
  const apk = nativeAvailable();

  useEffect(() => {
    const t = setInterval(() => setTime(clock()), 1000);
    api.sessions().then(setSessions).catch(() => {});
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useGSAP(() => {
    if (view !== "stress" || !hudRoot.current) return;
    gsap.from(hudRoot.current, { y: -14, opacity: 0, duration: 0.4, ease: "power3.out" });
  }, { dependencies: [view] });

  const last = sessions.find((s) => s.status === "complete");
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const start = async () => {
    setBusy(true);
    try {
      const s = await api.createSession();
      const bat = await readBattery();
      batteryStart.current = bat.pct;
      batterySource.current = bat.source;
      cap.current = createCapture({ bomb: () => bombRef.current });
      cap.current.start();
      started.current = performance.now();
      setRun(s);
      setHud(null);
      setSummary(null);
      setReport(null);
      setVoice(null);
      setView("stress");
    } finally {
      setBusy(false);
    }
  };

  const stopRef = useRef(async () => {});
  const stop = async () => {
    if (!run || !cap.current) return;
    cap.current.stop();
    const snap = cap.current.snapshot();
    const duration_s = (performance.now() - started.current) / 1000;
    const batEnd = await readBattery();
    setBusy(true);
    try {
      const nativeFrames = snap.nativeFrames || [];
      const frames = (nativeFrames.length > 10 ? nativeFrames : snap.frames).map((f) => ({ ms: f.ms }));
      const analyzed = await api.stop(run.id, {
        frames,
        duration_s,
        battery_start_pct: batteryStart.current,
        battery_end_pct: batEnd.pct,
        heat_series: snap.heatSeries,
        thermal_series_os: snap.thermalOs,
        workload,
        target_hz: mode144 ? 144 : 60,
        sources: {
          frames: nativeFrames.length > 10 ? "choreographer" : "raf",
          thermal: snap.thermalSource,
          battery: batEnd.source || batterySource.current,
          explainer: "on-device",
        },
      });
      setSummary(analyzed);
      triggerHaptic("complete");
      const r = await api.report(run.id);
      setReport({ text: r.text, source: r.source || "on-device" });
      setView("report");
      api.sessions().then(setSessions).catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  stopRef.current = stop;

  useEffect(() => {
    return subscribe((name, data) => {
      if (name !== "control") return;
      if (data.action === "bomb") {
        setBomb((v) => {
          const next = !v;
          triggerHaptic(next ? "bomb" : "hitch");
          return next;
        });
        showToast("LAN co-pilot: overdraw bomb");
      } else if (data.action === "mode144") {
        setMode144(Boolean(data.value));
        showToast(`LAN co-pilot: ${data.value ? "144 Hz" : "60 Hz"} budget`);
      } else if (data.action === "stop") {
        stopRef.current();
        showToast("LAN co-pilot: stop");
      }
    });
  }, []);

  useEffect(() => {
    if (view !== "stress" || !run?.id) return;
    const interval = setInterval(async () => {
      const data = await api.checkControl(run.id);
      if (!data || !data.action) return;
      if (data.action === "bomb") {
        setBomb((v) => {
          const next = !v;
          triggerHaptic(next ? "bomb" : "hitch");
          return next;
        });
        showToast("LAN co-pilot: overdraw bomb");
      } else if (data.action === "mode144") {
        setMode144(Boolean(data.value));
        showToast(`LAN co-pilot: ${data.value ? "144 Hz" : "60 Hz"} budget`);
      } else if (data.action === "stop") {
        stopRef.current();
        showToast("LAN co-pilot: stop");
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [view, run?.id]);

  useEffect(() => {
    if (view !== "stress" || !run) return;
    const id = setInterval(() => {
      const snap = cap.current?.snapshot();
      if (!snap) return;
      const warmed = snap.frames.length > 30 ? snap.frames.slice(25) : snap.frames;
      const recent = warmed.slice(-60).map((f) => f.ms);
      let jitter = 0;
      if (recent.length > 2) {
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const v = recent.reduce((s, m) => s + (m - avg) ** 2, 0) / recent.length;
        jitter = Math.round(Math.sqrt(v) * 10) / 10;
      }
      const live = {
        fps: snap.fps,
        lastMs: snap.lastMs,
        jitter,
        thermal: snap.thermal,
        thermalIndex: snap.thermalIndex,
        thermalSource: snap.thermalSource,
        heat: snap.heat,
        touchHz: snap.touchHz,
        inputLagMs: snap.inputLagMs,
        captureSource: snap.captureSource,
        workload,
        elapsed: (performance.now() - started.current) / 1000,
        recentFrames: recent,
      };
      setHud(live);
      api.live(run.id, live).catch(() => {});
    }, 250);
    return () => clearInterval(id);
  }, [view, run, workload]);

  const exportDrop = async (kind) => {
    if (!run) return;
    setBusy(true);
    try {
      const drop = await api.exportDrop(run.id, kind);
      if (kind === "clipboard") showToast(drop.saved?.native ? "Clipboard + Downloads" : "Copied · paste on PC via Office Kit");
      else if (kind === "jira") showToast("Issue markdown copied");
      else if (kind === "perfetto") {
        const blob = new Blob([drop.body], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = drop.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("Perfetto JSON saved");
      } else {
        showToast(drop.saved?.native ? `Saved ${drop.filename} to Downloads` : `Downloaded ${drop.filename}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const onVoiceQuery = async (presetText = null) => {
    if (presetText) {
      const answer = answerQuery(presetText, summary);
      speakText(answer);
      setVoice({ said: presetText, answer });
      return;
    }
    try {
      const v = await askVoice(summary);
      setVoice(v);
    } catch {
      const fallback = answerQuery("recommendations", summary);
      speakText(fallback);
      setVoice({ said: "Diagnostic summary", answer: fallback });
    }
  };

  return (
    <div className="stage">
      <div className="phone">
        <div className="stripe" aria-hidden="true"><span /><span /><span /></div>
        <div className="status">
          <span>{time}</span>
          <span className="origin-badge">
            {apk ? `${info.device}` : "Browser"} · {online ? "online" : "airplane / offline"}
          </span>
        </div>
        {view === "home" && (
          <Home
            last={last}
            busy={busy}
            onStart={start}
            workload={workload}
            setWorkload={setWorkload}
            mode144={mode144}
            setMode144={setMode144}
            apk={apk}
            info={info}
            online={online}
          />
        )}
        {view === "stress" && (
          <Stress
            hud={hud}
            hudRoot={hudRoot}
            workload={workload}
            bomb={bomb}
            setBomb={(val) => {
              triggerHaptic("bomb");
              setBomb(val);
            }}
            busy={busy}
            onStop={stop}
            mode144={mode144}
          />
        )}
        {view === "report" && (
          <Report
            summary={summary}
            report={report}
            busy={busy}
            voice={voice}
            speaking={speaking}
            onVoiceQuery={onVoiceQuery}
            onReadDiagnosis={() => {
              if (!report?.text) return;
              setSpeaking(true);
              speakText(report.text);
              setTimeout(() => setSpeaking(false), 5000);
            }}
            onExport={exportDrop}
            onAgain={() => setView("home")}
            showToast={showToast}
          />
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Home({ last, busy, onStart, workload, setWorkload, mode144, setMode144, apk, info, online }) {
  const root = useRef(null);
  useGSAP(() => {
    gsap.from(".home-reveal", {
      y: 10, opacity: 0, duration: 0.38, stagger: 0.05, ease: "power3.out",
    });
  }, { scope: root });

  const presets = [
    { id: "shader3d", name: "WebGL mesh", desc: "Icosphere · fragment fill" },
    { id: "feed", name: "DOM feed", desc: "List app · layout thrash" },
    { id: "triangles", name: "GPU triangles", desc: "18k tris · Adreno" },
  ];

  return (
    <section className="home" ref={root}>
      <div className="hero-lab home-reveal">
        <div className="hero-tag">{apk ? "APK · CHOREOGRAPHER" : "PWA · rAF"}</div>
        <Link to="/desk" className="hero-desk-btn">Desk →</Link>
        <div className="hero-status">{apk ? "PowerManager + BatteryManager" : "Estimated thermal until APK"}</div>
      </div>
      <p className="kicker home-reveal">Developer Tools · Chennai</p>
      <h1 className="home-reveal">Frame<br />Doctor</h1>
      <p className="lede home-reveal">
        Phone is the device under test. Measure, diagnose, drop the file through Office Kit.
      </p>

      <div className="bridge-bar home-reveal">
        <span className={`source-pill ${apk ? "os" : "est"}`}>{apk ? "OS sensors" : "Browser"}</span>
        <span className="source-pill">{info.refreshHz ? `${Math.round(info.refreshHz)} Hz` : "Hz n/a"}</span>
        <span className="source-pill">{online ? "online" : "offline"}</span>
      </div>

      <div className="workload-section home-reveal">
        <span className="section-label">Workload</span>
        <div className="workload-grid">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`workload-card ${workload === p.id ? "active" : ""}`}
              onClick={() => setWorkload(p.id)}
            >
              <span className="workload-name">{p.name}</span>
              <span className="workload-desc">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mode-bar home-reveal">
        <span className="mode-title">{mode144 ? "6.94 ms" : "16.67 ms"}</span>
        <div className="mode-pills">
          <button type="button" className={`mode-pill ${mode144 ? "active" : ""}`} onClick={() => setMode144(true)}>144 Hz</button>
          <button type="button" className={`mode-pill ${!mode144 ? "active" : ""}`} onClick={() => setMode144(false)}>60 Hz</button>
        </div>
      </div>

      <button className="go home-reveal" onClick={onStart} disabled={busy}>
        {busy ? "Arming samplers…" : "Start session"}
      </button>

      <div className="last home-reveal">
        {last ? (
          <div className="last-box">
            <div className="last-score-dial">
              <b>{last.score ?? "—"}</b>
              <small>/100</small>
            </div>
            <div className="last-details">
              <b>{last.p95_frame_ms} ms p95 · {(last.score_tier || "").split("—")[0].trim()}</b>
              <span>{last.duration_s}s · PJI ±{last.pji} · {last.jank_frames} jank</span>
            </div>
          </div>
        ) : (
          <span>No session yet — core loop works offline.</span>
        )}
      </div>
    </section>
  );
}

function Stress({ hud, hudRoot, workload, bomb, setBomb, busy, onStop, mode144 }) {
  const [hitchFlash, setHitchFlash] = useState(false);
  const lastMs = useRef(0);

  useEffect(() => {
    if (!hud) return;
    if (hud.lastMs > 33 && hud.lastMs !== lastMs.current) {
      setHitchFlash(true);
      triggerHaptic("hitch");
      setTimeout(() => setHitchFlash(false), 420);
    }
    lastMs.current = hud.lastMs;
  }, [hud]);

  const fpsColor = !hud ? "#f5c518" : hud.fps >= 130 ? "#ff4d1a" : hud.fps >= 90 ? "#f5c518" : "#ff2e2e";
  const labels = {
    shader3d: "WEBGL MESH",
    feed: "DOM FEED",
    triangles: "GPU TRIS",
  };

  return (
    <section className="stress">
      {hitchFlash && <div className="hitch-ring" aria-hidden="true" />}
      <div className="hud" ref={hudRoot}>
        <div className="hud-top">
          <span className="live-dot-container">
            <span className="live-dot" />
            {mode144 ? "144 Hz" : "60 Hz"} · {labels[workload] || "BENCH"}
          </span>
          <span className="hud-elapsed">{hud ? `${hud.elapsed?.toFixed(1)}s` : "sync"}</span>
        </div>
        <div className="hud-grid">
          <div className="metric">
            <b style={{ color: fpsColor }}>{hud?.fps ?? "—"}</b>
            <em>FPS</em>
          </div>
          <div className="metric">
            <b>{hud?.lastMs ?? "—"}</b>
            <em>Frame ms</em>
          </div>
          <div className="metric">
            <b style={{ color: (hud?.jitter ?? 0) <= 0.8 ? "#00b4e0" : "#f5c518" }}>±{hud?.jitter ?? "—"}</b>
            <em>PJI</em>
          </div>
          <div className={`metric thermal-tag-${hud?.thermalSource === "os" ? (hud?.thermalIndex ?? 0) : 0}`}>
            <b>{hud?.thermalSource === "os" ? (hud?.thermal ?? "—") : `${Math.round((hud?.heat ?? 0) * 100)}%`}</b>
            <em>{hud?.thermalSource === "os" ? "OS thermal" : "est. load"}</em>
          </div>
        </div>
        <div className="heat-wrap" aria-hidden="true">
          <div
            className="heat-fill"
            style={{
              transform: `scaleX(${Math.max(0.08, hud?.heat ?? 0.08)})`,
              background: hud?.heat > 0.72
                ? "linear-gradient(90deg,#ff4d1a,#ff2e2e)"
                : "linear-gradient(90deg,#00b4e0,#6b4cff,#ff4d1a)",
            }}
          />
        </div>
        <FrameHistogram frames={hud?.recentFrames ?? []} mode144={mode144} />
      </div>

      <div className="stress-list">
        {workload === "shader3d" && <Shader3DCanvas bomb={bomb} heat={hud?.heat ?? 0.06} />}
        {workload === "feed" && <DomFeedStress bomb={bomb} />}
        {workload === "triangles" && <TriangleMesh bomb={bomb} heat={hud?.heat ?? 0.06} />}
      </div>
      {bomb && <div className="stress-bomb" />}

      <div className="dock">
        <button className={`ghost ${bomb ? "bomb-active" : ""}`} onClick={() => setBomb((v) => !v)}>
          {bomb ? "Bomb on" : "Overdraw bomb"}
        </button>
        <button className="go" onClick={onStop} disabled={busy}>
          {busy ? "Reading traces…" : "Stop & diagnose"}
        </button>
      </div>
    </section>
  );
}

function Report({ summary, report, busy, voice, speaking, onVoiceQuery, onReadDiagnosis, onExport, onAgain, showToast }) {
  const reportRoot = useRef(null);
  useGSAP(() => {
    if (!reportRoot.current) return;
    gsap.from(".report-reveal", {
      y: 10, opacity: 0, duration: 0.4, stagger: 0.05, ease: "power3.out",
    });
  }, { scope: reportRoot });

  const handleShareCard = useCallback(() => {
    const canvas = generateShareCard(summary);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `framedoctor-${summary?.session_id?.slice(0, 8) ?? "run"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }, [summary]);

  const src = summary?.sources || {};
  const explainerLabel =
    report?.source === "spacexai"
      ? "SpaceXAI rewrite · Green Light cloud"
      : "On-device trace doctor";

  return (
    <section className="report" ref={reportRoot}>
      <div className="report-header report-reveal">
        <div>
          <p className="kicker">
            {summary?.session_id?.slice(0, 8)} · {(summary?.workload || "").toUpperCase()} · {src.frames || "raf"}
          </p>
          <h1>Diagnostic</h1>
        </div>
        <Link to="/desk" className="report-desk-btn">Desk →</Link>
      </div>

      <div className="score-card report-reveal">
        <ScoreRing score={summary?.score ?? 0} />
        <div className="score-details">
          <div className={`tier-tag${(summary?.score ?? 0) >= 90 ? " tier-glow" : ""}`}>
            {summary?.score_tier ?? "—"}
          </div>
          <p className="benchmark-p95">PJI ±{summary?.pji ?? "—"} ms · {summary?.pji_rating}</p>
          <p className="benchmark-cooling">{summary?.benchmark?.p95_vs_budget}</p>
        </div>
      </div>

      <div className="instruments report-reveal">
        <div className="dial">
          <b>{summary?.p95_frame_ms ?? "—"} <small>ms</small></b>
          <em>p95</em>
        </div>
        <div className="dial">
          <b>{summary?.jank_frames ?? "—"} <small>/{summary?.total_frames ?? "—"}</small></b>
          <em>jank</em>
        </div>
        <div className="dial">
          <b>{src.thermal === "os" ? (summary?.peak_thermal ?? "—") : "n/a"}</b>
          <em>{src.thermal === "os" ? "OS thermal" : "est. not scored"}</em>
        </div>
        <div className="dial">
          <b>{src.thermal === "os" && summary?.first_throttle_s != null ? `${summary.first_throttle_s}s` : "—"}</b>
          <em>first moderate</em>
        </div>
      </div>

      <div className="spark-wrapper report-reveal">
        <div className="spark-legend">
          <span>Frame ms</span>
          <span>budget {summary?.benchmark?.budget_ms ?? 6.94} ms</span>
        </div>
        <SparkChart spark={summary?.spark ?? []} />
      </div>

      {summary?.fixes?.[0] && (
        <p className="pitch-rec report-reveal">Next: {summary.fixes[0].title}</p>
      )}

      <div className="actions report-reveal">
        <button className="go" disabled={busy} onClick={() => onExport("file")}>
          Save .md to Downloads
        </button>
        <p className="honesty-note" style={{ margin: "0 2px 8px" }}>
          Then drag that file in vivo Office Kit. This page is not Office Kit.
        </p>
        <div className="actions-row">
          <button className="ghost" disabled={busy} onClick={() => onExport("clipboard")}>Super Clipboard</button>
          <button className="ghost" onClick={onAgain}>Run again</button>
        </div>
      </div>

      <details className="more-details">
        <summary>Fixes, voice, extra exports</summary>
        {summary?.fixes?.length > 0 && (
          <div className="fixes-card">
            <div className="fixes-header">
              <span className="npu-badge">Fixes from this trace</span>
              <span className="fixes-count">{summary.fixes.length}</span>
            </div>
            <div className="fixes-list">
              {summary.fixes.map((f) => (
                <div key={f.title} className="fix-item">
                  <div className="fix-top">
                    <span className="fix-title">{f.title}</span>
                    <span className="fix-impact">{f.impact}</span>
                  </div>
                  <pre className="fix-code">{f.code}</pre>
                  <button
                    type="button"
                    className="fix-copy-btn"
                    onClick={() => navigator.clipboard.writeText(f.code).then(() => showToast("Copied fix"))}
                  >
                    Copy snippet
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="explainer-card">
          <div className="explainer-top">
            <span className="npu-badge">{explainerLabel}</span>
            <button type="button" className="audio-btn" onClick={onReadDiagnosis} disabled={speaking}>
              {speaking ? "Speaking…" : "Read aloud"}
            </button>
          </div>
          <p className="prose">{report?.text}</p>
        </div>
        <div className="voice-section">
          <p className="kicker">Voice over this session JSON</p>
          <div className="query-chips">
            <button type="button" className="query-chip" onClick={() => onVoiceQuery("What happened at 15 seconds?")}>At 15s</button>
            <button type="button" className="query-chip" onClick={() => onVoiceQuery("Why did it throttle?")}>Thermals</button>
            <button type="button" className="query-chip" onClick={() => onVoiceQuery("Give me recommendations")}>Fixes</button>
            <button type="button" className="query-chip highlight" onClick={() => onVoiceQuery(null)}>Mic</button>
          </div>
          {voice && (
            <div className="voice-bubble">
              <span className="voice-prompt">“{voice.said}”</span>
              <p className="voice-reply">{voice.answer}</p>
            </div>
          )}
        </div>
        <div className="actions-row" style={{ marginBottom: 10 }}>
          <button className="ghost" disabled={busy} onClick={() => onExport("jira")}>Jira / GitHub issue</button>
          <button className="ghost" disabled={busy} onClick={() => onExport("perfetto")}>Perfetto JSON</button>
        </div>
        <button className="ghost" onClick={handleShareCard}>Share PNG</button>
        <Link className="desk-link" to="/desk">Verify paste on laptop →</Link>
      </details>
    </section>
  );
}
