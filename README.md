# HackMate

Find teammates, hackathons, projects and research collaborators. React 19 + TypeScript + Tailwind frontend, FastAPI backend, MongoDB.

The original static prototype is preserved in `legacy/`.

## Run locally (Windows PowerShell)
Backend (terminal 1):
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env      # then edit; for a no-database demo set USE_IN_MEMORY_DB=true and SEED_DEMO_DATA_ON_STARTUP=true
uvicorn app.main:app --reload
```
Frontend (terminal 2):
```powershell
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to :8000
```
API docs: http://localhost:8000/docs (development only).

`USE_IN_MEMORY_DB=true` is a development emulation (mongomock, snapshot file `backend/.local-db.json`). For real persistence set `MONGODB_URI` to your Atlas connection string.

## Checks
```powershell
cd backend;  .\.venv\Scripts\python.exe -m pytest      # 92 tests
cd frontend; npm run typecheck; npm test; npm run build
```

## Admin and demo data
- First admin (no public registration): `cd backend; python -m scripts.create_admin --email you@example.com`
- Demo data: `python -m scripts.seed` (clearly labelled "Sample"; remove with `--clear`).

## Docs
`docs/DEPLOYMENT.md`, `docs/OPPORTUNITY_SOURCES.md`, `docs/MATCHING.md`, `docs/IMPLEMENTATION_STATUS.md`.

## External credentials needed (all optional for local use)
MongoDB Atlas URI (persistence), SMTP (verification and reset emails; without it nothing is sent and the UI says so), OpenAlex API key, GitHub token, `CONTACT_EMAIL`.
