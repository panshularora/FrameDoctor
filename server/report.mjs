import { recommendations, templateReport } from "../shared/analyze.mjs";
import { toMarkdown, toJiraIssue } from "../shared/reportFormat.mjs";

const MODEL = "grok-4.5";
const BASE = "https://api.x.ai/v1";

export async function writeReport(summary) {
  const fallback = templateReport(summary);
  const key = process.env.XAI_API_KEY;
  if (!key) return { text: fallback, source: "on-device" };

  const recs = recommendations(summary);
  const prompt = `You are FrameDoctor. Explain this iQOO 15 session in 6–9 lines.
Use only the JSON. Do not invent competitor fps, skin temperature, or NPU claims.
If thermal source is estimated, say so. Keep the three recommendations verbatim.

JSON:
${JSON.stringify(summary, null, 2)}

Recommendations (verbatim):
1. ${recs[0]}
2. ${recs[1]}
3. ${recs[2]}`;

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Return plain text only. No markdown headings." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("empty");
    return { text, source: "spacexai" };
  } catch {
    return { text: fallback, source: "on-device" };
  }
}

export { toMarkdown, toJiraIssue, templateReport };
