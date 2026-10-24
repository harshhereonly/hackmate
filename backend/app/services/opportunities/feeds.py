"""Import hackathons from organizer-published JSON feeds (HACKATHON_FEED_URLS).

There is no open, official hackathon API, so HackMate does not scrape event
sites. Organizers (or admins) can publish a feed in the format documented in
docs/OPPORTUNITY_SOURCES.md; admins trigger a sync from the admin panel.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from typing import Any

import httpx2
from pydantic import BaseModel, Field, ValidationError, field_validator
from pymongo.database import Database

from app.schemas.enums import OpportunityMode
from app.schemas.profile import normalize_url
from app.services.opportunities.catalog import derive_fields
from app.services.opportunities.http import ProviderError, get_json
from app.utils import clean_text, dedupe_tags, to_naive_utc, utcnow

logger = logging.getLogger("hackmate.feeds")


class FeedEvent(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=3, max_length=140)
    summary: str = Field(default="", max_length=300)
    url: str
    organizer: str = Field(default="", max_length=120)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    deadline: datetime | None = None
    mode: OpportunityMode | None = None
    location: str = Field(default="", max_length=120)
    skills: list[str] = Field(default_factory=list, max_length=30)
    tags: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("url")
    @classmethod
    def _url(cls, value: str) -> str:
        normalized = normalize_url(value, label="Event URL")
        if not normalized:
            raise ValueError("Event URL is required.")
        return normalized

    @field_validator("starts_at", "ends_at", "deadline")
    @classmethod
    def _utc(cls, value: datetime | None) -> datetime | None:
        return to_naive_utc(value)


def _feed_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]


def sync_feed(db: Database, client: httpx2.Client, url: str) -> dict[str, Any]:
    report: dict[str, Any] = {"url": url, "imported": 0, "updated": 0, "skipped": 0, "error": None}
    try:
        data = get_json(client, "feed", url)
    except ProviderError as exc:
        report["error"] = exc.reason
        return report
    if not isinstance(data, dict) or not isinstance(data.get("events"), list):
        report["error"] = "Feed must be a JSON object with an 'events' array."
        return report
    source = data.get("source") if isinstance(data.get("source"), dict) else {}
    source_name = clean_text(str(source.get("name") or "Organizer feed"), collapse=True)[:120]
    try:
        source_url = normalize_url(source.get("url"), label="Source URL") if source.get("url") else url
    except ValueError:
        source_url = url
    now = utcnow()
    for raw in data["events"][:500]:
        try:
            event = FeedEvent.model_validate(raw)
        except ValidationError:
            report["skipped"] += 1
            continue
        doc = derive_fields({
            "type": "hackathon",
            "title": clean_text(event.title, collapse=True),
            "summary": clean_text(event.summary, collapse=True) or clean_text(event.title, collapse=True),
            "description": "",
            "organizer": clean_text(event.organizer, collapse=True) or source_name,
            "url": event.url,
            "skills": dedupe_tags(event.skills, max_items=15),
            "tags": dedupe_tags(event.tags, max_items=10),
            "mode": event.mode,
            "location": clean_text(event.location, collapse=True),
            "starts_at": event.starts_at,
            "ends_at": event.ends_at,
            "deadline": event.deadline,
            "accepts_applications": False,
            "source_kind": "feed",
            "source_name": source_name,
            "source_url": source_url,
            "verified": False,
            "is_demo": False,
            "updated_at": now,
        })
        result = db.opportunities.update_one(
            {"external_key": f"feed:{_feed_id(url)}:{event.id}"},
            {"$set": doc, "$setOnInsert": {"created_at": now, "created_by": None, "is_removed": False,
                                           "removed_reason": None}},
            upsert=True,
        )
        if result.upserted_id is not None:
            report["imported"] += 1
        else:
            report["updated"] += 1
    logger.info("Feed sync %s: %s", url, report)
    return report
