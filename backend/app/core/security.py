"""Password hashing, session tokens and single-use token helpers."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

JWT_ISSUER = "hackmate-api"
JWT_AUDIENCE = "hackmate-web"

# Argon2id with argon2-cffi's defaults (RFC 9106 low-memory profile).
_hasher = PasswordHasher()
_dummy_hash: str | None = None


def set_password_hasher(hasher: PasswordHasher) -> None:
    """Swap the hasher (tests use cheaper parameters to stay fast)."""
    global _hasher, _dummy_hash
    _hasher = hasher
    _dummy_hash = None


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Constant-effort verification; also burns time when the account is unknown."""
    global _dummy_hash
    if not password_hash:
        if _dummy_hash is None:
            _dummy_hash = _hasher.hash(secrets.token_urlsafe(16))
        try:
            _hasher.verify(_dummy_hash, password)
        except (VerificationError, InvalidHashError):
            pass
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def generate_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """Single-use tokens (email verification, password reset) are stored hashed."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def constant_time_equals(a: str | None, b: str | None) -> bool:
    if not a or not b:
        return False
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def create_session_token(
    *, user_id: str, session_id: str, secret: str, algorithm: str, ttl: timedelta
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "sid": session_id,
        "iat": now,
        "nbf": now,
        "exp": now + ttl,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "typ": "session",
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_session_token(token: str, *, secret: str, algorithm: str) -> dict[str, Any] | None:
    """Return the verified claims, or None for any invalid/expired/forged token."""
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "sid", "iss", "aud"]},
        )
    except jwt.PyJWTError:
        return None
    if claims.get("typ") != "session":
        return None
    return claims
