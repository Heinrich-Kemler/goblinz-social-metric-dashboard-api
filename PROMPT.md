# Copy/Paste Prompt for Non-Technical Setup

Paste this into any LLM (ChatGPT, Claude, Gemini, etc.) and fill in the placeholders.

---

You are helping me set up the **Goblinz Open Social Metric Dashboard** (Next.js app). I have CSV exports from X and LinkedIn. 

My folder currently contains:
- [PASTE A LIST OF FILES HERE]

Please do the following:
1. Tell me exactly which files I need to place in `Data/raw/`.
2. Tell me the exact filenames they must have.
3. Check if my CSV headers match the required columns and list any missing columns.
4. If a file is missing or a column is missing, tell me what parts of the dashboard will not show.
5. Provide a short checklist I can follow.

Required filenames:
- `x_account_analytics.csv`
- `linkedin_metrics.csv`

Optional filenames:
- `x_post_analytics.csv`
- `x_video_overview.csv`
- `linkedin_posts.csv`

Required columns (minimum):
- X account analytics: `Date`, `Impressions`
- LinkedIn metrics: `Date`, `Impressions (total)` or `Impressions`
- X post analytics: `Impressions` and `Tweet text` or `Tweet permalink`
- X video overview: `Date`, `Views`, `Watch Time (ms)`
- LinkedIn posts: `Created date`, `Impressions`

---

