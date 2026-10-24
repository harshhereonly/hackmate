from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import APIModel, PersonSummary, UTCDateTime
from app.schemas.enums import ProjectStatus, RequestKind, RequestStatus, Role
from app.utils import clean_text


class _MessageField(APIModel):
    @field_validator("message", "note", check_fields=False)
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        return clean_text(value) if value is not None else None


class JoinRequestCreate(_MessageField):
    message: str = Field(default="", max_length=1000)
    role: Role | None = None


class InvitationCreate(_MessageField):
    handle: str = Field(min_length=3, max_length=30)
    message: str = Field(default="", max_length=1000)
    role: Role | None = None


class DecisionBody(_MessageField):
    note: str | None = Field(default=None, max_length=500)


class RequestProject(APIModel):
    id: str
    title: str
    status: ProjectStatus
    member_count: int
    max_team_size: int


class JoinRequestOut(APIModel):
    id: str
    kind: RequestKind
    status: RequestStatus
    direction: Literal["incoming", "outgoing"]
    message: str
    role: Role | None = None
    project: RequestProject | None
    # The other party: the applicant/invitee for owners, the owner for applicants/invitees.
    person: PersonSummary
    created_at: UTCDateTime
    decided_at: UTCDateTime | None = None
    decision_note: str | None = None
    can_decide: bool = False
    can_withdraw: bool = False


class RequestSummary(APIModel):
    incoming_pending: int
    outgoing_pending: int
