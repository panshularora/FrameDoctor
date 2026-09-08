export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ ok: true, lab: "FrameDoctor", device: "iQOO 15", cloud: "vercel" });
}
