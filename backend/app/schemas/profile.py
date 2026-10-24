from __future__ import annotations

import re
from urllib.parse import urlparse

from pydantic import Field, field_validator

from app.schemas.common import APIModel, UTCDateTime
from app.schemas.enums import Availability, CollaborationMode, ExperienceLevel, MessagePermission, Role, Visibility
from app.utils import clean_text, dedupe_tags

HANDLE_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$")
RESERVED_HANDLES = {
    "me", "admin", "administrator", "api", "new", "edit", "settings", "support", "help",
    "hackmate", "root", "system", "moderator", "staff", "null", "undefined",
}


_SCHEME_PREFIX = re.compile(r"^([a-z][a-z0-9+.-]*):", re.IGNORECASE)


def normalize_url(value: str | None, *, label: str, hosts: tuple[str, ...] = ()) -> str | None:
    """Accept http(s) links only. A missing scheme is assumed to be https ("github.com/ada")."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if len(value) > 300:
        raise ValueError(f"{label} is too long.")
    if any(ch.isspace() for ch in value):
        raise ValueError(f"Enter a valid {label} without spaces.")
    has_http_scheme = value.lower().startswith(("http://", "https://"))
    scheme = _SCHEME_PREFIX.match(value)
    # "javascript:", "data:", "mailto:" etc. are rejected; "example.com:8080" is a host:port.
    if scheme and not has_http_scheme and "." not in scheme.group(1):
        raise ValueError(f"{label} must be an http(s) link.")
    if not has_http_scheme:
        value = "https://" + value
    parsed = urlparse(value)
    try:
        parsed.port  # raises ValueError for malformed ports
    except ValueError:
        raise ValueError(f"Enter a valid {label}.") from None
    host = (parsed.hostname or "").lower()
    if parsed.scheme.lower() not in ("http", "https") or "." not in host.strip("."):
        raise ValueError(f"Enter a valid {label} starting with https://")
    if parsed.username or parsed.password:
        raise ValueError(f"{label} must not contain credentials.")
    if hosts and not any(host == h or host.endswith("." + h) for h in hosts):
        raise ValueError(f"{label} must be a {hosts[0]} link.")
    return value


def validate_handle(value: str) -> str:
    value = value.strip().lower()
    if not HANDLE_PATTERN.match(value) or "--" in value:
        raise ValueError("Handle must be 3–30 characters: lowercase letters, numbers and single hyphens.")
    if value in RESERVED_HANDLES:
        raise ValueError("That handle is reserved. Please choose another.")
    return value


class ProfileUpdate(APIModel):
    """PATCH body: only the fields that are sent are changed."""

    name: str | None = Field(default=None, min_length=1, max_length=80)
    handle: str | None = None
    headline: str | None = Field(default=None, max_length=100)
    bio: str | None = Field(default=None, max_length=1000)
    institution: str | None = Field(default=None, max_length=120)
    background: str | None = Field(default=None, max_length=120)
    skills: list[str] | None = Field(default=None, max_length=30)
    interests: list[str] | None = Field(default=None, max_length=20)
    experience_level: ExperienceLevel | None = None
    preferred_roles: list[Role] | None = Field(default=None, max_length=5)
    availability: Availability | None = None
    collaboration_mode: CollaborationMode | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    linkedin_url: str | None = None
    visibility: Visibility | None = None
    allow_messages: MessagePermission | None = None
    open_to_collaborate: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = clean_text(value, collapse=True)
        if not value:
            raise ValueError("Name is required.")
        return value

    @field_validator("handle")
    @classmethod
    def _handle(cls, value: str | None) -> str | None:
        return validate_handle(value) if value is not None else None

    @field_validator("headline", "institution", "background")
    @classmethod
    def _single_line(cls, value: str | None) -> str | None:
        return clean_text(value, collapse=True) if value is not None else None

    @field_validator("bio")
    @classmethod
    def _bio(cls, value: str | None) -> str | None:
        return clean_text(value) if value is not None else None

    @field_validator("skills")
    @classmethod
    def _skills(cls, value: list[str] | None) -> list[str] | None:
        return dedupe_tags(value, max_items=30) if value is not None else None

    @field_validator("interests")
    @classmethod
    def _interests(cls, value: list[str] | None) -> list[str] | None:
        return dedupe_tags(value, max_items=20) if value is not None else None

    @field_validator("preferred_roles")
    @classmethod
    def _roles(cls, value: list[str] | None) -> list[str] | None:
        return list(dict.fromkeys(value)) if value is not None else None

    @field_validator("github_url")
    @classmethod
    def _github(cls, value: str | None) -> str | None:
        return normalize_url(value, label="GitHub URL", hosts=("github.com",))

    @field_validator("linkedin_url")
    @classmethod
    def _linkedin(cls, value: str | None) -> str | None:
        return normalize_url(value, label="LinkedIn URL", hosts=("linkedin.com",))

    @field_validator("portfolio_url")
    @classmethod
    def _portfolio(cls, value: str | None) -> str | None:
        return normalize_url(value, label="Portfolio URL")


class ProfileCompleteness(APIModel):
    percent: int
    missing: list[str]


class ProfileCard(APIModel):
    handle: str
    name: str
    headline: str | None = None
    avatar_url: str | None = None
    institution: str | None = None
    skills: list[str] = []
    interests: list[str] = []
    experience_level: ExperienceLevel | None = None
    preferred_roles: list[Role] = []
    availability: Availability | None = None
    collaboration_mode: CollaborationMode | None = None
    open_to_collaborate: bool = True


class ProfilePublic(ProfileCard):
    bio: str | None = None
    background: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    linkedin_url: str | None = None
    joined_at: UTCDateTime
    is_self: bool = False
    can_message: bool = False


class ProfileMe(ProfilePublic):
    visibility: Visibility
    allow_messages: MessagePermission
    completeness: ProfileCompleteness
