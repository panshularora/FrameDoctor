import { useEffect, useState, useRef } from "react";

export function FrameHistogram({ frames = [], mode144 }) {
  const canvasRef = useRef(null);
  const target = mode144 ? 6.94 : 16.67;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(rect.width * dpr) || 360;
    const H = Math.round(rect.height * dpr) || 38;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const bars = frames.slice(-60);
    if (!bars.length) return;
    const maxVal = Math.max(...bars, target * 2.5, 14);
    const bw = W / 60;
    bars.forEach((ms, i) => {
      const bh = (ms / maxVal) * (H - 2);
      ctx.fillStyle = ms >= 33.3 ? "#ff2e2e" : ms > target * 1.5 ? "#ff8c42" : "#f5c518";
      ctx.fillRect(i * bw + 0.5, H - bh, Math.max(1, bw - 1), bh);
    });
    const ty = H - (target / maxVal) * (H - 2);
    ctx.strokeStyle = "rgba(0,180,224,0.7)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(W, ty);
    ctx.stroke();
  }, [frames, target]);

  return <canvas ref={canvasRef} className="frame-histogram" />;
}

export function ScoreRing({ score = 0 }) {
  const RADIUS = 38;
  const CIRC = 2 * Math.PI * RADIUS;
  const [drawn, setDrawn] = useState(0);

  useEffect(() => {
    let start = null;
    const duration = 900;
    const target = (score / 100) * CIRC;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setDrawn(eased * target);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score, CIRC]);

  return (
    <div className="score-ring-svg-wrap">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="48" cy="48" r={RADIUS}
          fill="none" stroke="url(#sg)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${drawn} ${CIRC - drawn}`}
          transform="rotate(-90 48 48)"
        />
        <defs>
          <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff4d1a" />
            <stop offset="100%" stopColor="#f5c518" />
          </linearGradient>
        </defs>
        <text x="48" y="50" textAnchor="middle" fontSize="22" fontWeight="700"
          fontFamily="'Chakra Petch',sans-serif" fill="#f5c518">{score}</text>
        <text x="48" y="64" textAnchor="middle" fontSize="9" fontWeight="600"
          fontFamily="'IBM Plex Mono',monospace" fill="#9b958c">/ 100</text>
      </svg>
    </div>
  );
}

export function SparkChart({ spark = [] }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!spark.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(rect.width * dpr) || 360;
    const H = (Math.round(rect.height * dpr) || 76) - 8 * dpr;
    canvas.width = W;
    canvas.height = Math.round(rect.height * dpr) || 76;
    const ctx = canvas.getContext("2d");
    const maxV = Math.max(...spark, 10);
    ctx.clearRect(0, 0, W, canvas.height);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(245,197,24,0.22)");
    grad.addColorStop(1, "rgba(245,197,24,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    spark.forEach((v, idx) => {
      const x = (idx / Math.max(1, spark.length - 1)) * W;
      const y = H - (v / maxV) * H;
      idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 2 * dpr;
    spark.forEach((v, idx) => {
      const x = (idx / Math.max(1, spark.length - 1)) * W;
      const y = H - (v / maxV) * H;
      idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    spark.forEach((v, idx) => {
      if (v >= 33.3) {
        const x = (idx / Math.max(1, spark.length - 1)) * W;
        ctx.fillStyle = "#ff2e2e";
        ctx.fillRect(x - 1 * dpr, 0, 2.5 * dpr, H);
      }
    });
  }, [spark]);
  return <canvas ref={canvasRef} className="spark-canvas" />;
}

export function generateShareCard(summary) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 440;
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, 800, 440);
  bg.addColorStop(0, "#0b0b0c");
  bg.addColorStop(1, "#1a0800");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 440);
  ctx.fillStyle = "#00b4e0"; ctx.fillRect(0, 0, 267, 6);
  ctx.fillStyle = "#6b4cff"; ctx.fillRect(267, 0, 267, 6);
  ctx.fillStyle = "#ff4d1a"; ctx.fillRect(534, 0, 266, 6);
  ctx.font = "bold 50px 'Chakra Petch', sans-serif";
  ctx.fillStyle = "#f2eee6";
  ctx.fillText("FRAME DOCTOR", 48, 76);
  ctx.font = "12px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "#9b958c";
  ctx.fillText(`iQOO 15 · ${(summary?.workload || "shader").toUpperCase()} · this process only`, 48, 104);
  ctx.fillStyle = "rgba(255,77,26,0.15)";
  ctx.fillRect(48, 130, 220, 185);
  ctx.font = "bold 90px 'Chakra Petch', sans-serif";
  ctx.fillStyle = "#f5c518";
  ctx.fillText(String(summary?.score ?? 0), 60, 252);
  ctx.font = "bold 14px 'Chakra Petch', sans-serif";
  ctx.fillStyle = "#ff4d1a";
  ctx.fillText(String(summary?.score_tier ?? "").slice(0, 22), 60, 288);
  const metrics = [
    ["P95 FRAME", `${summary?.p95_frame_ms ?? "—"} ms`],
    ["PJI", `±${summary?.pji ?? "—"} ms`],
    ["JANK", `${summary?.jank_frames ?? 0}/${summary?.total_frames ?? 0}`],
    ["THERMAL", `${summary?.peak_thermal ?? "—"} · ${summary?.sources?.thermal || ""}`],
  ];
  metrics.forEach(([label, val], i) => {
    const x = 300 + (i % 2) * 235;
    const y = 175 + Math.floor(i / 2) * 95;
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "#9b958c";
    ctx.fillText(label, x, y);
    ctx.font = "bold 22px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#f2eee6";
    ctx.fillText(val, x, y + 32);
  });
  ctx.font = "bold 16px 'Chakra Petch', sans-serif";
  ctx.fillStyle = "#00b4e0";
  ctx.fillText(summary?.benchmark?.p95_vs_budget ?? "", 48, 365);
  ctx.font = "12px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "#5a5450";
  ctx.fillText("Save to Downloads → Office Kit drag to PC", 48, 415);
  return canvas;
}
