# Deployment: Vercel + Render + MongoDB Atlas

Nothing here has been deployed. These are the steps and the checks to run afterwards.

## 1. MongoDB Atlas
1. Create a free cluster, a database user (least privilege: readWrite on `hackmate`), and note the `mongodb+srv://` URI.
2. Network Access: allow Render's outbound IPs (Render dashboard > service > Connect > Outbound), or `0.0.0.0/0` only if you accept the exposure; the database password is then the only barrier.
3. Indexes are created automatically at API startup (`app/db/indexes.py`); check `GET /api/health/ready` returns `"indexes":"ok"`.

## 2. Render (backend)
Use `render.yaml` (Blueprint) or create a Web Service with root `backend`:
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
- Health check: `/api/health`
- Env: `ENVIRONMENT=production`, `MONGODB_URI`, `JWT_SECRET` (32+ chars), `CORS_ORIGINS`, `FRONTEND_URL`, SMTP_*, `CONTACT_EMAIL`, optional `OPENALEX_API_KEY`, `GITHUB_TOKEN`.
- The app refuses to start in production without a strong `JWT_SECRET`, `MONGODB_URI`, secure cookies, or if the in-memory DB/demo seeding is enabled.
- Create the first admin once, from a trusted machine with the production env loaded: `python -m scripts.create_admin --email you@example.com`.
- Free-tier note: rate limiting and the provider cache are in-process (single instance only).

## 3. Vercel (frontend)
- Root directory `frontend`; edit `vercel.json` and replace `YOUR-RENDER-SERVICE` with the Render hostname.
- Leave `VITE_API_BASE_URL` unset (defaults to `/api`). The rewrite makes the API same-origin, so cookies stay first-party (`SameSite=Lax`) and CSRF works without third-party cookies.
- Set `CORS_ORIGINS` and `FRONTEND_URL` on Render to the exact Vercel origin (no trailing slash).
- Cross-site alternative (not recommended): `VITE_API_BASE_URL=https://api.example.com/api`, `COOKIE_SAMESITE=none`; breaks in browsers that block third-party cookies.

## 4. Verify after deploying
1. `GET https://<render>/api/health/ready` returns `ready`, `in_memory_database:false`.
2. Sign up on the Vercel site; DevTools shows `hackmate_session` as `HttpOnly; Secure`.
3. Edit profile, redeploy/restart the API, confirm the data persists.
4. Forgot-password sends a real email (needs SMTP). Without SMTP the UI says email is not configured.
5. A normal account gets 403 on `/api/admin/stats`.
6. `/docs` is disabled in production unless `ENABLE_DOCS=true`.
