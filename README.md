# Goblinz Social Metric Dashboard API

Hybrid social dashboard with optional API ingestion and CSV fallback.

## Core idea

- Each platform is independent.
- X can run from API or CSV.
- LinkedIn can run from API or CSV.
- If one source is missing, the app keeps working with the other source.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Screenshots (Template)

Add images to `docs/screenshots/` with these suggested names:

- `01-hero.png`
- `02-metric-controls.png`
- `03-overview-visuals.png`
- `04-best-time-matrix.png`

Then update/keep this section:

```md
## Dashboard Preview

![Hero](docs/screenshots/01-hero.png)
![Metric Controls](docs/screenshots/02-metric-controls.png)
![Overview Visuals](docs/screenshots/03-overview-visuals.png)
![Best Day + Hour Matrix](docs/screenshots/04-best-time-matrix.png)
```

## Environment setup

Create `.env.local` from `.env.example` and set only what you need.

```bash
cp .env.example .env.local
```

## Beginner setup helper (LLM prompt)

- Open `PROMPT.md` from the repo root.
- Copy and paste it into ChatGPT/Claude/Gemini/OpenClaw/Cursor agent.
- It is written for one-step-at-a-time setup and troubleshooting.

## Data modes

- `X_DATA_MODE=auto` (default): CSV-first + API enrichment. CSV stays the baseline history; API rows are merged on top when available.
- `X_DATA_MODE=api`: force X API, fallback to CSV only if API returns no usable data.
- `X_DATA_MODE=csv`: always use CSV.
- `LINKEDIN_DATA_MODE=auto|csv|api`: same behavior as X per mode (`auto` = CSV-first + API merge).

## Refresh policy (cost control)

- `API_REFRESH_MODE=manual` (default): API is fetched only when you click **Manual API Refresh**.
- `API_REFRESH_MODE=auto`: API can refresh during normal page loads (subject to cache TTL).
- `Reload CSV` refreshes the dashboard without triggering API calls.

## Local persistence (SQLite)

- The dashboard persists X API snapshots locally in:
  - `Data/state/metrics.db`
- Snapshots are append-only (new refreshes add rows; previous snapshots are kept).
- On restart/reinstall, the app can hydrate from persisted snapshots so API panels and history do not reset to empty.
- In `auto` mode, CSV baseline + persisted/API snapshot data are merged in the dashboard flow.

## X API setup (v1)

Required for X API mode:

- `X_API_BEARER_TOKEN`
- `X_API_USERNAME`

Optional:

- `X_API_LOOKBACK_DAYS` (default `30`, bounded to `7..30`)
- `X_API_CACHE_SECONDS` (default `900`)
- `X_API_REFRESH_COOLDOWN_SECONDS` (default `10800` = 3h)
- `X_API_DAILY_REFRESH_CAP` (default `2`)
- `X_MENTIONS_LOOKBACK_DAYS` (default `30`, one-month mentions window)
- `X_MENTIONS_SPIKE_RATIO_THRESHOLD` (default `1.8`)
- `X_MENTIONS_SPIKE_DELTA_THRESHOLD` (default `5`)
- `X_QUOTE_SOURCE_POST_LIMIT` (default `12`)
- `X_QUOTE_HIGH_INTENT_ENGAGEMENT_THRESHOLD` (default `5`)
- `X_AMPLIFIER_SOURCE_POST_LIMIT` (default `8`)
- `X_REPEAT_SUPPORTER_THRESHOLD` (default `5`)
- `X_FOLLOWER_HISTORY_LIMIT` (default `180`)
- `X_FOLLOWER_SNAPSHOT_MIN_MINUTES` (default `30`)
- `X_POST_SNAPSHOT_HISTORY_LIMIT` (default `90`)
- `X_POST_SNAPSHOT_MIN_MINUTES` (default `30`)
- `X_POST_SNAPSHOT_POST_LIMIT` (default `250`)
- `X_HALF_LIFE_MIN_FINAL_ENGAGEMENTS` (default `10`)
- `X_BRAND_QUERY` (optional, enables brand listening)
- `X_BRAND_COMPARE_QUERY` (optional compare query for share-of-voice)
- `X_BRAND_LOOKBACK_DAYS` (default `7`, bounded to `1..7`)

