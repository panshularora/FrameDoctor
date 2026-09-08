import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "client", "dist");
const dest = path.join(root, "android", "app", "src", "main", "assets", "www");

if (!fs.existsSync(path.join(src, "index.html"))) {
  console.error("client/dist missing. Run the Vite build first.");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`copied ${src} → ${dest}`);
