export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    ips: ["cloud.vercel.app"],
    primaryIp: "cloud.vercel.app",
    phoneUrl: "/",
    deskUrl: "/#/desk",
    hostname: "vercel-edge",
  });
}
