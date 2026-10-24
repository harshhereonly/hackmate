# Implementation status (evidence-based)
Updated 2026-10-24. "Verified" means I ran it and saw the result.

## Verified
- Backend tests: 92 passed (`pytest`, Python 3.14, mongomock). Covers auth, CSRF, sessions, profiles/privacy, projects, join-request lifecycle, team capacity, opportunities (mocked providers), matching, messaging, admin authorization, moderation, seed/admin scripts.
- Frontend: `tsc` clean, `npm run build` succeeds, 9 vitest tests pass (validation, API error normalization, login journey, route guards).
- Live local smoke test against the running API: CSRF rejects unauthenticated POST (403), signup sets HttpOnly session and CSRF cookies, `/auth/me` works, a normal user gets 403 on `/admin/stats`, teammate suggestions return explained results.
- Fixed this session: readiness reported `indexes: pending` when a dev snapshot was reloaded (mongomock ignores a partial unique index); now tolerated in dev, unaffected on Atlas.

## NOT verified (needs credentials, external access, or a browser)
- MongoDB Atlas connectivity and persistence across restarts on Atlas (only the in-memory dev DB was run).
- Real email delivery (no SMTP configured; flows tested with a fake mailbox).
- Live OpenAlex/Crossref/GitHub calls inside the app (parsers were checked against real responses once; tests use mocks). OpenAlex works keyless only with a tiny shared budget.
- Visual/responsive/keyboard/contrast review in a browser; the UI was type-checked and built but not visually inspected.
- Component-level tests exist only for auth; projects, requests, messaging and admin pages have no frontend tests.
- Deployment to Vercel/Render: not performed. Config prepared (`render.yaml`, `frontend/vercel.json`, `docs/DEPLOYMENT.md`).
- Rate limiting and caches are in-memory (single instance only).

## Next actions
1. Create the Atlas cluster, set `MONGODB_URI`, run the API, confirm `/api/health/ready` shows `indexes: ok`, and that a profile survives a restart.
2. Configure SMTP and test verify/reset emails.
3. Click through the app in a browser at mobile and desktop widths.
4. Replace the Render hostname in `frontend/vercel.json`, then deploy (needs your approval).
