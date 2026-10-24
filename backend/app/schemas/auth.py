from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import UTCDateTime
from app.schemas.profile import validate_handle
from app.utils import clean_text

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def validate_new_password(password: str) -> str:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters.")
    if len(password) > PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must be at most {PASSWORD_MAX_LENGTH} characters.")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise ValueError("Password must include at least one letter and one number.")
    if not password.strip():
        raise ValueError("Password cannot be only spaces.")
    return password


class _AuthModel(BaseModel):
    # Passwords must reach the hasher byte-for-byte, so no global whitespace stripping.
    model_config = ConfigDict(str_strip_whitespace=False, extra="ignore")


class SignupRequest(_AuthModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr = Field(max_length=254)
    password: str
    # Optional unique username (profile handle); generated from the name when omitted.
    username: str | None = Field(default=None, max_length=30)

    @field_validator("username")
    @classmethod
    def _username(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_handle(value)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        value = clean_text(value, collapse=True)
        if not value:
            raise ValueError("Name is required.")
        return value

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def _password_rules(cls, value: str) -> str:
        return validate_new_password(value)


class LoginRequest(_AuthModel):
    # Plain string (not EmailStr) so login never rejects an address that signup accepted.
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.strip().lower()


class EmailOnlyRequest(_AuthModel):
    email: EmailStr = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.strip().lower()


class TokenRequest(_AuthModel):
    token: str = Field(min_length=16, max_length=200)


class ResetPasswordRequest(_AuthModel):
    token: str = Field(min_length=16, max_length=200)
    password: str

    @field_validator("password")
    @classmethod
    def _password_rules(cls, value: str) -> str:
        return validate_new_password(value)


class ChangePasswordRequest(_AuthModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_rules(cls, value: str) -> str:
        return validate_new_password(value)


class AuthProfileSummary(BaseModel):
    handle: str
    name: str
    avatar_url: str | None = None


class AuthUser(BaseModel):
    """The signed-in user's own account. Only ever returned to that user."""

    id: str
    email: str
    role: Literal["user", "admin"]
    email_verified: bool
    created_at: UTCDateTime
    profile: AuthProfileSummary | None = None


class SessionResponse(BaseModel):
    user: AuthUser
    csrf_token: str


EmailDelivery = Literal["sent", "not_configured", "failed"]


class SignupResponse(BaseModel):
    user: AuthUser | None
    csrf_token: str
    verification_required: bool
    email_delivery: EmailDelivery


class CsrfResponse(BaseModel):
    csrf_token: str


class EmailActionResponse(BaseModel):
    message: str
    # "enabled": a message was sent if the account qualifies (deliberately not
    # revealing whether it exists); "not_configured": the server cannot send email.
    email_delivery: Literal["enabled", "not_configured"]
