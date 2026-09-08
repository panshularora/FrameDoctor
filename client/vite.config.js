import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: "./",
  plugins: [react()],
  publicDir: path.join(root, "public"),
  resolve: {
    alias: {
      "@shared": path.resolve(root, "../shared"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    fs: { allow: [path.resolve(root, "..")] },
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
});
