from __future__ import annotations

from pydantic import Field, field_validator, model_validator

from app.schemas.common import APIModel, PersonSummary, UTCDateTime
from app.schemas.enums import (
    CollaborationMode,
    PreferredExperience,
    ProjectCategory,
    ProjectStatus,
    RequestKind,
    RequestStatus,
    Role,
)
from app.schemas.profile import normalize_url
from app.utils import clean_text, dedupe_tags

MAX_TEAM_SIZE = 20


class _ProjectFields(APIModel):
    @field_validator("title", "summary", check_fields=False)
    @classmethod
    def _one_line(cls, value: str | None) -> str | None:
        return clean_text(value, collapse=True) if value is not None else None

    @field_validator("description", check_fields=False)
    @classmethod
    def _multi_line(cls, value: str | None) -> str | None:
        return clean_text(value) if value is not None else None

    @field_validator("required_skills", check_fields=False)
    @classmethod
    def _skills(cls, value: list[str] | None) -> list[str] | None:
        return dedupe_tags(value, max_items=20) if value is not None else None

    @field_validator("roles_needed", check_fields=False)
    @classmethod
    def _roles(cls, value: list[str] | None) -> list[str] | None:
        return list(dict.fromkeys(value)) if value is not None else None

    @field_validator("repo_url", check_fields=False)
    @classmethod
    def _repo(cls, value: str | None) -> str | None:
        return normalize_url(value, label="Project link")


class ProjectCreate(_ProjectFields):
    title: str = Field(min_length=3, max_length=100)
    summary: str = Field(min_length=10, max_length=200)
    description: str = Field(min_length=20, max_length=5000)
    required_skills: list[str] = Field(min_length=1, max_length=20)
    roles_needed: list[Role] = Field(default_factory=list, max_length=5)
    preferred_experience: PreferredExperience = "any"
    max_team_size: int = Field(ge=2, le=MAX_TEAM_SIZE)
    status: ProjectStatus = "recruiting"
    category: ProjectCategory
    collaboration_mode: CollaborationMode
    repo_url: str | None = None
    opportunity_id: str | None = None

    @model_validator(mode="after")
    def _non_empty_after_cleaning(self) -> "ProjectCreate":
        if not self.required_skills:
            raise ValueError("Add at least one required skill.")
        return self


class ProjectUpdate(_ProjectFields):
    title: str | None = Field(default=None, min_length=3, max_length=100)
    summary: str | None = Field(default=None, min_length=10, max_length=200)
    description: str | None = Field(default=None, min_length=20, max_length=5000)
    required_skills: list[str] | None = Field(default=None, min_length=1, max_length=20)
    roles_needed: list[Role] | None = Field(default=None, max_length=5)
    preferred_experience: PreferredExperience | None = None
    max_team_size: int | None = Field(default=None, ge=2, le=MAX_TEAM_SIZE)
    status: ProjectStatus | None = None
    category: ProjectCategory | None = None
    collaboration_mode: CollaborationMode | None = None
    repo_url: str | None = None
    opportunity_id: str | None = None


class LinkedOpportunity(APIModel):
    id: str
    title: str
    type: str


class ViewerRequestState(APIModel):
    id: str
    kind: RequestKind
    status: RequestStatus


class ProjectViewerState(APIModel):
    is_owner: bool = False
    is_member: bool = False
    request: ViewerRequestState | None = None
    can_request: bool = False
    cannot_request_reason: str | None = None


class ProjectListItem(APIModel):
    id: str
    title: str
    summary: str
    required_skills: list[str]
    roles_needed: list[Role]
    preferred_experience: PreferredExperience
    status: ProjectStatus
    category: ProjectCategory
    collaboration_mode: CollaborationMode
    member_count: int
    max_team_size: int
    open_spots: int
    owner: PersonSummary
    created_at: UTCDateTime
    updated_at: UTCDateTime
    is_removed: bool = False


class ProjectDetail(ProjectListItem):
    description: str
    repo_url: str | None = None
    opportunity: LinkedOpportunity | None = None
    viewer: ProjectViewerState
    removed_reason: str | None = None


class ProjectMember(APIModel):
    person: PersonSummary
    role: str  # "owner" | "member"
    functional_role: Role | None = None
    joined_at: UTCDateTime
    is_you: bool = False
