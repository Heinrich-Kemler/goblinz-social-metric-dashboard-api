import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { XApiSnapshot } from "@/lib/providers/x-api";

const STATE_DIR = path.join(process.cwd(), "Data", "state");
const METRICS_DB_PATH = path.join(STATE_DIR, "metrics.db");
const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

let dbConnection: DatabaseSync | null = null;

type SnapshotRow = {
  payload_json: string;
};

export function getMetricsDbPath(): string {
  return METRICS_DB_PATH;
}

export function appendXApiSnapshotToStore(snapshot: XApiSnapshot): void {
  if (snapshot.source !== "api") return;
  try {
    const db = getDb();
    const payloadJson = JSON.stringify(snapshot);
    const payloadHash = sha256(payloadJson);
    const fetchedAt =
      snapshot.fetchedAt instanceof Date && Number.isFinite(snapshot.fetchedAt.getTime())
        ? snapshot.fetchedAt.toISOString()
        : new Date().toISOString();

    const insert = db.prepare(
      `
      INSERT INTO x_api_snapshots (
        fetched_at_utc,
        saved_at_utc,
        payload_json,
        payload_sha256
      ) VALUES (?, ?, ?, ?)
      `
    );
    insert.run(fetchedAt, new Date().toISOString(), payloadJson, payloadHash);
  } catch (error) {
    console.warn("[metrics-db] Failed to append API snapshot:", error);
  }
}

export function loadLatestXApiSnapshotFromStore(): XApiSnapshot | null {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `
        SELECT payload_json
        FROM x_api_snapshots
        ORDER BY id DESC
        LIMIT 1
        `
      )
      .get() as SnapshotRow | undefined;

    if (!row?.payload_json) return null;
    const parsed = JSON.parse(row.payload_json, reviveDates) as XApiSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("[metrics-db] Failed to load persisted API snapshot:", error);
    return null;
  }
}

function getDb(): DatabaseSync {
  if (dbConnection) return dbConnection;

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const db = new DatabaseSync(METRICS_DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS x_api_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fetched_at_utc TEXT NOT NULL,
      saved_at_utc TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_x_api_snapshots_fetched_at
      ON x_api_snapshots (fetched_at_utc DESC);
  `);

  try {
    fs.chmodSync(METRICS_DB_PATH, 0o600);
  } catch {
    // Ignore chmod failures on filesystems that do not support POSIX permissions.
  }

  dbConnection = db;
  return dbConnection;
}

function reviveDates(_key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!ISO_UTC_REGEX.test(value)) return value;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : value;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
