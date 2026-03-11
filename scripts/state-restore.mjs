#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, "Data", "state");
const CACHE_DIR = path.join(ROOT, "Data", "cache");

const KNOWN_TARGETS = {
  "metrics.db": path.join(STATE_DIR, "metrics.db"),
  "metrics.db-wal": path.join(STATE_DIR, "metrics.db-wal"),
  "metrics.db-shm": path.join(STATE_DIR, "metrics.db-shm"),
  "x_api_state.json": path.join(CACHE_DIR, "x_api_state.json")
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.from) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const backupDir = path.resolve(ROOT, args.from);
  const manifestPath = path.join(backupDir, "manifest.json");
  const hasManifest = await exists(manifestPath);

  let filesToRestore;
  if (hasManifest) {
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);
    filesToRestore = Array.isArray(manifest.files) ? manifest.files : [];
    await validateChecksums(backupDir, filesToRestore);
  } else {
    filesToRestore = Object.keys(KNOWN_TARGETS).map((fileName) => ({ fileName }));
  }

  if (filesToRestore.length === 0) {
    throw new Error("Backup manifest has no files.");
  }

  for (const entry of filesToRestore) {
    const fileName = entry.fileName;
    const sourcePath = path.join(backupDir, fileName);
    if (!(await exists(sourcePath))) {
      throw new Error(`Missing backup file: ${fileName}`);
    }
    const targetPath = KNOWN_TARGETS[fileName];
    if (!targetPath) {
      continue;
    }
    if (!args.force && (await exists(targetPath))) {
      throw new Error(
        `Target already exists: ${targetPath}. Re-run with --force to overwrite.`
      );
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    await safeChmod600(targetPath);
  }

  console.log("State restored from:");
  console.log(backupDir);
  console.log("Restart the dev server to load restored data.");
}

function parseArgs(argv) {
  const args = { from: "", force: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--from") {
      args.from = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (current === "--force") {
      args.force = true;
      continue;
    }
    if (current === "--help" || current === "-h") {
      args.help = true;
      continue;
    }
  }
  return args;
}

async function validateChecksums(backupDir, files) {
  for (const entry of files) {
    const fileName = entry.fileName;
    const expected = entry.sha256;
    if (!expected) continue;
    const sourcePath = path.join(backupDir, fileName);
    const actual = await sha256File(sourcePath);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${fileName}. Aborting restore.`);
    }
  }
}

function printHelp() {
  console.log("Usage:");
  console.log("  npm run state:restore -- --from Data/backups/metrics-state-YYYYMMDD-HHMMSS");
  console.log("Options:");
  console.log("  --from <path>   Backup folder path (required)");
  console.log("  --force         Overwrite existing local state files");
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
  console.error("Restore failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
