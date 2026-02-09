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

async function readWithFallback(rawFile, sampleFile) {
  const rawPath = path.isAbsolute(rawFile)
    ? rawFile
    : path.join(DATA_DIR_RAW, rawFile);
  if (existsSync(rawPath)) {
    return { text: await fs.readFile(rawPath, "utf-8"), path: rawPath, source: "raw" };
  }

  const samplePath = path.join(DATA_DIR_SAMPLE, sampleFile);
  if (existsSync(samplePath)) {
    return {
      text: await fs.readFile(samplePath, "utf-8"),
      path: samplePath,
      source: "sample"
    };
  }

  return { text: null, path: rawPath, source: "missing" };
}

function parseWithHeaderLabel(csvText, headerLabel) {
  const rawRows = parseCsv(csvText, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true
  });
  const headerRowIndex = rawRows.findIndex((row) =>
    row.some((cell) => String(cell).trim() === headerLabel)
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
}

async function resolveXPostsRawPath() {
  if (process.env.X_POSTS_CSV_PATH) {
    const explicit = path.join(DATA_DIR_RAW, process.env.X_POSTS_CSV_PATH);
    if (existsSync(explicit)) return explicit;
  }
  try {
    const files = await fs.readdir(DATA_DIR_RAW);
    const match = files
      .filter(
        (name) =>
          name.startsWith("account_analytics_content_") && name.endsWith(".csv")
      )
      .sort()
      .at(-1);
    if (match) {
      return path.join(DATA_DIR_RAW, match);
    }
  } catch (error) {
    // Fall back to default.
  }
  const fallback = path.join(DATA_DIR_RAW, X_POSTS_CSV);
  return existsSync(fallback) ? fallback : null;
}

async function inspectDataset({ label, rawFile, sampleFile, headerLabel }) {
  const source = await readWithFallback(rawFile, sampleFile);
  if (!source.text) {
    console.log(`${label}: no CSV found.`);
    return;
  }
  const { headers, rows } = parseWithHeaderLabel(source.text, headerLabel);
  console.log(`${label} (${source.source}) columns:`, headers);
  console.log(`${label} sample row:`, rows[0]);
}

await inspectDataset({
  label: "X account analytics",
  rawFile: X_CSV,
  sampleFile: X_CSV_SAMPLE,
  headerLabel: "Date"
});

const xPostsRaw = await resolveXPostsRawPath();
await inspectDataset({
  label: "X post analytics",
  rawFile: xPostsRaw ?? X_POSTS_CSV,
  sampleFile: X_POSTS_CSV_SAMPLE,
  headerLabel: "Impressions"
});

await inspectDataset({
  label: "X video overview",
  rawFile: X_VIDEO_OVERVIEW_CSV,
  sampleFile: X_VIDEO_OVERVIEW_CSV_SAMPLE,
  headerLabel: "Date"
});

await inspectDataset({
  label: "LinkedIn metrics",
  rawFile: LINKEDIN_CSV,
  sampleFile: LINKEDIN_CSV_SAMPLE,
  headerLabel: "Date"
});

await inspectDataset({
  label: "LinkedIn posts",
  rawFile: LINKEDIN_POSTS_CSV,
  sampleFile: LINKEDIN_POSTS_CSV_SAMPLE,
  headerLabel: "Created date"
});
