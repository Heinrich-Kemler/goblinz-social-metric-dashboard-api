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
| Follow/profile efficiency (X) | Yes (if columns exist) | Yes | API may improve freshness |

## Cost-safe defaults

- Keep `API_REFRESH_MODE=manual`
- Use `Reload CSV` for local-only refreshes
- Use `Manual API Refresh` only when you explicitly want fresh API data
