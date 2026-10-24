from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import APIModel, PersonSummary, UTCDateTime
from app.schemas.enums import ApplicationStatus, OpportunityMode, OpportunitySourceKind, OpportunityType
from app.schemas.profile import normalize_url
from app.utils import clean_text, dedupe_tags, to_naive_utc

TimingStatus = Literal["upcoming", "ongoing", "open", "closed", "past", "unscheduled"]


class OpportunityFields(APIModel):
    title: str = Field(min_length=3, max_length=140)
    summary: str = Field(min_length=10, max_length=300)
    description: str = Field(default="", max_length=5000)
    organizer: str = Field(default="", max_length=120)
    url: str | None = None
    skills: list[str] = Field(default_factory=list, max_length=15)
    tags: list[str] = Field(default_factory=list, max_length=10)
    mode: OpportunityMode | None = None
    location: str = Field(default="", max_length=120)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    deadline: datetime | None = None
    accepts_applications: bool = False

    @field_validator("title", "summary", "organizer", "location")
    @classmethod
    def _one_line(cls, value: str) -> str:
        return clean_text(value, collapse=True)

    @field_validator("description")
    @classmethod
    def _text(cls, value: str) -> str:
        return clean_text(value)

    @field_validator("url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        return normalize_url(value, label="Link")

    @field_validator("skills")
    @classmethod
    def _skills(cls, value: list[str]) -> list[str]:
        return dedupe_tags(value, max_items=15)

    @field_validator("tags")
    @classmethod
    def _tags(cls, value: list[str]) -> list[str]:
        return dedupe_tags(value, max_items=10)

    @field_validator("starts_at", "ends_at", "deadline")
    @classmethod
    def _utc(cls, value: datetime | None) -> datetime | None:
        return to_naive_utc(value)

    @model_validator(mode="after")
    def _dates_in_order(self):
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("The end date must be after the start date.")
        return self


class CommunityOpportunityCreate(OpportunityFields):
    """Members can post research collaboration opportunities."""

    type: Literal["research"] = "research"


class CuratedOpportunityCreate(OpportunityFields):
    """Admin-curated listings (hackathons, programs, research openings) with an official link."""

    type: OpportunityType
    source_name: str = Field(default="", max_length=120)
    source_url: str | None = None

    @field_validator("source_url")
    @classmethod
    def _source_url(cls, value: str | None) -> str | None:
        return normalize_url(value, label="Source link")


class OpportunityUpdate(APIModel):
    title: str | None = Field(default=None, min_length=3, max_length=140)
    summary: str | None = Field(default=None, min_length=10, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    organizer: str | None = Field(default=None, max_length=120)
    url: str | None = None
    skills: list[str] | None = Field(default=None, max_length=15)
    tags: list[str] | None = Field(default=None, max_length=10)
    mode: OpportunityMode | None = None
    location: str | None = Field(default=None, max_length=120)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    deadline: datetime | None = None
    accepts_applications: bool | None = None
    source_name: str | None = Field(default=None, max_length=120)
    source_url: str | None = None

    @field_validator("title", "summary", "organizer", "location", "source_name")
    @classmethod
    def _one_line(cls, value: str | None) -> str | None:
        return clean_text(value, collapse=True) if value is not None else None

    @field_validator("description")
    @classmethod
    def _text(cls, value: str | None) -> str | None:
        return clean_text(value) if value is not None else None

    @field_validator("url", "source_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        return normalize_url(value, label="Link")

    @field_validator("skills")
    @classmethod
    def _skills(cls, value: list[str] | None) -> list[str] | None:
        return dedupe_tags(value, max_items=15) if value is not None else None

    @field_validator("tags")
    @classmethod
    def _tags(cls, value: list[str] | None) -> list[str] | None:
        return dedupe_tags(value, max_items=10) if value is not None else None

    @field_validator("starts_at", "ends_at", "deadline")
    @classmethod
    def _utc(cls, value: datetime | None) -> datetime | None:
        return to_naive_utc(value)


class OpportunitySource(APIModel):
    kind: OpportunitySourceKind
    name: str
    url: str | None = None


class ViewerApplication(APIModel):
    id: str
    status: ApplicationStatus


class OpportunityViewerState(APIModel):
    saved: bool = False
    is_owner: bool = False
    application: ViewerApplication | None = None
    can_apply: bool = False
    cannot_apply_reason: str | None = None


class OpportunityOut(APIModel):
    id: str
    key: str
    type: OpportunityType
    title: str
    summary: str
    description: str = ""
    organizer: str = ""
    url: str | None = None
    source: OpportunitySource
    skills: list[str] = []
    tags: list[str] = []
    mode: OpportunityMode | None = None
    location: str = ""
    starts_at: UTCDateTime | None = None
    ends_at: UTCDateTime | None = None
    deadline: UTCDateTime | None = None
    timing: TimingStatus
    is_demo: bool = False
    verified: bool = False
    accepts_applications: bool = False
    posted_by: PersonSummary | None = None
    teams_forming: int = 0
    is_removed: bool = False
    created_at: UTCDateTime
    viewer: OpportunityViewerState | None = None


class ApplicationCreate(APIModel):
    message: str = Field(default="", max_length=1000)

    @field_validator("message")
    @classmethod
    def _clean(cls, value: str) -> str:
        return clean_text(value)


class ApplicationOut(APIModel):
    id: str
    status: ApplicationStatus
    direction: Literal["incoming", "outgoing"]
    message: str
    opportunity: dict | None
    person: PersonSummary
    created_at: UTCDateTime
    decided_at: UTCDateTime | None = None
    can_decide: bool = False
    can_withdraw: bool = False


# --- Live provider results ----------------------------------------------------

class PaperOut(APIModel):
    key: str
    source: Literal["openalex", "crossref"]
    title: str
    authors: list[str] = []
    published: str | None = None  # "2024", "2024-05" or "2024-05-17", as the source provides
    venue: str | None = None
    doi: str | None = None
    url: str | None = None
    abstract: str | None = None
    open_access: bool | None = None  # None = unknown; never assumed
    open_access_url: str | None = None
    cited_by: int | None = None
    type: str | None = None


class OpenSourceIssueOut(APIModel):
    key: str
    title: str
    repository: str
    url: str
    labels: list[str] = []
    language: str | None = None
    comments: int = 0
    summary: str = ""
    updated_at: UTCDateTime | None = None


class ProviderPage(APIModel):
    total: int
    page: int
    page_size: int
    pages: int
    source: str
    attribution: str
    notice: str | None = None


class PaperPage(ProviderPage):
    items: list[PaperOut]


class IssuePage(ProviderPage):
    items: list[OpenSourceIssueOut]


class SavedItemCreate(APIModel):
    item_key: str = Field(min_length=3, max_length=200, pattern=r"^(opportunity|project|openalex|crossref|github):[^\s]+$")
    # Snapshot for external items (papers, issues), shown only to the saving user.
    title: str | None = Field(default=None, max_length=300)
    url: str | None = None
    subtitle: str | None = Field(default=None, max_length=300)
    item_type: Literal["hackathon", "project", "research", "paper", "issue"] | None = None

    @field_validator("url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        return normalize_url(value, label="Link")

    @field_validator("title", "subtitle")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        return clean_text(value, collapse=True) if value is not None else None


class SavedItemOut(APIModel):
    item_key: str
    item_type: str
    title: str
    subtitle: str | None = None
    url: str | None = None  # external link for papers/issues
    internal_path: str | None = None  # in-app route for HackMate listings
    available: bool = True
    saved_at: UTCDateTime
