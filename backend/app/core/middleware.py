"""CSRF protection, origin checks and security headers."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from starlette.responses import Response

from app.core.config import Settings
from app.core.errors import error_response
from app.core.security import constant_time_equals

logger = logging.getLogger("hackmate.http")

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
_DOCS_PREFIXES = ("/docs", "/redoc", "/openapi.json")


def _apply_security_headers(response: Response, path: str, *, hsts: bool) -> None:
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "no-referrer")
    headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if not path.startswith(_DOCS_PREFIXES):
        # The API serves JSON and images only; nothing should execute or be framed.
        headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if path.startswith("/api/") and "cache-control" not in headers:
        headers["Cache-Control"] = "no-store"
    if hsts:
        headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")


def install_security_middleware(app: FastAPI, settings: Settings) -> None:
    allowed_origins = frozenset(settings.cors_origins)
    csrf_cookie = settings.csrf_cookie_name
    csrf_header = settings.csrf_header_name
    hsts = settings.is_production

    @app.middleware("http")
    async def security_middleware(request: Request, call_next) -> Response:
        path = request.url.path
        if request.method not in SAFE_METHODS and path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin is not None and origin.rstrip("/") not in allowed_origins:
                response = error_response(403, "origin_not_allowed", "This request's origin is not allowed.")
                _apply_security_headers(response, path, hsts=hsts)
                return response
            # Double-submit check: the header value must match the CSRF cookie.
            # Cross-site pages can neither read the token nor set custom headers.
            if not constant_time_equals(request.cookies.get(csrf_cookie), request.headers.get(csrf_header)):
                response = error_response(
                    403,
                    "csrf_failed",
                    "Your security token is missing or expired. Refresh the page and try again.",
                )
                _apply_security_headers(response, path, hsts=hsts)
                return response
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001 - last-resort handler; details are logged, not returned
            logger.exception("Unhandled error on %s %s", request.method, path)
            response = error_response(500, "internal_error", "Something went wrong on our side. Please try again.")
        _apply_security_headers(response, path, hsts=hsts)
        return response
