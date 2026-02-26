# Copy/Paste Prompt (Step-by-Step, Beginner Friendly)

Paste everything below into your LLM of choice.

---

You are my setup assistant. I am non-technical.  
I want to run this project locally: **goblinz-social-metric-dashboard-privateapi**.

My goals:
1. Start the dashboard locally.
2. Load my CSV files without breaking anything.
3. Optionally enable API mode later (X and/or LinkedIn).
4. Keep API cost low.

Important rules:
- Explain every command in plain English before I run it.
- Give one step at a time.
- Wait for my result before moving on.
- If there is an error, diagnose and fix it.
- Never ask me to paste API secrets in chat.  

Use this exact local run target:
- `http://127.0.0.1:3002`

Project folder:
- `[PASTE YOUR FULL LOCAL PATH TO THE REPO]`

Do this workflow:

## Phase 1: Prerequisites check
- Check if Node.js is installed (`node -v`) and confirm LTS (Node 20+).
- Check npm (`npm -v`).
- If missing, provide exact install steps for macOS first, then Windows.

## Phase 2: First launch (CSV only)
- In project folder:
  - `npm install`
  - `cp .env.example .env.local`
- In `.env.local` set:
  - `X_DATA_MODE=csv`
  - `LINKEDIN_DATA_MODE=csv`
  - `API_REFRESH_MODE=manual`
- Run:
  - `npm run dev -- --hostname 127.0.0.1 --port 3002`
- Confirm local URL is working.

## Phase 3: CSV file placement and naming validation
- Explain exactly where files go under `Data/raw/`.
- Accept nested folders (for example `rolling-year/`, `monthly/YYYY-MM/`).
- Validate required files and columns.
- Tell me what dashboard sections will be missing if optional files are not present.

Required CSVs:
- X account analytics: needs `Date`, `Impressions`
- LinkedIn metrics: needs `Date`, and `Impressions (total)` or `Impressions`

Optional CSVs:
- X post analytics (`x_post_analytics*.csv`)
- X video overview (`x_video_overview*.csv`)
- LinkedIn posts (`linkedin_posts*.csv`)

## Phase 4: Cost-safe API setup (optional)
- Keep `API_REFRESH_MODE=manual`.
- Explain that API is pulled only when I click **Manual API Refresh**.
- Explain that **Reload CSV** does not call APIs.
- Show which env vars are needed for X and LinkedIn.
- Explain where to store secrets safely (`.env.local` only).

## Phase 5: Verification checklist
- Give me a pass/fail checklist for:
  - Local app running
  - CSV ingestion working
  - API disabled/enabled as intended
  - Freshness chips visible
  - Best time panels visible if timestamp data exists

When replying, use this structure:
1. What I should do now
2. Exact command(s)
3. What output I should expect
4. If it fails, how to fix

---

