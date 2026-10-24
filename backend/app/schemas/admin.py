from __future__ import annotations

from typing import Any

from pydantic import Field, field_validator

from app.schemas.common import APIModel, UTCDateTime
from app.utils import clean_text


class ReasonBody(APIModel):
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason")
    @classmethod
    def _clean(cls, value: str) -> str:
        value = clean_text(value, collapse=True)
        if len(value) < 3:
            raise ValueError("Please give a short reason (at least 3 characters).")
        return value


class AdminStats(APIModel):
    users: dict[str, int]
    projects: dict[str, int]
    requests: dict[str, int]
    opportunities: dict[str, int]
    reports: dict[str, int]
    messaging: dict[str, int]


class AdminUserOut(APIModel):
    id: str
    email: str
    role: str
    status: str
    email_verified: bool
    created_at: UTCDateTime
    last_login_at: UTCDateTime | None = None
    suspended_reason: str | None = None
    handle: str | None = None
    name: str | None = None
    projects_owned: int = 0
    open_reports: int = 0
    is_demo: bool = False


class AdminReportOut(APIModel):
    id: str
    target_type: str
    target_id: str
    target: dict[str, Any]
    reason: str
    details: str
    status: str
    reporter: dict[str, Any]
    created_at: UTCDateTime
    resolved_at: UTCDateTime | None = None
    resolution_note: str | None = None
    resolved_by: str | None = None


class AdminListingOut(APIModel):
    id: str
    kind: str  # "project" | "opportunity"
    title: str
    type: str
    status: str | None = None
    source_kind: str | None = None
    owner: dict[str, Any] | None = None
    is_removed: bool
    removed_reason: str | None = None
    is_demo: bool = False
    verified: bool = False
    open_reports: int = 0
    created_at: UTCDateTime


class AuditEntryOut(APIModel):
    id: str
    action: str
    target_type: str
    target_id: str
    target_label: str
    reason: str | None = None
    admin: dict[str, Any]
    created_at: UTCDateTime
