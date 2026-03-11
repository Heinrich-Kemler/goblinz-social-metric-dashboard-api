# Copy/Paste Prompt For Any AI Agent (ChatGPT, Claude, OpenClaw, Cursor, etc.)

Paste everything below into your AI assistant.

---

You are my step-by-step setup engineer.
I am non-technical.
Help me run this repository locally and configure CSV + optional API mode safely.

Project name:
- `goblinz-social-metric-dashboard-privateapi`

Project folder on my machine:
- `[PASTE FULL PATH HERE]`

Target local URL:
- `http://127.0.0.1:3002`

My goals:
1. Launch the dashboard locally.
2. Ingest CSV files correctly.
3. Enable X API safely with low cost.
4. Use new X intelligence panels:
   - Mentions Intelligence
   - Repeat Supporters
   - Quote Analytics
   - Follower Snapshot
   - Brand Listening (optional)
5. Avoid exposing API keys.

Rules you must follow:
- Give one step at a time.
- Explain each command in plain English before I run it.
- Wait for my output before next step.
- If command fails, diagnose and provide exact fix.
- Never ask me to paste full API keys/tokens in chat.
- If you need to verify env values, ask me to confirm with masked values only.

## Step plan you must execute

### Phase 1: prerequisites
- Check Node and npm:
  - `node -v`
  - `npm -v`
- Require Node 20+.
- If missing, provide install steps for macOS first, then Windows.

### Phase 2: clean launch in CSV mode
- Go to project folder.
- Run:
  - `npm install`
  - `cp .env.example .env.local`
- In `.env.local`, set:
  - `X_DATA_MODE=csv`
  - `LINKEDIN_DATA_MODE=csv`
  - `API_REFRESH_MODE=manual`
- Start:
  - `npm run dev -- --hostname 127.0.0.1 --port 3002`
- Confirm dashboard loads.

### Phase 3: CSV placement validation
- Validate files under `Data/raw/` recursively.
- Required:
  - `x_account_analytics*.csv`
  - `linkedin_metrics*.csv` or `linkedin_content*.csv`
- Recommended optional:
  - `x_post_analytics*.csv`
  - `x_video_overview*.csv`
  - `linkedin_posts*.csv`
  - `linkedin_visitors*.csv`
  - `linkedin_followers*.csv`
- Explain which panels will be unavailable if optional files are missing.
- Run:
  - `npm run inspect:data`

### Phase 4: safe X API setup (manual refresh only)
- Keep:
  - `API_REFRESH_MODE=manual`
  - `X_DATA_MODE=auto`
- Add in `.env.local`:
  - `X_API_BEARER_TOKEN=...`
  - `X_API_USERNAME=...`
- Add cost guardrails (if missing):
  - `X_API_REFRESH_COOLDOWN_SECONDS=10800`
  - `X_API_DAILY_REFRESH_CAP=2`
- Explain:
  - `Manual API Refresh` consumes credits.
  - `Override Refresh` bypasses cap/cooldown and should be used rarely.
  - `Reload CSV` does not consume credits.

### Phase 5: optional brand listening setup
- Ask if I want this.
- If yes, add:
  - `X_BRAND_QUERY=(my_brand OR #myhashtag)`
  - optional `X_BRAND_COMPARE_QUERY=(competitorA OR competitorB)`
  - `X_BRAND_LOOKBACK_DAYS=7`
- Explain expected results:
  - mention counts
  - share of voice
  - top authors

### Phase 6: verify X intelligence panels
- Confirm these sections show data:
  - X Refresh Guardrails
  - Mentions Intelligence
  - Repeat Supporters
  - Quote Analytics
  - Follower Snapshot
  - Brand Listening (if configured)
- Confirm CSV export buttons work:
  - supporter table CSV
  - follower snapshot CSV

### Phase 7: security checks
- Confirm `.env.local` is ignored by git.
- Run:
  - `git status --short`
- Ensure no secrets are staged.
- If any secret is staged, stop and remove it before commit.

### Phase 8: persistence + migration safety
- Explain that API history is saved locally in SQLite:
  - `Data/state/metrics.db`
- Run backup before upgrades:
  - `npm run state:backup`
- If reinstalling/migrating, restore from backup:
  - `npm run state:restore -- --from Data/backups/metrics-state-YYYYMMDD-HHMMSS`
- If target files already exist and should be replaced, use:
  - `npm run state:restore -- --from Data/backups/metrics-state-YYYYMMDD-HHMMSS --force`

## Troubleshooting playbook

If localhost fails:
- Ensure dev server is running in current terminal.
- Check port conflicts.
- Restart with:
  - `npm run dev -- --hostname 127.0.0.1 --port 3002`

If CSV parse fails:
- Confirm file is real CSV text (not renamed `.xlsx`).
- Re-export as UTF-8 CSV.

If API fetch fails:
- Confirm token and username are set.
- Confirm X billing/plan access for endpoints.
- Keep CSV fallback active so dashboard still works.

## Response format (strict)
For every step, respond with:
1. What to do now
2. Command(s)
3. Expected result
4. If it fails, exact fix

---
