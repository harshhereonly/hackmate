"""HackMate API application factory.

Run locally:   uvicorn app.main:app --reload
Production:    uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import install_security_middleware
from app.core.rate_limit import RateLimiter
from app.db.connection import DatabaseManager
from app.routers import (
    admin,
    auth,
    conversations,
    health,
    matching,
    messages,
    meta,
    notifications,
    opportunities,
    profiles,
    projects,
    reports,
    requests,
    research,
    saved,
)
from app.services.demo_data import has_demo_data, seed_demo_data
from app.services.email import EmailSender
from app.services.opportunities.hub import ProviderHub


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        manager = DatabaseManager(settings)
        manager.connect()
        manager.initialize()
        app.state.db_manager = manager
        if settings.seed_demo_data_on_startup and not settings.is_production and manager.indexes_ready:
            if not has_demo_data(manager.db):
                password = settings.seed_demo_password.get_secret_value() if settings.seed_demo_password else None
                counts = seed_demo_data(manager.db, password)
                logging.getLogger("hackmate").warning("Loaded labelled demo data: %s", counts)
        try:
            yield
        finally:
            app.state.providers.close()
            manager.close()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="REST API for HackMate: teammates, projects, opportunities, research and messaging.",
        lifespan=lifespan,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    app.state.settings = settings
    app.state.rate_limiter = RateLimiter(enabled=settings.rate_limit_enabled)
    app.state.email = EmailSender(settings)
    app.state.providers = ProviderHub(settings)

    register_exception_handlers(app)
    install_security_middleware(app, settings)
    # Added last so it is the outermost layer: error responses keep CORS headers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", settings.csrf_header_name],
        max_age=600,
    )

    for module in (health, meta, auth, profiles, projects, requests, notifications,
                   opportunities, research, saved, matching, conversations, messages, reports, admin):
        app.include_router(module.router, prefix="/api")

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {"service": settings.app_name, "status": "running", "docs": "/docs" if settings.docs_enabled else None}

    return app


def __getattr__(name: str):
    # `uvicorn app.main:app` resolves `app` lazily, so importing create_app (tests,
    # scripts) never builds an application from the ambient environment.
    if name == "app":
        application = create_app()
        globals()["app"] = application
        return application
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
