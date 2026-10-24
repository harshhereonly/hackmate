"""Saved items (bookmarks) for HackMate listings and external papers/issues."""

from __future__ import annotations

from typing import Any, Iterable

from bson import ObjectId
from pymongo.database import Database

from app.core.errors import bad_request, not_found
from app.dependencies.auth import CurrentUser
from app.schemas.opportunity import SavedItemCreate
from app.utils import try_object_id, utcnow

INTERNAL_PREFIXES = ("opportunity", "project")


def _resolve_internal(db: Database, prefix: str, raw_id: str) -> dict[str, Any] | None:
    oid = try_object_id(raw_id)
    if not oid:
        return None
    collection = db.opportunities if prefix == "opportunity" else db.projects
    doc = collection.find_one({"_id": oid, "is_removed": {"$ne": True}}, {"title": 1, "summary": 1, "type": 1})
    return doc


def save(db: Database, user: CurrentUser, data: SavedItemCreate) -> dict[str, Any]:
    prefix, _, raw_id = data.item_key.partition(":")
    if prefix in INTERNAL_PREFIXES:
        doc = _resolve_internal(db, prefix, raw_id)
        if not doc:
            raise not_found("That listing no longer exists.")
        snapshot = {
            "title": doc["title"],
            "subtitle": doc.get("summary"),
            "url": None,
            "item_type": doc.get("type", "project") if prefix == "opportunity" else "project",
            "ref_id": doc["_id"],
        }
    else:
        if not data.title or not data.url:
            raise bad_request("Saving an external item needs its title and link.", code="validation_error")
        snapshot = {
            "title": data.title,
            "subtitle": data.subtitle,
            "url": data.url,
            "item_type": data.item_type or ("paper" if prefix in ("openalex", "crossref") else "issue"),
            "ref_id": None,
        }
    now = utcnow()
    db.saved_opportunities.update_one(
        {"user_id": user.id, "item_key": data.item_key},
        {"$set": {**snapshot, "updated_at": now}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return db.saved_opportunities.find_one({"user_id": user.id, "item_key": data.item_key})


def saved_keys(db: Database, user_id: ObjectId | None, keys: Iterable[str]) -> set[str]:
    keys = list(keys)
    if not user_id or not keys:
        return set()
    return set(db.saved_opportunities.distinct("item_key", {"user_id": user_id, "item_key": {"$in": keys}}))


def to_out_many(db: Database, docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Internal items are refreshed from the live listing (renamed, removed or deleted)."""
    opp_ids = [d["ref_id"] for d in docs if d["item_key"].startswith("opportunity:") and d.get("ref_id")]
    project_ids = [d["ref_id"] for d in docs if d["item_key"].startswith("project:") and d.get("ref_id")]
    live_opps = {o["_id"]: o for o in db.opportunities.find(
        {"_id": {"$in": opp_ids}, "is_removed": {"$ne": True}}, {"title": 1, "summary": 1})}
    live_projects = {p["_id"]: p for p in db.projects.find(
        {"_id": {"$in": project_ids}, "is_removed": {"$ne": True}}, {"title": 1, "summary": 1})}
    out = []
    for doc in docs:
        prefix, _, raw_id = doc["item_key"].partition(":")
        title, subtitle, available, internal_path = doc["title"], doc.get("subtitle"), True, None
        if prefix in INTERNAL_PREFIXES:
            live = (live_opps if prefix == "opportunity" else live_projects).get(doc.get("ref_id"))
            available = live is not None
            if live:
                title, subtitle = live["title"], live.get("summary")
            internal_path = f"/{'opportunities' if prefix == 'opportunity' else 'projects'}/{raw_id}"
        out.append({
            "item_key": doc["item_key"],
            "item_type": doc.get("item_type") or prefix,
            "title": title,
            "subtitle": subtitle,
            "url": doc.get("url"),
            "internal_path": internal_path,
            "available": available,
            "saved_at": doc["created_at"],
        })
    return out
