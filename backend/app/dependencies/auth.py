"""Authentication and authorization dependencies.

Every authenticated request verifies the JWT signature *and* looks up the
server-side session, so logout, password resets and suspensions take effect
immediately. Roles always come from the database, never from the client.
"""

from __future__ import annotations

from dataclasses import dataclass

from bson import ObjectId
from fastapi import Depends, Request

from app.core.errors import AppError, unauthorized
from app.core.security import decode_session_token
from app.db.connection import get_db
from app.utils import try_object_id, utcnow


@dataclass(frozen=True)
class CurrentUser:
    id: ObjectId
    email: str
    role: str
    status: str
    email_verified: bool
    session_id: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def id_str(self) -> str:
        return str(self.id)


_UNSET = object()


def _resolve_user(request: Request) -> CurrentUser | None:
    cached = getattr(request.state, "current_user", _UNSET)
    if cached is not _UNSET:
        return cached  # type: ignore[return-value]

    user: CurrentUser | None = None
    settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name)
    claims = decode_session_token(token, secret=settings.jwt_key, algorithm=settings.jwt_algorithm) if token else None
    user_id = try_object_id(claims.get("sub")) if claims else None
    if claims and user_id:
        db = get_db(request)
        session = db.sessions.find_one({"_id": claims["sid"], "user_id": user_id})
        if session and not session.get("revoked_at") and session["expires_at"] > utcnow():
            doc = db.users.find_one(
                {"_id": user_id}, {"email": 1, "role": 1, "status": 1, "email_verified": 1}
            )
            if doc:
                user = CurrentUser(
                    id=doc["_id"],
                    email=doc["email"],
                    role=doc.get("role", "user"),
                    status=doc.get("status", "active"),
                    email_verified=bool(doc.get("email_verified")),
                    session_id=session["_id"],
                )
    request.state.current_user = user
    return user


def get_optional_user(request: Request) -> CurrentUser | None:
    """The signed-in, active user, or None (suspended users are treated as signed out)."""
    user = _resolve_user(request)
    if user and user.status != "active":
        return None
    return user


def get_current_user(request: Request) -> CurrentUser:
    user = _resolve_user(request)
    if user is None:
        raise unauthorized()
    if user.status != "active":
        raise AppError(403, "account_suspended", "Your account is suspended. Contact the HackMate team for help.")
    return user


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise AppError(403, "admin_required", "Administrator access is required.")
    return user
