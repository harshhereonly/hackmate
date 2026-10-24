from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness check (does not touch the database)")
def health(request: Request) -> dict:
    settings = request.app.state.settings
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


@router.get("/health/ready", summary="Readiness check (pings MongoDB)")
def ready(request: Request) -> JSONResponse:
    manager = request.app.state.db_manager
    ok = manager.ping()
    body = {
        "status": "ready" if ok else "not_ready",
        "database": "ok" if ok else "unreachable",
        "indexes": "ok" if manager.indexes_ready else "pending",
        # Surfaced so nobody mistakes the dev database for real storage.
        "in_memory_database": manager.in_memory,
    }
    return JSONResponse(status_code=200 if ok else 503, content=body)
