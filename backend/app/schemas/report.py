from __future__ import annotations

from pydantic import Field, field_validator

from app.schemas.common import APIModel, UTCDateTime
from app.schemas.enums import ReportReason, ReportStatus, ReportTargetType
from app.utils import clean_text


class ReportCreate(APIModel):
    target_type: ReportTargetType
    # A handle for users; an id for projects, opportunities and messages.
    target_id: str = Field(min_length=1, max_length=64)
    reason: ReportReason
    details: str = Field(default="", max_length=1000)

    @field_validator("details")
    @classmethod
    def _clean(cls, value: str) -> str:
        return clean_text(value)


class ReportOut(APIModel):
    id: str
    target_type: ReportTargetType
    reason: ReportReason
    details: str
    status: ReportStatus
    created_at: UTCDateTime
    resolved_at: UTCDateTime | None = None
    target_label: str


class ReportResolve(APIModel):
    resolution: ReportStatus = Field(description="'resolved' (action taken) or 'dismissed'")
    note: str = Field(default="", max_length=500)

    @field_validator("resolution")
    @classmethod
    def _not_open(cls, value: str) -> str:
        if value == "open":
            raise ValueError("Choose 'resolved' or 'dismissed'.")
        return value

    @field_validator("note")
    @classmethod
    def _clean(cls, value: str) -> str:
        return clean_text(value)
