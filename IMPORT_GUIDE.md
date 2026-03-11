# Import Guide

This dashboard reads CSV files from `Data/raw/`. If a file is missing, it falls back to sample data and the UI will warn you.

## Tools to install first

- Node.js LTS (20+ recommended)
- npm (included with Node)
- Git
- Optional editor: Cursor or VS Code

Local launch command:

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Open `http://127.0.0.1:3002`.

## API mode (optional)

X API can be enabled without disabling CSV.

- Set `X_DATA_MODE=auto` (or `api`) in `.env.local`.
- Set `X_API_BEARER_TOKEN` and `X_API_USERNAME`.
- Keep CSV files in place as fallback/backfill.

LinkedIn API adapter is available in v1. Set:

- `LINKEDIN_DATA_MODE=auto` (or `api`)
- `LINKEDIN_API_ACCESS_TOKEN`
- `LINKEDIN_ORGANIZATION_URN`

If API setup is incomplete, the app falls back to CSV.

Mode behavior:

- `auto` (recommended): CSV-first baseline + API merge when available.
- `csv`: no API calls for that platform.
- `api`: API first, CSV fallback only if API yields no usable rows.

Refresh behavior:

- `API_REFRESH_MODE=manual` (recommended): no background API pulls; API updates happen only via **Manual API Refresh**.
- `API_REFRESH_MODE=auto`: API may refresh during normal page loads (cached).
- X manual refresh guardrails are built in:
  - cooldown between refreshes
  - daily refresh cap
  - in-flight lock

## Folder structure

```
Data/
  raw/
    rolling-year/
      x_account_analytics_rolling.csv
      linkedin_metrics_rolling.csv
    monthly/
      2026-01/
        x_account_analytics_2026-01.csv
        linkedin_metrics_2026-01.csv
      2026-02/
        x_account_analytics_2026-02.csv
        linkedin_metrics_2026-02.csv
        x_post_analytics_2026-02.csv
        linkedin_posts_2026-02.csv
```

Only the first two files are required.

You can keep **multiple monthly exports** in the same folder or nested subfolders. The dashboard scans `Data/raw` recursively, merges overlapping days, and keeps the most complete values per day (no double-counting).

Recommended monthly workflow:

1. Keep your earliest historical CSV exports (do not remove them).
2. Add the newest monthly CSV at month-end (`*_YYYY-MM.csv`).
3. Leave mode as `auto` only when you want recent API enrichment; otherwise switch to `csv` for lowest cost.

Suggested naming pattern:

- `x_account_analytics_2026-02.csv`
- `x_post_analytics_2026-02.csv`
- `x_video_overview_2026-02.csv`
- `linkedin_metrics_2026-02.csv` (or `linkedin_content_2026-02.csv`)
- `linkedin_posts_2026-02.csv`
- `linkedin_visitors_2026-02.csv`
- `linkedin_followers_2026-02.csv`

## File + folder naming rules (must follow)

- Use lowercase letters, underscores, and `.csv` extension.
- Monthly files should end with `_YYYY-MM.csv`.
- Put monthly exports in `Data/raw/monthly/` (nested month folders are also fine).
- Keep old monthly files in place so long-term history stays intact.
- Export as **real CSV text** from LinkedIn/X tools.
  Renaming `.xls`/`.xlsx` to `.csv` will not work.

Quick valid examples:

- `Data/raw/monthly/x_account_analytics_2026-02.csv`
- `Data/raw/monthly/x_post_analytics_2026-02.csv`
- `Data/raw/monthly/x_video_overview_2026-02.csv`
- `Data/raw/monthly/linkedin_content_2026-02.csv`
- `Data/raw/monthly/linkedin_posts_2026-02.csv`
- `Data/raw/monthly/linkedin_visitors_2026-02.csv`
- `Data/raw/monthly/linkedin_followers_2026-02.csv`

## X (Twitter) exports

