# Metrics Reference (CSV vs API)

Legend:
- `CSV` = available with CSV files only
- `API` = improved or added when API is enabled
- `Hybrid` = CSV baseline + API enrichment

| Metric / Panel | CSV | API | Notes |
| --- | --- | --- | --- |
| Latest month snapshot (views/likes/comments/reposts/posts) | Yes | Yes | API enriches recent rows in hybrid mode |
| Totals (all time) | Yes | Yes | Built from merged dataset |
| Data quality + CSV validation | Yes | No | Based on local files |
| Per-post engagement (average + median) | Yes (if post counts exist) | Yes | Median uses daily engagement-per-post values |
| Top X posts | Yes (`x_post_analytics`) | Yes | Hybrid merges CSV + API top posts |
| Top LinkedIn posts | Yes (`linkedin_posts`) | Partial | v1 LinkedIn API focuses daily org stats |
| Best times to post (X) | Yes (if post timestamps exist) | Yes | Uses day+hour where timestamps exist |
| Best times to post (LinkedIn) | Yes (if post timestamps exist) | Partial | API adapter does not yet provide post-level times |
| Best day+hour matrix | Yes (if timestamps exist) | Yes for X, partial for LinkedIn | Heatmap by weekday and UTC hour |
| Video watch time (X) | Yes (`x_video_overview`) | No | API adapter v1 does not include watch-time endpoints |
| API freshness chips | No | Yes | Shows last successful API fetch time |
| X refresh guardrails panel | No | Yes | Shows cooldown, daily cap, in-flight lock status |
| Mentions intelligence panel | No | Yes | Uses `users/:id/mentions` for daily mentions + top mentioners |
| Repeat supporters panel | No | Yes | Uses `retweeted_by` + `liking_users`; includes verified filter + weekly retention estimate |
| Engagement cohort panel | No | Yes | Publish-week cohorts vs post-age buckets (`0-24h`, `1-3d`, `3-7d`, `7-14d`, `14-30d`, `30d+`) |
| Engagement concentration panel | No | Yes | Top-10/top-20 interaction share + cumulative concentration curve |
| Quote analytics panel | No | Yes | Uses `quote_tweets`; shows top quoted posts + quote author trend |
| Follower snapshot panel | No | Yes | Stores snapshots per refresh and computes deltas |
| Brand listening panel | No | Yes (optional) | Enabled only when `X_BRAND_QUERY` is configured |
| CSV export (supporters + follower snapshots) | No | Yes | Download current intelligence tables for offline history |
| Follow/profile efficiency (X) | Yes (if columns exist) | Yes | API may improve freshness |

## Cost-safe defaults

- Keep `API_REFRESH_MODE=manual`
- Use `Reload CSV` for local-only refreshes
- Use `Manual API Refresh` only when you explicitly want fresh API data
