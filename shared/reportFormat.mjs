import { recommendations, templateReport } from "./analyze.mjs";

export function toMarkdown(summary, report, source) {
  const fixesMarkdown = (summary.fixes || [])
    .map(
      (f) => `### ${f.category}: ${f.title}
${f.impact}

\`\`\`javascript
${f.code}
\`\`\``
    )
    .join("\n\n");

  const src = summary.sources || {};
  return `# FrameDoctor report
- session: ${summary.session_id}
- workload: **${(summary.workload || "general").toUpperCase()}**
- device: iQOO 15 (this process only — we do not profile other apps)
- score: **${summary.score ?? 0} / 100** [${summary.score_tier ?? "—"}]
- PJI: **±${summary.pji ?? 0} ms** [${summary.pji_rating ?? "—"}]
- duration: ${summary.duration_s}s
- p95: ${summary.p95_frame_ms} ms · avg ${summary.avg_frame_ms} ms
- vsync budget: ${summary.benchmark?.budget_ms ?? 6.94} ms @ ${summary.target_hz || 144} Hz (${summary.benchmark?.p95_vs_budget ?? ""})
- jank: ${summary.jank_frames} / ${summary.total_frames} (${summary.benchmark?.jank_rate_pct ?? 0}%)
- thermal: ${summary.start_thermal} → ${summary.peak_thermal} (${src.thermal || "unknown"})
- first moderate thermal: ${summary.first_throttle_s != null ? `${summary.first_throttle_s}s` : "none"}
- battery: ${summary.battery_start_pct ?? "n/a"}% → ${summary.battery_end_pct ?? "n/a"}% (${src.battery || "n/a"})
- capture: ${src.frames || "raf"}
- explainer: ${source}

## Diagnosis
${report}

## Fixes
${fixesMarkdown || "- Inside budget. No code change required from this trace."}

## Notes
${(summary.notes || []).map((n) => `- ${n.t_s}s · ${n.type} · ${n.detail}`).join("\n") || "- Clean trace."}

## Spark (frame ms)
${(summary.spark || []).join(", ")}

---
Exported for Office Kit (save to Downloads, drag phone → PC). iQOO Hackathon 2026 · Developer Tools.
`;
}

export function toJiraIssue(summary, report) {
  const src = summary.sources || {};
  return `### Performance report — [${(summary.workload || "general").toUpperCase()}]

**Process under test**: this FrameDoctor session (not other APKs)
**Score**: ${summary.score ?? 0}/100 [${summary.score_tier ?? "—"}]
**PJI**: ±${summary.pji ?? 0} ms (${summary.pji_rating ?? "—"})
**Capture**: ${src.frames || "raf"} · **Thermal**: ${src.thermal || "unknown"}

| Metric | Measured | Budget |
|---|---|---|
| P95 frame | ${summary.p95_frame_ms} ms | ${summary.benchmark?.budget_ms ?? 6.94} ms @ ${summary.target_hz || 144} Hz |
| vs budget | ${summary.benchmark?.p95_vs_budget ?? "—"} | 1000/Hz |
| Jank frames | ${summary.jank_frames} / ${summary.total_frames} | 2× 60 Hz vsync (${(1000 / 60) * 2} ms) |
| Thermal | ${summary.peak_thermal} | PowerManager ≥ MODERATE |
| First moderate | ${summary.first_throttle_s != null ? `${summary.first_throttle_s}s` : "none"} | — |

#### Diagnosis
${report}

#### Fixes
${(summary.fixes || []).map((f) => `**${f.title}** — ${f.impact}\n\`\`\`javascript\n${f.code}\n\`\`\``).join("\n\n")}
`;
}

export { templateReport, recommendations };
