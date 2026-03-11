# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-03-11

### Added
- Local SQLite state store at `Data/state/metrics.db` for durable API snapshot history.
- Append-only X API snapshot persistence (each refresh adds a snapshot row).
- State backup command: `npm run state:backup`.
- State restore command: `npm run state:restore -- --from <backup-folder> [--force]`.
- Backup checksum manifest validation during restore.

### Changed
- X API loader now hydrates from persisted SQLite snapshots on restart when available.
- X API error/disabled states now fall back to the most recent persisted snapshot when possible.
- Security hardening for state persistence paths and gitignore coverage.

### Benefits
- Historical API intelligence survives app restarts and reinstall flows.
- Lower risk of losing hard-earned API history between versions.
- Safer migration path with verifiable local backups.

## [1.1.0] - 2026-03-11

### Added
- Manual override refresh flow with dual warning prompts in the UI.
- Query-param wiring for override refresh (`refresh_override=1`) from UI to server.
- Human-readable cooldown formatting in the guardrails panel.
- Release notes for update 1.1 (`docs/releases/v1.1.0.md`).

### Changed
- Default manual refresh cooldown changed to `3h` (`X_API_REFRESH_COOLDOWN_SECONDS=10800`).
- Default daily refresh cap changed to `2` (`X_API_DAILY_REFRESH_CAP=2`).
- Guardrail logic now allows override refresh to bypass cooldown/daily cap while still enforcing in-flight lock.

### Benefits
- Better cost control by default for teams on paid API credits.
- Safer manual override UX with clearer warnings before extra credit spend.
- Better operator clarity from cleaner guardrail time display.

## [1.0.0] - 2026-03-11

### Added
- Hybrid API + CSV ingestion for X and LinkedIn with independent platform modes.
- Manual API refresh guardrails: cooldown, daily cap, and in-flight lock.
- X intelligence panels: mentions, quote analytics, repeat supporters, follower snapshot, and optional brand listening.
- Supporter retention (week-over-week) from interaction endpoints.
- Engagement cohort panel (publish-week cohorts by post-age bucket).
- Engagement concentration panel (top-10/top-20 share and concentration curve).
- CSV exports for follower snapshots and supporter leaderboard.
- CSV validator, data-quality checks, monthly folder merge logic, and setup checklist.
- `PROMPT.md`, `IMPORT_GUIDE.md`, and `METRICS_REFERENCE.md` for non-technical setup and troubleshooting.

### Security
- API calls are server-side only.
- `.env.local` remains ignored.
- local cache state in `Data/cache/x_api_state.json` excludes credentials.

### Notes
- `X_MENTIONS_LOOKBACK_DAYS` defaults to `30` (one-month window).
- LinkedIn API adapter in v1 remains daily/org focused; LinkedIn top posts still rely on CSV.
