#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, "Data", "state");
const CACHE_DIR = path.join(ROOT, "Data", "cache");
const BACKUPS_DIR = path.join(ROOT, "Data", "backups");

const CANDIDATE_FILES = [
  path.join(STATE_DIR, "metrics.db"),
  path.join(STATE_DIR, "metrics.db-wal"),
  path.join(STATE_DIR, "metrics.db-shm"),
  path.join(CACHE_DIR, "x_api_state.json")
];

async function main() {
  const stamp = formatStamp(new Date());
  const backupDir = path.join(BACKUPS_DIR, `metrics-state-${stamp}`);
  await fs.mkdir(backupDir, { recursive: true });

  const existingSources = [];
  for (const file of CANDIDATE_FILES) {
    if (await exists(file)) existingSources.push(file);
  }

  if (existingSources.length === 0) {
    console.error("No state files found to back up.");
    process.exit(1);
  }

  const manifest = {
    formatVersion: 1,
    createdAtUtc: new Date().toISOString(),
    files: []
  };

  for (const sourcePath of existingSources) {
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(backupDir, fileName);
    await fs.copyFile(sourcePath, targetPath);
    await safeChmod600(targetPath);

    const stat = await fs.stat(targetPath);
    manifest.files.push({
      fileName,
      sha256: await sha256File(targetPath),
      sizeBytes: stat.size
    });
  }

  const manifestPath = path.join(backupDir, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await safeChmod600(manifestPath);

  console.log("State backup created:");
  console.log(backupDir);
  console.log(
    "Included files:",
    manifest.files.map((file) => file.fileName).join(", ")
  );
}

function formatStamp(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function safeChmod600(filePath) {
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // Ignore chmod issues on non-POSIX filesystems.
  }
}

main().catch((error) => {
  console.error("Backup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
