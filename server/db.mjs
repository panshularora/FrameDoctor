import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "data");
fs.mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(path.join(dir, "framedoctor.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_s REAL,
    avg_frame_ms REAL,
    p95_frame_ms REAL,
    jank_frames INTEGER,
    total_frames INTEGER,
    start_thermal TEXT,
    peak_thermal TEXT,
    first_throttle_s REAL,
    battery_start_pct REAL,
    battery_end_pct REAL,
    notes_json TEXT,
    spark_json TEXT,
    report_text TEXT,
    report_source TEXT,
    markdown TEXT,
    live_json TEXT
  );
  CREATE TABLE IF NOT EXISTS inbox (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL,
    dropped_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tracker (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    seconds REAL NOT NULL,
    meta TEXT,
    at TEXT NOT NULL
  );
`);

try { db.exec(`ALTER TABLE sessions ADD COLUMN score INTEGER;`); } catch {}
try { db.exec(`ALTER TABLE sessions ADD COLUMN score_tier TEXT;`); } catch {}
try { db.exec(`ALTER TABLE sessions ADD COLUMN benchmark_json TEXT;`); } catch {}


export function now() {
  return new Date().toISOString();
}

export function uid(prefix = "fd") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
