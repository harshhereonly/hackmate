"""Account lifecycle: signup, login, sessions, email verification and password resets."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from bson import ObjectId
from fastapi import Response
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.core.config import Settings
from app.core.errors import AppError, bad_request, conflict
from app.core.rate_limit import RateLimiter
from app.core.security import (
    create_session_token,
    generate_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_password,
)
from app.services import profiles as profile_service
from app.services.email import Delivery, EmailSender, password_reset_email, verification_email
from app.utils import utcnow

logger = logging.getLogger("hackmate.auth")

LOGIN_FAILURE_LIMIT = 8
LOGIN_FAILURE_WINDOW = 15 * 60


def _username_taken() -> AppError:
    return AppError(409, "handle_taken", "That username is already taken.",
                    details=[{"field": "username", "message": "That username is already taken."}])


# --- Cookies ----------------------------------------------------------------

def set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.secure_cookies,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        domain=settings.cookie_domain,
        secure=settings.secure_cookies,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def issue_csrf_token(response: Response, settings: Settings) -> str:
    """Set a fresh CSRF cookie. The same value goes back in the JSON body for the SPA to echo."""
    token = generate_token(32)
    response.set_cookie(
        settings.csrf_cookie_name,
        token,
        max_age=30 * 24 * 3600,
        httponly=True,
        secure=settings.secure_cookies,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    return token


# --- Sessions ---------------------------------------------------------------

def create_session(db: Database, settings: Settings, user_id: ObjectId, user_agent: str | None) -> str:
    session_id = generate_token(24)
    now = utcnow()
    ttl = timedelta(hours=settings.session_ttl_hours)
    db.sessions.insert_one({
        "_id": session_id,
        "user_id": user_id,
        "created_at": now,
        "expires_at": now + ttl,
        "user_agent": (user_agent or "")[:200],
        "revoked_at": None,
    })
    return create_session_token(
        user_id=str(user_id), session_id=session_id, secret=settings.jwt_key,
        algorithm=settings.jwt_algorithm, ttl=ttl,
    )


def revoke_session(db: Database, session_id: str) -> None:
    db.sessions.update_one({"_id": session_id, "revoked_at": None}, {"$set": {"revoked_at": utcnow()}})


def revoke_all_sessions(db: Database, user_id: ObjectId, *, except_session: str | None = None) -> int:
    query: dict[str, Any] = {"user_id": user_id, "revoked_at": None}
    if except_session:
        query["_id"] = {"$ne": except_session}
    return db.sessions.update_many(query, {"$set": {"revoked_at": utcnow()}}).modified_count


# --- Serialization ----------------------------------------------------------

def auth_user_payload(db: Database, user: dict[str, Any]) -> dict[str, Any]:
    profile = db.profiles.find_one({"user_id": user["_id"]}, profile_service.SUMMARY_PROJECTION)
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "role": user.get("role", "user"),
        "email_verified": bool(user.get("email_verified")),
        "created_at": user["created_at"],
        "profile": {
            "handle": profile["handle"],
            "name": profile["name"],
            "avatar_url": profile_service.avatar_url(profile),
        } if profile else None,
    }


# --- Single-use tokens ------------------------------------------------------

def _create_auth_token(db: Database, user_id: ObjectId, purpose: str, ttl: timedelta) -> str:
    db.auth_tokens.delete_many({"user_id": user_id, "purpose": purpose, "used_at": None})
    token = generate_token(32)
    now = utcnow()
    db.auth_tokens.insert_one({
        "user_id": user_id,
        "purpose": purpose,
        "token_hash": hash_token(token),
        "created_at": now,
        "expires_at": now + ttl,
        "used_at": None,
    })
    return token


def _consume_auth_token(db: Database, token: str, purpose: str) -> ObjectId | None:
    now = utcnow()
    doc = db.auth_tokens.find_one_and_update(
        {"token_hash": hash_token(token), "purpose": purpose, "used_at": None, "expires_at": {"$gt": now}},
        {"$set": {"used_at": now}},
    )
    return doc["user_id"] if doc else None


def send_verification_email(db: Database, settings: Settings, email: EmailSender,
                            user: dict[str, Any], name: str) -> Delivery:
    hours = settings.email_verification_ttl_hours
    token = _create_auth_token(db, user["_id"], "verify_email", timedelta(hours=hours))
    link = f"{settings.frontend_url}/verify-email?token={token}"
    subject, body = verification_email(name, link, hours)
    return email.send(user["email"], subject, body, purpose="Email verification", dev_link=link)


# --- Flows ------------------------------------------------------------------

def signup(db: Database, settings: Settings, email: EmailSender, *, name: str, address: str,
           password: str, username: str | None = None) -> tuple[dict[str, Any], Delivery]:
    if db.users.find_one({"email": address}, {"_id": 1}):
        raise conflict("An account with this email already exists. Try signing in instead.", code="email_taken")
    if username and profile_service.handle_taken(db, username):
        raise _username_taken()
    now = utcnow()
    user = {
        "email": address,
        "password_hash": hash_password(password),
        "role": "user",
        "status": "active",
        "email_verified": False,
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    }
    try:
        user["_id"] = db.users.insert_one(user).inserted_id
    except DuplicateKeyError:
        raise conflict("An account with this email already exists. Try signing in instead.",
                       code="email_taken") from None
    try:
        profile_service.create_profile(db, user["_id"], name, username)
    except DuplicateKeyError:
        db.users.delete_one({"_id": user["_id"]})
        raise _username_taken() from None
    except Exception:
        db.users.delete_one({"_id": user["_id"]})  # keep signup atomic from the user's point of view
        raise
    delivery = send_verification_email(db, settings, email, user, name)
    return user, delivery


def authenticate(db: Database, settings: Settings, limiter: RateLimiter, *, address: str,
                 password: str) -> dict[str, Any]:
    failure_key = f"login-fail:{address}"
    retry_after = limiter.is_exceeded(failure_key, LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW)
    if retry_after:
        raise AppError(
            429, "rate_limited",
            "Too many failed sign-in attempts for this account. Please wait and try again, or reset your password.",
            details={"retry_after_seconds": retry_after}, headers={"Retry-After": str(retry_after)},
        )

    user = db.users.find_one({"email": address})
    if not verify_password(user.get("password_hash") if user else None, password):
        limiter.record(failure_key)
        raise AppError(401, "invalid_credentials", "Incorrect email or password.")
    assert user is not None
    limiter.clear(failure_key)

    if password_needs_rehash(user["password_hash"]):
        db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(password)}})
    if user.get("status") != "active":
        raise AppError(403, "account_suspended", "Your account is suspended. Contact the HackMate team for help.")
    if settings.require_email_verification and not user.get("email_verified"):
        raise AppError(403, "email_not_verified", "Please verify your email address before signing in.")
    db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": utcnow()}})
    return user


def verify_email(db: Database, token: str) -> None:
    user_id = _consume_auth_token(db, token, "verify_email")
    if not user_id:
        raise bad_request("This verification link is invalid or has expired.", code="invalid_token")
    now = utcnow()
    db.users.update_one({"_id": user_id}, {"$set": {"email_verified": True, "email_verified_at": now, "updated_at": now}})


def resend_verification(db: Database, settings: Settings, email: EmailSender, address: str) -> None:
    user = db.users.find_one({"email": address})
    if not user or user.get("email_verified") or user.get("status") != "active":
        return  # same response either way: no account enumeration
    profile = db.profiles.find_one({"user_id": user["_id"]}, {"name": 1})
    send_verification_email(db, settings, email, user, profile["name"] if profile else "there")


def request_password_reset(db: Database, settings: Settings, email: EmailSender, address: str) -> None:
    user = db.users.find_one({"email": address})
    if not user or user.get("status") != "active":
        return
    minutes = settings.password_reset_ttl_minutes
    token = _create_auth_token(db, user["_id"], "reset_password", timedelta(minutes=minutes))
    link = f"{settings.frontend_url}/reset-password?token={token}"
    profile = db.profiles.find_one({"user_id": user["_id"]}, {"name": 1})
    subject, body = password_reset_email(profile["name"] if profile else "there", link, minutes)
    email.send(user["email"], subject, body, purpose="Password reset", dev_link=link)


def reset_password(db: Database, limiter: RateLimiter, token: str, new_password: str) -> None:
    user_id = _consume_auth_token(db, token, "reset_password")
    if not user_id:
        raise bad_request("This reset link is invalid or has expired. Request a new one.", code="invalid_token")
    user = db.users.find_one({"_id": user_id}, {"email": 1})
    now = utcnow()
    db.users.update_one({"_id": user_id}, {"$set": {"password_hash": hash_password(new_password), "updated_at": now}})
    revoke_all_sessions(db, user_id)
    if user:
        limiter.clear(f"login-fail:{user['email']}")


def change_password(db: Database, user_id: ObjectId, session_id: str, current: str, new: str) -> None:
    user = db.users.find_one({"_id": user_id})
    if not user or not verify_password(user.get("password_hash"), current):
        raise AppError(400, "invalid_current_password", "Your current password is incorrect.",
                       details=[{"field": "current_password", "message": "Incorrect password."}])
    if verify_password(user["password_hash"], new):
        raise bad_request("Choose a password different from your current one.", code="password_unchanged",
                          details=[{"field": "new_password", "message": "Must differ from your current password."}])
    db.users.update_one({"_id": user_id}, {"$set": {"password_hash": hash_password(new), "updated_at": utcnow()}})
    revoke_all_sessions(db, user_id, except_session=session_id)
