# Import Guide

This dashboard reads CSV files from `Data/raw/`. If a file is missing, it falls back to sample data and the UI will warn you.

## Folder structure

```
Data/
  raw/
    x_account_analytics.csv
    x_post_analytics.csv
    x_video_overview.csv
    linkedin_metrics.csv
    linkedin_posts.csv
```

Only the first two files are required.

You can keep **multiple monthly exports** in the same folder. The dashboard will merge overlapping days and keep the most complete values per day (no double-counting).

Suggested naming pattern:

- `x_account_analytics_2026-02.csv`
- `x_post_analytics_2026-02.csv`
- `x_video_overview_2026-02.csv`
- `linkedin_metrics_2026-02.csv`
- `linkedin_posts_2026-02.csv`

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

### 3) Video overview (optional)
- File name: `x_video_overview.csv` (or `x_video_overview_YYYY-MM.csv`)
- Required columns:
  - `Date`, `Views`, `Watch Time (ms)`

## LinkedIn exports

### 1) Metrics (required)
- File name: `linkedin_metrics.csv` (or `linkedin_metrics_YYYY-MM.csv`)
- Required columns:
  - `Date`
  - `Impressions (total)` or `Impressions`

### 2) Posts (optional)
- File name: `linkedin_posts.csv` (or `linkedin_posts_YYYY-MM.csv`)
- Required columns:
  - `Created date`
  - `Impressions`

## Troubleshooting

- Check the **Data Quality** section in the dashboard for missing columns.
- Run `npm run inspect:data` to see the headers detected from each CSV.
- If your LinkedIn dates are DMY (day/month/year), change `LINKEDIN_DATE_FORMAT` in `src/lib/metrics.ts`.

## File name overrides (optional)

You can override file names with environment variables:

```bash
X_CSV_PATH="my-x-export.csv" \
X_POSTS_CSV_PATH="my-x-posts.csv" \
X_VIDEO_OVERVIEW_CSV_PATH="my-x-video.csv" \
LINKEDIN_CSV_PATH="my-li-export.csv" \
LINKEDIN_POSTS_CSV_PATH="my-li-posts.csv" \
npm run dev
```
