# Goblinz Social Metric Dashboard API

Hybrid social dashboard with optional API ingestion and CSV fallback.

## Core idea

- Each platform is independent.
- X can run from API or CSV.
- LinkedIn currently runs from CSV (API connector planned).
- If one source is missing, the app keeps working with the other source.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment setup

Create `.env.local` from `.env.example` and set only what you need.

```bash
cp .env.example .env.local
```

## Data modes

- `X_DATA_MODE=auto` (default): use X API when configured, otherwise CSV.
- `X_DATA_MODE=api`: force X API, fallback to CSV only if API returns no usable data.
- `X_DATA_MODE=csv`: always use CSV.
- `LINKEDIN_DATA_MODE=auto|csv|api`: currently LinkedIn API is not connected yet, so it uses CSV fallback.

## X API setup (v1)

Required for X API mode:

- `X_API_BEARER_TOKEN`
- `X_API_USERNAME`

Optional:

- `X_API_LOOKBACK_DAYS` (default `30`, bounded to `7..30`)

The X provider currently pulls your recent tweets and aggregates:

- Daily impressions (when available), likes, replies, reposts/quotes
- Daily post counts
- Top posts by impressions

## CSV setup

Required CSV files:

- `Data/raw/x_account_analytics.csv`
- `Data/raw/linkedin_metrics.csv`

Optional CSV files:

- `Data/raw/x_post_analytics.csv`
- `Data/raw/x_video_overview.csv`
- `Data/raw/linkedin_posts.csv`

Monthly naming pattern is supported, for example:

- `x_account_analytics_2026-02.csv`
- `x_post_analytics_2026-02.csv`
- `linkedin_metrics_2026-02.csv`

The loader merges overlaps and keeps the most complete values per day.

## Security notes

- Keep tokens only in `.env.local`.
- Never expose secrets in `NEXT_PUBLIC_*` vars.
- API calls happen server-side only.
- `.env*` must stay gitignored.

## Current v1 limits

- LinkedIn API connector is not built yet.
- X private/non-public metrics availability depends on account access tier and token scope.
- If API limits are hit, CSV fallback remains available.

## Next versions

- LinkedIn API connector
- Scheduled ingestion job + persistent database
- Supporter/community scoring pipeline

## License

MIT.
