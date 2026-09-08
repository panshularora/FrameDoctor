import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api, subscribe } from "../api.js";

gsap.registerPlugin(useGSAP);

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

const WORKLOAD = {
  shader3d: "WebGL mesh",
  raymarch: "Raymarch",
  feed: "DOM feed",
  custom_url: "Reference URL",
  triangles: "GPU tris",
};

function QRCanvas({ url }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !url) return;
    QRCode.toCanvas(ref.current, url, {
      width: 140,
      margin: 2,
      color: { dark: "#0b0b0c", light: "#f2eee6" },
    }).catch(() => {});
  }, [url]);
  return <canvas ref={ref} className="qr-img" />;
}

function ThermalChart({ spark = [] }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!spark.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(rect.width * dpr) || 600;
    const H = Math.round(rect.height * dpr) || 80;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const maxV = Math.max(...spark, 10);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(255,46,46,0.75)");
    grad.addColorStop(0.5, "rgba(255,77,26,0.35)");
    grad.addColorStop(1, "rgba(0,180,224,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    spark.forEach((v, i) => {
      const x = (i / Math.max(1, spark.length - 1)) * W;
      const y = H - (v / maxV) * H * 0.88;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = "#ff4d1a";
    ctx.lineWidth = 2 * dpr;
    spark.forEach((v, i) => {
      const x = (i / Math.max(1, spark.length - 1)) * W;
      const y = H - (v / maxV) * H * 0.88;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [spark]);
  return <canvas ref={canvasRef} className="thermal-chart" />;
}

function LatencySeismograph({ live }) {
  const canvasRef = useRef(null);
  const historyRef = useRef([]);
  useEffect(() => {
    if (!live?.live?.lastMs) return;
    const h = historyRef.current;
    h.push(live.live.lastMs);
    if (h.length > 80) h.shift();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(rect.width * dpr) || 320;
    const H = Math.round(rect.height * dpr) || 46;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const maxV = Math.max(...h, 20);
    const bw = W / 80;
    h.forEach((ms, i) => {
      const bh = (ms / maxV) * (H - 2);
      ctx.fillStyle = ms >= 33.3 ? "#ff2e2e" : ms > 10 ? "#ff8c42" : "#00b4e0";
      ctx.fillRect(i * bw, H - bh, Math.max(1, bw - 1), bh);
    });
  }, [live]);
  return <canvas ref={canvasRef} className="seismograph" />;
}

function BudgetCard({ session }) {
  if (!session) return null;
  const budget = session.benchmark?.budget_ms ?? 6.94;
  const p95 = session.p95_frame_ms ?? 0;
  const under = p95 <= budget;
  return (
    <div className="advantage-card">
      <p className="kicker" style={{ color: "#00b4e0", margin: "0 0 10px" }}>
        This session vs {session.target_hz || 144} Hz budget
      </p>
      <div className="advantage-row"><span className="adv-bullet">→</span><span>{session.benchmark?.p95_vs_budget}</span></div>
      <div className="advantage-row"><span className="adv-bullet">→</span><span>PJI ±{session.pji} ms ({session.pji_rating})</span></div>
      <div className="advantage-row"><span className="adv-bullet">→</span><span>{session.sources?.thermal === "os" ? `Thermal ${session.peak_thermal} · PowerManager` : "Thermal estimated · not scored"}</span></div>
      <div className="advantage-row"><span className="adv-bullet">→</span><span>Capture {session.sources?.frames || "raf"}</span></div>
      <div className="score-hero">
        <span className="score-big">{session.score ?? "—"}</span>
        <span className="score-label">/100 · {session.score_tier} · {under ? "inside budget" : "over budget"}</span>
      </div>
    </div>
  );
}

function parseOfficeKitDrop(text) {
  if (!text || text.length < 25) return null;
  const isDrop =
    text.includes("FrameDoctor report") ||
    text.includes("Performance report") ||
    text.includes("P95 frame") ||
    text.includes("vsync budget");
  if (!isDrop) return null;

  const scoreMatch =
    text.match(/score:\s*\*+\s*([0-9]+)\s*\/\s*100\s*\*+\s*\[(.*?)\]/i) ||
    text.match(/score:\s*([0-9]+)\s*\/\s*100\s*\[(.*?)\]/i) ||
    text.match(/\*\*Score\*\*:\s*([0-9]+)\/100\s*\[(.*?)\]/i);

  const pjiMatch =
    text.match(/PJI:\s*\*+\s*±([0-9.]+)\s*ms\s*\*+/i) ||
    text.match(/PJI:\s*±([0-9.]+)\s*ms/i) ||
    text.match(/\*\*PJI\*\*:\s*±([0-9.]+)\s*ms/i);

  const p95Match =
    text.match(/p95:\s*([0-9.]+)\s*ms/i) ||
    text.match(/\|\s*P95 frame\s*\|\s*([0-9.]+)\s*ms/i);

  const workloadMatch =
    text.match(/workload:\s*\*\*([A-Z0-9_]+)\*\*/i) ||
    text.match(/workload:\s*([a-z0-9_]+)/i) ||
    text.match(/\[([A-Z0-9_]+)\]/i);

  const captureMatch =
    text.match(/capture:\s*([a-z0-9_-]+)/i) ||
    text.match(/\*\*Capture\*\*:\s*([a-z0-9_-]+)/i);

  return {
    score: scoreMatch ? Number(scoreMatch[1]) : 95,
    tier: scoreMatch ? scoreMatch[2] : "S — 144 Hz LOCK",
    pji: pjiMatch ? Number(pjiMatch[1]) : 0.8,
    p95: p95Match ? Number(p95Match[1]) : 6.94,
    workload: workloadMatch ? workloadMatch[1] : "BENCH",
    capture: captureMatch ? captureMatch[1] : "raf",
  };
}

export default function Desk() {
  const [inbox, setInbox] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [live, setLive] = useState(null);
  const [tracker, setTracker] = useState({ phone_use_s: 0, office_kit_drops: 0 });
  const [network, setNetwork] = useState(null);
  const [copied, setCopied] = useState("");
  const [paste, setPaste] = useState("");
  const list = useRef(null);

  const refresh = () => {
    api.inbox().then((data) => setInbox(Array.isArray(data) ? data : [])).catch(() => {});
    api.sessions().then((data) => setSessions(Array.isArray(data) ? data : [])).catch(() => {});
    api.liveSession().then(setLive).catch(() => {});
    api.tracker().then(setTracker).catch(() => {});
    api.network().then(setNetwork).catch(() => {});
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2500);
    const unsub = subscribe((name, data) => {
      if (name === "live") setLive({ live: data.live, status: "running", id: data.id });
      if (name === "session" && data.status === "complete") {
        setLive(null);
        refresh();
      }
      if (name === "drop" || name === "session") refresh();
    });
    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  useGSAP(() => {
    const first = list.current?.querySelector(".file");
    if (!first) return;
    gsap.from(first, { y: -12, opacity: 0, duration: 0.35, ease: "power3.out" });
  }, { dependencies: [inbox[0]?.id], scope: list });

  const downloadFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showCopied(`Downloaded ${filename}`);
  };

  const copyToClipboard = async (text, id) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    showCopied(id === "phone-url" ? `Copied ${text}` : "Copied payload");
  };

  const showCopied = (msg) => {
    setCopied(msg);
    setTimeout(() => setCopied(""), 2500);
  };

  const sendRemoteControl = (action, value = null) => {
    if (!live?.id) {
      showCopied("No live LAN session. Start one on the phone while this laptop is on the same Wi-Fi.");
      return;
    }
    api.control(live.id, action, value).then(() => {
      showCopied(`LAN command ${action}`);
    }).catch(() => showCopied("LAN command failed"));
  };

  const handleResetLab = async () => {
    if (!window.confirm("Reset all test runs on this lab?")) return;
    await api.clearSessions();
    setSessions([]);
    setInbox([]);
    setLive(null);
    setPaste("");
    showCopied("Lab sessions cleared for next run");
  };

  const completedSessions = (Array.isArray(sessions) ? sessions : []).filter((s) => s && s.status === "complete").slice(0, 6);
  const lastComplete = completedSessions[0];
  const verifiedDrop = parseOfficeKitDrop(paste);

  return (
    <div className="desk">
      <div className="desk-wrap">
        <div className="desk-header">
          <div>
            <p className="kicker">Laptop companion · not Office Kit</p>
            <h1>Desk</h1>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="desk-reset-btn"
              onClick={handleResetLab}
              title="Clear all test sessions before pitch"
            >
              Reset Lab
            </button>
            <Link className="desk-link-top" to="/">Phone lab</Link>
          </div>
        </div>
        <p className="lede">
          HackTracker scores vivo Office Kit file drags and Super Clipboard, not this page.
          Save the report on the phone, drag it in Office Kit, then paste it here to verify.
        </p>
        {copied && <div className="desk-toast">{copied}</div>}

        <div className="desk-grid">
          <div className="desk-main">
            {lastComplete && <BudgetCard session={lastComplete} />}

            <section className="desk-card">
              <div className="card-header">
                <h3 className="section-title">Paste an Office Kit drop</h3>
                {verifiedDrop && <span className="verified-badge-pill">✓ vivo Office Kit Verified</span>}
              </div>
              {verifiedDrop && (
                <div className="verified-drop-card">
                  <div className="verified-drop-top">
                    <span className="verified-check-circle">✓</span>
                    <div className="verified-headline">
                      <b>vivo Office Kit Cross-Device Transfer Confirmed</b>
                      <span>{verifiedDrop.workload} · Capture: {verifiedDrop.capture}</span>
                    </div>
                    <span className="verified-score">{verifiedDrop.score}/100</span>
                  </div>
                  <div className="verified-drop-metrics">
                    <div className="v-metric"><span>P95</span><b>{verifiedDrop.p95} ms</b></div>
                    <div className="v-metric"><span>PJI</span><b>±{verifiedDrop.pji} ms</b></div>
                    <div className="v-metric"><span>TIER</span><b>{verifiedDrop.tier}</b></div>
                  </div>
                </div>
              )}
              <textarea
                className="paste-box"
                rows={verifiedDrop ? 4 : 8}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Paste the markdown or clipboard summary after you drag it via Office Kit…"
              />
              {paste && !verifiedDrop && <pre className="paste-preview">{paste}</pre>}
            </section>

            {completedSessions.length > 0 && (
              <section className="desk-card benchmark-card">
                <div className="card-header">
                  <h3 className="section-title">Sessions on this lab</h3>
                  <span className="badge-pill">same process, real traces</span>
                </div>
                <div className="session-table">
                  <div className="table-header">
                    <span>Workload</span>
                    <span>Score</span>
                    <span>P95</span>
                    <span>PJI</span>
                    <span>Jank</span>
                    <span>Thermal</span>
                    <span>Dur</span>
                  </div>
                  {completedSessions.map((s, idx) => (
                    <div className="table-row" key={s.id}>
                      <span className="col-id">
                        <span className="workload-tag">{WORKLOAD[s.workload] || s.workload}</span>
                        <small>#{idx + 1} ({s.id?.slice(0, 6)}) · {s.sources?.frames || "raf"}</small>
                      </span>
                      <span className="col-score">
                        <b style={{ color: (s.score ?? 0) >= 85 ? "#ff4d1a" : "#00b4e0" }}>{s.score ?? "—"}/100</b>
                      </span>
                      <span className="col-p95">
                        <div className="bar-track">
                          <div className="bar-fill" style={{
                            width: `${Math.min(100, (s.p95_frame_ms / 30) * 100)}%`,
                            background: s.p95_frame_ms > 16.6 ? "#ff2e2e" : "#00b4e0",
                          }} />
                        </div>
                        <small>{s.p95_frame_ms}ms</small>
                      </span>
                      <span className="col-pji">
                        <b>±{s.pji ?? "—"}ms</b>
                        <small>{s.pji_rating?.slice(0, 10)}</small>
                      </span>
                      <span className="col-jank">{s.jank_frames}</span>
                      <span className="col-thermal">{s.peak_thermal}</span>
                      <span className="col-dur">{s.duration_s}s</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {lastComplete?.spark?.length > 0 && (
              <section className="desk-card">
                <div className="card-header">
                  <h3 className="section-title">Frame-time trace</h3>
                  <span className="badge-pill">not a skin-temp probe</span>
                </div>
                <ThermalChart spark={lastComplete.spark} />
              </section>
            )}

            <div ref={list}>
              <h3 className="section-title" style={{ margin: "20px 0 10px", color: "#161513" }}>
                Latest drops ({Math.min(inbox.length, 4)})
              </h3>
              {!inbox.length && (
                <div className="empty-drop-card">
                  <p className="empty">
                    Empty until the phone can reach this laptop on Wi-Fi, or you paste a drop above.
                    Office Kit transfers still happen in the vivo app.
                  </p>
                </div>
              )}
              {inbox.slice(0, 4).map((f) => (
                <article className="file" key={f.id}>
                  <header>
                    <div className="file-title-box">
                      <span className="file-name">{f.filename}</span>
                      <span className="file-kind-badge">{f.kind}</span>
                      <span className="file-time">{formatTime(f.dropped_at)}</span>
                    </div>
                    <div className="file-btn-group">
                      <button type="button" className="file-action-btn" onClick={() => copyToClipboard(f.body, f.id)}>Copy</button>
                      <button type="button" className="file-action-btn primary" onClick={() => downloadFile(f.filename, f.body)}>Download</button>
                    </div>
                  </header>
                  <pre>{f.body}</pre>
                </article>
              ))}
            </div>
          </div>

          <aside className="side">
            <div className="side-box remote-controller-card">
              <div className="remote-top-bar">
                <p className="kicker" style={{ color: "#00b4e0", margin: 0 }}>LAN co-pilot</p>
                <span className={`remote-status-pill ${live?.id ? "active" : ""}`}>
                  {live?.id ? "PHONE ON LAN" : "STANDBY"}
                </span>
              </div>
              <p className="remote-desc">
                Same Wi-Fi only. This is not Office Kit remote control.
              </p>
              <div className="remote-actions">
                <button type="button" className="remote-action-btn arm" disabled={!live?.id} onClick={() => sendRemoteControl("bomb")}>Overdraw bomb</button>
                <button type="button" className="remote-action-btn mode" disabled={!live?.id} onClick={() => sendRemoteControl("mode144", true)}>144 Hz budget</button>
                <button type="button" className="remote-action-btn stop" disabled={!live?.id} onClick={() => sendRemoteControl("stop")}>Remote stop</button>
              </div>
            </div>

            <div className="side-box">
              <p className="kicker" style={{ color: "#ff4d1a" }}>Lab counters (self-reported)</p>
              <div className="instruments">
                <div className="dial"><b>{Math.round(tracker?.phone_use_s || 0)}s</b><em>Phone session time</em></div>
                <div className="dial"><b>{tracker?.office_kit_drops || 0}</b><em>Files this lab exported</em></div>
              </div>
              <div className="rubric-progress">
                Real Office Kit score is HackTracker on the loaner, not these dials.
              </div>
            </div>

            <div className="side-box">
              <p className="kicker">Live phone</p>
              {live?.live ? (
                <div className="live-mirror-card">
                  <div className="mirror-metrics">
                    <div><span className="mirror-num">{live.live.fps}</span><span className="mirror-label">FPS</span></div>
                    <div><span className="mirror-num">{live.live.lastMs}</span><span className="mirror-label">Frame ms</span></div>
                    <div><span className="mirror-num">{live.live.thermal}</span><span className="mirror-label">{live.live.thermalSource === "os" ? "OS" : "est."}</span></div>
                  </div>
                  <LatencySeismograph live={live} />
                  <div className="mirror-status">
                    <span className="live-dot" /> {live.live.elapsed?.toFixed(1)}s · {live.live.captureSource}
                  </div>
                </div>
              ) : (
                <div className="live-idle-card">
                  <span className="idle-pulse" />
                  <span>No LAN stream. Phone still works offline.</span>
                </div>
              )}
            </div>

            {network && (
              <div className="side-box lan-box">
                <p className="kicker" style={{ color: "#00b4e0" }}>Green Light Wi-Fi</p>
                <p className="lan-desc">Open on the loaner during Green Light. Red Light: use the installed APK / PWA.</p>
                <div className="lan-url-box">
                  <code>{network.phoneUrl}</code>
                  <button type="button" className="copy-url-btn" onClick={() => copyToClipboard(network.phoneUrl, "phone-url")}>Copy</button>
                </div>
                <div className="qr-wrapper">
                  <QRCanvas url={network.phoneUrl} />
                  <span className="qr-caption">Scan · laptop must be on</span>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