The X provider currently pulls your recent tweets and aggregates:

- Daily impressions (when available), likes, replies, reposts/quotes
- Daily post counts
- Top posts by impressions
- Best posting time slots (day + hour, UTC)
- Mentions intelligence (`/users/:id/mentions`)
- Mentions velocity and spike detection (7-day rolling baseline)
- Quote-post analytics (`/tweets/:id/quote_tweets`)
- Quote impact funnel (quotes -> quote engagements -> high-intent quotes)
- Amplifier/repeat-supporter leaderboard (`/tweets/:id/retweeted_by` + `liking_users`)
- Supporter cohort retention (first-seen cohort return by week)
- Engagement concentration risk (top-N share + Gini/HHI)
- Post half-life (snapshot-based time to 50% engagement)
- Follower snapshot history (`/users/:id`, `public_metrics`)
- Optional brand listening (`/tweets/search/recent` when `X_BRAND_QUERY` is set)
- CSV download buttons for supporter leaderboard and follower snapshots

## LinkedIn API setup (v1 adapter)

Required for LinkedIn API mode:

- `LINKEDIN_API_ACCESS_TOKEN`
- `LINKEDIN_ORGANIZATION_URN` (numeric id or `urn:li:organization:<id>`)

Optional:

- `LINKEDIN_API_LOOKBACK_DAYS` (default `30`)
- `LINKEDIN_API_CACHE_SECONDS` (default `900`)
- `LINKEDIN_API_VERSION` (default `202506`)

The LinkedIn provider currently attempts to ingest:

- Daily organizational share stats
- Daily page stats
- Daily follower gains

If the endpoint call fails or permission is missing, the app falls back to CSV automatically.

## CSV setup

Required CSV files:

- `Data/raw/x_account_analytics.csv`
- `Data/raw/linkedin_metrics.csv`

Optional CSV files:

- `Data/raw/x_post_analytics.csv`
- `Data/raw/x_video_overview.csv`
- `Data/raw/linkedin_posts.csv`
- `Data/raw/linkedin_visitors.csv`
- `Data/raw/linkedin_followers.csv`

### Naming rules (strict)

- Use lowercase + underscores only.
- Keep the date suffix as `YYYY-MM` for monthly files.
- Put monthly drops in `Data/raw/monthly/` (or its subfolders).
- Use `.csv` text exports only (UTF-8 recommended).
- Do **not** rename `.xls/.xlsx` files to `.csv` manually; re-export them as real CSV.
- Keep historic files; the loader merges overlap by day and keeps the most complete value.

Accepted examples:

- `x_account_analytics_2026-02.csv`
- `x_post_analytics_2026-02.csv`
- `x_video_overview_2026-02.csv`
- `linkedin_content_2026-02.csv` or `linkedin_metrics_2026-02.csv`
- `linkedin_posts_2026-02.csv`
- `linkedin_visitors_2026-02.csv`
- `linkedin_followers_2026-02.csv`

Monthly naming pattern is supported, for example:

- `x_account_analytics_2026-02.csv`
- `x_post_analytics_2026-02.csv`
- `linkedin_metrics_2026-02.csv` (or `linkedin_content_2026-02.csv`)
- `linkedin_visitors_2026-02.csv`
- `linkedin_followers_2026-02.csv`

The loader merges overlaps and keeps the most complete values per day.

Subfolders are supported under `Data/raw` (recursive scan), for example:

- `Data/raw/rolling-year/`
- `Data/raw/monthly/2026-01/`
- `Data/raw/monthly/2026-02/`

## Manual refresh and cost control