### 1) Account analytics (required)
- File name: `x_account_analytics.csv` (or `x_account_analytics_YYYY-MM.csv`)
- Required columns:
  - `Date`
  - `Impressions`
- Useful optional columns:
  - `Likes`, `Replies`, `Reposts` (or `Retweets`), `Shares`, `Bookmarks`
  - `Profile visits`, `Engagements`, `Video views`
  - `Create Post`, `New follows`, `Unfollows`

### 2) Post analytics (optional)
- File name: `x_post_analytics.csv` (or `x_post_analytics_YYYY-MM.csv`)
- The dashboard also auto-detects files named `account_analytics_content_*.csv`.
- Required columns:
  - `Impressions`
  - Either a post text column (`Tweet text`) or a link column (`Tweet permalink`)
- Optional but recommended:
  - `Time` / `Created at` so the dashboard can rank best posting hours per day.

### 3) Video overview (optional)
- File name: `x_video_overview.csv` (or `x_video_overview_YYYY-MM.csv`)
- Required columns:
  - `Date`, `Views`, `Watch Time (ms)`

## LinkedIn exports

### 1) Metrics (required)
- File name: `linkedin_metrics.csv` (or `linkedin_metrics_YYYY-MM.csv`)
- Also accepted: `linkedin_content.csv` (or `linkedin_content_YYYY-MM.csv`)
- Required columns:
  - `Date`
  - `Impressions (total)` or `Impressions`

### 2) Posts (optional)
- File name: `linkedin_posts.csv` (or `linkedin_posts_YYYY-MM.csv`)
- Required columns:
  - `Created date`
  - `Impressions`

### 3) Visitors (optional)
- File name: `linkedin_visitors.csv` (or `linkedin_visitors_YYYY-MM.csv`)
- Expected columns:
  - `Date`
  - `Page views`
- Optional:
  - `Unique visitors`
  - `Custom button clicks`

### 4) Followers (optional)
- File name: `linkedin_followers.csv` (or `linkedin_followers_YYYY-MM.csv`)
- Expected columns:
  - `Date`
- Optional:
  - `Total followers`
  - `New followers`

## Troubleshooting

- Check the **Data Quality** section in the dashboard for missing columns.
- Run `npm run inspect:data` to see the headers detected from each CSV.
- If your LinkedIn dates are DMY (day/month/year), change `LINKEDIN_DATE_FORMAT` in `src/lib/metrics.ts`.

## X API intelligence panels (v1)

When X API is enabled (`X_DATA_MODE=auto|api` + valid credentials), the dashboard can show:

- Mentions Intelligence
- Repeat Supporters (with verified-only filter)
- Quote Analytics
- Follower Snapshot over refreshes
- Brand Listening (optional; requires `X_BRAND_QUERY`)

Cost-aware defaults:

- Keep `API_REFRESH_MODE=manual`.
- Use **Reload CSV** for no-cost refreshes.
- Use **Manual API Refresh** only when needed.
- Tune guardrails in `.env.local`:
  - `X_API_REFRESH_COOLDOWN_SECONDS`
  - `X_API_DAILY_REFRESH_CAP`

Data export buttons:

- Repeat supporters table has CSV download.
- Follower snapshot history has CSV download.
- Use these for long-term records and to reduce unnecessary API refreshes.

## File name overrides (optional)

You can override file names with environment variables:

```bash
X_CSV_PATH="my-x-export.csv" \
X_POSTS_CSV_PATH="my-x-posts.csv" \
X_VIDEO_OVERVIEW_CSV_PATH="my-x-video.csv" \
LINKEDIN_CSV_PATH="my-li-export.csv" \
LINKEDIN_POSTS_CSV_PATH="my-li-posts.csv" \
LINKEDIN_VISITORS_CSV_PATH="my-li-visitors.csv" \
LINKEDIN_FOLLOWERS_CSV_PATH="my-li-followers.csv" \
npm run dev
```
