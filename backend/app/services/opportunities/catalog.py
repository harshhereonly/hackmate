"""Opportunities stored in MongoDB: curated (admin), community (members), feed imports and demo data."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId
from pymongo.database import Database

from app.core.errors import not_found
from app.services.profiles import Viewer, summaries_for
from app.services.taxonomy import skill_keys, tag_keys
from app.utils import parse_object_id, utcnow

FAR_FUTURE = datetime(9999, 12, 31)
SOURCE_NAMES = {"curated": "Curated by HackMate admins", "community": "Posted by a HackMate member",
                "demo": "HackMate demo data", "feed": "Organizer feed"}


def derive_fields(doc: dict[str, Any]) -> dict[str, Any]:
    """Recompute search keys and date helpers. Call after every write that changes them."""
    starts, ends, deadline = doc.get("starts_at"), doc.get("ends_at"), doc.get("deadline")
    # A single-day event with only a start date stays "ongoing" for that day.
    doc["effective_end"] = ends or (starts + timedelta(days=1) if starts else None) or deadline
    doc["sort_deadline"] = deadline or starts or ends or FAR_FUTURE
    doc["skills_key"] = skill_keys(doc.get("skills"))
    doc["tags_key"] = tag_keys(doc.get("tags"))
    return doc


def timing_status(doc: dict[str, Any], now: datetime | None = None) -> str:
    now = now or utcnow()
    starts, deadline = doc.get("starts_at"), doc.get("deadline")
    end = doc.get("effective_end")
    if starts:
        if now < starts:
            return "upcoming"
        return "ongoing" if end and now <= end else "past"
    if deadline:
        return "open" if now <= deadline else "closed"
    return "unscheduled"


def timing_query(timing: str, now: datetime) -> dict[str, Any]:
    if timing == "upcoming":
        return {"starts_at": {"$gt": now}}
    if timing == "ongoing":
        return {"starts_at": {"$lte": now}, "effective_end": {"$gte": now}}
    if timing == "past":
        return {"effective_end": {"$lt": now}}
    if timing == "active":
        return {"$or": [{"effective_end": {"$gte": now}}, {"effective_end": None}]}
    return {}


def get_opportunity(db: Database, opportunity_id: str | ObjectId, viewer: Viewer | None = None) -> dict[str, Any]:
    oid = parse_object_id(opportunity_id, what="Opportunity")
    doc = db.opportunities.find_one({"_id": oid})
    if not doc:
        raise not_found("Opportunity not found.")
    if doc.get("is_removed"):
        allowed = viewer is not None and viewer.user is not None and (
            viewer.is_admin or doc.get("created_by") == viewer.user.id
        )
        if not allowed:
            raise not_found("Opportunity not found.")
    return doc


def _teams_forming(db: Database, ids: list[ObjectId]) -> dict[ObjectId, int]:
    if not ids:
        return {}
    rows = db.projects.aggregate([
        {"$match": {"opportunity_id": {"$in": ids}, "status": "recruiting", "is_removed": {"$ne": True}}},
        {"$group": {"_id": "$opportunity_id", "n": {"$sum": 1}}},
    ])
    return {row["_id"]: row["n"] for row in rows}


def viewer_state(db: Database, doc: dict[str, Any], viewer: Viewer, saved: bool) -> dict[str, Any]:
    state: dict[str, Any] = {"saved": saved, "is_owner": False, "application": None,
                             "can_apply": False, "cannot_apply_reason": None}
    accepts = bool(doc.get("accepts_applications")) and doc.get("source_kind") == "community"
    if viewer.user is None:
        state["cannot_apply_reason"] = "Sign in to apply." if accepts else None
        return state
    state["is_owner"] = doc.get("created_by") == viewer.user.id
    application = db.opportunity_applications.find_one(
        {"opportunity_id": doc["_id"], "applicant_id": viewer.user.id}, sort=[("created_at", -1)]
    )
    if application:
        state["application"] = {"id": str(application["_id"]), "status": application["status"]}
    if not accepts:
        return state
    if state["is_owner"]:
        reason = "You posted this opportunity."
    elif application and application["status"] in ("pending", "accepted"):
        reason = "You've already applied." if application["status"] == "pending" else "Your application was accepted."
    elif timing_status(doc) in ("past", "closed"):
        reason = "This opportunity has closed."
    elif doc.get("is_removed"):
        reason = "This listing was removed by moderators."
    else:
        reason = None
    state["can_apply"] = reason is None
    state["cannot_apply_reason"] = reason
    return state


def to_out_many(db: Database, docs: list[dict[str, Any]], viewer: Viewer,
                saved_keys: set[str] | None = None, *, with_viewer: bool = True) -> list[dict[str, Any]]:
    posters = summaries_for(db, viewer, [d["created_by"] for d in docs if d.get("source_kind") == "community"
                                         and d.get("created_by")])
    teams = _teams_forming(db, [d["_id"] for d in docs])
    saved_keys = saved_keys or set()
    now = utcnow()
    out = []
    for doc in docs:
        key = f"opportunity:{doc['_id']}"
        kind = doc.get("source_kind", "curated")
        out.append({
            "id": str(doc["_id"]),
            "key": key,
            "type": doc["type"],
            "title": doc["title"],
            "summary": doc["summary"],
            "description": doc.get("description") or "",
            "organizer": doc.get("organizer") or "",
            # Demo listings never carry a registration link.
            "url": None if doc.get("is_demo") else doc.get("url"),
            "source": {"kind": kind, "name": doc.get("source_name") or SOURCE_NAMES.get(kind, kind),
                       "url": doc.get("source_url")},
            "skills": doc.get("skills") or [],
            "tags": doc.get("tags") or [],
            "mode": doc.get("mode"),
            "location": doc.get("location") or "",
            "starts_at": doc.get("starts_at"),
            "ends_at": doc.get("ends_at"),
            "deadline": doc.get("deadline"),
            "timing": timing_status(doc, now),
            "is_demo": bool(doc.get("is_demo")),
            "verified": bool(doc.get("verified")),
            "accepts_applications": bool(doc.get("accepts_applications")) and kind == "community",
            "posted_by": posters.get(doc["created_by"]) if kind == "community" and doc.get("created_by") else None,
            "teams_forming": teams.get(doc["_id"], 0),
            "is_removed": bool(doc.get("is_removed")),
            "created_at": doc["created_at"],
            "viewer": viewer_state(db, doc, viewer, key in saved_keys) if with_viewer else None,
        })
    return out


def new_document(data: dict[str, Any], *, source_kind: str, created_by: ObjectId | None,
                 verified: bool = False, is_demo: bool = False) -> dict[str, Any]:
    now = utcnow()
    doc = {
        **data,
        "source_kind": source_kind,
        "created_by": created_by,
        "verified": verified,
        "is_demo": is_demo,
        "is_removed": False,
        "removed_reason": None,
        "created_at": now,
        "updated_at": now,
    }
    doc.setdefault("source_name", "")
    doc.setdefault("source_url", None)
    return derive_fields(doc)
