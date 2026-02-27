import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";

const DATA_DIR_RAW = path.join(process.cwd(), "Data", "raw");
const DATA_DIR_SAMPLE = path.join(process.cwd(), "Data", "sample");

const X_CSV = process.env.X_CSV_PATH ?? "x_account_analytics.csv";
const X_CSV_SAMPLE = "x_account_analytics_sample.csv";
const X_POSTS_CSV = process.env.X_POSTS_CSV_PATH ?? "x_post_analytics.csv";
const X_POSTS_CSV_SAMPLE = "x_post_analytics_sample.csv";
const X_VIDEO_OVERVIEW_CSV =
  process.env.X_VIDEO_OVERVIEW_CSV_PATH ?? "x_video_overview.csv";
const X_VIDEO_OVERVIEW_CSV_SAMPLE = "x_video_overview_sample.csv";
const LINKEDIN_CSV = process.env.LINKEDIN_CSV_PATH ?? "linkedin_metrics.csv";
const LINKEDIN_CSV_SAMPLE = "linkedin_metrics_sample.csv";
const LINKEDIN_POSTS_CSV =
  process.env.LINKEDIN_POSTS_CSV_PATH ?? "linkedin_posts.csv";
const LINKEDIN_POSTS_CSV_SAMPLE = "linkedin_posts_sample.csv";
const LINKEDIN_VISITORS_CSV =
  process.env.LINKEDIN_VISITORS_CSV_PATH ?? "linkedin_visitors.csv";
const LINKEDIN_VISITORS_CSV_SAMPLE = "linkedin_visitors_sample.csv";
const LINKEDIN_FOLLOWERS_CSV =
  process.env.LINKEDIN_FOLLOWERS_CSV_PATH ?? "linkedin_followers.csv";
const LINKEDIN_FOLLOWERS_CSV_SAMPLE = "linkedin_followers_sample.csv";

async function listCsvFiles(dir, include) {
  const matches = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".csv")) continue;
      if (!include(entry.name)) continue;
      matches.push(fullPath);
    }
  }

  await walk(dir);
  return matches.sort();
}

function matchesAny(fileName, tokens) {
  const lower = fileName.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

async function resolveRawFiles(defaultFile, tokens) {
  if (defaultFile) {
    const explicitPath = path.isAbsolute(defaultFile)
      ? defaultFile
      : path.join(DATA_DIR_RAW, defaultFile);
    if (existsSync(explicitPath)) {
      return [explicitPath];
    }
  }

  const matches = await listCsvFiles(DATA_DIR_RAW, (name) =>
    matchesAny(name, tokens)
  );
  return matches;
}

function parseWithHeaderLabel(csvText, headerLabel) {
  try {
    const rawRows = parseCsv(csvText, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true
    });
    const target = headerLabel.trim().toLowerCase();
    const headerRowIndex = rawRows.findIndex((row) =>
      row.some((cell) => String(cell).trim().toLowerCase() === target)
    );
    if (headerRowIndex === -1) {
      return { headers: [], rows: [] };
    }
    const headers = rawRows[headerRowIndex] || [];
    const rows = rawRows
      .slice(headerRowIndex + 1)
      .filter((row) => row.some((cell) => String(cell).trim() !== ""))
      .map((row) =>
        headers.reduce((acc, header, index) => {
          acc[header] = row[index] ?? "";
          return acc;
        }, {})
      );
    return { headers, rows };
  } catch {
    return { headers: [], rows: [] };
  }
}

async function inspectDataset({
  label,
  defaultFile,
  tokens,
  sampleFile,
  headerLabel
}) {
  const rawFiles = await resolveRawFiles(defaultFile, tokens);

  let source = "missing";
  let csvTexts = [];
  let filePaths = [];

  if (rawFiles.length > 0) {
    source = "raw";
    filePaths = rawFiles;
    csvTexts = await Promise.all(rawFiles.map((filePath) => fs.readFile(filePath, "utf-8")));
  } else {
    const samplePath = path.join(DATA_DIR_SAMPLE, sampleFile);
    if (existsSync(samplePath)) {
      source = "sample";
      filePaths = [samplePath];
      csvTexts = [await fs.readFile(samplePath, "utf-8")];
    }
  }

  if (csvTexts.length === 0) {
    console.log(`${label}: no CSV found.`);
    return;
  }

  const parsed = csvTexts.map((text) => parseWithHeaderLabel(text, headerLabel));
  const headers = [...new Set(parsed.flatMap((item) => item.headers))];
  const rows = parsed.flatMap((item) => item.rows);

  const fileLabel =
    filePaths.length === 1
      ? path.relative(process.cwd(), filePaths[0])
      : `${path.relative(process.cwd(), path.dirname(filePaths[0]))} (${filePaths.length} files)`;

  console.log(`${label} (${source}) file: ${fileLabel}`);
  console.log(`${label} columns:`, headers);
  console.log(`${label} sample row:`, rows[0]);
}

await inspectDataset({
  label: "X account analytics",
  defaultFile: X_CSV,
  tokens: ["x_account_analytics", "x account analytics"],
  sampleFile: X_CSV_SAMPLE,
  headerLabel: "Date"
});

await inspectDataset({
  label: "X post analytics",
  defaultFile: X_POSTS_CSV,
  tokens: [
    "x_post_analytics",
    "x post analytics",
    "account_analytics_content_"
  ],
  sampleFile: X_POSTS_CSV_SAMPLE,
  headerLabel: "Impressions"
});

await inspectDataset({
  label: "X video overview",
  defaultFile: X_VIDEO_OVERVIEW_CSV,
  tokens: ["x_video_overview", "video_overview", "video overview"],
  sampleFile: X_VIDEO_OVERVIEW_CSV_SAMPLE,
  headerLabel: "Date"
});

await inspectDataset({
  label: "LinkedIn metrics/content",
  defaultFile: LINKEDIN_CSV,
  tokens: [
    "linkedin_metrics",
    "linkedin metrics",
    "linkedin_content",
    "metrics-table"
  ],
  sampleFile: LINKEDIN_CSV_SAMPLE,
  headerLabel: "Date"
});

await inspectDataset({
  label: "LinkedIn posts",
  defaultFile: LINKEDIN_POSTS_CSV,
  tokens: ["linkedin_posts", "linkedin posts", "all posts"],
  sampleFile: LINKEDIN_POSTS_CSV_SAMPLE,
  headerLabel: "Created date"
});

await inspectDataset({
  label: "LinkedIn visitors",
  defaultFile: LINKEDIN_VISITORS_CSV,
  tokens: ["linkedin_visitors", "linkedin visitors", "visitors"],
  sampleFile: LINKEDIN_VISITORS_CSV_SAMPLE,
  headerLabel: "Date"
});

await inspectDataset({
  label: "LinkedIn followers",
  defaultFile: LINKEDIN_FOLLOWERS_CSV,
  tokens: ["linkedin_followers", "linkedin followers", "followers"],
  sampleFile: LINKEDIN_FOLLOWERS_CSV_SAMPLE,
  headerLabel: "Date"
});
