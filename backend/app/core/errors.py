"""Centralized error type and exception handlers.

Every error response has the shape::

    {"error": {"code": "not_found", "message": "Project not found.", "details": ...}}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import AutoReconnect, ConnectionFailure, ServerSelectionTimeoutError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("hackmate.errors")

_STATUS_CODES = {
    400: "bad_request",
    401: "not_authenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    503: "service_unavailable",
}


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return {"error": body}


def error_response(status_code: int, code: str, message: str, details: Any = None,
                   headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_body(code, message, details), headers=headers)


# Convenience constructors keep router code short and consistent.
def not_found(message: str = "The requested resource was not found.") -> AppError:
    return AppError(404, "not_found", message)


def forbidden(message: str = "You do not have permission to do that.", code: str = "forbidden") -> AppError:
    return AppError(403, code, message)


def conflict(message: str, code: str = "conflict") -> AppError:
    return AppError(409, code, message)


def bad_request(message: str, code: str = "bad_request", details: Any = None) -> AppError:
    return AppError(400, code, message, details=details)


def unauthorized(message: str = "Please sign in to continue.", code: str = "not_authenticated") -> AppError:
    return AppError(401, code, message)


def _format_validation_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Field-level messages without echoing submitted values (which may be passwords)."""
    details = []
    for err in errors:
        loc = [str(part) for part in err.get("loc", ()) if part not in ("body", "query", "path", "header", "cookie")]
        message = str(err.get("msg", "Invalid value."))
        for prefix in ("Value error, ", "Assertion failed, "):
            if message.startswith(prefix):
                message = message[len(prefix):]
        details.append({"field": ".".join(loc) or None, "message": message})
    return details


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.details, exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "error")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        if exc.status_code == 404 and message == "Not Found":
            message = "The requested resource was not found."
        return error_response(exc.status_code, code, message, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = _format_validation_errors(list(exc.errors()))
        first = details[0]["message"] if details else "Some fields are invalid."
        message = "Please correct the highlighted fields." if len(details) > 1 else first
        return error_response(422, "validation_error", message, details)

    async def _db_unavailable(_: Request, exc: Exception) -> JSONResponse:
        logger.error("Database unavailable: %s", exc.__class__.__name__)
        return error_response(503, "database_unavailable",
                              "The database is temporarily unavailable. Please try again shortly.")

    for exc_type in (ServerSelectionTimeoutError, ConnectionFailure, AutoReconnect):
        app.add_exception_handler(exc_type, _db_unavailable)
