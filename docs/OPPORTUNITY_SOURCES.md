# Opportunity data sources
| Source | Used for | Notes |
|---|---|---|
| OpenAlex | paper search | Needs a free API key for a useful daily budget (`OPENALEX_API_KEY`). Metadata is CC0. Open access is shown only if OpenAlex says so. |
| Crossref | paper search fallback | Set `CONTACT_EMAIL` for the polite pool. |
| GitHub REST | "good first issue" tasks | Optional `GITHUB_TOKEN`; unauthenticated search is ~10 requests/minute. |
| Admin-curated | hackathons / programs | Added in the admin panel with an official link. |
| Organizer feeds | hackathons | `HACKATHON_FEED_URLS`; admins press "Sync organizer feeds". |
| Demo data | demonstrations | Titles start with "Sample:", flagged `is_demo`, never carry registration links. |

No hackathon site is scraped (no open official API was found). Feed format:
`{"source":{"name":"...","url":"..."},"events":[{"id":"1","title":"...","url":"https://...","starts_at":"2030-01-01T00:00:00Z","ends_at":"...","deadline":"...","mode":"online","location":"","skills":[],"tags":[]}]}`