- API responses are cached server-side (15 minutes by default when auto refresh is enabled).
- Use the **Manual API Refresh** button when you want a fresh pull now.
- The refresh button shows a confirmation because API pulls may use paid credits.
- **Override Refresh** bypasses cooldown/daily cap and shows an extra warning prompt before running.
- Manual refresh guardrails are built in for X:
  - Cooldown between refreshes (`X_API_REFRESH_COOLDOWN_SECONDS`)
  - Daily cap (`X_API_DAILY_REFRESH_CAP`)
  - In-flight lock (prevents overlapping refresh runs)
- Override refresh bypasses cooldown + daily cap, but still respects in-flight lock.
- **Reload CSV** refreshes local CSV-derived metrics without API calls.
- For lowest cost, set `X_DATA_MODE=csv` and/or `LINKEDIN_DATA_MODE=csv`.
- Practical strategy: keep monthly CSV exports as your long-term archive, then use `auto` only when you need recent API enrichment.

## Backup and restore (state migration)

Create backup:

```bash
npm run state:backup
```

Restore backup:

```bash
npm run state:restore -- --from Data/backups/metrics-state-YYYYMMDD-HHMMSS
```

Force overwrite existing local state during restore:

```bash
npm run state:restore -- --from Data/backups/metrics-state-YYYYMMDD-HHMMSS --force
```

What is backed up:
- `Data/state/metrics.db`
- `Data/state/metrics.db-wal` and `Data/state/metrics.db-shm` (if present)
- `Data/cache/x_api_state.json`

Backups include SHA-256 checksums in `manifest.json`; restore verifies checksums before writing files.

## Metrics source map

- Works in CSV mode:
  - Core daily/monthly views, likes, comments, reposts
  - Top posts (from CSV post exports)
  - CSV validation + data quality panels
- Improved by API mode:
  - Recent data enrichment on top of CSV history
  - API freshness timestamps in the hero chips
  - X best day+hour from API tweet timestamps (or CSV post timestamps)
  - Per-post engagement stats (average + median)
  - Day/hour matrix view per platform
- Full panel-by-panel breakdown: see `METRICS_REFERENCE.md`.

## Security notes

- Keep tokens only in `.env.local`.
- Never expose secrets in `NEXT_PUBLIC_*` vars.
- API calls happen server-side only.
- `.env*` must stay gitignored.
- X refresh usage + follower snapshots are stored locally in `Data/cache/x_api_state.json` (no API keys stored there).
- SQLite persistence lives in `Data/state/metrics.db` and is gitignored.
- State files are created with restrictive local permissions where supported (`0600`).
- You are responsible for API credential handling and any usage costs charged by providers.

## Versioning and updates

- Stable releases are tracked with git tags (for example: `v1.0.0`).
- Full change history is in `CHANGELOG.md`.
- Release procedure and rollback notes are in `docs/RELEASE_PROCESS.md`.
- Older versions remain available by checking out a tag:
  - `git checkout v1.0.0`
- Users only get updates when they explicitly run:
  - `git pull origin main`

## Release notes

- Current stable tag: `v1.2.0`
- Detailed notes: `docs/releases/v1.2.0.md`

## Current v1 limits

- LinkedIn API adapter currently focuses on daily org metrics; post-level top-posts still rely on CSV.
- X private/non-public metrics availability depends on account access tier and token scope.
- If API limits are hit, CSV fallback remains available.

## Next versions (v1.1 roadmap)

- Mentions velocity chart (7-day rolling mentions + spike detection)
- Supporter retention chart (repeat supporters returning week-over-week)
- Quote impact funnel (quotes -> quote engagements -> profile clicks)
- Post half-life (hours to reach 50% of final engagement)
- Topic/hashtag leaderboard from high-engagement mentions/quotes
- Creator quality score (engagement quality + consistency + verified boost)
- Scheduled ingestion job + persistent database

## License

MIT.
