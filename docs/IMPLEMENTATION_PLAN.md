# HackMate — Implementation Plan

## 1. What exists today (inspection results)

| Area | Findings |
|---|---|
| `frontend/` | Static HTML/CSS/JS prototype: `index.html` (landing), `login.html`, `signup.html`, `profile.html`, `projects.html`, `requests.html`, one shared `styles.css`, and page scripts. Auth is client-side validation with a simulated submit. The profile is saved to `localStorage`. Projects and requests are hard-coded arrays changed only in memory. `find.html` is linked but missing. Icons are emoji. No API calls. |
| `backend/` | FastAPI skeleton: `main.py` (root + `/health`, CORS), `app/config.py` (`os.getenv`, insecure default secret), `app/database.py` (SQLAlchemy engine that no route uses), empty `routers/`, `schemas/`, `models/` packages, old pinned requirements (FastAPI 0.104, SQLAlchemy, psycopg2, passlib, python-jose), `README.md`, `SETUP.md`. |
| Other | `.vscode/launch.json` (Chrome against :8080). `# Code Citations.litcoffee` is an editor-generated citation log, not app code, so it is left untouched. |
| Toolchain | Python 3.14.4 (default) and 3.11, Node 24.15, npm 11.12, Git 2.54. Docker is installed but its daemon is not running. There is no local MongoDB. |

## 2. What gets reused

- **Visual language**: deep navy background, violet `#6c63ff` accent, Inter, rounded cards and pill buttons. These become Tailwind design tokens, with fewer gradients and less glass, and Lucide icons instead of emoji.
- **Page inventory and copy**: landing sections, auth forms, profile fields, project form fields, request tabs. These become React pages.
- **Validation rules**: email format, password ≥ 8 characters, matching confirmation, bio ≤ 500 characters. These become Zod schemas, enforced again on the server with Pydantic.
- **Interactions**: adding and removing skill tags, the create-project form, tabbed request statuses, toasts, confirming before rejecting.
- **Backend entry point**: `backend/main.py` stays as a thin shim, so `python main.py` and `uvicorn main:app` keep working.

## 3. Migration strategy (nothing is deleted)

1. Move the static prototype unchanged to `legacy/static-frontend/` as a reference. It is no longer served.
2. Move the SQLAlchemy skeleton files (`config.py`, `database.py`, old docs and requirements) to `legacy/backend-skeleton/`.
3. Build the React + Vite + TypeScript app in `frontend/` and the modular FastAPI app in `backend/app/`.

## 4. Key technical decisions

| Topic | Decision |
|---|---|
| DB access | Synchronous PyMongo (`def` routes run in FastAPI's threadpool). `MONGODB_URI` points at Atlas. |
| Local DB without Atlas | `USE_IN_MEMORY_DB=true` runs on `mongomock` with an optional JSON snapshot file. It is dev-only and refused when `ENVIRONMENT=production`. Tests always use `mongomock`. |
| Passwords | Argon2id (`argon2-cffi`), rehashed when parameters change. A dummy verify runs for unknown emails to equalize timing. |
| Sessions | JWT (HS256, `sub` + `sid`) in an HttpOnly cookie. It is backed by a `sessions` collection, so logout, password reset and suspension revoke it server-side. |
| CSRF | Double-submit token. `GET /api/auth/csrf` sets a cookie and returns the token. Unsafe methods must send a matching `X-CSRF-Token` header. Origin is checked against allowed origins. |
| CORS | Only the origins listed in `CORS_ORIGINS`, with credentials. |
| Rate limits | In-memory sliding window per IP and per account on auth, messaging, posting and reporting. Multi-instance deployments would need Redis; this is documented. |
| Privacy | People are addressed by a public `handle`. Emails and internal account ids are never returned to other users. Profile visibility is `public`, `members` or `hidden`. |
| Avatars | Uploads are re-encoded with Pillow (metadata stripped, 256 px WebP) and stored in MongoDB, so they persist on Render. The fallback is an initials avatar. |
| Opportunities | A provider layer: curated/community DB entries, OpenAlex and Crossref (papers), GitHub "good first issue" (open-source), and a clearly labeled demo dataset. Results are cached and degrade gracefully when providers fail. |
| Hackathons | Admin-curated entries with official links, plus labeled demo data, plus a configurable JSON feed provider. No scraping of sites whose terms forbid it. |
| Matching | Deterministic, explainable weighted scoring that rewards covering the team's missing skills and roles, then interests, experience, availability and collaboration mode. Low-information profiles are flagged instead of being given confident scores. Documented in `docs/MATCHING.md`. |
| Messaging | Database-backed direct conversations and project team conversations, refreshed by polling. No WebSockets in v1. |
| Frontend | React, Vite, TypeScript, Tailwind v4, React Router, Axios, React Hook Form + Zod, Lucide. Vite proxies `/api` in development so cookies are first-party. |
| Deployment | Vercel serves the frontend and rewrites `/api/*` to the Render backend, so cookies stay first-party with `SameSite=Lax`. A cross-site mode (`SameSite=None`) is documented with its caveats. |

## 5. Phases

| Phase | Scope | Exit check |
|---|---|---|
| 1 | Inspect the repo, move legacy files, scaffold Vite/React/TS/Tailwind and the FastAPI packages | `npm run build` and the backend imports cleanly |
| 2 | Design system, layouts, routing, every primary page UI | Build passes; pages render |
| 3 | FastAPI config, Mongo connection, indexes, errors, security headers, health and readiness | Health tests pass |
| 4 | Signup, login, logout, sessions, CSRF, rate limits, verify-email and reset flows, profiles, avatars | Auth and profile tests pass |
| 5 | Projects CRUD, memberships, join requests and invitations, capacity rules, notifications | Lifecycle tests pass |
| 6 | Opportunity Explorer, providers, saved items, research search, research collaboration posts and applications | Provider and filter tests pass |
| 7 | Matching engine and endpoints (user→teammates, project→candidates, user→opportunities) | Scoring tests pass |
| 8 | Conversations, messages, read state, notifications, unread counts | Messaging tests pass |
| 9 | Admin dashboard, reports, moderation, suspensions, curated listings, audit log | Admin authorization tests pass |
| 10 | Frontend tests, accessibility pass, seed script, deployment configs and docs | All suites green; build green |

After each phase: run the tests and the build, then update `docs/IMPLEMENTATION_STATUS.md`.

## 6. External dependencies and risks

- **MongoDB Atlas**: needed for real persistence. Without it, the dev in-memory mode works but is labeled non-persistent.
- **SMTP**: needed to deliver verification and reset emails. Without it, the link is logged to the backend console in development only and never returned by the API.
- **OpenAlex, Crossref and GitHub APIs**: need outbound internet. Optional contact email and token improve rate limits. When they fail, the UI shows a clear "provider unavailable" message and DB entries still load.
- **Hackathons**: there is no official open hackathon API, so listings come from admin-curated entries or organizer-published feeds.
